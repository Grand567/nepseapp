/**
 * technicalSignals.js
 * Comprehensive Quantitative Technical Analysis Engine
 *
 * Implements exact mathematical formulas for:
 * 1. Trend: EMA 20, 50, 200, Bullish/Bearish Stack, Golden/Death Cross, ADX(14)
 * 2. Momentum: RSI(14) Wilder's, MACD(12, 26, 9 EMA), Inflection & Divergences
 * 3. Volatility: ATR(14), ATR % of Price, Bollinger Bands(20, 2), Squeeze Detection
 * 4. Support/Resistance: Classic Floor Pivots (P, R1-R3, S1-S3), 20-Day Donchian Breakout
 * 5. Volume Confirmation: On-Balance Volume (OBV), Money Flow Index (MFI 14), RVOL Expansion
 *
 * Designed to provide deterministic, transparent confluence scoring for NEPSE stocks.
 */

import {
  calculateSMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateBollingerBands,
  calculateATR,
  calculatePivotPoints,
  calculateOBV,
  calculateADX,
  calculateMFI,
} from '../indicators.js';

/**
 * 1. TREND SIGNALS
 * Evaluates moving average alignment (EMA 20, 50, 200) and ADX trend strength.
 */
export function evaluateTrendSignal(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      trendState: 'INSUFFICIENT_HISTORY',
      ema20: null,
      ema50: null,
      ema200: null,
      adx: null,
      plusDI: null,
      minusDI: null,
      isTrending: false,
      isBullishStack: false,
      priceVsEma20Pct: null,
      priceVsEma50Pct: null,
      priceVsEma200Pct: null,
      weaknesses: ['Less than 20 sessions available for trend evaluation']
    };
  }

  const closes = candles.map(c => Number(c.close || c.c || 0));
  const latestClose = closes[closes.length - 1];

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = closes.length >= 200 ? calculateEMA(closes, 200) : null;

  const ema20 = ema20Arr[ema20Arr.length - 1] ? +ema20Arr[ema20Arr.length - 1].toFixed(2) : null;
  const ema50 = ema50Arr[ema50Arr.length - 1] ? +ema50Arr[ema50Arr.length - 1].toFixed(2) : null;
  const ema200 = ema200Arr && ema200Arr[ema200Arr.length - 1] ? +ema200Arr[ema200Arr.length - 1].toFixed(2) : null;

  const adxResult = calculateADX(candles, 14);

  const priceVsEma20Pct = ema20 ? +(((latestClose - ema20) / ema20) * 100).toFixed(2) : null;
  const priceVsEma50Pct = ema50 ? +(((latestClose - ema50) / ema50) * 100).toFixed(2) : null;
  const priceVsEma200Pct = ema200 ? +(((latestClose - ema200) / ema200) * 100).toFixed(2) : null;

  const isBullishStack = Boolean(
    ema20 && ema50 &&
    latestClose > ema20 &&
    ema20 > ema50 &&
    (!ema200 || ema50 > ema200)
  );

  const isBearishStack = Boolean(
    ema20 && ema50 &&
    latestClose < ema20 &&
    ema20 < ema50 &&
    (!ema200 || ema50 < ema200)
  );

  let trendState = 'RANGE_BOUND';
  const weaknesses = [];

  if (isBullishStack && adxResult.isTrending) {
    trendState = 'STRONG_UPTREND';
  } else if (latestClose > ema20 && (!ema50 || ema20 > ema50)) {
    trendState = 'UPTREND';
  } else if (isBearishStack && adxResult.isTrending) {
    trendState = 'STRONG_DOWNTREND';
  } else if (latestClose < ema20 && (!ema50 || ema20 < ema50)) {
    trendState = 'DOWNTREND';
  }

  if (adxResult.adx !== null && adxResult.adx < 20) {
    weaknesses.push('ADX < 20 indicates a sideways, low-momentum chop zone; breakout signals have higher failure rates.');
  }
  if (priceVsEma20Pct !== null && priceVsEma20Pct > 12.0) {
    weaknesses.push(`Price is overextended (+${priceVsEma20Pct}% above 20 EMA); vulnerable to mean-reversion pullbacks.`);
  }

  return {
    trendState,
    ema20,
    ema50,
    ema200,
    adx: adxResult.adx,
    plusDI: adxResult.plusDI,
    minusDI: adxResult.minusDI,
    isTrending: adxResult.isTrending,
    isBullishStack,
    priceVsEma20Pct,
    priceVsEma50Pct,
    priceVsEma200Pct,
    weaknesses
  };
}

