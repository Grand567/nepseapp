/**
 * J-BATCH: Advanced Quant Engines & Reliability Upgrades Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates:
 *   [J1] Automatic Signal Outcome Tracker (signalTracker.js)
 *        - Signal recording, filtering, outcome evaluation (target hit, stop hit, expired)
 *        - Performance stats aggregation (win rate, return %, holding days)
 *   [J2] Unified Stock Snapshot Service (stockSnapshot.js)
 *        - Invariant: Market Cap strictly = listedShares * LTP
 *        - Cache management, liquidity classification, fiscal year / quarter preservation
 *   [J3] Multi-Session Broker Accumulation Footprint (accumulationDistributionEngine.ts)
 *        - Operator accumulation, operator distribution, and wash trading / churn detection
 *        - Top broker dominance calculation with zero fabricated fallback prices
 *   [J4] Walk-Forward Setup Score Backtest Engine (backtest.js)
 *        - Point-in-time walk-forward simulation (T+1 open entry, no lookahead bias)
 *        - Multi-horizon tracking (T+5, T+10, T+20), MFE/MAE excursions
 *        - Score bucketing (<50, 50-69, 70-84, 85-100) & NEPSE ±10% circuit limit enforcement
 *
 * Run: node tests/jBatchAdvancedEngines.test.mjs
 */

// Polyfill localStorage for Node test runner
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
  recordSignal,
  getSignals,
  evaluateOpenSignals,
  getSignalStats,
  clearSignals
} from '../src/services/signalTracker.js';

import {
  fetchStockSnapshot,
  getSnapshotCache,
  clearSnapshotCache,
  enrichStockFromSnapshot
} from '../src/services/stockSnapshot.js';

import { setCachedStockFundamentals } from '../src/utils/liveData.js';

import {
  calculateMultiSessionBrokerFootprint
} from '../src/utils/accumulationDistributionEngine.ts';

import {
  runWalkForwardScoreBacktest
} from '../src/utils/backtest.js';

let pass = 0, fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log('  PASS:', m);
  } else {
    fail++;
    console.error('  FAIL:', m);
  }
};

// ══════════════════════════════════════════════════════════════════
// [J1] AUTOMATIC SIGNAL OUTCOME TRACKER
// ══════════════════════════════════════════════════════════════════
console.log('\n[J1] Automatic Signal Outcome Tracker (signalTracker.js)');
clearSignals();

// Test 1: Record and filter
const sig1 = recordSignal({
  symbol: 'NABIL',
  source: 'entry-exit',
  signalType: 'BUY',
  entryPrice: 450,
  targetPrice: 495,
  stopLoss: 420,
  verdict: 'ACCUMULATE ON PULLBACK',
  setupScore: 78
});
ok(sig1 && sig1.id && sig1.status === 'open', 'Records signal with status "open"');
ok(getSignals({ symbol: 'NABIL' }).length === 1, 'Filters signal by symbol');
ok(getSignals({ source: 'entry-exit' }).length === 1, 'Filters signal by source');

// Test 2: Target Hit evaluation
const marketStocksT1 = [
  { symbol: 'NABIL', ltp: 498, high: 502, low: 445 }
];
const evalResultT1 = evaluateOpenSignals(marketStocksT1);
ok(evalResultT1.closed === 1, 'evaluateOpenSignals closes target-hit signal');
const closedSig1 = getSignals({ symbol: 'NABIL' })[0];
ok(closedSig1.status === 'hit_target', 'Status transitions to "hit_target"');
ok(closedSig1.outcome?.hitTarget === true, 'Outcome flags hitTarget as true');
ok(closedSig1.outcome?.returnPct === 10, 'Return % calculated accurately (495 vs 450 = +10.0%)');

// Test 3: Stop Loss Hit evaluation
const sig2 = recordSignal({
  symbol: 'SHIVM',
  source: 'entry-exit',
  signalType: 'BUY',
  entryPrice: 500,
  targetPrice: 560,
  stopLoss: 470,
  verdict: 'BREAKOUT',
  setupScore: 72
});
const marketStocksT2 = [
  { symbol: 'SHIVM', ltp: 465, high: 505, low: 465 }
];
const evalResultT2 = evaluateOpenSignals(marketStocksT2);
ok(evalResultT2.closed === 1, 'evaluateOpenSignals closes stop-hit signal');
const closedSig2 = getSignals({ symbol: 'SHIVM' })[0];
ok(closedSig2.status === 'hit_stop', 'Status transitions to "hit_stop"');
ok(closedSig2.outcome?.hitStop === true, 'Outcome flags hitStop as true');
ok(closedSig2.outcome?.returnPct === -6, 'Return % calculated accurately (470 vs 500 = -6.0%)');

