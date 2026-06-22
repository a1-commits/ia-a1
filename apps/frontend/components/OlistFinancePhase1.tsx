type OlistFinanceItem = {
  id: string;
  titulo: string;
  pessoa: string | null;
  valor: number | null;
  situacao: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  dataPagamentoRecebimento: string | null;
};

type Props = {
  busy: boolean;
  connected: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onLoadReceivable: () => void;
  onLoadPayable: () => void;
  onLoadQuotes: () => void;
  sources: {
    receivable: string | null;
    payable: string | null;
    quotes: string | null;
  };
  receivableItems: OlistFinanceItem[];
  payableItems: OlistFinanceItem[];
  quoteItems: OlistFinanceItem[];
};

function RenderList(input: { items: OlistFinanceItem[]; prefix: string }): React.ReactElement {
  const { items, prefix } = input;
  return (
    <div className="max-h-44 space-y-1 overflow-auto text-[11px] text-zinc-700">
      {items.slice(0, 10).map((item) => (
        <div key={`${prefix}-${item.id}`} className="rounded border border-black/10 px-1.5 py-1">
          <div className="font-medium">{item.titulo}</div>
          <div>
            {item.pessoa ?? 'Sem pessoa'} | {item.valor ?? '-'} | {item.situacao ?? '-'}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-zinc-500">Sem dados carregados.</p>}
    </div>
  );
}

export function OlistFinancePhase1(props: Props): React.ReactElement {
  return (
    <div className="mb-3 rounded-xl border border-black/10 bg-zinc-50 p-3">
      <h3 className="mb-2 text-xs font-medium text-zinc-700">Leitura financeira (Fase 1)</h3>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Buscar por título/pessoa (opcional)"
          className="w-64 rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
        />
        <button
          type="button"
          onClick={props.onLoadReceivable}
          disabled={props.busy || !props.connected}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
        >
          Contas a receber
        </button>
        <button
          type="button"
          onClick={props.onLoadPayable}
          disabled={props.busy || !props.connected}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
        >
          Contas a pagar
        </button>
        <button
          type="button"
          onClick={props.onLoadQuotes}
          disabled={props.busy || !props.connected}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
        >
          Orcamentos
        </button>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">
        Origem detectada: receber <strong>{props.sources.receivable ?? '-'}</strong> | pagar{' '}
        <strong>{props.sources.payable ?? '-'}</strong> | orcamentos <strong>{props.sources.quotes ?? '-'}</strong>
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 bg-white p-2">
          <p className="mb-1 text-[11px] font-medium text-zinc-700">Receber ({props.receivableItems.length})</p>
          <RenderList items={props.receivableItems} prefix="r" />
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-2">
          <p className="mb-1 text-[11px] font-medium text-zinc-700">Pagar ({props.payableItems.length})</p>
          <RenderList items={props.payableItems} prefix="p" />
        </div>
        <div className="rounded-lg border border-black/10 bg-white p-2">
          <p className="mb-1 text-[11px] font-medium text-zinc-700">Orcamentos ({props.quoteItems.length})</p>
          <RenderList items={props.quoteItems} prefix="o" />
        </div>
      </div>
    </div>
  );
}
