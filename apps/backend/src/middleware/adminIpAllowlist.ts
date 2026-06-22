import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

function parseAllowlist(): string[] {
  return (env.ADMIN_IP_ALLOWLIST ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function ipCandidates(req: Request): string[] {
  const ips = new Set<string>();
  if (req.ip) ips.add(req.ip);
  if (req.socket.remoteAddress) ips.add(req.socket.remoteAddress);
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') {
    fwd
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => ips.add(x));
  }
  return Array.from(ips);
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

export function adminIpAllowlist(req: Request, res: Response, next: NextFunction): void {
  const allow = parseAllowlist();
  if (allow.length === 0) {
    next();
    return;
  }
  const candidates = ipCandidates(req).map(normalizeIp);
  const allowed = candidates.some((ip) => allow.includes(ip));
  if (!allowed) {
    res.status(403).json({ error: 'IP não autorizado para rota administrativa' });
    return;
  }
  next();
}

