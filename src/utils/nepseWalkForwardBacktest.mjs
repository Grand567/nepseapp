/**
 * src/utils/nepseWalkForwardBacktest.mjs
 * 
 * Production-Grade Quantitative Backtesting & Walk-Forward Validation Engine
 * Calibrated specifically for the Nepal Stock Exchange (NEPSE).
 * 
 * Structural Microstructure Guarantees:
 * 1. T+2 Mandatory Settlement Lock: No exit permitted on Day T or Day T+1.
 * 2. Statutory Friction FY 2083/84: Tiered Broker Commission (0.36%–0.24%),
 *    SEBON Fee (0.015%), DP Charge (Rs. 25), and Short/Long-Term CGT (7.5% / 5.0%).
 * 3. Thin-Liquidity Slippage Model & Participation Limits (<= 5% daily turnover).
 * 4. ±15% Daily Circuit Limit Bounding & Gap-Down Execution Traps.
 * 5. Rolling Walk-Forward Optimization (In-Sample / Out-of-Sample).
 * 6. Market Regime Performance Attribution (Bull, Neutral, Bear).
 */

export const NEPSE_FEES = {
  sebonRate: 0.00015,       // 0.015% SEBON regulatory fee per leg
  dpCharge: 25.0,           // NPR 25 DP fee per sell leg
  minBrokerFee: 10.0,       // NPR 10 minimum broker commission floor
  cgtShortTerm: 0.075,      // 7.5% CGT for holding <= 365 days
  cgtLongTerm: 0.050,       // 5.0% CGT for holding > 365 days
  circuitBandPct: 15.0      // ±15% Daily Stock Circuit Limit
};

/**
 * Official NEPSE Tiered Broker Commission Helper
 */
export function calculateBrokerCommission(amount) {
  const a = Math.max(0, Number(amount || 0));
  if (a <= 0) return 0;
  let rate = 0.0036;
  if (a > 10000000) rate = 0.0024;
  else if (a > 2000000) rate = 0.0027;
  else if (a > 500000) rate = 0.0031;
  else if (a > 50000) rate = 0.0033;
  return Math.max(NEPSE_FEES.minBrokerFee, +(a * rate).toFixed(2));
}

/**
 * Non-linear Liquidity Slippage Model for NEPSE
 * Accounts for wide bid-ask spreads in thin hydropower/microfinance scrips.
 */
export function calculateLiquiditySlippage(orderValue, dailyMedianTurnover = 5000000) {
  const turnover = Math.max(500000, Number(dailyMedianTurnover || 5000000));
  const participation = Math.min(1.0, orderValue / turnover);
  
  // Base spread slippage based on turnover liquidity tier
  let baseSlippage = 0.0015; // 0.15% for highly liquid stocks (> Rs. 2 Cr)
  if (turnover < 2500000) baseSlippage = 0.0120;       // 1.20% for thin scrips (< Rs. 25L)
  else if (turnover < 6000000) baseSlippage = 0.0050;  // 0.50% for moderate liquidity (< Rs. 60L)
  else if (turnover < 20000000) baseSlippage = 0.0025; // 0.25% for standard stocks

  // Quadratic market impact penalty if order consumes > 5% of daily volume
  const marketImpact = participation > 0.05 ? 0.10 * Math.pow(participation, 2) : 0;
  return +(baseSlippage + marketImpact).toFixed(5);
}

/**
 * Classifies NEPSE Market Regime from benchmark index series
 */
export function classifyMarketRegime(indexCandles, currentIdx) {
  if (!Array.isArray(indexCandles) || currentIdx < 50) return 'NEUTRAL';
  const close = Number(indexCandles[currentIdx].close || indexCandles[currentIdx].ltp || 0);
  
  // Compute 50-day EMA
  let ema50 = Number(indexCandles[currentIdx - 50].close);
  const k = 2 / 51;
  for (let i = currentIdx - 49; i <= currentIdx; i++) {
    ema50 = Number(indexCandles[i].close) * k + ema50 * (1 - k);
  }
  
  const ema50Prev = Number(indexCandles[currentIdx - 10].close);
  const isUpTrend = ema50 > ema50Prev;

  if (close > ema50 && isUpTrend) return 'BULL';
  if (close < ema50 && !isUpTrend) return 'BEAR';
  return 'NEUTRAL';
}

/**
 * Core NEPSE Engine: Realistic Trade Simulation with Mandatory T+2 Settlement
 */
