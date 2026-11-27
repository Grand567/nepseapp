// tests/scheduledTelegramReliability.test.mjs
import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSessionPreSyncedInSqlite,
  getScheduledMarketHourPulseWindow,
  dispatchScheduledMarketHourPulse,
} from '../proxy/workers.mjs';
import {
  hasSwingDispatchedForDate,
  markSwingDispatchedForDate,
} from '../proxy/telegramNotifier.mjs';
import { db } from '../proxy/db/ledgerStore.js';

test('Scheduled Telegram Reliability (Post-3:15 PM EOD & Live Market Hours)', async (t) => {
  await t.test('1. Pre-synced SQLite detection skips redundant heavy EOD file/vault rebuilds on Render', () => {
    assert.equal(isSessionPreSyncedInSqlite(db, '2026-11-27'), true, '2026-11-27 has full prices/ledger/contracts in SQLite and must skip heavy sync');
    assert.equal(isSessionPreSyncedInSqlite(db, '1999-01-01'), false, 'Missing date must require sync');
  });

  await t.test('2. Post-3:15 PM 5-step swing dispatch tracks persistent per-session lock across restarts', () => {
    const swingStatePath = path.resolve('proxy', 'data', 'daily_swing_dispatch_state.json');
    const prevRaw = fs.existsSync(swingStatePath) ? fs.readFileSync(swingStatePath, 'utf8') : null;
    try {
      const testDate = '2099-12-31';
      markSwingDispatchedForDate(testDate, { actionTier: 'CASH_PRESERVATION', symbol: 'NONE' });
      assert.equal(hasSwingDispatchedForDate(testDate), true);
    } finally {
      if (prevRaw !== null) fs.writeFileSync(swingStatePath, prevRaw, 'utf8');
      else if (fs.existsSync(swingStatePath)) fs.unlinkSync(swingStatePath);
    }
  });

  await t.test('3. Market-hour scheduled Telegram pulse fires at 12:00 PM & 2:00 PM NPT on trading days only', () => {
    // Monday 2026-11-30 12:00 PM NPT = 06:15 UTC
    const noonMon = getScheduledMarketHourPulseWindow(new Date('2026-11-30T06:15:00Z'));
    assert.equal(noonMon.active, true);
    assert.equal(noonMon.windowId, '12pm');

    // Monday 2026-11-30 2:00 PM NPT = 08:15 UTC
    const twoPmMon = getScheduledMarketHourPulseWindow(new Date('2026-11-30T08:15:00Z'));
    assert.equal(twoPmMon.active, true);
    assert.equal(twoPmMon.windowId, '2pm');

    // Monday 2026-11-30 1:00 PM NPT = 07:15 UTC (between windows)
    const onePmMon = getScheduledMarketHourPulseWindow(new Date('2026-11-30T07:15:00Z'));
    assert.equal(onePmMon.active, false);

    // Saturday 2026-11-28 12:00 PM NPT = 06:15 UTC (weekend closed)
    const satNoon = getScheduledMarketHourPulseWindow(new Date('2026-11-28T06:15:00Z'));
    assert.equal(satNoon.active, false);
  });

  await t.test('4. dispatchScheduledMarketHourPulse sends once per window and deduplicates repeat calls', async () => {
    const monNoon = new Date('2026-11-30T06:15:00Z'); // Monday 12:00 PM NPT
    const sent = [];
    const first = await dispatchScheduledMarketHourPulse({
      now: monNoon,
      dryRun: true,
      stocks: [
        { symbol: 'MNBBL', ltp: 344, pChange: 1.03, turnover: 15000000 },
        { symbol: 'NABIL', ltp: 520, pChange: -0.5, turnover: 22000000 },
      ],
      indexSnapshot: { nepse: { value: 2635.4, change: 7.23, pChange: 0.28 } },
      trackedHoldings: [{ symbol: 'MNBBL', entryPrice: 343.3, stopLoss: 330, target1: 367 }],
      onSent: (msg) => sent.push(msg),
    });
    assert.equal(first.dispatched, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /NEPSE|MNBBL/i);

    const second = await dispatchScheduledMarketHourPulse({
      now: monNoon,
      dryRun: true,
      stocks: [],
      onSent: (msg) => sent.push(msg),
    });
    assert.equal(second.dispatched, false, 'Same window must not send twice');
    assert.equal(sent.length, 1);
  });
});
