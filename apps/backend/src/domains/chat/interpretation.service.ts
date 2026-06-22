import OpenAI from 'openai';
import { ContextType, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env, isOpenAiConfigured } from '../../config/env';
import type { AgentAutoCreated, AgentInterpretation, InterpretedKind } from './agent.types';
import { createTask } from '../tasks/tasks.service';
import { saveMemory } from '../memory/memory.service';
import { classifyMessage } from './messageClassifier.service';

const AUTO_SAVE_CONFIDENCE = 0.72;

function clip(text: string, size: number): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, size);
}

function detectContextHeuristic(text: string): ContextType {
  const s = text.toLowerCase();
  const messageClass = classifyMessage(text);
  if (messageClass === 'comercial' || messageClass === 'financeiro') return ContextType.MOBLE;
  if (/(eu|minha|meu|fam[i�]lia|sa[u�]de|pessoal)/i.test(s)) return ContextType.PESSOAL;
  if (/(cliente|lead|orcamento|or?amento|proposta|visita|venda|fechamento|movel|m[o?]vel|cozinha|quarto|banheiro|painel|marcenaria|moble|pagar|receber|financeiro|boleto|fornecedor)/i.test(s)) {
    return ContextType.MOBLE;
  }
  if (/(moble|cliente|produto|squad|roadmap|neg[o�]cio)/i.test(s)) return ContextType.MOBLE;
  if (/(karrun|projeto karrun|time karrun)/i.test(s)) return ContextType.KARRUN;
  return ContextType.GERAL;
}

function detectKindHeuristic(text: string): { kind: InterpretedKind; confidence: number; rationale: string } {
  const s = text.toLowerCase();
  const messageClass = classifyMessage(text);
  if (messageClass === 'comercial') {
    return { kind: 'task', confidence: 0.8, rationale: 'Mensagem classificada como comercial' };
  }
  if (messageClass === 'financeiro') {
    return { kind: 'task', confidence: 0.79, rationale: 'Mensagem classificada como financeiro' };
  }
  if (messageClass === 'tarefa') {
    return { kind: 'task', confidence: 0.78, rationale: 'Mensagem classificada como tarefa' };
  }
  if (/(cliente|lead|orcamento|or?amento|proposta|visita|fechar|fechamento|medida|medidas|cozinha|quarto|banheiro|guarda.?roupa|painel|movel|m[o?]vel)/i.test(s)) {
    return { kind: 'task', confidence: 0.8, rationale: 'Lead ou acao comercial detectada' };
  }
  if (/(pagar|receber|conta|boleto|pix|valor|vencimento|dia\s+\d{1,2}|r\$|\d+[,.]?\d*\s*reais)/i.test(s)) {
    return { kind: 'task', confidence: 0.79, rationale: 'Acao financeira detectada' };
  }
  if (/(tenho que|preciso|fazer|enviar|comprar|agendar|lembrar de|prazo|at[e�]|amanh[�a])/i.test(s)) {
    return { kind: 'task', confidence: 0.78, rationale: 'Linguagem de a��o/prazo detectada' };
  }
  if (/(lembre|n[a�]o esque[c�]a|importante|prefiro|gosto|meu padr[a�]o|sempre)/i.test(s)) {
    return { kind: 'memory', confidence: 0.76, rationale: 'Mensagem com tra�o est�vel ou lembrete' };
  }
  if (/(acho que|sinto|estou|decis[a�]o|d[u�]vida|ansioso|reflet|an[a�]lise|desabafo)/i.test(s)) {
    return { kind: 'reflection', confidence: 0.75, rationale: 'Tom anal�tico/reflexivo identificado' };
  }
  return { kind: 'message', confidence: 0.61, rationale: 'Sem padr�o forte de captura autom�tica' };
}

function parseContext(value: string | undefined): ContextType | null {
  if (!value) return null;
  const k = value.toUpperCase();
  if (k === 'PESSOAL') return ContextType.PESSOAL;
  if (k === 'MOBLE') return ContextType.MOBLE;
  if (k === 'KARRUN') return ContextType.KARRUN;
  if (k === 'GERAL') return ContextType.GERAL;
  return null;
}

function parseKind(value: string | undefined): InterpretedKind | null {
  if (!value) return null;
  const k = value.toLowerCase();
  if (k === 'message' || k === 'memory' || k === 'task' || k === 'reflection') return k;
  return null;
}

