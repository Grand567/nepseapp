/**
 * marketContextSignals.js
 * Comprehensive Quantitative Market Context & Event Analysis Engine
 *
 * Implements exact mathematical formulas and NEPSE institutional rules for:
 * 1. NEPSE Index Trend & Regime (EMA 20/50/200 Stack, Multiplier & Posture)
 * 2. Sector Rotation & Relative Strength (RS vs NEPSE, Turnover Share %, Rotation Quadrants)
 * 3. Market Turnover & Breadth Dynamics (Turnover vs 20d SMA, Advance-Decline, Net Breadth, Breadth Divergence)
 * 4. Corporate Events & Dividend Traps (Book Closure Urgency, Pre-Closure Run-up Zone, Right Share Dilution)
 * 5. SEBON IPO/FPO Pipeline Supply Overhang (Pending sector shares & capital absorption)
 * 6. Composite Market Context Confluence (0-100 score & systemic market posture)
 */

import { parseDividendDate, extractBookClosureDate, classifyClosureUrgency, findUpcomingBookClosure } from '../bookClosureTracker.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 1. NEPSE INDEX TREND & REGIME EVALUATION
 * Determines the systemic market trend using exponential moving averages.
 */
export function evaluateNepseIndexTrend({
  nepseLtp = 0,
  nepseEma20 = 0,
  nepseEma50 = 0,
  nepseEma200 = null,
  nepseChangePct = 0
} = {}) {
  const ltp = Number(nepseLtp || 0);
  const ema20 = Number(nepseEma20 || 0);
  const ema50 = Number(nepseEma50 || 0);
  const ema200 = nepseEma200 !== null && nepseEma200 !== undefined ? Number(nepseEma200) : null;
  const changePct = Number(nepseChangePct || 0);

  if (ltp <= 0 || ema20 <= 0 || ema50 <= 0) {
    return {
      regime: 'INSUFFICIENT_INDEX_DATA',
      isBullish: false,
      isBearish: false,
      regimeMultiplier: 0.5,
      score: 50,
      weaknesses: ['UNVERIFIED: Incomplete NEPSE index price or EMA history.']
    };
  }

  let regime = 'SIDEWAYS_CONSOLIDATION';
  let isBullish = false;
  let isBearish = false;
  let regimeMultiplier = 0.5;
  let score = 50;
  const weaknesses = [];

  const isEmaBullishStack = ema20 > ema50;
  const isEmaBearishStack = ema20 < ema50;

  if (ltp >= ema20 && isEmaBullishStack) {
    regime = 'BULLISH_TREND';
    isBullish = true;
    regimeMultiplier = 1.0;
    score = 90;
    if (ema200 && ltp > ema200) score = 100;
  } else if (ltp < ema20 && ltp >= ema50 && isEmaBullishStack) {
    regime = 'PULLBACK_IN_BULL';
    isBullish = true;
    regimeMultiplier = 0.75;
    score = 70;
    weaknesses.push('Index pulling back below 20 EMA in an established bull trend. Exercise caution on breakout buys.');
  } else if (ltp <= ema20 && isEmaBearishStack) {
    regime = 'BEARISH_TREND';
    isBearish = true;
    regimeMultiplier = 0.25;
    score = 20;
    weaknesses.push('🚨 NEPSE Index is in an established Bearish Trend (Price < 20 EMA < 50 EMA). Long positions face high systemic risk.');
  } else if (ltp > ema20 && isEmaBearishStack) {
    regime = 'RALLY_IN_BEAR';
    isBearish = true;
    regimeMultiplier = 0.4;
    score = 40;
    weaknesses.push('Counter-trend relief rally in a bear market structure. High probability of resistance rejection at 50 EMA.');
  }

  return {
    nepseLtp: ltp,
    nepseEma20: ema20,
    nepseEma50: ema50,
    nepseEma200: ema200,
    nepseChangePct: changePct,
    regime,
    isBullish,
    isBearish,
    regimeMultiplier,
    score,
    weaknesses
  };
}

/**
 * 2. SECTOR ROTATION & RELATIVE STRENGTH
 * Compares sector performance against NEPSE composite and calculates liquidity share.
 */
