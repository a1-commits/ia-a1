import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { whatsappService } from '../../services/whatsapp.service';
import { whatsappOperationsService } from './whatsappOperations.service';

export const whatsappRouter = Router();

whatsappRouter.use(authMiddleware);

whatsappRouter.get('/status', (_req, res) => {
  res.json(whatsappService.getStatus());
});

whatsappRouter.get('/health', (_req, res) => {
  res.json(whatsappOperationsService.getHealth());
});

whatsappRouter.get('/qr', (_req, res) => {
  res.json(whatsappOperationsService.getQr());
});

whatsappRouter.get('/logs', (_req, res) => {
  res.json({ items: whatsappOperationsService.getLogs() });
});

whatsappRouter.post('/reconnect', async (_req, res, next) => {
  try {
    await whatsappOperationsService.reconnect();
    res.json({ ok: true, health: whatsappOperationsService.getHealth() });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post('/restart', async (_req, res, next) => {
  try {
    await whatsappOperationsService.restart();
    res.json({ ok: true, health: whatsappOperationsService.getHealth() });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post('/reset-session', async (_req, res, next) => {
  try {
    await whatsappOperationsService.resetSession();
    res.json({ ok: true, health: whatsappOperationsService.getHealth() });
  } catch (error) {
    next(error);
  }
});

whatsappRouter.get('/contacts', (_req, res) => {
  res.json({ items: whatsappService.listContactControls() });
});

const modeSchema = z.object({
  mode: z.enum(['agent', 'manual']),
});

whatsappRouter.post('/mode', (req, res) => {
  const parsed = modeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Body inválido. Use mode: "agent" | "manual"' });
    return;
  }
  const status = whatsappService.setAutoReplyMode(parsed.data.mode);
  res.json(status);
});

const handoffSchema = z.object({
  number: z.string().min(3),
  paused: z.boolean(),
});

whatsappRouter.post('/handoff', (req, res) => {
  const parsed = handoffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Body inválido. Use number e paused(boolean).' });
    return;
  }
  const item = whatsappService.setContactPaused(parsed.data.number, parsed.data.paused);
  if (!item) {
    res.status(404).json({ error: 'Contato não encontrado no histórico recente do WhatsApp' });
    return;
  }
  res.json(item);
});
