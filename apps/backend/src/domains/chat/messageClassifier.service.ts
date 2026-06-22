export type MobiMessageClass = 'financeiro' | 'comercial' | 'tarefa' | 'geral';

export function classifyMessage(msg: string): MobiMessageClass {
  const text = msg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/(pagar|receber|vencimento|previsao|boleto|pix|valor|r\$|\d+[,.]?\d*\s*reais)/i.test(text)) {
    return 'financeiro';
  }

  if (/(cliente|lead|orcamento|proposta|visita|fechamento|medida|medidas|movel|moveis|cozinha|quarto|banheiro|marcenaria)/i.test(text)) {
    return 'comercial';
  }

  if (/(depois|ver isso|pendencia|pendente|preciso|tenho que|lembrar|agendar|fazer|cobrar|retornar)/i.test(text)) {
    return 'tarefa';
  }

  return 'geral';
}
