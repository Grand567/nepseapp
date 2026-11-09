// tests/agBatchKathmanduSchedule.test.mjs
import { getKathmanduTradingStatus } from '../proxy/utils/kathmanduTime.mjs';

let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

console.log('▶ [SUITE] agBatchKathmanduSchedule.test.mjs\n');

try {
  console.log('[TEST 1] NEPSE Trading Days: Sunday through Thursday');
  // Sunday 2026-11-08 11:30 NPT (UTC = 05:45)
  const sunTrading = getKathmanduTradingStatus(new Date('2026-11-08T05:45:00Z'));
  ok(sunTrading.isTradingDay === true, 'Sunday is an active NEPSE trading day');
  ok(sunTrading.isTradingHours === true, 'Sunday 11:30 NPT is within continuous trading hours (11:00 - 15:00)');
  ok(sunTrading.dayName === 'Sun', 'Sunday mapped to Sun weekday');

  // Thursday 2026-11-12 14:00 NPT (UTC = 08:15)
  const thuTrading = getKathmanduTradingStatus(new Date('2026-11-12T08:15:00Z'));
  ok(thuTrading.isTradingDay === true, 'Thursday is an active NEPSE trading day');
  ok(thuTrading.isTradingHours === true, 'Thursday 14:00 NPT is within trading hours');
  ok(thuTrading.dayName === 'Thu', 'Thursday mapped to Thu weekday');

  console.log('\n[TEST 2] NEPSE Weekend Days: Friday and Saturday Closed');
  // Friday 2026-11-13 12:00 NPT (UTC = 06:15)
  const friWeekend = getKathmanduTradingStatus(new Date('2026-11-13T06:15:00Z'));
  ok(friWeekend.isTradingDay === false, 'Friday is a weekend / closed non-trading day');
  ok(friWeekend.isTradingHours === false, 'Friday noon is NOT within trading hours');
  ok(friWeekend.dayName === 'Fri', 'Friday mapped to Fri weekday');

  // Saturday 2026-11-14 12:00 NPT (UTC = 06:15)
  const satWeekend = getKathmanduTradingStatus(new Date('2026-11-14T06:15:00Z'));
  ok(satWeekend.isTradingDay === false, 'Saturday is a weekend / closed non-trading day');
  ok(satWeekend.isTradingHours === false, 'Saturday noon is NOT within trading hours');

  console.log('\n[TEST 3] Trading Hours Boundary Enforcement (11:00 - 15:00 NPT)');
  // Sunday 10:59 NPT (UTC = 05:14) -> before open
  const preOpen = getKathmanduTradingStatus(new Date('2026-11-08T05:14:00Z'));
  ok(preOpen.isTradingHours === false, '10:59 NPT is outside 11:00-15:00 trading hours');

  // Sunday 11:00 NPT (UTC = 05:15) -> market opens
  const openBell = getKathmanduTradingStatus(new Date('2026-11-08T05:15:00Z'));
  ok(openBell.isTradingHours === true, '11:00 NPT opening bell is inside trading hours');

  // Sunday 15:00 NPT (UTC = 09:15) -> market close
  const closeBell = getKathmanduTradingStatus(new Date('2026-11-08T09:15:00Z'));
  ok(closeBell.isTradingHours === true, '15:00 NPT closing bell is inside trading hours');

  // Sunday 15:01 NPT (UTC = 09:16) -> after close
  const postClose = getKathmanduTradingStatus(new Date('2026-11-08T09:16:00Z'));
  ok(postClose.isTradingHours === false, '15:01 NPT is after market close');

  console.log('\n[TEST 4] Automated EOD Reconciliation Window (15:15 NPT Onwards)');
  // Sunday 15:10 NPT (UTC = 09:25) -> before 15:15 EOD window
  const preEod = getKathmanduTradingStatus(new Date('2026-11-08T09:25:00Z'));
  ok(preEod.isEodWindow === false, '15:10 NPT is before EOD window');

  // Sunday 15:15 NPT (UTC = 09:30) -> start of 15:15 EOD window
  const eodTrigger = getKathmanduTradingStatus(new Date('2026-11-08T09:30:00Z'));
  ok(eodTrigger.isEodWindow === true, '15:15 NPT triggers EOD reconciliation window');

  // Friday 15:30 NPT (UTC = 09:45) -> Friday is not a trading day
  const friPostMarket = getKathmanduTradingStatus(new Date('2026-11-13T09:45:00Z'));
  ok(friPostMarket.isEodWindow === false, 'Friday post-market does NOT trigger EOD reconciliation');

  console.log('\n[TEST 5] Timezone Independence: Explicit Asia/Kathmandu UTC+5:45 Mapping');
  const now = new Date();
  const currentKt = getKathmanduTradingStatus(now);
  ok(typeof currentKt.dateIso === 'string' && currentKt.dateIso.length === 10, 'Generates valid YYYY-MM-DD date in NPT');
  ok(currentKt.hours >= 0 && currentKt.hours < 24, 'NPT hour is valid (0-23)');
  ok(currentKt.minutes >= 0 && currentKt.minutes < 60, 'NPT minute is valid (0-59)');

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
