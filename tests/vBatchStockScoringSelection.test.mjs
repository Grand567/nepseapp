/**
 * tests/vBatchStockScoringSelection.test.mjs
 * Verification Test Suite for STEP 3: SCORING & SELECTION ENGINE
 *
 * Verifies exact mathematical models, zero-tolerance hard filters, and execution plans:
 * 1. Clean High-Confluence BUY recommendation with complete Execution Plan
 * 2. Moderate WATCH candidate identification
 * 3. Low-score AVOID outcome
 * 4. Zero-Tolerance Hard Filter: Thin Liquidity Trap (< Rs. 20L turnover or < 5k kitta)
 * 5. Zero-Tolerance Hard Filter: Circuit Ceiling / Floor Lock Protection (±15%)
 * 6. Zero-Tolerance Hard Filter: NRB BFI NPL > 5% Regulatory Safety Gate
 * 7. Zero-Tolerance Hard Filter: Loss-Making Scrip Exclusion (EPS <= 0)
 * 8. Thin Liquidity Participation Clamp (Max 5% of daily volume position sizing)
 */

import assert from 'assert';
import { SCORING_CONFIG } from '../src/utils/signals/scoringConfig.js';
import { evaluateStockSelection } from '../src/utils/signals/stockScoringEngine.js';

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
console.log(' STEP 3: SCORING & SELECTION ENGINE VERIFICATION SUITE');
console.log('======================================================================\n');

// 1. Clean High-Confluence BUY Recommendation
it('evaluateStockSelection: generates BUY with entry zone, circuit-clamped stop/targets, and safe sizing', () => {
  const stock = {
    symbol: 'SHIVM',
    sector: 'Manufacturing',
    ltp: 520,
    prevClose: 510,
    volume: 85000,
    turnover: 44200000, // Rs. 4.42 Cr
    eps: 24.5,
    bookValue: 210,
    listedShares: 44000000,
    publicPercentage: 45
  };

  const brokerSignals = { compositeScore: 85, weaknesses: [] };
  const technicalSignals = {
    compositeScore: 80,
    signals: { volatility: { atr14: 16 } },
    weaknesses: []
  };
  const fundamentalSignals = { compositeScore: 75, weaknesses: [] };
  const marketSignals = { compositeScore: 80, weaknesses: [] };

  const res = evaluateStockSelection({
    stock,
    brokerSignals,
    technicalSignals,
    fundamentalSignals,
    marketSignals,
    portfolioContext: { capital: 1000000 }
  });

  assert.strictEqual(res.action, 'BUY');
  assert.ok(res.compositeScore >= 75, `Expected score >= 75, got ${res.compositeScore}`);
  assert.ok(res.confidence >= 65, `Expected confidence >= 65, got ${res.confidence}`);
  assert.strictEqual(res.hardFilters.passedAll, true);

  // Verify Execution Plan
  const plan = res.executionPlan;
  assert.ok(plan !== null);
  assert.strictEqual(plan.entryLtp, 520);
  assert.ok(plan.entryZone[0] < 520 && plan.entryZone[1] > 520);

  // Stop loss: ATR(16) * 1.5 = 24 -> 520 - 24 = 496
  assert.strictEqual(plan.stopLoss, 496);
  assert.ok(plan.stopLoss > plan.circuitFloor, 'Stop loss must be above circuit floor');

  // Targets
  assert.strictEqual(plan.riskPerShare, 24);
  // Target 1: 520 + (24 * 1.5) = 556
  assert.strictEqual(plan.target1, 556);
  // Target 2: 520 + (24 * 2.5) = 580
  assert.strictEqual(plan.target2, 580);
  assert.ok(plan.target1 <= plan.circuitCeiling, 'Target 1 must be within circuit ceiling');
  assert.strictEqual(plan.riskRewardRatio, 1.5);

  // Position Sizing (Capital: 10 Lakhs, Risk: 1.5% = Rs. 15,000. Clamped by 15% Single Stock Cap: Rs. 150,000 / 520 = 288 -> 280 kitta)
  assert.strictEqual(plan.positionSizing.sharesKitta, 280);
  assert.strictEqual(plan.positionSizing.capitalRequiredNpr, 145600); // 280 * 520
  assert.strictEqual(plan.positionSizing.maxRiskNpr, 6720); // 280 * 24 (strictly <= 15,000)
  assert.ok(plan.positionSizing.portfolioCapitalPct <= 15.0, 'Must respect 15% single stock cap');
  assert.strictEqual(plan.positionSizing.sharesKitta % 10, 0, 'Lot size must be multiple of 10');
});

