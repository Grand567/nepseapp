/**
 * Modular Technical Analysis Engine for NEPSE Stocks
 * ─────────────────────────────────────────────────────────────────────
 * Provides rigorous, multi-factor technical analysis across four domains:
 *   1. Trend & Moving Average Structure (EMA 20/50/200, SMA 20/50/200)
 *   2. Momentum & Velocity (RSI 14, RSI slope, MACD, multi-period returns)
 *   3. Volume & Participation (RVOL, Volume Z-Score, Volume Confirmation)
 *   4. Volatility & Regimes (ATR 14, Bollinger Band Width, Squeeze / Expansion)
 *
 * Reuses verified math functions from:
 *   - ./indicators.js (calculateEMA, calculateMACD, calculateRSI)
 *   - ./quantEngine.js (calculateATR, calculateBollingerBandWidth, calculateVolumeZScore)
 */

import { calculateEMA, calculateMACD, calculateRSI } from './indicators.js';
import {
  calculateATR,
  calculateBollingerBandWidth,
  calculateVolumeZScore,
  calculateAccumulationDistributionIndex,
} from './quantEngine.js';

/**
 * Calculates Simple Moving Average array.
 * @param {number[]} values
 * @param {number} period
 * @returns {number[]} Array of SMA values matching input length (null before warmup)
 */
