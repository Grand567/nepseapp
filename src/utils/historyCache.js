// src/utils/historyCache.js
// Safe, universal (Browser & Node.js) high-speed in-memory + persistent cache accessors
// for stock price history, broker analysis, floorsheet, and fundamentals.
//
// Performance note:
// In-memory Maps guarantee O(1) <0.01ms lookups, completely eliminating synchronous
// localStorage.getItem and JSON.parse overhead during massive loops (300+ stocks)
// across screeners, radar tabs, and dashboard scans.

import { idbGet, idbSet } from './indexedDb.js';
import latestBrokerMatrix from '../data/broker_matrix_latest.json' with { type: 'json' };
import latestFundamentals from '../data/nepse_fundamentals_latest.json' with { type: 'json' };
import cumulativeBrokerLedger from '../data/nepse_cumulative_broker_ledger.json' with { type: 'json' };
import nepseIndexBaseline from '../data/nepse_index_baseline.json' with { type: 'json' };
import { isMarketOpen } from './nepseCalendar.js';

// Universal in-memory cache maps
const memHistCache = new Map();
const memFundCache = new Map();
const memBrokerCache = new Map();
const memFloorsheetCache = new Map();
const memCumulativeBrokerCache = new Map();
export const brokerDataCache = new Map();

// Pre-seed in-memory NEPSE Index baseline candles synchronously (681 authentic sessions)
if (Array.isArray(nepseIndexBaseline) && nepseIndexBaseline.length > 0) {
  memHistCache.set('NEPSE', nepseIndexBaseline);
  memHistCache.set('NEPSE INDEX', nepseIndexBaseline);
}

// Pre-seed in-memory fundamentals cache synchronously from verified baseline
if (latestFundamentals && typeof latestFundamentals === 'object') {
  for (const [sym, fund] of Object.entries(latestFundamentals)) {
    if (sym && fund) {
      memFundCache.set(sym.toUpperCase(), fund);
    }
  }
}

// Pre-seed in-memory cumulative multi-session broker ledger cache
if (cumulativeBrokerLedger && typeof cumulativeBrokerLedger === 'object') {
  for (const [sym, cData] of Object.entries(cumulativeBrokerLedger)) {
    if (sym && cData) {
      memCumulativeBrokerCache.set(sym.toUpperCase(), cData);
    }
  }
}

/**
 * Synchronous lookup for multi-session cumulative broker audit data
 * @param {string} symbol - Stock ticker symbol
 * @returns {Object|null} Multi-session broker summary (cost basis, top accumulators, cumulative volume)
 */
export function getCumulativeBrokerData(symbol) {
  if (!symbol) return null;
  const key = String(symbol).toUpperCase().trim();
  return memCumulativeBrokerCache.get(key) || null;
}

/**
 * Builds precomputed per-scrip broker analysis map from bundled verified broker matrix.
 */
