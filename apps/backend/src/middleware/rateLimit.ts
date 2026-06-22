import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function keyOf(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return `${ip}:${req.path}`;
}

function cleanup(now: number): void {
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function createRateLimit(params: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = 'Muitas requisições, tente novamente em instantes.' } = params;
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    cleanup(now);
    const key = keyOf(req);
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}

