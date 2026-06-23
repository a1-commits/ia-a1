import { createOpenAiProvider } from './openAiProvider';
import { createOllamaProvider } from './ollamaProvider';
import type { AiProvider, ChatMessage } from './aiProvider.types';
import { env, isOpenAiConfigured } from '../../config/env';
import { prisma } from '../../lib/prisma';

export type AiRuntimeMode = 'real' | 'unavailable';
export type AiManualMode = 'real' | null;
export type AiProviderUsed = 'openai' | 'ollama' | 'none';
export type AiRoutingStrategy = 'local_only' | 'hybrid' | 'openai_only';

export type AiRuntimeStatus = {
  configured: boolean;
  localConfigured: boolean;
  mode: AiRuntimeMode;
  provider: AiProviderUsed;
  selectedMode: AiManualMode;
  strategy: AiRoutingStrategy;
  reason: string | null;
  updatedAt: string;
};

export class AiUnavailableError extends Error {
  status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

let manualMode: AiManualMode = null;
let routingStrategy: AiRoutingStrategy = 'local_only';
let lastSyncedUserId: string | null = null;
let lastSyncedSignature: string | null = null;

const AI_SETTING_MODE_KEY = 'AI_MANUAL_MODE';
const AI_SETTING_STRATEGY_KEY = 'AI_ROUTING_STRATEGY';

let runtimeStatus: AiRuntimeStatus = {
  configured: isOpenAiConfigured(),
  localConfigured: Boolean(env.OLLAMA_ENABLED),
  mode: 'unavailable',
  provider: 'none',
  selectedMode: manualMode,
  strategy: routingStrategy,
  reason: 'Inicializando provedor de IA',
  updatedAt: new Date().toISOString(),
};

function setStatus(mode: AiRuntimeMode, provider: AiProviderUsed, reason: string | null): void {
  runtimeStatus = {
    configured: isOpenAiConfigured(),
    localConfigured: Boolean(env.OLLAMA_ENABLED),
    mode,
    provider,
    selectedMode: manualMode,
    strategy: routingStrategy,
    reason,
    updatedAt: new Date().toISOString(),
  };
}

function failUnavailable(reason: string): never {
  setStatus('unavailable', 'none', reason);
  throw new AiUnavailableError(reason);
}

function getProviders(): { openAi: AiProvider | null; ollama: AiProvider | null } {
  return {
    openAi: createOpenAiProvider(),
    ollama: createOllamaProvider(),
  };
}

function explainOpenAiError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Falha desconhecida na OpenAI';
  }
  const maybe = error as { status?: number; code?: string; message?: string };
  if (maybe.status === 429 && maybe.code === 'insufficient_quota') {
    return 'OpenAI sem crédito (insufficient_quota)';
  }
  if (typeof maybe.message === 'string' && maybe.message.length > 0) {
    return `Falha OpenAI: ${maybe.message}`;
  }
  return 'Falha na chamada OpenAI';
}

function explainOllamaError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'Falha desconhecida no Ollama';
  const maybe = error as { message?: string };
  return maybe.message ? `Falha Ollama: ${maybe.message}` : 'Falha na chamada Ollama';
}

function shouldEscalateToOpenAi(messages: ChatMessage[]): boolean {
  const lastUser = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
  const text = lastUser.toLowerCase();
  return (
    lastUser.length > 500 ||
    /analisar|estratégia|plano detalhado|jurídico|contrato|financeiro|complexo|cálculo/.test(text)
  );
}

export function getAiRuntimeStatus(): AiRuntimeStatus {
  return runtimeStatus;
}

