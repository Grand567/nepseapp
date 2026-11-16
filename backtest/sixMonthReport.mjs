// backtest/sixMonthReport.mjs
/**
 * ============================================================================
 * DRABYASHREE NEPSE: 6-MONTH FLOWCHART v2.0 BACK-DATE TEST & WIN-RATE AUDIT
 * ============================================================================
 * Exhaustive point-in-time backtest across the 6-month NEPSE universe
 * (2026-05-15 to 2026-11-13) combining:
 *   - daily_stock_summary (OHLCV) from drabyashree_ledger.db
 *   - 6-month daily broker rollups from proxy/data/broker_alltime/*.json
 *   - Recent daily_broker_ledger from drabyashree_ledger.db
 *
 * Enforces:
 *   - Pure common equity & liquidity gates (LTP >= Rs. 100, Turnover >= 25L, Vol >= 8k)
 *   - 5-Day Demat Dump & Multi-Session Trap Vetoes (3-day dip, unabsorbed dump,
 *     past accumulator demat dump guard, active distribution, upper-wick rejection)
 *   - Multi-Window BCR3 & Wash-Churn Filters (10D & 5D retention >= 70%, BCR3 Buy >= 40%,
 *     BCR3 Sell < 35%, Operator VWAP proximity [-2.5%, +2.5%])
 *   - Candle Microstructure & Dual-Track Classification (evaluateLoopholeProtectedSmcSetup)
 *   - Honest Next-Day Open Execution, CDSC T+2 Lockout, +5.5% MFE Ratchet,
 *     +8% T1 (50% scale-out -> +2.5% trail), +15% T2, -3.5% Stop-Loss, 15-day Max Hold
 *   - Full NEPSE Statutory Frictions (tiered brokerage, SEBON, DP, 7.5% CGT)
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

// 1. Load daily OHLCV history
const rawRecords = db
  .prepare(
    `SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
     FROM daily_stock_summary
     WHERE COALESCE(is_quarantined, 0) = 0 AND close_price > 0
     ORDER BY trade_date ASC, symbol ASC`
  )
  .all();

const scripHistoryMap = new Map(); // symbol -> Array<candle>
const dateScripMap = new Map();    // date -> Map(symbol -> candle)
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

// 2. Load fundamentals for sector / instrument filtering
const sectorMap = new Map();
try {
  const fundRows = db.prepare('SELECT symbol, sector FROM scrip_fundamentals').all();
  for (const row of fundRows) {
    if (row.symbol) {
      sectorMap.set(String(row.symbol).toUpperCase().trim(), String(row.sector || ''));
    }
  }
} catch (_) {}

// 3. Load 6-month broker rollups from proxy/data/broker_alltime/*.json + daily_broker_ledger overlay
const scripBrokerByDate = new Map(); // sym -> Map(date -> Array<{brokerId, buyVol, sellVol, buyAmt, sellAmt}>)
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
for (const [key, arr] of dbGrouped.entries()) {
  const [sym, dt] = key.split('|');
  if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
  scripBrokerByDate.get(sym).set(dt, arr);
}

// Technical & Equity Filters
function isDisqualified(sym, ltp) {
  const sec = (sectorMap.get(sym) || '').toLowerCase();
  if (/debenture|mutual|promot|preferred|bond/i.test(sec)) return true;
  if (
    sym.endsWith('PO') ||
    (sym.endsWith('P') && sym !== 'NADEP') ||
    sym.includes('DEB') ||
    sym.startsWith('NMB50') ||
    sym.startsWith('ADBLD')
  ) {
    return true;
  }
  if (/^(KSY|C30MF|RMF|NBF|CMF|SBCF|SEF|SAEF|NICBF|NIBLPF|KDBY|LVF|PSF|RBBMF|H8020|MNMF|NSIF|SIGS|SFMF)/i.test(sym)) {
    return true;
  }
  if (/[A-Z]+\d$/.test(sym)) return true;
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (ltp > 0 && ltp < 100) return true;
  return false;
}

function calculateCMF(candles, period = 20) {
  if (!candles || candles.length < period) return 0;
  let sumMFV = 0;
  let sumVol = 0;
  for (const c of candles.slice(-period)) {
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
  return mean > 0 ? ((2 * std) / mean) * 100 : 20;
}

function aggregateBrokerWindow(sym, dateIdx, windowDays, ltp) {
  const windowDates = sortedDates.slice(Math.max(0, dateIdx - (windowDays - 1)), dateIdx + 1);
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return null;

  const brokerAgg = new Map();
  let totalBuy = 0;
  let totalSell = 0;
  let totalBuyAmt = 0;
  let sessionsWithData = 0;

  for (const dt of windowDates) {
    const rows = symMap.get(dt);
    if (!rows || rows.length === 0) continue;
    sessionsWithData++;
    for (const b of rows) {
      if (!brokerAgg.has(b.brokerId)) brokerAgg.set(b.brokerId, { buy: 0, sell: 0, buyAmt: 0 });
      const rec = brokerAgg.get(b.brokerId);
      rec.buy += b.buyVol;
      rec.sell += b.sellVol;
      rec.buyAmt += b.buyAmt;
      totalBuy += b.buyVol;
      totalSell += b.sellVol;
      totalBuyAmt += b.buyAmt;
    }
  }

  if (sessionsWithData === 0 || totalBuy <= 0) return null;

  const buyers = Array.from(brokerAgg.entries())
    .map(([id, d]) => ({
      brokerId: id,
      buy: d.buy,
      sell: d.sell,
      net: d.buy - d.sell,
      vwap: d.buy > 0 ? d.buyAmt / d.buy : ltp,
    }))
    .sort((a, b) => b.buy - a.buy);

  const sellers = Array.from(brokerAgg.entries())
    .map(([id, d]) => ({ brokerId: id, buy: d.buy, sell: d.sell }))
    .sort((a, b) => b.sell - a.sell);

  const top3BuyVol = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3NetVol = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const top3SellVol = sellers.slice(0, 3).reduce((s, b) => s + b.sell, 0);

  const bcr3Buy = totalBuy > 0 ? (top3BuyVol / totalBuy) * 100 : 0;
  const bcr3Sell = totalSell > 0 ? (top3SellVol / totalSell) * 100 : 0;
  const bcr3Spread = bcr3Buy - bcr3Sell;
  const netRetentionPct = top3BuyVol > 0 ? (top3NetVol / top3BuyVol) * 100 : 0;
  const washChurnPct = Math.max(0, 100 - netRetentionPct);
  const leadBroker = buyers[0];
  const operatorVwap = leadBroker?.vwap || (totalBuy > 0 ? totalBuyAmt / totalBuy : ltp);
  const vwapDiffPct = operatorVwap > 0 ? ((ltp - operatorVwap) / operatorVwap) * 100 : 0;

  return {
    totalBuy,
    totalSell,
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    bcr3Spread: +bcr3Spread.toFixed(1),
    netRetentionPct: +netRetentionPct.toFixed(1),
    washChurnPct: +washChurnPct.toFixed(1),
    operatorVwap: +operatorVwap.toFixed(1),
    vwapDiffPct: +vwapDiffPct.toFixed(2),
    leadBrokerId: leadBroker?.brokerId || null,
  };
}

/**
 * 5-Day Demat Dump & Multi-Session Trap Vetoes (point-in-time on Day T)
 */
function checkMultiSessionTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  // 1. Upper-Wick Distribution Rejection Veto
  if (upperWickRatio > 0.45 && chg1d > 1.0) {
    return { isTrap: true, reason: 'UPPER_WICK_DISTRIBUTION' };
  }

  // 2. 3-Day Dip Invalidation Veto (3 consecutive declining closes OR 3 consecutive red candles)
  if (hist.length >= 3) {
    const b0 = hist[hist.length - 1];
    const b1 = hist[hist.length - 2];
    const b2 = hist[hist.length - 3];
    const isConsecutiveDeclining = b0.close < b1.close && b1.close < b2.close;
    const isThreeRedCandles = b0.close < b0.open && b1.close < b1.open && b2.close < b2.open;
    if (isConsecutiveDeclining || isThreeRedCandles) {
      return { isTrap: true, reason: 'THREE_CONSECUTIVE_RED_DAYS' };
    }
  }

  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return { isTrap: true, reason: 'NO_BROKER_DATA' };

  // 3. Unabsorbed Massive Dump Veto across [T-1, T]
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

  // 4. Past Accumulator Demat Dump Guard (T-7..T-3 settled shares dumped >= 40% & >= 5,000 kitta on T-1 or T)
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

  // 5. Active Distribution Today Veto (10D lead buyer net-sold > 5,000 kitta on Day T)
  if (leadBrokerId != null) {
    const todayRows = symMap.get(sortedDates[dateIdx]) || [];
    const leadToday = todayRows.find((r) => r.brokerId === leadBrokerId);
    if (leadToday && leadToday.buyVol - leadToday.sellVol < -5000) {
      return { isTrap: true, reason: 'ACTIVE_DISTRIBUTION_TODAY' };
    }
  }

  return { isTrap: false, reason: 'CLEAN' };
}

function deduplicateSignals(signals, cooldownDays = COOLDOWN_SESSIONS) {
  const distinct = [];
  for (const sig of signals) {
    const dup = distinct.find(
      (d) => d.symbol === sig.symbol && Math.abs(d.dateIdx - sig.dateIdx) < cooldownDays
    );
    if (!dup) distinct.push(sig);
  }
  return distinct;
}

