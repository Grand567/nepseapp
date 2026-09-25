// src/utils/historyCache.js
// Safe, universal (Browser & Node.js) cache accessors for stock price history and fundamentals.
// In the browser, this checks localStorage; in Node.js/SSR environments, safely returns null.

const HIST_LS_PREFIX = 'nepse_hist_';
const FUND_LS_PREFIX = 'nepse_fundamentals_';

/**
 * Synchronously retrieves cached real historical candle data for a given symbol.
 * @param {string} sym - Stock ticker symbol
 * @returns {Array|null} Array of historical candle objects or null if unavailable
 */
export function getCachedRealPriceHistory(sym) {
  if (!sym || typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  const key = String(sym).toUpperCase().trim();
  try {
    const raw = localStorage.getItem(HIST_LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Synchronously retrieves cached fundamental metrics for a given symbol.
 * @param {string} sym - Stock ticker symbol
 * @returns {Object|null} Fundamental metrics object or null if unavailable
 */
export function getCachedStockFundamentals(sym) {
  if (!sym || typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  const key = String(sym).toUpperCase().trim();
  try {
    const raw = localStorage.getItem(FUND_LS_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.bookValue !== undefined || parsed.eps !== undefined || parsed.pe !== undefined || parsed.pbv !== undefined)) {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}
