import { BlingConnectionStatus } from '@prisma/client';

export type StockSituation =
  | 'OK'
  | 'ABAIXO_DO_MINIMO'
  | 'SEM_ESTOQUE'
  | 'NAO_ENCONTRADO'
  | 'ERRO_CONSULTA';

export type BlingStockStoreResult = {
  connectionId: string;
  storeLabel: string;
  found: boolean;
  productName: string | null;
  internalCode: string | null;
  barcode: string;
  currentStock: number | null;
  minimumStock: number | null;
  situation: StockSituation;
  error: string | null;
};

export type BlingStockByBarcodeResult = {
  barcode: string;
  stores: BlingStockStoreResult[];
  totalCurrentStock: number;
};

export type BlingMultiStoreStockResponse = {
  agentId: string;
  barcodes: string[];
  stores: Array<{
    connectionId: string;
    storeLabel: string;
    status: BlingConnectionStatus;
  }>;
  results: BlingStockByBarcodeResult[];
};

export const PERA_DEFAULT_INSTRUCTIONS = `Você é o PERA.

Sua função é consultar estoque no Bling usando código de barras.

Sempre que o usuário informar um ou mais códigos de barras, use a ferramenta consultar_estoque_bling_multi_lojas.

Você deve consultar todas as lojas Bling conectadas ao agente.

Para cada código e para cada loja, mostre:
- Nome da loja
- Nome do produto
- Código interno
- Código de barras
- Estoque atual
- Estoque mínimo
- Situação do estoque

Situações possíveis:
- OK
- ABAIXO DO MÍNIMO
- SEM ESTOQUE
- NÃO ENCONTRADO
- ERRO NA CONSULTA

Quando houver vários códigos, organize a resposta em tabela ou lista separada por código.

Nunca invente informações.
Nunca responda sem consultar a ferramenta.
Nunca altere dados no Bling.
Nunca crie, edite ou exclua produtos.
Se nenhuma loja estiver conectada, informe que não há contas Bling conectadas ao agente.`;

export const BLING_TOOL_NAME = 'consultar_estoque_bling_multi_lojas';

export function computeStockSituation(
  found: boolean,
  currentStock: number | null,
  minimumStock: number | null,
  hadError: boolean,
): StockSituation {
  if (hadError) return 'ERRO_CONSULTA';
  if (!found) return 'NAO_ENCONTRADO';
  const current = currentStock ?? 0;
  const minimum = minimumStock ?? 0;
  if (current <= 0) return 'SEM_ESTOQUE';
  if (minimum > 0 && current < minimum) return 'ABAIXO_DO_MINIMO';
  return 'OK';
}

export function extractBarcodesFromText(text: string): string[] {
  const matches = text.match(/\b\d{8,14}\b/g) ?? [];
  return Array.from(new Set(matches));
}

export function formatStockResponse(data: BlingMultiStoreStockResponse): string {
  if (data.stores.length === 0) {
    return 'Não há contas Bling conectadas a este agente. Configure as lojas em Integrações Bling.';
  }

  const lines: string[] = ['Consulta de estoque Bling (multi-lojas)', ''];

  for (const result of data.results) {
    lines.push(`Código de barras: ${result.barcode}`);
    lines.push('| Loja | Produto | Cód. interno | Estoque | Mínimo | Situação |');
    lines.push('| --- | --- | --- | ---: | ---: | --- |');
    for (const store of result.stores) {
      const situationLabel =
        store.situation === 'ABAIXO_DO_MINIMO'
          ? 'ABAIXO DO MÍNIMO'
          : store.situation === 'NAO_ENCONTRADO'
            ? 'NÃO ENCONTRADO'
            : store.situation === 'ERRO_CONSULTA'
              ? 'ERRO NA CONSULTA'
              : store.situation === 'SEM_ESTOQUE'
                ? 'SEM ESTOQUE'
                : 'OK';
      lines.push(
        `| ${store.storeLabel} | ${store.productName ?? '—'} | ${store.internalCode ?? '—'} | ${store.currentStock ?? '—'} | ${store.minimumStock ?? '—'} | ${situationLabel}${store.error ? ` (${store.error})` : ''} |`,
      );
    }
    lines.push(`Total estoque (lojas com produto): ${result.totalCurrentStock}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}
