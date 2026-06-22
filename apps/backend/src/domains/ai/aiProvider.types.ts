export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface AiProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}