function simulateTradeExecution(sig) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) return null;
  const scripEntryDay = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!scripEntryDay) return null;

  const entryPrice = scripEntryDay.open || scripEntryDay.close;
  if (!entryPrice || entryPrice <= 0) return null;

  const totalQty = Math.max(10, Math.floor(CAPITAL_PER_TRADE_NPR / entryPrice));
  const initialStopLoss = +(entryPrice * 0.965).toFixed(1); // -3.5% stop
  const ratchetTrigger = +(entryPrice * 1.055).toFixed(1); // +5.5% MFE
  const ratchetLock = +(entryPrice * 1.022).toFixed(1);    // +2.2% statutory BE lock
  const target1 = +(entryPrice * 1.080).toFixed(1);        // +8.0% Target 1 (50% scale-out)
  const target2 = +(entryPrice * 1.150).toFixed(1);        // +15.0% Target 2 runner

  const history = scripHistoryMap.get(sig.symbol) || [];
  const forwardCandles = history.filter((h) => h.date >= entryDate).slice(0, HOLD_MAX_SESSIONS);
  if (forwardCandles.length < 3) return null;

  let exitPrice = forwardCandles[forwardCandles.length - 1].close;
  let exitDate = forwardCandles[forwardCandles.length - 1].date;
  let exitReason = 'TIME_EXIT';
  let target1Hit = false;
  let t1FillPrice = target1;
  let t1Day = 1;
  let ratchetArmed = false;
  let currentStopLoss = initialStopLoss;
  let daysHeld = forwardCandles.length;
  let peakPrice = entryPrice;
  let troughPrice = entryPrice;
  let exitedEarly = false;

  for (let dayIdx = 0; dayIdx < forwardCandles.length; dayIdx++) {
    const c = forwardCandles[dayIdx];
    if (c.high > peakPrice) peakPrice = c.high;
    if (c.low < troughPrice) troughPrice = c.low;
    const isDematLocked = dayIdx < 2; // CDSC T+2 Demat lock (no exits Day 0 / Day 1)

    if (!isDematLocked) {
      // 1. Check stop-loss FIRST (zero same-bar optimistic look-ahead)
      if (c.low <= currentStopLoss) {
        exitPrice = c.open <= currentStopLoss ? c.open : currentStopLoss;
        exitDate = c.date;
        exitReason = target1Hit
          ? 'T1_SPLIT_TRAIL'
          : ratchetArmed
            ? 'RATCHET_BE (+2.2%)'
            : 'STOP_LOSS (-3.5%)';
        daysHeld = dayIdx + 1;
        exitedEarly = true;
        break;
      }

      // 2. Check Target 2 (+15%)
      if (c.high >= target2) {
        exitPrice = Math.max(c.open, target2);
        exitDate = c.date;
        exitReason = target1Hit ? 'T1_SPLIT_T2 (+15%)' : 'TARGET_2 (+15%)';
        daysHeld = dayIdx + 1;
        exitedEarly = true;
        break;
      }

      // 3. Check Target 1 (+8.0% -> 50% scale-out, move remaining stop to +2.5% from NEXT session)
      if (!target1Hit && c.high >= target1) {
        target1Hit = true;
        t1FillPrice = Math.max(c.open, target1);
        t1Day = dayIdx + 1;
        currentStopLoss = Math.max(currentStopLoss, +(entryPrice * 1.025).toFixed(1));
        continue;
      }
    }

    // 4. Arm Early Impulse Ratchet (+5.5% MFE after session 5 -> +2.2% BE lock for subsequent bars)
    if (dayIdx >= 5 && c.high >= ratchetTrigger && !ratchetArmed && !target1Hit) {
      ratchetArmed = true;
      currentStopLoss = Math.max(currentStopLoss, ratchetLock);
    }
  }

  const truncated = !exitedEarly && forwardCandles.length < HOLD_MAX_SESSIONS;
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
    const totalBuyCost = leg1.totalBuyCost + leg2.totalBuyCost;
    const combinedNetProfit = leg1.netProfitNpr + leg2.netProfitNpr;
    netReturnPct = totalBuyCost > 0 ? (combinedNetProfit / totalBuyCost) * 100 : 0;
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
    daysHeld,
    entryPrice: +entryPrice.toFixed(1),
    exitPrice: +effectiveExit.toFixed(1),
    peakPrice: +peakPrice.toFixed(1),
    troughPrice: +troughPrice.toFixed(1),
    exitReason,
    truncated,
    maxMfePct,
    maxMaePct,
    grossReturnPct,
    netReturnPct: +netReturnPct.toFixed(2),
  };
}