export function buildPrecomputedBrokerMap(matrixData) {
  if (!matrixData || !Array.isArray(matrixData.matrix)) return {};
  const scripBrokers = {};
  const businessDate = matrixData.businessDate || '2026-11-02';
  for (const b of matrixData.matrix) {
    const brokerId = String(b.broker);
    const brokerName = b.brokerName || `Broker #${brokerId}`;
    for (const s of (b.scrips || [])) {
      const sym = String(s.symbol || '').toUpperCase().trim();
      if (!sym) continue;
      if (!scripBrokers[sym]) {
        scripBrokers[sym] = {
          symbol: sym,
          date: businessDate,
          businessDate: businessDate,
          buyers: [],
          sellers: [],
          totalBuyQty: 0,
          totalSellQty: 0,
          totalBuyAmt: 0,
          totalSellAmt: 0,
          allBrokers: []
        };
      }
      const entry = scripBrokers[sym];
      const buyQty = Number(s.buyQty || s.buyVolume || s.buyKitta || 0);
      const rawBuyAmt = Number(s.buyAmt || s.buyAmount || s.buyTurnover || (typeof s.buy === 'number' && s.buy > buyQty ? s.buy : 0) || 0);
      const buyAmt = rawBuyAmt > 0 ? rawBuyAmt : (buyQty * Number(s.avgBuyRate || s.avgBuyPrice || 0));
      const sellQty = Number(s.sellQty || s.sellVolume || s.sellKitta || 0);
      const rawSellAmt = Number(s.sellAmt || s.sellAmount || s.sellTurnover || (typeof s.sell === 'number' && s.sell > sellQty ? s.sell : 0) || 0);
      const sellAmt = rawSellAmt > 0 ? rawSellAmt : (sellQty * Number(s.avgSellRate || s.avgSellPrice || 0));
      const netQty = buyQty - sellQty;
      const netAmt = buyAmt - sellAmt;
      const avgBuyRate = Number(s.avgBuyRate || s.avgBuyPrice || (buyQty > 0 && buyAmt > 0 ? +(buyAmt / buyQty).toFixed(2) : 0));
      const avgSellRate = Number(s.avgSellRate || s.avgSellPrice || (sellQty > 0 && sellAmt > 0 ? +(sellAmt / sellQty).toFixed(2) : 0));

      const brokerItem = {
        id: brokerId,
        broker: brokerId,
        brokerId: brokerId,
        name: brokerName,
        brokerName: brokerName,
        buyQty,
        buyAmt,
        buyAmount: buyAmt,
        sellQty,
        sellAmt,
        sellAmount: sellAmt,
        netQty,
        signedHoldQty: netQty,
        holdQty: Math.max(0, netQty),
        netAmt,
        holdAmt: netQty >= 0 ? netAmt : 0,
        totalQty: buyQty + sellQty,
        avgBuyRate,
        avgSellRate,
        trades: Number(s.trades || 0)
      };

      entry.allBrokers.push(brokerItem);
      if (buyQty > 0) {
        entry.buyers.push(brokerItem);
        entry.totalBuyQty += buyQty;
        entry.totalBuyAmt += buyAmt;
      }
      if (sellQty > 0) {
        entry.sellers.push(brokerItem);
        entry.totalSellQty += sellQty;
        entry.totalSellAmt += sellAmt;
      }
    }
  }

  const result = {};
  for (const [sym, data] of Object.entries(scripBrokers)) {
    data.buyers.sort((a, b) => b.buyQty - a.buyQty);
    data.sellers.sort((a, b) => b.sellQty - a.sellQty);
    data.buyers.forEach((b) => {
      b.sharePct = data.totalBuyQty > 0 ? +(b.buyQty / data.totalBuyQty * 100).toFixed(2) : 0;
    });
    data.sellers.forEach((s) => {
      s.sharePct = data.totalSellQty > 0 ? +(s.sellQty / data.totalSellQty * 100).toFixed(2) : 0;
    });

    const topNetBuyers = [...data.allBrokers].filter((b) => b.netQty > 0).sort((a, b) => b.netQty - a.netQty);
    const topNetSellers = [...data.allBrokers].filter((b) => b.netQty < 0).sort((a, b) => a.netQty - b.netQty);

    const top3BuyQty = data.buyers.slice(0, 3).reduce((acc, b) => acc + b.buyQty, 0);
    const top3SellQty = data.sellers.slice(0, 3).reduce((acc, s) => acc + s.sellQty, 0);
    const bcr3BuyPct = data.totalBuyQty > 0 ? +(top3BuyQty / data.totalBuyQty * 100).toFixed(2) : 0;
    const bcr3SellPct = data.totalSellQty > 0 ? +(top3SellQty / data.totalSellQty * 100).toFixed(2) : 0;
    const netConcentration = +(bcr3BuyPct - bcr3SellPct).toFixed(2);

    result[sym] = {
      symbol: sym,
      date: data.date,
      businessDate: data.businessDate,
      totalVolume: data.totalBuyQty,
      totalTurnover: data.totalBuyAmt,
      bcr3BuyPct,
      bcr3SellPct,
      grossBuyConcentrationPct: bcr3BuyPct,
      grossSellConcentrationPct: bcr3SellPct,
      smartMoneyNetFlowPct: netConcentration,
      adRatio: bcr3SellPct > 0 ? +(bcr3BuyPct / bcr3SellPct).toFixed(2) : bcr3BuyPct,
      adSignal: netConcentration > 10 ? 'Accumulation' : netConcentration < -10 ? 'Distribution' : 'Neutral',
      topBuyers: data.buyers.slice(0, 5),
      topSellers: data.sellers.slice(0, 5),
      topBuyerBrokers: data.buyers.slice(0, 5),
      topSellerBrokers: data.sellers.slice(0, 5),
      topNetBuyers: topNetBuyers.slice(0, 5),
      topNetSellers: topNetSellers.slice(0, 5),
      brokers: data.allBrokers,
      allBrokers: data.allBrokers,
      availableDates: matrixData.availableDates || [businessDate],
      tradingDays: 1,
      source: 'bundled_matrix_latest'
    };
  }
  return result;
}

