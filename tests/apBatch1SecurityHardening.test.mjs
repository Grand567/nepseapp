// tests/apBatch1SecurityHardening.test.mjs
/**
 * Phase 3 — Batch 1 TDD Security, Auth, Vault Crypto, Paywall & Export Hardening Suite
 * Covers: BUG-046 .. BUG-056, BUG-098
 * Run: node tests/apBatch1SecurityHardening.test.mjs
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Isolate ALL proxy disk/SQLite writes to an OS temporary directory
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nepse_batch1_sec_'));
const ORIG_NEPSE_DATA_DIR = process.env.NEPSE_DATA_DIR;
const ORIG_ADMIN_KEY = process.env.ADMIN_API_KEY;
const ORIG_PORTFOLIO_KEY = process.env.PORTFOLIO_AUTH_KEY;
const ORIG_STRICT_ADMIN = process.env.ENFORCE_STRICT_ADMIN_KEY;
const ORIG_STRICT_PORTFOLIO = process.env.ENFORCE_STRICT_PORTFOLIO_AUTH;
const ORIG_NODE_ENV = process.env.NODE_ENV;
const ORIG_LICENSE_SECRET = process.env.PRO_LICENSE_SECRET;
const ORIG_SYNC_SECRET = process.env.SYNC_TOKEN_SECRET;

process.env.NEPSE_DATA_DIR = TMP_DATA_DIR;
process.env.NODE_ENV = 'test';

// Polyfill localStorage/sessionStorage for Node execution of frontend modules
const memLocal = new Map();
const memSession = new Map();
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (memLocal.has(k) ? memLocal.get(k) : null),
    setItem: (k, v) => memLocal.set(k, String(v)),
    removeItem: (k) => memLocal.delete(k),
    clear: () => memLocal.clear(),
    key: (i) => Array.from(memLocal.keys())[i] ?? null,
    get length() { return memLocal.size; }
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = {
    getItem: (k) => (memSession.has(k) ? memSession.get(k) : null),
    setItem: (k, v) => memSession.set(k, String(v)),
    removeItem: (k) => memSession.delete(k),
    clear: () => memSession.clear(),
    key: (i) => Array.from(memSession.keys())[i] ?? null,
    get length() { return memSession.size; }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { protocol: 'http:', hostname: 'localhost' }
  };
}

let pass = 0;
let fail = 0;
let ledgerDbToClose = null;

const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
};

function mockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.jsonBody = d; return this; }
  };
}

async function startTempServer(configureApp) {
  const app = express();
  app.use(express.json());
  configureApp(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function safeDynamicImport(relPath) {
  try {
    return await import(new URL(relPath, import.meta.url).href);
  } catch (err) {
    return { __importError: err };
  }
}

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

console.log('▶ [SUITE] apBatch1SecurityHardening.test.mjs\n');

try {
  // ── BUG-046: Paywall & Server-Verified License Enforcement ──
  console.log('[BUG-046] Paywall defaults, server-side HMAC keygen/redeem & ProGate unmount');
  {
    const subMod = await safeDynamicImport('../src/utils/subscription.js');
    const free = subMod.getFreeSubscription?.();
    ok(free && free.isPro === false && free.tier === 'free', 'getFreeSubscription() returns isPro: false, tier: free');

    const normBypass = subMod.normalizeSubscription?.({
      isPro: true,
      source: 'unlocked_by_default',
      voucherCode: 'LIFETIME_PRO',
      expiresAt: Date.now() + 1e12
    });
    ok(normBypass && normBypass.isPro === false, 'normalizeSubscription rejects unlocked_by_default/LIFETIME_PRO bypass');

    const normExpired = subMod.normalizeSubscription?.({
      isPro: true,
      source: 'license_key',
      expiresAt: Date.now() - 5000
    });
    ok(normExpired && normExpired.isPro === false, 'normalizeSubscription rejects expired subscription');

    process.env.PRO_LICENSE_SECRET = 'batch1_test_license_hmac_secret_2026';
    const licServerMod = await safeDynamicImport('../proxy/utils/licenseServerEngine.mjs');
    if (licServerMod.__importError) {
      ok(false, `licenseServerEngine.mjs importable (${licServerMod.__importError.message})`);
    } else {
      const issued = licServerMod.generateServerLicenseKey({ deviceId: 'DS-8A7F-94B2', planDuration: '3m', nonce: 'K9Q2' });
      ok(typeof issued === 'string' && issued.startsWith('DS3M-8A7F-94B2-K9Q2-'), 'Server license engine issues device-bound key');

      const wrongDev = licServerMod.redeemServerLicenseKey(issued, 'DS-1111-2222');
      ok(wrongDev.success === false, 'Server rejects key redeemed for different device');

      const tampered = issued.slice(0, -2) + (issued.endsWith('00') ? 'FF' : '00');
      const badSig = licServerMod.redeemServerLicenseKey(tampered, 'DS-8A7F-94B2');
      ok(badSig.success === false, 'Server rejects tampered key signature');

      const redeemed = licServerMod.redeemServerLicenseKey(issued, 'DS-8A7F-94B2');
      ok(redeemed.success === true && redeemed.subscription?.isPro === true, 'Server redeems valid device-bound key once');

      const replay = licServerMod.redeemServerLicenseKey(issued, 'DS-8A7F-94B2');
      ok(replay.success === false, 'Server blocks replay/reuse of burned license key');
    }

    const licSrc = readRepoFile('src/utils/licenseEngine.js');
    ok(!licSrc.includes('DEFAULT_SECRET_SALT') && !licSrc.includes('export function generateLicenseKey'), 'Client licenseEngine.js contains no DEFAULT_SECRET_SALT or generateLicenseKey');

    const modalSrc = readRepoFile('src/components/SubscriptionModal.jsx');
    ok(!modalSrc.includes("'8899'") && !modalSrc.includes('NEPSE2026') && !modalSrc.includes('handleDirectActivate'), 'SubscriptionModal removes hardcoded PINs and 1-click free Pro unlock');

    const gateSrc = readRepoFile('src/components/ProGate.jsx');
    const lockedSection = gateSrc.slice(gateSrc.indexOf('Compact Inline'));
    ok(!lockedSection.includes('{children}') && !/filter:\s*['"]blur\(/i.test(gateSrc.replace(/backdropFilter:\s*['"]blur\([^)]+\)['"]/gi, '')), 'ProGate.jsx no longer mounts blurred {children} preview when locked');

    const srvLicSrc = readRepoFile('proxy/server.mjs');
    ok(srvLicSrc.includes("app.post('/api/license/revoke', requireAdminSecret,"), 'POST /api/license/revoke requires admin secret');
  }

  // ── BUG-047: Hardcoded Portfolio Key Removal & Per-Owner Isolation ──
  console.log('\n[BUG-047] Hardcoded portfolio key removal & per-owner isolation');
  {
    const reqPortSrc = readRepoFile('proxy/middleware/requirePortfolioAuth.mjs');
    const portSrc = readRepoFile('src/components/Portfolio.jsx');
    ok(!reqPortSrc.includes('nepse-secure-portfolio-key-8899'), 'requirePortfolioAuth.mjs purged hardcoded nepse-secure-portfolio-key-8899');
    ok(!portSrc.includes('nepse-secure-portfolio-key-8899'), 'Portfolio.jsx purged hardcoded nepse-secure-portfolio-key-8899');

    delete process.env.PORTFOLIO_AUTH_KEY;
    delete process.env.PORTFOLIO_SECRET;
    delete process.env.ADMIN_API_KEY;
    delete process.env.INTERNAL_CRON_SECRET;
    delete process.env.PROXY_ADMIN_SECRET;
    process.env.SYNC_TOKEN_SECRET = 'batch1_sync_secret_for_tests_2026';

    const { requirePortfolioAuth } = await import('../proxy/middleware/requirePortfolioAuth.mjs');
    const syncTokMod = await safeDynamicImport('../proxy/utils/syncSessionToken.mjs');
    const smartMod = await import('../proxy/smartAlertEngine.mjs');

    const reqLeakKey = {
      ip: '198.51.100.24',
      socket: { remoteAddress: '198.51.100.24' },
      hostname: 'localhost',
      headers: { 'x-portfolio-key': 'nepse-secure-portfolio-key-8899' }
    };
    const resLeakKey = mockRes();
    let nextLeak = false;
    requirePortfolioAuth(reqLeakKey, resLeakKey, () => { nextLeak = true; });
    ok(!nextLeak && (resLeakKey.statusCode === 401 || resLeakKey.statusCode === 403), 'External request using legacy default key is rejected');

    if (syncTokMod.__importError) {
      ok(false, `syncSessionToken.mjs importable (${syncTokMod.__importError.message})`);
    } else {
      const tokA = syncTokMod.issueSyncSessionToken({ uid: 'usr_alpha', email: 'alpha@example.com', app: 'nepse' });
      const reqUserA = {
        ip: '198.51.100.24',
        socket: { remoteAddress: '198.51.100.24' },
        headers: { authorization: `Bearer ${tokA}` }
      };
      const resUserA = mockRes();
      let nextA = false;
      await requirePortfolioAuth(reqUserA, resUserA, () => { nextA = true; });
      ok(nextA && reqUserA.portfolioOwnerId === 'usr_alpha', 'Signed sync session token sets req.portfolioOwnerId');

      smartMod.trackCustomHolding({ symbol: 'NABIL', buyPrice: 500, ownerId: 'usr_alpha' });
      smartMod.trackCustomHolding({ symbol: 'NICA', buyPrice: 350, ownerId: 'usr_beta' });

      const listA = smartMod.getUserTrackedHoldings('usr_alpha');
      const listB = smartMod.getUserTrackedHoldings('usr_beta');
      ok(listA.some(x => x.symbol === 'NABIL') && !listA.some(x => x.symbol === 'NICA'), 'User A sees only User A tracked holdings');
      ok(listB.some(x => x.symbol === 'NICA') && !listB.some(x => x.symbol === 'NABIL'), 'User B sees only User B tracked holdings');

      const crossUntrack = smartMod.untrackCustomHolding('NICA', 'usr_alpha');
      ok(crossUntrack === false && smartMod.getUserTrackedHoldings('usr_beta').some(x => x.symbol === 'NICA'), 'User A cannot untrack User B holding');
    }
  }

  // ── BUG-048: WebCrypto AES-256-GCM Vault, Cross-User Harvesting & Sign-Out Wipe ──
  console.log('\n[BUG-048] AES-256-GCM credential vault, per-uid isolation & sign-out wipe');
  {
    const credMod = await import('../src/utils/credentialCrypto.js');
    const vaultStorageMod = await safeDynamicImport('../src/utils/profileVaultStorage.js');
    const rawProf = {
      id: 'p1',
      name: 'User One',
      boid: '1301020001234567',
      username: 'user1',
      password: 'SecretPassword!99',
      crn: 'CRN-998877',
      pin: '4321'
    };

    const asyncEnc = await credMod.encryptProfileCredentialsAsync(rawProf, 'pass_test_1234', 'usr_alpha');
    ok(Boolean(asyncEnc.vaultEnvelope) && !String(asyncEnc.password || '').startsWith('enc_v1:'), 'encryptProfileCredentialsAsync writes AES-GCM vault without enc_v1 shadow leakage');

    if (vaultStorageMod.__importError) {
      ok(false, `profileVaultStorage.js importable (${vaultStorageMod.__importError.message})`);
    } else {
      memLocal.clear();
      // Encrypt + save under usr_alpha, then inject legacy enc_v1 profile under usr_beta
      await vaultStorageMod.saveEncryptedUserProfiles([rawProf], 'usr_alpha');
      const storedAlphaRaw = localStorage.getItem('nepse_hub_usr_alpha_profiles') || '';
      ok(storedAlphaRaw.includes('v3_idb_aes256gcm') && !storedAlphaRaw.includes('enc_v1:') && !storedAlphaRaw.includes('SecretPassword!99'), 'Stored profile uses v3_idb_aes256gcm without enc_v1 or plaintext');

      // Seed foreign user key
      localStorage.setItem('nepse_hub_usr_beta_profiles', JSON.stringify([{ ...rawProf, id: 'foreign_b', username: 'foreign_user' }]));
      const loadedAlpha = await vaultStorageMod.loadEncryptedUserProfiles('usr_alpha');
      ok(loadedAlpha.length === 1 && loadedAlpha[0].password === 'SecretPassword!99' && !loadedAlpha.some(p => p.id === 'foreign_b'), 'loadEncryptedUserProfiles decrypts usr_alpha without harvesting usr_beta');

      // Legacy enc_v1 migration test
      const legacyEnc = credMod.encryptProfileCredentials({ ...rawProf, id: 'leg1' }, 'usr_legacy');
      localStorage.setItem('nepse_hub_usr_legacy_profiles', JSON.stringify([legacyEnc]));
      const loadedLegacy = await vaultStorageMod.loadEncryptedUserProfiles('usr_legacy');
      const migratedRaw = localStorage.getItem('nepse_hub_usr_legacy_profiles') || '';
      ok(loadedLegacy[0]?.password === 'SecretPassword!99' && migratedRaw.includes('v3_idb_aes256gcm') && !migratedRaw.includes('enc_v1:'), 'Legacy enc_v1 profile auto-migrates seamlessly to v3_idb_aes256gcm');

      // Concurrent Promise.all encryption race regression check for fresh uid
      const concUid = `usr_concurrent_${Date.now()}`;
      const concEnc = await Promise.all([
        credMod.encryptProfileVault({ ...rawProf, id: 'c1', password: 'PassOne!1' }, concUid),
        credMod.encryptProfileVault({ ...rawProf, id: 'c2', password: 'PassTwo!2' }, concUid),
        credMod.encryptProfileVault({ ...rawProf, id: 'c3', password: 'PassThree!3' }, concUid)
      ]);
      const concDec = await Promise.all(concEnc.map(p => credMod.decryptProfileVault(p, concUid)));
      ok(
        concDec[0]?.password === 'PassOne!1' && concDec[1]?.password === 'PassTwo!2' && concDec[2]?.password === 'PassThree!3',
        'Concurrent Promise.all encryptProfileVault initializes single shared key cleanly'
      );

      // Sign-out wipe test
      localStorage.setItem('nepse_hub_bulk_ipo_accounts', '[{"secret":1}]');
      localStorage.setItem('nepse_credentials_vault', '[{"secret":2}]');
      localStorage.setItem('drabyashree_telegram_token', 'bot:secret');
      vaultStorageMod.clearSensitiveStorageOnSignOut();
      ok(
        localStorage.getItem('nepse_hub_bulk_ipo_accounts') === null &&
        localStorage.getItem('nepse_credentials_vault') === null &&
        localStorage.getItem('drabyashree_telegram_token') === null,
        'clearSensitiveStorageOnSignOut purges sensitive storage keys'
      );
    }

    const appSrc = readRepoFile('src/App.jsx');
    const meroSrc = readRepoFile('src/components/MeroShareHub.jsx');
    const loginSrc = readRepoFile('src/components/LoginScreen.jsx');
    ok(!/k\.startsWith\(['"]nepse_hub_['"]\)\s*&&\s*k\.endsWith\(['"]_profiles['"]\)/.test(appSrc), 'App.jsx removed cross-user localStorage harvesting loop');
    ok(!/k\.startsWith\(['"]nepse_hub_['"]\)\s*&&\s*k\.endsWith\(['"]_profiles['"]\)/.test(meroSrc), 'MeroShareHub.jsx removed cross-user localStorage harvesting loop');
    ok(!loginSrc.includes('No data is sent to any server') && !loginSrc.includes('only on this device</strong>'), 'LoginScreen.jsx privacy notices updated accurately on both main and register views');
  }

  // ── BUG-049: Cloud Sync Bearer Auth, scrypt Hashing, Cred Stripping & No Seed Dump ──
  console.log('\n[BUG-049] Cloud sync bearer auth, scrypt hashing, cred stripping & no seed dump');
  {
    process.env.SYNC_TOKEN_SECRET = 'batch1_sync_secret_for_tests_2026';
    const syncRouter = (await import('../proxy/syncRouter.mjs')).default;
    const srv = await startTempServer((app) => { app.use('/api/sync', syncRouter); });

    try {
      const regRes = await fetch(`${srv.baseUrl}/api/sync/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'nepse',
          email: 'alice@example.com',
          passwordHash: 'client_pbkdf2_hash_alice_123456',
          name: 'Alice',
          initialData: {
            watchlist: ['NABIL'],
            subscription: { isPro: true, tier: 'pro', expiresAt: Date.now() + 9e10 },
            credentials: [{ password: 'leak' }],
            profiles: [{ id: '1', boid: '1301000000000001', password: 'secret', crn: '123', pin: '1111' }]
          }
        })
      });
      const regJson = await regRes.json();
      ok(regRes.status === 200 && regJson.success && typeof regJson.token === 'string', 'POST /register issues signed session token');
      ok(!regJson.data?.credentials && !regJson.data?.subscription && !regJson.data?.profiles?.[0]?.password, 'Server strips credentials & forged subscription on register');

      const regB = await fetch(`${srv.baseUrl}/api/sync/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'nepse', email: 'bob@example.com', passwordHash: 'client_pbkdf2_hash_bob_123456', name: 'Bob' })
      });
      const regBJson = await regB.json();

      // Unauthenticated pull/push must fail 401
      const unauthPull = await fetch(`${srv.baseUrl}/api/sync/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'nepse', email: 'alice@example.com' })
      });
      ok(unauthPull.status === 401, 'POST /pull without token/password returns 401');

      const getPull = await fetch(`${srv.baseUrl}/api/sync/pull?app=nepse&email=alice@example.com`);
      ok(getPull.status === 404 || getPull.status === 405, 'GET /pull is disallowed');

      const crossPush = await fetch(`${srv.baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regBJson.token}` },
        body: JSON.stringify({ app: 'nepse', email: 'alice@example.com', data: { watchlist: ['HACKED'] } })
      });
      ok(crossPush.status === 401 || crossPush.status === 403, 'Bob token cannot push into Alice vault');

      const validPush = await fetch(`${srv.baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regJson.token}` },
        body: JSON.stringify({
          app: 'nepse',
          email: 'alice@example.com',
          data: {
            watchlist: ['NABIL', 'CZBIL'],
            subscription: { isPro: true, tier: 'pro', expiresAt: Date.now() + 9e10 }
          }
        })
      });
      ok(validPush.status === 200, 'Alice valid bearer token succeeds on POST /push');

      const pullAfterPush = await fetch(`${srv.baseUrl}/api/sync/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regJson.token}` },
        body: JSON.stringify({ app: 'nepse', email: 'alice@example.com' })
      });
      const pullAfterJson = await pullAfterPush.json();
      ok(pullAfterPush.status === 200 && !pullAfterJson.data?.subscription, 'Server strips forged subscription on POST /push & /pull');

      const seedFilePath = path.join(TMP_DATA_DIR, 'sync_vaults_seed.json');
      const syncSrc = readRepoFile('proxy/syncRouter.mjs');
      ok(!fs.existsSync(seedFilePath) && !syncSrc.includes('SEED_FILE'), 'syncRouter no longer writes sync_vaults_seed.json');
    } finally {
      await srv.close();
    }
  }

  // ── BUG-050, BUG-051, BUG-052: Route Auth, Rate Limit Ordering, Host Spoofing & Discord SSRF ──
  console.log('\n[BUG-050/051/052] Fake-clock, radarRoutes/server guards, rate limit order & Host bypass');
  {
    process.env.ADMIN_API_KEY = 'batch1_strict_admin_secret_key';
    delete process.env.ENFORCE_STRICT_ADMIN_KEY;
    const { requireAdminSecret } = await import('../proxy/middleware/requireAdminSecret.mjs');

    // Spoofed Host: localhost from external IP must FAIL EVEN without ENFORCE_STRICT_ADMIN_KEY
    const reqSpoofHost = {
      ip: '198.51.100.5',
      socket: { remoteAddress: '198.51.100.5' },
      hostname: 'localhost',
      headers: { host: 'localhost' }
    };
    const resSpoofHost = mockRes();
    let nextSpoof = false;
    requireAdminSecret(reqSpoofHost, resSpoofHost, () => { nextSpoof = true; });
    ok(!nextSpoof && resSpoofHost.statusCode === 401, 'requireAdminSecret blocks external IP even with Host: localhost and no ENFORCE_STRICT_ADMIN_KEY');

    const origCronSecret = process.env.INTERNAL_CRON_SECRET;
    process.env.INTERNAL_CRON_SECRET = 'batch1_multi_cron_secret_2026';
    try {
      const reqCron = {
        ip: '198.51.100.5',
        socket: { remoteAddress: '198.51.100.5' },
        headers: { 'x-cron-secret': 'batch1_multi_cron_secret_2026' }
      };
      const resCron = mockRes();
      let nextCron = false;
      requireAdminSecret(reqCron, resCron, () => { nextCron = true; });
      ok(nextCron && resCron.statusCode === 200, 'requireAdminSecret validates INTERNAL_CRON_SECRET even when ADMIN_API_KEY is also set');
    } finally {
      if (origCronSecret !== undefined) process.env.INTERNAL_CRON_SECRET = origCronSecret;
      else delete process.env.INTERNAL_CRON_SECRET;
    }

    process.env.ENFORCE_STRICT_ADMIN_KEY = 'true';

    const radarRouter = (await import('../proxy/routes/radarRoutes.js')).default;
    try {
      const ledgerMod = await import('../proxy/db/ledgerStore.js');
      ledgerDbToClose = ledgerMod.db;
    } catch (_) {}

    const radarSrv = await startTempServer((app) => { app.use('/api', radarRouter); });
    try {
      for (const ep of [
        ['POST', '/api/admin/backfill-trigger'],
        ['POST', '/api/radar/ingest'],
        ['POST', '/api/radar/rebuild-cache'],
        ['POST', '/api/radar/export-snapshot']
      ]) {
        const r = await fetch(`${radarSrv.baseUrl}${ep[1]}`, { method: ep[0], headers: { 'Content-Type': 'application/json' }, body: '{}' });
        ok(r.status === 401, `${ep[0]} ${ep[1]} rejects unauthenticated request with 401 (got ${r.status})`);
      }
      const getRebuild = await fetch(`${radarSrv.baseUrl}/api/radar/rebuild-cache`);
      ok(getRebuild.status === 404, 'GET /radar/rebuild-cache removed (404)');
    } finally {
      await radarSrv.close();
    }

    const discordMod = await import('../proxy/discordNotifier.mjs');
    ok(typeof discordMod.isValidDiscordWebhookUrl === 'function', 'discordNotifier exports isValidDiscordWebhookUrl');
    ok(discordMod.isValidDiscordWebhookUrl?.('https://discord.com/api/webhooks/123456789/abc_DEF-012') === true, 'Valid Discord webhook URL accepted');
    ok(discordMod.isValidDiscordWebhookUrl?.('http://discord.com/api/webhooks/123/abc') === false, 'HTTP Discord webhook rejected');
    ok(discordMod.isValidDiscordWebhookUrl?.('https://discord.com@evil.com/api/webhooks/123/abc') === false, 'Userinfo host spoof webhook rejected');
    ok(discordMod.isValidDiscordWebhookUrl?.('https://169.254.169.254/api/webhooks/123/abc') === false, 'SSRF metadata IP webhook rejected');
    ok(discordMod.isValidDiscordWebhookUrl?.('https://discord.com/api/webhooks/123/abc/../admin') === false, 'Path traversal webhook rejected');

    const serverSrc = readRepoFile('proxy/server.mjs');
    const limiterIdx = serverSrc.indexOf("app.use('/api', apiLimiter)");
    const syncMountIdx = serverSrc.indexOf("app.use('/api/sync', syncRouter)");
    const radarMountIdx = serverSrc.indexOf("app.use('/api', radarRouter)");
    ok(limiterIdx !== -1 && limiterIdx < syncMountIdx && limiterIdx < radarMountIdx, 'apiLimiter is mounted before syncRouter & radarRouter in server.mjs');
    ok(!/req\.hostname\s*===\s*['"]localhost['"]/.test(serverSrc), 'server.mjs no longer trusts req.hostname === "localhost"');
    ok(serverSrc.includes("app.post('/api/telegram/config', requireAdminSecret"), 'POST /api/telegram/config is gated by requireAdminSecret');
    ok(!serverSrc.includes('const hasAdminKey ='), 'Unused hasAdminKey variable removed');
    ok(/guardFakeClockEnv[\s\S]*NODE_ENV\s*===\s*['"]production['"][\s\S]*\/api\/test\/fake-clock',\s*guardFakeClockEnv,\s*requireAdminSecret/.test(serverSrc), '/api/test/fake-clock checks NODE_ENV === production and requireAdminSecret');
  }

  // ── BUG-053: Telegram Webhook Fail-Closed Secret & No Auto-Bind ──
  console.log('\n[BUG-053] Telegram webhook fail-closed secret & no chatId auto-bind');
  {
    const tgMod = await import('../proxy/telegramNotifier.mjs');
    const origTgChat = process.env.TELEGRAM_CHAT_ID;
    const origChat = process.env.CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.CHAT_ID;
    try {
      ok(tgMod.validateWebhookSecretToken(undefined, undefined) === false, 'validateWebhookSecretToken(undefined, undefined) returns false');
      ok(tgMod.validateWebhookSecretToken('', 'attacker') === false, 'validateWebhookSecretToken("", "attacker") returns false');
      ok(tgMod.validateWebhookSecretToken('sec_abc', 'sec_abc') === true, 'validateWebhookSecretToken matches valid secret');

      tgMod.saveTelegramConfig({ botToken: '123456:TESTTOKEN', chatId: '', enabled: true, isTestServer: true });
      const hijackRes = await tgMod.handleIncomingTelegramUpdate({
        update_id: 777001,
        message: { chat: { id: '99999999' }, text: '/status' }
      }, {});
      ok(hijackRes.processed === false && hijackRes.reason === 'chat_id_not_configured', 'Webhook update does NOT auto-bind attacker chatId when cfg.chatId empty');
      ok(tgMod.getTelegramStatus().hasChatId === false, 'cfg.chatId remains unset after rejected hijack attempt');
    } finally {
      if (origTgChat !== undefined) process.env.TELEGRAM_CHAT_ID = origTgChat;
      else delete process.env.TELEGRAM_CHAT_ID;
      if (origChat !== undefined) process.env.CHAT_ID = origChat;
      else delete process.env.CHAT_ID;
    }
  }

  // ── BUG-054: CSV Formula Injection, Filtered Totals, Volume Field & O(N) Export ──
  console.log('\n[BUG-054] CSV formula sanitization, dynamic filtered totals & O(N) history');
  {
    const sanMod = await import('../src/utils/spreadsheetSanitizer.js');
    ok(sanMod.escapeCsvCell('=cmd|\' /C calc\'!A0').startsWith("'=") || sanMod.escapeCsvCell('=cmd|\' /C calc\'!A0').startsWith('"\'='), 'Neutralizes leading = formula');
    ok(sanMod.escapeCsvCell('+1+1').startsWith("'+"), 'Neutralizes leading + formula');
    ok(sanMod.escapeCsvCell('-cmd|calc').startsWith("'-"), 'Neutralizes leading - formula');
    ok(sanMod.escapeCsvCell('@SUM(A1)').startsWith("'@"), 'Neutralizes leading @ formula');
    ok(sanMod.escapeCsvCell('\t=1+1').includes("'\t"), 'Neutralizes leading tab formula');
    ok(sanMod.escapeCsvCell(-500) === '-500' && sanMod.escapeCsvCell('-12.50') === '-12.50', 'Preserves legitimate negative numbers');

    const xmlOut = sanMod.buildExcelWorkbookXml([{ name: 'Test', headers: ['Col'], rows: [['=cmd|calc'], [-42]] }]);
    ok(xmlOut.includes('&apos;=cmd|calc') && xmlOut.includes('<Data ss:Type="Number">-42</Data>'), 'SpreadsheetML XML neutralizes string formulas while keeping numeric negatives');

    const expSrc = readRepoFile('src/utils/floorsheetExport.js');
    ok(!/,\s*100,\s*sumSellQ|\b50,\s*50,\s*'Aggregate'/.test(expSrc), 'Removed hardcoded 100/50 percentages in TOTAL row');
    ok(!expSrc.includes('reversed.indexOf(h)'), 'Removed O(N^2) reversed.indexOf(h) in exportStockPriceHistory');
  }

  // ── BUG-055: MeroShare Route Guards, Log Redaction & Origin-Checked SSE ──
  console.log('\n[BUG-055] MeroShare query/auth hardening & CORS origin-checked SSE stream');
  {
    process.env.ADMIN_API_KEY = 'batch1_strict_admin_secret_key';
    process.env.ENFORCE_STRICT_ADMIN_KEY = 'true';
    const meroRouter = (await import('../proxy/meroshare.js')).default;
    const hubRouter = (await import('../proxy/routes/floorsheetHubRoutes.mjs')).default;

    const srv = await startTempServer((app) => {
      app.use('/api/meroshare', meroRouter);
      app.use('/api/floorsheet/hub', hubRouter);
    });
    try {
      const checkUnauth = await fetch(`${srv.baseUrl}/api/meroshare/check-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyShareId: 1, accountIds: ['a'] })
      });
      ok(checkUnauth.status === 401, 'POST /api/meroshare/check-result requires admin auth (401)');

      const badCorsRes = await fetch(`${srv.baseUrl}/api/floorsheet/hub/stream`, {
        headers: { Origin: 'https://evil-attacker.example' }
      });
      ok(badCorsRes.status === 403 && !badCorsRes.headers.get('access-control-allow-origin'), 'SSE /stream rejects disallowed origin with 403');
    } finally {
      await srv.close();
    }

    const serverSrc = readRepoFile('proxy/server.mjs');
    ok(!serverSrc.includes('JSON.stringify(response.headers)'), 'MeroShare login no longer logs full response.headers');
    ok(!serverSrc.includes('const { token } = req.query'), 'Current-issues no longer extracts token from req.query');
    ok(!serverSrc.includes('const { clientId, username, password, token } = req.query'), 'GET /api/meroshare/ipos no longer accepts query credentials');
  }

  // ── BUG-056 & BUG-098: Notification Drawer + Master100 Token & Position Sizing ──
  console.log('\n[BUG-056 & BUG-098] NotificationDrawer, Telegram token storage & RBCL 0-share sizing');
  {
    const drawerSrc = readRepoFile('src/components/NotificationCenterDrawer.jsx');
    ok(!drawerSrc.includes('window.prompt'), 'NotificationCenterDrawer removed window.prompt()');
    ok(!drawerSrc.includes('nepse_admin_key'), 'NotificationCenterDrawer removed nepse_admin_key localStorage persistence');
    ok(drawerSrc.includes('Simulate Live Setup (NABIL)'), 'NotificationCenterDrawer CTA displays NABIL matching payload');

    const masterWorkSrc = readRepoFile('src/components/Master100ProfitWorkstation.tsx');
    ok(!masterWorkSrc.includes("localStorage.getItem('drabyashree_telegram_token')") && !masterWorkSrc.includes("localStorage.setItem('drabyashree_telegram_token'"), 'Master100 removes drabyashree_telegram_token localStorage read/write');

    const sizingMod = await import('../src/utils/masterPositionSizing.js');
    const masterEngineSrc = readRepoFile('src/utils/masterProfitEngine.ts');
    ok(masterEngineSrc.includes('computeMasterPositionSizing'), 'masterProfitEngine.ts re-exports computeMasterPositionSizing');
    if (typeof sizingMod.computeMasterPositionSizing !== 'function') {
      ok(false, 'masterPositionSizing.js exports computeMasterPositionSizing');
    } else {
      const rbclSize = sizingMod.computeMasterPositionSizing({
        ltp: 13999,
        stopLoss: 13300,
        target1Gross: 15119,
        portfolioCapital: 100000,
        riskTolerancePct: 1.5,
        adv20: 200
      });
      ok(rbclSize.allowedShares === 0 && rbclSize.capitalOutlay === 0 && rbclSize.isBelowMinLot === true, 'RBCL at Rs. 13,999 with 100K budget returns allowedShares: 0 (no forced 10-share Rs. 139,990 breach)');

      const nabilSize = sizingMod.computeMasterPositionSizing({
        ltp: 500,
        stopLoss: 475,
        target1Gross: 540,
        portfolioCapital: 100000,
        riskTolerancePct: 1.5,
        adv20: 20000
      });
      ok(nabilSize.allowedShares === 60 && nabilSize.capitalOutlay === 30000, 'NABIL affordable sizing returns exact 60 shares (Rs. 30,000)');
    }
  }
} catch (err) {
  console.error('Unhandled suite error:', err);
  fail++;
} finally {
  try { ledgerDbToClose?.close?.(); } catch (_) {}
  if (ORIG_NEPSE_DATA_DIR !== undefined) process.env.NEPSE_DATA_DIR = ORIG_NEPSE_DATA_DIR;
  else delete process.env.NEPSE_DATA_DIR;
  if (ORIG_ADMIN_KEY !== undefined) process.env.ADMIN_API_KEY = ORIG_ADMIN_KEY;
  else delete process.env.ADMIN_API_KEY;
  if (ORIG_PORTFOLIO_KEY !== undefined) process.env.PORTFOLIO_AUTH_KEY = ORIG_PORTFOLIO_KEY;
  else delete process.env.PORTFOLIO_AUTH_KEY;
  if (ORIG_STRICT_ADMIN !== undefined) process.env.ENFORCE_STRICT_ADMIN_KEY = ORIG_STRICT_ADMIN;
  else delete process.env.ENFORCE_STRICT_ADMIN_KEY;
  if (ORIG_STRICT_PORTFOLIO !== undefined) process.env.ENFORCE_STRICT_PORTFOLIO_AUTH = ORIG_STRICT_PORTFOLIO;
  else delete process.env.ENFORCE_STRICT_PORTFOLIO_AUTH;
  if (ORIG_NODE_ENV !== undefined) process.env.NODE_ENV = ORIG_NODE_ENV;
  else delete process.env.NODE_ENV;
  if (ORIG_LICENSE_SECRET !== undefined) process.env.PRO_LICENSE_SECRET = ORIG_LICENSE_SECRET;
  else delete process.env.PRO_LICENSE_SECRET;
  if (ORIG_SYNC_SECRET !== undefined) process.env.SYNC_TOKEN_SECRET = ORIG_SYNC_SECRET;
  else delete process.env.SYNC_TOKEN_SECRET;
  try { fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\n======================================================================`);
console.log(` BATCH 1 RESULTS: ${pass} passed, ${fail} failed`);
console.log(`======================================================================\n`);
process.exit(fail > 0 ? 1 : 0);
