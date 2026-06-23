import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { createRateLimit } from '../../middleware/rateLimit';
import { env } from '../../config/env';
import {
  aggregateStockForAgent,
  buildBlingConnectUrl,
  createBlingConnection,
  disconnectBlingConnection,
  handleBlingOAuthCallback,
  listBlingConnections,
  testBlingConnection,
} from './bling.service';

export const blingRouter = Router();

const stockRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Muitas consultas de estoque. Aguarde um minuto.',
});

blingRouter.get('/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      res.status(400).send('Callback OAuth inválido.');
      return;
    }
    const result = await handleBlingOAuthCallback({ code, state });
    if (!result.ok) {
      res.status(400).send(`Falha ao conectar Bling: ${result.reason}`);
      return;
    }
    const frontendBase = env.BLING_REDIRECT_URI.includes('localhost:4000')
      ? 'http://localhost:3000'
      : env.BLING_REDIRECT_URI.replace(/\/api\/integrations\/bling\/callback.*/, '');
    res.redirect(
      `${frontendBase}/agentes/${result.agentId}/integrations/bling?connected=${result.connectionId}`,
    );
  } catch (e) {
    next(e);
  }
});

blingRouter.use(authMiddleware);

blingRouter.get('/connections', async (req, res, next) => {
  try {
    const agentId = z.string().cuid().parse(req.query.agentId);
    const items = await listBlingConnections(req.userId!, agentId);
    res.json({ items, maxConnections: env.BLING_MAX_CONNECTIONS_PER_AGENT });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/connections', async (req, res, next) => {
  try {
    const body = z
      .object({
        agentId: z.string().cuid(),
        storeLabel: z.string().min(1).max(120),
        clientId: z.string().min(3),
        clientSecret: z.string().min(3),
      })
      .parse(req.body);
    const item = await createBlingConnection({
      userId: req.userId!,
      ...body,
    });
    res.status(201).json(item);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Limite')) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});

blingRouter.get('/connect/:connectionId', async (req, res, next) => {
  try {
    const authorizeUrl = await buildBlingConnectUrl(req.userId!, req.params.connectionId);
    res.json({ authorizeUrl });
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/connections/:id/test', async (req, res, next) => {
  try {
    const result = await testBlingConnection(req.userId!, req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

blingRouter.delete('/connections/:id', async (req, res, next) => {
  try {
    await disconnectBlingConnection(req.userId!, req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

blingRouter.post('/agents/:agentId/stock-by-barcode', stockRateLimit, async (req, res, next) => {
  try {
    const agentId = req.params.agentId;
    const body = z.object({ barcodes: z.array(z.string().min(8).max(14)).min(1).max(20) }).parse(req.body);
    const data = await aggregateStockForAgent({
      userId: req.userId!,
      agentId,
      barcodes: body.barcodes,
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export { aggregateStockForAgent };
