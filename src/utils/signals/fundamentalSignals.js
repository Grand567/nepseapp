/**
 * fundamentalSignals.js
 * Comprehensive Quantitative Fundamental Analysis Engine
 *
 * Implements exact mathematical formulas and sector benchmarks for:
 * 1. Valuation Ratios: P/E, P/BV, Graham Number, Sector Median Normalization
 * 2. Profitability: Return on Equity (ROE), EPS Quality, Earnings Yield
 * 3. BFI Asset Quality Gate: Non-Performing Loans (NPL), Capital Adequacy Ratio (CAR)
 * 4. Dividend Capacity & Yield: Cash + Bonus Dividend History, Payout Consistency
 * 5. Capital & Ownership Structure: Paid-Up Capital, Promoter/Public Ratio, Free Float Cornering Risk
 *
 * Fully integrated with authoritative NEPSE Sector Benchmarks.
 */

import { getSectorBenchmark } from '../fundamentals.js';

/**
 * 1. VALUATION MULTIPLES EVALUATION
 * Compares P/E and P/BV against sector medians. Computes Graham Number.
 * Formula: Graham Number = SQRT(22.5 * EPS * BVPS)
 */
export function evaluateValuationMultiples({
  symbol = '',
  sector = '',
  ltp = 0,
  eps = null,
  bookValue = null,
  pe = null,
  pbv = null
} = {}) {
  const bench = getSectorBenchmark(sector);
  const currentPrice = Number(ltp || 0);
  const currentEps = eps !== null && eps !== undefined && !isNaN(eps) ? Number(eps) : null;
  const currentBv = bookValue !== null && bookValue !== undefined && !isNaN(bookValue) ? Number(bookValue) : null;

  // Derived multiples if not pre-computed
  const calcPe = currentEps !== null && currentEps > 0 ? Number((currentPrice / currentEps).toFixed(2)) : (pe ? Number(pe) : null);
  const calcPbv = currentBv !== null && currentBv > 0 ? Number((currentPrice / currentBv).toFixed(2)) : (pbv ? Number(pbv) : null);

  const grahamNumber = (currentEps !== null && currentEps > 0 && currentBv !== null && currentBv > 0)
    ? Number(Math.sqrt(22.5 * currentEps * currentBv).toFixed(2))
    : null;

  const grahamDiscountPct = (grahamNumber && currentPrice > 0)
    ? Number((((grahamNumber - currentPrice) / grahamNumber) * 100).toFixed(2))
    : null;

  const peRatioVsMedian = bench.medianPE > 0 && calcPe > 0
    ? Number((calcPe / bench.medianPE).toFixed(2))
    : null;

  const pbvRatioVsMedian = bench.medianPBV > 0 && calcPbv > 0
    ? Number((calcPbv / bench.medianPBV).toFixed(2))
    : null;

  let valuationStatus = 'FAIRLY_VALUED';
  const weaknesses = [];

  if (currentEps <= 0) {
    valuationStatus = 'LOSS_MAKING';
    weaknesses.push('Company has negative or zero EPS (loss-making); earnings-based valuation invalid.');
  } else if (
    (peRatioVsMedian !== null && peRatioVsMedian <= 0.75 && (pbvRatioVsMedian === null || pbvRatioVsMedian <= 1.0)) ||
    (grahamDiscountPct !== null && grahamDiscountPct >= 25) ||
    (peRatioVsMedian !== null && peRatioVsMedian <= 0.80 && pbvRatioVsMedian !== null && pbvRatioVsMedian <= 0.85)
  ) {
    valuationStatus = 'UNDERVALUED';
  } else if (peRatioVsMedian !== null && peRatioVsMedian >= 1.50 || (pbvRatioVsMedian !== null && pbvRatioVsMedian >= 2.0)) {
    valuationStatus = 'OVERVALUED';
    weaknesses.push(`Valuation premium: P/E (${calcPe}x) is >50% above sector median (${bench.medianPE}x) or P/BV is >2x.`);
  }

  return {
    pe: calcPe,
    pbv: calcPbv,
    grahamNumber,
    grahamDiscountPct,
    sectorMedianPE: bench.medianPE,
    sectorMedianPBV: bench.medianPBV,
    peRatioVsMedian,
    pbvRatioVsMedian,
    valuationStatus,
    weaknesses
  };
}

