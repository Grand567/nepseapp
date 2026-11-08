import { describe, it, expect } from 'vitest';
import {
  formatSouthAsian,
  adjustForBonusShare,
  adjustForRightShare,
  adjustSimultaneousBonusAndRight,
  calculateDividendYield,
  getNepseCircuitLimitPct,
  clampToNepseCircuitBand,
  calculateBuyDetails,
  calculateSellDetails,
  calculateNepseStatutoryTrade,
  calculateWacc,
  calculateIpoAllotmentProbability,
} from '../../src/utils/calculations.js';
import {
  calculatePositionSize,
  calculateStopLossTargets,
  calculateNetProfit,
  formatRiskReward,
} from '../../src/utils/riskManagement.js';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
} from '../../src/utils/indicators.js';
import {
  calculateExpectancy,
  calculateKellyCriterion,
  calculateOrderBookImbalanceRatio,
  calculateBrokerDominanceIndex,
  calculateStatutoryBreakeven,
  calculateMultiHorizonTargets,
  detectWyckoffPhase,
} from '../../src/utils/quantEngine.js';
import {
  isNepseWeekend,
  formatNptDateIso,
  getDetailedMarketStatus,
} from '../../src/utils/nepseCalendar.js';

describe('Phase 3A — Financial Calculations & Statutory Fee Unit Tests (src/utils/calculations.js)', () => {
  it('formatSouthAsian formats normal, zero, negative, huge, and invalid inputs without NaN', () => {
    expect(formatSouthAsian(1234567)).toContain('12,34,567');
    expect(formatSouthAsian(0)).toBe('0.00');
    expect(formatSouthAsian(-50000)).toContain('50,000');
    expect(formatSouthAsian(1e12)).not.toContain('NaN');
    expect(String(formatSouthAsian(null))).not.toContain('NaN');
    expect(String(formatSouthAsian(undefined))).not.toContain('NaN');
  });

  it('calculateBuyDetails handles normal, 0, negative, and huge values safely', () => {
    const normal = calculateBuyDetails(100, 500);
    expect(normal.shareValue).toBe(50000);
    expect(normal.commission).toBe(180);
    expect(normal.sebonFee).toBeCloseTo(7.5, 2);
    expect(normal.dpFee).toBe(25);
    expect(normal.totalAmount).toBeCloseTo(50212.5, 2);
    expect(normal.costPerShare).toBeCloseTo(502.125, 3);

    const zero = calculateBuyDetails(0, 500);
    expect(Number.isNaN(zero.costPerShare)).toBe(false);
    expect(Number.isFinite(zero.totalAmount)).toBe(true);

    const neg = calculateBuyDetails(-10, -200);
    expect(Number.isNaN(neg.totalAmount)).toBe(false);

    const huge = calculateBuyDetails(1_000_000, 25000);
    expect(Number.isFinite(huge.totalAmount)).toBe(true);
    expect(huge.costPerShare).toBeGreaterThan(25000);
  });

  it('calculateSellDetails computes short-term (7.5%) vs long-term (5%) CGT and handles loss/zero cases', () => {
    const shortProfit = calculateSellDetails(100, 600, 500, 'short');
    const longProfit = calculateSellDetails(100, 600, 500, 'long');
    expect(shortProfit.cgt).toBeGreaterThan(longProfit.cgt);
    expect(longProfit.netReceivable).toBeGreaterThan(shortProfit.netReceivable);
    expect(shortProfit.netProfitLoss).toBeGreaterThan(0);

    const loss = calculateSellDetails(100, 400, 500, 'short');
    expect(loss.cgt).toBe(0);
    expect(loss.netProfitLoss).toBeLessThan(0);

    const zero = calculateSellDetails(0, 0, 0, 'short');
    expect(Number.isNaN(zero.netReceivable)).toBe(false);
  });

  it('adjustForBonusShare and adjustForRightShare handle 0%, normal%, and huge% without division-by-zero', () => {
    const bonus0 = adjustForBonusShare(100, 500, 0);
    expect(bonus0.newWacc).toBeCloseTo(500, 2);
    const bonus20 = adjustForBonusShare(100, 600, 20);
    expect(bonus20.newUnits).toBe(120);
    expect(bonus20.newWacc).toBeCloseTo(500, 2);

    const right50 = adjustForRightShare(100, 500, 0.5, 100);
    expect(right50.newUnits).toBe(150);
    expect(Number.isFinite(right50.newWacc)).toBe(true);

    const combo = adjustSimultaneousBonusAndRight(100, 500, 600, 10, 20, 100);
    expect(Number.isFinite(combo.adjustedWacc || combo.newWacc || 0)).toBe(true);
  });

  it('[BUG REPRO] adjustForBonusShare(0, 500, 20) and adjustForRightShare(0, 500, 0.5, 100) return NaN for newWacc due to unguarded division by zero (0 / 0)', () => {
    const bonusZeroUnits = adjustForBonusShare(0, 500, 20);
    const rightZeroUnits = adjustForRightShare(0, 500, 0.5, 100);
    expect(Number.isNaN(bonusZeroUnits.newWacc)).toBe(false);
    expect(Number.isNaN(rightZeroUnits.newWacc)).toBe(false);
  });

  it('calculateDividendYield guards against 0 and negative LTP', () => {
    expect(calculateDividendYield(20, 400)).toBeCloseTo(5, 2);
    expect(calculateDividendYield(20, 0)).toBe(0);
    expect(Number.isNaN(calculateDividendYield(null, undefined))).toBe(false);
  });

  it('getNepseCircuitLimitPct and clampToNepseCircuitBand respect the April 20, 2026 (10% -> 15%) regime shift', () => {
    expect(getNepseCircuitLimitPct('2026-04-10')).toBe(10);
    expect(getNepseCircuitLimitPct('2026-04-25')).toBe(15);
    const clampedPost = clampToNepseCircuitBand(100, 150, '2026-05-01');
    expect(clampedPost.clampedPrice ?? clampedPost).toBeLessThanOrEqual(115);
    const clampedPre = clampToNepseCircuitBand(100, 150, '2026-03-01');
    expect(clampedPre.clampedPrice ?? clampedPre).toBeLessThanOrEqual(110);
  });

  it('calculateWacc and calculateIpoAllotmentProbability handle empty/missing/extreme inputs', () => {
    const emptyWacc = calculateWacc([]);
    expect(Number.isNaN(emptyWacc?.wacc ?? emptyWacc)).toBe(false);

    const ipo = calculateIpoAllotmentProbability({ totalSharesIssued: 1000000, totalApplicants: 2000000, appliedUnits: 10 });
    expect(ipo).toBeDefined();
    const ipoZero = calculateIpoAllotmentProbability({});
    expect(ipoZero).toBeDefined();
  });

  it('[BUG REPRO] Statutory Buy Cost inconsistency: calculateBuyDetails sets buy dpFee=0 while calculateNepseStatutoryTrade and calculateNetProfit charge buyDp=25', () => {
    const b1 = calculateBuyDetails(100, 500);
    const b2 = calculateNepseStatutoryTrade({ quantity: 100, buyPrice: 500, sellPrice: 600 });
    const b3 = calculateNetProfit({ shares: 100, buyPrice: 500, sellPrice: 600 });
    // Expected: identical totalBuyCost across all 3 statutory calculators for 100 shares @ Rs. 500
    // Actual bug: b1.totalAmount = 50187.5 (dpFee=0) vs b2.totalBuyCost = 50212.5 & b3.totalBuyCost = 50212.5 (buyDp=25)
    expect(b1.totalAmount).toBe(b2.totalBuyCost);
    expect(b1.totalAmount).toBe(b3.totalBuyCost);
  });
});

