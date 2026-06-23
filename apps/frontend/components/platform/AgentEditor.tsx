'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { FormField } from '@/components/platform/FormField';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import {
  MOCK_TOOLS,
  type AgentTab,
  type PlatformAgent,
} from '@/lib/mock/platform';

const TABS: { id: AgentTab; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'treinamento', label: 'Treinamento' },
  { id: 'ferramentas', label: 'Ferramentas' },
  { id: 'teste', label: 'Teste' },
];

export function AgentEditor({
  initialAgent,
  isNew,
}: {
  initialAgent: PlatformAgent;
  isNew: boolean;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as AgentTab | null;
  const activeTab = TABS.some((t) => t.id === tabParam) ? tabParam! : 'perfil';

  const [agent, setAgent] = useState<PlatformAgent>(initialAgent);
  const [saved, setSaved] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState<string | null>(null);

  function setTab(tab: AgentTab): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function save(): void {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function toggleTool(toolId: string): void {
    setAgent((prev) => ({
      ...prev,
      toolIds: prev.toolIds.includes(toolId)
        ? prev.toolIds.filter((id) => id !== toolId)
        : [...prev.toolIds, toolId],
    }));
  }

  function runTest(): void {
    const msg = testInput.trim();
    if (!msg) return;
    setTestReply(`[${agent.name}] Entendi. Como posso ajudar com isso? (mock)`);
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-4xl">
        <PageHeader
          eyebrow="Agente"
          title={isNew ? 'Novo agente' : agent.name}
          description="Configure perfil, treinamento, ferramentas e teste o agente."
          actions={
            <Link href="/agentes">
              <Button variant="ghost" className="text-xs">
                Voltar
              </Button>
            </Link>
          }
        />

        {saved && (
          <div className="mb-4 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-2 text-sm">
            Agente salvo (mock).
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`rounded-t-lg px-4 py-2 text-sm transition ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--primary)] font-medium text-[var(--fg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'perfil' && (
          <PlatformCard className="space-y-5">
            <FormField label="Nome do agente" value={agent.name} onChange={(v) => setAgent({ ...agent, name: v })} rows={1} />
            <FormField
              label="Descrição"
              value={agent.description}
              onChange={(v) => setAgent({ ...agent, description: v })}
            />
            <FormField label="Objetivo" value={agent.objective} onChange={(v) => setAgent({ ...agent, objective: v })} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Modelo
              </span>
              <select
                value={agent.model}
                onChange={(e) => setAgent({ ...agent, model: e.target.value })}
                className="premium-input"
              >
                <option value="Qwen / Ollama">Qwen / Ollama</option>
                <option value="OpenAI">OpenAI</option>
                <option value="Simulação">Simulação</option>
              </select>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={agent.active}
                onChange={(e) => setAgent({ ...agent, active: e.target.checked })}
                className="rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--fg)]">Agente ativo</span>
            </label>
            <Button variant="accent" onClick={save}>
              Salvar perfil
            </Button>
          </PlatformCard>
        )}

        {activeTab === 'treinamento' && (
          <PlatformCard className="space-y-5">
            <FormField
              label="Instruções"
              value={agent.instructions}
              onChange={(v) => setAgent({ ...agent, instructions: v })}
            />
            <FormField label="Regras" value={agent.rules} onChange={(v) => setAgent({ ...agent, rules: v })} />
            <FormField
              label="O que nunca fazer"
              value={agent.neverDo}
              onChange={(v) => setAgent({ ...agent, neverDo: v })}
            />
            <FormField
              label="Exemplos de perguntas"
              value={agent.exampleQuestions}
              onChange={(v) => setAgent({ ...agent, exampleQuestions: v })}
              rows={4}
            />
            <FormField
              label="Exemplos de respostas"
              value={agent.exampleAnswers}
              onChange={(v) => setAgent({ ...agent, exampleAnswers: v })}
              rows={4}
            />
            <Button variant="accent" onClick={save}>
              Salvar treinamento
            </Button>
          </PlatformCard>
        )}

        {activeTab === 'ferramentas' && (
          <div className="space-y-3">
            {MOCK_TOOLS.map((tool) => (
              <PlatformCard key={tool.id} className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-[var(--fg)]">{tool.name}</div>
                  <div className="text-sm text-[var(--muted)]">{tool.description}</div>
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={agent.toolIds.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  Usar neste agente
                </label>
              </PlatformCard>
            ))}
            <Button variant="accent" onClick={save}>
              Salvar ferramentas
            </Button>
          </div>
        )}

        {activeTab === 'teste' && (
          <PlatformCard className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Simule uma mensagem para testar o comportamento do agente (mock).
            </p>
            <div className="flex gap-2">
              <input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Digite uma mensagem de teste…"
                className="premium-input flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runTest();
                }}
              />
              <Button variant="accent" onClick={runTest}>
                Enviar
              </Button>
            </div>
            {testReply && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3 text-sm text-[var(--fg)]">
                {testReply}
              </div>
            )}
          </PlatformCard>
        )}
      </div>
    </div>
  );
}
