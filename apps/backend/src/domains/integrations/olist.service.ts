import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';

const KEY_PREFIX = 'OLIST_';
const SETTING_STATE = `${KEY_PREFIX}OAUTH_STATE`;
const SETTING_TOKEN = `${KEY_PREFIX}TOKEN`;
const SETTING_RATE = `${KEY_PREFIX}RATE_LIMIT`;
/** Token Bearer manual (painel ou alternativa ao OAuth). */
const SETTING_API_TOKEN = `${KEY_PREFIX}MANUAL_API_TOKEN`;
/** Credenciais do aplicativo OAuth (alternativa ao .env). */
const SETTING_OAUTH_CLIENT_ID = `${KEY_PREFIX}OAUTH_CLIENT_ID`;
const SETTING_OAUTH_CLIENT_SECRET = `${KEY_PREFIX}OAUTH_CLIENT_SECRET`;
const SETTING_OAUTH_REDIRECT_URI = `${KEY_PREFIX}OAUTH_REDIRECT_URI`;
const SETTING_ENDPOINT_HINT_PREFIX = `${KEY_PREFIX}ENDPOINT_HINT_`;
const SETTING_WRITE_IDEMPOTENCY_PREFIX = `${KEY_PREFIX}WRITE_IDEMPOTENCY_`;
const SETTING_CARD_CFG_PREFIX = `${KEY_PREFIX}CARD_CFG_`;
const WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

function maskSecret(secret: string): string {
  const s = secret.trim();
  if (s.length <= 4) return '••••';
  return `••••••••${s.slice(-4)}`;
}

type OlistTokenData = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: string;
  updatedAt: string;
};

type OlistRateData = {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
  method: string;
  path: string;
  updatedAt: string;
};

type OlistOAuthTokenDebug = {
  issuer: string | null;
  audience: string | null;
  scopes: string[];
  subject: string | null;
};

export type OlistCategory = {
  id: number;
  descricao: string;
  categoriaPai: { id: number; descricao: string } | null;
  filhas: Array<{ id: number; descricao: string; filhas: OlistCategory['filhas'] }>;
};

type OlistCategoryListItem = {
  id: number;
  descricao: string;
  categoriaPai: { id: number; descricao: string } | null;
};

export type OlistFinanceItem = {
  id: string;
  titulo: string;
  pessoa: string | null;
  valor: number | null;
  situacao: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  dataPagamentoRecebimento: string | null;
  raw: Record<string, unknown>;
};

type OlistApiErrorBody = {
  mensagem?: string;
  detalhes?: Array<{ campo?: string; mensagem?: string }>;
};

export type OlistCatalogItem = {
  id: string;
  nome: string;
  documento: string | null;
  situacao: string | null;
  raw: Record<string, unknown>;
};

export type OlistWriteActionInput = {
  id?: string | number;
  contatoId?: string | number;
  nome?: string;
  descricao?: string;
  valor?: number;
  dataVencimento?: string;
  situacao?: string;
  observacao?: string;
};

export type OlistCardConfig = {
  cardName: string;
  closingDay: number;
  dueDay: number;
  updatedAt: string;
};

type TinyV2CategoryNode = {
  id?: number | string;
  descricao?: string;
  nodes?: TinyV2CategoryNode[];
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function debugFromOAuthToken(token: OlistTokenData | null): OlistOAuthTokenDebug | null {
  if (!token?.accessToken) return null;
  const payload = parseJwtPayload(token.accessToken);
  if (!payload) return null;
  const scopeRaw = payload.scope;
  const scopes =
    typeof scopeRaw === 'string'
      ? scopeRaw
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];
  const audience =
    typeof payload.aud === 'string'
      ? payload.aud
      : Array.isArray(payload.aud)
        ? payload.aud.filter((x): x is string => typeof x === 'string').join(', ')
        : null;
  return {
    issuer: typeof payload.iss === 'string' ? payload.iss : null,
    audience,
    scopes,
    subject: typeof payload.sub === 'string' ? payload.sub : null,
  };
}

async function getSetting(userId: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key } },
    select: { value: true },
  });
  return row?.value ?? null;
}

async function setSetting(userId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  });
}

async function deleteSetting(userId: string, key: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { userId, key },
  });
}

