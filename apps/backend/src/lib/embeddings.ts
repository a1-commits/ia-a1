import OpenAI from 'openai';
import { env, isOpenAiConfigured } from '../config/env';

const MODEL = 'text-embedding-3-small';

/** Gera embedding 1536-d (text-embedding-3-small). Retorna null se OpenAI não configurada ou erro. */
export async function embedText(text: string): Promise<number[] | null> {
  if (!isOpenAiConfigured()) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const res = await client.embeddings.create({
      model: MODEL,
      input: trimmed,
    });
    const vec = res.data[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  }
}
