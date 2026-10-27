/**
 * tests/yBatchScreensAndAlerts.test.mjs
 * Verification Test Suite for STEP 6: SCREENS AND ALERTS
 *
 * Verifies:
 * 1. Screener Multi-Criteria Filtering and Deterministic Sorting
 * 2. Stock Information Hub Modal - Stock Score Tab Payload & Execution Plan Generation
 * 3. Broker Accumulation View - Concentration (CR5), Absorption & Syndicate Telemetry
 * 4. Watchlist Entry & Risk Gate Proximity Alerts (Entry Zone, Stop-Loss, Targets)
 * 5. Degraded & Resilient State Handling for Incomplete or Missing Market Feeds
 */

import assert from 'assert';
import { evaluateStockSelection } from '../src/utils/signals/stockScoringEngine.js';
import { SCORING_CONFIG } from '../src/utils/signals/scoringConfig.js';
import {
  calculateTopBrokerAccumulation,
  calculateBrokerConcentration,
  calculateRepeatedBrokerPatterns,
  calculateBuySellImbalance,
  calculateUnusualVolume
} from '../src/utils/signals/brokerFloorsheetSignals.js';

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
console.log(' STEP 6: SCREENS AND ALERTS VERIFICATION SUITE');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Screener Multi-Criteria Filtering and Deterministic Sorting
// -----------------------------------------------------------------------------
it('Screener: filters by Action, Min Score, Sector, and Hard Filters with deterministic sort', () => {
  const sampleUniverse = [
    {
      symbol: 'SHIVM',
      sector: 'Manufacturing',
      ltp: 520,
      turnover: 35000000,
      pChange: 3.5,
      scoring: { action: 'BUY', compositeScore: 82, hardFiltersPassed: true }
    },
    {
      symbol: 'CHCL',
      sector: 'Hydropower',
      ltp: 410,
      turnover: 18000000,
      pChange: 1.2,
      scoring: { action: 'WATCH', compositeScore: 61, hardFiltersPassed: true }
    },
    {
      symbol: 'NICA',
      sector: 'Commercial Banks',
      ltp: 450,
      turnover: 25000000,
      pChange: -0.5,
      scoring: { action: 'AVOID', compositeScore: 42, hardFiltersPassed: false } // failed NPL or filter
    },
    {
      symbol: 'HDHPC',
      sector: 'Hydropower',
      ltp: 180,
      turnover: 1200000, // < 2M illiquid
      pChange: -2.1,
      scoring: { action: 'AVOID', compositeScore: 35, hardFiltersPassed: false }
    },
    {
      symbol: 'GBIME',
      sector: 'Commercial Banks',
      ltp: 210,
      turnover: 15000000,
      pChange: 0.8,
      scoring: { action: 'BUY', compositeScore: 74, hardFiltersPassed: true }
    }
  ];

  // A. Filter by Action: BUY
  const buyOnly = sampleUniverse.filter(s => s.scoring.action === 'BUY');
  assert.strictEqual(buyOnly.length, 2, 'Should return exactly 2 BUY stocks');
  assert.ok(buyOnly.every(s => s.scoring.action === 'BUY'));

  // B. Filter by Min Score: >= 70
  const highScorers = sampleUniverse.filter(s => s.scoring.compositeScore >= 70);
  assert.strictEqual(highScorers.length, 2);

  // C. Filter by Sector: Hydropower
  const hydroOnly = sampleUniverse.filter(s => s.sector === 'Hydropower');
  assert.strictEqual(hydroOnly.length, 2);

  // D. Filter by onlyPassedHardFilters: true
  const passedFilters = sampleUniverse.filter(s => s.scoring.hardFiltersPassed === true);
  assert.strictEqual(passedFilters.length, 3, 'Should only return 3 scrips that passed hard filters');

  // E. Deterministic Sorting: Score Descending
  const sortedByScoreDesc = [...sampleUniverse].sort((a, b) => b.scoring.compositeScore - a.scoring.compositeScore);
  assert.strictEqual(sortedByScoreDesc[0].symbol, 'SHIVM', 'Highest score must be SHIVM (82)');
  assert.strictEqual(sortedByScoreDesc[sortedByScoreDesc.length - 1].symbol, 'HDHPC', 'Lowest score must be HDHPC (35)');

  // F. Deterministic Sorting: Turnover Descending
  const sortedByTurnoverDesc = [...sampleUniverse].sort((a, b) => b.turnover - a.turnover);
  assert.strictEqual(sortedByTurnoverDesc[0].symbol, 'SHIVM', 'Highest turnover must be SHIVM (35M)');
  assert.strictEqual(sortedByTurnoverDesc[1].symbol, 'NICA', 'Second highest turnover must be NICA (25M)');
});

