import { Router } from 'express';
import { MessageRole, ProposalStatus, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { prisma } from '../../lib/prisma';
import { syncAiRuntimePreference, getAiRuntimeStatus } from '../ai/aiService';
import { whatsappService } from '../../services/whatsapp.service';
import { listOpenSalesHandoffs } from '../sales/handoff.service';
import { summarizeFinanceToday } from '../chat/financeCapture.service';
import { logSecurityEvent } from '../security/securityAudit.service';
import { listOlistAccountsPayable } from '../integrations/olist.service';
import { analyzeLeadConversation } from '../../ai/lead-decision-engine';

export const operatorRouter = Router();
operatorRouter.use(authMiddleware);

function extractOpportunity(text: string | null): string | null {
  if (!text) return null;
  const budget = text.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\d+)\s*(?:k|mil|reais)?/i);
  const client = text.match(/cliente[:=]\s*([^\n]+)/i)?.[1]?.trim();
  if (!budget) return client ? `cliente ${client.slice(0, 80)}` : text.slice(0, 120);
  const rawValue = budget[0].trim();
  return client ? `${client.slice(0, 70)} com orçamento de ${rawValue}` : `cliente com orçamento de ${rawValue}`;
}

async function countOpenPayables(userId: string): Promise<number> {
  try {
    const result = await listOlistAccountsPayable({ userId, page: 1, limit: 100 });
    if (!result.ok) return 0;
    return result.items.length;
  } catch {
    return 0;
  }
}

function mapMessageRole(role: MessageRole): 'user' | 'assistant' | 'system' {
  if (role === MessageRole.USER) return 'user';
  if (role === MessageRole.ASSISTANT) return 'assistant';
  return 'system';
}

operatorRouter.get('/overview', async (req, res, next) => {
  try {
    const userId = req.userId!;
    await syncAiRuntimePreference(userId);
    const aiStatus = getAiRuntimeStatus();
    const whatsappStatus = whatsappService.getStatus();
    const whatsappContacts = whatsappService.listContactControls();

    const [
      openHandoffs,
      totalConversations,
      archivedConversations,
      messagesLast24h,
      openTasks,
      recentSecurity,
      openLeadTasks,
      openPayables,
      recentConversations,
      draftProposals,
      sentProposals,
      approvedProposals,
      lostProposals,
      recentProposals,
    ] =
      await Promise.all([
        listOpenSalesHandoffs(userId),
        prisma.conversation.count({ where: { userId } }),
        prisma.conversation.count({ where: { userId, archived: true } }),
        prisma.message.count({
          where: {
            conversation: { userId },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.task.count({
          where: {
            userId,
            status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          },
        }),
        prisma.memory.findMany({
          where: { userId, title: { startsWith: 'SECURITY_AUDIT:' } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, title: true, content: true, createdAt: true },
        }),
        prisma.task.findMany({
          where: {
            userId,
            title: { startsWith: 'Atender lead:' },
            status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, title: true, description: true },
        }),
        countOpenPayables(userId),
        prisma.conversation.findMany({
          where: { userId, archived: false },
          orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
          take: 8,
          select: {
            id: true,
            title: true,
            context: true,
            lastMessageAt: true,
            updatedAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: { role: true, content: true },
            },
          },
        }),
        prisma.proposal.count({ where: { userId, status: ProposalStatus.DRAFT } }),
        prisma.proposal.count({ where: { userId, status: ProposalStatus.SENT } }),
        prisma.proposal.count({ where: { userId, status: ProposalStatus.APPROVED } }),
        prisma.proposal.count({ where: { userId, status: ProposalStatus.LOST } }),
        prisma.proposal.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            status: true,
            valueEstimate: true,
            updatedAt: true,
          },
        }),
      ]);

    const financeToday = await summarizeFinanceToday(userId);
    const recentLeadConversations = recentConversations.map((conversation) => {
      const decision = analyzeLeadConversation(
        [...conversation.messages]
          .reverse()
          .map((message) => ({ role: mapMessageRole(message.role), content: message.content })),
      );
      return {
        id: conversation.id,
        title: conversation.title ?? 'Conversa sem título',
        context: conversation.context,
        lastMessageAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
        leadScore: decision.leadScore,
        readinessScore: decision.readinessScore,
        intentLevel: decision.intentLevel,
        recommendedAction: decision.recommendedAction,
        nextMessageSuggestion: decision.nextMessageSuggestion,
      };
    });
    const hotLeadCount = recentLeadConversations.filter((item) =>
      ['interessado', 'quente', 'pronto_para_fechamento'].includes(item.intentLevel),
    ).length;

    res.json({
      updatedAt: new Date().toISOString(),
      ai: aiStatus,
      whatsapp: {
        status: whatsappStatus,
        recentContacts: whatsappContacts.slice(0, 10),
      },
      metrics: {
        openTasks,
        openHandoffs: openHandoffs.length,
        totalConversations,
        archivedConversations,
        messagesLast24h,
      },
      operationalSummary: {
        leads_abertos: openHandoffs.length + openLeadTasks.length,
        tarefas_pendentes: openTasks,
        contas_a_pagar: openPayables,
        oportunidades: [...openHandoffs, ...openLeadTasks]
          .map((item) => extractOpportunity(item.description ?? item.title))
          .filter((item): item is string => Boolean(item))
          .slice(0, 5),
      },
      commercialFunnel: {
        hotLeads: hotLeadCount,
        handoffs: openHandoffs.length,
        proposals: {
          draft: draftProposals,
          sent: sentProposals,
          approved: approvedProposals,
          lost: lostProposals,
        },
        recentProposals: recentProposals.map((proposal) => ({
          id: proposal.id,
          title: proposal.title,
          status: proposal.status,
          valueEstimate: proposal.valueEstimate,
          updatedAt: proposal.updatedAt.toISOString(),
        })),
      },
      recentLeadConversations,
      financeToday,
      security: {
        recentEvents: recentSecurity,
      },
    });
  } catch (e) {
    next(e);
  }
});

const modeSchema = z.object({
  mode: z.enum(['agent', 'manual']),
});

operatorRouter.post('/actions/whatsapp-mode', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido. Use mode: "agent" | "manual"' });
      return;
    }
    const status = whatsappService.setAutoReplyMode(parsed.data.mode);
    await logSecurityEvent({
      userId,
      source: 'operator_panel',
      action: 'whatsapp_mode_change',
      details: `mode=${parsed.data.mode}`,
    });
    res.json(status);
  } catch (e) {
    next(e);
  }
});

