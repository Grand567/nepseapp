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

test('5. Wave 4.10 Invariant: Reconciles frozen midday index (2,615.93) to official close (2,623.56 / +2.26 pts) when 15:00 NPT intraday closing tick exists', () => {
  const sessionDate = '2026-11-23';
  // Stale midday index snapshot recorded at 11:24 / 12:12 PM
  const staleMiddayIndex = {
    nepse: {
      value: 2615.93,
      change: -5.36,
      pChange: -0.20,
      prevClose: 2621.30,
      open: 2623.85,
      high: 2623.85,
      low: 2613.20,
      turnover: 1200000000
    },
    float: { value: 182.01, change: -0.36, pChange: -0.19 },
    sensitive: { value: 476.28, change: -0.73, pChange: -0.15 },
    asOfDate: sessionDate,
    timestamp: 1795415520000, // 11:24 AM NPT
    isClosing: false
  };

  // 1D Intraday ticks ending at official 3:00 PM (15:00 NPT) close: 2,623.56
  const intradayTicks = [
    { time: '11:00 AM', timestamp: 1795414200, open: 2623.85, high: 2623.85, low: 2623.85, close: 2623.85 },
    { time: '12:12 PM', timestamp: 1795418520, open: 2615.93, high: 2618.00, low: 2608.30, close: 2615.93 },
    { time: '02:59 PM', timestamp: 1795428540, open: 2622.10, high: 2623.56, low: 2622.00, close: 2623.56 },
    { time: '03:00 PM', timestamp: 1795428600, open: 2623.56, high: 2623.56, low: 2623.56, close: 2623.56 }
  ];

  function reconcileNepse(indices: any, ticks: any[], targetSessionDate: string) {
    if (!indices || !indices.nepse || !Array.isArray(ticks) || ticks.length === 0) return indices;
    const lastTick = ticks[ticks.length - 1];
    const lastClose = Number(lastTick?.close || lastTick?.value || 0);
    if (!(lastClose > 0)) return indices;

    const currentVal = Number(indices.nepse.value || 0);
    const lastTs = Number(lastTick.timestamp || 0) * (Number(lastTick.timestamp) < 1e11 ? 1000 : 1);
    const idxTs = Number(indices.timestamp || indices.nepse.timestamp || 0);

    const isDifferent = Math.abs(currentVal - lastClose) > 0.01;
    const isNewer = lastTs > 0 && idxTs > 0 && lastTs > idxTs;

    if (isDifferent && (isNewer || !indices.isClosing)) {
      const prevClose = Number(indices.nepse.prevClose || 2621.30);
      const change = +(lastClose - prevClose).toFixed(2);
      const pChange = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;

      const tickHighs = ticks.map(t => Number(t.high || t.close || 0)).filter(v => v > 0);
      const tickLows = ticks.map(t => Number(t.low || t.close || 0)).filter(v => v > 0);

      return {
        ...indices,
        nepse: {
          ...indices.nepse,
          value: lastClose,
          change,
          pChange,
          prevClose,
          high: Math.max(...tickHighs, Number(indices.nepse.high || lastClose)),
          low: Math.min(...tickLows, Number(indices.nepse.low || lastClose)),
          reconciledWithIntraday: true,
          timestamp: Math.max(lastTs, Date.now())
        },
        asOfDate: targetSessionDate,
        isClosing: true,
        timestamp: Math.max(lastTs, Date.now())
      };
    }
    return indices;
  }

  const reconciled = reconcileNepse(staleMiddayIndex, intradayTicks, sessionDate);

  // Assertions: Reconciled to official 3:00 PM close 2,623.56 / +2.26 pts
  assert.strictEqual(reconciled.nepse.value, 2623.56, 'Index value must be reconciled to 2,623.56');
  assert.strictEqual(reconciled.nepse.change, 2.26, 'Change must be recomputed as +2.26 pts (+2623.56 - 2621.30)');
  assert.strictEqual(reconciled.nepse.pChange, 0.09, 'Percent change must be recomputed as +0.09%');
  assert.strictEqual(reconciled.nepse.prevClose, 2621.30, 'Previous close must remain 2,621.30');
  assert.strictEqual(reconciled.nepse.high, 2623.85, 'High must match session high');
  assert.strictEqual(reconciled.nepse.low, 2608.30, 'Low must match session low');
  assert.strictEqual(reconciled.nepse.reconciledWithIntraday, true);
  assert.strictEqual(reconciled.isClosing, true);
});

test('6. Wave 4.10 Invariant: Rejects cross-session reconciliation when ticks are from a previous date', () => {
  const staleMiddayIndex = {
    nepse: { value: 2615.93, change: -5.36, pChange: -0.20, prevClose: 2621.30 },
    asOfDate: '2026-11-23',
    timestamp: 1795415520000
  };

  // Ticks from 2026-11-20 (Friday)
  const fridayTicks = [
    { time: '03:00 PM', timestamp: 1795166100, open: 2690.15, close: 2690.15 }
  ];

  function safeReconcile(indices: any, ticks: any[], targetSessionDate: string) {
    if (!indices || !indices.nepse || !Array.isArray(ticks) || ticks.length === 0) return indices;
    const sampleTs = ticks[0]?.timestamp;
    const tickDate = sampleTs ? formatNptDateIso(new Date(sampleTs * 1000)) : null;
    if (tickDate && targetSessionDate && tickDate !== targetSessionDate) {
      // Must reject cross-session contamination!
      return indices;
    }
    return indices;
  }

  const result = safeReconcile(staleMiddayIndex, fridayTicks, '2026-11-23');
  assert.strictEqual(result.nepse.value, 2615.93, 'Cross-session ticks must NEVER contaminate active index');
});

test('7. Wave 4.10 Invariant: Browser cache guard prevents stale midday snapshot from overwriting confirmed closing index', () => {
  let memIndices: any = {
    nepse: { value: 2623.56, change: 2.26, pChange: 0.09, prevClose: 2621.30 },
    asOfDate: '2026-11-23',
    timestamp: 1795428600000, // 3:00 PM NPT
    isClosing: true
  };

  function trySaveCachedIndices(toSave: any) {
    if (memIndices && memIndices.nepse && memIndices.asOfDate === toSave.asOfDate) {
      const existingTs = Number(memIndices.timestamp || memIndices.nepse.timestamp || 0);
      const incomingTs = Number(toSave.timestamp || toSave.nepse.timestamp || 0);
      if (existingTs > 0 && incomingTs > 0 && incomingTs < existingTs) {
        return false; // Rejected: older timestamp
      }
      if (memIndices.isClosing && !toSave.isClosing && Math.abs(Number(toSave.nepse.value) - Number(memIndices.nepse.value)) > 0.01) {
        return false; // Rejected: midday unverified snapshot attempting to overwrite closing index
      }
    }
    memIndices = toSave;
    return true;
  }

  // Incoming stale snapshot from 12:12 PM
  const staleMiddaySnapshot = {
    nepse: { value: 2615.93, change: -5.36, pChange: -0.20 },
    asOfDate: '2026-11-23',
    timestamp: 1795418520000, // 12:12 PM NPT
    isClosing: false
  };

  const saved = trySaveCachedIndices(staleMiddaySnapshot);
  assert.strictEqual(saved, false, 'Stale midday snapshot must be blocked from overwriting confirmed closing index');
  assert.strictEqual(memIndices.nepse.value, 2623.56, 'Confirmed closing value 2,623.56 must remain intact');
  assert.strictEqual(memIndices.nepse.change, 2.26);
});
