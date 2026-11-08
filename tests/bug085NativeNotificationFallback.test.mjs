import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dispatchSystemNotification, requestNotificationPermission, playBreakoutChime } from '../src/utils/watchlistAlerts.js';

describe('BUG-085: Native Notification & Audio Autoplay Resilience Verification', () => {
  it('dispatchSystemNotification calls NepseNativeNotifier on Android APK', () => {
    let nativePosted = false;
    let postedTitle = '';
    let postedBody = '';
    let postedSymbol = '';

    global.window = {
      NepseNativeNotifier: {
        postStatusBarNotification: (title, body, channelId, symbol) => {
          nativePosted = true;
          postedTitle = title;
          postedBody = body;
          postedSymbol = symbol;
        }
      }
    };

    dispatchSystemNotification('Breakout: NABIL', 'Crossed pivot', 'NABIL');

    assert.strictEqual(nativePosted, true, 'Should use native notifier bridge');
    assert.strictEqual(postedTitle, 'Breakout: NABIL');
    assert.strictEqual(postedBody, 'Crossed pivot');
    assert.strictEqual(postedSymbol, 'NABIL');

    delete global.window;
  });

  it('dispatchSystemNotification falls back to Web Notification on browser', () => {
    let webNotificationCreated = false;
    let webTitle = '';

    class MockNotification {
      constructor(title, options) {
        webNotificationCreated = true;
        webTitle = title;
      }
      static permission = 'granted';
    }

    global.window = {};
    global.Notification = MockNotification;

    dispatchSystemNotification('Web Alert', 'Price high', 'HDL');

    assert.strictEqual(webNotificationCreated, true, 'Should create web notification');
    assert.strictEqual(webTitle, 'Web Alert');

    delete global.window;
    delete global.Notification;
  });

  it('requestNotificationPermission calls native permission request on Android', async () => {
    let nativeRequested = false;

    global.window = {
      NepseNativeNotifier: {
        requestNotificationPermission: () => {
          nativeRequested = true;
        }
      }
    };

    const res = await requestNotificationPermission();
    assert.strictEqual(nativeRequested, true, 'Native permission request called');
    assert.strictEqual(res, 'granted');

    delete global.window;
  });

  it('playBreakoutChime safely handles missing or blocked AudioContext without throwing', () => {
    // In node/headless environment without window or AudioContext, it should not throw
    assert.doesNotThrow(() => {
      playBreakoutChime();
    });
  });
});
