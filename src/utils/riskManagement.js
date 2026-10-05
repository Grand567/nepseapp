/**
 * riskManagement.js — Batch E: Risk Management Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   E1. calculatePositionSize() — Kelly fraction and fixed-risk position sizing.
 *   E2. calculateStopLossTargets() — ATR-based and support/resistance stop-loss
 *       and target prices, clamped to ±10% NEPSE circuit limits.
 *   E3. calculateNetProfit() — Accurate net P&L including ALL NEPSE costs:
 *       broker commission (5-tier), SEBON fee (0.015%), DP charge (Rs.25),
 *       and CGT (7.5% short / 5% long / 10% institutional).
 *   E4. calculateRiskRewardRatio() — Clean R:R display helper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ DISCLAIMER: Position sizing and stop-loss levels are TOOLS to help manage
 * risk, NOT guarantees of profit or protection from loss. Market gaps, circuit
 * limits, and low liquidity can prevent execution at the planned stop-loss price.
 * Always verify with your broker before placing orders.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { calculateBrokerCommission, calculateSebonFee, DP_CHARGE } from './calculations.js';

// ── Constants ────────────────────────────────────────────────────────────────
export const NEPSE_CIRCUIT_PCT = 15.0;     // ±15% daily circuit limit
export const CGT_SHORT_TERM   = 0.075;    // 7.5% — individual, holding ≤ 365 days
export const CGT_LONG_TERM    = 0.050;    // 5.0% — individual, holding > 365 days
export const CGT_INSTITUTIONAL = 0.100;   // 10.0% — corporate / institutional

// Minimum lot size: 10 shares (standard NEPSE minimum order)
export const MIN_LOT_SIZE = 10;

// ── E1: Position Sizing ───────────────────────────────────────────────────────
/**
 * Calculates the optimal position size for a trade based on:
 * (a) Fixed % risk model — most practical for retail investors.
 * (b) Half-Kelly criterion — uses win rate and payoff ratio if available.
 *
 * @param {Object} params
 * @param {number} params.capital         - Total trading capital in Rs.
 * @param {number} params.riskPct         - Max % of capital to risk per trade (e.g. 2 for 2%)
 * @param {number} params.entryPrice      - Entry price per share
 * @param {number} params.stopLossPrice   - Hard stop-loss price per share
 * @param {number} [params.winRate]       - Historical win rate 0–1 (for Kelly sizing)
 * @param {number} [params.avgWin]        - Average win per trade (for Kelly)
 * @param {number} [params.avgLoss]       - Average loss per trade (for Kelly)
 * @param {boolean} [params.useKelly]     - If true, also computes Kelly fraction
 *
 * @returns {Object} Sizing recommendation with shares, capital allocation, and risk metrics
 */
