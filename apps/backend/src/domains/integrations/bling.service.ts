import { randomUUID } from 'crypto';
import { BlingConnectionStatus, type BlingConnection } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/secretCrypto';
import {
  findExactSkuProduct,
  logBarcodeSearch,
  logMultiBarcodeAggregateResult,
  logStockSearchAssociation,
  productMatchesGtin,
  summarizeProductForBarcodeLog,
} from './blingBarcode';
import {
  buildGtinSearchPaths,
  buildNameSearchPath,
  buildSkuSearchPath,
  collectGtinFields,
  dedupeProductOptions,
  findExactGtinProduct,
  isNumericGtinInput,
  logGtinSearchDiagnostic,
  summarizeBlingProductCandidate,
  summarizeProductOption,
  type BlingProductOption,
} from './blingProductSearch';
import {
  assertBarcodeResultsOrder,
  computeStockSituation,
  dedupeBarcodesPreserveOrder,
  type BlingMultiStoreStockResponse,
  type BlingStockByBarcodeResult,
  type BlingStockStoreResult,
} from './bling.types';

const MAX_CONNECTIONS = env.BLING_MAX_CONNECTIONS_PER_AGENT;

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; status: BlingConnectionStatus };

const tokenRefreshInflight = new Map<string, Promise<TokenResult>>();
const connectionSearchChains = new Map<string, Promise<unknown>>();

function runSerializedForConnection<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  const tail = connectionSearchChains.get(connectionId) ?? Promise.resolve();
  const run = tail.catch(() => undefined).then(fn);
  connectionSearchChains.set(connectionId, run);
  return run.finally(() => {
    if (connectionSearchChains.get(connectionId) === run) {
      connectionSearchChains.delete(connectionId);
    }
  });
}

