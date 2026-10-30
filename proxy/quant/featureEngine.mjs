// proxy/quant/featureEngine.mjs
//
// Shared feature computation for both the index predictor and stock screener.
// Reuses whatever price-history / floorsheet tables already exist in db.mjs —
// this module does NOT scrape anything itself, it only reads/derives.
//
// Expects `pool` to be the existing pg Pool exported from proxy/db.mjs,
// with safe fallback when running in lightweight memory mode.

import { pool } from '../db.mjs';
import { db } from '../db/ledgerStore.js';
import { getMacroCache, hasMacroCache } from './macroCache.mjs';
import { getNewsCache, hasNewsCache } from './newsCache.mjs';

const EPSILON = 1e-8;

export function safeDiv(numerator, denominator, fallback = 0) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < EPSILON) {
    return fallback;
  }
  const ratio = num / den;
  return Number.isFinite(ratio) ? ratio : fallback;
}

export function clampFinite(value, min = -10, max = 10, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Computes zero-lookahead, NaN-immune technical features strictly up to index `idx` (inclusive).
 * Safe for newly listed IPOs (< 30 candles), suspended scrips, and consecutive upper/lower circuits.
 */
export function extractSafeFeatureVector(candles = [], idx = candles.length - 1) {
  if (!Array.isArray(candles) || candles.length === 0 || idx < 0 || idx >= candles.length) {
    return {
      isValid: false,
      reason: 'Empty or out-of-bounds candle slice',
      features: {
        ret1d: 0, ret5d: 0, ret20d: 0,
        rsi14Norm: 0, bbPercentB: 0.5, zScore20: 0,
        rvol20: 1.0, atrPct14: 0.025, ema20Dist: 0, ema50Dist: 0
      }
    };
  }

  // Strictly slice [0 .. idx] to guarantee ZERO lookahead leakage
  const slice = candles.slice(0, idx + 1);
  const n = slice.length;
  const curr = slice[n - 1];
  const close = Math.max(EPSILON, Number(curr.close ?? curr.ltp ?? 0));

  const prev1 = n >= 2 ? Number(slice[n - 2].close || close) : close;
  const prev5 = n >= 6 ? Number(slice[n - 6].close || close) : Number(slice[0].close || close);
  const prev20 = n >= 21 ? Number(slice[n - 21].close || close) : Number(slice[0].close || close);

  const ret1d = clampFinite(safeDiv(close - prev1, prev1, 0), -0.20, 0.20, 0);
  const ret5d = clampFinite(safeDiv(close - prev5, prev5, 0), -0.60, 0.60, 0);
  const ret20d = clampFinite(safeDiv(close - prev20, prev20, 0), -1.0, 1.5, 0);

  // Rolling 20-day mean & standard deviation with zero-variance circuit guard
  const closesAll = slice.map(c => Math.max(EPSILON, Number(c.close ?? c.ltp ?? close)));
  const win20 = closesAll.slice(-Math.min(20, n));
  const mean20 = win20.reduce((a, b) => a + b, 0) / Math.max(1, win20.length);
  const variance20 = win20.reduce((a, b) => a + Math.pow(b - mean20, 2), 0) / Math.max(1, win20.length);
  const std20 = Math.sqrt(Math.max(0, variance20));

  // If std20 === 0 (e.g. flat price or single-price IPO), zScore -> 0, bbPercentB -> 0.5
  const zScore20 = std20 > EPSILON ? clampFinite((close - mean20) / std20, -4.0, 4.0, 0) : 0;
  const bbLower = mean20 - 2 * std20;
  const bbWidth = 4 * std20;
  const bbPercentB = bbWidth > EPSILON ? clampFinite((close - bbLower) / bbWidth, -0.5, 1.5, 0.5) : 0.5;

  // Safe Wilder RSI-14 (handles AvgLoss === 0 during consecutive upper circuits & flat series)
  const rsi14 = computeRSI(closesAll, Math.min(14, Math.max(2, n - 1)));
  const rsi14Norm = clampFinite((rsi14 - 50) / 50, -1.0, 1.0, 0);

  // Safe RVOL-20 (strictly prior 20 sessions when n >= 2, guarding against zero historical volume)
  const priorVolSlice = n >= 2 ? slice.slice(-Math.min(21, n), -1) : slice;
  const vols20 = priorVolSlice.map(c => Math.max(0, Number(c.volume || 0)));
  const avgVol20 = vols20.reduce((a, b) => a + b, 0) / Math.max(1, vols20.length);
  const currVol = Math.max(0, Number(curr.volume || 0));
  const rvol20 = avgVol20 > EPSILON ? clampFinite(currVol / avgVol20, 0, 8.0, 1.0) : 1.0;

  // Safe ATR-14 Percentage
  let trSum = 0;
  const atrLookback = Math.min(14, n);
  for (let i = n - atrLookback; i < n; i++) {
    const h = Number(slice[i].high || slice[i].close || close);
    const l = Number(slice[i].low || slice[i].close || close);
    const pc = i > 0 ? Number(slice[i - 1].close || close) : close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trSum += Math.max(0, tr);
  }
  const atr14 = trSum / Math.max(1, atrLookback);
  const atrPct14 = clampFinite(safeDiv(atr14, close, 0.025), 0.002, 0.15, 0.025);

  // True EMA-20 & EMA-50 Relative Distance
  const ema20Val = computeEMA(closesAll, Math.min(20, n)) || mean20;
  const ema50Val = computeEMA(closesAll, Math.min(50, n)) || ema20Val;
  const ema20Dist = clampFinite(safeDiv(close - ema20Val, ema20Val, 0), -0.5, 0.5, 0);
  const ema50Dist = clampFinite(safeDiv(close - ema50Val, ema50Val, 0), -0.6, 0.6, 0);

  const rawFeatures = {
    ret1d: +ret1d.toFixed(4),
    ret5d: +ret5d.toFixed(4),
    ret20d: +ret20d.toFixed(4),
    rsi14Norm: +rsi14Norm.toFixed(4),
    bbPercentB: +bbPercentB.toFixed(4),
    zScore20: +zScore20.toFixed(4),
    rvol20: +rvol20.toFixed(4),
    atrPct14: +atrPct14.toFixed(4),
    ema20Dist: +ema20Dist.toFixed(4),
    ema50Dist: +ema50Dist.toFixed(4)
  };

  return {
    isValid: n >= 5,
    historyLength: n,
    isNewlyListedIpo: n < 30,
    features: sanitizeFeatureVector(rawFeatures)
  };
}

export function sanitizeFeatureVector(featureObj = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(featureObj)) {
    const num = Number(v);
    clean[k] = Number.isFinite(num) && !Number.isNaN(num) ? num : 0;
  }
  return clean;
}

