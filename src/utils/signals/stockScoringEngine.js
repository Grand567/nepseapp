/**
 * stockScoringEngine.js
 * Comprehensive Quantitative Scoring, Hard Filtering, & Selection Engine
 *
 * Implements:
 * 1. Transparent 4-Engine Composite Scoring Model (Broker, Tech, Fund, Market)
 * 2. Multi-Engine Confluence & Agreement Confidence Scoring
 * 3. Zero-Tolerance Hard Filtering:
 *    - Liquidity thresholds (Turnover >= 20L, Volume >= 5k kitta)
 *    - Circuit band lock protection (±15% circuit limits)
 *    - BFI regulatory asset safety gates (NPL <= 5%, CAR >= 11%)
 *    - Cornering & manipulation risk filters
 *    - Corporate event & dividend trap safety
 *    - Single-stock and sector exposure caps
 * 4. Action Decision: BUY / WATCH / AVOID
 * 5. Execution Plan Generation:
 *    - Entry Zone [Min, Max]
 *    - Clamped Stop-Loss (within -15% circuit floor)
 *    - Clamped Profit Targets (T1 = 1.5R, T2 = 2.5R within +15% ceiling)
 *    - Risk-Reward Ratio
 *    - Safe Position Sizing (Fixed 1.5% risk, 15% capital cap, 5% volume liquidity clamp)
 */

import { SCORING_CONFIG } from './scoringConfig.js';

