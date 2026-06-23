import type { ChatMessage } from '../ai/aiProvider.types';
import type { Agent } from '@prisma/client';
import type { AgentPromptChannel } from '../chat/prompt.service';
import { extractFirstName, ROUTER_HISTORY_MESSAGES } from '../chat/prompt.service';

const WEB_ADMIN_SUPPLEMENT =
  'Operador (não cliente). Comandos WhatsApp: !pausar, !agente, !status.';

export function buildDynamicAgentPrompt(input: {
  agent: Agent;
  conversationMessages: ChatMessage[];
  channel?: AgentPromptChannel;
  contactDisplayName?: string | null;
}): ChatMessage[] {
  const { agent, conversationMessages, channel = 'web', contactDisplayName } = input;

  const sections: string[] = [`Você é ${agent.name}.`];

  if (agent.description.trim()) sections.push(`Descrição: ${agent.description.trim()}`);
  if (agent.objective.trim()) sections.push(`Objetivo: ${agent.objective.trim()}`);
  if (agent.instructions.trim()) sections.push(`Instruções: ${agent.instructions.trim()}`);
  if (agent.rules.trim()) sections.push(`Regras: ${agent.rules.trim()}`);
  if (agent.forbiddenRules.trim()) sections.push(`Nunca faça: ${agent.forbiddenRules.trim()}`);
  if (agent.examples.trim()) sections.push(`Exemplos:\n${agent.examples.trim()}`);

  const firstName = contactDisplayName?.trim()
    ? extractFirstName(contactDisplayName.trim())
    : null;
  if (firstName) sections.push(`Nome do contato: ${firstName}.`);

  sections.push('Responda de forma natural, clara e no idioma do contato.');

  if (channel === 'whatsapp_admin') {
    sections.push(WEB_ADMIN_SUPPLEMENT);
  }

  const systemContent = sections.join('\n\n');
  const trimmedHistory = conversationMessages.slice(-ROUTER_HISTORY_MESSAGES);
  return [{ role: 'system', content: systemContent }, ...trimmedHistory];
}
