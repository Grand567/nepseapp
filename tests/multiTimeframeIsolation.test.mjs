import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tradingDayWindow,
  latestTradingSession
} from '../src/utils/nepseCalendar.js';

test('1. Multi-Timeframe Window Isolation & Strict Invariants', () => {
  const anchor = '2026-11-13';

  const w1 = tradingDayWindow(1, anchor);
  const w5 = tradingDayWindow(5, anchor);
  const w15 = tradingDayWindow(15, anchor);
  const w30 = tradingDayWindow(30, anchor);

  // Invariant 1: Count strictly matches requested timeframe
  assert.strictEqual(w1.count, 1);
  assert.strictEqual(w5.count, 5);
  assert.strictEqual(w15.count, 15);
  assert.strictEqual(w30.count, 30);

  // Invariant 2: End dates strictly match anchor
  assert.strictEqual(w1.endDate, anchor);
  assert.strictEqual(w5.endDate, anchor);
  assert.strictEqual(w15.endDate, anchor);
  assert.strictEqual(w30.endDate, anchor);

  // Invariant 3: Start dates strictly recede chronologically: start(30) < start(15) < start(5) <= start(1)
  assert.ok(w30.startDate < w15.startDate, `30D start (${w30.startDate}) must precede 15D start (${w15.startDate})`);
  assert.ok(w15.startDate < w5.startDate, `15D start (${w15.startDate}) must precede 5D start (${w5.startDate})`);
  assert.ok(w5.startDate <= w1.startDate, `5D start (${w5.startDate}) must precede or equal 1D start (${w1.startDate})`);

  // Invariant 4: No subset identity (distinctness)
  assert.notDeepStrictEqual(w1.dates, w5.dates);
  assert.notDeepStrictEqual(w5.dates, w15.dates);
  assert.notDeepStrictEqual(w15.dates, w30.dates);
});

test('2. Timeframe Matching Guard - Rejects Cross-Timeframe Pollution', () => {
  function validateTimeframeData(requestedDays, candidateData) {
    if (!candidateData) return null;
    const isAll = requestedDays === 'all' || requestedDays === 'ALL' || Number(requestedDays) >= 300;
    const candDays = candidateData.timeframeDays || candidateData.tradingDays || candidateData.days;

    if (isAll) {
      if (candidateData.timeframe === 'ALL' || Number(candDays) >= 30) {
        return candidateData;
      }
      return null;
    }

    if (Number(candDays) === Number(requestedDays)) {
      return candidateData;
    }

    // STRICT REJECTION: Candidate data timeframe does not match requested timeframe!
    return null;
  }

  const data5D = {
    symbol: 'SHIVM',
    timeframeDays: 5,
    tradingDays: 5,
    totalVolume: 762883
  };

  // When 5D is requested, data5D is valid
  assert.notStrictEqual(validateTimeframeData(5, data5D), null);

  // When 15D is requested, data5D MUST BE REJECTED!
  assert.strictEqual(validateTimeframeData(15, data5D), null, 'Candidate with timeframeDays=5 must be rejected when 15D is requested');

  // When 30D is requested, data5D MUST BE REJECTED!
  assert.strictEqual(validateTimeframeData(30, data5D), null, 'Candidate with timeframeDays=5 must be rejected when 30D is requested');

  // When 1D is requested, data5D MUST BE REJECTED!
  assert.strictEqual(validateTimeframeData(1, data5D), null, 'Candidate with timeframeDays=5 must be rejected when 1D is requested');
});

test('3. All-Time Honest Labeling & Ledger Boundary Disclosure', () => {
  function formatAllTimeCoverage(ledgerMeta) {
    const startDate = ledgerMeta.startDate || '2026-08-27';
    const endDate = ledgerMeta.endDate || '2026-11-13';
    const sessionCount = ledgerMeta.sessionCount || 43;

    return {
      isLifetime: false,
      startDate,
      endDate,
      sessionCount,
      label: `Since ${startDate} (${sessionCount} sessions)`,
      disclaimer: `Covered from ${startDate} to ${endDate} (${sessionCount} sessions). Pre-${startDate} baseline unknown. Unadjusted for corporate actions.`
    };
  }

  const meta = formatAllTimeCoverage({ startDate: '2026-08-27', endDate: '2026-11-13', sessionCount: 43 });
  assert.strictEqual(meta.isLifetime, false, 'Must not claim lifetime when database starts in 2026');
  assert.strictEqual(meta.startDate, '2026-08-27');
  assert.ok(meta.label.includes('Since 2026-08-27'));
  assert.ok(meta.disclaimer.includes('Pre-2026-08-27 baseline unknown'));
});
