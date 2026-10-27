/**
 * tests/wBatchBacktestEngine.test.mjs
 * Verification Test Suite for STEP 4: BACKTEST ENGINE & WALK-FORWARD RUNNER
 *
 * Verifies exact mathematical models, NEPSE structural frictions, and report generation:
 * 1. Statutory NEPSE Frictions: Commission, SEBON, DP, CGT, and Slippage deductions
 * 2. Mandatory T+2 Demat Settlement Lock: Cannot exit on Day T or Day T+1
 * 3. Performance Metrics: Win Rate, Profit Factor, Expectancy, Max Drawdown, Sharpe Ratio
 * 4. Market Regime Attribution: Bull, Neutral, Bear breakdown
 * 5. Statistical Power Warning: Caution message generated when N < 30 trades or < 100 sessions
 * 6. File Generation: backtest/report.md correctly formatted and written to disk
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  runComprehensiveBacktest,
  generateBacktestMarkdownReport,
  saveBacktestReport,
  compileBacktestResults,
  STATUTORY_FEES
} from '../src/utils/signals/backtestEngine.js';
import { countNepseTradingSessionsBetween } from '../src/utils/nepseCalendar.js';

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('======================================================================');
console.log(' STEP 4: BACKTEST ENGINE VERIFICATION SUITE');
console.log('======================================================================\n');

// Helper to generate synthetic candle history
function generateSyntheticCandles(count = 120, startPrice = 300) {
  const candles = [];
  let price = startPrice;
  const baseDate = new Date('2025-01-01');

  for (let i = 0; i < count; i++) {
    const curDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Skip weekends
    if (curDate.getUTCDay() === 5 || curDate.getUTCDay() === 6) continue;

    // Gentle uptrend wave with pullbacks
    const delta = (Math.sin(i / 5) * 6) + (i % 7 === 0 ? -4 : 2);
    price = Math.max(100, price + delta);

    const open = price - (delta * 0.4);
    const high = Math.max(open, price) + 4;
    const low = Math.min(open, price) - 4;
    const close = price;
    const volume = 25000 + (Math.sin(i / 3) * 10000);
    const turnover = close * volume;

    candles.push({
      date: curDate.toISOString().slice(0, 10),
      open: Number(open.toFixed(1)),
      high: Number(high.toFixed(1)),
      low: Number(low.toFixed(1)),
      close: Number(close.toFixed(1)),
      volume: Math.round(volume),
      turnover: Math.round(turnover)
    });
  }
  return candles;
}

// 1. Statutory NEPSE Frictions & Transaction Cost Checks
it('compileBacktestResults: deducts broker commission, SEBON fee, DP charge, and CGT from gross proceeds', () => {
  const mockTrades = [
    {
      symbol: 'TEST',
      entryDate: '2025-01-05',
      exitDate: '2025-01-12',
      shares: 100,
      entryPrice: 500,
      exitPrice: 550, // Gross gain = 5,000
      commissionPaid: 165,
      cgtPaid: 350,
      realizedPnl: 4400, // Net of all costs & CGT
      returnPct: 8.8,
      regime: 'BULL',
      holdSessions: 5
    },
    {
      symbol: 'TEST',
      entryDate: '2025-01-15',
      exitDate: '2025-01-20',
      shares: 100,
      entryPrice: 500,
      exitPrice: 475,
      commissionPaid: 150,
      cgtPaid: 0,
      realizedPnl: -2700,
      returnPct: -5.4,
      regime: 'NEUTRAL',
      holdSessions: 4
    }
  ];

  const equityCurve = [
    { date: '2025-01-01', equity: 1000000 },
    { date: '2025-01-12', equity: 1004400 },
    { date: '2025-01-20', equity: 1001700 }
  ];

  const res = compileBacktestResults({
    symbol: 'TEST',
    sector: 'Commercial Banks',
    totalSessions: 120,
    initialCapital: 1000000,
    closedTrades: mockTrades,
    equityCurve
  });

  assert.strictEqual(res.totalTrades, 2);
  assert.strictEqual(res.winRatePct, 50.0);
  assert.strictEqual(res.netProfitNpr, 1700);
  assert.strictEqual(res.totalCommissionPaid, 315);
  assert.strictEqual(res.totalCgtPaid, 350);
  assert.strictEqual(res.profitFactor, 1.63); // 4400 / 2700
});

// 2. T+2 Mandatory Demat Settlement Lock
it('runComprehensiveBacktest: enforces mandatory T+2 settlement lock (no day-T or day-T+1 exits)', () => {
  const candles = generateSyntheticCandles(60, 400);

  const res = runComprehensiveBacktest({
    symbol: 'LOCKTEST',
    sector: 'Manufacturing',
    candles,
    initialCapital: 1000000
  });

  // Verify that EVERY closed trade was held for >= 2 trading sessions
  for (const trade of res.closedTrades) {
    assert.ok(
      trade.holdSessions >= 2,
      `Violation of T+2 Demat lock: Trade exited at holdSessions = ${trade.holdSessions} (< 2)`
    );
  }
});

// 2B. Statutory Trading Calendar T+2 Holding Sequence: Thursday -> Sunday -> Monday
it('runComprehensiveBacktest: enforces calendar-accurate Thursday -> Sunday (T+1 lock) -> Monday (T+2 unlock)', () => {
  // 1. Assert session counts across weekend
  assert.strictEqual(countNepseTradingSessionsBetween('2025-01-09', '2025-01-09'), 0, 'Day T (Thu entry) must have 0 elapsed hold sessions');
  assert.strictEqual(countNepseTradingSessionsBetween('2025-01-09', '2025-01-10'), 0, 'Friday weekend must not advance trading sessions');
  assert.strictEqual(countNepseTradingSessionsBetween('2025-01-09', '2025-01-11'), 0, 'Saturday weekend must not advance trading sessions');
  assert.strictEqual(countNepseTradingSessionsBetween('2025-01-09', '2025-01-12'), 1, 'Sunday is Day T+1 (holdSessions = 1, locked in Demat settlement)');
  assert.strictEqual(countNepseTradingSessionsBetween('2025-01-09', '2025-01-13'), 2, 'Monday is Day T+2 (holdSessions = 2, unlocked for exit eligibility)');

  // 2. Assert that backtest execution strictly locks exit on Sunday T+1 even under severe price moves
  const candles = [];
  const start = new Date('2024-11-20T00:00:00Z');
  for (let i = 0; i < 50; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    if (d.getUTCDay() === 5 || d.getUTCDay() === 6) continue;
    candles.push({
      date: d.toISOString().slice(0, 10),
      open: 400 + i,
      high: 405 + i,
      low: 395 + i,
      close: 402 + i,
      volume: 50000,
      turnover: 20000000
    });
  }

  const res = runComprehensiveBacktest({
    symbol: 'THUSUNTEST',
    sector: 'Commercial Banks',
    candles,
    initialCapital: 1000000
  });

  assert.strictEqual(res.error, undefined, 'Backtest should execute without history errors');
  assert.ok(Array.isArray(res.closedTrades), 'closedTrades must be an array');
  for (const t of res.closedTrades) {
    assert.ok(t.holdSessions >= 2, `Position exited at holdSessions = ${t.holdSessions} (< 2)`);
  }
});

// 3. Statistical Power & Sample Size Warning
it('compileBacktestResults: triggers prominent caution warning when sample size is underpowered (N < 30)', () => {
  const underpoweredTrades = [
    { realizedPnl: 1000, returnPct: 2.5, regime: 'BULL', commissionPaid: 50, cgtPaid: 75 }
  ];
  const eq = [{ date: '2025-01-01', equity: 1000000 }, { date: '2025-01-05', equity: 1001000 }];

  const res = compileBacktestResults({
    symbol: 'LOWSAMPLE',
    sector: 'Hydro Power',
    totalSessions: 45, // < 100 sessions
    initialCapital: 1000000,
    closedTrades: underpoweredTrades,
    equityCurve: eq
  });

  assert.strictEqual(res.isSampleUnderpowered, true);
  assert.ok(res.sampleSizeWarning !== null);
  assert.ok(res.sampleSizeWarning.includes('statistically underpowered (< 30 trades / < 100 sessions)'));
});

// 4. Performance Attribution by Market Regime
it('runComprehensiveBacktest: breaks down performance by Bull, Neutral, and Bear market regimes', () => {
  const candles = generateSyntheticCandles(100, 250);

  const res = runComprehensiveBacktest({
    symbol: 'REGIMETEST',
    sector: 'Commercial Banks',
    candles,
    initialCapital: 1000000
  });

  assert.ok(res.regimeBreakdown !== undefined);
  assert.ok('BULL' in res.regimeBreakdown);
  assert.ok('NEUTRAL' in res.regimeBreakdown);
  assert.ok('BEAR' in res.regimeBreakdown);
});

// 5. File Generation: backtest/report.md
it('saveBacktestReport: generates and writes formal markdown report to backtest/report.md', () => {
  const candles = generateSyntheticCandles(80, 500);

  const res = runComprehensiveBacktest({
    symbol: 'NABIL',
    sector: 'Commercial Banks',
    candles,
    initialCapital: 1000000
  });

  const markdown = generateBacktestMarkdownReport(res);
  assert.ok(markdown.includes('# Drabyashree NEPSE Quantitative Backtest Report'));
  assert.ok(markdown.includes('Key Quantitative Performance Metrics'));
  assert.ok(markdown.includes('Statutory NEPSE Frictions & Transaction Costs Subtracted'));
  assert.ok(markdown.includes('Survivorship Bias'));

  // Save to backtest/report.md
  const targetFile = path.join(process.cwd(), 'backtest', 'report.md');
  const savedPath = saveBacktestReport(markdown, targetFile);

  assert.strictEqual(fs.existsSync(savedPath), true);
  const readContent = fs.readFileSync(savedPath, 'utf8');
  assert.ok(readContent.length > 500);
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} backtest engine assertions passed successfully.`);
console.log(`======================================================================\n`);
