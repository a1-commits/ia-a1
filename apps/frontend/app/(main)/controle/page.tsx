'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiUrlSettings } from '@/components/ApiUrlSettings';
import { Card } from '@/components/Card';
import { api } from '@/lib/api';

type AiStatus = {
  mode: 'real' | 'unavailable';
  provider: 'openai' | 'ollama' | 'none';
  selectedMode: 'real' | null;
  strategy: 'local_only' | 'hybrid' | 'openai_only';
  localConfigured: boolean;
  label: string;
  reason: string | null;
};

type WhatsAppStatus = {
  enabled: boolean;
  connected: boolean;
  qrPending: boolean;
  lastError: string | null;
  allowedNumber: string | null;
  startedAt: string | null;
  autoReplyMode: 'agent' | 'manual';
};

type WhatsAppContact = {
  number: string;
  jid: string;
  paused: boolean;
  lastInboundAt: string;
  lastInboundPreview: string;
};

export default function ControlePage(): React.ReactElement {
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);
  const [whatsAppContacts, setWhatsAppContacts] = useState<WhatsAppContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [ai, wa, contacts] = await Promise.all([
        api<AiStatus>('/api/ai/status'),
        api<WhatsAppStatus>('/api/whatsapp/status'),
        api<{ items: WhatsAppContact[] }>('/api/whatsapp/contacts'),
      ]);
      setAiStatus(ai);
      setWhatsAppStatus(wa);
      setWhatsAppContacts(contacts.items);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function setWhatsAppMode(mode: 'agent' | 'manual'): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const status = await api<WhatsAppStatus>('/api/whatsapp/mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setWhatsAppStatus(status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao alterar modo do WhatsApp');
    } finally {
      setBusy(false);
    }
  }

  async function setContactHandoff(number: string, paused: boolean): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/whatsapp/handoff', {
        method: 'POST',
        body: JSON.stringify({ number, paused }),
      });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar contato');
    } finally {
      setBusy(false);
    }
  }

  async function updateAiStrategy(strategy: 'local_only' | 'hybrid' | 'openai_only'): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api<AiStatus>('/api/ai/strategy', {
        method: 'POST',
        body: JSON.stringify({ strategy }),
      });
      setAiStatus(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao alterar estratégia');
    } finally {
      setBusy(false);
    }
  }

  const waLabel =
    whatsAppStatus == null
      ? '…'
      : whatsAppStatus.connected
        ? 'conectado'
        : whatsAppStatus.qrPending
          ? 'aguardando QR'
          : 'desconectado';

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Painel</h1>
        <p className="text-sm text-zinc-500">
          Controles rápidos no celular. O chat web e o WhatsApp usam o mesmo agente no servidor.
        </p>
      </header>

      <div className="mx-auto grid max-w-lg gap-4">
        <Card>
          <Link
            href="/chat"
            className="flex w-full items-center justify-center rounded-xl bg-[var(--mobi-orange)] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[rgba(239,75,26,0.28)] transition hover:brightness-105"
          >
            Abrir chat
          </Link>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Conversas pelo navegador · respostas alinhadas ao mesmo fluxo do WhatsApp
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Rede e API</h2>
          <ApiUrlSettings hint="Deixe em branco para usar a API no mesmo endereço do app, sempre pela porta 3000." />
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-zinc-700">WhatsApp</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-black/10 px-2 py-1 text-[10px] text-zinc-500"
            >
              Atualizar
            </button>
          </div>
          {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
          <p className="mb-3 text-xs text-zinc-500">
            Status: <span className="text-zinc-700">{waLabel}</span>
            {whatsAppStatus?.lastError ? (
              <span className="block text-[var(--mobi-orange)]">{whatsAppStatus.lastError}</span>
            ) : null}
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setWhatsAppMode('agent')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                whatsAppStatus?.autoReplyMode === 'agent'
                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-white text-zinc-700'
              }`}
            >
              Automação ligada
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setWhatsAppMode('manual')}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                whatsAppStatus?.autoReplyMode === 'manual'
                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-white text-zinc-700'
              }`}
            >
              Pausar bot (manual)
            </button>
          </div>
          {whatsAppContacts.length > 0 && (
            <div className="space-y-2 border-t border-black/10 pt-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Contatos recentes
              </div>
              {whatsAppContacts.slice(0, 8).map((c) => (
                <div
                  key={c.number}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-zinc-50 px-2 py-2"
                >
                  <div className="min-w-0 text-xs">
                    <div className="font-medium text-zinc-800">{c.number}</div>
                    <div className="truncate text-zinc-500">{c.lastInboundPreview}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setContactHandoff(c.number, !c.paused)}
                    className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                      c.paused
                        ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                        : 'border-black/10 bg-white text-zinc-700'
                    }`}
                  >
                    {c.paused ? 'Retomar bot' : 'Assumir humano'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-600">
            QR code e conexão completa ficam em{' '}
            <Link href="/settings" className="text-[var(--mobi-orange)] underline-offset-2 hover:underline">
              Ajustes
            </Link>
            .
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Estratégia da IA</h2>
          {aiStatus && (
            <p
              className={`mb-3 inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${
                aiStatus.mode === 'real'
                  ? 'border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-zinc-100 text-zinc-700'
              }`}
            >
              {aiStatus.label}
            </p>
          )}
          {aiStatus?.reason && <p className="mb-3 text-xs text-zinc-500">{aiStatus.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateAiStrategy('local_only')}
              className={`rounded-lg border px-3 py-2 text-xs ${
                aiStatus?.strategy === 'local_only'
                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-white text-zinc-700'
              }`}
            >
              Local (Ollama)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateAiStrategy('hybrid')}
              className={`rounded-lg border px-3 py-2 text-xs ${
                aiStatus?.strategy === 'hybrid'
                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-white text-zinc-700'
              }`}
            >
              Híbrido
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateAiStrategy('openai_only')}
              className={`rounded-lg border px-3 py-2 text-xs ${
                aiStatus?.strategy === 'openai_only'
                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-white text-zinc-700'
              }`}
            >
              OpenAI
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Modo da IA e testes:{' '}
            <Link href="/settings" className="text-[var(--mobi-orange)] underline-offset-2 hover:underline">
              Ajustes → IA
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
