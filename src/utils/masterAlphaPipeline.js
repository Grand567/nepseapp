// src/utils/masterAlphaPipeline.js
import { evaluateMasterStock } from './masterProfitEngine';
import { calculateDynamicPositionSizing, getUserConfiguredCapital } from './dynamicCapitalEngine';
import { getDetailedMarketStatus } from './nepseCalendar';
import { getCachedRealPriceHistory, getCachedRealBrokerAnalysis } from './liveData';
import { adjustForCorporateActionsWithConfirmation } from './setupAnalyzer';

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

  const win20 = slice.slice(-Math.min(20, n)).map(c => Number(c.close || close));
  const mean20 = win20.reduce((a, b) => a + b, 0) / Math.max(1, win20.length);
  const variance20 = win20.reduce((a, b) => a + Math.pow(b - mean20, 2), 0) / Math.max(1, win20.length);
  const std20 = Math.sqrt(Math.max(0, variance20));

  const zScore20 = std20 > EPSILON ? clampFinite((close - mean20) / std20, -4.0, 4.0, 0) : 0;
  const bbLower = mean20 - 2 * std20;
  const bbWidth = 4 * std20;
  const bbPercentB = bbWidth > EPSILON ? clampFinite((close - bbLower) / bbWidth, -0.5, 1.5, 0.5) : 0.5;

  let gains = 0;
  let losses = 0;
  const rsiLookback = Math.min(14, n - 1);
  for (let i = n - rsiLookback; i < n; i++) {
    const diff = Number(slice[i].close || 0) - Number(slice[i - 1].close || 0);
    if (diff > 0) gains += diff;
    else if (diff < 0) losses += Math.abs(diff);
  }
  let rsi14 = 50;
  if (rsiLookback >= 2) {
    if (losses < EPSILON && gains > EPSILON) rsi14 = 95;
    else if (gains < EPSILON && losses > EPSILON) rsi14 = 5;
    else if (gains > EPSILON || losses > EPSILON) {
      const rs = safeDiv(gains / rsiLookback, losses / rsiLookback, 1.0);
      rsi14 = 100 - (100 / (1 + rs));
    }
  }
  const rsi14Norm = clampFinite((rsi14 - 50) / 50, -1.0, 1.0, 0);

  const vols20 = slice.slice(-Math.min(20, n)).map(c => Math.max(0, Number(c.volume || 0)));
  const avgVol20 = vols20.reduce((a, b) => a + b, 0) / Math.max(1, vols20.length);
  const currVol = Math.max(0, Number(curr.volume || 0));
  const rvol20 = avgVol20 > EPSILON ? clampFinite(currVol / avgVol20, 0, 8.0, 1.0) : 1.0;

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

  const win50 = slice.slice(-Math.min(50, n)).map(c => Number(c.close || close));
  const mean50 = win50.reduce((a, b) => a + b, 0) / Math.max(1, win50.length);
  const ema20Dist = clampFinite(safeDiv(close - mean20, mean20, 0), -0.5, 0.5, 0);
  const ema50Dist = clampFinite(safeDiv(close - mean50, mean50, 0), -0.6, 0.6, 0);

  return {
    isValid: n >= 5,
    historyLength: n,
    isNewlyListedIpo: n < 30,
    features: {
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
    }
  };
}

/**
 * Computes NRB Monetary Macro Multiplier for equity valuation & breakout conviction.
 */
export function evaluateNrbMacroMultiplier(nrbMetrics = {}) {
  const cdRatio = Number(nrbMetrics.cdRatio ?? 81.5);
  const ibor = Number(nrbMetrics.ibor ?? nrbMetrics.interbankRate ?? 4.5);
  const tbill91d = Number(nrbMetrics.tbill91d ?? 4.2);
  const repoRate = Number(nrbMetrics.repoRate ?? 5.0);

  let probabilityMultiplier = 1.0;
  let breakoutConvictionThreshold = 60.0;
  let valuationDiscountPct = 0.0;
  let regimeLabel = 'NEUTRAL_LIQUIDITY';

  if (cdRatio > 87.0 || ibor > 7.0 || tbill91d > 7.5) {
    probabilityMultiplier = 0.78;
    breakoutConvictionThreshold = 72.0;
    valuationDiscountPct = 15.0;
    regimeLabel = 'TIGHT_LIQUIDITY_CRUNCH';
  } else if (cdRatio > 85.0 || ibor > 6.0 || repoRate > 6.5) {
    probabilityMultiplier = 0.88;
    breakoutConvictionThreshold = 66.0;
    valuationDiscountPct = 8.0;
    regimeLabel = 'CAUTIOUS_MONETARY_REGIME';
  } else if (cdRatio < 82.0 && ibor <= 4.5 && tbill91d <= 4.5) {
    probabilityMultiplier = 1.06;
    breakoutConvictionThreshold = 58.0;
    valuationDiscountPct = 0.0;
    regimeLabel = 'EXPANSIONARY_LIQUIDITY';
  }

  return {
    regimeLabel,
    cdRatio,
    ibor,
    tbill91d,
    repoRate,
    probabilityMultiplier,
    breakoutConvictionThreshold,
    valuationDiscountPct
  };
}

/**
 * Generates 1D, 3D, and 5D directional probabilities with NRB Macro Discounting and Zero Lookahead.
 */