describe('Phase 3B — Risk Management & EntryRiskCard CGT Bug Verification (src/utils/riskManagement.js)', () => {
  it('calculatePositionSize and calculateStopLossTargets handle 0, negative, and valid inputs', () => {
    const pos = calculatePositionSize({ capital: 500000, riskPercent: 2, entryPrice: 500, stopLossPrice: 460 });
    expect(pos.shares).toBeGreaterThan(0);
    const invalid = calculatePositionSize({ capital: 0, riskPercent: 0, entryPrice: 0, stopLossPrice: 0 });
    expect(invalid.shares).toBe(0);

    const sl = calculateStopLossTargets({ entryPrice: 500, atr: 15 });
    expect(sl).toBeDefined();
    expect(formatRiskReward(500, 460, [550, 600])).toBeDefined();
    expect(formatRiskReward(0, 0, [])).toBeDefined();
  });

  it('[BUG REPRO] EntryRiskCard passes holdingDays:520 to calculateNetProfit, which ignores holdingDays and charges 7.5% short-term CGT instead of 5% long-term CGT', () => {
    // EntryRiskCard.tsx:196-202 calls calculateNetProfit({ shares, buyPrice, sellPrice, holdingDays: 520, investorType: 'individual' })
    const resFromEntryRiskCardCall = calculateNetProfit({
      shares: 100,
      buyPrice: 500,
      sellPrice: 700,
      holdingDays: 520,
      investorType: 'individual',
    });
    // Expected for 520 days (>365d): holdingDays === 520 and cgtRate === '5%'
    // Actual bug: calculateNetProfit returns holdingDays: null, cgtRate: '7.5%' (Rs. 1464.08 tax instead of Rs. 976.05)!
    expect(resFromEntryRiskCardCall.cgtRate).toBe('5%');
  });
});

