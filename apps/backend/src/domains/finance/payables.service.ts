import { createOlistAccountPayable } from '../integrations/olist.service';

export type CreatePayableInput = {
  userId: string;
  fornecedor: string;
  valor: number;
  vencimento: string;
  observacao?: string;
};

export type CreatePayableResult =
  | { ok: true; sourcePath: string; data: unknown }
  | { ok: false; reason: string; status?: number };

export async function createPayable(data: CreatePayableInput): Promise<CreatePayableResult> {
  const fornecedor = data.fornecedor.trim();
  const vencimento = data.vencimento.trim();

  if (!fornecedor) {
    return { ok: false, reason: 'Informe o fornecedor da conta a pagar.' };
  }
  if (!Number.isFinite(data.valor) || data.valor <= 0) {
    return { ok: false, reason: 'Informe um valor válido para a conta a pagar.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return { ok: false, reason: 'Informe o vencimento no formato YYYY-MM-DD.' };
  }

  return createOlistAccountPayable(data.userId, {
    descricao: fornecedor,
    valor: data.valor,
    dataVencimento: vencimento,
    observacao: data.observacao,
  });
}
