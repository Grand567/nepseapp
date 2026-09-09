/**
 * Comprehensive Test Harness for Entry/Exit Analyzer Engine (Stage 1)
 * Validates deterministic backtesting behaviors, methodology fixes, and real stock integrations.
 */

import {
  generateEntryExitPlan,
  buildIndicatorSeries,
  simulateForwardOutcome,
  runAnalogBacktest,
  toAscendingCandles,
  calculateRiskRewardPlan,
  getStrategyTrackRecord
} from '../src/utils/setupAnalyzer.js';

import {
  analyzeTrend,
  analyzeMomentum,
  analyzeVolume,
  analyzeVolatility,
  analyzeTechnical
} from '../src/utils/technicalAnalysisEngine.js';

import {
  analyzeMarketStructure,
  analyzeCandlestickPattern,
  analyzeSupportResistance,
  analyzeBreakout,
  analyzePriceAction
} from '../src/utils/priceActionEngine.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, extra = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName} ${extra}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// TEST A: Analog signal -> next-day open entry
// ─────────────────────────────────────────────────────────────────────
function testA_NextDayOpenEntry() {
  const candles = [
    { date: '2026-01-01', open: 100, high: 105, low: 99, close: 104, volume: 10000 },
    { date: '2026-01-02', open: 108, high: 112, low: 107, close: 110, volume: 15000 }, // t+1 open is 108
    { date: '2026-01-03', open: 110, high: 115, low: 109, close: 114, volume: 12000 },
  ];

  // matchIdx = 0 (signal is 2026-01-01). Expected entry is 2026-01-02 open (108).
  const outcome = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.0 });

  assert(outcome !== null, 'Test A: Outcome generated');
  assert(outcome.signalDate === '2026-01-01', 'Test A: Signal date is 2026-01-01');
  assert(outcome.entryDate === '2026-01-02', 'Test A: Entry date is next day (2026-01-02)');
  assert(outcome.entryPrice === 108, `Test A: Entry price is next-day open (108, got ${outcome.entryPrice})`);
  assert(outcome.entryMethod === 'next_day_open', `Test A: Entry method is 'next_day_open' (got ${outcome.entryMethod})`);
}

// ─────────────────────────────────────────────────────────────────────
// TEST B: Target reached only -> winning trade
// ─────────────────────────────────────────────────────────────────────
function testB_TargetReachedOnly() {
  const candles = [
    { date: '2026-01-01', open: 100, high: 104, low: 98, close: 102, volume: 10000 },
    { date: '2026-01-02', open: 100, high: 102, low: 99, close: 101, volume: 10000 }, // entry = 100
    // Target 1 price will be around 100 + 2.0 * ATR (~106), Target 2 around 100 + 4.0 * ATR (~112)
    { date: '2026-01-03', open: 102, high: 108, low: 101, close: 107, volume: 10000 }, // hits target 1 (108 >= 106, < 112)
  ];

  const outcome = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.0, atrT2Mult: 4.0 });

  assert(outcome.outcome === 'target1_hit', `Test B: Outcome is target1_hit (got ${outcome.outcome})`);
  assert(outcome.outcomeType === 'deterministic', `Test B: Outcome type is deterministic (got ${outcome.outcomeType})`);
  assert(outcome.returnPct > 0, `Test B: Return is positive (got ${outcome.returnPct}%)`);
  assert(outcome.win === true, 'Test B: Win flag is true');
}

// ─────────────────────────────────────────────────────────────────────
// TEST C: Stop reached only -> losing trade
// ─────────────────────────────────────────────────────────────────────
function testC_StopReachedOnly() {
  const candles = [
    { date: '2026-01-01', open: 100, high: 104, low: 98, close: 102, volume: 10000 },
    { date: '2026-01-02', open: 100, high: 101, low: 99, close: 100, volume: 10000 }, // entry = 100
    { date: '2026-01-03', open: 98, high: 99, low: 88, close: 89, volume: 10000 },   // hits stop
  ];

  const outcome = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.0, atrT2Mult: 4.0 });

  assert(outcome.outcome === 'stop_hit', `Test C: Outcome is stop_hit (got ${outcome.outcome})`);
  assert(outcome.outcomeType === 'deterministic', `Test C: Outcome type is deterministic (got ${outcome.outcomeType})`);
  assert(outcome.returnPct < 0, `Test C: Return is negative (got ${outcome.returnPct}%)`);
  assert(outcome.win === false, 'Test C: Win flag is false');
}

