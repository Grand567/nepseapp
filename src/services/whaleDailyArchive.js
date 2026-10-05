// src/services/whaleDailyArchive.js
/**
 * Daily Top 5 Whale Archive & Consecutive Alert Tracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically records, timestamps, and preserves daily Top 5 Slow Unusual
 * Accumulation and Top 5 Unusual Distribution stocks across NEPSE trading sessions.
 *
 * Provides:
 * 1. Persistent multi-day storage in localStorage ('drabyashree_whale_daily_archive')
 * 2. Multi-session consecutive accumulation counters (Day 1, Day 2 Prime Entry, Pause Day)
 * 3. Pre-dump exit countdowns (Day 1 Distribution: 2-3 Day Exit Window)
 * 4. Outcome & return tracking (LTP at signal vs current LTP)
 */

import { calculateBrokerConcentration } from '../utils/accumulationDistributionEngine.ts';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse.js';

const STORAGE_KEY = 'drabyashree_whale_daily_archive';
const MAX_ARCHIVE_DAYS = 30; // Keep up to 30 trading sessions

// Module-level cumulative trade vault across multi-scan session queries (prevents morning trade eviction)
// Maps: marketDate (YYYY-MM-DD) -> Map<tradeKey, tradeObject>
const SESSION_FLOORSHEET_REGISTRY = new Map();

// Fast static lookup map for sharesOut and sector
const UNIVERSE_MAP = new Map();
if (Array.isArray(NEPSE_UNIVERSE)) {
  NEPSE_UNIVERSE.forEach(u => {
    if (u?.symbol) UNIVERSE_MAP.set(String(u.symbol).toUpperCase().trim(), u);
  });
}

export function getStoredWhaleArchive() {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[WhaleArchive] Failed to parse stored archive:', e);
    return [];
  }
}

export function saveStoredWhaleArchive(archive) {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return;
  }
  try {
    const trimmed = (archive || []).slice(0, MAX_ARCHIVE_DAYS);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[WhaleArchive] Failed to save archive:', e);
  }
}

/**
 * Exports current whale archive as formatted JSON string for mobile/cloud backup.
 */
export function exportWhaleArchiveJSON() {
  const archive = getStoredWhaleArchive();
  return JSON.stringify(archive, null, 2);
}

/**
 * Imports and validates an external whale archive JSON backup.
 */
export function importWhaleArchiveJSON(jsonString) {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, error: 'Empty or invalid JSON data.' };
    }
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Archive data must be an array of daily snapshots.' };
    }
    const valid = parsed.filter(s => s && s.date && Array.isArray(s.topAccumulation) && Array.isArray(s.topDistribution));
    if (valid.length === 0) {
      return { success: false, error: 'No valid daily snapshots found in backup.' };
    }
    saveStoredWhaleArchive(valid);
    return { success: true, count: valid.length };
  } catch (err) {
    return { success: false, error: err?.message || 'JSON parse error.' };
  }
}

/**
 * Builds or updates the Daily Whale Snapshot from live market stocks and floorsheet trades.
 */
