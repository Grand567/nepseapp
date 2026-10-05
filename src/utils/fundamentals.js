/**
 * fundamentals.js — Batch D: Sector-Aware Fundamental Analysis
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   D1. NEPSE_SECTOR_BENCHMARKS — authoritative sector PE/PBV/ROE medians,
 *       calibrated to NEPSE FY 2080/81 published data.
 *   D2. getSectorBenchmark(sector) — returns the right benchmark object.
 *   D3. evaluateValuation(stock) — compares stock to sector median, flags
 *       overvalued / undervalued / fairly valued with confidence band.
 *   D4. calculateFundamentalSummary(stock, history, corporateActions) —
 *       full fundamental scorecard with all metrics, ratings, and explanations.
 *   D5. computeSectorComparison(stocks, targetSymbol) — ranks a stock within
 *       its sector peers for each fundamental metric.
 *
 * IMPORTANT: All PE/PBV medians are ESTIMATES based on publicly available
 * NEPSE annual data. They must be verified against current NEPSE publications
 * before use in live trading decisions. They will drift as markets change.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── D1: NEPSE Sector Benchmarks ───────────────────────────────────────────────
// Source: NEPSE Annual Report 2080/81, SEBON annual bulletin, NRB publications.
// Ranges represent approximate interquartile range of listed companies.
// NOTE: These are estimates. Always verify with current NEPSE data.
export const NEPSE_SECTOR_BENCHMARKS = {
  'Commercial Banks': {
    sectorKey: 'commercial_bank',
    keywords: ['commercial bank', 'commercial'],
    medianPE: 13,    // Range: 10–18
    medianPBV: 1.2,  // Range: 0.9–1.6
    medianROE: 14,   // Range: 10–18%
    medianEPS: 38,   // Range: 25–60
    minCAR: 11,      // NRB requirement
    maxNPL: 5,       // NRB tolerance
    medianNPL: 2.5,
    minDividendYield: 2.5,
    description: 'Commercial Banks (NRB regulated)',
    notes: 'P/BV < 1.0 may indicate undervaluation if NPL < 3% and CAR > 12%.',
  },
  'Development Banks': {
    sectorKey: 'development_bank',
    keywords: ['development bank'],
    medianPE: 16,
    medianPBV: 1.5,
    medianROE: 12,
    medianEPS: 22,
    minCAR: 10,
    maxNPL: 5,
    medianNPL: 3.5,
    description: 'Development Banks (NRB regulated)',
  },
  'Microfinance': {
    sectorKey: 'microfinance',
    keywords: ['microfinance', 'micro finance', 'laghubitta'],
    medianPE: 22,
    medianPBV: 2.8,
    medianROE: 18,
    medianEPS: 45,
    minCAR: 8,
    maxNPL: 5,
    medianNPL: 3.0,
    description: 'Microfinance Institutions (NRB regulated)',
    notes: 'Higher PE/PBV justified by superior ROE; watch for NPL deterioration.',
  },
  'Finance Companies': {
    sectorKey: 'finance',
    keywords: ['finance company', 'finance'],
    medianPE: 17,
    medianPBV: 1.6,
    medianROE: 11,
    medianEPS: 18,
    minCAR: 10,
    maxNPL: 5,
    medianNPL: 4.0,
    description: 'Finance Companies (NRB regulated)',
  },

  'Hydropower': {
    sectorKey: 'hydropower',
    keywords: ['hydro', 'power', 'energy', 'electricity', 'bidyut'],
    medianPE: 28,
    medianPBV: 2.5,
    medianROE: 9,
    medianEPS: 12,
    description: 'Hydropower & Energy',
    notes: 'Seasonality: generation peaks Jun–Sep, dips Dec–Feb. Factor in monsoon.',
  },
  'Life Insurance': {
    sectorKey: 'life_insurance',
    keywords: ['life insurance', 'jeevan bima'],
    medianPE: 30,
    medianPBV: 3.0,
    medianROE: 12,
    medianEPS: 25,
    description: 'Life Insurance Companies',
  },
  'Non-Life Insurance': {
    sectorKey: 'nonlife_insurance',
    keywords: ['non-life', 'nonlife', 'insurance', 'bima'],
    medianPE: 22,
    medianPBV: 2.2,
    medianROE: 14,
    medianEPS: 30,
    description: 'Non-Life Insurance Companies',
  },
  'Hotels & Tourism': {
    sectorKey: 'hotel',
    keywords: ['hotel', 'resort', 'tourism', 'travel'],
    medianPE: 32,
    medianPBV: 3.0,
    medianROE: 7,
    medianEPS: 10,
    description: 'Hotels & Tourism',
  },
  'Manufacturing': {
    sectorKey: 'manufacturing',
    keywords: ['manufacturing', 'production', 'cement', 'sugar', 'brew', 'dairy'],
    medianPE: 22,
    medianPBV: 2.0,
    medianROE: 10,
    medianEPS: 15,
    description: 'Manufacturing & Processing',
  },
  'Trading': {
    sectorKey: 'trading',
    keywords: ['trading', 'trade', 'merchandise'],
    medianPE: 18,
    medianPBV: 1.8,
    medianROE: 12,
    medianEPS: 18,
    description: 'Trading Companies',
  },
  'Others': {
    sectorKey: 'others',
    keywords: [],
    medianPE: 20,
    medianPBV: 2.0,
    medianROE: 10,
    medianEPS: 20,
    description: 'Other / Unclassified',
  },
};

import { getLiveMedians } from './liveSectorMedians.js';

function resolveBenchmark(sector) {
  let fallback = NEPSE_SECTOR_BENCHMARKS['Others'];
  if (sector) {
    const s = String(sector).toLowerCase();
    // "Non Life Insurance" contains the substring "life insurance" — resolve it first.
    if (/non[\s-]?life/.test(s)) return NEPSE_SECTOR_BENCHMARKS['Non-Life Insurance'];
    for (const [, bench] of Object.entries(NEPSE_SECTOR_BENCHMARKS)) {
      if (bench.keywords && bench.keywords.some(k => s.includes(k))) {
        fallback = bench;
        break;
      }
    }
  }
  return fallback;
}

/** Returns the benchmark sectorKey for a sector string (used to bucket live medians). */
export function classifySector(sector) {
  return resolveBenchmark(sector).sectorKey;
}

