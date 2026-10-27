/**
 * tests/xBatchPaperTradingTracker.test.mjs
 * Verification Test Suite for STEP 5: PAPER TRADING MODE & TRADE JOURNAL
 *
 * Verifies:
 * 1. Automatic logging of daily BUY / WATCH / AVOID picks with exact execution levels
 * 2. Automated paper position creation and virtual equity deduction
 * 3. Mandatory T+2 Demat settlement lock (cannot sell on hold=0 or hold=1)
 * 4. Target 1 partial scale-out (50%), Target 2 full exit, and Stop-Loss execution
 * 5. Signal Performance Attribution: Quantifies which signals earn or lose money
 */

import assert from 'assert';
import {
  recordPaperPick,
  processDailyPaperOutcomes,
  calculateSignalAttribution,
  getPaperTrackerState,
  resetPaperTrackerState
} from '../src/utils/signals/paperTradingTracker.js';

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
console.log(' STEP 5: PAPER TRADING MODE & TRADE JOURNAL VERIFICATION SUITE');
console.log('======================================================================\n');

// 1. Logging Daily Selection Picks
it('recordPaperPick: logs BUY, WATCH, and AVOID recommendations with exact execution plans', () => {
  resetPaperTrackerState();

  // A. Log a BUY Pick
  const buyPick = recordPaperPick({
    date: '2026-10-24',
    stock: { symbol: 'SHIVM', sector: 'Manufacturing', ltp: 520 },
    scoringResult: {
      symbol: 'SHIVM',
      sector: 'Manufacturing',
      action: 'BUY',
      compositeScore: 82,
      confidence: 75,
      scoreBreakdown: { brokerFloorsheet: 85, technical: 80, fundamental: 75, marketContext: 80 },
      hardFilters: { liquidityPassed: true },
      executionPlan: {
        entryLtp: 520,
        entryZone: [516, 524],
        stopLoss: 496,
        target1: 556,
        target2: 580,
        positionSizing: { sharesKitta: 280, capitalRequiredNpr: 145600 }
      }
    },
    autoExecuteBuy: true
  });

  assert.strictEqual(buyPick.action, 'BUY');
  assert.strictEqual(buyPick.shares, 280);
  assert.strictEqual(buyPick.stopLoss, 496);
  assert.strictEqual(buyPick.target1, 556);
  assert.ok(buyPick.triggers.includes('BROKER_ACCUMULATION'));
  assert.ok(buyPick.triggers.includes('TECHNICAL_BREAKOUT'));

  // B. Log a WATCH Pick
  const watchPick = recordPaperPick({
    date: '2026-10-24',
    stock: { symbol: 'GBIME', sector: 'Commercial Banks', ltp: 210 },
    scoringResult: {
      action: 'WATCH',
      compositeScore: 62,
      confidence: 55,
      scoreBreakdown: { brokerFloorsheet: 60, technical: 65, fundamental: 65, marketContext: 60 }
    },
    autoExecuteBuy: true
  });
  assert.strictEqual(watchPick.action, 'WATCH');

  // Verify open position was created only for BUY pick
  const state = getPaperTrackerState();
  assert.strictEqual(state.openPositions.length, 1);
  assert.strictEqual(state.openPositions[0].symbol, 'SHIVM');
  assert.strictEqual(state.openPositions[0].shares, 280);
  assert.ok(state.capital < 1000000, 'Cash must be deducted for BUY order');
});

// 2. Mandatory T+2 Settlement Lock
it('processDailyPaperOutcomes: enforces T+2 Demat lock (no exit possible on Day 0 or Day 1)', () => {
  const state = getPaperTrackerState();
  assert.strictEqual(state.openPositions[0].holdSessions, 0);

  // Day 1: Target 1 is breached, but shares are still locked in T+1 Demat clearing!
  processDailyPaperOutcomes(
    { SHIVM: { high: 565, low: 518, close: 560 } },
    '2026-10-25'
  );

  const updatedState = getPaperTrackerState();
  assert.strictEqual(updatedState.openPositions[0].holdSessions, 1);
  assert.strictEqual(updatedState.closedJournal.length, 0); // No exit permitted!
});

