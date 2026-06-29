'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformMetricCard } from '@/components/platform/PlatformMetricCard';
import { countActiveAgents, countAgents } from '@/lib/agents-api';
import { api } from '@/lib/api';
import { countContactsWithAgent } from '@/lib/contacts-api';
import { countConnectedTools } from '@/lib/integrations-hub';
import { whatsappStatusLabel, type WhatsappHealth } from '@/lib/whatsapp-operations';

type HubOverview = {
  ai: {
    provider: 'openai' | 'ollama' | 'none';
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
  return 'Indisponível';
}

export default function DashboardPage(): React.ReactElement {
  const [data, setData] = useState<HubOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentCount, setAgentCount] = useState(0);
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  const [contactsWithAgent, setContactsWithAgent] = useState(0);
  const [connectedTools, setConnectedTools] = useState(0);
  const [whatsappHealth, setWhatsappHealth] = useState<WhatsappHealth | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, waHealth] = await Promise.all([
        api<HubOverview>('/api/operator/overview'),
        api<WhatsappHealth>('/api/whatsapp/health').catch(() => null),
      ]);
      setData(res);
      setWhatsappHealth(waHealth);
    } catch {
      setData(null);
      setWhatsappHealth(null);
    }
    setAgentCount(await countAgents());
    setActiveAgentCount(await countActiveAgents());
    setContactsWithAgent(await countContactsWithAgent());
    try {
      setConnectedTools(await countConnectedTools());
    } catch {
      setConnectedTools(0);
    }
    setLoading(false);
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
            value={loading ? '…' : agentCount}
            hint={`${activeAgentCount} ativos`}
            tone="primary"
          />
          <PlatformMetricCard
            label="Contatos com agente"
            value={loading ? '…' : contactsWithAgent}
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
            value={
              loading
                ? '…'
                : whatsappHealth
                  ? whatsappStatusLabel(whatsappHealth.status)
                  : '🔴 Offline'
            }
            tone={
              whatsappHealth?.status === 'CONNECTED'
                ? 'success'
                : whatsappHealth?.status === 'CONNECTING' || whatsappHealth?.status === 'WAITING_QR'
                  ? 'primary'
                  : 'neutral'
            }
          />
          <PlatformMetricCard
            label="Modelo local ativo"
            value={loading ? '…' : formatModel(data?.ai.provider ?? 'none')}
            tone="primary"
          />
          <PlatformMetricCard
            label="Ferramentas conectadas"
            value={loading ? '…' : connectedTools}
            hint="WhatsApp, Olist e outras"
            tone="success"
          />
        </div>
      </div>
    </div>
  );
}
