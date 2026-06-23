'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/platform/PageHeader';
import { PlatformCard } from '@/components/platform/PlatformCard';
import { MOCK_AGENTS, MOCK_CONTACTS, agentNameById, type PlatformContact } from '@/lib/mock/platform';

export default function ContatosPage(): React.ReactElement {
  const [contacts, setContacts] = useState<PlatformContact[]>(MOCK_CONTACTS);
  const [feedback, setFeedback] = useState<string | null>(null);

  function assignAgent(contactId: string, agentId: string): void {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, agentId } : c)));
    const contact = contacts.find((c) => c.id === contactId);
    setFeedback(`Contato ${contact?.name ?? ''} → ${agentNameById(agentId)} (mock).`);
    window.setTimeout(() => setFeedback(null), 2500);
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <PageHeader
          eyebrow="Contatos"
          title="Contatos"
          description="Gerencie contatos e defina qual agente atende cada um."
        />

        {feedback && (
          <div className="mb-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--fg)]">
            {feedback}
          </div>
        )}

        <PlatformCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Agente responsável</th>
                <th className="px-4 py-3 font-medium">Última interação</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--fg)]">{contact.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{contact.phone}</td>
                  <td className="px-4 py-3">
                    <select
                      value={contact.agentId}
                      onChange={(e) => assignAgent(contact.id, e.target.value)}
                      className="premium-input max-w-[220px] py-2 text-sm"
                    >
                      {MOCK_AGENTS.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {new Date(contact.lastInteraction).toLocaleString('pt-BR')}
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
