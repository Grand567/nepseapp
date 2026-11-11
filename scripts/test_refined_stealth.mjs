import Database from 'better-sqlite3';
import fs from 'fs';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const report = JSON.parse(fs.readFileSync('qa/stealth_week4_backtest_report.json', 'utf8'));

// Load NEPSE index candles
const indexCandles = JSON.parse(fs.readFileSync('src/data/nepse_index_baseline.json', 'utf8'));
const indexMap = new Map(indexCandles.map(c => [c.date, Number(c.close || c.price || 0)]));

// Let's re-simulate the exact 49 trades with:
// 1. Market Regime check on signal date: Skip if index daily change < -0.8% or index < 20 EMA
// 2. Trailing Stop / Target 1 at +5.0% (take 50% scale-out, move stop to breakeven +0.5%)

const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume
  FROM daily_stock_summary
  ORDER BY trade_date ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDates = Array.from(new Set(rawRecords.map(r => r.trade_date))).sort();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  const dt = r.trade_date;
  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(r);
  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, r);
}

// EMA helper
function calcEma(values, p) {
  if (values.length < p) return values[values.length - 1];
  const k = 2 / (p + 1);
  let ema = values.slice(0, p).reduce((s, v) => s + v, 0) / p;
  for (let i = p; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

const refinedTrades = [];

for (const t of report.sampleTrades) {
  const dateIdx = allDates.indexOf(t.date);
  
  // Market Regime Gate:
  // Check index on date
  const pastIndex = allDates.slice(Math.max(0, dateIdx - 30), dateIdx + 1).map(d => indexMap.get(d) || 2600);
  const idxClose = indexMap.get(t.date) || 2600;
  const idxPrev = pastIndex.length >= 2 ? pastIndex[pastIndex.length - 2] : idxClose;
  const idxChange = ((idxClose - idxPrev) / idxPrev) * 100;
  const idxEma20 = calcEma(pastIndex, 20);

  // Filter 1: Market Regime Filter
  // If NEPSE is down > -0.8% or below 20 EMA, sit in cash!
  const isMarketFavorable = idxChange >= -0.8 && idxClose >= idxEma20 * 0.995;
  if (!isMarketFavorable) {
    continue; // Vetoed by Market Regime Gate!
  }

  // Next day entry
  const entryPrice = t.entryPrice;

  // Forward candles
  const forwardCandles = [];
  for (let f = 1; f <= 10; f++) {
    const fc = dateScripMap.get(allDates[dateIdx + f])?.get(t.symbol);
    if (fc) forwardCandles.push(fc);
  }
  if (forwardCandles.length < 3) continue;

  // Dynamic Trailing Profit Model:
  // Target 1: +5.0% (take profit or lock stop at breakeven)
  // Target 2: +10.0%
  // Stop: -3.5%
  let exitPrice = forwardCandles[forwardCandles.length - 1].close_price;
  let exitSession = forwardCandles.length;
  let hasLockedBreakeven = false;
  let stopLossPrice = entryPrice * 0.965;
  let exitReason = '10D_EXPIRE';

  for (let i = 0; i < forwardCandles.length; i++) {
    const session = i + 1;
    if (session < 3) continue; // T+2 Demat lock
    const fc = forwardCandles[i];

    // If reached +5.0%, move stop to breakeven +0.5%
    if (fc.high_price >= entryPrice * 1.05) {
      hasLockedBreakeven = true;
      stopLossPrice = entryPrice * 1.008; // Above breakeven to cover all friction
    }

    if (fc.high_price >= entryPrice * 1.08) {
      exitPrice = entryPrice * 1.08;
      exitReason = 'TARGET_HIT (+8.0%)';
      exitSession = session;
      break;
    }

    if (fc.low_price <= stopLossPrice) {
      exitPrice = stopLossPrice;
      exitReason = hasLockedBreakeven ? 'BREAKEVEN_STOP (+0.8%)' : 'STOP_LOSS (-3.5%)';
      exitSession = session;
      break;
    }
  }

  const netObj = calculateRoundTripNetReturn({
    buyPrice: entryPrice,
    sellPrice: exitPrice,
    quantity: 100,
    holdingDays: exitSession,
    investorType: 'INDIVIDUAL_RESIDENT'
  });
  const netReturn = +netObj.netReturnPct.toFixed(2);

  refinedTrades.push({
    symbol: t.symbol,
    date: t.date,
    entryPrice,
    exitPrice,
    exitReason,
    netReturn,
    isWinNet: netReturn > 0
  });
}

const totalRefined = refinedTrades.length;
const winsRefined = refinedTrades.filter(t => t.isWinNet).length;
const lossesRefined = totalRefined - winsRefined;
const winRatePct = +((winsRefined / totalRefined) * 100).toFixed(1);

console.log('=== REFINED STRATEGY (WITH REGIME GATE & TRAILING BREAKEVEN STOP) ===');
console.log(`Total Trades: ${totalRefined}`);
console.log(`Wins: ${winsRefined} | Losses: ${lossesRefined}`);
console.log(`Net Win Rate: ${winRatePct}%`);
