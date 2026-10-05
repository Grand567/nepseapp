/**
 * E-batch tests: Risk Management — Position Sizing, Stop-Loss, Net Profit, R:R
 */
import {
  calculatePositionSize,
  calculateStopLossTargets,
  calculateNetProfit,
  formatRiskReward,
  NEPSE_CIRCUIT_PCT,
  CGT_SHORT_TERM,
  CGT_LONG_TERM,
} from '../src/utils/riskManagement.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++; }
  else { console.error('  FAIL:', msg); fail++; }
}

// ── E1: Position Sizing ──────────────────────────────────────────────────────
console.log('\n[E1] Position Sizing');

// Standard case: Rs.1L capital, 2% risk, entry=500, stop=480 → risk/share=20
const pos = calculatePositionSize({ capital: 100000, riskPct: 2, entryPrice: 500, stopLossPrice: 480 });
assert(!pos.error, 'No error on valid inputs');
assert(pos.shares > 0, `Shares > 0: ${pos.shares}`);
assert(pos.shares % 10 === 0, `Shares is multiple of 10 (NEPSE lot): ${pos.shares}`);
// maxRisk = 2000, riskPerShare = 20 → raw shares = 100
assert(pos.shares === 100, `Correct shares = 100: got ${pos.shares}`);
assert(pos.capitalRequired === 50000, `Capital required = Rs.50,000: got ${pos.capitalRequired}`);
assert(pos.actualRiskPct <= 2.1, `Actual risk ≤ 2%: ${pos.actualRiskPct}%`);
assert(pos.riskPerShare === 20, `Risk per share = Rs.20: ${pos.riskPerShare}`);
assert(pos.circuitFloor === +(500 * (1 - NEPSE_CIRCUIT_PCT / 100)).toFixed(2), `Circuit floor at -${NEPSE_CIRCUIT_PCT}%: ${pos.circuitFloor}`);
assert(pos.recommendedShares === 100, 'Recommended shares = 100');
assert(typeof pos.disclaimer === 'string', 'Has disclaimer');

// Concentration warning for large position
const bigPos = calculatePositionSize({ capital: 100000, riskPct: 10, entryPrice: 500, stopLossPrice: 450 });
assert(bigPos.concentrationWarning !== null, 'Concentration warning for >20% allocation');

// Stop below circuit floor triggers warning
const gappedStop = calculatePositionSize({ capital: 100000, riskPct: 2, entryPrice: 500, stopLossPrice: 300 });
assert(gappedStop.stopWarning !== null, 'Stop-loss below circuit floor triggers warning');

// Invalid inputs
const invalid = calculatePositionSize({ capital: 0, entryPrice: 500, stopLossPrice: 480 });
assert(invalid.error, 'Zero capital returns error');
const invalid2 = calculatePositionSize({ capital: 100000, entryPrice: 500, stopLossPrice: 600 });
assert(invalid2.error, 'Stop above entry returns error');

// Half-Kelly
const kellyPos = calculatePositionSize({
  capital: 100000, riskPct: 2, entryPrice: 500, stopLossPrice: 480,
  winRate: 0.55, avgWin: 1000, avgLoss: 600, useKelly: true
});
assert(kellyPos.kelly !== null, 'Kelly results computed');
assert(typeof kellyPos.kelly.kellyHalf === 'string', 'Half-Kelly % expressed as string');
assert(kellyPos.recommendedShares > 0, 'Recommended shares computed with Kelly');

// ── E2: Stop-Loss and Targets ────────────────────────────────────────────────
console.log('\n[E2] Stop-Loss and Target Calculation');

// ATR-based: entry=400, ATR=12, stop mult=1.5, T1 mult=2.0, T2 mult=3.0
const sl = calculateStopLossTargets({ entryPrice: 400, atr: 12, prevClose: 395 });
assert(!sl.error, 'No error on valid ATR inputs');
assert(sl.stopLoss < 400, `Stop-loss below entry: ${sl.stopLoss}`);
assert(sl.target1 > 400, `T1 above entry: ${sl.target1}`);
assert(sl.target2 > sl.target1, `T2 above T1: ${sl.target2}`);
// Expected: stop = 400 - 1.5*12 = 382, T1 = 400 + 2*12 = 424, T2 = 400 + 3*12 = 436
assert(Math.abs(sl.stopLoss - 382) < 0.1, `ATR stop = 382: got ${sl.stopLoss}`);
assert(Math.abs(sl.target1 - 424) < 0.1, `ATR T1 = 424: got ${sl.target1}`);
assert(Math.abs(sl.riskReward1 - 2/1.5) < 0.05, `R:R1 = 2.0/1.5 = 1.33: got ${sl.riskReward1}`);
assert(sl.circuitFloor === +(395 * (1 - NEPSE_CIRCUIT_PCT / 100)).toFixed(2), 'Circuit floor based on prevClose');

// Target clamped to circuit ceiling
const tightATR = calculateStopLossTargets({ entryPrice: 460, atr: 70, prevClose: 450 });
const ceil = +(450 * (1 + NEPSE_CIRCUIT_PCT / 100)).toFixed(2);
assert(tightATR.target2 <= ceil, `Target clamped to circuit ceiling ${ceil}: ${tightATR.target2}`);
assert(tightATR.circuitWarnings.length > 0, 'Circuit warning when clamped');

