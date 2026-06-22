import { ContextType, MessageRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { analyzeLeadConversation } from '../../ai/lead-decision-engine';

type CustomerProject = {
  ambiente?: string;
  medidas?: string;
  intencao?: string;
  itensPrincipais?: string[];
  orcamento?: string;
  estilo?: string;
  linhaSugerida?: 'Basic' | 'Confort' | 'Select';
  status?: string;
  ultimaAcao?: string;
  imagemGerada?: boolean;
  propostaGerada?: boolean;
};

type CustomerContextRecord = {
  id: string;
  userId: string;
  phone: string | null;
  whatsappId: string | null;
  name: string | null;
  lastConversationId: string | null;
  lastInteractionAt: Date | null;
  currentProject: CustomerProject | null;
  conversationSummary: string | null;
  pendingQuestions: string[] | null;
  nextSuggestedAction: string | null;
  status: string;
};

const customerContextModel = (prisma as unknown as {
  customerContext: {
    findFirst: (args: unknown) => Promise<CustomerContextRecord | null>;
    create: (args: unknown) => Promise<CustomerContextRecord>;
    update: (args: unknown) => Promise<CustomerContextRecord>;
  };
}).customerContext;

function normalizePhone(phone?: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits.length > 0 ? digits : null;
}

function getUserText(messages: Array<{ role: MessageRole; content: string }>): string {
  return messages
    .filter((message) => message.role === MessageRole.USER)
    .map((message) => message.content)
    .join('\n');
}

function extractFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ?? match?.[0];
    if (value) return value.trim().slice(0, 160);
  }
  return undefined;
}

function inferProject(messages: Array<{ role: MessageRole; content: string }>, previous?: CustomerProject | null): CustomerProject {
  const text = getUserText(messages);
  const ambiente = extractFirst(text, [
    /(sala de tv|cozinha|quarto|su[ií]te|banheiro|lavanderia|closet|[aá]rea gourmet|sala|painel|guarda.?roupa|home office)/i,
  ]);
  const medidas = extractFirst(text, [
    /(\d+(?:[,.]\d+)?\s*(?:m|metro|metros|cm|cent[ií]metro|cent[ií]metros))/i,
    /(\d+\s*x\s*\d+(?:\s*(?:m|metros))?)/i,
  ]);
  const intencao = extractFirst(text, [
    /(painel|apoio lateral|apoio para pratos|apoio de prato|copos|rack|arm[aá]rio|gavetas?|aproveitar espa[cç]o|sala legal|algo bonito|clean|funcional|trabalhado)/i,
  ]);
  const orcamento = extractFirst(text, [/(r\$\s*\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/i, /(\d+\s*(?:mil|k|reais))/i]);
  const estilo = extractFirst(text, [
    /(branco com madeira|amadeirado|ripado|moderno|clean|funcional|minimalista|alto padr[aã]o|preto|cinza|econ[oô]mico|trabalhado|b[aá]sico)/i,
  ]);
  const linhaSugerida: CustomerProject['linhaSugerida'] =
    /alto padr[aã]o|premium|select|sofisticado/i.test(text)
      ? 'Select'
      : /econ[oô]mico|simples|entrada|basic|baixo custo|b[aá]sico/i.test(text)
        ? 'Basic'
        : 'Confort';

  const itensPrincipais = [
    /painel/i.test(text) ? 'painel' : null,
    /apoio lateral|apoio para pratos|apoio de prato|copos/i.test(text) ? 'apoio lateral' : null,
    /arm[aá]rio/i.test(text) ? 'armário lateral' : null,
    /gavetas?/i.test(text) ? 'gavetas abaixo da TV' : null,
    /rack/i.test(text) ? 'rack' : null,
  ].filter((item): item is string => Boolean(item));

  return {
    ...(previous ?? {}),
    ambiente: ambiente ?? previous?.ambiente,
    medidas: medidas ?? previous?.medidas,
    intencao: intencao ?? previous?.intencao,
    itensPrincipais: itensPrincipais.length > 0 ? Array.from(new Set([...(previous?.itensPrincipais ?? []), ...itensPrincipais])) : previous?.itensPrincipais,
    orcamento: orcamento ?? previous?.orcamento,
    estilo: estilo ?? previous?.estilo,
    linhaSugerida: previous?.linhaSugerida ?? linhaSugerida,
  };
}

function buildSummary(project: CustomerProject, fallback: string): string {
  const parts = [
    project.ambiente ? `ambiente ${project.ambiente}` : null,
    project.medidas ? `medidas ${project.medidas}` : null,
    project.intencao ? `intenção ${project.intencao}` : null,
    project.itensPrincipais?.length ? `itens: ${project.itensPrincipais.join(', ')}` : null,
    project.orcamento ? `orçamento ${project.orcamento}` : null,
    project.estilo ? `estilo ${project.estilo}` : null,
    project.linhaSugerida ? `linha sugerida ${project.linhaSugerida}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Cliente busca projeto de ${parts.join('; ')}.` : fallback.slice(0, 700);
}

export async function findOrCreateCustomerContext(input: {
  userId: string;
  phone?: string | null;
  whatsappId?: string | null;
  name?: string | null;
}): Promise<CustomerContextRecord | null> {
  const phone = normalizePhone(input.phone);
  const whatsappId = input.whatsappId ?? null;
  if (!phone && !whatsappId) return null;

  const existing = await customerContextModel.findFirst({
    where: {
      userId: input.userId,
      OR: [phone ? { phone } : undefined, whatsappId ? { whatsappId } : undefined].filter(Boolean),
    },
  });
  if (existing) return existing;

  return customerContextModel.create({
    data: {
      userId: input.userId,
      phone,
      whatsappId,
      name: input.name ?? null,
      status: 'novo',
      pendingQuestions: [],
    },
  });
}

export async function getCustomerContextByConversation(userId: string, conversationId: string): Promise<CustomerContextRecord | null> {
  return customerContextModel.findFirst({ where: { userId, lastConversationId: conversationId } });
}

export async function findRecentConversationIdForCustomer(context: CustomerContextRecord, days = 30): Promise<string | null> {
  if (!context.lastConversationId || !context.lastInteractionAt) return null;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  if (context.lastInteractionAt.getTime() < cutoff) return null;
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: context.lastConversationId,
      userId: context.userId,
      archived: false,
    },
    select: { id: true },
  });
  return conversation?.id ?? null;
}