export function runNepseSimulation(candles, strategySignalFn, options = {}) {
  const {
    initialCapital = 1000000,
    riskPerTradePct = 0.0125, // 1.25% fixed fractional risk
    maxPositions = 5,
    maxSlotCapitalPct = 0.25, // 25% max allocation per stock
    indexCandles = null,
    riskFreeRateAnnual = 0.035 // 3.5% NRB 91-day T-Bill rate
  } = options;

  if (!Array.isArray(candles) || candles.length < 50) {
    return { error: 'Insufficient candle data (need >= 50 sessions)' };
  }

  let capital = initialCapital;
  let openPositions = []; // { id, symbol, entryDate, entryIdx, shares, entryPrice, stopLoss, target1, target2, regime }
  const closedTrades = [];
  const equityCurve = [{ date: candles[0].date, equity: initialCapital }];

  const WARMUP = 35;

  for (let i = WARMUP; i < candles.length; i++) {
    const today = candles[i];
    const prevCandle = candles[i - 1];
    const prevClose = Number(prevCandle.close || prevCandle.ltp);
    const todayOpen = Number(today.open || prevClose);
    const todayHigh = Number(today.high || todayOpen);
    const todayLow = Number(today.low || todayOpen);
    const todayClose = Number(today.close || todayOpen);
    const todayVolume = Number(today.volume || 10000);
    const todayTurnover = Number(today.turnover || (todayVolume * todayClose));

    const currentRegime = indexCandles ? classifyMarketRegime(indexCandles, Math.min(i, indexCandles.length - 1)) : 'NEUTRAL';

    // ── 1. MANAGE OPEN POSITIONS (EXITS & STOP-LOSSES) ────────────────────────
    const remainingPositions = [];
    for (const pos of openPositions) {
      const holdSessions = i - pos.entryIdx;
      let exitPrice = null;
      let exitReason = null;

      // ⚠️ NEPSE T+2 MANDATORY ENFORCEMENT:
      // Shares bought on Day T can NEVER be sold on Day T (hold=0) or Day T+1 (hold=1).
      // They are settled into Demat only on Day T+2 night, becoming sellable on Day T+3 (hold >= 2).
      const isSettledDematSellable = holdSessions >= 2;

      if (isSettledDematSellable) {
        // A. Lower Circuit Trap Check: If low hit statutory -15% circuit floor and volume dried up
        const lowerCircuitFloor = +(prevClose * 0.85).toFixed(2);
        const isLockedLimitDown = todayLow <= lowerCircuitFloor && todayClose <= lowerCircuitFloor;

        if (todayLow <= pos.stopLoss) {
          if (isLockedLimitDown) {
            // Extreme NEPSE Trap: Order sits unexecuted on zero bids; forced to roll over to next day
            // Or gets filled with maximum negative slippage at circuit floor
            exitPrice = lowerCircuitFloor;
            exitReason = 'Stop-Loss (Circuit Floor Gap-Down)';
          } else {
            exitPrice = Math.min(pos.stopLoss, todayOpen);
            exitReason = 'Stop-Loss Hit';
          }
        } else if (todayHigh >= pos.target2) {
          exitPrice = pos.target2;
          exitReason = 'Target 2 Reached';
        } else if (todayHigh >= pos.target1 && !pos.t1Banked) {
          // Bank 50% profit at T1 and move Stop-Loss to Breakeven
          const sharesToSell = Math.floor(pos.shares / 2 / 10) * 10;
          if (sharesToSell > 0) {
            const partialVal = sharesToSell * pos.target1;
            const slip = calculateLiquiditySlippage(partialVal, todayTurnover);
            const netExitPrice = +(pos.target1 * (1 - slip)).toFixed(2);
            const sellBrokerFee = calculateBrokerCommission(partialVal);
            const sellSebon = +(partialVal * NEPSE_FEES.sebonRate).toFixed(2);
            const netProceeds = partialVal - sellBrokerFee - sellSebon - NEPSE_FEES.dpCharge;
            
            const costBasis = sharesToSell * pos.entryPrice;
            const grossGain = netProceeds - costBasis;
            const cgt = grossGain > 0 ? +(grossGain * NEPSE_FEES.cgtShortTerm).toFixed(2) : 0;
            const realizedPnl = grossGain - cgt;

            capital += netProceeds - cgt;
            closedTrades.push({
              entryDate: pos.entryDate,
              exitDate: today.date,
              shares: sharesToSell,
              entryPrice: pos.entryPrice,
              exitPrice: netExitPrice,
              realizedPnl,
              returnPct: +((realizedPnl / costBasis) * 100).toFixed(2),
              exitReason: 'Target 1 (50% Scale-Out)',
              holdSessions,
              regime: pos.regime
            });

            pos.shares -= sharesToSell;
            pos.stopLoss = +(pos.entryPrice * 1.0075).toFixed(2); // Breakeven + fees
            pos.t1Banked = true;
          }
        }
      }

      // Check full exit execution
      if (exitPrice !== null && pos.shares > 0) {
        const orderVal = pos.shares * exitPrice;
        const slippage = calculateLiquiditySlippage(orderVal, todayTurnover);
        const netExit = +(exitPrice * (1 - slippage)).toFixed(2);
        const sellBrok = calculateBrokerCommission(pos.shares * netExit);
        const sellSebon = +((pos.shares * netExit) * NEPSE_FEES.sebonRate).toFixed(2);
        const netProceeds = (pos.shares * netExit) - sellBrok - sellSebon - NEPSE_FEES.dpCharge;

        const costBasis = pos.shares * pos.entryPrice;
        const grossGain = netProceeds - costBasis;
        const isLongTerm = holdSessions > 365;
        const cgtRate = isLongTerm ? NEPSE_FEES.cgtLongTerm : NEPSE_FEES.cgtShortTerm;
        const cgt = grossGain > 0 ? +(grossGain * cgtRate).toFixed(2) : 0;
        const realizedPnl = grossGain - cgt;

        capital += (netProceeds - cgt);
        closedTrades.push({
          entryDate: pos.entryDate,
          exitDate: today.date,
          shares: pos.shares,
          entryPrice: pos.entryPrice,
          exitPrice: netExit,
          realizedPnl,
          returnPct: +((realizedPnl / costBasis) * 100).toFixed(2),
          exitReason,
          holdSessions,
          regime: pos.regime
        });
      } else {
        remainingPositions.push(pos);
      }
    }
    openPositions = remainingPositions;

    // ── 2. EVALUATE NEW ENTRIES ───────────────────────────────────────────────
    if (openPositions.length < maxPositions) {
      const historicalSlice = candles.slice(0, i);
      const signal = strategySignalFn(today, historicalSlice, currentRegime);

      if (signal && signal.action === 'BUY') {
        const upperLimit = +(prevClose * (1 + NEPSE_FEES.circuitBandPct / 100)).toFixed(2);
        const isCircuitLocked = todayOpen >= (upperLimit * 0.985); // Skip if near ceiling

        if (!isCircuitLocked && signal.stopLoss && signal.stopLoss < todayOpen) {
          const entryPrice = todayOpen;
          const stopLoss = signal.stopLoss;
          const riskPerShare = (entryPrice - stopLoss) + (entryPrice * 0.0075);
          const maxRiskCapital = capital * riskPerTradePct;
          
          let targetShares = Math.floor(maxRiskCapital / riskPerShare);
          
          // Slot cap check (max 25% capital)
          const maxSlotShares = Math.floor((capital * maxSlotCapitalPct) / entryPrice);
          targetShares = Math.min(targetShares, maxSlotShares);

          // Liquidity participation check (<= 5% of daily volume)
          const maxLiquidityShares = Math.floor((todayVolume * 0.05));
          if (maxLiquidityShares >= 10) {
            targetShares = Math.min(targetShares, maxLiquidityShares);
          }

          // Round to NEPSE 10-kitta lot size
          targetShares = Math.floor(targetShares / 10) * 10;

          if (targetShares >= 10) {
            const rawCost = targetShares * entryPrice;
            const slippage = calculateLiquiditySlippage(rawCost, todayTurnover);
            const actualEntryPrice = +(entryPrice * (1 + slippage)).toFixed(2);
            const buyBrok = calculateBrokerCommission(targetShares * actualEntryPrice);
            const buySebon = +((targetShares * actualEntryPrice) * NEPSE_FEES.sebonRate).toFixed(2);
            const totalOutflow = (targetShares * actualEntryPrice) + buyBrok + buySebon;

            if (capital >= totalOutflow) {
              capital -= totalOutflow;
              openPositions.push({
                symbol: signal.symbol || 'SCRIP',
                entryDate: today.date,
                entryIdx: i,
                shares: targetShares,
                entryPrice: actualEntryPrice,
                stopLoss: signal.stopLoss,
                target1: signal.target1 || +(actualEntryPrice * 1.10).toFixed(2),
                target2: signal.target2 || +(actualEntryPrice * 1.20).toFixed(2),
                regime: currentRegime,
                t1Banked: false
              });
            }
          }
        }
      }
    }

    // Mark-to-market daily equity calculation
    let openPositionsValue = 0;
    for (const pos of openPositions) {
      openPositionsValue += pos.shares * todayClose;
    }
    equityCurve.push({ date: today.date, equity: +(capital + openPositionsValue).toFixed(2) });
  }

  return compileBacktestMetrics(closedTrades, equityCurve, initialCapital, riskFreeRateAnnual);
}

