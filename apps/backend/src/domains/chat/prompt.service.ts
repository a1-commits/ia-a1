import type { ChatMessage } from '../ai/aiProvider.types';

export type AgentPromptChannel = 'web' | 'whatsapp_customer' | 'whatsapp_admin';

/** Marcador interno (mock offline). */
export const MOBI_MINIMAL_MARKER = 'Você é Mobi.';

/** Histórico curto enviado ao modelo no modo recepcionista. */
export const MINIMAL_HISTORY_MESSAGES = 8;

export const MOBI_MINIMAL_RECEPTIONIST_PROMPT =
  'Você é Mobi, recepcionista. Cumprimente (use nome se souber). 1 pergunta; máx 2 frases/25 palavras. Sem orçamento, preço, lead, score, IA ou textos longos. Encaminhe humano se preciso.';

const MOBI_ADMIN_SUPPLEMENT =
  'Operador (não cliente). Objetivo. Comandos WhatsApp: !pausar, !agente, !status.';

export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Estimativa ~4 chars/token (auditoria). */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildMinimalSystemPrompt(input: {
  channel?: AgentPromptChannel;
  contactDisplayName?: string | null;
}): string {
  const { channel = 'web', contactDisplayName } = input;
  const firstName = contactDisplayName?.trim()
    ? extractFirstName(contactDisplayName.trim())
    : null;
  const nameBit = firstName ? ` Nome: ${firstName}.` : '';
  const base = `${MOBI_MINIMAL_RECEPTIONIST_PROMPT}${nameBit}`;
  if (channel === 'whatsapp_admin') {
    return `${base} ${MOBI_ADMIN_SUPPLEMENT}`;
  }
  return base;
}

export function buildAgentPrompt(params: {
  conversationMessages: ChatMessage[];
  channel?: AgentPromptChannel;
  contactDisplayName?: string | null;
}): ChatMessage[] {
  const { conversationMessages, channel = 'web', contactDisplayName } = params;
  const systemContent = buildMinimalSystemPrompt({ channel, contactDisplayName });
  const trimmedHistory = conversationMessages.slice(-MINIMAL_HISTORY_MESSAGES);
  return [{ role: 'system', content: systemContent }, ...trimmedHistory];
}

/** @deprecated compat */
export const MOBI_SIMPLE_AGENT_PROMPT = MOBI_MINIMAL_RECEPTIONIST_PROMPT;

export function readContactFirstNameFromPrompt(systemContent: string): string | null {
  const match = systemContent.match(/\bNome:\s*(\S+)/i);
  if (!match?.[1]) return null;
  return extractFirstName(match[1]);
}
