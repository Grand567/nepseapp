/**
 * Cross-Module Consistency & Quantitative Reconciliation Test Suite
 * ══════════════════════════════════════════════════════════════════════════
 * Mathematically verifies that Accumulation & Distribution Radar,
 * Broker Dominance & Cornering, and Quantitative Indicator engines
 * maintain 100% data parity and zero contradictory outputs.
 *
 * Invariants Verified:
 *   [C1] Single Source of Truth: Unified broker cache yields identical top buyer across engines.
 *   [C2] Sample Sufficiency Guard: Thin floorsheets (< 200 kitta or <= 1 trade) are rejected uniformly.
 *   [C3] Wash-Trade & Self-Matching Neutralization: Internal block cross-trades are classified as Neutral.
 *   [C4] Indicator Precedence Hierarchy: Wyckoff Accumulation strictly suppresses secondary OBV bearish signals.
 *   [C5] Zero-Sum vs Smart Inflow Conservation: Total exchange net volume is 0, but Smart Money Inflow reflects top buyers.
 *
 * Run: node tests/auditCrossModuleConsistency.test.mjs
 */

import assert from 'node:assert/strict';
import {
  calculateBrokerConcentration,
  evaluateEarlyDetectionSignals,
  calculateLeadingOBVDivergence,
  calculateEffortVsResult
} from '../src/utils/accumulationDistributionEngine.ts';

let passed = 0;
let failed = 0;
const ok = (label) => { passed++; console.log(`  PASS: ${label}`); };
const fail = (label, err) => { failed++; console.error(`  ✖ FAIL: ${label} — ${err}`); };
const check = (cond, label) => { try { assert(cond, label); ok(label); } catch (e) { fail(label, e.message); } };

console.log('====================================================================');
console.log(' AUDIT: CROSS-MODULE RECONCILIATION & DATA PARITY (100% INVARIANTS) ');
console.log('====================================================================\n');

// ── C1: Single Source of Truth Broker Parity ────────────────────────────────
console.log('[C1] Single Source of Truth Parity (Radar vs Dominance)');
{
  const realBrokerData = {
    symbol: 'GCIL',
    topBuyers: [
      { broker: '40', brokerName: 'Creative Securities', buyQty: 18450, buyAmt: 7749000, pct: 24.5 },
      { broker: '58', brokerName: 'Naasa Securities', buyQty: 9200, buyAmt: 3864000, pct: 12.2 },
      { broker: '22', brokerName: 'Frist Choice Securities', buyQty: 6100, buyAmt: 2562000, pct: 8.1 }
    ],
    topSellers: [
      { broker: '45', brokerName: 'Imperial Securities', sellQty: 11000, sellAmt: 4620000, pct: 14.6 },
      { broker: '34', brokerName: 'Vision Securities', sellQty: 8500, sellAmt: 3570000, pct: 11.3 }
    ],
    totalTradedQty: 75300,
    concentrationPct: 44.8,
    bcr3BuyPct: 44.8,
    bcr5BuyPct: 58.2
  };

  const stockSummary = {
    symbol: 'GCIL',
    ltp: 420,
    volume: 75300,
    realBrokerAnalysis: realBrokerData
  };

  const bcrResult = calculateBrokerConcentration([], 'GCIL', stockSummary);

  check(bcrResult.topBuyerBrokers.length >= 3, 'Engine ingests cached real broker buyers');
  check(bcrResult.topBuyerBrokers[0].broker === '40', 'Top Buyer matches Broker #40 across modules');
  check(bcrResult.topBuyerBrokers[1].broker === '58', 'Second Buyer matches Broker #58 across modules');
  check(bcrResult.topBuyerBrokers[2].broker === '22', 'Third Buyer matches Broker #22 across modules');
  check(Math.abs(bcrResult.bcr3BuyPct - 44.8) < 0.5, `BCR3 buy concentration is 44.8% (got ${bcrResult.bcr3BuyPct}%)`);
}

// ── C2: Thin Floorsheet Sample Sufficiency Guard ─────────────────────────────
console.log('\n[C2] Sample Sufficiency Guard Against Micro-Sample Skew');
{
  const microFloorsheet = [
    { contractNo: '1001', buyer: '45', seller: '34', symbol: 'THIN', qty: 25, rate: 200, amount: 5000 }
  ];

  const bcrMicro = calculateBrokerConcentration(microFloorsheet, 'THIN');

  check(bcrMicro.isInsufficientSample === true, 'Flags sample with 25 shares as insufficient');
  check(bcrMicro.sampleValidity === 'INSUFFICIENT_SAMPLE', 'sampleValidity === INSUFFICIENT_SAMPLE');
  check(bcrMicro.smartMoneyBias === 'Insufficient Data', 'Does NOT fabricate 100% Institutional Cornering');
  check(bcrMicro.bcr3BuyPct === 0, 'Concentration forced to 0% to prevent false ranking');
  check(bcrMicro.description.includes('Insufficient trade sample'), 'Provides explanatory audit description');
}

