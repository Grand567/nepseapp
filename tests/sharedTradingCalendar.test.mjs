import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMarketOpen,
  latestTradingSession,
  tradingDayWindow,
  formatNptDateIso,
  isNepseTradingDay,
  isNepseWeekend,
  isNepsePublicHoliday
} from '../src/utils/nepseCalendar.js';

test('1. isMarketOpen(now) - Statutory Hours & Holiday Enforcement', () => {
  // Continuous trading hour on regular trading day (Friday Nov 13, 2026 at 12:30 PM NPT)
  const openTime = new Date('2026-11-13T12:30:00+05:45');
  assert.strictEqual(isMarketOpen(openTime), true, 'Friday 12:30 PM NPT must report market open');

  // Pre-open on regular trading day (Friday Nov 13, 2026 at 10:45 AM NPT)
  const preOpenTime = new Date('2026-11-13T10:45:00+05:45');
  assert.strictEqual(isMarketOpen(preOpenTime), false, 'Friday 10:45 AM NPT must report market closed for continuous trading');

  // Post-close on regular trading day (Friday Nov 13, 2026 at 3:15 PM NPT)
  const postCloseTime = new Date('2026-11-13T15:15:00+05:45');
  assert.strictEqual(isMarketOpen(postCloseTime), false, 'Friday 3:15 PM NPT must report market closed');

  // Weekend Saturday (Nov 14, 2026 at 12:00 PM NPT)
  const saturday = new Date('2026-11-14T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(saturday), false, 'Saturday must report market closed');

  // Weekend Sunday (Nov 15, 2026 at 12:00 PM NPT)
  const sunday = new Date('2026-11-15T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(sunday), false, 'Sunday must report market closed');

  // Public Holiday Chhath Monday (Nov 16, 2026 at 12:00 PM NPT)
  const chhathMonday = new Date('2026-11-16T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(chhathMonday), false, 'Chhath holiday Monday must report market closed');

  // Resumption Tuesday (Nov 17, 2026 at 12:00 PM NPT)
  const tuesdayOpen = new Date('2026-11-17T12:00:00+05:45');
  assert.strictEqual(isMarketOpen(tuesdayOpen), true, 'Tuesday 12:00 PM NPT must report market open');
});

test('2. latestTradingSession(now, requireCompleted) - Accurate Session Date Resolution', () => {
  // Weekend Saturday Nov 14, 2026 -> returns Friday Nov 13
  const saturday = new Date('2026-11-14T12:00:00+05:45');
  assert.strictEqual(latestTradingSession(saturday), '2026-11-13', 'Saturday must resolve latest session to 2026-11-13');

  // Holiday Monday Nov 16, 2026 -> returns Friday Nov 13
  const chhathMonday = new Date('2026-11-16T12:00:00+05:45');
  assert.strictEqual(latestTradingSession(chhathMonday), '2026-11-13', 'Holiday Monday must resolve latest session to 2026-11-13');

  // Tuesday Nov 17, 2026 at 10:15 AM NPT (before open) -> returns 2026-11-13
  const tuesdayBeforeOpen = new Date('2026-11-17T10:15:00+05:45');
  assert.strictEqual(latestTradingSession(tuesdayBeforeOpen), '2026-11-13', 'Before open on trading day must resolve to previous completed session');

  // Tuesday Nov 17, 2026 at 12:00 PM NPT (mid-session) with requireCompleted = false -> returns 2026-11-17 (today)
  const tuesdayMidSession = new Date('2026-11-17T12:00:00+05:45');
  assert.strictEqual(latestTradingSession(tuesdayMidSession, false), '2026-11-17', 'Mid-session with requireCompleted=false must return active session date');

  // Tuesday Nov 17, 2026 at 12:00 PM NPT (mid-session) with requireCompleted = true -> returns 2026-11-13 (settled baseline)
  assert.strictEqual(latestTradingSession(tuesdayMidSession, true), '2026-11-13', 'Mid-session with requireCompleted=true must step back to previous completed session');

  // Tuesday Nov 17, 2026 at 16:30 NPT (post-market) -> returns 2026-11-17
  const tuesdayPostMarket = new Date('2026-11-17T16:30:00+05:45');
  assert.strictEqual(latestTradingSession(tuesdayPostMarket), '2026-11-17', 'Post-market on trading day must return today completed session');
});

test('3. tradingDayWindow(n, endSession) - Distinct Multi-Day Session Windows', () => {
  // 1-Day window at 2026-11-13
  const w1 = tradingDayWindow(1, '2026-11-13');
  assert.deepStrictEqual(w1.dates, ['2026-11-13']);
  assert.strictEqual(w1.startDate, '2026-11-13');
  assert.strictEqual(w1.endDate, '2026-11-13');
  assert.strictEqual(w1.count, 1);

  // 5-Day window at 2026-11-13
  // Must skip Tihar holidays (Nov 8-12) and weekends (Nov 7, 8)!
  const w5 = tradingDayWindow(5, '2026-11-13');
  const expected5 = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-13'];
  assert.deepStrictEqual(w5.dates, expected5, '5D window must skip Tihar festival holidays and weekends');
  assert.strictEqual(w5.startDate, '2026-11-03');
  assert.strictEqual(w5.endDate, '2026-11-13');
  assert.strictEqual(w5.count, 5);

  // 15-Day window at 2026-11-13
  const w15 = tradingDayWindow(15, '2026-11-13');
  assert.strictEqual(w15.count, 15);
  assert.strictEqual(w15.endDate, '2026-11-13');
  assert.strictEqual(w15.startDate, '2026-10-13');

  // 30-Day window at 2026-11-13
  const w30 = tradingDayWindow(30, '2026-11-13');
  assert.strictEqual(w30.count, 30);
  assert.strictEqual(w30.endDate, '2026-11-13');
  assert.strictEqual(w30.startDate, '2026-09-21');

  // Window invariant: 1D ≠ 5D ≠ 15D ≠ 30D
  assert.notStrictEqual(w1.dates.length, w5.dates.length);
  assert.notStrictEqual(w5.dates.length, w15.dates.length);
  assert.notStrictEqual(w15.dates.length, w30.dates.length);

  // Window advancing on Tuesday Nov 17 (skipping Chhath holiday Nov 15 & 16, weekend Nov 14):
  const w5_nov17 = tradingDayWindow(5, '2026-11-17');
  const expected5_nov17 = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-13', '2026-11-17'];
  assert.deepStrictEqual(w5_nov17.dates, expected5_nov17, '5D window at Nov 17 must include Nov 17 and drop Nov 03');
});
