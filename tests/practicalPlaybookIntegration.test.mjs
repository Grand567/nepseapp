// tests/practicalPlaybookIntegration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

process.env.SUPPRESS_TEST_ALERTS = 'true';
process.env.TEST_LIVE_TELEGRAM = 'false';

test('Practical Playbook & App Integration (FR-1..FR-4)', async (t) => {
  const {
    select5StepSwingPicks,
    run5StepSwingSelectionAndDispatch,
    formatUpgradedStealthAccumulationHtml,
    handleTelegramCommand,
  } = await import('../proxy/telegramNotifier.mjs');

  const {
    processBroker58AlertTrigger,
    processBreakoutAlertTrigger,
  } = await import('../proxy/smartAlertEngine.mjs');

  const {
    TIER1_SNIPER_METRICS,
    DUAL_TIER_COMBINED_METRICS,
  } = await import('../proxy/utils/dualTierEngine.mjs');

  await t.test('FR-1.1: select5StepSwingPicks tags isPrimeBuy & actionTier accurately on all candidates', async () => {
    const res = await select5StepSwingPicks();
    assert.ok(Array.isArray(res.allQualified) && res.allQualified.length > 0, 'allQualified should contain live radar candidates');

    const validTiers = new Set(['TIER_1_SNIPER', 'TIER_2_BALANCED', 'WATCHLIST_FALLBACK']);
    for (const cand of res.allQualified) {
      assert.strictEqual(typeof cand.isPrimeBuy, 'boolean', `${cand.symbol} must expose boolean isPrimeBuy`);
      assert.ok(validTiers.has(cand.actionTier), `${cand.symbol} must expose valid actionTier (got ${cand.actionTier})`);
      const expectedPrime = cand.actionTier === 'TIER_1_SNIPER' || cand.actionTier === 'TIER_2_BALANCED';
      assert.strictEqual(cand.isPrimeBuy, expectedPrime, `${cand.symbol} isPrimeBuy must match Sniper/Balanced tier`);
    }
  });

  await t.test('FR-1.2: run5StepSwingSelectionAndDispatch suppresses Exit Guard auto-arm & marks Watchlist Only on 0 Sniper fallback', async () => {
    const armed = [];
    const fallbackWinner = {
      symbol: 'SHEL',
      name: 'Singati Hydro Energy Limited',
      sector: 'Hydro Power',
      ltp: 310,
      avgBrokerPrice: 306,
      pocPrice: 308,
      entryLow: 308,
      entryHigh: 312,
      stopLoss: 299.1,
      target1: 334.8,
      target2: 356.5,
      sharesPer1Lakh: 90,
      bcr3Buy: 48,
      bcr3Sell: 26,
      retention10D: 79,
      isDualTierSniper: false,
      isDualTierBalanced: false,
      isPrimeBuy: false,
      actionTier: 'WATCHLIST_FALLBACK',
      setupMode: 'STEALTH_FLOOR_ACCUMULATION',
      rallyTrack: 'STANDARD_ACCUMULATION',
      rallyHorizonLabel: '4–8D Stealth Floor Turn',
    };

    const fallbackRes = await run5StepSwingSelectionAndDispatch({
      onTrackHolding: (h) => armed.push(h),
      chatId: '999',
      precomputedSelection: {
        topPick: fallbackWinner,
        runnerUps: [],
        allQualified: [fallbackWinner],
        vetoedTraps: [],
      },
    });

    assert.strictEqual(armed.length, 0, 'Fallback Watchlist pick must NEVER auto-arm Exit Guard');
    assert.strictEqual(fallbackRes.isPrimeBuy, false, 'Fallback result must mark isPrimeBuy: false');
    assert.ok(fallbackRes.html.includes('WATCHLIST ONLY'), 'Fallback header must state WATCHLIST ONLY');
    assert.ok(fallbackRes.html.includes('CASH PRESERVATION'), 'Fallback header must include CASH PRESERVATION label');
    assert.ok(!fallbackRes.html.includes('Exit Guard auto-armed for <code>$SHEL</code>'), 'Fallback footer must NOT claim Exit Guard auto-armed');

    const sniperWinner = {
      ...fallbackWinner,
      symbol: 'SHINE',
      isDualTierSniper: true,
      isPrimeBuy: true,
      actionTier: 'TIER_1_SNIPER',
      dualTierBadge: '🎯 TIER-1 SNIPER (87.5% 1Y WR • 6.68x PF)',
    };

    const sniperRes = await run5StepSwingSelectionAndDispatch({
      onTrackHolding: (h) => armed.push(h),
      chatId: '999',
      precomputedSelection: {
        topPick: sniperWinner,
        runnerUps: [],
        allQualified: [sniperWinner],
        vetoedTraps: [],
      },
    });

    assert.strictEqual(armed.length, 1, 'Genuine Tier-1 Sniper pick MUST auto-arm Exit Guard');
    assert.strictEqual(armed[0].symbol, 'SHINE', 'Auto-armed Exit Guard must match Sniper winner');
    assert.strictEqual(sniperRes.isPrimeBuy, true, 'Sniper result must mark isPrimeBuy: true');
    assert.ok(sniperRes.html.includes('DRAVYASHREE TACTICAL PRIME SELECTION'), 'Prime header must preserve contract text');
    assert.ok(sniperRes.html.includes('Exit Guard auto-armed'), 'Prime footer must confirm Exit Guard armed');
  });

  await t.test('FR-1.3 & FR-1.4: workers.mjs gates verified prime pick on isPrimeBuy & Telegram menus list /sniper', async () => {
    const workersSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'workers.mjs'), 'utf8');
    assert.ok(
      /swingRes\.topPick\.isPrimeBuy/.test(workersSrc),
      'workers.mjs must gate setVerifiedPostMarketPrimePick & PRIME broadcast on swingRes.topPick.isPrimeBuy'
    );

    assert.strictEqual(typeof handleTelegramCommand, 'function', 'telegramNotifier.mjs must export handleTelegramCommand for deterministic tests');
    const helpOut = await handleTelegramCommand('/help', { chatId: '1' });
    const greetOut = await handleTelegramCommand('hi', { chatId: '1' });
    const fallbackOut = await handleTelegramCommand('/unknown_cmd_xyz', { chatId: '1' });

    for (const [label, out] of [['/help', helpOut], ['hi', greetOut], ['fallback', fallbackOut]]) {
      assert.ok(out && typeof out.text === 'string', `${label} response should include text payload in test mock`);
      assert.ok(out.text.includes('/sniper'), `${label} menu must document /sniper command`);
    }
  });

  await t.test('FR-2: Intraday B58 & Breakout triggers emit explicit Early Warning banner in engine, Telegram & SmartAlertBanner.jsx', async () => {
    const b58Res = await processBroker58AlertTrigger({
      symbol: 'TEST_EW_B58',
      companyName: 'Test Hydro Co',
      qualified: true,
      ltp: 320,
      pChange: 1.5,
      netVol: 22000,
      brokerBuyVol: 25000,
      brokerSellVol: 3000,
      buyRatioPct: 89,
      marketSharePct: 16,
      totalBuyAmount: 7040000,
      operatorVwap: 318,
      stage: 'STAGE_1_STEALTH_SEEDING',
      timingSignature: '⚡ Test Window',
      buyZone: { low: 316, high: 322 },
      stopLoss: 308.8,
      target1: 345.6,
      target2: 368,
      netRRR: '2.3 : 1',
      isTest: true,
    });
    assert.strictEqual(b58Res.triggered, true);
    assert.strictEqual(b58Res.alert.isIntradayEarlyWarning, true, 'B58 alert payload must flag isIntradayEarlyWarning: true');
    assert.ok(
      b58Res.alert.intradayWarningBanner?.includes('EARLY WARNING') && b58Res.alert.intradayWarningBanner?.includes('/sniper'),
      'B58 payload must carry EARLY WARNING banner instructing EOD /sniper verification'
    );

    const brkRes = await processBreakoutAlertTrigger({
      symbol: 'TEST_EW_BRK',
      companyName: 'Test Dev Bank',
      qualified: true,
      ltp: 450,
      pChange: 3.1,
      resistance20D: 440,
      breakoutPct: 2.27,
      rvol: 2.4,
      avgVolume20D: 20000,
      currentVolume: 48000,
      dominantBuyerText: 'Broker #58',
      buyZone: { low: 440, high: 451 },
      chaseCap: 455,
      stopLoss: 420.2,
      target1: 486,
      target2: 515.3,
      netRRR: 1.2,
      forceDispatch: true,
      isTest: true,
    });
    assert.strictEqual(brkRes.triggered, true);
    assert.strictEqual(brkRes.alert.isIntradayEarlyWarning, true, 'BREAKOUT alert payload must flag isIntradayEarlyWarning: true');

    const ewHtml = formatUpgradedStealthAccumulationHtml({
      symbol: 'SHIVM',
      name: 'Shivam Cements',
      ltp: 540,
      avgBrokerPrice: 535,
      pocPrice: 536,
      isIntradayEarlyWarning: true,
      intradayWarningBanner: b58Res.alert.intradayWarningBanner,
    });
    assert.ok(ewHtml.includes('EARLY WARNING'), 'Telegram alert HTML must render EARLY WARNING notice for intraday pings');
    assert.ok(ewHtml.includes('/analyze'), 'Telegram early-warning notice must instruct /analyze');

    const bannerSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'SmartAlertBanner.jsx'), 'utf8');
    assert.ok(bannerSrc.includes('isIntradayEarlyWarning'), 'SmartAlertBanner must handle isIntradayEarlyWarning');
    assert.ok(bannerSrc.includes('Early Warning'), 'SmartAlertBanner must render Early Warning badge for intraday alerts');
  });

  await t.test('FR-3: Audited Dual-Tier win rates (87.5% / 6.68x Tier-1, 75.0% / 4.71x Combined) match across engine & FlowchartV3Panel', () => {
    assert.strictEqual(TIER1_SNIPER_METRICS.winRatePct, 87.5);
    assert.strictEqual(TIER1_SNIPER_METRICS.profitFactor, 6.68);
    assert.strictEqual(DUAL_TIER_COMBINED_METRICS.winRatePct, 75.0);
    assert.strictEqual(DUAL_TIER_COMBINED_METRICS.profitFactor, 4.71);

    const engineSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'utils', 'dualTierEngine.mjs'), 'utf8');
    assert.ok(!engineSrc.includes('85.7'), 'dualTierEngine.mjs must replace stale 85.7% exploratory figure with 87.5%');
    assert.ok(!engineSrc.includes('6.35'), 'dualTierEngine.mjs must replace stale 6.35x exploratory figure with 6.68x');

    const panelSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'swing', 'FlowchartV3Panel.tsx'), 'utf8');
    assert.ok(panelSrc.includes('87.5%'), 'FlowchartV3Panel must display audited 87.5% Tier-1 WR');
    assert.ok(panelSrc.includes('6.68x'), 'FlowchartV3Panel must display audited 6.68x Tier-1 PF');
    assert.ok(panelSrc.includes('75.0%'), 'FlowchartV3Panel must display audited 75.0% Combined WR');
    assert.ok(!panelSrc.includes('85.7%') && !panelSrc.includes('6.35x'), 'FlowchartV3Panel must remove stale 85.7% / 6.35x figures');
  });

  await t.test('FR-4: DualTierSniperCard.tsx renders Dual-Tier Radar & Playbook safely and is mounted in Dashboard.jsx', () => {
    const cardPath = path.join(ROOT_DIR, 'src', 'components', 'swing', 'DualTierSniperCard.tsx');
    assert.ok(fs.existsSync(cardPath), 'DualTierSniperCard.tsx must exist');
    const cardSrc = fs.readFileSync(cardPath, 'utf8');
    assert.ok(cardSrc.includes('/api/radar/dual-tier'), 'DualTierSniperCard must query /api/radar/dual-tier');
    assert.ok(cardSrc.includes('87.5%') && cardSrc.includes('75.0%'), 'DualTierSniperCard must show 87.5% & 75.0% WR benchmarks');
    assert.ok(!cardSrc.includes('better-sqlite3') && !cardSrc.includes('ledgerStore'), 'UI card must NEVER import SQLite/DB layers');

    const dashSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'Dashboard.jsx'), 'utf8');
    assert.ok(dashSrc.includes('DualTierSniperCard'), 'Dashboard.jsx must import and mount DualTierSniperCard');
  });

  await t.test('FR-5: broker-heatmap uses single-flight dedup, compact :json cache, async file read & 3.2s bounded fallback', async () => {
    const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'server.mjs'), 'utf8');
    assert.ok(
      serverSrc.includes('brokerHeatmapInFlight.set(cacheKey, pending)') &&
      serverSrc.includes('brokerHeatmapInFlight.delete(cacheKey)'),
      'broker-heatmap must wire single-flight in-flight registration and cleanup'
    );
    assert.ok(
      serverSrc.includes('function cacheAndSerializeHeatmap(') &&
      serverSrc.includes('setCache(`${cacheKey}:json`'),
      'broker-heatmap must cache pre-serialized JSON payloads via cacheAndSerializeHeatmap'
    );
    assert.ok(
      serverSrc.includes('await fs.promises.readFile(mFile, \'utf8\')') &&
      serverSrc.includes('warmBrokerHeatmapCacheFromSnapshot'),
      'broker-heatmap snapshot reader must use non-blocking fs.promises.readFile and post-warmup pre-warm'
    );
    assert.ok(
      serverSrc.includes('3200 - (Date.now() - heatmapStart)'),
      'broker-heatmap must enforce a 3.2s ceiling across all day horizons'
    );
  });

  await t.test('FR-6: cloudflare/worker.js strips Vary/Set-Cookie from edge cache, preserves User-Agent, and excludes /health from stale-200 masking', async () => {
    const {
      buildOriginHeaders,
      prepareCacheHeaders,
      getCacheTtlSeconds,
      isHealthOrPingRoute,
    } = await import('../cloudflare/worker.js');

    const incoming = new Request('https://drabyashree-nepse-cdn.shreeksuwal.workers.dev/api/today-prices', {
      headers: {
        Accept: 'application/json',
        'cf-connecting-ip': '110.44.120.10',
        Cookie: 'session=abc',
      },
    });
    const url = new URL(incoming.url);
    const fwd = buildOriginHeaders(incoming, url, 'https://drabyashree-nepse-hub.onrender.com', false);
    assert.ok(fwd.get('User-Agent')?.includes('DrabyashreeNepseCDN'), 'Worker must send explicit User-Agent to Render');
    assert.strictEqual(fwd.get('X-Forwarded-For'), '110.44.120.10');
    assert.strictEqual(fwd.get('cookie'), null, 'Public GET requests must omit incoming Cookie headers');
    assert.strictEqual(fwd.get('cf-connecting-ip'), null, 'Worker must not forward internal cf-* headers upstream');

    const rawRespHeaders = new Headers({
      'Content-Type': 'application/json',
      Vary: 'Origin, Accept-Encoding',
      'Set-Cookie': 'foo=bar',
      Pragma: 'no-cache',
    });
    const cleanCacheHeaders = prepareCacheHeaders(rawRespHeaders, 1800);
    assert.strictEqual(cleanCacheHeaders.get('Vary'), null, 'Cache entry must strip Vary so staleKey lookups match');
    assert.strictEqual(cleanCacheHeaders.get('Set-Cookie'), null, 'Cache entry must strip Set-Cookie');
    assert.strictEqual(cleanCacheHeaders.get('Cache-Control'), 'public, max-age=1800, s-maxage=1800');

    assert.strictEqual(isHealthOrPingRoute('/health'), true);
    assert.strictEqual(isHealthOrPingRoute('/api/today-prices'), false);
    assert.strictEqual(getCacheTtlSeconds(new URL('https://example.com/api/today/ticks/stream'), incoming), 0);
    assert.ok(getCacheTtlSeconds(new URL('https://example.com/api/market-status'), incoming) > 0);
  });

  await t.test('FR-7: Render startup RSS hardening scopes broker ledger query, bounds NOTS status timeout & delays heavy EOD boot worker', async () => {
    const ledgerSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'db', 'ledgerStore.js'), 'utf8');
    assert.ok(
      ledgerSrc.includes('const brokerOldestDate = dates[Math.min(dates.length - 1, maxBrokerDays - 1)]') &&
      ledgerSrc.includes('brokersBySymDate.clear()'),
      'rebuildHotCache must scope daily_broker_ledger query to maxBrokerDays and clear temporary maps'
    );

    const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'server.mjs'), 'utf8');
    assert.ok(
      serverSrc.includes("NOTS status timeout (2.5s)") &&
      serverSrc.includes('process.memoryUsage().rss > 320 * 1024 * 1024'),
      'server.mjs must bound checkNotsLiveStatus timeout and guard heatmap prewarm on Render RSS ceiling'
    );

    const workersSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'workers.mjs'), 'utf8');
    assert.ok(
      workersSrc.includes("checkRenderMemoryBudget('InitialEodCatchUp').ok") &&
      workersSrc.includes('}, 90000);'),
      'workers.mjs must delay initial EOD catch-up to 90s and enforce Render memory ceiling'
    );
  });

  await t.test('FR-8: 4-Layer Investment Audit fixes (NRB Shield, Lynch GARP, ERP 7.5%, MarketDepth LTP/0%, 5day-history warmup bypass)', async () => {
    const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'server.mjs'), 'utf8');
    assert.ok(
      serverSrc.includes("p === '/5day-history' || p === '/4day-history'") &&
      serverSrc.includes('FROM scrip_fundamentals'),
      'server.mjs must allow static 5day/4day history during warmup and hydrate scrip_fundamentals in getFallbackTodayPrices'
    );

    const liveDataSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'utils', 'liveData.js'), 'utf8');
    assert.ok(
      liveDataSrc.includes('roe, npl, car, distributableEps'),
      'liveData.js must preserve SQLite-hydrated roe, npl, car, and distributableEps on EnrichedStock'
    );

    const hubSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'ServicesHub.tsx'), 'utf8');
    assert.ok(
      hubSrc.includes('s.cdRatio == null ||') &&
      hubSrc.includes('PEG (P/E ÷ ROE)') &&
      hubSrc.includes('((s.eps / s.ltp) * 100) > 7.5'),
      'ServicesHub.tsx must fix NRB Safety Shield cdRatio null handling, Lynch GARP ROE fallback, and ERP > 7.5% threshold'
    );

    const servicesSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'services.tsx'), 'utf8');
    assert.ok(
      servicesSrc.includes('matchedStock?.ltp || matchedStock?.close') &&
      servicesSrc.includes('hasOrders ? Math.round((totalBuyQty / totalOrderQty) * 100) : 0'),
      'MarketDepthService must fall back to settled stock LTP and avoid synthetic 50% buyPct on empty book'
    );

    assert.ok(
      serverSrc.includes('computeEmaFromSeries(cSlice, 50)') &&
      serverSrc.includes('high52w: tech?.high52w ?? null'),
      'server.mjs must hydrate real 52W High/Low and EMA20/50/200 from daily_stock_summary'
    );
    assert.ok(
      liveDataSrc.includes('r.ema50 ? Number(r.ema50)') &&
      liveDataSrc.includes('ema200'),
      'liveData.js must preserve server-hydrated ema20/ema50/ema200'
    );

    const whaleSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'whaleDailyArchive.js'), 'utf8');
    assert.ok(
      whaleSrc.includes('compactWhaleSnapshot') &&
      whaleSrc.includes('QuotaExceededError') &&
      !whaleSrc.includes("console.error('[WhaleArchive] Failed to save archive:'"),
      'whaleDailyArchive.js must compact snapshots and degrade gracefully on QuotaExceededError without console.error'
    );

    const multibaggerSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'MultibaggerHunterService.tsx'), 'utf8');
    assert.ok(
      multibaggerSrc.includes("typeof season.historicalWinRate === 'number'") &&
      !multibaggerSrc.includes('Win Rate:</span> {season.historicalWinRate}%'),
      'MultibaggerHunterService must not append a duplicate % to string historicalWinRate'
    );

    const divHistSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'utils', 'dividendHistory.js'), 'utf8');
    assert.ok(
      divHistSrc.includes('VERIFIED_DIVIDEND_DATABASE') &&
      divHistSrc.includes('export function getVerifiedOfflineFallback'),
      'dividendHistory.js must export and use VERIFIED_DIVIDEND_DATABASE offline fallback'
    );

    const divPanelSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'DividendHistoryPanel.tsx'), 'utf8');
    assert.ok(
      divPanelSrc.includes('const offline = getVerifiedOfflineFallback(sym)'),
      'DividendHistoryPanel must fall back to verified offline registry on fetch timeout'
    );

    assert.ok(
      servicesSrc.includes('const topAccId = brokerData.topAccumulator?.brokerId ?? brokerData.topAccumulator?.broker') &&
      servicesSrc.includes('topAccId ? `Broker #${topAccId}` :'),
      'BrokerAnalysisService must never render Broker #undefined when topAccumulator/topDistributor is missing or uses .broker'
    );

    assert.ok(
      hubSrc.includes('Number(s.nbar || 0) >= 1.05 || Number(s.adRatio || 0) >= 0.05'),
      'players-choices must not reject stocks when adRatio defaults to 0'
    );

    assert.ok(
      serverSrc.includes('liveStocks = getFallbackTodayPrices() || []') &&
      serverSrc.includes("setCache(`${cacheKey}:unavailable`, unavailablePayload, 5 * 60 * 1000)"),
      'server.mjs must hydrate mutual funds from SQLite fallback prices and return cached 200 unavailable payloads for forex/bullion'
    );
  });

  await t.test('FR-9: 6-Agent Parallel ServicesHub Deep Audit fixes (P0 security, crashes, math, RSI/MACD hydration)', async () => {
    const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'server.mjs'), 'utf8');
    assert.ok(
      serverSrc.includes('computeWilderRsi14(cSlice)') && serverSrc.includes('computeMacdFromSeries(cSlice)'),
      'server.mjs must hydrate Wilder 14D RSI and MACD from SQLite daily_stock_summary'
    );

    const prefSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'PreferencesSettingsService.tsx'), 'utf8');
    assert.ok(
      prefSrc.includes('stripSensitiveAccountFields') && prefSrc.includes("safeParseArray('nepse_portfolio_v1')"),
      'PreferencesSettingsService must never leak plaintext MeroShare password/pin/crn in portfolio backup'
    );

    const fsTabSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'FloorsheetServiceTab.tsx'), 'utf8');
    assert.ok(
      fsTabSrc.includes('if (!signal?.aborted)'),
      'FloorsheetServiceTab must guard signal?.aborted so Refresh Tape never crashes'
    );

    const screenerSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'StockSelectionScreener.tsx'), 'utf8');
    assert.ok(
      screenerSrc.includes("typeof rawLead === 'object'"),
      'StockSelectionScreener must extract broker ID from leadAccumulator objects before JSX render'
    );

    const radarSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'AccumulationDistributionRadar.tsx'), 'utf8');
    assert.ok(
      radarSrc.includes("fetchRealFloorsheet('', dt || '')"),
      'AccumulationDistributionRadar must pass symbol as arg 1 and date as arg 2 to fetchRealFloorsheet'
    );

    const calcSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'calculators.tsx'), 'utf8');
    assert.ok(
      calcSrc.includes('2:1 (50%)') && calcSrc.includes('!Number.isFinite(eps)'),
      'calculators.tsx must align Existing:Right placeholder and guard Graham NaN EPS'
    );

    const smartFlowSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'BrokerSmartFlowTracker.tsx'), 'utf8');
    assert.ok(
      !smartFlowSrc.includes('+{formatNprAmt(rot.accumulatedNetAmt)}') &&
      smartFlowSrc.includes('accessible from all tabs'),
      'BrokerSmartFlowTracker must render inspectedStock modal across all tabs and avoid ++Rs.'
    );

    const ipoSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'IPOList.jsx'), 'utf8');
    assert.ok(
      ipoSrc.includes('https://webbackend.cdsc.com.np/api/meroShare') &&
      !ipoSrc.includes('https://backend.cdsc.com.np/api/meroShare'),
      'IPOList native bulk apply must use webbackend.cdsc.com.np via CapacitorHttp'
    );

    const domSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'BrokerFlowDominanceService.tsx'), 'utf8');
    assert.ok(
      domSrc.includes('topHoldingsTillNow:') && domSrc.includes('isMarketOpen(new Date())'),
      'BrokerFlowDominanceService must populate topHoldingsTillNow and use nepseCalendar isMarketOpen'
    );

    const nrbSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'NRBMacroWidget.jsx'), 'utf8');
    assert.ok(
      nrbSrc.includes('hasServerRegime'),
      'NRBMacroWidget must preserve server macroRegime atomically without mixing mismatched client labels'
    );
  });
});