/**
 * Returns the sector benchmark object that best matches a stock's sector string.
 * Live medians (computed from today's market) override the static estimates per metric;
 * static values remain as the fallback when live data is missing.
 * @param {string} sector
 * @returns {Object} benchmark from NEPSE_SECTOR_BENCHMARKS merged with live data
 */
export function getSectorBenchmark(sector) {
  const fallback = resolveBenchmark(sector);
  const live = getLiveMedians(fallback.sectorKey);

  return {
    ...fallback,
    medianPE: live?.medianPE ?? fallback.medianPE,
    medianPBV: live?.medianPBV ?? fallback.medianPBV,
    medianROE: live?.medianROE ?? fallback.medianROE,
    medianEPS: live?.medianEPS ?? fallback.medianEPS,
    isLive: live != null,
    liveComputedAt: live?.computedAt || null,
    liveSampleSize: live?.sampleSize || null,
  };
}

// ── D3: Valuation Evaluation ──────────────────────────────────────────────────
/**
 * Compares a stock's PE, PBV and EPS against its sector median.
 * Returns a structured valuation verdict with confidence and explanation.
 *
 * @param {Object} stock - Must have { pe, pbv, eps, roe, sector }
 * @returns {{ verdict, peStatus, pbvStatus, score, confidence, explanation, benchmark }}
 */
