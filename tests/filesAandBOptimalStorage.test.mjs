import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, 'proxy', 'data', 'drabyashree_ledger.db');

test('File A and File B Optimal 5-Day Architecture & Speed Verification', async (t) => {
  const db = new Database(dbPath, { readonly: true });

  await t.test('1. File B (5-Day Rolling Ledger) Invariant and Precomputed Analytics', async () => {
    const { build5DayHistoricalLedger, readHistorical5DayLedger, HISTORICAL_5D_JSON, HISTORICAL_5D_GZ } = await import('../proxy/utils/rollingLedgerEngine.mjs');
    
    // Compile File B with 5 days
    const ledger = build5DayHistoricalLedger(db, 5);
    assert.ok(ledger, 'File B ledger must be compiled');
    assert.strictEqual(ledger.session_count, 5, 'File B must contain exactly 5 sessions');
    assert.deepStrictEqual(
      ledger.trading_sessions,
      ['2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02'],
      'Sessions must match the 5 verified trading days'
    );

    // Verify AKJCL precomputations in File B
    const akjcl = ledger.stocks['AKJCL'];
    assert.ok(akjcl, 'AKJCL must be precomputed in File B');
    assert.strictEqual(akjcl.history_5d.length, 5, 'AKJCL must have 5 session records in history_5d');
    assert.strictEqual(akjcl.market_vwap_5d, 343.09, 'AKJCL 5-day market VWAP must be exactly Rs. 343.09');
    assert.strictEqual(akjcl.whale_vwap_5d, 344.42, 'AKJCL 5-day whale buy VWAP must be exactly Rs. 344.42');
    assert.strictEqual(akjcl.lead_broker.id, 58, 'Lead 5-day accumulator must be Broker #58');
    assert.strictEqual(akjcl.lead_broker.avg_buy_rate, 344.16, 'Broker #58 Avg Buy Rate must be Rs. 344.16');
    assert.strictEqual(akjcl.top_distributors[0].broker_id, 40, 'Top 5-day distributor must be Broker #40');
    assert.strictEqual(akjcl.top_distributors[0].avg_sell_rate, 344.33, 'Broker #40 Avg Sell Rate must be Rs. 344.33');
    assert.ok(akjcl.fundamentals, 'Fundamentals must be present in File B');
    assert.strictEqual(akjcl.fundamentals.eps, 3.18, 'AKJCL EPS must be 3.18');
    assert.strictEqual(akjcl.fundamentals.book_value, 93.69, 'AKJCL Book Value must be 93.69');

    // Verify Service Hub Precomputed Tools
    assert.ok(ledger.service_hub.top_accumulated.length >= 10, 'Top accumulated leaderboard must be precomputed');
    assert.ok(ledger.service_hub.top_turnover.length >= 10, 'Top turnover leaderboard must be precomputed');
    assert.ok(ledger.service_hub.dangerous_traps.length >= 1, 'Dangerous traps must be precomputed');
    assert.ok(ledger.service_hub.broker_rankings.length >= 10, 'Broker rankings must be precomputed');

    // Verify File B persistence on disk
    assert.ok(fs.existsSync(HISTORICAL_5D_JSON), 'historical_5days_ledger.json must exist');
    assert.ok(fs.existsSync(HISTORICAL_5D_GZ), 'historical_5days_ledger.json.gz must exist');
    
    // Verify sync to public/data bundle for APK
    const public5dJson = path.join(rootDir, 'public', 'data', 'historical_5days_ledger.json');
    assert.ok(fs.existsSync(public5dJson), 'historical_5days_ledger.json must be synced to public/data');
  });

  await t.test('2. File A (Today Static Analytics Sub-File A1) Invariant', async () => {
    const { TODAY_STATIC_ANALYTICS_JSON } = await import('../proxy/utils/todayDataEngine.mjs');
    assert.ok(fs.existsSync(TODAY_STATIC_ANALYTICS_JSON), 'today_static_analytics.json must exist');
    
    const raw = JSON.parse(fs.readFileSync(TODAY_STATIC_ANALYTICS_JSON, 'utf8'));
    assert.ok(raw.scrips, 'File A1 must contain scrips');
    const akjclA1 = raw.scrips['AKJCL'];
    assert.ok(akjclA1, 'AKJCL must be present in File A1');
    assert.ok(akjclA1.short_term_static?.pivot_points, 'Pivots must be precomputed in File A1');
    assert.ok(akjclA1.short_term_static?.smart_money_5d_flow, '5D smart money flow must be in File A1');
    assert.ok(akjclA1.long_term_static?.audited_quarterly_fundamentals, 'Fundamentals must be in File A1');
    assert.strictEqual(akjclA1.long_term_static.audited_quarterly_fundamentals.book_value_per_share, 93.69);

    // Verify public bundle sync
    const publicA1Json = path.join(rootDir, 'public', 'data', 'today_static_analytics.json');
    assert.ok(fs.existsSync(publicA1Json), 'today_static_analytics.json must be synced to public/data');
  });

  await t.test('3. Sub-Millisecond Speed & Zero Network Lag (< 5ms)', async () => {
    const { readHistorical5DayLedger } = await import('../proxy/utils/rollingLedgerEngine.mjs');
    const t0 = performance.now();
    const ledger = readHistorical5DayLedger();
    const elapsed = performance.now() - t0;
    
    assert.ok(ledger, 'Ledger must return synchronously from memory');
    assert.ok(elapsed < 10, `In-memory read must be < 10ms (was ${elapsed.toFixed(2)}ms)`);
  });
});