/**
 * Simple RSI (Wilder's smoothing) over a closing-price series.
 * @param {number[]} closes - oldest -> newest
 * @param {number} period
 */
export function computeRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = Number(closes[i] || 0) - Number(closes[i - 1] || 0);
    if (diff > 0) gains += diff;
    else if (diff < 0) losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = Number(closes[i] || 0) - Number(closes[i - 1] || 0);
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  // Zero-variance flat price guard (returns neutral 50 instead of 100)
  if (avgGain < EPSILON && avgLoss < EPSILON) return 50;
  if (avgLoss < EPSILON) return 95;
  if (avgGain < EPSILON) return 5;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

/** Exponential moving average — strictly returns null if candles are insufficient (zero lookahead / bias immunity) */
export function computeEMA(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

/** MACD signal classification using 12/26/9 EMA convention */
export function computeMACDSignal(closes) {
  if (!Array.isArray(closes) || closes.length < 20) return 'neutral';
  const emaSeries = (period) => {
    const out = [];
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = ema;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  };
  const ema12 = emaSeries(12);
  const ema26 = emaSeries(26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null
  );
  const validMacd = macdLine.filter((v) => v != null);
  if (validMacd.length < 9) return 'neutral';

  const signalEma = (() => {
    const period = 9;
    const k = 2 / (period + 1);
    let ema = validMacd.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < validMacd.length; i++) {
      ema = validMacd[i] * k + ema * (1 - k);
    }
    return ema;
  })();
  const latestMacd = validMacd[validMacd.length - 1];
  const diff = latestMacd - signalEma;
  if (diff > 0.15) return 'bullish';
  if (diff < -0.15) return 'bearish';
  return 'neutral';
}

/**
 * On-Balance Volume — confirms buying/selling pressure independent of price alone.
 * @param {number[]} closes - oldest -> newest
 * @param {number[]} volumes - oldest -> newest, same length as closes
 * @returns {number[]} cumulative OBV series, same length as inputs
 */
export function computeOBV(closes, volumes) {
  if (!Array.isArray(closes) || !Array.isArray(volumes) || closes.length !== volumes.length || closes.length === 0) {
    return [];
  }
  const obv = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + (volumes[i] || 0));
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - (volumes[i] || 0));
    else obv.push(obv[i - 1]);
  }
  return obv;
}

/** Simple OBV trend classification over the trailing window: rising / falling / flat */
export function classifyOBVTrend(obvSeries, lookback = 10) {
  if (!Array.isArray(obvSeries) || obvSeries.length < 2) return 'flat';
  const effectiveLookback = Math.min(lookback, obvSeries.length - 1);
  const recent = obvSeries.slice(-effectiveLookback - 1);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  if (pctChange > 5) return 'rising';
  if (pctChange < -5) return 'falling';
  return 'flat';
}

