import { ContextType, type Agent, type Contact, type Conversation } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AgentPromptChannel } from './prompt.service';

export type ConversationChannel = 'internal' | 'whatsapp' | 'whatsapp_admin' | 'agent_test';

export type ConversationListItem = {
  id: string;
  userId: string;
  title: string | null;
  context: ContextType;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  channel: ConversationChannel;
  channelLabel: string;
  contactId: string | null;
  contactName: string | null;
  contactIdentifier: string | null;
  displayTitle: string;
  lastMessagePreview: string | null;
  agentId: string | null;
  agentName: string | null;
};

export type ConversationIdentityMeta = {
  displayTitle: string;
  contactName: string | null;
  contactIdentifier: string | null;
  channel: ConversationChannel;
  channelLabel: string;
  agentId: string | null;
  agentName: string;
};

const conversationInclude = {
  contact: {
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappId: true,
      contactAgent: { include: { agent: { select: { id: true, name: true, isActive: true } } } },
    },
  },
  agent: { select: { id: true, name: true, isActive: true } },
} as const;

export type ConversationWithRelations = Conversation & {
  contact?: {
    id: string;
    name: string;
    phone: string;
    whatsappId: string | null;
    contactAgent?: { agent: { id: string; name: string; isActive: boolean } } | null;
  } | null;
  agent?: { id: string; name: string; isActive: boolean } | null;
};

export function resolveResponsibleAgent(input: {
  contact?: ConversationWithRelations['contact'];
  conversationAgent?: { id: string; name: string; isActive?: boolean } | null;
  fallbackName?: string;
}): { agentId: string | null; agentName: string } {
  const bound = input.contact?.contactAgent?.agent;
  if (bound?.isActive) {
    return { agentId: bound.id, agentName: bound.name };
  }
  if (input.conversationAgent && input.conversationAgent.isActive !== false) {
    return { agentId: input.conversationAgent.id, agentName: input.conversationAgent.name };
  }
  return { agentId: null, agentName: input.fallbackName?.trim() || 'MOBI' };
}

export function promptChannelToStorageChannel(
  channel: AgentPromptChannel,
  agentTest?: boolean,
): ConversationChannel {
  if (agentTest) return 'agent_test';
  if (channel === 'whatsapp_customer') return 'whatsapp';
  if (channel === 'whatsapp_admin') return 'whatsapp_admin';
  return 'internal';
}

export function channelLabel(channel: ConversationChannel): string {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'whatsapp_admin':
      return 'WhatsApp Operador';
    case 'agent_test':
    case 'internal':
    default:
      return 'Interno';
  }
}

export function buildMessagePreview(content: string, maxLen = 60): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '—';
  const clipped = trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
  return `"${clipped}"`;
}

export function resolveContactIdentifier(input: {
  contact?: Pick<Contact, 'phone' | 'whatsappId'> | null;
  phone?: string | null;
  whatsappId?: string | null;
  storedIdentifier?: string | null;
}): string | null {
  if (input.contact?.phone?.trim()) return input.contact.phone.trim();
  if (input.phone?.trim()) return input.phone.trim();
  if (input.contact?.whatsappId?.trim()) return input.contact.whatsappId.trim();
  if (input.whatsappId?.trim()) return input.whatsappId.trim();
  if (input.storedIdentifier?.trim()) return input.storedIdentifier.trim();
  return null;
}

export function resolveConversationDisplayTitle(input: {
  channel: ConversationChannel;
  contactName?: string | null;
  contactIdentifier?: string | null;
  agentName?: string | null;
  legacyTitle?: string | null;
}): string {
  if (input.channel === 'agent_test' && input.agentName?.trim()) {
    return `Teste ${input.agentName.trim()}`;
  }
  if (input.contactName?.trim()) return input.contactName.trim();
  if (input.contactIdentifier?.trim()) return input.contactIdentifier.trim();
  if (input.channel === 'internal' && input.legacyTitle?.trim()) {
    return input.legacyTitle.trim();
  }
  return 'Contato sem nome';
}

export function formatSidebarMeta(input: {
  channel: ConversationChannel;
  agentName?: string | null;
  updatedAt: Date | string;
}): string {
  const time = new Date(input.updatedAt);
  const hh = time.getHours().toString().padStart(2, '0');
  const mm = time.getMinutes().toString().padStart(2, '0');
  const agent = input.agentName?.trim() || 'MOBI';
  return `${channelLabel(input.channel)} · ${agent} · ${hh}:${mm}`;
}

