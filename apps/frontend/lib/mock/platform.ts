export type PlatformAgent = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  contactCount: number;
  model: string;
  updatedAt: string;
};

export type PlatformContact = {
  id: string;
  name: string;
  phone: string;
  agentId: string;
  lastInteraction: string;
};

export type AgentTrainingDraft = {
  name: string;
  objective: string;
  personality: string;
  requiredRules: string;
  neverDo: string;
  exampleQuestions: string;
  exampleAnswers: string;
  finalPrompt: string;
};

export const MOCK_AGENTS: PlatformAgent[] = [
  {
    id: 'mobi-default',
    name: 'Mobi',
    description: 'Recepcionista genérica — primeiro contato e triagem de conversas.',
    active: true,
    contactCount: 128,
    model: 'Qwen / Ollama',
    updatedAt: '2026-06-22T14:30:00.000Z',
  },
  {
    id: 'agent-financeiro',
    name: 'Agente Financeiro',
    description: 'Responde dúvidas sobre pagamentos, boletos e faturas.',
    active: true,
    contactCount: 34,
    model: 'Qwen / Ollama',
    updatedAt: '2026-06-20T09:15:00.000Z',
  },
  {
    id: 'agent-suporte',
    name: 'Agente Suporte',
    description: 'Ajuda com acesso, login e problemas técnicos.',
    active: false,
    contactCount: 19,
    model: 'Qwen / Ollama',
    updatedAt: '2026-06-18T16:45:00.000Z',
  },
];

export const MOCK_CONTACTS: PlatformContact[] = [
  {
    id: 'c1',
    name: 'João Silva',
    phone: '+55 11 98765-4321',
    agentId: 'agent-financeiro',
    lastInteraction: '2026-06-22T18:20:00.000Z',
  },
  {
    id: 'c2',
    name: 'Maria Costa',
    phone: '+55 21 99876-5432',
    agentId: 'agent-financeiro',
    lastInteraction: '2026-06-22T17:05:00.000Z',
  },
  {
    id: 'c3',
    name: 'Pedro Alves',
    phone: '+55 31 97654-3210',
    agentId: 'mobi-default',
    lastInteraction: '2026-06-22T15:40:00.000Z',
  },
  {
    id: 'c4',
    name: 'Ana Souza',
    phone: '+55 41 96543-2109',
    agentId: 'mobi-default',
    lastInteraction: '2026-06-21T11:30:00.000Z',
  },
];

export const DEFAULT_TRAINING_DRAFT: AgentTrainingDraft = {
  name: 'Novo agente',
  objective: 'Atender contatos com clareza e objetividade.',
  personality: 'Cordial, direta e profissional.',
  requiredRules: 'Cumprimente pelo nome. Faça uma pergunta por vez. Respostas curtas.',
  neverDo: 'Nunca prometa prazos. Nunca invente informações. Nunca encaminhe para humano.',
  exampleQuestions: 'Como funciona?\nQuanto custa?\nPosso falar com alguém?',
  exampleAnswers: 'Posso explicar em poucas linhas.\nDepende do seu caso — me conta mais?\nClaro, estou aqui para ajudar.',
  finalPrompt: '',
};

export function agentNameById(agentId: string): string {
  return MOCK_AGENTS.find((a) => a.id === agentId)?.name ?? 'Mobi';
}

export function buildFinalPrompt(draft: AgentTrainingDraft): string {
  return [
    `Você é ${draft.name}.`,
    `Objetivo: ${draft.objective}`,
    `Personalidade: ${draft.personality}`,
    `Regras: ${draft.requiredRules}`,
    `Nunca: ${draft.neverDo}`,
  ].join('\n');
}
