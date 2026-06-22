import { Router } from 'express';
import { IntegrationProvider } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';
import {
  disconnectOneDrive,
  getOneDriveFileContent,
  isOneDriveConfigured,
  listOneDriveFiles,
  pollOneDriveDeviceFlow,
  startOneDriveDeviceFlow,
  uploadTextFileToOneDrive,
} from './onedrive.service';
import {
  clearOlistApiToken,
  clearOlistOAuthApp,
  createOlistAccountPayable,
  createOlistAccountReceivable,
  createOlistAuthUrl,
  disconnectOlist,
  exchangeOlistCode,
  getOlistCategoryById,
  getOlistStatus,
  listOlistAccountsPayable,
  listOlistAccountsReceivable,
  listOlistCategories,
  listOlistCustomers,
  listOlistProducts,
  listOlistQuotes,
  saveOlistApiToken,
  saveOlistOAuthApp,
  updateOlistAccountPayableStatus,
  updateOlistAccountReceivableStatus,
} from './olist.service';

export const integrationsRouter = Router();
integrationsRouter.use(authMiddleware);

async function ensureIntegrationStubs(userId: string): Promise<void> {
  for (const provider of [IntegrationProvider.ONEDRIVE, IntegrationProvider.WHATSAPP]) {
    await prisma.integrationLink.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, status: 'disconnected' },
      update: {},
    });
  }
}

/** Estado das integrações (OneDrive, WhatsApp). Metadados reservados para OAuth futuro. */
integrationsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await ensureIntegrationStubs(userId);
    const items = await prisma.integrationLink.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        status: true,
        externalId: true,
      },
      orderBy: { provider: 'asc' },
    });
    res.json({
      items,
      hints: {
        onedrive: isOneDriveConfigured()
          ? 'Conecte via Device Code (Microsoft) para habilitar acesso ao OneDrive.'
          : 'Defina ONEDRIVE_CLIENT_ID no backend para habilitar conexão.',
        whatsapp: 'Use POST /api/webhooks/whatsapp para testes; produção exige assinatura Meta.',
      },
    });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/onedrive/device/start', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const result = await startOneDriveDeviceFlow(userId);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const pollSchema = z.object({
  deviceCode: z.string().min(1),
});

integrationsRouter.post('/onedrive/device/poll', async (req, res, next) => {
  try {
    const parsed = pollSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'deviceCode é obrigatório' });
      return;
    }
    const userId = req.userId!;
    const result = await pollOneDriveDeviceFlow(userId, parsed.data.deviceCode);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/onedrive/disconnect', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await disconnectOneDrive(userId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/onedrive/files', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const result = await listOneDriveFiles(userId);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json({
      files: result.files,
      total: result.files.length,
    });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/onedrive/file/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const fileId = String(req.params.id ?? '');
    const result = await getOneDriveFileContent(userId, fileId);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result.file);
  } catch (e) {
    next(e);
  }
});

const uploadTextSchema = z.object({
  remotePath: z.string().min(1),
  content: z.string().min(1),
});

const olistExchangeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const olistApiTokenSchema = z.object({
  token: z.string().min(8),
});

const olistOAuthAppSchema = z.object({
  clientId: z.string().min(2),
  clientSecret: z.string().min(4),
  redirectUri: z.string().min(8),
});

const olistListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  search: z.string().optional(),
  sort: z.enum(['id', 'descricao']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const olistFinanceListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  search: z.string().optional(),
});

const olistWriteSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  contatoId: z.union([z.string(), z.number()]).optional(),
  descricao: z.string().optional(),
  valor: z.number().optional(),
  dataVencimento: z.string().optional(),
  situacao: z.string().optional(),
  observacao: z.string().optional(),
});