export function calculatePositionSize({
  capital,
  riskPct = 2,
  entryPrice,
  stopLossPrice,
  winRate = null,
  avgWin = null,
  avgLoss = null,
  useKelly = false,
}) {
  const cap = Number(capital) || 0;
  const entry = Number(entryPrice) || 0;
  const stop = Number(stopLossPrice) || 0;
  const riskFraction = Math.min(Math.max(Number(riskPct) || 2, 0.1), 10) / 100;

  if (cap <= 0 || entry <= 0 || stop <= 0 || stop >= entry) {
    return {
      error: 'Invalid inputs: capital, entry price, and stop-loss must be positive, ' +
             'and stop-loss must be below entry price.',
      shares: 0,
      capitalRequired: 0,
    };
  }

  const riskPerShare = entry - stop;
  const riskPerSharePct = (riskPerShare / entry) * 100;

  // ── Fixed % risk model ────────────────────────────────────────────────────
  const maxRiskRs = cap * riskFraction;
  const rawShares = maxRiskRs / riskPerShare;
  // Round down to nearest 10 (NEPSE minimum lot is 10 shares)
  const fixedShares = Math.max(MIN_LOT_SIZE, Math.floor(rawShares / MIN_LOT_SIZE) * MIN_LOT_SIZE);
  const capitalRequired = fixedShares * entry;
  const actualRiskRs = fixedShares * riskPerShare;
  const actualRiskPct = (actualRiskRs / cap) * 100;

  // Circuit-limit check: stop-loss must be within ±10% of entry
  const circuitFloor = +(entry * (1 - NEPSE_CIRCUIT_PCT / 100)).toFixed(2);
  const stopWarning = stop < circuitFloor
    ? `⚠️ Stop-loss Rs.${stop} is below the circuit floor Rs.${circuitFloor} (-${NEPSE_CIRCUIT_PCT}%). ` +
      'In practice, the stock may gap through the stop — size your position conservatively.'
    : null;

  // Portfolio concentration check
  const allocationPct = (capitalRequired / cap) * 100;
  let concentrationWarning = null;
  if (allocationPct > 20) {
    concentrationWarning = `⚠️ This trade would use ${allocationPct.toFixed(1)}% of your capital. ` +
      'Consider reducing position size — diversification reduces single-stock risk.';
  }

  const result = {
    method: 'fixed_pct_risk',
    riskPct,
    shares: fixedShares,
    entryPrice: entry,
    stopLossPrice: stop,
    riskPerShare: +riskPerShare.toFixed(2),
    riskPerSharePct: +riskPerSharePct.toFixed(2),
    capitalRequired: +capitalRequired.toFixed(2),
    allocationPct: +allocationPct.toFixed(2),
    maxRiskRs: +maxRiskRs.toFixed(2),
    actualRiskRs: +actualRiskRs.toFixed(2),
    actualRiskPct: +actualRiskPct.toFixed(2),
    circuitFloor,
    stopWarning,
    concentrationWarning,
    disclaimer: 'Position sizing is a risk management tool, not a profit guarantee. ' +
      'Stop-loss execution depends on market liquidity and circuit limits.',
  };

  // ── Half-Kelly criterion (optional) ──────────────────────────────────────
  if (useKelly && winRate !== null && winRate > 0 && winRate < 1 && avgWin !== null && avgLoss !== null) {
    const wR = Number(winRate);
    const payoff = Math.abs(Number(avgWin)) / Math.abs(Number(avgLoss));
    // Full Kelly: f = (p × b - q) / b  where b = payoff ratio, p = win rate, q = loss rate
    const q = 1 - wR;
    const kellyFull = payoff > 0 ? (wR * payoff - q) / payoff : 0;
    const kellyHalf = Math.max(0, kellyFull / 2); // Half-Kelly for safety
    const kellyCapital = cap * kellyHalf;
    const kellyShares = Math.max(MIN_LOT_SIZE,
      Math.floor((kellyCapital / entry) / MIN_LOT_SIZE) * MIN_LOT_SIZE);

    result.kelly = {
      winRate: wR,
      payoffRatio: +payoff.toFixed(2),
      kellyFull: +(kellyFull * 100).toFixed(1) + '%',
      kellyHalf: +(kellyHalf * 100).toFixed(1) + '%',
      kellyShares,
      kellyCaptital: +(kellyShares * entry).toFixed(2),
      note: 'Half-Kelly is recommended over Full-Kelly to reduce variance. ' +
        'Kelly assumes IID trades — real markets have autocorrelation and regime changes.',
    };

    // Take the more conservative of fixed-% and half-Kelly
    if (kellyShares < fixedShares) {
      result.recommendedShares = kellyShares;
      result.recommendationReason = 'Half-Kelly is more conservative than fixed-% risk — used Kelly.';
    } else {
      result.recommendedShares = fixedShares;
      result.recommendationReason = 'Fixed-% risk is more conservative than Half-Kelly — used fixed-%.';
    }
  } else {
    result.recommendedShares = fixedShares;
  }

  return result;
}

