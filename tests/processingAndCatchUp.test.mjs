import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tradingDayWindow,
  latestTradingSession,
  isNepseTradingDay
} from '../src/utils/nepseCalendar.js';

test('1. Startup Catch-Up Engine - Missed Session Gap Detection', () => {
  function detectMissedTradingSessions(storedDatesList, referenceDate = new Date()) {
    const latestSettled = latestTradingSession(referenceDate, true);
    const storedSet = new Set(storedDatesList);

    // Retrieve expected trading days up to latestSettled
    const expectedWindow = tradingDayWindow(5, latestSettled).dates;
    const missed = [];

    for (const expDate of expectedWindow) {
      if (!storedSet.has(expDate)) {
        missed.push(expDate);
      }
    }

    return {
      latestSettled,
      isUpToDate: missed.length === 0,
      missedSessions: missed
    };
  }

  // Case A: Ledger is fully up to date with 2026-11-13
  const currentLedgerDates = ['2026-11-13', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'];
  const statusA = detectMissedTradingSessions(currentLedgerDates, new Date('2026-11-14T12:00:00+05:45'));
  assert.strictEqual(statusA.isUpToDate, true);
  assert.deepStrictEqual(statusA.missedSessions, []);

  // Case B: Server slept through Friday Nov 13 session (last saved date was Nov 06)
  const staleLedgerDates = ['2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'];
  const statusB = detectMissedTradingSessions(staleLedgerDates, new Date('2026-11-14T12:00:00+05:45'));
  assert.strictEqual(statusB.isUpToDate, false);
  assert.ok(statusB.missedSessions.includes('2026-11-13'), 'Must detect 2026-11-13 as missed session requiring catch-up');
});

test('2. Cornering Aggregation Resiliency with Left Join Fallback', () => {
  // Simulates Broker Cornering query computation with LEFT JOIN
  function calculateCorneringConcentration(brokerRow, summaryRow) {
    const buyVol = Number(brokerRow.buyVol || 0);
    // If summaryRow is not yet created for today's partial session, fallback to broker market volume
    const totalMarketVol = Number(summaryRow?.totalVolume || brokerRow.estimatedMarketVol || buyVol);
    const concentrationPct = totalMarketVol > 0 ? +((buyVol / totalMarketVol) * 100).toFixed(2) : 0;
    return {
      symbol: brokerRow.symbol,
      brokerId: brokerRow.brokerId,
      buyVol,
      totalVol: totalMarketVol,
      concentrationPct,
      isCornered: concentrationPct >= 25.0
    };
  }

  // When summaryRow is null (not yet created for active day)
  const brokerRow = { symbol: 'SHIVM', brokerId: '58', buyVol: 35000, estimatedMarketVol: 85000 };
  const resWithoutSummary = calculateCorneringConcentration(brokerRow, null);
  assert.strictEqual(resWithoutSummary.buyVol, 35000);
  assert.strictEqual(resWithoutSummary.totalVol, 85000);
  assert.strictEqual(resWithoutSummary.concentrationPct, 41.18);
  assert.strictEqual(resWithoutSummary.isCornered, true);
});

test('3. Partial vs Final Session Idempotent Replacement', () => {
  function reconcileSessionRecord(existingRecord, incomingRecord, isFinalEod = false) {
    if (!existingRecord) {
      return {
        ...incomingRecord,
        calendar_status: isFinalEod ? 'FINAL_SESSION' : 'PARTIAL_SESSION'
      };
    }

    // Final EOD bhavpasal replaces partial session data completely
    if (isFinalEod) {
      return {
        ...incomingRecord,
        calendar_status: 'FINAL_SESSION',
        isReconciled: true
      };
    }

    // If existing record is already FINAL_SESSION, do NOT allow stale partial tick to overwrite it!
    if (existingRecord.calendar_status === 'FINAL_SESSION') {
      return existingRecord;
    }

    // Otherwise update partial metrics
    return {
      ...incomingRecord,
      calendar_status: 'PARTIAL_SESSION'
    };
  }

  const partialRecord = { symbol: 'SHIVM', date: '2026-11-17', ltp: 685, volume: 35000 };
  const step1 = reconcileSessionRecord(null, partialRecord, false);
  assert.strictEqual(step1.calendar_status, 'PARTIAL_SESSION');
  assert.strictEqual(step1.volume, 35000);

  const finalRecord = { symbol: 'SHIVM', date: '2026-11-17', ltp: 694, volume: 151200 };
  const step2 = reconcileSessionRecord(step1, finalRecord, true);
  assert.strictEqual(step2.calendar_status, 'FINAL_SESSION');
  assert.strictEqual(step2.volume, 151200);

  // Stale partial tick arriving after EOD final is ignored
  const staleLateTick = { symbol: 'SHIVM', date: '2026-11-17', ltp: 680, volume: 20000 };
  const step3 = reconcileSessionRecord(step2, staleLateTick, false);
  assert.strictEqual(step3.calendar_status, 'FINAL_SESSION');
  assert.strictEqual(step3.volume, 151200, 'Stale partial tick must not overwrite finalized EOD volume');
});