export function evaluateSectorRotation({
  sector = '',
  sectorChangePct = 0,
  nepseChangePct = 0,
  sectorTurnover = 0,
  totalMarketTurnover = 0
} = {}) {
  const secChg = Number(sectorChangePct || 0);
  const nepseChg = Number(nepseChangePct || 0);
  const secTurnover = Number(sectorTurnover || 0);
  const totalTurnover = Number(totalMarketTurnover || 0);

  const relativeStrengthPct = Number((secChg - nepseChg).toFixed(2));
  const turnoverSharePct = totalTurnover > 0 ? Number(((secTurnover / totalTurnover) * 100).toFixed(2)) : 0;

  let rotationStage = 'LAGGING';
  let isLeading = false;
  let isLagging = false;
  let score = 50;
  const weaknesses = [];

  const isOutperforming = relativeStrengthPct > 0;
  const isHighTurnover = turnoverSharePct >= 15.0; // Capturing >= 15% of daily exchange turnover

  if (isOutperforming && isHighTurnover) {
    rotationStage = 'LEADING';
    isLeading = true;
    score = 90;
  } else if (isOutperforming && !isHighTurnover) {
    rotationStage = 'IMPROVING';
    isLeading = true;
    score = 75;
  } else if (!isOutperforming && isHighTurnover) {
    rotationStage = 'WEAKENING';
    score = 40;
    weaknesses.push(`Sector capturing high turnover (${turnoverSharePct}%) but underperforming NEPSE (RS ${relativeStrengthPct}%): Institutional distribution / churn.`);
  } else {
    rotationStage = 'LAGGING';
    isLagging = true;
    score = 25;
    weaknesses.push(`Sector lagging market (RS ${relativeStrengthPct}%) with low turnover share (${turnoverSharePct}%): Low institutional interest.`);
  }

  return {
    sector: sector || 'Unknown',
    relativeStrengthPct,
    turnoverSharePct,
    rotationStage,
    isLeading,
    isLagging,
    score,
    weaknesses
  };
}

/**
 * 3. MARKET TURNOVER & ADVANCE-DECLINE BREADTH
 * Identifies liquidity expansion/drought and internal market breadth divergence.
 */
export function evaluateMarketTurnoverAndBreadth({
  totalTurnover = 0,
  avg20dTurnover = 0,
  advancers = 0,
  decliners = 0,
  unchanged = 0,
  nepseChangePct = 0
} = {}) {
  const turnover = Number(totalTurnover || 0);
  const avgTurnover = Number(avg20dTurnover || 0);
  const adv = Number(advancers || 0);
  const dec = Number(decliners || 0);
  const unc = Number(unchanged || 0);
  const nepseChg = Number(nepseChangePct || 0);

  const turnoverRatio = avgTurnover > 0 ? Number((turnover / avgTurnover).toFixed(2)) : 1.0;
  const totalTraded = adv + dec + unc;
  const adRatio = dec > 0 ? Number((adv / dec).toFixed(2)) : (adv > 0 ? 5.0 : 1.0);
  const netBreadthPct = totalTraded > 0 ? Number((((adv - dec) / totalTraded) * 100).toFixed(2)) : 0;

  let turnoverRegime = 'NORMAL';
  if (turnoverRatio >= 1.3) turnoverRegime = 'EXPANDING';
  else if (turnoverRatio <= 0.75) turnoverRegime = 'DROUGHT';

  let breadthRegime = 'BALANCED';
  if (adRatio >= 1.8 || netBreadthPct >= 30) breadthRegime = 'BROAD_EXPANSION';
  else if (adRatio <= 0.6 || netBreadthPct <= -30) breadthRegime = 'BROAD_DECLINE';

  const isBreadthDivergence = nepseChg > 0.25 && (adRatio < 0.85 || netBreadthPct < -10);

  const weaknesses = [];
  let score = 50;

  if (turnoverRegime === 'EXPANDING') score += 15;
  else if (turnoverRegime === 'DROUGHT') {
    score -= 15;
    weaknesses.push(`Low market turnover (${turnoverRatio}x 20d avg): Liquidity drought increases exit slippage.`);
  }

  if (breadthRegime === 'BROAD_EXPANSION') score += 20;
  else if (breadthRegime === 'BROAD_DECLINE') {
    score -= 20;
    weaknesses.push(`Weak market breadth (A/D ratio ${adRatio}, Net breadth ${netBreadthPct}%): Widespread selling across scrips.`);
  }

  if (isBreadthDivergence) {
    score -= 25;
    weaknesses.push(`🚨 BREADTH DIVERGENCE: NEPSE index is up (+${nepseChg}%) but decliners exceed advancers (A/D ${adRatio}). Index supported by narrow heavyweight manipulation.`);
  }

  return {
    totalTurnover: turnover,
    avg20dTurnover: avgTurnover,
    turnoverRatio,
    turnoverRegime,
    advancers: adv,
    decliners: dec,
    unchanged: unc,
    adRatio,
    netBreadthPct,
    breadthRegime,
    isBreadthDivergence,
    score: Math.max(0, Math.min(100, score)),
    weaknesses
  };
}

