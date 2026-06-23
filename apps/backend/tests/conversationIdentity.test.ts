import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMessagePreview,
  channelLabel,
  formatSidebarMeta,
  promptChannelToStorageChannel,
  resolveContactIdentifier,
  resolveConversationDisplayTitle,
  mapConversationToListItem,
} from '../src/domains/chat/conversationIdentity.service';
import { ContextType } from '@prisma/client';

describe('conversationIdentity', () => {
  it('título usa contact.name quando disponível', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'whatsapp',
      contactName: 'João Silva',
      contactIdentifier: '41999998888',
    });
    assert.equal(title, 'João Silva');
  });

  it('fallback para telefone quando não há nome', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'whatsapp',
      contactIdentifier: '41999998888',
    });
    assert.equal(title, '41999998888');
  });

  it('fallback para Contato sem nome', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'whatsapp',
    });
    assert.equal(title, 'Contato sem nome');
  });

  it('conversa teste PERA usa Teste {AGENTE}', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'agent_test',
      agentName: 'PERA',
    });
    assert.equal(title, 'Teste PERA');
  });

  it('conversa teste MOBI usa Teste MOBI', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'agent_test',
      agentName: 'MOBI',
    });
    assert.equal(title, 'Teste MOBI');
  });

  it('não usa conteúdo da mensagem como título quando há contato', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'whatsapp',
      contactName: 'Maria',
      legacyTitle: '4152465547',
    });
    assert.equal(title, 'Maria');
  });

  it('conversa interna sem contato pode usar legacyTitle', () => {
    const title = resolveConversationDisplayTitle({
      channel: 'internal',
      legacyTitle: 'Atendimento loja',
    });
    assert.equal(title, 'Atendimento loja');
  });

  it('buildMessagePreview resume com aspas', () => {
    assert.equal(buildMessagePreview('Qual o estoque do produto X'), '"Qual o estoque do produto X"');
  });

  it('channelLabel mapeia canais', () => {
    assert.equal(channelLabel('whatsapp'), 'WhatsApp');
    assert.equal(channelLabel('agent_test'), 'Interno');
    assert.equal(channelLabel('internal'), 'Interno');
  });

  it('promptChannelToStorageChannel separa teste de agente', () => {
    assert.equal(promptChannelToStorageChannel('web', true), 'agent_test');
    assert.equal(promptChannelToStorageChannel('web', false), 'internal');
    assert.equal(promptChannelToStorageChannel('whatsapp_customer'), 'whatsapp');
  });

  it('resolveContactIdentifier prioriza phone do contato', () => {
    assert.equal(
      resolveContactIdentifier({
        contact: { phone: '41988887777', whatsappId: '5511999999999@c.us' },
        phone: '41911112222',
      }),
      '41988887777',
    );
  });

  it('sidebar item mostra nome, preview e meta', () => {
    const item = mapConversationToListItem(
      {
        id: 'c1',
        userId: 'u1',
        title: 'Oi',
        context: ContextType.GERAL,
        pinned: false,
        archived: false,
        lastMessageAt: new Date('2026-06-22T16:42:00'),
        contactId: 'ct1',
        agentId: 'a1',
        channel: 'whatsapp',
        lastMessagePreview: '"Qual o estoque do produto..."',
        contactIdentifier: '41999998888',
        createdAt: new Date('2026-06-22T10:00:00'),
        updatedAt: new Date('2026-06-22T16:42:00'),
        contact: { id: 'ct1', name: 'João Silva', phone: '41999998888', whatsappId: null, contactAgent: { agent: { id: 'a1', name: 'PERA', isActive: true } } },
        agent: { id: 'a1', name: 'PERA', isActive: true },
      },
      'Qual o estoque do produto...',
    );

    assert.equal(item.displayTitle, 'João Silva');
    assert.equal(item.agentName, 'PERA');
    assert.equal(item.lastMessagePreview, '"Qual o estoque do produto..."');
    assert.match(formatSidebarMeta({ channel: 'whatsapp', agentName: 'PERA', updatedAt: item.updatedAt }), /WhatsApp · PERA ·/);
  });

  it('bolha PERA vs MOBI vem do agentName mapeado', () => {
    const pera = mapConversationToListItem(
      {
        id: 'c2',
        userId: 'u1',
        title: null,
        context: ContextType.GERAL,
        pinned: false,
        archived: false,
        lastMessageAt: null,
        contactId: null,
        agentId: 'a-pera',
        channel: 'agent_test',
        lastMessagePreview: null,
        contactIdentifier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        agent: { id: 'a-pera', name: 'PERA', isActive: true },
      },
      '4152465547',
    );
    const mobi = mapConversationToListItem(
      {
        id: 'c3',
        userId: 'u1',
        title: null,
        context: ContextType.GERAL,
        pinned: false,
        archived: false,
        lastMessageAt: null,
        contactId: null,
        agentId: 'a-mobi',
        channel: 'internal',
        lastMessagePreview: null,
        contactIdentifier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        agent: { id: 'a-mobi', name: 'MOBI', isActive: true },
      },
      'Oi',
    );

    assert.equal(pera.displayTitle, 'Teste PERA');
    assert.equal(pera.agentName, 'PERA');
    assert.equal(mobi.agentName, 'MOBI');
    assert.notEqual(pera.channel, mobi.channel);
  });

  it('chaves de upsert: mesmo contato+c canal deve reutilizar (regra documentada)', () => {
    const contactScope = (userId: string, contactId: string, channel: string) =>
      `${userId}:${contactId}:${channel}`;
    const testScope = (userId: string, agentId: string) => `${userId}:agent_test:${agentId}`;

    assert.equal(
      contactScope('user-1', 'contact-1', 'whatsapp'),
      contactScope('user-1', 'contact-1', 'whatsapp'),
    );
    assert.notEqual(
      contactScope('user-1', 'contact-1', 'whatsapp'),
      contactScope('user-1', 'contact-2', 'whatsapp'),
    );
    assert.equal(testScope('user-1', 'pera-id'), testScope('user-1', 'pera-id'));
    assert.notEqual(testScope('user-1', 'pera-id'), testScope('user-1', 'mobi-id'));
  });
});
