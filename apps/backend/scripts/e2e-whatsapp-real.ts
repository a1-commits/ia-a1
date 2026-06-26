/**
 * E2E real — mesmo caminho do WhatsApp (processAgentMessage).
 * Sem mocks nos testes 1–4 e 7. Testes 5–6 usam patch temporário apenas neste script.
 */
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { classifyIntent } from '../src/domains/chat/intentRouter.service';
import { ensureDefaultAgent } from '../src/domains/agents/agent.service';
import * as blingService from '../src/domains/integrations/bling.service';
import * as aiService from '../src/domains/ai/aiService';

type Trace = {
  blingCalls: Array<{ fn: string; input: unknown; output?: unknown; error?: string }>;
  aiCalls: Array<{ messages: unknown; output?: string; error?: string }>;
  agentEngineLogs: string[];
};

const trace: Trace = { blingCalls: [], aiCalls: [], agentEngineLogs: [] };

const origAggregate = blingService.aggregateStockForAgent.bind(blingService);
const origFindByName = blingService.findProductOptionsByNameForAgent.bind(blingService);
const origAgentHasBling = blingService.agentHasBlingTool.bind(blingService);
const origGenerate = aiService.generateAssistantReply.bind(aiService);

function installBlingTrace(): void {
  (blingService as { aggregateStockForAgent: typeof origAggregate }).aggregateStockForAgent = async (input) => {
    try {
      const out = await origAggregate(input);
      trace.blingCalls.push({ fn: 'aggregateStockForAgent', input, output: out });
      return out;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      trace.blingCalls.push({ fn: 'aggregateStockForAgent', input, error });
      throw e;
    }
  };
  (blingService as { findProductOptionsByNameForAgent: typeof origFindByName }).findProductOptionsByNameForAgent =
    async (input) => {
      try {
        const out = await origFindByName(input);
        trace.blingCalls.push({ fn: 'findProductOptionsByNameForAgent', input, output: out });
        return out;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        trace.blingCalls.push({ fn: 'findProductOptionsByNameForAgent', input, error });
        throw e;
      }
    };
}

function installAiTrace(): void {
  (aiService as { generateAssistantReply: typeof origGenerate }).generateAssistantReply = async (messages) => {
    try {
      const out = await origGenerate(messages);
      trace.aiCalls.push({ messages, output: out });
      return out;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      trace.aiCalls.push({ messages, error });
      throw e;
    }
  };
}

function installLogCapture(): void {
  const origInfo = console.info;
  console.info = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (line.includes('[agent-engine]')) trace.agentEngineLogs.push(line);
    origInfo.apply(console, args);
  };
}

function resetTrace(): void {
  trace.blingCalls = [];
  trace.aiCalls = [];
  trace.agentEngineLogs = [];
}

function section(title: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function fail(test: string, reason: string): never {
  console.error(`\n❌ PARADA: ${test}`);
  console.error(reason);
  process.exit(1);
}

async function ensureBlingToolLinked(userId: string, agentId: string): Promise<void> {
  let tool = await prisma.toolConnection.findFirst({
    where: { userId, type: 'BLING' },
  });
  if (!tool) {
    tool = await prisma.toolConnection.create({
      data: {
        userId,
        name: 'Bling',
        type: 'BLING',
        isEnabled: true,
      },
    });
  }
  const linked = await prisma.agentTool.findUnique({
    where: { agentId_toolId: { agentId, toolId: tool.id } },
  });
  if (!linked) {
    await prisma.agentTool.create({
      data: { agentId, toolId: tool.id },
    });
  }
}

async function resolveWhatsAppContext(): Promise<{
  userId: string;
  assignedAgentId: string;
  agentName: string;
  blingConnected: boolean;
}> {
  const email = env.WHATSAPP_AGENT_USER_EMAIL;
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      agents: {
        include: {
          agentTools: { include: { tool: true } },
          blingConnections: true,
        },
      },
    },
  });
  if (!user) fail('SETUP', `Usuário WhatsApp não encontrado: ${email}`);

  await ensureDefaultAgent(user.id);
  const agents = await prisma.agent.findMany({
    where: { userId: user.id },
    include: {
      agentTools: { include: { tool: true } },
      blingConnections: true,
    },
  });

  const agent =
    agents.find((a) => a.agentTools.some((t) => t.tool.type === 'BLING')) ?? agents[0];
  if (!agent) fail('SETUP', 'Nenhum agente encontrado para o usuário.');

  await ensureBlingToolLinked(user.id, agent.id);

  const refreshed = await prisma.agent.findUnique({
    where: { id: agent.id },
    include: {
      agentTools: { include: { tool: true } },
      blingConnections: true,
    },
  });
  if (!refreshed) fail('SETUP', 'Agente não encontrado após vincular Bling.');

  const hasBlingTool = refreshed.agentTools.some((t) => t.tool.type === 'BLING');
  const blingConnected = refreshed.blingConnections.some((c) => c.status === 'CONNECTED');

  return {
    userId: user.id,
    assignedAgentId: refreshed.id,
    agentName: refreshed.name,
    blingConnected: hasBlingTool && blingConnected,
  };
}