// 3. Target 1 Partial Scale-Out and Target 2 Full Profit
it('processDailyPaperOutcomes: executes Target 1 partial scale-out at T+2 and Target 2 at T+3', () => {
  // Day 2 (T+2 Cleared): Target 1 hit -> 50% scale-out (140 shares), SL moved to breakeven
  processDailyPaperOutcomes(
    { SHIVM: { high: 560, low: 540, close: 558 } }, // High 560 >= T1 556
    '2026-10-26'
  );

  const t1State = getPaperTrackerState();
  assert.strictEqual(t1State.closedJournal.length, 1);
  const t1Trade = t1State.closedJournal[0];
  assert.strictEqual(t1Trade.outcome, 'TARGET_1_PARTIAL');
  assert.strictEqual(t1Trade.shares, 140);
  assert.ok(t1Trade.realizedPnl > 0);
  assert.strictEqual(t1State.openPositions[0].shares, 140); // 140 shares remaining
  assert.strictEqual(t1State.openPositions[0].t1Banked, true);

  // Day 3: Target 2 hit -> Remaining 140 shares exited at T2 (580)
  processDailyPaperOutcomes(
    { SHIVM: { high: 585, low: 555, close: 582 } }, // High 585 >= T2 580
    '2026-10-27'
  );

  const t2State = getPaperTrackerState();
  assert.strictEqual(t2State.openPositions.length, 0); // Position fully closed
  assert.strictEqual(t2State.closedJournal.length, 2);
  const t2Trade = t2State.closedJournal[0];
  assert.strictEqual(t2Trade.outcome, 'TARGET_2_HIT');
  assert.strictEqual(t2Trade.shares, 140);
  assert.ok(t2Trade.realizedPnl > 0);
});

// 4. Stop-Loss Trigger & Risk Management
it('processDailyPaperOutcomes: executes Stop-Loss when price hits stop level after T+2', () => {
  // Record a new BUY for a losing candidate
  recordPaperPick({
    date: '2026-10-20',
    stock: { symbol: 'FAILCO', ltp: 300 },
    scoringResult: {
      symbol: 'FAILCO',
      action: 'BUY',
      compositeScore: 75,
      scoreBreakdown: { technical: 75, brokerFloorsheet: 40 }, // Triggered by technical
      executionPlan: {
        entryLtp: 300,
        stopLoss: 285,
        target1: 320,
        target2: 340,
        positionSizing: { sharesKitta: 200, capitalRequiredNpr: 60000 }
      }
    }
  });

  // Advance 2 sessions to clear T+2 Demat lock
  processDailyPaperOutcomes({ FAILCO: { high: 302, low: 295, close: 298 } }, '2026-10-21');
  processDailyPaperOutcomes({ FAILCO: { high: 298, low: 280, close: 282 } }, '2026-10-22'); // Low 280 <= SL 285

  const state = getPaperTrackerState();
  const stopTrade = state.closedJournal.find(t => t.symbol === 'FAILCO');
  assert.ok(stopTrade !== undefined);
  assert.strictEqual(stopTrade.outcome, 'STOP_LOSS_HIT');
  assert.strictEqual(stopTrade.shares, 200);
  assert.ok(stopTrade.realizedPnl < 0, 'PnL must be negative for stopped trade');
});

// 5. Signal Performance Attribution (Which signals earn or lose money)
it('calculateSignalAttribution: calculates accurate performance, win rate, and alpha verdict by signal', () => {
  const attr = calculateSignalAttribution();

  assert.ok(attr.totalClosedTrades >= 3);
  const signals = attr.signals;

  // BROKER_ACCUMULATION was on winning SHIVM trade
  if (signals.BROKER_ACCUMULATION) {
    assert.strictEqual(signals.BROKER_ACCUMULATION.winRatePct, 100.0);
    assert.ok(signals.BROKER_ACCUMULATION.netPnlNpr > 0);
    assert.ok(['HIGH_ALPHA_SIGNAL', 'POSITIVE_EDGE'].includes(signals.BROKER_ACCUMULATION.edgeVerdict));
  }

  // TECHNICAL_BREAKOUT was on both SHIVM (win) and FAILCO (loss)
  if (signals.TECHNICAL_BREAKOUT) {
    assert.ok(signals.TECHNICAL_BREAKOUT.tradesCount >= 2);
    assert.ok(signals.TECHNICAL_BREAKOUT.wins >= 1);
  }
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedTests}/${totalTests} paper trading tracker assertions passed successfully.`);
console.log(`======================================================================\n`);
