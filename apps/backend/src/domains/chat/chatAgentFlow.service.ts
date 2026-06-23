import { ContextType, MessageRole, type Agent } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { generateAssistantReply, syncAiRuntimePreference } from '../ai/aiService';
import { buildDynamicAgentPrompt } from '../agents/agentPrompt.service';
import { resolveAgentForMessage } from '../agents/agentResolver.service';
import { touchContactInteraction } from '../contacts/contact.service';
import { tryHandleBlingStockQuery } from '../integrations/blingAgent.service';
import { ROUTER_HISTORY_MESSAGES, type AgentPromptChannel } from './prompt.service';
import {
  classifyFromConversation,
  detectRouterPhase,
  type RouterCategory,
} from './router.service';
import type { AgentMeta, AgentInterpretation } from './agent.types';
import {
  clampMinimalReply,
  repairBrokenAccents,
  sanitizeAgentClientReply,
} from '../../lib/textEncoding';
import {
  detectErpNaturalIntent,
  executeErpReadIntent,
  executeErpWriteIntent,
  summarizeWriteIntent,
  type ErpNaturalIntent,
} from '../integrations/olistWhatsAppAgent.service';
import { setErpWritePendingForWeb, takeErpWritePendingForWeb } from '../integrations/erpWebWritePendingStore';
import {
  findOrCreateCustomerContext,
  findRecentConversationIdForCustomer,
  updateCustomerContextAfterInteraction,
  type CustomerContextRecord,
} from '../customers/customerContext.service';
import {
  canUpdateConversationContactId,
  findOrCreateConversation,
  type ConversationChannel,
  type ConversationIdentityMeta,
  prepareConversationForMessage,
  promptChannelToStorageChannel,
  resolveContactIdentifier,
  syncConversationAfterTurn,
  type ConversationWithRelations,
} from './conversationIdentity.service';

export type ProcessAgentMessageInput = {
  userId: string;
  content: string;
  conversationId?: string;
  context?: ContextType;
  channel?: AgentPromptChannel;
  conversationTitle?: string;
  customerPhone?: string;
  customerWhatsappId?: string;
  customerName?: string;
  assignedAgentId?: string | null;
  forceNew?: boolean;
  agentTest?: boolean;
};

export type ProcessAgentMessageOutput = {
  conversationId: string;
  userMessage: { id: string; conversationId: string; role: MessageRole; content: string; createdAt: Date };
  assistantMessage: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: string;
    createdAt: Date;
  };
  agentMeta: AgentMeta;
  agentName: string;
  conversationIdentity: ConversationIdentityMeta;
};

function routerAgentMeta(input: {
  interpretation: AgentInterpretation;
  routerCategory: RouterCategory | null;
}): AgentMeta {
  return {
    contextDetected: input.interpretation.context,
    kindDetected: input.interpretation.kind,
    confidence: input.interpretation.confidence,
    autoCreated: {},
    rationale: input.interpretation.rationale,
    routerCategory: input.routerCategory ?? undefined,
  };
}

type TurnContext = {
  userId: string;
  storageChannel: ConversationChannel;
  conversationId: string;
  contactId: string | null;
  contactDisplayName: string | null;
  contactIdentifier: string | null;
  customerContext: CustomerContextRecord | null;
  userContent: string;
};

async function completeTurn(input: {
  turn: TurnContext;
  userMsg: ProcessAgentMessageOutput['userMessage'];
  assistantMsg: ProcessAgentMessageOutput['assistantMessage'];
  agentMeta: AgentMeta;
  agent: Pick<Agent, 'id' | 'name'>;
}): Promise<ProcessAgentMessageOutput> {
  const conversationIdentity = await syncConversationAfterTurn({
    conversationId: input.turn.conversationId,
    userId: input.turn.userId,
    lastMessageContent: input.assistantMsg.content,
    agent: input.agent,
    contactId: input.turn.contactId,
    contactName: input.turn.contactDisplayName,
    contactIdentifier: input.turn.contactIdentifier,
    channel: input.turn.storageChannel,
  });

  if (input.turn.customerContext) {
    const history = await prisma.message.findMany({
      where: { conversationId: input.turn.conversationId },
      orderBy: { createdAt: 'asc' },
      take: ROUTER_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });
    await updateCustomerContextAfterInteraction({
      context: input.turn.customerContext,
      userId: input.turn.userId,
      conversationId: input.turn.conversationId,
      messages: history,
    });
  }

  return {
    conversationId: input.turn.conversationId,
    userMessage: input.userMsg,
    assistantMessage: input.assistantMsg,
    agentMeta: input.agentMeta,
    agentName: input.agent.name,
    conversationIdentity,
  };
}

