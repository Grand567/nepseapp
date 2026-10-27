/**
 * tests/zBatchSystemMonitoring.test.mjs
 * Verification Test Suite for STEP 7: DAILY MONITORING & HEALTH CHECKS
 *
 * Verifies:
 * 1. Daily Ingestion Data Completeness Audit (100% complete, discrepancy warning, and data loss alert)
 * 2. Scraper Failure Telemetry & Provider Degradation Tracking
 * 3. Market Session Stale Data Detection (Live trading hours vs Off-market grace periods)
 * 4. Master System Health Aggregator & Status Escalation Rules
 * 5. Rolling Circular Error Log Buffer & Operational Transparency
 */

import assert from 'assert';
import {
  evaluateCompletenessHealth,
  evaluateDataFreshness,
  ScraperHealthTracker,
  aggregateSystemHealth
} from '../src/utils/systemMonitoring.js';

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('======================================================================');
console.log(' STEP 7: DAILY HEALTH CHECKS & SYSTEM MONITORING VERIFICATION SUITE');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Data Completeness Health Evaluation
// -----------------------------------------------------------------------------
it('evaluateCompletenessHealth: identifies clean ingestion, flags discrepancies, and alerts on missing sessions', () => {
  // A. 100% Clean Ingestion
  const cleanRecord = {
    trade_date: '2026-10-25',
    stored_row_count: 28450,
    exchange_reported_count: 28450,
    completeness_pct: 100
  };
  const cleanResult = evaluateCompletenessHealth({ completenessRecord: cleanRecord });
  assert.strictEqual(cleanResult.status, 'HEALTHY');
  assert.strictEqual(cleanResult.code, 'COMPLETE');
  assert.strictEqual(cleanResult.completenessPct, 100);

  // B. Partial Discrepancy (e.g. 88.5% captured due to exchange timeout on later pages)
  const partialRecord = {
    trade_date: '2026-10-24',
    stored_row_count: 24800,
    exchange_reported_count: 28000
  };
  const partialResult = evaluateCompletenessHealth({ completenessRecord: partialRecord });
  assert.strictEqual(partialResult.status, 'WARNING');
  assert.strictEqual(partialResult.code, 'PARTIAL_DISCREPANCY');
  assert.ok(partialResult.completenessPct < 98 && partialResult.completenessPct >= 80);
  assert.ok(partialResult.warningMessage.includes('Data discrepancy'));

  // C. Severe Data Loss (e.g. Only 35% captured)
  const severeRecord = {
    trade_date: '2026-10-23',
    stored_row_count: 9800,
    exchange_reported_count: 28000
  };
  const severeResult = evaluateCompletenessHealth({ completenessRecord: severeRecord });
  assert.strictEqual(severeResult.status, 'CRITICAL');
  assert.strictEqual(severeResult.code, 'INCOMPLETE_DATA_LOSS');
  assert.ok(severeResult.completenessPct < 80);

  // D. Missing Session Record on Expected Trading Session (e.g. Sunday 2026-11-01)
  const missingSessionDate = '2026-11-01'; // Normal Trading Sunday
  const sundayDate = new Date('2026-11-01T12:00:00+05:45');
  const missingResult = evaluateCompletenessHealth({
    completenessRecord: null,
    expectedTradingDate: missingSessionDate,
    now: sundayDate
  });
  assert.strictEqual(missingResult.status, 'CRITICAL');
  assert.strictEqual(missingResult.code, 'MISSING_SESSION');
  assert.ok(missingResult.warningMessage.includes('Missing ingestion record'));
});

// -----------------------------------------------------------------------------
// TEST 2: Scraper Failure Tracking & Degradation Detection
// -----------------------------------------------------------------------------
it('ScraperHealthTracker: tracks success rates, flags 3+ consecutive failures as DEGRADED, and resets on recovery', () => {
  const tracker = new ScraperHealthTracker(20);

  // 1. Initial healthy operations
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: true, latencyMs: 150, itemsCount: 500 });
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: true, latencyMs: 140, itemsCount: 500 });
  let status = tracker.getScraperStatus('floorsheet_scraper');
  assert.strictEqual(status.health, 'HEALTHY');
  assert.strictEqual(status.successRatePct, 100);
  assert.strictEqual(status.consecutiveFailures, 0);

  // 2. Intermittent 1 failure -> Warning
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: false, error: '504 Gateway Timeout' });
  status = tracker.getScraperStatus('floorsheet_scraper');
  assert.strictEqual(status.health, 'WARNING');
  assert.strictEqual(status.consecutiveFailures, 1);
  assert.strictEqual(status.lastError, '504 Gateway Timeout');

  // 3. 2 more failures (total 3 consecutive) -> Escalates to DEGRADED
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: false, error: 'Connection Refused' });
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: false, error: 'Cloudflare 403 Forbidden' });
  status = tracker.getScraperStatus('floorsheet_scraper');
  assert.strictEqual(status.health, 'DEGRADED');
  assert.strictEqual(status.consecutiveFailures, 3);

  // 4. Recovery on next tick
  tracker.recordEvent({ scraper: 'floorsheet_scraper', success: true, latencyMs: 160, itemsCount: 450 });
  status = tracker.getScraperStatus('floorsheet_scraper');
  assert.strictEqual(status.consecutiveFailures, 0, 'Consecutive failures must reset to 0 upon recovery');
  assert.ok(status.lastSuccessAt > 0);
});

