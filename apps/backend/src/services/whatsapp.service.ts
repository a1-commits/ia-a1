import path from 'path';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { ContextType, IntegrationProvider, TaskPriority, TaskStatus } from '@prisma/client';
import { Client, LocalAuth, MessageMedia, type Message } from 'whatsapp-web.js';
import { env, isOpenAiConfigured } from '../config/env';
import { prisma } from '../lib/prisma';
import { processAgentMessage } from '../domains/chat/chatAgentFlow.service';
import { shouldHandoffToSalesManager } from '../domains/sales/handoff.service';
import { getAiRuntimeStatus } from '../domains/ai/aiService';
import {
  parseFinanceEntryMessage,
  registerFinanceEntry,
  summarizeFinanceToday,
} from '../domains/chat/financeCapture.service';
import { logSecurityEvent } from '../domains/security/securityAudit.service';
import {
  detectErpNaturalIntent,
  executeErpReadIntent,
  executeErpWriteIntent,
  summarizeWriteIntent,
  type ErpNaturalIntent,
} from '../domains/integrations/olistWhatsAppAgent.service';
import { getImageJobById } from '../domains/chat/imageGeneration.service';

type WhatsAppRuntimeStatus = {
  enabled: boolean;
  connected: boolean;
  qrPending: boolean;
  lastError: string | null;
  allowedNumber: string | null;
  startedAt: string | null;
  autoReplyMode: 'agent' | 'manual';
};

type WhatsAppContactControl = {
  number: string;
  jid: string;
  paused: boolean;
  lastInboundAt: string;
  lastInboundPreview: string;
};

function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

function numberVariants(raw: string): string[] {
  const n = normalizeNumber(raw);
  if (!n) return [];
  const set = new Set<string>([n]);
  // BR rule: handle mobile 9th digit variance after DDI+DDD.
  if (n.startsWith('55') && n.length === 13) {
    set.add(`${n.slice(0, 4)}${n.slice(5)}`);
  }
  if (n.startsWith('55') && n.length === 12) {
    set.add(`${n.slice(0, 4)}9${n.slice(4)}`);
  }
  return Array.from(set);
}

function phoneMatches(a: string, b: string): boolean {
  const va = numberVariants(a);
  const vb = new Set(numberVariants(b));
  return va.some((n) => vb.has(n));
}

class WhatsAppService {
  private client: Client | null = null;

  private openAiClient: OpenAI | null = null;

  private reminderTimer: NodeJS.Timeout | null = null;

  private lastAdminBriefingAtByJid = new Map<string, number>();

  private pendingSensitiveActionByJid = new Map<
    string,
    { code: string; expiresAt: number; type: 'mode' | 'finance' | 'erp_write'; payload: string }
  >();

  private starting = false;

  private status: WhatsAppRuntimeStatus = {
    enabled: Boolean(env.WHATSAPP_ENABLED),
    connected: false,
    qrPending: false,
    lastError: null,
    allowedNumber: env.WHATSAPP_ALLOWED_NUMBER ? normalizeNumber(env.WHATSAPP_ALLOWED_NUMBER) : null,
    startedAt: null,
    autoReplyMode: 'agent',
  };

  private conversationByJid = new Map<string, string>();

  private lastReplyAtByJid = new Map<string, number>();

  private lastBotReplyFingerprintByJid = new Map<string, string>();

  private autoReplyWindowByJid = new Map<string, number[]>();

  private staticReplySentByJid = new Set<string>();

  private pausedByNumber = new Set<string>();

  private recentInboundByNumber = new Map<string, WhatsAppContactControl>();

  private erpRequestWindowByJid = new Map<string, number[]>();

  getStatus(): WhatsAppRuntimeStatus {
    return this.status;
  }

  listContactControls(): WhatsAppContactControl[] {
    return Array.from(this.recentInboundByNumber.values()).sort((a, b) =>
      b.lastInboundAt.localeCompare(a.lastInboundAt),
    );
  }

  setAutoReplyMode(mode: 'agent' | 'manual'): WhatsAppRuntimeStatus {
    this.status.autoReplyMode = mode;
    console.log(`[whatsapp] modo de resposta automática: ${mode}`);
    return this.status;
  }

  setContactPaused(numberRaw: string, paused: boolean): WhatsAppContactControl | null {
    const number = normalizeNumber(numberRaw);
    if (!number) return null;
    if (paused) this.pausedByNumber.add(number);
    else this.pausedByNumber.delete(number);

    const existing = this.recentInboundByNumber.get(number);
    if (!existing) return null;
    const next: WhatsAppContactControl = { ...existing, paused };
    this.recentInboundByNumber.set(number, next);
    console.log(`[whatsapp] handoff ${paused ? 'ativado' : 'desativado'} para ${number}`);
    return next;
  }

