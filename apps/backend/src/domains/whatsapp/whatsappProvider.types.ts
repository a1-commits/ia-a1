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

export type WhatsappHealthSnapshot = {
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

export type WhatsappProviderProbe = {
  clientExists: boolean;
  browserRunning: boolean;
  sessionActive: boolean;
  initializeFinished: boolean;
  listenerRegistered: boolean;
  lastActivityAt: string | null;
  connected: boolean;
};

export type WhatsappLogLevel = 'info' | 'warn' | 'error';

export type WhatsappLogEntry = {
  id: string;
  at: string;
  level: WhatsappLogLevel;
  event: string;
  message: string;
};

export interface WhatsappProvider {
  readonly providerName: string;
  getHealth(): WhatsappHealthSnapshot;
  getQr(): WhatsappQrResponse;
  getLogs(): WhatsappLogEntry[];
  reconnect(): Promise<void>;
  restart(): Promise<void>;
  resetSession(): Promise<void>;
  probe(): WhatsappProviderProbe;
}