export type BlingConnectionDto = {
  id: string;
  agentId: string;
  name: string;
  storeLabel: string;
  clientId: string;
  clientSecretMasked: string;
  status: BlingConnectionStatus;
  scopes: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function toDto(row: BlingConnection): BlingConnectionDto {
  let secretMasked = '****';
  try {
    secretMasked = maskSecret(decryptSecret(row.clientSecretEncrypted)) ?? '****';
  } catch {
    secretMasked = '****';
  }
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    storeLabel: row.storeLabel,
    clientId: row.clientId,
    clientSecretMasked: secretMasked,
    status: row.status,
    scopes: row.scopes,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertAgentOwnership(userId: string, agentId: string): Promise<void> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error('Agente não encontrado');
}

async function assertConnectionOwnership(userId: string, connectionId: string): Promise<BlingConnection> {
  const row = await prisma.blingConnection.findFirst({ where: { id: connectionId, userId } });
  if (!row) throw new Error('Conexão Bling não encontrada');
  return row;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function exchangeBlingToken(input: {
  clientId: string;
  clientSecret: string;
  body: URLSearchParams;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date;
      scope: string | null;
    }
  | { ok: false; reason: string }
> {
  const res = await fetch(env.BLING_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization: basicAuthHeader(input.clientId, input.clientSecret),
    },
    body: input.body.toString(),
    signal: AbortSignal.timeout(env.BLING_STORE_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: { type?: string; message?: string; description?: string };
      }
    | null;

  if (!res.ok || !json?.access_token) {
    const reason =
      json?.error?.description ?? json?.error?.message ?? `Falha OAuth Bling (${res.status})`;
    return { ok: false, reason };
  }

  return {
    ok: true,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    scope: json.scope ?? null,
  };
}

export async function listBlingConnections(userId: string, agentId: string): Promise<BlingConnectionDto[]> {
  await assertAgentOwnership(userId, agentId);
  const rows = await prisma.blingConnection.findMany({
    where: { userId, agentId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toDto);
}

export async function createBlingConnection(input: {
  userId: string;
  agentId: string;
  storeLabel: string;
  clientId: string;
  clientSecret: string;
}): Promise<BlingConnectionDto> {
  await assertAgentOwnership(input.userId, input.agentId);
  const activeCount = await prisma.blingConnection.count({
    where: { userId: input.userId, agentId: input.agentId, isActive: true },
  });
  if (activeCount >= MAX_CONNECTIONS) {
    throw new Error(`Limite de ${MAX_CONNECTIONS} lojas Bling por agente atingido.`);
  }

  const label = input.storeLabel.trim() || `Loja ${activeCount + 1}`;
  const row = await prisma.blingConnection.create({
    data: {
      userId: input.userId,
      agentId: input.agentId,
      name: label,
      storeLabel: label,
      clientId: input.clientId.trim(),
      clientSecretEncrypted: encryptSecret(input.clientSecret.trim()),
      status: BlingConnectionStatus.DISCONNECTED,
      scopes: env.BLING_DEFAULT_SCOPES || null,
    },
  });

  await syncAgentBlingTool(input.userId, input.agentId);
  return toDto(row);
}

async function syncAgentBlingTool(userId: string, agentId: string): Promise<void> {
  const { syncAgentTools } = await import('../agents/agentTools.service');
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
    include: { agentTools: { include: { tool: true } } },
  });
  if (!agent) return;
  const keys = agent.agentTools.map((t) => {
    if (t.tool.type === 'BLING') return 'bling';
    if (t.tool.type === 'GMAIL') return 'gmail';
    if (t.tool.type === 'GOOGLE_CALENDAR') return 'google-agenda';
    if (t.tool.type === 'WEBHOOK') return 'webhook';
    return 'olist';
  });
  if (!keys.includes('bling')) keys.push('bling');
  await syncAgentTools(userId, agentId, keys);

  const tool = await prisma.toolConnection.findUnique({
    where: { userId_type: { userId, type: 'BLING' } },
  });
  if (tool) {
    await prisma.toolConnection.update({
      where: { id: tool.id },
      data: { isEnabled: true, name: 'Bling' },
    });
  }
}

export async function buildBlingConnectUrl(userId: string, connectionId: string): Promise<string> {
  const row = await assertConnectionOwnership(userId, connectionId);
  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.blingConnection.update({
    where: { id: connectionId },
    data: { oauthState: state, oauthStateExpiresAt: expiresAt },
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: row.clientId,
    state,
    redirect_uri: env.BLING_REDIRECT_URI,
  });
  if (env.BLING_DEFAULT_SCOPES.trim()) {
    params.set('scope', env.BLING_DEFAULT_SCOPES.trim());
  }
  return `${env.BLING_AUTHORIZE_URL}?${params.toString()}`;
}

export async function handleBlingOAuthCallback(input: {
  code: string;
  state: string;
}): Promise<
  | { ok: true; agentId: string; connectionId: string }
  | { ok: false; reason: string; agentId?: string }
> {
  const row = await prisma.blingConnection.findFirst({
    where: { oauthState: input.state, isActive: true },
  });
  if (!row) return { ok: false, reason: 'State OAuth inválido.' };
  if (!row.oauthStateExpiresAt || row.oauthStateExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'State OAuth expirado.', agentId: row.agentId };
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(row.clientSecretEncrypted);
  } catch {
    return { ok: false, reason: 'Falha ao descriptografar credenciais.', agentId: row.agentId };
  }

  const exchanged = await exchangeBlingToken({
    clientId: row.clientId,
    clientSecret,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: env.BLING_REDIRECT_URI,
    }),
  });

  if (!exchanged.ok) {
    await prisma.blingConnection.update({
      where: { id: row.id },
      data: {
        status: BlingConnectionStatus.ERROR,
        lastError: exchanged.reason,
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    return { ok: false, reason: exchanged.reason, agentId: row.agentId };
  }

  await prisma.blingConnection.update({
    where: { id: row.id },
    data: {
      accessTokenEncrypted: encryptSecret(exchanged.accessToken),
      refreshTokenEncrypted: exchanged.refreshToken
        ? encryptSecret(exchanged.refreshToken)
        : null,
      tokenExpiresAt: exchanged.expiresAt,
      scopes: exchanged.scope ?? row.scopes,
      status: BlingConnectionStatus.CONNECTED,
      lastError: null,
      lastSyncAt: new Date(),
      oauthState: null,
      oauthStateExpiresAt: null,
    },
  });

  return { ok: true, agentId: row.agentId, connectionId: row.id };
}

export async function getValidAccessToken(connectionId: string): Promise<TokenResult> {
  const row = await prisma.blingConnection.findUnique({ where: { id: connectionId } });
  if (!row || !row.isActive) {
    return { ok: false, reason: 'Conexão não encontrada', status: BlingConnectionStatus.ERROR };
  }

  if (row.accessTokenEncrypted && row.tokenExpiresAt && row.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    try {
      return { ok: true, token: decryptSecret(row.accessTokenEncrypted) };
    } catch {
      return { ok: false, reason: 'Token corrompido', status: BlingConnectionStatus.ERROR };
    }
  }

  const inflight = tokenRefreshInflight.get(connectionId);
  if (inflight) return inflight;

  const refreshPromise = refreshAccessToken(connectionId).finally(() => {
    tokenRefreshInflight.delete(connectionId);
  });
  tokenRefreshInflight.set(connectionId, refreshPromise);
  return refreshPromise;
}

export async function refreshAccessToken(
  connectionId: string,
): Promise<{ ok: true; token: string } | { ok: false; reason: string; status: BlingConnectionStatus }> {
  const row = await prisma.blingConnection.findUnique({ where: { id: connectionId } });
  if (!row) return { ok: false, reason: 'Conexão não encontrada', status: BlingConnectionStatus.ERROR };
  if (!row.refreshTokenEncrypted) {
    await prisma.blingConnection.update({
      where: { id: connectionId },
      data: { status: BlingConnectionStatus.TOKEN_EXPIRED, lastError: 'Refresh token ausente' },
    });
    return { ok: false, reason: 'Reconecte a loja Bling', status: BlingConnectionStatus.TOKEN_EXPIRED };
  }

  let clientSecret: string;
  let refreshToken: string;
  try {
    clientSecret = decryptSecret(row.clientSecretEncrypted);
    refreshToken = decryptSecret(row.refreshTokenEncrypted);
  } catch {
    return { ok: false, reason: 'Credenciais corrompidas', status: BlingConnectionStatus.ERROR };
  }

  const exchanged = await exchangeBlingToken({
    clientId: row.clientId,
    clientSecret,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!exchanged.ok) {
    await prisma.blingConnection.update({
      where: { id: connectionId },
      data: {
        status: BlingConnectionStatus.TOKEN_EXPIRED,
        lastError: exchanged.reason,
      },
    });
    return { ok: false, reason: exchanged.reason, status: BlingConnectionStatus.TOKEN_EXPIRED };
  }

  await prisma.blingConnection.update({
    where: { id: connectionId },
    data: {
      accessTokenEncrypted: encryptSecret(exchanged.accessToken),
      refreshTokenEncrypted: exchanged.refreshToken
        ? encryptSecret(exchanged.refreshToken)
        : row.refreshTokenEncrypted,
      tokenExpiresAt: exchanged.expiresAt,
      status: BlingConnectionStatus.CONNECTED,
      lastError: null,
    },
  });

  return { ok: true, token: exchanged.accessToken };
}

type BlingProduct = {
  id?: number;
  nome?: string;
  codigo?: string;
  gtin?: string;
  gtinEmbalagem?: string;
  codigoBarras?: string | Record<string, unknown>;
  ean?: string;
  barcode?: string;
  estoque?: { saldoVirtualTotal?: number; minimo?: number; saldoFisicoTotal?: number };
};

export type BlingProductQueryMode = 'gtin' | 'sku';

async function fetchBlingProductById(token: string, productId: number): Promise<BlingProduct | null> {
  const res = await blingFetch<{ data?: BlingProduct }>(token, `/produtos/${productId}`);
  if (!res.ok) return null;
  return res.data.data ?? null;
}

async function searchGtinOnPath(
  token: string,
  gtin: string,
  path: string,
  phase: 'primary' | 'fallback',
): Promise<BlingProduct | null> {
  const res = await blingFetch<{ data?: BlingProduct[] }>(token, path);
  const items = res.ok ? (res.data.data ?? []) : [];
  const endpoint = path.split('?')[0] ?? path;
  const firstCandidate = items[0] ? summarizeBlingProductCandidate(items[0]) : null;

  const direct = findExactGtinProduct(items, gtin);
  logGtinSearchDiagnostic({
    query: gtin,
    mode: 'GTIN',
    endpoint,
    phase,
    candidateCount: items.length,
    firstCandidate,
    matched: Boolean(direct),
    matchSource: direct ? `${phase}:${endpoint}` : undefined,
    apiOk: res.ok,
    apiStatus: res.ok ? 200 : res.status,
  });

  if (direct) return direct;

  for (const item of items.slice(0, 10)) {
    if (!item.id) continue;
    const detail = await fetchBlingProductById(token, item.id);
    if (!detail) continue;
    if (productMatchesGtin(detail, gtin)) {
      logGtinSearchDiagnostic({
        query: gtin,
        mode: 'GTIN',
        endpoint: `/produtos/${item.id}`,
        phase: 'hydrate',
        candidateCount: 1,
        firstCandidate: summarizeBlingProductCandidate(detail),
        matched: true,
        matchSource: `hydrate:${endpoint}`,
        apiOk: true,
      });
      return detail;
    }
  }

  return null;
}

async function findProductByGtinEan(token: string, gtin: string): Promise<BlingProduct | null> {
  for (const path of buildGtinSearchPaths(gtin)) {
    const match = await searchGtinOnPath(token, gtin, path, 'primary');
    if (match) return match;
  }

  logGtinSearchDiagnostic({
    query: gtin,
    mode: 'GTIN',
    endpoint: '/produtos',
    phase: 'primary',
    candidateCount: 0,
    firstCandidate: null,
    matched: false,
    apiOk: true,
  });
  logBarcodeSearch({
    searchedBarcode: gtin,
    queryPath: '/produtos',
    queryType: 'gtin',
    candidateCount: 0,
    firstCandidate: null,
    matched: false,
  });
  return null;
}

async function findProductBySku(token: string, sku: string): Promise<BlingProduct | null> {
  const path = buildSkuSearchPath(sku);
  const res = await blingFetch<{ data?: BlingProduct[] }>(token, path);
  if (!res.ok) {
    logBarcodeSearch({
      searchedBarcode: sku,
      queryPath: '/produtos',
      queryType: 'sku',
      candidateCount: 0,
      firstCandidate: null,
      matched: false,
    });
    return null;
  }

  const items = res.data.data ?? [];
  const match = findExactSkuProduct(items, sku);
  logBarcodeSearch({
    searchedBarcode: sku,
    queryPath: '/produtos',
    queryType: 'sku',
    candidateCount: items.length,
    firstCandidate: items[0] ? summarizeProductForBarcodeLog(items[0]) : null,
    matched: Boolean(match),
  });
  return match;
}

async function findProductsByName(token: string, name: string): Promise<BlingProduct[]> {
  const path = buildNameSearchPath(name);
  const res = await blingFetch<{ data?: BlingProduct[] }>(token, path);
  if (!res.ok) {
    logBarcodeSearch({
      searchedBarcode: name,
      queryPath: '/produtos',
      queryType: 'name',
      candidateCount: 0,
      firstCandidate: null,
      matched: false,
    });
    return [];
  }

  const items = res.data.data ?? [];
  logBarcodeSearch({
    searchedBarcode: name,
    queryPath: '/produtos',
    queryType: 'name',
    candidateCount: items.length,
    firstCandidate: items[0] ? summarizeProductForBarcodeLog(items[0]) : null,
    matched: items.length > 0,
  });
  return items;
}

async function findProductByQuery(
  token: string,
  query: string,
  mode: BlingProductQueryMode,
): Promise<BlingProduct | null> {
  if (isNumericGtinInput(query)) {
    return findProductByGtinEan(token, query);
  }
  if (mode === 'sku') return findProductBySku(token, query);
  return findProductByGtinEan(token, query);
}

function resolveDisplayGtin(product: BlingProduct, searched: string, mode: BlingProductQueryMode): string {
  const gtinFields = collectGtinFields(product);
  if (gtinFields.length > 0) return gtinFields[0]!;
  return mode === 'gtin' ? searched : searched;
}

async function blingFetch<T>(
  token: string,
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; status: number }> {
  const res = await fetch(`${env.BLING_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(env.BLING_STORE_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok) {
    const reason =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Erro Bling (${res.status})`;
    return { ok: false, reason, status: res.status };
  }
  return { ok: true, data: json as T };
}

async function fetchStockForProduct(token: string, productId: number): Promise<{
  currentStock: number;
  minimumStock: number;
}> {
  const res = await blingFetch<{ data?: Array<{ saldoFisicoTotal?: number; saldoVirtualTotal?: number }> }>(
    token,
    `/estoques/saldos?idsProdutos[]=${productId}`,
  );
  if (res.ok && res.data.data?.[0]) {
    const row = res.data.data[0];
    return {
      currentStock: Number(row.saldoFisicoTotal ?? row.saldoVirtualTotal ?? 0),
      minimumStock: 0,
    };
  }
  return { currentStock: 0, minimumStock: 0 };
}

export async function searchStockByProductQuery(
  connectionId: string,
  query: string,
  mode: BlingProductQueryMode = 'gtin',
): Promise<BlingStockStoreResult> {
  return runSerializedForConnection(connectionId, () =>
    searchStockByProductQueryImpl(connectionId, query, mode),
  );
}

export async function searchStockByBarcode(
  connectionId: string,
  barcode: string,
): Promise<BlingStockStoreResult> {
  return searchStockByProductQuery(connectionId, barcode, 'gtin');
}

async function searchStockByProductQueryImpl(
  connectionId: string,
  query: string,
  mode: BlingProductQueryMode,
): Promise<BlingStockStoreResult> {
  const row = await prisma.blingConnection.findUnique({ where: { id: connectionId } });
  if (!row) {
    return {
      connectionId,
      storeLabel: '—',
      found: false,
      productName: null,
      internalCode: null,
      barcode: query,
      currentStock: null,
      minimumStock: null,
      situation: 'ERRO_CONSULTA',
      error: 'Conexão não encontrada',
    };
  }

  const tokenResult = await getValidAccessToken(connectionId);
  if (!tokenResult.ok) {
    return {
      connectionId,
      storeLabel: row.storeLabel,
      found: false,
      productName: null,
      internalCode: null,
      barcode: query,
      currentStock: null,
      minimumStock: null,
      situation: 'ERRO_CONSULTA',
      error: tokenResult.reason,
    };
  }

  try {
    logGtinSearchDiagnostic({
      query,
      mode: mode === 'sku' ? 'SKU' : 'GTIN',
      endpoint: 'searchStockByProductQuery',
      phase: 'primary',
      candidateCount: 0,
      firstCandidate: null,
      matched: false,
      matchSource: 'request-start',
    });

    const product = await findProductByQuery(tokenResult.token, query, mode);
    if (!product?.id) {
      logGtinSearchDiagnostic({
        query,
        mode: mode === 'sku' ? 'SKU' : 'GTIN',
        endpoint: 'searchStockByProductQuery',
        phase: 'primary',
        candidateCount: 0,
        firstCandidate: null,
        matched: false,
        matchSource: 'final-not-found',
      });
      return {
        connectionId,
        storeLabel: row.storeLabel,
        found: false,
        productName: null,
        internalCode: null,
        barcode: query,
        currentStock: null,
        minimumStock: null,
        situation: 'NAO_ENCONTRADO',
        error: null,
      };
    }

    let currentStock = Number(
      product.estoque?.saldoFisicoTotal ?? product.estoque?.saldoVirtualTotal ?? 0,
    );
    let minimumStock = Number(product.estoque?.minimo ?? 0);

    if (currentStock === 0 && product.id) {
      const stock = await fetchStockForProduct(tokenResult.token, product.id);
      currentStock = stock.currentStock;
      if (!minimumStock) minimumStock = stock.minimumStock;
    }

    const situation = computeStockSituation(true, currentStock, minimumStock, false);
    await prisma.blingConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date(), status: BlingConnectionStatus.CONNECTED, lastError: null },
    });

    const displayGtin = resolveDisplayGtin(product, query, mode);

    logGtinSearchDiagnostic({
      query,
      mode: mode === 'sku' ? 'SKU' : 'GTIN',
      endpoint: 'searchStockByProductQuery',
      phase: 'primary',
      candidateCount: 1,
      firstCandidate: summarizeBlingProductCandidate(product),
      matched: true,
      matchSource: 'final-found',
      apiOk: true,
    });

    return {
      connectionId,
      storeLabel: row.storeLabel,
      found: true,
      productName: product.nome ?? null,
      internalCode: product.codigo ?? String(product.id),
      barcode: displayGtin,
      currentStock,
      minimumStock,
      situation,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    await prisma.blingConnection.update({
      where: { id: connectionId },
      data: { status: BlingConnectionStatus.ERROR, lastError: message },
    });
    return {
      connectionId,
      storeLabel: row.storeLabel,
      found: false,
      productName: null,
      internalCode: null,
      barcode: query,
      currentStock: null,
      minimumStock: null,
      situation: 'ERRO_CONSULTA',
      error: message,
    };
  }
}

export async function collectStockResultsForBarcodes(input: {
  barcodes: string[];
  connections: Array<{ id: string }>;
  searchStock: (connectionId: string, barcode: string) => Promise<BlingStockStoreResult>;
}): Promise<{ uniqueBarcodes: string[]; results: BlingStockByBarcodeResult[] }> {
  const uniqueBarcodes = dedupeBarcodesPreserveOrder(input.barcodes);
  const results: BlingStockByBarcodeResult[] = [];

  for (let index = 0; index < uniqueBarcodes.length; index++) {
    const barcode = uniqueBarcodes[index]!;
    const storeResults: BlingStockStoreResult[] = [];

    for (const connection of input.connections) {
      const storeResult = await input.searchStock(connection.id, barcode);
      logStockSearchAssociation({
        index,
        searchedBarcode: barcode,
        returnedBarcode: storeResult.barcode,
        connectionId: connection.id,
        found: storeResult.found,
      });
      storeResults.push(storeResult);
    }

    const totalCurrentStock = storeResults.reduce(
      (sum, s) => sum + (s.found && s.currentStock !== null ? s.currentStock : 0),
      0,
    );
    const barcodeResult = { barcode, stores: storeResults, totalCurrentStock };
    logMultiBarcodeAggregateResult({
      index,
      searchedBarcode: barcode,
      resultBarcode: barcodeResult.barcode,
      foundAny: storeResults.some((s) => s.found),
    });
    results.push(barcodeResult);
  }

  assertBarcodeResultsOrder({ requestedBarcodes: uniqueBarcodes, results });
  return { uniqueBarcodes, results };
}

export async function aggregateStockForAgent(input: {
  userId: string;
  agentId: string;
  barcodes: string[];
  queryMode?: BlingProductQueryMode;
}): Promise<BlingMultiStoreStockResponse> {
  await assertAgentOwnership(input.userId, input.agentId);
  const connections = await prisma.blingConnection.findMany({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const storeMeta = connections.map((c) => ({
    connectionId: c.id,
    storeLabel: c.storeLabel,
    status: c.status,
  }));

  const queryMode = input.queryMode ?? 'gtin';
  const { uniqueBarcodes, results } = await collectStockResultsForBarcodes({
    barcodes: input.barcodes,
    connections,
    searchStock: (connectionId, token) => searchStockByProductQuery(connectionId, token, queryMode),
  });

  return {
    agentId: input.agentId,
    barcodes: uniqueBarcodes,
    stores: storeMeta,
    results,
  };
}

export async function findProductOptionsByNameForAgent(input: {
  userId: string;
  agentId: string;
  nameQuery: string;
}): Promise<BlingProductOption[]> {
  await assertAgentOwnership(input.userId, input.agentId);
  const connections = await prisma.blingConnection.findMany({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const options: BlingProductOption[] = [];

  for (const connection of connections) {
    const tokenResult = await getValidAccessToken(connection.id);
    if (!tokenResult.ok) continue;

    const products = await findProductsByName(tokenResult.token, input.nameQuery);
    for (const product of products) {
      const option = summarizeProductOption(product);
      if (option) options.push(option);
    }
  }

  return dedupeProductOptions(options);
}

export async function testBlingConnection(userId: string, connectionId: string): Promise<{ ok: boolean; message: string }> {
  await assertConnectionOwnership(userId, connectionId);
  const tokenResult = await getValidAccessToken(connectionId);
  if (!tokenResult.ok) return { ok: false, message: tokenResult.reason };
  const res = await blingFetch<{ data?: unknown[] }>(tokenResult.token, '/produtos?pagina=1&limite=1');
  if (!res.ok) return { ok: false, message: res.reason };
  await prisma.blingConnection.update({
    where: { id: connectionId },
    data: { lastSyncAt: new Date(), status: BlingConnectionStatus.CONNECTED, lastError: null },
  });
  return { ok: true, message: 'Conexão Bling OK' };
}

export async function disconnectBlingConnection(userId: string, connectionId: string): Promise<void> {
  await assertConnectionOwnership(userId, connectionId);
  await prisma.blingConnection.update({
    where: { id: connectionId },
    data: {
      isActive: false,
      status: BlingConnectionStatus.DISCONNECTED,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      oauthState: null,
      oauthStateExpiresAt: null,
    },
  });
}

export async function agentHasBlingTool(agentId: string): Promise<boolean> {
  const links = await prisma.agentTool.findMany({
    where: { agentId },
    include: { tool: true },
  });
  return links.some((l) => l.tool.type === 'BLING');
}
