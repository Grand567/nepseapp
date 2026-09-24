/**
 * NEPSE Analytics, Tracking & Prediction Engine - Comparative Verification Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates:
 *   1. Mandatory ±15% Daily Circuit Band Constraints on all projections & volatility modeling
 *   2. Zero synthetic fallback / explicit 'insufficient_history' state returns
 *   3. Comparative evaluation of contrasting scrips:
 *      - NABIL: Commercial Bank with high liquidity (> Rs. 5 Cr turnover), BFI regulatory safety gates
 *      - BARUN: Hydropower with thin liquidity (< Rs. 30 Lakhs), small float, hydrology seasonality & lock-in
 *   4. Float-adjusted liquidity & slippage scaling
 *   5. Paired scrip Beta calculations against benchmark index
 */

import {
  NEPSE_CIRCUIT_BAND_PCT,
  getCircuitLimits,
  clampToDailyCircuitBand,
  clampReturnIntervalToCircuit,
  calculateDynamicRSI,
  calculateDynamicEMA,
  calculateDynamicMACD,
  calculateDynamicBeta,
  evaluateBfiValuation,
  evaluateHydropowerValuation,
  evaluateFloatAdjustedLiquidity,
  calculateLiquidityAwarePrediction
} from '../src/utils/dynamicCalculationEngine.js';

import {
  normalizeLiveQuote,
  normalizeCandleSeries,
  normalizeQuarterlyFinancials,
  normalizeShareStructure,
  normalizeFloorSheet
} from '../src/utils/nepseAdapterLayer.js';

import {
  calculateSellDetails,
  calculateWacc,
  calculateIpoAllotmentProbability,
  calculateBrokerCommission,
  calculateSebonFee
} from '../src/utils/calculations.js';

import { calculateBrokerCorneringScore } from '../src/utils/quantEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('NEPSE QUANTITATIVE CALCULATION ENGINE - VERIFICATION & AUDIT SUITE');
console.log('======================================================================\n');

// ── TEST SUITE 1: MANDATORY ±15% CIRCUIT BAND CONSTRAINTS ────────────────────
console.log('[SUITE 1] Circuit Band Enforcement (Nepal Securities Trading Fourth Amendment 2082)');

assert(NEPSE_CIRCUIT_BAND_PCT === 15.0, 'NEPSE_CIRCUIT_BAND_PCT is strictly 15.0% (superseding legacy 10%)');

const limits1000 = getCircuitLimits(1000);
assert(limits1000.ceiling === 1150.0, 'Circuit ceiling for 1000 is 1150.0 (+15%)');
assert(limits1000.floor === 850.0, 'Circuit floor for 1000 is 850.0 (-15%)');

const limits320 = getCircuitLimits(320);
assert(limits320.ceiling === 368.0, 'Circuit ceiling for 320 is 368.0 (+15%)');
assert(limits320.floor === 272.0, 'Circuit floor for 320 is 272.0 (-15%)');

// Clamping upside overshooting
const clampedOvershoot = clampToDailyCircuitBand(1250, 1000);
assert(clampedOvershoot === 1150.0, 'Over-shooting projection of 1250 (+25%) is clamped to 1150.0 (+15%)');

// Clamping downside undershooting
const clampedUndershoot = clampToDailyCircuitBand(750, 1000);
assert(clampedUndershoot === 850.0, 'Under-shooting projection of 750 (-25%) is clamped to 850.0 (-15%)');

// Legitimate inside band value untouched
const legitimateValue = clampToDailyCircuitBand(1080, 1000);
assert(legitimateValue === 1080, 'Projection of 1080 (+8%) remains un-clamped');

// Return intervals clamped
const intervalClamped = clampReturnIntervalToCircuit(-24.5, 32.1);
assert(intervalClamped.lower === -15.0 && intervalClamped.upper === 15.0, 'Statistical return intervals [-24.5%, +32.1%] clamped to [-15.0%, +15.0%]');

console.log('\n[SUITE 2] Strict Purge of Mock Data & Incomplete-Data Integrity');

// Empty history returns null or insufficient_history (ZERO synthetic sine wave generator fallback)
const rsiEmpty = calculateDynamicRSI([]);
assert(rsiEmpty === null, 'calculateDynamicRSI([]) returns null instead of synthetic approximation');

const rsiShort = calculateDynamicRSI([100, 102, 101, 105]); // < 14 candles
assert(rsiShort === null, 'calculateDynamicRSI with insufficient candles returns null');