// Seed in-memory cache synchronously from the bundled verified matrix
export const BUNDLED_BROKER_DATE = latestBrokerMatrix?.businessDate || '2026-11-02';
export const bundledBrokerMap = buildPrecomputedBrokerMap(latestBrokerMatrix);

for (const [sym, analysis] of Object.entries(bundledBrokerMap)) {
  const symU = sym.toUpperCase();
  memBrokerCache.set(symU, analysis);
  memBrokerCache.set(`nepse_real_broker_${symU}_d1_latest__`, analysis);
  memBrokerCache.set(`nepse_real_broker_${symU}_d1_${BUNDLED_BROKER_DATE}__`, analysis);
  brokerDataCache.set(symU, analysis);
}

// Storage key prefixes
const HIST_LS_PREFIX_PRIMARY  = 'nepse_hist_prices_';
const HIST_LS_PREFIX_FALLBACK = 'nepse_hist_';
const HIST_LRU_KEY            = 'nepse_hist_lru_ring';
const HIST_LRU_MAX            = 20;

const FUND_LS_PREFIX          = 'nepse_fundamentals_';
const BROKER_LS_PREFIX        = 'nepse_hist_broker_';
const FLOORSHEET_LS_PREFIX    = 'nepse_hist_floorsheet_';

// ── LRU Ring Helpers for localStorage Quota Management ───────────────────────
function _getHistLRU() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HIST_LRU_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function _setHistLRU(ring) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HIST_LRU_KEY, JSON.stringify(ring));
  } catch (_) {}
}

function _lruTouch(sym) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const ring = _getHistLRU().filter(s => s !== sym);
  ring.push(sym);
  if (ring.length > HIST_LRU_MAX) {
    const evicted = ring.shift();
    try {
      localStorage.removeItem(HIST_LS_PREFIX_PRIMARY + evicted);
      localStorage.removeItem(HIST_LS_PREFIX_FALLBACK + evicted);
    } catch (_) {}
  }
  _setHistLRU(ring);
}

// ── Multi-Tab Storage Event Synchronization ──────────────────────────────────
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => {
    if (!e || !e.key) return;
    if (e.key.startsWith(HIST_LS_PREFIX_PRIMARY)) {
      const sym = e.key.slice(HIST_LS_PREFIX_PRIMARY.length);
      memHistCache.delete(sym);
    } else if (e.key.startsWith(HIST_LS_PREFIX_FALLBACK)) {
      const sym = e.key.slice(HIST_LS_PREFIX_FALLBACK.length);
      memHistCache.delete(sym);
    } else if (e.key.startsWith(FUND_LS_PREFIX)) {
      const sym = e.key.slice(FUND_LS_PREFIX.length);
      memFundCache.delete(sym);
    } else if (e.key.startsWith(BROKER_LS_PREFIX)) {
      const sym = e.key.slice(BROKER_LS_PREFIX.length);
      memBrokerCache.delete(sym);
      brokerDataCache.delete(sym);
    } else if (e.key.startsWith(FLOORSHEET_LS_PREFIX)) {
      const sym = e.key.slice(FLOORSHEET_LS_PREFIX.length);
      memFloorsheetCache.delete(sym);
    }
  });
}

