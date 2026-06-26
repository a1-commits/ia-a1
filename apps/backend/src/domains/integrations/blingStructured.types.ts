import type { AgentIntent } from '../chat/intentRouter.service';

export type BlingStoreStockRow = {
  loja: string;
  quantidade: number | null;
  minimo: number | null;
  situacao: string;
  preco: number | null;
  codigoInterno: string | null;
};

export type BlingProductOptionRow = {
  nome: string;
  sku: string | null;
  gtin: string | null;
};

export type BlingApiErrorKind = 'unavailable' | 'auth' | 'timeout' | 'generic';

export type BlingStructuredResult =
  | {
      kind: 'stock';
      intent: AgentIntent;
      produto: string;
      codigoBarras: string | null;
      estoques: BlingStoreStockRow[];
      downloadUrl?: string | null;
    }
  | {
      kind: 'multiple_products';
      intent: AgentIntent;
      produtos: BlingProductOptionRow[];
    }
  | {
      kind: 'empty';
      intent: AgentIntent;
      query: string | null;
    }
  | {
      kind: 'below_minimum';
      intent: AgentIntent;
      produto: string | null;
      itens: Array<BlingStoreStockRow & { produto: string; codigoBarras: string | null }>;
    }
  | {
      kind: 'not_configured';
      intent: AgentIntent;
      reason: string;
    }
  | {
      kind: 'api_error';
      intent: AgentIntent;
      errorKind: BlingApiErrorKind;
      query: string | null;
    };
