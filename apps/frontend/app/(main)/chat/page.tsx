'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import type { Conversation, Message } from '@/types/models';

type ChatResponse = {
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
};

type AiStatus = {
  mode: 'real' | 'mock';
  label: 'IA REAL ATIVA' | 'MODO SIMULAÇÃO (sem crédito OpenAI)';
  reason: string | null;
};

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
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
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
    try {
      const res = await api<{ messages: Message[] }>(`/api/conversations/${id}/messages`);
      setMessages(res.messages);
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
          context: 'GERAL',
        }),
      });
      setInput('');
      setActiveId(res.conversationId);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
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
            <h1 className="text-2xl font-bold tracking-tight text-[var(--moble-black)]">Chat</h1>
            <p className="text-sm text-[var(--moble-muted)]">Conversas com a recepcionista Mobi.</p>
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loadingMsgs && <div className="text-sm text-zinc-500">Carregando mensagens…</div>}
            {!loadingMsgs && messages.length === 0 && (
              <EmptyState title="Nenhuma mensagem ainda" description="Envie uma mensagem para iniciar a conversa com a Mobi." />
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
      </div>
    </div>
  );
}
