import { BlingConnectionStatus } from '@prisma/client';
import { formatPeraStockResponse } from './blingStockUx';

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

Quando houver vários códigos, organize a resposta separada por código, com uma seção por loja.

Use linguagem operacional e amigável. Não use tabelas markdown, JSON ou cabeçalhos técnicos da integração.

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

const BARCODE_TOKEN = /^\d{8,14}$/;

export function extractBarcodesFromText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];

  const pushBarcode = (candidate: string): void => {
    const code = candidate.trim();
    if (!BARCODE_TOKEN.test(code) || seen.has(code)) return;
    seen.add(code);
    ordered.push(code);
  };

  for (const part of normalized.split(/[\s;]+/)) {
    const token = part.trim();
    if (!token) continue;

    if (BARCODE_TOKEN.test(token)) {
      pushBarcode(token);
      continue;
    }

    for (const match of token.match(/\d{8,14}/g) ?? []) {
      pushBarcode(match);
    }
  }

  return ordered;
}

export function dedupeBarcodesPreserveOrder(barcodes: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of barcodes) {
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
  }
  return ordered;
}

export function assertBarcodeResultsOrder(input: {
  requestedBarcodes: string[];
  results: Array<{ barcode: string }>;
}): void {
  if (input.results.length !== input.requestedBarcodes.length) {
    throw new Error(
      `Barcode result count mismatch: expected ${input.requestedBarcodes.length}, got ${input.results.length}`,
    );
  }
  for (let i = 0; i < input.requestedBarcodes.length; i++) {
    const expected = input.requestedBarcodes[i]!;
    const actual = input.results[i]!.barcode;
    if (actual !== expected) {
      throw new Error(`Barcode mismatch at index ${i}: expected ${expected}, got ${actual}`);
    }
  }
}

export function formatStockResponse(data: BlingMultiStoreStockResponse): string {
  return formatPeraStockResponse(data);
}
