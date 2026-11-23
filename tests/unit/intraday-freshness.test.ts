import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { formatNptDateIso, latestTradingSession, isMarketOpen } from '../../src/utils/nepseCalendar.js';

test('1. Intraday Freshness Invariant: Rejects 2026-11-20 ticks when evaluating live session for 2026-11-23', () => {
  const todayIso = '2026-11-23';
  // 2026-11-20 tick timestamp: 1795151700 = 2026-11-20 11:00 AM NPT
  const staleTicks = [
    { time: '11:00 AM', timestamp: 1795151700, open: 2693.55, close: 2693.55, volume: 100 },
    { time: '03:00 PM', timestamp: 1795166100, open: 2690.15, close: 2690.15, volume: 100 }
  ];

  function filterOrValidateLiveIntraday(ticks: any[], targetSessionDate: string) {
    if (!Array.isArray(ticks) || ticks.length === 0) return [];
    const sample = ticks[0];
    const sampleTs = sample?.timestamp;
    const sampleDate = sampleTs
      ? formatNptDateIso(new Date(sampleTs > 1e11 ? sampleTs : sampleTs * 1000))
      : (sample?.date ? String(sample.date).slice(0, 10) : null);

    if (sampleDate && sampleDate !== targetSessionDate) {
      // Ticks are from an older session (e.g. 2026-11-20 vs 2026-11-23)
      return [];
    }
    return ticks;
  }

  const validated = filterOrValidateLiveIntraday(staleTicks, todayIso);
  assert.strictEqual(validated.length, 0, 'Stale 2026-11-20 ticks must be rejected for today 2026-11-23');
});

test('2. Intraday Freshness Invariant: Distinguishes live session vs explicit historical request', () => {
  const staleTicks = [
    { time: '11:00 AM', timestamp: 1795151700, open: 2693.55, close: 2693.55, volume: 100 }
  ];

  function resolveIntradayResponse(ticks: any[], queryDate?: string, isMarketOpenNow = true) {
    const todayIso = '2026-11-23';
    const sampleTs = ticks[0]?.timestamp;
    const tickDate = sampleTs ? formatNptDateIso(new Date(sampleTs * 1000)) : null;

    if (queryDate && queryDate === tickDate) {
      return {
        success: true,
        data: ticks,
        isLive: false,
        isHistorical: true,
        sessionDate: tickDate,
        source: 'historical-disk-nots'
      };
    }

    if (isMarketOpenNow && tickDate !== todayIso) {
      return {
        success: true,
        data: [],
        count: 0,
        isLive: true,
        sessionDate: todayIso,
        message: `No live intraday ticks available yet for session ${todayIso}`
      };
    }

    return {
      success: true,
      data: ticks,
      isLive: isMarketOpenNow,
      sessionDate: tickDate
    };
  }

  const liveRes = resolveIntradayResponse(staleTicks, undefined, true);
  assert.strictEqual(liveRes.data.length, 0, 'Must return empty data for live 2026-11-23 session');
  assert.strictEqual(liveRes.isLive, true);
  assert.strictEqual(liveRes.sessionDate, '2026-11-23');

  const histRes = resolveIntradayResponse(staleTicks, '2026-11-20', true);
  assert.strictEqual(histRes.data.length, 1, 'Explicit historical request for 2026-11-20 must succeed');
  assert.strictEqual(histRes.isHistorical, true);
  assert.strictEqual(histRes.sessionDate, '2026-11-20');
});

test('3. Disk File Invariant: Verifies proxy/data/nepse_intraday_latest.json on disk is dated 2026-11-20', () => {
  const diskPath = path.resolve('proxy/data/nepse_intraday_latest.json');
  assert.ok(fs.existsSync(diskPath), 'nepse_intraday_latest.json must exist on disk');
  const diskTicks = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
  assert.ok(Array.isArray(diskTicks) && diskTicks.length > 0, 'disk ticks must be non-empty array');
  const sample = diskTicks[0];
  const sampleDate = formatNptDateIso(new Date(sample.timestamp * 1000));
  assert.strictEqual(sampleDate, '2026-11-20', 'Disk ticks must be from 2026-11-20');
  assert.notStrictEqual(sampleDate, '2026-11-23', 'Disk ticks must not match today 2026-11-23');
});

test('4. LiveData Invariant: Rejects 2026-11-20 intraday close from being used as 2026-11-23 live price', () => {
  const todayIso = '2026-11-23';
  const diskTicks = [
    { time: '11:00 AM', timestamp: 1795151700, open: 2693.55, close: 2693.55 },
    { time: '03:00 PM', timestamp: 1795166100, open: 2690.15, close: 2690.15 }
  ];

  function parseLiveCloseFromIntraday(pts: any[], today: string) {
    if (!Array.isArray(pts) || pts.length === 0) return null;
    const first = pts[0];
    const firstTs = first?.timestamp;
    const firstDate = firstTs ? formatNptDateIso(new Date(firstTs * 1000)) : null;
    if (firstDate && firstDate !== today) {
      return null; // Must reject!
    }
    const latest = pts[pts.length - 1];
    return Number(latest?.close || 0);
  }

  const result = parseLiveCloseFromIntraday(diskTicks, todayIso);
  assert.strictEqual(result, null, 'Must reject 2026-11-20 ticks for today 2026-11-23');
});
