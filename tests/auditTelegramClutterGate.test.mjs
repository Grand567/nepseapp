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
    formatUpgradedStealthAccumulationHtml,
    formatEodStealthOfTheDayHtml,
    dispatchEodStealthAccumulationOfTheDay,
    auditMultiSessionTrapRisk
  } = await import('../proxy/telegramNotifier.mjs');

  const { requirePortfolioAuth, DEFAULT_APP_PORTFOLIO_KEY } = await import('../proxy/middleware/requirePortfolioAuth.mjs');

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

  await t.test('5. Mobile app sync request with default key succeeds (HTTP 200), unauthenticated gets HTTP 401', async () => {
    function mockResponse() {
      return {
        statusCode: 200,
        jsonBody: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.jsonBody = data;
          return this;
        }
      };
    }

    // A: Mobile App request with default app portfolio key
    const reqMobile = {
      ip: '198.51.100.55',
      headers: {
        'x-portfolio-key': DEFAULT_APP_PORTFOLIO_KEY
      }
    };
    const resMobile = mockResponse();
    let mobileNextCalled = false;
    requirePortfolioAuth(reqMobile, resMobile, () => { mobileNextCalled = true; });
    assert.strictEqual(mobileNextCalled, true, 'Mobile app request with default key must pass authorization');

    // B: External attacker with no key
    const reqNoKey = {
      ip: '198.51.100.55',
      headers: {}
    };
    const resNoKey = mockResponse();
    let noKeyNextCalled = false;
    requirePortfolioAuth(reqNoKey, resNoKey, () => { noKeyNextCalled = true; });
    assert.strictEqual(noKeyNextCalled, false, 'Unauthenticated public request must be blocked');
    assert.strictEqual(resNoKey.statusCode, 401, 'Must return HTTP 401 Unauthorized');
    assert.ok(resNoKey.jsonBody?.error?.includes('Unauthorized'), 'Must return Unauthorized error message');

    // C: Fraudulent key
    const reqBadKey = {
      ip: '198.51.100.55',
      headers: {
        'x-portfolio-key': 'attacker-fake-key-1234'
      }
    };
    const resBadKey = mockResponse();
    let badKeyNextCalled = false;
    requirePortfolioAuth(reqBadKey, resBadKey, () => { badKeyNextCalled = true; });
    assert.strictEqual(badKeyNextCalled, false, 'Fraudulent key must be blocked');
    assert.strictEqual(resBadKey.statusCode, 403, 'Must return HTTP 403 Forbidden');
  });

  await t.test('6. formatEodStealthOfTheDayHtml outputs clean single EOD stealth report with 5-day footprint', async () => {
    const mockWinner = {
      symbol: 'TEST_STEALTH',
      companyName: 'Test Stealth Power Co.',
      ltp: 350.0,
      day_pchange: 1.2,
      operator_vwap: 348.5,
      buy_vol: 25000,
      net_vol: 22000,
      buy_ratio: 88.0,
      mkt_share: 18.5,
      multiDayNetVol: 85000,
      multiDayBuyVol: 92000,
      multiDayBuyAmtCr: '3.15',
      multiDayBuyRatio: 84.5,
      multiDayMarketShare: 16.2,
      multiDayActiveDays: 5,
      rangeCompressionPct: 2.8,
      baseLow: 345.0,
      baseHigh: 355.0,
      ignitionHorizon: '1–2 Days (Supply Vacuum Stage 2 Complete)'
    };

    const mockRunnerUps = [
      { symbol: 'RUNNER1', ltp: 280, multiDayBuyRatio: 78, multiDayNetVol: 45000 },
      { symbol: 'RUNNER2', ltp: 410, multiDayBuyRatio: 74, multiDayNetVol: 38000 }
    ];

    const html = formatEodStealthOfTheDayHtml(mockWinner, mockRunnerUps, '2026-11-13');
    assert.ok(html.includes('EOD STEALTH ACCUMULATION OF THE DAY'), 'Must contain EOD Stealth of the Day header');
    assert.ok(html.includes('TEST_STEALTH'), 'Must contain top winner symbol');
    assert.ok(html.includes('5-DAY INSTITUTIONAL FOOTPRINT (Broker #58)'), 'Must include 5-day footprint section');
    assert.ok(html.includes('85,000 Net Kitta'), 'Must format multi-day net kitta');
    assert.ok(html.includes('Rs. 3.15 Crores'), 'Must format multi-day capital outlay');
    assert.ok(html.includes('Secondary Stealth Candidates'), 'Must include compact runner-up table');
    assert.ok(html.includes('RUNNER1'), 'Must include runner up 1');
  });

  await t.test('7. 2-Day Dip Invalidation Rule (3 Consecutive Red Days Veto) vetoes falling setups', async () => {
    // Mock DB that returns 3 consecutive lower closes
    const mockDbFalling = {
      prepare(sql) {
        return {
          all(...args) {
            if (sql.includes('daily_stock_summary')) {
              return [
                { trade_date: '2026-11-13', open_price: 380, close_price: 360 }, // Day 0
                { trade_date: '2026-11-12', open_price: 400, close_price: 385 }, // Day 1
                { trade_date: '2026-11-11', open_price: 420, close_price: 405 }, // Day 2
                { trade_date: '2026-11-10', open_price: 415, close_price: 420 }, // Day 3
              ];
            }
            if (sql.includes('SELECT DISTINCT trade_date')) {
              return [{ trade_date: '2026-11-13' }, { trade_date: '2026-11-12' }, { trade_date: '2026-11-11' }, { trade_date: '2026-11-10' }];
            }
            return [];
          },
          get(...args) {
            return null;
          }
        };
      }
    };

    const auditFalling = auditMultiSessionTrapRisk(mockDbFalling, 'TEST_FALLING_STOCK');
    assert.strictEqual(auditFalling.isTrap, true, 'Stock with 3 consecutive down sessions must be flagged as trap');
    assert.strictEqual(auditFalling.verdict, 'THREE_CONSECUTIVE_RED_DAYS_VETO', 'Verdict must be THREE_CONSECUTIVE_RED_DAYS_VETO');
    assert.ok(auditFalling.reason.includes('3-Day Dip Invalidation'), 'Reason must cite 3-Day Dip Invalidation');

    // Mock DB that rebounds on Day 2 (healthy institutional dip)
    const mockDbHealthy = {
      prepare(sql) {
        return {
          all(...args) {
            if (sql.includes('daily_stock_summary')) {
              return [
                { trade_date: '2026-11-13', open_price: 405, close_price: 415 }, // Day 0: Rebound!
                { trade_date: '2026-11-12', open_price: 410, close_price: 402 }, // Day 1: Dip
                { trade_date: '2026-11-11', open_price: 420, close_price: 412 }, // Day 2: Dip
              ];
            }
            if (sql.includes('SELECT DISTINCT trade_date')) {
              return [{ trade_date: '2026-11-13' }, { trade_date: '2026-11-12' }, { trade_date: '2026-11-11' }];
            }
            if (sql.includes('daily_broker_ledger')) {
              return [
                { trade_date: '2026-11-11', buy_vol: 10000, sell_vol: 1000, buy_amt: 4100000, net_vol: 9000 },
                { trade_date: '2026-11-12', buy_vol: 8000, sell_vol: 500, buy_amt: 3200000, net_vol: 7500 },
                { trade_date: '2026-11-13', buy_vol: 15000, sell_vol: 2000, buy_amt: 6200000, net_vol: 13000 },
              ];
            }
            return [];
          },
          get(...args) {
            return { broker_id: 58, net_vol: 29500 };
          }
        };
      }
    };

    const auditHealthy = auditMultiSessionTrapRisk(mockDbHealthy, 'TEST_HEALTHY_STOCK', 58);
    assert.strictEqual(auditHealthy.isTrap, false, 'Stock with healthy rebound must not be flagged as 3-day dip trap');
  });
});
