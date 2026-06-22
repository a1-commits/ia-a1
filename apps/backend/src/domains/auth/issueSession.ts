import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { hashOpaqueToken, randomOpaqueToken } from '../../lib/tokenUtils';

const REFRESH_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'OPERATOR' | 'READONLY';
  active: boolean;
  createdAt: Date;
};

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
};

function accessTokenForUserId(userId: string): string {
  const signOptions: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES as NonNullable<SignOptions['expiresIn']>,
  };
  return jwt.sign({ userId, typ: 'access' as const }, env.JWT_SECRET, signOptions);
}

function decodeExpiresInSeconds(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  if (!decoded?.exp || !decoded.iat) return 900;
  return Math.max(60, decoded.exp - decoded.iat);
}

export async function issueSession(user: SessionUser): Promise<IssuedSession> {
  const accessToken = accessTokenForUserId(user.id);
  const expiresIn = decodeExpiresInSeconds(accessToken);
  const refreshPlain = randomOpaqueToken();
  const tokenHash = hashOpaqueToken(refreshPlain);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: refreshPlain,
    expiresIn,
    user,
  };
}
