/**
 * Universal Watchlist Utility for Drabyashree NEPSE App
 * Synchronizes user watchlist scrips across local storage and cloud sync.
 */

import { syncUserDataToCloud } from './firebase';

const WATCHLIST_KEY = 'nepse_user_watchlist';
const LEGACY_KEY = 'nepse_watchlist';

/**
 * Get current list of watched stock symbols (uppercase array)
 */
export function getWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return [...new Set(list.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
    }
  } catch (_) {}
  return [];
}

/**
 * Save watchlist array locally and sync to cloud
 */
export function saveWatchlist(list, userId = null, userEmail = null) {
  const cleanList = [...new Set((list || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  try {
    const str = JSON.stringify(cleanList);
    localStorage.setItem(WATCHLIST_KEY, str);
    localStorage.setItem(LEGACY_KEY, str);
  } catch (_) {}

  // Dispatch custom event so all open views (Dashboard, Modal, Screener) update immediately
  try {
    window.dispatchEvent(new CustomEvent('nepse_watchlist_updated', { detail: { watchlist: cleanList } }));
    window.dispatchEvent(new Event('watchlist_updated'));
  } catch (_) {}

  // Cloud Sync
  try {
    syncUserDataToCloud(userId || 'current_user', { watchlist: cleanList }, userEmail);
  } catch (_) {}

  return cleanList;
}

/**
 * Check if a symbol is in the watchlist
 */
export function isWatched(symbol) {
  if (!symbol) return false;
  const sym = String(symbol).trim().toUpperCase();
  const list = getWatchlist();
  return list.includes(sym);
}

/**
 * Add a stock symbol to the watchlist
 */
export function addToWatchlist(symbol, userId = null, userEmail = null, stockData = null) {
  if (!symbol) return getWatchlist();
  const sym = String(symbol).trim().toUpperCase();
  const list = getWatchlist();
  if (!list.includes(sym)) {
    return saveWatchlist([...list, sym], userId, userEmail);
  }
  return list;
}

/**
 * Remove a stock symbol from the watchlist
 */
export function removeFromWatchlist(symbol, userId = null, userEmail = null) {
  if (!symbol) return getWatchlist();
  const sym = String(symbol).trim().toUpperCase();
  const list = getWatchlist();
  const updated = list.filter(s => s !== sym);
  return saveWatchlist(updated, userId, userEmail);
}

/**
 * Toggle watchlist membership for a symbol
 */
export function toggleWatchlist(symbol, userId = null, userEmail = null) {
  if (!symbol) return { watched: false, isWatched: false, watchlist: getWatchlist() };
  const sym = String(symbol).trim().toUpperCase();
  const list = getWatchlist();
  const exists = list.includes(sym);
  if (exists) {
    const updated = removeFromWatchlist(sym, userId, userEmail);
    return { watched: false, isWatched: false, watchlist: updated };
  } else {
    const updated = addToWatchlist(sym, userId, userEmail);
    return { watched: true, isWatched: true, watchlist: updated };
  }
}
