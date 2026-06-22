import type { AiProvider, ChatMessage } from './aiProvider.types';

export function createMockAiProvider(): AiProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const last = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
      return (
        `[modo offline — sem provedor de IA disponível]\n\n` +
        `Recebi sua mensagem: "${last.slice(0, 500)}${last.length > 500 ? '…' : ''}"\n\n` +
        `Configure OPENAI_API_KEY ou verifique que Ollama está ativo (OLLAMA_ENABLED=true).`
      );
    },
  };
}
