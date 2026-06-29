import { whatsappService } from '../../../services/whatsapp.service';
import { listWhatsappEvents } from '../whatsappEventLog.service';
import type {
  WhatsappHealthSnapshot,
  WhatsappProvider,
  WhatsappProviderProbe,
  WhatsappQrResponse,
} from '../whatsappProvider.types';
export class WhatsappWebJsProvider implements WhatsappProvider {
  readonly providerName = 'whatsapp-web.js';

  getHealth(): WhatsappHealthSnapshot {
    return whatsappService.getHealthSnapshot();
  }

  getQr(): WhatsappQrResponse {
    return whatsappService.getQrSnapshot();
  }

  getLogs() {
    return listWhatsappEvents();
  }

  async reconnect(): Promise<void> {
    await whatsappService.reconnectClient();
  }

  async restart(): Promise<void> {
    await whatsappService.restartClient();
  }

  async resetSession(): Promise<void> {
    await whatsappService.resetSession();
  }

  probe(): WhatsappProviderProbe {
    return whatsappService.probeOperations();
  }
}

export const whatsappWebJsProvider = new WhatsappWebJsProvider();
