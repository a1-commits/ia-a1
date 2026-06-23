import type { PlatformAgent } from '@/types/platform';

const STORAGE_KEY = 'mobi.agents.v1';

function readAll(): PlatformAgent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlatformAgent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(agents: PlatformAgent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function listAgents(): PlatformAgent[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listActiveAgents(): PlatformAgent[] {
  return listAgents().filter((a) => a.active);
}

export function countAgents(): number {
  return readAll().length;
}

export function countActiveAgents(): number {
  return listActiveAgents().length;
}

export function getAgent(id: string): PlatformAgent | null {
  return readAll().find((a) => a.id === id) ?? null;
}

export function createEmptyAgent(): PlatformAgent {
  return {
    id: `agent-${Date.now()}`,
    name: '',
    description: '',
    objective: '',
    instructions: '',
    rules: '',
    neverDo: '',
    exampleQuestions: '',
    exampleAnswers: '',
    model: 'Qwen / Ollama',
    active: true,
    contactCount: 0,
    toolIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function saveAgent(agent: PlatformAgent): PlatformAgent {
  const all = readAll();
  const idx = all.findIndex((a) => a.id === agent.id);
  const next = { ...agent, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  writeAll(all);
  return next;
}

export function deleteAgent(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}

export function duplicateAgent(id: string): PlatformAgent | null {
  const source = getAgent(id);
  if (!source) return null;
  const copy: PlatformAgent = {
    ...source,
    id: `agent-${Date.now()}`,
    name: source.name ? `${source.name} (cópia)` : 'Cópia',
    active: false,
    contactCount: 0,
    updatedAt: new Date().toISOString(),
  };
  saveAgent(copy);
  return copy;
}

export function agentLabel(agentId: string | null): string {
  if (!agentId) return 'Usa agente padrão';
  return getAgent(agentId)?.name ?? 'Usa agente padrão';
}