export function predictMultiHorizonProbabilities(candles = [], nrbMetrics = {}, newsScore = 0) {
  const currIdx = candles.length - 1;
  const currentFeatures = extractSafeFeatureVector(candles, currIdx);
  const macro = evaluateNrbMacroMultiplier(nrbMetrics);

  if (!currentFeatures.isValid) {
    return {
      supported: false,
      reason: 'Insufficient trading history (< 5 sessions) for reliable probability inference.',
      macro,
      horizons: {
        '1D': { horizon: '1D', probabilityPct: 52.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL_HOLD' },
        '3D': { horizon: '3D', probabilityPct: 54.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL_HOLD' },
        '5D': { horizon: '5D', probabilityPct: 55.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL_HOLD' }
      }
    };
  }

  const f = currentFeatures.features;
  const rawScore =
    (f.ema20Dist * 2.2) +
    (f.ema50Dist * 1.5) +
    (f.rsi14Norm * 0.8) +
    ((f.rvol20 - 1.0) * 0.35) -
    (Math.max(0, f.zScore20 - 2.2) * 0.9) +
    (Math.max(-2, Math.min(2, Number(newsScore || 0))) * 0.25);

  const sigmoid = (x) => 1 / (1 + Math.exp(-x));

  const computeHorizon = (hDays, scale) => {
    const baseProb = sigmoid(rawScore * scale) * 100;
    const macroAdjustedProb = Math.min(88.0, Math.max(15.0, +(baseProb * macro.probabilityMultiplier).toFixed(1)));
    const isActionableBullish = macroAdjustedProb >= macro.breakoutConvictionThreshold;
    return {
      horizon: `${hDays}D`,
      rawProbabilityPct: +baseProb.toFixed(1),
      probabilityPct: macroAdjustedProb,
      convictionThresholdPct: macro.breakoutConvictionThreshold,
      isActionableBullish,
      signal: isActionableBullish
        ? 'BULLISH_HIGH_CONVICTION'
        : (macroAdjustedProb <= 40.0 ? 'BEARISH_DISTRIBUTION' : 'NEUTRAL_HOLD')
    };
  };

  return {
    supported: true,
    isNewlyListedIpo: currentFeatures.isNewlyListedIpo,
    entryExecutionBasis: 'T+1_OPEN_STRICT',
    macro,
    features: f,
    horizons: {
      '1D': computeHorizon(1, 0.85),
      '3D': computeHorizon(3, 1.00),
      '5D': computeHorizon(5, 1.12)
    }
  };
}

/**
 * Explains in human terms why a stock failed one of the 5 institutional stages.
 */
export function getStageFailureReason(dossier) {
  if (!dossier) return 'Stock metrics unavailable.';
  const c = dossier.stageChecklist || {};
  const ep = dossier.executionPlan || dossier.metrics || {};
  const reasons = [];

  if (dossier.sectorRank > 3) {
    reasons.push(`Sector Rank #${dossier.sectorRank}/13 (Outside Top 3 Leaders)`);
  }
  if (!c.step2_quality8Gate && dossier.setupScore < 72) {
    reasons.push(`Setup Score ${dossier.setupScore}/100 (< 72 threshold)`);
  }
  if (!c.step3_vduAndBrokerFlow) {
    if (ep.pacedVduRatio > 0.65) reasons.push(`Volume not dry enough (VDU ${ep.pacedVduRatio}x > 0.65x)`);
    if (ep.bcr3Buy < 38) reasons.push(`Low Top-3 Broker flow (BCR3 Buy ${ep.bcr3Buy}% < 38%)`);
    if (ep.bcr3Sell >= 38) reasons.push(`Operator dumping (BCR3 Sell ${ep.bcr3Sell}% >= 38%)`);
    if (ep.upperWickPct >= 42) reasons.push(`Upper rejection shadow (${ep.upperWickPct}% wick)`);
  }
  if (!c.step4_sizingAndNetRrr) {
    if (dossier.ltp > ep.chaseCap) {
      reasons.push(`Extended above Chase Cap (LTP Rs. ${dossier.ltp} > Cap Rs. ${ep.chaseCap})`);
    } else if (ep.netRRR1 < 2.5) {
      reasons.push(`Net Post-Tax R:R ${ep.netRRR1}:1 < 2.5:1 required`);
    }
  }
  if (!c.step5_circuitAndTaxReady) {
    if (Math.abs(Number(dossier.pChange || 0)) >= 14.2) {
      reasons.push(`Locked near ±15% circuit limit (${dossier.pChange}%)`);
    }
  }

  return reasons.length > 0 ? reasons.join(' • ') : 'All 5 stages confirmed.';
}

/**
 * Exact Statutory NEPSE Net Trade & Breakeven Calculator with Dynamic CGT Rate
 * Supports 5.0% (2083 Gazette Revised Short-Term), 7.5% (Standard Short-Term), or 10.0% (Institutional)
 */
export function calculateExactStatutoryTrade(entryPrice, targetPrice, kitta, cgtRate = 0.075) {
  const qty = Math.max(10, Number(kitta) || 10);
  const buyRate = Math.max(1, Number(entryPrice) || 100);
  const sellRate = Math.max(1, Number(targetPrice) || buyRate);

  const grossBuy = qty * buyRate;
  const grossSell = qty * sellRate;

  const getCommRate = (amt) => {
    if (amt <= 50000) return 0.0036;
    if (amt <= 500000) return 0.0033;
    if (amt <= 2000000) return 0.0031;
    if (amt <= 10000000) return 0.0027;
    return 0.0024;
  };

  const buyComm = Math.max(10, grossBuy * getCommRate(grossBuy));
  const buySebon = grossBuy * 0.00015;
  const buyDp = 25;
  const totalBuyCost = grossBuy + buyComm + buySebon + buyDp;
  const waccPerShare = totalBuyCost / qty;

  const sellComm = Math.max(10, grossSell * getCommRate(grossSell));
  const sellSebon = grossSell * 0.00015;
  const sellDp = 25;
  const netSellBeforeTax = grossSell - sellComm - sellSebon - sellDp;

  const taxableGain = Math.max(0, netSellBeforeTax - totalBuyCost);
  const cgtAmount = taxableGain * cgtRate;
  const netRealizedGain = netSellBeforeTax - totalBuyCost - cgtAmount;
  const netReturnPct = totalBuyCost > 0 ? +((netRealizedGain / totalBuyCost) * 100).toFixed(2) : 0;

  // Statutory Zero-Loss Breakeven Price (covers both buy & sell friction + Rs. 25 DP each side)
  const statutoryBreakevenPrice = +((totalBuyCost + 25 + 10) / (qty * (1 - getCommRate(grossBuy) - 0.00015))).toFixed(1);

  return {
    totalBuyCost: Math.round(totalBuyCost),
    waccPerShare: +waccPerShare.toFixed(2),
    cgtAmount: Math.round(cgtAmount),
    netRealizedGain: Math.round(netRealizedGain),
    netReturnPct,
    statutoryBreakevenPrice
  };
}

/**
 * Computes 10-Day Sector Relative Strength (RS) Ranks across all 13 NEPSE sectors.
 */
export function computeSectorRelativeStrengthRanks(stocks = []) {
  const sectorStats = {};

  for (const s of stocks) {
    if (!s || !s.symbol) continue;
    const sec = s.sector || s.sectorName || 'Others';
    if (sec === 'Others' || sec === 'Mutual Fund' || sec === 'Promoter Share') continue;

    if (!sectorStats[sec]) {
      sectorStats[sec] = { sector: sec, count: 0, sumPChange: 0, sumRvol: 0, totalTurnover: 0, sumRet10D: 0 };
    }

    const pChg = Number(s.pChange || 0);
    const rvol = Number(s.rvol || s.volumeSurgeRatio || 1);
    const turnover = Number(s.turnover || (Number(s.ltp || 0) * Number(s.volume || 0)) || 0);

    const hist = getCachedRealPriceHistory(s.symbol);
    let ret10D = pChg;
    if (Array.isArray(hist) && hist.length >= 10) {
      const latestClose = Number(hist[hist.length - 1]?.close || s.ltp || 0);
      const close10DAgo = Number(hist[Math.max(0, hist.length - 10)]?.close || 0);
      if (latestClose > 0 && close10DAgo > 0) {
        ret10D = ((latestClose - close10DAgo) / close10DAgo) * 100;
      }
    }

    sectorStats[sec].count += 1;
    sectorStats[sec].sumPChange += pChg;
    sectorStats[sec].sumRvol += rvol;
    sectorStats[sec].totalTurnover += turnover;
    sectorStats[sec].sumRet10D += ret10D;
  }

  const ranked = Object.values(sectorStats)
    .filter(st => st.count > 0)
    .map(st => {
      const avgPChange = st.sumPChange / st.count;
      const avgRet10D = st.sumRet10D / st.count;
      const avgRvol = st.sumRvol / st.count;
      const momentumScore = (avgRet10D * 0.55) + (avgPChange * 0.30) + ((avgRvol - 1) * 15);
      return {
        ...st,
        avgPChange: +avgPChange.toFixed(2),
        avgRet10D: +avgRet10D.toFixed(2),
        avgRvol: +avgRvol.toFixed(2),
        momentumScore: +momentumScore.toFixed(2)
      };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore);

  const sectorRanks = {};
  ranked.forEach((item, idx) => {
    sectorRanks[item.sector] = idx + 1;
  });

  return {
    sectorRanks,
    topSectors: ranked.slice(0, 3),
    allRankedSectors: ranked
  };
}

/**
 * Enterprise-Grade Unified 5-Step Alpha Pipeline for NEPSE
 */
export function runUnifiedFiveStepAlphaDesk({
  stocks = [],
  indices = {},
  userCapital = getUserConfiguredCapital(),
  riskTolerancePct = 1.5,
  requiredNetRRR = 2.5,
  cgtRate = 0.075
}) {
  const marketStatus = getDetailedMarketStatus();
  const nptMins = Number(marketStatus?.nptTotalMinutes || 690);

  // Improvement A: Intraday Volume Pacing Multiplier (11:00 AM = 660m, 3:00 PM = 900m -> 240m session)
  const elapsedTradingMins = Math.max(15, Math.min(240, nptMins - 660));
  const intradayVolumePacingFactor = marketStatus?.isOpen ? (240 / elapsedTradingMins) : 1.0;

  let totalTurnover = Number(indices?.nepse?.turnover || 0);
  if (!totalTurnover || totalTurnover <= 0) {
    totalTurnover = stocks.reduce((acc, s) => acc + Number(s?.turnover || (Number(s?.ltp || 0) * Number(s?.volume || 0)) || 0), 0);
  }
  const marketTurnoverArba = +(totalTurnover / 1e9).toFixed(2);

  const adv = stocks.filter(s => Number(s?.pChange || 0) > 0).length;
  const dec = stocks.filter(s => Number(s?.pChange || 0) < 0).length;
  const totalTraded = Math.max(1, adv + dec);
  const breadthPct = Math.round((adv / totalTraded) * 100);
  const breadthPassed = breadthPct >= 38;

  const { sectorRanks, topSectors } = computeSectorRelativeStrengthRanks(stocks);

  // Improvement B: 10% Tactical Cash Reserve Lock
  const safeUserCapital = Math.max(10000, Number(userCapital) || 100000);
  const deployableCapital = Math.round(safeUserCapital * 0.90);

  const fullyQualifiedPicks = [];
  const radarRunnerUps = [];

  for (const rawStock of stocks) {
    if (!rawStock || !rawStock.symbol) continue;
    const symbol = String(rawStock.symbol).toUpperCase().trim();
    const ltp = Number(rawStock.ltp || rawStock.closePrice || 0);
    if (ltp <= 40) continue;

    const sector = rawStock.sector || rawStock.sectorName || 'Others';
    const sectorRank = Number(sectorRanks[sector] ?? 99);

    // Improvement C: Corporate Action Ex-Date Normalization
    const rawHistory = getCachedRealPriceHistory(symbol) || rawStock.history || [];
    const dividends = rawStock.dividendHistory || [];
    let adjustedCandles = rawHistory;
    try {
      if (Array.isArray(rawHistory) && rawHistory.length > 10 && dividends.length > 0) {
        const adj = adjustForCorporateActionsWithConfirmation(rawHistory, dividends);
        if (adj?.adjustedCandles) adjustedCandles = adj.adjustedCandles;
      }
    } catch (_) {}

    const masterEval = evaluateMasterStock(rawStock, breadthPassed, 0);
    if (!masterEval) continue;

    // ── STEP 1 CHECK: Top 3 Sector Leadership ──
    const step1SectorPassed = sectorRank <= 3 || (sectorRank <= 5 && masterEval.setupScore >= 82);

    // ── STEP 2 CHECK: 8-Gate Quality Screener & Confluence Score >= 72 ──
    const step2GatePassed = Boolean(
      masterEval.gatesPassedCount >= 6 &&
      masterEval.setupScore >= 72 &&
      !masterEval.isPromoterLockinNear &&
      masterEval.turnoverLakhs >= 40
    );

    // ── STEP 3 CHECK: Wyckoff VDU + Broker Flow + Anti-Shadow-Distribution Wick Check ──
    const cachedBroker = getCachedRealBrokerAnalysis(symbol) || rawStock.brokerAnalysis || rawStock.realBrokerAnalysis || null;
    const bcr3Buy = Number(cachedBroker?.bcr3BuyPct ?? masterEval.bcr3 ?? 0);
    const bcr3Sell = Number(cachedBroker?.bcr3SellPct ?? 0);
    const isOperatorDumping = bcr3Sell >= 38.0 && bcr3Sell > bcr3Buy;

    // Upper-Wick Shadow Distribution Check (< 40% upper wick required)
    const high = Number(rawStock.high || ltp);
    const low = Number(rawStock.low || ltp);
    const open = Number(rawStock.open || ltp);
    const candleRange = Math.max(0.01, high - low);
    const upperWickRatio = high > Math.max(open, ltp) ? +((high - Math.max(open, ltp)) / candleRange).toFixed(2) : 0;
    const hasShadowDistributionWick = upperWickRatio >= 0.42 && Number(rawStock.pChange || 0) > 2.0;

    let rawVduRatio = Number(rawStock.rvol || masterEval.rvol || 1.0);
    if (Array.isArray(adjustedCandles) && adjustedCandles.length >= 20) {
      const recent20 = adjustedCandles.slice(-20);
      const avgVol20 = recent20.reduce((sum, c) => sum + Number(c.volume || 0), 0) / 20;
      const minQuietVol = Math.min(...recent20.slice(-5).map(c => Number(c.volume || avgVol20)));
      if (avgVol20 > 0) {
        rawVduRatio = +(minQuietVol / avgVol20).toFixed(2);
      }
    }
    const pacedVduRatio = +(rawVduRatio * (marketStatus?.isOpen ? Math.min(1.15, intradayVolumePacingFactor * 0.8) : 1.0)).toFixed(2);
    const step3FlowPassed = Boolean(
      bcr3Buy >= 38.0 &&
      !isOperatorDumping &&
      !hasShadowDistributionWick &&
      (pacedVduRatio <= 0.65 || masterEval.rvol >= 1.35)
    );

    // ── STEP 4 CHECK: Half-Kelly Sizing, 2-Tranche T+2 Split & 3-Tier Scale-Out ──
    const entryLow = Number(masterEval.entryLow || +(ltp * 0.99).toFixed(1));
    const entryHigh = Number(masterEval.entryHigh || +(ltp * 1.015).toFixed(1));
    const chaseCap = Number(masterEval.chaseCap || +(entryHigh * 1.025).toFixed(1));
    const stopLoss = Number(masterEval.stopLoss || +(ltp * 0.945).toFixed(1));
    const target1 = Number(masterEval.target1Gross || +(ltp * 1.15).toFixed(1));
    const target2 = Number(masterEval.target2Net || +(ltp * 1.25).toFixed(1));
    const target3Runner = +(ltp * 1.40).toFixed(1);

    const isInsideBuyZone = ltp >= entryLow * 0.985 && ltp <= entryHigh * 1.005;
    const isInsideChaseCap = ltp <= chaseCap;

    const dynSizing = calculateDynamicPositionSizing({
      userCapital: deployableCapital,
      entryPrice: ltp,
      stopLoss,
      target1,
      target2,
      median20DayTurnover: Math.max(5000000, masterEval.turnoverLakhs * 100000)
    });

    const rawKitta = Number(dynSizing?.finalKitta || 10);
    const strict10LotKitta = Math.max(10, Math.floor(rawKitta / 10) * 10);

    // 2-Tranche T+2 Settlement Split (50% Day-1 Base Entry / 50% After Demat T+2 Settlement)
    const tranche1Kitta = strict10LotKitta >= 20 ? Math.floor((strict10LotKitta * 0.5) / 10) * 10 : strict10LotKitta;
    const tranche2Kitta = Math.max(0, strict10LotKitta - tranche1Kitta);

    // 3-Tier Profit Maximization Scale-Out Ladder (40% T1 / 30% T2 / 30% Multibagger Runner)
    const scaleOutT1Kitta = strict10LotKitta >= 30 ? Math.max(10, Math.floor((strict10LotKitta * 0.4) / 10) * 10) : Math.max(10, Math.floor((strict10LotKitta * 0.5) / 10) * 10);
    const scaleOutT2Kitta = strict10LotKitta >= 30 ? Math.max(10, Math.floor((strict10LotKitta * 0.3) / 10) * 10) : Math.max(0, strict10LotKitta - scaleOutT1Kitta);
    const runnerT3Kitta = Math.max(0, strict10LotKitta - scaleOutT1Kitta - scaleOutT2Kitta);

    const netTradeT1 = calculateExactStatutoryTrade(ltp, target1, strict10LotKitta, cgtRate);
    const netTradeT2 = calculateExactStatutoryTrade(ltp, target2, strict10LotKitta, cgtRate);
    const netTradeRunner = calculateExactStatutoryTrade(ltp, target3Runner, strict10LotKitta, cgtRate);

    // Blended Net Profit across the 3-Tier Scale-Out Ladder
    const blendedTier1Gain = calculateExactStatutoryTrade(ltp, target1, scaleOutT1Kitta, cgtRate).netRealizedGain;
    const blendedTier2Gain = scaleOutT2Kitta > 0 ? calculateExactStatutoryTrade(ltp, target2, scaleOutT2Kitta, cgtRate).netRealizedGain : 0;
    const blendedRunnerGain = runnerT3Kitta > 0 ? calculateExactStatutoryTrade(ltp, target3Runner, runnerT3Kitta, cgtRate).netRealizedGain : 0;
    const maximizedLadderNetProfit = Math.round(blendedTier1Gain + blendedTier2Gain + blendedRunnerGain);

    const riskPerShare = Math.max(1, ltp - stopLoss);
    const totalRiskRupees = Math.round(strict10LotKitta * riskPerShare);
    const netRRR1 = totalRiskRupees > 0 ? +(netTradeT1.netRealizedGain / totalRiskRupees).toFixed(2) : Number(masterEval.netRRR || 2.5);

    const step4SizingPassed = Boolean(
      strict10LotKitta >= 10 &&
      netRRR1 >= requiredNetRRR &&
      isInsideChaseCap
    );

    // ── STEP 5 CHECK: Circuit Freeze (+/- 14.95%) & T+2 Tax Readiness ──
    const pChangePct = Number(rawStock.pChange || 0);
    const isCircuitLocked = Math.abs(pChangePct) >= 14.2;
    const step5ExecutionReady = Boolean(!isCircuitLocked && netTradeT1.statutoryBreakevenPrice > 0);

    const checklist = [
      {
        step: 1,
        title: 'Step 1: Sector Leadership',
        passed: step1SectorPassed,
        metric: `${sector} (Rank #${sectorRank <= 20 ? sectorRank : '—'})`,
        detail: step1SectorPassed
          ? `Institutional money is actively rotating into ${sector}.`
          : `${sector} is currently lagging the top 3 sector leaders.`
      },
      {
        step: 2,
        title: 'Step 2: 8-Gate Quality & Score',
        passed: step2GatePassed,
        metric: `${masterEval.gatesPassedCount}/8 Gates • Score ${masterEval.setupScore}/100`,
        detail: step2GatePassed
          ? `Passed liquidity (${masterEval.turnoverLakhs}L), trend (>50 EMA), and lock-in safety.`
          : `Failed one or more quality gates or score < 72.`
      },
      {
        step: 3,
        title: 'Step 3: Wyckoff VDU & Broker Flow',
        passed: step3FlowPassed,
        metric: `BCR3 Buy: ${bcr3Buy}% • VDU: ${pacedVduRatio}x`,
        detail: isOperatorDumping
          ? `🚨 VETO: Top brokers dumping (${bcr3Sell}% sell share).`
          : hasShadowDistributionWick
          ? `🚨 VETO: Upper rejection shadow (${Math.round(upperWickRatio * 100)}% wick) indicates shadow supply.`
          : step3FlowPassed
          ? `Top 3 brokers absorbing ${bcr3Buy}% of volume with clean candle body.`
          : `Awaiting stronger top-3 broker concentration (>=38%) or volume dry-up.`
      },
      {
        step: 4,
        title: 'Step 4: Half-Kelly Sizing & Net R:R',
        passed: step4SizingPassed,
        metric: `Net R:R ${netRRR1}:1 • ${strict10LotKitta} Kitta`,
        detail: !isInsideChaseCap
          ? `⚠️ Extended above Chase Cap (Rs. ${chaseCap}). Wait for pullback.`
          : `Net R:R ${netRRR1}:1 after ${(cgtRate * 100).toFixed(1)}% CGT & fees. Max Risk: Rs. ${totalRiskRupees.toLocaleString()}.`
      },
      {
        step: 5,
        title: 'Step 5: Circuit & T+2 Tax Check',
        passed: step5ExecutionReady,
        metric: `Breakeven: Rs. ${netTradeT1.statutoryBreakevenPrice} • Band Clear`,
        detail: isCircuitLocked
          ? `🚨 Locked near ±15% circuit limit (${pChangePct}%). Do not chase.`
          : `Clear of ±15% circuit freeze. Zero-Loss Breakeven at Rs. ${netTradeT1.statutoryBreakevenPrice}.`
      }
    ];

    const stagesPassedCount = checklist.filter(c => c.passed).length;
    const all5StagesPassed = stagesPassedCount === 5;

    const prediction = predictMultiHorizonProbabilities(adjustedCandles, indices?.nrbMacro || {}, masterEval.newsImpactScore || 0);

    const dossier = {
      symbol,
      name: masterEval.name || rawStock.companyName || rawStock.name || symbol,
      sector,
      sectorRank,
      ltp,
      pChange: pChangePct,
      setupScore: masterEval.setupScore,
      stagesPassedCount,
      all5StagesPassed,
      executionStatus: !isInsideChaseCap
        ? 'EXTENDED_ABOVE_CHASE_CAP'
        : isInsideBuyZone
        ? 'ACTIONABLE_IN_BUY_ZONE'
        : 'NEAR_PIVOT_WATCH',
      checklist,
      prediction,
      stageChecklist: {
        step1_sectorLeader: step1SectorPassed,
        step2_quality8Gate: step2GatePassed,
        step3_vduAndBrokerFlow: step3FlowPassed,
        step4_sizingAndNetRrr: step4SizingPassed,
        step5_circuitAndTaxReady: step5ExecutionReady
      },
      metrics: {
        buyZoneLow: entryLow,
        buyZoneHigh: entryHigh,
        chaseCap,
        stopLoss,
        target1,
        target2,
        netRRR1,
        bcr3BuyPct: bcr3Buy,
        bcr3SellPct: bcr3Sell,
        vduRatio: pacedVduRatio,
        isInsideChaseCap,
        statutoryBreakevenStop: netTradeT1.statutoryBreakevenPrice
      },
      executionPlan: {
        buyZoneLow: entryLow,
        buyZoneHigh: entryHigh,
        chaseCap,
        stopLoss,
        stopLossPct: masterEval.stopLossPct,
        target1,
        target1NetPct: netTradeT1.netReturnPct,
        target2,
        target2NetPct: netTradeT2.netReturnPct,
        target3Runner,
        target3RunnerNetPct: netTradeRunner.netReturnPct,
        statutoryBreakevenPrice: netTradeT1.statutoryBreakevenPrice,
        waccPerShare: netTradeT1.waccPerShare,
        recommendedKitta: strict10LotKitta,
        tranche1Kitta,
        tranche2Kitta,
        scaleOutT1Kitta,
        scaleOutT2Kitta,
        runnerT3Kitta,
        capitalOutlay: strict10LotKitta * ltp,
        cashReserveLocked: safeUserCapital - deployableCapital,
        maxRiskRupees: totalRiskRupees,
        actualRiskPct: +((totalRiskRupees / safeUserCapital) * 100).toFixed(2),
        netProfitT1: netTradeT1.netRealizedGain,
        netProfitT2: netTradeT2.netRealizedGain,
        maximizedLadderNetProfit,
        netRRR1,
        bcr3Buy,
        bcr3Sell,
        pacedVduRatio,
        upperWickPct: Math.round(upperWickRatio * 100),
        analogWinRate: masterEval.analogWinRate,
        track: masterEval.track
      },
      rawStock,
      masterEval
    };

    if (all5StagesPassed) {
      fullyQualifiedPicks.push(dossier);
    } else if (stagesPassedCount >= 3 && !isOperatorDumping && !isCircuitLocked) {
      radarRunnerUps.push(dossier);
    }
  }

  fullyQualifiedPicks.sort((a, b) => (b.setupScore + b.executionPlan.netRRR1 * 5) - (a.setupScore + a.executionPlan.netRRR1 * 5));
  radarRunnerUps.sort((a, b) => (b.stagesPassedCount * 25 + b.setupScore) - (a.stagesPassedCount * 25 + a.setupScore));

  return {
    hasVerifiedPicks: fullyQualifiedPicks.length > 0,
    stance: fullyQualifiedPicks.length > 0 ? 'ACTIONABLE_ALPHA_CONFIRMED' : 'CASH_PRESERVATION_MODE',
    marketContext: {
      marketTurnoverArba,
      breadthPct,
      breadthPassed,
      isOpen: Boolean(marketStatus?.isOpen),
      sessionLabel: marketStatus?.statusLabel || 'NEPSE Session',
      intradayVolumePacingFactor: +intradayVolumePacingFactor.toFixed(2),
      topSectors
    },
    primePick: fullyQualifiedPicks[0] || null,
    qualifiedList: fullyQualifiedPicks.slice(0, 5),
    watchlistRadar: radarRunnerUps.slice(0, 6)
  };
}

/**
 * Evaluates ANY manual stock symbol against all 5 institutional stages on demand.
 * Enables users to test any stock to see exactly which gates pass or fail.
 */
export function evaluateSingleStockAlphaDossier(stockOrSymbol, {
  stocks = [],
  indices = {},
  userCapital = getUserConfiguredCapital(),
  riskTolerancePct = 1.5,
  requiredNetRRR = 2.5,
  cgtRate = 0.075
} = {}) {
  let rawStock = typeof stockOrSymbol === 'object' && stockOrSymbol !== null ? stockOrSymbol : null;
  const sym = typeof stockOrSymbol === 'string'
    ? stockOrSymbol.trim().toUpperCase()
    : String(rawStock?.symbol || '').trim().toUpperCase();

  if (!sym) return null;

  if (!rawStock && Array.isArray(stocks)) {
    rawStock = stocks.find(s => String(s?.symbol || s?.scrip || '').trim().toUpperCase() === sym) || null;
  }
  if (!rawStock) return null;

  const marketStatus = getDetailedMarketStatus();
  const nptMins = Number(marketStatus?.nptTotalMinutes || 690);
  const elapsedTradingMins = Math.max(15, Math.min(240, nptMins - 660));
  const intradayVolumePacingFactor = marketStatus?.isOpen ? (240 / elapsedTradingMins) : 1.0;

  const adv = stocks.filter(s => Number(s?.pChange || 0) > 0).length;
  const dec = stocks.filter(s => Number(s?.pChange || 0) < 0).length;
  const totalTraded = Math.max(1, adv + dec);
  const breadthPct = Math.round((adv / totalTraded) * 100);
  const breadthPassed = breadthPct >= 38;

  const { sectorRanks } = computeSectorRelativeStrengthRanks(stocks);

  const safeUserCapital = Math.max(10000, Number(userCapital) || 100000);
  const deployableCapital = Math.round(safeUserCapital * 0.90);

  const symbol = sym;
  const ltp = Number(rawStock.ltp || rawStock.closePrice || 100);
  const sector = rawStock.sector || rawStock.sectorName || 'Others';
  const sectorRank = Number(sectorRanks[sector] ?? 99);

  const rawHistory = getCachedRealPriceHistory(symbol) || rawStock.history || [];
  const dividends = rawStock.dividendHistory || [];
  let adjustedCandles = rawHistory;
  try {
    if (Array.isArray(rawHistory) && rawHistory.length > 10 && dividends.length > 0) {
      const adj = adjustForCorporateActionsWithConfirmation(rawHistory, dividends);
      if (adj?.adjustedCandles) adjustedCandles = adj.adjustedCandles;
    }
  } catch (_) {}

  const masterEval = evaluateMasterStock(rawStock, breadthPassed, 0);
  if (!masterEval) return null;

  // Step 1: Sector RS
  const step1SectorPassed = sectorRank <= 3 || (sectorRank <= 5 && masterEval.setupScore >= 82);

  // Step 2: 8-Gate Quality
  const step2GatePassed = Boolean(
    masterEval.gatesPassedCount >= 6 &&
    masterEval.setupScore >= 72 &&
    !masterEval.isPromoterLockinNear &&
    masterEval.turnoverLakhs >= 40
  );

  // Step 3: Wyckoff & Broker Flow & Anti-Wick
  const cachedBroker = getCachedRealBrokerAnalysis(symbol) || rawStock.brokerAnalysis || rawStock.realBrokerAnalysis || null;
  const bcr3Buy = Number(cachedBroker?.bcr3BuyPct ?? masterEval.bcr3 ?? 0);
  const bcr3Sell = Number(cachedBroker?.bcr3SellPct ?? 0);
  const isOperatorDumping = bcr3Sell >= 38.0 && bcr3Sell > bcr3Buy;

  const high = Number(rawStock.high || ltp);
  const low = Number(rawStock.low || ltp);
  const open = Number(rawStock.open || ltp);
  const candleRange = Math.max(0.01, high - low);
  const upperWickRatio = high > Math.max(open, ltp) ? +((high - Math.max(open, ltp)) / candleRange).toFixed(2) : 0;
  const hasShadowDistributionWick = upperWickRatio >= 0.42 && Number(rawStock.pChange || 0) > 2.0;

  let rawVduRatio = Number(rawStock.rvol || masterEval.rvol || 1.0);
  if (Array.isArray(adjustedCandles) && adjustedCandles.length >= 20) {
    const recent20 = adjustedCandles.slice(-20);
    const avgVol20 = recent20.reduce((sum, c) => sum + Number(c.volume || 0), 0) / 20;
    const minQuietVol = Math.min(...recent20.slice(-5).map(c => Number(c.volume || avgVol20)));
    if (avgVol20 > 0) {
      rawVduRatio = +(minQuietVol / avgVol20).toFixed(2);
    }
  }
  const pacedVduRatio = +(rawVduRatio * (marketStatus?.isOpen ? Math.min(1.15, intradayVolumePacingFactor * 0.8) : 1.0)).toFixed(2);
  const step3FlowPassed = Boolean(
    bcr3Buy >= 38.0 &&
    !isOperatorDumping &&
    !hasShadowDistributionWick &&
    (pacedVduRatio <= 0.65 || masterEval.rvol >= 1.35)
  );

  // Step 4: Sizing & R:R
  const entryLow = Number(masterEval.entryLow || +(ltp * 0.99).toFixed(1));
  const entryHigh = Number(masterEval.entryHigh || +(ltp * 1.015).toFixed(1));
  const chaseCap = Number(masterEval.chaseCap || +(entryHigh * 1.025).toFixed(1));
  const stopLoss = Number(masterEval.stopLoss || +(ltp * 0.945).toFixed(1));
  const target1 = Number(masterEval.target1Gross || +(ltp * 1.15).toFixed(1));
  const target2 = Number(masterEval.target2Net || +(ltp * 1.25).toFixed(1));
  const target3Runner = +(ltp * 1.40).toFixed(1);

  const isInsideBuyZone = ltp >= entryLow * 0.985 && ltp <= entryHigh * 1.005;
  const isInsideChaseCap = ltp <= chaseCap;

  const dynSizing = calculateDynamicPositionSizing({
    userCapital: deployableCapital,
    entryPrice: ltp,
    stopLoss,
    target1,
    target2,
    median20DayTurnover: Math.max(5000000, masterEval.turnoverLakhs * 100000)
  });

  const rawKitta = Number(dynSizing?.finalKitta || 10);
  const strict10LotKitta = Math.max(10, Math.floor(rawKitta / 10) * 10);

  const tranche1Kitta = strict10LotKitta >= 20 ? Math.floor((strict10LotKitta * 0.5) / 10) * 10 : strict10LotKitta;
  const tranche2Kitta = Math.max(0, strict10LotKitta - tranche1Kitta);

  const scaleOutT1Kitta = strict10LotKitta >= 30 ? Math.max(10, Math.floor((strict10LotKitta * 0.4) / 10) * 10) : Math.max(10, Math.floor((strict10LotKitta * 0.5) / 10) * 10);
  const scaleOutT2Kitta = strict10LotKitta >= 30 ? Math.max(10, Math.floor((strict10LotKitta * 0.3) / 10) * 10) : Math.max(0, strict10LotKitta - scaleOutT1Kitta);
  const runnerT3Kitta = Math.max(0, strict10LotKitta - scaleOutT1Kitta - scaleOutT2Kitta);

  const netTradeT1 = calculateExactStatutoryTrade(ltp, target1, strict10LotKitta, cgtRate);
  const netTradeT2 = calculateExactStatutoryTrade(ltp, target2, strict10LotKitta, cgtRate);
  const netTradeRunner = calculateExactStatutoryTrade(ltp, target3Runner, strict10LotKitta, cgtRate);

  const blendedTier1Gain = calculateExactStatutoryTrade(ltp, target1, scaleOutT1Kitta, cgtRate).netRealizedGain;
  const blendedTier2Gain = scaleOutT2Kitta > 0 ? calculateExactStatutoryTrade(ltp, target2, scaleOutT2Kitta, cgtRate).netRealizedGain : 0;
  const blendedRunnerGain = runnerT3Kitta > 0 ? calculateExactStatutoryTrade(ltp, target3Runner, runnerT3Kitta, cgtRate).netRealizedGain : 0;
  const maximizedLadderNetProfit = Math.round(blendedTier1Gain + blendedTier2Gain + blendedRunnerGain);

  const riskPerShare = Math.max(1, ltp - stopLoss);
  const totalRiskRupees = Math.round(strict10LotKitta * riskPerShare);
  const netRRR1 = totalRiskRupees > 0 ? +(netTradeT1.netRealizedGain / totalRiskRupees).toFixed(2) : Number(masterEval.netRRR || 2.5);

  const step4SizingPassed = Boolean(
    strict10LotKitta >= 10 &&
    netRRR1 >= requiredNetRRR &&
    isInsideChaseCap
  );

  // Step 5: Circuit & Tax
  const pChangePct = Number(rawStock.pChange || 0);
  const isCircuitLocked = Math.abs(pChangePct) >= 14.2;
  const step5ExecutionReady = Boolean(!isCircuitLocked && netTradeT1.statutoryBreakevenPrice > 0);

  const checklist = [
    {
      step: 1,
      title: 'Step 1: Sector Leadership',
      passed: step1SectorPassed,
      metric: `${sector} (Rank #${sectorRank <= 20 ? sectorRank : '—'})`,
      detail: step1SectorPassed
        ? `Institutional money is actively rotating into ${sector}.`
        : `${sector} is currently lagging the top 3 sector leaders.`
    },
    {
      step: 2,
      title: 'Step 2: 8-Gate Quality & Score',
      passed: step2GatePassed,
      metric: `${masterEval.gatesPassedCount}/8 Gates • Score ${masterEval.setupScore}/100`,
      detail: step2GatePassed
        ? `Passed liquidity (${masterEval.turnoverLakhs}L), trend (>50 EMA), and lock-in safety.`
        : `Failed one or more quality gates (passed ${masterEval.gatesPassedCount}/8, score ${masterEval.setupScore}/100).`
    },
    {
      step: 3,
      title: 'Step 3: Wyckoff VDU & Broker Flow',
      passed: step3FlowPassed,
      metric: `BCR3 Buy: ${bcr3Buy}% • VDU: ${pacedVduRatio}x`,
      detail: isOperatorDumping
        ? `🚨 VETO: Top brokers dumping (${bcr3Sell}% sell share).`
        : hasShadowDistributionWick
        ? `🚨 VETO: Upper rejection shadow (${Math.round(upperWickRatio * 100)}% wick) indicates shadow supply.`
        : step3FlowPassed
        ? `Top 3 brokers absorbing ${bcr3Buy}% of volume with clean candle body.`
        : `Awaiting stronger top-3 broker concentration (>=38%) or volume dry-up (current VDU: ${pacedVduRatio}x).`
    },
    {
      step: 4,
      title: 'Step 4: Half-Kelly Sizing & Net R:R',
      passed: step4SizingPassed,
      metric: `Net R:R ${netRRR1}:1 • ${strict10LotKitta} Kitta`,
      detail: !isInsideChaseCap
        ? `⚠️ Extended above Chase Cap (Rs. ${chaseCap}). Wait for pullback.`
        : netRRR1 < requiredNetRRR
        ? `⚠️ Net R:R ${netRRR1}:1 is below required ${requiredNetRRR}:1 threshold.`
        : `Net R:R ${netRRR1}:1 after ${(cgtRate * 100).toFixed(1)}% CGT & fees. Max Risk: Rs. ${totalRiskRupees.toLocaleString()}.`
    },
    {
      step: 5,
      title: 'Step 5: Circuit & T+2 Tax Check',
      passed: step5ExecutionReady,
      metric: `Breakeven: Rs. ${netTradeT1.statutoryBreakevenPrice} • Band Clear`,
      detail: isCircuitLocked
        ? `🚨 Locked near ±15% circuit limit (${pChangePct}%). Do not chase.`
        : `Clear of ±15% circuit freeze. Zero-Loss Breakeven at Rs. ${netTradeT1.statutoryBreakevenPrice}.`
    }
  ];

  const stagesPassedCount = checklist.filter(c => c.passed).length;
  const all5StagesPassed = stagesPassedCount === 5;

  const prediction = predictMultiHorizonProbabilities(adjustedCandles, indices?.nrbMacro || {}, masterEval.newsImpactScore || 0);

  return {
    symbol,
    name: masterEval.name || rawStock.companyName || rawStock.name || symbol,
    sector,
    sectorRank,
    ltp,
    pChange: pChangePct,
    setupScore: masterEval.setupScore,
    stagesPassedCount,
    all5StagesPassed,
    isManualInspection: true,
    executionStatus: !isInsideChaseCap
      ? 'EXTENDED_ABOVE_CHASE_CAP'
      : isInsideBuyZone
      ? 'ACTIONABLE_IN_BUY_ZONE'
      : 'NEAR_PIVOT_WATCH',
    checklist,
    prediction,
    stageChecklist: {
      step1_sectorLeader: step1SectorPassed,
      step2_quality8Gate: step2GatePassed,
      step3_vduAndBrokerFlow: step3FlowPassed,
      step4_sizingAndNetRrr: step4SizingPassed,
      step5_circuitAndTaxReady: step5ExecutionReady
    },
    metrics: {
      buyZoneLow: entryLow,
      buyZoneHigh: entryHigh,
      chaseCap,
      stopLoss,
      target1,
      target2,
      netRRR1,
      bcr3BuyPct: bcr3Buy,
      bcr3SellPct: bcr3Sell,
      vduRatio: pacedVduRatio,
      isInsideChaseCap,
      statutoryBreakevenStop: netTradeT1.statutoryBreakevenPrice
    },
    executionPlan: {
      buyZoneLow: entryLow,
      buyZoneHigh: entryHigh,
      chaseCap,
      stopLoss,
      stopLossPct: masterEval.stopLossPct,
      target1,
      target1NetPct: netTradeT1.netReturnPct,
      target2,
      target2NetPct: netTradeT2.netReturnPct,
      target3Runner,
      target3RunnerNetPct: netTradeRunner.netReturnPct,
      statutoryBreakevenPrice: netTradeT1.statutoryBreakevenPrice,
      waccPerShare: netTradeT1.waccPerShare,
      recommendedKitta: strict10LotKitta,
      tranche1Kitta,
      tranche2Kitta,
      scaleOutT1Kitta,
      scaleOutT2Kitta,
      runnerT3Kitta,
      capitalOutlay: strict10LotKitta * ltp,
      cashReserveLocked: safeUserCapital - deployableCapital,
      maxRiskRupees: totalRiskRupees,
      actualRiskPct: +((totalRiskRupees / safeUserCapital) * 100).toFixed(2),
      netProfitT1: netTradeT1.netRealizedGain,
      netProfitT2: netTradeT2.netRealizedGain,
      maximizedLadderNetProfit,
      netRRR1,
      bcr3Buy,
      bcr3Sell,
      pacedVduRatio,
      upperWickPct: Math.round(upperWickRatio * 100),
      analogWinRate: masterEval.analogWinRate,
      track: masterEval.track
    },
    rawStock,
    masterEval
  };
}