/**
 * 2. PROFITABILITY & CAPITAL EFFICIENCY
 * Evaluates Return on Equity (ROE = EPS / BVPS * 100) and Earnings Yield (EPS / Price * 100).
 */
export function evaluateProfitability({
  sector = '',
  eps = null,
  bookValue = null,
  ltp = 0,
  roe = null
} = {}) {
  const bench = getSectorBenchmark(sector);
  const currentEps = eps !== null && eps !== undefined && !isNaN(eps) ? Number(eps) : null;
  const currentBv = bookValue !== null && bookValue !== undefined && !isNaN(bookValue) ? Number(bookValue) : null;
  const currentPrice = Number(ltp || 0);

  const calcRoe = roe !== null && roe !== undefined && Number(roe) > 0
    ? Number(roe)
    : (currentEps !== null && currentEps > 0 && currentBv !== null && currentBv > 0
        ? Number(((currentEps / currentBv) * 100).toFixed(2))
        : null);

  const earningsYieldPct = currentPrice > 0 && currentEps !== null && currentEps > 0
    ? Number(((currentEps / currentPrice) * 100).toFixed(2))
    : null;

  let roeRating = 'MODERATE';
  const weaknesses = [];

  if (calcRoe !== null && calcRoe >= bench.medianROE * 1.25) {
    roeRating = 'HIGH_EFFICIENCY';
  } else if (calcRoe !== null && calcRoe < 6.0) {
    roeRating = 'POOR_EFFICIENCY';
    weaknesses.push(`Subpar ROE (${calcRoe}%); capital efficiency is below risk-free treasury rate.`);
  } else if (calcRoe === null) {
    roeRating = 'UNAVAILABLE';
    weaknesses.push('ROE unavailable due to missing Book Value or EPS.');
  }

  return {
    roe: calcRoe,
    earningsYieldPct,
    sectorMedianROE: bench.medianROE,
    roeRating,
    isQualityCompounder: roeRating === 'HIGH_EFFICIENCY',
    weaknesses
  };
}

/**
 * 3. BFI REGULATORY ASSET QUALITY GATE
 * Evaluates Non-Performing Loans (NPL) and Capital Adequacy Ratio (CAR) against NRB directives.
 * Hard Gate:
 *   NPL > 5.0% -> Severe Asset Quality Warning
 *   CAR < 11.0% (Commercial Banks) -> Regulatory Capital Breach Warning
 */
export function evaluateBfiAssetQuality({
  sector = '',
  npl = null,
  car = null
} = {}) {
  const bench = getSectorBenchmark(sector);
  const isBfi = ['commercial_bank', 'development_bank', 'finance', 'microfinance'].includes(bench.sectorKey);

  if (!isBfi) {
    return {
      isBfi: false,
      npl: null,
      car: null,
      isAssetQualitySafe: true,
      verdict: 'NOT_APPLICABLE',
      weaknesses: []
    };
  }

  const numNpl = npl !== null && npl !== undefined ? Number(npl) : null;
  const numCar = car !== null && car !== undefined ? Number(car) : null;

  const weaknesses = [];
  let isAssetQualitySafe = true;
  let verdict = 'SAFE';

  if (numNpl !== null) {
    if (numNpl > (bench.maxNPL || 5.0)) {
      isAssetQualitySafe = false;
      verdict = 'FAIL_ASSET_QUALITY';
      weaknesses.push(`🚨 CRITICAL: NPL (${numNpl.toFixed(2)}%) exceeds NRB 5% ceiling. High provisioning hit and dividend freeze risk.`);
    } else if (numNpl >= 3.5) {
      verdict = 'WARNING_ELEVATED_NPL';
      weaknesses.push(`Elevated NPL (${numNpl.toFixed(2)}%): Asset quality stress may dampen profitability.`);
    } else {
      verdict = 'PRUDENT_ASSET_QUALITY';
    }
  } else {
    weaknesses.push('UNVERIFIED: NPL data not reported in public filings for this BFI.');
  }

  if (numCar !== null && bench.minCAR) {
    if (numCar < bench.minCAR) {
      isAssetQualitySafe = false;
      verdict = 'FAIL_REGULATORY_CAPITAL';
      weaknesses.push(`🚨 REGULATORY BREACH: CAR (${numCar.toFixed(1)}%) is below NRB minimum ${bench.minCAR}%. Risk of prompt corrective action or forced rights issue.`);
    }
  }

  return {
    isBfi: true,
    npl: numNpl,
    car: numCar,
    nrbMaxNpl: bench.maxNPL || 5.0,
    nrbMinCar: bench.minCAR || null,
    isAssetQualitySafe,
    verdict,
    weaknesses
  };
}

