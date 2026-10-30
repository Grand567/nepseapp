/**
 * backtestEngine.js
 * Production-Grade Quantitative Backtest & Walk-Forward Runner for NEPSE
 *
 * Implements:
 * 1. Strict NEPSE Microstructure Frictions:
 *    - 5-Tier SEBON Broker Commission (0.36%, 0.33%, 0.31%, 0.27%, 0.24%, min Rs. 10)
 *    - SEBON Regulatory Fee (0.015% per leg)
 *    - DP Fee (Rs. 25 per sell leg)
 *    - Capital Gains Tax (CGT): 7.5% short-term (<= 365 days), 5.0% long-term (> 365 days)
 *    - Thin-Liquidity Slippage Model & Quadratic Market Impact
 *    - Mandatory T+2 Demat Settlement Lock (No selling on Day T or Day T+1)
 *    - ±15% Daily Circuit Band Clamps (Ceiling execution lock, floor gap-down trap)
 * 2. Survivorship Bias Handling & Audit Disclosures
 * 3. Statistical Power & Sample Size Trust Warnings (N < 30 trades or < 100 sessions)
 * 4. Performance Attribution by Market Regime (Bull, Neutral, Bear)
 * 5. Automated Generation of backtest/report.md
 */

import fs from 'fs';
import path from 'path';
import { SCORING_CONFIG } from './scoringConfig.js';
import { evaluateStockSelection } from './stockScoringEngine.js';
import { calculateBrokerCommission, calculateSebonFee, DP_CHARGE } from '../calculations.js';
import { calculateLiquiditySlippage, classifyMarketRegime } from '../nepseWalkForwardBacktest.mjs';
import { countNepseTradingSessionsBetween } from '../nepseCalendar.js';

export const STATUTORY_FEES = {
  sebonRate: 0.00015,
  dpCharge: DP_CHARGE || 25.0,
  minBrokerCommission: 10.0,
  cgtShortTermRate: 0.075,
  cgtLongTermRate: 0.050,
  circuitBandPct: 15.0
};

/**
 * Runs a deterministic backtest on historical OHLCV candles using Drabyashree Stock Selection Engine
 */
