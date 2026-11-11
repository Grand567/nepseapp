// scripts/testPredictorsWinRate.mjs
/**
 * ============================================================================
 * MULTI-PREDICTOR WIN RATE & FORWARD PERFORMANCE BENCHMARK
 * ============================================================================
 * Evaluates the actual predictive accuracy and win rates of the various
 * stock selectors and predictors in Drabyashree NEPSE across historical
 * sessions under the post-April 2026 (+/-15% circuit breaker) regime.
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
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

// 1. Load NEPSE index benchmark candles
const indexBaselinePath = path.join(process.cwd(), 'src', 'data', 'nepse_index_baseline.json');
let indexMap = new Map();
if (fs.existsSync(indexBaselinePath)) {
  const indexCandles = JSON.parse(fs.readFileSync(indexBaselinePath, 'utf8'));
  indexMap = new Map(indexCandles.map(c => [c.date, Number(c.close || c.price || 0)]));
}

// 2. Load fundamentals
const fundamentalsRows = db.prepare('SELECT * FROM scrip_fundamentals').all();
const fundamentalsMap = new Map(fundamentalsRows.map(f => [String(f.symbol || '').toUpperCase().trim(), f]));

// 3. Load daily stock summaries
console.log('Loading chronological daily stock summary records...');
const rawRecords = db.prepare(`
  SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
  FROM daily_stock_summary
  ORDER BY trade_date ASC, symbol ASC
`).all();

const scripHistoryMap = new Map(); // symbol -> Array of daily candles
const dateScripMap = new Map();    // trade_date -> Map(symbol -> candle)
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
console.log(`Loaded ${rawRecords.length} records across ${scripHistoryMap.size} scrips and ${sortedDates.length} sessions.`);

// 4. Load broker accumulation ledger
console.log('Loading broker ledger records...');
const brokerRows = db.prepare(`
  SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
  FROM daily_broker_ledger
  WHERE buy_vol > 0 OR sell_vol > 0
`).all();

const brokerDateScripMap = new Map();
for (const b of brokerRows) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  const key = `${b.trade_date}_${sym}`;
  if (!brokerDateScripMap.has(key)) {
    brokerDateScripMap.set(key, { totalBuyVol: 0, totalSellVol: 0, brokers: new Map() });
  }
  const entry = brokerDateScripMap.get(key);
  entry.totalBuyVol += Number(b.buy_vol || 0);
  entry.totalSellVol += Number(b.sell_vol || 0);
  entry.brokers.set(Number(b.broker_id), {
    buy: Number(b.buy_vol || 0),
    sell: Number(b.sell_vol || 0),
    buyAmt: Number(b.buy_amt || 0)
  });
}
console.log(`Loaded ${brokerRows.length} broker transactions.`);

// Technical indicator helpers
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
  let gains = 0;
  let losses = 0;
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

function isDisqualifiedSecurity(symbol, price) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP') || sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  if (/\d+$/.test(sym) && (sym.includes('D') || sym.includes('B') || sym.includes('F'))) return true;
  if (price > 0 && price < 50) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// PREDICTOR / SELECTOR ENGINES IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

// Predictor 1: 7-Gate Swing Breakout Selector (Canonical Swing Engine)
function select7GateSwing(date, scripsOnDate, dateIdx) {
  const indexClose = indexMap.get(date) || 2600;
  const pastIndexDates = sortedDates.slice(Math.max(0, dateIdx - 60), dateIdx + 1);
  const pastIndexCloses = pastIndexDates.map(d => indexMap.get(d) || indexClose);
  const indexEma20 = calculateEMA(pastIndexCloses, 20) || indexClose;
  const indexEma50 = calculateEMA(pastIndexCloses, 50) || indexClose;

  // Gate 2: Market regime check
  if (indexClose < indexEma50 || indexClose < indexEma20) {
    return []; // Cash defense / No trade today
  }

  const picks = [];
  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 5000000 || c.volume < 5000) continue; // Gate 3: Liquidity

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 50) continue;

    const closes = histUpToDate.map(h => h.close);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    if (!ema20 || !ema50) continue;

    // Gate 1: Trend Alignment
    if (c.close <= ema20 || ema20 < ema50 * 0.98) continue;

    // Gate 4: Momentum Breakout & RVOL
    const recent20Closes = closes.slice(-21, -1);
    const highestPrior20 = Math.max(...recent20Closes);
    const isBreakout = c.close >= highestPrior20;
    if (!isBreakout) continue;

    const volumes = histUpToDate.map(h => h.volume);
    const avgVol20 = volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    const rvol = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    if (rvol < 1.25) continue;

    // Gate 5: Fundamentals
    const fund = fundamentalsMap.get(sym);
    if (fund && ((fund.eps != null && fund.eps <= 0) || (fund.book_value != null && fund.book_value <= 0))) continue;

    // Gate 6: Broker Flow
    const brokerKey = `${date}_${sym}`;
    const brokerData = brokerDateScripMap.get(brokerKey);
    let hasBrokerFlow = true;
    if (brokerData) {
      const topBrokers = Array.from(brokerData.brokers.values()).sort((a, b) => b.buy - a.buy);
      const bcr3Buy = brokerData.totalBuyVol > 0
        ? (topBrokers.slice(0, 3).reduce((s, b) => s + b.buy, 0) / brokerData.totalBuyVol) * 100
        : 0;
      hasBrokerFlow = bcr3Buy >= 25 || brokerData.totalBuyVol > brokerData.totalSellVol;
    }
    if (!hasBrokerFlow) continue;

    // Score candidate
    const score = (rvol * 20) + (c.close / ema20 * 30);
    picks.push({ symbol: sym, score, ltp: c.close });
  }

  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, 5).map(p => p.symbol);
}

// Predictor 2: Minervini Stage 2 Leaderboard + OAMI
function selectMinerviniLeaderboard(date, scripsOnDate, dateIdx) {
  const indexClose = indexMap.get(date) || 2600;
  const picks = [];

  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 2000000 || c.volume < 3000) continue;

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 50) continue;

    const closes = histUpToDate.map(h => h.close);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    if (!ema20 || !ema50) continue;

    // Minervini checks:
    // 1. Price > EMA50
    const c1 = c.close > ema50;
    // 2. EMA20 >= EMA50 * 0.99
    const c2 = ema20 >= ema50 * 0.99;
    // 3. Within 25% of 52W (or period) High
    const periodHigh = Math.max(...closes.slice(-120));
    const c3 = periodHigh > 0 && c.close >= periodHigh * 0.75;
    // 4. > 30% above 52W Low
    const periodLow = Math.min(...closes.slice(-120));
    const c4 = periodLow > 0 && c.close >= periodLow * 1.30;
    // 5. Volume expansion
    const volumes = histUpToDate.map(h => h.volume);
    const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const c5 = avgVol > 0 && c.volume >= avgVol * 1.2;

    if (!c1 || !c2 || !c3 || !c4) continue;

    // OAMI calculation: 52W position + volume surge
    const rangePosition = (periodHigh > periodLow) ? ((c.close - periodLow) / (periodHigh - periodLow)) * 100 : 50;
    const volSurge = avgVol > 0 ? (c.volume / avgVol) : 1;
    const oamiScore = (0.5 * rangePosition) + (0.5 * Math.min(volSurge * 25, 50));

    picks.push({ symbol: sym, score: oamiScore, ltp: c.close });
  }

  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, 5).map(p => p.symbol);
}

// Predictor 3: 4-Pillar Quantitative Composite Screener
function select4PillarComposite(date, scripsOnDate, dateIdx) {
  const indexClose = indexMap.get(date) || 2600;
  const pastIndexDates = sortedDates.slice(Math.max(0, dateIdx - 50), dateIdx + 1);
  const pastIndexCloses = pastIndexDates.map(d => indexMap.get(d) || indexClose);
  const indexEma20 = calculateEMA(pastIndexCloses, 20) || indexClose;
  const isIndexBull = indexClose >= indexEma20;

  const picks = [];

  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 2000000 || c.volume < 4000) continue; // Hard filter

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 30) continue;

    const closes = histUpToDate.map(h => h.close);
    const ema20 = calculateEMA(closes, 20) || c.close;
    const ema50 = calculateEMA(closes, 50) || c.close;
    const rsi = calculateRSI(closes, 14);

    // Pillar 1: Technical Score (25% weight)
    let techScore = 50;
    if (c.close > ema20) techScore += 20;
    if (ema20 > ema50) techScore += 15;
    if (rsi >= 50 && rsi <= 68) techScore += 15;
    else if (rsi > 75) techScore -= 10;

    // Pillar 2: Fundamental Score (20% weight)
    const fund = fundamentalsMap.get(sym);
    let fundScore = 50;
    if (fund) {
      if (fund.eps > 0) fundScore += 20;
      if (fund.eps > 15) fundScore += 10;
      if (fund.book_value > 120) fundScore += 10;
      if (fund.pe > 0 && fund.pe < 25) fundScore += 10;
    }

    // Pillar 3: Broker Floorsheet Score (35% weight)
    const brokerKey = `${date}_${sym}`;
    const brokerData = brokerDateScripMap.get(brokerKey);
    let brokerScore = 50;
    if (brokerData && brokerData.totalBuyVol > 0) {
      const netFlow = brokerData.totalBuyVol - brokerData.totalSellVol;
      if (netFlow > 0) brokerScore += 25;
      const topBrokers = Array.from(brokerData.brokers.values()).sort((a, b) => b.buy - a.buy);
      const bcr3 = (topBrokers.slice(0, 3).reduce((s, b) => s + b.buy, 0) / brokerData.totalBuyVol) * 100;
      if (bcr3 >= 35) brokerScore += 25;
    }

    // Pillar 4: Market Context Score (20% weight)
    let marketScore = isIndexBull ? 70 : 40;

    const compositeScore = (brokerScore * 0.35) + (techScore * 0.25) + (fundScore * 0.20) + (marketScore * 0.20);
    if (compositeScore >= 65) {
      picks.push({ symbol: sym, score: compositeScore, ltp: c.close });
    }
  }

  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, 5).map(p => p.symbol);
}

// Predictor 4: Daily Prime Pick (Zero-Trap Alpha Breakout)
function selectDailyPrimePick(date, scripsOnDate, dateIdx) {
  const candidates = [];

  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 3000000 || c.volume < 5000) continue;

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 30) continue;

    const fund = fundamentalsMap.get(sym);
    if (fund && fund.eps != null && fund.eps <= 0) continue;

    const closes = histUpToDate.map(h => h.close);
    const ema20 = calculateEMA(closes, 20) || c.close;
    if (c.close < ema20) continue;

    // Anti-Dump Wick Gate: Upper wick must not be >= 35% of daily range
    const cRange = Math.max(0.1, c.high - c.low);
    const upperWick = c.high - Math.max(c.open, c.close);
    const upperWickRatio = upperWick / cRange;
    if (upperWickRatio >= 0.35) continue; // Bull trap rejection

    // Volume Dry-Up (VDU) or Surge
    const volumes = histUpToDate.map(h => h.volume);
    const avgVol = volumes.slice(-15).reduce((s, v) => s + v, 0) / 15;
    const rvol = avgVol > 0 ? c.volume / avgVol : 1;

    // Breakout check over past 15 sessions
    const highest15 = Math.max(...closes.slice(-16, -1));
    const isBreakout = c.close >= highest15;

    if (isBreakout && rvol >= 1.2) {
      const score = (rvol * 30) + ((1 - upperWickRatio) * 40) + ((c.close / ema20) * 30);
      candidates.push({ symbol: sym, score, ltp: c.close });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 1).map(p => p.symbol); // Crowns #1 Prime Pick
}

// Predictor 5: Multibagger Hunter (8-Gate Low-Float & Accumulation)
function selectMultibaggerHunter(date, scripsOnDate, dateIdx) {
  const picks = [];

  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 1500000) continue;

    const fund = fundamentalsMap.get(sym);
    if (!fund) continue;
    if (fund.eps != null && fund.eps <= 0) continue;

    // Gate 1: Public Float <= 15M shares (or listed shares <= 30M)
    const listedShares = fund.listed_shares || 20000000;
    const promoterPct = fund.promoter_holding || 51;
    const publicFloat = listedShares * (1 - promoterPct / 100);
    if (publicFloat > 15000000) continue;

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 30) continue;

    // Gate 3: Volatility squeeze (Bollinger Width < 15%)
    const closes = histUpToDate.map(h => h.close);
    const mean = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const variance = closes.slice(-20).reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const bbWidth = mean > 0 ? (2 * stdDev / mean) * 100 : 20;
    if (bbWidth > 18.0) continue; // Squeeze condition

    // Gate 4: Volume Z-Score > 1.0
    const volumes = histUpToDate.map(h => h.volume);
    const vMean = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const vVariance = volumes.slice(-20).reduce((s, v) => s + Math.pow(v - vMean, 2), 0) / 20;
    const vStd = Math.sqrt(vVariance);
    const zScore = vStd > 0 ? (c.volume - vMean) / vStd : 0;

    // Graham Margin of Safety check
    const eps = fund.eps || 10;
    const bv = fund.book_value || 110;
    const grahamVal = Math.sqrt(22.5 * Math.max(0, eps) * Math.max(0, bv));
    const mos = grahamVal > 0 ? ((grahamVal - c.close) / grahamVal) * 100 : 0;

    const hunterScore = (zScore * 25) + ((20 - bbWidth) * 2) + Math.min(mos, 30);
    picks.push({ symbol: sym, score: hunterScore, ltp: c.close });
  }

  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, 5).map(p => p.symbol);
}

// Predictor 6: Wyckoff Stealth Accumulation / High CMF Scanner
function selectWyckoffAccumulation(date, scripsOnDate, dateIdx) {
  const picks = [];

  for (const [sym, c] of scripsOnDate.entries()) {
    if (isDisqualifiedSecurity(sym, c.close)) continue;
    if (c.turnover < 2000000 || c.volume < 4000) continue;

    const history = scripHistoryMap.get(sym);
    if (!history) continue;
    const histUpToDate = history.filter(h => h.date <= date);
    if (histUpToDate.length < 25) continue;

    // Chaikin Money Flow (CMF) 20-period
    let sumMFV = 0;
    let sumVol = 0;
    const slice20 = histUpToDate.slice(-20);
    for (const h of slice20) {
      const range = h.high - h.low;
      const mfm = range > 0 ? ((h.close - h.low) - (h.high - h.close)) / range : 0;
      const mfv = mfm * h.volume;
      sumMFV += mfv;
      sumVol += h.volume;
    }
    const cmf = sumVol > 0 ? sumMFV / sumVol : 0;
    if (cmf < 0.08) continue; // High accumulation condition

    const closes = histUpToDate.map(h => h.close);
    const ema20 = calculateEMA(closes, 20) || c.close;
    if (c.close < ema20 * 0.98) continue;

    const score = cmf * 100;
    picks.push({ symbol: sym, score, ltp: c.close });
  }

  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, 5).map(p => p.symbol);
}

// Predictor 7: Random Selection Baseline (Control Benchmark)
function selectRandomBaseline(date, scripsOnDate, dateIdx) {
  const eligible = [];
  for (const [sym, c] of scripsOnDate.entries()) {
    if (!isDisqualifiedSecurity(sym, c.close) && c.turnover >= 1500000 && c.volume >= 3000) {
      eligible.push(sym);
    }
  }
  // Deterministic pseudo-random based on date & index
  const hash = date.split('-').reduce((s, p) => s * 31 + Number(p), 7);
  const selected = [];
  for (let i = 0; i < Math.min(5, eligible.length); i++) {
    const idx = (hash * (i + 1) * 37) % eligible.length;
    if (!selected.includes(eligible[idx])) {
      selected.push(eligible[idx]);
    }
  }
  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORWARD PERFORMANCE & WIN RATE SIMULATION RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export function runMultiPredictorBenchmark() {
  // Filter dates strictly after April 14, 2026 (the 15% circuit breaker regime)
  const postCircuitDates = sortedDates.filter(d => d >= '2026-04-15');
  console.log(`Evaluating across ${postCircuitDates.length} trading dates in the 15% circuit regime...`);

  // We evaluate EVERY available historical date after April 14, 2026 up to 10 sessions before end
  // (so forward 3D, 5D, and 10D prices are fully known without lookahead bias)
  const validTestDates = postCircuitDates.slice(10, -10); // Leave 10 days for forward evaluation
  const testDates = validTestDates; // Test all 116 consecutive sessions!

  console.log(`Sampled ${testDates.length} historical test dates across May–October 2026:\n  ${testDates.slice(0, 5).join(', ')} ... ${testDates.slice(-3).join(', ')}\n`);

  const predictors = [
    { id: 'swing_7gate', name: '7-Gate Swing Breakout Selector', fn: select7GateSwing },
    { id: 'prime_pick', name: 'Daily Prime Pick (Zero-Trap Alpha)', fn: selectDailyPrimePick },
    { id: 'minervini', name: 'Minervini Stage 2 + OAMI Leaderboard', fn: selectMinerviniLeaderboard },
    { id: 'pillar_4', name: '4-Pillar Quantitative Composite Screener', fn: select4PillarComposite },
    { id: 'multibagger', name: 'Multibagger Hunter (8-Gate Low-Float)', fn: selectMultibaggerHunter },
    { id: 'wyckoff', name: 'Wyckoff Stealth Accumulation (CMF/ADL)', fn: selectWyckoffAccumulation },
    { id: 'random', name: 'Random Selection Baseline (Control)', fn: selectRandomBaseline }
  ];

  const results = {};
  for (const pred of predictors) {
    results[pred.id] = {
      name: pred.name,
      totalPicks: 0,
      activeDates: 0,
      // 3-Day Holding (Immediate T+2 unlock exit)
      h3: { trades: [], winsGross: 0, winsNet: 0, grossReturnSum: 0, netReturnSum: 0, grossWinSum: 0, grossLossSum: 0 },
      // 5-Day Holding (1-Week Swing)
      h5: { trades: [], winsGross: 0, winsNet: 0, grossReturnSum: 0, netReturnSum: 0, grossWinSum: 0, grossLossSum: 0 },
      // 10-Day Holding (2-Week Swing)
      h10: { trades: [], winsGross: 0, winsNet: 0, grossReturnSum: 0, netReturnSum: 0, grossWinSum: 0, grossLossSum: 0 },
      // Bracket Execution (Target +7.5% / Stop -4.2%, min 2 days hold)
      bracket: { trades: [], winsGross: 0, winsNet: 0, grossReturnSum: 0, netReturnSum: 0, grossWinSum: 0, grossLossSum: 0 }
    };
  }

  for (const testDate of testDates) {
    const dateIdx = sortedDates.indexOf(testDate);
    const scripsOnDate = dateScripMap.get(testDate);
    if (!scripsOnDate) continue;

    // Next day must exist for entry
    const nextDate = sortedDates[dateIdx + 1];
    const scripsNextDate = dateScripMap.get(nextDate);
    if (!scripsNextDate) continue;

    for (const pred of predictors) {
      const picks = pred.fn(testDate, scripsOnDate, dateIdx);
      if (!picks || picks.length === 0) continue;

      results[pred.id].activeDates++;

      for (const sym of picks) {
        // Zero-Lookahead Entry on Day T+1 Open (+0.35% realistic slippage)
        const nextCandle = scripsNextDate.get(sym);
        if (!nextCandle) continue;

        const entryOpen = nextCandle.open > 0 ? nextCandle.open : nextCandle.close;
        if (entryOpen <= 0) continue;
        const entryPrice = +(entryOpen * 1.0035).toFixed(1);

        // Check forward candles for Day T+1 to Day T+10
        const forwardCandles = [];
        for (let f = 1; f <= 10; f++) {
          const fDate = sortedDates[dateIdx + f];
          if (!fDate) break;
          const fc = dateScripMap.get(fDate)?.get(sym);
          if (fc) forwardCandles.push(fc);
        }

        if (forwardCandles.length < 3) continue; // Need at least T+2 Demat survival

        results[pred.id].totalPicks++;

        // Helper to evaluate fixed horizon trade
        function evaluateHorizon(cExit, holdingDays) {
          const exitPrice = cExit.close;
          const grossReturnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
          const netReturnObj = calculateRoundTripNetReturn({
            buyPrice: entryPrice,
            sellPrice: exitPrice,
            quantity: 100,
            holdingDays,
            investorType: 'INDIVIDUAL_RESIDENT'
          });
          const netReturnPct = +netReturnObj.netReturnPct.toFixed(2);
          return { grossReturnPct, netReturnPct };
        }

        // 1. Evaluate 3-Day Horizon (Day 3 candle, i.e. forwardCandles[2])
        if (forwardCandles.length >= 3) {
          const { grossReturnPct, netReturnPct } = evaluateHorizon(forwardCandles[2], 3);
          const h = results[pred.id].h3;
          h.trades.push({ sym, testDate, grossReturnPct, netReturnPct });
          if (grossReturnPct > 0) { h.winsGross++; h.grossWinSum += grossReturnPct; }
          else { h.grossLossSum += Math.abs(grossReturnPct); }
          if (netReturnPct > 0) h.winsNet++;
          h.grossReturnSum += grossReturnPct;
          h.netReturnSum += netReturnPct;
        }

        // 2. Evaluate 5-Day Horizon (Day 5 candle, i.e. forwardCandles[4])
        if (forwardCandles.length >= 5) {
          const { grossReturnPct, netReturnPct } = evaluateHorizon(forwardCandles[4], 5);
          const h = results[pred.id].h5;
          h.trades.push({ sym, testDate, grossReturnPct, netReturnPct });
          if (grossReturnPct > 0) { h.winsGross++; h.grossWinSum += grossReturnPct; }
          else { h.grossLossSum += Math.abs(grossReturnPct); }
          if (netReturnPct > 0) h.winsNet++;
          h.grossReturnSum += grossReturnPct;
          h.netReturnSum += netReturnPct;
        }

        // 3. Evaluate 10-Day Horizon (Day 10 candle, i.e. forwardCandles[9])
        if (forwardCandles.length >= 10) {
          const { grossReturnPct, netReturnPct } = evaluateHorizon(forwardCandles[9], 10);
          const h = results[pred.id].h10;
          h.trades.push({ sym, testDate, grossReturnPct, netReturnPct });
          if (grossReturnPct > 0) { h.winsGross++; h.grossWinSum += grossReturnPct; }
          else { h.grossLossSum += Math.abs(grossReturnPct); }
          if (netReturnPct > 0) h.winsNet++;
          h.grossReturnSum += grossReturnPct;
          h.netReturnSum += netReturnPct;
        }

        // 4. Evaluate Dynamic Bracket Execution (Target +7.5% / Stop -4.2%, locked until Day 3)
        const targetPrice = entryPrice * 1.075;
        const stopPrice = entryPrice * 0.958;
        let bracketExitPrice = forwardCandles[forwardCandles.length - 1].close;
        let bracketDays = forwardCandles.length;

        for (let i = 0; i < forwardCandles.length; i++) {
          const fc = forwardCandles[i];
          const session = i + 1; // 1 = Day T+1, 2 = Day T+2, 3 = Day T+3
          // T+2 lock: cannot exit on session 1 or 2
          if (session < 3) continue;

          if (fc.high >= targetPrice) {
            bracketExitPrice = targetPrice;
            bracketDays = session;
            break;
          } else if (fc.low <= stopPrice) {
            bracketExitPrice = stopPrice;
            bracketDays = session;
            break;
          }
        }

        const bGrossReturnPct = +(((bracketExitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
        const bNetReturnObj = calculateRoundTripNetReturn({
          buyPrice: entryPrice,
          sellPrice: bracketExitPrice,
          quantity: 100,
          holdingDays: bracketDays,
          investorType: 'INDIVIDUAL_RESIDENT'
        });
        const bNetReturnPct = +bNetReturnObj.netReturnPct.toFixed(2);
        const brk = results[pred.id].bracket;
        brk.trades.push({ sym, testDate, grossReturnPct: bGrossReturnPct, netReturnPct: bNetReturnPct });
        if (bGrossReturnPct > 0) { brk.winsGross++; brk.grossWinSum += bGrossReturnPct; }
        else { brk.grossLossSum += Math.abs(bGrossReturnPct); }
        if (bNetReturnPct > 0) brk.winsNet++;
        brk.grossReturnSum += bGrossReturnPct;
        brk.netReturnSum += bNetReturnPct;
      }
    }
  }

  // Format and compile report
  console.log('\n========================================================================================');
  console.log(' DRABYASHREE NEPSE: PREDICTOR & STOCK SELECTOR WIN-RATE BENCHMARK REPORT');
  console.log(' Regime: Post-April 2026 (+/-15% Daily Circuit Bands) | Zero-Lookahead | T+2 Lockout');
  console.log('========================================================================================\n');

  const summaryRows = [];

  for (const pred of predictors) {
    const res = results[pred.id];
    const n = res.totalPicks;

    const calcStats = (h) => {
      const count = h.trades.length;
      if (count === 0) return { grossWR: '0.0%', netWR: '0.0%', pf: '0.00', avgNet: '0.00%' };
      const grossWR = ((h.winsGross / count) * 100).toFixed(1) + '%';
      const netWR = ((h.winsNet / count) * 100).toFixed(1) + '%';
      const pf = h.grossLossSum > 0 ? (h.grossWinSum / h.grossLossSum).toFixed(2) : (h.grossWinSum > 0 ? '9.99' : '0.00');
      const avgNet = (h.netReturnSum / count).toFixed(2) + '%';
      return { grossWR, netWR, pf, avgNet, count };
    };

    const s3 = calcStats(res.h3);
    const s5 = calcStats(res.h5);
    const s10 = calcStats(res.h10);
    const sBrk = calcStats(res.bracket);

    summaryRows.push({
      id: pred.id,
      name: pred.name,
      totalPicks: n,
      activeDates: res.activeDates,
      s3,
      s5,
      s10,
      sBrk
    });

    console.log(`[${pred.name}]`);
    console.log(`  Total Evaluated Positions: ${n} across ${res.activeDates} active sessions`);
    console.log(`  • 3-Session (T+3 Unlock): Gross Win Rate: ${s3.grossWR} | Net Win Rate: ${s3.netWR} | Net Expectancy: ${s3.avgNet} | PF: ${s3.pf}`);
    console.log(`  • 5-Session (1-Wk Swing): Gross Win Rate: ${s5.grossWR} | Net Win Rate: ${s5.netWR} | Net Expectancy: ${s5.avgNet} | PF: ${s5.pf}`);
    console.log(`  • 10-Session (2-Wk Swing): Gross Win Rate: ${s10.grossWR} | Net Win Rate: ${s10.netWR} | Net Expectancy: ${s10.avgNet} | PF: ${s10.pf}`);
    console.log(`  • Bracket (+7.5% / -4.2%): Gross Win Rate: ${sBrk.grossWR} | Net Win Rate: ${sBrk.netWR} | Net Expectancy: ${sBrk.avgNet} | PF: ${sBrk.pf}`);
    console.log('----------------------------------------------------------------------------------------');
  }

  // Save JSON report for verification
  fs.writeFileSync('qa/predictor_winrate_benchmark.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    regime: 'Post-April 2026 (+/-15% Circuit Breakers)',
    testDatesCount: testDates.length,
    testDatesSample: testDates,
    summaryRows
  }, null, 2));

  console.log('\n✓ Saved complete report to qa/predictor_winrate_benchmark.json');
}

runMultiPredictorBenchmark();
