export type LeadIntentLevel =
  | 'frio'
  | 'curioso'
  | 'interessado'
  | 'quente'
  | 'pronto_para_fechamento';

export type LeadRecommendedAction =
  | 'responder_normalmente'
  | 'fazer_pergunta_de_qualificacao'
  | 'criar_tarefa'
  | 'salvar_memoria'
  | 'sugerir_visita'
  | 'sugerir_proposta'
  | 'sugerir_imagem_ilustrativa'
  | 'gerar_imagem_ilustrativa'
  | 'escalar_para_humano'
  | 'reativar_lead'
  | 'encerrar_sem_pressao';

export type LeadConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type LeadDecision = {
  leadScore: number;
  readinessScore: number;
  intentLevel: LeadIntentLevel;
  recommendedAction: LeadRecommendedAction;
  reason: string;
  missingInfo: string[];
  nextMessageSuggestion: string;
  shouldCreateTask: boolean;
  shouldSaveMemory: boolean;
  shouldSuggestImage: boolean;
  shouldGenerateImage: boolean;
  shouldEscalateToHuman: boolean;
};

type LeadSignals = {
  hasEnvironment: boolean;
  hasMeasures: boolean;
  hasReference: boolean;
  hasLocation: boolean;
  hasDeadline: boolean;
  hasBudget: boolean;
  hasStyle: boolean;
  hasIntentDirection: boolean;
  wantsImage: boolean;
  hasPayment: boolean;
  hasCompleteProject: boolean;
  asksForHuman: boolean;
  asksForVisit: boolean;
  hasFinalNegotiation: boolean;
  isUnsure: boolean;
  hasRisk: boolean;
  hasColdLeadSignal: boolean;
  hasDirectOrReferredSignal: boolean;
  isFirstCustomerMessage: boolean;
  hasGenericPriceOnly: boolean;
  hasMultipleReplies: boolean;
  usefulCustomerInteractions: number;
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function getCustomerText(conversation: LeadConversationMessage[]): string {
  return normalize(
    conversation
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n'),
  );
}

function getLastCustomerText(conversation: LeadConversationMessage[]): string {
  return normalize([...conversation].reverse().find((message) => message.role === 'user')?.content ?? '');
}

export function isColdLead(msg: string): boolean {
  const normalized = normalize(msg);
  const signals = ['ola', 'oi', 'boa tarde', 'boa noite', 'quanto custa', 'fazem orcamento'];
  return signals.some((signal) => normalized.includes(signal));
}

function isDirectOrReferredLead(msg: string): boolean {
  const normalized = normalize(msg);
  return /(indicacao|indicado|me indicaram|vim por indicacao|vi no instagram|peguei seu contato|tenho projeto|tenho planta|quero fazer|preciso fazer|orcamento para|gostaria de|pode mandar|vou te mandar)/i.test(normalized);
}

function getSignals(conversation: LeadConversationMessage[]): LeadSignals {
  const text = getCustomerText(conversation);
  const last = getLastCustomerText(conversation);
  const userMessages = conversation.filter((message) => message.role === 'user').map((message) => normalize(message.content));
  const userMessageCount = userMessages.length;
  const usefulCustomerInteractions = userMessages.filter((message) =>
    /(cozinha|quarto|suite|banheiro|lavanderia|closet|area gourmet|sala|painel|guarda.?roupa|home office|\d+(?:[,.]\d+)?\s*(m|metro|metros|cm)|\d+\s*x\s*\d+|foto|imagem|referencia|modelo|planta|orcamento|investir|tenho|r\$|\d+\s*(mil|k|reais)|bonito|aproveitar|armario|visualizar|opcao|ideia|nao sei|sem ideia)/i.test(message),
  ).length;

  return {
    hasEnvironment: /(cozinha|quarto|suite|banheiro|lavanderia|closet|area gourmet|sala|painel|guarda.?roupa|home office)/i.test(text),
    hasMeasures: /(\d+(?:[,.]\d+)?\s*(m|metro|metros|cm|centimetro|centimetros)|\d+\s*x\s*\d+)/i.test(text),
    hasReference: /(foto|imagem|referencia|modelo|planta|print|inspira|anexo)/i.test(text),
    hasLocation: /(cidade|bairro|moro em|sou de|fica em|regiao)/i.test(text),
    hasDeadline: /(prazo|urgente|semana|mes que vem|reforma|construindo|obra|mudanca|entregar)/i.test(text),
    hasBudget: /(orcamento|investir|pretendo|tenho|r\$|\d+\s*(mil|k|reais))/i.test(text),
    hasStyle: /(branco|madeira|amadeirado|preto|cinza|ripado|moderno|clean|minimalista|alto padrao|economico)/i.test(text),
    hasIntentDirection: /(painel|rack|apoio lateral|armario|aproveitar espaco|aproveitar o espaco|algo bonito|sala legal|ambiente legal|visualizar|ver alguma ideia|opcao|ideia|mais basico|mais completo|mais trabalhado|clean|funcional|nao sei|sem ideia)/i.test(text),
    wantsImage: /(queria ver|preciso visualizar|nao sei como ficaria|me mostra|mostra uma opcao|pode montar|sim, acho melhor|quero algo bonito|ver alguma ideia|ideia visual)/i.test(last),
    hasPayment: /(pagamento|parcel|cartao|pix|entrada|boleto|a vista)/i.test(text),
    hasCompleteProject: /(casa toda|apartamento inteiro|projeto completo|tenho as plantas|cozinha.*suite|suite.*cozinha)/i.test(text),
    asksForHuman: /(falar|conversar|chamar).{0,40}(humano|pessoa|responsavel|dono|ronan|vendedor|consultor)|nao quero.{0,20}(bot|robo|ia)/i.test(last),
    asksForVisit: /(visita|medir|tirar medida|ir ai|vir aqui|agendar|agenda|tecnica|tecnico)/i.test(last),
    hasFinalNegotiation: /(fechar|fechamos|negociar|negociacao|desconto|contrato|sinal|entrada|aprovar|comecar)/i.test(last),
    isUnsure: /(nao sei|sem ideia|nao tenho ideia|nao decidi|estou em duvida|to em duvida|tenho duvida).{0,60}(quero|fazer|escolher|modelo|estilo|projeto|movel)?/i.test(last),
    hasRisk: /(vou pensar|achei caro|mais barato|ver com meu marido|ver com minha esposa|depois eu vejo|manda so uma media)/i.test(text),
    hasColdLeadSignal: isColdLead(last),
    hasDirectOrReferredSignal: isDirectOrReferredLead(last),
    isFirstCustomerMessage: userMessageCount === 1,
    hasGenericPriceOnly: /^(quanto custa|quanto fica|qual valor|preco)\??$/i.test(last),
    hasMultipleReplies: userMessageCount > 1,
    usefulCustomerInteractions,
  };
}

export function calculateLeadScore(conversation: LeadConversationMessage[]): number {
  const signals = getSignals(conversation);
  let score = 0;

  if (signals.hasEnvironment) score += 20;
  if (signals.hasMeasures) score += 15;
  if (signals.hasReference) score += 15;
  if (signals.hasBudget) score += 20;
  if (signals.hasDeadline) score += 15;
  if (signals.hasMultipleReplies) score += 10;
  if (signals.hasIntentDirection) score += 10;
  if (signals.hasCompleteProject) score += 20;
  if (signals.hasPayment) score += 10;
  if (signals.hasGenericPriceOnly) score -= 20;
  if (signals.hasColdLeadSignal && !signals.hasEnvironment && !signals.hasMeasures && !signals.hasReference) score -= 10;

  return clampScore(score);
}

export function calculateReadinessScore(conversation: LeadConversationMessage[]): number {
  const signals = getSignals(conversation);
  let score = 0;

  if (signals.hasEnvironment) score += 25;
  if (signals.hasMeasures) score += 25;
  if (signals.hasStyle || signals.hasReference || signals.hasIntentDirection) score += 15;
  if (signals.hasDeadline) score += 15;
  if (signals.hasBudget) score += 10;
  if (signals.hasLocation) score += 10;

  return clampScore(score);
}

function getIntentLevel(leadScore: number, readinessScore: number, signals: LeadSignals): LeadIntentLevel {
  if (signals.hasCompleteProject || leadScore >= 90) return 'pronto_para_fechamento';
  if (leadScore >= 75 && readinessScore >= 60) return 'quente';
  if (leadScore >= 55) return 'interessado';
  if (leadScore >= 25) return 'curioso';
  return 'frio';
}

function getMissingInfo(signals: LeadSignals): string[] {
  const missing: string[] = [];
  if (!signals.hasEnvironment) missing.push('ambiente');
  if (!signals.hasMeasures && !signals.hasReference) missing.push('medidas ou referencia');
  if (!signals.hasBudget) missing.push('orcamento');
  if (!signals.hasDeadline) missing.push('prazo');
  if (!signals.hasLocation) missing.push('cidade/bairro');
  return missing;
}

function getRecommendedAction(
  leadScore: number,
  readinessScore: number,
  intentLevel: LeadIntentLevel,
  signals: LeadSignals,
): LeadRecommendedAction {
  if (canGenerateImageFromSignals(leadScore, readinessScore, intentLevel, signals)) return 'gerar_imagem_ilustrativa';
  const completeProjectIsQualified =
    signals.hasCompleteProject &&
    (signals.hasMeasures || signals.hasReference) &&
    (signals.hasBudget || signals.hasDeadline || signals.hasLocation);
  if (signals.isUnsure) return 'fazer_pergunta_de_qualificacao';
  if (signals.asksForHuman || signals.asksForVisit || signals.hasFinalNegotiation || completeProjectIsQualified) {
    return 'escalar_para_humano';
  }
  if (signals.hasRisk) return readinessScore >= 65 ? 'sugerir_imagem_ilustrativa' : 'encerrar_sem_pressao';
  if (!signals.hasEnvironment || (!signals.hasMeasures && !signals.hasReference)) return 'fazer_pergunta_de_qualificacao';
  if (leadScore >= 60 && readinessScore >= 65 && intentLevel !== 'frio' && intentLevel !== 'curioso') return 'sugerir_imagem_ilustrativa';
  if (intentLevel === 'quente' || intentLevel === 'pronto_para_fechamento') return 'sugerir_visita';
  if (leadScore >= 60) return 'sugerir_proposta';
  return 'responder_normalmente';
}

function canGenerateImageFromSignals(
  leadScore: number,
  readinessScore: number,
  intentLevel: LeadIntentLevel,
  signals: LeadSignals,
): boolean {
  void leadScore;
  void readinessScore;
  void intentLevel;
  const hasSufficientVisualContext =
    signals.hasEnvironment && (signals.hasMeasures || signals.hasReference) && (signals.hasIntentDirection || signals.hasStyle);

  return (
    hasSufficientVisualContext &&
    !signals.asksForHuman &&
    !signals.asksForVisit &&
    !signals.hasFinalNegotiation
  );
}

function getNextMessage(action: LeadRecommendedAction, missingInfo: string[], signals: LeadSignals): string {
  if (action === 'fazer_pergunta_de_qualificacao') {
    if (signals.isFirstCustomerMessage && signals.hasColdLeadSignal) {
      return 'Fala, tudo certo? Aqui é da Möble, trabalhamos com marcenaria planejada. Me conta o que você está pensando aí pra gente já te direcionar melhor.';
    }
    if (signals.isFirstCustomerMessage && signals.hasDirectOrReferredSignal) {
      return 'Fala! Tudo certo? Pode mandar.';
    }
    if (signals.isUnsure) {
      return [
        'Perfeito, isso e bem comum. Entao vamos fazer o seguinte: eu te mostro alguns caminhos possiveis e voce ve o que faz mais sentido pra voce.',
        'Com esse espaco da pra seguir mais simples ou mais completo. Voce quer algo mais basico ou ja quer um ambiente mais trabalhado?',
      ].join('\n\n');
    }
    if (missingInfo.includes('ambiente')) {
      return 'Fala! Tudo certo? Me conta qual ambiente voce esta pensando pra gente ja ir direto ao ponto.';
    }
    if (missingInfo.includes('medidas ou referencia')) {
      return 'Boa, ja entendi o caminho. Me manda so a medida aproximada ou uma referencia do que voce imagina?';
    }
    if (missingInfo.includes('orcamento')) {
      return 'Perfeito. Pra eu te direcionar melhor, voce tem uma faixa de investimento em mente?';
    }
    return 'Boa, perfeito. Qual detalhe voce quer priorizar agora: estilo ou prazo?';
  }

  if (action === 'sugerir_imagem_ilustrativa') {
    return 'Boa, com isso que voce me passou ja consigo montar uma ideia visual pra te ajudar a enxergar melhor. Quer que eu te mostre?';
  }

  if (action === 'gerar_imagem_ilustrativa') {
    return [
      'Perfeito. Agora ficou bem claro o que voce esta pensando.',
      'Com esse contexto, ja da pra montar uma solucao bem resolvida.',
      'Vou montar uma ideia visual pra voce enxergar melhor como isso pode ficar.',
    ].join('\n\n');
  }

  if (action === 'escalar_para_humano') {
    return 'Perfeito, entendi. Me manda seu nome e o melhor horario pra gente alinhar esse proximo passo com mais cuidado.';
  }

  if (action === 'sugerir_visita') {
    return 'Boa, ja da pra avancar com mais seguranca. Se fizer sentido pra voce, a gente pode evoluir isso pra um orcamento mais fechado.';
  }

  if (action === 'sugerir_proposta') {
    return 'Com essas informacoes ja da pra organizar uma proposta base. Quer que eu monte um direcionamento inicial pra voce avaliar?';
  }

  if (action === 'encerrar_sem_pressao') {
    return 'Tranquilo, sem problema. Quando quiser retomar, me chama que eu te ajudo a evoluir isso com calma.';
  }

  return 'Boa, perfeito. Me conta um pouco mais do que voce imaginou pra eu te direcionar do jeito certo.';
}

export function analyzeLeadConversation(conversation: LeadConversationMessage[]): LeadDecision {
  const signals = getSignals(conversation);
  const leadScore = calculateLeadScore(conversation);
  const readinessScore = calculateReadinessScore(conversation);
  const intentLevel = getIntentLevel(leadScore, readinessScore, signals);
  const missingInfo = getMissingInfo(signals);
  const recommendedAction = getRecommendedAction(leadScore, readinessScore, intentLevel, signals);

  return {
    leadScore,
    readinessScore,
    intentLevel,
    recommendedAction,
    reason: signals.hasCompleteProject
      ? 'Projeto amplo detectado; escalar apenas se estiver qualificado ou em etapa final.'
      : `Lead ${intentLevel} com prontidao ${readinessScore}.`,
    missingInfo,
    nextMessageSuggestion: getNextMessage(recommendedAction, missingInfo, signals),
    shouldCreateTask: leadScore >= 60 || signals.hasCompleteProject,
    shouldSaveMemory: leadScore >= 45,
    shouldSuggestImage: recommendedAction === 'sugerir_imagem_ilustrativa',
    shouldGenerateImage: recommendedAction === 'gerar_imagem_ilustrativa',
    shouldEscalateToHuman: recommendedAction === 'escalar_para_humano',
  };
}
