'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { MetricCard } from '@/components/MetricCard';
import { api } from '@/lib/api';

type FinanceItem = {
  id: string;
  titulo: string;
  pessoa: string | null;
  valor: number | null;
  situacao: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  dataPagamentoRecebimento: string | null;
};

type FinanceListResponse = {
  items: FinanceItem[];
  total: number;
  sourcePath?: string;
};

type OlistStatus = {
  configured: boolean;
  connected: boolean;
  authMethod: 'api_token' | 'oauth' | null;
};

type OperatorOverview = {
  financeToday: {
    entrada: number;
    saida: number;
    saldo: number;
  };
  operationalSummary?: {
    contas_a_pagar: number;
  };
};

type FinanceKind = 'receivable' | 'payable' | 'quotes';
type WriteKind = 'receivable' | 'payable';

type FinanceWriteForm = {
  descricao: string;
  contatoId: string;
  valor: string;
  dataVencimento: string;
  observacao: string;
};

const KIND_LABEL: Record<FinanceKind, string> = {
  receivable: 'Contas a receber',
  payable: 'Contas a pagar',
  quotes: 'Orçamentos',
};

const EMPTY_WRITE_FORM: FinanceWriteForm = {
  descricao: '',
  contatoId: '',
  valor: '',
  dataVencimento: '',
  observacao: '',
};

function formatCurrency(value: number | null): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return 'sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function sumValues(items: FinanceItem[]): number {
  return items.reduce((total, item) => total + (item.valor ?? 0), 0);
}

