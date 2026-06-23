'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/platform/PageHeader';
import { ToolIntegrationCard } from '@/components/platform/ToolIntegrationCard';
import { MOCK_TOOLS, type PlatformTool } from '@/lib/mock/platform';

export default function FerramentasPage(): React.ReactElement {
  const [tools] = useState<PlatformTool[]>(MOCK_TOOLS);
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  function configureTool(toolId: string): void {
    showFeedback(`Configuração de "${tools.find((t) => t.id === toolId)?.name}" (mock).`);
  }

  function testTool(toolId: string): void {
    showFeedback(`Conexão testada com sucesso — ${tools.find((t) => t.id === toolId)?.name} (mock).`);
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Integrações"
          title="Ferramentas"
          description="Conecte APIs e canais que seus agentes poderão utilizar."
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => (
            <ToolIntegrationCard
              key={tool.id}
              tool={tool}
              onConfigure={() => configureTool(tool.id)}
              onTest={() => testTool(tool.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
