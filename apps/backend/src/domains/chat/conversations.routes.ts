import { Router } from 'express';
import { ContextType, MessageRole } from '@prisma/client';
import { z } from 'zod';
import OpenAI from 'openai';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { env, isOpenAiConfigured } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../../middleware/authMiddleware';
import { env } from '../../config/env';
import { analyzeLeadConversation } from '../../ai/lead-decision-engine';
import { createSalesHandoff, getSalesHandoffForConversation } from '../sales/handoff.service';
import { createImageJob, getLatestImageJobForConversation, startImageJob } from './imageGeneration.service';

export const conversationsRouter = Router();
conversationsRouter.use(authMiddleware);

const createSchema = z.object({
  title: z.string().optional(),
  context: z.nativeEnum(ContextType).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const handoffSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

let openAiImageClient: OpenAI | null = null;
const generatedImagesDir = path.resolve(process.cwd(), 'storage', 'uploads', 'generated-images');

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

function getUserText(messages: Array<{ role: MessageRole; content: string }>): string {
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

function summarizeConversation(messages: Array<{ role: MessageRole; content: string }>): string {
  return messages
    .slice(-10)
    .map((message) => `${message.role === MessageRole.USER ? 'Cliente' : 'MOBI'}: ${message.content.slice(0, 260)}`)
    .join('\n');
}

function buildProposalDraft(input: {
  title: string | null;
  messages: Array<{ role: MessageRole; content: string }>;
}) {
  const conversation = input.messages.map((message) => ({
    role: mapMessageRole(message.role),
    content: message.content,
  }));
  const decision = analyzeLeadConversation(conversation);
  const userText = getUserText(input.messages);
  const environment = extractFirst(userText, [
    /(cozinha|quarto|su[ií]te|banheiro|lavanderia|closet|[aá]rea gourmet|sala|painel|guarda.?roupa|home office)/i,
  ]);
  const measures = extractFirst(userText, [
    /(\d+(?:[,.]\d+)?\s*(?:m|metro|metros|cm|cent[ií]metro|cent[ií]metros))/i,
    /(\d+\s*x\s*\d+)/i,
  ]);
  const budget = extractFirst(userText, [
    /(r\$\s*\d[\d.\s]*(?:,\d{1,2})?)/i,
    /(\d+\s*(?:mil|k|reais))/i,
  ]);
  const deadline = extractFirst(userText, [
    /(urgente|esta semana|semana que vem|m[eê]s que vem|prazo de [^\n.]+)/i,
    /(reforma|obra|mudan[cç]a|construindo)/i,
  ]);
  const style = extractFirst(userText, [
    /(branco com madeira|amadeirado|ripado|moderno|clean|minimalista|alto padr[aã]o|preto|cinza)/i,
  ]);
  const location = extractFirst(userText, [
    /(?:cidade|bairro|moro em|sou de|fica em|regi[aã]o)\s*:?\s*([^\n,.]+)/i,
  ]);

  const knownInfo = [
    environment ? `Ambiente: ${environment}` : null,
    measures ? `Medidas: ${measures}` : null,
    style ? `Estilo/acabamento: ${style}` : null,
    budget ? `Orçamento informado: ${budget}` : null,
    deadline ? `Prazo/contexto: ${deadline}` : null,
    location ? `Localização: ${location}` : null,
  ].filter((item): item is string => Boolean(item));

  const missingText =
    decision.missingInfo.length > 0
      ? `Antes do orçamento final, falta confirmar: ${decision.missingInfo.join(', ')}.`
      : 'Com as informações atuais já dá para avançar para uma proposta base.';

  const title = input.title ?? `Proposta ${environment ? `para ${environment}` : 'Möble'}`;
  const summary =
    knownInfo.length > 0
      ? knownInfo.join('\n')
      : 'Cliente demonstrou interesse em móveis planejados, mas ainda faltam dados técnicos.';
  const nextStep =
    decision.recommendedAction === 'escalar_para_humano'
      ? 'O próximo passo é alinhar os detalhes finais com mais cuidado.'
      : decision.shouldSuggestImage
        ? 'Posso preparar uma ideia visual inicial para alinhar estilo antes do orçamento final.'
        : 'O próximo passo é confirmar as informações faltantes para direcionar o orçamento com segurança.';

  const text = [
    'Perfeito, organizei uma proposta inicial com base no que você me passou:',
    '',
    `Projeto: ${environment ?? 'marcenaria planejada sob medida'}`,
    measures ? `Medidas informadas: ${measures}` : null,
    style ? `Estilo desejado: ${style}` : null,
    budget ? `Referência de investimento: ${budget}` : null,
    deadline ? `Prazo/contexto: ${deadline}` : null,
    '',
    missingText,
    '',
    nextStep,
    '',
    'Essa é uma direção inicial para alinhamento. O orçamento final depende da conferência de medidas, materiais, ferragens e detalhes de acabamento.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    title,
    summary,
    knownInfo,
    missingInfo: decision.missingInfo,
    recommendedAction: decision.recommendedAction,
    text,
    decision,
  };
}

function buildImageBrief(input: {
  title: string | null;
  messages: Array<{ role: MessageRole; content: string }>;
}) {
  const conversation = input.messages.map((message) => ({
    role: mapMessageRole(message.role),
    content: message.content,
  }));
  const decision = analyzeLeadConversation(conversation);
  const userText = getUserText(input.messages);
  const ambiente = extractFirst(userText, [
    /(cozinha|quarto|su[ií]te|banheiro|lavanderia|closet|[aá]rea gourmet|sala|painel|guarda.?roupa|home office)/i,
  ]);
  const medidas = extractFirst(userText, [
    /(\d+(?:[,.]\d+)?\s*(?:m|metro|metros|cm|cent[ií]metro|cent[ií]metros))/i,
    /(\d+\s*x\s*\d+)/i,
  ]);
  const estilo = extractFirst(userText, [
    /(branco com madeira|amadeirado|ripado|moderno|clean|minimalista|alto padr[aã]o|preto|cinza|econ[oô]mico)/i,
  ]);
  const intencao = extractFirst(userText, [
    /(painel|apoio lateral|rack|quero algo bonito|preciso de arm[aá]rio|quero aproveitar espa[cç]o|quero uma sala legal|nao sei o que quero|não sei o que quero|preciso visualizar|queria ver alguma ideia|me mostra uma op[cç][aã]o|pode montar|clean|funcional|trabalhado)/i,
  ]);
  const cores = extractFirst(userText, [
    /(branco|madeira|amadeirado|preto|cinza|bege|fendi|off white|carvalho|freij[oó])/i,
  ]);
  const linhaMoble =
    /alto padr[aã]o|premium|select/i.test(userText)
      ? 'Select'
      : /econ[oô]mico|simples|entrada|basic/i.test(userText)
        ? 'Basic'
        : 'Confort';
  const itensPrincipais = [
    ambiente && /cozinha/i.test(ambiente) ? 'armários planejados' : null,
    /painel/i.test(userText) ? 'painel planejado' : null,
    /closet|guarda.?roupa/i.test(userText) ? 'roupeiro planejado' : null,
    /bancada|ilha/i.test(userText) ? 'bancada ou ilha' : null,
  ].filter((item): item is string => Boolean(item));
  const hasMinimumData = Boolean(ambiente && (medidas || /foto|refer[eê]ncia|modelo|planta|imagem/i.test(userText)) && intencao);
  const missingInfo = [
    !ambiente ? 'ambiente' : null,
    !medidas && !/foto|refer[eê]ncia|modelo|planta|imagem/i.test(userText) ? 'medida aproximada ou referência' : null,
    !intencao ? 'intenção mínima de uso' : null,
  ].filter((item): item is string => Boolean(item));

  const brief = {
    ambiente: ambiente ?? '',
    medidas: medidas ?? '',
    estilo: estilo ?? intencao ?? '',
    cores: cores ?? estilo ?? '',
    linhaMoble,
    itensPrincipais,
    iluminacao: 'iluminação natural suave',
    observacoes: hasMinimumData
      ? 'Brief suficiente para imagem ilustrativa inicial, sem caráter de projeto técnico.'
      : `Faltam dados antes de gerar imagem: ${missingInfo.join(', ')}.`,
    objetivoDaImagem: 'imagem ilustrativa inicial para apoiar decisão comercial, não projeto final',
  };

  const visualPrompt = [
    'Gerar render fotorrealista 4K de marcenaria planejada Moble.',
    `Ambiente: ${brief.ambiente || 'ambiente ainda não confirmado'}.`,
    `Medidas aproximadas: ${brief.medidas || 'não inventar medidas; usar proporções plausíveis'}.`,
    `Estilo/acabamento/intenção: ${brief.estilo || 'confirmar com cliente antes de gerar'}.`,
    `Cores: ${brief.cores || 'paleta neutra contemporânea'}.`,
    `Linha Moble sugerida: ${brief.linhaMoble}.`,
    brief.itensPrincipais.length > 0 ? `Itens principais: ${brief.itensPrincipais.join(', ')}.` : null,
    'Marcenaria planejada brasileira contemporânea, acabamento realista, proporções plausíveis, iluminação natural suave, câmera em perspectiva humana, lente 35mm, visual premium mas fabricável.',
    'A imagem deve ser ilustrativa, realista e comercial. Não criar projeto técnico final, não inventar medidas exatas, não incluir textos, marcas d’água ou etiquetas.',
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

async function generateIllustrativeImage(prompt: string): Promise<{
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

async function persistGeneratedImage(input: {
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
  byteSize: number;
  mimeType: string;
}> {
  let buffer: Buffer;
  let mimeType = 'image/png';

  if (input.generated.imageDataUrl) {
    const match = input.generated.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('Imagem base64 inválida.');
    mimeType = match[1];
    buffer = Buffer.from(match[2], 'base64');
  } else if (input.generated.imageUrl) {
    const response = await fetch(input.generated.imageUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem gerada (${response.status}).`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType?.startsWith('image/')) mimeType = contentType.split(';')[0];
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Nenhuma imagem retornada para persistir.');
  }

  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const fileName = `${randomUUID()}.${ext}`;
  await mkdir(generatedImagesDir, { recursive: true });
  const storagePath = path.join(generatedImagesDir, fileName);
  await writeFile(storagePath, buffer);

  const record = await prisma.generatedImage.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId,
      title: input.title,
      prompt: input.prompt,
      revisedPrompt: input.revisedPrompt ?? undefined,
      brief: input.brief as object,
      fileName,
      storagePath,
      mimeType,
      byteSize: buffer.byteLength,
    },
    select: { id: true, fileName: true, byteSize: true, mimeType: true },
  });

  return {
    id: record.id,
    fileName: record.fileName,
    byteSize: record.byteSize,
    mimeType: record.mimeType,
    fileUrl: `/api/files/generated-images/${record.id}`,
  };
}

conversationsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const includeArchived = req.query.includeArchived === 'true';
    const items = await prisma.conversation.findMany({
      where: {
        userId,
        ...(includeArchived ? {} : { archived: false }),
      },
      orderBy: [{ pinned: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.post('/', async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const userId = req.userId!;
    const item = await prisma.conversation.create({
      data: {
        userId,
        title: body.title,
        context: body.context ?? ContextType.GERAL,
      },
    });
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

conversationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const body = patchSchema.parse(req.body);
    const conv = await prisma.conversation.findFirst({ where: { id, userId } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const item = await prisma.conversation.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        ...(body.archived !== undefined ? { archived: body.archived } : {}),
      },
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id/messages', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ conversation: conv, messages });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id/lead-decision', async (req, res, next) => {
  try {
    if (env.MOBI_SIMPLE_AGENT) {
      res.json({ decision: null });
      return;
    }
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const decision = analyzeLeadConversation(
      messages.map((message) => ({ role: mapMessageRole(message.role), content: message.content })),
    );
    res.json({ decision });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id/handoff', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const handoff = await getSalesHandoffForConversation(userId, id);
    res.json({ handoff });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.post('/:id/handoff', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const parsed = handoffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Body inválido.' });
      return;
    }
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true, title: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const result = await createSalesHandoff({
      userId,
      conversationId: id,
      title: conv.title,
      reason: parsed.data.reason ?? 'Escalado manualmente pelo painel de chat.',
      summary: summarizeConversation(messages),
    });
    const handoff = await getSalesHandoffForConversation(userId, id);
    res.status(result.alreadyOpen ? 200 : 201).json({ handoff, alreadyOpen: result.alreadyOpen });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id/proposal-draft', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true, title: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    res.json({ draft: buildProposalDraft({ title: conv.title, messages }) });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id/image-brief', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true, title: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const imageJob = await getLatestImageJobForConversation(id);
    res.json({ imageBrief: buildImageBrief({ title: conv.title, messages }), imageJob });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.post('/:id/generate-image', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const conv = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true, title: true } });
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const imageBrief = buildImageBrief({ title: conv.title, messages });
    if (!imageBrief.canGenerate) {
      res.status(400).json({
        error: `Dados insuficientes para gerar imagem. Falta: ${imageBrief.missingInfo.join(', ') || 'qualificação comercial'}.`,
        imageBrief,
      });
      return;
    }

    const imageJob = await createImageJob({
      conversationId: id,
      prompt: imageBrief.visualPrompt,
      visualBrief: imageBrief.brief,
    });
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: MessageRole.ASSISTANT,
        content: imageBrief.customerMessage,
      },
    });
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });
    startImageJob(imageJob.id);

    res.status(201).json({
      imageBrief,
      imageJob,
      generatedImage: null,
      persistedImage: null,
      assistantMessage,
    });
  } catch (e) {
    next(e);
  }
});
