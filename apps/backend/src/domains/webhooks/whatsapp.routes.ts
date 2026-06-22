import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Base para WhatsApp Cloud API / Business: verificação GET e eventos POST.
 * Produção: validar assinatura X-Hub-Signature-256 e WHATSAPP_VERIFY_TOKEN.
 */
export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const token = req.query['hub.verify_token'];
  if (
    mode === 'subscribe' &&
    challenge &&
    typeof challenge === 'string' &&
    (!env.WHATSAPP_VERIFY_TOKEN || token === env.WHATSAPP_VERIFY_TOKEN)
  ) {
    res.status(200).send(challenge);
    return;
  }
  if (env.WHATSAPP_VERIFY_TOKEN && token !== env.WHATSAPP_VERIFY_TOKEN) {
    res.status(403).json({ ok: false, error: 'verify_token inválido' });
    return;
  }
  res.status(200).json({
    ok: true,
    message: 'Webhook stub — em produção, valide hub.verify_token com o token configurado.',
    receivedQuery: { mode, tokenPresent: Boolean(token) },
  });
});

whatsappWebhookRouter.post('/', (req, res) => {
  const signature = req.header('x-hub-signature-256');
  if (env.WHATSAPP_WEBHOOK_SECRET) {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const expected = `sha256=${crypto
      .createHmac('sha256', env.WHATSAPP_WEBHOOK_SECRET)
      .update(raw)
      .digest('hex')}`;
    if (!signature || signature !== expected) {
      res.status(401).json({ ok: false, error: 'assinatura inválida' });
      return;
    }
  }
  res.status(200).json({
    ok: true,
    received: true,
    note: 'Processamento assíncrono e filas serão adicionados na integração completa.',
  });
});
