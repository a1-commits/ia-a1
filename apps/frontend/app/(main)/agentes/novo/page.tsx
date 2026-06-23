'use client';

import { Suspense } from 'react';
import { AgentEditor } from '@/components/platform/AgentEditor';
import { createEmptyAgent } from '@/lib/agents-store';

export default function NovoAgentePage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="page-shell text-sm text-[var(--muted)]">Carregando…</div>}>
      <AgentEditor initialAgent={createEmptyAgent()} isNew />
    </Suspense>
  );
}
