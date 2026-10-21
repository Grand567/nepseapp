/**
 * NEPSE Agent Tool Aggregator & Dossier Assembly Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * proxy/agentTools.mjs
 */

import {
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateBollingerBands
} from '../src/utils/indicators.js';
import { calculateATR } from '../src/utils/quantEngine.js';
import { generateEntryExitPlan } from '../src/utils/setupAnalyzer.js';
import { getOrFetchBrokerAnalysis, isNonEquityInstrument } from './brokerVault.mjs';

const STATUTORY_SEBON_SLABS = [
  { max: 50_000, rate: 0.0036 },
  { max: 500_000, rate: 0.0033 },
  { max: 2_000_000, rate: 0.0031 },
  { max: 10_000_000, rate: 0.0027 },
  { max: Infinity, rate: 0.0024 },
];

/**
 * Computes exact statutory NEPSE round-trip fee friction % and net return % after 5-slab brokerage,
 * 0.015% SEBON fee, Rs. 25 DP fee per leg, and 7.5% short-term retail CGT on net gain.
 */
export function computeStatutoryNetReturnPct(entryPrice, exitPrice, kitta = 100, holdingDays = 15) {
  const ePx = Number(entryPrice) || 0;
  const xPx = Number(exitPrice) || 0;
  const qty = Math.max(10, Math.floor(Number(kitta) || 100));
  if (ePx <= 0 || xPx <= 0) return { feeFrictionPct: 0.85, netReturnPct: 0 };

  const calcComm = (amt) => {
    const slab = STATUTORY_SEBON_SLABS.find(s => amt <= s.max) || STATUTORY_SEBON_SLABS[4];
    return Math.max(10, amt * slab.rate);
  };

  const buyGross = ePx * qty;
  const buyFees = calcComm(buyGross) + buyGross * 0.00015 + 25;
  const totalBuyCost = buyGross + buyFees;

  const sellGross = xPx * qty;
  const sellFees = calcComm(sellGross) + sellGross * 0.00015 + 25;
  const netBeforeTax = sellGross - sellFees;

  const taxableGain = Math.max(0, netBeforeTax - totalBuyCost);
  const cgtRate = holdingDays >= 365 ? 0.05 : 0.075;
  const cgtTax = taxableGain * cgtRate;

  const netReceivable = netBeforeTax - cgtTax;
  const netProfit = netReceivable - totalBuyCost;
  const feeFrictionPct = +(((buyFees + sellFees) / buyGross) * 100).toFixed(2);
  const netReturnPct = +((netProfit / totalBuyCost) * 100).toFixed(2);

  return { feeFrictionPct, netReturnPct };
}

/**
 * Computes Half-Kelly Position Sizing with Stop-Loss Inversion Guard and 1% Portfolio Risk Cap
 */
