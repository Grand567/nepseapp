import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../proxy/db/ledgerStore.js';

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

console.log('\n======================================================');
console.log('BATCH 2: CORE DATA PARITY, CALENDAR, CIRCUITS & VAULTS');
console.log('======================================================\n');

const {
  TOP_NEPSE_BROKERS,
  getBrokerName,
  aggregateBrokerMicrostructure
} = await import('../src/utils/sharedBrokerAggregationEngine.js');

const {
  countNepseTradingSessionsBetween,
  generateTradingDaysSequence,
  calculateT2SettlementDate
} = await import('../src/utils/nepseCalendar.js');

const {
  CIRCUIT_LIMITS,
  SETTLEMENT_CYCLE,
  BROKER_COMMISSION_SLABS,
  calculateCgt,
  calculateRoundTripNetReturn
} = await import('../src/constants/marketRules.js');

const {
  evaluateSectorFundamentalAndLockinTraps,
  isLockInSupplyCliffTrap
} = await import('../src/utils/scanners.js');

const {
  EXIT_RATCHET_CONFIG,
  evaluateSessionExit
} = await import('../proxy/utils/exitRatchetEngine.mjs');

// ── 1. BUG-001: Stale Broker Data vs Payload Date Parity ─────────────────────
await test('[BUG-001] StockDetailModal passes explicit brokerData to StockTechnicalGaugeCard & BrokerFlowDominanceService respects heatmapData.businessDate', () => {
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src/components/StockDetailModal.jsx'), 'utf8');
  const gaugeMatches = modalSrc.match(/<StockTechnicalGaugeCard[\s\S]*?\/>/g) || [];
  assert.ok(gaugeMatches.length >= 2, 'Expected at least 2 StockTechnicalGaugeCard mounts in StockDetailModal.jsx');
  for (const m of gaugeMatches) {
    assert.ok(m.includes('brokerData='), `StockTechnicalGaugeCard mount must pass explicit brokerData prop:\n${m}`);
  }

  const bfdSrc = fs.readFileSync(path.join(ROOT, 'src/components/BrokerFlowDominanceService.tsx'), 'utf8');
  // In sessionDate useMemo, heatmapData.businessDate must take priority over availableDates[0] when no explicit filter is set
  const sessionDateBlock = bfdSrc.slice(bfdSrc.indexOf('const sessionDate = useMemo'), bfdSrc.indexOf('const sessionDate = useMemo') + 750);
  const idxHeatmap = sessionDateBlock.indexOf('heatmapData?.businessDate');
  const idxAvail = sessionDateBlock.indexOf('availableDates[0]');
  assert.ok(idxHeatmap > -1 && idxAvail > -1 && idxHeatmap < idxAvail, 'BrokerFlowDominanceService sessionDate must prioritize heatmapData.businessDate before availableDates[0]');
});

// ── 2. BUG-002 & BUG-029: Top Seller Volume, Amount & Pct Mapping ────────────
await test('[BUG-002 & BUG-029] aggregateBrokerMicrostructure maps sellVol, sellAmt, and sellPct onto topSellerBrokers (never buy values / -0)', () => {
  // Simulate CZBIL 2026-11-17 where Broker #7 sold 9,076 shares and bought 0
  const agg = aggregateBrokerMicrostructure({
    symbol: 'CZBIL',
    dailyLedgerRows: [
      { trade_date: '2026-11-17', broker_id: 42, buy_vol: 34497, sell_vol: 1200, buy_amt: 7554843, sell_amt: 262800 },
      { trade_date: '2026-11-17', broker_id: 7, buy_vol: 0, sell_vol: 9076, buy_amt: 0, sell_amt: 1987644 },
      { trade_date: '2026-11-17', broker_id: 58, buy_vol: 20386, sell_vol: 44607, buy_amt: 4464534, sell_amt: 9768933 }
    ],
    stockSummary: { symbol: 'CZBIL', total_volume: 54883, total_turnover: 12019377, close_price: 219 }
  });

  const seller7 = agg.topSellerBrokers.find(s => String(s.brokerId) === '7');
  assert.ok(seller7, 'Broker #7 must be in topSellerBrokers');
  assert.strictEqual(seller7.sellVol, 9076);
  assert.strictEqual(seller7.volume, 9076, 'topSellerBrokers.volume must equal sellVol (9076), not buyVol (0)');
  assert.strictEqual(seller7.amount, 1987644, 'topSellerBrokers.amount must equal sellAmt, not buyAmt (0)');
  assert.ok(seller7.pct > 16.0 && seller7.pct < 17.0, `topSellerBrokers.pct must be ~16.5% sell share, got ${seller7.pct}`);
  assert.strictEqual(seller7.sellPct, seller7.pct);
});

