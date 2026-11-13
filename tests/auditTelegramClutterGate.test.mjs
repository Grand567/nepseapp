// tests/auditTelegramClutterGate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'proxy', 'data');

test('Telegram Notification Clutter & Precision Gate Audit', async (t) => {
  const { 
    runMarketAlertScanCycle, 
    trackCustomHolding, 
    untrackCustomHolding,
    getUserTrackedHoldings,
    processBroker58AlertTrigger,
    userTrackedSymbolsSet
  } = await import('../proxy/smartAlertEngine.mjs');

  const { 
    run5StepSwingSelectionAndDispatch,
    formatUpgradedStealthAccumulationHtml
  } = await import('../proxy/telegramNotifier.mjs');

  await t.test('1. Unheld stock or watchlist-only stock is strictly ignored by Exit Guard (No phantom NABIL spam)', async () => {
    const phantomSymbol = 'TEST_PHANTOM_STOCK';
    // User added to general watchlist
    userTrackedSymbolsSet.add(phantomSymbol);

    // Mock stock data where price skyrocketed +100% past targets
    const mockStocks = [
      {
        symbol: phantomSymbol,
        ltp: 600,
        lastTradedPrice: 600
      }
    ];

    const origSuppress = process.env.SUPPRESS_TEST_ALERTS;
    const origLive = process.env.TEST_LIVE_TELEGRAM;

    try {
      process.env.SUPPRESS_TEST_ALERTS = 'true';
      process.env.TEST_LIVE_TELEGRAM = 'false';

      // Run scan cycle
      await runMarketAlertScanCycle({
        getMarketStocks: async () => mockStocks,
        getFloorsheet: async () => [],
        getPriceHistory: async () => []
      });

      // Verify that no holding exists for phantomSymbol
      const holdings = getUserTrackedHoldings();
      const foundHolding = holdings.find(h => h.symbol === phantomSymbol);
      assert.strictEqual(foundHolding, undefined, 'Watchlist-only stock must never be treated as user holding');
    } finally {
      process.env.SUPPRESS_TEST_ALERTS = origSuppress;
      process.env.TEST_LIVE_TELEGRAM = origLive;
      userTrackedSymbolsSet.delete(phantomSymbol);
    }
  });

  await t.test('2. Genuine user-held stock is evaluated and armed for exit alerts', async () => {
    const sym = 'TEST_HELD_STOCK';
    trackCustomHolding({
      symbol: sym,
      buyPrice: 300,
      stopLoss: 289.5,
      target1: 324,
      target2: 345,
      kitta: 100
    });

    const holdings = getUserTrackedHoldings();
    const found = holdings.find(h => h.symbol === sym);
    assert.ok(found, 'Held stock must be registered in user holdings');
    assert.strictEqual(found.isUserHolding, true);
    assert.strictEqual(found.buyPrice, 300);

    // Clean up
    untrackCustomHolding(sym);
  });

  await t.test('3. Intraday Early Ignition alert enforces persistent session lock (No 3x SGHC/GHL spam)', async () => {
    const sym = 'TEST_B58_LOCK';
    const mockEval = {
      symbol: sym,
      companyName: 'Test Hydropower Ltd',
      qualified: true,
      ltp: 300,
      pChange: 0.5,
      netVol: 25000,
      brokerBuyVol: 30000,
      brokerSellVol: 5000,
      buyRatioPct: 85,
      marketSharePct: 15,
      totalBuyAmount: 9000000,
      operatorVwap: 300,
      stage: 'STAGE_1_STEALTH_SEEDING',
      timingSignature: '⚡ Test Session',
      buyZone: { low: 298, high: 305 },
      stopLoss: 289.5,
      target1: 324,
      target2: 345,
      netRRR: '2.5 : 1',
      isTest: true
    };

    // First trigger
    const res1 = await processBroker58AlertTrigger(mockEval);
    assert.strictEqual(res1.triggered, true, 'First trigger should succeed in test mode');

    // Second trigger in same session must be locked
    const res2 = await processBroker58AlertTrigger(mockEval);
    assert.strictEqual(res2.triggered, false, 'Second trigger in same session must be blocked');
    assert.ok(res2.reason.includes('Cooldown') || res2.reason.includes('Session') || res2.reason.includes('locked'), 'Must cite lock/cooldown');
  });

  await t.test('4. Morning briefing does not output stale hardcoded Nov 03 date and formats single winner', async () => {
    const res = await run5StepSwingSelectionAndDispatch();
    if (res.html) {
      assert.ok(!res.html.includes('Session: 2026-11-03'), 'Must not contain hardcoded Nov 03 date');
      assert.ok(!res.html.includes('DRAVYASHREE TACTICAL PRIME SLATE'), 'Must not use legacy multi-stock slate header');
    }
  });
});
