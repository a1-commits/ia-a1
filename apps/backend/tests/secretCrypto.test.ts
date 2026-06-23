import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decryptSecret, encryptSecret, maskSecret } from '../src/lib/secretCrypto';

describe('secretCrypto', () => {
  it('criptografa e descriptografa clientSecret', () => {
    const plain = 'super-secret-client-secret-xyz';
    const encrypted = encryptSecret(plain);
    assert.notEqual(encrypted, plain);
    assert.equal(decryptSecret(encrypted), plain);
  });

  it('criptografa accessToken e refreshToken sem expor em máscara', () => {
    const accessToken = 'bling-access-token-abc123xyz';
    const refreshToken = 'bling-refresh-token-def456uvw';
    const encAccess = encryptSecret(accessToken);
    const encRefresh = encryptSecret(refreshToken);

    assert.doesNotMatch(encAccess, /abc123xyz/);
    assert.doesNotMatch(encRefresh, /def456uvw/);

    const maskedAccess = maskSecret(accessToken);
    const maskedRefresh = maskSecret(refreshToken);
    assert.ok(maskedAccess);
    assert.ok(maskedRefresh);
    assert.equal(maskedAccess!.includes(accessToken), false);
    assert.equal(maskedRefresh!.includes(refreshToken), false);
    assert.match(maskedAccess!, /\*\*\*\*/);
  });

  it('payload criptografado não contém token em texto claro', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const payload = encryptSecret(token);
    assert.doesNotMatch(payload, /eyJhbGci/);
    assert.equal(decryptSecret(payload), token);
  });
});