const betaEmpty = calculateDynamicBeta([], []);
assert(betaEmpty === null, 'calculateDynamicBeta([], []) returns null');

const bfiNull = evaluateBfiValuation(null);
assert(bfiNull.status === 'insufficient_history' && bfiNull.regulatoryPass === null, 'evaluateBfiValuation(null) returns status insufficient_history');

const hydroNull = evaluateHydropowerValuation(null);
assert(hydroNull.status === 'insufficient_history', 'evaluateHydropowerValuation(null) returns status insufficient_history');

const floatNull = evaluateFloatAdjustedLiquidity(null);
assert(floatNull.status === 'insufficient_history', 'evaluateFloatAdjustedLiquidity(null) returns status insufficient_history');

const quoteEmpty = normalizeLiveQuote({});
assert(quoteEmpty === null, 'normalizeLiveQuote({}) returns null for incomplete quote data');

console.log('\n[SUITE 3] Comparative Test: NABIL (Commercial Bank, High Liquidity)');

// NABIL Scenario Data
const nabilPrevClose = 620;
const nabilLtp = 625;
const nabilTurnover = 75000000; // Rs. 7.5 Crore (High liquidity)
const nabilVolume = 120000;
const nabilShareStructure = {
  totalShares: 27000000,
  promoterShares: 16200000,
  publicShares: 10800000,
  promoterPct: 60.0,
  publicPct: 40.0
};

// 30 days of authentic paired trading closes
const nabilCloses = [
  590, 595, 592, 598, 600, 605, 602, 608, 610, 612,
  615, 610, 614, 618, 620, 622, 619, 625, 628, 624,
  620, 622, 626, 630, 625, 621, 623, 625, 622, 625
];
const nepseCloses = [
  2600, 2610, 2605, 2620, 2625, 2640, 2635, 2650, 2655, 2660,
  2670, 2658, 2665, 2680, 2685, 2690, 2680, 2700, 2710, 2695,
  2685, 2690, 2705, 2720, 2700, 2690, 2695, 2702, 2690, 2685
];

// Build candle series
const nabilCandles = nabilCloses.map((c, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: c - 2,
  high: c + 5,
  low: c - 4,
  close: c,
  volume: 120000
}));

const nepseCandles = nepseCloses.map((c, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: c - 5,
  high: c + 10,
  low: c - 10,
  close: c,
  volume: 5000000
}));

// A. NABIL Liquidity Evaluation
const nabilLiquidity = evaluateFloatAdjustedLiquidity(nabilShareStructure, nabilVolume, nabilTurnover);
assert(nabilLiquidity.liquidityClass === 'HIGH_INSTITUTIONAL_LIQUIDITY', `NABIL classified as 'HIGH_INSTITUTIONAL_LIQUIDITY' (Turnover: Rs. ${(nabilTurnover / 1e7).toFixed(2)} Cr)`);
assert(nabilLiquidity.isIlliquid === false, 'NABIL is not illiquid');
assert(nabilLiquidity.isLowFloatCorneredRisk === false, 'NABIL has zero low-float cornering risk');

// B. NABIL Dynamic Beta
const nabilBeta = calculateDynamicBeta(nabilCandles, nepseCandles);
assert(nabilBeta !== null && nabilBeta > 0.5 && nabilBeta < 1.6, `NABIL dynamic beta is benchmark-responsive: ${nabilBeta}`);

// C. NABIL BFI Regulatory Safety Gates
const nabilFinancials = {
  npl: 2.15, // Non-performing loan = 2.15% (NRB limit < 5.0%)
  car: 12.80, // Capital Adequacy Ratio = 12.80% (NRB limit >= 11.0%)
  nim: 3.85,
  distributableProfit: 1450000000,
  eps: 24.5,
  bookValue: 215.0
};
const nabilBfiSafety = evaluateBfiValuation(nabilFinancials, nabilLtp);
assert(nabilBfiSafety.regulatoryPass === true, 'NABIL passes all NRB regulatory safety gates (NPL < 5%, CAR >= 11%)');
assert(nabilBfiSafety.npl === 2.15, 'NABIL NPL parsed as 2.15%');
assert(nabilBfiSafety.car === 12.8, 'NABIL CAR parsed as 12.8%');
assert(nabilBfiSafety.dividendCapacity === 'Positive Dividend Payout Capacity', 'NABIL dividend capacity confirmed positive');

