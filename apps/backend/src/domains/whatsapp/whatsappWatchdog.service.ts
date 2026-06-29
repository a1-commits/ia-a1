import { appendWhatsappEvent } from './whatsappEventLog.service';
import { evaluateWatchdogProbe } from './whatsappHealth.utils';
import type { WhatsappProvider } from './whatsappProvider.types';
import { whatsappService } from '../../services/whatsapp.service';

const WATCHDOG_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 3;

export class WhatsappWatchdog {
  private timer: NodeJS.Timeout | null = null;

  private consecutiveFailures = 0;

  private running = false;

  constructor(private readonly provider: WhatsappProvider) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, WATCHDOG_INTERVAL_MS);
    appendWhatsappEvent({
      event: 'watchdog.started',
      message: 'Monitor interno do WhatsApp iniciado (intervalo 30s).',
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  async tick(): Promise<void> {
    const health = this.provider.getHealth();
    if (!health.enabled) return;

    const evaluation = evaluateWatchdogProbe(this.provider.probe(), health.enabled);
    if (evaluation.healthy) {
      this.consecutiveFailures = 0;
      whatsappService.setWatchdogError(false);
      return;
    }

    this.consecutiveFailures += 1;
    console.log('[watchdog] Cliente desconectado. Tentando reconectar...');
    appendWhatsappEvent({
      level: 'warn',
      event: 'watchdog.disconnect_detected',
      message: `Falhas detectadas: ${evaluation.failedChecks.join(', ')}. Tentativa ${this.consecutiveFailures}/${MAX_RECONNECT_ATTEMPTS}.`,
    });

    if (this.consecutiveFailures > MAX_RECONNECT_ATTEMPTS) {
      whatsappService.setWatchdogError(true);
      appendWhatsappEvent({
        level: 'error',
        event: 'watchdog.error',
        message: 'Watchdog atingiu 3 tentativas sem recuperação. Status ERROR.',
      });
      return;
    }

    try {
      await this.provider.reconnect();
      appendWhatsappEvent({
        event: 'watchdog.reconnect_attempt',
        message: 'Tentativa automática de reconexão executada.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendWhatsappEvent({
        level: 'error',
        event: 'watchdog.reconnect_failed',
        message,
      });
    }
  }
}
