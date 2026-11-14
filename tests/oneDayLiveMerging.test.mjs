import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarketOpen,
  latestTradingSession,
  formatNptDateIso
} from '../src/utils/nepseCalendar.js';

test('1. 1D Session Resolution - Live vs Closed Invariants', () => {
  // During Market Hours (Tuesday 12:00 PM NPT)
  const openTime = new Date('2026-11-17T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(openTime), true);
  const liveDate = latestTradingSession(openTime, false);
  assert.strictEqual(liveDate, '2026-11-17');

  // After Close (Tuesday 16:30 NPT)
  const afterClose = new Date('2026-11-17T16:30:00+05:45');
  assert.strictEqual(isMarketOpen(afterClose), false);
  const closedSession = latestTradingSession(afterClose, true);
  assert.strictEqual(closedSession, '2026-11-17');

  // Weekend (Saturday Nov 14, 2026)
  const weekend = new Date('2026-11-14T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(weekend), false);
  const weekendSession = latestTradingSession(weekend, true);
  assert.strictEqual(weekendSession, '2026-11-13', 'Weekend must show Friday session');

  // Holiday (Monday Nov 16, 2026 - Chhath)
  const holiday = new Date('2026-11-16T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(holiday), false);
  const holidaySession = latestTradingSession(holiday, true);
  assert.strictEqual(holidaySession, '2026-11-13', 'Holiday must show last trading session');
});

test('2. 1D Status Label Generator Invariant', () => {
  function format1DSessionBadge(now = new Date()) {
    const isOpen = isMarketOpen(now);
    const sessionDate = latestTradingSession(now, !isOpen);
    if (isOpen) {
      return {
        isLive: true,
        sessionDate,
        badgeText: `🟢 LIVE SESSION (${sessionDate})`,
        isStaleWarning: false
      };
    }
    return {
      isLive: false,
      sessionDate,
      badgeText: `Market closed, showing ${sessionDate}`,
      isStaleWarning: false
    };
  }

  // During Live Hours: Must be LIVE with today date
  const openTime = new Date('2026-11-17T11:30:00+05:45');
  const liveBadge = format1DSessionBadge(openTime);
  assert.strictEqual(liveBadge.isLive, true);
  assert.strictEqual(liveBadge.sessionDate, '2026-11-17');
  assert.ok(liveBadge.badgeText.includes('LIVE SESSION'));

  // On Weekend: Must NOT pretend to be live; must show Friday date
  const satTime = new Date('2026-11-14T12:00:00+05:45');
  const satBadge = format1DSessionBadge(satTime);
  assert.strictEqual(satBadge.isLive, false);
  assert.strictEqual(satBadge.sessionDate, '2026-11-13');
  assert.strictEqual(satBadge.badgeText, 'Market closed, showing 2026-11-13');

  // Invariant: badgeText on weekend must NEVER contain 'LIVE'
  assert.strictEqual(/LIVE/i.test(satBadge.badgeText), false);
});

test('3. Live Feed Merging Logic for 1D Data', () => {
  // Simulates merging a live NOTS tick into intraday state
  function merge1DLiveTick(storedSession, liveTick) {
    if (!liveTick || !liveTick.symbol) return storedSession;
    return {
      symbol: liveTick.symbol,
      date: liveTick.date || formatNptDateIso(new Date()),
      ltp: Number(liveTick.ltp || storedSession?.ltp || 0),
      open: Number(storedSession?.open || liveTick.open || liveTick.ltp),
      high: Math.max(Number(storedSession?.high || 0), Number(liveTick.high || liveTick.ltp)),
      low: Math.min(Number(storedSession?.low || Infinity), Number(liveTick.low || liveTick.ltp)),
      close: Number(liveTick.ltp),
      volume: Number(liveTick.volume !== undefined ? liveTick.volume : (storedSession?.volume || 0)),
      turnover: Number(liveTick.turnover !== undefined ? liveTick.turnover : (storedSession?.turnover || 0)),
      trades: Number(liveTick.trades !== undefined ? liveTick.trades : (storedSession?.trades || 0)),
      isLiveMerged: true
    };
  }

  const storedBaseline = {
    symbol: 'SHIVM',
    date: '2026-11-17',
    open: 677,
    high: 680,
    low: 675,
    volume: 10000,
    trades: 45
  };

  const incomingTick = {
    symbol: 'SHIVM',
    date: '2026-11-17',
    ltp: 685,
    high: 687,
    volume: 35000,
    turnover: 23975000,
    trades: 160
  };

  const merged = merge1DLiveTick(storedBaseline, incomingTick);
  assert.strictEqual(merged.ltp, 685, 'Merged LTP must reflect live tick');
  assert.strictEqual(merged.high, 687, 'Merged High must expand to 687');
  assert.strictEqual(merged.low, 675, 'Merged Low must preserve lowest reached');
  assert.strictEqual(merged.volume, 35000, 'Merged volume must reflect latest live volume');
  assert.strictEqual(merged.trades, 160, 'Merged trades must reflect latest live trades');
  assert.strictEqual(merged.isLiveMerged, true);
});
