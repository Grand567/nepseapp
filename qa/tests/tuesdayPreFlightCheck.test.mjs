/**
 * qa/tests/tuesdayPreFlightCheck.test.mjs
 * Operational Pre-Flight Verification Suite for Tuesday November 17, 2026 Market Open
 *
 * Simulates the complete timeline from Saturday Nov 14 through Tuesday Nov 17 close:
 * - Saturday Nov 14 (Weekend Closed)
 * - Sunday Nov 15 (Weekend Closed)
 * - Monday Nov 16 (Chhath Parva Holiday Closed)
 * - Tuesday Nov 17 10:45 AM (Premarket Prep Window)
 * - Tuesday Nov 17 11:00 AM (Core Market Open)
 * - Tuesday Nov 17 15:15 PM (EOD Settlement Window)
 */

import assert from 'assert';
import { 
  getDetailedMarketStatus, 
  isNepseTradingDay, 
  getNextValidTradingDay,
  getLastValidTradingDay,
  calculateT2SettlementDate,
  countNepseTradingSessionsBetween 
} from '../../src/utils/nepseCalendar.js';
import { getKathmanduTradingStatus } from '../../proxy/utils/kathmanduTime.mjs';

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('========================================================================');
console.log('OPERATIONAL PRE-FLIGHT VERIFICATION: TUESDAY NOV 17, 2026 READINESS');
console.log('========================================================================\n');

// 1. Saturday Weekend Check (Nov 14, 2026)
it('Saturday Nov 14: Confirms market closed, weekend, and last session is Nov 13', () => {
  const satDate = new Date('2026-11-14T05:00:00.000Z'); // 10:45 AM NPT
  const kt = getKathmanduTradingStatus(satDate);
  const status = getDetailedMarketStatus(satDate);
  const lastValid = getLastValidTradingDay(satDate, true).toISOString().slice(0, 10);

  assert.strictEqual(kt.isWeekend, true, 'Saturday must be weekend');
  assert.strictEqual(kt.isTradingDay, false, 'Saturday is not trading day');
  assert.strictEqual(status.isOpen, false, 'Market must be closed on Saturday');
  assert.strictEqual(lastValid, '2026-11-13', 'Last session must be Friday Nov 13');
});

// 2. Sunday Weekend Check (Nov 15, 2026)
it('Sunday Nov 15: Confirms market closed, weekend, and last session is Nov 13', () => {
  const sunDate = new Date('2026-11-15T06:00:00.000Z'); // 11:45 AM NPT
  const kt = getKathmanduTradingStatus(sunDate);
  const status = getDetailedMarketStatus(sunDate);
  const lastValid = getLastValidTradingDay(sunDate, true).toISOString().slice(0, 10);

  assert.strictEqual(kt.isWeekend, true, 'Sunday must be weekend');
  assert.strictEqual(kt.isTradingDay, false, 'Sunday is not trading day');
  assert.strictEqual(status.isOpen, false, 'Market must be closed on Sunday');
  assert.strictEqual(lastValid, '2026-11-13', 'Last session must be Friday Nov 13');
});

// 3. Monday Chhath Parva Holiday Check (Nov 16, 2026)
it('Monday Nov 16: Confirms public holiday, market closed, zero live feeds', () => {
  const monDate = new Date('2026-11-16T06:00:00.000Z'); // 11:45 AM NPT
  const kt = getKathmanduTradingStatus(monDate);
  const status = getDetailedMarketStatus(monDate);
  const lastValid = getLastValidTradingDay(monDate, true).toISOString().slice(0, 10);

  assert.strictEqual(kt.isHoliday, true, 'Monday Nov 16 must be recognized as holiday');
  assert.strictEqual(kt.isTradingDay, false, 'Monday Nov 16 is not a trading day');
  assert.strictEqual(status.isOpen, false, 'Market must remain closed on Chhath holiday');
  assert.strictEqual(lastValid, '2026-11-13', 'Last session remains Friday Nov 13');
});

// 4. Next Trading Day Resolution from Monday Nov 16
it('Next Trading Day Resolution: Lands on Tuesday Nov 17, 2026', () => {
  const monDate = new Date('2026-11-16T06:00:00.000Z');
  const nextTradingDay = getNextValidTradingDay(monDate);
  const nextIso = nextTradingDay.toISOString().slice(0, 10);
  assert.strictEqual(nextIso, '2026-11-17', 'Next trading session must strictly be Tuesday Nov 17');
});

