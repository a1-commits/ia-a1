import type { Agent } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  getAgentRecordById,
  getDefaultAgentRecord,
  ensureDefaultAgent,
} from './agent.service';

export type AgentCandidate = Pick<Agent, 'id' | 'name' | 'isActive'>;

export function selectAgentForMessage(input: {
  agentTest?: boolean;
  explicitAgent?: AgentCandidate | null;
  contactAssignedAgent?: AgentCandidate | null;
  conversationAgent?: AgentCandidate | null;
  defaultAgent: AgentCandidate;
}): AgentCandidate {
  if (input.agentTest && input.explicitAgent?.isActive) {
    return input.explicitAgent;
  }
  if (input.contactAssignedAgent?.isActive) {
    return input.contactAssignedAgent;
  }
  if (input.conversationAgent?.isActive) {
    return input.conversationAgent;
  }
  return input.defaultAgent;
}

async function findContactWithBinding(input: {
  userId: string;
  contactId?: string | null;
  phone?: string | null;
  whatsappId?: string | null;
}) {
  if (input.contactId) {
    return prisma.contact.findFirst({
      where: { id: input.contactId, userId: input.userId },
      include: { contactAgent: { include: { agent: true } } },
    });
  }

  const phoneDigits = input.phone?.replace(/\D/g, '') ?? '';
  const orConditions: Array<{ phone: { contains: string } } | { whatsappId: string }> = [];
  if (phoneDigits.length >= 8) {
    orConditions.push({ phone: { contains: phoneDigits.slice(-11) } });
  }
  if (input.whatsappId) {
    orConditions.push({ whatsappId: input.whatsappId });
  }
  if (orConditions.length === 0) return null;

  return prisma.contact.findFirst({
    where: { userId: input.userId, OR: orConditions },
    include: { contactAgent: { include: { agent: true } } },
  });
}

export async function resolveAgentForMessage(input: {
  userId: string;
  agentId?: string | null;
  agentTest?: boolean;
  phone?: string | null;
  whatsappId?: string | null;
  contactId?: string | null;
  conversationAgentId?: string | null;
}): Promise<Agent> {
  const { userId } = input;
  await ensureDefaultAgent(userId);

  const explicitAgent = input.agentId ? await getAgentRecordById(userId, input.agentId) : null;
  const contact = await findContactWithBinding({
    userId,
    contactId: input.contactId,
    phone: input.phone,
    whatsappId: input.whatsappId,
  });
  const contactAssignedAgent = contact?.contactAgent?.agent ?? null;
  const conversationAgent = input.conversationAgentId
    ? await getAgentRecordById(userId, input.conversationAgentId)
    : null;
  const defaultAgent = await getDefaultAgentRecord(userId);

  const selected = selectAgentForMessage({
    agentTest: input.agentTest,
    explicitAgent,
    contactAssignedAgent,
    conversationAgent,
    defaultAgent,
  });

  if (selected.id === defaultAgent.id) return defaultAgent;
  if (selected.id === explicitAgent?.id && explicitAgent) return explicitAgent;
  if (selected.id === contactAssignedAgent?.id && contactAssignedAgent) return contactAssignedAgent;
  if (selected.id === conversationAgent?.id && conversationAgent) return conversationAgent;
  return defaultAgent;
}

export async function findContactByPhone(userId: string, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return prisma.contact.findFirst({
    where: { userId, phone: { contains: digits.slice(-11) } },
    include: { contactAgent: { include: { agent: true } } },
  });
}

export async function getBoundAgentForContact(
  userId: string,
  contactId: string,
): Promise<Agent | null> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
    include: { contactAgent: { include: { agent: true } } },
  });
  const agent = contact?.contactAgent?.agent;
  return agent?.isActive ? agent : null;
}
