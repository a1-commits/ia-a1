import type { Agent, ToolConnection } from '@prisma/client';

export type AgentWithRelations = Agent & {
  _count?: { contactAgents: number };
  agentTools?: Array<{ tool: ToolConnection }>;
};

export type AgentDto = {
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

export const DEFAULT_AGENT_SEED = {
  name: 'Mobi',
  description: 'Agente padrão da plataforma.',
  objective: 'Atender contatos de forma cordial e descobrir como ajudar.',
  instructions:
    'Cumprimente a pessoa pelo nome quando souber. Faça uma pergunta por vez. Responda de forma clara e objetiva.',
  rules: 'Mantenha respostas curtas (até 2 frases quando possível).',
  forbiddenRules: 'Não invente informações. Não prometa o que não pode cumprir.',
  examples: '',
};