/**
 * Synchronously retrieves cached real historical candle data for a given symbol.
 * Fast-path: checks in-memory Map first (<0.01ms).
 * Miss-path: reads localStorage once, hydrates in-memory Map, and returns.
 * @param {string} sym - Stock ticker symbol
 * @returns {Array|null} Array of historical candle objects or null if unavailable
 */
export function getCachedRealPriceHistory(sym) {
  if (!sym) return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  if (memHistCache.has(key)) {
    return memHistCache.get(key);
  }

  // Baseline fallback for NEPSE index
  if ((key === 'NEPSE' || key === 'NEPSE INDEX') && Array.isArray(nepseIndexBaseline) && nepseIndexBaseline.length > 0) {
    memHistCache.set(key, nepseIndexBaseline);
    return nepseIndexBaseline;
  }

  if (typeof window === 'undefined') return null;

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(HIST_LS_PREFIX_PRIMARY + key) || localStorage.getItem(HIST_LS_PREFIX_FALLBACK + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memHistCache.set(key, parsed);
          return parsed;
        }
      }
    }
  } catch (_) {}

  // Cache null in memory to avoid repeated synchronous disk reads on cache misses
  memHistCache.set(key, null);
  return null;
}

/**
 * Asynchronously retrieves historical candle data (localStorage -> IndexedDB).
 * @param {string} sym - Stock ticker symbol
 * @returns {Promise<Array|null>}
 */
export async function getCachedRealPriceHistoryAsync(sym) {
  if (!sym) return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  // 1. Try fast in-memory / localStorage
  const sync = getCachedRealPriceHistory(key);
  if (sync) return sync;

  if (typeof window === 'undefined') return null;

  // 2. Fall back to IndexedDB (unlimited quota, persistent)
  try {
    const idbData = await idbGet(HIST_LS_PREFIX_PRIMARY + key);
    if (Array.isArray(idbData) && idbData.length > 0) {
      memHistCache.set(key, idbData);
      try {
        localStorage.setItem(HIST_LS_PREFIX_PRIMARY + key, JSON.stringify(idbData));
      } catch (_) {}
      _lruTouch(key);
      return idbData;
    }
  } catch (_) {}

  return null;
}

/**
 * Stores real historical candle data in memory, localStorage, and IndexedDB.
 * @param {string} sym - Stock ticker symbol
 * @param {Array} data - Candle data array
 */
export function setCachedRealPriceHistory(sym, data) {
  if (!sym || typeof window === 'undefined') return;
  const key = String(sym).toUpperCase().trim();
  if (!key) return;

  if (!Array.isArray(data) || data.length === 0) {
    memHistCache.set(key, null);
    return;
  }

  // 1. Synchronous in-memory update (O(1), zero serialization)
  memHistCache.set(key, data);

  // 2. Synchronous localStorage update with LRU management
  _lruTouch(key);
  try {
    localStorage.setItem(HIST_LS_PREFIX_PRIMARY + key, JSON.stringify(data));
  } catch (e) {
    // QuotaExceededError recovery: flush old LRU entries and retry
    try {
      const ring = _getHistLRU();
      ring.forEach(s => {
        try {
          localStorage.removeItem(HIST_LS_PREFIX_PRIMARY + s);
          localStorage.removeItem(HIST_LS_PREFIX_FALLBACK + s);
        } catch (_) {}
      });
      _setHistLRU([key]);
      localStorage.setItem(HIST_LS_PREFIX_PRIMARY + key, JSON.stringify(data));
    } catch (_) {}
  }

  // 3. Fire-and-forget IndexedDB storage
  idbSet(HIST_LS_PREFIX_PRIMARY + key, data).catch(() => {});
}

/**
 * Synchronously retrieves cached fundamental metrics for a given symbol.
 * Fast-path: checks in-memory Map first (<0.01ms).
 * Miss-path: reads localStorage once, hydrates in-memory Map, and returns.
 * @param {string} sym - Stock ticker symbol
 * @returns {Object|null} Fundamental metrics object or null if unavailable
 */
