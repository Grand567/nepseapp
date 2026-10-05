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
import { generateEntryExitPlan, toAscendingCandles } from './setupAnalyzer.js';


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
        const sellValue    = exitPrice * shares;
        const sellBrok     = calculateBrokerCommission(sellValue);
        // F1: SEBON fee (0.015%) both legs + DP charge on sell
        const buySebonFee  = includeSebonFee ? calculateSebonFee(entryPrice * shares) : 0;
        const sellSebonFee = includeSebonFee ? calculateSebonFee(sellValue) : 0;
        const dpFee        = includeDpCharge ? DP_CHARGE : 0;
        const totalBuyCost = entryPrice * shares + entryBrokerage + buySebonFee;

        const grossPnl  = sellValue - sellBrok - sellSebonFee - dpFee - totalBuyCost;

        // F1: CGT on profitable trades only
        const entryIdx   = candles.findIndex(c => c.date === entryDate);
        const holdDays   = entryIdx >= 0 ? Math.max(1, i - entryIdx) : 1;
        const isLongTerm = holdDays > 365;
        const cgtRate    = isLongTerm ? cgtRateLong : cgtRateShort;
        const cgt        = grossPnl > 0 ? +(grossPnl * cgtRate).toFixed(2) : 0;
        const pnl        = +(grossPnl - cgt).toFixed(2);
        const pnlPct     = +((pnl / (entryPrice * shares)) * 100).toFixed(2);

        const totalFeesThisTrade = +(entryBrokerage + buySebonFee + sellBrok + sellSebonFee + dpFee + cgt).toFixed(2);
        cash += sellValue - sellBrok - sellSebonFee - dpFee - cgt;
        trades.push({
          date: candle.date, type: 'SELL', entryPrice, exitPrice,
          shares, pnl, pnlPct, holdingDays: holdDays, exitReason,
          brokerage: +(entryBrokerage + sellBrok).toFixed(2),
          sebonFee: +(buySebonFee + sellSebonFee).toFixed(2),
          dpFee, cgt, totalFees: totalFeesThisTrade,
          isLongTerm,
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

        // F1: Tiered broker commission + SEBON fee on buy
        const entryBrokerage = calculateBrokerCommission(cost);
        const entrySebon     = includeSebonFee ? calculateSebonFee(cost) : 0;
        cash -= cost + entryBrokerage + entrySebon;
        position = {
          entryPrice, stopPrice, targetPrice, shares,
          entryDate: nextCandle.date, entryBrokerage, entrySebon,
        };
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

  // Force close open position at last candle (with full cost model)
  if (position) {
    const last      = candles[candles.length - 1];
    const exitPrice = Number(last.close);
    const sellValue = exitPrice * position.shares;
    const sellBrok  = calculateBrokerCommission(sellValue);
    const sellSeb   = includeSebonFee ? calculateSebonFee(sellValue) : 0;
    const dpFee     = includeDpCharge ? DP_CHARGE : 0;
    const totalBuyCost = position.entryPrice * position.shares + position.entryBrokerage + (position.entrySebon || 0);
    const grossPnl  = sellValue - sellBrok - sellSeb - dpFee - totalBuyCost;
    const cgt       = grossPnl > 0 ? +(grossPnl * cgtRateShort).toFixed(2) : 0; // assume short-term for forced close
    const pnl       = +(grossPnl - cgt).toFixed(2);
    cash += sellValue - sellBrok - sellSeb - dpFee - cgt;
    trades.push({
      date: last.date, type: 'SELL', entryPrice: position.entryPrice, exitPrice,
      shares: position.shares, pnl,
      pnlPct: +((pnl / (position.entryPrice * position.shares)) * 100).toFixed(2),
      holdingDays: 1, exitReason: 'End of Test',
      brokerage: +(position.entryBrokerage + sellBrok).toFixed(2),
      sebonFee: +((position.entrySebon || 0) + sellSeb).toFixed(2),
      dpFee, cgt,
      totalFees: +((position.entryBrokerage + (position.entrySebon || 0) + sellBrok + sellSeb + dpFee + cgt)).toFixed(2),
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

  // ── F2: Sharpe Ratio (annualised) ───────────────────────────────────────────
  // Use per-trade returns as the return series; annualise assuming 240 NEPSE trading days/yr.
  let sharpeRatio = null;
  if (trades.length >= 3) {
    const returns = trades.map(t => t.pnlPct / 100);
    const meanR   = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - meanR, 2), 0) / returns.length;
    const stdDev  = Math.sqrt(variance);
    const rfPerTrade = riskFreeRate / 240; // daily risk-free rate
    sharpeRatio = stdDev > 0 ? +((meanR - rfPerTrade) / stdDev * Math.sqrt(240)).toFixed(2) : null;
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

// ── Walk-Forward Setup Score Backtest Engine ─────────────────────────────────
/**
 * Walk-Forward Historical Backtest Engine for the 0-100 Setup Score
 * Validates out-of-sample forward predictive power of generateEntryExitPlan setups.
 *
 * @param {Array<object>} rawCandles - Historical OHLCV candle array
 * @param {object} [options]
 * @param {number} [options.step=5] - Step frequency in trading days
 * @param {number} [options.minHistory=30] - Minimum history before evaluating setups
 * @param {Array<number>} [options.horizons=[5, 10, 20]] - Forward horizons in sessions
 * @param {string} [options.symbol='STOCK'] - Stock symbol
 * @param {Array<object>} [options.dividendHistory=[]] - Real dividend history
 * @returns {object} Walk-forward validation results and bucketed statistics
 */
export function runWalkForwardScoreBacktest(rawCandles, options = {}) {
  const candles = toAscendingCandles(rawCandles);
  const minHistory = options.minHistory || 30;
  const horizons = options.horizons || [5, 10, 20];
  const maxHorizon = Math.max(...horizons);
  const step = Math.max(1, options.step || 5);
  const symbol = options.symbol || 'STOCK';
  const dividendHistory = options.dividendHistory || [];

  if (!candles || candles.length < minHistory + maxHorizon + 1) {
    return {
      error: `Insufficient candles for walk-forward backtest. Need at least ${minHistory + maxHorizon + 1} candles, got ${candles?.length || 0}.`,
      totalEvaluations: 0,
      scoreBuckets: {},
      summary: null,
    };
  }

  const evaluations = [];

  for (let i = minHistory - 1; i <= candles.length - maxHorizon - 2; i += step) {
    const historicalSlice = candles.slice(0, i + 1);
    const evalCandle = candles[i];
    const prevCandle = historicalSlice.length > 1 ? historicalSlice[historicalSlice.length - 2] : evalCandle;
    const pChange = prevCandle.close > 0 ? ((evalCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;

    const mockStock = {
      symbol,
      ltp: evalCandle.close,
      close: evalCandle.close,
      pChange,
      previousClose: prevCandle.close,
      volume: evalCandle.volume,
    };

    let plan;
    try {
      plan = generateEntryExitPlan(mockStock, historicalSlice, dividendHistory);
    } catch {
      continue;
    }

    if (!plan || !plan.supported || typeof plan.setupScore !== 'number') {
      continue;
    }

    const nextCandle = candles[i + 1];
    if (!nextCandle || !nextCandle.open) continue;

    // Realistic entry at next-day open price
    const entryPrice = nextCandle.open;
    const entryDate = nextCandle.date;

    // Check circuit filter: NEPSE ±10% circuit limit prevents unrealistic gap fills
    if (evalCandle.close > 0) {
      const openGap = Math.abs((entryPrice - evalCandle.close) / evalCandle.close);
      if (openGap > 0.099) {
        continue;
      }
    }

    const outcomeByHorizon = {};

    for (const h of horizons) {
      const exitIdx = i + 1 + h;
      if (exitIdx < candles.length) {
        const pathCandles = candles.slice(i + 1, exitIdx + 1);
        const exitCandle = candles[exitIdx];
        const exitPrice = exitCandle.close;
        const returnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);

        let maxHigh = entryPrice;
        let minLow = entryPrice;
        for (const bar of pathCandles) {
          if (bar.high > maxHigh) maxHigh = bar.high;
          if (bar.low < minLow) minLow = bar.low;
        }

        const mfePct = +(((maxHigh - entryPrice) / entryPrice) * 100).toFixed(2);
        const maePct = +(((minLow - entryPrice) / entryPrice) * 100).toFixed(2);

        outcomeByHorizon[`T+${h}`] = {
          exitDate: exitCandle.date,
          exitPrice,
          returnPct,
          isWin: returnPct > 0,
          mfePct,
          maePct,
        };
      }
    }

    evaluations.push({
      evalDate: evalCandle.date,
      entryDate,
      entryPrice,
      setupScore: plan.setupScore,
      verdict: plan.verdict,
      setupType: plan.setupType,
      outcomes: outcomeByHorizon,
    });
  }

  // Bucket definitions
  const bucketKeys = ['<50', '50-69', '70-84', '85-100'];
  const getBucketKey = (score) => {
    if (score < 50) return '<50';
    if (score < 70) return '50-69';
    if (score < 85) return '70-84';
    return '85-100';
  };

  const bucketData = {
    '<50': [],
    '50-69': [],
    '70-84': [],
    '85-100': [],
  };

  evaluations.forEach((ev) => {
    const k = getBucketKey(ev.setupScore);
    if (bucketData[k]) bucketData[k].push(ev);
  });

  const scoreBuckets = {};
  for (const bKey of bucketKeys) {
    const evs = bucketData[bKey];
    const n = evs.length;

    const bStats = {
      bucket: bKey,
      count: n,
    };

    for (const h of horizons) {
      const hKey = `T+${h}`;
      const validH = evs.map((e) => e.outcomes[hKey]).filter(Boolean);
      if (validH.length > 0) {
        const wins = validH.filter((o) => o.isWin).length;
        const totalReturn = validH.reduce((acc, o) => acc + o.returnPct, 0);
        const totalMAE = validH.reduce((acc, o) => acc + o.maePct, 0);
        const totalMFE = validH.reduce((acc, o) => acc + o.mfePct, 0);

        bStats[`winRate_${hKey}`] = +((wins / validH.length) * 100).toFixed(1);
        bStats[`avgReturn_${hKey}`] = +(totalReturn / validH.length).toFixed(2);
        bStats[`avgMAE_${hKey}`] = +(totalMAE / validH.length).toFixed(2);
        bStats[`avgMFE_${hKey}`] = +(totalMFE / validH.length).toFixed(2);
      } else {
        bStats[`winRate_${hKey}`] = 0;
        bStats[`avgReturn_${hKey}`] = 0;
        bStats[`avgMAE_${hKey}`] = 0;
        bStats[`avgMFE_${hKey}`] = 0;
      }
    }

    scoreBuckets[bKey] = bStats;
  }

  // Calculate Pearson correlation between setupScore and primary horizon
  const primaryHKey = `T+${horizons[1] || horizons[0] || 10}`;
  const pairs = evaluations
    .map((e) => ({
      x: e.setupScore,
      y: e.outcomes[primaryHKey]?.returnPct,
    }))
    .filter((p) => typeof p.y === 'number' && Number.isFinite(p.y));

  let correlation = 0;
  if (pairs.length > 2) {
    const n = pairs.length;
    const sumX = pairs.reduce((s, p) => s + p.x, 0);
    const sumY = pairs.reduce((s, p) => s + p.y, 0);
    const sumXY = pairs.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pairs.reduce((s, p) => s + p.x * p.x, 0);
    const sumY2 = pairs.reduce((s, p) => s + p.y * p.y, 0);

    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom > 0) {
      correlation = +((n * sumXY - sumX * sumY) / denom).toFixed(3);
    }
  }

  // Check predictive edge: high scores (>=70) outperform low scores (<50)
  const highBucket = scoreBuckets['70-84']?.count > 0 ? scoreBuckets['70-84'] : scoreBuckets['85-100'];
  const lowBucket = scoreBuckets['<50'];
  const retKey = `avgReturn_${primaryHKey}`;
  const predictiveEdge = Boolean(
    highBucket && lowBucket && highBucket.count > 0 && lowBucket.count > 0
      ? highBucket[retKey] > lowBucket[retKey]
      : correlation > 0
  );

  return {
    totalEvaluations: evaluations.length,
    scoreBuckets,
    primaryHorizon: primaryHKey,
    correlation,
    predictiveEdge,
    summary: {
      totalEvaluations: evaluations.length,
      primaryHorizon: primaryHKey,
      correlation,
      predictiveEdge,
      interpretation: predictiveEdge
        ? `Positive quant edge confirmed: higher setup scores historically correlate with superior out-of-sample forward returns (${primaryHKey} correlation: ${correlation}).`
        : `Neutral or mixed edge observed across tested historical candles (${primaryHKey} correlation: ${correlation}).`,
    },
    evaluations: evaluations.slice(-20),
  };
}

