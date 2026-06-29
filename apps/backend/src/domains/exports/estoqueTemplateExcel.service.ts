import ExcelJS from 'exceljs';
import path from 'path';
import type {
  BlingMultiStoreStockResponse,
  BlingStockByBarcodeResult,
  BlingStockStoreResult,
} from '../integrations/bling.types';

export const ESTOQUE_TEMPLATE_PATH = path.resolve(__dirname, '../../../templates', 'estoque-template.xlsx');
export const RESUMO_SHEET_NAME = 'RESUMO';
export const RESUMO_DATA_START_ROW = 3;
export const RESUMO_MODEL_ROW = 4;
export const RESUMO_LAST_PREFORMULA_ROW = 101;

/** Colunas que contêm fórmulas ou campos futuros — nunca recebem valor do código. */
export const RESUMO_PROTECTED_COLUMNS = new Set([
  3, 4, 6, 9, 10, 13, 14, 17, 18, 19, 21, 23, 25,
]);

export const RESUMO_FORMULA_COLUMNS = [4, 6, 9, 13, 17, 21, 23, 25] as const;

export type ResumoInputColumns = {
  barcode: number;
  description: number;
  cdStock: number;
  pb1Stock: number;
  pb1Min: number;
  pb2Stock: number;
  pb2Min: number;
  pb3Stock: number;
  pb3Min: number;
  pb1Price: number;
  pb2Price: number;
  pb3Price: number;
};

const FALLBACK_INPUT_COLUMNS: ResumoInputColumns = {
  barcode: 1,
  description: 2,
  cdStock: 5,
  pb1Stock: 7,
  pb1Min: 8,
  pb2Stock: 11,
  pb2Min: 12,
  pb3Stock: 15,
  pb3Min: 16,
  pb1Price: 20,
  pb2Price: 22,
  pb3Price: 24,
};

function normalizeHeader(value: ExcelJS.CellValue): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function findHeaderColumn(headers: Map<number, string>, matcher: (header: string) => boolean): number | undefined {
  for (const [column, header] of [...headers.entries()].sort((a, b) => a[0] - b[0])) {
    if (matcher(header)) return column;
  }
  return undefined;
}

export function resolveResumoInputColumns(sheet: ExcelJS.Worksheet): ResumoInputColumns {
  const headers = new Map<number, string>();
  sheet.getRow(2).eachCell({ includeEmpty: false }, (cell, column) => {
    headers.set(column, normalizeHeader(cell.value));
  });

  const lojaStockColumns: number[] = [];
  const lojaMinColumns: number[] = [];
  const lojaPriceColumns: number[] = [];

  for (const [column, header] of [...headers.entries()].sort((a, b) => a[0] - b[0])) {
    if (header.includes('QUANTO ENVIAR') || header.includes('SEPARAR') || header.includes('SALDO FINAL')) {
      continue;
    }
    if (header === 'PB1' || header === 'PB2' || header === 'PB3') {
      lojaPriceColumns.push(column);
      continue;
    }
    if (header.includes('ESTOQUE') && header.includes('LOJA')) {
      lojaStockColumns.push(column);
      continue;
    }
    if (header.includes('ESTOQUE') && header.includes('MINIMO')) {
      lojaMinColumns.push(column);
    }
  }

  const resolved: ResumoInputColumns = {
    barcode:
      findHeaderColumn(headers, (header) => header.includes('CODIGO BARRAS') || header.includes('CÓDIGO BARRAS')) ??
      FALLBACK_INPUT_COLUMNS.barcode,
    description:
      findHeaderColumn(headers, (header) => header.includes('DESCRI')) ?? FALLBACK_INPUT_COLUMNS.description,
    cdStock:
      findHeaderColumn(headers, (header) => header.includes('ESTOQUE') && header.includes('CD')) ??
      FALLBACK_INPUT_COLUMNS.cdStock,
    pb1Stock: lojaStockColumns[0] ?? FALLBACK_INPUT_COLUMNS.pb1Stock,
    pb1Min: lojaMinColumns[0] ?? FALLBACK_INPUT_COLUMNS.pb1Min,
    pb2Stock: lojaStockColumns[1] ?? FALLBACK_INPUT_COLUMNS.pb2Stock,
    pb2Min: lojaMinColumns[1] ?? FALLBACK_INPUT_COLUMNS.pb2Min,
    pb3Stock: lojaStockColumns[2] ?? FALLBACK_INPUT_COLUMNS.pb3Stock,
    pb3Min: lojaMinColumns[2] ?? FALLBACK_INPUT_COLUMNS.pb3Min,
    pb1Price: lojaPriceColumns.find((column) => headers.get(column) === 'PB1') ?? FALLBACK_INPUT_COLUMNS.pb1Price,
    pb2Price: lojaPriceColumns.find((column) => headers.get(column) === 'PB2') ?? FALLBACK_INPUT_COLUMNS.pb2Price,
    pb3Price: lojaPriceColumns.find((column) => headers.get(column) === 'PB3') ?? FALLBACK_INPUT_COLUMNS.pb3Price,
  };

  for (const [name, column] of Object.entries(resolved)) {
    if (RESUMO_PROTECTED_COLUMNS.has(column)) {
      throw new Error(
        `Mapeamento inválido da aba RESUMO: coluna ${column} (${name}) é calculada pelo template.`,
      );
    }
  }

  return resolved;
}

