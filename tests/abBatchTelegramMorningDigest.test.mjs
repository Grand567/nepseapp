/**
 * tests/abBatchTelegramMorningDigest.test.mjs
 * Test Suite: Automated Morning Telegram / Push Dispatcher (Post-Build Stage 3)
 *
 * Verifies:
 * 1. Morning Digest HTML message formatting (Header, Confluence Breakdown, Entry/Stops, Sizing, Microstructure)
 * 2. Zero-Buy Capital Preservation fallback handling
 * 3. Graceful Telegram API dispatch error handling when bot token is unconfigured
 * 4. NEPSE trading day schedule filter (Sunday–Thursday vs Friday/Saturday & Dashain holidays)
 * 5. Worker integration executing runDailyPaperRun and generating morning digest dispatch output
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  formatMorningDigestHtml, 
  sendMorningStockSelectionDigest 
} from '../proxy/telegramNotifier.mjs';
import { runMorningStockSelectionDigestWorker } from '../proxy/workers.mjs';
import { isNepseTradingDay } from '../src/utils/nepseCalendar.js';

describe('Stage 3: Automated Morning Telegram / Push Dispatcher', () => {

  const sampleBuyPicks = [
    {
      symbol: 'MBL',
      sector: 'Commercial Banks',
      compositeScore: 78,
      confidence: 84,
      scoreBreakdown: {
        brokerFloorsheet: 85,
        technical: 75,
        fundamental: 72,
        marketContext: 80
      },
      executionPlan: {
        entryLtp: 248.0,
        entryZone: [244.3, 249.9],
        stopLoss: 235.0,
        riskPct: 5.24,
        target1: 267.5,
        target2: 287.0,
        riskRewardRatio: 2.5,
        positionSizing: {
          sharesKitta: 580,
          capitalRequiredNpr: 143840,
          maxRiskNpr: 7540
        }
      }
    },
    {
      symbol: 'NIMB',
      sector: 'Commercial Banks',
      compositeScore: 74,
      confidence: 80,
      scoreBreakdown: {
        brokerFloorsheet: 82,
        technical: 70,
        fundamental: 71,
        marketContext: 75
      },
      executionPlan: {
        entryLtp: 215.0,
        entryZone: [211.8, 216.6],
        stopLoss: 204.0,
        riskPct: 5.12,
        target1: 231.5,
        target2: 248.0,
        riskRewardRatio: 2.3,
        positionSizing: {
          sharesKitta: 680,
          capitalRequiredNpr: 146200,
          maxRiskNpr: 7480
        }
      }
    }
  ];

  const sampleWatchPicks = [
    {
      symbol: 'SHIVM',
      sector: 'Manufacturing And Processing',
      compositeScore: 64,
      confidence: 72,
      executionPlan: {
        entryLtp: 520.0
      }
    },
    {
      symbol: 'GHL',
      sector: 'Hydro Power',
      compositeScore: 61,
      confidence: 70,
      executionPlan: {
        entryLtp: 195.0
      }
    }
  ];

  it('1. Formats morning digest HTML with complete confluence, entry, stop, targets and kitta sizing', () => {
    const html = formatMorningDigestHtml(sampleBuyPicks, sampleWatchPicks, '2026-10-26');

    assert.ok(typeof html === 'string', 'Expected HTML output to be a string');
    assert.ok(html.includes('MORNING STOCK SELECTION DIGEST'), 'Header should identify morning digest');
    assert.ok(html.includes('2026-10-26'), 'Header should include target session date');
    assert.ok(html.includes('10:45 AM NPT'), 'Header should mention pre-market dispatch time');

    // Check Candidate 1 (MBL)
    assert.ok(html.includes('#1 <code>MBL</code>'), 'Candidate #1 MBL should be listed with code tags');
    assert.ok(html.includes('Score:</b> <b>78/100</b>'), 'Candidate score should be 78/100');
    assert.ok(html.includes('Broker: 85'), 'Confluence breakdown should list broker score');
    assert.ok(html.includes('Rs. 244.3 – 249.9'), 'Entry zone should be displayed');
    assert.ok(html.includes('Stop-Loss:</b> Rs. 235 (-5.24%)'), 'Stop-loss and risk percentage should be displayed');
    assert.ok(html.includes('T1: Rs. 267.5'), 'Target 1 should be displayed');
    assert.ok(html.includes('T2: Rs. 287'), 'Target 2 should be displayed');
    assert.ok(html.includes('580 kitta'), 'Sizing kitta should be displayed');

    // Check Candidate 2 (NIMB)
    assert.ok(html.includes('#2 <code>NIMB</code>'), 'Candidate #2 NIMB should be listed');
    assert.ok(html.includes('680 kitta'), 'NIMB position sizing should be listed');

    // Check Watchlist
    assert.ok(html.includes('HIGH-CONFLUENCE WATCHLIST'), 'Watchlist section should be present');
    assert.ok(html.includes('<code>SHIVM</code>'), 'Watchlist should include SHIVM');
    assert.ok(html.includes('64/100'), 'Watchlist should include SHIVM score');

    // Check NEPSE Microstructure Safeguards
    assert.ok(html.includes('T+2 Demat Lock'), 'Footer should warn about T+2 settlement lock');
    assert.ok(html.includes('Pre-Open Order Rule'), 'Footer should warn against market buy orders');
    assert.ok(html.includes('±15%'), 'Footer should mention circuit bands');
  });

  it('2. Formats capital preservation directive when zero candidates meet Score >= 70 gate', () => {
    const html = formatMorningDigestHtml([], sampleWatchPicks, '2026-10-26');

    assert.ok(html.includes('CAPITAL PRESERVATION DIRECTIVE'), 'Should display capital preservation directive');
    assert.ok(html.includes('Hold 100% Cash'), 'Should advise holding cash');
    assert.ok(!html.includes('#1 <code>'), 'No buy candidates should be numbered');
    assert.ok(html.includes('HIGH-CONFLUENCE WATCHLIST'), 'Watchlist scrips should still be displayed');
  });

  it('3. Resiliently handles sendMorningStockSelectionDigest when credentials are not configured', async () => {
    const result = await sendMorningStockSelectionDigest(sampleBuyPicks, sampleWatchPicks, '2026-10-26');

    assert.ok(result !== null && typeof result === 'object', 'Result should be an object');
    assert.strictEqual(result.sessionDate, '2026-10-26', 'Result should echo session date');
    assert.strictEqual(result.buyCount, 2, 'Result should echo buyCount');
    assert.strictEqual(result.watchCount, 2, 'Result should echo watchCount');
    assert.ok(result.messageLength > 500, 'HTML payload should be well-formed and non-trivial');
    // If not configured, success is false with a clean reason string rather than an uncaught throw
    if (!result.success) {
      assert.ok(result.reason || result.error, 'Clean error/reason string should be provided');
    }
  });

  it('4. Filters NEPSE schedule: verifies trading days vs weekend closures and holidays', () => {
    // 2026-10-26 was a Monday -> valid trading day
    const mondayTrading = isNepseTradingDay('2026-10-26');
    assert.strictEqual(mondayTrading, true, 'Monday 2026-10-26 should be an open trading day');

    // 2026-10-23 was a Friday -> weekend closed in Nepal
    const fridayClosed = isNepseTradingDay('2026-10-23');
    assert.strictEqual(fridayClosed, false, 'Friday 2026-10-23 should be closed for weekend');

    // 2026-10-24 was a Saturday -> weekend closed in Nepal
    const saturdayClosed = isNepseTradingDay('2026-10-24');
    assert.strictEqual(saturdayClosed, false, 'Saturday 2026-10-24 should be closed for weekend');

    // 2026-10-20 was Dashain (Maha Navami) -> public holiday
    const holidayClosed = isNepseTradingDay('2026-10-20');
    assert.strictEqual(holidayClosed, false, 'Dashain 2026-10-20 should be closed for holiday');
  });

  it('5. Integrates with runMorningStockSelectionDigestWorker for end-to-end selection & dispatch', async () => {
    const workerRes = await runMorningStockSelectionDigestWorker('2026-10-26');

    assert.ok(workerRes !== null && typeof workerRes === 'object', 'Worker should return an object');
    assert.strictEqual(workerRes.success, true, 'Worker should execute successfully');
    assert.strictEqual(workerRes.sessionDate, '2026-10-26', 'Target session should match');
    assert.ok(workerRes.buyPicksCount >= 1, 'Should produce at least 1 buy pick on 2026-10-26');
    assert.ok(workerRes.telegramResult !== undefined, 'Should include telegram dispatch result');
    assert.strictEqual(workerRes.telegramResult.buyCount, workerRes.buyPicksCount, 'Telegram pick count must match');
  });

});