async function resolveTurnAgent(
  userId: string,
  input: ProcessAgentMessageInput,
  conversation: ConversationWithRelations,
): Promise<Agent> {
  return resolveAgentForMessage({
    userId,
    agentId: input.assignedAgentId,
    agentTest: input.agentTest,
    phone: input.customerPhone,
    whatsappId: input.customerWhatsappId,
    contactId: conversation.contactId,
    conversationAgentId: conversation.agentId,
  });
}

async function finalizeRouterAgentReply(input: {
  channel: AgentPromptChannel;
  turn: TurnContext;
  userMsg: ProcessAgentMessageOutput['userMessage'];
  contactDisplayName?: string | null;
  agent: Agent;
}): Promise<ProcessAgentMessageOutput> {
  const { channel, turn, userMsg, contactDisplayName, agent } = input;

  const history = await prisma.message.findMany({
    where: { conversationId: turn.conversationId },
    orderBy: { createdAt: 'asc' },
    take: ROUTER_HISTORY_MESSAGES,
  });

  const conversationMessages = history.map((m) => {
    const role =
      m.role === MessageRole.USER
        ? ('user' as const)
        : m.role === MessageRole.ASSISTANT
          ? ('assistant' as const)
          : ('system' as const);
    return { role, content: m.content };
  });

  const routerCategory = classifyFromConversation(conversationMessages);
  const routerPhase = detectRouterPhase(conversationMessages, routerCategory);

  const interpretation: AgentInterpretation = {
    context: ContextType.GERAL,
    kind: 'message',
    confidence: 1,
    rationale: `Agente=${agent.name} fase=${routerPhase}${routerCategory ? ` categoria=${routerCategory}` : ''}`,
  };

  const promptMessages = buildDynamicAgentPrompt({
    agent,
    conversationMessages,
    channel,
    contactDisplayName,
  });

  const replyText = clampMinimalReply(
    sanitizeAgentClientReply(
      repairBrokenAccents(await generateAssistantReply(promptMessages)),
    ),
  );

  const assistantMsg = await prisma.message.create({
    data: {
      conversationId: turn.conversationId,
      role: MessageRole.ASSISTANT,
      content: replyText,
    },
  });

  return completeTurn({
    turn,
    userMsg,
    assistantMsg,
    agentMeta: routerAgentMeta({ interpretation, routerCategory }),
    agent,
  });
}

