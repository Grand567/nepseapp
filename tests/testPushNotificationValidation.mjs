// tests/testPushNotificationValidation.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEST SUITE: PUSH NOTIFICATION STALE FILTERING & DEDUPLICATION LAYER
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 * 1. Explicit Payload Timestamp Verification (created_at check)
 * 2. 30-Minute TTL Expiration Rule (rejects stale/backlogged broadcasts)
 * 3. Client Queue Deduplication & Content Fingerprinting
 * ═══════════════════════════════════════════════════════════════════════════
 */

import assert from 'assert';

// Mock localStorage for Node.js test environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

// Import notification validation utilities
import {
  NOTIFICATION_TTL_MS,
  extractPayloadCreationTimestamp,
  validatePushNotificationPayload,
  getProcessedNotificationsLog,
  isNotificationAlreadyProcessed,
  markNotificationAsProcessed,
  clearNotificationCache
} from '../src/utils/pushNotificationService.js';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🧪 PUSH NOTIFICATION STALE FILTERING & TIMESTAMP VALIDATION TESTS');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ── Test 1: Explicit Payload Timestamp Extraction ───────────────────────────
console.log('Test 1: Validating Timestamp Extraction across FCM / Push formats...');

const now = Date.now();
const isoString = new Date(now - 120000).toISOString(); // 2 mins ago

// Case 1A: explicit created_at ISO string
const t1 = extractPayloadCreationTimestamp({ data: { created_at: isoString } });
assert.strictEqual(t1.hasTimestamp, true);
assert.strictEqual(t1.sourceField, 'created_at');
assert.strictEqual(Math.abs(t1.createdAtMs - (now - 120000)) < 1000, true);

// Case 1B: explicit created_at_ms epoch string
const t2 = extractPayloadCreationTimestamp({ data: { created_at_ms: String(now - 60000) } });
assert.strictEqual(t2.hasTimestamp, true);
assert.strictEqual(t2.sourceField, 'created_at_ms');

// Case 1C: missing timestamp
const t3 = extractPayloadCreationTimestamp({ data: { symbol: 'NABIL', title: 'Untimestamped alert' } });
assert.strictEqual(t3.hasTimestamp, false);
assert.strictEqual(t3.createdAtMs, 0);

console.log('✔ Case 1 Passed: Timestamp extraction verified.\n');

// ── Test 2: Timestamp Verification & Missing Timestamp Discard ─────────────
console.log('Test 2: Verifying rejection of untimestamped backlogged broadcasts...');

const untimestampedPayload = {
  id: 'alert_no_ts_001',
  title: 'Broker 58 Heavy Buying in SHIVM',
  body: 'Broker 58 absorbed 45,000 shares',
  data: {
    symbol: 'SHIVM',
    type: 'INSTITUTIONAL_ENTRY'
    // created_at is omitted
  }
};

const vMissing = validatePushNotificationPayload(untimestampedPayload, { allowMissingTimestamp: false });
assert.strictEqual(vMissing.valid, false, 'Untimestamped payload must be invalid');
assert.strictEqual(vMissing.reason, 'MISSING_EXPLICIT_TIMESTAMP');
console.log(`✔ Case 2 Passed: Untimestamped notification rejected (${vMissing.error})\n`);

// ── Test 3: TTL Expiration Rule (30 Minutes Threshold) ─────────────────────
console.log('Test 3: Enforcing 30-Minute TTL Expiration Rule...');

// 3A: Fresh alert (5 minutes old) -> MUST PASS
const fresh5MinPayload = {
  id: 'alert_fresh_001',
  title: '🔔 Breakout: NABIL Expanding',
  body: 'Price broken above pivot resistance NPR 620',
  data: {
    symbol: 'NABIL',
    type: 'BREAKOUT',
    created_at: new Date(now - 5 * 60 * 1000).toISOString()
  }
};
const vFresh = validatePushNotificationPayload(fresh5MinPayload);
assert.strictEqual(vFresh.valid, true, '5-minute-old alert must be accepted');

// 3B: Borderline fresh alert (28 minutes old) -> MUST PASS
const fresh28MinPayload = {
  id: 'alert_fresh_028',
  title: '🔔 Whale Accumulation: CHCL',
  body: 'Broker 45 absorbing 55% float',
  data: {
    symbol: 'CHCL',
    type: 'ACCUMULATION',
    created_at: new Date(now - 28 * 60 * 1000).toISOString()
  }
};
const v28Min = validatePushNotificationPayload(fresh28MinPayload);
assert.strictEqual(v28Min.valid, true, '28-minute-old alert must be accepted');

