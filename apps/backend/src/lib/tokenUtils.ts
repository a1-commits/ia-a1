import crypto from 'crypto';

export function randomOpaqueToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
