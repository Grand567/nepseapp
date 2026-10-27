/**
 * tests/tBatchFundamentalSignals.test.mjs
 * Verification Test Suite for STEP 2c: FUNDAMENTAL SIGNALS
 *
 * Verifies exact mathematical models and NEPSE edge case guards for:
 * 1. Valuation Ratios: P/E, P/BV vs Sector Medians, Graham Number Discount
 * 2. Profitability: ROE, Earnings Yield, Quality Compounder Classification
 * 3. BFI Regulatory Safety Gate: NRB NPL > 5% Ceiling, CAR < 11% Breach
 * 4. Dividend Capacity: Cash Yield %, Track Record Consistency
 * 5. Capital & Ownership Structure: Promoter/Public Ratio, Cornering Risk (< 1.5M float)
 * 6. Composite Fundamental Confluence Evaluation (0-100 score & safety verdicts)
 */

import assert from 'assert';
import {
  evaluateValuationMultiples,
  evaluateProfitability,
  evaluateBfiAssetQuality,
  evaluateDividendTrackRecord,
  evaluateOwnershipStructure,
  evaluateFundamentalConfluence
} from '../src/utils/signals/fundamentalSignals.js';

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
console.log(' STEP 2c: FUNDAMENTAL SIGNALS VERIFICATION SUITE');
console.log('======================================================================\n');

// 1. Valuation Multiples & Graham Discount
it('evaluateValuationMultiples: accurately calculates P/E, P/BV, and Graham Discount', () => {
  // Commercial bank sector median PE ~ 13, PBV ~ 1.2
  // Test an undervalued bank: LTP 240, EPS 28, BVPS 220
  // Graham Number = SQRT(22.5 * 28 * 220) = SQRT(138600) = 372.29
  // Graham Discount = (372.29 - 240) / 372.29 = 35.53%
  const res = evaluateValuationMultiples({
    symbol: 'NABIL',
    sector: 'Commercial Banks',
    ltp: 240,
    eps: 28,
    bookValue: 220
  });

  assert.strictEqual(res.pe, 8.57); // 240 / 28
  assert.strictEqual(res.pbv, 1.09); // 240 / 220
  assert.strictEqual(res.grahamNumber, 372.29);
  assert.strictEqual(res.grahamDiscountPct, 35.53);
  assert.strictEqual(res.valuationStatus, 'UNDERVALUED');
  assert.strictEqual(res.weaknesses.length, 0);
});

it('evaluateValuationMultiples: flags loss-making companies and valuation premiums', () => {
  // Loss making scrip
  const lossRes = evaluateValuationMultiples({
    symbol: 'LOSSER',
    sector: 'Hydro Power',
    ltp: 250,
    eps: -4.5,
    bookValue: 92
  });
  assert.strictEqual(lossRes.valuationStatus, 'LOSS_MAKING');
  assert.strictEqual(lossRes.grahamNumber, null);
  assert.ok(lossRes.weaknesses.some(w => w.includes('negative or zero EPS')));

  // Overvalued scrip (PE > 50% above sector median or PBV > 2.0x median)
  const overRes = evaluateValuationMultiples({
    symbol: 'SPECULATIVE',
    sector: 'Commercial Banks', // Median PE 13, PBV 1.2
    ltp: 600,
    eps: 12, // PE = 50x (median 13x -> 3.84x median)
    bookValue: 130 // PBV = 4.61x (median 1.2x -> 3.84x median)
  });
  assert.strictEqual(overRes.valuationStatus, 'OVERVALUED');
  assert.ok(overRes.weaknesses.some(w => w.includes('Valuation premium')));
});

