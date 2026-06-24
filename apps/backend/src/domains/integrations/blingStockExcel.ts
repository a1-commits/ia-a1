import ExcelJS from 'exceljs';
import type { BlingMultiStoreStockResponse, BlingStockStoreResult } from './bling.types';
import { formatBrazilianSalePrice } from './blingProductSearch';

export const PERA_STOCK_DETAILED_MAX_CODES = 10;

export function shouldUsePeraStockSummary(codeCount: number): boolean {
  return codeCount > PERA_STOCK_DETAILED_MAX_CODES;
}

function sortStoresByLabel(stores: BlingStockStoreResult[]): BlingStockStoreResult[] {
  return [...stores].sort((a, b) => a.storeLabel.localeCompare(b.storeLabel, 'pt-BR'));
}

function asInteger(value: number | null | undefined): number | '' {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Math.trunc(value);
}

export function formatExcelSituationLabel(store: BlingStockStoreResult): string {
  if (store.situation === 'ERRO_CONSULTA') {
    return store.error ? `Erro na consulta: ${store.error}` : 'Erro na consulta';
  }
  if (!store.found) return 'Não encontrado pelo GTIN/EAN no Bling';
  return 'Encontrado';
}

export type PeraStockExcelRow = {
  barcode: string;
  storeLabel: string;
  productName: string;
  price: string;
  currentStock: number | '';
  minimumStock: number | '';
  situation: string;
};

export function buildPeraStockExcelRows(data: BlingMultiStoreStockResponse): PeraStockExcelRow[] {
  const rows: PeraStockExcelRow[] = [];

  for (const result of data.results) {
    for (const store of sortStoresByLabel(result.stores)) {
      const found = store.found && store.situation !== 'ERRO_CONSULTA';
      rows.push({
        barcode: result.barcode,
        storeLabel: store.storeLabel,
        productName: found ? (store.productName ?? '') : '',
        price: found ? formatBrazilianSalePrice(store.salePrice) : '',
        currentStock: found ? asInteger(store.currentStock) : '',
        minimumStock: found ? asInteger(store.minimumStock) : '',
        situation: formatExcelSituationLabel(store),
      });
    }
  }

  return rows;
}

export function countFoundBarcodes(data: BlingMultiStoreStockResponse): number {
  return data.results.filter((result) =>
    result.stores.some((store) => store.found && store.situation !== 'ERRO_CONSULTA'),
  ).length;
}

export function summarizeStoreItemCounts(data: BlingMultiStoreStockResponse): Array<{ storeLabel: string; count: number }> {
  const counts = new Map<string, number>();

  for (const result of data.results) {
    for (const store of result.stores) {
      if (store.found && store.situation !== 'ERRO_CONSULTA') {
        counts.set(store.storeLabel, (counts.get(store.storeLabel) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([storeLabel, count]) => ({ storeLabel, count }));
}

export async function buildPeraStockExcelBuffer(data: BlingMultiStoreStockResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PERA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Estoque');
  sheet.columns = [
    { header: 'Código GTIN/EAN', key: 'barcode', width: 20 },
    { header: 'Loja', key: 'storeLabel', width: 14 },
    { header: 'Produto', key: 'productName', width: 42 },
    { header: 'Preço', key: 'price', width: 16 },
    { header: 'Estoque', key: 'currentStock', width: 12 },
    { header: 'Estoque mínimo', key: 'minimumStock', width: 18 },
    { header: 'Situação', key: 'situation', width: 40 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of buildPeraStockExcelRows(data)) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildPeraStockExportFileName(date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `pera-estoque-${stamp}.xlsx`;
}
