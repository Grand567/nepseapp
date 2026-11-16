// backtest/optimalEngineBacktest.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';
import { evaluateLoopholeProtectedSmcSetup } from '../proxy/telegramNotifier.mjs';

const WINDOW_START = '2026-05-15';
const BROKER_LOAD_START = '2026-04-15';
const CAPITAL_PER_TRADE_NPR = 200000;
const HOLD_MAX_SESSIONS = 15;
const COOLDOWN_SESSIONS = 5;

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Load OHLCV
const rawRecords = db.prepare(`SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover FROM daily_stock_summary WHERE close_price > 0 ORDER BY trade_date ASC, symbol ASC`).all();
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

// Market trend
const mktSums = new Array(sortedDates.length).fill(0);
const mktCounts = new Array(sortedDates.length).fill(0);
for (const [sym, candles] of scripHistoryMap) {
  if (sym.includes('PO') || sym.includes('DEB') || /\d+$/.test(sym)) continue;
  for (let p = 1; p < candles.length; p++) {
    const prev = candles[p - 1]; const cur = candles[p];
    const prevIdx = dateIndexMap.get(prev.date); const curIdx = dateIndexMap.get(cur.date);
    if (curIdx !== prevIdx + 1 || prev.close <= 0) continue;
    const ret = (cur.close - prev.close) / prev.close;
    if (Math.abs(ret) > 0.15) continue;
    mktSums[curIdx] += ret; mktCounts[curIdx]++;
  }
}
const marketReturns = mktCounts.map((c, i) => c > 0 ? mktSums[i] / c : 0);
const toLevel = (rets) => { const L = []; let x = 1000; for (const r of rets) { x *= (1 + r); L.push(x); } return L; };
const ema = (arr, n) => { const k = 2 / (n + 1); const out = []; let e = arr[0] || 1000; for (const v of arr) { e = v * k + e * (1 - k); out.push(e); } return out; };
const marketLevel = toLevel(marketReturns);
const marketEma20 = ema(marketLevel, 20);

// Load Broker Data
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  for (const f of fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json')) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(alltimeDir, f), 'utf8'));
      const sym = String(obj.symbol || f.replace('.json', '')).toUpperCase().trim();
      const rollup = obj.dailyRollup || {};
      if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
      const symMap = scripBrokerByDate.get(sym);
      for (const [dt, brokersObj] of Object.entries(rollup)) {
        if (dt < BROKER_LOAD_START) continue;
        const arr = [];
        for (const [bId, vals] of Object.entries(brokersObj)) {
          const bNum = Number(bId);
          if (Number.isFinite(bNum)) arr.push({ brokerId: bNum, buyVol: Number(vals[0] || 0), sellVol: Number(vals[1] || 0), buyAmt: Number(vals[2] || 0), sellAmt: Number(vals[3] || 0) });
        }
        if (arr.length > 0) symMap.set(dt, arr);
      }
    } catch (_) {}
  }
}
for (const b of db.prepare(`SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt FROM daily_broker_ledger WHERE trade_date >= '2026-04-15'`).all()) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap.has(b.trade_date)) symMap.set(b.trade_date, []);
  symMap.get(b.trade_date).push({ brokerId: Number(b.broker_id), buyVol: Number(b.buy_vol || 0), sellVol: Number(b.sell_vol || 0), buyAmt: Number(b.buy_amt || 0), sellAmt: Number(b.sell_amt || 0) });
}