/**
 * Compiles comprehensive performance analytics, drawdowns, and regime attribution
 */
export function compileBacktestMetrics(trades, equityCurve, initialCapital, riskFreeRateAnnual = 0.035) {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winRatePct: 0,
      netProfitNpr: 0,
      totalReturnPct: 0,
      profitFactor: 0,
      expectancyNpr: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      regimeBreakdown: {},
      message: 'Zero trades executed within simulation bounds.'
    };
  }

  const wins = trades.filter(t => t.realizedPnl > 0);
  const losses = trades.filter(t => t.realizedPnl <= 0);

  const winCount = wins.length;
  const lossCount = losses.length;
  const winRatePct = +((winCount / totalTrades) * 100).toFixed(2);

  const grossGains = wins.reduce((sum, t) => sum + t.realizedPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnl, 0));

  const avgWin = winCount > 0 ? +(grossGains / winCount).toFixed(2) : 0;
  const avgLoss = lossCount > 0 ? +(grossLosses / lossCount).toFixed(2) : 0;

  const profitFactor = grossLosses > 0 ? +(grossGains / grossLosses).toFixed(2) : (grossGains > 0 ? 99.9 : 0);
  const winProbability = winCount / totalTrades;
  const lossProbability = lossCount / totalTrades;
  const expectancyNpr = +((winProbability * avgWin) - (lossProbability * avgLoss)).toFixed(2);

  // Maximum Drawdown from Equity Curve
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownDuration = 0;
  let currentDdDuration = 0;

  const dailyReturns = [];
  for (let j = 1; j < equityCurve.length; j++) {
    const eq = equityCurve[j].equity;
    const prevEq = equityCurve[j - 1].equity;
    const dayRet = (eq - prevEq) / prevEq;
    dailyReturns.push(dayRet);

    if (eq > peak) {
      peak = eq;
      currentDdDuration = 0;
    } else {
      currentDdDuration++;
      const dd = (peak - eq) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
      if (currentDdDuration > maxDrawdownDuration) maxDrawdownDuration = currentDdDuration;
    }
  }

  const endingEquity = equityCurve[equityCurve.length - 1].equity;
  const netProfitNpr = +(endingEquity - initialCapital).toFixed(2);
  const totalReturnPct = +(((endingEquity - initialCapital) / initialCapital) * 100).toFixed(2);

  // Annualized Sharpe and Sortino (assuming 240 NEPSE trading days per year)
  const nDays = dailyReturns.length;
  const meanDailyRet = nDays > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / nDays : 0;
  const variance = nDays > 1 ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanDailyRet, 2), 0) / (nDays - 1) : 0;
  const stdDaily = Math.sqrt(variance);

  const dailyRf = riskFreeRateAnnual / 240;
  const excessReturn = meanDailyRet - dailyRf;
  const sharpeRatio = stdDaily > 0 ? +((excessReturn / stdDaily) * Math.sqrt(240)).toFixed(2) : 0;

  // Downside deviation for Sortino
  const downsideVar = nDays > 1 ? dailyReturns.reduce((sum, r) => sum + Math.pow(Math.min(0, r - dailyRf), 2), 0) / (nDays - 1) : 0;
  const sortinoRatio = downsideVar > 0 ? +((excessReturn / Math.sqrt(downsideVar)) * Math.sqrt(240)).toFixed(2) : 0;

  // Performance Segmentation by Market Regime
  const regimes = ['BULL', 'NEUTRAL', 'BEAR'];
  const regimeBreakdown = {};
  for (const reg of regimes) {
    const regTrades = trades.filter(t => t.regime === reg);
    const regWins = regTrades.filter(t => t.realizedPnl > 0).length;
    const regPnl = regTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    regimeBreakdown[reg] = {
      tradesCount: regTrades.length,
      winRatePct: regTrades.length > 0 ? +((regWins / regTrades.length) * 100).toFixed(1) : 0,
      netPnlNpr: +regPnl.toFixed(2),
      contributionPct: netProfitNpr !== 0 ? +((regPnl / Math.abs(netProfitNpr)) * 100).toFixed(1) : 0
    };
  }

  return {
    initialCapital,
    endingEquity,
    netProfitNpr,
    totalReturnPct,
    totalTrades,
    winRatePct,
    avgWin,
    avgLoss,
    winLossRatio: avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : 0,
    profitFactor,
    expectancyNpr,
    maxDrawdownPct: +(maxDrawdown * 100).toFixed(2),
    maxDrawdownDurationSessions: maxDrawdownDuration,
    sharpeRatio,
    sortinoRatio,
    regimeBreakdown,
    tradesSample: trades.slice(0, 10)
  };
}

