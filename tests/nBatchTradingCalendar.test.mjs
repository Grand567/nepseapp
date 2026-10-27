/**
 * tests/nBatchTradingCalendar.test.mjs
 * 
 * Comprehensive Test Suite for NEPSE Trading Calendar & Weekend Rules (FN-01 / SH-02).
 * Verifies:
 * 1. Statutory Sun–Thu trading week vs Fri/Sat weekend closure.
 * 2. Timezone-anchored NPT trading hours (11:00 AM – 3:00 PM).
 * 3. T+2 settlement cycle strictly skipping Friday & Saturday weekends.
 * 4. Forward and backward session scanning (getNextValidTradingDay, getLastValidTradingDay).
 * 5. Bikram Sambat calendar matrix dayOfWeek and isWeekend classification.
 * 6. UI service banners and hub copy consistency.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  isNepseWeekend,
  isNepseTradingDay,
  getLastValidTradingDay,
  getNextValidTradingDay,
  calculateT2SettlementDate,
  getDetailedMarketStatus
} from '../src/utils/nepseCalendar.js';

import { fetchLiveCalendarMonth } from '../src/utils/bikramSambat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log(' NEPSE TRADING CALENDAR & TRADING WEEK AUDIT SUITE (FN-01 / SH-02)');
console.log('======================================================================\n');

let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAll() {
  // ── TEST 1: isNepseWeekend Statutory Classification ──────────────────────────
  console.log('[TEST 1] isNepseWeekend Friday/Saturday Weekend vs Sunday Trading');

  await test('Friday (5) is identified as NEPSE weekend', () => {
    // 2026-11-20 is a Friday
    const res = isNepseWeekend(new Date('2026-11-20T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, true, 'Friday must be weekend');
    assert.strictEqual(res.dayOfWeek, 5, 'dayOfWeek must be 5');
    assert.strictEqual(res.dayName, 'Friday');
  });

  await test('Saturday (6) is identified as NEPSE weekend', () => {
    // 2026-11-21 is a Saturday
    const res = isNepseWeekend(new Date('2026-11-21T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, true, 'Saturday must be weekend');
    assert.strictEqual(res.dayOfWeek, 6, 'dayOfWeek must be 6');
    assert.strictEqual(res.dayName, 'Saturday');
  });

  await test('Sunday (0) is identified as an active NEPSE trading day (NOT weekend)', () => {
    // 2026-11-22 is a Sunday
    const res = isNepseWeekend(new Date('2026-11-22T12:00:00+05:45'));
    assert.strictEqual(res.isWeekend, false, 'Sunday must NOT be weekend');
    assert.strictEqual(res.dayOfWeek, 0, 'dayOfWeek must be 0');
    assert.strictEqual(res.dayName, 'Sunday');
  });

  await test('Monday through Thursday are identified as weekdays (NOT weekend)', () => {
    const dates = [
      { date: '2026-11-23', day: 1, name: 'Monday' },
      { date: '2026-11-24', day: 2, name: 'Tuesday' },
      { date: '2026-11-25', day: 3, name: 'Wednesday' },
      { date: '2026-11-26', day: 4, name: 'Thursday' }
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

  await test('Sunday is active trading day when not a public holiday', () => {
    const active = isNepseTradingDay(new Date('2026-11-22T12:00:00+05:45')); // Regular Sunday
    assert.strictEqual(active, true, 'Sunday must be an active trading day');
  });

  await test('Friday and Saturday are NEVER trading days', () => {
    const fri = isNepseTradingDay(new Date('2026-11-20T12:00:00+05:45'));
    const sat = isNepseTradingDay(new Date('2026-11-21T12:00:00+05:45'));
    assert.strictEqual(fri, false, 'Friday must NOT be a trading day');
    assert.strictEqual(sat, false, 'Saturday must NOT be a trading day');
  });

  // ── TEST 3: Detailed Live Market Status ──────────────────────────────────────
  console.log('\n[TEST 3] getDetailedMarketStatus Live Sessions');

  await test('Sunday 12:30 PM NPT reports Market Open and Continuous Live Trading', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-22T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, true, 'Market must be open on Sunday afternoon');
    assert.strictEqual(status.isWeekend, false, 'Sunday is not weekend');
    assert.strictEqual(status.isTradingDay, true, 'Sunday is trading day');
    assert.strictEqual(status.session, 'CONTINUOUS', 'Session must be CONTINUOUS');
    assert.strictEqual(status.statusLabel, 'Market Open');
  });

  await test('Friday 12:30 PM NPT reports Weekend Closed', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-20T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Market must be closed on Friday');
    assert.strictEqual(status.isWeekend, true, 'Friday is weekend');
    assert.strictEqual(status.isTradingDay, false, 'Friday is not trading day');
    assert.strictEqual(status.statusLabel, 'Weekend Closed');
    assert.ok(status.message.includes('Friday Weekend'), 'Message mentions Friday weekend');
  });

  await test('Saturday 12:30 PM NPT reports Weekend Closed', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-21T12:30:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Market must be closed on Saturday');
    assert.strictEqual(status.isWeekend, true, 'Saturday is weekend');
    assert.strictEqual(status.isTradingDay, false, 'Saturday is not trading day');
    assert.strictEqual(status.statusLabel, 'Weekend Closed');
  });

  await test('Sunday 10:35 AM NPT reports Pre-Open session', () => {
    const status = getDetailedMarketStatus(new Date('2026-11-22T10:35:00+05:45'));
    assert.strictEqual(status.isOpen, false, 'Continuous not open during pre-open');
    assert.strictEqual(status.isPreOpen, true, 'Pre-open flag must be true');
    assert.strictEqual(status.session, 'PRE_OPEN');
    assert.strictEqual(status.statusLabel, 'Pre-Open Session');
  });

  // ── TEST 4: T+2 Settlement Cycle (Sun–Thu Schedule) ──────────────────────────
  console.log('\n[TEST 4] T+2 Settlement Cycle Under Statutory Sun–Thu Schedule');

  await test('Sunday trade settles on Tuesday (T+2), sellable on Wednesday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-06T12:00:00+05:45')); // Sunday
    assert.strictEqual(res.tradeDayName, 'Sunday');
    assert.strictEqual(res.t1DayName, 'Monday');
    assert.strictEqual(res.settlementDayName, 'Tuesday', 'Sunday trade settles Tuesday');
    assert.strictEqual(res.settlementDateIso, '2026-12-08');
    assert.strictEqual(res.dematSellableDayName, 'Wednesday', 'Demat credit sellable Wednesday');
  });

  await test('Monday trade settles on Wednesday (T+2), sellable on Thursday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-07T12:00:00+05:45')); // Monday
    assert.strictEqual(res.tradeDayName, 'Monday');
    assert.strictEqual(res.t1DayName, 'Tuesday');
    assert.strictEqual(res.settlementDayName, 'Wednesday');
    assert.strictEqual(res.settlementDateIso, '2026-12-09');
    assert.strictEqual(res.dematSellableDayName, 'Thursday');
  });

  await test('Tuesday trade settles on Thursday (T+2), sellable on Sunday (T+3, skips Fri/Sat)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-08T12:00:00+05:45')); // Tuesday
    assert.strictEqual(res.tradeDayName, 'Tuesday');
    assert.strictEqual(res.settlementDayName, 'Thursday');
    assert.strictEqual(res.settlementDateIso, '2026-12-10');
    assert.strictEqual(res.dematSellableDayName, 'Sunday', 'T+3 skips Friday and Saturday to Sunday');
    assert.strictEqual(res.dematCreditDateIso, '2026-12-13');
  });

  await test('Wednesday trade settles on Sunday (T+2, skips Fri/Sat), sellable on Monday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-09T12:00:00+05:45')); // Wednesday
    assert.strictEqual(res.tradeDayName, 'Wednesday');
    assert.strictEqual(res.t1DayName, 'Thursday');
    assert.strictEqual(res.settlementDayName, 'Sunday', 'Wednesday trade settles Sunday');
    assert.strictEqual(res.settlementDateIso, '2026-12-13');
    assert.strictEqual(res.dematSellableDayName, 'Monday');
  });

  await test('Thursday trade settles on Monday (T+2, skips Fri/Sat), sellable on Tuesday (T+3)', () => {
    const res = calculateT2SettlementDate(new Date('2026-12-10T12:00:00+05:45')); // Thursday
    assert.strictEqual(res.tradeDayName, 'Thursday');
    assert.strictEqual(res.t1DayName, 'Sunday', 'T+1 after Thursday is Sunday');
    assert.strictEqual(res.settlementDayName, 'Monday', 'Thursday trade settles Monday');
    assert.strictEqual(res.settlementDateIso, '2026-12-14');
    assert.strictEqual(res.dematSellableDayName, 'Tuesday');
  });

  // ── TEST 5: Boundary Traversals (Next & Last Trading Day) ────────────────────
  console.log('\n[TEST 5] getNextValidTradingDay & getLastValidTradingDay');

  await test('getNextValidTradingDay from Thursday lands on Sunday', () => {
    const next = getNextValidTradingDay(new Date('2026-12-10T12:00:00+05:45')); // Thursday
    const weekend = isNepseWeekend(next);
    assert.strictEqual(weekend.dayName, 'Sunday', 'Next trading day after Thursday is Sunday');
  });

  await test('getNextValidTradingDay from Friday lands on Sunday', () => {
    const next = getNextValidTradingDay(new Date('2026-12-11T12:00:00+05:45')); // Friday
    const weekend = isNepseWeekend(next);
    assert.strictEqual(weekend.dayName, 'Sunday', 'Next trading day after Friday is Sunday');
  });

  await test('getLastValidTradingDay from Saturday lands on Thursday', () => {
    const last = getLastValidTradingDay(new Date('2026-12-12T12:00:00+05:45')); // Saturday
    const weekend = isNepseWeekend(last);
    assert.strictEqual(weekend.dayName, 'Thursday', 'Last trading day before Saturday is Thursday');
  });

  // ── TEST 6: Bikram Sambat Month Days Matrix ──────────────────────────────────
  console.log('\n[TEST 6] Bikram Sambat Month Days Grid Classification');

  await test('fetchLiveCalendarMonth classifies Friday & Saturday as weekend, Sunday as trading day', async () => {
    const monthData = await fetchLiveCalendarMonth(2081, 1); // Baisakh 2081
    assert.ok(monthData.days.length > 0, 'Month days generated');
    
    for (const day of monthData.days) {
      if (day.dayOfWeek === 5 || day.dayOfWeek === 6) {
        assert.strictEqual(day.isWeekend, true, `BS Day ${day.bsDay} (${day.dayOfWeekEn}) must be weekend`);
        assert.strictEqual(day.isTradingDay, false, `BS Day ${day.bsDay} (${day.dayOfWeekEn}) cannot be trading day`);
      } else if (day.dayOfWeek === 0) {
        assert.strictEqual(day.isWeekend, false, `BS Day ${day.bsDay} (Sunday) must NOT be weekend`);
      }
    }
  });

  // ── TEST 7: UI Copy Consistency Verification ────────────────────────────────
  console.log('\n[TEST 7] UI Static Copy Audit for Trading Hours & Week');

  await test('services.tsx does NOT contain outdated Mon–Fri trading hours copy', () => {
    const servicesContent = fs.readFileSync(path.join(__dirname, '../src/components/services.tsx'), 'utf8');
    assert.doesNotMatch(servicesContent, /11\s*AM\s*[–-]\s*3\s*PM\s*NPT,\s*Mon[–-]Fri/i, 'No Mon-Fri in info banners');
    assert.doesNotMatch(servicesContent, /Mon[–-]Fri\s*11\s*AM\s*[–-]\s*3\s*PM\s*NPT/i, 'No Mon-Fri in performers');
    assert.doesNotMatch(servicesContent, /Mon[–-]Fri\s*11:00\s*AM\s*[–-]\s*3:00\s*PM\s*NPT/i, 'No Mon-Fri in depth notice');
  });

  await test('ServicesHub.tsx displays Sun–Thu statutory market hours', () => {
    const hubContent = fs.readFileSync(path.join(__dirname, '../src/components/ServicesHub.tsx'), 'utf8');
    assert.match(hubContent, /Sun[–-]Thu\s*11:00\s*AM\s*[–-]\s*3:00\s*PM\s*NPT/, 'ServicesHub has Sun-Thu hours');
    assert.doesNotMatch(hubContent, /Mon[–-]Fri\s*11:00\s*AM\s*[–-]\s*3:00\s*PM\s*NPT/, 'ServicesHub does not have Mon-Fri');
  });

  await test('App.jsx displays Sun–Thu trading days and Friday & Saturday weekend', () => {
    const appContent = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
    assert.match(appContent, /Sun\s*[–-]\s*Thu\s*\(आइत\s*[–-]\s*बिही\)/, 'App.jsx shows Sun-Thu trading days');
    assert.match(appContent, /Sunday market is OPEN/, 'App.jsx shows Sunday is OPEN');
    assert.match(appContent, /Friday & Saturday/, 'App.jsx shows Friday & Saturday weekend');
    assert.match(appContent, /Weekend Closed \(शुक्रबार\/शनिबार\)/, 'App.jsx shows Friday/Saturday Nepali weekend');
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passCount} passed, 0 failed.`);
  console.log('======================================================================');
  console.log('✅ FN-01 / SH-02 HIGH FIX VERIFIED: STATUTORY SUNDAY–THURSDAY CALENDAR RESTORED!\n');
}

runAll();
