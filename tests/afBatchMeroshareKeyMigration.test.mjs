// tests/afBatchMeroshareKeyMigration.test.mjs
/**
 * Test Suite: MeroShare Encryption Key Migration & Production Startup Safety
 * Run: node tests/afBatchMeroshareKeyMigration.test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
  validateEncryptionConfig,
  getActiveKey,
  encrypt,
  decrypt,
  decryptField,
  decryptAccount,
  migrateAccount,
  loadAccounts,
  saveAccounts,
  OLD_DEFAULT_KEY
} from '../proxy/meroshare.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_ACCOUNTS_FILE = path.join(__dirname, 'temp_meroshare_migration_test.json');

let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

console.log('▶ [SUITE] afBatchMeroshareKeyMigration.test.mjs\n');

try {
  // ─── TEST 1: Production Startup Rejection Without Key ─────────────────────
  console.log('[TEST 1] Production startup guard asserts MEROSHARE_ENCRYPTION_KEY is required');

  let prodErrorThrown = false;
  try {
    validateEncryptionConfig({ NODE_ENV: 'production', MEROSHARE_ENCRYPTION_KEY: '' });
  } catch (err) {
    prodErrorThrown = true;
    ok(err.message.includes('MEROSHARE_ENCRYPTION_KEY environment variable is required in production'), 'Throws clear security error when key is empty in production');
  }
  ok(prodErrorThrown, 'Production environment strictly rejects execution without MEROSHARE_ENCRYPTION_KEY');

  // Spawn node process to test real proxy startup refusal in production
  const spawnResult = spawnSync(process.execPath, [path.join(__dirname, '../proxy/server.mjs')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MEROSHARE_ENCRYPTION_KEY: '',
    },
    timeout: 15000,
    encoding: 'utf8',
  });

  const output = (spawnResult.stderr || '') + (spawnResult.stdout || '');
  ok(spawnResult.status !== 0, 'Proxy process exited with non-zero exit code when started in production without key');
  ok(
    output.includes('CRITICAL SECURITY CONFIGURATION ERROR: MEROSHARE_ENCRYPTION_KEY'),
    'Proxy process printed expected configuration error to stderr on abortive boot'
  );

  // ─── TEST 2: Development / Test Fallback Allowed ──────────────────────────
  console.log('\n[TEST 2] Development/Test environment permits dev fallback key');
  const devKey = validateEncryptionConfig({ NODE_ENV: 'development' });
  ok(devKey === OLD_DEFAULT_KEY, 'Development fallback returns OLD_DEFAULT_KEY');

  const testKey = validateEncryptionConfig({ NODE_ENV: 'test' });
  ok(testKey === OLD_DEFAULT_KEY, 'Test fallback returns OLD_DEFAULT_KEY');

  const customKey = validateEncryptionConfig({ NODE_ENV: 'production', MEROSHARE_ENCRYPTION_KEY: 'test_prod_key_alpha_beta_12345' });
  ok(customKey === 'test_prod_key_alpha_beta_12345', 'Production returns custom key when configured');

  // ─── TEST 3: Encrypt with Old Key, Migrate, and Decrypt with New Key ───────
  console.log('\n[TEST 3] Safe Key Migration: Old Key -> Migration -> New Key Decryption');

  const samplePassword = 'SampleSecurePassword#2082';
  const sampleCrn = 'CRN-789012345';
  const samplePin = '4321';

  // 1. Encrypt with old default key
  const oldEncryptedPass = encrypt(samplePassword, OLD_DEFAULT_KEY);
  const oldEncryptedCrn = encrypt(sampleCrn, OLD_DEFAULT_KEY);
  const oldEncryptedPin = encrypt(samplePin, OLD_DEFAULT_KEY);

  const oldAccount = {
    id: 'test_acc_001',
    name: 'Audit Test User',
    boid: '1301020000000001',
    username: 'audit.user',
    dpCode: '128',
    dpName: 'Capital DP',
    password: oldEncryptedPass,
    crn: oldEncryptedCrn,
    transactionPin: oldEncryptedPin,
  };

  // 2. Set environment to simulate active key rotation
  const NEW_ROTATION_KEY = 'freshly_generated_rotation_key_sha256_ready_xyz!';
  process.env.MEROSHARE_ENCRYPTION_KEY = NEW_ROTATION_KEY;
  delete process.env.MEROSHARE_ENCRYPTION_KEY_PREVIOUS;

  // 3. Decrypt account using migration-aware decryptAccount
  const decryptedResult = decryptAccount(oldAccount);
  ok(decryptedResult.password === samplePassword, 'Plaintext password decrypted successfully via old key fallback');
  ok(decryptedResult.crn === sampleCrn, 'Plaintext CRN decrypted successfully via old key fallback');
  ok(decryptedResult.pin === samplePin, 'Plaintext PIN decrypted successfully via old key fallback');
  ok(decryptedResult.needsReEncrypt === true, 'Account flagged as needsReEncrypt: true');

  // 4. Perform migration
  const { account: migratedAccount, migrated } = migrateAccount(oldAccount, NEW_ROTATION_KEY);
  ok(migrated === true, 'migrateAccount returns migrated: true');
  ok(migratedAccount.password !== oldEncryptedPass, 'Migrated password ciphertext differs from old ciphertext');
  ok(migratedAccount.crn !== oldEncryptedCrn, 'Migrated CRN ciphertext differs from old ciphertext');
  ok(migratedAccount.transactionPin !== oldEncryptedPin, 'Migrated PIN ciphertext differs from old ciphertext');

  // 5. Verify the migrated account decrypts under NEW key without flagging needsReEncrypt
  const migratedDecrypted = decryptAccount(migratedAccount);
  ok(migratedDecrypted.password === samplePassword, 'Migrated password decrypts cleanly under NEW key');
  ok(migratedDecrypted.crn === sampleCrn, 'Migrated CRN decrypts cleanly under NEW key');
  ok(migratedDecrypted.pin === samplePin, 'Migrated PIN decrypts cleanly under NEW key');
  ok(migratedDecrypted.needsReEncrypt === false, 'Migrated account does NOT require re-encryption (up to date)');

  // ─── TEST 4: Optional MEROSHARE_ENCRYPTION_KEY_PREVIOUS Rotation ──────────
  console.log('\n[TEST 4] Custom MEROSHARE_ENCRYPTION_KEY_PREVIOUS rotation');
  const CUSTOM_OLD_KEY = 'previous_custom_vault_key_2025';
  const CUSTOM_NEW_KEY = 'brand_new_custom_vault_key_2026';

  const customOldPass = encrypt('Secret999!', CUSTOM_OLD_KEY);
  const customAccount = {
    id: 'test_acc_002',
    name: 'Custom Rotation User',
    boid: '1301020000000002',
    username: 'custom.user',
    password: customOldPass,
    crn: encrypt('CRN-1111', CUSTOM_OLD_KEY),
    transactionPin: encrypt('1234', CUSTOM_OLD_KEY),
  };

  process.env.MEROSHARE_ENCRYPTION_KEY = CUSTOM_NEW_KEY;
  process.env.MEROSHARE_ENCRYPTION_KEY_PREVIOUS = CUSTOM_OLD_KEY;

  const prevDecrypted = decryptAccount(customAccount);
  ok(prevDecrypted.password === 'Secret999!', 'Decrypted successfully using MEROSHARE_ENCRYPTION_KEY_PREVIOUS');
  ok(prevDecrypted.needsReEncrypt === true, 'Account using previous key correctly flagged for re-encryption');

  const { account: customMigrated } = migrateAccount(customAccount, CUSTOM_NEW_KEY);
  // Now clear previous key to prove new key alone is sufficient
  delete process.env.MEROSHARE_ENCRYPTION_KEY_PREVIOUS;
  const postRotationDecrypted = decryptAccount(customMigrated);
  ok(postRotationDecrypted.password === 'Secret999!', 'Post-migration account decrypts using ONLY current primary key');
  ok(postRotationDecrypted.needsReEncrypt === false, 'Post-migration account needsReEncrypt is false');

  // ─── TEST 5: Automatic Re-Encryption On Write (saveAccounts) ───────────────
  console.log('\n[TEST 5] Disk Persistence Re-Encryption On Next Write');

  // Clean up any test artifact
  if (fs.existsSync(TEMP_ACCOUNTS_FILE)) {
    fs.unlinkSync(TEMP_ACCOUNTS_FILE);
  }

  // Save account that contains old-key ciphertext to temp file
  saveAccounts([oldAccount], TEMP_ACCOUNTS_FILE);
  ok(fs.existsSync(TEMP_ACCOUNTS_FILE), 'Accounts file successfully written to disk');

  // Read raw JSON from disk
  const rawWritten = JSON.parse(fs.readFileSync(TEMP_ACCOUNTS_FILE, 'utf8'));
  ok(rawWritten.length === 1, 'Contains 1 saved account');
  ok(rawWritten[0].password !== oldEncryptedPass, 'Password in persisted JSON was automatically re-encrypted on write');

  // Load through loadAccounts and verify decryption
  const loaded = loadAccounts(TEMP_ACCOUNTS_FILE);
  const reloadedDecrypted = decryptAccount(loaded[0]);
  ok(reloadedDecrypted.password === samplePassword, 'Reloaded account decrypts successfully with primary key');
  ok(reloadedDecrypted.needsReEncrypt === false, 'Reloaded account does not need further migration');

  // Cleanup
  if (fs.existsSync(TEMP_ACCOUNTS_FILE)) {
    fs.unlinkSync(TEMP_ACCOUNTS_FILE);
  }

} finally {
  // Restore environment variables
  delete process.env.MEROSHARE_ENCRYPTION_KEY;
  delete process.env.MEROSHARE_ENCRYPTION_KEY_PREVIOUS;
  process.env.NODE_ENV = 'test';
  if (fs.existsSync(TEMP_ACCOUNTS_FILE)) {
    try { fs.unlinkSync(TEMP_ACCOUNTS_FILE); } catch (_) {}
  }
}

console.log('\n======================================================');
console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log('======================================================');

if (fail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
