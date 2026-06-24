'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { api, ApiError } from '@/lib/api';
import {
  PollFailureTracker,
} from '@agente-mobi/shared';
import type { Conversation, ConversationIdentity, Message } from '@/types/models';

type ChatResponse = {
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
  agentName: string;
  conversationIdentity: ConversationIdentity;
};

type AiStatus = {
  mode: 'real' | 'unavailable';
  label: string;
  reason: string | null;
};

type PollStatus = 'live' | 'updating' | 'error';

function isNearBottom(el: HTMLElement, threshold = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function formatSidebarMeta(c: Conversation): string {
  const channel = c.channelLabel ?? 'Interno';
  const agent = c.agentName?.trim() || 'MOBI';
  const date = c.lastMessageAt ?? c.updatedAt;
  const time = new Date(date);
  const hh = time.getHours().toString().padStart(2, '0');
  const mm = time.getMinutes().toString().padStart(2, '0');
  return `${channel} · ${agent} · ${hh}:${mm}`;
}

function ConversationList({
  conversations,
  activeId,
  loadingList,
  includeArchived,
  onToggleArchived,
  onSelect,
  onTogglePin,
  onClearAll,
}: {
  conversations: Conversation[];
  activeId: string | null;
  loadingList: boolean;
  includeArchived: boolean;
  onToggleArchived: (v: boolean) => void;
  onSelect: (id: string) => void;
  onTogglePin: (c: Conversation, e: React.MouseEvent) => void;
  onClearAll: () => void;
}): React.ReactElement {
  return (
    <>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => onToggleArchived(e.target.checked)}
          className="rounded border-white/20"
        />
        Mostrar arquivadas
      </label>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Conversas</div>
        {conversations.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[10px] text-[var(--moble-danger)] hover:underline"
          >
            Limpar todas
          </button>
        )}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {loadingList && <div className="text-xs text-[var(--muted)]">Carregando…</div>}
        {!loadingList && conversations.length === 0 && (
          <div className="text-xs text-[var(--muted)]">Nenhuma conversa ainda.</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`flex items-start gap-1 rounded-xl px-2 py-1 transition ${
              activeId === c.id ? 'bg-[var(--hover)]' : 'hover:bg-[var(--moble-light-gray)]'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition ${
                activeId === c.id ? 'font-medium text-[var(--primary)]' : 'text-[var(--fg)]'
              }`}
            >
              <div className="truncate text-xs font-medium">
                {c.displayTitle ?? c.contactName ?? c.title ?? 'Contato sem nome'}
              </div>
              <div className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
                {c.lastMessagePreview ?? '—'}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                {formatSidebarMeta(c)}
                {c.pinned ? ' · fixada' : ''}
                {c.archived ? ' · arquivo' : ''}
              </div>
            </button>
            <button
              type="button"
              title={c.pinned ? 'Desafixar' : 'Fixar'}
              onClick={(e) => onTogglePin(c, e)}
              className="shrink-0 rounded-lg px-2 py-2 text-[10px] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--primary)]"
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
  const [activeIdentity, setActiveIdentity] = useState<ConversationIdentity | null>(null);
  const [activeAgentName, setActiveAgentName] = useState('MOBI');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [forceNewConversation, setForceNewConversation] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<PollStatus>('live');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);
  const convPollTrackerRef = useRef(new PollFailureTracker());
  const msgPollTrackerRef = useRef(new PollFailureTracker());
  const pollInFlightRef = useRef(0);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const conversationsQuery = includeArchived ? '?includeArchived=true' : '';

  const applyPollStatus = useCallback(() => {
    const showError =
      convPollTrackerRef.current.shouldShowError() || msgPollTrackerRef.current.shouldShowError();
    setPollStatus((prev) => {
      if (showError) return 'error';
      if (pollInFlightRef.current > 0) return 'updating';
      return 'live';
    });
  }, []);

  const recordPollFailure = useCallback(
    (tracker: PollFailureTracker, err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return;
      tracker.recordFailure();
      applyPollStatus();
    },
    [applyPollStatus],
  );

  const recordPollSuccess = useCallback(
    (tracker: PollFailureTracker) => {
      tracker.recordSuccess();
      applyPollStatus();
    },
    [applyPollStatus],
  );

  const fetchConversations = useCallback(async (): Promise<Conversation[] | null> => {
    const res = await api<{ items: Conversation[] } | null>(`/api/conversations${conversationsQuery}`);
    if (res === null) return null;
    return res.items.filter((c) => c.channel !== 'agent_test');
  }, [conversationsQuery]);

  const applyConversationItems = useCallback((items: Conversation[]) => {
    setConversations(items);
    setActiveId((prev) => {
      if (prev && items.some((c) => c.id === prev)) return prev;
      return items[0]?.id ?? null;
    });
  }, []);

  const refreshConversations = useCallback(
    async (options?: { silent?: boolean; tracker?: PollFailureTracker }) => {
      const silent = options?.silent ?? true;
      const tracker = options?.tracker ?? convPollTrackerRef.current;
      if (!silent) setLoadingList(true);
      pollInFlightRef.current += 1;
      applyPollStatus();
      try {
        const items = await fetchConversations();
        if (items !== null) {
          applyConversationItems(items);
        }
        recordPollSuccess(tracker);
      } catch (err) {
        recordPollFailure(tracker, err);
        if (!silent) throw err;
      } finally {
        pollInFlightRef.current = Math.max(0, pollInFlightRef.current - 1);
        applyPollStatus();
        if (!silent) setLoadingList(false);
      }
    },
    [applyConversationItems, applyPollStatus, fetchConversations, recordPollFailure, recordPollSuccess],
  );

  const loadConversations = useCallback(
    async (silent = false) => {
      await refreshConversations({ silent, tracker: convPollTrackerRef.current });
    },
    [refreshConversations],
  );

  const fetchMessages = useCallback(
    async (id: string): Promise<{ messages: Message[]; identity: ConversationIdentity | null } | null> => {
      const res = await api<{ messages: Message[]; identity: ConversationIdentity | null } | null>(
        `/api/conversations/${id}/messages`,
      );
      if (res === null) return null;
      return { messages: res.messages, identity: res.identity ?? null };
    },
    [],
  );

  const refreshMessages = useCallback(
    async (id: string, options?: { initial?: boolean; tracker?: PollFailureTracker }) => {
      const initial = options?.initial ?? false;
      const tracker = options?.tracker ?? msgPollTrackerRef.current;
      if (initial) {
        setLoadingMsgs(true);
        stickToBottomRef.current = true;
      }
      const container = scrollContainerRef.current;
      const shouldStick =
        initial || stickToBottomRef.current || (container ? isNearBottom(container) : true);
      pollInFlightRef.current += 1;
      applyPollStatus();
      try {
        const loaded = await fetchMessages(id);
        if (loaded !== null) {
          setMessages(loaded.messages);
          if (loaded.identity) {
            setActiveIdentity(loaded.identity);
            setActiveAgentName(loaded.identity.agentName);
          }
          if (shouldStick) {
            requestAnimationFrame(() => {
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            });
          }
        }
        recordPollSuccess(tracker);
      } catch (err) {
        recordPollFailure(tracker, err);
        if (initial) throw err;
      } finally {
        pollInFlightRef.current = Math.max(0, pollInFlightRef.current - 1);
        applyPollStatus();
        if (initial) setLoadingMsgs(false);
      }
    },
    [applyPollStatus, fetchMessages, recordPollFailure, recordPollSuccess],
  );

  const loadMessages = useCallback(
    async (id: string) => {
      await refreshMessages(id, { initial: true, tracker: msgPollTrackerRef.current });
    },
    [refreshMessages],
  );

  const pollConversationsTick = useCallback(async () => {
    if (deleteBusy || sending) return;
    const items = await fetchConversations();
    if (items === null) return;
    applyConversationItems(items);
    const current = activeIdRef.current;
    if (current && !items.some((c) => c.id === current)) {
      setActiveId(items[0]?.id ?? null);
      if (!items[0]) {
        setMessages([]);
        setActiveIdentity(null);
      }
    }
  }, [applyConversationItems, deleteBusy, fetchConversations, sending]);

  const pollMessagesTick = useCallback(
    async (id: string) => {
      if (deleteBusy || sending) return;
      const loaded = await fetchMessages(id);
      if (loaded === null) return;
      const container = scrollContainerRef.current;
      const shouldStick = stickToBottomRef.current || (container ? isNearBottom(container) : true);
      setMessages(loaded.messages);
      if (loaded.identity) {
        setActiveIdentity(loaded.identity);
        setActiveAgentName(loaded.identity.agentName);
      }
      if (shouldStick) {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    },
    [deleteBusy, fetchMessages, sending],
  );

  const manualRefresh = useCallback(async () => {
    convPollTrackerRef.current.recordSuccess();
    msgPollTrackerRef.current.recordSuccess();
    applyPollStatus();
    await Promise.all([
      refreshConversations({ silent: true, tracker: convPollTrackerRef.current }),
      activeIdRef.current
        ? refreshMessages(activeIdRef.current, { tracker: msgPollTrackerRef.current })
        : Promise.resolve(),
    ]);
  }, [applyPollStatus, refreshConversations, refreshMessages]);

  useEffect(() => {
    void loadConversations(false);
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) {
      void loadMessages(activeId);
    } else {
      setMessages([]);
      setActiveIdentity(null);
      setActiveAgentName('MOBI');
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId = 0;

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      if (deleteBusy || sending) {
        schedule(convPollTrackerRef.current.nextDelayMs());
        return;
      }
      pollInFlightRef.current += 1;
      applyPollStatus();
      try {
        await pollConversationsTick();
        recordPollSuccess(convPollTrackerRef.current);
      } catch (err) {
        recordPollFailure(convPollTrackerRef.current, err);
      } finally {
        pollInFlightRef.current = Math.max(0, pollInFlightRef.current - 1);
        applyPollStatus();
        if (!cancelled) schedule(convPollTrackerRef.current.nextDelayMs());
      }
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    applyPollStatus,
    deleteBusy,
    pollConversationsTick,
    recordPollFailure,
    recordPollSuccess,
    sending,
  ]);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    let timeoutId = 0;

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      if (deleteBusy || sending) {
        schedule(msgPollTrackerRef.current.nextDelayMs());
        return;
      }
      pollInFlightRef.current += 1;
      applyPollStatus();
      try {
        await pollMessagesTick(activeId);
        recordPollSuccess(msgPollTrackerRef.current);
      } catch (err) {
        recordPollFailure(msgPollTrackerRef.current, err);
      } finally {
        pollInFlightRef.current = Math.max(0, pollInFlightRef.current - 1);
        applyPollStatus();
        if (!cancelled) schedule(msgPollTrackerRef.current.nextDelayMs());
      }
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeId,
    applyPollStatus,
    deleteBusy,
    pollMessagesTick,
    recordPollFailure,
    recordPollSuccess,
    sending,
  ]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshConversations({ silent: true, tracker: convPollTrackerRef.current });
      const id = activeIdRef.current;
      if (id) void refreshMessages(id, { tracker: msgPollTrackerRef.current });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshConversations, refreshMessages]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

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

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3000);
  }

  function handleScroll(): void {
    const container = scrollContainerRef.current;
    if (!container) return;
    stickToBottomRef.current = isNearBottom(container);
  }

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  const pollLabel =
    pollStatus === 'updating' ? 'Atualizando…' : pollStatus === 'error' ? 'Erro ao atualizar' : 'Ao vivo';

  const pollTone = pollStatus === 'live' ? 'success' : pollStatus === 'error' ? 'warning' : 'neutral';

  const headerTitle =
    activeIdentity?.displayTitle ??
    conversations.find((c) => c.id === activeId)?.displayTitle ??
    'Nova conversa';

  async function handleSend(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    stickToBottomRef.current = true;
    try {
      const res = await api<ChatResponse>('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          content: input.trim(),
          context: 'GERAL',
          forceNew: forceNewConversation,
        }),
      });
      setInput('');
      setForceNewConversation(false);
      setActiveId(res.conversationId);
      setActiveIdentity(res.conversationIdentity);
      setActiveAgentName(res.agentName);
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const next = [...prev];
        if (!ids.has(res.userMessage.id)) next.push(res.userMessage);
        if (!ids.has(res.assistantMessage.id)) next.push(res.assistantMessage);
        return next;
      });
      await loadConversations(true);
      await loadAiStatus();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  }

  async function newChat(): Promise<void> {
    setActiveId(null);
    setMessages([]);
    setActiveIdentity(null);
    setActiveAgentName('MOBI');
    setForceNewConversation(true);
    setSheetOpen(false);
    stickToBottomRef.current = true;
  }

  async function togglePin(c: Conversation, e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    try {
      await api(`/api/conversations/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !c.pinned }),
      });
      await loadConversations(true);
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteActiveConversation(): Promise<void> {
    if (!activeId) return;
    setDeleteBusy(true);
    try {
      await api(`/api/conversations/${activeId}`, { method: 'DELETE' });
      const remaining = conversations.filter((c) => c.id !== activeId);
      setConversations(remaining);
      setActiveId(remaining[0]?.id ?? null);
      if (remaining.length === 0) {
        setMessages([]);
        setActiveIdentity(null);
      }
      setConfirmDeleteOne(false);
      showFeedback('Conversa excluída do painel.');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Falha ao excluir conversa');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function deleteAllConversations(): Promise<void> {
    setDeleteBusy(true);
    try {
      await api('/api/conversations', { method: 'DELETE' });
      setConversations([]);
      setActiveId(null);
      setMessages([]);
      setActiveIdentity(null);
      setConfirmDeleteAll(false);
      showFeedback('Todas as conversas foram removidas do painel.');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Falha ao limpar conversas');
    } finally {
      setDeleteBusy(false);
    }
  }

  function selectConversation(id: string): void {
    setActiveId(id);
    setForceNewConversation(false);
    setSheetOpen(false);
    stickToBottomRef.current = true;
  }

  return (
    <div className="flex min-h-screen flex-col md:h-[100dvh]">
      <header className="border-b border-[var(--moble-border)] bg-white px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Central inteligente</div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--moble-black)]">Chat</h1>
            <p className="text-sm text-[var(--moble-muted)]">Conversas por contato, canal e agente.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {aiStatus && (
                <Badge tone={aiStatus.mode === 'real' ? 'success' : 'warning'}>{aiStatus.label}</Badge>
              )}
              <Badge tone={pollTone}>{pollLabel}</Badge>
            </div>
            {aiStatus?.reason && aiStatus.mode === 'unavailable' && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">{aiStatus.reason}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              onClick={() => void manualRefresh()}
              variant="ghost"
              className="px-3 py-2 text-xs"
              title="Forçar atualização da lista e mensagens"
            >
              Atualizar
            </Button>
            <Button
              onClick={() => setSheetOpen(true)}
              variant="ghost"
              className="px-3 py-2 text-xs md:hidden"
            >
              Conversas
            </Button>
            {activeId && (
              <Button
                onClick={() => setConfirmDeleteOne(true)}
                variant="ghost"
                className="px-3 py-2 text-xs text-[var(--moble-danger)]"
              >
                Excluir conversa
              </Button>
            )}
            <Button onClick={() => void newChat()} variant="accent" className="px-3 py-2 text-xs">
              Nova conversa
            </Button>
          </div>
        </div>
        {feedback && (
          <div className="mt-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-3 py-2 text-xs text-[var(--fg)]">
            {feedback}
          </div>
        )}
      </header>

      <ConfirmDialog
        open={confirmDeleteOne}
        title="Excluir conversa"
        message="Excluir esta conversa do painel? As mensagens serão removidas do sistema, mas isso não apaga o WhatsApp do celular."
        confirmLabel="Excluir"
        busy={deleteBusy}
        onConfirm={() => void deleteActiveConversation()}
        onCancel={() => setConfirmDeleteOne(false)}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        title="Limpar todas as conversas"
        message="Tem certeza? Isso remove todas as conversas do painel."
        confirmLabel="Limpar tudo"
        busy={deleteBusy}
        onConfirm={() => void deleteAllConversations()}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      {sheetOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Fechar lista"
            onClick={() => setSheetOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[72vh] flex-col rounded-t-2xl border border-[var(--border)] bg-white p-4 shadow-2xl md:hidden">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              loadingList={loadingList}
              includeArchived={includeArchived}
              onToggleArchived={(v) => setIncludeArchived(v)}
              onSelect={selectConversation}
              onTogglePin={(c, e) => void togglePin(c, e)}
              onClearAll={() => setConfirmDeleteAll(true)}
            />
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-[max(7rem,env(safe-area-inset-bottom))] pt-4 md:flex-row md:px-8 md:pb-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-xl border border-[var(--moble-border)] bg-white p-4 text-sm shadow-sm md:flex">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            loadingList={loadingList}
            includeArchived={includeArchived}
            onToggleArchived={(v) => setIncludeArchived(v)}
            onSelect={(id) => setActiveId(id)}
            onTogglePin={(c, e) => void togglePin(c, e)}
            onClearAll={() => setConfirmDeleteAll(true)}
          />
        </aside>

        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--moble-border)] bg-white shadow-sm">
          {(activeId || activeIdentity) && (
            <div className="border-b border-[var(--moble-border)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--fg)]">{headerTitle}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {activeIdentity?.channelLabel ?? 'Interno'} · Agente responsável:{' '}
                    {activeIdentity?.agentName ?? activeAgentName}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled
                  title="Em breve"
                  className="shrink-0 px-2 py-1 text-[10px] text-[var(--muted)]"
                >
                  Trocar agente
                </Button>
              </div>
            </div>
          )}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {loadingMsgs && <div className="text-sm text-[var(--muted)]">Carregando mensagens…</div>}
            {!loadingMsgs && messages.length === 0 && (
              <EmptyState
                title="Nenhuma mensagem ainda"
                description="Envie uma mensagem para iniciar a conversa com o agente."
              />
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[min(100%,28rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'USER'
                      ? 'bg-[var(--primary)] text-white'
                      : 'border border-[var(--moble-border)] bg-[var(--moble-bg)] text-[var(--fg)]'
                  }`}
                >
                  <div
                    className={`mb-1 text-[10px] uppercase tracking-wide ${
                      m.role === 'USER' ? 'text-white/80' : 'text-[var(--muted)]'
                    }`}
                  >
                    {m.role === 'USER' ? 'Cliente / Você' : activeAgentName}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-[var(--muted)]">O agente está respondendo…</div>}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => void handleSend(e)}
            className="border-t border-[var(--moble-border)] p-3 md:p-4"
          >
            {sendError && <p className="mb-2 text-xs text-[var(--moble-danger)]">{sendError}</p>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escreva sua mensagem…"
                className="premium-input min-h-11 min-w-0 flex-1 text-base md:text-sm"
              />
              <Button type="submit" disabled={!canSend} variant="accent" className="min-h-11 shrink-0 px-5">
                Enviar
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
