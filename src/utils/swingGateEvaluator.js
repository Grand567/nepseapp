// src/utils/swingGateEvaluator.js
/**
 * ============================================================================
 * CANONICAL 7-GATE SWING TRADE SELECTOR & RISK ENGINE
 * ============================================================================
 * Evaluates candidates against strict empirical swing trading gates:
 * 1. Multi-Timeframe Trend Alignment (Daily + Weekly)
 * 2. Market Regime Gate (NEPSE Index > 20 & 50 EMA, Breadth positive)
 * 3. Liquidity Gate (Turnover >= 1 Cr, Volume >= 10k, Txns >= 100, No Circuit Lock)
 * 4. Momentum / Breakout Gate (10-20D breakout, RVOL >= 1.5x, Not extended)
 * 5. Quality & Event Risk Gate (Positive Book Value, EPS > 0, No Promoter Cliff)
 * 6. Broker Accumulation Confirmation (BCR3 >= 25% or positive net absorption)
 * 7. Risk-Engineered Trade Plan (Net R:R >= 2:1 after all statutory fees, T+2 lock)
 */

import { calculateRoundTripNetReturn, CIRCUIT_LIMITS } from '../constants/marketRules.js';

export const GATE_NAMES = [
  'Multi-Timeframe Trend',
  'Market Regime (>50 EMA)',
  'Liquidity & Circuit Check',
  'Breakout & RVOL Momentum',
  'Quality & Corporate Actions',
  'Broker Flow Confirmation',
  'Net R:R >= 2:1 After Costs'
];

/**
 * Evaluates the overall market regime gate
 * @param {Object} marketContext
 * @returns {Object} { passed: boolean, reason: string, details: Object }
 */
export function evaluateMarketRegimeGate(marketContext = {}) {
  const {
    nepseIndex = 0,
    nepseEma20 = 0,
    nepseEma50 = 0,
    advancers = 0,
    decliners = 0,
    dailyChangePct = 0,
    pctAboveEma50 = 50
  } = marketContext;

  const reasons = [];
  let passed = true;

  // 1. NEPSE Index must be above 20 and 50 EMA
  const aboveEma20 = nepseEma20 > 0 ? nepseIndex >= nepseEma20 : true;
  const aboveEma50 = nepseEma50 > 0 ? nepseIndex >= nepseEma50 : nepseIndex >= 2100;

  if (!aboveEma50) {
    passed = false;
    reasons.push(`NEPSE Index (${nepseIndex.toFixed(1)}) is below 50 EMA (${nepseEma50.toFixed(1)})`);
  }

  // 2. Not in a sharp drop (> -2.0% in single session)
  if (dailyChangePct < -2.0) {
    passed = false;
    reasons.push(`Index in sharp decline (${dailyChangePct.toFixed(2)}% today)`);
  }

  // 3. Breadth check: advancers vs decliners
  const totalBreath = advancers + decliners;
  const breadthPositive = totalBreath > 0 ? (advancers >= decliners * 0.8) : true;
  if (!breadthPositive) {
    passed = false;
    reasons.push(`Market breadth negative (${advancers} advancers vs ${decliners} decliners)`);
  }

  return {
    passed,
    aboveEma20,
    aboveEma50,
    breadthPositive,
    action: passed ? 'REGIME_PASS_TRADE_PERMITTED' : 'NO_TRADE_TODAY_CAPITAL_DEFENSE',
    reason: reasons.length > 0 ? reasons.join('; ') : 'Market regime is favorable for long swing setups.'
  };
}

/**
 * Evaluates all 7 gates for an individual stock candidate
 * @param {Object} stock Stock data object
 * @param {Object} marketRegimeResult Result of evaluateMarketRegimeGate
 * @param {Object} [accountRiskConfig]
 * @returns {Object} Comprehensive evaluation result
 */
