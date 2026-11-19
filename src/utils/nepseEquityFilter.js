// src/utils/nepseEquityFilter.js
// Canonical NEPSE equity classification helpers.
// Excludes Mutual Funds, Debentures, Bonds, Promoter Shares, and Preference Shares
// without false-positives on ordinary equities whose tickers end in F/Y/MF (CITY, HATHY, NMBMF, SWMF).

const NON_EQUITY_SECTOR_RE = /(mutual|debenture|bond|promoter|preference)/i;
const NON_EQUITY_NAME_RE = /(mutual\s*fund|debenture|promoter|promotor|rinpatra|urja\s*rinpatra|perpetual|non[- ]?cumulative|preference\s*share|yojana|scheme|investment\s*fund|growth\s*fund|equity\s*fund|balanced\s*fund|saving\s*fund|closed[- ]?end|open[- ]?end|\bbond\b)/i;
const KNOWN_NON_EQUITY_SYMBOLS_RE = /^(NIBLPF|NIBSF|NIBLSTF|CMBF|NICGF|NICBF|NICFC|SFMF|SEF|SAEF|SLCF|SBCF|HLICF|KEF|LUK|RMF|RBBMF|PSF|GIMES|MMF|KSY|RSY|CSY|NSY|GSY|SSY|KSLY|SAGF|PRSF|LVF|HLBSF|SIGS)$/i;
const PROTECTED_ORDINARY_EQUITIES = new Set(['CITY', 'HATHY', 'NMBMF', 'SWMF', 'SANIMA', 'SHIVM', 'NADEP']);

/**
 * Checks if a NEPSE security is a non-equity instrument (mutual fund, debenture, bond, promoter/preference share).
 * @param {string} sym
 * @param {string} [sector]
 * @param {string} [name]
 * @param {number} [ltp=100]
 * @returns {boolean}
 */
export function isMutualFundOrDebenture(sym = '', sector = '', name = '', ltp = 100) {
  const s = String(sym || '').toUpperCase().trim();
  const sec = String(sector || '').toLowerCase().trim();
  const n = String(name || '').toLowerCase().trim();
  const price = Number(ltp);

  if (!s) return true;

  // 1. Explicit sector / name classification always wins
  if (NON_EQUITY_SECTOR_RE.test(sec)) return true;
  if (NON_EQUITY_NAME_RE.test(n)) return true;

  // 2. Real NEPSE digit-bearing non-equities: debentures/bonds/indices (2+ digits: ADBLD83, GBILD84/85, NMB50, H8020),
  // numbered closed-end MF series (NBF2, CMF2, RMF1, SIGS3, GIBF1, GIMES1), or sub-Rs.30 numbered units.
  if (
    /\d{2,}/.test(s) ||
    /(MF|BF|SF|PF|VF|CF|GF|IF|EF|GS|ES|SY|LY|F)\d$/i.test(s) ||
    (Number.isFinite(price) && price > 0 && price < 30 && /\d/.test(s))
  ) {
    return true;
  }

  // 3. Known mutual fund / promoter / preference suffixes and slash-series tickers
  if (s.includes('/') || /(PO|PR|PNP)$/.test(s) || s.includes('DEB')) return true;
  if (s.endsWith('P') && !PROTECTED_ORDINARY_EQUITIES.has(s)) return true;
  if (KNOWN_NON_EQUITY_SYMBOLS_RE.test(s)) return true;

  // 4. Protect confirmed ordinary equities (e.g. CITY, HATHY, NMBMF, SWMF, NADEP) when not classified as MF/debenture above
  if (PROTECTED_ORDINARY_EQUITIES.has(s) && (!Number.isFinite(price) || price <= 0 || price >= 30)) {
    return false;
  }

  // 5. Sub-Rs.30 MF/Yojana scheme tickers ending in F or Y (plus >=5 char *PF/*SF/*MF outside microfinance)
  if (Number.isFinite(price) && price > 0 && price < 30 && (s.endsWith('F') || s.endsWith('Y'))) {
    return true;
  }
  if (s.length >= 5 && (s.endsWith('PF') || s.endsWith('SF') || s.endsWith('MF'))) {
    if (sec.includes('microfinance') || n.includes('microfinance') || n.includes('laghubitta')) return false;
    return true;
  }
  if (s.endsWith('F') && s.length >= 4) {
    if (sec.includes('microfinance') || n.includes('microfinance') || n.includes('laghubitta')) return false;
    return true;
  }

  return false;
}

/**
 * Returns true strictly for tradable ordinary NEPSE equities.
 * @param {object|string} stockOrSym
 * @param {string} [sectorStr]
 * @returns {boolean}
 */
export function isPureNepseEquity(stockOrSym, sectorStr) {
  if (!stockOrSym) return false;
  const isObj = typeof stockOrSym === 'object';
  const sym = String(
    isObj ? (stockOrSym.symbol || stockOrSym.stockSymbol || stockOrSym.scrip || '') : stockOrSym
  ).toUpperCase().trim();
  const sec = String(
    sectorStr ?? (isObj ? (stockOrSym.sector || stockOrSym.sectorName || '') : '')
  );
  const name = String(isObj ? (stockOrSym.companyName || stockOrSym.name || '') : '');
  const rawPrice = isObj ? (stockOrSym.ltp ?? stockOrSym.closePrice ?? stockOrSym.price) : undefined;
  const price = rawPrice != null && rawPrice !== '' ? Number(rawPrice) : 100;

  return !isMutualFundOrDebenture(sym, sec, name, price);
}

export const isTradableOrdinaryEquity = isPureNepseEquity;
