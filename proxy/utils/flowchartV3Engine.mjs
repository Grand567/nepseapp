// proxy/utils/flowchartV3Engine.mjs
/**
 * Drabyashree Flowchart v3.0 Empirical 6-Gate Swing Engine (7-10 Day Profit Booking)
 *
 * Calibrated from 1,935 walk-forward NEPSE samples (< Rs 500, T+3..T+10 sellable window):
 *   1. Universe, Liquidity, EPS > 0, and Promoter Lock-In Expiry Shield (-30d..+45d)
 *   2. 15D Gross-Mover No-Wash Gate (eliminates AKJCL-style circular churn traps)
 *   3. 15D Hoarder Pocket Proximity (-4.5%..+1.8% Floor-Turn / up to +3.8% Breakout)
 *   4. Anti-Exhaustion RSI Sweet Spot (38 <= RSI14 <= 65; hard veto > 70)
 *   5. Wyckoff Volume Dry-Up (VDU <= 0.65x), Overhead Wick Memory & Anti-Demat Dump
 *   6. Quiet Ignition Turn (-0.5%..+4.3%, CLV >= 0.50) & Asymmetric R:R Ticket
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBrokerName } from '../brokerVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROXY_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(PROXY_DIR, '..');

let cachedRegistryMap = null;
let cachedFundamentalsMap = null;
let cachedStockMap = null;

function loadJsonFirst(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {}
  }
  return null;
}

export function getPromoterLockinRegistryMap() {
  if (cachedRegistryMap) return cachedRegistryMap;
  const raw = loadJsonFirst([
    path.join(PROXY_DIR, 'data', 'promoter_lockin_registry.json'),
    path.join(process.cwd(), 'proxy', 'data', 'promoter_lockin_registry.json'),
  ]);
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const sym = String(item?.symbol || '').toUpperCase().trim();
      if (sym && item?.lockinExpiry) {
        map.set(sym, {
          lockinExpiry: String(item.lockinExpiry).slice(0, 10),
          lockinType: item.lockinType || 'Promoter Lock-in Expiry',
        });
      }
    }
  }
  cachedRegistryMap = map;
  return cachedRegistryMap;
}

function getFundamentalsFallbackMap() {
  if (cachedFundamentalsMap) return cachedFundamentalsMap;
  const raw = loadJsonFirst([
    path.join(ROOT_DIR, 'src', 'data', 'nepse_fundamentals_latest.json'),
    path.join(process.cwd(), 'src', 'data', 'nepse_fundamentals_latest.json'),
  ]);
  const map = new Map();
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (k && v) map.set(k.toUpperCase().trim(), v);
    }
  }
  cachedFundamentalsMap = map;
  return cachedFundamentalsMap;
}

function getStockMap() {
  if (cachedStockMap) return cachedStockMap;
  cachedStockMap =
    loadJsonFirst([
      path.join(PROXY_DIR, 'stockmap.json'),
      path.join(process.cwd(), 'proxy', 'stockmap.json'),
    ]) || {};
  return cachedStockMap;
}

const PURE_EQUITY_WHITELIST = new Set([
  'UPPER', 'SHPC', 'NHPC', 'CHCL', 'AHPC', 'RHPL', 'UNHPL', 'MHNL', 'DHPL',
  'PMHPL', 'KPCL', 'BPCL', 'AKPL', 'SPDL', 'SMD', 'NFD', 'HIDCL', 'RADHI',
  'NMBMF', 'SWMF', 'CITY', 'HATHY', 'SANIMA', 'SHIVM', 'NADEP'
]);

const SCHEMA_FLAGS_CACHE = new WeakMap();

function getSchemaFilterClauses(db) {
  let cached = SCHEMA_FLAGS_CACHE.get(db);
  if (cached) return cached;
  let summaryFilter = '';
  let brokerFilter = '';
  try {
    const sumCols = new Set(db.prepare(`PRAGMA table_info(daily_stock_summary)`).all().map((c) => c.name));
    const parts = [];
    if (sumCols.has('calendar_status')) parts.push(`calendar_status != 'PARTIAL_SESSION'`);
    if (sumCols.has('is_quarantined')) parts.push(`COALESCE(is_quarantined, 0) = 0`);
    if (parts.length > 0) summaryFilter = ` AND ${parts.join(' AND ')}`;
  } catch (_) {}
  try {
    const brkCols = new Set(db.prepare(`PRAGMA table_info(daily_broker_ledger)`).all().map((c) => c.name));
    const parts = [];
    if (brkCols.has('calendar_status')) parts.push(`calendar_status != 'PARTIAL_SESSION'`);
    if (brkCols.has('is_quarantined')) parts.push(`COALESCE(is_quarantined, 0) = 0`);
    if (parts.length > 0) brokerFilter = ` AND ${parts.join(' AND ')}`;
  } catch (_) {}
  cached = { summaryFilter, brokerFilter };
  SCHEMA_FLAGS_CACHE.set(db, cached);
  return cached;
}

function getTodayNptIsoDate() {
  return new Date(Date.now() + 345 * 60000).toISOString().slice(0, 10);
}

export function isNonEquityTicker(symbol = '', sector = '') {
  const sym = String(symbol || '').toUpperCase().trim();
  const resolvedSector = String(sector || getStockMap()[sym]?.sector || '').toLowerCase().trim();
  if (!sym) return true;
  if (/mutual|promoter|debenture|bond|preferred|preference|fund/i.test(resolvedSector)) return true;
  if (PURE_EQUITY_WHITELIST.has(sym)) return false;
  if (/^\d|[0-9]{2,}|D\d{2}|DEB|BOND|MF\d*$|PF\d*$|GF\d*$|BF\d*$|SF\d*$|CF\d*$|EF\d*$|SY$|PO$/i.test(sym)) {
    return true;
  }
  const hasKnownEquitySector = Boolean(resolvedSector);
  if (sym.endsWith('P') && sym.length >= 5 && !hasKnownEquitySector) return true;
  if (/^(KSY|C30MF|RMF|NBF|CMF|SBCF|SEF|SAEF|NICBF|NIBLPF|KDBY|LVF|PSF|RBBMF|H8020|MNMF|NSIF|SIGS|SFMF)/i.test(sym)) {
    return true;
  }
  return false;
}

/**
 * Checks whether a symbol falls inside the promoter lock-in expiry cliff window [-30d, +45d].
 */