export function evaluateStockSelection({
  stock = {},
  brokerSignals = null,
  technicalSignals = null,
  fundamentalSignals = null,
  marketSignals = null,
  portfolioContext = {},
  customConfig = null
} = {}) {
  const config = customConfig || SCORING_CONFIG;
  const weights = config.weights;
  const hardFilters = config.hardFilters;
  const execution = config.execution;

  const symbol = String(stock.symbol || '').toUpperCase().trim();
  const sector = stock.sector || 'Unknown';
  const ltp = Number(stock.ltp || stock.marketPrice || stock.closePrice || 0);
  const prevClose = Number(stock.prevClose || stock.previousClose || ltp);
  const volume = Number(stock.volume || stock.totalTradedQuantity || 0);
  const turnover = Number(stock.turnover || stock.totalTradedValue || (ltp * volume));
  const eps = (stock.eps !== null && stock.eps !== undefined && !isNaN(stock.eps)) ? Number(stock.eps) : null;
  const npl = stock.npl !== null && stock.npl !== undefined ? Number(stock.npl) : null;
  const car = stock.car !== null && stock.car !== undefined ? Number(stock.car) : null;
  const askQty = stock.askQty !== undefined ? Number(stock.askQty) : null;
  const bidQty = stock.bidQty !== undefined ? Number(stock.bidQty) : null;
  const listedShares = Number(stock.listedShares || 0);
  const publicPercentage = Number(stock.publicPercentage || 0);
  const freeFloat = listedShares > 0 && publicPercentage > 0
    ? Math.round(listedShares * (publicPercentage / 100))
    : null;

  // NEPSE ±15% Circuit Band Bounds (Nepal Securities Trading Fourth Amendment 2082)
  const circuitCeiling = Number((prevClose * (1 + hardFilters.nepseCircuitBandPct / 100)).toFixed(1));
  const circuitFloor = Number((prevClose * (1 - hardFilters.nepseCircuitBandPct / 100)).toFixed(1));

  // ── STEP 1: HARD FILTER EVALUATION (Zero-Tolerance Gates) ───────────────────
  const rejectionReasons = [];
  const hardFilterResults = {
    passedAll: true,
    liquidityPassed: true,
    circuitPassed: true,
    regulatoryPassed: true,
    eventPassed: true,
    exposurePassed: true,
    flags: []
  };

  // 1. Minimum Liquidity Gate
  if (turnover < hardFilters.minDailyTurnoverNpr || volume < hardFilters.minDailyVolumeKitta) {
    hardFilterResults.liquidityPassed = false;
    hardFilterResults.passedAll = false;
    const msg = `Thin Liquidity Trap: Turnover Rs. ${(turnover / 100000).toFixed(1)}L (min Rs. ${(hardFilters.minDailyTurnoverNpr / 100000).toFixed(0)}L) or Volume ${volume.toLocaleString()} kitta (min ${hardFilters.minDailyVolumeKitta.toLocaleString()}). High execution slippage risk.`;
    rejectionReasons.push(msg);
    hardFilterResults.flags.push('FAIL_MIN_LIQUIDITY');
  }

  // 2. Circuit Band Lock Gates
  const isCeilingLocked = (ltp >= circuitCeiling * 0.995) || (askQty !== null && askQty === 0 && ltp >= prevClose * 1.09);
  const isFloorLocked = (ltp <= circuitFloor * 1.005) || (bidQty !== null && bidQty === 0 && ltp <= prevClose * 0.91);

  if (hardFilters.excludeCircuitCeilingLocked && isCeilingLocked) {
    hardFilterResults.circuitPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Circuit Ceiling Locked (+15% at Rs. ${circuitCeiling}): Zero ask liquidity; cannot execute without chasing or market gap risk.`);
    hardFilterResults.flags.push('FAIL_CIRCUIT_CEILING_LOCKED');
  }

  if (hardFilters.excludeCircuitFloorLocked && isFloorLocked) {
    hardFilterResults.circuitPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Circuit Floor Locked (-15% at Rs. ${circuitFloor}): Scrip in panic limit-down cascade; unexecuted sell orders.`);
    hardFilterResults.flags.push('FAIL_CIRCUIT_FLOOR_LOCKED');
  }

  // 3. Fundamental & Regulatory Gates
  if (hardFilters.excludeLossMaking && eps !== null && eps <= 0) {
    hardFilterResults.regulatoryPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Loss-Making Scrip (EPS: Rs. ${eps}): Fundamental earnings filter rejects negative or zero earnings.`);
    hardFilterResults.flags.push('FAIL_LOSS_MAKING');
  }

  const isBfi = ['commercial_bank', 'development_bank', 'finance', 'microfinance'].some(k =>
    sector.toLowerCase().replace(/[\s_]+/g, '').includes(k.replace(/[\s_]+/g, ''))
  );

  if (isBfi && npl !== null && npl > hardFilters.maxBfiNplPct) {
    hardFilterResults.regulatoryPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`NRB Asset Quality Breach: NPL (${npl.toFixed(2)}%) exceeds regulatory 5.0% ceiling.`);
    hardFilterResults.flags.push('FAIL_BFI_NPL_CEILING');
  }

  if (sector.toLowerCase().includes('commercial') && car !== null && car < hardFilters.minCommercialBankCarPct) {
    hardFilterResults.regulatoryPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`NRB Capital Adequacy Breach: CAR (${car.toFixed(1)}%) is below 11.0% statutory minimum.`);
    hardFilterResults.flags.push('FAIL_COMMERCIAL_CAR_BREACH');
  }

  // 4. Corporate Event & Cornering Safety Gates
  if (marketSignals?.signals?.corporateEvents?.isDividendTrapZone) {
    hardFilterResults.eventPassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Dividend Trap: Book closure in ${marketSignals.signals.corporateEvents.daysToClosure} days. High institutional dump risk.`);
    hardFilterResults.flags.push('FAIL_DIVIDEND_TRAP');
  }

  if (freeFloat !== null && freeFloat < hardFilters.excludeCorneringFloatKitta && volume > freeFloat * 0.15) {
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Suspected Cornering / Operator Churn: Low public float (${(freeFloat / 1000).toFixed(0)}k shares) with abnormal 1-day turnover.`);
    hardFilterResults.flags.push('FAIL_SUSPECTED_CORNERING');
  }

  // 5. Portfolio Exposure Caps
  const portfolioCapital = Number(portfolioContext.capital || execution.defaultTradingCapitalNpr);
  const currentHoldings = Array.isArray(portfolioContext.currentHoldings) ? portfolioContext.currentHoldings : [];

  const sectorAllocationNpr = currentHoldings
    .filter(h => (h.sector || '').toLowerCase() === sector.toLowerCase())
    .reduce((sum, h) => sum + Number(h.capitalInvested || 0), 0);
  const sectorAllocationPct = portfolioCapital > 0 ? (sectorAllocationNpr / portfolioCapital) * 100 : 0;

  if (sectorAllocationPct >= hardFilters.maxSectorExposurePct) {
    hardFilterResults.exposurePassed = false;
    hardFilterResults.passedAll = false;
    rejectionReasons.push(`Sector Exposure Cap Reached: Portfolio already allocated ${sectorAllocationPct.toFixed(1)}% to ${sector} (cap ${hardFilters.maxSectorExposurePct}%).`);
    hardFilterResults.flags.push('FAIL_SECTOR_EXPOSURE_CAP');
  }

  // ── STEP 2: MULTI-ENGINE COMPOSITE SCORING (WITH PROPORTIONAL RE-NORMALIZATION) ──
  const brokerScore = (brokerSignals && brokerSignals.compositeScore !== null && brokerSignals.compositeScore !== undefined)
    ? Number(brokerSignals.compositeScore)
    : null;
  const techScore = (technicalSignals && technicalSignals.compositeScore !== null && technicalSignals.compositeScore !== undefined)
    ? Number(technicalSignals.compositeScore)
    : null;
  const isDefaultFundamental = Boolean(stock?.isDefaultFundamentals || fundamentalSignals?.isDefault);
  const fundScore = (!isDefaultFundamental && fundamentalSignals && fundamentalSignals.compositeScore !== null && fundamentalSignals.compositeScore !== undefined && fundamentalSignals.status !== 'FUNDAMENTALS_UNAVAILABLE')
    ? Number(fundamentalSignals.compositeScore)
    : null;
  const marketScore = (marketSignals && marketSignals.compositeScore !== null && marketSignals.compositeScore !== undefined)
    ? Number(marketSignals.compositeScore)
    : null;

  // Re-normalize weights proportionally over available pillars (eliminating silent defaults)
  let activeWeightSum = 0;
  if (brokerScore !== null) activeWeightSum += weights.brokerFloorsheet;
  if (techScore !== null) activeWeightSum += weights.technical;
  if (fundScore !== null) activeWeightSum += weights.fundamental;
  if (marketScore !== null) activeWeightSum += weights.marketContext;

  let rawComposite = 50;
  if (activeWeightSum > 0) {
    const weightedSum = (
      (brokerScore !== null ? brokerScore * weights.brokerFloorsheet : 0) +
      (techScore !== null ? techScore * weights.technical : 0) +
      (fundScore !== null ? fundScore * weights.fundamental : 0) +
      (marketScore !== null ? marketScore * weights.marketContext : 0)
    );
    rawComposite = weightedSum / activeWeightSum;
  }

  const compositeScore = Math.max(0, Math.min(100, Math.round(rawComposite)));

  if (fundScore === null) {
    rejectionReasons.push('FUNDAMENTALS UNAVAILABLE: Fundamental score omitted; composite re-normalized over active pillars.');
  }

  // ── STEP 3: CONFLUENCE CONFIDENCE ESTIMATION ────────────────────────────────
  // Evaluates agreement among independent engines and data richness
  let confidence = 50;
  const isBrokerBullish = brokerScore !== null && brokerScore >= 65;
  const isTechBullish = techScore !== null && techScore >= 65;
  const isFundBullish = fundScore !== null && fundScore >= 60;
  const isMarketBullish = marketScore !== null && marketScore >= 60;

  // Bullish confluence boost
  const bullishEnginesCount = [isBrokerBullish, isTechBullish, isFundBullish, isMarketBullish].filter(Boolean).length;
  if (bullishEnginesCount >= 3) confidence += 25;
  else if (bullishEnginesCount === 2) confidence += 10;

  // Divergence penalty: Technical is bullish but top brokers are selling aggressively
  if (techScore !== null && techScore >= 70 && brokerScore !== null && brokerScore <= 35) {
    confidence -= 20;
    rejectionReasons.push('Bearish Divergence: Technical chart looks bullish but Top Brokers are net offloading.');
  }

  // Data completeness check
  if (!brokerSignals || !technicalSignals) confidence -= 15;
  if (fundScore === null) confidence -= 5; // Slight confidence discount when fundamental pillar unavailable

  confidence = Math.max(10, Math.min(100, Math.round(confidence)));

  // ── STEP 4: ACTION CLASSIFICATION (BUY / WATCH / AVOID) ─────────────────────
  let action = 'AVOID';
  if (!hardFilterResults.passedAll) {
    action = 'AVOID';
  } else if (compositeScore >= config.thresholds.buyScore && confidence >= config.thresholds.buyConfidence) {
    action = 'BUY';
  } else if (compositeScore >= config.thresholds.watchScore && confidence >= config.thresholds.watchConfidence) {
    action = 'WATCH';
  } else {
    action = 'AVOID';
  }

  // ── STEP 5: EXECUTION PLAN & POSITION SIZING (Clamped to NEPSE Realities) ────
  let executionPlan = null;

  if (ltp > 0) {
    // 1. Entry Zone
    const entryBuffer = ltp * (execution.entryZoneBufferPct / 100);
    const entryMin = Number((ltp - entryBuffer).toFixed(1));
    const entryMax = Number((ltp + (entryBuffer * 0.5)).toFixed(1));

    // 2. Stop-Loss Calculation (Clamped strictly within -15% NEPSE circuit floor)
    const atrValue = Number(technicalSignals?.signals?.volatility?.atr14 || (ltp * 0.035));
    const stopDistance = Math.max(atrValue * execution.stopLossAtrMultiplier, ltp * 0.03); // Min 3% stop
    let rawStopLoss = ltp - stopDistance;

    // Strict clamp: Stop loss cannot be lower than circuit floor or above entry
    const stopLoss = Number(Math.max(circuitFloor + 1, Math.min(ltp - 1, rawStopLoss)).toFixed(1));
    const riskPerShare = Number((ltp - stopLoss).toFixed(2));
    const riskPct = Number(((riskPerShare / ltp) * 100).toFixed(2));

    // 3. Targets (Clamped strictly within +15% NEPSE circuit ceiling)
    const rawTarget1 = ltp + (riskPerShare * execution.target1RiskMultiplier);
    const rawTarget2 = ltp + (riskPerShare * execution.target2RiskMultiplier);

    const target1 = Number(Math.min(circuitCeiling, rawTarget1).toFixed(1));
    const target2 = Number(Math.min(circuitCeiling, rawTarget2).toFixed(1));

    const reward1 = Number((target1 - ltp).toFixed(2));
    const riskRewardRatio = riskPerShare > 0 ? Number((reward1 / riskPerShare).toFixed(2)) : 0;

    // 4. Position Sizing (Fixed 1.5% Risk Model + Triple Safety Clamps)
    const maxRiskCapitalNpr = portfolioCapital * (execution.maxRiskPerTradePct / 100);
    const theoreticalShares = riskPerShare > 0 ? Math.floor(maxRiskCapitalNpr / riskPerShare) : 0;

    // Clamp A: Single Stock Capital Cap (Max 15% of total portfolio)
    const maxSharesByCapital = Math.floor((portfolioCapital * (hardFilters.maxSingleStockExposurePct / 100)) / ltp);

    // Clamp B: Thin Liquidity Participation Clamp (Max 5% of daily volume to ensure clean exit)
    const maxSharesByVolume = volume > 0 ? Math.floor(volume * (hardFilters.maxLiquidityParticipationPct / 100)) : 100;

    // Select the most conservative limit
    let safeShares = Math.min(theoreticalShares, maxSharesByCapital, maxSharesByVolume);

    // Round down to standard NEPSE lot size (10 kitta)
    safeShares = Math.floor(safeShares / execution.minLotSize) * execution.minLotSize;
    if (safeShares < execution.minLotSize) safeShares = execution.minLotSize;

    const capitalRequiredNpr = Number((safeShares * ltp).toFixed(2));
    const actualRiskNpr = Number((safeShares * riskPerShare).toFixed(2));
    const portfolioCapitalPct = Number(((capitalRequiredNpr / portfolioCapital) * 100).toFixed(2));

    executionPlan = {
      entryLtp: ltp,
      entryZone: [entryMin, entryMax],
      circuitCeiling,
      circuitFloor,
      stopLoss,
      target1,
      target2,
      riskPerShare,
      riskPct,
      riskRewardRatio,
      positionSizing: {
        sharesKitta: safeShares,
        capitalRequiredNpr,
        portfolioCapitalPct,
        maxRiskNpr: actualRiskNpr,
        riskPctOfEquity: Number(((actualRiskNpr / portfolioCapital) * 100).toFixed(2)),
        liquidityVolumeCapKitta: maxSharesByVolume,
        isClampedByVolume: safeShares >= maxSharesByVolume
      }
    };
  }

  // Aggregate all weaknesses
  const allWeaknesses = [
    ...rejectionReasons,
    ...(brokerSignals?.weaknesses || []),
    ...(technicalSignals?.weaknesses || []),
    ...(fundamentalSignals?.weaknesses || []),
    ...(marketSignals?.weaknesses || [])
  ];

  return {
    symbol,
    sector,
    action,
    compositeScore,
    confidence,
    weightsUsed: weights,
    scoreBreakdown: {
      brokerFloorsheet: brokerScore,
      technical: techScore,
      fundamental: fundScore,
      marketContext: marketScore
    },
    fundamentalsAvailable: fundScore !== null,
    fundamentalsStatus: fundScore !== null ? 'AVAILABLE' : 'FUNDAMENTALS UNAVAILABLE',
    hardFilters: hardFilterResults,
    rejectionReasons: Array.from(new Set(rejectionReasons)),
    executionPlan,
    weaknesses: Array.from(new Set(allWeaknesses))
  };
}