// -----------------------------------------------------------------------------
// TEST 3: Market Session Stale Data Detection
// -----------------------------------------------------------------------------
it('evaluateDataFreshness: distinguishes live intraday freshness from off-market and stale feeds', () => {
  const baseTime = new Date('2026-10-25T13:30:00+05:45').getTime(); // Sunday 1:30 PM (Market OPEN)
  const openMarketStatus = { isOpen: true, isWithinTradingHours: true };
  const closedMarketStatus = { isOpen: false, isWithinTradingHours: false };

  // A. Market Open: Data updated 4 minutes ago -> FRESH
  const liveTick = evaluateDataFreshness({
    lastUpdatedTimestamp: baseTime - (4 * 60 * 1000),
    now: baseTime,
    calendarStatus: openMarketStatus
  });
  assert.strictEqual(liveTick.freshness, 'FRESH');
  assert.strictEqual(liveTick.isStale, false);
  assert.strictEqual(liveTick.status, 'HEALTHY');

  // B. Market Open: Data updated 28 minutes ago (> 15m threshold) -> STALE_INTRADAY
  const staleLiveTick = evaluateDataFreshness({
    lastUpdatedTimestamp: baseTime - (28 * 60 * 1000),
    now: baseTime,
    calendarStatus: openMarketStatus
  });
  assert.strictEqual(staleLiveTick.freshness, 'STALE_INTRADAY');
  assert.strictEqual(staleLiveTick.isStale, true);
  assert.strictEqual(staleLiveTick.status, 'WARNING');
  assert.ok(staleLiveTick.message.includes('>15m threshold'));

  // C. Market Closed: Data updated 10 hours ago -> CURRENT_CYCLE (Normal overnight)
  const overnightTick = evaluateDataFreshness({
    lastUpdatedTimestamp: baseTime - (10 * 3600 * 1000),
    now: baseTime,
    calendarStatus: closedMarketStatus
  });
  assert.strictEqual(overnightTick.freshness, 'CURRENT_CYCLE');
  assert.strictEqual(overnightTick.isStale, false);
  assert.strictEqual(overnightTick.status, 'HEALTHY');

  // D. Market Closed: Data updated 55 hours ago without weekend grace -> STALE_HISTORICAL
  const staleHistoricalTick = evaluateDataFreshness({
    lastUpdatedTimestamp: baseTime - (55 * 3600 * 1000),
    now: baseTime,
    calendarStatus: closedMarketStatus
  });
  assert.strictEqual(staleHistoricalTick.freshness, 'STALE_HISTORICAL');
  assert.strictEqual(staleHistoricalTick.isStale, true);
  assert.strictEqual(staleHistoricalTick.status, 'WARNING');
});

// -----------------------------------------------------------------------------
// TEST 4: Master System Health Aggregator & Priority Rules
// -----------------------------------------------------------------------------
it('aggregateSystemHealth: correctly computes overall status and bubbles up alerts', () => {
  // A. All Healthy
  const allHealthy = aggregateSystemHealth({
    completeness: { status: 'HEALTHY', completenessPct: 100 },
    scrapers: {
      nepse_nots: { name: 'NOTS', health: 'HEALTHY', successRatePct: 100, consecutiveFailures: 0 }
    },
    freshness: { status: 'HEALTHY', isStale: false, message: 'Live streaming.' }
  });
  assert.strictEqual(allHealthy.overallStatus, 'HEALTHY');
  assert.strictEqual(allHealthy.errors.length, 0);

  // B. Scraper Degraded -> Overall status must escalate to DEGRADED
  const degradedScraper = aggregateSystemHealth({
    completeness: { status: 'HEALTHY', completenessPct: 100 },
    scrapers: {
      floorsheet_scraper: { name: 'Floorsheet', health: 'DEGRADED', consecutiveFailures: 4, lastError: '403 Forbidden' }
    },
    freshness: { status: 'HEALTHY', isStale: false, message: 'Live streaming.' }
  });
  assert.strictEqual(degradedScraper.overallStatus, 'DEGRADED');
  assert.ok(degradedScraper.errors.some(e => e.includes('Floorsheet')));

  // C. Minor Discrepancy -> Overall status is WARNING
  const warningSystem = aggregateSystemHealth({
    completeness: { status: 'WARNING', completenessPct: 89, warningMessage: 'Partial scrape' },
    scrapers: {
      nepse_nots: { name: 'NOTS', health: 'HEALTHY', successRatePct: 95, consecutiveFailures: 0 }
    },
    freshness: { status: 'HEALTHY', isStale: false, message: 'Live streaming.' }
  });
  assert.strictEqual(warningSystem.overallStatus, 'WARNING');
  assert.ok(warningSystem.warnings.some(w => w.includes('Partial scrape')));
});

// -----------------------------------------------------------------------------
// TEST 5: Rolling Error Log Buffer & Operational Transparency
// -----------------------------------------------------------------------------
it('Error Logging: maintains circular buffer and captures detailed context without memory bloat', () => {
  const tracker = new ScraperHealthTracker(5); // Capacity 5

  for (let i = 1; i <= 8; i++) {
    tracker.recordEvent({
      scraper: 'nepse_nots',
      success: false,
      error: `Connection Timeout #${i}`
    });
  }

  // Circular capacity is 5
  assert.strictEqual(tracker.events.length, 5, 'Buffer must cap at maxEvents (5)');

  // Latest errors should be the most recent ones (items 8, 7, 6, 5, 4)
  const recentErrors = tracker.getRecentErrors();
  assert.strictEqual(recentErrors.length, 5);
  assert.strictEqual(recentErrors[0].error, 'Connection Timeout #8');
  assert.strictEqual(recentErrors[4].error, 'Connection Timeout #4');
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`======================================================================\n`);
