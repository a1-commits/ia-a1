import type {
  WhatsappConnectionStatus,
  WhatsappHealthChecks,
  WhatsappHealthLevel,
  WhatsappProviderProbe,
} from './whatsappProvider.types';

export function formatDurationMs(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || seconds > 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

export function deriveConnectionStatus(input: {
  enabled: boolean;
  connected: boolean;
  waitingQr: boolean;
  starting: boolean;
  watchdogError: boolean;
  lastError: string | null;
}): WhatsappConnectionStatus {
  if (!input.enabled) return 'DISABLED';
  if (input.watchdogError) return 'ERROR';
  if (input.connected) return 'CONNECTED';
  if (input.waitingQr) return 'WAITING_QR';
  if (input.starting) return 'CONNECTING';
  if (input.lastError) return 'ERROR';
  return 'DISCONNECTED';
}

export function buildHealthChecks(probe: WhatsappProviderProbe, status: WhatsappConnectionStatus): WhatsappHealthChecks {
  const level = (ok: boolean, warn = false): WhatsappHealthLevel => {
    if (ok) return 'ok';
    if (warn) return 'warn';
    return 'error';
  };

  return {
    client: level(probe.clientExists, status === 'CONNECTING'),
    browser: level(probe.browserRunning, status === 'CONNECTING' || status === 'WAITING_QR'),
    session: level(probe.sessionActive, status === 'WAITING_QR'),
    listener: level(probe.listenerRegistered && probe.initializeFinished, status === 'CONNECTING'),
    queue: level(status === 'CONNECTED', status === 'CONNECTING'),
  };
}

export type WatchdogEvaluation = {
  healthy: boolean;
  failedChecks: string[];
};

export function evaluateWatchdogProbe(probe: WhatsappProviderProbe, enabled: boolean): WatchdogEvaluation {
  if (!enabled) {
    return { healthy: true, failedChecks: [] };
  }

  const failedChecks: string[] = [];
  if (!probe.clientExists) failedChecks.push('client');
  if (!probe.browserRunning && probe.clientExists) failedChecks.push('browser');
  if (!probe.initializeFinished && probe.clientExists) failedChecks.push('initialize');
  if (!probe.listenerRegistered && probe.clientExists) failedChecks.push('listener');
  if (!probe.connected && probe.initializeFinished) failedChecks.push('connected');

  const staleMs = probe.lastActivityAt ? Date.now() - Date.parse(probe.lastActivityAt) : null;
  if (probe.connected && staleMs !== null && staleMs > 30 * 60_000) {
    failedChecks.push('lastActivity');
  }

  return { healthy: failedChecks.length === 0, failedChecks };
}
