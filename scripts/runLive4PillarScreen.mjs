// scripts/runLive4PillarScreen.mjs
/**
 * Executes the 4-Pillar Quantitative Composite Screener across the entire NEPSE universe
 * as of the latest market session (2026-11-06) to identify the highest-conviction
 * stock picks for the upcoming Monday session.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  calculateRoundTripNetReturn,
  calculateCircuitBand,
  CIRCUIT_LIMITS
} from '../src/constants/marketRules.js';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// 1. Get latest date
const latestRow = db.prepare('SELECT MAX(trade_date) as max_date FROM daily_stock_summary').get();
const latestDate = latestRow.max_date;
console.log(`Latest available trading session: ${latestDate}`);

// 2. Load NEPSE index benchmark
const indexBaselinePath = path.join(process.cwd(), 'src', 'data', 'nepse_index_baseline.json');
let indexMap = new Map();
if (fs.existsSync(indexBaselinePath)) {
  const indexCandles = JSON.parse(fs.readFileSync(indexBaselinePath, 'utf8'));
  indexMap = new Map(indexCandles.map(c => [c.date, Number(c.close || c.price || 0)]));
}
const indexClose = indexMap.get(latestDate) || 2650;

// 3. Load fundamentals
const fundamentalsRows = db.prepare('SELECT * FROM scrip_fundamentals').all();
const fundamentalsMap = new Map(fundamentalsRows.map(f => [String(f.symbol || '').toUpperCase().trim(), f]));

// 4. Load all daily stock summaries
const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC, symbol ASC
`).all();

const scripHistoryMap = new Map();
const dateScripMap = new Map();
const allDatesSet = new Set();

for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  const dt = r.trade_date;
  allDatesSet.add(dt);

  const candle = {
    date: dt,
    symbol: sym,
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0)
  };

  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push(candle);

  if (!dateScripMap.has(dt)) dateScripMap.set(dt, new Map());
  dateScripMap.get(dt).set(sym, candle);
}
const sortedDates = Array.from(allDatesSet).sort();

// 5. Load latest broker data
const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE trade_date = ? AND (buy_vol > 0 OR sell_vol > 0)
`).all(latestDate);

const brokerSummaryMap = new Map();
for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!brokerSummaryMap.has(sym)) {
    brokerSummaryMap.set(sym, { totalBuyVol: 0, totalSellVol: 0, brokers: new Map() });
  }
  const entry = brokerSummaryMap.get(sym);
  entry.totalBuyVol += Number(b.buy_vol || 0);
  entry.totalSellVol += Number(b.sell_vol || 0);
  entry.brokers.set(Number(b.broker_id), {
    buy: Number(b.buy_vol || 0),
    sell: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0)
  });
}

// Technical math helpers
function calculateEMA(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return 5.0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function isDisqualified(symbol, price) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP') || sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (price > 0 && price < 50) return true;
  return false;
}

// Evaluate Market Regime on latestDate
const pastIndexDates = sortedDates.slice(Math.max(0, sortedDates.length - 60));
const pastIndexCloses = pastIndexDates.map(d => indexMap.get(d) || indexClose);
const indexEma20 = calculateEMA(pastIndexCloses, 20) || indexClose;
const indexEma50 = calculateEMA(pastIndexCloses, 50) || indexClose;

const latestScrips = dateScripMap.get(latestDate);
let advancers = 0, decliners = 0;
for (const [sym, c] of latestScrips.entries()) {
  const hist = scripHistoryMap.get(sym);
  if (hist && hist.length >= 2) {
    const prev = hist[hist.length - 2];
    if (c.close > prev.close) advancers++;
    else if (c.close < prev.close) decliners++;
  }
}
const isMarketRegimePositive = indexClose >= indexEma50 && advancers >= decliners * 0.8;
console.log(`NEPSE Index: ${indexClose.toFixed(1)} | EMA20: ${indexEma20.toFixed(1)} | EMA50: ${indexEma50.toFixed(1)} | Advancers: ${advancers} vs Decliners: ${decliners}`);

// Screen all scrips
const scoredCandidates = [];

for (const [sym, c] of latestScrips.entries()) {
  const ltp = c.close;
  if (isDisqualified(sym, ltp)) continue;

  const history = scripHistoryMap.get(sym);
  if (!history || history.length < 30) continue;
  const prevDay = history[history.length - 2] || c;
  const pChange = prevDay.close > 0 ? ((ltp - prevDay.close) / prevDay.close) * 100 : 0;
  const volume = c.volume;
  const turnover = c.turnover > 0 ? c.turnover : ltp * volume;

  // Zero-Tolerance Hard Filters
  if (turnover < 2500000 || volume < 4000) continue; // Minimum Rs. 25 Lakhs turnover
  const { ceiling, floor } = calculateCircuitBand(prevDay.close);
  if (ltp >= ceiling * 0.995 || ltp <= floor * 1.005) continue; // Not circuit locked

  const fund = fundamentalsMap.get(sym);
  const eps = fund ? Number(fund.eps ?? 15) : 15;
  const bookValue = fund ? Number(fund.book_value ?? 150) : 150;
  const pe = fund ? Number(fund.pe ?? 20) : 20;
  const npl = fund ? Number(fund.npl ?? 2.5) : 2.5;
  const car = fund ? Number(fund.car ?? 12.5) : 12.5;
  const sector = fund ? (fund.sector || 'Hydropower') : 'General';

  if (eps <= 0) continue; // Fundamental Filter: Exclude loss-making
  if (npl > 5.0) continue; // BFI NPL ceiling
  if (car < 11.0 && sector.toLowerCase().includes('commercial')) continue; // BFI CAR floor

  const closes = history.map(h => h.close);
  const ema20 = calculateEMA(closes, 20) || ltp;
  const ema50 = calculateEMA(closes, 50) || ltp;
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(history, 14);

  // Pillar 1: Broker Floorsheet (35% weight)
  const brokerData = brokerSummaryMap.get(sym);
  let brokerScore = 50;
  let topBrokerInfo = 'None';
  let bcr3Buy = 0;
  let netAbsorptionKitta = 0;

  if (brokerData && brokerData.totalBuyVol > 0) {
    const brokersList = Array.from(brokerData.brokers.entries()).map(([id, data]) => ({
      brokerId: id,
      buy: data.buy,
      sell: data.sell,
      net: data.buy - data.sell
    }));
    brokersList.sort((a, b) => b.buy - a.buy);

    const top3Buy = brokersList.slice(0, 3).reduce((s, b) => s + b.buy, 0);
    bcr3Buy = +((top3Buy / brokerData.totalBuyVol) * 100).toFixed(1);
    netAbsorptionKitta = brokerData.totalBuyVol - brokerData.totalSellVol;

    const lead = brokersList[0];
    topBrokerInfo = `Broker #${lead.brokerId} (+${lead.net.toLocaleString()} kitta)`;

    if (bcr3Buy >= 40) brokerScore += 25;
    else if (bcr3Buy >= 28) brokerScore += 15;

    if (netAbsorptionKitta > 0) brokerScore += 15;
    if (lead && lead.net > 5000) brokerScore += 10;
  }

  // Pillar 2: Technical Momentum & Structure (25% weight)
  let techScore = 50;
  const aboveEma20 = ltp >= ema20;
  const emaStackBullish = ema20 >= ema50 * 0.99;
  if (aboveEma20) techScore += 20;
  if (emaStackBullish) techScore += 15;
  if (rsi >= 48 && rsi <= 68) techScore += 15; // In momentum sweet-spot
  else if (rsi > 75) techScore -= 15; // Overbought climax

  // Check 15-day range breakout or healthy support bounce
  const recent15High = Math.max(...closes.slice(-16, -1));
  const isBreakout = ltp >= recent15High * 0.99;
  if (isBreakout) techScore += 10;

  // Pillar 3: Fundamental Valuation & Health (20% weight)
  let fundScore = 50;
  if (eps > 20) fundScore += 20;
  else if (eps > 10) fundScore += 10;

  if (bookValue > 150) fundScore += 10;
  if (pe > 0 && pe < 22) fundScore += 15; // Undervalued / fair multiple
  else if (pe > 50) fundScore -= 10;

  // Graham Number
  const grahamVal = Math.sqrt(22.5 * Math.max(1, eps) * Math.max(1, bookValue));
  const grahamMos = grahamVal > 0 ? ((grahamVal - ltp) / grahamVal) * 100 : 0;
  if (grahamMos >= 10) fundScore += 15;

  // Pillar 4: Market Context (20% weight)
  let marketScore = isMarketRegimePositive ? 75 : 45;
  if (pChange > 0) marketScore += 10;

  // Composite 4-Pillar Weighted Score
  const compositeScore = +((brokerScore * 0.35) + (techScore * 0.25) + (fundScore * 0.20) + (marketScore * 0.20)).toFixed(1);

  // Execution Corridor & Trade Plan
  const entryMin = +(ltp * 0.992).toFixed(1);
  const entryMax = +(ltp * 1.008).toFixed(1);
  const chaseCap = +(ltp * 1.020).toFixed(1); // Max 2% chase on Monday open
  const stopLoss = +(Math.max(ltp - (1.5 * atr), ltp * 0.935)).toFixed(1);
  const target1 = +(ltp + (1.5 * (ltp - stopLoss))).toFixed(1);
  const target2 = +(ltp + (2.5 * (ltp - stopLoss))).toFixed(1);

  // Calculate Net Return after full round-trip frictions
  const netT1 = calculateRoundTripNetReturn({
    buyPrice: ltp,
    sellPrice: target1,
    quantity: 100,
    holdingDays: 5,
    investorType: 'INDIVIDUAL_RESIDENT'
  });
  const netStop = calculateRoundTripNetReturn({
    buyPrice: ltp,
    sellPrice: stopLoss,
    quantity: 100,
    holdingDays: 5,
    investorType: 'INDIVIDUAL_RESIDENT'
  });

  const netGainPct = netT1.netReturnPct;
  const netLossPct = Math.abs(netStop.netReturnPct);
  const netRRR = netLossPct > 0 ? +(netGainPct / netLossPct).toFixed(2) : 0;

  scoredCandidates.push({
    symbol: sym,
    sector,
    ltp,
    pChange: +pChange.toFixed(2),
    turnover: Math.round(turnover),
    compositeScore,
    brokerScore,
    techScore,
    fundScore,
    marketScore,
    bcr3Buy,
    topBrokerInfo,
    rsi: +rsi.toFixed(1),
    ema20: +ema20.toFixed(1),
    ema50: +ema50.toFixed(1),
    grahamVal: Math.round(grahamVal),
    grahamMos: +grahamMos.toFixed(1),
    entryMin,
    entryMax,
    chaseCap,
    stopLoss,
    target1,
    target2,
    netGainPct: +netGainPct.toFixed(1),
    netLossPct: +netLossPct.toFixed(1),
    netRRR
  });
}

console.log(`Evaluated ${scoredCandidates.length} liquid scrips.`);
scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

console.log(`\n========================================================================`);
console.log(` TOP QUALIFIED STOCKS FOR MONDAY OPENING VIA 4-PILLAR COMPOSITE SCREEN`);
console.log(` Total Scored Candidates: ${scoredCandidates.length}`);
console.log(` Top 10 Scores: ${scoredCandidates.slice(0, 10).map(s => `${s.symbol} (${s.compositeScore})`).join(', ')}`);
console.log(`========================================================================\n`);

const top5 = scoredCandidates.slice(0, 5);
top5.forEach((s, idx) => {
  console.log(`#${idx + 1}: ${s.symbol} (${s.sector}) — Composite Score: ${s.compositeScore}/100 | Net R:R: ${s.netRRR}:1`);
  console.log(`  • Friday Close: Rs. ${s.ltp} (${s.pChange >= 0 ? '+' : ''}${s.pChange}%) | Turnover: Rs. ${(s.turnover / 100000).toFixed(1)} Lakhs`);
  console.log(`  • Pillar Scores: Broker: ${s.brokerScore}/100 (BCR3: ${s.bcr3Buy}%, ${s.topBrokerInfo}) | Tech: ${s.techScore}/100 (RSI: ${s.rsi}) | Fund: ${s.fundScore}/100 (Graham Val: Rs. ${s.grahamVal})`);
  console.log(`  • Monday Execution: Entry Zone: Rs. ${s.entryMin} – ${s.entryMax} | Chase Cap: Rs. ${s.chaseCap} (+2.0% max)`);
  console.log(`  • Risk Management: Stop Loss: Rs. ${s.stopLoss} (-${s.netLossPct}% net) | Target 1: Rs. ${s.target1} (+${s.netGainPct}% net) | Target 2: Rs. ${s.target2}`);
  console.log(`------------------------------------------------------------------------`);
});

fs.writeFileSync('qa/monday_4pillar_picks.json', JSON.stringify({
  latestSessionDate: latestDate,
  topPicks: top5,
  allCandidatesCount: scoredCandidates.length
}, null, 2));
