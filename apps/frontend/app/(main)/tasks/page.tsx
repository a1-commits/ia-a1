'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { SelectField } from '@/components/SelectField';
import { api } from '@/lib/api';
import type { ContextType, Task, TaskPriority, TaskStatus } from '@/types/models';

type KanbanColumn = {
  id: 'today' | 'week' | 'waiting' | 'done';
  title: string;
  description: string;
  items: Task[];
};

function taskText(task: Task): string {
  return `${task.title} ${task.description ?? ''}`.toLowerCase();
}

function priorityTone(priority: TaskPriority): 'neutral' | 'accent' | 'danger' {
  if (priority === 'HIGH') return 'danger';
  if (priority === 'MEDIUM') return 'accent';
  return 'neutral';
}

function statusLabel(status: TaskStatus): string {
  if (status === 'TODO') return 'A fazer';
  if (status === 'IN_PROGRESS') return 'Em andamento';
  if (status === 'DONE') return 'Concluída';
  return 'Cancelada';
}

export default function TasksPage(): React.ReactElement {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<ContextType>('GERAL');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [filterContext, setFilterContext] = useState<ContextType | 'ALL'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterContext !== 'ALL' ? `?context=${filterContext}` : '';
      const res = await api<{ items: Task[] }>(`/api/tasks${qs}`);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [filterContext]);

  useEffect(() => {
    void load();
  }, [load]);

  const kanbanColumns = useMemo<KanbanColumn[]>(() => {
    const activeItems = items.filter((task) => task.status !== 'CANCELLED');
    const done = activeItems.filter((task) => task.status === 'DONE');
    const open = activeItems.filter((task) => task.status !== 'DONE');
    const waiting = open.filter((task) => /aguard|cliente|retorno|resposta|lead/.test(taskText(task)));
    const waitingIds = new Set(waiting.map((task) => task.id));
    const today = open.filter((task) => !waitingIds.has(task.id) && task.priority === 'HIGH');
    const todayIds = new Set(today.map((task) => task.id));
    const week = open.filter((task) => !waitingIds.has(task.id) && !todayIds.has(task.id));

    return [
      {
        id: 'today',
        title: 'Hoje',
        description: 'Prioridades altas para resolver primeiro.',
        items: today,
      },
      {
        id: 'week',
        title: 'Esta semana',
        description: 'Pendências abertas sem urgência crítica.',
        items: week,
      },
      {
        id: 'waiting',
        title: 'Aguardando cliente',
        description: 'Leads, retornos e respostas pendentes.',
        items: waiting,
      },
      {
        id: 'done',
        title: 'Concluído',
        description: 'Itens finalizados ou resolvidos.',
        items: done,
      },
    ];
  }, [items]);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    await api<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description: description || undefined, context, priority }),
    });
    setTitle('');
    setDescription('');
    await load();
  }

  async function patchStatus(id: string, status: TaskStatus): Promise<void> {
    await api<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="page-shell">
      <div className="page-container">
      <header className="page-header">
        <div className="eyebrow">Operação</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--moble-black)]">Tarefas</h1>
        <p className="mt-2 text-sm text-[var(--moble-muted)]">Kanban leve para acompanhar prioridades, leads e pendências do MOBI.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold text-[var(--moble-black)]">Nova tarefa</h2>
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
              <span className="text-[var(--moble-muted)]">Descrição (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="premium-input"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <SelectField
                label="Prioridade"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
              </SelectField>
            </div>
            <Button
              type="submit"
              variant="accent"
              className="w-full"
            >
              Criar tarefa
            </Button>
          </form>
        </Card>

        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
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
            <div className="grid grid-cols-3 gap-2 text-xs text-[var(--moble-muted)]">
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-black)]">{items.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED').length}</div>
                abertas
              </div>
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-danger)]">{items.filter((task) => task.priority === 'HIGH' && task.status !== 'DONE').length}</div>
                alta
              </div>
              <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-3 py-2">
                <div className="font-bold text-[var(--moble-success)]">{items.filter((task) => task.status === 'DONE').length}</div>
                concluídas
              </div>
            </div>
          </div>

          {loading && <div className="h-72 rounded-2xl skeleton" />}
          {!loading && items.length === 0 && (
            <EmptyState title="Nenhuma tarefa ainda" description="Quando o MOBI detectar uma ação, ela aparece aqui." />
          )}
          {!loading && items.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              {kanbanColumns.map((column) => (
                <section key={column.id} className="min-h-72 rounded-[22px] border border-[var(--moble-border)] bg-white/72 p-3">
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-bold text-[var(--moble-black)]">{column.title}</h2>
                      <Badge>{column.items.length}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--moble-muted)]">{column.description}</p>
                  </div>
                  <div className="space-y-3">
                    {column.items.map((task) => (
                      <article key={task.id} className="rounded-2xl border border-[var(--moble-border)] bg-white p-3 shadow-[0_4px_18px_rgba(14,14,14,0.035)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold leading-5 text-[var(--moble-black)]">{task.title}</div>
                            {task.description && (
                              <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--moble-muted)]">{task.description}</p>
                            )}
                          </div>
                          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${task.priority === 'HIGH' ? 'bg-[var(--moble-danger)]' : task.priority === 'MEDIUM' ? 'bg-[var(--moble-accent)]' : 'bg-[var(--moble-muted)]'}`} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                          <Badge>{task.context}</Badge>
                          <Badge>{statusLabel(task.status)}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {task.status !== 'IN_PROGRESS' && task.status !== 'DONE' && (
                            <Button variant="ghost" className="justify-center px-2 py-2 text-[11px]" onClick={() => void patchStatus(task.id, 'IN_PROGRESS')}>
                              Iniciar
                            </Button>
                          )}
                          {task.status !== 'DONE' && (
                            <Button variant="accent" className="justify-center px-2 py-2 text-[11px]" onClick={() => void patchStatus(task.id, 'DONE')}>
                              Concluir
                            </Button>
                          )}
                          {task.status === 'DONE' && (
                            <Button variant="ghost" className="col-span-2 justify-center px-2 py-2 text-[11px]" onClick={() => void patchStatus(task.id, 'TODO')}>
                              Reabrir
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                    {column.items.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[var(--moble-border)] p-4 text-center text-xs leading-5 text-[var(--moble-muted)]">
                        Nada aqui por enquanto.
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
