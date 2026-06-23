import { ContextType, MessageRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { generateAssistantReply, syncAiRuntimePreference } from '../ai/aiService';
import { buildDynamicAgentPrompt } from '../agents/agentPrompt.service';
import { resolveAgentForMessage } from '../agents/agentResolver.service';
import { touchContactInteraction } from '../contacts/contact.service';
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
import { findOrCreateCustomerContext, findRecentConversationIdForCustomer } from '../customers/customerContext.service';

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

async function finalizeRouterAgentReply(input: {
  channel: AgentPromptChannel;
  conversationId: string;
  userMsg: ProcessAgentMessageOutput['userMessage'];
  contactDisplayName?: string | null;
  agent: Awaited<ReturnType<typeof resolveAgentForMessage>>;
}): Promise<ProcessAgentMessageOutput> {
  const { channel, conversationId, userMsg, contactDisplayName, agent } = input;

  const history = await prisma.message.findMany({
    where: { conversationId },
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
      conversationId,
      role: MessageRole.ASSISTANT,
      content: replyText,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date(), lastMessageAt: new Date() },
  });

  return {
    conversationId,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    agentMeta: routerAgentMeta({ interpretation, routerCategory }),
  };
}

export async function processAgentMessage(
  input: ProcessAgentMessageInput,
): Promise<ProcessAgentMessageOutput> {
  const userId = input.userId;
  const channel: AgentPromptChannel = input.channel ?? 'web';
  await syncAiRuntimePreference(userId);

  let conversationId = input.conversationId;
  const customerContext =
    input.customerPhone || input.customerWhatsappId
      ? await findOrCreateCustomerContext({
          userId,
          phone: input.customerPhone,
          whatsappId: input.customerWhatsappId,
          name: input.customerName,
        })
      : null;

  if (!conversationId && customerContext) {
    conversationId = await findRecentConversationIdForCustomer(customerContext, 30) ?? undefined;
  }

  if (!conversationId) {
    const initialTitle =
      input.conversationTitle?.trim() ||
      (channel === 'whatsapp_admin' ? 'WhatsApp · operador' : input.content.slice(0, 80));
    const conv = await prisma.conversation.create({
      data: {
        userId,
        context: channel === 'whatsapp_admin' ? ContextType.GERAL : (input.context ?? ContextType.GERAL),
        title: initialTitle.slice(0, 80),
      },
    });
    conversationId = conv.id;
  } else {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conv) {
      throw new Error('Conversa não encontrada');
    }
  }

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
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date(), lastMessageAt: new Date() },
          });
          return {
            conversationId,
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            agentMeta: routerAgentMeta({
              interpretation: {
                context: ContextType.GERAL,
                kind: 'message',
                confidence: 1,
                rationale: 'Falha ao confirmar operação ERP.',
              },
              routerCategory: null,
            }),
          };
        }
        if (parsed.type === 'write') {
          const w = await executeErpWriteIntent(userId, parsed.intent);
          const replyText = repairBrokenAccents(
            w.ok ? w.reply : `Falha ao executar na Olist: ${w.reason}`.slice(0, 12_000),
          );
          const assistantMsg = await prisma.message.create({
            data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
          });
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date(), lastMessageAt: new Date() },
          });
          return {
            conversationId,
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            agentMeta: routerAgentMeta({
              interpretation: {
                context: ContextType.GERAL,
                kind: 'message',
                confidence: 1,
                rationale: w.ok ? 'Operação Olist executada (confirmação web).' : 'Falha operação Olist.',
              },
              routerCategory: null,
            }),
          };
        }
      } else {
        const assistantMsg = await prisma.message.create({
          data: { conversationId, role: MessageRole.ASSISTANT, content: took.reason },
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date(), lastMessageAt: new Date() },
        });
        return {
          conversationId,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          agentMeta: routerAgentMeta({
            interpretation: {
              context: ContextType.GERAL,
              kind: 'message',
              confidence: 1,
              rationale: 'Rejeição de confirmação ERP no web.',
            },
            routerCategory: null,
          }),
        };
      }
    }
  }

  const erpIntentEarly =
    channel === 'web' || channel === 'whatsapp_admin' ? detectErpNaturalIntent(input.content) : { type: 'none' as const };

  if (erpIntentEarly.type === 'erp_hint') {
    const replyText = repairBrokenAccents(erpIntentEarly.text.slice(0, 12_000));
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
    return {
      conversationId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Instrução Olist (faltou dado).',
        },
        routerCategory: null,
      }),
    };
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
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
    return {
      conversationId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Pendente confirmação escrita Olist (web).',
        },
        routerCategory: null,
      }),
    };
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
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date(), lastMessageAt: new Date() },
      });
      return {
        conversationId,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        agentMeta: routerAgentMeta({
          interpretation: {
            context: ContextType.GERAL,
            kind: 'message',
            confidence: 1,
            rationale: 'Resposta factível ERP (Olist) sem alucinação do modelo.',
          },
          routerCategory: null,
        }),
      };
    }
    const errText = `Não foi possível consultar a Olist de forma fática. Detalhe: ${read.reason}`;
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: errText },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
    return {
      conversationId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      agentMeta: routerAgentMeta({
        interpretation: {
          context: ContextType.GERAL,
          kind: 'message',
          confidence: 1,
          rationale: 'Falha na consulta ERP (Olist).',
        },
        routerCategory: null,
      }),
    };
  }

  const contactDisplayName =
    input.customerName?.trim() || customerContext?.name?.trim() || null;

  const resolvedAgent = await resolveAgentForMessage({
    userId,
    agentId: input.assignedAgentId,
    phone: input.customerPhone,
    whatsappId: input.customerWhatsappId,
  });

  if (input.customerPhone || input.customerWhatsappId) {
    await touchContactInteraction({
      userId,
      phone: input.customerPhone,
      whatsappId: input.customerWhatsappId,
      name: contactDisplayName,
      lastMessage: input.content.slice(0, 200),
    });
  }

  return finalizeRouterAgentReply({
    channel,
    conversationId,
    userMsg,
    contactDisplayName,
    agent: resolvedAgent,
  });
}