/**
 * 2. MOMENTUM SIGNALS
 * Evaluates RSI(14), MACD(12, 26, 9) signal line, histogram inflection, and divergences.
 */
export function evaluateMomentumSignal(candles = []) {
  if (!Array.isArray(candles) || candles.length < 26) {
    return {
      rsi14: null,
      rsiState: 'INSUFFICIENT_HISTORY',
      macdLine: null,
      signalLine: null,
      histogram: null,
      macdState: 'INSUFFICIENT_HISTORY',
      isBullishDivergence: false,
      isBearishDivergence: false,
      weaknesses: ['Less than 26 sessions available for momentum (MACD/RSI) evaluation']
    };
  }

  const closes = candles.map(c => Number(c.close || c.c || 0));
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes, 12, 26, 9);

  let rsiState = 'NEUTRAL';
  if (rsi14 !== null) {
    if (rsi14 >= 70) rsiState = 'OVERBOUGHT';
    else if (rsi14 >= 55) rsiState = 'BULLISH_MOMENTUM';
    else if (rsi14 <= 30) rsiState = 'OVERSOLD';
    else if (rsi14 <= 45) rsiState = 'BEARISH_MOMENTUM';
  }

  let macdState = 'NEUTRAL';
  if (macd.histogram !== null) {
    if (macd.histogram > 0 && macd.line > macd.signal) {
      macdState = 'BULLISH_EXPANSION';
    } else if (macd.histogram > 0) {
      macdState = 'BULLISH_MOMENTUM';
    } else if (macd.histogram === 0 && macd.line > 0) {
      macdState = 'BULLISH_STEADY';
    } else if (macd.histogram < 0 && macd.line < macd.signal) {
      macdState = 'BEARISH_EXPANSION';
    } else if (macd.histogram < 0) {
      macdState = 'BEARISH_MOMENTUM';
    }
  }

  // Divergence check over last 15 candles
  let isBullishDivergence = false;
  let isBearishDivergence = false;
  if (closes.length >= 15) {
    const recentCloses = closes.slice(-15);
    const p1 = recentCloses[0];
    const pMid = Math.max(...recentCloses.slice(0, 10));
    const pLast = recentCloses[recentCloses.length - 1];

    // If price made higher high but latest RSI is noticeably lower
    if (pLast > pMid && rsi14 !== null && rsi14 < 62) {
      isBearishDivergence = true;
    }
    // If price made lower low but latest RSI is holding higher
    if (pLast < Math.min(...recentCloses.slice(0, 10)) && rsi14 !== null && rsi14 > 38) {
      isBullishDivergence = true;
    }
  }

  const weaknesses = [];
  if (rsi14 !== null && rsi14 >= 75) {
    weaknesses.push(`RSI (${rsi14}) is in extreme overbought territory (>75); high risk of profit-taking.`);
  }
  if (isBearishDivergence) {
    weaknesses.push('Bearish momentum divergence detected: Price made new local high with decaying momentum.');
  }

  return {
    rsi14,
    rsiState,
    macdLine: macd.line,
    signalLine: macd.signal,
    histogram: macd.histogram,
    macdState,
    isBullishDivergence,
    isBearishDivergence,
    weaknesses
  };
}

/**
 * 3. VOLATILITY SIGNALS
 * Evaluates ATR(14), ATR % of Price, Bollinger Bands(20, 2), and Squeeze Coiling.
 */
