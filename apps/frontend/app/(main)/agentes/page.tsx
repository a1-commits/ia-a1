'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { MOCK_AGENTS, type PlatformAgent } from '@/lib/mock/platform';

export default function AgentesPage(): React.ReactElement {
  const [agents, setAgents] = useState<PlatformAgent[]>(MOCK_AGENTS);
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  function duplicateAgent(agent: PlatformAgent): void {
    const copy: PlatformAgent = {
      ...agent,
      id: `${agent.id}-copy-${Date.now()}`,
      name: `${agent.name} (cópia)`,
      active: false,
      contactCount: 0,
      updatedAt: new Date().toISOString(),
    };
    setAgents((prev) => [...prev, copy]);
    showFeedback(`Agente "${agent.name}" duplicado (mock).`);
  }

  function toggleAgent(agent: PlatformAgent): void {
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, active: !a.active, updatedAt: new Date().toISOString() } : a)),
    );
    showFeedback(`Agente "${agent.name}" ${agent.active ? 'desativado' : 'ativado'} (mock).`);
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Agentes de IA"
          title="Agentes"
          description="Crie, treine e gerencie agentes inteligentes para atender seus contatos."
          actions={
            <Link href="/agentes/novo/treinamento">
              <Button variant="accent">Criar agente</Button>
            </Link>
          }
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        <div className="space-y-4">
          {agents.map((agent) => (
            <PlatformCard key={agent.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--fg)]">{agent.name}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        agent.active
                          ? 'bg-[var(--success)]/15 text-[var(--success)]'
                          : 'bg-[var(--muted)]/15 text-[var(--muted)]'
                      }`}
                    >
                      {agent.active ? 'ativo' : 'inativo'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{agent.description}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                    <span>{agent.contactCount} contatos</span>
                    <span>{agent.model}</span>
                    <span>Atualizado {new Date(agent.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/agentes/${agent.id}/treinamento`}>
                    <Button variant="ghost" className="text-xs">
                      Editar
                    </Button>
                  </Link>
                  <Button variant="ghost" className="text-xs" onClick={() => duplicateAgent(agent)}>
                    Duplicar
                  </Button>
                  <Button variant="ghost" className="text-xs" onClick={() => toggleAgent(agent)}>
                    {agent.active ? 'Desativar' : 'Ativar'}
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
