// src/utils/pushNotificationService.js
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE SMART ALERT PUSH NOTIFICATION CLIENT SERVICE
 * ───────────────────────────────────────────────────────────────────────────
 * Manages:
 *   1. Capacitor Native Push Notifications on Android APK (FCM)
 *   2. Lockscreen notification tap / deep-link handler -> Opens Accumulation Card
 *   3. Web Push / EventSource fallback for desktop & mobile browser
 *   4. Auditory 3-tone synthesizer chime & haptic vibration
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { playBreakoutChime, triggerBreakoutVibration } from './watchlistAlerts.js';

const PUSH_REGISTERED_KEY = 'dravyashree_fcm_token_registered';

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return ''; // Vite proxy forwards /api to backend
    }
  }
  return import.meta.env.VITE_PROXY_URL || 'https://nepseapp.onrender.com';
};

/**
 * Initialize Push Notifications on Mobile (Android) and Web
 */
export async function initPushNotifications() {
  if (typeof window === 'undefined') return;

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // 1. Request Push Permissions on Android / iOS
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[PushService] Push notification permission not granted:', permStatus.receive);
        return;
      }

      // 2. Register with Apple / Google APNs / FCM
      await PushNotifications.register();

      // 3. Listen for token registration
      PushNotifications.addListener('registration', async (tokenObj) => {
        const token = tokenObj?.value;
        if (!token) return;
        console.log('[PushService] Received native device push token:', token);
        localStorage.setItem(PUSH_REGISTERED_KEY, token);

        // Sync token with backend
        try {
          const apiBase = getApiBase();
          await fetch(`${apiBase}/api/smart-alerts/register-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              platform: Capacitor.getPlatform() || 'android'
            })
          });
          console.log('[PushService] Device push token successfully registered with Dravyashree backend.');
        } catch (syncErr) {
          console.warn('[PushService] Error saving token to backend:', syncErr.message);
        }
      });

      // 4. Registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[PushService] Native push registration error:', error);
      });

      // 5. Notification received while app is OPEN in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[PushService] Push notification received in foreground:', notification);
        playBreakoutChime();
        triggerBreakoutVibration();

        const data = notification.data || {};
        const alertPayload = {
          id: data.id || `alert_${Date.now()}`,
          symbol: data.symbol || notification.title?.split(':')[1]?.trim()?.split(' ')[0] || 'GHL',
          ltp: Number(data.ltp || 0),
          buyZone: {
            low: Number(data.entryLow || 0),
            high: Number(data.entryHigh || 0),
            statusText: `Inside Buy Zone: ${data.entryLow || ''} - ${data.entryHigh || ''}`
          },
          dominantBrokersText: data.brokersText || 'Dominant Institutional Brokers',
          concentrationPct: Number(data.concentrationPct || 52),
          target1: Number(data.target1 || 0),
          target2: Number(data.target2 || 0),
          stopLoss: Number(data.stopLoss || 0),
          title: notification.title,
          body: notification.body
        };

        window.dispatchEvent(new CustomEvent('dravyashree_smart_alert_received', { detail: alertPayload }));
      });

      // 6. User TAPPED on Lockscreen / Status Bar Notification!
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[PushService] User tapped lockscreen notification:', action);
        const data = action.notification?.data || {};
        const alertPayload = {
          symbol: data.symbol || 'GHL',
          ltp: Number(data.ltp || 0),
          buyZone: {
            low: Number(data.entryLow || 0),
            high: Number(data.entryHigh || 0)
          },
          dominantBrokersText: data.brokersText || 'Dominant Institutional Brokers',
          concentrationPct: Number(data.concentrationPct || 52),
          target1: Number(data.target1 || 0),
          target2: Number(data.target2 || 0),
          stopLoss: Number(data.stopLoss || 0)
        };

        // Dispatch deep link event to open the full Accumulation Card modal
        window.dispatchEvent(new CustomEvent('dravyashree_open_smart_alert', { detail: alertPayload }));
      });

    } catch (err) {
      console.warn('[PushService] Native push notifications initialization warning:', err.message);
    }
  } else {
    // ── Web / Desktop Browser Fallback (EventSource SSE + Web Notification) ──
    initWebPushFallback();
  }
}

/**
 * Web SSE Fallback for instant push delivery in browser / PWA
 */
function initWebPushFallback() {
  if (typeof window === 'undefined' || !window.EventSource) return;

  try {
    const apiBase = getApiBase();
    const eventSource = new EventSource(`${apiBase}/api/smart-alerts/events`);

    eventSource.onmessage = (event) => {
      try {
        const alertItem = JSON.parse(event.data);
        if (!alertItem || !alertItem.symbol) return;

        console.log('[PushService] Live SSE Smart Alert received:', alertItem);
        playBreakoutChime();
        triggerBreakoutVibration();

        // Browser Native Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🔔 Dravyashree Alert: ${alertItem.symbol} is Ready for Entry`, {
            body: `LTP: NPR ${alertItem.ltp} (Inside Buy Zone: ${alertItem.buyZone?.low} - ${alertItem.buyZone?.high})\n${alertItem.dominantBrokersText} absorbing ${alertItem.concentrationPct}% morning float.\nTarget: NPR ${alertItem.target1} | SL: NPR ${alertItem.stopLoss}`,
            icon: '/favicon.ico',
            tag: `dravyashree_alert_${alertItem.symbol}`
          });
        }

        window.dispatchEvent(new CustomEvent('dravyashree_smart_alert_received', { detail: alertItem }));
      } catch (e) {
        console.warn('[PushService] Error parsing alert SSE event:', e);
      }
    };

    eventSource.onerror = () => {
      // Auto-reconnects by default in EventSource
    };
  } catch (err) {
    console.debug('[PushService] Web SSE fallback notice:', err.message);
  }
}

/**
 * Fetch currently active smart alerts for today
 */
export async function fetchActiveSmartAlerts() {
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/smart-alerts/active`);
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (err) {
    console.warn('[PushService] Error fetching active smart alerts:', err.message);
  }
  return [];
}

/**
 * Fetch historical smart alerts
 */
export async function fetchSmartAlertHistory(limit = 30) {
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/smart-alerts/history?limit=${limit}`);
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (err) {
    console.warn('[PushService] Error fetching smart alert history:', err.message);
  }
  return [];
}

/**
 * Test Trigger an alert (for testing and demo)
 */
export async function triggerTestAlert(symbol = 'GHL', ltp = 269.50) {
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/smart-alerts/test-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, ltp })
    });
    if (res.ok) {
      const json = await res.json();
      const alert = json.result?.alert;
      if (alert) {
        window.dispatchEvent(new CustomEvent('dravyashree_smart_alert_received', { detail: alert }));
      }
      return json;
    }
  } catch (err) {
    console.warn('[PushService] Error triggering test alert:', err.message);
  }
  return null;
}