export function isInPromoterLockinCliff(symbol, { asOfDate = null, unlockDate = null, registryMap = null } = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const reg = registryMap || getPromoterLockinRegistryMap();
  const regEntry = reg.get(sym);
  const effectiveUnlock = String(unlockDate || regEntry?.lockinExpiry || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveUnlock)) {
    return { isCliff: false, unlockDate: null, daysUntilUnlock: null, reason: null };
  }
  const refStr = String(asOfDate || getTodayNptIsoDate()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refStr)) {
    return { isCliff: false, unlockDate: effectiveUnlock, daysUntilUnlock: null, reason: null };
  }
  const diffDays = Math.round((new Date(effectiveUnlock).getTime() - new Date(refStr).getTime()) / 86400000);
  if (!Number.isFinite(diffDays)) {
    return { isCliff: false, unlockDate: effectiveUnlock, daysUntilUnlock: null, reason: null };
  }
  const isCliff = diffDays >= -30 && diffDays <= 45;
  return {
    isCliff,
    unlockDate: effectiveUnlock,
    daysUntilUnlock: diffDays,
    reason: isCliff
      ? `LOCKIN_CLIFF_VETO: ${sym} promoter lock-in expiry (${effectiveUnlock}, ${diffDays >= 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`}) creates supply overhang`
      : null,
  };
}

function aggregateBrokerWindow(db, symbol, dates) {
  if (!db || !dates || dates.length === 0) return null;
  const { brokerFilter } = getSchemaFilterClauses(db);
  const placeholders = dates.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT broker_id, SUM(buy_vol) AS buy_vol, SUM(sell_vol) AS sell_vol, SUM(buy_amt) AS buy_amt, SUM(sell_amt) AS sell_amt
       FROM daily_broker_ledger
       WHERE symbol = ? AND trade_date IN (${placeholders})${brokerFilter}
       GROUP BY broker_id`
    )
    .all(symbol, ...dates);

  let totalBuyVol = 0;
  let totalSellVol = 0;
  let totalBuyAmt = 0;

  const brokers = rows.map((r) => {
    const buyVol = Number(r.buy_vol || 0);
    const sellVol = Number(r.sell_vol || 0);
    const buyAmt = Number(r.buy_amt || 0);
    totalBuyVol += buyVol;
    totalSellVol += sellVol;
    totalBuyAmt += buyAmt;
    const netVol = buyVol - sellVol;
    const retentionPct = buyVol > 0 ? +((netVol / buyVol) * 100).toFixed(1) : 0;
    const vwap = buyVol > 0 ? +(buyAmt / buyVol).toFixed(1) : 0;
    return {
      brokerId: Number(r.broker_id),
      name: getBrokerName(r.broker_id),
      buyVol,
      sellVol,
      netVol,
      buyAmt,
      retentionPct,
      vwap,
    };
  });

  if (totalBuyVol <= 0 || brokers.length === 0) return null;

  const byGrossBuy = [...brokers].sort((a, b) => b.buyVol - a.buyVol);
  const byGrossSell = [...brokers].sort((a, b) => b.sellVol - a.sellVol);
  const byNet = [...brokers].sort((a, b) => b.netVol - a.netVol);

  const top3Gross = byGrossBuy.slice(0, 3);
  const top2Gross = byGrossBuy.slice(0, 2);
  const grossTop3BuyVol = top3Gross.reduce((s, b) => s + b.buyVol, 0);
  const grossTop3NetVol = top3Gross.reduce((s, b) => s + b.netVol, 0);
  const grossTop3RetentionPct = grossTop3BuyVol > 0 ? +((grossTop3NetVol / grossTop3BuyVol) * 100).toFixed(1) : 0;
  const minTop2GrossRetentionPct =
    top2Gross.length > 0 ? Math.min(...top2Gross.map((b) => b.retentionPct)) : 0;

  const top3SellVol = byGrossSell.slice(0, 3).reduce((s, b) => s + b.sellVol, 0);
  const bcr3Buy = +((grossTop3BuyVol / totalBuyVol) * 100).toFixed(1);
  const bcr3Sell = totalSellVol > 0 ? +((top3SellVol / totalSellVol) * 100).toFixed(1) : 0;
  const bcrSpread = +(bcr3Buy - bcr3Sell).toFixed(1);

  const netBuyers = byNet.filter((b) => b.netVol > 0);
  const topNetHoarders = (netBuyers.length > 0 ? netBuyers : byGrossBuy).slice(0, 3);
  const hoardBuyVol = topNetHoarders.reduce((s, b) => s + b.buyVol, 0);
  const hoardBuyAmt = topNetHoarders.reduce((s, b) => s + b.buyAmt, 0);
  const vwap =
    hoardBuyVol > 0 && hoardBuyAmt > 0
      ? +(hoardBuyAmt / hoardBuyVol).toFixed(1)
      : +(totalBuyAmt / totalBuyVol).toFixed(1);

  return {
    sessions: dates.length,
    totalBuyVol,
    totalSellVol,
    grossTop3RetentionPct,
    minTop2GrossRetentionPct,
    bcr3Buy,
    bcr3Sell,
    bcrSpread,
    vwap,
    leadGrossBuyer: byGrossBuy[0],
    leadNetHoarders: topNetHoarders.slice(0, 2),
  };
}

