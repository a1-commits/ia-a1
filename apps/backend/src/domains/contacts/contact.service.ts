import { prisma } from '../../lib/prisma';
import { normalizePhone } from './contact.utils';

export type ContactDto = {
  id: string;
  name: string;
  phone: string;
  whatsappId: string | null;
  agentId: string | null;
  agentName: string | null;
  lastMessage: string;
  lastInteraction: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

function toDto(
  contact: {
    id: string;
    name: string;
    phone: string;
    whatsappId: string | null;
    lastMessage: string;
    lastInteractionAt: Date | null;
    status: string;
    source: string;
    createdAt: Date;
    updatedAt: Date;
    contactAgent?: { agentId: string; agent: { name: string } } | null;
  },
): ContactDto {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    whatsappId: contact.whatsappId,
    agentId: contact.contactAgent?.agentId ?? null,
    agentName: contact.contactAgent?.agent.name ?? null,
    lastMessage: contact.lastMessage,
    lastInteraction: (contact.lastInteractionAt ?? contact.updatedAt).toISOString(),
    status: contact.status,
    source: contact.source,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

const contactInclude = {
  contactAgent: { include: { agent: { select: { id: true, name: true } } } },
} as const;

export async function listContacts(userId: string): Promise<ContactDto[]> {
  const items = await prisma.contact.findMany({
    where: { userId },
    include: contactInclude,
    orderBy: [{ lastInteractionAt: 'desc' }, { updatedAt: 'desc' }],
  });
  return items.map(toDto);
}

export async function getContactById(userId: string, id: string): Promise<ContactDto | null> {
  const contact = await prisma.contact.findFirst({
    where: { id, userId },
    include: contactInclude,
  });
  return contact ? toDto(contact) : null;
}

export async function createContact(
  userId: string,
  input: { name: string; phone: string; agentId?: string | null },
): Promise<ContactDto> {
  const phone = normalizePhone(input.phone);
  const digits = phone.replace(/\D/g, '');
  const existing = await prisma.contact.findFirst({
    where: { userId, phone: { contains: digits.slice(-11) } },
  });
  if (existing) {
    throw new Error('Já existe um contato com este telefone.');
  }

  const name = input.name.trim() || phone;
  const contact = await prisma.contact.create({
    data: {
      userId,
      name,
      phone,
      lastInteractionAt: new Date(),
      source: 'manual',
    },
    include: contactInclude,
  });

  if (input.agentId) {
    return assignContactAgent(userId, contact.id, input.agentId);
  }

  return toDto(contact);
}

export async function deleteContact(userId: string, id: string): Promise<boolean> {
  const contact = await prisma.contact.findFirst({ where: { id, userId, source: 'manual' } });
  if (!contact) return false;
  await prisma.contact.delete({ where: { id } });
  return true;
}

export async function getContactAgent(userId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
    include: contactInclude,
  });
  if (!contact) return null;

  return {
    contactId: contact.id,
    agentId: contact.contactAgent?.agentId ?? null,
    agentName: contact.contactAgent?.agent.name ?? null,
    usesDefault: !contact.contactAgent,
  };
}

export async function assignContactAgent(
  userId: string,
  contactId: string,
  agentId: string | null,
): Promise<ContactDto> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) throw new Error('Contato não encontrado');

  if (!agentId) {
    await prisma.contactAgent.deleteMany({ where: { contactId } });
    const refreshed = await prisma.contact.findFirst({
      where: { id: contactId },
      include: contactInclude,
    });
    return toDto(refreshed!);
  }

  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId, isActive: true } });
  if (!agent) throw new Error('Agente não encontrado ou inativo');

  await prisma.contactAgent.upsert({
    where: { contactId },
    create: { contactId, agentId, assignedAt: new Date() },
    update: { agentId, assignedAt: new Date() },
  });

  const refreshed = await prisma.contact.findFirst({
    where: { id: contactId },
    include: contactInclude,
  });
  return toDto(refreshed!);
}

export async function upsertContactFromWhatsApp(input: {
  userId: string;
  number: string;
  whatsappId?: string | null;
  name?: string | null;
  lastMessage?: string;
  lastInteractionAt?: Date;
  paused?: boolean;
}): Promise<ContactDto> {
  const phone = normalizePhone(input.number);
  const digits = phone.replace(/\D/g, '');
  const existing = await prisma.contact.findFirst({
    where: {
      userId: input.userId,
      OR: [
        { phone: { contains: digits.slice(-11) } },
        input.whatsappId ? { whatsappId: input.whatsappId } : undefined,
      ].filter(Boolean) as Array<{ phone: { contains: string } } | { whatsappId: string }>,
    },
    include: contactInclude,
  });

  const status = input.paused ? 'pausado' : 'ativo';

  if (existing) {
    const updated = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: existing.source === 'manual' ? existing.name : (input.name?.trim() || existing.name),
        whatsappId: input.whatsappId ?? existing.whatsappId,
        lastMessage: input.lastMessage ?? existing.lastMessage,
        lastInteractionAt: input.lastInteractionAt ?? existing.lastInteractionAt,
        status,
        source: existing.source === 'manual' ? 'manual' : 'whatsapp',
      },
      include: contactInclude,
    });
    return toDto(updated);
  }

  const created = await prisma.contact.create({
    data: {
      userId: input.userId,
      name: input.name?.trim() || phone,
      phone,
      whatsappId: input.whatsappId ?? null,
      lastMessage: input.lastMessage ?? '—',
      lastInteractionAt: input.lastInteractionAt ?? new Date(),
      status,
      source: 'whatsapp',
    },
    include: contactInclude,
  });
  return toDto(created);
}

export async function syncWhatsAppContacts(
  userId: string,
  items: Array<{
    number: string;
    paused: boolean;
    lastInboundAt: string;
    lastInboundPreview: string;
  }>,
): Promise<ContactDto[]> {
  for (const item of items) {
    await upsertContactFromWhatsApp({
      userId,
      number: item.number,
      lastMessage: item.lastInboundPreview || '—',
      lastInteractionAt: new Date(item.lastInboundAt),
      paused: item.paused,
    });
  }
  return listContacts(userId);
}

export async function touchContactInteraction(input: {
  userId: string;
  phone?: string | null;
  whatsappId?: string | null;
  name?: string | null;
  lastMessage?: string;
}): Promise<void> {
  if (!input.phone && !input.whatsappId) return;
  await upsertContactFromWhatsApp({
    userId: input.userId,
    number: input.phone ?? input.whatsappId ?? '',
    whatsappId: input.whatsappId,
    name: input.name,
    lastMessage: input.lastMessage,
    lastInteractionAt: new Date(),
  });
}
