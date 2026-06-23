export type StoredContact = {
  id: string;
  name: string;
  phone: string;
  agentId: string | null;
  lastMessage: string;
  lastInteraction: string;
  status: 'ativo' | 'inativo' | 'pausado';
  source: 'manual' | 'whatsapp';
};

const STORAGE_KEY = 'mobi.contacts.v1';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.trim();
  if (digits.length >= 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}

function readAll(): StoredContact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredContact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(contacts: StoredContact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function listStoredContacts(): StoredContact[] {
  return readAll().sort((a, b) => b.lastInteraction.localeCompare(a.lastInteraction));
}

export function countContactsWithAgent(): number {
  return readAll().filter((c) => c.agentId !== null).length;
}

export function createContact(input: {
  name: string;
  phone: string;
  agentId?: string | null;
}): StoredContact {
  const phone = normalizePhone(input.phone);
  const name = input.name.trim() || phone;
  const existing = readAll();
  const duplicate = existing.find((c) => c.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
  if (duplicate) {
    throw new Error('Já existe um contato com este telefone.');
  }

  const contact: StoredContact = {
    id: `contact-${Date.now()}`,
    name,
    phone,
    agentId: input.agentId ?? null,
    lastMessage: '—',
    lastInteraction: new Date().toISOString(),
    status: 'ativo',
    source: 'manual',
  };

  writeAll([contact, ...existing]);
  return contact;
}

export function updateContactAgent(id: string, agentId: string | null): StoredContact | null {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], agentId };
  writeAll(all);
  return all[idx];
}

export function deleteContact(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function mergeWhatsAppContacts(
  items: Array<{
    number: string;
    paused: boolean;
    lastInboundAt: string;
    lastInboundPreview: string;
  }>,
): StoredContact[] {
  const all = readAll();
  const byPhone = new Map(all.map((c) => [c.phone.replace(/\D/g, ''), c]));

  for (const item of items) {
    const key = item.number.replace(/\D/g, '');
    const existing = byPhone.get(key);
    const patch: StoredContact = {
      id: existing?.id ?? `wa-${key}`,
      name: existing?.name ?? item.number,
      phone: existing?.phone ?? normalizePhone(item.number),
      agentId: existing?.agentId ?? null,
      lastMessage: item.lastInboundPreview || existing?.lastMessage || '—',
      lastInteraction: item.lastInboundAt,
      status: item.paused ? 'pausado' : 'ativo',
      source: existing?.source === 'manual' ? 'manual' : 'whatsapp',
    };
    byPhone.set(key, patch);
  }

  const merged = Array.from(byPhone.values());
  writeAll(merged);
  return merged.sort((a, b) => b.lastInteraction.localeCompare(a.lastInteraction));
}
