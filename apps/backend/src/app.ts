import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { securityHeaders } from './middleware/securityHeaders';
import { createRateLimit } from './middleware/rateLimit';
import { adminIpAllowlist } from './middleware/adminIpAllowlist';
import { healthRouter } from './domains/health/health.routes';
import { authRouter } from './domains/auth/auth.routes';
import { memoryRouter } from './domains/memory/memory.routes';
import { tasksRouter } from './domains/tasks/tasks.routes';
import { proposalsRouter } from './domains/proposals/proposals.routes';
import { reflectionsRouter } from './domains/reflections/reflections.routes';
import { conversationsRouter } from './domains/chat/conversations.routes';
import { chatRouter } from './domains/chat/chat.routes';
import { aiRouter } from './domains/ai/ai.routes';
import { userRouter } from './domains/user/user.routes';
import { settingsRouter } from './domains/user/settings.routes';
import { filesRouter } from './domains/files/files.routes';
import { searchRouter } from './domains/search/search.routes';
import { integrationsRouter } from './domains/integrations/integrations.routes';
import { whatsappWebhookRouter } from './domains/webhooks/whatsapp.routes';
import { whatsappRouter } from './domains/whatsapp/whatsapp.routes';
import { salesRouter } from './domains/sales/sales.routes';
import { operatorRouter } from './domains/operator/operator.routes';
import { adminUsersRouter } from './domains/admin/adminUsers.routes';
import { isOpenAiConfigured } from './config/env';
import { brandRouter } from './domains/brand/brand.routes';
import { MOBI_BRAND_PALETTE } from './domains/brand/brandPalette';
import { startSecurityRetentionWorker } from './domains/security/securityRetention.service';

export const app = express();

const corsOrigin =
  env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',').map((s) => s.trim());

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(securityHeaders);
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(requestLogger);
startSecurityRetentionWorker();

app.get('/', (_req, res) => {
  res.json({
    name: 'AGENTE MOBI API',
    version: '0.2.0',
    openAiConfigured: isOpenAiConfigured(),
    brandPalette: MOBI_BRAND_PALETTE,
  });
});

app.use('/health', healthRouter);

const authRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 30,
  message: 'Muitas tentativas de autenticação. Aguarde um minuto.',
});
const apiRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 240,
});

app.use('/api', apiRateLimit);
app.use('/api/whatsapp', adminIpAllowlist);
app.use('/api/ai', adminIpAllowlist);
app.use('/api/settings', adminIpAllowlist);
app.use('/api/integrations', adminIpAllowlist);
app.use('/api/sales', adminIpAllowlist);
app.use('/api/operator', adminIpAllowlist);
app.use('/api/admin', adminIpAllowlist);
app.use('/api/auth', authRateLimit);
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/memories', memoryRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/reflections', reflectionsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/ai', aiRouter);
app.use('/api/files', filesRouter);
app.use('/api/search', searchRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/webhooks/whatsapp', whatsappWebhookRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/sales', salesRouter);
app.use('/api/brand', brandRouter);
app.use('/api/operator', operatorRouter);
app.use('/api/admin', adminUsersRouter);

app.use(errorHandler);