function aggregateBrokers(sym, dateIdx, lookbackDays) {
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return null;
  const startIdx = Math.max(0, dateIdx - lookbackDays + 1);
  const brokerAgg = new Map();
  let totalBuy = 0, totalSell = 0;
  for (let i = startIdx; i <= dateIdx; i++) {
    const dt = sortedDates[i];
    for (const r of (symMap.get(dt) || [])) {
      if (!brokerAgg.has(r.brokerId)) brokerAgg.set(r.brokerId, { buy: 0, sell: 0 });
      const b = brokerAgg.get(r.brokerId);
      b.buy += r.buyVol; b.sell += r.sellVol;
      totalBuy += r.buyVol; totalSell += r.sellVol;
    }
  }
  if (totalBuy === 0 && totalSell === 0) return null;
  const buyers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, buy: d.buy, sell: d.sell, net: d.buy - d.sell })).sort((a, b) => b.buy - a.buy);
  const sellers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, sell: d.sell })).sort((a, b) => b.sell - a.sell);
  const top3Buy = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3Net = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const top3Sell = sellers.slice(0, 3).reduce((s, b) => s + b.sell, 0);
  return { bcr3Buy: totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0, bcr3Sell: totalSell > 0 ? (top3Sell / totalSell) * 100 : 0, netRetention: top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0, leadBrokerId: buyers[0]?.brokerId };
}

function checkTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  if (upperWickRatio > 0.42 && chg1d > 1.0) return true;
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

function calculateCMF(bars, period = 20) {
  const slice = bars.slice(-period);
  let mfvSum = 0, volSum = 0;
  for (const b of slice) {
    const range = b.high - b.low;
    const mfm = range > 0 ? ((b.close - b.low) - (b.high - b.close)) / range : 0;
    mfvSum += mfm * b.volume; volSum += b.volume;
  }
  return volSum > 0 ? mfvSum / volSum : 0;
}

