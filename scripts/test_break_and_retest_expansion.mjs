// scripts/test_break_and_retest_expansion.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';
import { evaluateLoopholeProtectedSmcSetup } from '../proxy/telegramNotifier.mjs';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  WHERE COALESCE(is_quarantined, 0) = 0 AND close_price > 0
  ORDER BY trade_date ASC, symbol ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDatesSet = new Set();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  const dt = r.trade_date;
  if (!sym || !dt) continue;
  allDatesSet.add(dt);

  const close = Number(r.close_price || 0);
  const open = Number(r.open_price || close);
  const high = Math.max(Number(r.high_price || close), open, close);
  const low = Math.min(Number(r.low_price || close), open, close);
  const candle = { date: dt, symbol: sym, open, high, low, close, volume: Number(r.total_volume || 0), turnover: Number(r.total_turnover || 0) };

  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(candle);

  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, candle);
}

const sortedDates = Array.from(allDatesSet).sort();
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// Load broker data
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  const files = fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f >= 'broker_2026-04-15.json').sort();
  for (const file of files) {
    const dt = file.replace('broker_', '').replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(alltimeDir, file), 'utf8'));
      for (const [symRaw, list] of Object.entries(data)) {
        const sym = symRaw.toUpperCase().trim();
        if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
        const dateMap = scripBrokerByDate.get(sym);
        const rows = (list || []).map(r => ({
          brokerId: Number(r.brokerId || r.b || 0),
          buyVol: Number(r.buyQty || r.buy_vol || 0),
          sellVol: Number(r.sellQty || r.sell_vol || 0),
          buyAmt: Number(r.buyAmt || r.buy_amt || 0),
          sellAmt: Number(r.sellAmt || r.sell_amt || 0)
        }));
        dateMap.set(dt, rows);
      }
    } catch (_) {}
  }
}

// Overlay SQLite daily_broker_ledger
try {
  const rows = db.prepare(`SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt FROM daily_broker_ledger WHERE trade_date >= '2026-04-15'`).all();
  for (const r of rows) {
    const sym = String(r.symbol || '').toUpperCase().trim();
    const dt = r.trade_date;
    if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
    const dateMap = scripBrokerByDate.get(sym);
    if (!dateMap.has(dt)) dateMap.set(dt, []);
    dateMap.get(dt).push({
      brokerId: Number(r.broker_id),
      buyVol: Number(r.buy_vol || 0),
      sellVol: Number(r.sell_vol || 0),
      buyAmt: Number(r.buy_amt || 0),
      sellAmt: Number(r.sell_amt || 0)
    });
  }
} catch (_) {}

function aggregateBrokers(sym, dateIdx, lookbackDays) {
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return null;
  const startIdx = Math.max(0, dateIdx - lookbackDays + 1);
  const brokerAgg = new Map();
  let totalBuy = 0, totalSell = 0;
  for (let i = startIdx; i <= dateIdx; i++) {
    const dt = sortedDates[i];
    const rows = symMap.get(dt) || [];
    for (const r of rows) {
      if (!brokerAgg.has(r.brokerId)) brokerAgg.set(r.brokerId, { buy: 0, sell: 0, buyAmt: 0 });
      const b = brokerAgg.get(r.brokerId);
      b.buy += r.buyVol; b.sell += r.sellVol; b.buyAmt += r.buyAmt;
      totalBuy += r.buyVol; totalSell += r.sellVol;
    }
  }
  if (totalBuy === 0 && totalSell === 0) return null;
  const buyers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, buy: d.buy, sell: d.sell, net: d.buy - d.sell, vwap: d.buy > 0 ? d.buyAmt / d.buy : 0 })).sort((a, b) => b.buy - a.buy);
  const sellers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, sell: d.sell })).sort((a, b) => b.sell - a.sell);
  const top3Buy = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3Net = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const top3Sell = sellers.slice(0, 3).reduce((s, b) => s + b.sell, 0);
  const bcr3Buy = totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0;
  const bcr3Sell = totalSell > 0 ? (top3Sell / totalSell) * 100 : 0;
  const netRetention = top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0;
  return { bcr3Buy, bcr3Sell, netRetention, leadBrokerId: buyers[0]?.brokerId };
}

function checkTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  if (upperWickRatio > 0.45 && chg1d > 1.0) return true;
  if (hist.length >= 3) {
    const b0 = hist[hist.length - 1], b1 = hist[hist.length - 2], b2 = hist[hist.length - 3];
    if ((b0.close < b1.close && b1.close < b2.close) || (b0.close < b0.open && b1.close < b1.open && b2.close < b2.open)) return true;
  }
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return true;
  let maxDump = 0, maxBuy = 0;
  for (const offset of [-1, 0]) {
    const idx = dateIdx + offset; if (idx < 0) continue;
    for (const r of symMap.get(sortedDates[idx]) || []) {
      const net = r.buyVol - r.sellVol;
      if (net < -12000 && Math.abs(net) > maxDump) maxDump = Math.abs(net);
      if (net > 12000 && net > maxBuy) maxBuy = net;
    }
  }
  if (maxDump > 0 && maxBuy < maxDump * 0.8) return true;
  return false;
}

function simulateTrade(sym, signalDateIdx) {
  const entryDate = sortedDates[signalDateIdx + 1];
  if (!entryDate) return null;
  const entryCandle = dateScripMap.get(entryDate)?.get(sym);
  if (!entryCandle) return null;
  const entryPrice = entryCandle.open || entryCandle.close;
  if (!entryPrice || entryPrice <= 0) return null;

  const totalQty = Math.max(10, Math.floor(200000 / entryPrice));
  const stopLoss = entryPrice * (1 - 0.035);
  const target1 = entryPrice * 1.08;
  const target2 = entryPrice * 1.15;
  const ratchetTrigger = entryPrice * 1.055;
  const ratchetLock = entryPrice * 1.022;

  const forward = (scripHistoryMap.get(sym) || []).filter(h => h.date >= entryDate).slice(0, 15);
  if (forward.length < 3) return null;

  let currentStop = stopLoss;
  let armed = false;
  let t1Hit = false;
  let exitPrice = forward[forward.length - 1].close;
  let daysHeld = forward.length;
  let exitReason = 'TIME_EXIT';

  for (let d = 0; d < forward.length; d++) {
    const c = forward[d];
    if (d >= 2) {
      if (c.low <= currentStop) {
        exitPrice = c.open <= currentStop ? c.open : currentStop;
        exitReason = t1Hit ? 'T1_SPLIT_TRAIL' : (armed ? 'RATCHET_BE' : 'STOP_LOSS');
        daysHeld = d + 1;
        break;
      }
      if (c.high >= target2) {
        exitPrice = Math.max(c.open, target2);
        exitReason = 'TARGET_2';
        daysHeld = d + 1;
        break;
      }
      if (!t1Hit && c.high >= target1) {
        t1Hit = true;
        currentStop = Math.max(currentStop, entryPrice * 1.025);
      }
    }
    if (d >= 4 && c.high >= ratchetTrigger && !armed) {
      armed = true;
      currentStop = Math.max(currentStop, ratchetLock);
    }
  }

  const calc = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: totalQty, holdingDays: daysHeld * 1.4 });
  return { netReturnPct: calc.netReturnPct, isWin: calc.netReturnPct > 0, exitReason, daysHeld };
}

const testDates = sortedDates.filter(d => d >= '2026-05-15' && d <= '2026-11-02');

