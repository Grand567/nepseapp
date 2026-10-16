// src/utils/historyCache.js
// Safe, universal (Browser & Node.js) high-speed in-memory + persistent cache accessors
// for stock price history, broker analysis, floorsheet, and fundamentals.
//
// Performance note:
// In-memory Maps guarantee O(1) <0.01ms lookups, completely eliminating synchronous
// localStorage.getItem and JSON.parse overhead during massive loops (300+ stocks)
// across screeners, radar tabs, and dashboard scans.

import { idbGet, idbSet } from './indexedDb.js';

// Universal in-memory cache maps
const memHistCache = new Map();
const memFundCache = new Map();
const memBrokerCache = new Map();
const memFloorsheetCache = new Map();

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
  if (!sym || typeof window === 'undefined') return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  if (memHistCache.has(key)) {
    return memHistCache.get(key);
  }

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
  if (!sym || typeof window === 'undefined') return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  // 1. Try fast in-memory / localStorage
  const sync = getCachedRealPriceHistory(key);
  if (sync) return sync;

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
  const numDays = Math.max(1, parseInt(days || 1, 10) || 1);
  const dateKey = options?.date ? String(options.date).trim() : 'latest';
  const fromKey = options?.fromDate ? String(options.fromDate).trim() : '';
  const toKey = options?.toDate ? String(options.toDate).trim() : '';
  const key = `nepse_real_broker_${rawSym}_d${numDays}_${dateKey}_${fromKey}_${toKey}`;

  if (memBrokerCache.has(key)) {
    return memBrokerCache.get(key);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key) || (numDays === 1 && !options?.date && !fromKey && !toKey ? localStorage.getItem(BROKER_LS_PREFIX + rawSym) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.topBuyers?.length > 0 || parsed.buyers?.length > 0 || parsed.adRatio !== undefined)) {
          // Guard: Never return a cached 1D result when multi-day horizon is requested
          if (numDays > 1 && !options?.date && !options?.fromDate && Number(parsed.tradingDays || 1) <= 1) {
            return null;
          }
          memBrokerCache.set(key, parsed);
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
 * @param {number} [days=1] - Trading days horizon (1, 5, 15, 30, 60)
 * @param {Object} [options={}] - Additional options { date, fromDate, toDate }
 */
export function setCachedRealBrokerAnalysis(sym, data, days = 1, options = {}) {
  if (!sym || !data || typeof window === 'undefined') return;
  const rawSym = String(sym).toUpperCase().trim();
  if (!rawSym) return;
  const numDays = Math.max(1, parseInt(days || 1, 10) || 1);
  const dateKey = options?.date ? String(options.date).trim() : 'latest';
  const fromKey = options?.fromDate ? String(options.fromDate).trim() : '';
  const toKey = options?.toDate ? String(options.toDate).trim() : '';
  const key = `nepse_real_broker_${rawSym}_d${numDays}_${dateKey}_${fromKey}_${toKey}`;

  memBrokerCache.set(key, data);
  if (numDays === 1 && !options?.date && !fromKey && !toKey) {
    memBrokerCache.set(rawSym, data);
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (numDays === 1 && !options?.date && !fromKey && !toKey) {
      localStorage.setItem(BROKER_LS_PREFIX + rawSym, JSON.stringify(data));
    }
  } catch (_) {}
}

export const getCachedBrokerData = getCachedRealBrokerAnalysis;
export const setCachedBrokerData = setCachedRealBrokerAnalysis;

/**
 * Synchronously retrieves cached floorsheet data for a given symbol.
 * Fast-path: checks in-memory Map first (<0.01ms).
 * Miss-path: reads localStorage once, hydrates in-memory Map, and returns.
 * @param {string} sym - Stock ticker symbol
 * @returns {Object|null}
 */
export function getCachedRealFloorsheet(sym) {
  if (!sym || typeof window === 'undefined') return null;
  const key = String(sym).toUpperCase().trim();
  if (!key) return null;

  if (memFloorsheetCache.has(key)) {
    return memFloorsheetCache.get(key);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FLOORSHEET_LS_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.rows && parsed.rows.length > 0) {
          memFloorsheetCache.set(key, parsed);
          return parsed;
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

  memFloorsheetCache.set(key, data);
  // Only persist to localStorage if it's a solid dataset (not an end-of-day fragment)
  if ((data.totalElements || data.rows.length) >= 15) {
    try {
      localStorage.setItem(FLOORSHEET_LS_PREFIX + key, JSON.stringify(data));
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
  memFloorsheetCache.clear();
}
