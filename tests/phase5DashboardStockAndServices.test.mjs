import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

console.log('\n==============================================================');
console.log('PHASE 5 TDD: DASHBOARD, 13 STOCK TABS, STITCH & 125+ SERVICES');
console.log('==============================================================\n');

// [P5-01] No hardcoded NEPSE index overrides (2623.56 / 2624.36 / 2629.82 / 2695.60)
await runTest('[P5-01] liveData.js, Dashboard.jsx & services.tsx contain zero hardcoded 2623.56/2624.36/2629.82/2695.60 index overrides', () => {
  const liveData = read('src/utils/liveData.js');
  const dashboard = read('src/components/Dashboard.jsx');
  const services = read('src/components/services.tsx');

  for (const num of ['2623.56', '2624.36', '2629.82', '2695.60']) {
    assert.ok(!liveData.includes(num), `liveData.js must not hardcode ${num}`);
    assert.ok(!dashboard.includes(num), `Dashboard.jsx must not hardcode ${num}`);
    assert.ok(!services.includes(num), `services.tsx must not hardcode ${num}`);
  }
  assert.ok(!liveData.includes('AUTHORITATIVE_YESTERDAY_CLOSE'), 'liveData.js must not clamp off-market index to AUTHORITATIVE_YESTERDAY_CLOSE');
});

// [P5-02] No 2-point anchorSeries straight-line fabrication & no fake StitchHub SVG paths or 585.00 fallbacks
await runTest('[P5-02] Dashboard & ShareHubChart prevent 2-point straight-line anchor charts; views replace static SVG curves & 585.00 defaults', () => {
  const dashboard = read('src/components/Dashboard.jsx');
  const shareHubChart = read('src/components/ShareHubChart.jsx');
  const liveMarketDash = read('src/views/LiveMarketDashboard.jsx');
  const stockDetails = read('src/views/StockDetails.jsx');
  const orderExec = read('src/views/OrderExecution.jsx');
  const stitchHub = read('src/views/StitchHub.jsx');
  const waccCalc = read('src/views/WaccTaxCalculator.jsx');
  const watchlist = read('src/views/WatchlistScreener.jsx');

  assert.ok(!dashboard.includes('isSessionAnchor: true'), 'Dashboard.jsx must not inject 2-point straight-line anchorSeries');
  assert.ok(shareHubChart.includes('pt?.isSessionAnchor') || !dashboard.includes('anchorSeries'), 'ShareHubChart must not short-circuit on <3 points or synthetic anchors');
  assert.ok(!liveMarketDash.includes('M0,60 Q40,58'), 'LiveMarketDashboard.jsx must not render hardcoded static SVG bezier curve');
  assert.ok(!stockDetails.includes('M0,70 Q40,65'), 'StockDetails.jsx must not render hardcoded static SVG bezier curve');

  for (const [label, src] of [
    ['LiveMarketDashboard.jsx', liveMarketDash],
    ['OrderExecution.jsx', orderExec],
    ['StitchHub.jsx', stitchHub],
    ['WaccTaxCalculator.jsx', waccCalc],
    ['WatchlistScreener.jsx', watchlist],
  ]) {
    assert.ok(!src.includes('585.00'), `${label} must not hardcode mock price 585.00`);
  }
});

// [P5-03] BrokerSmartMoneyCard 1M availability & accurate post-15:15 NPT timing badge
await runTest('[P5-03] BrokerSmartMoneyCard accepts valid 1M payloads & updates 3:15 PM NPT badge when session is already past 15:15 NPT', () => {
  const card = read('src/components/stock/BrokerSmartMoneyCard.tsx');
  const modal = read('src/components/StockDetailModal.jsx');

  assert.ok(!card.includes("(timeframe === '1M' && !isMultiDayResponse && respDays > 0)"),
    'BrokerSmartMoneyCard must not discard valid multi-day 1M responses with < 6 sessions');
  assert.ok(!modal.includes('(days === 30 && localFastDays >= 20)'),
    'handleFetchSmartMoney must not reject valid 1M payloads having fewer than 20 sessions');
  assert.ok(card.includes('isMarketOpen') && card.includes('getNptMinutesOfDay'),
    'BrokerSmartMoneyCard must inspect live window / NPT minutes before printing 3:15 PM sync status');
  assert.ok(!card.includes('Live session syncs at 3:15 PM NPT'),
    'BrokerSmartMoneyCard must distinguish intraday vs post-15:15 EOD reconciliation pending');
});