// 3C: Stale alert (35 minutes old) -> MUST BE DISCARDED
const stale35MinPayload = {
  id: 'alert_stale_035',
  title: '🔔 Target Hit: GHL',
  body: 'Take profit target reached',
  data: {
    symbol: 'GHL',
    type: 'PROFIT_BOOKING',
    created_at: new Date(now - 35 * 60 * 1000).toISOString()
  }
};
const v35Min = validatePushNotificationPayload(stale35MinPayload);
assert.strictEqual(v35Min.valid, false, '35-minute-old alert must be discarded');
assert.strictEqual(v35Min.reason, 'TTL_EXPIRED');

// 3D: Delayed broker broadcast arriving 1 DAY LATE -> MUST BE DISCARDED
const dayLateBrokerBroadcast = {
  id: 'broker_broadcast_yesterday',
  title: 'Whale Accumulation: RADHI',
  body: 'Broker 58 buying aggressively',
  data: {
    symbol: 'RADHI',
    type: 'ACCUMULATION',
    created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString() // 24 hours ago
  }
};
const vDayLate = validatePushNotificationPayload(dayLateBrokerBroadcast);
assert.strictEqual(vDayLate.valid, false, '1-day late broadcast must be discarded');
assert.strictEqual(vDayLate.reason, 'TTL_EXPIRED');
assert.strictEqual(vDayLate.ageMinutes >= 1430, true);

console.log(`✔ Case 3 Passed: 30-minute TTL expiration verified (1-day late alert suppressed: age ${vDayLate.ageMinutes}m > TTL 30m).\n`);

// ── Test 4: Queue Deduplication & Persistent Local Cache ─────────────────────
console.log('Test 4: Testing Client-Side Queue Deduplication & Fingerprinting...');

mockStorage.clear();

const originalAlert = {
  id: 'alert_dup_test_100',
  title: 'Broker 58 & 45 Accumulating CIT',
  body: 'Heavy float absorption inside Buy Zone',
  data: {
    symbol: 'CIT',
    type: 'INSTITUTIONAL_ENTRY',
    created_at: new Date(now - 2 * 60 * 1000).toISOString()
  }
};

// First receipt: valid and fresh
const vFirst = validatePushNotificationPayload(originalAlert);
assert.strictEqual(vFirst.valid, true, 'First receipt must be valid');

// Process and record in cache
markNotificationAsProcessed(vFirst.id, vFirst.fingerprint, {
  createdAt: vFirst.createdAtIso,
  symbol: vFirst.symbol,
  type: vFirst.type
});

// Second receipt with SAME ID: must be blocked as DUPLICATE
const vSecond = validatePushNotificationPayload(originalAlert);
assert.strictEqual(vSecond.valid, false, 'Second identical receipt must be rejected');
assert.strictEqual(vSecond.reason, 'DUPLICATE_ALERT');

// Third receipt with DIFFERENT/NEW ID but IDENTICAL broker broadcast content:
// Must be caught and suppressed by the content fingerprint!
const duplicateBroadcastWithNewId = {
  id: 'fcm_retry_new_uuid_9999',
  title: 'Broker 58 & 45 Accumulating CIT',
  body: 'Heavy float absorption inside Buy Zone',
  data: {
    symbol: 'CIT',
    type: 'INSTITUTIONAL_ENTRY',
    created_at: new Date(now - 1 * 60 * 1000).toISOString()
  }
};
const vThird = validatePushNotificationPayload(duplicateBroadcastWithNewId);
assert.strictEqual(vThird.valid, false, 'Broadcast duplicate with new ID must be caught by content fingerprint');
assert.strictEqual(vThird.reason, 'DUPLICATE_ALERT');

console.log('✔ Case 4 Passed: Client-side queue deduplication and fingerprinting verified.\n');

// ── Test 5: Future Timestamp Anomaly Guard ───────────────────────────────────
console.log('Test 5: Testing Future Timestamp Anomaly Protection...');

const futureAnomalyPayload = {
  id: 'alert_future_999',
  title: 'Time traveler alert',
  body: 'Should not happen',
  data: {
    symbol: 'NABIL',
    type: 'BREAKOUT',
    created_at: new Date(now + 15 * 60 * 1000).toISOString() // 15 mins in future
  }
};
const vFuture = validatePushNotificationPayload(futureAnomalyPayload);
assert.strictEqual(vFuture.valid, false);
assert.strictEqual(vFuture.reason, 'FUTURE_TIMESTAMP_ANOMALY');

console.log('✔ Case 5 Passed: Future timestamp anomaly blocked.\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('✅ ALL PUSH NOTIFICATION STALE FILTERING & VALIDATION TESTS PASSED!');
console.log('═══════════════════════════════════════════════════════════════════');
