import type { Agent } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DEFAULT_AGENT_SEED, type AgentDto, type AgentWithRelations } from './agent.types';
import { extractToolKeys, syncAgentTools } from './agentTools.service';

const agentInclude = {
  _count: { select: { contactAgents: true } },
  agentTools: { include: { tool: true } },
} as const;

function toDto(agent: AgentWithRelations): AgentDto {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    objective: agent.objective,
    instructions: agent.instructions,
    rules: agent.rules,
    forbiddenRules: agent.forbiddenRules,
    examples: agent.examples,
    model: agent.model,
    isActive: agent.isActive,
    isDefault: agent.isDefault,
    contactCount: agent._count?.contactAgents ?? 0,
    toolIds: extractToolKeys(agent.agentTools),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

export async function ensureDefaultAgent(userId: string): Promise<Agent> {
  const existing = await prisma.agent.findFirst({
    where: { userId, isDefault: true },
  });
  if (existing) return existing;

  const anyAgent = await prisma.agent.findFirst({ where: { userId } });
  if (anyAgent) {
    return prisma.agent.update({
      where: { id: anyAgent.id },
      data: { isDefault: true },
    });
  }

  return prisma.agent.create({
    data: {
      userId,
      ...DEFAULT_AGENT_SEED,
      isActive: true,
      isDefault: true,
      model: 'auto',
    },
  });
}

export async function listAgents(userId: string): Promise<AgentDto[]> {
  await ensureDefaultAgent(userId);
  const items = await prisma.agent.findMany({
    where: { userId },
    include: agentInclude,
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return items.map(toDto);
}

export async function getAgentById(userId: string, id: string): Promise<AgentDto | null> {
  const agent = await prisma.agent.findFirst({
    where: { id, userId },
    include: agentInclude,
  });
  return agent ? toDto(agent) : null;
}

export type UpsertAgentInput = {
  name: string;
  description?: string;
  objective?: string;
  instructions?: string;
  rules?: string;
  forbiddenRules?: string;
  examples?: string;
  model?: string;
  isActive?: boolean;
  toolIds?: string[];
};

export async function createAgent(userId: string, input: UpsertAgentInput): Promise<AgentDto> {
  await ensureDefaultAgent(userId);
  const agent = await prisma.agent.create({
    data: {
      userId,
      name: input.name.trim(),
      description: input.description ?? '',
      objective: input.objective ?? '',
      instructions: input.instructions ?? '',
      rules: input.rules ?? '',
      forbiddenRules: input.forbiddenRules ?? '',
      examples: input.examples ?? '',
      model: input.model ?? 'auto',
      isActive: input.isActive ?? true,
      isDefault: false,
    },
    include: agentInclude,
  });

  if (input.toolIds) {
    await syncAgentTools(userId, agent.id, input.toolIds);
    const refreshed = await prisma.agent.findFirst({
      where: { id: agent.id },
      include: agentInclude,
    });
    return toDto(refreshed!);
  }

  return toDto(agent);
}

export async function updateAgent(
  userId: string,
  id: string,
  input: UpsertAgentInput,
): Promise<AgentDto | null> {
  const existing = await prisma.agent.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description ?? '',
      objective: input.objective ?? '',
      instructions: input.instructions ?? '',
      rules: input.rules ?? '',
      forbiddenRules: input.forbiddenRules ?? '',
      examples: input.examples ?? '',
      model: input.model ?? existing.model,
      isActive: input.isActive ?? existing.isActive,
    },
    include: agentInclude,
  });

  if (input.toolIds) {
    await syncAgentTools(userId, id, input.toolIds);
    const refreshed = await prisma.agent.findFirst({
      where: { id },
      include: agentInclude,
    });
    return refreshed ? toDto(refreshed) : null;
  }

  return toDto(agent);
}

export async function deleteAgent(userId: string, id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const agent = await prisma.agent.findFirst({ where: { id, userId } });
  if (!agent) return { ok: false, reason: 'Agente não encontrado' };
  if (agent.isDefault) return { ok: false, reason: 'Não é possível excluir o agente padrão' };

  await prisma.agent.delete({ where: { id } });
  return { ok: true };
}

export async function setDefaultAgent(userId: string, id: string): Promise<AgentDto | null> {
  const agent = await prisma.agent.findFirst({ where: { id, userId } });
  if (!agent) return null;

  await prisma.$transaction([
    prisma.agent.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.agent.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);

  const updated = await prisma.agent.findFirst({
    where: { id },
    include: agentInclude,
  });
  return updated ? toDto(updated) : null;
}

export async function duplicateAgent(userId: string, id: string): Promise<AgentDto | null> {
  const source = await prisma.agent.findFirst({
    where: { id, userId },
    include: agentInclude,
  });
  if (!source) return null;

  const copy = await prisma.agent.create({
    data: {
      userId,
      name: source.name ? `${source.name} (cópia)` : 'Cópia',
      description: source.description,
      objective: source.objective,
      instructions: source.instructions,
      rules: source.rules,
      forbiddenRules: source.forbiddenRules,
      examples: source.examples,
      model: source.model,
      isActive: false,
      isDefault: false,
    },
    include: agentInclude,
  });

  const toolKeys = extractToolKeys(source.agentTools);
  if (toolKeys.length > 0) {
    await syncAgentTools(userId, copy.id, toolKeys);
    const refreshed = await prisma.agent.findFirst({
      where: { id: copy.id },
      include: agentInclude,
    });
    return refreshed ? toDto(refreshed) : null;
  }

  return toDto(copy);
}

export async function toggleAgentActive(userId: string, id: string): Promise<AgentDto | null> {
  const agent = await prisma.agent.findFirst({ where: { id, userId } });
  if (!agent) return null;
  if (agent.isDefault && agent.isActive) {
    return toDto(agent);
  }

  const updated = await prisma.agent.update({
    where: { id },
    data: { isActive: !agent.isActive },
    include: agentInclude,
  });
  return toDto(updated);
}

export async function getDefaultAgentRecord(userId: string): Promise<Agent> {
  return ensureDefaultAgent(userId);
}

export async function getAgentRecordById(userId: string, id: string): Promise<Agent | null> {
  return prisma.agent.findFirst({ where: { id, userId } });
}
