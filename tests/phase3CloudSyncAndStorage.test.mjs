import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeFakeRs256Jwt(payloadObj, privateKeyPem, kid = 'test-kid-1') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const sig = signer.sign(privateKeyPem).toString('base64url');
  return `${signingInput}.${sig}`;
}

async function startTempServer(mountFn) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  mountFn(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

console.log('\n==============================================================');
console.log('PHASE 3 TDD: CLOUD SYNC AUTH, VAULT RECOVERY & SYNCED TAB');
console.log('==============================================================\n');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nepse-phase3-sync-'));
const VAULTS_DIR = path.join(TMP_DIR, 'sync_vaults');
fs.mkdirSync(VAULTS_DIR, { recursive: true });

// Seed a legacy passwordless Google vault matching production structure (shreeksuwal@gmail.com)
fs.writeFileSync(path.join(VAULTS_DIR, 'nepse___legacy.user_gmail.com.json'), JSON.stringify({
  app: 'nepse',
  email: 'legacy.user@gmail.com',
  name: 'Legacy Investor',
  passwordHash: '',
  data: {
    profiles: [
      { id: 'prof_1', name: 'Primary Demat', boid: '1301010000000001', holdings: [{ symbol: 'NABIL', kitta: 120, wacc: 480 }] },
      { id: 'prof_2', name: 'Family Demat', boid: '1301010000000002', holdings: [] }
    ],
    watchlist: ['NABIL', 'SHL'],
    transactions: [{ id: 'tx_1', symbol: 'NABIL', kitta: 120 }],
    credentials: [{ password: 'should_never_be_returned' }]
  },
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-14T11:56:42.637Z',
  syncVersion: 14
}, null, 2));

process.env.NEPSE_DATA_DIR = TMP_DIR;
process.env.SYNC_TOKEN_SECRET = 'phase3_test_sync_secret_2026';

await test('[P3-01] syncRouter verifies Firebase ID token RS256 signature & restores passwordless legacy vault', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const syncMod = await import('../proxy/syncRouter.mjs');
  assert.strictEqual(typeof syncMod.setFirebaseCertsForTest, 'function', 'syncRouter must export setFirebaseCertsForTest / verifyFirebaseIdToken');
  syncMod.setFirebaseCertsForTest({ 'test-kid-1': pubPem }, 'drabyashree-nepse-hub-11ef9');

  const srv = await startTempServer((app) => { app.use('/api/sync', syncMod.default); });
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const validJwt = makeFakeRs256Jwt({
      aud: 'drabyashree-nepse-hub-11ef9',
      iss: 'https://securetoken.googleapis.com/drabyashree-nepse-hub-11ef9',
      sub: 'firebase_uid_999',
      email: 'legacy.user@gmail.com',
      email_verified: true,
      auth_time: nowSec - 60,
      iat: nowSec - 60,
      exp: nowSec + 3600
    }, privPem, 'test-kid-1');

    // Password login on OAuth passwordless vault must STILL fail closed (no bypass)
    const noTokenRes = await fetch(`${srv.baseUrl}/api/sync/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'nepse', email: 'legacy.user@gmail.com', passwordHash: 'guessed_pw' })
    });
    assert.strictEqual(noTokenRes.status, 401, 'Password attempt on passwordless Google vault must return 401');

    // Verified Firebase ID token succeeds and restores all 2 profiles + strips credentials
    const fbRes = await fetch(`${srv.baseUrl}/api/sync/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'nepse', email: 'legacy.user@gmail.com', firebaseIdToken: validJwt })
    });
    const fbJson = await fbRes.json();
    assert.strictEqual(fbRes.status, 200, `Expected 200 on Firebase login, got ${fbRes.status}: ${fbJson.message}`);
    assert.ok(fbJson.success && typeof fbJson.token === 'string' && fbJson.token.length > 10, 'Must issue signed sync session token');
    assert.strictEqual(fbJson.data?.profiles?.length, 2, 'Must restore legacy vault profiles');
    assert.strictEqual(fbJson.data?.credentials, undefined, 'Must strip legacy credentials field');

    // Newly issued token can pull & push
    const pullRes = await fetch(`${srv.baseUrl}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fbJson.token}` },
      body: JSON.stringify({ app: 'nepse', email: 'legacy.user@gmail.com' })
    });
    const pullJson = await pullRes.json();
    assert.strictEqual(pullRes.status, 200, 'Issued sync token must authorize /pull');
    assert.strictEqual(pullJson.data?.profiles?.length, 2);

    // Tampered JWT must fail 401
    const badJwt = validJwt.slice(0, -4) + 'AAAA';
    const badRes = await fetch(`${srv.baseUrl}/api/sync/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'nepse', email: 'legacy.user@gmail.com', firebaseIdToken: badJwt })
    });
    assert.strictEqual(badRes.status, 401, 'Tampered Firebase JWT signature must be rejected with 401');
  } finally {
    syncMod.setFirebaseCertsForTest(null);
    await srv.close();
  }
});

const firebaseSrc = fs.readFileSync(path.join(ROOT, 'src/utils/firebase.js'), 'utf8');
const proxyBaseSrc = fs.readFileSync(path.join(ROOT, 'src/utils/proxyBase.js'), 'utf8');
const profileVaultSrc = fs.readFileSync(path.join(ROOT, 'src/utils/profileVaultStorage.js'), 'utf8');
const portfolioHubSrc = fs.readFileSync(path.join(ROOT, 'src/components/PortfolioHub.jsx'), 'utf8');
const meroShareHubSrc = fs.readFileSync(path.join(ROOT, 'src/components/MeroShareHub.jsx'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const aiSrc = fs.readFileSync(path.join(ROOT, 'src/components/AiAnalyst.jsx'), 'utf8');
const prefSrc = fs.readFileSync(path.join(ROOT, 'src/components/PreferencesSettingsService.tsx'), 'utf8');
const pushSrc = fs.readFileSync(path.join(ROOT, 'src/utils/pushNotificationService.js'), 'utf8');

await test('[P3-02] firebase.js exchanges Firebase ID token for syncToken on login, redirect & session restore', () => {
  assert.ok(firebaseSrc.includes('exchangeFirebaseTokenForSync'), 'firebase.js must implement exchangeFirebaseTokenForSync');
  assert.ok(firebaseSrc.includes('firebaseIdToken'), 'firebase.js must send firebaseIdToken to /login');
  assert.ok(firebaseSrc.includes('getIdToken'), 'firebase.js must call fbUser.getIdToken()');
  // Check fetchUserDataFromCloud ensures token restoration when Firebase currentUser exists
  const pullFn = firebaseSrc.slice(firebaseSrc.indexOf('export const fetchUserDataFromCloud'));
  assert.ok(pullFn.includes('ensureSyncSessionToken') || pullFn.includes('exchangeFirebaseTokenForSync'),
    'fetchUserDataFromCloud must restore sync token via Firebase auth.currentUser if sessionStorage token is missing');
});

await test('[P3-03] Account tab & PortfolioHub expose dedicated Synced sub-tab and real cloud sync state', () => {
  assert.ok(portfolioHubSrc.includes("setSubTab('synced')") || portfolioHubSrc.includes("'synced'"),
    'PortfolioHub must include a dedicated Synced tab button and subTab state');
  assert.ok(meroShareHubSrc.includes("activeSubTab === 'synced'"),
    'MeroShareHub must render a dedicated Synced sub-tab view showing synced profiles and timestamps');
  assert.ok(meroShareHubSrc.includes('fetchUserDataFromCloud(userId, userEmail)'),
    'MeroShareHub must pass userEmail to fetchUserDataFromCloud');
});

await test('[P3-04] Unified storage keys: proxyBase respects custom_proxy_base and modules read canonical profile vault', () => {
  assert.ok(proxyBaseSrc.includes("custom_proxy_base"),
    'src/utils/proxyBase.js must honor custom_proxy_base written by MeroShareHub settings');
  assert.ok(profileVaultSrc.includes('readCanonicalPortfolioSymbolsSync') || profileVaultSrc.includes('readCachedHoldingsSummarySync'),
    'profileVaultStorage.js must expose canonical non-secret synchronous summary reader backed by uid-scoped vault');
  assert.ok(!appSrc.includes("localStorage.getItem('nepse_portfolio_profiles')"),
    'App.jsx userPortfolioSymbols must not read orphaned nepse_portfolio_profiles directly');
  assert.ok(!aiSrc.includes("const saved = localStorage.getItem('nepse_portfolio');"),
    'AiAnalyst.jsx must read canonical scoped portfolio storage');
  assert.ok(!prefSrc.includes("const profiles = safeParseArray('nepse_portfolio_profiles');"),
    'PreferencesSettingsService.tsx must read canonical scoped profiles');
  assert.ok(pushSrc.includes('readCanonicalPortfolioSymbolsSync') || pushSrc.includes('nepse_hub_'),
    'pushNotificationService.js must check canonical nepse_hub_* profiles before legacy fallback');
});

fs.rmSync(TMP_DIR, { recursive: true, force: true });

console.log(`\n==============================================================`);
console.log(` PHASE 3 TDD RESULTS: ${passed} passed, ${failed} failed`);
console.log(`==============================================================\n`);
if (failed > 0) process.exit(1);