export async function processAgentMessage(
  input: ProcessAgentMessageInput,
): Promise<ProcessAgentMessageOutput> {
  const userId = input.userId;
  const channel: AgentPromptChannel = input.channel ?? 'web';
  await syncAiRuntimePreference(userId);

  const customerContext =
    input.customerPhone || input.customerWhatsappId
      ? await findOrCreateCustomerContext({
          userId,
          phone: input.customerPhone,
          whatsappId: input.customerWhatsappId,
          name: input.customerName,
        })
      : null;

  const customerContextConversationId =
    !input.conversationId && customerContext
      ? await findRecentConversationIdForCustomer(customerContext, 30)
      : null;

  const conversation = await prepareConversationForMessage({
    userId,
    conversationId: input.conversationId,
    forceNew: input.forceNew,
    promptChannel: channel,
    agentTest: input.agentTest,
    context: channel === 'whatsapp_admin' ? ContextType.GERAL : (input.context ?? ContextType.GERAL),
    assignedAgentId: input.assignedAgentId,
    customerPhone: input.customerPhone,
    customerWhatsappId: input.customerWhatsappId,
    customerName: input.customerName,
    conversationTitle: input.conversationTitle,
    customerContextConversationId,
  });

  let activeConversation = conversation;

  let conversationId = activeConversation.id;
  const storageChannel = promptChannelToStorageChannel(channel, input.agentTest);
  const contactDisplayName =
    input.customerName?.trim() || customerContext?.name?.trim() || activeConversation.contact?.name?.trim() || null;
  const contactIdentifier = resolveContactIdentifier({
    contact: activeConversation.contact,
    phone: input.customerPhone,
    whatsappId: input.customerWhatsappId,
    storedIdentifier: activeConversation.contactIdentifier,
  });

  const resolvedContactId = activeConversation.contact?.id ?? null;
  if (
    resolvedContactId &&
    activeConversation.contactId &&
    activeConversation.contactId !== resolvedContactId
  ) {
    activeConversation = await findOrCreateConversation({
      userId,
      channel: storageChannel,
      contactId: resolvedContactId,
      agentId: activeConversation.agentId,
      contactIdentifier,
      contactName: contactDisplayName,
    });
    conversationId = activeConversation.id;
  }

  const turn: TurnContext = {
    userId,
    storageChannel,
    conversationId,
    contactId: activeConversation.contactId,
    contactDisplayName,
    contactIdentifier,
    customerContext,
    userContent: input.content,
  };

  const userMsg = await prisma.message.create({
    data: {
      conversationId,
      role: MessageRole.USER,
      content: input.content,
    },
  });

  if (channel === 'web') {
    const confirmM = input.content.match(/^\s*!?\s*confirmar\s+([A-Z0-9]+)\s*$/i);
    if (confirmM) {
      const took = await takeErpWritePendingForWeb(userId, confirmM[1]!);
      const agent = await resolveTurnAgent(userId, input, activeConversation);
      if (took.ok) {
        let parsed: ErpNaturalIntent;
        try {
          parsed = JSON.parse(took.jsonPayload) as ErpNaturalIntent;
        } catch {
          const assistantMsg = await prisma.message.create({
            data: {
              conversationId,
              role: MessageRole.ASSISTANT,
              content: 'Confirmação inválida (dados corrompidos). Refaça a inclusão e peça o novo código.',
            },
          });
          return completeTurn({
            turn,
            userMsg,
            assistantMsg,
            agentMeta: routerAgentMeta({
              interpretation: {
                context: ContextType.GERAL,
                kind: 'message',
                confidence: 1,
                rationale: 'Falha ao confirmar operação ERP.',
              },
              routerCategory: null,
            }),
            agent,
          });
        }
        if (parsed.type === 'write') {
          const w = await executeErpWriteIntent(userId, parsed.intent);
          const replyText = repairBrokenAccents(
            w.ok ? w.reply : `Falha ao executar na Olist: ${w.reason}`.slice(0, 12_000),
          );
          const assistantMsg = await prisma.message.create({
            data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
          });
          return completeTurn({
            turn,
            userMsg,
            assistantMsg,
            agentMeta: routerAgentMeta({
              interpretation: {
                context: ContextType.GERAL,
                kind: 'message',
                confidence: 1,
                rationale: w.ok ? 'Operação Olist executada (confirmação web).' : 'Falha operação Olist.',
              },
              routerCategory: null,
            }),
            agent,
          });
        }
      } else {
        const assistantMsg = await prisma.message.create({
          data: { conversationId, role: MessageRole.ASSISTANT, content: took.reason },
        });
        return completeTurn({
          turn,
          userMsg,
          assistantMsg,
          agentMeta: routerAgentMeta({
            interpretation: {
              context: ContextType.GERAL,
              kind: 'message',
              confidence: 1,
              rationale: 'Rejeição de confirmação ERP no web.',
            },
            routerCategory: null,
          }),
          agent,
        });
      }
    }
  }

  const erpIntentEarly =
    channel === 'web' || channel === 'whatsapp_admin' ? detectErpNaturalIntent(input.content) : { type: 'none' as const };

  const turnAgent = await resolveTurnAgent(userId, input, activeConversation);

  if (erpIntentEarly.type === 'erp_hint') {
    const replyText = repairBrokenAccents(erpIntentEarly.text.slice(0, 12_000));
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
    });
    return completeTurn({
      turn,
      userMsg,
      assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Instrução Olist (faltou dado).',
        },
        routerCategory: null,
      }),
      agent: turnAgent,
    });
  }

  if (channel === 'web' && erpIntentEarly.type === 'write') {
    const code = await setErpWritePendingForWeb(userId, JSON.stringify(erpIntentEarly));
    const summary = summarizeWriteIntent(erpIntentEarly.intent);
    const replyText = repairBrokenAccents(
      `Operação **sensível** na Olist (conta a pagar/receber, etc.):\n${summary}\n\n` +
        `Responda **nesta conversa** em até 2 minutos (uma linha):\n` +
        `confirmar ${code}\n\n` +
        `Se o valor ou descrição estiver errado, cancele e envie a mensagem corrigida em vez de confirmar.`,
    );
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
    });
    return completeTurn({
      turn,
      userMsg,
      assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Pendente confirmação escrita Olist (web).',
        },
        routerCategory: null,
      }),
      agent: turnAgent,
    });
  }

  if (erpIntentEarly.type === 'read') {
    const read = await executeErpReadIntent(userId, erpIntentEarly.intent);
    if (read.ok) {
      const replyText = repairBrokenAccents(read.reply.slice(0, 12_000));
      const assistantMsg = await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: replyText,
        },
      });
      return completeTurn({
        turn,
        userMsg,
        assistantMsg,
        agentMeta: routerAgentMeta({
          interpretation: {
            context: ContextType.GERAL,
            kind: 'message',
            confidence: 1,
            rationale: 'Resposta factível ERP (Olist) sem alucinação do modelo.',
          },
          routerCategory: null,
        }),
        agent: turnAgent,
      });
    }
    const errText = `Não foi possível consultar a Olist de forma fática. Detalhe: ${read.reason}`;
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: errText },
    });
    return completeTurn({
      turn,
      userMsg,
      assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Falha na consulta ERP (Olist).',
        },
        routerCategory: null,
      }),
      agent: turnAgent,
    });
  }

  const resolvedAgent = await resolveTurnAgent(userId, input, activeConversation);

  const blingReply = await tryHandleBlingStockQuery({
    userId,
    agent: resolvedAgent,
    content: input.content,
  });
  if (blingReply) {
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: blingReply },
    });
    return completeTurn({
      turn,
      userMsg,
      assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'consultar_estoque_bling_multi_lojas',
        },
        routerCategory: null,
      }),
      agent: resolvedAgent,
    });
  }

  if (input.customerPhone || input.customerWhatsappId) {
    const contact = await touchContactInteraction({
      userId,
      phone: input.customerPhone,
      whatsappId: input.customerWhatsappId,
      name: contactDisplayName,
      lastMessage: input.content.slice(0, 200),
    });
    if (contact) {
      turn.contactId = contact.id;
      if (activeConversation.contactId && activeConversation.contactId !== contact.id) {
        console.warn('[chat] contact/conversation mismatch blocked', {
          conversationId: activeConversation.id,
          conversationContactId: activeConversation.contactId,
          messageContactId: contact.id,
        });
        activeConversation = await findOrCreateConversation({
          userId,
          channel: storageChannel,
          contactId: contact.id,
          agentId: contact.agentId ?? activeConversation.agentId ?? null,
          contactIdentifier,
          contactName: contact.name,
        });
        conversationId = activeConversation.id;
        turn.conversationId = conversationId;
        await prisma.message.update({
          where: { id: userMsg.id },
          data: { conversationId },
        });
      } else if (
        canUpdateConversationContactId({
          conversationContactId: activeConversation.contactId,
          expectedContactId: contact.id,
        })
      ) {
        const updateData: { contactId?: string; agentId?: string } = {};
        if (!activeConversation.contactId) updateData.contactId = contact.id;
        if (contact.agentId) updateData.agentId = contact.agentId;
        if (Object.keys(updateData).length > 0) {
          activeConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            include: {
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
            },
          });
        }
      }
    }
  }

  const finalAgent = await resolveTurnAgent(userId, input, activeConversation);

  return finalizeRouterAgentReply({
    channel,
    turn,
    userMsg,
    contactDisplayName,
    agent: finalAgent,
  });
}