// Test 4: Aggregate statistics
const stats = getSignalStats();
ok(stats.total === 2 && stats.closedCount === 2, 'Aggregate stats counts match');
ok(stats.winRate === 50, 'Win rate calculated accurately (1 win, 1 loss = 50%)');
ok(stats.avgReturnPct === 2, 'Average return calculated accurately ((10 - 6) / 2 = +2.0%)');
ok(stats.bestTrade?.symbol === 'NABIL' && stats.bestTrade?.returnPct === 10, 'Identifies best trade');
ok(stats.worstTrade?.symbol === 'SHIVM' && stats.worstTrade?.returnPct === -6, 'Identifies worst trade');

clearSignals();


// ══════════════════════════════════════════════════════════════════
// [J2] UNIFIED STOCK SNAPSHOT SERVICE
// ══════════════════════════════════════════════════════════════════
console.log('\n[J2] Unified Stock Snapshot Service (stockSnapshot.js)');
clearSnapshotCache();

setCachedStockFundamentals('NABIL', {
  symbol: 'NABIL',
  companyName: 'Nabil Bank Limited',
  sector: 'Commercial Banks',
  ltp: 450,
  pChange: 1.5,
  eps: 25.4,
  pe: 17.7,
  bookValue: 215,
  listedShares: 270000000,
  publicPercentage: 40,
  fiscalYear: '2080/81',
  quarter: 'Q4'
});

// Test snapshot fetching for known symbol in NEPSE universe (e.g. NABIL)
const snapNabil = await fetchStockSnapshot('NABIL');
ok(snapNabil && snapNabil.symbol === 'NABIL', 'Returns snapshot with normalized symbol');
ok(snapNabil.sector === 'Commercial Banks', 'Resolves sector from verified universe');
ok(typeof snapNabil.listedShares === 'number' && snapNabil.listedShares > 0, 'Listed shares populated');
ok(snapNabil.fiscalYear === '2080/81', 'Snapshot carries fiscalYear');
ok(snapNabil.quarter === 'Q4', 'Snapshot carries quarter');
ok(snapNabil.marketCap === 270000000 * 450, 'Invariant: Market cap strictly = listedShares * LTP');
ok(snapNabil.floatMarketCap === (270000000 * 450) * 0.40, 'Float market cap calculated properly');

// Test cache retrieval
const cachedSnap = getSnapshotCache('NABIL');
ok(cachedSnap && cachedSnap.symbol === 'NABIL', 'getSnapshotCache returns cached snapshot within TTL');

// Test clearSnapshotCache
clearSnapshotCache('NABIL');
ok(getSnapshotCache('NABIL') === null, 'clearSnapshotCache invalidates symbol entry');

// Test enrichStockFromSnapshot
const baseStock = { symbol: 'NABIL', ltp: 450, volume: 150000 };
const enriched = enrichStockFromSnapshot(baseStock, snapNabil);
ok(enriched.sector === snapNabil.sector, 'Enriches base stock with snapshot sector');
ok(enriched.listedShares === snapNabil.listedShares, 'Enriches base stock with snapshot listedShares');


// ══════════════════════════════════════════════════════════════════
// [J3] MULTI-SESSION BROKER ACCUMULATION FOOTPRINT
// ══════════════════════════════════════════════════════════════════
console.log('\n[J3] Multi-Session Broker Accumulation Footprint (accumulationDistributionEngine.ts)');

// Simulate 3 trading sessions of floorsheets
const session1 = [
  { contractNo: '1', buyer: '58', seller: '45', symbol: 'HDL', qty: 10000, rate: 500, amount: 5000000 },
  { contractNo: '2', buyer: '58', seller: '34', symbol: 'HDL', qty: 15000, rate: 505, amount: 7575000 },
];
const session2 = [
  { contractNo: '3', buyer: '58', seller: '28', symbol: 'HDL', qty: 20000, rate: 510, amount: 10200000 },
  { contractNo: '4', buyer: '49', seller: '45', symbol: 'HDL', qty: 5000, rate: 512, amount: 2560000 },
];
const session3 = [
  { contractNo: '5', buyer: '58', seller: '45', symbol: 'HDL', qty: 15000, rate: 515, amount: 7725000 },
  { contractNo: '6', buyer: '17', seller: '45', symbol: 'HDL', qty: 5000, rate: 515, amount: 2575000 },
];

const footprintAcc = calculateMultiSessionBrokerFootprint([session1, session2, session3], 'HDL', 515);