/**
 * Walk-Forward Validation Engine
 * Executes rolling in-sample parameter optimization with out-of-sample forward testing.
 */
export function runWalkForwardValidation(candles, strategyFactoryFn, options = {}) {
  const {
    inSampleSessions = 250,    // ~1 year training window
    outOfSampleSessions = 60,  // ~3 months test window
    paramGrid = [{ bcrThreshold: 35 }, { bcrThreshold: 40 }, { bcrThreshold: 45 }],
    initialCapital = 1000000
  } = options;

  const totalLength = candles.length;
  const minRequired = inSampleSessions + outOfSampleSessions;
  if (totalLength < minRequired) {
    return { error: `Insufficient history for walk-forward test (need >= ${minRequired} sessions, got ${totalLength})` };
  }

  const windows = [];
  let startIdx = 0;
  let oosCumulativeTrades = [];

  while (startIdx + minRequired <= totalLength) {
    const isEnd = startIdx + inSampleSessions;
    const oosEnd = isEnd + outOfSampleSessions;

    const inSampleData = candles.slice(startIdx, isEnd);
    const outOfSampleData = candles.slice(isEnd, oosEnd);

    // 1. Optimize on In-Sample Window
    let bestParam = paramGrid[0];
    let bestScore = -Infinity;

    for (const params of paramGrid) {
      const strategy = strategyFactoryFn(params);
      const isResult = runNepseSimulation(inSampleData, strategy, { initialCapital });
      const score = (isResult.profitFactor || 0) * (isResult.winRatePct || 0);
      if (score > bestScore) {
        bestScore = score;
        bestParam = params;
      }
    }

    // 2. Forward-Test on Out-of-Sample Window with chosen bestParam
    const tunedStrategy = strategyFactoryFn(bestParam);
    const oosResult = runNepseSimulation(outOfSampleData, tunedStrategy, { initialCapital });

    oosCumulativeTrades = oosCumulativeTrades.concat(oosResult.tradesSample || []);

    windows.push({
      windowIdx: windows.length + 1,
      inSamplePeriod: `${inSampleData[0].date} to ${inSampleData[inSampleData.length - 1].date}`,
      outOfSamplePeriod: `${outOfSampleData[0].date} to ${outOfSampleData[outOfSampleData.length - 1].date}`,
      chosenParams: bestParam,
      inSampleProfitFactor: +(bestScore / 100).toFixed(2),
      outOfSampleReturnPct: oosResult.totalReturnPct,
      outOfSampleWinRatePct: oosResult.winRatePct,
      outOfSampleProfitFactor: oosResult.profitFactor
    });

    // Step forward by Out-of-Sample window size
    startIdx += outOfSampleSessions;
  }

  // Walk-Forward Efficiency (WFE) Calculation
  const avgIsReturn = windows.reduce((sum, w) => sum + w.inSampleProfitFactor, 0) / windows.length;
  const avgOosReturn = windows.reduce((sum, w) => sum + (w.outOfSampleProfitFactor || 1), 0) / windows.length;
  const walkForwardEfficiencyPct = avgIsReturn > 0 ? +((avgOosReturn / avgIsReturn) * 100).toFixed(1) : 0;

  return {
    totalWindows: windows.length,
    walkForwardEfficiencyPct,
    isRobust: walkForwardEfficiencyPct >= 60.0,
    windows
  };
}
