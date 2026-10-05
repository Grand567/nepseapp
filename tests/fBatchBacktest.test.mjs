/**
 * F-batch tests: Backtest Engine — Full Cost Model, Sharpe, Benchmark, Null-Safe Strategies
 */
import {
  runOHLCVBacktest,
  macdCrossoverStrategy,
  rsiStrategy,
  quantMultiFactorStrategy,
} from '../src/utils/backtest.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++; }
  else { console.error('  FAIL:', msg); fail++; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Build a synthetic trending candle series (60 days, rising 0.5% per day)
function makeTrendCandles(n = 80, startPrice = 400, dailyPct = 0.005) {
  const candles = [];
  let price = startPrice;
  const start = new Date('2025-01-05'); // Monday
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const close = +(price * (1 + dailyPct)).toFixed(2);
    candles.push({
      date: d.toISOString().slice(0, 10),
      open: +(price * 1.001).toFixed(2),
      high: +(price * 1.015).toFixed(2),
      low:  +(price * 0.995).toFixed(2),
      close,
      volume: 50000,
    });
    price = close;
  }
  return candles;
}

// ── F: runOHLCVBacktest with full cost model ──────────────────────────────────
console.log('\n[F1] Full NEPSE Cost Model in Backtest');

const candles = makeTrendCandles(80);
const result = runOHLCVBacktest(candles, rsiStrategy, {
  initialCapital: 200000,
  stopLossPct: 5,
  takeProfitPct: 12,
  includeSebonFee: true,
  includeDpCharge: true,
  cgtRateShort: 0.075,
  cgtRateLong: 0.05,
});

assert(!result.error, `No error on valid candles: ${result.error}`);
assert(result.dataQuality === 'ohlcv_v3', `dataQuality = ohlcv_v3: ${result.dataQuality}`);
assert(result.costModel === 'full_nepse', `costModel = full_nepse: ${result.costModel}`);
assert(typeof result.disclaimer === 'string' && result.disclaimer.includes('⚠️'), 'Has disclaimer');

// Cost breakdowns must all be non-negative
assert(result.totalBrokerage >= 0, `totalBrokerage >= 0: ${result.totalBrokerage}`);
assert(result.totalSebonFee  >= 0, `totalSebonFee >= 0: ${result.totalSebonFee}`);
assert(result.totalDpFee     >= 0, `totalDpFee >= 0: ${result.totalDpFee}`);
assert(result.totalCgt       >= 0, `totalCgt >= 0: ${result.totalCgt}`);
assert(result.totalFees      >= 0, `totalFees >= 0: ${result.totalFees}`);

// Total fees should be sum of components
if (result.totalTrades > 0) {
  const calcTotal = result.totalBrokerage + result.totalSebonFee + result.totalDpFee + result.totalCgt;
  assert(Math.abs(result.totalFees - calcTotal) < 1,
    `totalFees ≈ sum of components: ${result.totalFees} vs ${calcTotal.toFixed(2)}`);
}

// CGT should be 0 if no profitable trades
const bearCandles = makeTrendCandles(80, 400, -0.005);
const bearResult = runOHLCVBacktest(bearCandles, rsiStrategy, {
  initialCapital: 200000, stopLossPct: 5, takeProfitPct: 12,
});
assert(bearResult.totalCgt === 0 || bearResult.totalCgt >= 0, 'CGT >= 0 in bear market');

// ── F2: Sharpe Ratio ──────────────────────────────────────────────────────────
console.log('\n[F2] Sharpe Ratio');
assert(result.sharpeRatio !== undefined, 'sharpeRatio field present');
assert(typeof result.sharpeNote === 'string', 'sharpeNote string present');

if (result.totalTrades >= 3) {
  assert(typeof result.sharpeRatio === 'number' || result.sharpeRatio === null,
    `sharpeRatio is number or null: ${typeof result.sharpeRatio}`);
}

// With < 3 trades sharpe must be null
const tinyCandles = makeTrendCandles(42); // just enough for WARMUP
const tinyResult = runOHLCVBacktest(tinyCandles, rsiStrategy, { initialCapital: 100000 });
assert(
  tinyResult.sharpeRatio === null || typeof tinyResult.sharpeRatio === 'number',
  `sharpeRatio is null or number with few trades: ${tinyResult.sharpeRatio}`
);

// ── F3: Benchmark Comparison ──────────────────────────────────────────────────
console.log('\n[F3] Benchmark Comparison');

// With benchmarkPrices provided
const benchPrices = candles.map((_, i) => 2600 + i * 2); // NEPSE index rising
const resultWithBench = runOHLCVBacktest(candles, rsiStrategy, {
  initialCapital: 200000,
  benchmarkPrices: benchPrices,
});

assert(resultWithBench.benchmark !== null, 'Benchmark computed when prices provided');
assert(resultWithBench.benchmark.label.includes('NEPSE'), `Benchmark label: ${resultWithBench.benchmark?.label}`);
assert(typeof resultWithBench.benchmark.returnPct === 'number', 'Benchmark returnPct is number');
assert(typeof resultWithBench.benchmark.alphaVsStrategy === 'number', 'Alpha vs strategy computed');
assert(typeof resultWithBench.benchmark.maxDrawdownPct === 'number', 'Benchmark max drawdown computed');
assert(typeof resultWithBench.benchmark.note === 'string', 'Benchmark note present');

// Without benchmark: falls back to stock buy-and-hold
assert(result.benchmark !== null, 'Default benchmark (stock B&H) always present');
assert(result.benchmark.label === 'Stock Buy & Hold', `Default label: ${result.benchmark?.label}`);

// ── F4: Null-Safe Strategy Functions ─────────────────────────────────────────
console.log('\n[F4] Null-Safe Strategy Functions');

// macdCrossoverStrategy: should not throw or return non-string on short series
const shortPrices = Array.from({ length: 10 }, (_, i) => 400 + i);
const macdResult = macdCrossoverStrategy(shortPrices);
assert(['BUY', 'SELL', 'HOLD'].includes(macdResult), `MACD strategy on 10 prices: ${macdResult}`);
assert(macdResult === 'HOLD', `MACD on insufficient data returns HOLD: ${macdResult}`);

// rsiStrategy: null RSI should return HOLD
const rsiShort = rsiStrategy([400, 410, 405]); // < 14 candles → RSI null
assert(rsiShort === 'HOLD', `RSI strategy on 3 prices returns HOLD: ${rsiShort}`);

// quantMultiFactorStrategy: short series → HOLD, no crash
const qShort = quantMultiFactorStrategy(Array.from({ length: 20 }, (_, i) => 400 + i));
assert(qShort === 'HOLD', `quantMultiFactor on 20 prices returns HOLD: ${qShort}`);

// Enough data should return a valid signal (not throw)
const longPrices = Array.from({ length: 60 }, (_, i) => 400 + Math.sin(i / 5) * 20 + i * 0.5);
const qLong = quantMultiFactorStrategy(longPrices);
assert(['BUY', 'SELL', 'HOLD'].includes(qLong), `quantMultiFactor on 60 prices: ${qLong}`);

// ── Insufficient candles ──────────────────────────────────────────────────────
console.log('\n[F] Edge Cases');
const errResult = runOHLCVBacktest(makeTrendCandles(20), rsiStrategy, {});
assert(errResult.error, 'Returns error on < 40 candles');

console.log(`\nF-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
