'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const STATUS_TONE: Record<ProposalStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  SENT: 'accent',
  APPROVED: 'success',
  LOST: 'danger',
};

const STATUS_ORDER: ProposalStatus[] = ['DRAFT', 'SENT', 'APPROVED', 'LOST'];

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function PropostasPage(): React.ReactElement {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<ProposalStatus | 'ALL'>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = filterStatus !== 'ALL' ? `?status=${filterStatus}` : '';
      const res = await api<{ items: Proposal[] }>(`/api/proposals${query}`);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return {
      draft: items.filter((item) => item.status === 'DRAFT').length,
      sent: items.filter((item) => item.status === 'SENT').length,
      approved: items.filter((item) => item.status === 'APPROVED').length,
      lost: items.filter((item) => item.status === 'LOST').length,
    };
  }, [items]);

  const grouped = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      items: items.filter((item) => item.status === status),
    })).filter((group) => filterStatus === 'ALL' || group.status === filterStatus);
  }, [filterStatus, items]);

  async function updateStatus(id: string, status: ProposalStatus): Promise<void> {
    setFeedback(null);
    try {
      await api(`/api/proposals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setFeedback(`Proposta movida para ${STATUS_LABEL[status].toLowerCase()}.`);
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao atualizar proposta.');
    }
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div className="eyebrow">Comercial</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--moble-black)]">Propostas</h1>
          <p className="mt-2 text-sm text-[var(--moble-muted)]">
            Acompanhe rascunhos, propostas enviadas, aprovações e perdas comerciais da Möble.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Rascunhos</div>
            <div className="mt-2 text-3xl font-bold text-[var(--moble-black)]">{totals.draft}</div>
          </Card>
          <Card>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Enviadas</div>
            <div className="mt-2 text-3xl font-bold text-[var(--moble-black)]">{totals.sent}</div>
          </Card>
          <Card>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Aprovadas</div>
            <div className="mt-2 text-3xl font-bold text-[var(--moble-success)]">{totals.approved}</div>
          </Card>
          <Card>
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Perdidas</div>
            <div className="mt-2 text-3xl font-bold text-[var(--moble-danger)]">{totals.lost}</div>
          </Card>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <SelectField
            label="Filtrar status"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value as ProposalStatus | 'ALL')}
            className="max-w-xs"
          >
            <option value="ALL">Todos</option>
            <option value="DRAFT">Rascunho</option>
            <option value="SENT">Enviada</option>
            <option value="APPROVED">Aprovada</option>
            <option value="LOST">Perdida</option>
          </SelectField>
          {feedback && (
            <p className="rounded-2xl border border-[var(--moble-border)] bg-white px-4 py-3 text-xs text-[var(--moble-muted)]">
              {feedback}
            </p>
          )}
        </div>

        {loading && <div className="h-72 rounded-2xl skeleton" />}
        {!loading && items.length === 0 && (
          <EmptyState
            title="Nenhuma proposta ainda"
            description="Gere uma proposta pelo chat comercial e salve como rascunho."
          />
        )}

        {!loading && items.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-4">
            {grouped.map((group) => (
              <section key={group.status} className="rounded-[22px] border border-[var(--moble-border)] bg-white/72 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-[var(--moble-black)]">{STATUS_LABEL[group.status]}</h2>
                    <p className="mt-1 text-xs text-[var(--moble-muted)]">{group.items.length} proposta(s)</p>
                  </div>
                  <Badge tone={STATUS_TONE[group.status]}>{group.status}</Badge>
                </div>
                <div className="space-y-3">
                  {group.items.map((proposal) => (
                    <article key={proposal.id} className="rounded-2xl border border-[var(--moble-border)] bg-white p-4 shadow-[0_4px_18px_rgba(14,14,14,0.035)]">
                      <div className="font-semibold leading-5 text-[var(--moble-black)]">{proposal.title}</div>
                      <p className="mt-2 line-clamp-4 text-xs leading-5 text-[var(--moble-muted)]">
                        {proposal.summary ?? proposal.content}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={STATUS_TONE[proposal.status]}>{STATUS_LABEL[proposal.status]}</Badge>
                        <Badge>{formatCurrency(proposal.valueEstimate)}</Badge>
                      </div>
                      <div className="mt-3 text-[11px] text-[var(--moble-muted)]">
                        Atualizada em {new Date(proposal.updatedAt).toLocaleString('pt-BR')}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link
                          href={`/propostas/${proposal.id}`}
                          className="premium-button premium-button-accent justify-center px-2 py-2 text-center text-[11px]"
                        >
                          Detalhes
                        </Link>
                        {STATUS_ORDER.filter((status) => status !== proposal.status).map((status) => (
                          <Button
                            key={status}
                            variant={status === 'APPROVED' ? 'accent' : 'ghost'}
                            className="justify-center px-2 py-2 text-[11px]"
                            onClick={() => void updateStatus(proposal.id, status)}
                          >
                            {STATUS_LABEL[status]}
                          </Button>
                        ))}
                      </div>
                    </article>
                  ))}
                  {group.items.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[var(--moble-border)] p-4 text-center text-xs leading-5 text-[var(--moble-muted)]">
                      Nada aqui por enquanto.
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