  async start(): Promise<void> {
    if (!env.WHATSAPP_ENABLED) {
      console.log('[whatsapp] integração desativada (WHATSAPP_ENABLED=false)');
      return;
    }
    if (!this.status.allowedNumber) {
      console.log('[whatsapp] WHATSAPP_ALLOWED_NUMBER ausente; primeiro número recebido será autorizado');
    }
    const adminNumbers = this.adminNumbers();
    if (adminNumbers.length > 0) {
      console.log(
        `[whatsapp] modo operador: mensagens de ${adminNumbers.join(', ')} usam prompt de administrador`,
      );
    } else if (this.status.allowedNumber) {
      console.log(
        `[whatsapp] WHATSAPP_ADMIN_NUMBER ausente; usando ${this.status.allowedNumber} como admin (fallback)`,
      );
    }
    if (this.client || this.starting) return;

    this.starting = true;
    try {
      const authPath = path.resolve(__dirname, '../../storage/whatsapp-auth');
      this.client = new Client({
        authStrategy: new LocalAuth({ clientId: 'agente-mobi-local', dataPath: authPath }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      this.client.on('qr', (qr) => {
        this.status.qrPending = true;
        this.status.connected = false;
        this.status.lastError = null;
        console.log('[whatsapp] QR gerado. Escaneie com o WhatsApp no celular.');
        qrcodeTerminal.generate(qr, { small: false });
        const qrPngPath = path.resolve(__dirname, '../../storage/whatsapp-qr.png');
        void QRCode.toFile(qrPngPath, qr, { width: 480, margin: 2 }).then(() => {
          console.log(`[whatsapp] QR salvo em: ${qrPngPath}`);
        });
      });

      this.client.on('ready', () => {
        this.status.qrPending = false;
        this.status.connected = true;
        this.status.lastError = null;
        this.status.startedAt = new Date().toISOString();
        console.log('[whatsapp] conectado');
        this.startReminderLoop();
      });

      this.client.on('disconnected', (reason) => {
        this.status.connected = false;
        this.status.qrPending = false;
        this.status.lastError = `desconectado: ${String(reason)}`;
        console.log(`[whatsapp] conexão encerrada (${String(reason)}), tentando reconectar...`);
        this.stopReminderLoop();
        this.client = null;
        this.safeReconnect();
      });

      this.client.on('auth_failure', (msg) => {
        this.status.connected = false;
        this.status.lastError = `falha de autenticação: ${msg}`;
        console.log(`[whatsapp] falha de autenticação: ${msg}`);
        this.stopReminderLoop();
      });

      this.client.on('message', (message) => {
        void this.onIncomingMessage(message);
      });

      await this.client.initialize();
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'erro ao inicializar WhatsApp';
      console.log(`[whatsapp] erro ao iniciar: ${this.status.lastError}`);
      this.client = null;
      this.safeReconnect();
    } finally {
      this.starting = false;
    }
  }

  private safeReconnect(): void {
    if (!env.WHATSAPP_ENABLED) return;
    setTimeout(() => {
      void this.start();
    }, 5000);
  }

  private async resolveAgentUserId(): Promise<string | null> {
    const configured = await prisma.user.findUnique({
      where: { email: env.WHATSAPP_AGENT_USER_EMAIL },
      select: { id: true, email: true },
    });
    if (configured?.id) return configured.id;
    const fallback = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (fallback?.id) {
      console.log(
        `[whatsapp] usuário configurado "${env.WHATSAPP_AGENT_USER_EMAIL}" não encontrado; usando fallback "${fallback.email}"`,
      );
      return fallback.id;
    }
    return null;
  }

  private normalizedAdminNumber(): string | null {
    const raw = env.WHATSAPP_ADMIN_NUMBER?.replace(/\D/g, '');
    return raw && raw.length > 0 ? raw : null;
  }

  private adminNumbers(): string[] {
    const set = new Set<string>();
    const single = this.normalizedAdminNumber();
    if (single) set.add(single);
    const many = (env.WHATSAPP_ADMIN_NUMBERS ?? '')
      .split(',')
      .map((x) => normalizeNumber(x))
      .filter((x) => x.length > 0);
    for (const n of many) set.add(n);
    return Array.from(set);
  }

  private effectiveAdminNumber(): string | null {
    return this.adminNumbers()[0] ?? this.status.allowedNumber;
  }

  /** Mensagem enviada pelo número configurado como operador (não é cliente). */
  private isAdminSender(message: Message): boolean {
    const isSelfChat = message.fromMe && message.to === message.from;
    if (isSelfChat) return true;
    const admins = this.adminNumbers();
    if (admins.length === 0) {
      const fallback = this.effectiveAdminNumber();
      if (!fallback) return false;
      const jid = message.from;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return false;
      const sender = normalizeNumber(jid.split('@')[0]);
      return phoneMatches(sender, fallback);
    }
    const jid = message.from;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return false;
    const sender = normalizeNumber(jid.split('@')[0]);
    return admins.some((admin) => phoneMatches(sender, admin));
  }

  /** Atalhos !pausar / !agente / !status — só para o operador. */
  private async tryHandleAdminQuickCommands(message: Message, body: string): Promise<boolean> {
    if (!this.isAdminSender(message)) return false;
    const line = body.trim().split(/\n/)[0]?.trim().toLowerCase() ?? '';
    const cmd = line.replace(/^\/+/, '');
    const pending = this.pendingSensitiveActionByJid.get(message.from);
    const bareCodeMatch = body.trim().match(/^([A-Z]\d{4})$/i);
    const autoConfirmWithPendingCode =
      pending &&
      pending.type === 'erp_write' &&
      (/^(confirmado|confirmar|ok|pode incluir|sim)$/i.test(line) ||
        (bareCodeMatch && bareCodeMatch[1]!.toUpperCase() === pending.code.toUpperCase()));
    const confirmMatch = cmd.match(/^!confirmar\s*([a-z]\d{4})$/i);
    const codeFromAutoConfirm = autoConfirmWithPendingCode ? pending.code.toUpperCase() : null;
    const codeFromCommand = confirmMatch?.[1]?.trim().toUpperCase() ?? null;
    const codeToUse = codeFromAutoConfirm ?? codeFromCommand;
    if (codeToUse) {
      const code = codeToUse;
      const action = pending ?? this.pendingSensitiveActionByJid.get(message.from);
      if (!action || action.expiresAt < Date.now() || action.code !== code) {
        const userId = await this.resolveAgentUserId();
        await logSecurityEvent({
          userId,
          source: 'whatsapp_admin',
          action: 'invalid_confirmation',
          details: `jid=${message.from} code=${code}`,
        });
        await message.reply('Confirmacao invalida ou expirada.');
        return true;
      }
      this.pendingSensitiveActionByJid.delete(message.from);
      if (action.type === 'mode') {
        this.setAutoReplyMode(action.payload === 'agent' ? 'agent' : 'manual');
        await message.reply(
          action.payload === 'agent'
            ? 'Modo agente confirmado: respostas automáticas para clientes ligadas.'
            : 'Modo manual confirmado: respostas automáticas para clientes desligadas.',
        );
        const userId = await this.resolveAgentUserId();
        await logSecurityEvent({
          userId,
          source: 'whatsapp_admin',
          action: 'mode_change_confirmed',
          details: `jid=${message.from} mode=${action.payload}`,
        });
        return true;
      }
      if (action.type === 'finance') {
        const userId = await this.resolveAgentUserId();
        if (!userId) {
          await message.reply('Nao consegui confirmar lancamento financeiro agora.');
          return true;
        }
        const parsed = parseFinanceEntryMessage(action.payload);
        if (!parsed) {
          await message.reply('Nao consegui interpretar o lancamento pendente.');
          return true;
        }
        await registerFinanceEntry({ userId, entry: parsed });
        await message.reply(
          `Lancamento confirmado: ${parsed.kind} de R$ ${parsed.amount.toFixed(2)} (${parsed.note}).`,
        );
        await logSecurityEvent({
          userId,
          source: 'whatsapp_admin',
          action: 'high_value_finance_confirmed',
          details: `jid=${message.from} kind=${parsed.kind} amount=${parsed.amount.toFixed(2)} note=${parsed.note}`,
        });
        return true;
      }
      if (action.type === 'erp_write') {
        const userId = await this.resolveAgentUserId();
        if (!userId) {
          await message.reply('Nao consegui executar a operacao ERP agora.');
          return true;
        }
        let parsed: ErpNaturalIntent | null = null;
        try {
          parsed = JSON.parse(action.payload) as ErpNaturalIntent;
        } catch {
          parsed = null;
        }
        if (!parsed || parsed.type !== 'write') {
          await message.reply('Ação ERP pendente inválida. Refaça o pedido.');
          return true;
        }
        const done = await executeErpWriteIntent(userId, parsed.intent);
        if (!done.ok) {
          console.log(`[whatsapp] erp-write falhou: jid=${message.from} reason=${done.reason}`);
          await message.reply(`Falha ao executar operação ERP: ${done.reason}`);
          await logSecurityEvent({
            userId,
            source: 'whatsapp_admin',
            action: 'erp_write_failed',
            details: `jid=${message.from} reason=${done.reason.slice(0, 260)}`,
          });
          return true;
        }
        console.log(`[whatsapp] erp-write confirmado: jid=${message.from}`);
        await message.reply(done.reply);
        await logSecurityEvent({
          userId,
          source: 'whatsapp_admin',
          action: 'erp_write_confirmed',
          details: `jid=${message.from} intent=${action.payload.slice(0, 260)}`,
        });
        return true;
      }
    }
    if (cmd.startsWith('!confirmar')) {
      await message.reply('Formato inválido. Use: !confirmar E1234');
      return true;
    }
    if (cmd === '!pausar' || cmd === '!manual' || cmd === '!pause') {
      const code = `M${Math.floor(1000 + Math.random() * 9000)}`;
      this.pendingSensitiveActionByJid.set(message.from, {
        code,
        expiresAt: Date.now() + 2 * 60 * 1000,
        type: 'mode',
        payload: 'manual',
      });
      await message.reply(
        `Comando sensivel detectado. Confirme em ate 2 minutos com: !confirmar ${code}`,
      );
      const userId = await this.resolveAgentUserId();
      await logSecurityEvent({
        userId,
        source: 'whatsapp_admin',
        action: 'mode_change_requested',
        details: `jid=${message.from} mode=manual code=${code}`,
      });
      return true;
    }
    if (cmd === '!agente' || cmd === '!ativar' || cmd === '!auto') {
      const code = `A${Math.floor(1000 + Math.random() * 9000)}`;
      this.pendingSensitiveActionByJid.set(message.from, {
        code,
        expiresAt: Date.now() + 2 * 60 * 1000,
        type: 'mode',
        payload: 'agent',
      });
      await message.reply(`Confirme em ate 2 minutos com: !confirmar ${code}`);
      const userId = await this.resolveAgentUserId();
      await logSecurityEvent({
        userId,
        source: 'whatsapp_admin',
        action: 'mode_change_requested',
        details: `jid=${message.from} mode=agent code=${code}`,
      });
      return true;
    }
    if (cmd === '!status') {
      const s = this.getStatus();
      const st = s.connected ? 'conectado' : 'desconectado';
      const qr = s.qrPending ? ' (aguardando QR)' : '';
      const modo =
        s.autoReplyMode === 'agent' ? 'agente (automático para clientes)' : 'manual (bot pausado para clientes)';
      await message.reply(`WhatsApp: ${st}${qr}. Modo para clientes: ${modo}.`);
      return true;
    }
    if (cmd === '!briefing') {
      const sent = await this.sendAdminBriefing(message, true);
      if (!sent) {
        await message.reply('Nao consegui montar seu briefing agora. Tente novamente em alguns instantes.');
      }
      return true;
    }
    if (cmd === '!caixa' || cmd === '!financeiro') {
      const userId = await this.resolveAgentUserId();
      if (!userId) {
        await message.reply('Nao consegui consultar o financeiro agora.');
        return true;
      }
      const sum = await summarizeFinanceToday(userId);
      await message.reply(
        `Financeiro hoje\nEntradas: R$ ${sum.entrada.toFixed(2)}\nSaidas: R$ ${sum.saida.toFixed(2)}\nSaldo: R$ ${sum.saldo.toFixed(2)}`,
      );
      return true;
    }
    if (cmd.startsWith('!lembrar ') || cmd.startsWith('!lembrete ')) {
      const payload = body.trim().replace(/^!(lembrar|lembrete)\s+/i, '');
      const parsed = this.parseReminderInput(payload);
      if (!parsed) {
        await message.reply(
          'Formato invalido. Use: !lembrar HH:MM texto ou !lembrar YYYY-MM-DD HH:MM texto',
        );
        return true;
      }
      const userId = await this.resolveAgentUserId();
      if (!userId) {
        await message.reply('Nao consegui criar o lembrete agora. Usuario do agente nao encontrado.');
        return true;
      }
      await prisma.task.create({
        data: {
          userId,
          title: `Lembrete WhatsApp: ${parsed.text.slice(0, 80)}`,
          description: `dueAt=${parsed.dueAt.toISOString()}\nsource=whatsapp_admin\ntext=${parsed.text}`,
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          context: ContextType.PESSOAL,
        },
      });
      await message.reply(
        `Lembrete criado para ${parsed.dueAt.toLocaleString('pt-BR', { hour12: false })}: ${parsed.text}`,
      );
      console.log(`[whatsapp] lembrete criado para ${parsed.dueAt.toISOString()}`);
      return true;
    }
    return false;
  }

  private shouldSendAdminBriefing(jid: string): boolean {
    const now = Date.now();
    const prev = this.lastAdminBriefingAtByJid.get(jid) ?? 0;
    const intervalMs = 8 * 60 * 60 * 1000;
    return now - prev >= intervalMs;
  }

  private greetingByHour(now: Date): string {
    const h = now.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  private async sendAdminBriefing(message: Message, force: boolean): Promise<boolean> {
    try {
      if (!force && !this.shouldSendAdminBriefing(message.from)) return false;
      const userId = await this.resolveAgentUserId();
      if (!userId) return false;
      const ai = getAiRuntimeStatus();
      const wa = this.getStatus();
      const [pending, critical, oneDrive] = await Promise.all([
        prisma.task.findMany({
          where: {
            userId,
            context: { in: [ContextType.PESSOAL, ContextType.GERAL] },
            status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          },
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
          take: 4,
          select: { title: true },
        }),
        prisma.task.findFirst({
          where: {
            userId,
            context: { in: [ContextType.PESSOAL, ContextType.GERAL] },
            status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
            priority: TaskPriority.HIGH,
          },
          orderBy: { updatedAt: 'desc' },
          select: { title: true },
        }),
        prisma.integrationLink.findFirst({
          where: { userId, provider: IntegrationProvider.ONEDRIVE },
          select: { status: true },
        }),
      ]);
      const now = new Date();
      const aiLabel = ai.provider === 'openai' ? 'OpenAI' : ai.provider === 'ollama' ? 'Ollama' : 'Mock';
      const waMode = wa.autoReplyMode === 'agent' ? 'agente' : 'manual';
      const oneDriveStatus = oneDrive?.status ?? 'desconectado';
      const priorities =
        pending.length > 0
          ? pending.map((t, i) => `${i + 1}) ${t.title.slice(0, 90)}`).join('\n')
          : '1) Nenhuma prioridade pendente registrada.';
      const criticalLine = critical
        ? `Pendencia critica: ${critical.title.slice(0, 110)}`
        : 'Pendencia critica: nenhuma travada no momento.';
      const briefing = [
        `${this.greetingByHour(now)}, Ronan.`,
        'Reconhecimento confirmado: fundador e administrador da Moble.',
        `Status: IA ${aiLabel} | WhatsApp ${waMode}/${wa.connected ? 'conectado' : 'instavel'} | OneDrive ${oneDriveStatus}.`,
        'Prioridades sugeridas:',
        priorities,
        criticalLine,
        'Menu rapido: 1) Planejamento do dia 2) Comercial 3) Operacao 4) Lembretes',
      ].join('\n');
      await message.reply(briefing.slice(0, 3500));
      this.lastAdminBriefingAtByJid.set(message.from, Date.now());
      console.log('[whatsapp] briefing executivo enviado ao admin');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido';
      console.log(`[whatsapp] falha ao enviar briefing admin: ${msg}`);
      return false;
    }
  }

  private parseReminderInput(raw: string): { dueAt: Date; text: string } | null {
    const full = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s+(.+)$/);
    if (full) {
      const [, datePart, hh, mm, text] = full;
      const dueAt = new Date(`${datePart}T${hh.padStart(2, '0')}:${mm}:00`);
      if (Number.isNaN(dueAt.getTime()) || !text.trim()) return null;
      return { dueAt, text: text.trim() };
    }
    const short = raw.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!short) return null;
    const [, hh, mm, text] = short;
    const now = new Date();
    const dueAt = new Date(now);
    dueAt.setSeconds(0, 0);
    dueAt.setHours(Number(hh), Number(mm), 0, 0);
    if (Number.isNaN(dueAt.getTime()) || !text.trim()) return null;
    if (dueAt.getTime() <= now.getTime()) {
      dueAt.setDate(dueAt.getDate() + 1);
    }
    return { dueAt, text: text.trim() };
  }

  private extractDueAt(description: string | null): Date | null {
    if (!description) return null;
    const m = description.match(/dueAt=([^\n]+)/);
    if (!m) return null;
    const dt = new Date(m[1].trim());
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  private extractReminderText(task: { title: string; description: string | null }): string {
    const fromDesc = task.description?.match(/text=([^\n]+)/)?.[1]?.trim();
    if (fromDesc) return fromDesc;
    return task.title.replace(/^Lembrete WhatsApp:\s*/i, '').trim();
  }

  private startReminderLoop(): void {
    if (this.reminderTimer) return;
    this.reminderTimer = setInterval(() => {
      void this.processDueReminders();
    }, 30000);
    void this.processDueReminders();
  }

  private stopReminderLoop(): void {
    if (!this.reminderTimer) return;
    clearInterval(this.reminderTimer);
    this.reminderTimer = null;
  }

  private async processDueReminders(): Promise<void> {
    try {
      if (!this.client) return;
      const userId = await this.resolveAgentUserId();
      if (!userId) return;
      const pending = await prisma.task.findMany({
        where: {
          userId,
          context: ContextType.PESSOAL,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          title: { startsWith: 'Lembrete WhatsApp:' },
        },
        orderBy: { createdAt: 'asc' },
        take: 40,
      });
      if (pending.length === 0) return;
      const now = new Date();
      const admins = this.adminNumbers();
      if (admins.length === 0) return;
      for (const task of pending) {
        const dueAt = this.extractDueAt(task.description);
        if (!dueAt || dueAt.getTime() > now.getTime()) continue;
        const text = this.extractReminderText(task);
        const msg = `Lembrete: ${text}`;
        for (const admin of admins) {
          await this.client.sendMessage(`${admin}@c.us`, msg.slice(0, 3500));
        }
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.DONE,
            description: `${task.description ?? ''}\nnotifiedAt=${new Date().toISOString()}`.trim(),
          },
        });
        console.log(`[whatsapp] lembrete enviado (${task.id})`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido';
      console.log(`[whatsapp] falha no loop de lembretes: ${msg}`);
    }
  }

  private isAllowedSender(message: Message): boolean {
    const jid = message.from;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return false;
    const sender = normalizeNumber(jid.split('@')[0]);
    if (env.WHATSAPP_ALLOW_ALL_NUMBERS) {
      return true;
    }
    if (!this.status.allowedNumber) {
      // Primeiro número vira whitelist local para evitar respostas a múltiplos contatos.
      this.status.allowedNumber = sender;
      console.log(`[whatsapp] número permitido definido automaticamente: ${sender}`);
    }
    const allowed = sender === this.status.allowedNumber;
    if (!allowed) {
      console.log(
        `[whatsapp] remetente não permitido (${sender}); permitido atual: ${this.status.allowedNumber}`,
      );
    }
    return allowed;
  }

  private senderNumber(message: Message): string | null {
    const jid = message.from;
    if (!jid) return null;
    return normalizeNumber(jid.split('@')[0]);
  }

  private isVoiceMessage(message: Message): boolean {
    return message.type === 'ptt' || message.type === 'audio';
  }

  private getOpenAiClient(): OpenAI | null {
    if (!isOpenAiConfigured()) return null;
    if (!this.openAiClient) {
      this.openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openAiClient;
  }

  private async transcribeVoiceMessage(message: Message): Promise<string | null> {
    try {
      const media = await message.downloadMedia();
      if (!media?.data || !media.mimetype) return null;
      const client = this.getOpenAiClient();
      if (!client) {
        console.log('[whatsapp] áudio recebido, mas OpenAI não configurada para transcrição');
        return null;
      }
      const ext = media.mimetype.includes('ogg')
        ? 'ogg'
        : media.mimetype.includes('mpeg')
          ? 'mp3'
          : media.mimetype.includes('wav')
            ? 'wav'
            : 'm4a';
      const file = await toFile(Buffer.from(media.data, 'base64'), `voice.${ext}`);
      const transcription = await client.audio.transcriptions.create({
        file,
        model: env.OPENAI_TRANSCRIPTION_MODEL,
        language: 'pt',
      });
      const text = transcription.text?.trim();
      if (!text) return null;
      console.log(`[whatsapp] transcrição de voz concluída: ${text.slice(0, 120)}`);
      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'erro desconhecido';
      console.log(`[whatsapp] falha ao transcrever áudio: ${msg}`);
      return null;
    }
  }

  private async resolveIncomingText(message: Message): Promise<string | null> {
    const plain = message.body?.trim();
    if (plain && plain.length > 0) return plain;
    if (!this.isVoiceMessage(message)) return null;
    return this.transcribeVoiceMessage(message);
  }

  private async notifySalesManager(params: {
    customerNumber: string;
    customerMessage: string;
    agentReply: string;
  }): Promise<void> {
    const manager = env.WHATSAPP_SALES_MANAGER_NUMBER?.replace(/\D/g, '');
    if (!manager || !this.client) return;
    const text = [
      'Novo lead encaminhado para gerente de vendas (Moble).',
      `Cliente: ${params.customerNumber}`,
      `Mensagem: ${params.customerMessage.slice(0, 260)}`,
      `Resumo IA: ${params.agentReply.slice(0, 420)}`,
    ].join('\n');
    await this.client.sendMessage(`${manager}@c.us`, text.slice(0, 3500));
    console.log('[whatsapp] aviso enviado ao gerente de vendas');
  }

  private wantsHumanAttendance(text: string): boolean {
    const t = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (
      /\b(falar|conversar|chamar|atendimento|atendente)\b.{0,40}\b(humano|pessoa|alguem|responsavel|dono|gerente|consultor|vendedor|ronan|voce|vc)\b/.test(t) ||
      /\b(humano|atendente|responsavel|dono|gerente|consultor|vendedor|ronan)\b.{0,40}\b(falar|conversar|chamar|me liga|ligar|atender)\b/.test(t) ||
      /\b(nao quero|sem|dispenso)\b.{0,25}\b(bot|robo|ia|inteligencia artificial|atendimento automatico)\b/.test(t) ||
      /\b(posso|consigo|quero|preciso)\b.{0,35}\b(falar|conversar)\b.{0,35}\b(com voce|com vc|com o ronan|com alguem|com uma pessoa)\b/.test(t)
    );
  }

  private recordAutoReplyQuota(jid: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const maxReplies = 5;
    const prev = this.autoReplyWindowByJid.get(jid) ?? [];
    const fresh = prev.filter((t) => now - t <= windowMs);
    if (fresh.length >= maxReplies) {
      this.autoReplyWindowByJid.set(jid, fresh);
      return false;
    }
    fresh.push(now);
    this.autoReplyWindowByJid.set(jid, fresh);
    return true;
  }

  private async notifyHumanHandoff(params: {
    customerNumber: string;
    customerMessage: string;
    reason: string;
  }): Promise<void> {
    if (!this.client) return;
    const targets = new Set<string>(this.adminNumbers());
    const fallbackAdmin = this.effectiveAdminNumber();
    if (fallbackAdmin) targets.add(fallbackAdmin);
    const manager = env.WHATSAPP_SALES_MANAGER_NUMBER?.replace(/\D/g, '');
    if (manager) targets.add(manager);
    if (targets.size === 0) return;

    const text = [
      'Atendimento humano solicitado.',
      `Cliente: ${params.customerNumber}`,
      `Motivo: ${params.reason}`,
      `Mensagem: ${params.customerMessage.slice(0, 500)}`,
      '',
      'O bot foi pausado para este contato. Reative pelo painel quando quiser devolver para a IA.',
    ].join('\n');

    for (const target of targets) {
      await this.client.sendMessage(`${target}@c.us`, text.slice(0, 3500));
    }
    console.log('[whatsapp] handoff humano notificado ao admin');
  }

  private async pauseForHumanHandoff(params: {
    message: Message;
    customerNumber: string;
    customerMessage: string;
    reason: string;
    replyToCustomer?: boolean;
  }): Promise<void> {
    this.pausedByNumber.add(params.customerNumber);
    const existing = this.recentInboundByNumber.get(params.customerNumber);
    if (existing) {
      this.recentInboundByNumber.set(params.customerNumber, { ...existing, paused: true });
    }

    if (params.replyToCustomer !== false) {
      const reply = [
        'Claro, entendi.',
        'Me manda seu nome e o melhor horario pra gente alinhar isso com mais cuidado.',
      ].join('\n');
      await params.message.reply(reply);
      this.lastBotReplyFingerprintByJid.set(params.message.from, `${params.message.from}:${reply.trim()}`);
    }

    await this.notifyHumanHandoff({
      customerNumber: params.customerNumber,
      customerMessage: params.customerMessage,
      reason: params.reason,
    });
  }

  private watchImageJobForWhatsApp(params: {
    jobId: string;
    jid: string;
  }): void {
    const client = this.client;
    if (!client) return;
    const maxAttempts = 30;
    const intervalMs = 3000;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      const job = await getImageJobById(params.jobId);
      if (!job || job.status === 'FAILED' || attempts >= maxAttempts) return;
      if (job.status === 'COMPLETED' && job.generatedImage?.storagePath) {
        const media = MessageMedia.fromFilePath(job.generatedImage.storagePath);
        await client.sendMessage(params.jid, media, {
          caption:
            'Essa é uma ideia inicial pra te ajudar a visualizar o caminho. Não é o projeto final ainda, mas já mostra proporção, estilo e possibilidades.',
        });
        await client.sendMessage(
          params.jid,
          'Você prefere seguir por algo mais clean e funcional ou algo mais completo e trabalhado?',
        );
        console.log('[whatsapp] imagem ilustrativa do job enviada');
        return;
      }
      setTimeout(() => {
        void tick().catch((error) => {
          console.log(`[whatsapp] falha ao acompanhar job de imagem: ${error instanceof Error ? error.message : error}`);
        });
      }, intervalMs);
    };

    setTimeout(() => {
      void tick().catch((error) => {
        console.log(`[whatsapp] falha ao acompanhar job de imagem: ${error instanceof Error ? error.message : error}`);
      });
    }, intervalMs);
  }

  private shouldThrottle(jid: string): boolean {
    const now = Date.now();
    const prev = this.lastReplyAtByJid.get(jid) ?? 0;
    if (now - prev < env.WHATSAPP_MIN_REPLY_INTERVAL_MS) return true;
    this.lastReplyAtByJid.set(jid, now);
    return false;
  }

  private consumeErpQuota(jid: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = 8;
    const prev = this.erpRequestWindowByJid.get(jid) ?? [];
    const fresh = prev.filter((t) => now - t <= windowMs);
    if (fresh.length >= maxRequests) {
      this.erpRequestWindowByJid.set(jid, fresh);
      return false;
    }
    fresh.push(now);
    this.erpRequestWindowByJid.set(jid, fresh);
    return true;
  }

  private async onIncomingMessage(message: Message): Promise<void> {
    try {
      if (!env.WHATSAPP_ENABLED) return;
      const isSelfChat = message.fromMe && message.to === message.from;
      if (message.fromMe && !isSelfChat) {
        console.log('[whatsapp] ignorando mensagem enviada pela própria conta (chat externo)');
        return;
      }
      if (!this.isAllowedSender(message)) return;
      const isVoice = this.isVoiceMessage(message);
      const body = await this.resolveIncomingText(message);
      if (!body) {
        if (isVoice) {
          await message.reply(
            'Nao consegui entender seu audio com clareza. Pode reenviar em um ambiente mais silencioso ou mandar em texto?',
          );
          console.log('[whatsapp] fallback enviado: falha na transcrição de áudio');
        }
        console.log('[whatsapp] ignorando mensagem vazia');
        return;
      }

      const isAdmin = this.isAdminSender(message);
      const firstLine = body.trim().split(/\n/)[0]?.trim().toLowerCase() ?? '';
      const isCommand = firstLine.startsWith('!');
      const adminRef = this.effectiveAdminNumber();
      const senderForLog = this.senderNumber(message);
      console.log(
        `[whatsapp] diag-admin sender=${senderForLog ?? 'n/a'} adminRef=${adminRef ?? 'n/a'} isSelf=${isSelfChat} isAdmin=${isAdmin}`,
      );

      if (isAdmin && !isCommand) {
        const userId = await this.resolveAgentUserId();
        if (userId) {
          const erpIntent = detectErpNaturalIntent(body);
          console.log(`[whatsapp] erp-intent-admin: ${erpIntent.type}`);
          if (erpIntent.type === 'erp_hint') {
            await message.reply(erpIntent.text.slice(0, 3500));
            await logSecurityEvent({
              userId,
              source: 'whatsapp_admin',
              action: 'erp_hint_shown',
              details: `jid=${message.from}`,
            });
            return;
          }
          if (erpIntent.type === 'read') {
            if (!this.consumeErpQuota(message.from)) {
              await message.reply('Limite temporário de consultas ERP atingido. Aguarde 1 minuto e tente novamente.');
              await logSecurityEvent({
                userId,
                source: 'whatsapp_admin',
                action: 'erp_read_rate_limited',
                details: `jid=${message.from}`,
              });
              return;
            }
            const read = await executeErpReadIntent(userId, erpIntent.intent);
            if (read.ok) {
              await message.reply(read.reply.slice(0, 3500));
              await logSecurityEvent({
                userId,
                source: 'whatsapp_admin',
                action: 'erp_read_success',
                details: `jid=${message.from} intent=${JSON.stringify(erpIntent.intent).slice(0, 260)}`,
              });
              return;
            }
            await message.reply(`Consulta ERP falhou: ${read.reason}`);
            await logSecurityEvent({
              userId,
              source: 'whatsapp_admin',
              action: 'erp_read_failed',
              details: `jid=${message.from} reason=${read.reason.slice(0, 260)}`,
            });
            return;
          }
          if (erpIntent.type === 'write') {
            if (!this.consumeErpQuota(message.from)) {
              await message.reply('Limite temporário de operações ERP atingido. Aguarde 1 minuto e tente novamente.');
              await logSecurityEvent({
                userId,
                source: 'whatsapp_admin',
                action: 'erp_write_rate_limited',
                details: `jid=${message.from}`,
              });
              return;
            }
            const code = `E${Math.floor(1000 + Math.random() * 9000)}`;
            this.pendingSensitiveActionByJid.set(message.from, {
              code,
              expiresAt: Date.now() + 2 * 60 * 1000,
              type: 'erp_write',
              payload: JSON.stringify(erpIntent),
            });
            const summary = summarizeWriteIntent(erpIntent.intent);
            await message.reply(
              `Operacao ERP sensivel detectada:\n${summary}\nConfirme em ate 2 minutos com: !confirmar ${code}`,
            );
            console.log(`[whatsapp] erp-write pending criado: code=${code} jid=${message.from}`);
            await logSecurityEvent({
              userId,
              source: 'whatsapp_admin',
              action: 'erp_write_requested',
              details: `jid=${message.from} intent=${JSON.stringify(erpIntent.intent).slice(0, 260)} code=${code}`,
            });
            return;
          }
          const finance = parseFinanceEntryMessage(body);
          if (finance) {
            if (finance.amount >= 1000) {
              const code = `F${Math.floor(1000 + Math.random() * 9000)}`;
              this.pendingSensitiveActionByJid.set(message.from, {
                code,
                expiresAt: Date.now() + 2 * 60 * 1000,
                type: 'finance',
                payload: body,
              });
              await message.reply(
                `Lancamento de valor alto detectado (R$ ${finance.amount.toFixed(2)}). Confirme com !confirmar ${code}`,
              );
              await logSecurityEvent({
                userId,
                source: 'whatsapp_admin',
                action: 'high_value_finance_requested',
                details: `jid=${message.from} amount=${finance.amount.toFixed(2)} code=${code} raw=${body.slice(0, 260)}`,
              });
              return;
            }
            await registerFinanceEntry({ userId, entry: finance });
            await message.reply(
              `Registro financeiro salvo: ${finance.kind} de R$ ${finance.amount.toFixed(2)} (${finance.note}).`,
            );
            console.log(
              `[whatsapp] financeiro registrado (${finance.kind}) R$ ${finance.amount.toFixed(2)}: ${finance.note}`,
            );
            return;
          }
        }
        /** Painel executivo completo sob demanda: `!briefing` (evita textao generico antes da conversa). */
      }

      if (await this.tryHandleAdminQuickCommands(message, body)) {
        return;
      }

      if (isSelfChat) {
        const fp = `${message.from}:${body}`;
        if (this.lastBotReplyFingerprintByJid.get(message.from) === fp) {
          console.log('[whatsapp] ignorando eco da própria resposta para evitar loop');
          return;
        }
      }
      if (!isAdmin && this.shouldThrottle(message.from)) {
        console.log('[whatsapp] mensagem ignorada por intervalo mínimo (anti-spam)');
        return;
      }

      const logPrefix = isAdmin ? '[whatsapp] operador' : '[whatsapp] cliente';
      console.log(`${logPrefix} mensagem: ${body.slice(0, 120)}`);
      const senderNumber = this.senderNumber(message);
      if (senderNumber) {
        this.recentInboundByNumber.set(senderNumber, {
          number: senderNumber,
          jid: message.from,
          paused: this.pausedByNumber.has(senderNumber),
          lastInboundAt: new Date().toISOString(),
          lastInboundPreview: body.slice(0, 120),
        });
      }

      if (!isAdmin && this.status.autoReplyMode === 'manual') {
        console.log('[whatsapp] modo manual ativo; sem resposta automática para clientes');
        return;
      }
      if (!isAdmin && senderNumber && this.pausedByNumber.has(senderNumber)) {
        console.log(`[whatsapp] handoff humano ativo para ${senderNumber}; sem resposta automática`);
        return;
      }
      if (!isAdmin && senderNumber && this.wantsHumanAttendance(body)) {
        await this.pauseForHumanHandoff({
          message,
          customerNumber: senderNumber,
          customerMessage: body,
          reason: 'cliente pediu atendimento humano',
        });
        return;
      }
      if (!isAdmin && !this.recordAutoReplyQuota(message.from)) {
        if (senderNumber) {
          await this.pauseForHumanHandoff({
            message,
            customerNumber: senderNumber,
            customerMessage: body,
            reason: 'limite de respostas automáticas atingido',
          });
        }
        return;
      }

      const staticReply = env.WHATSAPP_STATIC_REPLY?.trim();
      if (!isAdmin && staticReply) {
        if (this.staticReplySentByJid.has(message.from)) {
          console.log('[whatsapp] mensagem fixa já enviada para este contato; sem resposta automática');
          return;
        }
        await message.reply(staticReply.slice(0, 3500));
        this.staticReplySentByJid.add(message.from);
        this.lastBotReplyFingerprintByJid.set(message.from, `${message.from}:${staticReply}`);
        console.log('[whatsapp] resposta enviada (modo mensagem fixa)');
        return;
      }

      const userId = await this.resolveAgentUserId();
      if (!userId) {
        console.log(
          `[whatsapp] usuário "${env.WHATSAPP_AGENT_USER_EMAIL}" não encontrado para rotear conversa`,
        );
        return;
      }

      const flow = await processAgentMessage({
        userId,
        content: body,
        conversationId: this.conversationByJid.get(message.from),
        channel: isAdmin ? 'whatsapp_admin' : 'whatsapp_customer',
        conversationTitle: isAdmin ? 'WhatsApp · operador' : undefined,
        customerPhone: !isAdmin ? senderNumber ?? undefined : undefined,
        customerWhatsappId: !isAdmin ? message.from : undefined,
      });
      this.conversationByJid.set(message.from, flow.conversationId);

      const responseText = flow.assistantMessage.content.slice(0, 3500);
      const responseFingerprint = `${message.from}:${responseText.trim()}`;
      if (!isAdmin && this.lastBotReplyFingerprintByJid.get(message.from) === responseFingerprint) {
        if (senderNumber) {
          await this.pauseForHumanHandoff({
            message,
            customerNumber: senderNumber,
            customerMessage: body,
            reason: 'resposta automática repetida',
          });
        }
        console.log('[whatsapp] resposta repetida detectada; handoff humano acionado');
        return;
      }
      await message.reply(responseText);
      this.lastBotReplyFingerprintByJid.set(message.from, responseFingerprint);
      console.log('[whatsapp] resposta enviada');
      if (!isAdmin && flow.agentMeta.imageJob) {
        this.watchImageJobForWhatsApp({ jobId: flow.agentMeta.imageJob.id, jid: message.from });
      }
      if (!isAdmin && senderNumber && shouldHandoffToSalesManager(responseText)) {
        await this.notifySalesManager({
          customerNumber: senderNumber,
          customerMessage: body,
          agentReply: responseText,
        });
      }
    } catch (error) {
      this.status.lastError =
        error instanceof Error ? `falha no processamento da mensagem: ${error.message}` : 'erro interno';
      console.log(`[whatsapp] erro: ${this.status.lastError}`);
    }
  }
}

export const whatsappService = new WhatsAppService();
