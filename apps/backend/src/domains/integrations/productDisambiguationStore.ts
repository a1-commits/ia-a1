import { prisma } from '../../lib/prisma';
import type { BlingProductOptionRow } from './blingStructured.types';

const SETTING_KEY_PREFIX = 'PRODUCT_DISAMBIG_';
const TTL_MS = 15 * 60 * 1000;

type PendingEntry = {
  options: BlingProductOptionRow[];
  expiresAt: number;
};

function settingKey(conversationId: string): string {
  return `${SETTING_KEY_PREFIX}${conversationId}`;
}

function parseEntry(raw: string | null): PendingEntry | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<PendingEntry>;
    if (!Array.isArray(data.options) || typeof data.expiresAt !== 'number') return null;
    return { options: data.options, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

export async function saveProductDisambiguation(
  conversationId: string,
  options: BlingProductOptionRow[],
): Promise<void> {
  const userId = await resolveConversationUserId(conversationId);
  if (!userId) return;
  const entry: PendingEntry = { options, expiresAt: Date.now() + TTL_MS };
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: settingKey(conversationId) } },
    create: { userId, key: settingKey(conversationId), value: JSON.stringify(entry) },
    update: { value: JSON.stringify(entry) },
  });
}

export async function hasProductDisambiguation(conversationId: string): Promise<boolean> {
  const entry = await getProductDisambiguation(conversationId);
  return entry !== null && entry.options.length > 0;
}

export async function getProductDisambiguation(
  conversationId: string,
): Promise<PendingEntry | null> {
  const userId = await resolveConversationUserId(conversationId);
  if (!userId) return null;
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key: settingKey(conversationId) } },
    select: { value: true },
  });
  const entry = parseEntry(row?.value ?? null);
  if (!entry || entry.expiresAt < Date.now()) {
    await clearProductDisambiguation(conversationId);
    return null;
  }
  return entry;
}

export async function takeProductDisambiguationChoice(
  conversationId: string,
  choiceText: string,
): Promise<BlingProductOptionRow | null> {
  const entry = await getProductDisambiguation(conversationId);
  if (!entry) return null;
  const index = Number.parseInt(choiceText.trim(), 10);
  if (!Number.isFinite(index) || index < 1 || index > entry.options.length) return null;
  const selected = entry.options[index - 1] ?? null;
  await clearProductDisambiguation(conversationId);
  return selected;
}

export async function clearProductDisambiguation(conversationId: string): Promise<void> {
  const userId = await resolveConversationUserId(conversationId);
  if (!userId) return;
  await prisma.setting.deleteMany({
    where: { userId, key: settingKey(conversationId) },
  });
}

async function resolveConversationUserId(conversationId: string): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  return conv?.userId ?? null;
}
