import type { ChatMessage } from '../ai/aiProvider.types';

export type RouterCategory = 'marcenaria' | 'financeiro' | 'suporte' | 'administrativo' | 'geral';

export type RouterPhase = 'cumprimentar' | 'descobrir' | 'encaminhar';

const CATEGORY_LABEL: Record<RouterCategory, string> = {
  marcenaria: 'marcenaria',
  financeiro: 'financeiro',
  suporte: 'suporte',
  administrativo: 'administrativo',
  geral: 'atendimento geral',
};

export function getRouterCategoryLabel(category: RouterCategory): string {
  return CATEGORY_LABEL[category];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Classificação leve por palavras-chave — sem LLM, sem lead score. */
export function classifyConversationCategory(text: string): RouterCategory | null {
  const s = normalize(text.trim());
  if (!s) return null;

  const isGreetingOnly =
    /^(oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem)[!.?\s]*$/.test(s) || s.length < 12;
  if (isGreetingOnly) return null;

  if (/movel|moveis|marcenaria|cozinha|armario|planejado|guarda.?roupa|closet|estante|bancada|projeto/.test(s)) {
    return 'marcenaria';
  }
  if (/pagamento|pagar|receber|boleto|financeiro|fatura|parcela|nota fiscal|pix|cobranca|duvida sobre pagamento/.test(s)) {
    return 'financeiro';
  }
  if (/acesso|sistema|login|senha|nao consigo|erro|suporte|bug|aplicativo|site/.test(s)) {
    return 'suporte';
  }
  if (/administrativo|contrato|documento|rh|interno|cadastro/.test(s)) {
    return 'administrativo';
  }

  if (s.length >= 15) return 'geral';
  return null;
}

export function classifyFromConversation(messages: ChatMessage[]): RouterCategory | null {
  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');
  return classifyConversationCategory(userText);
}

export function detectRouterPhase(
  messages: ChatMessage[],
  category: RouterCategory | null,
): RouterPhase {
  const userCount = messages.filter((m) => m.role === 'user').length;
  const assistantCount = messages.filter((m) => m.role === 'assistant').length;

  if (category) return 'encaminhar';
  if (userCount <= 1 && assistantCount === 0) return 'cumprimentar';
  if (assistantCount >= 1) return 'descobrir';
  return 'cumprimentar';
}