// D. NABIL Dynamic Prediction & Circuit Clamping
const nabilPred = calculateLiquidityAwarePrediction({
  ltp: nabilLtp,
  prevClose: nabilPrevClose,
  atr: 12.5,
  avgTurnover20D: nabilTurnover,
  direction: 'up'
});
const nabilCeiling = +(nabilPrevClose * 1.15).toFixed(1);
const nabilFloor = +(nabilPrevClose * 0.85).toFixed(1);
assert(nabilPred.target1 <= nabilCeiling && nabilPred.target1 >= nabilFloor, `NABIL target1 (${nabilPred.target1}) strictly within ±15% band [${nabilFloor}, ${nabilCeiling}]`);
assert(nabilPred.target2 <= nabilCeiling && nabilPred.target2 >= nabilFloor, `NABIL target2 (${nabilPred.target2}) strictly within ±15% band [${nabilFloor}, ${nabilCeiling}]`);
assert(nabilPred.stopLoss <= nabilCeiling && nabilPred.stopLoss >= nabilFloor, `NABIL stopLoss (${nabilPred.stopLoss}) strictly within ±15% band`);
assert(nabilPred.spreadSlippagePct === 0.15, `NABIL benefits from minimal institutional spread slippage (0.15%)`);

console.log('\n[SUITE 4] Comparative Test: BARUN (Hydropower, Thin Liquidity, Low-Float)');

// BARUN Scenario Data
const barunPrevClose = 320;
const barunLtp = 335;
const barunTurnover = 1850000; // Rs. 18.5 Lakhs (Thin liquidity < 25 Lakhs)
const barunVolume = 5600;
const barunShareStructure = {
  totalShares: 5500000,
  promoterShares: 3850000,
  publicShares: 1650000, // Small float (< 2.5M shares)
  promoterPct: 70.0,
  publicPct: 30.0
};

// 30 days of volatile hydropower trading closes
const barunCloses = [
  280, 285, 290, 288, 295, 305, 315, 310, 325, 335,
  330, 320, 315, 328, 340, 335, 325, 310, 300, 308,
  315, 322, 330, 338, 345, 330, 322, 318, 325, 335
];
const barunCandles = barunCloses.map((c, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: c - 3,
  high: c + 8,
  low: c - 6,
  close: c,
  volume: 5800
}));

// A. BARUN Liquidity Evaluation
const barunLiquidity = evaluateFloatAdjustedLiquidity(barunShareStructure, barunVolume, barunTurnover);
assert(barunLiquidity.freeFloatShares === 1650000, 'BARUN free float shares parsed as 1.65M');
assert(barunLiquidity.turnoverLakhs === 18.5, 'BARUN turnover calculated as 18.50 Lakhs');

// B. BARUN Hydrology & Seasonality Factor (Monsoon vs Dry season)
// Monsoon Peak Test (Month = July / Shrawan)
const monsoonDate = new Date('2026-07-20');
const monsoonHydro = evaluateHydropowerValuation({
  capacityMw: 4.5,
  plantType: 'RoR',
  isOperational: true
}, monsoonDate);
assert(monsoonHydro.seasonalGenerationFactor === 1.0, `Monsoon hydrology factor is 1.0 (100% capacity): ${monsoonHydro.seasonalLabel}`);

// Dry Season Deficit Test (Month = February / Falgun)
const winterDate = new Date('2026-02-15');
const winterHydro = evaluateHydropowerValuation({
  capacityMw: 4.5,
  plantType: 'RoR',
  isOperational: true
}, winterDate);
assert(winterHydro.seasonalGenerationFactor === 0.35, `Winter dry season factor is 0.35 (35% discharge deficit): ${winterHydro.seasonalLabel}`);

// Promoter Lock-in Expiry Alert Test
const today = new Date('2026-08-01');
const lockInDateSoon = new Date('2026-09-10'); // 40 days away
const lockInHydro = evaluateHydropowerValuation({
  capacityMw: 4.5,
  plantType: 'RoR',
  lockInExpiryDate: lockInDateSoon.toISOString().split('T')[0]
}, today);
assert(lockInHydro.isLockInThreat === true, `Promoter lock-in expiring in ${lockInHydro.daysToUnlock} days flagged as threat: ${lockInHydro.lockInWarning}`);

// C. BARUN Dynamic Prediction & Strict 15% Circuit Clamping Test
const barunPred = calculateLiquidityAwarePrediction({
  ltp: barunLtp,
  prevClose: barunPrevClose,
  atr: 28.0, // High ATR relative to price
  avgTurnover20D: barunTurnover,
  direction: 'up'
});
const barunCeiling = +(barunPrevClose * 1.15).toFixed(1); // 368.0
const barunFloor = +(barunPrevClose * 0.85).toFixed(1);   // 272.0

