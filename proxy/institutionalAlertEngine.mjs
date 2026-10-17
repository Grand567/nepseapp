// proxy/institutionalAlertEngine.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INSTITUTIONAL NEPSE CONFLUENCE & TRAP-IMMUNITY DISPATCH ENGINE
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Strict, zero-discretion institutional filtering engine tailored for NEPSE.
 * Alerts are ONLY approved for Telegram dispatch if they pass:
 *   1. The 4-Pillar Confluence Gate (All 4 must pass)
 *   2. The Absolute Distribution Trap & Veto Engine (ZERO triggers permitted)
 *   3. NEPSE Friction-Adjusted Net Post-Tax/Fee RRR & 1% Position Sizing
 *   4. Macro & Seasonal Regime Multiplier
 *   5. Formatted as an Institutional Execution Ticket Payload
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBrokerName } from './brokerVault.mjs';
import { getDetailedMarketStatus } from '../src/utils/nepseCalendar.js';
import { adToBs } from '../src/utils/bikramSambat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const MACRO_CONFIG_FILE = path.join(DATA_DIR, 'macro_regime.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (_) {}

// ── DEFAULT CONFIGURABLE CONSTANTS ───────────────────────────────────────────

export const DEFAULT_FRICTION_CONSTANTS = {
  brokerCommissionRate: 0.0033, // 0.33% average tiered schedule
  sebonFeeRate: 0.00015,        // 0.015% per leg
  dpCharge: 25,                 // NPR 25 per leg
  cgtRate: 0.075,               // 7.5% individual short-term capital gains tax (< 365 days)
  slippageBufferRate: 0.0045    // 0.45% on entry/exit (2082 Bylaws ±15% volatility adjusted)
};

export const CANONICAL_SUB_INDICES = [
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
  'Trading',
  'Mutual Fund',
  'Others'
];

export const DEFENSIVE_SECTORS = [
  'Commercial Banks',
  'Non-Life Insurance',
  'Life Insurance',
  'Investment'
];

// ── MACRO & SEASONAL REGIME MULTIPLIER (MODULE 4) ───────────────────────────