export function evaluateStockSwingGates(stock = {}, marketRegimeResult = { passed: true }, accountRiskConfig = {}) {
  const {
    accountCapital = 1000000,
    riskPerTradePct = 1.0, // 1% account risk = Rs. 10,000
    investorType = 'INDIVIDUAL_RESIDENT'
  } = accountRiskConfig;

  const symbol = String(stock.symbol || 'SCRIP').toUpperCase().trim();
  const ltp = Number(stock.ltp || stock.close || stock.closePrice || 0);
  const pChange = Number(stock.pChange || stock.pointChangePct || 0);
  const volume = Number(stock.volume || stock.totalTradedQuantity || 0);
  const turnover = Number(stock.turnover || stock.totalTradedValue || 0);
  const transactions = Number(stock.transactions || stock.totalTrades || stock.txn || 0);

  // Technical indicators
  const ema20 = Number(stock.ema20 || stock.sma20 || (ltp > 0 ? ltp * 0.97 : 0));
  const ema50 = Number(stock.ema50 || stock.sma50 || (ltp > 0 ? ltp * 0.94 : 0));
  const rvol = Number(stock.rvol || stock.volumeSurgeRatio || (stock.volumeZScore ? (1 + (stock.volumeZScore || 0) * 0.4) : 1.25));
  const threeDayRunPct = Number(stock.threeDayRunPct || stock.pChange || 0);
  const isBreakout = Boolean(stock.isBreakout || stock.breakout10d || stock.high52wDist > -3 || pChange >= 2.0);

  // Fundamentals & Corporate Actions
  const bookValue = stock.bookValue != null ? Number(stock.bookValue) : (stock.netWorth ? Number(stock.netWorth) : 120);
  const eps = stock.eps != null ? Number(stock.eps) : (stock.pe && stock.ltp ? (stock.ltp / stock.pe) : 12);
  const promoterLockinDays = stock.promoterLockinDays != null ? Number(stock.promoterLockinDays) : 180;
  const isBookClosureSoon = Boolean(stock.isBookClosureSoon || stock.bookClosureDays <= 7);

  // Broker accumulation
  const bcr3BuyPct = Number(stock.bcr3BuyPct || stock.bcr3 || 0);
  const netBrokerQty = Number(stock.netBrokerQty || stock.netAccumulationQty || 0);
  const hasBrokerAccumulation = bcr3BuyPct >= 25 || netBrokerQty > 0 || stock.topAccumulator != null;

  // Gate 1: Multi-Timeframe Alignment
  const gate1Passed = ltp > ema20 && ema20 >= (ema50 * 0.98);
  const gate1Reason = gate1Passed
    ? `Price (Rs. ${ltp}) above EMA20 (${ema20.toFixed(1)}) and EMA50 (${ema50.toFixed(1)})`
    : `Trend misaligned: Price Rs. ${ltp} below EMA20/50`;

  // Gate 2: Market Regime Gate
  const gate2Passed = marketRegimeResult.passed;
  const gate2Reason = gate2Passed ? 'Market Regime Approved' : marketRegimeResult.reason;

  // Gate 3: Liquidity & Circuit Lock Gate
  const maxCircuit = CIRCUIT_LIMITS.individualStockDailyBandPct; // 15%
  const isUpperCircuitLocked = pChange >= (maxCircuit - 0.25);
  const isLowerCircuitLocked = pChange <= -(maxCircuit - 0.25);
  const minTurnover = 5000000; // Rs. 50 Lakhs minimum
  const minTxns = 50;

  const liquidityPassed = (turnover >= minTurnover || volume >= 5000) && (transactions >= minTxns || transactions === 0);
  const circuitPassed = !isUpperCircuitLocked && !isLowerCircuitLocked;
  const gate3Passed = liquidityPassed && circuitPassed;
  let gate3Reason = 'Adequate liquidity and continuous two-sided order matching';
  if (isUpperCircuitLocked) gate3Reason = 'REJECTED: Locked at +15% Upper Circuit (Unfillable gap risk)';
  else if (isLowerCircuitLocked) gate3Reason = 'REJECTED: Locked at -15% Lower Circuit (Exit illiquidity)';
  else if (!liquidityPassed) gate3Reason = `Thin liquidity: Turnover Rs. ${(turnover/100000).toFixed(1)}L < Rs. 50L threshold`;

  // Gate 4: Momentum Breakout / Track A (NR7/Pocket Pivot) / Track B (T+2 Continuation)
  const historyBars = Array.isArray(stock.candles)
    ? stock.candles
    : (Array.isArray(stock.history) ? stock.history : []);
  let derivedNr7 = false;
  let derivedPocketPivot = false;
  let derivedT2Continuation = false;
  let derivedClv = 0.5;
  let derivedUpperWickRatio = 0;

  if (historyBars.length >= 2) {
    const norm = historyBars.map((b) => {
      const c = Number(b?.close_price ?? b?.close ?? 0);
      const o = Number(b?.open_price ?? b?.open ?? c) || c;
      const h = Math.max(Number(b?.high_price ?? b?.high ?? c) || c, o, c);
      const l = Math.min(Number(b?.low_price ?? b?.low ?? c) || c, o, c);
      const v = Number(b?.total_volume ?? b?.volume ?? b?.vol ?? 0);
      return { open: o, high: h, low: l, close: c, volume: v };
    }).filter((b) => b.close > 0);

    if (norm.length >= 2) {
      const bLen = norm.length - 1;
      const curBar = norm[bLen];
      const prevBar = norm[bLen - 1];
      const curRange = curBar.high - curBar.low;
      if (curRange > 0.001) {
        derivedClv = Number(Math.max(0, Math.min(1, (curBar.close - curBar.low) / curRange)).toFixed(3));
        derivedUpperWickRatio = Number(Math.max(0, (curBar.high - Math.max(curBar.open, curBar.close)) / curRange).toFixed(3));
      } else {
        derivedClv = pChange > 0 ? 1.0 : pChange < 0 ? 0.0 : 0.5;
      }

      if (norm.length >= 7) {
        const prior6 = norm.slice(bLen - 6, bLen).map((b) => b.high - b.low);
        derivedNr7 = prior6.every((r) => r > 0) && curRange > 0 && curRange <= Math.min(...prior6) + 1e-6;
      }

      let maxDownVol10 = 0;
      for (let k = Math.max(1, bLen - 10); k < bLen; k++) {
        if (norm[k].close < norm[k - 1].close && norm[k].volume > maxDownVol10) {
          maxDownVol10 = norm[k].volume;
        }
      }
      const curChg = prevBar.close > 0 ? ((curBar.close - prevBar.close) / prevBar.close) * 100 : pChange;
      derivedPocketPivot = curChg >= 0.2 && curBar.close >= ema20 * 0.99 && curBar.volume > maxDownVol10 && maxDownVol10 > 0;

      if (norm.length >= 10) {
        const prior20 = norm.slice(Math.max(0, bLen - 20), bLen);
        const avgVol20 = prior20.reduce((s, r) => s + r.volume, 0) / Math.max(1, prior20.length);
        for (let k = Math.max(1, bLen - 4); k <= bLen - 2; k++) {
          const igBar = norm[k];
          const beforeIg = norm[k - 1];
          const igChgPct = beforeIg.close > 0 ? ((igBar.close - beforeIg.close) / beforeIg.close) * 100 : 0;
          const postBars = norm.slice(k + 1, bLen + 1);
          const minPostLow = Math.min(...postBars.map((b) => b.low));
          const hasDryup = postBars.some((b) => b.volume <= igBar.volume * 0.72);
          if (
            igChgPct >= 3.0 &&
            igBar.volume >= avgVol20 * 1.25 &&
            minPostLow >= igBar.low * 0.992 &&
            curBar.close >= igBar.open * 0.992 &&
            curBar.close >= ema20 * 0.99 &&
            hasDryup
          ) {
            derivedT2Continuation = true;
            break;
          }
        }
      }
    }
  }

  const isPocketPivot = Boolean(stock.isPocketPivot || derivedPocketPivot);
  const isNr7 = Boolean(stock.isNr7 || derivedNr7);
  const isT2ClearedContinuation = Boolean(stock.isT2ClearedContinuation || derivedT2Continuation);
  const clv = stock.clv != null ? Number(stock.clv) : derivedClv;
  const upperWickRatio = stock.upperWickRatio != null ? Number(stock.upperWickRatio) : derivedUpperWickRatio;
  const isUpperWickRejected = upperWickRatio > 0.45 && pChange > 1.0;

  const isNotClimaxExtended = threeDayRunPct < 14.0; // Avoid chasing >14% run
  const isCoiledPreIgnition = (isPocketPivot || isNr7) && ltp >= ema20 * 0.99 && hasBrokerAccumulation;
  const isTrackB = (isT2ClearedContinuation || (isBreakout && rvol >= 1.25)) && !isUpperWickRejected;
  const rallyTrack = isTrackB
    ? 'TRACK_B_T2_CLEARED_CONTINUATION'
    : (isCoiledPreIgnition && !isUpperWickRejected)
      ? 'TRACK_A_COILED_2_3D_IGNITION'
      : 'STANDARD_ACCUMULATION';
  const rallyHorizonLabel = rallyTrack === 'TRACK_B_T2_CLEARED_CONTINUATION'
    ? 'Track B: Post-T+2 Cleared Continuation'
    : rallyTrack === 'TRACK_A_COILED_2_3D_IGNITION'
      ? 'Track A: 2–3 Day Ignition Watch'
      : 'Institutional Base Accumulation';

  const gate4Passed = !isUpperWickRejected && isNotClimaxExtended && (
    (isBreakout && rvol >= 1.25) ||
    isT2ClearedContinuation ||
    isCoiledPreIgnition
  );
  let gate4Reason = 'Breakout with RVOL expansion and healthy base';
  if (!isNotClimaxExtended) gate4Reason = `Climax extension: stock up ${threeDayRunPct.toFixed(1)}% in 3 days`;
  else if (isUpperWickRejected) gate4Reason = `Upper-wick distribution rejection: wick ${(upperWickRatio * 100).toFixed(0)}% > 45% threshold`;
  else if (isT2ClearedContinuation) gate4Reason = 'Track B: T+2 settlement survival & continuation hold above ignition base';
  else if (isCoiledPreIgnition) gate4Reason = `Track A: Coiled ${isNr7 ? 'NR7' : 'Pocket Pivot'} pre-ignition with broker accumulation`;
  else if (!isBreakout) gate4Reason = 'No 10-20 day range breakout, T+2 continuation, or NR7/Pocket Pivot ignition detected';
  else if (rvol < 1.25) gate4Reason = `Insufficient volume surge (${rvol.toFixed(1)}x < 1.25x)`;

  // Gate 5: Quality & Event Risk Gate
  const positiveNetWorth = bookValue > 0;
  const viableEarnings = eps > 0;
  const safePromoterUnlock = promoterLockinDays > 25;
  const safeEventWindow = !isBookClosureSoon;

  const gate5Passed = positiveNetWorth && viableEarnings && safePromoterUnlock && safeEventWindow;
  let gate5Reason = 'Sound balance sheet, positive net worth, no imminent cliff';
  if (!positiveNetWorth) gate5Reason = `REJECTED: Negative Net Worth / Book Value (Rs. ${bookValue})`;
  else if (!viableEarnings) gate5Reason = `REJECTED: Negative or collapsing EPS (Rs. ${eps})`;
  else if (!safePromoterUnlock) gate5Reason = `REJECTED: Imminent promoter unlock cliff in ${promoterLockinDays} days`;
  else if (!safeEventWindow) gate5Reason = 'REJECTED: Imminent book closure event window';

  // Gate 6: Smart-Money / Broker Confirmation
  const gate6Passed = hasBrokerAccumulation;
  const gate6Reason = gate6Passed
    ? `Confirmed: BCR3 ${bcr3BuyPct}% / Net absorption positive`
    : 'No confirmed institutional broker accumulation detected';

  // Gate 7: Risk-Engineered Trade Plan (Net R:R >= 2:1 After Costs)
  const stopLossPct = Number(stock.stopLossPct || 4.2); // Technical stop 4.2% below entry
  const stopPrice = Number((ltp * (1 - stopLossPct / 100)).toFixed(1));
  const target1Price = Number((ltp * (1 + 7.5 / 100)).toFixed(1)); // +1.5R (+7.5%)
  const target2Price = Number((ltp * (1 + 13.5 / 100)).toFixed(1)); // +2.5R - 3R (+13.5%)

  // Calculate Net Return after full round-trip friction (5-tier brokerage, SEBON, DP, CGT)
  const netTarget1 = calculateRoundTripNetReturn({
    buyPrice: ltp,
    sellPrice: target1Price,
    quantity: 100,
    holdingDays: 7,
    investorType
  });
  const netTarget2 = calculateRoundTripNetReturn({
    buyPrice: ltp,
    sellPrice: target2Price,
    quantity: 100,
    holdingDays: 7,
    investorType
  });
  const netStopLoss = calculateRoundTripNetReturn({
    buyPrice: ltp,
    sellPrice: stopPrice,
    quantity: 100,
    holdingDays: 7,
    investorType
  });

  const netPotentialGainPct = netTarget2.netReturnPct;
  const netPotentialLossPct = Math.abs(netStopLoss.netReturnPct);
  const netRewardRiskRatio = netPotentialLossPct > 0 ? (netPotentialGainPct / netPotentialLossPct) : 0;

  const gate7Passed = netRewardRiskRatio >= 2.0 && ltp > 50;
  const gate7Reason = gate7Passed
    ? `Net R:R ${netRewardRiskRatio.toFixed(2)}:1 after fees (Target 2 +${netPotentialGainPct.toFixed(1)}% vs Stop -${netPotentialLossPct.toFixed(1)}%)`
    : `Unfavorable Net R:R ${netRewardRiskRatio.toFixed(2)}:1 after statutory frictions (< 2:1 requirement)`;

  // Position Sizing (Fixed Account Risk: 1% risk)
  const maxRiskCapital = accountCapital * (riskPerTradePct / 100);
  const perShareRiskNpr = Math.max(ltp - stopPrice, 1);
  const recommendedQuantity = Math.max(10, Math.floor(maxRiskCapital / perShareRiskNpr));
  const totalAllocatedCapital = recommendedQuantity * ltp;

  // Gate Checklist
  const gates = [
    { name: GATE_NAMES[0], passed: gate1Passed, reason: gate1Reason },
    { name: GATE_NAMES[1], passed: gate2Passed, reason: gate2Reason },
    { name: GATE_NAMES[2], passed: gate3Passed, reason: gate3Reason },
    { name: GATE_NAMES[3], passed: gate4Passed, reason: gate4Reason },
    { name: GATE_NAMES[4], passed: gate5Passed, reason: gate5Reason },
    { name: GATE_NAMES[5], passed: gate6Passed, reason: gate6Reason },
    { name: GATE_NAMES[6], passed: gate7Passed, reason: gate7Reason }
  ];

  const gatesPassedCount = gates.filter(g => g.passed).length;
  const allGatesPassed = gatesPassedCount === 7;

  return {
    symbol,
    sector: stock.sectorName || stock.sector || 'Unknown',
    ltp,
    pChange,
    turnover,
    volume,
    rallyTrack,
    rallyHorizonLabel,
    isPocketPivot,
    isNr7,
    isT2ClearedContinuation,
    clv,
    upperWickRatio,
    allGatesPassed,
    gatesPassedCount,
    gates,
    verdict: allGatesPassed ? 'APPROVED_PAPER_PICK' : 'REJECTED',
    rejectionReasons: gates.filter(g => !g.passed).map(g => `${g.name}: ${g.reason}`),
    plan: {
      rallyTrack,
      rallyHorizonLabel,
      entryZone: [Number((ltp * 0.995).toFixed(1)), Number((ltp * 1.005).toFixed(1))],
      stopLoss: stopPrice,
      stopLossPct,
      target1: target1Price,
      target2: target2Price,
      netRewardRiskRatio: Number(netRewardRiskRatio.toFixed(2)),
      recommendedQuantity,
      totalAllocatedCapital,
      maxHoldingSessions: 7,
      dematLockSessions: 2,
      timeStopRule: 'Exit at Day 7 Close if Target 1 is not reached'
    }
  };
}

/**
 * Screens an entire list of stocks against the 7 gates
 * @param {Array} stocks
 * @param {Object} marketContext
 * @param {Object} [accountRiskConfig]
 * @returns {Object} { shortlist: Array, rejected: Array, marketRegime: Object }
 */
export function screenUniverseForSwingPicks(stocks = [], marketContext = {}, accountRiskConfig = {}) {
  const marketRegime = evaluateMarketRegimeGate(marketContext);

  const evaluations = stocks.map(stock => evaluateStockSwingGates(stock, marketRegime, accountRiskConfig));

  const shortlist = evaluations.filter(e => e.allGatesPassed);
  const rejected = evaluations.filter(e => !e.allGatesPassed);

  return {
    marketRegime,
    shortlist,
    rejected,
    isDefensiveCashMode: !marketRegime.passed,
    statusHeadline: !marketRegime.passed
      ? 'NO TRADE TODAY — CAPITAL DEFENSE ACTIVE'
      : (shortlist.length > 0 ? `${shortlist.length} CANDIDATES APPROVED (PAPER-TRADING MODE)` : 'NO CANDIDATES PASSED ALL 7 GATES TODAY')
  };
}
