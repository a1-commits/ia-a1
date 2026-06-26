import type { ChatMessage } from '../ai/aiProvider.types';
import type { AgentIntent } from './intentRouter.service';
import type {
  BlingApiErrorKind,
  BlingStructuredResult,
} from '../integrations/blingStructured.types';
import { repairBrokenAccents, sanitizeAgentClientReply } from '../../lib/textEncoding';

const BEAUTIFY_SYSTEM_PROMPT = [
  'Você embeleza mensagens de atendimento.',
  'NUNCA altere números, nomes de produto, nomes de loja, preços, códigos ou quantidades.',
  'NUNCA invente dados.',
  'Apenas torne o texto mais simpático e organizado, mantendo todos os fatos idênticos.',
].join('\n');

const CONVERSATIONAL_SYSTEM_PROMPT = [
  'Você é um atendente cordial e objetivo.',
  'Responda de forma natural e breve.',
  'NUNCA cite nomes de produtos, preços, quantidades em estoque ou códigos de barras.',
  'Se o cliente perguntar sobre produto, estoque ou preço, oriente a enviar o código de barras ou o nome completo do produto para consulta no sistema.',
].join('\n');

export const EMPTY_PRODUCT_MESSAGE =
  'Não encontrei esse produto no sistema.\nConfira o código de barras ou envie o nome completo do produto.';

export const BLING_API_UNAVAILABLE_MESSAGE =
  'Não consegui consultar o Bling agora. Tente novamente em alguns instantes.';

export const BLING_AUTH_ERROR_MESSAGE =
  'Não consegui autenticar no Bling. Verifique a conexão da integração no painel.';

export const LOCAL_AI_UNAVAILABLE_MESSAGE = 'IA local indisponível no momento.';

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

function formatStoreStockBlock(row: {
  loja: string;
  quantidade: number | null;
  minimo: number | null;
  situacao: string;
  preco: number | null;
}): string[] {
  if (row.situacao === 'NAO_ENCONTRADO') {
    return [row.loja, 'Produto não encontrado nesta loja.'];
  }
  if (row.situacao === 'ERRO_CONSULTA') {
    return [row.loja, 'Não consegui consultar esta loja.'];
  }
  const price =
    row.preco !== null && row.preco !== undefined
      ? `R$ ${row.preco.toFixed(2)}`
      : 'Não informado';
  return [
    row.loja,
    `Estoque: ${row.quantidade ?? 0}`,
    `Mínimo: ${row.minimo ?? 0}`,
    `Preço: ${price}`,
  ];
}