// [P5-04] StockDetailModal Market Depth, Overview, History & neutral unknown fallbacks
await runTest('[P5-04] StockDetailModal & liveData.js enforce real depth semantics and zero synthetic 50%/1.0 NBAR/Active Accumulation fallbacks', () => {
  const modal = read('src/components/StockDetailModal.jsx');
  const liveData = read('src/utils/liveData.js');

  assert.ok(!modal.includes('grossSellPct > 0 ? grossBuyPct / grossSellPct : 1.0'),
    'StockDetailModal must not fabricate nbar = 1.0 when grossSellPct === 0');
  assert.ok(!modal.includes("'Active Accumulation'") || !modal.includes("'Phase B (Institutional Absorption)'"),
    'StockDetailModal must not claim Active Accumulation / Phase B when 12M ledger data is null');
  assert.ok(!modal.includes('liveTotFlow > 0 ? Math.round((liveNetBuyShares / liveTotFlow) * 100) : 50'),
    'StockDetailModal must not fabricate 50% live order flow balance when flow is zero');
  assert.ok(!modal.includes('bookTot > 0 ? Math.round((bookBuyQty / bookTot) * 100) : 50'),
    'StockDetailModal must not fabricate 50% order book balance when bids/asks are zero');
  assert.ok(!modal.includes('flowTot > 0 ? Math.round((flowBuyVol / flowTot) * 100) : 50'),
    'StockDetailModal must not fabricate 50% executed broker flow when flow volume is zero');
  assert.ok(liveData.includes('Live Order Book Feed Temporarily Unavailable') || liveData.includes('isOffMarket: !mktOpenNow'),
    'liveData.js fetchMarketDepth fallback must not label live-market timeouts as off-market closed');
  assert.ok(!modal.includes('String(latestHistCandle.date) >= String(d.businessDate)'),
    'StockDetailModal History summary must not overwrite live quote LTP/volume when dates are equal (>=)');
});

// [P5-05] Services Hub lazy loading, async dynamic JSON seeds & dynamic Screener hydration
await runTest('[P5-05] ServicesHub uses retryableLazy + Suspense; BrokerFlowDominanceService & historyCache load multi-MB JSON seeds dynamically', () => {
  const servicesHub = read('src/components/ServicesHub.tsx');
  const brokerFlow = read('src/components/BrokerFlowDominanceService.tsx');
  const historyCache = read('src/utils/historyCache.js');
  const screener = read('src/components/StockSelectionScreener.tsx');

  assert.ok(servicesHub.includes('retryableLazy'), 'ServicesHub.tsx must use retryableLazy for heavy service modules');
  assert.ok(servicesHub.includes('<Suspense'), 'ServicesHub.tsx must wrap rendered lazy services in <Suspense>');

  assert.ok(!brokerFlow.includes("import historicalMatricesSeed from '../data/broker_matrices_historical.json'"),
    'BrokerFlowDominanceService.tsx must not statically bundle 7.5MB broker_matrices_historical.json');
  assert.ok(!brokerFlow.includes("import allTimeBrokerHoldingsSeed from '../data/broker_holdings_alltime.json'"),
    'BrokerFlowDominanceService.tsx must not statically bundle 1.02MB broker_holdings_alltime.json');

  assert.ok(!historyCache.includes("import cumulativeBrokerLedger from '../data/nepse_cumulative_broker_ledger.json'"),
    'historyCache.js must not statically bundle 9.65MB nepse_cumulative_broker_ledger.json');
  assert.ok(historyCache.includes('export async function ensureCumulativeBrokerLoaded'),
    'historyCache.js must export async ensureCumulativeBrokerLoaded()');

  assert.ok(screener.includes('fetchMarketWideBrokerSummaryMap'),
    'StockSelectionScreener.tsx must hydrate real broker metrics from fetchMarketWideBrokerSummaryMap');
  assert.ok(!screener.includes(': 55') && !screener.includes('marketSignals: { compositeScore: 60 }'),
    'StockSelectionScreener.tsx must not hardcode static 55 / 60 composite scores');
});

