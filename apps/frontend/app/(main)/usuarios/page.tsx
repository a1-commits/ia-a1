'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/Card';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/models';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditableUser = Pick<AdminUser, 'email' | 'name' | 'role' | 'active'>;

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  READONLY: 'Leitura',
};

const EMPTY_CREATE = {
  email: '',
  name: '',
  password: '',
  role: 'OPERATOR' as UserRole,
  active: true,
};

function editableFromUser(user: AdminUser): EditableUser {
  return {
    email: user.email,
    name: user.name ?? '',
    role: user.role,
    active: user.active,
  };
}

export default function UsuariosPage(): React.ReactElement {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditableUser>>({});
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  const activeAdmins = useMemo(
    () => users.filter((item) => item.role === 'ADMIN' && item.active).length,
    [users],
  );

  async function loadUsers(): Promise<void> {
    setErr(null);
    const res = await api<{ users: AdminUser[] }>('/api/admin/users');
    setUsers(res.users);
    setDrafts(Object.fromEntries(res.users.map((item) => [item.id, editableFromUser(item)])));
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadUsers()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Falha ao carregar usuários'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  function updateDraft(id: string, patch: Partial<EditableUser>): void {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function createUser(): Promise<void> {
    setCreating(true);
    setErr(null);
    setOk(null);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...createDraft,
          name: createDraft.name.trim() || undefined,
        }),
      });
      setCreateDraft(EMPTY_CREATE);
      await loadUsers();
      setOk('Usuário criado com sucesso.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao criar usuário');
    } finally {
      setCreating(false);
    }
  }

  async function saveUser(id: string): Promise<void> {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setErr(null);
    setOk(null);
    try {
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: draft.email,
          name: draft.name?.trim() || null,
          role: draft.role,
          active: draft.active,
        }),
      });
      await loadUsers();
      setOk('Usuário atualizado.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar usuário');
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(id: string): Promise<void> {
    const password = window.prompt('Digite a nova senha (mínimo 6 caracteres):');
    if (!password) return;
    if (password.length < 6) {
      setErr('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setSavingId(id);
    setErr(null);
    setOk(null);
    try {
      await api(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setOk('Senha redefinida. Sessões antigas desse usuário foram encerradas.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao redefinir senha');
    } finally {
      setSavingId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen px-4 py-6 md:px-8">
        <Card>
          <h1 className="text-lg font-semibold tracking-tight">Usuários</h1>
          <p className="mt-2 text-sm text-zinc-500">Acesso restrito a administradores.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-zinc-500">Controle simples de acessos e bloqueios.</p>
      </header>

      <div className="grid gap-4">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-zinc-700">Novo usuário</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_150px_120px]">
            <input
              value={createDraft.email}
              onChange={(e) => setCreateDraft((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="email@empresa.com"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              type="email"
            />
            <input
              value={createDraft.name}
              onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nome"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
            />
            <select
              value={createDraft.role}
              onChange={(e) => setCreateDraft((prev) => ({ ...prev, role: e.target.value as UserRole }))}
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
            >
              {Object.entries(ROLE_LABEL).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={createDraft.password}
              onChange={(e) => setCreateDraft((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Senha"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              type="password"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={createDraft.active}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, active: e.target.checked }))}
              />
              Ativo
            </label>
            <button
              type="button"
              onClick={() => void createUser()}
              disabled={creating || !createDraft.email || createDraft.password.length < 6}
              className="rounded-lg border border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {creating ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-zinc-700">Usuários cadastrados</h2>
            <span className="text-xs text-zinc-500">
              {users.length} usuário(s) · {activeAdmins} admin(s) ativo(s)
            </span>
          </div>

          {err && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-500">{err}</p>}
          {ok && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p>}

          {loading ? (
            <p className="text-sm text-zinc-500">Carregando usuários…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-400">
                  <tr className="border-b border-black/10">
                    <th className="py-2 pr-3 font-medium">Usuário</th>
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Perfil</th>
                    <th className="py-2 pr-3 font-medium">Acesso</th>
                    <th className="py-2 pr-3 font-medium">Criado em</th>
                    <th className="py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => {
                    const draft = drafts[item.id] ?? editableFromUser(item);
                    const isSelf = item.id === user?.id;
                    return (
                      <tr key={item.id} className="border-b border-black/5 align-top">
                        <td className="py-3 pr-3">
                          <input
                            value={draft.email}
                            onChange={(e) => updateDraft(item.id, { email: e.target.value })}
                            className="w-full rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-[var(--mobi-orange)]/60"
                            type="email"
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            value={draft.name ?? ''}
                            onChange={(e) => updateDraft(item.id, { name: e.target.value })}
                            className="w-full rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-[var(--mobi-orange)]/60"
                            placeholder="Sem nome"
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <select
                            value={draft.role}
                            onChange={(e) => updateDraft(item.id, { role: e.target.value as UserRole })}
                            className="w-full rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-[var(--mobi-orange)]/60"
                          >
                            {Object.entries(ROLE_LABEL).map(([role, label]) => (
                              <option key={role} value={role}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-3">
                          <label className="flex items-center gap-2 text-xs text-zinc-600">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) => updateDraft(item.id, { active: e.target.checked })}
                              disabled={isSelf}
                            />
                            {draft.active ? 'Ativo' : 'Bloqueado'}
                          </label>
                          {isSelf && <p className="mt-1 text-[11px] text-zinc-400">Seu usuário</p>}
                        </td>
                        <td className="py-3 pr-3 text-xs text-zinc-500">
                          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void saveUser(item.id)}
                              disabled={savingId === item.id}
                              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:border-[var(--mobi-orange)]/50 disabled:opacity-40"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => void resetPassword(item.id)}
                              disabled={savingId === item.id}
                              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:border-[var(--mobi-orange)]/50 disabled:opacity-40"
                            >
                              Alterar senha
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