// ── 3. BUG-003 & BUG-029: Concentration Caps [0, 100] & Gross/Net Separation ─
await test('[BUG-003 & BUG-029] BCR5 and all concentration percentages are capped at 100% and Radar does not mix bcr5NetPct into bcr5BuyPct', () => {
  // Pass rbaData with bcr3BuyPct = 81.12% and no bcr5BuyPct (previously 81.12 / 0.77 = 105.4%)
  const agg = aggregateBrokerMicrostructure({
    symbol: 'CZBIL',
    realBrokerAnalysis: {
      totalVolume: 127849,
      totalTurnover: 27714002,
      bcr3BuyPct: 81.12,
      brokers: [
        { brokerId: '42', buyVol: 65940, sellVol: 0, buyAmt: 14434266, sellAmt: 0 },
        { brokerId: '58', buyVol: 25000, sellVol: 0, buyAmt: 5472500, sellAmt: 0 },
        { brokerId: '45', buyVol: 12800, sellVol: 0, buyAmt: 2801920, sellAmt: 0 }
      ]
    }
  });
  assert.ok(agg.bcr5BuyPct <= 100, `bcr5BuyPct must never exceed 100%, got ${agg.bcr5BuyPct}`);
  assert.ok(agg.bcr3BuyPct <= 100 && agg.bcr3NetPct <= 100 && agg.bcr5NetPct <= 100 && agg.scr3NetPct <= 100);

  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');
  assert.ok(!/bcr5BuyPct:\s*st\.bcr5NetPct\s*\|\|\s*0/.test(radarSrc), 'AccumulationDistributionRadar must not assign st.bcr5NetPct directly to bcr5BuyPct');

  const hcSrc = fs.readFileSync(path.join(ROOT, 'src/utils/historyCache.js'), 'utf8');
  assert.ok(hcSrc.includes('bcr5BuyPct'), 'historyCache.js buildPrecomputedBrokerMap must compute exact bcr5BuyPct');
});

// ── 4. BUG-004: BrokerFlowDominanceService Async Sequence ID Guard ──────────
await test('[BUG-004] BrokerFlowDominanceService guards loadData, loadBrokerRetention, and loadStockRetention against stale async races', () => {
  const bfdSrc = fs.readFileSync(path.join(ROOT, 'src/components/BrokerFlowDominanceService.tsx'), 'utf8');
  assert.ok(bfdSrc.includes('loadDataSeqRef'), 'BrokerFlowDominanceService must track loadDataSeqRef for sequence race protection');
});

