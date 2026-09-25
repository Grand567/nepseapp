// src/components/ShortTermProfitPlan.jsx
// Institutional 1–2 Week Short-Term Investment Profit Plan Workstation
// Helps traders identify high-probability swing opportunities, compute exact position sizes,
// calculate realistic take-home profits (including NEPSE broker commission, SEBON fees, and CGT),
// apply Mathematical Expectancy, Kelly Criterion, T+2 Circuit Guard, and 20-Trade Compound Simulations.

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Crosshair,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Zap,
  Flame,
  Scale,
  Calculator as CalcIcon,
  Calendar,
  Clock,
  Coins,
  CheckCircle2,
  ChevronRight,
  Info,
  Bookmark,
  Trash2,
  ExternalLink,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  BarChart3,
  SlidersHorizontal,
  DollarSign,
  Activity,
  Layers,
  PieChart,
  Percent
} from 'lucide-react';
import { calculateBuyDetails, calculateSellDetails, formatSouthAsian } from '../utils/calculations';
import {
  calculateMultiHorizonTargets,
  calculateATR,
  calculateExpectancy,
  calculateKellyCriterion,
  calculateT2CircuitTrapGuard,
  calculateOrderBookImbalanceRatio,
  calculateRelativeStrength,
  simulateCompoundExpectancy,
  resolveDynamicStockRSI,
  resolveDynamicStockEMAs
} from '../utils/quantEngine';
import { getCachedRealPriceHistory, fetchPriceHistory, getCachedStockFundamentals } from '../utils/liveData';
import { calculateEMA } from '../utils/indicators';
import { toAscendingCandles } from '../utils/setupAnalyzer';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse';
import { useNavigation } from '../context/NavigationContext';
import { getDetailedMarketStatus } from '../utils/nepseCalendar';

/**
 * Checks if a NEPSE scrip is a mutual fund, debenture, bond, promoter share, or penny security.
 * Short-Term Momentum Swing Trading strictly requires active, liquid common equities.
 */
export function isMutualFundOrDebenture(sym = '', sector = '', name = '', ltp = 100) {
  const s = String(sym || '').toUpperCase().trim();
  const sec = String(sector || '').toLowerCase();
  const n = String(name || '').toLowerCase();

  // Explicit sector and name checks
  if (sec.includes('mutual') || sec.includes('debenture') || sec.includes('bond') || sec.includes('promoter')) return true;
  if (n.includes('mutual fund') || n.includes('debenture') || n.includes('bond') || n.includes('promoter share')) return true;

  // NEPSE Debenture / Promoter / Bond ticker patterns (e.g. ADBLD83, KBLD86, NMB50, ACLBSLP)
  if (s.endsWith('PO') || (s.endsWith('P') && s !== 'NADEP') || s.includes('DEB') || s.startsWith('NMB50') || s.startsWith('ADBLD')) return true;
  if (/\d+$/.test(s) && (s.includes('D') || s.includes('B') || s.includes('F'))) return true;

  // Price floor: All NEPSE mutual funds have par 10 and trade below Rs. 25. Regular equities trade >= Rs. 60
  if (ltp !== undefined && ltp > 0 && ltp < 50) return true;

  // Mutual fund schemes ending in F (e.g. HLICF, NICSF, SAEF, CMF2, SIGS2, etc.)
  if (s.endsWith('F') && s.length >= 4 && !['SANIMA', 'SHIVM'].includes(s)) {
    if (sec.includes('microfinance') || n.includes('microfinance') || n.includes('laghubitta')) return false;
    return true;
  }

  return false;
}

/**
 * Evaluates an individual NEPSE stock against the 8 institutional Short-Term Investment Criteria.
 * Integrates True Dynamic ATR Volatility, Sector Relative Strength (RS), Volume Spread Analysis (VSA),
 * 3-Year Lockup Supply Guard, and T+2 Settlement Mechanics across the entire 350+ universe.
 */
