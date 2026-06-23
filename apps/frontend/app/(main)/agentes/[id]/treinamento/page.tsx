'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import {
  buildFinalPrompt,
  DEFAULT_TRAINING_DRAFT,
  MOCK_AGENTS,
  type AgentTrainingDraft,
} from '@/lib/mock/platform';

function Field({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="premium-input min-h-[88px] resize-y"
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="premium-input" />
      )}
    </label>
  );
}

export default function AgentTrainingPage(): React.ReactElement {
  const params = useParams();
  const agentId = typeof params.id === 'string' ? params.id : 'novo';
  const isNew = agentId === 'novo';

  const existing = MOCK_AGENTS.find((a) => a.id === agentId);

  const [draft, setDraft] = useState<AgentTrainingDraft>(DEFAULT_TRAINING_DRAFT);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setDraft({
        ...DEFAULT_TRAINING_DRAFT,
        name: existing.name,
        objective: existing.description,
        finalPrompt: buildFinalPrompt({ ...DEFAULT_TRAINING_DRAFT, name: existing.name, objective: existing.description }),
      });
    }
  }, [existing]);

  useEffect(() => {
    setDraft((prev) => ({ ...prev, finalPrompt: buildFinalPrompt(prev) }));
  }, [draft.name, draft.objective, draft.personality, draft.requiredRules, draft.neverDo]);

  function saveTraining(): void {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="page-shell">
      <div className="page-container max-w-3xl">
        <PageHeader
          eyebrow="Treinamento"
          title={isNew ? 'Novo agente' : `Treinar ${existing?.name ?? 'agente'}`}
          description="Configure personalidade, regras e exemplos. Dados mock — persistência em breve."
          actions={
            <Link href="/agentes">
              <Button variant="ghost" className="text-xs">
                Voltar
              </Button>
            </Link>
          }
        />

        {saved && (
          <div className="mb-4 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            Treinamento salvo (mock).
          </div>
        )}

        <PlatformCard className="space-y-5">
          <Field label="Nome do agente" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} rows={1} />
          <Field label="Objetivo" value={draft.objective} onChange={(v) => setDraft({ ...draft, objective: v })} />
          <Field
            label="Personalidade"
            value={draft.personality}
            onChange={(v) => setDraft({ ...draft, personality: v })}
          />
          <Field
            label="Regras obrigatórias"
            value={draft.requiredRules}
            onChange={(v) => setDraft({ ...draft, requiredRules: v })}
          />
          <Field label="O que nunca fazer" value={draft.neverDo} onChange={(v) => setDraft({ ...draft, neverDo: v })} />
          <Field
            label="Exemplos de perguntas"
            value={draft.exampleQuestions}
            onChange={(v) => setDraft({ ...draft, exampleQuestions: v })}
            rows={4}
          />
          <Field
            label="Exemplos de respostas"
            value={draft.exampleAnswers}
            onChange={(v) => setDraft({ ...draft, exampleAnswers: v })}
            rows={4}
          />
          <Field
            label="Prompt final"
            value={draft.finalPrompt}
            onChange={(v) => setDraft({ ...draft, finalPrompt: v })}
            rows={6}
          />
          <Button variant="accent" onClick={saveTraining} className="w-full justify-center sm:w-auto">
            Salvar treinamento
          </Button>
        </PlatformCard>
      </div>
    </div>
  );
}
