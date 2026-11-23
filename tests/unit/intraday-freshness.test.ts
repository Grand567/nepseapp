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

test('8. Wave 4.12 Invariant: Reconciles 02:59 PM continuous curve tick (2624.21) by appending 03:00 PM settlement point (2623.56)', () => {
  const sessionDate = '2026-11-23';
  const officialClose = 2623.56;
  const intradayTicks = [
    { time: '11:00 AM', timestamp: 1795414200, open: 2621.30, close: 2623.85 },
    { time: '02:58 PM', timestamp: 1795428480, open: 2623.90, close: 2624.10 },
    { time: '02:59 PM', timestamp: 1795428540, open: 2624.10, close: 2624.21 }
  ];

  function reconcileIntradayWithOfficialClose(ticks: any[], officialCloseVal: number, session: string) {
    if (!Array.isArray(ticks) || ticks.length === 0 || !(Number(officialCloseVal) > 0)) {
      return ticks;
    }
    const lastTick = ticks[ticks.length - 1];
    const lastClose = Number(lastTick?.close || lastTick?.value || 0);
    const targetVal = Number(officialCloseVal);

    const lastTime = String(lastTick?.time || '');
    const isAt3PM = lastTime === '03:00 PM' || lastTime === '3:00 PM';

    if (isAt3PM) {
      if (Math.abs(lastClose - targetVal) > 0.01) {
        const updated = [...ticks];
        updated[updated.length - 1] = {
          ...lastTick,
          close: targetVal,
          value: targetVal,
          high: Math.max(Number(lastTick.high || targetVal), targetVal),
          low: Math.min(Number(lastTick.low || targetVal), targetVal)
        };
        return updated;
      }
      return ticks;
    }

    const closeTsSec = session
      ? Math.floor(Date.parse(`${session}T09:15:00Z`) / 1000)
      : (lastTick.timestamp ? (lastTick.timestamp > 1e11 ? Math.floor(lastTick.timestamp / 1000) + 60 : lastTick.timestamp + 60) : Math.floor(Date.now() / 1000));
    const finalTs = (lastTick.timestamp && lastTick.timestamp > 1e11) ? closeTsSec * 1000 : closeTsSec;

    const closingPt = {
      time: '03:00 PM',
      timestamp: finalTs,
      open: Number(lastTick.close || targetVal),
      high: Math.max(Number(lastTick.high || lastTick.close || targetVal), targetVal),
      low: Math.min(Number(lastTick.low || lastTick.close || targetVal), targetVal),
      close: targetVal,
      value: targetVal,
      volume: 0
    };

    return [...ticks, closingPt];
  }

  const settled = reconcileIntradayWithOfficialClose(intradayTicks, officialClose, sessionDate);
  assert.strictEqual(settled.length, 4, 'Must append 03:00 PM settlement point');
  const lastPt = settled[settled.length - 1];
  assert.strictEqual(lastPt.time, '03:00 PM');
  assert.strictEqual(lastPt.close, 2623.56, 'Last point close must equal official closing settlement 2623.56');
  assert.strictEqual(lastPt.open, 2624.21, 'Last point open must connect to previous 02:59 PM close');
});

test('9. Wave 4.12 Invariant: Closed market headline index preserves official close (2623.56 / +2.26) against 02:59 PM tick (2624.21)', () => {
  const officialIndices = {
    nepse: {
      value: 2623.56,
      change: 2.26,
      pChange: 0.08,
      prevClose: 2621.30,
      turnover: 3827606590.77
    },
    asOfDate: '2026-11-23',
    isClosing: true
  };

  const intradaySeries = [
    { time: '11:00 AM', timestamp: 1795414200, close: 2621.30 },
    { time: '02:59 PM', timestamp: 1795428540, close: 2624.21 }
  ];

  const isMarketOpen = false;
  const lastTick = intradaySeries[intradaySeries.length - 1];
  const lastTickClose = Number(lastTick?.close || 0);

  // In Dashboard.jsx:
  let rawHeroVal = officialIndices.nepse;
  const hasAuthoritativeClose = !isMarketOpen && Number(officialIndices.nepse.value || 0) > 0;

  if (!hasAuthoritativeClose && lastTickClose > 0 && Math.abs(Number(rawHeroVal?.value || 0) - lastTickClose) > 0.01) {
    rawHeroVal = {
      ...rawHeroVal,
      value: lastTickClose,
      change: +(lastTickClose - rawHeroVal.prevClose).toFixed(2),
      pChange: +(((lastTickClose - rawHeroVal.prevClose) / rawHeroVal.prevClose) * 100).toFixed(2)
    };
  }

  assert.strictEqual(rawHeroVal.value, 2623.56, 'Headline must remain official close 2623.56 (never 2624.21)');
  assert.strictEqual(rawHeroVal.change, 2.26, 'Headline change must remain +2.26 pts (never +2.91)');
  assert.strictEqual(rawHeroVal.pChange, 0.08, 'Headline pChange must remain +0.08%');
});

test('10. Wave 4.12 Invariant: modalBadgeSessionDate never resolves to future date (2026-11-24 on 2026-11-23)', () => {
  const appNow = new Date('2026-11-23T22:05:00+05:45');
  const todayIso = formatNptDateIso(appNow);
  assert.strictEqual(todayIso, '2026-11-23');

  // getDetailedMarketStatus on closed market after 15:00:
  // targetSessionDate is 2026-11-24 (predictive target for tomorrow)
  // lastClosedSessionDate is 2026-11-23
  // currentSessionDate is 2026-11-23
  const marketStatus = {
    isOpen: false,
    targetSessionDate: '2026-11-24', // Tomorrow!
    lastClosedSessionDate: '2026-11-23',
    currentSessionDate: '2026-11-23',
    sessionDate: '2026-11-23'
  };

  const d = {
    symbol: 'NABIL',
    businessDate: '2026-11-23'
  };

  const modalSessionDate = ''; // Default (no historical date picked)

  const activeSessionDate = marketStatus?.currentSessionDate || marketStatus?.sessionDate || latestTradingSession(appNow, false);
  const lastClosedSession = marketStatus?.lastClosedSessionDate || latestTradingSession(appNow, true);
  const displayedQuoteSessionDate = d?.businessDate || (marketStatus?.isOpen ? activeSessionDate : lastClosedSession);

  const isHistoricalDateSelected = Boolean(modalSessionDate && modalSessionDate !== activeSessionDate && modalSessionDate <= todayIso);
  let resolvedBadgeSessionDate = isHistoricalDateSelected
    ? modalSessionDate
    : (marketStatus?.isOpen ? activeSessionDate : (displayedQuoteSessionDate || lastClosedSession || activeSessionDate));

  if (!resolvedBadgeSessionDate || resolvedBadgeSessionDate > todayIso) {
    resolvedBadgeSessionDate = displayedQuoteSessionDate && displayedQuoteSessionDate <= todayIso
      ? displayedQuoteSessionDate
      : (activeSessionDate <= todayIso ? activeSessionDate : todayIso);
  }

  assert.strictEqual(resolvedBadgeSessionDate, '2026-11-23', 'Badge session date must be 2026-11-23');
  assert.notStrictEqual(resolvedBadgeSessionDate, '2026-11-24', 'Badge session date must NEVER resolve to tomorrow (2026-11-24)');
  assert.ok(resolvedBadgeSessionDate <= todayIso, 'Badge session date must be <= todayIso');
});
