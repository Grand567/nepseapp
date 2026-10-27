/**
 * src/utils/signals/fundamentalImporter.js
 * Authoritative Point-in-Time Data-Entry & Import Pipeline for Scrip Fundamentals
 *
 * Implements:
 * 1. Upsert scrip fundamental records with required audited fields:
 *    - symbol, sector, fiscal_quarter, paid_up_capital, public_float_kitta,
 *      promoter_share_pct, public_share_pct, eps_ttm, book_value_per_share,
 *      roe_pct, npl_pct, car_pct, distributable_eps, promoter_unlock_date,
 *      release_date (official report publication date), updated_at
 * 2. Strict Point-in-Time Joining:
 *    - getPointInTimeFundamentals(symbol, asOfDate): Returns ONLY rows whose
 *      release_date is on or before asOfDate (signalDate).
 *    - Returns NULL if release_date is missing, NULL, or in the future (> asOfDate).
 * 3. Batch import from JSON or array objects.
 */

import { db } from '../../../proxy/db/ledgerStore.js';

export function upsertScripFundamental(record = {}) {
  const symbol = String(record.symbol || '').toUpperCase().trim();
  if (!symbol) throw new Error('Symbol is required');

  const updatedAt = record.updated_at || record.updatedAt || new Date().toISOString();
  const fiscalQuarter = record.fiscal_quarter || record.fiscalQuarter || 'Q4 2081/82';
  const sector = record.sector || 'Others';
  const releaseDate = record.release_date || record.releaseDate || null;

  const paidUpCapital = record.paid_up_capital !== undefined ? Number(record.paid_up_capital) : null;
  const publicFloatKitta = record.public_float_kitta !== undefined ? Number(record.public_float_kitta) : null;
  const promoterSharePct = record.promoter_share_pct !== undefined ? Number(record.promoter_share_pct) : null;
  const publicSharePct = record.public_share_pct !== undefined ? Number(record.public_share_pct) : null;
  const epsTtm = record.eps_ttm !== undefined ? Number(record.eps_ttm) : (record.eps !== undefined ? Number(record.eps) : null);
  const bookValuePerShare = record.book_value_per_share !== undefined ? Number(record.book_value_per_share) : (record.bookValue !== undefined ? Number(record.bookValue) : null);
  const roePct = record.roe_pct !== undefined ? Number(record.roe_pct) : (record.roe !== undefined ? Number(record.roe) : null);
  const nplPct = record.npl_pct !== undefined ? Number(record.npl_pct) : (record.npl !== undefined ? Number(record.npl) : null);
  const carPct = record.car_pct !== undefined ? Number(record.car_pct) : (record.car !== undefined ? Number(record.car) : null);
  const distributableEps = record.distributable_eps !== undefined ? Number(record.distributable_eps) : null;
  const promoterUnlockDate = record.promoter_unlock_date || null;
  const promoterLockedKitta = record.promoter_locked_kitta !== undefined ? Number(record.promoter_locked_kitta) : 0;

  const stmt = db.prepare(`
    INSERT INTO scrip_fundamentals (
      symbol, sector, fiscal_quarter, paid_up_capital, public_float_kitta,
      promoter_share_pct, public_share_pct, eps_ttm, book_value_per_share,
      roe_pct, npl_pct, car_pct, distributable_eps, promoter_unlock_date,
      promoter_locked_kitta, release_date, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT(symbol) DO UPDATE SET
      sector = excluded.sector,
      fiscal_quarter = excluded.fiscal_quarter,
      paid_up_capital = excluded.paid_up_capital,
      public_float_kitta = excluded.public_float_kitta,
      promoter_share_pct = excluded.promoter_share_pct,
      public_share_pct = excluded.public_share_pct,
      eps_ttm = excluded.eps_ttm,
      book_value_per_share = excluded.book_value_per_share,
      roe_pct = excluded.roe_pct,
      npl_pct = excluded.npl_pct,
      car_pct = excluded.car_pct,
      distributable_eps = excluded.distributable_eps,
      promoter_unlock_date = excluded.promoter_unlock_date,
      promoter_locked_kitta = excluded.promoter_locked_kitta,
      release_date = excluded.release_date,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    symbol, sector, fiscalQuarter, paidUpCapital, publicFloatKitta,
    promoterSharePct, publicSharePct, epsTtm, bookValuePerShare,
    roePct, nplPct, carPct, distributableEps, promoterUnlockDate,
    promoterLockedKitta, releaseDate, updatedAt
  );

  return { success: true, symbol, release_date: releaseDate, updated_at: updatedAt };
}

export function importFundamentalsBatch(records = []) {
  if (!Array.isArray(records)) throw new Error('Expected an array of fundamental records');
  const results = [];
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      results.push(upsertScripFundamental(r));
    }
  });
  tx(records);
  return results;
}

/**
 * Point-in-Time Fundamental Retrieval:
 * Returns the most recent fundamental report released ON OR BEFORE the given signal date.
 * If release_date is null or after the signal date, returns NULL (never looks ahead).
 */
export function getPointInTimeFundamentals(symbol, signalDate) {
  if (!symbol || !signalDate) return null;
  const sym = String(symbol).toUpperCase().trim();
  const dateStr = String(signalDate).slice(0, 10);

  const row = db.prepare(`
    SELECT * FROM scrip_fundamentals
    WHERE UPPER(symbol) = ?
      AND release_date IS NOT NULL
      AND release_date <= ?
    ORDER BY release_date DESC
    LIMIT 1
  `).get(sym, dateStr);

  return row || null;
}

export function getScripFundamental(symbol) {
  if (!symbol) return null;
  const sym = String(symbol).toUpperCase().trim();
  const row = db.prepare('SELECT * FROM scrip_fundamentals WHERE UPPER(symbol) = ?').get(sym);
  return row || null;
}
