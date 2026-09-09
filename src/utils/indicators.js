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