/**
 * Pull the last N daily closes for the NEPSE index itself
 */
async function getIndexCloses(days = 60, memoryCloses = null) {
  if (Array.isArray(memoryCloses) && memoryCloses.length >= 10) {
    return memoryCloses.slice(-days);
  }
  if (!pool) {
    return [];
  }
  try {
    const { rows } = await pool.query(
      `SELECT close_price, trade_date
       FROM index_price_history
       WHERE symbol = 'NEPSE'
       ORDER BY trade_date DESC
       LIMIT $1`,
      [days]
    );
    if (rows && rows.length >= 10) {
      return rows.reverse().map((r) => Number(r.close_price));
    }

    const fallback = await pool.query(
      `SELECT d.closing_price, d.traded_date
       FROM daily_price_history d
       JOIN securities s ON s.security_id = d.security_id
       WHERE s.symbol = 'NEPSE'
       ORDER BY d.traded_date DESC
       LIMIT $1`,
      [days]
    );
    if (fallback.rows && fallback.rows.length >= 10) {
      return fallback.rows.reverse().map((r) => Number(r.closing_price));
    }
    return [];
  } catch (_) {
    return [];
  }
}

/**
 * Computes rolling 20-day index turnover ratio rather than dividing by static 4.5 Arba.
 */
async function getIndexTurnoverStats(memorySummary = null, memoryHistory = null) {
  if (Array.isArray(memoryHistory) && memoryHistory.length >= 5) {
    const turnovers = memoryHistory.map(d => Number(d.turnover || d.turnoverValue || 0)).filter(t => t > 0);
    if (turnovers.length >= 5) {
      const today = turnovers[turnovers.length - 1];
      const lookback = Math.min(20, turnovers.length);
      const sma = turnovers.slice(-lookback).reduce((a, b) => a + b, 0) / lookback;
      const ratio = sma > 0 ? +(today / sma).toFixed(2) : 1.0;
      return { turnoverRatio: ratio, rollingAvgTurnover: sma, todayTurnover: today };
    }
  }
  if (memorySummary?.totalTurnover) {
    // Normal NEPSE daily turnover ranges between 3.5B and 5.5B
    const ratio = +(memorySummary.totalTurnover / 4200000000).toFixed(2);
    return { turnoverRatio: Math.max(0.4, Math.min(2.5, ratio || 1.0)), rollingAvgTurnover: 4200000000, todayTurnover: memorySummary.totalTurnover };
  }
  return { turnoverRatio: 1.0, rollingAvgTurnover: 4000000000, todayTurnover: 4000000000 };
}