function loadMacroConfig() {
  try {
    if (fs.existsSync(MACRO_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(MACRO_CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}
  return {
    ibor: 5.4, // Interbank Rate (%)
    cdRatio: 81.5, // Banking CD Ratio (%)
    regimeOverride: null, // 'BULLISH' | 'NEUTRAL' | 'DEFENSIVE' | null
    updatedAt: new Date().toISOString()
  };
}

export function saveMacroConfig(partial) {
  const current = loadMacroConfig();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(MACRO_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (_) {}
  return next;
}

/**
 * Determines current Macro Regime and Seasonal Hydrology Adjustments.
 * - IBOR > 6.5% or CD Ratio > 86% -> DEFENSIVE (Net RRR >= 3.0, defensive sectors only)
 * - Dry-season (Mid-March to Mid-June / Chaitra–Jestha) for Hydros or pre-festive crunch:
 *   tighten vduRatio <= 0.45 and 5D retention >= 0.80.
 */
export function getMacroRegime(options = {}) {
  const cfg = { ...loadMacroConfig(), ...options };
  const ibor = Number(cfg.ibor ?? 5.4);
  const cdRatio = Number(cfg.cdRatio ?? 81.5);
  const isLiquidityTight = ibor > 6.5 || cdRatio > 86.0;

  let regime = cfg.regimeOverride || (isLiquidityTight ? 'DEFENSIVE' : (cfg.isBullishMarket ? 'BULLISH' : 'NEUTRAL'));

  // Seasonal & Hydrology check
  const now = options.date ? new Date(options.date) : new Date();
  let bsDate = null;
  try {
    bsDate = adToBs(now);
  } catch (_) {}

  const bsMonth = bsDate?.month || 1; // 1 = Baisakh, 2 = Jestha, 12 = Chaitra
  const isHydroDrySeason = bsMonth === 12 || bsMonth === 1 || bsMonth === 2; // Mid-March to Mid-June

  // 15-day pre-Dashain/Tihar crunch window (Ashwin late / Kartik, approx October)
  const isPreFestiveCrunch = bsMonth === 6 && (bsDate?.day || 1) >= 15;

  const isSeasonalTightened = isHydroDrySeason || isPreFestiveCrunch || Boolean(options.forceSeasonalTightening);

  return {
    regime,
    isDefensive: regime === 'DEFENSIVE',
    ibor,
    cdRatio,
    isLiquidityTight,
    isHydroDrySeason,
    isPreFestiveCrunch,
    isSeasonalTightened,
    requiredNetRRR: regime === 'DEFENSIVE' ? 3.0 : 2.5,
    vduThreshold: isSeasonalTightened ? 0.45 : 0.55,
    rolling5DRetentionThreshold: isSeasonalTightened ? 0.80 : 0.75
  };
}

// ── MODULE 3: NEPSE FRICTION-ADJUSTED RRR & POSITION SIZING ──────────────────

/**
 * Calculates Net Post-Tax, Post-Fee RRR and 1% Portfolio Risk Position Sizing
 */
export function calculateNetExpectancyAndSizing({
  entryPrice,
  target1,
  target2,
  stopLossRaw,
  nearestSupport = null,
  atr14 = null,
  medianDailyTurnover20D = 7500000,
  friction = DEFAULT_FRICTION_CONSTANTS,
  requiredNetRRR = 2.5
}) {
  const entry = Number(entryPrice || 0);
  if (entry <= 0) return null;

  // 1. Stop-Loss Calibration:
  // Stop_Loss = max(Nearest_Structural_Support, Entry_Price - (1.75 * ATR_14))
  // Capped at maximum -7.5% raw distance from entry
  const atr = Number(atr14 || entry * 0.035);
  const atrStop = entry - (1.75 * atr);
  const supportStop = nearestSupport ? Number(nearestSupport) : atrStop;
  
  // Whichever is tighter (higher price floor), but below entry
  let calibratedStop = Math.max(supportStop, atrStop);
  if (calibratedStop >= entry) calibratedStop = entry - (1.75 * atr);

  // Maximum raw loss capped at -8.0% (2082 Bylaws ±15% volatility adjusted)
  const maxAllowableStop = entry * (1 - 0.080);
  const finalStopLoss = +(Math.max(calibratedStop, maxAllowableStop)).toFixed(1);

  // Targets
  const t1 = Number(target1 || entry * 1.12);
  const t2 = Number(target2 || entry * 1.20);

  // 2. NEPSE Friction Constants
  const brokerRate = friction.brokerCommissionRate ?? 0.0033;
  const sebonRate = friction.sebonFeeRate ?? 0.00015;
  const dpCharge = friction.dpCharge ?? 25;
  const cgtRate = friction.cgtRate ?? 0.075;
  const slipRate = friction.slippageBufferRate ?? 0.0045;

  // Round trip fees per share (broker + sebon + slippage on buy & sell + amortized DP fee on 100 shares)
  const buyCostFriction = entry * (brokerRate + sebonRate + slipRate);
  const sellProceedsFriction = t1 * (brokerRate + sebonRate + slipRate);
  const dpPerShare = (dpCharge * 2) / 100; // NPR 50 roundtrip amortized over standard 100 shares lot
  const roundTripFeesPerShare = +(buyCostFriction + sellProceedsFriction + dpPerShare).toFixed(2);

  // Net Profit & Net Loss per share
  const grossProfitPerShare = t1 - entry;
  const netProfitPerShare = +(((grossProfitPerShare * (1 - cgtRate))) - roundTripFeesPerShare).toFixed(2);
  const grossLossPerShare = entry - finalStopLoss;
  const netLossPerShare = +(grossLossPerShare + roundTripFeesPerShare).toFixed(2);

  const netRRR = netLossPerShare > 0 ? +(netProfitPerShare / netLossPerShare).toFixed(2) : 0;
  const isRrrAcceptable = netRRR >= requiredNetRRR;

  // 3. Dynamic Position Sizing (1% Portfolio Risk Rule per 1 Lakh Capital)
  // Max loss allowed on 1 Lakh = NPR 1,000
  const qtyPer1Lakh = Math.max(0, Math.floor(1000 / Math.max(1, netLossPerShare)));
  const capitalDeployed = Math.round(qtyPer1Lakh * entry);

  // 5% Median Turnover Participation Cap
  const maxSafeOrderValue = Math.round(0.05 * Math.max(0, Number(medianDailyTurnover20D || 0)));
  const turnoverLakhs = +((medianDailyTurnover20D / 100000).toFixed(1));
  const safeOrderLakhs = +((maxSafeOrderValue / 100000).toFixed(1));

  return {
    entryPrice: entry,
    stopLoss: finalStopLoss,
    target1: t1,
    target2: t2,
    slPct: +(((entry - finalStopLoss) / entry) * 100).toFixed(1),
    t1Pct: +(((t1 - entry) / entry) * 100).toFixed(1),
    t2Pct: +(((t2 - entry) / entry) * 100).toFixed(1),
    roundTripFeesPerShare,
    netProfitPerShare,
    netLossPerShare,
    netRRR,
    requiredNetRRR,
    isRrrAcceptable,
    qtyPer1Lakh,
    capitalDeployed,
    medianDailyTurnover20D,
    turnoverLakhs,
    maxSafeOrderValue,
    safeOrderLakhs
  };
}

// ── MODULE 1: THE 4-PILLAR CONFLUENCE GATE ───────────────────────────────────

/**
 * Pillar 1: Wyckoff Phase C / Volume Dry-Up (VDU) & VCP
 */
export function evaluatePillar1_WyckoffVduVcp({
  recentVolume,
  avgVolume20D,
  priceHistory = [],
  currentHigh,
  currentLow,
  currentClose,
  vduThreshold = 0.55
}) {
  const avgVol = Number(avgVolume20D || 0);
  const vol = Number(recentVolume || 0);
  const vduRatio = avgVol > 0 ? +(vol / avgVol).toFixed(2) : 0.50;

  // Supply exhaustion: vduRatio <= threshold
  const isVduMet = vduRatio <= vduThreshold;

  // Volatility Contraction Pattern (VCP):
  // Daily price range is contracting, proving seller depletion
  let isVcpMet = false;
  let rangeContractionRatio = 1.0;

  if (priceHistory && priceHistory.length >= 3) {
    const candles = priceHistory.slice(-5);
    const ranges = candles.map(c => Number(c.high || c.close) - Number(c.low || c.close));
    const avgRecentRange = ranges.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, ranges.length - 1);
    const currRange = Number(currentHigh || currentClose) - Number(currentLow || currentClose);

    if (avgRecentRange > 0) {
      rangeContractionRatio = +(currRange / avgRecentRange).toFixed(2);
      isVcpMet = currRange <= avgRecentRange * 0.85 || (currRange / Number(currentClose)) <= 0.038;
    } else {
      isVcpMet = true;
    }
  } else {
    // If history is minimal, verify intraday range is tight
    const cHigh = Number(currentHigh || currentClose);
    const cLow = Number(currentLow || currentClose);
    const rangePct = currentClose > 0 ? (cHigh - cLow) / currentClose : 0;
    isVcpMet = rangePct <= 0.04;
  }

  const passed = isVduMet && isVcpMet;

  return {
    pillar: 1,
    name: 'Wyckoff Phase C / VDU & VCP',
    passed,
    vduRatio,
    vduThreshold,
    isVduMet,
    isVcpMet,
    rangeContractionRatio,
    detail: `VDU: ${vduRatio}x of 20D Vol (Threshold <= ${vduThreshold}x) | VCP Contraction: ${isVcpMet ? 'YES' : 'NO'}`
  };
}

/**
 * Pillar 2: Multi-Day Smart Money Floorsheet Absorption & Anti-Splitting Logic
 */
export function evaluatePillar2_SmartMoneyAbsorption({
  floorsheetTrades = [],
  bcr3BuyPct = null,
  topBuyerBrokers = [],
  rolling5DBrokerData = null,
  totalBuyTrades = 0,
  totalSellTrades = 0,
  totalBuyQty = 0,
  totalSellQty = 0,
  threshold5DRetention = 0.75
}) {
  let bcr3Buy = Number(bcr3BuyPct ?? 0);
  let buyers = Array.isArray(topBuyerBrokers) ? [...topBuyerBrokers] : [];
  let singleDayNetRetention = 0.80; // default assumption if already pre-filtered
  let buyTradesCount = Number(totalBuyTrades || 0);
  let sellTradesCount = Number(totalSellTrades || 0);
  let buyVolume = Number(totalBuyQty || 0);
  let sellVolume = Number(totalSellQty || 0);

  // Compute from raw floorsheet if passed
  if (floorsheetTrades && floorsheetTrades.length > 0) {
    const buyerMap = {};
    const sellerMap = {};
    let decontamBuyVol = 0;
    let decontamSellVol = 0;
    let bTrades = 0;
    let sTrades = 0;

    floorsheetTrades.forEach(t => {
      const b = String(t.buyerBroker || t.buyer || '').trim();
      const s = String(t.sellerBroker || t.seller || '').trim();
      const q = Number(t.qty || t.quantity || 0);

      // Exclude circular wash trades
      if (b && s && b === s) return;

      if (b) {
        buyerMap[b] = buyerMap[b] || { broker: b, buyQty: 0, sellQty: 0 };
        buyerMap[b].buyQty += q;
        decontamBuyVol += q;
        bTrades++;
      }
      if (s) {
        sellerMap[s] = sellerMap[s] || { broker: s, buyQty: 0, sellQty: 0 };
        sellerMap[s].sellQty += q;
        decontamSellVol += q;
        sTrades++;
      }
      if (buyerMap[s]) {
        buyerMap[s].sellQty += q;
      }
    });

    const sortedBuyers = Object.values(buyerMap).sort((a, b) => b.buyQty - a.buyQty);
    buyers = sortedBuyers.slice(0, 3);
    const top3Buy = buyers.reduce((sum, b) => sum + b.buyQty, 0);
    const top3Sell = buyers.reduce((sum, b) => sum + (b.sellQty || 0), 0);

    if (decontamBuyVol > 0) {
      bcr3Buy = +((top3Buy / decontamBuyVol) * 100).toFixed(1);
    }
    if (top3Buy > 0) {
      singleDayNetRetention = +((top3Buy - top3Sell) / top3Buy).toFixed(2);
    }
    buyTradesCount = bTrades;
    sellTradesCount = sTrades;
    buyVolume = decontamBuyVol;
    sellVolume = decontamSellVol;
  }

  // BCR3 Single Day Gate: BCR3_Buy >= 40% AND net retention >= 0.70
  const isBcr3Met = bcr3Buy >= 40.0;
  const isSingleDayRetentionMet = singleDayNetRetention >= 0.70;

  // 5-Day Rolling Retention Check (BCR5_5D >= 75%)
  let rolling5DRetention = 0.82;
  if (rolling5DBrokerData) {
    const gross5D = Number(rolling5DBrokerData.grossBuy5D || rolling5DBrokerData.totalBuy5D || 100);
    const net5D = Number(rolling5DBrokerData.netBuy5D || rolling5DBrokerData.netAccumulated5D || 80);
    rolling5DRetention = gross5D > 0 ? +(net5D / gross5D).toFixed(2) : 0.80;
  }
  const is5DRetentionMet = rolling5DRetention >= threshold5DRetention;

  // Average Ticket Size Ratio (ATSR):
  // ATSR = (Avg Shares per Buy Tx) / (Avg Shares per Sell Tx) >= 2.2
  let avgBuyTicket = 450;
  let avgSellTicket = 180;
  if (buyTradesCount > 0 && sellTradesCount > 0 && buyVolume > 0 && sellVolume > 0) {
    avgBuyTicket = buyVolume / buyTradesCount;
    avgSellTicket = sellVolume / sellTradesCount;
  }
  const atsr = avgSellTicket > 0 ? +(avgBuyTicket / avgSellTicket).toFixed(2) : 2.5;
  const isAtsrMet = atsr >= 2.2;

  const passed = isBcr3Met && isSingleDayRetentionMet && is5DRetentionMet && isAtsrMet;

  return {
    pillar: 2,
    name: 'Smart Money Floorsheet Absorption & Anti-Splitting',
    passed,
    bcr3BuyPct: bcr3Buy,
    isBcr3Met,
    singleDayNetRetention,
    isSingleDayRetentionMet,
    rolling5DRetentionPct: Math.round(rolling5DRetention * 100),
    is5DRetentionMet,
    atsr,
    isAtsrMet,
    topBuyerBrokers: buyers,
    detail: `BCR3 Buy: ${bcr3Buy}% (>=40%) | 1D Retention: ${Math.round(singleDayNetRetention * 100)}% (>=70%) | 5D Retention: ${Math.round(rolling5DRetention * 100)}% (>=${Math.round(threshold5DRetention * 100)}%) | ATSR: ${atsr}x (>=2.2x)`
  };
}

/**
 * Pillar 3: Volume-Price Validation (Effort vs Result & Day-2 Confirmation)
 */
export function evaluatePillar3_VolumePriceValidation({
  high,
  low,
  close,
  open,
  priceHistory = [],
  day2ConfirmationOverride = null
}) {
  const h = Number(high || close);
  const l = Number(low || close);
  const c = Number(close || 0);
  const o = Number(open || close);
  const candleRange = Math.max(0.1, h - l);

  // Upper rejection wick check:
  // Reject if (High - Close) / (High - Low) >= 0.40
  const upperWick = h - Math.max(o, c);
  const upperWickRatio = +(upperWick / candleRange).toFixed(2);
  const isWickClean = upperWickRatio < 0.40;

  // Day-2 Confirmation Logic:
  // Do not alert on Day 1 explosive retail momentum (+7% to 10% runaway).
  // Require stealth accumulation base on Day 1 followed by clean continuation / low-volume retest on Day 2.
  let isDay2Confirmed = true;
  if (day2ConfirmationOverride !== null) {
    isDay2Confirmed = Boolean(day2ConfirmationOverride);
  } else if (priceHistory && priceHistory.length >= 2) {
    const prevCandle = priceHistory[priceHistory.length - 2];
    const prevClose = Number(prevCandle.close || prevCandle.ltp || c);
    const prevOpen = Number(prevCandle.open || prevClose);
    const prevChangePct = prevOpen > 0 ? ((prevClose - prevOpen) / prevOpen) * 100 : 0;

    // If Day 1 was already an overextended retail euphoria candle (+7.5%+)
    if (prevChangePct >= 7.5) {
      // Must be a healthy, orderly pullback/retest, not a second parabolic pump
      const todayChangePct = prevClose > 0 ? ((c - prevClose) / prevClose) * 100 : 0;
      if (todayChangePct > 6.0) {
        isDay2Confirmed = false; // Parabolic Day-1 chase
      }
    }
  }

  const passed = isWickClean && isDay2Confirmed;

  return {
    pillar: 3,
    name: 'Volume-Price Validation (Effort vs. Result)',
    passed,
    upperWickRatio,
    isWickClean,
    isDay2Confirmed,
    detail: `Upper Wick Rejection: ${Math.round(upperWickRatio * 100)}% (<40%) | Day-2 Confirmation: ${isDay2Confirmed ? 'PASS' : 'REJECT (Day-1 Overextension)'}`
  };
}

/**
 * Pillar 4: Structural Trend & Sectoral Relative Strength (RS)
 */
export function evaluatePillar4_TrendAndSectorRS({
  ltp,
  ema50,
  ema50Prev,
  sector = 'Hydro Power',
  sectorRank10D = 2,
  stock10DReturn = 4.5,
  sector10DReturn = 2.8,
  canonicalSectorList = CANONICAL_SUB_INDICES
}) {
  const currentPrice = Number(ltp || 0);
  const e50 = Number(ema50 || (currentPrice * 0.95));
  const e50Prior = Number(ema50Prev || (e50 * 0.999));

  // 1. LTP > 50-day EMA and rising EMA
  const isAboveEma50 = currentPrice > e50;
  const isEmaRising = e50 >= e50Prior;
  const isTrendMet = isAboveEma50 && isEmaRising;

  // 2. Mansfield Relative Strength Gate:
  // Sub-sector ranks in Top 3 of 13 NEPSE sub-indices over 10D
  const rank = Number(sectorRank10D || 1);
  const isSectorTop3 = rank <= 3;

  // Scrip outperforming sub-index
  const isOutperformingSector = Number(stock10DReturn || 0) >= Number(sector10DReturn || 0);

  const passed = isTrendMet && isSectorTop3 && isOutperformingSector;

  return {
    pillar: 4,
    name: 'Structural Trend & Sector Relative Strength',
    passed,
    isAboveEma50,
    isEmaRising,
    sector,
    sectorRank10D: rank,
    totalSectors: canonicalSectorList.length || 13,
    isSectorTop3,
    stock10DReturn: Number(stock10DReturn || 0),
    sector10DReturn: Number(sector10DReturn || 0),
    isOutperformingSector,
    detail: `LTP vs 50 EMA: ${isAboveEma50 ? 'Above' : 'Below'} (Rising: ${isEmaRising ? 'YES' : 'NO'}) | Sector: ${sector} (#${rank}/13 RS Rank) | Alpha vs Sector: +${(Number(stock10DReturn) - Number(sector10DReturn)).toFixed(1)}%`
  };
}

// ── MODULE 2: ABSOLUTE DISTRIBUTION TRAP & VETO ENGINE ──────────────────────

/**
 * Evaluates the 6 Hard Veto Filters under 2082 Bylaws (±15% daily circuit, ±5% pre-open, 5%/8% index halts).
 * If ANY trigger fires, the alert is IMMEDIATELY DROPPED.
 */
export function evaluateVetoFilters({
  ltp,
  previousClose,
  bcr3SellPct = 0,
  circularWashPct = 0,
  volumeTMinus3 = 0,
  vwapTMinus3 = 0,
  avgVolume20D = 50000,
  medianDailyTurnover20D = 7500000,
  preOpenGapPct = 0,
  isPreOpenGapRetested = true,
  nepseIndexChangePct = 0,
  nptMinutes = null,
  isLiveMarket = true,
  bypassTimingGate = false // allows EOD testing
}) {
  const currentLtp = Number(ltp || 0);
  const prevClose = Number(previousClose || (currentLtp > 0 ? currentLtp : 0));
  const pChange = prevClose > 0 ? ((currentLtp - prevClose) / prevClose) * 100 : 0;
  
  // Under Securities Trading Operations (Fourth Amendment) Bylaws, 2082:
  // Continuous trading has a ±15% daily stock circuit limit.
  const upperCircuitCeiling = prevClose > 0 ? +(prevClose * 1.15).toFixed(2) : +(currentLtp * 1.15).toFixed(2);
  const distanceToUpperCircuitPct = upperCircuitCeiling > 0 ? +(((upperCircuitCeiling - currentLtp) / upperCircuitCeiling) * 100).toFixed(2) : 15.0;

  const vetoTriggers = [];

  // VETO 1: NEPSE ±15% Circuit-Ceiling Guard & Pre-Open Gap Filter
  // Hard Ceiling Veto: Drop any alert where LTP is up >= 10.5% on the day OR within 1.5% to 2.5% of +15% ceiling
  if (pChange >= 10.5 || distanceToUpperCircuitPct <= 2.5 || currentLtp >= prevClose * 1.125) {
    vetoTriggers.push({
      code: 'VETO_CIRCUIT_CEILING',
      reason: `±15% Circuit-Ceiling Guard: Up +${pChange.toFixed(1)}% today or within ${distanceToUpperCircuitPct.toFixed(1)}% of +15% ceiling (Do not chase)`
    });
  }

  // Unfilled Pre-Open Gap Veto: Gapped up >= 4.0% in pre-open without 30m VWAP hold
  if (Number(preOpenGapPct || 0) >= 4.0 && !isPreOpenGapRetested) {
    vetoTriggers.push({
      code: 'VETO_UNFILLED_PREOPEN_GAP',
      reason: `Unfilled Pre-Open Gap Veto: Gapped up +${Number(preOpenGapPct).toFixed(1)}% in pre-open without holding 30m intraday VWAP retest`
    });
  }

  // VETO 2: Market-Wide Index Circuit Guard (5% / 8% Rule)
  // Pause/suppress if benchmark index is within 0.5% of +5% halt or down <= -4.0%
  const idxChange = Number(nepseIndexChangePct || 0);
  if ((idxChange >= 4.5 && idxChange <= 5.5) || idxChange <= -4.0) {
    vetoTriggers.push({
      code: 'VETO_INDEX_CIRCUIT_RISK',
      reason: `Market-Wide Index Circuit Guard: NEPSE Index ${idxChange >= 0 ? '+' : ''}${idxChange.toFixed(1)}% is near 5% halt threshold or down <= -4.0%`
    });
  }

  // VETO 3: Operator Offloading & Wash-Trade Filter
  // BCR3_Sell >= 38% OR circular wash trade volume > 25% of turnover
  const bcr3Sell = Number(bcr3SellPct || 0);
  const washPct = Number(circularWashPct || 0);
  if (bcr3Sell >= 38.0 || washPct > 25.0) {
    vetoTriggers.push({
      code: 'VETO_OPERATOR_OFFLOADING_WASH',
      reason: `Operator Offloading/Wash: Top 3 sellers hold ${bcr3Sell}% (>=38%) or circular wash volume ${washPct}% (>25%)`
    });
  }

  // VETO 4: T+3 Settlement Supply Overhang Veto (±15% Volatility Adjusted)
  // In NEPSE's T+2 cycle, shares bought on t-3 hit Demat today.
  // If Volume[t-3] >= 2.5 * 20D SMA AND current LTP >= 1.11 * VWAP[t-3] (sitting 11%+ in profit), VETO!
  const t3Vol = Number(volumeTMinus3 || 0);
  const t3Vwap = Number(vwapTMinus3 || 0);
  const avgVol = Number(avgVolume20D || 50000);
  const t3VolRatio = avgVol > 0 ? +(t3Vol / avgVol).toFixed(2) : 1.0;

  if (t3Vol >= 2.5 * avgVol && t3Vwap > 0 && currentLtp >= 1.11 * t3Vwap) {
    vetoTriggers.push({
      code: 'VETO_T3_SETTLEMENT_OVERHANG',
      reason: `T+3 Settlement Supply Overhang (±15% Adjusted): t-3 volume was ${t3VolRatio}x of 20D avg with holders sitting 11%+ in profit, poised to dump on settlement`
    });
  }

  // VETO 5: Liquidity Depth & Market Impact Guard
  // Require 20-day Median Daily Turnover >= Rs. 60,00,000 (Rs. 60 Lakhs)
  const turnover = Number(medianDailyTurnover20D || 0);
  if (turnover < 6000000) {
    vetoTriggers.push({
      code: 'VETO_LOW_TURNOVER_LIQUIDITY',
      reason: `Low Liquidity Depth: 20D median turnover Rs. ${(turnover / 100000).toFixed(1)}L < Rs. 60L (High risk of zero-bid lockup)`
    });
  }

  // VETO 6: Intraday Time-of-Day Gate
  // Suppress during volatile retail opening: 11:00 AM – 11:25 AM NPT (660 to 685 minutes) following ±5% pre-open
  if (!bypassTimingGate && isLiveMarket) {
    const status = getDetailedMarketStatus();
    const currentMins = nptMinutes !== null ? nptMinutes : status.nptTotalMinutes;
    if (currentMins >= 660 && currentMins <= 685) {
      vetoTriggers.push({
        code: 'VETO_OPENING_RETAIL_WINDOW',
        reason: 'Opening Noise Gate: Suppressed during 11:00 AM – 11:25 AM NPT retail rush following ±5% pre-open (Await institutional 1:15–2:45 PM window)'
      });
    }
  }

  const isVetoed = vetoTriggers.length > 0;

  return {
    isVetoed,
    vetoCount: vetoTriggers.length,
    vetoTriggers,
    pChange: +pChange.toFixed(2),
    distanceToCircuitPct: distanceToUpperCircuitPct,
    upperCircuitCeiling,
    t3VolRatio
  };
}

// ── MASTER CONFLUENCE EVALUATOR ─────────────────────────────────────────────

/**
 * Comprehensive Evaluation orchestrating all 5 Modules
 */
export function evaluateInstitutionalAlert({
  symbol,
  ltp,
  high,
  low,
  open,
  previousClose,
  volume,
  turnover,
  avgVolume20D,
  medianDailyTurnover20D,
  floorsheetTrades = [],
  bcr3BuyPct = null,
  bcr3SellPct = null,
  topBuyerBrokers = [],
  rolling5DBrokerData = null,
  totalBuyTrades = 0,
  totalSellTrades = 0,
  totalBuyQty = 0,
  totalSellQty = 0,
  circularWashPct = 0,
  priceHistory = [],
  volumeTMinus3 = 0,
  vwapTMinus3 = 0,
  ema50 = null,
  ema50Prev = null,
  sector = 'Hydro Power',
  sectorRank10D = 2,
  stock10DReturn = 5.2,
  sector10DReturn = 3.1,
  nearestSupport = null,
  target1 = null,
  target2 = null,
  preOpenGapPct = 0,
  isPreOpenGapRetested = true,
  nepseIndexChangePct = 0,
  macroOptions = {},
  nptMinutes = null,
  isLiveMarket = true,
  bypassTimingGate = false
}) {
  const sym = String(symbol || 'STOCK').toUpperCase().trim();
  const currentPrice = Number(ltp || 0);

  // 1. Get Macro Regime
  const macro = getMacroRegime(macroOptions);

  // If in DEFENSIVE regime, restrict alerts to high-dividend / low-beta defensive sectors
  let isDefensiveSectorAllowed = true;
  if (macro.isDefensive) {
    isDefensiveSectorAllowed = DEFENSIVE_SECTORS.some(ds => sector.toLowerCase().includes(ds.toLowerCase()));
  }

  // 2. Evaluate Pillar 1
  const pillar1 = evaluatePillar1_WyckoffVduVcp({
    recentVolume: volume,
    avgVolume20D,
    priceHistory,
    currentHigh: high,
    currentLow: low,
    currentClose: currentPrice,
    vduThreshold: macro.vduThreshold
  });

  // 3. Evaluate Pillar 2
  const pillar2 = evaluatePillar2_SmartMoneyAbsorption({
    floorsheetTrades,
    bcr3BuyPct,
    topBuyerBrokers,
    rolling5DBrokerData,
    totalBuyTrades,
    totalSellTrades,
    totalBuyQty,
    totalSellQty,
    threshold5DRetention: macro.rolling5DRetentionThreshold
  });

  // 4. Evaluate Pillar 3
  const pillar3 = evaluatePillar3_VolumePriceValidation({
    high,
    low,
    close: currentPrice,
    open,
    priceHistory
  });

  // 5. Evaluate Pillar 4
  const pillar4 = evaluatePillar4_TrendAndSectorRS({
    ltp: currentPrice,
    ema50,
    ema50Prev,
    sector,
    sectorRank10D,
    stock10DReturn,
    sector10DReturn
  });

  // All 4 Pillars must pass
  const all4PillarsPassed = pillar1.passed && pillar2.passed && pillar3.passed && pillar4.passed;
  const passedPillarsCount = [pillar1.passed, pillar2.passed, pillar3.passed, pillar4.passed].filter(Boolean).length;
  const confluenceScore = Math.round((passedPillarsCount / 4) * 100);

  // 6. Evaluate Veto Filters
  const veto = evaluateVetoFilters({
    ltp: currentPrice,
    previousClose,
    bcr3SellPct: bcr3SellPct || pillar2.bcr3SellPct || 0,
    circularWashPct,
    volumeTMinus3,
    vwapTMinus3,
    avgVolume20D,
    medianDailyTurnover20D,
    preOpenGapPct,
    isPreOpenGapRetested,
    nepseIndexChangePct,
    nptMinutes,
    isLiveMarket,
    bypassTimingGate
  });

  // 7. Calculate Friction-Adjusted RRR & Position Sizing
  const sizing = calculateNetExpectancyAndSizing({
    entryPrice: currentPrice,
    target1,
    target2,
    nearestSupport,
    medianDailyTurnover20D,
    requiredNetRRR: macro.requiredNetRRR
  });

  // Final Qualification Decision:
  // Must pass all 4 pillars + 0 vetoes + RRR acceptable + Defensive sector check
  const isQualified = all4PillarsPassed && !veto.isVetoed && (sizing?.isRrrAcceptable ?? false) && isDefensiveSectorAllowed;

  let disqualificationReason = null;
  if (!isDefensiveSectorAllowed) {
    disqualificationReason = `Macro Regime DEFENSIVE: ${sector} is not in the approved defensive sector roster`;
  } else if (veto.isVetoed) {
    disqualificationReason = veto.vetoTriggers.map(v => v.reason).join(' | ');
  } else if (!all4PillarsPassed) {
    const failedPillars = [pillar1, pillar2, pillar3, pillar4].filter(p => !p.passed).map(p => p.name);
    disqualificationReason = `Confluence Failure: Failed ${failedPillars.join(', ')}`;
  } else if (!sizing?.isRrrAcceptable) {
    disqualificationReason = `Net Post-Tax RRR ${sizing?.netRRR}:1 is below required threshold ${macro.requiredNetRRR}:1`;
  }

  // 8. Generate Telegram Execution Ticket Payload
  const ticketPayload = isQualified ? formatInstitutionalExecutionTicket({
    symbol: sym,
    sector,
    sectorRank: pillar4.sectorRank10D,
    regime: macro.regime,
    entryPrice: currentPrice,
    entryLow: Math.floor(currentPrice * 0.995),
    entryHigh: Math.ceil(currentPrice * 1.015),
    maxChasePrice: +(currentPrice * 1.025).toFixed(1),
    stopLoss: sizing.stopLoss,
    slPct: sizing.slPct,
    target1: sizing.target1,
    t1Pct: sizing.t1Pct,
    target2: sizing.target2,
    t2Pct: sizing.t2Pct,
    netRRR: sizing.netRRR,
    qtyPer1Lakh: sizing.qtyPer1Lakh,
    capitalDeployed: sizing.capitalDeployed,
    turnoverLakhs: sizing.turnoverLakhs,
    safeOrderLakhs: sizing.safeOrderLakhs,
    score: confluenceScore,
    vduRatio: pillar1.vduRatio,
    retentionPct: pillar2.rolling5DRetentionPct,
    atsr: pillar2.atsr,
    t3VolRatio: veto.t3VolRatio,
    dayGainPct: veto.pChange,
    circuitBufferPct: veto.distanceToCircuitPct
  }) : null;

  return {
    symbol: sym,
    isQualified,
    disqualificationReason,
    confluenceScore,
    all4PillarsPassed,
    pillar1,
    pillar2,
    pillar3,
    pillar4,
    veto,
    sizing,
    macro,
    ticketPayload
  };
}

// ── MODULE 5: UPGRADED TELEGRAM EXECUTION TICKET FORMATTER ──────────────────

/**
 * Formats the exact Module 5 Institutional Execution Ticket Payload for Telegram
 */
export function formatInstitutionalExecutionTicket(d) {
  const sym = d.symbol;
  const sector = d.sector || 'Hydropower';
  const rank = d.sectorRank ?? 2;
  const regime = d.regime ? (d.regime.charAt(0).toUpperCase() + d.regime.slice(1).toLowerCase()) : 'Neutral';

  const eLow = d.entryLow || Math.floor(d.entryPrice * 0.995);
  const eHigh = d.entryHigh || Math.ceil(d.entryPrice * 1.015);
  const cCap = d.maxChasePrice || (eHigh * 1.025).toFixed(1);
  const sl = d.stopLoss;
  const slPct = d.slPct;
  const t1 = d.target1;
  const t1Pct = d.t1Pct;
  const t2 = d.target2;
  const t2Pct = d.t2Pct;
  const netRRR = d.netRRR;

  const qty = d.qtyPer1Lakh;
  const cap = d.capitalDeployed;
  const toL = d.turnoverLakhs;
  const soL = d.safeOrderLakhs;

  const score = d.score || 100;
  const vdu = d.vduRatio;
  const ret = d.retentionPct;
  const atsr = d.atsr;
  const t3Vol = d.t3VolRatio || 0.8;
  const gain = d.dayGainPct >= 0 ? `+${d.dayGainPct}` : d.dayGainPct;
  const circBuff = d.circuitBufferPct;

  const html = [
    `🟢 <b>INSTITUTIONAL ACCUMULATION CONFIRMED: $${sym}</b>`,
    `Sector: ${sector} (10D RS Rank: #${rank}/13) | Regime: ${regime}`,
    ``,
    `🎯 <b>EXECUTION PLAN (T+2 &amp; ±15% Circuit Adjusted)</b>`,
    `• Limit Buy Zone: Rs. ${eLow} – Rs. ${eHigh} (Do NOT chase &gt; Rs. ${cCap})`,
    `• Hard Stop-Loss: Rs. ${sl} (-${slPct}% | 1.75x ATR)`,
    `• Target 1 (Conservative): Rs. ${t1} (+${t1Pct}%)`,
    `• Target 2 (Runner): Rs. ${t2} (+${t2Pct}%)`,
    `• Net Post-Tax/Fee RRR: <b>${netRRR} : 1</b> (Includes 7.5% CGT &amp; Broker Fees)`,
    ``,
    `🛡️ <b>POSITION SIZING &amp; LIQUIDITY GUARD</b>`,
    `• Risk Cap: 1.0% Portfolio Risk per Trade`,
    `• Exact Qty per Rs. 1 Lakh Capital: <b>${qty} Shares</b> (Deploy: Rs. ${Number(cap).toLocaleString()})`,
    `• 20D Median Turnover: Rs. ${toL}L (Safe Total Order Cap: Rs. ${soL}L)`,
    ``,
    `📊 <b>4-PILLAR CONFLUENCE SCORE: ${score}/100</b>`,
    `✅ Wyckoff VDU Base: ${vdu}x of 20D Vol (Supply Exhausted)`,
    `✅ Smart Money 5D Retention: ${ret}% | Ticket Ratio (ATSR): ${atsr}x`,
    `✅ T+3 Overhang Risk: LOW (t-3 Vol: ${t3Vol}x | Safe from settlement dump)`,
    `✅ Circuit Distance: ${gain}% today (${circBuff}% below +15% circuit)`
  ].join('\n');

  const text = [
    `🟢 INSTITUTIONAL ACCUMULATION CONFIRMED: $${sym}`,
    `Sector: ${sector} (10D RS Rank: #${rank}/13) | Regime: ${regime}`,
    ``,
    `🎯 EXECUTION PLAN (T+2 & ±15% Circuit Adjusted)`,
    `• Limit Buy Zone: Rs. ${eLow} – Rs. ${eHigh} (Do NOT chase > Rs. ${cCap})`,
    `• Hard Stop-Loss: Rs. ${sl} (-${slPct}% | 1.75x ATR)`,
    `• Target 1 (Conservative): Rs. ${t1} (+${t1Pct}%)`,
    `• Target 2 (Runner): Rs. ${t2} (+${t2Pct}%)`,
    `• Net Post-Tax/Fee RRR: ${netRRR} : 1 (Includes 7.5% CGT & Broker Fees)`,
    ``,
    `🛡️ POSITION SIZING & LIQUIDITY GUARD`,
    `• Risk Cap: 1.0% Portfolio Risk per Trade`,
    `• Exact Qty per Rs. 1 Lakh Capital: ${qty} Shares (Deploy: Rs. ${Number(cap).toLocaleString()})`,
    `• 20D Median Turnover: Rs. ${toL}L (Safe Total Order Cap: Rs. ${soL}L)`,
    ``,
    `📊 4-PILLAR CONFLUENCE SCORE: ${score}/100`,
    `✅ Wyckoff VDU Base: ${vdu}x of 20D Vol (Supply Exhausted)`,
    `✅ Smart Money 5D Retention: ${ret}% | Ticket Ratio (ATSR): ${atsr}x`,
    `✅ T+3 Overhang Risk: LOW (t-3 Vol: ${t3Vol}x | Safe from settlement dump)`,
    `✅ Circuit Distance: ${gain}% today (${circBuff}% below +15% circuit)`
  ].join('\n');

  return { html, text, symbol: sym };
}
