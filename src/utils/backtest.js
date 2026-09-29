/**
 * NEPSE Quantitative Backtesting Engine — OHLCV-Aware v2
 * ─────────────────────────────────────────────────────────────────────────────
 * v1: Close-price only simulation (preserved for backward compatibility)
 * v2: runOHLCVBacktest — realistic OHLCV simulation:
 *   • Next-day open entry (T+1 fill, no look-ahead bias)
 *   • Intraday stop-loss & take-profit using High/Low
 *   • SEBON brokerage 0.36% per leg + 0.15% slippage
 *   • Kelly-based risk-per-trade position sizing
 *   • NEPSE T+2 ±15% circuit guard on entry
 */
import { calculateMACD, calculateRSI, calculateEMA } from './indicators.js';

// ── v1 Backward-Compatible Close-Price Backtest ──────────────────────────────
export function runBacktest(prices, strategy, initialCapital = 100000) {
  if (!prices || prices.length < 30) return { error: 'Insufficient data' };
  let cash = initialCapital, holdings = 0, trades = [];
  let peakCapital = initialCapital, maxDrawdown = 0;
  let winningTrades = 0, losingTrades = 0;
  const warmupPeriod = 30;
  for (let i = warmupPeriod; i < prices.length; i++) {
    const currentPrice = prices[i];
    const priceSlice = prices.slice(0, i + 1);
    const signal = strategy(priceSlice);
    if (signal === 'BUY' && cash >= currentPrice) {
      const sharesToBuy = Math.floor(cash / currentPrice);
      if (sharesToBuy > 0) { holdings += sharesToBuy; cash -= sharesToBuy * currentPrice; trades.push({ type: 'BUY', price: currentPrice, shares: sharesToBuy, index: i }); }
    } else if (signal === 'SELL' && holdings > 0) {
      const sellValue = holdings * currentPrice; cash += sellValue;
      const lastBuy = trades.slice().reverse().find(t => t.type === 'BUY');
      if (lastBuy) { if (currentPrice > lastBuy.price) winningTrades++; else losingTrades++; }
      trades.push({ type: 'SELL', price: currentPrice, shares: holdings, index: i }); holdings = 0;
    }
    const currentTotalValue = cash + holdings * currentPrice;
    if (currentTotalValue > peakCapital) peakCapital = currentTotalValue;
    const drawdown = (peakCapital - currentTotalValue) / peakCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  if (holdings > 0) {
    const finalPrice = prices[prices.length - 1]; cash += holdings * finalPrice;
    const lastBuy = trades.slice().reverse().find(t => t.type === 'BUY');
    if (lastBuy) { if (finalPrice > lastBuy.price) winningTrades++; else losingTrades++; }
    trades.push({ type: 'SELL', price: finalPrice, shares: holdings, index: prices.length - 1, note: 'Forced Close' }); holdings = 0;
  }
  const totalTrades = winningTrades + losingTrades;
  return {
    initialCapital, finalCapital: +cash.toFixed(2),
    returnPct: +(((cash - initialCapital) / initialCapital) * 100).toFixed(2),
    maxDrawdownPct: +(maxDrawdown * 100).toFixed(2),
    totalTrades, winningTrades, losingTrades,
    winRate: +(totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0).toFixed(2),
    trades, dataQuality: 'close_only'
  };
}

// ── v2 Realistic OHLCV Backtest ───────────────────────────────────────────────
/**
 * @param {Array<{date:string,open:number,high:number,low:number,close:number,volume:number}>} candles
 * @param {Function} strategyFn (closesSlice, candlesSlice) => 'BUY'|'SELL'|'HOLD'
 * @param {Object} options
 */
export function runOHLCVBacktest(candles, strategyFn, options = {}) {
  const {
    initialCapital = 100000,
    stopLossPct = 5,
    takeProfitPct = 15,
    slippagePct = 0.15,
    brokeragePct = 0.36,
    riskPerTradePct = 2,
  } = options;

  if (!Array.isArray(candles) || candles.length < 40) {
    return { error: 'Insufficient OHLCV history (need 40+ candles)' };
  }

  const CIRCUIT_GUARD = 0.14; // reject entry if open > prevClose × (1 + 14%)
  const BROKERAGE = brokeragePct / 100;
  const SLIPPAGE = slippagePct / 100;
  const SL_MULT = 1 - stopLossPct / 100;
  const TP_MULT = 1 + takeProfitPct / 100;

  let cash = initialCapital;
  let position = null; // { entryPrice, stopPrice, targetPrice, shares, entryDate, entryBrokerage }
  let trades = [];
  let peakCapital = initialCapital;
  let maxDrawdown = 0;

  const WARMUP = 35;

  for (let i = WARMUP; i < candles.length; i++) {
    const candle = candles[i];
    const closesSlice = candles.slice(0, i).map(c => Number(c.close));
    const candlesSlice = candles.slice(0, i);
    const prevClose = Number(candles[i - 1]?.close || candle.open);

    // ── If in a position: check exit conditions using today's OHLC ──
    if (position) {
      const { entryPrice, stopPrice, targetPrice, shares, entryDate, entryBrokerage } = position;
      let exitPrice = null;
      let exitReason = null;

      // Priority 1: Intraday stop-loss (Low touched stop)
      if (Number(candle.low) <= stopPrice) {
        exitPrice = stopPrice; // fill at stop, not day-low
        exitReason = 'Stop-Loss';
      }
      // Priority 2: Take-profit (High touched target)
      else if (Number(candle.high) >= targetPrice) {
        exitPrice = targetPrice;
        exitReason = 'Take-Profit';
      }
      // Priority 3: Strategy SELL signal
      else {
        const signal = strategyFn(closesSlice, candlesSlice);
        if (signal === 'SELL') {
          exitPrice = Number(candle.open); // exit at next open
          exitReason = 'Signal Exit';
        }
      }

      if (exitPrice !== null) {
        const sellBrokerage = exitPrice * shares * BROKERAGE;
        const exitValue = exitPrice * shares - sellBrokerage;
        const pnl = exitValue - (entryPrice * shares + entryBrokerage);
        const pnlPct = (pnl / (entryPrice * shares)) * 100;
        const holdingDays = i - candles.findIndex(c => c.date === entryDate);
        cash += exitValue;
        trades.push({
          date: candle.date, type: 'SELL', entryPrice, exitPrice,
          shares, pnl: +pnl.toFixed(2), pnlPct: +pnlPct.toFixed(2),
          holdingDays: Math.max(1, holdingDays), exitReason,
          brokerage: +(entryBrokerage + sellBrokerage).toFixed(2)
        });
        position = null;
      }
    }

    // ── No position: check if strategy signals BUY ──
    if (!position) {
      const signal = strategyFn(closesSlice, candlesSlice);
      if (signal === 'BUY' && cash > 1000) {
        // Enter at next day open (T+1); if we're at last candle, skip
        if (i + 1 >= candles.length) continue;
        const nextCandle = candles[i + 1];
        const entryOpen = Number(nextCandle.open);

        // Circuit guard: reject near-upper-circuit opens
        if (prevClose > 0 && entryOpen > prevClose * (1 + CIRCUIT_GUARD)) continue;
        if (entryOpen <= 0) continue;

        // Slippage-adjusted entry
        const entryPrice = +(entryOpen * (1 + SLIPPAGE)).toFixed(2);
        const stopPrice = +(entryPrice * SL_MULT).toFixed(2);
        const targetPrice = +(entryPrice * TP_MULT).toFixed(2);

        // Kelly-based position sizing: risk Rs. X, lose stopLossPct% on it
        const riskAmount = cash * (riskPerTradePct / 100);
        const lossPerShare = entryPrice - stopPrice;
        const shares = lossPerShare > 0 ? Math.max(1, Math.floor(riskAmount / lossPerShare)) : 1;
        const cost = entryPrice * shares;
        if (cost > cash) continue; // insufficient capital

        const entryBrokerage = cost * BROKERAGE;
        cash -= cost + entryBrokerage;
        position = { entryPrice, stopPrice, targetPrice, shares, entryDate: nextCandle.date, entryBrokerage };
        i++; // skip next candle since we entered on its open
      }
    }

    // Track drawdown
    const positionValue = position ? position.entryPrice * position.shares : 0;
    const totalValue = cash + positionValue;
    if (totalValue > peakCapital) peakCapital = totalValue;
    const drawdown = peakCapital > 0 ? (peakCapital - totalValue) / peakCapital : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Force close open position at last candle
  if (position) {
    const last = candles[candles.length - 1];
    const exitPrice = Number(last.close);
    const sellBrokerage = exitPrice * position.shares * BROKERAGE;
    const exitValue = exitPrice * position.shares - sellBrokerage;
    const pnl = exitValue - (position.entryPrice * position.shares + position.entryBrokerage);
    cash += exitValue;
    trades.push({
      date: last.date, type: 'SELL', entryPrice: position.entryPrice, exitPrice,
      shares: position.shares, pnl: +pnl.toFixed(2),
      pnlPct: +((pnl / (position.entryPrice * position.shares)) * 100).toFixed(2),
      holdingDays: 1, exitReason: 'End of Test', brokerage: +(position.entryBrokerage + sellBrokerage).toFixed(2)
    });
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalBrokerage = trades.reduce((s, t) => s + (t.brokerage || 0), 0);
  const expectancy = trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;

  return {
    initialCapital, finalCapital: +cash.toFixed(2),
    returnPct: +(((cash - initialCapital) / initialCapital) * 100).toFixed(2),
    maxDrawdownPct: +(maxDrawdown * 100).toFixed(2),
    totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length,
    winRate: +(trades.length > 0 ? (wins.length / trades.length) * 100 : 0).toFixed(2),
    avgWinPct: +avgWinPct.toFixed(2), avgLossPct: +avgLossPct.toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 99.9 : 0),
    totalBrokerage: +totalBrokerage.toFixed(2),
    expectancy: +expectancy.toFixed(2),
    trades, dataQuality: 'ohlcv'
  };
}

// ── Strategy Functions (unchanged) ───────────────────────────────────────────
export function macdCrossoverStrategy(pricesSlice) {
  const macdCurrent = calculateMACD(pricesSlice);
  const macdPrevious = calculateMACD(pricesSlice.slice(0, -1));
  if (macdPrevious.histogram <= 0 && macdCurrent.histogram > 0) return 'BUY';
  if (macdPrevious.histogram >= 0 && macdCurrent.histogram < 0) return 'SELL';
  return 'HOLD';
}

export function rsiStrategy(pricesSlice) {
  const rsi = calculateRSI(pricesSlice, 14);
  if (rsi < 30) return 'BUY';
  if (rsi > 70) return 'SELL';
  return 'HOLD';
}

export function quantMultiFactorStrategy(pricesSlice) {
  if (!pricesSlice || pricesSlice.length < 35) return 'HOLD';
  const rsi = calculateRSI(pricesSlice, 14);
  const ema20Arr = calculateEMA(pricesSlice, 20);
  const ema50Arr = calculateEMA(pricesSlice, 50);
  const macd = calculateMACD(pricesSlice);
  const ema20 = ema20Arr[ema20Arr.length - 1] || 0;
  const ema50 = ema50Arr[ema50Arr.length - 1] || 0;
  const prevEma20 = ema20Arr[ema20Arr.length - 2] || ema20;
  const prevEma50 = ema50Arr[ema50Arr.length - 2] || ema50;
  const isGoldenCross = prevEma20 <= prevEma50 && ema20 > ema50;
  const isTrendBullish = ema20 >= ema50;
  const isRsiHealthy = rsi >= 42 && rsi <= 68;
  if ((isGoldenCross || (isTrendBullish && macd.histogram > 0)) && isRsiHealthy) return 'BUY';
  if ((prevEma20 >= prevEma50 && ema20 < ema50) || rsi >= 75 || macd.histogram < -2.0) return 'SELL';
  return 'HOLD';
}