function summarizeTrades(trades, label, spanDays) {
  const count = trades.length;
  const wins = trades.filter((t) => t.netReturnPct > 0);
  const losses = trades.filter((t) => t.netReturnPct <= 0);
  const grossWins = trades.filter((t) => t.grossReturnPct > 0);

  const netWinRate = count > 0 ? (wins.length / count) * 100 : 0;
  const grossWinRate = count > 0 ? (grossWins.length / count) * 100 : 0;
  const totalGains = wins.reduce((s, w) => s + w.netReturnPct, 0);
  const totalLosses = Math.abs(losses.reduce((s, l) => s + l.netReturnPct, 0));
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? Infinity : 0;
  const avgWinPct = wins.length > 0 ? totalGains / wins.length : 0;
  const avgLossPct = losses.length > 0 ? totalLosses / losses.length : 0;
  const realizedRRR = avgLossPct > 0 ? avgWinPct / avgLossPct : avgWinPct > 0 ? Infinity : 0;
  const expectancyPct = count > 0 ? trades.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

  let equity = 100000;
  for (const t of [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate))) {
    equity += equity * 0.2 * (t.netReturnPct / 100);
  }
  const periodReturnPct = ((equity - 100000) / 100000) * 100;
  const annualCagrPct = spanDays > 0 ? (Math.pow(equity / 100000, 250 / spanDays) - 1) * 100 : 0;

  return {
    label,
    count,
    wins: wins.length,
    losses: losses.length,
    netWinRate: +netWinRate.toFixed(1),
    grossWinRate: +grossWinRate.toFixed(1),
    avgWinPct: +avgWinPct.toFixed(2),
    avgLossPct: +avgLossPct.toFixed(2),
    realizedRRR: Number.isFinite(realizedRRR) ? +realizedRRR.toFixed(2) : 'INF',
    profitFactor: Number.isFinite(profitFactor) ? +profitFactor.toFixed(2) : 'INF',
    expectancyPct: +expectancyPct.toFixed(2),
    periodReturnPct: +periodReturnPct.toFixed(1),
    annualCagrPct: +Math.min(999, annualCagrPct).toFixed(1),
  };
}

// 4. Scan 6-month universe (leaving final 5 sessions for forward resolution)
const latestDbDate = sortedDates[sortedDates.length - 1];
const lastSignalDate = sortedDates[sortedDates.length - 6];
const testDates = sortedDates.filter((d) => d >= WINDOW_START && d <= lastSignalDate);

const rawSignals = [];
const vetoStats = {
  totalSymbolDays: 0,
  disqualifiedOrIlliquid: 0,
  shortHistory: 0,
  failedBrokerFilter: 0,
  vetoedTrap: 0,
  vetoReasons: {},
  failedPattern: 0,
  selected: 0,
};

const selectedUniverse = new Set();

