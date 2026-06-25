import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isReplyThrottled,
  shouldSkipAutoReplyForCustomer,
} from '../src/services/whatsappFlow.helpers';

describe('whatsappFlow.helpers', () => {
  it('primeira mensagem após reconexão não é bloqueada por anti-spam', () => {
    const lastReplyAt = new Map<string, number>();
    const jid = '5511999999999@c.us';
    assert.equal(isReplyThrottled(jid, lastReplyAt, 4000, 1_000_000), false);
    assert.equal(isReplyThrottled(jid, lastReplyAt, 4000, 1_000_100), false);
  });

  it('double-check anti-spam não bloqueia após única verificação read-only', () => {
    const lastReplyAt = new Map<string, number>();
    const jid = '5511999999999@c.us';
    const now = 2_000_000;
    assert.equal(isReplyThrottled(jid, lastReplyAt, 4000, now), false);
    assert.equal(isReplyThrottled(jid, lastReplyAt, 4000, now + 10), false);
  });

  it('anti-spam bloqueia somente após resposta recente registrada', () => {
    const lastReplyAt = new Map<string, number>([['5511999999999@c.us', 2_000_000]]);
    assert.equal(isReplyThrottled('5511999999999@c.us', lastReplyAt, 4000, 2_001_000), true);
    assert.equal(isReplyThrottled('5511999999999@c.us', lastReplyAt, 4000, 2_004_500), false);
  });

  it('modo manual não bloqueia contato com agente ativo vinculado', () => {
    const result = shouldSkipAutoReplyForCustomer({
      autoReplyMode: 'manual',
      contactPaused: false,
      contactStatusPaused: false,
      contactHasActiveAgent: true,
      replyThrottled: false,
    });
    assert.equal(result.skip, false);
    assert.equal(result.reason, null);
  });

  it('modo manual bloqueia contato sem agente vinculado', () => {
    const result = shouldSkipAutoReplyForCustomer({
      autoReplyMode: 'manual',
      contactPaused: false,
      contactStatusPaused: false,
      contactHasActiveAgent: false,
      replyThrottled: false,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'manual_mode');
  });

  it('contato pausado não recebe resposta automática', () => {
    const result = shouldSkipAutoReplyForCustomer({
      autoReplyMode: 'agent',
      contactPaused: true,
      contactStatusPaused: false,
      contactHasActiveAgent: true,
      replyThrottled: false,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'contact_paused');
  });
});
