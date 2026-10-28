// proxy/quant/predictorEngine.mjs
//
// Institutional Quantitative Prediction & Scoring Engine for NEPSE & Equities.
// Combines 50/200 EMA structural trend filtering, ATR targets, market-cap weighted breadth,
// rolling 20-day turnover expansion, fiscal liquidity cycle, and scraped news sentiment.
// Strictly enforces the "Hard Trend Ceiling": no bullish breakouts below 50 EMA.

import {
  computeIndexFeatures,
  computeStockFeatures,
  computeRSI,
  computeEMA,
  getMacroFeatures,
  getPoliticalEventFlag,
  extractSafeFeatureVector
} from './featureEngine.mjs';
import { pool } from '../db.mjs';
import { getNewsCache, hasNewsCache } from './newsCache.mjs';
import { isExcludedInstrument } from '../db/signalTrackerStore.js';

export const ROUND_TRIP_FRICTION_HURDLE = 0.0085; // 0.85% statutory round-trip hurdle

/**
 * Computes NRB Monetary Macro Multiplier for equity valuation & breakout conviction.
 * Aligns strictly with NRB statutory IBOR & CD Ratio thresholds:
 * - CRISIS: IBOR > 8.5% or CD Ratio > 89.0%
 * - TIGHTENING: IBOR > 6.5% or CD Ratio > 86.0%
 * - EASING: IBOR < 3.0% and CD Ratio <= 83.5%
 * - NEUTRAL: 3.0% <= IBOR <= 6.5%
 */
export function evaluateNrbMacroMultiplier(nrbMetrics = {}) {
  const cdRatio = Number(nrbMetrics.cdRatio ?? nrbMetrics.cd_ratio_pct ?? 81.5);
  const ibor = Number(
    nrbMetrics.ibor ?? nrbMetrics.interbankRate ?? nrbMetrics.interbank_rate_pct ?? 4.5
  );
  const tbill91d = Number(nrbMetrics.tbill91d ?? nrbMetrics.tbill_91d_pct ?? 4.2);
  const repoRate = Number(
    nrbMetrics.repoRate ?? nrbMetrics.repo_rate_pct ?? nrbMetrics.interest_rate_pct ?? 5.0
  );

  let probabilityMultiplier = 1.0;
  let breakoutConvictionThreshold = 60.0; // baseline 60% probability required
  let valuationDiscountPct = 0.0;
  let regimeLabel = 'NEUTRAL_LIQUIDITY';

  if (ibor > 8.5 || cdRatio > 89.0 || tbill91d > 8.5) {
    // Severe Liquidity Crisis
    probabilityMultiplier = 0.72;
    breakoutConvictionThreshold = 75.0;
    valuationDiscountPct = 18.0;
    regimeLabel = 'CRISIS_LIQUIDITY_CRUNCH';
  } else if (ibor > 6.5 || cdRatio > 86.0 || repoRate > 6.5 || tbill91d > 7.0) {
    // Monetary Tightening
    probabilityMultiplier = 0.85;
    breakoutConvictionThreshold = 68.0;
    valuationDiscountPct = 10.0;
    regimeLabel = 'TIGHTENING_MONETARY_REGIME';
  } else if (ibor < 3.0 && cdRatio <= 83.5 && tbill91d <= 4.0) {
    // Excess Banking Liquidity Expansion (EASING)
    probabilityMultiplier = 1.08;
    breakoutConvictionThreshold = 56.0;
    valuationDiscountPct = 0.0;
    regimeLabel = 'EASING_LIQUIDITY_EXPANSION';
  }

  return {
    regimeLabel,
    cdRatio,
    ibor,
    tbill91d,
    repoRate,
    probabilityMultiplier,
    breakoutConvictionThreshold,
    valuationDiscountPct
  };
}

/**
 * Builds Zero-Lookahead Training & Walk-Forward Evaluation Dataset for horizons 1D, 3D, and 5D.
 * - Features at index `t` use ONLY candles[0 .. t].
 * - Trade Entry occurs at Day `t + 1` OPEN (O_{t+1}).
 * - Trade Exit occurs at Day `t + 1 + h` CLOSE (C_{t+1+h}).
 */
