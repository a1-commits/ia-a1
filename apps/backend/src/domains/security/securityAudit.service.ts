import { ContextType, MemoryType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export async function logSecurityEvent(params: {
  userId?: string | null;
  source: string;
  action: string;
  details: string;
}): Promise<void> {
  const { userId, source, action, details } = params;
  if (!userId) return;
  await prisma.memory.create({
    data: {
      userId,
      context: ContextType.GERAL,
      type: MemoryType.PERMANENTE,
      title: `SECURITY_AUDIT: ${source}:${action}`.slice(0, 120),
      content: details.slice(0, 2000),
    },
  });
}

