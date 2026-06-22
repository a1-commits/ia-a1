'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Conversation, Memory, Message } from '@/types/models';

type SearchResponse = {
  query: string;
  keyword: {
    memories: Memory[];
    conversations: Conversation[];
    messages: (Message & { conversation: { id: string; title: string | null } })[];
  };
  semantic: {
    memories: { memory: Memory; score: number }[];
  };
};

export default function SearchPage(): React.ReactElement {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api<SearchResponse>('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query: q.trim(), limit: 12 }),
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha na busca');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 pb-28 md:px-8 md:pb-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Busca inteligente</h1>
        <p className="text-sm text-zinc-500">
          Texto em memórias e chats; similaridade semântica nas memórias quando a OpenAI está configurada no
          servidor.
        </p>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 flex max-w-xl flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="O que você procura?"
          className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-sm text-zinc-800 outline-none placeholder:text-zinc-500 focus:border-[var(--mobi-orange)]/60"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="min-h-12 rounded-2xl bg-[var(--mobi-orange)] px-6 text-sm font-medium text-white shadow-lg shadow-[rgba(239,75,26,0.28)] transition hover:brightness-105 disabled:opacity-40"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      {result && (
        <div className="space-y-8">
          {result.semantic.memories.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-zinc-700">Memórias similares (semântica)</h2>
              <ul className="space-y-2">
                {result.semantic.memories.map(({ memory, score }) => (
                  <li
                    key={memory.id}
                    className="rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-zinc-800">{memory.title}</span>
                      <span className="text-[10px] text-[var(--mobi-orange)]">
                        {(score * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <p className="line-clamp-3 text-zinc-500">{memory.content}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-medium text-zinc-700">Palavras-chave — memórias</h2>
            {result.keyword.memories.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhum resultado.</p>
            ) : (
              <ul className="space-y-2">
                {result.keyword.memories.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
                  >
                    <div className="font-medium text-zinc-800">{m.title}</div>
                    <div className="line-clamp-2">{m.content}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-zinc-700">Conversas</h2>
            {result.keyword.conversations.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhum resultado.</p>
            ) : (
              <ul className="space-y-2">
                {result.keyword.conversations.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
                  >
                    {c.title ?? 'Conversa'}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-zinc-700">Mensagens</h2>
            {result.keyword.messages.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhum resultado.</p>
            ) : (
              <ul className="space-y-2">
                {result.keyword.messages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-2xl border border-black/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
                  >
                    <div className="text-[10px] text-zinc-600">
                      {m.conversation.title ?? 'Conversa'} · {m.role}
                    </div>
                    <div className="line-clamp-3">{m.content}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
