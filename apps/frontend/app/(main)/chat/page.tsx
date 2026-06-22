'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import type { ContextType, Conversation, Message } from '@/types/models';

type LeadDecision = {
  leadScore: number;
  readinessScore: number;
  intentLevel: string;
  recommendedAction: string;
  reason?: string;
  missingInfo: string[];
  nextMessageSuggestion: string;
  shouldCreateTask?: boolean;
  shouldSaveMemory?: boolean;
  shouldSuggestImage?: boolean;
  shouldGenerateImage?: boolean;
  shouldEscalateToHuman?: boolean;
};

type ChatResponse = {
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
  agentMeta?: {
    contextDetected: ContextType;
    kindDetected: 'message' | 'memory' | 'task' | 'reflection';
    confidence: number;
    autoCreated: { memoryId?: string; taskId?: string; reflectionId?: string };
    rationale: string;
    leadDecision?: LeadDecision;
    imageJob?: { id: string; status: string };
  };
};

type AiStatus = {
  mode: 'real' | 'mock';
  label: 'IA REAL ATIVA' | 'MODO SIMULAÇÃO (sem crédito OpenAI)';
  reason: string | null;
};

type ProposalDraft = {
  title: string;
  summary: string;
  knownInfo: string[];
  missingInfo: string[];
  recommendedAction: string;
  text: string;
  decision: LeadDecision;
};

type ImageBrief = {
  title: string;
  canGenerate: boolean;
  missingInfo: string[];
  customerMessage: string;
  brief: {
    ambiente: string;
    medidas: string;
    estilo: string;
    cores: string;
    linhaMoble: string;
    itensPrincipais: string[];
    iluminacao: string;
    observacoes: string;
    objetivoDaImagem: string;
  };
  visualPrompt: string;
  decision: LeadDecision;
};

type PersistedImage = {
  id: string;
  fileUrl: string;
  fileName: string;
  byteSize: number;
  mimeType: string;
};

type ImageJob = {
  id: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  prompt: string;
  visualBrief: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  generatedImage: null | {
    id: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
    createdAt: string;
  };
};

type HandoffStatus = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
} | null;

