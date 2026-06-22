import { ContextType, TaskStatus, type ContextType as ContextTypeT } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { RelatedContextBundle } from './agent.types';
import { getRelevantOneDriveSnippets } from '../integrations/onedrive.service';
import { getRelevantLocalKnowledgeSnippets } from './localKnowledge.service';

export async function fetchRelatedContext(input: {
  userId: string;
  context: ContextTypeT;
  query: string;
}): Promise<RelatedContextBundle> {
  const { userId, context, query } = input;

  const [
    openTasks,
    recentMemories,
    founderProfileMemories,
    recentReflections,
    oneDriveSnippets,
    localKnowledgeSnippets,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        context,
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
      select: { id: true, title: true, description: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.memory.findMany({
      where: { userId, context },
      select: { id: true, title: true, content: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.memory.findMany({
      where: { userId, context: ContextType.GERAL, title: { startsWith: 'PERFIL_RONAN:' } },
      select: { id: true, title: true, content: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.reflection.findMany({
      where: { userId, context },
      select: { id: true, title: true, content: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    getRelevantOneDriveSnippets(userId, query),
    getRelevantLocalKnowledgeSnippets(query),
  ]);

  return {
    openTasks,
    recentMemories,
    founderProfileMemories,
    recentReflections,
    oneDriveSnippets,
    localKnowledgeSnippets,
  };
}
