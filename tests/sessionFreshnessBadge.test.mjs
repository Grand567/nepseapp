import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarketOpen,
  latestTradingSession,
  formatNptDateIso
} from '../src/utils/nepseCalendar.js';

test('1. Session Freshness & Staleness Diagnostic Resolver', () => {
  function evaluateSessionFreshness({
    now = new Date(),
    lastUpdatedMs = Date.now(),
    underlyingSessionDate = null,
    isWarmingUp = false,
    staleThresholdMs = 2 * 60 * 1000 // 2 minutes
  }) {
    const isOpen = isMarketOpen(now);
    const sessionDate = underlyingSessionDate || latestTradingSession(now, !isOpen);

    if (isWarmingUp) {
      return {
        badgeType: 'WARMUP',
        badgeText: '⚡ Warming Up...',
        asOfDisplay: `Syncing session ${sessionDate}`,
        isStale: false,
        isOpen
      };
    }

    if (!isOpen) {
      return {
        badgeType: 'CLOSED',
        badgeText: '🔴 MARKET CLOSED',
        asOfDisplay: `As of session: ${sessionDate}`,
        isStale: false,
        isOpen: false
      };
    }

    // Market is Open: Evaluate staleness lag
    const lagMs = Math.max(0, now.getTime() - lastUpdatedMs);
    const isStale = lagMs > staleThresholdMs;

    return {
      badgeType: isStale ? 'LIVE_STALE' : 'LIVE',
      badgeText: isStale ? '⚠️ LIVE (DATA STALE)' : '🟢 LIVE',
      asOfDisplay: `As of ${formatNptDateIso(now)} (lag: ${Math.round(lagMs / 1000)}s)`,
      isStale,
      lagSeconds: Math.round(lagMs / 1000),
      isOpen: true
    };
  }

  // Case 1: Market closed (Saturday)
  const sat = new Date('2026-11-14T12:00:00+05:45');
  const res1 = evaluateSessionFreshness({ now: sat });
  assert.strictEqual(res1.badgeType, 'CLOSED');
  assert.strictEqual(res1.isOpen, false);
  assert.strictEqual(res1.isStale, false);
  assert.ok(res1.asOfDisplay.includes('2026-11-13'));

  // Case 2: Market open, fresh update (45 seconds ago)
  const openTime = new Date('2026-11-17T12:00:00+05:45');
  const freshUpdateMs = openTime.getTime() - (45 * 1000);
  const res2 = evaluateSessionFreshness({ now: openTime, lastUpdatedMs: freshUpdateMs });
  assert.strictEqual(res2.badgeType, 'LIVE');
  assert.strictEqual(res2.isOpen, true);
  assert.strictEqual(res2.isStale, false);

  // Case 3: Market open, stale update (3 minutes ago > 2 min threshold)
  const staleUpdateMs = openTime.getTime() - (3 * 60 * 1000);
  const res3 = evaluateSessionFreshness({ now: openTime, lastUpdatedMs: staleUpdateMs });
  assert.strictEqual(res3.badgeType, 'LIVE_STALE');
  assert.strictEqual(res3.isStale, true);
  assert.ok(res3.badgeText.includes('STALE'));

  // Case 4: Warming up
  const res4 = evaluateSessionFreshness({ now: openTime, isWarmingUp: true });
  assert.strictEqual(res4.badgeType, 'WARMUP');
  assert.ok(res4.badgeText.includes('Warming Up'));
});
