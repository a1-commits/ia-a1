import { ContextType, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const HANDOFF_MARKER = '[HANDOFF_GERENTE]';

export function shouldHandoffToSalesManager(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('encaminhar seu atendimento para o gerente de vendas') ||
    normalized.includes('encaminhar para o gerente de vendas') ||
    normalized.includes('gerente de vendas da moble')
  );
}

export async function maybeCreateSalesHandoff(input: {
  userId: string;
  conversationId: string;
  customerMessage: string;
  assistantReply: string;
}): Promise<{ taskId?: string }> {
  const { userId, conversationId, customerMessage, assistantReply } = input;
  if (!shouldHandoffToSalesManager(assistantReply)) return {};

  const dedupeToken = `conversation:${conversationId}`;
  const existing = await prisma.task.findFirst({
    where: {
      userId,
      title: { startsWith: HANDOFF_MARKER },
      description: { contains: dedupeToken },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { taskId: existing.id };

  const task = await prisma.task.create({
    data: {
      userId,
      context: ContextType.MOBLE,
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      title: `${HANDOFF_MARKER} Lead para gerente de vendas`,
      description: [
        dedupeToken,
        `cliente: ${customerMessage.slice(0, 260)}`,
        `resumo_ai: ${assistantReply.slice(0, 600)}`,
      ].join('\n'),
    },
    select: { id: true },
  });
  return { taskId: task.id };
}

export async function createSalesHandoff(input: {
  userId: string;
  conversationId: string;
  title?: string | null;
  reason: string;
  summary: string;
}): Promise<{ taskId: string; alreadyOpen: boolean }> {
  const { userId, conversationId, title, reason, summary } = input;
  const dedupeToken = `conversation:${conversationId}`;
  const existing = await prisma.task.findFirst({
    where: {
      userId,
      title: { startsWith: HANDOFF_MARKER },
      description: { contains: dedupeToken },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return { taskId: existing.id, alreadyOpen: true };

  const task = await prisma.task.create({
    data: {
      userId,
      context: ContextType.MOBLE,
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      title: `${HANDOFF_MARKER} ${title ?? 'Atendimento com Ronan'}`,
      description: [
        dedupeToken,
        `motivo: ${reason}`,
        'resumo:',
        summary.slice(0, 1600),
      ].join('\n'),
    },
    select: { id: true },
  });
  return { taskId: task.id, alreadyOpen: false };
}

export async function getSalesHandoffForConversation(userId: string, conversationId: string): Promise<{
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  return prisma.task.findFirst({
    where: {
      userId,
      title: { startsWith: HANDOFF_MARKER },
      description: { contains: `conversation:${conversationId}` },
      status: { notIn: [TaskStatus.CANCELLED] },
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listOpenSalesHandoffs(userId: string): Promise<
  Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  return prisma.task.findMany({
    where: {
      userId,
      title: { startsWith: HANDOFF_MARKER },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function resolveSalesHandoff(userId: string, id: string): Promise<boolean> {
  const found = await prisma.task.findFirst({
    where: { id, userId, title: { startsWith: HANDOFF_MARKER } },
    select: { id: true },
  });
  if (!found) return false;
  await prisma.task.update({
    where: { id },
    data: { status: TaskStatus.DONE },
  });
  return true;
}

