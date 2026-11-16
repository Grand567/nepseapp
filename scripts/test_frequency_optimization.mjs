// scripts/test_frequency_optimization.mjs
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

// Compute equal-weighted NEPSE market index & 20-day SMA
const marketCloses = [];
for (const dt of sortedDates) {
  const m = dateScripMap.get(dt);
  let sum = 0, count = 0;
  for (const c of m.values()) {
    if (c.close > 0) { sum += c.close; count++; }
  }
  marketCloses.push(count > 0 ? sum / count : 0);
}
const marketSma20 = [];
for (let i = 0; i < marketCloses.length; i++) {
  if (i < 19) { marketSma20.push(marketCloses[i]); continue; }
  const s = marketCloses.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
  marketSma20.push(s);
}

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

function simulateTrade(sym, signalDateIdx, config) {
  const entryDate = sortedDates[signalDateIdx + 1];
  if (!entryDate) return null;
  const entryCandle = dateScripMap.get(entryDate)?.get(sym);
  if (!entryCandle) return null;
  const entryPrice = entryCandle.open || entryCandle.close;
  if (!entryPrice || entryPrice <= 0) return null;

  // Pre-open gap cap check
  const sigCandle = dateScripMap.get(sortedDates[signalDateIdx])?.get(sym);
  if (sigCandle && entryCandle.open > sigCandle.close * 1.025) return null; // skip gap > +2.5%

  const totalQty = Math.max(10, Math.floor(200000 / entryPrice));
  const stopLoss = entryPrice * (1 - config.stopPct / 100);
  const target1 = entryPrice * (1 + config.t1Pct / 100);
  const target2 = entryPrice * (1 + config.t2Pct / 100);
  const ratchetTrigger = entryPrice * (1 + config.ratchetPct / 100);
  const ratchetLock = entryPrice * (1 + 0.022);

  const forward = (scripHistoryMap.get(sym) || []).filter(h => h.date >= entryDate).slice(0, config.holdMax);
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

// Test Configurations
const testDates = sortedDates.filter(d => d >= '2026-05-15' && d <= '2026-11-02');

function runTest(config) {
  let signals = [];
  for (let i = 0; i < testDates.length; i++) {
    const dt = testDates[i];
    const dateIdx = dateIndexMap.get(dt);
    const mktClose = marketCloses[dateIdx];
    const mktSma = marketSma20[dateIdx];
    const isBullMarket = mktClose >= mktSma;

    for (const [sym, history] of scripHistoryMap.entries()) {
      if (sym.includes('PO') || sym.includes('DEB') || sym.endsWith('P') || /\d+$/.test(sym)) continue;
      const curIdx = history.findIndex(h => h.date === dt);
      if (curIdx < 30) continue;
      const c = history[curIdx];
      if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

      const flow10 = aggregateBrokers(sym, dateIdx, 10);
      const flow5 = aggregateBrokers(sym, dateIdx, 5);
      if (!flow10 || !flow5) continue;
      if (flow10.bcr3Buy < config.minBcr3Buy || flow10.bcr3Sell > config.maxBcr3Sell) continue;
      if (flow10.netRetention < config.minRetention || flow5.netRetention < (config.minRetention - 5)) continue;

      const closes = history.slice(0, curIdx + 1).map(x => x.close);
      const closes10 = closes.slice(-10);
      const min10 = Math.min(...closes10), max10 = Math.max(...closes10);
      const spread10 = ((max10 - min10) / min10) * 100;
      if (spread10 > config.maxSpread10) continue;

      const smc = evaluateLoopholeProtectedSmcSetup(history.slice(0, curIdx + 1), {
        ltp: c.close,
        bcr3Buy: flow10.bcr3Buy,
        bcr3Sell: flow10.bcr3Sell,
        leadRetentionPct: flow10.netRetention
      });

      const isTrackB = smc.isBreakAndRetest || smc.isT2ClearedContinuation;
      const isTrackA = smc.isSmcSweepMss || smc.isFvgMitigated || (spread10 <= 6.5);

      if (config.mode === 'TRACK_B_ONLY') {
        if (!isTrackB) continue;
      } else if (config.mode === 'ADAPTIVE_REGIME') {
        if (!isTrackB) {
          if (!isBullMarket) continue; // Mute Track A when NEPSE < 20 SMA
          if (!isTrackA) continue;
        }
      } else {
        if (!isTrackB && !isTrackA) continue;
      }

      signals.push({ sym, dateIdx, isTrackB });
    }
  }

  // Deduplicate
  const deduped = [];
  const busyUntil = new Map();
  for (const sig of signals) {
    if ((busyUntil.get(sig.sym) || -1) >= sig.dateIdx) continue;
    const res = simulateTrade(sig.sym, sig.dateIdx, config);
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

  return { name: config.name, count, wins, losses, wr: +wr.toFixed(1), pf: +pf.toFixed(2), exp: +exp.toFixed(2) };
}

console.log('Running Parameter Grid Experiments...');
const configs = [
  { name: '1. Current Flowchart v2.0 Baseline', minBcr3Buy: 40, maxBcr3Sell: 35, minRetention: 70, maxSpread10: 6.8, mode: 'BLENDED', stopPct: 3.5, t1Pct: 8, t2Pct: 15, ratchetPct: 5.5, holdMax: 15 },
  { name: '2. Track B Only (Baseline)', minBcr3Buy: 40, maxBcr3Sell: 35, minRetention: 70, maxSpread10: 6.8, mode: 'TRACK_B_ONLY', stopPct: 3.5, t1Pct: 8, t2Pct: 15, ratchetPct: 5.5, holdMax: 15 },
  { name: '3. Track B Expanded (Spread 9.5%, BCR3 35%, Ret 65%)', minBcr3Buy: 35, maxBcr3Sell: 38, minRetention: 65, maxSpread10: 9.5, mode: 'TRACK_B_ONLY', stopPct: 3.5, t1Pct: 8, t2Pct: 15, ratchetPct: 5.5, holdMax: 15 },
  { name: '4. Adaptive Regime (Track B always + Track A when NEPSE > SMA20)', minBcr3Buy: 40, maxBcr3Sell: 35, minRetention: 70, maxSpread10: 6.8, mode: 'ADAPTIVE_REGIME', stopPct: 3.5, t1Pct: 8, t2Pct: 15, ratchetPct: 5.5, holdMax: 15 },
  { name: '5. High-Frequency Institutional (Spread 8.5%, BCR3 35%, Ret 65%, Adaptive Regime)', minBcr3Buy: 35, maxBcr3Sell: 38, minRetention: 65, maxSpread10: 8.5, mode: 'ADAPTIVE_REGIME', stopPct: 3.5, t1Pct: 7, t2Pct: 14, ratchetPct: 5.0, holdMax: 12 },
  { name: '6. High-Frequency Track B (Expanded Continuation + Retest)', minBcr3Buy: 34, maxBcr3Sell: 40, minRetention: 60, maxSpread10: 10.0, mode: 'TRACK_B_ONLY', stopPct: 3.5, t1Pct: 7.5, t2Pct: 15, ratchetPct: 5.0, holdMax: 12 }
];

for (const c of configs) {
  const res = runTest(c);
  console.log(`\n▶ ${res.name}`);
  console.log(`  Trades: ${res.count} (${res.wins}W / ${res.losses}L) | Net Win Rate: ${res.wr}% | Profit Factor: ${res.pf}x | Expectancy: ${res.exp >= 0 ? '+' : ''}${res.exp}%/trade | Pace: ${(res.count / 6).toFixed(1)} trades/month`);
}
