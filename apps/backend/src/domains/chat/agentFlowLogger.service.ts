export type AgentFlowLogEvent = {
  conversationId: string;
  messagePreview: string;
  intent: string;
  tool: string | null;
  queryExecuted: boolean;
  resultKind: string | null;
  responsePreview: string | null;
  durationMs: number;
};

export function logAgentFlowStage(
  stage: string,
  payload: Record<string, unknown>,
): void {
  console.info(`[agent-engine] ${stage}`, JSON.stringify(payload));
}

export function logAgentFlowComplete(event: AgentFlowLogEvent): void {
  console.info(
    '[agent-engine] complete',
    JSON.stringify({
      ...event,
      messagePreview: event.messagePreview.slice(0, 160),
      responsePreview: event.responsePreview?.slice(0, 200) ?? null,
    }),
  );
}
