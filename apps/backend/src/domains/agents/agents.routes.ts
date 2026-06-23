import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  createAgent,
  deleteAgent,
  duplicateAgent,
  getAgentById,
  listAgents,
  setDefaultAgent,
  toggleAgentActive,
  updateAgent,
} from './agent.service';

export const agentsRouter = Router();
agentsRouter.use(authMiddleware);

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  objective: z.string().optional(),
  instructions: z.string().optional(),
  rules: z.string().optional(),
  forbiddenRules: z.string().optional(),
  examples: z.string().optional(),
  model: z.string().optional(),
  isActive: z.boolean().optional(),
  toolIds: z.array(z.string()).optional(),
});

agentsRouter.get('/', async (req, res, next) => {
  try {
    const items = await listAgents(req.userId!);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

agentsRouter.get('/:id', async (req, res, next) => {
  try {
    const item = await getAgentById(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

agentsRouter.post('/', async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const item = await createAgent(req.userId!, body);
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

agentsRouter.put('/:id', async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const item = await updateAgent(req.userId!, req.params.id, body);
    if (!item) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

agentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteAgent(req.userId!, req.params.id);
    if (!result.ok) {
      res.status(result.reason === 'Agente não encontrado' ? 404 : 400).json({ error: result.reason });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

agentsRouter.patch('/:id/default', async (req, res, next) => {
  try {
    const item = await setDefaultAgent(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

agentsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const item = await duplicateAgent(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

agentsRouter.patch('/:id/active', async (req, res, next) => {
  try {
    const item = await toggleAgentActive(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Agente não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});
