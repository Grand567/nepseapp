// scripts/test_float_pct_enhancement.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';
import { evaluateLoopholeProtectedSmcSetup } from '../proxy/telegramNotifier.mjs';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Load fundamentals
const fundRows = db.prepare('SELECT symbol, sector, public_float_kitta, paid_up_capital FROM scrip_fundamentals').all();
const fundMap = new Map();
for (const f of fundRows) {
  fundMap.set(f.symbol, {
    sector: f.sector || 'Equities',
    floatKitta: Number(f.public_float_kitta || 0),
    paidUp: Number(f.paid_up_capital || 0),
  });
}

function getEstimatedPublicFloat(sym, sector = 'Equities') {
  const f = fundMap.get(sym);
  if (f && f.floatKitta > 0) return f.floatKitta;
  if (f && f.paidUp > 0) {
    const estKitta = f.paidUp / 100;
    if (sector === 'Commercial Banks') return estKitta * 0.30;
    if (sector === 'Hydro Power' || sector === 'Hydropower') return estKitta * 0.20;
    if (sector === 'Finance' || sector === 'Development Bank Limited') return estKitta * 0.40;
    if (sector === 'Microfinance') return estKitta * 0.35;
    return estKitta * 0.25;
  }
  if (sector === 'Commercial Banks') return 25000000;
  if (sector === 'Hydro Power' || sector === 'Hydropower') return 6000000;
  if (sector === 'Finance' || sector === 'Development Bank Limited') return 4500000;
  if (sector === 'Microfinance') return 1500000;
  return 5000000;
}

