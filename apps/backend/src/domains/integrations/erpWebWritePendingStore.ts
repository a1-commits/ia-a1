import { prisma } from '../../lib/prisma';

const TTL_MS = 2 * 60 * 1000;
const SETTING_PENDING = 'ERP_WRITE_PENDING_WEB';

type PendingEntry = {
  code: string;
  payload: string;
  expiresAt: number;
};

function parsePending(raw: string | null): PendingEntry | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<PendingEntry>;
    if (
      typeof data.code !== 'string' ||
      typeof data.payload !== 'string' ||
      typeof data.expiresAt !== 'number' ||
      !Number.isFinite(data.expiresAt)
    ) {
      return null;
    }
    return { code: data.code, payload: data.payload, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

async function getPending(userId: string): Promise<PendingEntry | null> {
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key: SETTING_PENDING } },
    select: { value: true },
  });
  return parsePending(row?.value ?? null);
}

async function savePending(userId: string, entry: PendingEntry): Promise<void> {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: SETTING_PENDING } },
    create: { userId, key: SETTING_PENDING, value: JSON.stringify(entry) },
    update: { value: JSON.stringify(entry) },
  });
}

async function clearPending(userId: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { userId, key: SETTING_PENDING } });
}

export async function setErpWritePendingForWeb(userId: string, jsonPayload: string): Promise<string> {
  const code = `E${Math.floor(1000 + Math.random() * 9000)}`;
  await savePending(userId, { code, payload: jsonPayload, expiresAt: Date.now() + TTL_MS });
  return code;
}

export async function takeErpWritePendingForWeb(
  userId: string,
  code: string,
): Promise<{ ok: true; jsonPayload: string } | { ok: false; reason: string }> {
  const got = code.trim().toUpperCase();
  const row = await getPending(userId);
  if (!row || row.expiresAt < Date.now()) {
    await clearPending(userId);
    return { ok: false, reason: 'Código inexistente ou expirado. Refaça a operação e tente o novo código.' };
  }
  if (row.code.toUpperCase() !== got) {
    return { ok: false, reason: 'Código de confirmação não confere. Use o código exato da mensagem anterior.' };
  }
  await clearPending(userId);
  return { ok: true, jsonPayload: row.payload };
}
