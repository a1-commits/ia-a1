import type { AgentIntent } from '../chat/intentRouter.service';
import { logAgentSearchMode } from '../chat/agentFlowLogger.service';
import {
  aggregateStockForAgent,
  agentHasBlingTool,
  findProductOptionsByNameForAgent,
  getValidAccessToken,
} from './bling.service';
import { prisma } from '../../lib/prisma';
import {
  extractBarcodesFromText,
  isNumericGtinInput,
  logGtinSearchDiagnostic,
  normalizeGtinInput,
  parseBlingStockRequest,
} from './blingProductSearch';
import type { BlingMultiStoreStockResponse, BlingStockByBarcodeResult } from './bling.types';
import type { BlingProductOptionRow, BlingApiErrorKind, BlingStructuredResult, BlingStockProductBlock } from './blingStructured.types';
import {
  clearProductDisambiguation,
  saveProductDisambiguation,
  takeProductDisambiguationChoice,
} from './productDisambiguationStore';
import { createPeraStockExcelExport } from '../exports/peraStockExport.service';
import { shouldUsePeraStockSummary } from './blingStockExcel';

function classifyBlingErrorMessage(error: string | null | undefined): BlingApiErrorKind {
  const lower = (error ?? '').toLowerCase();
  if (!lower) return 'generic';
  if (/timeout|timed out|aborted|etimedout|econnrefused|enotfound|fetch failed|network/i.test(lower)) {
    return 'timeout';
  }
  if (/401|403|unauthorized|token|expir|autentic|credencial|oauth|invalid.*token/i.test(lower)) {
    return 'auth';
  }
  if (/503|502|504|429|rate|indispon|unavailable|erro bling/i.test(lower)) {
    return 'unavailable';
  }
  return 'generic';
}

function worstErrorKind(kinds: BlingApiErrorKind[]): BlingApiErrorKind {
  if (kinds.includes('auth')) return 'auth';
  if (kinds.includes('timeout')) return 'timeout';
  if (kinds.includes('unavailable')) return 'unavailable';
  return 'generic';
}

export function hasAnyProductFoundInAggregate(data: BlingMultiStoreStockResponse): boolean {
  return data.results.some((result) => result.stores.some((store) => store.found));
}

async function aggregateBarcodeSearchWithPriority(input: {
  userId: string;
  agentId: string;
  barcodes: string[];
}): Promise<BlingMultiStoreStockResponse> {
  const barcodes = input.barcodes.map((barcode) =>
    isNumericGtinInput(barcode) ? normalizeGtinInput(barcode) : barcode.trim(),
  );
  const numericOnly = barcodes.every(isNumericGtinInput);
  if (!numericOnly) {
    return aggregateStockForAgent({
      userId: input.userId,
      agentId: input.agentId,
      barcodes,
      queryMode: 'sku',
    });
  }

  logAgentSearchMode('GTIN');
  const gtinData = await aggregateStockForAgent({
    userId: input.userId,
    agentId: input.agentId,
    barcodes,
    queryMode: 'gtin',
  });
  if (hasAnyProductFoundInAggregate(gtinData)) {
    return gtinData;
  }

  logAgentSearchMode('SKU_FALLBACK');
  return aggregateStockForAgent({
    userId: input.userId,
    agentId: input.agentId,
    barcodes,
    queryMode: 'sku',
  });
}

function detectApiErrorFromResults(
  results: BlingStockByBarcodeResult[],
): BlingApiErrorKind | null {
  const stores = results.flatMap((result) => result.stores);
  const foundStores = stores.filter((store) => store.found);
  if (foundStores.length > 0) return null;

  const errorStores = stores.filter((store) => store.situation === 'ERRO_CONSULTA');
  if (errorStores.length === 0) return null;

  const kinds = errorStores.map((store) => classifyBlingErrorMessage(store.error));
  return worstErrorKind(kinds);
}