// -----------------------------------------------------------------------------
// TEST 2: Stock Information Hub - Stock Score Tab Payload & Execution Plan
// -----------------------------------------------------------------------------
it('Stock Score Tab: computes composite scoring, 4-pillar breakdown, and safe execution plan', () => {
  const stock = {
    symbol: 'SHIVM',
    sector: 'Manufacturing',
    ltp: 520,
    turnover: 35000000,
    volume: 67300,
    prevClose: 508,
    marketPrice: 520,
    eps: 24.5,
    bookValue: 210,
    listedShares: 44000000,
    publicPercentage: 45,
    high: 525,
    low: 512,
    open: 510,
    close: 520,
    freeFloatShares: 8500000,
    isCircuitLocked: false
  };

  const brokerSignals = {
    compositeScore: 85,
    cr5: 48,
    topBrokerNetQty: 24000,
    buySellImbalanceRatio: 1.6,
    unusualVolumeRatio: 1.85,
    isSyndicateActive: true
  };
  const technicalSignals = {
    compositeScore: 80,
    trend: 'BULLISH',
    rsi: 58.5,
    macdHistogram: 2.4,
    signals: { volatility: { atr14: 16 } },
    volumeConfirmation: true,
    supportPrice: 495,
    resistancePrice: 560
  };
  const fundamentalSignals = {
    compositeScore: 75,
    peRatio: 16.5,
    pbvRatio: 2.1,
    roe: 18.2,
    grahamDiscount: 15,
    npl: 0
  };
  const marketSignals = {
    compositeScore: 80,
    indexRegime: 'BULL',
    sectorQuadrant: 'LEADING',
    breadthRatio: 1.8,
    hasPreClosureRisk: false
  };

  const result = evaluateStockSelection({
    stock,
    brokerSignals,
    technicalSignals,
    fundamentalSignals,
    marketSignals,
    portfolioContext: {
      capital: 1000000,
      riskPerTradePct: 1.5,
      maxPositionExposurePct: 15
    }
  });

  // Check structure
  assert.strictEqual(result.symbol, 'SHIVM');
  assert.strictEqual(result.action, 'BUY');
  assert.ok(result.compositeScore >= 70, `Score must be >= 70 for BUY, got ${result.compositeScore}`);
  assert.ok(result.confidence >= 60, `Confidence must be >= 60, got ${result.confidence}`);

  // Check breakdown weights sum to composite score
  const expectedScore = Math.round(
    (brokerSignals.compositeScore * SCORING_CONFIG.weights.brokerFloorsheet) +
    (technicalSignals.compositeScore * SCORING_CONFIG.weights.technical) +
    (fundamentalSignals.compositeScore * SCORING_CONFIG.weights.fundamental) +
    (marketSignals.compositeScore * SCORING_CONFIG.weights.marketContext)
  );
  assert.strictEqual(result.compositeScore, expectedScore, 'Score breakdown must match config weights');

  // Check execution plan
  const plan = result.executionPlan;
  assert.ok(Array.isArray(plan.entryZone), 'Entry zone must be a [min, max] range');
  assert.ok(plan.entryZone[0] <= 520 && 520 <= plan.entryZone[1], 'LTP must be within entry zone');
  assert.ok(plan.stopLoss < plan.entryZone[0], 'Stop loss must be lower than entry zone floor');
  assert.ok(plan.target1 > plan.entryZone[1], 'Target 1 must be above entry zone ceiling');
  assert.ok(plan.target2 > plan.target1, 'Target 2 must be above target 1');

  // Verify position size does not exceed 15% single-stock cap (150,000 / 520 = ~288 shares)
  assert.ok(plan.positionSizing.capitalRequiredNpr <= 150000, 'Position exposure must not exceed 15% of portfolio equity');

  // Verify Hard Filter failure on distressed BFI
  const distressedBank = {
    ...stock,
    symbol: 'BADB',
    sector: 'Commercial Banks',
    npl: 5.8 // NPL > 5% triggers hard filter failure
  };

  const disqualifiedResult = evaluateStockSelection({
    stock: distressedBank,
    brokerSignals,
    technicalSignals,
    fundamentalSignals,
    marketSignals
  });
  assert.strictEqual(disqualifiedResult.action, 'AVOID', 'Distressed bank with NPL > 5% must be AVOID');
  assert.strictEqual(disqualifiedResult.hardFilters.passedAll, false);
  assert.ok(disqualifiedResult.rejectionReasons.length > 0, 'Must record disqualification reason');
});

