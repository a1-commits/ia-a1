'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/platform/PageHeader';
import { ToolIntegrationCard } from '@/components/platform/ToolIntegrationCard';
import { fetchPlatformTools } from '@/lib/integrations-hub';
import type { PlatformTool } from '@/types/platform';

export default function FerramentasPage(): React.ReactElement {
  const [tools, setTools] = useState<PlatformTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await fetchPlatformTools());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Integrações"
          title="Ferramentas"
          description="Status real das integrações disponíveis. Configure em Ajustes."
          actions={
            <Link href="/settings">
              <Button variant="accent">Ir para Ajustes</Button>
            </Link>
          }
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        {loading && <p className="text-sm text-[var(--muted)]">Carregando integrações…</p>}

        {!loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {tools.map((tool) => (
              <ToolIntegrationCard
                key={tool.id}
                tool={tool}
                onConfigure={() => {
                  window.location.href = tool.settingsHref ?? '/settings';
                }}
                onTest={() => {
                  if (!tool.connected) {
                    showFeedback(`"${tool.name}" não está conectado. Configure em Ajustes.`);
                    return;
                  }
                  showFeedback(`Conexão de "${tool.name}" verificada.`);
                  void load();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
