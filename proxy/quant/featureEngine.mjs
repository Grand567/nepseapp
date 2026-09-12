// proxy/quant/featureEngine.mjs
//
// Shared feature computation for both the index predictor and stock screener.
// Reuses whatever price-history / floorsheet tables already exist in db.mjs —
// this module does NOT scrape anything itself, it only reads/derives.
//
// Expects `pool` to be the existing pg Pool exported from proxy/db.mjs,
// with safe fallback when running in lightweight memory mode.

import { pool } from '../db.mjs';
import { getMacroCache, hasMacroCache } from './macroCache.mjs';
import { getNewsCache, hasNewsCache } from './newsCache.mjs';

/**
 * Simple RSI (Wilder's smoothing) over a closing-price series.
 * @param {number[]} closes - oldest -> newest
 * @param {number} period
 */
export function computeRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

/** Exponential moving average */
export function computeEMA(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return closes?.[closes.length - 1] || null;
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
    if (rows.length < 10) throw new Error('Not enough DB index history');
    return rows.reverse().map((r) => Number(r.close_price));
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

  // 3. Hardcoded baseline
  return { avgSentiment: 0.28, nrbPolicyFlag: true, politicalNewsVolume: 3, sampleSize: 14 };
}

/**
 * Macro features from NRB releases.
 * Priority: DB → in-memory macroCache (scraped) → hardcoded defaults
 */
export async function getMacroFeatures() {
  const defaults = {
    m2_growth_pct: 12.8,
    interest_rate_pct: 5.5,
    cpi_inflation_pct: 4.25,
    npr_usd_rate: 134.8,
    remittance_growth_pct: 16.4,
  };

  // 1. Try DB
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT indicator, value, as_of_date
         FROM macro_indicators
         WHERE indicator IN ('m2_growth_pct','interest_rate_pct','cpi_inflation_pct',
                              'npr_usd_rate','remittance_growth_pct')
         ORDER BY as_of_date DESC`
      );
      if (rows.length > 0) {
        const latest = { ...defaults };
        for (const r of rows) {
          if (r.indicator) latest[r.indicator] = Number(r.value);
        }
        return latest;
      }
    } catch (_) {}
  }

  // 2. Use in-memory macro cache (populated by server.mjs scraper)
  if (hasMacroCache()) {
    return getMacroCache();
  }

  // 3. Hardcoded defaults
  return defaults;
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
  const latestClose = closes.length > 0 ? closes[closes.length - 1] : 2650;
  const rsi14 = computeRSI(closes, 14);
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
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : latestClose;
  const headlinePChange = prevClose > 0 ? ((latestClose - prevClose) / prevClose) * 100 : Number(memorySummary?.percentageChange || memorySummary?.pChange || 0);
  const floatDivergence = computeFloatDivergence(memoryIndices, headlinePChange);
  const indexAtr = computeIndexATR(memoryHistory || closes.map(c => ({ high: c, low: c, close: c })), 14);

  return {
    date,
    latest_close: latestClose,
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
    const volume = Number(stockData.volume || stockData.totalTradedQuantity || 10000);
    const volumeSurgeRatio = Number(stockData.volumeSurgeRatio || (volume > 20000 ? 1.45 : 0.95));
    // Attempt real RSI from DB price history; fall back to pChange estimate
    let rsi14 = Number(stockData.rsi || 0);
    if (!rsi14 || Math.abs(rsi14 - 50) < 0.1) {
      // stockData.rsi is absent or the approximated 50 default — try DB
      if (pool) {
        try {
          const { rows: histRows } = await pool.query(
            `SELECT close_price FROM stock_price_history
             WHERE symbol = $1 ORDER BY trade_date DESC LIMIT 20`,
            [sym]
          );
          if (histRows.length >= 15) {
            const closes = histRows.reverse().map(r => Number(r.close_price));
            rsi14 = computeRSI(closes, Math.min(14, closes.length - 1));
          }
        } catch (_) {}
      }
      if (!rsi14 || Math.abs(rsi14 - 50) < 0.1) {
        // Final fallback: pChange-based approximation
        rsi14 = Math.max(10, Math.min(90, 50 + pChange * 3));
      }
    }
    const macdSignal = pChange > 1.2 ? 'bullish' : pChange < -1.2 ? 'bearish' : 'neutral';
    const obvTrend = volumeSurgeRatio > 1.2 && pChange >= 0 ? 'rising' : (pChange < -1 ? 'falling' : 'flat');
    const momentum5d = +(pChange * 2.2 + (volumeSurgeRatio > 1.5 ? 3 : 0)).toFixed(2);
    const avgTurnover5d = Number(stockData.turnover || (ltp * volume));

    // ── EMA 50 Structural Calculation ──────────────────────────────────────
    let ema50 = Number(stockData.ema50 || stockData.sma50 || 0);
    if (!ema50 && pool) {
      try {
        const { rows: histRows } = await pool.query(
          `SELECT close_price FROM stock_price_history
           WHERE symbol = $1 ORDER BY trade_date DESC LIMIT 60`,
          [sym]
        );
        if (histRows.length >= 15) {
          const closes = histRows.reverse().map(r => Number(r.close_price));
          ema50 = computeEMA(closes, Math.min(50, closes.length));
        }
      } catch (_) {}
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

  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `SELECT close_price, volume, trade_date
       FROM stock_price_history
       WHERE symbol = $1
       ORDER BY trade_date DESC
       LIMIT $2`,
      [sym, Math.max(days, 60)]
    );
    if (rows.length < 5) return null;

    const ordered = rows.reverse();
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
