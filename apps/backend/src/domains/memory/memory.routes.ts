import { Router } from 'express';
import { ContextType, MemoryType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';
import { buildMemoryEmbeddingJson, saveMemory, stripEmbedding } from './memory.service';

export const memoryRouter = Router();
memoryRouter.use(authMiddleware);

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  context: z.nativeEnum(ContextType).optional(),
  type: z.nativeEnum(MemoryType).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  context: z.nativeEnum(ContextType).optional(),
  type: z.nativeEnum(MemoryType).optional(),
});

memoryRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const context = req.query.context as ContextType | undefined;
    const type = req.query.type as MemoryType | undefined;

    const items = await prisma.memory.findMany({
      where: {
        userId,
        ...(context ? { context } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ items: items.map((m) => stripEmbedding(m)) });
  } catch (e) {
    next(e);
  }
});

memoryRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const userId = req.userId!;
    const item = await saveMemory({
      userId,
      title: body.title,
      dadosRelevantes: body.content,
      contexto: body.context ?? ContextType.GERAL,
      type: body.type ?? MemoryType.PERMANENTE,
    });
    res.status(201).json(stripEmbedding(item));
  } catch (e) {
    next(e);
  }
});

memoryRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const body = patchSchema.parse(req.body);
    const existing = await prisma.memory.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: 'Memória não encontrada' });
      return;
    }
    const title = body.title ?? existing.title;
    const content = body.content ?? existing.content;
    const shouldReembed = Boolean(body.title ?? body.content);
    const embedding = shouldReembed ? await buildMemoryEmbeddingJson(title, content) : undefined;

    const item = await prisma.memory.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.context !== undefined ? { context: body.context } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(embedding !== undefined ? { embedding } : {}),
      },
    });
    res.json(stripEmbedding(item));
  } catch (e) {
    next(e);
  }
});

memoryRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const existing = await prisma.memory.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: 'Memória não encontrada' });
      return;
    }
    await prisma.memory.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
