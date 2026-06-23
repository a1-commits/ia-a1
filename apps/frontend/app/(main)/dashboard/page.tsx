'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformMetricCard } from '@/components/platform/PlatformMetricCard';
import { api } from '@/lib/api';
import {
  MOCK_AGENTS,
  connectedToolsCount,
  contactsWithAgentCount,
} from '@/lib/mock/platform';

type HubOverview = {
  ai: {
    provider: 'openai' | 'ollama' | 'mock';
  };
  whatsapp: {
    status: {
      connected: boolean;
    };
  };
  metrics: {
    totalConversations: number;
    messagesLast24h: number;
  };
};

function formatModel(provider: string): string {
  if (provider === 'ollama') return 'Qwen / Ollama';
  if (provider === 'openai') return 'OpenAI';
  return 'Simulação';
}

export default function DashboardPage(): React.ReactElement {
  const [data, setData] = useState<HubOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<HubOverview>('/api/operator/overview');
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

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Hub de agentes"
          title="Dashboard"
          description="Visão geral da plataforma: agentes, contatos, conversas e ferramentas."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PlatformMetricCard
            label="Agentes criados"
            value={loading ? '…' : MOCK_AGENTS.length}
            hint={`${MOCK_AGENTS.filter((a) => a.active).length} ativos`}
            tone="primary"
          />
          <PlatformMetricCard
            label="Contatos com agente"
            value={loading ? '…' : contactsWithAgentCount()}
            hint="Atribuição explícita"
          />
          <PlatformMetricCard
            label="Conversas hoje"
            value={loading ? '…' : (data?.metrics.totalConversations ?? 0)}
          />
          <PlatformMetricCard
            label="Mensagens hoje"
            value={loading ? '…' : (data?.metrics.messagesLast24h ?? 0)}
            tone="success"
          />
          <PlatformMetricCard
            label="WhatsApp conectado"
            value={loading ? '…' : data?.whatsapp.status.connected ? 'Sim' : 'Não'}
            tone={data?.whatsapp.status.connected ? 'success' : 'neutral'}
          />
          <PlatformMetricCard
            label="Modelo local ativo"
            value={loading ? '…' : formatModel(data?.ai.provider ?? 'mock')}
            tone="primary"
          />
          <PlatformMetricCard
            label="Ferramentas conectadas"
            value={loading ? '…' : connectedToolsCount()}
            hint="Integrações ativas"
            tone="success"
          />
        </div>
      </div>
    </div>
  );
}