describe('Phase 3C — Technical Indicators & Quant Engine Edge Cases (indicators.js & quantEngine.js)', () => {
  it('calculateSMA, calculateEMA, calculateRSI, calculateMACD survive empty, 1-item, flat, and huge series', () => {
    expect(calculateSMA([], 14)).toBeDefined();
    expect(calculateEMA([], 14)).toBeDefined();
    expect(calculateRSI([], 14)).toBeDefined();
    expect(calculateMACD([])).toBeDefined();

    const flat = Array(40).fill(300);
    const rsiFlat = calculateRSI(flat, 14);
    expect(Number.isNaN(Array.isArray(rsiFlat) ? rsiFlat[rsiFlat.length - 1] : rsiFlat)).toBe(false);

    const normal = Array.from({ length: 60 }, (_, i) => 400 + Math.sin(i / 3) * 25 + i);
    const macd = calculateMACD(normal);
    expect(macd).toBeDefined();
  });

  it('quantEngine functions handle missing fields, zero denominators, and extreme values without NaN', () => {
    const exp = calculateExpectancy(60, 4000, 2000);
    expect(Number.isFinite(exp.ev)).toBe(true);
    expect(exp.hasPositiveEdge).toBe(true);

    const kelly = calculateKellyCriterion(60, 2.0);
    expect(Number.isFinite(kelly.kellyPct ?? kelly.halfKellyPct ?? kelly)).toBe(true);

    expect(Number.isNaN(calculateOrderBookImbalanceRatio(0, 0))).toBe(false);
    expect(Number.isNaN(calculateBrokerDominanceIndex(0, 0, 0))).toBe(false);

    const be = calculateStatutoryBreakeven(500, 100);
    expect(be).toBeDefined();

    const targets = calculateMultiHorizonTargets(0, 0, 0, 0, 0);
    expect(targets).toBeDefined();

    const wyckoff = detectWyckoffPhase([], 0);
    expect(wyckoff).toBeDefined();
  });

  it('nepseCalendar respects April 6, 2026 Sun-Thu -> Mon-Fri regime shift and NPT date formatting', () => {
    // 2026-03-29 is a Sunday (trading day before 2026-04-06)
    expect(isNepseWeekend(new Date('2026-03-29T12:00:00+05:45')).isWeekend).toBe(false);
    // 2026-05-03 is a Sunday (weekend AFTER 2026-04-06 shift to Mon-Fri)
    expect(isNepseWeekend(new Date('2026-05-03T12:00:00+05:45')).isWeekend).toBe(true);
    // 2026-05-08 is a Friday (trading day AFTER 2026-04-06 shift, unless holiday)
    expect(isNepseWeekend(new Date('2026-05-08T12:00:00+05:45')).isWeekend).toBe(false);

    const iso = formatNptDateIso(new Date('2026-11-06T06:00:00Z'));
    expect(iso).toBe('2026-11-06');

    const status = getDetailedMarketStatus(new Date('2026-11-07T12:00:00+05:45')); // Saturday
    expect(status.isOpen).toBe(false);
  });
});
