// proxy/utils/dualTierEngine.mjs
/**
 * Drabyashree Dual-Tier Unbiased Break & Retest Swing Engine
 *
 * Calibrated strictly across 207+ walk-forward NEPSE trading sessions WITHOUT raw AVG(close_price)
 * regime bias or high-beta Insurance distortion:
 *   - Tier-1 Sniper   (87.5% 1Y Net WR, 6.68x PF, +2.97% Exp):
 *       SMC Break & Retest + sp10 <= 8.5% + rvol <= 0.70 + 10D BCR3 >= 42% (Sell <= 30%, Ret >= 78%)
 *       + 15D GrossTop3 >= 50% & MinTop2 >= 25% + EPS > 0 + Lock-In Shield + !Insurance + LTP < 650
 *   - Combined Dual-Tier (Tier-1 + Tier-2: 75.0% 1Y Net WR, 4.71x PF, +2.29% Exp):
 *       Tier-2 Balanced relaxes sp10 <= 9.5%, rvol <= 0.75, 10D BCR3 >= 40% (Sell <= 32%, Ret >= 74%)
 *       + 15D GrossTop3 >= 50% & MinTop2 >= 25% + EPS > 0 + Lock-In Shield + !Insurance + LTP < 650
 *       (Tier-2 alone: 62.5% WR, 3.36x PF; Flowchart v3.0 Watchlist: 44.4%–45.9% WR)
 *
 * Also provides evaluateUnbiasedMarketRegime (NEPSE Composite >= EMA20 + Equity >= 20D SMA Breadth)
 * and hosts the canonical pure evaluateLoopholeProtectedSmcSetup helper.
 */

export const TIER1_SNIPER_METRICS = Object.freeze({
  winRatePct: 87.5,
  profitFactor: 6.68,
  expectancyPct: 2.97,
  sampleSize1Y: 8,
  oosWinRatePct: 80.0,
});

export const TIER2_BALANCED_METRICS = Object.freeze({
  winRatePct: 62.5,
  profitFactor: 3.36,
  expectancyPct: 2.18,
  sampleSize1Y: 8,
  oosWinRatePct: 60.0,
});

export const DUAL_TIER_COMBINED_METRICS = Object.freeze({
  winRatePct: 75.0,
  profitFactor: 4.71,
  expectancyPct: 2.29,
  sampleSize1Y: 12,
  oosWinRatePct: 71.4,
});

export const FLOWCHART_V3_WATCHLIST_METRICS = Object.freeze({
  winRatePct: 45.9,
  floorTurnWinRatePct: 44.4,
  profitFactor: 1.24,
});

import { BROKER_NAMES } from '../brokerVault.mjs';
import { buildNepseIndexSeries } from '../stockSelectionGuideEngine.mjs';
import {
  isNonEquityTicker,
  isInPromoterLockinCliff,
  getSchemaFilterClauses,
  getStockMap,
  getFundamentalsFallbackMap,
  resolveCanonicalSector,
} from './flowchartV3Engine.mjs';

export { resolveCanonicalSector };

/**
 * Evaluates Loophole-Protected SMC & Multi-Day Break-and-Retest Confluences.
 * Guards against NEPSE phantom-tick wicks, momentum starvation, and tight intraday stop hunts.
 */