// 5. Tuesday Premarket Prep Window (Nov 17, 2026 at 10:45 AM NPT)
it('Tuesday Nov 17 (10:45 AM NPT): Enters premarket keep-alive window', () => {
  const tuePremarket = new Date('2026-11-17T05:00:00.000Z'); // 10:45 AM NPT
  const kt = getKathmanduTradingStatus(tuePremarket);
  const status = getDetailedMarketStatus(tuePremarket);

  assert.strictEqual(kt.isTradingDay, true, 'Tuesday Nov 17 is an active trading day');
  assert.strictEqual(kt.isHoliday, false, 'Tuesday Nov 17 is not a holiday');
  assert.strictEqual(kt.isWeekend, false, 'Tuesday Nov 17 is not a weekend');
  assert.strictEqual(kt.isKeepAliveWindow, true, '10:45 AM is inside pre-market keepalive');
  assert.strictEqual(status.isOpen, false, 'Market does not open before 11:00 AM');
});

// 6. Tuesday Core Market Open (Nov 17, 2026 at 11:01 AM NPT)
it('Tuesday Nov 17 (11:01 AM NPT): Core trading window active, 1D live tape triggers', () => {
  const tueOpen = new Date('2026-11-17T05:16:00.000Z'); // 11:01 AM NPT
  const kt = getKathmanduTradingStatus(tueOpen);
  const status = getDetailedMarketStatus(tueOpen);

  assert.strictEqual(kt.isTradingDay, true);
  assert.strictEqual(kt.isTradingHours, true, '11:01 AM is core trading hours');
  assert.strictEqual(status.isOpen, true, 'Market status must be OPEN');
  assert.strictEqual(status.targetSessionDate, '2026-11-17', 'Target live session date must be 2026-11-17');
});

// 7. Tuesday EOD Settlement Window (Nov 17, 2026 at 15:16 PM NPT)
it('Tuesday Nov 17 (15:16 PM NPT): Market closed, EOD settlement window active', () => {
  const tueClose = new Date('2026-11-17T09:31:00.000Z'); // 15:16 PM NPT
  const kt = getKathmanduTradingStatus(tueClose);
  const status = getDetailedMarketStatus(tueClose);

  assert.strictEqual(kt.isTradingDay, true);
  assert.strictEqual(kt.isTradingHours, false, 'Market closed after 15:00 NPT');
  assert.strictEqual(kt.isEodWindow, true, '15:16 PM is EOD settlement window');
  assert.strictEqual(status.isOpen, false, 'Market must be CLOSED after 15:00');
});

// 8. T+2 Demat Settlement Schedule for Tuesday Trades
it('T+2 Demat Settlement Schedule for Tuesday Nov 17 trade: Settles Thursday Nov 19', () => {
  const tueTrade = new Date('2026-11-17T06:00:00.000Z');
  const sched = calculateT2SettlementDate(tueTrade);

  assert.strictEqual(sched.tradeDateIso, '2026-11-17', 'Trade date is Tuesday Nov 17');
  assert.strictEqual(sched.t1Iso, '2026-11-18', 'T+1 is Wednesday Nov 18');
  assert.strictEqual(sched.settlementDateIso, '2026-11-19', 'T+2 settlement is Thursday Nov 19');
  assert.strictEqual(sched.dematCreditDateIso, '2026-11-20', 'T+3 Demat sellable is Friday Nov 20');
});

// 9. Session Counter between Nov 13 and Nov 17
it('Trading Session Counter: Exactly 1 session elapsed between Nov 13 and Nov 17', () => {
  const sessions = countNepseTradingSessionsBetween('2026-11-13', '2026-11-17');
  assert.strictEqual(sessions, 1, 'Strictly 1 trading session elapsed (skipping Sat, Sun, Mon Chhath)');
});

console.log('\n========================================================================');
console.log(`PRE-FLIGHT CHECK RESULTS: ${passed}/${total} TESTS PASSED CLEANLY`);
console.log('========================================================================\n');
