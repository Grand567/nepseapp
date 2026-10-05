/**
 * C1 — Corporate-Action Price Adjustment (Back-Adjustment)
 * ─────────────────────────────────────────────────────────────────────────────
 * Adjusts historical OHLCV candles for bonus shares, right shares, and cash
 * dividends so that price continuity is maintained across ex-dates.
 *
 * Without adjustment, a 20% bonus issue shows a ~17% price drop on the ex-date.
 * RSI, MACD, EMA calculated on unadjusted data will generate false signals
 * around those dates.
 *
 * METHOD: Multiplicative back-adjustment (industry standard, used by NSE/BSE).
 *   - For each corporate action on date D, all candles BEFORE D are multiplied
 *     by an adjustment factor so the chart is continuous at D.
 *   - This preserves percentage returns correctly (additive adjustment distorts
 *     percentage calculations for older bars).
 *
 * ADJUSTMENT FACTORS:
 *   Bonus share (B%): factor = 1 / (1 + B/100)
 *     e.g. 20% bonus → divide all prior prices by 1.20 (prices drop ~16.67%)
 *   Right share (R% at issue price P_issue):
 *     factor = (P_ex) / (P_cum) where P_ex and P_cum are theoretical ex/cum prices.
 *     Simplified: (currentPrice) / (currentPrice + R/100 * P_issue)
 *     We use a conservative approximation since issue price is not always available.
 *   Cash dividend (D): factor = (P_ex) / (P_cum) = (P - D) / P
 *     where P is the closing price on the last cum-dividend day.
 *
 * REFERENCES:
 *   - NEPSE guidelines on corporate actions
 *   - CFA Institute: Back-Adjusting Prices for Splits and Dividends
 *   - Standard practice used by Bloomberg, Reuters, NSE India
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT DISCLAIMER:
 * Adjusted prices are for technical analysis ONLY. They are NOT real traded
 * prices and must NEVER be shown to users as actual market prices. Always label
 * adjusted series clearly as "Adjusted for Corporate Actions".
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Parses a corporate action record into a normalised structure.
 * Handles the formats returned by /api/dividend-history/:symbol
 *
 * @param {Object} action - Raw action from the API
 * @returns {{ date: string, type: 'bonus'|'right'|'cash', adjustmentFactor: number } | null}
 */
function parseCorporateAction(action) {
  if (!action) return null;

  // Determine the ex-date: prefer 'exDate', fallback to 'bookCloseDate' or 'date'
  const rawDate = action.exDate || action.bookCloseDate || action.date;
  if (!rawDate) return null;
  const date = String(rawDate).slice(0, 10); // YYYY-MM-DD

  const type = (action.type || '').toLowerCase();

  // ── Bonus share ──────────────────────────────────────────────────────────────
  if (type === 'bonus' || action.bonusPercent > 0 || action.bonusShare > 0) {
    const pct = Number(action.bonusPercent || action.bonusShare || 0);
    if (pct <= 0 || pct > 500) return null; // sanity check
    const adjustmentFactor = 1 / (1 + pct / 100);
    return { date, type: 'bonus', pct, adjustmentFactor,
      label: `${pct}% Bonus` };
  }

  // ── Right share ───────────────────────────────────────────────────────────────
  if (type === 'right' || action.rightPercent > 0 || action.rightShare > 0) {
    const pct = Number(action.rightPercent || action.rightShare || 0);
    const issuePrice = Number(action.issuePrice || action.rightIssuePrice || 100); // par = Rs.100
    if (pct <= 0 || pct > 200) return null;
    // Theoretical adjustment: proportion of new shares × (issue price / current price)
    // We store the raw values and compute the factor at call-time (needs current price context)
    return { date, type: 'right', pct, issuePrice, adjustmentFactor: null,
      label: `${pct}% Rights @ Rs.${issuePrice}` };
  }

  // ── Cash dividend ─────────────────────────────────────────────────────────────
  if (type === 'cash' || type === 'dividend' || action.cashDividend > 0 || action.dividend > 0) {
    const div = Number(action.cashDividend || action.dividend || 0);
    if (div <= 0) return null;
    // Factor is computed at call-time since we need the cum-dividend price
    return { date, type: 'cash', div, adjustmentFactor: null,
      label: `Rs.${div} Cash Dividend` };
  }

  return null;
}

/**
 * C1: Back-adjusts a sorted array of OHLCV candles for all known corporate actions.
 *
 * @param {Array<{date,open,high,low,close,volume,...}>} candles
 *   Must be sorted ascending by date (oldest first).
 * @param {Array<Object>} corporateActions
 *   Array of action records from /api/dividend-history/:symbol.
 * @param {Object} [options]
 * @param {boolean} [options.adjustVolume=false]
 *   If true, divides volume by the factor (so shares × factor = adjusted shares).
 *   Disabled by default since adjusted volume is harder to interpret.
 *
 * @returns {Array}
 *   A new candle array with adjusted OHLC values. Original candles are not mutated.
 *   Each candle gets:
 *     - isAdjusted: true
 *     - adjustmentFactor: cumulative factor applied
 *     - rawClose: original unadjusted close price
 */
