// backtest/highVelocityEngineBacktest.mjs
/**
 * ============================================================================
 * HIGH-VELOCITY 3-ARCHETYPE FLOWCHART ENGINE — 6-MONTH POINT-IN-TIME BACKTEST
 * ============================================================================
 * Evaluates the 3-Archetype architecture across 111 NEPSE trading sessions
 * (2026-05-15 to 2026-11-02, resolved through 2026-11-13) across 402 scrips:
 *
 *   Archetype 1: SMC Break & Retest + T+2 Cleared Continuation (Track B unshackled)
 *   Archetype 2: Sector-Leader EMA Pullback (Sector > EMA20, low-vol pullback)
 *   Archetype 3: Quiet Base Stealth Coil (with Leading OBV divergence + CMF)
 *
 * Enforces:
 *   - Honest Next-Day Open Entry (Day T+1)
 *   - Pre-Open Gap Veto (Cancel if open > close + 1.8%)
 *   - CDSC T+2 Demat Lockout (no exits Day 0 / Day 1)
 *   - +5.5% MFE Early Impulse Ratchet (+2.2% BE lock after Day 4/5)
 *   - +7.5% Target 1 (50% scale-out + +2.5% trailing stop)
 *   - +15.0% Target 2 runner
 *   - -3.5% Stop-Loss
 *   - Full NEPSE Statutory Frictions (5-tier brokerage, SEBON, Rs. 25 DP, 7.5% CGT)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';
import { evaluateLoopholeProtectedSmcSetup } from '../proxy/telegramNotifier.mjs';

const WINDOW_START = '2026-05-15';
const BROKER_LOAD_START = '2026-04-15';
const CAPITAL_PER_TRADE_NPR = 200000;
const HOLD_MAX_SESSIONS = 15;
const COOLDOWN_SESSIONS = 4; // allow faster re-entry across different setups

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// 1. Ingest daily OHLCV candles
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
  const candle = {
    date: dt,
    symbol: sym,
    open,
    high,
    low,
    close,
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0),
  };

  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(candle);

  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, candle);
}

const sortedDates = Array.from(allDatesSet).sort();
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// 2. Fundamentals & Sector Mapping
const normSector = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'Others';
  if (s.includes('hydro')) return 'Hydro Power';
  if (s.includes('development')) return 'Development Banks';
  if (s.includes('commercial')) return 'Commercial Banks';
  if (s.includes('micro')) return 'Microfinance';
  if (s.includes('non-life') || s.includes('non life')) return 'Non-Life Insurance';
  if (s.includes('life')) return 'Life Insurance';
  if (s.includes('finance')) return 'Finance';
  if (s.includes('hotel')) return 'Hotels & Tourism';
  if (s.includes('manufact')) return 'Manufacturing';
  if (s.includes('invest')) return 'Investment';
  if (s.includes('trad')) return 'Trading';
  return 'Others';
};

const sectorMap = new Map();
try {
  const fundRows = db.prepare('SELECT symbol, sector FROM scrip_fundamentals').all();
  for (const row of fundRows) {
    if (row.symbol) sectorMap.set(String(row.symbol).toUpperCase().trim(), normSector(row.sector));
  }
} catch (_) {}

const isExcludedInstrument = (sym) => {
  if (sym.includes('PO') || sym.includes('DEB') || (sym.endsWith('P') && sym !== 'NADEP')) return true;
  if (sym.startsWith('NMB50') || sym.startsWith('ADBLD') || /\d+$/.test(sym)) return true;
  return false;
};

// 3. Compute Equal-Weighted Sector Indices & NEPSE Market Index
const sectorDatesMap = new Map(); // sector -> Map(date -> avgReturn)
const marketReturns = new Array(sortedDates.length).fill(0);
{
  const secDailySums = new Map();
  const secDailyCounts = new Map();
  const mktSums = new Array(sortedDates.length).fill(0);
  const mktCounts = new Array(sortedDates.length).fill(0);

  for (const [sym, candles] of scripHistoryMap) {
    if (isExcludedInstrument(sym)) continue;
    const sec = sectorMap.get(sym) || 'Others';
    if (!secDailySums.has(sec)) {
      secDailySums.set(sec, new Array(sortedDates.length).fill(0));
      secDailyCounts.set(sec, new Array(sortedDates.length).fill(0));
    }

    for (let p = 1; p < candles.length; p++) {
      const prev = candles[p - 1];
      const cur = candles[p];
      const prevIdx = dateIndexMap.get(prev.date);
      const curIdx = dateIndexMap.get(cur.date);
      if (curIdx !== prevIdx + 1 || prev.close <= 0) continue;
      const ret = (cur.close - prev.close) / prev.close;
      if (Math.abs(ret) > 0.15) continue; // ignore corporate action anomalies

      secDailySums.get(sec)[curIdx] += ret;
      secDailyCounts.get(sec)[curIdx]++;
      mktSums[curIdx] += ret;
      mktCounts[curIdx]++;
    }
  }

  for (let i = 0; i < sortedDates.length; i++) {
    marketReturns[i] = mktCounts[i] > 0 ? mktSums[i] / mktCounts[i] : 0;
  }
  for (const [sec, sums] of secDailySums) {
    const counts = secDailyCounts.get(sec);
    const arr = sums.map((v, i) => (counts[i] > 0 ? v / counts[i] : 0));
    sectorDatesMap.set(sec, arr);
  }
}

// Convert daily returns to price index levels and 20-day EMAs
const toLevel = (rets) => {
  const L = []; let x = 1000;
  for (const r of rets) { x *= (1 + r); L.push(x); }
  return L;
};
const ema = (arr, n) => {
  const k = 2 / (n + 1);
  const out = []; let e = arr[0] || 1000;
  for (const v of arr) { e = v * k + e * (1 - k); out.push(e); }
  return out;
};

const marketLevel = toLevel(marketReturns);
const marketEma20 = ema(marketLevel, 20);

const sectorLevels = new Map();
const sectorEma20s = new Map();
for (const [sec, rets] of sectorDatesMap) {
  const L = toLevel(rets);
  sectorLevels.set(sec, L);
  sectorEma20s.set(sec, ema(L, 20));
}

// 4. Load Broker Rollups (Alltime JSONs + SQLite daily_broker_ledger)
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  const files = fs
    .readdirSync(alltimeDir)
    .filter((f) => f.endsWith('.json') && f !== 'crawler_progress.json');
  for (const f of files) {
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
          if (!Number.isFinite(bNum)) continue;
          const bv = Number(vals[0] || 0);
          const sv = Number(vals[1] || 0);
          const ba = Number(vals[2] || 0);
          const sa = Number(vals[3] || 0);
          if (bv > 0 || sv > 0) {
            arr.push({ brokerId: bNum, buyVol: bv, sellVol: sv, buyAmt: ba, sellAmt: sa });
          }
        }
        if (arr.length > 0) symMap.set(dt, arr);
      }
    } catch (_) {}
  }
}

const brokerRows = db
  .prepare(
    `SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
     FROM daily_broker_ledger
     WHERE COALESCE(is_quarantined, 0) = 0 AND (buy_vol > 0 OR sell_vol > 0)
     ORDER BY trade_date ASC`
  )
  .all();

const dbGrouped = new Map();
for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!sym || !b.trade_date) continue;
  const key = `${sym}|${b.trade_date}`;
  if (!dbGrouped.has(key)) dbGrouped.set(key, []);
  dbGrouped.get(key).push({
    brokerId: Number(b.broker_id),
    buyVol: Number(b.buy_vol || 0),
    sellVol: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0),
    sellAmt: Number(b.sell_amt || 0),
  });
}

for (const [key, rows] of dbGrouped.entries()) {
  const [sym, dt] = key.split('|');
  if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
  scripBrokerByDate.get(sym).set(dt, rows);
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

  const bcr3Buy = totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0;
  const bcr3Sell = totalSell > 0 ? (top3Sell / totalSell) * 100 : 0;
  const netRetention = top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0;
  const leadBroker = buyers[0];
  const operatorVwap = leadBroker?.vwap || (totalBuy > 0 ? totalBuyAmt / totalBuy : 0);

  return {
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    bcr3Spread: +(bcr3Buy - bcr3Sell).toFixed(1),
    netRetention: +netRetention.toFixed(1),
    operatorVwap: +operatorVwap.toFixed(1),
    leadBrokerId: leadBroker?.brokerId ?? null
  };
}

// 5. 5-Day Demat Dump & Trap Guards
function checkTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  if (upperWickRatio > 0.42 && chg1d > 1.0) return { isTrap: true, reason: 'UPPER_WICK_DISTRIBUTION' };
  if (hist.length >= 3) {
    const b0 = hist[hist.length - 1], b1 = hist[hist.length - 2], b2 = hist[hist.length - 3];
    if ((b0.close < b1.close && b1.close < b2.close) || (b0.close < b0.open && b1.close < b1.open && b2.close < b2.open)) {
      return { isTrap: true, reason: 'THREE_CONSECUTIVE_RED_DAYS' };
    }
  }

  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return { isTrap: true, reason: 'NO_BROKER_DATA' };

  let maxDump = 0, maxBuy = 0;
  for (const offset of [-1, 0]) {
    const idx = dateIdx + offset; if (idx < 0) continue;
    for (const r of symMap.get(sortedDates[idx]) || []) {
      const net = r.buyVol - r.sellVol;
      if (net < -12000 && Math.abs(net) > maxDump) maxDump = Math.abs(net);
      if (net > 12000 && net > maxBuy) maxBuy = net;
    }
  }
  if (maxDump > 0 && maxBuy < maxDump * 0.8) return { isTrap: true, reason: 'UNABSORBED_MASSIVE_DUMP' };

  // Past Accumulator Demat Dump Guard
  const priorAccMap = new Map();
  for (let idx = Math.max(0, dateIdx - 7); idx <= dateIdx - 3; idx++) {
    for (const r of symMap.get(sortedDates[idx]) || []) {
      priorAccMap.set(r.brokerId, (priorAccMap.get(r.brokerId) || 0) + (r.buyVol - r.sellVol));
    }
  }
  const topPriorAcc = Array.from(priorAccMap.entries()).filter(x => x[1] >= 5000).sort((a, b) => b[1] - a[1])[0];
  if (topPriorAcc) {
    const t0Rows = symMap.get(sortedDates[dateIdx]) || [];
    const t1Rows = dateIdx > 0 ? symMap.get(sortedDates[dateIdx - 1]) || [] : [];
    const r0 = t0Rows.find(r => r.brokerId === topPriorAcc[0]);
    const r1 = t1Rows.find(r => r.brokerId === topPriorAcc[0]);
    const sellDump = (r0 ? r0.sellVol - r0.buyVol : 0) + (r1 ? r1.sellVol - r1.buyVol : 0);
    if (sellDump >= Math.max(5000, topPriorAcc[1] * 0.4)) {
      return { isTrap: true, reason: 'PAST_ACCUMULATOR_DEMAT_DUMP' };
    }
  }

  // Active distribution today
  if (leadBrokerId != null) {
    const rToday = (symMap.get(sortedDates[dateIdx]) || []).find(r => r.brokerId === leadBrokerId);
    if (rToday && rToday.buyVol - rToday.sellVol < -5000) {
      return { isTrap: true, reason: 'ACTIVE_DISTRIBUTION_TODAY' };
    }
  }

  return { isTrap: false, reason: 'CLEAN' };
}

// 6. Indicators (CMF, BBW, Leading OBV Spread)
function calculateCMF(bars, period = 20) {
  const slice = bars.slice(-period);
  let mfvSum = 0, volSum = 0;
  for (const b of slice) {
    const range = b.high - b.low;
    const mfm = range > 0 ? ((b.close - b.low) - (b.high - b.close)) / range : 0;
    mfvSum += mfm * b.volume;
    volSum += b.volume;
  }
  return volSum > 0 ? mfvSum / volSum : 0;
}

function calculateBBW(closes, period = 20) {
  const slice = closes.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return mean > 0 ? ((2 * std) / mean) * 100 : 99;
}

const pctRank = (arr, v) => (arr.filter(x => x <= v).length / arr.length) * 100;
function calculateObvSpread(history, p) {
  const obv = []; let o = 0;
  for (let q = Math.max(0, p - 29); q <= p; q++) {
    if (q > 0) o += history[q].close > history[q - 1].close ? history[q].volume : history[q].close < history[q - 1].close ? -history[q].volume : 0;
    obv.push(o);
  }
  if (obv.length < 15) return 0;
  const obv15 = obv.slice(-15);
  const px15 = history.slice(Math.max(0, p - 14), p + 1).map(x => x.close);
  return pctRank(obv15, obv15[obv15.length - 1]) - pctRank(px15, px15[px15.length - 1]);
}

// 7. Honest Trade Simulator
function simulateTrade(sig) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) return null;
  const entryCandle = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!entryCandle) return null;
  const entryPrice = entryCandle.open || entryCandle.close;
  if (!entryPrice || entryPrice <= 0) return null;

  // Pre-Open Gap Veto: if it opened > +1.8% above signal close, skip
  if (entryPrice > sig.ltp * 1.018) {
    return { skipped: 'PREOPEN_GAP_VETO' };
  }

  const totalQty = Math.max(10, Math.floor(CAPITAL_PER_TRADE_NPR / entryPrice));
  const initialStop = +(entryPrice * 0.965).toFixed(1); // -3.5%
  const ratchetTrigger = +(entryPrice * 1.055).toFixed(1); // +5.5% MFE
  const ratchetLock = +(entryPrice * 1.022).toFixed(1);    // +2.2% BE lock
  const target1 = +(entryPrice * 1.075).toFixed(1);        // +7.5% Target 1 (50% scale-out)
  const target2 = +(entryPrice * 1.150).toFixed(1);        // +15.0% Target 2 runner

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
    const isDematLocked = d < 2; // CDSC T+2 Demat Lock

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

    // Arm Early Impulse Ratchet (+5.5% MFE after Day 4)
    if (d >= 4 && c.high >= ratchetTrigger && !ratchetArmed && !target1Hit) {
      ratchetArmed = true;
      currentStop = Math.max(currentStop, ratchetLock);
    }
  }

  const truncated = !exitedEarly && forward.length < HOLD_MAX_SESSIONS;
  if (truncated) {
    exitReason = target1Hit ? 'T1_PARTIAL+OPEN_END' : 'OPEN_AT_DATA_END';
  } else if (!exitedEarly && target1Hit) {
    exitReason = 'T1_SPLIT_TIME';
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

  const grossReturnPct = +(((effectiveExit - entryPrice) / entryPrice) * 100).toFixed(2);
  const maxMfePct = +(((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2);
  const maxMaePct = +(((troughPrice - entryPrice) / entryPrice) * 100).toFixed(2);

  return {
    ...sig,
    entryDate,
    exitDate,
    entryPrice: +entryPrice.toFixed(1),
    exitPrice: +effectiveExit.toFixed(1),
    peakPrice: +peakPrice.toFixed(1),
    troughPrice: +troughPrice.toFixed(1),
    maxMfePct,
    maxMaePct,
    daysHeld,
    exitReason,
    grossReturnPct,
    netReturnPct: +netReturnPct.toFixed(2),
    isWin: netReturnPct > 0
  };
}

// 8. Run 3-Archetype Engine Across 6 Months
const testDates = sortedDates.filter(d => d >= WINDOW_START && d <= '2026-11-02');
console.log(`Auditing 3-Archetype Engine over ${testDates.length} sessions (${testDates[0]} to ${testDates[testDates.length - 1]})...`);

const rawSignals = [];

for (let i = 0; i < testDates.length; i++) {
  const dt = testDates[i];
  const dateIdx = dateIndexMap.get(dt);
  const isMarketBull = marketLevel[dateIdx] >= marketEma20[dateIdx];

  for (const [sym, history] of scripHistoryMap.entries()) {
    if (isExcludedInstrument(sym)) continue;
    const p = history.findIndex(h => h.date === dt);
    if (p < 30) continue;

    const c = history[p];
    const prev = history[p - 1];
    if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

    const chg1d = ((c.close - prev.close) / prev.close) * 100;
    const curRange = c.high - c.low;
    const upperWickRatio = curRange > 0 ? (c.high - Math.max(c.open, c.close)) / curRange : 0;
    const clv = curRange > 0 ? (c.close - c.low) / curRange : 0.5;

    // Broker flow
    const flow10 = aggregateBrokers(sym, dateIdx, 10);
    const flow5 = aggregateBrokers(sym, dateIdx, 5);
    if (!flow10 || !flow5) continue;
    if (flow10.bcr3Buy < 36.0 || flow10.bcr3Sell > 36.0) continue;
    if (flow10.netRetention < 65.0 || flow5.netRetention < 55.0) continue;

    // Trap vetoes
    const trap = checkTrapVetoes(sym, dateIdx, history.slice(0, p + 1), chg1d, upperWickRatio, flow10.leadBrokerId);
    if (trap.isTrap) continue;

    const closes = history.slice(0, p + 1).map(x => x.close);
    const c10 = closes.slice(-10);
    const min10 = Math.min(...c10), max10 = Math.max(...c10);
    const spread10 = ((max10 - min10) / min10) * 100;
    const bbw = calculateBBW(closes, 20);
    const cmf = calculateCMF(history.slice(0, p + 1), 20);
    const avgVol20 = history.slice(Math.max(0, p - 20), p).reduce((s, h) => s + h.volume, 0) / 20;
    const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const sma10 = closes.slice(-10).reduce((s, v) => s + v, 0) / 10;
    const obvSpread = calculateObvSpread(history, p);

    const smc = evaluateLoopholeProtectedSmcSetup(history.slice(Math.max(0, p - 55), p + 1), {
      ltp: c.close,
      ema20: sma20,
      bcr3Buy: flow10.bcr3Buy,
      bcr3Sell: flow10.bcr3Sell,
      leadRetentionPct: flow10.netRetention,
      isTrap: false
    });

    const sec = sectorMap.get(sym) || 'Others';
    const isSectorBull = sectorLevels.has(sec) && sectorEma20s.has(sec) ? sectorLevels.get(sec)[dateIdx] >= sectorEma20s.get(sec)[dateIdx] : isMarketBull;

    let qualifiedArchetype = null;

    // Archetype 1: SMC Break & Retest + T+2 Cleared Continuation (Track B Unshackled from spread10 <= 6.8%)
    // Allows spread10 up to 12.0% because prior breakout expanded the range
    if ((smc.isBreakAndRetest || smc.isT2ClearedContinuation) && spread10 <= 12.0 && vduToday <= 0.85 && flow10.bcr3Buy >= 38.0) {
      qualifiedArchetype = 'ARCHETYPE_1_BREAK_AND_RETEST';
    }

    // Archetype 2: Sector-Leader EMA Pullback
    // In a leading sector (Sector > EMA20), stock pulls back to 10/20 EMA on low volume (VDU <= 0.70) with positive CMF
    else if (isSectorBull && (c.low <= sma10 * 1.01 || c.low <= sma20 * 1.01) && c.close >= Math.min(sma10, sma20) * 0.995 && vduToday <= 0.70 && cmf >= 0.08 && chg1d >= -1.5 && chg1d <= 2.5 && spread10 <= 9.5) {
      qualifiedArchetype = 'ARCHETYPE_2_SECTOR_EMA_PULLBACK';
    }

    // Archetype 3: Quiet Base Stealth Coil (with Leading OBV Divergence)
    // Squeeze base with strong OBV accumulation, only active when broader market is healthy (NEPSE > EMA20)
    else if (isMarketBull && spread10 <= 7.5 && bbw <= 14.0 && (obvSpread >= 28 || (cmf >= 0.12 && vduToday <= 0.60)) && chg1d >= -1.2 && chg1d <= 2.0 && clv >= 0.45) {
      qualifiedArchetype = 'ARCHETYPE_3_STEALTH_COIL';
    }

    if (qualifiedArchetype) {
      rawSignals.push({
        symbol: sym,
        dateIdx,
        date: dt,
        ltp: c.close,
        archetype: qualifiedArchetype,
        bcr3Buy: flow10.bcr3Buy,
        bcr3Sell: flow10.bcr3Sell,
        bcr3Spread: flow10.bcr3Spread,
        ret10D: flow10.netRetention,
        ret5D: flow5.netRetention,
        leadBrokerId: flow10.leadBrokerId,
        obvSpread,
        cmf: +cmf.toFixed(2),
        vdu: +vduToday.toFixed(2),
        spread10: +spread10.toFixed(1),
        sector: sec
      });
    }
  }
}

// Deduplicate signals (4-session cooldown per symbol)
const dedupedSignals = [];
const busyUntil = new Map();
for (const sig of rawSignals.sort((a, b) => a.dateIdx - b.dateIdx)) {
  if ((busyUntil.get(sig.symbol) || -1) >= sig.dateIdx) continue;
  dedupedSignals.push(sig);
  busyUntil.set(sig.symbol, sig.dateIdx + COOLDOWN_SESSIONS);
}

const executedTrades = dedupedSignals.map(s => simulateTrade(s)).filter(t => t && !t.skipped);
const count = executedTrades.length;
const wins = executedTrades.filter(t => t.isWin);
const losses = executedTrades.filter(t => !t.isWin);
const netWinRate = count > 0 ? (wins.length / count) * 100 : 0;
const totalGains = wins.reduce((s, w) => s + w.netReturnPct, 0);
const totalLosses = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 99 : 0;
const avgWin = wins.length > 0 ? totalGains / wins.length : 0;
const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
const expectancy = count > 0 ? executedTrades.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

console.log('\n══════════════════════════════════════════════════════════════════════════════════');
console.log('📊 3-ARCHETYPE HIGH-VELOCITY ENGINE — 6-MONTH BACK-DATE TEST AUDIT');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log(`Horizon: ${testDates[0]} → ${testDates[testDates.length - 1]} (${testDates.length} sessions)`);
console.log(`Raw Signals: ${rawSignals.length} | Deduplicated: ${dedupedSignals.length} | Executed: ${count}`);
console.log(`Trade Velocity: ${(count / 6).toFixed(1)} trades/month (~${(count / (testDates.length / 5)).toFixed(1)} trades/week)`);
console.log(`Strict Net Win Rate: ${netWinRate.toFixed(1)}% (${wins.length} Wins / ${losses.length} Losses)`);
console.log(`Avg Win: +${avgWin.toFixed(2)}% | Avg Loss: -${avgLoss.toFixed(2)}% | Realized R:R: ${(avgWin / Math.max(0.01, avgLoss)).toFixed(2)}:1`);
console.log(`Profit Factor: ${profitFactor.toFixed(2)}x | Net Expectancy: ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}%/trade`);

// Per-Archetype Breakdown
console.log('\n── PER-ARCHETYPE BREAKDOWN ───────────────────────────────────────────────────────');
const archList = ['ARCHETYPE_1_BREAK_AND_RETEST', 'ARCHETYPE_2_SECTOR_EMA_PULLBACK', 'ARCHETYPE_3_STEALTH_COIL'];
for (const a of archList) {
  const sub = executedTrades.filter(t => t.archetype === a);
  const subWins = sub.filter(t => t.isWin);
  const subWr = sub.length > 0 ? (subWins.length / sub.length) * 100 : 0;
  const subG = subWins.reduce((s, w) => s + w.netReturnPct, 0);
  const subL = Math.abs(sub.filter(t => !t.isWin).reduce((s, l) => s + l.netReturnPct, 0));
  const subPf = subL > 0 ? subG / subL : subG > 0 ? 99 : 0;
  const subExp = sub.length > 0 ? sub.reduce((s, t) => s + t.netReturnPct, 0) / sub.length : 0;
  console.log(`• ${a.padEnd(32)} | Trades: ${String(sub.length).padEnd(2)} (${String(subWins.length).padStart(2)}W/${String(sub.length - subWins.length).padStart(2)}L) | Win Rate: ${subWr.toFixed(1)}% | PF: ${subPf.toFixed(2)}x | Exp: ${subExp >= 0 ? '+' : ''}${subExp.toFixed(2)}%`);
}

// Write detailed report
const md = [];
md.push('# 3-Archetype High-Velocity Engine — 6-Month Back-Date Audit Report');
md.push('');
md.push(`**Scan Horizon:** ${testDates[0]} to ${testDates[testDates.length - 1]} (111 NEPSE sessions, resolved through 2026-11-13)  `);
md.push(`**Executed Trades:** ${count} trades (**${(count / 6).toFixed(1)} trades / month**)  `);
md.push(`**Strict Net Win Rate %:** **${netWinRate.toFixed(1)}%** (${wins.length} Wins / ${losses.length} Losses)  `);
md.push(`**Profit Factor:** **${profitFactor.toFixed(2)}x** | **Net Expectancy:** **+${expectancy.toFixed(2)}% per trade**  `);
md.push('');
md.push('---');
md.push('');
md.push('## 1. Trade-by-Trade Performance Audit');
md.push('');
md.push('| # | Symbol | Signal Date | Entry Date | Exit Date | Archetype | Lead Broker | Entry (Rs.) | Exit (Rs.) | MFE % (Peak) | MAE % (Drawdown) | Held | Net Return % | Outcome |');
md.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
executedTrades.forEach((t, idx) => {
  const tag = t.isWin ? `✅ WIN (${t.exitReason})` : `❌ LOSS (${t.exitReason})`;
  md.push(`| ${idx + 1} | **${t.symbol}** | ${t.date} | ${t.entryDate} | ${t.exitDate} | \`${t.archetype.replace('ARCHETYPE_', '')}\` | #${t.leadBrokerId} | ${t.entryPrice} | ${t.exitPrice} | +${t.maxMfePct}% | ${t.maxMaePct}% | ${t.daysHeld}d | **${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct}%** | ${tag} |`);
});
md.push('');

const repPath = path.join(process.cwd(), 'backtest', 'highVelocityEngineReport.md');
fs.writeFileSync(repPath, md.join('\n'), 'utf8');
console.log(`\nDetailed report written to ${repPath}`);