/**
 * 4. CORPORATE EVENTS & DIVIDEND TRAP EVALUATION
 * Tracks Book Closure proximity, pre-closure run-up zone, and right share dilution overhang.
 */
export function evaluateCorporateEventImpact({
  symbol = '',
  dividends = [],
  bookClosureDate = null,
  rightRatio = 0,
  latestBonus = 0,
  latestCash = 0,
  agmDate = null
} = {}) {
  let targetClosure = null;

  if (bookClosureDate) {
    targetClosure = parseDividendDate(bookClosureDate);
  } else if (Array.isArray(dividends) && dividends.length > 0) {
    const upcoming = findUpcomingBookClosure(dividends, 60);
    if (upcoming) targetClosure = upcoming._closureDate || extractBookClosureDate(upcoming);
  }

  const now = Date.now();
  let daysToClosure = null;
  let urgency = 'NONE';
  let isDividendTrapZone = false;
  let isPreClosureRunupZone = false;
  const weaknesses = [];

  if (targetClosure && !isNaN(targetClosure.getTime())) {
    daysToClosure = Math.ceil((targetClosure.getTime() - now) / DAY_MS);
    const urgObj = classifyClosureUrgency(targetClosure);
    urgency = urgObj.label;

    if (daysToClosure >= 0 && daysToClosure <= 5) {
      isDividendTrapZone = true;
      weaknesses.push(`🚨 DIVIDEND TRAP WARNING: Book closure is ${daysToClosure} session(s) away (${targetClosure.toISOString().slice(0, 10)}). High probability of institutional pre-closure dump and post-ex dividend discount.`);
    } else if (daysToClosure > 5 && daysToClosure <= 21) {
      isPreClosureRunupZone = true;
    }
  }

  const numRight = Number(rightRatio || 0);
  const hasRightOverhang = numRight > 0;
  if (hasRightOverhang) {
    weaknesses.push(`⚠️ RIGHT SHARE DILUTION: Pending ${numRight > 1 ? (numRight * 100) : numRight}% right share offering creates supply overhang and investor cash calls.`);
  }

  let eventRiskLevel = 'LOW';
  let score = 80;

  if (isDividendTrapZone) {
    eventRiskLevel = 'HIGH';
    score = 20;
  } else if (hasRightOverhang) {
    eventRiskLevel = 'MODERATE';
    score = 50;
  } else if (isPreClosureRunupZone) {
    eventRiskLevel = 'MODERATE';
    score = 75; // Favorable momentum zone if entered early
  }

  return {
    symbol: String(symbol || '').toUpperCase().trim(),
    bookClosureDate: targetClosure ? targetClosure.toISOString().slice(0, 10) : null,
    daysToClosure,
    urgency,
    isDividendTrapZone,
    isPreClosureRunupZone,
    hasRightOverhang,
    rightRatio: numRight,
    latestBonus: Number(latestBonus || 0),
    latestCash: Number(latestCash || 0),
    agmDate: agmDate ? String(agmDate) : null,
    eventRiskLevel,
    score,
    weaknesses
  };
}

/**
 * 5. SEBON IPO/FPO SUPPLY OVERHANG EVALUATION
 * Computes pending share supply queued in the SEBON approval pipeline for this stock's sector.
 */
