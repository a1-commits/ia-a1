'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { api } from '@/lib/api';

type BlingConnection = {
  id: string;
  storeLabel: string;
  clientId: string;
  clientSecretMasked: string;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
};

export default function BlingIntegrationPage(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const [connections, setConnections] = useState<BlingConnection[]>([]);
  const [maxConnections, setMaxConnections] = useState(4);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: BlingConnection[]; maxConnections: number }>(
        `/api/integrations/bling/connections?agentId=${agentId}`,
      );
      setConnections(res.items);
      setMaxConnections(res.maxConnections);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('connected')) {
      setFeedback('Loja Bling conectada com sucesso.');
    }
    const error = searchParams.get('error');
    if (error) {
      setFeedback(decodeURIComponent(error));
    }
  }, [searchParams]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/api/integrations/bling/connections', {
        method: 'POST',
        body: JSON.stringify({ agentId, storeLabel, clientId, clientSecret }),
      });
      setStoreLabel('');
      setClientId('');
      setClientSecret('');
      setFeedback('Conexão criada. Clique em Conectar Bling para autorizar.');
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao criar conexão.');
    }
  }

  async function connectBling(connectionId: string): Promise<void> {
    setBusyId(connectionId);
    try {
      const res = await api<{ authorizeUrl: string }>(
        `/api/integrations/bling/connect/${connectionId}`,
      );
      window.location.href = res.authorizeUrl;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao iniciar OAuth Bling.');
      setBusyId(null);
    }
  }

  async function testConnection(id: string): Promise<void> {
    setBusyId(id);
    try {
      const res = await api<{ ok: boolean; message: string }>(
        `/api/integrations/bling/connections/${id}/test`,
        { method: 'POST' },
      );
      setFeedback(res.message);
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha no teste.');
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(id: string): Promise<void> {
    setBusyId(id);
    try {
      await api(`/api/integrations/bling/connections/${id}`, { method: 'DELETE' });
      setFeedback('Loja desconectada.');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-3xl">
        <PageHeader
          eyebrow="Integrações"
          title="Bling — multi-lojas"
          description={`Conecte até ${maxConnections} contas Bling para consulta de estoque por código de barras.`}
          actions={
            <Link href={`/agentes/${agentId}`}>
              <Button variant="ghost" className="text-xs">
                Voltar ao agente
              </Button>
            </Link>
          }
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm">
            {feedback}
          </div>
        )}

        {connections.length < maxConnections && (
          <PlatformCard className="mb-6">
            <h2 className="mb-4 text-sm font-semibold">Nova loja Bling</h2>
            <form onSubmit={(e) => void handleCreate(e)} className="grid gap-3">
              <input
                value={storeLabel}
                onChange={(e) => setStoreLabel(e.target.value)}
                placeholder="Nome da loja (ex.: Loja 1)"
                className="premium-input"
                required
              />
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID"
                className="premium-input"
                required
              />
              <input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Client Secret"
                type="password"
                className="premium-input"
                required
              />
              <Button type="submit" variant="accent">
                Salvar e preparar OAuth
              </Button>
            </form>
          </PlatformCard>
        )}

        {loading && <p className="text-sm text-[var(--muted)]">Carregando lojas…</p>}

        <div className="space-y-3">
          {connections.map((c) => (
            <PlatformCard key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--fg)]">{c.storeLabel}</h3>
                  <p className="text-xs text-[var(--muted)]">Client ID: {c.clientId}</p>
                  <p className="text-xs text-[var(--muted)]">Secret: {c.clientSecretMasked}</p>
                  <p className="mt-1 text-xs">
                    Status: <strong>{c.status}</strong>
                    {c.lastError ? ` — ${c.lastError}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="accent"
                    className="text-xs"
                    disabled={busyId === c.id}
                    onClick={() => void connectBling(c.id)}
                  >
                    Conectar Bling
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={busyId === c.id}
                    onClick={() => void testConnection(c.id)}
                  >
                    Testar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs text-[var(--moble-danger)]"
                    disabled={busyId === c.id}
                    onClick={() => void disconnect(c.id)}
                  >
                    Desconectar
                  </Button>
                </div>
              </div>
            </PlatformCard>
          ))}
        </div>
      </div>
    </div>
  );
}