export function computeHalfKellyPosition({
  entryPrice,
  stopLossPrice,
  targetPrice,
  winProb = 0.635,
  portfolioCapitalNpr = 1_000_000,
  maxPortfolioRiskPct = 0.01,
  maxSingleSlotPct = 0.20,
}) {
  const entry = Number(entryPrice) || 0;
  const stop = Number(stopLossPrice) || 0;
  const target = Number(targetPrice) || 0;

  // Mandatory Stop-Loss Inversion Guard: StopLoss must be strictly below Entry Price
  if (entry <= 0 || stop <= 0 || stop >= entry || target <= entry) {
    return {
      isValidStop: false,
      rewardToRiskRatio: 0,
      halfKellyFractionPct: 0,
      suggestedKitta: 0,
      capitalAllocatedNpr: 0,
      riskAmountNpr: 0,
      guardReason: stop >= entry
        ? 'STOP_LOSS_INVERTED: Stop-Loss is >= Entry Price (0 kitta enforced)'
        : 'INVALID_GEOMETRY: Target must exceed Entry Price and Stop-Loss must be positive'
    };
  }

  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const b = rewardPerShare / riskPerShare;
  const p = Math.min(0.95, Math.max(0.05, Number(winProb) || 0.635));
  const q = 1 - p;

  const fullKelly = p - q / b;
  const halfKelly = Math.max(0, 0.5 * fullKelly);

  if (halfKelly <= 0) {
    return {
      isValidStop: true,
      rewardToRiskRatio: +b.toFixed(2),
      halfKellyFractionPct: 0,
      suggestedKitta: 0,
      capitalAllocatedNpr: 0,
      riskAmountNpr: 0,
      guardReason: 'NEGATIVE_EXPECTANCY_KELLY: Payoff ratio insufficient for positive Half-Kelly allocation'
    };
  }

  const maxRiskNpr = portfolioCapitalNpr * maxPortfolioRiskPct; // 1% portfolio risk ceiling
  const kittaByRiskCap = Math.floor(maxRiskNpr / riskPerShare);

  const effectiveSlotFraction = Math.min(maxSingleSlotPct, halfKelly);
  const kittaByCapitalSlot = Math.floor((portfolioCapitalNpr * effectiveSlotFraction) / entry);

  const suggestedKitta = Math.max(0, Math.min(kittaByRiskCap, kittaByCapitalSlot));
  const capitalAllocatedNpr = Math.round(suggestedKitta * entry);
  const riskAmountNpr = Math.round(suggestedKitta * riskPerShare);

  return {
    isValidStop: true,
    rewardToRiskRatio: +b.toFixed(2),
    halfKellyFractionPct: +(halfKelly * 100).toFixed(2),
    suggestedKitta,
    capitalAllocatedNpr,
    riskAmountNpr,
    guardReason: 'VERIFIED'
  };
}

/**
 * Evaluates Mandatory Regulatory & Fundamental Veto Gates:
 * 1. Non-Equity Veto (Mutual Funds, Debentures, Promoter Shares)
 * 2. Promoter Lock-In < 120 Days Cliff Veto
 * 3. Commercial Bank / BFI NPL >= 5.0% or CAR < 11.0% Veto
 * 4. Hydropower Capex > Rs. 20 Cr/MW or Delayed COD Veto
 */
export function evaluateRegulatoryVetoGates(symbol, stock = {}) {
  const vetoes = [];
  const sym = String(symbol || '').toUpperCase().trim();
  const sector = String(stock?.sector || '').toLowerCase();

  if (isNonEquityInstrument(sym)) {
    vetoes.push({
      code: 'NON_EQUITY_INSTRUMENT_VETO',
      reason: `${sym} is classified as a Mutual Fund, Debenture, or Promoter share and is excluded from pure-equity momentum signals.`
    });
  }

  const lockinDays = stock?.promoterLockinDaysRemaining ?? stock?.daysRemaining ?? null;
  if (lockinDays !== null && Number(lockinDays) > 0 && Number(lockinDays) < 120) {
    vetoes.push({
      code: 'PROMOTER_LOCKIN_120D_VETO',
      reason: `Hard Veto: Promoter share lock-in expires in ${lockinDays} days (< 120-day supply flood threshold).`
    });
  }

  const isBfi = sector.includes('bank') || sector.includes('finance') || sector.includes('microfinance');
  const npl = stock?.npl ?? stock?.nplPct ?? null;
  const car = stock?.car ?? stock?.carPct ?? null;

  if (isBfi && npl !== null && Number(npl) >= 5.0) {
    vetoes.push({
      code: 'NRB_NPL_CEILING_VETO',
      reason: `Hard Veto: BFI Non-Performing Loan (NPL ${Number(npl).toFixed(2)}%) breaches NRB 5.0% prudential limit.`
    });
  }
  if (isBfi && car !== null && Number(car) > 0 && Number(car) < 11.0) {
    vetoes.push({
      code: 'NRB_CAR_FLOOR_VETO',
      reason: `Hard Veto: BFI Capital Adequacy Ratio (CAR ${Number(car).toFixed(2)}%) is below NRB 11.0% minimum requirement.`
    });
  }

  const isHydro = sector.includes('hydro');
  const capexPerMwCr = stock?.capexPerMwCr ?? stock?.costPerMwCr ?? null;
  const delayedCod = Boolean(stock?.isDelayedCod || stock?.delayedCod);
  if (isHydro && ((capexPerMwCr !== null && Number(capexPerMwCr) > 20.0) || delayedCod)) {
    vetoes.push({
      code: 'HYDRO_CAPEX_COD_VETO',
      reason: delayedCod
        ? 'Hard Veto: Hydropower project has a delayed Commercial Operation Date (COD).'
        : `Hard Veto: Hydropower project capex (Rs. ${Number(capexPerMwCr).toFixed(1)} Cr/MW) exceeds Rs. 20 Cr/MW threshold.`
    });
  }

  return {
    isVetoed: vetoes.length > 0,
    vetoes
  };
}

