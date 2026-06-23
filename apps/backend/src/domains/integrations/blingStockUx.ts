import type { BlingStockByBarcodeResult, BlingMultiStoreStockResponse, BlingStockStoreResult } from './bling.types';

function sortStoresByLabel(stores: BlingStockStoreResult[]): BlingStockStoreResult[] {
  return [...stores].sort((a, b) => a.storeLabel.localeCompare(b.storeLabel, 'pt-BR'));
}

function asInteger(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.trunc(value);
}

function storeHasProduct(store: BlingStockStoreResult): boolean {
  return store.found && store.situation !== 'ERRO_CONSULTA';
}

function formatStoreBlock(store: BlingStockStoreResult): string[] {
  const lines = [store.storeLabel];

  if (store.situation === 'ERRO_CONSULTA') {
    lines.push(store.error ? `Erro na consulta: ${store.error}` : 'Erro na consulta');
    return lines;
  }

  if (!store.found) {
    lines.push('Produto não encontrado');
    return lines;
  }

  lines.push(`Produto: ${store.productName ?? '—'}`);
  lines.push(`Estoque: ${asInteger(store.currentStock)}`);
  lines.push(`Estoque mínimo: ${asInteger(store.minimumStock)}`);
  return lines;
}

function formatNotFoundAnywhere(result: BlingStockByBarcodeResult, multi: boolean): string {
  const stores = sortStoresByLabel(result.stores);
  const body = [
    '❌ Produto não encontrado em nenhuma loja conectada.',
    '',
    'Lojas consultadas:',
    ...stores.map((store) => `• ${store.storeLabel}`),
  ];

  if (multi) {
    return [`=== Código ${result.barcode} ===`, '', ...body].join('\n');
  }

  return [`Código: ${result.barcode}`, '', ...body].join('\n');
}

function formatFoundBarcodeResult(result: BlingStockByBarcodeResult, multi: boolean): string {
  const stores = sortStoresByLabel(result.stores);
  const lines: string[] = [];

  if (multi) {
    lines.push(`=== Código ${result.barcode} ===`, '');
  } else {
    lines.push(`Código: ${result.barcode}`, '');
  }

  for (const store of stores) {
    lines.push(...formatStoreBlock(store), '');
  }

  lines.push(`Total disponível: ${asInteger(result.totalCurrentStock)} unidades`);
  return lines.join('\n').trim();
}

function formatSingleBarcodeResult(result: BlingStockByBarcodeResult, multi: boolean): string {
  const anyFound = sortStoresByLabel(result.stores).some(storeHasProduct);

  if (!anyFound) {
    return formatNotFoundAnywhere(result, multi);
  }

  return formatFoundBarcodeResult(result, multi);
}

export function formatPeraStockResponse(data: BlingMultiStoreStockResponse): string {
  if (data.stores.length === 0) {
    return 'Não há lojas Bling conectadas a este agente. Configure as lojas em Integrações Bling.';
  }

  if (data.results.length === 0) {
    return 'Nenhum código de barras informado para consulta.';
  }

  const multi = data.results.length > 1;
  return data.results.map((result) => formatSingleBarcodeResult(result, multi)).join('\n\n').trim();
}
