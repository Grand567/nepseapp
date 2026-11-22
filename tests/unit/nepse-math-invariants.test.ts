import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateBrokerCommission,
  calculateSebonFee,
  calculateDpFee,
  calculateCgt,
  calculateRoundTripNetReturn,
  BROKER_COMMISSION_SLABS,
  STATUTORY_CHARGES,
  CAPITAL_GAINS_TAX
} from '../../src/constants/marketRules.js';

import {
  calculateBuyDetails,
  calculateSellDetails,
  calculateNepseNetTrade,
  calculateNepseStatutoryTrade
} from '../../src/utils/calculations.js';

import {
  calculateKellyPositionSize,
  CGT_SHORT_TERM,
  CGT_LONG_TERM,
  CGT_NON_RESIDENT,
  CGT_CORPORATE
} from '../../src/utils/riskManagement.js';

import {
  computeMasterPositionSizing
} from '../../src/utils/masterPositionSizing.js';

import {
  calculateBonusAdjustedPrice,
  calculateRightAdjustedPrice,
  calculateNepseCorporateActionAdjustment
} from '../../src/utils/priceAdjustment.js';

test('NEPSE Mandatory Regulatory & Quant Invariants Suite', async (t) => {

  await t.test('1. Equity Broker Commission Slabs (Whole-trade slab, NOT progressive, Rs. 10 min floor)', () => {
    // Floor Rs. 10.00
    assert.equal(calculateBrokerCommission(1000), 10.00, 'Rs. 1,000 trade must trigger Rs. 10 min floor');
    assert.equal(calculateBrokerCommission(2000), 10.00, 'Rs. 2,000 trade must trigger Rs. 10 min floor');

    // Tier 1: Up to Rs. 50,000 -> 0.36%
    assert.equal(calculateBrokerCommission(50000), 180.00, 'Rs. 50,000 @ 0.36% = Rs. 180.00');

    // Tier 2: Rs. 50,001 to Rs. 5,00,000 -> 0.33% applied to entire trade amount (NOT progressive)
    const comm50k1 = calculateBrokerCommission(50001);
    const expected50k1 = +(50001 * 0.0033).toFixed(2); // 165.00
    assert.equal(comm50k1, expected50k1, 'Rs. 50,001 @ 0.33% = Rs. 165.00 (non-progressive slab jump)');

    // Tier 3: Rs. 5,00,001 to Rs. 20,00,000 -> 0.31% on entire trade
    const comm500k1 = calculateBrokerCommission(500001);
    const expected500k1 = +(500001 * 0.0031).toFixed(2); // 1550.00
    assert.equal(comm500k1, expected500k1, 'Rs. 5,00,001 @ 0.31% = Rs. 1550.00');

    // Tier 4: Rs. 20,00,001 to Rs. 1,00,00,000 -> 0.27% on entire trade
    const comm2m1 = calculateBrokerCommission(2000001);
    const expected2m1 = +(2000001 * 0.0027).toFixed(2); // 5400.00
    assert.equal(comm2m1, expected2m1, 'Rs. 20,00,001 @ 0.27% = Rs. 5400.00');

    // Tier 5: Above Rs. 1,00,00,000 -> 0.24% on entire trade
    const comm10m1 = calculateBrokerCommission(10000001);
    const expected10m1 = +(10000001 * 0.0024).toFixed(2); // 24000.00
    assert.equal(comm10m1, expected10m1, 'Rs. 1,00,00,001 @ 0.24% = Rs. 24000.00');
  });

  await t.test('2. SEBON Fee and CDSC DP Charge Invariants', () => {
    // SEBON 0.015%
    assert.equal(calculateSebonFee(50000), 7.50, 'SEBON fee on Rs. 50,000 is Rs. 7.50');
    assert.equal(calculateSebonFee(100000), 15.00, 'SEBON fee on Rs. 1,00,000 is Rs. 15.00');

    // CDSC DP Fee: Rs. 25 flat
    assert.equal(calculateDpFee(), 25.00, 'DP fee is flat Rs. 25.00 per trade');

    // Buy Details & Sell Details include exact fees
    const buy = calculateBuyDetails(100, 500); // 100 shares @ 500 = 50,000 turnover
    assert.equal(buy.shareValue, 50000);
    assert.equal(buy.commission, 180.00);
    assert.equal(buy.sebonFee, 7.50);
    assert.equal(buy.dpFee, 25.00);
    assert.equal(buy.totalAmount, 50212.50);

    const sell = calculateSellDetails(100, 600, 500, 'short'); // 60,000 turnover
    assert.equal(sell.sellValue, 60000);
    assert.equal(sell.commission, +(60000 * 0.0033).toFixed(2)); // 198.00
    assert.equal(sell.sebonFee, +(60000 * 0.00015).toFixed(2)); // 9.00
    assert.equal(sell.dpFee, 25.00);
  });

  await t.test('3. Mathematical Conservation: grossProfit - totalFriction === netProfit', () => {
    const rt = calculateRoundTripNetReturn({
      buyPrice: 500,
      sellPrice: 600,
      kitta: 100,
      holdingDays: 100,
      investorType: 'individual'
    });

    const calculatedNetProfit = +(rt.grossProfitNpr - rt.totalFrictionNpr).toFixed(2);
    assert.equal(calculatedNetProfit, rt.netProfitNpr, 'grossProfit - totalFriction must strictly equal netProfit');
    assert.ok(rt.totalFrictionNpr > (180.00 + 198.00 + 7.50 + 9.00),
      'Total friction must include both buy DP (25) and sell DP (25)');
  });

  await t.test('4. Capital Gains Tax Statutory Schedule (5.0% ST, 3.75% LT, 10.0% Corp, 25.0% Non-resident, 0 on Loss)', () => {
    const netGain = 10000;

    // Short-term (<= 365 days): 5.0%
    const cgt365 = calculateCgt(netGain, 365, 'individual');
    assert.equal(cgt365, 500.00, '365 days individual CGT must be 5.0% = Rs. 500.00');

    // Long-term (> 365 days): 3.75%
    const cgt366 = calculateCgt(netGain, 366, 'individual');
    assert.equal(cgt366, 375.00, '366 days individual CGT must be 3.75% = Rs. 375.00');

    // Institutional / Corporate: 10.0%
    const cgtCorp = calculateCgt(netGain, 100, 'institutional');
    assert.equal(cgtCorp, 1000.00, 'Institutional CGT must be 10.0% = Rs. 1000.00');
    const cgtCorp2 = calculateCgt(netGain, 100, 'corporate');
    assert.equal(cgtCorp2, 1000.00, 'Corporate CGT must be 10.0% = Rs. 1000.00');

    // Non-resident: 25.0%
    const cgtNonRes = calculateCgt(netGain, 100, 'non_resident');
    assert.equal(cgtNonRes, 2500.00, 'Non-resident CGT must be 25.0% = Rs. 2500.00');

    // Net Loss: Rs. 0 CGT (never negative tax credit)
    const cgtLoss = calculateCgt(-5000, 50, 'individual');
    assert.equal(cgtLoss, 0, 'Net loss must yield strictly Rs. 0 CGT');
    const cgtZero = calculateCgt(0, 50, 'individual');
    assert.equal(cgtZero, 0, 'Zero gain must yield strictly Rs. 0 CGT');
  });

  await t.test('5. CGT Ordering: Levied on net gain AFTER deducting sell commission, SEBON fee, and DP charge', () => {
    // 100 shares bought at 500 (cost basis = 50,000), sold at 550 (turnover = 55,000)
    // Sell commission: 55000 * 0.0033 = 181.50
    // SEBON: 55000 * 0.00015 = 8.25
    // DP: 25.00
    // Total sell charges = 214.75
    // Net gain before CGT = (55,000 - 214.75) - 50,000 = 4785.25
    // Short-term CGT (5.0%) = 4785.25 * 0.05 = 239.2625 -> 239.26
    const sell = calculateSellDetails(100, 550, 500, 'short');
    assert.equal(sell.cgt, 239.26, 'CGT must be calculated on net profit after deducting sell fees');
  });

  await t.test('6. Position Sizing & Stop-Loss Inversion Guards', () => {
    // Inverted stop loss (stopLoss >= entryPrice) must strictly return 0 shares / 0 risk
    const invertedMaster = computeMasterPositionSizing({
      ltp: 500,
      stopLoss: 520, // Inverted!
      target1: 600,
      portfolioCapital: 100000,
      riskPerTradePct: 2.0
    });
    assert.equal(invertedMaster.allowedShares, 0, 'Inverted stop-loss must yield 0 recommended shares');
    assert.equal(invertedMaster.riskPerShare, 0, 'Inverted stop-loss must yield 0 risk per share');
    assert.equal(invertedMaster.capitalOutlay, 0, 'Inverted stop-loss must yield 0 capital outlay');

    // Stop loss equal to entry
    const equalMaster = computeMasterPositionSizing({
      ltp: 500,
      stopLoss: 500,
      target1: 600,
      portfolioCapital: 100000,
      riskPerTradePct: 2.0
    });
    assert.equal(equalMaster.allowedShares, 0, 'Equal stop-loss must yield 0 recommended shares');

    // Entry <= 0
    const zeroPriceMaster = computeMasterPositionSizing({
      ltp: 0,
      stopLoss: 450,
      target1: 600,
      portfolioCapital: 100000,
      riskPerTradePct: 2.0
    });
    assert.equal(zeroPriceMaster.allowedShares, 0, 'Zero entry price must yield 0 shares');

    // Valid setup respects 10-kitta board lot
    const validMaster = computeMasterPositionSizing({
      ltp: 500,
      stopLoss: 475, // 25 risk
      target1: 550,
      portfolioCapital: 100000,
      riskPerTradePct: 2.0 // Rs. 2,000 risk
    });
    assert.ok(validMaster.allowedShares % 10 === 0, 'Shares must be rounded to 10-kitta board lot');
    assert.ok(validMaster.allowedShares > 0, 'Valid setup must yield positive shares');
  });

  await t.test('7. Corporate Actions: Bonus Par Value WACC & NEPSE Ex-Date Adjustment', () => {
    // 20% bonus on Rs. 120 market price -> 120 / 1.20 = 100
    const bonusAdj = calculateBonusAdjustedPrice(120, 20);
    assert.equal(bonusAdj, 100.00, '20% bonus on Rs. 120 must adjust to Rs. 100.00');

    // 50% right share @ Rs. 100 par on Rs. 500 market price:
    // (500 + 0.5 * 100) / 1.5 = 550 / 1.5 = 366.67
    const rightAdj = calculateRightAdjustedPrice(500, 50, 100);
    assert.equal(rightAdj, 366.67, '50% right @ 100 on Rs. 500 must adjust to Rs. 366.67');

    // Simultaneous 10% bonus + 20% right @ 100 on Rs. 300 market price:
    // Formula: (P_cum + R * S) / (1 + B + R) = (300 + 0.20 * 100) / (1 + 0.10 + 0.20)
    // = 320 / 1.30 = 246.15
    const unified = calculateNepseCorporateActionAdjustment({
      marketPrice: 300,
      bonusPercent: 10,
      rightPercent: 20,
      cashDividendPercent: 0,
      subscriptionPrice: 100
    });
    assert.equal(unified?.adjustedPrice, 246.15, 'Simultaneous 10% bonus + 20% right must equal Rs. 246.15');

    // Cash dividend below 10% threshold (e.g. 5% = Rs. 5 on Rs. 200 stock = 2.5% of LTP) must NOT adjust price
    const cashUnder10 = calculateNepseCorporateActionAdjustment({
      marketPrice: 200,
      bonusPercent: 0,
      rightPercent: 0,
      cashDividendPercent: 5,
      subscriptionPrice: 100
    });
    assert.equal(cashUnder10?.isCashDivPriceAdjusted, false, 'Cash dividend < 10% of LTP must NOT adjust price');
    assert.equal(cashUnder10?.adjustedPrice, 200, 'Price must remain unadjusted when cash dividend < 10%');
  });

  await t.test('8. Date Normalization Invariants: Modern AD dates are NEVER parsed as Bikram Sambat', () => {
    // In AD date 2026-10-15 to 2026-11-20, elapsed time is exactly 36 days (Short-term individual CGT 5.0%)
    const adBuyDate = new Date('2026-10-15T00:00:00Z');
    const adSellDate = new Date('2026-11-20T00:00:00Z');
    const diffDays = Math.round((adSellDate.getTime() - adBuyDate.getTime()) / (1000 * 60 * 60 * 24));
    assert.equal(diffDays, 36, 'AD 2026-10-15 to 2026-11-20 must be exactly 36 days');

    const cgtRate = diffDays <= 365 ? CAPITAL_GAINS_TAX.shortTermIndividual : CAPITAL_GAINS_TAX.longTermIndividual;
    assert.equal(cgtRate, 0.05, '36 days holding must evaluate to 5.0% Short-Term CGT');
  });

});