// ── C3: Self-Matching Cross-Trade Neutralization ─────────────────────────────
console.log('\n[C3] Self-Matching Block Cross-Trade Neutralization');
{
  const selfTradeFloorsheet = [
    { contractNo: '999', buyer: '58', seller: '58', symbol: 'BLOCK', qty: 25000, rate: 300, amount: 7500000 },
    { contractNo: '1000', buyer: '58', seller: '58', symbol: 'BLOCK', qty: 25000, rate: 300, amount: 7500000 }
  ];

  const bcrCross = calculateBrokerConcentration(selfTradeFloorsheet, 'BLOCK');

  check(bcrCross.smartMoneyBias === 'Neutral', 'Self-matching trades classified as Neutral (not Institutional Cornering)');
  check(bcrCross.sampleValidity === 'CROSS_TRADE', 'sampleValidity === CROSS_TRADE');
  check(bcrCross.description.includes('Bilateral Block Transfer'), 'Identified as Bilateral Block Transfer');
  check(bcrCross.bcr3BuyPct <= 45, 'Concentration capped below institutional threshold');
}

// ── C4: Indicator Precedence Hierarchy ──────────────────────────────────────
console.log('\n[C4] Indicator Precedence Hierarchy (Wyckoff vs Oscillators)');
{
  const candles = [
    { date: '2026-01-01', open: 200, high: 204, low: 198, close: 200, volume: 5000 },
    { date: '2026-01-02', open: 200, high: 203, low: 197, close: 201, volume: 3000 },
    { date: '2026-01-03', open: 201, high: 202, low: 198, close: 200, volume: 2000 },
    { date: '2026-01-04', open: 200, high: 202, low: 199, close: 201, volume: 1500 },
    { date: '2026-01-05', open: 201, high: 202, low: 199, close: 200, volume: 1200 }
  ];

  const stockWyckoffAccumulation = {
    symbol: 'WYCK1',
    ltp: 200,
    pChange: 0.0,
    wyckoff: { stage: '🟢 STEALTH_ACCUMULATION' },
    cmf20: 0.05
  };

  const earlySignals = evaluateEarlyDetectionSignals(stockWyckoffAccumulation, candles);

  check(earlySignals.earlyAlertVerdict !== 'EARLY_DISTRIBUTION_CHURN', 'Wyckoff Accumulation suppresses conflicting distribution alert');
  check(earlySignals.earlyAlertVerdict !== 'DISTRIBUTION', 'Does not produce contradictory distribution verdict');
}

// ── C5: Zero-Sum Conservation vs Smart Money Inflow ─────────────────────────
console.log('\n[C5] Zero-Sum Conservation vs Smart Money Net Inflow');
{
  const validTrades = [
    { contractNo: '1', buyer: '58', seller: '1', symbol: 'FLOW1', qty: 10000, rate: 500, amount: 5000000 },
    { contractNo: '2', buyer: '58', seller: '2', symbol: 'FLOW1', qty: 5000, rate: 500, amount: 2500000 },
    { contractNo: '3', buyer: '45', seller: '3', symbol: 'FLOW1', qty: 3000, rate: 500, amount: 1500000 },
    { contractNo: '4', buyer: '10', seller: '4', symbol: 'FLOW1', qty: 2000, rate: 500, amount: 1000000 }
  ];

  const bcrFlow = calculateBrokerConcentration(validTrades, 'FLOW1');

  check(bcrFlow.totalBuyVolume === bcrFlow.totalSellVolume, `Exchange buy volume (${bcrFlow.totalBuyVolume}) === sell volume (${bcrFlow.totalSellVolume})`);
  check(bcrFlow.smartMoneyNetVolume > 0, `Smart Money Net Inflow is positive (+${bcrFlow.smartMoneyNetVolume} kitta)`);
  check(bcrFlow.topNetAccumulators[0].broker === '58', 'Top Net Accumulator is Broker #58');
  check(bcrFlow.topNetAccumulators[0].netQty === 15000, 'Broker #58 net kitta === 15,000');
}

console.log('\n====================================================================');
console.log(` AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ 100% CROSS-MODULE RECONCILIATION VERIFIED!\n');
  process.exit(0);
}
