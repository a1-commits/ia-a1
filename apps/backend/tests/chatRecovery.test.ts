import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  POLL_BACKOFF_MS,
  POLL_ERROR_THRESHOLD,
  PollFailureTracker,
  isTransientPollError,
} from '../../../packages/shared/src/pollResilience';
import { extractPrismaErrorCode, logPrismaRouteError } from '../src/lib/prismaRouteLog';

describe('chatRecovery poll resilience', () => {
  it('mostra erro somente após 3 falhas consecutivas', () => {
    const tracker = new PollFailureTracker();
    assert.equal(tracker.shouldShowError(), false);
    tracker.recordFailure();
    assert.equal(tracker.shouldShowError(), false);
    tracker.recordFailure();
    assert.equal(tracker.shouldShowError(), false);
    tracker.recordFailure();
    assert.equal(tracker.shouldShowError(), true);
  });

  it('sucesso limpa contador de falhas', () => {
    const tracker = new PollFailureTracker();
    tracker.recordFailure();
    tracker.recordFailure();
    tracker.recordSuccess();
    assert.equal(tracker.consecutive, 0);
    assert.equal(tracker.shouldShowError(), false);
  });

  it('backoff progride 3s, 5s, 10s, 15s', () => {
    const tracker = new PollFailureTracker();
    assert.equal(tracker.nextDelayMs(), 3000);
    tracker.recordFailure();
    assert.equal(tracker.nextDelayMs(), POLL_BACKOFF_MS[0]);
    tracker.recordFailure();
    assert.equal(tracker.nextDelayMs(), POLL_BACKOFF_MS[1]);
    tracker.recordFailure();
    assert.equal(tracker.nextDelayMs(), POLL_BACKOFF_MS[2]);
    tracker.recordFailure();
    assert.equal(tracker.nextDelayMs(), POLL_BACKOFF_MS[3]);
  });

  it('isTransientPollError cobre timeout, rede e 5xx', () => {
    assert.equal(isTransientPollError(undefined), true);
    assert.equal(isTransientPollError(0), true);
    assert.equal(isTransientPollError(408), true);
    assert.equal(isTransientPollError(500), true);
    assert.equal(isTransientPollError(503), true);
    assert.equal(isTransientPollError(404), false);
  });

  it('POLL_ERROR_THRESHOLD é 3', () => {
    assert.equal(POLL_ERROR_THRESHOLD, 3);
  });
});

describe('prismaRouteLog', () => {
  it('extractPrismaErrorCode lê code Prisma', () => {
    assert.equal(extractPrismaErrorCode({ code: 'P2025' }), 'P2025');
    assert.equal(extractPrismaErrorCode(new Error('x')), null);
  });

  it('logPrismaRouteError não lança', () => {
    assert.doesNotThrow(() => {
      logPrismaRouteError({
        route: 'GET /api/conversations',
        userId: 'user-1',
        error: { code: 'P2002', message: 'duplicate' },
      });
    });
  });
});
