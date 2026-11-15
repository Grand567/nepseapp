import Database from 'better-sqlite3';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';
import { evaluateLoopholeProtectedSmcSetup } from '../proxy/telegramNotifier.mjs';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// 1. Ingest daily OHLCV candles from drabyashree_ledger.db
const rawRecords = db
  .prepare(
    `SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
     FROM daily_stock_summary
     ORDER BY trade_date ASC, symbol ASC`
  )
  .all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDatesSet = new Set();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  const dt = r.trade_date;
  if (!sym || !dt) continue;
  allDatesSet.add(dt);

  const candle = {
    date: dt,
    symbol: sym,
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0),
  };

  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(candle);

  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, candle);
}
const sortedDates = Array.from(allDatesSet).sort();

// 2. Ingest daily broker ledger
const brokerRows = db
  .prepare(
    `SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
     FROM daily_broker_ledger
     WHERE buy_vol > 0 OR sell_vol > 0
     ORDER BY trade_date ASC`
  )
  .all();

const scripBrokerHistoryMap = new Map();
for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!sym) continue;
  if (!scripBrokerHistoryMap.has(sym)) scripBrokerHistoryMap.set(sym, []);
  scripBrokerHistoryMap.get(sym).push({
    date: b.trade_date,
    brokerId: Number(b.broker_id),
    buyVol: Number(b.buy_vol || 0),
    sellVol: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0),
  });
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

function isDisqualified(sym, ltp) {
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
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (ltp > 0 && ltp < 100) return true;
  return false;
}

function aggregateBrokerWindow(sym, dateIdx, windowDays, ltp) {
  const windowDates = sortedDates.slice(Math.max(0, dateIdx - (windowDays - 1)), dateIdx + 1);
  const dateSet = new Set(windowDates);
  const entries = (scripBrokerHistoryMap.get(sym) || []).filter((b) => dateSet.has(b.date));

  const brokerAgg = new Map();
  let totalBuy = 0;
  let totalSell = 0;
  let totalBuyAmt = 0;
  for (const b of entries) {
    if (!brokerAgg.has(b.brokerId)) brokerAgg.set(b.brokerId, { buy: 0, sell: 0, buyAmt: 0 });
    const rec = brokerAgg.get(b.brokerId);
    rec.buy += b.buyVol;
    rec.sell += b.sellVol;
    rec.buyAmt += b.buyAmt;
    totalBuy += b.buyVol;
    totalSell += b.sellVol;
    totalBuyAmt += b.buyAmt;
  }

  if (totalBuy < 10000) return null;

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
  const netRetentionPct = top3BuyVol > 0 ? (top3NetVol / top3BuyVol) * 100 : 0;
  const leadBroker = buyers[0];
  const operatorVwap = leadBroker?.vwap || (totalBuy > 0 ? totalBuyAmt / totalBuy : ltp);
  const vwapDiffPct = operatorVwap > 0 ? ((ltp - operatorVwap) / operatorVwap) * 100 : 0;

  return {
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    netRetentionPct: +netRetentionPct.toFixed(1),
    operatorVwap: +operatorVwap.toFixed(1),
    vwapDiffPct: +vwapDiffPct.toFixed(2),
    leadBrokerId: leadBroker?.brokerId || null,
    isTrap: bcr3Sell >= 35.0 && bcr3Sell > bcr3Buy,
  };
}

