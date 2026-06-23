import type { Agent } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  getAgentRecordById,
  getDefaultAgentRecord,
  ensureDefaultAgent,
} from './agent.service';

export async function resolveAgentForMessage(input: {
  userId: string;
  agentId?: string | null;
  phone?: string | null;
  whatsappId?: string | null;
}): Promise<Agent> {
  const { userId } = input;
  await ensureDefaultAgent(userId);

  if (input.agentId) {
    const explicit = await getAgentRecordById(userId, input.agentId);
    if (explicit?.isActive) return explicit;
  }

  const phoneDigits = input.phone?.replace(/\D/g, '') ?? '';
  const orConditions: Array<{ phone: { contains: string } } | { whatsappId: string }> = [];
  if (phoneDigits.length >= 8) {
    orConditions.push({ phone: { contains: phoneDigits.slice(-11) } });
  }
  if (input.whatsappId) {
    orConditions.push({ whatsappId: input.whatsappId });
  }

  const contact =
    orConditions.length > 0
      ? await prisma.contact.findFirst({
          where: { userId, OR: orConditions },
          include: { contactAgent: { include: { agent: true } } },
        })
      : null;

  const assigned = contact?.contactAgent?.agent;
  if (assigned?.isActive) return assigned;

  return getDefaultAgentRecord(userId);
}

export async function findContactByPhone(userId: string, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return prisma.contact.findFirst({
    where: { userId, phone: { contains: digits.slice(-11) } },
    include: { contactAgent: { include: { agent: true } } },
  });
}
