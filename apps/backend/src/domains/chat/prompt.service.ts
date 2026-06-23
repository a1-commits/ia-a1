import type { ChatMessage } from '../ai/aiProvider.types';
import type { AgentInterpretation, RelatedContextBundle } from './agent.types';

export type AgentPromptChannel = 'web' | 'whatsapp_customer' | 'whatsapp_admin';

export type LeadPlaybookMode = 'default' | 'image_pending';

/** Marcador interno para detectar prompt neutro (ex.: mock offline). */
export const AGENT_NEUTRAL_MARKER = 'assistente virtual neutro';

export const EMPTY_RELATED_CONTEXT: RelatedContextBundle = {
  openTasks: [],
  recentMemories: [],
  founderProfileMemories: [],
  recentReflections: [],
  oneDriveSnippets: [],
  localKnowledgeSnippets: [],
};

export const AGENT_SYSTEM_PROMPT = [
  'Você é um assistente virtual neutro.',
  'Você ainda está em configuração e não representa nenhuma empresa, marca ou segmento específico.',
  'Seu papel é ajudar de forma simples, educada e objetiva.',
  'Faça uma pergunta por vez quando precisar de mais informações.',
  'Não invente fatos, preços, prazos, políticas ou dados que não foram informados.',
  'Se não souber algo, diga com clareza e ofereça encaminhar para um humano.',
  'Se a conversa ficar complexa, informe que pode encaminhar para um atendente humano.',
  'Não use lead score, readiness, análise interna ou termos técnicos com o usuário.',
  'Responda em português do Brasil, com tom natural e curto.',
  'Prefira 1 a 3 frases curtas. Não escreva textos longos nem listas extensas.',
  'Não mencione bastidores, motor interno, roteirização ou análises automáticas.',
  'Não assuma o assunto da conversa — siga o que o usuário disser.',
].join('\n');

/** @deprecated Use AGENT_SYSTEM_PROMPT — mantido por compatibilidade. */
export const MOBI_SIMPLE_AGENT_PROMPT = AGENT_SYSTEM_PROMPT;

const AGENT_ADMIN_SUPPLEMENT = [
  'Contexto: você está conversando com o operador/administrador do sistema (não é cliente final).',
  'Responda com objetividade. Para controlar o bot no WhatsApp: !pausar, !agente, !status.',
].join('\n');

const GENERIC_UNASSIGNED_RULES = [
  'Este contato ainda não tem um agente dedicado — você é o atendimento genérico inicial.',
  'Quando souber o nome da pessoa, cumprimente pelo primeiro nome na saudação (ex.: "Olá, Ana!").',
  'Se não souber o nome, cumprimente de forma cordial; se for natural, pergunte como prefere ser chamado(a).',
  'No início da conversa, seja acolhedor; depois, evite repetir saudações longas.',
  'Não presuma assunto comercial, orçamento ou tipo de serviço — responda só ao que a pessoa disser.',
].join('\n');

export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildGenericUnassignedSupplement(input: {
  contactDisplayName?: string | null;
  isFirstTurn?: boolean;
}): string {
  const firstName = input.contactDisplayName?.trim()
    ? extractFirstName(input.contactDisplayName.trim())
    : null;
  const nameLine = firstName
    ? `Nome do contato: ${firstName}`
    : 'Nome do contato: desconhecido';
  const turnLine = input.isFirstTurn
    ? 'Momento: início da conversa — use saudação cordial.'
    : 'Momento: conversa em andamento — responda direto ao assunto.';

  return [GENERIC_UNASSIGNED_RULES, nameLine, turnLine].join('\n');
}

export function buildAgentPrompt(params: {
  interpretation: AgentInterpretation;
  related: RelatedContextBundle;
  conversationMessages: ChatMessage[];
  channel?: AgentPromptChannel;
  customerContextMessage?: string | null;
  leadPlaybook?: unknown;
  playbookMode?: LeadPlaybookMode;
  /** Quando null/undefined, usa regras do agente genérico (sem agente dedicado). */
  assignedAgentId?: string | null;
  contactDisplayName?: string | null;
  isFirstTurn?: boolean;
}): ChatMessage[] {
  const {
    conversationMessages,
    channel = 'web',
    assignedAgentId = null,
    contactDisplayName,
    isFirstTurn,
  } = params;

  const parts = [AGENT_SYSTEM_PROMPT];

  if (channel === 'whatsapp_admin') {
    parts.push(AGENT_ADMIN_SUPPLEMENT);
  } else if (!assignedAgentId) {
    parts.push(buildGenericUnassignedSupplement({ contactDisplayName, isFirstTurn }));
  }

  const systemContent = parts.join('\n\n');

  return [{ role: 'system', content: systemContent }, ...conversationMessages];
}

/** Extrai primeiro nome do bloco de prompt genérico (uso em mock offline). */
export function readContactFirstNameFromPrompt(systemContent: string): string | null {
  const match = systemContent.match(/Nome do contato:\s*(.+)/i);
  if (!match?.[1]) return null;
  const raw = match[1].trim();
  if (!raw || /desconhecido/i.test(raw)) return null;
  return extractFirstName(raw);
}