function simulateTradeExecution(sig, { useRatchet = true } = {}) {
  const entryDate = sortedDates[sig.dateIdx + 1];
  if (!entryDate) return null;
  const scripEntryDay = dateScripMap.get(entryDate)?.get(sig.symbol);
  if (!scripEntryDay) return null;

  const entryPrice = scripEntryDay.open || scripEntryDay.close;
  if (!entryPrice || entryPrice <= 0) return null;

  const initialStopLoss = +(entryPrice * 0.965).toFixed(1); // -3.5% stop
  const ratchetTrigger = +(entryPrice * 1.055).toFixed(1);
  const ratchetLock = +(entryPrice * 1.022).toFixed(1);
  const target1 = +(entryPrice * 1.080).toFixed(1);
  const target2 = +(entryPrice * 1.150).toFixed(1);

  const history = scripHistoryMap.get(sig.symbol) || [];
  const forwardCandles = history.filter((h) => h.date >= entryDate).slice(0, 15);
  if (forwardCandles.length < 3) return null;

  let exitPrice = forwardCandles[forwardCandles.length - 1].close;
  let exitDate = forwardCandles[forwardCandles.length - 1].date;
  let exitReason = 'TIME_EXIT';
  let target1Hit = false;
  let ratchetArmed = false;
  let currentStopLoss = initialStopLoss;
  let daysHeld = forwardCandles.length;
  let peakPrice = entryPrice;

  for (let dayIdx = 0; dayIdx < forwardCandles.length; dayIdx++) {
    const c = forwardCandles[dayIdx];
    if (c.high > peakPrice) peakPrice = c.high;
    const isDematLocked = dayIdx < 2; // Mandatory T+2 Demat holding lock

    // 1. Check stop-loss / prior-bar armed ratchet FIRST (zero same-bar look-ahead bias)
    if (c.low <= currentStopLoss && !isDematLocked) {
      exitPrice = currentStopLoss;
      exitDate = c.date;
      exitReason = target1Hit
        ? useRatchet
          ? 'T1_SPLIT_TRAIL'
          : 'TARGET_1_BE (+2.5%)'
        : ratchetArmed
          ? 'RATCHET_BE (+2.2%)'
          : 'STOP_LOSS (-3.5%)';
      daysHeld = dayIdx + 1;
      break;
    }

    // 2. Check Target 2 (+15%)
    if (c.high >= target2 && !isDematLocked) {
      exitPrice = target2;
      exitDate = c.date;
      exitReason = 'TARGET_2 (+15%)';
      daysHeld = dayIdx + 1;
      break;
    }

    // 3. Arm Target 1 trail (+8.0% -> +2.5% BE lock for subsequent bars)
    if (c.high >= target1 && !target1Hit) {
      target1Hit = true;
      currentStopLoss = Math.max(currentStopLoss, +(entryPrice * 1.025).toFixed(1));
    } else if (useRatchet && dayIdx >= 5 && c.high >= ratchetTrigger && !ratchetArmed && !target1Hit) {
      // 4. Early Impulse Ratchet (+5.5% MFE after session 5 -> +2.2% BE lock for subsequent bars)
      ratchetArmed = true;
      currentStopLoss = Math.max(currentStopLoss, ratchetLock);
    }
  }

  let netReturnPct;
  if (useRatchet && target1Hit && exitReason === 'T1_SPLIT_TRAIL') {
    const leg1 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: target1, quantity: 50 }).netReturnPct;
    const leg2 = calculateRoundTripNetReturn({ buyPrice: entryPrice, sellPrice: exitPrice, quantity: 50 }).netReturnPct;
    netReturnPct = (leg1 + leg2) / 2;
  } else {
    netReturnPct = calculateRoundTripNetReturn({
      buyPrice: entryPrice,
      sellPrice: exitPrice,
      quantity: 100,
    }).netReturnPct;
  }

  const effectiveExit = useRatchet && target1Hit && exitReason === 'T1_SPLIT_TRAIL' ? (target1 + exitPrice) / 2 : exitPrice;
  const grossReturnPct = +(((effectiveExit - entryPrice) / entryPrice) * 100).toFixed(2);
  const maxMfePct = +(((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2);

  return {
    ...sig,
    entryDate,
    exitDate,
    daysHeld,
    entryPrice: +entryPrice.toFixed(1),
    exitPrice: +effectiveExit.toFixed(1),
    exitReason,
    maxMfePct,
    grossReturnPct,
    netReturnPct: +netReturnPct.toFixed(2),
  };
}

function deduplicateSignals(signals, cooldownDays = 5) {
  const distinct = [];
  for (const sig of signals) {
    const dup = distinct.find(
      (d) => d.symbol === sig.symbol && Math.abs(d.dateIdx - sig.dateIdx) < cooldownDays
    );
    if (!dup) distinct.push(sig);
  }
  return distinct;
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
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains;
  const avgWinPct = wins.length > 0 ? totalGains / wins.length : 0;
  const avgLossPct = losses.length > 0 ? totalLosses / losses.length : 0;
  const realizedRRR = avgLossPct > 0 ? avgWinPct / avgLossPct : avgWinPct;
  const expectancyPct = count > 0 ? trades.reduce((s, t) => s + t.netReturnPct, 0) / count : 0;

  let equity = 100000;
  for (const t of [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate))) {
    equity += equity * 0.20 * (t.netReturnPct / 100);
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
    realizedRRR: +realizedRRR.toFixed(2),
    profitFactor: +profitFactor.toFixed(2),
    expectancyPct: +expectancyPct.toFixed(2),
    periodReturnPct: +periodReturnPct.toFixed(1),
    annualCagrPct: +Math.min(999, annualCagrPct).toFixed(1),
  };
}

