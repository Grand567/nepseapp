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
    return { line: null, signal: null, histogram: null, isInsufficient: true };
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
    signal:    latestSignal !== null ? +latestSignal.toFixed(2) : null,
    histogram: latestHisto  !== null ? +latestHisto.toFixed(2)  : null,
    isInsufficient: false,
    // Full arrays for charting
    macdArray:   macdLine,
    signalArray: signalArr,
  };
}

// ── RSI (Wilder's Smoothed Method — unchanged, was already correct) ────────────
export function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) {
    return null; // B6: return null instead of 50 to avoid misleading "neutral" signal
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

// ── B3: Bollinger Bands ───────────────────────────────────────────────────────
/**
 * Calculates Bollinger Bands.
 * @param {number[]} prices - Array of closing prices
 * @param {number} period   - Lookback period (default 20)
 * @param {number} stdDevMult - Standard deviation multiplier (default 2)
 * @returns {{ upper, middle, lower, bandwidth, squeeze, percentB } | null}
 */
export function calculateBollingerBands(prices, period = 20, stdDevMult = 2) {
  if (!prices || prices.length < period) return null;

  const slice = prices.slice(prices.length - period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = +(middle + stdDevMult * stdDev).toFixed(2);
  const lower = +(middle - stdDevMult * stdDev).toFixed(2);
  const bandwidth = middle > 0 ? +((upper - lower) / middle * 100).toFixed(2) : 0;
  const lastPrice = prices[prices.length - 1];
  const percentB = (upper - lower) > 0
    ? +((lastPrice - lower) / (upper - lower) * 100).toFixed(2)
    : 50;

  // Squeeze: bandwidth in the bottom 20th percentile historically (simple proxy: < 5%)
  const squeeze = bandwidth < 5;

  return {
    upper,
    middle: +middle.toFixed(2),
    lower,
    bandwidth,
    percentB,
    squeeze,
  };
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

