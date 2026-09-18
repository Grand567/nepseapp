/**
 * Guru Engine (Unified Master Quantitative Decision Engine)
 * ─────────────────────────────────────────────────────────────────────────────
 * src/utils/guruEngine.js
 *
 * Provides a single source of truth for:
 * 1. Setup Quality Scoring (0–100, strictly clamped)
 * 2. Action States (ACTIVE_BREAKOUT, COILED_PRE_BREAKOUT, SUPPORT_ACCUMULATION, RESISTANCE_TRAP, DISTRIBUTION_AVOID)
 * 3. Unified Execution Geometry (Entry Corridor, Breakout Trigger, Target 1, Target 2, Stop Loss)
 * 4. Master Daily Prime Opportunity Selection (shared between Dashboard & PredictorHub)
 */

import {
  calculateATR,
  calculateVCPContractionRatio,
  calculateBollingerBandWidthPercentile,
  evaluateMarketBreadthCashDefense,
  getHydroSeasonality,
  calculateMultiHorizonTargets,
  evaluatePreOpenExecutionGate,
  evaluateNrbRegulatorySafety
} from './quantEngine.js';

import { getDetailedMarketStatus } from './nepseCalendar.js';

import {
  runAnalogBacktest,
  toAscendingCandles,
  adjustForCorporateActionsWithConfirmation,
  generateEntryExitPlan
} from './setupAnalyzer.js';

import { analyzeTechnical } from './technicalAnalysisEngine.js';
import { getCachedStockFundamentals } from './liveData.js';

/**
 * Evaluates a single stock setup with unified quantitative & statistical gates.
 */