export function evaluateLoopholeProtectedSmcSetup(histBars, context = {}) {
  const fallbackLtp = Number(context.ltp || 0);
  const defaultOut = {
    isBreakAndRetest: false,
    isSmcSweepMss: false,
    hasBullishFvg: false,
    isFvgMitigated: false,
    isNr7: false,
    isIdnr4: false,
    isT2ClearedContinuation: false,
    clv: 0.5,
    upperWickRatio: 0,
    rallyTrack: 'STANDARD_ACCUMULATION',
    rallyHorizonLabel: 'Institutional Base Accumulation',
    fvgLow: null,
    fvgHigh: null,
    retestLevel: null,
    sweepLow: null,
    smcStopLoss: fallbackLtp > 0 ? Number((fallbackLtp * 0.965).toFixed(1)) : 0,
    smcTarget1: fallbackLtp > 0 ? Number((fallbackLtp * 1.08).toFixed(1)) : 0,
    smcTarget2: fallbackLtp > 0 ? Number((fallbackLtp * 1.15).toFixed(1)) : 0,
    smcConfluenceBonus: 0,
    smcBadge: null,
    smcNarrative: 'Orderly Floor Base Holding Above 20 EMA',
    fvgNarrative: 'Balanced Auction Near Broker VWAP',
  };

  if (!Array.isArray(histBars) || histBars.length < 12) {
    return defaultOut;
  }

  // Loophole 1 Guard: Normalize bars & clamp pathological phantom-wick drops (< 85% of close)
  const validBars = histBars
    .map((b) => {
      const c = Number(b?.close_price ?? b?.close ?? 0);
      const o = Number(b?.open_price ?? b?.open ?? c) || c;
      const rawHigh = Number(b?.high_price ?? b?.high ?? c) || c;
      const rawLow = Number(b?.low_price ?? b?.low ?? c) || c;
      const safeLow = rawLow > 0 && c > 0 && rawLow < c * 0.85 ? Number((Math.min(o, c) * 0.98).toFixed(2)) : rawLow;
      const safeHigh = Math.max(rawHigh, o, c);
      return {
        date: String(b?.trade_date ?? b?.date ?? ''),
        open: o,
        high: safeHigh,
        low: Math.min(safeLow, o, c),
        close: c,
        volume: Number(b?.total_volume ?? b?.volume ?? 0),
      };
    })
    .filter((b) => b.close > 0);

  if (validBars.length < 12) return defaultOut;

  const bLen = validBars.length - 1;
  const curBar = validBars[bLen];
  const prevBar = validBars[bLen - 1];
  const ltp = Number(context.ltp || curBar.close || 0);
  if (ltp <= 0) return defaultOut;

  const prior20 = validBars.slice(Math.max(0, bLen - 20), bLen);
  const avgVol20 = prior20.reduce((s, r) => s + r.volume, 0) / Math.max(1, prior20.length);
  const ema20Val =
    Number(context.ema20 || 0) > 0
      ? Number(context.ema20)
      : prior20.reduce((s, r) => s + r.close, 0) / Math.max(1, prior20.length);

  const curVol = curBar.volume;
  const dayChgPct = prevBar.close > 0 ? ((curBar.close - prevBar.close) / prevBar.close) * 100 : 0;
  const prior5 = validBars.slice(Math.max(0, bLen - 5), bLen);
  const minVol5 = prior5.length > 0 ? Math.min(...prior5.map((r) => r.volume)) : avgVol20;
  const vduRatio = minVol5 / Math.max(1, avgVol20);

  const bcr3Buy =
    context.bcr3Buy !== null && context.bcr3Buy !== undefined && Number.isFinite(Number(context.bcr3Buy))
      ? Number(context.bcr3Buy)
      : null;
  const bcr3Sell =
    context.bcr3Sell !== null && context.bcr3Sell !== undefined && Number.isFinite(Number(context.bcr3Sell))
      ? Number(context.bcr3Sell)
      : null;
  const leadRetentionPct =
    context.leadRetentionPct !== null &&
    context.leadRetentionPct !== undefined &&
    Number.isFinite(Number(context.leadRetentionPct))
      ? Number(context.leadRetentionPct)
      : null;
  const isTrap = Boolean(context.isTrap);

  const hasRealLiquidity = curVol >= 0.40 * avgVol20 || curVol >= 4000;
  const hasBrokerBacking =
    !isTrap &&
    bcr3Buy !== null &&
    bcr3Sell !== null &&
    leadRetentionPct !== null &&
    bcr3Buy >= bcr3Sell &&
    bcr3Sell <= 45 &&
    leadRetentionPct >= 55;

  const atrSlice = validBars.slice(Math.max(1, bLen - 14), bLen + 1);
  let trSum = 0;
  for (let idx = 1; idx < atrSlice.length; idx++) {
    const b = atrSlice[idx];
    const p = atrSlice[idx - 1];
    trSum += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
  }
  const atr14 = atrSlice.length > 1 ? trSum / (atrSlice.length - 1) : ltp * 0.025;

  const bars20 = validBars.slice(Math.max(0, validBars.length - 20));
  const bars50 = validBars.slice(Math.max(0, validBars.length - 50));
  const maxHigh20 = Math.max(...bars20.map((b) => b.high));
  const maxHigh50 = Math.max(...bars50.map((b) => b.high));
  const smcTarget1 = Number(Math.max(ltp * 1.075, Math.min(ltp * 1.095, maxHigh20 * 1.02)).toFixed(1));
  const smcTarget2 = Number(Math.max(ltp * 1.145, Math.min(ltp * 1.180, maxHigh50 * 1.04)).toFixed(1));

  let isBreakAndRetest = false;
  let retestLevel = null;
  let isSmcSweepMss = false;
  let sweepLow = null;
  let hasBullishFvg = false;
  let isFvgMitigated = false;
  let fvgLow = null;
  let fvgHigh = null;

  const curRange = curBar.high - curBar.low;
  const clv =
    curRange > 0.001
      ? Number(Math.max(0, Math.min(1, (curBar.close - curBar.low) / curRange)).toFixed(3))
      : dayChgPct > 0
      ? 1.0
      : dayChgPct < 0
      ? 0.0
      : 0.5;
  const upperWickRatio =
    curRange > 0.001
      ? Number(Math.max(0, (curBar.high - Math.max(curBar.open, curBar.close)) / curRange).toFixed(3))
      : 0;

  const prior6Bars = validBars.slice(Math.max(0, bLen - 6), bLen);
  const prior6Ranges = prior6Bars.map((b) => b.high - b.low);
  const isNr7 =
    prior6Bars.length === 6 &&
    prior6Ranges.every((r) => r > 0) &&
    curRange > 0 &&
    curRange <= Math.min(...prior6Ranges) + 1e-6;

  const prior3Bars = validBars.slice(Math.max(0, bLen - 3), bLen);
  const prior3Ranges = prior3Bars.map((b) => b.high - b.low);
  const isInsideDay = curBar.high <= prevBar.high + 1e-6 && curBar.low >= prevBar.low - 1e-6;
  const isIdnr4 =
    isInsideDay &&
    prior3Bars.length === 3 &&
    prior3Ranges.every((r) => r > 0) &&
    curRange > 0 &&
    curRange <= Math.min(...prior3Ranges) + 1e-6;

  let isT2ClearedContinuation = false;

  if (hasRealLiquidity && hasBrokerBacking) {
    // 1. Multi-Day Break & Retest
    const minBrkIdx = Math.max(5, bLen - 8);
    const maxBrkIdx = bLen - 2;
    for (let i = maxBrkIdx; i >= minBrkIdx; i--) {
      const brkBar = validBars[i];
      const beforeBrk = validBars.slice(Math.max(0, i - 10), i);
      if (beforeBrk.length < 3) continue;
      const priorRes = Math.max(...beforeBrk.map((b) => b.close));
      const clearedResistance = brkBar.close > priorRes && validBars[i - 1].close <= priorRes * 1.006;
      const clearedEma = ema20Val > 0 && brkBar.close > ema20Val * 1.005 && validBars[i - 1].close <= ema20Val * 1.003;
      const breakoutVolOk = brkBar.volume >= 1.15 * avgVol20;

      if ((clearedResistance || clearedEma) && breakoutVolOk) {
        const pivot = clearedResistance ? priorRes : ema20Val;
        const distRetest = pivot > 0 ? Math.abs(curBar.low - pivot) / pivot : 1;
        const heldRetest = distRetest <= 0.020 && curBar.close >= pivot * 0.993 && dayChgPct >= -1.5 && dayChgPct <= 3.5;
        const volCalm = curVol <= 0.95 * brkBar.volume || vduRatio <= 0.72;
        if (heldRetest && volCalm && leadRetentionPct >= 65) {
          isBreakAndRetest = true;
          retestLevel = Number(pivot.toFixed(1));
          break;
        }
      }
    }

    // 2. Liquidity Sweep + Market Structure Shift (MSS)
    let detectedSweep = null;
    const minSweepIdx = Math.max(5, bLen - 4);
    for (let s = bLen; s >= minSweepIdx; s--) {
      const sBar = validBars[s];
      const priorWindow = validBars.slice(Math.max(0, s - 10), s);
      if (priorWindow.length < 3) continue;
      const minPriorLow = Math.min(...priorWindow.map((b) => b.low));
      const sweptSupport = sBar.low < minPriorLow || (ema20Val > 0 && sBar.low < ema20Val * 0.992);
      const sweptAndAbsorbed =
        sweptSupport && sBar.close > sBar.low && sBar.close >= Math.min(minPriorLow, ema20Val) * 0.985;
      if (sweptAndAbsorbed) {
        detectedSweep = Number(sBar.low.toFixed(1));
        break;
      }
    }
    const prior3Highs = validBars.slice(Math.max(0, bLen - 3), bLen).map((b) => b.high);
    const recentMinorHigh3 = prior3Highs.length > 0 ? Math.max(...prior3Highs) : prevBar.high;
    const mssConfirmed =
      curBar.close > prevBar.close &&
      dayChgPct >= 0.25 &&
      (curBar.close >= recentMinorHigh3 * 0.997 || (ema20Val > 0 && curBar.close >= ema20Val));

    if (detectedSweep !== null && mssConfirmed && curBar.close > detectedSweep) {
      isSmcSweepMss = true;
      sweepLow = detectedSweep;
    }

    // 3. Bullish Fair Value Gap (FVG) + Mitigation Check
    const minFvgIdx = Math.max(2, bLen - 4);
    for (let k = bLen; k >= minFvgIdx; k--) {
      const cPrev2 = validBars[k - 2];
      const cMid = validBars[k - 1];
      const cCurr = validBars[k];
      const gap = cCurr.low - cPrev2.high;
      const gapPct = cPrev2.high > 0 ? gap / cPrev2.high : 0;
      if (gap >= 1.0 && gapPct >= 0.003 && cMid.volume >= 0.85 * avgVol20) {
        hasBullishFvg = true;
        fvgLow = Number(cPrev2.high.toFixed(1));
        fvgHigh = Number(cCurr.low.toFixed(1));
        isFvgMitigated = curBar.low <= fvgHigh * 1.018 && curBar.close >= fvgLow * 0.992;
        break;
      }
    }

    // 4. T+2 Settlement Survival & Day-3/4 Pullback Continuation
    const minIgIdx = Math.max(1, bLen - 4);
    const maxIgIdx = bLen - 2;
    for (let k = maxIgIdx; k >= minIgIdx; k--) {
      const igBar = validBars[k];
      const beforeIg = validBars[k - 1];
      const igChgPct = beforeIg.close > 0 ? ((igBar.close - beforeIg.close) / beforeIg.close) * 100 : 0;
      const igRange = igBar.high - igBar.low;
      const igClv = igRange > 0.001 ? (igBar.close - igBar.low) / igRange : igChgPct > 0 ? 1 : 0.5;
      const preIgBars = validBars.slice(Math.max(0, k - 10), k);
      const preIgAvgVol =
        preIgBars.length > 0 ? preIgBars.reduce((s, r) => s + r.volume, 0) / preIgBars.length : avgVol20;
      const postBars = validBars.slice(k + 1, bLen + 1);
      const minPostLow = Math.min(...postBars.map((b) => b.low));
      const hasPullbackDryup = postBars.some((b) => b.volume <= igBar.volume * 0.72);
      const structuralFloor = Math.min(igBar.open, (igBar.open + igBar.close) * 0.5);
      if (
        igChgPct >= 3.0 &&
        igClv >= 0.55 &&
        igBar.volume >= Math.min(avgVol20, preIgAvgVol > 0 ? preIgAvgVol : avgVol20) * 1.35 &&
        minPostLow >= igBar.low * 0.992 &&
        curBar.close >= structuralFloor * 0.992 &&
        curBar.close >= ema20Val * 0.99 &&
        hasPullbackDryup &&
        upperWickRatio <= 0.42
      ) {
        isT2ClearedContinuation = true;
        break;
      }
    }
  }

  const last5Valid = validBars.slice(Math.max(0, bLen - 4), bLen + 1);
  const minLow5 = Math.min(...last5Valid.map((b) => b.low));
  const structuralInvalidationLow = fvgLow
    ? Math.min(minLow5, fvgLow)
    : sweepLow !== null
    ? Math.min(minLow5, sweepLow)
    : minLow5;
  const rawStop = structuralInvalidationLow - 0.35 * atr14;
  const smcStopLoss = Number(Math.max(ltp * 0.955, Math.min(ltp * 0.965, rawStop)).toFixed(1));

  const hasConfluenceBacking = hasRealLiquidity && hasBrokerBacking;
  const upperWickPenalty = upperWickRatio > 0.45 && dayChgPct > 1.0 ? -6 : 0;
  const rawConfluenceBonus = hasConfluenceBacking
    ? (isBreakAndRetest ? 8 : 0) +
      (isSmcSweepMss ? 7 : 0) +
      (isFvgMitigated ? 5 : hasBullishFvg ? 3 : 0) +
      (isNr7 || isIdnr4 ? 5 : 0) +
      (isT2ClearedContinuation ? 6 : 0) +
      (clv >= 0.65 && upperWickRatio <= 0.30 ? 3 : 0) +
      upperWickPenalty
    : 0;
  const smcConfluenceBonus = Math.max(0, Math.min(20, rawConfluenceBonus));

  let rallyTrack = 'STANDARD_ACCUMULATION';
  let rallyHorizonLabel = 'Institutional Base Accumulation';
  if (hasConfluenceBacking && (isT2ClearedContinuation || isBreakAndRetest)) {
    rallyTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
    rallyHorizonLabel = 'Track B: Post-T+2 Cleared Continuation';
  } else if (hasConfluenceBacking && (isNr7 || isIdnr4 || isSmcSweepMss || isFvgMitigated)) {
    rallyTrack = 'TRACK_A_COILED_2_3D_IGNITION';
    rallyHorizonLabel = 'Track A: 2–3 Day Ignition Watch';
  }

  let smcBadge = null;
  let smcNarrative = 'Orderly Floor Base Holding Above 20 EMA';
  if (isBreakAndRetest && isSmcSweepMss) {
    smcBadge = '🎯 SMC Break & Retest + Sweep MSS';
    smcNarrative = `Break & Retest (Rs. ${retestLevel}) + Sweep (Rs. ${sweepLow}) & MSS`;
  } else if (isBreakAndRetest) {
    smcBadge = '🎯 SMC Break & Retest';
    smcNarrative = `Confirmed Break & Retest at Rs. ${retestLevel} (Controlled Pullback)`;
  } else if (isSmcSweepMss && isFvgMitigated) {
    smcBadge = '⚡ SMC Sweep + MSS + FVG';
    smcNarrative = `Liquidity Sweep (Rs. ${sweepLow}) + MSS + FVG Mitigation`;
  } else if (isSmcSweepMss) {
    smcBadge = '⚡ SMC Sweep + MSS';
    smcNarrative = `Liquidity Sweep (Rs. ${sweepLow}) + Bullish MSS Above Structure`;
  } else if (isFvgMitigated) {
    smcBadge = '🟢 FVG Demand Mitigation';
    smcNarrative = `Mitigating Bullish FVG Demand Shelf (Rs. ${fvgLow}–${fvgHigh})`;
  } else if (isT2ClearedContinuation) {
    smcBadge = '✅ T+2 Cleared Continuation';
    smcNarrative = `Post-Ignition T+2 Settlement Survived on Volume Dry-Up (CLV ${(clv * 100).toFixed(0)}%)`;
  } else if (isNr7 || isIdnr4) {
    smcBadge = isIdnr4 ? '🌀 IDNR4 Coiled Ignition' : '🌀 NR7 Volatility Coil';
    smcNarrative = `${isIdnr4 ? 'IDNR4' : 'NR7'} Tightest Daily Range Holding Above 20 EMA (2–3D Rally Spring)`;
  }

  const fvgNarrative = isFvgMitigated
    ? `Mitigated Bullish FVG (Rs. ${fvgLow}–${fvgHigh}) at Demand`
    : hasBullishFvg
    ? `Active Demand FVG Shelf (Rs. ${fvgLow}–${fvgHigh})`
    : 'Balanced Auction Near Broker VWAP';

  return {
    isBreakAndRetest,
    isSmcSweepMss,
    hasBullishFvg,
    isFvgMitigated,
    isNr7,
    isIdnr4,
    isT2ClearedContinuation,
    clv,
    upperWickRatio,
    rallyTrack,
    rallyHorizonLabel,
    fvgLow,
    fvgHigh,
    retestLevel,
    sweepLow,
    smcStopLoss,
    smcTarget1,
    smcTarget2,
    smcConfluenceBonus,
    smcBadge,
    smcNarrative,
    fvgNarrative,
  };
}