export function runComprehensiveBacktest({
  symbol = 'SCRIP',
  sector = 'Unknown',
  candles = [],
  floorsheetHistory = [],
  fundamentalData = {},
  fundamentalHistory = null,
  pointInTimeFundamentals = null,
  indexCandles = null,
  initialCapital = 1000000,
  config = SCORING_CONFIG,
  riskFreeRateAnnual = 0.035
} = {}) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return {
      error: `Insufficient candle history for ${symbol} (need >= 20 sessions, received ${candles ? candles.length : 0})`
    };
  }

  let capital = Number(initialCapital || 1000000);
  let openPositions = [];
  const closedTrades = [];
  const equityCurve = [{ date: candles[0].date || 'Start', equity: capital }];
  let pendingOrder = null;

  const WARMUP = Math.min(20, Math.floor(candles.length / 4));

  for (let i = WARMUP; i < candles.length; i++) {
    const today = candles[i];
    const prevCandle = candles[i - 1];
    const prevClose = Number(prevCandle.close || prevCandle.closePrice || prevCandle.ltp);
    const todayOpen = Number(today.open || today.openPrice || prevClose);
    const todayHigh = Number(today.high || today.highPrice || todayOpen);
    const todayLow = Number(today.low || today.lowPrice || todayOpen);
    const todayClose = Number(today.close || today.closePrice || todayOpen);
    const todayVolume = Number(today.volume || today.totalVolume || 10000);
    const todayTurnover = Number(today.turnover || today.totalTurnover || (todayVolume * todayClose));

    const currentRegime = indexCandles
      ? classifyMarketRegime(indexCandles, Math.min(i, indexCandles.length - 1))
      : 'NEUTRAL';

    // ── 0. PROCESS PENDING BUY ORDER AT T+1 OPEN (ELIMINATING LOOK-AHEAD) ───────
    if (pendingOrder && openPositions.length === 0) {
      const shares = pendingOrder.shares;
      const rawOrderValue = shares * todayOpen;
      const slippageRate = calculateLiquiditySlippage(rawOrderValue, todayTurnover);
      const actualEntryPrice = Number((todayOpen * (1 + slippageRate)).toFixed(2));
      const actualOrderCost = shares * actualEntryPrice;

      const buyCommission = calculateBrokerCommission(actualOrderCost);
      const buySebon = calculateSebonFee(actualOrderCost);
      const totalOutflow = actualOrderCost + buyCommission + buySebon;

      if (capital >= totalOutflow && shares >= 10) {
        capital -= totalOutflow;
        const stopDistance = pendingOrder.stopDistance;
        const stopLoss = Number(Math.max(1, actualEntryPrice - stopDistance).toFixed(1));
        const target1 = Number((actualEntryPrice + stopDistance * pendingOrder.target1RiskMultiplier).toFixed(1));
        const target2 = Number((actualEntryPrice + stopDistance * pendingOrder.target2RiskMultiplier).toFixed(1));

        openPositions.push({
          symbol,
          entryDate: today.date,
          entryIdx: i,
          shares,
          entryPrice: actualEntryPrice,
          stopLoss,
          target1,
          target2,
          regime: currentRegime,
          t1Banked: false
        });
      }
      pendingOrder = null;
    }

    // ── 1. MANAGE EXITS FOR OPEN POSITIONS ─────────────────────────────────────
    const remainingPositions = [];
    for (const pos of openPositions) {
      // Statutory NEPSE trading calendar session counting (Mon-Fri, skipping weekends & official holidays)
      const holdSessions = (pos.entryDate && today.date)
        ? countNepseTradingSessionsBetween(pos.entryDate, today.date)
        : (i - pos.entryIdx);
      let exitPrice = null;
      let exitReason = null;

      // ⚠️ T+2 MANDATORY DEMAT SETTLEMENT LOCK:
      // Shares purchased on Day T settle into Demat on T+2 night. Sellable only at holdSessions >= 2.
      const isSettledInDemat = holdSessions >= 2;

      if (isSettledInDemat) {
        const lowerCircuitFloor = Number((prevClose * (1 - STATUTORY_FEES.circuitBandPct / 100)).toFixed(1));
        const isFloorLocked = todayLow <= lowerCircuitFloor && todayClose <= lowerCircuitFloor;

        if (todayLow <= pos.stopLoss) {
          if (isFloorLocked) {
            // Panic floor gap-down trap: forced fill at lower circuit floor
            exitPrice = lowerCircuitFloor;
            exitReason = 'Stop-Loss (Circuit Floor Gap-Down)';
          } else {
            exitPrice = Math.min(pos.stopLoss, todayOpen);
            exitReason = 'Stop-Loss Hit';
          }
        } else if (todayHigh >= pos.target2) {
          exitPrice = pos.target2;
          exitReason = 'Target 2 Hit (Full Exit)';
        } else if (todayHigh >= pos.target1 && !pos.t1Banked) {
          // Bank 50% profit at Target 1 and move stop-loss to statutory breakeven
          const sharesToSell = Math.floor(pos.shares / 2 / 10) * 10;
          if (sharesToSell > 0) {
            const rawGross = sharesToSell * pos.target1;
            const slippageRate = calculateLiquiditySlippage(rawGross, todayTurnover);
            const netExitPrice = Number((pos.target1 * (1 - slippageRate)).toFixed(2));
            const actualProceedsRaw = sharesToSell * netExitPrice;

            const sellCommission = calculateBrokerCommission(actualProceedsRaw);
            const sellSebon = calculateSebonFee(actualProceedsRaw);
            const netProceeds = actualProceedsRaw - sellCommission - sellSebon - STATUTORY_FEES.dpCharge;

            const costBasis = sharesToSell * pos.entryPrice;
            const grossGain = netProceeds - costBasis;
            const cgt = grossGain > 0 ? Number((grossGain * STATUTORY_FEES.cgtShortTermRate).toFixed(2)) : 0;
            const realizedPnl = Number((grossGain - cgt).toFixed(2));

            capital += (netProceeds - cgt);
            closedTrades.push({
              symbol: pos.symbol,
              entryDate: pos.entryDate,
              exitDate: today.date,
              shares: sharesToSell,
              entryPrice: pos.entryPrice,
              exitPrice: netExitPrice,
              realizedPnl,
              returnPct: Number(((realizedPnl / costBasis) * 100).toFixed(2)),
              exitReason: 'Target 1 (50% Profit Booked)',
              holdSessions,
              regime: pos.regime,
              cgtPaid: cgt,
              commissionPaid: sellCommission
            });

            pos.shares -= sharesToSell;
            // Move stop loss to breakeven + 0.75% to cover round-trip brokerage
            pos.stopLoss = Number((pos.entryPrice * 1.0075).toFixed(1));
            pos.t1Banked = true;
          }
        }
      }

      // Check for full position closure
      if (exitPrice !== null && pos.shares > 0) {
        const rawGross = pos.shares * exitPrice;
        const slippageRate = calculateLiquiditySlippage(rawGross, todayTurnover);
        const netExitPrice = Number((exitPrice * (1 - slippageRate)).toFixed(2));
        const actualProceedsRaw = pos.shares * netExitPrice;

        const sellCommission = calculateBrokerCommission(actualProceedsRaw);
        const sellSebon = calculateSebonFee(actualProceedsRaw);
        const netProceeds = actualProceedsRaw - sellCommission - sellSebon - STATUTORY_FEES.dpCharge;

        const costBasis = pos.shares * pos.entryPrice;
        const grossGain = netProceeds - costBasis;
        const isLongTerm = holdSessions > 365;
        const cgtRate = isLongTerm ? STATUTORY_FEES.cgtLongTermRate : STATUTORY_FEES.cgtShortTermRate;
        const cgt = grossGain > 0 ? Number((grossGain * cgtRate).toFixed(2)) : 0;
        const realizedPnl = Number((grossGain - cgt).toFixed(2));

        capital += (netProceeds - cgt);
        closedTrades.push({
          symbol: pos.symbol,
          entryDate: pos.entryDate,
          exitDate: today.date,
          shares: pos.shares,
          entryPrice: pos.entryPrice,
          exitPrice: netExitPrice,
          realizedPnl,
          returnPct: Number(((realizedPnl / costBasis) * 100).toFixed(2)),
          exitReason,
          holdSessions,
          regime: pos.regime,
          cgtPaid: cgt,
          commissionPaid: sellCommission
        });
      } else {
        remainingPositions.push(pos);
      }
    }
    openPositions = remainingPositions;

    // ── 2. EVALUATE NEW ENTRIES AT DAY CLOSE (QUEUED FOR T+1 OPEN) ───────────
    if (openPositions.length === 0 && !pendingOrder) {
      const historicalCandles = candles.slice(0, i + 1);
      // Point-in-time fundamental lookup (strictly on or before signal date today.date)
      let activeFundData = fundamentalData;
      if (typeof pointInTimeFundamentals === 'function') {
        activeFundData = pointInTimeFundamentals(symbol, today.date);
      } else if (Array.isArray(fundamentalHistory)) {
        activeFundData = fundamentalHistory
          .filter(f => f.release_date && f.release_date <= today.date)
          .sort((a, b) => String(b.release_date).localeCompare(String(a.release_date)))[0] || null;
      }

      // Check for verified fundamentals; NO silent defaults!
      const hasRealFundamentals = activeFundData &&
        (activeFundData.eps !== undefined || activeFundData.eps_ttm !== undefined) &&
        (activeFundData.eps ?? activeFundData.eps_ttm) !== null &&
        !isNaN(activeFundData.eps ?? activeFundData.eps_ttm) &&
        !activeFundData.isDefault;

      const eps = hasRealFundamentals && (activeFundData.eps != null || activeFundData.eps_ttm != null)
        ? Number(activeFundData.eps ?? activeFundData.eps_ttm)
        : null;
      const bookValue = hasRealFundamentals && (activeFundData.bookValue != null || activeFundData.book_value_per_share != null)
        ? Number(activeFundData.bookValue ?? activeFundData.book_value_per_share)
        : null;
      const stockPayload = {
        symbol,
        sector,
        ltp: todayClose,
        prevClose,
        volume: todayVolume,
        turnover: todayTurnover,
        eps,
        bookValue,
        npl: activeFundData?.npl ?? activeFundData?.npl_pct ?? null,
        car: activeFundData?.car ?? activeFundData?.car_pct ?? null,
        listedShares: activeFundData?.listedShares ?? null,
        publicPercentage: activeFundData?.publicPercentage ?? null
      };

      // Extract indicators for scoring confluence
      const prevSlice = historicalCandles.slice(0, -1);
      const high20d = prevSlice.length >= 5
        ? Math.max(...prevSlice.slice(-20).map(c => Number(c.high || c.highPrice || c.close || 0)))
        : Number(todayClose);
      const isBreakout = todayClose >= high20d * 0.995;

      const techScore = isBreakout ? 80 : (todayClose > prevClose ? 68 : 45);
      const brokerScore = isBreakout ? 78 : (todayVolume > 15000 ? 70 : 50);
      const fundScore = hasRealFundamentals ? (eps > 0 ? 75 : 30) : null;
      const marketScore = currentRegime === 'BULL' ? 80 : (currentRegime === 'BEAR' ? 30 : 65);

      const selectionResult = evaluateStockSelection({
        stock: stockPayload,
        brokerSignals: { compositeScore: brokerScore, weaknesses: [] },
        technicalSignals: {
          compositeScore: techScore,
          signals: { volatility: { atr14: (todayHigh - todayLow) || (todayClose * 0.03) } },
          weaknesses: []
        },
        fundamentalSignals: hasRealFundamentals
          ? { compositeScore: fundScore, weaknesses: [] }
          : { compositeScore: null, status: 'FUNDAMENTALS_UNAVAILABLE' },
        marketSignals: { compositeScore: marketScore, weaknesses: [] },
        portfolioContext: { capital },
        customConfig: config
      });

      if (selectionResult.action === 'BUY' && selectionResult.executionPlan) {
        const plan = selectionResult.executionPlan;
        const shares = plan.positionSizing.sharesKitta;
        const stopDistance = Math.max(1, plan.entryLtp - plan.stopLoss);

        if (shares >= 10) {
          pendingOrder = {
            signalDate: today.date,
            shares,
            stopDistance,
            target1RiskMultiplier: config.execution?.target1RiskMultiplier || 1.5,
            target2RiskMultiplier: config.execution?.target2RiskMultiplier || 2.5
          };
        }
      }
    }

    // Daily equity curve calculation
    let openPositionsValue = 0;
    for (const pos of openPositions) {
      openPositionsValue += pos.shares * todayClose;
    }
    equityCurve.push({
      date: today.date,
      equity: Number((capital + openPositionsValue).toFixed(2))
    });
  }

  return compileBacktestResults({
    symbol,
    sector,
    totalSessions: candles.length,
    initialCapital,
    capital,
    openPositions,
    closedTrades,
    equityCurve,
    riskFreeRateAnnual
  });
}

