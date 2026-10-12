/**
 * Accumulation & Distribution Quantitative Engine (NEPSE Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Combines classical mathematical models (Marc Chaikin ADL & CMF, Granville OBV,
 * Tom Williams Volume Spread Analysis, Richard Wyckoff Schematics) with NEPSE's
 * unique market microstructure (T+2 settlement, 15% daily circuit bands, absence
 * of short selling, and transparent public floor sheet broker-level tracking).
 */

import { getCachedRealPriceHistory } from './historyCache.js';

export interface Candle {
  date?: string;
  time?: string;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ADLPoint {
  date?: string;
  close: number;
  high: number;
  low: number;
  volume: number;
  mfm: number;
  mfv: number;
  adl: number;
}

export interface ADLResult {
  currentADL: number;
  latestMFM: number;
  latestMFV: number;
  trend: 'Accumulation' | 'Distribution' | 'Neutral';
  divergence: 'Bullish Accumulation Divergence' | 'Bearish Distribution Divergence' | 'Confirmed Trend' | 'None';
  points: ADLPoint[];
}

export interface CMFResult {
  cmf: number;
  signal: 'Strong Accumulation' | 'Moderate Accumulation' | 'Neutral' | 'Moderate Distribution' | 'Heavy Distribution';
  score: number; // 0 to 100
}

export interface OBVPoint {
  date?: string;
  close: number;
  volume: number;
  obv: number;
}

export interface OBVResult {
  currentOBV: number;
  obvSMA20: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  points: OBVPoint[];
}

export interface BrokerDetail {
  broker: string;
  brokerName: string;
  volume: number;
  amount: number;
  pct: number;
  netQty: number;
  netAmount: number;
}

export interface BrokerConcentrationResult {
  symbol: string;
  totalBuyVolume: number;
  totalSellVolume: number;
  netVolume: number;
  bcr3BuyPct: number; // Top 3 Broker Buy %
  bcr5BuyPct: number; // Top 5 Broker Buy %
  bcr3SellPct: number; // Top 3 Broker Sell %
  topBuyerBrokers: BrokerDetail[];
  topSellerBrokers: BrokerDetail[];
  topNetAccumulators: BrokerDetail[];
  topNetDistributors: BrokerDetail[];
  avgBuyTradeSize: number;
  avgSellTradeSize: number;
  tradeSizeRatio: number; // Avg Buy Size / Avg Sell Size
  smartMoneyBias: 'Institutional Cornering' | 'Retail Absorption' | 'Operator Offloading' | 'Neutral' | 'Insufficient Data';
  asymmetryRatio?: number; // BCR3 Buy / (BCR3 Sell || 1)
  netAbsorptionRatio?: number; // Net Buy / Gross Buy
  smartMoneyNetVolume?: number; // Real net volume accumulated by smart money players
  totalSessionVolume?: number;  // Full session market traded volume
  status?: 'insufficient_history' | 'insufficient_sample' | 'complete';
  isInsufficientSample?: boolean;
  sampleValidity?: 'VALID' | 'INSUFFICIENT_SAMPLE' | 'CROSS_TRADE';
  description?: string;
}

export interface QAIResult {
  qaiScore: number; // 0 to 100 Quiet Accumulation Index
  isDay1StealthCandidate: boolean;
  priceTightnessScore: number; // 0 to 25
  asymmetryScore: number; // 0 to 30
  netAbsorptionScore: number; // 0 to 25
  floatImpactScore: number; // 0 to 20
  asymmetryRatio: number;
  netAbsorptionRatio: number;
  floatAbsorptionPct: number;
  reasons: string[];
}

export type WyckoffStage =
  | '🟢 STEALTH_ACCUMULATION'  // Phase B: Silent buying by smart money at bottoms
  | '⚡ SPRING_SHAKEOUT'        // Phase C: Deliberate false breakdown to trigger retail stops
  | '🚀 ACTIVE_PUMP_MARKUP'    // Phase D/E: Aggressive price markup, high demand
  | '⚠️ EUPHORIA_DISTRIBUTION' // Phase A/B/C Distribution: Churning at peak, top brokers selling
  | '🔴 ACTIVE_DUMP'           // Phase E Markdown: Panic selling, circuit traps
  | '💤 DORMANT_CONSOLIDATION';// Rangebound, neutral volume

export interface EffortVsResultResult {
  churnRisk: 'HIGH_DISTRIBUTION_CHURN' | 'MODERATE_CHURN' | 'ABSORPTION_FLOOR' | 'NORMAL';
  churnScore: number; // 0 to 100
  effortRatio: number; // RVOL (Today volume / 20 SMA volume)
  resultRatio: number; // Candle body / Range ratio
  wickRatio: number;   // Upper wick / Range ratio
  description: string;
}

export interface VolumeDryUpResult {
  isVDU: boolean;
  vduRatio: number; // Today volume / 20 SMA volume
  isCoil: boolean;  // Narrow range bar
  spreadTightnessPct: number; // (High - Low) / Close %
  score: number;    // 0 to 100
  description: string;
}

export interface LeadingOBVResult {
  signal: 'BULLISH_LEAD' | 'BEARISH_LEAD' | 'NEUTRAL';
  obvScore: number; // 0 to 100
  obvRankPct: number;
  priceRankPct: number;
  divergenceSpread: number;
  description: string;
}

export interface EarlyDetectionSignals {
  effortVsResult: EffortVsResultResult;
  volumeDryUp: VolumeDryUpResult;
  leadingOBV: LeadingOBVResult;
  earlyBadge?: string;
  earlyAlertVerdict: 'EARLY_ACCUMULATION_COIL' | 'EARLY_DISTRIBUTION_CHURN' | 'NEUTRAL';
}

export interface StockWyckoffAnalysis {
  stage: WyckoffStage;
  stageNameNepali: string;
  stageDescription: string;
  stealthScore: number;     // 0-100 (Higher = stronger stealth accumulation)
  pumpDumpRiskScore: number;// 0-100 (Higher = severe dump/trap risk)
  qaiScore?: number;        // 0-100 Quiet Accumulation Index (Day 1 Stealth Metric)
  isDay1StealthCandidate?: boolean;
  qaiResult?: QAIResult;
  cmf: number;
  adlDivergence: string;
  tradeSizeRatio: number;
  topBuyerConcentrationPct: number;
  actionableGuidanceNepali: string;
  actionableGuidanceEnglish: string;
  earlySignals?: EarlyDetectionSignals;
  isDataSynthetic?: boolean;
  dataQuality?: 'REAL_HISTORY' | 'SYNTHETIC_GENERATED' | 'INTRADAY_ONLY';
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. DYNAMIC STOCK-SPECIFIC OHLCV CANDLE SYNTHESIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dynamic Stock-Specific Candle Synthesizer
 * Generates an authentic, mathematically sound multi-day OHLCV history tailored
 * strictly to that specific stock's live exchange profile:
 * - Anchored at today's exact live candle (open, high, low, close, volume, turnover)
 * - Yesterday's candle matches previousClose
 * - Historical trajectory guided by actual 52-week position, momentum (pChange), and sector volatility
 * - Seeded deterministically by symbol, so results are completely stable yet distinct across all 250+ scrips
 */
/**
 * Resolves genuine historical candle series for a stock.
 * Purged of all synthetic pseudo-random generators: NEVER manufactures fake historical candles.
 * Returns only genuine ingested historical candles or empty array.
 */
export function generateDynamicStockCandles(stock: any, days = 25): Candle[] {
  if (Array.isArray(stock?.candles) && stock.candles.length >= 10) {
    return stock.candles;
  }
  if (Array.isArray(stock?.history) && stock.history.length >= 10) {
    return stock.history.map((h: any) => ({
      date: h.date || h.businessDate || '',
      open: Number(h.open || h.close || 0),
      high: Number(h.high || h.close || 0),
      low: Number(h.low || h.close || 0),
      close: Number(h.close || 0),
      volume: Number(h.volume || 0)
    }));
  }
  const sym = String(stock?.symbol || stock?.scrip || '').toUpperCase().trim();
  if (sym) {
    const cached = getCachedRealPriceHistory(sym);
    if (Array.isArray(cached) && cached.length >= 10) {
      return cached.map((h: any) => ({
        date: h.date || h.businessDate || '',
        open: Number(h.open || h.close || 0),
        high: Number(h.high || h.close || 0),
        low: Number(h.low || h.close || 0),
        close: Number(h.close || 0),
        volume: Number(h.volume || 0)
      }));
    }
  }
  // Refuse to disguise a 1-day bar as historical multi-session candles.
  // Downstream quantitative engines must receive an authentic >=10 bar series or handle empty array.
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLASSICAL MATHEMATICAL FORMULATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Chaikin Accumulation / Distribution Line (ADL)
 * Formula:
 *   MFM = ((Close - Low) - (High - Close)) / (High - Low)
 *   MFV = MFM * Volume
 *   ADL_t = ADL_{t-1} + MFV_t
 */
export function calculateChaikinADL(candles: Candle[]): ADLResult {
  if (!Array.isArray(candles) || candles.length < 2) {
    return {
      currentADL: 0,
      latestMFM: 0,
      latestMFV: 0,
      trend: 'Neutral',
      divergence: 'None',
      points: []
    };
  }

  let cumulativeADL = 0;
  const points: ADLPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const high = Number(c.high) || Number(c.close) || 100;
    const low = Number(c.low) || Number(c.close) || 100;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    const range = high - low;
    // Money Flow Multiplier (CLV) is normalized to [-1, 1]
    const mfm = range > 0.0001
      ? Math.max(-1, Math.min(1, ((close - low) - (high - close)) / range))
      : 0;

    const mfv = mfm * volume;
    cumulativeADL += mfv;

    points.push({
      date: c.date || c.time,
      close,
      high,
      low,
      volume,
      mfm: Number(mfm.toFixed(4)),
      mfv: Math.round(mfv),
      adl: Math.round(cumulativeADL)
    });
  }

  const latest = points[points.length - 1];
  const first = points[0];
  const adlDelta = latest.adl - first.adl;
  const priceDelta = latest.close - first.close;

  let trend: ADLResult['trend'] = 'Neutral';
  if (adlDelta > 0) trend = 'Accumulation';
  else if (adlDelta < 0) trend = 'Distribution';

  // Divergence analysis over lookback window (e.g. last 14 bars)
  const lookback = Math.min(14, points.length);
  const baseline = points[points.length - lookback];
  const recentPriceChange = latest.close - baseline.close;
  const recentADLChange = latest.adl - baseline.adl;

  let divergence: ADLResult['divergence'] = 'None';
  if (recentPriceChange < 0 && recentADLChange > 0) {
    divergence = 'Bullish Accumulation Divergence';
  } else if (recentPriceChange > 0 && recentADLChange < 0) {
    divergence = 'Bearish Distribution Divergence';
  } else if (recentPriceChange > 0 && recentADLChange > 0) {
    divergence = 'Confirmed Trend';
  }

  return {
    currentADL: latest.adl,
    latestMFM: latest.mfm,
    latestMFV: latest.mfv,
    trend,
    divergence,
    points
  };
}

/**
 * 2. Chaikin Money Flow (CMF, 20-period standard)
 * Formula:
 *   CMF = Sum(MFV, 20) / Sum(Volume, 20)
 * Bounds: [-1.0, +1.0]
 */
export function calculateCMF(candles: Candle[], period = 20): CMFResult {
  if (!Array.isArray(candles) || candles.length < 5) {
    return { cmf: 0, signal: 'Neutral', score: 50 };
  }

  const windowCandles = candles.slice(-Math.min(period, candles.length));
  let sumMFV = 0;
  let sumVolume = 0;

  for (const c of windowCandles) {
    const high = Number(c.high) || Number(c.close) || 100;
    const low = Number(c.low) || Number(c.close) || 100;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    const range = high - low;
    const mfm = range > 0.0001
      ? Math.max(-1, Math.min(1, ((close - low) - (high - close)) / range))
      : 0;

    sumMFV += mfm * volume;
    sumVolume += volume;
  }

  const rawCMF = sumVolume > 0 ? sumMFV / sumVolume : 0;
  const cmf = Number(Math.max(-1, Math.min(1, rawCMF)).toFixed(3));

  let signal: CMFResult['signal'] = 'Neutral';
  if (cmf >= 0.15) signal = 'Strong Accumulation';
  else if (cmf >= 0.05) signal = 'Moderate Accumulation';
  else if (cmf <= -0.15) signal = 'Heavy Distribution';
  else if (cmf <= -0.05) signal = 'Moderate Distribution';

  // Normalize to 0-100 score: CMF = -0.30 -> 0, CMF = 0 -> 50, CMF = +0.30 -> 100
  const normalizedScore = Math.round(Math.max(0, Math.min(100, 50 + (cmf / 0.30) * 50)));

  return { cmf, signal, score: normalizedScore };
}

/**
 * 3. On-Balance Volume (OBV)
 */
export function calculateOBV(candles: Candle[]): OBVResult {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { currentOBV: 0, obvSMA20: 0, trend: 'Neutral', points: [] };
  }

  let cumulativeOBV = 0;
  const points: OBVPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? (candles[i - 1].close || c.close) : c.close;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    if (close > prevClose) {
      cumulativeOBV += volume;
    } else if (close < prevClose) {
      cumulativeOBV -= volume;
    }

    points.push({
      date: c.date || c.time,
      close,
      volume,
      obv: cumulativeOBV
    });
  }

  // 20-period SMA of OBV
  const recent = points.slice(-20);
  const obvSMA20 = Math.round(recent.reduce((acc, p) => acc + p.obv, 0) / Math.max(1, recent.length));
  const currentOBV = points[points.length - 1].obv;

  const trend: OBVResult['trend'] =
    currentOBV > obvSMA20 * 1.02 ? 'Bullish' : currentOBV < obvSMA20 * 0.98 ? 'Bearish' : 'Neutral';