function ConversationList({
  conversations,
  activeId,
  loadingList,
  includeArchived,
  onToggleArchived,
  onSelect,
  onTogglePin,
}: {
  conversations: Conversation[];
  activeId: string | null;
  loadingList: boolean;
  includeArchived: boolean;
  onToggleArchived: (v: boolean) => void;
  onSelect: (id: string) => void;
  onTogglePin: (c: Conversation, e: React.MouseEvent) => void;
}): React.ReactElement {
  return (
    <>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => onToggleArchived(e.target.checked)}
          className="rounded border-white/20"
        />
        Mostrar arquivadas
      </label>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Conversas</div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {loadingList && <div className="text-xs text-zinc-500">Carregando…</div>}
        {!loadingList && conversations.length === 0 && (
          <div className="text-xs text-zinc-500">Nenhuma conversa ainda.</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`flex items-start gap-1 rounded-xl px-2 py-1 transition ${
              activeId === c.id ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-xs transition ${
                activeId === c.id ? 'text-white' : 'text-zinc-400'
              }`}
            >
              <div className="line-clamp-2">{c.title ?? 'Conversa'}</div>
              <div className="text-[10px] text-zinc-600">
                {c.context}
                {c.pinned ? ' · fixada' : ''}
                {c.archived ? ' · arquivo' : ''}
              </div>
            </button>
            <button
              type="button"
              title={c.pinned ? 'Desafixar' : 'Fixar'}
              onClick={(e) => onTogglePin(c, e)}
              className="shrink-0 rounded-lg px-2 py-2 text-[10px] text-zinc-500 hover:bg-black/5 hover:text-zinc-800"
            >
              {c.pinned ? '★' : '☆'}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default function ChatPage(): React.ReactElement {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState<ContextType>('GERAL');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [leadDecision, setLeadDecision] = useState<LeadDecision | null>(null);
  const [agentNotesByAssistantId, setAgentNotesByAssistantId] = useState<Record<string, string>>({});
  const [quickActionBusy, setQuickActionBusy] = useState<string | null>(null);
  const [quickActionFeedback, setQuickActionFeedback] = useState<string | null>(null);
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft | null>(null);
  const [imageBrief, setImageBrief] = useState<ImageBrief | null>(null);
  const [persistedImage, setPersistedImage] = useState<PersistedImage | null>(null);
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const q = includeArchived ? '?includeArchived=true' : '';
      const res = await api<{ items: Conversation[] }>(`/api/conversations${q}`);
      setConversations(res.items);
    } finally {
      setLoadingList(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true);
    setLeadDecision(null);
    setProposalDraft(null);
    setImageBrief(null);
    setPersistedImage(null);
    setImageJob(null);
    setHandoffStatus(null);
    setQuickActionFeedback(null);
    try {
      const [res, decisionRes, handoffRes, imageBriefRes] = await Promise.all([
        api<{ messages: Message[] }>(`/api/conversations/${id}/messages`),
        api<{ decision: LeadDecision }>(`/api/conversations/${id}/lead-decision`),
        api<{ handoff: HandoffStatus }>(`/api/conversations/${id}/handoff`),
        api<{ imageBrief: ImageBrief; imageJob: ImageJob | null }>(`/api/conversations/${id}/image-brief`),
      ]);
      setMessages(res.messages);
      setLeadDecision(decisionRes.decision);
      setHandoffStatus(handoffRes.handoff);
      setImageBrief(imageBriefRes.imageBrief);
      setImageJob(imageBriefRes.imageJob);
      setPersistedImage(
        imageBriefRes.imageJob?.generatedImage
          ? {
              id: imageBriefRes.imageJob.generatedImage.id,
              fileUrl: `/api/files/generated-images/${imageBriefRes.imageJob.generatedImage.id}`,
              fileName: imageBriefRes.imageJob.generatedImage.fileName,
              byteSize: imageBriefRes.imageJob.generatedImage.byteSize,
              mimeType: imageBriefRes.imageJob.generatedImage.mimeType,
            }
          : null,
      );
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) {
      void loadMessages(activeId);
    } else {
      setMessages([]);
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!activeId || !imageJob || !['PENDING', 'GENERATING'].includes(imageJob.status)) return;
    const timer = window.setInterval(() => {
      void loadMessages(activeId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeId, imageJob, loadMessages]);

  const loadAiStatus = useCallback(async () => {
    try {
      const res = await api<AiStatus>('/api/ai/status');
      setAiStatus(res);
    } catch {
      setAiStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadAiStatus();
  }, [loadAiStatus]);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations],
  );

  function buildConversationSummary(): string {
    const title = activeConversation?.title ?? 'Conversa sem título';
    const recentMessages = messages
      .slice(-8)
      .map((message) => `${message.role === 'USER' ? 'Cliente' : 'MOBI'}: ${message.content.slice(0, 260)}`)
      .join('\n');

    return [
      `Conversa: ${title}`,
      leadDecision
        ? `Decisão atual: ${leadDecision.intentLevel} · lead ${leadDecision.leadScore} · pronto ${leadDecision.readinessScore}`
        : null,
      recentMessages,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  async function runQuickAction(action: 'task' | 'memory' | 'handoff' | 'proposal' | 'image' | 'generateImage'): Promise<void> {
    if (!leadDecision) return;
    setQuickActionBusy(action);
    setQuickActionFeedback(null);
    try {
      const title = activeConversation?.title ?? 'lead comercial';
      const summary = buildConversationSummary();
      if (action === 'task') {
        await api('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: `Atender ${title}`,
            description: summary,
            priority: leadDecision.leadScore > 70 ? 'HIGH' : 'MEDIUM',
            context: 'MOBLE',
          }),
        });
        setQuickActionFeedback('Tarefa criada para acompanhamento comercial.');
      }

      if (action === 'memory') {
        await api('/api/memories', {
          method: 'POST',
          body: JSON.stringify({
            title: `Lead: ${title}`,
            content: summary,
            context: 'MOBLE',
            type: 'PERMANENTE',
          }),
        });
        setQuickActionFeedback('Memória salva na base do MOBI.');
      }

      if (action === 'handoff') {
        if (!activeId) return;
        const res = await api<{ handoff: HandoffStatus; alreadyOpen: boolean }>(`/api/conversations/${activeId}/handoff`, {
          method: 'POST',
          body: JSON.stringify({
            reason: `Escalado pelo painel. ${leadDecision.reason ?? 'Atendimento humano solicitado.'}`,
          }),
        });
        setHandoffStatus(res.handoff);
        setQuickActionFeedback(res.alreadyOpen ? 'Esta conversa já estava com handoff aberto para Ronan.' : 'Conversa escalada para Ronan.');
      }

      if (action === 'proposal') {
        if (!activeId) return;
        const res = await api<{ draft: ProposalDraft }>(`/api/conversations/${activeId}/proposal-draft`);
        setProposalDraft(res.draft);
        setQuickActionFeedback('Rascunho de proposta gerado com base na conversa.');
      }

      if (action === 'image') {
        if (!activeId) return;
        const res = await api<{ imageBrief: ImageBrief; imageJob: ImageJob | null }>(`/api/conversations/${activeId}/image-brief`);
        setImageBrief(res.imageBrief);
        setImageJob(res.imageJob);
        setPersistedImage(null);
        setInput(res.imageBrief.customerMessage);
        setQuickActionFeedback('Brief visual preparado com base na conversa.');
      }

      if (action === 'generateImage') {
        if (!activeId) return;
        const res = await api<{
          imageBrief: ImageBrief;
          imageJob: ImageJob;
          generatedImage: null;
          persistedImage: null;
          assistantMessage: Message;
        }>(`/api/conversations/${activeId}/generate-image`, {
          method: 'POST',
        });
        setImageBrief(res.imageBrief);
        setImageJob(res.imageJob);
        setPersistedImage(null);
        setMessages((prev) => [...prev, res.assistantMessage]);
        setQuickActionFeedback('Job de imagem criado. O status será atualizado automaticamente.');
      }
    } catch (err) {
      console.error(err);
      setQuickActionFeedback(err instanceof Error ? err.message : 'Falha ao executar ação rápida.');
    } finally {
      setQuickActionBusy(null);
    }
  }

  async function saveProposalDraft(): Promise<void> {
    if (!proposalDraft) return;
    setQuickActionBusy('saveProposal');
    setQuickActionFeedback(null);
    try {
      await api('/api/proposals', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          title: proposalDraft.title,
          content: proposalDraft.text,
          summary: proposalDraft.summary,
          status: 'DRAFT',
        }),
      });
      setQuickActionFeedback('Proposta salva como rascunho comercial.');
    } catch (err) {
      console.error(err);
      setQuickActionFeedback(err instanceof Error ? err.message : 'Falha ao salvar proposta.');
    } finally {
      setQuickActionBusy(null);
    }
  }

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const res = await api<ChatResponse>('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          content: input.trim(),
          context,
        }),
      });
      setInput('');
      setActiveId(res.conversationId);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      if (res.agentMeta) {
        setLeadDecision(res.agentMeta.leadDecision ?? null);
        const tags: string[] = [
          `contexto: ${res.agentMeta.contextDetected.toLowerCase()}`,
          `tipo: ${res.agentMeta.kindDetected}`,
        ];
        if (res.agentMeta.autoCreated.memoryId) tags.push('memória criada');
        if (res.agentMeta.autoCreated.taskId) tags.push('tarefa criada');
        if (res.agentMeta.autoCreated.reflectionId) tags.push('reflexão criada');
        if (res.agentMeta.imageJob) tags.push(`imagem ${res.agentMeta.imageJob.status.toLowerCase()}`);
        if (res.agentMeta.imageJob && activeId) {
          void loadMessages(res.conversationId);
        }
        setAgentNotesByAssistantId((prev) => ({
          ...prev,
          [res.assistantMessage.id]: tags.join(' • '),
        }));
      }
      await loadConversations();
      await loadAiStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function newChat(): Promise<void> {
    setActiveId(null);
    setMessages([]);
    setLeadDecision(null);
    setProposalDraft(null);
    setImageBrief(null);
    setPersistedImage(null);
    setImageJob(null);
    setHandoffStatus(null);
    setSheetOpen(false);
  }

  async function togglePin(c: Conversation, e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    try {
      await api(`/api/conversations/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !c.pinned }),
      });
      await loadConversations();
    } catch (err) {
      console.error(err);
    }
  }

  function selectConversation(id: string): void {
    setActiveId(id);
    setSheetOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col md:h-[100dvh]">
      <header className="border-b border-[var(--moble-border)] bg-white/72 px-4 py-4 backdrop-blur md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Central inteligente</div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--moble-black)]">Chat comercial</h1>
            <p className="text-sm text-[var(--moble-muted)]">Conversas, decisões do MOBI e contexto do lead em um só lugar.</p>
            {aiStatus && (
              <Badge tone={aiStatus.mode === 'real' ? 'success' : 'warning'} className="mt-3">
                {aiStatus.label}
              </Badge>
            )}
            {aiStatus?.reason && aiStatus.mode === 'mock' && (
              <p className="mt-1 text-[11px] text-zinc-500">{aiStatus.reason}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => setSheetOpen(true)}
              variant="ghost"
              className="px-3 py-2 text-xs md:hidden"
            >
              Conversas
            </Button>
            <Button
              onClick={() => void newChat()}
              variant="accent"
              className="px-3 py-2 text-xs"
            >
              Nova conversa
            </Button>
          </div>
        </div>
      </header>

      {sheetOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Fechar lista"
            onClick={() => setSheetOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[72vh] flex-col rounded-t-2xl border border-black/10 bg-[var(--panel)] p-4 shadow-2xl md:hidden">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/10" />
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              loadingList={loadingList}
              includeArchived={includeArchived}
              onToggleArchived={(v) => setIncludeArchived(v)}
              onSelect={selectConversation}
              onTogglePin={(c, e) => void togglePin(c, e)}
            />
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-[max(7rem,env(safe-area-inset-bottom))] pt-4 md:flex-row md:px-8 md:pb-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-[22px] border border-[var(--moble-border)] bg-white/86 p-4 text-sm shadow-[0_8px_30px_rgba(14,14,14,0.04)] md:flex">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            loadingList={loadingList}
            includeArchived={includeArchived}
            onToggleArchived={(v) => setIncludeArchived(v)}
            onSelect={(id) => setActiveId(id)}
            onTogglePin={(c, e) => void togglePin(c, e)}
          />
        </aside>

        <section className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-[var(--moble-border)] bg-white/92 shadow-[0_8px_30px_rgba(14,14,14,0.04)]">
          <div className="flex items-center justify-between border-b border-[var(--moble-border)] px-4 py-3 text-xs text-[var(--moble-muted)]">
            <span>Contexto da nova conversa</span>
            <select
              value={context}
              onChange={(e) => setContext(e.target.value as ContextType)}
              className="premium-input max-w-[180px]"
            >
              <option value="PESSOAL">Pessoal</option>
              <option value="MOBLE">Moble</option>
              <option value="KARRUN">Karrun</option>
              <option value="GERAL">Geral</option>
            </select>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loadingMsgs && <div className="text-sm text-zinc-500">Carregando mensagens…</div>}
            {!loadingMsgs && messages.length === 0 && (
              <EmptyState title="Nenhuma mensagem ainda" description="Envie uma mensagem para iniciar a análise comercial do MOBI." />
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[min(100%,28rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'USER'
                      ? 'bg-[var(--moble-black)] text-white'
                      : 'border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 text-[var(--moble-black)]'
                  }`}
                >
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-white/60">
                    {m.role === 'USER' ? 'Cliente / Você' : 'MOBI'}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  {m.role === 'ASSISTANT' && agentNotesByAssistantId[m.id] && (
                    <div className="mt-2 border-t border-black/10 pt-2 text-[10px] text-zinc-500">
                      {agentNotesByAssistantId[m.id]}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-zinc-500">O agente está respondendo…</div>}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => void handleSend(e)}
            className="border-t border-[var(--moble-border)] p-3 md:p-4"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escreva sua mensagem…"
                className="premium-input min-h-11 min-w-0 flex-1 text-base md:text-sm"
              />
              <Button
                type="submit"
                disabled={!canSend}
                variant="accent"
                className="min-h-11 shrink-0 px-5"
              >
                Enviar
              </Button>
            </div>
          </form>
        </section>
        <aside className="hidden w-80 shrink-0 rounded-[22px] border border-[var(--moble-border)] bg-white/86 p-5 shadow-[0_8px_30px_rgba(14,14,14,0.04)] xl:block">
          <div className="eyebrow">Contexto do lead</div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="mt-1 text-lg font-bold text-[var(--moble-black)]">Decisão comercial</h2>
            {handoffStatus && <Badge tone={handoffStatus.status === 'DONE' ? 'success' : 'danger'}>com Ronan</Badge>}
          </div>
          {leadDecision ? (
            <div className="mt-5 space-y-4">
              {handoffStatus && (
                <div className="rounded-2xl border border-[var(--moble-danger)]/20 bg-[var(--moble-danger)]/8 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-danger)]">Atendimento humano</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--moble-gray)]">
                    Conversa escalada para Ronan. Status: {handoffStatus.status.toLowerCase()}.
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--moble-muted)]">
                    Aberto em {new Date(handoffStatus.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[var(--moble-bg)] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--moble-muted)]">Lead score</div>
                  <div className="mt-1 text-2xl font-bold">{leadDecision.leadScore}</div>
                </div>
                <div className="rounded-2xl bg-[var(--moble-bg)] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--moble-muted)]">Readiness</div>
                  <div className="mt-1 text-2xl font-bold">{leadDecision.readinessScore}</div>
                </div>
              </div>
              <Badge tone={leadDecision.intentLevel === 'quente' || leadDecision.intentLevel === 'pronto_para_fechamento' ? 'success' : 'accent'}>
                {leadDecision.intentLevel.replaceAll('_', ' ')}
              </Badge>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Próxima ação</div>
                <p className="mt-1 text-sm text-[var(--moble-black)]">{leadDecision.recommendedAction.replaceAll('_', ' ')}</p>
              </div>
              {leadDecision.reason && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Motivo</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--moble-gray)]">{leadDecision.reason}</p>
                </div>
              )}
              {leadDecision.missingInfo.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Faltando</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {leadDecision.missingInfo.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/60 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Resposta sugerida</div>
                <p className="mt-2 text-sm leading-6 text-[var(--moble-gray)]">{leadDecision.nextMessageSuggestion}</p>
                <Button
                  type="button"
                  variant="accent"
                  className="mt-3 w-full justify-center text-xs"
                  onClick={() => setInput(leadDecision.nextMessageSuggestion)}
                >
                  Usar resposta sugerida
                </Button>
              </div>
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center text-xs"
                  disabled={quickActionBusy !== null}
                  onClick={() => void runQuickAction('task')}
                >
                  {quickActionBusy === 'task' ? 'Criando…' : 'Criar tarefa'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center text-xs"
                  disabled={quickActionBusy !== null}
                  onClick={() => void runQuickAction('memory')}
                >
                  {quickActionBusy === 'memory' ? 'Salvando…' : 'Salvar memória'}
                </Button>
                <Button
                  type="button"
                  variant={handoffStatus ? 'accent' : 'ghost'}
                  className="w-full justify-center text-xs"
                  disabled={quickActionBusy !== null}
                  onClick={() => void runQuickAction('handoff')}
                >
                  {quickActionBusy === 'handoff' ? 'Escalando…' : handoffStatus ? 'Handoff aberto' : 'Escalar para Ronan'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center text-xs"
                  disabled={quickActionBusy !== null}
                  onClick={() => void runQuickAction('proposal')}
                >
                  {quickActionBusy === 'proposal' ? 'Criando…' : 'Gerar proposta'}
                </Button>
                <Button
                  type="button"
                  variant={leadDecision.shouldSuggestImage ? 'accent' : 'ghost'}
                  className="w-full justify-center text-xs"
                  disabled={quickActionBusy !== null}
                  onClick={() => void runQuickAction('image')}
                >
                  {quickActionBusy === 'image' ? 'Preparando…' : 'Sugerir imagem'}
                </Button>
              </div>
              {proposalDraft && (
                <div className="rounded-2xl border border-[var(--moble-accent)]/30 bg-[var(--moble-accent-soft)]/35 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Rascunho de proposta</div>
                  <h3 className="mt-1 font-bold text-[var(--moble-black)]">{proposalDraft.title}</h3>
                  {proposalDraft.knownInfo.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proposalDraft.knownInfo.slice(0, 4).map((item) => (
                        <Badge key={item} tone="accent">{item}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/78 p-3 text-xs leading-5 text-[var(--moble-gray)]">
                    {proposalDraft.text}
                  </p>
                  <div className="mt-3 grid gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      className="w-full justify-center text-xs"
                      onClick={() => setInput(proposalDraft.text)}
                    >
                      Usar proposta no chat
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center text-xs"
                      disabled={quickActionBusy !== null}
                      onClick={() => void saveProposalDraft()}
                    >
                      {quickActionBusy === 'saveProposal' ? 'Salvando…' : 'Salvar proposta'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center text-xs"
                      disabled={quickActionBusy !== null}
                      onClick={() => void runQuickAction('task')}
                    >
                      Criar tarefa de acompanhamento
                    </Button>
                  </div>
                </div>
              )}
              {imageBrief && (
                <div className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">Brief visual</div>
                      <h3 className="mt-1 font-bold text-[var(--moble-black)]">{imageBrief.title}</h3>
                    </div>
                    <Badge tone={imageBrief.canGenerate ? 'success' : 'warning'}>
                      {imageBrief.canGenerate ? 'pronto' : 'faltam dados'}
                    </Badge>
                  </div>
                  {imageJob && (
                    <div className="mt-3 rounded-2xl border border-[var(--moble-border)] bg-white p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Status da imagem</span>
                        <Badge
                          tone={
                            imageJob.status === 'COMPLETED'
                              ? 'success'
                              : imageJob.status === 'FAILED'
                                ? 'danger'
                                : 'accent'
                          }
                        >
                          {imageJob.status.toLowerCase()}
                        </Badge>
                      </div>
                      {imageJob.status === 'GENERATING' || imageJob.status === 'PENDING' ? (
                        <p className="mt-2 text-[var(--moble-muted)]">Gerando imagem em segundo plano…</p>
                      ) : null}
                      {imageJob.errorMessage && (
                        <p className="mt-2 text-[var(--moble-danger)]">
                          Falha ao gerar imagem. Tente novamente ou copie o prompt visual.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white p-3">
                      <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Ambiente</div>
                      <div className="mt-1 text-[var(--moble-black)]">{imageBrief.brief.ambiente || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Linha</div>
                      <div className="mt-1 text-[var(--moble-black)]">{imageBrief.brief.linhaMoble}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Medidas</div>
                      <div className="mt-1 text-[var(--moble-black)]">{imageBrief.brief.medidas || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <div className="font-bold uppercase tracking-wide text-[var(--moble-muted)]">Estilo</div>
                      <div className="mt-1 text-[var(--moble-black)]">{imageBrief.brief.estilo || '-'}</div>
                    </div>
                  </div>
                  {imageBrief.missingInfo.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {imageBrief.missingInfo.map((item) => (
                        <Badge key={item} tone="warning">{item}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/78 p-3 text-xs leading-5 text-[var(--moble-gray)]">
                    {imageBrief.visualPrompt}
                  </p>
                  <div className="mt-3 grid gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      className="w-full justify-center text-xs"
                      onClick={() => setInput(imageBrief.customerMessage)}
                    >
                      Usar mensagem de aceite
                    </Button>
                    <Button
                      type="button"
                      variant={imageBrief.canGenerate ? 'accent' : 'ghost'}
                      className="w-full justify-center text-xs"
                      disabled={quickActionBusy !== null || !imageBrief.canGenerate}
                      onClick={() => void runQuickAction('generateImage')}
                    >
                      {quickActionBusy === 'generateImage' ? 'Gerando...' : 'Gerar imagem real'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        void navigator.clipboard?.writeText(imageBrief.visualPrompt);
                        setQuickActionFeedback('Prompt visual copiado para a área de transferência.');
                      }}
                    >
                      Copiar prompt visual
                    </Button>
                  </div>
                  {persistedImage && (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--moble-border)] bg-white">
                      <img
                        src={persistedImage.fileUrl}
                        alt="Imagem ilustrativa gerada para alinhamento visual"
                        className="h-auto w-full object-cover"
                      />
                      <div className="p-3 text-[11px] leading-5 text-[var(--moble-muted)]">
                        Imagem ilustrativa persistida para alinhamento visual, não projeto técnico final.
                        {` Arquivo: ${persistedImage.fileName}.`}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {quickActionFeedback && (
                <div className="rounded-2xl border border-[var(--moble-border)] bg-white p-3 text-xs leading-5 text-[var(--moble-muted)]">
                  {quickActionFeedback}
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Sem decisão ainda" description="A decisão aparece após a primeira resposta do MOBI." />
          )}
        </aside>
      </div>
    </div>
  );
}
