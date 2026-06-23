import type { AiProvider, ChatMessage } from './aiProvider.types';
import {
  AGENT_NEUTRAL_MARKER,
  readContactFirstNameFromPrompt,
} from '../chat/prompt.service';

function lastUserMessage(messages: ChatMessage[]): string {
  return messages.filter((m) => m.role === 'user').pop()?.content ?? '';
}

function isNeutralAgentPrompt(messages: ChatMessage[]): boolean {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  return system.includes(AGENT_NEUTRAL_MARKER);
}

function neutralOfflineReply(systemContent: string): string {
  const firstName = readContactFirstNameFromPrompt(systemContent);
  if (firstName) {
    return `Olá, ${firstName}! Como posso ajudar?`;
  }
  return 'Olá! Como posso ajudar?';
}

export function createMockAiProvider(): AiProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const last = lastUserMessage(messages);
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      if (isNeutralAgentPrompt(messages)) {
        return neutralOfflineReply(system);
      }
      return (
        `Recebi sua mensagem: "${last.slice(0, 500)}${last.length > 500 ? '…' : ''}"\n\n` +
        `Configure OPENAI_API_KEY ou verifique que Ollama está ativo (OLLAMA_ENABLED=true).`
      );
    },
  };
}
