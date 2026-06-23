export const DEFAULT_AGENT_ID = 'agent-default-mobi';

export type AgentTab = 'perfil' | 'treinamento' | 'ferramentas' | 'teste';

export type PlatformAgent = {
  id: string;
  name: string;
  description: string;
  objective: string;
  instructions: string;
  rules: string;
  neverDo: string;
  exampleQuestions: string;
  exampleAnswers: string;
  model: string;
  active: boolean;
  contactCount: number;
  toolIds: string[];
  updatedAt: string;
};

export type PlatformContact = {
  id: string;
  name: string;
  phone: string;
  agentId: string | null;
  lastMessage: string;
  lastInteraction: string;
  status: 'ativo' | 'inativo' | 'pausado';
};

export type PlatformTool = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  lastSync: string | null;
};

export const MOCK_TOOLS: PlatformTool[] = [
  {
    id: 'bling',
    name: 'Bling',
    description: 'ERP e gestão de pedidos.',
    connected: false,
    lastSync: null,
  },
  {
    id: 'olist',
    name: 'Olist',
    description: 'Contas, orçamentos e dados operacionais.',
    connected: true,
    lastSync: '2026-06-22T12:00:00.000Z',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Canal de mensagens com contatos.',
    connected: true,
    lastSync: '2026-06-22T18:30:00.000Z',
  },
  {
    id: 'google-agenda',
    name: 'Google Agenda',
    description: 'Agendamentos e lembretes.',
    connected: false,
    lastSync: null,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Envio e leitura de e-mails.',
    connected: false,
    lastSync: null,
  },
  {
    id: 'webhook',
    name: 'Webhook / API própria',
    description: 'Integração customizada via HTTP.',
    connected: false,
    lastSync: null,
  },
];

export const MOCK_AGENTS: PlatformAgent[] = [
  {
    id: DEFAULT_AGENT_ID,
    name: 'Mobi',
    description: 'Agente padrão da plataforma — recepção e triagem inicial.',
    objective: 'Entender o motivo do contato e responder com clareza.',
    instructions: 'Cumprimente pelo nome. Faça uma pergunta por vez. Respostas curtas.',
    rules: 'Seja cordial. Confirme entendimento antes de avançar.',
    neverDo: 'Nunca invente dados. Nunca encaminhe para humano.',
    exampleQuestions: 'Como funciona?\nPreciso de ajuda\nQuero saber mais',
    exampleAnswers: 'Posso explicar em poucas linhas.\nClaro, me conta o que precisa.\nFico feliz em ajudar.',
    model: 'Qwen / Ollama',
    active: true,
    contactCount: 86,
    toolIds: ['whatsapp', 'olist'],
    updatedAt: '2026-06-22T14:30:00.000Z',
  },
  {
    id: 'agent-atlas',
    name: 'Atlas',
    description: 'Agente auxiliar para fluxos personalizados.',
    objective: 'Aprofundar conversas após a triagem inicial.',
    instructions: 'Mantenha tom profissional e objetivo.',
    rules: 'Uma pergunta por mensagem. Máximo 2 frases.',
    neverDo: 'Nunca prometa prazos sem confirmação.',
    exampleQuestions: 'Pode detalhar?\nQual o próximo passo?',
    exampleAnswers: 'Me conta um pouco mais.\nVamos seguir passo a passo.',
    model: 'Qwen / Ollama',
    active: true,
    contactCount: 24,
    toolIds: ['whatsapp'],
    updatedAt: '2026-06-20T09:15:00.000Z',
  },
  {
    id: 'agent-nova',
    name: 'Nova',
    description: 'Rascunho de agente em preparação.',
    objective: 'Atender contatos em canal específico.',
    instructions: 'Aguardando configuração final.',
    rules: '—',
    neverDo: '—',
    exampleQuestions: '',
    exampleAnswers: '',
    model: 'Qwen / Ollama',
    active: false,
    contactCount: 0,
    toolIds: [],
    updatedAt: '2026-06-18T16:45:00.000Z',
  },
];

export const MOCK_CONTACTS: PlatformContact[] = [
  {
    id: 'c1',
    name: 'João Silva',
    phone: '+55 11 98765-4321',
    agentId: 'agent-atlas',
    lastMessage: 'Preciso de mais informações',
    lastInteraction: '2026-06-22T18:20:00.000Z',
    status: 'ativo',
  },
  {
    id: 'c2',
    name: 'Maria Costa',
    phone: '+55 21 99876-5432',
    agentId: null,
    lastMessage: 'Olá, tudo bem?',
    lastInteraction: '2026-06-22T17:05:00.000Z',
    status: 'ativo',
  },
  {
    id: 'c3',
    name: 'Pedro Alves',
    phone: '+55 31 97654-3210',
    agentId: DEFAULT_AGENT_ID,
    lastMessage: 'Obrigado pela ajuda',
    lastInteraction: '2026-06-22T15:40:00.000Z',
    status: 'ativo',
  },
  {
    id: 'c4',
    name: 'Ana Souza',
    phone: '+55 41 96543-2109',
    agentId: null,
    lastMessage: 'Ainda aguardo retorno',
    lastInteraction: '2026-06-21T11:30:00.000Z',
    status: 'pausado',
  },
];

export function createEmptyAgent(): PlatformAgent {
  return {
    id: `agent-new-${Date.now()}`,
    name: 'Novo agente',
    description: '',
    objective: '',
    instructions: '',
    rules: '',
    neverDo: '',
    exampleQuestions: '',
    exampleAnswers: '',
    model: 'Qwen / Ollama',
    active: false,
    contactCount: 0,
    toolIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function agentLabel(agentId: string | null): string {
  if (!agentId) return 'Usa agente padrão';
  return MOCK_AGENTS.find((a) => a.id === agentId)?.name ?? 'Usa agente padrão';
}

export function defaultAgentName(): string {
  return MOCK_AGENTS.find((a) => a.id === DEFAULT_AGENT_ID)?.name ?? 'Mobi';
}

export function connectedToolsCount(): number {
  return MOCK_TOOLS.filter((t) => t.connected).length;
}

export function contactsWithAgentCount(): number {
  return MOCK_CONTACTS.filter((c) => c.agentId !== null).length;
}