export function evaluateValuation(stock) {
  const bench = getSectorBenchmark(stock?.sector || '');
  const pe = Number(stock?.pe || 0);
  const pbv = Number(stock?.pbv || stock?.pb || 0);
  const eps = Number(stock?.eps || 0);
  const roe = Number(stock?.roe || 0);
  const npl = Number(stock?.npl || null);
  const car = Number(stock?.car || null);
  const ltp = Number(stock?.ltp || 0);

  const reasons = [];
  let score = 0; // positive = undervalued, negative = overvalued
  let confidence = 'LOW'; // LOW | MEDIUM | HIGH

  // PE evaluation
  let peStatus = 'N/A';
  if (pe > 0 && bench.medianPE > 0) {
    const peRatio = pe / bench.medianPE;
    if (peRatio <= 0.75) {
      peStatus = 'UNDERVALUED';
      score += 2;
      reasons.push(`P/E ${pe.toFixed(1)}x is >25% below sector median (${bench.medianPE}x) — potential value opportunity.`);
    } else if (peRatio <= 0.90) {
      peStatus = 'SLIGHTLY_UNDERVALUED';
      score += 1;
      reasons.push(`P/E ${pe.toFixed(1)}x slightly below sector median (${bench.medianPE}x).`);
    } else if (peRatio <= 1.10) {
      peStatus = 'FAIR';
      reasons.push(`P/E ${pe.toFixed(1)}x near sector median (${bench.medianPE}x) — fairly valued.`);
    } else if (peRatio <= 1.50) {
      peStatus = 'SLIGHTLY_OVERVALUED';
      score -= 1;
      reasons.push(`P/E ${pe.toFixed(1)}x above sector median (${bench.medianPE}x) — modest premium.`);
    } else {
      peStatus = 'OVERVALUED';
      score -= 2;
      reasons.push(`P/E ${pe.toFixed(1)}x is >50% above sector median (${bench.medianPE}x) — expensive.`);
    }
    confidence = 'MEDIUM';
  } else {
    reasons.push('P/E not available — cannot evaluate earnings-based valuation.');
  }

  // PBV evaluation
  let pbvStatus = 'N/A';
  if (pbv > 0 && bench.medianPBV > 0) {
    const pbvRatio = pbv / bench.medianPBV;
    // Special case: banks with PBV < 1.0 may be undervalued if asset quality is sound
    if (bench.sectorKey === 'commercial_bank' && pbv < 1.0 && (!npl || npl <= 3.0)) {
      pbvStatus = 'UNDERVALUED';
      score += 2;
      reasons.push(`P/BV ${pbv.toFixed(2)}x < 1.0 on a bank with clean assets — classic Graham value.`);
    } else if (pbvRatio <= 0.80) {
      pbvStatus = 'UNDERVALUED';
      score += 2;
      reasons.push(`P/BV ${pbv.toFixed(2)}x is 20%+ below sector median (${bench.medianPBV}x).`);
    } else if (pbvRatio <= 1.15) {
      pbvStatus = 'FAIR';
      reasons.push(`P/BV ${pbv.toFixed(2)}x near sector median (${bench.medianPBV}x).`);
    } else if (pbvRatio <= 2.0) {
      pbvStatus = 'SLIGHTLY_OVERVALUED';
      score -= 1;
      reasons.push(`P/BV ${pbv.toFixed(2)}x above sector median (${bench.medianPBV}x).`);
    } else {
      pbvStatus = 'OVERVALUED';
      score -= 2;
      reasons.push(`P/BV ${pbv.toFixed(2)}x is >2x sector median — significant premium to book.`);
    }
    if (confidence !== 'HIGH') confidence = 'MEDIUM';
  }

  // ROE check
  if (roe > 0 && bench.medianROE > 0) {
    if (roe >= bench.medianROE * 1.2) {
      score += 1;
      reasons.push(`ROE ${roe.toFixed(1)}% above sector median (${bench.medianROE}%) — quality compounder.`);
      confidence = 'HIGH';
    } else if (roe < bench.medianROE * 0.7) {
      score -= 1;
      reasons.push(`ROE ${roe.toFixed(1)}% below sector median (${bench.medianROE}%) — subpar returns.`);
    }
  }

  // EPS adequacy
  if (eps <= 0) {
    score -= 2;
    reasons.push('Negative or zero EPS — company is loss-making. Avoid for fundamental investing.');
    confidence = 'LOW';
  } else if (eps < bench.medianEPS * 0.5) {
    score -= 1;
    reasons.push(`EPS Rs.${eps.toFixed(2)} well below sector median (Rs.${bench.medianEPS}) — weak earnings.`);
  }

  // Banking-specific NRB regulatory flags
  if (bench.minCAR && car !== null && car > 0 && car < bench.minCAR) {
    score -= 3;
    reasons.push(`⚠️ CAR ${car.toFixed(1)}% below NRB minimum ${bench.minCAR}% — regulatory risk.`);
    confidence = 'HIGH'; // We are very confident this is negative
  }
  if (bench.maxNPL && npl !== null && npl > 0 && npl > bench.maxNPL) {
    score -= 3;
    reasons.push(`⚠️ NPL ${npl.toFixed(2)}% exceeds NRB tolerance (${bench.maxNPL}%) — asset quality concern.`);
  }

  // Final verdict
  let verdict;
  if (score >= 3) verdict = 'UNDERVALUED';
  else if (score >= 1) verdict = 'SLIGHTLY_UNDERVALUED';
  else if (score === 0) verdict = 'FAIR';
  else if (score >= -2) verdict = 'SLIGHTLY_OVERVALUED';
  else verdict = 'OVERVALUED';

  return {
    verdict,
    peStatus,
    pbvStatus,
    score,
    confidence,
    benchmark: {
      sectorName: bench.description,
      medianPE: bench.medianPE,
      medianPBV: bench.medianPBV,
      medianROE: bench.medianROE,
      medianEPS: bench.medianEPS,
    },
    explanation: reasons,
    notes: bench.notes || null,
    disclaimer: 'Sector medians are estimates based on FY2080/81 data. Verify with current NEPSE publications.',
  };
}

