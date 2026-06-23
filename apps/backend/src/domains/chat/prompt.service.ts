import type { ChatMessage } from '../ai/aiProvider.types';
import type { RouterCategory, RouterPhase } from './router.service';
import { getRouterCategoryLabel } from './router.service';

export type AgentPromptChannel = 'web' | 'whatsapp_customer' | 'whatsapp_admin';

/** Marcador interno (mock offline). */
export const MOBI_ROUTER_MARKER = 'Você é Mobi, recepcionista roteadora.';

/** Histórico enviado ao modelo no modo router (MOBI-ROUTER-AGENT-1). */
export const ROUTER_HISTORY_MESSAGES = 4;

/** @deprecated Use ROUTER_HISTORY_MESSAGES */
export const MINIMAL_HISTORY_MESSAGES = ROUTER_HISTORY_MESSAGES;

export const MOBI_ROUTER_PROMPT =
  'Você é Mobi, recepcionista roteadora. Só cumprimente, descubra assunto, classifique (marcenaria|financeiro|suporte|administrativo|geral) e encaminhe. Não resolve, venda, consulte ou analise. 1 pergunta; máx 2 frases/25 palavras.';

/** @deprecated */
export const MOBI_MINIMAL_MARKER = MOBI_ROUTER_MARKER;

/** @deprecated */
export const MOBI_MINIMAL_RECEPTIONIST_PROMPT = MOBI_ROUTER_PROMPT;

const MOBI_ADMIN_SUPPLEMENT =
  'Operador (não cliente). Comandos WhatsApp: !pausar, !agente, !status.';

export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildRouterSystemPrompt(input: {
  channel?: AgentPromptChannel;
  contactDisplayName?: string | null;
  routerPhase: RouterPhase;
  routerCategory: RouterCategory | null;
}): string {
  const { channel = 'web', contactDisplayName, routerPhase, routerCategory } = input;
  const firstName = contactDisplayName?.trim()
    ? extractFirstName(contactDisplayName.trim())
    : null;
  const nameBit = firstName ? ` Nome: ${firstName}.` : '';
  const phaseBit = ` Fase: ${routerPhase}.`;
  const categoryBit = routerCategory
    ? ` Categoria: ${routerCategory}. Encaminhe para ${getRouterCategoryLabel(routerCategory)}.`
    : ' Categoria: indefinida.';

  const base = `${MOBI_ROUTER_PROMPT}${nameBit}${phaseBit}${categoryBit}`;
  if (channel === 'whatsapp_admin') {
    return `${base} ${MOBI_ADMIN_SUPPLEMENT}`;
  }
  return base;
}

export function buildAgentPrompt(params: {
  conversationMessages: ChatMessage[];
  channel?: AgentPromptChannel;
  contactDisplayName?: string | null;
  routerPhase: RouterPhase;
  routerCategory: RouterCategory | null;
}): ChatMessage[] {
  const {
    conversationMessages,
    channel = 'web',
    contactDisplayName,
    routerPhase,
    routerCategory,
  } = params;
  const systemContent = buildRouterSystemPrompt({
    channel,
    contactDisplayName,
    routerPhase,
    routerCategory,
  });
  const trimmedHistory = conversationMessages.slice(-ROUTER_HISTORY_MESSAGES);
  return [{ role: 'system', content: systemContent }, ...trimmedHistory];
}

/** @deprecated compat */
export const MOBI_SIMPLE_AGENT_PROMPT = MOBI_ROUTER_PROMPT;

export function readContactFirstNameFromPrompt(systemContent: string): string | null {
  const match = systemContent.match(/\bNome:\s*(\S+)/i);
  if (!match?.[1]) return null;
  return extractFirstName(match[1]);
}

export function readRouterPhaseFromPrompt(systemContent: string): RouterPhase | null {
  const match = systemContent.match(/\bFase:\s*(cumprimentar|descobrir|encaminhar)/i);
  return (match?.[1]?.toLowerCase() as RouterPhase) ?? null;
}

export function readRouterCategoryFromPrompt(systemContent: string): RouterCategory | null {
  const match = systemContent.match(/\bCategoria:\s*(\w+)/i);
  const raw = match?.[1]?.toLowerCase();
  if (!raw || raw === 'indefinida') return null;
  if (raw === 'marcenaria' || raw === 'financeiro' || raw === 'suporte' || raw === 'administrativo' || raw === 'geral') {
    return raw;
  }
  return null;
}
