import type { ChatMessage } from '../ai/aiProvider.types';
import type { AgentInterpretation, RelatedContextBundle } from './agent.types';

export type AgentPromptChannel = 'web' | 'whatsapp_customer' | 'whatsapp_admin';

export type LeadPlaybookMode = 'default' | 'image_pending';

export const EMPTY_RELATED_CONTEXT: RelatedContextBundle = {
  openTasks: [],
  recentMemories: [],
  founderProfileMemories: [],
  recentReflections: [],
  oneDriveSnippets: [],
  localKnowledgeSnippets: [],
};

export const MOBI_SIMPLE_AGENT_PROMPT = [
  'Você é a Mobi, assistente virtual da Möble Marcenaria.',
  'Seu papel é atender clientes de forma simples, educada e objetiva.',
  'Você ainda está aprendendo.',
  'Faça uma pergunta por vez.',
  'Colete nome, cidade, ambiente desejado, medidas aproximadas, prazo e referências.',
  'Nunca invente preço.',
  'Nunca prometa orçamento automático.',
  'Quando o cliente pedir orçamento, diga que vai coletar as informações para a equipe avaliar.',
  'Se a conversa ficar complexa, informe que vai encaminhar para um atendente humano.',
  'Não use lead score, readiness, análise interna ou termos técnicos com o cliente.',
  'Responda em português do Brasil, com tom natural, curto e comercial.',
  'Prefira 1 a 3 frases curtas. Não escreva textos longos nem listas extensas.',
  'Não mencione bastidores, motor interno, roteirização ou análises automáticas.',
].join('\n');

const MOBI_ADMIN_SUPPLEMENT = [
  'Contexto: você está conversando com o operador/gestor da Möble (não é cliente).',
  'Responda com objetividade. Para controlar o bot no WhatsApp: !pausar, !agente, !status.',
].join('\n');

export function buildAgentPrompt(params: {
  interpretation: AgentInterpretation;
  related: RelatedContextBundle;
  conversationMessages: ChatMessage[];
  channel?: AgentPromptChannel;
  customerContextMessage?: string | null;
  leadPlaybook?: unknown;
  playbookMode?: LeadPlaybookMode;
}): ChatMessage[] {
  const { conversationMessages, channel = 'web' } = params;

  const systemContent =
    channel === 'whatsapp_admin'
      ? `${MOBI_SIMPLE_AGENT_PROMPT}\n\n${MOBI_ADMIN_SUPPLEMENT}`
      : MOBI_SIMPLE_AGENT_PROMPT;

  return [{ role: 'system', content: systemContent }, ...conversationMessages];
}
