// tests/exitRatchetEngine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXIT_RATCHET_CONFIG,
  calculateRatchetStop,
  evaluatePreOpenGapCap,
  evaluateSessionExit
} from '../proxy/utils/exitRatchetEngine.mjs';

test('ExitRatchetEngine: Default Config contains validated parameters', () => {
  assert.equal(EXIT_RATCHET_CONFIG.INITIAL_STOP_PCT, 3.5);
  assert.equal(EXIT_RATCHET_CONFIG.RATCHET_TRIGGER_MFE_PCT, 5.5);
  assert.equal(EXIT_RATCHET_CONFIG.RATCHET_LOCK_PCT, 1.8);
  assert.equal(EXIT_RATCHET_CONFIG.TARGET_1_PCT, 8.0);
  assert.equal(EXIT_RATCHET_CONFIG.TARGET_1_LOCK_PCT, 4.5);
  assert.equal(EXIT_RATCHET_CONFIG.TARGET_2_PCT, 15.0);
  assert.equal(EXIT_RATCHET_CONFIG.T_PLUS_2_DEMAT_LOCK, 2);
  assert.equal(EXIT_RATCHET_CONFIG.PRE_OPEN_GAP_MAX_PCT, 1.8);
});

test('ExitRatchetEngine: calculateRatchetStop states', () => {
  const entry = 500;
  
  // 1. Initial State (MFE < 5.5%)
  const initial = calculateRatchetStop({ entryPrice: entry, currentMfePct: 3.2 });
  assert.equal(initial.ratchetState, 'INITIAL');
  assert.equal(initial.stopPct, -3.5);
  assert.equal(initial.stopPrice, 482.5);

  // 2. Breakeven Lock (+5.5% peak reached)
  const locked = calculateRatchetStop({ entryPrice: entry, currentMfePct: 6.2 });
  assert.equal(locked.ratchetState, 'BREAKEVEN_LOCK');
  assert.equal(locked.stopPct, 1.8);
  assert.equal(locked.stopPrice, 509);

  // 3. Target 1 Partial Lock (+4.5% locked for runner)
  const t1Locked = calculateRatchetStop({ entryPrice: entry, currentMfePct: 9.5, hasPartialExitT1: true });
  assert.equal(t1Locked.ratchetState, 'T1_LOCK');
  assert.equal(t1Locked.stopPct, 4.5);
  assert.equal(t1Locked.stopPrice, 522.5);
});

test('ExitRatchetEngine: Pre-open gap cap cancels orders > +1.8%', () => {
  const normal = evaluatePreOpenGapCap({ entryPrice: 300, indicativePrice: 304 }); // +1.33%
  assert.equal(normal.shouldCancel, false);

  const capped = evaluatePreOpenGapCap({ entryPrice: 300, indicativePrice: 307 }); // +2.33%
  assert.equal(capped.shouldCancel, true);
  assert.match(capped.reason, /Order cancelled to prevent gap trap/);
});

test('ExitRatchetEngine: T+2 Demat Lock prevents exit on session 0 and 1', () => {
  const entry = 500;
  const stop = 482.5;

  // Session 0 (entry day): low touches stop, but cannot exit
  const res0 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 500, high: 505, low: 480, close: 490 },
    sessionIndex: 0,
    activeStopPrice: stop,
    pendingStopPrice: stop
  });
  assert.equal(res0.isPositionClosed, false);
  assert.equal(res0.fills.length, 0);

  // Session 1 (T+1): low touches stop, cannot exit
  const res1 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 490, high: 495, low: 475, close: 485 },
    sessionIndex: 1,
    activeStopPrice: stop,
    pendingStopPrice: stop
  });
  assert.equal(res1.isPositionClosed, false);
  assert.equal(res1.fills.length, 0);

  // Session 2 (T+2 settled): stop hit triggers fill
  const res2 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 485, high: 490, low: 480, close: 485 },
    sessionIndex: 2,
    activeStopPrice: stop,
    pendingStopPrice: stop
  });
  assert.equal(res2.isPositionClosed, true);
  assert.equal(res2.fills.length, 1);
  assert.equal(res2.fills[0].price, stop);
  assert.equal(res2.exitReason, 'STOP_LOSS');
});

test('ExitRatchetEngine: UMHL scenario flips from loss to profit via ratchet', () => {
  const entry = 554;
  const initialStop = entry * (1 - 0.035); // 534.61

  // Day 0 (Entry): high reaches 570 (+2.88%)
  let state = {
    activeStop: initialStop,
    pendingStop: initialStop,
    armed: false,
    t1Hit: false,
    rem: 1.0
  };

  let eval0 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 554, high: 570, low: 552, close: 565 },
    sessionIndex: 0,
    activeStopPrice: state.activeStop,
    pendingStopPrice: state.pendingStop,
    isArmed: state.armed
  });
  state.pendingStop = eval0.nextPendingStop;
  state.armed = eval0.nextArmed;

  // Day 1 (T+1): high spikes to 592 (+6.86% MFE >= 5.5% trigger!)
  let eval1 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 565, high: 592, low: 563, close: 575 },
    sessionIndex: 1,
    activeStopPrice: state.pendingStop,
    pendingStopPrice: state.pendingStop,
    isArmed: state.armed
  });
  state.activeStop = eval1.nextPendingStop;
  state.pendingStop = eval1.nextPendingStop;
  state.armed = eval1.nextArmed;

  // Armed ratchet locked stop at +1.8% = 563.97
  assert.equal(state.armed, true);
  assert.equal(state.activeStop, entry * 1.018);

  // Day 2 (T+2 Settled): Price reverses sharply and drops to low 550
  let eval2 = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 575, high: 576, low: 550, close: 555 },
    sessionIndex: 2,
    activeStopPrice: state.activeStop,
    pendingStopPrice: state.pendingStop,
    isArmed: state.armed
  });

  // Position exits at locked ratchet price 563.97, NOT at stop loss 534.61!
  assert.equal(eval2.isPositionClosed, true);
  assert.equal(eval2.exitReason, 'RATCHET_STOP');
  assert.equal(eval2.fills[0].price, entry * 1.018);
  assert.ok(eval2.fills[0].price > entry); // Profitable exit!
});

test('ExitRatchetEngine: Gap down below stop fills at open price (honest fill)', () => {
  const entry = 1000;
  const stop = 965; // -3.5%

  const gapDown = evaluateSessionExit({
    entryPrice: entry,
    bar: { open: 950, high: 960, low: 940, close: 955 },
    sessionIndex: 2,
    activeStopPrice: stop,
    pendingStopPrice: stop
  });

  assert.equal(gapDown.isPositionClosed, true);
  assert.equal(gapDown.fills[0].price, 950); // Fills at open 950, not stop 965
});
