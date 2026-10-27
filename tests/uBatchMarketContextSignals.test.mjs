/**
 * tests/uBatchMarketContextSignals.test.mjs
 * Verification Test Suite for STEP 2d: MARKET CONTEXT & EVENT SIGNALS
 *
 * Verifies exact mathematical models and NEPSE macro/event guards for:
 * 1. NEPSE Index Trend & Regime (EMA 20/50/200 Stack, Multiplier & Posture)
 * 2. Sector Rotation & Relative Strength (RS vs NEPSE, Turnover Share %, Rotation Quadrants)
 * 3. Market Turnover & Breadth Dynamics (Turnover vs 20d SMA, Advance-Decline, Net Breadth, Breadth Divergence)
 * 4. Corporate Events & Dividend Traps (Book Closure Urgency, Pre-Closure Run-up Zone, Right Share Dilution)
 * 5. SEBON IPO/FPO Pipeline Supply Overhang (Pending sector shares & capital absorption)
 * 6. Composite Market Context Confluence (0-100 score & systemic market posture)
 */

import assert from 'assert';
import {
  evaluateNepseIndexTrend,
  evaluateSectorRotation,
  evaluateMarketTurnoverAndBreadth,
  evaluateCorporateEventImpact,
  evaluateIpoFpoSupplyImpact,
  evaluateMarketContextConfluence
} from '../src/utils/signals/marketContextSignals.js';

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
console.log(' STEP 2d: MARKET CONTEXT & EVENT SIGNALS VERIFICATION SUITE');
console.log('======================================================================\n');

// 1. NEPSE Index Trend & Regime Evaluation
it('evaluateNepseIndexTrend: correctly identifies BULLISH_TREND, BEARISH_TREND, and PULLBACK_IN_BULL', () => {
  // Scenario A: Strong Bull Trend (Price > EMA20 > EMA50)
  const bull = evaluateNepseIndexTrend({
    nepseLtp: 2750,
    nepseEma20: 2680,
    nepseEma50: 2590,
    nepseEma200: 2300,
    nepseChangePct: 1.2
  });
  assert.strictEqual(bull.regime, 'BULLISH_TREND');
  assert.strictEqual(bull.isBullish, true);
  assert.strictEqual(bull.regimeMultiplier, 1.0);
  assert.strictEqual(bull.score, 100);

  // Scenario B: Pullback in Bull (EMA50 < Price < EMA20)
  const pullback = evaluateNepseIndexTrend({
    nepseLtp: 2640,
    nepseEma20: 2680,
    nepseEma50: 2590,
    nepseChangePct: -0.8
  });
  assert.strictEqual(pullback.regime, 'PULLBACK_IN_BULL');
  assert.strictEqual(pullback.isBullish, true);
  assert.strictEqual(pullback.regimeMultiplier, 0.75);

  // Scenario C: Bearish Trend (Price < EMA20 < EMA50)
  const bear = evaluateNepseIndexTrend({
    nepseLtp: 1980,
    nepseEma20: 2050,
    nepseEma50: 2150,
    nepseChangePct: -1.5
  });
  assert.strictEqual(bear.regime, 'BEARISH_TREND');
  assert.strictEqual(bear.isBearish, true);
  assert.strictEqual(bear.regimeMultiplier, 0.25);
  assert.ok(bear.weaknesses.some(w => w.includes('Bearish Trend')));

  // Incomplete data guard
  const missing = evaluateNepseIndexTrend({ nepseLtp: 0, nepseEma20: 0 });
  assert.strictEqual(missing.regime, 'INSUFFICIENT_INDEX_DATA');
});

// 2. Sector Rotation & Relative Strength
it('evaluateSectorRotation: classifies LEADING, IMPROVING, WEAKENING, and LAGGING quadrants', () => {
  // Scenario A: LEADING (Outperforming RS > 0, high turnover share >= 15%)
  const leading = evaluateSectorRotation({
    sector: 'Hydropower',
    sectorChangePct: 2.8,
    nepseChangePct: 0.5, // RS = +2.3%
    sectorTurnover: 1500000000,
    totalMarketTurnover: 6000000000 // 25% share
  });
  assert.strictEqual(leading.relativeStrengthPct, 2.3);
  assert.strictEqual(leading.turnoverSharePct, 25.0);
  assert.strictEqual(leading.rotationStage, 'LEADING');
  assert.strictEqual(leading.isLeading, true);

  // Scenario B: WEAKENING (High turnover >= 15%, but underperforming RS <= 0 -> Distribution)
  const weakening = evaluateSectorRotation({
    sector: 'Commercial Banks',
    sectorChangePct: -0.4,
    nepseChangePct: 0.6, // RS = -1.0%
    sectorTurnover: 1200000000,
    totalMarketTurnover: 6000000000 // 20% share
  });
  assert.strictEqual(weakening.rotationStage, 'WEAKENING');
  assert.ok(weakening.weaknesses.some(w => w.includes('distribution')));

  // Scenario C: LAGGING (Low turnover < 15%, underperforming RS <= 0)
  const lagging = evaluateSectorRotation({
    sector: 'Mutual Fund',
    sectorChangePct: -0.8,
    nepseChangePct: 0.5,
    sectorTurnover: 50000000,
    totalMarketTurnover: 6000000000 // 0.83% share
  });
  assert.strictEqual(lagging.rotationStage, 'LAGGING');
  assert.strictEqual(lagging.isLagging, true);
});

