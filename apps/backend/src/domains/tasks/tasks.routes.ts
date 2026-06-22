import { Router } from 'express';
import { ContextType, TaskPriority, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';
import { createTask } from './tasks.service';

export const tasksRouter = Router();
tasksRouter.use(authMiddleware);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  context: z.nativeEnum(ContextType).optional(),
});

const patchSchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
});

tasksRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const context = req.query.context as ContextType | undefined;
    const items = await prisma.task.findMany({
      where: { userId, ...(context ? { context } : {}) },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const userId = req.userId!;
    const item = await createTask({
      userId,
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      context: body.context,
    });
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body);
    const userId = req.userId!;
    const id = req.params.id;
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    const item = await prisma.task.update({
      where: { id },
      data: body,
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});
