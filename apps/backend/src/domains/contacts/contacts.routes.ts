import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { whatsappService } from '../../services/whatsapp.service';
import {
  assignContactAgent,
  createContact,
  deleteContact,
  getContactAgent,
  getContactById,
  listContacts,
  syncWhatsAppContacts,
} from './contact.service';

export const contactsRouter = Router();
contactsRouter.use(authMiddleware);

contactsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const waItems = whatsappService.listContactControls();
    if (waItems.length > 0) {
      await syncWhatsAppContacts(userId, waItems);
    }
    const items = await listContacts(userId);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

contactsRouter.post('/', async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string(),
        phone: z.string().min(3),
        agentId: z.string().cuid().nullable().optional(),
      })
      .parse(req.body);
    const item = await createContact(req.userId!, body);
    res.status(201).json(item);
  } catch (e) {
    if (e instanceof Error && e.message.includes('telefone')) {
      res.status(409).json({ error: e.message });
      return;
    }
    next(e);
  }
});

contactsRouter.delete('/:id', async (req, res, next) => {
  try {
    const ok = await deleteContact(req.userId!, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Contato não encontrado ou não pode ser excluído' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

contactsRouter.get('/:id', async (req, res, next) => {
  try {
    const item = await getContactById(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Contato não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

contactsRouter.get('/:id/agent', async (req, res, next) => {
  try {
    const item = await getContactAgent(req.userId!, req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Contato não encontrado' });
      return;
    }
    res.json(item);
  } catch (e) {
    next(e);
  }
});

contactsRouter.patch('/:id/agent', async (req, res, next) => {
  try {
    const body = z.object({ agentId: z.string().cuid().nullable() }).parse(req.body);
    const item = await assignContactAgent(req.userId!, req.params.id, body.agentId);
    res.json(item);
  } catch (e) {
    if (e instanceof Error) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