function isOverdue(item: FinanceItem): boolean {
  if (!item.dataVencimento || item.dataPagamentoRecebimento) return false;
  const due = new Date(item.dataVencimento);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function ItemList({ items, tone }: { items: FinanceItem[]; tone: 'success' | 'danger' | 'accent' }): React.ReactElement {
  if (items.length === 0) {
    return <EmptyState title="Sem dados carregados" description="Use os botões acima para consultar a Olist." />;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((item) => (
        <article key={item.id} className="rounded-2xl border border-[var(--moble-border)] bg-white p-4 shadow-[0_4px_18px_rgba(14,14,14,0.035)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold leading-5 text-[var(--moble-black)]">{item.titulo}</div>
              <div className="mt-1 text-xs text-[var(--moble-muted)]">{item.pessoa ?? 'Sem pessoa vinculada'}</div>
            </div>
            <Badge tone={isOverdue(item) ? 'danger' : tone}>{item.situacao ?? 'sem status'}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--moble-bg)]/70 p-3">
              <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Valor</div>
              <div className="mt-1 text-base font-bold text-[var(--moble-black)]">{formatCurrency(item.valor)}</div>
            </div>
            <div className="rounded-xl bg-[var(--moble-bg)]/70 p-3">
              <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Vencimento</div>
              <div className="mt-1 text-base font-bold text-[var(--moble-black)]">{formatDate(item.dataVencimento)}</div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function FinanceiroPage(): React.ReactElement {
  const [olistStatus, setOlistStatus] = useState<OlistStatus | null>(null);
  const [overview, setOverview] = useState<OperatorOverview | null>(null);
  const [search, setSearch] = useState('');
  const [busyKind, setBusyKind] = useState<FinanceKind | null>(null);
  const [activeKind, setActiveKind] = useState<FinanceKind>('receivable');
  const [receivableItems, setReceivableItems] = useState<FinanceItem[]>([]);
  const [payableItems, setPayableItems] = useState<FinanceItem[]>([]);
  const [quoteItems, setQuoteItems] = useState<FinanceItem[]>([]);
  const [sources, setSources] = useState<Record<FinanceKind, string | null>>({
    receivable: null,
    payable: null,
    quotes: null,
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [writeBusyKind, setWriteBusyKind] = useState<WriteKind | null>(null);
  const [payableForm, setPayableForm] = useState<FinanceWriteForm>(EMPTY_WRITE_FORM);
  const [receivableForm, setReceivableForm] = useState<FinanceWriteForm>(EMPTY_WRITE_FORM);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, overviewRes] = await Promise.all([
        api<OlistStatus>('/api/integrations/olist/status'),
        api<OperatorOverview>('/api/operator/overview'),
      ]);
      setOlistStatus(statusRes);
      setOverview(overviewRes);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao carregar status financeiro.');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const allLoadedItems = useMemo(
    () => [...receivableItems, ...payableItems, ...quoteItems],
    [payableItems, quoteItems, receivableItems],
  );

  const overdueItems = useMemo(
    () => [...receivableItems, ...payableItems].filter((item) => isOverdue(item)),
    [payableItems, receivableItems],
  );

  const projectedBalance = useMemo(
    () => sumValues(receivableItems) - sumValues(payableItems),
    [payableItems, receivableItems],
  );

  async function loadFinance(kind: FinanceKind): Promise<void> {
    setBusyKind(kind);
    setActiveKind(kind);
    setFeedback(null);
    try {
      const path =
        kind === 'receivable'
          ? '/api/integrations/olist/contas-receber'
          : kind === 'payable'
            ? '/api/integrations/olist/contas-pagar'
            : '/api/integrations/olist/orcamentos';
      const query = new URLSearchParams({ limit: '30', page: '1' });
      if (search.trim()) query.set('search', search.trim());
      const res = await api<FinanceListResponse>(`${path}?${query.toString()}`);

      if (kind === 'receivable') setReceivableItems(res.items);
      if (kind === 'payable') setPayableItems(res.items);
      if (kind === 'quotes') setQuoteItems(res.items);
      setSources((prev) => ({ ...prev, [kind]: res.sourcePath ?? null }));
      setFeedback(`${res.items.length} item(ns) carregados em ${KIND_LABEL[kind].toLowerCase()}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : `Falha ao carregar ${KIND_LABEL[kind].toLowerCase()}.`);
    } finally {
      setBusyKind(null);
    }
  }

  function updateWriteForm(kind: WriteKind, patch: Partial<FinanceWriteForm>): void {
    if (kind === 'payable') {
      setPayableForm((prev) => ({ ...prev, ...patch }));
      return;
    }
    setReceivableForm((prev) => ({ ...prev, ...patch }));
  }

  async function createFinanceEntry(kind: WriteKind): Promise<void> {
    const form = kind === 'payable' ? payableForm : receivableForm;
    const valor = Number(form.valor.replace(',', '.'));
    if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !form.dataVencimento) {
      setFeedback('Informe descrição, valor maior que zero e vencimento.');
      return;
    }

    setWriteBusyKind(kind);
    setFeedback(null);
    try {
      const path = kind === 'payable' ? '/api/integrations/olist/contas-pagar' : '/api/integrations/olist/contas-receber';
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          descricao: form.descricao.trim(),
          valor,
          dataVencimento: form.dataVencimento,
          ...(form.contatoId.trim() ? { contatoId: form.contatoId.trim() } : {}),
          ...(form.observacao.trim() ? { observacao: form.observacao.trim() } : {}),
        }),
      });
      if (kind === 'payable') {
        setPayableForm(EMPTY_WRITE_FORM);
        await loadFinance('payable');
      } else {
        setReceivableForm(EMPTY_WRITE_FORM);
        await loadFinance('receivable');
      }
      setFeedback(kind === 'payable' ? 'Conta a pagar criada na Olist.' : 'Conta a receber criada na Olist.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao criar lançamento financeiro.');
    } finally {
      setWriteBusyKind(null);
    }
  }

  const activeItems = activeKind === 'receivable' ? receivableItems : activeKind === 'payable' ? payableItems : quoteItems;
  const activeTone = activeKind === 'receivable' ? 'success' : activeKind === 'payable' ? 'danger' : 'accent';

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div className="eyebrow">Financeiro</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--moble-black)]">Fluxo financeiro</h1>
          <p className="mt-2 text-sm text-[var(--moble-muted)]">
            Contas, orçamentos e alertas financeiros da operação Möble conectados à Olist.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Previsto a receber" value={formatCurrency(sumValues(receivableItems) || overview?.financeToday.entrada || 0)} hint="Contas carregadas da Olist" tone="success" />
          <MetricCard label="Previsto a pagar" value={formatCurrency(sumValues(payableItems) || overview?.financeToday.saida || 0)} hint={`${overview?.operationalSummary?.contas_a_pagar ?? payableItems.length} conta(s) monitoradas`} tone="danger" />
          <MetricCard label="Saldo projetado" value={formatCurrency(allLoadedItems.length > 0 ? projectedBalance : overview?.financeToday.saldo ?? 0)} hint="Receber menos pagar" tone={(allLoadedItems.length > 0 ? projectedBalance : overview?.financeToday.saldo ?? 0) >= 0 ? 'success' : 'danger'} />
          <MetricCard label="Pendências críticas" value={overdueItems.length} hint="Vencimentos em atraso" tone={overdueItems.length > 0 ? 'warning' : 'neutral'} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-5">
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Olist</div>
                <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Consulta financeira</h2>
              </div>
              <Badge tone={olistStatus?.connected ? 'success' : 'warning'}>
                {olistStatus?.connected ? 'conectada' : 'desconectada'}
              </Badge>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[var(--moble-muted)]">Buscar por título ou pessoa</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="premium-input"
                placeholder="Ex.: cliente, fornecedor, orçamento..."
              />
            </label>
            <div className="mt-4 grid gap-2">
              {(['receivable', 'payable', 'quotes'] as const).map((kind) => (
                <Button
                  key={kind}
                  variant={activeKind === kind ? 'accent' : 'ghost'}
                  disabled={busyKind !== null || !olistStatus?.connected}
                  className="justify-center"
                  onClick={() => void loadFinance(kind)}
                >
                  {busyKind === kind ? 'Carregando...' : KIND_LABEL[kind]}
                </Button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3 text-xs leading-5 text-[var(--moble-muted)]">
              <div>Receber: {sources.receivable ?? '-'}</div>
              <div>Pagar: {sources.payable ?? '-'}</div>
              <div>Orçamentos: {sources.quotes ?? '-'}</div>
            </div>
            {feedback && (
              <p className="mt-4 rounded-2xl border border-[var(--moble-border)] bg-white p-3 text-xs leading-5 text-[var(--moble-muted)]">
                {feedback}
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-4">
              <div className="eyebrow">Criar lançamento</div>
              <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Ações financeiras</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--moble-muted)]">
                Lance contas diretamente na Olist. Use o ID do contato quando souber; se deixar vazio, o sistema tenta localizar pelo texto da descrição.
              </p>
            </div>
            <div className="grid gap-4">
              {(['receivable', 'payable'] as const).map((kind) => {
                const form = kind === 'payable' ? payableForm : receivableForm;
                const tone = kind === 'payable' ? 'danger' : 'success';
                return (
                  <div key={kind} className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/60 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-bold text-[var(--moble-black)]">
                        {kind === 'payable' ? 'Conta a pagar' : 'Conta a receber'}
                      </div>
                      <Badge tone={tone}>{kind === 'payable' ? 'saída' : 'entrada'}</Badge>
                    </div>
                    <div className="grid gap-3">
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-[var(--moble-muted)]">
                          {kind === 'payable' ? 'Fornecedor / descrição' : 'Cliente / descrição'}
                        </span>
                        <input
                          value={form.descricao}
                          onChange={(event) => updateWriteForm(kind, { descricao: event.target.value })}
                          className="premium-input"
                          placeholder={kind === 'payable' ? 'Ex.: fornecedor Mariana, material MDF' : 'Ex.: cliente João, parcela cozinha'}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block space-y-1.5 text-sm">
                          <span className="text-[var(--moble-muted)]">Valor</span>
                          <input
                            value={form.valor}
                            onChange={(event) => updateWriteForm(kind, { valor: event.target.value })}
                            className="premium-input"
                            inputMode="decimal"
                            placeholder="0,00"
                          />
                        </label>
                        <label className="block space-y-1.5 text-sm">
                          <span className="text-[var(--moble-muted)]">Vencimento</span>
                          <input
                            type="date"
                            value={form.dataVencimento}
                            onChange={(event) => updateWriteForm(kind, { dataVencimento: event.target.value })}
                            className="premium-input"
                          />
                        </label>
                        <label className="block space-y-1.5 text-sm">
                          <span className="text-[var(--moble-muted)]">Contato ID</span>
                          <input
                            value={form.contatoId}
                            onChange={(event) => updateWriteForm(kind, { contatoId: event.target.value })}
                            className="premium-input"
                            placeholder="opcional"
                          />
                        </label>
                      </div>
                      <label className="block space-y-1.5 text-sm">
                        <span className="text-[var(--moble-muted)]">Observação</span>
                        <input
                          value={form.observacao}
                          onChange={(event) => updateWriteForm(kind, { observacao: event.target.value })}
                          className="premium-input"
                          placeholder="nº documento, origem ou detalhe"
                        />
                      </label>
                      <Button
                        type="button"
                        variant={kind === 'payable' ? 'ghost' : 'accent'}
                        disabled={writeBusyKind !== null || !olistStatus?.connected}
                        className="justify-center"
                        onClick={() => void createFinanceEntry(kind)}
                      >
                        {writeBusyKind === kind
                          ? 'Criando...'
                          : kind === 'payable'
                            ? 'Criar conta a pagar'
                            : 'Criar conta a receber'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">{KIND_LABEL[activeKind]}</div>
                  <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Itens carregados</h2>
                </div>
                <Badge tone={activeTone}>{activeItems.length} item(ns)</Badge>
              </div>
              <ItemList items={activeItems} tone={activeTone} />
            </Card>

            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">Alertas</div>
                  <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Pendências críticas</h2>
                </div>
                <Badge tone={overdueItems.length > 0 ? 'danger' : 'success'}>
                  {overdueItems.length > 0 ? 'atenção' : 'em dia'}
                </Badge>
              </div>
              {overdueItems.length === 0 ? (
                <p className="text-sm leading-6 text-[var(--moble-muted)]">
                  Nenhuma pendência vencida entre os itens carregados. Carregue contas a pagar e receber para ampliar a análise.
                </p>
              ) : (
                <ItemList items={overdueItems} tone="danger" />
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