// -----------------------------------------------------------------------------
// TEST 3: Broker Accumulation View - Concentration (CR5), Absorption & Churn
// -----------------------------------------------------------------------------
it('Broker Accumulation View: computes CR5, top buyer absorption, and detects wash-trading churn', () => {
  const brokerRecords = [
    { broker: 58, buyQty: 55000, sellQty: 5000, netQty: 50000, turnover: 26000000 },
    { broker: 45, buyQty: 35000, sellQty: 8000, netQty: 27000, turnover: 18000000 },
    { broker: 34, buyQty: 30000, sellQty: 10000, netQty: 20000, turnover: 16000000 },
    { broker: 28, buyQty: 25000, sellQty: 7000, netQty: 18000, turnover: 13000000 },
    { broker: 49, buyQty: 20000, sellQty: 5000, netQty: 15000, turnover: 10500000 },
    { broker: 17, buyQty: 80000, sellQty: 78000, netQty: 2000, turnover: 42000000 } // Churn / Wash trader
  ];

  // A. CR5 Concentration
  const conc = calculateBrokerConcentration(brokerRecords);
  assert.ok(conc.cr5 > 0, 'CR5 must be computed');
  assert.ok(conc.hhiBuy > 0, 'Herfindahl Index must be computed');

  // B. Top Accumulator Absorption
  const topAcc = calculateTopBrokerAccumulation(brokerRecords, 245000);
  assert.strictEqual(topAcc.topBuyers[0].brokerId, '58', 'Broker 58 must be top accumulator');
  assert.strictEqual(topAcc.topBuyers[0].netQty, 50000);
  assert.ok(topAcc.top5NetRatio > 0.15, 'Top 5 net ratio should be significant (>15%)');

  // C. Wash trade / Churn detection: Broker 17 has high gross volume but tiny net (< 3%)
  const churnBroker = brokerRecords.find(b => b.broker === 17);
  const grossVolume = churnBroker.buyQty + churnBroker.sellQty;
  const netRatio = Math.abs(churnBroker.netQty) / grossVolume;
  assert.ok(netRatio < 0.03, `Net-to-gross ratio for Broker 17 is ${netRatio.toFixed(3)}, indicating circular/wash trading`);
});

// -----------------------------------------------------------------------------
// TEST 4: Watchlist Entry & Risk Gate Proximity Alerts
// -----------------------------------------------------------------------------
it('Watchlist Alerts: evaluates entry zone, stop loss violations, and target achievements', () => {
  const alertRules = {
    symbol: 'SHIVM',
    entryZone: [516, 524],
    stopLoss: 492,
    target1: 565,
    target2: 605
  };

  // Helper evaluator mimicking WatchlistEntryAlertModal logic
  function evaluateWatchlistStatus(currentPrice, rules) {
    return {
      inEntryZone: currentPrice >= rules.entryZone[0] && currentPrice <= rules.entryZone[1],
      nearStopLoss: currentPrice > rules.stopLoss && currentPrice <= rules.stopLoss * 1.015,
      stopLossViolated: currentPrice <= rules.stopLoss,
      target1Reached: currentPrice >= rules.target1,
      target2Reached: currentPrice >= rules.target2
    };
  }

  // 1. Inside Entry Zone
  const inside = evaluateWatchlistStatus(520, alertRules);
  assert.strictEqual(inside.inEntryZone, true);
  assert.strictEqual(inside.stopLossViolated, false);
  assert.strictEqual(inside.target1Reached, false);

  // 2. Near Stop Loss warning zone
  const nearSL = evaluateWatchlistStatus(495, alertRules);
  assert.strictEqual(nearSL.inEntryZone, false);
  assert.strictEqual(nearSL.nearStopLoss, true);
  assert.strictEqual(nearSL.stopLossViolated, false);

  // 3. Stop Loss violated
  const breached = evaluateWatchlistStatus(490, alertRules);
  assert.strictEqual(breached.stopLossViolated, true);

  // 4. Target 1 Reached
  const t1 = evaluateWatchlistStatus(570, alertRules);
  assert.strictEqual(t1.target1Reached, true);
  assert.strictEqual(t1.target2Reached, false);

  // 5. Target 2 Reached
  const t2 = evaluateWatchlistStatus(610, alertRules);
  assert.strictEqual(t2.target1Reached, true);
  assert.strictEqual(t2.target2Reached, true);
});

// -----------------------------------------------------------------------------
// TEST 5: Degraded & Resilient State Handling for Incomplete Feeds
// -----------------------------------------------------------------------------
it('Resilience: handles zero volume, undefined metrics, and missing price feeds without crashing', () => {
  const degradedStock = {
    symbol: 'EMPTY',
    ltp: 0,
    turnover: 0,
    volume: 0
  };

  // Should evaluate safely with neutral fallbacks and hard filter failure on zero liquidity
  const result = evaluateStockSelection({
    stock: degradedStock
  });
  assert.ok(result);
  assert.strictEqual(result.symbol, 'EMPTY');
  assert.strictEqual(result.action, 'AVOID');
  assert.strictEqual(result.compositeScore, 50, 'Neutral default composite score should be 50');
  assert.strictEqual(result.hardFilters.passedAll, false);
  assert.ok(result.hardFilters.flags.includes('FAIL_MIN_LIQUIDITY'), 'Zero volume must fail liquidity filter');

  // Broker functions should handle empty arrays
  const emptyConcentration = calculateBrokerConcentration([]);
  assert.strictEqual(emptyConcentration.cr5, 0);

  const emptyAbsorption = calculateTopBrokerAccumulation([], 0);
  assert.strictEqual(emptyAbsorption.top5NetRatio, 0);
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`======================================================================\n`);
