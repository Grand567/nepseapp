import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Provide pure in-memory localStorage polyfill for Node execution (no disk writes)
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
              path.join(ROOT, 'src', `${sub}.tsx`),
              path.join(ROOT, 'src', `${sub}.js`),
              path.join(ROOT, 'src', `${sub}.jsx`)
            ];
            for (const c of candidates) {
              if (fs.existsSync(c)) return { path: c };
            }
            return null;
          });
        }
      }
    ]
  });
  return import(pathToFileURL(outFile).href);
}

console.log('\n==============================================================');
console.log('BATCH 3: TRADING ENGINES, PAPER TRADING, CACHE LOCKS & MODALS');
console.log('==============================================================\n');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nepse-batch3-test-'));

try {
  // ── 1. BUG-091: priceActionEngine S/R breakout / retest / breakdown ──────────
  await test('[BUG-091] analyzePriceAction / analyzeBreakout detects resistance breakout and support breakdown against prior S/R levels', async () => {
    const { analyzePriceAction, analyzeBreakout } = await import('../src/utils/priceActionEngine.js');

    // Build 30-candle base oscillating strictly between 480 and 500, ending with flat base near 495, then crisp breakout to 518
    const breakoutCandles = [];
    for (let i = 0; i < 29; i++) {
      const wave = i % 6;
      const high = wave === 2 ? 500 : 496;
      const low = wave === 5 ? 480 : 486;
      const close = wave === 2 ? 498 : wave === 5 ? 483 : 492;
      breakoutCandles.push({
        date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
        open: close - 1,
        high,
        low,
        close,
        volume: 30000
      });
    }
    breakoutCandles[28] = { date: '2026-10-05', open: 494, high: 499, low: 492, close: 497, volume: 32000 };
    breakoutCandles.push({ date: '2026-10-06', open: 499, high: 520, low: 498, close: 518, volume: 85000 });

    const paBreakout = analyzePriceAction(breakoutCandles, 2.2, 8);
    assert.equal(paBreakout.breakout.detected, true, `Expected breakout.detected=true, got type=${paBreakout.breakout.type}`);
    assert.equal(paBreakout.breakout.type, 'resistance_breakout', `Expected resistance_breakout, got ${paBreakout.breakout.type}`);
    assert.equal(paBreakout.breakout.direction, 'bullish');

    // Breakdown test: floor established at 480, prev bar at 483, current bar closes decisively at 462
    const breakdownCandles = breakoutCandles.slice(0, 29).map(c => ({ ...c }));
    breakdownCandles[28] = { date: '2026-10-05', open: 486, high: 487, low: 481, close: 483, volume: 30000 };
    breakdownCandles.push({ date: '2026-10-06', open: 481, high: 482, low: 460, close: 462, volume: 78000 });

    const paBreakdown = analyzePriceAction(breakdownCandles, 1.9, 8);
    assert.equal(paBreakdown.breakout.detected, true, `Expected breakdown detected=true, got type=${paBreakdown.breakout.type}`);
    assert.equal(paBreakdown.breakout.type, 'support_breakdown', `Expected support_breakdown, got ${paBreakdown.breakout.type}`);
    assert.equal(paBreakdown.breakout.direction, 'bearish');

    // Even direct analyzeBreakout when caller passed stale full-series srLevels (filtered out above currentPrice) should still evaluate prior levels cleanly
    const directRes = analyzeBreakout(breakoutCandles, { support: [], resistance: [] }, 2.1, 8);
    assert.equal(directRes.type, 'resistance_breakout');
  });

  // ── 2. BUG-152: paperTrading lot schema normalization & odd-lot rejection ────
  await test('[BUG-152] executePaperBuy rejects <10 kitta orders and executePaperSell succeeds on executed buy lots', async () => {
    memStorage.clear();
    const {
      resetPaperSandbox,
      executePaperBuy,
      executePaperSell,
      getPaperState
    } = await import('../src/utils/paperTrading.js');

    resetPaperSandbox();
    const oddBuy = executePaperBuy('NABIL', 500, 5, 550, 475, 495);
    assert.equal(oddBuy.success, false, 'Buying <10 kitta must be rejected rather than silently clamped to 10');

    const buyRes = executePaperBuy('NABIL', 500, 50, 560, 470, 495);
    assert.equal(buyRes.success, true, `Expected valid 50 kitta buy to succeed: ${buyRes.error}`);
    assert.equal(buyRes.position.qty, 50, 'Bought position must include canonical qty property');
    assert.equal(buyRes.position.quantity, 50, 'Bought position must include quantity property');
    assert.ok(buyRes.position.waccPerShare > 500, 'Bought position must store waccPerShare');

    const sellRes = executePaperSell(buyRes.position.id, 550, 540, { enforceT2Settlement: false });
    assert.equal(sellRes.success, true, `executePaperSell failed on valid bought lot: ${sellRes.error}`);
    assert.ok(sellRes.details.netCashCredited > 25000);
    const finalState = getPaperState();
    assert.equal(finalState.positions.length, 0, 'Sold position should be removed from open positions');
    assert.equal(finalState.closedTrades.length, 1, 'Closed trade should be recorded');
  });

  // ── 3. BUG-093: signalArbitrationEngine case normalization & veto precedence ─
  await test('[BUG-093] reconcileTechnicalAndBrokerSignals normalizes lowercase directions and enforces veto precedence before Wyckoff spring', async () => {
    const { reconcileTechnicalAndBrokerSignals } = await import('../src/utils/signalArbitrationEngine.js');

    const bullishConfluence = reconcileTechnicalAndBrokerSignals({
      symbol: 'NABIL',
      ltp: 520,
      technical: {
        score: 58,
        trend: { direction: 'bullish' },
        momentum: { condition: 'oversold' }
      },
      broker: {
        bcr3BuyPct: 55,
        scr3SellPct: 20,
        adSignal: 'Accumulation',
        orderFlowVeto: { isVetoed: false }
      }
    });
    assert.equal(bullishConfluence.verdict, 'STRONG_CONFLUENCE_BULLISH', `Expected STRONG_CONFLUENCE_BULLISH with lowercase trend direction, got ${bullishConfluence.verdict}`);
    assert.equal(bullishConfluence.momentumCondition, 'OVERSOLD');

    // Critical veto precedence test: bearish technical + high BCR3 + orderFlowVeto.isVetoed=true MUST NOT emit WYCKOFF_SPRING_ABSORPTION!
    const vetoedBear = reconcileTechnicalAndBrokerSignals({
      symbol: 'TRAP',
      ltp: 400,
      technical: {
        score: 34,
        trend: { direction: 'bearish' },
        momentum: { condition: 'bearish' }
      },
      broker: {
        bcr3BuyPct: 52,
        scr3SellPct: 58,
        adSignal: 'Accumulation',
        orderFlowVeto: { isVetoed: true, reason: 'Heavy net distribution by top seller' }
      }
    });
    assert.notEqual(vetoedBear.verdict, 'WYCKOFF_SPRING_ABSORPTION', 'Vetoed stock must never receive actionable Wyckoff Spring buy signal');
    assert.equal(vetoedBear.verdict, 'STRONG_CONFLUENCE_BEARISH');
  });

  // ── 4. BUG-026: Guru Prime Pick, Master Profit Engine & PrimePickService ──────
  await test('[BUG-026] selectMasterPrimePick respects cash defense & rejects trap fallbacks; masterProfitEngine enforces isFullyCleared', async () => {
    memStorage.clear();
    const { selectMasterPrimePick } = await import('../src/utils/guruEngine.js');

    // Build weak market breadth (>= 70% declining -> cashDefenseActive: true) + valid equities
    const weakMarketStocks = Array.from({ length: 12 }, (_, idx) => ({
      symbol: `STK${idx + 1}`,
      name: `Nepal Equity ${idx + 1} Ltd`,
      sector: 'Commercial Banks',
      ltp: 350 + idx * 10,
      pChange: idx === 0 ? 3.5 : -2.2,
      volume: 45000,
      turnover: 18000000,
      eps: 22,
      bookValue: 180
    }));

    const pickRes = selectMasterPrimePick(weakMarketStocks, {}, {}, { forceRecalculate: true });
    assert.equal(pickRes.breadthCheck.cashDefenseActive, true, 'Fixture should trigger cashDefenseActive=true');
    assert.equal(pickRes.cashDefenseActive, true, 'selectMasterPrimePick must not flip cashDefenseActive to false when breadth defense is active');
    assert.equal(pickRes.primeDailyPick, null, 'Prime pick must be null during cash defense mode');

    const guruSrc = readRepoFile('src/utils/guruEngine.js');
    assert.ok(!guruSrc.includes('!primeDailyPick && breadthCheck.cashDefenseActive'), 'guruEngine must not override cashDefenseActive based on primeDailyPick');
    assert.ok(!guruSrc.includes('buyPlans.length > 0 ? buyPlans : validatedPlans'), 'guruEngine must not fall back to unvetted circuit/exhaustion trap plans');

    // MasterProfitEngine compiled test
    const masterMod = await bundleAndImportTs('src/utils/masterProfitEngine.ts', TMP_DIR);
    // Construct a stock with hard reject (e.g. Chase Cap exceeded by >1.5%) in a healthy breadth market
    const bullStocks = Array.from({ length: 10 }, (_, idx) => ({
      symbol: `BULL${idx + 1}`,
      name: `Strong Hydro ${idx + 1}`,
      sector: 'Hydro Power',
      ltp: idx === 0 ? 800 : 400 + idx * 10,
      high52w: idx === 0 ? 810 : 500,
      low52w: 300,
      pChange: idx === 0 ? 11.5 : 2.1, // Parabolic extension triggers Chase Cap hard reject
      volume: 40000,
      turnover: 20000000,
      eps: 25,
      bookValue: 170,
      promoterHolding: 60,
      sharesOutM: 5
    }));
    const evalSingle = masterMod.evaluateMasterStock(bullStocks[0], true, 5);
    assert.equal(evalSingle.isFullyCleared, false, 'Chase-extended stock should not be fully cleared');
    assert.ok(evalSingle.kellyShares === 0 || evalSingle.kellyShares >= 10, 'kellyShares must come from computeMasterPositionSizing');

    const masterReport = masterMod.runMasterGuideAudit(bullStocks, {});
    if (masterReport.crownedWinner) {
      assert.equal(masterReport.crownedWinner.isFullyCleared, true, 'masterProfitEngine must NEVER crown a stock with isFullyCleared=false');
    } else {
      assert.equal(masterReport.compoundSimulation.netProfitAmount, 0, 'Cash defense / no winner must report 0 compound profit, not fake +6500');
      assert.equal(masterReport.compoundSimulation.numTrades, 0);
    }

    const servicesSrc = readRepoFile('src/components/services.tsx');
    assert.ok(!servicesSrc.includes('1.0 + (vol / 50000) * 0.5'), 'PrimePickService must not fabricate RVOL from single-day volume');
    assert.ok(servicesSrc.includes('calculateMultiHorizonTargets(ltp, s.high52w || s.high52, s.low52w || s.low52, atrEst, pCh, sym)'), 'PrimePickService must pass sym to calculateMultiHorizonTargets');
  });

  // ── 5. BUG-096: swingGateEvaluator strict inputs & dynamic R:R sizing ────────
  await test('[BUG-096] swingGateEvaluator enforces EMA20 regime, rejects missing indicators/fundamentals & scores Gate 7 on recommendedQuantity', async () => {
    const { evaluateMarketRegimeGate, evaluateStockSwingGates } = await import('../src/utils/swingGateEvaluator.js');

    const belowEma20Regime = evaluateMarketRegimeGate({
      nepseIndex: 2560,
      nepseEma20: 2590,
      nepseEma50: 2520,
      advancers: 150,
      decliners: 90,
      dailyChangePct: 0.5
    });
    assert.equal(belowEma20Regime.aboveEma20, false);
    assert.equal(belowEma20Regime.passed, false, 'Market regime must fail when NEPSE Index < 20 EMA');

    // Stock missing EMA, RVOL, bookValue, eps, transactions=0 must fail gates cleanly (no 0.97/1.25/120/12 fabrication!)
    const missingDataStock = {
      symbol: 'MISSING',
      ltp: 500,
      pChange: 3.0,
      volume: 60000,
      turnover: 30000000,
      transactions: 0,
      isBreakout: true,
      bcr3BuyPct: 40
    };
    const missingRes = evaluateStockSwingGates(missingDataStock, { passed: true });
    assert.equal(missingRes.allGatesPassed, false);
    assert.equal(missingRes.gates[0].passed, false, 'Gate 1 must fail when EMA20/EMA50 missing');
    assert.equal(missingRes.gates[2].passed, false, 'Gate 3 must fail when transactions === 0');
    assert.equal(missingRes.gates[3].passed, false, 'Gate 4 must fail when RVOL is missing without NR7/T2 setup');
    assert.equal(missingRes.gates[4].passed, false, 'Gate 5 must fail when bookValue/eps fundamentals are missing');

    // High-price / tiny lot: 100K capital, 1% risk = Rs 1000, RBCL ltp=14000 -> 0 affordable 10-kitta lots -> must fail Gate 7 with recommendedQuantity=0
    const rbclSwing = evaluateStockSwingGates({
      symbol: 'RBCL',
      ltp: 14000,
      pChange: 2.0,
      volume: 500,
      turnover: 7000000,
      transactions: 80,
      ema20: 13500,
      ema50: 13000,
      rvol: 1.8,
      isBreakout: true,
      bookValue: 800,
      eps: 120,
      bcr3BuyPct: 45
    }, { passed: true }, { accountCapital: 100000, riskPerTradePct: 1.0 });
    assert.equal(rbclSwing.plan.recommendedQuantity, 0, 'Unaffordable <10 kitta order must yield recommendedQuantity: 0');
    assert.equal(rbclSwing.gates[6].passed, false, 'Gate 7 must fail when recommendedQuantity === 0');
  });

  // ── 6. BUG-095: Canonical equity filter + ShortTermProfitPlan strict floors ─
  await test('[BUG-095] nepseEquityFilter rejects mutual funds/debentures while preserving CITY/HATHY/NMBMF/SWMF, and ShortTermProfitPlan drops bypasses', async () => {
    const { isMutualFundOrDebenture, isPureNepseEquity } = await import('../src/utils/nepseEquityFilter.js');

    for (const bad of ['KSY', 'RSY', 'CSY', 'NSY', 'GSY', 'HLICF', 'SLCF', 'SBCF', 'NICFC', 'NIBLSTF', 'C30MF', 'NBF2', 'NBF3', 'SIGS3', 'MNMF1', 'ADBLD83', 'EBLD85', 'GBILD84/85']) {
      assert.equal(isMutualFundOrDebenture(bad, 'Commercial Banks', bad, 9.5), true, `${bad} must be excluded as non-equity`);
      assert.equal(isPureNepseEquity({ symbol: bad, ltp: 9.5 }), false, `${bad} must fail isPureNepseEquity`);
    }

    for (const good of [
      { sym: 'CITY', sec: 'Hotels And Tourism', ltp: 620 },
      { sym: 'HATHY', sec: 'Investment', ltp: 1150 },
      { sym: 'NMBMF', sec: 'Microfinance', ltp: 680 },
      { sym: 'SWMF', sec: 'Microfinance', ltp: 710 },
      { sym: 'NABIL', sec: 'Commercial Banks', ltp: 510 },
      { sym: 'SADBL', sec: 'Development Banks', ltp: 385 }
    ]) {
      assert.equal(isMutualFundOrDebenture(good.sym, good.sec, good.sym, good.ltp), false, `${good.sym} must NOT be excluded as non-equity`);
      assert.equal(isPureNepseEquity({ symbol: good.sym, sector: good.sec, ltp: good.ltp }), true, `${good.sym} must pass isPureNepseEquity`);
    }

    const stppSrc = readRepoFile('src/components/ShortTermProfitPlan.jsx');
    assert.ok(!stppSrc.includes('|| ltp >= 150'), 'ShortTermProfitPlan must remove || ltp >= 150 liquidity bypass');
    assert.ok(!stppSrc.includes('live?.bookValue ?? live?.bvps ?? 100'), 'ShortTermProfitPlan must not default missing bookValue to 100');
    assert.ok(!stppSrc.includes('ltp: 300'), 'ShortTermProfitPlan must remove fabricated ltp: 300 fallback');
  });

  // ── 7. BUG-112: floorsheetHubEngine removes synthetic L2 & oldest-candle split ─
  await test('[BUG-112] floorsheetHubEngine returns DEPTH_UNAVAILABLE with empty bids/asks when L2 missing and uses newest candles without 52/48 split', async () => {
    const fhMod = await bundleAndImportTs('src/services/floorsheet/floorsheetHubEngine.ts', TMP_DIR);

    const depthRes = fhMod.resolveMarketDepthWithFloorsheetFallback({
      liveDepth: null,
      verifiedPrice: 385,
      contracts: [
        { contractNo: '1', tradeTime: '14:00:00', buyerBroker: '58', sellerBroker: '35', kitta: 500, rate: 385, amount: 192500, aggressor: 'BUY', isInternalCross: false, isWhalePrint: false, isMegaBlock: false }
      ]
    });
    assert.equal(depthRes.source, 'UNAVAILABLE', `Missing live L2 must return UNAVAILABLE, got ${depthRes.source}`);
    assert.equal(depthRes.bids.length, 0, 'Missing live L2 must return empty bids');
    assert.equal(depthRes.asks.length, 0, 'Missing live L2 must return empty asks');

    const candles = Array.from({ length: 15 }, (_, idx) => ({
      date: `2026-10-${String(idx + 1).padStart(2, '0')}`,
      close: 100 + idx,
      high: 101 + idx,
      low: 99 + idx,
      volume: 1000 * (idx + 1)
    }));
    const vp = fhMod.buildVolumeProfileFromFloorsheet([], candles);
    // Must reflect newest 10 candles (prices 105..114), NOT oldest 10 (100..109), and zero fabricated buy/sell split
    assert.ok(vp.nodes.some(n => n.priceBucket === 114), 'buildVolumeProfileFromFloorsheet must slice newest 10 candles (slice(-10))');
    assert.ok(!vp.nodes.some(n => n.priceBucket === 100), 'Oldest candle price 100 must not dominate recent 10-day profile');
    for (const node of vp.nodes) {
      assert.equal(node.buyKitta, 0, 'Candle fallback must not fabricate 52% buyKitta');
      assert.equal(node.sellKitta, 0, 'Candle fallback must not fabricate 48% sellKitta');
    }
  });

  // ── 8. BUG-113: backtestEngine buy-fee basis & calendar CGT + Screen guard ─
  await test('[BUG-113] backtestEngine includes buy fees in costBasis/commissionPaid and computes >365 calendar day CGT; BacktestReportScreen stops NABIL reset', async () => {
    const { runComprehensiveBacktest } = await import('../src/utils/signals/backtestEngine.js');

    // Generate 300 trading sessions spanning > 370 calendar days (e.g. from 2025-05-01 through 2026-06-20)
    const candles = [];
    let d = new Date('2025-05-01T12:00:00Z');
    let price = 400;
    for (let i = 0; i < 420; i++) {
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        // Gentle flat base then sharp breakout near end so holding > 365 calendar days is possible if entered early
        const idx = candles.length;
        if (idx >= 20 && idx < 22) price += 15;
        else if (idx === 260) price = 480;
        else price += 0.25;
        candles.push({
          date: d.toISOString().slice(0, 10),
          open: +(price - 1).toFixed(1),
          high: +(price + 2).toFixed(1),
          low: +(price - 2).toFixed(1),
          close: +price.toFixed(1),
          volume: 45000,
          turnover: 45000 * price
        });
      }
      d = new Date(d.getTime() + 86400000);
    }

    const res = runComprehensiveBacktest({
      symbol: 'BTTEST',
      sector: 'Commercial Banks',
      candles,
      fundamentalData: { eps: 28, bookValue: 190 },
      initialCapital: 1000000
    });
    assert.ok(Array.isArray(res.closedTrades));
    if (res.closedTrades.length > 0) {
      const t = res.closedTrades[0];
      const grossDiff = (t.exitPrice - t.entryPrice) * t.shares;
      // With both buy + sell commission/SEBON/DP in costBasis, net realizedPnl must be strictly lower than grossDiff - sell-only fees
      assert.ok(t.buyFeesPaid > 0, 'Closed trade must record buyFeesPaid (> 0)');
      assert.ok(t.commissionPaid >= t.buyFeesPaid * 0.4, 'commissionPaid must include buy + sell brokerage');
      assert.ok(t.realizedPnl < grossDiff, 'realizedPnl must deduct buy & sell fees');
    }

    const beSrc = readRepoFile('src/utils/signals/backtestEngine.js');
    assert.ok(!beSrc.includes('const isLongTerm = holdSessions > 365'), 'backtestEngine must not confuse holdSessions with calendar days for CGT');
    assert.ok(beSrc.includes('calendarDays > 365'), 'backtestEngine must evaluate > 365 calendar days for long-term CGT');

    const brSrc = readRepoFile('src/components/BacktestReportScreen.tsx');
    assert.ok(!brSrc.includes('FALLBACK_METRICS'), 'BacktestReportScreen must remove silent FALLBACK_METRICS swap');
    assert.ok(!brSrc.includes("runBacktest('NABIL');\n      })\n      .catch(() => runBacktest('NABIL'));\n  }, [runBacktest])"), 'BacktestReportScreen must not re-run NABIL on every symbol/capital change');
    assert.ok(brSrc.includes('AbortController'), 'BacktestReportScreen must abort overlapping requests');
  });

  // ── 9. BUG-072, BUG-073, BUG-074, BUG-079: StockDetailModal & StockBrokerAnalysisTab ─
  await test('[BUG-072/073/074/079] StockDetailModal & StockBrokerAnalysisTab fix negative sign, ALL_TIME distributors, peer history & pollTimer cleanup', () => {
    const modalSrc = readRepoFile('src/components/StockDetailModal.jsx');
    // BUG-072: losing session badge must emit '-' before changeVal/pChangeVal
    assert.ok(modalSrc.includes("▼ -${fmt(Math.abs(changeVal))} (-${Math.abs(pChangeVal).toFixed(2)}%)"), 'StockDetailModal pChange badge must display minus sign for negative % changes');
    // BUG-073: ALL_TIME distList must read allTimeBrokerAnalysis distributors before brokerConcentration
    assert.ok(!modalSrc.includes("'NET ACCUMULATION (43S since 2026-08-27)'"), 'Remove hardcoded 43S session count literal');
    assert.ok(modalSrc.includes('allTimeBrokerAnalysis?.topDistributors'), 'ALL_TIME distributor column must read allTimeBrokerAnalysis distributors');
    // BUG-074: no fabricated multipliers = [1.2, 1.8, 3.2, 5.5, 8.2, 12.0], peer history passed to calculateStockMetrics
    assert.ok(!modalSrc.includes('[1.2, 1.8, 3.2, 5.5, 8.2, 12.0]'), 'Compare Peers must not fabricate multi-day returns from multipliers');
    assert.ok(modalSrc.includes('effectivePeerHist') && modalSrc.includes('calculateStockMetrics(s2, effectivePeerHist)'), 'Compare Peers must pass real peerPriceHistory to calculateStockMetrics');
    // BUG-079: StockBrokerAnalysisTab pollTimer hoisted outside .then() and cancelled on symbol switch
    const baSrc = readRepoFile('src/components/StockBrokerAnalysisTab.jsx');
    assert.ok(!baSrc.includes('return () => clearTimeout(pollTimer);'), 'pollTimer cleanup must not be returned inside .then() where it is ignored');
    assert.ok(baSrc.includes('clearTimeout(pollTimer)'), 'pollTimer must be cleared in outer useEffect cleanup');
  });

  // ── 10. BUG-078: StockInformationHubModal circuits, proxy base & real fundamentals ─
  await test('[BUG-078] StockInformationHubModal computes circuits from dailyPrevClose, uses getProxyBase() & real fundamentals', () => {
    const hubSrc = readRepoFile('src/components/StockInformationHubModal.tsx');
    assert.ok(!hubSrc.includes("fetch('/api/reconciliation/latest')"), 'StockInformationHubModal must prefix /api/reconciliation/latest with getProxyBase()');
    assert.ok(!hubSrc.includes('fetch(`/api/stocks/${encodeURIComponent(resolvedSymbol)}/promoter-lockin`)'), 'StockInformationHubModal must prefix promoter-lockin with getProxyBase()');
    assert.ok(hubSrc.includes('getCircuitLimits(dailyPrevClose'), 'Circuits must be computed from dailyPrevClose, not ltp');
    assert.ok(!hubSrc.includes('telemetry.fundamentals?.eps ?? 22'), 'Must not hardcode eps=22 fallback');
    assert.ok(!hubSrc.includes('telemetry.fundamentals?.bookValue ?? 180'), 'Must not hardcode bookValue=180 fallback');
  });

  // ── 11. BUG-092: SwingTradeSelectorView valid import & live regime/paper state ─
  await test('[BUG-092] SwingTradeSelectorView imports STATUTORY_CHARGES, drops 2615.4 & 5 mock stocks, wires live paper state', () => {
    const swingSrc = readRepoFile('src/components/swing/SwingTradeSelectorView.tsx');
    assert.ok(!swingSrc.includes('STATUTORY_FRICTIONS'), 'Must replace non-existent STATUTORY_FRICTIONS import');
    assert.ok(swingSrc.includes('STATUTORY_CHARGES'), 'Must import STATUTORY_CHARGES from marketRules.js');
    assert.ok(!swingSrc.includes('2615.4'), 'Must remove hardcoded 2615.4 NEPSE index literal');
    assert.ok(!swingSrc.includes("volume: 150000, turnover: 31500000, bookValue: 92, eps: -2.5"), 'Must remove 5-stock mock fallback array');
    assert.ok(swingSrc.includes('getPaperState'), 'SwingTradeSelectorView Paper tab must read real getPaperState()');
  });

  // ── 12. BUG-097: EntryExitAnalyzer post-3PM bar retention & cancellation ─────
  await test('[BUG-097] EntryExitAnalyzer retains post-3PM closed session bar and prevents async symbol contamination', () => {
    const eeSrc = readRepoFile('src/components/EntryExitAnalyzer.tsx');
    assert.ok(!eeSrc.includes('(curMkt.isEmergencyHalt || !curMkt.isOpen || isZeroVol)'), 'Must not delete completed post-3PM bar via !curMkt.isOpen');
    assert.ok(eeSrc.includes('setFundamentals(null)'), 'Must clear previous fundamentals immediately on symbol switch');
    assert.ok(eeSrc.includes('loadSeqRef'), 'Must guard async analysis fetches with monotonic sequence ref');
  });

  // ── 13. BUG-110, BUG-111, BUG-114, BUG-115, BUG-116, BUG-117 ─────────────────
  await test('[BUG-110] BrokerFlowDominanceService net_sellers requires netKitta < 0 and reads avgSellRate first', () => {
    const bfdSrc = readRepoFile('src/components/BrokerFlowDominanceService.tsx');
    const fnBlock = bfdSrc.slice(bfdSrc.indexOf('const isNetMode = brokerWiseTab'), bfdSrc.indexOf('const isNetMode = brokerWiseTab') + 950);
    assert.ok(fnBlock.includes('netKitta < 0'), 'net_sellers must strictly require netKitta < 0');
    assert.ok(fnBlock.includes('isSellMode'), 'avgRate selection must branch on isSellMode to prefer avgSellRate');
  });

  await test('[BUG-111] MinerviniLeaderboard filters pure equities, avoids fake 52W passing defaults, aligns OAMI footer & null DPI', () => {
    const minSrc = readRepoFile('src/components/MinerviniLeaderboard.tsx');
    assert.ok(minSrc.includes('isPureNepseEquity'), 'MinerviniLeaderboard must filter via isPureNepseEquity');
    assert.ok(!minSrc.includes('s.low52w || ltp * 0.70'), 'Must not fabricate 0.70x 52W low auto-passing C4/C5');
    assert.ok(!minSrc.includes('s.high52w || ltp * 1.15'), 'Must not fabricate 1.15x 52W high auto-passing C3');
    assert.ok(!minSrc.includes('OAMI = 40% Stealth + 35% Volume-Z + 25% Momentum'), 'Footer must match actual 35/30/20/15 OAMI formula');
    assert.ok(!minSrc.includes('Number(s.dpi)) : s.oami'), 'Missing DPI must render — rather than falling back to OAMI');
  });

  await test('[BUG-114] PaperTradingJournalScreen uses getProxyBase() and surfaces errors instead of swallowing', () => {
    const ptjSrc = readRepoFile('src/components/PaperTradingJournalScreen.tsx');
    assert.ok(ptjSrc.includes('getProxyBase'), 'PaperTradingJournalScreen must use getProxyBase()');
    assert.ok(!ptjSrc.includes("fetch('/api/paper-trading/state')"), 'Relative /api/paper-trading/state call must be prefixed with getProxyBase()');
    assert.ok(ptjSrc.includes('setError(') && !ptjSrc.includes(".then(r => r.json()).catch(() => null)"), 'Must surface HTTP/fetch failures via setError instead of silent .catch(() => null)');
  });

  await test('[BUG-115] FibonacciCalculatorService handles downtrend bounce golden pocket/labels and guards div-by-zero LTP', () => {
    const fibSrc = readRepoFile('src/components/FibonacciCalculatorService.tsx');
    assert.ok(fibSrc.includes('currentLtp > 0 ? ((minD / currentLtp) * 100)'), 'Must guard division by currentLtp <= 0');
    assert.ok(fibSrc.includes("trend === 'up'") && fibSrc.includes('lowPrice + diff * 0.618'), 'Golden Pocket and inGoldenZone must branch on downtrend bounce');
    assert.ok(fibSrc.includes('Potential downside:'), 'Downtrend extensions must render Potential downside label');
  });

  await test('[BUG-116 & BUG-117] services.tsx skips WeakMap caching of pending metrics, passes stocks to CompareStocks, and filters SectorHeatmap equities', () => {
    const srvSrc = readRepoFile('src/components/services.tsx');
    // BUG-116: CompareStocks passes stocks prop & does not cache pending metrics in tfMetricsCache
    const pendingIdx = srvSrc.indexOf('isHistoryPending: true');
    const tailAfterPending = srvSrc.slice(pendingIdx, pendingIdx + 900);
    assert.ok(!tailAfterPending.includes('tfMetricsCache.set(stock, result)'), 'Must NEVER cache isHistoryPending: true metrics into WeakMap');
    assert.ok(!srvSrc.includes('a: `${sa.technicalScore}/100`'), 'CompareStocks must guard undefined technicalScore instead of printing undefined/100');
    assert.ok(!srvSrc.includes('a: `Rs. ${(sa.marketCap / 1e9).toFixed(2)}B`'), 'CompareStocks must guard missing marketCap instead of printing Rs. NaNB');
    assert.ok(srvSrc.includes('<StockSearchSelect value={a} onChange={setA} stocks={stocks}'), 'CompareStocks must pass stocks prop to StockSearchSelect A');
    assert.ok(srvSrc.includes('<StockSearchSelect value={b} onChange={setB} stocks={stocks}'), 'CompareStocks must pass stocks prop to StockSearchSelect B');

    // BUG-117: SectorHeatmapService respects activeDate, excludes non-equities, excludes pending 1D extrapolation & guards async races
    assert.ok(srvSrc.includes('isPureNepseEquity'), 'services.tsx must filter SectorHeatmapService via isPureNepseEquity');
    assert.ok(srvSrc.includes('computeStockTimeframeMetrics(s, activeDate)'), 'SectorHeatmapService must pass activeDate to computeStockTimeframeMetrics');
    assert.ok(srvSrc.includes('heatmapSeqRef'), 'SectorHeatmapService must guard async loads against race overwrites');
  });
} finally {
  if (origLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = origLocalStorage;
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\n==============================================================`);
console.log(`BATCH 3 RESULTS: ${passed} passed, ${failed} failed (total ${passed + failed})`);
console.log(`==============================================================\n`);
process.exit(failed > 0 ? 1 : 0);