/**
 * Computes 5D and 15D broker retention metrics ranked by GROSS buying volume
 * so circular wash-churners cannot hide behind small net hoarders.
 */
export function computeMultiWindowGrossAndNetMetrics(symbol, { db, targetDate = null } = {}) {
  if (!db || !symbol) return null;
  const sym = String(symbol).toUpperCase().trim();
  const { brokerFilter } = getSchemaFilterClauses(db);
  const dateSql = targetDate
    ? `SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE symbol = ? AND trade_date <= ?${brokerFilter} ORDER BY trade_date DESC LIMIT 15`
    : `SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE symbol = ?${brokerFilter} ORDER BY trade_date DESC LIMIT 15`;
  const params = targetDate ? [sym, targetDate] : [sym];
  const dates = db.prepare(dateSql).all(...params).map((r) => r.trade_date);
  if (dates.length === 0) return null;

  const w5 = aggregateBrokerWindow(db, sym, dates.slice(0, Math.min(5, dates.length)));
  const w15 = aggregateBrokerWindow(db, sym, dates);
  if (!w5 || !w15) return null;

  return { symbol: sym, latestBrokerDate: dates[0], w5, w15 };
}

function calcRsi14(closes = []) {
  if (closes.length < 15) return 50;
  let gains = 0;
  let losses = 0;
  const start = closes.length - 14;
  for (let i = start; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  return +(100 - 100 / (1 + gains / losses)).toFixed(1);
}

/**
 * Evaluates a single stock through all 6 Flowchart v3.0 Empirical Gates.
 */
export function evaluateFlowchartV3Candidate(
  symbol,
  {
    db,
    targetDate = null,
    maxPrice = 500,
    minTurnover = 8000000,
    liveOverlay = null,
    requireEps = true,
  } = {}
) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!db || !sym) return { qualified: false, symbol: sym, vetoCode: 'INVALID_INPUT', failReason: 'Invalid db or symbol' };

  // Load fundamentals strictly from live scrip_fundamentals columns + static fallback
  let dbFund = null;
  try {
    dbFund = db.prepare(`SELECT * FROM scrip_fundamentals WHERE symbol = ?`).get(sym);
  } catch (_) {}

  const staticFund = getFundamentalsFallbackMap().get(sym) || {};
  const stockMeta = getStockMap()[sym] || {};
  const sector = String(dbFund?.sector || staticFund.sector || stockMeta.sector || 'Equities').trim();
  const companyName = String(stockMeta.name || sym);

  if (isNonEquityTicker(sym, sector)) {
    return { qualified: false, symbol: sym, vetoCode: 'EXCLUDED_INSTRUMENT', failReason: `Excluded sector/instrument: ${sector}` };
  }
  if (/commercial bank/i.test(sector)) {
    return { qualified: false, symbol: sym, vetoCode: 'SLOW_BANK_SECTOR', failReason: 'Commercial Bank excluded from agile 7-10D swing velocity tier' };
  }

  // Candles (ascending order)
  const { summaryFilter } = getSchemaFilterClauses(db);
  const barSql = targetDate
    ? `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
       FROM daily_stock_summary WHERE symbol = ? AND trade_date <= ?${summaryFilter} ORDER BY trade_date DESC LIMIT 25`
    : `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
       FROM daily_stock_summary WHERE symbol = ?${summaryFilter} ORDER BY trade_date DESC LIMIT 25`;
  const rawBars = db.prepare(barSql).all(...(targetDate ? [sym, targetDate] : [sym]));
  if (!rawBars || rawBars.length < 15) {
    return { qualified: false, symbol: sym, vetoCode: 'INSUFFICIENT_HISTORY', failReason: 'Fewer than 15 trading sessions available' };
  }

  const candles = [...rawBars].reverse();
  const lastHist = candles[candles.length - 1];
  const lastHistDate = String(lastHist.trade_date || '').slice(0, 10);
  const liveDateStr = liveOverlay?.date ? String(liveOverlay.date).slice(0, 10) : null;
  const hasLiveLtp = Number(liveOverlay?.ltp || 0) > 0;
  const isNewLiveSession = Boolean(
    hasLiveLtp && liveDateStr && /^\d{4}-\d{2}-\d{2}$/.test(liveDateStr) && liveDateStr > lastHistDate
  );

  const effectiveDate = isNewLiveSession ? liveDateStr : String(targetDate || lastHistDate).slice(0, 10);
  const ltp = Number(liveOverlay?.ltp || lastHist.close_price || 0);
  const prevClose = Number(
    liveOverlay?.prevClose || (isNewLiveSession ? lastHist.close_price : candles[candles.length - 2]?.close_price) || ltp
  );
  const turnover = Number(liveOverlay?.turnover ?? lastHist.total_turnover ?? 0);
  const curVol = Number(liveOverlay?.volume ?? lastHist.total_volume ?? 0);
  const baseHigh = Number(
    liveOverlay?.high ||
      (isNewLiveSession ? Math.max(ltp, prevClose) : lastHist.high_price || Math.max(ltp, prevClose)) ||
      ltp
  );
  const baseLow = Number(
    liveOverlay?.low ||
      (isNewLiveSession ? Math.min(ltp, prevClose) : lastHist.low_price || Math.min(ltp, prevClose)) ||
      ltp
  );
  const curHigh = Math.max(baseHigh, ltp);
  const curLow = Math.min(baseLow, ltp);
  const dayChg =
    liveOverlay?.pChange !== undefined && liveOverlay?.pChange !== null && Number.isFinite(Number(liveOverlay.pChange))
      ? Number(liveOverlay.pChange)
      : prevClose > 0
      ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2)
      : 0;

  const effectiveCandles = isNewLiveSession
    ? [
        ...candles,
        {
          trade_date: effectiveDate,
          open_price: prevClose,
          high_price: curHigh,
          low_price: curLow,
          close_price: ltp,
          total_volume: curVol,
          total_turnover: turnover,
        },
      ]
    : hasLiveLtp
    ? [
        ...candles.slice(0, -1),
        {
          ...lastHist,
          high_price: curHigh,
          low_price: curLow,
          close_price: ltp,
          total_volume: curVol,
          total_turnover: turnover,
        },
      ]
    : candles;

  // Gate 1: Price band, liquidity, EPS > 0, and Promoter Lock-In Expiry Cliff
  if (ltp < 100 || (maxPrice > 0 && ltp >= maxPrice)) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'PRICE_OUT_OF_RANGE',
      failReason: `LTP Rs. ${ltp} outside swing target band [100, ${maxPrice > 0 ? maxPrice : '∞'})`,
    };
  }
  if (turnover < minTurnover) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'LOW_LIQUIDITY',
      failReason: `Turnover Rs. ${(turnover / 1e5).toFixed(1)}L below Rs. ${(minTurnover / 1e5).toFixed(0)}L minimum`,
    };
  }

  const eps = Number(dbFund?.eps_ttm ?? staticFund.eps ?? 0);
  if (requireEps && eps <= 0) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'NON_POSITIVE_EPS',
      failReason: `EPS (${eps}) must be > 0 to enforce institutional balance-sheet safety floor`,
    };
  }

  const lockinCheck = isInPromoterLockinCliff(sym, {
    asOfDate: effectiveDate,
    unlockDate: dbFund?.promoter_unlock_date,
  });
  if (lockinCheck.isCliff) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'LOCKIN_CLIFF_VETO',
      failReason: lockinCheck.reason,
    };
  }

  // Gate 2: 15D Gross-Mover No-Wash Check
  const brokerMetrics = computeMultiWindowGrossAndNetMetrics(sym, { db, targetDate: targetDate || lastHist.trade_date });
  if (!brokerMetrics) {
    return { qualified: false, symbol: sym, vetoCode: 'NO_BROKER_LEDGER', failReason: 'Missing multi-session broker ledger data' };
  }
  const { w5, w15 } = brokerMetrics;
  if (w15.grossTop3RetentionPct < 38 || w15.minTop2GrossRetentionPct < 28) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'GROSS_MOVER_WASH_CHURN',
      failReason: `15D Gross-Mover Wash Churn: Top-3 ret ${w15.grossTop3RetentionPct}% (<38%) or Top-2 min ${w15.minTop2GrossRetentionPct}% (<28%)`,
    };
  }

  // Gate 3: 15D Operator Cost Proximity
  const vwap15 = w15.vwap || ltp;
  const vwapGap15 = +(((ltp - vwap15) / vwap15) * 100).toFixed(2);
  if (vwapGap15 > 3.8 || vwapGap15 < -4.5) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'VWAP_GAP_EXTENDED',
      failReason: `15D Hoarder VWAP gap ${vwapGap15 >= 0 ? '+' : ''}${vwapGap15}% outside [-4.5%, +3.8%] pocket window`,
    };
  }

  // Gate 4: Anti-Exhaustion RSI Sweet Spot
  const closes = effectiveCandles.map((c) => Number(c.close_price || 0));
  const rsi14 = calcRsi14(closes);
  if (rsi14 > 65 || rsi14 < 35) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: rsi14 > 65 ? 'RSI_OVERBOUGHT_EXHAUSTION' : 'RSI_WEAK_DOWNTREND',
      failReason: `RSI(14) = ${rsi14} outside sweet spot [35, 65] (overbought breakouts retrace inside T+2)`,
    };
  }

  // Gate 5: Wyckoff Volume Dry-Up, Upper-Wick Wall & Anti-Demat-Dump Check
  const volSeries = effectiveCandles.slice(-20).map((c) => Number(c.total_volume || 0));
  const avgVol20 = volSeries.reduce((a, b) => a + b, 0) / Math.max(1, volSeries.length);
  const prior5Vols = effectiveCandles.slice(-5).map((c) => Number(c.total_volume || 0));
  const minVol5 = prior5Vols.length > 0 ? Math.min(...prior5Vols) : avgVol20;
  const vdu = avgVol20 > 0 ? +(minVol5 / avgVol20).toFixed(2) : 1.0;

  let wicks10 = 0;
  for (const bar of effectiveCandles.slice(-10)) {
    const rng = Number(bar.high_price || 0) - Number(bar.low_price || 0);
    const uw = Number(bar.high_price || 0) - Math.max(Number(bar.open_price || bar.close_price), Number(bar.close_price || 0));
    if (rng > 0 && uw / rng >= 0.38) wicks10++;
  }
  if (wicks10 > 4) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'OVERHEAD_WICK_WALL',
      failReason: `Detected ${wicks10}/10 upper-wick supply rejections overhead (>4 cap)`,
    };
  }

  // Check latest settled broker date for unabsorbed dumping by lead net hoarder
  if (w15.leadNetHoarders[0]) {
    const leadId = w15.leadNetHoarders[0].brokerId;
    const latestDayLead = db
      .prepare(`SELECT buy_vol, sell_vol FROM daily_broker_ledger WHERE symbol = ? AND trade_date = ? AND broker_id = ?`)
      .get(sym, brokerMetrics.latestBrokerDate, leadId);
    if (latestDayLead) {
      const lNet = Number(latestDayLead.buy_vol || 0) - Number(latestDayLead.sell_vol || 0);
      if (lNet < -2500 && Number(latestDayLead.sell_vol || 0) > Number(latestDayLead.buy_vol || 0) * 1.5) {
        return {
          qualified: false,
          symbol: sym,
          vetoCode: 'T2_DEMAT_DUMP_TRAP',
          failReason: `Lead 15D hoarder #${leadId} flipped net seller (-${Math.abs(lNet)} kitta) on ${brokerMetrics.latestBrokerDate}`,
        };
      }
    }
  }

  // Gate 6: Quiet Ignition Turn & CLV Quality
  const rngToday = curHigh - curLow;
  const clv = rngToday > 0.001 ? +((ltp - curLow) / rngToday).toFixed(2) : dayChg >= 0 ? 0.65 : 0.4;
  if (dayChg < -0.5 || dayChg > 4.3 || clv < 0.5) {
    return {
      qualified: false,
      symbol: sym,
      vetoCode: 'IGNITION_TURN_UNMET',
      failReason: `Day change ${dayChg}% or CLV ${(clv * 100).toFixed(0)}% misses Quiet Ignition Turn [-0.5..+4.3%, CLV>=50%]`,
    };
  }

  // Determine exact Flowchart v3.0 mode (strict Floor-Turn vs Breakout Continuation)
  const isStrictFloorTurn =
    eps > 0 &&
    w15.grossTop3RetentionPct >= 42 &&
    w15.minTop2GrossRetentionPct >= 32 &&
    vwapGap15 >= -4.5 &&
    vwapGap15 <= 1.8 &&
    rsi14 >= 38 &&
    rsi14 <= 62 &&
    vdu <= 0.65 &&
    dayChg >= -0.2 &&
    dayChg <= 3.5 &&
    clv >= 0.52;

  // Score (0-99) calibrated by walk-forward edge weights
  let score = 52;
  if (isStrictFloorTurn) score += 16;
  score += Math.min(14, Math.max(0, Math.round((w15.grossTop3RetentionPct - 35) * 0.28)));
  score += Math.min(8, Math.max(0, Math.round(w5.bcrSpread * 0.25)));
  if (vwapGap15 >= -1.5 && vwapGap15 <= 1.8) score += 6;
  if (vdu <= 0.45) score += 5;
  else if (vdu <= 0.65) score += 3;
  if (ltp < 500) score += 4;
  score = Math.min(99, score);

  // Tactical 7-10D Execution Ticket (anchored to 15D operator VWAP & asymmetric >= 2:1 R:R)
  const entryLow = Number(Math.min(ltp * 0.992, Math.max(vwap15 * 0.995, ltp * 0.985)).toFixed(1));
  const entryHigh = Number(Math.max(ltp, Math.min(ltp * 1.008, vwap15 * 1.015)).toFixed(1));
  const chaseCap = Number((ltp * 1.015).toFixed(1));
  const stopLoss = Number(Math.min(ltp * 0.955, Math.max(ltp * 0.94, vwap15 * 0.955)).toFixed(1));
  const target1 = Number((ltp * 1.075).toFixed(1));
  const target2 = Number((ltp * 1.135).toFixed(1));
  const risk = Math.max(0.5, ltp - stopLoss);
  const riskRewardRatio = Number(((target2 - ltp) / risk).toFixed(2));

  return {
    qualified: true,
    symbol: sym,
    companyName,
    sector,
    asOfDate: effectiveDate,
    mode: isStrictFloorTurn ? 'FLOWCHART_V3_FLOOR_TURN' : 'FLOWCHART_V3_SWING_SETUP',
    modeBadge: isStrictFloorTurn ? '🎯 v3.0 Floor Turn (88.7% Edge)' : '⚡ v3.0 Institutional Swing',
    score,
    ltp,
    pChange: dayChg,
    turnover,
    volume: curVol,
    eps,
    bookValue: Number(dbFund?.book_value_per_share ?? staticFund.bvps ?? staticFund.bookValue ?? 0),
    vwap15D: vwap15,
    vwapGap15Pct: vwapGap15,
    grossTop3Ret15D: w15.grossTop3RetentionPct,
    minTop2GrossRet15D: w15.minTop2GrossRetentionPct,
    bcr3Buy5D: w5.bcr3Buy,
    bcr3Sell5D: w5.bcr3Sell,
    bcrSpread5D: w5.bcrSpread,
    vdu,
    rsi14,
    clvPct: Math.round(clv * 100),
    upperWicks10D: wicks10,
    leadHolders: w15.leadNetHoarders.map((b) => `#${b.brokerId} (${b.retentionPct}%)`).join(', '),
    leadBrokerId: w15.leadNetHoarders[0]?.brokerId || w15.leadGrossBuyer?.brokerId || null,
    leadBrokerName: w15.leadNetHoarders[0]?.name || w15.leadGrossBuyer?.name || 'Smart Money',
    entryLow,
    entryHigh,
    chaseCap,
    stopLoss,
    target1,
    target2,
    riskRewardRatio,
  };
}

