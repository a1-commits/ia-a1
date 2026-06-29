import { whatsappWebJsProvider } from './providers/whatsappWebJs.provider';
import { WhatsappWatchdog } from './whatsappWatchdog.service';
import type {
  WhatsappHealthSnapshot,
  WhatsappLogEntry,
  WhatsappProvider,
  WhatsappQrResponse,
} from './whatsappProvider.types';

class WhatsappOperationsService {
  private readonly provider: WhatsappProvider;

  private readonly watchdog: WhatsappWatchdog;

  constructor(provider: WhatsappProvider) {
    this.provider = provider;
    this.watchdog = new WhatsappWatchdog(provider);
  }

  startWatchdog(): void {
    this.watchdog.start();
  }

  getHealth(): WhatsappHealthSnapshot {
    return this.provider.getHealth();
  }

  getQr(): WhatsappQrResponse {
    return this.provider.getQr();
  }

  getLogs(): WhatsappLogEntry[] {
    return this.provider.getLogs();
  }

  async reconnect(): Promise<void> {
    await this.provider.reconnect();
  }

  async restart(): Promise<void> {
    await this.provider.restart();
  }

  async resetSession(): Promise<void> {
    await this.provider.resetSession();
  }
}

export const whatsappOperationsService = new WhatsappOperationsService(whatsappWebJsProvider);
