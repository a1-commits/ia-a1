import { prisma } from '../../lib/prisma';
import { isOpenAiConfigured } from '../../config/env';
import { embedText } from '../../lib/embeddings';
import { cosineSimilarity, parseEmbeddingJson } from '../../lib/semantic';
import type { ChatMessage } from '../ai/aiProvider.types';

const MAX_SNIPPETS = 3;
const MAX_CHARS = 420;

/** Injeta contexto das memórias mais próximas da última mensagem do usuário (RAG leve). */
export async function enrichMessagesWithMemoryContext(
  userId: string,
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  if (!isOpenAiConfigured()) return messages;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content?.trim()) return messages;

  const queryEmbedding = await embedText(lastUser.content);
  if (!queryEmbedding) return messages;

  const candidates = await prisma.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 120,
  });

  const scored = candidates
    .map((m) => {
      const emb = parseEmbeddingJson(m.embedding);
      if (!emb) return null;
      const s = cosineSimilarity(queryEmbedding, emb);
      return { m, s };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.s > 0.28)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_SNIPPETS);

  if (scored.length === 0) return messages;

  const block = scored
    .map(({ m }) => `- ${m.title}: ${m.content.slice(0, MAX_CHARS)}`)
    .join('\n');

  const systemMsg: ChatMessage = {
    role: 'system',
    content:
      'Trechos relevantes das memórias salvas pelo usuário (use só se fizer sentido na resposta):\n' +
      block,
  };

  return [systemMsg, ...messages];
}
