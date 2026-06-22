import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export type AuthPayload = { userId: string; typ?: string };
export type AuthUserRole = 'ADMIN' | 'OPERATOR' | 'READONLY';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: AuthUserRole;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (payload.typ && payload.typ !== 'access') {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, active: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'Usuário bloqueado' });
      return;
    }
    req.userId = payload.userId;
    req.userRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== 'ADMIN') {
    res.status(403).json({ error: 'Acesso restrito a administradores' });
    return;
  }
  next();
}
