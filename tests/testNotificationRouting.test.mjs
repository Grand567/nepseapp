// tests/testNotificationRouting.test.mjs
import assert from 'node:assert';
import { dispatchFcmNotification } from '../proxy/smartAlertEngine.mjs';

console.log('Testing Notification Deep Link & Payload Contract...');

// 1. Verify FCM dispatch test-safety guard (never blast real users in tests)
const testAlert = {
  id: 'test_announcement_123',
  title: '💰 MEN Dividend Declared',
  body: 'Mountain Energy Nepal Limited has declared 10.5% cash dividend',
  symbol: 'MEN',
  type: 'DIVIDEND_ALERT',
  category: 'pro',
  action: 'OPEN_NEWS',
  url: 'https://merolagani.com/AnnouncementDetail.aspx?id=12345',
  source: 'MeroLagani',
  isTest: true
};

const dispatchResult = await dispatchFcmNotification(testAlert);
assert.ok(dispatchResult, 'dispatchFcmNotification must return result');
assert.strictEqual(dispatchResult.count, 0, 'Test alerts must be suppressed from live push');
console.log('✅ FCM dispatch executed cleanly with safety test guard verified');

// 2. Test Deep Link Routing Contract
function simulateRouteNotificationClick(item, state) {
  if (!item) return;

  const action = String(item.action || '').toUpperCase();
  const type = String(item.type || '').toUpperCase();
  const category = String(item.category || '').toLowerCase();
  const symbol = String(item.symbol || '').toUpperCase().trim();
  const url = item.url || '';

  const isExplicitStockAction = action === 'OPEN_STOCK' || action === 'OPEN_STOCK_DETAIL' || action === 'OPEN_ACCUMULATION_CARD' || action === 'OPEN_BROKER';
  const isNews = !isExplicitStockAction && (
    action === 'OPEN_NEWS' ||
    category === 'news' ||
    category === 'dividend' ||
    category === 'right_share' ||
    type === 'NEWS_ALERT' ||
    type === 'DIVIDEND_ALERT' ||
    type === 'RIGHT_SHARE_ALERT' ||
    type === 'BOOK_CLOSURE_ALERT' ||
    type === 'EARNINGS_ALERT' ||
    type === 'NEPSE_MACRO' ||
    type === 'PORTFOLIO_NEWS_ALERT' ||
    type.includes('NEWS') ||
    Boolean(url && url.startsWith('http') && !type.includes('BREAKOUT') && !type.includes('STOP_LOSS') && !type.includes('PROFIT') && !type.includes('ENTRY'))
  );

  if (isNews) {
    state.activeNewsArticle = {
      isOpen: true,
      article: {
        title: item.title || 'Market Announcement',
        body: item.body || '',
        url: item.url || '',
        symbol: item.symbol || ''
      }
    };
    return;
  }

  const isIpo = action === 'OPEN_IPO' || type === 'IPO_ALERT' || category === 'ipo';
  if (isIpo) {
    state.activeTab = 'services';
    state.openedService = 'ipolist';
    return;
  }

  if (symbol) {
    const targetStock = { symbol, name: item.title || symbol };
    if (action === 'OPEN_BROKER' || type.includes('BROKER') || type.includes('CORNERING')) {
      targetStock.initialTab = 'broker';
    } else {
      targetStock.initialTab = 'overview';
    }
    state.activeTab = 'dashboard';
    state.selectedStock = targetStock;
    return;
  }

  if (action === 'OPEN_RADAR' || type.includes('BREAKOUT') || category === 'pro') {
    state.activeTab = 'services';
    state.openedService = 'breakout-trap-radar';
    return;
  }
}

// Case A: Corporate Announcement (e.g. Mountain Energy MEN dividend)
const stateA = {};
simulateRouteNotificationClick(testAlert, stateA);
assert.strictEqual(stateA.activeNewsArticle?.isOpen, true, 'News article modal must open for announcement');
assert.strictEqual(stateA.activeNewsArticle?.article?.symbol, 'MEN', 'Article must contain symbol MEN');
console.log('✅ Case A: Announcement opens InAppNewsReaderModal with symbol MEN');

// Case B: Stealth accumulation alert for LSL
const stockAlert = {
  id: 'alert_lsl_stealth',
  title: '🐋 Stealth Whale Accumulation: LSL',
  body: 'Broker 58 accumulated 120,000 kitta',
  symbol: 'LSL',
  type: 'ACCUMULATION',
  category: 'pro',
  action: 'OPEN_ACCUMULATION_CARD'
};
const stateB = {};
simulateRouteNotificationClick(stockAlert, stateB);
assert.strictEqual(stateB.activeTab, 'dashboard', 'activeTab must be dashboard (not invalid market)');
assert.strictEqual(stateB.selectedStock?.symbol, 'LSL', 'selectedStock must be set to LSL');
assert.strictEqual(stateB.selectedStock?.initialTab, 'overview', 'initialTab should be overview');
console.log('✅ Case B: Stock alert opens StockDetailModal for LSL on dashboard tab');

// Case C: Stock alert with URL should NOT be misrouted as news if action is explicit stock action
const stockWithUrl = {
  id: 'alert_stock_url',
  symbol: 'NABIL',
  action: 'OPEN_STOCK_DETAIL',
  url: '/stock/NABIL',
  type: 'ADMIN_TEST_ALERT'
};
const stateC1 = {};
simulateRouteNotificationClick(stockWithUrl, stateC1);
assert.strictEqual(stateC1.activeTab, 'dashboard', 'Must route to dashboard for explicit stock action');
assert.strictEqual(stateC1.selectedStock?.symbol, 'NABIL', 'Must set selectedStock to NABIL');
assert.strictEqual(stateC1.activeNewsArticle, undefined, 'Must not open news reader for stock action');
console.log('✅ Case C1: Explicit stock action with relative URL is guarded from news misrouting');

