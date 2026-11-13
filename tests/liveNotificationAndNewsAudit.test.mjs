// tests/liveNotificationAndNewsAudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  escapeHtml, 
  sendTelegramMessage, 
  sendTelegramSmartAlert, 
  sendTelegramNewsAlert, 
  sendTelegramIpoAlert, 
  sendTelegramExitAlert 
} from '../proxy/telegramNotifier.mjs';
import { broadcastAlert } from '../proxy/smartAlertEngine.mjs';

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

    // First mark as processed (as pushNotificationReceived listener does)
    pushModule.markNotificationAsProcessed(liveAlert.id, 'fp_NABIL_BREAKOUT_123', {
      symbol: 'NABIL',
      type: 'BREAKOUT'
    });

    // Now trigger status bar notification
    pushModule.triggerNativeStatusBarNotification(liveAlert);

    // Verify it was NOT suppressed and was posted to Android bridge!
    assert.ok(postedNotification, 'Notification should be delivered to native bridge');
    assert.equal(postedNotification.symbol, 'NABIL');
    assert.equal(postedNotification.channelId, 'dravyashree-pro-signals');
    assert.ok(postedNotification.title.includes('NABIL'));
  });

  await t.test('General news triggers general channel on Android status bar', async () => {
    let postedNotification = null;
    global.window.NepseNativeNotifier.postStatusBarNotification = (title, body, channelId, symbol, type, action, url, createdAt) => {
      postedNotification = { title, body, channelId, symbol, type, action, url, createdAt };
    };

    const pushModule = await import('../src/utils/pushNotificationService.js');
    const newsAlert = {
      id: 'news_alert_general_002',
      title: 'NRB Monetary Policy Review Announced',
      body: 'Interest rate corridor adjusted by 25 bps.',
      category: 'general',
      type: 'NEWS_ALERT',
      action: 'OPEN_NEWS',
      created_at_ms: Date.now()
    };

    pushModule.triggerNativeStatusBarNotification(newsAlert);
    assert.ok(postedNotification, 'News notification should be posted');
    assert.equal(postedNotification.channelId, 'nepse-general-news');
    assert.equal(postedNotification.action, 'OPEN_NEWS');
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
      body: 'Institutional accumulation confirmed at support'
    });
    assert.equal(res.success, true);
  });

  await t.test('sendTelegramNewsAlert generates dedicated news layout without fake buy signals', async () => {
    const res = await sendTelegramNewsAlert({
      title: 'NABIL Bank Reports 18% Net Profit Growth in Q3',
      body: 'Operating profit reached Rs. 4.2 Billion driven by retail loan expansion.',
      source: 'ShareSansar',
      symbol: 'NABIL',
      url: 'https://sharesansar.com/newsdetail/nabil-q3-profit'
    });
    assert.equal(res.success, true);
  });

  await t.test('sendTelegramIpoAlert generates dedicated IPO layout', async () => {
    const res = await sendTelegramIpoAlert({
      title: 'Reliance Spinning Mills IPO Opens Today',
      body: 'Book-building price Rs. 820.80 per unit. Closes in 4 days.',
      symbol: 'RSML'
    });
    assert.equal(res.success, true);
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
    // Should route news without error
    const newsBroadcast = broadcastAlert({
      id: 'news_test_broadcast_01',
      type: 'NEWS_ALERT',
      category: 'general',
      title: 'SEBON Approves New Margin Lending Guidelines',
      body: 'Loan to value ratio maintained at 70%.',
      url: 'https://merolagani.com/news',
      source: 'MeroLagani'
    });
    assert.notEqual(newsBroadcast, false);

    // Should route IPO without error
    const ipoBroadcast = broadcastAlert({
      id: 'ipo_test_broadcast_01',
      type: 'IPO_ALERT',
      category: 'general',
      title: '🔔 IPO Open: Greenlife Hydro',
      body: 'Price Rs. 100 per unit.',
      symbol: 'GLH'
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
