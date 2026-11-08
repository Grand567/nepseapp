// tests/last5DaysBrokerAnalysisAndSubfiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { getSymbolHistoryFromDb } from '../proxy/db/ledgerStore.js';
import { calculateMultiDayDiagnostics } from '../src/utils/microstructureEngine.js';
import {
  compileHistoricalSubfiles,
  readHistoricalSubfile,
  readHistoricalSubfilesIndex,
  SUBFILES_DIR
} from '../proxy/utils/historicalSubfilesEngine.mjs';

test('AKJCL Last 5 Trading Days & 5-Day Sub-Files Verification', async (t) => {
  const sym = 'AKJCL';
  const fullHistory = getSymbolHistoryFromDb(sym, 40);

  await t.test('1. AKJCL 5 Trading Sessions Invariant in SQLite Ledger', () => {
    assert.ok(fullHistory.length >= 5, `Must have at least 5 sessions for ${sym}`);
    const last5 = fullHistory.slice(0, 5);
    const expectedDates = ['2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02'];
    const actualDates = last5.map(d => d.date);
    assert.deepEqual(actualDates, expectedDates, 'The last 5 trading days must match exactly');

    // Tally Day 1: 2026-11-06
    const d1 = last5[0];
    assert.equal(d1.totalVolume, 153871, 'Day 1 volume must be 153,871');
    assert.equal(Math.round(d1.totalTurnover), 52862810, 'Day 1 turnover must be ~52.86M');
    assert.equal(d1.closePrice, 343.9, 'Day 1 close must be 343.9');

    // Tally Day 2: 2026-11-05
    const d2 = last5[1];
    assert.equal(d2.totalVolume, 525247, 'Day 2 volume must be 525,247');
    assert.equal(Math.round(d2.totalTurnover), 181929604, 'Day 2 turnover must be ~181.93M');
    assert.equal(d2.closePrice, 346, 'Day 2 close must be 346.0');

    // Tally Day 3: 2026-11-04
    const d3 = last5[2];
    assert.equal(d3.totalVolume, 192751, 'Day 3 volume must be 192,751');
    assert.equal(d3.closePrice, 338, 'Day 3 close must be 338.0');

    // Tally Day 4: 2026-11-03
    const d4 = last5[3];
    assert.equal(d4.totalVolume, 190329, 'Day 4 volume must be 190,329');
    assert.equal(d4.closePrice, 341.9, 'Day 4 close must be 341.9');

    // Tally Day 5: 2026-11-02
    const d5 = last5[4];
    assert.equal(d5.totalVolume, 216585, 'Day 5 volume must be 216,585');
    assert.equal(d5.closePrice, 343, 'Day 5 close must be 343.0');
  });

  await t.test('2. AKJCL 5-Day Cumulative Broker Diagnostics & VWAP Verification', () => {
    const diag5 = calculateMultiDayDiagnostics(fullHistory, 5);
    assert.ok(diag5, '5-day diagnostics must compute cleanly');
    assert.equal(diag5.timeframeDays, 5, 'Must encompass exactly 5 sessions');
    assert.equal(diag5.fromDate, '2026-11-02');
    assert.equal(diag5.toDate, '2026-11-06');

    // 5-Day Total Volume & Market VWAP
    const expected5dVol = 153871 + 525247 + 192751 + 190329 + 216585;
    assert.equal(diag5.totalVolume, expected5dVol, '5D total volume must equal sum of 5 sessions (1,278,783)');
    assert.equal(diag5.marketVWAP, 343.09, '5D market VWAP must be exactly Rs. 343.09');
    assert.equal(diag5.bigBrokerVWAP, 344.42, '5D Whale Buy VWAP must be Rs. 344.42');

    // Lead 5D Accumulator: Broker #58 (Naasa)
    assert.equal(diag5.leadAccumulator.brokerId, '58');
    assert.equal(diag5.leadAccumulator.buyVol, 129814);
    assert.equal(diag5.leadAccumulator.netQty, 55438, '5D net retained shares for Broker #58 must be 55,438 (129,814 bought - 74,376 sold)');
    assert.equal(diag5.leadAccumulator.avgBuyPrice, 344.16);

    // Lead 5D Distributor: Broker #40 (Creative)
    assert.equal(diag5.leadDistributor.brokerId, '40');
    assert.equal(diag5.leadDistributor.sellVol, 86325);
    assert.equal(diag5.leadDistributor.netQty, -84235, '5D net sold shares for Broker #40 must be -84,235 (2,090 bought - 86,325 sold)');
    assert.equal(diag5.leadDistributor.avgSellPrice, 344.33);
  });

  await t.test('3. AKJCL Single-Session Diagnostics & Accurate Date Mapping for All 5 Days', () => {
    const expectedBreakdown = [
      { date: '2026-11-06', vwap: 343.55, accId: '62', accAvgBuy: 343.5, distId: '60', distAvgSell: 342.71 },
      { date: '2026-11-05', vwap: 346.37, accId: '58', accAvgBuy: 345.66, distId: '40', distAvgSell: 346.2 },
      { date: '2026-11-04', vwap: 337.09, accId: '91', accAvgBuy: 340, distId: '101', distAvgSell: 337.72 },
      { date: '2026-11-03', vwap: 340.28, accId: '49', accAvgBuy: 340.07, distId: '64', distAvgSell: 340.89 },
      { date: '2026-11-02', vwap: 342.61, accId: '32', accAvgBuy: 343.8, distId: '40', distAvgSell: 340.68 },
    ];

    for (const exp of expectedBreakdown) {
      const filtered = fullHistory.filter(d => d.date <= exp.date).slice(0, 1);
      const diag1 = calculateMultiDayDiagnostics(filtered, 1);
      assert.equal(diag1.toDate, exp.date, `Session date must be ${exp.date}`);
      assert.equal(diag1.marketVWAP, exp.vwap, `Market VWAP on ${exp.date} must be ${exp.vwap}`);
      assert.equal(diag1.leadAccumulator.brokerId, exp.accId, `Lead accumulator on ${exp.date} must be #${exp.accId}`);
      assert.equal(diag1.leadAccumulator.avgBuyPrice, exp.accAvgBuy, `Avg buy rate on ${exp.date} must be ${exp.accAvgBuy}`);
      assert.equal(diag1.leadDistributor.brokerId, exp.distId, `Lead distributor on ${exp.date} must be #${exp.distId}`);
      assert.equal(diag1.leadDistributor.avgSellPrice, exp.distAvgSell, `Avg sell rate on ${exp.date} must be ${exp.distAvgSell}`);
    }
  });

  await t.test('4. 5-Day Historical Sub-Files Engine & Manifest Generation', () => {
    // Compile subfiles with 5 sessions
    const manifest = compileHistoricalSubfiles({ maxDays: 5 });
    assert.ok(manifest, 'Manifest must compile');
    assert.ok(manifest.available_sessions.length >= 5, 'Must contain at least 5 available sessions');
    assert.ok(manifest.subfiles.length >= 5, 'Must contain at least 5 subfiles');

    // Verify day 1 through day 5 exist on disk
    for (let d = 1; d <= 5; d++) {
      const subfile = readHistoricalSubfile(d);
      assert.ok(subfile, `Sub-file ${d} must be readable`);
      assert.equal(subfile.day_offset, d);
      assert.ok(subfile.scrips && subfile.scrips['AKJCL'], `AKJCL must be present in sub-file ${d}`);
      const ak = subfile.scrips['AKJCL'];
      assert.ok(ak.card_1_quote.vwap > 0, `Sub-file ${d} AKJCL quote must have positive VWAP`);
      assert.ok(ak.card_4_broker_smart_flow, `Sub-file ${d} AKJCL must have broker smart flow`);
    }

    // Verify public/data bundle directory has synced copies
    const publicDataDir = path.join(process.cwd(), 'public', 'data');
    assert.ok(fs.existsSync(publicDataDir), 'public/data must exist');
    assert.ok(fs.existsSync(path.join(publicDataDir, 'today_static_analytics.json')), 'today_static_analytics.json must be in public/data');
    assert.ok(fs.existsSync(path.join(publicDataDir, 'subfiles', 'historical_subfiles_index.json')), 'historical_subfiles_index.json must be in public/data/subfiles');
    assert.ok(fs.existsSync(path.join(publicDataDir, 'subfiles', 'historical_day_1.json')), 'historical_day_1.json must be in public/data/subfiles');
    assert.ok(fs.existsSync(path.join(publicDataDir, 'subfiles', 'historical_day_5.json')), 'historical_day_5.json must be in public/data/subfiles');
  });
});