export function getCachedStockFundamentals(sym) {
  if (!sym) return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  if (memFundCache.has(key)) {
    return memFundCache.get(key);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FUND_LS_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.bookValue !== undefined || parsed.eps !== undefined || parsed.pe !== undefined || parsed.pbv !== undefined || parsed.ltp !== undefined)) {
          memFundCache.set(key, parsed);
          return parsed;
        }
      }
    }
  } catch (_) {}

  if (latestFundamentals && latestFundamentals[key]) {
    const f = latestFundamentals[key];
    memFundCache.set(key, f);
    return f;
  }

  memFundCache.set(key, null);
  return null;
}

/**
 * Stores fundamental metrics in memory and localStorage.
 * @param {string} sym - Stock ticker symbol
 * @param {Object} data - Fundamentals data object
 */
export function setCachedStockFundamentals(sym, data) {
  if (!sym || !data) return;
  const key = String(sym).toUpperCase().trim();
  if (!key) return;

  memFundCache.set(key, data);
  try {
    localStorage.setItem(FUND_LS_PREFIX + key, JSON.stringify(data));
  } catch (_) {}
}

/**
 * Synchronously retrieves cached broker analysis for a given symbol.
 * Fast-path: checks in-memory Map first (<0.01ms).
 * Miss-path: reads localStorage once, hydrates in-memory Map, and returns.
 * @param {string} sym - Stock ticker symbol
 * @param {number} [days=1] - Trading days horizon (1, 5, 15, 30, 60)
 * @param {Object} [options={}] - Additional options { date }
 * @returns {Object|null}
 */
export function getCachedRealBrokerAnalysis(sym, days = 1, options = {}) {
  if (!sym || typeof window === 'undefined') return null;
  const rawSym = String(sym).toUpperCase().trim();
  if (!rawSym) return null;
  const isAll = days === 'all' || days === 'ALL' || days === 'all-time' || Number(days) >= 300;
  const numDays = isAll ? 'all' : Math.max(1, parseInt(days || 1, 10) || 1);

  // Fix 2: Never serve static bundled matrix for 1D when market is actively open or refresh is requested
  const isLive = isMarketOpen();
  if (isLive && numDays === 1 && !options?.date) {
    return null;
  }

  const dateKey = options?.date ? String(options.date).trim() : (numDays === 1 ? BUNDLED_BROKER_DATE : 'latest');
  const fromKey = options?.fromDate ? String(options.fromDate).trim() : '';
  const toKey = options?.toDate ? String(options.toDate).trim() : '';
  const key = `nepse_real_broker_${rawSym}_d${numDays}_${dateKey}_${fromKey}_${toKey}`;

  if (!isAll && brokerDataCache.has(rawSym) && numDays === 1 && (!options?.date || options.date === BUNDLED_BROKER_DATE) && !fromKey && !toKey) {
    return brokerDataCache.get(rawSym);
  }

  if (memBrokerCache.has(key)) {
    return memBrokerCache.get(key);
  }

  if (!isAll && memBrokerCache.has(rawSym) && numDays === 1 && (!options?.date || options.date === BUNDLED_BROKER_DATE) && !fromKey && !toKey) {
    return memBrokerCache.get(rawSym);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key) || (!isAll && numDays === 1 && (!options?.date || options.date === BUNDLED_BROKER_DATE) && !fromKey && !toKey ? localStorage.getItem(BROKER_LS_PREFIX + rawSym) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.topBuyers?.length > 0 || parsed.buyers?.length > 0 || parsed.allHoldings?.length > 0 || parsed.topHoldings?.length > 0 || parsed.adRatio !== undefined)) {
          // Guard: Never return a cached 1D result when multi-day or all-time horizon is requested
          if ((isAll || numDays > 1) && !options?.date && !options?.fromDate && Number(parsed.tradingDays || 1) <= 1 && parsed.timeframe !== 'ALL') {
            return null;
          }
          // Guard: Never return stale cache from past sessions when today's session is active
          const parsedDate = parsed.businessDate || parsed.date || parsed.toDate;
          if (options?.date && parsedDate && parsedDate !== options.date) {
            return null;
          }
          if (!isAll && !options?.date && parsedDate && parsedDate < BUNDLED_BROKER_DATE) {
            return null;
          }
          memBrokerCache.set(key, parsed);
          if (!isAll && numDays === 1 && !options?.date && !fromKey && !toKey) {
            brokerDataCache.set(rawSym, parsed);
          }
          return parsed;
        }
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Stores broker analysis in memory and localStorage.
 * @param {string} sym - Stock ticker symbol
 * @param {Object} data - Broker analysis data
 * @param {number|string} [days=1] - Trading days horizon (1, 5, 15, 30, 60, 'all')
 * @param {Object} [options={}] - Additional options { date, fromDate, toDate }
 */
