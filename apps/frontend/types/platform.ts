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

export type PlatformTool = {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  lastSync: string | null;
  settingsHref?: string;
};

export const TOOL_CATALOG: Array<{ id: string; name: string; description: string; settingsHref?: string }> = [
  { id: 'bling', name: 'Bling', description: 'ERP e gestão de pedidos.', settingsHref: '/settings' },
  { id: 'olist', name: 'Olist', description: 'Contas, orçamentos e dados operacionais.', settingsHref: '/settings' },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Canal de mensagens com contatos.', settingsHref: '/settings' },
  { id: 'google-agenda', name: 'Google Agenda', description: 'Agendamentos e lembretes.', settingsHref: '/settings' },
  { id: 'gmail', name: 'Gmail', description: 'Envio e leitura de e-mails.', settingsHref: '/settings' },
  { id: 'webhook', name: 'Webhook / API própria', description: 'Integração customizada via HTTP.', settingsHref: '/settings' },
];
