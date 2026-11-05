// tests/historicalSubfiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  compileHistoricalSubfiles,
  readHistoricalSubfile,
  readHistoricalSubfilesIndex,
  getScrip4DayTrajectory,
  SUBFILES_DIR
} from '../proxy/utils/historicalSubfilesEngine.mjs';

test('Historical 4-Day Sub-Files Engine Verification', async (t) => {
  await t.test('1. Sub-Files Compilation and File Artifacts', () => {
    const manifest = readHistoricalSubfilesIndex();
    assert.ok(manifest, 'Manifest must exist');
    assert.equal(manifest.file_type, 'HISTORICAL_SUBFILES_INDEX');
    assert.equal(manifest.total_subfiles, 4, 'Must contain exactly 4 subfiles');
    assert.equal(manifest.available_sessions.length, 4, 'Must have 4 available session dates');

    // Verify all 4 JSON and GZ files exist on disk
    for (let day = 1; day <= 4; day++) {
      const jsonFile = path.join(SUBFILES_DIR, `historical_day_${day}.json`);
      const gzFile = path.join(SUBFILES_DIR, `historical_day_${day}.json.gz`);

      assert.ok(fs.existsSync(jsonFile), `historical_day_${day}.json must exist`);
      assert.ok(fs.existsSync(gzFile), `historical_day_${day}.json.gz must exist`);

      // Verify gzip decompression matches raw JSON
      const raw = fs.readFileSync(jsonFile, 'utf8');
      const gzipped = fs.readFileSync(gzFile);
      const unzipped = zlib.gunzipSync(gzipped).toString('utf8');
      assert.equal(raw, unzipped, `Gzip content must match raw json for day ${day}`);

      // Verify gzip compression efficiency (< 250 KB)
      const gzKb = gzipped.length / 1024;
      assert.ok(gzKb < 250, `Sub-file ${day} gzipped size must be under 250 KB (actual: ${gzKb.toFixed(1)} KB)`);
    }
  });

  await t.test('2. Calendar & Weekend / Holiday Skipping Integrity', () => {
    const manifest = readHistoricalSubfilesIndex();
    const sessions = manifest.available_sessions;
    
    // In our verified database:
    // Session 1: 2026-11-04 (Wed)
    // Session 2: 2026-11-03 (Tue)
    // Session 3: 2026-11-02 (Mon)
    // Session 4: 2026-10-30 (Fri)
    assert.equal(sessions[0], '2026-11-04');
    assert.equal(sessions[1], '2026-11-03');
    assert.equal(sessions[2], '2026-11-02');
    assert.equal(sessions[3], '2026-10-30');

    // Crucial check: 2026-10-31 (Sat) and 2026-11-01 (Sun) weekend MUST be skipped cleanly!
    assert.ok(!sessions.includes('2026-10-31'), 'Weekend Saturday must not be in trading sessions');
    assert.ok(!sessions.includes('2026-11-01'), 'Weekend Sunday must not be in trading sessions');
  });

  await t.test('3. Card-Level Data & Precomputed Interpretations (BARUN Benchmark)', () => {
    const subfile1 = readHistoricalSubfile(1);
    assert.ok(subfile1, 'Subfile 1 must be readable');
    assert.equal(subfile1.day_offset, 1);
    assert.equal(subfile1.session_date, '2026-11-04');

    const barun = subfile1.scrips.BARUN;
    assert.ok(barun, 'BARUN must exist in Subfile 1');

    // Card 1: Quote & Price Action
    assert.ok(barun.card_1_quote.ltp > 0, 'LTP must be positive');
    assert.ok(barun.card_1_quote.vwap > 0, 'VWAP must be positive');
    assert.ok(barun.card_1_quote.interpretation.includes('BARUN closed at Rs.'), 'Quote interpretation must be populated');

    // Card 2: Pivot Points (Classic & Camarilla)
    const pivots = barun.card_2_pivot_points;
    assert.ok(pivots.classic.pp > 0, 'Classic Pivot must be positive');
    assert.ok(pivots.classic.r1 > pivots.classic.pp, 'R1 must exceed Pivot');
    assert.ok(pivots.classic.s1 < pivots.classic.pp, 'S1 must be below Pivot');
    assert.ok(pivots.camarilla.h4 > pivots.camarilla.l4, 'Camarilla H4 must exceed L4');
    assert.ok(pivots.interpretation.includes('Floor Pivot sits at Rs.'), 'Pivot interpretation must be populated');

    // Card 3: Oscillators & Risk
    const osc = barun.card_3_oscillators_risk;
    assert.ok(osc.atr_14 > 0, 'ATR(14) must be positive');
    assert.ok(osc.rsi_14 >= 0 && osc.rsi_14 <= 100, 'RSI must be between 0 and 100');
    assert.ok(osc.min_stop_loss_distance > 0, 'Stop loss distance must be positive');
    assert.ok(osc.interpretation.includes('Daily ATR is Rs.'), 'Oscillator interpretation must be populated');

    // Card 4: Broker Smart Money Flow
    const flow = barun.card_4_broker_smart_flow;
    assert.ok(flow.lead_accumulator.broker_id > 0, 'Lead broker ID must exist');
    assert.ok(flow.lead_accumulator.net_kitta > 0, 'Lead broker net kitta must be positive');
    assert.ok(flow.concentration.bcr3_buy_pct >= 0, 'BCR3 must be positive');
    assert.ok(flow.top_5_buyers.length > 0, 'Top 5 buyers must be populated');
    assert.ok(flow.interpretation.includes('Broker #'), 'Flow interpretation must identify lead broker');

    // Card 5: Wyckoff & Dump Guard
    const wyckoff = barun.card_5_wyckoff_and_dump_guard;
    assert.ok(['STEALTH_ACCUMULATION', 'MARKUP_BREAKOUT', 'DISTRIBUTION_TRAP', 'BALANCED_FLOW'].includes(wyckoff.wyckoff_phase));
    assert.ok(['PASS', 'CLEAN_ACCUMULATION', 'PAST_ACCUMULATOR_DEMAT_DUMP', 'OPERATOR_CHURN'].includes(wyckoff.dump_guard_status));
    assert.ok(wyckoff.interpretation.includes('Wyckoff Phase:'), 'Wyckoff interpretation must be populated');

    // Card 6: Tactical Execution Levels
    const tac = barun.card_6_tactical_execution;
    assert.ok(tac.limit_buy_min < tac.limit_buy_max, 'Buy Zone min must be below max');
    assert.ok(tac.hard_stop < tac.limit_buy_min, 'Stop loss must be below Buy Zone min');
    assert.ok(tac.target_1 > tac.limit_buy_max, 'Target 1 must exceed Buy Zone max');
    assert.ok(tac.target_2 > tac.target_1, 'Target 2 must exceed Target 1');
    assert.ok(tac.interpretation.includes('Calibrated Entry Buy Zone:'), 'Tactical interpretation must be populated');
  });

  await t.test('4. Service Hub Precomputed Leaderboards', () => {
    const subfile1 = readHistoricalSubfile(1);
    const hub = subfile1.service_hub_precomputed;

    assert.ok(hub.top_gainers.length > 0, 'Top gainers must have records');
    assert.ok(hub.top_losers.length > 0, 'Top losers must have records');
    assert.ok(hub.volume_leaders.length > 0, 'Volume leaders must have records');
    assert.ok(hub.turnover_leaders.length > 0, 'Turnover leaders must have records');
    assert.ok(hub.whale_archive_top10.length > 0, 'Whale archive must have records');
    assert.ok(hub.broker_leaderboard.length > 0, 'Broker leaderboard must have records');
    assert.ok(hub.sector_rotation.length > 0, 'Sector rotation must have records');

    // Verify Whale Archive top record has valid fields
    const topWhale = hub.whale_archive_top10[0];
    assert.ok(topWhale.symbol, 'Whale record must have symbol');
    assert.ok(topWhale.lead_broker_id > 0, 'Whale record must have lead broker id');
    assert.ok(topWhale.net_kitta > 0, 'Whale record must have positive net kitta');
  });

  await t.test('5. Multi-Day Differentiation & Trajectory Extraction', () => {
    const subfile1 = readHistoricalSubfile(1);
    const subfile4 = readHistoricalSubfile(4);

    assert.notEqual(subfile1.session_date, subfile4.session_date, 'Day 1 and Day 4 must have different session dates');

    // Verify BARUN had different closing prices on Day 1 vs Day 4
    const barunD1 = subfile1.scrips.BARUN;
    const barunD4 = subfile4.scrips.BARUN;
    assert.notEqual(barunD1.card_1_quote.ltp, barunD4.card_1_quote.ltp, 'BARUN LTP must reflect the distinct session close');

    // Verify 4-Day Trajectory
    const trajectory = getScrip4DayTrajectory('BARUN');
    assert.ok(trajectory, 'Trajectory must exist');
    assert.equal(trajectory.sessions_count, 4, 'Must contain 4 historical sessions');
    assert.equal(trajectory.history[0].session_date, '2026-10-30', 'First entry in history must be oldest (Day 4)');
    assert.equal(trajectory.history[3].session_date, '2026-11-04', 'Last entry in history must be newest (Day 1)');
  });
});