export function setCachedRealBrokerAnalysis(sym, data, days = 1, options = {}) {
  if (!sym || !data || typeof window === 'undefined') return;
  const rawSym = String(sym).toUpperCase().trim();
  if (!rawSym) return;
  const isAll = days === 'all' || days === 'ALL' || days === 'all-time' || Number(days) >= 300;
  const numDays = isAll ? 'all' : Math.max(1, parseInt(days || 1, 10) || 1);
  const dateKey = options?.date ? String(options.date).trim() : 'latest';
  const fromKey = options?.fromDate ? String(options.fromDate).trim() : '';
  const toKey = options?.toDate ? String(options.toDate).trim() : '';
  const key = `nepse_real_broker_${rawSym}_d${numDays}_${dateKey}_${fromKey}_${toKey}`;

  memBrokerCache.set(key, data);
  if (!isAll && numDays === 1 && !options?.date && !fromKey && !toKey) {
    memBrokerCache.set(rawSym, data);
    brokerDataCache.set(rawSym, data);
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (!isAll && numDays === 1 && !options?.date && !fromKey && !toKey) {
      localStorage.setItem(BROKER_LS_PREFIX + rawSym, JSON.stringify(data));
    }
  } catch (_) {}
}

/**
 * Synchronously retrieves cached broker analysis for a given symbol.
 * Fast-path: checks brokerDataCache first (<0.01ms).
 * Miss-path: checks memBrokerCache and fallback.
 * @param {string} symbol - Stock ticker symbol
 * @returns {Object|null} Cached broker analysis or null if not found
 */
export function getCachedBrokerData(symbol) {
  if (!symbol) return null;
  const key = String(symbol).toUpperCase().trim();
  if (!key) return null;

  let res = null;
  if (brokerDataCache.has(key)) {
    res = brokerDataCache.get(key) || null;
  } else if (memBrokerCache.has(key)) {
    res = memBrokerCache.get(key) || null;
  } else {
    const fallback = getCachedRealBrokerAnalysis(key, 1);
    if (fallback) {
      brokerDataCache.set(key, fallback);
      res = fallback;
    }
  }

  // Enrich with multi-session cumulative ledger data
  const cum = getCumulativeBrokerData(key);
  if (res && cum) {
    res.cumulative = cum;
    if (res.institutionalCostBasis == null) res.institutionalCostBasis = cum.institutionalCostBasis;
    if (res.cumTopAccumulators == null) res.cumTopAccumulators = cum.topAccumulators;
  } else if (!res && cum) {
    res = {
      symbol: key,
      isCumulativeBaseline: true,
      ...cum
    };
  }

  return res;
}

/**
 * Stores normalized uppercase symbol -> broker data in brokerDataCache and memBrokerCache.
 * @param {string} symbol - Stock ticker symbol
 * @param {Object} data - Broker analysis data
 */
export function setCachedBrokerData(symbol, data) {
  if (!symbol || !data) return;
  const key = String(symbol).toUpperCase().trim();
  if (!key) return;

  brokerDataCache.set(key, data);
  memBrokerCache.set(key, data);
  const defaultKey = `nepse_real_broker_${key}_d1_latest__`;
  memBrokerCache.set(defaultKey, data);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BROKER_LS_PREFIX + key, JSON.stringify(data));
      localStorage.setItem(defaultKey, JSON.stringify(data));
    }
  } catch (_) {}
}