/** Advance/decline ratio from today's live-trading snapshot */
async function getAdvanceDeclineRatio(date, memorySummary = null) {
  if (memorySummary?.advances && memorySummary?.declines) {
    return +(Number(memorySummary.advances) / Math.max(1, Number(memorySummary.declines))).toFixed(2);
  }
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE change_pct > 0) AS advances,
         COUNT(*) FILTER (WHERE change_pct < 0) AS declines
       FROM live_trading_snapshot
       WHERE trade_date = $1`,
      [date]
    );
    const { advances, declines } = rows[0] || { advances: 0, declines: 0 };
    const d = Number(declines) || 1;
    return Number((Number(advances) / d).toFixed(2));
  } catch (_) {
    return null;
  }
}

/**
 * Market-Cap Weighted Sector Breadth
 * Commercial Banks (32%), Hydropower (20%), Insurance (14%), etc.
 */
const SECTOR_MARKET_CAP_WEIGHTS = {
  'banking': 0.32,
  'commercial banks': 0.32,
  'bank': 0.32,
  'hydropower': 0.20,
  'hydro': 0.20,
  'life insurance': 0.08,
  'non life insurance': 0.06,
  'development bank': 0.06,
  'development banks': 0.06,
  'microfinance': 0.08,
  'finance': 0.04,
  'manufacturing': 0.04,
  'manufacturing and processing': 0.04,
  'hotels': 0.02,
  'hotels and tourism': 0.02,
  'investment': 0.04,
  'others': 0.04,
  'mutual fund': 0.02,
  'trading': 0.01
};

async function getSectorBreadth(date, memoryIndices = null) {
  if (Array.isArray(memoryIndices) && memoryIndices.length > 0) {
    const sectors = {};
    let unweightedUp = 0;
    let weightedScore = 0;
    let totalWeightCounted = 0;
    let positiveWeight = 0;

    memoryIndices.forEach((idx) => {
      const name = String(idx.sector || idx.indexName || idx.name || '').toLowerCase().trim();
      const pChg = Number(idx.pChange ?? idx.percentageChange ?? 0);
      sectors[idx.sector || idx.indexName || idx.name] = pChg;
      if (pChg > 0) unweightedUp++;

      let weight = 0.04;
      for (const [k, w] of Object.entries(SECTOR_MARKET_CAP_WEIGHTS)) {
        if (name.includes(k)) {
          weight = w;
          break;
        }
      }

      totalWeightCounted += weight;
      if (pChg > 0) positiveWeight += weight;
      const cappedChange = Math.max(-3.0, Math.min(3.0, pChg));
      weightedScore += (cappedChange / 3.0) * weight;
    });

    const normPositiveWeight = totalWeightCounted > 0 ? positiveWeight / totalWeightCounted : 0.5;
    const normWeightedScore = totalWeightCounted > 0 ? weightedScore / totalWeightCounted : 0;

    return {
      breadthPct: +(unweightedUp / memoryIndices.length).toFixed(2),
      weightedBreadthPct: +normPositiveWeight.toFixed(2),
      weightedBreadthScore: +normWeightedScore.toFixed(3),
      sectors
    };
  }
  return { breadthPct: 0.5, weightedBreadthPct: 0.5, weightedBreadthScore: 0, sectors: {} };
}

/**
 * Evaluates Divergence between Headline NEPSE and Float / Sensitive Float Indices.
 * Based on Section 2.1 & 4.4 of NEPSE Predictor App Documentation:
 * Identifies whether an index move is genuine broad-market buying or skewed by locked promoter/state holdings.
 */
export function computeFloatDivergence(memoryIndices = [], headlinePChange = 0) {
  if (!Array.isArray(memoryIndices) || memoryIndices.length === 0) {
    return {
      divergenceDetected: false,
      signal: 'neutral',
      scoreModifier: 0.0,
      headlinePChange,
      floatPChange: null,
      sensitiveFloatPChange: null,
      explanation: 'Float index data currently syncing.'
    };
  }

  let floatIdx = null;
  let sensFloatIdx = null;

  for (const idx of memoryIndices) {
    const name = String(idx.indexName || idx.name || idx.index || idx.sector || '').toLowerCase().trim();
    const pChg = Number(idx.pChange ?? idx.percentageChange ?? idx.changePercent ?? 0);
    if (name.includes('sensitive float') || name.includes('senfloat')) {
      sensFloatIdx = { name: idx.name || 'Sensitive Float', pChange: pChg, value: Number(idx.value || idx.currentValue || 0) };
    } else if (name.includes('float')) {
      floatIdx = { name: idx.name || 'Float Index', pChange: pChg, value: Number(idx.value || idx.currentValue || 0) };
    }
  }

  const fChg = floatIdx ? floatIdx.pChange : null;
  const sfChg = sensFloatIdx ? sensFloatIdx.pChange : null;

  let divergenceDetected = false;
  let signal = 'neutral';
  let scoreModifier = 0.0;
  let explanation = '';

  if (headlinePChange > 0.4 && fChg !== null && fChg <= 0.05) {
    // Bearish / Promoter Distortion Divergence
    divergenceDetected = true;
    signal = 'promoter_distortion_drag';
    scoreModifier = -0.20;
    explanation = `Promoter Skew Divergence: Headline NEPSE gained +${headlinePChange.toFixed(2)}%, but Float Index was flat (${fChg.toFixed(2)}%). Rally is skewed by locked large-caps rather than broad market accumulation.`;
  } else if (headlinePChange > 0.3 && fChg !== null && fChg >= headlinePChange * 0.8 && sfChg !== null && sfChg >= 0.3) {
    // Confirmed Institutional Accumulation
    signal = 'institutional_accumulation_confirmed';
    scoreModifier = +0.15;
    explanation = `Institutional Accumulation Confirmed: Sensitive Float (+${sfChg.toFixed(2)}%) and Float Index (+${fChg.toFixed(2)}%) confirm genuine broad-market buying.`;
  } else if (headlinePChange < -0.4 && fChg !== null && fChg >= -0.05) {
    // Selective Float Resilience
    signal = 'promoter_drag_cushion';
    scoreModifier = +0.10;
    explanation = `Selective Float Resilience: Despite headline index drop (-${Math.abs(headlinePChange).toFixed(2)}%), free-float equities displayed relative strength (${fChg >= 0 ? '+' : ''}${fChg.toFixed(2)}%).`;
  } else {
    explanation = `Headline NEPSE and free-float index are moving in normal correlation (Float: ${fChg !== null ? `${fChg >= 0 ? '+' : ''}${fChg.toFixed(2)}%` : 'N/A'}).`;
  }

  return {
    divergenceDetected,
    signal,
    scoreModifier,
    headlinePChange: +headlinePChange.toFixed(2),
    floatPChange: fChg !== null ? +fChg.toFixed(2) : null,
    sensitiveFloatPChange: sfChg !== null ? +sfChg.toFixed(2) : null,
    explanation
  };
}

/**
 * Calendar & Fiscal Cycle Evaluation for Nepal Capital Market
 */
export function computeFiscalCycle(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1 = Jan ... 12 = Dec
  const day = d.getDate();

  // 1. Ashadh/Shrawan Wave (Mid-June to Mid-August): Massive Govt Development Budget Release
  if ((month === 6 && day >= 15) || month === 7 || (month === 8 && day <= 15)) {
    return {
      phase: 'Ashadh-Shrawan Government Spending Wave',
      scoreBonus: +0.25,
      bias: 'bullish',
      detail: 'Tens of billions of development budget released into banking accounts, lowering interbank rates and fueling post-fiscal liquidity surge.'
    };
  }

  // 2. Poush/Magh Q2 Corporate Tax Drain (Mid-Dec to Mid-Feb): 40% Advance Tax Paid
  if ((month === 12 && day >= 15) || month === 1 || (month === 2 && day <= 10)) {
    return {
      phase: 'Q2 Advance Corporate Tax Liquidity Drain',
      scoreBonus: -0.20,
      bias: 'bearish',
      detail: 'Corporates remit 40% advance tax to government treasury, temporarily withdrawing Rs. 40–60 Arba from bank deposits and tightening credit.'
    };
  }

  // 3. Festive Pre-Dashain Cash Withdrawal (Bhadra/Ashwin - approx Sept to Oct)
  if (month === 9 || (month === 10 && day <= 20)) {
    return {
      phase: 'Festive Season Cash Outflow Cycle',
      scoreBonus: -0.10,
      bias: 'neutral_defensive',
      detail: 'Public withdrawals for Dashain/Tihar festival bonuses and travel temporarily tighten banking reserves and reduce market turnover velocity.'
    };
  }

  // 4. Spring / Pre-Monetary Review (April - May)
  if (month === 4 || month === 5) {
    return {
      phase: 'Spring Capital Expansion Phase',
      scoreBonus: +0.10,
      bias: 'bullish',
      detail: 'Commercial banks active in credit deployment; speculative pre-monetary policy positioning.'
    };
  }

  return {
    phase: 'Mid-Fiscal Consolidation Phase',
    scoreBonus: 0.0,
    bias: 'neutral',
    detail: 'Balanced fiscal liquidity flows without seasonal tax or budget concentration.'
  };
}

/**
 * 14-day Average True Range (ATR) for the NEPSE Index
 */
export function computeIndexATR(history, period = 14) {
  if (!Array.isArray(history) || history.length < period + 1) return 32.0;
  const trs = [];
  for (let i = 1; i < history.length; i++) {
    const h = Number(history[i].high || history[i].close || 0);
    const l = Number(history[i].low || history[i].close || 0);
    const prevC = Number(history[i - 1].close || 0);
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    if (tr > 0) trs.push(tr);
  }
  if (trs.length < 5) return 32.0;
  const recent = trs.slice(-period);
  return +(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1);
}

/** Aggregate recent news sentiment + flag NRB/political news spikes
 *  Priority: DB → in-memory newsCache (scraped) → hardcoded defaults
 */
async function getSentimentFeatures(hours = 24) {
  // 1. Try DB
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT sentiment_score, category
         FROM news_sentiment
         WHERE published_at >= NOW() - ($1 || ' hours')::interval`,
        [hours]
      );
      if (rows.length > 0) {
        const avgSentiment = rows.reduce((a, r) => a + Number(r.sentiment_score || 0), 0) / rows.length;
        const nrbPolicyFlag = rows.some((r) => r.category === 'nrb_policy');
        const politicalNewsVolume = rows.filter((r) => r.category === 'political').length;
        return { avgSentiment: +avgSentiment.toFixed(3), nrbPolicyFlag, politicalNewsVolume, sampleSize: rows.length };
      }
    } catch (_) {}
  }

  // 2. Use in-memory scraped news cache
  if (hasNewsCache()) {
    const items = getNewsCache(50);
    const avgSentiment = items.reduce((a, r) => a + Number(r.sentiment_score || 0), 0) / items.length;
    const nrbPolicyFlag = items.some((r) => r.category === 'nrb_policy');
    const politicalNewsVolume = items.filter((r) => r.category === 'political').length;
    return { avgSentiment: +avgSentiment.toFixed(3), nrbPolicyFlag, politicalNewsVolume, sampleSize: items.length };
  }

  // 3. Authentic state: Return 0 when no sentiment data is ingested
  return { avgSentiment: 0.0, nrbPolicyFlag: false, politicalNewsVolume: 0, sampleSize: 0, status: 'no_data' };
}