// Support-based
const slSR = calculateStopLossTargets({ entryPrice: 500, supportLevel: 480, resistanceLevel: 550 });
assert(slSR.stopLoss < 480, 'Support-based stop below support level');
assert(Math.abs(slSR.target1 - 550) < 0.1, `S/R target1 = resistance 550: ${slSR.target1}`);

// Fallback (no ATR, no support)
const slFallback = calculateStopLossTargets({ entryPrice: 500 });
assert(slFallback.stopLoss < 500, 'Fallback stop below entry');
assert(slFallback.target1 > 500, 'Fallback target above entry');
assert(slFallback.method.includes('fallback'), `Fallback method label: ${slFallback.method}`);

// Invalid
assert(calculateStopLossTargets({ entryPrice: 0 }).error, 'Zero entry returns error');

// ── E3: Net Profit Calculator ────────────────────────────────────────────────
console.log('\n[E3] Net Profit Calculator');

// Buy 100 shares at 400, sell at 450 — short term
const np = calculateNetProfit({ shares: 100, buyPrice: 400, sellPrice: 450, investorType: 'individual' });
assert(!np.error, 'No error on valid trade');
assert(np.buyValue === 40000, `Buy value = Rs.40,000: ${np.buyValue}`);
assert(np.sellValue === 45000, `Sell value = Rs.45,000: ${np.sellValue}`);
assert(np.buyCommission === Math.max(10, 40000 * 0.0036), `Buy commission correct: ${np.buyCommission}`);
assert(np.sellCommission === Math.max(10, 45000 * 0.0036), `Sell commission correct: ${np.sellCommission}`);
assert(np.buySebon === +((40000 * 0.00015).toFixed(2)), `Buy SEBON = 6: ${np.buySebon}`);
assert(np.sellSebon === +((45000 * 0.00015).toFixed(2)), `Sell SEBON = 6.75: ${np.sellSebon}`);
assert(np.buyDp === 25, 'Buy DP = Rs.25');
assert(np.sellDp === 25, 'Sell DP = Rs.25');
assert(np.cgt > 0, `CGT applied: ${np.cgt}`);
assert(np.isProfit === true, 'Trade is profitable');
assert(np.roi > 0, `Positive ROI: ${np.roi}%`);
assert(np.breakEvenPrice > 400, `Break-even > buy price: ${np.breakEvenPrice}`);
assert(np.cgtLabel.includes('7.5'), 'Short-term CGT label: 7.5%');
assert(typeof np.disclaimer === 'string', 'Has disclaimer');

// Long-term (holding > 365 days)
const npLong = calculateNetProfit({
  shares: 100, buyPrice: 400, sellPrice: 450,
  buyDate: '2025-01-01', sellDate: '2026-06-01',
  investorType: 'individual'
});
assert(npLong.holdingDays > 365, `Long-term holding: ${npLong.holdingDays} days`);
assert(npLong.cgtLabel.includes('5%'), `Long-term CGT 5%: ${npLong.cgtLabel}`);
assert(npLong.cgt < np.cgt, 'Long-term CGT < short-term CGT');

// Institutional
const npInst = calculateNetProfit({ shares: 100, buyPrice: 400, sellPrice: 450, investorType: 'institutional' });
assert(npInst.cgtLabel.includes('10'), 'Institutional CGT 10%');
assert(npInst.cgt > np.cgt, 'Institutional CGT > short-term individual CGT');

// Loss trade — CGT = 0 (no tax on losses)
const npLoss = calculateNetProfit({ shares: 100, buyPrice: 500, sellPrice: 400 });
assert(npLoss.cgt === 0, 'No CGT on losing trade');
assert(npLoss.isProfit === false, 'Loss trade marked isProfit=false');
assert(npLoss.roi < 0, `Negative ROI: ${npLoss.roi}%`);

// Invalid inputs
assert(calculateNetProfit({ shares: 0, buyPrice: 400, sellPrice: 450 }).error, 'Zero shares returns error');

// ── E4: Risk/Reward Formatter ────────────────────────────────────────────────
console.log('\n[E4] Risk/Reward Formatter');
const rr3 = formatRiskReward(3.0);
assert(rr3.quality === 'excellent', `3.0 R:R = excellent: ${rr3.quality}`);
assert(rr3.label === '1 : 3.00', `Label format: ${rr3.label}`);
assert(rr3.color === '#10b981', `Green color for excellent: ${rr3.color}`);

const rr2 = formatRiskReward(2.0);
assert(rr2.quality === 'good', `2.0 R:R = good: ${rr2.quality}`);

const rr1 = formatRiskReward(1.0);
assert(rr1.quality === 'poor', `1.0 R:R = poor: ${rr1.quality}`);
assert(rr1.note !== null, '1.0 R:R has warning note');

const rrNull = formatRiskReward(null);
assert(rrNull.quality === 'unknown', 'Null R:R = unknown');
assert(rrNull.label === 'N/A', 'Null R:R label = N/A');

// ── Constants validation ───────────────────────────────────────────────────
console.log('\n[Constants] Regulatory Values');
assert(NEPSE_CIRCUIT_PCT === 15.0, `Circuit = 15%: ${NEPSE_CIRCUIT_PCT}`);
assert(CGT_SHORT_TERM === 0.075, `Short-term CGT = 7.5%: ${CGT_SHORT_TERM}`);
assert(CGT_LONG_TERM === 0.050, `Long-term CGT = 5.0%: ${CGT_LONG_TERM}`);

console.log(`\nE-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