// ─────────────────────────────────────────────────────────────────────
// TEST D: Both target and stop reached on same daily candle -> ambiguous_intraday & conservative stop
// ─────────────────────────────────────────────────────────────────────
function testD_SameCandleAmbiguity() {
  const candles = [
    { date: '2026-01-01', open: 100, high: 104, low: 98, close: 102, volume: 10000 },
    { date: '2026-01-02', open: 100, high: 101, low: 99, close: 100, volume: 10000 }, // entry = 100, atr = 3, stop = 95.5, t1 = 106
    // Wild bar that hits both Target (high 120) and Stop (low 80) in the exact same session!
    { date: '2026-01-03', open: 100, high: 120, low: 80, close: 105, volume: 50000 },
  ];

  const outcome = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.0, atrT2Mult: 4.0 });

  assert(outcome.outcomeType === 'ambiguous_intraday', `Test D: outcomeType is 'ambiguous_intraday' (got ${outcome.outcomeType})`);
  assert(outcome.outcome === 'stop_hit', `Test D: Conservative rule assigns 'stop_hit' (got ${outcome.outcome})`);
  assert(outcome.win === false, 'Test D: Conservative outcome counts as loss');
}

// ─────────────────────────────────────────────────────────────────────
// TEST E: Insufficient historical candles
// ─────────────────────────────────────────────────────────────────────
function testE_InsufficientCandles() {
  const shortHistory = [
    { date: '2026-01-01', close: 100, open: 100, high: 101, low: 99, volume: 1000 },
    { date: '2026-01-02', close: 102, open: 100, high: 103, low: 99, volume: 1000 },
  ];

  const result = generateEntryExitPlan({ symbol: 'TEST', ltp: 102 }, shortHistory);

  assert(result.supported === false, 'Test E: unsupported when < 30 candles');
  assert(result.reason.includes('Need at least'), `Test E: reason explains threshold (got: ${result.reason})`);
}

// ─────────────────────────────────────────────────────────────────────
// TEST F: Future data must NOT influence historical fingerprint (No look-ahead)
// ─────────────────────────────────────────────────────────────────────
function testF_NoLookAheadBias() {
  // Generate 100 base candles
  const baseCandles = [];
  let p = 200;
  for (let i = 0; i < 100; i++) {
    const d = new Date(2025, 0, 1 + i).toISOString().slice(0, 10);
    p = +(p * (1 + (i % 5 === 0 ? 0.02 : -0.01))).toFixed(2);
    baseCandles.push({
      date: d,
      open: +(p * 0.99).toFixed(2),
      high: +(p * 1.02).toFixed(2),
      low: +(p * 0.98).toFixed(2),
      close: p,
      volume: 20000 + (i * 100),
    });
  }

  // Version 1: base series
  const series1 = buildIndicatorSeries(baseCandles, { minWarmup: 60 });
  const snapAtDay75_v1 = { ...series1[75] };

  // Version 2: drastically alter future bars (days 76 to 99)
  const modifiedCandles = JSON.parse(JSON.stringify(baseCandles));
  for (let i = 76; i < modifiedCandles.length; i++) {
    modifiedCandles[i].close = 99999;
    modifiedCandles[i].high = 100000;
    modifiedCandles[i].volume = 99999999;
  }

  const series2 = buildIndicatorSeries(modifiedCandles, { minWarmup: 60 });
  const snapAtDay75_v2 = { ...series2[75] };

  assert(
    snapAtDay75_v1.rsi14 === snapAtDay75_v2.rsi14,
    `Test F: Day 75 RSI is identical regardless of future manipulation (v1: ${snapAtDay75_v1.rsi14}, v2: ${snapAtDay75_v2.rsi14})`
  );
  assert(
    snapAtDay75_v1.sma20 === snapAtDay75_v2.sma20,
    `Test F: Day 75 SMA20 is identical regardless of future manipulation`
  );
  assert(
    snapAtDay75_v1.atr14 === snapAtDay75_v2.atr14,
    `Test F: Day 75 ATR14 is identical regardless of future manipulation`
  );
  assert(
    snapAtDay75_v1.pricePos52w === snapAtDay75_v2.pricePos52w,
    `Test F: Day 75 52-week position is identical regardless of future manipulation`
  );
}