export async function assembleScripDossier(symbol, helpers) {
  const normSym = String(symbol || '').toUpperCase().trim();
  if (!normSym) throw new Error('Invalid stock symbol');

  const { getStockDetailInternal, getPriceHistoryInternal, getDividendHistoryInternal } = helpers;

  const [stockDetailResult, historyResult, brokerResult, dividendResult] = await Promise.allSettled([
    getStockDetailInternal(normSym, false),
    getPriceHistoryInternal(normSym, 120),
    getOrFetchBrokerAnalysis(normSym, 30),
    typeof getDividendHistoryInternal === 'function' ? getDividendHistoryInternal(normSym) : Promise.resolve([])
  ]);

  const stock = stockDetailResult.status === 'fulfilled' && stockDetailResult.value ? stockDetailResult.value : null;
  const rawCandles = historyResult.status === 'fulfilled' && Array.isArray(historyResult.value) ? historyResult.value : [];
  const broker = brokerResult.status === 'fulfilled' && brokerResult.value ? brokerResult.value : null;
  const rawDividends = dividendResult?.status === 'fulfilled' && dividendResult.value ? dividendResult.value : [];
  const verifiedDividends = Array.isArray(rawDividends?.dividends) ? rawDividends.dividends : (Array.isArray(rawDividends) ? rawDividends : []);

  if (!stock && rawCandles.length === 0) {
    throw new Error(`No authentic market data found for scrip: ${normSym}`);
  }

  const candles = rawCandles
    .map(c => ({
      date: c.date || c.t || '',
      open: Number(c.open ?? c.o ?? c.close ?? c.c ?? c.ltp ?? 0),
      high: Number(c.high ?? c.h ?? c.close ?? c.c ?? c.ltp ?? 0),
      low: Number(c.low ?? c.l ?? c.close ?? c.c ?? c.ltp ?? 0),
      close: Number(c.close ?? c.c ?? c.ltp ?? 0),
      volume: Number(c.volume ?? c.v ?? c.totalTradeQuantity ?? 0)
    }))
    .filter(c => c.close > 0 && c.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const closes = candles.map(c => c.close);
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const ltp = Number(stock?.ltp || stock?.closePrice || latestCandle?.close || 0);
  const openPx = Number(stock?.openPrice || stock?.open || latestCandle?.open || ltp);
  const prevClose = Number(stock?.previousClose || stock?.prevClose || (candles.length > 1 ? candles[candles.length - 2].close : ltp));
  const pChange = Number(stock?.pChange ?? stock?.percentageChange ?? (prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0));

  // Statutory ±15.0% Circuit Limits (Fourth Amendment 2082)
  const refCloseForCircuit = prevClose > 0 ? prevClose : ltp;
  const circuitFloor = refCloseForCircuit > 0 ? +(refCloseForCircuit * 0.85).toFixed(2) : null;
  const circuitCeiling = refCloseForCircuit > 0 ? +(refCloseForCircuit * 1.15).toFixed(2) : null;

  let rsi = null;
  if (closes.length >= 15) {
    const rawRsi = calculateRSI(closes, 14);
    rsi = rawRsi != null ? +Number(rawRsi).toFixed(1) : null;
  }

  let macd = null;
  if (closes.length >= 26) {
    const rawMacd = calculateMACD(closes, 12, 26, 9);
    if (rawMacd) {
      macd = {
        macdLine: +Number(rawMacd.macdLine ?? rawMacd.macd ?? 0).toFixed(2),
        signalLine: +Number(rawMacd.signalLine ?? rawMacd.signal ?? 0).toFixed(2),
        histogram: +Number(rawMacd.histogram ?? 0).toFixed(2),
        isBullishCross: (rawMacd.histogram ?? 0) >= 0
      };
    }
  }

  let ema20 = null;
  let ema50 = null;
  if (closes.length >= 20) {
    const e20Arr = calculateEMA(closes, 20);
    const validE20 = e20Arr.filter(v => v !== null);
    if (validE20.length > 0) ema20 = +validE20[validE20.length - 1].toFixed(1);
  }
  if (closes.length >= 50) {
    const e50Arr = calculateEMA(closes, 50);
    const validE50 = e50Arr.filter(v => v !== null);
    if (validE50.length > 0) ema50 = +validE50[validE50.length - 1].toFixed(1);
  }

  let bollinger = null;
  if (closes.length >= 20) {
    const rawBb = calculateBollingerBands(closes, 20, 2);
    if (rawBb) {
      bollinger = {
        upper: +Number(rawBb.upper || 0).toFixed(1),
        middle: +Number(rawBb.middle || 0).toFixed(1),
        lower: +Number(rawBb.lower || 0).toFixed(1),
        bandwidthPct: +Number(rawBb.bandwidth || 0).toFixed(1),
        isSqueeze: Boolean(rawBb.isSqueeze)
      };
    }
  }

  const atrRaw = closes.length >= 15 ? Number(calculateATR(candles.slice(-30), 14)) : NaN;
  const atr = isFinite(atrRaw) && atrRaw > 0 ? +atrRaw.toFixed(1) : null;

  const recent20Vols = candles.slice(-21, -1).map(c => c.volume).filter(v => v > 0);
  const avg20Vol = recent20Vols.length > 0
    ? Math.round(recent20Vols.reduce((a, b) => a + b, 0) / recent20Vols.length)
    : null;
  const currentVolRaw = Number(stock?.volume || stock?.totalTradedQuantity || latestCandle?.volume || 0);
  const currentVol = currentVolRaw > 0 ? currentVolRaw : null;
  const rvol = (avg20Vol && avg20Vol > 0 && currentVol) ? +Number(currentVol / avg20Vol).toFixed(2) : null;

  const topBuyers = (broker?.topBuyers || broker?.buyers || []).slice(0, 5);
  const topSellers = (broker?.topSellers || broker?.sellers || []).slice(0, 5);
  const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0);
  const top5BuyVol = topBuyers.slice(0, 5).reduce((acc, b) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0);
  const top3SellVol = topSellers.slice(0, 3).reduce((acc, b) => acc + Number(b.sellQty || b.volume || b.shares || 0), 0);
  const totalBrokerVol = Number(broker?.totalVolume || broker?.totalTradedQty || currentVol || 0);

  const directBcr3 = (totalBrokerVol > 0 && top3BuyVol > 0) ? +((top3BuyVol / totalBrokerVol) * 100).toFixed(1) : null;
  const directBcr5 = (totalBrokerVol > 0 && top5BuyVol > 0) ? +((top5BuyVol / totalBrokerVol) * 100).toFixed(1) : null;
  const directBcr3Sell = (totalBrokerVol > 0 && top3SellVol > 0) ? +((top3SellVol / totalBrokerVol) * 100).toFixed(1) : null;

  const bcr5Raw = Number(broker?.bcr5BuyPct || directBcr5 || (broker?.crb5 ? Number(broker.crb5) * 100 : 0));
  const bcr5 = bcr5Raw > 0 ? bcr5Raw : null;
  const bcr3Raw = Number(broker?.bcr3BuyPct || directBcr3 || 0);
  const bcr3 = bcr3Raw > 0 ? bcr3Raw : null;
  const bcr3SellRaw = Number(broker?.bcr3SellPct || directBcr3Sell || 0);
  const bcr3Sell = bcr3SellRaw > 0 ? bcr3SellRaw : null;

  const regulatoryGate = evaluateRegulatoryVetoGates(normSym, stock);

  let entryExitPlan = null;
  try {
    entryExitPlan = candles.length >= 20
      ? generateEntryExitPlan(stock || { ltp, pChange }, candles, verifiedDividends, { maxHoldDays: 20 })
      : null;
  } catch (_) {
    entryExitPlan = null;
  }

  const levels = entryExitPlan?.levels || {};
  const hasLevels = entryExitPlan && entryExitPlan.supported !== false && levels.stopLoss?.price != null && levels.target1?.price != null;

  const clampSingleDayBand = (px) => {
    const n = Number(px);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (circuitFloor && circuitCeiling) {
      return +Math.min(circuitCeiling, Math.max(circuitFloor, n)).toFixed(2);
    }
    return +n.toFixed(2);
  };

  const executionPlan = (() => {
    const baseFeeInfo = computeStatutoryNetReturnPct(ltp, ltp * 1.08, 100, 15);
    if (!hasLevels || regulatoryGate.isVetoed) {
      return {
        available: false,
        reason: regulatoryGate.isVetoed
          ? regulatoryGate.vetoes.map(v => v.reason).join(' | ')
          : (entryExitPlan?.reason || `Only ${candles.length} sessions of history — at least 20 are required for entry/exit levels.`),
        stance: regulatoryGate.isVetoed ? 'REGULATORY VETO — AVOID' : 'INSUFFICIENT DATA',
        setupScore: null,
        pullbackZone: null,
        breakoutZone: null,
        stopLoss: null,
        targets: [],
        halfKellySizing: { suggestedKitta: 0, halfKellyFractionPct: 0, isValidStop: false },
        feeFrictionPct: baseFeeInfo.feeFrictionPct,
        cgtTaxRatePct: 7.5
      };
    }

    const rawSlPx = Number(levels.stopLoss.price);
    // Stop-Loss Inversion Guard: Ensure StopLoss < LTP and >= circuitFloor
    const safeSlPx = rawSlPx > 0 && rawSlPx < ltp
      ? (circuitFloor ? Math.max(circuitFloor, +rawSlPx.toFixed(2)) : +rawSlPx.toFixed(2))
      : +(ltp * 0.94).toFixed(2);

    const slPct = +(((ltp - safeSlPx) / ltp) * 100).toFixed(2);

    const formatTarget = (t, label, clampToDailyBand = false) => {
      if (t?.price == null) return null;
      const rawTgtPx = Number(t.price);
      if (rawTgtPx <= ltp) return null;
      const finalPx = clampToDailyBand ? clampSingleDayBand(rawTgtPx) : +rawTgtPx.toFixed(2);
      const grossUpsidePct = +(((finalPx - ltp) / ltp) * 100).toFixed(2);
      const { netReturnPct } = computeStatutoryNetReturnPct(ltp, finalPx, 100, 15);
      return {
        price: finalPx,
        grossUpsidePct,
        netReturnPct,
        label
      };
    };

    const t1Obj = formatTarget(levels.target1, 'Target 1 (Circuit-Clamped)', true);
    const t2Obj = formatTarget(levels.target2, 'Target 2 (Swing)', false);
    const targets = [t1Obj, t2Obj].filter(Boolean);

    const pivot = levels.breakoutZone?.pivot ?? levels.breakoutPivot ?? null;
    const rawCap = levels.breakoutZone?.chaseCap ?? levels.chaseCap ?? null;
    const cap = rawCap != null ? clampSingleDayBand(rawCap) : circuitCeiling;

    const halfKellySizing = computeHalfKellyPosition({
      entryPrice: ltp,
      stopLossPrice: rawSlPx, // Pass rawSlPx so if original model stop was inverted, suggestedKitta is strictly 0
      targetPrice: t1Obj?.price || ltp * 1.08,
      winProb: 0.635,
    });

    return {
      available: true,
      stance: halfKellySizing.isValidStop ? (entryExitPlan.verdict || 'HOLD / WAIT') : 'STAND ASIDE (STOP INVERTED)',
      setupScore: entryExitPlan.setupScore ?? null,
      pullbackZone: levels.pullbackZone ? {
        low: levels.pullbackZone.low,
        high: levels.pullbackZone.high,
        label: levels.pullbackZone.label || `Rs. ${levels.pullbackZone.low} – Rs. ${levels.pullbackZone.high}`,
        supportRef: levels.pullbackZone.supportRef || null
      } : null,
      breakoutZone: pivot != null ? {
        pivot,
        trigger: levels.breakoutPrice ?? null,
        chaseCap: cap,
        label: `> Rs. ${pivot}${cap != null ? ` (Cap: Rs. ${cap})` : ''}`
      } : null,
      stopLoss: { price: safeSlPx, pct: slPct, label: `Rs. ${safeSlPx} (-${slPct}%)` },
      targets,
      halfKellySizing,
      riskPerShare: +(ltp - safeSlPx).toFixed(2),
      rewardToTarget1: t1Obj ? +(t1Obj.price - ltp).toFixed(2) : null,
      feeFrictionPct: baseFeeInfo.feeFrictionPct,
      cgtTaxRatePct: 7.5
    };
  })();

  const num = (v) => { const n = Number(v); return isFinite(n) && n !== 0 ? n : null; };

  return {
    symbol: normSym,
    companyName: stock?.companyName || stock?.name || normSym,
    sector: stock?.sector || 'Others',
    regulatoryGate,
    quote: {
      ltp,
      open: openPx,
      prevClose,
      pChange,
      volume: currentVol,
      avgVolume20D: avg20Vol,
      turnover: num(stock?.turnover || stock?.totalTurnover) ?? (currentVol ? Math.round(currentVol * ltp) : null),
      high52w: num(stock?.high52w),
      low52w: num(stock?.low52w),
      circuitCeiling,
      circuitFloor
    },
    technicals: {
      rsi14: rsi,
      macd,
      ema20,
      ema50,
      bollinger,
      atr14: atr,
      rvol20: rvol,
      trendStructure: ema20 == null ? 'INSUFFICIENT_HISTORY' : (ltp >= ema20 ? 'Above 20-EMA (Bullish Stance)' : 'Below 20-EMA (Corrective Stance)')
    },
    brokerFlow: {
      available: bcr3 != null,
      bcr3BuyPct: bcr3,
      bcr5BuyPct: bcr5,
      bcr3SellPct: bcr3Sell,
      topBuyers: topBuyers.map(b => ({
        broker: b.broker || b.brokerNo || b.id,
        volume: Number(b.buyQty || b.volume || 0),
        amount: Number(b.buyAmt || b.amount || 0)
      })),
      topSellers: topSellers.map(s => ({
        broker: s.broker || s.brokerNo || s.id,
        volume: Number(s.sellQty || s.volume || 0),
        amount: Number(s.sellAmt || s.amount || 0)
      })),
      smartMoneyBias: bcr3 == null ? 'Broker data unavailable' : (bcr3 >= 40 ? 'Institutional Cornering' : ((bcr3Sell ?? 0) >= 40 ? 'Operator Offloading' : 'Neutral Flow'))
    },
    fundamentals: {
      pe: num(stock?.pe),
      eps: num(stock?.eps),
      bookValue: num(stock?.bookValue || stock?.bvps),
      pbv: num(stock?.pbv || stock?.pb),
      dividendYield: num(stock?.dividendYield),
      marketCap: num(stock?.marketCap)
    },
    executionPlan,
    meta: {
      candlesAnalyzed: candles.length,
      asOf: new Date().toISOString(),
      dataSource: 'NEPSE Official NOTS & Exchange Floor Sheet'
    }
  };
}

