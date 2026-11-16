// scripts/test_flowchart_enhancements.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

// Load historical OHLCV
const rows = db.prepare(`
  SELECT symbol, trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC
`).all();

const scripHistoryMap = new Map();
const allDatesSet = new Set();
for (const r of rows) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push({
    date: r.trade_date,
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0),
  });
  allDatesSet.add(r.trade_date);
}

const sortedDates = Array.from(allDatesSet).sort();
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// Market SMA 20 for regime
const mktRows = db.prepare(`
  SELECT trade_date, AVG(close_price) as avg_close
  FROM daily_stock_summary
  WHERE close_price > 0 AND symbol NOT LIKE '%PO%' AND symbol NOT LIKE '%DEB%'
  GROUP BY trade_date ORDER BY trade_date ASC
`).all();
const mktMap = new Map(mktRows.map(r => [r.trade_date, r.avg_close]));
const marketCloses = sortedDates.map(d => mktMap.get(d) || 0);
const marketSma20 = marketCloses.map((_, i) => {
  if (i < 19) return marketCloses[i];
  return marketCloses.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
});

// Load broker alltime + SQLite
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  const files = fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json');
  for (const f of files) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(alltimeDir, f), 'utf8'));
      const sym = String(obj.symbol || f.replace('.json', '')).toUpperCase().trim();
      const rollup = obj.dailyRollup || {};
      if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
      const symMap = scripBrokerByDate.get(sym);
      for (const [dt, brokersObj] of Object.entries(rollup)) {
        if (dt < '2026-04-01') continue;
        const arr = [];
        for (const [bId, vals] of Object.entries(brokersObj)) {
          const bNum = Number(bId);
          if (Number.isFinite(bNum) && (vals[0] > 0 || vals[1] > 0)) {
            arr.push({ brokerId: bNum, buyVol: vals[0], sellVol: vals[1], buyAmt: vals[2], sellAmt: vals[3] });
          }
        }
        if (arr.length > 0) symMap.set(dt, arr);
      }
    } catch (_) {}
  }
}

const dbBroker = db.prepare(`SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt FROM daily_broker_ledger WHERE COALESCE(is_quarantined,0)=0`).all();
for (const b of dbBroker) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap.has(b.trade_date)) symMap.set(b.trade_date, []);
  symMap.get(b.trade_date).push({ brokerId: b.broker_id, buyVol: b.buy_vol, sellVol: b.sell_vol, buyAmt: b.buy_amt, sellAmt: b.sell_amt });
}

function aggregateBrokers(sym, dateIdx, lookbackDays) {
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return null;
  const startIdx = Math.max(0, dateIdx - lookbackDays + 1);
  const brokerAgg = new Map();
  let totalBuy = 0, totalSell = 0, totalBuyAmt = 0;
  for (let i = startIdx; i <= dateIdx; i++) {
    const dt = sortedDates[i];
    const rows = symMap.get(dt) || [];
    for (const r of rows) {
      if (!brokerAgg.has(r.brokerId)) brokerAgg.set(r.brokerId, { buy: 0, sell: 0, buyAmt: 0 });
      const b = brokerAgg.get(r.brokerId);
      b.buy += r.buyVol; b.sell += r.sellVol; b.buyAmt += r.buyAmt;
      totalBuy += r.buyVol; totalSell += r.sellVol; totalBuyAmt += r.buyAmt;
    }
  }
  if (totalBuy === 0 && totalSell === 0) return null;
  const buyers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, buy: d.buy, sell: d.sell, net: d.buy - d.sell, vwap: d.buy > 0 ? d.buyAmt / d.buy : 0 })).sort((a, b) => b.buy - a.buy);
  const sellers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, sell: d.sell })).sort((a, b) => b.sell - a.sell);
  const top3Buy = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3Net = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const top3Sell = sellers.slice(0, 3).reduce((s, b) => s + b.sell, 0);
  return {
    bcr3Buy: totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0,
    bcr3Sell: totalSell > 0 ? (top3Sell / totalSell) * 100 : 0,
    netRetention: top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0,
    leadBrokerId: buyers[0]?.brokerId ?? null,
    leadNetKitta: buyers[0]?.net ?? 0,
  };
}

