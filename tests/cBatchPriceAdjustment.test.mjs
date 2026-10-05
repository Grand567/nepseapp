/**
 * C-Batch tests: Price Adjustment, Weekly Aggregation, Liquidity Classification
 */
import {
  adjustPricesForCorporateActions,
  aggregateToWeeklyCandles,
  classifyLiquidity,
} from '../src/utils/priceAdjustment.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++; }
  else { console.error('  FAIL:', msg); fail++; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// 10 daily candles at price 120, one candle after ex-date at 100
const makeCandles = (prices, startDate = '2026-01-01') => prices.map((close, i) => {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i);
  return {
    date: d.toISOString().slice(0, 10),
    open: close, high: close + 2, low: close - 2, close,
    volume: 10000, turnover: close * 10000, trades: 100, isReal: true
  };
});

// ── C1: Bonus Share Adjustment ───────────────────────────────────────────────
console.log('\n[C1] Bonus Share Back-Adjustment');

// 20% bonus on 2026-01-06 (index 5 in the series)
// Pre-ex candles should be divided by 1.20 → factor = 1/1.2 ≈ 0.8333
const bonusCandles = makeCandles([120, 120, 120, 120, 120, 100, 100, 100, 100, 100]);
const bonusAction = [{ type: 'bonus', bonusPercent: 20, exDate: '2026-01-06' }];
const adjusted = adjustPricesForCorporateActions(bonusCandles, bonusAction);

const factor = 1 / 1.2;
assert(adjusted[0].isAdjusted === true, 'Pre-ex candle is marked isAdjusted');
assert(Math.abs(adjusted[0].close - 120 * factor) < 0.01, `Pre-ex close adjusted: ${adjusted[0].close.toFixed(2)} ≈ ${(120*factor).toFixed(2)}`);
assert(adjusted[0].rawClose === 120, 'rawClose preserved as 120');
assert(Math.abs(adjusted[4].close - 120 * factor) < 0.01, 'All 5 pre-ex candles adjusted');
assert(adjusted[5].isAdjusted === false, 'Ex-date candle is NOT adjusted');
assert(adjusted[5].close === 100, 'Ex-date close unchanged at 100');
assert(adjusted[9].close === 100, 'Post-ex candle unchanged');

// Adjustment factor stored on each pre-ex candle
assert(Math.abs(adjusted[0].adjustmentFactor - factor) < 0.0001, `adjustmentFactor stored: ${adjusted[0].adjustmentFactor}`);

// ── C1: Stacked bonus actions ─────────────────────────────────────────────────
console.log('\n[C1] Stacked Bonus Actions (10% then 20%)');
// Action 1: 10% bonus on day 4, Action 2: 20% bonus on day 7
const stackedCandles = makeCandles([100, 100, 100, 100, 83, 83, 83, 70, 70, 70]);
const stackedActions = [
  { type: 'bonus', bonusPercent: 10, exDate: '2026-01-05' },  // factor 1/1.1
  { type: 'bonus', bonusPercent: 20, exDate: '2026-01-08' },  // factor 1/1.2
];
const stackedAdj = adjustPricesForCorporateActions(stackedCandles, stackedActions);
// Candle 0: both factors applied → 100 × (1/1.1) × (1/1.2) = 75.76
const expectedC0 = 100 * (1/1.1) * (1/1.2);
assert(Math.abs(stackedAdj[0].close - expectedC0) < 0.1,
  `Stacked: candle[0] close ≈ ${expectedC0.toFixed(2)}: got ${stackedAdj[0].close}`);
// Candles 4-6: only second (20%) factor → 83 × (1/1.2) ≈ 69.17
const expectedC4 = 83 * (1/1.2);
assert(Math.abs(stackedAdj[4].close - expectedC4) < 0.1,
  `Stacked: candle[4] close ≈ ${expectedC4.toFixed(2)}: got ${stackedAdj[4].close}`);

// ── C1: Cash dividend ─────────────────────────────────────────────────────────
console.log('\n[C1] Cash Dividend Back-Adjustment');
// Rs. 10 cash dividend, cum-price = 100 → factor = 90/100 = 0.9
const divCandles = makeCandles([100, 100, 100, 90, 90, 90]);
const divAction  = [{ type: 'cash', cashDividend: 10, exDate: '2026-01-04' }];
const divAdj = adjustPricesForCorporateActions(divCandles, divAction);
assert(Math.abs(divAdj[0].close - 90) < 0.01, `Cash div: pre-ex close 100→90: ${divAdj[0].close}`);
assert(divAdj[3].close === 90, 'Ex-date candle unchanged');