export function buildZeroLookaheadDataset(candles = [], horizonDays = 3) {
  const samples = [];
  const h = Math.max(1, Number(horizonDays || 3));
  if (!Array.isArray(candles) || candles.length < 25 + h) return samples;

  for (let t = 20; t < candles.length - h - 1; t++) {
    const signalCandle = candles[t];
    const entryCandle = candles[t + 1];
    const exitCandle = candles[t + 1 + h];

    const signalClose = Number(signalCandle.close || 0);
    const tPlus1Open = Number(entryCandle.open || entryCandle.close || 0);
    const exitClose = Number(exitCandle.close || 0);

    if (signalClose <= 0 || tPlus1Open <= 0 || exitClose <= 0) continue;

    // Reject unreachable T+1 upper-circuit gap opens (>= +14.9%)
    const overnightGap = (tPlus1Open - signalClose) / signalClose;
    if (overnightGap >= 0.149) continue;

    // Extract features strictly from [0 .. t]
    const featRes = extractSafeFeatureVector(candles, t);
    if (!featRes.isValid) continue;

    // Forward return strictly measured from T+1 Open to T+1+h Close
    const forwardGrossReturn = (exitClose - tPlus1Open) / tPlus1Open;
    const forwardNetReturn = forwardGrossReturn - ROUND_TRIP_FRICTION_HURDLE;

    samples.push({
      signalIndex: t,
      signalDate: signalCandle.date,
      entryDate: entryCandle.date,
      exitDate: exitCandle.date,
      entryPriceTPlus1Open: tPlus1Open,
      exitPrice: exitClose,
      features: featRes.features,
      forwardGrossReturnPct: +(forwardGrossReturn * 100).toFixed(2),
      forwardNetReturnPct: +(forwardNetReturn * 100).toFixed(2),
      labelWin: forwardNetReturn > 0 ? 1 : 0
    });
  }

  return samples;
}

/**
 * Generates 1D, 3D, and 5D directional probabilities with NRB Macro Discounting and Zero Lookahead.
 */
export function predictMultiHorizonProbabilities(candles = [], nrbMetrics = {}, newsScore = 0) {
  const currIdx = candles.length - 1;
  const currentFeatures = extractSafeFeatureVector(candles, currIdx);
  const macro = evaluateNrbMacroMultiplier(nrbMetrics);

  if (!currentFeatures.isValid) {
    return {
      supported: false,
      reason: 'Insufficient trading history (< 5 sessions) for reliable probability inference.',
      macro
    };
  }

  const f = currentFeatures.features;
  // Base log-odds linear combination calibrated for NEPSE momentum & mean-reversion
  const rawScore =
    (f.ema20Dist * 2.2) +
    (f.ema50Dist * 1.5) +
    (f.rsi14Norm * 0.8) +
    ((f.rvol20 - 1.0) * 0.35) -
    (Math.max(0, f.zScore20 - 2.2) * 0.9) + // penalize overextended > 2.2 sigma
    (clampNewsImpact(newsScore) * 0.25);

  const sigmoid = (x) => 1 / (1 + Math.exp(-x));

  const computeHorizon = (hDays, scale) => {
    const baseProb = sigmoid(rawScore * scale) * 100;
    // Apply NRB Macro Liquidity Multiplier & clamp to [15%, 88%]
    const macroAdjustedProb = Math.min(88.0, Math.max(15.0, +(baseProb * macro.probabilityMultiplier).toFixed(1)));
    const isActionableBullish = macroAdjustedProb >= macro.breakoutConvictionThreshold;
    return {
      horizon: `${hDays}D`,
      rawProbabilityPct: +baseProb.toFixed(1),
      probabilityPct: macroAdjustedProb,
      convictionThresholdPct: macro.breakoutConvictionThreshold,
      isActionableBullish,
      signal: isActionableBullish
        ? 'BULLISH_HIGH_CONVICTION'
        : (macroAdjustedProb <= 40.0 ? 'BEARISH_DISTRIBUTION' : 'NEUTRAL_HOLD')
    };
  };

  return {
    supported: true,
    isNewlyListedIpo: currentFeatures.isNewlyListedIpo,
    entryExecutionBasis: 'T+1_OPEN_STRICT',
    macro,
    features: f,
    horizons: {
      '1D': computeHorizon(1, 0.85),
      '3D': computeHorizon(3, 1.00),
      '5D': computeHorizon(5, 1.12)
    }
  };
}

function clampNewsImpact(s) {
  const n = Number(s || 0);
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
}

/**
 * Predicts NEPSE index direction for the upcoming trading session.
 */