export function buildAgentAnalysisPrompt(dossier, customUserQuery = '') {
  return `You are the Drabyashree NEPSE Analysis Agent, an institutional-grade quantitative equity research engine for the Nepal Stock Exchange (NEPSE).

Below is the VERIFIED, OBSERVED, AND CALCULATED analytical dossier for scrip ${dossier.symbol} (${dossier.companyName}).
Every number provided is authentic and computed from real exchange data.

════════════════════════════════════════════════════════════════
VERIFIED NEPSE DOSSIER:
- Symbol: ${dossier.symbol} | Sector: ${dossier.sector}
- Current LTP: Rs. ${dossier.quote.ltp} (Change: ${dossier.quote.pChange}%)
- Session Reference: Open Rs. ${dossier.quote.open ?? dossier.quote.ltp} | Prev Close Rs. ${dossier.quote.prevClose} | Circuit Limits: Floor Rs. ${dossier.quote.circuitFloor} – Ceiling Rs. ${dossier.quote.circuitCeiling} (±15.0% Fourth Amendment 2082)
- Volume: ${dossier.quote.volume?.toLocaleString() ?? 'N/A'} shares | 20-Day Avg Volume: ${dossier.quote.avgVolume20D?.toLocaleString() ?? 'N/A'} shares | RVOL: ${dossier.technicals.rvol20 ?? 'N/A'}x
- Technical Momentum: RSI(14): ${dossier.technicals.rsi14 ?? 'N/A'} | MACD Histogram: ${dossier.technicals.macd?.histogram ?? 'N/A'} (Bullish: ${dossier.technicals.macd?.isBullishCross ?? false})
- Moving Averages: 20-EMA Rs. ${dossier.technicals.ema20 ?? 'N/A'} | 50-EMA Rs. ${dossier.technicals.ema50 ?? 'N/A'} | Posture: ${dossier.technicals.trendStructure}
- Volatility: ATR(14) Rs. ${dossier.technicals.atr14 ?? 'N/A'} | Bollinger Squeeze: ${dossier.technicals.bollinger?.isSqueeze ? 'YES (Coiling energy)' : 'NO (Normal band width)'}
- Smart Money & Broker Concentration:
  * BCR3 (Top 3 Buyers %): ${dossier.brokerFlow.bcr3BuyPct ?? 'N/A'}%
  * BCR5 (Top 5 Buyers %): ${dossier.brokerFlow.bcr5BuyPct ?? 'N/A'}%
  * BCR3 Sell (Top 3 Sellers %): ${dossier.brokerFlow.bcr3SellPct ?? 'N/A'}%
  * Smart Money Bias: ${dossier.brokerFlow.smartMoneyBias}
- Regulatory Veto Status: ${dossier.regulatoryGate?.isVetoed ? dossier.regulatoryGate.vetoes.map(v => v.reason).join('; ') : 'PASSED ALL GATES'}
- Valuation: P/E: ${dossier.fundamentals.pe ? dossier.fundamentals.pe + 'x' : 'N/A'} | EPS: Rs. ${(dossier.fundamentals.eps !== undefined && dossier.fundamentals.eps !== null) ? dossier.fundamentals.eps : 'N/A'} | Book Value: Rs. ${dossier.fundamentals.bookValue ? dossier.fundamentals.bookValue : 'N/A'}
- Model Execution Geometry & Half-Kelly Sizing:
${(() => { const ep = dossier.executionPlan || {}; if (!ep.available) return `  * UNAVAILABLE: ${ep.reason || 'insufficient data'} — do NOT propose specific entry/stop/target prices.`; const t = (x) => x ? `Rs. ${x.price}${x.netReturnPct != null ? ` (net ${x.netReturnPct}%)` : ''}` : 'N/A'; return [`  * Stance: ${ep.stance} (Setup Score: ${ep.setupScore ?? 'N/A'}/100)`, `  * Pullback Zone: ${ep.pullbackZone?.label ?? 'N/A'} (${ep.pullbackZone?.supportRef ?? ''})`, `  * Breakout: ${ep.breakoutZone?.label ?? 'N/A'}`, `  * Stop-Loss: ${ep.stopLoss?.label ?? 'N/A'}`, `  * Target 1: ${t(ep.targets?.[0])}`, `  * Target 2: ${t(ep.targets?.[1])}`, `  * Half-Kelly Sizing (p=0.635, 1% Risk Cap): ${ep.halfKellySizing?.suggestedKitta ?? 0} kitta (${ep.halfKellySizing?.halfKellyFractionPct ?? 0}%)`].join('\n'); })()}
════════════════════════════════════════════════════════════════

USER INQUIRY: "${customUserQuery || 'Provide institutional analysis, trade execution plan, and risk scenarios for this scrip.'}"

RULES:
1. Do NOT invent prices, dates, or financial metrics. Reference the exact numbers from the dossier.
2. In NEPSE, T+2 delivery settlement applies. Evaluate Day 1 chase risk near the +15% upper circuit ceiling.
3. Clearly explain BOTH entry strategies:
   - Strategy A: Pullback Dip Entry (buying the support retest near 20-EMA)
   - Strategy B: Breakout Trigger (entering on decisive pivot clearance with RVOL >= 1.4x)
4. Specify the exact invalidation level where the bullish setup fails.
${(!dossier.executionPlan?.available || dossier.technicals?.rsi14 == null || dossier.fundamentals?.eps == null) ? `5. DATA INTEGRITY MANDATE: Key analytical inputs are missing or marked UNAVAILABLE (${dossier.executionPlan?.reason || 'unverified fundamentals or short price series'}).
   - Cap "confidenceScore" at 45 maximum.
   - Verdict MUST be "HOLD / TRAIL STOPS" or "AVOID / BULL TRAP" — never "STRONG BUY".
   - In "executiveSummary" and "executionPlan", explicitly state that trades should NOT be initiated until missing inputs are verified.
` : ''}5. Return your response as a STRICT, VALID JSON object with the following schema:

{
  "symbol": "${dossier.symbol}",
  "dataIntegrityNotice": "${(!dossier.executionPlan?.available || dossier.technicals?.rsi14 == null) ? 'INCOMPLETE_DATA_WARNING: Key indicators or history unavailable' : 'VERIFIED'}",
  "verdict": "STRONG BUY" | "ACCUMULATE ON PULLBACK" | "COILED BASE" | "AWAIT BREAKOUT TRIGGER" | "HOLD / TRAIL STOPS" | "AVOID / BULL TRAP",
  "confidenceScore": number (0 to 100),
  "executiveSummary": "Concise 2-3 sentence institutional synthesis",
  "technicalPosture": "Detailed technical analysis of RSI, MACD, EMAs, and Bollinger Squeeze",
  "smartMoneyFlow": "Analysis of BCR3, broker accumulation, and operator offloading check",
  "executionPlan": {
    "recommendedStrategy": "Pullback Dip Entry" | "Breakout Momentum" | "Stand Aside",
    "pullbackDipZone": "Rs. X – Rs. Y",
    "breakoutTrigger": "> Rs. Z (Chase cap: Rs. W)",
    "stopLoss": "Rs. SL (-X.X%)",
    "target1": "Rs. T1 (+X.X% net)",
    "target2": "Rs. T2 (+X.X% net)",
    "riskRewardRatio": "1 : X.X"
  },
  "scenarios": {
    "bullishCase": "Conditions and catalysts for target achievement",
    "baseCase": "Most likely market progression over next 5-15 sessions",
    "bearishInvalidation": "Specific price or flow trigger that terminates the trade"
  },
  "t2SettlementRisk": "Assessment of delivery lockup risk and circuit proximity",
  "nepaliSummary": "संक्षिप्त नेपाली विश्लेषण र खरिद/बिक्री सल्लाह"
}

Return ONLY the raw JSON object. No markdown fences, no explanatory prefixes.`;
}
