const BARCODE_FIELD_NAMES = ['codigoBarras', 'gtin', 'ean', 'barcode', 'codigo'] as const;

export function normalizeBarcode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function collectBarcodeFields(product: unknown): string[] {
  if (!product || typeof product !== 'object') return [];

  const record = product as Record<string, unknown>;
  const values = new Set<string>();

  for (const key of BARCODE_FIELD_NAMES) {
    const raw = record[key];
    if (key === 'codigoBarras' && raw && typeof raw === 'object') continue;
    const normalized = normalizeBarcode(raw);
    if (normalized) values.add(normalized);
  }

  const nested = record.codigoBarras;
  if (nested && typeof nested === 'object') {
    for (const value of Object.values(nested as Record<string, unknown>)) {
      const normalized = normalizeBarcode(value);
      if (normalized) values.add(normalized);
    }
  }

  return Array.from(values);
}

export function productMatchesBarcode(product: unknown, searchedBarcode: string): boolean {
  const target = normalizeBarcode(searchedBarcode);
  if (!target) return false;
  return collectBarcodeFields(product).includes(target);
}

export function findExactBarcodeProduct<T>(products: T[], searchedBarcode: string): T | null {
  for (const product of products) {
    if (productMatchesBarcode(product, searchedBarcode)) return product;
  }
  return null;
}

export function summarizeProductForBarcodeLog(product: unknown): Record<string, string | number | null> {
  if (!product || typeof product !== 'object') return {};

  const record = product as Record<string, unknown>;
  return {
    id: typeof record.id === 'number' ? record.id : null,
    nome: typeof record.nome === 'string' ? record.nome : null,
    codigo: normalizeBarcode(record.codigo),
    gtin: normalizeBarcode(record.gtin),
    codigoBarras: normalizeBarcode(record.codigoBarras),
    ean: normalizeBarcode(record.ean),
    barcode: normalizeBarcode(record.barcode),
    barcodeFields: collectBarcodeFields(product).join(',') || null,
  };
}

export function logBarcodeSearch(input: {
  searchedBarcode: string;
  queryPath: string;
  candidateCount: number;
  firstCandidate?: Record<string, string | number | null> | null;
  matched: boolean;
}): void {
  console.info('[bling:barcode]', JSON.stringify(input));
}
