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
import { calculateBrokerCommission, calculateSebonFee, DP_CHARGE } from './calculations.js';


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
    // F1: Full NEPSE cost model options
    includeSebonFee = true,    // SEBON 0.015% regulatory fee (both legs)
    includeDpCharge = true,    // DP charge Rs.25 per sell transaction
    cgtRateShort = 0.075,      // 7.5% CGT for holdings ≤ 365 days
    cgtRateLong  = 0.050,      // 5.0% CGT for holdings > 365 days
    // F2: Sharpe ratio
    riskFreeRate = 0.065,      // ~6.5% Nepal treasury / savings rate annualised
    // F3: Benchmark comparison
    benchmarkPrices = null,    // optional array of close prices (e.g. NEPSE index) same length as candles
  } = options;

  if (!Array.isArray(candles) || candles.length < 40) {
    return { error: 'Insufficient OHLCV history (need 40+ candles)' };
  }

  // NEPSE circuit limit is ±15%.
  // Using 0.149 (14.9%) as entry guard — rejects opens already at or near upper circuit ceiling (≥15%)
  const CIRCUIT_GUARD = 0.149; // reject entry if open > prevClose × (1 + 14.9%)

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
    const closesSlice = candles.slice(0, i + 1).map(c => Number(c.close));
    const candlesSlice = candles.slice(0, i + 1);
    const prevClose = Number(candles[i - 1]?.close || candle.open);

    // ── If in a position: check exit conditions using today's OHLC ──
    if (position) {
      const { entryPrice, stopPrice, targetPrice, shares, entryDate, entryIdx, entryBrokerage, entrySebon, entryDp } = position;
      let exitPrice = null;
      let exitReason = null;

      // Priority 1: Intraday stop-loss (Low touched stop, gap-down aware)
      if (Number(candle.low) <= stopPrice) {
        exitPrice = Number(candle.open) > 0 ? Math.min(stopPrice, Number(candle.open)) : stopPrice;
        exitReason = 'Stop-Loss';
      }
      // Priority 2: Take-profit (High touched target, gap-up aware)
      else if (Number(candle.high) >= targetPrice) {
        exitPrice = Number(candle.open) > targetPrice ? Number(candle.open) : targetPrice;
        exitReason = 'Take-Profit';
      }
      // Priority 3: Strategy SELL signal (evaluated only after entry bar)
      else if (i > (entryIdx ?? 0)) {
        const signal = strategyFn(closesSlice, candlesSlice);
        if (signal === 'SELL') {
          exitPrice = Number(candle.close);
          exitReason = 'Signal Exit';
        }
      }

      if (exitPrice !== null) {
        const sellValue    = exitPrice * shares;
        const sellBrok     = calculateBrokerCommission(sellValue);
        // F1: SEBON fee (0.015%) both legs + DP charge on both buy and sell legs
        const buySebonFee  = entrySebon || 0;
        const sellSebonFee = includeSebonFee ? calculateSebonFee(sellValue) : 0;
        const buyDpFee     = entryDp || 0;
        const sellDpFee    = includeDpCharge ? DP_CHARGE : 0;
        const totalBuyCost = entryPrice * shares + entryBrokerage + buySebonFee + buyDpFee;

        const grossPnl     = sellValue - sellBrok - sellSebonFee - sellDpFee - totalBuyCost;

        // F1: CGT on profitable trades only
        const holdDays     = entryIdx >= 0 ? Math.max(1, i - entryIdx) : 1;
        const isLongTerm   = holdDays > 365;
        const cgtRate      = isLongTerm ? cgtRateLong : cgtRateShort;
        const cgt          = grossPnl > 0 ? +(grossPnl * cgtRate).toFixed(2) : 0;
        const pnl          = +(grossPnl - cgt).toFixed(2);
        const pnlPct       = +((pnl / totalBuyCost) * 100).toFixed(2);

        const totalFeesThisTrade = +(entryBrokerage + buySebonFee + buyDpFee + sellBrok + sellSebonFee + sellDpFee + cgt).toFixed(2);
        cash += sellValue - sellBrok - sellSebonFee - sellDpFee - cgt;
        trades.push({
          date: candle.date, type: 'SELL', entryPrice, exitPrice,
          shares, pnl, pnlPct, holdingDays: holdDays, exitReason,
          brokerage: +(entryBrokerage + sellBrok).toFixed(2),
          sebonFee: +(buySebonFee + sellSebonFee).toFixed(2),
          dpFee: buyDpFee + sellDpFee, cgt, totalFees: totalFeesThisTrade,
          isLongTerm,
        });
        position = null;
      }

    }

    // ── No position: check if strategy signals BUY ──
    if (!position && i + 1 < candles.length) {
      const signal = strategyFn(closesSlice, candlesSlice);
      if (signal === 'BUY' && cash > 1000) {
        // Enter at next day open (T+1); if we're at last candle, skip
        const nextCandle = candles[i + 1];
        const entryOpen = Number(nextCandle.open);
        const signalClose = Number(candle.close);

        // Circuit guard: reject near-upper-circuit opens
        if (signalClose > 0 && entryOpen > signalClose * (1 + CIRCUIT_GUARD)) continue;
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

        // F1: Tiered broker commission + SEBON fee + DP fee on buy
        const entryBrokerage = calculateBrokerCommission(cost);
        const entrySebon     = includeSebonFee ? calculateSebonFee(cost) : 0;
        const entryDp        = includeDpCharge ? DP_CHARGE : 0;
        if (cost + entryBrokerage + entrySebon + entryDp > cash) continue; // insufficient capital
        cash -= (cost + entryBrokerage + entrySebon + entryDp);
        position = {
          entryPrice, stopPrice, targetPrice, shares,
          entryDate: nextCandle.date, entryIdx: i + 1,
          entryBrokerage, entrySebon, entryDp,
        };
      }
    }

    // Track drawdown
    const positionValue = position ? position.entryPrice * position.shares : 0;
    const totalValue = cash + positionValue;
    if (totalValue > peakCapital) peakCapital = totalValue;
    const drawdown = peakCapital > 0 ? (peakCapital - totalValue) / peakCapital : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Force close open position at last candle (with full cost model)
  if (position) {
    const last      = candles[candles.length - 1];
    const exitPrice = Number(last.close);
    const sellValue = exitPrice * position.shares;
    const sellBrok  = calculateBrokerCommission(sellValue);
    const sellSeb   = includeSebonFee ? calculateSebonFee(sellValue) : 0;
    const buyDpFee  = position.entryDp || 0;
    const sellDpFee = includeDpCharge ? DP_CHARGE : 0;
    const totalBuyCost = position.entryPrice * position.shares + position.entryBrokerage + (position.entrySebon || 0) + buyDpFee;
    const grossPnl  = sellValue - sellBrok - sellSeb - sellDpFee - totalBuyCost;
    const cgt       = grossPnl > 0 ? +(grossPnl * cgtRateShort).toFixed(2) : 0; // assume short-term for forced close
    const pnl       = +(grossPnl - cgt).toFixed(2);
    cash += sellValue - sellBrok - sellSeb - sellDpFee - cgt;
    const totalFees = +(position.entryBrokerage + (position.entrySebon || 0) + buyDpFee + sellBrok + sellSeb + sellDpFee + cgt).toFixed(2);
    trades.push({
      date: last.date, type: 'SELL', entryPrice: position.entryPrice, exitPrice,
      shares: position.shares, pnl,
      pnlPct: +((pnl / totalBuyCost) * 100).toFixed(2),
      holdingDays: position.entryIdx >= 0 ? Math.max(1, (candles.length - 1) - position.entryIdx) : 1,
      exitReason: 'End of Test',
      brokerage: +(position.entryBrokerage + sellBrok).toFixed(2),
      sebonFee: +((position.entrySebon || 0) + sellSeb).toFixed(2),
      dpFee: buyDpFee + sellDpFee, cgt,
      totalFees,
    });
  }

  const wins      = trades.filter(t => t.pnl > 0);
  const losses    = trades.filter(t => t.pnl <= 0);
  const avgWinPct  = wins.length   > 0 ? wins.reduce((s, t)   => s + t.pnlPct, 0) / wins.length   : 0;
  const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const grossProfit    = wins.reduce((s, t)   => s + t.pnl, 0);
  const grossLoss      = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalBrokerage = trades.reduce((s, t) => s + (t.brokerage || 0), 0);
  const totalSebon     = trades.reduce((s, t) => s + (t.sebonFee  || 0), 0);
  const totalDp        = trades.reduce((s, t) => s + (t.dpFee     || 0), 0);
  const totalCgt       = trades.reduce((s, t) => s + (t.cgt       || 0), 0);
  const totalFees      = trades.reduce((s, t) => s + (t.totalFees || 0), 0);
  const expectancy     = trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;
  const strategyReturn = (cash - initialCapital) / initialCapital;

  // ── F2: Sharpe Ratio (annualised with holding-period awareness) ──────────────
  let sharpeRatio = null;
  if (trades.length >= 3) {
    const avgHoldDays = Math.max(1, trades.reduce((s, t) => s + (t.holdingDays || 1), 0) / trades.length);
    const rfPerTrade = (riskFreeRate / 240) * avgHoldDays;
    const excessReturns = trades.map(t => (t.pnlPct / 100) - rfPerTrade);
    const meanExcess = excessReturns.reduce((s, r) => s + r, 0) / excessReturns.length;
    const variance = excessReturns.reduce((s, r) => s + Math.pow(r - meanExcess, 2), 0) / Math.max(1, excessReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    const tradesPerYear = Math.min(240, 240 / avgHoldDays);
    sharpeRatio = stdDev > 0 ? +((meanExcess / stdDev) * Math.sqrt(tradesPerYear)).toFixed(2) : null;
  }

  // ── F3: Buy-and-Hold Benchmark ───────────────────────────────────────────────
  let benchmark = null;
  const bPrices = benchmarkPrices || candles.map(c => Number(c.close));
  if (bPrices && bPrices.length >= 2) {
    const bStart   = Number(bPrices[0]);
    const bEnd     = Number(bPrices[bPrices.length - 1]);
    const bReturn  = bStart > 0 ? (bEnd - bStart) / bStart : 0;
    const bFinal   = +(initialCapital * (1 + bReturn)).toFixed(2);
    const bPeak    = Math.max(...bPrices.map((p, i) => initialCapital * p / bStart));
    const bMinAfterPeak = bPrices.reduce((acc, p, i) => {
      const val = initialCapital * p / bStart;
      const peak = Math.max(...bPrices.slice(0, i + 1).map(x => initialCapital * x / bStart));
      return Math.max(acc, (peak - val) / peak);
    }, 0);
    benchmark = {
      label: benchmarkPrices ? 'NEPSE Index (Buy & Hold)' : 'Stock Buy & Hold',
      initialCapital,
      finalCapital: bFinal,
      returnPct: +(bReturn * 100).toFixed(2),
      maxDrawdownPct: +(bMinAfterPeak * 100).toFixed(2),
      alphaVsStrategy: +((strategyReturn - bReturn) * 100).toFixed(2),
      note: 'Buy-and-hold does not include transaction costs.',
    };
  }

  return {
    initialCapital,
    finalCapital: +cash.toFixed(2),
    returnPct: +(strategyReturn * 100).toFixed(2),
    maxDrawdownPct: +(maxDrawdown * 100).toFixed(2),
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: +(trades.length > 0 ? (wins.length / trades.length) * 100 : 0).toFixed(2),
    avgWinPct:  +avgWinPct.toFixed(2),
    avgLossPct: +avgLossPct.toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 99.9 : 0),
    expectancy: +expectancy.toFixed(2),
    // F1: Full cost breakdown
    totalBrokerage: +totalBrokerage.toFixed(2),
    totalSebonFee:  +totalSebon.toFixed(2),
    totalDpFee:     +totalDp.toFixed(2),
    totalCgt:       +totalCgt.toFixed(2),
    totalFees:      +totalFees.toFixed(2),
    // F2: Sharpe ratio
    sharpeRatio,
    sharpeNote: sharpeRatio !== null
      ? `Annualised Sharpe vs ${(riskFreeRate * 100).toFixed(1)}% risk-free rate.`
      : 'Insufficient trades for Sharpe calculation.',
    // F3: Benchmark
    benchmark,
    trades,
    dataQuality: 'ohlcv_v3',
    costModel: 'full_nepse',
    disclaimer: '⚠️ Backtest results are hypothetical. Past performance does not guarantee future results. ' +
      'Results include NEPSE transaction costs (broker commission, SEBON fee 0.015%, DP Rs.25, CGT) ' +
      'and circuit-limit constraints, but cannot account for real-world slippage, halts, or illiquidity.',
  };
}