export function calculateSMA(values, period) {
  if (!Array.isArray(values) || values.length === 0 || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += Number(values[i]) || 0;
    if (i >= period) {
      sum -= Number(values[i - period]) || 0;
    }
    if (i >= period - 1) {
      result[i] = Number((sum / period).toFixed(2));
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// 1. TREND ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Analyzes trend and moving average structure over historical closes.
 * @param {number[]} closes - Array of historical close prices (oldest -> newest)
 * @returns {Object} Trend evaluation
 */
export function analyzeTrend(closes) {
  if (!Array.isArray(closes) || closes.length === 0) {
    return {
      available: false,
      direction: 'neutral',
      strength: 0,
      classification: 'neutral',
      score: 50,
      sufficientHistory: false,
      reasons: ['No price history supplied for trend evaluation.'],
    };
  }

  const n = closes.length;
  const price = closes[n - 1];

  // Moving averages
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = n >= 180 ? calculateEMA(closes, Math.min(200, n)) : null;

  const sma20Arr = calculateSMA(closes, 20);
  const sma50Arr = calculateSMA(closes, 50);
  const sma200Arr = n >= 180 ? calculateSMA(closes, Math.min(200, n)) : null;

  const ema20 = ema20Arr[ema20Arr.length - 1] ?? null;
  const ema50 = ema50Arr[ema50Arr.length - 1] ?? null;
  const ema200 = ema200Arr ? ema200Arr[ema200Arr.length - 1] : null;

  const sma20 = sma20Arr[sma20Arr.length - 1] ?? null;
  const sma50 = sma50Arr[sma50Arr.length - 1] ?? null;
  const sma200 = sma200Arr ? sma200Arr[sma200Arr.length - 1] : null;

  const sufficientHistory = n >= 60;
  const has200Day = ema200 !== null && n >= 180;

  // Slopes (compare to 5 bars ago)
  const prevEma20 = n >= 6 ? ema20Arr[n - 6] : ema20;
  const prevEma50 = n >= 6 ? ema50Arr[n - 6] : ema50;
  const ema20Slope = prevEma20 && ema20 ? Number((((ema20 - prevEma20) / prevEma20) * 100).toFixed(2)) : 0;
  const ema50Slope = prevEma50 && ema50 ? Number((((ema50 - prevEma50) / prevEma50) * 100).toFixed(2)) : 0;

  // Price relative to EMAs
  const priceVsEma20Pct = ema20 ? Number((((price - ema20) / ema20) * 100).toFixed(2)) : 0;
  const priceVsEma50Pct = ema50 ? Number((((price - ema50) / ema50) * 100).toFixed(2)) : 0;
  const priceVsEma200Pct = ema200 ? Number((((price - ema200) / ema200) * 100).toFixed(2)) : null;

  const isAboveEma20 = ema20 !== null && price >= ema20;
  const isAboveEma50 = ema50 !== null && price >= ema50;
  const isAboveEma200 = ema200 !== null ? price >= ema200 : null;

  // EMA alignment
  const isEma20AboveEma50 = ema20 !== null && ema50 !== null && ema20 >= ema50;
  const isEma50AboveEma200 = ema50 !== null && ema200 !== null ? ema50 >= ema200 : null;

  // Golden / Death Cross in recent 5 bars
  let recentGoldenCross = false;
  let recentDeathCross = false;
  if (n >= 6 && ema20Arr.length >= 6 && ema50Arr.length >= 6) {
    const wasBearish = ema20Arr[n - 6] <= ema50Arr[n - 6];
    const isBullishNow = ema20 > ema50;
    recentGoldenCross = wasBearish && isBullishNow;

    const wasBullish = ema20Arr[n - 6] >= ema50Arr[n - 6];
    const isBearishNow = ema20 < ema50;
    recentDeathCross = wasBullish && isBearishNow;
  }

  // Stacked alignment
  const isStackedBullish = isAboveEma20 && isEma20AboveEma50 && (has200Day ? isEma50AboveEma200 : true);
  const isStackedBearish = !isAboveEma20 && !isEma20AboveEma50 && (has200Day ? !isEma50AboveEma200 : true);

  // Scoring trend from multiple factors (0 - 100)
  let trendScore = 50;
  const observations = [];

  if (isAboveEma20) trendScore += 12; else trendScore -= 12;
  if (isAboveEma50) trendScore += 12; else trendScore -= 12;
  if (isEma20AboveEma50) trendScore += 12; else trendScore -= 12;

  if (has200Day) {
    if (isAboveEma200) trendScore += 8; else trendScore -= 8;
    if (isEma50AboveEma200) trendScore += 6; else trendScore -= 6;
  } else {
    // Redistribute 200-day points to slopes
    if (ema20Slope > 0.5) trendScore += 7; else if (ema20Slope < -0.5) trendScore -= 7;
    if (ema50Slope > 0.2) trendScore += 7; else if (ema50Slope < -0.2) trendScore -= 7;
  }

  if (isStackedBullish) {
    trendScore += 8;
    observations.push('Full bullish moving-average stack (Price > EMA20 > EMA50).');
  } else if (isStackedBearish) {
    trendScore -= 8;
    observations.push('Full bearish moving-average stack (Price < EMA20 < EMA50).');
  }

  if (recentGoldenCross) {
    trendScore += 6;
    observations.push('Recent 20/50 EMA Golden Cross confirmed.');
  } else if (recentDeathCross) {
    trendScore -= 6;
    observations.push('Recent 20/50 EMA Death Cross confirmed.');
  }

  trendScore = Math.max(5, Math.min(95, Math.round(trendScore)));

  // Classification
  let classification = 'neutral';
  let direction = 'neutral';

  if (trendScore >= 80) {
    classification = 'strong_bullish';
    direction = 'bullish';
  } else if (trendScore >= 62) {
    classification = 'bullish';
    direction = 'bullish';
  } else if (trendScore <= 22) {
    classification = 'strong_bearish';
    direction = 'bearish';
  } else if (trendScore <= 38) {
    classification = 'bearish';
    direction = 'bearish';
  } else {
    classification = 'neutral';
    direction = 'neutral';
  }

  if (isAboveEma20 && !isStackedBullish) {
    observations.push(`Price is trading ${priceVsEma20Pct > 0 ? '+' : ''}${priceVsEma20Pct}% above 20 EMA.`);
  } else if (!isAboveEma20 && !isStackedBearish) {
    observations.push(`Price is trading ${priceVsEma20Pct}% below 20 EMA.`);
  }

  return {
    available: true,
    score: trendScore,
    direction,
    classification,
    strength: Math.abs(trendScore - 50) * 2, // 0 - 100 strength
    price,
    ema: {
      ema20,
      ema50,
      ema200,
      priceVsEma20Pct,
      priceVsEma50Pct,
      priceVsEma200Pct,
      isAboveEma20,
      isAboveEma50,
      isAboveEma200,
      isEma20AboveEma50,
      isEma50AboveEma200,
      isStackedBullish,
      isStackedBearish,
      recentGoldenCross,
      recentDeathCross,
      ema20Slope,
      ema50Slope,
    },
    sma: {
      sma20,
      sma50,
      sma200,
    },
    sufficientHistory,
    has200Day,
    observations,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 2. MOMENTUM ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Evaluates momentum, velocity, RSI slope, and MACD.
 * @param {number[]} closes
 * @param {string} [trendDirection='neutral']
 * @returns {Object} Momentum evaluation
 */
export function analyzeMomentum(closes, trendDirection = 'neutral') {
  if (!Array.isArray(closes) || closes.length < 15) {
    return {
      available: false,
      score: 50,
      direction: 'neutral',
      rsi14: 50,
      rsiSlope3: 0,
      rsiSlope5: 0,
      macd: { line: 0, signal: 0, histogram: 0 },
      returns: { ret5: 0, ret20: 0 },
      condition: 'neutral',
      observations: ['Insufficient history for momentum calculations.'],
    };
  }

  const n = closes.length;
  const price = closes[n - 1];

  const rsi14 = calculateRSI(closes, 14);

  // RSI slope (change in RSI over last 3 and 5 bars)
  let rsi3BarsAgo = rsi14;
  let rsi5BarsAgo = rsi14;
  if (n >= 20) {
    rsi3BarsAgo = calculateRSI(closes.slice(0, n - 3), 14);
    rsi5BarsAgo = calculateRSI(closes.slice(0, n - 5), 14);
  }
  const rsiSlope3 = Number((rsi14 - rsi3BarsAgo).toFixed(2));
  const rsiSlope5 = Number((rsi14 - rsi5BarsAgo).toFixed(2));

  // MACD
  const macd = calculateMACD(closes);

  // Multi-period returns
  const ret5 = n >= 6 ? Number((((price - closes[n - 6]) / closes[n - 6]) * 100).toFixed(2)) : 0;
  const ret20 = n >= 21 ? Number((((price - closes[n - 21]) / closes[n - 21]) * 100).toFixed(2)) : 0;

  const observations = [];
  let momentumScore = 50;

  // RSI scoring (with trend context)
  if (rsi14 >= 70) {
    if (trendDirection === 'bullish' || trendDirection === 'strong_bullish') {
      // In strong uptrend, RSI > 70 represents powerful continuation momentum, not an automatic sell!
      momentumScore += 18;
      observations.push(`RSI (${rsi14}) is in overbought zone with strong uptrend support (momentum acceleration).`);
    } else {
      // Sideways or weak trend overbought
      momentumScore += 5;
      observations.push(`RSI (${rsi14}) is extended into overbought territory without trend confirmation.`);
    }
  } else if (rsi14 <= 30) {
    if (trendDirection === 'bearish' || trendDirection === 'strong_bearish') {
      // In strong downtrend, RSI < 30 represents severe selling pressure, not an automatic buy!
      momentumScore -= 18;
      observations.push(`RSI (${rsi14}) is oversold amid structural downtrend (caution on catch-falling-knife).`);
    } else {
      // Pullback in neutral / bull market
      momentumScore -= 5;
      observations.push(`RSI (${rsi14}) is in oversold territory (potential mean-reversion setup).`);
    }
  } else {
    // Normal range
    const rsiDelta = (rsi14 - 50) * 0.7;
    momentumScore += rsiDelta;
    if (rsi14 >= 55) {
      observations.push(`RSI (${rsi14}) holds in healthy bullish control zone (55–69).`);
    } else if (rsi14 <= 45) {
      observations.push(`RSI (${rsi14}) remains in bear control zone (31–45).`);
    }
  }

  // RSI Slope
  if (rsiSlope3 > 4) {
    momentumScore += 8;
    observations.push(`RSI slope is rising rapidly (+${rsiSlope3} pts over 3 days).`);
  } else if (rsiSlope3 < -4) {
    momentumScore -= 8;
    observations.push(`RSI slope is decelerating (${rsiSlope3} pts over 3 days).`);
  }

  // MACD scoring
  if (macd.histogram > 0) {
    momentumScore += 8;
    if (macd.line > macd.signal) {
      observations.push(`MACD histogram is positive (+${macd.histogram}) and expanding.`);
    }
  } else if (macd.histogram < 0) {
    momentumScore -= 8;
    observations.push(`MACD histogram is negative (${macd.histogram}).`);
  }

  // Short term return contribution (damped to prevent double-counting with RSI and MACD)
  if (ret5 > 5.0) momentumScore += 3;
  else if (ret5 < -5.0) momentumScore -= 3;

  // Exhaustion check: If RSI is extended (> 72) but velocity is stalling/dropping, flag divergence
  const isExhaustion = rsi14 >= 72 && rsiSlope3 <= -3;
  if (isExhaustion) {
    momentumScore -= 10;
    observations.push(`Momentum exhaustion alert: RSI (${rsi14}) is elevated but 3-day velocity is decelerating (${rsiSlope3} pts).`);
  }

  momentumScore = Math.max(5, Math.min(95, Math.round(momentumScore)));

  // Momentum state detection
  let condition = 'neutral';
  let direction = 'neutral';

  if (isExhaustion) {
    condition = 'bullish_momentum_exhaustion';
    direction = 'neutral';
  } else if (momentumScore >= 65) {
    condition = rsiSlope3 >= 0 ? 'bullish_momentum_expanding' : 'bullish_momentum_peaking';
    direction = 'bullish';
  } else if (momentumScore <= 35) {
    condition = rsiSlope3 <= 0 ? 'bearish_momentum_accelerating' : 'bearish_momentum_weakening';
    direction = 'bearish';
  } else {
    condition = rsiSlope3 >= 0 ? 'improving_momentum' : 'weakening_momentum';
    direction = 'neutral';
  }

  return {
    available: true,
    score: momentumScore,
    direction,
    condition,
    strength: Math.abs(momentumScore - 50) * 2,
    rsi14,
    rsiSlope3,
    rsiSlope5,
    isOverbought: rsi14 >= 70,
    isOversold: rsi14 <= 30,
    macd,
    returns: {
      ret5,
      ret20,
    },
    observations,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 3. VOLUME ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Evaluates volume surges, RVOL, volume-price interaction, and participation.
 * @param {Array<{close: number, volume: number, open?: number, high?: number, low?: number}>} candles
 * @returns {Object} Volume analysis
 */
export function analyzeVolume(candles) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return {
      available: false,
      score: 50,
      rvol: 1.0,
      avgVolume20: 0,
      currentVolume: 0,
      state: 'neutral',
      observations: ['Insufficient volume history.'],
    };
  }

  const n = candles.length;
  const currentBar = candles[n - 1];
  const prevBar = candles[n - 2];

  const currentVolume = Number(currentBar.volume) || 0;
  const currentClose = Number(currentBar.close) || 0;
  const prevClose = Number(prevBar?.close) || currentClose;
  const pChange = prevClose > 0 ? ((currentClose - prevClose) / prevClose) * 100 : 0;

  // 20-day average volume
  const volWindow = candles.slice(Math.max(0, n - 20)).map((c) => Number(c.volume) || 0);
  const avgVolume20 = Math.round(volWindow.reduce((a, b) => a + b, 0) / Math.max(1, volWindow.length));

  // Standard deviation of volume
  const meanVol = avgVolume20;
  const variance = volWindow.reduce((a, b) => a + Math.pow(b - meanVol, 2), 0) / Math.max(1, volWindow.length);
  const stdDevVol = Math.sqrt(variance);

  const rvol = avgVolume20 > 0 ? Number((currentVolume / avgVolume20).toFixed(2)) : 1.0;
  const zScoreObj = calculateVolumeZScore(currentVolume, avgVolume20, stdDevVol);

  // 5-day volume trend vs 20-day
  const vol5 = candles.slice(Math.max(0, n - 5)).map((c) => Number(c.volume) || 0);
  const avgVol5 = vol5.reduce((a, b) => a + b, 0) / Math.max(1, vol5.length);
  const volumeTrend = avgVol5 > avgVolume20 * 1.1 ? 'rising' : avgVol5 < avgVolume20 * 0.9 ? 'falling' : 'flat';

  const isVolumeExpansion = rvol >= 1.4;
  const isVolumeContraction = rvol <= 0.65;

  // Accumulation / Distribution indicator where candles have H/L/C/V
  let adMetrics = null;
  try {
    adMetrics = calculateAccumulationDistributionIndex(candles);
  } catch (_) {}

  // Detect specific market behaviors
  const observations = [];
  let volumeScore = 50;
  let state = 'normal_participation';

  if (pChange > 0.8 && rvol >= 1.3) {
    state = 'bullish_volume_confirmation';
    volumeScore = 78;
    observations.push(`Bullish volume confirmation: Price gained +${pChange.toFixed(2)}% on ${rvol}x average volume.`);
  } else if (pChange > 1.2 && rvol < 0.8) {
    state = 'weak_breakout';
    volumeScore = 44;
    observations.push(`Caution: Price gained +${pChange.toFixed(2)}% but volume was light (${rvol}x avg), showing weak conviction.`);
  } else if (pChange < -0.8 && rvol >= 1.3) {
    state = 'selling_pressure';
    volumeScore = 24;
    observations.push(`Selling pressure: Price declined ${pChange.toFixed(2)}% on elevated volume (${rvol}x avg).`);
  } else if (Math.abs(pChange) > 1.0 && isVolumeContraction) {
    state = 'low_participation';
    volumeScore = 46;
    observations.push(`Low participation: Price moved without volume expansion (${rvol}x avg volume).`);
  } else if (isVolumeExpansion) {
    state = 'volume_surge';
    volumeScore = pChange >= 0 ? 70 : 35;
    observations.push(`Volume surge detected (${rvol}x 20-day average volume).`);
  } else {
    state = 'normal_participation';
    volumeScore = 50;
    observations.push(`Volume is in line with 20-day baseline (${rvol}x avg).`);
  }

  if (zScoreObj.isVolumeShocker) {
    observations.push(`⚡ High Volume Shocker: Z-score is +${zScoreObj.zScore}σ.`);
    if (pChange > 0) volumeScore += 8;
    else volumeScore -= 8;
  }

  volumeScore = Math.max(5, Math.min(95, Math.round(volumeScore)));

  return {
    available: true,
    score: volumeScore,
    rvol,
    avgVolume20,
    currentVolume,
    volumeTrend,
    isVolumeExpansion,
    isVolumeContraction,
    isVolumeShocker: zScoreObj.isVolumeShocker,
    zScore: zScoreObj.zScore,
    state,
    adMetrics,
    observations,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 4. VOLATILITY ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Analyzes volatility regime, ATR%, Bollinger Band Width, and squeeze setups.
 * @param {Array<{high: number, low: number, close: number}>} candles
 * @returns {Object} Volatility evaluation
 */
export function analyzeVolatility(candles) {
  if (!Array.isArray(candles) || candles.length < 15) {
    return {
      available: false,
      score: 50,
      atr14: 0,
      atrPct: 0,
      regime: 'normal_volatility',
      isSqueeze: false,
      isExpansion: false,
      observations: ['Insufficient data for volatility metrics.'],
    };
  }

  const closes = candles.map((c) => Number(c.close));
  const price = closes[closes.length - 1];

  const atr14 = calculateATR(candles.slice(-60), 14);
  const atrPct = price > 0 ? Number(((atr14 / price) * 100).toFixed(2)) : 0;

  const bbwObj = calculateBollingerBandWidth(closes, 20, 2);

  // Volatility regime
  let regime = 'normal_volatility';
  let isSqueeze = bbwObj.isSqueeze;
  let isExpansion = false;

  if (bbwObj.bbw <= 0.065 || atrPct < 1.8) {
    regime = 'low_volatility';
    isSqueeze = true;
  } else if (bbwObj.bbw >= 0.18 || atrPct > 5.0) {
    regime = 'high_volatility';
    isExpansion = true;
  } else {
    regime = 'normal_volatility';
  }

  const observations = [];
  let volatilityScore = 50;

  if (isSqueeze) {
    volatilityScore = 72; // Volatility compression is a favorable breakout precursor
    observations.push(`Volatility Squeeze: Bollinger Band Width contracted to ${(bbwObj.bbw * 100).toFixed(1)}% (breakout environment).`);
  } else if (isExpansion) {
    volatilityScore = 45; // High volatility increases risk/reward stop width
    observations.push(`High Volatility Regime: ATR is Rs. ${atr14.toFixed(1)} (${atrPct}% of price). Stop-loss distance requires wider buffer.`);
  } else {
    volatilityScore = 55;
    observations.push(`Normal volatility regime (ATR ${atrPct}% of price, BBW ${(bbwObj.bbw * 100).toFixed(1)}%).`);
  }

  return {
    available: true,
    score: volatilityScore,
    atr14: Number(atr14.toFixed(2)),
    atrPct,
    bbw: bbwObj.bbw,
    bbwPct: bbwObj.bbwPct,
    upperBand: bbwObj.upperBand,
    lowerBand: bbwObj.lowerBand,
    sma20: bbwObj.sma,
    regime,
    isSqueeze,
    isExpansion,
    observations,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5. COMBINED TECHNICAL SUMMARY
// ─────────────────────────────────────────────────────────────────────

/**
 * Runs the full technical analysis suite over the candles dataset.
 * @param {Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>} candles
 * @returns {Object} Cohesive technical report
 */
export function analyzeTechnical(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return {
      supported: false,
      reason: 'Need at least 30 trading days of OHLCV history for technical analysis.',
    };
  }

  const closes = candles.map((c) => Number(c.close));
  const trend = analyzeTrend(closes);
  const momentum = analyzeMomentum(closes, trend.direction);
  const volume = analyzeVolume(candles);
  const volatility = analyzeVolatility(candles);

  // Blended technical score (0 - 100)
  const compositeScore = Math.round(
    trend.score * 0.40 +
    momentum.score * 0.30 +
    volume.score * 0.20 +
    volatility.score * 0.10
  );

  return {
    supported: true,
    score: compositeScore,
    trend,
    momentum,
    volume,
    volatility,
  };
}
