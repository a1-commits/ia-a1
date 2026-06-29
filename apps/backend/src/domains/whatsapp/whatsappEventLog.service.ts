import { randomUUID } from 'crypto';
import type { WhatsappLogEntry, WhatsappLogLevel } from './whatsappProvider.types';

const MAX_EVENTS = 200;

const entries: WhatsappLogEntry[] = [];

export function appendWhatsappEvent(input: {
  level?: WhatsappLogLevel;
  event: string;
  message: string;
}): WhatsappLogEntry {
  const entry: WhatsappLogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    level: input.level ?? 'info',
    event: input.event,
    message: input.message,
  };
  entries.push(entry);
  if (entries.length > MAX_EVENTS) {
    entries.splice(0, entries.length - MAX_EVENTS);
  }
  return entry;
}

export function listWhatsappEvents(): WhatsappLogEntry[] {
  return [...entries].reverse();
}

export function clearWhatsappEventsForTests(): void {
  entries.length = 0;
}