/**
 * Macro features from NRB releases.
 * Priority: DB → in-memory macroCache (scraped) → baseline fallback defaults
 */
export async function getMacroFeatures() {
  const baseline = getMacroCache();

  // 1. Try DB
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT indicator, value, as_of_date
         FROM macro_indicators
         WHERE indicator IN ('m2_growth_pct','interest_rate_pct','cpi_inflation_pct',
                              'npr_usd_rate','remittance_growth_pct','cd_ratio_pct','interbank_rate_pct')
         ORDER BY as_of_date DESC`
      );
      if (rows.length > 0) {
        const latest = {
          ...baseline,
          status: 'live_db'
        };
        for (const r of rows) {
          if (r.indicator && Number.isFinite(Number(r.value))) {
            latest[r.indicator] = Number(r.value);
          }
        }
        return latest;
      }
    } catch (_) {}
  }

  // 2. Use in-memory macro cache (scraped if available, otherwise baseline fallback so widget never flashes NRB Offline)
  return {
    ...baseline,
    status: hasMacroCache() ? 'scraped_cache' : 'baseline_fallback'
  };
}

/**
 * Manually-flagged political/event days
 */
export async function getPoliticalEventFlag(date = new Date().toISOString().slice(0, 10)) {
  const defaultEvent = {
    flagged: false,
    severity: 1,
    description: ['Market operating in stable regulatory environment.']
  };
  if (!pool) return defaultEvent;
  try {
    const { rows } = await pool.query(
      `SELECT severity, description FROM political_event_flags WHERE event_date = $1`,
      [date]
    );
    if (rows.length === 0) return defaultEvent;
    const maxSeverity = Math.max(...rows.map((r) => Number(r.severity)));
    return { flagged: true, severity: maxSeverity, description: rows.map((r) => r.description) };
  } catch (_) {
    return defaultEvent;
  }
}

/**
 * Main entry point: compute the full feature set used by indexPredictor
 * for a given trading date.
 */
export async function computeIndexFeatures(options = {}) {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const memoryHistory = options.memoryHistory || null;
  let memoryCloses = options.memoryCloses || null;
  if (!memoryCloses && Array.isArray(memoryHistory) && memoryHistory.length >= 10) {
    memoryCloses = memoryHistory.map(d => Number(d.close || d.closePrice || 0)).filter(c => c > 0);
  }
  const memorySummary = options.memorySummary || null;
  const memoryIndices = options.memoryIndices || null;

  // Request up to 220 closes for reliable 50 and 200 EMA
  const closes = await getIndexCloses(220, memoryCloses);
  const latestClose = closes.length > 0 ? closes[closes.length - 1] : Number(memorySummary?.currentValue || memorySummary?.nepseIndex || 0);
  if (latestClose <= 0) {
    return {
      date,
      status: 'insufficient_history',
      error: 'No authentic live or historical index close available'
    };
  }

  const rsi14 = closes.length >= 15 ? computeRSI(closes, 14) : null;
  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);

  const ma20DeviationPct = ema20 ? Number((((latestClose - ema20) / ema20) * 100).toFixed(2)) : 0;
  const isAbove20EMA = ema20 ? latestClose >= ema20 : null;
  const isAbove50EMA = ema50 ? latestClose >= ema50 : null;
  const isAbove200EMA = ema200 ? latestClose >= ema200 : null;
  const goldenCross = (ema50 && ema200) ? ema50 >= ema200 : null;
  const macdSignal = computeMACDSignal(closes);

  const turnoverStats = await getIndexTurnoverStats(memorySummary, memoryHistory);
  const advanceDeclineRatio = await getAdvanceDeclineRatio(date, memorySummary);
  const breadthStats = await getSectorBreadth(date, memoryIndices);
  const sentiment = await getSentimentFeatures(24);
  const macro = await getMacroFeatures();
  const politicalEvent = await getPoliticalEventFlag(date);
  const fiscalCycle = computeFiscalCycle(date);
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : (latestClose - Number(memorySummary?.pointChange || memorySummary?.change || 0));
  const headlinePChange = prevClose > 0 ? ((latestClose - prevClose) / prevClose) * 100 : Number(memorySummary?.percentageChange || memorySummary?.pChange || 0);
  const floatDivergence = computeFloatDivergence(memoryIndices, headlinePChange);
  const indexAtr = computeIndexATR(memoryHistory || closes.map(c => ({ high: c, low: c, close: c })), 14);

  return {
    date,
    latest_close: latestClose,
    prev_close: prevClose,
    headline_p_change: headlinePChange,
    rsi_14: rsi14,
    ema_20: ema20,
    ema_50: ema50,
    ema_200: ema200,
    ma_20_deviation_pct: ma20DeviationPct,
    is_above_20_ema: isAbove20EMA,
    is_above_50_ema: isAbove50EMA,
    is_above_200_ema: isAbove200EMA,
    golden_cross: goldenCross,
    macd_signal: macdSignal,
    turnover_ratio_vs_20d_avg: turnoverStats.turnoverRatio,
    rolling_avg_turnover: turnoverStats.rollingAvgTurnover,
    today_turnover: turnoverStats.todayTurnover,
    advance_decline_ratio: advanceDeclineRatio,
    sector_breadth_pct: breadthStats.breadthPct,
    weighted_breadth_pct: breadthStats.weightedBreadthPct,
    weighted_breadth_score: breadthStats.weightedBreadthScore,
    sector_detail: breadthStats.sectors,
    float_divergence: floatDivergence,
    fiscal_cycle: fiscalCycle,
    index_atr: indexAtr,
    sentiment_24h_avg: sentiment.avgSentiment,
    nrb_policy_flag: sentiment.nrbPolicyFlag,
    political_news_volume: sentiment.politicalNewsVolume,
    sentiment_sample_size: sentiment.sampleSize,
    m2_growth_pct: macro.m2_growth_pct,
    interest_rate_pct: macro.interest_rate_pct,
    cpi_inflation_pct: macro.cpi_inflation_pct,
    npr_usd_rate: macro.npr_usd_rate,
    remittance_growth_pct: macro.remittance_growth_pct,
    political_event_flagged: politicalEvent.flagged,
    political_event_severity: politicalEvent.severity,
  };
}

/**
 * Per-stock feature computation for the momentum screener.
 */
export async function computeStockFeatures(symbol, days = 30, stockData = null) {
  if (!symbol) return null;
  const sym = String(symbol).toUpperCase().trim();

  // If stockData object passed directly from live trading cache
  if (stockData && stockData.ltp) {
    const ltp = Number(stockData.ltp || stockData.closePrice || 100);
    const pChange = Number(stockData.pChange || stockData.percentageChange || 0);
    const volume = Number(stockData.volume || stockData.totalTradedQuantity || 0);

    // Retrieve authentic historical closes from DB (Postgres or SQLite ledgerStore)
    let histCloses = [];
    let histVolumes = [];
    if (pool) {
      try {
        const { rows: histRows } = await pool.query(
          `SELECT d.close_price, d.total_volume FROM daily_price_history d
           JOIN securities s ON s.security_id = d.security_id
           WHERE s.symbol = $1 ORDER BY d.traded_date DESC LIMIT 60`,
          [sym]
        );
        if (histRows && histRows.length > 0) {
          const rev = histRows.reverse();
          histCloses = rev.map(r => Number(r.close_price));
          histVolumes = rev.map(r => Number(r.total_volume || 0));
        }
      } catch (_) {}
    }

    if (histCloses.length === 0 && db) {
      try {
        const rows = db.prepare(
          `SELECT close_price, total_volume FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 60`
        ).all(sym);
        if (rows && rows.length > 0) {
          const rev = rows.reverse();
          histCloses = rev.map(r => Number(r.close_price));
          histVolumes = rev.map(r => Number(r.total_volume || 0));
        }
      } catch (_) {}
    }

    let volumeSurgeRatio = Number(stockData.volumeSurgeRatio || 0);
    if (!volumeSurgeRatio && histVolumes.length >= 5) {
      const hist20 = histVolumes.slice(-21, -1);
      const avgVol20 = hist20.reduce((a, b) => a + b, 0) / Math.max(1, hist20.length);
      volumeSurgeRatio = (avgVol20 > 0 && volume > 0) ? Number((volume / avgVol20).toFixed(2)) : 1.0;
    } else if (!volumeSurgeRatio) {
      volumeSurgeRatio = 1.0;
    }

    // Attempt real RSI from DB price history; return null if insufficient
    let rsi14 = Number(stockData.rsi || 0);
    if (!rsi14 || Math.abs(rsi14 - 50) < 0.1) {
      if (histCloses.length >= 15) {
        rsi14 = computeRSI(histCloses, Math.min(14, histCloses.length - 1));
      } else {
        rsi14 = null; // Authentic missing data
      }
    }

    // Authentic momentum and MACD calculated from verified history without synthetic multipliers
    let momentum5d = null;
    if (histCloses.length >= 6) {
      momentum5d = Number((((histCloses[histCloses.length - 1] - histCloses[histCloses.length - 6]) / histCloses[histCloses.length - 6]) * 100).toFixed(2));
    }
    const macdSignal = histCloses.length >= 20 ? computeMACDSignal(histCloses) : 'neutral';
    
    let obvTrend = 'flat';
    if (histCloses.length >= 10 && histVolumes.length >= 10) {
      const obvSeries = computeOBV(histCloses, histVolumes);
      obvTrend = classifyOBVTrend(obvSeries, Math.min(10, obvSeries.length - 1));
    } else {
      obvTrend = volumeSurgeRatio > 1.2 && pChange >= 0 ? 'rising' : (pChange < -1 ? 'falling' : 'flat');
    }
    const avgTurnover5d = Number(stockData.turnover || (ltp * volume));

    // ── EMA 50 Structural Calculation ──────────────────────────────────────
    let ema50 = Number(stockData.ema50 || stockData.sma50 || 0);
    if (!ema50 && histCloses.length >= 15) {
      ema50 = computeEMA(histCloses, Math.min(50, histCloses.length));
    }
    const isAbove50EMA = ema50 > 0 ? ltp >= ema50 : null;

    return {
      symbol: sym,
      ltp,
      volume_surge_ratio: volumeSurgeRatio,
      momentum_5d: momentum5d,
      rsi_14: rsi14,
      macd_signal: macdSignal,
      obv_trend: obvTrend,
      avg_turnover_5d: avgTurnover5d,
      corporate_action_flag: stockData.corporateAction || stockData.corporate_action_flag ||
        (Number(stockData.dividendYield || stockData.divYield || 0) > 0 || Number(stockData.bonusShare || stockData.bonus || 0) > 0 || Number(stockData.rightShare || 0) > 0 ? 'dividend_or_bonus' : null),
      ema50,
      is_above_50_ema: isAbove50EMA,
    };
  }

  // Standalone query: try PostgreSQL first, then SQLite ledgerStore
  let ordered = [];
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT d.close_price, d.total_volume AS volume, d.traded_date AS trade_date
         FROM daily_price_history d
         JOIN securities s ON s.security_id = d.security_id
         WHERE s.symbol = $1
         ORDER BY d.traded_date DESC
         LIMIT $2`,
        [sym, Math.max(days, 60)]
      );
      if (rows && rows.length >= 5) {
        ordered = rows.reverse();
      }
    } catch (_) {}
  }

  if (ordered.length === 0 && db) {
    try {
      const rows = db.prepare(
        `SELECT close_price, total_volume AS volume, trade_date
         FROM daily_stock_summary
         WHERE symbol = ?
         ORDER BY trade_date DESC
         LIMIT ?`
      ).all(sym, Math.max(days, 60));
      if (rows && rows.length >= 5) {
        ordered = rows.reverse();
      }
    } catch (_) {}
  }

  if (ordered.length < 5) return null;

  try {
    const closes = ordered.map((r) => Number(r.close_price));
    const volumes = ordered.map((r) => Number(r.volume));

    const todayVolume = volumes[volumes.length - 1];
    const avg20Volume =
      volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.max(volumes.slice(-21, -1).length, 1);
    const volumeSurgeRatio = avg20Volume > 0 ? Number((todayVolume / avg20Volume).toFixed(2)) : 1;

    const momentum5d =
      closes.length >= 6
        ? Number((((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100).toFixed(2))
        : 0;

    const rsi14 = computeRSI(closes, Math.min(14, closes.length - 1));
    const macdSignal = computeMACDSignal(closes);

    const obvSeries = computeOBV(closes, volumes);
    const obvTrend = classifyOBVTrend(obvSeries, Math.min(10, obvSeries.length - 1));

    const avgTurnover5d =
      ordered.slice(-5).reduce((a, r) => a + Number(r.close_price) * Number(r.volume), 0) / 5;

    const ema50 = computeEMA(closes, Math.min(50, closes.length));
    const isAbove50EMA = ema50 > 0 ? (closes[closes.length - 1] >= ema50) : null;

    let corporateAction = null;
    try {
      const { rows: caRows } = await pool.query(
        `SELECT action_type FROM corporate_actions WHERE symbol = $1 ORDER BY announced_date DESC LIMIT 1`,
        [sym]
      );
      if (caRows.length > 0) corporateAction = caRows[0].action_type;
    } catch (_) {}

    return {
      symbol: sym,
      ltp: closes[closes.length - 1],
      volume_surge_ratio: volumeSurgeRatio,
      momentum_5d: momentum5d,
      rsi_14: rsi14,
      macd_signal: macdSignal,
      obv_trend: obvTrend,
      avg_turnover_5d: avgTurnover5d,
      corporate_action_flag: corporateAction,
      ema50,
      is_above_50_ema: isAbove50EMA,
    };
  } catch (_) {
    return null;
  }
}
