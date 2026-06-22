import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { listOpenSalesHandoffs, resolveSalesHandoff } from './handoff.service';

export const salesRouter = Router();
salesRouter.use(authMiddleware);

salesRouter.get('/handoffs', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const items = await listOpenSalesHandoffs(userId);
    res.json({ items, total: items.length });
  } catch (e) {
    next(e);
  }
});

salesRouter.post('/handoffs/:id/resolve', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const ok = await resolveSalesHandoff(userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Encaminhamento nao encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

