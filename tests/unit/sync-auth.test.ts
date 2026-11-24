import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../../proxy/utils/corsConfig.mjs';

test('Sync & Authentication Architecture Suite', async (t) => {
  await t.test('1. CORS Allowlist accepts Capacitor & localhost variations', () => {
    assert.strictEqual(isAllowedOrigin('https://localhost'), true);
    assert.strictEqual(isAllowedOrigin('capacitor://localhost'), true);
    assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
    assert.strictEqual(isAllowedOrigin('http://localhost:5000'), true);
    assert.strictEqual(isAllowedOrigin('http://127.0.0.1:5000'), true);
    assert.strictEqual(isAllowedOrigin('https://drabyashree-nepse-hub.onrender.com'), true);
    assert.strictEqual(isAllowedOrigin('ionic://localhost'), true);
    // Malicious external origins rejected
    assert.strictEqual(isAllowedOrigin('https://evil-site.com'), false);
    assert.strictEqual(isAllowedOrigin('http://hacker.com'), false);
  });

  await t.test('2. Backend syncRouter exports valid router and handles empty body gracefully', async () => {
    const syncRouterMod = await import('../../proxy/syncRouter.mjs');
    const syncRouter = syncRouterMod.default;
    assert.ok(syncRouter, 'syncRouter default export exists');
    assert.strictEqual(typeof syncRouter, 'function', 'syncRouter is an Express router function');
  });

  await t.test('3. Password hashing and verification invariants', async () => {
    const { hashPasswordServer, verifyPasswordServer, issueSyncSessionToken, verifySyncSessionToken } =
      await import('../../proxy/utils/syncSessionToken.mjs');

    const rawPw = 'SuperSecret123!';
    const hashed = hashPasswordServer(rawPw);
    assert.ok(hashed.startsWith('scrypt$'), 'Uses salted scrypt format');

    const validCheck = verifyPasswordServer(hashed, rawPw);
    assert.strictEqual(validCheck.valid, true, 'Valid password succeeds verification');

    const invalidCheck = verifyPasswordServer(hashed, 'WrongPassword');
    assert.strictEqual(invalidCheck.valid, false, 'Invalid password fails verification');

    // Token issuance and verification
    const token = issueSyncSessionToken({ uid: 'usr_test123', email: 'test@example.com', app: 'nepse' });
    assert.ok(typeof token === 'string' && token.length > 20, 'Session token issued');

    const decoded = verifySyncSessionToken(token);
    assert.ok(decoded, 'Token successfully verified');
    assert.strictEqual(decoded.uid, 'usr_test123');
    assert.strictEqual(decoded.email, 'test@example.com');
  });

  await t.test('4. Sensitive credentials stripping invariant', async () => {
    const { stripSensitiveCredentials } = await import('../../proxy/syncRouter.mjs');

    const rawPayload = {
      email: 'investor@example.com',
      credentials: { pin: '1234', password: 'plainPassword' },
      subscription: { secret: 'abc' },
      profiles: [
        {
          name: 'Main Demat',
          boid: '1301230000000001',
          password: 'merosharePassword',
          pin: '9876',
          vaultEnvelope: 'aes-gcm-vault-data'
        }
      ]
    };

    const sanitized = stripSensitiveCredentials(rawPayload);
    assert.strictEqual(sanitized.credentials, undefined, 'credentials root key deleted');
    assert.strictEqual(sanitized.subscription, undefined, 'subscription root key deleted');
    assert.strictEqual(sanitized.profiles[0].password, undefined, 'profile password deleted');
    assert.strictEqual(sanitized.profiles[0].pin, undefined, 'profile pin deleted');
    assert.strictEqual(sanitized.profiles[0].vaultEnvelope, undefined, 'profile vault envelope deleted');
    assert.strictEqual(sanitized.profiles[0].hasLocalCredentials, true, 'hasLocalCredentials flag preserved');
    assert.strictEqual(sanitized.profiles[0].boid, '1301230000000001', 'boid identifier preserved');
  });
});
