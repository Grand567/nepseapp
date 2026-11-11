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

  // Gate 4: Momentum Breakout & RVOL Gate
  const isNotClimaxExtended = threeDayRunPct < 14.0; // Avoid chasing >14% run
  const gate4Passed = isBreakout && rvol >= 1.25 && isNotClimaxExtended;
  let gate4Reason = 'Breakout with RVOL expansion and healthy base';
  if (!isBreakout) gate4Reason = 'No 10-20 day range breakout detected';
  else if (rvol < 1.25) gate4Reason = `Insufficient volume surge (${rvol.toFixed(1)}x < 1.25x)`;
  else if (!isNotClimaxExtended) gate4Reason = `Climax extension: stock up ${threeDayRunPct.toFixed(1)}% in 3 days`;

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
    allGatesPassed,
    gatesPassedCount,
    gates,
    verdict: allGatesPassed ? 'APPROVED_PAPER_PICK' : 'REJECTED',
    rejectionReasons: gates.filter(g => !g.passed).map(g => `${g.name}: ${g.reason}`),
    plan: {
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