// ── D4: Full Fundamental Scorecard ────────────────────────────────────────────
/**
 * Generates a complete fundamental analysis scorecard for a stock.
 *
 * @param {Object} stock - Enriched stock object from live data
 * @returns {Object} Full scorecard with score, rating, metrics, and explanations
 */
export function calculateFundamentalSummary(stock) {
  if (!stock || !stock.symbol) return null;

  const ltp = Number(stock.ltp || 0);
  const eps = Number(stock.eps || 0);
  const bvps = Number(stock.bvps || stock.bookValue || 0);
  const pe = eps > 0 ? +(ltp / eps).toFixed(2) : Number(stock.pe || 0);
  const pbv = bvps > 0 ? +(ltp / bvps).toFixed(2) : Number(stock.pbv || stock.pb || 0);
  const roe = eps > 0 && bvps > 0 ? +(eps / bvps * 100).toFixed(2) : Number(stock.roe || 0);
  const divYield = Number(stock.dividendYield || 0);
  const npl = Number(stock.npl || null);
  const car = Number(stock.car || null);
  const sharesOut = Number(stock.sharesOut || 0);
  const marketCap = sharesOut > 0 ? sharesOut * 1e6 * ltp : Number(stock.marketCap || 0);
  const paidUpCapital = Number(stock.paidUpCapital || (sharesOut > 0 ? sharesOut * 1e8 : null)); // par Rs.100

  const bench = getSectorBenchmark(stock.sector || '');
  const valuation = evaluateValuation({ ...stock, pe, pbv, roe });

  // Composite fundamental score [0, 100]
  let fscore = 50;
  const fReasons = [];

  // EPS quality
  if (eps > bench.medianEPS * 1.2) { fscore += 12; fReasons.push(`Strong EPS Rs.${eps.toFixed(2)}`); }
  else if (eps > 0 && eps >= bench.medianEPS * 0.8) { fscore += 6; fReasons.push(`Average EPS Rs.${eps.toFixed(2)}`); }
  else if (eps <= 0) { fscore -= 20; fReasons.push('Loss-making — EPS negative'); }
  else { fscore -= 5; fReasons.push(`Weak EPS Rs.${eps.toFixed(2)}`); }

  // PE vs sector
  if (pe > 0) {
    if (pe <= bench.medianPE * 0.75) { fscore += 12; }
    else if (pe <= bench.medianPE * 1.10) { fscore += 6; }
    else if (pe > bench.medianPE * 1.75) { fscore -= 12; fReasons.push('Expensive vs. peers'); }
  }

  // PBV vs sector
  if (pbv > 0) {
    if (bench.sectorKey === 'commercial_bank' && pbv < 1.0 && (!npl || npl <= 3)) { fscore += 10; fReasons.push('Graham value zone — bank PBV < 1'); }
    else if (pbv <= bench.medianPBV * 0.80) { fscore += 8; }
    else if (pbv > bench.medianPBV * 2.0) { fscore -= 8; }
  }

  // ROE quality
  if (roe >= bench.medianROE * 1.2) { fscore += 10; fReasons.push(`High ROE ${roe.toFixed(1)}%`); }
  else if (roe >= bench.medianROE * 0.8) { fscore += 5; }
  else if (roe < 5) { fscore -= 8; fReasons.push('Low ROE — poor capital efficiency'); }

  // Dividend yield
  if (divYield >= 4.0) { fscore += 8; fReasons.push(`Attractive yield ${divYield.toFixed(1)}%`); }
  else if (divYield >= 2.0) { fscore += 4; }

  // Bank-specific
  if (npl !== null && npl > 0) {
    if (npl <= 2.0) { fscore += 6; fReasons.push('Excellent NPL ratio'); }
    else if (npl > 5.0) { fscore -= 15; fReasons.push(`High NPL ${npl.toFixed(2)}% — credit risk`); }
  }
  if (car !== null && car > 0 && bench.minCAR) {
    if (car >= bench.minCAR + 2) { fscore += 5; fReasons.push('Well-capitalised (CAR strong)'); }
    else if (car < bench.minCAR) { fscore -= 15; fReasons.push('Under-capitalised — regulatory risk'); }
  }

  fscore = Math.max(0, Math.min(100, fscore));

  let fRating;
  if (fscore >= 75) fRating = 'Strong Buy';
  else if (fscore >= 60) fRating = 'Buy';
  else if (fscore >= 45) fRating = 'Hold';
  else if (fscore >= 30) fRating = 'Underperform';
  else fRating = 'Avoid';

  return {
    symbol: stock.symbol,
    sector: stock.sector,
    // Raw metrics
    ltp, eps, bvps, pe, pbv, roe, divYield, npl, car, marketCap, paidUpCapital,
    // Sector benchmarks
    sectorMedianPE: bench.medianPE,
    sectorMedianPBV: bench.medianPBV,
    sectorMedianROE: bench.medianROE,
    sectorMedianEPS: bench.medianEPS,
    sectorName: bench.description,
    // Valuation
    valuation,
    // Composite score
    fundamentalScore: fscore,
    fundamentalRating: fRating,
    fundamentalReasons: fReasons,
    reportingPeriod: formatDataAgeLabel(stock),
    fiscalYear: stock.fiscalYear || null,
    quarter: stock.quarter || null,
    isHistoricFilings: true,
    // Disclaimer — always present
    disclaimer: '⚠️ Fundamental analysis uses estimated sector medians (FY2080/81). ' +
      'Verify all figures with company financial statements and current NEPSE publications. ' +
      'Not financial advice.',
  };
}

