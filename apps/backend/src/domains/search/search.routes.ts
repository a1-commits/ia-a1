import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';
import { embedText } from '../../lib/embeddings';
import { cosineSimilarity, parseEmbeddingJson } from '../../lib/semantic';
import { isOpenAiConfigured } from '../../config/env';

function stripEmb<M extends { embedding?: unknown }>(m: M): Omit<M, 'embedding'> {
  const { embedding: _e, ...rest } = m;
  return rest;
}

export const searchRouter = Router();
searchRouter.use(authMiddleware);

const bodySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().min(1).max(50).optional(),
});

searchRouter.post('/', async (req, res, next) => {
  try {
    const body = bodySchema.parse(req.body);
    const userId = req.userId!;
    const limit = body.limit ?? 15;
    const q = body.query.trim();
    const like = { contains: q, mode: 'insensitive' as const };

    const [memoriesKw, conversationsKw, messagesKw] = await Promise.all([
      prisma.memory.findMany({
        where: {
          userId,
          OR: [{ title: like }, { content: like }],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      prisma.conversation.findMany({
        where: {
          userId,
          archived: false,
          OR: [{ title: like }],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      prisma.message.findMany({
        where: {
          content: like,
          conversation: { userId },
        },
        include: {
          conversation: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    let semanticMemories: { memory: (typeof memoriesKw)[0]; score: number }[] = [];
    if (isOpenAiConfigured()) {
      const queryEmbedding = await embedText(q);
      if (queryEmbedding) {
        const candidates = await prisma.memory.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 400,
        });
        semanticMemories = candidates
          .map((m) => {
            const emb = parseEmbeddingJson(m.embedding);
            if (!emb) return null;
            return { memory: m, score: cosineSimilarity(queryEmbedding, emb) };
          })
          .filter((x): x is { memory: (typeof candidates)[0]; score: number } => x !== null)
          .filter((x) => x.score > 0.25)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }
    }

    res.json({
      query: q,
      keyword: {
        memories: memoriesKw.map((m) => stripEmb(m)),
        conversations: conversationsKw,
        messages: messagesKw,
      },
      semantic: {
        memories: semanticMemories.map(({ memory, score }) => ({
          memory: stripEmb(memory),
          score,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});
