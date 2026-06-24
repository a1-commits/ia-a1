import {
  collectGtinFields,
  collectSkuField,
  normalizeBarcode,
} from './blingProductSearch';

export {
  buildGtinSearchPath,
  buildGtinSearchPaths,
  buildNameSearchPath,
  buildSkuSearchPath,
  collectGtinFields,
  collectSkuField,
  findExactGtinProduct,
  findExactSkuProduct,
  normalizeBarcode,
  productMatchesGtin,
  productMatchesSku,
  summarizeProductOption,
} from './blingProductSearch';

export function summarizeProductForBarcodeLog(product: unknown): Record<string, string | number | null> {
  if (!product || typeof product !== 'object') return {};

  const record = product as Record<string, unknown>;
  return {
    id: typeof record.id === 'number' ? record.id : null,
    nome: typeof record.nome === 'string' ? record.nome : null,
    codigo: collectSkuField(product),
    gtin: normalizeBarcode(record.gtin),
    codigoBarras: normalizeBarcode(record.codigoBarras),
    ean: normalizeBarcode(record.ean),
    barcode: normalizeBarcode(record.barcode),
    gtinFields: collectGtinFields(product).join(',') || null,
  };
}

export function logBarcodeSearch(input: {
  searchedBarcode: string;
  queryPath: string;
  queryType?: 'gtin' | 'sku' | 'name';
  candidateCount: number;
  firstCandidate?: Record<string, string | number | null> | null;
  matched: boolean;
}): void {
  console.info('[bling:barcode]', JSON.stringify(input));
}

export function logStockSearchAssociation(input: {
  index: number;
  searchedBarcode: string;
  returnedBarcode: string;
  connectionId: string;
  found: boolean;
}): void {
  console.info(
    '[bling:stock]',
    JSON.stringify({
      ...input,
      barcodeMatch: input.searchedBarcode === input.returnedBarcode,
    }),
  );
}

export function logMultiBarcodeAggregateResult(input: {
  index: number;
  searchedBarcode: string;
  resultBarcode: string;
  foundAny: boolean;
}): void {
  console.info(
    '[bling:stock:aggregate]',
    JSON.stringify({
      ...input,
      indexMatchesBarcode: input.searchedBarcode === input.resultBarcode,
    }),
  );
}