export function adjustPricesForCorporateActions(candles, corporateActions = [], options = {}) {
  if (!candles || candles.length === 0) return candles;
  if (!corporateActions || corporateActions.length === 0) {
    // No actions — return a shallow copy tagged as unadjusted
    return candles.map(c => ({ ...c, isAdjusted: false, adjustmentFactor: 1, rawClose: c.close }));
  }

  const { adjustVolume = false } = options;

  // Parse and filter valid actions, sort descending (most recent first)
  const actions = corporateActions
    .map(a => parseCorporateAction(a))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  if (actions.length === 0) {
    return candles.map(c => ({ ...c, isAdjusted: false, adjustmentFactor: 1, rawClose: c.close }));
  }

  // Work through candles newest-to-oldest, accumulating adjustment factors
  // We iterate candles in reverse order (newest first) so we can look up the
  // closing price immediately before each ex-date for right/cash factor calculation.

  const result = candles.map(c => ({ ...c })); // shallow copy

  // Cumulative factor applied to bars before the current action date
  let cumulativeFactor = 1;

  // Process actions newest-to-oldest
  for (const action of actions) {
    // Find the index of the first candle ON or AFTER the ex-date
    const firstAdjustedIdx = result.findIndex(c => String(c.date).slice(0, 10) >= action.date);
    if (firstAdjustedIdx <= 0) continue; // action is before all data or no pre-ex candles

    // For right shares and cash dividends: use the closing price of the candle
    // just before ex-date to calculate the adjustment factor dynamically
    let actionFactor = action.adjustmentFactor;

    if (action.type === 'right' && actionFactor === null) {
      // Theoretical ex-right price: P_ex = (P_cum + ratio × issue_price) / (1 + ratio)
      // where ratio = rightPercent / 100
      const cumClose = result[firstAdjustedIdx - 1]?.close || 0;
      if (cumClose > 0) {
        const ratio = action.pct / 100;
        const exPrice = (cumClose + ratio * action.issuePrice) / (1 + ratio);
        actionFactor = exPrice / cumClose;
      } else {
        actionFactor = 1; // cannot compute — skip
      }
    }

    if (action.type === 'cash' && actionFactor === null) {
      const cumClose = result[firstAdjustedIdx - 1]?.close || 0;
      if (cumClose > 0 && action.div < cumClose) {
        actionFactor = (cumClose - action.div) / cumClose;
      } else {
        actionFactor = 1;
      }
    }

    if (!actionFactor || actionFactor <= 0 || actionFactor > 2) continue; // safety guard

    // Accumulate: prior candles need ALL factors applied (compound)
    cumulativeFactor *= actionFactor;

    // Apply this factor to all candles BEFORE the ex-date.
    // IMPORTANT: multiply from the current (already-adjusted) prices, NOT from rawClose.
    // This correctly compounds multiple sequential adjustments (e.g. 10% bonus then 20% bonus).
    // rawClose / rawOpen / rawHigh / rawLow are only set once (on first adjustment) as a record
    // of the original unadjusted value — they must NOT be used for subsequent multiplications.
    for (let i = 0; i < firstAdjustedIdx; i++) {
      const c = result[i];
      // Preserve originals only on the first adjustment pass
      if (c.rawClose === undefined) {
        c.rawClose = c.close;
        c.rawOpen  = c.open;
        c.rawHigh  = c.high;
        c.rawLow   = c.low;
      }
      // Compound: multiply the already-adjusted prices by this action's factor
      c.open  = +(c.open  * actionFactor).toFixed(2);
      c.high  = +(c.high  * actionFactor).toFixed(2);
      c.low   = +(c.low   * actionFactor).toFixed(2);
      c.close = +(c.close * actionFactor).toFixed(2);
      if (adjustVolume && c.volume > 0) {
        c.volume = Math.round(c.volume / actionFactor);
      }
      c.isAdjusted = true;
      c.adjustmentFactor = +(cumulativeFactor.toFixed(6));
    }

  }

  // Tag unadjusted candles (those after the oldest action's ex-date)
  for (const c of result) {
    if (!c.isAdjusted) {
      c.isAdjusted = false;
      c.adjustmentFactor = 1;
      c.rawClose = c.close;
    }
  }

  return result;
}

