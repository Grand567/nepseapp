// tests/statutoryIntegrations.test.mjs
import assert from 'node:assert';
import test from 'node:test';
import { runEodReconciliation, getLatestReconciliation } from '../proxy/utils/eodReconciliationEngine.mjs';
import { getEvaluatedPromoterLockinList, getScripPromoterLockin } from '../proxy/utils/promoterLockinEngine.mjs';
import { isNepseTradingDay, isNepsePublicHoliday, getNextValidTradingDay, NEPSE_PUBLIC_HOLIDAYS } from '../src/utils/nepseCalendar.js';

test('1. Automated EOD 3:15 PM Bhavsani vs SQLite Reconciliation Engine', () => {
  const audit = runEodReconciliation('2026-11-06');
  
  assert.strictEqual(audit.tradeDate, '2026-11-06', 'Audit tradeDate must match 2026-11-06');
  assert.strictEqual(audit.status, 'CERTIFIED_AUTHENTIC', 'Audit status must be CERTIFIED_AUTHENTIC');
  assert.strictEqual(audit.parityPercentage, 100, 'Audit parity must be exactly 100%');
  assert.strictEqual(audit.contractsCount, 33215, 'Audit contract count must be 33,215');
  assert.strictEqual(audit.variances.volumeDiff, 0, 'Volume difference must be zero');
  assert.ok(audit.certificationHash && audit.certificationHash.length === 64, 'Must generate 64-char SHA-256 hash');
  assert.ok(audit.summaryNp.includes('१००% डाटा एकरूपता प्रमाणित गरियो'), 'Nepali summary must certify 100% parity');

  const latest = getLatestReconciliation();
  assert.ok(latest, 'getLatestReconciliation must return latest record');
  assert.strictEqual(latest.status, 'CERTIFIED_AUTHENTIC');
});

test('2. SEBON Promoter 3-Year Lock-In & Dumping Risk Radar', () => {
  const referenceDate = '2026-11-06';
  const list = getEvaluatedPromoterLockinList(referenceDate);
  
  assert.ok(Array.isArray(list), 'Lockin list must be an array');
  assert.ok(list.length >= 10, 'Must have at least 10 tracked companies');

  // MEN: Mountain Energy Nepal (Lock-in Expiry: 2026-11-20 -> 14 days)
  const men = getScripPromoterLockin('MEN', referenceDate);
  assert.strictEqual(men.symbol, 'MEN');
  assert.strictEqual(men.daysRemaining, 14, 'MEN must have 14 days remaining');
  assert.strictEqual(men.riskCategory, 'CRITICAL_SUPPLY_SHOCK');
  assert.strictEqual(men.riskLevel, 'High');
  assert.strictEqual(men.isThreat, true);
  assert.strictEqual(men.unlockSupplyRatio, 4, 'MEN unlock ratio must be 4x public float');
  assert.ok(men.fundamentals.eps > 0, 'MEN fundamentals must include positive EPS');
  assert.ok(men.warningNp.includes('चरम सप्लाइ डम्पिङ खतरा'), 'Must include critical warning in Nepali');

  // HRL: Himalayan Reinsurance (Lock-in Expiry: 2026-12-25 -> 49 days)
  const hrl = getScripPromoterLockin('HRL', referenceDate);
  assert.strictEqual(hrl.symbol, 'HRL');
  assert.strictEqual(hrl.daysRemaining, 49, 'HRL must have 49 days remaining');
  assert.strictEqual(hrl.riskCategory, 'EXPIRING_SOON');
  assert.strictEqual(hrl.isThreat, true);

  // AKJCL: Ankhu Khola (Unlocked)
  const akjcl = getScripPromoterLockin('AKJCL', referenceDate);
  assert.strictEqual(akjcl.symbol, 'AKJCL');
  assert.strictEqual(akjcl.isExpired, true);
  assert.strictEqual(akjcl.status, 'Fully Unlocked');
  assert.strictEqual(akjcl.isThreat, false);
});

test('3. Official Statutory Trading Calendar: 2083 Tihar & Chhath Holidays', () => {
  // Verify Nepal Rajpatra Statutory Public Holidays
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-08'], 'Tihar (Laxmi Puja)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-09'], 'Tihar (Gai Puja)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-10'], 'Tihar (Gobardhan Puja / Mha Puja)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-11'], 'Tihar (Bhai Tika / Kija Puja)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-12'], 'Tihar Holiday (Day after Bhai Tika / Kartik 26)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-13'], 'Tihar-Chhath Bridge Holiday (Kartik 27)');
  assert.strictEqual(NEPSE_PUBLIC_HOLIDAYS['2026-11-15'], 'Chhath Parva (Kartik 29)');

  // Verify that all days between 2026-11-07 and 2026-11-15 are non-trading sessions
  for (let d = 7; d <= 15; d++) {
    const iso = `2026-11-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(`${iso}T12:00:00+05:45`);
    assert.strictEqual(isNepseTradingDay(dateObj), false, `${iso} must NOT be a trading day`);
  }

  // Verify market resumption on Monday, Kartik 30 (2026-11-16)
  const resumptionDate = new Date('2026-11-16T12:00:00+05:45');
  assert.strictEqual(isNepseTradingDay(resumptionDate), true, '2026-11-16 (Monday, Kartik 30) must be an active trading day');

  // Verify getNextValidTradingDay from Friday 2026-11-06 lands accurately on Monday 2026-11-16
  const nov6 = new Date('2026-11-06T12:00:00+05:45');
  const nextTradingDay = getNextValidTradingDay(nov6);
  const nextIso = nextTradingDay.toISOString().slice(0, 10);
  assert.strictEqual(nextIso, '2026-11-16', `Next trading day after 2026-11-06 must be 2026-11-16 (actual: ${nextIso})`);
});