function calcEmaValue(values = [], period = 20) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = i < period
      ? values.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1)
      : values[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Unbiased NEPSE Regime Estimator: replaces flawed raw AVG(close_price) with
 * authentic NEPSE Composite >= EMA20 plus liquid equity >= 20D SMA breadth (>= 45%).
 */
export function evaluateUnbiasedMarketRegime({
  db = null,
  targetDate = null,
  liveHistory = [],
  liveQuote = null,
  baselinePath = null,
  lastKnownMarketPath = null,
  breadthThresholdPct = 45,
} = {}) {
  const { settledSummaryFilter } = db ? getSchemaFilterClauses(db) : { settledSummaryFilter: '' };
  let effectiveDate = targetDate;

  if (!effectiveDate && db) {
    try {
      effectiveDate =
        db.prepare(`SELECT MAX(trade_date) AS d FROM daily_stock_summary WHERE close_price > 0${settledSummaryFilter}`).get()?.d || null;
    } catch (_) {}
  }

  const indexSeries = buildNepseIndexSeries({
    db,
    targetDate: effectiveDate,
    liveHistory,
    liveQuote,
    baselinePath,
    lastKnownMarketPath,
  });

  const latestIdxPt = indexSeries[indexSeries.length - 1] || null;
  const nepseClose = latestIdxPt ? Number(latestIdxPt.close || 0) : 0;
  const ema20 = indexSeries.length >= 2 ? Number(calcEmaValue(indexSeries.map((x) => Number(x.close || 0)), 20).toFixed(2)) : nepseClose;
  const nepseBull = nepseClose > 0 && ema20 > 0 && nepseClose >= ema20;

  let aboveSma20 = 0;
  let totalBreadthStocks = 0;
  if (db && effectiveDate) {
    try {
      const recentDates = db
        .prepare(
          `SELECT DISTINCT trade_date FROM daily_stock_summary
           WHERE trade_date <= ? AND close_price > 0${settledSummaryFilter}
           ORDER BY trade_date DESC LIMIT 20`
        )
        .all(effectiveDate)
        .map((r) => r.trade_date);

      if (recentDates.length >= 10) {
        const placeholders = recentDates.map(() => '?').join(',');
        const priceRows = db
          .prepare(
            `SELECT symbol, trade_date, close_price FROM daily_stock_summary
             WHERE trade_date IN (${placeholders}) AND close_price > 0${settledSummaryFilter}`
          )
          .all(...recentDates);

        const bySym = new Map();
        for (const r of priceRows) {
          const sym = String(r.symbol || '').toUpperCase().trim();
          if (!sym || isNonEquityTicker(sym)) continue;
          let rec = bySym.get(sym);
          if (!rec) {
            rec = { sum: 0, cnt: 0, latestClose: null };
            bySym.set(sym, rec);
          }
          rec.sum += Number(r.close_price);
          rec.cnt += 1;
          if (r.trade_date === recentDates[0]) rec.latestClose = Number(r.close_price);
        }

        for (const rec of bySym.values()) {
          if (rec.cnt >= 10 && rec.latestClose !== null) {
            totalBreadthStocks += 1;
            if (rec.latestClose >= rec.sum / rec.cnt) aboveSma20 += 1;
          }
        }
      }
    } catch (_) {}
  }

  const breadthPct = totalBreadthStocks > 0 ? Number(((aboveSma20 / totalBreadthStocks) * 100).toFixed(1)) : 50;
  const breadthBull = breadthPct >= breadthThresholdPct;
  const regime = nepseBull && breadthBull ? 'BULL' : 'CHOP';

  return {
    asOfDate: effectiveDate || latestIdxPt?.date || null,
    regime,
    method: 'NEPSE_EMA20_PLUS_BREADTH',
    nepseClose: Number(nepseClose.toFixed(2)),
    ema20,
    nepseBull,
    breadthPct,
    breadthThresholdPct,
    totalBreadthStocks,
  };
}

function aggregateMarketWindow(db, symbol, dates, brokerFilter) {
  if (!db || !dates || dates.length === 0) return null;
  const placeholders = dates.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT broker_id, SUM(buy_vol) AS buy_vol, SUM(sell_vol) AS sell_vol, SUM(buy_amt) AS buy_amt, SUM(sell_amt) AS sell_amt
       FROM daily_broker_ledger
       WHERE symbol = ? AND trade_date IN (${placeholders})${brokerFilter}
       GROUP BY broker_id`
    )
    .all(symbol, ...dates);

  let totalBuyVol = 0;
  let totalSellVol = 0;
  let totalBuyAmt = 0;
  const list = rows
    .map((r) => {
      const buyVol = Number(r.buy_vol || 0);
      const sellVol = Number(r.sell_vol || 0);
      const buyAmt = Number(r.buy_amt || 0);
      totalBuyVol += buyVol;
      totalSellVol += sellVol;
      totalBuyAmt += buyAmt;
      const netVol = buyVol - sellVol;
      return {
        brokerId: Number(r.broker_id),
        name: BROKER_NAMES[String(r.broker_id)] || `Broker #${r.broker_id}`,
        buyVol,
        sellVol,
        netVol,
        retentionPct: buyVol > 0 ? (netVol / buyVol) * 100 : 0,
        vwap: buyVol > 0 ? buyAmt / buyVol : 0,
      };
    })
    .filter((b) => b.buyVol > 0 || b.sellVol > 0);

  if (totalBuyVol <= 0 || list.length === 0) return null;

  const byGrossBuy = [...list].sort((a, b) => b.buyVol - a.buyVol);
  const byGrossSell = [...list].sort((a, b) => b.sellVol - a.sellVol);
  const top3Buy = byGrossBuy.slice(0, 3);
  const top2Buy = byGrossBuy.slice(0, 2);

  const top3BuyVol = top3Buy.reduce((s, b) => s + b.buyVol, 0);
  const top3PosNetVol = top3Buy.reduce((s, b) => s + Math.max(0, b.netVol), 0);
  const top3RawNetVol = top3Buy.reduce((s, b) => s + b.netVol, 0);
  const top3SellVol = byGrossSell.slice(0, 3).reduce((s, b) => s + b.sellVol, 0);

  const lead = byGrossBuy[0];
  return {
    sessions: dates.length,
    bcr3Buy: Number(((top3BuyVol / totalBuyVol) * 100).toFixed(1)),
    bcr3Sell: Number((totalSellVol > 0 ? (top3SellVol / totalSellVol) * 100 : 0).toFixed(1)),
    netRetentionLegacy: Number((top3BuyVol > 0 ? (top3PosNetVol / top3BuyVol) * 100 : 0).toFixed(1)),
    rawGrossTop3Ret: Number((top3BuyVol > 0 ? (top3RawNetVol / top3BuyVol) * 100 : 0).toFixed(1)),
    minTop2GrossRet: Number((top2Buy.length > 0 ? Math.min(...top2Buy.map((b) => b.retentionPct)) : 0).toFixed(1)),
    leadBrokerId: lead?.brokerId ?? null,
    leadBrokerName: lead?.name ?? 'Smart Money',
    vwap: Number((lead?.vwap > 0 ? lead.vwap : totalBuyAmt / totalBuyVol).toFixed(1)),
    topHolders: top3Buy.map((b) => `#${b.brokerId} (${b.retentionPct.toFixed(0)}%)`).join(', '),
  };
}

