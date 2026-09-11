// proxy/quant/newsCache.mjs
// Shared in-memory store for scraped news sentiment items.
// Written by the news scraper in server.mjs, read by predictorEngine.mjs.
// Enables sentiment data to flow even when the PostgreSQL DB is unavailable.

let _cache = [];
let _lastScraped = null;

/**
 * Replaces the in-memory cache with newly scraped items.
 * @param {object[]} items  Array of news sentiment objects.
 */
export function setNewsCache(items) {
  if (Array.isArray(items) && items.length > 0) {
    _cache = items;
    _lastScraped = new Date().toISOString();
    console.log(`[newsCache] Stored ${items.length} scraped news items (${_lastScraped})`);
  }
}

/**
 * Returns cached news items, newest-first, limited to limit.
 * @param {number} limit
 * @returns {object[]}
 */
export function getNewsCache(limit = 30) {
  return _cache.slice(0, limit);
}

/** True if at least one news item has been scraped. */
export function hasNewsCache() {
  return _cache.length > 0;
}

/** ISO timestamp of the last successful scrape, or null if never scraped. */
export function getNewsCacheAge() {
  return _lastScraped;
}
