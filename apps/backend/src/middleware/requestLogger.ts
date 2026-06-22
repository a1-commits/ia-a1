import type { NextFunction, Request, Response } from 'express';

function sanitizeUrl(raw: string): string {
  const [path, query] = raw.split('?');
  if (!query) return path;
  const params = new URLSearchParams(query);
  const sensitive = ['token', 'access_token', 'refreshToken', 'password', 'apiKey', 'key'];
  for (const k of sensitive) {
    if (params.has(k)) params.set(k, '[REDACTED]');
  }
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${sanitizeUrl(req.originalUrl)} ${res.statusCode} ${ms}ms`);
  });
  next();
}