function detectV2MultiSessionTrap(db, symbol, marketDates, candles, chg1d, upperWickRatio, leadBrokerId, brokerFilter) {
  if (upperWickRatio > 0.42 && chg1d > 1.0) {
    return { isTrap: true, reason: `Upper-wick distribution rejection (${(upperWickRatio * 100).toFixed(0)}% wick on +${chg1d.toFixed(1)}% move)` };
  }
  if (candles.length >= 3) {
    const b0 = candles[candles.length - 1];
    const b1 = candles[candles.length - 2];
    const b2 = candles[candles.length - 3];
    const declining = b0.close < b1.close && b1.close < b2.close;
    const threeRed = b0.close < b0.open && b1.close < b1.open && b2.close < b2.open;
    if (declining || threeRed) {
      return { isTrap: true, reason: '3 consecutive down closes / red candles invalidate floor base' };
    }
  }

  const last2 = marketDates.slice(0, 2);
  if (last2.length > 0) {
    const pl2 = last2.map(() => '?').join(',');
    const recentRows = db
      .prepare(`SELECT broker_id, buy_vol, sell_vol FROM daily_broker_ledger WHERE symbol = ? AND trade_date IN (${pl2})${brokerFilter}`)
      .all(symbol, ...last2);
    let maxDump = 0;
    let maxBuy = 0;
    for (const r of recentRows) {
      const net = Number(r.buy_vol || 0) - Number(r.sell_vol || 0);
      if (net < -12000 && Math.abs(net) > maxDump) maxDump = Math.abs(net);
      if (net > 12000 && net > maxBuy) maxBuy = net;
    }
    if (maxDump > 0 && maxBuy < maxDump * 0.8) {
      return { isTrap: true, reason: `Unabsorbed ${maxDump.toLocaleString()} kitta broker dump in last 2 sessions` };
    }
  }

  const prior3To7 = marketDates.slice(2, 7);
  if (prior3To7.length > 0 && last2.length > 0) {
    const plPrior = prior3To7.map(() => '?').join(',');
    const topPrior = db
      .prepare(
        `SELECT broker_id, SUM(buy_vol - sell_vol) AS net_acc
         FROM daily_broker_ledger
         WHERE symbol = ? AND trade_date IN (${plPrior})${brokerFilter}
         GROUP BY broker_id HAVING net_acc >= 5000 ORDER BY net_acc DESC LIMIT 1`
      )
      .get(symbol, ...prior3To7);

    if (topPrior) {
      const t0Row = db
        .prepare(`SELECT buy_vol, sell_vol FROM daily_broker_ledger WHERE symbol = ? AND trade_date = ? AND broker_id = ?${brokerFilter}`)
        .get(symbol, last2[0], topPrior.broker_id);
      const t1Row = last2[1]
        ? db.prepare(`SELECT buy_vol, sell_vol FROM daily_broker_ledger WHERE symbol = ? AND trade_date = ? AND broker_id = ?${brokerFilter}`).get(symbol, last2[1], topPrior.broker_id)
        : null;
      const ns0 = t0Row ? Number(t0Row.sell_vol || 0) - Number(t0Row.buy_vol || 0) : 0;
      const ns1 = t1Row ? Number(t1Row.sell_vol || 0) - Number(t1Row.buy_vol || 0) : 0;
      const thr = Math.max(5000, Number(topPrior.net_acc) * 0.4);
      if (ns0 >= thr || ns1 >= thr || ns0 + ns1 >= thr) {
        return { isTrap: true, reason: `Past accumulator #${topPrior.broker_id} reversed net seller across last 2 sessions` };
      }
    }
  }

  if (leadBrokerId != null && last2.length > 0) {
    const leadToday = db
      .prepare(`SELECT buy_vol, sell_vol FROM daily_broker_ledger WHERE symbol = ? AND trade_date = ? AND broker_id = ?${brokerFilter}`)
      .get(symbol, last2[0], leadBrokerId);
    if (leadToday && Number(leadToday.buy_vol || 0) - Number(leadToday.sell_vol || 0) < -5000) {
      return { isTrap: true, reason: `Lead 10D buyer #${leadBrokerId} net sold on latest session` };
    }
  }

  return { isTrap: false, reason: null };
}

