export function isReplyThrottled(
  jid: string,
  lastReplyAtByJid: ReadonlyMap<string, number>,
  intervalMs: number,
  now = Date.now(),
): boolean {
  const prev = lastReplyAtByJid.get(jid) ?? 0;
  return now - prev < intervalMs;
}

export function shouldSkipAutoReplyForCustomer(input: {
  autoReplyMode: 'agent' | 'manual';
  contactPaused: boolean;
  contactStatusPaused: boolean;
  contactHasActiveAgent: boolean;
  replyThrottled: boolean;
}): { skip: boolean; reason: string | null } {
  if (input.contactPaused || input.contactStatusPaused) {
    return { skip: true, reason: 'contact_paused' };
  }

  if (input.autoReplyMode === 'manual' && !input.contactHasActiveAgent) {
    return { skip: true, reason: 'manual_mode' };
  }

  if (input.replyThrottled) {
    return { skip: true, reason: 'anti_spam' };
  }

  return { skip: false, reason: null };
}

export const WHATSAPP_AI_FALLBACK_REPLY =
  'Desculpe, tive uma instabilidade para responder agora. Tente novamente em instantes.';

export function logWhatsappFlowHotfix(event: string, payload: Record<string, unknown>): void {
  console.log(`[whatsapp-flow-hotfix] ${event}`, JSON.stringify(payload));
}
