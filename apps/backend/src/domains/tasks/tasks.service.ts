import { ContextType, TaskPriority, TaskStatus, type Task } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type CreateTaskInput = {
  userId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  context?: ContextType;
};

export async function createTask(data: CreateTaskInput): Promise<Task> {
  return prisma.task.create({
    data: {
      userId: data.userId,
      title: data.title,
      description: data.description ?? undefined,
      status: data.status ?? TaskStatus.TODO,
      priority: data.priority ?? TaskPriority.MEDIUM,
      context: data.context ?? ContextType.GERAL,
    },
  });
}
