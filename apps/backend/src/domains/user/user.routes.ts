import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';

export const userRouter = Router();
userRouter.use(authMiddleware);

userRouter.get('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(user);
  } catch (e) {
    next(e);
  }
});