function simulateTrade(sig) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) return null;
  const entryCandle = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!entryCandle) return null;
  const entryPrice = entryCandle.open || entryCandle.close;
  if (!entryPrice || entryPrice <= 0) return null;

  // Pre-Open Gap Veto: if it opened > +1.8% above signal close, skip
  if (entryPrice > sig.ltp * 1.018) return { skipped: 'PREOPEN_GAP_VETO' };

  const totalQty = Math.max(10, Math.floor(CAPITAL_PER_TRADE_NPR / entryPrice));
  const initialStop = +(entryPrice * 0.965).toFixed(1); // -3.5%
  const ratchetTrigger = +(entryPrice * 1.055).toFixed(1); // +5.5% MFE
  const ratchetLock = +(entryPrice * 1.022).toFixed(1);    // +2.2% BE lock
  const target1 = +(entryPrice * 1.075).toFixed(1);        // +7.5% Target 1
  const target2 = +(entryPrice * 1.150).toFixed(1);        // +15.0% Target 2

  const forward = (scripHistoryMap.get(sig.symbol) || []).filter(h => h.date >= entryDate).slice(0, HOLD_MAX_SESSIONS);
  if (forward.length < 3) return null;

  let exitPrice = forward[forward.length - 1].close;
  let exitDate = forward[forward.length - 1].date;
  let exitReason = 'TIME_EXIT';
  let target1Hit = false;
  let t1FillPrice = target1;
  let t1Day = 1;
  let ratchetArmed = false;
  let currentStop = initialStop;
  let daysHeld = forward.length;
  let peakPrice = entryPrice;
  let troughPrice = entryPrice;
  let exitedEarly = false;

  for (let d = 0; d < forward.length; d++) {
    const c = forward[d];
    if (c.high > peakPrice) peakPrice = c.high;
    if (c.low < troughPrice) troughPrice = c.low;
    const isDematLocked = d < 2;

    if (!isDematLocked) {
      if (c.low <= currentStop) {
        exitPrice = c.open <= currentStop ? c.open : currentStop;
        exitDate = c.date;
        exitReason = target1Hit ? 'T1_SPLIT_TRAIL' : (ratchetArmed ? 'RATCHET_BE (+2.2%)' : 'STOP_LOSS (-3.5%)');
        daysHeld = d + 1;
        exitedEarly = true;
        break;
      }
      if (c.high >= target2) {
        exitPrice = Math.max(c.open, target2);
        exitDate = c.date;
        exitReason = target1Hit ? 'T1_SPLIT_T2 (+15%)' : 'TARGET_2 (+15%)';
        daysHeld = d + 1;
        exitedEarly = true;
        break;
      }
      if (!target1Hit && c.high >= target1) {
        target1Hit = true;
        t1FillPrice = Math.max(c.open, target1);
        t1Day = d + 1;
        currentStop = Math.max(currentStop, +(entryPrice * 1.025).toFixed(1));
        continue;
      }
    }

    if (d >= 4 && c.high >= ratchetTrigger && !ratchetArmed && !target1Hit) {
      ratchetArmed = true;
      currentStop = Math.max(currentStop, ratchetLock);
    }
  }

  let netReturnPct;
  let effectiveExit;
  if (target1Hit) {
    const qty1 = Math.floor(totalQty / 2);
    const qty2 = totalQty - qty1;
    const leg1 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: t1FillPrice, quantity: qty1, holdingDays: Math.max(2, Math.round(t1Day * 1.4)) });
    const leg2 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: qty2, holdingDays: Math.max(2, Math.round(daysHeld * 1.4)) });
    const totalCost = leg1.totalBuyCost + leg2.totalBuyCost;
    netReturnPct = totalCost > 0 ? ((leg1.netProfitNpr + leg2.netProfitNpr) / totalCost) * 100 : 0;
    effectiveExit = (t1FillPrice * qty1 + exitPrice * qty2) / totalQty;
  } else {
    const calc = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: totalQty, holdingDays: Math.max(2, Math.round(daysHeld * 1.4)) });
    netReturnPct = calc.netReturnPct;
    effectiveExit = exitPrice;
  }

  return {
    ...sig,
    entryDate,
    exitDate,
    entryPrice: +entryPrice.toFixed(1),
    exitPrice: +effectiveExit.toFixed(1),
    peakPrice: +peakPrice.toFixed(1),
    troughPrice: +troughPrice.toFixed(1),
    maxMfePct: +(((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2),
    maxMaePct: +(((troughPrice - entryPrice) / entryPrice) * 100).toFixed(2),
    daysHeld,
    exitReason,
    grossReturnPct: +(((effectiveExit - entryPrice) / entryPrice) * 100).toFixed(2),
    netReturnPct: +netReturnPct.toFixed(2),
    isWin: netReturnPct > 0
  };
}

const testDates = sortedDates.filter(d => d >= WINDOW_START && d <= '2026-11-02');

function runTestGrid(opt) {
  const signals = [];
  for (let i = 0; i < testDates.length; i++) {
    const dt = testDates[i];
    const dateIdx = dateIndexMap.get(dt);
    const isMarketBull = marketLevel[dateIdx] >= marketEma20[dateIdx];

    for (const [sym, history] of scripHistoryMap.entries()) {
      if (sym.includes('PO') || sym.includes('DEB') || (sym.endsWith('P') && sym !== 'NADEP') || /\d+$/.test(sym)) continue;
      const p = history.findIndex(h => h.date === dt);
      if (p < 30) continue;

      const c = history[p];
      const prev = history[p - 1];
      if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

      const chg1d = ((c.close - prev.close) / prev.close) * 100;
      const curRange = c.high - c.low;
      const upperWickRatio = curRange > 0 ? (c.high - Math.max(c.open, c.close)) / curRange : 0;

      const flow10 = aggregateBrokers(sym, dateIdx, 10);
      const flow5 = aggregateBrokers(sym, dateIdx, 5);
      if (!flow10 || !flow5) continue;
      if (flow10.bcr3Buy < opt.minBcr3Buy || flow10.bcr3Sell > opt.maxBcr3Sell) continue;
      if (flow10.netRetention < opt.minRetention) continue;

      if (checkTrapVetoes(sym, dateIdx, history.slice(0, p + 1), chg1d, upperWickRatio, flow10.leadBrokerId)) continue;

      const closes = history.slice(0, p + 1).map(x => x.close);
      const c10 = closes.slice(-10);
      const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
      const cmf = calculateCMF(history.slice(0, p + 1), 20);
      const avgVol20 = history.slice(Math.max(0, p - 20), p).reduce((s, h) => s + h.volume, 0) / 20;
      const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;
      const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;

      const smc = evaluateLoopholeProtectedSmcSetup(history.slice(Math.max(0, p - 55), p + 1), {
        ltp: c.close,
        ema20: sma20,
        bcr3Buy: flow10.bcr3Buy,
        bcr3Sell: flow10.bcr3Sell,
        leadRetentionPct: flow10.netRetention,
        isTrap: false
      });

      // Track B: Break & Retest
      const isTrackB = (smc.isBreakAndRetest || smc.isT2ClearedContinuation) && spread10 <= opt.maxSpreadRetest && vduToday <= opt.maxVduRetest;

      // Track A (Protected): Base Coil
      const isTrackA = isMarketBull && (smc.isSmcSweepMss || smc.isFvgMitigated || (spread10 <= 6.8)) && spread10 <= 7.5 && cmf >= 0.08 && vduToday <= 0.65;

      if (isTrackB || isTrackA) {
        signals.push({ symbol: sym, dateIdx, date: dt, ltp: c.close, isTrackB, subTrack: isTrackB ? 'TRACK_B_RETEST' : 'TRACK_A_COIL', leadBrokerId: flow10.leadBrokerId });
      }
    }
  }

  // Deduplicate
  const deduped = [];
  const busyUntil = new Map();
  for (const sig of signals.sort((a, b) => a.dateIdx - b.dateIdx)) {
    if ((busyUntil.get(sig.symbol) || -1) >= sig.dateIdx) continue;
    deduped.push(sig);
    busyUntil.set(sig.symbol, sig.dateIdx + COOLDOWN_SESSIONS);
  }

  const executed = deduped.map(s => simulateTrade(s)).filter(t => t && !t.skipped);
  const count = executed.length;
  const wins = executed.filter(t => t.isWin);
  const losses = executed.filter(t => !t.isWin);
  const netWr = count > 0 ? (wins.length / count) * 100 : 0;
  const totG = wins.reduce((s, w) => s + w.netReturnPct, 0);
  const totL = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
  const pf = totL > 0 ? totG / totL : 99;
  const exp = count > 0 ? executed.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

  return { label: opt.label, count, wins: wins.length, losses: losses.length, netWr: +netWr.toFixed(1), pf: +pf.toFixed(2), exp: +exp.toFixed(2), pace: +(count / 6).toFixed(1), executed };
}

console.log('Testing Optimal Balanced Grids...');
const testGrids = [
  { label: 'Grid 1: Retest Spread 10%, VDU <= 0.75, Ret >= 70%, BCR3 >= 40%', maxSpreadRetest: 10.0, maxVduRetest: 0.75, minRetention: 70, minBcr3Buy: 40, maxBcr3Sell: 35 },
  { label: 'Grid 2: Retest Spread 11%, VDU <= 0.78, Ret >= 68%, BCR3 >= 38%', maxSpreadRetest: 11.0, maxVduRetest: 0.78, minRetention: 68, minBcr3Buy: 38, maxBcr3Sell: 35 },
  { label: 'Grid 3: Retest Spread 9.5%, VDU <= 0.72, Ret >= 72%, BCR3 >= 40%', maxSpreadRetest: 9.5, maxVduRetest: 0.72, minRetention: 72, minBcr3Buy: 40, maxBcr3Sell: 33 },
  { label: 'Grid 4: Pure Track B Retest Only (Spread 10%, VDU <= 0.75, Ret >= 70%)', maxSpreadRetest: 10.0, maxVduRetest: 0.75, minRetention: 70, minBcr3Buy: 40, maxBcr3Sell: 35, trackBOnly: true }
];

for (const g of testGrids) {
  const r = runTestGrid(g);
  console.log(`\n▶ ${r.label}`);
  console.log(`  Trades: ${r.count} (${r.wins}W / ${r.losses}L) | Net Win Rate: ${r.netWr}% | Profit Factor: ${r.pf}x | Expectancy: ${r.exp >= 0 ? '+' : ''}${r.exp}%/trade | Pace: ${r.pace} trades/month`);
}
