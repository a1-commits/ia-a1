const BARCODE_TOKEN = /^\d{8,14}$/;
const SKU_TOKEN = /^[A-Za-z][A-Za-z0-9\-_.]{2,48}$/;

const STOCK_KEYWORDS =
  /estoque|c[oó]digo de barras|barras|gtin|ean|saldo|m[ií]nimo|produto|bling|consulta|sku|c[oó]digo interno/i;

const FILLER_WORDS = new Set([
  'qual',
  'quais',
  'quanto',
  'tem',
  'do',
  'da',
  'de',
  'dos',
  'das',
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'me',
  'diga',
  'ver',
  'verificar',
  'consulta',
  'consultar',
  'estoque',
  'produto',
]);

export type BlingStockRequestKind = 'barcode' | 'sku' | 'name';

export type BlingStockRequest =
  | { kind: 'barcode'; queries: string[] }
  | { kind: 'sku'; queries: string[] }
  | { kind: 'name'; query: string };

export type BlingProductOption = {
  id: number | null;
  nome: string;
  sku: string | null;
  gtin: string | null;
};

export function extractSkuTokensFromText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const part of normalized.split(/[\s;]+/)) {
    const token = part.replace(/[^\w\-_.]/g, '').trim();
    if (!token || BARCODE_TOKEN.test(token) || !SKU_TOKEN.test(token)) continue;
    if (FILLER_WORDS.has(token.toLowerCase())) continue;
    const upper = token.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    ordered.push(upper);
  }

  return ordered;
}

export function extractNameQueryFromText(text: string): string | null {
  let query = text.replace(/\r\n/g, ' ').trim();
  if (!query) return null;

  query = query
    .replace(STOCK_KEYWORDS, ' ')
    .replace(/[^\w\sÀ-ÿ-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = query
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !FILLER_WORDS.has(token.toLowerCase()));

  if (tokens.length === 0) return null;

  const nameQuery = tokens.join(' ');
  if (nameQuery.length < 3) return null;
  if (BARCODE_TOKEN.test(nameQuery)) return null;
  if (SKU_TOKEN.test(nameQuery) && !nameQuery.includes(' ')) return null;
  if (!/[A-Za-zÀ-ÿ]/.test(nameQuery)) return null;
  return nameQuery;
}

export function parseBlingStockRequest(text: string): BlingStockRequest | null {
  const barcodes = extractBarcodesFromText(text);
  if (barcodes.length > 0) return { kind: 'barcode', queries: barcodes };

  const nameQuery = extractNameQueryFromText(text);
  const skus = extractSkuTokensFromText(text);

  if (nameQuery?.includes(' ')) return { kind: 'name', query: nameQuery };
  if (skus.length > 0) return { kind: 'sku', queries: skus };
  if (nameQuery) return { kind: 'name', query: nameQuery };

  return null;
}

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

export function summarizeProductOption(product: unknown): BlingProductOption | null {
  if (!product || typeof product !== 'object') return null;
  const record = product as Record<string, unknown>;
  const nome = typeof record.nome === 'string' ? record.nome.trim() : '';
  if (!nome) return null;

  const id = typeof record.id === 'number' ? record.id : null;
  const sku =
    typeof record.codigo === 'string' && record.codigo.trim().length > 0 ? record.codigo.trim() : null;

  const gtinFields = collectGtinFields(product);
  const gtin = gtinFields[0] ?? null;

  return { id, nome, sku, gtin };
}

export function dedupeProductOptions(options: BlingProductOption[]): BlingProductOption[] {
  const seen = new Set<string>();
  const ordered: BlingProductOption[] = [];
  for (const option of options) {
    const key = `${option.id ?? 'x'}:${option.sku ?? ''}:${option.gtin ?? ''}:${option.nome.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(option);
  }
  return ordered;
}

export function formatProductDisambiguationResponse(options: BlingProductOption[]): string {
  if (options.length === 0) {
    return '❌ Nenhum produto encontrado com esse nome nas lojas conectadas.';
  }

  const lines = [
    'Encontrei estes produtos. Qual desses produtos você deseja consultar?',
    '',
    ...options.map((option, index) => formatProductOptionLine(option, index + 1)),
    '',
    'Responda com o número da opção, o SKU ou o GTIN/EAN.',
    'Não consulto estoque definitivo por nome sem sua confirmação.',
  ];
  return lines.join('\n');
}

export function formatProductOptionLine(option: BlingProductOption, index: number): string {
  const sku = option.sku ?? '—';
  const gtin = option.gtin ?? '—';
  return `${index}. ${option.nome} — SKU: ${sku} — GTIN/EAN: ${gtin}`;
}

/** Campos GTIN/EAN no Bling v3: gtin, gtinEmbalagem, codigoBarras (string ou objeto), ean, barcode */
const GTIN_FIELD_NAMES = ['gtin', 'gtinEmbalagem', 'codigoBarras', 'ean', 'barcode'] as const;

export function normalizeBarcode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function collectGtinFields(product: unknown): string[] {
  if (!product || typeof product !== 'object') return [];

  const record = product as Record<string, unknown>;
  const values = new Set<string>();

  for (const key of GTIN_FIELD_NAMES) {
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

export function collectSkuField(product: unknown): string | null {
  if (!product || typeof product !== 'object') return null;
  return normalizeBarcode((product as Record<string, unknown>).codigo);
}

export function productMatchesGtin(product: unknown, searchedGtin: string): boolean {
  const target = normalizeBarcode(searchedGtin);
  if (!target) return false;
  return collectGtinFields(product).includes(target);
}

export function productMatchesSku(product: unknown, searchedSku: string): boolean {
  const target = normalizeBarcode(searchedSku);
  if (!target) return false;
  const sku = collectSkuField(product);
  return sku !== null && sku.toUpperCase() === target.toUpperCase();
}

export function findExactGtinProduct<T>(products: T[], searchedGtin: string): T | null {
  for (const product of products) {
    if (productMatchesGtin(product, searchedGtin)) return product;
  }
  return null;
}

export function findExactSkuProduct<T>(products: T[], searchedSku: string): T | null {
  for (const product of products) {
    if (productMatchesSku(product, searchedSku)) return product;
  }
  return null;
}

export function buildGtinSearchPaths(gtin: string): string[] {
  return [
    `/produtos?pagina=1&limite=50&gtin=${encodeURIComponent(gtin)}`,
    `/produtos?pagina=1&limite=50&codigoBarras=${encodeURIComponent(gtin)}`,
  ];
}

export function buildSkuSearchPath(sku: string): string {
  return `/produtos?pagina=1&limite=50&codigo=${encodeURIComponent(sku)}`;
}

export function buildNameSearchPath(name: string): string {
  return `/produtos?pagina=1&limite=20&nome=${encodeURIComponent(name)}`;
}

export function shouldAutoSelectNameMatch(options: BlingProductOption[]): boolean {
  return false;
}
