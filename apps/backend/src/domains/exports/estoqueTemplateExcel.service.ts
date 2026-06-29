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

const RESUMO_COLUMNS = {
  barcode: 1,
  description: 2,
  cdStock: 5,
  pb1Stock: 7,
  pb1Min: 8,
  pb2Stock: 11,
  pb2Min: 12,
  pb3Stock: 15,
  pb3Min: 16,
} as const;

const RESUMO_VALUE_COLUMNS = new Set<number>(Object.values(RESUMO_COLUMNS));

const STORE_FILL_MAP: Record<string, { stock: number; min?: number }> = {
  CD: { stock: RESUMO_COLUMNS.cdStock },
  PB1: { stock: RESUMO_COLUMNS.pb1Stock, min: RESUMO_COLUMNS.pb1Min },
  PB2: { stock: RESUMO_COLUMNS.pb2Stock, min: RESUMO_COLUMNS.pb2Min },
  PB3: { stock: RESUMO_COLUMNS.pb3Stock, min: RESUMO_COLUMNS.pb3Min },
};

const RESUMO_FORMULA_COLUMNS = [4, 6, 9, 13, 17, 21, 23, 25] as const;

function asIntegerOrEmpty(value: number | null | undefined): number | '' {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Math.trunc(value);
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

export function replicateResumoModelRow(
  sheet: ExcelJS.Worksheet,
  targetRow: number,
  modelRow = RESUMO_MODEL_ROW,
): void {
  const source = sheet.getRow(modelRow);
  const target = sheet.getRow(targetRow);
  target.height = source.height;

  source.eachCell({ includeEmpty: true }, (sourceCell, columnNumber) => {
    const targetCell = target.getCell(columnNumber);
    copyCellStyle(targetCell, sourceCell);

    if (RESUMO_VALUE_COLUMNS.has(columnNumber)) {
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

function clearResumoValueCells(sheet: ExcelJS.Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  for (const column of RESUMO_VALUE_COLUMNS) {
    row.getCell(column).value = null;
  }
}

function fillResumoRow(sheet: ExcelJS.Worksheet, rowNumber: number, result: BlingStockByBarcodeResult): void {
  const row = sheet.getRow(rowNumber);
  row.getCell(RESUMO_COLUMNS.barcode).value = result.barcode;
  row.getCell(RESUMO_COLUMNS.description).value = resolveProductName(result);

  for (const [storeLabel, columns] of Object.entries(STORE_FILL_MAP)) {
    const store = getFoundStore(result, storeLabel);
    if (!store) continue;

    row.getCell(columns.stock).value = asIntegerOrEmpty(store.currentStock);
    if (columns.min) {
      row.getCell(columns.min).value = asIntegerOrEmpty(store.minimumStock);
    }
  }
}

function resolveNeededEndRow(foundCount: number): number {
  return foundCount > 0 ? RESUMO_DATA_START_ROW + foundCount - 1 : RESUMO_DATA_START_ROW - 1;
}

function resolveClearUntilRow(foundCount: number, sheet: ExcelJS.Worksheet): number {
  return Math.max(RESUMO_LAST_PREFORMULA_ROW, resolveNeededEndRow(foundCount), sheet.lastRow?.number ?? RESUMO_LAST_PREFORMULA_ROW);
}

function ensureResumoRowsForProducts(sheet: ExcelJS.Worksheet, neededEndRow: number): void {
  if (neededEndRow <= RESUMO_LAST_PREFORMULA_ROW) return;

  for (let rowNumber = RESUMO_LAST_PREFORMULA_ROW + 1; rowNumber <= neededEndRow; rowNumber += 1) {
    replicateResumoModelRow(sheet, rowNumber);
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

  const foundResults = data.results.filter(isFoundStockResult);
  const neededEndRow = resolveNeededEndRow(foundResults.length);
  const clearUntilRow = resolveClearUntilRow(foundResults.length, sheet);

  ensureResumoRowsForProducts(sheet, neededEndRow);

  for (let rowNumber = RESUMO_DATA_START_ROW; rowNumber <= clearUntilRow; rowNumber += 1) {
    clearResumoValueCells(sheet, rowNumber);
  }

  foundResults.forEach((result, index) => {
    const rowNumber = RESUMO_DATA_START_ROW + index;
    fillResumoRow(sheet, rowNumber, result);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
