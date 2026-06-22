import { createOlistAccountReceivable } from '../integrations/olist.service';

export type CreateReceivableInput = {
  userId: string;
  cliente: string;
  valor: number;
  previsao: string;
  observacao?: string;
};

export type CreateReceivableResult =
  | { ok: true; sourcePath: string; data: unknown }
  | { ok: false; reason: string; status?: number };

export async function createReceivable(data: CreateReceivableInput): Promise<CreateReceivableResult> {
  const cliente = data.cliente.trim();
  const previsao = data.previsao.trim();

  if (!cliente) {
    return { ok: false, reason: 'Informe o cliente da conta a receber.' };
  }
  if (!Number.isFinite(data.valor) || data.valor <= 0) {
    return { ok: false, reason: 'Informe um valor válido para a conta a receber.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previsao)) {
    return { ok: false, reason: 'Informe a previsão no formato YYYY-MM-DD.' };
  }

  return createOlistAccountReceivable(data.userId, {
    descricao: cliente,
    valor: data.valor,
    dataVencimento: previsao,
    observacao: data.observacao,
  });
}
