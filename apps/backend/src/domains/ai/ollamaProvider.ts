import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { env } from '../../config/env';
import type { AiProvider, ChatMessage } from './aiProvider.types';

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
  error?: string;
  done?: boolean;
  done_reason?: string;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestText(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<string> {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = transport(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
        timeout: env.OLLAMA_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            const apiError = parseOllamaErrorBody(text);
            reject(new Error(apiError ?? `Falha Ollama (${res.statusCode ?? 'sem status'})`));
            return;
          }
          resolve(text);
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(
        new Error(
          `Timeout Ollama (resposta excedeu ${Math.round(env.OLLAMA_REQUEST_TIMEOUT_MS / 1000)}s)`,
        ),
      );
    });
    if (body) req.write(body);
    req.end();
  });
}

export function parseOllamaErrorBody(raw: string): string | null {
  try {
    const json = JSON.parse(raw) as { error?: string };
    return json.error?.trim() || null;
  } catch {
    return null;
  }
}

export function parseOllamaChatResponse(raw: string): string | null {
  let json: OllamaChatResponse;
  try {
    json = JSON.parse(raw) as OllamaChatResponse;
  } catch {
    return null;
  }

  if (json.error?.trim()) {
    throw new Error(json.error.trim());
  }

  const fromMessage = json.message?.content?.trim();
  if (fromMessage) return fromMessage;

  const fromResponse = json.response?.trim();
  if (fromResponse) return fromResponse;

  return null;
}

export function modelIsInstalled(tags: OllamaTagsResponse, model: string): boolean {
  const names = (tags.models ?? []).map((item) => item.name?.trim()).filter(Boolean) as string[];
  return names.some((name) => name === model || name.startsWith(`${model}:`) || model.startsWith(`${name}:`));
}

async function assertModelInstalled(base: string, model: string): Promise<void> {
  const raw = await requestText('GET', `${base}/api/tags`);
  const tags = JSON.parse(raw) as OllamaTagsResponse;
  if (!modelIsInstalled(tags, model)) {
    const available = (tags.models ?? [])
      .map((item) => item.name)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Modelo Ollama "${model}" não instalado${available ? `. Disponíveis: ${available}` : ''}`,
    );
  }
}

function logOllamaAttempt(input: {
  model: string;
  attempt: number;
  maxAttempts: number;
  outcome: 'success' | 'retry' | 'fail';
  detail?: string;
}): void {
  console.info(
    '[ollama]',
    JSON.stringify({
      model: input.model,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      outcome: input.outcome,
      detail: input.detail ?? null,
    }),
  );
}

async function completeOnce(base: string, model: string, messages: ChatMessage[]): Promise<string> {
  const raw = await requestText('POST', `${base}/api/chat`, {
    model,
    messages,
    stream: false,
  });
  const text = parseOllamaChatResponse(raw);
  if (!text) {
    throw new Error('Resposta vazia do Ollama');
  }
  return text;
}

export function createOllamaProvider(): AiProvider | null {
  if (!env.OLLAMA_ENABLED) return null;
  const base = env.OLLAMA_BASE_URL.replace(/\/+$/, '');
  const model = env.OLLAMA_MODEL;
  const maxAttempts = Math.max(1, env.OLLAMA_MAX_RETRIES + 1);

  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      await assertModelInstalled(base, model);

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const text = await completeOnce(base, model, messages);
          logOllamaAttempt({ model, attempt, maxAttempts, outcome: 'success' });
          return text;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Falha desconhecida no Ollama');
          const willRetry = attempt < maxAttempts;
          logOllamaAttempt({
            model,
            attempt,
            maxAttempts,
            outcome: willRetry ? 'retry' : 'fail',
            detail: lastError.message,
          });
          if (willRetry) {
            await sleep(700 * attempt);
          }
        }
      }

      throw lastError ?? new Error('Resposta vazia do Ollama');
    },
  };
}