console.log('Testing Enhanced Flowchart v2.0 (Dual-Horizon Trailing + Whale Priority)...\n');

// Run simulation with:
// Mode A: Baseline Flowchart v2.0 (Fixed 15d hold, +7.5% T1, +15% T2)
// Mode B: Enhanced (Whale Priority + 20 EMA Trailing for Track B up to 25 sessions)

function runTest(mode = 'BASELINE') {
  const executedTrades = [];
  const testDates = sortedDates.filter(d => d >= '2026-05-15' && d <= '2026-11-02');

  for (let i = 0; i < testDates.length; i++) {
    const dt = testDates[i];
    const dateIdx = dateIndexMap.get(dt);
    const isBullRegime = marketCloses[dateIdx] >= marketSma20[dateIdx];
    const dayCandidates = [];

    for (const [sym, history] of scripHistoryMap.entries()) {
      if (sym.includes('PO') || sym.includes('DEB') || (sym.endsWith('P') && sym !== 'NADEP') || /\d+$/.test(sym)) continue;
      const p = history.findIndex(h => h.date === dt);
      if (p < 30) continue;
      const c = history[p];
      const prev = history[p - 1];
      if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

      const chg1d = ((c.close - prev.close) / prev.close) * 100;
      const range = c.high - c.low;
      const upperWickRatio = range > 0 ? (c.high - Math.max(c.open, c.close)) / range : 0;
      if (upperWickRatio > 0.42 && chg1d > 1.0) continue;

      const flow10 = aggregateBrokers(sym, dateIdx, 10);
      if (!flow10) continue;

      const closes = history.slice(0, p + 1).map(x => x.close);
      const c10 = closes.slice(-10);
      const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
      const avgVol20 = history.slice(Math.max(0, p - 20), p).reduce((s, h) => s + h.volume, 0) / 20;
      const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;
      const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;

      // Retest logic
      const isRetest = c.close >= sma20 * 0.985 && c.close <= sma20 * 1.08 && chg1d >= -1.5 && chg1d <= 3.5;

      let track = null;
      let reason = '';
      if (isBullRegime) {
        if (isRetest && spread10 <= 10.5 && vduToday <= 0.78 && flow10.bcr3Buy >= 38 && flow10.bcr3Sell <= 35 && flow10.netRetention >= 68) {
          track = 'TRACK_B'; reason = 'BREAK_AND_RETEST';
        } else if (spread10 <= 7.0 && vduToday <= 0.60 && chg1d >= -1.2 && chg1d <= 2.0 && flow10.bcr3Buy >= 40 && flow10.bcr3Sell <= 32 && flow10.netRetention >= 72) {
          track = 'TRACK_A'; reason = 'STEALTH_COIL';
        }
      } else {
        if (isRetest && spread10 <= 8.5 && vduToday <= 0.70 && flow10.bcr3Buy >= 42 && flow10.bcr3Sell <= 30 && flow10.netRetention >= 78) {
          track = 'TRACK_B'; reason = 'SNIPER_RETEST';
        }
      }

      if (track) {
        // Scoring
        let score = (flow10.bcr3Buy - flow10.bcr3Sell) + (flow10.netRetention * 0.5) - (spread10 * 1.5) + (track === 'TRACK_B' ? 15 : 0);
        if (mode === 'ENHANCED') {
          // Whale priority bonus: lead broker net kitta > 50k shares
          if (flow10.leadNetKitta >= 50000) score += 12;
          if (flow10.leadNetKitta >= 150000) score += 10;
        }
        dayCandidates.push({ symbol: sym, date: dt, dateIdx, ltp: c.close, track, reason, score, flow: flow10 });
      }
    }

    if (dayCandidates.length > 0) {
      dayCandidates.sort((a, b) => b.score - a.score);
      const pick = dayCandidates[0];

      // Simulate execution
      const entryDate = sortedDates[dateIdx + 1];
      if (!entryDate) continue;
      const forwardBars = (scripHistoryMap.get(pick.symbol) || []).filter(h => h.date >= entryDate);
      if (forwardBars.length < 3) continue;

      const entryPrice = forwardBars[0].open || forwardBars[0].close;
      if (entryPrice > pick.ltp * 1.018) continue; // Gap veto

      const maxHold = mode === 'ENHANCED' && pick.track === 'TRACK_B' ? 22 : 15;
      const tradeForward = forwardBars.slice(0, maxHold);
      const totalQty = Math.max(10, Math.floor(200000 / entryPrice));

      const stopLoss = entryPrice * 0.965;
      const t1Price = entryPrice * 1.075;
      const t2Price = entryPrice * 1.15;
      const ratchetTrigger = entryPrice * 1.055;
      const ratchetLock = entryPrice * 1.022;

      let exitPrice = tradeForward[tradeForward.length - 1].close;
      let exitDate = tradeForward[tradeForward.length - 1].date;
      let exitReason = 'TIME_EXIT';
      let t1Hit = false;
      let currentStop = stopLoss;
      let daysHeld = tradeForward.length;

      for (let d = 0; d < tradeForward.length; d++) {
        const bar = tradeForward[d];
        if (bar.high >= ratchetTrigger && currentStop < ratchetLock && d >= 3) {
          currentStop = ratchetLock;
        }
        if (!t1Hit && bar.high >= t1Price && d >= 2) {
          t1Hit = true;
          currentStop = Math.max(currentStop, entryPrice * 1.045);
        }
        if (t1Hit && bar.high >= t2Price && d >= 2) {
          exitPrice = t2Price; exitDate = bar.date; exitReason = 'T2_TARGET'; daysHeld = d + 1; break;
        }
        if (bar.low <= currentStop && d >= 2) {
          exitPrice = currentStop; exitDate = bar.date; exitReason = currentStop > entryPrice ? 'RATCHET_BE' : 'STOP_LOSS'; daysHeld = d + 1; break;
        }
      }

      let netRet;
      if (t1Hit && exitReason !== 'T2_TARGET') {
        const q1 = Math.floor(totalQty / 2);
        const q2 = totalQty - q1;
        const leg1 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: t1Price, quantity: q1, holdingDays: 5 });
        const leg2 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: q2, holdingDays: daysHeld });
        netRet = ((leg1.netProfitNpr + leg2.netProfitNpr) / (leg1.totalBuyCost + leg2.totalBuyCost)) * 100;
      } else {
        const calc = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: totalQty, holdingDays: daysHeld });
        netRet = calc.netReturnPct;
      }

      executedTrades.push({
        symbol: pick.symbol,
        date: pick.date,
        track: pick.track,
        netReturnPct: +netRet.toFixed(2),
        isWin: netRet > 0,
        exitReason,
      });

      // Advance by 3 sessions to prevent over-clustering
      i += 2;
    }
  }

  const wins = executedTrades.filter(t => t.isWin);
  const losses = executedTrades.filter(t => !t.isWin);
  const winRate = executedTrades.length > 0 ? (wins.length / executedTrades.length) * 100 : 0;
  const grossWins = wins.reduce((s, t) => s + t.netReturnPct, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.netReturnPct, 0));
  const pf = grossLosses > 0 ? grossWins / grossLosses : 99;
  const exp = executedTrades.reduce((s, t) => s + t.netReturnPct, 0) / Math.max(1, executedTrades.length);

  console.log(`=== MODE: ${mode} ===`);
  console.log(`Executed Trades: ${executedTrades.length}`);
  console.log(`Wins / Losses  : ${wins.length}W / ${losses.length}L`);
  console.log(`Strict Net WR  : ${winRate.toFixed(1)}%`);
  console.log(`Profit Factor  : ${pf.toFixed(2)}x`);
  console.log(`Net Expectancy : ${exp >= 0 ? '+' : ''}${exp.toFixed(2)}% per trade\n`);
}

runTest('BASELINE');
runTest('ENHANCED');