async function runWhatsAppMessage(input: {
  userId: string;
  assignedAgentId: string;
  content: string;
  forceNew?: boolean;
}): Promise<{
  conversationId: string;
  assistantText: string | null;
  userMessageId: string;
}> {
  const { processAgentMessage } = await import('../src/domains/chat/chatAgentFlow.service');
  const result = await processAgentMessage({
    userId: input.userId,
    content: input.content,
    channel: 'whatsapp_customer',
    customerPhone: '5543999990001',
    customerWhatsappId: '5543999990001@c.us',
    customerName: 'Cliente E2E',
    assignedAgentId: input.assignedAgentId,
    forceNew: input.forceNew ?? true,
  });
  return {
    conversationId: result.conversationId,
    assistantText: result.assistantMessage?.content ?? null,
    userMessageId: result.userMessage.id,
  };
}

function lastAiPrompt(): { system: string; user: string } | null {
  const last = trace.aiCalls[trace.aiCalls.length - 1];
  if (!last?.messages || !Array.isArray(last.messages)) return null;
  const msgs = last.messages as Array<{ role: string; content: string }>;
  return {
    system: msgs.find((m) => m.role === 'system')?.content ?? '',
    user: msgs.find((m) => m.role === 'user')?.content ?? '',
  };
}

function extractJsonFromPrompt(prompt: string): unknown {
  const m = prompt.match(/Dados do ERP \(JSON\):\n([\s\S]*?)\n\nMensagem do cliente:/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

let test2BlingCallCount = 0;
let test5MentionsErpIssue = false;
let test6LlamaWon = false;
let test6HadBlingStock = false;

async function main(): Promise<void> {
  installBlingTrace();
  installAiTrace();
  installLogCapture();

  section('SETUP — ambiente e agente WhatsApp');
  console.log('DATABASE_URL:', env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  console.log('OLLAMA_ENABLED:', env.OLLAMA_ENABLED, '| OLLAMA_BASE_URL:', env.OLLAMA_BASE_URL);
  console.log('OPENAI configurado:', Boolean(env.OPENAI_API_KEY?.trim()));

  const ctx = await resolveWhatsAppContext();
  console.log('userId:', ctx.userId);
  console.log('agentId:', ctx.assignedAgentId, `(${ctx.agentName})`);
  console.log('Bling tool + conexão CONNECTED:', ctx.blingConnected);

  if (!ctx.blingConnected) {
    console.warn('⚠ Bling não está CONNECTED — testes 1,3,4 podem falhar na consulta real.');
  }

  // ─── TESTE 1 ───
  section('TESTE 1 — 7891234567890');
  resetTrace();
  const msg1 = '7891234567890';
  console.log('1. Mensagem recebida:', msg1);
  const intent1 = classifyIntent(msg1);
  console.log('2. Intent detectada:', intent1);
  if (intent1 !== 'CONSULTA_CODIGO_BARRAS') fail('TESTE 1', `Intent esperada CONSULTA_CODIGO_BARRAS, obtida ${intent1}`);

  let flow1;
  try {
    flow1 = await runWhatsAppMessage({ ...ctx, content: msg1 });
  } catch (e) {
    fail('TESTE 1', `processAgentMessage falhou: ${e instanceof Error ? e.message : e}`);
  }

  const toolLog1 = trace.agentEngineLogs.find((l) => l.includes('tool.selected'));
  console.log('3. Ferramenta escolhida:', toolLog1 ?? '(ver logs agent-engine)');
  if (!toolLog1?.includes('"tool":"bling"')) {
    fail('TESTE 1', 'Ferramenta bling não foi selecionada.');
  }

  const queryLog1 = trace.agentEngineLogs.find((l) => l.includes('query.completed'));
  const blingCall1 = trace.blingCalls.find((c) => c.fn === 'aggregateStockForAgent');
  if (!blingCall1 && !queryLog1) {
    fail('TESTE 1', 'Consulta Bling não executada (sem query.completed).');
  }
  if (blingCall1) {
    console.log('4. Consulta Bling — função:', blingCall1.fn);
    console.log('5. Requisição enviada ao Bling (input):', JSON.stringify(blingCall1.input, null, 2));
    if (blingCall1.error) fail('TESTE 1', `Erro Bling: ${blingCall1.error}`);
    console.log('6. Resposta recebida do Bling:', JSON.stringify(blingCall1.output, null, 2));
  } else {
    console.log('4. Consulta Bling — confirmada via [agent-engine] query.completed');
    console.log('5–6. Trace direto indisponível (import estático); ver query.completed abaixo.');
  }

  console.log('7. Objeto estruturado (query.completed):', queryLog1);

  const prompt1 = lastAiPrompt();
  if (prompt1 && prompt1.user.includes('Dados do ERP')) {
    console.log('8. Prompt system (Llama):', prompt1.system);
    console.log('8. Prompt user (Llama):', prompt1.user);
  } else if (trace.aiCalls.length === 0) {
    console.log('8. Prompt Llama: NÃO chamado (resposta determinística — empty ou template)');
  } else {
    console.log('8. Prompt Llama:', JSON.stringify(trace.aiCalls[trace.aiCalls.length - 1]?.messages, null, 2));
  }

  console.log('9. Resposta final:', flow1.assistantText);
  if (!flow1.assistantText) fail('TESTE 1', 'Sem resposta do assistente.');

  // ─── TESTE 2 ───
  section('TESTE 2 — bom dia');
  resetTrace();
  const msg2 = 'bom dia';
  console.log('Mensagem:', msg2);
  const intent2 = classifyIntent(msg2);
  console.log('Intent:', intent2);

  let flow2;
  try {
    flow2 = await runWhatsAppMessage({ ...ctx, content: msg2 });
  } catch (e) {
    fail('TESTE 2', String(e));
  }

  test2BlingCallCount = trace.blingCalls.length;
  const test2QueryBling = trace.agentEngineLogs.some(
    (l) => l.includes('query.completed') && l.includes('"tool":"bling"'),
  );
  if (test2BlingCallCount > 0 || test2QueryBling) {
    fail('TESTE 2', `Bling foi acionado — deveria ser 0.`);
  }
  console.log('Bling chamado:', 0, 'vezes ✓');

  if (trace.aiCalls.length === 0) {
    console.log('Llama: usou fallback determinístico (IA indisponível)');
  } else {
    console.log('Llama chamado:', trace.aiCalls.length, 'vez(es)');
    console.log('Prompt conversacional system:', lastAiPrompt()?.system?.slice(0, 200));
    console.log('Resposta Llama raw:', trace.aiCalls[0]?.output);
  }
  console.log('Resposta final:', flow2.assistantText);

  // ─── TESTE 3 ───
  section('TESTE 3 — coca');
  resetTrace();
  const msg3 = 'coca';
  let flow3;
  try {
    flow3 = await runWhatsAppMessage({ ...ctx, content: msg3 });
  } catch (e) {
    fail('TESTE 3', String(e));
  }

  const nameCall = trace.blingCalls.find((c) => c.fn === 'findProductOptionsByNameForAgent');
  const aggCall3 = trace.blingCalls.find((c) => c.fn === 'aggregateStockForAgent');
  const queryLog3 = trace.agentEngineLogs.find((l) => l.includes('query.completed'));
  if (nameCall) {
    console.log('Consulta Bling (nome):', JSON.stringify(nameCall.input, null, 2));
    const options = nameCall.output as Array<{ nome: string; sku: string | null; gtin: string | null }> | undefined;
    console.log('Produtos retornados pelo Bling:', options?.length ?? 0);
    if (options && options.length > 1) {
      console.log('Lista Bling:');
      options.forEach((p, i) => console.log(`  ${i + 1} - ${p.nome} | sku=${p.sku} | gtin=${p.gtin}`));
      const llamaErp = trace.aiCalls.some((c) =>
        JSON.stringify(c.messages).includes('Dados do ERP'),
      );
      if (llamaErp) fail('TESTE 3', 'Llama foi usado para formatar múltiplos produtos — deveria ser template fixo.');
      console.log('Llama formatou lista?', false, '(template determinístico)');
    } else if (options?.length === 1) {
      console.log('Um único produto — seguiu para estoque:', aggCall3 ? 'sim' : 'não');
    }
  } else if (aggCall3) {
    console.log('Busca direta por SKU/agregação:', JSON.stringify(aggCall3.input, null, 2));
  } else if (queryLog3) {
    console.log('Consulta Bling confirmada via query.completed:', queryLog3);
  } else {
    fail('TESTE 3', 'Nenhuma consulta Bling registrada.');
  }
  console.log('Resposta final:', flow3.assistantText);

  // ─── TESTE 4 ───
  section('TESTE 4 — todos abaixo do mínimo');
  resetTrace();
  const msg4 = 'todos abaixo do mínimo';
  const intent4 = classifyIntent(msg4);
  console.log('Intent:', intent4);

  let flow4;
  try {
    flow4 = await runWhatsAppMessage({ ...ctx, content: msg4 });
  } catch (e) {
    fail('TESTE 4', String(e));
  }

  console.log('Consultas Bling executadas:', trace.blingCalls.length);
  trace.blingCalls.forEach((c, i) => {
    console.log(`  [${i + 1}] ${c.fn}:`, JSON.stringify(c.input));
    if (c.output) console.log(`      output keys:`, Object.keys(c.output as object));
  });
  const queryLog4 = trace.agentEngineLogs.find((l) => l.includes('query.completed'));
  console.log('Objeto (query.completed):', queryLog4);
  console.log('Resposta enviada:', flow4.assistantText);

  // ─── TESTE 5 ───
  section('TESTE 5 — Bling indisponível + 7891234567890');
  resetTrace();
  (blingService as { agentHasBlingTool: typeof origAgentHasBling }).agentHasBlingTool = async () => false;

  let flow5;
  try {
    flow5 = await runWhatsAppMessage({ ...ctx, content: '7891234567890' });
  } catch (e) {
    fail('TESTE 5', String(e));
  } finally {
    (blingService as { agentHasBlingTool: typeof origAgentHasBling }).agentHasBlingTool = origAgentHasBling;
  }

  console.log('Bling aggregate chamado:', trace.blingCalls.length);
  console.log('Resposta:', flow5.assistantText);

  const inventsProduct =
    flow5.assistantText &&
    /produto:\s*\S+/i.test(flow5.assistantText) &&
    !/não encontrei|não consegui|configure|ferramenta|erp/i.test(flow5.assistantText);
  if (inventsProduct) {
    fail('TESTE 5', 'Resposta parece inventar produto.');
  }
  test5MentionsErpIssue = /não encontrei|não consegui|configure|ferramenta|erp|bling/i.test(
    flow5.assistantText ?? '',
  );
  console.log('Menciona indisponibilidade/ERP (sem inventar):', test5MentionsErpIssue);

  // ─── TESTE 6 ───
  section('TESTE 6 — Llama incorreto vs JSON Bling');
  resetTrace();
  (aiService as { generateAssistantReply: typeof origGenerate }).generateAssistantReply = async (messages) => {
    const user = (messages as Array<{ role: string; content: string }>).find((m) => m.role === 'user')?.content ?? '';
    if (user.includes('Reformule de forma simpática')) {
      const forged = '[FORÇADO] Produto FALSO XYZ — estoque 9999 un — R$ 0,01';
      trace.aiCalls.push({ messages, output: forged });
      return forged;
    }
    return origGenerate(messages);
  };

  let flow6;
  try {
    flow6 = await runWhatsAppMessage({ ...ctx, content: '7891234567890' });
  } catch (e) {
    fail('TESTE 6', String(e));
  } finally {
    (aiService as { generateAssistantReply: typeof origGenerate }).generateAssistantReply = origGenerate;
  }

  const bling6 = trace.blingCalls.find((c) => c.fn === 'aggregateStockForAgent');
  const erpPrompt = trace.aiCalls.find((c) =>
    JSON.stringify(c.messages).includes('Reformule de forma simpática'),
  );
  const final6 = flow6.assistantText ?? '';
  console.log('Prompt de embelezamento usado:', erpPrompt ? 'sim' : 'não');
  console.log('Resposta Llama forçada (incorreta):', trace.aiCalls.find((c) => c.output?.includes('FORÇADO'))?.output);
  console.log('Resposta final ao usuário:', final6);

  const blingProductName =
    bling6?.output &&
    typeof bling6.output === 'object' &&
    bling6.output !== null &&
    'results' in (bling6.output as object)
      ? (
          (bling6.output as { results: Array<{ stores: Array<{ productName: string | null; found: boolean }> }> })
            .results[0]?.stores.find((s) => s.found)?.productName ?? null
        )
      : null;
  test6HadBlingStock = Boolean(bling6?.output);
  test6LlamaWon = final6.includes('FALSO XYZ') || final6.includes('9999');
  const blingDataInReply =
    blingProductName && final6.toLowerCase().includes(blingProductName.toLowerCase().slice(0, 8));
  console.log('Llama incorreto prevaleceu na resposta final?', test6LlamaWon);
  console.log('Dados reais do Bling aparecem na resposta?', blingDataInReply);

  // ─── TESTE 7 ───
  section('TESTE 7 — caminho completo WhatsApp (processAgentMessage, sem mocks)');
  resetTrace();
  (aiService as { generateAssistantReply: typeof origGenerate }).generateAssistantReply = origGenerate;
  (blingService as { agentHasBlingTool: typeof origAgentHasBling }).agentHasBlingTool = origAgentHasBling;

  let flow7;
  try {
    flow7 = await runWhatsAppMessage({ ...ctx, content: '7891234567890', forceNew: true });
  } catch (e) {
    fail('TESTE 7', String(e));
  }
  console.log('Função de entrada: processAgentMessage (channel=whatsapp_customer)');
  console.log('conversationId:', flow7.conversationId);
  console.log('Bling chamado:', trace.blingCalls.length > 0);
  console.log('Resposta:', flow7.assistantText);

  section('RESUMO FINAL');
  const failures: string[] = [];
  if (!flow1.assistantText) failures.push('TESTE 1 sem resposta');
  if (test2BlingCallCount > 0) failures.push('TESTE 2 Bling chamado');
  if (test6LlamaWon && test6HadBlingStock) {
    failures.push(
      'TESTE 6: responseFormatter.service.ts → formatBlingStructuredResponse — saída do Llama é usada diretamente sem validar contra o JSON do Bling',
    );
  }
  if (!test5MentionsErpIssue && flow5.assistantText?.includes('Não encontrei esse produto')) {
    failures.push(
      'TESTE 5: mensagem "Não encontrei esse produto" em not_configured/empty — não diz explicitamente "não consegui consultar o ERP"',
    );
  }

  if (failures.length > 0) {
    console.log('FALHAS DETECTADAS:');
    failures.forEach((f) => console.log(' -', f));
    console.log('\n❌ AINDA EXISTEM FALHAS');
  } else {
    console.log('\n✅ PRONTO PARA TESTE NO WHATSAPP');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
