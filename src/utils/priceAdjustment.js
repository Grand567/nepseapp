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
export const PAR_VALUE_EQUITY = 100;
export const STATUTORY_DIVIDEND_TAX_RATE = 0.05; // 5.0% final withholding tax on cash dividends (Income Tax Act Sec. 88)
export const NEPSE_CASH_DIV_PRICE_ADJ_THRESHOLD = 0.10; // Cash dividend only adjusts market price if > 10% of pre-close LTP

/**
 * 1. Official NEPSE Bonus Share Market Price Adjustment:
 *    Adjusted Price = Market Price / (1 + (Bonus % / 100))
 */
export function calculateBonusAdjustedPrice(marketPrice, bonusPercent) {
  const p = Number(marketPrice || 0);
  const b = Math.max(0, Number(bonusPercent || 0)) / 100;
  if (p <= 0) return 0;
  return +((p / (1 + b)).toFixed(2));
}

/**
 * 2. Official NEPSE Right Share Market Price Adjustment:
 *    Adjusted Price = (Market Price + (Right Ratio * Subscription Price)) / (1 + Right Ratio)
 *    Accepts rightRatio as either decimal (0.50 for 50% / 1:0.5) or percentage (50 for 50%).
 */
export function calculateRightAdjustedPrice(marketPrice, rightRatioOrPct, subscriptionPrice = PAR_VALUE_EQUITY) {
  const p = Number(marketPrice || 0);
  const rawR = Math.max(0, Number(rightRatioOrPct || 0));
  // Treat percentage inputs (> 1.0) as percent; only fractional decimals (0..1) are direct ratios
  const r = rawR > 1.0 ? rawR / 100 : rawR;
  const sub = Number(subscriptionPrice || PAR_VALUE_EQUITY);
  if (p <= 0) return 0;
  return +(((p + (r * sub)) / (1 + r)).toFixed(2));
}

/**
 * 3. Simultaneous Bonus + Right + Cash Dividend Adjustment per NEPSE Bylaws:
 *    - Simultaneous Bonus (B) + Right (R): P_adj = (P_cum + R * S) / (1 + B + R)
 *    - Cash Dividend (D_cash): Adjusted from market price ONLY if Cash Dividend > 10% of Market Price.
 */
export function calculateNepseCorporateActionAdjustment({
  marketPrice,
  bonusPercent = 0,
  rightPercent = 0,
  cashDividendPercent = 0,
  paidUpValue = PAR_VALUE_EQUITY,
  subscriptionPrice = PAR_VALUE_EQUITY
}) {
  const pCum = Number(marketPrice || 0);
  if (pCum <= 0) return null;

  const bRatio = Math.max(0, Number(bonusPercent || 0)) / 100;
  const rawRight = Math.max(0, Number(rightPercent || 0));
  // Parameter is explicitly rightPercent (e.g. 2.5 -> 0.025, 50 -> 0.50, 100 -> 1.00)
  const rRatio = rawRight / 100;
  const cashPct = Math.max(0, Number(cashDividendPercent || 0));
  const par = Number(paidUpValue || PAR_VALUE_EQUITY);
  const subPrice = Number(subscriptionPrice || PAR_VALUE_EQUITY);

  const grossCashDivPerShare = +((cashPct / 100) * par).toFixed(2);
  const dividendTaxPerShare = +(grossCashDivPerShare * STATUTORY_DIVIDEND_TAX_RATE).toFixed(2);
  const netCashDivPerShare = +(grossCashDivPerShare - dividendTaxPerShare).toFixed(2);

  // NEPSE Bylaw: Cash dividend reduces base price ONLY if gross cash dividend >= 10% of previous closing market price
  const cashDivToMarketRatio = pCum > 0 ? grossCashDivPerShare / pCum : 0;
  const isCashDivPriceAdjusted = cashDivToMarketRatio >= (NEPSE_CASH_DIV_PRICE_ADJ_THRESHOLD - 1e-6);

  const cashDeduction = isCashDivPriceAdjusted ? grossCashDivPerShare : 0;
  const denominator = 1 + bRatio + rRatio;
  const adjustedPrice = denominator > 0
    ? +(((pCum - cashDeduction + (rRatio * subPrice)) / denominator).toFixed(2))
    : pCum;

  const priceDropPct = pCum > 0 ? +(((pCum - adjustedPrice) / pCum) * 100).toFixed(2) : 0;

  return {
    cumPrice: pCum,
    adjustedPrice: Math.max(10, adjustedPrice),
    priceDropPct,
    bonusPercent: +(bRatio * 100).toFixed(2),
    rightPercent: +(rRatio * 100).toFixed(2),
    cashDividendPercent: cashPct,
    grossCashDivPerShare,
    dividendTaxPerShare,
    netCashDivPerShare,
    isCashDivPriceAdjusted,
    cashDivToMarketPct: +(cashDivToMarketRatio * 100).toFixed(2),
    formulaUsed: `(${pCum}${isCashDivPriceAdjusted ? ` - ${grossCashDivPerShare}` : ''} + (${rRatio} * ${subPrice})) / (1 + ${bRatio} + ${rRatio})`
  };
}