// ─────────────────────────────────────────────────────────────────────
// TEST G: Missing data weight redistribution (no neutral 50 injection)
// ─────────────────────────────────────────────────────────────────────
function testG_MissingDataRedistribution() {
  // Generate 80 candles with 0 volume
  const noVolCandles = [];
  let p = 300;
  for (let i = 0; i < 80; i++) {
    const d = new Date(2025, 0, 1 + i).toISOString().slice(0, 10);
    p = +(p * (1 + (i % 2 === 0 ? 0.01 : -0.008))).toFixed(2);
    noVolCandles.push({
      date: d,
      open: p,
      high: +(p * 1.01).toFixed(2),
      low: +(p * 0.99).toFixed(2),
      close: p,
      volume: 0, // NO VOLUME DATA
    });
  }

  // Analyze with no sector, no macro context
  const plan = generateEntryExitPlan({ symbol: 'NOVOL', ltp: 300 }, noVolCandles, {});

  assert(plan.supported === true, 'Test G: Plan is supported');
  assert(plan.unavailableFactors.includes('volume'), `Test G: 'volume' marked unavailable (got: ${plan.unavailableFactors.join(', ')})`);
  assert(plan.unavailableFactors.includes('marketContext'), 'Test G: marketContext marked unavailable');
  assert(plan.unavailableFactors.includes('sectorContext'), 'Test G: sectorContext marked unavailable');

  // Verify effective weights sum to 1.0
  const weightSum = Object.values(plan.effectiveWeights).reduce((a, b) => a + b, 0);
  assert(Math.abs(weightSum - 1.0) < 0.01, `Test G: Effective weights redistribute and sum to 1.0 (got ${weightSum.toFixed(4)})`);
  assert(plan.effectiveWeights.volume === 0, 'Test G: Unavailable volume weight is 0');
  assert(plan.effectiveWeights.trend > plan.weights.trend, `Test G: Available factors received redistributed weight (trend: ${plan.effectiveWeights.trend} > ${plan.weights.trend})`);
}

// ─────────────────────────────────────────────────────────────────────
// TEST H: Real Stock Live Integration (NABIL)
// ─────────────────────────────────────────────────────────────────────
async function testH_RealStockLiveIntegration() {
  try {
    let histRes = await fetch('http://localhost:5000/api/mero/history/NABIL').then(r => r.json()).catch(() => null);
    let hist = Array.isArray(histRes?.data) ? histRes.data : [];
    if (hist.length === 0) {
      histRes = await fetch('http://localhost:5000/api/price-history/NABIL').then(r => r.json()).catch(() => null);
      hist = Array.isArray(histRes) ? histRes : histRes?.data || [];
    }
    const summaryRes = await fetch('http://localhost:5000/api/market-summary').then(r => r.json()).catch(() => null);
    const stock = (summaryRes?.stocks || summaryRes?.data || []).find(s => s.symbol === 'NABIL') || { symbol: 'NABIL', ltp: 552.5 };

    const plan = generateEntryExitPlan(stock, hist, {
      indices: { nepse: { value: 2750, pChange: 0.8 }, subIndices: [{ index: 'Commercial Banks', pChange: 1.2 }] }
    });

    assert(plan.supported === true, 'Test H: Real NABIL analysis supported');
    assert(plan.ltp === stock.ltp, `Test H: Live LTP matches stock LTP (${plan.ltp} === ${stock.ltp})`);
    assert(plan.setupScore >= 0 && plan.setupScore <= 100, `Test H: Setup score in range 0-100 (${plan.setupScore})`);
    assert(['VERY STRONG SETUP', 'STRONG ENTRY ZONE', 'BUY / ACCUMULATE', 'HOLD / WAIT FOR CONFIRMATION', 'REDUCE / AVOID NEW ENTRY', 'EXIT / STAY OUT'].some(v => plan.verdict.startsWith(v)), `Test H: Verdict uses approved classification (${plan.verdict})`);
    assert(plan.confidence && ['HIGH', 'MEDIUM', 'LOW'].includes(plan.confidence.level), `Test H: Confidence is HIGH/MED/LOW (${plan.confidence.level})`);
    assert(plan.levels && plan.levels.entryZone && plan.levels.stopLoss && plan.levels.target1, 'Test H: Complete levels generated');
    assert(plan.levels.rrr1 > 0, `Test H: Valid Risk:Reward (${plan.levels.rrr1}:1)`);
    assert(plan.signalAgreement && plan.signalAgreement.totalEvaluated > 0, `Test H: Signal agreement computed (${plan.signalAgreement.agreementPct}%)`);
    assert(plan.technical && plan.priceAction && plan.analogResult, 'Test H: All sub-engine outputs present');
    assert(plan.combinedScore === plan.setupScore, 'Test H: Backward compatibility alias combinedScore matches setupScore');
  } catch (err) {
    console.error('Real stock integration error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────
async function runAll() {
  console.log('🧪 Running Stage 1 Entry/Exit Analyzer Engine Test Suite...\n');
  testA_NextDayOpenEntry();
  testB_TargetReachedOnly();
  testC_StopReachedOnly();
  testD_SameCandleAmbiguity();
  testE_InsufficientCandles();
  testF_NoLookAheadBias();
  testG_MissingDataRedistribution();
  await testH_RealStockLiveIntegration();

  console.log(`\n📊 RESULTS: ${passedTests} / ${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runAll();
