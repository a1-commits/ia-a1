import { extractBarcodesFromText, extractNameQueryFromText, parseBlingStockRequest } from '../integrations/blingProductSearch';

export type AgentIntent =
  | 'SAUDACAO'
  | 'CONSULTA_CODIGO_BARRAS'
  | 'CONSULTA_PRODUTO'
  | 'CONSULTA_ESTOQUE'
  | 'CONSULTA_PRECO'
  | 'LISTA_ABAIXO_MINIMO'
  | 'RELATORIO'
  | 'ESCOLHA_PRODUTO'
  | 'CONVERSA_GERAL'
  | 'DESPEDIDA'
  | 'OUTROS';

const STANDALONE_SAUDACAO_RE =
  /^(oi|ol[aá]|hey|e\s*a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|salve|opa)[!.?\s]*$/iu;
const DESPEDIDA_RE =
  /^(obrigad[oa]|valeu|at[eé]\s+(mais|logo)|tchau|flw|falou|at[eé])\b/i;
const CONVERSA_GERAL_RE =
  /(como\s+funciona|o\s+que\s+(voc[eê]s|vc)\s+faz|quem\s+[eé]\s+voc[eê]|me\s+explica|como\s+pedir|como\s+consult)/i;
const PRECO_RE = /pre[cç]o|valor|quanto\s+custa|quanto\s+[eé]|custa\s+quanto/i;
const ESTOQUE_RE = /estoque|saldo|quantidade|tem\s+(esse|este|o)\s+produto|dispon[ií]vel/i;
const ABAIXO_MINIMO_RE = /abaixo\s+do\s+m[ií]nimo|estoque\s+m[ií]nimo|ruptura|m[ií]nimo/i;
const RELATORIO_RE = /relat[oó]rio|resumo\s+(de\s+)?estoque|exportar|planilha/i;

const BLING_INTENTS = new Set<AgentIntent>([
  'CONSULTA_CODIGO_BARRAS',
  'CONSULTA_PRODUTO',
  'CONSULTA_ESTOQUE',
  'CONSULTA_PRECO',
  'LISTA_ABAIXO_MINIMO',
  'RELATORIO',
  'ESCOLHA_PRODUTO',
]);

export function intentRequiresBling(intent: AgentIntent): boolean {
  return BLING_INTENTS.has(intent);
}

export function classifyIntent(content: string, options?: { hasPendingProductChoice?: boolean }): AgentIntent {
  const text = content.trim();
  if (!text) return 'OUTROS';

  if (options?.hasPendingProductChoice && /^\d{1,2}$/.test(text)) {
    return 'ESCOLHA_PRODUTO';
  }

  const barcodes = extractBarcodesFromText(text);
  const parsed = parseBlingStockRequest(text);
  const hasProductSignal = Boolean(
    barcodes.length > 0 ||
      parsed?.kind === 'name' ||
      parsed?.kind === 'sku' ||
      extractNameQueryFromText(text),
  );

  if (RELATORIO_RE.test(text) && (hasProductSignal || barcodes.length > 1)) {
    return 'RELATORIO';
  }

  if (barcodes.length > 0) {
    if (ABAIXO_MINIMO_RE.test(text)) return 'LISTA_ABAIXO_MINIMO';
    if (PRECO_RE.test(text)) return 'CONSULTA_PRECO';
    if (ESTOQUE_RE.test(text)) return 'CONSULTA_ESTOQUE';
    return 'CONSULTA_CODIGO_BARRAS';
  }

  if (STANDALONE_SAUDACAO_RE.test(text)) return 'SAUDACAO';
  if (DESPEDIDA_RE.test(text)) return 'DESPEDIDA';
  if (CONVERSA_GERAL_RE.test(text)) return 'CONVERSA_GERAL';

  if (parsed?.kind === 'name' || parsed?.kind === 'sku' || extractNameQueryFromText(text)) {
    if (ABAIXO_MINIMO_RE.test(text)) return 'LISTA_ABAIXO_MINIMO';
    if (PRECO_RE.test(text)) return 'CONSULTA_PRECO';
    if (ESTOQUE_RE.test(text)) return 'CONSULTA_ESTOQUE';
    return 'CONSULTA_PRODUTO';
  }

  if (RELATORIO_RE.test(text)) return 'RELATORIO';
  if (ABAIXO_MINIMO_RE.test(text)) return 'LISTA_ABAIXO_MINIMO';

  return 'OUTROS';
}