// ── E2: Stop-Loss and Target Calculation ──────────────────────────────────────
/**
 * Calculates stop-loss and target prices using:
 * (a) ATR-based method: stop = entry - N×ATR, target = entry + M×ATR
 * (b) Support/resistance method: stop = support * 0.99, target = resistance
 *
 * All output prices clamped to ±10% NEPSE circuit limit.
 *
 * @param {Object} params
 * @param {number} params.entryPrice     - Entry price
 * @param {number} [params.atr]          - Average True Range (from calculateATR)
 * @param {number} [params.atrMultStop]  - ATR multiples for stop (default 1.5)
 * @param {number} [params.atrMultTarget1] - ATR multiples for target 1 (default 2.0)
 * @param {number} [params.atrMultTarget2] - ATR multiples for target 2 (default 3.0)
 * @param {number} [params.prevClose]    - Previous close (for circuit base)
 * @param {number} [params.supportLevel] - Known support level for S/R method
 * @param {number} [params.resistanceLevel] - Known resistance / target level
 *
 * @returns {Object} stop, target1, target2, rr1, rr2, method
 */
export function calculateStopLossTargets({
  entryPrice,
  atr = null,
  atrMultStop = 1.5,
  atrMultTarget1 = 2.0,
  atrMultTarget2 = 3.0,
  prevClose = null,
  supportLevel = null,
  resistanceLevel = null,
}) {
  const entry = Number(entryPrice) || 0;
  if (entry <= 0) return { error: 'Invalid entry price.' };

  // Circuit bounds (based on prevClose or entry if prevClose unavailable)
  const base = Number(prevClose) || entry;
  const circuitCeiling = +(base * (1 + NEPSE_CIRCUIT_PCT / 100)).toFixed(2);
  const circuitFloor   = +(base * (1 - NEPSE_CIRCUIT_PCT / 100)).toFixed(2);

  const clamp = (price, floor, ceil) => Math.min(Math.max(+(price.toFixed(2)), floor), ceil);

  let stop, target1, target2, method;

  // ── ATR-based (preferred when available) ──────────────────────────────────
  if (atr && atr > 0) {
    stop    = clamp(entry - atrMultStop    * atr, circuitFloor, entry - 0.01);
    target1 = clamp(entry + atrMultTarget1 * atr, entry + 0.01, circuitCeiling);
    target2 = clamp(entry + atrMultTarget2 * atr, entry + 0.01, circuitCeiling);
    method  = `ATR-based (ATR=${atr}, stop=${atrMultStop}×ATR, T1=${atrMultTarget1}×ATR, T2=${atrMultTarget2}×ATR)`;
  }
  // ── Support/Resistance (when levels provided) ─────────────────────────────
  else if (supportLevel && supportLevel < entry) {
    stop    = clamp(supportLevel * 0.99, circuitFloor, entry - 0.01);
    target1 = resistanceLevel
      ? clamp(resistanceLevel, entry + 0.01, circuitCeiling)
      : clamp(entry * 1.05, entry + 0.01, circuitCeiling);
    target2 = clamp(target1 * 1.03, entry + 0.01, circuitCeiling);
    method  = `Support-based (support=Rs.${supportLevel})`;
  }
  // ── Fallback: percentage-based ────────────────────────────────────────────
  else {
    stop    = clamp(entry * 0.93, circuitFloor, entry - 0.01); // 7% stop
    target1 = clamp(entry * 1.10, entry + 0.01, circuitCeiling);
    target2 = clamp(entry * 1.15, entry + 0.01, circuitCeiling);
    method  = 'Percentage-based fallback (7% stop, 10% T1, 15% T2) — no ATR or support available.';
  }

  const riskPerShare = entry - stop;
  const rr1 = riskPerShare > 0 ? +((target1 - entry) / riskPerShare).toFixed(2) : null;
  const rr2 = riskPerShare > 0 ? +((target2 - entry) / riskPerShare).toFixed(2) : null;

  const circuitWarnings = [];
  if (stop === circuitFloor) {
    circuitWarnings.push(`Stop-loss clamped to circuit floor Rs.${circuitFloor} (-${NEPSE_CIRCUIT_PCT}%).`);
  }
  if (target1 === circuitCeiling || target2 === circuitCeiling) {
    circuitWarnings.push(`Target clamped to circuit ceiling Rs.${circuitCeiling} (+${NEPSE_CIRCUIT_PCT}%).`);
  }

  return {
    entryPrice: +entry.toFixed(2),
    stopLoss: stop,
    target1,
    target2,
    riskPerShare: +riskPerShare.toFixed(2),
    riskReward1: rr1,
    riskReward2: rr2,
    circuitCeiling,
    circuitFloor,
    circuitWarnings,
    method,
    disclaimer: 'Stop-loss is a guide, not a guarantee. Gaps and circuit limits may cause slippage.',
  };
}

