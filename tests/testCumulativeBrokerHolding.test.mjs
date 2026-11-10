/**
 * tests/testCumulativeBrokerHolding.test.mjs
 * 
 * TDD Suite for Canonical Cumulative Broker Holding & Multi-Session Reconciliation
 * Verifies:
 * 1. Single-day trade matching
 * 2. Multi-day trade accumulation
 * 3. Idempotent re-import (preventing double counting)
 * 4. Missing trading day gap detection (against NEPSE calendar)
 * 5. Bonus / corporate action adjustment & unadjusted labeling
 * 6. Internal cross trade (same-broker) net 0 rule
 * 7. Midnight UTC vs Asia/Kathmandu (UTC+5:45) date boundary
 * 8. Reconciliation verification (Sum of daily == Cumulative total)
 */

import assert from 'assert';
import { 
  computeCanonicalBrokerHoldings, 
  reconcileDailyWithCumulative,
  adjustHoldingsForCorporateActions 
} from '../src/utils/canonicalBrokerHoldingEngine.js';

console.log('════════════════════════════════════════════════════════════════════');
console.log(' RUNNING CANONICAL CUMULATIVE BROKER HOLDING TDD SUITE              ');
console.log('════════════════════════════════════════════════════════════════════\n');

let passedTests = 0;

// ── Test 1: Single Day Trade Matching ──
{
  console.log('[TEST 1] Single Day Trade Matching');
  const day1Trades = [
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 45, kitta: 1000, rate: 200, amount: 200000 },
    { trade_date: '2026-11-02', buyer_broker: 34, seller_broker: 45, kitta: 500, rate: 200, amount: 100000 }
  ];

  const result = computeCanonicalBrokerHoldings(day1Trades, { symbol: 'TEST' });
  assert.strictEqual(result.totalHeldQty, 1500, 'Total held must be 1,500 kitta');
  assert.strictEqual(result.allHoldings.length, 2, 'Must have 2 accumulators');
  assert.strictEqual(result.allDistributors.length, 1, 'Must have 1 distributor (Broker 45)');
  assert.strictEqual(result.allDistributors[0].netQty, -1500, 'Broker 45 net must be -1,500');
  assert.strictEqual(result.reconciliation.isBalanced, true, 'Holding must be zero-sum balanced');
  console.log('  ✓ PASS: Single-day trade matching and zero-sum balance verified.');
  passedTests++;
}

// ── Test 2: Multi-Day Trade Accumulation ──
{
  console.log('[TEST 2] Multi-Day Trade Accumulation');
  const multiDayTrades = [
    // Day 1
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 45, kitta: 1000, rate: 200, amount: 200000 },
    // Day 2
    { trade_date: '2026-11-03', buyer_broker: 58, seller_broker: 34, kitta: 500, rate: 210, amount: 105000 },
    // Day 3
    { trade_date: '2026-11-04', buyer_broker: 14, seller_broker: 58, kitta: 200, rate: 220, amount: 44000 }
  ];

  const result = computeCanonicalBrokerHoldings(multiDayTrades, { symbol: 'TEST' });
  // Broker 58: bought 1000 + 500 = 1500, sold 200 => net +1300
  // Broker 14: bought 200 => net +200
  // Accumulator pool: 1300 + 200 = 1500
  // Broker 45: sold 1000 => net -1000
  // Broker 34: sold 500 => net -500
  // Distributor pool: -1500
  assert.strictEqual(result.totalHeldQty, 1500, 'Total held must be 1,500');
  const b58 = result.allHoldings.find(b => b.brokerId === '58');
  assert.ok(b58, 'Broker 58 must be an accumulator');
  assert.strictEqual(b58.netQty, 1300, 'Broker 58 net kitta must be 1,300');
  assert.strictEqual(b58.buyQty, 1500, 'Broker 58 gross buy must be 1,500');
  assert.strictEqual(b58.sellQty, 200, 'Broker 58 gross sell must be 200');
  // Retention: 1300 / 1500 = 86.7%
  assert.strictEqual(b58.retentionPct, 86.7, 'Broker 58 retention must be 86.7%');
  assert.strictEqual(result.coverage.sessionCount, 3, 'Must record 3 sessions');
  console.log('  ✓ PASS: Multi-day accumulation and partial sell-off math verified.');
  passedTests++;
}

// ── Test 3: Idempotent Daily Imports (No Double Counting) ──
{
  console.log('[TEST 3] Idempotent Daily Imports');
  const dayTrades = [
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 45, kitta: 1000, rate: 200, amount: 200000 }
  ];

  // Feed the exact same trade twice
  const duplicatedTrades = [...dayTrades, ...dayTrades];
  const result = computeCanonicalBrokerHoldings(duplicatedTrades, { symbol: 'TEST', deduplicateByContract: true });
  assert.strictEqual(result.totalHeldQty, 1000, 'Total held must remain 1,000, NOT 2,000');
  console.log('  ✓ PASS: Idempotent deduplication prevents double-counting.');
  passedTests++;
}

// ── Test 4: Missing Trading Day Gap Detection ──
{
  console.log('[TEST 4] Missing Trading Day Gap Detection');
  // 2026-11-02 (Mon), 2026-11-04 (Wed) -> 2026-11-03 (Tue) is a regular trading day missing!
  const gappedTrades = [
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 45, kitta: 1000, rate: 200, amount: 200000 },
    { trade_date: '2026-11-04', buyer_broker: 58, seller_broker: 45, kitta: 500, rate: 205, amount: 102500 }
  ];

  const result = computeCanonicalBrokerHoldings(gappedTrades, { symbol: 'TEST', checkCalendarGaps: true });
  assert.strictEqual(result.coverage.hasGaps, true, 'Must detect gap between Mon and Wed');
  assert.ok(result.coverage.missingDates.includes('2026-11-03'), 'Must identify 2026-11-03 as missing');
  console.log('  ✓ PASS: Calendar gap correctly surfaced and flagged.');
  passedTests++;
}