assert(barunPred.circuitLimits.ceiling === barunCeiling, `BARUN circuit ceiling strictly 368.0 (+15%)`);
assert(barunPred.circuitLimits.floor === barunFloor, `BARUN circuit floor strictly 272.0 (-15%)`);
assert(barunPred.target1 <= barunCeiling && barunPred.target1 >= barunFloor, `BARUN target1 (${barunPred.target1}) strictly clamped within ±15% band [${barunFloor}, ${barunCeiling}]`);
assert(barunPred.target2 <= barunCeiling && barunPred.target2 >= barunFloor, `BARUN target2 (${barunPred.target2}) strictly clamped to ceiling: ${barunPred.target2}`);
assert(barunPred.stopLoss <= barunCeiling && barunPred.stopLoss >= barunFloor, `BARUN stopLoss (${barunPred.stopLoss}) strictly clamped within ±15% band`);
assert(barunPred.spreadSlippagePct === 1.8, `BARUN penalised with 1.8% illiquidity spread slippage`);
assert(barunPred.expectedReturnBounds.upper <= 15.0 && barunPred.expectedReturnBounds.lower >= -15.0, `BARUN return bounds [${barunPred.expectedReturnBounds.lower}%, ${barunPred.expectedReturnBounds.upper}%] strictly capped at ±15%`);

// D. Extreme Volatility Overshoot Clamp Test
// Even if unconstrained raw signal attempts +30% or -30%, clampToDailyCircuitBand must enforce 15%
const extremeUpside = clampToDailyCircuitBand(barunPrevClose * 1.30, barunPrevClose);
assert(extremeUpside === barunCeiling, `Extreme +30% impulse (${barunPrevClose * 1.3}) strictly clamped to ceiling: ${barunCeiling}`);

const extremeDownside = clampToDailyCircuitBand(barunPrevClose * 0.70, barunPrevClose);
assert(extremeDownside === barunFloor, `Extreme -30% panic (${barunPrevClose * 0.7}) strictly clamped to floor: ${barunFloor}`);

// ─────────────────────────────────────────────────────────────────────────────
// [SUITE 5] Fiduciary SEBON Calculations & IPO Allotment Engine
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 5] Fiduciary SEBON Calculations & IPO Allotment Engine');

// A. Broker Commission Tiers (Jestha 2081 revised slabs)
// <= 50,000: 0.36% (SEBON revision Jestha 2081)
const comm1 = calculateBrokerCommission(40000);
assert(comm1 === +(40000 * 0.0036).toFixed(2), `Tier 1 commission (<=50k) is strictly 0.36%: Rs. ${comm1}`);

// > 50,000 to 500,000: 0.33%
const comm2 = calculateBrokerCommission(200000);
assert(comm2 === +(200000 * 0.0033).toFixed(2), `Tier 2 commission (50k-500k) is strictly 0.33%: Rs. ${comm2}`);

// > 500,000 to 2,000,000: 0.31%
const comm3 = calculateBrokerCommission(1000000);
assert(comm3 === +(1000000 * 0.0031).toFixed(2), `Tier 3 commission (500k-20L) is strictly 0.31%: Rs. ${comm3}`);

// B. SEBON Regulatory Fee (0.015%) and DP charge (Rs. 25)
const sebonFee = calculateSebonFee(100000);
assert(Math.abs(sebonFee - 15.0) < 1e-6, `SEBON regulatory fee is strictly 0.015%: Rs. ${sebonFee.toFixed(2)}`);

// C. Exact CGT Deductions
// Selling 100 shares @ 500, bought @ 400 (Profit base approx Rs. 10,000 less fees)
const sellShort = calculateSellDetails(100, 500, 400, 'short');
assert(sellShort.cgtRate === 0.075, `Short-term (<365d) CGT rate is strictly 7.5%`);
assert(sellShort.dpFee === 25, `DP fee is strictly Rs. 25`);

const sellLong = calculateSellDetails(100, 500, 400, 'long');
assert(sellLong.cgtRate === 0.05, `Long-term (>365d) CGT rate is strictly 5.0%`);
assert(sellLong.cgt < sellShort.cgt, `Long-term CGT (Rs. ${sellLong.cgt}) is less than short-term (Rs. ${sellShort.cgt})`);

