import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOAuthState } from '../src/domains/auth/googleOAuth.service';

describe('googleOAuth', () => {
  it('rejects malformed oauth state', () => {
    assert.equal(verifyOAuthState('invalid'), false);
    assert.equal(verifyOAuthState('a.b.c.d'), false);
  });
});
