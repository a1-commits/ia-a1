import { IntegrationProvider } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { repairBrokenAccents } from '../../lib/textEncoding';

type DeviceStartResult =
  | {
      ok: true;
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      message: string;
      expiresIn: number;
      interval: number;
    }
  | { ok: false; reason: string };

type PollResult =
  | { ok: true; pending: true; interval?: number }
  | { ok: true; pending: false; driveId: string; driveType: string | null; ownerName: string | null }
  | { ok: false; reason: string };

type OneDriveFilesResult =
  | {
      ok: true;
      files: Array<{
        id: string;
        name: string;
        size: number;
        type: 'file' | 'folder' | 'unknown';
      }>;
    }
  | { ok: false; reason: string };

type GraphDrive = {
  id: string;
  driveType?: string;
  owner?: { user?: { displayName?: string } };
};

type GraphDriveItem = {
  id?: string;
  name?: string;
  size?: number;
  file?: unknown;
  folder?: unknown;
};

type GraphDriveItemDetails = {
  id?: string;
  name?: string;
  size?: number;
  file?: { mimeType?: string };
};

type GraphUploadedItem = {
  id?: string;
  name?: string;
  webUrl?: string;
};

type OneDriveMetadata = {
  accessToken?: string;
  refreshToken?: string | null;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
};

type OneDriveFileContentResult =
  | {
      ok: true;
      file: {
        id: string;
        name: string;
        size: number;
        mimeType: string | null;
        textContent: string | null;
      };
    }
  | { ok: false; reason: string };

type OneDriveUploadTextResult =
  | {
      ok: true;
      item: {
        id: string;
        name: string;
        webUrl: string | null;
      };
    }
  | { ok: false; reason: string };

export type OneDriveContextSnippet = {
  id: string;
  name: string;
  snippet: string;
};

type CachedFileText = {
  textContent: string | null;
  mimeType: string | null;
  size: number;
  cachedAt: number;
};