const sellInst = calculateSellDetails(100, 500, 400, 'institutional');
assert(sellInst.cgtRate === 0.10, `Institutional CGT rate is strictly 10.0%`);

// D. Dynamic WACC with Corporate Actions
// 100 shares @ 300 + 100 shares @ 400, including broker/sebon/dp fees
// Then 10% bonus (20 bonus shares) => 220 shares total
const buys = [
  { units: 100, price: 300 },
  { units: 100, price: 400 }
];
const corpActions = [{ type: 'bonus', bonusPercent: 10 }];
const waccResult = calculateWacc(buys, corpActions);
assert(waccResult.totalQuantity === 220, `Bonus adjusted units is 220: ${waccResult.totalQuantity}`);
assert(waccResult.wacc === 319.6, `Bonus adjusted fiduciary WACC is 319.60: ${waccResult.wacc}`);

// E. SEBON 10-Kitta Allotment Probability Engine
// Case 1: Oversubscribed by 5x (500,000 applicants for 1,000,000 shares = 100,000 allottees)
const ipoOversubscribed = calculateIpoAllotmentProbability({
  generalPublicUnits: 1000000,
  totalApplicants: 500000,
  appliedKitta: 10
});
assert(ipoOversubscribed.allotmentType === 'lottery' && ipoOversubscribed.status === 'lottery', `Oversubscribed IPO requires lottery allotment`);
assert(ipoOversubscribed.probabilityPct === 20.0, `5x oversubscription yields exactly 20.0% probability: ${ipoOversubscribed.probabilityPct}%`);
assert(ipoOversubscribed.eligibleAllottees === 100000, `Eligible 10-kitta allottees is 100,000: ${ipoOversubscribed.eligibleAllottees}`);

// Case 2: Undersubscribed / Exact (Oversubscription <= 1.0x)
const ipoGuaranteed = calculateIpoAllotmentProbability({
  generalPublicUnits: 1000000,
  totalApplicants: 80000,
  appliedKitta: 10
});
assert(ipoGuaranteed.allotmentType === 'guaranteed' && ipoGuaranteed.status === 'guaranteed', `Undersubscribed IPO yields guaranteed allotment`);
assert(ipoGuaranteed.probabilityPct === 100.0, `Guaranteed allotment probability is 100.0%`);

// ─────────────────────────────────────────────────────────────────────────────
// [SUITE 6] Broker Concentration (BCR5 / CR5) Microstructure Integrity
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 6] Broker Concentration (BCR5 / CR5) Microstructure Integrity');

// A. Test that 5 top buyers against total market volume yields accurate concentration, NOT 100%
const mockTopBuyers = [
  { broker: '58', volume: 10000, buyAmount: 5000000 },
  { broker: '45', volume: 8000, buyAmount: 4000000 },
  { broker: '34', volume: 6000, buyAmount: 3000000 },
  { broker: '17', volume: 4000, buyAmount: 2000000 },
  { broker: '42', volume: 2000, buyAmount: 1000000 }
]; // Sum of top 5 buyers = 30,000 shares
const mockTotalMarketVolume = 60000; // Total volume traded by all brokers = 60,000 shares

const corneringScore = calculateBrokerCorneringScore({
  topBuyers: mockTopBuyers,
  totalVolume: mockTotalMarketVolume,
  adRatio: 0.15
});

assert(corneringScore.cr5BuyPct === 50.0, `CR5 is strictly 50.0% (30k / 60k), NOT 100.0%: ${corneringScore.cr5BuyPct}%`);
assert(corneringScore.cr5BuyPct < 100.0, 'Top 5 Broker Concentration is mathematically bounded below 100%');

// B. Explicit bcr5BuyPct preservation
const explicitBcrScore = calculateBrokerCorneringScore({
  bcr5BuyPct: 58.4,
  adRatio: 0.12
});
assert(explicitBcrScore.cr5BuyPct === 58.4, `Explicit bcr5BuyPct preserved: ${explicitBcrScore.cr5BuyPct}%`);

// C. Server brokerVault crb5 ratio preservation (0.542 -> 54.2%)
const vaultCrbScore = calculateBrokerCorneringScore({
  crb5: 0.542,
  adRatio: 0.08
});
assert(vaultCrbScore.cr5BuyPct === 54.2, `Vault crb5 ratio converted accurately to percentage: ${vaultCrbScore.cr5BuyPct}%`);

console.log('\n======================================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
