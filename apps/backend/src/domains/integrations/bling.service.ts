import { randomUUID } from 'crypto';
import { BlingConnectionStatus, type BlingConnection } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/secretCrypto';
import {
  findExactBarcodeProduct,
  logBarcodeSearch,
  summarizeProductForBarcodeLog,
} from './blingBarcode';
import {
  computeStockSituation,
  type BlingMultiStoreStockResponse,
  type BlingStockStoreResult,
} from './bling.types';

const MAX_CONNECTIONS = env.BLING_MAX_CONNECTIONS_PER_AGENT;

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

export async function getValidAccessToken(
  connectionId: string,
): Promise<{ ok: true; token: string } | { ok: false; reason: string; status: BlingConnectionStatus }> {
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

  return refreshAccessToken(connectionId);
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
  codigoBarras?: string | Record<string, unknown>;
  ean?: string;
  barcode?: string;
  estoque?: { saldoVirtualTotal?: number; minimo?: number; saldoFisicoTotal?: number };
};

async function findProductByBarcode(token: string, barcode: string): Promise<BlingProduct | null> {
  const queries = [
    `/produtos?pagina=1&limite=50&codigoBarras=${encodeURIComponent(barcode)}`,
    `/produtos?pagina=1&limite=50&gtin=${encodeURIComponent(barcode)}`,
    `/produtos?pagina=1&limite=50&codigo=${encodeURIComponent(barcode)}`,
  ];

  for (const path of queries) {
    const res = await blingFetch<{ data?: BlingProduct[] }>(token, path);
    if (!res.ok) continue;

    const items = res.data.data ?? [];
    const match = findExactBarcodeProduct(items, barcode);
    logBarcodeSearch({
      searchedBarcode: barcode,
      queryPath: path.split('?')[0] ?? path,
      candidateCount: items.length,
      firstCandidate: items[0] ? summarizeProductForBarcodeLog(items[0]) : null,
      matched: Boolean(match),
    });
    if (match) return match;
  }

  logBarcodeSearch({
    searchedBarcode: barcode,
    queryPath: '/produtos',
    candidateCount: 0,
    firstCandidate: null,
    matched: false,
  });
  return null;
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

export async function searchStockByBarcode(
  connectionId: string,
  barcode: string,
): Promise<BlingStockStoreResult> {
  const row = await prisma.blingConnection.findUnique({ where: { id: connectionId } });
  if (!row) {
    return {
      connectionId,
      storeLabel: '—',
      found: false,
      productName: null,
      internalCode: null,
      barcode,
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
      barcode,
      currentStock: null,
      minimumStock: null,
      situation: 'ERRO_CONSULTA',
      error: tokenResult.reason,
    };
  }

  try {
    const product = await findProductByBarcode(tokenResult.token, barcode);
    if (!product?.id) {
      return {
        connectionId,
        storeLabel: row.storeLabel,
        found: false,
        productName: null,
        internalCode: null,
        barcode,
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

    return {
      connectionId,
      storeLabel: row.storeLabel,
      found: true,
      productName: product.nome ?? null,
      internalCode: product.codigo ?? String(product.id),
      barcode,
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
      barcode,
      currentStock: null,
      minimumStock: null,
      situation: 'ERRO_CONSULTA',
      error: message,
    };
  }
}

export async function aggregateStockForAgent(input: {
  userId: string;
  agentId: string;
  barcodes: string[];
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

  const uniqueBarcodes = Array.from(new Set(input.barcodes.map((b) => b.trim()).filter(Boolean)));

  const storeMeta = connections.map((c) => ({
    connectionId: c.id,
    storeLabel: c.storeLabel,
    status: c.status,
  }));

  const results = await Promise.all(
    uniqueBarcodes.map(async (barcode) => {
      const storeResults: BlingStockStoreResult[] = [];
      for (const connection of connections) {
        storeResults.push(await searchStockByBarcode(connection.id, barcode));
      }
      const totalCurrentStock = storeResults.reduce(
        (sum, s) => sum + (s.found && s.currentStock !== null ? s.currentStock : 0),
        0,
      );
      return { barcode, stores: storeResults, totalCurrentStock };
    }),
  );

  return {
    agentId: input.agentId,
    barcodes: uniqueBarcodes,
    stores: storeMeta,
    results,
  };
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