export function setAiManualMode(nextMode: AiManualMode): AiRuntimeStatus {
  manualMode = nextMode;
  if (manualMode === 'real') {
    if (isOpenAiConfigured()) {
      setStatus('real', 'openai', 'Modo manual: OpenAI forçada');
      return runtimeStatus;
    }
    if (env.OLLAMA_ENABLED) {
      setStatus('real', 'ollama', 'Modo manual: Ollama (OpenAI indisponível)');
      return runtimeStatus;
    }
    setStatus('unavailable', 'none', 'Modo real solicitado, mas nenhum provedor disponível');
    return runtimeStatus;
  }
  if (routingStrategy === 'local_only' && env.OLLAMA_ENABLED) {
    setStatus('real', 'ollama', null);
  } else if (isOpenAiConfigured()) {
    setStatus('real', 'openai', null);
  } else if (env.OLLAMA_ENABLED) {
    setStatus('real', 'ollama', null);
  } else {
    setStatus('unavailable', 'none', 'Sem provedor disponível (OpenAI/Ollama)');
  }
  return runtimeStatus;
}

export function setAiRoutingStrategy(next: AiRoutingStrategy): AiRuntimeStatus {
  routingStrategy = next;
  if (manualMode === null) {
    if (next === 'local_only') {
      setStatus(
        env.OLLAMA_ENABLED ? 'real' : 'unavailable',
        env.OLLAMA_ENABLED ? 'ollama' : 'none',
        env.OLLAMA_ENABLED ? null : 'Ollama desativado/indisponível',
      );
    } else if (next === 'openai_only') {
      setStatus(
        isOpenAiConfigured() ? 'real' : 'unavailable',
        isOpenAiConfigured() ? 'openai' : 'none',
        isOpenAiConfigured() ? null : 'OPENAI_API_KEY ausente',
      );
    } else {
      setStatus(
        env.OLLAMA_ENABLED || isOpenAiConfigured() ? 'real' : 'unavailable',
        env.OLLAMA_ENABLED ? 'ollama' : isOpenAiConfigured() ? 'openai' : 'none',
        env.OLLAMA_ENABLED || isOpenAiConfigured() ? null : 'Sem provedor disponível (OpenAI/Ollama)',
      );
    }
  }
  return runtimeStatus;
}

export async function saveAiRuntimePreference(input: {
  userId: string;
  mode: AiManualMode;
  strategy: AiRoutingStrategy;
}): Promise<void> {
  const { userId, mode, strategy } = input;
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: AI_SETTING_STRATEGY_KEY } },
    create: { userId, key: AI_SETTING_STRATEGY_KEY, value: strategy },
    update: { value: strategy },
  });
  if (mode === null) {
    await prisma.setting.deleteMany({
      where: { userId, key: AI_SETTING_MODE_KEY },
    });
  } else {
    await prisma.setting.upsert({
      where: { userId_key: { userId, key: AI_SETTING_MODE_KEY } },
      create: { userId, key: AI_SETTING_MODE_KEY, value: mode },
      update: { value: mode },
    });
  }
}

export async function syncAiRuntimePreference(userId: string): Promise<AiRuntimeStatus> {
  const items = await prisma.setting.findMany({
    where: {
      userId,
      key: { in: [AI_SETTING_MODE_KEY, AI_SETTING_STRATEGY_KEY] },
    },
    select: { key: true, value: true },
  });
  const modeRaw = items.find((x) => x.key === AI_SETTING_MODE_KEY)?.value ?? null;
  const strategyRaw = items.find((x) => x.key === AI_SETTING_STRATEGY_KEY)?.value ?? null;
  const mode: AiManualMode = modeRaw === 'real' ? 'real' : null;
  const strategy: AiRoutingStrategy =
    strategyRaw === 'openai_only' || strategyRaw === 'hybrid' || strategyRaw === 'local_only'
      ? strategyRaw
      : 'local_only';
  const signature = `${userId}|${mode ?? 'auto'}|${strategy}`;
  if (lastSyncedUserId === userId && lastSyncedSignature === signature) {
    return runtimeStatus;
  }
  manualMode = null;
  setAiRoutingStrategy(strategy);
  setAiManualMode(mode);
  lastSyncedUserId = userId;
  lastSyncedSignature = signature;
  return runtimeStatus;
}

