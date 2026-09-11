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

async function getIndexTurnoverStats(memorySummary = null) {
  if (memorySummary?.totalTurnover) {
    return { turnoverRatio: +(memorySummary.totalTurnover / 4500000000).toFixed(2) || 1.12 };
  }
  if (!pool) return { turnoverRatio: 1.15 };
  try {
    const { rows } = await pool.query(
      `SELECT trade_date, turnover
       FROM index_price_history
       WHERE symbol = 'NEPSE'
       ORDER BY trade_date DESC
       LIMIT 6`
    );
    if (rows.length < 6) return { turnoverRatio: 1 };
    const today = Number(rows[0].turnover);
    const avg5 = rows.slice(1, 6).reduce((a, r) => a + Number(r.turnover), 0) / 5;
    return { turnoverRatio: avg5 > 0 ? today / avg5 : 1 };
  } catch (_) {
    return { turnoverRatio: 1.15 };
  }
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

/** Sector breadth: % of sub-indices that are up today */
async function getSectorBreadth(date, memoryIndices = null) {
  if (Array.isArray(memoryIndices) && memoryIndices.length > 0) {
    const sectors = {};
    let up = 0;
    memoryIndices.forEach((idx) => {
      const pChg = Number(idx.pChange ?? idx.percentageChange ?? 0);
      sectors[idx.sector || idx.indexName || idx.name] = pChg;
      if (pChg > 0) up++;
    });
    return { breadthPct: +(up / memoryIndices.length).toFixed(2), sectors };
  }
  if (!pool) {
    return { breadthPct: 0, sectors: {} };
  }
  try {
    const { rows } = await pool.query(
      `SELECT sector, change_pct FROM sector_index_snapshot WHERE trade_date = $1`,
      [date]
    );
    if (rows.length === 0) throw new Error('No DB sector data');
    const up = rows.filter((r) => Number(r.change_pct) > 0).length;
    const sectors = Object.fromEntries(rows.map((r) => [r.sector, Number(r.change_pct)]));
    return { breadthPct: +(up / rows.length).toFixed(2), sectors };
  } catch (_) {
    return { breadthPct: 0, sectors: {} };
  }
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
  const memoryCloses = options.memoryCloses || null;
  const memorySummary = options.memorySummary || null;
  const memoryIndices = options.memoryIndices || null;

  const closes = await getIndexCloses(60, memoryCloses);
  const rsi14 = computeRSI(closes, 14);
  const ema20 = computeEMA(closes, 20);
  const latestClose = closes[closes.length - 1];
  const maDeviationPct = ema20 ? Number((((latestClose - ema20) / ema20) * 100).toFixed(2)) : 0;
  const macdSignal = computeMACDSignal(closes);

  const { turnoverRatio } = await getIndexTurnoverStats(memorySummary);
  const advanceDeclineRatio = await getAdvanceDeclineRatio(date, memorySummary);
  const { breadthPct, sectors } = await getSectorBreadth(date, memoryIndices);
  const sentiment = await getSentimentFeatures(24);
  const macro = await getMacroFeatures();
  const politicalEvent = await getPoliticalEventFlag(date);

  return {
    date,
    latest_close: latestClose,
    rsi_14: rsi14,
    ma_20_deviation_pct: maDeviationPct,
    macd_signal: macdSignal,
    turnover_ratio_vs_5d_avg: turnoverRatio,
    advance_decline_ratio: advanceDeclineRatio,
    sector_breadth_pct: breadthPct,
    sector_detail: sectors,
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

    return {
      symbol: sym,
      ltp,
      volume_surge_ratio: volumeSurgeRatio,
      momentum_5d: momentum5d,
      rsi_14: rsi14,
      macd_signal: macdSignal,
      obv_trend: obvTrend,
      avg_turnover_5d: avgTurnover5d,
      corporate_action_flag: stockData.corporateAction || null,
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
      [sym, days]
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

    return {
      symbol: sym,
      ltp: closes[closes.length - 1],
      volume_surge_ratio: volumeSurgeRatio,
      momentum_5d: momentum5d,
      rsi_14: rsi14,
      macd_signal: macdSignal,
      obv_trend: obvTrend,
      avg_turnover_5d: avgTurnover5d,
      corporate_action_flag: null,
    };
  } catch (_) {
    return null;
  }
}
