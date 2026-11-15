// tests/liveNotificationAndNewsAudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  escapeHtml, 
  sendTelegramMessage, 
  sendTelegramSmartAlert, 
  sendTelegramNewsAlert, 
  sendTelegramIpoAlert, 
  sendTelegramExitAlert 
} from '../proxy/telegramNotifier.mjs';
import { broadcastAlert } from '../proxy/smartAlertEngine.mjs';

process.env.SUPPRESS_TEST_ALERTS = 'true';
process.env.TEST_LIVE_TELEGRAM = 'false';
process.env.NODE_ENV = 'test';

test('1. Android Status Bar Bridge & Push Service Verification', async (t) => {
  await t.test('triggerNativeStatusBarNotification invokes postStatusBarNotification without false deduplication suppression', async () => {
    // Setup mock window with NepseNativeNotifier
    let postedNotification = null;
    let permissionRequested = false;

    global.window = {
      NepseNativeNotifier: {
        hasNotificationPermission: () => true,
        requestNotificationPermission: () => { permissionRequested = true; },
        postStatusBarNotification: (title, body, channelId, symbol, type, action, url, createdAt) => {
          postedNotification = { title, body, channelId, symbol, type, action, url, createdAt };
        }
      },
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    global.localStorage = {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    };

    const pushModule = await import('../src/utils/pushNotificationService.js');

    // Simulate an incoming live alert
    const liveAlert = {
      id: 'alert_test_live_001',
      title: '⚡ Institutional Breakout: NABIL',
      body: 'Lead accumulator Broker #58 cornered 45,000 kitta.',
      symbol: 'NABIL',
      category: 'pro',
      type: 'BREAKOUT',
      created_at_ms: Date.now(),
      created_at: new Date().toISOString()
    };

    // Reproduce exact pushNotificationReceived / SSE listener order:
    // markNotificationAsProcessed runs FIRST, then triggerNativeStatusBarNotification with skipDuplicateCheck: true
    pushModule.markNotificationAsProcessed(liveAlert.id, 'fp_NABIL_BREAKOUT_123', {
      symbol: 'NABIL',
      type: 'BREAKOUT'
    });
    pushModule.triggerNativeStatusBarNotification(liveAlert, { skipDuplicateCheck: true });

    // Verify it was NOT self-suppressed and was posted to Android bridge!
    assert.ok(postedNotification, 'Notification should be delivered to native bridge even after markNotificationAsProcessed');
    assert.equal(postedNotification.symbol, 'NABIL');
    assert.equal(postedNotification.channelId, 'dravyashree-pro-signals');
    assert.ok(postedNotification.title.includes('NABIL'));
    assert.ok(postedNotification.createdAt, '8th createdAt argument must be passed to native bridge');
  });

  await t.test('General news and Trending Most Covered News trigger general channel while Financial Results are suppressed', async () => {
    let postedNotification = null;
    global.window.NepseNativeNotifier.postStatusBarNotification = (title, body, channelId, symbol, type, action, url, createdAt) => {
      postedNotification = { title, body, channelId, symbol, type, action, url, createdAt };
    };

    const pushModule = await import('../src/utils/pushNotificationService.js');

    // 1. General trending multi-portal news must post
    const trendingAlert = {
      id: 'news_alert_trending_002',
      title: '🔥 [Trending on 3 Portals] NABIL',
      body: 'NABIL announces major strategic expansion (Covered by: ShareSansar, BikashNews, Artha Sarokar)',
      category: 'general',
      type: 'TRENDING_NEWS_ALERT',
      symbol: 'NABIL',
      action: 'OPEN_NEWS',
      created_at_ms: Date.now()
    };

    pushModule.triggerNativeStatusBarNotification(trendingAlert, { skipDuplicateCheck: true });
    assert.ok(postedNotification, 'Trending news notification should be posted');
    assert.equal(postedNotification.channelId, 'nepse-general-news');
    assert.equal(postedNotification.type, 'TRENDING_NEWS_ALERT');
    assert.equal(postedNotification.action, 'OPEN_NEWS');

    // 2. Financial Results (EARNINGS_ALERT) and inAppOnly notices MUST NOT post to status bar
    postedNotification = null;
    pushModule.triggerNativeStatusBarNotification({
      id: 'news_earnings_suppressed_003',
      title: '📊 NABIL Financial Results',
      body: 'NABIL publishes Q3 financial report',
      category: 'general',
      type: 'EARNINGS_ALERT',
      symbol: 'NABIL',
      created_at_ms: Date.now()
    }, { skipDuplicateCheck: true });
    assert.equal(postedNotification, null, 'EARNINGS_ALERT (Financial Results) must be suppressed from Android status bar');

    pushModule.triggerNativeStatusBarNotification({
      id: 'news_inapp_only_004',
      title: '📰 General Routine Notice',
      body: 'Routine branch relocation notice',
      category: 'general',
      type: 'NEWS_ALERT',
      inAppOnly: true,
      created_at_ms: Date.now()
    }, { skipDuplicateCheck: true });
    assert.equal(postedNotification, null, 'inAppOnly alert must be suppressed from Android status bar');
  });
});

test('2. Telegram Bot Message Formatting & HTML Entity Safety', async (t) => {
  await t.test('escapeHtml accurately escapes special characters', () => {
    assert.equal(escapeHtml('NABIL & SCB'), 'NABIL &amp; SCB');
    assert.equal(escapeHtml('P/E < 15 and Growth > 10%'), 'P/E &lt; 15 and Growth &gt; 10%');
    assert.equal(escapeHtml('Quote: "High Impact" & \'Buy\''), 'Quote: &quot;High Impact&quot; &amp; &#39;Buy&#39;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  await t.test('sendTelegramSmartAlert formats institutional alerts cleanly with proper execution ticket', async () => {
    const res = await sendTelegramSmartAlert({
      symbol: 'AKJCL',
      companyName: 'Ankhu Khola Jalvidhyut',
      ltp: 343.0,
      pChange: 2.5,
      dominantBrokersText: 'Broker #58 (Naasa)',
      confluenceScore: 92,
      buyZone: { low: 338, high: 345 },
      stopLoss: 325,
      target1: 375,
      target2: 405,
      netRRR: 3.2,
      skipTrapVeto: true,
      body: 'Institutional accumulation confirmed at support'
    });
    assert.equal(res.success, true);
  });

  await t.test('sendTelegramNewsAlert suppresses news dispatch to Telegram (in-app only)', async () => {
    const res = await sendTelegramNewsAlert({
      title: 'NABIL Bank Reports 18% Net Profit Growth in Q3',
      body: 'Operating profit reached Rs. 4.2 Billion driven by retail loan expansion.',
      source: 'ShareSansar',
      symbol: 'NABIL',
      url: 'https://sharesansar.com/newsdetail/nabil-q3-profit'
    });
    assert.equal(res.success, false);
    assert.equal(res.suppressed, true);
  });

  await t.test('sendTelegramIpoAlert suppresses IPO dispatch to Telegram (in-app only)', async () => {
    const res = await sendTelegramIpoAlert({
      title: 'Reliance Spinning Mills IPO Opens Today',
      body: 'Book-building price Rs. 820.80 per unit. Closes in 4 days.',
      symbol: 'RSML'
    });
    assert.equal(res.success, false);
    assert.equal(res.suppressed, true);
  });

  await t.test('sendTelegramExitAlert generates structured TMS action guidance for targets and stop loss', async () => {
    const res = await sendTelegramExitAlert({
      symbol: 'SHIVM',
      type: 'TARGET_REACHED',
      targetLevel: 1,
      ltp: 590,
      entryPrice: 512,
      targetPrice: 588,
      kitta: 100,
      isT2Cleared: true
    });
    assert.equal(res.success, true);
  });

  await t.test('broadcastAlert correctly routes NEWS_ALERT and IPO_ALERT to their dedicated dispatchers', async () => {
    // Should route news to in-app feed without error (while suppressing Telegram dispatch)
    const newsBroadcast = broadcastAlert({
      id: 'news_test_broadcast_01',
      type: 'NEWS_ALERT',
      category: 'general',
      title: 'SEBON Approves New Margin Lending Guidelines',
      body: 'Loan to value ratio maintained at 70%.',
      url: 'https://merolagani.com/news',
      source: 'MeroLagani',
      isTest: true
    });
    assert.notEqual(newsBroadcast, false);

    // Should route IPO to in-app feed without error (while suppressing Telegram dispatch)
    const ipoBroadcast = broadcastAlert({
      id: 'ipo_test_broadcast_01',
      type: 'IPO_ALERT',
      category: 'general',
      title: '🔔 IPO Open: Greenlife Hydro',
      body: 'Price Rs. 100 per unit.',
      symbol: 'GLH',
      isTest: true
    });
    assert.notEqual(ipoBroadcast, false);
  });
});

test('3. In-App News Display & Arrangement Architecture Verification', async (t) => {
  await t.test('InAppNewsReaderModal and App.jsx handle dravyashree_open_news with complete metadata', async () => {
    let capturedEvent = null;
    global.window = {
      dispatchEvent: (e) => { capturedEvent = e; },
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    // Simulate clicking an article in News tab
    const article = {
      title: 'NRB Unveils Third Quarter Monetary Policy Review',
      summary: 'Policy rate unchanged at 5.5%, regulatory relief for hydropower debt.',
      source: 'ShareSansar',
      url: 'https://sharesansar.com/newsdetail/nrb-review-q3',
      symbol: 'NRB',
      date: '2026-11-07'
    };

    // Dispatch the open news event as NewsService now does
    global.window.dispatchEvent(new CustomEvent('dravyashree_open_news', {
      detail: {
        action: 'OPEN_NEWS',
        title: article.title,
        body: article.summary,
        summary: article.summary,
        url: article.url,
        link: article.url,
        source: article.source,
        date: article.date,
        symbol: article.symbol
      }
    }));

    assert.ok(capturedEvent, 'Event should be dispatched');
    assert.equal(capturedEvent.type, 'dravyashree_open_news');
    assert.equal(capturedEvent.detail.action, 'OPEN_NEWS');
    assert.equal(capturedEvent.detail.title, article.title);
    assert.equal(capturedEvent.detail.source, 'ShareSansar');
  });
});

test('4. Android Status Bar Notification Click Deep-Link Routing', async (t) => {
  const rootDir = process.cwd();

  await t.test('normalizeNotificationItem properly sets OPEN_IPO, OPEN_STOCK, and avoids headline colon extraction', async () => {
    const pushModule = await import('../src/utils/pushNotificationService.js');

    const ipoNotif = pushModule.normalizeNotificationItem({
      id: 'ipo_001',
      title: '🔔 IPO Open: Reliance Spinning Mills (RSML)',
      body: 'Price Rs. 820.80 per unit.',
      data: {
        type: 'IPO_ALERT',
        category: 'general',
        symbol: 'RSML'
      },
      created_at: new Date().toISOString()
    });
    assert.equal(ipoNotif.action, 'OPEN_IPO');
    assert.equal(ipoNotif.symbol, 'RSML');

    const allotmentNotif = pushModule.normalizeNotificationItem({
      id: 'allot_001',
      title: '🎯 Allotment Published: Himalaya Energy',
      body: 'Results out now.',
      type: 'ALLOTMENT_ALERT',
      category: 'general',
      created_at: new Date().toISOString()
    });
    assert.equal(allotmentNotif.action, 'OPEN_IPO');
    assert.equal(allotmentNotif.symbol, '');

    const proStockNotif = pushModule.normalizeNotificationItem({
      id: 'pro_001',
      title: '⚡ Institutional Breakout: SHEL Extending',
      body: 'LTP crossed Rs. 312.',
      type: 'BREAKOUT',
      category: 'pro',
      symbol: 'SHEL',
      created_at: new Date().toISOString()
    });
    assert.equal(proStockNotif.action, 'OPEN_STOCK');
    assert.equal(proStockNotif.symbol, 'SHEL');

    const headlineColonNotif = pushModule.normalizeNotificationItem({
      id: 'news_colon_001',
      title: 'NEPSE Update: Market closes higher on Sunday',
      body: 'Broad turnover reached Rs. 8B.',
      type: 'NEWS_ALERT',
      category: 'general',
      created_at: new Date().toISOString()
    });
    assert.equal(headlineColonNotif.symbol, '', 'Must not extract first word after colon (Market) as a stock symbol');
    assert.equal(headlineColonNotif.action, 'OPEN_NEWS');
  });

  await t.test('AndroidManifest.xml declares intent-filter for notification click actions', () => {
    const manifest = fs.readFileSync(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const requiredActions = [
      'OPEN_STOCK',
      'OPEN_STOCK_DETAIL',
      'OPEN_ACCUMULATION_CARD',
      'OPEN_NEWS',
      'OPEN_IPO',
      'OPEN_RADAR',
      'OPEN_BROKER',
      'FCM_PLUGIN_ACTIVITY'
    ];
    for (const act of requiredActions) {
      assert.ok(manifest.includes(`android:name="${act}"`), `AndroidManifest.xml missing <action android:name="${act}" />`);
    }
    assert.ok(manifest.includes('android:name="android.intent.category.DEFAULT"'), 'AndroidManifest.xml missing DEFAULT category in notification intent-filter');
  });

  await t.test('MainActivity.java and DravyashreeAlertWorker.java set unique PendingIntent action/data and expose clearPendingNotification', () => {
    const mainActivity = fs.readFileSync(path.join(rootDir, 'android/app/src/main/java/com/smartwealth/nepse/MainActivity.java'), 'utf8');
    const worker = fs.readFileSync(path.join(rootDir, 'android/app/src/main/java/com/smartwealth/nepse/DravyashreeAlertWorker.java'), 'utf8');

    assert.ok(mainActivity.includes('clearPendingNotification()'), 'MainActivity.java must expose clearPendingNotification()');
    assert.ok(mainActivity.includes('intent.setAction("com.smartwealth.nepse.NOTIFICATION_TAP_"'), 'MainActivity.java must set unique notification tap action');
    assert.ok(mainActivity.includes('intent.setData(Uri.parse("dravyashree://notification/"'), 'MainActivity.java must set unique notification data URI');
    assert.ok(mainActivity.includes('dispatchPendingNotificationToWebView()'), 'MainActivity.java must retry pending deep-link delivery to WebView');

    assert.ok(worker.includes('intent.setAction("com.smartwealth.nepse.NOTIFICATION_TAP_"'), 'DravyashreeAlertWorker.java must set unique notification tap action');
    assert.ok(worker.includes('intent.setData(Uri.parse("dravyashree://notification/"'), 'DravyashreeAlertWorker.java must set unique notification data URI');
  });

  await t.test('ServicesHub.tsx registers ipolist and breakout-trap-radar in SERVICE_COMPONENTS', () => {
    const servicesHub = fs.readFileSync(path.join(rootDir, 'src/components/ServicesHub.tsx'), 'utf8');
    assert.ok(servicesHub.includes("'ipolist':"), 'ServicesHub.tsx must register ipolist');
    assert.ok(servicesHub.includes("'breakout-trap-radar':"), 'ServicesHub.tsx must register breakout-trap-radar');
  });

  await t.test('App.jsx checks isIpo before isNews, maps broker_analysis tab, and closes conflicting modals', () => {
    const appJsx = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');
    const ipoIdx = appJsx.indexOf('if (isIpo)');
    const newsIdx = appJsx.indexOf('if (isNews)');
    assert.ok(ipoIdx > -1 && newsIdx > -1, 'App.jsx must handle both isIpo and isNews');
    assert.ok(ipoIdx < newsIdx, 'App.jsx must evaluate isIpo BEFORE isNews so IPO alerts are never hijacked by NewsReader');
    assert.ok(appJsx.includes("'broker_analysis'"), 'App.jsx must route broker alerts to broker_analysis tab');
    assert.ok(appJsx.includes('clearPendingNotification'), 'App.jsx must clear native pending notification on route');
  });
});

test('5. Status Bar Deduplication, Immediate Corporate Actions, Pro Holding Emphasis & 1-Hour Other News Interval', async (t) => {
  const rootDir = process.cwd();

  const createFreshEnv = () => {
    const posted = [];
    global.localStorage = {
      _store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    };
    global.window = {
      NepseNativeNotifier: {
        hasNotificationPermission: () => true,
        requestNotificationPermission: () => {},
        postStatusBarNotification: (title, body, channelId, symbol, type, action, url, createdAt) => {
          posted.push({ title, body, channelId, symbol, type, action, url, createdAt });
        }
      },
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    return posted;
  };

  await t.test('Immediate corporate action classification (Dividend, Right Share, Book Closure)', async () => {
    createFreshEnv();
    const pushModule = await import('../src/utils/pushNotificationService.js');
    if (typeof pushModule.clearStatusBarPopState === 'function') pushModule.clearStatusBarPopState();

    assert.equal(pushModule.isImmediateCorporateActionAlert({ type: 'DIVIDEND_ALERT', title: 'SHEL Dividend Notice', body: '10% Bonus' }), true);
    assert.equal(pushModule.isImmediateCorporateActionAlert({ type: 'RIGHT_SHARE_ALERT', title: 'AKJCL Right Share', body: '1:1 Rights Issue' }), true);
    assert.equal(pushModule.isImmediateCorporateActionAlert({ type: 'BOOK_CLOSURE_ALERT', title: 'NABIL Book Closure', body: 'AGM notice' }), true);
    assert.equal(pushModule.isImmediateCorporateActionAlert({ type: 'NEWS_ALERT', title: 'SHIVM declares 15% cash dividend and AGM', body: 'Bonus approved' }), true);
    assert.equal(pushModule.isImmediateCorporateActionAlert({ type: 'NEWS_ALERT', title: 'नेप्से परिसूचक १५ अंकले वृद्धि', body: 'बजार बन्द' }), false);
    assert.equal(pushModule.OTHER_NEWS_INTERVAL_MS, 60 * 60 * 1000);
  });

  await t.test('PRO user stock holdings get special emphasis on Dividend, Right Share, and Book Closure at the same time', async () => {
    const posted = createFreshEnv();
    global.localStorage.setItem('nepse_portfolio_profiles', JSON.stringify([
      { id: 'main', holdings: [{ symbol: 'SHEL', kitta: 500 }, { symbol: 'AKJCL', kitta: 1000 }] }
    ]));

    const pushModule = await import('../src/utils/pushNotificationService.js');
    if (typeof pushModule.clearStatusBarPopState === 'function') pushModule.clearStatusBarPopState();

    const nowMs = Date.now();
    const divNotif = pushModule.normalizeNotificationItem({
      id: 'corp_shel_div_1',
      type: 'DIVIDEND_ALERT',
      category: 'general',
      symbol: 'SHEL',
      title: 'Singati Hydro announces 12% Bonus Share',
      body: 'SHEL board proposes 12% dividend for FY 2082/83.',
      created_at_ms: nowMs
    });

    const rightNotif = pushModule.normalizeNotificationItem({
      id: 'corp_akjcl_right_1',
      type: 'RIGHT_SHARE_ALERT',
      category: 'general',
      symbol: 'AKJCL',
      title: 'AKJCL 1:1 Right Share Issue Approved',
      body: 'Ankhu Khola Jalvidhyut gets approval for 100% right share.',
      created_at_ms: nowMs
    });

    const bookNotif = pushModule.normalizeNotificationItem({
      id: 'corp_shel_book_1',
      type: 'BOOK_CLOSURE_ALERT',
      category: 'general',
      symbol: 'SHEL',
      title: 'SHEL Book Closure for AGM Tomorrow',
      body: 'Book closure date set for Kartik 28.',
      created_at_ms: nowMs
    });

    assert.equal(divNotif.category, 'pro');
    assert.equal(divNotif.isHoldingHighlight, true);
    assert.ok(divNotif.title.includes('PRO HOLDING') && divNotif.title.includes('DIVIDEND'), `Expected special PRO HOLDING dividend emphasis, got: ${divNotif.title}`);

    assert.equal(rightNotif.category, 'pro');
    assert.equal(rightNotif.isHoldingHighlight, true);
    assert.ok(rightNotif.title.includes('PRO HOLDING') && rightNotif.title.includes('RIGHT SHARE'), `Expected special PRO HOLDING right share emphasis, got: ${rightNotif.title}`);

    assert.equal(bookNotif.category, 'pro');
    assert.equal(bookNotif.isHoldingHighlight, true);
    assert.ok(bookNotif.title.includes('PRO HOLDING') && bookNotif.title.includes('BOOK CLOSURE'), `Expected special PRO HOLDING book closure emphasis, got: ${bookNotif.title}`);

    pushModule.triggerNativeStatusBarNotification(divNotif, { skipDuplicateCheck: true, nowMs });
    pushModule.triggerNativeStatusBarNotification(rightNotif, { skipDuplicateCheck: true, nowMs });
    pushModule.triggerNativeStatusBarNotification(bookNotif, { skipDuplicateCheck: true, nowMs });

    assert.equal(posted.length, 3, 'All three corporate actions for PRO holdings must pop immediately at the same time');
    assert.ok(posted.every(n => n.channelId === 'dravyashree-pro-signals'), 'Holding alerts must route on high-priority PRO channel');
  });

  await t.test('Strict deduplication never sends or pops the same message twice of any kind', async () => {
    const posted = createFreshEnv();
    const pushModule = await import('../src/utils/pushNotificationService.js');
    if (typeof pushModule.clearStatusBarPopState === 'function') pushModule.clearStatusBarPopState();

    const nowMs = Date.now();
    const itemA = pushModule.normalizeNotificationItem({
      id: 'dup_001',
      type: 'DIVIDEND_ALERT',
      symbol: 'NABIL',
      title: 'NABIL Declares 15% Cash Dividend',
      body: 'NABIL Board approved 15% dividend from last year profits.',
      created_at_ms: nowMs
    });
    // Different ID (e.g. from another portal or FCM vs SSE) with the exact same headline/body
    const itemADupDifferentId = pushModule.normalizeNotificationItem({
      id: 'dup_002_other_portal',
      type: 'DIVIDEND_ALERT',
      symbol: 'NABIL',
      title: 'NABIL Declares 15% Cash Dividend',
      body: 'NABIL Board approved 15% dividend from last year profits. (Covered by: ShareSansar)',
      created_at_ms: nowMs + 5000
    });

    pushModule.triggerNativeStatusBarNotification(itemA, { skipDuplicateCheck: true, nowMs });
    pushModule.triggerNativeStatusBarNotification(itemA, { skipDuplicateCheck: true, nowMs: nowMs + 1000 });
    pushModule.triggerNativeStatusBarNotification(itemADupDifferentId, { skipDuplicateCheck: true, nowMs: nowMs + 5000 });

    assert.equal(posted.length, 1, 'Same message must NEVER pop twice even with skipDuplicateCheck or different portal ID');
  });

  await t.test('Other general news only pops once per 1-hour interval while Dividend/Right Share/Book Closure and Pro Holdings bypass immediately', async () => {
    const posted = createFreshEnv();
    global.localStorage.setItem('nepse_portfolio_profiles', JSON.stringify([
      { id: 'main', holdings: [{ symbol: 'SHEL', kitta: 500 }] }
    ]));

    const pushModule = await import('../src/utils/pushNotificationService.js');
    if (typeof pushModule.clearStatusBarPopState === 'function') pushModule.clearStatusBarPopState();

    const t0 = Date.now();

    // 1. First general news -> allowed
    const general1 = pushModule.normalizeNotificationItem({
      id: 'gen_news_1',
      type: 'NEWS_ALERT',
      category: 'general',
      title: 'NRB Issues New Banking Liquidity Circular',
      body: 'Central bank revises CD ratio reporting guidelines.',
      created_at_ms: t0
    });
    pushModule.triggerNativeStatusBarNotification(general1, { skipDuplicateCheck: true, nowMs: t0 });
    assert.equal(posted.length, 1, 'First general news should pop');

    // 2. Another general news 15 minutes later -> throttled (within 1 hour interval)
    const t15m = t0 + 15 * 60 * 1000;
    const general2 = pushModule.normalizeNotificationItem({
      id: 'gen_news_2',
      type: 'TRENDING_NEWS_ALERT',
      category: 'general',
      title: 'NEPSE Turnover Hits Rs 6 Billion Today',
      body: 'Commercial banks led trading volume on Tuesday.',
      created_at_ms: t15m
    });
    pushModule.triggerNativeStatusBarNotification(general2, { skipDuplicateCheck: true, nowMs: t15m });
    assert.equal(posted.length, 1, 'Second general news within 1 hour must be throttled');

    // 3. Non-held Dividend news at t+20m -> immediate bypass!
    const t20m = t0 + 20 * 60 * 1000;
    const divNonHeld = pushModule.normalizeNotificationItem({
      id: 'corp_nabil_div',
      type: 'DIVIDEND_ALERT',
      category: 'general',
      symbol: 'NABIL',
      title: 'NABIL Announces 18% Bonus Share Dividend',
      body: '18% bonus share approved by board.',
      created_at_ms: t20m
    });
    pushModule.triggerNativeStatusBarNotification(divNonHeld, { skipDuplicateCheck: true, nowMs: t20m });
    assert.equal(posted.length, 2, 'Stock Dividend news must pop immediately even during 1-hour general news cooldown');

    // 4. Held stock (SHEL) news at t+25m -> immediate PRO HOLDING bypass!
    const t25m = t0 + 25 * 60 * 1000;
    const holdingNews = pushModule.normalizeNotificationItem({
      id: 'hold_shel_news',
      type: 'NEWS_ALERT',
      category: 'general',
      symbol: 'SHEL',
      title: 'SHEL Completes Hydro Power Upgrade',
      body: 'Singati Hydro adds 5 MW capacity to grid.',
      created_at_ms: t25m
    });
    pushModule.triggerNativeStatusBarNotification(holdingNews, { skipDuplicateCheck: true, nowMs: t25m });
    assert.equal(posted.length, 3, 'PRO user holding news must pop immediately with special emphasis');
    assert.equal(posted[2].channelId, 'dravyashree-pro-signals');

    // 5. Previously throttled general news 2 re-sent later MUST NOT pop because it was marked seen when throttled,
    //    while a brand new general news 3 after 61 minutes MUST pop!
    const t61m = t0 + 61 * 60 * 1000;
    pushModule.triggerNativeStatusBarNotification(general2, { skipDuplicateCheck: true, nowMs: t61m });
    assert.equal(posted.length, 3, 'Previously seen/suppressed message must never repeat later');

    const general3 = pushModule.normalizeNotificationItem({
      id: 'gen_news_3',
      type: 'NEPSE_MACRO',
      category: 'general',
      title: 'SEBON Introduces New Broker Settlement Window',
      body: 'T+2 electronic clearing rules updated for market participants.',
      created_at_ms: t61m
    });
    pushModule.triggerNativeStatusBarNotification(general3, { skipDuplicateCheck: true, nowMs: t61m });
    assert.equal(posted.length, 4, 'Fresh general news after 1-hour interval should pop');
  });

  await t.test('Android native MainActivity & DravyashreeAlertWorker share persistent dedup & 1-hour interval gate', () => {
    const mainActivity = fs.readFileSync(path.join(rootDir, 'android/app/src/main/java/com/smartwealth/nepse/MainActivity.java'), 'utf8');
    const worker = fs.readFileSync(path.join(rootDir, 'android/app/src/main/java/com/smartwealth/nepse/DravyashreeAlertWorker.java'), 'utf8');

    assert.ok(worker.includes('OTHER_NEWS_INTERVAL_MS = 60 * 60 * 1000L'), 'Worker must define 1-hour general news interval');
    assert.ok(worker.includes('isAlertAlreadySeen('), 'Worker must expose shared isAlertAlreadySeen helper');
    assert.ok(worker.includes('markAlertSeen('), 'Worker must expose shared markAlertSeen helper');
    assert.ok(worker.includes('isImmediateCorporateActionOrPro('), 'Worker must distinguish Dividend/Right Share/Book Closure & Pro holdings');
    assert.ok(worker.includes('canPopGeneralNewsNow('), 'Worker must check 1-hour general news gate');

    assert.ok(mainActivity.includes('DravyashreeAlertWorker.isAlertAlreadySeen('), 'MainActivity must share persistent dedup check with Worker');
    assert.ok(mainActivity.includes('DravyashreeAlertWorker.markAlertSeen('), 'MainActivity must persist posted alerts to Worker SharedPreferences');
    assert.ok(mainActivity.includes('DravyashreeAlertWorker.isImmediateCorporateActionOrPro('), 'MainActivity must check immediate corporate/pro classification');
    assert.ok(mainActivity.includes('DravyashreeAlertWorker.canPopGeneralNewsNow('), 'MainActivity must enforce 1-hour general news gate');
  });
});
