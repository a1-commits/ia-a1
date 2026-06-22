'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/Card';
import { SelectField } from '@/components/SelectField';
import { api } from '@/lib/api';
import type { ContextType, Reflection } from '@/types/models';

export default function ReflectionsPage(): React.ReactElement {
  const [items, setItems] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [context, setContext] = useState<ContextType>('GERAL');
  const [filterContext, setFilterContext] = useState<ContextType | 'ALL'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterContext !== 'ALL' ? `?context=${filterContext}` : '';
      const res = await api<{ items: Reflection[] }>(`/api/reflections${qs}`);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [filterContext]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    await api<Reflection>('/api/reflections', {
      method: 'POST',
      body: JSON.stringify({ title, content, context }),
    });
    setTitle('');
    setContent('');
    await load();
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Reflexões</h1>
        <p className="text-sm text-zinc-500">Notas para clareza e decisões.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-zinc-700">Nova reflexão</h2>
          <form className="space-y-3" onSubmit={(e) => void handleCreate(e)}>
            <label className="block space-y-1.5 text-sm">
              <span className="text-zinc-400">Título</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-zinc-400">Conteúdo</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              />
            </label>
            <SelectField
              label="Contexto"
              value={context}
              onChange={(e) => setContext(e.target.value as ContextType)}
            >
              <option value="PESSOAL">Pessoal</option>
              <option value="MOBLE">Moble</option>
              <option value="KARRUN">Karrun</option>
              <option value="GERAL">Geral</option>
            </SelectField>
            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--mobi-orange)] py-2.5 text-sm font-medium text-white hover:brightness-105"
            >
              Salvar reflexão
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <SelectField
            label="Filtrar por contexto"
            value={filterContext}
            onChange={(e) => setFilterContext(e.target.value as ContextType | 'ALL')}
            className="max-w-xs"
          >
            <option value="ALL">Todos</option>
            <option value="PESSOAL">Pessoal</option>
            <option value="MOBLE">Moble</option>
            <option value="KARRUN">Karrun</option>
            <option value="GERAL">Geral</option>
          </SelectField>

          {loading && <div className="text-sm text-zinc-500">Carregando…</div>}
          {!loading && items.length === 0 && (
            <Card className="text-sm text-zinc-500">Nenhuma reflexão ainda.</Card>
          )}
          <div className="space-y-3">
            {items.map((r) => (
              <Card key={r.id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-[10px] uppercase text-zinc-500">{r.context}</div>
                </div>
                <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{r.content}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
