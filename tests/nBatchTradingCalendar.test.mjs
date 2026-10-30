/**
 * tests/nBatchTradingCalendar.test.mjs
 * 
 * Comprehensive Test Suite for NEPSE Statutory Trading Calendar & Weekend Rules.
 * Verifies:
 * 1. Statutory Mon–Fri trading week vs Sat/Sun weekend closure.
 * 2. Timezone-anchored NPT trading hours (11:00 AM – 3:00 PM).
 * 3. T+2 settlement cycle strictly skipping Saturday & Sunday weekends.
 * 4. Forward and backward session scanning (getNextValidTradingDay, getLastValidTradingDay).
 * 5. Bikram Sambat calendar matrix dayOfWeek and isWeekend classification.
 * 6. UI service banners and hub copy consistency.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  isNepseWeekend,
  isNepseTradingDay,
  getLastValidTradingDay,
  getNextValidTradingDay,
  getDetailedMarketStatus,
  calculateT2SettlementDate,
  isNepsePublicHoliday,
  formatNptDateIso
} from '../src/utils/nepseCalendar.js';

import { fetchLiveCalendarMonth } from '../src/utils/bikramSambat.js';

let passCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runAll() {
  // ── TEST 1: isNepseWeekend Statutory Classification ──────────────────────────
  console.log('[TEST 1] isNepseWeekend Saturday/Sunday Weekend vs Monday–Friday Trading');

  await test('Saturday (6) is identified as NEPSE weekend', () => {
    // 2026-11-21 is a Saturday
    const res = isNepseWeekend(new Date('2026-11-21T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, true, 'Saturday must be weekend');
    assert.strictEqual(res.dayOfWeek, 6, 'dayOfWeek must be 6');
    assert.strictEqual(res.dayName, 'Saturday');
  });

  await test('Sunday (0) is identified as NEPSE weekend', () => {
    // 2026-11-22 is a Sunday
    const res = isNepseWeekend(new Date('2026-11-22T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, true, 'Sunday must be weekend');
    assert.strictEqual(res.dayOfWeek, 0, 'dayOfWeek must be 0');
    assert.strictEqual(res.dayName, 'Sunday');
  });

  await test('Friday (5) is identified as active trading day (NOT weekend)', () => {
    // 2026-11-20 is a Friday
    const res = isNepseWeekend(new Date('2026-11-20T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, false, 'Friday must NOT be weekend');
    assert.strictEqual(res.dayOfWeek, 5, 'dayOfWeek must be 5');
    assert.strictEqual(res.dayName, 'Friday');
  });

  await test('Monday through Friday are identified as active trading days (NOT weekend)', () => {
    const dates = [
      { date: '2026-11-23', day: 1, name: 'Monday' },
      { date: '2026-11-24', day: 2, name: 'Tuesday' },
      { date: '2026-11-25', day: 3, name: 'Wednesday' },
      { date: '2026-11-26', day: 4, name: 'Thursday' },
      { date: '2026-11-27', day: 5, name: 'Friday' }
    ];
    for (const { date, day, name } of dates) {
      const res = isNepseWeekend(new Date(`${date}T12:00:00+05:45`));
      assert.strictEqual(res.isWeekend, false, `${name} must NOT be weekend`);
      assert.strictEqual(res.dayOfWeek, day);
      assert.strictEqual(res.dayName, name);
    }
  });

  // ── TEST 2: isNepseTradingDay Statutory Operating Rules ──────────────────────
  console.log('\n[TEST 2] isNepseTradingDay Active Trading Days');

  await test('Friday is active trading day when not a public holiday', () => {
    const active = isNepseTradingDay(new Date('2026-11-20T12:00:00+05:45')); // Regular Friday
    assert.strictEqual(active, true, 'Friday must be an active trading day');
  });

  await test('Saturday and Sunday are NEVER trading days', () => {
    const sat = isNepseTradingDay(new Date('2026-11-21T12:00:00+05:45'));
    const sun = isNepseTradingDay(new Date('2026-11-22T12:00:00+05:45'));
    assert.strictEqual(sat, false, 'Saturday must NOT be a trading day');
    assert.strictEqual(sun, false, 'Sunday must NOT be a trading day');
  });

  // ── TEST 3: Detailed Live Market Status ──────────────────────────────────────
  console.log('\n[TEST 3] getDetailedMarketStatus Live Sessions');

  await test('Saturday 12:30 PM NPT reports Weekend Closed', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-21T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Market must be closed on Saturday');
    assert.strictEqual(status.isWeekend, true, 'Saturday is weekend');
    assert.strictEqual(status.isTradingDay, false, 'Saturday is not trading day');
    assert.strictEqual(status.statusLabel, 'Weekend Closed');
  });

  await test('Sunday 12:30 PM NPT reports Weekend Closed', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-22T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Market must be closed on Sunday');
    assert.strictEqual(status.isWeekend, true, 'Sunday is weekend');
    assert.strictEqual(status.isTradingDay, false, 'Sunday is not trading day');
    assert.strictEqual(status.statusLabel, 'Weekend Closed');
  });

  await test('Friday 12:30 PM NPT reports Market Open and Continuous Live Trading', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-20T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, true, 'Market must be open on Friday afternoon');
    assert.strictEqual(status.isWeekend, false, 'Friday is not weekend');
    assert.strictEqual(status.isTradingDay, true, 'Friday is trading day');
    assert.strictEqual(status.session, 'CONTINUOUS', 'Session must be CONTINUOUS');
    assert.strictEqual(status.statusLabel, 'Market Open');
  });

  await test('Monday 10:35 AM NPT reports Pre-Open session', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-23T10:35:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Continuous not open during pre-open');
    assert.strictEqual(status.isPreOpen, true, 'Pre-open flag must be true');
    assert.strictEqual(status.session, 'PRE_OPEN');
    assert.strictEqual(status.statusLabel, 'Pre-Open Session');
  });

  // ── TEST 4: T+2 Settlement Cycle (Mon–Fri Schedule) ──────────────────────────
  console.log('\n[TEST 4] T+2 Settlement Cycle Under Statutory Mon–Fri Schedule');

  await test('Monday trade settles on Wednesday (T+2), sellable on Thursday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-07T12:00:00+05:45')); // Monday
    assert.strictEqual(res.tradeDayName, 'Monday');
    assert.strictEqual(res.t1DayName, 'Tuesday');
    assert.strictEqual(res.settlementDayName, 'Wednesday');
    assert.strictEqual(res.settlementDateIso, '2026-12-09');
    assert.strictEqual(res.dematSellableDayName, 'Thursday');
  });

  await test('Tuesday trade settles on Thursday (T+2), sellable on Friday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-08T12:00:00+05:45')); // Tuesday
    assert.strictEqual(res.tradeDayName, 'Tuesday');
    assert.strictEqual(res.t1DayName, 'Wednesday');
    assert.strictEqual(res.settlementDayName, 'Thursday');
    assert.strictEqual(res.settlementDateIso, '2026-12-10');
    assert.strictEqual(res.dematSellableDayName, 'Friday');
  });

  await test('Wednesday trade settles on Friday (T+2), sellable on Monday (T+3, skips Sat/Sun)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-09T12:00:00+05:45')); // Wednesday
    assert.strictEqual(res.tradeDayName, 'Wednesday');
    assert.strictEqual(res.t1DayName, 'Thursday');
    assert.strictEqual(res.settlementDayName, 'Friday');
    assert.strictEqual(res.settlementDateIso, '2026-12-11');
    assert.strictEqual(res.dematSellableDayName, 'Monday');
    assert.strictEqual(res.dematCreditDateIso, '2026-12-14');
  });

  await test('Thursday trade settles on Monday (T+2, skips Sat/Sun), sellable on Tuesday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-10T12:00:00+05:45')); // Thursday
    assert.strictEqual(res.tradeDayName, 'Thursday');
    assert.strictEqual(res.t1DayName, 'Friday', 'T+1 after Thursday is Friday');
    assert.strictEqual(res.settlementDayName, 'Monday', 'Thursday trade settles Monday');
    assert.strictEqual(res.settlementDateIso, '2026-12-14');
    assert.strictEqual(res.dematSellableDayName, 'Tuesday');
  });

  await test('Friday trade settles on Tuesday (T+2, skips Sat/Sun), sellable on Wednesday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-11T12:00:00+05:45')); // Friday
    assert.strictEqual(res.tradeDayName, 'Friday');
    assert.strictEqual(res.t1DayName, 'Monday', 'T+1 after Friday is Monday');
    assert.strictEqual(res.settlementDayName, 'Tuesday', 'Friday trade settles Tuesday');
    assert.strictEqual(res.settlementDateIso, '2026-12-15');
    assert.strictEqual(res.dematSellableDayName, 'Wednesday');
  });

  // ── TEST 5: Boundary Traversals (Next & Last Trading Day) ────────────────────
  console.log('\n[TEST 5] getNextValidTradingDay & getLastValidTradingDay');

  await test('getNextValidTradingDay from Friday lands on Monday', () => {
    const next = getNextValidTradingDay(new Date('2026-12-11T12:00:00+05:45')); // Friday
    const weekend = isNepseWeekend(next);
    assert.strictEqual(weekend.dayName, 'Monday', 'Next trading day after Friday is Monday');
  });

  await test('getNextValidTradingDay from Saturday lands on Monday', () => {
    const next = getNextValidTradingDay(new Date('2026-12-12T12:00:00+05:45')); // Saturday
    const weekend = isNepseWeekend(next);
    assert.strictEqual(weekend.dayName, 'Monday', 'Next trading day after Saturday is Monday');
  });

  await test('getNextValidTradingDay from Sunday lands on Monday', () => {
    const next = getNextValidTradingDay(new Date('2026-12-13T12:00:00+05:45')); // Sunday
    const weekend = isNepseWeekend(next);
    assert.strictEqual(weekend.dayName, 'Monday', 'Next trading day after Sunday is Monday');
  });

  await test('getLastValidTradingDay from Saturday lands on Friday', () => {
    const last = getLastValidTradingDay(new Date('2026-12-12T12:00:00+05:45')); // Saturday
    const weekend = isNepseWeekend(last);
    assert.strictEqual(weekend.dayName, 'Friday', 'Last trading day before Saturday is Friday');
  });

  await test('getLastValidTradingDay from Sunday lands on Friday', () => {
    const last = getLastValidTradingDay(new Date('2026-12-13T12:00:00+05:45')); // Sunday
    const weekend = isNepseWeekend(last);
    assert.strictEqual(weekend.dayName, 'Friday', 'Last trading day before Sunday is Friday');
  });

  // ── TEST 6: Bikram Sambat Month Days Matrix ──────────────────────────────────
  console.log('\n[TEST 6] Bikram Sambat Month Days Grid Classification');

  await test('fetchLiveCalendarMonth classifies Saturday & Sunday as weekend, Friday as trading day', async () => {
    const monthData = await fetchLiveCalendarMonth(2081, 1); // Baisakh 2081
    assert.ok(monthData.days.length > 0, 'Month days generated');
    
    for (const day of monthData.days) {
      if (day.dayOfWeek === 6 || day.dayOfWeek === 0) {
        assert.strictEqual(day.isWeekend, true, `BS Day ${day.bsDay} (${day.dayOfWeekEn}) must be weekend`);
        assert.strictEqual(day.isTradingDay, false, `BS Day ${day.bsDay} (${day.dayOfWeekEn}) cannot be trading day`);
      } else if (day.dayOfWeek === 5) {
        assert.strictEqual(day.isWeekend, false, `BS Day ${day.bsDay} (Friday) must NOT be weekend`);
      }
    }
  });

  // ── TEST 7: UI Copy Consistency Verification ────────────────────────────────
  console.log('\n[TEST 7] UI Static Copy Audit for Trading Hours & Week');

  await test('services.tsx displays Mon–Fri trading hours copy', () => {
    const servicesContent = fs.readFileSync(path.join(__dirname, '../src/components/services.tsx'), 'utf8');
    assert.match(servicesContent, /11\s*AM\s*[–-]\s*3\s*PM\s*NPT,\s*Mon[–-]Fri/i, 'Has Mon-Fri in info banners');
    assert.match(servicesContent, /Mon[–-]Fri\s*11\s*AM\s*[–-]\s*3\s*PM\s*NPT/i, 'Has Mon-Fri in performers');
    assert.match(servicesContent, /Mon[–-]Fri\s*11:00\s*AM\s*[–-]\s*3:00\s*PM\s*NPT/i, 'Has Mon-Fri in depth notice');
  });

  await test('ServicesHub.tsx displays Mon–Fri statutory market hours', () => {
    const hubContent = fs.readFileSync(path.join(__dirname, '../src/components/ServicesHub.tsx'), 'utf8');
    assert.match(hubContent, /Mon[–-]Fri\s*11:00\s*AM\s*[–-]\s*3:00\s*PM\s*NPT/, 'ServicesHub has Mon-Fri hours');
  });

  await test('App.jsx displays Mon–Fri trading days and Saturday & Sunday weekend', () => {
    const appContent = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
    assert.match(appContent, /Mon\s*[–-]\s*Fri\s*\(सोम\s*[–-]\s*शुक्र\)/, 'App.jsx shows Mon-Fri trading days');
    assert.match(appContent, /Sat & Sun market CLOSED/, 'App.jsx shows Saturday & Sunday closed');
    assert.match(appContent, /Saturday & Sunday/, 'App.jsx shows Saturday & Sunday weekend');
    assert.match(appContent, /Weekend Closed \(शनिबार\/आइतबार\)/, 'App.jsx shows Saturday/Sunday Nepali weekend');
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passCount} passed, 0 failed.`);
  console.log('======================================================================');
  console.log('✅ STATUTORY SATURDAY–SUNDAY WEEKEND & MON–FRI CALENDAR VERIFIED!\n');
}

runAll().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