// 2. Profitability & Capital Efficiency
it('evaluateProfitability: detects quality compounders and flags capital destruction', () => {
  // High efficiency compounder: ROE >= 1.25x sector median (14 * 1.25 = 17.5%)
  const compounder = evaluateProfitability({
    sector: 'Commercial Banks',
    eps: 35,
    bookValue: 175, // ROE = 35 / 175 = 20%
    ltp: 380
  });
  assert.strictEqual(compounder.roe, 20);
  assert.strictEqual(compounder.roeRating, 'HIGH_EFFICIENCY');
  assert.strictEqual(compounder.isQualityCompounder, true);
  assert.strictEqual(compounder.earningsYieldPct, 9.21); // (35 / 380) * 100

  // Low efficiency (< 6% ROE)
  const lowEfficiency = evaluateProfitability({
    sector: 'Commercial Banks',
    eps: 5,
    bookValue: 150, // ROE = 3.33%
    ltp: 200
  });
  assert.strictEqual(lowEfficiency.roe, 3.33);
  assert.strictEqual(lowEfficiency.roeRating, 'POOR_EFFICIENCY');
  assert.strictEqual(lowEfficiency.isQualityCompounder, false);
  assert.ok(lowEfficiency.weaknesses.some(w => w.includes('below risk-free')));
});

// 3. BFI Regulatory Asset Quality Gate (NRB Directives)
it('evaluateBfiAssetQuality: enforces NRB NPL <= 5% ceiling and CAR >= 11% requirements', () => {
  // Non-BFI: Hydro power
  const hydro = evaluateBfiAssetQuality({ sector: 'Hydro Power', npl: 10 });
  assert.strictEqual(hydro.isBfi, false);
  assert.strictEqual(hydro.verdict, 'NOT_APPLICABLE');
  assert.strictEqual(hydro.isAssetQualitySafe, true);

  // Prudent BFI: NPL 1.4%, CAR 13.5%
  const prudentBfi = evaluateBfiAssetQuality({
    sector: 'Commercial Banks',
    npl: 1.4,
    car: 13.5
  });
  assert.strictEqual(prudentBfi.isAssetQualitySafe, true);
  assert.strictEqual(prudentBfi.verdict, 'PRUDENT_ASSET_QUALITY');

  // Stressed BFI: NPL 5.8% (> 5.0% NRB ceiling)
  const toxicBfi = evaluateBfiAssetQuality({
    sector: 'Commercial Banks',
    npl: 5.8,
    car: 12.0
  });
  assert.strictEqual(toxicBfi.isAssetQualitySafe, false);
  assert.strictEqual(toxicBfi.verdict, 'FAIL_ASSET_QUALITY');
  assert.ok(toxicBfi.weaknesses.some(w => w.includes('exceeds NRB 5% ceiling')));

  // Capital breach: CAR 9.8% (< 11.0% requirement)
  const underCapitalized = evaluateBfiAssetQuality({
    sector: 'Commercial Banks',
    npl: 2.8,
    car: 9.8
  });
  assert.strictEqual(underCapitalized.isAssetQualitySafe, false);
  assert.strictEqual(underCapitalized.verdict, 'FAIL_REGULATORY_CAPITAL');
  assert.ok(underCapitalized.weaknesses.some(w => w.includes('REGULATORY BREACH: CAR')));
});

// 4. Dividend Track Record
it('evaluateDividendTrackRecord: evaluates dividend yield and payout consistency', () => {
  const payer = evaluateDividendTrackRecord({
    ltp: 300,
    dividendHistory: [
      { fiscalYear: '2079/80', bonus: 10, cash: 5, total: 15 },
      { fiscalYear: '2078/79', bonus: 12, cash: 4, total: 16 },
      { fiscalYear: '2077/78', bonus: 15, cash: 5, total: 20 }
    ],
    latestBonus: 10,
    latestCash: 5
  });

  assert.strictEqual(payer.latestBonusPct, 10);
  assert.strictEqual(payer.latestCashPct, 5);
  assert.strictEqual(payer.totalLatestPayoutPct, 15);
  // Cash yield on Rs 100 face value: (5 * 100) / 300 = 1.67%
  assert.strictEqual(payer.cashYieldPct, 1.67);
  assert.strictEqual(payer.dividendRating, 'CONSISTENT_PAYER');

  const noDiv = evaluateDividendTrackRecord({
    ltp: 200,
    dividendHistory: [],
    latestBonus: 0,
    latestCash: 0
  });
  assert.strictEqual(noDiv.dividendRating, 'NO_DIVIDENDS');
  assert.ok(noDiv.weaknesses.some(w => w.includes('No dividend track record')));
});

