import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  generateAssistantReply,
  getAiRuntimeStatus,
  setAiManualMode,
  type AiRuntimeMode,
  setAiRoutingStrategy,
  type AiRoutingStrategy,
  saveAiRuntimePreference,
  syncAiRuntimePreference,
} from './aiService';
import { isOpenAiConfigured } from '../../config/env';

export const aiRouter = Router();

aiRouter.use(authMiddleware);

aiRouter.get('/status', async (req, res, next) => {
  try {
    await syncAiRuntimePreference(req.userId!);
  const status = getAiRuntimeStatus();
  const label =
    status.provider === 'openai'
      ? 'IA REAL ATIVA'
      : status.provider === 'ollama'
        ? 'IA LOCAL (OLLAMA) ATIVA'
        : 'MODO SIMULAÇÃO (sem crédito OpenAI)';
  res.json({ ...status, label });
  } catch (e) {
    next(e);
  }
});

const setModeSchema = z.object({
  mode: z.enum(['real', 'mock', 'auto']),
});

aiRouter.post('/mode', async (req, res, next) => {
  try {
  const parsed = setModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Body inválido. Use mode: "real" | "mock" | "auto"' });
    return;
  }
  const wanted = parsed.data.mode;
  const next = wanted === 'auto' ? null : (wanted as AiRuntimeMode);
  const status = setAiManualMode(next);
  await saveAiRuntimePreference({
    userId: req.userId!,
    mode: next,
    strategy: status.strategy,
  });
  const label =
    status.provider === 'openai'
      ? 'IA REAL ATIVA'
      : status.provider === 'ollama'
        ? 'IA LOCAL (OLLAMA) ATIVA'
        : 'MODO SIMULAÇÃO (sem crédito OpenAI)';
  res.json({ ...status, label });
  } catch (e) {
    next(e);
  }
});

const setStrategySchema = z.object({
  strategy: z.enum(['local_only', 'hybrid', 'openai_only']),
});

aiRouter.post('/strategy', async (req, res, next) => {
  try {
  const parsed = setStrategySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Body inválido. Use strategy: local_only | hybrid | openai_only' });
    return;
  }
  // Ao escolher estratégia no painel, removemos override manual para a escolha surtir efeito imediato.
  setAiManualMode(null);
  const status = setAiRoutingStrategy(parsed.data.strategy as AiRoutingStrategy);
  await saveAiRuntimePreference({
    userId: req.userId!,
    mode: null,
    strategy: status.strategy,
  });
  const label =
    status.provider === 'openai'
      ? 'IA REAL ATIVA'
      : status.provider === 'ollama'
        ? 'IA LOCAL (OLLAMA) ATIVA'
        : 'MODO SIMULAÇÃO (sem crédito OpenAI)';
  res.json({ ...status, label });
  } catch (e) {
    next(e);
  }
});

aiRouter.get('/test', async (req, res, next) => {
  try {
    await syncAiRuntimePreference(req.userId!);
    const reply = await generateAssistantReply([
      { role: 'user', content: 'Diga apenas: AGENTE MOBI OK' },
    ]);
    const status = getAiRuntimeStatus();
    res.json({
      configured: isOpenAiConfigured(),
      mode: status.mode,
      reason: status.reason,
      reply,
    });
  } catch (e) {
    next(e);
  }
});
