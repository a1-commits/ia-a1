import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  generateAssistantReply,
  getAiRuntimeStatus,
  setAiManualMode,
  type AiManualMode,
  setAiRoutingStrategy,
  type AiRoutingStrategy,
  saveAiRuntimePreference,
  syncAiRuntimePreference,
} from './aiService';
import { isOpenAiConfigured } from '../../config/env';

export const aiRouter = Router();

aiRouter.use(authMiddleware);

function aiStatusLabel(provider: ReturnType<typeof getAiRuntimeStatus>['provider']): string {
  if (provider === 'openai') return 'IA REAL ATIVA';
  if (provider === 'ollama') return 'IA LOCAL (OLLAMA) ATIVA';
  return 'IA INDISPONÍVEL';
}

aiRouter.get('/status', async (req, res, next) => {
  try {
    await syncAiRuntimePreference(req.userId!);
    const status = getAiRuntimeStatus();
    res.json({ ...status, label: aiStatusLabel(status.provider) });
  } catch (e) {
    next(e);
  }
});

const setModeSchema = z.object({
  mode: z.enum(['real', 'auto']),
});

aiRouter.post('/mode', async (req, res, next) => {
  try {
    const parsed = setModeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido. Use mode: "real" | "auto"' });
      return;
    }
    const wanted = parsed.data.mode;
    const nextMode: AiManualMode = wanted === 'auto' ? null : 'real';
    const status = setAiManualMode(nextMode);
    await saveAiRuntimePreference({
      userId: req.userId!,
      mode: nextMode,
      strategy: status.strategy,
    });
    res.json({ ...status, label: aiStatusLabel(status.provider) });
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
    setAiManualMode(null);
    const status = setAiRoutingStrategy(parsed.data.strategy as AiRoutingStrategy);
    await saveAiRuntimePreference({
      userId: req.userId!,
      mode: null,
      strategy: status.strategy,
    });
    res.json({ ...status, label: aiStatusLabel(status.provider) });
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