export async function predictIndexDirection(options = {}) {
  const features = await computeIndexFeatures(options);
  const date = features.date;
  const memoryHistory = options.memoryHistory || null;

  if (features.status === 'insufficient_history' || !Number.isFinite(Number(features.latest_close)) || Number(features.latest_close) <= 0) {
    return {
      success: false,
      status: 'insufficient_history',
      error: features.error || 'Insufficient authentic NEPSE index history to generate prediction.',
      prediction: null,
      trackRecord: { totalPredictions: 0, evaluatedCount: 0, winRatePct: 0, history: [] }
    };
  }

  // 1. Technical component (-1.0 to +1.0)
  let techScore = 0;

  // RSI-14 momentum sweet spot vs overbought / oversold
  if (features.rsi_14 > 52 && features.rsi_14 < 68) techScore += 0.25;
  else if (features.rsi_14 >= 72) techScore -= 0.25; // overbought risk
  else if (features.rsi_14 < 32) techScore += 0.20; // oversold bounce potential
  else if (features.rsi_14 < 45) techScore -= 0.25;

  // MACD signal
  if (features.macd_signal === 'bullish') techScore += 0.30;
  else if (features.macd_signal === 'bearish') techScore -= 0.30;

  // Structural Moving Averages (50 EMA & 200 EMA)
  if (features.is_above_50_ema === true) techScore += 0.25;
  else if (features.is_above_50_ema === false) techScore -= 0.35; // structural headwind

  if (features.is_above_200_ema === true) techScore += 0.20;
  else if (features.is_above_200_ema === false) techScore -= 0.20;

  if (features.golden_cross === true) techScore += 0.15;
  else if (features.golden_cross === false) techScore -= 0.15;

  // 20 EMA short-term deviation
  if (features.ma_20_deviation_pct > 0.5) techScore += 0.10;
  else if (features.ma_20_deviation_pct < -1.5) techScore -= 0.15;

  techScore = Math.max(-1, Math.min(1, techScore));

  // 2. Market Breadth component (-1.0 to +1.0)
  let breadthScore = 0;
  if (features.advance_decline_ratio > 1.3) breadthScore += 0.30;
  else if (features.advance_decline_ratio < 0.7) breadthScore -= 0.30;

  const weightedBreadth = features.weighted_breadth_pct ?? features.sector_breadth_pct ?? 0.5;
  if (weightedBreadth > 0.60) breadthScore += 0.35;
  else if (weightedBreadth < 0.40) breadthScore -= 0.35;

  if (features.weighted_breadth_score) {
    breadthScore += Math.max(-0.25, Math.min(0.25, features.weighted_breadth_score * 0.5));
  }

  // Rolling 20-day turnover ratio confirmation
  const tRatio = features.turnover_ratio_vs_20d_avg ?? 1.0;
  if (tRatio >= 1.25) {
    // Turnover expansion confirms direction of breadth
    breadthScore += weightedBreadth >= 0.5 ? 0.20 : -0.20;
  } else if (tRatio < 0.75) {
    breadthScore -= 0.10; // thin volume penalty
  }

  // Float Index & Sensitive Float Divergence modifier (Section 2.1 & 4.4 of NEPSE Predictor App Documentation)
  if (features.float_divergence?.scoreModifier) {
    breadthScore += features.float_divergence.scoreModifier;
  }

  breadthScore = Math.max(-1, Math.min(1, breadthScore));

  // 3. Sentiment component (-1.0 to +1.0)
  const sentimentScore = Math.max(-1, Math.min(1, (features.sentiment_24h_avg || 0) * 2.5));

  // 4. Macro & Fiscal Cycle component (-1.0 to +1.0)
  let macroScore = 0;
  if (features.m2_growth_pct && features.m2_growth_pct > 11.0) macroScore += 0.30;
  if (features.interest_rate_pct && features.interest_rate_pct < 6.5) macroScore += 0.25;
  if (features.cpi_inflation_pct && features.cpi_inflation_pct < 5.0) macroScore += 0.15;
  if (features.remittance_growth_pct && features.remittance_growth_pct > 12.0) macroScore += 0.20;
  if (features.political_event_flagged) macroScore -= (features.political_event_severity * 0.20);

  // Seasonal & fiscal cycle liquidity bias (Ashadh budget wave, Poush tax drain, etc.)
  if (features.fiscal_cycle?.scoreBonus) {
    macroScore += features.fiscal_cycle.scoreBonus;
  }

  macroScore = Math.max(-1, Math.min(1, macroScore));

  // ── Dynamic Regime-Adaptive Weighting ────────────────────────────────
  // In Bull Expansions, momentum and breadth confirmation lead returns.
  // In Bear Corrections / below 50 EMA, macro liquidity and capital defense dominate.
  let weights;
  let detectedRegime;
  if (features.is_above_50_ema === true && (features.is_above_200_ema === true || features.golden_cross === true)) {
    weights = { technical: 0.40, breadth: 0.30, macro: 0.20, sentiment: 0.10 };
    detectedRegime = 'BULL_EXPANSION';
  } else if (features.is_above_50_ema === false) {
    weights = { technical: 0.25, breadth: 0.30, macro: 0.35, sentiment: 0.10 };
    detectedRegime = 'BEAR_CORRECTION';
  } else {
    weights = { technical: 0.35, breadth: 0.25, macro: 0.25, sentiment: 0.15 };
    detectedRegime = 'CONSOLIDATION';
  }

  let rawScore = +(
    techScore * weights.technical +
    breadthScore * weights.breadth +
    macroScore * weights.macro +
    sentimentScore * weights.sentiment
  ).toFixed(3);

  // ── HARD TREND CEILING ────────────────────────────────────────────────
  // Physical law: When the index is below its 50-day EMA, it is in a
  // structural downtrend. A single green day or oversold bounce is a
  // counter-trend bounce, NOT a confirmed breakout.
  const hardCeilingApplied = features.is_above_50_ema === false;
  if (hardCeilingApplied) {
    rawScore = Math.min(0.08, rawScore);
  }

  // Direction classification
  let direction = 'consolidate';
  if (rawScore > 0.12 && !hardCeilingApplied) direction = 'up';
  else if (rawScore < -0.12) direction = 'down';

  // Confidence percentage (55% to 92%)
  const confidence = Math.min(92, Math.max(55, Math.round(55 + Math.abs(rawScore) * 45)));

  // Target Calculations based on 14-day Index ATR
  const close = Number(features.latest_close || 2650);
  const atr = Number(features.index_atr || 32.0);
  let target1, target2, stopFloor, rrr, marketRegime;

  // ── 15% MANDATORY DAILY CIRCUIT BAND ENFORCEMENT ──────────────────
  // Next-session targets are bounded by ±15% from today's closing level (Fourth Amendment 2082)
  const circuitLimitPct = 15.0;
  const circuitReferenceClose = close > 0 ? close : Number(features.prev_close || 2650);
  const circuitCeiling = +(circuitReferenceClose * (1 + circuitLimitPct / 100)).toFixed(1);
  const circuitFloor = +(circuitReferenceClose * (1 - circuitLimitPct / 100)).toFixed(1);

  if (direction === 'up') {
    target1 = +(close + atr * 1.5).toFixed(1);
    target2 = +(close + atr * 3.2).toFixed(1);
    stopFloor = +(close - atr * 1.2).toFixed(1);
    marketRegime = features.is_above_200_ema ? 'Primary Bull Market Expansion' : 'Early Trend Recovery';
  } else if (direction === 'down') {
    target1 = +(close - atr * 1.5).toFixed(1);
    target2 = +(close - atr * 3.2).toFixed(1);
    stopFloor = +(close + atr * 1.2).toFixed(1);
    marketRegime = features.is_above_200_ema === false ? 'Primary Bear Market Cycle' : 'Intermediate Correction';
  } else {
    if (hardCeilingApplied) {
      target1 = +(features.ema_50 || (close + atr)).toFixed(1);
      target2 = +(close + atr * 1.8).toFixed(1);
      stopFloor = +(close - atr * 1.4).toFixed(1);
      marketRegime = 'Counter-Trend Bounce (Resistance at 50 EMA)';
    } else {
      target1 = +(close + atr * 1.2).toFixed(1);
      target2 = +(close + atr * 2.4).toFixed(1);
      stopFloor = +(close - atr * 1.2).toFixed(1);
      marketRegime = 'Rangebound Consolidation';
    }
  }

  // Strictly clamp all targets to the ±15% circuit band
  target1 = Math.max(circuitFloor, Math.min(circuitCeiling, target1));
  target2 = Math.max(circuitFloor, Math.min(circuitCeiling, target2));
  stopFloor = Math.max(circuitFloor, Math.min(circuitCeiling, stopFloor));

  // Recompute Risk-to-Reward Ratio post-clamp so RRR reflects actual circuit-bounded targets
  const clampedReward = Math.max(0.1, Math.abs(target1 - close));
  const clampedRisk = Math.max(0.1, Math.abs(close - stopFloor));
  rrr = direction === 'consolidate' && !hardCeilingApplied
    ? 1.0
    : +(clampedReward / clampedRisk).toFixed(2);

  // ── PROBABILISTIC EXPECTED RETURN RANGE (Strict 15% Circuit Bounded) ─
  // NEPSE forecasts are modeled as probabilistic return distributions bounded
  // strictly by the daily circuit limits (±15%).
  const baselineVolPct = close > 0 ? (atr / close) * 100 : 1.2;
  let uncertaintyMultiplier = 1.0;
  if (features.political_event_flagged) {
    uncertaintyMultiplier += (Number(features.political_event_severity || 1) * 0.25);
  }
  if (tRatio < 0.75) {
    uncertaintyMultiplier += 0.20; // Thin liquidity tail risk
  }
  if (features.float_divergence?.divergenceDetected) {
    uncertaintyMultiplier += 0.15; // Float divergence adds distribution dispersion
  }

  const rawMeanPct = +(rawScore * baselineVolPct * 1.5).toFixed(2);
  const expectedMeanPct = Math.max(-circuitLimitPct, Math.min(circuitLimitPct, rawMeanPct));
  const zScore90 = 1.645;
  const margin90 = +(zScore90 * baselineVolPct * uncertaintyMultiplier).toFixed(2);
  const rawLower = +(expectedMeanPct - margin90).toFixed(2);
  const rawUpper = +(expectedMeanPct + margin90).toFixed(2);
  const lower90 = Math.max(-circuitLimitPct, rawLower);
  const upper90 = Math.min(circuitLimitPct, rawUpper);

  const expectedReturnRange = {
    mean: expectedMeanPct,
    lower90,
    upper90,
    intervalWidth: +(upper90 - lower90).toFixed(2),
    confidenceLevel: 90,
    circuitLimitPct,
    isCircuitBounded: lower90 !== rawLower || upper90 !== rawUpper,
    uncertaintyMultiplier: +uncertaintyMultiplier.toFixed(2),
    isEventWidened: Boolean(features.political_event_flagged || features.float_divergence?.divergenceDetected || tRatio < 0.75)
  };

  // ── DYNAMIC TRUTHFUL EXPLANATION (No Contradictions) ───────────────────
  const explanationParts = [];

  // 1. Moving average structural position
  if (features.is_above_50_ema === true) {
    explanationParts.push(`NEPSE (Rs. ${close.toFixed(1)}) is structurally sustained above its 50-day EMA (${features.ema_50 ? 'Rs. ' + features.ema_50.toFixed(1) : 'support'}), confirming intact primary trend.`);
  } else if (features.is_above_50_ema === false) {
    explanationParts.push(`NEPSE (Rs. ${close.toFixed(1)}) is trading below its critical 50-day EMA (${features.ema_50 ? 'Rs. ' + features.ema_50.toFixed(1) : 'overhead resistance'}), enforcing a Hard Trend Ceiling where rallies face selling pressure.`);
  } else {
    explanationParts.push(`NEPSE benchmark stands near Rs. ${close.toFixed(1)} testing intermediate moving averages.`);
  }

  // 2. 200 EMA status
  if (features.is_above_200_ema === true && features.golden_cross === true) {
    explanationParts.push(`Long-term Golden Cross (50 EMA > 200 EMA) remains in force.`);
  } else if (features.is_above_200_ema === false) {
    explanationParts.push(`Benchmark remains below the 200-day EMA (${features.ema_200 ? 'Rs. ' + features.ema_200.toFixed(1) : 'long-term pivot'}), indicating macro caution.`);
  }

  // 3. MACD Momentum (truthful strictly based on signal)
  if (features.macd_signal === 'bullish') {
    explanationParts.push(`Technical MACD confirms bullish momentum with expanding positive histogram.`);
  } else if (features.macd_signal === 'bearish') {
    explanationParts.push(`Technical MACD confirms bearish momentum pressure with histogram remaining in negative territory.`);
  } else {
    explanationParts.push(`Technical MACD is neutral/converging.`);
  }

  // 4. Breadth & Turnover
  const pctBreadth = Math.round((features.weighted_breadth_pct ?? features.sector_breadth_pct ?? 0.5) * 100);
  explanationParts.push(`Market-cap weighted sector breadth is ${pctBreadth}% positive with turnover tracking at ${tRatio}x of its 20-day rolling average.`);

  // 5. Float Index & Sensitive Float Divergence (Section 2.1 & 4.4)
  if (features.float_divergence?.explanation) {
    explanationParts.push(features.float_divergence.explanation);
  }

  // 5c. Expected Return Range (90% Confidence Interval)
  explanationParts.push(`Expected 1-5 session return: ${expectedMeanPct >= 0 ? '+' : ''}${expectedMeanPct}% (90% CI: [${expectedReturnRange.lower90}%, ${expectedReturnRange.upper90}%]${expectedReturnRange.isEventWidened ? ' - widened for macro/float uncertainty' : ''}).`);

  // 6. Tactical actionable guidance with targets
  if (direction === 'up') {
    explanationParts.push(`Tactical upside target set at Rs. ${target1} (extension Rs. ${target2}) with trailing stop floor at Rs. ${stopFloor} (RRR ${rrr}:1).`);
  } else if (direction === 'down') {
    explanationParts.push(`Defensive downside support target at Rs. ${target1} (deep support Rs. ${target2}) with invalidation ceiling above Rs. ${stopFloor}. Protect capital and avoid aggressive dip buying.`);
  } else {
    if (hardCeilingApplied) {
      explanationParts.push(`Overhead resistance ceiling stands at Rs. ${target1} (50 EMA). Book profits into strength until confirmed breakout occurs.`);
    } else {
      explanationParts.push(`Expected consolidation range: Support Rs. ${stopFloor} to Resistance Rs. ${target1}. Focus on selective rotation plays.`);
    }
  }

  const explanation = explanationParts.join(' ');

  const predictionRecord = {
    prediction_date: date,
    direction,
    confidence,
    raw_score: rawScore,
    market_regime: marketRegime,
    expected_return_range: expectedReturnRange,
    float_divergence: features.float_divergence || null,
    targets: {
      target1,
      target2,
      stopFloor,
      rrr,
      atr
    },
    trend_structure: {
      is_above_50_ema: features.is_above_50_ema,
      is_above_200_ema: features.is_above_200_ema,
      golden_cross: features.golden_cross,
      ema_20: features.ema_20,
      ema_50: features.ema_50,
      ema_200: features.ema_200,
      hard_ceiling_applied: hardCeilingApplied
    },
    fiscal_cycle: features.fiscal_cycle,
    contributing_factors: {
      technical: +techScore.toFixed(2),
      breadth: +breadthScore.toFixed(2),
      macro: +macroScore.toFixed(2),
      sentiment: +sentimentScore.toFixed(2),
      weights
    },
    features: {
      rsi_14: features.rsi_14,
      macd_signal: features.macd_signal,
      advance_decline_ratio: features.advance_decline_ratio,
      sector_breadth_pct: features.sector_breadth_pct,
      weighted_breadth_pct: features.weighted_breadth_pct,
      turnover_ratio_vs_20d_avg: features.turnover_ratio_vs_20d_avg,
      rolling_avg_turnover: features.rolling_avg_turnover,
      today_turnover: features.today_turnover,
      m2_growth_pct: features.m2_growth_pct,
      interest_rate_pct: features.interest_rate_pct,
    },
    model_version: 'quant-v2.2-institutional',
    explanation,
    created_at: new Date().toISOString()
  };

  // Upsert into DB if available
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO index_predictions 
         (prediction_date, direction, confidence, raw_score, contributing_factors, model_version, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (prediction_date, model_version)
         DO UPDATE SET 
           direction = EXCLUDED.direction,
           confidence = EXCLUDED.confidence,
           raw_score = EXCLUDED.raw_score,
           contributing_factors = EXCLUDED.contributing_factors,
           explanation = EXCLUDED.explanation;`,
        [
          date, direction, confidence, rawScore,
          JSON.stringify(predictionRecord.contributing_factors),
          'quant-v2.2-institutional', explanation
        ]
      );
    } catch (e) {
      console.warn('[predictorEngine] DB write failed (non-fatal):', e.message);
    }
  }

  // Get historical prediction track record (DB or Real Backtest)
  const trackRecord = await getPredictionTrackRecord(15, memoryHistory);

  return {
    success: true,
    prediction: predictionRecord,
    trackRecord
  };
}

/**
 * Computes backtest on actual historical candles
 */
export function computeRealBacktest(memoryHistory, limit = 12) {
  if (!Array.isArray(memoryHistory) || memoryHistory.length < 35) {
    return {
      totalPredictions: 0,
      evaluatedCount: 0,
      winRatePct: 0,
      history: []
    };
  }

  const closes = memoryHistory.map(d => Number(d.close || d.closePrice || 0)).filter(c => c > 0);
  if (closes.length < 35) return { totalPredictions: 0, evaluatedCount: 0, winRatePct: 0, history: [] };

  const history = [];
  const startIdx = Math.max(30, closes.length - limit - 1);
  let correctCount = 0;

  for (let i = startIdx; i < closes.length - 1; i++) {
    const subCloses = closes.slice(0, i + 1);
    const currClose = subCloses[subCloses.length - 1];
    const nextClose = closes[i + 1];
    const candleDate = memoryHistory[i]?.date || `Session -${closes.length - 1 - i}`;

    const rsi = computeRSI(subCloses, 14);
    const ema20 = computeEMA(subCloses, 20);
    const ema50 = computeEMA(subCloses, 50);

    let score = 0;
    if (rsi > 52 && rsi < 68) score += 0.35;
    else if (rsi >= 70) score -= 0.2;
    else if (rsi < 40) score -= 0.35;

    if (ema20) {
      if (currClose > ema20) score += 0.25;
      else score -= 0.25;
    }

    if (ema50) {
      if (currClose > ema50) score += 0.25;
      else score -= 0.35; // Hard ceiling drag
    }

    let predDir = 'consolidate';
    if (score > 0.12 && (!ema50 || currClose >= ema50)) predDir = 'up';
    else if (score < -0.12) predDir = 'down';

    const pChg = ((nextClose - currClose) / currClose) * 100;
    let actualDir = 'consolidate';
    if (pChg >= 0.25) actualDir = 'up';
    else if (pChg <= -0.25) actualDir = 'down';

    const isCorrect = (predDir === actualDir) ||
      (predDir === 'consolidate' && Math.abs(pChg) < 0.6) ||
      (predDir === 'up' && pChg >= 0) ||
      (predDir === 'down' && pChg <= 0);

    if (isCorrect) correctCount++;

    history.unshift({
      prediction_date: candleDate,
      direction: predDir,
      confidence: Math.min(88, Math.max(60, Math.round(60 + Math.abs(score) * 35))),
      actual_close: nextClose,
      actual_direction: actualDir,
      is_correct: isCorrect,
      raw_score: +score.toFixed(2),
      explanation: `Historical session closed at Rs. ${currClose.toFixed(1)}; next session closed at Rs. ${nextClose.toFixed(1)} (${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%).`
    });
  }

  const winRatePct = history.length > 0 ? Math.round((correctCount / history.length) * 100) : 0;

  return {
    totalPredictions: history.length,
    evaluatedCount: history.length,
    winRatePct,
    history
  };
}

/**
 * Returns historical index predictions and backtesting accuracy statistics.
 */
export async function getPredictionTrackRecord(limit = 15, memoryHistory = null) {
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT prediction_date, direction, confidence, raw_score, actual_close, actual_direction, is_correct, explanation
         FROM index_predictions
         ORDER BY prediction_date DESC
         LIMIT $1`,
        [limit]
      );
      if (rows.length > 0) {
        const evaluated = rows.filter(r => r.is_correct !== null);
        if (evaluated.length >= 3) {
          const correct = evaluated.filter(r => r.is_correct === true).length;
          const winRate = Math.round((correct / evaluated.length) * 100);
          return {
            totalPredictions: rows.length,
            evaluatedCount: evaluated.length,
            winRatePct: winRate,
            history: rows
          };
        }
      }
    } catch (_) {}
  }

  // If DB lacks evaluated records, compute real backtest on real NOTS candle history
  if (Array.isArray(memoryHistory) && memoryHistory.length >= 35) {
    return computeRealBacktest(memoryHistory, limit);
  }

  return {
    totalPredictions: 0,
    evaluatedCount: 0,
    winRatePct: 0,
    history: []
  };
}

