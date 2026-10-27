/**
 * Mathematical Engine for Technical Indicators
 * ─────────────────────────────────────────────────────────────────────────────
 * B1 Fix: EMA now seeds with SMA(period) for the first value, then applies the
 *         Wilder/standard multiplier from that point forward. Previously seeding
 *         with prices[0] made EMA wrong for ~period candles, generating false
 *         MACD and crossover signals.
 *
 * B2 Fix: MACD now only produces values from index (longPeriod - 1) onward,
 *         eliminating warm-up noise from the MACD line and signal line arrays.
 *
 * B3:     Bollinger Bands (calculateBollingerBands) implemented.
 * B4:     ATR (Average True Range) implemented.
 * B5:     SMA (Simple Moving Average) implemented.
 * B6:     When the period is truncated due to insufficient data, functions
 *         attach isApproximate:true so callers can warn users.
 */

// ── B5: Simple Moving Average ─────────────────────────────────────────────────
export function calculateSMA(prices, period) {
  if (!prices || prices.length === 0) return [];
  const effectivePeriod = Math.min(period, prices.length);
  const isApproximate = effectivePeriod < period;
  const sma = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < effectivePeriod - 1) {
      sma.push(null); // not enough data yet
    } else {
      const slice = prices.slice(i - effectivePeriod + 1, i + 1);
      sma.push(slice.reduce((a, b) => a + b, 0) / effectivePeriod);
    }
  }
  sma.isApproximate = isApproximate;
  sma.period = effectivePeriod;
  return sma;
}

// ── B1 Fix: EMA with correct SMA seed ────────────────────────────────────────
/**
 * Calculates Exponential Moving Average.
 * B1 Fix: Seeds the EMA with SMA(period) at index (period-1), then applies
 *   the EMA multiplier from that point. This matches TradingView, Bloomberg,
 *   and all major platforms. Seeding with prices[0] (previous behaviour) caused
 *   significant error for the first ~period candles.
 * B6: If prices.length < period, period is truncated and isApproximate is set.
 */
export function calculateEMA(prices, period) {
  if (!prices || prices.length === 0) return [];

  // B6: Truncate period if insufficient data, flag as approximate
  const effectivePeriod = Math.min(period, prices.length);
  const isApproximate = effectivePeriod < period;

  const k = 2 / (effectivePeriod + 1);
  const result = new Array(prices.length).fill(null);

  // B1: Seed with SMA of first effectivePeriod values
  const seedSlice = prices.slice(0, effectivePeriod);
  const seed = seedSlice.reduce((a, b) => a + b, 0) / effectivePeriod;
  result[effectivePeriod - 1] = seed;

  // Apply EMA multiplier from the seed point onward
  for (let i = effectivePeriod; i < prices.length; i++) {
    result[i] = (prices[i] - result[i - 1]) * k + result[i - 1];
  }

  result.isApproximate = isApproximate;
  result.period = effectivePeriod;
  return result;
}

// ── B2 Fix: MACD with correct warm-up exclusion ───────────────────────────────
/**
 * Calculates MACD (Moving Average Convergence/Divergence).
 * B2 Fix: The MACD line is only valid from index (longPeriod-1) onward because
 *   the long EMA needs at least longPeriod candles to produce its first SMA seed.
 *   The signal line is calculated only on the valid portion of the MACD line.
 *   Previously the signal EMA ran from index 0 over warm-up noise.
 */
