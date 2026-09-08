/**
 * Dividend History — Frontend Module
 * ─────────────────────────────────────────────────────────────────
 * src/utils/dividendHistory.js
 *
 * Fetches real dividend, bonus share, and right share history for a
 * stock across all available fiscal years, using the backend
 * endpoint /api/dividend-history/:symbol.
 *
 * All data is scraped live from ShareSansar (primary) and Merolagani
 * (fallback). No static/mock data is used under any circumstances.
 *
 * Also exports helper functions used by setupAnalyzer.js Stage 3
 * to cross-check corporate action price adjustments.
 */

import { fetchDividendHistory as _fetchRaw } from './servicesApi.js';

// ─────────────────────────── types ───────────────────────────────
/**
 * @typedef {Object} DividendRecord
 * @property {string} fiscalYear     e.g. "FY 082-083"
 * @property {number} cashDividend   percent, e.g. 15
 * @property {number} bonusShare     percent, e.g. 10
 * @property {number} rightShare     percent, e.g. 0
 * @property {number} totalYield     cashDividend + bonusShare + rightShare
 * @property {string} source         "sharesansar" | "merolagani"
 */

/**
 * @typedef {Object} DividendHistoryResult
 * @property {boolean}          real        — true if fetched from live sources
 * @property {string}           source      — "live-multi-source" | "empty" | "error"
 * @property {DividendRecord[]} dividends   — sorted newest-first
 * @property {number}           totalEntries
 * @property {string|null}      fetchedAt
 * @property {string|null}      error       — human-readable error if !real
 */

// ─────────────────────────── fetcher ─────────────────────────────

/**
 * Fetches real dividend/bonus/right-share history for a symbol.
 * Never fabricates data — exclusively uses live ShareSansar / Merolagani scraping.
 *
 * @param {string} symbol  e.g. "NABIL", "GLBSL"
 * @returns {Promise<DividendHistoryResult>}
 */
export async function fetchRealDividendHistory(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) {
    return { real: false, source: 'error', dividends: [], totalEntries: 0, fetchedAt: null, error: 'No symbol provided' };
  }

  try {
    const res = await _fetchRaw(sym);

    // Backend returns { success, data: { symbol, dividends, totalEntries, sources, fetchedAt }, source }
    if (res && res.success && res.data) {
      const rawDividends = Array.isArray(res.data.dividends) ? res.data.dividends : [];

      // Sanitize: filter out empty or zero rows
      const liveDividends = rawDividends.filter(d =>
        d && (d.cashDividend > 0 || d.bonusShare > 0 || d.rightShare > 0)
      );

      if (liveDividends.length > 0) {
        return {
          real:         true,
          source:       res.source || 'live-multi-source',
          dividends:    liveDividends,
          totalEntries: liveDividends.length,
          fetchedAt:    res.data.fetchedAt || new Date().toISOString(),
          sources:      res.data.sources || ['ShareSansar', 'Merolagani'],
          error:        null,
        };
      }

      // Backend responded but found no records
      return {
        real:         false,
        source:       'empty',
        dividends:    [],
        totalEntries: 0,
        fetchedAt:    res.data.fetchedAt || new Date().toISOString(),
        sources:      [],
        error:        `No dividend or bonus records found for ${sym} in ShareSansar or Merolagani.`,
      };
    }
  } catch (err) {
    console.warn(`[fetchRealDividendHistory] Live fetch failed for ${sym}:`, err?.message);
    return {
      real:         false,
      source:       'error',
      dividends:    [],
      totalEntries: 0,
      fetchedAt:    null,
      error:        `Could not fetch live dividend data: ${err?.message || 'Network error'}`,
    };
  }

  return {
    real:         false,
    source:       'error',
    dividends:    [],
    totalEntries: 0,
    fetchedAt:    null,
    error:        'Failed to connect to dividend data service. Please try again later.',
  };
}


// ─────────────── helpers for corporate action cross-check ────────

/**
 * Converts a "FY YYYY/YY" label to approximate Gregorian date range.
 * Used by setupAnalyzer.js to match price-drop events to fiscal years.
 * Returns null if the label can't be parsed.
 */
export function fiscalYearToDateRange(fyLabel) {
  const m = String(fyLabel || '').match(/(\d{4})[/\-–](\d{2,4})/);
  if (!m) return null;
  const y1 = parseInt(m[1], 10);
  const y2 = m[2].length === 4 ? parseInt(m[2], 10) : parseInt(m[1].slice(0, 2) + m[2], 10);

  // Nepal BS to AD is approximately -57 years. Fiscal year runs mid-July to mid-July.
  const adY1 = y1 - 57;
  const adY2 = y2 - 57;
  return {
    start: new Date(`${adY1}-05-01`),   // generous ±2-month window
    end:   new Date(`${adY2}-10-01`),
    adY1,
    adY2,
  };
}

/**
 * Returns the dividend record matching a given Gregorian date, or null.
 * Used to confirm whether a price drop on a specific date was a known event.
 */
export function getDividendRecordForDate(dividends, date) {
  const d = new Date(date);
  for (const rec of dividends) {
    const range = fiscalYearToDateRange(rec.fiscalYear);
    if (!range) continue;
    if (d >= range.start && d <= range.end) return rec;
  }
  return null;
}

/**
 * Checks whether a given price drop (percent) on a given date could be
 * explained by a known bonus or right-share event within a ±6% tolerance.
 *
 * Returns { confirmed: bool, matchedEvent: DividendRecord|null }
 */
export function confirmCorporateAction(dividends, date, dropPct) {
  const rec = getDividendRecordForDate(dividends, date);
  if (!rec) return { confirmed: false, matchedEvent: null };

  const bonusPct = Number(rec.bonusShare || 0);
  const rightPct = Number(rec.rightShare || 0);

  if (bonusPct > 0) {
    const expectedDrop = (bonusPct / (100 + bonusPct)) * 100;
    if (Math.abs(expectedDrop - dropPct) <= 6) {
      return { confirmed: true, matchedEvent: { ...rec, type: 'bonus', expectedDrop: +expectedDrop.toFixed(2) } };
    }
  }

  if (rightPct > 0) {
    const expectedDrop = (rightPct / (100 + rightPct)) * 100; // approximation
    if (Math.abs(expectedDrop - dropPct) <= 8) {
      return { confirmed: true, matchedEvent: { ...rec, type: 'right', expectedDrop: +expectedDrop.toFixed(2) } };
    }
  }

  return { confirmed: false, matchedEvent: rec };
}

// ─────────────────── summary helpers ────────────────────────────

/** Returns total cash paid across all years. */
export function totalCashDividend(dividends) {
  return +dividends.reduce((s, d) => s + (d.cashDividend || 0), 0).toFixed(2);
}

/** Returns total bonus shares issued across all years. */
export function totalBonusShare(dividends) {
  return +dividends.reduce((s, d) => s + (d.bonusShare || 0), 0).toFixed(2);
}

/** Returns how many years the stock paid any dividend/bonus. */
export function dividendPayingYears(dividends) {
  return dividends.filter((d) => d.cashDividend > 0 || d.bonusShare > 0 || d.rightShare > 0).length;
}

/** Returns the most recent record with a non-zero value, or null. */
export function latestDividendRecord(dividends) {
  return dividends.find((d) => d.cashDividend > 0 || d.bonusShare > 0 || d.rightShare > 0) || null;
}
