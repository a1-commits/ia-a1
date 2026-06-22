import { Router } from 'express';
import { ContextType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';

export const reflectionsRouter = Router();
reflectionsRouter.use(authMiddleware);

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  context: z.nativeEnum(ContextType).optional(),
});

reflectionsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const context = req.query.context as ContextType | undefined;
    const items = await prisma.reflection.findMany({
      where: { userId, ...(context ? { context } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

reflectionsRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const userId = req.userId!;
    const item = await prisma.reflection.create({
      data: {
        userId,
        title: body.title,
        content: body.content,
        context: body.context ?? ContextType.GERAL,
      },
    });
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});
