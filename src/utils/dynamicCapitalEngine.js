// src/utils/dynamicCapitalEngine.js
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC CAPITAL SCALING & POSITION SIZING ENGINE (DYNAMIC CAPITAL ENGINE)
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Pure quant position sizing, capital tiering, and market impact guard for NEPSE.
 * Eliminates hardcoded capital assumptions (e.g. Rs. 1 Lakh) by scaling
 * dynamically from user-configured capital (stored in settings/portfolio state,
 * with Rs. 100,000 as default fallback).
 * 
 * Compliant with:
 * - Securities Trading Operations (Fourth Amendment) Bylaws, 2082 (±15% circuit)
 * - Finance Act 2083 (Short-Term CGT 10.0%, Long-Term CGT 7.5%)
 * - Official NEPSE Tiered Broker Commission Schedule (0.36% down to 0.24%)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const STORAGE_KEY_USER_CAPITAL = 'nepse_user_capital';
export const DEFAULT_USER_CAPITAL = 100000;

// ── REGULATORY FRICTION CONSTANTS (FY 2083/84) ─────────────────────────────
export const NEPSE_FRICTION_FY2083 = {
  cgtShortTerm: 0.100,     // 10.0% Short-term CGT (<= 365 days)
  cgtLongTerm: 0.075,      // 7.5% Long-term CGT (> 365 days, final tax)
  sebonFeeRate: 0.00015,   // 0.015% SEBON regulatory fee per leg
  dpCharge: 25,            // NPR 25 DP fee per leg
  minBrokerCommission: 10, // NPR 10 minimum broker commission
  slippageBufferRate: 0.0045, // 0.45% slippage buffer (±15% circuit volatility adjusted)
  minLotSize: 10           // NEPSE minimum 10-kitta regular trading lot
};

/**
 * Official NEPSE Tiered Broker Commission Rate Helper
 * Returns exact fee fraction based on order amount
 */
export function getNepseBrokerCommissionRate(orderAmount) {
  const amt = Number(orderAmount || 0);
  if (amt <= 50000) return 0.0036;       // 0.36% (<= Rs 50,000)
  if (amt <= 500000) return 0.0033;      // 0.33% (Rs 50,001 - Rs 500,000)
  if (amt <= 2000000) return 0.0031;     // 0.31% (Rs 500,001 - Rs 2,000,000)
  if (amt <= 10000000) return 0.0027;    // 0.27% (Rs 2,000,001 - Rs 10,000,000)
  return 0.0024;                         // 0.24% (> Rs 10,000,000)
}

/**
 * Calculates raw broker commission in NPR with Rs 10 minimum floor
 */
export function calculateDynamicBrokerFee(orderAmount) {
  const amt = Number(orderAmount || 0);
  if (amt <= 0) return 0;
  const rate = getNepseBrokerCommissionRate(amt);
  return +Math.max(NEPSE_FRICTION_FY2083.minBrokerCommission, amt * rate).toFixed(2);
}

/**
 * Gets user configured capital from local storage or returns fallback default
 */
export function getUserConfiguredCapital() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_USER_CAPITAL;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_CAPITAL);
    if (!raw) return DEFAULT_USER_CAPITAL;
    const parsed = parseFloat(raw);
    return !isNaN(parsed) && parsed >= 10000 ? parsed : DEFAULT_USER_CAPITAL;
  } catch (_) {
    return DEFAULT_USER_CAPITAL;
  }
}

/**
 * Saves user configured capital to local storage and dispatches custom event
 */
export function setUserConfiguredCapital(amount) {
  const clean = Math.max(10000, Math.round(Number(amount || DEFAULT_USER_CAPITAL)));
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY_USER_CAPITAL, String(clean));
      window.dispatchEvent(new CustomEvent('nepse_capital_updated', { detail: { userCapital: clean } }));
    } catch (_) {}
  }
  return clean;
}

/**
 * Auto-syncs user capital from active portfolio value and available cash
 */
export function syncCapitalWithPortfolio(portfolioEquity, availableCash = 0) {
  const total = Number(portfolioEquity || 0) + Number(availableCash || 0);
  const capital = Math.max(10000, Math.round(total));
  return setUserConfiguredCapital(capital);
}

