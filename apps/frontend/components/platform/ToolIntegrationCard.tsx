'use client';

import { Button } from '@/components/Button';
import { PlatformCard } from '@/components/platform/PlatformCard';
import type { PlatformTool } from '@/lib/mock/platform';

export function ToolIntegrationCard({
  tool,
  onConfigure,
  onTest,
}: {
  tool: PlatformTool;
  onConfigure?: () => void;
  onTest?: () => void;
}): React.ReactElement {
  return (
    <PlatformCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--fg)]">{tool.name}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{tool.description}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
            tool.connected
              ? 'bg-[var(--success)]/15 text-[var(--success)]'
              : 'bg-[var(--muted)]/15 text-[var(--muted)]'
          }`}
        >
          {tool.connected ? 'conectado' : 'não conectado'}
        </span>
      </div>
      <div className="mt-4 text-xs text-[var(--muted)]">
        Última sincronização:{' '}
        {tool.lastSync ? new Date(tool.lastSync).toLocaleString('pt-BR') : '—'}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" className="text-xs" onClick={onConfigure}>
          Configurar
        </Button>
        <Button variant="ghost" className="text-xs" onClick={onTest} disabled={!tool.connected}>
          Testar conexão
        </Button>
      </div>
    </PlatformCard>
  );
}
