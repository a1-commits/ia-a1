export type WhatsappConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'WAITING_QR'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'DISABLED';

export type WhatsappHealthLevel = 'ok' | 'warn' | 'error';

export type WhatsappHealthChecks = {
  client: WhatsappHealthLevel;
  browser: WhatsappHealthLevel;
  session: WhatsappHealthLevel;
  listener: WhatsappHealthLevel;
  queue: WhatsappHealthLevel;
};

export type WhatsappHealth = {
  enabled: boolean;
  status: WhatsappConnectionStatus;
  connected: boolean;
  authenticated: boolean;
  waitingQr: boolean;
  clientInitialized: boolean;
  browserRunning: boolean;
  listenerRunning: boolean;
  lastActivity: string | null;
  uptime: string | null;
  phone: string | null;
  sessionAge: string | null;
  messagesToday: number;
  lastMessage: string | null;
  provider: string;
  model: string | null;
  version: string | null;
  checks: WhatsappHealthChecks;
  lastError: string | null;
};

export type WhatsappQrResponse = {
  available: boolean;
  image?: string;
};

export type WhatsappLogEntry = {
  id: string;
  at: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
};

export function whatsappStatusLabel(status: WhatsappConnectionStatus): string {
  switch (status) {
    case 'CONNECTED':
      return '🟢 Conectado';
    case 'CONNECTING':
      return '🟡 Conectando';
    case 'WAITING_QR':
      return '🟡 Aguardando QR Code';
    case 'DISCONNECTED':
      return '🔴 Desconectado';
    case 'ERROR':
      return '🔴 Erro';
    case 'DISABLED':
      return '🔴 Desativado';
    default:
      return '🔴 Offline';
  }
}

export function healthLevelIcon(level: WhatsappHealthLevel): string {
  if (level === 'ok') return '🟢';
  if (level === 'warn') return '🟡';
  return '🔴';
}

export function formatWhatsappTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}
