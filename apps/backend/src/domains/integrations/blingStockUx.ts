import type { BlingStockByBarcodeResult, BlingMultiStoreStockResponse, BlingStockStoreResult } from './bling.types';
import { formatBrazilianSalePrice } from './blingProductSearch';
import {
  countFoundBarcodes,
  summarizeStoreItemCounts,
} from './blingStockExcel';

const MULTI_BARCODE_SEPARATOR = '\n---\n';

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
  lines.push(`Preço: ${formatBrazilianSalePrice(store.salePrice)}`);
  lines.push(`Estoque: ${asInteger(store.currentStock)}`);
  lines.push(`Estoque mínimo: ${asInteger(store.minimumStock)}`);
  return lines;
}

function formatNotFoundAnywhere(result: BlingStockByBarcodeResult): string {
  return [
    `Código: ${result.barcode}`,
    '',
    '❌ Produto não encontrado pelo GTIN/EAN no Bling.',
  ].join('\n');
}

function formatFoundBarcodeResult(result: BlingStockByBarcodeResult): string {
  const stores = sortStoresByLabel(result.stores);
  const lines: string[] = [`Código: ${result.barcode}`, ''];

  for (const store of stores) {
    lines.push(...formatStoreBlock(store), '');
  }

  return lines.join('\n').trim();
}

function formatSingleBarcodeResult(result: BlingStockByBarcodeResult): string {
  const anyFound = sortStoresByLabel(result.stores).some(storeHasProduct);

  if (!anyFound) {
    return formatNotFoundAnywhere(result);
  }

  return formatFoundBarcodeResult(result);
}

export function formatPeraStockResponse(data: BlingMultiStoreStockResponse): string {
  if (data.stores.length === 0) {
    return 'Não há lojas Bling conectadas a este agente. Configure as lojas em Integrações Bling.';
  }

  if (data.results.length === 0) {
    return 'Nenhum código de barras informado para consulta.';
  }

  return data.results.map((result) => formatSingleBarcodeResult(result)).join(MULTI_BARCODE_SEPARATOR).trim();
}

export function formatPeraStockSummaryResponse(
  data: BlingMultiStoreStockResponse,
  options: { downloadUrl?: string | null; excelGenerationFailed?: boolean },
): string {
  const totalCodes = data.barcodes.length;
  const foundCodes = countFoundBarcodes(data);
  const notFound = totalCodes - foundCodes;
  const storeSummary = summarizeStoreItemCounts(data);

  const lines = [
    'Consulta concluída.',
    '',
    `Códigos consultados: ${totalCodes}`,
    `Produtos encontrados: ${foundCodes}`,
    `Não encontrados: ${notFound}`,
    '',
    'Resumo por loja:',
    ...(storeSummary.length > 0
      ? storeSummary.map(({ storeLabel, count }) => `• ${storeLabel}: ${count} itens`)
      : ['• Nenhum item encontrado']),
    '',
  ];

  if (options.downloadUrl) {
    lines.push(`📊 Baixar Excel completo: ${options.downloadUrl}`);
  } else if (options.excelGenerationFailed) {
    lines.push('Não consegui gerar a planilha desta vez.');
  }

  return lines.join('\n');
}