integrationsRouter.post('/onedrive/upload-text', async (req, res, next) => {
  try {
    const parsed = uploadTextSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body invalido. Use remotePath e content.' });
      return;
    }
    const userId = req.userId!;
    const result = await uploadTextFileToOneDrive({
      userId,
      remotePath: parsed.data.remotePath,
      content: parsed.data.content,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result.item);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/status', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const status = await getOlistStatus(userId);
    res.json(status);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/api-token', async (req, res, next) => {
  try {
    const parsed = olistApiTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Informe um token válido (mínimo 8 caracteres).' });
      return;
    }
    const userId = req.userId!;
    const result = await saveOlistApiToken(userId, parsed.data.token);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    const status = await getOlistStatus(userId);
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.delete('/olist/api-token', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await clearOlistApiToken(userId);
    const status = await getOlistStatus(userId);
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/oauth-app', async (req, res, next) => {
  try {
    const parsed = olistOAuthAppSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Informe clientId, clientSecret e redirectUri válidos.' });
      return;
    }
    let redirectOk = false;
    try {
      new URL(parsed.data.redirectUri);
      redirectOk = true;
    } catch {
      redirectOk = false;
    }
    if (!redirectOk) {
      res.status(400).json({ error: 'redirectUri deve ser uma URL completa (ex.: http://localhost:3000/settings).' });
      return;
    }
    const userId = req.userId!;
    const result = await saveOlistOAuthApp(userId, parsed.data);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    const status = await getOlistStatus(userId);
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.delete('/olist/oauth-app', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await clearOlistOAuthApp(userId);
    const status = await getOlistStatus(userId);
    res.json({ ok: true, status });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/connect/start', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const result = await createOlistAuthUrl(userId);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/disconnect', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await disconnectOlist(userId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/connect/exchange', async (req, res, next) => {
  try {
    const parsed = olistExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido. Use code e state.' });
      return;
    }
    const userId = req.userId!;
    const result = await exchangeOlistCode({
      userId,
      code: parsed.data.code,
      state: parsed.data.state,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json({
      ok: true,
      expiresAt: result.token.expiresAt,
      scope: result.token.scope,
      tokenType: result.token.tokenType,
    });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/categorias/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = Number(req.params.id ?? '');
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Parâmetro id inválido.' });
      return;
    }
    const result = await getOlistCategoryById(userId, id);
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json(result.category);
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/categorias', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistCategories({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
      sort: parsed.data.sort,
      order: parsed.data.order,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.categories, total: result.total });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/contas-receber', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistFinanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistAccountsReceivable({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.items, total: result.total, sourcePath: result.sourcePath });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/contas-pagar', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistFinanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistAccountsPayable({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.items, total: result.total, sourcePath: result.sourcePath });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/orcamentos', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistFinanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistQuotes({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.items, total: result.total, sourcePath: result.sourcePath });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/clientes', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistFinanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistCustomers({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.items, total: result.total, sourcePath: result.sourcePath });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.get('/olist/produtos', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistFinanceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida.' });
      return;
    }
    const result = await listOlistProducts({
      userId,
      limit: parsed.data.limit,
      page: parsed.data.page,
      search: parsed.data.search,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ items: result.items, total: result.total, sourcePath: result.sourcePath });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/contas-pagar', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido.' });
      return;
    }
    const result = await createOlistAccountPayable(userId, parsed.data);
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ ok: true, sourcePath: result.sourcePath, data: result.data });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.post('/olist/contas-receber', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido.' });
      return;
    }
    const result = await createOlistAccountReceivable(userId, parsed.data);
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ ok: true, sourcePath: result.sourcePath, data: result.data });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.patch('/olist/contas-pagar/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido.' });
      return;
    }
    const result = await updateOlistAccountPayableStatus(userId, {
      ...parsed.data,
      id: req.params.id,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ ok: true, sourcePath: result.sourcePath, data: result.data });
  } catch (e) {
    next(e);
  }
});

integrationsRouter.patch('/olist/contas-receber/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = olistWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido.' });
      return;
    }
    const result = await updateOlistAccountReceivableStatus(userId, {
      ...parsed.data,
      id: req.params.id,
    });
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.reason });
      return;
    }
    res.json({ ok: true, sourcePath: result.sourcePath, data: result.data });
  } catch (e) {
    next(e);
  }
});