// 3. Market Turnover & Breadth Dynamics
it('evaluateMarketTurnoverAndBreadth: detects liquidity expansion, droughts, and breadth divergences', () => {
  // Scenario A: Broad Expansion (A/D ratio >= 1.8, turnover expanding)
  const healthy = evaluateMarketTurnoverAndBreadth({
    totalTurnover: 7500000000,
    avg20dTurnover: 5000000000, // 1.5x
    advancers: 180,
    decliners: 60,
    unchanged: 15,
    nepseChangePct: 1.1
  });
  assert.strictEqual(healthy.turnoverRatio, 1.5);
  assert.strictEqual(healthy.turnoverRegime, 'EXPANDING');
  assert.strictEqual(healthy.adRatio, 3.0);
  assert.strictEqual(healthy.breadthRegime, 'BROAD_EXPANSION');
  assert.strictEqual(healthy.isBreadthDivergence, false);

  // Scenario B: Breadth Divergence (Index is UP +0.8%, but decliners heavily exceed advancers 60 vs 170)
  const rigged = evaluateMarketTurnoverAndBreadth({
    totalTurnover: 4000000000,
    avg20dTurnover: 4500000000,
    advancers: 60,
    decliners: 170, // A/D = 0.35
    unchanged: 10,
    nepseChangePct: 0.85 // Positive index!
  });
  assert.strictEqual(rigged.isBreadthDivergence, true);
  assert.ok(rigged.weaknesses.some(w => w.includes('BREADTH DIVERGENCE')));
});

// 4. Corporate Events & Dividend Traps
it('evaluateCorporateEventImpact: flags dividend trap zone (<=5 days) and right share dilution overhang', () => {
  // Scenario A: Dividend Trap (Book closure in 3 days)
  const closureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const trap = evaluateCorporateEventImpact({
    symbol: 'DIVIDEND_TRAP',
    bookClosureDate: closureDate,
    latestBonus: 10,
    latestCash: 5
  });
  assert.strictEqual(trap.isDividendTrapZone, true);
  assert.strictEqual(trap.eventRiskLevel, 'HIGH');
  assert.ok(trap.weaknesses.some(w => w.includes('DIVIDEND TRAP WARNING')));

  // Scenario B: Right share dilution (1:0.5 or 50% right issue)
  const rightOverhang = evaluateCorporateEventImpact({
    symbol: 'RIGHT_CO',
    rightRatio: 0.5
  });
  assert.strictEqual(rightOverhang.hasRightOverhang, true);
  assert.strictEqual(rightOverhang.eventRiskLevel, 'MODERATE');
  assert.ok(rightOverhang.weaknesses.some(w => w.includes('RIGHT SHARE DILUTION')));
});

// 5. SEBON IPO/FPO Pipeline Supply Overhang
it('evaluateIpoFpoSupplyImpact: measures queued pipeline supply and detects sector overhangs', () => {
  const samplePipeline = [
    { name: 'Upper Trishuli-1 Hydropower Limited', sector: 'Hydro Power', units: 20000000, amount: 2000000000 },
    { name: 'Siuri Nyadi Power Limited', sector: 'Hydro Power', units: 30000000, amount: 3000000000 },
    { name: 'Apex Hospitality Limited', sector: 'Hotels and Tourism', units: 2250000, amount: 225000000 }
  ];

  // Hydropower: 50M units queued (> 15M threshold)
  const hydroSupply = evaluateIpoFpoSupplyImpact({
    sector: 'Hydro Power',
    pipelineListings: samplePipeline
  });
  assert.strictEqual(hydroSupply.sectorPendingIssuesCount, 2);
  assert.strictEqual(hydroSupply.sectorPendingUnits, 50000000);
  assert.strictEqual(hydroSupply.isHighSupplyOverhang, true);
  assert.strictEqual(hydroSupply.supplyOverhangStatus, 'HIGH_SUPPLY_OVERHANG');

  // Hotels: only 2.25M units queued
  const hotelSupply = evaluateIpoFpoSupplyImpact({
    sector: 'Hotels and Tourism',
    pipelineListings: samplePipeline
  });
  assert.strictEqual(hotelSupply.sectorPendingUnits, 2250000);
  assert.strictEqual(hotelSupply.isHighSupplyOverhang, false);
});

// 6. Composite Market Context Confluence
it('evaluateMarketContextConfluence: outputs FAVORABLE_TAILWIND in healthy conditions and HIGH_RISK_HEADWIND in bear/trap conditions', () => {
  // Scenario A: Bullish Tailwind
  const tailwind = evaluateMarketContextConfluence({
    symbol: 'SHIVM',
    sector: 'Manufacturing',
    nepseTrend: { score: 90, regime: 'BULLISH_TREND' },
    sectorRotation: { score: 85, isLeading: true },
    turnoverBreadth: { score: 80, turnoverRegime: 'EXPANDING' },
    corporateEvents: { score: 80, isDividendTrapZone: false },
    ipoSupply: { score: 80, isHighSupplyOverhang: false }
  });
  assert.ok(tailwind.compositeScore >= 75, `Expected score >= 75, got ${tailwind.compositeScore}`);
  assert.strictEqual(tailwind.marketPosture, 'FAVORABLE_TAILWIND');

  // Scenario B: High Risk Headwind due to Dividend Trap
  const trapPosture = evaluateMarketContextConfluence({
    symbol: 'TRAP_SCRIP',
    sector: 'Hydropower',
    nepseTrend: { score: 85, regime: 'BULLISH_TREND' },
    corporateEvents: { score: 20, isDividendTrapZone: true }
  });
  assert.strictEqual(trapPosture.marketPosture, 'HIGH_RISK_HEADWIND');
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} market context assertions passed successfully.`);
console.log(`======================================================================\n`);
