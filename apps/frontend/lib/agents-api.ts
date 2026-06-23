import { api } from '@/lib/api';
import type { PlatformAgent } from '@/types/platform';

type AgentDto = {
  id: string;
  name: string;
  description: string;
  objective: string;
  instructions: string;
  rules: string;
  forbiddenRules: string;
  examples: string;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  contactCount: number;
  toolIds: string[];
  createdAt: string;
  updatedAt: string;
};

function toPlatform(dto: AgentDto): PlatformAgent {
  const parts = dto.examples.split('\n---\n');
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    objective: dto.objective,
    instructions: dto.instructions,
    rules: dto.rules,
    neverDo: dto.forbiddenRules,
    exampleQuestions: parts[0] ?? '',
    exampleAnswers: parts[1] ?? '',
    model: dto.model,
    active: dto.isActive,
    isDefault: dto.isDefault,
    contactCount: dto.contactCount,
    toolIds: dto.toolIds,
    updatedAt: dto.updatedAt,
  };
}

function toPayload(agent: PlatformAgent) {
  const examples = [agent.exampleQuestions.trim(), agent.exampleAnswers.trim()]
    .filter(Boolean)
    .join('\n---\n');
  return {
    name: agent.name,
    description: agent.description,
    objective: agent.objective,
    instructions: agent.instructions,
    rules: agent.rules,
    forbiddenRules: agent.neverDo,
    examples,
    model: agent.model,
    isActive: agent.active,
    toolIds: agent.toolIds,
  };
}

export function createEmptyAgent(): PlatformAgent {
  return {
    id: '',
    name: '',
    description: '',
    objective: '',
    instructions: '',
    rules: '',
    neverDo: '',
    exampleQuestions: '',
    exampleAnswers: '',
    model: 'auto',
    active: true,
    isDefault: false,
    contactCount: 0,
    toolIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function listAgents(): Promise<PlatformAgent[]> {
  const res = await api<{ items: AgentDto[] }>('/api/agents');
  return res.items.map(toPlatform);
}

export async function getAgent(id: string): Promise<PlatformAgent | null> {
  try {
    const dto = await api<AgentDto>(`/api/agents/${id}`);
    return toPlatform(dto);
  } catch {
    return null;
  }
}

export async function saveAgent(agent: PlatformAgent): Promise<PlatformAgent> {
  const payload = toPayload(agent);
  if (agent.id) {
    const dto = await api<AgentDto>(`/api/agents/${agent.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return toPlatform(dto);
  }
  const dto = await api<AgentDto>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return toPlatform(dto);
}

export async function deleteAgent(id: string): Promise<void> {
  await api(`/api/agents/${id}`, { method: 'DELETE' });
}

export async function duplicateAgent(id: string): Promise<PlatformAgent | null> {
  try {
    const dto = await api<AgentDto>(`/api/agents/${id}/duplicate`, { method: 'POST' });
    return toPlatform(dto);
  } catch {
    return null;
  }
}

export async function toggleAgentActive(id: string): Promise<PlatformAgent | null> {
  try {
    const dto = await api<AgentDto>(`/api/agents/${id}/active`, { method: 'PATCH' });
    return toPlatform(dto);
  } catch {
    return null;
  }
}

export async function setDefaultAgent(id: string): Promise<PlatformAgent | null> {
  try {
    const dto = await api<AgentDto>(`/api/agents/${id}/default`, { method: 'PATCH' });
    return toPlatform(dto);
  } catch {
    return null;
  }
}

export async function countAgents(): Promise<number> {
  const items = await listAgents();
  return items.length;
}

export async function countActiveAgents(): Promise<number> {
  const items = await listAgents();
  return items.filter((a) => a.active).length;
}

export async function listActiveAgents(): Promise<PlatformAgent[]> {
  const items = await listAgents();
  return items.filter((a) => a.active);
}

export function agentLabel(agentId: string | null, agents: PlatformAgent[]): string {
  if (!agentId) return 'Usa agente padrão';
  return agents.find((a) => a.id === agentId)?.name ?? 'Usa agente padrão';
}
