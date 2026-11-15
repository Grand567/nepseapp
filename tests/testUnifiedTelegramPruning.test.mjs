// tests/testUnifiedTelegramPruning.test.mjs
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

test('Unified Max-Profit Telegram Pruning & Consolidation Audit', async (t) => {
  const {
    dispatchTop5Broker58Breakouts,
    formatUpgradedStealthAccumulationHtml,
    select5StepSwingPicks,
    sendTelegramSmartAlert,
    sendTelegramNewsAlert,
    sendTelegramIpoAlert,
    auditMultiSessionTrapRisk,
    evaluateLoopholeProtectedSmcSetup
  } = await import('../proxy/telegramNotifier.mjs');

  await t.test('1. dispatchTop5Broker58Breakouts delegates to live 5-Step Swing pipeline without hardcoded Nov 13 static slate', async () => {
    const notifierSource = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'telegramNotifier.mjs'), 'utf8');
    assert.ok(
      !notifierSource.includes('Target Entry:</b> <code>Tuesday, 2026-11-17</code>'),
      'Hardcoded Nov 13/17 static Top 5 slate must be removed'
    );

    const res = await dispatchTop5Broker58Breakouts({ chatId: null });
    assert.ok(res && typeof res === 'object', 'dispatchTop5Broker58Breakouts must return a result object');
    assert.ok(res.message && typeof res.message === 'string', 'Must return formatted HTML message from live selection');
    assert.ok(
      !res.message.includes('2026-11-13') || res.message.includes('DRAVYASHREE TACTICAL PRIME SELECTION') || res.message.includes('CASH PRESERVATION'),
      'Message must come from live run5StepSwingSelectionAndDispatch, not hardcoded static array'
    );
  });

  await t.test('2. formatUpgradedStealthAccumulationHtml & select5StepSwingPicks include real avgBrokerPrice, pocPrice & Top Accumulator details', async () => {
    const sampleHtml = formatUpgradedStealthAccumulationHtml({
      symbol: 'GHL',
      name: 'Ghalemdi Hydro Limited',
      sector: 'Hydro Power',
      ltp: 325.0,
      avgBrokerPrice: 322.4,
      pocPrice: 324.0,
      bcr3Buy: 61.5,
      bcr3Sell: 22.1,
      leadBrokerId: 58,
      leadBrokerName: 'Naasa Securities',
      retention10D: 84,
      vdu: 0.45,
      cmf: 0.21,
      bbw: 9.2,
      corneringScore: 93
    });

    assert.ok(sampleHtml.includes('Average Broker Price (Cost Basis):</b> <b>Rs. 322.4</b>'), 'Must display exact avgBrokerPrice');
    assert.ok(sampleHtml.includes('Volume Profile POC:</b> <b>Rs. 324.0</b>'), 'Must display Volume Profile POC price');
    assert.ok(sampleHtml.includes('Broker #58 (Naasa)'), 'Must display Lead Accumulator details');

    const swingData = await select5StepSwingPicks();
    assert.ok(swingData && Array.isArray(swingData.allQualified), 'select5StepSwingPicks must return allQualified array');
    if (swingData.topPick) {
      assert.ok(swingData.topPick.avgBrokerPrice > 0, 'topPick must include computed avgBrokerPrice');
      assert.ok(swingData.topPick.pocPrice > 0, 'topPick must include computed pocPrice');
      assert.ok(typeof swingData.topPick.bcr3Buy === 'number', 'topPick must include real bcr3Buy');
      assert.ok(typeof swingData.topPick.bcr3Sell === 'number', 'topPick must include real bcr3Sell');
      assert.ok(typeof swingData.topPick.retention10D === 'number', 'topPick must include retention10D');
    }
  });

  await t.test('3. sendTelegramSmartAlert enforces auditMultiSessionTrapRisk veto on trap scrips', async () => {
    const { db } = await import('../proxy/db/ledgerStore.js');
    const symbols = db.prepare('SELECT DISTINCT symbol FROM daily_broker_ledger LIMIT 100').all().map(r => r.symbol);
    const trapSym = symbols.find(s => auditMultiSessionTrapRisk(db, s).isTrap === true);
    assert.ok(trapSym, 'Prerequisite: at least one active trap scrip must exist in daily_broker_ledger');

    const res = await sendTelegramSmartAlert({
      symbol: trapSym,
      ltp: 500.0,
      bcr3AvgPrice: 495.0
    });
    assert.strictEqual(res.success, false, 'sendTelegramSmartAlert must block trap scrip');
    assert.strictEqual(res.isVetoed, true, 'sendTelegramSmartAlert must mark vetoed trap with isVetoed: true');
  });

  await t.test('4. workers.mjs removes duplicate EOD sendTelegramPrimePickAlert & hardcoded pre-open gate auto-trigger', async () => {
    const workersSource = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'workers.mjs'), 'utf8');

    const primePickFnMatch = workersSource.match(/export async function runFullUniversePrimePick\(\)[\s\S]*?^}/m);
    assert.ok(primePickFnMatch, 'runFullUniversePrimePick should exist in workers.mjs');
    assert.ok(
      !primePickFnMatch[0].includes('sendTelegramPrimePickAlert('),
      'runFullUniversePrimePick must NOT redundantly dispatch sendTelegramPrimePickAlert to Telegram'
    );

    const startWorkersMatch = workersSource.match(/export function startWorkers\(\)[\s\S]*$/);
    assert.ok(startWorkersMatch, 'startWorkers should exist in workers.mjs');
    assert.ok(
      !startWorkersMatch[0].includes('runPreOpenGateScan()'),
      'startWorkers must NOT auto-fire runPreOpenGateScan() with hardcoded bid/ask volumes'
    );
  });

  await t.test('5. smartAlertEngine.mjs routes BROKER_58_EARLY_IGNITION through unified sendTelegramSmartAlert', async () => {
    const engineSource = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'smartAlertEngine.mjs'), 'utf8');
    const ignitionBranch = engineSource.match(/else if \(alertPayload\.type === 'BROKER_58_EARLY_IGNITION'\)[\s\S]*?else \{/);
    assert.ok(ignitionBranch, 'BROKER_58_EARLY_IGNITION branch must exist');
    assert.ok(
      ignitionBranch[0].includes('sendTelegramSmartAlert('),
      'BROKER_58_EARLY_IGNITION must route through unified sendTelegramSmartAlert'
    );
    assert.ok(
      !ignitionBranch[0].includes('sendTelegramEarlyIgnitionAlert('),
      'BROKER_58_EARLY_IGNITION must no longer use legacy sendTelegramEarlyIgnitionAlert'
    );
  });

  await t.test('6. scanEmaCrossoverAndSharpBase & runBreakoutScannerAndDispatch enforce 5-day Institutional Ledger & Trap Veto Gate', async () => {
    const { runBreakoutScannerAndDispatch } = await import('../proxy/telegramNotifier.mjs');
    const { scanEmaCrossoverAndSharpBase } = await import('../proxy/smartAlertEngine.mjs');
    const { db } = await import('../proxy/db/ledgerStore.js');

    const latestRow = db.prepare('SELECT MAX(trade_date) as d FROM daily_stock_summary').get();
    const sessionDate = latestRow?.d;
    const rawSetups = await scanEmaCrossoverAndSharpBase({
      lookbackSessions: 10,
      maxSurgePct: 7.5,
      maxBaseRangePct: 9.0,
      sessionDate,
      limit: 12
    });

    assert.ok(Array.isArray(rawSetups) && rawSetups.length > 0, 'scanEmaCrossoverAndSharpBase must find verified institutional breakouts');
    const vetoedSet = new Set(['BPCL', 'PMLI', 'AKJCL', 'SHPC']);
    for (const item of rawSetups) {
      assert.ok(!vetoedSet.has(item.symbol), `Trap/distribution stock ${item.symbol} must be hard-vetoed`);
      assert.strictEqual(item.isTrap, false, `${item.symbol} must not be a multi-session trap`);
      assert.ok(item.operatorVwap > 0, `${item.symbol} must attach real 5D operatorVwap`);
      assert.ok(item.bcr3Buy >= item.bcr3Sell, `${item.symbol} must have BCR3 Buy >= BCR3 Sell`);
      assert.ok(item.bcr3Sell <= 45, `${item.symbol} must respect 45% Seller Dominance Ceiling`);
      assert.ok(item.leadRetentionPct >= 55, `${item.symbol} must have Lead Broker Retention >= 55%`);
    }

    const res = await runBreakoutScannerAndDispatch({ chatId: null });
    assert.strictEqual(res.success, true, 'runBreakoutScannerAndDispatch must succeed');
    assert.ok(res.message && res.message.includes('Zero-Trap Gate'), 'Breakout card must display Zero-Trap Gate status');
    assert.ok(res.message.includes('5D Ledger:'), 'Breakout card must display real 5D Ledger BCR3 & Retention details');
    assert.ok(!res.message.includes('$PMLI') && !res.message.includes('$AKJCL') && !res.message.includes('$BPCL'), 'Breakout message must exclude vetoed traps');
  });

  await t.test('7. select5StepSwingPicks enforces Seller Dominance Ceiling and distinguishes Multi-Track setupModes', async () => {
    const swingData = await select5StepSwingPicks();
    assert.ok(Array.isArray(swingData.allQualified) && swingData.allQualified.length > 0, 'select5StepSwingPicks must surface qualified picks');

    const validModes = new Set([
      'COIL_IGNITION_BREAKOUT',
      'STEALTH_FLOOR_ACCUMULATION',
      'SMC_BREAK_AND_RETEST',
      'SMC_SWEEP_MSS_FVG',
    ]);

    for (const cand of swingData.allQualified) {
      assert.ok(cand.ltp >= 100, `${cand.symbol} must pass >= Rs. 100 Mutual Fund / low-price unit guard`);
      assert.ok(cand.bcr3Sell <= 45.0, `${cand.symbol} must obey Seller Dominance Ceiling <= 45% (got ${cand.bcr3Sell}%)`);
      assert.ok(cand.bcr3Buy >= cand.bcr3Sell, `${cand.symbol} must have BCR3 Buy >= BCR3 Sell (${cand.bcr3Buy}% vs ${cand.bcr3Sell}%)`);
      assert.ok(
        validModes.has(cand.setupMode),
        `${cand.symbol} must declare a valid setupMode (got ${cand.setupMode})`
      );
      assert.ok(
        typeof cand.confidenceLabel === 'string' &&
          (cand.confidenceLabel.includes('COIL IGNITION') ||
            cand.confidenceLabel.includes('STEALTH FLOOR ACCUMULATION') ||
            cand.confidenceLabel.includes('SMC BREAK & RETEST') ||
            cand.confidenceLabel.includes('SMC SWEEP + MSS + FVG')),
        `${cand.symbol} confidenceLabel must reflect setup mode`
      );
    }

    const sampleCoilHtml = formatUpgradedStealthAccumulationHtml({
      symbol: 'NTC',
      name: 'Nepal Telecom',
      sector: 'Others',
      ltp: 940.3,
      avgBrokerPrice: 930.5,
      pocPrice: 932.0,
      bcr3Buy: 70.6,
      bcr3Sell: 26.1,
      leadBrokerId: 52,
      leadBrokerName: 'Sundhara Securities',
      retention10D: 98,
      vdu: 0.52,
      cmf: 0.24,
      bbw: 4.1,
      corneringScore: 98,
      confidenceLabel: '🚀 COIL IGNITION BREAKOUT (v2.0)'
    });
    assert.ok(sampleCoilHtml.includes('COIL IGNITION BREAKOUT (v2.0)'), 'Formatter must preserve COIL IGNITION BREAKOUT badge');
  });

  await t.test('8. evaluateLoopholeProtectedSmcSetup enforces phantom-wick guard, -3.5% SL floor & Break-Retest / FVG rendering', async () => {
    // Build synthetic 22-bar Break & Retest + FVG + phantom low wick (50% outlier clamped by Loophole 1 guard)
    const bars = [];
    for (let i = 0; i < 16; i++) {
      bars.push({
        trade_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        open_price: 500,
        high_price: 506,
        low_price: i === 10 ? 250 : 496, // Phantom wick on bar 10 must be clamped
        close_price: 502,
        total_volume: 15000,
      });
    }
    // Breakout bar (index 16)
    bars.push({ trade_date: '2026-10-17', open_price: 503, high_price: 518, low_price: 502, close_price: 516, total_volume: 30000 });
    // FVG impulse continuation (index 17 & 18 leave gap above 506 -> 514+)
    bars.push({ trade_date: '2026-10-18', open_price: 516, high_price: 530, low_price: 515, close_price: 528, total_volume: 28000 });
    bars.push({ trade_date: '2026-10-19', open_price: 528, high_price: 534, low_price: 520, close_price: 522, total_volume: 12000 });
    // Pullback retest holding pivot ~502 (index 19)
    bars.push({ trade_date: '2026-10-20', open_price: 518, high_price: 520, low_price: 505, close_price: 517, total_volume: 11000 });

    const smc = evaluateLoopholeProtectedSmcSetup(bars, {
      ltp: 517,
      ema20: 508,
      avgBrokerPrice: 510,
      bcr3Buy: 52.0,
      bcr3Sell: 24.0,
      leadRetentionPct: 82,
      isTrap: false,
    });

    assert.strictEqual(smc.isBreakAndRetest, true, 'Must detect multi-day Break & Retest hold');
    assert.ok(smc.smcStopLoss <= Number((517 * 0.965).toFixed(1)), `SL ${smc.smcStopLoss} must maintain >= 3.5% tick buffer (<= ${(517 * 0.965).toFixed(1)})`);
    assert.ok(smc.smcStopLoss >= Number((517 * 0.955).toFixed(1)), `SL ${smc.smcStopLoss} must stay >= 95.5% floor`);
    assert.ok(smc.smcConfluenceBonus >= 8, 'Must grant SMC confluence bonus');
    assert.ok(smc.smcNarrative.includes('Break & Retest'), 'Must format readable SMC narrative');

    // Verify trap stock blocks all SMC detections (Loophole 1 & 5)
    const blockedSmc = evaluateLoopholeProtectedSmcSetup(bars, {
      ltp: 517,
      ema20: 508,
      avgBrokerPrice: 510,
      bcr3Buy: 35.0,
      bcr3Sell: 55.0,
      leadRetentionPct: 40,
      isTrap: true,
    });
    assert.strictEqual(blockedSmc.isBreakAndRetest, false, 'Trap stock must block SMC Break & Retest');
    assert.strictEqual(blockedSmc.smcConfluenceBonus, 0, 'Trap stock must receive 0 SMC bonus');

    const html = formatUpgradedStealthAccumulationHtml({
      symbol: 'NTC',
      name: 'Nepal Telecom',
      sector: 'Others',
      ltp: 517,
      avgBrokerPrice: 510,
      pocPrice: 508,
      bcr3Buy: 52.0,
      bcr3Sell: 24.0,
      leadBrokerId: 52,
      leadRetentionPct: 82,
      stopLoss: smc.smcStopLoss,
      target1: smc.smcTarget1,
      target2: smc.smcTarget2,
      smcNarrative: smc.smcNarrative,
      fvgNarrative: smc.fvgNarrative,
      confidenceLabel: '🎯 SMC BREAK & RETEST (v2.0)',
    });
    assert.ok(html.includes('SMC Structure &amp; Retest:'), 'Alert HTML must render SMC Structure & Retest line');
    assert.ok(html.includes('Fair Value Gap (FVG):'), 'Alert HTML must render Fair Value Gap (FVG) line');
    assert.ok(html.includes('Asymmetrical R:R:'), 'Alert HTML must render Asymmetrical R:R & CAGR target');
  });

  await t.test('9. Stock news, corporate announcements, and IPO alerts are completely suppressed from Telegram', async () => {
    const newsRes = await sendTelegramNewsAlert({
      type: 'DIVIDEND_ALERT',
      symbol: 'NABIL',
      title: 'NABIL announces 10% cash dividend',
      body: 'Approved by AGM.'
    });
    assert.strictEqual(newsRes.success, false, 'sendTelegramNewsAlert must not send to Telegram');
    assert.strictEqual(newsRes.suppressed, true, 'sendTelegramNewsAlert must mark suppressed: true');

    const ipoRes = await sendTelegramIpoAlert({
      symbol: 'GLH',
      title: 'IPO Opens Today',
      body: 'Issue price Rs. 100'
    });
    assert.strictEqual(ipoRes.success, false, 'sendTelegramIpoAlert must not send to Telegram');
    assert.strictEqual(ipoRes.suppressed, true, 'sendTelegramIpoAlert must mark suppressed: true');

    const smartNewsRes = await sendTelegramSmartAlert({
      type: 'NEWS_ALERT',
      symbol: 'NABIL',
      title: 'Breaking Stock News'
    });
    assert.strictEqual(smartNewsRes.success, false, 'sendTelegramSmartAlert must suppress NEWS_ALERT');
    assert.strictEqual(smartNewsRes.suppressed, true, 'sendTelegramSmartAlert must mark NEWS_ALERT suppressed: true');

    const smartIpoRes = await sendTelegramSmartAlert({
      type: 'IPO_ALERT',
      symbol: 'GLH',
      title: 'IPO Open Alert'
    });
    assert.strictEqual(smartIpoRes.success, false, 'sendTelegramSmartAlert must suppress IPO_ALERT');
    assert.strictEqual(smartIpoRes.suppressed, true, 'sendTelegramSmartAlert must mark IPO_ALERT suppressed: true');

    const engineSource = fs.readFileSync(path.join(ROOT_DIR, 'proxy', 'smartAlertEngine.mjs'), 'utf8');
    assert.ok(
      engineSource.includes('if (isNews || isIpo)'),
      'smartAlertEngine.mjs broadcastAlert must explicitly suppress news & IPO Telegram dispatch'
    );
  });
});
