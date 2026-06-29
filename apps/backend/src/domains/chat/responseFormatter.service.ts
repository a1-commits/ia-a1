import type { AgentIntent } from './intentRouter.service';
import type {
  BlingApiErrorKind,
  BlingStructuredResult,
} from '../integrations/blingStructured.types';
import { extractBarcodesFromText } from '../integrations/blingProductSearch';
import {
  collectStockConsultedStores,
  formatStockBulkResponse,
  formatStockDetailedResponse,
  STOCK_BLOCK_SEPARATOR,
  STOCK_QUERY_COMPLETE_MESSAGE,
} from './stockResponseFormat';
import { buildStockBulkStats, resolveStockDisplayMode } from './stockDisplayMode';

export const ROBO_COP_GREETING_MESSAGE = `Olá! 👋

Sou o Robô-COP.

Informe o(s) código(s) de barras que deseja consultar.`;

export const NO_BARCODE_IDENTIFIED_MESSAGE = `Não consegui identificar nenhum código de barras.

Envie um ou mais códigos para consulta.`;

export const EMPTY_PRODUCT_MESSAGE =
  'Não encontrei esse produto no sistema.\nConfira o código de barras ou envie o nome completo do produto.';

export const BLING_API_UNAVAILABLE_MESSAGE =
  'Não consegui consultar o Bling agora. Tente novamente em alguns instantes.';

export const BLING_AUTH_ERROR_MESSAGE =
  'Não consegui autenticar no Bling. Verifique a conexão da integração no painel.';

function formatMultipleProductsDeterministic(
  produtos: Array<{ nome: string }>,
): string {
  const lines = produtos.map((p, i) => `${i + 1} - ${p.nome}`);
  return [
    'Encontrei mais de um produto.',
    '',
    ...lines,
    '',
    'Responda apenas com o número da opção desejada.',
  ].join('\n');
}

function formatStockDeterministic(data: Extract<BlingStructuredResult, { kind: 'stock' }>): string {
  const stats = buildStockBulkStats(data.produtos);
  const displayMode = resolveStockDisplayMode(stats.produtosEncontrados);
  if (displayMode === 'bulk') {
    return formatStockBulkResponse({
      stats,
      lojas: collectStockConsultedStores(data.produtos),
      downloadUrl: data.downloadUrl,
      excelGenerationFailed: data.excelGenerationFailed,
    });
  }
  return formatStockDetailedResponse(data.produtos);
}

function formatBelowMinimumDeterministic(
  data: Extract<BlingStructuredResult, { kind: 'below_minimum' }>,
): string {
  const lines = [
    data.produto ? `Produto: ${data.produto}` : 'Itens abaixo do estoque mínimo:',
    '',
    ...data.itens.map((item) => {
      const qty = item.quantidade ?? 0;
      const min = item.minimo ?? 0;
      const price =
        item.preco !== null && item.preco !== undefined
          ? ` — Preço: R$ ${item.preco.toFixed(2)}`
          : '';
      return `• ${item.loja}: ${qty} un. (mín. ${min}) — ${item.situacao}${price}`;
    }),
  ];
  return lines.join('\n');
}

function normalizeForFactMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function llamaPreservesBlingFacts(beautified: string, facts: string[]): boolean {
  const normalizedReply = normalizeForFactMatch(beautified);
  for (const fact of facts) {
    const trimmed = fact.trim();
    if (!trimmed) continue;
    const normalizedFact = normalizeForFactMatch(trimmed);
    if (normalizedReply.includes(normalizedFact)) continue;
    if (beautified.includes(trimmed)) continue;
    const priceMatch = /^(\d+)\.(\d{2})$/.exec(trimmed);
    if (priceMatch) {
      const alt = `${priceMatch[1]},${priceMatch[2]}`;
      if (normalizedReply.includes(alt) || beautified.includes(alt)) continue;
    }
    return false;
  }
  return true;
}

function messageForApiError(errorKind: BlingApiErrorKind): string {
  if (errorKind === 'auth') return BLING_AUTH_ERROR_MESSAGE;
  return BLING_API_UNAVAILABLE_MESSAGE;
}

function shouldReportNoBarcode(
  data: Extract<BlingStructuredResult, { kind: 'empty' }>,
  originalMessage: string,
): boolean {
  if (extractBarcodesFromText(originalMessage).length > 0) {
    return false;
  }

  if (data.intent === 'CONSULTA_PRODUTO' && data.query && data.query.trim().length >= 2) {
    return false;
  }

  return true;
}

export async function formatBlingStructuredResponse(
  data: BlingStructuredResult,
  originalMessage: string,
): Promise<string> {
  if (data.kind === 'api_error') {
    return messageForApiError(data.errorKind);
  }

  if (data.kind === 'empty') {
    if (shouldReportNoBarcode(data, originalMessage)) {
      return NO_BARCODE_IDENTIFIED_MESSAGE;
    }
    return EMPTY_PRODUCT_MESSAGE;
  }

  if (data.kind === 'not_configured') {
    return `${data.reason} Configure a integração Bling no painel de ferramentas do agente.`;
  }

  if (data.kind === 'multiple_products') {
    return formatMultipleProductsDeterministic(data.produtos);
  }

  if (data.kind === 'below_minimum') {
    if (data.itens.length === 0) {
      return 'Nenhum item abaixo do estoque mínimo foi encontrado para esta consulta.';
    }
    return formatBelowMinimumDeterministic(data);
  }

  if (data.kind === 'stock') {
    return formatStockDeterministic(data);
  }

  return EMPTY_PRODUCT_MESSAGE;
}

export function formatConversationalResponse(input: {
  intent: AgentIntent;
  content: string;
  contactDisplayName?: string | null;
}): string {
  void input.content;
  void input.contactDisplayName;

  if (input.intent === 'SAUDACAO') {
    return ROBO_COP_GREETING_MESSAGE;
  }

  if (input.intent === 'DESPEDIDA') {
    return STOCK_QUERY_COMPLETE_MESSAGE;
  }

  return NO_BARCODE_IDENTIFIED_MESSAGE;
}

export { STOCK_BLOCK_SEPARATOR };
