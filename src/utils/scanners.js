// src/utils/scanners.js
// False Breakout Scanners & Verified Prime Pick Selector

import { generateEntryExitPlan } from './setupAnalyzer.js';

/**
 * Evaluates sector fundamentals and lock-in supply cliffs (commercial banks, microfinance, hydro, insurance, lock-in expiry).
 */
export function evaluateSectorFundamentalAndLockinTraps({
  symbol = '',
  sector = '',
  fundamentals = {},
  daysToLockInExpiry = null,
  lockinType = 'promoter' // 'promoter' | 'mutual_fund'
}) {
  const traps = [];
  const sec = String(sector || '').toLowerCase();
  const f = fundamentals || {};

  // 1. Promoter & Mutual Fund Lock-In Expiry Guard (90 to 180 Days)
  if (daysToLockInExpiry !== null && daysToLockInExpiry !== undefined && daysToLockInExpiry !== '') {
    const days = Number(daysToLockInExpiry);
    if (Number.isFinite(days) && days >= 90 && days <= 180) {
      traps.push({
        code: 'VETO_LOCKIN_EXPIRY_CLIFF',
        reason: `Lock-in Supply Cliff: ${lockinType === 'mutual_fund' ? '6-month Mutual Fund' : '3-year Promoter'} lock-in expires in ${days} days (Blackout: 90-180 days to prevent pre-unlock institutional front-running)`
      });
    }
  }

  // 2. Commercial & Development Banks:
  if (sec.includes('bank')) {
    const npl = Number(f.npl ?? f.nonPerformingLoan ?? 0);
    const distEps = Number(f.distributableEps ?? f.distributableProfit ?? 16);
    if (npl > 4.5) {
      traps.push({
        code: 'VETO_BANK_HIGH_NPL',
        reason: `Asset Quality Stress: Bank NPL is ${npl.toFixed(2)}% (Max regulatory threshold: 4.5%)`
      });
    }
    if (distEps < 0) {
      traps.push({
        code: 'VETO_BANK_NEGATIVE_DISTRIBUTABLE',
        reason: `Capital Impairment: Bank distributable EPS is negative (Rs. ${distEps.toFixed(2)})`
      });
    }
  }

  // 3. Microfinance (Laghubitta):
  if (sec.includes('microfinance')) {
    const npl = Number(f.npl ?? 0);
    const epsGrowth = Number(f.epsYoYGrowth ?? f.epsGrowth ?? 26);
    if (npl > 5.0) {
      traps.push({
        code: 'VETO_MICROFINANCE_ASSET_QUALITY',
        reason: `Microfinance NPL Stress: NPL is ${npl.toFixed(2)}% (> 5.0% NRB supervisory watchlist)`
      });
    }
    if (epsGrowth <= 0) {
      traps.push({
        code: 'VETO_MICROFINANCE_DECLINING_GROWTH',
        reason: `Microfinance Contraction: EPS YoY growth is ${epsGrowth.toFixed(1)}% (<= 0%)`
      });
    }
  }

  // 4. Hydropower:
  if (sec.includes('hydro')) {
    const codCompleted = f.codCompleted !== undefined ? Boolean(f.codCompleted) : true;
    const costPerMW = Number(f.costPerMW ?? f.perMwCost ?? 18);
    const bv = Number(f.bookValue ?? f.nav ?? 115);

    if (!codCompleted) {
      traps.push({
        code: 'VETO_HYDRO_COD_INCOMPLETE',
        reason: 'Hydropower Execution Risk: COD (Commercial Operation Date) not completed or under prolonged delay'
      });
    }
    if (costPerMW > 22.0) {
      traps.push({
        code: 'VETO_HYDRO_EXCESSIVE_CAPEX',
        reason: `Hydropower Capex Inflation: Cost per MW is Rs. ${costPerMW.toFixed(1)} Cr (> Rs. 22 Cr/MW ceiling)`
      });
    }
    if (bv < 100.0) {
      traps.push({
        code: 'VETO_HYDRO_SUB_PAR_BOOK_VALUE',
        reason: `Eroded Equity Base: Book Value is Rs. ${bv.toFixed(1)} (< Rs. 100 par value)`
      });
    }
  }

  // 5. Insurance (Life & Non-Life):
  if (sec.includes('insurance')) {
    const pe = Number(f.pe ?? f.peRatio ?? 22);
    const invGrowth = Number(f.investmentBookGrowthQoQ ?? f.investmentGrowth ?? 5);

    if (pe > 45.0) {
      traps.push({
        code: 'VETO_INSURANCE_OVERVALUATION',
        reason: `Insurance Multiples Euphoria: P/E ratio is ${pe.toFixed(1)}x (> 45.0x ceiling)`
      });
    }
    if (invGrowth < 0) {
      traps.push({
        code: 'VETO_INSURANCE_CONTRACTING_BOOK',
        reason: `Insurance Book Contraction: Investment portfolio shrank ${invGrowth.toFixed(1)}% QoQ`
      });
    }
  }

  const passed = traps.length === 0;
  return {
    passed,
    trapCount: traps.length,
    traps,
    detail: passed ? 'Sector fundamentals and lock-in schedule verified' : traps.map(t => t.reason).join(' | ')
  };
}