export function buildCustomerContextSystemMessage(context: CustomerContextRecord | null): string | null {
  if (!context || context.status === 'novo') return null;
  const daysSinceLastInteraction = context.lastInteractionAt
    ? Math.floor((Date.now() - context.lastInteractionAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const retomada =
    daysSinceLastInteraction !== null && daysSinceLastInteraction > 30
      ? 'Retomada acima de 30 dias: use contexto leve e pergunte se quer retomar o mesmo projeto ou falar de outro ambiente.'
      : 'Retomada recente: continue exatamente de onde parou.';

  return [
    'MEMORIA OPERACIONAL DO CLIENTE:',
    `Nome: ${context.name ?? 'nao informado'}`,
    `Telefone: ${context.phone ?? context.whatsappId ?? 'nao informado'}`,
    `Status: ${context.status}`,
    `Resumo: ${context.conversationSummary ?? 'sem resumo salvo'}`,
    `Projeto atual: ${JSON.stringify(context.currentProject ?? {})}`,
    `Perguntas pendentes: ${(context.pendingQuestions ?? []).join(', ') || 'nenhuma'}`,
    `Proxima acao sugerida: ${context.nextSuggestedAction ?? 'continuar atendimento'}`,
    retomada,
    'Regra: nao use abertura inicial, nao apresente a empresa novamente e nao repita perguntas ja respondidas.',
  ].join('\n');
}

export async function updateCustomerContextAfterInteraction(input: {
  context: CustomerContextRecord | null;
  userId: string;
  conversationId: string;
  messages: Array<{ role: MessageRole; content: string }>;
  leadDecision?: ReturnType<typeof analyzeLeadConversation>;
  imageGenerated?: boolean;
}): Promise<void> {
  if (!input.context) return;
  const project = inferProject(input.messages, input.context.currentProject);
  const summary = buildSummary(project, input.messages.map((m) => m.content).join('\n'));
  const pendingQuestions = input.leadDecision?.missingInfo ?? [];
  const status =
    input.imageGenerated || input.leadDecision?.recommendedAction === 'gerar_imagem_ilustrativa'
      ? 'ideia_visual'
      : input.leadDecision?.recommendedAction === 'sugerir_proposta'
        ? 'proposta'
        : pendingQuestions.length > 0
          ? 'qualificando'
          : input.context.status === 'novo'
            ? 'qualificando'
            : input.context.status;

  await customerContextModel.update({
    where: { id: input.context.id },
    data: {
      lastConversationId: input.conversationId,
      lastInteractionAt: new Date(),
      currentProject: {
        ...project,
        status,
        ultimaAcao: input.leadDecision?.recommendedAction ?? input.context.currentProject?.ultimaAcao,
        imagemGerada: Boolean(input.imageGenerated || input.context.currentProject?.imagemGerada),
      },
      conversationSummary: summary,
      pendingQuestions,
      nextSuggestedAction: input.leadDecision?.nextMessageSuggestion ?? null,
      status,
    },
  });
}