// ── E3: Net Profit Calculator ─────────────────────────────────────────────────
/**
 * Calculates the accurate net profit/loss for a buy→sell trade, including ALL
 * NEPSE/SEBON transaction costs:
 *   - Buy side: broker commission + SEBON fee (0.015%) + DP charge (Rs.25)
 *   - Sell side: broker commission + SEBON fee (0.015%) + DP charge (Rs.25)
 *   - Capital Gains Tax: 7.5% (short-term) / 5.0% (long-term) / 10% (institutional)
 *
 * NOTE: CGT is applied only on the profit portion, not the full sale value.
 * NOTE: Buy-side costs are included in the cost basis for CGT computation.
 *
 * @param {Object} params
 * @param {number} params.shares       - Number of shares
 * @param {number} params.buyPrice     - Average buy price per share (WACC)
 * @param {number} params.sellPrice    - Sell price per share
 * @param {string|Date} [params.buyDate]   - Purchase date (for holding period detection)
 * @param {string|Date} [params.sellDate]  - Sell date (default: today)
 * @param {'individual'|'institutional'} [params.investorType] - Tax category
 *
 * @returns {Object} Complete P&L breakdown with every fee itemised
 */
export function calculateNetProfit({
  shares,
  buyPrice,
  sellPrice,
  buyDate = null,
  sellDate = null,
  investorType = 'individual',
}) {
  const qty  = Math.round(Number(shares)   || 0);
  const buy  = Number(buyPrice)  || 0;
  const sell = Number(sellPrice) || 0;

  if (qty <= 0 || buy <= 0 || sell <= 0) {
    return { error: 'Shares, buy price and sell price must all be positive.' };
  }

  // ── Buy side ──────────────────────────────────────────────────────────────
  const buyValue      = qty * buy;
  const buyCommission = calculateBrokerCommission(buyValue);
  const buySebon      = calculateSebonFee(buyValue);
  const buyDp         = DP_CHARGE;
  const totalBuyCost  = buyValue + buyCommission + buySebon + buyDp;
  const costPerShare  = totalBuyCost / qty;

  // ── Sell side ─────────────────────────────────────────────────────────────
  const sellValue      = qty * sell;
  const sellCommission = calculateBrokerCommission(sellValue);
  const sellSebon      = calculateSebonFee(sellValue);
  const sellDp         = DP_CHARGE;

  // ── Holding period & CGT rate ─────────────────────────────────────────────
  let holdingDays = null;
  let isLongTerm  = false;

  if (buyDate && sellDate) {
    try {
      const d1 = new Date(buyDate);
      const d2 = new Date(sellDate);
      holdingDays = Math.round(Math.abs(d2 - d1) / 86400000);
      isLongTerm  = holdingDays > 365;
    } catch (_) {}
  }

  let cgtRate;
  let cgtLabel;
  if (investorType === 'institutional') {
    cgtRate  = CGT_INSTITUTIONAL;
    cgtLabel = 'Institutional (10%)';
  } else if (isLongTerm) {
    cgtRate  = CGT_LONG_TERM;
    cgtLabel = `Long-term >${holdingDays ?? 365} days (5%)`;
  } else {
    cgtRate  = CGT_SHORT_TERM;
    cgtLabel = `Short-term ≤365 days (7.5%)`;
  }

  // ── CGT calculation ───────────────────────────────────────────────────────
  // Taxable profit = Sell proceeds - Total buy cost basis - sell-side fees
  // (Buy-side fees are part of cost basis, per Nepal Income Tax Act interpretation)
  const grossProfit    = sellValue - totalBuyCost - sellCommission - sellSebon - sellDp;
  const taxableProfit  = Math.max(0, grossProfit);
  const cgt            = +(taxableProfit * cgtRate).toFixed(2);

  // ── Net receivable ────────────────────────────────────────────────────────
  const totalSellDeductions = sellCommission + sellSebon + sellDp + cgt;
  const netReceivable       = sellValue - totalSellDeductions;
  const netProfitLoss       = netReceivable - totalBuyCost;
  const roi                 = totalBuyCost > 0 ? +((netProfitLoss / totalBuyCost) * 100).toFixed(2) : 0;
  const breakEvenPrice      = +(totalBuyCost / qty +
    (calculateBrokerCommission(totalBuyCost) + calculateSebonFee(totalBuyCost) + DP_CHARGE) / qty
  ).toFixed(2);

  return {
    // Inputs
    shares: qty,
    buyPrice: +buy.toFixed(2),
    sellPrice: +sell.toFixed(2),
    holdingDays,
    investorType,
    cgtLabel,
    cgtRate: `${(cgtRate * 100).toFixed(1)}%`,

    // Buy side breakdown
    buyValue:       +buyValue.toFixed(2),
    buyCommission:  +buyCommission.toFixed(2),
    buySebon:       +buySebon.toFixed(2),
    buyDp,
    totalBuyCost:   +totalBuyCost.toFixed(2),
    costPerShare:   +costPerShare.toFixed(2),

    // Sell side breakdown
    sellValue:       +sellValue.toFixed(2),
    sellCommission:  +sellCommission.toFixed(2),
    sellSebon:       +sellSebon.toFixed(2),
    sellDp,
    cgt,

    // Summary
    totalCosts:     +(buyCommission + buySebon + buyDp + sellCommission + sellSebon + sellDp + cgt).toFixed(2),
    netReceivable:  +netReceivable.toFixed(2),
    netProfitLoss:  +netProfitLoss.toFixed(2),
    roi,
    breakEvenPrice,
    isProfit:       netProfitLoss > 0,

    disclaimer: 'CGT is computed as Final Withholding Tax (SEBON/NRB policy). ' +
      'Consult your broker or tax advisor for your specific situation.',
  };
}

// ── E4: Risk/Reward Display Helper ────────────────────────────────────────────
/**
 * Formats risk/reward ratio as a human-readable string and colour indicator.
 * @param {number} rr - Risk/reward ratio (e.g. 2.5 = risk 1, reward 2.5)
 * @returns {{ label, color, quality }}
 */
export function formatRiskReward(rr) {
  if (!rr || rr <= 0) return { label: 'N/A', color: '#94a3b8', quality: 'unknown' };
  const label = `1 : ${rr.toFixed(2)}`;
  let color, quality;
  if (rr >= 3.0)      { color = '#10b981'; quality = 'excellent'; }
  else if (rr >= 2.0) { color = '#22c55e'; quality = 'good'; }
  else if (rr >= 1.5) { color = '#f59e0b'; quality = 'acceptable'; }
  else if (rr >= 1.0) { color = '#f97316'; quality = 'poor'; }
  else                { color = '#ef4444'; quality = 'unfavourable'; }
  return { label, color, quality,
    note: rr < 1.5 ? 'Minimum recommended R:R is 1:1.5 for positive expectancy.' : null };
}