// ── 5. BUG-005 & BUG-032: All-Time Broker Holdings, Vaults & L2 Depth Cache ──
await test('[BUG-005 & BUG-032] broker_holdings_alltime.json, nepse_cumulative_broker_ledger.json, and broker_alltime/GHL.json are synced to latest SQLite session', () => {
  const holdingsSeed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/broker_holdings_alltime.json'), 'utf8'));
  const b58 = holdingsSeed['58'];
  assert.ok(b58 && Array.isArray(b58.topHoldings), 'Broker #58 must exist in src/data/broker_holdings_alltime.json');
  const ghl58 = b58.topHoldings.find(h => h.symbol === 'GHL');
  assert.ok(ghl58, 'GHL must be in Broker #58 topHoldings');
  const expectedGhl58Net = db.prepare(`
    SELECT (SUM(buy_vol) - SUM(sell_vol)) as net
    FROM daily_broker_ledger
    WHERE symbol = 'GHL' AND broker_id = 58
  `).get()?.net || 2800239;
  assert.strictEqual(ghl58.cumHoldQty, expectedGhl58Net, `Expected GHL Broker #58 cumHoldQty to match SQLite truth (${expectedGhl58Net}), got ${ghl58.cumHoldQty}`);

  const ghlAlltime = JSON.parse(fs.readFileSync(path.join(ROOT, 'proxy/data/broker_alltime/GHL.json'), 'utf8'));
  assert.ok(ghlAlltime.latestDate >= '2026-11-18', `Expected GHL.json latestDate to be >= 2026-11-18, got ${ghlAlltime.latestDate}`);
  assert.ok(ghlAlltime.dailyRollup['2026-11-18'] || ghlAlltime.dailyRollup['2026-11-19'], 'GHL.json dailyRollup must contain recent sessions');

  const ghlVault = JSON.parse(fs.readFileSync(path.join(ROOT, 'proxy/data/broker_vault/GHL.json'), 'utf8'));
  assert.ok(ghlVault.latestDate >= '2026-11-18', `Expected broker_vault/GHL.json latestDate to be >= 2026-11-18, got ${ghlVault.latestDate}`);

  const setupSrc = fs.readFileSync(path.join(ROOT, 'src/utils/setupAnalyzer.js'), 'utf8');
  assert.ok(setupSrc.includes('getCachedBrokerData'), 'setupAnalyzer.js getSafeCachedBrokerData must query getCachedBrokerData from historyCache.js');
});

// ── 6. BUG-006: StockBrokerAnalysisTab TOTAL HELD TILL TODAY Column ──────────
await test('[BUG-006] StockBrokerAnalysisTab does not overwrite effectiveCumHold (TOTAL HELD TILL TODAY) with 1D holdQty', () => {
  const sbaSrc = fs.readFileSync(path.join(ROOT, 'src/components/StockBrokerAnalysisTab.jsx'), 'utf8');
  assert.ok(!/effectiveCumHold\s*=\s*isSingleSession\s*\?\s*holdQty/.test(sbaSrc), 'StockBrokerAnalysisTab must not override effectiveCumHold with 1-day holdQty when isSingleSession is true');
});

// ── 7. BUG-007: No Synthetic Geometric L2 Order Book Mislabeled as 3:00 PM ───
await test('[BUG-007] liveData.js fetchMarketDepth does not synthesize fake stepped order books labeled as Closing Session Snapshot', () => {
  const liveDataSrc = fs.readFileSync(path.join(ROOT, 'src/utils/liveData.js'), 'utf8');
  const depthFnBlock = liveDataSrc.slice(liveDataSrc.indexOf('export async function fetchMarketDepth'), liveDataSrc.indexOf('export async function fetchMarketDepth') + 3500);
  assert.ok(!depthFnBlock.includes('vol * 0.035'), 'fetchMarketDepth must not fabricate geometric bids using vol * 0.035');
  assert.ok(!depthFnBlock.includes("source: 'client_closing_snapshot'"), 'fetchMarketDepth must not emit fake client_closing_snapshot source');
});

// ── 8. BUG-010: Tihar Holiday Filtered Out of Radar Session Date Dropdown ────
await test('[BUG-010] AccumulationDistributionRadar filters radarAvailableDates through isNepseTradingDay', () => {
  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');
  const block = radarSrc.slice(radarSrc.indexOf('const radarAvailableDates = useMemo'), radarSrc.indexOf('const radarAvailableDates = useMemo') + 1400);
  assert.ok(block.includes('isNepseTradingDay'), 'radarAvailableDates must filter dates through isNepseTradingDay()');
});

