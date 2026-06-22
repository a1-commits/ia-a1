'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { SelectField } from '@/components/SelectField';
import { api } from '@/lib/api';
import type { Proposal, ProposalStatus } from '@/types/models';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  APPROVED: 'Aprovada',
  LOST: 'Perdida',
};

const STATUS_TONE: Record<ProposalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SENT: 'accent',
  APPROVED: 'success',
  LOST: 'danger',
};

type ProposalPatchResponse = Proposal & {
  followUpTaskId?: string | null;
};

function parseCurrencyInput(value: string): number | null {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatCurrencyInput(value: number | null): string {
  if (value == null) return '';
  return String(value).replace('.', ',');
}

export default function ProposalDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<ProposalStatus>('DRAFT');
  const [valueEstimate, setValueEstimate] = useState('');

  const hydrateForm = useCallback((item: Proposal) => {
    setProposal(item);
    setTitle(item.title);
    setContent(item.content);
    setSummary(item.summary ?? '');
    setStatus(item.status);
    setValueEstimate(formatCurrencyInput(item.valueEstimate));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const item = await api<Proposal>(`/api/proposals/${id}`);
      hydrateForm(item);
      setFeedback(null);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao carregar proposta.');
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!id) return;
    const parsedValue = parseCurrencyInput(valueEstimate);
    if (valueEstimate.trim() && parsedValue == null) {
      setFeedback('Valor estimado inválido.');
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const updated = await api<ProposalPatchResponse>(`/api/proposals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content,
          summary: summary || undefined,
          status,
          valueEstimate: parsedValue,
        }),
      });
      hydrateForm(updated);
      setFeedback(
        updated.followUpTaskId
          ? 'Proposta salva e follow-up criado em tarefas.'
          : 'Proposta salva com sucesso.',
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao salvar proposta.');
    } finally {
      setSaving(false);
    }
  }

  async function copyProposal(): Promise<void> {
    if (!proposal) return;
    await navigator.clipboard?.writeText(content);
    setFeedback('Texto da proposta copiado.');
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="page-container">
          <div className="h-72 rounded-2xl skeleton" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="page-shell">
        <div className="page-container">
          <EmptyState title="Proposta não encontrada" description="Volte para a lista e selecione outra proposta." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div className="eyebrow">Comercial</div>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--moble-black)]">Detalhe da proposta</h1>
              <p className="mt-2 text-sm text-[var(--moble-muted)]">
                Edite o rascunho, copie o texto e acompanhe o status comercial.
              </p>
            </div>
            <Badge tone={STATUS_TONE[proposal.status]}>{STATUS_LABEL[proposal.status]}</Badge>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[1fr_0.42fr]">
          <Card>
            <div className="grid gap-4">
              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--moble-muted)]">Título</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="premium-input" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--moble-muted)]">Resumo</span>
                <input
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="premium-input"
                  placeholder="Resumo interno da proposta"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--moble-muted)]">Texto da proposta</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={14}
                  className="premium-input font-mono text-xs leading-6"
                />
              </label>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <div className="eyebrow">Status</div>
              <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Controle comercial</h2>
              <div className="mt-4 grid gap-3">
                <SelectField
                  label="Status da proposta"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ProposalStatus)}
                >
                  <option value="DRAFT">Rascunho</option>
                  <option value="SENT">Enviada</option>
                  <option value="APPROVED">Aprovada</option>
                  <option value="LOST">Perdida</option>
                </SelectField>

                <label className="block space-y-1.5 text-sm">
                  <span className="text-[var(--moble-muted)]">Valor estimado</span>
                  <input
                    value={valueEstimate}
                    onChange={(event) => setValueEstimate(event.target.value)}
                    className="premium-input"
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </label>

                <Button variant="accent" disabled={saving} className="justify-center" onClick={() => void save()}>
                  {saving ? 'Salvando...' : 'Salvar proposta'}
                </Button>
                <Button variant="ghost" className="justify-center" onClick={() => void copyProposal()}>
                  Copiar texto
                </Button>
                {proposal.conversationId && (
                  <Link href="/chat" className="premium-button premium-button-ghost justify-center text-center">
                    Abrir chat
                  </Link>
                )}
              </div>
              {feedback && (
                <p className="mt-4 rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3 text-xs leading-5 text-[var(--moble-muted)]">
                  {feedback}
                </p>
              )}
            </Card>

            <Card>
              <div className="eyebrow">Histórico</div>
              <div className="mt-3 space-y-2 text-sm text-[var(--moble-muted)]">
                <p>Criada em {new Date(proposal.createdAt).toLocaleString('pt-BR')}</p>
                <p>Atualizada em {new Date(proposal.updatedAt).toLocaleString('pt-BR')}</p>
                <p>Conversa vinculada: {proposal.conversation?.title ?? proposal.conversationId ?? 'sem vínculo'}</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
