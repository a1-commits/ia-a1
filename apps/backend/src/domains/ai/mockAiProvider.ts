import type { AiProvider, ChatMessage } from './aiProvider.types';

function lastUserMessage(messages: ChatMessage[]): string {
  return messages.filter((m) => m.role === 'user').pop()?.content ?? '';
}

function isSimpleMobiPrompt(messages: ChatMessage[]): boolean {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  return system.includes('Mobi, assistente virtual da Möble');
}

function simpleMobiOfflineReply(last: string): string {
  if (/orçamento|orcamento|cozinha|arm[aá]rio|projeto|m[oó]vel|marcenaria/i.test(last)) {
    return 'Olá! Sou a Mobi, da Möble Marcenaria. Vou anotar os detalhes para nossa equipe avaliar o orçamento. Para começar, qual é o seu nome?';
  }
  return 'Olá! Sou a Mobi, da Möble Marcenaria. Como posso te ajudar hoje?';
}

export function createMockAiProvider(): AiProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const last = lastUserMessage(messages);
      if (isSimpleMobiPrompt(messages)) {
        return simpleMobiOfflineReply(last);
      }
      return (
        `Recebi sua mensagem: "${last.slice(0, 500)}${last.length > 500 ? '…' : ''}"\n\n` +
        `Configure OPENAI_API_KEY ou verifique que Ollama está ativo (OLLAMA_ENABLED=true).`
      );
    },
  };
}