function inputColumnSet(columns: ResumoInputColumns): Set<number> {
  return new Set(Object.values(columns));
}

function asIntegerOrEmpty(value: number | null | undefined): number | '' {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Math.trunc(value);
}

function asSalePrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value;
}

export function isFoundStockResult(result: BlingStockByBarcodeResult): boolean {
  return result.stores.some((store) => store.found && store.situation !== 'ERRO_CONSULTA');
}

export function adjustFormulaRowReferences(formula: string, sourceRow: number, targetRow: number): string {
  if (sourceRow === targetRow) return formula;

  const withSheetRefs = formula.replace(
    new RegExp(`'([^']+)'!(\\$?)([A-Z]{1,3})(\\$?)(${sourceRow})(?![0-9])`, 'g'),
    (_match, sheet, colAbs, col, rowAbs) => `'${sheet}'!${colAbs}${col}${rowAbs}${targetRow}`,
  );

  return withSheetRefs.replace(
    new RegExp(`(\\$?)([A-Z]{1,3})(\\$?)(${sourceRow})(?![0-9])`, 'g'),
    (_match, colAbs, col, rowAbs) => `${colAbs}${col}${rowAbs}${targetRow}`,
  );
}

function copyCellStyle(target: ExcelJS.Cell, source: ExcelJS.Cell): void {
  target.style = source.style;
}

function setResumoInputValue(
  row: ExcelJS.Row,
  column: number,
  value: string | number | null,
  writableColumns: Set<number>,
): void {
  if (RESUMO_PROTECTED_COLUMNS.has(column)) {
    throw new Error(`Coluna ${column} da aba RESUMO é protegida e não pode receber valores do sistema.`);
  }
  if (!writableColumns.has(column)) {
    throw new Error(`Coluna ${column} não faz parte das colunas de entrada da aba RESUMO.`);
  }

  const cell = row.getCell(column);
  if (value === null || value === '') {
    cell.value = null;
    return;
  }
  cell.value = value;
}

export function replicateResumoModelRow(
  sheet: ExcelJS.Worksheet,
  targetRow: number,
  writableColumns: Set<number>,
  modelRow = RESUMO_MODEL_ROW,
): void {
  const source = sheet.getRow(modelRow);
  const target = sheet.getRow(targetRow);
  target.height = source.height;

  source.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
    const targetCell = target.getCell(columnNumber);
    copyCellStyle(targetCell, sourceCell);

    if (writableColumns.has(columnNumber)) {
      targetCell.value = null;
      return;
    }

    const formula = sourceCell.formula;
    if (formula) {
      targetCell.value = {
        formula: adjustFormulaRowReferences(formula, modelRow, targetRow),
      };
      return;
    }

    targetCell.value =
      sourceCell.value === undefined || sourceCell.value === null ? null : sourceCell.value;
  });
}

function resolveProductName(result: BlingStockByBarcodeResult): string {
  return (
    result.stores.find((store) => store.found && store.productName)?.productName ??
    result.stores.find((store) => store.productName)?.productName ??
    ''
  );
}

function getFoundStore(result: BlingStockByBarcodeResult, storeLabel: string): BlingStockStoreResult | undefined {
  const store = result.stores.find((item) => item.storeLabel === storeLabel);
  if (!store?.found || store.situation === 'ERRO_CONSULTA') return undefined;
  return store;
}