export function captureDailyWhaleSnapshot(stocks = [], floorsheet = [], customDate = null) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return null;
  }

  // Determine market business date from floorsheet or fallback to today's date
  let marketDate = customDate;
  if (!marketDate && Array.isArray(floorsheet) && floorsheet.length > 0) {
    const firstWithDate = floorsheet.find(t => t.businessDate || t.date || t.tradeDate);
    if (firstWithDate) {
      marketDate = String(firstWithDate.businessDate || firstWithDate.date || firstWithDate.tradeDate).split('T')[0];
    }
  }
  if (!marketDate) {
    marketDate = new Date().toISOString().split('T')[0];
  }

  const existingArchive = getStoredWhaleArchive();
  const previousSnapshot = existingArchive.find(s => s.date !== marketDate);

  // Merge incoming floorsheet into cumulative session registry to prevent morning trade eviction (Loophole 1 Fix)
  if (!SESSION_FLOORSHEET_REGISTRY.has(marketDate)) {
    SESSION_FLOORSHEET_REGISTRY.set(marketDate, new Map());
  }
  const sessionTradesMap = SESSION_FLOORSHEET_REGISTRY.get(marketDate);
  if (Array.isArray(floorsheet) && floorsheet.length > 0) {
    floorsheet.forEach((t, idx) => {
      const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
      if (!sym) return;
      const bBroker = String(t.buyerMemberId || t.buyerBroker || t.buyer || '').replace(/^0+/, '').trim();
      const sBroker = String(t.sellerMemberId || t.sellerBroker || t.seller || '').replace(/^0+/, '').trim();
      const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);
      const rate = Number(t.contractRate || t.rate || t.price || 0);
      const key = t.contractId ? String(t.contractId) : `${sym}_${bBroker}_${sBroker}_${qty}_${rate}_${t.tradeTime || idx}`;
      sessionTradesMap.set(key, t);
    });
  }

  // Group all cumulative session trades by symbol (guarantees morning trades are never evicted!)
  const fsMap = new Map();
  sessionTradesMap.forEach(t => {
    const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
    if (!sym) return;
    if (!fsMap.has(sym)) fsMap.set(sym, []);
    fsMap.get(sym).push(t);
  });

  // Find existing snapshot today to preserve morning peak metrics and entry prices
  const existingToday = existingArchive.find(s => s.date === marketDate);

  // Analyze all liquid stocks
  const evaluated = [];
  for (const s of stocks) {
    const sym = String(s.symbol || '').toUpperCase().trim();
    if (!sym || !s.ltp) continue;
    // Skip mutual funds and debentures for whale equity tracking
    if (sym.includes('D8') || sym.includes('D9') || sym.endsWith('MF') || sym.endsWith('BS')) continue;

    const trades = fsMap.get(sym) || [];
    const conc = calculateBrokerConcentration(trades, sym, s);

    // 1. Single Top Buyer Net Absorption & 2. Aggregate Top 3 Syndicate Net Absorption Guard
    const topBuyer = conc.topBuyerBrokers?.[0];
    let netAbsorptionRatio = 1.0;
    if (topBuyer && topBuyer.volume > 0) {
      const buyerNetQty = Number(topBuyer.netQty !== undefined ? topBuyer.netQty : (conc.topNetAccumulators?.[0]?.netQty ?? topBuyer.volume));
      netAbsorptionRatio = Number((Math.max(0, buyerNetQty) / topBuyer.volume).toFixed(2));
    }

    const top3Buyers = (conc.topBuyerBrokers || []).slice(0, 3);
    const top3GrossBuy = top3Buyers.reduce((acc, b) => acc + (b.volume || 0), 0);
    const top3NetBuy = top3Buyers.reduce((acc, b) => {
      const net = b.netQty !== undefined ? b.netQty : b.volume;
      return acc + Math.max(0, net);
    }, 0);
    const top3NetAbsorptionRatio = top3GrossBuy > 0 ? Number((top3NetBuy / top3GrossBuy).toFixed(2)) : 1.0;

    // Churn detected when:
    // A) Single top broker has high gross volume but low net absorption (< 35%)
    // B) Top 3 syndicate desks have substantial gross volume (>= 1,500) but low collective net absorption (< 40%)
    const isSingleDeskChurn = Boolean(topBuyer && topBuyer.volume >= 500 && netAbsorptionRatio < 0.35);
    const isSyndicateChurn = Boolean(top3GrossBuy >= 1500 && top3NetAbsorptionRatio < 0.40);
    const isWashChurn = isSingleDeskChurn || isSyndicateChurn;

    // 3. Execution Dispersion & Block Trade Anomaly Check
    let maxSingleTradeQty = 0;
    let totalFloorsheetQty = 0;
    trades.forEach(t => {
      const q = Number(t.contractQuantity || t.quantity || t.qty || 0);
      totalFloorsheetQty += q;
      if (q > maxSingleTradeQty) maxSingleTradeQty = q;
    });
    const singleTradeConcentrationPct = totalFloorsheetQty > 0 ? Number(((maxSingleTradeQty / totalFloorsheetQty) * 100).toFixed(1)) : 0;
    // Anomaly: 1-2 huge lump transactions dominating the entire volume (e.g. negotiated promoter block deal)
    const isBlockTradeAnomaly = Boolean(
      (maxSingleTradeQty >= 50000 && trades.length <= 2) ||
      (totalFloorsheetQty >= 25000 && singleTradeConcentrationPct >= 80.0 && trades.length >= 2) ||
      (s.isBlockTrade === true)
    );

    // Upper circuit (+15%) ceiling proximity guard (SEBON Fourth Amendment 15% rule)
    const prevClose = Number(s.previousClose || s.prevClose || (s.ltp ? s.ltp / (1 + (s.pChange || 0) / 100) : 0));
    const upperCeiling = prevClose > 0 ? +(prevClose * 1.15).toFixed(1) : 0;
    const isNearUpperCircuit = upperCeiling > 0 && s.ltp >= upperCeiling * 0.985; // within 1.5% of +15% limit

    // 4. Intraday High/Low/Open/Close Range and Upper Shadow Rejection Check
    const highPrice = Number(s.high || s.highPrice || s.maxPrice || s.ltp || 0);
    const lowPrice = Number(s.low || s.lowPrice || s.minPrice || s.ltp || 0);
    const openPrice = Number(s.open || s.openPrice || prevClose || s.ltp || 0);
    const ltpPrice = Number(s.ltp || 0);

    const intradayRange = highPrice - lowPrice;
    const intradayRangePct = lowPrice > 0 ? Number(((intradayRange / lowPrice) * 100).toFixed(2)) : 0;
    const upperShadow = highPrice > 0 ? Math.max(0, highPrice - Math.max(openPrice, ltpPrice)) : 0;
    const upperShadowPct = intradayRange > 0 ? Number(((upperShadow / intradayRange) * 100).toFixed(1)) : 0;

    // Severe supply rejection: Intraday range was wide (>= 2.5%) and upper shadow >= 55%
    // (Stock pumped intraday, met heavy seller dump, and fell back near session lows)
    const isUpperShadowDump = Boolean(intradayRangePct >= 2.5 && upperShadowPct >= 55.0);

    // ── Float Normalization & Dynamic Sector Turnover Calibration (Loophole 3 Fix) ──
    const uInfo = UNIVERSE_MAP.get(sym) || {};
    const listedShares = Number(s.listedShares || s.totalListedShares || (uInfo.sharesOut ? uInfo.sharesOut * 1000000 : 0)) || 10000000;
    const sector = s.sector || uInfo.sector || 'Equities';
    const secLower = sector.toLowerCase();

    let publicFloatFraction = 0.35;
    if (secLower.includes('commercial')) publicFloatFraction = 0.40;
    else if (secLower.includes('development') || secLower.includes('finance')) publicFloatFraction = 0.40;
    else if (secLower.includes('hydro')) publicFloatFraction = 0.35;
    else if (secLower.includes('microfinance')) publicFloatFraction = 0.35;
    else if (secLower.includes('insurance')) publicFloatFraction = 0.30;
    else if (secLower.includes('manufacturing')) publicFloatFraction = 0.25;
    else if (secLower.includes('hotel')) publicFloatFraction = 0.30;

    const estFloatShares = Math.max(500000, Math.round(listedShares * publicFloatFraction));
    const floatTurnoverPct = estFloatShares > 0 ? Number(((Number(s.volume || 0) / estFloatShares) * 100).toFixed(3)) : 0;

    // Dynamic sector-calibrated turnover floor (Rs.)
    let dynamicTurnoverFloor = 3000000; // Rs. 30 Lakh default
    if (secLower.includes('commercial bank') || secLower.includes('commercial')) {
      dynamicTurnoverFloor = 15000000; // Rs. 1.5 Crore minimum for commercial bank giants
    } else if (secLower.includes('development bank') || secLower.includes('insurance')) {
      dynamicTurnoverFloor = 6000000;  // Rs. 60 Lakhs
    } else if (secLower.includes('hydro') || secLower.includes('microfinance')) {
      dynamicTurnoverFloor = 2500000;  // Rs. 25 Lakhs
    }
    // For micro-caps (< 20 Lakh float shares, e.g. ANLB, small hydros):
    if (estFloatShares < 2000000) {
      dynamicTurnoverFloor = Math.min(dynamicTurnoverFloor, 1500000); // Rs. 15 Lakhs for micro-caps
    }

    // Preserve morning peak concentration if logged earlier today
    const todayPrevAcc = existingToday?.topAccumulation?.find(p => p.symbol === sym);
    const bcr3Buy = Math.max(conc.bcr3BuyPct || 0, todayPrevAcc?.bcr3Buy || 0);
    const tradesCount = Math.max(trades.length, todayPrevAcc?.tradesCount || 0);

    evaluated.push({
      symbol: sym,
      companyName: s.companyName || s.name || sym,
      sector,
      ltp: Number(s.ltp || 0),
      prevClose,
      pChange: Number(s.pChange || 0),
      turnover: Number(s.turnover || 0),
      volume: Number(s.volume || 0),
      estFloatShares,
      floatTurnoverPct,
      dynamicTurnoverFloor,
      tradesCount,
      bcr3Buy,
      bcr5Buy: conc.bcr5BuyPct || 0,
      bcr3Sell: conc.bcr3SellPct || 0,
      topBuyers: conc.topBuyerBrokers?.slice(0, 3).map(b => `#${b.broker} (${b.pct.toFixed(1)}%)`).join(', ') || 'Floor pending',
      topSellers: conc.topSellerBrokers?.slice(0, 3).map(b => `#${b.broker} (${b.pct.toFixed(1)}%)`).join(', ') || 'Floor pending',
      topNetAccumulators: conc.topNetAccumulators?.slice(0, 2).map(b => `#${b.broker} (+${b.netQty.toLocaleString()} sh)`).join(', ') || '',
      topNetDistributors: conc.topNetDistributors?.slice(0, 2).map(b => `#${b.broker} (${b.netQty.toLocaleString()} sh)`).join(', ') || '',
      smartMoneyBias: conc.smartMoneyBias || 'Neutral',
      tradeSizeRatio: conc.tradeSizeRatio || 1.0,
      netAbsorptionRatio,
      top3NetAbsorptionRatio,
      isWashChurn,
      isBlockTradeAnomaly,
      singleTradeConcentrationPct,
      isNearUpperCircuit,
      isUpperShadowDump,
      upperShadowPct,
      intradayRangePct,
      stealthScore: s.stealthAccumulation || 50,
      dumpRiskScore: s.pumpDumpRiskScore || 40
    });
  }

  // Check trading session continuity across weekends (e.g. Fri -> Mon is 3 calendar days)
  let isPreviousSessionContinuous = true;
  if (previousSnapshot && previousSnapshot.date) {
    const diffMs = Math.abs(new Date(marketDate).getTime() - new Date(previousSnapshot.date).getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      isPreviousSessionContinuous = false;
    }
  }

  // 1. FILTER TOP 5 SLOW UNUSUAL ACCUMULATION
  // Criteria:
  // - Tight price action: -1.5% to +2.5% (stealth accumulation before markup)
  // - Verified broker concentration: BCR3 >= 36% (or >= 32% if heavy float turnover >= 0.6%)
  // - Institutional liquidity: meets dynamic sector floor OR float turnover >= 0.30%
  // - Shielded against: +15% upper circuit traps, float disparity, wash churn, block trade anomalies, and upper shadow dumps
  const accPool = evaluated
    .filter(s => {
      const tightPrice = s.pChange >= -1.5 && s.pChange <= 2.5;

      // Concentration is MANDATORY for whale accumulation (turnover alone cannot bypass concentration!)
      const hasWhaleConcentration = s.bcr3Buy >= 36 || (s.bcr3Buy >= 32 && s.floatTurnoverPct >= 0.60);

      // Institutional liquidity verification:
      const isInstitutionalTurnover = s.turnover >= s.dynamicTurnoverFloor || s.floatTurnoverPct >= 0.30;

      const highInterest = hasWhaleConcentration && isInstitutionalTurnover;
      const notCircuitTrap = !s.isNearUpperCircuit;
      const notWashChurn = !s.isWashChurn;
      const notBlockAnomaly = !s.isBlockTradeAnomaly;
      const notIntradayDump = !s.isUpperShadowDump;

      return tightPrice && highInterest && notCircuitTrap && notWashChurn && notBlockAnomaly && notIntradayDump;
    })
    .sort((a, b) => {
      // Prioritize verified concentration, then float turnover, then gross turnover
      if (b.bcr3Buy >= 40 && a.bcr3Buy < 40) return 1;
      if (a.bcr3Buy >= 40 && b.bcr3Buy < 40) return -1;
      if (b.bcr3Buy !== a.bcr3Buy) return b.bcr3Buy - a.bcr3Buy;
      if (b.floatTurnoverPct !== a.floatTurnoverPct) return b.floatTurnoverPct - a.floatTurnoverPct;
      return b.turnover - a.turnover;
    });

  const topAccumulation = accPool.slice(0, 5).map(stock => {
    // Check if appeared in previous session (with weekend continuity)
    const prevEntry = isPreviousSessionContinuous ? previousSnapshot?.topAccumulation?.find(p => p.symbol === stock.symbol) : null;
    let consecutiveDays = 1;
    let signalBadge = '🟢 Day 1 Early Detection';
    let alertType = 'DAY_1';

    if (prevEntry) {
      consecutiveDays = (prevEntry.consecutiveDays || 1) + 1;
      if (consecutiveDays === 2) {
        signalBadge = '🔥 Day 2 Multi-Session Absorption (Prime Entry)';
        alertType = 'DAY_2_PRIME';
      } else if (consecutiveDays >= 3) {
        signalBadge = `🚀 Day ${consecutiveDays} Cornering (Ready for Markup)`;
        alertType = 'MULTI_DAY_CORNER';
      }
    } else if (previousSnapshot && isPreviousSessionContinuous) {
      // Check if it appeared in recent sessions and today is a Wyckoff volume dry-up pause
      const olderSnapshots = existingArchive.slice(1, 4);
      let priorEntry = null;
      for (const snap of olderSnapshots) {
        const found = snap.topAccumulation?.find(p => p.symbol === stock.symbol);
        if (found) {
          priorEntry = found;
          break;
        }
      }
      if (priorEntry && (stock.volume <= (priorEntry.volume * 0.75) || priorEntry.volume === 0)) {
        signalBadge = '⏳ Pause Day Supply Test (Dip Entry)';
        alertType = 'PAUSE_DAY_DIP';
      }
    }

    // Preserve morning entry LTP if already logged today
    const loggedToday = existingToday?.topAccumulation?.find(p => p.symbol === stock.symbol);
    const entryLtp = loggedToday?.entryLtp || stock.ltp;

    return {
      ...stock,
      consecutiveDays,
      signalBadge,
      alertType,
      entryLtp,
      flaggedDate: marketDate
    };
  });

  // 2. FILTER TOP 5 UNUSUAL DISTRIBUTION
  // Criteria: Stalling/falling price, high seller concentration (BCR3 >= 36%), and heavy distribution turnover
  const distPool = evaluated
    .filter(s => {
      const isHeavyDistTurnover = s.turnover >= s.dynamicTurnoverFloor * 1.2 || s.floatTurnoverPct >= 0.45;
      const hasDistConcentration = s.bcr3Sell >= 36 || (s.bcr3Sell >= 32 && s.floatTurnoverPct >= 0.60);
      const isDumpStructure = s.tradeSizeRatio <= 1.15 || s.bcr3Sell > s.bcr3Buy || s.pChange < 0 || s.isUpperShadowDump;
      const meetsDistCriteria = hasDistConcentration && isHeavyDistTurnover && isDumpStructure;
      return meetsDistCriteria;
    })
    .sort((a, b) => {
      if (b.bcr3Sell >= 40 && a.bcr3Sell < 40) return 1;
      if (a.bcr3Sell >= 40 && b.bcr3Sell < 40) return -1;
      if (b.bcr3Sell !== a.bcr3Sell) return b.bcr3Sell - a.bcr3Sell;
      if (b.floatTurnoverPct !== a.floatTurnoverPct) return b.floatTurnoverPct - a.floatTurnoverPct;
      return b.turnover - a.turnover;
    });

  const topDistribution = distPool.slice(0, 5).map(stock => {
    const prevEntry = isPreviousSessionContinuous ? previousSnapshot?.topDistribution?.find(p => p.symbol === stock.symbol) : null;
    let distributionDay = 1;
    let signalBadge = '⚠️ Pre-Dump Window: 2–3 Days to Exit';
    let exitWindowNote = 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.';
    let alertType = 'DIST_DAY_1';

    if (prevEntry) {
      distributionDay = (prevEntry.distributionDay || 1) + 1;
      signalBadge = `🚨 Day ${distributionDay} Aggressive Distribution (Urgent Exit)`;
      exitWindowNote = `Day ${distributionDay} consecutive selling by top desks. High T+2 trap risk! Stand down or liquidate.`;
      alertType = 'DIST_CONSECUTIVE';
    }

    // Preserve morning flagged LTP if already logged today
    const loggedToday = existingToday?.topDistribution?.find(p => p.symbol === stock.symbol);
    const flaggedLtp = loggedToday?.flaggedLtp || stock.ltp;

    return {
      ...stock,
      distributionDay,
      signalBadge,
      exitWindowNote,
      alertType,
      flaggedLtp,
      flaggedDate: marketDate
    };
  });

  const newSnapshot = {
    date: marketDate,
    timestamp: Date.now(),
    totalStocksScanned: evaluated.length,
    topAccumulation,
    topDistribution
  };

  // Upsert into archive
  const updatedArchive = [
    newSnapshot,
    ...existingArchive.filter(s => s.date !== marketDate)
  ].sort((a, b) => b.date.localeCompare(a.date));

  saveStoredWhaleArchive(updatedArchive);
  return newSnapshot;
}

