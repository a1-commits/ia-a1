import type { Prisma, Memory } from '@prisma/client';
import { ContextType, MemoryType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { embedText } from '../../lib/embeddings';

export type SaveMemoryInput = {
  userId: string;
  cliente?: string | null;
  contexto?: ContextType;
  dadosRelevantes: string;
  title?: string;
  type?: MemoryType;
};

export function stripEmbedding<T extends { embedding?: unknown }>(row: T): Omit<T, 'embedding'> {
  const { embedding: _e, ...rest } = row;
  return rest;
}

export async function buildMemoryEmbeddingJson(
  title: string,
  content: string,
): Promise<Prisma.InputJsonValue | undefined> {
  const vec = await embedText(`${title}\n${content}`);
  if (!vec) return undefined;
  return vec as unknown as Prisma.InputJsonValue;
}

export async function saveMemory(data: SaveMemoryInput): Promise<Memory> {
  const cliente = data.cliente?.trim();
  const title = data.title?.trim() || (cliente ? `Cliente: ${cliente}` : 'Memoria operacional');
  const content = cliente
    ? `Cliente: ${cliente}\nDados relevantes: ${data.dadosRelevantes.trim()}`
    : data.dadosRelevantes.trim();
  const embedding = await buildMemoryEmbeddingJson(title, content);

  return prisma.memory.create({
    data: {
      userId: data.userId,
      title,
      content,
      context: data.contexto ?? ContextType.MOBLE,
      type: data.type ?? MemoryType.PERMANENTE,
      ...(embedding ? { embedding } : {}),
    },
  });
}
