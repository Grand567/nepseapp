import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAutoBotConfig,
  saveAutoBotConfig,
  evaluateAutoBotSignals,
  resetPaperTrackerState,
  getPaperTrackerState
} from '../../src/utils/signals/paperTradingTracker.js';

test('Auto-Bot Configuration & Signal Evaluation Suite', async (t) => {
  await t.test('retrieves default bot configuration and persists updates', () => {
    const config = getAutoBotConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.riskPerTradePct, 1.5);
    assert.equal(config.maxConcurrentPositions, 5);
    assert.equal(config.trailingRatchetPolicy, 'DYNAMIC_RATCHET');

    const updated = saveAutoBotConfig({ riskPerTradePct: 2.0 });
    assert.equal(updated.riskPerTradePct, 2.0);
    // restore
    saveAutoBotConfig({ riskPerTradePct: 1.5 });
  });

  await t.test('evaluateAutoBotSignals rejects picks when bot is disabled', () => {
    saveAutoBotConfig({ enabled: false });
    const signals = [
      {
        symbol: 'SHIVM',
        action: 'BUY',
        compositeScore: 88,
        confidence: 82,
        entryZone: [500, 510],
        stopLoss: 475,
        target1: 545,
        target2: 580,
        triggers: ['Minervini Stage 2', 'Smart-Money Inflow']
      }
    ];
    const res = evaluateAutoBotSignals({ signals, date: '2026-11-20' });
    assert.equal(res.executedCount, 0);
    assert.equal(res.executedPicks.length, 0);

    // restore
    saveAutoBotConfig({ enabled: true });
  });

  await t.test('evaluateAutoBotSignals filters out low score (<75) or non-BUY signals', () => {
    resetPaperTrackerState();
    const signals = [
      {
        symbol: 'NABIL',
        action: 'WATCH',
        compositeScore: 78,
        confidence: 75,
        entryZone: [500, 510],
        stopLoss: 480
      },
      {
        symbol: 'GBIME',
        action: 'BUY',
        compositeScore: 70, // Below minCompositeScore (75)
        confidence: 80,
        entryZone: [300, 305],
        stopLoss: 285
      }
    ];

    const res = evaluateAutoBotSignals({ signals, date: '2026-11-20' });
    assert.equal(res.executedCount, 0);
    const state = getPaperTrackerState();
    assert.equal(state.openPositions.length, 0);
  });

  await t.test('evaluateAutoBotSignals rejects buy entries on upper circuit locked stocks', () => {
    resetPaperTrackerState();
    const signals = [
      {
        symbol: 'UPPER',
        action: 'BUY',
        compositeScore: 92,
        confidence: 88,
        entryZone: [600, 605],
        stopLoss: 570,
        target1: 650,
        target2: 700,
        triggers: ['Stage 2 Breakout']
      }
    ];
    const marketQuotes = {
      UPPER: { ltp: 600, pctChange: 9.99, prevClose: 545.5, high: 600 } // Locked at upper limit
    };

    const res = evaluateAutoBotSignals({ signals, marketQuotes, date: '2026-11-20' });
    assert.equal(res.executedCount, 0);
  });

  await t.test('auto-executes qualifying signals and establishes active position with ratchet stage INITIAL_RISK', () => {
    resetPaperTrackerState();
    const signals = [
      {
        symbol: 'HDL',
        action: 'BUY',
        compositeScore: 89,
        confidence: 85,
        entryZone: [1500, 1515],
        stopLoss: 1425,
        target1: 1650,
        target2: 1780,
        triggers: ['Minervini Stage 2', 'Smart-Money Inflow']
      }
    ];

    const res = evaluateAutoBotSignals({ signals, date: '2026-11-20' });
    assert.equal(res.executedCount, 1);
    assert.equal(res.executedPicks[0].symbol, 'HDL');

    const state = getPaperTrackerState();
    assert.equal(state.openPositions.length, 1);
    const pos = state.openPositions[0];
    assert.equal(pos.symbol, 'HDL');
    assert.equal(pos.ratchetStage, 'INITIAL_RISK');
    assert.equal(pos.currentStopLoss, 1425);
    assert.equal(pos.initialStopLoss, 1425);
    assert.equal(pos.holdSessions, 0);
  });
});