export async function generateAssistantReply(messages: ChatMessage[]): Promise<string> {
  const { openAi, ollama } = getProviders();

  if (manualMode === 'real') {
    if (openAi) {
      try {
        const reply = await openAi.complete(messages);
        setStatus('real', 'openai', null);
        return reply;
      } catch (error) {
        if (ollama) {
          try {
            const localReply = await ollama.complete(messages);
            setStatus('real', 'ollama', `Fallback local após falha OpenAI: ${explainOpenAiError(error)}`);
            return localReply;
          } catch (localError) {
            failUnavailable(
              `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
            );
          }
        }
        failUnavailable(`Modo real manual: ${explainOpenAiError(error)}`);
      }
    }
    if (ollama) {
      try {
        const reply = await ollama.complete(messages);
        setStatus('real', 'ollama', 'Modo manual: Ollama (OpenAI indisponível)');
        return reply;
      } catch (error) {
        failUnavailable(explainOllamaError(error));
      }
    }
    failUnavailable('Modo real solicitado, mas nenhum provedor disponível');
  }

  if (routingStrategy === 'openai_only') {
    if (!openAi) {
      if (ollama) {
        try {
          const reply = await ollama.complete(messages);
          setStatus('real', 'ollama', 'OPENAI_API_KEY ausente; usando Ollama');
          return reply;
        } catch (error) {
          failUnavailable(explainOllamaError(error));
        }
      }
      failUnavailable('OPENAI_API_KEY ausente');
    }
    try {
      const reply = await openAi.complete(messages);
      setStatus('real', 'openai', null);
      return reply;
    } catch (error) {
      if (ollama) {
        try {
          const localReply = await ollama.complete(messages);
          setStatus('real', 'ollama', `Fallback local após falha OpenAI: ${explainOpenAiError(error)}`);
          return localReply;
        } catch (localError) {
          failUnavailable(
            `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
          );
        }
      }
      failUnavailable(explainOpenAiError(error));
    }
  }

  if (routingStrategy === 'local_only') {
    if (!ollama) {
      failUnavailable('Ollama desativado/indisponível');
    }
    try {
      const reply = await ollama.complete(messages);
      setStatus('real', 'ollama', null);
      return reply;
    } catch (error) {
      failUnavailable(explainOllamaError(error));
    }
  }

  const escalate = shouldEscalateToOpenAi(messages);
  if (escalate && openAi) {
    try {
      const reply = await openAi.complete(messages);
      setStatus('real', 'openai', 'Roteado para OpenAI (mensagem complexa)');
      return reply;
    } catch (error) {
      if (ollama) {
        try {
          const localReply = await ollama.complete(messages);
          setStatus('real', 'ollama', `Fallback local após falha OpenAI: ${explainOpenAiError(error)}`);
          return localReply;
        } catch (localError) {
          failUnavailable(
            `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
          );
        }
      }
      failUnavailable(explainOpenAiError(error));
    }
  }

  if (ollama) {
    try {
      const reply = await ollama.complete(messages);
      setStatus('real', 'ollama', null);
      return reply;
    } catch (error) {
      if (openAi) {
        try {
          const paidReply = await openAi.complete(messages);
          setStatus('real', 'openai', `Fallback OpenAI após falha Ollama: ${explainOllamaError(error)}`);
          return paidReply;
        } catch (paidError) {
          failUnavailable(
            `Falha Ollama (${explainOllamaError(error)}) e OpenAI (${explainOpenAiError(paidError)})`,
          );
        }
      }
      failUnavailable(explainOllamaError(error));
    }
  }

  if (openAi) {
    try {
      const paidReply = await openAi.complete(messages);
      setStatus('real', 'openai', 'Ollama indisponível; usando OpenAI');
      return paidReply;
    } catch (error) {
      failUnavailable(explainOpenAiError(error));
    }
  }

  failUnavailable('Sem provedor disponível (OpenAI/Ollama)');
}