for (const date of testDates) {
  const dateIdx = dateIndexMap.get(date);
  const scripsOnDate = dateScripMap.get(date);
  if (!scripsOnDate) continue;

  for (const [sym, c] of scripsOnDate.entries()) {
    vetoStats.totalSymbolDays++;
    const ltp = c.close;
    if (isDisqualified(sym, ltp) || c.turnover < 2500000 || c.volume < 8000) {
      vetoStats.disqualifiedOrIlliquid++;
      continue;
    }

    const fullHist = scripHistoryMap.get(sym);
    if (!fullHist) continue;
    // Slice up to date (zero look-ahead)
    const endIdx = fullHist.findIndex((h) => h.date === date);
    if (endIdx < 29) {
      vetoStats.shortHistory++;
      continue;
    }
    const hist = fullHist.slice(0, endIdx + 1);

    const closes = hist.map((h) => h.close);
    const volumes = hist.map((h) => h.volume);
    const prevClose = hist[hist.length - 2].close;
    const chg1d = ((ltp - prevClose) / prevClose) * 100;

    // 10D & 5D Broker Flow + Wash-Churn Filter
    const flow10 = aggregateBrokerWindow(sym, dateIdx, 10, ltp);
    const flow5 = aggregateBrokerWindow(sym, dateIdx, 5, ltp);
    if (
      !flow10 ||
      flow10.totalBuy < 10000 ||
      !flow5 ||
      flow10.bcr3Buy < 40.0 ||
      flow10.bcr3Sell >= 35.0 ||
      flow10.bcr3Buy <= flow10.bcr3Sell ||
      flow10.netRetentionPct < 70.0 ||
      flow5.netRetentionPct < 70.0 ||
      flow10.vwapDiffPct < -2.5 ||
      flow10.vwapDiffPct > 2.5
    ) {
      vetoStats.failedBrokerFilter++;
      continue;
    }

    // Candle microstructure metrics for signal day
    const dayRange = c.high - c.low;
    const upperWickRatio =
      dayRange > 0.001
        ? Number(Math.max(0, (c.high - Math.max(c.open, c.close)) / dayRange).toFixed(3))
        : 0;
    const clvPct =
      dayRange > 0.001
        ? Math.round(Math.max(0, Math.min(1, (c.close - c.low) / dayRange)) * 100)
        : chg1d > 0
          ? 100
          : chg1d < 0
            ? 0
            : 50;

    // 5-Day Demat Dump & Multi-Session Trap Vetoes
    const trap = checkMultiSessionTrapVetoes(
      sym,
      dateIdx,
      hist,
      chg1d,
      upperWickRatio,
      flow10.leadBrokerId
    );
    if (trap.isTrap) {
      vetoStats.vetoedTrap++;
      vetoStats.vetoReasons[trap.reason] = (vetoStats.vetoReasons[trap.reason] || 0) + 1;
      continue;
    }

    const last10Closes = closes.slice(-10);
    const min10 = Math.min(...last10Closes);
    const max10 = Math.max(...last10Closes);
    const spread10 = min10 > 0 ? ((max10 - min10) / min10) * 100 : 99;
    const bbw = calculateBBW(closes, 20);
    const cmf = calculateCMF(hist, 20);
    const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    const vduMin5 = avgVol20 > 0 ? Math.min(...volumes.slice(-6, -1)) / avgVol20 : 1;
    const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;

    const smc = evaluateLoopholeProtectedSmcSetup(hist.slice(-55), {
      ltp,
      ema20: sma20,
      avgBrokerPrice: flow10.operatorVwap,
      bcr3Buy: flow10.bcr3Buy,
      bcr3Sell: flow10.bcr3Sell,
      leadRetentionPct: flow10.netRetentionPct,
      isTrap: false,
    });

    const isStealth =
      chg1d >= -1.2 &&
      chg1d <= 2.0 &&
      spread10 <= 6.5 &&
      bbw <= 14.0 &&
      vduToday <= 0.60 &&
      cmf >= 0.08;

    const isHighConvictionSmcCoil =
      spread10 <= 6.8 &&
      bbw <= 12.5 &&
      vduMin5 <= 0.50 &&
      cmf >= 0.12 &&
      chg1d >= 0.2 &&
      chg1d <= 2.5 &&
      ltp >= sma20 &&
      flow10.bcr3Buy >= 45.0 &&
      flow10.bcr3Sell <= 30.0 &&
      flow10.netRetentionPct >= 78.0 &&
      (smc.isBreakAndRetest ||
        smc.isSmcSweepMss ||
        smc.isFvgMitigated ||
        smc.isT2ClearedContinuation ||
        (vduToday >= 0.80 && vduToday <= 1.50));

    if (!isStealth && !isHighConvictionSmcCoil) {
      vetoStats.failedPattern++;
      continue;
    }

    const dualTrack =
      smc.isT2ClearedContinuation || smc.isBreakAndRetest
        ? 'Track B: Post-T+2 Cleared Continuation'
        : 'Track A: Coiled 2-3D Ignition';

    let subTrack = 'STEALTH_FLOOR';
    if (smc.isBreakAndRetest) subTrack = 'SMC_BREAK_AND_RETEST';
    else if (smc.isT2ClearedContinuation) subTrack = 'T2_CLEARED_CONTINUATION';
    else if (smc.isSmcSweepMss || smc.isFvgMitigated) subTrack = 'SMC_SWEEP_MSS_FVG';
    else if (isHighConvictionSmcCoil && !isStealth) subTrack = 'COIL_IGNITION';

    const minRet = Math.min(flow10.netRetentionPct, flow5.netRetentionPct);
    const washChurnPct = +(100 - minRet).toFixed(1);

    vetoStats.selected++;
    selectedUniverse.add(sym);

    rawSignals.push({
      date,
      dateIdx,
      symbol: sym,
      dualTrack,
      subTrack,
      ltp: +ltp.toFixed(1),
      bcr3Buy: flow10.bcr3Buy,
      bcr3Sell: flow10.bcr3Sell,
      bcr3Spread: flow10.bcr3Spread,
      ret10D: flow10.netRetentionPct,
      ret5D: flow5.netRetentionPct,
      washChurnPct,
      clvPct,
      leadBrokerId: flow10.leadBrokerId,
      smcNarrative: smc.smcNarrative,
    });
  }
}

const dedupedSignals = deduplicateSignals(rawSignals, COOLDOWN_SESSIONS);
const allTrades = dedupedSignals.map((s) => simulateTradeExecution(s)).filter(Boolean);
const closedTradesOnly = allTrades.filter((t) => !t.truncated);

const overallSummary = summarizeTrades(
  allTrades,
  `Flowchart v2.0 Full 6-Month Backtest (${testDates[0]} to ${latestDbDate})`,
  testDates.length
);
const closedOnlySummary = summarizeTrades(
  closedTradesOnly,
  `Flowchart v2.0 Closed Trades Only (excl. open at data end)`,
  testDates.length
);

// Per Dual-Track & Sub-Track Breakdown
const dualTrackRows = [
  'Track B: Post-T+2 Cleared Continuation',
  'Track A: Coiled 2-3D Ignition',
].map((dt) => summarizeTrades(allTrades.filter((t) => t.dualTrack === dt), dt, testDates.length));

const subTrackKeys = [
  'STEALTH_FLOOR',
  'SMC_BREAK_AND_RETEST',
  'T2_CLEARED_CONTINUATION',
  'SMC_SWEEP_MSS_FVG',
  'COIL_IGNITION',
];
const subTrackRows = subTrackKeys.map((k) =>
  summarizeTrades(allTrades.filter((t) => t.subTrack === k), k, testDates.length)
);

