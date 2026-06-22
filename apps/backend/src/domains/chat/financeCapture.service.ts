import { ContextType, MemoryType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type FinanceKind = 'entrada' | 'saida';

export type ParsedFinanceEntry = {
  kind: FinanceKind;
  amount: number;
  note: string;
  context: ContextType;
  happenedAt: Date;
};

function normalizeAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function detectContext(text: string): ContextType {
  const s = text.toLowerCase();
  if (/(moble|cliente|marcenaria|obra|fornecedor|material)/i.test(s)) return ContextType.MOBLE;
  if (/(casa|pessoal|fam[ií]lia|mercado|aluguel)/i.test(s)) return ContextType.PESSOAL;
  return ContextType.GERAL;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseFinanceEntryMessage(text: string): ParsedFinanceEntry | null {
  const s = text.trim().toLowerCase();
  const patterns: Array<{ kind: FinanceKind; regex: RegExp }> = [
    { kind: 'entrada', regex: /^(?:entrada|recebi|recebimento)\s+(?:r\$\s*)?([\d.,]+)\s*(.*)$/i },
    { kind: 'saida', regex: /^(?:saida|saída|paguei|despesa)\s+(?:r\$\s*)?([\d.,]+)\s*(.*)$/i },
  ];
  for (const p of patterns) {
    const m = s.match(p.regex);
    if (!m) continue;
    const amount = normalizeAmount(m[1]);
    if (!amount) return null;
    const note = (m[2] ?? '').trim() || 'Sem descrição';
    return {
      kind: p.kind,
      amount,
      note,
      context: detectContext(s),
      happenedAt: new Date(),
    };
  }
  return null;
}

export async function registerFinanceEntry(params: {
  userId: string;
  entry: ParsedFinanceEntry;
}): Promise<void> {
  const { userId, entry } = params;
  const title = `FINANCEIRO: ${entry.kind.toUpperCase()} R$ ${entry.amount.toFixed(2)}`;
  const content = [
    `tipo=${entry.kind}`,
    `valor=${entry.amount.toFixed(2)}`,
    `descricao=${entry.note}`,
    `data=${entry.happenedAt.toISOString()}`,
  ].join('\n');
  await prisma.memory.create({
    data: {
      userId,
      title,
      content,
      context: entry.context,
      type: MemoryType.PERMANENTE,
    },
  });
}

export async function summarizeFinanceToday(userId: string): Promise<{
  entrada: number;
  saida: number;
  saldo: number;
}> {
  const from = startOfDay(new Date());
  const rows = await prisma.memory.findMany({
    where: {
      userId,
      title: { startsWith: 'FINANCEIRO:' },
      createdAt: { gte: from },
    },
    select: { title: true, content: true },
    take: 500,
  });
  let entrada = 0;
  let saida = 0;
  for (const row of rows) {
    const tipo = row.content.match(/tipo=(entrada|saida)/)?.[1];
    const valor = Number(row.content.match(/valor=([0-9.]+)/)?.[1] ?? 0);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    if (tipo === 'entrada') entrada += valor;
    if (tipo === 'saida') saida += valor;
  }
  return { entrada, saida, saldo: entrada - saida };
}

