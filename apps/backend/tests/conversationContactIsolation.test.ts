import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildContactConversationScopeKey,
  canReuseConversationForContact,
  canUpdateConversationContactId,
  resolveLinkedConversationId,
} from '../src/domains/chat/conversationIdentity.service';

const USER_ID = 'user-1';
const BRUNO_ID = 'contact-bruno';
const JOAO_ID = 'contact-joao';
const CHANNEL = 'whatsapp' as const;

type ConversationRecord = {
  id: string;
  userId: string;
  contactId: string | null;
  channel: typeof CHANNEL;
  messages: string[];
};

function findOrCreateConversationInMemory(input: {
  store: Map<string, ConversationRecord>;
  userId: string;
  conversationId?: string;
  contactId: string;
  channel: typeof CHANNEL;
}): ConversationRecord {
  if (input.conversationId) {
    const existing = input.store.get(input.conversationId);
    if (
      existing &&
      existing.userId === input.userId &&
      canReuseConversationForContact({
        conversationContactId: existing.contactId,
        expectedContactId: input.contactId,
      })
    ) {
      return existing;
    }
  }

  for (const conv of input.store.values()) {
    if (
      conv.userId === input.userId &&
      conv.contactId === input.contactId &&
      conv.channel === input.channel
    ) {
      return conv;
    }
  }

  const created: ConversationRecord = {
    id: `conv-${input.store.size + 1}`,
    userId: input.userId,
    contactId: input.contactId,
    channel: input.channel,
    messages: [],
  };
  input.store.set(created.id, created);
  return created;
}

function listMessagesForConversation(store: Map<string, ConversationRecord>, conversationId: string): string[] {
  return store.get(conversationId)?.messages ?? [];
}

describe('canReuseConversationForContact', () => {
  it('permite reutilizar quando não há contactId esperado (chat web legado)', () => {
    assert.equal(
      canReuseConversationForContact({ conversationContactId: JOAO_ID, expectedContactId: null }),
      true,
    );
  });

  it('bloqueia conversa de João quando mensagem é do Bruno', () => {
    assert.equal(
      canReuseConversationForContact({ conversationContactId: JOAO_ID, expectedContactId: BRUNO_ID }),
      false,
    );
  });

  it('bloqueia conversa sem contactId quando mensagem tem contactId', () => {
    assert.equal(
      canReuseConversationForContact({ conversationContactId: null, expectedContactId: BRUNO_ID }),
      false,
    );
  });

  it('permite reutilizar conversa do mesmo contato', () => {
    assert.equal(
      canReuseConversationForContact({ conversationContactId: BRUNO_ID, expectedContactId: BRUNO_ID }),
      true,
    );
  });
});

describe('canUpdateConversationContactId', () => {
  it('nunca troca contactId de João para Bruno', () => {
    assert.equal(
      canUpdateConversationContactId({ conversationContactId: JOAO_ID, expectedContactId: BRUNO_ID }),
      false,
    );
  });

  it('permite vincular contactId quando conversa ainda não tem contato', () => {
    assert.equal(
      canUpdateConversationContactId({ conversationContactId: null, expectedContactId: BRUNO_ID }),
      true,
    );
  });
});

describe('resolveLinkedConversationId', () => {
  it('ignora lastConversationId de outro contato', () => {
    assert.equal(
      resolveLinkedConversationId({
        linkedConversationId: 'conv-joao',
        linkedConversationContactId: JOAO_ID,
        expectedContactId: BRUNO_ID,
      }),
      null,
    );
  });

  it('aceita lastConversationId do mesmo contato', () => {
    assert.equal(
      resolveLinkedConversationId({
        linkedConversationId: 'conv-bruno',
        linkedConversationContactId: BRUNO_ID,
        expectedContactId: BRUNO_ID,
      }),
      'conv-bruno',
    );
  });
});

describe('isolamento Bruno x João (simulação)', () => {
  it('cria 2 conversas separadas e mensagens não se misturam', () => {
    const store = new Map<string, ConversationRecord>();

    const brunoConv = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: BRUNO_ID,
      channel: CHANNEL,
    });
    brunoConv.messages.push('Olá Bruno');

    const joaoConv = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: JOAO_ID,
      channel: CHANNEL,
    });
    joaoConv.messages.push('Olá João');

    assert.notEqual(brunoConv.id, joaoConv.id);
    assert.equal(store.size, 2);

    const brunoMessages = listMessagesForConversation(store, brunoConv.id);
    const joaoMessages = listMessagesForConversation(store, joaoConv.id);

    assert.deepEqual(brunoMessages, ['Olá Bruno']);
    assert.deepEqual(joaoMessages, ['Olá João']);
    assert.ok(!brunoMessages.some((m) => m.includes('João')));
    assert.ok(!joaoMessages.some((m) => m.includes('Bruno')));
  });

  it('mensagem do Bruno não reutiliza conversa do João mesmo com conversationId errado', () => {
    const store = new Map<string, ConversationRecord>();

    const joaoConv = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: JOAO_ID,
      channel: CHANNEL,
    });
    joaoConv.messages.push('Histórico João');

    const brunoConv = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      conversationId: joaoConv.id,
      contactId: BRUNO_ID,
      channel: CHANNEL,
    });
    brunoConv.messages.push('Mensagem Bruno');

    assert.notEqual(brunoConv.id, joaoConv.id);
    assert.deepEqual(listMessagesForConversation(store, joaoConv.id), ['Histórico João']);
    assert.deepEqual(listMessagesForConversation(store, brunoConv.id), ['Mensagem Bruno']);
  });

  it('nova mensagem reutiliza conversa correta de cada contato', () => {
    const store = new Map<string, ConversationRecord>();

    const brunoFirst = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: BRUNO_ID,
      channel: CHANNEL,
    });
    brunoFirst.messages.push('Primeira Bruno');

    const joaoFirst = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: JOAO_ID,
      channel: CHANNEL,
    });
    joaoFirst.messages.push('Primeira João');

    const brunoSecond = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: BRUNO_ID,
      channel: CHANNEL,
    });
    brunoSecond.messages.push('Segunda Bruno');

    const joaoSecond = findOrCreateConversationInMemory({
      store,
      userId: USER_ID,
      contactId: JOAO_ID,
      channel: CHANNEL,
    });
    joaoSecond.messages.push('Segunda João');

    assert.equal(brunoFirst.id, brunoSecond.id);
    assert.equal(joaoFirst.id, joaoSecond.id);
    assert.deepEqual(listMessagesForConversation(store, brunoFirst.id), [
      'Primeira Bruno',
      'Segunda Bruno',
    ]);
    assert.deepEqual(listMessagesForConversation(store, joaoFirst.id), [
      'Primeira João',
      'Segunda João',
    ]);
  });

  it('escopos userId+contactId+channel são distintos por contato', () => {
    assert.notEqual(
      buildContactConversationScopeKey(USER_ID, BRUNO_ID, CHANNEL),
      buildContactConversationScopeKey(USER_ID, JOAO_ID, CHANNEL),
    );
  });
});
