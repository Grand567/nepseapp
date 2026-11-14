import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runOneDayPriceSelfCheck,
  runtimeSelfCheckMonitor
} from '../src/utils/systemMonitoring.js';

test('Runtime Self-Check: 1D Price Drift & Staleness Monitor (Phase 4 Fix 8)', async (t) => {
  await t.test('1. Market Closed: Self-check gracefully skips live drift checks', () => {
    runtimeSelfCheckMonitor.clear();
    // Saturday 2026-11-14 11:30 NPT (Market Closed)
    const closedNow = new Date('2026-11-14T11:30:00+05:45');

    const result = runOneDayPriceSelfCheck({
      symbol: 'NABIL',
      displayedPrice: 510,
      livePrice: 515, // Price would differ, but market is closed
      lastUpdatedMs: closedNow.getTime() - 3600 * 1000,
      now: closedNow
    });

    assert.equal(result.passed, true);
    assert.equal(result.marketClosed, true);
    assert.equal(runtimeSelfCheckMonitor.getErrors().length, 0);
  });

  await t.test('2. Market Open: Passes when displayed price matches live price and is fresh', () => {
    runtimeSelfCheckMonitor.clear();
    // Tuesday 2026-11-17 12:00 NPT (Market Open)
    const openNow = new Date('2026-11-17T12:00:00+05:45');

    const result = runOneDayPriceSelfCheck({
      symbol: 'SHIVM',
      displayedPrice: 480.50,
      livePrice: 480.50,
      lastUpdatedMs: openNow.getTime() - 20 * 1000, // 20s old
      now: openNow
    });

    assert.equal(result.passed, true);
    assert.equal(result.marketClosed, false);
    assert.equal(result.diff, 0);
    assert.equal(runtimeSelfCheckMonitor.getErrors().length, 0);
  });

  await t.test('3. Market Open: Detects and logs price drift error when displayed != live', () => {
    runtimeSelfCheckMonitor.clear();
    const openNow = new Date('2026-11-17T13:15:00+05:45');

    let loggedError = null;
    const mockLogger = (msg, evt) => {
      loggedError = { msg, evt };
    };

    const result = runOneDayPriceSelfCheck({
      symbol: 'GBIME',
      displayedPrice: 240.00,
      livePrice: 244.50, // Rs. 4.50 difference
      lastUpdatedMs: openNow.getTime() - 10 * 1000,
      now: openNow,
      logger: mockLogger
    });

    assert.equal(result.passed, false);
    assert.equal(result.errorType, 'PRICE_DRIFT');
    assert.equal(result.diff, 4.5);
    assert.ok(loggedError, 'Logger must be invoked on price drift');
    assert.match(loggedError.msg, /differs from live quote/);

    const recorded = runtimeSelfCheckMonitor.getErrors();
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].symbol, 'GBIME');
    assert.equal(recorded[0].diff, 4.5);
  });

  await t.test('4. Market Open: Detects and logs staleness error when age > threshold (120s)', () => {
    runtimeSelfCheckMonitor.clear();
    const openNow = new Date('2026-11-17T14:00:00+05:45');

    let loggedError = null;
    const mockLogger = (msg, evt) => {
      loggedError = { msg, evt };
    };

    const result = runOneDayPriceSelfCheck({
      symbol: 'HDL',
      displayedPrice: 1350.00,
      livePrice: 1350.00, // Prices match, but stale timestamp
      lastUpdatedMs: openNow.getTime() - 180 * 1000, // 180s > 120s threshold
      now: openNow,
      staleThresholdSec: 120,
      logger: mockLogger
    });

    assert.equal(result.passed, false);
    assert.equal(result.errorType, 'STALE_DATA');
    assert.equal(result.ageSeconds, 180);
    assert.ok(loggedError, 'Logger must be invoked on staleness');
    assert.match(loggedError.msg, /180s old/);

    const recorded = runtimeSelfCheckMonitor.getErrors();
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].symbol, 'HDL');
    assert.equal(recorded[0].ageSeconds, 180);
  });
});
