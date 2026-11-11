// tests/swingEngine.test.mjs
/**
 * ============================================================================
 * UNIT TEST SUITE: ZERO-LOOKAHEAD SWING BACKTEST ENGINE & VALIDATION VERDICT
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { runBacktestSimulation, calculateDeflatedSharpeRatio } from '../backtest/swingEngine.mjs';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('SWING BACKTEST ENGINE & VERDICT AUDIT SUITE');
console.log('======================================================================\n');

// [TEST 1] Backtest Engine Execution
console.log('[TEST 1] Backtest Engine Simulation Execution');
const simResult = runBacktestSimulation({
  requireMarketRegime: true,
  requireBrokerConfirmation: true,
  requireQualityFilter: true,
  maxPositions: 4,
  tradeCapitalNpr: 100000,
  timeStopSessions: 7
});

assert(simResult && typeof simResult === 'object', 'Simulation executed successfully and returned result object');
assert(simResult.totalTrades > 0, `Total simulated trades > 0 (got ${simResult.totalTrades})`);
assert(typeof simResult.winRatePct === 'number', `Win rate is numeric (${simResult.winRatePct}%)`);
assert(typeof simResult.profitFactor === 'number', `Profit factor is numeric (${simResult.profitFactor}x)`);
assert(simResult.totalFrictionNpr > 0, `Statutory frictions accurately accumulated (Rs. ${simResult.totalFrictionNpr})`);

// [TEST 2] Microstructure Invariants Enforcement
console.log('\n[TEST 2] Microstructure Invariants Enforcement');
const trades = simResult.closedTrades;
assert(trades.length > 0, 'Closed trades recorded');

// Invariant 1: Zero Look-Ahead (Day T+1 entry execution)
const validT1Entries = trades.every(t => t.entryDate > t.signalDate);
assert(validT1Entries, 'All orders executed on Day T+1 or later (Zero Look-Ahead enforced)');

// Invariant 2: T+2 Demat Settlement Lockout (Holding sessions >= 2)
const validT2Locks = trades.every(t => t.holdingSessions >= 2 || t.exitReason === 'FINAL_SESSION_CLOSE');
assert(validT2Locks, 'CDSC T+2 Demat settlement lockout enforced (No day-trading or T+1 early exits)');

// Invariant 3: Net Return strictly reflects fee deductions
const winningTrades = trades.filter(t => t.grossReturnPct > 0);
assert(winningTrades.length > 0, 'Found winning trades for friction comparison');
const validFrictionDeduction = winningTrades.every(t => t.netReturnPct < t.grossReturnPct);
assert(validFrictionDeduction, 'Every winning trade has net return strictly lower than gross due to statutory fees');

// [TEST 3] Deflated Sharpe Ratio (Multiple Testing Correction)
console.log('\n[TEST 3] Deflated Sharpe Ratio (DSR)');
const dsrHigh = calculateDeflatedSharpeRatio({ estimatedSharpe: 2.5, numTrials: 5, sampleLength: 200 });
assert(dsrHigh > 0.5, `High Sharpe with few trials produces significant DSR (got ${dsrHigh})`);

const dsrLow = calculateDeflatedSharpeRatio({ estimatedSharpe: 0.2, numTrials: 50, sampleLength: 200 });
assert(dsrLow < 0.1, `Low Sharpe with high trial snooping produces near-zero DSR (got ${dsrLow})`);

// [TEST 4] Strategy Report Verification & Verdict
console.log('\n[TEST 4] Strategy Report & Verdict Audit');
const reportPath = path.join(process.cwd(), 'qa', 'strategy_report.md');
assert(fs.existsSync(reportPath), 'qa/strategy_report.md exists on disk');
const reportText = fs.readFileSync(reportPath, 'utf8');

assert(reportText.includes('NO EDGE: do not trade this system'), 'Strategy report honestly declares "NO EDGE: do not trade this system"');
assert(reportText.includes('Full 7-Gate System'), 'Strategy report includes full 7-gate ablation matrix');
assert(reportText.includes('Deflated Sharpe Ratio'), 'Strategy report includes Deflated Sharpe Ratio metric');

console.log('\n======================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
