import Database from 'better-sqlite3';
import path from 'path';
import { calculateRoundTripNetReturn, calculateCircuitBand } from '../src/constants/marketRules.js';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Load data
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
    sellVol: Number(b.sell_vol || 0)
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
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (ltp > 0 && ltp < 50) return true;
  return false;
}

const brokerDates = Array.from(new Set(brokerRows.map(b => b.trade_date))).sort();
const testDates = brokerDates.slice(8, -10);

// Function to simulate a backtest run for given bcr3 threshold and minVolume
function runSim(bcr3Threshold, minTurnover = 1500000, minVol = 3000) {
  const detectedSignals = [];

  for (const date of testDates) {
    const dateIdx = sortedDates.indexOf(date);
    const scripsOnDate = dateScripMap.get(date);
    if (!scripsOnDate) continue;

    for (const [sym, c] of scripsOnDate.entries()) {
      const ltp = c.close;
      if (isDisqualified(sym, ltp)) continue;
      if (c.turnover < minTurnover || c.volume < minVol) continue;

      const history = scripHistoryMap.get(sym);
      if (!history) continue;
      const histUpToDate = history.filter(h => h.date <= date);
      if (histUpToDate.length < 30) continue;

      const closes = histUpToDate.map(h => h.close);
      const volumes = histUpToDate.map(h => h.volume);

      const past10Closes = closes.slice(-10);
      const min10Close = Math.min(...past10Closes);
      const max10Close = Math.max(...past10Closes);
      const tenDaySpreadPct = min10Close > 0 ? ((max10Close - min10Close) / min10Close) * 100 : 99;
      const tenDayPriceChangePct = Math.abs(((ltp - past10Closes[0]) / past10Closes[0]) * 100);

      if (tenDaySpreadPct > 6.5 || tenDayPriceChangePct > 3.0) continue;

      const bbw = calculateBBW(closes, 20);
      if (bbw > 14.5) continue;

      const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
      const vduRatio = avgVol20 > 0 ? c.volume / avgVol20 : 1;
      if (vduRatio > 0.65) continue;

      const cmf = calculateCMF(histUpToDate, 20);
      if (cmf < 0.04) continue;

      const past10Dates = sortedDates.slice(Math.max(0, dateIdx - 9), dateIdx + 1);
      const past10DatesSet = new Set(past10Dates);
      const brokerEntries = (scripBrokerHistoryMap.get(sym) || []).filter(b => past10DatesSet.has(b.date));

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

      if (totalWindowBuy < 5000) continue;

      const brokerList = Array.from(brokerAgg.entries()).map(([id, d]) => ({
        brokerId: id,
        buy: d.buy,
        sell: d.sell,
        net: d.buy - d.sell
      })).sort((a, b) => b.buy - a.buy);

      const top3Buy = brokerList.slice(0, 3).reduce((s, b) => s + b.buy, 0);
      const bcr3 = totalWindowBuy > 0 ? (top3Buy / totalWindowBuy) * 100 : 0;

      const leadBroker = brokerList[0];
      const keySyndicateBrokers = [58, 45, 44, 64, 34, 65, 35, 62, 80, 50, 42];
      const isLeadSyndicate = leadBroker && keySyndicateBrokers.includes(leadBroker.brokerId);
      const hasStrongNetAbsorption = leadBroker && leadBroker.net > 15000;

      if (bcr3 < bcr3Threshold || (!hasStrongNetAbsorption && !isLeadSyndicate)) continue;

      detectedSignals.push({
        date,
        dateIdx,
        symbol: sym,
        basePrice: ltp,
        bbw,
        vduRatio,
        cmf,
        bcr3,
        leadBrokerId: leadBroker.brokerId,
        leadBrokerNetKitta: leadBroker.net
      });
    }
  }

  // Deduplicate within 5 days
  const distinctSignals = [];
  for (const sig of detectedSignals) {
    const recentDuplicate = distinctSignals.find(d =>
      d.symbol === sig.symbol && Math.abs(sortedDates.indexOf(d.date) - sig.dateIdx) < 5
    );
    if (!recentDuplicate) distinctSignals.push(sig);
  }

  // Simulate forward trades
  const closedTrades = [];
  for (const sig of distinctSignals) {
    const entryDate = sortedDates[sig.dateIdx + 1];
    const scripEntryDay = dateScripMap.get(entryDate)?.get(sig.symbol);
    if (!scripEntryDay) continue;

    const entryPrice = scripEntryDay.open || scripEntryDay.close;
    const initialStopLoss = +(entryPrice * 0.965).toFixed(1);
    const target1 = +(entryPrice * 1.080).toFixed(1);
    const target2 = +(entryPrice * 1.150).toFixed(1);

    const history = scripHistoryMap.get(sig.symbol);
    const forwardCandles = history.filter(h => h.date >= entryDate).slice(0, 16);
    if (forwardCandles.length < 3) continue;

    let exitPrice = entryPrice;
    let exitDate = forwardCandles[forwardCandles.length - 1].date;
    let exitReason = 'TIME_EXIT';
    let target1Hit = false;
    let currentStopLoss = initialStopLoss;

    for (let dayIdx = 0; dayIdx < forwardCandles.length; dayIdx++) {
      const c = forwardCandles[dayIdx];
      const isDematLocked = dayIdx < 2;

      if (c.high >= target1 && !target1Hit) {
        target1Hit = true;
        currentStopLoss = Math.max(currentStopLoss, entryPrice);
      }

      if (c.high >= target2 && !isDematLocked) {
        exitPrice = target2;
        exitDate = c.date;
        exitReason = 'TARGET_2_HIT';
        break;
      }

      if (c.low <= currentStopLoss && !isDematLocked) {
        exitPrice = currentStopLoss;
        exitDate = c.date;
        exitReason = target1Hit ? 'BREAKEVEN_EXIT' : 'STOP_LOSS_HIT';
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

    closedTrades.push({
      symbol: sig.symbol,
      date: sig.date,
      bcr3: sig.bcr3,
      entryPrice,
      exitPrice,
      exitReason,
      grossReturnPct,
      netReturnPct
    });
  }

  const wins = closedTrades.filter(t => t.netReturnPct > 0);
  const losses = closedTrades.filter(t => t.netReturnPct <= 0);
  const grossWins = closedTrades.filter(t => t.grossReturnPct > 0);

  const grossWinRate = closedTrades.length > 0 ? (grossWins.length / closedTrades.length) * 100 : 0;
  const netWinRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  const totalGains = wins.reduce((s, w) => s + w.netReturnPct, 0);
  const totalLosses = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains;
  const netExpectancy = closedTrades.length > 0 ? closedTrades.reduce((s, t) => s + t.netReturnPct, 0) / closedTrades.length : 0;

  return {
    bcr3Threshold,
    minTurnoverLakhs: minTurnover / 100000,
    minVol,
    trades: closedTrades.length,
    grossWinRate: +grossWinRate.toFixed(1),
    netWinRate: +netWinRate.toFixed(1),
    profitFactor: +profitFactor.toFixed(2),
    netExpectancy: +netExpectancy.toFixed(2)
  };
}

console.log('=== EXPERIMENT 1: BCR3 THRESHOLD SWEEP (35% -> 60%) ===');
for (const bcr of [30, 35, 40, 45, 50, 55, 60]) {
  const res = runSim(bcr, 1500000, 3000);
  console.log(`BCR3 >= ${bcr}%: Trades: ${res.trades} | Net Win Rate: ${res.netWinRate}% | Profit Factor: ${res.profitFactor}x | Net Expectancy: ${res.netExpectancy >= 0 ? '+' : ''}${res.netExpectancy}%`);
}

console.log('\n=== EXPERIMENT 2: VOLUME & LIQUIDITY FILTERS (at BCR3 >= 35% vs BCR3 >= 50%) ===');
const volTests = [
  { name: 'No volume floor (min 500 kitta, 2 Lakhs)', turnover: 200000, vol: 500 },
  { name: 'Baseline (min 3,000 kitta, 15 Lakhs)', turnover: 1500000, vol: 3000 },
  { name: 'High Liquidity (min 10,000 kitta, 30 Lakhs)', turnover: 3000000, vol: 10000 },
  { name: 'Whale Safe (min 25,000 kitta, 50 Lakhs)', turnover: 5000000, vol: 25000 }
];

for (const vt of volTests) {
  const r35 = runSim(35, vt.turnover, vt.vol);
  const r50 = runSim(50, vt.turnover, vt.vol);
  console.log(`[${vt.name}]`);
  console.log(`  • BCR3 >= 35%: Trades: ${r35.trades} | Net WR: ${r35.netWinRate}% | PF: ${r35.profitFactor}x | Expectancy: ${r35.netExpectancy >= 0 ? '+' : ''}${r35.netExpectancy}%`);
  console.log(`  • BCR3 >= 50%: Trades: ${r50.trades} | Net WR: ${r50.netWinRate}% | PF: ${r50.profitFactor}x | Expectancy: ${r50.netExpectancy >= 0 ? '+' : ''}${r50.netExpectancy}%`);
}