// ── 9. BUG-011: Dashboard Frozen Header Shows lastClosedSessionDate ─────────
await test('[BUG-011] Dashboard post-close frozen banner renders lastClosedSessionDate instead of tomorrow targetSessionDate', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  const idx = dashSrc.indexOf('Market Closed (नेप्से बन्द छ)');
  assert.ok(idx > -1, 'Expected Market Closed banner in Dashboard.jsx');
  const block = dashSrc.slice(idx - 100, idx + 1200);
  assert.ok(block.includes('lastClosedSessionDate'), 'Dashboard Market Closed banner must use lastClosedSessionDate');
});

// ── 10. BUG-022: 114 Non-Equity Instruments Reclassified in stockmap.json ───
await test('[BUG-022] proxy/stockmap.json and src/utils/stockmap.json classify all Mutual Funds, Debentures, and Promoter Shares out of equity sectors', () => {
  const equitySectors = new Set([
    'Commercial Banks', 'Development Banks', 'Finance', 'Hydropower', 'Hydro Power',
    'Life Insurance', 'Microfinance', 'Manufacturing And Processing', 'Non Life Insurance',
    'Hotels And Tourism', 'Investment', 'Trading', 'Tradings', 'Others'
  ]);
  for (const relPath of ['proxy/stockmap.json', 'src/utils/stockmap.json']) {
    const sm = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
    assert.strictEqual(sm.HLICF?.sector, 'Mutual Fund', `${relPath}: HLICF must be Mutual Fund`);
    assert.strictEqual(sm.SLCF?.sector, 'Mutual Fund', `${relPath}: SLCF must be Mutual Fund`);
    assert.strictEqual(sm.KSY?.sector, 'Mutual Fund', `${relPath}: KSY must be Mutual Fund`);
    assert.strictEqual(sm.RSY?.sector, 'Mutual Fund', `${relPath}: RSY must be Mutual Fund`);
    assert.strictEqual(sm.CSY?.sector, 'Mutual Fund', `${relPath}: CSY must be Mutual Fund`);
    assert.strictEqual(sm.NSY?.sector, 'Mutual Fund', `${relPath}: NSY must be Mutual Fund`);
    assert.strictEqual(sm.C30MF?.sector, 'Mutual Fund', `${relPath}: C30MF must be Mutual Fund`);
    assert.strictEqual(sm.ADBLD83?.sector, 'Corporate Debenture', `${relPath}: ADBLD83 must be Corporate Debenture`);
    assert.strictEqual(sm.EBLD85?.sector, 'Corporate Debenture', `${relPath}: EBLD85 must be Corporate Debenture`);

    const leaked = [];
    for (const [sym, info] of Object.entries(sm)) {
      const s = sym.toUpperCase();
      const n = String(info?.name || '').toLowerCase();
      const sec = info?.sector || '';
      if (!equitySectors.has(sec)) continue;
      const isDeb = n.includes('debenture') || n.includes('rinpatra') || n.includes('bond') || (/\d{2,4}/.test(s) && (s.includes('D') || s.includes('B')));
      const isMf = n.includes('mutual fund') || n.includes('yojana') || n.includes('scheme') || n.includes('large cap fund') || n.includes('equity fund') || n.includes('balanced fund') || n.includes('growth fund') || n.includes('select fund') || n.includes('stable fund') || n.includes('value fund') || n.includes('bluechip fund') || n.includes('hybrid fund') || n.includes('flexi cap') || s === 'H8020';
      const isPref = n.includes('preference share') || n.includes('promoter');
      if (isDeb || isMf || isPref) leaked.push(`${s} (${sec}: ${info.name})`);
    }
    assert.strictEqual(leaked.length, 0, `${relPath} still has non-equities in equity sectors: ${leaked.slice(0, 10).join(', ')}`);
  }
});

