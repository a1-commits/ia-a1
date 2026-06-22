import { Router } from 'express';
import { prisma } from '../../lib/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up' });
  } catch {
    // API viva; banco indisponível — útil para smoke local sem Postgres ainda.
    res.status(200).json({ status: 'degraded', database: 'down' });
  }
});
