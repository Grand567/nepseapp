/**
 * Quantitative Backtesting Engine
 * Simulates trading strategies over historical price data to evaluate performance.
 */
import { calculateMACD, calculateRSI, calculateEMA } from "./indicators.js";

/**
 * Runs a simulated backtest over historical prices.
 * @param {number[]} prices - Array of historical prices (oldest to newest)
 * @param {Function} strategy - A function(pricesSlice) that returns "BUY", "SELL", or "HOLD"
 * @param {number} initialCapital - Starting cash (default Rs. 100,000)
 * @returns {Object} Backtest performance metrics
 */
export function runBacktest(prices, strategy, initialCapital = 100000) {
  if (!prices || prices.length < 30) return { error: "Insufficient data" };

  let cash = initialCapital;
  let holdings = 0;
  let trades = [];
  
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  
  let winningTrades = 0;
  let losingTrades = 0;
  
  // We need a minimum window for indicators to warm up (e.g., 26 days for MACD)
  const warmupPeriod = 30;

  for (let i = warmupPeriod; i < prices.length; i++) {
    const currentPrice = prices[i];
    const priceSlice = prices.slice(0, i + 1);
    
    // Evaluate strategy
    const signal = strategy(priceSlice);

    // Execute logic
    if (signal === "BUY" && cash >= currentPrice) {
      // Buy as many shares as possible (assuming fractional shares are not allowed in NEPSE)
      const sharesToBuy = Math.floor(cash / currentPrice);
      if (sharesToBuy > 0) {
        holdings += sharesToBuy;
        cash -= (sharesToBuy * currentPrice);
        trades.push({ type: "BUY", price: currentPrice, shares: sharesToBuy, index: i });
      }
    } else if (signal === "SELL" && holdings > 0) {
      const sellValue = holdings * currentPrice;
      cash += sellValue;
      
      // Calculate if this specific round-trip was a win or loss
      // To do this simply, we just look at the last buy price
      const lastBuy = trades.slice().reverse().find(t => t.type === "BUY");
      if (lastBuy) {
        if (currentPrice > lastBuy.price) winningTrades++;
        else losingTrades++;
      }
      
      trades.push({ type: "SELL", price: currentPrice, shares: holdings, index: i });
      holdings = 0;
    }

    // Track Drawdown
    const currentTotalValue = cash + (holdings * currentPrice);
    if (currentTotalValue > peakCapital) {
      peakCapital = currentTotalValue;
    }
    const drawdown = (peakCapital - currentTotalValue) / peakCapital;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Force close any open positions at the end of the test
  if (holdings > 0) {
    const finalPrice = prices[prices.length - 1];
    cash += holdings * finalPrice;
    const lastBuy = trades.slice().reverse().find(t => t.type === "BUY");
    if (lastBuy) {
      if (finalPrice > lastBuy.price) winningTrades++;
      else losingTrades++;
    }
    trades.push({ type: "SELL", price: finalPrice, shares: holdings, index: prices.length - 1, note: "Forced Close" });
    holdings = 0;
  }

  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const returnPct = ((cash - initialCapital) / initialCapital) * 100;

  return {
    initialCapital,
    finalCapital: Number(cash.toFixed(2)),
    returnPct: Number(returnPct.toFixed(2)),
    maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: Number(winRate.toFixed(2)),
    trades
  };
}

/**
 * Standard MACD Crossover Strategy
 * BUY when Histogram crosses above 0 (Bullish)
 * SELL when Histogram crosses below 0 (Bearish)
 */
export function macdCrossoverStrategy(pricesSlice) {
  // We need at least 2 periods of MACD to detect a crossover
  const macdCurrent = calculateMACD(pricesSlice);
  const macdPrevious = calculateMACD(pricesSlice.slice(0, -1));

  if (macdPrevious.histogram <= 0 && macdCurrent.histogram > 0) {
    return "BUY";
  } else if (macdPrevious.histogram >= 0 && macdCurrent.histogram < 0) {
    return "SELL";
  }
  return "HOLD";
}

/**
 * Basic RSI Oversold/Overbought Strategy
 * BUY when RSI drops below 30
 * SELL when RSI rises above 70
 */
export function rsiStrategy(pricesSlice) {
  const rsi = calculateRSI(pricesSlice, 14);
  if (rsi < 30) return "BUY";
  if (rsi > 70) return "SELL";
  return "HOLD";
}

/**
 * Institutional Multi-Factor Trend & Momentum Strategy
 * Blends RSI momentum recovery, EMA-20/EMA-50 golden cross, and MACD momentum
 */
export function quantMultiFactorStrategy(pricesSlice) {
  if (!pricesSlice || pricesSlice.length < 35) return "HOLD";
  
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

  // Buy on Golden Cross or Momentum Breakout with positive MACD
  if ((isGoldenCross || (isTrendBullish && macd.histogram > 0)) && isRsiHealthy) {
    return "BUY";
  }

  // Sell on Bearish Cross or Extreme Overbought
  if ((prevEma20 >= prevEma50 && ema20 < ema50) || rsi >= 75 || macd.histogram < -2.0) {
    return "SELL";
  }

  return "HOLD";
}

