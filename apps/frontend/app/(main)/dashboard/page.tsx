'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { PlatformMetricCard } from '@/components/platform/PlatformMetricCard';
import { api } from '@/lib/api';
import { MOCK_AGENTS } from '@/lib/mock/platform';

type OperatorOverview = {
  updatedAt: string;
  ai: {
    mode: 'real' | 'mock';
    provider: 'openai' | 'ollama' | 'mock';
    strategy: string;
  };
  whatsapp: {
    status: {
      connected: boolean;
      autoReplyMode: 'agent' | 'manual';
    };
    recentContacts: Array<{
      number: string;
      lastInboundAt: string;
      lastInboundPreview: string;
    }>;
  };
  metrics: {
    totalConversations: number;
    messagesLast24h: number;
  };
  recentLeadConversations?: Array<{
    id: string;
    title: string;
    lastMessageAt: string;
  }>;
};

function formatModel(provider: string): string {
  if (provider === 'ollama') return 'Qwen / Ollama';
  if (provider === 'openai') return 'OpenAI';
  return 'Simulação';
}

export default function DashboardPage(): React.ReactElement {
  const [data, setData] = useState<OperatorOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<OperatorOverview>('/api/operator/overview');
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAgents = MOCK_AGENTS.filter((a) => a.active).length;
  const contactsCount = data?.whatsapp.recentContacts.length ?? 0;

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Plataforma"
          title="Dashboard"
          description="Visão operacional dos seus agentes de IA, conversas e integrações."
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <PlatformMetricCard label="Agentes ativos" value={loading ? '…' : activeAgents} tone="primary" />
          <PlatformMetricCard
            label="Contatos atendidos"
            value={loading ? '…' : contactsCount}
            hint="Contatos recentes no WhatsApp"
          />
          <PlatformMetricCard
            label="Conversas hoje"
            value={loading ? '…' : (data?.metrics.totalConversations ?? 0)}
            hint="Total registrado"
          />
          <PlatformMetricCard
            label="Mensagens hoje"
            value={loading ? '…' : (data?.metrics.messagesLast24h ?? 0)}
            hint="Últimas 24 horas"
            tone="success"
          />
          <PlatformMetricCard
            label="WhatsApp"
            value={loading ? '…' : data?.whatsapp.status.connected ? 'Conectado' : 'Desconectado'}
            tone={data?.whatsapp.status.connected ? 'success' : 'neutral'}
          />
          <PlatformMetricCard
            label="Modelo atual"
            value={loading ? '…' : formatModel(data?.ai.provider ?? 'mock')}
            hint={data?.ai.strategy ?? '—'}
            tone="primary"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <PlatformCard className="lg:col-span-1">
            <h2 className="mb-4 text-sm font-semibold text-[var(--fg)]">Últimas conversas</h2>
            <div className="space-y-3">
              {(data?.recentLeadConversations ?? []).slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href="/chat"
                  className="block rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3 transition hover:border-[var(--primary)]/40"
                >
                  <div className="font-medium text-[var(--fg)]">{item.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {new Date(item.lastMessageAt).toLocaleString('pt-BR')}
                  </div>
                </Link>
              ))}
              {!loading && (data?.recentLeadConversations?.length ?? 0) === 0 && (
                <p className="text-sm text-[var(--muted)]">Nenhuma conversa recente.</p>
              )}
            </div>
          </PlatformCard>

          <PlatformCard className="lg:col-span-1">
            <h2 className="mb-4 text-sm font-semibold text-[var(--fg)]">Últimos contatos</h2>
            <div className="space-y-3">
              {(data?.whatsapp.recentContacts ?? []).slice(0, 5).map((item) => (
                <div
                  key={item.number}
                  className="rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3"
                >
                  <div className="font-medium text-[var(--fg)]">{item.number}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{item.lastInboundPreview}</div>
                  <div className="mt-1 text-[10px] text-[var(--muted)]">
                    {new Date(item.lastInboundAt).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
              {!loading && (data?.whatsapp.recentContacts.length ?? 0) === 0 && (
                <p className="text-sm text-[var(--muted)]">Nenhum contato recente.</p>
              )}
            </div>
          </PlatformCard>

          <PlatformCard className="lg:col-span-1">
            <h2 className="mb-4 text-sm font-semibold text-[var(--fg)]">Agentes utilizados</h2>
            <div className="space-y-3">
              {MOCK_AGENTS.filter((a) => a.active).map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agentes/${agent.id}/treinamento`}
                  className="block rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3 transition hover:border-[var(--primary)]/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--fg)]">{agent.name}</span>
                    <span className="rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                      ativo
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{agent.model}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{agent.contactCount} contatos</div>
                </Link>
              ))}
            </div>
          </PlatformCard>
        </div>
      </div>
    </div>
  );
}