export function evaluateVolatilitySignal(candles = []) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      atr14: null,
      atrPctOfPrice: null,
      volatilityRegime: 'INSUFFICIENT_HISTORY',
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
      bandwidth: null,
      percentB: null,
      isSqueeze: false,
      suggestedTrailingStopDistance: null,
      weaknesses: ['Less than 20 sessions available for volatility evaluation']
    };
  }

  const closes = candles.map(c => Number(c.close || c.c || 0));
  const latestClose = closes[closes.length - 1];

  const atr14 = calculateATR(candles, 14);
  const bb = calculateBollingerBands(closes, 20, 2);

  const atrPctOfPrice = (atr14 && latestClose > 0)
    ? +((atr14 / latestClose) * 100).toFixed(2)
    : null;

  let volatilityRegime = 'NORMAL_VOLATILITY';
  if (atrPctOfPrice !== null) {
    if (atrPctOfPrice >= 4.5) volatilityRegime = 'HIGH_VOLATILITY';
    else if (atrPctOfPrice < 2.0) volatilityRegime = 'LOW_VOLATILITY';
  }

  const isSqueeze = Boolean(bb?.squeeze || (bb?.bandwidth && bb.bandwidth <= 8.5));
  const suggestedTrailingStopDistance = atr14 ? +(atr14 * 2.0).toFixed(2) : null;

  const weaknesses = [];
  if (volatilityRegime === 'HIGH_VOLATILITY') {
    weaknesses.push(`High ATR volatility (${atrPctOfPrice}% of price): Requires wider stop-loss buffers and smaller position sizes.`);
  }
  if (isSqueeze) {
    weaknesses.push('Bollinger Bands in tight squeeze (<8.5% bandwidth): Impending high-volatility expansion imminent.');
  }

  return {
    atr14,
    atrPctOfPrice,
    volatilityRegime,
    bollingerUpper: bb?.upper ?? null,
    bollingerMiddle: bb?.middle ?? null,
    bollingerLower: bb?.lower ?? null,
    bandwidth: bb?.bandwidth ?? null,
    percentB: bb?.percentB ?? null,
    isSqueeze,
    suggestedTrailingStopDistance,
    weaknesses
  };
}

/**
 * 4. SUPPORT & RESISTANCE SIGNALS
 * Evaluates classic floor pivot points, 20-day high/low boundaries, and breakout levels.
 */
export function evaluateSupportResistanceSignal(candles = [], currentPrice = 0) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return {
      pivot: null,
      r1: null,
      r2: null,
      s1: null,
      s2: null,
      high20: null,
      low20: null,
      isBreakout: false,
      isSupportBounce: false,
      nearestSupport: null,
      distanceToSupportPct: null,
      nearestResistance: null,
      distanceToResistancePct: null,
      weaknesses: ['Insufficient data for support/resistance levels']
    };
  }

  const latestCandle = candles[candles.length - 1];
  const ltp = currentPrice > 0 ? currentPrice : Number(latestCandle.close || latestCandle.c || 0);

  // Floor pivot points derived from latest completed candle
  const pivots = calculatePivotPoints(
    Number(latestCandle.high || latestCandle.h || ltp),
    Number(latestCandle.low || latestCandle.l || ltp),
    Number(latestCandle.close || latestCandle.c || ltp)
  );

  // 20-day High & Low (excluding today's candle for clean breakout test)
  const priorCandles = candles.slice(Math.max(0, candles.length - 21), candles.length - 1);
  const high20 = priorCandles.length > 0 ? Math.max(...priorCandles.map(c => Number(c.high || c.h || 0))) : ltp;
  const low20 = priorCandles.length > 0 ? Math.min(...priorCandles.map(c => Number(c.low || c.l || ltp))) : ltp;

  const isBreakout = ltp >= high20 && high20 > 0;
  const isSupportBounce = ltp > pivots.S1 && (ltp - pivots.S1) / ltp <= 0.02;

  // Determine nearest support below LTP
  const supports = [pivots.S1, pivots.S2, low20].filter(s => s < ltp);
  const nearestSupport = supports.length > 0 ? Math.max(...supports) : pivots.S1;
  const distanceToSupportPct = nearestSupport > 0 ? +(((ltp - nearestSupport) / ltp) * 100).toFixed(2) : 0;

  // Determine nearest resistance above LTP
  const resistances = [pivots.R1, pivots.R2, high20].filter(r => r > ltp);
  const nearestResistance = resistances.length > 0 ? Math.min(...resistances) : pivots.R1;
  const distanceToResistancePct = ltp > 0 ? +(((nearestResistance - ltp) / ltp) * 100).toFixed(2) : 0;

  const weaknesses = [];
  if (distanceToResistancePct < 1.0 && !isBreakout) {
    weaknesses.push(`Price is within 1% of overhead resistance (Rs. ${nearestResistance}); unfavorable immediate reward-to-risk.`);
  }

  return {
    pivot: pivots.P,
    r1: pivots.R1,
    r2: pivots.R2,
    s1: pivots.S1,
    s2: pivots.S2,
    high20,
    low20,
    isBreakout,
    isSupportBounce,
    nearestSupport,
    distanceToSupportPct,
    nearestResistance,
    distanceToResistancePct,
    weaknesses
  };
}

