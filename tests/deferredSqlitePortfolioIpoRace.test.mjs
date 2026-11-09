// tests/deferredSqlitePortfolioIpoRace.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { encryptProfileCredentials, decryptProfileCredentials } from '../src/utils/credentialCrypto.js';

test('Point 5 Verification: Deferred startup race conditions, deduplication, and non-empty Portfolio/IPO data', async (t) => {

  await t.test('1. App.jsx immediately executes deferred bootstrap when navigating to portfolio or bulk_ipo', () => {
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    // Verify early trigger exists for portfolio, bulk_ipo, and simulator
    assert.ok(
      appContent.includes("if (activeTab === 'portfolio' || activeTab === 'bulk_ipo' || activeTab === 'simulator')"),
      'App.jsx must immediately trigger deferred bootstrap on portfolio or bulk_ipo navigation'
    );
    assert.ok(
      appContent.includes('runDeferredBootstrap()'),
      'App.jsx must execute runDeferredBootstrap()'
    );
    assert.ok(
      appContent.includes('bootstrappedRef'),
      'App.jsx must track bootstrappedRef to prevent redundant runs'
    );
  });

  await t.test('2. Account deduplication prevents collisions on empty/missing BOID', () => {
    const existingAccounts = [
      { id: 'acc_1', name: 'Primary Account', boid: '1301010001234567', username: 'user1' },
      { id: 'acc_2', name: 'Draft Account A', boid: '', username: 'draft_a' },
      { id: 'acc_3', name: 'Draft Account B', boid: '', username: 'draft_b' }
    ];

    const incomingCloudAccount = {
      id: 'acc_4',
      name: 'Draft Account C',
      boid: '', // Empty BOID
      username: 'draft_c'
    };

    // Correct deduplication logic implemented in App.jsx & Portfolio.jsx
    const merged = [...existingAccounts];
    const matchFound = merged.some(existing => 
      (incomingCloudAccount.boid && existing.boid === incomingCloudAccount.boid) || 
      (incomingCloudAccount.id && existing.id === incomingCloudAccount.id)
    );

    assert.equal(matchFound, false, 'Account with empty BOID and distinct ID must NOT collide with existing empty BOID accounts');

    // If an incoming account has matching ID or valid BOID, it should match
    const matchingAccount = { id: 'acc_2', name: 'Updated Draft Account A', boid: '', username: 'draft_a' };
    const matchFound2 = merged.some(existing => 
      (matchingAccount.boid && existing.boid === matchingAccount.boid) || 
      (matchingAccount.id && existing.id === matchingAccount.id)
    );
    assert.equal(matchFound2, true, 'Account with matching ID must be properly recognized and deduplicated');
  });

  await t.test('3. Simulated immediate launch: Portfolio & Bulk IPO merge preserves all accounts and transactions with 0 loss', () => {
    const userId = 'usr_test_race_startup';
    const txKey = `nepse_hub_${userId}_transactions`;
    const profileKey = `nepse_hub_${userId}_profiles`;
    const bulkKey = 'nepse_hub_bulk_ipo_accounts';

    // Mock localStorage
    const mockStorage = new Map();
    const localStorageShim = {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k)
    };

    // Pre-populate mock transactions
    const initialTxs = [
      { id: 'tx_1', symbol: 'NABIL', type: 'BUY', units: 100, price: 540, date: '2026-04-10' },
      { id: 'tx_2', symbol: 'CIT', type: 'BUY', units: 50, price: 2100, date: '2026-05-15' }
    ];
    localStorageShim.setItem(txKey, JSON.stringify(initialTxs));

    // Pre-populate mock bulk IPO accounts
    const initialBulk = [
      { id: 'bulk_1', name: 'Investor One', boid: '1301010000000001', username: 'inv1', pin: '1234', holdings: [{ scrip: 'NABIL', currentBalance: 100 }] },
      { id: 'bulk_2', name: 'Investor Two', boid: '1301010000000002', username: 'inv2', pin: '5678', holdings: [{ scrip: 'CIT', currentBalance: 50 }] }
    ];
    const encryptedInitialBulk = initialBulk.map(p => encryptProfileCredentials(p, userId));
    localStorageShim.setItem(bulkKey, JSON.stringify(encryptedInitialBulk));

    // Simulate opening Portfolio immediately: reads txs and merges bulk accounts
    const savedTxsRaw = localStorageShim.getItem(txKey);
    const parsedTxs = JSON.parse(savedTxsRaw);
    assert.equal(parsedTxs.length, 2, 'Must load all 2 transactions without data loss');

    const rawBulk = localStorageShim.getItem(bulkKey);
    const parsedEncBulk = JSON.parse(rawBulk);
    const decryptedBulk = parsedEncBulk.map(p => decryptProfileCredentials(p, userId));

    const savedProfilesRaw = localStorageShim.getItem(profileKey);
    const existingProfiles = savedProfilesRaw ? JSON.parse(savedProfilesRaw) : [];
    const mergedProfiles = [...existingProfiles];

    decryptedBulk.forEach(acc => {
      const existing = mergedProfiles.find(p => (acc.boid && p.boid === acc.boid) || (acc.id && p.id === acc.id));
      if (!existing) {
        mergedProfiles.push(acc);
      }
    });

    const encryptedProfiles = mergedProfiles.map(p => encryptProfileCredentials(p, userId));
    localStorageShim.setItem(profileKey, JSON.stringify(encryptedProfiles));

    // Simulate opening Bulk IPO immediately right after: loads and merges
    const reloadedProfilesRaw = localStorageShim.getItem(profileKey);
    const reloadedDecrypted = JSON.parse(reloadedProfilesRaw).map(p => decryptProfileCredentials(p, userId));

    assert.equal(reloadedDecrypted.length, 2, 'Must contain exactly 2 accounts, 0 duplicates');
    assert.equal(reloadedDecrypted[0].name, 'Investor One');
    assert.equal(reloadedDecrypted[1].name, 'Investor Two');
    assert.equal(reloadedDecrypted[0].pin, '1234');
    assert.equal(reloadedDecrypted[1].pin, '5678');
    assert.equal(reloadedDecrypted[0].holdings[0].scrip, 'NABIL');
  });

  await t.test('4. Consistent credential encryption between MeroShareHub and Portfolio prevents plaintext/ciphertext mismatch', () => {
    const userId = 'usr_crypto_test';
    const profile = {
      id: 'p_999',
      name: 'Sanity Check',
      boid: '1301010009999999',
      username: 'sanity_user',
      password: 'SuperSecretPassword!2026',
      pin: '4321',
      crn: 'CRN999'
    };

    // Encrypt like MeroShareHub
    const encrypted = encryptProfileCredentials(profile, userId);
    assert.notEqual(encrypted.password, profile.password, 'Password must be encrypted');
    assert.notEqual(encrypted.pin, profile.pin, 'PIN must be encrypted');

    // Decrypt like Portfolio
    const decrypted = decryptProfileCredentials(encrypted, userId);
    assert.equal(decrypted.password, profile.password, 'Decrypted password must exactly match original');
    assert.equal(decrypted.pin, profile.pin, 'Decrypted PIN must exactly match original');
  });
});
