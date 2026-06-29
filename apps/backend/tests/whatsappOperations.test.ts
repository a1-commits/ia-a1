import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  appendWhatsappEvent,
  clearWhatsappEventsForTests,
  listWhatsappEvents,
} from '../src/domains/whatsapp/whatsappEventLog.service';
import {
  buildHealthChecks,
  deriveConnectionStatus,
  evaluateWatchdogProbe,
  formatDurationMs,
} from '../src/domains/whatsapp/whatsappHealth.utils';
import { WhatsappWatchdog } from '../src/domains/whatsapp/whatsappWatchdog.service';
import type {
  WhatsappHealthSnapshot,
  WhatsappProvider,
  WhatsappProviderProbe,
  WhatsappQrResponse,
} from '../src/domains/whatsapp/whatsappProvider.types';

function baseProbe(overrides: Partial<WhatsappProviderProbe> = {}): WhatsappProviderProbe {
  return {
    clientExists: true,
    browserRunning: true,
    sessionActive: true,
    initializeFinished: true,
    listenerRegistered: true,
    lastActivityAt: new Date().toISOString(),
    connected: true,
    ...overrides,
  };
}

function baseHealth(overrides: Partial<WhatsappHealthSnapshot> = {}): WhatsappHealthSnapshot {
  return {
    enabled: true,
    status: 'CONNECTED',
    connected: true,
    authenticated: true,
    waitingQr: false,
    clientInitialized: true,
    browserRunning: true,
    listenerRunning: true,
    lastActivity: new Date().toISOString(),
    uptime: '1m',
    phone: '5543999990001',
    sessionAge: '1m',
    messagesToday: 3,
    lastMessage: 'oi',
    provider: 'whatsapp-web.js',
    model: 'Mobi',
    version: '1.34.6',
    checks: buildHealthChecks(baseProbe(), 'CONNECTED'),
    lastError: null,
    ...overrides,
  };
}

class MockWhatsappProvider implements WhatsappProvider {
  readonly providerName = 'mock';

  health: WhatsappHealthSnapshot = baseHealth();

  qr: WhatsappQrResponse = { available: false };

  probeState = baseProbe();

  calls: string[] = [];

  getHealth(): WhatsappHealthSnapshot {
    return this.health;
  }

  getQr(): WhatsappQrResponse {
    return this.qr;
  }

  getLogs() {
    return listWhatsappEvents();
  }

  async reconnect(): Promise<void> {
    this.calls.push('reconnect');
    this.health = baseHealth({ status: 'CONNECTING' });
  }

  async restart(): Promise<void> {
    this.calls.push('restart');
    this.health = baseHealth({ status: 'CONNECTING' });
  }

  async resetSession(): Promise<void> {
    this.calls.push('reset-session');
    this.health = baseHealth({ status: 'WAITING_QR', connected: false, waitingQr: true });
    this.qr = { available: true, image: 'data:image/png;base64,abc' };
  }

  probe(): WhatsappProviderProbe {
    return this.probeState;
  }
}

afterEach(() => {
  clearWhatsappEventsForTests();
});

describe('deriveConnectionStatus', () => {
  it('cliente conectado', () => {
    assert.equal(
      deriveConnectionStatus({
        enabled: true,
        connected: true,
        waitingQr: false,
        starting: false,
        watchdogError: false,
        lastError: null,
      }),
      'CONNECTED',
    );
  });

  it('cliente desconectado', () => {
    assert.equal(
      deriveConnectionStatus({
        enabled: true,
        connected: false,
        waitingQr: false,
        starting: false,
        watchdogError: false,
        lastError: null,
      }),
      'DISCONNECTED',
    );
  });

  it('aguardando QR', () => {
    assert.equal(
      deriveConnectionStatus({
        enabled: true,
        connected: false,
        waitingQr: true,
        starting: false,
        watchdogError: false,
        lastError: null,
      }),
      'WAITING_QR',
    );
  });

  it('erro do watchdog', () => {
    assert.equal(
      deriveConnectionStatus({
        enabled: true,
        connected: false,
        waitingQr: false,
        starting: false,
        watchdogError: true,
        lastError: null,
      }),
      'ERROR',
    );
  });
});

describe('whatsappEventLog.service', () => {
  it('mantém no máximo 200 eventos', () => {
    for (let i = 0; i < 210; i += 1) {
      appendWhatsappEvent({ event: 'test.event', message: `msg-${i}` });
    }
    assert.equal(listWhatsappEvents().length, 200);
    assert.equal(listWhatsappEvents()[0]?.message, 'msg-209');
  });
});

describe('Whatsapp provider mock operations', () => {
  it('QR disponível', async () => {
    const provider = new MockWhatsappProvider();
    provider.qr = { available: true, image: 'data:image/png;base64,abc' };
    assert.equal(provider.getQr().available, true);
    assert.match(provider.getQr().image ?? '', /^data:image\/png;base64,/);
  });

  it('QR indisponível', () => {
    const provider = new MockWhatsappProvider();
    assert.equal(provider.getQr().available, false);
  });

  it('reconexão', async () => {
    const provider = new MockWhatsappProvider();
    await provider.reconnect();
    assert.deepEqual(provider.calls, ['reconnect']);
  });

  it('restart', async () => {
    const provider = new MockWhatsappProvider();
    await provider.restart();
    assert.deepEqual(provider.calls, ['restart']);
  });

  it('reset de sessão', async () => {
    const provider = new MockWhatsappProvider();
    await provider.resetSession();
    assert.deepEqual(provider.calls, ['reset-session']);
    assert.equal(provider.getHealth().status, 'WAITING_QR');
    assert.equal(provider.getQr().available, true);
  });
});

describe('evaluateWatchdogProbe', () => {
  it('probe saudável quando conectado', () => {
    const result = evaluateWatchdogProbe(baseProbe(), true);
    assert.equal(result.healthy, true);
    assert.deepEqual(result.failedChecks, []);
  });

  it('detecta falhas quando desconectado', () => {
    const result = evaluateWatchdogProbe(
      baseProbe({ connected: false, browserRunning: false, listenerRegistered: false }),
      true,
    );
    assert.equal(result.healthy, false);
    assert.ok(result.failedChecks.includes('connected'));
  });
});

describe('WhatsappWatchdog', () => {
  it('tenta reconectar após falha', async () => {
    const provider = new MockWhatsappProvider();
    provider.probeState = baseProbe({ connected: false, clientExists: true, browserRunning: false });
    const watchdog = new WhatsappWatchdog(provider);
    await watchdog.tick();
    assert.deepEqual(provider.calls, ['reconnect']);
    assert.equal(watchdog.getFailureCount(), 1);
  });
});

describe('formatDurationMs', () => {
  it('formata uptime legível', () => {
    assert.equal(formatDurationMs(65_000), '1m 5s');
  });
});

describe('Health API shape', () => {
  it('retorna campos esperados pela central', () => {
    const health = baseHealth();
    assert.equal(health.provider, 'whatsapp-web.js');
    assert.equal(health.status, 'CONNECTED');
    assert.equal(health.checks.client, 'ok');
    assert.equal(health.messagesToday, 3);
  });
});
