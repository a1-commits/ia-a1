'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { FormField } from '@/components/platform/FormField';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { saveAgent } from '@/lib/agents-store';
import { api } from '@/lib/api';
import { fetchPlatformTools } from '@/lib/integrations-hub';
import { TOOL_CATALOG, type AgentTab, type PlatformAgent, type PlatformTool } from '@/types/platform';

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
  const [tools, setTools] = useState<PlatformTool[]>([]);
  const [saved, setSaved] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPlatformTools().then(setTools);
  }, []);

  useEffect(() => {
    void api<{ provider: string }>('/api/ai/status')
      .then((status) => {
        const model =
          status.provider === 'ollama'
            ? 'Qwen / Ollama'
            : status.provider === 'openai'
              ? 'OpenAI'
              : 'Indisponível';
        setAgent((prev) => (prev.model === 'Qwen / Ollama' || isNew ? { ...prev, model } : prev));
      })
      .catch(() => undefined);
  }, [isNew]);

  function setTab(tab: AgentTab): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function persist(): PlatformAgent | null {
    setError(null);
    if (!agent.name.trim()) {
      setError('Informe o nome do agente.');
      return null;
    }
    const savedAgent = saveAgent(agent);
    setAgent(savedAgent);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
    if (isNew) {
      router.replace(`/agentes/${savedAgent.id}`);
    }
    return savedAgent;
  }

  function toggleTool(toolId: string): void {
    setAgent((prev) => ({
      ...prev,
      toolIds: prev.toolIds.includes(toolId)
        ? prev.toolIds.filter((id) => id !== toolId)
        : [...prev.toolIds, toolId],
    }));
  }

  async function runTest(): Promise<void> {
    const msg = testInput.trim();
    if (!msg) return;
    setTestBusy(true);
    setTestReply(null);
    try {
      const res = await api<{ assistantMessage: { content: string } }>('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify({ content: msg, context: 'GERAL' }),
      });
      setTestReply(res.assistantMessage.content);
    } catch (err) {
      setTestReply(err instanceof Error ? err.message : 'Falha ao testar agente.');
    } finally {
      setTestBusy(false);
    }
  }

  const catalog = tools.length > 0 ? tools : TOOL_CATALOG.map((t) => ({ ...t, connected: false, lastSync: null }));

  return (
    <div className="page-shell">
      <div className="page-container max-w-4xl">
        <PageHeader
          eyebrow="Agente"
          title={isNew ? 'Novo agente' : agent.name || 'Agente'}
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
            Agente salvo.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--moble-danger)]/30 bg-[var(--moble-danger)]/10 px-4 py-2 text-sm">
            {error}
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
              <input value={agent.model} readOnly className="premium-input bg-[var(--hover)]" />
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
            <Button variant="accent" onClick={() => persist()}>
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
            <Button variant="accent" onClick={() => persist()}>
              Salvar treinamento
            </Button>
          </PlatformCard>
        )}

        {activeTab === 'ferramentas' && (
          <div className="space-y-3">
            {catalog.map((tool) => (
              <PlatformCard key={tool.id} className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-[var(--fg)]">{tool.name}</div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        tool.connected
                          ? 'bg-[var(--success)]/15 text-[var(--success)]'
                          : 'bg-[var(--hover)] text-[var(--muted)]'
                      }`}
                    >
                      {tool.connected ? 'conectado' : 'não conectado'}
                    </span>
                  </div>
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
            <Button variant="accent" onClick={() => persist()}>
              Salvar ferramentas
            </Button>
          </div>
        )}

        {activeTab === 'teste' && (
          <PlatformCard className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Envie uma mensagem real para testar a IA configurada no servidor.
            </p>
            <div className="flex gap-2">
              <input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Digite uma mensagem de teste…"
                className="premium-input flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runTest();
                }}
              />
              <Button variant="accent" onClick={() => void runTest()} disabled={testBusy}>
                {testBusy ? 'Enviando…' : 'Enviar'}
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