function scanWindow(testDates) {
  const baselineRaw = [];
  const upgradedRaw = [];

  for (const date of testDates) {
    const dateIdx = sortedDates.indexOf(date);
    const scripsOnDate = dateScripMap.get(date);
    if (!scripsOnDate) continue;

    for (const [sym, c] of scripsOnDate.entries()) {
      const ltp = c.close;
      if (isDisqualified(sym, ltp)) continue;
      if (c.turnover < 2500000 || c.volume < 8000) continue;

      const hist = scripHistoryMap.get(sym)?.filter((h) => h.date <= date);
      if (!hist || hist.length < 30) continue;

      const closes = hist.map((h) => h.close);
      const volumes = hist.map((h) => h.volume);
      const prevClose = hist[hist.length - 2]?.close || ltp;
      const chg1d = ((ltp - prevClose) / prevClose) * 100;
      const min10 = Math.min(...closes.slice(-10));
      const max10 = Math.max(...closes.slice(-10));
      const spread10 = min10 > 0 ? ((max10 - min10) / min10) * 100 : 99;
      const bbw = calculateBBW(closes, 20);
      const cmf = calculateCMF(hist, 20);
      const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
      const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;
      const vduMin5 = avgVol20 > 0 ? Math.min(...volumes.slice(-6, -1)) / avgVol20 : 1;
      const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;

      const flow = aggregateBrokerWindow(sym, dateIdx, 10, ltp);
      if (!flow || flow.isTrap) continue;
      if (flow.bcr3Buy < 40.0 || flow.netRetentionPct < 70.0) continue;
      if (flow.vwapDiffPct < -2.5 || flow.vwapDiffPct > 2.5) continue;

      const isStealth =
        chg1d >= -1.2 &&
        chg1d <= 2.0 &&
        spread10 <= 6.5 &&
        bbw <= 14.0 &&
        vduToday <= 0.60 &&
        cmf >= 0.08;

      if (isStealth) {
        baselineRaw.push({
          date,
          dateIdx,
          symbol: sym,
          track: 'STEALTH_FLOOR',
          ltp,
          bcr3Buy: flow.bcr3Buy,
          bcr3Sell: flow.bcr3Sell,
          netRetentionPct: flow.netRetentionPct,
          leadBrokerId: flow.leadBrokerId,
        });
      }

      const smc = evaluateLoopholeProtectedSmcSetup(hist.slice(-55), {
        ltp,
        ema20: sma20,
        avgBrokerPrice: flow.operatorVwap,
        bcr3Buy: flow.bcr3Buy,
        bcr3Sell: flow.bcr3Sell,
        leadRetentionPct: flow.netRetentionPct,
        isTrap: flow.isTrap,
      });

      const isHighConvictionSmcCoil =
        spread10 <= 6.8 &&
        bbw <= 12.5 &&
        vduMin5 <= 0.50 &&
        cmf >= 0.12 &&
        chg1d >= 0.2 &&
        chg1d <= 2.5 &&
        ltp >= sma20 &&
        flow.bcr3Buy >= 45.0 &&
        flow.bcr3Sell <= 30.0 &&
        flow.netRetentionPct >= 78.0 &&
        (smc.isBreakAndRetest || smc.isSmcSweepMss || smc.isFvgMitigated || (vduToday >= 0.80 && vduToday <= 1.50));

      if (!isStealth && !isHighConvictionSmcCoil) continue;

      let track = 'STEALTH_FLOOR';
      if (smc.isBreakAndRetest) track = 'SMC_BREAK_AND_RETEST';
      else if (smc.isSmcSweepMss || smc.isFvgMitigated) track = 'SMC_SWEEP_MSS_FVG';
      else if (isHighConvictionSmcCoil && !isStealth) track = 'COIL_IGNITION';

      upgradedRaw.push({
        date,
        dateIdx,
        symbol: sym,
        track,
        ltp,
        bcr3Buy: flow.bcr3Buy,
        bcr3Sell: flow.bcr3Sell,
        netRetentionPct: flow.netRetentionPct,
        leadBrokerId: flow.leadBrokerId,
        smcNarrative: smc.smcNarrative,
      });
    }
  }

  return { baselineRaw, upgradedRaw };
}

const brokerDates = Array.from(new Set(brokerRows.map((b) => b.trade_date))).sort();
const core27Dates = brokerDates.slice(8, -8); // Exact comparison window with backtest_stealth_flowchart.mjs
const full33Dates = brokerDates.slice(5, -5); // Extended window

const coreScan = scanWindow(core27Dates);
const base27Trades = deduplicateSignals(coreScan.baselineRaw, 5)
  .map((s) => simulateTradeExecution(s, { useRatchet: false }))
  .filter(Boolean);