  return {
    currentOBV,
    obvSMA20,
    trend,
    points
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.5 EARLY DETECTION QUANTITATIVE MODELS (WYCKOFF 3RD LAW, VDU, LEADING OBV)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wyckoff 3rd Law: Effort vs. Result & Churn Divergence Index
 * Extreme effort (high volume) with negligible result (narrow body, high upper wick)
 * signals institutional distribution into retail market orders.
 * Conversely, heavy volume holding support with strong close indicates passive absorption.
 */
export function calculateEffortVsResult(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): EffortVsResultResult {
  const pChange = Number(stock?.pChange || 0);
  const ltp = Number(stock?.ltp || stock?.closePrice || 100);

  // Calculate 20-period average volume
  let effortRatio = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);
  if (Array.isArray(candles) && candles.length >= 5) {
    const valid = candles.filter(c => Number(c.volume || 0) > 0);
    if (valid.length > 0) {
      const slice = valid.slice(-20);
      const smaVol20 = Math.max(1, Math.round(slice.reduce((acc, c) => acc + Number(c.volume || 0), 0) / slice.length));
      const currentVol = Number(stock?.volume || stock?.totalTradedQuantity || candles[candles.length - 1].volume || smaVol20);
      effortRatio = Number((currentVol / smaVol20).toFixed(2));
    }
  }

  // Evaluate latest candle body & wick ratios
  let high = ltp;
  let low = ltp;
  let open = ltp;
  let close = ltp;

  if (Array.isArray(candles) && candles.length > 0) {
    const last = candles[candles.length - 1];
    high = Number(last.high || ltp);
    low = Number(last.low || ltp);
    open = Number(last.open || ltp);
    close = Number(last.close || ltp);
  } else {
    high = Number(stock?.high || stock?.highPrice || ltp);
    low = Number(stock?.low || stock?.lowPrice || ltp);
    open = Number(stock?.open || stock?.openPrice || ltp);
    close = ltp;
  }

  const range = Math.max(0.5, high - low);
  const body = Math.abs(close - open);
  const resultRatio = Number((body / range).toFixed(2));
  const upperWick = Math.max(0, high - Math.max(open, close));
  const wickRatio = Number((upperWick / range).toFixed(2));

  // Determine Churn Risk & Effort vs Result State
  let churnRisk: EffortVsResultResult['churnRisk'] = 'NORMAL';
  let churnScore = 20;
  let description = 'Volume effort is in equilibrium with candle price progression.';

  const isSellerDominance = (brokerFlow && brokerFlow.bcr3SellPct >= 38) || (brokerFlow?.smartMoneyBias === 'Operator Offloading');

  if (effortRatio >= 1.6 && (resultRatio <= 0.35 || wickRatio >= 0.42)) {
    if (pChange >= -0.5 || isSellerDominance) {
      churnRisk = 'HIGH_DISTRIBUTION_CHURN';
      churnScore = Math.min(95, Math.round(55 + (effortRatio - 1.6) * 15 + wickRatio * 25));
      description = `High Volume Churn (Effort without Result): Heavy turnover (${effortRatio.toFixed(1)}x) with tiny progress and ${(wickRatio * 100).toFixed(0)}% upper rejection wick. Operators offloading into retail buying frenzy.`;
    } else if (close >= low + range * 0.60) {
      churnRisk = 'ABSORPTION_FLOOR';
      churnScore = 30;
      description = `Passive Absorption Floor: Heavy volume (${effortRatio.toFixed(1)}x) trading at support with strong close. Institutional buyers absorbing selling pressure.`;
    }
  } else if (effortRatio >= 1.3 && wickRatio >= 0.38) {
    churnRisk = 'MODERATE_CHURN';
    churnScore = 48;
    description = `Moderate Supply Resistance: Upper wick ${(wickRatio * 100).toFixed(0)}% on above-average volume. Supply overhead present.`;
  } else if (effortRatio >= 1.4 && pChange <= -0.5 && close >= low + range * 0.65) {
    churnRisk = 'ABSORPTION_FLOOR';
    churnScore = 25;
    description = 'Absorption Floor: High volume with price closing near session highs despite negative market breadth.';
  }

  return {
    churnRisk,
    churnScore,
    effortRatio,
    resultRatio,
    wickRatio,
    description
  };
}

/**
 * Wyckoff Phase C Volume Dry-Up (VDU) & Volatility Contraction Pattern (VCP)
 * When volume shrinks to record lows during tight consolidation, floating supply is exhausted.
 * This is the #1 earliest indicator of an imminent breakout markup.
 */
export function calculateVolumeDryUp(
  stock: any,
  candles: Candle[] = []
): VolumeDryUpResult {
  const ltp = Number(stock?.ltp || stock?.closePrice || 100);

  let vduRatio = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);
  if (Array.isArray(candles) && candles.length >= 5) {
    const valid = candles.filter(c => Number(c.volume || 0) > 0);
    if (valid.length > 0) {
      const slice = valid.slice(-20);
      const smaVol20 = Math.max(1, Math.round(slice.reduce((acc, c) => acc + Number(c.volume || 0), 0) / slice.length));
      const currentVol = Number(stock?.volume || stock?.totalTradedQuantity || candles[candles.length - 1].volume || smaVol20);
      vduRatio = Number((currentVol / smaVol20).toFixed(2));
    }
  }

  let high = ltp;
  let low = ltp;
  if (Array.isArray(candles) && candles.length > 0) {
    const last = candles[candles.length - 1];
    high = Number(last.high || ltp);
    low = Number(last.low || ltp);
  } else {
    high = Number(stock?.high || stock?.highPrice || ltp);
    low = Number(stock?.low || stock?.lowPrice || ltp);
  }

  const range = high - low;
  const spreadTightnessPct = ltp > 0 ? Number(((range / ltp) * 100).toFixed(2)) : 2.0;

  // Check if range is an NR4/NR7 (narrowest range in 4 or 7 sessions)
  let isNarrowestRange = false;
  if (Array.isArray(candles) && candles.length >= 4) {
    const recentRanges = candles.slice(-4).map(c => Number(c.high || 0) - Number(c.low || 0));
    const minRange = Math.min(...recentRanges);
    if (range <= minRange * 1.05) {
      isNarrowestRange = true;
    }
  }

  const isVDU = vduRatio <= 0.55 && vduRatio > 0;
  const isCoil = spreadTightnessPct <= 2.2 || isNarrowestRange;

  let score = 20;
  let description = 'Normal liquidity activity.';

  if (isVDU && isCoil) {
    score = Math.min(95, Math.round(75 + (0.55 - vduRatio) * 35));
    description = `Wyckoff Phase C Dry-Up: Volume dried up to ${vduRatio.toFixed(2)}x normal with a tight ${spreadTightnessPct}% coil. Sellers exhausted; primed for immediate markup.`;
  } else if (isVDU) {
    score = 65;
    description = `Low volume dry-up (${vduRatio.toFixed(2)}x avg). Selling pressure waning.`;
  } else if (isCoil) {
    score = 55;
    description = `Volatility contraction (${spreadTightnessPct}% range). Tight price coil forming.`;
  }

  return {
    isVDU,
    vduRatio,
    isCoil,
    spreadTightnessPct,
    score,
    description
  };
}

/**
 * Leading On-Balance Volume (OBV) Breakout / Breakdown Divergence
 * Compares 15-day OBV rank against Price rank to detect stealth accumulation/distribution
 * before price makes its breakout move.
 */
export function calculateLeadingOBVDivergence(
  candles: Candle[] = []
): LeadingOBVResult {
  if (!Array.isArray(candles) || candles.length < 10) {
    return {
      signal: 'NEUTRAL',
      obvScore: 50,
      obvRankPct: 50,
      priceRankPct: 50,
      divergenceSpread: 0,
      description: 'Insufficient candle history for leading OBV divergence.'
    };
  }

  const obvResult = calculateOBV(candles);
  const pts = obvResult.points.slice(-15);
  if (pts.length < 5) {
    return {
      signal: 'NEUTRAL',
      obvScore: 50,
      obvRankPct: 50,
      priceRankPct: 50,
      divergenceSpread: 0,
      description: 'Insufficient OBV points.'
    };
  }

  const currentOBV = pts[pts.length - 1].obv;
  const currentPrice = pts[pts.length - 1].close;

  const minOBV = Math.min(...pts.map(p => p.obv));
  const maxOBV = Math.max(...pts.map(p => p.obv));
  const obvRange = maxOBV - minOBV;
  const obvRankPct = obvRange > 0 ? Math.round(((currentOBV - minOBV) / obvRange) * 100) : 50;

  const minPrice = Math.min(...pts.map(p => p.close));
  const maxPrice = Math.max(...pts.map(p => p.close));
  const priceRange = maxPrice - minPrice;
  const priceRankPct = priceRange > 0 ? Math.round(((currentPrice - minPrice) / priceRange) * 100) : 50;

  const divergenceSpread = obvRankPct - priceRankPct;

  let signal: LeadingOBVResult['signal'] = 'NEUTRAL';
  let obvScore = 50;
  let description = 'OBV volume matches price trend.';

  if (divergenceSpread >= 35 && obvRankPct >= 75) {
    signal = 'BULLISH_LEAD';
    obvScore = 85;
    description = `Bullish Leading OBV Divergence: Volume flow (OBV ${obvRankPct}th percentile) is breaking out well ahead of price (${priceRankPct}th percentile). Stealth accumulation in progress.`;
  } else if (divergenceSpread <= -35 && obvRankPct <= 35 && priceRankPct >= 65) {
    signal = 'BEARISH_LEAD';
    obvScore = 15;
    description = `Bearish Leading OBV Divergence: Volume flow is breaking down (OBV ${obvRankPct}th percentile) while price is kept at highs (${priceRankPct}th percentile). Distribution taking place.`;
  }

  return {
    signal,
    obvScore,
    obvRankPct,
    priceRankPct,
    divergenceSpread,
    description
  };
}

/**
 * Composite Early Detection Signals Evaluator
 */
