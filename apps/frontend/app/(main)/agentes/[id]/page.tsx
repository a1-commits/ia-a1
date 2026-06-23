'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AgentEditor } from '@/components/platform/AgentEditor';
import { getAgent } from '@/lib/agents-store';

function AgentDetailContent(): React.ReactElement {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const agent = getAgent(id);
  if (!agent) {
    return (
      <div className="page-shell">
        <p className="text-sm text-[var(--muted)]">Agente não encontrado.</p>
      </div>
    );
  }
  return <AgentEditor initialAgent={agent} isNew={false} />;
}

export default function AgenteDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="page-shell text-sm text-[var(--muted)]">Carregando…</div>}>
      <AgentDetailContent />
    </Suspense>
  );
}