/**
 * Calculates real-time performance tracking for all past archived signals
 * by comparing the flagged price against current live LTPs.
 */
export function calculateArchivePerformance(snapshot, liveStocksMap = {}) {
  if (!snapshot) return { accumulationTrack: [], distributionTrack: [] };

  const accumulationTrack = (snapshot.topAccumulation || []).map(item => {
    const live = liveStocksMap[item.symbol];
    const currentLtp = live ? Number(live.ltp || live.closePrice || item.ltp) : item.ltp;
    const entryPrice = item.entryLtp || item.ltp;
    const returnPct = entryPrice > 0 ? Number((((currentLtp - entryPrice) / entryPrice) * 100).toFixed(2)) : 0;

    return {
      ...item,
      currentLtp,
      entryPrice,
      returnPct,
      isProfitable: returnPct > 0,
      isFlat: returnPct === 0
    };
  });

  const distributionTrack = (snapshot.topDistribution || []).map(item => {
    const live = liveStocksMap[item.symbol];
    const currentLtp = live ? Number(live.ltp || live.closePrice || item.ltp) : item.ltp;
    const flaggedPrice = item.flaggedLtp || item.ltp;
    const dropPct = flaggedPrice > 0 ? Number((((flaggedPrice - currentLtp) / flaggedPrice) * 100).toFixed(2)) : 0;

    return {
      ...item,
      currentLtp,
      flaggedPrice,
      dropPct, // Positive dropPct means price fell (dump confirmed, loss avoided!)
      dumpConfirmed: dropPct > 0
    };
  });

  return {
    date: snapshot.date,
    accumulationTrack,
    distributionTrack
  };
}
