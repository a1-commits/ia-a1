export const NUMERIC_GTIN_PATTERN = /^\d{8,14}$/;
const BARCODE_TOKEN = NUMERIC_GTIN_PATTERN;
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
  let result: BlingStockRequest | null = null;

  if (barcodes.length > 0) {
    result = { kind: 'barcode', queries: barcodes };
  } else {
    const nameQuery = extractNameQueryFromText(text);
    const skus = extractSkuTokensFromText(text);

    if (nameQuery?.includes(' ')) result = { kind: 'name', query: nameQuery };
    else if (skus.length > 0) result = { kind: 'sku', queries: skus };
    else if (nameQuery) result = { kind: 'name', query: nameQuery };
  }

  logGtinDiagnostic1('parseBlingStockRequest', {
    input: text,
    kind: result?.kind ?? null,
    queryMode: inferQueryModeFromRequest(result),
    request: result,
    classifiedAsBarcode: result?.kind === 'barcode',
    numericGtinQueries:
      result?.kind === 'barcode' ? result.queries.every(isNumericGtinInput) : null,
  });

  return result;
}

export function inferQueryModeFromRequest(
  request: BlingStockRequest | null,
): 'gtin' | 'sku' | 'name' | null {
  if (!request) return null;
  if (request.kind === 'barcode') return 'gtin';
  if (request.kind === 'sku') return 'sku';
  return 'name';
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

export function isNumericGtinInput(value: string): boolean {
  return NUMERIC_GTIN_PATTERN.test(value.trim());
}

/** Parâmetro correto Bling v3: gtins[] (não ?gtin=, que retorna lista genérica). */
export function buildGtinSearchPath(gtin: string): string {
  return `/produtos?gtins[]=${encodeURIComponent(gtin)}`;
}

export function buildGtinSearchPaths(gtin: string): string[] {
  return [buildGtinSearchPath(gtin)];
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

export type BlingProductCandidateLog = {
  id: number | null;
  nome: string | null;
  codigo: string | null;
  gtin: string | null;
  gtinEmbalagem: string | null;
  codigoBarras: string | null;
  ean: string | null;
  gtinFields: string[];
};

export function summarizeBlingProductCandidate(product: unknown): BlingProductCandidateLog | null {
  if (!product || typeof product !== 'object') return null;
  const record = product as Record<string, unknown>;
  const nestedCodigoBarras =
    record.codigoBarras && typeof record.codigoBarras === 'object'
      ? JSON.stringify(record.codigoBarras)
      : normalizeBarcode(record.codigoBarras);

  return {
    id: typeof record.id === 'number' ? record.id : null,
    nome: typeof record.nome === 'string' ? record.nome : null,
    codigo: collectSkuField(product),
    gtin: normalizeBarcode(record.gtin),
    gtinEmbalagem: normalizeBarcode(record.gtinEmbalagem),
    codigoBarras: nestedCodigoBarras,
    ean: normalizeBarcode(record.ean),
    gtinFields: collectGtinFields(product),
  };
}

export function summarizeBlingProductCandidates(products: unknown[]): BlingProductCandidateLog[] {
  return products
    .map((product) => summarizeBlingProductCandidate(product))
    .filter((candidate): candidate is BlingProductCandidateLog => candidate !== null);
}

export type GtinMatchExplanation = {
  matched: boolean;
  matchReason: string;
  matchedField: string | null;
  gtinFields: string[];
  codigoSku: string | null;
};

function findGtinMatchedFieldName(record: Record<string, unknown>, target: string): string | null {
  for (const key of GTIN_FIELD_NAMES) {
    const raw = record[key];
    if (key === 'codigoBarras' && raw && typeof raw === 'object') {
      for (const [nestedKey, nestedValue] of Object.entries(raw as Record<string, unknown>)) {
        if (normalizeBarcode(nestedValue) === target) return `codigoBarras.${nestedKey}`;
      }
      continue;
    }
    if (normalizeBarcode(raw) === target) return key;
  }
  return null;
}

/** Explica match/no-match GTIN sem alterar regras de negócio. */
export function explainGtinMatch(product: unknown, searchedGtin: string): GtinMatchExplanation {
  const target = normalizeBarcode(searchedGtin);
  const gtinFields = collectGtinFields(product);
  const codigoSku = collectSkuField(product);

  if (!target) {
    return {
      matched: false,
      matchReason: 'empty-query',
      matchedField: null,
      gtinFields,
      codigoSku,
    };
  }

  if (!product || typeof product !== 'object') {
    return {
      matched: false,
      matchReason: 'invalid-product-payload',
      matchedField: null,
      gtinFields,
      codigoSku,
    };
  }

  const record = product as Record<string, unknown>;
  if (gtinFields.includes(target)) {
    return {
      matched: true,
      matchReason: 'gtin-field-exact-match',
      matchedField: findGtinMatchedFieldName(record, target),
      gtinFields,
      codigoSku,
    };
  }

  if (codigoSku === target) {
    return {
      matched: false,
      matchReason: 'codigo-sku-equals-query-but-not-gtin-field',
      matchedField: null,
      gtinFields,
      codigoSku,
    };
  }

  return {
    matched: false,
    matchReason: gtinFields.length === 0 ? 'candidate-has-no-gtin-fields' : 'no-gtin-field-match',
    matchedField: null,
    gtinFields,
    codigoSku,
  };
}

export function logGtinParamSearch(input: {
  endpoint: string;
  candidateCount: number;
  gtinReturned: string | null;
  matched: boolean;
  query?: string;
  productId?: number | null;
}): void {
  console.info('[bling:gtin-param]', JSON.stringify(input));
}

export function logGtinDiagnostic1(event: string, payload: Record<string, unknown>): void {
  console.info('[bling:gtin-diagnostic-1]', JSON.stringify({ event, ...payload }));
}

export function logGtinSearchDiagnostic(input: {
  query: string;
  mode: 'GTIN' | 'SKU' | 'NAME';
  endpoint: string;
  phase: 'primary' | 'fallback' | 'hydrate';
  candidateCount: number;
  firstCandidate: BlingProductCandidateLog | null;
  matched: boolean;
  matchSource?: string;
  apiOk?: boolean;
  apiStatus?: number;
}): void {
  console.info('[bling:gtin-diagnostic]', JSON.stringify(input));
}

const BLING_SALE_PRICE_FIELD_NAMES = ['preco', 'precoVenda', 'valor', 'price', 'salePrice'] as const;

export type BlingSalePriceExtract = {
  price: number | null;
  source: string | null;
};

function parseBlingPriceValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized =
      trimmed.includes(',') && trimmed.includes('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Extrai preço de venda do payload Bling (preco, precoVenda, valor, price, salePrice). */
export function extractBlingSalePriceDetail(product: unknown): BlingSalePriceExtract {
  if (!product || typeof product !== 'object') return { price: null, source: null };

  const record = product as Record<string, unknown>;

  for (const key of BLING_SALE_PRICE_FIELD_NAMES) {
    const raw = record[key];
    if (key === 'preco' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const nestedKey of BLING_SALE_PRICE_FIELD_NAMES) {
        const nestedPrice = parseBlingPriceValue((raw as Record<string, unknown>)[nestedKey]);
        if (nestedPrice !== null) return { price: nestedPrice, source: `preco.${nestedKey}` };
      }
      continue;
    }

    const price = parseBlingPriceValue(raw);
    if (price !== null) return { price, source: key };
  }

  return { price: null, source: null };
}

export function extractBlingSalePrice(product: unknown): number | null {
  return extractBlingSalePriceDetail(product).price;
}

export function formatBrazilianSalePrice(price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return 'Não informado';
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  return formatted.replace(/\u00A0/g, ' ');
}