const upg27Trades = deduplicateSignals(coreScan.upgradedRaw, 5)
  .map((s) => simulateTradeExecution(s, { useRatchet: true }))
  .filter(Boolean);

const fullScan = scanWindow(full33Dates);
const upg33Trades = deduplicateSignals(fullScan.upgradedRaw, 5)
  .map((s) => simulateTradeExecution(s, { useRatchet: true }))
  .filter(Boolean);

const base27Summary = summarizeTrades(base27Trades, `Baseline v2.0 Stealth Only (27 Sessions: ${core27Dates[0]}..${core27Dates[core27Dates.length - 1]})`, core27Dates.length);
const upg27Summary = summarizeTrades(upg27Trades, `Upgraded Loophole-Protected SMC + v2.0 (27 Sessions: ${core27Dates[0]}..${core27Dates[core27Dates.length - 1]})`, core27Dates.length);
const upg33Summary = summarizeTrades(upg33Trades, `Upgraded Loophole-Protected SMC + v2.0 (33 Sessions: ${full33Dates[0]}..${full33Dates[full33Dates.length - 1]})`, full33Dates.length);

console.log('\n══════════════════════════════════════════════════════════════════════════════════');
console.log('📊 DRAVYASHREE LOOPHOLE-PROTECTED SMC + /top5 + /breakout BACK-DATE TEST');
console.log('══════════════════════════════════════════════════════════════════════════════════');
console.log('Execution Rules: Next-Day Open Entry | T+2 Demat Lock | +5.5% MFE Ratchet (+2.2% BE) | +8% T1 / +15% T2 | NEPSE Fees+CGT\n');

for (const s of [base27Summary, upg27Summary, upg33Summary]) {
  console.log(`▶ ${s.label}`);
  console.log(
    `  Trades: ${s.count} (${s.wins}W / ${s.losses}L) | Strict Net Win Rate: ${s.netWinRate}% | Gross Win Rate: ${s.grossWinRate}%`
  );
  console.log(
    `  Avg Win: +${s.avgWinPct}% | Avg Loss: -${s.avgLossPct}% | Realized R:R: ${s.realizedRRR}:1 | Profit Factor: ${s.profitFactor}x | Expectancy: ${s.expectancyPct >= 0 ? '+' : ''}${s.expectancyPct}%/trade`
  );
  console.log(
    `  Window Return (20% pos/trade): +${s.periodReturnPct}% | Annualized Compounding Pace: ~${s.annualCagrPct}% CAGR\n`
  );
}

console.log('──────────────────────────────────────────────────────────────────────────────────');
console.log('🧭 PER-TRACK BREAKDOWN (33-SESSION FULL WINDOW):');
console.log('──────────────────────────────────────────────────────────────────────────────────');
for (const trackKey of ['STEALTH_FLOOR', 'SMC_BREAK_AND_RETEST', 'SMC_SWEEP_MSS_FVG', 'COIL_IGNITION']) {
  const subset = upg33Trades.filter((t) => t.track === trackKey);
  if (subset.length === 0) {
    console.log(`• ${trackKey.padEnd(22)} | Trades: 0   | (Confluence merged into Stealth/Retest tracks)`);
    continue;
  }
  const s = summarizeTrades(subset, trackKey, full33Dates.length);
  console.log(
    `• ${trackKey.padEnd(22)} | Trades: ${String(s.count).padEnd(3)} | Net Win Rate: ${String(s.netWinRate + '%').padEnd(6)} | Gross: ${String(s.grossWinRate + '%').padEnd(6)} | PF: ${s.profitFactor}x | Exp: ${s.expectancyPct >= 0 ? '+' : ''}${s.expectancyPct}%`
  );
}

console.log('\n──────────────────────────────────────────────────────────────────────────────────');
console.log('📋 ALL 33-SESSION TRADES AUDIT (LOOPHOLE-PROTECTED UPGRADE):');
console.log('──────────────────────────────────────────────────────────────────────────────────');
for (const t of upg33Trades) {
  const tag = t.netReturnPct > 0 ? '✅ WIN ' : '❌ SCR ';
  console.log(
    `${t.entryDate} | ${t.symbol.padEnd(6)} | ${t.track.padEnd(21)} | Ent: Rs.${String(t.entryPrice).padEnd(6)} | Ext: Rs.${String(t.exitPrice).padEnd(6)} | ${String(t.daysHeld + 'd').padEnd(3)} | Net: ${(t.netReturnPct >= 0 ? '+' : '') + t.netReturnPct + '%'} | ${tag} (${t.exitReason})`
  );
}