/** Formats a human-readable filing/reporting period label for a scrip */
export function formatDataAgeLabel(stock) {
  if (!stock) return 'Historic Audited Filing';
  const fy = stock.fiscalYear || stock.fy || stock.fundamentals?.fiscalYear || null;
  const q = stock.quarter || stock.fundamentals?.quarter || null;
  if (fy && q) return `${q} ${fy}`;
  if (fy) return `FY ${fy} (Annual)`;
  return 'Historic Audited Filing';
}

// ── D5: Sector Peer Comparison ────────────────────────────────────────────────
/**
 * Ranks a target stock among all stocks in its sector for each key metric.
 *
 * @param {Array}  allStocks   - Full list of enriched stocks
 * @param {string} targetSymbol
 * @returns {Object | null} Peer ranks and percentiles for PE, PBV, ROE, EPS, yield
 */
export function computeSectorComparison(allStocks, targetSymbol) {
  if (!allStocks || !targetSymbol) return null;

  const target = allStocks.find(s => s.symbol === targetSymbol);
  if (!target) return null;

  const sector = target.sector || '';
  const bench = getSectorBenchmark(sector);

  // Find sector peers (same sector benchmark key, must have EPS data)
  const peers = allStocks.filter(s =>
    s.symbol !== targetSymbol &&
    getSectorBenchmark(s.sector || '').sectorKey === bench.sectorKey &&
    Number(s.eps || 0) > 0
  );

  if (peers.length < 3) {
    return {
      symbol: targetSymbol,
      sectorName: bench.description,
      peerCount: peers.length,
      message: `Only ${peers.length} peers with fundamentals data — comparison unreliable.`,
    };
  }

  const rankMetric = (val, metric, lowerIsBetter = false) => {
    if (!val || isNaN(val)) return { rank: null, percentile: null, peerCount: peers.length };
    const peerVals = peers.map(p => Number(p[metric] || 0)).filter(v => v > 0);
    const allVals = [...peerVals, val];
    const sorted = [...allVals].sort((a, b) => lowerIsBetter ? a - b : b - a);
    const rank = sorted.indexOf(val) + 1;
    const percentile = Math.round((1 - rank / allVals.length) * 100);
    return { rank, totalPeers: allVals.length, percentile, best: sorted[0], worst: sorted[sorted.length - 1] };
  };

  return {
    symbol: targetSymbol,
    sectorName: bench.description,
    peerCount: peers.length,
    pe:  rankMetric(Number(target.pe  || 0), 'pe',  true),   // lower PE = better rank
    pbv: rankMetric(Number(target.pbv || target.pb || 0), 'pbv', true),
    eps: rankMetric(Number(target.eps || 0), 'eps', false),   // higher EPS = better
    roe: rankMetric(Number(target.roe || 0), 'roe', false),
    dividendYield: rankMetric(Number(target.dividendYield || 0), 'dividendYield', false),
    peers: peers.slice(0, 10).map(p => ({  // top 10 peers only for UI
      symbol: p.symbol,
      name: p.companyName || p.name,
      pe: Number(p.pe || 0),
      pbv: Number(p.pbv || p.pb || 0),
      eps: Number(p.eps || 0),
      roe: Number(p.roe || 0),
      dividendYield: Number(p.dividendYield || 0),
    })),
  };
}