export function evaluateShortTermCriteria(stock = {}, indices = {}) {
  const sym = String(stock.symbol || stock.scrip || '').toUpperCase().trim();
  const name = String(stock.name || sym).trim();
  const sectorName = String(stock.sector || stock.sectorName || 'Others').trim();
  const ltp = Number(stock.ltp || stock.closePrice || stock.latestPrice || stock.basePrice || 100);
  const pChg = Number(stock.pChange || stock.percentageChange || 0);
  const vol = Number(stock.volume || stock.totalTradedQuantity || 0);
  const turnover = Number(stock.turnover || stock.totalTurnover || (ltp * vol) || 0);
  const dynEMAs = resolveDynamicStockEMAs(stock, ltp);
  const ema20 = Number(stock.ema20 || dynEMAs.ema20);
  const ema50 = Number(stock.ema50 || stock.sma50 || dynEMAs.ema50);
  const rsi = resolveDynamicStockRSI(stock);
  const cachedFund = getCachedStockFundamentals(sym);
  const eps = Number(cachedFund?.eps !== undefined && cachedFund?.eps !== null ? cachedFund.eps : (stock.eps ?? 0));
  const bookValue = Number(cachedFund?.bookValue !== undefined && cachedFund?.bookValue !== null ? cachedFund.bookValue : (stock.bookValue ?? stock.bvps ?? 100));
  const vsr = Number(stock.volumeSurgeRatio || (vol > 15000 ? 1.4 : vol > 4000 ? 1.15 : 0.95));

  // Comprehensive Exclusions: Mutual funds, debentures, bonds, promoter shares, penny units (< Rs 50)
  const isExcluded = isMutualFundOrDebenture(sym, sectorName, name, ltp);

  // ── 1. Dynamic True ATR Volatility Bands (P2) ──
  const high = Number(stock.high || stock.highPrice || (stock.high52 ? stock.high52 * 0.95 : ltp * 1.025));
  const low = Number(stock.low || stock.lowPrice || (stock.low52 ? stock.low52 * 1.05 : ltp * 0.975));
  const prevClose = Number(stock.previousClose || stock.prevClose || (pChg !== 0 ? ltp / (1 + pChg / 100) : ltp));
  
  let dynamicAtr = 0;
  const cachedHistory = getCachedRealPriceHistory(sym);
  if (Array.isArray(cachedHistory) && cachedHistory.length >= 5) {
    dynamicAtr = calculateATR(cachedHistory, 14);
  } else if (stock.atr && Number(stock.atr) > 0) {
    dynamicAtr = Number(stock.atr);
  } else {
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    const trueRange = Math.max(tr1, tr2, tr3);
    dynamicAtr = Math.max(2, trueRange > 0 ? trueRange : ltp * 0.032);
  }
  const atrPct = Number((((Number(dynamicAtr) || 0) / (ltp || 100)) * 100).toFixed(2));
  const volTier = atrPct < 2.5 ? 'Low-Beta Blue-Chip' : atrPct <= 4.2 ? 'Moderate Volatility' : 'High-Beta Momentum';

  // Multi horizon & Targets calculation calibrated with true dynamic ATR
  const levels = calculateMultiHorizonTargets(ltp, stock.high52, stock.low52, dynamicAtr, pChg) || {};
  const t2Guard = calculateT2CircuitTrapGuard(stock) || { isSafeToEnter: true, status: 'SAFE_ENTRY', advice: 'Safe' };

  // Suggested Entry, Stop Loss, Target 1
  const entryMin = Number(levels.entryZone?.min || (ltp * 0.985).toFixed(1));
  const entryMax = Number(levels.entryZone?.max || (ltp * 1.015).toFixed(1));
  const target1 = Number(levels.target1?.price || (ltp + (Number(dynamicAtr) || 5) * 1.5).toFixed(1));
  const target1Pct = Number(levels.target1?.pct ?? (((target1 - ltp) / (ltp || 100)) * 100).toFixed(2));
  const stopLoss = Number(levels.stopLoss?.price || (ltp - Math.min(ltp * 0.065, Math.max(ltp * 0.035, (Number(dynamicAtr) || 5) * 1.25))).toFixed(1));
  const stopLossPct = Number(levels.stopLoss?.pct ?? (((ltp - stopLoss) / (ltp || 100)) * 100).toFixed(2));

  // Geometric sanity guard: Target must be above entry and stop loss must be below entry
  const isGeometricallySound = stopLoss < ltp * 0.99 && target1 > ltp * 1.025;
  const riskPerShare = isGeometricallySound ? (ltp - stopLoss) : Math.max(0.5, ltp - stopLoss);
  const rewardPerShare = isGeometricallySound ? (target1 - ltp) : 0;
  const netRRR = isGeometricallySound && riskPerShare > 0 ? Number(((rewardPerShare / riskPerShare) || 0).toFixed(2)) : 0;

  // Broker accumulation
  const broker = stock.brokerAnalysis || {};
  const adRatio = Number(broker.adRatio || 0);
  const isBrokerAccum = adRatio >= 0.02 || broker.adSignal === 'Accumulation' || (stock.stealthAccumulation >= 45);

  // ── 2. Sector Relative Strength (RS) vs NEPSE Benchmark (P1) ──
  const secKey = sectorName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let sectorChange = 0;
  if (indices && typeof indices === 'object') {
    for (const k in indices) {
      const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normK.includes(secKey) || secKey.includes(normK)) {
        sectorChange = Number(indices[k]?.pChange ?? indices[k]?.changePercent ?? 0);
        break;
      }
    }
  }
  if (sectorChange === 0 && Number(stock.sectorChange || 0) !== 0) {
    sectorChange = Number(stock.sectorChange);
  }
  const nepseChange = Number(indices?.nepse?.pChange ?? indices?.NEPSE?.pChange ?? 0);
  const sectorRsRatio = Number(((1 + sectorChange / 100) / (1 + nepseChange / 100)).toFixed(3));
  const isSectorTailwind = sectorRsRatio >= 0.98 || sectorChange >= 0;

  // ── 3. Volume Spread Analysis (VSA) & Upper Rejection Wick Guard (P5) ──
  const candleRange = Math.max(0.5, high - low);
  const openPrice = Number(stock.open || stock.openPrice || prevClose);
  const upperWick = Math.max(0, high - Math.max(openPrice, ltp));
  const upperWickRatio = Number((upperWick / candleRange).toFixed(2));
  const isUpperWickBullTrap = upperWickRatio > 0.40 && (pChg < 1.2 || vsr >= 1.3);

  // ── 4. 3-Year Promoter & Local Lockup Supply Guard (P3) ──
  const hasLockupCliff = Boolean(stock.hasLockupExpirySoon || stock.isLockupNear);

  // ── 5. Order Book Microstructure (OBIR) (P4) ──
  const totalBidQty = Number(stock.totalBuyQty || stock.totalBidQty || 0);
  const totalAskQty = Number(stock.totalSellQty || stock.totalAskQty || 0);
  const obirMetrics = (totalBidQty > 0 || totalAskQty > 0) ? calculateOrderBookImbalanceRatio(totalBidQty, totalAskQty) : null;

  // Dynamic fallback for missing EMA20 / EMA50 using cached price history
  let effEma20 = ema20;
  let effEma50 = ema50;
  if ((!effEma20 || !effEma50) && Array.isArray(cachedHistory) && cachedHistory.length >= 10) {
    const closes = cachedHistory.map(h => Number(h.close || h.price || h.ltp)).filter(v => !isNaN(v) && v > 0);
    if (closes.length >= 10) {
      if (!effEma20) {
        const emaArr = calculateEMA(closes, 20);
        if (emaArr.length > 0) effEma20 = Number(emaArr[emaArr.length - 1].toFixed(2));
      }
      if (!effEma50) {
        const emaArr = calculateEMA(closes, 50);
        if (emaArr.length > 0) effEma50 = Number(emaArr[emaArr.length - 1].toFixed(2));
      }
    }
  }

  // ── EVALUATE 8 CRITERIA ──
  // 1. Tradable Liquidity Floor (Excludes penny units, mutual funds, debentures)
  const passLiquidity = !isExcluded && ltp >= 60 && (vol >= 800 || turnover >= 200000 || (stock.marketCap && stock.marketCap > 100000000) || ltp >= 150);

  // 2. Trend & Moving Average Structure (Zero tolerance: no blind pass if EMAs are uncomputed)
  const hasEma = (effEma20 > 0 || effEma50 > 0);
  const isAboveMovingAvg = hasEma
    ? ((effEma20 > 0 && ltp >= effEma20 * 0.97) || (effEma50 > 0 && ltp >= effEma50 * 0.97))
    : (stock.high52 && stock.low52 && ltp >= (Number(stock.low52) + Number(stock.high52)) * 0.52 && pChg >= 0);
  const isHealthyRsi = rsi >= 38 && rsi <= 74;
  const passTrend = isAboveMovingAvg && isHealthyRsi;

  // 3. Volume Surge / Smart Money Footprint
  const passVolume = vsr >= 1.05 || isBrokerAccum || (vol >= 5000 && pChg >= 0) || (pChg >= 1.5 && vol >= 2000);

  // 4. Dynamic ATR-Calibrated RRR (Target 1 >= 4.5%, Stop <= 7.0%, Net RRR >= 1.45, Geometrically Sound)
  const passRRR = isGeometricallySound && target1Pct >= 4.5 && stopLossPct <= 7.0 && stopLossPct >= 1.0 && netRRR >= 1.45;

  // 5. Sector Relative Strength (RS) Alignment (no sector drag)
  const passSector = isSectorTailwind;

  // 6. Volume Spread Analysis & Anti-Trap Guard (no upper rejection wick > 42%)
  const passVSA = !isUpperWickBullTrap;

  // 7. T+2 Settlement & 3-Year Lockup Guard
  const passT2Guard = t2Guard.isSafeToEnter && t2Guard.status !== 'HIGH_T2_CIRCUIT_TRAP' && !hasLockupCliff;

  // 8. Solvency & Conviction Score (Strictly require non-negative EPS and Book Value >= 75)
  const passFundamentals = (eps >= 0 && bookValue >= 75);

  // Calculate composite conviction score (0-100)
  let baseScore = 48;
  if (isAboveMovingAvg) baseScore += 9; else baseScore -= 14;
  if (isHealthyRsi) baseScore += 7; else baseScore -= 9;
  if (vsr >= 1.4) baseScore += 10; else if (vsr >= 1.1) baseScore += 5;
  if (isBrokerAccum) baseScore += 7;
  if (isSectorTailwind) baseScore += 6; else baseScore -= 8;
  if (!isUpperWickBullTrap) baseScore += 5; else baseScore -= 12;
  if (pChg >= 0.5 && pChg <= 4.0) baseScore += 7;
  else if (pChg > 7.0) baseScore -= 8;
  if (netRRR >= 2.0) baseScore += 7; else if (netRRR >= 1.5) baseScore += 4;
  if (passT2Guard) baseScore += 6; else baseScore -= 20;
  if (passFundamentals) baseScore += 5; else baseScore -= 15;
  if (obirMetrics && obirMetrics.obir > 0.20) baseScore += 4;

  const score = Math.max(15, Math.min(96, Math.round(baseScore)));
  const passConviction = score >= 55 && !t2Guard.status?.includes('TRAP') && !isUpperWickBullTrap;

  const criteriaList = [
    {
      id: 'liquidity',
      name: '1. Tradable Liquidity Floor',
      passed: passLiquidity,
      detail: isExcluded
        ? `Excluded non-equity (Mutual Fund / Debenture / Bond not suitable for swing trading)`
        : passLiquidity 
        ? `LTP Rs. ${ltp} · Vol ${vol.toLocaleString()} · T/O Rs. ${(turnover / 100000).toFixed(1)}L`
        : `Fails liquidity (Needs Vol ≥ 800 or T/O ≥ 2L, LTP ≥ 60)`
    },
    {
      id: 'trend',
      name: '2. Trend & Moving Average Structure',
      passed: passTrend,
      detail: passTrend 
        ? `Holding ${effEma20 > 0 ? 'EMA 20 (Rs. ' + effEma20 + ')' : effEma50 > 0 ? 'EMA 50 (Rs. ' + effEma50 + ')' : '52W Mid-band'} · RSI ${rsi != null ? Number(rsi).toFixed(1) : '—'} (Healthy 38–74 range)`
        : `Fails trend structure (${!isAboveMovingAvg ? 'Below EMA/Trend structure' : `RSI ${rsi != null ? Number(rsi).toFixed(1) : '—'} out of 38-74 bounds`})`
    },
    {
      id: 'volume',
      name: '3. Volume Surge & Smart Money Flow',
      passed: passVolume,
      detail: passVolume 
        ? `VSR ${(Number(vsr) || 1).toFixed(1)}× ${isBrokerAccum ? '· Broker Accumulating' : '· Strong Buying Interest'}`
        : `Thin buying volume (VSR ${(Number(vsr) || 1).toFixed(1)}× < 1.05×)`
    },
    {
      id: 'rrr',
      name: '4. Dynamic ATR Risk/Reward (≥ 1.5 : 1)',
      passed: passRRR,
      detail: passRRR 
        ? `RRR ${netRRR} : 1 · ATR Rs. ${(Number(dynamicAtr) || 0).toFixed(1)} (${volTier}) · Target 1 +${target1Pct}% · Stop -${stopLossPct}%`
        : !isGeometricallySound
        ? `Invalid trade geometry (Stop Loss Rs. ${stopLoss} >= Entry or Target Rs. ${target1} <= Entry)`
        : `Fails ATR RRR hurdle (RRR ${netRRR}:1 < 1.45:1 or Target < 4.5%)`
    },
    {
      id: 'sector',
      name: '5. Sector Relative Strength (RS)',
      passed: passSector,
      detail: passSector 
        ? `${sectorName} RS ${(Number(sectorRsRatio) || 1).toFixed(2)}x ${sectorChange >= 0 ? '(Tailwind)' : '(Aligned)'}`
        : `${sectorName} lagging benchmark (RS ${(Number(sectorRsRatio) || 1).toFixed(2)}x < 0.96x drag)`
    },
    {
      id: 'vsa',
      name: '6. Volume Spread & Anti-Trap Guard',
      passed: passVSA,
      detail: passVSA 
        ? `Clean candle spread · Upper wick ${(Number(upperWickRatio || 0) * 100).toFixed(0)}% (No smart money rejection)`
        : `⚠️ Bull Trap Wick: High-volume rejection at upper wick (${(Number(upperWickRatio || 0) * 100).toFixed(0)}% > 42%)`
    },
    {
      id: 't2_guard',
      name: '7. T+2 Settlement & Lockup Guard',
      passed: passT2Guard,
      detail: passT2Guard 
        ? `Safe T+2 delivery cycle · No circuit trap or lockup cliff`
        : hasLockupCliff ? `⚠️ 3-Year Promoter Lockup Cliff nearby` : `⚠️ T+2 Trap: ${t2Guard.advice}`
    },
    {
      id: 'fundamentals',
      name: '8. Solvency & Conviction Score',
      passed: passFundamentals && passConviction,
      detail: (passFundamentals && passConviction)
        ? `EPS Rs. ${eps !== null && !isNaN(Number(eps)) && Number(eps) >= 0 ? Number(eps).toFixed(1) : '—'} (Solvent) · Conviction Score: ${score}/100 (BUY / ACCUMULATE)`
        : (eps !== null && !isNaN(Number(eps)) && Number(eps) < 0)
        ? `Fails solvency (Negative EPS: Rs. ${Number(eps).toFixed(1)} indicates operating losses)`
        : (bookValue !== null && !isNaN(Number(bookValue)) && Number(bookValue) < 75)
        ? `Fails capital solvency (Book Value Rs. ${Number(bookValue).toFixed(1)} < Rs. 75 capital preservation floor)`
        : `Fails conviction threshold (${score}/100 < 55 minimum hurdle)`
    }
  ];

  const passedCount = isExcluded ? 0 : criteriaList.filter(c => c.passed).length;
  const passesAll = !isExcluded && (passedCount === criteriaList.length);

  // Composite Rank Score: Higher = better candidate among those passing all
  const compositeRankScore = isExcluded ? 0 : (score + (netRRR * 3) + (vsr >= 1.3 ? 4 : 0) + (isBrokerAccum ? 3 : 0) + (isSectorTailwind ? 4 : 0));

  let setupType = 'COILED_SWING';
  if (score >= 78 && vsr >= 1.3) setupType = 'ACTIVE_BREAKOUT';
  else if (isBrokerAccum) setupType = 'SMART_MONEY_ACCUM';
  else if (score >= 65) setupType = 'COILED_SWING';

  return {
    ...stock,
    symbol: sym,
    name: stock.name || sym,
    sector: stock.sector || 'Others',
    isTradableEquity: !isExcluded,
    isExcluded,
    ltp,
    pChg,
    vol,
    turnover,
    vsr,
    rsi,
    eps,
    bookValue,
    dynamicAtr,
    volTier,
    sectorRsRatio,
    isSectorTailwind,
    upperWickRatio,
    score: isExcluded ? 10 : score,
    compositeRankScore,
    setupType,
    isBrokerAccum,
    t2Guard,
    entryMin,
    entryMax,
    target1,
    target1Pct,
    stopLoss,
    stopLossPct,
    rrr: netRRR,
    criteriaList,
    passedCount,
    passesAll,
    verdict: isExcluded 
      ? 'EXCLUDED (NON-EQUITY)' 
      : (passesAll ? (score >= 75 ? 'STRONG BUY' : 'ACCUMULATE') : (score < 50 ? 'AVOID' : 'WATCHLIST (FAILS CRITERIA)'))
  };
}