/**
 * 5. VOLUME CONFIRMATION SIGNALS
 * Evaluates On-Balance Volume (OBV), Money Flow Index (MFI 14), and RVOL expansion.
 */
export function evaluateVolumeConfirmationSignal(candles = [], currentVolume = 0, volumeHistory20 = []) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return {
      obv: null,
      isObvConfirming: false,
      mfi14: null,
      mfiState: 'INSUFFICIENT_HISTORY',
      rvol: 1.0,
      isVolumeExpansion: false,
      isVolumeContraction: false,
      isBearishVolumeDivergence: false,
      weaknesses: ['Insufficient volume history']
    };
  }

  const latestCandle = candles[candles.length - 1];
  const curVol = currentVolume > 0 ? currentVolume : Number(latestCandle.volume || latestCandle.v || 0);

  const obvResult = calculateOBV(candles);
  const mfi14 = calculateMFI(candles, 14);

  // 20-session baseline volume
  let rvol = 1.0;
  if (Array.isArray(volumeHistory20) && volumeHistory20.length >= 5) {
    const sum = volumeHistory20.slice(-20).reduce((a, b) => a + Number(b || 0), 0);
    const avg = sum / Math.min(volumeHistory20.length, 20);
    rvol = avg > 0 ? +(curVol / avg).toFixed(2) : 1.0;
  }

  const isGreenCandle = Number(latestCandle.close || latestCandle.c || 0) >= Number(latestCandle.open || latestCandle.o || 0);
  const isVolumeExpansion = rvol >= 1.4 && isGreenCandle;
  const isVolumeContraction = rvol < 0.8 && !isGreenCandle;

  let mfiState = 'NEUTRAL';
  if (mfi14 !== null) {
    if (mfi14 >= 80) mfiState = 'OVERBOUGHT';
    else if (mfi14 >= 50) mfiState = 'HEALTHY_INFLOW';
    else if (mfi14 <= 20) mfiState = 'OVERSOLD';
    else mfiState = 'OUTFLOW';
  }

  // Volume divergence: price higher high but OBV failing to make new high
  let isBearishVolumeDivergence = false;
  if (obvResult.obvArray.length >= 10 && candles.length >= 10) {
    const recentCandles = candles.slice(-10);
    const recentObv = obvResult.obvArray.slice(-10);
    const pLast = Number(recentCandles[recentCandles.length - 1].close || 0);
    const pMax = Math.max(...recentCandles.slice(0, 8).map(c => Number(c.close || 0)));
    const oLast = recentObv[recentObv.length - 1];
    const oMax = Math.max(...recentObv.slice(0, 8));
    if (pLast > pMax && oLast < oMax) {
      isBearishVolumeDivergence = true;
    }
  }

  const weaknesses = [];
  if (isBearishVolumeDivergence) {
    weaknesses.push('Bearish volume divergence: Price made new high without corresponding On-Balance Volume expansion.');
  }
  if (mfi14 !== null && mfi14 >= 85) {
    weaknesses.push(`MFI (${mfi14}) indicates extreme money flow exhaustion.`);
  }

  return {
    obv: obvResult.obv,
    isObvConfirming: obvResult.isObvTrendingUp,
    mfi14,
    mfiState,
    rvol,
    isVolumeExpansion,
    isVolumeContraction,
    isBearishVolumeDivergence,
    weaknesses
  };
}