export function evaluateEarlyDetectionSignals(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): EarlyDetectionSignals {
  const effortVsResult = calculateEffortVsResult(stock, candles, brokerFlow);
  const volumeDryUp = calculateVolumeDryUp(stock, candles);
  const leadingOBV = calculateLeadingOBVDivergence(candles);

  let earlyAlertVerdict: EarlyDetectionSignals['earlyAlertVerdict'] = 'NEUTRAL';
  let earlyBadge: string | undefined = undefined;

  const isAccumulationStage =
    (stock?.wyckoff?.stage && (stock.wyckoff.stage.includes('ACCUMULATION') || stock.wyckoff.stage.includes('SPRING'))) ||
    (brokerFlow && brokerFlow.bcr3BuyPct >= 40 && brokerFlow.bcr3BuyPct > brokerFlow.bcr3SellPct) ||
    (stock?.cmf20 && stock.cmf20 >= 0.02);

  if (effortVsResult.churnRisk === 'HIGH_DISTRIBUTION_CHURN') {
    earlyAlertVerdict = 'EARLY_DISTRIBUTION_CHURN';
    earlyBadge = '⚖️ Effort Churn Trap';
  } else if (leadingOBV.signal === 'BEARISH_LEAD' && !isAccumulationStage && (stock?.wyckoff?.stage?.includes('DISTRIBUTION') || stock?.wyckoff?.stage?.includes('DUMP') || (stock?.pChange || 0) < -1.5)) {
    earlyAlertVerdict = 'EARLY_DISTRIBUTION_CHURN';
    earlyBadge = '📉 OBV Distribution Lead';
  } else if (volumeDryUp.isVDU && volumeDryUp.isCoil) {
    earlyAlertVerdict = 'EARLY_ACCUMULATION_COIL';
    earlyBadge = '⏳ VDU Supply Exhaustion';
  } else if (leadingOBV.signal === 'BULLISH_LEAD') {
    earlyAlertVerdict = 'EARLY_ACCUMULATION_COIL';
    earlyBadge = '📈 OBV Accumulation Lead';
  } else if (effortVsResult.churnRisk === 'ABSORPTION_FLOOR') {
    earlyAlertVerdict = 'EARLY_ACCUMULATION_COIL';
    earlyBadge = '🛡️ Passive Bid Absorption';
  } else if (isAccumulationStage) {
    earlyAlertVerdict = 'EARLY_ACCUMULATION_COIL';
    earlyBadge = '🟢 Smart Absorption Base';
  }

  return {
    effortVsResult,
    volumeDryUp,
    leadingOBV,
    earlyBadge,
    earlyAlertVerdict
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NEPSE FLOOR SHEET & MICROSTRUCTURE MODELS
// ─────────────────────────────────────────────────────────────────────────────

export const NEPSE_BROKER_NAMES: Record<string, string> = {
  '1': 'Kumari Securities',
  '2': 'Pandupati Associates',
  '3': 'Arun Securities',
  '4': 'Opal Securities Investment',
  '5': 'Market Securities Exchange',
  '6': 'Agrawal Securities',
  '7': 'Jwala Broker',
  '8': 'Ashutosh Brokerage',
  '10': 'Pragyan Securities',
  '11': 'Malla & Malla Stock',
  '13': 'Thrive Brokerage',
  '14': 'Nepal Stock House',
  '16': 'Primo Securities',
  '17': 'ABC Securities',
  '18': 'Sagarmatha Securities',
  '19': 'Nepal Investment & Securities',
  '20': 'Sipla Securities',
  '21': 'Midas Stock Broking',
  '22': 'Siprabi Securities',
  '25': 'Sweta Securities',
  '26': 'Asian Securities',
  '28': 'Shree Krishna Securities',
  '29': 'Trishakti Securities',
  '32': 'Premier Securities',
  '33': 'Dakshinkali Investment',
  '34': 'Vision Securities',
  '35': 'Kohinoor Investment',
  '36': 'Secured Securities',
  '37': 'Swarna Laxmi Securities',
  '38': 'Dipshikha Dhitopatra Karobar',
  '39': 'Sumeru Securities',
  '40': 'Creative Securities',
  '41': 'Linche Securities',
  '42': 'Sani Securities',
  '43': 'South Asian Bulls',
  '44': 'Dynamic Money Managers',
  '45': 'Imperial Securities',
  '46': 'Kalika Securities',
  '47': 'Nivana Capital Market',
  '48': 'Trishul Securities',
  '49': 'Online Securities',
  '50': 'Crystal Kanchenjunga',
  '51': 'Oxford Securities',
  '52': 'Sundhara Securities',
  '53': 'Investment Management Nepal',
  '54': 'Sewa Securities',
  '55': 'Bhikshu Brokerage',
  '56': 'Sri Hari Securities',
  '57': 'Aryatara Investment & Securities',
  '58': 'Naasa Securities',
  '59': 'Premier Securities',
  '60': 'Garima Securities',
  '61': 'Bhole Ganesh Securities',
  '62': 'Capital Max Securities',
  '63': 'Himalayan Brokerage',
  '64': 'Sani Securities Ltd.',
  '65': 'Sun Securities',
  '66': 'Sharepro Securities',
  '67': 'Elite Stock'
};

export function getBrokerName(brokerId: string | number): string {
  const cleanId = String(brokerId || '').replace(/^0+/, '').trim();
  return NEPSE_BROKER_NAMES[cleanId] || `Broker #${cleanId || 'N/A'}`;
}

/**
 * Computes Broker Concentration (BCR) and Smart Money vs Retail trade ticket asymmetry.
 * In NEPSE, a high Average Buy Ticket Size vs Average Sell Ticket Size means
 * smart operators are buying up shares from small retail sellers.
 */
export function calculateBrokerConcentration(
  floorsheet: any[],
  targetSymbol: string,
  stockSummary?: any
): BrokerConcentrationResult {
  const normSym = String(targetSymbol || '').toUpperCase().trim();
  const trades = Array.isArray(floorsheet)
    ? floorsheet.filter((t: any) => {
        const s = String(t.symbol || t.stockSymbol || '').toUpperCase().trim();
        return s === normSym;
      })
    : [];

  const rba = stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
  const hasValidRba = rba && (rba.topBuyers?.length > 0 || rba.topNetBuyers?.length > 0 || rba.buyers?.length > 0);

  if (hasValidRba) {
    const rawBuyers = rba.topBuyers || rba.buyers || [];

    const rawSellers = rba.topSellers || rba.sellers || [];

    const topBuyers: BrokerDetail[] = rawBuyers.slice(0, 5).map((b: any) => {
      const id = String(b.broker || b.brokerNo || b.memberId || b.id || b.brokerId || '').trim();
      const vol = Number(b.buyQty || b.shares || b.qty || b.volume || 0);
      const amt = Number(b.buyAmt || b.amount || b.buyAmount || (vol * (stockSummary?.ltp || 0)));
      return {
        broker: id,
        brokerName: b.name || b.brokerName || getBrokerName(id),
        volume: vol,
        amount: amt,
        pct: Number(b.pct || 0),
        netQty: Number(b.netQty || vol),
        netAmount: Number(b.netAmt || amt)
      };
    });

    const topSellers: BrokerDetail[] = rawSellers.slice(0, 5).map((s: any) => {
      const id = String(s.broker || s.brokerNo || s.memberId || s.id || s.brokerId || '').trim();
      const vol = Number(s.sellQty || s.shares || s.qty || s.volume || 0);
      const amt = Number(s.sellAmt || s.amount || s.sellAmount || (vol * (stockSummary?.ltp || 0)));
      return {
        broker: id,
        brokerName: s.name || s.brokerName || getBrokerName(id),
        volume: vol,
        amount: amt,
        pct: Number(s.pct || 0),
        netQty: Number(s.netQty || -vol),
        netAmount: Number(s.netAmt || -amt)
      };
    });

    const topNetAccumulators: BrokerDetail[] = (rba.topNetBuyers || topBuyers.filter(b => b.netQty > 0)).slice(0, 5).map((b: any) => {
      const id = String(b.broker || b.brokerNo || b.memberId || b.id || b.brokerId || '').trim();
      const vol = Number(b.netQty || b.buyQty || b.volume || 0);
      const amt = Number(b.netAmt || b.buyAmt || b.amount || (vol * (stockSummary?.ltp || 0)));
      return {
        broker: id,
        brokerName: b.name || b.brokerName || getBrokerName(id),
        volume: Number(b.buyQty || vol),
        amount: amt,
        pct: Number(b.pct || 0),
        netQty: vol,
        netAmount: amt
      };
    });

    const topNetDistributors: BrokerDetail[] = (rba.topNetSellers || topSellers.filter(s => s.netQty < 0)).slice(0, 5).map((s: any) => {
      const id = String(s.broker || s.brokerNo || s.memberId || s.id || s.brokerId || '').trim();
      const vol = Math.abs(Number(s.netQty || s.sellQty || s.volume || 0));
      const amt = Math.abs(Number(s.netAmt || s.sellAmt || s.amount || (vol * (stockSummary?.ltp || 0))));
      return {
        broker: id,
        brokerName: s.name || s.brokerName || getBrokerName(id),
        volume: Number(s.sellQty || vol),
        amount: amt,
        pct: Number(s.pct || 0),
        netQty: -vol,
        netAmount: -amt
      };
    });

    const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
    const top5BuyVol = topBuyers.slice(0, 5).reduce((acc, b) => acc + b.volume, 0);
    const top3SellVol = topSellers.slice(0, 3).reduce((acc, s) => acc + s.volume, 0);
    const top5SellVol = topSellers.slice(0, 5).reduce((acc, s) => acc + s.volume, 0);

    const stockTotalVol = Number(
      stockSummary?.totalTradedQuantity ||
      stockSummary?.volume ||
      stockSummary?.totalVolume ||
      0
    );

    // Identify True Total Volume for the period
    const rbaTotalBuyVol = Number(
      rba.totalBuyVol ||
      rba.totalVolume ||
      rba.totalTradedQty ||
      rba.totalQty ||
      (Array.isArray(rba.brokers) && rba.brokers.length > 5
        ? rba.brokers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.volume || 0), 0)
        : 0) ||
      (rawBuyers.length > 5
        ? rawBuyers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0)
        : 0) ||
      (stockTotalVol > top5BuyVol ? stockTotalVol : 0)
    );

    const rbaTotalSellVol = Number(
      rba.totalSellVol ||
      rba.totalVolume ||
      rba.totalTradedQty ||
      rba.totalQty ||
      (Array.isArray(rba.brokers) && rba.brokers.length > 5
        ? rba.brokers.reduce((acc: number, b: any) => acc + Number(b.sellQty || b.volume || 0), 0)
        : 0) ||
      (rawSellers.length > 5
        ? rawSellers.reduce((acc: number, s: any) => acc + Number(s.sellQty || s.volume || s.shares || 0), 0)
        : 0) ||
      (stockTotalVol > top5SellVol ? stockTotalVol : 0)
    );

    let bcr5BuyPct = 0;
    let bcr3BuyPct = 0;
    let bcr3SellPct = 0;

    const authenticTop3to5Ratio = (top5BuyVol > 0 && top3BuyVol > 0) ? (top3BuyVol / top5BuyVol) : 0.72;

    // 1. Check if authentic concentration was already calculated at server/vault level
    if (rba.bcr3BuyPct !== undefined && Number(rba.bcr3BuyPct) > 0) {
      bcr3BuyPct = Number(rba.bcr3BuyPct);
      bcr5BuyPct = Number(rba.bcr5BuyPct || (bcr3BuyPct / authenticTop3to5Ratio).toFixed(1));
    } else if (rba.crb5 !== undefined && Number(rba.crb5) > 0) {
      bcr5BuyPct = Number((Number(rba.crb5) * 100).toFixed(1));
      bcr3BuyPct = Number((bcr5BuyPct * authenticTop3to5Ratio).toFixed(1));
    } else if (rba.bcr5BuyPct !== undefined && Number(rba.bcr5BuyPct) > 0) {
      bcr5BuyPct = Number(rba.bcr5BuyPct);
      bcr3BuyPct = Number((bcr5BuyPct * authenticTop3to5Ratio).toFixed(1));
    } else if (rba.concentrationPct !== undefined && Number(rba.concentrationPct) > 0) {
      bcr3BuyPct = Number(rba.concentrationPct);
      bcr5BuyPct = Number(Math.min(92.0, (bcr3BuyPct / authenticTop3to5Ratio)).toFixed(1));
    } else {
      // 2. Check if individual brokers have authentic pct shares whose sum is < 98%
      const sumBuyerPct = topBuyers.reduce((acc, b) => acc + b.pct, 0);
      if (sumBuyerPct > 0 && sumBuyerPct < 98.0) {
        bcr5BuyPct = Number(sumBuyerPct.toFixed(1));
        bcr3BuyPct = Number(topBuyers.slice(0, 3).reduce((acc, b) => acc + b.pct, 0).toFixed(1));
      } else {
        // 3. Compute from volumes against true total buy volume
        const effectiveBuyVol = rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : (stockTotalVol > 0 ? stockTotalVol : top5BuyVol);
        bcr5BuyPct = effectiveBuyVol > 0 ? Number(Math.min(100.0, (top5BuyVol / effectiveBuyVol) * 100).toFixed(1)) : 0;
        bcr3BuyPct = effectiveBuyVol > 0 ? Number(Math.min(bcr5BuyPct, (top3BuyVol / effectiveBuyVol) * 100).toFixed(1)) : 0;
      }
    }

    const effectiveSellVol = rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : (stockTotalVol > 0 ? stockTotalVol : top5SellVol);
    bcr3SellPct = effectiveSellVol > 0 ? Number(Math.min(100.0, (top3SellVol / effectiveSellVol) * 100).toFixed(1)) : 0;

    // Fill in individual pct for buyers/sellers against true market base
    const marketBuyBase = (rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : (stockTotalVol > 0 ? stockTotalVol : (bcr5BuyPct > 0 ? Math.round(top5BuyVol / (bcr5BuyPct / 100)) : top5BuyVol))) || 1;
    topBuyers.forEach(b => {
      b.pct = Number(((b.volume / marketBuyBase) * 100).toFixed(1));
    });

    const marketSellBase = (rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : (stockTotalVol > 0 ? stockTotalVol : (bcr3SellPct > 0 ? Math.round(top5SellVol / (bcr3SellPct / 100)) : top5SellVol))) || 1;
    topSellers.forEach(s => {
      s.pct = Number(((s.volume / marketSellBase) * 100).toFixed(1));
    });

    const totalBuyVol = rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : top5BuyVol;
    const totalSellVol = rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : top5SellVol;

    const totalTradesCount = Number(stockSummary?.transactions || stockSummary?.totalTransactions || rba.totalTrades || 0);
    const concAsymmetry = (bcr3SellPct > 0) ? (bcr3BuyPct / bcr3SellPct) : (bcr3BuyPct >= 40 ? 1.8 : 1.0);
    const baseTicket = totalTradesCount > 0 ? Math.round(totalBuyVol / totalTradesCount) : 400;
    const factor = Math.max(0.5, Math.min(3.5, Math.sqrt(concAsymmetry)));
    const avgBuyTradeSize = Math.round(baseTicket * factor);
    const avgSellTradeSize = Math.round(baseTicket / factor);
    const tradeSizeRatio = avgSellTradeSize > 0 ? Number((avgBuyTradeSize / avgSellTradeSize).toFixed(2)) : 1.0;

    let smartMoneyBias: BrokerConcentrationResult['smartMoneyBias'] = 'Neutral';
    if (bcr5BuyPct >= 48 && tradeSizeRatio >= 1.40) {
      smartMoneyBias = 'Institutional Cornering';
    } else if (bcr3SellPct >= 42 && tradeSizeRatio <= 0.70) {
      smartMoneyBias = 'Operator Offloading';
    } else if (bcr5BuyPct > bcr3SellPct && tradeSizeRatio >= 1.05) {
      smartMoneyBias = 'Retail Absorption';
    }

    const effectiveSellConc = bcr3SellPct > 0 ? bcr3SellPct : 15.0;
    const asymmetryRatio = Number((bcr3BuyPct / effectiveSellConc).toFixed(2));
    const top3NetBuy = topBuyers.slice(0, 3).reduce((acc, b) => acc + Math.max(0, b.netQty !== undefined ? b.netQty : b.volume), 0);
    const top3GrossBuy = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
    const netAbsorptionRatio = top3GrossBuy > 0 ? Number((top3NetBuy / top3GrossBuy).toFixed(2)) : 1.0;
    const smartMoneyNetKitta = topNetAccumulators.reduce((acc, b) => acc + (b.netQty > 0 ? b.netQty : 0), 0);

    return {
      symbol: normSym,
      totalBuyVolume: totalBuyVol,
      totalSellVolume: totalSellVol,
      netVolume: smartMoneyNetKitta > 0 ? smartMoneyNetKitta : (totalBuyVol - totalSellVol),
      smartMoneyNetVolume: smartMoneyNetKitta,
      totalSessionVolume: Math.max(totalBuyVol, stockTotalVol),
      bcr3BuyPct,
      bcr5BuyPct,
      bcr3SellPct,
      topBuyerBrokers: topBuyers,
      topSellerBrokers: topSellers,
      topNetAccumulators,
      topNetDistributors,
      avgBuyTradeSize,
      avgSellTradeSize,
      tradeSizeRatio,
      smartMoneyBias,
      asymmetryRatio,
      netAbsorptionRatio,
      status: 'complete'
    };
  }

  if (trades.length > 0) {

  const buyersMap = new Map<string, { volume: number; amount: number; count: number }>();
  const sellersMap = new Map<string, { volume: number; amount: number; count: number }>();
  let totalBuyVol = 0;
  let totalSellVol = 0;
  let totalBuyTrades = 0;
  let totalSellTrades = 0;

  trades.forEach((t: any) => {
    const qty = Number(t.quantity || t.qty || 0);
    const rate = Number(t.rate || t.price || 0);
    const amt = Number(t.amount || (qty * rate) || 0);
    const bId = String(t.buyer || t.buyerBroker || '').replace(/^0+/, '').trim();
    const sId = String(t.seller || t.sellerBroker || '').replace(/^0+/, '').trim();

    if (bId && qty > 0) {
      if (!buyersMap.has(bId)) buyersMap.set(bId, { volume: 0, amount: 0, count: 0 });
      const b = buyersMap.get(bId)!;
      b.volume += qty;
      b.amount += amt;
      b.count += 1;
      totalBuyVol += qty;
      totalBuyTrades += 1;
    }

    if (sId && qty > 0) {
      if (!sellersMap.has(sId)) sellersMap.set(sId, { volume: 0, amount: 0, count: 0 });
      const s = sellersMap.get(sId)!;
      s.volume += qty;
      s.amount += amt;
      s.count += 1;
      totalSellVol += qty;
      totalSellTrades += 1;
    }
  });

  const sortedBuyers: BrokerDetail[] = Array.from(buyersMap.entries())
    .map(([broker, data]) => {
      const sData = sellersMap.get(broker) || { volume: 0, amount: 0, count: 0 };
      return {
        broker,
        brokerName: getBrokerName(broker),
        volume: data.volume,
        amount: data.amount,
        pct: totalBuyVol > 0 ? Number(((data.volume / totalBuyVol) * 100).toFixed(1)) : 0,
        netQty: data.volume - sData.volume,
        netAmount: data.amount - sData.amount
      };
    })
    .sort((a, b) => b.volume - a.volume);

  const sortedSellers: BrokerDetail[] = Array.from(sellersMap.entries())
    .map(([broker, data]) => {
      const bData = buyersMap.get(broker) || { volume: 0, amount: 0, count: 0 };
      return {
        broker,
        brokerName: getBrokerName(broker),
        volume: data.volume,
        amount: data.amount,
        pct: totalSellVol > 0 ? Number(((data.volume / totalSellVol) * 100).toFixed(1)) : 0,
        netQty: bData.volume - data.volume,
        netAmount: bData.amount - data.amount
      };
    })
    .sort((a, b) => b.volume - a.volume);

  // Top Net Accumulators (Net Buyers: buyVol > sellVol)
  const allBrokers = Array.from(new Set([...buyersMap.keys(), ...sellersMap.keys()]));
  const enrichedBrokers = allBrokers.map(bId => {
    const b = buyersMap.get(bId) || { volume: 0, amount: 0, count: 0 };
    const s = sellersMap.get(bId) || { volume: 0, amount: 0, count: 0 };
    const netQty = b.volume - s.volume;
    const netAmount = b.amount - s.amount;
    return {
      broker: bId,
      brokerName: getBrokerName(bId),
      volume: b.volume,
      amount: b.amount,
      pct: totalBuyVol > 0 ? Number(((b.volume / totalBuyVol) * 100).toFixed(1)) : 0,
      netQty,
      netAmount
    };
  });

  const topNetAccumulators: BrokerDetail[] = enrichedBrokers
    .filter(b => b.netQty > 0)
    .sort((a, b) => b.netQty - a.netQty)
    .slice(0, 5);

  const topNetDistributors: BrokerDetail[] = enrichedBrokers
    .filter(b => b.netQty < 0)
    .sort((a, b) => a.netQty - b.netQty) // Most negative first
    .map(b => {
      const s = sellersMap.get(b.broker) || { volume: 0, amount: 0, count: 0 };
      return {
        ...b,
        volume: s.volume,
        amount: s.amount,
        pct: totalSellVol > 0 ? Number(((s.volume / totalSellVol) * 100).toFixed(1)) : 0
      };
    })
    .slice(0, 5);

  const top3BuyVol = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
  const top5BuyVol = sortedBuyers.slice(0, 5).reduce((acc, b) => acc + b.volume, 0);
  const top3SellVol = sortedSellers.slice(0, 3).reduce((acc, s) => acc + s.volume, 0);

  const stockTotalVol = Number(stockSummary?.totalTradedQuantity || stockSummary?.volume || 0);
  // Only use whole-day stockTotalVol if this floorsheet dataset represents >= 75% of total session volume.
  // Otherwise use totalBuyVol of the trades so we don't compute an artificial 1.6% ratio on a 25-trade sample.
  const effectiveMarketBuyVol = (stockTotalVol > 0 && totalBuyVol >= stockTotalVol * 0.75) ? stockTotalVol : (totalBuyVol > 0 ? totalBuyVol : 1);
  const effectiveMarketSellVol = (stockTotalVol > 0 && totalSellVol >= stockTotalVol * 0.75) ? stockTotalVol : (totalSellVol > 0 ? totalSellVol : 1);

  let bcr3BuyPct = 0;
  let bcr5BuyPct = 0;
  let bcr3SellPct = 0;

  if (effectiveMarketBuyVol > 0) {
    bcr5BuyPct = Number(Math.min(100.0, (top5BuyVol / effectiveMarketBuyVol) * 100).toFixed(1));
    bcr3BuyPct = Number(Math.min(bcr5BuyPct, (top3BuyVol / effectiveMarketBuyVol) * 100).toFixed(1));
  }

  if (effectiveMarketSellVol > 0) {
    bcr3SellPct = Number(Math.min(100.0, (top3SellVol / effectiveMarketSellVol) * 100).toFixed(1));
  }


  const top3BuyerTrades = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + (buyersMap.get(b.broker)?.count || 1), 0);
  const top3SellerTrades = sortedSellers.slice(0, 3).reduce((acc, s) => acc + (sellersMap.get(s.broker)?.count || 1), 0);
  const avgTopBuyerTradeSize = top3BuyerTrades > 0 ? Math.round(top3BuyVol / top3BuyerTrades) : 0;
  const avgTopSellerTradeSize = top3SellerTrades > 0 ? Math.round(top3SellVol / top3SellerTrades) : 0;
  const avgOverallSellerTradeSize = totalSellTrades > 0 ? Math.round(totalSellVol / totalSellTrades) : 1;
  const effectiveSellerTradeSize = avgTopSellerTradeSize > 0 ? avgTopSellerTradeSize : avgOverallSellerTradeSize;

  const concAsymmetry = (bcr3SellPct > 0) ? (bcr3BuyPct / bcr3SellPct) : (bcr3BuyPct >= 40 ? 1.8 : 1.0);
  
  // Direct ticket ratio from top buyer trades vs effective seller trades
  let tradeSizeRatio = effectiveSellerTradeSize > 0 ? Number((avgTopBuyerTradeSize / effectiveSellerTradeSize).toFixed(2)) : 1.0;
  
  // If trade sizes happen to be 1.0 due to 1:1 bilateral matching in the raw stream, factor in concentration asymmetry
  if (Math.abs(tradeSizeRatio - 1.0) < 0.05 && concAsymmetry > 0) {
    tradeSizeRatio = Number(Math.max(0.4, Math.min(4.0, concAsymmetry)).toFixed(2));
  }

  const baseTicket = totalBuyTrades > 0 ? Math.round(totalBuyVol / totalBuyTrades) : 350;
  const factor = Math.max(0.5, Math.min(3.5, Math.sqrt(tradeSizeRatio)));
  const avgBuyTradeSize = Math.round(baseTicket * factor);
  const avgSellTradeSize = Math.max(1, Math.round(baseTicket / factor));

  let smartMoneyBias: BrokerConcentrationResult['smartMoneyBias'] = 'Neutral';
  if (bcr5BuyPct >= 45 && tradeSizeRatio >= 1.5) {
    smartMoneyBias = 'Institutional Cornering';
  } else if (bcr3SellPct >= 45 && tradeSizeRatio <= 0.65) {
    smartMoneyBias = 'Operator Offloading';
  } else if (bcr5BuyPct > bcr3SellPct) {
    smartMoneyBias = 'Retail Absorption';
  }

  const effectiveSellConc = bcr3SellPct > 0 ? bcr3SellPct : 15.0;
  const asymmetryRatio = Number((bcr3BuyPct / effectiveSellConc).toFixed(2));
  const top3NetBuy = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + Math.max(0, b.netQty !== undefined ? b.netQty : b.volume), 0);
  const top3GrossBuy = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
  const netAbsorptionRatio = top3GrossBuy > 0 ? Number((top3NetBuy / top3GrossBuy).toFixed(2)) : 1.0;

  const isInsufficientSample = (trades.length <= 1 && totalBuyVol < 500) || totalBuyVol < 200;
  if (isInsufficientSample) {
    return {
      symbol: normSym,
      totalBuyVolume: totalBuyVol,
      totalSellVolume: totalSellVol,
      netVolume: 0,
      smartMoneyNetVolume: 0,
      totalSessionVolume: Math.max(totalBuyVol, stockTotalVol),
      bcr3BuyPct: 0,
      bcr5BuyPct: 0,
      bcr3SellPct: 0,
      topBuyerBrokers: sortedBuyers.slice(0, 5),
      topSellerBrokers: sortedSellers.slice(0, 5),
      topNetAccumulators: [],
      topNetDistributors: [],
      avgBuyTradeSize: Math.round(totalBuyVol / Math.max(1, totalBuyTrades)),
      avgSellTradeSize: Math.round(totalSellVol / Math.max(1, totalSellTrades)),
      tradeSizeRatio: 1.0,
      smartMoneyBias: 'Insufficient Data',
      asymmetryRatio: 1.0,
      netAbsorptionRatio: 1.0,
      status: 'insufficient_sample',
      isInsufficientSample: true,
      sampleValidity: 'INSUFFICIENT_SAMPLE',
      description: `Insufficient trade sample (${trades.length} trades, ${totalBuyVol} kitta). Thin volume prevents statistically valid broker concentration calculation.`
    };
  }

  // Cross-Trade / Internal Matched Transfer Filter
  const isMatchedCrossTrade = (bcr3BuyPct >= 95 && bcr3SellPct >= 95 && sortedBuyers[0]?.broker === sortedSellers[0]?.broker);
  const finalBias = isMatchedCrossTrade ? 'Neutral' : smartMoneyBias;
  const smartMoneyNetKitta = topNetAccumulators.reduce((acc, b) => acc + (b.netQty > 0 ? b.netQty : 0), 0);

  return {
    symbol: normSym,
    totalBuyVolume: totalBuyVol,
    totalSellVolume: totalSellVol,
    netVolume: smartMoneyNetKitta > 0 ? smartMoneyNetKitta : (totalBuyVol - totalSellVol),
    smartMoneyNetVolume: smartMoneyNetKitta,
    totalSessionVolume: Math.max(totalBuyVol, stockTotalVol),
    bcr3BuyPct: isMatchedCrossTrade ? Math.min(bcr3BuyPct, 45) : bcr3BuyPct,
    bcr5BuyPct: isMatchedCrossTrade ? Math.min(bcr5BuyPct, 50) : bcr5BuyPct,
    bcr3SellPct: isMatchedCrossTrade ? Math.min(bcr3SellPct, 45) : bcr3SellPct,
    topBuyerBrokers: sortedBuyers.slice(0, 5),
    topSellerBrokers: sortedSellers.slice(0, 5),
    topNetAccumulators,
    topNetDistributors,
    avgBuyTradeSize,
    avgSellTradeSize,
    tradeSizeRatio,
    smartMoneyBias: finalBias,
    asymmetryRatio,
    netAbsorptionRatio,
    status: 'complete',
    isInsufficientSample: false,
    sampleValidity: isMatchedCrossTrade ? 'CROSS_TRADE' : 'VALID',
    description: isMatchedCrossTrade
      ? `Neutral / Bilateral Block Transfer: Broker #${sortedBuyers[0]?.broker} matched both buy and sell sides. Not indicative of market cornering.`
      : `${finalBias}: Top 3 buyers hold ${bcr3BuyPct}% concentration with ticket ratio ${tradeSizeRatio}x.`
  };
  }

  // Fiduciary Standard: When neither authentic floorsheet trades nor real broker analysis exist,
  // return an honest 'insufficient_history' payload. NEVER manufacture fake broker footprints or PRNG seeds.
  return {
    symbol: normSym,
    totalBuyVolume: 0,
    totalSellVolume: 0,
    netVolume: 0,
    bcr3BuyPct: 0,
    bcr5BuyPct: 0,
    bcr3SellPct: 0,
    topBuyerBrokers: [],
    topSellerBrokers: [],
    topNetAccumulators: [],
    topNetDistributors: [],
    avgBuyTradeSize: 0,
    avgSellTradeSize: 0,
    tradeSizeRatio: 1.0,
    smartMoneyBias: 'Neutral',
    asymmetryRatio: 1.0,
    netAbsorptionRatio: 1.0,
    status: 'insufficient_history'
  };
}

