import type { OlistFinanceItem } from './olist.service';
import {
  createOlistAccountPayable,
  getOlistCardConfig,
  createOlistContact,
  deleteOlistAccountPayable,
  findOlistContactIdByName,
  listOlistAccountsPayable,
  listOlistAccountsReceivable,
  listOlistCategories,
  listOlistCustomers,
  listOlistProducts,
  listOlistQuotes,
  saveOlistCardConfig,
  updateOlistAccountPayableStatus,
  updateOlistAccountReceivableStatus,
} from './olist.service';
import { createPayable } from '../finance/payables.service';
import { createReceivable } from '../finance/receivables.service';

type ErpReadIntent =
  | { kind: 'list_receivable'; search?: string; statusFilter?: 'overdue' }
  | { kind: 'list_payable'; search?: string; statusFilter?: 'overdue' }
  | { kind: 'list_quotes'; search?: string }
  | { kind: 'list_customers'; search?: string }
  | { kind: 'list_products'; search?: string }
  | { kind: 'list_categories'; search?: string }
  | { kind: 'list_overdue'; scope: 'receivable' | 'payable' | 'both' };

type ErpWriteIntent =
  | { kind: 'configure_card_cycle'; cartao: string; fechamentoDia: number; vencimentoDia: number }
  | { kind: 'create_contact'; nome: string }
  | { kind: 'delete_payable'; id?: string; search?: string; valor?: number }
  | { kind: 'create_payable'; descricao: string; valor: number; dataVencimento?: string }
  | { kind: 'create_receivable'; descricao: string; valor: number; dataVencimento?: string }
  | {
      kind: 'settle_with_card';
      id?: string;
      descricao: string;
      valor: number;
      cartao: string;
      dataVencimento?: string;
      acrescimo?: number;
    }
  | { kind: 'mark_payable_paid'; id: string }
  | { kind: 'mark_receivable_received'; id: string };

export type ErpNaturalIntent =
  | { type: 'none' }
  | { type: 'read'; intent: ErpReadIntent }
  | { type: 'write'; intent: ErpWriteIntent }
  | { type: 'erp_hint'; text: string };

function extractQuotedSearch(text: string): string | undefined {
  const m = text.match(/["']([^"']{2,120})["']/);
  if (!m) return undefined;
  return m[1]!.trim();
}

function extractAfterKeyword(text: string): string | undefined {
  const m = text.match(/(?:de|do|da|sobre|com|para)\s+([a-z0-9\u00c0-\u017f\s._-]{2,120})$/i);
  if (!m) return undefined;
  return m[1]!.trim();
}

function normalizeMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
}

const WRITE_VERBS =
  /(criar|crie|cria|cadast(?:r|re)|registre|registrar|lan[cç]a|lanç|lanc|inclu(?:a|ir)?|adicion(?:a|ar|e)|gravar|salvar|nova|novo)/i;

function extractMoney(text: string): number | null {
  const t = text.replace(/\u00a0/g, ' ');
  const mReais = t.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)\s*reais?\b/i);
  if (mReais) {
    const v = normalizeMoney(mReais[1]!);
    if (v != null) return v;
  }
  const mRs = t.match(/r\$\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (mRs) {
    const v = normalizeMoney(mRs[1]!);
    if (v != null) return v;
  }
  const mDe = t.match(/(?:\bde\b|valor|v\.?)\s*(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (mDe) {
    const v = normalizeMoney(mDe[1]!);
    if (v != null) return v;
  }
  const m = t.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})?)/i);
  if (!m) return null;
  return normalizeMoney(m[1]!);
}

