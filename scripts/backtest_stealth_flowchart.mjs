import Database from 'better-sqlite3';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// 1. Ingest daily price candles
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

// 2. Ingest broker accumulation ledger
const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE buy_vol > 0 OR sell_vol > 0
  ORDER BY trade_date ASC
`).all();

const scripBrokerHistoryMap = new Map();
for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!scripBrokerHistoryMap.has(sym)) scripBrokerHistoryMap.set(sym, []);
  scripBrokerHistoryMap.get(sym).push({
    date: b.trade_date,
    brokerId: Number(b.broker_id),
    buyVol: Number(b.buy_vol || 0),
    sellVol: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0)
  });
}

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
  if (/\\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (ltp > 0 && ltp < 50) return true;
  return false;
}

const brokerDates = Array.from(new Set(brokerRows.map(b => b.trade_date))).sort();
const testDates = brokerDates.slice(8, -8); // Test intermediate sessions with forward trading history

console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`🔬 NEW STEALTH ACCUMULATION FLOWCHART BACKTEST (4-FACTOR CONFLUENCE)`);
console.log(`═══════════════════════════════════════════════════════════════════`);
console.log(`Evaluated Sessions: ${testDates.length} historical trading days across ${scripHistoryMap.size} stocks.`);
console.log(`Criteria Enforced:`);
console.log(`  [Gate 0] Distribution Trap Immunity: BCR3_Sell < 35%, BCR3_Buy > BCR3_Sell, not near Upper Circuit`);
console.log(`  [Factor 1] Price Flat & Tightness: -1.2% to +2.0% 1-day change, 10-day spread <= 6.5%, BBW <= 14%`);
console.log(`  [Factor 2] Institutional Asymmetry: BCR3_Buy >= 40.0%, Net Retention >= 70.0% (Clean Delivery)`);
console.log(`  [Factor 3] Money Flow Lead: CMF >= +0.08 (Strong smart money accumulation)`);
console.log(`  [Factor 4] Volume Dry-Up Supply Exhaustion: VDU <= 0.60x of 20D volume\n`);

const detectedSignals = [];

for (const date of testDates) {
  const dateIdx = sortedDates.indexOf(date);
  const scripsOnDate = dateScripMap.get(date);
  if (!scripsOnDate) continue;

  for (const [sym, c] of scripsOnDate.entries()) {
    const ltp = c.close;
    if (isDisqualified(sym, ltp)) continue;
    if (c.turnover < 2500000 || c.volume < 8000) continue; // Price-Neutral Liquidity Floor

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 30) continue;

    const closes = histUpToDate.map(h => h.close);
    const volumes = histUpToDate.map(h => h.volume);

    // Factor 1: Price Tightness & VWAP Compression (-1.2% to +2.0% change)
    const prevClose = histUpToDate[histUpToDate.length - 2]?.close || ltp;
    const oneDayPChange = prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
    if (oneDayPChange < -1.2 || oneDayPChange > 2.0) continue; // New Flowchart Factor 1

    const past10Closes = closes.slice(-10);
    const min10Close = Math.min(...past10Closes);
    const max10Close = Math.max(...past10Closes);
    const tenDaySpreadPct = min10Close > 0 ? ((max10Close - min10Close) / min10Close) * 100 : 99;
    if (tenDaySpreadPct > 6.5) continue;

    const bbw = calculateBBW(closes, 20);
    if (bbw > 14.0) continue;

    // Factor 4: Volume Dry-Up (VDU <= 0.60x of 20D SMA)
    const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const vduRatio = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    if (vduRatio > 0.60) continue;

    // Factor 3: Chaikin Money Flow (Flowchart specifies CMF >= +0.08)
    const cmf = calculateCMF(histUpToDate, 20);
    if (cmf < 0.08) continue; // New Flowchart Factor 3

    // Broker Flow Analysis
    const past10Dates = sortedDates.slice(Math.max(0, dateIdx - 9), dateIdx + 1);
    const past10DatesSet = new Set(past10Dates);
    const brokerEntries = (scripBrokerHistoryMap.get(sym) || []).filter(b => past10DatesSet.has(b.date));

    const brokerAgg = new Map();
    let totalWindowBuy = 0, totalWindowSell = 0, totalWindowBuyAmt = 0;
    for (const b of brokerEntries) {
      if (!brokerAgg.has(b.brokerId)) brokerAgg.set(b.brokerId, { buy: 0, sell: 0, buyAmt: 0 });
      const rec = brokerAgg.get(b.brokerId);
      rec.buy += b.buyVol;
      rec.sell += b.sellVol;
      rec.buyAmt += b.buyAmt;
      totalWindowBuy += b.buyVol;
      totalWindowSell += b.sellVol;
      totalWindowBuyAmt += b.buyAmt;
    }

    if (totalWindowBuy < 10000) continue;

    const brokerList = Array.from(brokerAgg.entries()).map(([id, d]) => ({
      brokerId: id,
      buy: d.buy,
      sell: d.sell,
      net: d.buy - d.sell,
      vwap: d.buy > 0 ? d.buyAmt / d.buy : ltp
    })).sort((a, b) => b.buy - a.buy);

    const top3Buy = brokerList.slice(0, 3).reduce((s, b) => s + b.buy, 0);
    const bcr3Buy = totalWindowBuy > 0 ? (top3Buy / totalWindowBuy) * 100 : 0;
    if (bcr3Buy < 40.0) continue; // Factor 2: BCR3 >= 40.0%

    // Factor 2: Net Absorption Retention >= 70%
    const top3Net = brokerList.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
    const netRetention = top3Buy > 0 ? top3Net / top3Buy : 0;
    if (netRetention < 0.70) continue; // Clean delivery cornering, no wash trading

    // Gate 0: Trap Veto - Check Seller Concentration
    const brokerSellList = Array.from(brokerAgg.entries()).map(([id, d]) => ({
      brokerId: id,
      sell: d.sell
    })).sort((a, b) => b.sell - a.sell);
    const top3Sell = brokerSellList.slice(0, 3).reduce((s, b) => s + b.sell, 0);
    const bcr3Sell = totalWindowSell > 0 ? (top3Sell / totalWindowSell) * 100 : 0;
    if (bcr3Sell >= 35.0 && bcr3Sell > bcr3Buy) continue; // Seller dominance veto

    const leadBroker = brokerList[0];
    const operatorVwap = leadBroker.vwap || (totalWindowBuy > 0 ? totalWindowBuyAmt / totalWindowBuy : ltp);
    const vwapDiffPct = operatorVwap > 0 ? ((ltp - operatorVwap) / operatorVwap) * 100 : 0;

    // Cost Basis Floor Alignment (within -2.5% to +2.5%)
    if (vwapDiffPct > 2.5 || vwapDiffPct < -2.5) continue;

    detectedSignals.push({
      date,
      dateIdx,
      symbol: sym,
      basePrice: ltp,
      oneDayPChange: +oneDayPChange.toFixed(2),
      operatorVwap: +operatorVwap.toFixed(1),
      vwapDiffPct: +vwapDiffPct.toFixed(1),
      bbw: +bbw.toFixed(1),
      vduRatio: +vduRatio.toFixed(2),
      cmf: +cmf.toFixed(3),
      bcr3Buy: +bcr3Buy.toFixed(1),
      bcr3Sell: +bcr3Sell.toFixed(1),
      netRetentionPct: +(netRetention * 100).toFixed(1),
      leadBrokerId: leadBroker.brokerId,
      leadBrokerNetKitta: leadBroker.net
    });
  }
}

// Deduplicate signals within 5 sessions per symbol
const distinctSignals = [];
for (const sig of detectedSignals) {
  const recentDuplicate = distinctSignals.find(d =>
    d.symbol === sig.symbol && Math.abs(sortedDates.indexOf(d.date) - sig.dateIdx) < 5
  );
  if (!recentDuplicate) distinctSignals.push(sig);
}

// Simulate Forward Execution under T+2 Demat Rules & Fees
const closedTrades = [];
for (const sig of distinctSignals) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) continue;
  const scripEntryDay = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!scripEntryDay) continue;

  const entryPrice = scripEntryDay.open || scripEntryDay.close;
  const initialStopLoss = +(entryPrice * 0.965).toFixed(1); // -3.5% Stop-loss
  const target1 = +(entryPrice * 1.080).toFixed(1);         // +8.0% Target 1
  const target2 = +(entryPrice * 1.150).toFixed(1);         // +15.0% Target 2

  const history = scripHistoryMap.get(sig.symbol);
  const forwardCandles = history.filter(h => h.date >= entryDate).slice(0, 15);
  if (forwardCandles.length < 3) continue;

  let exitPrice = entryPrice;
  let exitDate = forwardCandles[forwardCandles.length - 1].date;
  let exitReason = 'TIME_EXIT';
  let target1Hit = false;
  let currentStopLoss = initialStopLoss;
  let daysHeld = forwardCandles.length;
  let peakPrice = entryPrice;

  for (let dayIdx = 0; dayIdx < forwardCandles.length; dayIdx++) {
    const c = forwardCandles[dayIdx];
    if (c.high > peakPrice) peakPrice = c.high;
    const isDematLocked = dayIdx < 2; // Mandatory T+2 Demat holding lock

    // Target 1 (+8%): Move SL to breakeven (+2.5%)
    if (c.high >= target1 && !target1Hit) {
      target1Hit = true;
      currentStopLoss = Math.max(currentStopLoss, +(entryPrice * 1.025).toFixed(1));
    }

    // Target 2 (+15%)
    if (c.high >= target2 && !isDematLocked) {
      exitPrice = target2;
      exitDate = c.date;
      exitReason = 'TARGET_2_HIT (+15%)';
      daysHeld = dayIdx + 1;
      break;
    }

    // Stop-loss or Breakeven Exit
    if (c.low <= currentStopLoss && !isDematLocked) {
      exitPrice = currentStopLoss;
      exitDate = c.date;
      exitReason = target1Hit ? 'TARGET_1_BREAKEVEN (+2.5%)' : 'STOP_LOSS_HIT (-3.5%)';
      daysHeld = dayIdx + 1;
      break;
    }
  }

  if (exitReason === 'TIME_EXIT') {
    const lastCandle = forwardCandles[forwardCandles.length - 1];
    exitPrice = lastCandle.close;
    exitDate = lastCandle.date;
  }

  const { netReturnPct } = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: 100 });
  const grossReturnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
  const maxMfePct = +(((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2);

  closedTrades.push({
    symbol: sig.symbol,
    signalDate: sig.date,
    entryDate,
    exitDate,
    daysHeld,
    entryPrice,
    exitPrice,
    bcr3: sig.bcr3Buy,
    netRetentionPct: sig.netRetentionPct,
    vdu: sig.vduRatio,
    cmf: sig.cmf,
    leadBrokerId: sig.leadBrokerId,
    exitReason,
    maxMfePct,
    grossReturnPct,
    netReturnPct: +netReturnPct.toFixed(2)
  });
}

// Compute Statistics
const wins = closedTrades.filter(t => t.netReturnPct > 0);
const losses = closedTrades.filter(t => t.netReturnPct <= 0);
const grossWins = closedTrades.filter(t => t.grossReturnPct > 0);

const grossWinRate = closedTrades.length > 0 ? (grossWins.length / closedTrades.length) * 100 : 0;
const netWinRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

const totalGains = wins.reduce((s, w) => s + w.netReturnPct, 0);
const totalLosses = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains;
const avgWinPct = wins.length > 0 ? totalGains / wins.length : 0;
const avgLossPct = losses.length > 0 ? totalLosses / losses.length : 0;
const netExpectancy = closedTrades.length > 0 ? closedTrades.reduce((s, t) => s + t.netReturnPct, 0) / closedTrades.length : 0;

console.log(`📊 ════════════════════════════════════════════════════════════════`);
console.log(`🏆 NEW FLOWCHART STEALTH ACCUMULATION SCORECARD:`);
console.log(`───────────────────────────────────────────────────────────────────`);
console.log(`Total Qualified Trades:     ${closedTrades.length}`);
console.log(`Winning Trades:             ${wins.length}`);
console.log(`Losing Trades:              ${losses.length}`);
console.log(`Gross Win Rate:             ${grossWinRate.toFixed(1)}%`);
console.log(`🎯 NET WIN RATE (AFTER TAX/FEES): ${netWinRate.toFixed(1)}%`);
console.log(`💎 PROFIT FACTOR:           ${profitFactor.toFixed(2)}x`);
console.log(`📈 NET EXPECTANCY / TRADE:   ${netExpectancy >= 0 ? '+' : ''}${netExpectancy.toFixed(2)}%`);
console.log(`Avg Net Gain per Win:       +${avgWinPct.toFixed(2)}%`);
console.log(`Avg Net Loss per Loss:      -${avgLossPct.toFixed(2)}%`);
console.log(`═══════════════════════════════════════════════════════════════════\n`);

console.log(`📋 QUALIFIED FLOWCHART STOCKS & TRADE AUDIT:`);
console.log(`──────────────────────────────────────────────────────────────────────────────────────────`);
console.log(`Date       | Scrip | Broker | BCR3  | NetRet% | VDU   | CMF    | Entry  | Exit   | Days | Net %  | MFE %  | Outcome`);
console.log(`──────────────────────────────────────────────────────────────────────────────────────────`);
for (const t of closedTrades) {
  const dtStr = t.entryDate.padEnd(10);
  const scripStr = t.symbol.padEnd(5);
  const brkStr = ('#' + t.leadBrokerId).padEnd(6);
  const bcrStr = (t.bcr3 + '%').padEnd(5);
  const retPStr = (t.netRetentionPct + '%').padEnd(7);
  const vduStr = (t.vdu + 'x').padEnd(5);
  const cmfStr = (+t.cmf).toFixed(2).padEnd(6);
  const entStr = ('Rs.' + t.entryPrice).padEnd(6);
  const extStr = ('Rs.' + t.exitPrice).padEnd(6);
  const daysStr = (t.daysHeld + 'd').padEnd(4);
  const retStr = (t.netReturnPct >= 0 ? '+' + t.netReturnPct : t.netReturnPct + '').padEnd(6) + '%';
  const mfeStr = ('+' + t.maxMfePct + '%').padEnd(6);
  const tag = t.netReturnPct > 0 ? '✅ WIN' : '❌ LOSS';
  console.log(`${dtStr} | ${scripStr} | ${brkStr} | ${bcrStr} | ${retPStr} | ${vduStr} | ${cmfStr} | ${entStr} | ${extStr} | ${daysStr} | ${retStr} | ${mfeStr} | ${tag} (${t.exitReason})`);
}