/**
 * 6. COMPOSITE TECHNICAL CONFLUENCE EVALUATOR
 * Synthesizes all 5 technical signal components into a transparent score (0 to 100).
 */
export function evaluateTechnicalConfluence({
  symbol = '',
  tradeDate = '',
  candles = [],
  currentVolume = 0,
  volumeHistory20 = [],
} = {}) {
  const trend = evaluateTrendSignal(candles);
  const momentum = evaluateMomentumSignal(candles);
  const volatility = evaluateVolatilitySignal(candles);
  const supportResistance = evaluateSupportResistanceSignal(candles);
  const volume = evaluateVolumeConfirmationSignal(candles, currentVolume, volumeHistory20);

  // Total 100 Points:
  // 1. Trend (25 pts)
  let trendScore = 0;
  if (trend.trendState === 'STRONG_UPTREND') trendScore = 25;
  else if (trend.trendState === 'UPTREND') trendScore = 18;
  else if (trend.trendState === 'RANGE_BOUND') trendScore = 10;
  else if (trend.trendState === 'DOWNTREND') trendScore = -10;
  else if (trend.trendState === 'STRONG_DOWNTREND') trendScore = -20;

  // 2. Momentum (25 pts)
  let momScore = 0;
  if (momentum.rsiState === 'BULLISH_MOMENTUM') momScore += 12;
  else if (momentum.rsiState === 'OVERBOUGHT') momScore += 5; // Positive trend but warning
  else if (momentum.rsiState === 'OVERSOLD') momScore += 2;

  if (momentum.macdState === 'BULLISH_EXPANSION') momScore += 13;
  else if (momentum.histogram && momentum.histogram > 0) momScore += 8;
  if (momentum.isBearishDivergence) momScore -= 12;

  // 3. Volatility / Squeeze (15 pts)
  let volScore = 0;
  if (volatility.isSqueeze) volScore = 15; // High potential energy
  else if (volatility.volatilityRegime === 'NORMAL_VOLATILITY') volScore = 10;
  else if (volatility.volatilityRegime === 'HIGH_VOLATILITY') volScore = 5;

  // 4. Support / Resistance (20 pts)
  let srScore = 0;
  if (supportResistance.isBreakout) srScore = 20;
  else if (supportResistance.isSupportBounce) srScore = 16;
  else if (supportResistance.distanceToSupportPct !== null && supportResistance.distanceToSupportPct <= 3.0) srScore = 12;
  else if (supportResistance.distanceToResistancePct !== null && supportResistance.distanceToResistancePct < 1.0) srScore = -5;

  // 5. Volume Confirmation (15 pts)
  let volConfScore = 0;
  if (volume.isVolumeExpansion) volConfScore += 10;
  if (volume.isObvConfirming) volConfScore += 5;
  if (volume.isBearishVolumeDivergence) volConfScore -= 10;

  const rawTotal = 40 + trendScore + momScore + volScore + srScore + volConfScore;
  const compositeScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

  let verdict = 'NEUTRAL';
  if (compositeScore >= 75) verdict = 'STRONG_BUY';
  else if (compositeScore >= 60) verdict = 'BUY';
  else if (compositeScore <= 35) verdict = 'AVOID';

  const allWeaknesses = [
    ...trend.weaknesses,
    ...momentum.weaknesses,
    ...volatility.weaknesses,
    ...supportResistance.weaknesses,
    ...volume.weaknesses
  ];

  return {
    symbol: String(symbol || '').toUpperCase().trim(),
    tradeDate,
    compositeScore,
    verdict,
    signals: {
      trend,
      momentum,
      volatility,
      supportResistance,
      volumeConfirmation: volume
    },
    weaknesses: Array.from(new Set(allWeaknesses))
  };
}