/**
 * Evaluates whether a stock is suffering from a Promoter or Mutual Fund Lock-In Supply Cliff (90–180 days)
 * or Low-Float Operator Cornering trap.
 */
export function isLockInSupplyCliffTrap(stock = {}) {
  const daysToLockIn = stock.daysToLockInExpiry ?? stock.lockInExpiryDays ?? stock.promoterLockInDays ?? null;
  const lockinType = stock.lockinType || (stock.mutualFundLockInDays != null ? 'mutual_fund' : 'promoter');

  if (daysToLockIn !== null && daysToLockIn !== undefined && daysToLockIn !== '') {
    const d = Number(daysToLockIn);
    if (Number.isFinite(d) && d >= 90 && d <= 180) {
      return {
        isTrap: true,
        reason: `Lock-in Supply Cliff: ${lockinType === 'mutual_fund' ? 'Mutual Fund' : 'Promoter'} lock-in expires in ${d} days (90–180d blackout window).`
      };
    }
  }

  const secEval = evaluateSectorFundamentalAndLockinTraps({
    symbol: stock.symbol,
    sector: stock.sector || stock.sectorName || '',
    fundamentals: stock.fundamentals || stock,
    daysToLockInExpiry: daysToLockIn,
    lockinType
  });

  if (!secEval.passed) {
    return { isTrap: true, reason: secEval.detail };
  }

  return { isTrap: false, reason: null };
}

/**
 * Scans market for True Institutional Breakouts & Wyckoff VDU Bases while rejecting False Breakouts:
 * - Rejects Upper Wick >= 40% (Bull Trap)
 * - Rejects LTP > Entry_max * 1.025 (Chase Cap breached)
 * - Rejects Promoter/MF Lock-In Supply Cliffs (90–180 days)
 * - Requires all 5 Quality Gates + Net Post-Tax R:R >= 3.0:1
 */
export function scanVerifiedAlphaSetups(stocks = [], historiesBySymbol = {}, options = {}) {
  if (!Array.isArray(stocks) || stocks.length === 0) return [];

  const evaluated = [];

  for (const stock of stocks) {
    const sym = String(stock?.symbol || '').toUpperCase().trim();
    if (!sym) continue;

    // 1. Filter out Promoter / MF Lock-In Supply Cliffs & Sector Fundamental Traps
    const lockinCheck = isLockInSupplyCliffTrap(stock);
    if (lockinCheck.isTrap) continue;

    const history = historiesBySymbol[sym] || stock.priceHistory || stock.candles || [];
    const plan = generateEntryExitPlan(stock, history, stock.dividendHistory || [], {
      ...options,
      sectorRank10D: stock.sectorRank10D ?? options.sectorRanks?.[stock.sector] ?? 99
    });

    if (!plan || !plan.supported) continue;

    const gates = plan.riskGate?.qualityGates || {};
    const isVerified = Boolean(
      gates.all5GatesPassed &&
      gates.chaseCapPassed &&
      gates.netRrr3To1Passed &&
      !plan.riskGate?.warning
    );

    evaluated.push({
      symbol: sym,
      stock,
      plan,
      setupScore: Number(plan.setupScore || 0),
      netRRR1: Number(plan.levels?.netRRR1 || plan.levels?.rrr1 || 0),
      vduRatio: Number(plan.quantMetrics?.volumeDryUp?.vduRatio ?? 1.0),
      isVerified,
      all5GatesPassed: Boolean(gates.all5GatesPassed),
      chaseCapPassed: Boolean(gates.chaseCapPassed),
      netRrr3To1Passed: Boolean(gates.netRrr3To1Passed)
    });
  }

  // Strictly prioritize verified setups passing all 5 gates + chaseCap + Net R:R >= 3:1 before any unverified setup
  evaluated.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
    if (a.all5GatesPassed !== b.all5GatesPassed) return a.all5GatesPassed ? -1 : 1;
    if (b.setupScore !== a.setupScore) return b.setupScore - a.setupScore;
    return b.netRRR1 - a.netRRR1;
  });

  return evaluated;
}

/**
 * Selects the single highest-probability stock crowned "Prime Pick of the Day" for Dashboard.jsx.
 * Guarantees that an unverified or gate-failing stock can NEVER usurp a verified 5-gate setup.
 */
export function selectPrimePickOfTheDay(stocks = [], historiesBySymbol = {}, options = {}) {
  const ranked = scanVerifiedAlphaSetups(stocks, historiesBySymbol, options);
  if (ranked.length === 0) return null;

  // Return the top verified setup; if zero stocks in the entire exchange pass verification today,
  // return null (Cash Preservation Stance) rather than crowning a flawed trade.
  const topCandidate = ranked[0];
  if (!topCandidate.isVerified) {
    return {
      symbol: null,
      status: 'CASH_PRESERVATION_NO_VERIFIED_PICK',
      reason: 'No stock passed all 5 Quality Gates, Chase Cap, Lock-In Cliff filter, and >= 3.0:1 Net R:R today.',
      runnerUp: topCandidate
    };
  }

  return {
    symbol: topCandidate.symbol,
    status: 'VERIFIED_PRIME_PICK',
    setupScore: topCandidate.setupScore,
    netRRR1: topCandidate.netRRR1,
    vduRatio: topCandidate.vduRatio,
    stock: topCandidate.stock,
    plan: topCandidate.plan
  };
}
