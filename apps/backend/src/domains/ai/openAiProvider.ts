import OpenAI from 'openai';
import { env, isOpenAiConfigured } from '../../config/env';
import type { AiProvider, ChatMessage } from './aiProvider.types';

export function createOpenAiProvider(): AiProvider | null {
  if (!isOpenAiConfigured()) {
    return null;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const res = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages,
      });
      const text = res.choices[0]?.message?.content;
      if (!text) {
        throw new Error('Resposta vazia do modelo');
      }
      return text;
    },
  };
}
