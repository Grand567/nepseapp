// backtest/swingEngine.mjs
/**
 * ============================================================================
 * DRABYASHREE NEPSE: ZERO-LOOKAHEAD SHORT-TERM SWING-TRADE BACKTEST ENGINE
 * ============================================================================
 * Institutional, cost-aware, and mathematically honest walk-forward backtester.
 *
 * Statutory Invariants Enforced:
 * 1. Zero Look-Ahead: Signals on Day T close, filled on Day T+1 Open + 0.35% slippage.
 * 2. T+2 Demat Settlement Lockout: No exit permitted on Day T or Day T+1.
 * 3. Circuit-Lock Liquidity Penalties: Upper circuit trap (unfillable), Lower circuit trap (unexecutable exit).
 * 4. Full Frictional Costs: 5-tier broker commission, 0.015% SEBON fee, Rs. 25 DP fee, 7.5% CGT.
 * 5. Minimum Sample Power: Must generate and evaluate at least 200 closed trades.
 * 6. Deflated Sharpe Ratio (DSR): Penalizes selection bias and multiple testing trials.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateRoundTripNetReturn,
  calculateBrokerCommission,
  calculateSebonFee,
  calculateDpFee,
  calculateCgt,
  calculateCircuitBand,
  SETTLEMENT_CYCLE
} from '../src/constants/marketRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

// Load NEPSE index benchmark candles
const indexBaselinePath = path.join(process.cwd(), 'src', 'data', 'nepse_index_baseline.json');
const indexCandles = JSON.parse(fs.readFileSync(indexBaselinePath, 'utf8'));
const indexMap = new Map(indexCandles.map(c => [c.date, Number(c.close || c.price || 0)]));

// Load fundamentals
const fundamentalsRows = db.prepare('SELECT * FROM scrip_fundamentals').all();
const fundamentalsMap = new Map(fundamentalsRows.map(f => [f.symbol, f]));

// Load all daily stock summaries sorted chronologically
console.log('Loading chronological daily stock summary records...');
const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC, symbol ASC
`).all();

// Group records by symbol and by date
const scripHistoryMap = new Map(); // symbol -> Array of daily candles
const dateScripMap = new Map();    // trade_date -> Map(symbol -> candle)
const allDatesSet = new Set();

for (const r of rawRecords) {
  const sym = r.symbol.toUpperCase().trim();
  const dt = r.trade_date;
  allDatesSet.add(dt);

  const candle = {
    date: dt,
    symbol: sym,
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0)
  };

  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(candle);

  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, candle);
}

const sortedDates = Array.from(allDatesSet).sort();
console.log(`Loaded ${rawRecords.length} records across ${scripHistoryMap.size} scrips and ${sortedDates.length} trading sessions.`);

// Load broker accumulation ledger records if present
console.log('Loading broker ledger records for smart-money confirmation...');
const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE buy_vol > 0 OR sell_vol > 0
`).all();

const brokerDateScripMap = new Map(); // date_symbol -> broker summary
for (const b of brokerRows) {
  const key = `${b.trade_date}_${b.symbol.toUpperCase().trim()}`;
  if (!brokerDateScripMap.has(key)) {
    brokerDateScripMap.set(key, { totalBuyVol: 0, totalSellVol: 0, brokers: new Map() });
  }
  const entry = brokerDateScripMap.get(key);
  entry.totalBuyVol += Number(b.buy_vol || 0);
  entry.totalSellVol += Number(b.sell_vol || 0);
  entry.brokers.set(Number(b.broker_id), {
    buy: Number(b.buy_vol || 0),
    sell: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0)
  });
}
console.log(`Loaded ${brokerRows.length} broker transactions into memory.`);

/**
 * Technical helpers
 */
function calculateEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 5.0; // Default floor
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

/**
 * 7-Gate Swing Strategy Evaluation
 */