export function evaluateIpoFpoSupplyImpact({
  sector = '',
  pipelineListings = []
} = {}) {
  const secName = String(sector || '').toLowerCase().trim();
  const listings = Array.isArray(pipelineListings) ? pipelineListings : [];

  const sectorMatches = listings.filter(item => {
    const itemSec = String(item.sector || '').toLowerCase().trim();
    if (!itemSec || !secName) return false;
    return itemSec.includes(secName) || secName.includes(itemSec);
  });

  const sectorPendingIssuesCount = sectorMatches.length;
  const sectorPendingUnits = sectorMatches.reduce((acc, curr) => acc + Number(curr.units || 0), 0);
  const sectorPendingAmountNpr = sectorMatches.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  // Supply Overhang threshold: >= 15 Million pending units queued in sector
  const isHighSupplyOverhang = sectorPendingUnits >= 15000000;
  const weaknesses = [];

  let supplyOverhangStatus = 'NORMAL_SUPPLY';
  let score = 80;

  if (isHighSupplyOverhang) {
    supplyOverhangStatus = 'HIGH_SUPPLY_OVERHANG';
    score = 45;
    weaknesses.push(`Sector Supply Overhang: ${sectorPendingIssuesCount} pending issues queued in SEBON (${(sectorPendingUnits / 1000000).toFixed(1)}M shares / Rs. ${(sectorPendingAmountNpr / 100000000).toFixed(1)} Cr) absorbing retail liquidity.`);
  }

  return {
    sector: sector || 'Unknown',
    sectorPendingIssuesCount,
    sectorPendingUnits,
    sectorPendingAmountNpr,
    supplyOverhangStatus,
    isHighSupplyOverhang,
    score,
    weaknesses
  };
}

/**
 * 6. COMPOSITE MARKET CONTEXT & EVENT CONFLUENCE
 * Synthesizes all macro and event signals into a 0-100 score and strategic market posture.
 */
export function evaluateMarketContextConfluence({
  symbol = '',
  sector = '',
  nepseTrend = {},
  sectorRotation = {},
  turnoverBreadth = {},
  corporateEvents = {},
  ipoSupply = {}
} = {}) {
  // Extract individual component scores (defaulting to neutral 50)
  const trendScore = Number(nepseTrend?.score ?? 50);
  const rotScore = Number(sectorRotation?.score ?? 50);
  const breadthScore = Number(turnoverBreadth?.score ?? 50);
  const eventScore = Number(corporateEvents?.score ?? 70);
  const ipoScore = Number(ipoSupply?.score ?? 75);

  // Transparent Weighted Macro Model:
  // - NEPSE Index Trend: 30%
  // - Sector Relative Strength: 25%
  // - Turnover & Breadth Dynamics: 25%
  // - Corporate Events (Trap Safety): 10%
  // - Sector Pipeline Supply: 10%
  const compositeScore = Math.max(0, Math.min(100, Math.round(
    trendScore * 0.30 +
    rotScore * 0.25 +
    breadthScore * 0.25 +
    eventScore * 0.10 +
    ipoScore * 0.10
  )));

  let marketPosture = 'SELECTIVE_STOCK_PICKING';
  if (corporateEvents?.isDividendTrapZone || nepseTrend?.regime === 'BEARISH_TREND') {
    marketPosture = 'HIGH_RISK_HEADWIND';
  } else if (compositeScore >= 75) {
    marketPosture = 'FAVORABLE_TAILWIND';
  } else if (compositeScore >= 50) {
    marketPosture = 'SELECTIVE_STOCK_PICKING';
  } else if (compositeScore >= 35) {
    marketPosture = 'DEFENSIVE_POSTURE';
  } else {
    marketPosture = 'HIGH_RISK_HEADWIND';
  }

  const allWeaknesses = [
    ...(nepseTrend?.weaknesses || []),
    ...(sectorRotation?.weaknesses || []),
    ...(turnoverBreadth?.weaknesses || []),
    ...(corporateEvents?.weaknesses || []),
    ...(ipoSupply?.weaknesses || [])
  ];

  return {
    symbol: String(symbol || '').toUpperCase().trim(),
    sector: sector || 'Unknown',
    compositeScore,
    marketPosture,
    signals: {
      nepseTrend,
      sectorRotation,
      turnoverBreadth,
      corporateEvents,
      ipoSupply
    },
    weaknesses: Array.from(new Set(allWeaknesses))
  };
}
