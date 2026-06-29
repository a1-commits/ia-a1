import type { Agent } from '@prisma/client';
import type { AgentPromptChannel } from './prompt.service';
import {
  classifyIntent,
  intentRequiresBling,
  type AgentIntent,
} from './intentRouter.service';
import { logAgentFlowComplete, logAgentFlowStage } from './agentFlowLogger.service';
import { executeBlingQuery } from '../integrations/blingQueryEngine.service';
import { hasProductDisambiguation } from '../integrations/productDisambiguationStore';
import {
  formatBlingStructuredResponse,
  formatConversationalResponse,
} from './responseFormatter.service';
import { agentHasBlingTool } from '../integrations/bling.service';

export type AgentEngineResult = {
  replyText: string;
  intent: AgentIntent;
  rationale: string;
  tool: string | null;
  queryExecuted: boolean;
  resultKind: string | null;
};

export async function runAgentEngine(input: {
  agent: Agent;
  userId: string;
  content: string;
  conversationId: string;
  channel: AgentPromptChannel;
  contactDisplayName?: string | null;
}): Promise<AgentEngineResult> {
  const startedAt = Date.now();
  const messagePreview = input.content.trim();

  logAgentFlowStage('message.received', {
    conversationId: input.conversationId,
    agentId: input.agent.id,
    channel: input.channel,
    preview: messagePreview.slice(0, 160),
  });

  const pendingChoice = await hasProductDisambiguation(input.conversationId);
  const intent = classifyIntent(messagePreview, { hasPendingProductChoice: pendingChoice });

  logAgentFlowStage('intent.detected', {
    conversationId: input.conversationId,
    intent,
    pendingChoice,
  });

  if (intentRequiresBling(intent)) {
    logAgentFlowStage('tool.selected', {
      conversationId: input.conversationId,
      tool: 'bling',
      intent,
    });

    const structured = await executeBlingQuery({
      userId: input.userId,
      agentId: input.agent.id,
      intent,
      content: messagePreview,
      conversationId: input.conversationId,
    });

    logAgentFlowStage('query.completed', {
      conversationId: input.conversationId,
      resultKind: structured.kind,
      intent: structured.intent,
    });

    const replyText = await formatBlingStructuredResponse(structured, messagePreview);

    const rationale = `intent=${intent};bling=${structured.kind};formatter=template`;

    logAgentFlowComplete({
      conversationId: input.conversationId,
      messagePreview,
      intent,
      tool: 'bling',
      queryExecuted: true,
      resultKind: structured.kind,
      responsePreview: replyText,
      durationMs: Date.now() - startedAt,
    });

    return {
      replyText,
      intent,
      rationale,
      tool: 'bling',
      queryExecuted: true,
      resultKind: structured.kind,
    };
  }

  const hasBling = await agentHasBlingTool(input.agent.id);
  if (
    !hasBling &&
    /estoque|pre[cç]o|produto|barras|gtin|ean|sku|bling/i.test(messagePreview)
  ) {
    const replyText = formatConversationalResponse({
      intent: 'CONVERSA_GERAL',
      content: messagePreview,
      contactDisplayName: input.contactDisplayName,
    });
    const rationale = 'intent=OUTROS;produto-mencionado-sem-bling;formatter=template';
    logAgentFlowComplete({
      conversationId: input.conversationId,
      messagePreview,
      intent: 'OUTROS',
      tool: null,
      queryExecuted: false,
      resultKind: null,
      responsePreview: replyText,
      durationMs: Date.now() - startedAt,
    });
    return {
      replyText,
      intent: 'OUTROS',
      rationale,
      tool: null,
      queryExecuted: false,
      resultKind: null,
    };
  }

  logAgentFlowStage('tool.selected', {
    conversationId: input.conversationId,
    tool: null,
    intent,
  });

  const replyText = formatConversationalResponse({
    intent,
    content: messagePreview,
    contactDisplayName: input.contactDisplayName,
  });

  const rationale = `intent=${intent};formatter=template`;

  logAgentFlowComplete({
    conversationId: input.conversationId,
    messagePreview,
    intent,
    tool: null,
    queryExecuted: false,
    resultKind: null,
    responsePreview: replyText,
    durationMs: Date.now() - startedAt,
  });

  return {
    replyText,
    intent,
    rationale,
    tool: null,
    queryExecuted: false,
    resultKind: null,
  };
}