// ── Strategy Functions (F4: null-safe for new indicator returns) ──────────────
export function macdCrossoverStrategy(pricesSlice) {
  const macdCurrent  = calculateMACD(pricesSlice);
  const macdPrevious = calculateMACD(pricesSlice.slice(0, -1));
  // F4: MACD now returns null when insufficient data — treat null as 0 for signal comparison
  const currH = macdCurrent?.histogram  ?? null;
  const prevH = macdPrevious?.histogram ?? null;
  if (prevH !== null && currH !== null) {
    if (prevH <= 0 && currH > 0) return 'BUY';
    if (prevH >= 0 && currH < 0) return 'SELL';
  }
  return 'HOLD';
}

export function rsiStrategy(pricesSlice) {
  const rsi = calculateRSI(pricesSlice, 14);
  if (rsi === null) return 'HOLD'; // F4: null-safe
  if (rsi < 30) return 'BUY';
  if (rsi > 70) return 'SELL';
  return 'HOLD';
}

export function quantMultiFactorStrategy(pricesSlice) {
  if (!pricesSlice || pricesSlice.length < 35) return 'HOLD';
  const rsi     = calculateRSI(pricesSlice, 14);
  const ema20Arr = calculateEMA(pricesSlice, 20);
  const ema50Arr = calculateEMA(pricesSlice, 50);
  const macd    = calculateMACD(pricesSlice);

  // F4: null-safe — filter out null warm-up values before accessing last elements
  const nonNullEma20 = ema20Arr.filter(v => v !== null);
  const nonNullEma50 = ema50Arr.filter(v => v !== null);
  if (nonNullEma20.length < 2 || nonNullEma50.length < 2 || rsi === null) return 'HOLD';

  const ema20    = nonNullEma20[nonNullEma20.length - 1];
  const ema50    = nonNullEma50[nonNullEma50.length - 1];
  const prevEma20 = nonNullEma20[nonNullEma20.length - 2];
  const prevEma50 = nonNullEma50[nonNullEma50.length - 2];
  const macdH    = macd?.histogram ?? null;

  const isGoldenCross  = prevEma20 <= prevEma50 && ema20 > ema50;
  const isTrendBullish = ema20 >= ema50;
  const isRsiHealthy   = rsi >= 42 && rsi <= 68;

  if ((isGoldenCross || (isTrendBullish && macdH !== null && macdH > 0)) && isRsiHealthy) return 'BUY';
  if ((prevEma20 >= prevEma50 && ema20 < ema50) || rsi >= 75 || (macdH !== null && macdH < -2.0)) return 'SELL';
  return 'HOLD';
}