export default function ShortTermProfitPlan({
  stocks = [],
  indices = {},
  onSelectStock,
  initialSymbol,
  onNavigateTab
}) {
  const [selectedSymbol, setSelectedSymbol] = useState(() => {
    if (initialSymbol && typeof initialSymbol === 'string' && initialSymbol.trim()) {
      return initialSymbol.trim().toUpperCase();
    }
    return '';
  });

  const { openStockDetail } = useNavigation();
  const [searchFilter, setSearchFilter] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('all'); // 'all', 'near_qualified', 'breakout', 'broker_accum', 'all_universe'
  const [showCriteriaDetails, setShowCriteriaDetails] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(30);

  // Reset display limit when candidate category changes
  useEffect(() => {
    setDisplayLimit(30);
  }, [candidateFilter]);

  // ── 2. Capital & Position Sizing Inputs (Declared first to avoid TDZ) ──
  const [totalCapital, setTotalCapital] = useState(100000); // Rs. 1 Lakh default
  const [riskPercent, setRiskPercent] = useState(2.0); // 2% max risk per trade default
  const [customEntryPrice, setCustomEntryPrice] = useState(null);
  const [customStopLoss, setCustomStopLoss] = useState(null);
  const [customTarget1, setCustomTarget1] = useState(null);
  const [customQuantity, setCustomQuantity] = useState(null);

  // ── 3. Active Mode in Right Workstation ──
  // 'calculator' | 'expectancy_kelly' | 't2_guard' | 'simulator'
  const [activeMode, setActiveMode] = useState('calculator');
  const [assumedWinRate, setAssumedWinRate] = useState(55); // default 55%
  const [numTradesSim, setNumTradesSim] = useState(20); // default 20 trades

  // ── 4. Active Plans Journal (Local Storage) ──
  const [activePlans, setActivePlans] = useState(() => {
    try {
      const saved = localStorage.getItem('nepse_active_short_term_plans');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Unified stock selection for in-situ 1–2W Profit Plan analysis
  const handleStockClick = (stockOrSymbol) => {
    if (!stockOrSymbol) return;
    const sym = typeof stockOrSymbol === 'string' ? stockOrSymbol : stockOrSymbol?.symbol;
    if (!sym) return;
    const cleanSym = String(sym).trim().toUpperCase();
    setSelectedSymbol(cleanSym);

    // Reset custom overrides for the newly selected stock
    setCustomEntryPrice(null);
    setCustomStopLoss(null);
    setCustomTarget1(null);
    setCustomQuantity(null);

    // Smoothly scroll down to the 1–2W profit plan analysis workstation
    setTimeout(() => {
      const el = document.getElementById('short-term-analysis-workstation');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  };

  const [planSaveToast, setPlanSaveToast] = useState(null);

  // Sync active plans to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('nepse_active_short_term_plans', JSON.stringify(activePlans));
    } catch (e) {
      console.warn('Failed to save active short term plans:', e);
    }
  }, [activePlans]);

  // ── 5. Market Regime Assessment ──
  const marketRegime = useMemo(() => {
    const nepseLtp = Number(indices?.nepse?.value || indices?.nepse?.current || indices?.nepse?.ltp || 0);
    const nepsePChange = Number(indices?.nepse?.pChange ?? indices?.nepse?.changePercent ?? 0);
    const isBullish = nepsePChange >= 0;

    return {
      ltp: nepseLtp,
      pChange: nepsePChange,
      isBullish,
      label: isBullish ? 'Favorable for Swings' : 'Selective / Caution',
      color: isBullish ? '#10B981' : '#F59E0B',
      desc: isBullish
        ? 'Market tone is constructive. Prioritize volume-backed breakouts and 20 EMA pullbacks.'
        : 'Broad index under consolidation. Limit position sizes, enforce strict stop-losses, and focus on high-relative-volume leaders.'
    };
  }, [indices]);

  // ── 6. Full NEPSE 350+ Universe Aggregation (Strict Equities Only) ──
  const fullUniverseStocks = useMemo(() => {
    const liveMap = new Map();
    if (Array.isArray(stocks)) {
      stocks.forEach(s => {
        const sym = String(s.symbol || s.scrip || '').toUpperCase().trim();
        if (sym) liveMap.set(sym, s);
      });
    }

    const universeList = Array.isArray(NEPSE_UNIVERSE) 
      ? NEPSE_UNIVERSE 
      : (NEPSE_UNIVERSE?.stocks || []);
    const merged = [];
    const seen = new Set();

    // 1. Process all stocks from NEPSE_UNIVERSE (Equities only)
    for (const u of universeList) {
      const sym = String(u.symbol || '').toUpperCase().trim();
      if (!sym || seen.has(sym)) continue;

      const live = liveMap.get(sym);
      const cachedFund = getCachedStockFundamentals(sym);
      const ltp = Number(live?.ltp ?? live?.closePrice ?? cachedFund?.ltp ?? u.basePrice ?? 100);
      const sector = live?.sector || u.sector || 'Others';
      const name = live?.name || u.name || sym;

      // Filter out non-tradable equities (mutual funds, debentures, promoter shares)
      if (isMutualFundOrDebenture(sym, sector, name, ltp)) continue;

      seen.add(sym);
      merged.push({
        ...u,
        ...(cachedFund || {}),
        ...(live || {}),
        symbol: sym,
        name,
        sector,
        ltp,
        pChange: Number(live?.pChange ?? live?.percentageChange ?? 0),
        volume: Number(live?.volume ?? live?.totalTradedQuantity ?? 0),
        turnover: Number(live?.turnover ?? live?.totalTurnover ?? 0),
        high52: Number(live?.high52 ?? live?.high52w ?? 0),
        low52: Number(live?.low52 ?? live?.low52w ?? 0),
        ema20: Number(live?.ema20 ?? 0),
        ema50: Number(live?.ema50 ?? live?.sma50 ?? 0),
        rsi: Number(live?.rsi ?? resolveDynamicStockRSI({ ...u, ...(live || {}), ltp })),
        eps: Number(cachedFund?.eps !== undefined && cachedFund?.eps !== null ? cachedFund.eps : (live?.eps ?? 0)),
        bookValue: Number(cachedFund?.bookValue !== undefined && cachedFund?.bookValue !== null ? cachedFund.bookValue : (live?.bookValue ?? live?.bvps ?? 100)),
        pe: Number(cachedFund?.pe !== undefined && cachedFund?.pe !== null ? cachedFund.pe : (live?.pe ?? 0)),
        brokerAnalysis: live?.brokerAnalysis || null
      });
    }

    // 2. Add any live stock not in NEPSE_UNIVERSE (if tradable equity)
    for (const [sym, live] of liveMap.entries()) {
      if (!seen.has(sym)) {
        const ltp = Number(live.ltp || live.closePrice || 100);
        const sector = live.sector || 'Others';
        const name = live.name || sym;

        if (isMutualFundOrDebenture(sym, sector, name, ltp)) continue;

        seen.add(sym);
        const cachedFund = getCachedStockFundamentals(sym);
        merged.push({
          ...(cachedFund || {}),
          ...live,
          symbol: sym,
          name,
          sector,
          ltp,
          pChange: Number(live.pChange || 0),
          volume: Number(live.volume || 0),
          turnover: Number(live.turnover || 0),
          eps: Number(cachedFund?.eps ?? live.eps ?? 0)
        });
      }
    }

    return merged;
  }, [stocks]);

  // ── 7. Multi-Factor 8-Point Criteria Evaluation on all Equities ──
  const allEvaluatedCandidates = useMemo(() => {
    return fullUniverseStocks
      .map(s => evaluateShortTermCriteria(s, indices))
      .filter(c => c.isTradableEquity);
  }, [fullUniverseStocks, indices]);

  // Elite Candidates: strictly those passing ALL 8 criteria
  const qualifiedCandidates = useMemo(() => {
    const passed = allEvaluatedCandidates.filter(c => c.passesAll);
    passed.sort((a, b) => b.compositeRankScore - a.compositeRankScore);
    return passed;
  }, [allEvaluatedCandidates]);

  // Near-Qualified Watchlist: Equities passing 6 or 7 of 8 criteria with solid setup score
  const nearQualifiedCandidates = useMemo(() => {
    const watchlist = allEvaluatedCandidates.filter(c => !c.passesAll && c.passedCount >= 6 && c.score >= 55);
    watchlist.sort((a, b) => {
      if (b.passedCount !== a.passedCount) return b.passedCount - a.passedCount;
      return b.compositeRankScore - a.compositeRankScore;
    });
    return watchlist;
  }, [allEvaluatedCandidates]);

  // #1 Best Pick across the entire universe: ONLY crowned if at least 1 stock passed 100% of all 8 criteria!
  // Prevents crowning unqualified stocks as #1 picks.
  const bestPickCandidate = useMemo(() => {
    if (qualifiedCandidates.length > 0) return qualifiedCandidates[0];
    return null;
  }, [qualifiedCandidates]);

  // Breakout Candidates: Real NEPSE breakout setups (52W high proximity, volume surges, price thrusts, or technical breakout)
  const breakoutCandidates = useMemo(() => {
    return allEvaluatedCandidates.filter(c => {
      const is52WBreakout = Boolean(c.high52 && c.ltp >= c.high52 * 0.95 && c.pChg >= 0);
      const isVolumeThrust = Boolean(c.pChg >= 1.5 && (c.vsr >= 1.15 || c.vol >= 3000));
      const isPriceSurge = Boolean(c.pChg >= 2.5);
      const isPatternBreakout = Boolean(c.isBreakout || c.setupType === 'ACTIVE_BREAKOUT');
      const isMomentumCoil = Boolean(c.score >= 65 && c.vsr >= 1.1);
      return isPatternBreakout || is52WBreakout || isVolumeThrust || isPriceSurge || isMomentumCoil;
    }).sort((a, b) => {
      const aMetric = (Number(a.pChg || 0) * 2) + (Number(a.vsr || 1) * 5) + (Number(a.score || 50) * 0.5);
      const bMetric = (Number(b.pChg || 0) * 2) + (Number(b.vsr || 1) * 5) + (Number(b.score || 50) * 0.5);
      return bMetric - aMetric;
    });
  }, [allEvaluatedCandidates]);

  // Smart Money Candidates: Institutional volume footprint, high turnover favorites, broker accumulation
  const smartMoneyCandidates = useMemo(() => {
    return allEvaluatedCandidates.filter(c => {
      const isHighTurnover = Boolean(c.turnover >= 2500000 && c.pChg >= 0);
      const isHugeTurnover = Boolean(c.turnover >= 8000000);
      const isVolumeShock = Boolean(c.vsr >= 1.25 && c.pChg >= 0);
      const isBrokerAccum = Boolean(c.isBrokerAccum || c.setupType === 'SMART_MONEY_ACCUM');
      const isHighParticipation = Boolean(c.score >= 58 && c.vol >= 10000);
      return isBrokerAccum || isHighTurnover || isHugeTurnover || isVolumeShock || isHighParticipation;
    }).sort((a, b) => {
      const aVal = (Number(a.turnover) || 0) + (Number(a.vsr || 1) * 1000000);
      const bVal = (Number(b.turnover) || 0) + (Number(b.vsr || 1) * 1000000);
      return bVal - aVal;
    });
  }, [allEvaluatedCandidates]);

  // Auto-select initial symbol cleanly
  useEffect(() => {
    if (!selectedSymbol) {
      if (bestPickCandidate?.symbol) {
        setSelectedSymbol(bestPickCandidate.symbol);
      } else if (nearQualifiedCandidates[0]?.symbol) {
        setSelectedSymbol(nearQualifiedCandidates[0].symbol);
      } else if (breakoutCandidates[0]?.symbol) {
        setSelectedSymbol(breakoutCandidates[0].symbol);
      } else if (allEvaluatedCandidates[0]?.symbol) {
        setSelectedSymbol(allEvaluatedCandidates[0].symbol);
      }
    }
  }, [selectedSymbol, bestPickCandidate, nearQualifiedCandidates, breakoutCandidates, allEvaluatedCandidates]);

  // Filtered Candidates according to user selection
  const filteredCandidates = useMemo(() => {
    let pool = [];

    if (candidateFilter === 'all') {
      pool = qualifiedCandidates.length > 0 
        ? qualifiedCandidates 
        : nearQualifiedCandidates.length > 0 
        ? nearQualifiedCandidates 
        : breakoutCandidates.length > 0 
        ? breakoutCandidates 
        : allEvaluatedCandidates;
    } else if (candidateFilter === 'near_qualified') {
      pool = nearQualifiedCandidates.length > 0 ? nearQualifiedCandidates : allEvaluatedCandidates.filter(c => c.passedCount >= 5);
    } else if (candidateFilter === 'breakout') {
      pool = breakoutCandidates;
    } else if (candidateFilter === 'broker_accum') {
      pool = smartMoneyCandidates;
    } else if (candidateFilter === 'all_universe') {
      pool = allEvaluatedCandidates;
    } else {
      pool = qualifiedCandidates.length > 0 ? qualifiedCandidates : nearQualifiedCandidates;
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      const poolMatches = pool.filter(c => 
        c.symbol.toLowerCase().includes(q) || 
        String(c.sector || '').toLowerCase().includes(q) ||
        String(c.name || '').toLowerCase().includes(q)
      );
      if (poolMatches.length > 0) {
        return poolMatches;
      }
      return allEvaluatedCandidates.filter(c => 
        c.symbol.toLowerCase().includes(q) || 
        String(c.sector || '').toLowerCase().includes(q) ||
        String(c.name || '').toLowerCase().includes(q)
      );
    }

    return pool;
  }, [allEvaluatedCandidates, qualifiedCandidates, nearQualifiedCandidates, breakoutCandidates, smartMoneyCandidates, candidateFilter, searchFilter]);

  // ── 8. Currently Selected Stock Details ──
  const activeStock = useMemo(() => {
    const fallbackSym = bestPickCandidate?.symbol || nearQualifiedCandidates[0]?.symbol || breakoutCandidates[0]?.symbol || allEvaluatedCandidates[0]?.symbol || 'NABIL';
    const sym = (selectedSymbol || fallbackSym).trim().toUpperCase();
    const foundEvaluated = allEvaluatedCandidates.find(c => c.symbol.toUpperCase() === sym);
    if (foundEvaluated) return foundEvaluated;

    const foundUniverse = fullUniverseStocks.find(s => s.symbol.toUpperCase() === sym);
    if (foundUniverse) {
      return evaluateShortTermCriteria(foundUniverse, indices);
    }

    if (bestPickCandidate) return bestPickCandidate;
    if (nearQualifiedCandidates[0]) return nearQualifiedCandidates[0];
    if (breakoutCandidates[0]) return breakoutCandidates[0];
    if (allEvaluatedCandidates[0]) return allEvaluatedCandidates[0];

    return evaluateShortTermCriteria({
      symbol: sym,
      ltp: 300,
      pChange: 0,
      sector: 'Commercial Bank'
    }, indices);
  }, [allEvaluatedCandidates, fullUniverseStocks, selectedSymbol, bestPickCandidate, nearQualifiedCandidates, breakoutCandidates, indices]);

  // Reset custom overrides when switching symbol
  useEffect(() => {
    setCustomEntryPrice(null);
    setCustomStopLoss(null);
    setCustomTarget1(null);
    setCustomQuantity(null);
  }, [selectedSymbol]);

  // ── 8. Pricing & Profit Calculations ──
  const entryPrice = customEntryPrice !== null ? Number(customEntryPrice) : Number(activeStock?.ltp || 100);
  const stopLossPrice = customStopLoss !== null
    ? Number(customStopLoss)
    : Number(activeStock?.stopLoss || (entryPrice * 0.96).toFixed(1));
  const target1Price = customTarget1 !== null
    ? Number(customTarget1)
    : Number(activeStock?.target1 || (entryPrice * 1.08).toFixed(1));

  // Risk & Position Sizing Math
  const riskAmount = (Number(totalCapital) * (Number(riskPercent) / 100)); // e.g. 100,000 * 2% = Rs. 2,000
  const riskPerShare = Math.max(0.5, entryPrice - stopLossPrice);
  const calculatedQuantity = Math.max(10, Math.floor(riskAmount / riskPerShare));
  const quantity = customQuantity !== null ? Number(customQuantity) : calculatedQuantity;

  // Real NEPSE Transaction Calculations
  const buyCalculations = useMemo(() => {
    return calculateBuyDetails(quantity, entryPrice);
  }, [quantity, entryPrice]);

  const target1SellCalculations = useMemo(() => {
    // 1-2 week trades are Short-Term (< 365 days)
    return calculateSellDetails(quantity, target1Price, buyCalculations.costPerShare, 'short');
  }, [quantity, target1Price, buyCalculations.costPerShare]);

  const stopLossSellCalculations = useMemo(() => {
    return calculateSellDetails(quantity, stopLossPrice, buyCalculations.costPerShare, 'short');
  }, [quantity, stopLossPrice, buyCalculations.costPerShare]);

  // Net metrics
  const netTakeHomeProfit = target1SellCalculations.netProfitLoss;
  const netTakeHomePct = buyCalculations.totalAmount > 0
    ? ((netTakeHomeProfit / buyCalculations.totalAmount) * 100)
    : 0;

  const netRiskLoss = Math.abs(stopLossSellCalculations.netProfitLoss);
  const netRiskPct = buyCalculations.totalAmount > 0
    ? ((netRiskLoss / buyCalculations.totalAmount) * 100)
    : 0;

  const netRRR = netRiskLoss > 0 ? (netTakeHomeProfit / netRiskLoss) : 0;

  // ── 9. Mathematical Expectancy & Kelly Calculations ──
  const expectancyData = useMemo(() => {
    return calculateExpectancy(assumedWinRate, netTakeHomeProfit, netRiskLoss);
  }, [assumedWinRate, netTakeHomeProfit, netRiskLoss]);

  const kellyData = useMemo(() => {
    return calculateKellyCriterion(assumedWinRate, netRRR);
  }, [assumedWinRate, netRRR]);

  const t2GuardData = useMemo(() => {
    return calculateT2CircuitTrapGuard(activeStock);
  }, [activeStock]);

  const compoundSim = useMemo(() => {
    return simulateCompoundExpectancy(totalCapital, numTradesSim, assumedWinRate, netTakeHomeProfit, netRiskLoss);
  }, [totalCapital, numTradesSim, assumedWinRate, netTakeHomeProfit, netRiskLoss]);

  // Apply Half-Kelly Sizing Handler
  const handleApplyHalfKelly = () => {
    if (kellyData.halfKellyPct > 0) {
      const kellyCapital = totalCapital * (kellyData.halfKellyPct / 100);
      const kellyShares = Math.max(10, Math.floor(kellyCapital / entryPrice));
      setCustomQuantity(kellyShares);
      setPlanSaveToast(`Applied Half-Kelly Sizing: ${kellyData.halfKellyPct}% Capital (${kellyShares} shares)`);
      setTimeout(() => setPlanSaveToast(null), 3500);
    }
  };

  // ── 10. Save Plan to Journal Handler ──
  const handleSavePlan = () => {
    const newPlan = {
      id: `plan_${Date.now()}_${activeStock.symbol}`,
      symbol: activeStock.symbol,
      entryPrice,
      stopLossPrice,
      target1Price,
      quantity,
      totalInvestment: buyCalculations.totalAmount,
      expectedProfit: netTakeHomeProfit,
      expectedProfitPct: netTakeHomePct,
      maxRiskLoss: netRiskLoss,
      savedAt: new Date().toISOString(),
      status: 'active', // 'active', 'target_hit', 'stop_hit', 'closed'
      notes: '1–2 Week Short-Term Swing'
    };

    setActivePlans(prev => [newPlan, ...prev.filter(p => p.symbol !== activeStock.symbol)]);
    setPlanSaveToast(`Saved 1–2W Plan for ${activeStock.symbol}!`);
    setTimeout(() => setPlanSaveToast(null), 3000);
  };

  const handleDeletePlan = (id) => {
    setActivePlans(prev => prev.filter(p => p.id !== id));
  };

  const handleOpenInEntryExit = (sym) => {
    if (!sym) return;
    const cleanSym = String(sym).trim().toUpperCase();
    try {
      localStorage.setItem('selected_entry_exit_symbol', cleanSym);
      localStorage.setItem('open_service_id', 'entry-exit-analyzer');
      
      // 1. Dispatch tab switch for PredictorHub
      window.dispatchEvent(new CustomEvent('switch_predictor_tab', {
        detail: { tab: 'entry_exit', symbol: cleanSym }
      }));

      // 2. Dispatch symbol synchronization
      window.dispatchEvent(new CustomEvent('set_entry_exit_symbol', {
        detail: { symbol: cleanSym, source: 'short_term_profit_plan' }
      }));

      // 3. Dispatch open service for ServicesHub
      window.dispatchEvent(new CustomEvent('open_service', {
        detail: { serviceId: 'entry-exit-analyzer', symbol: cleanSym }
      }));

      // 4. Call parent callback if provided
      if (onNavigateTab) {
        onNavigateTab('entry_exit');
      }
    } catch (_) {}
  };

  return (
    <div 
      className="stpp-root-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '12px 10px',
        maxWidth: 1200,
        margin: '0 auto',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        width: '100%',
        overflowX: 'hidden'
      }}
    >
      <style>{`
        .stpp-root-container {
          width: 100% !important;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .stpp-workstation-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
          gap: 16px;
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .stpp-root-container {
            padding: 4px 1px !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .stpp-workstation-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            width: 100% !important;
          }
          .stpp-card-padding {
            padding: 12px 8px !important;
            border-radius: 14px !important;
          }
          .stpp-header-banner {
            padding: 12px 10px !important;
            border-radius: 14px !important;
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .stpp-header-regime {
            width: 100% !important;
            min-width: unset !important;
          }
        }
      `}</style>

      {/* ── Toast Notification ── */}
      {planSaveToast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          background: '#10B981',
          color: '#000',
          padding: '10px 18px',
          borderRadius: 12,
          fontWeight: 800,
          boxShadow: '0 10px 25px rgba(16,185,129,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'fadeIn 0.2s ease'
        }}>
          <CheckCircle2 size={18} />
          {planSaveToast}
        </div>
      )}

      {/* ── Header Banner & Market Regime Indicator ── */}
      <div 
        className="stpp-header-banner"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.95))',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 20,
          padding: '16px 20px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          boxSizing: 'border-box',
          width: '100%'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.35)',
            flexShrink: 0
          }}>
            <Zap size={24} color="#000" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: '#FFF' }}>
                1–2 Week Short-Term Profit Planner
              </h1>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#FBBF24',
                border: '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                QUANT EDGE
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#A5B4FC',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                Session: {getDetailedMarketStatus().targetSessionDate}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Identify volume breakouts, calculate position size, and lock profits with strict 2:1 risk control.
            </p>
          </div>
        </div>

        {/* Market Regime Badge */}
        <div 
          className="stpp-header-regime"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${marketRegime.color}44`,
            padding: '10px 14px',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 200,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
            <span>NEPSE REGIME</span>
            <span style={{ color: marketRegime.color, fontWeight: 900 }}>{marketRegime.label}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF' }}>
            {Number(marketRegime.ltp) > 0 ? `NEPSE ${Number(marketRegime.ltp).toFixed(1)} (${Number(marketRegime.pChange) >= 0 ? '+' : ''}${Number(marketRegime.pChange).toFixed(2)}%)` : 'Market Open'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
            {marketRegime.desc}
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Workstation Layout ── */}
      <div className="stpp-workstation-grid">
        {/* ════════════════════════════════════════════════════════════
            LEFT COLUMN: Live 1-2W Opportunity Candidates Scanner
        ════════════════════════════════════════════════════════════ */}
        <div 
          className="stpp-card-padding"
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxSizing: 'border-box',
            minWidth: 0,
            width: '100%'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 15 }}>
              <Flame size={18} color="#F59E0B" />
              <span>Top Short-Term Setups</span>
              <span style={{
                fontSize: 10.5,
                background: qualifiedCandidates.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: qualifiedCandidates.length > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                padding: '2px 8px',
                borderRadius: 12,
                color: qualifiedCandidates.length > 0 ? '#34D399' : '#FBBF24',
                fontWeight: 800,
                whiteSpace: 'nowrap'
              }}>
                {qualifiedCandidates.length} QUALIFIED (8/8)
              </span>
            </div>
            {bestPickCandidate && selectedSymbol !== bestPickCandidate.symbol && (
              <button
                onClick={() => setSelectedSymbol(bestPickCandidate.symbol)}
                style={{
                  background: 'rgba(59, 130, 246, 0.18)',
                  border: '1px solid rgba(59, 130, 246, 0.45)',
                  color: '#60A5FA',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.2s'
                }}
                title={`Jump back to #1 Qualified Pick: ${bestPickCandidate.symbol}`}
              >
                ⭐ View #1 Pick ({bestPickCandidate.symbol})
              </button>
            )}
          </div>

          {/* Universe Scanned & Criteria Indicator Banner */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6
          }}>
            <span>Scanned <strong>{fullUniverseStocks.length}+ Equities</strong></span>
            <span style={{ color: '#10B981', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} color="#10B981" /> 8 Institutional Criteria
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '0 10px',
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search tradable equities (e.g., NABIL, SHIVM)..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFF',
                  fontSize: 12,
                  width: '100%',
                  padding: '8px 0'
                }}
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: 0 }}
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              {[
                { id: 'all', label: `⭐ Qualified (${qualifiedCandidates.length})` },
                { id: 'near_qualified', label: `👀 Watchlist (${nearQualifiedCandidates.length})` },
                { id: 'breakout', label: `⚡ Breakouts (${breakoutCandidates.length})` },
                { id: 'broker_accum', label: `👑 Smart Money (${smartMoneyCandidates.length})` },
                { id: 'all_universe', label: `🌐 Equities (${allEvaluatedCandidates.length})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setCandidateFilter(f.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: candidateFilter === f.id ? 'var(--primary)' : 'rgba(255, 255, 255, 0.04)',
                    color: candidateFilter === f.id ? '#FFF' : 'var(--text-muted)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Cards Scrollable List */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: 520,
            overflowY: 'auto',
            paddingRight: 2
          }}>
            {filteredCandidates.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '26px 14px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)'
              }}>
                <ShieldCheck size={28} color="#10B981" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF' }}>
                  {candidateFilter === 'all' 
                    ? '0 Setups Qualified All 8 Criteria Today' 
                    : 'No Candidates Match Filter'}
                </div>
                <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.45, color: '#94a3b8' }}>
                  {candidateFilter === 'all'
                    ? 'The institutional engine enforces zero tolerance: each candidate must clear liquidity, EMA trend, volume expansion, ATR RRR, and T+2 safety. When market volume is dry or consolidating, avoiding forced trades is the smart move.'
                    : 'Try clearing your search query or switching filters.'}
                </div>
                {candidateFilter === 'all' && nearQualifiedCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCandidateFilter('near_qualified')}
                    style={{
                      marginTop: 12,
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid #6366F1',
                      color: '#A5B4FC',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    👉 View {nearQualifiedCandidates.length} Near-Qualified Watch Candidates (Passing 6–7/8)
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredCandidates.slice(0, displayLimit).map((item, idx) => {
                  const isSelected = item.symbol === activeStock.symbol;
                  const isTopPick = bestPickCandidate && item.symbol === bestPickCandidate.symbol;
                  const isT2Trap = item.t2Guard?.status === 'HIGH_T2_CIRCUIT_TRAP';
                  const isBreakoutSetup = Boolean(item.isBreakout || item.setupType === 'ACTIVE_BREAKOUT' || (item.high52 && item.ltp >= item.high52 * 0.95 && item.pChg >= 0.5) || item.pChg >= 2.5);
                  const isSmartMoneySetup = Boolean(item.isBrokerAccum || item.turnover >= 2500000 || item.vsr >= 1.25);

                  return (
                    <div
                      key={item.symbol}
                      onClick={() => handleStockClick(item)}
                      title="Tap to view 1–2W profit plan analysis"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        background: isSelected ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? '1px solid #6366F1' : (isTopPick ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.05)'),
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        position: 'relative',
                        boxSizing: 'border-box',
                        width: '100%',
                        minWidth: 0
                      }}
                    >
                      {/* Row 1: Symbol & Sector on left, Price on right */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 0, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 14, color: '#FFF', letterSpacing: '0.02em', minWidth: 0 }}>
                            {item.symbol}
                          </strong>
                          {isTopPick && (
                            <span style={{
                              fontSize: 9,
                              fontWeight: 900,
                              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                              color: '#000',
                              padding: '1px 5px',
                              borderRadius: 4
                            }}>
                              TOP PICK
                            </span>
                          )}
                          <span style={{
                            fontSize: 9.5,
                            color: 'var(--text-muted)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            maxWidth: 110,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {item.sector}
                          </span>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF' }}>
                            Rs. {item.ltp}
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            marginLeft: 4,
                            color: item.pChg >= 0 ? '#34D399' : '#FB7185'
                          }}>
                            {item.pChg >= 0 ? '+' : ''}{Number(item.pChg || 0).toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Setup Badges & T+2 Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {isBreakoutSetup && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34D399',
                            border: '1px solid rgba(16, 185, 129, 0.4)'
                          }}>
                            ⚡ BREAKOUT
                          </span>
                        )}
                        {isSmartMoneySetup && (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#FBBF24',
                            border: '1px solid rgba(245, 158, 11, 0.4)'
                          }}>
                            👑 SMART MONEY
                          </span>
                        )}

                        {isT2Trap ? (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#F87171'
                          }}>
                            ⚠️ T+2 TRAP
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 9,
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34D399',
                            border: '1px solid rgba(16, 185, 129, 0.4)'
                          }}>
                            🛡️ T+2 SAFE
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStockClick(item);
                          }}
                          title="Load 1–2W profit plan analysis"
                          style={{
                            marginLeft: 'auto',
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#A5B4FC',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3
                          }}
                        >
                          <Sparkles size={10} /> Plan
                        </button>
                      </div>

                      {/* Row 3: Targets & Levels Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 4,
                        fontSize: 10.5,
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '6px 6px',
                        borderRadius: 8,
                        textAlign: 'center'
                      }}>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: 8.5, whiteSpace: 'nowrap' }}>BUY CORRIDOR</div>
                          <div style={{ fontWeight: 800, color: '#94A3B8', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.entryMin} – {item.entryMax}
                          </div>
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ color: '#34D399', fontSize: 8.5, whiteSpace: 'nowrap' }}>1–2W TARGET</div>
                          <div style={{ fontWeight: 900, color: '#34D399', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.target1} (+{item.target1Pct}%)
                          </div>
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ color: '#FB7185', fontSize: 8.5, whiteSpace: 'nowrap' }}>STOP-LOSS</div>
                          <div style={{ fontWeight: 800, color: '#FB7185', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.stopLoss} (-{item.stopLossPct}%)
                          </div>
                        </div>
                      </div>

                      {/* Row 4: Setup & Score Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5 }}>
                        <span style={{
                          fontWeight: 800,
                          color: item.score >= 70 ? '#34D399' : item.score >= 60 ? '#FBBF24' : '#F87171',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <Sparkles size={11} /> Score: {item.score}/100
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                          RRR: <strong style={{ color: item.rrr >= 1.5 ? '#34D399' : '#FB7185' }}>{item.rrr}:1</strong> · RVOL: <strong>{item.vsr}×</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredCandidates.length > displayLimit && (
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + 30)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#A5B4FC',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      margin: '6px 0 10px',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>View More Candidates ({filteredCandidates.length - displayLimit} remaining)</span>
                    <ChevronRight size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            RIGHT COLUMN: Profit Plan Calculator & Quantitative Modules
        ════════════════════════════════════════════════════════════ */}
        <div 
          id="short-term-analysis-workstation"
          className="stpp-card-padding"
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxSizing: 'border-box',
            minWidth: 0,
            width: '100%'
          }}
        >
          {/* Active Stock Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: 14,
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span 
                  style={{ fontSize: 22, fontWeight: 900, color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {activeStock.symbol}
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.2)', color: '#A5B4FC', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                    1–2W PLAN
                  </span>
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#A5B4FC',
                  fontWeight: 700
                }}>
                  {activeStock.sector || 'Sector'}
                </span>
                {activeStock.symbol === bestPickCandidate?.symbol && (
                  <span style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#FBBF24',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    fontWeight: 900
                  }}>
                    🏆 #1 PRIME SHORT-TERM SELECTION
                  </span>
                )}
                {activeStock.passesAll ? (
                  <span style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    fontWeight: 900
                  }}>
                    ✅ ALL {activeStock.criteriaList?.length || 8} CRITERIA MET
                  </span>
                ) : (
                  <span style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    fontWeight: 900
                  }}>
                    ⚠️ FAILS {(activeStock.criteriaList?.length || 8) - activeStock.passedCount} OF {activeStock.criteriaList?.length || 8} CRITERIA
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {activeStock.name && <span style={{ marginRight: 6 }}>{activeStock.name} ·</span>}
                LTP: <strong>Rs. {activeStock.ltp}</strong> ({activeStock.pChange >= 0 ? '+' : ''}{Number(activeStock.pChange || 0).toFixed(2)}%)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleOpenInEntryExit(activeStock.symbol)}
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#60A5FA',
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <ExternalLink size={13} />
                Entry/Exit Analyzer
              </button>

              <button
                type="button"
                onClick={handleSavePlan}
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  border: 'none',
                  color: '#000',
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Bookmark size={13} />
                Save Plan
              </button>
            </div>
          </div>

          {/* ── Short-Term Investment Criteria Audit Checklist ── */}
          <div style={{
            background: activeStock.passesAll ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
            border: activeStock.passesAll ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 14,
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeStock.passesAll ? (
                  <CheckCircle2 size={18} color="#10B981" />
                ) : (
                  <AlertTriangle size={18} color="#EF4444" />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: activeStock.passesAll ? '#34D399' : '#F87171' }}>
                    {activeStock.passesAll 
                      ? `Verified Short-Term Investment Candidate (${activeStock.criteriaList?.length || 8}/${activeStock.criteriaList?.length || 8} Passed)` 
                      : `Caution: Fails ${(activeStock.criteriaList?.length || 8) - activeStock.passedCount} Short-Term Criteria`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {activeStock.passesAll
                      ? 'Passes all institutional liquidity, moving average alignment, volume, dynamic ATR RRR, sector RS, VSA anti-trap, and T+2 circuit rules.'
                      : 'Stock violates strict swing trading criteria. High risk of capital erosion, bull trap, or T+2 lockup.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!activeStock.passesAll && bestPickCandidate && activeStock.symbol !== bestPickCandidate.symbol && (
                  <button
                    type="button"
                    onClick={() => setSelectedSymbol(bestPickCandidate.symbol)}
                    style={{
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      border: 'none',
                      color: '#000',
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Sparkles size={12} /> Switch to #1 Pick ({bestPickCandidate.symbol})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowCriteriaDetails(prev => !prev)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {showCriteriaDetails ? 'Hide Audit' : `Show ${activeStock.criteriaList?.length || 8}-Point Audit`}
                </button>
              </div>
            </div>

            {/* Criteria Breakdown Grid */}
            {showCriteriaDetails && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 8,
                marginTop: 6,
                paddingTop: 10,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)'
              }}>
                {(activeStock.criteriaList || []).map((crit) => (
                  <div
                    key={crit.id}
                    style={{
                      background: crit.passed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      border: crit.passed ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                      padding: '8px 10px',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF' }}>{crit.name}</span>
                      <span style={{
                        fontSize: 9.5,
                        fontWeight: 900,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: crit.passed ? '#10B981' : '#EF4444',
                        color: crit.passed ? '#000' : '#FFF'
                      }}>
                        {crit.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: crit.passed ? '#34D399' : '#F87171', lineHeight: 1.25 }}>
                      {crit.detail}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sub-Mode Navigation Switcher */}
          <div style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: 2
          }}>
            {[
              { id: 'calculator', label: '💰 Profit & Sizing', icon: CalcIcon },
              { id: 'expectancy_kelly', label: '📈 Expectancy & Kelly', icon: Scale },
              { id: 't2_guard', label: '🛡️ T+2 Circuit Guard', icon: ShieldAlert },
              { id: 'simulator', label: '🚀 20-Trade Compound', icon: TrendingUp }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: activeMode === m.id ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.06)',
                  background: activeMode === m.id ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                  color: activeMode === m.id ? '#FFF' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap'
                }}
              >
                <m.icon size={13} />
                {m.label}
              </button>
            ))}
          </div>

          {/* ── SUB-VIEW 1: Standard Calculator & Position Sizing ── */}
          {activeMode === 'calculator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Capital & Risk Allocation Controls */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 14,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Scale size={15} color="#A855F7" />
                  <span>CAPITAL & RISK BUDGETING</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Total Capital */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Trading Capital (Rs.)
                    </label>
                    <input
                      type="number"
                      value={totalCapital}
                      onChange={e => setTotalCapital(Math.max(1000, Number(e.target.value)))}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: '#FFF',
                        fontWeight: 800,
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {[50000, 100000, 200000].map(amt => (
                        <button
                          key={amt}
                          onClick={() => setTotalCapital(amt)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 9,
                            color: 'var(--text-muted)',
                            padding: '2px 6px',
                            cursor: 'pointer'
                          }}
                        >
                          {amt / 1000}k
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Risk % */}
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      Max Risk Per Trade (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={riskPercent}
                      onChange={e => setRiskPercent(Math.max(0.5, Math.min(10, Number(e.target.value))))}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: '#F87171',
                        fontWeight: 800,
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Max loss limit: <strong>Rs. {riskAmount.toFixed(0)}</strong>
                    </div>
                  </div>
                </div>

                {/* Execution Levels Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Entry Price (Rs.)</label>
                    <input
                      type="number"
                      value={entryPrice}
                      onChange={e => setCustomEntryPrice(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                        padding: '6px 8px',
                        color: '#FFF',
                        fontWeight: 800,
                        fontSize: 12,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#34D399' }}>Target 1 (Rs.)</label>
                    <input
                      type="number"
                      value={target1Price}
                      onChange={e => setCustomTarget1(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 6,
                        padding: '6px 8px',
                        color: '#34D399',
                        fontWeight: 800,
                        fontSize: 12,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: '#FB7185' }}>Stop Loss (Rs.)</label>
                    <input
                      type="number"
                      value={stopLossPrice}
                      onChange={e => setCustomStopLoss(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'rgba(244, 63, 94, 0.08)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        borderRadius: 6,
                        padding: '6px 8px',
                        color: '#FB7185',
                        fontWeight: 800,
                        fontSize: 12,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Position Size & Trade Projection Outcome */}
              <div style={{
                background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(0, 0, 0, 0.3))',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 16,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#34D399' }}>
                    RECOMMENDED POSITION SIZE
                  </span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: '#FFF',
                    background: 'rgba(16, 185, 129, 0.2)',
                    padding: '2px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(16, 185, 129, 0.4)'
                  }}>
                    {quantity} Units (Shares)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Total Investment Cost</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#FFF' }}>
                      Rs. {formatSouthAsian(buyCalculations.totalAmount)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Cost per share: Rs. {(Number(buyCalculations?.costPerShare) || 0).toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Net Take-Home Profit (T1)</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#34D399' }}>
                      +Rs. {formatSouthAsian(netTakeHomeProfit)}
                    </div>
                    <div style={{ fontSize: 10, color: '#34D399', fontWeight: 800 }}>
                      Net +{(Number(netTakeHomePct) || 0).toFixed(2)}% (After Fees & Tax)
                    </div>
                  </div>
                </div>

                {/* NEPSE Fees & Tax Breakdown Accordion / Summary */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 11,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Broker Commission (Buy + Sell):</span>
                    <span>Rs. {((Number(buyCalculations?.commission) || 0) + (Number(target1SellCalculations?.commission) || 0)).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>SEBON Fee (0.015% × 2):</span>
                    <span>Rs. {((Number(buyCalculations?.sebonFee) || 0) + (Number(target1SellCalculations?.sebonFee) || 0)).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>DP Charge (Rs. 25 × 2):</span>
                    <span>Rs. 50.00</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Short-Term CGT (7.5% - 10.0% Final Tax):</span>
                    <span>Rs. {(Number(target1SellCalculations?.cgt) || 0).toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: 4,
                    marginTop: 2,
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    fontWeight: 800
                  }}>
                    <span style={{ color: '#FB7185' }}>Downside if Stop-Loss Hits:</span>
                    <span style={{ color: '#FB7185' }}>-Rs. {formatSouthAsian(netRiskLoss)} (-{(Number(netRiskPct) || 0).toFixed(2)}%)</span>
                  </div>
                </div>

                {/* RRR Indicator */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  fontWeight: 800
                }}>
                  <span>Net Risk-to-Reward Ratio (RRR):</span>
                  <span style={{
                    color: (Number(netRRR) || 0) >= 1.8 ? '#34D399' : '#FBBF24',
                    fontSize: 14
                  }}>
                    {(Number(netRRR) || 0).toFixed(2)} : 1 {(Number(netRRR) || 0) >= 1.8 ? '✓ Passes Golden Rule' : '⚠️ Sub-optimal'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── SUB-VIEW 2: Mathematical Expectancy & Kelly Criterion ── */}
          {activeMode === 'expectancy_kelly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 14,
                padding: '12px 14px',
                fontSize: 12
              }}>
                <div style={{ fontWeight: 800, color: '#A5B4FC', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Scale size={16} />
                  <span>The Mathematics of Systematic Profit (EV & Kelly)</span>
                </div>
                <p style={{ margin: '4px 0 0', color: '#CBD5E1', fontSize: 11.5 }}>
                  Professional traders do not rely on 100% win rates. They rely on positive mathematical expectancy ($EV &gt; 0$) and safe capital allocation.
                </p>
              </div>

              {/* Win Rate Assumption Slider */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Assumed Strategy Win Rate:</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#10B981' }}>{assumedWinRate}%</span>
                </div>
                <input
                  type="range"
                  min="35"
                  max="75"
                  step="1"
                  value={assumedWinRate}
                  onChange={e => setAssumedWinRate(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#10B981', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>35% (Conservative)</span>
                  <span>55% (Realistic Swing)</span>
                  <span>75% (Ideal Breakout)</span>
                </div>
              </div>

              {/* Mathematical Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Mathematical Expectancy Card */}
                <div style={{
                  background: expectancyData.hasPositiveEdge ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                  border: `1px solid ${expectancyData.hasPositiveEdge ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  borderRadius: 12,
                  padding: '12px'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>EXPECTED VALUE (EV) / TRADE</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: expectancyData.hasPositiveEdge ? '#34D399' : '#FB7185', marginTop: 2 }}>
                    {(Number(expectancyData?.ev) || 0) >= 0 ? '+' : ''}Rs. {(Number(expectancyData?.ev) || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Profit Factor: <strong style={{ color: '#FFF' }}>{expectancyData.profitFactor}x</strong>
                  </div>
                </div>

                {/* Break-Even Win Rate Card */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  padding: '12px'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>BREAK-EVEN WIN RATE</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#38BDF8', marginTop: 2 }}>
                    {expectancyData.breakEvenWinRate}%
                  </div>
                  <div style={{ fontSize: 10, color: '#34D399', marginTop: 2, fontWeight: 700 }}>
                    +{ (Number(assumedWinRate || 0) - Number(expectancyData?.breakEvenWinRate || 0)).toFixed(1) }% Statistical Buffer
                  </div>
                </div>
              </div>

              {/* Kelly Criterion Card */}
              <div style={{
                background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.08), rgba(0, 0, 0, 0.3))',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: 14,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#C084FC' }}>
                    KELLY CRITERION ALLOCATION
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#FFF' }}>
                    Half-Kelly: {kellyData.halfKellyPct}%
                  </span>
                </div>

                <div style={{ fontSize: 11.5, color: '#CBD5E1', lineHeight: 1.4 }}>
                  {kellyData.rationale}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 11
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Half-Kelly Capital Allocation:</span>
                  <span style={{ fontWeight: 800, color: '#FFF' }}>
                    Rs. {formatSouthAsian(totalCapital * (kellyData.halfKellyPct / 100))}
                  </span>
                </div>

                <button
                  onClick={handleApplyHalfKelly}
                  style={{
                    marginTop: 4,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #A855F7, #7E22CE)',
                    color: '#FFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Percent size={13} />
                  <span>Apply Half-Kelly Sizing to Position ({kellyData.halfKellyPct}%)</span>
                </button>
              </div>
            </div>
          )}

          {/* ── SUB-VIEW 3: NEPSE T+2 Settlement Circuit Guard ── */}
          {activeMode === 't2_guard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: t2GuardData.badgeColor + '15',
                border: `1px solid ${t2GuardData.badgeColor}40`,
                borderRadius: 14,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: t2GuardData.badgeColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={16} />
                    <span>T+2 SETTLEMENT SAFETY DIAGNOSTIC</span>
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: t2GuardData.badgeColor + '30',
                    color: t2GuardData.badgeColor
                  }}>
                    Danger Score: {t2GuardData.trapDangerScore}/100
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#FFF', fontWeight: 700, lineHeight: 1.4 }}>
                  {t2GuardData.advice}
                </div>
              </div>

              {/* Extension Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>2-Day Cumulative Gain</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: t2GuardData.twoDayGain >= 15 ? '#F87171' : '#34D399', marginTop: 2 }}>
                    {t2GuardData.twoDayGain >= 0 ? '+' : ''}{t2GuardData.twoDayGain}%
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t2GuardData.twoDayGain >= 18 ? 'Extreme circuit surge' : 'Healthy expansion'}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Distance from 20 EMA</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: t2GuardData.ema20DistPct >= 12 ? '#FBBF24' : '#FFF', marginTop: 2 }}>
                    +{t2GuardData.ema20DistPct}%
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t2GuardData.ema20DistPct <= 6 ? 'Close to support base' : 'Stretched from average'}
                  </div>
                </div>
              </div>

              {/* NEPSE Settlement Playbook Card */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: 11.5,
                color: '#CBD5E1',
                lineHeight: 1.5
              }}>
                <strong style={{ color: '#FBBF24' }}>NEPSE Microstructure Law:</strong> In Nepal, shares bought today settle on T+2 evening. If you buy a stock that has already printed 2 consecutive 10% circuits, you cannot sell for 3 sessions. Early institutional buyers who bought at support will dump on Day 3 morning, leaving late circuit buyers trapped with no exit liquidity.
              </div>
            </div>
          )}

          {/* ── SUB-VIEW 4: 20-Trade Compound Wealth Growth Simulator ── */}
          {activeMode === 'simulator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.08))',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 14,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#34D399', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={16} />
                    <span>20-TRADE COMPOUND WEALTH PROJECTION</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF' }}>
                    {assumedWinRate}% Win Rate
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Starting Capital</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF' }}>
                      Rs. {formatSouthAsian(compoundSim.startingCapital)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#34D399' }}>Projected Capital (20 Trades)</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#34D399' }}>
                      Rs. {formatSouthAsian(compoundSim.projectedFinalCapital)}
                    </div>
                    <div style={{ fontSize: 10, color: '#34D399', fontWeight: 800 }}>
                      +{compoundSim.projectedRoiPct}% Account Growth
                    </div>
                  </div>
                </div>
              </div>

              {/* Win/Loss Balance Bar */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: '#34D399' }}>{compoundSim.expectedWins} Wins (+Rs. {formatSouthAsian(compoundSim.totalGrossGains)})</span>
                  <span style={{ color: '#FB7185' }}>{compoundSim.expectedLosses} Losses (-Rs. {formatSouthAsian(compoundSim.totalGrossLosses)})</span>
                </div>

                <div style={{ height: 8, background: '#F43F5E', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${assumedWinRate}%`, background: '#10B981', height: '100%' }} />
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  💡 <strong>Mathematical Edge Proof:</strong> Even though you lose on {compoundSim.expectedLosses} out of 20 trades (nearly half the time!), your account grows by <strong>+Rs. {formatSouthAsian(compoundSim.projectedNetProfit)}</strong> because your average gain is strictly protected by the 2:1 asymmetric risk-reward ratio.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          LOWER SECTION: 1-2 Week Execution Playbook & Active Plans
      ════════════════════════════════════════════════════════════ */}
      <div 
        className="stpp-workstation-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 16,
          boxSizing: 'border-box',
          width: '100%'
        }}
      >
        {/* Playbook Lifecycle Timeline */}
        <div 
          className="stpp-card-padding"
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxSizing: 'border-box',
            minWidth: 0,
            width: '100%'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 16 }}>
            <Calendar size={18} color="#38BDF8" />
            <span>1–2 Week Trade Execution Protocol</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
            {/* Step 1: Day 0 Entry */}
            <div style={{
              padding: 10,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.02)',
              borderLeft: '3px solid #6366F1'
            }}>
              <div style={{ fontWeight: 800, color: '#A5B4FC' }}>DAY 0: ORDER PLACEMENT (ENTRY)</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
                Buy strictly within the corridor (Rs. {activeStock.entryMin} – {activeStock.entryMax}). If price has already gained &gt; 5% on the day, cancel and do not FOMO chase.
              </div>
            </div>

            {/* Step 2: T+1 & T+2 Settlement Lockup */}
            <div style={{
              padding: 10,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.02)',
              borderLeft: '3px solid #F59E0B'
            }}>
              <div style={{ fontWeight: 800, color: '#FBBF24' }}>DAYS 1–2: T+2 SETTLEMENT LOCKUP</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
                Shares are unsettled and cannot be sold in NEPSE. Do not panic-trade or watch the 1-minute chart. Wait for Demat credit on T+2 evening.
              </div>
            </div>

            {/* Step 3: Days 3-7 Target Harvest */}
            <div style={{
              padding: 10,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.02)',
              borderLeft: '3px solid #10B981'
            }}>
              <div style={{ fontWeight: 800, color: '#34D399' }}>DAYS 3–7: TARGET 1 PROFIT HARVEST</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
                When price touches Target 1 (Rs. {target1Price}), <strong>sell 50% of your shares</strong> immediately. Shift stop-loss on the remaining 50% to your buy price (breakeven).
              </div>
            </div>

            {/* Step 4: Days 8-10 Time Stop */}
            <div style={{
              padding: 10,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.02)',
              borderLeft: '3px solid #F43F5E'
            }}>
              <div style={{ fontWeight: 800, color: '#FB7185' }}>DAYS 8–10: TIME STOP RULE</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
                If after 7 trading days the stock has not moved and volume has dried up, exit at market. Free up your cash for the next active swing opportunity.
              </div>
            </div>
          </div>
        </div>

        {/* My Active 1-2W Plans Journal */}
        <div 
          className="stpp-card-padding"
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxSizing: 'border-box',
            minWidth: 0,
            width: '100%'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 16 }}>
              <Bookmark size={18} color="#10B981" />
              <span>My Active 1–2W Plans</span>
              <span style={{
                fontSize: 11,
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '2px 8px',
                borderRadius: 12,
                color: 'var(--text-muted)'
              }}>
                {activePlans.length}
              </span>
            </div>
          </div>

          {activePlans.length === 0 ? (
            <div style={{
              padding: '30px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 14
            }}>
              No active plans saved yet. Select any stock above and click <strong>"Save Plan"</strong> to track your trade lifecycle.
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 280,
              overflowY: 'auto'
            }}>
              {activePlans.map(plan => {
                const liveStock = stocks.find(s => String(s.symbol || '').toUpperCase() === plan.symbol);
                const currentPrice = Number(liveStock?.ltp || liveStock?.closePrice || plan.entryPrice);
                const currentDiffPct = ((currentPrice - plan.entryPrice) / plan.entryPrice) * 100;
                const isTargetHit = currentPrice >= plan.target1Price;
                const isStopHit = currentPrice <= plan.stopLossPrice;

                return (
                  <div
                    key={plan.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 900, color: '#FFF' }}>{plan.symbol}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                          {plan.quantity} units @ Rs. {plan.entryPrice}
                        </span>
                        {isTargetHit && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#10B981', color: '#000', fontWeight: 900 }}>
                            TARGET HIT
                          </span>
                        )}
                        {isStopHit && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#F43F5E', color: '#FFF', fontWeight: 900 }}>
                            STOP HIT
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                        Target: <strong style={{ color: '#34D399' }}>Rs. {plan.target1Price}</strong> · Stop: <strong style={{ color: '#FB7185' }}>Rs. {plan.stopLossPrice}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#FFF' }}>Rs. {currentPrice}</div>
                        <div style={{
                          fontWeight: 800,
                          fontSize: 11,
                          color: currentDiffPct >= 0 ? 'var(--bull)' : 'var(--bear)'
                        }}>
                          {(Number(currentDiffPct) || 0) >= 0 ? '+' : ''}{(Number(currentDiffPct) || 0).toFixed(2)}%
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        title="Delete Plan"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 4
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