/**
 * Computes composite scores for all available stocks in the universe.
 */
export async function scoreAllStocks(stocksList = []) {
  if (!Array.isArray(stocksList) || stocksList.length === 0) {
    return [];
  }

  const scored = [];
  for (const s of stocksList) {
    const symbol = String(s.symbol || '').toUpperCase().trim();
    if (!symbol) continue;
    if (isExcludedInstrument(symbol, s.sector)) continue;

    const feat = await computeStockFeatures(symbol, 30, s);
    if (!feat) continue;

    // Composite scoring logic (0-100 scale)
    let score = 50;

    // 1. Momentum 5D (±18 pts)
    const mom = feat.momentum_5d || 0;
    score += Math.max(-18, Math.min(18, mom * 2.2));

    // 2. Volume surge ratio (±16 pts)
    const vsr = feat.volume_surge_ratio || 1;
    if (vsr >= 2.0) score += 16;
    else if (vsr >= 1.4) score += 10;
    else if (vsr < 0.6) score -= 8;

    // 3. RSI 14 (±12 pts)
    const rsi = feat.rsi_14 || 50;
    if (rsi >= 52 && rsi <= 68) score += 12; // momentum sweet spot
    else if (rsi > 78) score -= 8; // overextended
    else if (rsi < 30) score += 6; // oversold bounce

    // 4. MACD Signal (±10 pts)
    if (feat.macd_signal === 'bullish') score += 10;
    else if (feat.macd_signal === 'bearish') score -= 10;

    // 5. OBV Trend (±8 pts)
    if (feat.obv_trend === 'rising') score += 8;
    else if (feat.obv_trend === 'falling') score -= 8;

    // 6. Corporate Action / Catalyst (+6 pts)
    if (feat.corporate_action_flag) score += 6;

    // 6b. Sector-Relative Valuation (Section 3.2 of NEPSE Predictor App Documentation)
    const sec = String(s.sector || '').toLowerCase();
    let medianPE = 22;
    if (sec.includes('bank') && !sec.includes('dev')) medianPE = 14;
    else if (sec.includes('hydro')) medianPE = 24;
    else if (sec.includes('insurance')) medianPE = 25;
    else if (sec.includes('microfinance')) medianPE = 26;
    else if (sec.includes('hotel') || sec.includes('manufacturing')) medianPE = 28;

    const pe = Number(s.pe || 0);
    const eps = Number(s.eps || 0);

    if (pe > 0) {
      if (pe >= 40 && eps < 15) {
        // Penalize speculative FOMO crowding
        score -= 10;
      } else if (pe < medianPE * 0.85 && eps > 12) {
        // Value discount relative to sector
        score += 8;
      } else if (pe <= medianPE * 1.15) {
        score += 4;
      } else if (pe > medianPE * 1.8) {
        score -= 6;
      }
    }

    // 7. Structural Hard Trend Ceiling (50 EMA)
    const ema50 = Number(feat.ema50 || s.ema50 || s.sma50 || 0);
    const isAbove50EMA = (feat.is_above_50_ema !== undefined && feat.is_above_50_ema !== null)
      ? feat.is_above_50_ema
      : (ema50 > 0 ? feat.ltp >= ema50 : null);
    const hardCeilingApplied = isAbove50EMA === false;
    if (hardCeilingApplied) {
      score = Math.min(48, score);
    }

    // 8. Smart Money & Broker Floorsheet Flow Factor (±15 pts)
    const bcr3Buy = Number(s.bcr3BuyPct || s.brokerAnalysis?.bcr3BuyPct || 0);
    const bcr3Sell = Number(s.bcr3SellPct || s.brokerAnalysis?.bcr3SellPct || 0);
    const bcr5Buy = Number(s.bcr5BuyPct || s.brokerAnalysis?.bcr5BuyPct || 0);
    const adSignal = s.adSignal || s.brokerAnalysis?.adSignal || 'Neutral';
    const nbar = Number(s.nbar || s.brokerAnalysis?.nbar || 1.0);
    const smartFlowPct = Number(s.smartMoneyNetFlowPct || s.brokerAnalysis?.smartMoneyNetFlowPct || 0);

    const isDistributionTrap = (adSignal === 'Distribution' || (bcr3Sell >= 45.0 && bcr3Sell - bcr3Buy >= 10.0)) &&
      (mom > 0 || (s.pChange || 0) > 0);

    if (adSignal === 'Accumulation' || bcr3Buy >= 40.0) {
      if (bcr3Buy >= 45.0 && nbar >= 1.2) {
        score += 15; // Institutional cornering & aggressive stealth accumulation
      } else if (bcr3Buy >= 38.0 || smartFlowPct > 10.0) {
        score += 10; // Strong institutional buyer dominance
      } else {
        score += 5;
      }
    } else if (adSignal === 'Distribution' || (bcr3Sell >= 45.0 && bcr3Sell - bcr3Buy >= 10.0)) {
      if (bcr3Sell >= 50.0 && nbar <= 0.8) {
        score -= 15; // Heavy institutional dump / operator offloading
      } else {
        score -= 10;
      }
      // VETO GUARD: If price is up but smart money is dumping -> Distribution Trap!
      if (isDistributionTrap) {
        score = Math.min(score, 42); // Hard cap below neutral for distribution traps
      }
    }

    // Clamp score
    const compositeScore = Math.max(8, Math.min(98, Math.round(score)));

    // Categorization
    const stockVolume = Number(s.volume || s.totalTradedQuantity || (feat.avg_turnover_5d && feat.ltp ? feat.avg_turnover_5d / feat.ltp : 0) || 0);
    const stockTurnover = Number(s.turnover || s.totalTurnover || feat.avg_turnover_5d || 0);
    const stockSharesOut = Number(s.sharesOut || s.shares || 0);
    const liquidityScore = Math.min(99, Math.max(10, Math.round((stockTurnover ? stockTurnover / 500000 : 45))));
    const floatRiskFlag = (stockSharesOut > 0 && stockSharesOut <= 5) ? 'low_float'
      : liquidityScore < 25 ? 'illiquid' : 'normal';

    // AI Reasoning
    let reasoning = '';
    if (isDistributionTrap) {
      reasoning = `DISTRIBUTION TRAP WARNING: Price is artificially positive (+${Number(s.pChange || 0).toFixed(1)}%) but institutional brokers (BCR3 Sell ${bcr3Sell.toFixed(1)}%) are dumping inventory into retail liquidity. Avoid entering.`;
    } else if (hardCeilingApplied) {
      reasoning = `Trading below 50 EMA (Rs. ${ema50.toFixed(1)}). Counter-trend bounce into overhead resistance; wait for structural breakout before committing.`;
    } else if (adSignal === 'Accumulation' && bcr3Buy >= 40.0) {
      reasoning = `Stealth accumulation confirmed: Top 3 brokers control ${bcr3Buy.toFixed(1)}% of buy volume with positive absorption (NBAR ${nbar.toFixed(2)}). Constructive middle-stage markup setup.`;
    } else if (compositeScore >= 80) {
      reasoning = `Strong momentum conviction with ${vsr.toFixed(1)}x volume surge and rising OBV. Prime breakout candidate.`;
    } else if (compositeScore >= 65) {
      reasoning = `Constructive accumulation above key moving averages with steady buyer volume.`;
    } else if (compositeScore <= 35) {
      reasoning = `Weakening price structure and lagging volume. High probability of continued consolidation or pull-back.`;
    } else {
      reasoning = `Neutral trend holding range-bound. Awaiting volume catalyst for directional resolution.`;
    }

    scored.push({
      symbol,
      companyName: s.companyName || s.name || symbol,
      sector: s.sector || 'Others',
      ltp: feat.ltp,
      change: s.change || 0,
      pChange: s.pChange || 0,
      volume: stockVolume,
      turnover: stockTurnover,
      sharesOut: stockSharesOut,
      high: Number(s.high || s.maxPrice || feat.ltp || 0),
      low: Number(s.low || s.minPrice || feat.ltp || 0),
      previousClose: Number(s.previousClose || s.prevClose || 0),
      dividendYield: Number(s.dividendYield || s.divYield || 0),
      bonusShare: Number(s.bonusShare || s.bonus || 0),
      rightShare: Number(s.rightShare || 0),
      pe: Number(s.pe || 0),
      pb: Number(s.pb || 0),
      eps: Number(s.eps || 0),
      bcr3BuyPct: bcr3Buy,
      bcr3SellPct: bcr3Sell,
      bcr5BuyPct: bcr5Buy,
      nbar,
      adSignal,
      adRatio: Number(s.adRatio || 0),
      smartMoneyNetFlowPct: smartFlowPct,
      topAccumulator: s.topAccumulator || null,
      topDistributor: s.topDistributor || null,
      isDistributionTrap,
      volume_surge_ratio: feat.volume_surge_ratio,
      momentum_5d: feat.momentum_5d,
      rsi_14: feat.rsi_14,
      macd_signal: feat.macd_signal,
      obv_trend: feat.obv_trend,
      is_above_50_ema: isAbove50EMA,
      hard_ceiling_applied: hardCeilingApplied,
      liquidity_score: liquidityScore,
      float_risk_flag: floatRiskFlag,
      corporate_action_flag: feat.corporate_action_flag,
      composite_score: compositeScore,
      reasoning,
      score_date: new Date().toISOString().slice(0, 10),
    });
  }

  // Sort descending by composite score
  return scored.sort((a, b) => b.composite_score - a.composite_score);
}

/**
 * Returns news headlines with AI sentiment scores
 */
export async function getScoredNewsSentiment(limit = 20) {
  // 1. Try DB first
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id, source, headline, url, published_at, sentiment_score, category, related_symbols, scored_by
         FROM news_sentiment
         ORDER BY published_at DESC
         LIMIT $1`,
        [limit]
      );
      if (rows.length > 0) return rows;
    } catch (_) {}
  }

  // 2. Use in-memory scraped cache (populated by the news scraper worker in server.mjs)
  if (hasNewsCache()) {
    return getNewsCache(limit);
  }

  // 3. Authentic data only: Return empty array when live news is unavailable
  return [];
}