// ── C1: No actions → unadjusted passthrough ──────────────────────────────────
const plain = adjustPricesForCorporateActions(bonusCandles, []);
assert(plain[0].isAdjusted === false, 'No actions → isAdjusted=false');
assert(plain[0].adjustmentFactor === 1, 'No actions → factor=1');
assert(plain[0].rawClose === plain[0].close, 'No actions → rawClose=close');

// ── C2: Weekly Candle Aggregation ────────────────────────────────────────────
console.log('\n[C2] Weekly Candle Aggregation (Mon–Fri)');

// Build 10 trading days (Mon 2026-01-05 to Fri 2026-01-16, skipping weekend)
const tradingDays = [
  '2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09', // Week 1
  '2026-01-12','2026-01-13','2026-01-14','2026-01-15','2026-01-16', // Week 2
];
const dailyCandles = tradingDays.map((date, i) => ({
  date, open: 100 + i, high: 105 + i, low: 95 + i,
  close: 100 + i, volume: 10000, turnover: 1000000, trades: 200, isReal: true
}));

const weekly = aggregateToWeeklyCandles(dailyCandles);
assert(weekly.length === 2, `Produces 2 weeks from 10 trading days: got ${weekly.length}`);
assert(weekly[0].weekStart === '2026-01-05', `Week 1 starts on Monday 2026-01-05`);
assert(weekly[0].weekEnd   === '2026-01-09', `Week 1 ends on Friday 2026-01-09`);
assert(weekly[0].open === 100, 'Week 1 open = first day open (100)');
assert(weekly[0].close === 104, 'Week 1 close = last day close (104)');
assert(weekly[0].high === 109,  'Week 1 high = max of all days (109)');  // 105+4
assert(weekly[0].low  === 95,   'Week 1 low = min of all days (95)');
assert(weekly[0].volume === 50000, 'Week 1 volume = sum of 5 days');
assert(weekly[0].daysCount === 5, 'Week 1 has 5 trading days');
assert(weekly[0].isWeekly === true, 'isWeekly flag set');
assert(weekly[1].weekStart === '2026-01-12', `Week 2 starts 2026-01-12`);
assert(weekly[1].daysCount === 5, 'Week 2 has 5 trading days');

// Empty input
assert(aggregateToWeeklyCandles([]).length === 0, 'Empty input returns []');
assert(aggregateToWeeklyCandles(null).length === 0, 'Null input returns []');

// ── C3: Liquidity Classification ──────────────────────────────────────────────
console.log('\n[C3] Liquidity Classification');

const highLiqStock = { turnover: 50_000_000 };
const midLiqStock  = { turnover: 5_000_000 };
const lowLiqStock  = { turnover: 500_000 };
const illiqStock   = { turnover: 50_000 };

const high = classifyLiquidity(highLiqStock);
assert(high.class === 'HIGH', `Rs.5Cr turnover → HIGH: ${high.class}`);
assert(high.isIlliquid === false, 'HIGH is not illiquid');
assert(high.warning === null, 'HIGH has no warning');

const mid = classifyLiquidity(midLiqStock);
assert(mid.class === 'MID', `Rs.50L turnover → MID: ${mid.class}`);
assert(mid.isIlliquid === false, 'MID is not illiquid');

const low = classifyLiquidity(lowLiqStock);
assert(low.class === 'LOW', `Rs.5L turnover → LOW: ${low.class}`);
assert(low.isIlliquid === false, 'LOW is not illiquid');
assert(low.warning !== null, 'LOW has a warning message');

const illiq = classifyLiquidity(illiqStock);
assert(illiq.class === 'ILLIQUID', `Rs.50k turnover → ILLIQUID: ${illiq.class}`);
assert(illiq.isIlliquid === true, 'ILLIQUID is flagged');
assert(typeof illiq.warning === 'string' && illiq.warning.length > 10, 'ILLIQUID has detailed warning');
assert(illiq.avgDailyTurnoverLakhs === 0.5, `turnover in Lakhs: ${illiq.avgDailyTurnoverLakhs}`);

// History-based trailing average override
const historyHighTurnover = Array(20).fill({ turnover: 20_000_000 });
const overrideResult = classifyLiquidity(illiqStock, historyHighTurnover, 20);
assert(overrideResult.class === 'HIGH', 'History trailing avg overrides single-day turnover');

console.log(`\nC-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
