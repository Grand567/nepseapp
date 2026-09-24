/**
 * Mathematical Engine for Technical Indicators
 * Calculates standard indicators from historical price arrays.
 */

export function calculateEMA(prices, period) {
  if (!prices || prices.length === 0) return [];
  if (prices.length < period) period = prices.length;

  const k = 2 / (period + 1);
  const ema = [prices[0]];

  for (let i = 1; i < prices.length; i++) {
    const prevEma = ema[i - 1];
    const currentPrice = prices[i];
    const currentEma = (currentPrice - prevEma) * k + prevEma;
    ema.push(currentEma);
  }

  return ema;
}

export function calculateMACD(prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  if (!prices || prices.length < longPeriod) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const shortEma = calculateEMA(prices, shortPeriod);
  const longEma = calculateEMA(prices, longPeriod);
  
  const macdLineArr = [];
  for (let i = 0; i < prices.length; i++) {
    macdLineArr.push(shortEma[i] - longEma[i]);
  }

  const signalLineArr = calculateEMA(macdLineArr, signalPeriod);

  const latestMacdLine = macdLineArr[macdLineArr.length - 1];
  const latestSignalLine = signalLineArr[signalLineArr.length - 1];
  const latestHistogram = latestMacdLine - latestSignalLine;

  return {
    line: Number(latestMacdLine.toFixed(2)),
    signal: Number(latestSignalLine.toFixed(2)),
    histogram: Number(latestHistogram.toFixed(2))
  };
}

export function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) {
    return 50;
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
    let currentGain = 0;
    let currentLoss = 0;

    if (diff >= 0) currentGain = diff;
    else currentLoss = -diff;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Number(rsi.toFixed(2));
}

export function calculatePivotPoints(highOrStock, low, close) {
  let h, l, c;
  if (typeof highOrStock === 'object' && highOrStock !== null) {
    const ltp = Number(highOrStock.ltp || 0);
    h = Number(highOrStock.high || ltp);
    l = Number(highOrStock.low || ltp);
    c = Number(highOrStock.close || highOrStock.ltp || ltp);
  } else {
    h = Number(highOrStock || 0);
    l = Number(low || 0);
    c = Number(close || 0);
  }
  const P = Number(((h + l + c) / 3).toFixed(2));
  const R1 = Number((2 * P - l).toFixed(2));
  const S1 = Number((2 * P - h).toFixed(2));
  const R2 = Number((P + (h - l)).toFixed(2));
  const S2 = Number((P - (h - l)).toFixed(2));
  const R3 = Number((h + 2 * (P - l)).toFixed(2));
  const S3 = Number((l - 2 * (h - P)).toFixed(2));
  return { P, pp: P, R1, r1: R1, R2, r2: R2, R3, r3: R3, S1, s1: S1, S2, s2: S2, S3, s3: S3 };
}

export function calculateFibonacci(high52wOrStock, low52w) {
  let h, l;
  if (typeof high52wOrStock === 'object' && high52wOrStock !== null) {
    const ltp = Number(high52wOrStock.ltp || 0);
    h = Number(high52wOrStock.high52w || high52wOrStock.high || ltp);
    l = Number(high52wOrStock.low52w || high52wOrStock.low || ltp);
  } else {
    h = Number(high52wOrStock || 0);
    l = Number(low52w || 0);
  }
  const diff = h - l || 1;
  return {
    level_0: Number(h.toFixed(2)),
    level_236: Number((h - diff * 0.236).toFixed(2)),
    level_382: Number((h - diff * 0.382).toFixed(2)),
    level_500: Number((h - diff * 0.500).toFixed(2)),
    level_618: Number((h - diff * 0.618).toFixed(2)),
    level_786: Number((h - diff * 0.786).toFixed(2)),
    level_1000: Number(l.toFixed(2)),
  };
}