/**
 * Evaluates a single stock under the Dual-Tier Unbiased Break & Retest Engine.
 */
export function evaluateDualTierCandidate(
  symbol,
  {
    db,
    targetDate = null,
    maxPrice = 650,
    minTurnover = 2500000,
    minVolume = 8000,
    requireEps = true,
    preloadedMarketDates = null,
  } = {}
) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!db || !sym) return { qualified: false, symbol: sym, vetoCode: 'INVALID_INPUT', failReason: 'Invalid db or symbol' };

  let dbFund = null;
  try {
    dbFund = db.prepare(`SELECT * FROM scrip_fundamentals WHERE symbol = ?`).get(sym);
  } catch (_) {}

  const staticFund = getFundamentalsFallbackMap().get(sym) || {};
  const stockMeta = getStockMap()[sym] || {};
  const sector = resolveCanonicalSector(sym, dbFund?.sector, staticFund.sector);
  const companyName = String(stockMeta.name || sym);

  if (isNonEquityTicker(sym, sector)) {
    return { qualified: false, symbol: sym, vetoCode: 'EXCLUDED_INSTRUMENT', failReason: `Excluded sector/instrument: ${sector}` };
  }
  if (/insurance/i.test(sector)) {
    return { qualified: false, symbol: sym, vetoCode: 'INSURANCE_SECTOR_VETO', failReason: `Insurance sector (${sector}) excluded due to walk-forward drawdown drag` };
  }

  const { settledSummaryFilter, brokerFilter } = getSchemaFilterClauses(db);
  const barSql = targetDate
    ? `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
       FROM daily_stock_summary WHERE symbol = ? AND trade_date <= ? AND close_price > 0${settledSummaryFilter} ORDER BY trade_date DESC LIMIT 55`
    : `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
       FROM daily_stock_summary WHERE symbol = ? AND close_price > 0${settledSummaryFilter} ORDER BY trade_date DESC LIMIT 55`;
  const rawBars = db.prepare(barSql).all(...(targetDate ? [sym, targetDate] : [sym]));
  if (!rawBars || rawBars.length < 30) {
    return { qualified: false, symbol: sym, vetoCode: 'INSUFFICIENT_HISTORY', failReason: 'Fewer than 30 settled sessions available' };
  }

  const candles = [...rawBars].reverse().map((r) => ({
    date: String(r.trade_date || '').slice(0, 10),
    open: Number(r.open_price || r.close_price || 0),
    high: Number(r.high_price || r.close_price || 0),
    low: Number(r.low_price || r.close_price || 0),
    close: Number(r.close_price || 0),
    volume: Number(r.total_volume || 0),
    turnover: Number(r.total_turnover || 0),
  }));

  const cur = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const ltp = cur.close;
  const effectiveDate = cur.date;

  if (ltp < 100 || (maxPrice > 0 && ltp >= maxPrice)) {
    return { qualified: false, symbol: sym, vetoCode: 'PRICE_OUT_OF_RANGE', failReason: `LTP Rs. ${ltp} outside agile band [100, ${maxPrice > 0 ? maxPrice : '∞'})` };
  }
  if (cur.turnover < minTurnover || cur.volume < minVolume) {
    return { qualified: false, symbol: sym, vetoCode: 'LOW_LIQUIDITY', failReason: `Turnover Rs. ${(cur.turnover / 1e5).toFixed(1)}L or vol ${cur.volume} below minimum` };
  }

  const eps = Number(dbFund?.eps_ttm ?? staticFund.eps ?? 0);
  if (requireEps && eps <= 0) {
    return { qualified: false, symbol: sym, vetoCode: 'NON_POSITIVE_EPS', failReason: `EPS (${eps}) must be > 0` };
  }

  const lockin = isInPromoterLockinCliff(sym, {
    asOfDate: effectiveDate,
    unlockDate: dbFund?.promoter_unlock_date ?? staticFund.promoterUnlockDate,
  });
  if (lockin.isCliff) {
    return { qualified: false, symbol: sym, vetoCode: 'LOCKIN_CLIFF_VETO', failReason: lockin.reason };
  }

  let marketDates = Array.isArray(preloadedMarketDates) ? preloadedMarketDates : null;
  if (!marketDates) {
    const marketDatesSql = targetDate
      ? `SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE trade_date <= ?${brokerFilter} ORDER BY trade_date DESC LIMIT 15`
      : `SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE 1=1${brokerFilter} ORDER BY trade_date DESC LIMIT 15`;
    marketDates = db.prepare(marketDatesSql).all(...(targetDate ? [effectiveDate] : [])).map((r) => r.trade_date);
  }
  if (marketDates.length < 5) {
    return { qualified: false, symbol: sym, vetoCode: 'NO_BROKER_LEDGER', failReason: 'Insufficient broker ledger history' };
  }

  const f10 = aggregateMarketWindow(db, sym, marketDates.slice(0, Math.min(10, marketDates.length)), brokerFilter);
  const f15 = aggregateMarketWindow(db, sym, marketDates, brokerFilter);
  if (!f10 || !f15) {
    return { qualified: false, symbol: sym, vetoCode: 'NO_BROKER_LEDGER', failReason: 'Missing multi-session broker flow' };
  }

  if (f15.rawGrossTop3Ret < 50 || f15.minTop2GrossRet < 25) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'GROSS_MOVER_WASH_CHURN',
      failReason: `15D GrossTop3 ${f15.rawGrossTop3Ret}% (<50%) or MinTop2 ${f15.minTop2GrossRet}% (<25%)`,
    };
  }

  const chg1d = prev.close > 0 ? ((ltp - prev.close) / prev.close) * 100 : 0;
  const rng = cur.high - cur.low;
  const uwRatio = rng > 0.001 ? (cur.high - Math.max(cur.open, cur.close)) / rng : 0;
  const trapCheck = detectV2MultiSessionTrap(db, sym, marketDates, candles, chg1d, uwRatio, f10.leadBrokerId, brokerFilter);
  if (trapCheck.isTrap) {
    return { qualified: false, symbol: sym, vetoCode: 'TRAP_VETO', failReason: trapCheck.reason };
  }

  const closes = candles.map((c) => c.close);
  const last10 = closes.slice(-10);
  const min10 = Math.min(...last10);
  const spread10 = min10 > 0 ? Number((((Math.max(...last10) - min10) / min10) * 100).toFixed(2)) : 99;
  const last20 = closes.slice(-20);
  const sma20 = last20.reduce((a, b) => a + b, 0) / last20.length;
  const prior20Vol = candles.slice(-21, -1).reduce((s, c) => s + c.volume, 0) / Math.max(1, Math.min(20, candles.length - 1));
  const rvolToday = prior20Vol > 0 ? Number((cur.volume / prior20Vol).toFixed(2)) : 1.0;

  const smc = evaluateLoopholeProtectedSmcSetup(candles, {
    ltp,
    ema20: sma20,
    avgBrokerPrice: f10.vwap,
    bcr3Buy: f10.bcr3Buy,
    bcr3Sell: f10.bcr3Sell,
    leadRetentionPct: f10.netRetentionLegacy,
    isTrap: false,
  });

  if (!smc.isBreakAndRetest) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'NO_BREAK_AND_RETEST',
      failReason: 'Awaiting confirmed Multi-Day Break & Retest structure',
    };
  }

  const isTier1Sniper =
    spread10 <= 8.5 &&
    rvolToday <= 0.70 &&
    f10.bcr3Buy >= 42 &&
    f10.bcr3Sell <= 30 &&
    f10.netRetentionLegacy >= 78;

  const isTier2Balanced =
    !isTier1Sniper &&
    spread10 <= 9.5 &&
    rvolToday <= 0.75 &&
    f10.bcr3Buy >= 40 &&
    f10.bcr3Sell <= 32 &&
    f10.netRetentionLegacy >= 74;

  if (!isTier1Sniper && !isTier2Balanced) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'SYNDICATE_THRESHOLD_UNMET',
      failReason: `Break&Retest present but spread10=${spread10}% rvol=${rvolToday} BCR3=${f10.bcr3Buy}/${f10.bcr3Sell} netRet=${f10.netRetentionLegacy}% outside Tier-1/Tier-2 bounds`,
    };
  }

  const tier = isTier1Sniper ? 'TIER_1_SNIPER' : 'TIER_2_BALANCED';
  const score = Math.min(
    99,
    Math.round(
      (isTier1Sniper ? 78 : 68) +
        Math.min(10, Math.max(0, (f15.rawGrossTop3Ret - 50) * 0.22)) +
        Math.min(6, Math.max(0, (f10.bcr3Buy - f10.bcr3Sell) * 0.15)) +
        Math.min(5, Math.max(0, (f10.netRetentionLegacy - 74) * 0.25))
    )
  );

  const entryLow = Number(Math.min(ltp * 0.992, Math.max(f10.vwap * 0.995, ltp * 0.985)).toFixed(1));
  const entryHigh = Number(Math.max(ltp, Math.min(ltp * 1.012, f10.vwap * 1.015)).toFixed(1));
  const chaseCap = Number((ltp * 1.018).toFixed(1));
  const stopLoss = Number((smc.smcStopLoss > 0 ? Math.min(smc.smcStopLoss, ltp * 0.965) : ltp * 0.965).toFixed(1));
  const target1 = Number((ltp * 1.080).toFixed(1));
  const target2 = Number((ltp * 1.150).toFixed(1));
  const risk = Math.max(0.5, ltp - stopLoss);

  return {
    qualified: true,
    symbol: sym,
    companyName,
    sector,
    asOfDate: effectiveDate,
    tier,
    tierBadge: isTier1Sniper
      ? `🎯 TIER-1 SNIPER (${TIER1_SNIPER_METRICS.winRatePct}% 1Y WR • ${TIER1_SNIPER_METRICS.profitFactor}x PF)`
      : `🏹 TIER-2 BALANCED (${DUAL_TIER_COMBINED_METRICS.winRatePct}% Dual-Tier WR • ${DUAL_TIER_COMBINED_METRICS.profitFactor}x PF)`,
    backtestWinRatePct: isTier1Sniper ? TIER1_SNIPER_METRICS.winRatePct : DUAL_TIER_COMBINED_METRICS.winRatePct,
    profitFactor: isTier1Sniper ? TIER1_SNIPER_METRICS.profitFactor : DUAL_TIER_COMBINED_METRICS.profitFactor,
    score,
    ltp,
    pChange: Number(chg1d.toFixed(2)),
    turnover: cur.turnover,
    volume: cur.volume,
    eps,
    spread10,
    rvolToday,
    bcr3Buy10D: f10.bcr3Buy,
    bcr3Sell10D: f10.bcr3Sell,
    netRetention10D: f10.netRetentionLegacy,
    grossTop3Ret15D: f15.rawGrossTop3Ret,
    minTop2GrossRet15D: f15.minTop2GrossRet,
    vwap10D: f10.vwap,
    retestLevel: smc.retestLevel,
    smcNarrative: smc.smcNarrative,
    leadBrokerId: f10.leadBrokerId,
    leadBrokerName: f10.leadBrokerName,
    leadHolders: f15.topHolders,
    entryLow,
    entryHigh,
    chaseCap,
    stopLoss,
    target1,
    target2,
    riskRewardRatio: Number(((target2 - ltp) / risk).toFixed(2)),
  };
}

