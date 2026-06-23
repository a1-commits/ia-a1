'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { listActiveAgents } from '@/lib/agents-api';
import {
  assignContactAgent,
  createContact,
  deleteContact,
  listContacts,
  type PlatformContact,
} from '@/lib/contacts-api';
import type { PlatformAgent } from '@/types/platform';

const STATUS_LABEL = {
  ativo: 'ativo',
  inativo: 'inativo',
  pausado: 'pausado',
} as const;

export default function ContatosPage(): React.ReactElement {
  const [contacts, setContacts] = useState<PlatformContact[]>([]);
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newAgentId, setNewAgentId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contactItems, agentItems] = await Promise.all([listContacts(), listActiveAgents()]);
      setContacts(contactItems);
      setAgents(agentItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar contatos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await createContact({
        name,
        phone,
        agentId: newAgentId || null,
      });
      setName('');
      setPhone('');
      setNewAgentId('');
      setShowForm(false);
      await load();
      showFeedback('Contato criado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar contato.');
    }
  }

  async function handleAssign(contactId: string, agentId: string | null): Promise<void> {
    await assignContactAgent(contactId, agentId);
    await load();
    const contact = contacts.find((c) => c.id === contactId);
    const label = agentId ? agents.find((a) => a.id === agentId)?.name ?? 'agente' : 'agente padrão';
    showFeedback(`Contato ${contact?.name ?? ''} → ${label}.`);
  }

  async function handleRemove(contactId: string): Promise<void> {
    await deleteContact(contactId);
    await load();
    showFeedback('Contato removido.');
  }

  function agentDisplay(contact: PlatformContact): string {
    if (contact.agentId && contact.agentName) return contact.agentName;
    if (contact.agentId) return agents.find((a) => a.id === contact.agentId)?.name ?? 'Agente';
    return 'Usa agente padrão';
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Contatos"
          title="Contatos"
          description="Escolha qual agente atende cada número. Sem agente = usa o padrão do sistema."
          actions={
            <Button variant="accent" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancelar' : 'Novo contato'}
            </Button>
          }
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        {showForm && (
          <PlatformCard className="mb-6">
            <h2 className="mb-4 text-sm font-semibold text-[var(--fg)]">Cadastrar contato</h2>
            <form onSubmit={(e) => void handleCreate(e)} className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Nome
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do contato"
                  className="premium-input"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Telefone
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="5511999999999"
                  required
                  className="premium-input"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Agente (opcional)
                </span>
                <select
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  className="premium-input max-w-md"
                >
                  <option value="">Usa agente padrão</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className="text-sm text-[var(--moble-danger)] md:col-span-2">{error}</p>}
              <div className="md:col-span-2">
                <Button type="submit" variant="accent" disabled={!phone.trim()}>
                  Salvar contato
                </Button>
              </div>
            </form>
          </PlatformCard>
        )}

        {loading && <p className="text-sm text-[var(--muted)]">Carregando contatos…</p>}
        {error && !showForm && <p className="text-sm text-[var(--moble-danger)]">{error}</p>}

        {!loading && contacts.length === 0 && (
          <EmptyState
            title="Sem contatos ainda"
            description="Adicione um contato manualmente ou aguarde mensagens pelo WhatsApp."
          />
        )}

        {!loading && contacts.length > 0 && (
          <PlatformCard className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Agente</th>
                  <th className="px-4 py-3 font-medium">Última interação</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--fg)]">{contact.name}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{contact.phone}</td>
                    <td className="px-4 py-3">
                      <span className={contact.agentId ? 'text-[var(--fg)]' : 'italic text-[var(--muted)]'}>
                        {agentDisplay(contact)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {new Date(contact.lastInteraction).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        {STATUS_LABEL[contact.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={contact.agentId ?? ''}
                          onChange={(e) =>
                            void handleAssign(contact.id, e.target.value ? e.target.value : null)
                          }
                          className="premium-input max-w-[160px] py-1.5 text-xs"
                        >
                          <option value="">Usa agente padrão</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                        {contact.agentId && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-[10px]"
                            onClick={() => void handleAssign(contact.id, null)}
                          >
                            Remover agente
                          </Button>
                        )}
                        {contact.source === 'manual' && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-[10px] text-[var(--moble-danger)]"
                            onClick={() => void handleRemove(contact.id)}
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PlatformCard>
        )}
      </div>
    </div>
  );
}
