/**
 * Modular Price Action & Market Structure Engine for NEPSE Stocks
 * ─────────────────────────────────────────────────────────────────────
 * Analyzes authentic OHLC price action without synthetic fabrication:
 *   1. Market Structure & Swings (Higher Highs / Higher Lows, Swings, Consolidation)
 *   2. Candlestick Pattern Recognition (Engulfing, Hammer, Shooting Star, Marubozu, Doji)
 *   3. Support & Resistance Confluence Clustering (Swings, Pivots, Fibonacci, 52W)
 *   4. Breakout & Retest Detection (Volume Confirmation, Breakout Failure / Traps)
 *
 * Reuses existing reliable calculations from:
 *   - ./mockData.js (calculatePivotPoints, calculateFibonacci)
 */

import { calculatePivotPoints, calculateFibonacci } from './mockData.js';

// ─────────────────────────────────────────────────────────────────────
// 1. SWING EXTRACTOR & MARKET STRUCTURE
// ─────────────────────────────────────────────────────────────────────

/**
 * Identifies fractal swing highs and swing lows across OHLC candles.
 * @param {Array<{high: number, low: number, close: number, date?: string}>} candles
 * @param {number} [window=3] Left/right lookback bars
 * @returns {{swingHighs: Array, swingLows: Array}}
 */
