'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { SelectField } from '@/components/SelectField';
import { api } from '@/lib/api';
import type { ContextType, Memory, MemoryType } from '@/types/models';

type MemoryCategory = 'Clientes' | 'Projetos' | 'Processos' | 'Preferências' | 'Materiais' | 'Geral';

const CATEGORY_ORDER: MemoryCategory[] = ['Clientes', 'Projetos', 'Processos', 'Preferências', 'Materiais', 'Geral'];

function getMemoryCategory(memory: Memory): MemoryCategory {
  const text = `${memory.title} ${memory.content}`.toLowerCase();
  if (/cliente|lead|contato|atendimento|ronan/.test(text)) return 'Clientes';
  if (/projeto|cozinha|suite|suíte|closet|banheiro|lavanderia|painel|gourmet|medida|planta/.test(text)) return 'Projetos';
  if (/processo|operacao|operação|rotina|prazo|entrega|instala/.test(text)) return 'Processos';
  if (/prefer|gosta|estilo|acabamento|cor|pagamento/.test(text)) return 'Preferências';
  if (/mdf|madeira|material|puxador|ferragem|linha|basic|confort|select/.test(text)) return 'Materiais';
  return 'Geral';
}

function categoryTone(category: MemoryCategory): 'neutral' | 'accent' | 'success' | 'warning' {
  if (category === 'Clientes') return 'accent';
  if (category === 'Projetos') return 'success';
  if (category === 'Preferências') return 'warning';
  return 'neutral';
}

