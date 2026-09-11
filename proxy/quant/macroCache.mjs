// proxy/quant/macroCache.mjs
// Shared in-memory store for NRB macro indicators.
// Populated by a periodic scraper in server.mjs.
// Read by featureEngine.mjs when the DB macro_indicators table is empty.

const _defaults = {
  m2_growth_pct: 12.8,
  interest_rate_pct: 5.5,
  cpi_inflation_pct: 4.25,
  npr_usd_rate: 134.8,
  remittance_growth_pct: 16.4,
};

let _cache = { ..._defaults };
let _lastUpdated = null;

/**
 * Update the macro indicator cache with freshly scraped values.
 * Only updates fields that are actually present in the incoming object.
 */
export function setMacroCache(indicators) {
  if (indicators && typeof indicators === 'object') {
    for (const [key, value] of Object.entries(indicators)) {
      if (Number.isFinite(Number(value)) && Number(value) > 0) {
        _cache[key] = Number(value);
      }
    }
    _lastUpdated = new Date().toISOString();
    console.log('[macroCache] Updated macro indicators:', JSON.stringify(_cache));
  }
}

/** Returns the current macro indicator snapshot (defaults if never updated). */
export function getMacroCache() {
  return { ..._cache };
}

/** ISO timestamp of last successful update, or null if never updated. */
export function getMacroCacheAge() {
  return _lastUpdated;
}

/** Whether any real data has been scraped (not just defaults). */
export function hasMacroCache() {
  return _lastUpdated !== null;
}
