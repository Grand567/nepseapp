import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

test('1. HTTP Cache Headers - Live no-store vs Closed max-age', () => {
  function getEndpointCacheControl(isLiveSession, isHistorical = false) {
    if (isLiveSession && !isHistorical) {
      return 'no-store, no-cache, must-revalidate, proxy-revalidate';
    }
    return 'public, max-age=60, stale-while-revalidate=120';
  }

  // During active market hours: must be no-store
  const liveHeader = getEndpointCacheControl(true, false);
  assert.ok(liveHeader.includes('no-store'), 'Live market hours endpoint must return no-store');
  assert.ok(liveHeader.includes('no-cache'), 'Live market hours endpoint must return no-cache');

  // After close / weekend: can be cached
  const closedHeader = getEndpointCacheControl(false, false);
  assert.ok(closedHeader.includes('public'), 'Closed session can return public cache');
  assert.ok(closedHeader.includes('max-age='), 'Closed session must set explicit max-age');
});

test('2. Dynamic ETag Generation from Data Payload', () => {
  function computeDataETag(payload) {
    const json = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
    return `W/"nepse-${hash}"`;
  }

  const payloadA = { symbol: 'SHIVM', ltp: 682, volume: 25000 };
  const payloadB = { symbol: 'SHIVM', ltp: 690, volume: 85000 };
  const payloadA_copy = { symbol: 'SHIVM', ltp: 682, volume: 25000 };

  const etagA = computeDataETag(payloadA);
  const etagB = computeDataETag(payloadB);
  const etagA_copy = computeDataETag(payloadA_copy);

  // Identical payloads produce identical ETags
  assert.strictEqual(etagA, etagA_copy);
  // Different payloads produce distinct ETags (invalidating cache)
  assert.notStrictEqual(etagA, etagB);
});

test('3. Cache Key Isolation - (Stock, Window, EndSession)', () => {
  function buildScopedCacheKey(symbol, days, endSession) {
    const cleanSym = String(symbol || '').toUpperCase().trim();
    const cleanDays = String(days || '1').toLowerCase().trim();
    const cleanDate = String(endSession || '').trim() || 'latest';
    return `cache:${cleanSym}:days_${cleanDays}:session_${cleanDate}`;
  }

  const keyShivm5D = buildScopedCacheKey('SHIVM', 5, '2026-11-13');
  const keyShivm15D = buildScopedCacheKey('SHIVM', 15, '2026-11-13');
  const keyNabil5D = buildScopedCacheKey('NABIL', 5, '2026-11-13');
  const keyShivm5D_Next = buildScopedCacheKey('SHIVM', 5, '2026-11-17');

  // Invariant 1: Timeframes cannot collide
  assert.notStrictEqual(keyShivm5D, keyShivm15D);
  // Invariant 2: Stocks cannot collide
  assert.notStrictEqual(keyShivm5D, keyNabil5D);
  // Invariant 3: Session dates cannot collide
  assert.notStrictEqual(keyShivm5D, keyShivm5D_Next);
});