/**
 * Iterates over Object.entries(brokerMap || {}) and stores each symbol's broker summary into brokerDataCache.
 * @param {Object} brokerMap - Map of symbol -> broker summary
 */
export function bulkSetCachedBrokerData(brokerMap) {
  if (!brokerMap || typeof brokerMap !== 'object') return;
  for (const [symbol, data] of Object.entries(brokerMap || {})) {
    if (symbol && data && typeof data === 'object') {
      const key = String(symbol).toUpperCase().trim();
      brokerDataCache.set(key, data);
      memBrokerCache.set(key, data);
      const defaultKey = `nepse_real_broker_${key}_d1_latest__`;
      memBrokerCache.set(defaultKey, data);
    }
  }
}

/**
 * Synchronously retrieves cached floorsheet data for a given symbol.
 * Fast-path: checks in-memory Map first (<0.01ms).
 * Miss-path: reads localStorage once, hydrates in-memory Map, and returns.
 * @param {string} sym - Stock ticker symbol
 * @returns {Object|null}
 */
export function getCachedRealFloorsheet(sym, targetDate = '') {
  if (!sym || typeof window === 'undefined') return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  const validate = (parsed) => {
    if (!parsed || !parsed.rows || parsed.rows.length === 0) return null;
    const reqDate = String(targetDate || '').trim();
    if (reqDate && parsed.businessDate && parsed.businessDate !== reqDate) {
      return null;
    }
    if (parsed.cachedAt && typeof parsed.cachedAt === 'number') {
      const maxAge = parsed.isLiveSession ? (30 * 1000) : (15 * 60 * 1000);
      if (Date.now() - parsed.cachedAt > maxAge) {
        return null;
      }
    }
    return parsed;
  };

  if (memFloorsheetCache.has(key)) {
    const mem = memFloorsheetCache.get(key);
    const valid = validate(mem);
    if (valid) return valid;
    memFloorsheetCache.delete(key);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FLOORSHEET_LS_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const valid = validate(parsed);
        if (valid) {
          memFloorsheetCache.set(key, valid);
          return valid;
        } else {
          try { localStorage.removeItem(FLOORSHEET_LS_PREFIX + key); } catch (_) {}
        }
      }
    }
  } catch (_) {}

  memFloorsheetCache.set(key, null);
  return null;
}

/**
 * Stores floorsheet data in memory and localStorage.
 * @param {string} sym - Stock ticker symbol
 * @param {Object} data - Floorsheet data
 */
export function setCachedRealFloorsheet(sym, data) {
  if (!sym || !data || !data.rows || typeof window === 'undefined') return;
  const key = String(sym).toUpperCase().trim();
  if (!key) return;

  const payload = {
    ...data,
    cachedAt: Date.now()
  };

  memFloorsheetCache.set(key, payload);
  // Only persist to localStorage if it's a solid dataset (not an end-of-day fragment)
  if ((data.totalElements || data.rows.length) >= 15) {
    try {
      localStorage.setItem(FLOORSHEET_LS_PREFIX + key, JSON.stringify(payload));
    } catch (_) {}
  }
}

/**
 * Invalidate in-memory and persistent cache for a specific symbol.
 * @param {string} sym
 */
export function invalidateSymbolCache(sym) {
  if (!sym) return;
  const key = String(sym).toUpperCase().trim();
  memHistCache.delete(key);
  memFundCache.delete(key);
  memBrokerCache.delete(key);
  brokerDataCache.delete(key);
  memFloorsheetCache.delete(key);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(HIST_LS_PREFIX_PRIMARY + key);
      localStorage.removeItem(HIST_LS_PREFIX_FALLBACK + key);
      localStorage.removeItem(FUND_LS_PREFIX + key);
      localStorage.removeItem(BROKER_LS_PREFIX + key);
      localStorage.removeItem(FLOORSHEET_LS_PREFIX + key);
    } catch (_) {}
  }
}

/**
 * Flush all in-memory caches.
 */
export function clearHistoryCache() {
  memHistCache.clear();
  memFundCache.clear();
  memBrokerCache.clear();
  brokerDataCache.clear();
  memFloorsheetCache.clear();
}