function runTest(testName, filterFn) {
  let signals = [];
  for (let i = 0; i < testDates.length; i++) {
    const dt = testDates[i];
    const dateIdx = dateIndexMap.get(dt);

    for (const [sym, history] of scripHistoryMap.entries()) {
      if (sym.includes('PO') || sym.includes('DEB') || sym.endsWith('P') || /\d+$/.test(sym)) continue;
      const curIdx = history.findIndex(h => h.date === dt);
      if (curIdx < 30) continue;
      const c = history[curIdx];
      const prev = history[curIdx - 1];
      if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

      const chg1d = ((c.close - prev.close) / prev.close) * 100;
      const curRange = c.high - c.low;
      const upperWickRatio = curRange > 0 ? (c.high - Math.max(c.open, c.close)) / curRange : 0;

      const flow10 = aggregateBrokers(sym, dateIdx, 10);
      const flow5 = aggregateBrokers(sym, dateIdx, 5);
      if (!flow10 || !flow5) continue;
      if (flow10.bcr3Buy < 38 || flow10.bcr3Sell > 35) continue;
      if (flow10.netRetention < 65 || flow5.netRetention < 60) continue;

      const histSlice = history.slice(0, curIdx + 1);
      if (checkTrapVetoes(sym, dateIdx, histSlice, chg1d, upperWickRatio, flow10.leadBrokerId)) continue;

      const closes = histSlice.map(x => x.close);
      const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;

      const smc = evaluateLoopholeProtectedSmcSetup(histSlice.slice(-55), {
        ltp: c.close,
        ema20: sma20,
        bcr3Buy: flow10.bcr3Buy,
        bcr3Sell: flow10.bcr3Sell,
        leadRetentionPct: flow10.netRetention,
        isTrap: false
      });

      const pass = filterFn({ sym, c, chg1d, closes, smc, flow10 });
      if (pass) {
        signals.push({ sym, dateIdx, dt });
      }
    }
  }

  // Deduplicate
  const deduped = [];
  const busyUntil = new Map();
  for (const sig of signals) {
    if ((busyUntil.get(sig.sym) || -1) >= sig.dateIdx) continue;
    const res = simulateTrade(sig.sym, sig.dateIdx);
    if (!res) continue;
    deduped.push({ ...sig, ...res });
    busyUntil.set(sig.sym, sig.dateIdx + 5);
  }

  const count = deduped.length;
  const wins = deduped.filter(t => t.isWin).length;
  const losses = count - wins;
  const wr = count > 0 ? (wins / count) * 100 : 0;
  const totG = deduped.filter(t => t.isWin).reduce((s, t) => s + t.netReturnPct, 0);
  const totL = Math.abs(deduped.filter(t => !t.isWin).reduce((s, t) => s + t.netReturnPct, 0));
  const pf = totL > 0 ? totG / totL : 99;
  const exp = count > 0 ? deduped.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

  console.log(`\n▶ ${testName}`);
  console.log(`  Trades: ${count} (${wins}W / ${losses}L) | Net Win Rate: ${wr.toFixed(1)}% | Profit Factor: ${pf.toFixed(2)}x | Expectancy: ${exp >= 0 ? '+' : ''}${exp.toFixed(2)}%/trade | Rate: ${(count / 6).toFixed(1)} trades/month`);
}

// Experiment A: Pure SMC Break & Retest WITHOUT the tight spread restriction
runTest('A. Pure Break & Retest (Unshackled from spread <= 6.8%)', ({ smc }) => {
  return smc.isBreakAndRetest;
});

// Experiment B: Break & Retest + T+2 Cleared Continuation
runTest('B. Track B Institutional (Break & Retest OR T+2 Cleared)', ({ smc }) => {
  return smc.isBreakAndRetest || smc.isT2ClearedContinuation;
});

// Experiment C: Track B + High-Conviction Sweep MSS (SMC Confluence)
runTest('C. Track B + High-Conviction SMC Confluence (Break & Retest OR T+2 OR Sweep MSS)', ({ smc, chg1d }) => {
  if (smc.isBreakAndRetest || smc.isT2ClearedContinuation) return true;
  if (smc.isSmcSweepMss && chg1d >= 0.5 && chg1d <= 3.0) return true;
  return false;
});

// Experiment D: Institutional Core (Track B + Coiled Bases with VDU <= 0.70)
runTest('D. Full Institutional Core (Track B + Calm Bases with VDU <= 0.70)', ({ smc, closes, c }) => {
  if (smc.isBreakAndRetest || smc.isT2ClearedContinuation) return true;
  const c10 = closes.slice(-10);
  const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
  if (spread10 <= 8.5 && (smc.isNr7 || smc.isIdnr4 || smc.isFvgMitigated)) return true;
  return false;
});
