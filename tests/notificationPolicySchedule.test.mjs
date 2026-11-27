// tests/notificationPolicySchedule.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastAlert,
  isGeneralNewsScheduleWindowActive,
  buildInvestmentPlanDetail,
  trackCustomHolding,
  untrackCustomHolding,
  subscribeAlertEvents,
} from '../proxy/smartAlertEngine.mjs';
import {
  normalizeNotificationItem,
  shouldPopStatusBarForNotification,
  clearStatusBarPopState,
} from '../src/utils/pushNotificationService.js';

test('Android Notification Policy: PRO Immediate, Portfolio-Only Exits, and 10:30 AM / 8:00 PM General News', async (t) => {
  await t.test('1. DIVIDEND_ALERT & RIGHT_SHARE_ALERT route to PRO channel with OPEN_STOCK/OPEN_RADAR tap action', () => {
    const divNorm = normalizeNotificationItem({
      id: 'test_div_mnbbl',
      type: 'DIVIDEND_ALERT',
      symbol: 'MNBBL',
      title: 'MNBBL Dividend Declared',
      body: '15% Bonus + 5% Cash',
      created_at: new Date().toISOString(),
    });
    assert.equal(divNorm.category, 'pro', 'DIVIDEND_ALERT must be PRO category');
    assert.equal(divNorm.action, 'OPEN_STOCK', 'DIVIDEND_ALERT with symbol must open Stock Detail');

    const rightNorm = normalizeNotificationItem({
      id: 'test_right_no_sym',
      type: 'RIGHT_SHARE_ALERT',
      symbol: 'NEPSE',
      title: 'Right Share Notice',
      body: '1:1 Rights Issue Approved',
      created_at: new Date().toISOString(),
    });
    assert.equal(rightNorm.category, 'pro', 'RIGHT_SHARE_ALERT must be PRO category');
    assert.equal(rightNorm.action, 'OPEN_RADAR', 'RIGHT_SHARE_ALERT without specific symbol must open Radar');
  });

  await t.test('2. Investment-plan detail helper enriches stock alerts with LTP/Buy Zone/SL/Target', () => {
    const enriched = buildInvestmentPlanDetail('MNBBL', 'MNBBL announced 15% bonus share');
    assert.match(enriched, /LTP|Buy Zone|SL|Target|EPS/i, 'Enriched body must contain investment planning metrics');
  });

  await t.test('3. PROFIT_BOOKING and STOP_LOSS_WARNING are strictly blocked for non-portfolio stocks', () => {
    const nonHeldSym = 'TEST_UNHELD';
    untrackCustomHolding(nonHeldSym);

    const received = [];
    const unsub = subscribeAlertEvents({ write: (d) => received.push(d) });
    try {
      const blockedSl = broadcastAlert({
        id: `sl_unheld_${Date.now()}`,
        type: 'STOP_LOSS_WARNING',
        symbol: nonHeldSym,
        ltp: 200,
        isTest: true,
        title: `Stop-Loss Hit: ${nonHeldSym}`,
        body: 'Should be blocked because not in portfolio',
      });
      const blockedTp = broadcastAlert({
        id: `tp_unheld_${Date.now()}`,
        type: 'PROFIT_BOOKING',
        symbol: nonHeldSym,
        ltp: 300,
        isTest: true,
        title: `Target Hit: ${nonHeldSym}`,
        body: 'Should be blocked because not in portfolio',
      });

      assert.equal(blockedSl, false, 'STOP_LOSS_WARNING for non-portfolio stock must be suppressed');
      assert.equal(blockedTp, false, 'PROFIT_BOOKING for non-portfolio stock must be suppressed');
      assert.equal(received.length, 0, 'No SSE/push event should fire for non-portfolio exit alert');

      // Now track the holding and verify it IS allowed
      const heldSym = 'TEST_HELD';
      trackCustomHolding({ symbol: heldSym, entryPrice: 300, kitta: 50, stopLoss: 280, target1: 340, isTest: true });
      const allowedTp = broadcastAlert({
        id: `tp_held_${Date.now()}`,
        type: 'PROFIT_BOOKING',
        symbol: heldSym,
        ltp: 345,
        isUserHolding: true,
        isPortfolioTracked: true,
        isTest: true,
        title: `Target Hit: ${heldSym}`,
        body: 'Portfolio holding target reached',
      });
      assert.notEqual(allowedTp, false, 'PROFIT_BOOKING for portfolio holding must be allowed');
      untrackCustomHolding(heldSym);
    } finally {
      unsub();
    }
  });

  await t.test('4. General News schedule is active ONLY at 10:30 AM NPT and 8:00 PM NPT daily', () => {
    // 10:30 AM NPT = 04:45 UTC
    const morning = isGeneralNewsScheduleWindowActive(new Date('2026-11-28T04:45:00Z'));
    assert.equal(morning.active, true, '10:30 AM NPT (even on Saturday) must be active');
    assert.equal(morning.windowId, '1030am');

    // 8:00 PM NPT = 14:15 UTC
    const evening = isGeneralNewsScheduleWindowActive(new Date('2026-11-28T14:15:00Z'));
    assert.equal(evening.active, true, '8:00 PM NPT must be active');
    assert.equal(evening.windowId, '8pm');

    // 2:00 PM NPT = 08:15 UTC (outside both windows)
    const afternoon = isGeneralNewsScheduleWindowActive(new Date('2026-11-28T08:15:00Z'));
    assert.equal(afternoon.active, false, '2:00 PM NPT must NOT be active for general news');
  });

  await t.test('5. Client status bar gate pops PRO/Dividend/Right Share at any time, and General News only at 10:30 AM & 8:00 PM NPT', () => {
    clearStatusBarPopState();
    const afternoonUtcMs = new Date('2026-11-28T08:15:00Z').getTime(); // 2:00 PM NPT
    const morningUtcMs = new Date('2026-11-28T04:45:00Z').getTime();   // 10:30 AM NPT
    const eveningUtcMs = new Date('2026-11-28T14:15:00Z').getTime();   // 8:00 PM NPT

    const divAlert = normalizeNotificationItem({
      id: 'div_anytime_1',
      type: 'DIVIDEND_ALERT',
      symbol: 'NABIL',
      title: 'NABIL Dividend',
      body: '20% Dividend',
      created_at: new Date(afternoonUtcMs).toISOString(),
    });
    assert.equal(shouldPopStatusBarForNotification(divAlert, { nowMs: afternoonUtcMs }).allow, true, 'DIVIDEND_ALERT must pop at any time');

    const generalNews = normalizeNotificationItem({
      id: 'gen_news_1',
      type: 'NEWS_ALERT',
      symbol: 'NEPSE',
      title: 'General Market News',
      body: 'Routine market commentary',
      created_at: new Date(afternoonUtcMs).toISOString(),
    });
    assert.equal(shouldPopStatusBarForNotification(generalNews, { nowMs: afternoonUtcMs }).allow, false, 'General news must NOT pop at 2:00 PM NPT');
    assert.equal(shouldPopStatusBarForNotification(generalNews, { nowMs: morningUtcMs }).allow, true, 'General news MUST pop at 10:30 AM NPT');

    const generalNews2 = normalizeNotificationItem({
      id: 'gen_news_2',
      type: 'IPO_ALERT',
      symbol: 'NEPSE',
      title: 'IPO Pipeline Update',
      body: 'New IPO opening soon',
      created_at: new Date(eveningUtcMs).toISOString(),
    });
    assert.equal(shouldPopStatusBarForNotification(generalNews2, { nowMs: eveningUtcMs }).allow, true, 'General news/IPO MUST pop at 8:00 PM NPT');
  });
});