async function classifyWithAi(text: string): Promise<Partial<AgentInterpretation> | null> {
  if (!isOpenAiConfigured()) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Classifique a mensagem em JSON estrito: {"context":"PESSOAL|MOBLE|KARRUN|GERAL","kind":"message|memory|task|reflection","confidence":0-1,"rationale":"curto"}.',
        },
        { role: 'user', content: text.slice(0, 1000) },
      ],
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < 0 || jsonEnd <= jsonStart) return null;
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      context?: string;
      kind?: string;
      confidence?: number;
      rationale?: string;
    };
    return {
      context: parseContext(parsed.context) ?? undefined,
      kind: parseKind(parsed.kind) ?? undefined,
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : undefined,
      rationale: parsed.rationale ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function classifyUserMessage(input: {
  content: string;
  forcedContext?: ContextType;
}): Promise<AgentInterpretation> {
  const heurContext = input.forcedContext ?? detectContextHeuristic(input.content);
  const heur = detectKindHeuristic(input.content);
  const ai = await classifyWithAi(input.content);

  return {
    context: input.forcedContext ?? ai?.context ?? heurContext,
    kind: ai?.kind ?? heur.kind,
    confidence: ai?.confidence ?? heur.confidence,
    rationale: ai?.rationale ?? heur.rationale,
  };
}

async function hasRecentDuplicate(params: {
  userId: string;
  kind: InterpretedKind;
  context: ContextType;
  text: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const probe = clip(params.text, 120);
  if (params.kind === 'memory') {
    const row = await prisma.memory.findFirst({
      where: {
        userId: params.userId,
        context: params.context,
        updatedAt: { gte: since },
        OR: [{ title: { contains: probe, mode: 'insensitive' } }, { content: { contains: probe, mode: 'insensitive' } }],
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (params.kind === 'task') {
    const row = await prisma.task.findFirst({
      where: {
        userId: params.userId,
        context: params.context,
        updatedAt: { gte: since },
        title: { contains: probe, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (params.kind === 'reflection') {
    const row = await prisma.reflection.findFirst({
      where: {
        userId: params.userId,
        context: params.context,
        updatedAt: { gte: since },
        OR: [{ title: { contains: probe, mode: 'insensitive' } }, { content: { contains: probe, mode: 'insensitive' } }],
      },
      select: { id: true },
    });
    return Boolean(row);
  }
  return false;
}

function looksLikeCommercialLead(text: string): boolean {
  return /(cliente|lead|orcamento|or?amento|proposta|visita|fechar|fechamento|medida|medidas|cozinha|quarto|banheiro|guarda.?roupa|painel|movel|m[o?]vel|marcenaria|sob medida)/i.test(
    text,
  );
}

function looksLikeUsefulClientMemory(text: string): boolean {
  return /(cliente|nome|telefone|bairro|cidade|medida|medidas|ambiente|cozinha|quarto|banheiro|prazo|orcamento|or?amento|investimento)/i.test(
    text,
  );
}

export async function maybeAutoCreateArtifact(input: {
  userId: string;
  content: string;
  interpretation: AgentInterpretation;
}): Promise<AgentAutoCreated> {
  const { interpretation, content, userId } = input;
  const autoCreated: AgentAutoCreated = {};

  if (looksLikeCommercialLead(content)) {
    const duplicatedTask = await hasRecentDuplicate({
      userId,
      kind: 'task',
      context: ContextType.MOBLE,
      text: content,
    });
    if (!duplicatedTask) {
      const task = await createTask({
        userId,
        title: `Atender lead: ${clip(content, 70)}`,
        description: clip(content, 1500),
        context: ContextType.MOBLE,
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
      });
      autoCreated.taskId = task.id;
    }

    if (looksLikeUsefulClientMemory(content)) {
      const duplicatedMemory = await hasRecentDuplicate({
        userId,
        kind: 'memory',
        context: ContextType.MOBLE,
        text: content,
      });
      if (!duplicatedMemory) {
        const memory = await saveMemory({
          userId,
          title: `Lead Moble: ${clip(content, 70)}`,
          dadosRelevantes: clip(content, 1500),
          contexto: ContextType.MOBLE,
        });
        autoCreated.memoryId = memory.id;
      }
    }

    if (autoCreated.taskId || autoCreated.memoryId) return autoCreated;
  }

  if (interpretation.kind === 'message' || interpretation.confidence < AUTO_SAVE_CONFIDENCE) {
    return {};
  }

  const duplicated = await hasRecentDuplicate({
    userId,
    kind: interpretation.kind,
    context: interpretation.context,
    text: content,
  });
  if (duplicated) return {};

  const titleBase = clip(content, 90);

  if (interpretation.kind === 'memory') {
    const row = await saveMemory({
      userId,
      title: `Memoria: ${titleBase}`,
      dadosRelevantes: clip(content, 1500),
      contexto: interpretation.context,
    });
    return { memoryId: row.id };
  }

  if (interpretation.kind === 'task') {
    const row = await createTask({
      userId,
      title: titleBase,
      description: clip(content, 1500),
      context: interpretation.context,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
    });
    return { taskId: row.id };
  }

  if (interpretation.kind === 'reflection') {
    const row = await prisma.reflection.create({
      data: {
        userId,
        title: `Reflex�o: ${clip(content, 80)}`,
        content: clip(content, 2000),
        context: interpretation.context,
      },
      select: { id: true },
    });
    return { reflectionId: row.id };
  }

  return {};
}
