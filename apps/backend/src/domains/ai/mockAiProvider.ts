import type { AiProvider, ChatMessage } from './aiProvider.types';
import {
  MOBI_ROUTER_MARKER,
  readContactFirstNameFromPrompt,
  readRouterCategoryFromPrompt,
  readRouterPhaseFromPrompt,
} from '../chat/prompt.service';
import { getRouterCategoryLabel } from '../chat/router.service';

function lastUserMessage(messages: ChatMessage[]): string {
  return messages.filter((m) => m.role === 'user').pop()?.content ?? '';
}

function isRouterMobiPrompt(messages: ChatMessage[]): boolean {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  return system.includes(MOBI_ROUTER_MARKER);
}

function forwardReply(categoryLabel: string): string {
  return `Perfeito. Vou encaminhar você para ${categoryLabel}.`;
}

function routerOfflineReply(systemContent: string, lastUser: string): string {
  const firstName = readContactFirstNameFromPrompt(systemContent);
  const phase = readRouterPhaseFromPrompt(systemContent);
  const category = readRouterCategoryFromPrompt(systemContent);
  const text = lastUser.toLowerCase().trim();

  if (phase === 'encaminhar' && category) {
    return forwardReply(getRouterCategoryLabel(category));
  }

  if (/^oi|ol[aá]|bom dia|boa tarde|boa noite/.test(text)) {
    return firstName ? `Olá, ${firstName}! Como posso ajudar?` : 'Olá! Como posso ajudar?';
  }

  if (/pagamento|financeiro|boleto|pagar/.test(text)) {
    return forwardReply('atendimento financeiro');
  }
  if (/acesso|sistema|login|senha|suporte/.test(text)) {
    return forwardReply('suporte');
  }
  if (/comercial|compra|venda|produto|servico|proposta|cotacao/.test(text)) {
    return forwardReply('atendimento comercial');
  }

  if (phase === 'descobrir' || text.length > 3) {
    return 'Como posso ajudar?';
  }

  return firstName ? `Olá, ${firstName}! Como posso ajudar?` : 'Olá! Como posso ajudar?';
}

export function createMockAiProvider(): AiProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const last = lastUserMessage(messages);
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      if (isRouterMobiPrompt(messages)) {
        return routerOfflineReply(system, last);
      }
      return (
        `Recebi sua mensagem: "${last.slice(0, 500)}${last.length > 500 ? '…' : ''}"\n\n` +
        `Configure OPENAI_API_KEY ou verifique que Ollama está ativo (OLLAMA_ENABLED=true).`
      );
    },
  };
}