const DEVICE_CODE_ENDPOINT = (tenant: string): string =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`;
const TOKEN_ENDPOINT = (tenant: string): string =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const FILE_TEXT_CACHE_TTL_MS = 20 * 60 * 1000;
const fileTextCache = new Map<string, CachedFileText>();

export function isOneDriveConfigured(): boolean {
  return Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_ID.trim().length > 0);
}

export async function startOneDriveDeviceFlow(userId: string): Promise<DeviceStartResult> {
  if (!isOneDriveConfigured()) {
    return { ok: false, reason: 'ONEDRIVE_CLIENT_ID ausente no backend' };
  }
  const body = new URLSearchParams({
    client_id: env.ONEDRIVE_CLIENT_ID!.trim(),
    scope: env.ONEDRIVE_SCOPE,
  });
  const response = await fetch(DEVICE_CODE_ENDPOINT(env.ONEDRIVE_TENANT_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await response.json().catch(() => null)) as
    | {
        device_code?: string;
        user_code?: string;
        verification_uri?: string;
        message?: string;
        expires_in?: number;
        interval?: number;
        error_description?: string;
      }
    | null;
  if (!response.ok || !json?.device_code || !json.user_code || !json.verification_uri) {
    return {
      ok: false,
      reason: json?.error_description ?? 'Falha ao iniciar autorização do OneDrive',
    };
  }

  await prisma.integrationLink.upsert({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    create: {
      userId,
      provider: IntegrationProvider.ONEDRIVE,
      status: 'pending_auth',
      metadata: { lastDeviceCodeAt: new Date().toISOString() },
    },
    update: {
      status: 'pending_auth',
      metadata: { lastDeviceCodeAt: new Date().toISOString() },
    },
  });

  return {
    ok: true,
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    message: json.message ?? 'Autorize o acesso e depois volte para concluir.',
    expiresIn: json.expires_in ?? 900,
    interval: json.interval ?? 5,
  };
}

async function fetchUserDrive(accessToken: string): Promise<GraphDrive> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Falha ao consultar drive do usuário no Microsoft Graph');
  }
  const json = (await response.json()) as GraphDrive;
  if (!json.id) {
    throw new Error('Resposta inválida do Microsoft Graph (drive sem id)');
  }
  return json;
}

export async function pollOneDriveDeviceFlow(userId: string, deviceCode: string): Promise<PollResult> {
  if (!isOneDriveConfigured()) {
    return { ok: false, reason: 'ONEDRIVE_CLIENT_ID ausente no backend' };
  }
  if (!deviceCode.trim()) {
    return { ok: false, reason: 'deviceCode é obrigatório' };
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: env.ONEDRIVE_CLIENT_ID!.trim(),
    device_code: deviceCode.trim(),
  });
  const response = await fetch(TOKEN_ENDPOINT(env.ONEDRIVE_TENANT_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
        error?: string;
        error_description?: string;
        interval?: number;
      }
    | null;

  if (!response.ok) {
    if (json?.error === 'authorization_pending') {
      return { ok: true, pending: true, interval: json.interval };
    }
    if (json?.error === 'slow_down') {
      return { ok: true, pending: true, interval: Math.max(8, json.interval ?? 8) };
    }
    await prisma.integrationLink.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
      create: { userId, provider: IntegrationProvider.ONEDRIVE, status: 'disconnected' },
      update: { status: 'disconnected' },
    });
    return {
      ok: false,
      reason: json?.error_description ?? json?.error ?? 'Falha ao obter token do OneDrive',
    };
  }

  if (!json?.access_token) {
    return { ok: false, reason: 'Token de acesso ausente na resposta do OneDrive' };
  }

  const drive = await fetchUserDrive(json.access_token);
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await prisma.integrationLink.upsert({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    create: {
      userId,
      provider: IntegrationProvider.ONEDRIVE,
      status: 'connected',
      externalId: drive.id,
      metadata: {
        tokenType: json.token_type ?? 'Bearer',
        scope: json.scope ?? env.ONEDRIVE_SCOPE,
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt,
        driveType: drive.driveType ?? null,
        ownerName: drive.owner?.user?.displayName ?? null,
      },
    },
    update: {
      status: 'connected',
      externalId: drive.id,
      metadata: {
        tokenType: json.token_type ?? 'Bearer',
        scope: json.scope ?? env.ONEDRIVE_SCOPE,
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt,
        driveType: drive.driveType ?? null,
        ownerName: drive.owner?.user?.displayName ?? null,
      },
    },
  });

  return {
    ok: true,
    pending: false,
    driveId: drive.id,
    driveType: drive.driveType ?? null,
    ownerName: drive.owner?.user?.displayName ?? null,
  };
}

export async function disconnectOneDrive(userId: string): Promise<void> {
  await prisma.integrationLink.upsert({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    create: { userId, provider: IntegrationProvider.ONEDRIVE, status: 'disconnected', metadata: {} },
    update: { status: 'disconnected', externalId: null, metadata: {} },
  });
}

function readAccessTokenFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const typed = metadata as OneDriveMetadata;
  return typeof typed.accessToken === 'string' && typed.accessToken.trim().length > 0
    ? typed.accessToken
    : null;
}

function readRefreshTokenFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const typed = metadata as OneDriveMetadata;
  return typeof typed.refreshToken === 'string' && typed.refreshToken.trim().length > 0
    ? typed.refreshToken
    : null;
}

async function refreshAccessTokenWithRefreshToken(input: {
  userId: string;
  refreshToken: string;
}): Promise<string | null> {
  if (!isOneDriveConfigured()) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.ONEDRIVE_CLIENT_ID!.trim(),
    refresh_token: input.refreshToken,
    scope: env.ONEDRIVE_SCOPE,
  });
  const response = await fetch(TOKEN_ENDPOINT(env.ONEDRIVE_TENANT_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      }
    | null;
  if (!json?.access_token) return null;

  const link = await prisma.integrationLink.findUnique({
    where: { userId_provider: { userId: input.userId, provider: IntegrationProvider.ONEDRIVE } },
    select: { metadata: true },
  });
  const prev = (link?.metadata && typeof link.metadata === 'object' ? (link.metadata as Record<string, unknown>) : {}) as Record<string, unknown>;
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await prisma.integrationLink.update({
    where: { userId_provider: { userId: input.userId, provider: IntegrationProvider.ONEDRIVE } },
    data: {
      status: 'connected',
      metadata: {
        ...prev,
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? input.refreshToken,
        tokenType: json.token_type ?? prev.tokenType ?? 'Bearer',
        scope: json.scope ?? prev.scope ?? env.ONEDRIVE_SCOPE,
        expiresAt,
      },
    },
  });
  return json.access_token;
}

async function resolveUsableAccessToken(userId: string, metadata: unknown): Promise<string | null> {
  const access = readAccessTokenFromMetadata(metadata);
  if (access) return access;
  const refresh = readRefreshTokenFromMetadata(metadata);
  if (!refresh) return null;
  return refreshAccessTokenWithRefreshToken({ userId, refreshToken: refresh });
}

function mapItemType(item: GraphDriveItem): 'file' | 'folder' | 'unknown' {
  if (item.folder) return 'folder';
  if (item.file) return 'file';
  return 'unknown';
}

function isLikelyTextMime(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('javascript')
  );
}

function normalizeExtractedText(raw: string): string {
  const trimmed = raw.replace(/\u0000/g, '').trim();
  if (!trimmed) return trimmed;
  const best = repairBrokenAccents(trimmed);
  return best.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function decodeTextIfPossible(data: ArrayBuffer, mimeType: string | null): Promise<string | null> {
  if (mimeType === 'application/pdf') {
    try {
      const parser = new PDFParse({ data: Buffer.from(data) });
      const parsed = await parser.getText();
      const text = parsed.text ? normalizeExtractedText(parsed.text) : null;
      return text && text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
  if (!isLikelyTextMime(mimeType)) return null;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return normalizeExtractedText(decoder.decode(data));
  } catch {
    return null;
  }
}

function splitQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9à-úç]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3)
    .slice(0, 8);
}

function buildRelevantSnippet(text: string, query: string, maxChars = 700): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  const terms = splitQueryTerms(query);
  if (terms.length === 0) return cleaned.slice(0, maxChars);
  const words = cleaned.split(' ');
  const windowSize = Math.min(130, Math.max(70, Math.floor(maxChars / 6)));
  let bestStart = 0;
  let bestScore = -1;
  for (let i = 0; i < words.length; i += 25) {
    const window = words.slice(i, i + windowSize).join(' ').toLowerCase();
    if (!window) continue;
    const score = terms.reduce(
      (acc, term) => acc + (window.includes(term) ? 1 + (window.match(new RegExp(term, 'g'))?.length ?? 0) : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }
  const snippet = words.slice(bestStart, bestStart + windowSize).join(' ').trim();
  return (snippet || cleaned).slice(0, maxChars);
}

export async function listOneDriveFiles(userId: string): Promise<OneDriveFilesResult> {
  const link = await prisma.integrationLink.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    select: { status: true, metadata: true },
  });
  if (!link || link.status !== 'connected') {
    return { ok: false, reason: 'OneDrive não está conectado para este usuário' };
  }

  const accessToken = await resolveUsableAccessToken(userId, link.metadata);
  if (!accessToken) {
    return { ok: false, reason: 'Token do OneDrive ausente. Reconecte a integração.' };
  }

  const response = await fetch(
    'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,file,folder&$top=200',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'Token do OneDrive expirado ou inválido. Reconecte a integração.' };
    }
    return { ok: false, reason: `Falha ao listar arquivos no OneDrive (HTTP ${response.status})` };
  }

  const json = (await response.json().catch(() => null)) as
    | { value?: GraphDriveItem[] }
    | null;
  const files = Array.isArray(json?.value)
    ? json!.value
        .filter((item) => typeof item?.id === 'string' && typeof item?.name === 'string')
        .map((item) => ({
          id: item.id!,
          name: item.name!,
          size: typeof item.size === 'number' ? item.size : 0,
          type: mapItemType(item),
        }))
    : [];

  return { ok: true, files };
}

export async function getOneDriveFileContent(
  userId: string,
  fileId: string,
): Promise<OneDriveFileContentResult> {
  const safeId = fileId.trim();
  if (!safeId) {
    return { ok: false, reason: 'id do arquivo é obrigatório' };
  }

  const link = await prisma.integrationLink.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    select: { status: true, metadata: true },
  });
  if (!link || link.status !== 'connected') {
    return { ok: false, reason: 'OneDrive não está conectado para este usuário' };
  }

  let accessToken = await resolveUsableAccessToken(userId, link.metadata);
  if (!accessToken) {
    return { ok: false, reason: 'Token do OneDrive ausente. Reconecte a integração.' };
  }

  let detailsRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(safeId)}?$select=id,name,size,file`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if ((detailsRes.status === 401 || detailsRes.status === 403) && readRefreshTokenFromMetadata(link.metadata)) {
    const renewed = await refreshAccessTokenWithRefreshToken({
      userId,
      refreshToken: readRefreshTokenFromMetadata(link.metadata)!,
    });
    if (renewed) {
      accessToken = renewed;
      detailsRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(safeId)}?$select=id,name,size,file`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    }
  }
  if (!detailsRes.ok) {
    if (detailsRes.status === 404) {
      return { ok: false, reason: 'Arquivo não encontrado no OneDrive' };
    }
    if (detailsRes.status === 401 || detailsRes.status === 403) {
      return { ok: false, reason: 'Token do OneDrive expirado ou inválido. Reconecte a integração.' };
    }
    return { ok: false, reason: `Falha ao buscar arquivo no OneDrive (HTTP ${detailsRes.status})` };
  }

  const details = (await detailsRes.json().catch(() => null)) as GraphDriveItemDetails | null;
  if (!details?.id || !details.name) {
    return { ok: false, reason: 'Resposta inválida do OneDrive ao buscar arquivo' };
  }
  const mimeType = details.file?.mimeType ?? null;
  const fileSize = typeof details.size === 'number' ? details.size : 0;
  const cacheKey = `${userId}:${details.id}`;
  const cached = fileTextCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.cachedAt <= FILE_TEXT_CACHE_TTL_MS &&
    cached.mimeType === mimeType &&
    cached.size === fileSize
  ) {
    return {
      ok: true,
      file: {
        id: details.id,
        name: details.name,
        size: fileSize,
        mimeType,
        textContent: cached.textContent,
      },
    };
  }

  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(safeId)}/content`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
    },
  );
  if (!contentRes.ok) {
    if (contentRes.status === 404) {
      return { ok: false, reason: 'Conteúdo do arquivo não encontrado no OneDrive' };
    }
    if (contentRes.status === 401 || contentRes.status === 403) {
      return { ok: false, reason: 'Token do OneDrive expirado ou inválido. Reconecte a integração.' };
    }
    return {
      ok: false,
      reason: `Falha ao baixar conteúdo do arquivo no OneDrive (HTTP ${contentRes.status})`,
    };
  }

  const buffer = await contentRes.arrayBuffer();
  const textContent = await decodeTextIfPossible(buffer, mimeType);
  fileTextCache.set(cacheKey, {
    textContent,
    mimeType,
    size: fileSize,
    cachedAt: Date.now(),
  });

  return {
    ok: true,
    file: {
      id: details.id,
      name: details.name,
      size: fileSize,
      mimeType,
      textContent,
    },
  };
}

