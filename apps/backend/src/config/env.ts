import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod';

// Carrega sempre o .env ao lado do package do backend (funciona com npm workspaces e tsx/dist).
const envFile = path.resolve(__dirname, '../../.env');
config({ path: envFile });
// Fallback: variáveis já exportadas no shell ou .env na raiz do processo
config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8).default('dev-change-me-in-production'),
  /** Validade do access token JWT (ex.: 15m, 1h) */
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_IMAGE_MODEL: z.string().default('dall-e-3'),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default('whisper-1'),
  OLLAMA_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:0.5b'),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().default(120_000),
  OLLAMA_MAX_RETRIES: z.coerce.number().default(2),
  /** MOBI-MINIMAL-AGENT-1: recepcionista minimal (legado; fluxo sempre minimal). */
  MOBI_SIMPLE_AGENT: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  ONEDRIVE_CLIENT_ID: z.string().optional(),
  ONEDRIVE_TENANT_ID: z.string().default('common'),
  ONEDRIVE_SCOPE: z.string().default('offline_access Files.ReadWrite User.Read'),
  OLIST_CLIENT_ID: z.string().optional(),
  OLIST_CLIENT_SECRET: z.string().optional(),
  OLIST_REDIRECT_URI: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v : 'http://localhost:3000/settings')),
  /** Escopos OAuth solicitados ao iniciar conexão (espaço-separados). */
  OLIST_OAUTH_SCOPE: z.string().default('openid'),
  OLIST_ACCOUNTS_BASE_URL: z.string().default('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect'),
  OLIST_API_BASE_URL: z.string().default('https://api.tiny.com.br/public-api/v3'),
  OLIST_API_V2_BASE_URL: z.string().default('https://api.tiny.com.br/api2'),
  /** Token Bearer fixo (opcional). Quando definido, pode substituir OAuth nas chamadas à API pública. */
  OLIST_API_TOKEN: z.string().optional(),
  WHATSAPP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  WHATSAPP_ALLOW_ALL_NUMBERS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  WHATSAPP_ALLOWED_NUMBER: z.string().optional(),
  /** Número do dono/operador (apenas dígitos, ex. 5543999200894): conversa como administrador, não como cliente. */
  WHATSAPP_ADMIN_NUMBER: z.string().optional(),
  /** Lista opcional de números admin separados por vírgula (fallback/múltiplos aparelhos). */
  WHATSAPP_ADMIN_NUMBERS: z.string().optional(),
  WHATSAPP_SALES_MANAGER_NUMBER: z.string().optional(),
  WHATSAPP_AGENT_USER_EMAIL: z.string().email().default('demo@agente.mobi'),
  WHATSAPP_MIN_REPLY_INTERVAL_MS: z.coerce.number().default(4000),
  WHATSAPP_STATIC_REPLY: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_IP_ALLOWLIST: z.string().optional(),
  SECURITY_AUDIT_RETENTION_DAYS: z.coerce.number().default(90),
  CORS_ORIGIN: z.string().default('*'),
  /** Chave para criptografar tokens de integração (mín. 8 chars). */
  INTEGRATION_ENCRYPTION_KEY: z.string().min(8).default('dev-integration-key-change-me'),
  BLING_REDIRECT_URI: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v : 'http://localhost:4000/api/integrations/bling/callback')),
  BLING_AUTHORIZE_URL: z.string().default('https://www.bling.com.br/Api/v3/oauth/authorize'),
  BLING_TOKEN_URL: z.string().default('https://api.bling.com.br/Api/v3/oauth/token'),
  BLING_API_BASE_URL: z.string().default('https://api.bling.com.br/Api/v3'),
  BLING_DEFAULT_SCOPES: z.string().default(''),
  BLING_STORE_TIMEOUT_MS: z.coerce.number().default(8000),
  BLING_MAX_CONNECTIONS_PER_AGENT: z.coerce.number().default(4),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

const OPENAI_PLACEHOLDER_KEYS = new Set([
  'SUA_CHAVE_OPENAI_NOVA',
  'SUA_CHAVE_OPENAI',
  'your-openai-api-key',
  'changeme',
  'test',
  'xxx',
]);

export function isOpenAiConfigured(): boolean {
  const key = (process.env.OPENAI_API_KEY ?? '').trim();
  if (!key) return false;
  if (OPENAI_PLACEHOLDER_KEYS.has(key)) return false;
  if (/^(sk-test|sk-fake|sk-placeholder)/i.test(key)) return false;
  return true;
}
