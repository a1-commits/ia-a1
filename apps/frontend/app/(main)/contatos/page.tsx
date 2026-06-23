'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import {
  DEFAULT_AGENT_ID,
  MOCK_AGENTS,
  MOCK_CONTACTS,
  agentLabel,
  defaultAgentName,
  type PlatformContact,
} from '@/lib/mock/platform';

const STATUS_LABEL = {
  ativo: 'ativo',
  inativo: 'inativo',
  pausado: 'pausado',
} as const;

export default function ContatosPage(): React.ReactElement {
  const [contacts, setContacts] = useState<PlatformContact[]>(MOCK_CONTACTS);
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string): void {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  function assignAgent(contactId: string, agentId: string | null): void {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, agentId } : c)));
    const contact = contacts.find((c) => c.id === contactId);
    showFeedback(
      `Contato ${contact?.name ?? ''} → ${agentId ? agentLabel(agentId) : 'agente padrão'} (mock).`,
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Contatos"
          title="Contatos"
          description={`Escolha qual agente atende cada número. Padrão: ${defaultAgentName()}.`}
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        <PlatformCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Agente atribuído</th>
                <th className="px-4 py-3 font-medium">Última mensagem</th>
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
                    <span className={contact.agentId ? 'text-[var(--fg)]' : 'text-[var(--muted)] italic'}>
                      {agentLabel(contact.agentId)}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-[var(--muted)]">{contact.lastMessage}</td>
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
                          assignAgent(contact.id, e.target.value ? e.target.value : null)
                        }
                        className="premium-input max-w-[160px] py-1.5 text-xs"
                      >
                        <option value="">Usa agente padrão</option>
                        {MOCK_AGENTS.filter((a) => a.active).map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      {contact.agentId && (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-[10px]"
                          onClick={() => assignAgent(contact.id, null)}
                        >
                          Remover
                        </Button>
                      )}
                      {contact.agentId !== DEFAULT_AGENT_ID && (
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-[10px]"
                          onClick={() => assignAgent(contact.id, DEFAULT_AGENT_ID)}
                        >
                          Padrão
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PlatformCard>
      </div>
    </div>
  );
}