function formatStockDeterministic(data: Extract<BlingStructuredResult, { kind: 'stock' }>): string {
  const lines = [
    `Produto: ${data.produto}`,
    data.codigoBarras ? `Código de barras: ${data.codigoBarras}` : null,
    '',
  ].filter((line): line is string => line !== null);

  for (const row of data.estoques) {
    lines.push(...formatStoreStockBlock(row), '');
  }

  if (data.downloadUrl) {
    lines.push(`Planilha completa: ${data.downloadUrl}`);
  }
  return lines.join('\n').trim();
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

function collectStockFactTokens(
  data: Extract<BlingStructuredResult, { kind: 'stock' }>,
): string[] {
  const tokens = [data.produto];
  if (data.codigoBarras) tokens.push(data.codigoBarras);
  if (data.downloadUrl) tokens.push(data.downloadUrl);
  for (const row of data.estoques) {
    tokens.push(row.loja);
    if (row.codigoInterno) tokens.push(row.codigoInterno);
    if (row.quantidade !== null) tokens.push(String(row.quantidade));
    if (row.minimo !== null) tokens.push(String(row.minimo));
    if (row.preco !== null) {
      tokens.push(row.preco.toFixed(2));
      tokens.push(String(row.preco));
    }
    tokens.push(row.situacao);
  }
  return tokens.filter((t) => t.trim().length > 0);
}

function collectBelowMinimumFactTokens(
  data: Extract<BlingStructuredResult, { kind: 'below_minimum' }>,
): string[] {
  const tokens: string[] = [];
  if (data.produto) tokens.push(data.produto);
  for (const item of data.itens) {
    tokens.push(item.loja);
    if (item.produto) tokens.push(item.produto);
    if (item.codigoBarras) tokens.push(item.codigoBarras);
    if (item.codigoInterno) tokens.push(item.codigoInterno);
    if (item.quantidade !== null) tokens.push(String(item.quantidade));
    if (item.minimo !== null) tokens.push(String(item.minimo));
    if (item.preco !== null) {
      tokens.push(item.preco.toFixed(2));
      tokens.push(String(item.preco));
    }
    tokens.push(item.situacao);
  }
  return tokens.filter((t) => t.trim().length > 0);
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

async function tryBeautifyDeterministicReply(
  deterministic: string,
  facts: string[],
): Promise<string> {
  try {
    const beautified = await formatWithLlama([
      { role: 'system', content: BEAUTIFY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Reformule de forma simpática, sem alterar nenhum dado factual:\n\n${deterministic}`,
      },
    ]);
    if (llamaPreservesBlingFacts(beautified, facts)) {
      return beautified;
    }
  } catch {
    // IA indisponível ou resposta inválida — mantém determinístico
  }
  return deterministic;
}

async function formatWithLlama(messages: ChatMessage[]): Promise<string> {
  const { generateAssistantReply, AiUnavailableError } = await import('../ai/aiService');
  try {
    const raw = await generateAssistantReply(messages);
    return sanitizeAgentClientReply(repairBrokenAccents(raw)).trim();
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      throw error;
    }
    throw new AiUnavailableError('IA indisponível');
  }
}

function messageForApiError(errorKind: BlingApiErrorKind): string {
  if (errorKind === 'auth') return BLING_AUTH_ERROR_MESSAGE;
  return BLING_API_UNAVAILABLE_MESSAGE;
}

export async function formatBlingStructuredResponse(
  data: BlingStructuredResult,
  originalMessage: string,
): Promise<string> {
  void originalMessage;

  if (data.kind === 'api_error') {
    return messageForApiError(data.errorKind);
  }

  if (data.kind === 'empty') {
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
    const deterministic = formatBelowMinimumDeterministic(data);
    return tryBeautifyDeterministicReply(deterministic, collectBelowMinimumFactTokens(data));
  }

  if (data.kind === 'stock') {
    const deterministic = formatStockDeterministic(data);
    return tryBeautifyDeterministicReply(deterministic, collectStockFactTokens(data));
  }

  return EMPTY_PRODUCT_MESSAGE;
}

export async function formatConversationalResponse(input: {
  intent: AgentIntent;
  content: string;
  contactDisplayName?: string | null;
}): Promise<string> {
  const nameBit = input.contactDisplayName?.trim()
    ? ` Nome do contato: ${input.contactDisplayName.trim().split(/\s+/)[0]}.`
    : '';

  const intentHint =
    input.intent === 'SAUDACAO'
      ? 'O cliente está cumprimentando. Responda o cumprimento de forma calorosa e breve.'
      : input.intent === 'DESPEDIDA'
        ? 'O cliente está se despedindo. Responda de forma cordial e breve.'
        : input.intent === 'CONVERSA_GERAL'
          ? 'Explique de forma simples que você pode ajudar com consultas de produto e estoque via código de barras ou nome.'
          : 'Responda de forma útil e breve sem inventar dados de produtos.';

  try {
    return await formatWithLlama([
      { role: 'system', content: `${CONVERSATIONAL_SYSTEM_PROMPT}${nameBit}\n${intentHint}` },
      { role: 'user', content: input.content },
    ]);
  } catch {
    if (input.intent === 'SAUDACAO') {
      return input.contactDisplayName?.trim()
        ? `Olá, ${input.contactDisplayName.trim().split(/\s+/)[0]}! Como posso ajudar?`
        : 'Olá! Como posso ajudar?';
    }
    if (input.intent === 'DESPEDIDA') return 'Por nada! Estou à disposição.';
    return LOCAL_AI_UNAVAILABLE_MESSAGE;
  }
}
