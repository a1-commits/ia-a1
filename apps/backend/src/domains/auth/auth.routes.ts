import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hashOpaqueToken } from '../../lib/tokenUtils';
import { isGoogleOAuthConfigured } from '../../config/env';
import {
  buildFrontendErrorRedirect,
  buildFrontendSuccessRedirect,
  buildGoogleAuthRedirectUrl,
  completeGoogleOAuthLogin,
  GoogleOAuthError,
  renderFrontendRedirectHtml,
} from './googleOAuth.service';
import { issueSession } from './issueSession';

export const authRouter = Router();

const failedLoginByEmail = new Map<string, { count: number; lockedUntil?: number }>();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function jsonSession(session: Awaited<ReturnType<typeof issueSession>>) {
  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    user: session.user,
  };
}

/** Inicia login social via Google OAuth. */
authRouter.get('/google', (_req, res, next) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({ error: 'Login com Google não configurado no servidor.' });
      return;
    }
    res.redirect(buildGoogleAuthRedirectUrl());
  } catch (e) {
    next(e);
  }
});

/** Callback OAuth do Google: cria/vincula usuário e redireciona ao frontend autenticado. */
authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const oauthError = typeof req.query.error === 'string' ? req.query.error : null;
    if (oauthError) {
      const description =
        typeof req.query.error_description === 'string' ? req.query.error_description : oauthError;
      res
        .status(400)
        .send(renderFrontendRedirectHtml(buildFrontendErrorRedirect(description)));
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      res
        .status(400)
        .send(renderFrontendRedirectHtml(buildFrontendErrorRedirect('Callback Google inválido.')));
      return;
    }

    const session = await completeGoogleOAuthLogin({ code, state });
    res.send(renderFrontendRedirectHtml(buildFrontendSuccessRedirect(session)));
  } catch (e) {
    if (e instanceof GoogleOAuthError) {
      res.status(400).send(renderFrontendRedirectHtml(buildFrontendErrorRedirect(e.message)));
      return;
    }
    next(e);
  }
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      res.status(409).json({ error: 'E-mail já cadastrado' });
      return;
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
      },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    const session = await issueSession(user);
    res.status(201).json(jsonSession(session));
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const key = body.email.toLowerCase();
    const current = failedLoginByEmail.get(key);
    if (current?.lockedUntil && current.lockedUntil > Date.now()) {
      res.status(429).json({ error: 'Conta temporariamente bloqueada por tentativas inválidas.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      const nextFail = (failedLoginByEmail.get(key)?.count ?? 0) + 1;
      failedLoginByEmail.set(key, {
        count: nextFail,
        lockedUntil: nextFail >= 8 ? Date.now() + 10 * 60 * 1000 : undefined,
      });
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'Usuário bloqueado. Fale com o administrador.' });
      return;
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      const nextFail = (failedLoginByEmail.get(key)?.count ?? 0) + 1;
      failedLoginByEmail.set(key, {
        count: nextFail,
        lockedUntil: nextFail >= 8 ? Date.now() + 10 * 60 * 1000 : undefined,
      });
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }
    failedLoginByEmail.delete(key);
    const session = await issueSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    });
    res.json(jsonSession(session));
  } catch (e) {
    next(e);
  }
});

/** Troca refresh por novo par access + refresh (rotação). */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const hash = hashOpaqueToken(body.refreshToken);
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      res.status(401).json({ error: 'Refresh inválido ou expirado' });
      return;
    }
    if (!row.user.active) {
      res.status(403).json({ error: 'Usuário bloqueado. Fale com o administrador.' });
      return;
    }
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const session = await issueSession({
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
      active: row.user.active,
      createdAt: row.user.createdAt,
    });
    res.json(jsonSession(session));
  } catch (e) {
    next(e);
  }
});

/** Revoga o refresh token atual (logout em outros dispositivos futuro: revogar todos). */
authRouter.post('/logout', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      const hash = hashOpaqueToken(parsed.data.refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hash },
        data: { revokedAt: new Date() },
      });
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