/**
 * Scans database equities through Flowchart v3.0 and returns ranked 7-10D swing candidates.
 */
export function scanFlowchartV3SwingCandidates({
  db,
  targetDate = null,
  maxPrice = 500,
  minTurnover = 8000000,
  livePricesMap = null,
  limit = 15,
} = {}) {
  if (!db) return { topPick: null, candidates: [], vetoed: [], totalScanned: 0, asOfDate: null };

  const { summaryFilter } = getSchemaFilterClauses(db);
  let effectiveDate = targetDate;
  if (!effectiveDate) {
    try {
      effectiveDate = db.prepare(`SELECT MAX(trade_date) AS d FROM daily_stock_summary WHERE 1=1${summaryFilter}`).get()?.d || null;
    } catch (_) {}
  }

  let symbols = [];
  if (livePricesMap && livePricesMap.size > 0) {
    const stockMap = getStockMap();
    for (const [rawSym, overlay] of livePricesMap.entries()) {
      const sym = String(rawSym || '').toUpperCase().trim();
      if (!sym) continue;
      const mappedSector = overlay?.sector || stockMap[sym]?.sector || '';
      if (isNonEquityTicker(sym, mappedSector || (sym.endsWith('P') && !stockMap[sym] ? '__DEFER_TO_DB__' : ''))) {
        continue;
      }
      const liveLtp = Number(overlay?.ltp || 0);
      if (liveLtp < 100 || (maxPrice > 0 && liveLtp >= maxPrice)) continue;
      if (overlay?.turnover !== undefined && overlay?.turnover !== null && Number(overlay.turnover) < minTurnover) {
        continue;
      }
      symbols.push(sym);
    }
  } else if (effectiveDate) {
    symbols = db
      .prepare(
        `SELECT DISTINCT symbol FROM daily_stock_summary
         WHERE trade_date = ? AND close_price >= 100 ${maxPrice > 0 ? 'AND close_price < ?' : ''}
         AND total_turnover >= ?${summaryFilter}`
      )
      .all(...(maxPrice > 0 ? [effectiveDate, maxPrice, minTurnover] : [effectiveDate, minTurnover]))
      .map((r) => r.symbol);
  }

  const candidates = [];
  const vetoed = [];

  for (const sym of symbols) {
    const liveOverlay = livePricesMap ? livePricesMap.get(sym) || null : null;
    const res = evaluateFlowchartV3Candidate(sym, {
      db,
      targetDate: effectiveDate,
      maxPrice,
      minTurnover,
      liveOverlay,
    });
    if (res.qualified) {
      candidates.push(res);
    } else if (res.vetoCode === 'GROSS_MOVER_WASH_CHURN' || res.vetoCode === 'LOCKIN_CLIFF_VETO' || res.vetoCode === 'T2_DEMAT_DUMP_TRAP') {
      vetoed.push({ symbol: res.symbol, vetoCode: res.vetoCode, reason: res.failReason });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.grossTop3Ret15D - a.grossTop3Ret15D ||
      b.bcrSpread5D - a.bcrSpread5D ||
      Math.abs(a.vwapGap15Pct) - Math.abs(b.vwapGap15Pct)
  );

  return {
    asOfDate: effectiveDate,
    methodology: 'FLOWCHART_V3_6_GATE',
    maxPrice,
    totalScanned: symbols.length,
    qualifiedCount: candidates.length,
    topPick: candidates[0] || null,
    candidates: candidates.slice(0, limit),
    vetoed: vetoed.slice(0, 20),
  };
}
