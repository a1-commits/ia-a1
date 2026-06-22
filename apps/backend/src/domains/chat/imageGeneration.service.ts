import { MessageRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { env, isOpenAiConfigured } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { analyzeLeadConversation } from '../../ai/lead-decision-engine';

let openAiImageClient: OpenAI | null = null;
const generatedImagesDir = path.resolve(process.cwd(), 'storage', 'uploads', 'generated-images');
const imageJobModel = (prisma as unknown as {
  imageJob: {
    create: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
    findUnique: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
  };
}).imageJob;

type ChatImageMessage = {
  role: MessageRole;
  content: string;
};

function getOpenAiImageClient(): OpenAI | null {
  if (!isOpenAiConfigured()) return null;
  if (!openAiImageClient) {
    openAiImageClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openAiImageClient;
}

function mapMessageRole(role: MessageRole): 'user' | 'assistant' | 'system' {
  if (role === MessageRole.USER) return 'user';
  if (role === MessageRole.ASSISTANT) return 'assistant';
  return 'system';
}

function getUserText(messages: ChatImageMessage[]): string {
  return messages
    .filter((message) => message.role === MessageRole.USER)
    .map((message) => message.content)
    .join('\n');
}

function extractFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ?? match?.[0];
    if (value) return value.trim().slice(0, 120);
  }
  return null;
}

