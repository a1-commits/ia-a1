import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { env } from '../../config/env';
import type { AiProvider, ChatMessage } from './aiProvider.types';

type OllamaResponse = {
  message?: { content?: string };
};

const OLLAMA_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

function postJson(url: string, payload: unknown): Promise<string> {
  const body = JSON.stringify(payload);
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = transport(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: OLLAMA_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Falha Ollama (${res.statusCode ?? 'sem status'})`));
            return;
          }
          resolve(text);
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout Ollama (resposta excedeu 15 minutos)'));
    });
    req.write(body);
    req.end();
  });
}

export function createOllamaProvider(): AiProvider | null {
  if (!env.OLLAMA_ENABLED) return null;
  const base = env.OLLAMA_BASE_URL.replace(/\/+$/, '');

  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const raw = await postJson(`${base}/api/chat`, {
        model: env.OLLAMA_MODEL,
        messages,
        stream: false,
      });
      const json = JSON.parse(raw) as OllamaResponse;
      const text = json.message?.content?.trim();
      if (!text) {
        throw new Error('Resposta vazia do Ollama');
      }
      return text;
    },
  };
}