/** Resolve Client ID, Secret e redirect: valores salvos no painel substituem o .env por campo. */
async function resolveOauthApp(userId: string): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null> {
  const clientId =
    (await getSetting(userId, SETTING_OAUTH_CLIENT_ID))?.trim() || env.OLIST_CLIENT_ID?.trim() || '';
  const clientSecret =
    (await getSetting(userId, SETTING_OAUTH_CLIENT_SECRET))?.trim() || env.OLIST_CLIENT_SECRET?.trim() || '';
  const redirectUri =
    (await getSetting(userId, SETTING_OAUTH_REDIRECT_URI))?.trim() || env.OLIST_REDIRECT_URI?.trim() || '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

async function getManualApiToken(userId: string): Promise<string | null> {
  const fromUser = await getSetting(userId, SETTING_API_TOKEN);
  if (fromUser && fromUser.trim().length > 0) return fromUser.trim();
  const fromEnv = env.OLIST_API_TOKEN?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function endpointHintKey(operation: string): string {
  return `${SETTING_ENDPOINT_HINT_PREFIX}${operation.toUpperCase()}`;
}

async function getPreferredPath(userId: string, operation: string): Promise<string | null> {
  const saved = await getSetting(userId, endpointHintKey(operation));
  const path = saved?.trim() ?? '';
  return path.startsWith('/') ? path : null;
}

async function savePreferredPath(userId: string, operation: string, path: string): Promise<void> {
  if (!path.startsWith('/')) return;
  await setSetting(userId, endpointHintKey(operation), path);
}

function cardConfigKey(cardName: string): string {
  return `${SETTING_CARD_CFG_PREFIX}${cardName.trim().toUpperCase()}`;
}

export async function saveOlistCardConfig(input: {
  userId: string;
  cardName: string;
  closingDay: number;
  dueDay: number;
}): Promise<{ ok: true; config: OlistCardConfig } | { ok: false; reason: string }> {
  const cardName = input.cardName.trim();
  if (cardName.length < 2) return { ok: false, reason: 'Nome do cartão inválido.' };
  if (!Number.isInteger(input.closingDay) || input.closingDay < 1 || input.closingDay > 31) {
    return { ok: false, reason: 'Dia de fechamento inválido (1-31).' };
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    return { ok: false, reason: 'Dia de vencimento inválido (1-31).' };
  }
  const config: OlistCardConfig = {
    cardName,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    updatedAt: new Date().toISOString(),
  };
  await setSetting(input.userId, cardConfigKey(cardName), JSON.stringify(config));
  return { ok: true, config };
}

export async function getOlistCardConfig(input: {
  userId: string;
  cardName: string;
}): Promise<{ ok: true; config: OlistCardConfig } | { ok: false; reason: string }> {
  const cardName = input.cardName.trim();
  if (cardName.length < 2) return { ok: false, reason: 'Nome do cartão inválido.' };
  const raw = await getSetting(input.userId, cardConfigKey(cardName));
  const parsed = parseJson<OlistCardConfig>(raw);
  if (!parsed) return { ok: false, reason: `Cartão "${cardName}" sem configuração de fechamento/vencimento.` };
  return { ok: true, config: parsed };
}

function orderedCandidatePaths(paths: string[], preferred: string | null): string[] {
  const unique = [...new Set(paths)];
  if (!preferred) return unique;
  if (!unique.includes(preferred)) return unique;
  return [preferred, ...unique.filter((p) => p !== preferred)];
}

type WriteIdempotencyEntry = {
  fingerprint: string;
  resultText: string;
  expiresAt: number;
};

function idempotencyKey(operation: string): string {
  return `${SETTING_WRITE_IDEMPOTENCY_PREFIX}${operation.toUpperCase()}`;
}

function payloadFingerprint(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function parseWriteIdempotency(raw: string | null): WriteIdempotencyEntry | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<WriteIdempotencyEntry>;
    if (
      typeof data.fingerprint !== 'string' ||
      typeof data.resultText !== 'string' ||
      typeof data.expiresAt !== 'number' ||
      !Number.isFinite(data.expiresAt)
    ) {
      return null;
    }
    return { fingerprint: data.fingerprint, resultText: data.resultText, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

async function tryReadIdempotentWrite(
  userId: string,
  operation: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const row = parseWriteIdempotency(await getSetting(userId, idempotencyKey(operation)));
  if (!row || row.expiresAt < Date.now()) {
    return null;
  }
  return row.fingerprint === payloadFingerprint(payload) ? row.resultText : null;
}

async function saveIdempotentWrite(
  userId: string,
  operation: string,
  payload: Record<string, unknown>,
  resultText: string,
): Promise<void> {
  const value: WriteIdempotencyEntry = {
    fingerprint: payloadFingerprint(payload),
    resultText,
    expiresAt: Date.now() + WRITE_IDEMPOTENCY_TTL_MS,
  };
  await setSetting(userId, idempotencyKey(operation), JSON.stringify(value));
}

export async function getOlistStatus(userId: string): Promise<{
  configured: boolean;
  connected: boolean;
  authMethod: 'api_token' | 'oauth' | null;
  apiTokenMasked: string | null;
  apiTokenSource: 'user' | 'env' | null;
  oauthClientIdMasked: string | null;
  oauthRedirectUri: string | null;
  oauthAppUserSaved: boolean;
  expiresAt: string | null;
  tokenType: string | null;
  scope: string | null;
  oauthTokenDebug: OlistOAuthTokenDebug | null;
  rateLimit: OlistRateData | null;
}> {
  const userApiRaw = await getSetting(userId, SETTING_API_TOKEN);
  const envApiRaw = env.OLIST_API_TOKEN?.trim() ?? '';
  const oauthToken = parseJson<OlistTokenData>(await getSetting(userId, SETTING_TOKEN));
  const rate = parseJson<OlistRateData>(await getSetting(userId, SETTING_RATE));

  const hasUserApi = Boolean(userApiRaw?.trim());
  const hasEnvApi = envApiRaw.length > 0;
  const hasOAuth = Boolean(oauthToken?.accessToken);

  const oauthAppModel = await resolveOauthApp(userId);
  const oauthApp = oauthAppModel !== null;
  const oauthAppUserSaved = Boolean((await getSetting(userId, SETTING_OAUTH_CLIENT_ID))?.trim());

  let authMethod: 'api_token' | 'oauth' | null = null;
  if (hasOAuth) authMethod = 'oauth';
  else if (hasUserApi || hasEnvApi) authMethod = 'api_token';

  let apiTokenMasked: string | null = null;
  let apiTokenSource: 'user' | 'env' | null = null;
  if (hasUserApi) {
    apiTokenMasked = maskSecret(userApiRaw!.trim());
    apiTokenSource = 'user';
  } else if (hasEnvApi) {
    apiTokenMasked = maskSecret(envApiRaw);
    apiTokenSource = 'env';
  }

  const configured = oauthApp || hasUserApi || hasEnvApi;

  const connected = hasUserApi || hasEnvApi || hasOAuth;
  const oauthTokenDebug = debugFromOAuthToken(oauthToken);

  return {
    configured,
    connected,
    authMethod,
    apiTokenMasked,
    apiTokenSource,
    oauthClientIdMasked: oauthAppModel ? maskSecret(oauthAppModel.clientId) : null,
    oauthRedirectUri: oauthAppModel?.redirectUri ?? null,
    oauthAppUserSaved,
    expiresAt: oauthToken?.expiresAt ?? null,
    tokenType: oauthToken?.tokenType ?? null,
    scope: oauthToken?.scope ?? null,
    oauthTokenDebug,
    rateLimit: rate,
  };
}

export async function saveOlistOAuthApp(
  userId: string,
  input: { clientId: string; clientSecret: string; redirectUri: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const redirectUri = input.redirectUri.trim();
  if (clientId.length < 2) return { ok: false, reason: 'Client ID inválido.' };
  if (clientId.includes('@')) {
    return {
      ok: false,
      reason: 'Client ID não é um e-mail. No console Olist copie o identificador do aplicativo (texto alfanumérico), não o login da conta.',
    };
  }
  if (clientSecret.length < 4) return { ok: false, reason: 'Client Secret muito curto.' };
  try {
    const parsedRedirectUri = new URL(redirectUri);
    const isLocalRedirect = ['localhost', '127.0.0.1', '::1'].includes(parsedRedirectUri.hostname);
    if ((isLocalRedirect || parsedRedirectUri.port) && parsedRedirectUri.port !== '3000') {
      return {
        ok: false,
        reason: 'A URL de redirecionamento da Olist deve usar a porta 3000 (ex.: http://localhost:3000/settings).',
      };
    }
  } catch {
    return { ok: false, reason: 'URL de redirecionamento inválida (ex.: http://localhost:3000/settings).' };
  }
  await setSetting(userId, SETTING_OAUTH_CLIENT_ID, clientId);
  await setSetting(userId, SETTING_OAUTH_CLIENT_SECRET, clientSecret);
  await setSetting(userId, SETTING_OAUTH_REDIRECT_URI, redirectUri);
  return { ok: true };
}

export async function clearOlistOAuthApp(userId: string): Promise<void> {
  await Promise.all([
    deleteSetting(userId, SETTING_OAUTH_CLIENT_ID),
    deleteSetting(userId, SETTING_OAUTH_CLIENT_SECRET),
    deleteSetting(userId, SETTING_OAUTH_REDIRECT_URI),
  ]);
}

export async function saveOlistApiToken(userId: string, token: string): Promise<{ ok: false; reason: string } | { ok: true }> {
  const t = token.trim();
  if (t.length < 8) {
    return { ok: false, reason: 'Token muito curto.' };
  }
  await setSetting(userId, SETTING_API_TOKEN, t);
  return { ok: true };
}

export async function clearOlistApiToken(userId: string): Promise<void> {
  await deleteSetting(userId, SETTING_API_TOKEN);
}

export async function createOlistAuthUrl(userId: string): Promise<{ ok: true; authUrl: string } | { ok: false; reason: string }> {
  const app = await resolveOauthApp(userId);
  if (!app) {
    return {
      ok: false,
      reason:
        'Configure Client ID, Secret e URL de redirecionamento no painel abaixo ou no .env (OLIST_CLIENT_ID / OLIST_CLIENT_SECRET / OLIST_REDIRECT_URI).',
    };
  }
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await setSetting(userId, SETTING_STATE, JSON.stringify({ state, expiresAt }));
  const params = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    scope: 'openid',
    response_type: 'code',
    state,
  });
  return {
    ok: true,
    authUrl: `${env.OLIST_ACCOUNTS_BASE_URL}/auth?${params.toString()}`,
  };
}

async function exchangeToken(payload: URLSearchParams): Promise<{
  ok: true;
  token: OlistTokenData;
} | { ok: false; reason: string }> {
  const res = await fetch(`${env.OLIST_ACCOUNTS_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
  const json = (await res.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        token_type?: string;
        scope?: string;
        expires_in?: number;
        error_description?: string;
        error?: string;
      }
    | null;
  if (!res.ok || !json?.access_token) {
    return { ok: false, reason: json?.error_description ?? json?.error ?? `Falha no token OAuth (${res.status})` };
  }
  const token: OlistTokenData = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    tokenType: json.token_type ?? 'Bearer',
    scope: json.scope ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 14_400) * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, token };
}

export async function exchangeOlistCode(params: {
  userId: string;
  code: string;
  state: string;
}): Promise<{ ok: true; token: OlistTokenData } | { ok: false; reason: string }> {
  const { userId, code, state } = params;
  const app = await resolveOauthApp(userId);
  if (!app) {
    return { ok: false, reason: 'Credenciais Olist não configuradas.' };
  }
  const stateSaved = parseJson<{ state: string; expiresAt: string }>(await getSetting(userId, SETTING_STATE));
  if (!stateSaved || stateSaved.state !== state || new Date(stateSaved.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'State OAuth inválido ou expirado.' };
  }
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: app.redirectUri,
    code,
  });
  const exchanged = await exchangeToken(payload);
  if (!exchanged.ok) return exchanged;
  await setSetting(userId, SETTING_TOKEN, JSON.stringify(exchanged.token));
  return exchanged;
}

/**
 * Token somente do OAuth armazenado (com refresh se necessário).
 * Usado quando o token de API manual existe mas a API Olist responde 401 — tentamos OAuth em seguida.
 */
async function ensureOAuthAccessTokenFromStored(
  userId: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const token = parseJson<OlistTokenData>(await getSetting(userId, SETTING_TOKEN));
  if (!token?.accessToken) {
    return { ok: false, reason: 'Integração Olist não conectada. Informe token de API ou conclua OAuth.' };
  }
  const expiresMs = new Date(token.expiresAt).getTime();
  if (expiresMs > Date.now() + 60_000) return { ok: true, accessToken: token.accessToken };
  if (!token.refreshToken) return { ok: false, reason: 'Refresh token ausente. Reconecte a integração Olist.' };
  const app = await resolveOauthApp(userId);
  if (!app) {
    return { ok: false, reason: 'Credenciais do aplicativo OAuth ausentes. Configure no painel ou .env.' };
  }
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: token.refreshToken,
  });
  const refreshed = await exchangeToken(payload);
  if (!refreshed.ok) return refreshed;
  await setSetting(userId, SETTING_TOKEN, JSON.stringify(refreshed.token));
  return { ok: true, accessToken: refreshed.token.accessToken };
}

async function ensureValidAccessToken(userId: string): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const oauth = await ensureOAuthAccessTokenFromStored(userId);
  if (oauth.ok) return oauth;
  const manual = await getManualApiToken(userId);
  if (manual) return { ok: true, accessToken: manual };
  return oauth;
}

function isLikelyJwtToken(token: string): boolean {
  const t = token.trim();
  return t.split('.').length === 3;
}

function mapTinyV2TreeToList(nodes: TinyV2CategoryNode[], parent: OlistCategoryListItem['categoriaPai']): OlistCategoryListItem[] {
  const out: OlistCategoryListItem[] = [];
  for (const n of nodes) {
    const id = Number(n.id ?? 0);
    const descricao = String(n.descricao ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || descricao.length === 0) continue;
    const row: OlistCategoryListItem = { id, descricao, categoriaPai: parent };
    out.push(row);
    const children = Array.isArray(n.nodes) ? n.nodes : [];
    if (children.length > 0) {
      out.push(...mapTinyV2TreeToList(children, { id, descricao }));
    }
  }
  return out;
}

async function listCategoriesViaTinyV2(
  manualToken: string,
): Promise<{ ok: true; categories: OlistCategoryListItem[] } | { ok: false; reason: string }> {
  const body = new URLSearchParams({
    token: manualToken,
    formato: 'json',
  });
  const endpoint = `${env.OLIST_API_V2_BASE_URL.replace(/\/$/, '')}/produtos.categorias.arvore.php`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => null)) as
    | {
        retorno?:
          | {
              status?: string;
              erros?: Array<{ erro?: string }>;
              categorias?: TinyV2CategoryNode[];
            }
          | [];
      }
    | null;
  if (!res.ok) {
    return { ok: false, reason: `Falha Tiny API v2 (HTTP ${res.status}).` };
  }

  // Alguns tenants retornam {"retorno":[]} quando não há categorias (sem campo status).
  if (Array.isArray(json?.retorno)) {
    return { ok: true, categories: [] };
  }

  const retornoObj = json?.retorno as
    | {
          status?: string;
          erros?: Array<{ erro?: string }>;
          categorias?: TinyV2CategoryNode[];
      }
    | undefined;

  const status = (retornoObj?.status ?? '').toUpperCase();
  if (status !== 'OK') {
    const msg = retornoObj?.erros?.map((e) => e.erro).filter(Boolean).join(' | ');
    return { ok: false, reason: msg || 'Tiny API v2 recusou a consulta de categorias.' };
  }
  const tree = retornoObj?.categorias ?? [];
  return { ok: true, categories: mapTinyV2TreeToList(tree, null) };
}

/** Mensagem extra quando a Olist devolve 401 (token Bearer inválido ou sem permissão). */
async function olist401Hint(userId: string): Promise<string> {
  const fromUser = (await getSetting(userId, SETTING_API_TOKEN))?.trim();
  const fromEnv = env.OLIST_API_TOKEN?.trim() ?? '';
  if (fromUser || fromEnv) {
    return ' O token de API foi recusado: gere um novo na Olist, atualize aqui, ou remova o token salvo e use "Conectar Olist (OAuth)".';
  }
  return ' Reconecte em "Conectar Olist (OAuth)" ou confira permissões do aplicativo (ex.: leitura em Produtos).';
}

async function reasonForOlistHttpError(
  userId: string,
  res: Response,
  err: OlistApiErrorBody | null,
): Promise<string> {
  const detalheMsg =
    err?.detalhes
      ?.map((d) => {
        const campo = d.campo?.trim();
        const mensagem = d.mensagem?.trim();
        if (!mensagem) return '';
        return campo ? `${campo}: ${mensagem}` : mensagem;
      })
      .filter((x) => x.length > 0)
      .join(' | ') ?? '';
  const baseRoot = err?.mensagem?.trim() || `Falha Olist (HTTP ${res.status})`;
  const base = detalheMsg ? `${baseRoot} (${detalheMsg})` : baseRoot;
  if (res.status === 401) {
    return `${base}.${await olist401Hint(userId)}`;
  }
  if (res.status === 403) {
    const fromUser = (await getSetting(userId, SETTING_API_TOKEN))?.trim();
    const fromEnv = env.OLIST_API_TOKEN?.trim() ?? '';
    return `${base}. Acesso negado (403): no console Olist, edite o aplicativo e marque permissões no módulo Categorias (principalmente leitura em Categorias).${
      fromUser || fromEnv
        ? ' O token de API colado no painel pode ter menos permissões que o app OAuth: remova "token salvo" e teste com "Conectar Olist" se o OAuth já estiver conectado.'
        : ' Confirme "Conectar Olist (OAuth)" e as permissões do app.'
    }`;
  }
  return base;
}

/**
 * GET na API pública: se o token de API devolver 401/403, tenta o mesmo URL com o Bearer OAuth
 * (escopos do token de aplicativo costumam ser diferentes do token colado à mão).
 */
async function olistGetWithTokenFallback(
  userId: string,
  fullUrl: string,
  firstAccessToken: string,
  manualToken: string | null,
): Promise<Response> {
  let res = await fetch(fullUrl, {
    headers: {
      Authorization: `Bearer ${firstAccessToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    // Se o primeiro token não era o manual e existe manual salvo, tenta manual.
    if (manualToken && manualToken !== firstAccessToken) {
      res = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${manualToken}`,
          Accept: 'application/json',
        },
      });
      if (res.ok) return res;
    }
    // Fallback OAuth (renovado), útil quando primeiro token veio do Bearer manual.
    const oauth = await ensureOAuthAccessTokenFromStored(userId);
    if (oauth.ok && oauth.accessToken !== firstAccessToken) {
      res = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          Accept: 'application/json',
        },
      });
    }
  }
  return res;
}

async function olistGetJsonWithFallback(
  userId: string,
  path: string,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status?: number; reason: string }
> {
  const first = await ensureValidAccessToken(userId);
  if (!first.ok) return first;
  const fullUrl = `${env.OLIST_API_BASE_URL}${path}`;
  const manualToken = await getManualApiToken(userId);
  const res = await olistGetWithTokenFallback(userId, fullUrl, first.accessToken, manualToken);
  await storeRateLimit(userId, 'GET', path, res.headers);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as OlistApiErrorBody | null;
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset') ?? '?';
      return { ok: false, status: 429, reason: `Limite de requisição Olist atingido. Aguarde ~${reset}s.` };
    }
    return { ok: false, status: res.status, reason: await reasonForOlistHttpError(userId, res, err) };
  }
  const data = (await res.json().catch(() => null)) as unknown;
  return { ok: true, data };
}

const OLIST_HTTP_TIMEOUT_MS = 20_000;

async function olistFetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLIST_HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function olistRequestWithTokenFallback(
  input: {
    userId: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    payload?: unknown;
  },
): Promise<{ ok: true; data: unknown } | { ok: false; reason: string; status?: number }> {
  const first = await ensureValidAccessToken(input.userId);
  if (!first.ok) return first;
  const manualToken = await getManualApiToken(input.userId);
  const bodyJson = input.payload !== undefined ? JSON.stringify(input.payload) : undefined;
  const fullUrl = `${env.OLIST_API_BASE_URL}${input.path}`;
  const makeReq = async (token: string): Promise<Response> =>
    olistFetchWithTimeout(fullUrl, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(input.method === 'GET' || input.method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(bodyJson ? { body: bodyJson } : {}),
    });
  let res: Response;
  try {
    res = await makeReq(first.accessToken);
  } catch (error) {
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? 'Tempo limite excedido ao consultar Olist.'
        : error instanceof Error
          ? `Falha de rede ao consultar Olist: ${error.message}`
          : 'Falha de rede ao consultar Olist.';
    return { ok: false, reason: msg };
  }
  if ((res.status === 401 || res.status === 403) && manualToken && manualToken !== first.accessToken) {
    try {
      res = await makeReq(manualToken);
    } catch {
      // Mantém a resposta anterior para diagnóstico.
    }
  }
  if ((res.status === 401 || res.status === 403) && first.accessToken !== manualToken) {
    const oauth = await ensureOAuthAccessTokenFromStored(input.userId);
    if (oauth.ok && oauth.accessToken !== first.accessToken) {
      try {
        res = await makeReq(oauth.accessToken);
      } catch {
        // Mantém a resposta anterior para diagnóstico.
      }
    }
  }

  await storeRateLimit(input.userId, input.method, input.path, res.headers);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as OlistApiErrorBody | null;
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset') ?? '?';
      return { ok: false, status: 429, reason: `Limite de requisição Olist atingido. Aguarde ~${reset}s.` };
    }
    return { ok: false, status: res.status, reason: await reasonForOlistHttpError(input.userId, res, err) };
  }

  const data = (await res.json().catch(() => null)) as unknown;
  return { ok: true, data };
}

function normalizeFinanceListPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
  }
  if (payload && typeof payload === 'object') {
    const asObj = payload as Record<string, unknown>;
    if (Array.isArray(asObj.itens)) return normalizeFinanceListPayload(asObj.itens);
    if (Array.isArray(asObj.items)) return normalizeFinanceListPayload(asObj.items);
    if (Array.isArray(asObj.dados)) return normalizeFinanceListPayload(asObj.dados);
    if (asObj.data !== undefined) return normalizeFinanceListPayload(asObj.data);
    if (asObj.retorno && typeof asObj.retorno === 'object') return normalizeFinanceListPayload(asObj.retorno);
    if (Array.isArray(asObj.registros)) return normalizeFinanceListPayload(asObj.registros);
  }
  return [];
}

function toFinanceItem(row: Record<string, unknown>): OlistFinanceItem {
  const idRaw = row.id ?? row.idConta ?? row.idOrcamento ?? row.idTitulo ?? row.numero ?? '';
  const tituloRaw =
    row.descricao ?? row.historico ?? row.observacoes ?? row.titulo ?? row.numeroDocumento ?? row.numero ?? 'Sem título';
  const pessoaRaw =
    row.contato && typeof row.contato === 'object'
      ? (row.contato as Record<string, unknown>).nome
      : row.cliente && typeof row.cliente === 'object'
        ? (row.cliente as Record<string, unknown>).nome
        : row.fornecedor && typeof row.fornecedor === 'object'
          ? (row.fornecedor as Record<string, unknown>).nome
          : row.nomeContato ?? row.nomeCliente ?? null;
  const valorRaw = row.valor ?? row.valorOriginal ?? row.valorLiquido ?? row.total ?? row.valorTotal ?? null;
  const datePayRecv = row.dataPagamento ?? row.dataRecebimento ?? row.dataLiquidacao ?? null;

  return {
    id: String(idRaw || ''),
    titulo: String(tituloRaw || 'Sem título'),
    pessoa: pessoaRaw != null ? String(pessoaRaw) : null,
    valor: typeof valorRaw === 'number' ? valorRaw : valorRaw != null ? Number(valorRaw) : null,
    situacao: row.situacao != null ? String(row.situacao) : null,
    dataEmissao: row.dataEmissao != null ? String(row.dataEmissao) : null,
    dataVencimento: row.dataVencimento != null ? String(row.dataVencimento) : null,
    dataPagamentoRecebimento: datePayRecv != null ? String(datePayRecv) : null,
    raw: row,
  };
}

async function listFinanceByCandidatePaths(input: {
  userId: string;
  operation: string;
  paths: string[];
  search?: string;
  limit?: number;
  page?: number;
}): Promise<
  | { ok: true; items: OlistFinanceItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  const safeLimit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const safePage = Math.max(input.page ?? 1, 1);
  let firstError: { reason: string; status?: number } | null = null;

  const preferred = await getPreferredPath(input.userId, input.operation);
  const paths = orderedCandidatePaths(input.paths, preferred);
  for (const p of paths) {
    const result = await olistGetJsonWithFallback(input.userId, p);
    if (!result.ok) {
      if (!firstError) firstError = { reason: result.reason, status: result.status };
      continue;
    }
    await savePreferredPath(input.userId, input.operation, p);
    let items = normalizeFinanceListPayload(result.data).map(toFinanceItem);
    if (input.search && input.search.trim().length > 0) {
      const q = input.search.trim().toLowerCase();
      items = items.filter((x) => `${x.titulo} ${x.pessoa ?? ''}`.toLowerCase().includes(q));
    }
    const total = items.length;
    const start = (safePage - 1) * safeLimit;
    return { ok: true, items: items.slice(start, start + safeLimit), total, sourcePath: p };
  }

  return { ok: false, reason: firstError?.reason ?? 'Nenhum endpoint de finanças disponível.', status: firstError?.status };
}

export async function listOlistAccountsPayable(input: {
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  | { ok: true; items: OlistFinanceItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  return listFinanceByCandidatePaths({
    userId: input.userId,
    operation: 'LIST_PAYABLE',
    search: input.search,
    page: input.page,
    limit: input.limit,
    paths: ['/contas-pagar', '/contas-a-pagar', '/financeiro/contas-a-pagar'],
  });
}

export async function listOlistAccountsReceivable(input: {
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  | { ok: true; items: OlistFinanceItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  return listFinanceByCandidatePaths({
    userId: input.userId,
    operation: 'LIST_RECEIVABLE',
    search: input.search,
    page: input.page,
    limit: input.limit,
    paths: ['/contas-receber', '/contas-a-receber', '/financeiro/contas-a-receber'],
  });
}

export async function listOlistQuotes(input: {
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  | { ok: true; items: OlistFinanceItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  return listFinanceByCandidatePaths({
    userId: input.userId,
    operation: 'LIST_QUOTES',
    search: input.search,
    page: input.page,
    limit: input.limit,
    paths: ['/orcamentos', '/vendas/orcamentos'],
  });
}

function normalizeCatalogListPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
  }
  if (payload && typeof payload === 'object') {
    const asObj = payload as Record<string, unknown>;
    if (Array.isArray(asObj.itens)) return normalizeCatalogListPayload(asObj.itens);
    if (Array.isArray(asObj.items)) return normalizeCatalogListPayload(asObj.items);
    if (Array.isArray(asObj.dados)) return normalizeCatalogListPayload(asObj.dados);
    if (Array.isArray(asObj.registros)) return normalizeCatalogListPayload(asObj.registros);
    if (Array.isArray(asObj.clientes)) return normalizeCatalogListPayload(asObj.clientes);
    if (Array.isArray(asObj.contatos)) return normalizeCatalogListPayload(asObj.contatos);
    if (Array.isArray(asObj.produtos)) return normalizeCatalogListPayload(asObj.produtos);
    if (asObj.data !== undefined) return normalizeCatalogListPayload(asObj.data);
    if (asObj.retorno !== undefined) return normalizeCatalogListPayload(asObj.retorno);
    if (asObj.resultado !== undefined) return normalizeCatalogListPayload(asObj.resultado);
  }
  return [];
}

function toCatalogItem(row: Record<string, unknown>): OlistCatalogItem {
  const idRaw = row.id ?? row.idCliente ?? row.idContato ?? row.idProduto ?? row.codigo ?? row.sku ?? '';
  const nomeRaw = row.nome ?? row.razaoSocial ?? row.descricao ?? row.descricaoComplementar ?? row.titulo ?? 'Sem nome';
  const documentoRaw = row.cpfCnpj ?? row.cnpj ?? row.cpf ?? row.documento ?? null;
  const situacaoRaw = row.situacao ?? row.status ?? row.ativo ?? null;
  return {
    id: String(idRaw || ''),
    nome: String(nomeRaw || 'Sem nome'),
    documento: documentoRaw != null ? String(documentoRaw) : null,
    situacao: situacaoRaw != null ? String(situacaoRaw) : null,
    raw: row,
  };
}

async function listCatalogByCandidatePaths(input: {
  userId: string;
  operation: string;
  paths: string[];
  search?: string;
  limit?: number;
  page?: number;
}): Promise<
  | { ok: true; items: OlistCatalogItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  const safeLimit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const safePage = Math.max(input.page ?? 1, 1);
  let firstError: { reason: string; status?: number } | null = null;
  const preferred = await getPreferredPath(input.userId, input.operation);
  const paths = orderedCandidatePaths(input.paths, preferred);
  for (const p of paths) {
    const result = await olistGetJsonWithFallback(input.userId, p);
    if (!result.ok) {
      if (!firstError) firstError = { reason: result.reason, status: result.status };
      continue;
    }
    await savePreferredPath(input.userId, input.operation, p);
    let items = normalizeCatalogListPayload(result.data).map(toCatalogItem);
    if (input.search && input.search.trim().length > 0) {
      const q = input.search.trim().toLowerCase();
      items = items.filter((x) => `${x.nome} ${x.documento ?? ''}`.toLowerCase().includes(q));
    }
    const total = items.length;
    const start = (safePage - 1) * safeLimit;
    return { ok: true, items: items.slice(start, start + safeLimit), total, sourcePath: p };
  }
  return { ok: false, reason: firstError?.reason ?? 'Nenhum endpoint de catálogo disponível.', status: firstError?.status };
}

export async function listOlistCustomers(input: {
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  | { ok: true; items: OlistCatalogItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  return listCatalogByCandidatePaths({
    userId: input.userId,
    operation: 'LIST_CUSTOMERS',
    search: input.search,
    page: input.page,
    limit: input.limit,
    paths: ['/contatos', '/clientes', '/cadastros/clientes'],
  });
}

export async function findOlistContactIdByName(input: {
  userId: string;
  nome: string;
}): Promise<{ ok: true; id: number } | { ok: false; reason: string }> {
  const nome = input.nome.trim();
  if (nome.length < 2) return { ok: false, reason: 'Nome de contato muito curto.' };
  const found = await listOlistCustomers({
    userId: input.userId,
    search: nome,
    page: 1,
    limit: 20,
  });
  if (!found.ok) return found;
  if (found.items.length === 0) return { ok: false, reason: 'Contato não encontrado.' };
  const exact = found.items.find((x) => x.nome.trim().toLowerCase() === nome.toLowerCase()) ?? found.items[0];
  const id = Number(exact?.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: 'Contato encontrado sem id válido.' };
  }
  return { ok: true, id };
}

export async function listOlistProducts(input: {
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  | { ok: true; items: OlistCatalogItem[]; total: number; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  return listCatalogByCandidatePaths({
    userId: input.userId,
    operation: 'LIST_PRODUCTS',
    search: input.search,
    page: input.page,
    limit: input.limit,
    paths: ['/produtos', '/catalogo/produtos'],
  });
}

export async function createOlistContact(input: {
  userId: string;
  nome: string;
}): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  const nome = input.nome.trim();
  if (nome.length < 2) {
    return { ok: false, reason: 'Nome do fornecedor/contato muito curto.' };
  }
  const payload = {
    nome,
    tipoPessoa: 'J',
  };
  const result = await writeByCandidatePaths({
    userId: input.userId,
    operation: 'WRITE_CREATE_CONTACT',
    method: 'POST',
    payload,
    paths: ['/contatos', '/clientes', '/cadastros/clientes'],
  });
  return result;
}

function extractContactHintFromDescription(text: string | undefined): string | null {
  if (!text) return null;
  const src = text.trim();
  if (!src) return null;
  const m =
    src.match(/(?:fornecedor|cliente|contato)\s+([a-z0-9\u00c0-\u017f\s.'-]{2,80})/i) ??
    src.match(/(?:posto|empresa)\s+([a-z0-9\u00c0-\u017f\s.'-]{2,80})/i);
  const hint = m?.[1]?.trim() ?? null;
  return hint && hint.length >= 2 ? hint : null;
}

async function resolveContactIdForWrite(
  userId: string,
  preferred?: string | number,
  descriptionForHint?: string,
): Promise<number | null> {
  if (preferred != null) {
    const n = Number(preferred);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const hint = extractContactHintFromDescription(descriptionForHint);
  if (!hint) return null;
  const contacts = await listOlistCustomers({ userId, limit: 5, page: 1, search: hint });
  if (!contacts.ok || contacts.items.length === 0) return null;
  const exact = contacts.items.find((x) => x.nome.toLowerCase() === hint.toLowerCase());
  const picked = exact ?? contacts.items[0];
  const id = Number(picked?.id ?? 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function writeByCandidatePaths(input: {
  userId: string;
  operation: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  paths: string[];
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; data: unknown; sourcePath: string }
  | { ok: false; reason: string; status?: number }
> {
  let firstError: { reason: string; status?: number } | null = null;
  const attempts: Array<{ path: string; status?: number; reason: string }> = [];
  const preferred = await getPreferredPath(input.userId, input.operation);
  const paths = orderedCandidatePaths(input.paths, preferred);
  for (const path of paths) {
    const result = await olistRequestWithTokenFallback({
      userId: input.userId,
      method: input.method,
      path,
      payload: input.payload,
    });
    if (!result.ok) {
      if (!firstError) firstError = { reason: result.reason, status: result.status };
      attempts.push({ path, status: result.status, reason: result.reason });
      console.log(
        `[olist] write fail op=${input.operation} method=${input.method} path=${path} status=${String(
          result.status ?? 'n/a',
        )} reason=${result.reason}`,
      );
      continue;
    }
    await savePreferredPath(input.userId, input.operation, path);
    console.log(`[olist] write success op=${input.operation} method=${input.method} path=${path}`);
    return { ok: true, data: result.data, sourcePath: path };
  }
  if (attempts.length > 0) {
    const compact = attempts
      .map((a) => `${a.path} [${String(a.status ?? 'n/a')}]`)
      .join(' | ');
    return {
      ok: false,
      reason: `${firstError?.reason ?? 'Nenhum endpoint de escrita disponível.'} Endpoints testados: ${compact}`,
      status: firstError?.status,
    };
  }
  return { ok: false, reason: firstError?.reason ?? 'Nenhum endpoint de escrita disponível.', status: firstError?.status };
}

export async function createOlistAccountPayable(
  userId: string,
  input: OlistWriteActionInput,
): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  if (!input.descricao || !Number.isFinite(input.valor ?? Number.NaN)) {
    return { ok: false, reason: 'Para criar conta a pagar, informe descricao e valor numérico.' };
  }
  if (!input.dataVencimento) {
    return { ok: false, reason: 'Para criar conta a pagar, informe dataVencimento (YYYY-MM-DD).' };
  }
  const contatoId = await resolveContactIdForWrite(userId, input.contatoId, input.descricao);
  if (contatoId == null) {
    return {
      ok: false,
      reason:
        'Não encontrei o contato/fornecedor para lançar a conta a pagar. Informe no texto "fornecedor <nome cadastrado>" ou envie contatoId.',
    };
  }
  const payload = {
    dataVencimento: input.dataVencimento,
    valor: input.valor,
    historico: input.descricao,
    ...(contatoId != null ? { contato: { id: contatoId } } : {}),
    ...(input.observacao ? { numeroDocumento: input.observacao } : {}),
  };
  const cached = await tryReadIdempotentWrite(userId, 'CREATE_PAYABLE', payload);
  if (cached) return { ok: true, sourcePath: 'idempotent-cache', data: { message: cached } };
  const result = await writeByCandidatePaths({
    userId,
    operation: 'WRITE_CREATE_PAYABLE',
    method: 'POST',
    payload,
    paths: ['/contas-pagar', '/contas-a-pagar', '/financeiro/contas-a-pagar', '/financeiro/contas-pagar'],
  });
  if (result.ok) {
    await saveIdempotentWrite(
      userId,
      'CREATE_PAYABLE',
      payload,
      `Conta a pagar criada com sucesso (endpoint: ${result.sourcePath}).`,
    );
  }
  return result;
}

export async function createOlistAccountReceivable(
  userId: string,
  input: OlistWriteActionInput,
): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  if (!input.descricao || !Number.isFinite(input.valor ?? Number.NaN)) {
    return { ok: false, reason: 'Para criar conta a receber, informe descricao e valor numérico.' };
  }
  if (!input.dataVencimento) {
    return { ok: false, reason: 'Para criar conta a receber, informe dataVencimento (YYYY-MM-DD).' };
  }
  const contatoId = await resolveContactIdForWrite(userId, input.contatoId, input.descricao);
  if (contatoId == null) {
    return {
      ok: false,
      reason:
        'Não encontrei o contato/cliente para lançar a conta a receber. Informe no texto "cliente <nome cadastrado>" ou envie contatoId.',
    };
  }
  const payload = {
    dataVencimento: input.dataVencimento,
    valor: input.valor,
    historico: input.descricao,
    ...(contatoId != null ? { contato: { id: contatoId } } : {}),
    ...(input.observacao ? { numeroDocumento: input.observacao } : {}),
  };
  const cached = await tryReadIdempotentWrite(userId, 'CREATE_RECEIVABLE', payload);
  if (cached) return { ok: true, sourcePath: 'idempotent-cache', data: { message: cached } };
  const result = await writeByCandidatePaths({
    userId,
    operation: 'WRITE_CREATE_RECEIVABLE',
    method: 'POST',
    payload,
    paths: ['/contas-receber', '/contas-a-receber', '/financeiro/contas-a-receber', '/financeiro/contas-receber'],
  });
  if (result.ok) {
    await saveIdempotentWrite(
      userId,
      'CREATE_RECEIVABLE',
      payload,
      `Conta a receber criada com sucesso (endpoint: ${result.sourcePath}).`,
    );
  }
  return result;
}

export async function updateOlistAccountPayableStatus(
  userId: string,
  input: OlistWriteActionInput,
): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  void userId;
  void input;
  return {
    ok: false,
    reason:
      'Atualização de status para conta a pagar não está mapeada nesta integração pelos endpoints oficiais carregados. Use criação/listagem e configure endpoint de baixa específico se necessário.',
  };
}

export async function updateOlistAccountReceivableStatus(
  userId: string,
  input: OlistWriteActionInput,
): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  if (!input.id) return { ok: false, reason: 'Informe id para baixar conta a receber.' };
  const payload = {
    ...(Number.isFinite(input.valor ?? Number.NaN) ? { valorPago: input.valor } : {}),
    ...(input.observacao ? { historico: input.observacao } : {}),
  };
  const cached = await tryReadIdempotentWrite(userId, `UPDATE_RECEIVABLE_${String(input.id)}`, payload);
  if (cached) return { ok: true, sourcePath: 'idempotent-cache', data: { message: cached } };
  const result = await writeByCandidatePaths({
    userId,
    operation: 'WRITE_UPDATE_RECEIVABLE',
    method: 'POST',
    payload,
    paths: [`/contas-receber/${input.id}/baixar`],
  });
  if (result.ok) {
    await saveIdempotentWrite(
      userId,
      `UPDATE_RECEIVABLE_${String(input.id)}`,
      payload,
      `Conta a receber ${String(input.id)} atualizada para ${String(input.situacao)} (endpoint: ${result.sourcePath}).`,
    );
  }
  return result;
}

export async function deleteOlistAccountPayable(input: {
  userId: string;
  id: string | number;
}): Promise<{ ok: true; sourcePath: string; data: unknown } | { ok: false; reason: string; status?: number }> {
  const id = String(input.id ?? '').trim();
  if (!id) return { ok: false, reason: 'Informe id da conta a pagar para excluir.' };
  const path = `/contas-pagar/${id}/marcadores`;
  const result = await olistRequestWithTokenFallback({
    userId: input.userId,
    method: 'POST',
    path,
    payload: [{ descricao: 'EXCLUIDA_POR_AGENTE' }],
  });
  if (!result.ok) {
    return {
      ok: false,
      reason:
        `${result.reason}. Não foi possível aplicar exclusão lógica por marcador na conta ${id}.`,
      status: result.status,
    };
  }
  return {
    ok: true,
    sourcePath: `POST ${path}`,
    data: result.data,
  };
}

async function storeRateLimit(
  userId: string,
  method: string,
  path: string,
  headers: Headers,
): Promise<void> {
  const rate: OlistRateData = {
    limit: headers.get('x-ratelimit-limit') ? Number(headers.get('x-ratelimit-limit')) : null,
    remaining: headers.get('x-ratelimit-remaining') ? Number(headers.get('x-ratelimit-remaining')) : null,
    resetSeconds: headers.get('x-ratelimit-reset') ? Number(headers.get('x-ratelimit-reset')) : null,
    method,
    path,
    updatedAt: new Date().toISOString(),
  };
  await setSetting(userId, SETTING_RATE, JSON.stringify(rate));
}

export async function getOlistCategoryById(userId: string, id: number): Promise<
  | { ok: true; category: OlistCategory }
  | { ok: false; reason: string; status?: number }
> {
  const first = await ensureValidAccessToken(userId);
  if (!first.ok) return first;
  const path = `/categorias/${id}`;
  const fullUrl = `${env.OLIST_API_BASE_URL}${path}`;
  const manualToken = await getManualApiToken(userId);
  const res = await olistGetWithTokenFallback(userId, fullUrl, first.accessToken, manualToken);
  if (!res.ok && res.status === 401 && manualToken && !isLikelyJwtToken(manualToken)) {
    const viaV2 = await listCategoriesViaTinyV2(manualToken);
    if (viaV2.ok) {
      const found = viaV2.categories.find((c) => c.id === id);
      if (found) {
        return { ok: true, category: { id: found.id, descricao: found.descricao, categoriaPai: found.categoriaPai, filhas: [] } };
      }
      return { ok: false, status: 404, reason: 'Categoria não encontrada na Tiny API v2.' };
    }
  }
  await storeRateLimit(userId, 'GET', path, res.headers);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as OlistApiErrorBody | null;
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset') ?? '?';
      return { ok: false, status: 429, reason: `Limite de requisição Olist atingido. Aguarde ~${reset}s.` };
    }
    return { ok: false, status: res.status, reason: await reasonForOlistHttpError(userId, res, err) };
  }
  const json = (await res.json()) as OlistCategory;
  return { ok: true, category: json };
}

function parentFromCategoryFields(x: Record<string, unknown>): OlistCategoryListItem['categoriaPai'] {
  if (x.categoriaPai && typeof x.categoriaPai === 'object') {
    const cp = x.categoriaPai as Record<string, unknown>;
    const pid = Number(cp.id ?? 0);
    const pdesc = String(cp.descricao ?? '');
    if (Number.isInteger(pid) && pid > 0 && pdesc.length > 0) return { id: pid, descricao: pdesc };
  }
  return null;
}

/** Filhos na árvore: API v3 usa `filhas`; APIs antigas podem usar `nodes`. */
function childCategoryRecords(x: Record<string, unknown>): Record<string, unknown>[] {
  const filhas = x.filhas;
  const nodes = x.nodes;
  const pick =
    Array.isArray(filhas) && filhas.length > 0
      ? filhas
      : Array.isArray(nodes) && nodes.length > 0
        ? nodes
        : [];
  const out: Record<string, unknown>[] = [];
  for (const n of pick as unknown[]) {
    if (typeof n === 'object' && n !== null) out.push(n as Record<string, unknown>);
  }
  return out;
}

/** Árvore (filhas/nodes) ou lista plana; compatível com Tiny v3 OAuth e formatos antigos. */
function rowsFromCategoryRecord(
  x: Record<string, unknown>,
  inheritedParent: OlistCategoryListItem['categoriaPai'],
): OlistCategoryListItem[] {
  const id = Number(x.id ?? 0);
  const descricao = String(x.descricao ?? '');
  const children = childCategoryRecords(x);
  const hasChildren = children.length > 0;

  const categoriaPai = hasChildren ? inheritedParent : parentFromCategoryFields(x) ?? inheritedParent;

  const row: OlistCategoryListItem | null =
    Number.isInteger(id) && id > 0 && descricao.length > 0
      ? { id, descricao, categoriaPai }
      : null;

  const out: OlistCategoryListItem[] = row ? [row] : [];

  if (hasChildren && row) {
    const asParent = { id: row.id, descricao: row.descricao };
    for (const n of children) {
      out.push(...rowsFromCategoryRecord(n, asParent));
    }
  }

  return out;
}

/** Corpo de GET /categorias/todas: raízes em array ou objeto único. */
function flattenArvoreCategoriasTodas(raw: unknown): OlistCategoryListItem[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((x) =>
      typeof x === 'object' && x !== null ? rowsFromCategoryRecord(x as Record<string, unknown>, null) : [],
    );
  }
  if (raw && typeof raw === 'object') {
    const asObj = raw as Record<string, unknown>;
    if (Array.isArray(asObj.categorias)) {
      return flattenArvoreCategoriasTodas(asObj.categorias);
    }
    if (asObj.data !== undefined) return flattenArvoreCategoriasTodas(asObj.data);
    return rowsFromCategoryRecord(asObj, null);
  }
  return [];
}

function normalizeCategoryListPayload(payload: unknown): OlistCategoryListItem[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((x) =>
      typeof x === 'object' && x !== null ? rowsFromCategoryRecord(x as Record<string, unknown>, null) : [],
    );
  }

  if (payload && typeof payload === 'object') {
    const asObj = payload as Record<string, unknown>;
    if (asObj.retorno && typeof asObj.retorno === 'object') {
      return normalizeCategoryListPayload(asObj.retorno);
    }
    if (asObj.data !== undefined) return normalizeCategoryListPayload(asObj.data);
    if (Array.isArray(asObj.itens)) return normalizeCategoryListPayload(asObj.itens);
    if (Array.isArray(asObj.items)) return normalizeCategoryListPayload(asObj.items);
    if (Array.isArray(asObj.categorias)) return normalizeCategoryListPayload(asObj.categorias);
    if (asObj.dados) return normalizeCategoryListPayload(asObj.dados);
    if (Array.isArray(asObj.registros)) return normalizeCategoryListPayload(asObj.registros);
    if (asObj.resultado && typeof asObj.resultado === 'object') {
      return normalizeCategoryListPayload(asObj.resultado);
    }
  }

  return [];
}

export async function listOlistCategories(input: {
  userId: string;
  limit?: number;
  page?: number;
  search?: string;
  sort?: 'id' | 'descricao';
  order?: 'asc' | 'desc';
}): Promise<
  | { ok: true; categories: OlistCategoryListItem[]; total: number }
  | { ok: false; reason: string; status?: number }
> {
  const token = await ensureValidAccessToken(input.userId);
  if (!token.ok) return token;

  const safeLimit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const safePage = Math.max(input.page ?? 1, 1);
  const safeSort = input.sort ?? 'id';
  const safeOrder = input.order ?? 'asc';

  /** Documentação Olist v3: listagem da árvore é GET /categorias/todas (GET /categorias com query não existe — responde 405). */
  const path = '/categorias/todas';
  const fullUrl = `${env.OLIST_API_BASE_URL}${path}`;
  const manualToken = await getManualApiToken(input.userId);
  const res = await olistGetWithTokenFallback(input.userId, fullUrl, token.accessToken, manualToken);
  if (!res.ok && res.status === 401 && manualToken && !isLikelyJwtToken(manualToken)) {
    const viaV2 = await listCategoriesViaTinyV2(manualToken);
    if (viaV2.ok) {
      let items = viaV2.categories;
      if (input.search && input.search.trim().length > 0) {
        const q = input.search.trim().toLowerCase();
        items = items.filter((i) => i.descricao.toLowerCase().includes(q));
      }
      items.sort((a, b) => {
        if (safeSort === 'id') return safeOrder === 'asc' ? a.id - b.id : b.id - a.id;
        const c = a.descricao.localeCompare(b.descricao, 'pt-BR');
        return safeOrder === 'asc' ? c : -c;
      });
      const total = items.length;
      const start = (safePage - 1) * safeLimit;
      return { ok: true, categories: items.slice(start, start + safeLimit), total };
    }
  }
  await storeRateLimit(input.userId, 'GET', path, res.headers);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as OlistApiErrorBody | null;
    if (res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset') ?? '?';
      return { ok: false, status: 429, reason: `Limite de requisição Olist atingido. Aguarde ~${reset}s.` };
    }
    return {
      ok: false,
      status: res.status,
      reason: await reasonForOlistHttpError(input.userId, res, err),
    };
  }

  const raw = (await res.json().catch(() => null)) as unknown;
  let items = flattenArvoreCategoriasTodas(raw);
  if (items.length === 0) {
    items = normalizeCategoryListPayload(raw);
  }

  if (input.search && input.search.trim().length > 0) {
    const q = input.search.trim().toLowerCase();
    items = items.filter((i) => i.descricao.toLowerCase().includes(q));
  }

  items.sort((a, b) => {
    if (safeSort === 'id') {
      return safeOrder === 'asc' ? a.id - b.id : b.id - a.id;
    }
    const c = a.descricao.localeCompare(b.descricao, 'pt-BR');
    return safeOrder === 'asc' ? c : -c;
  });

  const total = items.length;
  const start = (safePage - 1) * safeLimit;
  const categories = items.slice(start, start + safeLimit);
  return { ok: true, categories, total };
}

export async function disconnectOlist(userId: string): Promise<void> {
  await Promise.all([
    deleteSetting(userId, SETTING_TOKEN),
    deleteSetting(userId, SETTING_STATE),
    deleteSetting(userId, SETTING_RATE),
    deleteSetting(userId, SETTING_API_TOKEN),
  ]);
}