// Load daily_stock_summary
const rawRows = db.prepare(`
  SELECT symbol, trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDatesSet = new Set();
for (const r of rawRows) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  const bar = {
    date: r.trade_date,
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0),
  };
  scripHistoryMap.get(sym).push(bar);
  if (!dateScripMap.has(r.trade_date)) dateScripMap.set(r.trade_date, new Map());
  dateScripMap.get(r.trade_date).set(sym, bar);
  allDatesSet.add(r.trade_date);
}

const sortedDates = Array.from(allDatesSet).sort();
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// Market SMA
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

// Load broker rollups
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
        if (dt < '2026-04-15') continue;
        const arr = [];
        for (const [bId, vals] of Object.entries(brokersObj)) {
          const bv = Number(vals[0] || 0);
          const sv = Number(vals[1] || 0);
          if (bv > 0 || sv > 0) {
            arr.push({ brokerId: Number(bId), buyVol: bv, sellVol: sv, buyAmt: Number(vals[2]||0), sellAmt: Number(vals[3]||0) });
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

  const bcr3Buy = totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0;
  const bcr3Sell = totalSell > 0 ? (top3Sell / totalSell) * 100 : 0;
  const netRetention = top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0;
  const leadBroker = buyers[0];
  const total5Net = buyers.filter(x => x.net > 0).reduce((s, x) => s + x.net, 0);

  return {
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    bcr3Spread: +(bcr3Buy - bcr3Sell).toFixed(1),
    netRetention: +netRetention.toFixed(1),
    leadBrokerId: leadBroker?.brokerId ?? null,
    leadNetKitta: leadBroker?.net ?? 0,
    totalNetKitta: total5Net,
  };
}

function checkTrapVetoes(sym, dateIdx, hist, chg1d, upperWickRatio, leadBrokerId) {
  if (upperWickRatio > 0.42 && chg1d > 1.0) return { isTrap: true, reason: 'UPPER_WICK_DISTRIBUTION' };
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return { isTrap: false, reason: 'CLEAN' };

  // Past accumulator dump
  const priorAccMap = new Map();
  const priorStart = Math.max(0, dateIdx - 5);
  for (let k = priorStart; k <= Math.max(0, dateIdx - 2); k++) {
    const rows = symMap.get(sortedDates[k]) || [];
    for (const r of rows) {
      priorAccMap.set(r.brokerId, (priorAccMap.get(r.brokerId) || 0) + (r.buyVol - r.sellVol));
    }
  }
  const topPriorAcc = Array.from(priorAccMap.entries()).map(([brokerId, netAcc]) => ({ brokerId, netAcc })).filter(x => x.netAcc >= 5000).sort((a, b) => b.netAcc - a.netAcc)[0];
  if (topPriorAcc) {
    const rowsT1 = dateIdx - 1 >= 0 ? symMap.get(sortedDates[dateIdx - 1]) || [] : [];
    const rowsT0 = symMap.get(sortedDates[dateIdx]) || [];
    const fT1 = rowsT1.find(r => r.brokerId === topPriorAcc.brokerId);
    const fT0 = rowsT0.find(r => r.brokerId === topPriorAcc.brokerId);
    const netSellT1 = fT1 ? fT1.sellVol - fT1.buyVol : 0;
    const netSellT0 = fT0 ? fT0.sellVol - fT0.buyVol : 0;
    const dumpThreshold = Math.max(5000, topPriorAcc.netAcc * 0.4);
    if (netSellT1 >= dumpThreshold || netSellT0 >= dumpThreshold || (netSellT1 + netSellT0) >= dumpThreshold) {
      return { isTrap: true, reason: 'PAST_ACCUMULATOR_DEMAT_DUMP' };
    }
  }

  // Active distribution today
  if (leadBrokerId != null) {
    const todayRows = symMap.get(sortedDates[dateIdx]) || [];
    const leadToday = todayRows.find(r => r.brokerId === leadBrokerId);
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

function simulateTrade(sig) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) return null;
  const entryCandle = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!entryCandle) return null;
  const entryPrice = entryCandle.open || entryCandle.close;
  if (!entryPrice || entryPrice <= 0) return null;
  if (entryPrice > sig.ltp * 1.018) return { skipped: 'PREOPEN_GAP_VETO' };

  const totalQty = Math.max(10, Math.floor(200000 / entryPrice));
  const initialStop = +(entryPrice * 0.965).toFixed(1);
  const ratchetTrigger = +(entryPrice * 1.055).toFixed(1);
  const ratchetLock = +(entryPrice * 1.022).toFixed(1);
  const target1 = +(entryPrice * 1.075).toFixed(1);
  const target2 = +(entryPrice * 1.150).toFixed(1);

  const forward = (scripHistoryMap.get(sig.symbol) || []).filter(h => h.date >= entryDate).slice(0, 15);
  if (forward.length < 3) return null;

  let exitPrice = forward[forward.length - 1].close;
  let exitDate = forward[forward.length - 1].date;
  let exitReason = 'TIME_EXIT';
  let target1Hit = false;
  let currentStop = initialStop;
  let daysHeld = forward.length;
  let exitedEarly = false;
  let peakPrice = entryPrice;
  let troughPrice = entryPrice;

  for (let d = 0; d < forward.length; d++) {
    const bar = forward[d];
    if (bar.high > peakPrice) peakPrice = bar.high;
    if (bar.low < troughPrice) troughPrice = bar.low;

    if (bar.high >= ratchetTrigger && currentStop < ratchetLock && d >= 3) {
      currentStop = ratchetLock;
    }
    if (!target1Hit && bar.high >= target1 && d >= 2) {
      target1Hit = true;
      currentStop = Math.max(currentStop, +(entryPrice * 1.045).toFixed(1));
    }
    if (target1Hit && bar.high >= target2 && d >= 2) {
      exitPrice = target2; exitDate = bar.date; exitReason = 'T2_TARGET'; daysHeld = d + 1; exitedEarly = true; break;
    }
    if (bar.low <= currentStop && d >= 2) {
      exitPrice = currentStop; exitDate = bar.date; exitReason = currentStop > entryPrice ? 'RATCHET_BE' : 'STOP_LOSS'; daysHeld = d + 1; exitedEarly = true; break;
    }
  }

  let netReturnPct;
  let effectiveExit;
  if (target1Hit && !exitedEarly) exitReason = 'T1_SPLIT_TIME';

  if (target1Hit) {
    const qty1 = Math.floor(totalQty / 2);
    const qty2 = totalQty - qty1;
    const leg1 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: target1, quantity: qty1, holdingDays: 5 });
    const leg2 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: qty2, holdingDays: Math.max(2, Math.round(daysHeld * 1.4)) });
    const totalCost = leg1.totalBuyCost + leg2.totalBuyCost;
    netReturnPct = totalCost > 0 ? ((leg1.netProfitNpr + leg2.netProfitNpr) / totalCost) * 100 : 0;
    effectiveExit = (target1 * qty1 + exitPrice * qty2) / totalQty;
  } else {
    const calc = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: totalQty, holdingDays: Math.max(2, Math.round(daysHeld * 1.4)) });
    netReturnPct = calc.netReturnPct;
    effectiveExit = exitPrice;
  }

  return {
    ...sig,
    entryDate, exitDate,
    entryPrice: +entryPrice.toFixed(1),
    exitPrice: +effectiveExit.toFixed(1),
    peakPrice: +peakPrice.toFixed(1),
    troughPrice: +troughPrice.toFixed(1),
    daysHeld, exitReason,
    netReturnPct: +netReturnPct.toFixed(2),
    isWin: netReturnPct > 0,
  };
}

// Function to run backtest with different Float % thresholds
function runGrid(label, opts = {}) {
  const minLeadFloatPct = opts.minLeadFloatPct || 0; // e.g. 0.25%
  const minTotalFloatPct = opts.minTotalFloatPct || 0; // e.g. 1.0%

  const rawSignals = [];
  const testDates = sortedDates.filter(d => d >= '2026-05-15' && d <= '2026-11-02');

  for (let i = 0; i < testDates.length; i++) {
    const dt = testDates[i];
    const dateIdx = dateIndexMap.get(dt);
    const isBullRegime = marketCloses[dateIdx] >= marketSma20[dateIdx];

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

      const trap = checkTrapVetoes(sym, dateIdx, history.slice(0, p + 1), chg1d, upperWickRatio, flow10.leadBrokerId);
      if (trap.isTrap) continue;

      const fund = fundMap.get(sym);
      const floatShares = getEstimatedPublicFloat(sym, fund?.sector);
      const leadFloatPct = floatShares > 0 ? (flow5.leadNetKitta / floatShares) * 100 : 0;
      const totalFloatPct = floatShares > 0 ? (flow5.totalNetKitta / floatShares) * 100 : 0;

      // Float Cornering Thresholds
      if (minLeadFloatPct > 0 && leadFloatPct < minLeadFloatPct) continue;
      if (minTotalFloatPct > 0 && totalFloatPct < minTotalFloatPct) continue;

      const closes = history.slice(0, p + 1).map(x => x.close);
      const c10 = closes.slice(-10);
      const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
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
        if ((smc.isBreakAndRetest || smc.isT2ClearedContinuation) && spread10 <= 10.5 && vduToday <= 0.78 && flow10.bcr3Buy >= 38.0 && flow10.bcr3Sell <= 35.0 && flow10.netRetention >= 68.0) {
          qualifiedTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
          setupReason = smc.isBreakAndRetest ? 'SMC_BREAK_AND_RETEST' : 'T2_CLEARED_CONTINUATION';
        } else if (spread10 <= 7.0 && bbw <= 13.5 && vduToday <= 0.60 && cmf >= 0.08 && chg1d >= -1.2 && chg1d <= 2.0 && flow10.bcr3Buy >= 40.0 && flow10.bcr3Sell <= 32.0 && flow10.netRetention >= 72.0) {
          qualifiedTrack = 'TRACK_A_COILED_2_3D_IGNITION';
          setupReason = smc.isSmcSweepMss ? 'SMC_SWEEP_MSS_FVG' : 'STEALTH_FLOOR';
        }
      } else {
        if (smc.isBreakAndRetest && spread10 <= 8.5 && vduToday <= 0.70 && flow10.bcr3Buy >= 42.0 && flow10.bcr3Sell <= 30.0 && flow10.netRetention >= 78.0) {
          qualifiedTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
          setupReason = 'SNIPER_BREAK_AND_RETEST';
        }
      }

      if (qualifiedTrack) {
        const score = (flow10.bcr3Buy - flow10.bcr3Sell) * 1.2 + flow10.netRetention * 0.4 + (totalFloatPct * 5) - spread10 * 1.5;
        rawSignals.push({
          date: dt,
          dateIdx,
          symbol: sym,
          ltp: c.close,
          qualifiedTrack,
          setupReason,
          score,
          regime: isBullRegime ? 'BULL' : 'CHOP',
          leadBrokerId: flow10.leadBrokerId,
          leadFloatPct,
          totalFloatPct,
        });
      }
    }
  }

  // Deduplicate: max 1 pick per date, 5-day cooldown
  const dedupedSignals = [];
  const symbolCooldown = new Map();
  const byDate = new Map();
  for (const s of rawSignals) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  for (const [dt, sigs] of byDate.entries()) {
    sigs.sort((a, b) => b.score - a.score);
    for (const top of sigs) {
      const lastTrigger = symbolCooldown.get(top.symbol);
      if (lastTrigger != null && top.dateIdx - lastTrigger < 5) continue;
      symbolCooldown.set(top.symbol, top.dateIdx);
      dedupedSignals.push(top);
      break;
    }
  }

  const executedTrades = [];
  for (const sig of dedupedSignals) {
    const res = simulateTrade(sig);
    if (res && !res.skipped) executedTrades.push(res);
  }

  const wins = executedTrades.filter(t => t.isWin);
  const losses = executedTrades.filter(t => !t.isWin);
  const netWinRate = executedTrades.length > 0 ? (wins.length / executedTrades.length) * 100 : 0;
  const totalNetGains = wins.reduce((s, t) => s + t.netReturnPct, 0);
  const totalNetLosses = Math.abs(losses.reduce((s, t) => s + t.netReturnPct, 0));
  const profitFactor = totalNetLosses > 0 ? totalNetGains / totalNetLosses : 99;
  const netExpectancy = executedTrades.reduce((s, t) => s + t.netReturnPct, 0) / Math.max(1, executedTrades.length);

  const trackBTrades = executedTrades.filter(t => t.qualifiedTrack === 'TRACK_B_T2_CLEARED_CONTINUATION');
  const trackBWins = trackBTrades.filter(t => t.isWin);
  const trackBWR = trackBTrades.length > 0 ? (trackBWins.length / trackBTrades.length) * 100 : 0;

  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  console.log(`CONFIG: ${label}`);
  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  console.log(`Executed Trades : ${executedTrades.length} (${(executedTrades.length / (111/22)).toFixed(1)} / month)`);
  console.log(`Strict Net WR   : ${netWinRate.toFixed(1)}% (${wins.length}W / ${losses.length}L)`);
  console.log(`Profit Factor   : ${profitFactor.toFixed(2)}x`);
  console.log(`Net Expectancy  : ${netExpectancy >= 0 ? '+' : ''}${netExpectancy.toFixed(2)}% per trade`);
  console.log(`Track B WR      : ${trackBWR.toFixed(1)}% (${trackBWins.length}W / ${trackBTrades.length - trackBWins.length}L)`);
  console.log('Trades:');
  executedTrades.forEach((t, i) => {
    console.log(`  ${i+1}. ${t.symbol.padEnd(7)} (${t.date}) | Ret: ${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct}% | ${t.isWin ? '✅ WIN' : '❌ LOSS'} | ${t.setupReason} | Float Net: ${t.totalFloatPct.toFixed(2)}% (Lead: ${t.leadFloatPct.toFixed(2)}%)`);
  });
  console.log('');
}

console.log('Testing Float % Grid Sensitivity on Adaptive Flowchart v2.0...\n');

// 1. Current Baseline (No float % filter)
runGrid('1. Baseline Flowchart v2.0 (No Float % Filter)');

// 2. Lead Broker Net Float >= 0.20%
runGrid('2. Moderate Float Filter: Lead Broker Net >= 0.20% of Float', { minLeadFloatPct: 0.20 });

// 3. Lead Broker Net Float >= 0.30%
runGrid('3. Strong Float Filter: Lead Broker Net >= 0.30% of Float', { minLeadFloatPct: 0.30 });

// 4. Combined: Lead Net >= 0.25% AND Total 5D Net >= 1.0% of Float
runGrid('4. Elite Float Filter: Lead Net >= 0.25% & Total 5D Net >= 1.0% of Float', { minLeadFloatPct: 0.25, minTotalFloatPct: 1.0 });