export async function uploadTextFileToOneDrive(input: {
  userId: string;
  remotePath: string;
  content: string;
}): Promise<OneDriveUploadTextResult> {
  const { userId, remotePath, content } = input;
  const cleanPath = remotePath
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('/');
  if (!cleanPath) return { ok: false, reason: 'remotePath e obrigatorio' };

  const link = await prisma.integrationLink.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    select: { status: true, metadata: true },
  });
  if (!link || link.status !== 'connected') {
    return { ok: false, reason: 'OneDrive nao esta conectado para este usuario' };
  }
  let accessToken = await resolveUsableAccessToken(userId, link.metadata);
  if (!accessToken) {
    return { ok: false, reason: 'Token do OneDrive ausente. Reconecte a integracao.' };
  }

  const encodedPath = cleanPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  let response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
    body: content,
  });
  if ((response.status === 401 || response.status === 403) && readRefreshTokenFromMetadata(link.metadata)) {
    const renewed = await refreshAccessTokenWithRefreshToken({
      userId,
      refreshToken: readRefreshTokenFromMetadata(link.metadata)!,
    });
    if (renewed) {
      accessToken = renewed;
      response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'text/markdown; charset=utf-8',
        },
        body: content,
      });
    }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason:
          'Sem permissao de escrita no OneDrive. Reconecte para conceder escopo Files.ReadWrite.',
      };
    }
    return { ok: false, reason: `Falha ao subir arquivo no OneDrive (HTTP ${response.status})` };
  }

  const json = (await response.json().catch(() => null)) as GraphUploadedItem | null;
  if (!json?.id || !json.name) {
    return { ok: false, reason: 'Resposta invalida do OneDrive apos upload' };
  }
  return {
    ok: true,
    item: {
      id: json.id,
      name: json.name,
      webUrl: typeof json.webUrl === 'string' ? json.webUrl : null,
    },
  };
}

