/**
 * Book Closure Tracker — detects upcoming dividend/bonus book closures and
 * measures how THIS stock actually behaved before its past closures.
 *
 * Data rule: nothing here is invented. If a date can't be parsed unambiguously
 * (e.g. Bikram Sambat), the record is ignored. Run-up statistics are computed
 * from the stock's own price history, or reported as unavailable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse an AD date string. Returns a Date or null.
 * Bikram Sambat dates (year >= 2070) are rejected rather than guessed.
 */
export function parseDividendDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).replace(/\[.*?\]/g, '').trim();
  if (!s) return null;

  let y, m, d;
  let match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
  }
  if (y == null) {
    const t = new Date(s);
    return isNaN(t) ? null : t;
  }
  if (y >= 2070) return null; // Bikram Sambat — do not guess
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Extract the book-closure date from a dividend record (backend field: bookClosure). */
export function extractBookClosureDate(div) {
  if (!div) return null;
  const raw = div.bookClosure || div.bookClosureDate || div.bookCloseDate ||
              div.bookCloseFrom || div.closeDate || div.exDate || div.exDividendDate || null;
  return parseDividendDate(raw);
}

/** Nearest upcoming closure within `windowDays` (default 60). */
export function findUpcomingBookClosure(dividends, windowDays = 60) {
  if (!Array.isArray(dividends) || dividends.length === 0) return null;
  const now = Date.now() - DAY_MS; // include today
  const cutoff = now + (windowDays + 1) * DAY_MS;
  return dividends
    .map(div => ({ ...div, _closureDate: extractBookClosureDate(div) }))
    .filter(div => div._closureDate && +div._closureDate >= now && +div._closureDate <= cutoff)
    .sort((a, b) => a._closureDate - b._closureDate)[0] || null;
}

export function classifyClosureUrgency(closureDate) {
  const daysLeft = Math.ceil((new Date(closureDate) - Date.now()) / DAY_MS);
  if (daysLeft <= 0) return { label: 'CLOSED', color: '#64748b', daysLeft: 0 };
  if (daysLeft <= 7) return { label: 'IMMINENT', color: '#f87171', daysLeft };
  if (daysLeft <= 21) return { label: 'APPROACHING', color: '#fbbf24', daysLeft };
  return { label: 'UPCOMING', color: '#34d399', daysLeft };
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Measure this stock's actual price move in the `lookbackDays` calendar days
 * before each PAST book closure, using its own candle history.
 * Returns { samples: [{date, pct}], medianPct, count }.
 */
export function measurePastPreClosureRunups(dividends, history, lookbackDays = 21) {
  const out = { samples: [], medianPct: null, count: 0 };
  if (!Array.isArray(dividends) || !Array.isArray(history) || history.length < 30) return out;

  const candles = history
    .map(h => ({ t: +new Date(String(h.date).slice(0, 10)), c: Number(h.close) }))
    .filter(h => isFinite(h.t) && h.c > 0)
    .sort((a, b) => a.t - b.t);
  if (candles.length < 30) return out;

  const lastOnOrBefore = (t) => {
    let found = null;
    for (const c of candles) { if (c.t <= t) found = c; else break; }
    return found;
  };

  const seen = new Set();
  for (const div of dividends) {
    const cd = extractBookClosureDate(div);
    if (!cd || +cd >= Date.now()) continue;
    const key = cd.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);

    const end = lastOnOrBefore(+cd);
    const start = lastOnOrBefore(+cd - lookbackDays * DAY_MS);
    // Require real candles near both endpoints (within 5 days) and a distinct start
    if (!end || !start || end.t === start.t) continue;
    if (+cd - end.t > 5 * DAY_MS) continue;
    if ((+cd - lookbackDays * DAY_MS) - start.t > 5 * DAY_MS) continue;

    out.samples.push({ date: key, pct: +(((end.c - start.c) / start.c) * 100).toFixed(1) });
  }
  out.count = out.samples.length;
  out.medianPct = out.count ? +median(out.samples.map(s => s.pct)).toFixed(1) : null;
  return out;
}

/**
 * Build the alert for an upcoming closure. Returns null if none upcoming.
 * @param {string} symbol
 * @param {Array} dividends  records from /api/dividend-history
 * @param {Array} [history]  candles, used to measure past pre-closure behaviour
 */
export function buildBookClosureAlert(symbol, dividends, history = null) {
  const closure = findUpcomingBookClosure(dividends);
  if (!closure) return null;

  const urgency = classifyClosureUrgency(closure._closureDate);
  const bonusPct = Number(closure.bonusShare || closure.bonusPercent || 0);
  const cashDiv = Number(closure.cashDividend || closure.dividend || 0);
  const rightPct = Number(closure.rightShare || closure.rightPercent || 0);

  let type = 'Corporate Action';
  let typeColor = '#34d399';
  if (bonusPct > 0 && cashDiv > 0) { type = `${bonusPct}% Bonus + ${cashDiv}% Cash`; typeColor = '#a78bfa'; }
  else if (bonusPct > 0) { type = `${bonusPct}% Bonus Share`; typeColor = '#60a5fa'; }
  else if (rightPct > 0) { type = `${rightPct}% Right Share`; typeColor = '#fb923c'; }
  else if (cashDiv > 0) { type = `${cashDiv}% Cash Dividend`; typeColor = '#34d399'; }

  const past = measurePastPreClosureRunups(dividends, history, 21);
  let historicalNote;
  if (past.count >= 2) {
    const wins = past.samples.filter(s => s.pct > 0).length;
    historicalNote = `This stock's own last ${past.count} book closures: median ${past.medianPct}% move in the 21 days before closure (${wins}/${past.count} rose). Small sample — not a forecast`;
  } else if (past.count === 1) {
    historicalNote = `Only 1 past closure measurable (${past.samples[0].pct}% in the prior 21 days) — too few to infer a pattern`;
  } else {
    historicalNote = 'Not enough price history around past closures to measure a pre-closure pattern for this stock';
  }

  return {
    symbol, type, typeColor, bonusPct, cashDiv, rightPct,
    closureDate: closure._closureDate.toISOString().split('T')[0],
    ...urgency,
    pastRunups: past,
    historicalNote,
    // Buyers must hold shares by the last cum-date; T+2 settlement means buy ≥ 2 trading days earlier.
    settlementNote: 'NEPSE settles T+2: shares must be bought at least 2 trading days before the last cum-date to qualify.',
    rawRecord: closure,
  };
}
