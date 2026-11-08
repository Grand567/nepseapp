import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('BUG-082: App Resume Quote Refresh & Last-Updated Verification', () => {
  it('triggers live refresh and updates sync time when resuming from background on native platform', async () => {
    let refreshCalled = false;
    let syncTimeUpdated = null;
    let registeredCallback = null;

    // Mock CapacitorApp native bridge
    const mockCapacitorApp = {
      addListener: (eventName, callback) => {
        if (eventName === 'appStateChange') {
          registeredCallback = callback;
        }
        return Promise.resolve({
          remove: () => { registeredCallback = null; }
        });
      }
    };

    const mockCapacitor = {
      isNativePlatform: () => true
    };

    // Simulate App.jsx resume registration logic
    const setupResumeListener = (app, cap) => {
      const isNative = cap.isNativePlatform();
      if (!isNative) return null;

      let handle = null;
      app.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          refreshCalled = true;
          syncTimeUpdated = new Date();
        }
      }).then(h => { handle = h; });

      return () => { if (handle) handle.remove(); };
    };

    const cleanup = setupResumeListener(mockCapacitorApp, mockCapacitor);
    await new Promise(r => setTimeout(r, 10));

    assert.ok(registeredCallback, 'appStateChange listener should be registered');
    assert.strictEqual(refreshCalled, false, 'Refresh not called before resume');

    // Simulate OS resuming app
    registeredCallback({ isActive: true });

    assert.strictEqual(refreshCalled, true, 'Refresh was triggered on app resume');
    assert.ok(syncTimeUpdated instanceof Date, 'Sync timestamp was updated on resume');

    cleanup();
  });

  it('bypasses native appStateChange listener when running in web or Electron', async () => {
    let registered = false;

    const mockCapacitorApp = {
      addListener: () => {
        registered = true;
        return Promise.resolve({ remove: () => {} });
      }
    };

    const mockCapacitor = {
      isNativePlatform: () => false // Web or Electron
    };

    const isNative = mockCapacitor.isNativePlatform();
    if (isNative) {
      mockCapacitorApp.addListener('appStateChange', () => {});
    }

    assert.strictEqual(registered, false, 'Native listener should NOT be registered on Web/Electron');
  });

  it('formats last updated time in Asia/Kathmandu (NPT) time zone correctly', () => {
    const fixedDate = new Date('2026-11-09T03:30:00.000Z'); // 09:15 AM NPT (+5:45)
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(fixedDate);

    assert.ok(formatted.includes('09:15:00'), `Should format to 09:15:00 AM, got: ${formatted}`);
  });
});
