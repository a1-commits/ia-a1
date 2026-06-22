import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware, requireAdmin } from '../../middleware/authMiddleware';

export const adminUsersRouter = Router();

adminUsersRouter.use(authMiddleware, requireAdmin);

const userRoleSchema = z.enum(['ADMIN', 'OPERATOR', 'READONLY']);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().trim().min(1).optional(),
  role: userRoleSchema.default('OPERATOR'),
  active: z.boolean().default(true),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  role: userRoleSchema.optional(),
  active: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6),
});

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function activeAdminCount(exceptUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      active: true,
      role: 'ADMIN',
      id: exceptUserId ? { not: exceptUserId } : undefined,
    },
  });
}

adminUsersRouter.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ users });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.post('/users', async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: 'E-mail já cadastrado' });
      return;
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role,
        active: body.active,
      },
      select: userSelect,
    });
    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const userId = String(req.params.id ?? '');
    const body = updateUserSchema.parse(req.body);
    const current = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!current) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    if (body.email && body.email !== current.email) {
      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) {
        res.status(409).json({ error: 'E-mail já cadastrado' });
        return;
      }
    }

    const wouldDeactivate = body.active === false && current.active;
    const wouldDemoteAdmin = body.role && body.role !== 'ADMIN' && current.role === 'ADMIN';
    if ((wouldDeactivate || wouldDemoteAdmin) && (await activeAdminCount(userId)) === 0) {
      res.status(400).json({ error: 'Mantenha pelo menos um administrador ativo.' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        active: body.active,
      },
      select: userSelect,
    });
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

adminUsersRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const userId = String(req.params.id ?? '');
    const body = resetPasswordSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