async function resolveNameSearchEmptyResult(input: {
  userId: string;
  agentId: string;
  intent: AgentIntent;
  nameQuery: string;
}): Promise<BlingStructuredResult> {
  const connections = await prisma.blingConnection.findMany({
    where: {
      userId: input.userId,
      agentId: input.agentId,
      isActive: true,
    },
  });

  if (connections.length === 0) {
    return {
      kind: 'api_error',
      intent: input.intent,
      errorKind: 'unavailable',
      query: input.nameQuery,
    };
  }

  const tokenResults = await Promise.all(
    connections.map((connection) => getValidAccessToken(connection.id)),
  );
  const failed = tokenResults.filter((result) => !result.ok);
  if (failed.length === connections.length) {
    const kinds = failed.map((result) => classifyBlingErrorMessage(result.reason));
    return {
      kind: 'api_error',
      intent: input.intent,
      errorKind: worstErrorKind(kinds),
      query: input.nameQuery,
    };
  }

  return { kind: 'empty', intent: input.intent, query: input.nameQuery };
}

function sortEstoquesByLoja<T extends { loja: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.loja.localeCompare(b.loja, 'pt-BR'));
}

function mapResultToProductBlock(
  result: BlingStockByBarcodeResult,
  onlyBelowMinimum: boolean,
): BlingStockProductBlock {
  const estoques = sortEstoquesByLoja(flattenStockResults([result], onlyBelowMinimum));
  const anyFound = result.stores.some((store) => store.found);
  const productName =
    result.stores.find((s) => s.found && s.productName)?.productName ??
    result.stores.find((s) => s.productName)?.productName ??
    (anyFound ? 'Produto' : 'Produto não encontrado');

  return {
    codigoBarras: result.barcode,
    produto: productName,
    estoques,
  };
}

function mapStockResponse(
  intent: AgentIntent,
  data: BlingMultiStoreStockResponse,
  filterBelowMinimum = false,
): BlingStructuredResult {
  const primaryBarcode = data.barcodes[0] ?? null;
  const apiError = detectApiErrorFromResults(data.results);
  if (apiError) {
    return { kind: 'api_error', intent, errorKind: apiError, query: primaryBarcode };
  }

  if (data.results.length === 0) {
    if (data.stores.length === 0) {
      return { kind: 'api_error', intent, errorKind: 'unavailable', query: primaryBarcode };
    }
    return { kind: 'empty', intent, query: primaryBarcode };
  }

  const produtos = data.results.map((result) => mapResultToProductBlock(result, filterBelowMinimum));
  const hasAnyRow = produtos.some((item) => item.estoques.length > 0);
  if (!hasAnyRow) {
    if (data.stores.length === 0) {
      return { kind: 'api_error', intent, errorKind: 'unavailable', query: primaryBarcode };
    }
    return { kind: 'empty', intent, query: primaryBarcode };
  }

  if (filterBelowMinimum) {
    const primary = produtos[0]!;
    return {
      kind: 'below_minimum',
      intent,
      produto: primary.produto,
      itens: primary.estoques.map((row) => ({
        ...row,
        produto: primary.produto,
        codigoBarras: primary.codigoBarras,
      })),
    };
  }

  return {
    kind: 'stock',
    intent,
    produtos,
  };
}

function flattenStockResults(
  results: BlingStockByBarcodeResult[],
  onlyBelowMinimum: boolean,
): Array<{
  loja: string;
  quantidade: number | null;
  minimo: number | null;
  situacao: string;
  preco: number | null;
  codigoInterno: string | null;
}> {
  const rows: Array<{
    loja: string;
    quantidade: number | null;
    minimo: number | null;
    situacao: string;
    preco: number | null;
    codigoInterno: string | null;
  }> = [];

  for (const result of results) {
    for (const store of result.stores) {
      if (onlyBelowMinimum && store.found && store.situation !== 'ABAIXO_DO_MINIMO') {
        continue;
      }
      if (!store.found) {
        rows.push({
          loja: store.storeLabel,
          quantidade: null,
          minimo: null,
          situacao: store.situation === 'ERRO_CONSULTA' ? 'ERRO_CONSULTA' : 'NAO_ENCONTRADO',
          preco: null,
          codigoInterno: null,
        });
        continue;
      }
      if (onlyBelowMinimum && store.situation !== 'ABAIXO_DO_MINIMO') continue;
      rows.push({
        loja: store.storeLabel,
        quantidade: store.currentStock,
        minimo: store.minimumStock,
        situacao: store.situation,
        preco: store.salePrice,
        codigoInterno: store.internalCode,
      });
    }
  }
  return rows;
}

function mapOptionsToRows(options: Array<{ nome: string; sku: string | null; gtin: string | null }>): BlingProductOptionRow[] {
  return options.map((o) => ({ nome: o.nome, sku: o.sku, gtin: o.gtin }));
}

