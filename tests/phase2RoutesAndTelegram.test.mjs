import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n==============================================================');
console.log('PHASE 2 TDD: LIVE/EOD ROUTES, TIMERS, CGT/SLABS & TELEGRAM GATES');
console.log('==============================================================\n');

const serverSrc = fs.readFileSync(path.join(ROOT, 'proxy/server.mjs'), 'utf8');
const telemetrySrc = fs.readFileSync(path.join(ROOT, 'proxy/routes/stockTelemetryRoutes.mjs'), 'utf8');
const brokerVaultSrc = fs.readFileSync(path.join(ROOT, 'proxy/brokerVault.mjs'), 'utf8');
const workersSrc = fs.readFileSync(path.join(ROOT, 'proxy/workers.mjs'), 'utf8');
const tgSrc = fs.readFileSync(path.join(ROOT, 'proxy/telegramNotifier.mjs'), 'utf8');
const smartSrc = fs.readFileSync(path.join(ROOT, 'proxy/smartAlertEngine.mjs'), 'utf8');
const { STATUTORY_RULES } = await import('../proxy/utils/todayDataEngine.mjs');
const todayEngineSrc = fs.readFileSync(path.join(ROOT, 'proxy/utils/todayDataEngine.mjs'), 'utf8');

await test('[P2-01] No shadowed duplicate Express routes in proxy/server.mjs', () => {
  const healthMatches = serverSrc.match(/app\.get\(\[?['"]\/health['"]/g) || [];
  const statusMatches = serverSrc.match(/app\.get\([^)]*['"]\/api\/status['"]/g) || [];
  const indicesMatches = serverSrc.match(/app\.get\([^)]*['"]\/api\/indices['"]/g) || [];
  const summaryMapMatches = serverSrc.match(/app\.get\([^)]*['"]\/api\/broker-analysis\/summary-map['"]/g) || [];
  const smartMoneyMatches = serverSrc.match(/app\.get\([^)]*['"]\/api\/stocks\/:symbol\/smart-money['"]/g) || [];

  assert.strictEqual(healthMatches.length, 1, `Expected 1 /health registration, found ${healthMatches.length}`);
  assert.strictEqual(statusMatches.length, 1, `Expected 1 /api/status registration, found ${statusMatches.length}`);
  assert.strictEqual(indicesMatches.length, 1, `Expected 1 /api/indices registration, found ${indicesMatches.length}`);
  assert.strictEqual(summaryMapMatches.length, 1, `Expected 1 /api/broker-analysis/summary-map registration, found ${summaryMapMatches.length}`);
  assert.strictEqual(smartMoneyMatches.length, 0, `Shadowed /api/stocks/:symbol/smart-money in server.mjs must be removed (handled cleanly by stockTelemetryRoutes.mjs)`);
});

await test('[P2-02] /api/nepse/intraday-graph awaits all ensureSettledClose calls and attempts NOTS off-market recovery', () => {
  const routeStart = serverSrc.indexOf("app.get('/api/nepse/intraday-graph'");
  const routeEnd = serverSrc.indexOf('staleRejected: true', routeStart) + 300;
  const routeBlock = serverSrc.slice(routeStart, routeEnd);

  const callsWithoutAwait = (routeBlock.match(/[^t]\s+ensureSettledClose\(/g) || []).filter(s => !s.startsWith('async') && !s.includes('= async'));
  assert.strictEqual(callsWithoutAwait.length, 0, `Found un-awaited ensureSettledClose call(s): ${JSON.stringify(callsWithoutAwait)}`);
  assert.ok(routeBlock.includes('getNepseIndexDailyGraph') && routeBlock.indexOf('getNepseIndexDailyGraph') < routeBlock.indexOf('if (!isMarketOpen)') + 3500,
    '/api/nepse/intraday-graph off-market branch must try nepseClient.getNepseIndexDailyGraph before rejecting stale ticks');
});

await test('[P2-03] /api/market-depth/:symbol isolates live market timeouts from yesterday closing depth & filters quarantine', () => {
  const fnBlock = serverSrc.slice(serverSrc.indexOf('function reconstructClosingOrderBook'), serverSrc.indexOf("app.get(['/api/nepse/market-depth/:symbol'"));
  assert.ok(fnBlock.includes('is_quarantined'), 'reconstructClosingOrderBook SQL queries must filter COALESCE(is_quarantined, 0) = 0');

  const routeBlock = serverSrc.slice(serverSrc.indexOf("app.get(['/api/nepse/market-depth/:symbol'"), serverSrc.indexOf('export const inFlightDividendRequests'));
  assert.ok(routeBlock.includes('live_depth_unavailable'), 'When isMarketOpen && NOTS L2 fails/empty, route must return live_depth_unavailable instead of yesterday closing book');
  assert.ok(routeBlock.includes('openPrice') && routeBlock.includes('previousClose'), 'Live L2 market depth payload must enrich quote OHLCV fields');
});

await test('[P2-04] stockTelemetryRoutes.mjs drops fake #58/#45 fabrication, handles 15D/live/quarantine & returns full smart-money keys', () => {
  assert.ok(!telemetrySrc.includes("tradeTime: '14:58:00'"), 'Must not fabricate bilateral trades with Broker #58/#45 at 14:58:00');
  assert.ok(telemetrySrc.includes("requestedTf === '15D'"), 'handleStockSmartMoney must support 15D timeframe mapping cleanly');
  assert.ok(telemetrySrc.includes('topAccumulators') && telemetrySrc.includes('topDistributors') && telemetrySrc.includes('topNetBuyers') && telemetrySrc.includes('nbar'),
    'handleStockSmartMoney must emit topAccumulators, topDistributors, topNetBuyers, topNetSellers, and nbar');
  assert.ok(telemetrySrc.includes('isBrokerMaskedIntraday') && telemetrySrc.includes('getOrFetchSymbolFloorsheet'),
    'handleStockSmartMoney must support live intraday masked tape during open session');
  assert.ok(/daily_broker_ledger\s+WHERE UPPER\(symbol\) = \?[\s\S]{0,120}is_quarantined/.test(telemetrySrc),
    'handleStockSmartMoney SQLite queries must guard against quarantined rows');
});

await test('[P2-05] brokerVault fetchSymbolTradingDates skips 16s-24s Chukul/MeroLagani cascade when local history exists', () => {
  const fnBlock = brokerVaultSrc.slice(brokerVaultSrc.indexOf('export async function fetchSymbolTradingDates'), brokerVaultSrc.indexOf('export async function fetchSymbolTradingDates') + 4500);
  assert.ok(!fnBlock.includes('timeout: 8000') && !fnBlock.includes('timeout: 9000') && !fnBlock.includes('timeout: 7000'),
    'fetchSymbolTradingDates external HTTP timeouts must be capped (<= 3500ms) instead of 7-9s sequential hangs');
  assert.ok(fnBlock.includes('dateSet.size < 15') || fnBlock.includes('forceExternalRefresh'),
    'fetchSymbolTradingDates must not crawl external sites if SQLite/vault already holds >= 15 sessions');
});

await test('[P2-06] todayDataEngine.mjs enforces 5.0% / 3.75% CGT, 0.31% Tier-3 slab, NPT dates & no fabricated 8.5% dividends', () => {
  assert.strictEqual(STATUTORY_RULES.cgt_individual_short_term_pct, 5.0, `Short-term CGT must be 5.0%, got ${STATUTORY_RULES.cgt_individual_short_term_pct}`);
  assert.strictEqual(STATUTORY_RULES.cgt_individual_long_term_pct, 3.75, `Long-term CGT must be 3.75%, got ${STATUTORY_RULES.cgt_individual_long_term_pct}`);
  const tier3 = STATUTORY_RULES.broker_commission_tiers.find(t => t.maxNpr === 2000000);
  assert.strictEqual(tier3?.ratePct, 0.31, `Tier 3 (5L-20L) broker slab must be 0.31%, got ${tier3?.ratePct}`);
  assert.ok(!todayEngineSrc.includes('? Number((fund.distributable_eps * 0.8).toFixed(1)) : 8.5'),
    'compileTodayStaticAnalytics must not fabricate synthetic 8.5% / eps*0.8 dividend history');
  const tickFn = todayEngineSrc.slice(todayEngineSrc.indexOf('export function initTodayTickStream'), todayEngineSrc.indexOf('export function initTodayTickStream') + 350);
  assert.ok(!tickFn.includes('new Date().toISOString().slice(0, 10)'), 'initTodayTickStream must use NPT date, not UTC');
});

await test('[P2-07] Telegram dispatch, market summary & SmartAlert guards enforce NPT, quarantine & zero-safe SQL', () => {
  const digestBlock = workersSrc.slice(workersSrc.indexOf('lastMorningDigestDispatchedDate'), workersSrc.indexOf('static sub-file compilation') + 1400);
  assert.ok(!/if \(nptMins >= 645[\s\S]{0,160}lastMorningDigestDispatchedDate = latestClosedSession/.test(workersSrc),
    'workers.mjs must not lock lastMorningDigestDispatchedDate before morning digest work completes');

  assert.ok(!smartSrc.includes('(s.close_price - s.open_price) / s.open_price BETWEEN'),
    'smartAlertEngine.mjs must guard against s.open_price = 0 division in SQL');
  assert.ok(tgSrc.includes('COALESCE(is_quarantined, 0) = 0'),
    'telegramNotifier.mjs readiness queries must filter is_quarantined = 0');

  const summaryBlock = serverSrc.slice(serverSrc.indexOf("app.get('/api/market/summary'"), serverSrc.indexOf("app.get('/api/market/status'"));
  assert.ok(!summaryBlock.includes('advances: 174') && !summaryBlock.includes('2624.36'),
    '/api/market/summary must not fall back to hardcoded 2624.36 or 174/172/14 breadth');
});

console.log(`\n==============================================================`);
console.log(` PHASE 2 TDD RESULTS: ${passed} passed, ${failed} failed`);
console.log(`==============================================================\n`);
if (failed > 0) process.exit(1);
