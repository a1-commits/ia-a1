import { api } from '@/lib/api';

export type PlatformContact = {
  id: string;
  name: string;
  phone: string;
  agentId: string | null;
  agentName: string | null;
  lastMessage: string;
  lastInteraction: string;
  status: 'ativo' | 'inativo' | 'pausado';
  source: 'manual' | 'whatsapp';
};

type ContactDto = {
  id: string;
  name: string;
  phone: string;
  agentId: string | null;
  agentName: string | null;
  lastMessage: string;
  lastInteraction: string;
  status: string;
  source: string;
};

function toPlatform(dto: ContactDto): PlatformContact {
  return {
    id: dto.id,
    name: dto.name,
    phone: dto.phone,
    agentId: dto.agentId,
    agentName: dto.agentName,
    lastMessage: dto.lastMessage,
    lastInteraction: dto.lastInteraction,
    status: (dto.status as PlatformContact['status']) ?? 'ativo',
    source: (dto.source as PlatformContact['source']) ?? 'manual',
  };
}

export async function listContacts(): Promise<PlatformContact[]> {
  const res = await api<{ items: ContactDto[] }>('/api/contacts');
  return res.items.map(toPlatform);
}

export async function createContact(input: {
  name: string;
  phone: string;
  agentId?: string | null;
}): Promise<PlatformContact> {
  const dto = await api<ContactDto>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return toPlatform(dto);
}

export async function assignContactAgent(contactId: string, agentId: string | null): Promise<PlatformContact> {
  const dto = await api<ContactDto>(`/api/contacts/${contactId}/agent`, {
    method: 'PATCH',
    body: JSON.stringify({ agentId }),
  });
  return toPlatform(dto);
}

export async function deleteContact(id: string): Promise<void> {
  await api(`/api/contacts/${id}`, { method: 'DELETE' });
}

export async function countContactsWithAgent(): Promise<number> {
  const items = await listContacts();
  return items.filter((c) => c.agentId !== null).length;
}