function extractBudget(text: string): string {
  return (
    extractFirst(text, [
      /(r\$\s*\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
      /(\d+\s*(?:mil|k|reais))/i,
    ]) ?? ''
  );
}

function inferMobleLevel(text: string): 'Basic' | 'Confort' | 'Select' {
  if (/alto padr[aã]o|premium|select|sofisticado|trabalhado|casa toda|apartamento inteiro/i.test(text)) return 'Select';
  if (/econ[oô]mico|simples|entrada|basic|baixo custo|mais b[aá]sico|or[cç]amento limitado/i.test(text)) return 'Basic';
  return 'Confort';
}

export function buildImageBrief(input: {
  title: string | null;
  messages: ChatImageMessage[];
}) {
  const conversation = input.messages.map((message) => ({
    role: mapMessageRole(message.role),
    content: message.content,
  }));
  const decision = analyzeLeadConversation(conversation);
  const userText = getUserText(input.messages);
  const ambiente = extractFirst(userText, [
    /(sala de tv|cozinha|quarto|su[ií]te|banheiro|lavanderia|closet|[aá]rea gourmet|sala|painel|guarda.?roupa|home office)/i,
  ]);
  const medidas = extractFirst(userText, [
    /(\d+(?:[,.]\d+)?\s*(?:m|metro|metros|cm|cent[ií]metro|cent[ií]metros))/i,
    /(\d+\s*x\s*\d+(?:\s*(?:m|metros))?)/i,
  ]);
  const referencia = /foto|refer[eê]ncia|modelo|planta|imagem|print|inspira/i.test(userText);
  const intencao =
    extractFirst(userText, [
      /(painel|apoio lateral|rack|quero algo bonito|preciso de arm[aá]rio|quero aproveitar espa[cç]o|quero uma sala legal|nao sei o que quero|não sei o que quero|preciso visualizar|queria ver alguma ideia|me mostra uma op[cç][aã]o|pode montar|clean|funcional|trabalhado)/i,
    ]) ?? '';
  const estiloInferido =
    extractFirst(userText, [
      /(branco com madeira|amadeirado|ripado|moderno|clean|funcional|minimalista|alto padr[aã]o|preto|cinza|econ[oô]mico|trabalhado|b[aá]sico)/i,
    ]) ?? (intencao ? 'contemporâneo funcional' : '');
  const coresSugeridas = [
    extractFirst(userText, [/(branco|madeira|amadeirado|preto|cinza|bege|fendi|off white|carvalho|freij[oó])/i]),
  ].filter((item): item is string => Boolean(item));
  const nivelSugerido = inferMobleLevel(userText);
  const investimentoInformado = extractBudget(userText);
  const itensPrincipais = [
    ambiente && /cozinha/i.test(ambiente) ? 'armários planejados' : null,
    /painel|sala de tv|sala/i.test(userText) ? 'painel elegante e rack funcional' : null,
    /ripado/i.test(userText) || nivelSugerido !== 'Basic' ? 'detalhe ripado ou iluminação discreta' : null,
    /closet|guarda.?roupa/i.test(userText) ? 'roupeiro planejado' : null,
    /bancada|ilha/i.test(userText) ? 'bancada ou ilha' : null,
  ].filter((item): item is string => Boolean(item));

  const hasMinimumData = Boolean(ambiente && (medidas || referencia) && intencao);
  const missingInfo = [
    !ambiente ? 'ambiente' : null,
    !medidas && !referencia ? 'medida aproximada ou referência' : null,
    !intencao ? 'intenção mínima de uso' : null,
  ].filter((item): item is string => Boolean(item));

  const brief = {
    ambiente: ambiente ?? '',
    medidas: medidas ?? '',
    investimentoInformado,
    intencao,
    estiloInferido,
    nivelSugerido,
    itensPrincipais,
    coresSugeridas,
    observacoes: hasMinimumData
      ? 'Brief suficiente para imagem ilustrativa inicial, sem caráter de projeto técnico.'
      : `Faltam dados antes de gerar imagem: ${missingInfo.join(', ')}.`,
    objetivo: 'imagem ilustrativa inicial para apoiar decisão comercial',
  };

  const visualPrompt = [
    'Gerar imagem fotorrealista 4K de ambiente residencial com marcenaria planejada Moble.',
    'A imagem deve ser realista, elegante, comercial e fabricável.',
    `Ambiente: ${brief.ambiente || 'ambiente ainda não confirmado'}.`,
    `Medidas aproximadas ou referência: ${brief.medidas || (referencia ? 'cliente informou referência visual' : 'não inventar medidas exatas')}.`,
    `Investimento informado: ${brief.investimentoInformado || 'não informado'}.`,
    `Intenção do cliente: ${brief.intencao || 'não confirmada'}.`,
    `Estilo inferido: ${brief.estiloInferido || 'contemporâneo neutro'}.`,
    `Nível Moble sugerido: ${brief.nivelSugerido}.`,
    brief.itensPrincipais.length > 0 ? `Itens principais: ${brief.itensPrincipais.join(', ')}.` : null,
    brief.coresSugeridas.length > 0 ? `Cores sugeridas: ${brief.coresSugeridas.join(', ')}.` : null,
    'Usar proporções plausíveis, acabamento de marcenaria planejada brasileira, iluminação natural suave, perspectiva humana, lente 35mm, composição limpa e materiais realistas.',
    'Sem textos, sem marcas d’água, sem medidas escritas e sem exagero de luxo se o orçamento não justificar.',
    'A imagem deve representar uma ideia inicial baseada no briefing do cliente, não um projeto técnico final.',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  const customerMessage = hasMinimumData
    ? 'Perfeito. Agora ficou bem claro o que você está pensando. Vou montar uma ideia visual pra você enxergar melhor como isso pode ficar.'
    : `Posso montar uma ideia visual inicial, mas antes preciso confirmar: ${missingInfo.join(', ')}. Me passa isso rapidinho?`;

  return {
    title: input.title ?? `Imagem ilustrativa ${ambiente ? `para ${ambiente}` : 'Möble'}`,
    canGenerate: hasMinimumData && decision.shouldGenerateImage,
    missingInfo,
    customerMessage,
    brief,
    visualPrompt,
    decision,
  };
}

export async function generateIllustrativeImage(prompt: string): Promise<{
  imageUrl: string | null;
  imageDataUrl: string | null;
  revisedPrompt: string | null;
}> {
  const client = getOpenAiImageClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY ausente. Configure a chave para gerar imagem real.');
  }

  const result = await client.images.generate({
    model: env.OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size: '1024x1024',
  });
  const image = result.data?.[0];
  const imageUrl = image?.url ?? null;
  const imageDataUrl = image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null;
  if (!imageUrl && !imageDataUrl) {
    throw new Error('A API de imagem não retornou URL nem base64.');
  }
  return {
    imageUrl,
    imageDataUrl,
    revisedPrompt: image?.revised_prompt ?? null,
  };
}

export async function persistGeneratedImage(input: {
  userId: string;
  conversationId: string;
  title: string;
  prompt: string;
  revisedPrompt: string | null;
  brief: unknown;
  generated: { imageUrl: string | null; imageDataUrl: string | null };
}): Promise<{
  id: string;
  fileUrl: string;
  fileName: string;
  storagePath: string;
  byteSize: number;
  mimeType: string;
}> {
  let buffer: Buffer;
  let mimeType = 'image/png';

  if (input.generated.imageDataUrl) {
    const match = input.generated.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('Imagem base64 inválida.');
    mimeType = match[1]!;
    buffer = Buffer.from(match[2]!, 'base64');
  } else if (input.generated.imageUrl) {
    const response = await fetch(input.generated.imageUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem gerada (${response.status}).`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType?.startsWith('image/')) mimeType = contentType;
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Imagem gerada sem conteúdo persistível.');
  }

  await mkdir(generatedImagesDir, { recursive: true });
  const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const fileName = `${randomUUID()}.${extension}`;
  const storagePath = path.join(generatedImagesDir, fileName);
  await writeFile(storagePath, buffer);

  const image = await prisma.generatedImage.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId,
      title: input.title,
      prompt: input.prompt,
      revisedPrompt: input.revisedPrompt,
      brief: input.brief as object,
      fileName,
      storagePath,
      mimeType,
      byteSize: buffer.byteLength,
    },
    select: { id: true, fileName: true, storagePath: true, byteSize: true, mimeType: true },
  });

  return {
    id: image.id,
    fileUrl: `/api/files/generated-images/${image.id}`,
    fileName: image.fileName,
    storagePath: image.storagePath,
    byteSize: image.byteSize,
    mimeType: image.mimeType,
  };
}

export async function createImageJob(input: {
  conversationId: string;
  visualBrief: unknown;
  prompt: string;
}) {
  return imageJobModel.create({
    data: {
      conversationId: input.conversationId,
      visualBrief: input.visualBrief as object,
      prompt: input.prompt,
      status: 'PENDING',
    },
  });
}

export async function getLatestImageJobForConversation(conversationId: string) {
  return imageJobModel.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    include: {
      generatedImage: {
        select: { id: true, fileName: true, mimeType: true, byteSize: true, createdAt: true },
      },
    },
  });
}

export async function hasActiveImageJobForConversation(conversationId: string): Promise<boolean> {
  const job = await imageJobModel.findFirst({
    where: {
      conversationId,
      status: { in: ['PENDING', 'GENERATING', 'COMPLETED'] },
    },
    select: { id: true },
  });
  return Boolean(job);
}

export async function getImageJobById(jobId: string) {
  return imageJobModel.findUnique({
    where: { id: jobId },
    include: {
      generatedImage: {
        select: { storagePath: true },
      },
    },
  });
}

export async function processImageJob(jobId: string): Promise<void> {
  const job = await imageJobModel.findUnique({
    where: { id: jobId },
    include: { conversation: { select: { userId: true, title: true } } },
  });
  if (!job || job.status !== 'PENDING') return;

  await imageJobModel.update({
    where: { id: jobId },
    data: { status: 'GENERATING', errorMessage: null },
  });

  try {
    const generated = await generateIllustrativeImage(job.prompt);
    const persistedImage = await persistGeneratedImage({
      userId: job.conversation.userId,
      conversationId: job.conversationId,
      title: job.conversation.title ?? 'Imagem ilustrativa Moble',
      prompt: job.prompt,
      revisedPrompt: generated.revisedPrompt,
      brief: job.visualBrief,
      generated,
    });
    const caption =
      'Essa é uma ideia inicial pra te ajudar a visualizar o caminho. Não é o projeto final ainda, mas já mostra proporção, estilo e possibilidades.';
    const assistantMessage = [
      `Imagem ilustrativa: ${persistedImage.fileUrl}`,
      '',
      caption,
      '',
      'Você prefere seguir por algo mais clean e funcional ou algo mais completo e trabalhado?',
    ].join('\n');

    await imageJobModel.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        generatedImageId: persistedImage.id,
        errorMessage: null,
      },
    });
    await prisma.message.create({
      data: {
        conversationId: job.conversationId,
        role: MessageRole.ASSISTANT,
        content: assistantMessage,
      },
    });
    await prisma.conversation.update({
      where: { id: job.conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
  } catch (error) {
    await imageJobModel.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Falha desconhecida ao gerar imagem.',
      },
    });
  }
}

export function startImageJob(jobId: string): void {
  void processImageJob(jobId).catch((error) => {
    console.log(`[image-job] falha inesperada no job ${jobId}: ${error instanceof Error ? error.message : error}`);
  });
}