// 2. WATCH Candidate Identification
it('evaluateStockSelection: identifies candidate meeting WATCH criteria (score 50-69)', () => {
  const stock = {
    symbol: 'GBIME',
    sector: 'Commercial Banks',
    ltp: 210,
    prevClose: 208,
    volume: 50000,
    turnover: 10500000,
    eps: 16.5,
    npl: 2.8,
    car: 12.5
  };

  const res = evaluateStockSelection({
    stock,
    brokerSignals: { compositeScore: 60 },
    technicalSignals: { compositeScore: 55 },
    fundamentalSignals: { compositeScore: 65 },
    marketSignals: { compositeScore: 55 }
  });

  assert.strictEqual(res.action, 'WATCH');
  assert.ok(res.compositeScore >= 50 && res.compositeScore < 70);
  assert.strictEqual(res.hardFilters.passedAll, true);
});

// 3. Low-Score AVOID
it('evaluateStockSelection: assigns AVOID when composite score is below 50', () => {
  const stock = {
    symbol: 'WEAK',
    sector: 'Hydropower',
    ltp: 240,
    prevClose: 245,
    volume: 20000,
    turnover: 4800000,
    eps: 4.2
  };

  const res = evaluateStockSelection({
    stock,
    brokerSignals: { compositeScore: 30 },
    technicalSignals: { compositeScore: 35 },
    fundamentalSignals: { compositeScore: 40 },
    marketSignals: { compositeScore: 35 }
  });

  assert.strictEqual(res.action, 'AVOID');
  assert.ok(res.compositeScore < 50);
});

// 4. Hard Filter: Minimum Liquidity Gate
it('evaluateStockSelection: rejects high-scoring stock if turnover < Rs. 20 Lakhs', () => {
  const stock = {
    symbol: 'THIN',
    sector: 'Finance',
    ltp: 300,
    prevClose: 295,
    volume: 3000, // < 5,000 kitta
    turnover: 900000, // Rs. 9 Lakhs (< Rs. 20 Lakhs)
    eps: 18.0
  };

  const res = evaluateStockSelection({
    stock,
    brokerSignals: { compositeScore: 90 },
    technicalSignals: { compositeScore: 85 },
    fundamentalSignals: { compositeScore: 80 },
    marketSignals: { compositeScore: 80 }
  });

  assert.strictEqual(res.action, 'AVOID');
  assert.strictEqual(res.hardFilters.passedAll, false);
  assert.strictEqual(res.hardFilters.liquidityPassed, false);
  assert.ok(res.rejectionReasons.some(r => r.includes('Thin Liquidity Trap')));
});

// 5. Hard Filter: Circuit Ceiling / Floor Lock Protection
it('evaluateStockSelection: rejects stock locked at +15% ceiling or -15% floor', () => {
  // Scenario A: Ceiling locked (+15% gain from 100 to 115, 0 ask liquidity)
  const ceilingLocked = {
    symbol: 'PUMPED',
    sector: 'Hydropower',
    ltp: 115,
    prevClose: 100,
    volume: 35000,
    turnover: 4025000,
    eps: 8.0,
    askQty: 0
  };

  const resCeiling = evaluateStockSelection({
    stock: ceilingLocked,
    brokerSignals: { compositeScore: 90 },
    technicalSignals: { compositeScore: 90 }
  });

  assert.strictEqual(resCeiling.action, 'AVOID');
  assert.strictEqual(resCeiling.hardFilters.circuitPassed, false);
  assert.ok(resCeiling.rejectionReasons.some(r => r.includes('Circuit Ceiling Locked')));

  // Scenario B: Floor locked (-15% crash from 200 to 170, 0 bid liquidity)
  const floorLocked = {
    symbol: 'DUMPED',
    sector: 'Hydropower',
    ltp: 170,
    prevClose: 200,
    volume: 35000,
    turnover: 5950000,
    eps: 8.0,
    bidQty: 0
  };

  const resFloor = evaluateStockSelection({
    stock: floorLocked,
    brokerSignals: { compositeScore: 80 },
    technicalSignals: { compositeScore: 80 }
  });

  assert.strictEqual(resFloor.action, 'AVOID');
  assert.strictEqual(resFloor.hardFilters.circuitPassed, false);
  assert.ok(resFloor.rejectionReasons.some(r => r.includes('Circuit Floor Locked')));
});

