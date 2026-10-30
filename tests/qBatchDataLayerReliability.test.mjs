/**
 * tests/qBatchDataLayerReliability.test.mjs
 * Verification Test Suite for STEP 1: DATA LAYER RELIABILITY
 *
 * Verifies:
 * 1. Sunday-to-Thursday trading day schedule adherence & holiday skipping
 * 2. Contract number deduplication & schema normalization
 * 3. Exponential backoff retry engine for transient network failures
 * 4. Daily completeness auditing (stored vs exchange reported trades)
 * 5. Immutable compressed raw floorsheet backup and exact restoration
 * 6. Daily stock price persistence into SQLite ledger
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isNepseTradingDay, isNepseWeekend, isNepsePublicHoliday } from '../src/utils/nepseCalendar.js';
import { fetchWithRetryBackoff, isTransientNetworkError } from '../proxy/utils/retryHelper.mjs';
import { deduplicateFloorsheetContracts, extractContractNumber } from '../proxy/utils/floorsheetDeduplicator.mjs';
import {
  db,
  ingestDailyStockPrices,
  recordDailyCompleteness,
  getDailyCompletenessStatus,
  backupRawFloorsheet,
  restoreRawFloorsheetBackup,
  listRawFloorsheetBackups,
  ingestDailyFloorsheetTransaction
} from '../proxy/db/ledgerStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('======================================================================');
console.log(' STEP 1: DATA LAYER RELIABILITY VERIFICATION SUITE');
console.log('======================================================================\n');

// ─── TEST 1: TRADING DAY SCHEDULE & HOLIDAY SKIPPING ──────────────────────
console.log('[TEST 1] Sunday-to-Thursday Trading Day Schedule & Holiday Skipping');

it('Sunday (0) to Thursday (4) are recognized as NEPSE trading days', () => {
  // Test non-holiday regular dates
  // 2026-11-01: Sunday
  const sunday = new Date('2026-11-01T12:00:00+05:45');
  assert.strictEqual(isNepseWeekend(sunday).isWeekend, false, 'Sunday must not be weekend');
  assert.strictEqual(isNepseTradingDay(sunday), true, 'Sunday must be an active trading day');

  // 2026-10-26: Monday
  const monday = new Date('2026-10-26T12:00:00+05:45');
  assert.strictEqual(isNepseWeekend(monday).isWeekend, false, 'Monday must not be weekend');
  assert.strictEqual(isNepseTradingDay(monday), true, 'Monday must be an active trading day');

  // 2026-10-27: Tuesday
  const tuesday = new Date('2026-10-27T12:00:00+05:45');
  assert.strictEqual(isNepseTradingDay(tuesday), true, 'Tuesday must be an active trading day');

  // 2026-10-28: Wednesday
  const wednesday = new Date('2026-10-28T12:00:00+05:45');
  assert.strictEqual(isNepseTradingDay(wednesday), true, 'Wednesday must be an active trading day');

  // 2026-10-29: Thursday
  const thursday = new Date('2026-10-29T12:00:00+05:45');
  assert.strictEqual(isNepseTradingDay(thursday), true, 'Thursday must be an active trading day');
});

it('Friday (5) and Saturday (6) are strictly excluded as weekend closures', () => {
  // 2026-10-30: Friday
  const friday = new Date('2026-10-30T12:00:00+05:45');
  assert.strictEqual(isNepseWeekend(friday).isWeekend, true, 'Friday must be weekend');
  assert.strictEqual(isNepseTradingDay(friday), false, 'Friday must NOT be trading day');

  // 2026-10-31: Saturday
  const saturday = new Date('2026-10-31T12:00:00+05:45');
  assert.strictEqual(isNepseWeekend(saturday).isWeekend, true, 'Saturday must be weekend');
  assert.strictEqual(isNepseTradingDay(saturday), false, 'Saturday must NOT be trading day');
});

it('NEPSE Public Holidays are strictly skipped even when falling on weekdays', () => {
  // 2026-10-20: Dashain Vijaya Dashami (Tuesday)
  const dashainTuesday = new Date('2026-10-20T12:00:00+05:45');
  const hol = isNepsePublicHoliday(dashainTuesday);
  assert.strictEqual(hol.isHoliday, true, 'Dashain Vijaya Dashami must be holiday');
  assert.strictEqual(isNepseTradingDay(dashainTuesday), false, 'Holiday on Tuesday must not be a trading day');

  // 2026-05-01: Labour Day / Buddha Jayanti (Friday)
  const labourDay = new Date('2026-05-01T12:00:00+05:45');
  assert.strictEqual(isNepseTradingDay(labourDay), false, 'Labour day must not be a trading day');
});

// ─── TEST 2: CONTRACT NUMBER DEDUPLICATION ────────────────────────────────
console.log('\n[TEST 2] Contract Number Deduplication & Normalization');

it('Extracts contract numbers uniformly from varying data source schemas', () => {
  const notsRecord = { contractId: 2026102605012548, symbol: 'NICA' };
  const ssRecord = { contract_no: '2026102605012548', symbol: 'NICA' };
  const altRecord = { contractNo: '2026102605012548', symbol: 'NICA' };
  const fallbackRecord = { symbol: 'NICA', businessDate: '2026-10-26' };

  assert.strictEqual(extractContractNumber(notsRecord), '2026102605012548');
  assert.strictEqual(extractContractNumber(ssRecord), '2026102605012548');
  assert.strictEqual(extractContractNumber(altRecord), '2026102605012548');
  assert.strictEqual(extractContractNumber(fallbackRecord, '2026-10-26', 0), 'SYN-2026-10-26-NICA-1');
});

it('Deduplicates duplicate trades by contract number and preserves unique trades', () => {
  const rawTrades = [
    { contractId: 'C1001', symbol: 'NICA', qty: 100, rate: 450, buyer: 58, seller: 16 },
    { contractId: 'C1002', symbol: 'NICA', qty: 50, rate: 451, buyer: 45, seller: 34 },
    { contractId: 'C1001', symbol: 'NICA', qty: 100, rate: 450, buyer: 58, seller: 16 }, // DUPLICATE
    { contractId: 'C1003', symbol: 'SHPC', qty: 200, rate: 290, buyer: 28, seller: 58 },
    { contract_no: 'C1002', symbol: 'NICA', qty: 50, rate: 451, buyer: 45, seller: 34 }, // DUPLICATE (contract_no)
    { contractId: 'C1004', symbol: 'UNHPL', qty: 500, rate: 180, buyer: 42, seller: 48 },
  ];

  const result = deduplicateFloorsheetContracts(rawTrades, '2026-10-26');
  assert.strictEqual(result.totalRawCount, 6, 'Total raw count must be 6');
  assert.strictEqual(result.duplicateCount, 2, 'Duplicate count must be 2');
  assert.strictEqual(result.uniqueCount, 4, 'Unique count must be 4');
  assert.deepStrictEqual(
    result.deduplicatedTrades.map(t => t.contractId),
    ['C1001', 'C1002', 'C1003', 'C1004'],
    'Must preserve order of first-seen unique contracts'
  );
});

// ─── TEST 3: RETRY WITH EXPONENTIAL BACKOFF ───────────────────────────────
console.log('\n[TEST 3] Retry with Exponential Backoff on Transient Network Errors');

it('isTransientNetworkError correctly classifies network dropouts, 429, and 5xx', () => {
  assert.strictEqual(isTransientNetworkError({ code: 'ECONNRESET' }), true);
  assert.strictEqual(isTransientNetworkError({ code: 'ETIMEDOUT' }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 429 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 502 } }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 503 } }), true);
  assert.strictEqual(isTransientNetworkError({ message: 'socket hang up' }), true);
  assert.strictEqual(isTransientNetworkError({ response: { status: 404 } }), false);
  assert.strictEqual(isTransientNetworkError({ response: { status: 400 } }), false);
});

await itAsync('fetchWithRetryBackoff succeeds after transient failures with exponential delay', async () => {
  let attempts = 0;
  const delays = [];
  const t0 = Date.now();

  const mockOperation = async (att) => {
    attempts++;
    if (attempts < 3) {
      const err = new Error('Connection timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return { data: 'SUCCESS_AFTER_RETRIES', attempts };
  };

  const result = await fetchWithRetryBackoff(mockOperation, {
    maxRetries: 4,
    initialDelayMs: 40,
    backoffFactor: 2,
    onRetry: (err, att, delayMs) => {
      delays.push(delayMs);
    }
  });

  assert.strictEqual(result.data, 'SUCCESS_AFTER_RETRIES');
  assert.strictEqual(result.attempts, 3, 'Must succeed on 3rd attempt');
  assert.strictEqual(delays.length, 2, 'Must have recorded 2 retry delays');
  assert.ok(delays[1] >= delays[0], `Second delay (${delays[1]}ms) must be greater than or equal to first (${delays[0]}ms)`);
  assert.ok(Date.now() - t0 >= 100, 'Total elapsed time must reflect backoff sleep');
});

await itAsync('fetchWithRetryBackoff throws immediately on non-transient errors without looping', async () => {
  let attempts = 0;
  const nonTransientOp = async () => {
    attempts++;
    const err = new Error('Bad Request 400');
    err.response = { status: 400 };
    throw err;
  };

  await assert.rejects(
    async () => {
      await fetchWithRetryBackoff(nonTransientOp, { maxRetries: 3, initialDelayMs: 20 });
    },
    /Bad Request 400/
  );
  assert.strictEqual(attempts, 1, 'Must abort on first attempt for non-transient error');
});

// ─── TEST 4: DAILY COMPLETENESS CHECK ─────────────────────────────────────
console.log('\n[TEST 4] Daily Completeness Check (Stored Row Count vs Exchange Count)');

it('Records complete ingestion status (>= 98%) without warnings', () => {
  const testDate = '2026-10-25';
  const rec = recordDailyCompleteness(testDate, {
    source: 'NEPSE_NOTS',
    exchangeReportedCount: 38788,
    storedRowCount: 38788
  });

  assert.strictEqual(rec.status, 'COMPLETE');
  assert.strictEqual(rec.completenessPct, 100);
  assert.strictEqual(rec.warningMessage, null);

  const fromDb = getDailyCompletenessStatus(testDate);
  assert.ok(fromDb, 'Record must exist in daily_ingestion_log table');
  assert.strictEqual(fromDb.status, 'COMPLETE');
  assert.strictEqual(fromDb.stored_row_count, 38788);
  assert.strictEqual(fromDb.exchange_reported_count, 38788);
});

it('Detects completeness discrepancies (< 98%) and stores clear warning message', () => {
  const testDate = '2026-10-26';
  const rec = recordDailyCompleteness(testDate, {
    source: 'NEPSE_NOTS',
    exchangeReportedCount: 38788,
    storedRowCount: 28000 // Missing ~28% of trades
  });

  assert.strictEqual(rec.status, 'PARTIAL_WARNING');
  assert.strictEqual(rec.completenessPct, 72.19);
  assert.ok(rec.warningMessage.includes('Data discrepancy'), 'Must generate a data discrepancy warning');

  const fromDb = getDailyCompletenessStatus(testDate);
  assert.ok(fromDb);
  assert.strictEqual(fromDb.status, 'PARTIAL_WARNING');
  assert.ok(fromDb.warning_message.includes('72.19% completeness'));
});

// ─── TEST 5: RAW FLOORSHEET BACKUP & RESTORATION ──────────────────────────
console.log('\n[TEST 5] Daily Backup / Export of Raw Floorsheet (History Preservation)');

it('Creates a compressed gzip backup of raw floorsheet and restores exact trade payload', () => {
  const testDate = '2026-10-24';
  const sampleTrades = [
    { contractId: 'BK-1', symbol: 'NABIL', buyer: 58, seller: 16, qty: 100, rate: 520, amount: 52000 },
    { contractId: 'BK-2', symbol: 'GBIME', buyer: 45, seller: 34, qty: 300, rate: 210, amount: 63000 },
    { contractId: 'BK-3', symbol: 'RADHI', buyer: 28, seller: 58, qty: 250, rate: 315, amount: 78750 }
  ];

  const backupResult = backupRawFloorsheet(testDate, sampleTrades, { note: 'Reliability test backup' });
  assert.ok(backupResult, 'Backup result must not be null');
  assert.strictEqual(backupResult.success, true);
  assert.strictEqual(backupResult.rowCount, 3);
  assert.ok(fs.existsSync(backupResult.path), `Backup file must exist at ${backupResult.path}`);

  // Restore payload
  const restored = restoreRawFloorsheetBackup(testDate);
  assert.ok(restored, 'Restored object must not be null');
  assert.strictEqual(restored.tradeDate, testDate);
  assert.strictEqual(restored.rowCount, 3);
  assert.deepStrictEqual(restored.trades, sampleTrades, 'Restored trades must strictly match original data');

  // Verify listRawFloorsheetBackups includes our testDate
  const list = listRawFloorsheetBackups();
  const found = list.find(b => b.tradeDate === testDate);
  assert.ok(found, `Backup list must contain entry for ${testDate}`);
  assert.ok(found.sizeBytes > 0, 'Backup size must be positive');
});

// ─── TEST 6: DAILY STOCK PRICE SUMMARY PERSISTENCE ────────────────────────
console.log('\n[TEST 6] Daily Stock Price Persistence into daily_stock_summary');

it('Ingests daily price rows and persists exact OHLCV and volume/turnover', () => {
  const testDate = '2026-10-25';
  const priceRows = [
    { symbol: 'NABIL', open: 515, high: 525, low: 510, ltp: 522, volume: 45000, turnover: 23490000 },
    { symbol: 'SHPC', open: 288, high: 295, low: 285, ltp: 292, volume: 80000, turnover: 23200000 }
  ];

  const ingestedCount = ingestDailyStockPrices(testDate, priceRows);
  assert.strictEqual(ingestedCount, 2, 'Must ingest 2 equity scrips');

  const row = db.prepare(`SELECT * FROM daily_stock_summary WHERE trade_date = ? AND symbol = 'NABIL'`).get(testDate);
  assert.ok(row, 'NABIL summary must exist');
  assert.strictEqual(row.open_price, 515);
  assert.strictEqual(row.high_price, 525);
  assert.strictEqual(row.low_price, 510);
  assert.strictEqual(row.close_price, 522);
  assert.strictEqual(row.total_volume, 45000);
  assert.strictEqual(row.total_turnover, 23490000);
});

console.log('\n======================================================================');
console.log(`RESULTS: ${passedTests} passed, 0 failed out of ${totalTests} assertions.`);
console.log('======================================================================');
console.log('✅ STEP 1 DATA LAYER RELIABILITY VERIFIED CLEANLY!\n');