/**
 * Parses a corporate action record into a normalised structure.
 * Handles the formats returned by /api/dividend-history/:symbol
 *
 * @param {Object} action - Raw action from the API
 * @returns {{ date: string, type: 'bonus'|'right'|'cash', adjustmentFactor: number } | null}
 */
function parseCorporateAction(action) {
  if (!action) return null;

  // Determine the ex-date: prefer 'exDate', fallback to 'bookCloseDate', 'book_close_date', 'bookClosure', 'bookclose_date' or 'date'
  const rawDate = action.exDate || action.bookCloseDate || action.book_close_date || action.bookClosure || action.bookclose_date || action.date;
  if (!rawDate) return null;
  const date = String(rawDate).slice(0, 10); // YYYY-MM-DD

  const bonusPct = Number(action.bonusPercent ?? action.bonusShare ?? action.bonusSharePct ?? action.bonus_share_pct ?? 0);
  let rightPct = Number(action.rightPercent ?? action.rightShare ?? action.rightSharePct ?? 0);
  if (!rightPct && typeof (action.rightShareRatio ?? action.right_share_ratio) === 'string') {
    const m = String(action.rightShareRatio ?? action.right_share_ratio).match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
    if (m && Number(m[1]) > 0) rightPct = (Number(m[2]) / Number(m[1])) * 100;
  }
  const issuePrice = Number(action.issuePrice || action.rightIssuePrice || PAR_VALUE_EQUITY);
  const cashDivPct = Number(action.cashDividendPct ?? action.cash_dividend_pct ?? action.cashDividend ?? action.cashDiv ?? action.dividend ?? 0);

  const safeBonus = bonusPct > 0 && bonusPct <= 500 ? bonusPct : 0;
  const safeRight = rightPct > 0 && rightPct <= 500 ? rightPct : 0;
  const safeCash = cashDivPct > 0 ? cashDivPct : 0;
  if (!safeBonus && !safeRight && !safeCash) return null;

  return { date, bonusPct: safeBonus, rightPct: safeRight, issuePrice, cashDivPct: safeCash };
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

  // Merge simultaneous corporate actions sharing the same ex-date so Bonus + Right + Cash use exact NEPSE formula
  const byDate = new Map();
  for (const raw of corporateActions) {
    const parsed = parseCorporateAction(raw);
    if (!parsed) continue;
    const prev = byDate.get(parsed.date) || { date: parsed.date, bonusPct: 0, rightPct: 0, issuePrice: PAR_VALUE_EQUITY, cashDivPct: 0 };
    prev.bonusPct += parsed.bonusPct;
    prev.rightPct += parsed.rightPct;
    if (parsed.rightPct > 0) prev.issuePrice = parsed.issuePrice;
    prev.cashDivPct += parsed.cashDivPct;
    byDate.set(parsed.date, prev);
  }
  const actions = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));

  if (actions.length === 0) {
    return candles.map(c => ({ ...c, isAdjusted: false, adjustmentFactor: 1, rawClose: c.close }));
  }

  const result = candles.map(c => ({ ...c })); // shallow copy
  let cumulativeFactor = 1;

  for (const action of actions) {
    const firstAdjustedIdx = result.findIndex(c => String(c.date).slice(0, 10) >= action.date);
    if (firstAdjustedIdx <= 0) continue;

    const cumClose = result[firstAdjustedIdx - 1]?.close || 0;
    if (cumClose <= 0) continue;

    const adj = calculateNepseCorporateActionAdjustment({
      marketPrice: cumClose,
      bonusPercent: action.bonusPct,
      rightPercent: action.rightPct,
      cashDividendPercent: action.cashDivPct,
      subscriptionPrice: action.issuePrice
    });
    const actionFactor = adj && cumClose > 0 ? adj.adjustedPrice / cumClose : 1;
    if (Math.abs(actionFactor - 1) < 1e-6) continue;

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
    const dateStr = d.date ? String(d.date).slice(0, 10) : '';
    const [y, m, dayNum] = dateStr.split('-').map(Number);
    const dt = (!isNaN(y) && !isNaN(m) && !isNaN(dayNum))
      ? new Date(Date.UTC(y, m - 1, dayNum, 12, 0, 0))
      : new Date(d.date);
    if (isNaN(dt.getTime())) continue;

    // Regime Shift: Before April 6, 2026, trading week started Sunday (day 0).
    // From April 6, 2026 onward, trading week starts Monday (day 1).
    const isPostShift = dateStr >= '2026-04-06';
    const weekStartDt = new Date(dt);
    if (isPostShift) {
      const day = dt.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
      const daysToMonday = day === 0 ? 6 : day - 1; // roll back to Monday
      weekStartDt.setUTCDate(dt.getUTCDate() - daysToMonday);
    } else {
      const day = dt.getUTCDay(); // roll back to Sunday (day 0)
      const daysToSunday = day === 6 ? 6 : day;
      weekStartDt.setUTCDate(dt.getUTCDate() - daysToSunday);
    }
    const weekKey = weekStartDt.toISOString().slice(0, 10);

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
