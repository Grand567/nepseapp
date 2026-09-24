/**
 * Breakout & Entry/Exit Trap Protection Quantitative Engine (NEPSE Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulates mathematical calculations for:
 *   1. Support & Resistance Confluence Clustering (Floor Pivots, Fibonacci, Swings, 52W)
 *   2. Breakout Clearance, Volume Expansion & Bull Trap Rejection
 *   3. NEPSE T+2 Settlement Trap Hazard Detection (Day 1 chase vs Day 3/4 retest)
 *   4. Zero-Bid Exit Trap & Liquidity Depth Assessment
 *   5. Statutory Breakeven Hurdle, Structural Stop Loss & Multi-Horizon Targets
 */

import { generateDynamicStockCandles } from './accumulationDistributionEngine.ts';

export interface Candle {
  date?: string;
  time?: string;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupportResistanceLevel {
  price: number;
  strength: number;      // 0 to 100
  touches: number;
  sources: string[];     // '52w_high', 'pivot_r1', 'fib_61.8%', 'swing_high', etc.
  distancePct: number;   // % away from current price
}

export interface ConfluenceSR {
  support: SupportResistanceLevel[];
  resistance: SupportResistanceLevel[];
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
}

export type T2TrapHazard =
  | '🚨 EXTREME_TRAP_HAZARD'  // Day 1 upper circuit on massive rejection or broker offloading
  | '⚠️ HIGH_RISK_CHASE'       // Overextended (>4% above pivot), vulnerable to T+2 delivery dump
  | '🟡 MODERATE_SETUP'        // Valid breakout but pending volume or T+2 supply confirmation
  | '🟢 PRIME_RETEST_ENTRY'    // Day 3/4 successful retest holding prior resistance on low volume
  | '💤 PRE_BREAKOUT_COIL';    // Tight consolidation under resistance (Minervini VCP / Squeeze)

export interface BreakoutEvaluation {
  detected: boolean;
  status: 'Confirmed Breakout' | 'Bull Trap (Rejection)' | 'Confirmed Retest' | 'Tentative Probe' | 'Support Breakdown' | 'Inside Range';
  breakoutType: 'resistance_breakout' | 'breakout_retest' | 'bull_trap' | 'tentative' | 'support_breakdown' | 'none';
  level: number;
  breakoutPrice: number;
  rvol: number;
  volumeConfirmed: boolean;
  retestConfirmed: boolean;
  upperWickRatio: number;
  bodyRatio: number;
  qualityScore: number;       // 0 to 100
  bullTrapProbability: number;// 0 to 100%
  t2Hazard: T2TrapHazard;
  t2HazardDescriptionNepali: string;
  t2HazardDescriptionEnglish: string;
}

export interface TrapProofLevels {
  currentPrice: number;
  pivotLevel: number;
  // Dual Entry
  aggressiveEntryZone: { low: number; high: number; label: string };
  conservativeRetestZone: { low: number; high: number; label: string };
  recommendedEntry: 'Conservative Retest' | 'Aggressive Breakout' | 'Avoid / No Entry';
  // Statutory Breakeven
  statutoryBreakevenPrice: number;
  statutoryHurdlePct: number;
  // Risk & Targets
  stopLossPrice: number;
  stopLossPct: number;
  riskPerShare: number;
  target1Price: number;
  target1UpsidePct: number;
  target2Price: number;
  target2UpsidePct: number;
  rrr1: number;
  rrr2: number;
  isHighExpectancyTrade: boolean;
  actionableNepali: string;
  actionableEnglish: string;
}

export interface ExitLiquiditySafety {
  turnover: number;
  estimatedBidDepthShares: number;
  exitSafetyTier: 'High Liquidity (Safe Exit)' | 'Moderate Liquidity' | 'Severe Exit Trap (Zero-Bid Risk)';
  exitTrapScore: number; // 0 to 100 (Higher = severe risk of getting locked in lower circuit)
  warningNepali: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUPPORT & RESISTANCE CONFLUENCE CLUSTERING
// ─────────────────────────────────────────────────────────────────────────────

export function calculateConfluenceSR(
  currentPrice: number,
  candles: Candle[],
  high52w?: number,
  low52w?: number,
  stock?: any
): ConfluenceSR {
  const price = Math.max(1, Number(currentPrice) || 100);
  const effectiveCandles = (Array.isArray(candles) && candles.length >= 5)
    ? candles
    : generateDynamicStockCandles(stock || { ltp: price, high52w, low52w }, 25);

  if (!Array.isArray(effectiveCandles) || effectiveCandles.length < 5) {
    return {
      support: [],
      resistance: [],
      nearestSupport: null,
      nearestResistance: null
    };
  }

  const rawCandidates: { price: number; source: string; recency: number }[] = [];

  // A. Prior Session Standard Floor Trader Pivots
  const latest = effectiveCandles[effectiveCandles.length - 1];
  const h = latest.high || price;
  const l = latest.low || price;
  const c = latest.close || price;
  const p = (h + l + c) / 3;
  const r1 = 2 * p - l;
  const s1 = 2 * p - h;
  const r2 = p + (h - l);
  const s2 = p - (h - l);

  rawCandidates.push({ price: p, source: 'Floor Pivot (P)', recency: 1 });
  rawCandidates.push({ price: r1, source: 'Pivot R1', recency: 1 });
  rawCandidates.push({ price: s1, source: 'Pivot S1', recency: 1 });
  rawCandidates.push({ price: r2, source: 'Pivot R2', recency: 1 });
  rawCandidates.push({ price: s2, source: 'Pivot S2', recency: 1 });

  // B. 52-Week & 20-Day Range Extremes
  const h52 = high52w || Math.max(...effectiveCandles.map((c) => c.high));
  const l52 = low52w || Math.min(...effectiveCandles.map((c) => c.low));
  rawCandidates.push({ price: h52, source: '52-Week High', recency: 5 });
  rawCandidates.push({ price: l52, source: '52-Week Low', recency: 5 });

  const recent20 = effectiveCandles.slice(-20);
  const h20 = Math.max(...recent20.map((c) => c.high));
  const l20 = Math.min(...recent20.map((c) => c.low));
  rawCandidates.push({ price: h20, source: '20-Day High (Breakout Pivot)', recency: 2 });
  rawCandidates.push({ price: l20, source: '20-Day Low (Support Base)', recency: 2 });

  // C. Fibonacci Retracements from 52W range
  const fibRange = h52 - l52;
  if (fibRange > 0) {
    rawCandidates.push({ price: l52 + fibRange * 0.382, source: 'Fib 38.2%', recency: 10 });
    rawCandidates.push({ price: l52 + fibRange * 0.500, source: 'Fib 50.0%', recency: 10 });
    rawCandidates.push({ price: l52 + fibRange * 0.618, source: 'Fib 61.8% Golden', recency: 10 });
  }

  // D. Fractal Swing Extremes (Local highs/lows)
  for (let i = 2; i < effectiveCandles.length - 2; i++) {
    const bar = effectiveCandles[i];
    if (bar.high > effectiveCandles[i - 1].high && bar.high > effectiveCandles[i - 2].high && bar.high > effectiveCandles[i + 1].high && bar.high > effectiveCandles[i + 2].high) {
      rawCandidates.push({ price: bar.high, source: 'Swing High Pivot', recency: effectiveCandles.length - i });
    }
    if (bar.low < effectiveCandles[i - 1].low && bar.low < effectiveCandles[i - 2].low && bar.low < effectiveCandles[i + 1].low && bar.low < effectiveCandles[i + 2].low) {
      rawCandidates.push({ price: bar.low, source: 'Swing Low Pivot', recency: effectiveCandles.length - i });
    }
  }

  // E. Cluster nearby candidates within 1.4% bandwidth
  const sorted = rawCandidates.filter((item) => item.price > 0).sort((a, b) => a.price - b.price);
  const clusters: { total: number; count: number; items: typeof rawCandidates; sources: Set<string> }[] = [];

  for (const item of sorted) {
    let matched = null;
    for (const cl of clusters) {
      const avg = cl.total / cl.count;
      if (Math.abs(item.price - avg) / avg <= 0.014) {
        matched = cl;
        break;
      }
    }
    if (matched) {
      matched.items.push(item);
      matched.total += item.price;
      matched.count++;
      matched.sources.add(item.source);
    } else {
      clusters.push({
        total: item.price,
        count: 1,
        items: [item],
        sources: new Set([item.source])
      });
    }
  }

  const evaluated = clusters.map((cl) => {
    const avgPrice = Number((cl.total / cl.count).toFixed(1));
    const touchCount = cl.count;
    const sourceCount = cl.sources.size;
    let strength = Math.min(95, touchCount * 16 + sourceCount * 14);
    if (cl.sources.has('52-Week High') || cl.sources.has('52-Week Low')) strength = Math.max(85, strength);
    if (cl.sources.has('Fib 61.8% Golden')) strength = Math.max(80, strength);

    return {
      price: avgPrice,
      strength: Math.max(40, strength),
      touches: touchCount,
      sources: Array.from(cl.sources),
      distancePct: Number((((avgPrice - price) / price) * 100).toFixed(2))
    };
  });

  const support = evaluated
    .filter((lvl) => lvl.price < price * 0.998)
    .sort((a, b) => b.price - a.price)
    .slice(0, 4);

  const resistance = evaluated
    .filter((lvl) => lvl.price > price * 1.002)
    .sort((a, b) => a.price - b.price)
    .slice(0, 4);

  return {
    support,
    resistance,
    nearestSupport: support[0] || null,
    nearestResistance: resistance[0] || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BREAKOUT QUALITY & BULL TRAP DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function calculateBreakoutQuality(
  stock: any,
  candles: Candle[],
  srLevels: ConfluenceSR,
  floorsheet: any[] = []
): BreakoutEvaluation {
  const price = Number(stock?.ltp || stock?.closePrice || 100);
  const pChange = Number(stock?.pChange || 0);

  const effectiveCandles = (Array.isArray(candles) && candles.length >= 5)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  if (!Array.isArray(effectiveCandles) || effectiveCandles.length < 5) {
    return {
      detected: false,
      status: 'Inside Range',
      breakoutType: 'none',
      level: price,
      breakoutPrice: price,
      rvol: 1.0,
      volumeConfirmed: false,
      retestConfirmed: false,
      upperWickRatio: 0,
      bodyRatio: 0,
      qualityScore: 0,
      bullTrapProbability: 0,
      t2Hazard: '💤 PRE_BREAKOUT_COIL',
      t2HazardDescriptionNepali: 'इतिहास अपर्याप्त (< ५ सत्र): विश्लेषणका लागि न्यूनतम दैनिक क्यान्डल आवश्यक छ।',
      t2HazardDescriptionEnglish: 'Insufficient historical candles (< 5 sessions) to evaluate breakout dynamics.'
    };
  }

  const latest = effectiveCandles[effectiveCandles.length - 1];
  const prev = effectiveCandles[effectiveCandles.length - 2];
  const high = Number(latest.high) || price;
  const low = Number(latest.low) || price;
  const open = Number(latest.open) || price;
  const close = Number(latest.close) || price;

  const candleRange = Math.max(0.1, high - low);
  const upperWick = high - Math.max(open, close);
  const upperWickRatio = Number((upperWick / candleRange).toFixed(2));
  const body = Math.abs(close - open);
  const bodyRatio = Number((body / candleRange).toFixed(2));

  // 20-period Average Volume for RVOL
  const recentVols = effectiveCandles.slice(-20).map((c) => Number(c.volume) || 0);
  const avgVol = recentVols.reduce((a, b) => a + b, 0) / Math.max(1, recentVols.length);
  const currentVol = Number(latest.volume) || Number(stock?.volume) || avgVol;
  const rvol = avgVol > 0 ? Number((currentVol / avgVol).toFixed(2)) : 1.0;

  // ATR 14
  const trs = effectiveCandles.slice(-14).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    const prevC = arr[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
  });
  const atr = trs.reduce((a, b) => a + b, 0) / Math.max(1, trs.length);
  const clearanceBuffer = Math.max(price * 0.0035, atr * 0.20);

  const nearestR = srLevels.nearestResistance;
  const nearestS = srLevels.nearestSupport;

  // Floor Sheet Broker Check (Is top broker selling into the move?)
  let brokerOffloadingIntoBreakout = false;
  if (Array.isArray(floorsheet) && floorsheet.length > 0) {
    const sym = String(stock?.symbol || '').toUpperCase().trim();
    const trades = floorsheet.filter((t) => String(t.symbol || t.stockSymbol || '').toUpperCase().trim() === sym);
    if (trades.length > 0) {
      let topSellerVol = 0;
      let totalSellVol = 0;
      const sellers = new Map<string, number>();
      trades.forEach((t) => {
        const sId = String(t.seller || t.sellerBroker || '').trim();
        const qty = Number(t.quantity || t.qty || 0);
        if (sId && qty > 0) {
          sellers.set(sId, (sellers.get(sId) || 0) + qty);
          totalSellVol += qty;
        }
      });
      const top3Sellers = Array.from(sellers.values()).sort((a, b) => b - a).slice(0, 3);
      topSellerVol = top3Sellers.reduce((a, b) => a + b, 0);
      if (totalSellVol > 0 && (topSellerVol / totalSellVol) >= 0.55) {
        brokerOffloadingIntoBreakout = true;
      }
    }
  }

  // ── DYNAMIC CONTINUOUS SCORING FOUNDATIONS ──
  const baseTrap = Math.round(
    14 +
    (upperWickRatio * 42) +
    (rvol >= 1.6 ? 12 : rvol >= 1.2 ? 6 : 0) +
    (pChange >= 7.5 ? 16 : pChange >= 4.0 ? 8 : 0) +
    (brokerOffloadingIntoBreakout ? 22 : 0)
  );
  const dynamicTrapProb = Math.max(5, Math.min(95, baseTrap));

  const baseQuality = Math.round(
    48 +
    (bodyRatio * 22) +
    (rvol >= 1.3 ? 16 : rvol >= 1.0 ? 6 : -10) +
    (pChange > 0 ? Math.min(15, pChange * 2.2) : Math.max(-18, pChange * 3)) -
    (upperWickRatio * 28)
  );
  const dynamicQualityScore = Math.max(8, Math.min(96, baseQuality));

  // ── 1. BULL TRAP REJECTION (Intraday spike rejected with large upper wick or broker dumping) ──
  const isNearR = nearestR ? (high >= nearestR.price * 0.995) : false;
  const isSevereWickRejection = (upperWickRatio >= 0.38 && (rvol >= 1.15 || isNearR)) || (upperWickRatio >= 0.50);

  if (isSevereWickRejection || brokerOffloadingIntoBreakout) {
    return {
      detected: true,
      status: 'Bull Trap (Rejection)',
      breakoutType: 'bull_trap',
      level: nearestR ? nearestR.price : high,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: rvol >= 1.2,
      retestConfirmed: false,
      upperWickRatio,
      bodyRatio,
      qualityScore: Math.min(45, dynamicQualityScore),
      bullTrapProbability: Math.max(55, dynamicTrapProb),
      t2Hazard: '🚨 EXTREME_TRAP_HAZARD',
      t2HazardDescriptionNepali: 'चेतावनी! ब्रेकआउट ट्र्याप: माथिल्लो विक ठूलो छ र ब्रोकरहरूले माल फाल्दैछन्। T+2 मा फसिने उच्च जोखिम छ।',
      t2HazardDescriptionEnglish: 'Severe Bull Trap Risk. Strong upper wick rejection with broker offloading into retail buying.',
    };
  }

  // ── 2. ACTIVE RESISTANCE BREAKOUT ──
  if (nearestR && (close >= nearestR.price || (high >= nearestR.price + clearanceBuffer && close >= nearestR.price * 0.996))) {
    const isDecisive = close >= (nearestR.price + clearanceBuffer * 0.5);

    if (isDecisive && rvol >= 1.25) {
      const isOverextended = pChange >= 8.5;
      return {
        detected: true,
        status: 'Confirmed Breakout',
        breakoutType: 'resistance_breakout',
        level: nearestR.price,
        breakoutPrice: close,
        rvol,
        volumeConfirmed: true,
        retestConfirmed: false,
        upperWickRatio,
        bodyRatio,
        qualityScore: Math.max(72, dynamicQualityScore),
        bullTrapProbability: isOverextended ? Math.max(45, dynamicTrapProb) : Math.min(30, dynamicTrapProb),
        t2Hazard: isOverextended ? '⚠️ HIGH_RISK_CHASE' : '🟡 MODERATE_SETUP',
        t2HazardDescriptionNepali: isOverextended
          ? 'सर्किट चेस जोखिम: ब्रेकआउट बलियो छ तर आज +८% माथि किन्दा T+2 डम्पको खतरा हुन्छ। पुलब्याक कुर्नुहोस्।'
          : 'सक्रिय ब्रेकआउट: उच्च भोल्युमका साथ रेसिस्टेन्स पार गरेको छ। ट्रेलिङ स्टप लस सहित हेर्नुहोस्।',
        t2HazardDescriptionEnglish: isOverextended
          ? 'Strong breakout but high T+2 chase risk near circuit ceiling. Wait for pullback.'
          : 'Confirmed volume breakout above key pivot with decisive clearance.',
      };
    }

    // Tentative / weak volume breakout
    return {
      detected: true,
      status: 'Tentative Probe',
      breakoutType: 'tentative',
      level: nearestR.price,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: false,
      retestConfirmed: false,
      upperWickRatio,
      bodyRatio,
      qualityScore: dynamicQualityScore,
      bullTrapProbability: Math.max(40, dynamicTrapProb),
      t2Hazard: '🟡 MODERATE_SETUP',
      t2HazardDescriptionNepali: 'कमजोर भोल्युम: रेसिस्टेन्स छोएको छ तर खरिदकर्ताको पर्याप्त बल छैन। थप पुष्टि कुर्नुहोस्।',
      t2HazardDescriptionEnglish: 'Tentative probe above resistance lacking volume conviction. Wait for decisive bar.',
    };
  }

  // ── 3. SUPPORT BREAKDOWN (EXIT TRAP RISK) ──
  if (nearestS && (close < nearestS.price * 0.998 || (pChange <= -3.0 && close <= nearestS.price * 1.002))) {
    return {
      detected: true,
      status: 'Support Breakdown',
      breakoutType: 'support_breakdown',
      level: nearestS.price,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: rvol >= 1.2,
      retestConfirmed: false,
      upperWickRatio,
      bodyRatio,
      qualityScore: Math.min(30, dynamicQualityScore),
      bullTrapProbability: Math.max(75, dynamicTrapProb),
      t2Hazard: '🚨 EXTREME_TRAP_HAZARD',
      t2HazardDescriptionNepali: 'सपोर्ट ब्रेकडाउन! तत्काल स्टप लस पालना गर्नुहोस्; निकास बन्द (Zero-Bid) हुने खतरा छ।',
      t2HazardDescriptionEnglish: 'Support broken. Critical breakdown risk with zero-bid lower circuit potential.',
    };
  }

  // ── 4. CONFIRMED RETEST (Former Resistance Holding As Support with Dry Volume) ──
  const isConvertedPivot = nearestS && nearestS.sources.some(s => s.includes('Breakout') || s.includes('Pivot R') || s.includes('Swing High'));
  const hadRecentSurge = prev.high >= (nearestS?.price || 0) && pChange >= -1.5;
  if (
    nearestS &&
    (isConvertedPivot || hadRecentSurge) &&
    low <= nearestS.price * 1.015 &&
    close >= nearestS.price * 0.995 &&
    rvol <= 1.30 &&
    upperWickRatio <= 0.35
  ) {
    return {
      detected: true,
      status: 'Confirmed Retest',
      breakoutType: 'breakout_retest',
      level: nearestS.price,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: true,
      retestConfirmed: true,
      upperWickRatio,
      bodyRatio,
      qualityScore: Math.max(76, dynamicQualityScore),
      bullTrapProbability: Math.min(22, dynamicTrapProb),
      t2Hazard: '🟢 PRIME_RETEST_ENTRY',
      t2HazardDescriptionNepali: 'सुरक्षित रि-टेस्ट: ब्रेकआउट पछिको सप्लाई बजारले सोसेको छ। यहाँ कम जोखिममा प्रवेश सम्भव छ।',
      t2HazardDescriptionEnglish: 'High-conviction retest entry. Old resistance successfully held as support with dry volume.',
    };
  }

  // ── 5. SUPPORT BOUNCE / PRE-BREAKOUT COIL / INSIDE RANGE ──
  const distToS = nearestS ? (close - nearestS.price) / nearestS.price : 0.05;
  const distToR = nearestR ? (nearestR.price - close) / nearestR.price : 0.05;

  if (nearestS && distToS <= 0.018 && pChange >= 0 && bodyRatio >= 0.35) {
    return {
      detected: true,
      status: 'Support Bounce',
      breakoutType: 'support_bounce',
      level: nearestS.price,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: rvol >= 1.0,
      retestConfirmed: false,
      upperWickRatio,
      bodyRatio,
      qualityScore: dynamicQualityScore,
      bullTrapProbability: Math.min(28, dynamicTrapProb),
      t2Hazard: '🟢 PRIME_RETEST_ENTRY',
      t2HazardDescriptionNepali: 'सपोर्ट बाउन्स: बलियो सपोर्टबाट खरिदकर्ता सक्रिय भएका छन्। उपयुक्त स्टप लस सहित हेर्नुहोस्।',
      t2HazardDescriptionEnglish: 'Support bounce confirmed with buying pressure emerging at base.',
    };
  }

  if (nearestR && distToR <= 0.025 && rvol <= 1.25) {
    return {
      detected: false,
      status: 'Pre-Breakout Coil',
      breakoutType: 'none',
      level: nearestR.price,
      breakoutPrice: close,
      rvol,
      volumeConfirmed: false,
      retestConfirmed: false,
      upperWickRatio,
      bodyRatio,
      qualityScore: dynamicQualityScore,
      bullTrapProbability: dynamicTrapProb,
      t2Hazard: '💤 PRE_BREAKOUT_COIL',
      t2HazardDescriptionNepali: 'कम्प्रेसिभ कोइल: रेसिस्टेन्स नजिक भोल्युम सुकेर ऊर्जा संचय भइरहेको छ। ब्रेकआउट कुरिरहेको छ।',
      t2HazardDescriptionEnglish: 'Pre-breakout volatility contraction coil right beneath key overhead pivot.',
    };
  }

  // Default: Inside Range
  return {
    detected: false,
    status: 'Inside Range',
    breakoutType: 'none',
    level: nearestR?.price || price * 1.05,
    breakoutPrice: price,
    rvol,
    volumeConfirmed: false,
    retestConfirmed: false,
    upperWickRatio,
    bodyRatio,
    qualityScore: dynamicQualityScore,
    bullTrapProbability: dynamicTrapProb,
    t2Hazard: dynamicTrapProb >= 50 ? '🟡 MODERATE_SETUP' : '💤 PRE_BREAKOUT_COIL',
    t2HazardDescriptionNepali: 'रेन्ज बाउन्ड: मूल्य दुई घेराको बीचमा छ। नयाँ ब्रेकआउट ट्रिगर नभएसम्म पर्खनुहोस्।',
    t2HazardDescriptionEnglish: 'Consolidating inside established boundaries awaiting directional expansion.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STATUTORY-ADJUSTED LEVELS, DUAL ENTRY & ASYMMETRIC RRR
// ─────────────────────────────────────────────────────────────────────────────

export function calculateTrapProofLevels(
  currentPrice: number,
  srLevels: ConfluenceSR,
  breakoutEval: BreakoutEvaluation,
  atrVal?: number
): TrapProofLevels {
  const p = Math.max(1, Number(currentPrice) || 100);
  const atr = Math.max(p * 0.015, Number(atrVal) || p * 0.028);

  const nearestR = srLevels.nearestResistance?.price || p * 1.05;
  const nearestS = srLevels.nearestSupport?.price || p * 0.95;

  // 1. Statutory Breakeven Hurdle (SEBON 0.015% + Broker 0.33% avg + DP Rs. 25 + CGT)
  // Round-trip expenses require approx +1.0% to break even
  const statutoryHurdlePct = 1.05;
  const statutoryBreakevenPrice = Number((p * (1 + statutoryHurdlePct / 100)).toFixed(1));

  // 2. Dual Entry Plan
  const aggressiveEntryZone = {
    low: Number(nearestR.toFixed(1)),
    high: Number((nearestR + atr * 0.35).toFixed(1)),
    label: 'Aggressive Breakout Entry Zone'
  };

  const conservativeRetestZone = {
    low: Number((nearestR - atr * 0.20).toFixed(1)),
    high: Number((nearestR + atr * 0.15).toFixed(1)),
    label: 'Conservative T+2 Retest Zone'
  };

  let recommendedEntry: TrapProofLevels['recommendedEntry'] = 'Conservative Retest';
  if (breakoutEval.t2Hazard === '🚨 EXTREME_TRAP_HAZARD') {
    recommendedEntry = 'Avoid / No Entry';
  } else if (breakoutEval.t2Hazard === '🟢 PRIME_RETEST_ENTRY') {
    recommendedEntry = 'Conservative Retest';
  } else if (breakoutEval.t2Hazard === '⚠️ HIGH_RISK_CHASE') {
    recommendedEntry = 'Conservative Retest';
  }

  // 3. Structural Stop Loss: Below nearest support cluster or (Entry - 1.75 * ATR)
  const structuralSL = nearestS * 0.985;
  const volatilitySL = p - atr * 1.75;
  const stopLossPrice = Number(Math.max(p * 0.88, Math.min(structuralSL, volatilitySL)).toFixed(1));
  const stopLossPct = Number((((stopLossPrice - p) / p) * 100).toFixed(2));
  const riskPerShare = Number((p - stopLossPrice).toFixed(1));

  // 4. Targets with Asymmetric RRR (Target 1: 1.6x Risk, Target 2: 2.6x Risk)
  const rawTarget1 = p + riskPerShare * 1.6;
  const rawTarget2 = p + riskPerShare * 2.6;

  // If next major resistance is below target 1, use resistance
  const target1Price = Number(rawTarget1.toFixed(1));
  const target2Price = Number(rawTarget2.toFixed(1));
  const target1UpsidePct = Number((((target1Price - p) / p) * 100).toFixed(2));
  const target2UpsidePct = Number((((target2Price - p) / p) * 100).toFixed(2));

  const rrr1 = riskPerShare > 0 ? Number(((target1Price - p) / riskPerShare).toFixed(2)) : 0;
  const rrr2 = riskPerShare > 0 ? Number(((target2Price - p) / riskPerShare).toFixed(2)) : 0;
  const isHighExpectancyTrade = rrr1 >= 1.5 && rrr2 >= 2.2 && breakoutEval.bullTrapProbability < 50;

  let actionableNepali = 'पुलब्याक कुर्नुहोस्: T+2 डम्पको जोखिम कम गर्न रेसिस्टेन्स पुन: परीक्षण (Retest) भएपछि मात्र खरिद गर्नुहोस्।';
  let actionableEnglish = 'Wait for pullback/retest. Avoid chasing Day 1 moves to stay safe from T+2 lockup drawdowns.';

  if (breakoutEval.t2Hazard === '🟢 PRIME_RETEST_ENTRY') {
    actionableNepali = `उत्कृष्ट प्रवेश विन्दु: रु. ${conservativeRetestZone.low} - ${conservativeRetestZone.high} मा प्रवेश गर्नुहोस्। स्टप लस रु. ${stopLossPrice} मा कडा राख्नुहोस्।`;
    actionableEnglish = `Prime Retest Entry: Scale in between Rs. ${conservativeRetestZone.low} - ${conservativeRetestZone.high} with stop-loss at Rs. ${stopLossPrice}.`;
  } else if (breakoutEval.t2Hazard === '🚨 EXTREME_TRAP_HAZARD') {
    actionableNepali = 'जोखिम चेतावनी: आज खरिद नगर्नुहोस्! झुक्क्याउने ब्रेकआउट (Bull Trap) को प्रबल सम्भावना छ।';
    actionableEnglish = 'High Trap Risk: Stand aside. Do not buy current circuit or extended wick.';
  }

  return {
    currentPrice: p,
    pivotLevel: nearestR,
    aggressiveEntryZone,
    conservativeRetestZone,
    recommendedEntry,
    statutoryBreakevenPrice,
    statutoryHurdlePct,
    stopLossPrice,
    stopLossPct,
    riskPerShare,
    target1Price,
    target1UpsidePct,
    target2Price,
    target2UpsidePct,
    rrr1,
    rrr2,
    isHighExpectancyTrade,
    actionableNepali,
    actionableEnglish,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ZERO-BID EXIT TRAP & LIQUIDITY DEPTH ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

export function calculateExitLiquiditySafety(stock: any): ExitLiquiditySafety {
  const turnover = Number(stock?.turnover || stock?.totalTurnover || 0);
  const p = Number(stock?.ltp || 100);
  const volume = Number(stock?.volume || stock?.totalTradedQuantity || 0);

  // Approximate buyer order book depth based on turnover and volume
  const estBidDepthShares = Math.round(volume * 0.25);

  let exitSafetyTier: ExitLiquiditySafety['exitSafetyTier'] = 'High Liquidity (Safe Exit)';
  let exitTrapScore = 20;
  let warningNepali = 'सुलभ निकास: पर्याप्त खरिदकर्ता उपलब्ध छन्; स्टप लस सजिलै कार्यान्वयन हुन सक्छ।';

  if (turnover < 2500000 || volume < 5000) {
    exitSafetyTier = 'Severe Exit Trap (Zero-Bid Risk)';
    exitTrapScore = 85;
    warningNepali = 'निकास जोखिम (Exit Trap): शेयर अत्यधिक कमजोर छ। बजार खस्दा खरिदकर्ता शून्य (Zero Bids) भई स्टप लस नबिक्ने खतरा छ।';
  } else if (turnover < 10000000) {
    exitSafetyTier = 'Moderate Liquidity';
    exitTrapScore = 50;
    warningNepali = 'मध्यम तरलता: ठूलो कित्ता एकैपटक बेच्न गाह्रो हुन सक्छ; साना साना लटमा निकास खोज्नुहोस्।';
  }

  return {
    turnover,
    estimatedBidDepthShares: estBidDepthShares,
    exitSafetyTier,
    exitTrapScore,
    warningNepali,
  };
}
