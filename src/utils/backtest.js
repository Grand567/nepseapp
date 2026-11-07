/**
 * NEPSE Quantitative Backtesting Engine — OHLCV-Aware v2
 * (Core engines re-exported from ./backtestCore.js to break circular dependency with setupAnalyzer.js)
 */
export * from './backtestCore.js';
import { generateEntryExitPlan, toAscendingCandles } from './setupAnalyzer.js';

// ── Walk-Forward Setup Score Backtest Engine ─────────────────────────────────
/**
 * Walk-Forward Historical Backtest Engine for the 0-100 Setup Score
 * Validates out-of-sample forward predictive power of generateEntryExitPlan setups.
 *
 * @param {Array<object>} rawCandles - Historical OHLCV candle array
 * @param {object} [options]
 * @param {number} [options.step=5] - Step frequency in trading days
 * @param {number} [options.minHistory=30] - Minimum history before evaluating setups
 * @param {Array<number>} [options.horizons=[5, 10, 20]] - Forward horizons in sessions
 * @param {string} [options.symbol='STOCK'] - Stock symbol
 * @param {Array<object>} [options.dividendHistory=[]] - Real dividend history
 * @returns {object} Walk-forward validation results and bucketed statistics
 */
export function runWalkForwardScoreBacktest(rawCandles, options = {}) {
  const candles = toAscendingCandles(rawCandles);
  const minHistory = options.minHistory || 30;
  const horizons = options.horizons || [5, 10, 20];
  const maxHorizon = Math.max(...horizons);
  const step = Math.max(1, options.step || 5);
  const symbol = options.symbol || 'STOCK';
  const dividendHistory = options.dividendHistory || [];

  if (!candles || candles.length < minHistory + maxHorizon + 1) {
    return {
      error: `Insufficient candles for walk-forward backtest. Need at least ${minHistory + maxHorizon + 1} candles, got ${candles?.length || 0}.`,
      totalEvaluations: 0,
      scoreBuckets: {},
      summary: null,
    };
  }

  const evaluations = [];

  for (let i = minHistory - 1; i <= candles.length - maxHorizon - 2; i += step) {
    const historicalSlice = candles.slice(0, i + 1);
    const evalCandle = candles[i];
    const prevCandle = historicalSlice.length > 1 ? historicalSlice[historicalSlice.length - 2] : evalCandle;
    const pChange = prevCandle.close > 0 ? ((evalCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;

    const mockStock = {
      symbol,
      ltp: evalCandle.close,
      close: evalCandle.close,
      pChange,
      previousClose: prevCandle.close,
      volume: evalCandle.volume,
    };

    let plan;
    try {
      plan = generateEntryExitPlan(mockStock, historicalSlice, dividendHistory);
    } catch {
      continue;
    }

    if (!plan || !plan.supported || typeof plan.setupScore !== 'number') {
      continue;
    }

    const nextCandle = candles[i + 1];
    if (!nextCandle || !nextCandle.open) continue;

    // Realistic entry at next-day open price
    const entryPrice = nextCandle.open;
    const entryDate = nextCandle.date;

    // Check circuit filter: NEPSE ±15% circuit limit prevents unrealistic gap fills
    if (evalCandle.close > 0) {
      const openGap = Math.abs((entryPrice - evalCandle.close) / evalCandle.close);
      if (openGap > 0.15) {
        continue;
      }
    }

    const outcomeByHorizon = {};

    for (const h of horizons) {
      const exitIdx = i + 1 + h;
      if (exitIdx < candles.length) {
        const pathCandles = candles.slice(i + 1, exitIdx + 1);
        const exitCandle = candles[exitIdx];
        const exitPrice = exitCandle.close;
        const returnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);

        let maxHigh = entryPrice;
        let minLow = entryPrice;
        for (const bar of pathCandles) {
          if (bar.high > maxHigh) maxHigh = bar.high;
          if (bar.low < minLow) minLow = bar.low;
        }

        const mfePct = +(((maxHigh - entryPrice) / entryPrice) * 100).toFixed(2);
        const maePct = +(((minLow - entryPrice) / entryPrice) * 100).toFixed(2);

        outcomeByHorizon[`T+${h}`] = {
          exitDate: exitCandle.date,
          exitPrice,
          returnPct,
          isWin: returnPct > 0,
          mfePct,
          maePct,
        };
      }
    }

    evaluations.push({
      evalDate: evalCandle.date,
      entryDate,
      entryPrice,
      setupScore: plan.setupScore,
      verdict: plan.verdict,
      setupType: plan.setupType,
      outcomes: outcomeByHorizon,
    });
  }

  // Bucket definitions
  const bucketKeys = ['<50', '50-69', '70-84', '85-100'];
  const getBucketKey = (score) => {
    if (score < 50) return '<50';
    if (score < 70) return '50-69';
    if (score < 85) return '70-84';
    return '85-100';
  };

  const bucketData = {
    '<50': [],
    '50-69': [],
    '70-84': [],
    '85-100': [],
  };

  evaluations.forEach((ev) => {
    const k = getBucketKey(ev.setupScore);
    if (bucketData[k]) bucketData[k].push(ev);
  });

  const scoreBuckets = {};
  for (const bKey of bucketKeys) {
    const evs = bucketData[bKey];
    const n = evs.length;

    const bStats = {
      bucket: bKey,
      count: n,
    };

    for (const h of horizons) {
      const hKey = `T+${h}`;
      const validH = evs.map((e) => e.outcomes[hKey]).filter(Boolean);
      if (validH.length > 0) {
        const wins = validH.filter((o) => o.isWin).length;
        const totalReturn = validH.reduce((acc, o) => acc + o.returnPct, 0);
        const totalMAE = validH.reduce((acc, o) => acc + o.maePct, 0);
        const totalMFE = validH.reduce((acc, o) => acc + o.mfePct, 0);

        bStats[`winRate_${hKey}`] = +((wins / validH.length) * 100).toFixed(1);
        bStats[`avgReturn_${hKey}`] = +(totalReturn / validH.length).toFixed(2);
        bStats[`avgMAE_${hKey}`] = +(totalMAE / validH.length).toFixed(2);
        bStats[`avgMFE_${hKey}`] = +(totalMFE / validH.length).toFixed(2);
      } else {
        bStats[`winRate_${hKey}`] = 0;
        bStats[`avgReturn_${hKey}`] = 0;
        bStats[`avgMAE_${hKey}`] = 0;
        bStats[`avgMFE_${hKey}`] = 0;
      }
    }

    scoreBuckets[bKey] = bStats;
  }

  // Calculate Pearson correlation between setupScore and primary horizon
  const primaryHKey = `T+${horizons[1] || horizons[0] || 10}`;
  const pairs = evaluations
    .map((e) => ({
      x: e.setupScore,
      y: e.outcomes[primaryHKey]?.returnPct,
    }))
    .filter((p) => typeof p.y === 'number' && Number.isFinite(p.y));

  let correlation = 0;
  if (pairs.length > 2) {
    const n = pairs.length;
    const sumX = pairs.reduce((s, p) => s + p.x, 0);
    const sumY = pairs.reduce((s, p) => s + p.y, 0);
    const sumXY = pairs.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pairs.reduce((s, p) => s + p.x * p.x, 0);
    const sumY2 = pairs.reduce((s, p) => s + p.y * p.y, 0);

    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom > 0) {
      correlation = +((n * sumXY - sumX * sumY) / denom).toFixed(3);
    }
  }

  // Check predictive edge: high scores (>=70) outperform low scores (<50)
  const highBucket = scoreBuckets['70-84']?.count > 0 ? scoreBuckets['70-84'] : scoreBuckets['85-100'];
  const lowBucket = scoreBuckets['<50'];
  const retKey = `avgReturn_${primaryHKey}`;
  const predictiveEdge = Boolean(
    highBucket && lowBucket && highBucket.count > 0 && lowBucket.count > 0
      ? highBucket[retKey] > lowBucket[retKey]
      : correlation > 0
  );

  return {
    totalEvaluations: evaluations.length,
    scoreBuckets,
    primaryHorizon: primaryHKey,
    correlation,
    predictiveEdge,
    summary: {
      totalEvaluations: evaluations.length,
      primaryHorizon: primaryHKey,
      correlation,
      predictiveEdge,
      interpretation: predictiveEdge
        ? `Positive quant edge confirmed: higher setup scores historically correlate with superior out-of-sample forward returns (${primaryHKey} correlation: ${correlation}).`
        : `Neutral or mixed edge observed across tested historical candles (${primaryHKey} correlation: ${correlation}).`,
    },
    evaluations: evaluations.slice(-20),
  };
}