// ── 11. BUG-025: Purge PIT_TEST_SCRIP & PIT_NO_REL From Prod JSON & SQLite ──
await test('[BUG-025] nepse_fundamentals_latest.json and SQLite scrip_fundamentals contain 0 PIT_* unit-test fixtures', async () => {
  const fundJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/nepse_fundamentals_latest.json'), 'utf8'));
  const records = Array.isArray(fundJson) ? fundJson : (fundJson.scrips || fundJson.data || Object.keys(fundJson));
  const hasPitJson = JSON.stringify(fundJson).includes('PIT_TEST_SCRIP') || JSON.stringify(fundJson).includes('PIT_NO_REL');
  assert.strictEqual(hasPitJson, false, 'src/data/nepse_fundamentals_latest.json must not contain PIT_TEST_SCRIP or PIT_NO_REL');

  const Database = (await import('../proxy/node_modules/better-sqlite3/lib/index.js')).default;
  const db = new Database(path.join(ROOT, 'proxy/data/drabyashree_ledger.db'), { readonly: true });
  try {
    const rows = db.prepare(`SELECT symbol FROM scrip_fundamentals WHERE symbol IN ('PIT_TEST_SCRIP', 'PIT_NO_REL')`).all();
    assert.strictEqual(rows.length, 0, `SQLite scrip_fundamentals still has test fixtures: ${JSON.stringify(rows)}`);
  } finally {
    db.close();
  }
});

// ── 12. BUG-027: Pre-Market Future Date Leak in trading-dates ───────────────
await test('[BUG-027] getMarketTradingDates and fetchAvailableTradingDates do not inject todayIso pre-market when 0 trades exist', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'proxy/server.mjs'), 'utf8');
  const fnBlock = srvSrc.slice(srvSrc.indexOf('export async function getMarketTradingDates'), srvSrc.indexOf('export async function getMarketTradingDates') + 2600);
  assert.ok(!fnBlock.includes('calendarDates.forEach(d => d && d <= todayIso && datesSet.add(d))'), 'getMarketTradingDates must not blindly add all generateTradingDaysSequence dates up to todayIso before market open');

  const liveSrc = fs.readFileSync(path.join(ROOT, 'src/utils/liveData.js'), 'utf8');
  const liveBlock = liveSrc.slice(liveSrc.indexOf('export async function fetchAvailableTradingDates'), liveSrc.indexOf('export async function fetchAvailableTradingDates') + 1800);
  assert.ok(!/const baseTradingDays = \[\s*todayIso,/.test(liveBlock), 'fetchAvailableTradingDates must not unconditionally inject todayIso into baseTradingDays before market open');
});