/**
 * C2 — Weekly candle aggregation from daily candles.
 *
 * Aggregates a sorted daily OHLCV series into weekly candles.
 * Week starts on Monday (NEPSE trades Mon–Fri).
 * A partial week at the end (current incomplete week) is included.
 *
 * @param {Array<{date,open,high,low,close,volume,turnover,trades}>} dailyCandles
 *   Sorted ascending by date.
 * @returns {Array} Weekly OHLCV candles, each tagged with weekStart and weekEnd dates.
 */
export function aggregateToWeeklyCandles(dailyCandles) {
  if (!dailyCandles || dailyCandles.length === 0) return [];

  const weeks = new Map(); // weekStartISO → accumulated candle

  for (const d of dailyCandles) {
    const dt = new Date(d.date);
    if (isNaN(dt.getTime())) continue;

    // ISO week: Monday = day 1. Get Monday of the current week.
    const day = dt.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysToMonday = day === 0 ? 6 : day - 1; // roll back to Monday
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - daysToMonday);
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, {
        date:      weekKey,          // week-start date (Monday)
        weekStart: weekKey,
        weekEnd:   d.date,           // updated to last day in week
        open:      Number(d.open  || d.close),
        high:      Number(d.high  || d.close),
        low:       Number(d.low   || d.close),
        close:     Number(d.close),
        volume:    Number(d.volume   || 0),
        turnover:  Number(d.turnover || 0),
        trades:    Number(d.trades   || 0),
        isReal:    Boolean(d.isReal),
        isWeekly:  true,
        daysCount: 1,
      });
    } else {
      const w = weeks.get(weekKey);
      w.high    = Math.max(w.high, Number(d.high  || d.close));
      w.low     = Math.min(w.low,  Number(d.low   || d.close));
      w.close   = Number(d.close);                        // last day's close
      w.volume  += Number(d.volume   || 0);
      w.turnover += Number(d.turnover || 0);
      w.trades  += Number(d.trades   || 0);
      w.weekEnd  = d.date;
      w.isReal   = w.isReal || Boolean(d.isReal);
      w.daysCount++;
    }
  }

  return Array.from(weeks.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * C3 — Liquidity classification for a stock.
 *
 * Classifies a stock's liquidity based on its recent average daily turnover.
 * Used to filter screener results and display liquidity warnings.
 *
 * THRESHOLDS (calibrated for NEPSE market size):
 *   HIGH_LIQUIDITY   : avgDailyTurnover >= Rs. 1 Crore (1,00,00,000)
 *   MID_LIQUIDITY    : >= Rs. 10 Lakhs (10,00,000)
 *   LOW_LIQUIDITY    : >= Rs. 1 Lakh  (1,00,000)
 *   ILLIQUID         : < Rs. 1 Lakh   (1,00,000)
 *
 * @param {Object} stock - Stock object from enriched live data
 * @param {Array}  [history] - Optional recent OHLCV history for trailing avg
 * @param {number} [lookbackDays=20] - How many days to average
 * @returns {{ class, label, avgDailyTurnover, isIlliquid, warning }}
 */
export function classifyLiquidity(stock, history = null, lookbackDays = 20) {
  let avgDailyTurnover = Number(stock?.turnover || 0);

  // If we have history, use the trailing average (more reliable than one day)
  if (history && Array.isArray(history) && history.length >= 5) {
    const recent = history.slice(-Math.min(lookbackDays, history.length));
    const totalTurnover = recent.reduce((sum, d) => sum + Number(d.turnover || 0), 0);
    avgDailyTurnover = totalTurnover / recent.length;
  }

  let liquidityClass, label, isIlliquid, warning;

  if (avgDailyTurnover >= 10_000_000) {       // >= Rs. 1 Crore
    liquidityClass = 'HIGH';
    label = '🟢 High Liquidity';
    isIlliquid = false;
    warning = null;
  } else if (avgDailyTurnover >= 1_000_000) { // >= Rs. 10 Lakhs
    liquidityClass = 'MID';
    label = '🟡 Mid Liquidity';
    isIlliquid = false;
    warning = null;
  } else if (avgDailyTurnover >= 100_000) {   // >= Rs. 1 Lakh
    liquidityClass = 'LOW';
    label = '🟠 Low Liquidity';
    isIlliquid = false;
    warning = 'Low trading volume. Large orders may move the price significantly. Use limit orders.';
  } else {
    liquidityClass = 'ILLIQUID';
    label = '🔴 Illiquid';
    isIlliquid = true;
    warning = 'Very thin trading volume (< Rs. 1L/day). Entry/exit may be extremely difficult. ' +
      'Technical signals are unreliable on illiquid stocks. Exercise extreme caution.';
  }

  return {
    class: liquidityClass,
    label,
    avgDailyTurnover: Math.round(avgDailyTurnover),
    avgDailyTurnoverLakhs: +(avgDailyTurnover / 100_000).toFixed(2),
    isIlliquid,
    warning,
  };
}