/**
 * 4. DIVIDEND CAPACITY & TRACK RECORD
 * Evaluates cash + bonus dividend yield, consistency across fiscal years.
 */
export function evaluateDividendTrackRecord({
  ltp = 0,
  dividendHistory = [],
  latestBonus = 0,
  latestCash = 0
} = {}) {
  const currentPrice = Number(ltp || 0);
  const bonus = Number(latestBonus || 0);
  const cash = Number(latestCash || 0);
  const totalLatestPct = bonus + cash;

  // Approximate cash dividend yield on face value Rs. 100
  // Cash Dividend Yield = (Cash% * Rs. 100) / LTP
  const cashYieldPct = currentPrice > 0 ? Number(((cash * 100) / currentPrice).toFixed(2)) : 0;

  const history = Array.isArray(dividendHistory) ? dividendHistory : [];
  const yearsWithDividends = history.filter(d => Number(d.bonus || d.cash || d.total || 0) > 0).length;

  let dividendRating = 'MODEST_OR_NONE';
  const weaknesses = [];

  if (yearsWithDividends >= 3 && totalLatestPct >= 10) {
    dividendRating = 'CONSISTENT_PAYER';
  } else if (totalLatestPct >= 15) {
    dividendRating = 'HIGH_DIVIDEND';
  } else if (totalLatestPct === 0 && yearsWithDividends === 0) {
    dividendRating = 'NO_DIVIDENDS';
    weaknesses.push('No dividend track record: Company has not distributed dividends in recent reported fiscal years.');
  }

  return {
    latestBonusPct: bonus,
    latestCashPct: cash,
    totalLatestPayoutPct: totalLatestPct,
    cashYieldPct,
    yearsWithDividends,
    dividendRating,
    weaknesses
  };
}

/**
 * 5. CAPITAL & OWNERSHIP STRUCTURE (Promoter/Public Ratio & Free Float Safety)
 * Evaluates promoter lock-in risks, free float liquidity, and cornering risk.
 */
export function evaluateOwnershipStructure({
  listedShares = 0,
  promoterPercentage = 0,
  publicPercentage = 0,
  paidUpCapital = 0
} = {}) {
  const totalShares = Number(listedShares || 0);
  const promPct = Number(promoterPercentage || (publicPercentage > 0 ? 100 - publicPercentage : 70));
  const pubPct = Number(publicPercentage || (promPct > 0 ? 100 - promPct : 30));

  const freeFloatShares = totalShares > 0 ? Math.round(totalShares * (pubPct / 100)) : 0;
  const isLowFloat = freeFloatShares > 0 && freeFloatShares < 1500000; // < 1.5M shares
  const isCorneringRisk = pubPct < 20 || isLowFloat;

  const weaknesses = [];
  if (isCorneringRisk) {
    weaknesses.push(`Low public float (${pubPct.toFixed(1)}% / ${freeFloatShares.toLocaleString()} shares): Susceptible to operator cornering and illiquid circuit traps.`);
  }

  return {
    promoterPercentage: promPct,
    publicPercentage: pubPct,
    freeFloatShares,
    isLowFloat,
    isCorneringRisk,
    paidUpCapital: Number(paidUpCapital || 0),
    weaknesses
  };
}

/**
 * 6. COMPOSITE FUNDAMENTAL CONFLUENCE EVALUATOR
 * Synthesizes all fundamental sub-components into a transparent score (0 to 100).
 */