async function searchDriveItemsByQuery(
  accessToken: string,
  query: string,
): Promise<Array<{ id: string; name: string; size: number; type: 'file' | 'folder' | 'unknown' }>> {
  const safe = query.replace(/'/g, "''").trim().slice(0, 80);
  if (!safe) return [];
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(
      safe,
    )}')?$select=id,name,size,file,folder&$top=12`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) return [];
  const json = (await response.json().catch(() => null)) as { value?: GraphDriveItem[] } | null;
  if (!Array.isArray(json?.value)) return [];
  return json.value
    .filter((item) => typeof item.id === 'string' && typeof item.name === 'string')
    .map((item) => ({
      id: item.id!,
      name: item.name!,
      size: typeof item.size === 'number' ? item.size : 0,
      type: mapItemType(item),
    }));
}

export async function getRelevantOneDriveSnippets(
  userId: string,
  query: string,
): Promise<OneDriveContextSnippet[]> {
  const link = await prisma.integrationLink.findUnique({
    where: { userId_provider: { userId, provider: IntegrationProvider.ONEDRIVE } },
    select: { status: true, metadata: true },
  });
  if (!link || link.status !== 'connected') return [];
  const accessToken = readAccessTokenFromMetadata(link.metadata);
  if (!accessToken) return [];

  const baseFilesRes = await listOneDriveFiles(userId);
  if (!baseFilesRes.ok) return [];
  const searchHits = await searchDriveItemsByQuery(accessToken, query);
  const byId = new Map<string, (typeof baseFilesRes.files)[number]>();
  for (const f of baseFilesRes.files) byId.set(f.id, f);
  for (const f of searchHits) if (!byId.has(f.id)) byId.set(f.id, f);
  let candidates = Array.from(byId.values());
  const terms = splitQueryTerms(query);
  if (terms.length > 0) {
    candidates = candidates.sort((a, b) => {
      const sa = terms.reduce((acc, t) => (a.name.toLowerCase().includes(t) ? acc + 1 : acc), 0);
      const sb = terms.reduce((acc, t) => (b.name.toLowerCase().includes(t) ? acc + 1 : acc), 0);
      return sb - sa;
    });
  }
  candidates = candidates.filter((f) => f.type !== 'folder').slice(0, 8);

  const snippets: OneDriveContextSnippet[] = [];
  for (const file of candidates) {
    if (snippets.length >= 3) break;
    const content = await getOneDriveFileContent(userId, file.id);
    if (!content.ok || !content.file.textContent) continue;
    // Evita custo alto no chat para arquivos não-PDF muito grandes.
    if ((content.file.mimeType ?? '') !== 'application/pdf' && file.size > 300_000) continue;
    // Também limita PDFs muito grandes para manter latência controlada.
    if ((content.file.mimeType ?? '') === 'application/pdf' && file.size > 5_000_000) continue;
    const snippet = buildRelevantSnippet(content.file.textContent, query, 700);
    if (!snippet) continue;
    snippets.push({
      id: file.id,
      name: file.name,
      snippet,
    });
  }
  return snippets;
}