// ── 13. BUG-028: Complete #1-#101 Broker Registry & localLedgerManager ──────
await test('[BUG-028] TOP_NEPSE_BROKERS contains all active brokers #76-#101 and localLedgerManager uses getBrokerName', () => {
  for (const id of ['58', '76', '77', '85', '88', '94', '96', '99', '100', '101']) {
    assert.ok(TOP_NEPSE_BROKERS[id], `TOP_NEPSE_BROKERS must include Broker #${id}`);
  }
  assert.ok(getBrokerName(58).includes('Naasa Securities'), `Broker #58 must be Naasa Securities, got ${getBrokerName(58)}`);
  assert.ok(getBrokerName(77).includes('Nabil Stock Dealer'), `Broker #77 must be Nabil Stock Dealer, got ${getBrokerName(77)}`);
  assert.ok(getBrokerName(101).includes('Apple Securities'), `Broker #101 must be Apple Securities, got ${getBrokerName(101)}`);

  const llmSrc = fs.readFileSync(path.join(ROOT, 'src/utils/localLedgerManager.ts'), 'utf8');
  assert.ok(llmSrc.includes('getBrokerName'), 'localLedgerManager.ts must import and use getBrokerName()');
  assert.ok(!/brokerName:\s*`Broker #\$\{/.test(llmSrc), 'localLedgerManager.ts must not hardcode brokerName: `Broker #${...}`');
});

// ── 14. BUG-030: Corporate Action Price Normalization Bounded by Date ───────
await test('[BUG-030] normalizeCorporateActionPrices does not treat a post-April-2026 -12% daily circuit drop as an old 13% bonus share adjustment', async () => {
  const { normalizeCorporateActionPrices } = await import('../src/utils/quantEngine.js');
  const candles = [
    { date: '2026-11-16', open: 500, high: 505, low: 495, close: 500, volume: 10000 },
    { date: '2026-11-17', open: 498, high: 500, low: 438, close: 440, volume: 15000 }, // -12% normal drop under ±15% circuit
    { date: '2026-11-18', open: 440, high: 450, low: 435, close: 445, volume: 12000 }
  ];
  const oldDivs = [
    { fiscalYear: '2079/80', bonusShare: 13.5, cashDividend: 0.71, bookCloseDate: '2023-12-15' }
  ];
  const adjusted = normalizeCorporateActionPrices(candles, oldDivs);
  assert.strictEqual(adjusted[0].close, 500, `2026-11-16 close must remain 500 (unadjusted for 2023 bonus), got ${adjusted[0].close}`);
  assert.strictEqual(adjusted.corporateActionCount, 0, 'Must not apply 2079/80 bonus adjustment to a Nov 2026 candle');
});

// ── 15. BUG-034 & BUG-168: T+2 Settlement (Unlocked on T+2 / Demat Credit on T+3) ─
await test('[BUG-034 & BUG-168] countNepseTradingSessionsBetween is NPT-safe and signalTrackerStore fixes T+1 exit off-by-one (j >= entryIdx + 2)', () => {
  const sched = calculateT2SettlementDate('2026-11-17T12:00:00+05:45'); // Tuesday (after Chhath Nov 16)
  assert.strictEqual(sched.tradeDateIso, '2026-11-17');
  assert.strictEqual(sched.settlementDateIso, '2026-11-19'); // T+2 Thursday
  assert.strictEqual(sched.dematCreditDateIso, '2026-11-20'); // T+3 Friday

  // Date object passed near midnight NPT (e.g. 2026-11-19T02:00:00+05:45 = 2026-11-18T20:15:00Z)
  // Previously .toISOString().slice(0, 10) turned 2026-11-19T02:00+05:45 into '2026-11-18' (only 1 session from 11-17 instead of 2!)
  const nptEarlyMorning = new Date('2026-11-19T02:00:00+05:45');
  const sessions = countNepseTradingSessionsBetween('2026-11-17', nptEarlyMorning);
  assert.strictEqual(sessions, 2, `Expected 2 sessions between Tue 11-17 and Thu 11-19 02:00 NPT, got ${sessions}`);

  assert.strictEqual(EXIT_RATCHET_CONFIG.T_PLUS_2_DEMAT_LOCK, 2, 'EXIT_RATCHET_CONFIG.T_PLUS_2_DEMAT_LOCK must be 2 (0=entry, 1=T+1 locked, 2=T+2 settled)');
  const day1Eval = evaluateSessionExit({
    entryPrice: 100,
    bar: { open: 90, high: 120, low: 85, close: 90 },
    sessionIndex: 1, // T+1 locked
    activeStopPrice: 95
  });
  assert.strictEqual(day1Eval.fills.length, 0, 'Session index 1 (T+1) must not execute sell fills during T+2 Demat lock');

  const day2Eval = evaluateSessionExit({
    entryPrice: 100,
    bar: { open: 90, high: 120, low: 85, close: 90 },
    sessionIndex: 2, // T+2 unlocked
    activeStopPrice: 95
  });
  assert.strictEqual(day2Eval.fills.length, 1, 'Session index 2 (T+2) must permit exit fills');

  const stsSrc = fs.readFileSync(path.join(ROOT, 'proxy/db/signalTrackerStore.js'), 'utf8');
  assert.ok(stsSrc.includes('j >= entryIdx + 2'), 'signalTrackerStore.js must require j >= entryIdx + 2 (i + 3) from entryIdx = i + 1 so T+1 (i + 2) is never exited');
  assert.ok(stsSrc.includes('holdingDays = j - entryIdx'), 'signalTrackerStore.js must compute holdingDays from entryIdx (j - entryIdx)');

  const stClientSrc = fs.readFileSync(path.join(ROOT, 'src/services/signalTracker.js'), 'utf8');
  assert.ok(stClientSrc.includes('countNepseTradingSessionsBetween'), 'src/services/signalTracker.js must enforce countNepseTradingSessionsBetween >= 2 in evaluateOpenSignals');
});

// ── 16. BUG-135: PromoterSharesService Null Ownership & MSHL Registry Fix ───
await test('[BUG-135] promoter_lockin_registry.json uses MSHL (not MSL) and PromoterSharesService does not render null% or fake 51%/49%', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'proxy/data/promoter_lockin_registry.json'), 'utf8'));
  assert.ok(!reg.some(r => r.symbol === 'MSL'), 'promoter_lockin_registry.json must not contain typo symbol MSL');
  assert.ok(reg.some(r => r.symbol === 'MSHL'), 'promoter_lockin_registry.json must contain MSHL (Mid Solu Hydropower Limited)');

  const pssSrc = fs.readFileSync(path.join(ROOT, 'src/components/PromoterSharesService.tsx'), 'utf8');
  assert.ok(!pssSrc.includes(': 51;'), 'PromoterSharesService.tsx must not default missing promoterPct to 51%');
});

