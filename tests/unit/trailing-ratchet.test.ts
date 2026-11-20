/**
 * tests/unit/trailing-ratchet.test.ts
 *
 * Unit tests for Trailing Stop-Loss Ratchet Engine & NEPSE Paper Trading Auto-Bot
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTrailingRatchet,
  calculateRatchetLevels,
  RatchetStage,
  type PaperPosition,
  type RatchetEvaluationResult
} from '../../src/utils/signals/trailingRatchetEngine';

describe('Trailing Stop-Loss Ratchet Engine', () => {
  const basePosition: PaperPosition = {
    id: 'POS-NABIL-20261120',
    symbol: 'NABIL',
    shares: 100,
    entryPrice: 500,
    costBasisNpr: 50400, // Includes ~Rs. 400 SEBON comm & fees
    initialStopLoss: 475, // -5% risk (1R = Rs. 25)
    currentStopLoss: 475,
    target1: 537.5, // +1.5R (+7.5%)
    target2: 562.5, // +2.5R (+12.5%)
    t1Banked: false,
    holdSessions: 0,
    ratchetStage: 'INITIAL_RISK',
    triggers: ['MINERVINI_STAGE_2', 'BROKER_ACCUMULATION']
  };

  it('calculates correct initial R-multiples and fee buffers', () => {
    const levels = calculateRatchetLevels(500, 475);
    assert.equal(levels.rAmount, 25);
    assert.equal(levels.target1, 537.5);
    assert.equal(levels.target2, 562.5);
    // Breakeven must include at least +0.6% friction buffer (>= 503)
    assert.ok(levels.breakevenPrice >= 503, `Breakeven ${levels.breakevenPrice} must cover statutory fees`);
  });

  it('maintains INITIAL_RISK stage when price is below +1R', () => {
    const res = evaluateTrailingRatchet({
      position: basePosition,
      currentHigh: 515,
      currentLow: 495,
      currentClose: 510,
      holdSessions: 1
    });

    assert.equal(res.ratchetStage, 'INITIAL_RISK');
    assert.equal(res.newStopLoss, 475);
    assert.equal(res.takePartialProfit, false);
    assert.equal(res.isClosed, false);
  });

  it('ratchets stop-loss to BREAKEVEN_LOCKED when price touches +1.0R (Rs. 525)', () => {
    const res = evaluateTrailingRatchet({
      position: basePosition,
      currentHigh: 526,
      currentLow: 502,
      currentClose: 524,
      holdSessions: 1
    });

    assert.equal(res.ratchetStage, 'BREAKEVEN_LOCKED');
    assert.ok(res.newStopLoss >= 503, `New stop-loss ${res.newStopLoss} must be at or above breakeven`);
    assert.equal(res.takePartialProfit, false);
  });

  it('banks 50% profit at Target 1 and ratchets runner stop-loss to PROFIT_LOCKED (+1R)', () => {
    const res = evaluateTrailingRatchet({
      position: {
        ...basePosition,
        currentStopLoss: 503,
        ratchetStage: 'BREAKEVEN_LOCKED',
        holdSessions: 2
      },
      currentHigh: 538, // Exceeds Target 1 (537.5)
      currentLow: 520,
      currentClose: 535,
      holdSessions: 2
    });

    assert.equal(res.ratchetStage, 'PROFIT_LOCKED');
    assert.equal(res.takePartialProfit, true);
    assert.equal(res.partialSharesToSell, 50);
    // Runner stop-loss must be ratcheted to at least entry + 1R (Rs. 525)
    assert.ok(res.newStopLoss >= 525, `Runner stop-loss ${res.newStopLoss} must lock in +1R`);
  });

  it('strictly enforces NEPSE T+2 settlement lock before allowing stop-loss or target execution', () => {
    // If low <= stop loss on Day 0 or Day 1, shares cannot be legally sold in NEPSE
    const day0Exit = evaluateTrailingRatchet({
      position: basePosition,
      currentHigh: 495,
      currentLow: 470, // Below 475 stop loss
      currentClose: 472,
      holdSessions: 0 // Day of purchase (T+0)
    });

    assert.equal(day0Exit.isClosed, false, 'T+0 demat lock must prevent trade close');
    assert.equal(day0Exit.settlementBlocked, true);

    const day2Exit = evaluateTrailingRatchet({
      position: basePosition,
      currentHigh: 495,
      currentLow: 470,
      currentClose: 472,
      holdSessions: 2 // T+2 settled
    });

    assert.equal(day2Exit.isClosed, true, 'T+2 settled position must be allowed to close on stop loss');
    assert.equal(day2Exit.exitReason, 'STOP_LOSS_HIT');
  });

  it('exits full position at Target 2 with TARGET_HIT outcome when holdSessions >= 2', () => {
    const res = evaluateTrailingRatchet({
      position: {
        ...basePosition,
        shares: 50,
        t1Banked: true,
        currentStopLoss: 525,
        ratchetStage: 'PROFIT_LOCKED',
        holdSessions: 3
      },
      currentHigh: 565, // Exceeds Target 2 (562.5)
      currentLow: 540,
      currentClose: 563,
      holdSessions: 3
    });

    assert.equal(res.isClosed, true);
    assert.equal(res.exitReason, 'TARGET_2_HIT');
    assert.equal(res.ratchetStage, 'RUNNER_COMPLETED');
  });
});