export function calculateMACD(prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  if (!prices || prices.length < longPeriod) {
    return { line: null, macd: null, signal: null, histogram: null, isInsufficient: true };
  }

  const shortEma = calculateEMA(prices, shortPeriod);
  const longEma  = calculateEMA(prices, longPeriod);

  // B2: Only build MACD line from the first valid long-EMA index
  const firstValidIdx = longPeriod - 1;
  const macdLine = new Array(prices.length).fill(null);
  for (let i = firstValidIdx; i < prices.length; i++) {
    if (shortEma[i] !== null && longEma[i] !== null) {
      macdLine[i] = shortEma[i] - longEma[i];
    }
  }

  // Extract only the valid (non-null) MACD values for the signal EMA
  const validMacd = macdLine.filter(v => v !== null);
  const signalArr = calculateEMA(validMacd, signalPeriod);

  const latestMacd   = macdLine[macdLine.length - 1];
  // Map signal back: the last element of validMacd corresponds to the last element of macdLine
  const latestSignal = signalArr[signalArr.length - 1];
  const latestHisto  = (latestMacd !== null && latestSignal !== null)
    ? latestMacd - latestSignal
    : null;

  return {
    line:      latestMacd   !== null ? +latestMacd.toFixed(2)   : null,
    macd:      latestMacd   !== null ? +latestMacd.toFixed(2)   : null,
    signal:    latestSignal !== null ? +latestSignal.toFixed(2) : null,
    histogram: latestHisto  !== null ? +latestHisto.toFixed(2)  : null,
    isInsufficient: false,
    // Full arrays for charting
    macdArray:   macdLine,
    signalArray: signalArr,
  };
}

/**
 * Wilder's Smoothed RSI(14) with strict division-by-zero and flat-market guards.
 * Expects chronological closes (oldest -> newest).
 */
export function calculateRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  const nums = closes.map(Number).filter(v => Number.isFinite(v) && v > 0);
  if (nums.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = nums[i] - nums[i - 1];
    if (diff > 0) avgGain += diff;
    else if (diff < 0) avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < nums.length; i++) {
    const diff = nums[i] - nums[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgGain === 0 && avgLoss === 0) return 50.0;
  if (avgLoss === 0) return 100.0;
  if (avgGain === 0) return 0.0;

  const rs = avgGain / avgLoss;
  return +Number(100 - 100 / (1 + rs)).toFixed(2);
}

export const calculateWilderRSI = calculateRSI;

// ── B3: Bollinger Bands ───────────────────────────────────────────────────────
/**
 * Calculates Bollinger Bands with stdDev, bandwidth, percentB, and squeeze flags.
 */
export function calculateBollingerBands(closes, period = 20, stdDevMult = 2) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(-period).map(Number).filter(Number.isFinite);
  if (slice.length < period) return null;

  const mean = slice.reduce((a, b) => a + b, 0) / period;
  if (mean <= 0) return null;

  const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
  const stdDev = Math.sqrt(Math.max(0, variance));

  const upper = +(mean + stdDevMult * stdDev).toFixed(2);
  const lower = +Math.max(0.01, mean - stdDevMult * stdDev).toFixed(2);
  const bandwidth = +(((upper - lower) / mean) * 100).toFixed(2);
  const lastPrice = slice[slice.length - 1];
  const percentB = (upper - lower) > 0
    ? +((lastPrice - lower) / (upper - lower) * 100).toFixed(2)
    : 50;

  return {
    upper,
    middle: +mean.toFixed(2),
    lower,
    stdDev: +stdDev.toFixed(2),
    bandwidth,
    percentB,
    squeeze: bandwidth <= 8.5,
    isSqueeze: bandwidth <= 8.5,
  };
}

export function calculateVolumeZScore(volumes, period = 20) {
  if (!Array.isArray(volumes) || volumes.length < period) return 0;
  const slice = volumes.slice(-period).map(Number).filter(v => Number.isFinite(v) && v >= 0);
  if (slice.length < period) return 0;

  const currentVol = slice[slice.length - 1];
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(Math.max(0, variance));

  if (stdDev <= 1e-9) return 0;
  return +((currentVol - mean) / stdDev).toFixed(2);
}

// ── B4: Average True Range (ATR) ─────────────────────────────────────────────
/**
 * Calculates Average True Range (Wilder's smoothed method).
 * @param {Array<{high,low,close}>} candles - OHLCV candles (at least period+1)
 * @param {number} period - ATR period (default 14)
 * @returns {number|null}
 */
