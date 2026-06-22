import { ContextType, MessageRole, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { generateAssistantReply, syncAiRuntimePreference } from '../ai/aiService';
import { env } from '../../config/env';
import { classifyUserMessage, maybeAutoCreateArtifact } from './interpretation.service';
import { fetchRelatedContext } from './context.service';
import { buildAgentPrompt, EMPTY_RELATED_CONTEXT, type AgentPromptChannel } from './prompt.service';
import type { AgentMeta, AgentInterpretation } from './agent.types';
import { repairBrokenAccents, sanitizeAgentClientReply } from '../../lib/textEncoding';
import { maybeCreateSalesHandoff } from '../sales/handoff.service';
import { ensureRonanFounderProfile } from './founderProfile.service';
import {
  detectErpNaturalIntent,
  executeErpReadIntent,
  executeErpWriteIntent,
  summarizeWriteIntent,
  type ErpNaturalIntent,
} from '../integrations/olistWhatsAppAgent.service';
import { setErpWritePendingForWeb, takeErpWritePendingForWeb } from '../integrations/erpWebWritePendingStore';
import { analyzeLeadConversation, isColdLead, type LeadDecision } from '../../ai/lead-decision-engine';
import { createTask } from '../tasks/tasks.service';
import { saveMemory } from '../memory/memory.service';
import { buildImageBrief, createImageJob, hasActiveImageJobForConversation, startImageJob } from './imageGeneration.service';
import {
  buildCustomerContextSystemMessage,
  findOrCreateCustomerContext,
  findRecentConversationIdForCustomer,
  getCustomerContextByConversation,
  updateCustomerContextAfterInteraction,
} from '../customers/customerContext.service';

export type ProcessAgentMessageInput = {
  userId: string;
  content: string;
  conversationId?: string;
  context?: ContextType;
  /** Origem do prompt: web, cliente WhatsApp ou operador no WhatsApp. */
  channel?: AgentPromptChannel;
  /** Título inicial ao criar conversa (ex.: WhatsApp operador). */
  conversationTitle?: string;
  customerPhone?: string;
  customerWhatsappId?: string;
  customerName?: string;
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

async function finalizeSimpleAgentReply(input: {
  userId: string;
  channel: AgentPromptChannel;
  conversationId: string;
  userMsg: ProcessAgentMessageOutput['userMessage'];
}): Promise<ProcessAgentMessageOutput> {
  const { userId, channel, conversationId, userMsg } = input;

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50,
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

  const interpretation: AgentInterpretation = {
    context: ContextType.GERAL,
    kind: 'message',
    confidence: 1,
    rationale: 'Modo agente simples (RESET-CEREBRO)',
  };

  const promptMessages = buildAgentPrompt({
    interpretation,
    related: EMPTY_RELATED_CONTEXT,
    conversationMessages,
    channel,
  });

  const replyText = sanitizeAgentClientReply(
    repairBrokenAccents(await generateAssistantReply(promptMessages)),
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
    agentMeta: {
      contextDetected: interpretation.context,
      kindDetected: interpretation.kind,
      confidence: interpretation.confidence,
      autoCreated: {},
      rationale: interpretation.rationale,
    },
  };
}

async function executeLeadDecisionActions(input: {
  userId: string;
  conversationId: string;
  customerMessage: string;
  conversationMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  decision: LeadDecision;
}): Promise<AgentMeta['autoCreated']> {
  const { userId, conversationId, customerMessage, conversationMessages, decision } = input;
  const autoCreated: AgentMeta['autoCreated'] = {};
  const marker = `lead-decision:${conversationId}`;
  const conversationSummary = conversationMessages
    .filter((message) => message.role === 'user')
    .slice(-5)
    .map((message) => `- ${message.content.slice(0, 220)}`)
    .join('\n');
  const titleByContext =
    decision.recommendedAction === 'escalar_para_humano'
      ? 'Atendimento prioritario: lead de alto potencial'
      : decision.recommendedAction === 'sugerir_visita'
        ? 'Agendar visita tecnica com lead'
        : decision.recommendedAction === 'sugerir_proposta'
          ? 'Montar proposta base para lead'
          : `Atender lead ${decision.intentLevel}`;

  if (decision.shouldCreateTask) {
    const existing = await prisma.task.findFirst({
      where: {
        userId,
        description: { contains: marker },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
      select: { id: true },
    });
    if (!existing) {
      const task = await createTask({
        userId,
        title: titleByContext,
        description: [
          marker,
          'Resumo da conversa:',
          conversationSummary || `- ${customerMessage.slice(0, 220)}`,
          '',
          `leadScore=${decision.leadScore}`,
          `readinessScore=${decision.readinessScore}`,
          `intentLevel=${decision.intentLevel}`,
          `acao=${decision.recommendedAction}`,
          `motivo=${decision.reason}`,
          `faltando=${decision.missingInfo.join(', ') || 'nada relevante'}`,
        ].join('\n'),
        context: ContextType.MOBLE,
        priority: decision.leadScore > 70 ? TaskPriority.HIGH : TaskPriority.MEDIUM,
      });
      autoCreated.taskId = task.id;
    }
  }

  if (decision.shouldSaveMemory) {
    const existing = await prisma.memory.findFirst({
      where: {
        userId,
        title: { startsWith: 'LeadDecision:' },
        content: { contains: marker },
      },
      select: { id: true },
    });
    if (!existing) {
      const memory = await saveMemory({
        userId,
        title: `LeadDecision: ${customerMessage.slice(0, 70)}`,
        dadosRelevantes: [
          marker,
          `leadScore=${decision.leadScore}`,
          `readinessScore=${decision.readinessScore}`,
          `intentLevel=${decision.intentLevel}`,
          `missingInfo=${decision.missingInfo.join(', ')}`,
          `mensagem=${customerMessage.slice(0, 1000)}`,
        ].join('\n'),
        contexto: ContextType.MOBLE,
      });
      autoCreated.memoryId = memory.id;
    }
  }

  return autoCreated;
}

export async function processAgentMessage(
  input: ProcessAgentMessageInput,
): Promise<ProcessAgentMessageOutput> {
  const userId = input.userId;
  const channel: AgentPromptChannel = input.channel ?? 'web';
  await syncAiRuntimePreference(userId);
  if (channel === 'whatsapp_admin' || channel === 'web') {
    await ensureRonanFounderProfile(userId);
  }
  let conversationId = input.conversationId;
  let conversationContext = input.context;
  let conversationTitle = input.conversationTitle ?? null;
  let customerContext =
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
    const initialContext =
      channel === 'whatsapp_admin' ? ContextType.GERAL : (input.context ?? ContextType.GERAL);
    const conv = await prisma.conversation.create({
      data: {
        userId,
        context: initialContext,
        title: initialTitle.slice(0, 80),
      },
    });
    conversationId = conv.id;
    conversationContext = conv.context;
    conversationTitle = conv.title;
  } else {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conv) {
      throw new Error('Conversa não encontrada');
    }
    conversationContext = conv.context;
    conversationTitle = conv.title;
    if (!customerContext) {
      customerContext = await getCustomerContextByConversation(userId, conversationId);
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
            agentMeta: {
              contextDetected: input.context ?? ContextType.GERAL,
              kindDetected: 'message',
              confidence: 1,
              autoCreated: {},
              rationale: 'Falha ao confirmar operação ERP.',
            },
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
            agentMeta: {
              contextDetected: input.context ?? ContextType.GERAL,
              kindDetected: 'message',
              confidence: 1,
              autoCreated: {},
              rationale: w.ok ? 'Operação Olist executada (confirmação web).' : 'Falha operação Olist.',
            },
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
          agentMeta: {
            contextDetected: input.context ?? ContextType.GERAL,
            kindDetected: 'message',
            confidence: 1,
            autoCreated: {},
            rationale: 'Rejeição de confirmação ERP no web.',
          },
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
      agentMeta: {
        contextDetected: input.context ?? ContextType.GERAL,
        kindDetected: 'message',
        confidence: 1,
        autoCreated: {},
        rationale: 'Instrução Olist (faltou dado).',
      },
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
      agentMeta: {
        contextDetected: input.context ?? ContextType.GERAL,
        kindDetected: 'message',
        confidence: 1,
        autoCreated: {},
        rationale: 'Pendente confirmação escrita Olist (web).',
      },
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
      const agentMeta: AgentMeta = {
        contextDetected: input.context ?? ContextType.GERAL,
        kindDetected: 'message',
        confidence: 1,
        autoCreated: {},
        rationale: 'Resposta factível ERP (Olist) sem alucinação do modelo.',
      };
      return {
        conversationId,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        agentMeta,
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
      agentMeta: {
        contextDetected: input.context ?? ContextType.GERAL,
        kindDetected: 'message',
        confidence: 1,
        autoCreated: {},
        rationale: 'Falha na consulta ERP (Olist).',
      },
    };
  }

  if (env.MOBI_SIMPLE_AGENT) {
    return finalizeSimpleAgentReply({
      userId,
      channel,
      conversationId,
      userMsg,
    });
  }

  const interpretation = await classifyUserMessage({
    content: input.content,
    forcedContext:
      channel === 'whatsapp_admin'
        ? ContextType.GERAL
        : input.context !== undefined
          ? input.context
          : undefined,
  });

  if (interpretation.context !== conversationContext) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { context: interpretation.context, updatedAt: new Date(), lastMessageAt: new Date() },
    });
    conversationContext = interpretation.context;
  } else {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
  }

  let autoCreated = await maybeAutoCreateArtifact({
    userId,
    content: input.content,
    interpretation,
  });

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50,
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

  const isContextResume =
    customerContext &&
    customerContext.status !== 'novo' &&
    history.filter((message) => message.role === MessageRole.USER).length === 1 &&
    (isColdLead(input.content) || /continuando|sobre aquele|e ai|e aí|pode fazer|me manda/i.test(input.content));
  if (isContextResume) {
    const resumeContext = customerContext!;
    const project = resumeContext.currentProject ?? {};
    const projectSummary =
      resumeContext.conversationSummary ??
      ([project.ambiente, project.medidas, project.intencao].filter(Boolean).join(', ') ||
        'o projeto que a gente estava vendo');
    const replyText = repairBrokenAccents(
      resumeContext.lastInteractionAt && Date.now() - resumeContext.lastInteractionAt.getTime() > 30 * 24 * 60 * 60 * 1000
        ? `Fala! Vi que a gente tinha conversado sobre ${project.ambiente ?? 'um projeto planejado'}. Quer retomar por ele ou é outro ambiente agora?`
        : `Fala! Vi aqui que a gente estava falando de ${projectSummary}. Quer continuar por essa ideia?`,
    );
    const assistantMsg = await prisma.message.create({
      data: { conversationId, role: MessageRole.ASSISTANT, content: replyText },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
    await updateCustomerContextAfterInteraction({
      context: resumeContext,
      userId,
      conversationId,
      messages: history.map((message) => ({ role: message.role, content: message.content })),
    });
    return {
      conversationId,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      agentMeta: {
        contextDetected: interpretation.context,
        kindDetected: interpretation.kind,
        confidence: interpretation.confidence,
        autoCreated,
        rationale: 'Retomada de atendimento por memória operacional do cliente.',
      },
    };
  }

  const erpIntent =
    channel === 'web' || channel === 'whatsapp_admin' ? detectErpNaturalIntent(input.content) : { type: 'none' as const };
  const relatedQuery =
    erpIntent.type === 'none'
      ? input.content
      : `${input.content}\nERP_INTENT=${
          erpIntent.type === 'read'
            ? erpIntent.intent.kind
            : erpIntent.type === 'write'
              ? erpIntent.intent.kind
              : erpIntent.type === 'erp_hint'
                ? 'hint'
                : 'none'
        }`;

  const related = await fetchRelatedContext({
    userId,
    context: interpretation.context,
    query: relatedQuery,
  });

  const leadDecision = channel !== 'whatsapp_admin' ? analyzeLeadConversation(conversationMessages) : undefined;
  if (leadDecision) {
    const decisionAutoCreated = await executeLeadDecisionActions({
      userId,
      conversationId,
      customerMessage: input.content,
      conversationMessages,
      decision: leadDecision,
    });
    autoCreated = { ...autoCreated, ...decisionAutoCreated };

    if (leadDecision.shouldGenerateImage) {
      const existingJob = await hasActiveImageJobForConversation(conversationId);
      if (!existingJob) {
        try {
          const imageBrief = buildImageBrief({
            title: conversationTitle,
            messages: history.map((message) => ({ role: message.role, content: message.content })),
          });
          if (imageBrief.canGenerate) {
            const imageJob = await createImageJob({
              conversationId,
              visualBrief: imageBrief.brief,
              prompt: imageBrief.visualPrompt,
            });
            const promptMessages = buildAgentPrompt({
              interpretation,
              related,
              conversationMessages,
              channel,
              customerContextMessage: buildCustomerContextSystemMessage(customerContext),
              leadPlaybook: leadDecision,
              playbookMode: 'image_pending',
            });
            const replyTextImg = repairBrokenAccents(await generateAssistantReply(promptMessages));
            const assistantMsg = await prisma.message.create({
              data: {
                conversationId,
                role: MessageRole.ASSISTANT,
                content: replyTextImg,
              },
            });
            await prisma.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date(), lastMessageAt: new Date() },
            });
            await updateCustomerContextAfterInteraction({
              context: customerContext,
              userId,
              conversationId,
              messages: history.map((message) => ({ role: message.role, content: message.content })),
              leadDecision,
            });
            startImageJob(imageJob.id);
            return {
              conversationId,
              userMessage: userMsg,
              assistantMessage: assistantMsg,
              agentMeta: {
                contextDetected: interpretation.context,
                kindDetected: interpretation.kind,
                confidence: interpretation.confidence,
                autoCreated,
                rationale: interpretation.rationale,
                leadDecision,
                imageJob: { id: imageJob.id, status: imageJob.status },
              },
            };
          }
        } catch (error) {
          console.log(
            `[chat-agent] falha ao gerar imagem automática: ${
              error instanceof Error ? error.message : 'erro desconhecido'
            }`,
          );
        }
      }
    }
  }

  const promptMessages = buildAgentPrompt({
    interpretation,
    related,
    conversationMessages,
    channel,
    customerContextMessage: buildCustomerContextSystemMessage(customerContext),
    leadPlaybook: leadDecision,
    playbookMode: 'default',
  });

  const replyTextRaw = await generateAssistantReply(promptMessages);
  const replyText = repairBrokenAccents(replyTextRaw);

  if (channel !== 'whatsapp_admin') {
    await maybeCreateSalesHandoff({
      userId,
      conversationId,
      customerMessage: input.content,
      assistantReply: replyText,
    });
  }

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
  await updateCustomerContextAfterInteraction({
    context: customerContext,
    userId,
    conversationId,
    messages: history.map((message) => ({ role: message.role, content: message.content })),
    leadDecision,
  });

  const agentMeta: AgentMeta = {
    contextDetected: interpretation.context,
    kindDetected: interpretation.kind,
    confidence: interpretation.confidence,
    autoCreated,
    rationale: interpretation.rationale,
    leadDecision,
  };

  return {
    conversationId,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    agentMeta,
  };
}