// [P5-06] Zero-LTP Operator Radar guard, File-B 5D fallback & auto-archiver partial-batch freeze guard
await runTest('[P5-06] StockDetailModal rejects phantom Rs.100 targets on ltp=0; liveData preserves fallback5D; proxy guards auto-archiver & keepAlive', () => {
  const modal = read('src/components/StockDetailModal.jsx');
  const liveData = read('src/utils/liveData.js');
  const server = read('proxy/server.mjs');

  assert.ok(!modal.includes('(Number(d.ltp) || 100)'),
    'StockDetailModal must never substitute phantom Rs. 100 when d.ltp is 0');
  assert.ok(!modal.includes('Number(d.ltp || 100) * 0.95') && !modal.includes('Number(d.ltp || 100) * 1.10'),
    'StockDetailModal Stop-Loss / Target 1 must not fabricate 95 / 110 targets when ltp=0');
  assert.ok(modal.includes('SYNCING MARKET QUOTE'),
    'StockDetailModal must show neutral syncing badge when ltp <= 0');

  assert.ok(liveData.includes('let fallback5D = null;') && liveData.includes('if (Array.isArray(fallback5D) && fallback5D.length > 0)'),
    'liveData.js fetchPriceHistory must preserve File B 5D history when extended history endpoints fail');

  assert.ok(server.includes('_archiverAttemptCooldown') && server.includes('archivedCount < 1000'),
    'proxy/server.mjs auto-archiver must guard against partial/masked batches (< 1000 trades) and cooldown');
  assert.ok(server.includes('server.keepAliveTimeout = 65000'),
    'proxy/server.mjs must configure HTTP keepAliveTimeout above 60s to prevent fetch reset races');
});

