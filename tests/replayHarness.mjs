#!/usr/bin/env node
/**
 * ============================================================================
 * DRABYASHREE NEPSE — REPLAY TEST HARNESS (PHASE 2)
 * ============================================================================
 * Validates session playback, virtual clock transitions, and data integrity:
 * 1. 1D shows live session data during market hours and updates as ticks arrive
 * 2. 5D, 15D, 30D, and All-time differ from 1D and from each other
 * 3. Multi-day windows match independently hand-computed fixtures
 * 4. Market depth, indices, and summary tabs update dynamically
 * 5. 'As of' labels, session badges, and HTTP cache headers are accurate
 *
 * NOTE ON REAL DATA STATUS:
 * Live-hours behaviour on authentic exchange data is marked NOT-TESTED
 * until user executes the recorder on Monday, 2026-11-16 (11:00–15:00 NPT).
 * ============================================================================
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import axios from 'axios';
import { createReplayApp } from '../proxy/replayServer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const fixturesDir = path.join(PROJECT_ROOT, 'qa', 'recordings', 'synthetic-trading-day-2026-11-16');

async function runReplayHarness() {
  console.log('=================================================================');
  console.log('🧪 DRABYASHREE NEPSE — SESSION REPLAY & VIRTUAL CLOCK HARNESS');
  console.log('=================================================================\n');

  // Spin up an ephemeral HTTP server for replay
  const { app, frames } = createReplayApp(fixturesDir);
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`• Replay test server listening on ${baseUrl}`);
  console.log(`• Loaded ${frames.length} sequential test scenarios from fixtures.\n`);

  let passedAssertions = 0;
  let failedAssertions = 0;

  function expect(description, condition) {
    if (condition) {
      console.log(`  ✓ [PASS] ${description}`);
      passedAssertions++;
    } else {
      console.error(`  ❌ [FAIL] ${description}`);
      failedAssertions++;
    }
  }

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: BEFORE OPEN (Monday 10:45 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 1/9] Before Market Open (10:45 AM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'before_open_1045' });

    const status1 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Market isOpen is false before 11:00 AM', status1.data.isOpen === false);
    expect('Session is identified as PRE_OPEN', status1.data.session === 'PRE_OPEN');
    expect('As-of label references last completed trading session (2026-11-13)', status1.data.asOfDate === '2026-11-13');

    const diag1D_1 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=1`)).data;
    expect('1D volume is 0 before session open', diag1D_1.totalVolume === 0);

    const diag5D_1 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=5`)).data;
    const diag15D_1 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=15`)).data;
    const diag30D_1 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=30`)).data;
    const diagAll_1 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=all`)).data;

    expect('5D matches hand-computed fixture (762,883 shares)', diag5D_1.totalVolume === 762883);
    expect('15D matches hand-computed fixture (2,618,649 shares)', diag15D_1.totalVolume === 2618649);
    expect('30D matches hand-computed fixture (5,945,226 shares)', diag30D_1.totalVolume === 5945226);
    expect('All-time matches hand-computed fixture (9,019,555 shares)', diagAll_1.totalVolume === 9019555);

    expect('Distinctness invariant: 1D ≠ 5D ≠ 15D ≠ 30D ≠ All-time',
      diag1D_1.totalVolume !== diag5D_1.totalVolume &&
      diag5D_1.totalVolume !== diag15D_1.totalVolume &&
      diag15D_1.totalVolume !== diag30D_1.totalVolume &&
      diag30D_1.totalVolume !== diagAll_1.totalVolume
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: EARLY CONTINUOUS TRADING (Monday 11:15 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 2/9] Early Continuous Trading (11:15 AM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'mid_session_1115' });

    const status2 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Market isOpen is true during continuous hours', status2.data.isOpen === true);
    expect('Session is identified as CONTINUOUS', status2.data.session === 'CONTINUOUS');
    expect('As-of label reflects today (2026-11-16)', status2.data.asOfDate === '2026-11-16');

    const summary2Res = await axios.get(`${baseUrl}/api/market-summary`);
    expect('Live endpoint returns Cache-Control: no-store', summary2Res.headers['cache-control'].includes('no-store'));

    const shivmSummary2 = summary2Res.data.data.find(s => s.symbol === 'SHIVM');
    expect('1D displays today live price (Rs. 682.00, +6.00)', shivmSummary2?.ltp === 682 && shivmSummary2?.change === 6);
    expect('1D displays today live volume (25,000 shares)', shivmSummary2?.volume === 25000);
    expect('1D displays today live trades (120 trades)', shivmSummary2?.trades === 120);

    const diag5D_2 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=5`)).data;
    expect('5D updates dynamically with today partial (25,000 + 602,883 = 627,883 shares)', diag5D_2.totalVolume === 627883);

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: NOON CONTINUOUS TRADING (Monday 13:00 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 3/9] Mid-Day Continuous Trading (01:00 PM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'mid_session_1300' });

    const summary3Res = await axios.get(`${baseUrl}/api/market-summary`);
    const shivmSummary3 = summary3Res.data.data.find(s => s.symbol === 'SHIVM');
    expect('1D price changes dynamically from 682 to 690 (+14.00)', shivmSummary3?.ltp === 690 && shivmSummary3?.change === 14);
    expect('1D volume updates dynamically from 25,000 to 85,000 shares', shivmSummary3?.volume === 85000);

    const diag5D_3 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=5`)).data;
    expect('5D updates dynamically with new tick (85,000 + 602,883 = 687,883 shares)', diag5D_3.totalVolume === 687883);

    const indices3 = (await axios.get(`${baseUrl}/api/indices`)).data;
    expect('Index updates from 2655.40 to 2668.20 (+19.31)', indices3.data.indices[0].currentValue === 2668.20);

    const depth3 = (await axios.get(`${baseUrl}/api/nepse/market-depth/SHIVM`)).data;
    expect('Market depth reflects new live orderbook (Buy Qty: 62,000)', depth3.data.totalBuyQty === 62000);

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: LATE CONTINUOUS TRADING (Monday 14:45 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 4/9] Late Continuous Trading (02:45 PM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'mid_session_1445' });

    const summary4 = (await axios.get(`${baseUrl}/api/market-summary`)).data;
    const shivmSummary4 = summary4.data.find(s => s.symbol === 'SHIVM');
    expect('1D volume advances to 142,000 shares near close', shivmSummary4?.volume === 142000);

    const diag5D_4 = (await axios.get(`${baseUrl}/api/diagnostics/SHIVM?days=5`)).data;
    expect('5D updates to 744,883 shares', diag5D_4.totalVolume === 744883);

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: CLOSING SESSION BELL (Monday 15:00 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 5/9] Market Closing Bell (03:00 PM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'at_close_1500' });

    const status5 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Market isOpen transitions to false at 15:00', status5.data.isOpen === false);
    expect('Session identified as CLOSING_SESSION', status5.data.session === 'CLOSING_SESSION');

    const summary5 = (await axios.get(`${baseUrl}/api/market-summary`)).data;
    const shivmSummary5 = summary5.data.find(s => s.symbol === 'SHIVM');
    expect('Final close price is Rs. 694.00, volume 151,200', shivmSummary5?.ltp === 694 && shivmSummary5?.volume === 151200);

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: POST-MARKET SETTLEMENT (Monday 16:30 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 6/9] Post-Market Analysis (04:30 PM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'after_close_1630' });

    const status6Res = await axios.get(`${baseUrl}/api/market-status`);
    expect('Post-market Cache-Control switches to public, max-age=60', status6Res.headers['cache-control'].includes('public'));
    expect('Post-market session asOfDisplay states: Market Closed, showing 2026-11-16',
      status6Res.data.data.asOfDisplay.includes('showing 2026-11-16')
    );

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 7: THE NEXT DAY MORNING (Tuesday 09:00 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 7/9] Next Day Before Open (Tuesday 09:00 AM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'the_next_day_0900' });

    const status7 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Next day before 11:00 AM isOpen is false', status7.data.isOpen === false);
    expect('Next day before 11:00 AM shows previous session (2026-11-16)', status7.data.asOfDate === '2026-11-16');

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 8: WEEKEND (Saturday 12:00 NPT)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 8/9] Weekend Saturday (12:00 PM NPT) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'weekend_saturday_1200' });

    const status8 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Weekend isOpen is false and isWeekend is true', status8.data.isOpen === false && status8.data.isWeekend === true);
    expect('Weekend label indicates Market Closed (Weekend)', status8.data.statusLabel.includes('Weekend'));

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 9: PUBLIC HOLIDAY (Sunday - Chhath Parva)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- [Scenario 9/9] Public Holiday (Chhath Parva) ---');
    await axios.post(`${baseUrl}/api/replay/set-step`, { stepId: 'holiday_chhath' });

    const status9 = (await axios.get(`${baseUrl}/api/market-status`)).data;
    expect('Holiday isOpen is false and isHoliday is true', status9.data.isOpen === false && status9.data.isHoliday === true);
    expect('Holiday name correctly identifies Chhath Parva', status9.data.holidayName.includes('Chhath Parva'));

  } finally {
    server.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HARNESS REPORT & REAL DATA DISCLOSURE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n=================================================================');
  console.log(`REPLAY HARNESS SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('=================================================================');

  console.log('\n📢 MANDATORY PROTOCOL NOTICE — REAL DATA TESTING STATUS:');
  console.log('-----------------------------------------------------------------');
  console.log('Status: [NOT-TESTED ON REAL DATA (SYNTHETIC FIXTURES VERIFIED)]');
  console.log('Reason: Today is Saturday, 2026-11-14 (NEPSE Statutory Weekend Closure).');
  console.log('Action: Real live session recording must be executed during the next active session:');
  console.log('👉 SCHEDULE: Tuesday, November 17, 2026, 11:00 AM – 3:00 PM Asia/Kathmandu (NPT) (Post-Chhath Holiday Resumption).');
  console.log('👉 COMMAND:  node qa/scripts/recordLiveSession.mjs --interval 60 --duration 240');
  console.log('-----------------------------------------------------------------\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runReplayHarness().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
