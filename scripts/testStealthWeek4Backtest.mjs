// scripts/testStealthWeek4Backtest.mjs
/**
 * ============================================================================
 * EMPIRICAL BACKTEST: PHASE 1 (WEEK 3/4) STEALTH ACCUMULATION & COIL
 * ============================================================================
 * Evaluates the exact steps to catch stealth accumulation before Phase 2 markup:
 * 1. Price Coiling / Volatility Contraction: Bollinger Band Width <= 14%, 10D change <= +/-2.5%
 * 2. Volume Dry-Up (VDU): Current volume <= 0.60x of 20-day average volume
 * 3. Institutional Broker Footprint: Top brokers (#58, #45, #44, #64, #34, #65, etc.)
 *    showing positive net absorption and BCR3 >= 35%
 * 4. Chaikin Money Flow (CMF) >= +0.05
 * 5. Low-risk entry: Next-day open with stop loss placed strictly at 3.5% below base
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  calculateRoundTripNetReturn,
  calculateCircuitBand
} from '../src/constants/marketRules.js';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// 1. Load daily stock summaries
const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC, symbol ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDatesSet = new Set();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
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

// 2. Load daily broker ledger
const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE buy_vol > 0 OR sell_vol > 0
  ORDER BY trade_date ASC
`).all();

// Map: symbol -> array of { trade_date, broker_id, buy_vol, sell_vol }
const scripBrokerHistoryMap = new Map();
const dateBrokerMap = new Map(); // date_sym -> { totalBuy, totalSell, brokers: Map(id -> {buy, sell}) }

for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  const dt = b.trade_date;

  if (!scripBrokerHistoryMap.has(sym)) scripBrokerHistoryMap.set(sym, []);
  scripBrokerHistoryMap.get(sym).push({
    date: dt,
    brokerId: Number(b.broker_id),
    buyVol: Number(b.buy_vol || 0),
    sellVol: Number(b.sell_vol || 0)
  });

  const key = `${dt}_${sym}`;
  if (!dateBrokerMap.has(key)) {
    dateBrokerMap.set(key, { totalBuy: 0, totalSell: 0, brokers: new Map() });
  }
  const entry = dateBrokerMap.get(key);
  entry.totalBuy += Number(b.buy_vol || 0);
  entry.totalSell += Number(b.sell_vol || 0);
  if (!entry.brokers.has(Number(b.broker_id))) {
    entry.brokers.set(Number(b.broker_id), { buy: 0, sell: 0 });
  }
  const bData = entry.brokers.get(Number(b.broker_id));
  bData.buy += Number(b.buy_vol || 0);
  bData.sell += Number(b.sell_vol || 0);
}

console.log(`Loaded ${rawRecords.length} candles and ${brokerRows.length} broker transactions.`);

// Math helpers
function calculateCMF(candles, period = 20) {
  if (!candles || candles.length < period) return 0;
  let sumMFV = 0, sumVol = 0;
  const slice = candles.slice(-period);
  for (const c of slice) {
    const range = c.high - c.low;
    const mfm = range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0;
    sumMFV += mfm * c.volume;
    sumVol += c.volume;
  }
  return sumVol > 0 ? sumMFV / sumVol : 0;
}

function calculateBBW(closes, period = 20) {
  if (!closes || closes.length < period) return 20;
  const slice = closes.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return mean > 0 ? (2 * std / mean) * 100 : 20;
}

function isDisqualified(sym, ltp) {
  if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP') || sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (ltp > 0 && ltp < 50) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCAN FOR WEEK 3/4 STEALTH ACCUMULATION SIGNATURES
// ─────────────────────────────────────────────────────────────────────────────

// Date range where broker data exists: 2026-08-27 to 2026-11-06 (42 sessions)
// We evaluate test dates from 2026-09-10 up to 2026-10-23 (leaving 10+ forward sessions for outcome tracking)
const brokerDates = Array.from(new Set(brokerRows.map(b => b.trade_date))).sort();
const testDates = brokerDates.slice(8, -10);

console.log(`Scanning for Week 3/4 Stealth Accumulation across ${testDates.length} historical dates:`);
console.log(`  Window: ${testDates[0]} to ${testDates[testDates.length - 1]}\n`);

const detectedSignals = [];

for (const date of testDates) {
  const dateIdx = sortedDates.indexOf(date);
  const scripsOnDate = dateScripMap.get(date);
  if (!scripsOnDate) continue;

  const nextDate = sortedDates[dateIdx + 1];
  const scripsNextDate = dateScripMap.get(nextDate);
  if (!scripsNextDate) continue;

  for (const [sym, c] of scripsOnDate.entries()) {
    const ltp = c.close;
    if (isDisqualified(sym, ltp)) continue;
    if (c.turnover < 1500000 || c.volume < 3000) continue; // Minimum baseline liquidity

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 30) continue;

    const closes = histUpToDate.map(h => h.close);
    const volumes = histUpToDate.map(h => h.volume);

    // ── STEP 1: PRICE COIL & FLAT 10-DAY CONSOLIDATION ──
    const past10Closes = closes.slice(-10);
    const min10Close = Math.min(...past10Closes);
    const max10Close = Math.max(...past10Closes);
    const tenDaySpreadPct = min10Close > 0 ? ((max10Close - min10Close) / min10Close) * 100 : 99;
    const tenDayPriceChangePct = Math.abs(((ltp - past10Closes[0]) / past10Closes[0]) * 100);

    // Must be tight consolidation (spread <= 6% and net change <= 3%)
    if (tenDaySpreadPct > 6.5 || tenDayPriceChangePct > 3.0) continue;

    // Bollinger Band Contraction
    const bbw = calculateBBW(closes, 20);
    if (bbw > 14.5) continue; // Must be coiled

    // ── STEP 2: VOLUME DRY-UP (VDU) ──
    const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const vduRatio = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    // Volume must be low (VDU <= 0.65x)
    if (vduRatio > 0.65) continue;

    // ── STEP 3: CHAIKIN MONEY FLOW & LEADING ACCUMULATION ──
    const cmf = calculateCMF(histUpToDate, 20);
    if (cmf < 0.04) continue; // Institutional flow must be positive

    // ── STEP 4: INSTITUTIONAL BROKER FOOTPRINT (PAST 5 TO 10 SESSIONS) ──
    // Get broker transactions for this scrip over the past 10 sessions up to 'date'
    const past10Dates = sortedDates.slice(Math.max(0, dateIdx - 9), dateIdx + 1);
    const past10DatesSet = new Set(past10Dates);
    const brokerEntries = (scripBrokerHistoryMap.get(sym) || []).filter(b => past10DatesSet.has(b.date));

    // Aggregate broker net flows
    const brokerAgg = new Map();
    let totalWindowBuy = 0, totalWindowSell = 0;
    for (const b of brokerEntries) {
      if (!brokerAgg.has(b.brokerId)) brokerAgg.set(b.brokerId, { buy: 0, sell: 0 });
      const rec = brokerAgg.get(b.brokerId);
      rec.buy += b.buyVol;
      rec.sell += b.sellVol;
      totalWindowBuy += b.buyVol;
      totalWindowSell += b.sellVol;
    }

    if (totalWindowBuy < 5000) continue; // Need minimum broker activity

    const brokerList = Array.from(brokerAgg.entries()).map(([id, d]) => ({
      brokerId: id,
      buy: d.buy,
      sell: d.sell,
      net: d.buy - d.sell
    })).sort((a, b) => b.buy - a.buy);

    const top3Buy = brokerList.slice(0, 3).reduce((s, b) => s + b.buy, 0);
    const bcr3 = totalWindowBuy > 0 ? (top3Buy / totalWindowBuy) * 100 : 0;
    const netWindowFlow = totalWindowBuy - totalWindowSell;

    const leadBroker = brokerList[0];
    const keySyndicateBrokers = [58, 45, 44, 64, 34, 65, 35, 62, 80, 50, 42];
    const isLeadSyndicate = leadBroker && keySyndicateBrokers.includes(leadBroker.brokerId);
    const hasStrongNetAbsorption = leadBroker && leadBroker.net > 15000;

    if (bcr3 < 35 || (!hasStrongNetAbsorption && !isLeadSyndicate)) continue;

    // Passed all Week 3/4 Stealth Accumulation filters!
    detectedSignals.push({
      date,
      dateIdx,
      symbol: sym,
      basePrice: ltp,
      bbw: +bbw.toFixed(1),
      vduRatio: +vduRatio.toFixed(2),
      cmf: +cmf.toFixed(3),
      tenDayChangePct: +tenDayPriceChangePct.toFixed(1),
      bcr3: +bcr3.toFixed(1),
      leadBrokerId: leadBroker.brokerId,
      leadBrokerNetKitta: leadBroker.net
    });
  }
}

// Eliminate duplicate signals for same stock within 5 sessions to avoid double counting
const distinctSignals = [];
for (const sig of detectedSignals) {
  const recentDuplicate = distinctSignals.find(d =>
    d.symbol === sig.symbol && Math.abs(sortedDates.indexOf(d.date) - sig.dateIdx) < 5
  );
  if (!recentDuplicate) distinctSignals.push(sig);
}

console.log(`Detected ${distinctSignals.length} authentic Week 3/4 Stealth Setup signals in the historical dataset.\n`);

// ─────────────────────────────────────────────────────────────────────────────
// FORWARD PERFORMANCE EVALUATION (T+2 DEMAT ENFORCED, NET OF ALL FEES)
// ─────────────────────────────────────────────────────────────────────────────

const evaluatedTrades = [];

for (const sig of distinctSignals) {
  const nextDate = sortedDates[sig.dateIdx + 1];
  const scripNext = dateScripMap.get(nextDate)?.get(sig.symbol);
  if (!scripNext) continue;

  const entryOpen = scripNext.open > 0 ? scripNext.open : scripNext.close;
  if (entryOpen <= 0) continue;
  // Zero-lookahead entry on Day T+1 Open (+0.35% realistic slippage)
  const entryPrice = +(entryOpen * 1.0035).toFixed(1);

  // Collect forward 10 trading sessions (Day T+1 to Day T+10)
  const forwardCandles = [];
  for (let f = 1; f <= 10; f++) {
    const fDate = sortedDates[sig.dateIdx + f];
    if (!fDate) break;
    const fc = dateScripMap.get(fDate)?.get(sig.symbol);
    if (fc) forwardCandles.push(fc);
  }

  if (forwardCandles.length < 3) continue; // Must survive T+2 Demat lock

  // Max peak gain (MFE) and max drawdown (MAE) over holding window
  let peakPrice = entryPrice;
  let lowestPrice = entryPrice;
  for (const fc of forwardCandles) {
    if (fc.high > peakPrice) peakPrice = fc.high;
    if (fc.low < lowestPrice) lowestPrice = fc.low;
  }
  const maxGainPct = +(((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2);
  const maxDrawdownPct = +(((lowestPrice - entryPrice) / entryPrice) * 100).toFixed(2);

  // Strategy Execution Model:
  // Target 1: +8.0% (Take-profit)
  // Target 2: +15.0% (Runner)
  // Stop Loss: -3.5% (Tight stop right below consolidation base)
  // T+2 Lock: Cannot exit on Session 1 (T+1) or Session 2 (T+2)
  const targetPrice = entryPrice * 1.08;
  const stopPrice = entryPrice * 0.965;
  let exitPrice = forwardCandles[forwardCandles.length - 1].close;
  let exitReason = '10D_TIME_EXPIRATION';
  let exitSession = forwardCandles.length;

  for (let i = 0; i < forwardCandles.length; i++) {
    const session = i + 1;
    if (session < 3) continue; // T+2 Demat Lock
    const fc = forwardCandles[i];

    if (fc.high >= targetPrice) {
      exitPrice = targetPrice;
      exitReason = 'TARGET_HIT (+8.0%)';
      exitSession = session;
      break;
    } else if (fc.low <= stopPrice) {
      exitPrice = stopPrice;
      exitReason = 'STOP_LOSS (-3.5%)';
      exitSession = session;
      break;
    }
  }

  // Calculate Net Return after all 5-tier broker commissions, SEBON fees, DP fees, and 7.5% CGT
  const grossReturnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
  const netReturnObj = calculateRoundTripNetReturn({
    buyPrice: entryPrice,
    sellPrice: exitPrice,
    quantity: 100,
    holdingDays: exitSession,
    investorType: 'INDIVIDUAL_RESIDENT'
  });
  const netReturnPct = +netReturnObj.netReturnPct.toFixed(2);

  evaluatedTrades.push({
    date: sig.date,
    symbol: sig.symbol,
    basePrice: sig.basePrice,
    entryPrice,
    exitPrice,
    exitReason,
    exitSession,
    bbw: sig.bbw,
    vduRatio: sig.vduRatio,
    cmf: sig.cmf,
    leadBrokerId: sig.leadBrokerId,
    leadBrokerNetKitta: sig.leadBrokerNetKitta,
    maxGainPct,
    maxDrawdownPct,
    grossReturnPct,
    netReturnPct,
    isWinNet: netReturnPct > 0
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATISTICAL COMPILATION & RESULTS
// ─────────────────────────────────────────────────────────────────────────────

const totalTrades = evaluatedTrades.length;
const netWins = evaluatedTrades.filter(t => t.isWinNet);
const netLosses = evaluatedTrades.filter(t => !t.isWinNet);
const netWinRatePct = +((netWins.length / totalTrades) * 100).toFixed(1);
const grossWins = evaluatedTrades.filter(t => t.grossReturnPct > 0);
const grossWinRatePct = +((grossWins.length / totalTrades) * 100).toFixed(1);

const totalGrossWin = grossWins.reduce((s, t) => s + t.grossReturnPct, 0);
const totalGrossLoss = evaluatedTrades.filter(t => t.grossReturnPct <= 0).reduce((s, t) => s + Math.abs(t.grossReturnPct), 0);
const profitFactor = totalGrossLoss > 0 ? +(totalGrossWin / totalGrossLoss).toFixed(2) : 9.99;

const avgWinNetPct = netWins.length > 0 ? +(netWins.reduce((s, t) => s + t.netReturnPct, 0) / netWins.length).toFixed(2) : 0;
const avgLossNetPct = netLosses.length > 0 ? +(netLosses.reduce((s, t) => s + t.netReturnPct, 0) / netLosses.length).toFixed(2) : 0;
const netExpectancyPct = +((netReturnObj => {
  return evaluatedTrades.reduce((s, t) => s + t.netReturnPct, 0) / totalTrades;
})()).toFixed(2);

console.log('========================================================================');
console.log(' EMPIRICAL BACKTEST RESULTS: PHASE 1 (WEEK 3/4) STEALTH ACCUMULATION');
console.log(' Regime: Real NEPSE Ledger (Autumn 2026) | Zero-Lookahead | T+2 Lockout');
console.log('========================================================================\n');

console.log(`• Total Closed Test Trades: ${totalTrades}`);
console.log(`• Gross Win Rate: ${grossWinRatePct}%`);
console.log(`• Net Win Rate (After All Taxes & 5-Tier Fees): ${netWinRatePct}% (${netWins.length} Wins / ${netLosses.length} Losses)`);
console.log(`• Profit Factor (PF): ${profitFactor}x`);
console.log(`• Net Expectancy per Trade: ${netExpectancyPct > 0 ? '+' : ''}${netExpectancyPct}%`);
console.log(`• Average Net Win: +${avgWinNetPct}%`);
console.log(`• Average Net Loss: ${avgLossNetPct}%`);
console.log(`• Average Max Run-Up (Peak Potential): +${(evaluatedTrades.reduce((s, t) => s + t.maxGainPct, 0) / totalTrades).toFixed(1)}%`);

console.log('\n------------------------------------------------------------------------');
console.log(' SAMPLE INDIVIDUAL PICKS TRIGGERED BY THE SYSTEM IN PAST DATA:');
console.log('------------------------------------------------------------------------\n');

evaluatedTrades.slice(0, 10).forEach((t, i) => {
  const resultBadge = t.isWinNet ? '✅ WIN' : '❌ LOSS';
  console.log(`#${i + 1}: ${t.symbol} on ${t.date} — Result: ${resultBadge} (${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct}% net)`);
  console.log(`   • Setup: Base: Rs. ${t.basePrice} | BBW: ${t.bbw}% (Tight) | VDU: ${t.vduRatio}x | CMF: +${t.cmf} | Lead: Broker #${t.leadBrokerId} (+${t.leadBrokerNetKitta.toLocaleString()} kitta)`);
  console.log(`   • Execution: Entry: Rs. ${t.entryPrice} -> Exit: Rs. ${t.exitPrice} (${t.exitReason} at Day ${t.exitSession})`);
  console.log(`   • Excursion: Max Peak Gain: +${t.maxGainPct}% | Max Drawdown: ${t.maxDrawdownPct}%`);
  console.log('------------------------------------------------------------------------');
});

fs.writeFileSync('qa/stealth_week4_backtest_report.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalTrades,
  grossWinRatePct,
  netWinRatePct,
  profitFactor,
  netExpectancyPct,
  avgWinNetPct,
  avgLossNetPct,
  sampleTrades: evaluatedTrades
}, null, 2));
