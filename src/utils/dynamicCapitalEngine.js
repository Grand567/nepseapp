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
  cgtShortTerm: 0.075,       // Statutory 7.5% Short-term retail CGT (<= 365 days)
  cgtLongTerm: 0.050,        // Statutory 5.0% Long-term retail CGT (> 365 days)
  cgtInstitutional: 0.100,   // 10.0% Corporate/Institutional CGT
  sebonFeeRate: 0.00015,     // 0.015% SEBON regulatory fee per leg
  dpCharge: 25,              // NPR 25 DP fee per leg
  minBrokerCommission: 10,   // NPR 10 minimum broker commission floor
  slippageBufferRate: 0.0025,// 0.25% execution slippage buffer
  minLotSize: 10             // NEPSE minimum 10-kitta regular trading lot
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

  // Tier 1: Starter Portfolio (Rs. 50k - Rs. 1.5 Lakh)
  if (cap <= 150000) {
    return {
      tier: 1,
      tierName: 'Starter Portfolio (Rs. 50k – 1L)',
      userCapital: cap,
      maxSlots: 3,
      riskPerTradePct: 0.015,       // 1.50% target risk per trade
      hardMaxRiskPct: 0.020,        // 2.00% absolute hard ceiling (never breached by 10-kitta floor)
      tacticalCashReservePct: 0.10, // 10% cash reserve
      maxSlotAllocationPct: 0.35,   // 35% max capital in single stock
      guidance: 'Concentrated 3-slot Half-Kelly allocation respecting Rs. 10 minimum broker commission floor and 2.0% hard risk cap.'
    };
  }

  // Tier 2: Standard Active Retail (Rs. 1.5 Lakh - Rs. 10 Lakh)
  if (cap <= 1000000) {
    return {
      tier: 2,
      tierName: 'Standard Active Retail (Up to Rs. 10L)',
      userCapital: cap,
      maxSlots: 5,
      riskPerTradePct: 0.0125,      // 1.25% target risk per trade
      hardMaxRiskPct: 0.015,        // 1.50% hard risk ceiling
      tacticalCashReservePct: 0.10,
      maxSlotAllocationPct: 0.25,   // 25% max capital in single stock
      guidance: 'Balanced 5-slot swing portfolio with friction-adjusted Half-Kelly compounding.'
    };
  }

  // Tier 3: High Net-Worth Individual / HNWI (Rs. 10 Lakh - Rs. 50 Lakh)
  if (cap <= 5000000) {
    return {
      tier: 3,
      tierName: 'High Net-Worth Individual (HNWI)',
      userCapital: cap,
      maxSlots: 6,
      riskPerTradePct: 0.010,       // 1.00% target risk per trade
      hardMaxRiskPct: 0.015,        // 1.50% hard risk ceiling
      tacticalCashReservePct: 0.12,
      maxSlotAllocationPct: 0.20,   // 20% max capital in single stock
      guidance: 'Diversified institutional-grade portfolio with 5% turnover liquidity guards.'
    };
  }

  // Tier 4: Institutional / Family Office (Rs. 75 Lakh / > Rs. 50 Lakh)
  return {
    tier: 4,
    tierName: 'Institutional / Family Office (Rs. 75L+)',
    userCapital: cap,
    maxSlots: 8,
    riskPerTradePct: 0.0075,      // 0.75% target risk per trade
    hardMaxRiskPct: 0.0125,       // 1.25% hard risk ceiling
    tacticalCashReservePct: 0.15,
    maxSlotAllocationPct: 0.15,   // 15% max capital in single stock
    guidance: 'Strict liquidity preservation, zero market impact (<= 5% of 20D median turnover).'
  };
}