export function formatBrokerAmount(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}Rs. ${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}Rs. ${(abs / 100000).toFixed(2)} L`;
  return `${sign}Rs. ${Math.round(abs).toLocaleString()}`;
}

/**
 * Estimates tradable public float kitta for a given NEPSE stock based on sector conventions
 * or explicit public share metadata.
 */
export function estimateTradablePublicFloat(stock: any): number {
  const listed = Number(stock?.listedShares || stock?.totalListedShares || (stock?.sharesOut ? stock.sharesOut * 1000000 : 0)) || 10000000;
  const sec = String(stock?.sector || '').toLowerCase();
  let fraction = 0.35;
  if (sec.includes('commercial') || sec.includes('finance') || sec.includes('development')) fraction = 0.40;
  else if (sec.includes('insurance') || sec.includes('hotel')) fraction = 0.30;
  else if (sec.includes('manufacturing')) fraction = 0.25;
  return Math.max(500000, Math.round(listed * fraction));
}

/**
 * Calculates the Quiet Accumulation Index (QAI, 0 to 100).
 * Dedicated quantitative engine for early Day 1 stealth accumulation by institutional brokers.
 * Evaluates:
 * 1. Price Tightness & VWAP Compression (0 to 25 pts)
 * 2. Broker Concentration vs Seller Dispersion Asymmetry (0 to 30 pts)
 * 3. Net Absorption Retention Guard (0 to 25 pts)
 * 4. Tradable Float Impact Factor (0 to 20 pts)
 */
export function calculateQuietAccumulationIndex(
  stock: any,
  brokerFlow?: BrokerConcentrationResult,
  candles: Candle[] = []
): QAIResult {
  const pChange = Number(stock?.pChange || stock?.pointChange || 0);
  const ltp = Number(stock?.ltp || stock?.closePrice || 100);
  const volume = Number(stock?.volume || stock?.totalTradedQuantity || brokerFlow?.totalBuyVolume || 0);
  const reasons: string[] = [];

  // 1. Price Tightness & VWAP Compression Factor (0 to 25 pts)
  let priceTightnessScore = 12;
  if (pChange >= -1.2 && pChange <= 1.5) {
    priceTightnessScore = 25;
    reasons.push('Ideal stealth compression: Price locked in tight -1.2% to +1.5% range');
  } else if (pChange >= -1.8 && pChange <= 2.5) {
    priceTightnessScore = 19;
    reasons.push('Narrow price band: -1.8% to +2.5%');
  } else if (pChange > 2.5 && pChange <= 4.0) {
    priceTightnessScore = 10;
  } else if (pChange > 4.0) {
    priceTightnessScore = 3;
  } else if (pChange < -2.0) {
    priceTightnessScore = 5;
  }

  // Intraday VWAP check (if available): Buying at or below VWAP means passive bid absorption
  const vwap = Number(stock?.vwap || 0);
  if (vwap > 0 && ltp <= vwap * 1.01 && ltp >= vwap * 0.98) {
    priceTightnessScore = Math.min(25, priceTightnessScore + 3);
    reasons.push('Passive limit absorption: Trading anchored tightly to intraday VWAP');
  }

  // 2. Buyer Concentration vs Seller Dispersion Asymmetry (0 to 30 pts)
  const bcr3Buy = Number(brokerFlow?.bcr3BuyPct || 0);
  const bcr3Sell = Number(brokerFlow?.bcr3SellPct || 0);
  const effectiveSellConc = bcr3Sell > 0 ? bcr3Sell : 15.0;
  const asymmetryRatio = Number((bcr3Buy / effectiveSellConc).toFixed(2));
  
  let asymmetryScore = 10;
  if (bcr3Buy >= 45 && bcr3Sell <= 25) {
    asymmetryScore = 30;
    reasons.push(`High institutional asymmetry: Top 3 buyers hold ${bcr3Buy}% vs only ${bcr3Sell}% seller share (${asymmetryRatio}x)`);
  } else if (bcr3Buy >= 38 && asymmetryRatio >= 1.5) {
    asymmetryScore = 24;
    reasons.push(`Strong buyer dominance: BCR₃ ${bcr3Buy}% with fragmented retail selling`);
  } else if (bcr3Buy >= 34 && asymmetryRatio >= 1.2) {
    asymmetryScore = 18;
  } else if (bcr3Sell >= 40 && bcr3Sell > bcr3Buy) {
    asymmetryScore = 2;
    reasons.push('Severe seller dominance: Top brokers are dumping into retail');
  }

  // 3. Net Absorption Retention Guard (0 to 25 pts)
  const topBuyers = brokerFlow?.topBuyerBrokers || [];
  const top3Gross = topBuyers.slice(0, 3).reduce((acc, b) => acc + (b.volume || 0), 0);
  const top3Net = topBuyers.slice(0, 3).reduce((acc, b) => {
    const net = b.netQty !== undefined ? b.netQty : b.volume;
    return acc + Math.max(0, net);
  }, 0);
  const netAbsorptionRatio = top3Gross > 0 ? Number((top3Net / top3Gross).toFixed(2)) : (brokerFlow?.topBuyerBrokers?.[0]?.volume ? 1.0 : 0.7);

  let netAbsorptionScore = 10;
  if (netAbsorptionRatio >= 0.85 && bcr3Buy >= 35) {
    netAbsorptionScore = 25;
    reasons.push(`Clean delivery cornering: Top buyer desks holding ${(netAbsorptionRatio * 100).toFixed(0)}% net absorption (no wash churn)`);
  } else if (netAbsorptionRatio >= 0.70 && bcr3Buy >= 30) {
    netAbsorptionScore = 20;
  } else if (netAbsorptionRatio >= 0.50) {
    netAbsorptionScore = 12;
  } else if (netAbsorptionRatio < 0.35) {
    netAbsorptionScore = 3;
    reasons.push('Dual-sided churn detected: High turnover with low net delivery retention');
  }

  // 4. Tradable Float Absorption Factor (0 to 20 pts)
  const estFloat = estimateTradablePublicFloat(stock);
  const floatAbsorptionPct = estFloat > 0 ? Number(((volume / estFloat) * 100).toFixed(3)) : 0;

  let floatImpactScore = 6;
  if (floatAbsorptionPct >= 0.80) {
    floatImpactScore = 20;
    reasons.push(`Substantial float cornering: Absorbed ${floatAbsorptionPct.toFixed(2)}% of total tradable float in 1 session`);
  } else if (floatAbsorptionPct >= 0.45) {
    floatImpactScore = 16;
    reasons.push(`Strong float absorption: Absorbed ${floatAbsorptionPct.toFixed(2)}% of tradable float`);
  } else if (floatAbsorptionPct >= 0.25) {
    floatImpactScore = 12;
  } else if (floatAbsorptionPct >= 0.12) {
    floatImpactScore = 8;
  }

  // SEBON Upper Circuit ceiling guard (±15% limit)
  const prevClose = Number(stock?.previousClose || stock?.prevClose || (ltp ? ltp / (1 + (pChange || 0) / 100) : 0));
  const upperCeiling = prevClose > 0 ? prevClose * 1.15 : 0;
  const isNearUpperCircuit = upperCeiling > 0 && ltp >= upperCeiling * 0.985;

  let rawTotal = priceTightnessScore + asymmetryScore + netAbsorptionScore + floatImpactScore;
  if (isNearUpperCircuit) {
    rawTotal = Math.min(rawTotal, 35);
  }

  const qaiScore = Math.max(5, Math.min(99, Math.round(rawTotal)));
  
  const isDay1StealthCandidate = Boolean(
    qaiScore >= 68 &&
    pChange >= -1.8 && pChange <= 2.5 &&
    asymmetryRatio >= 1.35 &&
    netAbsorptionRatio >= 0.65 &&
    !isNearUpperCircuit
  );

  return {
    qaiScore,
    isDay1StealthCandidate,
    priceTightnessScore,
    asymmetryScore,
    netAbsorptionScore,
    floatImpactScore,
    asymmetryRatio,
    netAbsorptionRatio,
    floatAbsorptionPct,
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPOSITE WYCKOFF STAGE & PUMP-DUMP RISK SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates a comprehensive Stealth Accumulation Score (0 to 100).
 * Combines price consolidation tightness, CMF, ADL slope, and broker absorption.
 */
export function calculateStealthAccumulationScore(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): number {
  const pChange = Number(stock?.pChange || stock?.pointChange || 0);
  const volumeSurge = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);
  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  const hasMultiSession = Boolean(effectiveCandles && effectiveCandles.length >= 10);
  
  // 1. CMF factor (0 to 30 pts)
  let cmfScore = 15;
  if (hasMultiSession) {
    const cmfRes = calculateCMF(effectiveCandles, 20);
    cmfScore = (cmfRes.score / 100) * 30;
  } else {
    // Intraday Money Flow Multiplier (MFM) Proxy
    const ltp = Number(stock?.ltp || stock?.closePrice || 100);
    const high = Number(stock?.high || stock?.highPrice || ltp);
    const low = Number(stock?.low || stock?.lowPrice || ltp);
    const range = high - low;
    if (range > 0) {
      const intradayMFM = ((ltp - low) - (high - ltp)) / range;
      cmfScore = Math.round(((intradayMFM + 1) / 2) * 30);
    } else {
      cmfScore = 15;
    }
  }

  // 2. Low Volatility Consolidation factor (0 to 25 pts)
  // Stealth accumulation occurs when price is quiet (-1% to +2%), not during parabolic swings
  let tightnessScore = 15;
  if (pChange >= -1.0 && pChange <= 2.0) {
    tightnessScore = 25;
  } else if (pChange > 2.0 && pChange <= 5.0) {
    tightnessScore = 18;
  } else if (pChange > 5.0 && pChange <= 8.0) {
    tightnessScore = 8;
  } else if (pChange > 8.0) {
    tightnessScore = 2; // already markup/pumping, stealth has ended
  } else if (pChange < -1.0 && pChange >= -4.0) {
    // Mild pullback or spring shakeout with volume absorption
    tightnessScore = volumeSurge >= 1.2 ? 14 : 8;
  } else if (pChange < -4.0) {
    tightnessScore = 3;
  }

  // 3. Broker Concentration & Trade Size Asymmetry (0 to 30 pts)
  let brokerScore = 12;
  if (brokerFlow && brokerFlow.bcr5BuyPct > 0) {
    if (brokerFlow.bcr5BuyPct >= 50 && brokerFlow.tradeSizeRatio >= 1.8) {
      brokerScore = 30; // Strong institutional accumulation
    } else if (brokerFlow.bcr5BuyPct >= 40 && brokerFlow.tradeSizeRatio >= 1.2) {
      brokerScore = 22;
    } else if (brokerFlow.bcr5BuyPct >= 30) {
      brokerScore = 18;
    } else if (brokerFlow.tradeSizeRatio < 0.8) {
      brokerScore = 5; // Sellers dominating ticket size
    } else if (brokerFlow.bcr5BuyPct < 25) {
      brokerScore = 8; // Dispersed retail buying
    }
  } else {
    // Fallback based on volume consistency
    if (volumeSurge >= 1.1 && volumeSurge <= 2.2 && pChange >= -2.0 && pChange <= 4.0) {
      brokerScore = 18; // quiet, steady volume absorption
    } else if (volumeSurge > 2.5 && pChange > 5.0) {
      brokerScore = 4; // High volume churn / retail markup, not stealth
    } else if (volumeSurge > 2.5 && pChange < -2.0) {
      brokerScore = 3; // Panic volume dump
    } else {
      brokerScore = 10;
    }
  }

  // 4. ADL Divergence / Float Absorption bonus (0 to 15 pts)
  let divScore = 8;
  if (hasMultiSession) {
    const adlRes = calculateChaikinADL(effectiveCandles);
    if (adlRes.divergence === 'Bullish Accumulation Divergence') {
      divScore = 15;
    } else if (adlRes.divergence === 'Bearish Distribution Divergence') {
      divScore = 0;
    }
  } else {
    const netRatio = Number(brokerFlow?.netAbsorptionRatio || 0.5);
    if (netRatio >= 0.80) {
      divScore = 15;
    } else if (netRatio >= 0.60) {
      divScore = 10;
    } else if (netRatio < 0.40) {
      divScore = 3;
    }
  }

  // 5. Markup & Euphoria Churn Penalty
  // Stealth accumulation must be quiet. Violent thrusts indicate public markup or operator offloading.
  let markupPenalty = 0;
  if (pChange > 5.0) {
    markupPenalty += Math.round((pChange - 5.0) * 2.0);
  }
  if (volumeSurge > 2.2 && pChange > 4.0) {
    markupPenalty += Math.round((volumeSurge - 2.0) * 4);
  }
  if (pChange < -4.0) {
    markupPenalty += Math.round((Math.abs(pChange) - 4.0) * 1.5);
  }

  let total = Math.round(cmfScore + tightnessScore + brokerScore + divScore - markupPenalty);

  // Contradiction guard: if ADL shows Bearish Divergence, cap score at 45
  if (hasMultiSession) {
    const adlCheck = calculateChaikinADL(effectiveCandles);
    if (adlCheck.divergence === 'Bearish Distribution Divergence' && total > 45) {
      total = 45;
    }
  }

  return Math.max(5, Math.min(98, total));
}

/**
 * Calculates a dedicated Pump & Dump Risk Score (0 to 100).
 * High risk triggers when:
 * 1. Price is up massively over short period (e.g. 40%+ over 2 weeks).
 * 2. Record volume at or near upper circuit with wide wicks (churn).
 * 3. Top brokers flip to heavy net selling (distributing to retail).
 * 4. T+2 settlement risk (retail trapped if price reverses tomorrow).
 */
export function calculatePumpDumpRiskScore(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): {
  riskScore: number;
  level: 'Low Risk' | 'Moderate Vigilance' | 'Elevated Dump Warning' | 'Extreme Operator Trap';
  reasons: string[];
} {
  const reasons: string[] = [];

  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  const hasMultiSession = Boolean(effectiveCandles && effectiveCandles.length >= 10);

  const pChange = Number(stock?.pChange || 0);
  const ltp = Number(stock?.ltp || stock?.closePrice || 100);
  const high52 = Number(stock?.high52 || stock?.high52w || ltp * 1.5);
  const low52 = Number(stock?.low52 || stock?.low52w || ltp * 0.7);
  const volumeSurge = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);

  // 1. Proximity to 52-week peak after explosive run (0 to 24 pts continuous)
  const range52 = high52 - low52;
  const pctFromLow = range52 > 0 ? ((ltp - low52) / range52) * 100 : 50;
  let rangeRisk = Math.round((pctFromLow / 100) * 18);
  if (pctFromLow >= 85) {
    rangeRisk += 6;
    reasons.push('Trading near 52-week peak after extended multi-week rally');
  }

  // 2. Churn / Volume Surge (0 to 22 pts continuous)
  let volRisk = 5;
  if (volumeSurge >= 2.5) {
    volRisk = Math.min(22, Math.round(14 + (volumeSurge - 2.5) * 4));
    reasons.push(`Abnormal volume spike (${volumeSurge.toFixed(1)}x normal volume) indicating heavy inventory churn`);
  } else if (volumeSurge >= 1.2) {
    volRisk = Math.round(5 + (volumeSurge - 1.2) * 7);
  }

  // 3. Candle Rejection Wick / Overhang (0 to 24 pts continuous)
  let wickRisk = 4;
  if (hasMultiSession && effectiveCandles.length > 0) {
    const latestCandle = effectiveCandles[effectiveCandles.length - 1];
    const high = latestCandle.high || ltp;
    const low = latestCandle.low || ltp;
    const close = latestCandle.close || ltp;
    const candleRange = high - low;
    if (candleRange > 0) {
      const upperWick = high - Math.max(close, latestCandle.open || close);
      const upperWickPct = (upperWick / candleRange) * 100;
      wickRisk = Math.round((upperWickPct / 100) * 18);
      if (upperWickPct >= 45 && volumeSurge >= 1.3) {
        wickRisk += 6;
        reasons.push('Prominent upper wick (rejection candle) on heavy volume — supply hitting bids');
      }
    }

    // ADL Bearish Divergence
    const adlRes = calculateChaikinADL(effectiveCandles);
    if (adlRes.divergence === 'Bearish Distribution Divergence') {
      wickRisk += 14;
      reasons.push('Bearish ADL divergence: Price making highs while money flow line is falling');
    }
  } else {
    // Intraday Quote Wick fallback
    const high = Number(stock?.high || stock?.highPrice || ltp);
    const low = Number(stock?.low || stock?.lowPrice || ltp);
    const open = Number(stock?.open || stock?.openPrice || ltp);
    const candleRange = high - low;
    if (candleRange > 0) {
      const upperWick = high - Math.max(ltp, open);
      const upperWickPct = (upperWick / candleRange) * 100;
      wickRisk = Math.round((upperWickPct / 100) * 18);
      if (upperWickPct >= 45 && volumeSurge >= 1.3) {
        wickRisk += 6;
        reasons.push('Intraday prominent upper wick (rejection candle) on heavy volume — supply hitting bids');
      }
    }
  }

  // 4. Broker Floor Sheet Distribution Signs (0 to 25 pts continuous)
  let brokerRisk = 5;
  if (brokerFlow && brokerFlow.bcr3SellPct > 0) {
    if (brokerFlow.bcr3SellPct >= 45 && brokerFlow.tradeSizeRatio <= 0.65) {
      brokerRisk = 24;
      reasons.push(`Top 3 brokers offloading ${brokerFlow.bcr3SellPct}% of sell volume onto retail in small lots`);
    } else if (brokerFlow.smartMoneyBias === 'Operator Offloading') {
      brokerRisk = 18;
      reasons.push('Floor sheet indicates syndicate accounts are net distributing');
    } else if (brokerFlow.tradeSizeRatio < 0.90) {
      brokerRisk = Math.round(8 + (0.90 - brokerFlow.tradeSizeRatio) * 18);
    }
  }

  // 5. Momentum Euphoria / Circuit (0 to 12 pts) — Evaluates 15% Daily Circuit Ceiling
  let euphoriaRisk = 0;
  if (pChange >= 14.2) {
    euphoriaRisk = 12;
    reasons.push('Upper Circuit (+15%): High T+2 trap risk if buying at current euphoria');
  } else if (pChange >= 9.5) {
    euphoriaRisk = 8;
    reasons.push('Strong Intraday Momentum (+9.5% to +14%): Approaching 15% circuit ceiling');
  } else if (pChange > 4) {
    euphoriaRisk = Math.min(6, Math.round((pChange - 4) * 1.2));
  }

  const rawScore = rangeRisk + volRisk + wickRisk + brokerRisk + euphoriaRisk;
  const finalScore = Math.max(5, Math.min(95, Math.round(rawScore)));
  let level: 'Low Risk' | 'Moderate Vigilance' | 'Elevated Dump Warning' | 'Extreme Operator Trap' = 'Low Risk';

  if (finalScore >= 75) level = 'Extreme Operator Trap';
  else if (finalScore >= 55) level = 'Elevated Dump Warning';
  else if (finalScore >= 35) level = 'Moderate Vigilance';

  return {
    riskScore: finalScore,
    level,
    reasons
  };
}

/**
 * Classifies the exact Wyckoff stage tailored to NEPSE dynamics.
 */
export function classifyWyckoffStage(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): StockWyckoffAnalysis {
  const usingRealCandles = Array.isArray(candles) && candles.length >= 10 && 
    candles.some(c => c.date && c.date.length > 4);
  const isDataSynthetic = !usingRealCandles;
  const dataQuality: 'REAL_HISTORY' | 'SYNTHETIC_GENERATED' | 'INTRADAY_ONLY' = 
    usingRealCandles ? 'REAL_HISTORY' : 
    (candles && candles.length > 0 ? 'SYNTHETIC_GENERATED' : 'INTRADAY_ONLY');

  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  const hasMultiSession = Boolean(effectiveCandles && effectiveCandles.length >= 10);

  const pChange = Number(stock?.pChange || stock?.pointChange || 0);
  const stealthScore = calculateStealthAccumulationScore(stock, effectiveCandles, brokerFlow);
  const qaiResult = calculateQuietAccumulationIndex(stock, brokerFlow, effectiveCandles);
  const pumpDump = calculatePumpDumpRiskScore(stock, effectiveCandles, brokerFlow);
  
  let cmfVal = 0;
  let adlDiv: ADLResult['divergence'] = 'None';
  if (hasMultiSession) {
    const cmfRes = calculateCMF(effectiveCandles, 20);
    cmfVal = cmfRes.cmf;
    const adlRes = calculateChaikinADL(effectiveCandles);
    adlDiv = adlRes.divergence;
  } else {
    const ltp = Number(stock?.ltp || stock?.closePrice || 100);
    const high = Number(stock?.high || stock?.highPrice || ltp);
    const low = Number(stock?.low || stock?.lowPrice || ltp);
    const range = high - low;
    const intradayMFM = range > 0 ? ((ltp - low) - (high - ltp)) / range : 0;
    cmfVal = Number((intradayMFM * (brokerFlow?.netAbsorptionRatio ? brokerFlow.netAbsorptionRatio * 0.15 : 0.05)).toFixed(3));
  }

  const tradeSizeRatio = brokerFlow?.tradeSizeRatio || 1.0;
  const topBuyerConcentrationPct = brokerFlow?.bcr5BuyPct || 0;
  const earlySignals = evaluateEarlyDetectionSignals(stock, effectiveCandles, brokerFlow);

  let stage: WyckoffStage = '💤 DORMANT_CONSOLIDATION';
  let stageNameNepali = hasMultiSession ? 'निष्क्रिय / सामान्य अवस्था' : 'निष्क्रिय / सामान्य (Live Floorsheet)';
  let stageDescription = hasMultiSession
    ? 'Volume and price action are neutral without institutional dominance.'
    : 'Live floorsheet and intraday price action are balanced without institutional dominance.';
  let actionableGuidanceNepali = 'पर्खनुहोस् (Wait & Watch): संस्थागत वा अपरेटर गतिविधि स्पष्ट नहुन्जेल प्रवेश नगर्नुहोस्।';
  let actionableGuidanceEnglish = 'Hold or observe; avoid entry until clear institutional footprint appears.';

  // Logic tree for stage classification (with early detection priority)
  if (pumpDump.riskScore >= 70 || (pumpDump.riskScore >= 55 && pChange > 5) || (earlySignals.effortVsResult.churnRisk === 'HIGH_DISTRIBUTION_CHURN' && pumpDump.riskScore >= 45)) {
    stage = '⚠️ EUPHORIA_DISTRIBUTION';
    stageNameNepali = earlySignals.effortVsResult.churnRisk === 'HIGH_DISTRIBUTION_CHURN'
      ? 'वितरण / प्रारम्भिक मन्थन (Early Distribution Churn)'
      : 'वितरण / माल फाल्ने खतरा (Distribution Climax)';
    stageDescription = earlySignals.effortVsResult.churnRisk === 'HIGH_DISTRIBUTION_CHURN'
      ? earlySignals.effortVsResult.description
      : 'Peak turnover with heavy selling from top brokers into retail buying frenzy.';
    actionableGuidanceNepali = 'नाफा सुरक्षित गर्नुहोस् (Book Profit): नयाँ खरिद नगर्नुहोस्। अपरेटरहरूले माल फाल्ने क्रम सुरु भएको छ।';
    actionableGuidanceEnglish = 'Book profits and avoid fresh entries. High probability of retail trap before markdown.';
  } else if (pChange <= -4.0 && (cmfVal < -0.05 || pumpDump.riskScore >= 50)) {
    stage = '🔴 ACTIVE_DUMP';
    stageNameNepali = 'डम्पिङ / बियरिस पतन (Active Markdown)';
    stageDescription = 'Selling supply dominating order book; buyers are absent or trapped.';
    actionableGuidanceNepali = 'जोखिम नियन्त्रण (Exit / Stop Loss): तल्लो सर्किटको जोखिम छ। तत्काल स्टप लस पालना गर्नुहोस्।';
    actionableGuidanceEnglish = 'Cut losses and preserve capital. Do not attempt to catch falling knives.';
  } else if (pChange >= 3.5 && (cmfVal >= 0.05 || (brokerFlow && brokerFlow.bcr3BuyPct >= 40))) {
    stage = '🚀 ACTIVE_PUMP_MARKUP';
    stageNameNepali = 'पम्पिङ / तीव्र वृद्धि (Active Markup)';
    stageDescription = 'Demand outstrips supply with strong momentum and expansion.';
    actionableGuidanceNepali = 'ट्रेन्ड फलो गर्नुहोस् (Ride the Trend): ट्रेलिङ स्टप लस (Trailing SL) प्रयोग गरी नाफा बढाउनुहोस्।';
    actionableGuidanceEnglish = 'Ride momentum with trailing stops. Avoid FOMO chasing near circuit ceilings.';
  } else if (pChange <= -1.5 && pChange >= -4.5 && cmfVal >= 0.08 && adlDiv === 'Bullish Accumulation Divergence') {
    stage = '⚡ SPRING_SHAKEOUT';
    stageNameNepali = 'झट्का / स्प्रिङ (Wyckoff Spring Shakeout)';
    stageDescription = 'False breakdown to panic retail sellers while smart money accumulates heavily.';
    actionableGuidanceNepali = 'अवसर पहिचान (Reversal Setup): कम जोखिममा संकलन गर्ने उपयुक्त मौका, सपोर्ट पुष्टि भएपछि प्रवेश गर्नुहोस्।';
    actionableGuidanceEnglish = 'High-reward reversal setup. Accumulate on confirmation of support holding.';
  } else if (earlySignals.volumeDryUp.isVDU && earlySignals.volumeDryUp.isCoil && (qaiResult.qaiScore >= 58 || stealthScore >= 50 || cmfVal >= 0)) {
    stage = '🟢 STEALTH_ACCUMULATION';
    stageNameNepali = 'सप्लाई सुकेको अवस्था (Wyckoff Volume Dry-Up Test)';
    stageDescription = earlySignals.volumeDryUp.description;
    actionableGuidanceNepali = 'प्रारम्भिक प्रवेश (Early Coil Entry): बिक्रेताहरू सकिएका छन्, ब्रेकआउट हुनुअघि नै कम जोखिममा सङ्कलन गर्ने उत्तम विन्दु।';
    actionableGuidanceEnglish = 'Prime early coil entry. Sellers are exhausted on low volume test before public markup.';
  } else if (
    (stealthScore >= 65 && (topBuyerConcentrationPct >= 30 || tradeSizeRatio >= 1.2)) ||
    (stealthScore >= 60 && pChange >= -2.0 && pChange <= 3.5 && (cmfVal >= 0.02 || (Number(stock?.volumeSurgeRatio) || 1.0) >= 1.1)) ||
    qaiResult.isDay1StealthCandidate ||
    qaiResult.qaiScore >= 65 ||
    (cmfVal >= 0.06 && (tradeSizeRatio >= 1.2 || (Number(stock?.volumeSurgeRatio) || 1.0) >= 1.25)) ||
    earlySignals.leadingOBV.signal === 'BULLISH_LEAD' ||
    (brokerFlow && brokerFlow.bcr3BuyPct >= 35 && pChange >= -2.0 && pChange <= 3.5)
  ) {
    stage = '🟢 STEALTH_ACCUMULATION';
    stageNameNepali = earlySignals.leadingOBV.signal === 'BULLISH_LEAD'
      ? 'गोप्य संकलन / अग्रगामी भोल्युम (OBV Leading Accumulation)'
      : 'गोप्य संकलन / कर्नरिङ (Stealth Accumulation)';
    stageDescription = earlySignals.leadingOBV.signal === 'BULLISH_LEAD'
      ? earlySignals.leadingOBV.description
      : 'Smart money quietly accumulating shares in tight range with top broker dominance.';
    actionableGuidanceNepali = 'क्रमिक संकलन (Smart Accumulate): बजार हल्ला नहुँदै थोरै थोरै संकलन गर्ने उत्तम समय।';
    actionableGuidanceEnglish = 'Prime smart money accumulation zone. Scale in quietly before the public markup.';
  }

  return {
    stage,
    stageNameNepali,
    stageDescription,
    stealthScore,
    pumpDumpRiskScore: pumpDump.riskScore,
    qaiScore: qaiResult.qaiScore,
    isDay1StealthCandidate: qaiResult.isDay1StealthCandidate,
    qaiResult,
    cmf: cmfVal,
    adlDivergence: adlDiv,
    tradeSizeRatio,
    topBuyerConcentrationPct,
    actionableGuidanceNepali,
    actionableGuidanceEnglish,
    earlySignals,
    isDataSynthetic,
    dataQuality
  };
}

export interface MultiSessionBrokerFootprint {
  symbol: string;
  totalSessions: number;
  totalVolume: number;
  totalTurnover: number;
  netAccumulators: BrokerDetail[];
  netDistributors: BrokerDetail[];
  smartMoneyStance: 'OPERATOR_ACCUMULATION' | 'OPERATOR_DISTRIBUTION' | 'CHURN_CROSS_TRADING' | 'RETAIL_FRAGMENTED';
  stanceExplanation: string;
  topBrokerDominancePct: number;
  washTradingRisk: boolean;
}

/**
 * Aggregates multi-session floorsheets to track persistent institutional
 * accumulation / distribution footprints by broker number over time.
 */
export function calculateMultiSessionBrokerFootprint(
  sessionFloorsheets: Array<{ date?: string; trades?: any[]; rba?: any }>,
  targetSymbol: string,
  ltp?: number
): MultiSessionBrokerFootprint {
  const normSym = String(targetSymbol || '').toUpperCase().trim();
  const brokerMap = new Map<string, { buyQty: number; sellQty: number; buyAmt: number; sellAmt: number }>();
  let totalVol = 0;
  let totalTurnover = 0;
  let sessionsCount = 0;

  for (const session of sessionFloorsheets || []) {
    if (!session) continue;
    sessionsCount++;
    const rawTrades = Array.isArray(session)
      ? session
      : (Array.isArray(session.trades) ? session.trades : []);
    const trades = rawTrades.filter((t: any) => {
      const sym = String(t.symbol || t.stockSymbol || session.symbol || '').toUpperCase().trim();
      return !normSym || !sym || sym === normSym;
    });

    for (const t of trades) {
      const buyer = String(t.buyerBroker || t.buyerMemberId || t.buyer || '').trim();
      const seller = String(t.sellerBroker || t.sellerMemberId || t.seller || '').trim();
      const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);
      const rate = Number(t.contractRate || t.rate || t.price || ltp || 0);
      const amt = Number(t.contractAmount || t.amount || (qty * rate));

      if (qty <= 0) continue;
      totalVol += qty;
      totalTurnover += amt;

      if (buyer) {
        if (!brokerMap.has(buyer)) brokerMap.set(buyer, { buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
        const b = brokerMap.get(buyer)!;
        b.buyQty += qty;
        b.buyAmt += amt;
      }
      if (seller) {
        if (!brokerMap.has(seller)) brokerMap.set(seller, { buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
        const s = brokerMap.get(seller)!;
        s.sellQty += qty;
        s.sellAmt += amt;
      }
    }
  }

  const brokerList: BrokerDetail[] = Array.from(brokerMap.entries()).map(([id, stats]) => {
    const netQty = stats.buyQty - stats.sellQty;
    const netAmt = stats.buyAmt - stats.sellAmt;
    const vol = stats.buyQty + stats.sellQty;
    return {
      broker: id,
      brokerName: getBrokerName(id),
      volume: vol,
      amount: stats.buyAmt + stats.sellAmt,
      pct: totalVol > 0 ? +((vol / (totalVol * 2)) * 100).toFixed(2) : 0,
      netQty,
      netAmount: netAmt
    };
  });

  const netAccumulators = brokerList
    .filter(b => b.netQty > 0)
    .sort((a, b) => b.netQty - a.netQty)
    .slice(0, 5);

  const netDistributors = brokerList
    .filter(b => b.netQty < 0)
    .sort((a, b) => a.netQty - b.netQty)
    .slice(0, 5);

  const topAcc = netAccumulators[0];
  const topDist = netDistributors[0];
  const topAccPct = (topAcc && totalVol > 0) ? (topAcc.netQty / totalVol) * 100 : 0;
  const topDistPct = (topDist && totalVol > 0) ? (Math.abs(topDist.netQty) / totalVol) * 100 : 0;

  const washTradingRisk = Array.from(brokerMap.values()).some(b => {
    const minSide = Math.min(b.buyQty, b.sellQty);
    const maxSide = Math.max(b.buyQty, b.sellQty);
    return maxSide > 5000 && minSide / maxSide > 0.45;
  });

  let smartMoneyStance: MultiSessionBrokerFootprint['smartMoneyStance'] = 'RETAIL_FRAGMENTED';
  let stanceExplanation = 'Trading is dispersed across retail desks with no single broker dominating flow.';

  if (topAccPct >= 20) {
    smartMoneyStance = 'OPERATOR_ACCUMULATION';
    stanceExplanation = `Broker ${topAcc.broker} (${topAcc.brokerName}) is persistently absorbing float, holding ${topAccPct.toFixed(1)}% of net market buying over ${sessionsCount} sessions.`;
  } else if (topDistPct >= 20) {
    smartMoneyStance = 'OPERATOR_DISTRIBUTION';
    stanceExplanation = `Broker ${topDist.broker} (${topDist.brokerName}) is systematically dumping shares, responsible for ${topDistPct.toFixed(1)}% of net market selling.`;
  } else if (washTradingRisk) {
    smartMoneyStance = 'CHURN_CROSS_TRADING';
    stanceExplanation = 'Significant dual-sided matched volume detected within identical broker desks (potential operator churn / liquidity fabrication).';
  }

  return {
    symbol: normSym,
    totalSessions: sessionsCount,
    totalVolume: totalVol,
    totalTurnover: totalTurnover,
    netAccumulators,
    netDistributors,
    smartMoneyStance,
    stanceExplanation,
    topBrokerDominancePct: +Math.max(topAccPct, topDistPct).toFixed(1),
    washTradingRisk
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SECTOR-BY-SECTOR SMART MONEY CORNERING LEADERS (TOP 1 PER SECTOR)
// ─────────────────────────────────────────────────────────────────────────────

export interface SectorAccumulationChampion {
  sector: string;
  stock: any | null;
  symbol: string;
  companyName: string;
  corneringScore: number; // 0 to 100
  criteriaMatchedCount: number; // 0 to 4
  criteriaDetails: {
    priceFlat: boolean;           // Criteria 1: Price Flat (-1.2% to +2.0%)
    brokerConcentration: boolean; // Criteria 2: BCR3 > 40% with Net Retention > 70%
    moneyFlowLead: boolean;       // Criteria 3: CMF > +0.08 or Leading OBV
    streakOrVdu: boolean;         // Criteria 4: Day 2/3 Streak or VDU Coil / D1 Stealth
  };
  confidenceTier: 'GRADE_A_CONFIRMED' | 'GRADE_B_EMERGING' | 'GRADE_C_NEUTRAL';
  confidenceLabel: string;
  isDisqualifiedTrap: boolean;
  trapReason?: string;
  bcr3Buy: number;
  topBuyers: string;
  cmf: number;
  tradeSizeRatio: number;
  ltp: number;
  pChange: number;
  whaleStreakBadge?: string;
}

export const CANONICAL_NEPSE_SECTORS = [
  'Commercial Banks',
  'Development Banks',
  'Finance',
  'Microfinance',
  'Hydro Power',
  'Life Insurance',
  'Non-Life Insurance',
  'Hotels & Tourism',
  'Manufacturing & Processing',
  'Investment',
  'Others'
] as const;

export function normalizeNepseSector(rawSector: string): string {
  const s = String(rawSector || '').trim().toLowerCase();
  if (s.includes('commercial')) return 'Commercial Banks';
  if (s.includes('development')) return 'Development Banks';
  if (s.includes('finance') && !s.includes('micro')) return 'Finance';
  if (s.includes('microfinance')) return 'Microfinance';
  if (s.includes('hydro')) return 'Hydro Power';
  if (s.includes('non-life') || s.includes('non life')) return 'Non-Life Insurance';
  if (s.includes('life') && !s.includes('non')) return 'Life Insurance';
  if (s.includes('hotel') || s.includes('tourism')) return 'Hotels & Tourism';
  if (s.includes('manufacturing')) return 'Manufacturing & Processing';
  if (s.includes('trad')) return 'Trading';
  if (s.includes('invest')) return 'Investment';
  if (s.includes('mutual')) return 'Mutual Fund';
  return 'Others';
}

/**
 * Calculates a dedicated Cornering Score (0 to 100) based on the 4-factor rule of thumb,
 * protected by absolute Distribution Trap immunity.
 */
export function calculateStockCorneringScore(stock: any): {
  corneringScore: number;
  criteriaMatchedCount: number;
  criteriaDetails: {
    priceFlat: boolean;
    brokerConcentration: boolean;
    moneyFlowLead: boolean;
    streakOrVdu: boolean;
  };
  confidenceTier: 'GRADE_A_CONFIRMED' | 'GRADE_B_EMERGING' | 'GRADE_C_NEUTRAL';
  confidenceLabel: string;
  isDisqualifiedTrap: boolean;
  trapReason?: string;
} {
  const pChange = Number(stock?.pChange || 0);
  const ltp = Number(stock?.ltp || 0);
  const prevClose = Number(stock?.previousClose || stock?.prevClose || (ltp ? ltp / (1 + pChange / 100) : 0));
  const upperCeiling = prevClose > 0 ? prevClose * 1.15 : 0;
  const isNearUpperCircuit = Boolean(upperCeiling > 0 && ltp >= upperCeiling * 0.985);

  const bcr3Buy = Number(stock?.bcr3Buy || stock?.brokerData?.bcr3BuyPct || 0);
  const bcr3Sell = Number(stock?.bcr3Sell || stock?.brokerData?.bcr3SellPct || 0);
  const tradeSizeRatio = Number(stock?.wyckoff?.tradeSizeRatio || stock?.brokerData?.tradeSizeRatio || 1.0);
  const pumpDumpRiskScore = Number(stock?.wyckoff?.pumpDumpRiskScore || 0);
  const wyckoffStage = String(stock?.wyckoff?.stage || '');
  const cmf = Number(stock?.wyckoff?.cmf || 0);
  const netRetention = Number(stock?.brokerData?.netAbsorptionRatio || (stock?.brokerData?.top3NetAbsorptionRatio ?? 0.8));

  // 1. DISTRIBUTION TRAP VETO (ABSOLUTE HARD IMMUNITY GUARD)
  const isSingleDeskChurn = Boolean(stock?.isWashChurn);
  const isOperatorOffloading = stock?.brokerData?.smartMoneyBias === 'Operator Offloading';
  const isHighSellerDominance = (bcr3Sell >= 38.0 && bcr3Sell > bcr3Buy) || Boolean(stock?.isSellerDominant);
  const isSevereTicketInversion = tradeSizeRatio <= 0.70;
  const isEuphoriaOrDumpStage = wyckoffStage.includes('DISTRIBUTION') || wyckoffStage.includes('DUMP');
  const isEffortChurnRisk = stock?.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'HIGH_DISTRIBUTION_CHURN';
  const isUpperShadowDump = Boolean(stock?.isUpperShadowDump);

  const isDisqualifiedTrap = Boolean(
    stock?.isTrap ||
    stock?.isDumping ||
    pumpDumpRiskScore >= 55 ||
    isEuphoriaOrDumpStage ||
    isNearUpperCircuit ||
    isOperatorOffloading ||
    isHighSellerDominance ||
    isSevereTicketInversion ||
    isEffortChurnRisk ||
    isUpperShadowDump ||
    isSingleDeskChurn
  );

  let trapReason: string | undefined = undefined;
  if (isDisqualifiedTrap) {
    if (isNearUpperCircuit) trapReason = 'Upper Circuit Ceiling (+15% T+2 Trap)';
    else if (isHighSellerDominance || stock?.isDumping) trapReason = bcr3Sell > 0 ? `Seller Dominance (BCR3 Sell ${bcr3Sell}% > Buy)` : 'Seller Offloading Dominance';
    else if (isOperatorOffloading) trapReason = 'Operator Syndicate Offloading into Bids';
    else if (isSevereTicketInversion) trapReason = `Retail Dumping (Ticket Inversion ${tradeSizeRatio}x)`;
    else if (pumpDumpRiskScore >= 55) trapReason = `Elevated Dump Risk (${pumpDumpRiskScore}/100)`;
    else if (isEffortChurnRisk) trapReason = 'Effort vs Result High Churn Trap';
    else if (isUpperShadowDump) trapReason = 'Severe Upper Shadow Supply Rejection';
    else if (isSingleDeskChurn) trapReason = 'Wash Trading / Matched Desk Churn';
    else trapReason = 'Distribution Trap Detected';

    return {
      corneringScore: 0,
      criteriaMatchedCount: 0,
      criteriaDetails: {
        priceFlat: false,
        brokerConcentration: false,
        moneyFlowLead: false,
        streakOrVdu: false
      },
      confidenceTier: 'GRADE_C_NEUTRAL',
      confidenceLabel: '🚨 Trap Disqualified',
      isDisqualifiedTrap: true,
      trapReason
    };
  }

  // 2. EVALUATE THE 4 CONFLUENCE CRITERIA
  // Criteria 1: Price Flat (-1.2% to +2.0%)
  let priceScore = 0;
  let priceFlat = false;
  if (pChange >= -1.2 && pChange <= 2.0) {
    priceScore = 25;
    priceFlat = true;
  } else if (pChange >= -1.8 && pChange <= 2.5) {
    priceScore = 18;
    priceFlat = true;
  } else if (pChange > 2.5 && pChange <= 4.0) {
    priceScore = 10;
  } else if (pChange < -1.8 && pChange >= -3.5) {
    priceScore = 8;
  }

  // Criteria 2: BCR3 Buy > 40% with Net Retention > 70%
  let concScore = 0;
  let brokerConcentration = false;
  if (bcr3Buy >= 40.0 && netRetention >= 0.70) {
    concScore = 35;
    brokerConcentration = true;
  } else if (bcr3Buy >= 36.0 && netRetention >= 0.60) {
    concScore = 26;
    if (bcr3Buy >= 38.0) brokerConcentration = true;
  } else if (bcr3Buy >= 32.0) {
    concScore = 18;
  } else if (bcr3Buy >= 25.0) {
    concScore = 10;
  }

  // Criteria 3: CMF > +0.08 OR Leading OBV Divergence
  let flowScore = 0;
  let moneyFlowLead = false;
  const isLeadingOBV = stock?.wyckoff?.earlySignals?.leadingOBV?.signal === 'BULLISH_LEAD';
  const isADLDiv = stock?.wyckoff?.adlDivergence === 'Bullish Accumulation Divergence';
  if (cmf >= 0.08 || isLeadingOBV || isADLDiv) {
    flowScore = 20;
    moneyFlowLead = true;
  } else if (cmf >= 0.04) {
    flowScore = 14;
    moneyFlowLead = true;
  } else if (cmf >= 0.0) {
    flowScore = 8;
  }

  // Criteria 4: Day 2/3 Streak OR VDU Supply Test / Day 1 Stealth
  let streakScore = 0;
  let streakOrVdu = false;
  const streak = stock?.whaleStreak;
  const hasStreak = Boolean(streak && (streak.consecutiveDays >= 2 || streak.alertType === 'DAY_2_PRIME' || streak.alertType === 'MULTI_DAY_CORNER'));
  const isVDU = Boolean(stock?.wyckoff?.earlySignals?.volumeDryUp?.isVDU && stock?.wyckoff?.earlySignals?.volumeDryUp?.isCoil);
  const isD1 = Boolean(stock?.wyckoff?.isDay1StealthCandidate || (stock?.wyckoff?.qaiScore && stock?.wyckoff.qaiScore >= 70));
  const isAbsorptionFloor = stock?.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'ABSORPTION_FLOOR';

  if (hasStreak || isVDU) {
    streakScore = 20;
    streakOrVdu = true;
  } else if (isD1) {
    streakScore = 16;
    streakOrVdu = true;
  } else if (isAbsorptionFloor) {
    streakScore = 14;
    streakOrVdu = true;
  } else if (streak && streak.consecutiveDays === 1) {
    streakScore = 10;
  }

  const rawScore = priceScore + concScore + flowScore + streakScore;
  const corneringScore = Math.min(99, Math.max(5, rawScore));
  const criteriaMatchedCount = [priceFlat, brokerConcentration, moneyFlowLead, streakOrVdu].filter(Boolean).length;

  let confidenceTier: 'GRADE_A_CONFIRMED' | 'GRADE_B_EMERGING' | 'GRADE_C_NEUTRAL' = 'GRADE_C_NEUTRAL';
  let confidenceLabel = '⚪ Retail Equilibrium';

  if (criteriaMatchedCount === 4 && corneringScore >= 85) {
    confidenceTier = 'GRADE_A_CONFIRMED';
    confidenceLabel = '🟢 Confirmed Cornering (4/4)';
  } else if (criteriaMatchedCount >= 3 && corneringScore >= 70) {
    confidenceTier = 'GRADE_B_EMERGING';
    confidenceLabel = '🟡 Emerging Stealth (3/4)';
  }

  return {
    corneringScore,
    criteriaMatchedCount,
    criteriaDetails: {
      priceFlat,
      brokerConcentration,
      moneyFlowLead,
      streakOrVdu
    },
    confidenceTier,
    confidenceLabel,
    isDisqualifiedTrap: false
  };
}

function isDisqualifiedNonEquityOrBond(s: any): boolean {
  const sym = String(s?.symbol || s?.scrip || '').toUpperCase().trim();
  const sec = String(s?.sector || s?.sectorName || '').toLowerCase();
  const n = String(s?.name || s?.companyName || '').toLowerCase();

  // Exclude mutual funds, debentures, bonds, promoter shares
  if (sec.includes('mutual') || sec.includes('debenture') || sec.includes('bond') || sec.includes('promoter')) return true;
  if (n.includes('mutual fund') || n.includes('debenture') || n.includes('bond') || n.includes('promoter share') || n.includes('rinpatra') || n.includes('urja rinpatra')) return true;
  if (sym.endsWith('PO') || sym.endsWith('P') || sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  // Any ticker ending in 2 to 4 digits (e.g. NICAD2091, KBLD86, NBLD85)
  if (/\d{2,4}$/.test(sym)) return true;
  if (sym.length > 5 && (sym.includes('D') || sym.includes('B')) && /\d/.test(sym)) return true;
  if (sym.endsWith('MF') || sym.endsWith('BS') || sym.endsWith('SF') || sym.endsWith('EF') || sym.endsWith('GF') || sym.endsWith('FF')) return true;
  return false;
}

/**
 * Computes the #1 best accumulating stock in each NEPSE sector based on the 4-factor
 * rule of thumb with strict distribution trap immunity.
 */
export function calculateSectorAccumulationChampions(
  analyzedStocks: any[]
): SectorAccumulationChampion[] {
  if (!Array.isArray(analyzedStocks) || analyzedStocks.length === 0) {
    return [];
  }

  // Group stocks by canonical normalized sector
  const sectorGroups = new Map<string, any[]>();
  CANONICAL_NEPSE_SECTORS.forEach(sec => sectorGroups.set(sec, []));

  analyzedStocks.forEach(s => {
    if (isDisqualifiedNonEquityOrBond(s)) {
      return;
    }
    const rawSector = String(s.sector || 'Others');
    const normSec = normalizeNepseSector(rawSector);
    if (!sectorGroups.has(normSec)) {
      sectorGroups.set(normSec, []);
    }
    sectorGroups.get(normSec)!.push(s);
  });

  const champions: SectorAccumulationChampion[] = [];

  for (const sectorName of CANONICAL_NEPSE_SECTORS) {
    const stocksInSec = sectorGroups.get(sectorName) || [];
    if (stocksInSec.length === 0) continue;

    // Score all stocks in this sector
    const scoredList = stocksInSec.map(s => {
      const cornering = calculateStockCorneringScore(s);
      return {
        stock: s,
        ...cornering
      };
    });

    // Sort to find the #1 best stock in this sector
    scoredList.sort((a, b) => {
      // 1. Non-traps always beat traps
      if (a.isDisqualifiedTrap !== b.isDisqualifiedTrap) {
        return a.isDisqualifiedTrap ? 1 : -1;
      }
      // 2. Grade A > Grade B > Grade C
      const tierRank = (tier: string) => (tier === 'GRADE_A_CONFIRMED' ? 3 : tier === 'GRADE_B_EMERGING' ? 2 : 1);
      const aRank = tierRank(a.confidenceTier);
      const bRank = tierRank(b.confidenceTier);
      if (bRank !== aRank) return bRank - aRank;

      // 3. Criteria matched count (4/4 > 3/4)
      if (b.criteriaMatchedCount !== a.criteriaMatchedCount) {
        return b.criteriaMatchedCount - a.criteriaMatchedCount;
      }
      // 4. Cornering Score
      if (b.corneringScore !== a.corneringScore) {
        return b.corneringScore - a.corneringScore;
      }
      // 5. BCR3 Buy %
      const aBcr3 = a.stock.bcr3Buy || a.stock.brokerData?.bcr3BuyPct || 0;
      const bBcr3 = b.stock.bcr3Buy || b.stock.brokerData?.bcr3BuyPct || 0;
      if (bBcr3 !== aBcr3) return bBcr3 - aBcr3;

      // 6. Turnover
      return (b.stock.turnover || 0) - (a.stock.turnover || 0);
    });

    const topPick = scoredList[0];
    if (topPick) {
      const s = topPick.stock;
      const bcr3Buy = Number(s.bcr3Buy || s.brokerData?.bcr3BuyPct || 0);
      const topBuyers = (s.brokerData?.topBuyerBrokers || []).slice(0, 3).map((b: any) => `#${b.broker} (${b.pct}%)`).join(', ') || 'N/A';

      champions.push({
        sector: sectorName,
        stock: s,
        symbol: s.symbol,
        companyName: s.companyName || s.name || s.symbol,
        corneringScore: topPick.corneringScore,
        criteriaMatchedCount: topPick.criteriaMatchedCount,
        criteriaDetails: topPick.criteriaDetails,
        confidenceTier: topPick.confidenceTier,
        confidenceLabel: topPick.confidenceLabel,
        isDisqualifiedTrap: topPick.isDisqualifiedTrap,
        trapReason: topPick.trapReason,
        bcr3Buy,
        topBuyers,
        cmf: Number(s.wyckoff?.cmf || 0),
        tradeSizeRatio: Number(s.wyckoff?.tradeSizeRatio || 1.0),
        ltp: Number(s.ltp || 0),
        pChange: Number(s.pChange || 0),
        whaleStreakBadge: s.whaleStreak?.signalBadge
      });
    }
  }

  // Sort sectors so that sectors with confirmed Grade A cornering appear first!
  return champions.sort((a, b) => {
    const tierRank = (tier: string) => (tier === 'GRADE_A_CONFIRMED' ? 3 : tier === 'GRADE_B_EMERGING' ? 2 : 1);
    if (tierRank(b.confidenceTier) !== tierRank(a.confidenceTier)) {
      return tierRank(b.confidenceTier) - tierRank(a.confidenceTier);
    }
    return b.corneringScore - a.corneringScore;
  });
}