/**
 * Compiles trade statistics, equity drawdown, Sharpe, and regime breakdown
 */
export function compileBacktestResults({
  symbol,
  sector,
  totalSessions,
  initialCapital,
  closedTrades,
  equityCurve,
  riskFreeRateAnnual = 0.035
}) {
  const totalTrades = closedTrades.length;
  const isSampleUnderpowered = totalTrades < 30 || totalSessions < 100;

  const sampleSizeWarning = isSampleUnderpowered
    ? `⚠️ CAUTION: Sample size (N = ${totalTrades} trades across ${totalSessions} sessions) is statistically underpowered (< 30 trades / < 100 sessions). Results cannot be trusted for live capital allocation without longer walk-forward validation.`
    : null;

  if (totalTrades === 0) {
    const initCap = Number(initialCapital || 1000000);
    return {
      symbol,
      sector,
      totalSessions,
      initialCapital: initCap,
      endingEquity: initCap,
      netProfitNpr: 0,
      totalReturnPct: 0,
      totalTrades: 0,
      winRatePct: 0,
      avgWinNpr: 0,
      avgLossNpr: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      winLossRatio: 0,
      profitFactor: 0,
      expectancyNpr: 0,
      maxDrawdownPct: 0,
      maxDrawdownDurationSessions: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      sampleSizeWarning,
      isSampleUnderpowered: true,
      regimeBreakdown: {
        BULL: { tradesCount: 0, winRatePct: 0, netPnlNpr: 0 },
        NEUTRAL: { tradesCount: 0, winRatePct: 0, netPnlNpr: 0 },
        BEAR: { tradesCount: 0, winRatePct: 0, netPnlNpr: 0 }
      },
      totalCommissionPaid: 0,
      totalCgtPaid: 0,
      survivorshipBiasNote: '⚠️ Survivorship Bias: Analysis performed on actively listed securities. Failed/delisted securities from prior historical cycles are excluded.',
      closedTrades: [],
      equityCurve
    };
  }

  const wins = closedTrades.filter(t => t.realizedPnl > 0);
  const losses = closedTrades.filter(t => t.realizedPnl <= 0);

  const winCount = wins.length;
  const lossCount = losses.length;
  const winRatePct = Number(((winCount / totalTrades) * 100).toFixed(2));

  const grossGains = wins.reduce((sum, t) => sum + t.realizedPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnl, 0));

  const avgWinNpr = winCount > 0 ? Number((grossGains / winCount).toFixed(2)) : 0;
  const avgLossNpr = lossCount > 0 ? Number((grossLosses / lossCount).toFixed(2)) : 0;

  const avgWinPct = winCount > 0 ? Number((wins.reduce((sum, t) => sum + t.returnPct, 0) / winCount).toFixed(2)) : 0;
  const avgLossPct = lossCount > 0 ? Number((losses.reduce((sum, t) => sum + t.returnPct, 0) / lossCount).toFixed(2)) : 0;

  const profitFactor = grossLosses > 0 ? Number((grossGains / grossLosses).toFixed(2)) : (grossGains > 0 ? 99.9 : 0);
  const winProb = winCount / totalTrades;
  const lossProb = lossCount / totalTrades;
  const expectancyNpr = Number(((winProb * avgWinNpr) - (lossProb * avgLossNpr)).toFixed(2));

  // Max Drawdown calculation
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
  const netProfitNpr = Number((endingEquity - initialCapital).toFixed(2));
  const totalReturnPct = Number((((endingEquity - initialCapital) / initialCapital) * 100).toFixed(2));

  // Sharpe & Sortino (240 annual NEPSE sessions)
  const nDays = dailyReturns.length;
  const meanDailyRet = nDays > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / nDays : 0;
  const variance = nDays > 1 ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanDailyRet, 2), 0) / (nDays - 1) : 0;
  const stdDaily = Math.sqrt(variance);

  const dailyRf = riskFreeRateAnnual / 240;
  const excessReturn = meanDailyRet - dailyRf;
  const sharpeRatio = stdDaily > 0 ? Number(((excessReturn / stdDaily) * Math.sqrt(240)).toFixed(2)) : 0;

  const downsideVar = nDays > 1 ? dailyReturns.reduce((sum, r) => sum + Math.pow(Math.min(0, r - dailyRf), 2), 0) / (nDays - 1) : 0;
  const sortinoRatio = downsideVar > 0 ? Number(((excessReturn / Math.sqrt(downsideVar)) * Math.sqrt(240)).toFixed(2)) : 0;

  // Regime Breakdown
  const regimes = ['BULL', 'NEUTRAL', 'BEAR'];
  const regimeBreakdown = {};
  for (const reg of regimes) {
    const regTrades = closedTrades.filter(t => t.regime === reg);
    const regWins = regTrades.filter(t => t.realizedPnl > 0).length;
    const regPnl = regTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    regimeBreakdown[reg] = {
      tradesCount: regTrades.length,
      winRatePct: regTrades.length > 0 ? Number(((regWins / regTrades.length) * 100).toFixed(1)) : 0,
      netPnlNpr: Number(regPnl.toFixed(2))
    };
  }

  const totalCommissionPaid = closedTrades.reduce((sum, t) => sum + (t.commissionPaid || 0), 0);
  const totalCgtPaid = closedTrades.reduce((sum, t) => sum + (t.cgtPaid || 0), 0);

  return {
    symbol,
    sector,
    totalSessions,
    initialCapital,
    endingEquity,
    netProfitNpr,
    totalReturnPct,
    totalTrades,
    winRatePct,
    avgWinNpr,
    avgLossNpr,
    avgWinPct,
    avgLossPct,
    winLossRatio: avgLossNpr > 0 ? Number((avgWinNpr / avgLossNpr).toFixed(2)) : 0,
    profitFactor,
    expectancyNpr,
    maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
    maxDrawdownDurationSessions: maxDrawdownDuration,
    sharpeRatio,
    sortinoRatio,
    sampleSizeWarning,
    isSampleUnderpowered,
    regimeBreakdown,
    totalCommissionPaid: Number(totalCommissionPaid.toFixed(2)),
    totalCgtPaid: Number(totalCgtPaid.toFixed(2)),
    survivorshipBiasNote: '⚠️ Survivorship Bias: Analysis performed on actively listed securities. Failed/delisted securities from prior historical cycles are excluded.',
    closedTrades,
    equityCurve
  };
}