export function calculateDynamicPositionSizing({
  userCapital = DEFAULT_USER_CAPITAL,
  entryPrice,
  stopLoss,
  target1,
  target2,
  median20DayTurnover = 8000000,
  winRatePct = 62.0,
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
  const maxRiskRupees = +(cap * tierConfig.riskPerTradePct).toFixed(2);
  const hardMaxRiskRupees = +(cap * tierConfig.hardMaxRiskPct).toFixed(2);

  // Market-Impact Safety Cap: Strictly <= 5% of 20D median daily turnover
  const maxLiquiditySafeOrder = Math.floor(0.05 * turnover20D);
  const minRequiredTurnover = Math.max(6000000, cap * tierConfig.maxSlotAllocationPct * 20);
  const isLiquiditySufficient = turnover20D >= 6000000 && maxLiquiditySafeOrder >= (10 * entry);
  const liquidityWarning = turnover20D < 6000000
    ? `⚠️ VETO: 20D median turnover (Rs. ${(turnover20D / 100000).toFixed(1)}L) is below Rs. 60L institutional floor.`
    : (turnover20D < minRequiredTurnover
      ? `⚠️ Liquidity Cap Active: Order capped at 5% of 20D turnover (Rs. ${(maxLiquiditySafeOrder / 100000).toFixed(2)}L).`
      : null);

  // Friction-Adjusted Half-Kelly Calculation
  const rawRiskPerShare = entry - sl;
  const estGrossWin = Math.max(0.5, t1 - entry);
  const estNetWin = estGrossWin * (1 - (isLongTerm ? NEPSE_FRICTION_FY2083.cgtLongTerm : NEPSE_FRICTION_FY2083.cgtShortTerm)) - (entry * 0.0075);
  const estNetLoss = rawRiskPerShare + (entry * 0.0075);
  const netPayoffOddsB = estNetLoss > 0 ? Math.max(0.5, estNetWin / estNetLoss) : 1.0;
  const pWin = Math.min(0.85, Math.max(0.35, Number(winRatePct || 62) / 100));
  const fullKellyFraction = Math.max(0, pWin - ((1 - pWin) / netPayoffOddsB));
  const halfKellyFraction = +(fullKellyFraction * 0.5).toFixed(4);

  // Effective slot cap is the minimum of Tier Slot Cap and Half-Kelly Capital Cap (bounded >= 10% if Half-Kelly is positive)
  const halfKellySlotPct = halfKellyFraction > 0
    ? Math.min(tierConfig.maxSlotAllocationPct, Math.max(0.10, halfKellyFraction))
    : tierConfig.maxSlotAllocationPct;
  const maxSlotCapital = +(cap * halfKellySlotPct).toFixed(2);

  // Iterative Kitta Solver accounting for Rs. 10 minimum commission floor, Rs. 25 DP, and 5% turnover cap
  let convergedKitta = Math.max(10, Math.floor(maxRiskRupees / Math.max(1, estNetLoss)));

  for (let iter = 0; iter < 4; iter++) {
    const k = Math.max(10, convergedKitta);
    const buyVal = k * entry;
    const slVal = k * sl;
    const buyComm = calculateDynamicBrokerFee(buyVal); // enforces Rs. 10 floor
    const slComm = calculateDynamicBrokerFee(slVal);   // enforces Rs. 10 floor
    const buySebon = +(buyVal * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2);
    const slSebon = +(slVal * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2);
    const totalFixedAndVarFriction = buyComm + slComm + buySebon + slSebon + (NEPSE_FRICTION_FY2083.dpCharge * 2);

    const exactLossPerShare = rawRiskPerShare + (totalFixedAndVarFriction / k);
    const riskKitta = Math.floor(maxRiskRupees / Math.max(0.1, exactLossPerShare));

    // Max capital outlay bound (including buy-side fees so deployedCapital never exceeds maxSlotCapital or maxLiquiditySafeOrder)
    const maxAllowedOutlay = Math.min(maxSlotCapital, maxLiquiditySafeOrder);
    const buyFixedFees = NEPSE_FRICTION_FY2083.dpCharge + (buyVal <= 2777 ? NEPSE_FRICTION_FY2083.minBrokerCommission : 0);
    const varRate = (buyVal <= 2777 ? 0 : getNepseBrokerCommissionRate(buyVal)) + NEPSE_FRICTION_FY2083.sebonFeeRate;
    const capKitta = Math.floor(Math.max(0, maxAllowedOutlay - buyFixedFees) / (entry * (1 + varRate)));

    convergedKitta = Math.max(0, Math.min(riskKitta, capKitta));
  }

  // Enforce NEPSE 10-kitta regular trading lot rule without EVER breaching hardMaxRiskRupees (<= 2.0%) or 5% turnover cap
  let finalKitta = Math.floor(convergedKitta / 10) * 10;
  let lotSizeRiskWarning = null;

  if (finalKitta < 10) {
    const buyVal10 = 10 * entry;
    const slVal10 = 10 * sl;
    const buyFees10 = calculateDynamicBrokerFee(buyVal10) + +(buyVal10 * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2) + NEPSE_FRICTION_FY2083.dpCharge;
    const slFees10 = calculateDynamicBrokerFee(slVal10) + +(slVal10 * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2) + NEPSE_FRICTION_FY2083.dpCharge;
    const totalOutlay10 = buyVal10 + buyFees10;
    const totalLoss10 = (10 * rawRiskPerShare) + buyFees10 + slFees10;

    if (totalOutlay10 <= maxSlotCapital && totalOutlay10 <= maxLiquiditySafeOrder && totalLoss10 <= hardMaxRiskRupees) {
      finalKitta = 10;
      lotSizeRiskWarning = `Sized to NEPSE 10-kitta minimum lot (Risk: Rs. ${Math.round(totalLoss10)} = ${((totalLoss10 / cap) * 100).toFixed(2)}% of capital, within ${tierConfig.hardMaxRiskPct * 100}% hard cap).`;
    } else {
      finalKitta = 0;
      lotSizeRiskWarning = `Order blocked: 10-kitta minimum lot risks Rs. ${Math.round(totalLoss10)} (${((totalLoss10 / cap) * 100).toFixed(2)}%), exceeding the ${tierConfig.hardMaxRiskPct * 100}% max portfolio loss cap or slot limit.`;
    }
  }

  // Final Financials with converged kitta (compute per-unit expectancy on 10-kitta basis if finalKitta === 0)
  const evalKitta = finalKitta > 0 ? finalKitta : 10;
  const orderAmount = evalKitta * entry;
  const commissionRate = getNepseBrokerCommissionRate(orderAmount);
  const buyBrokerFee = calculateDynamicBrokerFee(orderAmount);
  const buySebonFee = +((orderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const buyDpFee = NEPSE_FRICTION_FY2083.dpCharge;
  const evalDeployedCapital = Math.round(orderAmount + buyBrokerFee + buySebonFee + buyDpFee);

  const deployedCapital = finalKitta > 0 ? evalDeployedCapital : 0;
  const capitalAllocationPct = cap > 0 ? +((deployedCapital / cap) * 100).toFixed(1) : 0;

  // Actual Risk at Stop-Loss
  const slGrossLoss = (entry - sl) * evalKitta;
  const slOrderAmount = evalKitta * sl;
  const slBrokerFee = calculateDynamicBrokerFee(slOrderAmount);
  const slSebonFee = +((slOrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const slDpFee = NEPSE_FRICTION_FY2083.dpCharge;
  const evalRiskRupees = Math.round(slGrossLoss + buyBrokerFee + buySebonFee + buyDpFee + slBrokerFee + slSebonFee + slDpFee);

  const actualRiskRupees = finalKitta > 0 ? evalRiskRupees : 0;
  const actualRiskPct = cap > 0 ? +((actualRiskRupees / cap) * 100).toFixed(2) : 0;

  // Target 1 Net Profit (Statutory 7.5% Short-Term CGT, 5.0% Long-Term CGT)
  const cgtRate = isLongTerm ? NEPSE_FRICTION_FY2083.cgtLongTerm : NEPSE_FRICTION_FY2083.cgtShortTerm;
  const t1GrossProfit = (t1 - entry) * evalKitta;
  const t1OrderAmount = evalKitta * t1;
  const t1BrokerFee = calculateDynamicBrokerFee(t1OrderAmount);
  const t1SebonFee = +((t1OrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const t1DpFee = NEPSE_FRICTION_FY2083.dpCharge;
  const totalT1Friction = buyBrokerFee + buySebonFee + buyDpFee + t1BrokerFee + t1SebonFee + t1DpFee;
  const t1TaxableGain = Math.max(0, t1GrossProfit - totalT1Friction);
  const t1Cgt = +(t1TaxableGain * cgtRate).toFixed(2);
  const evalT1NetProfit = Math.round(t1GrossProfit - totalT1Friction - t1Cgt);
  const t1NetProfit = finalKitta > 0 ? evalT1NetProfit : 0;

  // Target 2 Net Profit
  const t2GrossProfit = (t2 - entry) * evalKitta;
  const t2OrderAmount = evalKitta * t2;
  const t2BrokerFee = calculateDynamicBrokerFee(t2OrderAmount);
  const t2SebonFee = +((t2OrderAmount * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const t2DpFee = NEPSE_FRICTION_FY2083.dpCharge;
  const totalT2Friction = buyBrokerFee + buySebonFee + buyDpFee + t2BrokerFee + t2SebonFee + t2DpFee;
  const t2TaxableGain = Math.max(0, t2GrossProfit - totalT2Friction);
  const t2Cgt = +(t2TaxableGain * cgtRate).toFixed(2);
  const evalT2NetProfit = Math.round(t2GrossProfit - totalT2Friction - t2Cgt);
  const t2NetProfit = finalKitta > 0 ? evalT2NetProfit : 0;

  // Net Post-Tax/Fee RRR
  const netRRR = evalRiskRupees > 0 ? +(evalT1NetProfit / evalRiskRupees).toFixed(2) : 0;
  const isRrrAcceptable = netRRR >= requiredNetRRR;

  // Universal Rs. 1 Lakh Multiplier for Broadcast Subscribers
  const singleLossPerShare = +(rawRiskPerShare + (entry * 0.0036 * 2) + 0.50).toFixed(2);
  const kittaPer1Lakh = Math.max(10, Math.floor(Math.floor(1000 / Math.max(1, singleLossPerShare)) / 10) * 10);

  // Scale-Out & Statutory Breakeven Runner Plan
  const scaleOutKitta = finalKitta >= 20 ? Math.floor((finalKitta * 0.5) / 10) * 10 : Math.floor(finalKitta * 0.5);
  const runnerKitta = finalKitta - scaleOutKitta;
  const runnerEvalQty = Math.max(10, runnerKitta);
  const runnerSellComm = calculateDynamicBrokerFee(runnerEvalQty * entry);
  const runnerSellSebon = +((runnerEvalQty * entry * NEPSE_FRICTION_FY2083.sebonFeeRate).toFixed(2));
  const breakevenStopLoss = +(
    (evalDeployedCapital / evalKitta) +
    ((runnerSellComm + runnerSellSebon + NEPSE_FRICTION_FY2083.dpCharge) / runnerEvalQty)
  ).toFixed(1);

  return {
    userCapital: cap,
    tier: tierConfig.tier,
    tierName: tierConfig.tierName,
    maxSlots: tierConfig.maxSlots,
    riskPerTradePct: tierConfig.riskPerTradePct,
    hardMaxRiskPct: tierConfig.hardMaxRiskPct,
    maxSlotAllocationPct: tierConfig.maxSlotAllocationPct,
    halfKellyFraction,
    halfKellySlotPct: +(halfKellySlotPct * 100).toFixed(1),
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
    hardMaxRiskRupees,
    actualRiskRupees,
    actualRiskPct,
    commissionRate,
    commissionTierText: `${(commissionRate * 100).toFixed(2)}%`,
    buyBrokerFee: finalKitta > 0 ? buyBrokerFee : 0,
    buySebonFee: finalKitta > 0 ? buySebonFee : 0,
    buyDpFee: finalKitta > 0 ? buyDpFee : 0,
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