export default function MemoriesPage(): React.ReactElement {
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [context, setContext] = useState<ContextType>('GERAL');
  const [type, setType] = useState<MemoryType>('PERMANENTE');
  const [filterContext, setFilterContext] = useState<ContextType | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<MemoryType | 'ALL'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterContext !== 'ALL') qs.set('context', filterContext);
      if (filterType !== 'ALL') qs.set('type', filterType);
      const q = qs.toString();
      const res = await api<{ items: Memory[] }>(`/api/memories${q ? `?${q}` : ''}`);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [filterContext, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (editingId) {
      await api<Memory>(`/api/memories/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, content, context, type }),
      });
      setFeedback('Memória atualizada com sucesso.');
    } else {
      await api<Memory>('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ title, content, context, type }),
      });
      setFeedback('Memória salva na base do MOBI.');
    }
    setTitle('');
    setContent('');
    setContext('GERAL');
    setType('PERMANENTE');
    setEditingId(null);
    await load();
  }

  function startEdit(memory: Memory): void {
    setEditingId(memory.id);
    setTitle(memory.title);
    setContent(memory.content);
    setContext(memory.context);
    setType(memory.type);
    setFeedback(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setTitle('');
    setContent('');
    setContext('GERAL');
    setType('PERMANENTE');
  }

  async function deleteMemory(memory: Memory): Promise<void> {
    if (!window.confirm(`Remover a memória "${memory.title}"?`)) return;
    await api(`/api/memories/${memory.id}`, { method: 'DELETE' });
    if (editingId === memory.id) cancelEdit();
    setFeedback('Memória removida.');
    await load();
  }

  const groupedMemories = useMemo(() => {
    const groups = new Map<MemoryCategory, Memory[]>();
    for (const category of CATEGORY_ORDER) groups.set(category, []);
    for (const memory of items) {
      const category = getMemoryCategory(memory);
      groups.get(category)?.push(memory);
    }
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: groups.get(category) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <div className="page-shell">
      <div className="page-container">
      <header className="page-header">
        <div className="eyebrow">Conhecimento</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--moble-black)]">Memórias</h1>
        <p className="mt-2 text-sm text-[var(--moble-muted)]">Base viva de clientes, projetos, padrões comerciais e processos da Möble.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[var(--moble-black)]">{editingId ? 'Editar memória' : 'Nova memória'}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--moble-muted)]">
              Registre apenas informações que ajudem o MOBI a vender, organizar ou atender melhor.
            </p>
          </div>
          <form className="space-y-3" onSubmit={(e) => void handleCreate(e)}>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[var(--moble-muted)]">Título</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="premium-input"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-[var(--moble-muted)]">Conteúdo</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="premium-input"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Contexto"
                name="context"
                value={context}
                onChange={(e) => setContext(e.target.value as ContextType)}
              >
                <option value="PESSOAL">Pessoal</option>
                <option value="MOBLE">Moble</option>
                <option value="KARRUN">Karrun</option>
                <option value="GERAL">Geral</option>
              </SelectField>
              <SelectField
                label="Tipo"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as MemoryType)}
              >
                <option value="TEMPORARIA">Temporária</option>
                <option value="PERMANENTE">Permanente</option>
              </SelectField>
            </div>
            <Button
              type="submit"
              variant="accent"
              className="w-full"
            >
              {editingId ? 'Atualizar memória' : 'Salvar memória'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" className="w-full" onClick={cancelEdit}>
                Cancelar edição
              </Button>
            )}
            {feedback && (
              <p className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3 text-xs leading-5 text-[var(--moble-muted)]">
                {feedback}
              </p>
            )}
          </form>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-3 gap-2 text-xs text-[var(--moble-muted)]">
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-black)]">{items.length}</div>
                memórias
              </div>
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-accent)]">{items.filter((item) => item.context === 'MOBLE').length}</div>
                Möble
              </div>
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-success)]">{items.filter((item) => item.type === 'PERMANENTE').length}</div>
                permanentes
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <SelectField
              label="Filtrar contexto"
              name="fctx"
              value={filterContext}
              onChange={(e) => setFilterContext(e.target.value as ContextType | 'ALL')}
              className="min-w-[140px]"
            >
              <option value="ALL">Todos</option>
              <option value="PESSOAL">Pessoal</option>
              <option value="MOBLE">Moble</option>
              <option value="KARRUN">Karrun</option>
              <option value="GERAL">Geral</option>
            </SelectField>
            <SelectField
              label="Filtrar tipo"
              name="ftype"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MemoryType | 'ALL')}
              className="min-w-[140px]"
            >
              <option value="ALL">Todos</option>
              <option value="TEMPORARIA">Temporária</option>
              <option value="PERMANENTE">Permanente</option>
            </SelectField>
            </div>
          </div>

          {loading && <div className="h-24 rounded-2xl skeleton" />}
          {!loading && items.length === 0 && (
            <EmptyState title="Nenhuma memória ainda" description="Salve padrões úteis para o MOBI reutilizar no atendimento." />
          )}
          <div className="space-y-5">
            {groupedMemories.map((group) => (
              <section key={group.category}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="eyebrow">{group.category}</div>
                    <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">
                      {group.category === 'Geral' ? 'Conhecimento geral' : `Memórias de ${group.category.toLowerCase()}`}
                    </h2>
                  </div>
                  <Badge tone={categoryTone(group.category)}>{group.items.length}</Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.items.map((memory) => (
                    <article key={memory.id} className="rounded-[22px] border border-[var(--moble-border)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition hover:-translate-y-[1px]">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--moble-black)]">{memory.title}</div>
                          <div className="mt-1 text-xs text-[var(--moble-muted)]">
                            Atualizada em {new Date(memory.updatedAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <Badge tone={memory.context === 'MOBLE' ? 'accent' : 'neutral'}>
                          {memory.context}
                        </Badge>
                      </div>
                      <p className="line-clamp-5 text-sm leading-6 text-[var(--moble-gray)]">{memory.content}</p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={memory.type === 'PERMANENTE' ? 'success' : 'warning'}>{memory.type}</Badge>
                        <div className="flex gap-2">
                          <Button variant="ghost" className="px-3 py-2 text-[11px]" onClick={() => startEdit(memory)}>
                            Editar
                          </Button>
                          <Button variant="ghost" className="px-3 py-2 text-[11px]" onClick={() => void deleteMemory(memory)}>
                            Remover
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
