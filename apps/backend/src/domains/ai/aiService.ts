import { createMockAiProvider } from './mockAiProvider';
import { createOpenAiProvider } from './openAiProvider';
import { createOllamaProvider } from './ollamaProvider';
import type { AiProvider, ChatMessage } from './aiProvider.types';
import { env, isOpenAiConfigured } from '../../config/env';
import { prisma } from '../../lib/prisma';

export type AiRuntimeMode = 'real' | 'mock';
export type AiManualMode = AiRuntimeMode | null;
export type AiProviderUsed = 'openai' | 'ollama' | 'mock';
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

let manualMode: AiManualMode = null;
let routingStrategy: AiRoutingStrategy = 'local_only';
let lastSyncedUserId: string | null = null;
let lastSyncedSignature: string | null = null;

const AI_SETTING_MODE_KEY = 'AI_MANUAL_MODE';
const AI_SETTING_STRATEGY_KEY = 'AI_ROUTING_STRATEGY';

let runtimeStatus: AiRuntimeStatus = {
  configured: isOpenAiConfigured(),
  localConfigured: Boolean(env.OLLAMA_ENABLED),
  mode: 'mock',
  provider: 'mock',
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

function getProviders(): { openAi: AiProvider | null; ollama: AiProvider | null; mock: AiProvider } {
  return {
    openAi: createOpenAiProvider(),
    ollama: createOllamaProvider(),
    mock: createMockAiProvider(),
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
  if (manualMode === 'mock') {
    setStatus('mock', 'mock', 'Modo manual: simulação forçada');
    return runtimeStatus;
  }
  if (manualMode === 'real') {
    if (isOpenAiConfigured()) {
      setStatus('real', 'openai', 'Modo manual: OpenAI forçada');
      return runtimeStatus;
    }
    if (env.OLLAMA_ENABLED) {
      setStatus('real', 'ollama', 'Modo manual: Ollama (OpenAI indisponível)');
      return runtimeStatus;
    }
    setStatus('mock', 'mock', 'Modo real solicitado, mas nenhum provedor disponível');
    return runtimeStatus;
  }
  if (routingStrategy === 'local_only' && env.OLLAMA_ENABLED) {
    setStatus('real', 'ollama', null);
  } else if (isOpenAiConfigured()) {
    setStatus('real', 'openai', null);
  } else {
    setStatus('mock', 'mock', 'Sem provedor disponível (OpenAI/Ollama)');
  }
  return runtimeStatus;
}

export function setAiRoutingStrategy(next: AiRoutingStrategy): AiRuntimeStatus {
  routingStrategy = next;
  if (manualMode === null) {
    if (next === 'local_only') {
      setStatus(env.OLLAMA_ENABLED ? 'real' : 'mock', env.OLLAMA_ENABLED ? 'ollama' : 'mock', env.OLLAMA_ENABLED ? null : 'Ollama desativado/indisponível');
    } else if (next === 'openai_only') {
      setStatus(isOpenAiConfigured() ? 'real' : 'mock', isOpenAiConfigured() ? 'openai' : 'mock', isOpenAiConfigured() ? null : 'OPENAI_API_KEY ausente');
    } else {
      setStatus(
        env.OLLAMA_ENABLED || isOpenAiConfigured() ? 'real' : 'mock',
        env.OLLAMA_ENABLED ? 'ollama' : isOpenAiConfigured() ? 'openai' : 'mock',
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
  const mode: AiManualMode = modeRaw === 'real' || modeRaw === 'mock' ? modeRaw : null;
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
  const { openAi, ollama, mock } = getProviders();
  if (manualMode === 'mock') {
    setStatus('mock', 'mock', 'Modo manual: simulação forçada');
    return mock.complete(messages);
  }

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
            setStatus(
              'mock',
              'mock',
              `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
            );
            return mock.complete(messages);
          }
        }
        setStatus('mock', 'mock', `Modo real manual com fallback: ${explainOpenAiError(error)}`);
        return mock.complete(messages);
      }
    }
    if (ollama) {
      try {
        const reply = await ollama.complete(messages);
        setStatus('real', 'ollama', 'Modo manual: Ollama (OpenAI indisponível)');
        return reply;
      } catch (error) {
        setStatus('mock', 'mock', explainOllamaError(error));
        return mock.complete(messages);
      }
    }
    setStatus('mock', 'mock', 'Modo real solicitado, mas nenhum provedor disponível');
    return mock.complete(messages);
  }

  if (routingStrategy === 'openai_only') {
    if (!openAi) {
      if (ollama) {
        try {
          const reply = await ollama.complete(messages);
          setStatus('real', 'ollama', 'OPENAI_API_KEY ausente; usando Ollama');
          return reply;
        } catch (error) {
          setStatus('mock', 'mock', explainOllamaError(error));
          return mock.complete(messages);
        }
      }
      setStatus('mock', 'mock', 'OPENAI_API_KEY ausente');
      return mock.complete(messages);
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
          setStatus(
            'mock',
            'mock',
            `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
          );
          return mock.complete(messages);
        }
      }
      setStatus('mock', 'mock', explainOpenAiError(error));
      return mock.complete(messages);
    }
  }

  if (routingStrategy === 'local_only') {
    if (!ollama) {
      setStatus('mock', 'mock', 'Ollama desativado/indisponível');
      return mock.complete(messages);
    }
    try {
      const reply = await ollama.complete(messages);
      setStatus('real', 'ollama', null);
      return reply;
    } catch (error) {
      setStatus('mock', 'mock', explainOllamaError(error));
      return mock.complete(messages);
    }
  }

  // hybrid: usa Ollama por padrão e escala para OpenAI quando a pergunta parecer complexa.
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
          setStatus(
            'mock',
            'mock',
            `Falha OpenAI (${explainOpenAiError(error)}) e Ollama (${explainOllamaError(localError)})`,
          );
          return mock.complete(messages);
        }
      }
      setStatus('mock', 'mock', explainOpenAiError(error));
      return mock.complete(messages);
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
          setStatus(
            'mock',
            'mock',
            `Falha Ollama (${explainOllamaError(error)}) e OpenAI (${explainOpenAiError(paidError)})`,
          );
          return mock.complete(messages);
        }
      }
      setStatus('mock', 'mock', explainOllamaError(error));
      return mock.complete(messages);
    }
  }

  if (openAi) {
    try {
      const paidReply = await openAi.complete(messages);
      setStatus('real', 'openai', 'Ollama indisponível; usando OpenAI');
      return paidReply;
    } catch (error) {
      setStatus('mock', 'mock', explainOpenAiError(error));
      return mock.complete(messages);
    }
  }

  setStatus('mock', 'mock', 'Sem provedor disponível (OpenAI/Ollama)');
  return mock.complete(messages);
}