// 6. Hard Filter: NRB BFI NPL Regulatory Breach
it('evaluateStockSelection: enforces NRB NPL <= 5% safety gate on banks and financial institutions', () => {
  const stressedBank = {
    symbol: 'STRESSEDBANK',
    sector: 'Commercial Banks',
    ltp: 220,
    prevClose: 218,
    volume: 40000,
    turnover: 8800000,
    eps: 12.0,
    npl: 6.2, // > 5.0% NRB ceiling!
    car: 12.0
  };

  const res = evaluateStockSelection({
    stock: stressedBank,
    brokerSignals: { compositeScore: 85 },
    technicalSignals: { compositeScore: 85 },
    fundamentalSignals: { compositeScore: 80 }
  });

  assert.strictEqual(res.action, 'AVOID');
  assert.strictEqual(res.hardFilters.regulatoryPassed, false);
  assert.ok(res.rejectionReasons.some(r => r.includes('NRB Asset Quality Breach')));
});

// 7. Hard Filter: Loss-Making Scrip Exclusion
it('evaluateStockSelection: rejects scrip with EPS <= 0', () => {
  const lossMaking = {
    symbol: 'LOSER',
    sector: 'Hydropower',
    ltp: 260,
    prevClose: 255,
    volume: 40000,
    turnover: 10400000,
    eps: -3.5 // Negative EPS!
  };

  const res = evaluateStockSelection({
    stock: lossMaking,
    brokerSignals: { compositeScore: 85 },
    technicalSignals: { compositeScore: 85 }
  });

  assert.strictEqual(res.action, 'AVOID');
  assert.strictEqual(res.hardFilters.regulatoryPassed, false);
  assert.ok(res.rejectionReasons.some(r => r.includes('Loss-Making Scrip')));
});

// 8. Thin Liquidity Participation Clamp
it('evaluateStockSelection: clamps position size to max 5% of daily volume to prevent illiquid slippage', () => {
  const illiquidCandidate = {
    symbol: 'SMALLVOL',
    sector: 'Manufacturing',
    ltp: 300,
    prevClose: 295,
    volume: 6000, // Only 6,000 shares traded daily
    turnover: 1800000, // Set customConfig to allow turnover
    eps: 15.0
  };

  // Override min turnover filter to specifically test volume clamp behavior
  const customConfig = {
    ...SCORING_CONFIG,
    hardFilters: {
      ...SCORING_CONFIG.hardFilters,
      minDailyTurnoverNpr: 1000000
    }
  };

  const res = evaluateStockSelection({
    stock: illiquidCandidate,
    brokerSignals: { compositeScore: 85 },
    technicalSignals: { compositeScore: 85, signals: { volatility: { atr14: 8 } } },
    portfolioContext: { capital: 1000000 }, // 10 Lakhs capital
    customConfig
  });

  // Max 5% of 6,000 volume = 300 shares
  const sizing = res.executionPlan.positionSizing;
  assert.strictEqual(sizing.isClampedByVolume, true);
  assert.strictEqual(sizing.sharesKitta, 300);
  assert.strictEqual(sizing.sharesKitta <= sizing.liquidityVolumeCapKitta, true);
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} stock selection assertions passed successfully.`);
console.log(`======================================================================\n`);