function extractDueDate(text: string): string | undefined {
  const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m?.[1]) return m[1];
  const br = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (br) {
    const d = Number(br[1]);
    const month = Number(br[2]);
    const yearRaw = br[3] ? Number(br[3]) : new Date().getFullYear();
    const y = yearRaw < 100 ? yearRaw + 2000 : yearRaw;
    if (d >= 1 && d <= 31 && month >= 1 && month <= 12) {
      return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const named = text.match(/\bdia\s+(\d{1,2})\s+do\s+(\d{1,2})(?:\s+de\s+(\d{2,4}))?\b/i);
  if (named) {
    const d = Number(named[1]);
    const month = Number(named[2]);
    const yearRaw = named[3] ? Number(named[3]) : new Date().getFullYear();
    const y = yearRaw < 100 ? yearRaw + 2000 : yearRaw;
    if (d >= 1 && d <= 31 && month >= 1 && month <= 12) {
      return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return undefined;
}

function extractId(text: string): string | null {
  const a = text.match(/\b(?:id|#)\s*[:=]?\s*(\d+)\b/i);
  if (a) return a[1]!;
  const b = text.match(/\b(\d{2,})\b/);
  return b?.[1] ?? null;
}

function extractExplicitId(text: string): string | null {
  const m = text.match(/\b(?:id|conta)\s*[:=]?\s*(\d+)\b/i);
  return m?.[1] ?? null;
}

function extractCardName(text: string): string | null {
  const m = text.match(/cart[aã]o\s+([a-z0-9\u00c0-\u017f\s._-]{2,80}?)(?:\s+(?:com|para|pra|venc|de|no|na)\b|[.,;]|$)/i);
  const raw = m?.[1]?.trim() ?? '';
  return raw.length >= 2 ? raw : null;
}

function extractSurcharge(text: string): number | null {
  const m = text.match(/(?:acr[eé]scimo|juros|taxa|iof)\s*(?:de|:)?\s*(?:r\$\s*)?([0-9][0-9.,]*)/i);
  if (!m?.[1]) return null;
  return normalizeMoney(m[1]);
}

function extractDayAfterKeyword(text: string, keyword: 'fechamento' | 'vencimento'): number | null {
  const re = new RegExp(`${keyword}\\s*(?:dia)?\\s*(\\d{1,2})`, 'i');
  const m = text.match(re);
  if (!m?.[1]) return null;
  const day = Number(m[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseCardConfigCommand(raw: string): { cartao: string; fechamentoDia: number; vencimentoDia: number } | null {
  const text = raw.trim();
  const base = text.match(/configurar\s+cart[aã]o\s+(.+)/i);
  if (!base?.[1]) return null;
  const fechamentoDia = extractDayAfterKeyword(text, 'fechamento');
  const vencimentoDia = extractDayAfterKeyword(text, 'vencimento');
  if (!fechamentoDia || !vencimentoDia) return null;
  let cardPart = base[1];
  cardPart = cardPart.replace(/[,;.]?\s*fechamento[\s\S]*$/i, '').trim();
  cardPart = cardPart.replace(/\s+/g, ' ').trim();
  if (cardPart.length < 2) return null;
  return { cartao: cardPart, fechamentoDia, vencimentoDia };
}

function computeCardDueDate(cfg: { closingDay: number; dueDay: number }, now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const afterClosing = now.getDate() > cfg.closingDay;
  const dueMonth = afterClosing ? month + 1 : month;
  const dueDate = new Date(year, dueMonth, cfg.dueDay);
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
}

function extractDescription(text: string): string {
  const quoted = extractQuotedSearch(text);
  if (quoted) return quoted;
  const ref = text.match(/(?:referente|ref\.?|sobre|para|hist[oó]rico)\s*[:]?\s*(.+?)(?:\s*\.|)\s*$/i);
  if (ref) return ref[1]!.trim().slice(0, 200);
  const m = text.match(/(?:descricao|descrição)\s*[:=]?\s+(.{3,200})/i);
  if (m) return m[1]!.trim();
  const stripMoney = text.replace(/(?:r\$\s*)?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s*reais?/gi, ' ').trim();
  const afterPagar = stripMoney.split(/contas?\s+a\s+pagar|a\s*pagar|conta\s+a\s*pagar/i);
  if (afterPagar.length > 1) {
    const rest = afterPagar.slice(1).join(' ').replace(/^(?:de|do|da)\s+/i, '').trim();
    if (rest.length > 2) return rest.slice(0, 200);
  }
  return stripMoney.slice(0, 200);
}

/** ISO yyyy-mm-dd ou dd/mm/aaaa */
function parseOlistDate(value: string | null): Date | null {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const br = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const date = new Date(y, m - 1, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function startOfTodayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function isSettledStatus(s: string | null | undefined): boolean {
  if (s == null) return false;
  const t = s.toLowerCase();
  return /(pago|paga|receb|liquid|quit|baix|cancel|estorn|compens|conciliad)/.test(t);
}

/** Conta vencida e aparentemente em aberto (heurística; formatos de ERP variam). */
export function isOverdueOpenFinanceItem(item: OlistFinanceItem, ref: Date = new Date()): boolean {
  if (isSettledStatus(item.situacao)) return false;
  if (item.dataPagamentoRecebimento != null && String(item.dataPagamentoRecebimento).trim() !== '') {
    return false;
  }
  const v = parseOlistDate(item.dataVencimento);
  if (!v) return false;
  const due = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  return due < startOfTodayLocal() && due <= ref;
}

function hasOverdueContext(text: string): boolean {
  return /(conta|t[ií]tulo|duplic|boleto|olist|erp|erp\s*olist|financeir|financas|a\s*receber|a\s*pagar|pagar|receber|fornec|cliente|inadimpl)/i.test(
    text,
  );
}

function hasOverdueKeywords(text: string): boolean {
  if (!hasOverdueContext(text)) return false;
  return /(atras|atraso|vencid|venceram|vencid[oa]|inadimpl|d[eé]bito|n[aã]o\s*(pago|paga|receb|quitad|liquid)|sem\s*pagament)/i.test(
    text,
  );
}

function scopeForOverdue(text: string): 'receivable' | 'payable' | 'both' {
  const t = text;
  const receiv = /(contas?\s+a\s+receber|a\s*receber|receber(?!.*pagar)|recebiment|duplicata.{0,6}receber|o\s*que.*dev(em)?\s*os\s*clientes|entrada(s)?\s*atras)/i.test(t);
  const pay = /(contas?\s+a\s+pagar|a\s*pagar|pagar(?!.*receber)|forneced|sa[ií]da|duplicata.{0,6}pagar)/i.test(t);
  if (receiv && !pay) return 'receivable';
  if (pay && !receiv) return 'payable';
  if (receiv && pay) return 'both';
  return 'both';
}

const hintLancarContaPagar = [
  'Para **incluir** uma **conta a pagar** na Olist, envie tudo em uma linha, por exemplo:',
  'incluir conta a pagar de 150,50 reais referente a energia, vencimento 2025-12-10',
  '',
  'É obrigatório informar o **valor** (ex.: 150,50 ou 150,50 reais) e, de preferência, o que é (após "referente a" / entre aspas).',
  'Depois de processar, o sistema do WhatsApp pede confirmação com o código. No **chat web**, responda com: confirmar E1234 (use o código que enviei).',
].join('\n');

const hintLancarContaReceber = [
  'Para **incluir** uma **conta a receber**, use o **valor** na mensagem, por exemplo:',
  'incluir conta a receber de 200 reais ref. serviço X, vencimento 2025-12-10',
  '',
  'Inclua o valor (reais, R$ ou "de 200"). Depois confirme com o código enviado.',
].join('\n');

const hintBaixaContaExistente = [
  'Para baixar (pagar) uma conta já existente com segurança, informe o **id da conta**.',
  'Exemplo: pagar conta id 12345 com cartão Nubank PJ no valor de 1500',
  '',
  'Sem o id, o agente só consegue criar um novo débito e não baixa a conta original.',
].join('\n');

/**
 * Evita listar cadastro da Olist quando o usuário fala "cliente" em contexto de conversa/roleplay/teste.
 * Consulta real costuma pedir listagem explícita ou menção a ERP/Olist.
 */
function looksLikeListCustomersIntent(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  if (!/\b(clientes?|contatos?)\b/i.test(text)) return false;

  const spurious =
    /(como|que|se|eu|fosse|fingir|simul|teste|role|atuar|imagin|perto de|ideia|funcionalidade|implement|conversar|falar|atendimento).{0,90}\bclientes?\b/i.test(
      text,
    ) ||
    /\bclientes?\b.{0,40}(teste|simul|funcionalidade|ideia|implement|conversar)/i.test(text) ||
    /\b(teste|simul|implement|funcionalidade).{0,80}\bclientes?\b/i.test(text) ||
    /\b(atendimento|trat(e|ar)|falar)\s+(como|como se|igual).{0,30}\bcliente\b/i.test(text) ||
    /\bcomo\s+(um|se)\s+.{0,20}cliente\b/i.test(text);

  if (spurious) return false;

  const explicitList =
    /\b(listar|mostr(ar|a)?|consulta|consultar|buscar|traga|traz|cadastro|base|ver\b|lista)\b/i.test(text) ||
    /\b(clientes|contatos)\s+(no|do|da|na)\s+(erp|olist|tiny|sistema)\b/i.test(text) ||
    /\b(os\s+)?(clientes|contatos)\s+(do\s+erp|da\s+olist|cadastrados)\b/i.test(text) ||
    /^(clientes|contatos)\s*[?:]?\s*$/i.test(text.trim());

  if (explicitList) return true;

  /** Mensagem bem curta começando com “clientes/contatos” pode ser comando rápido */
  const words = raw.trim().split(/\s+/).length;
  if (words <= 6 && /^(clientes?|contatos?)\b/i.test(raw.trim())) return true;

  return false;
}

export function detectErpNaturalIntent(raw: string): ErpNaturalIntent {
  const text = raw.trim().toLowerCase();
  if (!text) return { type: 'none' };

  const createContact =
    raw.match(/(?:cadastre|cadastrar|crie|criar|inclua|incluir)\s+(?:o\s+)?(?:fornecedor|contato|cliente)\s+(.{2,80})/i) ??
    raw.match(/(?:fornecedor|contato|cliente)\s*[:=-]\s*(.{2,80})/i);
  if (createContact) {
    const nome = createContact[1]!.trim().replace(/[.!,;]+$/g, '');
    if (nome.length >= 2) return { type: 'write', intent: { kind: 'create_contact', nome } };
  }

  const cfgCard = parseCardConfigCommand(raw);
  if (cfgCard) {
    return {
      type: 'write',
      intent: { kind: 'configure_card_cycle', cartao: cfgCard.cartao, fechamentoDia: cfgCard.fechamentoDia, vencimentoDia: cfgCard.vencimentoDia },
    };
  }

  const search = extractQuotedSearch(raw) ?? extractAfterKeyword(raw);

  const hasDeleteVerb = /(excluir|exclua|remover|remova|deletar|delete|apagar|cancelar)/i.test(text);
  if (hasDeleteVerb && /(contas?\s+(?:a|de)\s+pagar|conta\s+inclu[ií]da|lancamento|lançamento)/i.test(text)) {
    return {
      type: 'write',
      intent: {
        kind: 'delete_payable',
        id: extractExplicitId(raw) ?? undefined,
        search: search ?? extractDescription(raw),
        valor: extractMoney(raw) ?? undefined,
      },
    };
  }

  const cardName = extractCardName(raw);
  const cardMoney = extractMoney(raw);
  const hasSettleVerb = /(pagar|paga|quit|quitar|baixar|liquidar|acertar|lan[cç]ar)\b/i.test(text);
  const mentionsExistingDebt = /(fornecedor|conta|duplicata|titulo|t[ií]tulo|baixar)/i.test(text);
  const explicitId = extractExplicitId(raw) ?? undefined;
  if (cardName && hasSettleVerb && mentionsExistingDebt && !explicitId) {
    return { type: 'erp_hint', text: hintBaixaContaExistente };
  }
  if (cardName && cardMoney != null && hasSettleVerb) {
    return {
      type: 'write',
      intent: {
        kind: 'settle_with_card',
        id: explicitId,
        descricao: extractDescription(raw).trim(),
        valor: cardMoney,
        cartao: cardName,
        dataVencimento: extractDueDate(raw),
        acrescimo: extractSurcharge(raw) ?? undefined,
      },
    };
  }

  if (/(contas?\s+(?:a|de)\s+receber|receb(imentos?|iveis)|duplicatas?\s+a\s+receber)/i.test(text)) {
    if (WRITE_VERBS.test(text)) {
      const valor = extractMoney(raw);
      const descricao = extractDescription(raw).trim();
      if (!valor) {
        return { type: 'erp_hint', text: hintLancarContaReceber };
      }
      if (descricao.length < 2) {
        return { type: 'erp_hint', text: 'Informe a descrição (ex.: "referente a aluguel" ou texto entre aspas).' };
      }
      return { type: 'write', intent: { kind: 'create_receivable', descricao, valor, dataVencimento: extractDueDate(raw) } };
    }
    if (/(marcar|baixar|recebid[oa]|liquidar|quitad[oa])/i.test(text)) {
      const id = extractId(raw);
      if (!id) return { type: 'none' };
      return { type: 'write', intent: { kind: 'mark_receivable_received', id } };
    }
  }

  if (/(contas?\s+(?:a|de)\s+pagar|pagamentos?|duplicatas?\s+a\s+pagar)/i.test(text)) {
    if (WRITE_VERBS.test(text)) {
      const valor = extractMoney(raw);
      const descricao = extractDescription(raw).trim();
      if (!valor) {
        return { type: 'erp_hint', text: hintLancarContaPagar };
      }
      if (descricao.length < 2) {
        return { type: 'erp_hint', text: 'Inclua o que é a despesa, por exemplo: referente a aluguel, fornecedor X, etc.' };
      }
      return { type: 'write', intent: { kind: 'create_payable', descricao, valor, dataVencimento: extractDueDate(raw) } };
    }
    if (/(marcar|baixar|pag[oa]|liquidar|quitad[oa])/i.test(text)) {
      const id = extractId(raw);
      if (!id) return { type: 'none' };
      return { type: 'write', intent: { kind: 'mark_payable_paid', id } };
    }
  }

  const hasWriteVerb = WRITE_VERBS.test(text);
  const money = extractMoney(raw);
  const hasMoney = money != null;
  const expenseHint = /(abastec|combust|cart[aã]o|fornecedor|despesa|nota fiscal|boleto|aluguel|energia|internet|telefone|imposto|taxa)/i.test(
    text,
  );
  const receivableHint = /(venda|cliente|receb|fatur|cobran|servi[cç]o prestado|entrada)/i.test(text);
  if (hasWriteVerb && hasMoney && expenseHint) {
    const descricao = extractDescription(raw).trim();
    if (descricao.length < 2) return { type: 'erp_hint', text: hintLancarContaPagar };
    return {
      type: 'write',
      intent: { kind: 'create_payable', descricao, valor: money!, dataVencimento: extractDueDate(raw) },
    };
  }
  if (hasWriteVerb && hasMoney && receivableHint) {
    const descricao = extractDescription(raw).trim();
    if (descricao.length < 2) return { type: 'erp_hint', text: hintLancarContaReceber };
    return {
      type: 'write',
      intent: { kind: 'create_receivable', descricao, valor: money!, dataVencimento: extractDueDate(raw) },
    };
  }

  if (hasOverdueKeywords(text)) {
    return { type: 'read', intent: { kind: 'list_overdue', scope: scopeForOverdue(text) } };
  }

  if (/(contas?\s+(?:a|de)\s+receber|receb(imentos?|iveis)|duplicatas?\s+a\s+receber)/i.test(text)) {
    return { type: 'read', intent: { kind: 'list_receivable', search, statusFilter: undefined } };
  }

  if (/(contas?\s+(?:a|de)\s+pagar|pagamentos?|duplicatas?\s+a\s+pagar)/i.test(text)) {
    return { type: 'read', intent: { kind: 'list_payable', search, statusFilter: undefined } };
  }

  if (/(or[cç]amentos?|propostas?)/i.test(text)) {
    return { type: 'read', intent: { kind: 'list_quotes', search } };
  }
  /** Não confundir roleplay/meta (“como cliente”, “simular cliente”) com consulta ao cadastro ERP. */
  if (looksLikeListCustomersIntent(raw)) {
    return { type: 'read', intent: { kind: 'list_customers', search } };
  }
  if (/\b(produtos?|itens|cat[aá]logo)\b/i.test(text)) {
    return { type: 'read', intent: { kind: 'list_products', search } };
  }
  if (/\b(categorias?|categoria)\b/i.test(text)) {
    return { type: 'read', intent: { kind: 'list_categories', search } };
  }
  return { type: 'none' };
}

function toListReply(title: string, sourcePath: string, items: string[], total: number): string {
  const preview = items.length > 0 ? items.join('\n') : '- Sem itens na consulta atual.';
  return `${title}\nFonte: ${sourcePath}\nTotal: ${total}\n${preview}\nSe quiser, eu trago a próxima página.`;
}

function formatFinanceItemLine(x: OlistFinanceItem): string {
  const venc = x.dataVencimento ?? '-';
  return `- ${x.id} | ${x.titulo} | ${x.pessoa ?? 'sem pessoa'} | R$ ${x.valor ?? '-'} | venc. ${venc} | sit. ${x.situacao ?? '-'}`;
}

async function listOverdueItems(
  userId: string,
  kind: 'receivable' | 'payable',
): Promise<
  | { ok: true; items: OlistFinanceItem[]; sourcePath: string; totalFromApi: number }
  | { ok: false; reason: string }
> {
  const r =
    kind === 'receivable'
      ? await listOlistAccountsReceivable({ userId, page: 1, limit: 500, search: undefined })
      : await listOlistAccountsPayable({ userId, page: 1, limit: 500, search: undefined });
  if (!r.ok) return r;
  const overdue = r.items.filter((x) => isOverdueOpenFinanceItem(x));
  overdue.sort((a, b) => {
    const da = parseOlistDate(a.dataVencimento)?.getTime() ?? 0;
    const db = parseOlistDate(b.dataVencimento)?.getTime() ?? 0;
    return da - db;
  });
  return { ok: true, items: overdue, sourcePath: r.sourcePath, totalFromApi: r.total };
}

export async function executeErpReadIntent(
  userId: string,
  intent: ErpReadIntent,
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  if (intent.kind === 'list_overdue') {
    const lines: string[] = [
      'Consulta: contas em atraso (vencimento anterior a hoje, sem data de pagamento/recebimento e situação não aparenta quitada).',
    ];
    if (intent.scope === 'receivable' || intent.scope === 'both') {
      const r = await listOverdueItems(userId, 'receivable');
      if (!r.ok) return r;
      lines.push(
        '',
        `Contas a receber em atraso: ${r.items.length} (endpoint ${r.sourcePath}, registros listados na API: ${r.totalFromApi})`,
        ...(r.items.length > 0 ? r.items.slice(0, 20).map(formatFinanceItemLine) : ['- Nenhuma em atraso por esta regra.']),
      );
    }
    if (intent.scope === 'payable' || intent.scope === 'both') {
      const r = await listOverdueItems(userId, 'payable');
      if (!r.ok) return r;
      lines.push(
        '',
        `Contas a pagar em atraso: ${r.items.length} (endpoint ${r.sourcePath}, registros listados na API: ${r.totalFromApi})`,
        ...(r.items.length > 0 ? r.items.slice(0, 20).map(formatFinanceItemLine) : ['- Nenhuma em atraso por esta regra.']),
      );
    }
    lines.push(
      '',
      'Se o número acima não bate com o ERP, confira o formato das datas e da situação no cadastro. Posso listar a próxima página de títulos brutos, se quiser.',
    );
    return { ok: true, reply: lines.join('\n') };
  }

  if (intent.kind === 'list_receivable') {
    if (intent.statusFilter === 'overdue') {
      const r = await listOverdueItems(userId, 'receivable');
      if (!r.ok) return r;
      return {
        ok: true,
        reply: toListReply(
          'Contas a receber (somente em atraso)',
          r.sourcePath,
          r.items.slice(0, 15).map(formatFinanceItemLine),
          r.items.length,
        ),
      };
    }
    const r = await listOlistAccountsReceivable({ userId, search: intent.search, page: 1, limit: 10 });
    if (!r.ok) return r;
    return {
      ok: true,
      reply: toListReply(
        'Contas a receber',
        r.sourcePath,
        r.items.map((x) => formatFinanceItemLine(x)),
        r.total,
      ),
    };
  }
  if (intent.kind === 'list_payable') {
    if (intent.statusFilter === 'overdue') {
      const r = await listOverdueItems(userId, 'payable');
      if (!r.ok) return r;
      return {
        ok: true,
        reply: toListReply(
          'Contas a pagar (somente em atraso)',
          r.sourcePath,
          r.items.slice(0, 15).map(formatFinanceItemLine),
          r.items.length,
        ),
      };
    }
    const r = await listOlistAccountsPayable({ userId, search: intent.search, page: 1, limit: 10 });
    if (!r.ok) return r;
    return {
      ok: true,
      reply: toListReply(
        'Contas a pagar',
        r.sourcePath,
        r.items.map((x) => formatFinanceItemLine(x)),
        r.total,
      ),
    };
  }
  if (intent.kind === 'list_quotes') {
    const r = await listOlistQuotes({ userId, search: intent.search, page: 1, limit: 10 });
    if (!r.ok) return r;
    return {
      ok: true,
      reply: toListReply(
        'Orçamentos',
        r.sourcePath,
        r.items.map((x) => `- ${x.id} | ${x.titulo} | ${x.pessoa ?? 'sem pessoa'} | R$ ${x.valor ?? '-'} | ${x.situacao ?? '-'}`),
        r.total,
      ),
    };
  }
  if (intent.kind === 'list_customers') {
    const r = await listOlistCustomers({ userId, search: intent.search, page: 1, limit: 10 });
    if (!r.ok) return r;
    return {
      ok: true,
      reply: toListReply(
        'Clientes',
        r.sourcePath,
        r.items.map((x) => `- ${x.id} | ${x.nome} | ${x.documento ?? 'sem documento'} | ${x.situacao ?? '-'}`),
        r.total,
      ),
    };
  }
  if (intent.kind === 'list_products') {
    const r = await listOlistProducts({ userId, search: intent.search, page: 1, limit: 10 });
    if (!r.ok) return r;
    return {
      ok: true,
      reply: toListReply(
        'Produtos',
        r.sourcePath,
        r.items.map((x) => `- ${x.id} | ${x.nome} | ${x.documento ?? 'sem SKU'} | ${x.situacao ?? '-'}`),
        r.total,
      ),
    };
  }
  const r = await listOlistCategories({
    userId,
    search: intent.search,
    page: 1,
    limit: 10,
    sort: 'descricao',
    order: 'asc',
  });
  if (!r.ok) return r;
  return {
    ok: true,
    reply: `Categorias\nTotal: ${r.total}\n${r.categories.map((x) => `- ${x.id} | ${x.descricao}`).join('\n') || '- Sem itens.'}`,
  };
}

export function summarizeWriteIntent(intent: ErpWriteIntent): string {
  if (intent.kind === 'configure_card_cycle') {
    return `Configurar cartão "${intent.cartao}" com fechamento dia ${intent.fechamentoDia} e vencimento dia ${intent.vencimentoDia}`;
  }
  if (intent.kind === 'create_contact') {
    return `Criar fornecedor/contato: "${intent.nome}"`;
  }
  if (intent.kind === 'delete_payable') {
    if (intent.id) return `Excluir conta a pagar id ${intent.id}`;
    return `Excluir última conta a pagar relacionada a "${intent.search ?? 'filtro informado'}"`;
  }
  if (intent.kind === 'settle_with_card') {
    const total = intent.valor + (intent.acrescimo ?? 0);
    return `Pagar despesa no cartão "${intent.cartao}" e criar débito da fatura (R$ ${total.toFixed(2)})${
      intent.dataVencimento ? ` com vencimento ${intent.dataVencimento}` : ''
    }`;
  }
  if (intent.kind === 'create_payable') {
    return `Criar conta a pagar: "${intent.descricao}" no valor de R$ ${intent.valor.toFixed(2)}${intent.dataVencimento ? ` com vencimento ${intent.dataVencimento}` : ''}`;
  }
  if (intent.kind === 'create_receivable') {
    return `Criar conta a receber: "${intent.descricao}" no valor de R$ ${intent.valor.toFixed(2)}${intent.dataVencimento ? ` com vencimento ${intent.dataVencimento}` : ''}`;
  }
  if (intent.kind === 'mark_payable_paid') return `Marcar conta a pagar ${intent.id} como paga`;
  return `Marcar conta a receber ${intent.id} como recebida`;
}

export async function executeErpWriteIntent(
  userId: string,
  intent: ErpWriteIntent,
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  if (intent.kind === 'configure_card_cycle') {
    const saved = await saveOlistCardConfig({
      userId,
      cardName: intent.cartao,
      closingDay: intent.fechamentoDia,
      dueDay: intent.vencimentoDia,
    });
    if (!saved.ok) return saved;
    return {
      ok: true,
      reply: `Cartão "${saved.config.cardName}" configurado: fechamento dia ${saved.config.closingDay} e vencimento dia ${saved.config.dueDay}.`,
    };
  }
  if (intent.kind === 'create_contact') {
    const r = await createOlistContact({ userId, nome: intent.nome });
    if (!r.ok) return r;
    return { ok: true, reply: `Fornecedor/contato "${intent.nome}" criado com sucesso (endpoint: ${r.sourcePath}).` };
  }
  if (intent.kind === 'delete_payable') {
    let targetId: string | null = intent.id ?? null;
    if (!targetId) {
      const listed = await listOlistAccountsPayable({
        userId,
        search: intent.search,
        page: 1,
        limit: 20,
      });
      let items: OlistFinanceItem[] = [];
      if (listed.ok) {
        items = listed.items;
      }
      if (items.length === 0) {
        const fallback = await listOlistAccountsPayable({
          userId,
          page: 1,
          limit: 50,
        });
        if (!fallback.ok) return fallback;
        items = fallback.items;
      }
      if (Number.isFinite(intent.valor ?? Number.NaN)) {
        const v = intent.valor!;
        const filtered = items.filter((x) => Number.isFinite(x.valor ?? Number.NaN) && Math.abs((x.valor ?? 0) - v) < 0.01);
        if (filtered.length > 0) items = filtered;
      }
      if (intent.search && intent.search.trim().length > 0) {
        const words = intent.search
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 3 && !['conta', 'contas', 'pagar', 'cartao', 'cartão', 'ultima', 'última', 'incluida', 'incluída'].includes(w));
        if (words.length > 0) {
          const filtered = items.filter((x) => {
            const hay = `${x.titulo} ${x.pessoa ?? ''}`.toLowerCase();
            return words.every((w) => hay.includes(w));
          });
          if (filtered.length > 0) items = filtered;
        }
      }
      const pick = items[0];
      if (!pick?.id) {
        return { ok: false, reason: 'Não encontrei conta a pagar para excluir com os filtros informados.' };
      }
      targetId = String(pick.id);
    }
    const deleted = await deleteOlistAccountPayable({ userId, id: targetId });
    if (!deleted.ok) return deleted;
    return {
      ok: true,
      reply:
        `Conta a pagar ${targetId} marcada como excluída (exclusão lógica) com sucesso ` +
        `(endpoint: ${deleted.sourcePath}).`,
    };
  }
  if (intent.kind === 'settle_with_card') {
    if (intent.id) {
      return {
        ok: false,
        reason:
          `Não foi executado: a API disponível não expõe baixa/cancelamento para contas a pagar (id ${intent.id}). ` +
          'Para evitar inconsistência, o agente não cria débito no cartão quando a baixa da conta original não pode ser concluída.',
      };
    }
    const total = intent.valor + (intent.acrescimo ?? 0);
    const contactName = `Cartão ${intent.cartao}`;
    let dueDate = intent.dataVencimento;
    if (!dueDate) {
      const cfg = await getOlistCardConfig({ userId, cardName: intent.cartao });
      if (cfg.ok) dueDate = computeCardDueDate({ closingDay: cfg.config.closingDay, dueDay: cfg.config.dueDay });
    }
    if (!dueDate) {
      return {
        ok: false,
        reason:
          `Data de vencimento não informada e cartão "${intent.cartao}" sem configuração. ` +
          `Use: configurar cartão ${intent.cartao} fechamento dia X vencimento dia Y`,
      };
    }
    let contactId: number | null = null;
    const found = await findOlistContactIdByName({ userId, nome: contactName });
    if (found.ok) {
      contactId = found.id;
    } else {
      const created = await createOlistContact({ userId, nome: contactName });
      if (created.ok) {
        const refetch = await findOlistContactIdByName({ userId, nome: contactName });
        if (refetch.ok) contactId = refetch.id;
      }
    }
    if (contactId == null) {
      return { ok: false, reason: `Não consegui localizar/criar o contato do cartão "${contactName}".` };
    }
    const create = await createOlistAccountPayable(userId, {
      contatoId: contactId,
      descricao: `Fatura ${contactName} ref. ${intent.descricao}`,
      valor: total,
      dataVencimento: dueDate,
      observacao: intent.id ? `origem:${intent.id}` : undefined,
    });
    if (!create.ok) return create;
    const settleNote = 'Conta original não foi baixada (id não informado).';
    return {
      ok: true,
      reply:
        `Lançamento no cartão processado.\n` +
        `- Novo débito criado em ${contactName}: R$ ${total.toFixed(2)} (endpoint: ${create.sourcePath})\n` +
        `- ${settleNote}`,
    };
  }
  if (intent.kind === 'create_payable') {
    const r = await createPayable({
      userId,
      fornecedor: intent.descricao,
      valor: intent.valor,
      vencimento: intent.dataVencimento ?? '',
    });
    if (!r.ok) return r;
    const proof = JSON.stringify(r.data ?? {}).slice(0, 220);
    return {
      ok: true,
      reply: `Conta a pagar criada com sucesso (endpoint: ${r.sourcePath}). Comprovante técnico: ${proof}`,
    };
  }
  if (intent.kind === 'create_receivable') {
    const r = await createReceivable({
      userId,
      cliente: intent.descricao,
      valor: intent.valor,
      previsao: intent.dataVencimento ?? '',
    });
    if (!r.ok) return r;
    const proof = JSON.stringify(r.data ?? {}).slice(0, 220);
    return {
      ok: true,
      reply: `Conta a receber criada com sucesso (endpoint: ${r.sourcePath}). Comprovante técnico: ${proof}`,
    };
  }
  if (intent.kind === 'mark_payable_paid') {
    const r = await updateOlistAccountPayableStatus(userId, {
      id: intent.id,
      situacao: 'paga',
      observacao: 'Atualização via WhatsApp admin',
    });
    if (!r.ok) return r;
    return { ok: true, reply: `Conta a pagar ${intent.id} atualizada para paga (endpoint: ${r.sourcePath}).` };
  }
  const r = await updateOlistAccountReceivableStatus(userId, {
    id: intent.id,
    situacao: 'recebida',
    observacao: 'Atualização via WhatsApp admin',
  });
  if (!r.ok) return r;
  return { ok: true, reply: `Conta a receber ${intent.id} atualizada para recebida (endpoint: ${r.sourcePath}).` };
}
