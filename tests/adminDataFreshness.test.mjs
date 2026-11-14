import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dataFreshnessTracker,
  TRACKED_SOURCES,
  TRACKED_FEATURES
} from '../proxy/utils/dataFreshnessTracker.mjs';

test('Data Freshness Tracker & Diagnostic Suite (Phase 4 Fix 7)', async (t) => {
  await t.test('1. Registry initializes all required sources and features', () => {
    dataFreshnessTracker.reset();
    const status = dataFreshnessTracker.getStatus(new Date('2026-11-14T09:00:00+05:45')); // Saturday closed

    assert.equal(status.sources.length, TRACKED_SOURCES.length);
    assert.equal(status.features.length, TRACKED_FEATURES.length);

    const sourceNames = status.sources.map(s => s.source);
    for (const src of TRACKED_SOURCES) {
      assert.ok(sourceNames.includes(src), `Missing source: ${src}`);
    }

    const featureNames = status.features.map(f => f.feature);
    for (const feat of TRACKED_FEATURES) {
      assert.ok(featureNames.includes(feat), `Missing feature: ${feat}`);
    }
  });

  await t.test('2. Open Market: Detects fresh vs stale data feeds (> 120s lag)', () => {
    dataFreshnessTracker.reset();
    // Tuesday 2026-11-17 12:30:00 NPT (Active market hours)
    const midSessionNow = new Date('2026-11-17T12:30:00+05:45');

    // Feed 1: Fetched 30s ago (Fresh)
    const freshFetchTime = new Date('2026-11-17T12:29:30+05:45');
    dataFreshnessTracker.recordFetch('nots_live', { sessionDate: '2026-11-17', itemsCount: 300 }, freshFetchTime);

    // Feed 2: Fetched 4 minutes ago (240s > 120s => Stale)
    const staleFetchTime = new Date('2026-11-17T12:26:00+05:45');
    dataFreshnessTracker.recordFetch('sharesansar_today_prices', { sessionDate: '2026-11-17', itemsCount: 300 }, staleFetchTime);

    const status = dataFreshnessTracker.getStatus(midSessionNow, 120);

    assert.equal(status.isMarketOpen, true);

    const notsStatus = status.sources.find(s => s.source === 'nots_live');
    assert.equal(notsStatus.lagSeconds, 30);
    assert.equal(notsStatus.isStale, false, '30s lag should not be stale');

    const ssStatus = status.sources.find(s => s.source === 'sharesansar_today_prices');
    assert.equal(ssStatus.lagSeconds, 240);
    assert.equal(ssStatus.isStale, true, '240s lag during market hours MUST be flagged as stale');
    assert.match(ssStatus.staleReason, /exceeds threshold/);

    assert.equal(status.systemHealth, 'DEGRADED_STALE');
  });

  await t.test('3. Closed Market: Accepts last closed trading session and flags outdated archives', () => {
    dataFreshnessTracker.reset();
    // Saturday 2026-11-14 10:00:00 NPT (Market Closed, last completed session is 2026-11-13 Friday)
    const saturdayNow = new Date('2026-11-14T10:00:00+05:45');

    // Source A has completed 2026-11-13 Friday data
    dataFreshnessTracker.recordProcessed('sqlite_ledger', { sessionDate: '2026-11-13', itemsCount: 5000 }, saturdayNow);
    dataFreshnessTracker.recordFetch('sqlite_ledger', { sessionDate: '2026-11-13' }, saturdayNow);

    // Feature B lagged behind at 2026-11-12 Thursday data
    dataFreshnessTracker.recordProcessed('broker_cornering', { sessionDate: '2026-11-12' }, saturdayNow);
    dataFreshnessTracker.recordFetch('broker_cornering', { sessionDate: '2026-11-12' }, saturdayNow);

    const status = dataFreshnessTracker.getStatus(saturdayNow);

    assert.equal(status.isMarketOpen, false);
    assert.equal(status.expectedSessionDate, '2026-11-13');

    const ledger = status.sources.find(s => s.source === 'sqlite_ledger');
    assert.equal(ledger.isStale, false, 'Friday session on Saturday is valid and fresh');

    const cornering = status.features.find(f => f.feature === 'broker_cornering');
    assert.equal(cornering.isStale, true, 'Thursday session on Saturday when Friday closed must be flagged stale');
    assert.match(cornering.staleReason, /lags behind exchange latest closed session/);
  });
});
