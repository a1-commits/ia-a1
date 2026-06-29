import type {
  BlingStockBulkStats,
  BlingStockProductBlock,
  BlingStoreStockRow,
} from '../integrations/blingStructured.types';
import { formatBrazilianSalePrice } from '../integrations/blingProductSearch';

export const STOCK_BLOCK_SEPARATOR = '━━━━━━━━━━━━━━';

export const STOCK_QUERY_COMPLETE_MESSAGE = `Consulta concluída.

Pode enviar novos códigos quando desejar.`;

function asInteger(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.trunc(value);
}

function buildStoreStockBlockLines(row: BlingStoreStockRow): string[] {
  const lines: string[] = [
    STOCK_BLOCK_SEPARATOR,
    `🏪 ${row.loja}`,
    '',
  ];

  if (row.situacao === 'NAO_ENCONTRADO') {
    lines.push('❌ Produto não encontrado nesta loja.');
    return lines;
  }

  if (row.situacao === 'ERRO_CONSULTA') {
    lines.push('⚠ Não foi possível consultar esta loja.');
    return lines;
  }

  lines.push(`Preço: ${formatBrazilianSalePrice(row.preco)}`);

  const qty = row.quantidade;
  if (qty !== null && qty !== undefined) {
    lines.push(`Estoque: ${asInteger(qty)}`);
    if (qty < 0) {
      lines.push('');
      lines.push('⚠ Estoque negativo');
    }
  } else {
    lines.push('Estoque: 0');
  }

  const min = row.minimo;
  if (min !== null && min !== undefined) {
    lines.push(`Estoque mínimo: ${asInteger(min)}`);
  } else {
    lines.push('Estoque mínimo: 0');
  }

  const belowMinimum =
    row.situacao === 'ABAIXO_DO_MINIMO' ||
    (qty !== null && min !== null && qty >= 0 && qty < min);
  if (belowMinimum) {
    lines.push('');
    lines.push('⚠ Abaixo do estoque mínimo');
  }

  return lines;
}

function buildStockProductBlockLines(product: BlingStockProductBlock): string[] {
  const lines: string[] = [
    `Código: ${product.codigoBarras}`,
    '',
    'Produto:',
    product.produto,
    '',
  ];

  for (const row of product.estoques) {
    lines.push(...buildStoreStockBlockLines(row));
  }

  return lines;
}

export function formatStockProductBlock(product: BlingStockProductBlock): string {
  return buildStockProductBlockLines(product).join('\n');
}

export function formatStockDetailedResponse(produtos: BlingStockProductBlock[]): string {
  const lines: string[] = [];

  for (let index = 0; index < produtos.length; index++) {
    if (index > 0) {
      lines.push('');
      lines.push('');
    }
    lines.push(...buildStockProductBlockLines(produtos[index]!));
  }

  return `${lines.join('\n')}\n\n${STOCK_QUERY_COMPLETE_MESSAGE}`;
}

export function collectStockConsultedStores(produtos: BlingStockProductBlock[]): string[] {
  const labels = new Set<string>();
  for (const product of produtos) {
    for (const row of product.estoques) {
      labels.add(row.loja);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function formatStockBulkResponse(input: {
  stats: BlingStockBulkStats;
  lojas: string[];
  downloadUrl?: string | null;
  excelGenerationFailed?: boolean;
}): string {
  void input.stats;
  void input.lojas;
  void input.excelGenerationFailed;

  const lines = [STOCK_QUERY_COMPLETE_MESSAGE];

  if (input.downloadUrl) {
    lines.push(
      '',
      '📄 A planilha completa foi gerada.',
      '',
      '⬇️ Download:',
      input.downloadUrl,
    );
  }

  return lines.join('\n');
}

export const STOCK_BULK_WHATSAPP_ATTACHMENT_FOOTER =
  '📄 A planilha foi enviada junto desta conversa.';

export function transformBulkReplyForWhatsappAttachment(text: string): string {
  const replaced = text.replace(
    /\n*📄 A planilha completa foi gerada\.\s*\n+\s*⬇️ Download:\s*\n+\S+/,
    `\n\n${STOCK_BULK_WHATSAPP_ATTACHMENT_FOOTER}`,
  );

  return replaced.replace(/\/api\/exports\/[^\s]+/g, '').trimEnd();
}