// [P5-07] Regression checks for 5 Playwright audit fixes (BS parser, JSON MIME dynamic import, index NaN/cold-boot guards, pool throttling)
await runTest('[P5-07] bsToAd handles string/invalid dates safely; historyCache drops dynamic JSON assertion; indices & socket pool guarded', async () => {
  const { bsToAd, getDaysInBsMonth } = await import('../src/utils/bikramSambat.js');
  const dStr = bsToAd('2083-05-02');
  const dNum = bsToAd(2083, 5, 2);
  assert.ok(dStr instanceof Date && !isNaN(dStr.getTime()), 'bsToAd should safely parse YYYY-MM-DD strings');
  assert.ok(dNum instanceof Date && dStr.getTime() === dNum.getTime(), 'bsToAd string and numeric forms must match');
  assert.strictEqual(bsToAd('invalid-date'), null, 'bsToAd must return null for malformed strings instead of throwing');
  assert.strictEqual(bsToAd(1990, 1, 1), null, 'bsToAd must return null for out-of-range BS years');
  assert.strictEqual(getDaysInBsMonth('invalid', 1), 30, 'getDaysInBsMonth must safely handle NaN year inputs');

  const historyCache = read('src/utils/historyCache.js');
  const dynLine = historyCache.split('\n').find(l => l.includes('import(') && l.includes('nepse_cumulative_broker_ledger.json')) || '';
  assert.ok(!dynLine.includes('with:') && !dynLine.includes("type: 'json'"),
    'historyCache.js dynamic ledger import must not emit browser MIME-breaking { with: { type: json } }');

  const appSrc = read('src/App.jsx');
  const liveData = read('src/utils/liveData.js');
  const dashboard = read('src/components/Dashboard.jsx');
  const services = read('src/components/services.tsx');
  const profitEngine = read('src/utils/masterProfitEngine.ts');

  assert.ok(profitEngine.includes('bsToAd(bsYear, bsMonth, bsDay)'),
    'masterProfitEngine.ts must invoke bsToAd with numeric year/month/day arguments');
  assert.ok(liveData.includes('export async function mapWithConcurrency') && liveData.includes('incomplete index payload'),
    'liveData.js must export mapWithConcurrency and prioritize complete index endpoints in tryFastBackend');
  assert.ok(dashboard.includes('BATCH_SIZE = 1') && dashboard.includes('cappedFetches.slice(i, i + 2)'),
    'Dashboard.jsx must throttle background pre-warming and candidate evaluation concurrency');
  assert.ok(appSrc.includes('initialStocks.length > 0 && defaultIndices?.nepse?.value > 1000') &&
            appSrc.includes('!coldBootSettled && (!stocks || stocks.length === 0 || !(indices?.nepse?.value > 1000))'),
    'App.jsx must keep DashboardSkeleton visible until NEPSE index value settles on cold boot');
  assert.ok(services.includes('Number.isFinite(Number(v))') && services.includes('Number.isFinite(val) || val <= 0'),
    'services.tsx must guard index tables against null/NaN formatting');

  const subfilesEngine = read('proxy/utils/historicalSubfilesEngine.mjs');
  const brokerVault = read('proxy/brokerVault.mjs');
  const collector = read('proxy/utils/dailyFloorsheetCollector.mjs');
  assert.ok(subfilesEngine.includes('COLD_COMPILE_COOLDOWN_MS') && subfilesEngine.includes('indexExistsOnDisk'),
    'historicalSubfilesEngine.mjs must return null immediately on uncompiled dates when index already exists');
  assert.ok(brokerVault.includes('getShareSansarSession._cooldownUntil') &&
            brokerVault.includes('hasValidUnmaskedBrokers') &&
            !brokerVault.includes('Boolean(r.buyerMemberId || r.buyerBroker'),
    'brokerVault.mjs must back off ShareSansar retries and reject string-"0" masked floorsheets before ingest/hot-cache rebuild');
  assert.ok(collector.includes('Refusing to persist/ingest masked partial batch'),
    'dailyFloorsheetCollector.mjs must refuse saving/ingesting masked 0-broker batches');
});

// [P5-08] Regression guard ensuring syncTodayFloorsheet refuses partial or 0-broker masked matrix overwrites
await runTest('[P5-08] syncTodayFloorsheet enforces full-tape and non-empty matrix guard before overwriting broker_matrix_latest.json', () => {
  const syncScript = read('scripts/syncTodayFloorsheet.mjs');
  assert.ok(syncScript.includes('trades.length >= 1000'),
    'syncTodayFloorsheet.mjs must require at least 1000 full-session trades before overwriting broker matrices');
  assert.ok(syncScript.includes('aggData?.matrix') && syncScript.includes('aggData.matrix.length > 0'),
    'syncTodayFloorsheet.mjs must require non-empty unmasked aggData.matrix rows before overwriting broker matrices');
  assert.ok(syncScript.includes('Skipping broker_matrix_latest/historical overwrite'),
    'syncTodayFloorsheet.mjs must log explicit skip warning instead of writing 0-broker matrix');
});

console.log('\n==============================================================');
console.log(` PHASE 5 TDD RESULTS: ${passed} passed, ${failed} failed`);
console.log('==============================================================\n');

process.exit(failed > 0 ? 1 : 0);