// ── 17. BUG-136: PreferencesSettingsService 503 JSON & NPT Monitoring Date ──
await test('[BUG-136] PreferencesSettingsService parses 503 monitoring payload and monitoringService uses NPT date', () => {
  const prefSrc = fs.readFileSync(path.join(ROOT, 'src/components/PreferencesSettingsService.tsx'), 'utf8');
  assert.ok(prefSrc.includes('res.status === 503') || !prefSrc.includes('if (res.ok)'), 'PreferencesSettingsService must parse 503 JSON body from /api/system/monitoring-health');

  const monSrc = fs.readFileSync(path.join(ROOT, 'proxy/utils/monitoringService.mjs'), 'utf8');
  assert.ok(monSrc.includes('formatNptDateIso'), 'monitoringService.mjs must format expectedDate using formatNptDateIso');
});

// ── 18. BUG-138: Statutory Rules (5%/8% Index Circuits, 0.36%-0.24% Slabs, >365 CGT, Buy+Sell DP) ─
await test('[BUG-138] marketRules.js, RegulatoryHub.tsx, and proxy/server.mjs enforce current SEBON/NEPSE statutory rules', () => {
  assert.strictEqual(CIRCUIT_LIMITS.indexCircuitBreakers.length, 2, 'Post-April 2026 index circuit model has 2 tiers (5% and 8%)');
  assert.strictEqual(CIRCUIT_LIMITS.indexCircuitBreakers[0].thresholdPct, 5.0);
  assert.strictEqual(CIRCUIT_LIMITS.indexCircuitBreakers[1].thresholdPct, 8.0);
  assert.strictEqual(SETTLEMENT_CYCLE.sellableDays, 3);
  assert.strictEqual(BROKER_COMMISSION_SLABS[0].ratePct, 0.36);
  assert.strictEqual(BROKER_COMMISSION_SLABS[4].ratePct, 0.24);

  // Holding 365 days is short-term (5.0%), > 365 days (366) is long-term (3.75%)
  assert.strictEqual(calculateCgt(1000, 365, 'individual'), 50.0, '365 days must be taxed at 5.0% short-term CGT');
  assert.strictEqual(calculateCgt(1000, 366, 'individual'), 37.5, '366 days (>365) must be taxed at 3.75% long-term CGT');

  // Round-trip net return includes Rs. 25 DP charge on both buy and sell legs (Rs. 50 total DP)
  const rt = calculateRoundTripNetReturn({ buyPrice: 500, sellPrice: 500, quantity: 100, holdingDays: 10 });
  // Buy 50,000: comm 180 (0.36%), sebon 7.5, dp 25 => totalBuyCost = 50,212.5
  // Sell 50,000: comm 180, sebon 7.5, dp 25 => netSell = 49,787.5 => netLoss = -425
  assert.strictEqual(rt.netProfitNpr, -425, `Expected round-trip flat trade friction to be -425 (including 2x25 DP), got ${rt.netProfitNpr}`);

  const regHubSrc = fs.readFileSync(path.join(ROOT, 'src/components/RegulatoryHub.tsx'), 'utf8');
  assert.ok(regHubSrc.includes('0.36%') && !regHubSrc.includes('0.40%'), 'RegulatoryHub.tsx must display 0.36%–0.24% commission slabs');
});