export function mapConversationToListItem(
  conv: ConversationWithRelations,
  lastMessageContent?: string | null,
): ConversationListItem {
  const channel = (conv.channel as ConversationChannel) || 'internal';
  const contactName = conv.contact?.name?.trim() || null;
  const contactIdentifier = resolveContactIdentifier({
    contact: conv.contact,
    storedIdentifier: conv.contactIdentifier,
  });
  const agentName = resolveResponsibleAgent({
    contact: conv.contact,
    conversationAgent: conv.agent,
  }).agentName;
  const displayTitle = resolveConversationDisplayTitle({
    channel,
    contactName,
    contactIdentifier,
    agentName: agentName ?? undefined,
    legacyTitle: conv.title,
  });
  const preview =
    conv.lastMessagePreview ??
    (lastMessageContent ? buildMessagePreview(lastMessageContent) : null);

  return {
    id: conv.id,
    userId: conv.userId,
    title: conv.title,
    context: conv.context,
    pinned: conv.pinned,
    archived: conv.archived,
    lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    channel,
    channelLabel: channelLabel(channel),
    contactId: conv.contactId,
    contactName,
    contactIdentifier,
    displayTitle,
    lastMessagePreview: preview,
    agentId: resolveResponsibleAgent({ contact: conv.contact, conversationAgent: conv.agent }).agentId,
    agentName,
  };
}

export function mapConversationIdentityMeta(
  conv: ConversationWithRelations,
  agent?: Pick<Agent, 'id' | 'name'> | null,
): ConversationIdentityMeta {
  const channel = (conv.channel as ConversationChannel) || 'internal';
  const contactName = conv.contact?.name?.trim() || null;
  const contactIdentifier = resolveContactIdentifier({
    contact: conv.contact,
    storedIdentifier: conv.contactIdentifier,
  });
  const responsible = resolveResponsibleAgent({
    contact: conv.contact,
    conversationAgent: agent ?? conv.agent,
  });
  return {
    displayTitle: resolveConversationDisplayTitle({
      channel,
      contactName,
      contactIdentifier,
      agentName: responsible.agentName,
      legacyTitle: conv.title,
    }),
    contactName,
    contactIdentifier,
    channel,
    channelLabel: channelLabel(channel),
    agentId: responsible.agentId ?? agent?.id ?? conv.agentId,
    agentName: responsible.agentName,
  };
}

async function resolveContactWithBinding(input: {
  userId: string;
  phone?: string | null;
  whatsappId?: string | null;
}): Promise<ConversationWithRelations['contact']> {
  const phoneDigits = input.phone?.replace(/\D/g, '') ?? '';
  const orConditions: Array<{ phone: { contains: string } } | { whatsappId: string }> = [];
  if (phoneDigits.length >= 8) {
    orConditions.push({ phone: { contains: phoneDigits.slice(-11) } });
  }
  if (input.whatsappId) {
    orConditions.push({ whatsappId: input.whatsappId });
  }
  if (orConditions.length === 0) return null;

  return prisma.contact.findFirst({
    where: { userId: input.userId, OR: orConditions },
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappId: true,
      contactAgent: { include: { agent: { select: { id: true, name: true, isActive: true } } } },
    },
  });
}

async function alignConversationBoundAgent(
  conv: ConversationWithRelations,
  boundAgentId: string | null,
): Promise<ConversationWithRelations> {
  if (!boundAgentId || conv.agentId === boundAgentId) return conv;
  return prisma.conversation.update({
    where: { id: conv.id },
    data: { agentId: boundAgentId },
    include: conversationInclude,
  });
}

export async function findOrCreateConversation(input: {
  userId: string;
  conversationId?: string;
  forceNew?: boolean;
  channel: ConversationChannel;
  context?: ContextType;
  contactId?: string | null;
  agentId?: string | null;
  contactIdentifier?: string | null;
  contactName?: string | null;
  agentName?: string | null;
  legacyTitle?: string | null;
}): Promise<ConversationWithRelations> {
  if (input.conversationId && !input.forceNew) {
    const existing = await prisma.conversation.findFirst({
      where: { id: input.conversationId, userId: input.userId },
      include: conversationInclude,
    });
    if (existing) {
      return alignConversationBoundAgent(existing, input.agentId ?? null);
    }
  }

  if (!input.forceNew) {
    if (input.channel === 'agent_test' && input.agentId) {
      const testConv = await prisma.conversation.findFirst({
        where: {
          userId: input.userId,
          agentId: input.agentId,
          channel: 'agent_test',
          archived: false,
        },
        orderBy: { lastMessageAt: 'desc' },
        include: conversationInclude,
      });
      if (testConv) return testConv;
    }

    if (input.contactId) {
      const contactConv = await prisma.conversation.findFirst({
        where: {
          userId: input.userId,
          contactId: input.contactId,
          channel: input.channel,
          archived: false,
        },
        orderBy: { lastMessageAt: 'desc' },
        include: conversationInclude,
      });
      if (contactConv) {
        return alignConversationBoundAgent(contactConv, input.agentId ?? null);
      }
    }

    if (input.channel === 'internal' && !input.contactId && !input.agentId) {
      const generalConv = await prisma.conversation.findFirst({
        where: {
          userId: input.userId,
          channel: 'internal',
          contactId: null,
          agentId: null,
          archived: false,
        },
        orderBy: { lastMessageAt: 'desc' },
        include: conversationInclude,
      });
      if (generalConv) return generalConv;
    }
  }

  const title = resolveConversationDisplayTitle({
    channel: input.channel,
    contactName: input.contactName,
    contactIdentifier: input.contactIdentifier,
    agentName: input.agentName,
    legacyTitle: input.legacyTitle,
  });

  return prisma.conversation.create({
    data: {
      userId: input.userId,
      context: input.context ?? ContextType.GERAL,
      title: title.slice(0, 240),
      channel: input.channel,
      contactId: input.contactId ?? undefined,
      agentId: input.agentId ?? undefined,
      contactIdentifier: input.contactIdentifier ?? undefined,
    },
    include: conversationInclude,
  });
}

