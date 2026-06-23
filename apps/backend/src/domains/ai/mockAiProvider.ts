import type { AiProvider, ChatMessage } from './aiProvider.types';
import {
  MOBI_MINIMAL_MARKER,
  readContactFirstNameFromPrompt,
} from '../chat/prompt.service';

function lastUserMessage(messages: ChatMessage[]): string {
  return messages.filter((m) => m.role === 'user').pop()?.content ?? '';
}

function isMinimalMobiPrompt(messages: ChatMessage[]): boolean {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  return system.includes(MOBI_MINIMAL_MARKER);
}

function minimalOfflineReply(systemContent: string, lastUser: string): string {
  const firstName = readContactFirstNameFromPrompt(systemContent);
  const text = lastUser.toLowerCase();
  if (/^oi|ol[aá]|bom dia|boa tarde|boa noite/.test(text.trim())) {
    return firstName ? `Olá, ${firstName}! Como posso ajudar?` : 'Olá! Como posso ajudar?';
  }
  if (/projeto/.test(text)) {
    return 'Perfeito. Qual ambiente você deseja projetar?';
  }
  if (/cozinha|quarto|sala|banheiro|closet/.test(text)) {
    return 'Ótimo. Você já possui medidas do ambiente?';
  }
  return firstName ? `Olá, ${firstName}! Como posso ajudar?` : 'Olá! Como posso ajudar?';
}

export function createMockAiProvider(): AiProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const last = lastUserMessage(messages);
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      if (isMinimalMobiPrompt(messages)) {
        return minimalOfflineReply(system, last);
      }
      return (
        `Recebi sua mensagem: "${last.slice(0, 500)}${last.length > 500 ? '…' : ''}"\n\n` +
        `Configure OPENAI_API_KEY ou verifique que Ollama está ativo (OLLAMA_ENABLED=true).`
      );
    },
  };
}