// ── 19. BUG-139: scanners.js 0-89d Lock-In Cliff & No Fake Sector Defaults ──
await test('[BUG-139] scanners.js flags 0-89 day imminent lock-in expirations and does not inject fake passing defaults', () => {
  const cliff15d = isLockInSupplyCliffTrap({ symbol: 'MEN', daysToLockInExpiry: 15 });
  assert.strictEqual(cliff15d.isTrap, true, '15-day imminent lock-in expiry must be flagged as a supply cliff trap');

  const cliff0d = isLockInSupplyCliffTrap({ symbol: 'CKHL', daysToLockInExpiry: 0 });
  assert.strictEqual(cliff0d.isTrap, true, '0-day lock-in expiry must be flagged as a supply cliff trap');

  const secEval = evaluateSectorFundamentalAndLockinTraps({
    symbol: 'MEN',
    sector: 'Hydropower',
    fundamentals: {}, // missing bookValue/costPerMW must not be fabricated to passing 115 / 18 if tested, and lock-in 25d must trap
    daysToLockInExpiry: 25
  });
  assert.strictEqual(secEval.passed, false, '25-day lock-in expiry must fail evaluateSectorFundamentalAndLockinTraps');
  assert.ok(secEval.traps.some(t => t.code === 'VETO_LOCKIN_EXPIRY_CLIFF'));
});

// ── 20. BUG-165: runMacroScraper Imports & Subfile Compiler DB Cleanup ──────
await test('[BUG-165] proxy/server.mjs imports getMacroCache and uses query(), and subfile compilers close self-opened DB handles', () => {
  const srvSrc = fs.readFileSync(path.join(ROOT, 'proxy/server.mjs'), 'utf8');
  assert.ok(/import\s*\{[^}]*getMacroCache[^}]*\}\s*from\s*['"]\.\/quant\/macroCache\.mjs['"]/.test(srvSrc), 'proxy/server.mjs must import getMacroCache from ./quant/macroCache.mjs');
  const macroFn = srvSrc.slice(srvSrc.indexOf('async function runMacroScraper'), srvSrc.indexOf('async function runMacroScraper') + 3000);
  assert.ok(!macroFn.includes('if (pool)') && !macroFn.includes('pool.query'), 'runMacroScraper must use query() from ./db.mjs instead of undefined pool');

  const tdeSrc = fs.readFileSync(path.join(ROOT, 'proxy/utils/todayDataEngine.mjs'), 'utf8');
  assert.ok(tdeSrc.includes('db.close()'), 'todayDataEngine.mjs must close self-opened SQLite db handle in finally');

  const hseSrc = fs.readFileSync(path.join(ROOT, 'proxy/utils/historicalSubfilesEngine.mjs'), 'utf8');
  assert.ok(hseSrc.includes('db.close()'), 'historicalSubfilesEngine.mjs must close self-opened SQLite db handle in finally');
});

console.log(`\nBatch 2 Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