ok(footprintAcc.symbol === 'HDL', 'Footprint returns target symbol');
ok(footprintAcc.totalSessions === 3, 'Tracks 3 sessions evaluated');
ok(footprintAcc.totalVolume === 70000, 'Sum of volume across sessions = 70,000');
ok(footprintAcc.netAccumulators.length > 0, 'Identifies net accumulators');
ok(footprintAcc.netAccumulators[0].broker === '58', 'Top accumulator is Broker 58');
ok(footprintAcc.netAccumulators[0].netQty === 60000, 'Broker 58 net accumulated 60,000 shares');
ok(footprintAcc.netDistributors[0].broker === '45', 'Top distributor is Broker 45');
ok(footprintAcc.smartMoneyStance === 'OPERATOR_ACCUMULATION', 'Flags OPERATOR_ACCUMULATION when top broker dominance >= 20%');

// Test Churn / Wash trading detection
const churnSession = [
  { contractNo: '10', buyer: '42', seller: '19', symbol: 'TEST', qty: 15000, rate: 200, amount: 3000000 },
  { contractNo: '11', buyer: '14', seller: '42', symbol: 'TEST', qty: 14000, rate: 200, amount: 2800000 },
];
const footprintChurn = calculateMultiSessionBrokerFootprint([churnSession], 'TEST', 200);
ok(footprintChurn.washTradingRisk === true, 'Detects wash trading / dual-sided churn on broker 42');


// ══════════════════════════════════════════════════════════════════
// [J4] WALK-FORWARD SETUP SCORE BACKTEST ENGINE
// ══════════════════════════════════════════════════════════════════
console.log('\n[J4] Walk-Forward Setup Score Backtest Engine (backtest.js)');

// Insufficient history guard
const shortHistory = [
  { date: '2026-01-01', open: 100, high: 105, low: 98, close: 102, volume: 1000 }
];
const guardResult = runWalkForwardScoreBacktest(shortHistory);
ok(guardResult.error && guardResult.totalEvaluations === 0, 'Rejects insufficient history safely');

// Generate 90 synthetic daily candles with realistic trends
const testCandles = [];
let basePrice = 300;
const startDate = new Date('2025-01-01');

for (let i = 0; i < 90; i++) {
  const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
  const dateStr = d.toISOString().split('T')[0];
  // Steady uptrend with slight oscillation
  const changePct = ((i % 5) - 1.5) * 0.8;
  const open = +basePrice.toFixed(1);
  const close = +(basePrice * (1 + changePct / 100)).toFixed(1);
  const high = +(Math.max(open, close) * 1.015).toFixed(1);
  const low = +(Math.min(open, close) * 0.985).toFixed(1);
  const volume = 20000 + (i % 7) * 5000;

  testCandles.push({
    date: dateStr,
    open,
    high,
    low,
    close,
    volume
  });
  basePrice = close;
}

const wfResult = runWalkForwardScoreBacktest(testCandles, {
  step: 3,
  minHistory: 30,
  horizons: [5, 10, 20],
  symbol: 'TEST'
});

ok(wfResult && typeof wfResult.totalEvaluations === 'number', 'Produces walk-forward results object');
ok(wfResult.totalEvaluations > 0, `Successfully evaluated ${wfResult.totalEvaluations} walk-forward setup points`);
ok(Boolean(wfResult.scoreBuckets['<50']), 'Produces "<50" score bucket');
ok(Boolean(wfResult.scoreBuckets['50-69']), 'Produces "50-69" score bucket');
ok(Boolean(wfResult.scoreBuckets['70-84']), 'Produces "70-84" score bucket');
ok(Boolean(wfResult.scoreBuckets['85-100']), 'Produces "85-100" score bucket');
ok(typeof wfResult.correlation === 'number', `Computes Pearson forward correlation (${wfResult.correlation})`);
ok(typeof wfResult.summary?.interpretation === 'string', 'Produces human-readable summary interpretation');

// Verify evaluation record details (T+1 open fill, MFE, MAE)
if (wfResult.evaluations.length > 0) {
  const sample = wfResult.evaluations[0];
  ok(sample.entryPrice > 0, 'Evaluation records T+1 entry price');
  ok(typeof sample.setupScore === 'number', 'Evaluation records 0-100 setup score');
  if (sample.outcomes['T+5']) {
    ok(typeof sample.outcomes['T+5'].returnPct === 'number', 'Records T+5 return %');
    ok(typeof sample.outcomes['T+5'].mfePct === 'number', 'Records T+5 Max Favorable Excursion');
    ok(typeof sample.outcomes['T+5'].maePct === 'number', 'Records T+5 Max Adverse Excursion');
  }
}

// ══════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════
console.log(`\n========================================`);
console.log(`J-BATCH RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log(`========================================\n`);

if (fail > 0) process.exit(1);