export function evaluateFundamentalConfluence({
  symbol = '',
  sector = '',
  ltp = 0,
  eps = 0,
  bookValue = 0,
  pe = 0,
  pbv = 0,
  roe = 0,
  npl = null,
  car = null,
  dividendHistory = [],
  latestBonus = 0,
  latestCash = 0,
  listedShares = 0,
  promoterPercentage = 0,
  publicPercentage = 0,
  paidUpCapital = 0
} = {}) {
  // If verified quarterly fundamental metrics are completely missing, return NULL (no silent defaults)
  if (eps === null || eps === undefined || isNaN(eps) || (Number(eps) === 0 && Number(bookValue || 0) === 0)) {
    return {
      compositeScore: null,
      status: 'FUNDAMENTALS_UNAVAILABLE',
      message: 'FUNDAMENTALS UNAVAILABLE',
      signals: {},
      weaknesses: ['FUNDAMENTALS UNAVAILABLE: Verified quarterly EPS and Book Value unavailable. Pillar omitted.']
    };
  }

  const valuation = evaluateValuationMultiples({ symbol, sector, ltp, eps, bookValue, pe, pbv });
  const profitability = evaluateProfitability({ sector, eps, bookValue, ltp, roe });
  const bfiSafety = evaluateBfiAssetQuality({ sector, npl, car });
  const dividends = evaluateDividendTrackRecord({ ltp, dividendHistory, latestBonus, latestCash });
  const ownership = evaluateOwnershipStructure({ listedShares, promoterPercentage, publicPercentage, paidUpCapital });

  // 100-Point Confluence Model:
  // 1. Valuation vs Peers (25 pts)
  let valScore = 0;
  if (valuation.valuationStatus === 'UNDERVALUED') valScore = 25;
  else if (valuation.valuationStatus === 'FAIRLY_VALUED') valScore = 15;
  else if (valuation.valuationStatus === 'OVERVALUED') valScore = 5;
  else if (valuation.valuationStatus === 'LOSS_MAKING') valScore = -20;

  // 2. Profitability / ROE (25 pts)
  let profScore = 0;
  if (profitability.isQualityCompounder) profScore = 25;
  else if (profitability.roeRating === 'MODERATE') profScore = 15;
  else profScore = 5;

  // 3. Asset Quality / Solvency (20 pts)
  let safetyScore = 20;
  if (bfiSafety.isBfi) {
    if (!bfiSafety.isAssetQualitySafe) safetyScore = -25; // Severe penalty for NPL > 5% or CAR breach
    else if (bfiSafety.verdict === 'PRUDENT_ASSET_QUALITY') safetyScore = 20;
    else safetyScore = 10;
  }

  // 4. Dividend Capacity (15 pts)
  let divScore = 0;
  if (dividends.dividendRating === 'CONSISTENT_PAYER' || dividends.dividendRating === 'HIGH_DIVIDEND') divScore = 15;
  else if (dividends.totalLatestPayoutPct > 0) divScore = 8;

  // 5. Ownership & Float Safety (15 pts)
  let ownScore = 15;
  if (ownership.isCorneringRisk) ownScore = 5; // Penalize cornering / extreme low float

  const rawTotal = 40 + valScore + profScore + safetyScore + divScore + ownScore;
  const compositeScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

  let verdict = 'NEUTRAL';
  if (!bfiSafety.isAssetQualitySafe || valuation.valuationStatus === 'LOSS_MAKING') {
    verdict = 'AVOID_FUNDAMENTAL_TRAP';
  } else if (compositeScore >= 75) {
    verdict = 'STRONG_FUNDAMENTAL';
  } else if (compositeScore >= 55) {
    verdict = 'SOUND_FUNDAMENTAL';
  } else if (compositeScore <= 35) {
    verdict = 'WEAK_FUNDAMENTAL';
  }

  const allWeaknesses = [
    ...valuation.weaknesses,
    ...profitability.weaknesses,
    ...bfiSafety.weaknesses,
    ...dividends.weaknesses,
    ...ownership.weaknesses
  ];

  return {
    symbol: String(symbol || '').toUpperCase().trim(),
    sector,
    compositeScore,
    verdict,
    signals: {
      valuation,
      profitability,
      bfiSafety,
      dividends,
      ownership
    },
    weaknesses: Array.from(new Set(allWeaknesses))
  };
}