export function evaluateGuruMasterSetup(stock = {}, rawCandles = [], brokerData = null, dividendHistory = []) {
  const sym = String(stock?.symbol || stock?.scrip || '').toUpperCase().trim();
  const ltp = Number(stock?.ltp || stock?.price || (rawCandles.length > 0 ? rawCandles[rawCandles.length - 1]?.close : 0)) || 100;
  const pCh = Number(stock?.pChange || 0);
  const vol = Number(stock?.volume || stock?.totalTradedQuantity || 0);

  const candles = toAscendingCandles(rawCandles);
  const historyDays = candles.length;

  // Floor sheet broker metrics
  const broker = brokerData || stock?.brokerAnalysis || {};
  const adRatio = Number(broker.adRatio || 0);
  const lbas = Number(broker.lbas || 0.35); // Large-block absorption share
  const isBrokerDumping = adRatio <= -0.10 || (broker.adSignal === 'Distribution' && adRatio < 0);
  const isBrokerAccumulating = adRatio >= 0.06 || broker.adSignal === 'Accumulation';

  // 1. Corporate action adjusted candles
  const { adjustedCandles } = historyDays >= 30
    ? adjustForCorporateActionsWithConfirmation(candles, dividendHistory)
    : { adjustedCandles: candles };

  const closes = adjustedCandles.map(c => Number(c.close || 0)).filter(p => p > 0);
  const atr = calculateATR(adjustedCandles.slice(-60), 14);

  // Structural moving averages
  let technicalReport = null;
  if (adjustedCandles.length >= 25) {
    try {
      technicalReport = analyzeTechnical(adjustedCandles);
    } catch (_) {}
  }

  const ema50 = Number(stock?.ema50 || stock?.sma50 || technicalReport?.trend?.ema?.ema50 || (closes.length >= 50 ? closes[closes.length - 1] * 0.98 : 0));
  const ema200 = Number(stock?.ema200 || stock?.sma200 || technicalReport?.trend?.ema?.ema200 || (closes.length >= 200 ? closes[closes.length - 1] * 0.95 : 0));

  const isAbove50 = ema50 > 0 ? ltp >= ema50 : null;
  const isAbove200 = ema200 > 0 ? ltp >= ema200 : null;

  // Resistance Traps: Testing 200-day EMA (within ±1.8% of 200 EMA and under 1.02x clearance)
  const isTesting200EMA = ema200 > 0 && Math.abs(ltp - ema200) / ema200 <= 0.018 && ltp < ema200 * 1.02;

  // Volatility Contraction Pattern (VCP) & Bollinger Squeeze
  const vcp = calculateVCPContractionRatio(adjustedCandles);
  const bbwp = calculateBollingerBandWidthPercentile(adjustedCandles, 20, 120);

  // High 20 Pivot & Distance
  const high20 = closes.length >= 20
    ? Math.max(...adjustedCandles.slice(-21, -1).map(c => Number(c.high || c.close || 0)))
    : ltp * 1.02;
  const lowBase = closes.length >= 20
    ? Math.min(...adjustedCandles.slice(-21, -1).map(c => Number(c.low || c.close || 0)))
    : ltp * 0.94;

  const distToPivotPct = high20 > 0 ? +(((high20 - ltp) / high20) * 100).toFixed(1) : 0;
  const isCoilingNearPivot = distToPivotPct >= 0.1 && distToPivotPct <= 4.8;
  const isVCPTight = vcp.isVCP || vcp.finalDepth <= 6.8;
  const isSqueeze = bbwp.isSqueeze || bbwp.bwpr <= 18.0;

  // Relative volume
  const avgVol50 = adjustedCandles.slice(-50).reduce((s, c) => s + Number(c.volume || 0), 0) / Math.min(50, Math.max(1, adjustedCandles.length));
  const rvol = avgVol50 > 0 ? +(vol / avgVol50).toFixed(2) : 1.0;

  // 2. Bayesian Historical Analogs (Zero-Lookahead Backtest)
  let analogWinRate = null;
  let analogSampleSize = 0;
  let analogStats = null;

  if (historyDays >= 80) {
    try {
      const analogResult = runAnalogBacktest(adjustedCandles, {
        maxMatches: 8,
        minSimilarity: 62,        // Raised from 55 — only statistically meaningful matches (GAP-11)
        forwardWindow: 20,
        maxHoldDays: 20
      });
      if (analogResult?.stats) {
        analogStats = analogResult.stats;
        analogWinRate = analogResult.stats.winRate; // Bayesian shrunk
        analogSampleSize = analogResult.stats.sampleSize;
      }
    } catch (_) {}
  }

  // 3. Execution Geometry (Single authoritative calculation)
  const clearanceBuffer = Math.max(high20 * 0.0035, atr * 0.22);
  const triggerPrice = +(high20 + clearanceBuffer * 0.5).toFixed(1);
  const chaseCap = +(high20 * 1.025).toFixed(1); // +2.5% max chase cap
  const structuralStopLoss = +(Math.max(1, Math.min(lowBase - atr * 0.5, ltp - atr * 1.5))).toFixed(1);
  const riskPerShare = Math.max(1, ltp - structuralStopLoss);

  const target1 = +(ltp + riskPerShare * 1.5).toFixed(1);
  const target2 = +(ltp + riskPerShare * 3.0).toFixed(1);
  const rrr1 = +((target1 - ltp) / Math.max(0.5, ltp - structuralStopLoss)).toFixed(2);
  const rrr2 = +((target2 - ltp) / Math.max(0.5, ltp - structuralStopLoss)).toFixed(2);

  // 4. Action State Determination
  let actionState = 'NEUTRAL_CONSOLIDATION';
  let setupClass = 'Consolidation';
  let isPrimeCandidate = true;
  let disqualificationReason = null;

  // Circuit ceiling check (±15% limit)
  const prevClose = Number(stock?.previousClose || stock?.prevClose || (closes.length > 1 ? closes[closes.length - 2] : ltp));
  const upperCeiling = +(prevClose * 1.15).toFixed(1);
  const distToCeilingPct = prevClose > 0 ? +(((upperCeiling - ltp) / prevClose) * 100).toFixed(2) : 15;
  const isCircuitCeilingTrap = distToCeilingPct <= 3.5; // Within 3.5% of +15% ceiling (raised from 2.0)

  // Promoter Lock-In Expiry Blackout (60-Day window — synced with PromoterSharesService Critical Shock tier)
  let isPromoterUnlockRisk = false;
  let promoterUnlockDays = null;
  if (stock?.lockinExpiry || stock?.promoterLockinDays !== undefined) {
    const daysToUnlock = stock.promoterLockinDays !== undefined
      ? Number(stock.promoterLockinDays)
      : Math.ceil((new Date(stock.lockinExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToUnlock >= 0 && daysToUnlock <= 60) {
      isPromoterUnlockRisk = true;
      promoterUnlockDays = daysToUnlock;
    }
  }

  // Fundamental EPS check (cross-reference cached fundamentals to detect operational losses)
  const cachedFund = getCachedStockFundamentals(sym);
  const eps = Number(cachedFund?.eps !== undefined && cachedFund?.eps !== null ? cachedFund.eps : (stock?.eps || 0));
  const isLossMaking = (cachedFund?.eps !== undefined && Number(cachedFund.eps) < 0) || (stock?.eps !== undefined && Number(stock.eps) < 0);

  // Hydrology Check
  const sector = String(stock?.sector || stock?.sectorName || '');
  const hydro = getHydroSeasonality(sector);
  const isDeepHydroDry = hydro.isHydro && hydro.isDrySeason && hydro.penaltyPoints <= -15;

  // GAP-1: NRB Regulatory Safety Gate for BFI sector stocks
  let isNrbRegulatoryFail = false;
  let nrbFailReason = null;
  const sectorLower = sector.toLowerCase();
  const isBfiSector = sectorLower.includes('bank') || sectorLower.includes('finance') ||
                      sectorLower.includes('bfi') || sectorLower.includes('microfinance') ||
                      sectorLower.includes('development bank');
  if (isBfiSector) {
    try {
      const nrbResult = evaluateNrbRegulatorySafety(stock);
      if (nrbResult && nrbResult.overallStatus === 'REGULATORY_FAIL') {
        isNrbRegulatoryFail = true;
        nrbFailReason = nrbResult.failReasons?.join('; ') || 'NRB mandatory metrics not met';
      }
    } catch (_) {}
  }

  if (isCircuitCeilingTrap) {
    actionState = 'CIRCUIT_CEILING_TRAP';
    setupClass = 'Circuit Ceiling Overhang (Upside Exhausted)';
    isPrimeCandidate = false;
    disqualificationReason = `Within ${distToCeilingPct}% of +15% daily circuit ceiling — upside capped against severe gap-down risk`;
  } else if (isNrbRegulatoryFail) {
    actionState = 'NRB_REGULATORY_FAIL';
    setupClass = 'NRB Regulatory Threshold Breach';
    isPrimeCandidate = false;
    disqualificationReason = `BFI regulatory failure: ${nrbFailReason}`;
  } else if (isPromoterUnlockRisk) {
    actionState = 'PROMOTER_LOCKIN_BLACKOUT';
    setupClass = 'Promoter Share Lock-in Expiry (Supply Flood)';
    isPrimeCandidate = false;
    disqualificationReason = `Promoter share unlock within ${promoterUnlockDays} day(s) — high risk of secondary market supply flood`;
  } else if (isLossMaking) {
    actionState = 'NEGATIVE_EARNINGS_AVOID';
    setupClass = 'Fundamental Loss-Making Entity';
    isPrimeCandidate = false;
    disqualificationReason = `Negative EPS (Rs. ${eps.toFixed(2)}) — company is operating at an operational loss`;
  } else if (isBrokerDumping) {
    actionState = 'DISTRIBUTION_AVOID';
    setupClass = 'Institutional Distribution';
    isPrimeCandidate = false;
    disqualificationReason = 'Top institutional brokers are net offloading inventory';
  } else if (isDeepHydroDry && ltp < ema50) {
    actionState = 'HYDRO_DRY_SEASON_CAUTION';
    setupClass = 'Seasonal Headwind';
    isPrimeCandidate = false;
    disqualificationReason = 'Winter RoR hydrology cash flows depressed';
  } else if (Number(stock?.rsi || stock?.rsi14 || 50) >= 70) {
    actionState = 'OVERBOUGHT_DISTRIBUTION';
    setupClass = 'Overbought Peak (Take Profit / Exit)';
    isPrimeCandidate = false;
    disqualificationReason = `RSI extended at ${Number(stock?.rsi || stock?.rsi14 || 50).toFixed(1)} (>= 70) — overbought exhaustion / distribution risk`;
  } else if (pCh >= 8.0) {
    // GAP-4: Anti-FOMO gate — stock already up 8%+ on the day is an extended breakout
    // Entry at this level means buying into a parabolic move with T+2 freeze risk
    actionState = 'EXTENDED_BREAKOUT_AVOID';
    setupClass = 'Extended Intraday Surge — Anti-FOMO Gate';
    isPrimeCandidate = false;
    disqualificationReason = `Stock already up ${pCh.toFixed(1)}% today (>= 8.0%) — parabolic extension with severe T+2 freeze and gap-down risk`;
  } else if (analogWinRate !== null && analogWinRate < 55) {
    // GAP-6: Raised from 50% to 55% — statistical edge requires meaningful forward win rate
    actionState = 'LOW_WIN_RATE_AVOID';
    setupClass = 'Low Historical Win Rate (<55%)';
    isPrimeCandidate = false;
    disqualificationReason = `Historical analog backtest indicates insufficient forward win rate (${analogWinRate}% < 55%) — statistical edge absent`;
  } else if (ltp > 0 && (ltp - structuralStopLoss) / ltp > 0.10) {
    actionState = 'EXCESSIVE_DOWNSIDE_RISK';
    setupClass = 'Unfavorable Risk/Reward (Stop > 10%)';
    isPrimeCandidate = false;
    disqualificationReason = `Downside risk to structural stop is ${(((ltp - structuralStopLoss) / ltp) * 100).toFixed(1)}% (fails max 10% risk threshold)`;
  } else if (isTesting200EMA && (analogWinRate === null || analogWinRate < 55)) {
    actionState = 'RESISTANCE_TRAP';
    setupClass = '200-Day EMA Resistance Ceiling';
    isPrimeCandidate = false;
    disqualificationReason = `Testing 200 EMA overhead resistance (Rs. ${ema200.toFixed(1)}) with unconfirmed or low analog win rate (${analogWinRate ?? 'unverified'}%)`;
  } else if (ltp >= high20 + clearanceBuffer && rvol >= 1.40) {
    actionState = 'ACTIVE_BREAKOUT';
    setupClass = 'Active Momentum Breakout';
  } else if (isCoilingNearPivot && (isVCPTight || isSqueeze)) {
    actionState = 'COILED_PRE_BREAKOUT';
    setupClass = 'Coiled Pre-Breakout Spring';
  } else if (isAbove50 && isBrokerAccumulating) {
    actionState = 'SUPPORT_ACCUMULATION';
    setupClass = 'Base Accumulation';
  }

  // 5. Unified Guru Score Calculation (Strictly Clamped 10 to 98)
  let rawScore = 50;

  // Trend & Moving Average Alignment
  if (isAbove50 === true) rawScore += 10;
  if (isAbove50 === false) rawScore -= 14;
  if (isAbove200 === true) rawScore += 8;
  if (isAbove200 === false) rawScore -= 10;

  // Structure / VCP / Volatility Squeeze
  if (isVCPTight) rawScore += 10;
  if (isSqueeze) rawScore += 8;
  if (isCoilingNearPivot) rawScore += 6;

  // Volume & Broker Order Flow
  if (rvol >= 1.5) rawScore += 8;
  else if (rvol < 0.7 && !isCoilingNearPivot) rawScore -= 6;
  if (adRatio >= 0.06) rawScore += 10;
  if (lbas >= 0.35) rawScore += 6;

  // Analog Win Rate Contribution
  if (analogWinRate !== null) {
    if (analogWinRate >= 60) rawScore += 8;
    else if (analogWinRate >= 50) rawScore += 3;
    else if (analogWinRate < 42) rawScore -= 14; // Heavy penalty for poor analog records like AHPC
  }

  // Hydro penalty
  if (hydro.isHydro && hydro.isDrySeason) {
    rawScore += hydro.penaltyPoints;
  }

  // Penalize resistance trap
  if (isTesting200EMA) {
    rawScore -= 14;
  }

  // Final Clamped Score (12 to 96 max - never 100+!)
  let guruScore = Math.max(12, Math.min(96, Math.round(rawScore)));

  // If disqualified, hard resistance ceiling, or dumping, cap score at 45
  if (!isPrimeCandidate || isBrokerDumping || (isTesting200EMA && (analogWinRate === null || analogWinRate < 50))) {
    guruScore = Math.min(45, guruScore);
  }

  // Entry corridor
  const entryMin = actionState === 'COILED_PRE_BREAKOUT'
    ? +(high20 * 0.99).toFixed(1)
    : +(ltp * 0.988).toFixed(1);
  const entryMax = actionState === 'COILED_PRE_BREAKOUT'
    ? chaseCap
    : +(ltp * 1.012).toFixed(1);

  // Verdict translation
  let verdict = 'HOLD / WAIT FOR CONFIRMATION';
  if (actionState === 'DISTRIBUTION_AVOID' || actionState === 'OVERBOUGHT_DISTRIBUTION') {
    verdict = 'AVOID / EXIT (OVERBOUGHT DISTRIBUTION)';
  } else if (actionState === 'LOW_WIN_RATE_AVOID') {
    verdict = 'NO TRADE (LOW HISTORICAL WIN RATE <50%)';
  } else if (actionState === 'EXCESSIVE_DOWNSIDE_RISK') {
    verdict = 'NO TRADE (UNFAVORABLE RISK/REWARD)';
  } else if (actionState === 'RESISTANCE_TRAP') {
    verdict = 'REDUCE / AVOID NEW ENTRY (200 EMA RESISTANCE)';
  } else if (actionState === 'ACTIVE_BREAKOUT') {
    verdict = guruScore >= 80 ? 'STRONG BREAKOUT IN BUY ZONE' : 'BREAKOUT CONFIRMATION';
  } else if (actionState === 'COILED_PRE_BREAKOUT') {
    verdict = guruScore >= 75 ? 'HIGH-CONVICTION COIL (AWAITING TRIGGER)' : 'COILED BASE (WATCHLIST)';
  } else if (actionState === 'SUPPORT_ACCUMULATION') {
    verdict = guruScore >= 68 ? 'BUY / ACCUMULATE IN SUPPORT ZONE' : 'SUPPORT ACCUMULATION';
  }

  return {
    symbol: sym,
    ltp,
    pChange: pCh,
    volume: vol,
    rvol,
    guruScore,
    score: guruScore,
    compositeScore: guruScore,
    actionState,
    setupClass,
    verdict,
    isPrimeCandidate,
    disqualificationReason,
    isAbove50,
    isAbove200,
    isTesting200EMA,
    vcp,
    bbwp,
    high20,
    pivotLevel: high20,
    triggerPrice,
    chaseCap,
    entryLow: entryMin,
    entryHigh: entryMax,
    entryZone: [entryMin, entryMax],
    entryCorridor: {
      min: entryMin,
      max: entryMax,
      label: `Rs. ${entryMin} – ${entryMax}`
    },
    target1,
    target2,
    stopLoss: structuralStopLoss,
    levels: {
      entryZone: { min: entryMin, max: entryMax, label: `Rs. ${entryMin} – ${entryMax}` },
      target1: {
        price: target1,
        pct: +(((target1 - ltp) / ltp) * 100).toFixed(1),
        label: `Rs. ${target1} (+${(((target1 - ltp) / ltp) * 100).toFixed(1)}%)`
      },
      target2: {
        price: target2,
        pct: +(((target2 - ltp) / ltp) * 100).toFixed(1),
        label: `Rs. ${target2} (+${(((target2 - ltp) / ltp) * 100).toFixed(1)}%)`
      },
      stopLoss: {
        price: structuralStopLoss,
        pct: +(((ltp - structuralStopLoss) / ltp) * 100).toFixed(1),
        label: `Rs. ${structuralStopLoss} (-${(((ltp - structuralStopLoss) / ltp) * 100).toFixed(1)}%)`
      }
    },
    rrr1,
    rrr2,
    bayesianEvidence: {
      verified: analogWinRate !== null && analogWinRate >= 55 && analogSampleSize >= 4,
      winRate: analogWinRate,
      sampleSize: analogSampleSize,
      label: analogWinRate !== null
        ? `${analogWinRate}% win rate (N=${analogSampleSize})`
        : 'Sufficient history pending'
    },
    brokerMetrics: {
      adRatio,
      lbas,
      signal: broker.adSignal || 'Neutral',
      label: isBrokerAccumulating ? 'Strong Institutional Absorption' : isBrokerDumping ? 'Institutional Dumping' : 'Balanced Flow'
    },
    catalyst: actionState === 'COILED_PRE_BREAKOUT'
      ? `Coiled Base ${distToPivotPct}% Below Rs. ${high20} Pivot (${vcp.label || 'VCP'})`
      : actionState === 'ACTIVE_BREAKOUT'
      ? `Breakout Clearing Rs. ${high20} with RVOL ${rvol}x`
      : `Structural Base Support above 50-day EMA (Rs. ${ema50.toFixed(1)})`
  };
}

/**
 * Selects the unified #1 Prime Pick across the entire NEPSE universe.
 * Used by BOTH Dashboard and PredictorHub to ensure complete synchronization.
 */
export function selectMasterPrimePick(stocks = [], priceHistories = {}, brokerDataMap = {}, options = {}) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return {
      primeDailyPick: null,
      activeBreakouts: [],
      nextBreakouts: [],
      cashDefenseActive: false,
      breadthCheck: { breadth50: 50, cashDefenseActive: false }
    };
  }

  const breadthCheck = evaluateMarketBreadthCashDefense(stocks);
  const candidates = [];
  const allLiquidCandidates = [];
  const activeBreakouts = [];
  const nextBreakouts = [];

  for (const s of stocks) {
    const sym = String(s.symbol || s.scrip || '').toUpperCase().trim();
    if (!sym) continue;

    const ltp = Number(s.ltp || s.price || 0);
    const vol = Number(s.volume || s.totalTradedQuantity || 0);
    const turnover = Number(s.turnover || (ltp * vol) || 0);
    const cachedFund = getCachedStockFundamentals(sym);
    const eps = Number(cachedFund?.eps !== undefined && cachedFund?.eps !== null ? cachedFund.eps : (s.eps || 0));

    // Fundamental & Liquidity safety hurdles
    if (ltp < 80 || turnover < 2500000) continue;
    if (eps < 0 || (cachedFund?.eps !== undefined && Number(cachedFund.eps) < 0)) continue; // Disqualify loss-making entities

    // Circuit limit ceiling check (±15% limit)
    const prevClose = Number(s.previousClose || s.prevClose || ltp);
    const upperCeiling = +(prevClose * 1.15).toFixed(1);
    const distToCeilingPct = prevClose > 0 ? +(((upperCeiling - ltp) / prevClose) * 100).toFixed(2) : 15;
    if (distToCeilingPct <= 3.5) continue; // Upside exhausted / circuit trap (raised from 2.0 — GAP-4b)

    // Promoter lock-in expiry blackout (60 days — synced with PromoterSharesService Critical Shock tier — GAP-5b)
    if (s.lockinExpiry || s.promoterLockinDays !== undefined) {
      const daysToUnlock = s.promoterLockinDays !== undefined
        ? Number(s.promoterLockinDays)
        : Math.ceil((new Date(s.lockinExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToUnlock >= 0 && daysToUnlock <= 60) continue;
    }

    const history = priceHistories[sym] || [];
    const broker = brokerDataMap[sym] || {};

    const evalResult = evaluateGuruMasterSetup(s, history, broker);

    if (evalResult.actionState === 'ACTIVE_BREAKOUT') {
      activeBreakouts.push(evalResult);
    } else if (evalResult.actionState === 'COILED_PRE_BREAKOUT') {
      nextBreakouts.push(evalResult);
    }

    // Candidate for Prime Pick: collect candidates across market; Cash Defense will determine whether to issue a breakout or fallback
    if (evalResult.isPrimeCandidate) {
      allLiquidCandidates.push(evalResult);
      if (evalResult.guruScore >= 75) {
        candidates.push(evalResult);
      }
    }
  }

  // If no candidate scored >= 75 (e.g. cold start with unpopulated price history cache or bear session),
  // promote top liquid momentum leaders as candidates
  if (candidates.length === 0 && allLiquidCandidates.length > 0) {
    allLiquidCandidates.sort((a, b) => {
      const aTurnover = Number(a.turnover || 0);
      const bTurnover = Number(b.turnover || 0);
      const aMom = Number(a.pChange || 0);
      const bMom = Number(b.pChange || 0);
      const aLbas = Number(a.brokerMetrics?.lbas || 0);
      const bLbas = Number(b.brokerMetrics?.lbas || 0);
      return (bTurnover * (bMom > 0 ? 1.5 : 0.8) + bLbas * 50000000) - (aTurnover * (aMom > 0 ? 1.5 : 0.8) + aLbas * 50000000);
    });
    const safeCandidates = allLiquidCandidates.filter(c =>
      c.isPrimeCandidate &&
      c.actionState !== 'NEGATIVE_EARNINGS_AVOID' &&
      c.actionState !== 'DISTRIBUTION_AVOID' &&
      c.actionState !== 'RESISTANCE_TRAP' &&
      c.actionState !== 'EXCESSIVE_DOWNSIDE_RISK' &&
      c.actionState !== 'LOW_WIN_RATE_AVOID'
    );
    candidates.push(...safeCandidates.slice(0, 10));
  }

  // Guarantee: if candidates is still empty, promote top liquid relative strength stock from universe
  if (candidates.length === 0 && Array.isArray(stocks) && stocks.length > 0) {
    const sortedUniverse = [...stocks]
      .filter(s => Number(s.ltp || s.price || 0) >= 60)
      .sort((a, b) => {
        const aT = Number(a.turnover || (Number(a.ltp || 0) * Number(a.volume || 0)) || 0);
        const bT = Number(b.turnover || (Number(b.ltp || 0) * Number(b.volume || 0)) || 0);
        const aP = Number(a.pChange || 0);
        const bP = Number(b.pChange || 0);
        return (bT * (bP > 0 ? 1.5 : 0.8)) - (aT * (aP > 0 ? 1.5 : 0.8));
      });
    if (sortedUniverse.length > 0) {
      const topS = sortedUniverse[0];
      const topSym = String(topS.symbol || topS.scrip || '').toUpperCase().trim();
      const evalRes = evaluateGuruMasterSetup(topS, priceHistories[topSym] || [], brokerDataMap[topSym] || {});
      candidates.push(evalRes);
    }
  }

  // Sort descending by Guru Score, then broker LBAS
  candidates.sort((a, b) => {
    if (b.guruScore !== a.guruScore) return b.guruScore - a.guruScore;
    return (b.brokerMetrics?.lbas || 0) - (a.brokerMetrics?.lbas || 0);
  });

  activeBreakouts.sort((a, b) => b.guruScore - a.guruScore);
  nextBreakouts.sort((a, b) => b.guruScore - a.guruScore);

  // ── FINAL VERIFICATION: Score candidates using generateEntryExitPlan (the exact Entry/Exit Analyzer engine) ──
  const evaluatePlanWithEntryExitAnalyzer = (cand) => {
    if (!cand) return null;
    const sym = String(cand.symbol || cand.scrip || '').toUpperCase().trim();
    if (!sym) return null;
    const history = priceHistories[sym] || [];
    const broker = brokerDataMap[sym] || null;
    const stockObj = stocks.find(s => String(s.symbol || s.scrip || '').toUpperCase().trim() === sym) || cand;

    if (!history || history.length < 20) return null;

    try {
      const cachedFundForCatalyst = getCachedStockFundamentals(sym) || {};
      const catalysts = {
        highDividend: cachedFundForCatalyst.dividendYield > 5 || cachedFundForCatalyst.proposedDividend > 10,
        strongProfitGrowth: cachedFundForCatalyst.epsGrowth > 20 || (cachedFundForCatalyst.eps > 25 && cachedFundForCatalyst.pe < 15),
        rightShare: cachedFundForCatalyst.hasRightShare || false
      };
      const plan = generateEntryExitPlan(stockObj, history, [], { brokerAnalysis: broker, catalysts });
      if (!plan || !plan.supported) return null;

      const vUpper = String(plan.verdict || '').toUpperCase();
      const winRate = Number(plan.analogResult?.stats?.winRate ?? 50);
      const analogSampleSize = Number(plan.analogResult?.stats?.sampleSize ?? 0);
      const slPrice = Number(plan.levels?.stopLoss?.price || 0);
      const ltpNum = Number(plan.ltp || cand.ltp || stockObj.ltp || 0);
      const riskPct = ltpNum > 0 && slPrice > 0 ? (ltpNum - slPrice) / ltpNum : 0;
      const t1Net = Number(plan.levels?.target1?.netReturnPct ?? 5);
      const rrr1 = Number(plan.levels?.rrr1 ?? 1.5);
      const lbas = Number(cand.brokerMetrics?.lbas || 0);
      const setupScore = Number(plan.setupScore || 70);

      // MANDATORY DISQUALIFICATIONS:
      // A stock CANNOT be chosen as Day Prime Pick under ANY circumstances if:
      // 1. Verdict is NO TRADE, AVOID, REDUCE, EXIT, or STAY OUT
      // 2. Institutional brokers are dumping inventory (smart money selling into retail)
      // 3. Risk gate triggered circuit trap or operating loss
      // 4. Entry zone is invalid (eLow <= 0 or eHigh <= 0)
      // 5. Setup score < 52
      const isDisqualified = 
        vUpper.includes('NO TRADE') ||
        vUpper.includes('AVOID') ||
        vUpper.includes('REDUCE') ||
        vUpper.includes('EXIT') ||
        vUpper.includes('STAY OUT') ||
        Boolean(plan.riskGate?.isInstitutionalDumping) ||
        Boolean(plan.riskGate?.isCircuitTrap) ||
        Boolean(plan.riskGate?.isLossMaking) ||
        setupScore < 52 ||
        !plan.levels?.entryZone?.min ||
        Number(plan.levels?.entryZone?.min) <= 0;

      if (isDisqualified) {
        return null;
      }

      // Profit Edge: weighted composite of setup quality, net real return after 10% CGT, win rate, and RRR
      const profitEdge = +(
        setupScore * 0.35 +
        t1Net * 2.5 +
        winRate * 0.30 +
        rrr1 * 10 +
        lbas * 15
      ).toFixed(2);

      const eLow = Number(plan.levels.entryZone.min || plan.levels.entryZone.low);
      const eHigh = Number(plan.levels.entryZone.max || plan.levels.entryZone.high);
      const cCap = Number(plan.levels.chaseCap || +(eHigh * 1.025).toFixed(1));
      const t1Price = Number(plan.levels.target1?.price);
      const t2Price = Number(plan.levels.target2?.price);
      const slPriceFinal = Number(plan.levels.stopLoss?.price);

      return {
        ...cand,
        ...plan,
        symbol: sym,
        name: cand.name || stockObj.name || sym,
        sector: cand.sector || stockObj.sector || 'NEPSE',
        ltp: ltpNum,
        pChange: cand.pChange != null ? Number(cand.pChange) : Number(stockObj.pChange || 0),
        turnover: Number(cand.turnover || stockObj.turnover || 0),
        setupScore: plan.setupScore,
        score: plan.setupScore,
        compositeScore: plan.setupScore,
        guruScore: plan.setupScore,
        profitEdge,
        winRate: plan.analogResult?.stats?.winRate,
        analogCount: plan.analogResult?.stats?.sampleSize,
        confidenceLevel: plan.confidence?.level,
        signalAgreement: plan.signalAgreement,
        bullishFactors: plan.bullishFactors,
        warnings: plan.warnings,
        verdict: plan.verdict,
        levels: plan.levels,
        entryLow: eLow,
        entryHigh: eHigh,
        chaseCap: cCap,
        target1: t1Price,
        target2: t2Price,
        stopLoss: slPriceFinal,
        isPlanVerified: true,
        riskGate: plan.riskGate
      };
    } catch (_) {
      return null;
    }
  };

  let verifiedPrimePick = null;
  const candidatePool = candidates.length > 0 ? candidates : allLiquidCandidates;
  const validatedPlans = [];

  // Tier 1: Check priority candidates (first 15)
  for (const cand of candidatePool.slice(0, 15)) {
    const verified = evaluatePlanWithEntryExitAnalyzer(cand);
    if (verified) {
      validatedPlans.push(verified);
    }
  }

  if (validatedPlans.length > 0) {
    validatedPlans.sort((a, b) => b.profitEdge - a.profitEdge);
    verifiedPrimePick = validatedPlans[0];
  }

  // Tier 2: If none in top 15 passed, scan next batch up to 35 candidates
  if (!verifiedPrimePick && candidatePool.length > 15) {
    for (const cand of candidatePool.slice(15, 35)) {
      const verified = evaluatePlanWithEntryExitAnalyzer(cand);
      if (verified) {
        verifiedPrimePick = verified;
        break;
      }
    }
  }

  // Tier 3: Cached plan fallback — ONLY if cached plan strictly passes with non-avoid verdict
  if (!verifiedPrimePick) {
    const isPassingPlan = (plan) => {
      if (!plan || !plan.symbol || !plan.levels) return false;
      const v = String(plan.verdict || '').toUpperCase();
      const score = Number(plan.setupScore || plan.guruScore || plan.score || 0);
      return (
        !v.includes('NO TRADE') &&
        !v.includes('AVOID') &&
        !v.includes('REDUCE') &&
        !v.includes('EXIT') &&
        !v.includes('STAY OUT') &&
        !plan.isLossMaking &&
        !plan.riskGate?.isInstitutionalDumping &&
        (plan.eps === undefined || plan.eps === null || Number(plan.eps) >= 0) &&
        score >= 52 &&
        Number(plan.levels?.entryZone?.min || 0) > 0
      );
    };

    if (options?.cachedPrimePick?.symbol && isPassingPlan(options.cachedPrimePick)) {
      verifiedPrimePick = options.cachedPrimePick;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('prime_pick_plan_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.plan && isPassingPlan(parsed.plan)) {
            verifiedPrimePick = parsed.plan;
          } else if (parsed) {
            // Stale or failing plan — purge it so it never surfaces
            localStorage.removeItem('prime_pick_plan_cache');
          }
        }
      } catch (_) {}
    }
  }

  // If breadthCheck.cashDefenseActive is true and we found a verified stock:
  if (verifiedPrimePick && breadthCheck.cashDefenseActive) {
    verifiedPrimePick.isDefensiveFallback = true;
    verifiedPrimePick.warnings = [
      ...(verifiedPrimePick.warnings || []),
      'Cash Defense Active: Market breadth is below safe threshold',
      'Strict capital preservation: Consider conservative sizing (0.5x)'
    ];
  }

  // Cache verified winner in localStorage so Entry/Exit & Stock Details load instantly
  if (verifiedPrimePick) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('prime_pick_plan_cache', JSON.stringify({
          symbol: verifiedPrimePick.symbol,
          plan: verifiedPrimePick,
          ts: Date.now()
        }));
      }
    } catch (_) {}
  }



  const marketStatus = getDetailedMarketStatus();
  const isPostMarket = marketStatus.session === 'POST_MARKET' || marketStatus.session === 'POST_CLOSE_RECONCILING' || !marketStatus.isOpen;
  
  let primeDailyPick = verifiedPrimePick ? { ...verifiedPrimePick } : null;
  if (primeDailyPick) {
    primeDailyPick.sessionContext = marketStatus.session;
    primeDailyPick.isPostMarketVerified = isPostMarket;
    primeDailyPick.marketStatusLabel = marketStatus.statusLabel;
    if (isPostMarket) {
      primeDailyPick.postMarketLabel = "Tomorrow's Prime Opportunity (Sealed Post-3:15 Floorsheet + 500-Day Analogs)";
    }
  }

  return {
    primeDailyPick,
    activeBreakouts: activeBreakouts.slice(0, 12),
    nextBreakouts: nextBreakouts.slice(0, 12),
    breadthCheck,
    cashDefenseActive: breadthCheck.cashDefenseActive,
    marketStatus
  };
}

export { evaluatePreOpenExecutionGate };
