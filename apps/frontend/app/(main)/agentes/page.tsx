'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import {
  deleteAgent,
  duplicateAgent,
  listAgents,
  setDefaultAgent,
  toggleAgentActive,
} from '@/lib/agents-api';
import type { PlatformAgent } from '@/types/platform';

export default function AgentesPage(): React.ReactElement {
  const router = useRouter();
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAgents(await listAgents());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  async function handleDuplicate(agent: PlatformAgent): Promise<void> {
    const copy = await duplicateAgent(agent.id);
    if (!copy) return;
    await reload();
    showFeedback(`Agente "${agent.name}" duplicado.`);
  }

  async function handleToggle(agent: PlatformAgent): Promise<void> {
    await toggleAgentActive(agent.id);
    await reload();
    showFeedback(`Agente "${agent.name}" ${agent.active ? 'desativado' : 'ativado'}.`);
  }

  async function handleDefault(agent: PlatformAgent): Promise<void> {
    await setDefaultAgent(agent.id);
    await reload();
    showFeedback(`"${agent.name}" definido como agente padrão.`);
  }

  async function handleDelete(agent: PlatformAgent): Promise<void> {
    try {
      await deleteAgent(agent.id);
      await reload();
      showFeedback(`Agente "${agent.name}" removido.`);
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Hub de agentes"
          title="Agentes"
          description="Crie, edite e gerencie agentes de IA para seus contatos e canais."
          actions={
            <Link href="/agentes/novo">
              <Button variant="accent">Novo agente</Button>
            </Link>
          }
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        {loading && <p className="text-sm text-[var(--muted)]">Carregando agentes…</p>}

        {!loading && agents.length === 0 && (
          <EmptyState
            title="Nenhum agente criado"
            description="Crie seu primeiro agente para começar a atender contatos."
            action={
              <Link href="/agentes/novo">
                <Button variant="accent">Criar primeiro agente</Button>
              </Link>
            }
          />
        )}

        <div className="space-y-4">
          {agents.map((agent) => (
            <PlatformCard key={agent.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--fg)]">{agent.name}</h2>
                    {agent.isDefault && (
                      <span className="rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                        padrão
                      </span>
                    )}
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
                  {agent.description && <p className="mt-2 text-sm text-[var(--muted)]">{agent.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                    <span>{agent.model}</span>
                    <span>{agent.contactCount} contatos</span>
                    <span>{agent.toolIds.length} ferramentas</span>
                    <span>Atualizado {new Date(agent.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/agentes/${agent.id}`}>
                    <Button variant="ghost" className="text-xs">
                      Editar
                    </Button>
                  </Link>
                  <Button variant="ghost" className="text-xs" onClick={() => void handleDuplicate(agent)}>
                    Duplicar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() => router.push(`/agentes/${agent.id}?tab=teste`)}
                  >
                    Testar
                  </Button>
                  {!agent.isDefault && (
                    <Button variant="ghost" className="text-xs" onClick={() => void handleDefault(agent)}>
                      Definir padrão
                    </Button>
                  )}
                  <Button variant="ghost" className="text-xs" onClick={() => void handleToggle(agent)}>
                    {agent.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  {!agent.isDefault && (
                    <Button
                      variant="ghost"
                      className="text-xs text-[var(--moble-danger)]"
                      onClick={() => void handleDelete(agent)}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            </PlatformCard>
          ))}
        </div>
      </div>
    </div>
  );
}
