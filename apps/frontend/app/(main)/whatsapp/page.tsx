'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { api } from '@/lib/api';
import {
  formatWhatsappTimestamp,
  healthLevelIcon,
  whatsappStatusLabel,
  type WhatsappHealth,
  type WhatsappLogEntry,
  type WhatsappQrResponse,
} from '@/lib/whatsapp-operations';

const HEALTH_ROWS: Array<{ key: keyof WhatsappHealth['checks']; label: string }> = [
  { key: 'client', label: 'Cliente' },
  { key: 'browser', label: 'Browser' },
  { key: 'session', label: 'Sessão' },
  { key: 'listener', label: 'Listener' },
  { key: 'queue', label: 'Fila' },
];

export default function WhatsappOperationsPage(): React.ReactElement {
  const [health, setHealth] = useState<WhatsappHealth | null>(null);
  const [qr, setQr] = useState<WhatsappQrResponse | null>(null);
  const [logs, setLogs] = useState<WhatsappLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [healthRes, qrRes, logsRes] = await Promise.all([
        api<WhatsappHealth>('/api/whatsapp/health'),
        api<WhatsappQrResponse>('/api/whatsapp/qr'),
        api<{ items: WhatsappLogEntry[] }>('/api/whatsapp/logs'),
      ]);
      setHealth(healthRes);
      setQr(qrRes);
      setLogs(logsRes.items);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao carregar central do WhatsApp');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function runAction(
    label: string,
    path: '/api/whatsapp/reconnect' | '/api/whatsapp/restart' | '/api/whatsapp/reset-session',
  ): Promise<void> {
    if (path === '/api/whatsapp/reset-session') {
      const ok = window.confirm('Isso apaga a sessão local e exige novo QR Code. Continuar?');
      if (!ok) return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ ok: boolean; health: WhatsappHealth }>(path, { method: 'POST' });
      setHealth(res.health);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Falha ao executar: ${label}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-container space-y-6">
        <PageHeader
          eyebrow="Operações"
          title="WhatsApp"
          description="Monitoramento, diagnóstico e ações operacionais do canal WhatsApp."
        />

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Status</h2>
          <PlatformCard>
          {loading && !health ? (
            <p className="text-sm text-[var(--muted)]">Carregando…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Conexão</div>
                <div className="mt-1 text-lg font-semibold">
                  {health ? whatsappStatusLabel(health.status) : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Número</div>
                <div className="mt-1 font-medium">{health?.phone ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Sessão</div>
                <div className="mt-1 font-medium">{health?.sessionAge ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Modelo / apelido</div>
                <div className="mt-1 font-medium">{health?.model ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Última atividade</div>
                <div className="mt-1 font-medium">{formatWhatsappTimestamp(health?.lastActivity ?? null)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Mensagens hoje</div>
                <div className="mt-1 font-medium">{health?.messagesToday ?? 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Uptime</div>
                <div className="mt-1 font-medium">{health?.uptime ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Versão</div>
                <div className="mt-1 font-medium">{health?.version ?? health?.provider ?? '—'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Última mensagem</div>
                <div className="mt-1 text-sm text-[var(--fg)]">{health?.lastMessage ?? '—'}</div>
              </div>
            </div>
          )}
          </PlatformCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Health</h2>
          <PlatformCard>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {HEALTH_ROWS.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <span className="text-sm text-[var(--muted)]">{row.label}</span>
                <span className="text-lg">{health ? healthLevelIcon(health.checks[row.key]) : '…'}</span>
              </div>
            ))}
          </div>
          </PlatformCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">QR Code</h2>
          <PlatformCard>
          {qr?.available && qr.image ? (
            <div className="flex flex-col items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.image} alt="QR Code WhatsApp" className="h-64 w-64 rounded-lg border border-[var(--border)]" />
              <button
                type="button"
                disabled={busy}
                onClick={() => void load()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Atualizar QR
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Nenhum QR disponível no momento. Quando o cliente precisar de pareamento, o código aparecerá aqui.
            </p>
          )}
          </PlatformCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Ações</h2>
          <PlatformCard>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction('Reconectar', '/api/whatsapp/reconnect')}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:border-[var(--primary)] disabled:opacity-60"
            >
              Reconectar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction('Reiniciar cliente', '/api/whatsapp/restart')}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:border-[var(--primary)] disabled:opacity-60"
            >
              Reiniciar Cliente
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction('Resetar sessão', '/api/whatsapp/reset-session')}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
            >
              Resetar Sessão
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Atualizar Status
            </button>
          </div>
          </PlatformCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Logs</h2>
          <PlatformCard>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted)]">
                  <th className="px-2 py-2">Horário</th>
                  <th className="px-2 py-2">Evento</th>
                  <th className="px-2 py-2">Nível</th>
                  <th className="px-2 py-2">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-[var(--muted)]">
                      Nenhum evento registrado ainda.
                    </td>
                  </tr>
                ) : (
                  logs.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--border)]/60 align-top">
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--muted)]">
                        {formatWhatsappTimestamp(entry.at)}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{entry.event}</td>
                      <td className="px-2 py-2 uppercase">{entry.level}</td>
                      <td className="px-2 py-2">{entry.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </PlatformCard>
        </section>
      </div>
    </div>
  );
}
