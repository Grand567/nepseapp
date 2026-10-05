/**
 * Computes live sector median PE, PBV, ROE, EPS from the current stock universe.
 * Called once after today's prices are loaded in Dashboard.
 * Stores result in module-level cache for use by fundamentals.js.
 */

const _liveMedians = new Map(); // key: sectorKey → { medianPE, medianPBV, medianROE, medianEPS, sampleSize, computedAt }

/** Helper: compute median of a numeric array (ignores nulls/zeros) */
export function median(arr) {
  const clean = arr.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
  if (clean.length === 0) return null;
  clean.sort((a, b) => a - b);
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 !== 0 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/**
 * Maps a sector string (from stock data) to the same key used in NEPSE_SECTOR_BENCHMARKS.
 * Must handle variations like 'Commercial Bank', 'Commercial Banks (NRB regulated)', 'Banks', etc.
 */
export function normalizeSectorKey(sector) {
  if (!sector) return 'others';
  const s = sector.toLowerCase();
  if (s.includes('commercial bank') || s.includes('class a')) return 'commercialBanks';
  if (s.includes('development bank') || s.includes('class b')) return 'developmentBanks';
  if (s.includes('finance') && !s.includes('micro')) return 'financeCompanies';
  if (s.includes('microfinance') || s.includes('class d')) return 'microfinance';
  if (s.includes('hydro') || s.includes('power') || s.includes('energy')) return 'hydropower';
  if (s.includes('insurance') || s.includes('life') || s.includes('non-life')) return 'insurance';
  if (s.includes('hotel') || s.includes('tourism')) return 'hotels';
  if (s.includes('manufacturing') || s.includes('processing')) return 'manufacturing';
  if (s.includes('trading')) return 'trading';
  if (s.includes('investment') || s.includes('mutual fund')) return 'investments';
  if (s.includes('telecom') || s.includes('telephone')) return 'telecom';
  return 'others';
}

/**
 * Compute medians from a live stock array (as returned by Dashboard's allStocks).
 * Each stock object may have: pe, pb (or pbv), roe, eps, sector, ltp, eps
 * Call this once after the stock list is fully loaded.
 */
export function computeLiveSectorMedians(allStocks, classify = normalizeSectorKey) {
  if (!Array.isArray(allStocks) || allStocks.length === 0) return;
  
  const groups = {}; // sectorKey → { pes, pbvs, roes, epss }
  
  for (const stock of allStocks) {
    const key = classify(stock.sector || stock.sectorName || '');
    if (!groups[key]) groups[key] = { pes: [], pbvs: [], roes: [], epss: [] };
    
    const pe = Number(stock.pe || stock.peRatio || 0);
    const pbv = Number(stock.pb || stock.pbv || stock.pbRatio || 0);
    const roe = Number(stock.roe || 0);
    const eps = Number(stock.eps || 0);
    
    if (pe > 0 && pe < 500) groups[key].pes.push(pe);   // filter outliers
    if (pbv > 0 && pbv < 100) groups[key].pbvs.push(pbv);
    if (roe > -100 && roe < 200) groups[key].roes.push(roe);
    if (eps > -1000 && eps < 10000) groups[key].epss.push(eps);
  }
  
  _liveMedians.clear();
  for (const [key, g] of Object.entries(groups)) {
    const medPE = median(g.pes);
    const medPBV = median(g.pbvs);
    const medROE = median(g.roes);
    const medEPS = median(g.epss);
    if (g.pes.length >= 3 || g.epss.length >= 3) { // need at least 3 stocks
      _liveMedians.set(key, {
        medianPE: medPE,
        medianPBV: medPBV,
        medianROE: medROE,
        medianEPS: medEPS,
        sampleSize: Math.max(g.pes.length, g.epss.length),
        computedAt: new Date().toISOString()
      });
    }
  }
  
  console.log(`[liveSectorMedians] Computed for ${_liveMedians.size} sectors from ${allStocks.length} stocks`);
}

/** Get live medians for a sector key. Returns null if not yet computed or too few samples. */
export function getLiveMedians(sectorKey) {
  return _liveMedians.get(sectorKey) || null;
}

/** Check if live medians have been computed */
export function hasLiveMedians() {
  return _liveMedians.size > 0;
}

/** Get all computed medians (for display) */
export function getAllLiveMedians() {
  return Object.fromEntries(_liveMedians.entries());
}