// Print Console Audit Summary
console.log('\n══════════════════════════════════════════════════════════════════════════════════');
console.log('📊 DRABYASHREE FLOWCHART v2.0 — 6-MONTH BACK-DATE TEST & WIN-RATE AUDIT');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log(`Test Horizon  : ${testDates[0]} → ${lastSignalDate} (${testDates.length} signal sessions; resolved through ${latestDbDate})`);
console.log(`Scrips Covered: ${scripBrokerByDate.size} symbols with 6M broker ledger + OHLCV | Selected Symbols: ${selectedUniverse.size}`);
console.log(`Raw Signals   : ${rawSignals.length} | Deduplicated (5-session cooldown): ${dedupedSignals.length} | Executed Trades: ${allTrades.length}`);
console.log(`\n▶ ${overallSummary.label}`);
console.log(`  Trades: ${overallSummary.count} (${overallSummary.wins}W / ${overallSummary.losses}L) | Strict Net Win Rate: ${overallSummary.netWinRate}% | Gross Win Rate: ${overallSummary.grossWinRate}%`);
console.log(`  Avg Win: +${overallSummary.avgWinPct}% | Avg Loss: -${overallSummary.avgLossPct}% | Realized R:R: ${overallSummary.realizedRRR}:1 | Profit Factor: ${overallSummary.profitFactor}x | Expectancy: ${overallSummary.expectancyPct >= 0 ? '+' : ''}${overallSummary.expectancyPct}%/trade`);
if (closedTradesOnly.length !== allTrades.length) {
  console.log(`\n▶ Closed-Only Subset (N=${closedOnlySummary.count}): Strict Net Win Rate ${closedOnlySummary.netWinRate}% | Gross ${closedOnlySummary.grossWinRate}% | PF ${closedOnlySummary.profitFactor}x | Exp ${closedOnlySummary.expectancyPct >= 0 ? '+' : ''}${closedOnlySummary.expectancyPct}%`);
}

console.log('\n── DUAL-TRACK WIN-RATE BREAKDOWN ─────────────────────────────────────────────────');
for (const r of dualTrackRows) {
  console.log(`• ${r.label.padEnd(38)} | Trades: ${String(r.count).padEnd(3)} (${r.wins}W/${r.losses}L) | Net WR: ${String(r.netWinRate + '%').padEnd(6)} | Gross: ${String(r.grossWinRate + '%').padEnd(6)} | PF: ${r.profitFactor}x | Exp: ${r.expectancyPct >= 0 ? '+' : ''}${r.expectancyPct}%`);
}

console.log('\n── SUB-TRACK ARCHETYPE BREAKDOWN ─────────────────────────────────────────────────');
for (const r of subTrackRows) {
  if (r.count === 0) {
    console.log(`• ${r.label.padEnd(25)} | Trades: 0`);
  } else {
    console.log(`• ${r.label.padEnd(25)} | Trades: ${String(r.count).padEnd(3)} (${r.wins}W/${r.losses}L) | Net WR: ${String(r.netWinRate + '%').padEnd(6)} | Gross: ${String(r.grossWinRate + '%').padEnd(6)} | PF: ${r.profitFactor}x | Exp: ${r.expectancyPct >= 0 ? '+' : ''}${r.expectancyPct}%`);
  }
}

console.log('\n── FULL CHRONOLOGICAL TRADE AUDIT ────────────────────────────────────────────────');
for (const t of allTrades) {
  const tag = t.netReturnPct > 0 ? '✅ WIN ' : '❌ LOSS';
  console.log(
    `${t.signalDate || t.date} -> ${t.entryDate} | ${t.symbol.padEnd(6)} | ${t.subTrack.padEnd(23)} | Ent: Rs.${String(t.entryPrice).padEnd(6)} -> Ext: Rs.${String(t.exitPrice).padEnd(6)} (${t.exitDate}, ${String(t.daysHeld + 'd').padEnd(3)}) | Net: ${(t.netReturnPct >= 0 ? '+' : '') + t.netReturnPct}% | ${tag} (${t.exitReason})`
  );
}