async function queryBySelectedProduct(input: {
  userId: string;
  agentId: string;
  intent: AgentIntent;
  product: BlingProductOptionRow;
}): Promise<BlingStructuredResult> {
  const gtin =
    input.product.gtin && isNumericGtinInput(input.product.gtin)
      ? normalizeGtinInput(input.product.gtin)
      : null;
  const sku = input.product.sku?.trim() || null;

  if (gtin) {
    logAgentSearchMode('GTIN');
    let data = await aggregateStockForAgent({
      userId: input.userId,
      agentId: input.agentId,
      barcodes: [gtin],
      queryMode: 'gtin',
    });
    if (!hasAnyProductFoundInAggregate(data) && sku) {
      logAgentSearchMode('SKU_FALLBACK');
      data = await aggregateStockForAgent({
        userId: input.userId,
        agentId: input.agentId,
        barcodes: [sku],
        queryMode: 'sku',
      });
    }
    return mapStockResponse(input.intent, data);
  }

  if (sku) {
    const data = await aggregateStockForAgent({
      userId: input.userId,
      agentId: input.agentId,
      barcodes: [sku],
      queryMode: 'sku',
    });
    return mapStockResponse(input.intent, data);
  }

  return { kind: 'empty', intent: input.intent, query: input.product.nome };
}

export async function executeBlingQuery(input: {
  userId: string;
  agentId: string;
  intent: AgentIntent;
  content: string;
  conversationId: string;
}): Promise<BlingStructuredResult> {
  const { userId, agentId, intent, content, conversationId } = input;

  const hasTool = await agentHasBlingTool(agentId);
  if (!hasTool) {
    return {
      kind: 'not_configured',
      intent,
      reason: 'Nenhuma ferramenta Bling vinculada a este agente.',
    };
  }

  if (intent === 'ESCOLHA_PRODUTO') {
    const selected = await takeProductDisambiguationChoice(conversationId, content);
    if (!selected) {
      return { kind: 'empty', intent, query: content.trim() };
    }
    return queryBySelectedProduct({
      userId,
      agentId,
      intent: 'CONSULTA_PRODUTO',
      product: selected,
    });
  }

  const request = parseBlingStockRequest(content);
  const filterBelowMinimum = intent === 'LISTA_ABAIXO_MINIMO';

  if (request?.kind === 'name') {
    logAgentSearchMode('NAME');
    logGtinSearchDiagnostic({
      query: request.query,
      mode: 'NAME',
      endpoint: 'findProductOptionsByNameForAgent',
      phase: 'primary',
      candidateCount: 0,
      firstCandidate: null,
      matched: false,
      matchSource: 'engine-name-search',
    });
    const options = await findProductOptionsByNameForAgent({
      userId,
      agentId,
      nameQuery: request.query,
    });
    if (options.length === 0) {
      await clearProductDisambiguation(conversationId);
      return resolveNameSearchEmptyResult({
        userId,
        agentId,
        intent,
        nameQuery: request.query,
      });
    }
    if (options.length === 1) {
      await clearProductDisambiguation(conversationId);
      return queryBySelectedProduct({
        userId,
        agentId,
        intent,
        product: mapOptionsToRows(options)[0]!,
      });
    }
    const rows = mapOptionsToRows(options);
    await saveProductDisambiguation(conversationId, rows);
    return { kind: 'multiple_products', intent, produtos: rows };
  }

  const barcodes =
    request?.kind === 'barcode' || request?.kind === 'sku'
      ? request.queries
      : extractBarcodesFromText(content);

  if (barcodes.length === 0) {
    if (intent === 'RELATORIO' || intent === 'LISTA_ABAIXO_MINIMO') {
      return {
        kind: 'empty',
        intent,
        query: null,
      };
    }
    return { kind: 'empty', intent, query: content.trim() || null };
  }

  const data = await aggregateBarcodeSearchWithPriority({
    userId,
    agentId,
    barcodes,
  });

  const mapped = mapStockResponse(intent, data, filterBelowMinimum);

  if (shouldUsePeraStockSummary(data.barcodes.length) && mapped.kind === 'stock') {
    let downloadUrl: string | null = null;
    let excelGenerationFailed = false;
    try {
      downloadUrl = await createPeraStockExcelExport({ userId, data });
    } catch {
      excelGenerationFailed = true;
    }
    return { ...mapped, downloadUrl, excelGenerationFailed };
  }

  return mapped;
}