export function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high  = Number(candles[i].high  || candles[i].h || 0);
    const low   = Number(candles[i].low   || candles[i].l || 0);
    const prevC = Number(candles[i - 1].close || candles[i - 1].c || 0);
    if (high === 0 || low === 0) continue;
    const tr = Math.max(
      high - low,
      Math.abs(high  - prevC),
      Math.abs(low   - prevC),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Seed: simple mean of first `period` true ranges
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return +atr.toFixed(2);
}

// ── Pivot Points (unchanged) ──────────────────────────────────────────────────
export function calculatePivotPoints(highOrStock, low, close) {
  let h, l, c;
  if (typeof highOrStock === 'object' && highOrStock !== null) {
    const ltp = Number(highOrStock.ltp || 0);
    h = Number(highOrStock.high || ltp);
    l = Number(highOrStock.low  || ltp);
    c = Number(highOrStock.close || highOrStock.ltp || ltp);
  } else {
    h = Number(highOrStock || 0);
    l = Number(low  || 0);
    c = Number(close || 0);
  }
  const P  = Number(((h + l + c) / 3).toFixed(2));
  const R1 = Number((2 * P - l).toFixed(2));
  const S1 = Number((2 * P - h).toFixed(2));
  const R2 = Number((P + (h - l)).toFixed(2));
  const S2 = Number((P - (h - l)).toFixed(2));
  const R3 = Number((h + 2 * (P - l)).toFixed(2));
  const S3 = Number((l - 2 * (h - P)).toFixed(2));
  return { P, pp: P, R1, r1: R1, R2, r2: R2, R3, r3: R3, S1, s1: S1, S2, s2: S2, S3, s3: S3 };
}

// ── Fibonacci Retracement (unchanged) ────────────────────────────────────────
export function calculateFibonacci(high52wOrStock, low52w) {
  let h, l;
  if (typeof high52wOrStock === 'object' && high52wOrStock !== null) {
    const ltp = Number(high52wOrStock.ltp || 0);
    h = Number(high52wOrStock.high52w || high52wOrStock.high || ltp);
    l = Number(high52wOrStock.low52w  || high52wOrStock.low  || ltp);
  } else {
    h = Number(high52wOrStock || 0);
    l = Number(low52w || 0);
  }
  const diff = h - l || 1;
  return {
    level_0:   Number(h.toFixed(2)),
    level_236: Number((h - diff * 0.236).toFixed(2)),
    level_382: Number((h - diff * 0.382).toFixed(2)),
    level_500: Number((h - diff * 0.500).toFixed(2)),
    level_618: Number((h - diff * 0.618).toFixed(2)),
    level_786: Number((h - diff * 0.786).toFixed(2)),
    level_1000: Number(l.toFixed(2)),
  };
}

// ── On-Balance Volume (OBV) ──────────────────────────────────────────────────
/**
 * Calculates On-Balance Volume (OBV) series and 20-period moving average.
 * @param {Array<{close: number, volume: number}>} candles - Chronological candles (oldest -> newest)
 * @returns {{ obv: number|null, obvSma20: number|null, isObvTrendingUp: boolean, obvArray: number[] }}
 */
export function calculateOBV(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { obv: null, obvSma20: null, isObvTrendingUp: false, obvArray: [] };
  }

  const obvArray = [0];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = Number(candles[i - 1].close || candles[i - 1].c || 0);
    const curClose = Number(candles[i].close || candles[i].c || 0);
    const vol = Math.max(0, Number(candles[i].volume || candles[i].v || 0));

    let prevObv = obvArray[i - 1];
    if (curClose > prevClose) {
      obvArray.push(prevObv + vol);
    } else if (curClose < prevClose) {
      obvArray.push(prevObv - vol);
    } else {
      obvArray.push(prevObv);
    }
  }

  const latestObv = obvArray[obvArray.length - 1];
  const smaPeriod = Math.min(20, obvArray.length);
  const recentSlice = obvArray.slice(-smaPeriod);
  const obvSma20 = recentSlice.length > 0
    ? Math.round(recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length)
    : null;

  return {
    obv: latestObv,
    obvSma20,
    isObvTrendingUp: obvSma20 !== null ? latestObv >= obvSma20 : false,
    obvArray
  };
}

