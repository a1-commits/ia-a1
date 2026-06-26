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

function resolveProductName(result: BlingMultiStoreStockResponse['results'][number]): string {
  return (
    result.stores.find((store) => store.found && store.productName)?.productName ??
    result.stores.find((store) => store.productName)?.productName ??
    ''
  );
}

function formatPivotStockCell(store: BlingStockStoreResult): string | number {
  if (store.situation === 'ERRO_CONSULTA') return 'Erro';
  if (!store.found) return 'N/A';
  return asInteger(store.currentStock);
}

function formatPivotMinimumCell(store: BlingStockStoreResult): string | number {
  if (store.situation === 'ERRO_CONSULTA' || !store.found) return '';
  return asInteger(store.minimumStock);
}

export function buildPeraStockExcelPivotRows(
  data: BlingMultiStoreStockResponse,
): Array<Record<string, string | number>> {
  const storeLabels = [...data.stores]
    .map((store) => store.storeLabel)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return data.results.map((result) => {
    const storesByLabel = new Map(result.stores.map((store) => [store.storeLabel, store]));
    const row: Record<string, string | number> = {
      codigo: result.barcode,
      produto: resolveProductName(result),
    };

    for (const label of storeLabels) {
      const store = storesByLabel.get(label);
      row[label] = store ? formatPivotStockCell(store) : 'N/A';
      row[`min_${label}`] = store ? formatPivotMinimumCell(store) : '';
    }

    return row;
  });
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
  const storeLabels = [...data.stores]
    .map((store) => store.storeLabel)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const columns: ExcelJS.Column[] = [
    { header: 'Código', key: 'codigo', width: 20 },
    { header: 'Produto', key: 'produto', width: 42 },
    ...storeLabels.flatMap((label) => [
      { header: label, key: label, width: 12 },
      { header: `Mín ${label}`, key: `min_${label}`, width: 12 },
    ]),
  ];

  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  for (const row of buildPeraStockExcelPivotRows(data)) {
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
