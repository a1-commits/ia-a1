import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { env, isGoogleOAuthConfigured } from '../../config/env';
import { randomOpaqueToken } from '../../lib/tokenUtils';
import { issueSession, type IssuedSession } from './issueSession';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const OAUTH_SCOPES = ['openid', 'email', 'profile'];
const STATE_TTL_MS = 10 * 60 * 1000;

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'invalid_state' | 'token_exchange' | 'profile' | 'email_unverified' | 'blocked',
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

function signOAuthState(): string {
  const expiresAt = Date.now() + STATE_TTL_MS;
  const nonce = randomOpaqueToken();
  const payload = `${nonce}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiresAtRaw, signature] = parts;
  const payload = `${nonce}.${expiresAtRaw}`;
  const expected = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  if (signature !== expected) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

export function buildGoogleAuthRedirectUrl(): string {
  if (!isGoogleOAuthConfigured()) {
    throw new GoogleOAuthError('Login com Google não configurado no servidor.', 'not_configured');
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    access_type: 'online',
    prompt: 'select_account',
    state: signOAuthState(),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !json.access_token) {
    throw new GoogleOAuthError(
      json.error_description ?? json.error ?? 'Falha ao trocar código OAuth do Google.',
      'token_exchange',
    );
  }

  return json.access_token;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = (await res.json()) as GoogleUserInfo & { error?: { message?: string } };
  if (!res.ok || !json.email) {
    throw new GoogleOAuthError(
      json.error?.message ?? 'Não foi possível obter o perfil Google.',
      'profile',
    );
  }

  return json;
}

async function findOrCreateUserFromGoogle(profile: GoogleUserInfo) {
  const email = profile.email!.trim();
  if (!profile.verified_email) {
    throw new GoogleOAuthError('E-mail Google não verificado.', 'email_unverified');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.active) {
      throw new GoogleOAuthError('Usuário bloqueado. Fale com o administrador.', 'blocked');
    }

    if (!existing.name && profile.name?.trim()) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { name: profile.name.trim() },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      });
    }

    return existing;
  }

  const passwordHash = await bcrypt.hash(randomOpaqueToken(), 10);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      name: profile.name?.trim() || null,
    },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
}

export async function completeGoogleOAuthLogin(input: {
  code: string;
  state: string;
}): Promise<IssuedSession> {
  if (!isGoogleOAuthConfigured()) {
    throw new GoogleOAuthError('Login com Google não configurado no servidor.', 'not_configured');
  }
  if (!verifyOAuthState(input.state)) {
    throw new GoogleOAuthError('State OAuth inválido ou expirado.', 'invalid_state');
  }

  const accessToken = await exchangeCodeForAccessToken(input.code);
  const profile = await fetchGoogleProfile(accessToken);
  const user = await findOrCreateUserFromGoogle(profile);
  return issueSession(user);
}

export function buildFrontendSuccessRedirect(session: IssuedSession): string {
  const params = new URLSearchParams({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  return `${env.WEB_BASE_URL}/auth/google/callback#${params.toString()}`;
}

export function buildFrontendErrorRedirect(message: string): string {
  return `${env.WEB_BASE_URL}/login?googleError=${encodeURIComponent(message)}`;
}

export function renderFrontendRedirectHtml(targetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${targetUrl.replace(/"/g, '&quot;')}" />
  <title>Autenticando…</title>
</head>
<body>
  <p>Autenticando… <a href="${targetUrl.replace(/"/g, '&quot;')}">Continuar</a></p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`;
}