// ── Test 5: Bonus / Corporate Action Adjustment & Unadjusted Labeling ──
{
  console.log('[TEST 5] Corporate Action Adjustment & Unadjusted Labeling');
  const rawHoldings = {
    totalHeldQty: 1000,
    allHoldings: [{ brokerId: '58', netQty: 1000, avgBuyRate: 200 }]
  };

  // Case A: Unadjusted label check
  const unadjusted = adjustHoldingsForCorporateActions(rawHoldings, null);
  assert.strictEqual(unadjusted.isCorporateAdjusted, false, 'Must be marked unadjusted');
  assert.ok(unadjusted.label.includes('Unadjusted'), 'Label must state unadjusted');

  // Case B: 25% bonus adjustment
  const corporateAction = { type: 'BONUS', bonusPct: 25, exDate: '2026-11-05' };
  const adjusted = adjustHoldingsForCorporateActions(rawHoldings, corporateAction);
  assert.strictEqual(adjusted.isCorporateAdjusted, true, 'Must be marked adjusted');
  assert.strictEqual(adjusted.totalHeldQty, 1250, '1,000 + 25% = 1,250 kitta');
  assert.strictEqual(adjusted.allHoldings[0].netQty, 1250, 'Broker 58 holding adjusted to 1,250');
  assert.strictEqual(adjusted.allHoldings[0].avgBuyRate, 160, 'Avg buy adjusted from 200 to 160 (200 / 1.25)');
  console.log('  ✓ PASS: Corporate action scaling and unadjusted warning verified.');
  passedTests++;
}

// ── Test 6: Internal Cross Trade (Same-Broker Matching) ──
{
  console.log('[TEST 6] Internal Cross Trade Rule (Same-Broker Matching)');
  const tradesWithCross = [
    // Cross trade: Broker 58 buyer and Broker 58 seller
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 58, kitta: 1000, rate: 200, amount: 200000 },
    // External trade: Broker 58 buys 500 from Broker 45
    { trade_date: '2026-11-02', buyer_broker: 58, seller_broker: 45, kitta: 500, rate: 200, amount: 100000 }
  ];

  const result = computeCanonicalBrokerHoldings(tradesWithCross, { symbol: 'TEST' });
  const b58 = result.allHoldings.find(b => b.brokerId === '58');
  assert.strictEqual(b58.netQty, 500, 'Broker 58 net accumulation must be 500, NOT 1,500');
  assert.strictEqual(result.totalHeldQty, 500, 'Total held must be 500');
  console.log('  ✓ PASS: Same-broker internal cross nets strictly to 0.');
  passedTests++;
}

// ── Test 7: Midnight UTC vs Asia/Kathmandu (UTC+5:45) Date Boundary ──
{
  console.log('[TEST 7] Midnight UTC vs Asia/Kathmandu Date Boundary');
  // Timestamp: 2026-11-03T20:00:00.000Z
  // In UTC: 2026-11-03
  // In Asia/Kathmandu (UTC+5:45): 2026-11-04 01:45 AM -> MUST resolve to 2026-11-04!
  const tradeNearMidnightUtc = [
    { trade_time: '2026-11-03T20:00:00.000Z', buyer_broker: 58, seller_broker: 45, kitta: 1000, rate: 200, amount: 200000 }
  ];

  const result = computeCanonicalBrokerHoldings(tradeNearMidnightUtc, { symbol: 'TEST', parseIsoDatesToNpt: true });
  assert.strictEqual(result.coverage.startDate, '2026-11-04', 'Date must be 2026-11-04 in NPT, not 2026-11-03 UTC');
  console.log('  ✓ PASS: Asia/Kathmandu UTC+5:45 timezone boundary verified.');
  passedTests++;
}

// ── Test 8: Reconciliation Check (Sum of Daily == Cumulative Total) ──
{
  console.log('[TEST 8] Reconciliation Check (Sum of Daily == Cumulative Total)');
  const dailyBreakdown = [
    { date: '2026-11-02', netQty: 500 },
    { date: '2026-11-03', netQty: 300 },
    { date: '2026-11-04', netQty: -200 }
  ];
  const reportedCumulative = 600; // 500 + 300 - 200 = 600

  const recon = reconcileDailyWithCumulative(reportedCumulative, dailyBreakdown);
  assert.strictEqual(recon.isConsistent, true, 'Daily sum must equal reported cumulative');
  assert.strictEqual(recon.dailySum, 600);

  // Intentional mismatch check
  const badRecon = reconcileDailyWithCumulative(650, dailyBreakdown);
  assert.strictEqual(badRecon.isConsistent, false, 'Must flag mismatch');
  assert.strictEqual(badRecon.discrepancy, 50, 'Discrepancy must be 50');
  console.log('  ✓ PASS: Reconciliation check validates consistency and flags discrepancies.');
  passedTests++;
}

console.log(`\n════════════════════════════════════════════════════════════════════`);
console.log(` ✅ ALL ${passedTests} TDD TESTS PASSED!`);
console.log(`════════════════════════════════════════════════════════════════════`);
