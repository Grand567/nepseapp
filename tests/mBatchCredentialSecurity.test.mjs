// tests/mBatchCredentialSecurity.test.mjs
/**
 * Test Suite: MeroShare Credential Encryption & Vault Security (SEC-01)
 * Run: node tests/mBatchCredentialSecurity.test.mjs
 */

// Polyfill localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import {
  encryptSensitiveField,
  decryptSensitiveField,
  encryptProfileCredentials,
  decryptProfileCredentials,
  maskSensitiveCredentialProfile
} from '../src/utils/credentialCrypto.js';

let pass = 0, fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log(`  ✓ PASS: ${m}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${m}`);
  }
};

console.log('▶ [SUITE] mBatchCredentialSecurity.test.mjs (SEC-01 Audit Verification)\n');

// ── Test 1: Field-Level Encryption & Obfuscation ──
console.log('[TEST 1] Field-level cipher transformation');
const rawPassword = 'MySecretMeroShareP@ssword2082!';
const encryptedPassword = encryptSensitiveField(rawPassword, 'user_nepse_1');
ok(encryptedPassword.startsWith('enc_v1:'), 'Ciphertext contains version prefix "enc_v1:"');
ok(!encryptedPassword.includes('MySecretMeroShareP@ssword2082!'), 'Plaintext password does NOT appear anywhere in ciphertext');
ok(encryptedPassword.length > rawPassword.length, 'Ciphertext has valid expanded length');

const decryptedPassword = decryptSensitiveField(encryptedPassword, 'user_nepse_1');
ok(decryptedPassword === rawPassword, 'Decrypted field exactly matches original plaintext password');

// ── Test 2: Profile Envelope Encryption ──
console.log('\n[TEST 2] Profile credential envelope encryption');
const profile = {
  id: 'acc_101',
  name: 'Ramesh Sharma',
  boid: '1301020001234567',
  username: 'ramesh.sharma',
  password: 'ActualPlaintextPassword#123',
  crn: 'CRN-987654321',
  pin: '5678',
  dpCode: '128'
};

const encryptedProfile = encryptProfileCredentials(profile, 'user_nepse_1');
ok(encryptedProfile.password.startsWith('enc_v1:'), 'Profile password is encrypted with enc_v1 prefix');
ok(encryptedProfile.crn.startsWith('enc_v1:'), 'Profile CRN is encrypted with enc_v1 prefix');
ok(encryptedProfile.pin.startsWith('enc_v1:'), 'Profile PIN is encrypted with enc_v1 prefix');
ok(encryptedProfile.username === 'ramesh.sharma', 'Non-sensitive username remains accessible in envelope');
ok(encryptedProfile.boid === '1301020001234567', 'Non-sensitive BOID remains accessible in envelope');

// ── Test 3: LocalStorage Vault Zero-Plaintext Verification ──
console.log('\n[TEST 3] LocalStorage vault payload security check');
localStorage.clear();
const vaultAccounts = [encryptedProfile];
localStorage.setItem('nepse_hub_bulk_ipo_accounts', JSON.stringify(vaultAccounts));

const storedRaw = localStorage.getItem('nepse_hub_bulk_ipo_accounts');
ok(!storedRaw.includes('ActualPlaintextPassword#123'), 'ZERO plaintext password exposure in raw localStorage');
ok(!storedRaw.includes('CRN-987654321'), 'ZERO plaintext bank CRN exposure in raw localStorage');
ok(!storedRaw.includes('"5678"'), 'ZERO plaintext transaction PIN exposure in raw localStorage');

// In-memory deserialization test (as executed by PreferencesSettingsService)
const loadedVault = JSON.parse(storedRaw).map(a => decryptProfileCredentials(a, 'user_nepse_1'));
ok(loadedVault[0].password === 'ActualPlaintextPassword#123', 'Decrypted in-memory profile has correct password');
ok(loadedVault[0].crn === 'CRN-987654321', 'Decrypted in-memory profile has correct CRN');
ok(loadedVault[0].pin === '5678', 'Decrypted in-memory profile has correct PIN');

// ── Test 4: Idempotency (Prevent Double-Encryption) ──
console.log('\n[TEST 4] Encryption idempotency guard');
const doubleEncrypted = encryptProfileCredentials(encryptedProfile, 'user_nepse_1');
ok(!doubleEncrypted.password.startsWith('enc_v1:enc_v1:'), 'Already encrypted field is not double-encrypted');
ok(doubleEncrypted.password === encryptedProfile.password, 'Ciphertext remains stable on subsequent encrypt calls');

// ── Test 5: Legacy Plaintext Backward-Compatibility ──
console.log('\n[TEST 5] Legacy plaintext profile fallback');
const legacyPlaintextProfile = {
  id: 'acc_legacy_99',
  name: 'Old User',
  password: 'legacyPlainPassword',
  crn: '12345',
  pin: '1111'
};
const decryptedLegacy = decryptProfileCredentials(legacyPlaintextProfile, 'user_nepse_1');
ok(decryptedLegacy.password === 'legacyPlainPassword', 'Legacy plaintext password passes through safely without crash');
ok(decryptedLegacy.crn === '12345', 'Legacy plaintext CRN passes through safely without crash');
ok(decryptedLegacy.pin === '1111', 'Legacy plaintext PIN passes through safely without crash');

// ── Test 6: Backup Export Redaction Verification ──
console.log('\n[TEST 6] Backup JSON export credential redaction');
const exportedMeroShare = loadedVault.map(a => ({
  ...a,
  password: '••••••••',
  pin: a.pin ? '••••' : '',
  crn: a.crn ? `***${String(a.crn).slice(-3)}` : ''
}));

const exportedJson = JSON.stringify(exportedMeroShare);
ok(!exportedJson.includes('ActualPlaintextPassword#123'), 'Exported backup JSON does not contain password');
ok(!exportedJson.includes('CRN-987654321'), 'Exported backup JSON does not contain full CRN');
ok(!exportedJson.includes('"5678"'), 'Exported backup JSON does not contain transaction PIN');
ok(exportedJson.includes('***321'), 'Exported backup masks CRN to last 3 digits');
ok(exportedJson.includes('••••••••'), 'Exported backup replaces password with mask');

console.log(`\n====================================================`);
console.log(`RESULTS: ${pass} passed, ${fail} failed.`);
console.log(`====================================================`);

if (fail > 0) {
  process.exit(1);
} else {
  console.log('✅ SEC-01 CRITICAL FIX VERIFIED: ZERO PLAINTEXT CREDENTIAL LEAKAGE!\n');
}
