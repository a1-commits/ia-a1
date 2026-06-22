import { Router } from 'express';
import { ContextType, ProposalStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';

export const proposalsRouter = Router();
proposalsRouter.use(authMiddleware);

const createSchema = z.object({
  conversationId: z.string().cuid().optional(),
  title: z.string().min(1).max(240),
  content: z.string().min(1),
  summary: z.string().optional(),
  status: z.nativeEnum(ProposalStatus).optional(),
  valueEstimate: z.number().nonnegative().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().optional(),
  status: z.nativeEnum(ProposalStatus).optional(),
  valueEstimate: z.number().nonnegative().nullable().optional(),
});

async function maybeCreateSentFollowUp(input: {
  userId: string;
  proposalId: string;
  title: string;
  conversationId: string | null;
}): Promise<string | null> {
  const marker = `proposal-followup:${input.proposalId}`;
  const existing = await prisma.task.findFirst({
    where: {
      userId: input.userId,
      description: { contains: marker },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const task = await prisma.task.create({
    data: {
      userId: input.userId,
      title: `Follow-up proposta: ${input.title}`,
      description: [
        marker,
        input.conversationId ? `conversation:${input.conversationId}` : null,
        'Proposta marcada como enviada. Retomar contato para confirmar recebimento e próximos passos.',
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      context: ContextType.MOBLE,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
    },
    select: { id: true },
  });
  return task.id;
}

proposalsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const status = req.query.status as ProposalStatus | undefined;
    const items = await prisma.proposal.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        conversation: {
          select: { id: true, title: true, context: true, updatedAt: true },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

proposalsRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const item = await prisma.proposal.findFirst({
      where: { id, userId },
      include: {
        conversation: {
          select: { id: true, title: true, context: true, updatedAt: true },
        },
      },
    });
    if (!item) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

proposalsRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const body = createSchema.parse(req.body);
    if (body.conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: body.conversationId, userId },
        select: { id: true },
      });
      if (!conversation) {
        res.status(404).json({ error: 'Conversa não encontrada' });
        return;
      }
    }

    const item = await prisma.proposal.create({
      data: {
        userId,
        conversationId: body.conversationId,
        title: body.title,
        content: body.content,
        summary: body.summary,
        status: body.status ?? ProposalStatus.DRAFT,
        valueEstimate: body.valueEstimate,
      },
    });
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

proposalsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const body = patchSchema.parse(req.body);
    const existing = await prisma.proposal.findFirst({
      where: { id, userId },
      select: { id: true, title: true, status: true, conversationId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }
    const item = await prisma.proposal.update({
      where: { id },
      data: body,
    });
    const followUpTaskId =
      body.status === ProposalStatus.SENT && existing.status !== ProposalStatus.SENT
        ? await maybeCreateSentFollowUp({
            userId,
            proposalId: existing.id,
            title: body.title ?? existing.title,
            conversationId: existing.conversationId,
          })
        : null;
    res.json({ ...item, followUpTaskId });
  } catch (e) {
    next(e);
  }
});
