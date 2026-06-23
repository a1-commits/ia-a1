import { Router } from 'express';
import { ContextType } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { processAgentMessage } from './chatAgentFlow.service';

export const chatRouter = Router();
chatRouter.use(authMiddleware);

const messageSchema = z.object({
  conversationId: z.string().cuid().optional(),
  content: z.string().min(1),
  context: z.nativeEnum(ContextType).optional(),
  agentId: z.string().cuid().optional(),
});

chatRouter.post('/message', async (req, res, next) => {
  try {
    const body = messageSchema.parse(req.body);
    const userId = req.userId!;
    const result = await processAgentMessage({
      userId,
      content: body.content,
      conversationId: body.conversationId,
      context: body.context ?? undefined,
      assignedAgentId: body.agentId,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Conversa n�o encontrada') {
      res.status(404).json({ error: 'Conversa n�o encontrada' });
      return;
    }
    next(e);
  }
});