export async function prepareConversationForMessage(input: {
  userId: string;
  conversationId?: string;
  forceNew?: boolean;
  promptChannel: AgentPromptChannel;
  agentTest?: boolean;
  context?: ContextType;
  assignedAgentId?: string | null;
  customerPhone?: string | null;
  customerWhatsappId?: string | null;
  customerName?: string | null;
  conversationTitle?: string | null;
  customerContextConversationId?: string | null;
}): Promise<ConversationWithRelations> {
  const channel = promptChannelToStorageChannel(input.promptChannel, input.agentTest);

  const contact =
    input.customerPhone || input.customerWhatsappId
      ? await resolveContactWithBinding({
          userId: input.userId,
          phone: input.customerPhone,
          whatsappId: input.customerWhatsappId,
        })
      : null;
  const contactId = contact?.id ?? null;

  const boundAgent = contact?.contactAgent?.agent?.isActive ? contact.contactAgent.agent : null;
  let agentId = input.agentTest ? input.assignedAgentId ?? null : boundAgent?.id ?? null;
  let agentName: string | null = boundAgent?.name ?? null;

  if (input.agentTest && agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId: input.userId, isActive: true },
      select: { id: true, name: true },
    });
    if (agent) {
      agentName = agent.name;
    } else {
      agentId = null;
      agentName = null;
    }
  }

  const contactIdentifier = resolveContactIdentifier({
    phone: input.customerPhone,
    whatsappId: input.customerWhatsappId,
  });

  let conversationId = input.conversationId;
  if (!conversationId && input.customerContextConversationId && !input.forceNew && !input.agentTest) {
    const linked = await prisma.conversation.findFirst({
      where: {
        id: input.customerContextConversationId,
        userId: input.userId,
        archived: false,
      },
      select: { id: true },
    });
    if (linked) conversationId = linked.id;
  }

  return findOrCreateConversation({
    userId: input.userId,
    conversationId,
    forceNew: input.forceNew,
    channel,
    context: input.context,
    contactId,
    agentId,
    contactIdentifier,
    contactName: input.customerName ?? contact?.name ?? null,
    agentName,
    legacyTitle: input.conversationTitle,
  });
}

export async function syncConversationAfterTurn(input: {
  conversationId: string;
  userId: string;
  lastMessageContent: string;
  agent: Pick<Agent, 'id' | 'name'>;
  contactId?: string | null;
  contactName?: string | null;
  contactIdentifier?: string | null;
  channel: ConversationChannel;
}): Promise<ConversationIdentityMeta> {
  const preview = buildMessagePreview(input.lastMessageContent);
  const title = resolveConversationDisplayTitle({
    channel: input.channel,
    contactName: input.contactName,
    contactIdentifier: input.contactIdentifier,
    agentName: input.agent.name,
  });

  const updated = await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      title: title.slice(0, 240),
      agentId: input.agent.id,
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.contactIdentifier ? { contactIdentifier: input.contactIdentifier } : {}),
    },
    include: conversationInclude,
  });

  return mapConversationIdentityMeta(updated, input.agent);
}

export async function loadConversationIdentity(
  userId: string,
  conversationId: string,
): Promise<ConversationIdentityMeta | null> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: conversationInclude,
  });
  if (!conv) return null;
  return mapConversationIdentityMeta(conv);
}

export async function listConversationItems(userId: string, includeArchived: boolean): Promise<ConversationListItem[]> {
  const items = await prisma.conversation.findMany({
    where: {
      userId,
      ...(includeArchived ? {} : { archived: false }),
    },
    orderBy: [{ pinned: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    include: {
      ...conversationInclude,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } },
    },
  });

  return items.map((item) => mapConversationToListItem(item, item.messages[0]?.content));
}