// ── Average Directional Index (ADX) ──────────────────────────────────────────
/**
 * Calculates ADX (14) with +DI and -DI using Wilder's smoothing.
 * @param {Array<{high: number, low: number, close: number}>} candles - Chronological candles
 * @param {number} period - Default 14
 * @returns {{ adx: number|null, plusDI: number|null, minusDI: number|null, isTrending: boolean, trendDirection: string }}
 */
export function calculateADX(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period * 2) {
    return { adx: null, plusDI: null, minusDI: null, isTrending: false, trendDirection: 'NEUTRAL' };
  }

  const trs = [];
  const plusDMs = [];
  const minusDMs = [];

  for (let i = 1; i < candles.length; i++) {
    const curH = Number(candles[i].high || candles[i].h || 0);
    const curL = Number(candles[i].low || candles[i].l || 0);
    const prevC = Number(candles[i - 1].close || candles[i - 1].c || 0);
    const prevH = Number(candles[i - 1].high || candles[i - 1].h || 0);
    const prevL = Number(candles[i - 1].low || candles[i - 1].l || 0);

    const tr = Math.max(curH - curL, Math.abs(curH - prevC), Math.abs(curL - prevC));
    trs.push(tr);

    const upMove = curH - prevH;
    const downMove = prevL - curL;

    plusDMs.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDMs.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }

  if (trs.length < period) {
    return { adx: null, plusDI: null, minusDI: null, isTrending: false, trendDirection: 'NEUTRAL' };
  }

  let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList = [];
  let plusDI = 0;
  let minusDI = 0;

  for (let i = period; i < trs.length; i++) {
    smoothTR = smoothTR - (smoothTR / period) + trs[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDMs[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDMs[i];

    plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
    dxList.push(dx);
  }

  if (dxList.length < period) {
    return {
      adx: null,
      plusDI: +plusDI.toFixed(2),
      minusDI: +minusDI.toFixed(2),
      isTrending: false,
      trendDirection: plusDI > minusDI ? 'BULLISH' : 'BEARISH'
    };
  }

  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }

  const finalAdx = +adx.toFixed(2);
  const finalPlusDI = +plusDI.toFixed(2);
  const finalMinusDI = +minusDI.toFixed(2);

  return {
    adx: finalAdx,
    plusDI: finalPlusDI,
    minusDI: finalMinusDI,
    isTrending: finalAdx >= 25,
    trendDirection: finalPlusDI > finalMinusDI ? 'BULLISH' : 'BEARISH'
  };
}

// ── Money Flow Index (MFI) ───────────────────────────────────────────────────
/**
 * Calculates Money Flow Index (14) - volume-weighted RSI.
 * @param {Array<{high: number, low: number, close: number, volume: number}>} candles
 * @param {number} period - Default 14
 * @returns {number|null}
 */
export function calculateMFI(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;

  let posFlow = 0;
  let negFlow = 0;

  const validCandles = candles.map(c => {
    const h = Number(c.high || c.h || 0);
    const l = Number(c.low || c.l || 0);
    const cl = Number(c.close || c.c || 0);
    const v = Number(c.volume || c.v || 0);
    const tp = (h + l + cl) / 3;
    return { tp, v, rawFlow: tp * v };
  });

  const slice = validCandles.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].tp > slice[i - 1].tp) {
      posFlow += slice[i].rawFlow;
    } else if (slice[i].tp < slice[i - 1].tp) {
      negFlow += slice[i].rawFlow;
    }
  }

  if (posFlow === 0 && negFlow === 0) return 50.0;
  if (negFlow === 0) return 100.0;
  if (posFlow === 0) return 0.0;

  const moneyRatio = posFlow / negFlow;
  return +(100 - (100 / (1 + moneyRatio))).toFixed(2);
}