// 5. Generate backtest/sixMonthReport.md
const md = [];
md.push(`# Drabyashree NEPSE — 6-Month Flowchart v2.0 Back-Date Test Report`);
md.push('');
md.push(`**Generated At:** ${new Date().toISOString()}  `);
md.push(`**Signal Scan Window:** ${testDates[0]} to ${lastSignalDate} (${testDates.length} NEPSE trading sessions)  `);
md.push(`**Price Resolution Horizon:** ${testDates[0]} to ${latestDbDate} (${sortedDates.filter((d) => d >= WINDOW_START).length} sessions across ${scripHistoryMap.size} scrips)  `);
md.push(`**Execution & Cost Model:** Next-day Open entry (\`Day T+1\`), CDSC \`T+2\` Demat lock, \`+5.5%\` MFE Early Impulse Ratchet (\`+2.2%\` BE lock after Day 5), \`+8.0%\` T1 (50% scale-out + \`+2.5%\` trail), \`+15.0%\` T2, \`-3.5%\` Stop-Loss, \`15\`-session max hold, Rs. 2,00,000 position sizing, 5-tier SEBON brokerage + 0.015% SEBON fee + Rs. 25 DP fee + 7.5% CGT.`);
md.push('');
md.push('---');
md.push('');
md.push('## 1. Executive Summary & Overall Win Rate');
md.push('');
md.push('| Metric | All Executed Trades | Closed-Only Subset |');
md.push('| :--- | :--- | :--- |');
md.push(`| **Total Trades** | **${overallSummary.count}** (${overallSummary.wins} Wins / ${overallSummary.losses} Losses) | **${closedOnlySummary.count}** (${closedOnlySummary.wins} Wins / ${closedOnlySummary.losses} Losses) |`);
md.push(`| **Strict Net Win Rate %** *(after all fees + 7.5% CGT)* | **${overallSummary.netWinRate}%** | **${closedOnlySummary.netWinRate}%** |`);
md.push(`| **Gross Win Rate %** *(before frictions)* | **${overallSummary.grossWinRate}%** | **${closedOnlySummary.grossWinRate}%** |`);
md.push(`| **Average Win / Average Loss (Net)** | +${overallSummary.avgWinPct}% / -${overallSummary.avgLossPct}% | +${closedOnlySummary.avgWinPct}% / -${closedOnlySummary.avgLossPct}% |`);
md.push(`| **Realized Risk-Reward Ratio (R:R)** | **${overallSummary.realizedRRR} : 1** | **${closedOnlySummary.realizedRRR} : 1** |`);
md.push(`| **Profit Factor** | **${overallSummary.profitFactor}x** | **${closedOnlySummary.profitFactor}x** |`);
md.push(`| **Net Expectancy per Trade** | **${overallSummary.expectancyPct >= 0 ? '+' : ''}${overallSummary.expectancyPct}%** | **${closedOnlySummary.expectancyPct >= 0 ? '+' : ''}${closedOnlySummary.expectancyPct}%** |`);
md.push(`| **Simulated 6M Return** *(20% portfolio allocation/trade)* | **${overallSummary.periodReturnPct >= 0 ? '+' : ''}${overallSummary.periodReturnPct}%** (~${overallSummary.annualCagrPct}% annualized) | **${closedOnlySummary.periodReturnPct >= 0 ? '+' : ''}${closedOnlySummary.periodReturnPct}%** |`);
md.push('');
md.push(`- **Unique Stocks Selected:** ${selectedUniverse.size} stocks (${Array.from(selectedUniverse).sort().join(', ')})`);
md.push(`- **Deduplication:** ${rawSignals.length} raw signal-days reduced to ${dedupedSignals.length} non-overlapping trades using a ${COOLDOWN_SESSIONS}-session per-symbol cooldown (${allTrades.length} entered with valid next-session opens).`);
md.push('');
md.push('---');
md.push('');
md.push('## 2. Per-Track Win Rate Breakdown');
md.push('');
md.push('### Dual-Track Horizon Performance');
md.push('| Dual-Track Tier | Trades | Wins / Losses | Strict Net Win Rate % | Gross Win Rate % | Profit Factor | Net Expectancy / Trade |');
md.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
for (const r of dualTrackRows) {
  md.push(`| **${r.label}** | ${r.count} | ${r.wins}W / ${r.losses}L | **${r.netWinRate}%** | ${r.grossWinRate}% | ${r.profitFactor}x | ${r.expectancyPct >= 0 ? '+' : ''}${r.expectancyPct}% |`);
}
md.push('');
md.push('### Sub-Track Microstructure Archetype Performance');
md.push('| Sub-Track Archetype | Trades | Wins / Losses | Strict Net Win Rate % | Gross Win Rate % | Profit Factor | Net Expectancy / Trade |');
md.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
for (const r of subTrackRows) {
  md.push(`| \`${r.label}\` | ${r.count} | ${r.wins}W / ${r.losses}L | **${r.netWinRate}%** | ${r.grossWinRate}% | ${r.profitFactor}x | ${r.expectancyPct >= 0 ? '+' : ''}${r.expectancyPct}% |`);
}
md.push('');
md.push('---');
md.push('');
md.push('## 3. Funnel & Trap-Veto Audit Summary');
md.push('');
md.push(`- **Total Symbol-Days Evaluated:** ${vetoStats.totalSymbolDays.toLocaleString()}`);
md.push(`- **Excluded (Non-Equities / LTP < Rs. 100 / Turnover < Rs. 25L / Vol < 8,000):** ${vetoStats.disqualifiedOrIlliquid.toLocaleString()}`);
md.push(`- **Insufficient Pre-Signal History (< 30 sessions):** ${vetoStats.shortHistory.toLocaleString()}`);
md.push(`- **Rejected by Multi-Window BCR3 & Wash-Churn Filters:** ${vetoStats.failedBrokerFilter.toLocaleString()}`);
md.push(`- **Vetoed by 5-Day Demat Dump & Multi-Session Trap Guards:** ${vetoStats.vetoedTrap.toLocaleString()}`);
for (const [reason, cnt] of Object.entries(vetoStats.vetoReasons).sort((a, b) => b[1] - a[1])) {
  md.push(`  - \`${reason}\`: ${cnt}`);
}
md.push(`- **Rejected by Candle Squeeze / SMC / VDU / CMF Microstructure Filters:** ${vetoStats.failedPattern.toLocaleString()}`);
md.push(`- **Qualified Flowchart v2.0 Signal-Days:** ${vetoStats.selected} (${dedupedSignals.length} after ${COOLDOWN_SESSIONS}-day cooldown)`);
md.push('');
md.push('---');
md.push('');
md.push('## 4. Complete 6-Month Selected Stocks & Trade-by-Trade Audit');
md.push('');
md.push('| # | Symbol | Signal Date | Entry Date | Exit Date | Dual-Track / Sub-Track | Lead Broker | BCR3 Buy / Sell (Spread) | 10D/5D Ret % (Churn) | CLV % | Entry (Rs.) | Exit (Rs.) | MFE % (Peak) | MAE % (Trough) | Held | Gross % | Net % | Outcome |');
md.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
allTrades.forEach((t, idx) => {
  const trackCell = `${t.dualTrack.startsWith('Track B') ? 'Track B' : 'Track A'} (${t.subTrack})`;
  const bcrCell = `${t.bcr3Buy}% / ${t.bcr3Sell}% (${t.bcr3Spread >= 0 ? '+' : ''}${t.bcr3Spread}%)`;
  const retCell = `${t.ret10D}% / ${t.ret5D}% (${t.washChurnPct}%)`;
  const outcome = t.netReturnPct > 0 ? `✅ WIN (${t.exitReason})` : `❌ LOSS (${t.exitReason})`;
  const mfeCell = `${t.maxMfePct >= 0 ? '+' : ''}${t.maxMfePct}% (Rs. ${t.peakPrice})`;
  const maeCell = `${t.maxMaePct}% (Rs. ${t.troughPrice})`;
  md.push(
    `| ${idx + 1} | **${t.symbol}** | ${t.date} | ${t.entryDate} | ${t.exitDate} | ${trackCell} | #${t.leadBrokerId ?? 'N/A'} | ${bcrCell} | ${retCell} | ${t.clvPct}% | ${t.entryPrice.toFixed(1)} | ${t.exitPrice.toFixed(1)} | ${mfeCell} | ${maeCell} | ${t.daysHeld}d | ${t.grossReturnPct >= 0 ? '+' : ''}${t.grossReturnPct.toFixed(2)}% | **${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct.toFixed(2)}%** | ${outcome} |`
  );
});
md.push('');