/**
 * Unified stealth score getter — always delegates to the proper CMF+Broker+ADL engine.
 * Use this everywhere instead of ad-hoc heuristics (e.g. `35 + pos52 * 40`).
 */
export function getStealthScore(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): number {
  return calculateStealthAccumulationScore(stock, candles, brokerFlow);
}

/**
 * Pillar 4: Multi-Desk Syndicate Cornering & Cluster Analysis Interface
 */
export interface SyndicateClusterAnalysis {
  isSyndicateDetected: boolean;
  syndicateType: 'CORNERING_ACCUMULATION' | 'COORDINATED_DISTRIBUTION' | 'BALANCED_TRADING' | 'INSUFFICIENT_DATA';
  syndicateScore: number; // 0 to 100
  dominantDesks: Array<{
    brokerId: number | string;
    brokerName?: string;
    netQty: number;
    netAmount: number;
    sharePct: number;
    role: 'PRIMARY_ACCUMULATOR' | 'SYNDICATE_PARTNER' | 'CHURN_DESK' | 'PRIMARY_SELLER' | 'PARTICIPANT';
  }>;
  top3NetSharePct: number;
  top5NetSharePct: number;
  buyerDominanceRatio: number;
  sellerDispersionRatio: number;
  summary: string;
  threatLevel: 'HIGH_CORNERING' | 'MODERATE_ACCUMULATION' | 'OPERATOR_CHURN' | 'BENIGN';
  tacticalGuidance: string;
}

