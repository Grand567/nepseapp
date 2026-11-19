import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const memStorage = new Map();
const origLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (k) => (memStorage.has(String(k)) ? memStorage.get(String(k)) : null),
  setItem: (k, v) => { memStorage.set(String(k), String(v)); },
  removeItem: (k) => { memStorage.delete(String(k)); },
  clear: () => { memStorage.clear(); },
  key: (i) => Array.from(memStorage.keys())[i] ?? null,
  get length() { return memStorage.size; }
};

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

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

async function bundleAndImportTs(relEntry, tmpDir) {
  const esbuild = await import('esbuild');
  const outFile = path.join(tmpDir, `${path.basename(relEntry, path.extname(relEntry))}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, relEntry)],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
    plugins: [
      {
        name: 'alias-at',
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            const sub = args.path.slice(2);
            const candidates = [
              path.join(ROOT, 'src', sub),
              path.join(ROOT, 'src', `${sub}.ts`),
              path.join(ROOT, 'src', `${sub}.js`),
              path.join(ROOT, 'src', sub, 'index.ts'),
              path.join(ROOT, 'src', sub, 'index.js'),
            ];
            const found = candidates.find((p) => fs.existsSync(p));
            return found ? { path: found } : undefined;
          });
        }
      }
    ]
  });
  return await import(pathToFileURL(outFile).href);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drabyashree-batch4-'));

try {
  // ── BUG-023: Canonical Equity Filtering Across Core Quant, Master, Alpha & Screener Engines ──
  await test('[BUG-023] nepseEquityFilter excludes all NEPSE MFs, debentures & promoter/pref shares while keeping ordinary equities', async () => {
    const eqMod = await import('../src/utils/nepseEquityFilter.js');
    assert.equal(typeof eqMod.isTradableOrdinaryEquity, 'function', 'isTradableOrdinaryEquity must be exported');

    const excluded = [
      { symbol: 'SLCF', sector: 'Commercial Banks', ltp: 10.2 },
      { symbol: 'KSY', sector: 'Mutual Fund', ltp: 10.5 },
      { symbol: 'RSY', sector: 'Life Insurance', ltp: 11.0 },
      { symbol: 'CSY', sector: 'Commercial Banks', ltp: 10.4 },
      { symbol: 'NSY', sector: 'Life Insurance', ltp: 10.1 },
      { symbol: 'GSY', sector: 'Development Banks', ltp: 10.6 },
      { symbol: 'SBCF', sector: 'Commercial Banks', ltp: 10.8 },
      { symbol: 'NICFC', sector: 'Commercial Banks', ltp: 10.3 },
      { symbol: 'SIGS3', sector: 'Commercial Banks', ltp: 10.9 },
      { symbol: 'NBF2', sector: 'Mutual Fund', ltp: 10.0 },
      { symbol: 'ADBLD83', sector: 'Commercial Banks', ltp: 1020 },
      { symbol: 'NABILP', sector: '', name: 'NABIL Bank Limited Promotor Share', ltp: 280 },
      { symbol: 'NABILPNP', sector: '', name: 'Nabil 8% Perpetual Non Cumulative Preference Share', ltp: 105 },
      { symbol: 'HIDCLP', sector: '', ltp: 160 },
      { symbol: 'KBLR', sector: '', name: 'Kumari Rinpatra 2088', ltp: 1000 },
      { symbol: 'MYOJ', sector: '', name: 'Sunrise Balanced Investment Fund Yojana', ltp: 11.2 },
    ];
    for (const s of excluded) {
      assert.equal(eqMod.isTradableOrdinaryEquity(s), false, `${s.symbol} must be excluded`);
    }

    const kept = [
      { symbol: 'CITY', sector: 'Hotels and Tourism', ltp: 520 },
      { symbol: 'HATHY', sector: 'Investment', ltp: 890 },
      { symbol: 'NMBMF', sector: 'Microfinance', ltp: 680 },
      { symbol: 'SWMF', sector: 'Microfinance', ltp: 710 },
      { symbol: 'NADEP', sector: 'Microfinance', ltp: 640 },
      { symbol: 'NABIL', sector: 'Commercial Banks', ltp: 540 },
    ];
    for (const s of kept) {
      assert.equal(eqMod.isTradableOrdinaryEquity(s), true, `${s.symbol} ordinary equity must be kept`);
    }
  });

  await test('[BUG-023] accumulationDistribution, masterProfitEngine, guruEngine, masterAlphaPipeline, quantEngine & services enforce equity filter', async () => {
    const adMod = await bundleAndImportTs('src/utils/accumulationDistributionEngine.ts', tmpDir);
    const champions = adMod.calculateSectorAccumulationChampions([
      { symbol: 'SLCF', sector: 'Commercial Banks', totalScore: 98, isAccumulating: true, isDisqualifiedTrap: false, bcr3BuyPct: 80, rvol: 3, adRatio: 0.5 },
      { symbol: 'NABILP', sector: 'Commercial Banks', totalScore: 95, isAccumulating: true, isDisqualifiedTrap: false, bcr3BuyPct: 75, rvol: 2, adRatio: 0.4 },
      { symbol: 'NABIL', sector: 'Commercial Banks', totalScore: 70, isAccumulating: true, isDisqualifiedTrap: false, bcr3BuyPct: 45, rvol: 1.8, adRatio: 0.2 },
    ]);
    const bankChamp = champions.find(c => /Commercial/i.test(c.sector));
    assert.equal(bankChamp?.symbol, 'NABIL', 'Sector champion must skip SLCF & NABILP');

    const masterMod = await bundleAndImportTs('src/utils/masterProfitEngine.ts', tmpDir);
    const debEval = masterMod.evaluateMasterStock({ symbol: 'ADBLD83', sector: 'Corporate Debenture', name: 'ADBL Debenture 2083', ltp: 1020, volume: 50000, turnover: 51000000 }, true);
    assert.equal(debEval, null, 'evaluateMasterStock must reject debentures');

    const { selectMasterPrimePick } = await import('../src/utils/guruEngine.js');
    const primeRes = selectMasterPrimePick([
      { symbol: 'ADBLD83', sector: 'Corporate Debenture', ltp: 1020, volume: 100000, turnover: 102000000, pChange: 5.0, eps: 10 },
      { symbol: 'LOSSCO', sector: 'Hydropower', ltp: 320, volume: 100000, turnover: 32000000, pChange: 4.0, eps: -8 },
    ], {}, {}, { forceRecalculate: true });
    assert.equal([...(primeRes.activeBreakouts || []), ...(primeRes.nextBreakouts || [])].length, 0, 'selectMasterPrimePick main loop must filter out debentures & negative-EPS stocks');
    assert.equal(primeRes.primeDailyPick, null, 'selectMasterPrimePick must not pick debenture or negative-EPS stock');

    const { runUnifiedFiveStepAlphaDesk } = await bundleAndImportTs('src/utils/masterAlphaPipeline.js', tmpDir);
    const alphaRes = runUnifiedFiveStepAlphaDesk([
      { symbol: 'ADBLD83', sector: 'Corporate Debenture', ltp: 1020, volume: 50000, turnover: 51000000, pChange: 3.0, eps: 15, bookValue: 150 }
    ]);
    const alphaSyms = [...(alphaRes.fullyQualifiedPicks || []), ...(alphaRes.radarRunnerUps || [])].map(x => x.symbol);
    assert.equal(alphaSyms.includes('ADBLD83'), false, 'runUnifiedFiveStepAlphaDesk must exclude debentures');

    const { runAmalgamatedBreakoutPipeline } = await import('../src/utils/quantEngine.js');
    const candles = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, open: 500, high: 508, low: 495, close: 502 + (i === 29 ? 15 : 0), volume: 50000 }));
    const pipeRes = runAmalgamatedBreakoutPipeline([
      { symbol: 'NBF2', sector: 'Mutual Fund', ltp: 517, volume: 100000, turnover: 51700000, eps: 15, sectorName: 'Mutual Fund' },
      { symbol: 'NULL_EPS', sector: 'Hydropower', ltp: 517, volume: 100000, turnover: 51700000, eps: null, sectorName: 'Hydropower' },
    ], { NBF2: candles, NULL_EPS: candles }, {});
    const pipeSyms = [...pipeRes.activeBreakouts, ...pipeRes.nextBreakouts].map(x => x.symbol);
    assert.equal(pipeSyms.length, 0, 'runAmalgamatedBreakoutPipeline must reject MFs and null-EPS stocks');

    const servicesHubSrc = readRepoFile('src/components/ServicesHub.tsx');
    const servicesSrc = readRepoFile('src/components/services.tsx');
    assert.ok(servicesHubSrc.includes('isPureNepseEquity(s)') && !servicesHubSrc.includes("s.sector !== 'Mutual Funds'"), 'pe-ranking must use isPureNepseEquity');
    assert.ok(servicesSrc.includes('includeNonEquities') && servicesSrc.includes('isPureNepseEquity'), 'UniversalScreener & TopPerformersService must enforce isPureNepseEquity');
  });

  // ── BUG-024: No Fabricated NRB Solvency, Fundamental, Ownership & Broker Defaults ──
  await test('[BUG-024] quantEngine, fundamentals, fundamentalSignals, liveData & ServicesHub preserve nulls instead of fabricating passing defaults', async () => {
    const qMod = await import('../src/utils/quantEngine.js');
    const nrbMissing = qMod.evaluateNrbRegulatorySafety({ symbol: 'TESTB', sector: 'Commercial Banks' });
    assert.equal(nrbMissing.npl, null, 'evaluateNrbRegulatorySafety must preserve null npl');
    assert.equal(nrbMissing.car, null, 'evaluateNrbRegulatorySafety must preserve null car');
    assert.equal(nrbMissing.cdRatio, null, 'evaluateNrbRegulatorySafety must preserve null cdRatio');
    assert.equal(nrbMissing.roe, null, 'evaluateNrbRegulatorySafety must preserve null roe');
    assert.equal(nrbMissing.passSafetyGate, false, 'Unverified bank must NOT pass NRB safety gate');
    assert.equal(nrbMissing.isVerified, false, 'Unverified bank must set isVerified = false');

    const fsWithCar = qMod.calculateFundamentalScore({ symbol: 'B1', sector: 'Commercial Banks', eps: 20, pe: 14, pb: 1.25, roe: 15, divYield: 4, car: 13.0, npl: 1.5 });
    const fsMissingNrb = qMod.calculateFundamentalScore({ symbol: 'B2', sector: 'Commercial Banks', eps: 20, pe: 14, pb: 1.25, roe: 15, divYield: 4 });
    assert.ok(fsMissingNrb.score < fsWithCar.score, `Missing CAR/NPL must not earn the same NRB bonus as verified CAR=13/NPL=1.5 (${fsMissingNrb.score} vs ${fsWithCar.score})`);

    const rankGreenNoBroker = qMod.calculateTradeLabRankScore({ symbol: 'G1', ltp: 300, pChange: 4.5, rsi: 62 });
    const rankRedNoBroker = qMod.calculateTradeLabRankScore({ symbol: 'G2', ltp: 300, pChange: -4.5, rsi: 62 });
    assert.equal(rankGreenNoBroker.factors.bcr3, null, 'calculateTradeLabRankScore must not fabricate 45% BCR3 from pChange');
    assert.equal(rankGreenNoBroker.factors.bcr3, rankRedNoBroker.factors.bcr3, 'Green vs Red day must not synthesize differing fake BCR3');

    const fMod = await import('../src/utils/fundamentals.js');
    const missingSummary = fMod.calculateFundamentalSummary({ symbol: 'BANKX', sector: 'Commercial Banks', ltp: 300 });
    assert.equal(missingSummary.npl, null, 'calculateFundamentalSummary must keep missing npl as null');
    assert.equal(missingSummary.car, null, 'calculateFundamentalSummary must keep missing car as null');
    assert.equal(missingSummary.roe, null, 'calculateFundamentalSummary must keep missing roe as null');
    assert.ok(!missingSummary.fundamentalReasons.some(r => r.includes('Low ROE') || r.includes('Graham value zone')), 'Must not penalize missing ROE or award bank Graham PB bonus when NPL missing');

    const valMissingEps = fMod.evaluateValuation({ symbol: 'NOLUCK', sector: 'Commercial Banks', pbv: 0.8 });
    assert.ok(!valMissingEps.explanation.some(e => e.includes('Negative or zero EPS')), 'Missing EPS must not be classified as loss-making');
    assert.notEqual(valMissingEps.pbvStatus, 'UNDERVALUED', 'Missing NPL must not trigger clean-bank Graham PBV < 1 bonus');

    const sigMod = await import('../src/utils/signals/fundamentalSignals.js');
    const ownMissing = sigMod.evaluateOwnershipStructure({ listedShares: 5000000 });
    assert.equal(ownMissing.promoterPercentage, null, 'Missing ownership must not fabricate 70% promoter');
    assert.equal(ownMissing.publicPercentage, null, 'Missing ownership must not fabricate 30% public');
    assert.equal(ownMissing.freeFloatShares, null, 'Missing ownership must keep freeFloatShares null');

    const servicesHubSrc = readRepoFile('src/components/ServicesHub.tsx');
    assert.ok(!servicesHubSrc.includes("s.npl == null ||"), 'nrb-safety-shield must require non-null solvency values');
    assert.ok(!servicesHubSrc.includes(": '51.0%'") && !servicesHubSrc.includes('|| 51;'), 'float-analytics must not fabricate 51.0% / 49.0%');

    const liveDataSrc = readRepoFile('src/utils/liveData.js');
    assert.ok(!liveDataSrc.includes('|| 1000000000'), 'liveData must not fabricate 1e9 paidUpCapital when missing');
    assert.ok(!liveDataSrc.includes('promoterSharePct: Number(f.promoter_share_pct) || 0'), 'liveData must preserve null promoterSharePct when missing');

    const serverSrc = readRepoFile('proxy/server.mjs');
    assert.ok(!serverSrc.includes('detail.publicPercentage = parseFloat(nepseData.publicPercentage || 0)'), 'server stock-detail must preserve null when ownership missing');
  });

  // ── BUG-031, BUG-075, BUG-076, BUG-077: No Fabricated Reports, Fundamentals, Right Shares, News & Track Records ──
  await test('[BUG-031,075,076,077] StockFundamentalsTab, StockRightShareCard, StockReportsAnnouncementsCard, AlgorithmicSignalTrackRecord & StockDetailModal remove fake fallbacks', async () => {
    const fundTabSrc = readRepoFile('src/components/StockFundamentalsTab.jsx');
    for (const marker of ['85.99 Lkh', '6.45 Cr', '4,850 Cr', '2.15%', '0.85 + idx * 0.08', '?? 12.5']) {
      assert.equal(fundTabSrc.includes(marker), false, `StockFundamentalsTab must not contain fabricated "${marker}"`);
    }
    assert.ok(fundTabSrc.includes('setBackendQuarterData(null)'), 'StockFundamentalsTab must reset backendQuarterData on sym switch');

    const rightSrc = readRepoFile('src/components/StockRightShareCard.jsx');
    for (const marker of ['Muktinath Capital Limited', '26 Nov 2023', '01 Jan 2024', '11000000']) {
      assert.equal(rightSrc.includes(marker), false, `StockRightShareCard must not contain hardcoded "${marker}"`);
    }

    const repSrc = readRepoFile('src/components/StockReportsAnnouncementsCard.jsx');
    for (const marker of ['fallbackCompanyNews', 'staticAnnouncements', '09 May 2026', '10 November 2025, Tuesday', 'Third Quarter Report of ${sym} For FY 2082/83', 'text.includes(sym)']) {
      assert.equal(repSrc.includes(marker), false, `StockReportsAnnouncementsCard must not contain "${marker}"`);
    }

    const trackSrc = readRepoFile('src/components/AlgorithmicSignalTrackRecord.tsx');
    for (const marker of ['SIG_NABIL_20261028', 'SIG_AKJCL_20261027', 'DEFAULT_AUDITED_FALLBACK_SIGNALS']) {
      assert.equal(trackSrc.includes(marker), false, `AlgorithmicSignalTrackRecord must not swap in "${marker}"`);
    }

    const modalSrc = readRepoFile('src/components/StockDetailModal.jsx');
    for (const marker of ["'74.5%'", "'64.2%'", "'51.0%'", "'38.4%'"]) {
      assert.equal(modalSrc.includes(marker), false, `StockDetailModal must not hardcode fake win rate ${marker}`);
    }
  });

  // ── BUG-094 & BUG-137: PredictorHub & RegulatoryHub Macro/Bullion/Circular Fixes ──
  await test('[BUG-094,137] PredictorHub drops CATALYST_MAP/2026-11-08 defaults and RegulatoryHub parses unwrapped payloads without fake prices', async () => {
    const predSrc = readRepoFile('src/components/PredictorHub.jsx');
    for (const marker of ['const CATALYST_MAP =', '2026-11-08 15:00 NPT', "lastUpdated: '2026-11-08 (Sample Baseline)'", "npr_usd_rate: '134.20'"]) {
      assert.equal(predSrc.includes(marker), false, `PredictorHub must not contain static baseline "${marker}"`);
    }

    const regSrc = readRepoFile('src/components/RegulatoryHub.tsx');
    for (const marker of ["'5.14%'", "'5.75%'", "'2.75%'", "'4.00%'", "'168,500'", "'144,460'", "'167,800'", "'143,860'", "'2,015'", "'1,728'"]) {
      assert.equal(regSrc.includes(marker), false, `RegulatoryHub must not hardcode fallback ${marker}`);
    }
    assert.ok(regSrc.includes('res.monetaryPolicy'), 'RegulatoryHub fetchMacro must recognize unwrapped monetaryPolicy payload');
    assert.ok(regSrc.includes('res.fineGold24k'), 'RegulatoryHub fetchBullion must recognize unwrapped fineGold24k payload');
    assert.ok(regSrc.includes('item.url || item.href'), 'RegulatoryHub circulars must support item.url from proxy');
  });

  // ── BUG-140: Merolagani News Halt Safeguard & Ticker Map Accuracy ──
  await test('[BUG-140] merolaganiNewsService returns [] on failure, preserves active halts, fixes 4 tickers & whitelists NEPSE/NRB acronyms', async () => {
    const newsMod = await import('../src/services/merolaganiNewsService.js');
    assert.equal(newsMod.NEPALI_NAME_TO_SYMBOL['गुडविल'], 'GFCL');
    assert.equal(newsMod.NEPALI_NAME_TO_SYMBOL['रिलायन्स'], 'RLFL');
    assert.equal(newsMod.NEPALI_NAME_TO_SYMBOL['रसुवागढी'], 'RHPL');
    assert.equal(newsMod.NEPALI_NAME_TO_SYMBOL['युनाइटेड अजोड'], 'UAIL');

    assert.equal(newsMod.resolveSymbolFromText('NEPSE Index rises after NRB and SEBON directive on AGM'), null, 'Generic acronyms NEPSE/NRB/SEBON/AGM must not resolve as stock symbols');
    assert.equal(newsMod.resolveSymbolFromText('NABIL declares dividend for FY 2082/83'), 'NABIL', 'Valid listed ticker NABIL must resolve');

    // Simulate active emergency market halt and verify empty/offline fetch does NOT clear it
    newsMod.setDynamicMarketHalt({ isHalted: true, isEmergencyHalt: true, reason: 'Emergency Exchange Halt', headline: 'आज नेप्से बन्द', date: '2026-11-19', detectedAt: Date.now() });
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Network offline'); };
    try {
      const feed = await newsMod.fetchMerolaganiNews(true);
      assert.deepEqual(feed, [], 'Offline fetchMerolaganiNews must return [] (not fake Today headlines)');
      const haltState = await newsMod.detectMarketHaltFromNews();
      assert.equal(haltState.isHalted, true, 'Empty/offline news fetch MUST NOT clear active emergency halt');
    } finally {
      newsMod.clearDynamicMarketHalt();
      globalThis.fetch = origFetch;
    }
  });

  // ── BUG-166: Backend Routes Must Not Fabricate Mock/Static Payloads Stamped Live ──
  await test('[BUG-166] proxy/server.mjs removes hardcoded mock fallbacks & synthetic 1D indicators', async () => {
    const serverSrc = readRepoFile('proxy/server.mjs');
    for (const marker of [
      'macdLine: p*1.8',
      'adxApprox: Math.min',
      'Math.max(10, Math.min(90, 50 + pChange * 5))',
      'checkMA(prevClose * 0.985)',
      'kf.nav * 0.92',
      'const eps = Number(base?.eps || 18.2)',
      'advances: advances ?? 174',
      'const fallbackBullion = {',
      'const fallbackRates = {',
      'nepseVal = indices?.nepse?.value || 2560.84'
    ]) {
      assert.equal(serverSrc.includes(marker), false, `proxy/server.mjs must not contain fabricated "${marker}"`);
    }
    // Verify protected Daily Stock Selection Guide wiring remains untouched
    assert.ok(serverSrc.includes('/api/telegram/dispatch-selection-guide'), 'Daily stock selection guide route must remain intact');
    assert.ok(serverSrc.includes('evaluateDailySelectionGuide') || serverSrc.includes('stockSelectionGuideEngine') || fs.existsSync(path.join(ROOT, 'proxy/stockSelectionGuideEngine.mjs')));
  });

  // ── BUG-167: Proxy Workers, Notifiers, Alert Engines & featureEngine Strictness ──
  await test('[BUG-167] extract5DayBrokerFlowMetrics, smartAlertEngine, institutionalAlertEngine & featureEngine preserve nulls/RSI=50 and forbid fake auto-pass defaults', async () => {
    const workersSrc = readRepoFile('proxy/workers.mjs');
    for (const marker of ['let bidVol = 25000;', 'let askVol = 18000;', "let obir = '+0.16';", 'nepseVal = 2695.60;']) {
      assert.equal(workersSrc.includes(marker), false, `proxy/workers.mjs must not contain hardcoded "${marker}"`);
    }

    const notifMod = await import('../proxy/telegramNotifier.mjs');
    const emptyFlow = notifMod.extract5DayBrokerFlowMetrics([], 300);
    assert.equal(emptyFlow.bcr3Buy, null, 'Empty broker flow must return bcr3Buy: null (not 50.0)');
    assert.equal(emptyFlow.bcr3Sell, null, 'Empty broker flow must return bcr3Sell: null (not 35.0)');
    assert.equal(emptyFlow.leadRetentionPct, null, 'Empty broker flow must return leadRetentionPct: null (not 75.0)');

    const notifSrc = readRepoFile('proxy/telegramNotifier.mjs');
    for (const marker of ['trapAudit.retentionPct || 65', 'let vduRatio = 0.55;', 'bcr3Buy = flowMetrics.bcr3Buy ?? 45.0', 'Past Accumulator Selling: 0 Kitta']) {
      assert.equal(notifSrc.includes(marker), false, `proxy/telegramNotifier.mjs must not contain auto-pass "${marker}"`);
    }

    const smartMod = await import('../proxy/smartAlertEngine.mjs');
    const candles25 = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, high: 200, low: 190, close: 195, volume: 0 }));
    const noBaseVol = smartMod.detectHistoricalVolumeBreakout({ symbol: 'TESTX', ltp: 205, volume: 15000, turnover: 3075000, historicalCandles: candles25 });
    assert.equal(noBaseVol.qualified, false, 'Missing 20D average volume must not fall back to 50000 and qualify');
    const candlesWithVol = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, high: 200, low: 190, close: 195, volume: 10000 }));
    const boNoFloorsheet = smartMod.detectHistoricalVolumeBreakout({ symbol: 'TESTY', ltp: 205, volume: 30000, turnover: 6150000, historicalCandles: candlesWithVol, floorsheetTrades: [] });
    assert.equal(boNoFloorsheet.bcr3BuyPct, null, 'Missing floorsheet trades must keep bcr3BuyPct null (not 50)');

    const instMod = await import('../proxy/institutionalAlertEngine.mjs');
    const trapCliff = instMod.evaluateSectorFundamentalAndLockinTraps({ symbol: 'TESTCLIFF', sector: 'Commercial Banks', daysToLockInExpiry: 45 });
    assert.equal(trapCliff.passed, false, '45-day imminent lock-in cliff must be vetoed (not just 90..180)');
    assert.equal(trapCliff.isFundamentalsVerified, false, 'Missing bank NPL/distributable EPS must mark fundamentals unverified');

    const p1Missing = instMod.evaluatePillar1_WyckoffVduVcp({ recentVolume: 10000, avgVolume20D: 0, priceHistory: [] });
    assert.equal(p1Missing.passed, false, 'Missing avgVolume20D must NOT auto-pass VDU as 0.50x');

    const p2Missing = instMod.evaluatePillar2_SmartMoneyAbsorption({ bcr3BuyPct: 60 });
    assert.equal(p2Missing.passed, false, 'Omitted floorsheet/5D retention/trade counts must NOT auto-pass Pillar 2');

    const featMod = await import('../proxy/quant/featureEngine.mjs');
    const feat50 = await featMod.computeStockFeatures('ZZFAKE_NO_DB', 30, { symbol: 'ZZFAKE_NO_DB', ltp: 300, pChange: 0.5, volume: 10000, rsi: 50.0, macdSignal: 'neutral' });
    assert.equal(feat50.rsi_14, 50.0, 'Genuine RSI = 50.0 must be preserved instead of dropped to null');
  });

  // ── BUG-172: AiAnalyst, NepseAgentDashboard & verifySignalTrackRecord Zero Fallbacks ──
  await test('[BUG-172] verifySignalTrackRecord preserves 0% win rate and AiAnalyst / NepseAgentDashboard remove fake fallbacks', async () => {
    const verifyMod = await bundleAndImportTs('src/utils/verifySignalTrackRecord.ts', tmpDir);
    const zeroWin = verifyMod.auditAndComputeTrackRecord([
      { status: 'STOP_HIT', entry_vwap: 300, nepse_alpha_pct: -2.0, net_return_pct: -5.2, avg_ticket_kitta: 200 }
    ], [], []);
    assert.equal(zeroWin.verifiedWinRatePct, 0, 'Genuine 0% win rate must stay 0 (not override to 63.5)');

    const aiSrc = readRepoFile('src/components/AiAnalyst.jsx');
    for (const marker of ['nepseIndex || 2740', 'totalTurnover || 5.2e9', 'totalTransactions || 85000', "['NABIL (+2.8%)', 'AKJCL (+9.9%)', 'SHIVM (+3.4%)']"]) {
      assert.equal(aiSrc.includes(marker), false, `AiAnalyst must not contain hardcoded fallback "${marker}"`);
    }

    const agentSrc = readRepoFile('src/components/NepseAgentDashboard.jsx');
    for (const marker of ["|| 'Commercial Banks'", '?? 80}/100', '|| 75}/100', "|| '20-EMA base'", 'dossier?.executionPlan?.breakoutZone?.pivot}']) {
      assert.equal(agentSrc.includes(marker), false, `NepseAgentDashboard must not contain "${marker}"`);
    }
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  globalThis.localStorage = origLocalStorage;
}

console.log(`\n[Batch 4 Test Summary] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
