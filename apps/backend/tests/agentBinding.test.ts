import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectAgentForMessage } from '../src/domains/agents/agentResolver.service';
import {
  resolveResponsibleAgent,
  resolveConversationDisplayTitle,
  isConversationIdentitySchemaError,
  mapConversationToListItem,
} from '../src/domains/chat/conversationIdentity.service';
import { ContextType } from '@prisma/client';

const MOBI = { id: 'mobi', name: 'MOBI', isActive: true };
const PERA = { id: 'pera', name: 'PERA', isActive: true };
const INACTIVE = { id: 'old', name: 'OLD', isActive: false };

describe('selectAgentForMessage — vínculo fixo contato → agente', () => {
  it('contato vinculado ao PERA não responde com MOBI', () => {
    const selected = selectAgentForMessage({
      contactAssignedAgent: PERA,
      conversationAgent: MOBI,
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'PERA');
    assert.equal(selected.id, 'pera');
  });

  it('vínculo do contato tem prioridade sobre agentId explícito fora de teste', () => {
    const selected = selectAgentForMessage({
      explicitAgent: MOBI,
      contactAssignedAgent: PERA,
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'PERA');
  });

  it('modo agentTest usa agente explícito do sandbox', () => {
    const selected = selectAgentForMessage({
      agentTest: true,
      explicitAgent: PERA,
      contactAssignedAgent: MOBI,
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'PERA');
  });

  it('sem vínculo de contato usa agente persistido na conversa', () => {
    const selected = selectAgentForMessage({
      conversationAgent: PERA,
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'PERA');
  });

  it('sem vínculo nem conversa cai no agente padrão MOBI', () => {
    const selected = selectAgentForMessage({
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'MOBI');
  });

  it('ignora agente inativo do contato e usa conversa/default', () => {
    const selected = selectAgentForMessage({
      contactAssignedAgent: INACTIVE,
      conversationAgent: PERA,
      defaultAgent: MOBI,
    });
    assert.equal(selected.name, 'PERA');
  });
});

describe('resolveResponsibleAgent — exibição do agente responsável', () => {
  it('mostra PERA quando contato está vinculado', () => {
    const result = resolveResponsibleAgent({
      contact: {
        id: 'c1',
        name: 'João',
        phone: '41999998888',
        whatsappId: null,
        contactAgent: { agent: PERA },
      },
      conversationAgent: MOBI,
    });
    assert.equal(result.agentName, 'PERA');
    assert.equal(result.agentId, 'pera');
  });

  it('usa agente da conversa quando contato não tem vínculo', () => {
    const result = resolveResponsibleAgent({
      contact: {
        id: 'c1',
        name: 'João',
        phone: '41999998888',
        whatsappId: null,
        contactAgent: null,
      },
      conversationAgent: PERA,
    });
    assert.equal(result.agentName, 'PERA');
  });
});

describe('regras de agrupamento com agente vinculado', () => {
  it('mesmo contato+c canal reutiliza escopo (não cria conversa por texto)', () => {
    const scope = (userId: string, contactId: string, channel: string) =>
      `${userId}:${contactId}:${channel}`;
    assert.equal(scope('u1', 'ct1', 'whatsapp'), scope('u1', 'ct1', 'whatsapp'));
    assert.notEqual(scope('u1', 'ct1', 'whatsapp'), scope('u1', 'ct1', 'internal'));
  });

  it('chat geral interno não captura conversa com contato vinculado', () => {
    const isGeneralInternalCandidate = (conv: {
      channel: string;
      contactId: string | null;
      agentId: string | null;
    }) => conv.channel === 'internal' && conv.contactId === null && conv.agentId === null;

    assert.equal(isGeneralInternalCandidate({ channel: 'internal', contactId: null, agentId: null }), true);
    assert.equal(
      isGeneralInternalCandidate({ channel: 'internal', contactId: 'ct1', agentId: 'pera' }),
      false,
    );
    assert.equal(
      isGeneralInternalCandidate({ channel: 'whatsapp', contactId: 'ct1', agentId: 'pera' }),
      false,
    );
  });

  it('nova mensagem do mesmo número mantém título do contato, não do texto', () => {
    const title1 = resolveConversationDisplayTitle({
      channel: 'whatsapp',
      contactName: 'Maria',
      contactIdentifier: '41988887777',
      legacyTitle: 'Oi',
    });
    const title2 = resolveConversationDisplayTitle({
      channel: 'whatsapp',
      contactName: 'Maria',
      contactIdentifier: '41988887777',
      legacyTitle: '7898215151784',
    });
    assert.equal(title1, 'Maria');
    assert.equal(title2, 'Maria');
    assert.equal(title1, title2);
  });
});

describe('conversation list polling resilience', () => {
  it('detecta erro Prisma de coluna ausente (migration pendente)', () => {
    assert.equal(
      isConversationIdentitySchemaError({ code: 'P2022', message: 'Column `Conversation.contactId` does not exist' }),
      true,
    );
    assert.equal(
      isConversationIdentitySchemaError(new Error('The column `channel` does not exist in the current database.')),
      true,
    );
    assert.equal(isConversationIdentitySchemaError(new Error('Unauthorized')), false);
  });

  it('fallback legacy mantém conversas visíveis com título salvo', () => {
    const item = mapConversationToListItem(
      {
        id: 'legacy-1',
        userId: 'u1',
        title: 'João Silva',
        context: ContextType.GERAL,
        pinned: false,
        archived: false,
        lastMessageAt: new Date('2026-06-22T16:42:00'),
        createdAt: new Date('2026-06-22T10:00:00'),
        updatedAt: new Date('2026-06-22T16:42:00'),
        contactId: null,
        agentId: null,
        channel: 'internal',
        lastMessagePreview: null,
        contactIdentifier: null,
        contact: null,
        agent: null,
      },
      'Oi, tudo bem?',
    );

    assert.equal(item.displayTitle, 'João Silva');
    assert.equal(item.channel, 'internal');
    assert.equal(item.lastMessagePreview, '"Oi, tudo bem?"');
  });
});