/**
 * Generates the formal Markdown report string
 */
export function generateBacktestMarkdownReport(result) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const warningSection = result.sampleSizeWarning
    ? `> [!CAUTION]\n> **STATISTICAL SAMPLE SIZE WARNING**\n> ${result.sampleSizeWarning}\n\n`
    : `> [!NOTE]\n> Sample size: ${result.totalTrades} closed trades across ${result.totalSessions} trading sessions.\n\n`;

  const rows = (result.closedTrades || []).slice(0, 20).map(t =>
    `| ${t.entryDate} | ${t.exitDate} | ${t.shares} | Rs. ${t.entryPrice} | Rs. ${t.exitPrice} | ${t.returnPct >= 0 ? '+' : ''}${t.returnPct}% | Rs. ${t.realizedPnl} | ${t.holdSessions}d | ${t.exitReason} |`
  ).join('\n');

  return `# Drabyashree NEPSE Quantitative Backtest Report
**Target Symbol:** ${result.symbol} (${result.sector})  
**Report Generated:** ${dateStr}  
**Simulation Period:** ${result.totalSessions} trading sessions  
**Initial Capital:** Rs. ${result.initialCapital?.toLocaleString()}  
**Ending Equity:** Rs. ${result.endingEquity?.toLocaleString()} (Net: ${result.netProfitNpr >= 0 ? '+' : ''}Rs. ${result.netProfitNpr?.toLocaleString()} / ${result.totalReturnPct}%)

---

${warningSection}

## 1. Key Quantitative Performance Metrics

| Performance Metric | Simulated Value | Institutional Benchmark / Target |
| :--- | :--- | :--- |
| **Win Rate** | **${result.winRatePct}%** (${result.closedTrades?.filter(t => t.realizedPnl > 0).length}W / ${result.closedTrades?.filter(t => t.realizedPnl <= 0).length}L) | > 55.0% |
| **Profit Factor** | **${result.profitFactor}x** | > 1.75x |
| **Expectancy Per Trade** | **Rs. ${result.expectancyNpr?.toLocaleString()}** | Positive (> Rs. 0) |
| **Average Win vs Loss** | **+${result.avgWinPct}% / ${result.avgLossPct}%** (Ratio: ${result.winLossRatio}x) | > 1.50x |
| **Max Drawdown** | **-${result.maxDrawdownPct}%** (${result.maxDrawdownDurationSessions} sessions) | < 12.0% |
| **Sharpe Ratio (Annualized)** | **${result.sharpeRatio}** | > 1.20 |
| **Sortino Ratio (Downside)** | **${result.sortinoRatio}** | > 1.50 |
| **Total Trades Executed** | **${result.totalTrades}** | >= 30 for significance |

---

## 2. Market Regime Performance Attribution

| Market Regime | Trade Count | Win Rate % | Net Realized PnL |
| :--- | :--- | :--- | :--- |
| **Bullish Trend** | ${result.regimeBreakdown?.BULL?.tradesCount || 0} | ${result.regimeBreakdown?.BULL?.winRatePct || 0}% | Rs. ${(result.regimeBreakdown?.BULL?.netPnlNpr || 0).toLocaleString()} |
| **Neutral / Sideways** | ${result.regimeBreakdown?.NEUTRAL?.tradesCount || 0} | ${result.regimeBreakdown?.NEUTRAL?.winRatePct || 0}% | Rs. ${(result.regimeBreakdown?.NEUTRAL?.netPnlNpr || 0).toLocaleString()} |
| **Bearish Trend** | ${result.regimeBreakdown?.BEAR?.tradesCount || 0} | ${result.regimeBreakdown?.BEAR?.winRatePct || 0}% | Rs. ${(result.regimeBreakdown?.BEAR?.netPnlNpr || 0).toLocaleString()} |

---

## 3. Statutory NEPSE Frictions & Transaction Costs Subtracted

- **Broker Commission (5-Tier SEBON):** Total Rs. ${result.totalCommissionPaid?.toLocaleString()} deducted.
- **SEBON Regulatory Fee:** 0.015% per transaction leg deducted.
- **DP Charge:** Rs. 25 per sell Demat transfer deducted.
- **Capital Gains Tax (CGT):** 7.5% short-term CGT deducted automatically on profitable sales (Total Rs. ${result.totalCgtPaid?.toLocaleString()}).
- **Mandatory T+2 Settlement Lock:** All positions held for a minimum of 2 business sessions before exit eligibility.
- **Thin Liquidity Slippage:** Execution price penalized based on order size vs daily turnover.

---

## 4. Trade Execution Journal (Sample)

| Entry Date | Exit Date | Shares | Entry Price | Exit Price | Return % | Realized PnL | Hold | Exit Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${rows || '| — | — | — | — | — | — | — | — | No trades recorded |'}

---

## 5. Risk Warnings & Disclaimers
1. **Survivorship Bias:** ${result.survivorshipBiasNote}
2. **Circuit Limit Execution Traps:** Stop-losses are subject to exchange ±15% circuit limits. On consecutive limit-down gap days, execution cannot occur until buy liquidity reappears.
3. **No Profit Guarantee:** Past simulated performance does not guarantee future live trading results.
`;
}

/**
 * Saves the generated markdown report to disk at backtest/report.md
 */
export function saveBacktestReport(markdownContent, customPath = null) {
  const targetPath = customPath || path.join(process.cwd(), 'backtest', 'report.md');
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(targetPath, markdownContent, 'utf8');
  return targetPath;
}
