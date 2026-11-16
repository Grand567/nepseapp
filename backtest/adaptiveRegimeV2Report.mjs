// backtest/adaptiveRegimeV2Report.mjs
/**
 * ============================================================================
 * ADAPTIVE REGIME FLOWCHART v2.0 — 6-MONTH POINT-IN-TIME BACKTEST & REPORT
 * ============================================================================
 * Implements the full Adaptive Regime Flowchart v2.0 across 111 trading sessions
 * (2026-05-15 to 2026-11-02, resolved through 2026-11-13) across 402 NEPSE scrips.
 *
 * Regime Rules (Evaluated at Day T 3:15 PM close):
 *   - Bull Regime: NEPSE Equal-Weighted Average Close >= 20-Day SMA
 *   - Chop Regime: NEPSE Equal-Weighted Average Close < 20-Day SMA
 *
 * Action in Bull Regime:
 *   - Track B Active (Break & Retest + T+2 Cleared Continuation, spread10 <= 10.5%, VDU <= 0.75)
 *   - Track A Active (Tactical Coiled Ignitions with CMF >= 0.08 & VDU <= 0.60)
 *
 * Action in Chop Regime:
 *   - Track A MUTED (Zero bottom-picking into a falling/choppy index)
 *   - Track B Sniper Mode (Only pristine retests with Retention >= 75%, BCR3 Buy >= 42%)
 *
 * Execution & Cost Model:
 *   - Next-day Open entry (Day T+1), Pre-open gap cap (+1.8%)
 *   - CDSC T+2 Demat lock (no exits Day 0 / Day 1)
 *   - +5.5% MFE Early Impulse Ratchet (+2.2% BE lock after Day 4/5)
 *   - +7.5% Target 1 (50% scale-out + +2.5% trailing stop)
 *   - +15.0% Target 2 runner
 *   - -3.5% Stop-Loss
 *   - 15-session max hold
 *   - Rs. 200,000 position sizing, 5-tier SEBON brokerage, SEBON fee, Rs. 25 DP fee, 7.5% CGT
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
const COOLDOWN_SESSIONS = 5;

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

// 2. Compute Market Average Close & 20-Day SMA for Point-in-Time Regime Detection
const dailyMarketAgg = [];
for (const dt of sortedDates) {
  const map = dateScripMap.get(dt);
  let sum = 0, count = 0, turn = 0;
  for (const c of map.values()) {
    if (c.close > 0 && !c.symbol.includes('PO') && !c.symbol.includes('DEB') && !/\d+$/.test(c.symbol)) {
      sum += c.close;
      count++;
      turn += c.turnover;
    }
  }
  dailyMarketAgg.push({
    date: dt,
    avgPrice: count > 0 ? sum / count : 0,
    turnover: turn,
  });
}

const marketCloses = dailyMarketAgg.map((r) => r.avgPrice);
const marketSma20 = marketCloses.map((_, i) => {
  if (i < 19) return marketCloses[i];
  const slice = marketCloses.slice(i - 19, i + 1);
  return slice.reduce((a, b) => a + b, 0) / 20;
});

// 3. Load Broker Rollups (Alltime JSONs + SQLite daily_broker_ledger)
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
      b.buy += r.buyVol;
      b.sell += r.sellVol;
      b.buyAmt += r.buyAmt;
      totalBuy += r.buyVol;
      totalSell += r.sellVol;
      totalBuyAmt += r.buyAmt;
    }
  }
  if (totalBuy === 0 && totalSell === 0) return null;

  const buyers = Array.from(brokerAgg.entries())
    .map(([id, d]) => ({
      brokerId: id,
      buy: d.buy,
      sell: d.sell,
      net: d.buy - d.sell,
      vwap: d.buy > 0 ? d.buyAmt / d.buy : 0,
    }))
    .sort((a, b) => b.buy - a.buy);

  const sellers = Array.from(brokerAgg.entries())
    .map(([id, d]) => ({ brokerId: id, sell: d.sell }))
    .sort((a, b) => b.sell - a.sell);

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
    leadBrokerId: leadBroker?.brokerId ?? null,
  };
}

// 4. 5-Day Demat Dump Trap Vetoes
function checkTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  if (upperWickRatio > 0.42 && chg1d > 1.0) {
    return { isTrap: true, reason: 'UPPER_WICK_DISTRIBUTION' };
  }
  if (hist.length >= 3) {
    const b0 = hist[hist.length - 1];
    const b1 = hist[hist.length - 2];
    const b2 = hist[hist.length - 3];
    if (
      (b0.close < b1.close && b1.close < b2.close) ||
      (b0.close < b0.open && b1.close < b1.open && b2.close < b2.open)
    ) {
      return { isTrap: true, reason: 'THREE_CONSECUTIVE_RED_DAYS' };
    }
  }

  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return { isTrap: true, reason: 'NO_BROKER_DATA' };

  let maxDump = 0;
  let maxBuy = 0;
  for (const offset of [-1, 0]) {
    const idx = dateIdx + offset;
    if (idx < 0) continue;
    const rows = symMap.get(sortedDates[idx]) || [];
    for (const r of rows) {
      const net = r.buyVol - r.sellVol;
      if (net < -12000 && Math.abs(net) > maxDump) maxDump = Math.abs(net);
      if (net > 12000 && net > maxBuy) maxBuy = net;
    }
  }
  if (maxDump > 0 && maxBuy < maxDump * 0.8) {
    return { isTrap: true, reason: 'UNABSORBED_MASSIVE_DUMP' };
  }

  // Past Accumulator Demat Dump Guard
  const priorAccMap = new Map();
  for (let idx = Math.max(0, dateIdx - 7); idx <= dateIdx - 3; idx++) {
    const rows = symMap.get(sortedDates[idx]) || [];
    for (const r of rows) {
      priorAccMap.set(r.brokerId, (priorAccMap.get(r.brokerId) || 0) + (r.buyVol - r.sellVol));
    }
  }
  const topPriorAcc = Array.from(priorAccMap.entries())
    .map(([brokerId, netAcc]) => ({ brokerId, netAcc }))
    .filter((x) => x.netAcc >= 5000)
    .sort((a, b) => b.netAcc - a.netAcc)[0];

  if (topPriorAcc) {
    const rowsT1 = dateIdx - 1 >= 0 ? symMap.get(sortedDates[dateIdx - 1]) || [] : [];
    const rowsT0 = symMap.get(sortedDates[dateIdx]) || [];
    const fT1 = rowsT1.find((r) => r.brokerId === topPriorAcc.brokerId);
    const fT0 = rowsT0.find((r) => r.brokerId === topPriorAcc.brokerId);
    const netSellT1 = fT1 ? fT1.sellVol - fT1.buyVol : 0;
    const netSellT0 = fT0 ? fT0.sellVol - fT0.buyVol : 0;
    const netSellCombined = netSellT1 + netSellT0;
    const dumpThreshold = Math.max(5000, topPriorAcc.netAcc * 0.4);
    if (netSellT1 >= dumpThreshold || netSellT0 >= dumpThreshold || netSellCombined >= dumpThreshold) {
      return { isTrap: true, reason: 'PAST_ACCUMULATOR_DEMAT_DUMP' };
    }
  }

  // Active Distribution Today
  if (leadBrokerId != null) {
    const todayRows = symMap.get(sortedDates[dateIdx]) || [];
    const leadToday = todayRows.find((r) => r.brokerId === leadBrokerId);
    if (leadToday && leadToday.buyVol - leadToday.sellVol < -5000) {
      return { isTrap: true, reason: 'ACTIVE_DISTRIBUTION_TODAY' };
    }
  }

  return { isTrap: false, reason: 'CLEAN' };
}

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

// 5. Honest Trade Execution Simulator
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
  const target1 = +(entryPrice * 1.075).toFixed(1);        // +7.5% Target 1
  const target2 = +(entryPrice * 1.150).toFixed(1);        // +15.0% Target 2

  const forward = (scripHistoryMap.get(sig.symbol) || []).filter((h) => h.date >= entryDate).slice(0, HOLD_MAX_SESSIONS);
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
    const isDematLocked = d < 2; // CDSC T+2 Demat lock

    if (!isDematLocked) {
      if (c.low <= currentStop) {
        exitPrice = c.open <= currentStop ? c.open : currentStop;
        exitDate = c.date;
        exitReason = target1Hit
          ? 'T1_SPLIT_TRAIL'
          : ratchetArmed
            ? 'RATCHET_BE (+2.2%)'
            : 'STOP_LOSS (-3.5%)';
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

    // Arm Early Impulse Ratchet (+5.5% MFE after session 4)
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
    const leg1 = calculateRoundTripNetReturn({
      buyPrice: entryPrice,
      sellPrice: t1FillPrice,
      quantity: qty1,
      holdingDays: Math.max(2, Math.round(t1Day * 1.4)),
    });
    const leg2 = calculateRoundTripNetReturn({
      buyPrice: entryPrice,
      sellPrice: exitPrice,
      quantity: qty2,
      holdingDays: Math.max(2, Math.round(daysHeld * 1.4)),
    });
    const totalCost = leg1.totalBuyCost + leg2.totalBuyCost;
    netReturnPct = totalCost > 0 ? ((leg1.netProfitNpr + leg2.netProfitNpr) / totalCost) * 100 : 0;
    effectiveExit = (t1FillPrice * qty1 + exitPrice * qty2) / totalQty;
  } else {
    const calc = calculateRoundTripNetReturn({
      buyPrice: entryPrice,
      sellPrice: exitPrice,
      quantity: totalQty,
      holdingDays: Math.max(2, Math.round(daysHeld * 1.4)),
    });
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
    truncated,
    grossReturnPct,
    netReturnPct: +netReturnPct.toFixed(2),
    isWin: netReturnPct > 0,
  };
}

// 6. Execute Adaptive Regime Flowchart v2.0
const testDates = sortedDates.filter((d) => d >= WINDOW_START && d <= '2026-11-02');
console.log(`Running Adaptive Regime Flowchart v2.0 over ${testDates.length} sessions...`);

const rawSignals = [];
let bullRegimeSessions = 0;
let chopRegimeSessions = 0;

for (let i = 0; i < testDates.length; i++) {
  const dt = testDates[i];
  const dateIdx = dateIndexMap.get(dt);
  const mktClose = marketCloses[dateIdx];
  const mktSma = marketSma20[dateIdx];
  const isBullRegime = mktClose >= mktSma;
  if (isBullRegime) bullRegimeSessions++; else chopRegimeSessions++;

  for (const [sym, history] of scripHistoryMap.entries()) {
    if (sym.includes('PO') || sym.includes('DEB') || (sym.endsWith('P') && sym !== 'NADEP') || /\d+$/.test(sym)) {
      continue;
    }
    const p = history.findIndex((h) => h.date === dt);
    if (p < 30) continue;

    const c = history[p];
    const prev = history[p - 1];
    if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;

    const chg1d = ((c.close - prev.close) / prev.close) * 100;
    const curRange = c.high - c.low;
    const upperWickRatio = curRange > 0 ? (c.high - Math.max(c.open, c.close)) / curRange : 0;
    const clv = curRange > 0 ? (c.close - c.low) / curRange : 0.5;

    const flow10 = aggregateBrokers(sym, dateIdx, 10);
    const flow5 = aggregateBrokers(sym, dateIdx, 5);
    if (!flow10 || !flow5) continue;

    // Trap vetoes
    const trap = checkTrapVetoes(sym, dateIdx, history.slice(0, p + 1), chg1d, upperWickRatio, flow10.leadBrokerId);
    if (trap.isTrap) continue;

    const closes = history.slice(0, p + 1).map((x) => x.close);
    const c10 = closes.slice(-10);
    const min10 = Math.min(...c10), max10 = Math.max(...c10);
    const spread10 = ((max10 - min10) / min10) * 100;
    const bbw = calculateBBW(closes, 20);
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
      isTrap: false,
    });

    let qualifiedTrack = null;
    let setupReason = null;

    if (isBullRegime) {
      // ── BULL REGIME ──
      // Track B: Break & Retest + T+2 Cleared Continuation (Unshackled from spread <= 6.8%)
      if (
        (smc.isBreakAndRetest || smc.isT2ClearedContinuation) &&
        spread10 <= 10.5 &&
        vduToday <= 0.78 &&
        flow10.bcr3Buy >= 38.0 &&
        flow10.bcr3Sell <= 35.0 &&
        flow10.netRetention >= 68.0
      ) {
        qualifiedTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
        setupReason = smc.isBreakAndRetest ? 'SMC_BREAK_AND_RETEST' : 'T2_CLEARED_CONTINUATION';
      }
      // Track A: Tactical Base Coil (OBV divergence or CMF with volume squeeze)
      else if (
        spread10 <= 7.0 &&
        bbw <= 13.5 &&
        vduToday <= 0.60 &&
        cmf >= 0.08 &&
        chg1d >= -1.2 &&
        chg1d <= 2.0 &&
        flow10.bcr3Buy >= 40.0 &&
        flow10.bcr3Sell <= 32.0 &&
        flow10.netRetention >= 72.0
      ) {
        qualifiedTrack = 'TRACK_A_COILED_2_3D_IGNITION';
        setupReason = smc.isSmcSweepMss ? 'SMC_SWEEP_MSS_FVG' : 'STEALTH_FLOOR';
      }
    } else {
      // ── CHOP REGIME ──
      // Track A is MUTED completely (capital preservation).
      // Track B in Sniper Mode: Only high-conviction institutional break-and-retests.
      if (
        smc.isBreakAndRetest &&
        spread10 <= 8.5 &&
        vduToday <= 0.70 &&
        flow10.bcr3Buy >= 42.0 &&
        flow10.bcr3Sell <= 30.0 &&
        flow10.netRetention >= 78.0
      ) {
        qualifiedTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
        setupReason = 'SNIPER_BREAK_AND_RETEST';
      }
    }

    if (qualifiedTrack) {
      rawSignals.push({
        symbol: sym,
        dateIdx,
        date: dt,
        ltp: c.close,
        regime: isBullRegime ? 'BULL' : 'CHOP',
        rallyTrack: qualifiedTrack,
        setupReason,
        bcr3Buy: flow10.bcr3Buy,
        bcr3Sell: flow10.bcr3Sell,
        bcr3Spread: flow10.bcr3Spread,
        ret10D: flow10.netRetention,
        ret5D: flow5.netRetention,
        leadBrokerId: flow10.leadBrokerId,
        cmf: +cmf.toFixed(2),
        vdu: +vduToday.toFixed(2),
        spread10: +spread10.toFixed(1),
      });
    }
  }
}

// Deduplicate (5-session cooldown per symbol)
const dedupedSignals = [];
const busyUntil = new Map();
for (const sig of rawSignals.sort((a, b) => a.dateIdx - b.dateIdx)) {
  if ((busyUntil.get(sig.symbol) || -1) >= sig.dateIdx) continue;
  dedupedSignals.push(sig);
  busyUntil.set(sig.symbol, sig.dateIdx + COOLDOWN_SESSIONS);
}

const executedTrades = dedupedSignals.map((s) => simulateTrade(s)).filter((t) => t && !t.skipped);
const count = executedTrades.length;
const wins = executedTrades.filter((t) => t.isWin);
const losses = executedTrades.filter((t) => !t.isWin);
const netWinRate = count > 0 ? (wins.length / count) * 100 : 0;
const totalGains = wins.reduce((s, w) => s + w.netReturnPct, 0);
const totalLosses = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 99 : 0;
const avgWin = wins.length > 0 ? totalGains / wins.length : 0;
const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
const expectancy = count > 0 ? executedTrades.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

let equity = 100000;
for (const t of executedTrades) {
  equity += equity * 0.2 * (t.netReturnPct / 100);
}
const periodReturnPct = ((equity - 100000) / 100000) * 100;

console.log('\n══════════════════════════════════════════════════════════════════════════════════');
console.log('📊 ADAPTIVE REGIME FLOWCHART v2.0 — 6-MONTH BACK-DATE TEST REPORT');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log(`Scan Horizon  : ${testDates[0]} → ${testDates[testDates.length - 1]} (${testDates.length} sessions; resolved through ${sortedDates[sortedDates.length - 1]})`);
console.log(`Market Regime : ${bullRegimeSessions} Bull sessions | ${chopRegimeSessions} Chop sessions`);
console.log(`Raw Signals   : ${rawSignals.length} | Deduplicated: ${dedupedSignals.length} | Executed: ${count}`);
console.log(`Trade Velocity: ${(count / 6).toFixed(1)} trades/month`);
console.log(`Strict Net Win Rate: ${netWinRate.toFixed(1)}% (${wins.length} Wins / ${losses.length} Losses)`);
console.log(`Avg Win: +${avgWin.toFixed(2)}% | Avg Loss: -${avgLoss.toFixed(2)}% | Realized R:R: ${(avgWin / Math.max(0.01, avgLoss)).toFixed(2)}:1`);
console.log(`Profit Factor : ${profitFactor.toFixed(2)}x | Net Expectancy: ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}%/trade`);
console.log(`Period Return (20% pos size): +${periodReturnPct.toFixed(2)}%`);

// Per Track & Regime Breakdown
console.log('\n── PER-TRACK & REGIME BREAKDOWN ──────────────────────────────────────────────────');
const trackBTrades = executedTrades.filter((t) => t.rallyTrack.includes('TRACK_B'));
const trackBWins = trackBTrades.filter((t) => t.isWin);
const trackBWr = trackBTrades.length > 0 ? (trackBWins.length / trackBTrades.length) * 100 : 0;
const trackBG = trackBWins.reduce((s, w) => s + w.netReturnPct, 0);
const trackBL = Math.abs(trackBTrades.filter((t) => !t.isWin).reduce((s, l) => s + l.netReturnPct, 0));
const trackBPf = trackBL > 0 ? trackBG / trackBL : 99;
const trackBExp = trackBTrades.length > 0 ? trackBTrades.reduce((s, t) => s + t.netReturnPct, 0) / trackBTrades.length : 0;
console.log(`• Track B (Retest / Continuation) | Trades: ${trackBTrades.length} (${trackBWins.length}W/${trackBTrades.length - trackBWins.length}L) | Net WR: ${trackBWr.toFixed(1)}% | PF: ${trackBPf.toFixed(2)}x | Exp: +${trackBExp.toFixed(2)}%`);

const trackATrades = executedTrades.filter((t) => t.rallyTrack.includes('TRACK_A'));
const trackAWins = trackATrades.filter((t) => t.isWin);
const trackAWr = trackATrades.length > 0 ? (trackAWins.length / trackATrades.length) * 100 : 0;
const trackAG = trackAWins.reduce((s, w) => s + w.netReturnPct, 0);
const trackAL = Math.abs(trackATrades.filter((t) => !t.isWin).reduce((s, l) => s + l.netReturnPct, 0));
const trackAPf = trackAL > 0 ? trackAG / trackAL : 99;
const trackAExp = trackATrades.length > 0 ? trackATrades.reduce((s, t) => s + t.netReturnPct, 0) / trackATrades.length : 0;
console.log(`• Track A (Bull Coiled Ignitions) | Trades: ${trackATrades.length} (${trackAWins.length}W/${trackATrades.length - trackAWins.length}L) | Net WR: ${trackAWr.toFixed(1)}% | PF: ${trackAPf.toFixed(2)}x | Exp: +${trackAExp.toFixed(2)}%`);

console.log('\n── FULL CHRONOLOGICAL TRADE AUDIT ────────────────────────────────────────────────');
for (const t of executedTrades) {
  const tag = t.isWin ? '✅ WIN ' : '❌ LOSS';
  console.log(
    `${t.date} -> ${t.entryDate} | ${t.symbol.padEnd(6)} | ${t.regime.padEnd(4)} | ${t.setupReason.padEnd(23)} | Ent: Rs.${String(t.entryPrice).padEnd(6)} -> Ext: Rs.${String(t.exitPrice).padEnd(6)} (${t.exitDate}, ${String(t.daysHeld + 'd').padEnd(3)}) | Net: ${(t.netReturnPct >= 0 ? '+' : '') + t.netReturnPct}% | ${tag} (${t.exitReason})`
  );
}

// Generate Markdown Artifact
const md = [];
md.push('# Adaptive Regime Flowchart v2.0 — 6-Month Back-Date Audit Report');
md.push('');
md.push(`**Generated At:** ${new Date().toISOString()}  `);
md.push(`**Scan Window:** ${testDates[0]} to ${testDates[testDates.length - 1]} (${testDates.length} NEPSE sessions; resolved through ${sortedDates[sortedDates.length - 1]})  `);
md.push(`**Execution Model:** Next-day Open entry (\`Day T+1\`), Pre-Open Gap Veto (\`+1.8%\`), CDSC \`T+2\` Demat Lock, \`+5.5%\` MFE Early Impulse Ratchet (\`+2.2%\` BE lock after Day 4/5), \`+7.5%\` Target 1 (50% scale-out + \`+2.5%\` trail), \`+15.0%\` Target 2, \`-3.5%\` Stop-Loss, \`15\`-session max hold, Rs. 200,000 sizing, 5-tier SEBON brokerage + 0.015% SEBON fee + Rs. 25 DP fee + 7.5% CGT.`);
md.push('');
md.push('---');
md.push('');
md.push('## 1. Executive Summary & Adaptive Win Rate');
md.push('');
md.push('| Metric | Adaptive Regime Flowchart v2.0 | Previous Legacy Baseline |');
md.push('| :--- | :--- | :--- |');
md.push(`| **Total Executed Trades** | **${count} trades** (${(count / 6).toFixed(1)} trades / month) | 16 trades (~2.5 trades / month) |`);
md.push(`| **Strict Net Win Rate %** *(after fees & 7.5% CGT)* | **${netWinRate.toFixed(1)}%** (${wins.length} Wins / ${losses.length} Losses) | 56.3% (9 Wins / 7 Losses) |`);
md.push(`| **Profit Factor** | **${profitFactor.toFixed(2)}x** | 1.00x |`);
md.push(`| **Net Expectancy per Trade** | **+${expectancy.toFixed(2)}% per trade** | +0.00% per trade |`);
md.push(`| **Average Win / Average Loss** | +${avgWin.toFixed(2)}% / -${avgLoss.toFixed(2)}% | +3.32% / -4.27% |`);
md.push(`| **Realized Risk-Reward (R:R)** | **${(avgWin / Math.max(0.01, avgLoss)).toFixed(2)} : 1** | 0.78 : 1 |`);
md.push(`| **Period Portfolio Return (20% sizing)** | **+${periodReturnPct.toFixed(2)}%** | -0.10% |`);
md.push('');
md.push('---');
md.push('');
md.push('## 2. Per-Track & Regime Performance Breakdown');
md.push('');
md.push('| Strategy Track | Regime Active | Trades | Wins / Losses | Net Win Rate % | Profit Factor | Net Expectancy |');
md.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: |');
md.push(`| **Track B: Post-T+2 Retest** | Bull + Chop Sniper | ${trackBTrades.length} | ${trackBWins.length}W / ${trackBTrades.length - trackBWins.length}L | **${trackBWr.toFixed(1)}%** | **${trackBPf.toFixed(2)}x** | **+${trackBExp.toFixed(2)}%** |`);
md.push(`| **Track A: Coiled Ignitions** | Bull Only (Muted in Chop) | ${trackATrades.length} | ${trackAWins.length}W / ${trackATrades.length - trackAWins.length}L | **${trackAWr.toFixed(1)}%** | **${trackAPf.toFixed(2)}x** | **+${trackAExp.toFixed(2)}%** |`);
md.push('');
md.push('---');
md.push('');
md.push('## 3. Chronological Trade-by-Trade Performance Audit');
md.push('');
md.push('| # | Symbol | Signal Date | Entry Date | Exit Date | Market Regime | Setup Archetype | Lead Broker | Entry (Rs.) | Exit (Rs.) | Peak Upside (MFE %) | Max Drawdown (MAE %) | Held | Net Return % | Outcome & Exit Trigger |');
md.push('| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');
executedTrades.forEach((t, idx) => {
  const tag = t.isWin ? `✅ WIN (${t.exitReason})` : `❌ LOSS (${t.exitReason})`;
  md.push(
    `| ${idx + 1} | **${t.symbol}** | ${t.date} | ${t.entryDate} | ${t.exitDate} | ${t.regime === 'BULL' ? '🟢 Bull' : '🔴 Chop'} | \`${t.setupReason}\` | #${t.leadBrokerId} | ${t.entryPrice} | ${t.exitPrice} | +${t.maxMfePct}% | ${t.maxMaePct}% | ${t.daysHeld}d | **${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct}%** | ${tag} |`
  );
});
md.push('');

const reportText = md.join('\n');
const outPath = path.join(process.cwd(), 'backtest', 'adaptiveRegimeV2Report.md');
fs.writeFileSync(outPath, reportText, 'utf8');
console.log(`\nAdaptive Regime report saved to ${outPath}`);
try {
  db.close();
} catch (_) {}
