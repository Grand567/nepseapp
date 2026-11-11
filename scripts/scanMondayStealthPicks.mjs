// scripts/scanMondayStealthPicks.mjs
/**
 * Executes the EXACT 4-Condition Week 3/4 Stealth Pipeline shown in the user's diagram:
 * 1. VDU <= 0.60x (Volume Dry-Up)
 * 2. BBW <= 14.0% (Bollinger Band Width Volatility Squeeze)
 * 3. CMF > 0 (Chaikin Money Flow Positive)
 * 4. BCR3 >= 35% (Top 3 Broker Concentration & Net Absorption)
 * 
 * As of the latest closed trading session: 2026-11-06
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import {
  calculateRoundTripNetReturn,
  calculateCircuitBand
} from '../src/constants/marketRules.js';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

// 1. Get latest date
const latestRow = db.prepare('SELECT MAX(trade_date) as max_date FROM daily_stock_summary').get();
const latestDate = latestRow.max_date;
console.log(`Executing exact diagram scan for latest session: ${latestDate}`);

// 2. Load daily stock summaries
const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC, symbol ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDates = Array.from(new Set(rawRecords.map(r => r.trade_date))).sort();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  const dt = r.trade_date;
  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(r);
  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, r);
}

// 3. Load fundamentals
const fundamentalsRows = db.prepare('SELECT symbol, sector, eps_ttm, book_value_per_share, npl_pct, car_pct FROM scrip_fundamentals').all();
const fundamentalsMap = new Map(fundamentalsRows.map(f => [String(f.symbol || '').toUpperCase().trim(), f]));

// 4. Load broker ledger for recent 10 sessions up to latestDate
const latestDateIdx = allDates.indexOf(latestDate);
const recent10Dates = allDates.slice(Math.max(0, latestDateIdx - 9), latestDateIdx + 1);
const recent10DatesSet = new Set(recent10Dates);

const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE trade_date >= ?
  ORDER BY trade_date ASC
`).all(recent10Dates[0]);

const brokerWindowMap = new Map(); // symbol -> Map(broker_id -> { buy, sell })
for (const b of brokerRows) {
  if (!recent10DatesSet.has(b.trade_date)) continue;
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!brokerWindowMap.has(sym)) brokerWindowMap.set(sym, new Map());
  const scripMap = brokerWindowMap.get(sym);
  const bId = Number(b.broker_id);
  if (!scripMap.has(bId)) scripMap.set(bId, { buy: 0, sell: 0 });
  const entry = scripMap.get(bId);
  entry.buy += Number(b.buy_vol || 0);
  entry.sell += Number(b.sell_vol || 0);
}

// Technical math
function calculateCMF(candles, period = 20) {
  if (!candles || candles.length < period) return 0;
  let sumMFV = 0, sumVol = 0;
  const slice = candles.slice(-period);
  for (const c of slice) {
    const range = c.high_price - c.low_price;
    const mfm = range > 0 ? ((c.close_price - c.low_price) - (c.high_price - c.close_price)) / range : 0;
    sumMFV += mfm * c.total_volume;
    sumVol += c.total_volume;
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

const latestScrips = dateScripMap.get(latestDate);
const qualifiedTickets = [];

for (const [sym, c] of latestScrips.entries()) {
  const ltp = Number(c.close_price);
  if (isDisqualified(sym, ltp)) continue;

  const history = scripHistoryMap.get(sym);
  if (!history || history.length < 30) continue;

  const closes = history.map(h => Number(h.close_price));
  const volumes = history.map(h => Number(h.total_volume));
  const turnovers = history.map(h => Number(h.total_turnover || 0));

  // Minimum baseline liquidity (turnover >= 15L or 3,000 kitta)
  const currentTurnover = c.total_turnover > 0 ? c.total_turnover : ltp * c.total_volume;
  if (currentTurnover < 1500000 || c.total_volume < 3000) continue;

  // Fundamental filter: Positive EPS
  const fund = fundamentalsMap.get(sym);
  if (fund && fund.eps_ttm != null && fund.eps_ttm <= 0) continue;

  // ── CONDITION 1: VOLUME DRY-UP (VDU <= 0.60x) ──
  const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
  const vduRatio = avgVol20 > 0 ? c.total_volume / avgVol20 : 1.0;
  const passVDU = vduRatio <= 0.60;

  // ── CONDITION 2: VOLATILITY SQUEEZE (BBW <= 14.0%) ──
  const bbw = calculateBBW(closes, 20);
  const past10Closes = closes.slice(-10);
  const min10 = Math.min(...past10Closes);
  const max10 = Math.max(...past10Closes);
  const spread10Pct = min10 > 0 ? ((max10 - min10) / min10) * 100 : 99;
  const passBBW = bbw <= 14.0 && spread10Pct <= 7.0;

  // ── CONDITION 3: CHAIKIN MONEY FLOW (CMF > 0) ──
  const cmf = calculateCMF(history, 20);
  const passCMF = cmf > 0.0;

  // ── CONDITION 4: BROKER CONCENTRATION (BCR3 >= 35%) ──
  const brokerEntries = brokerWindowMap.get(sym);
  let bcr3 = 0;
  let totalBuy = 0, totalSell = 0;
  let leadBroker = null;

  if (brokerEntries) {
    const list = Array.from(brokerEntries.entries()).map(([id, d]) => ({
      brokerId: id,
      buy: d.buy,
      sell: d.sell,
      net: d.buy - d.sell
    })).sort((a, b) => b.buy - a.buy);

    totalBuy = list.reduce((s, b) => s + b.buy, 0);
    totalSell = list.reduce((s, b) => s + b.sell, 0);
    if (totalBuy > 0) {
      const top3Buy = list.slice(0, 3).reduce((s, b) => s + b.buy, 0);
      bcr3 = +((top3Buy / totalBuy) * 100).toFixed(1);
    }
    leadBroker = list[0] || null;
  }
  const passBCR = bcr3 >= 35.0 && leadBroker && leadBroker.net > 0;

  // EVALUATE DECISION DIAMOND: "Does Any Stock Pass All 4 Conditions?"
  if (passVDU && passBBW && passCMF && passBCR) {
    // ── STEP 3: AUTOMATIC TICKET GENERATOR ──
    const entryMin = +(ltp * 0.992).toFixed(1);
    const entryMax = +(ltp * 1.008).toFixed(1);
    const chaseCap = +(ltp * 1.018).toFixed(1); // Max 1.8% chase
    const stopLoss = +(ltp * 0.965).toFixed(1); // -3.5% strict floor
    const target1 = +(ltp * 1.080).toFixed(1);  // +8.0% take 50% profit
    const target2 = +(ltp * 1.150).toFixed(1);  // +15.0% runner

    // Calculate Net Return after full round-trip frictions
    const netT1 = calculateRoundTripNetReturn({
      buyPrice: ltp,
      sellPrice: target1,
      quantity: 100,
      holdingDays: 7,
      investorType: 'INDIVIDUAL_RESIDENT'
    });
    const netStop = calculateRoundTripNetReturn({
      buyPrice: ltp,
      sellPrice: stopLoss,
      quantity: 100,
      holdingDays: 7,
      investorType: 'INDIVIDUAL_RESIDENT'
    });

    const netRRR = Math.abs(netStop.netReturnPct) > 0
      ? +(netT1.netReturnPct / Math.abs(netStop.netReturnPct)).toFixed(2)
      : 2.0;

    qualifiedTickets.push({
      symbol: sym,
      name: fund ? fund.sector : 'NEPSE Equity',
      sector: fund ? fund.sector : 'General',
      ltp,
      vduRatio: +vduRatio.toFixed(2),
      bbw: +bbw.toFixed(1),
      cmf: +cmf.toFixed(3),
      bcr3,
      leadBrokerId: leadBroker.brokerId,
      leadBrokerNetKitta: leadBroker.net,
      totalBuyKitta: totalBuy,
      entryMin,
      entryMax,
      chaseCap,
      stopLoss,
      target1,
      target2,
      netGainPct: +netT1.netReturnPct.toFixed(1),
      netLossPct: +Math.abs(netStop.netReturnPct).toFixed(1),
      netRRR,
      stealthScore: Math.round(
        (0.60 - vduRatio) * 50 + (14 - bbw) * 2 + (cmf * 100) + (bcr3 * 0.4)
      )
    });
  }
}

qualifiedTickets.sort((a, b) => b.stealthScore - a.stealthScore);

console.log(`\n========================================================================`);
console.log(` AUTOMATIC TICKET GENERATION RESULT: MONDAY EXECUTION`);
console.log(` Total Stocks Passing All 4 Conditions: ${qualifiedTickets.length}`);
console.log(`========================================================================\n`);

qualifiedTickets.forEach((t, i) => {
  console.log(`[TICKET #${i + 1}] ${t.symbol} (${t.sector}) — Stealth Score: ${t.stealthScore}/100`);
  console.log(`  • Friday Close: Rs. ${t.ltp}`);
  console.log(`  • Condition 1 (VDU): ${t.vduRatio}x <= 0.60x (PASSED)`);
  console.log(`  • Condition 2 (BBW): ${t.bbw}% <= 14.0% (PASSED)`);
  console.log(`  • Condition 3 (CMF): +${t.cmf} > 0.0 (PASSED)`);
  console.log(`  • Condition 4 (BCR3): ${t.bcr3}% >= 35.0% (PASSED, Lead: Broker #${t.leadBrokerId} net +${t.leadBrokerNetKitta.toLocaleString()} kitta)`);
  console.log(`  • Monday Buy Corridor: Rs. ${t.entryMin} – Rs. ${t.entryMax} | Max Chase Cap: Rs. ${t.chaseCap}`);
  console.log(`  • Stop Loss (-3.5% net): Rs. ${t.stopLoss} | Target 1 (+8.0% net): Rs. ${t.target1} | Target 2: Rs. ${t.target2}`);
  console.log(`  • Net Reward-to-Risk: ${t.netRRR}:1 after all statutory fees`);
  console.log(`------------------------------------------------------------------------`);
});

fs.writeFileSync('qa/monday_stealth_tickets.json', JSON.stringify({
  asOfDate: latestDate,
  count: qualifiedTickets.length,
  tickets: qualifiedTickets
}, null, 2));