/**
 * Known active institutional and proprietary desks in NEPSE that frequently lead block accumulation or syndicate plays.
 */
const KNOWN_SYNDICATE_DESKS = new Set([58, 45, 28, 34, 49, 42, 57, 38, 59, 17, 32, 50, 44, 48]);

/**
 * Detects coordinated multi-broker syndicate cornering or offloading patterns across top desks.
 * Solves the common NEPSE reality where operators split orders across desks (e.g. 58 + 45 + 28)
 * to evade single-broker concentration flags.
 */
export function detectSyndicateCluster(brokerData: any): SyndicateClusterAnalysis {
  if (!brokerData) {
    return {
      isSyndicateDetected: false,
      syndicateType: 'INSUFFICIENT_DATA',
      syndicateScore: 0,
      dominantDesks: [],
      top3NetSharePct: 0,
      top5NetSharePct: 0,
      buyerDominanceRatio: 1.0,
      sellerDispersionRatio: 1.0,
      summary: 'No broker flow data available for syndicate analysis.',
      threatLevel: 'BENIGN',
      tacticalGuidance: 'Wait for live trading floorsheet or broker vault synchronization.'
    };
  }

  // Extract buyers and sellers from any common shape (BrokerAnalysisService, BrokerConcentrationResult, or raw API)
  const rawBuyers: any[] = brokerData.buyers || brokerData.topBuyerBrokers || brokerData.topBuyers || [];
  const rawSellers: any[] = brokerData.sellers || brokerData.topSellerBrokers || brokerData.topSellers || [];

  if (rawBuyers.length === 0 && rawSellers.length === 0) {
    return {
      isSyndicateDetected: false,
      syndicateType: 'INSUFFICIENT_DATA',
      syndicateScore: 0,
      dominantDesks: [],
      top3NetSharePct: 0,
      top5NetSharePct: 0,
      buyerDominanceRatio: 1.0,
      sellerDispersionRatio: 1.0,
      summary: 'Insufficient broker trade records for statistical syndicate evaluation.',
      threatLevel: 'BENIGN',
      tacticalGuidance: 'Monitor floorsheet during active market hours (11:00 AM - 3:00 PM).'
    };
  }

  const brokerMap = new Map<string, {
    brokerId: number | string;
    brokerName: string;
    buyQty: number;
    buyAmount: number;
    sellQty: number;
    sellAmount: number;
  }>();

  const getOrInit = (id: string | number, name: string = '') => {
    const key = String(id).trim();
    if (!brokerMap.has(key)) {
      const parsedId = parseInt(key, 10);
      brokerMap.set(key, {
        brokerId: isNaN(parsedId) ? key : parsedId,
        brokerName: name || `Broker #${key}`,
        buyQty: 0,
        buyAmount: 0,
        sellQty: 0,
        sellAmount: 0
      });
    }
    return brokerMap.get(key)!;
  };

  for (const b of rawBuyers) {
    const bId = b.brokerId ?? b.broker ?? b.id ?? '';
    if (!bId) continue;
    const entry = getOrInit(bId, b.brokerName || b.name || '');
    entry.buyQty += Number(b.buyQty || b.volume || 0);
    entry.buyAmount += Number(b.buyAmount || b.buyAmt || b.amount || 0);
  }

  for (const s of rawSellers) {
    const sId = s.brokerId ?? s.broker ?? s.id ?? '';
    if (!sId) continue;
    const entry = getOrInit(sId, s.brokerName || s.name || '');
    entry.sellQty += Number(s.sellQty || s.volume || 0);
    entry.sellAmount += Number(s.sellAmount || s.sellAmt || s.amount || 0);
  }

  // Calculate net balances per broker
  const allBrokers = Array.from(brokerMap.values()).map(b => ({
    ...b,
    netQty: b.buyQty - b.sellQty,
    netAmount: b.buyAmount - b.sellAmount
  }));

  const accumulators = allBrokers.filter(b => b.netQty > 0).sort((a, b) => b.netQty - a.netQty);
  const distributors = allBrokers.filter(b => b.netQty < 0).sort((a, b) => a.netQty - b.netQty); // Most negative first

  const totalPositiveNetQty = accumulators.reduce((sum, b) => sum + b.netQty, 0);
  const totalNegativeNetQty = distributors.reduce((sum, b) => sum + Math.abs(b.netQty), 0);
  const totalGrossBuyQty = allBrokers.reduce((sum, b) => sum + b.buyQty, 0);
  const totalGrossSellQty = allBrokers.reduce((sum, b) => sum + b.sellQty, 0);

  // Top 3 and Top 5 buyer concentration
  const top3BuyNetQty = accumulators.slice(0, 3).reduce((sum, b) => sum + b.netQty, 0);
  const top5BuyNetQty = accumulators.slice(0, 5).reduce((sum, b) => sum + b.netQty, 0);
  const top3NetSharePct = totalPositiveNetQty > 0 ? Math.min(100, Math.round((top3BuyNetQty / totalPositiveNetQty) * 100)) : 0;
  const top5NetSharePct = totalPositiveNetQty > 0 ? Math.min(100, Math.round((top5BuyNetQty / totalPositiveNetQty) * 100)) : 0;

  // Top 3 seller concentration
  const top3SellNetQty = distributors.slice(0, 3).reduce((sum, b) => sum + Math.abs(b.netQty), 0);
  const top3SellSharePct = totalNegativeNetQty > 0 ? Math.min(100, Math.round((top3SellNetQty / totalNegativeNetQty) * 100)) : 0;

  // Seller side dispersion: if seller volume is split across many brokers, top seller % is low
  const topSellerGrossQty = rawSellers[0]?.sellQty || rawSellers[0]?.volume || 0;
  const topSellerSellPct = totalGrossSellQty > 0 ? Math.round((topSellerGrossQty / totalGrossSellQty) * 100) : 25;
  const sellerDispersionRatio = topSellerSellPct > 0 ? +(top3NetSharePct / Math.max(12, topSellerSellPct)).toFixed(2) : 1.0;

  // Check known syndicate desks presence in top 3
  const top3Desks = accumulators.slice(0, 3).map(b => typeof b.brokerId === 'number' ? b.brokerId : parseInt(String(b.brokerId), 10));
  const knownDeskCount = top3Desks.filter(id => KNOWN_SYNDICATE_DESKS.has(id)).length;

  let syndicateType: SyndicateClusterAnalysis['syndicateType'] = 'BALANCED_TRADING';
  let threatLevel: SyndicateClusterAnalysis['threatLevel'] = 'BENIGN';
  let syndicateScore = 45;
  let summary = '';
  let tacticalGuidance = '';

  const topAccumulatorNetShare = totalPositiveNetQty > 0 ? ((accumulators[0]?.netQty || 0) / totalPositiveNetQty) : 0;
  const isSymmetricTwoWay = Math.abs(top3NetSharePct - top3SellSharePct) <= 25 && knownDeskCount === 0 && topAccumulatorNetShare < 0.32;

  const isDominantSellOffload = top3SellSharePct >= 55 && distributors.length >= 2 && (totalNegativeNetQty > totalPositiveNetQty || top3SellNetQty > top3BuyNetQty) && !isSymmetricTwoWay;
  const isDominantBuyCornering = top3NetSharePct >= 55 && accumulators.length >= 2 && totalPositiveNetQty > 0 && !isDominantSellOffload && !isSymmetricTwoWay;
  const deskListStr = accumulators.slice(0, 3).map(b => `#${b.brokerId}`).join(', ');

  if (isDominantSellOffload) {
    syndicateType = 'COORDINATED_DISTRIBUTION';
    syndicateScore = Math.min(99, Math.round(top3SellSharePct * 0.72 + 15));
    threatLevel = 'OPERATOR_CHURN';
    const sellDeskList = distributors.slice(0, 3).map(b => `#${b.brokerId}`).join(', ');
    summary = `Coordinated Distribution / Offloading: Desks ${sellDeskList} dumping ${top3SellSharePct}% of net volume directly into fragmented retail buyer bids.`;
    tacticalGuidance = `High risk of distribution trap or markup exhaustion. Strict capital preservation: trim profitable positions or place hard stop-losses.`;
  } else if (isDominantBuyCornering) {
    syndicateType = 'CORNERING_ACCUMULATION';
    syndicateScore = Math.min(99, Math.round(
      (top3NetSharePct * 0.65) +
      (sellerDispersionRatio >= 1.8 ? 18 : 8) +
      (knownDeskCount >= 2 ? 14 : knownDeskCount === 1 ? 7 : 0)
    ));
    threatLevel = syndicateScore >= 75 ? 'HIGH_CORNERING' : 'MODERATE_ACCUMULATION';
    summary = `Multi-Desk Syndicate Cornering: Desks ${deskListStr} collectively absorb ${top3NetSharePct}% of net floating supply while retail sell-side remains dispersed.`;
    tacticalGuidance = `Smart money syndicate is locking up liquidity. Maintain discipline: wait for low-volume consolidation or tight pullback into 20 EMA before scaling in. Do not chase upper circuits.`;
  } else {
    syndicateType = 'BALANCED_TRADING';
    threatLevel = 'BENIGN';
    syndicateScore = Math.min(50, Math.max(20, Math.round(top3NetSharePct * 0.5)));
    summary = `Balanced Market Participation: Top 3 broker desks account for ${top3NetSharePct}% net buy volume. No abnormal multi-broker cornering cluster detected.`;
    tacticalGuidance = `Flow is organic with two-way liquidity. Follow standard price-action, support/resistance, and volume pivot confirmation.`;
  }

  // Dominant desks formatting: if distribution, show top selling desks; if accumulation, show top buying desks
  const targetBrokers = syndicateType === 'COORDINATED_DISTRIBUTION' ? distributors : accumulators;
  const targetTotalNet = syndicateType === 'COORDINATED_DISTRIBUTION' ? totalNegativeNetQty : totalPositiveNetQty;

  const dominantDesks: SyndicateClusterAnalysis['dominantDesks'] = targetBrokers.slice(0, 5).map((b, idx) => {
    const rawNet = Math.abs(b.netQty);
    const sharePct = targetTotalNet > 0 ? +((rawNet / targetTotalNet) * 100).toFixed(1) : 0;
    const role: SyndicateClusterAnalysis['dominantDesks'][0]['role'] =
      syndicateType === 'COORDINATED_DISTRIBUTION'
        ? (idx === 0 ? 'PRIMARY_SELLER' : 'CHURN_DESK')
        : (idx === 0 ? 'PRIMARY_ACCUMULATOR' : (sharePct >= 14 ? 'SYNDICATE_PARTNER' : 'PARTICIPANT'));
    return {
      brokerId: b.brokerId,
      brokerName: b.brokerName,
      netQty: b.netQty,
      netAmount: b.netAmount,
      sharePct,
      role
    };
  });

  return {
    isSyndicateDetected: syndicateType === 'CORNERING_ACCUMULATION' || syndicateType === 'COORDINATED_DISTRIBUTION',
    syndicateType,
    syndicateScore,
    dominantDesks,
    top3NetSharePct,
    top5NetSharePct,
    buyerDominanceRatio: +(totalPositiveNetQty / Math.max(1, totalGrossBuyQty)).toFixed(2),
    sellerDispersionRatio,
    summary,
    threatLevel,
    tacticalGuidance
  };
}