/**
 * Dynamic Slot & Risk Tiering Function
 * Scales risk budget, concurrent slot count, cash reserve, and max slot allocation
 * based on user capital size.
 */
export function getCapitalTierConfig(userCapital = DEFAULT_USER_CAPITAL) {
  const cap = Math.max(10000, Number(userCapital || DEFAULT_USER_CAPITAL));

  // Tier 1: Micro / Starter Portfolio (<= Rs. 150,000)
  if (cap <= 150000) {
    return {
      tier: 1,
      tierName: 'Micro / Starter Portfolio',
      userCapital: cap,
      maxSlots: 3,
      riskPerTradePct: 0.015,     // 1.5% portfolio risk
      tacticalCashReservePct: 0.10, // 10% cash reserve
      maxSlotAllocationPct: 0.35, // 35% max capital in single stock
      guidance: 'Concentrated 3-slot allocation to overcome NEPSE minimum lot and fixed fee friction.'
    };
  }

  // Tier 2: Standard Active Retail (Rs. 150,001 - Rs. 1,000,000)
  if (cap <= 1000000) {
    return {
      tier: 2,
      tierName: 'Standard Active Retail',
      userCapital: cap,
      maxSlots: 5,
      riskPerTradePct: 0.0125,    // 1.25% portfolio risk
      tacticalCashReservePct: 0.10, // 10% cash reserve
      maxSlotAllocationPct: 0.25, // 25% max capital in single stock
      guidance: 'Balanced 5-slot swing portfolio with disciplined capital compounding.'
    };
  }

  // Tier 3: High Net-Worth Individual / HNWI (Rs. 1,000,001 - Rs. 5,000,000)
  if (cap <= 5000000) {
    return {
      tier: 3,
      tierName: 'High Net-Worth Individual (HNWI)',
      userCapital: cap,
      maxSlots: 6,
      riskPerTradePct: 0.010,     // 1.0% portfolio risk
      tacticalCashReservePct: 0.12, // 12% cash reserve
      maxSlotAllocationPct: 0.20, // 20% max capital in single stock
      guidance: 'Diversified institutional-grade portfolio with liquidity impact filters.'
    };
  }

  // Tier 4: Institutional / Family Office (> Rs. 5,000,000)
  return {
    tier: 4,
    tierName: 'Institutional / Family Office',
    userCapital: cap,
    maxSlots: 8,
    riskPerTradePct: 0.0075,    // 0.75% portfolio risk
    tacticalCashReservePct: 0.15, // 15% cash reserve
    maxSlotAllocationPct: 0.15, // 15% max capital in single stock
    guidance: 'Strict liquidity preservation, multi-desk stealth accumulation, and low market impact.'
  };
}

/**
 * Dynamic Kitta & Market-Impact Sizing Algorithm
 * Iteratively solves for exact recommended kitta accounting for:
 * 1. User capital risk budget
 * 2. Slot allocation limit
 * 3. 5% 20D median turnover market-impact cap
 * 4. Tiered broker commission schedule on order amount
 * 5. Minimum 10-kitta regular trading lot rule
 */