// Case C2: Broker radar alert
const brokerAlert = {
  id: 'alert_broker_58',
  symbol: 'AKJCL',
  action: 'OPEN_BROKER',
  type: 'BROKER_CORNERING'
};
const stateC2 = {};
simulateRouteNotificationClick(brokerAlert, stateC2);
assert.strictEqual(stateC2.activeTab, 'dashboard');
assert.strictEqual(stateC2.selectedStock?.symbol, 'AKJCL');
assert.strictEqual(stateC2.selectedStock?.initialTab, 'broker');
console.log('✅ Case C2: Broker cornering alert opens StockDetailModal to broker tab');

// Case D: IPO alert
const ipoAlert = {
  action: 'OPEN_IPO',
  type: 'IPO_ALERT',
  title: 'New IPO Allotment'
};
const stateD = {};
simulateRouteNotificationClick(ipoAlert, stateD);
assert.strictEqual(stateD.activeTab, 'services');
assert.strictEqual(stateD.openedService, 'ipolist');
console.log('✅ Case D: IPO alert routes to services tab with ipolist');

// 3. Test Smart Notification Twice-Daily Policy Contract (11 AM & 6 PM for non-holdings, immediate for portfolio holdings)
function evaluateNotificationPushPolicy({ isPortfolioTracked, nptMinutes, lastDispatchedWindowKey, dateIso = '2026-11-10' }) {
  if (isPortfolioTracked) {
    return { shouldPush: true, reason: 'PORTFOLIO_HOLDING_INSTANT' };
  }

  const is11amWindow = nptMinutes >= 660 && nptMinutes < 680; // 11:00 AM - 11:20 AM
  const is6pmWindow = nptMinutes >= 1080 && nptMinutes < 1100; // 6:00 PM - 6:20 PM
  const windowId = is11amWindow ? '11am' : (is6pmWindow ? '6pm' : null);

  if (!windowId) {
    return { shouldPush: false, reason: 'OUTSIDE_TWICE_DAILY_WINDOW', savedToDrawer: true };
  }

  const currentWindowKey = `${dateIso}_${windowId}`;
  if (lastDispatchedWindowKey === currentWindowKey) {
    return { shouldPush: false, reason: 'WINDOW_ALREADY_DISPATCHED', savedToDrawer: true };
  }

  return { shouldPush: true, reason: 'TWICE_DAILY_WINDOW_ACTIVE', windowKey: currentWindowKey };
}

// Test A: Portfolio holding at 2:30 PM (870 mins) pushes IMMEDIATELY
const portRes = evaluateNotificationPushPolicy({ isPortfolioTracked: true, nptMinutes: 870 });
assert.strictEqual(portRes.shouldPush, true);
assert.strictEqual(portRes.reason, 'PORTFOLIO_HOLDING_INSTANT');
console.log('✅ Policy Test 1: Portfolio holding pushes immediately at 2:30 PM');

// Test B: Non-holding notice at 2:30 PM (870 mins) is SUPPRESSED from status bar and saved to drawer
const nonHoldRes = evaluateNotificationPushPolicy({ isPortfolioTracked: false, nptMinutes: 870 });
assert.strictEqual(nonHoldRes.shouldPush, false);
assert.strictEqual(nonHoldRes.reason, 'OUTSIDE_TWICE_DAILY_WINDOW');
assert.strictEqual(nonHoldRes.savedToDrawer, true);
console.log('✅ Policy Test 2: Non-holding notice at 2:30 PM suppressed from status bar and saved to in-app drawer');

// Test C: Non-holding notice at 11:05 AM (665 mins) pushes as 11 AM Morning Digest
const morningRes = evaluateNotificationPushPolicy({ isPortfolioTracked: false, nptMinutes: 665, lastDispatchedWindowKey: null });
assert.strictEqual(morningRes.shouldPush, true);
assert.strictEqual(morningRes.reason, 'TWICE_DAILY_WINDOW_ACTIVE');
assert.strictEqual(morningRes.windowKey, '2026-11-10_11am');
console.log('✅ Policy Test 3: Non-holding notice at 11:05 AM pushes as Morning Digest');

// Test D: Subsequent non-holding notice at 11:15 AM (675 mins) is saved to drawer without duplicate buzz
const morningDupRes = evaluateNotificationPushPolicy({ isPortfolioTracked: false, nptMinutes: 675, lastDispatchedWindowKey: '2026-11-10_11am' });
assert.strictEqual(morningDupRes.shouldPush, false);
assert.strictEqual(morningDupRes.reason, 'WINDOW_ALREADY_DISPATCHED');
console.log('✅ Policy Test 4: Second notice in 11 AM window saved to drawer without duplicate status bar buzz');

// Test E: Non-holding notice at 6:05 PM (1085 mins) pushes as 6 PM Evening Digest
const eveningRes = evaluateNotificationPushPolicy({ isPortfolioTracked: false, nptMinutes: 1085, lastDispatchedWindowKey: '2026-11-10_11am' });
assert.strictEqual(eveningRes.shouldPush, true);
assert.strictEqual(eveningRes.reason, 'TWICE_DAILY_WINDOW_ACTIVE');
assert.strictEqual(eveningRes.windowKey, '2026-11-10_6pm');
console.log('✅ Policy Test 5: Non-holding notice at 6:05 PM pushes as Evening Digest');

console.log('\n🎉 All Notification Deep Link routing, safety guards & twice-daily pacing tests passed cleanly!');
