import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';

export const settingsRouter = Router();
settingsRouter.use(authMiddleware);

const upsertSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

settingsRouter.get('/', async (req, res, next) => {
  try {
    const items = await prisma.setting.findMany({
      where: { userId: req.userId! },
      orderBy: { key: 'asc' },
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

settingsRouter.put('/', async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const userId = req.userId!;
    const item = await prisma.setting.upsert({
      where: {
        userId_key: { userId, key: body.key },
      },
      create: { userId, key: body.key, value: body.value },
      update: { value: body.value },
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});