const reportText = md.join('\n');
const reportPath = path.join(process.cwd(), 'backtest', 'sixMonthReport.md');
fs.writeFileSync(reportPath, reportText, 'utf8');
console.log(`\nReport written to ${reportPath}`);

// 6. Generate backtest/universeScanReport.md from the Flowchart v2.0 selections
const scanMd = [];
scanMd.push('# NEPSE Universe Scan & Stock Selection (Flowchart v2.0 Engine)');
scanMd.push('');
scanMd.push(`**Generated At:** ${new Date().toISOString()}  `);
scanMd.push(`**Window Scanned:** ${testDates[0]} to ${lastSignalDate} (${testDates.length} sessions, resolved through ${latestDbDate})  `);
scanMd.push(`**Total Unique Stocks Selected:** ${selectedUniverse.size} (${allTrades.length} deduplicated trades, **${overallSummary.netWinRate}% Strict Net Win Rate**)`);
scanMd.push('');
scanMd.push('| Symbol | Trades | Wins | Net Win Rate % | Avg Net % | Signal Dates | Dual-Track Archetypes |');
scanMd.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
for (const sym of Array.from(selectedUniverse).sort()) {
  const symTrades = allTrades.filter((t) => t.symbol === sym);
  if (symTrades.length === 0) continue;
  const symWins = symTrades.filter((t) => t.netReturnPct > 0).length;
  const symWr = ((symWins / symTrades.length) * 100).toFixed(1);
  const avgNet = (symTrades.reduce((s, t) => s + t.netReturnPct, 0) / symTrades.length).toFixed(2);
  const sigDates = symTrades.map((t) => t.date).join(', ');
  const tracks = Array.from(new Set(symTrades.map((t) => t.subTrack))).join(', ');
  scanMd.push(
    `| **${sym}** | ${symTrades.length} | ${symWins} | **${symWr}%** | ${Number(avgNet) >= 0 ? '+' : ''}${avgNet}% | ${sigDates} | ${tracks} |`
  );
}
scanMd.push('');
const scanPath = path.join(process.cwd(), 'backtest', 'universeScanReport.md');
fs.writeFileSync(scanPath, scanMd.join('\n'), 'utf8');
console.log(`Universe scan report written to ${scanPath}`);