// 5. Ownership & Low Float Cornering Risk
it('evaluateOwnershipStructure: detects low-float cornering risk (< 1.5M shares or public < 20%)', () => {
  // Cornering target: Small hydro with only 1.2M public shares
  const cornered = evaluateOwnershipStructure({
    listedShares: 3000000,
    promoterPercentage: 70,
    publicPercentage: 30, // 3M * 30% = 900,000 shares (< 1.5M)
    paidUpCapital: 300000000
  });
  assert.strictEqual(cornered.freeFloatShares, 900000);
  assert.strictEqual(cornered.isLowFloat, true);
  assert.strictEqual(cornered.isCorneringRisk, true);
  assert.ok(cornered.weaknesses.some(w => w.includes('operator cornering')));

  // Large-cap liquid bank: 250M shares, 49% public -> 122.5M float
  const safeFloat = evaluateOwnershipStructure({
    listedShares: 250000000,
    promoterPercentage: 51,
    publicPercentage: 49,
    paidUpCapital: 25000000000
  });
  assert.strictEqual(safeFloat.freeFloatShares, 122500000);
  assert.strictEqual(safeFloat.isLowFloat, false);
  assert.strictEqual(safeFloat.isCorneringRisk, false);
  assert.strictEqual(safeFloat.weaknesses.length, 0);
});

// 6. Composite Fundamental Confluence
it('evaluateFundamentalConfluence: produces solid composite score for quality stocks and avoids traps', () => {
  // Scenario A: Top Tier Bluechip Bank
  const bluechip = evaluateFundamentalConfluence({
    symbol: 'TOPBANK',
    sector: 'Commercial Banks',
    ltp: 280,
    eps: 32,
    bookValue: 240,
    roe: 13.33,
    npl: 1.8,
    car: 13.2,
    dividendHistory: [{ fiscalYear: '2079/80', total: 12 }, { fiscalYear: '2078/79', total: 15 }, { fiscalYear: '2077/78', total: 10 }],
    latestBonus: 8,
    latestCash: 5,
    listedShares: 150000000,
    promoterPercentage: 51,
    publicPercentage: 49
  });

  assert.ok(bluechip.compositeScore >= 70, `Expected score >= 70, got ${bluechip.compositeScore}`);
  assert.ok(['SOUND_FUNDAMENTAL', 'STRONG_FUNDAMENTAL'].includes(bluechip.verdict));
  assert.strictEqual(bluechip.signals.bfiSafety.isAssetQualitySafe, true);

  // Scenario B: Fundamental Trap (NPL 6.2% regulatory breach)
  const trap = evaluateFundamentalConfluence({
    symbol: 'BADBANK',
    sector: 'Commercial Banks',
    ltp: 180,
    eps: 8,
    bookValue: 120,
    npl: 6.2, // > 5% NRB ceiling!
    car: 9.9,  // < 11% NRB requirement!
    listedShares: 50000000,
    promoterPercentage: 60,
    publicPercentage: 40
  });

  assert.strictEqual(trap.verdict, 'AVOID_FUNDAMENTAL_TRAP');
  assert.strictEqual(trap.signals.bfiSafety.isAssetQualitySafe, false);
  assert.ok(trap.weaknesses.some(w => w.includes('NRB 5% ceiling')));
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} fundamental test assertions passed successfully.`);
console.log(`======================================================================\n`);