function clearResumoInputCells(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  writableColumns: Set<number>,
): void {
  const row = sheet.getRow(rowNumber);
  for (const column of writableColumns) {
    setResumoInputValue(row, column, null, writableColumns);
  }
}

function fillResumoRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  result: BlingStockByBarcodeResult,
  columns: ResumoInputColumns,
  writableColumns: Set<number>,
): void {
  const row = sheet.getRow(rowNumber);

  setResumoInputValue(row, columns.barcode, result.barcode, writableColumns);
  setResumoInputValue(row, columns.description, resolveProductName(result), writableColumns);

  const storeFillMap: Record<string, { stock: number; min?: number; price?: number }> = {
    CD: { stock: columns.cdStock },
    PB1: { stock: columns.pb1Stock, min: columns.pb1Min, price: columns.pb1Price },
    PB2: { stock: columns.pb2Stock, min: columns.pb2Min, price: columns.pb2Price },
    PB3: { stock: columns.pb3Stock, min: columns.pb3Min, price: columns.pb3Price },
  };

  for (const [storeLabel, mapping] of Object.entries(storeFillMap)) {
    const store = getFoundStore(result, storeLabel);
    if (!store) continue;

    const stockValue = asIntegerOrEmpty(store.currentStock);
    if (stockValue !== '') {
      setResumoInputValue(row, mapping.stock, stockValue, writableColumns);
    }

    if (mapping.min !== undefined && store.minimumStock !== null && store.minimumStock !== undefined) {
      setResumoInputValue(row, mapping.min, asIntegerOrEmpty(store.minimumStock), writableColumns);
    }

    if (mapping.price !== undefined) {
      const salePrice = asSalePrice(store.salePrice);
      if (salePrice !== null) {
        setResumoInputValue(row, mapping.price, salePrice, writableColumns);
      }
    }
  }
}

function resolveNeededEndRow(foundCount: number): number {
  return foundCount > 0 ? RESUMO_DATA_START_ROW + foundCount - 1 : RESUMO_DATA_START_ROW - 1;
}

function resolveClearUntilRow(foundCount: number, sheet: ExcelJS.Worksheet): number {
  return Math.max(RESUMO_LAST_PREFORMULA_ROW, resolveNeededEndRow(foundCount), sheet.lastRow?.number ?? RESUMO_LAST_PREFORMULA_ROW);
}

function ensureResumoRowsForProducts(
  sheet: ExcelJS.Worksheet,
  neededEndRow: number,
  writableColumns: Set<number>,
): void {
  if (neededEndRow <= RESUMO_LAST_PREFORMULA_ROW) return;

  for (let rowNumber = RESUMO_LAST_PREFORMULA_ROW + 1; rowNumber <= neededEndRow; rowNumber += 1) {
    replicateResumoModelRow(sheet, rowNumber, writableColumns);
  }
}

export function listResumoFormulaColumns(sheet: ExcelJS.Worksheet, rowNumber: number): number[] {
  return RESUMO_FORMULA_COLUMNS.filter((column) => {
    const cell = sheet.getRow(rowNumber).getCell(column);
    return Boolean(cell.formula);
  });
}

export async function buildEstoqueTemplateExcelBuffer(
  data: BlingMultiStoreStockResponse,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ESTOQUE_TEMPLATE_PATH);

  const sheet = workbook.getWorksheet(RESUMO_SHEET_NAME);
  if (!sheet) {
    throw new Error('Aba RESUMO não encontrada no template de estoque.');
  }

  const inputColumns = resolveResumoInputColumns(sheet);
  const writableColumns = inputColumnSet(inputColumns);
  const foundResults = data.results.filter(isFoundStockResult);
  const neededEndRow = resolveNeededEndRow(foundResults.length);
  const clearUntilRow = resolveClearUntilRow(foundResults.length, sheet);

  ensureResumoRowsForProducts(sheet, neededEndRow, writableColumns);

  for (let rowNumber = RESUMO_DATA_START_ROW; rowNumber <= clearUntilRow; rowNumber += 1) {
    clearResumoInputCells(sheet, rowNumber, writableColumns);
  }

  foundResults.forEach((result, index) => {
    const rowNumber = RESUMO_DATA_START_ROW + index;
    fillResumoRow(sheet, rowNumber, result, inputColumns, writableColumns);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