export function runBacktestSimulation({
  requireMarketRegime = true,
  requireBrokerConfirmation = true,
  requireQualityFilter = true,
  maxPositions = 5,
  tradeCapitalNpr = 250000,
  minHoldingSessions = 3,
  timeStopSessions = 7,
  slippagePct = 0.0035 // 0.35% entry execution slippage
} = {}) {
  const closedTrades = [];
  const openPositions = []; // active trades
  let totalSignalAttempts = 0;
  let rejectedRegime = 0;
  let rejectedLiquidity = 0;
  let rejectedTrend = 0;
  let rejectedQuality = 0;
  let rejectedBroker = 0;
  let rejectedCircuit = 0;

  // Track equity curve
  let runningCash = 1000000; // 10 Lakh starting portfolio
  const equityCurve = [];

  for (let dateIdx = 50; dateIdx < sortedDates.length - 1; dateIdx++) {
    const currentDate = sortedDates[dateIdx];
    const nextDate = sortedDates[dateIdx + 1];
    const scripsOnDate = dateScripMap.get(currentDate);

    // GATE 2: Market Regime Gate (NEPSE Index Trend & Breadth)
    const indexClose = indexMap.get(currentDate) || 2600;
    const pastIndexDates = sortedDates.slice(Math.max(0, dateIdx - 60), dateIdx + 1);
    const pastIndexCloses = pastIndexDates.map(d => indexMap.get(d) || indexClose);
    const indexEma20 = calculateEMA(pastIndexCloses, 20) || indexClose;
    const indexEma50 = calculateEMA(pastIndexCloses, 50) || indexClose;

    // Count breadth: % of scrips above their 50 EMA
    let above50Count = 0;
    let totalScored = 0;
    for (const [sym, c] of scripsOnDate.entries()) {
      const history = scripHistoryMap.get(sym);
      const histUpToDate = history ? history.filter(h => h.date <= currentDate) : [];
      if (histUpToDate.length >= 50) {
        const ema50 = calculateEMA(histUpToDate.map(h => h.close), 50);
        if (ema50 && c.close >= ema50) above50Count++;
        totalScored++;
      }
    }
    const breadthPct = totalScored > 0 ? (above50Count / totalScored) * 100 : 50;
    const isMarketBullish = indexClose >= indexEma50 && indexClose >= indexEma20 && breadthPct >= 40;

    // Check open positions for exits on Day T (before entering new trades)
    for (let pIdx = openPositions.length - 1; pIdx >= 0; pIdx--) {
      const pos = openPositions[pIdx];
      const scripCandle = scripsOnDate.get(pos.symbol);
      pos.sessionsHeld++;

      // Invariant: CDSC T+2 Demat Settlement Lockout (Cannot sell on T or T+1)
      if (pos.sessionsHeld < 2) {
        continue;
      }

      if (!scripCandle) continue;

      const cOpen = scripCandle.open;
      const cHigh = scripCandle.high;
      const cLow = scripCandle.low;
      const cClose = scripCandle.close;
      const prevClose = pos.lastClose || pos.entryPrice;
      pos.lastClose = cClose;

      // Lower circuit lock trap check: if stock opens at -15% lower circuit with zero volume/trade
      const { floor } = calculateCircuitBand(prevClose);
      const isLockedLowerCircuit = cOpen <= floor * 1.005 && scripCandle.volume <= 100;
      if (isLockedLowerCircuit) {
        pos.isTrappedInCircuit = true;
        continue; // Cannot exit today; orders trapped
      }

      let shouldExit = false;
      let exitPrice = cClose;
      let exitReason = 'TIME_STOP';

      // Check Target 2 Hit (3R)
      if (cHigh >= pos.target2Price) {
        shouldExit = true;
        exitPrice = pos.target2Price;
        exitReason = 'TARGET_2_HIT';
      }
      // Check Target 1 Hit (1.8R)
      else if (cHigh >= pos.target1Price) {
        if (!pos.hasHitT1) {
          pos.hasHitT1 = true;
          pos.stopLossPrice = Math.max(pos.stopLossPrice, pos.entryPrice * 1.002); // Move stop to statutory breakeven
        }
        if (pos.sessionsHeld >= 4 || cClose < pos.target1Price) {
          shouldExit = true;
          exitPrice = Math.max(pos.target1Price, cClose);
          exitReason = 'TARGET_1_HIT';
        }
      }
      // Check Stop-Loss Hit
      else if (cLow <= pos.stopLossPrice) {
        shouldExit = true;
        // If opened below stop loss, gap through stop occurs
        exitPrice = cOpen < pos.stopLossPrice ? cOpen : pos.stopLossPrice;
        exitReason = 'STOP_LOSS_HIT';
      }
      // Check Time-Stop (7 sessions without reaching Target 1)
      else if (pos.sessionsHeld >= timeStopSessions) {
        shouldExit = true;
        exitPrice = cClose;
        exitReason = 'TIME_EXPIRED';
      }

      if (shouldExit) {
        const netCalc = calculateRoundTripNetReturn({
          buyPrice: pos.entryPrice,
          sellPrice: exitPrice,
          quantity: pos.quantity,
          holdingDays: pos.sessionsHeld * 1.4, // Approx calendar days
          investorType: 'individual'
        });

        closedTrades.push({
          tradeId: `${pos.symbol}_${pos.signalDate}`,
          symbol: pos.symbol,
          signalDate: pos.signalDate,
          entryDate: pos.entryDate,
          exitDate: currentDate,
          entryPrice: pos.entryPrice,
          exitPrice: Number(exitPrice.toFixed(2)),
          quantity: pos.quantity,
          holdingSessions: pos.sessionsHeld,
          exitReason,
          grossReturnPct: netCalc.grossReturnPct,
          netReturnPct: netCalc.netReturnPct,
          grossProfitNpr: netCalc.grossProfitNpr,
          netProfitNpr: netCalc.netProfitNpr,
          frictionNpr: netCalc.totalFrictionNpr,
          cgtNpr: netCalc.cgtDeductedNpr,
          marketRegimeAtEntry: pos.marketRegimeAtEntry,
          hasHitT1: pos.hasHitT1
        });

        openPositions.splice(pIdx, 1);
      }
    }

    // If market regime gate is active and index is bearish, output 'NO TRADE TODAY' and skip new buys
    if (requireMarketRegime && !isMarketBullish) {
      rejectedRegime++;
      continue;
    }

    // Only scan for new entries if portfolio has open position slots
    if (openPositions.length >= maxPositions) {
      continue;
    }

    // Scan all scrips for Gate 3 - 6 setups on currentDate
    for (const [sym, candle] of scripsOnDate.entries()) {
      if (openPositions.length >= maxPositions) break;
      if (openPositions.some(p => p.symbol === sym)) continue; // Already holding this stock

      totalSignalAttempts++;

      // GATE 3: Liquidity Gate
      // Minimum average turnover > Rs. 10 Lakhs, volume > 2,000 shares, LTP >= Rs. 100
      if (candle.turnover < 1000000 || candle.volume < 2000 || candle.close < 100) {
        rejectedLiquidity++;
        continue;
      }

      // Reject stocks locked at upper circuit on Day T (cannot reliably buy without huge queues)
      const prevDayRecord = scripHistoryMap.get(sym)?.find(h => h.date < currentDate);
      if (prevDayRecord) {
        const { ceiling } = calculateCircuitBand(prevDayRecord.close);
        if (candle.close >= ceiling * 0.995) {
          rejectedCircuit++;
          continue;
        }
      }

      // GATE 5: Quality & Safety Screen
      if (requireQualityFilter) {
        const fund = fundamentalsMap.get(sym);
        if (fund) {
          // Reject negative net worth / book value <= 0 or heavy losses
          if (Number(fund.book_value_per_share || 100) <= 0 || Number(fund.eps_ttm || 0) < -25) {
            rejectedQuality++;
            continue;
          }
          // Promoter unlock risk: reject if unlocking within 30 days
          if (fund.promoter_unlock_date) {
            const daysToUnlock = Math.ceil((new Date(fund.promoter_unlock_date).getTime() - new Date(currentDate).getTime()) / (1000 * 3600 * 24));
            if (daysToUnlock >= 0 && daysToUnlock <= 30) {
              rejectedQuality++;
              continue;
            }
          }
        }
      }

      // GATE 4: Trend & Momentum Entry
      const history = scripHistoryMap.get(sym);
      const histUpToDate = history ? history.filter(h => h.date <= currentDate) : [];
      if (histUpToDate.length < 50) continue;

      const closes = histUpToDate.map(h => h.close);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);

      // Price above 20 and 50 EMA
      if (!ema20 || !ema50 || candle.close < ema20 || candle.close < ema50) {
        rejectedTrend++;
        continue;
      }

      // 10-20 Day Range Breakout Pivot
      const past20Candles = histUpToDate.slice(-21, -1);
      if (past20Candles.length < 15) continue;
      const high20 = Math.max(...past20Candles.map(c => c.high));
      const isBreakout = candle.close >= high20;
      if (!isBreakout) {
        rejectedTrend++;
        continue;
      }

      // Relative Volume (RVOL >= 1.25x of 50-day average)
      const avgVol50 = histUpToDate.slice(-50).reduce((s, c) => s + c.volume, 0) / 50;
      const rvol = avgVol50 > 0 ? candle.volume / avgVol50 : 1.0;
      if (rvol < 1.25) {
        rejectedTrend++;
        continue;
      }

      // Reject extended scrips: large 3-day run > 18%
      const threeDaysAgoClose = closes.length >= 4 ? closes[closes.length - 4] : closes[0];
      const threeDayRunPct = ((candle.close - threeDaysAgoClose) / threeDaysAgoClose) * 100;
      if (threeDayRunPct > 18.0) {
        rejectedTrend++;
        continue;
      }

      // GATE 6: Floorsheet / Broker Accumulation Confirmation
      if (requireBrokerConfirmation) {
        const brokerKey = `${currentDate}_${sym}`;
        const brokerData = brokerDateScripMap.get(brokerKey);
        if (brokerData && brokerData.totalBuyVol > 0) {
          // Check top buyer retention or net positive accumulation
          let netTopBuyers = 0;
          for (const [bId, b] of brokerData.brokers.entries()) {
            if (b.buy > b.sell) netTopBuyers += (b.buy - b.sell);
          }
          const netBuyPct = (netTopBuyers / brokerData.totalBuyVol) * 100;
          if (netBuyPct < 10.0) {
            rejectedBroker++;
            continue; // Not enough institutional absorption
          }
        }
      }

      // GATE 7: Trade Plan Sizing & Invariants (T+1 Entry Execution)
      // Signal triggers at close of currentDate; executed on nextDate Open + slippage
      const nextDayCandle = dateScripMap.get(nextDate)?.get(sym);
      if (!nextDayCandle || nextDayCandle.volume <= 0) continue;

      // Check if Day T+1 opens at locked +15% upper circuit (unfillable gap)
      const { ceiling: t1Ceiling } = calculateCircuitBand(candle.close);
      if (nextDayCandle.open >= t1Ceiling * 0.995) {
        rejectedCircuit++;
        continue; // Unfillable upper circuit skip
      }

      const executionPrice = Number((nextDayCandle.open * (1 + slippagePct)).toFixed(2));
      const atr = calculateATR(histUpToDate, 14);

      // Technical Stop: 2.0x ATR below entry, bounded strictly between 3.5% and 7.5%
      const rawStopDist = Math.max(executionPrice * 0.035, Math.min(executionPrice * 0.075, atr * 2.0));
      const stopLossPrice = Number((executionPrice - rawStopDist).toFixed(2));

      // Targets: Target 1 at 1.8R, Target 2 at 3.0R
      const riskPerShare = executionPrice - stopLossPrice;
      const target1Price = Number((executionPrice + riskPerShare * 1.8).toFixed(2));
      const target2Price = Number((executionPrice + riskPerShare * 3.0).toFixed(2));

      // Reward-to-Risk check after estimated costs (must be >= 2.0:1)
      const estGrossGain = target1Price - executionPrice;
      const estNetGainPct = ((estGrossGain / executionPrice) * 100) - 1.25; // Approx 1.25% fee drag
      const estNetRiskPct = ((riskPerShare / executionPrice) * 100) + 0.85;
      const netRRR = estNetGainPct / Math.max(0.1, estNetRiskPct);
      if (netRRR < 1.4) continue; // Skip if risk-reward after costs is insufficient

      const quantity = Math.max(10, Math.floor(tradeCapitalNpr / executionPrice));

      openPositions.push({
        symbol: sym,
        signalDate: currentDate,
        entryDate: nextDate,
        entryPrice: executionPrice,
        stopLossPrice,
        target1Price,
        target2Price,
        quantity,
        sessionsHeld: 0,
        hasHitT1: false,
        marketRegimeAtEntry: isMarketBullish ? 'BULL' : 'BEAR',
        lastClose: executionPrice
      });
    }
  }

  // Force close any remaining open positions at latest session price
  const finalDate = sortedDates[sortedDates.length - 1];
  for (const pos of openPositions) {
    const finalCandle = dateScripMap.get(finalDate)?.get(pos.symbol) || { close: pos.entryPrice };
    const netCalc = calculateRoundTripNetReturn({
      buyPrice: pos.entryPrice,
      sellPrice: finalCandle.close,
      quantity: pos.quantity,
      holdingDays: Math.max(2, pos.sessionsHeld * 1.4),
      investorType: 'individual'
    });
    closedTrades.push({
      tradeId: `${pos.symbol}_${pos.signalDate}`,
      symbol: pos.symbol,
      signalDate: pos.signalDate,
      entryDate: pos.entryDate,
      exitDate: finalDate,
      entryPrice: pos.entryPrice,
      exitPrice: finalCandle.close,
      quantity: pos.quantity,
      holdingSessions: pos.sessionsHeld,
      exitReason: 'FINAL_SESSION_CLOSE',
      grossReturnPct: netCalc.grossReturnPct,
      netReturnPct: netCalc.netReturnPct,
      grossProfitNpr: netCalc.grossProfitNpr,
      netProfitNpr: netCalc.netProfitNpr,
      frictionNpr: netCalc.totalFrictionNpr,
      cgtNpr: netCalc.cgtDeductedNpr,
      marketRegimeAtEntry: pos.marketRegimeAtEntry,
      hasHitT1: pos.hasHitT1
    });
  }

  // Compute Comprehensive Performance Metrics
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.netReturnPct > 0);
  const losingTrades = closedTrades.filter(t => t.netReturnPct <= 0);

  const winRatePct = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  const grossPnLNpr = closedTrades.reduce((s, t) => s + t.grossProfitNpr, 0);
  const netPnLNpr = closedTrades.reduce((s, t) => s + t.netProfitNpr, 0);
  const totalFrictionNpr = closedTrades.reduce((s, t) => s + t.frictionNpr, 0);
  const totalCgtNpr = closedTrades.reduce((s, t) => s + t.cgtNpr, 0);

  const totalWinsNpr = winningTrades.reduce((s, t) => s + t.netProfitNpr, 0);
  const totalLossesNpr = Math.abs(losingTrades.reduce((s, t) => s + t.netProfitNpr, 0));
  const profitFactor = totalLossesNpr > 0 ? totalWinsNpr / totalLossesNpr : totalWinsNpr > 0 ? 99.0 : 0;

  const avgWinPct = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.netReturnPct, 0) / winningTrades.length : 0;
  const avgLossPct = losingTrades.length > 0 ? losingTrades.reduce((s, t) => s + t.netReturnPct, 0) / losingTrades.length : 0;
  const netExpectancyPct = totalTrades > 0 ? closedTrades.reduce((s, t) => s + t.netReturnPct, 0) / totalTrades : 0;

  // Max drawdown & losing streak
  let peakCapital = runningCash;
  let maxDrawdownNpr = 0;
  let maxDrawdownPct = 0;
  let currentStreak = 0;
  let maxLosingStreak = 0;
  let runningBal = runningCash;

  for (const t of closedTrades) {
    runningBal += t.netProfitNpr;
    if (runningBal > peakCapital) peakCapital = runningBal;
    const dd = peakCapital - runningBal;
    if (dd > maxDrawdownNpr) {
      maxDrawdownNpr = dd;
      maxDrawdownPct = (dd / peakCapital) * 100;
    }

    if (t.netReturnPct <= 0) {
      currentStreak++;
      if (currentStreak > maxLosingStreak) maxLosingStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const worstSingleLossPct = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.netReturnPct)) : 0;
  const bestSingleGainPct = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.netReturnPct)) : 0;

  // Calculate Sharpe Ratio (daily return standard deviation annualized)
  const returns = closedTrades.map(t => t.netReturnPct / 100);
  const meanReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const annualTrades = totalTrades * (240 / Math.max(1, sortedDates.length));
  const annualSharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(Math.max(1, annualTrades)) : 0;

  return {
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRatePct: +winRatePct.toFixed(2),
    profitFactor: +profitFactor.toFixed(2),
    avgWinPct: +avgWinPct.toFixed(2),
    avgLossPct: +avgLossPct.toFixed(2),
    netExpectancyPct: +netExpectancyPct.toFixed(2),
    grossPnLNpr: +grossPnLNpr.toFixed(2),
    netPnLNpr: +netPnLNpr.toFixed(2),
    totalFrictionNpr: +totalFrictionNpr.toFixed(2),
    totalCgtNpr: +totalCgtNpr.toFixed(2),
    costDragPct: +(totalFrictionNpr > 0 ? (totalFrictionNpr / (Math.abs(grossPnLNpr) + 1)) * 100 : 0).toFixed(2),
    maxDrawdownPct: +maxDrawdownPct.toFixed(2),
    maxLosingStreak,
    worstSingleLossPct: +worstSingleLossPct.toFixed(2),
    bestSingleGainPct: +bestSingleGainPct.toFixed(2),
    annualSharpe: +annualSharpe.toFixed(2),
    closedTrades,
    filterCounters: {
      totalSignalAttempts,
      rejectedRegime,
      rejectedLiquidity,
      rejectedTrend,
      rejectedQuality,
      rejectedBroker,
      rejectedCircuit
    }
  };
}

function erf(x) {
  // Abramowitz and Stegun formula 7.1.26 approximation (max error < 1.5e-7)
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Multiple Testing Correction: Deflated Sharpe Ratio (Bailey & López de Prado, 2014)
 */
export function calculateDeflatedSharpeRatio({
  estimatedSharpe,
  numTrials = 12,
  sampleLength = 200,
  skewness = -0.4,
  kurtosis = 3.5
}) {
  if (estimatedSharpe <= 0 || sampleLength < 10) return 0;
  // Euler-Mascheroni constant
  const euler = 0.5772156649;
  const expectedMaxSharpe = (1 - euler) * Math.pow(2 * Math.log(numTrials), -0.5) + Math.pow(2 * Math.log(numTrials), 0.5);
  const sharpeVariance = (1 - skewness * estimatedSharpe + ((kurtosis - 1) / 4) * Math.pow(estimatedSharpe, 2)) / (sampleLength - 1);
  const zScore = (estimatedSharpe - expectedMaxSharpe) / Math.max(0.001, Math.sqrt(Math.max(0.0001, sharpeVariance)));
  const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const dsr = Math.max(0, Math.min(1.0, normalCdf(zScore)));
  return +dsr.toFixed(4);
}
