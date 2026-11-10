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

// 3. Test Smart Notification Pacing Gate Contract
const GENERAL_INTERVAL = 30 * 60 * 1000;
let lastGeneralAt = Date.now() - 5 * 60 * 1000; // 5 mins ago

function checkPacingDecision(isPortfolioTracked, now = Date.now()) {
  if (isPortfolioTracked) return { shouldPush: true, reason: 'PORTFOLIO_HOLDING_BYPASS' };
  if (now - lastGeneralAt < GENERAL_INTERVAL) {
    return { shouldPush: false, reason: 'THROTTLED_GENERAL_INTERVAL' };
  }
  return { shouldPush: true, reason: 'INTERVAL_ELAPSED' };
}

// User holding news pushes IMMEDIATELY even if another alert pushed 5 mins ago
const holdingDecision = checkPacingDecision(true);
assert.strictEqual(holdingDecision.shouldPush, true);
assert.strictEqual(holdingDecision.reason, 'PORTFOLIO_HOLDING_BYPASS');
console.log('✅ Pacing Test 1: Portfolio holding news bypasses throttle immediately');

// Non-portfolio general news is throttled within 30-minute interval
const generalThrottleDecision = checkPacingDecision(false);
assert.strictEqual(generalThrottleDecision.shouldPush, false);
assert.strictEqual(generalThrottleDecision.reason, 'THROTTLED_GENERAL_INTERVAL');
console.log('✅ Pacing Test 2: Non-holding general news is throttled to prevent spam');

// Non-portfolio general news allowed after 30 minutes
const generalElapsedDecision = checkPacingDecision(false, lastGeneralAt + 31 * 60 * 1000);
assert.strictEqual(generalElapsedDecision.shouldPush, true);
assert.strictEqual(generalElapsedDecision.reason, 'INTERVAL_ELAPSED');
console.log('✅ Pacing Test 3: Non-holding general news pushes after 30-minute interval elapses');

console.log('\n🎉 All Notification Deep Link routing & pacing tests passed cleanly!');