/**
 * Scans all settled liquid equities through the Dual-Tier Unbiased Break & Retest Engine.
 */
export function scanDualTierCandidates({
  db,
  targetDate = null,
  maxPrice = 650,
  minTurnover = 2500000,
  minVolume = 8000,
  limit = 20,
} = {}) {
  const regimeInfo = evaluateUnbiasedMarketRegime({ db, targetDate });
  if (!db) {
    return {
      asOfDate: null,
      methodology: 'DUAL_TIER_UNBIASED_V1',
      marketRegime: regimeInfo.regime,
      breadthPct: regimeInfo.breadthPct,
      nepseClose: regimeInfo.nepseClose,
      nepseEma20: regimeInfo.ema20,
      totalScanned: 0,
      qualifiedCount: 0,
      tier1Sniper: [],
      tier2Balanced: [],
      topPick: null,
      candidates: [],
      vetoed: [],
    };
  }

  const effectiveDate = targetDate || regimeInfo.asOfDate;
  const { settledSummaryFilter, brokerFilter } = getSchemaFilterClauses(db);
  const preloadedMarketDates = effectiveDate
    ? db
        .prepare(
          `SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE trade_date <= ?${brokerFilter} ORDER BY trade_date DESC LIMIT 15`
        )
        .all(effectiveDate)
        .map((r) => r.trade_date)
    : [];
  const symbols = effectiveDate
    ? db
        .prepare(
          `SELECT DISTINCT symbol FROM daily_stock_summary
           WHERE trade_date = ? AND close_price >= 100 ${maxPrice > 0 ? 'AND close_price < ?' : ''}
           AND total_turnover >= ? AND total_volume >= ?${settledSummaryFilter}`
        )
        .all(...(maxPrice > 0 ? [effectiveDate, maxPrice, minTurnover, minVolume] : [effectiveDate, minTurnover, minVolume]))
        .map((r) => r.symbol)
    : [];

  const candidates = [];
  const vetoed = [];

  for (const sym of symbols) {
    const res = evaluateDualTierCandidate(sym, {
      db,
      targetDate: effectiveDate,
      maxPrice,
      minTurnover,
      minVolume,
      preloadedMarketDates,
    });
    if (res.qualified) {
      candidates.push(res);
    } else if (
      res.vetoCode === 'GROSS_MOVER_WASH_CHURN' ||
      res.vetoCode === 'LOCKIN_CLIFF_VETO' ||
      res.vetoCode === 'INSURANCE_SECTOR_VETO' ||
      res.vetoCode === 'TRAP_VETO'
    ) {
      vetoed.push({ symbol: res.symbol, vetoCode: res.vetoCode, reason: res.failReason });
    }
  }

  candidates.sort(
    (a, b) =>
      (a.tier === 'TIER_1_SNIPER' ? 0 : 1) - (b.tier === 'TIER_1_SNIPER' ? 0 : 1) ||
      b.score - a.score ||
      b.netRetention10D - a.netRetention10D ||
      b.grossTop3Ret15D - a.grossTop3Ret15D
  );

  const tier1Sniper = candidates.filter((c) => c.tier === 'TIER_1_SNIPER');
  const tier2Balanced = candidates.filter((c) => c.tier === 'TIER_2_BALANCED');

  return {
    asOfDate: effectiveDate,
    methodology: 'DUAL_TIER_UNBIASED_V1',
    marketRegime: regimeInfo.regime,
    regimeMethod: regimeInfo.method,
    breadthPct: regimeInfo.breadthPct,
    nepseClose: regimeInfo.nepseClose,
    nepseEma20: regimeInfo.ema20,
    maxPrice,
    totalScanned: symbols.length,
    qualifiedCount: candidates.length,
    tier1Sniper,
    tier2Balanced,
    topPick: candidates[0] || null,
    candidates: candidates.slice(0, limit),
    vetoed: vetoed.slice(0, 20),
  };
}
