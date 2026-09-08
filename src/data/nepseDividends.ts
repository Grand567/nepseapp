/**
 * NEPSE Dividend Database — EMPTIED
 * -----------------------------------------------------------------
 * src/data/nepseDividends.ts
 *
 * This static pre-compiled database has been removed.
 * All dividend, bonus share, and right share data is now fetched
 * live from ShareSansar (primary) and Merolagani (fallback) via the
 * backend endpoint: GET /api/dividend-history/:symbol
 *
 * No mock data. No static data. Live only.
 */

export interface VerifiedDividendItem {
  fiscalYear: string;
  cashDividend: number;
  bonusShare: number;
  rightShare: number;
  totalYield: number;
  bookClosure: string;
}

export const VERIFIED_DIVIDEND_DATABASE: Record<string, VerifiedDividendItem[]> = {};