export function identifySwings(candles, window = 2) {
  const swingHighs = [];
  const swingLows = [];
  const n = candles.length;

  for (let i = window; i < n - window; i++) {
    const currHigh = Number(candles[i].high);
    const currLow = Number(candles[i].low);

    let isHigh = true;
    let isLow = true;

    for (let w = 1; w <= window; w++) {
      if (Number(candles[i - w].high) >= currHigh || Number(candles[i + w].high) > currHigh) {
        isHigh = false;
      }
      if (Number(candles[i - w].low) <= currLow || Number(candles[i + w].low) < currLow) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingHighs.push({
        price: Number(currHigh.toFixed(2)),
        index: i,
        date: candles[i].date,
      });
    }
    if (isLow) {
      swingLows.push({
        price: Number(currLow.toFixed(2)),
        index: i,
        date: candles[i].date,
      });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Classifies the current market structure from recent swing points.
 * @param {Array<{high: number, low: number, close: number, open: number, date?: string}>} candles
 * @returns {Object} Market structure evaluation
 */
export function analyzeMarketStructure(candles) {
  if (!Array.isArray(candles) || candles.length < 15) {
    return {
      structure: 'insufficient_history',
      direction: 'neutral',
      strength: 50,
      swingHighs: [],
      swingLows: [],
      consolidation: false,
      description: 'Insufficient candles for market structure analysis.',
    };
  }

  const { swingHighs, swingLows } = identifySwings(candles, 2);
  const n = candles.length;
  const currentPrice = Number(candles[n - 1].close);

  // Check recent 15-day range for tight consolidation
  const recent15 = candles.slice(-15);
  const recentHigh = Math.max(...recent15.map((c) => Number(c.high)));
  const recentLow = Math.min(...recent15.map((c) => Number(c.low)));
  const rangePct = recentLow > 0 ? ((recentHigh - recentLow) / recentLow) * 100 : 0;
  const isConsolidation = rangePct <= 4.2 && recent15.length >= 10;

  // Need at least 2 swing highs and 2 swing lows to evaluate structural trend
  if (swingHighs.length < 2 || swingLows.length < 2) {
    return {
      structure: isConsolidation ? 'consolidation_range' : 'emerging_structure',
      direction: isConsolidation ? 'neutral' : (currentPrice > Number(candles[0].close) ? 'bullish' : 'bearish'),
      strength: isConsolidation ? 55 : 50,
      swingHighs,
      swingLows,
      consolidation: isConsolidation,
      description: isConsolidation
        ? `Consolidation range: Price oscillating within a tight ${rangePct.toFixed(1)}% band.`
        : 'Developing price action with emerging swing structure.',
    };
  }

  const lastHigh = swingHighs[swingHighs.length - 1];
  const prevHigh = swingHighs[swingHighs.length - 2];
  const lastLow = swingLows[swingLows.length - 1];
  const prevLow = swingLows[swingLows.length - 2];

  const hasHigherHigh = lastHigh.price > prevHigh.price * 1.003;
  const hasHigherLow = lastLow.price > prevLow.price * 1.003;
  const hasLowerHigh = lastHigh.price < prevHigh.price * 0.997;
  const hasLowerLow = lastLow.price < prevLow.price * 0.997;

  let structure = 'mixed';
  let direction = 'neutral';
  let strength = 50;
  let description = '';

  if (isConsolidation) {
    structure = 'consolidation_range';
    direction = 'neutral';
    strength = 60;
    description = `Tight consolidation: Range is compressed to ${rangePct.toFixed(1)}% (Rs. ${recentLow} – Rs. ${recentHigh}).`;
  } else if (hasHigherHigh && hasHigherLow) {
    structure = 'higher_highs_higher_lows';
    direction = 'bullish';
    strength = 82;
    description = `Bullish market structure: Higher highs (Rs. ${lastHigh.price}) and higher lows (Rs. ${lastLow.price}) confirmed.`;
  } else if (hasLowerHigh && hasLowerLow) {
    structure = 'lower_highs_lower_lows';
    direction = 'bearish';
    strength = 20;
    description = `Bearish market structure: Lower highs (Rs. ${lastHigh.price}) and lower lows (Rs. ${lastLow.price}) in control.`;
  } else if (hasHigherHigh && hasLowerLow) {
    structure = 'broadening_expansion';
    direction = 'neutral';
    strength = 45;
    description = 'Broadening pattern: Swings are expanding with heightened two-way volatility.';
  } else if (hasLowerHigh && hasHigherLow) {
    structure = 'triangle_compression';
    direction = 'neutral';
    strength = 65;
    description = 'Contracting triangle structure: Price is coiling inside converging swing highs and lows.';
  } else {
    structure = 'range_bound';
    direction = 'neutral';
    strength = 50;
    description = 'Range-bound structure with horizontal swing boundaries.';
  }

  return {
    structure,
    direction,
    strength,
    swingHighs,
    swingLows,
    consolidation: isConsolidation,
    description,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 2. CANDLESTICK PATTERN ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Detects classic Japanese candlestick patterns on the latest bars.
 * Strictly verifies geometric criteria without fabricating patterns.
 * @param {Array<{open: number, high: number, low: number, close: number}>} candles
 * @returns {Object|null} Detected pattern or null
 */
export function analyzeCandlestickPattern(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;

  const n = candles.length;
  const curr = candles[n - 1];
  const prev = candles[n - 2];

  const cOpen = Number(curr.open);
  const cClose = Number(curr.close);
  const cHigh = Number(curr.high);
  const cLow = Number(curr.low);

  const pOpen = Number(prev.open);
  const pClose = Number(prev.close);

  const range = cHigh - cLow;
  const body = Math.abs(cClose - cOpen);
  if (range <= 0) return null;

  const isBull = cClose > cOpen;
  const isBear = cClose < cOpen;
  const upperWick = isBull ? cHigh - cClose : cHigh - cOpen;
  const lowerWick = isBull ? cOpen - cLow : cClose - cLow;

  const prevIsBear = pClose < pOpen;
  const prevIsBull = pClose > pOpen;
  const prevBody = Math.abs(pClose - pOpen);

  // 1. Bullish Engulfing
  if (
    prevIsBear &&
    isBull &&
    cOpen <= pClose * 1.002 &&
    cClose >= pOpen * 0.998 &&
    body > prevBody * 1.1
  ) {
    return {
      pattern: 'bullish_engulfing',
      name: 'Bullish Engulfing',
      direction: 'bullish',
      strength: 80,
      index: n - 1,
      description: 'Bullish Engulfing: Current green candle completely overtakes previous red candle body.',
    };
  }

  // 2. Bearish Engulfing
  if (
    prevIsBull &&
    isBear &&
    cOpen >= pClose * 0.998 &&
    cClose <= pOpen * 1.002 &&
    body > prevBody * 1.1
  ) {
    return {
      pattern: 'bearish_engulfing',
      name: 'Bearish Engulfing',
      direction: 'bearish',
      strength: 78,
      index: n - 1,
      description: 'Bearish Engulfing: Current red candle completely engulfs preceding green candle body.',
    };
  }

  // 3. Hammer (bullish rejection from lows)
  if (
    lowerWick >= 2.0 * body &&
    upperWick <= 0.25 * body &&
    range > 0 &&
    (body / range) >= 0.15 &&
    (body / range) <= 0.40
  ) {
    return {
      pattern: 'hammer',
      name: 'Hammer',
      direction: 'bullish',
      strength: 74,
      index: n - 1,
      description: 'Hammer: Long lower shadow showing sharp intraday rejection of lower prices.',
    };
  }

  // 4. Shooting Star (bearish rejection from highs)
  if (
    upperWick >= 2.0 * body &&
    lowerWick <= 0.25 * body &&
    range > 0 &&
    (body / range) >= 0.15 &&
    (body / range) <= 0.40
  ) {
    return {
      pattern: 'shooting_star',
      name: 'Shooting Star',
      direction: 'bearish',
      strength: 72,
      index: n - 1,
      description: 'Shooting Star: Long upper shadow with close near lows, indicating overhead supply.',
    };
  }

  // 5. Strong Bullish Marubozu
  if (isBull && body >= 0.85 * range && range / cClose >= 0.015) {
    return {
      pattern: 'bullish_marubozu',
      name: 'Bullish Marubozu',
      direction: 'bullish',
      strength: 84,
      index: n - 1,
      description: 'Bullish Marubozu: Strong full-bodied green candle closing at highs with negligible shadows.',
    };
  }

  // 6. Strong Bearish Marubozu
  if (isBear && body >= 0.85 * range && range / cClose >= 0.015) {
    return {
      pattern: 'bearish_marubozu',
      name: 'Bearish Marubozu',
      direction: 'bearish',
      strength: 80,
      index: n - 1,
      description: 'Bearish Marubozu: Large red candle closing near absolute lows with heavy downward momentum.',
    };
  }

  // 7. Doji
  if (body <= 0.10 * range && range / cClose >= 0.01) {
    return {
      pattern: 'doji',
      name: 'Doji',
      direction: 'neutral',
      strength: 50,
      index: n - 1,
      description: 'Doji: Open and close are nearly identical, representing market indecision.',
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 3. SUPPORT & RESISTANCE CONFLUENCE CLUSTERING
// ─────────────────────────────────────────────────────────────────────

/**
 * Collects candidate price levels from multiple independent analytical sources
 * and clusters them within 1.2% tolerance to discover authentic support and resistance.
 * @param {Array<{open: number, high: number, low: number, close: number}>} candles
 * @returns {{support: Array, resistance: Array}}
 */
export function analyzeSupportResistance(candles) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return { support: [], resistance: [] };
  }

  const n = candles.length;
  const currentPrice = Number(candles[n - 1].close);
  const latestBar = candles[n - 1];

  const rawCandidates = [];

  // 1. Swings
  const { swingHighs, swingLows } = identifySwings(candles, 2);
  swingHighs.forEach((sh) => {
    rawCandidates.push({ price: sh.price, source: 'swing_high', recency: n - sh.index });
  });
  swingLows.forEach((sl) => {
    rawCandidates.push({ price: sl.price, source: 'swing_low', recency: n - sl.index });
  });

  // 2. 52-Week High and Low
  const closes = candles.map((c) => Number(c.close));
  const lookback52w = closes.slice(-252);
  const high52w = Math.max(...lookback52w);
  const low52w = Math.min(...lookback52w);
  rawCandidates.push({ price: high52w, source: '52w_high', recency: 0 });
  rawCandidates.push({ price: low52w, source: '52w_low', recency: 0 });

  // 3. 20-Day Range Extremes
  const lookback20 = candles.slice(-20);
  const high20d = Math.max(...lookback20.map((c) => Number(c.high)));
  const low20d = Math.min(...lookback20.map((c) => Number(c.low)));
  rawCandidates.push({ price: high20d, source: '20d_high', recency: 0 });
  rawCandidates.push({ price: low20d, source: '20d_low', recency: 0 });

  // 4. Classic Pivot Points
  try {
    const pivots = calculatePivotPoints(
      latestBar.high || currentPrice,
      latestBar.low || currentPrice,
      currentPrice
    );
    if (pivots.P) rawCandidates.push({ price: pivots.P, source: 'pivot_point', recency: 0 });
    if (pivots.R1) rawCandidates.push({ price: pivots.R1, source: 'pivot_r1', recency: 0 });
    if (pivots.S1) rawCandidates.push({ price: pivots.S1, source: 'pivot_s1', recency: 0 });
    if (pivots.R2) rawCandidates.push({ price: pivots.R2, source: 'pivot_r2', recency: 0 });
    if (pivots.S2) rawCandidates.push({ price: pivots.S2, source: 'pivot_s2', recency: 0 });
  } catch (_) {}

  // 5. Fibonacci Retracements
  try {
    const fibs = calculateFibonacci(high52w, low52w);
    if (fibs.level_382) rawCandidates.push({ price: fibs.level_382, source: 'fib_38.2%', recency: 0 });
    if (fibs.level_500) rawCandidates.push({ price: fibs.level_500, source: 'fib_50.0%', recency: 0 });
    if (fibs.level_618) rawCandidates.push({ price: fibs.level_618, source: 'fib_61.8%', recency: 0 });
  } catch (_) {}

  // Cluster nearby candidates within 1.2% threshold
  const sorted = rawCandidates.filter((c) => c.price > 0).sort((a, b) => a.price - b.price);
  const clusters = [];

  for (const item of sorted) {
    let matchedCluster = null;
    for (const cl of clusters) {
      const clusterAvg = cl.total / cl.count;
      if (Math.abs(item.price - clusterAvg) / clusterAvg <= 0.012) {
        matchedCluster = cl;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.items.push(item);
      matchedCluster.total += item.price;
      matchedCluster.count++;
      matchedCluster.sources.add(item.source);
      matchedCluster.minRecency = Math.min(matchedCluster.minRecency, item.recency);
    } else {
      clusters.push({
        total: item.price,
        count: 1,
        items: [item],
        sources: new Set([item.source]),
        minRecency: item.recency,
      });
    }
  }

  // Score cluster strength based on touches, source diversity, and recency
  const evaluatedLevels = clusters.map((cl) => {
    const avgPrice = Number((cl.total / cl.count).toFixed(2));
    const touchCount = cl.count;
    const sourceCount = cl.sources.size;
    const recencyFactor = Math.max(0.5, 1.0 - cl.minRecency / 100);

    // Multi-source confluence gives highest strength
    let strength = Math.min(95, touchCount * 18 + sourceCount * 14 + Math.round(recencyFactor * 15));
    if (cl.sources.has('52w_high') || cl.sources.has('52w_low')) strength = Math.max(strength, 85);

    return {
      price: avgPrice,
      strength: Math.min(95, Math.max(45, strength)),
      touches: touchCount,
      sources: Array.from(cl.sources),
      distancePct: Number((((avgPrice - currentPrice) / currentPrice) * 100).toFixed(2)),
    };
  });

  // Split into support (below current price) and resistance (above current price)
  const support = evaluatedLevels
    .filter((lvl) => lvl.price < currentPrice * 0.998)
    .sort((a, b) => b.price - a.price) // Closest support first
    .slice(0, 4);

  const resistance = evaluatedLevels
    .filter((lvl) => lvl.price > currentPrice * 1.002)
    .sort((a, b) => a.price - b.price) // Closest resistance first
    .slice(0, 4);

  return { support, resistance };
}

// ─────────────────────────────────────────────────────────────────────
// 4. BREAKOUT & RETEST ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Detects resistance breakout, support breakdown, range breakout, or traps.
 * @param {Array<{open: number, high: number, low: number, close: number, volume: number}>} candles
 * @param {{support: Array, resistance: Array}} srLevels
 * @param {number} [rvol=1.0] Relative volume
 * @returns {Object} Breakout evaluation
 */
export function analyzeBreakout(candles, srLevels, rvol = 1.0, atr = null) {
  if (!Array.isArray(candles) || candles.length < 5) {
    return {
      detected: false,
      type: 'none',
      direction: 'neutral',
      level: 0,
      breakoutPrice: 0,
      volumeConfirmed: false,
      retestConfirmed: false,
      strength: 0,
      description: 'No breakout detected.',
    };
  }

  const n = candles.length;
  const currentBar = candles[n - 1];
  const prevBar = candles[n - 2];

  const currentPrice = Number(currentBar.close);
  const prevPrice = Number(prevBar.close);
  const currentOpen = Number(currentBar.open || currentPrice);
  const currentHigh = Number(currentBar.high);
  const currentLow = Number(currentBar.low);

  const nearestResistance = srLevels.resistance && srLevels.resistance[0];
  const nearestSupport = srLevels.support && srLevels.support[0];

  const candleRange = Math.max(0.1, currentHigh - currentLow);
  const upperWick = currentHigh - Math.max(currentPrice, currentOpen);
  const upperWickRatio = upperWick / candleRange;
  const lowerWick = Math.min(currentPrice, currentOpen) - currentLow;
  const lowerWickRatio = lowerWick / candleRange;

  const currentAtr = Number(atr) || currentPrice * 0.025;
  // Volatility-buffered clearance threshold (prevents 10-paisa noise from triggering false breakouts)
  const clearanceBuffer = Math.max(currentPrice * 0.0035, currentAtr * 0.20);

  const isVolumeStrong = rvol >= 1.40;
  const isVolumeModerate = rvol >= 1.15;
  const volumeTier = isVolumeStrong ? 'strong' : isVolumeModerate ? 'moderate' : 'weak';

  // 1. Resistance Breakout
  if (nearestResistance && prevPrice <= nearestResistance.price && currentPrice > nearestResistance.price) {
    const isDecisiveClearance = currentPrice >= (nearestResistance.price + clearanceBuffer * 0.6);

    // If upper wick constitutes > 40% of range, sellers pushed back aggressively (bull trap / exhaustion)
    if (upperWickRatio >= 0.40) {
      return {
        detected: true,
        type: 'exhaustion_breakout',
        direction: 'neutral',
        level: nearestResistance.price,
        breakoutPrice: currentPrice,
        volumeConfirmed: isVolumeModerate,
        volumeTier,
        retestConfirmed: false,
        bullTrapRisk: true,
        strength: 55,
        description: `Caution: Breakout attempt above Rs. ${nearestResistance.price} met upper-wick rejection (${Math.round(upperWickRatio * 100)}% shadow). High risk of bull trap.`,
      };
    }

    if (isDecisiveClearance) {
      const strength = Math.min(
        95,
        nearestResistance.strength + (isVolumeStrong ? 14 : isVolumeModerate ? 6 : -10)
      );

      return {
        detected: true,
        type: 'resistance_breakout',
        direction: 'bullish',
        level: nearestResistance.price,
        breakoutPrice: currentPrice,
        volumeConfirmed: isVolumeModerate,
        volumeTier,
        retestConfirmed: false,
        bullTrapRisk: false,
        strength,
        description: isVolumeStrong
          ? `Confirmed Resistance Breakout: Decisive close above Rs. ${nearestResistance.price} with strong ${rvol}x volume expansion.`
          : isVolumeModerate
          ? `Resistance Breakout: Price closed cleanly above Rs. ${nearestResistance.price} with moderate volume (${rvol}x).`
          : `Unconfirmed Breakout: Price cleared Rs. ${nearestResistance.price} but lacks volume conviction (${rvol}x vs 1.15x required). Watch for retest.`,
      };
    } else {
      return {
        detected: true,
        type: 'tentative_breakout',
        direction: 'neutral',
        level: nearestResistance.price,
        breakoutPrice: currentPrice,
        volumeConfirmed: isVolumeModerate,
        volumeTier,
        retestConfirmed: false,
        bullTrapRisk: false,
        strength: 58,
        description: `Probing Resistance: Price tested Rs. ${nearestResistance.price} but has not achieved decisive clearance (+${clearanceBuffer.toFixed(1)} buffer required).`,
      };
    }
  }

  // 2. Breakout Retest (tested broken resistance from above and held)
  if (
    nearestResistance &&
    Math.abs(currentLow - nearestResistance.price) / nearestResistance.price <= 0.015 &&
    currentPrice >= nearestResistance.price &&
    prevPrice >= nearestResistance.price
  ) {
    return {
      detected: true,
      type: 'breakout_retest',
      direction: 'bullish',
      level: nearestResistance.price,
      breakoutPrice: currentPrice,
      volumeConfirmed: isVolumeModerate,
      volumeTier,
      retestConfirmed: true,
      bullTrapRisk: false,
      strength: 88,
      description: `Breakout Retest Confirmed: Price pulled back to former resistance at Rs. ${nearestResistance.price} and found supportive buyers.`,
    };
  }

  // 3. Failed Breakout (Bull Trap)
  if (
    nearestResistance &&
    currentHigh > nearestResistance.price &&
    currentPrice < nearestResistance.price &&
    upperWickRatio >= 0.45
  ) {
    return {
      detected: true,
      type: 'failed_breakout',
      direction: 'bearish',
      level: nearestResistance.price,
      breakoutPrice: currentPrice,
      volumeConfirmed: isVolumeModerate,
      volumeTier,
      retestConfirmed: false,
      bullTrapRisk: true,
      strength: 80,
      description: `Failed Breakout (Bull Trap): Intraday rally above Rs. ${nearestResistance.price} was rejected (${Math.round(upperWickRatio * 100)}% upper shadow), closing below resistance.`,
    };
  }

  // 4. Bear Trap Reversal at Support
  if (
    nearestSupport &&
    currentLow < nearestSupport.price &&
    currentPrice >= nearestSupport.price &&
    lowerWickRatio >= 0.45
  ) {
    return {
      detected: true,
      type: 'bear_trap_reversal',
      direction: 'bullish',
      level: nearestSupport.price,
      breakoutPrice: currentPrice,
      volumeConfirmed: isVolumeModerate,
      volumeTier,
      retestConfirmed: false,
      bullTrapRisk: false,
      strength: 78,
      description: `Bear Trap Reversal: Intraday dip beneath Rs. ${nearestSupport.price} was aggressively absorbed (${Math.round(lowerWickRatio * 100)}% lower wick).`,
    };
  }

  // 5. Support Breakdown
  if (nearestSupport && prevPrice >= nearestSupport.price && currentPrice < nearestSupport.price - clearanceBuffer * 0.5) {
    const strength = Math.min(95, nearestSupport.strength + (isVolumeStrong ? 14 : isVolumeModerate ? 6 : -5));
    return {
      detected: true,
      type: 'support_breakdown',
      direction: 'bearish',
      level: nearestSupport.price,
      breakoutPrice: currentPrice,
      volumeConfirmed: isVolumeModerate,
      volumeTier,
      retestConfirmed: false,
      bullTrapRisk: false,
      strength,
      description: `Support Breakdown: Price breached key support level at Rs. ${nearestSupport.price}.`,
    };
  }

  return {
    detected: false,
    type: 'none',
    direction: 'neutral',
    level: 0,
    breakoutPrice: currentPrice,
    volumeConfirmed: false,
    volumeTier: 'none',
    retestConfirmed: false,
    bullTrapRisk: false,
    strength: 0,
    description: 'Price is trading within established support and resistance boundaries.',
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5. COMBINED PRICE ACTION SUITE
// ─────────────────────────────────────────────────────────────────────

/**
 * Runs the complete Price Action engine over candles.
 * @param {Array<{open: number, high: number, low: number, close: number, volume: number, date?: string}>} candles
 * @param {number} [rvol=1.0]
 * @param {number} [atr=null]
 * @returns {Object} Complete Price Action Report
 */
export function analyzePriceAction(candles, rvol = 1.0, atr = null) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return {
      supported: false,
      reason: 'Need at least 10 candles for price action analysis.',
    };
  }

  const structure = analyzeMarketStructure(candles);
  const candlestick = analyzeCandlestickPattern(candles);
  const sr = analyzeSupportResistance(candles);
  const breakout = analyzeBreakout(candles, sr, rvol, atr);

  // Score Price Action (0 - 100)
  let paScore = structure.strength;
  if (candlestick) {
    if (candlestick.direction === 'bullish') paScore = Math.min(95, paScore + 10);
    else if (candlestick.direction === 'bearish') paScore = Math.max(10, paScore - 10);
  }
  if (breakout.detected) {
    if (breakout.direction === 'bullish') paScore = Math.min(95, paScore + 12);
    else if (breakout.direction === 'bearish') paScore = Math.max(10, paScore - 12);
  }

  return {
    supported: true,
    score: paScore,
    structure,
    candlestick,
    supportResistance: sr,
    breakout,
  };
}