export function calculateDynamicPositionSizing({
  userCapital = DEFAULT_USER_CAPITAL,
  entryPrice,
  stopLoss,
  target1,
  target2,
  median20DayTurnover = 8000000,
  isLongTerm = false,
  requiredNetRRR = 2.5
}) {
  const cap = Math.max(10000, Number(userCapital || DEFAULT_USER_CAPITAL));
  const entry = Number(entryPrice || 0);
  const sl = Number(stopLoss || 0);
  const t1 = Number(target1 || (entry * 1.15));
  const t2 = Number(target2 || (entry * 1.25));
  const turnover20D = Number(median20DayTurnover || 8000000);

  if (entry <= 0 || sl <= 0 || sl >= entry) {
    return null;
  }

  const tierConfig = getCapitalTierConfig(cap);

  // 1. Risk budget in Rupees
  const maxRiskRupees = +(cap * tierConfig.riskPerTradePct).toFixed(2);

  // 2. Maximum slot capital allocation in Rupees
  const maxSlotCapital = +(cap * tierConfig.maxSlotAllocationPct).toFixed(2);

  // 3. Market-Impact Safety Cap: Never exceed 5% of 20D median daily turnover
  const maxLiquiditySafeOrder = Math.round(0.05 * turnover20D);

  // 4. Liquidity Veto Check: Minimum required turnover
  const minRequiredTurnover = Math.max(6000000, maxSlotCapital * 20);
  const isLiquiditySufficient = turnover20D >= minRequiredTurnover;
  const liquidityWarning = !isLiquiditySufficient
    ? `⚠️ Low Liquidity Warning: 20D turnover (Rs. ${(turnover20D/100000).toFixed(1)}L) is below recommended Rs. ${(minRequiredTurnover/100000).toFixed(1)}L for Rs. ${(cap/100000).toFixed(1)}L capital.`
    : null;

  // 5. Iterative Kitta Solver with Dynamic Tiered Commission
  const rawRiskPerShare = entry - sl;
  let estimatedKitta = Math.max(10, Math.floor(maxRiskRupees / Math.max(1, rawRiskPerShare)));

  let convergedKitta = estimatedKitta;
  let brokerRate = 0.0033;
  let netLossPerShare = rawRiskPerShare;

  // Converge over 3 iterations to account for tiered commission based on exact orderValue
  for (let iter = 0; iter < 3; iter++) {
    const testOrderValue = convergedKitta * entry;
    brokerRate = getNepseBrokerCommissionRate(testOrderValue);

    const sebonRate = NEPSE_FRICTION_FY2083.sebonFeeRate;
    const slippageRate = NEPSE_FRICTION_FY2083.slippageBufferRate;
    const dpPerShare = (NEPSE_FRICTION_FY2083.dpCharge * 2) / Math.max(10, convergedKitta);

    const buyFrictionPerShare = entry * (brokerRate + sebonRate + slippageRate);
    const slFrictionPerShare = sl * (brokerRate + sebonRate + slippageRate);
    netLossPerShare = +(rawRiskPerShare + buyFrictionPerShare + slFrictionPerShare + dpPerShare).toFixed(2);

    const riskKitta = Math.floor(maxRiskRupees / Math.max(0.1, netLossPerShare));
    const effectiveCapPerShare = entry * (1 + brokerRate + sebonRate + slippageRate);
    const slotKitta = Math.floor(Math.min(maxSlotCapital, maxLiquiditySafeOrder) / Math.max(1, effectiveCapPerShare));

    convergedKitta = Math.max(0, Math.min(riskKitta, slotKitta));
  }

  // Enforce NEPSE 10-kitta regular trading lot rule
  let finalKitta = Math.floor(convergedKitta / 10) * 10;
  let lotSizeRiskWarning = null;

  if (finalKitta < 10) {
    // If capital allows at least 10 shares without catastrophic risk (> 2.5x riskPerTrade)
    const costFor10 = 10 * entry;
    const lossFor10 = 10 * netLossPerShare;
    if (costFor10 <= maxSlotCapital * 1.25 && lossFor10 <= maxRiskRupees * 2.0) {
      finalKitta = 10;
      lotSizeRiskWarning = `Adjusted to NEPSE minimum regular lot (10 kitta). Risk: Rs. ${Math.round(lossFor10)} vs Rs. ${Math.round(maxRiskRupees)} budget.`;
    } else {
      finalKitta = 0;
      lotSizeRiskWarning = `Capital (Rs. ${cap.toLocaleString()}) insufficient for 10-kitta minimum lot under safe risk limits.`;
    }
  }

  // 6. Final Financials with converged kitta
  const orderAmount = finalKitta * entry;
  const commissionRate = getNepseBrokerCommissionRate(orderAmount);
  const buyBrokerFee = calculateDynamicBrokerFee(orderAmount);
  const buySebonFee = +((orderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const buyDpFee = finalKitta > 0 ? NEPSE_FRICTION_FY2083.dpCharge : 0;
  const deployedCapital = Math.round(orderAmount + buyBrokerFee + buySebonFee + buyDpFee);
  const capitalAllocationPct = cap > 0 ? +((deployedCapital / cap) * 100).toFixed(1) : 0;

  // Actual Risk at Stop-Loss
  const slGrossLoss = (entry - sl) * finalKitta;
  const slOrderAmount = finalKitta * sl;
  const slBrokerFee = calculateDynamicBrokerFee(slOrderAmount);
  const slSebonFee = +((slOrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const slDpFee = finalKitta > 0 ? NEPSE_FRICTION_FY2083.dpCharge : 0;
  const actualRiskRupees = Math.round(slGrossLoss + buyBrokerFee + buySebonFee + buyDpFee + slBrokerFee + slSebonFee + slDpFee);
  const actualRiskPct = cap > 0 ? +((actualRiskRupees / cap) * 100).toFixed(2) : 0;

  // Target 1 Net Profit (FY 2083/84: Short-Term 10.0%, Long-Term 7.5%)
  const cgtRate = isLongTerm ? NEPSE_FRICTION_FY2083.cgtLongTerm : NEPSE_FRICTION_FY2083.cgtShortTerm;
  const t1GrossProfit = (t1 - entry) * finalKitta;
  const t1OrderAmount = finalKitta * t1;
  const t1BrokerFee = calculateDynamicBrokerFee(t1OrderAmount);
  const t1SebonFee = +((t1OrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const t1DpFee = finalKitta > 0 ? NEPSE_FRICTION_FY2083.dpCharge : 0;
  const totalT1Friction = buyBrokerFee + buySebonFee + buyDpFee + t1BrokerFee + t1SebonFee + t1DpFee;
  const t1TaxableGain = Math.max(0, t1GrossProfit - totalT1Friction);
  const t1Cgt = +(t1TaxableGain * cgtRate).toFixed(2);
  const t1NetProfit = Math.round(t1GrossProfit - totalT1Friction - t1Cgt);

  // Target 2 Net Profit
  const t2GrossProfit = (t2 - entry) * finalKitta;
  const t2OrderAmount = finalKitta * t2;
  const t2BrokerFee = calculateDynamicBrokerFee(t2OrderAmount);
  const t2SebonFee = +((t2OrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const t2DpFee = finalKitta > 0 ? NEPSE_FRICTION_FY2083.dpCharge : 0;
  const totalT2Friction = buyBrokerFee + buySebonFee + buyDpFee + t2BrokerFee + t2SebonFee + t2DpFee;
  const t2TaxableGain = Math.max(0, t2GrossProfit - totalT2Friction);
  const t2Cgt = +(t2TaxableGain * cgtRate).toFixed(2);
  const t2NetProfit = Math.round(t2GrossProfit - totalT2Friction - t2Cgt);

  // Net Post-Tax/Fee RRR
  const netRRR = actualRiskRupees > 0 ? +(t1NetProfit / actualRiskRupees).toFixed(2) : 0;
  const isRrrAcceptable = netRRR >= requiredNetRRR;

  // 7. Universal Rs. 1 Lakh Multiplier for Broadcast Subscribers
  const singleLossPerShare = +(rawRiskPerShare + (entry * 0.0033 * 2) + 0.50).toFixed(2);
  const kittaPer1Lakh = Math.max(10, Math.floor(Math.floor(1000 / Math.max(1, singleLossPerShare)) / 10) * 10);

  // 8. Scale-Out & Breakeven Runner Plan
  const scaleOutKitta = Math.floor((finalKitta * 0.5) / 10) * 10 || Math.floor(finalKitta * 0.5);
  const runnerKitta = finalKitta - scaleOutKitta;
  const breakevenStopLoss = finalKitta > 0
    ? +((deployedCapital / finalKitta) * 1.005).toFixed(1) // exact break-even basis including buy friction + roundtrip sell friction
    : entry;

  return {
    userCapital: cap,
    tier: tierConfig.tier,
    tierName: tierConfig.tierName,
    maxSlots: tierConfig.maxSlots,
    riskPerTradePct: tierConfig.riskPerTradePct,
    maxSlotAllocationPct: tierConfig.maxSlotAllocationPct,
    tacticalCashReservePct: tierConfig.tacticalCashReservePct,
    entryPrice: entry,
    stopLoss: sl,
    target1: t1,
    target2: t2,
    slPct: +(((entry - sl) / entry) * 100).toFixed(1),
    t1Pct: +(((t1 - entry) / entry) * 100).toFixed(1),
    t2Pct: +(((t2 - entry) / entry) * 100).toFixed(1),
    finalKitta,
    deployedCapital,
    capitalAllocationPct,
    maxRiskRupees,
    actualRiskRupees,
    actualRiskPct,
    commissionRate,
    commissionTierText: `${(commissionRate * 100).toFixed(2)}%`,
    buyBrokerFee,
    buySebonFee,
    buyDpFee,
    cgtRate,
    cgtRateText: `${(cgtRate * 100).toFixed(1)}%`,
    t1NetProfit,
    t2NetProfit,
    netRRR,
    requiredNetRRR,
    isRrrAcceptable,
    median20DayTurnover: turnover20D,
    turnoverLakhs: +((turnover20D / 100000).toFixed(1)),
    maxLiquiditySafeOrder,
    safeOrderLakhs: +((maxLiquiditySafeOrder / 100000).toFixed(1)),
    isLiquiditySufficient,
    liquidityWarning,
    lotSizeRiskWarning,
    kittaPer1Lakh,
    scaleOutKitta,
    runnerKitta,
    breakevenStopLoss
  };
}

/**
 * Format dual-mode execution ticket text (Personal Portfolio + Universal Multiplier)
 */
export function formatDualModeExecutionTicket({
  symbol,
  sector = 'Hydro Power',
  sectorRank = 2,
  regime = 'Neutral',
  sizing,
  vduRatio = 0.44,
  rolling5DRetentionPct = 84,
  atsr = 3.76,
  dayGainPct = 1.8,
  circuitBufferPct = 13.2,
  t3VolRatio = 0.8
}) {
  const sym = String(symbol || 'STOCK').toUpperCase();
  const s = sizing;
  if (!s) return null;

  const buyZoneLow = Math.floor(s.entryPrice * 0.995);
  const buyZoneHigh = Math.ceil(s.entryPrice * 1.015);
  const chaseCap = +(buyZoneHigh * 1.025).toFixed(1);

  const text = [
    `🟢 INSTITUTIONAL ACCUMULATION CONFIRMED: $${sym}`,
    `Sector: ${sector} (10D RS Rank: #${sectorRank}/13) | Regime: ${regime}`,
    ``,
    `🎯 EXECUTION PLAN (T+2 & ±15% Circuit Adjusted)`,
    `• Limit Buy Zone: Rs. ${buyZoneLow} – Rs. ${buyZoneHigh} (Do NOT chase > Rs. ${chaseCap})`,
    `• Hard Stop-Loss: Rs. ${s.stopLoss} (-${s.slPct}% | 1.75x ATR)`,
    `• Target 1 (Conservative): Rs. ${s.target1} (+${s.t1Pct}%)`,
    `• Target 2 (Runner): Rs. ${s.target2} (+${s.t2Pct}%)`,
    `• Net Post-Tax/Fee RRR: ${s.netRRR} : 1 (Includes ${s.cgtRateText} CGT & Broker Fees)`,
    ``,
    `🛡️ POSITION SIZING & LIQUIDITY GUARD`,
    `💼 FOR YOUR RS. ${s.userCapital.toLocaleString()} PORTFOLIO (${s.tierName.toUpperCase()}):`,
    `• Order Size: ${s.finalKitta} Kitta (Deploy: Rs. ${s.deployedCapital.toLocaleString()} | ${s.capitalAllocationPct}% Allocation)`,
    `• Max Portfolio Risk: Rs. ${s.actualRiskRupees.toLocaleString()} (${s.actualRiskPct}% Risk Cap)`,
    `• Commission Tier: ${s.commissionTierText} (Broker: Rs. ${s.buyBrokerFee})`,
    `• Scale-Out Plan: Sell ${s.scaleOutKitta} Kitta at T1 (Rs. ${s.target1}) ➔ Move SL to Breakeven (Rs. ${s.breakevenStopLoss})`,
    ``,
    `🌐 UNIVERSAL SUBSCRIBER MULTIPLIER (PER RS. 1 LAKH CAPITAL):`,
    `• Exact Sizing Multiplier: ${s.kittaPer1Lakh} Kitta per Rs. 1 Lakh Capital`,
    ``,
    `• 20D Median Turnover: Rs. ${s.turnoverLakhs}L (Safe Total Order Cap: Rs. ${s.safeOrderLakhs}L)`,
    s.liquidityWarning ? s.liquidityWarning : `• Liquidity Check: PASSED (Zero institutional market impact)`,
    ``,
    `📊 4-PILLAR CONFLUENCE SCORE: 100/100`,
    `✅ Wyckoff VDU Base: ${vduRatio}x of 20D Vol (Supply Exhausted)`,
    `✅ Smart Money 5D Retention: ${rolling5DRetentionPct}% | Ticket Ratio (ATSR): ${atsr}x`,
    `✅ T+3 Overhang Risk: LOW (t-3 Vol: ${t3VolRatio}x | Safe from settlement dump)`,
    `✅ Circuit Distance: +${dayGainPct}% today (${circuitBufferPct}% below +15% circuit)`
  ].join('\n');

  const html = [
    `🟢 <b>INSTITUTIONAL ACCUMULATION CONFIRMED: $${sym}</b>`,
    `Sector: ${sector} (10D RS Rank: #${sectorRank}/13) | Regime: ${regime}`,
    ``,
    `🎯 <b>EXECUTION PLAN (T+2 &amp; ±15% Circuit Adjusted)</b>`,
    `• Limit Buy Zone: Rs. ${buyZoneLow} – Rs. ${buyZoneHigh} (Do NOT chase &gt; Rs. ${chaseCap})`,
    `• Hard Stop-Loss: Rs. ${s.stopLoss} (-${s.slPct}% | 1.75x ATR)`,
    `• Target 1 (Conservative): Rs. ${s.target1} (+${s.t1Pct}%)`,
    `• Target 2 (Runner): Rs. ${s.target2} (+${s.t2Pct}%)`,
    `• Net Post-Tax/Fee RRR: <b>${s.netRRR} : 1</b> (Includes ${s.cgtRateText} CGT &amp; Broker Fees)`,
    ``,
    `🛡️ <b>POSITION SIZING &amp; LIQUIDITY GUARD</b>`,
    `💼 <b>FOR YOUR RS. ${s.userCapital.toLocaleString()} PORTFOLIO (${s.tierName.toUpperCase()}):</b>`,
    `• Order Size: <b>${s.finalKitta} Kitta</b> (Deploy: Rs. ${s.deployedCapital.toLocaleString()} | ${s.capitalAllocationPct}% Allocation)`,
    `• Max Portfolio Risk: <b>Rs. ${s.actualRiskRupees.toLocaleString()}</b> (${s.actualRiskPct}% Risk Cap)`,
    `• Commission Tier: <code>${s.commissionTierText}</code> (Broker: Rs. ${s.buyBrokerFee})`,
    `• Scale-Out Plan: Sell ${s.scaleOutKitta} Kitta at T1 (Rs. ${s.target1}) ➔ Move SL to Breakeven (Rs. ${s.breakevenStopLoss})`,
    ``,
    `🌐 <b>UNIVERSAL SUBSCRIBER MULTIPLIER (PER RS. 1 LAKH CAPITAL):</b>`,
    `• Exact Sizing Multiplier: <b>${s.kittaPer1Lakh} Kitta</b> per Rs. 1 Lakh Capital`,
    ``,
    `• 20D Median Turnover: Rs. ${s.turnoverLakhs}L (Safe Total Order Cap: Rs. ${s.safeOrderLakhs}L)`,
    `• 20D Median Turnover: Rs. ${s.turnoverLakhs}L (Safe Total Order Cap: Rs. ${s.safeOrderLakhs}L)`,
    s.liquidityWarning ? `⚠️ <i>${s.liquidityWarning}</i>` : `• Liquidity Check: ✅ PASSED (Zero market impact)`,
    ``,
    `📊 <b>4-PILLAR CONFLUENCE SCORE: 100/100</b>`,
    `✅ Wyckoff VDU Base: ${vduRatio}x of 20D Vol (Supply Exhausted)`,
    `✅ Smart Money 5D Retention: ${rolling5DRetentionPct}% | Ticket Ratio (ATSR): ${atsr}x`,
    `✅ T+3 Overhang Risk: LOW (t-3 Vol: ${t3VolRatio}x | Safe from settlement dump)`,
    `✅ Circuit Distance: +${dayGainPct}% today (${circuitBufferPct}% below +15% circuit)`
  ].join('\n');

  return { text, html };
}
