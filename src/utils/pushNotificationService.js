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
const NOTIFICATIONS_CACHE_KEY = 'dravyashree_notifications_cache';
const MAX_NOTIFICATION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max age for active feed

export const getCachedNotifications = (filterCategory = 'all') => {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];

    const now = Date.now();
    // Auto-purge outdated notifications older than 24 hours
    const freshList = list.filter(n => {
      if (!n || !n.timestamp) return false;
      const t = new Date(n.timestamp).getTime();
      return !isNaN(t) && (now - t <= MAX_NOTIFICATION_AGE_MS);
    });

    if (freshList.length !== list.length) {
      localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(freshList));
    }

    if (filterCategory === 'all') return freshList;
    if (filterCategory === 'pro') return freshList.filter(n => n.category === 'pro' || n.tier === 'pro' || n.isPro);
    if (filterCategory === 'general') return freshList.filter(n => n.category === 'general' || n.type === 'NEWS_ALERT' || n.type === 'IPO_ALERT' || n.type === 'NEPSE_MACRO');
    return freshList;
  } catch (_) {
    return [];
  }
};

export const saveNotificationToCache = (notif) => {
  if (!notif) return;
  try {
    const list = getCachedNotifications('all');
    const existingIdx = list.findIndex(n => n.id === notif.id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...notif };
    } else {
      list.unshift(notif);
    }
    // Cap at 120 cached items
    const capped = list.slice(0, 120);
    localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(capped));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dravyashree_notifications_updated', { detail: { count: capped.length } }));
    }
  } catch (_) {}
};

export const getUnreadNotificationCount = () => {
  try {
    const list = getCachedNotifications('all');
    return list.filter(n => !n.read).length;
  } catch (_) {
    return 0;
  }
};

export const markNotificationAsRead = (id) => {
  try {
    const list = getCachedNotifications('all');
    const updated = list.map(n => n.id === id ? { ...n, read: true } : n);
    localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dravyashree_notifications_updated'));
    }
  } catch (_) {}
};

export const markAllNotificationsAsRead = () => {
  try {
    const list = getCachedNotifications('all');
    const updated = list.map(n => ({ ...n, read: true }));
    localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dravyashree_notifications_updated'));
    }
  } catch (_) {}
};

export const clearNotificationCache = () => {
  try {
    localStorage.removeItem(NOTIFICATIONS_CACHE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dravyashree_notifications_updated'));
    }
  } catch (_) {}
};

export const normalizeNotificationItem = (raw) => {
  const data = raw.data || raw;
  const isGeneral = data.category === 'general' || data.type === 'NEWS_ALERT' || data.type === 'IPO_ALERT' || data.type === 'NEPSE_MACRO';
  const category = data.category || (isGeneral ? 'general' : 'pro');
  const id = data.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  return {
    id,
    type: data.type || (isGeneral ? 'NEWS_ALERT' : 'SMART_INSTITUTIONAL_ENTRY'),
    category,
    tier: category,
    title: raw.title || data.title || 'Dravyashree Notification',
    body: raw.body || data.body || '',
    symbol: data.symbol || raw.title?.split(':')[1]?.trim()?.split(' ')[0] || '',
    ltp: Number(data.ltp || 0),
    buyZone: data.buyZone || {
      low: Number(data.entryLow || 0),
      high: Number(data.entryHigh || 0),
      statusText: data.entryLow ? `Buy Zone: ${data.entryLow} - ${data.entryHigh}` : ''
    },
    dominantBrokersText: data.dominantBrokersText || data.brokersText || '',
    concentrationPct: Number(data.concentrationPct || 0),
    target1: Number(data.target1 || 0),
    target2: Number(data.target2 || 0),
    stopLoss: Number(data.stopLoss || 0),
    action: data.action || (isGeneral ? 'OPEN_NEWS' : 'OPEN_RADAR'),
    url: data.url || '',
    timestamp: data.triggeredAt || data.timestamp || new Date().toISOString(),
    read: false
  };
};

const recentlyTriggeredAlerts = new Set();

export function triggerNativeStatusBarNotification(normalized) {
  if (!normalized) return;

  // Deduplicate on client to prevent multi-firing within 10 minutes
  const alertFingerprint = `${normalized.id || ''}_${normalized.title || ''}_${normalized.symbol || ''}`.trim();
  if (alertFingerprint && recentlyTriggeredAlerts.has(alertFingerprint)) {
    console.debug('[PushService] Suppressed duplicate status bar notification:', alertFingerprint);
    return;
  }
  recentlyTriggeredAlerts.add(alertFingerprint);
  if (recentlyTriggeredAlerts.size > 200) {
    const arr = Array.from(recentlyTriggeredAlerts).slice(-100);
    recentlyTriggeredAlerts.clear();
    arr.forEach(a => recentlyTriggeredAlerts.add(a));
  }

  // Suppress outdated alerts older than 20 minutes from triggering system status bar notification
  if (normalized.timestamp) {
    const timeMs = new Date(normalized.timestamp).getTime();
    if (!isNaN(timeMs) && (Date.now() - timeMs > 20 * 60 * 1000)) {
      console.debug('[PushService] Suppressed outdated status bar alert:', normalized.title);
      return;
    }
  }

  const isPro = normalized.category === 'pro' || normalized.tier === 'pro';
  const channelId = isPro ? 'dravyashree-pro-signals' : 'nepse-general-news';

  // 1. Android Native Status Bar Bridge (Works on Android APK when foreground or minimized)
  if (typeof window !== 'undefined' && window.NepseNativeNotifier && typeof window.NepseNativeNotifier.postStatusBarNotification === 'function') {
    try {
      window.NepseNativeNotifier.postStatusBarNotification(
        normalized.title || '🔔 Dravyashree Alert',
        normalized.body || '',
        channelId,
        normalized.symbol || '',
        normalized.type || '',
        normalized.action || (normalized.symbol ? 'OPEN_STOCK' : 'OPEN_NEWS'),
        normalized.url || ''
      );
      return;
    } catch (e) {
      console.warn('[PushService] Android native notifier call notice:', e.message);
    }
  }

  // 2. Browser Native Notification fallback for desktop / PWA
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(normalized.title || `🔔 Dravyashree Alert: ${normalized.symbol}`, {
        body: normalized.body,
        icon: '/favicon.ico',
        tag: `dravyashree_alert_${normalized.id}`
      });
    } catch (_) {}
  }
}

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // If native Capacitor platform (Android APK), WebView is served at localhost, but backend is remote!
    const isNative = typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
    if (!isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return ''; // Vite proxy forwards /api to backend in desktop browser dev mode
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

      // Create high-importance Android Notification Channels (PRO vs General)
      try {
        // High-priority Heads-up Channel for Pro Signals (Breakout, Accumulation, Exits)
        await PushNotifications.createChannel({
          id: 'dravyashree-pro-signals',
          name: 'Dravyashree PRO Signals',
          description: 'Institutional Accumulation, Breakouts, Stop-Loss & Profit-Booking Alerts',
          importance: 5,
          visibility: 1,
          vibration: true
        });

        // Medium-high Channel for General NEPSE News & IPO Pipeline
        await PushNotifications.createChannel({
          id: 'nepse-general-news',
          name: 'NEPSE News & IPO Pipeline',
          description: 'Corporate Announcements, IPO Deadlines & Allotment Results',
          importance: 4,
          visibility: 1,
          vibration: true
        });

        // Legacy fallback channel
        await PushNotifications.createChannel({
          id: 'smart-alerts',
          name: 'Dravyashree Smart Alerts',
          description: 'Institutional & Market Alerts',
          importance: 5,
          visibility: 1,
          vibration: true
        });
      } catch (chErr) {
        console.warn('[PushService] Channel creation notice:', chErr);
      }

      // 3. Listen for token registration
      PushNotifications.addListener('registration', async (tokenObj) => {
        const token = tokenObj?.value;
        if (!token) return;
        console.log('[PushService] Received native device push token:', token);
        localStorage.setItem(PUSH_REGISTERED_KEY, token);

        // Sync token and portfolio symbols with backend
        try {
          let portfolioSymbols = [];
          try {
            const rawProfs = localStorage.getItem('nepse_portfolio_profiles') || '[]';
            const profs = JSON.parse(rawProfs);
            if (Array.isArray(profs)) {
              profs.forEach(p => (p.holdings || []).forEach(h => {
                const s = h.symbol || h.scrip;
                if (s) portfolioSymbols.push(String(s).toUpperCase().trim());
              }));
            }
            const rawWl = localStorage.getItem('nepse_user_watchlist') || '[]';
            const wl = JSON.parse(rawWl);
            if (Array.isArray(wl)) {
              wl.forEach(w => {
                const s = typeof w === 'string' ? w : (w.symbol || w.scrip);
                if (s) portfolioSymbols.push(String(s).toUpperCase().trim());
              });
            }
            portfolioSymbols = Array.from(new Set(portfolioSymbols));
          } catch (_) {}

          const apiBase = getApiBase();
          await fetch(`${apiBase}/api/smart-alerts/register-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              platform: Capacitor.getPlatform() || 'android',
              portfolioSymbols
            })
          });
          console.log('[PushService] Device push token & tracked symbols successfully registered with Dravyashree backend.');
        } catch (syncErr) {
          console.warn('[PushService] Error saving token to backend:', syncErr.message);
        }
      });

      // 4. Registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[PushService] Native push registration error:', error);
      });

      // 5. Notification received while app is OPEN or MINIMIZED
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[PushService] Push notification received:', notification);
        playBreakoutChime();
        triggerBreakoutVibration();

        const normalized = normalizeNotificationItem(notification);
        saveNotificationToCache(normalized);
        triggerNativeStatusBarNotification(normalized);

        // Dispatch legacy smart alert event if symbol is present
        if (normalized.symbol) {
          window.dispatchEvent(new CustomEvent('dravyashree_smart_alert_received', { detail: normalized }));
        }
      });

      // 6. User TAPPED on Lockscreen / Status Bar Notification!
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[PushService] User tapped lockscreen notification:', action);
        const notification = action.notification || {};
        const normalized = normalizeNotificationItem(notification);
        markNotificationAsRead(normalized.id);

        // Dispatch unified notification clicked event
        window.dispatchEvent(new CustomEvent('dravyashree_notification_clicked', { detail: normalized }));

        if (normalized.action === 'OPEN_IPO') {
          window.dispatchEvent(new CustomEvent('dravyashree_open_ipo', { detail: normalized }));
        } else if (normalized.action === 'OPEN_NEWS') {
          window.dispatchEvent(new CustomEvent('dravyashree_open_news', { detail: normalized }));
        } else {
          // Default: Open smart alert / accumulation card modal
          window.dispatchEvent(new CustomEvent('dravyashree_open_smart_alert', { detail: normalized }));
        }
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
        if (!alertItem) return;

        console.log('[PushService] Live SSE Smart Alert received:', alertItem);
        playBreakoutChime();
        triggerBreakoutVibration();

        const normalized = normalizeNotificationItem(alertItem);
        saveNotificationToCache(normalized);
        triggerNativeStatusBarNotification(normalized);

        if (normalized.symbol) {
          window.dispatchEvent(new CustomEvent('dravyashree_smart_alert_received', { detail: normalized }));
        }
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
 * Unified Notification Feed Fetcher (Server + Local Cache)
 */
export async function fetchNotificationsFeed(category = 'all', limit = 50) {
  const localList = getCachedNotifications(category);
  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/notifications?category=${category}&limit=${limit}`);
    if (res.ok) {
      const json = await res.json();
      const serverItems = Array.isArray(json.data) ? json.data.map(normalizeNotificationItem) : [];
      
      // Merge unique by ID
      const map = new Map();
      serverItems.forEach(item => map.set(item.id, item));
      localList.forEach(item => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        } else {
          // keep read state if read locally
          const s = map.get(item.id);
          if (item.read) s.read = true;
        }
      });

      const now = Date.now();
      const freshMerged = Array.from(map.values())
        .filter(item => {
          if (!item.timestamp) return false;
          const t = new Date(item.timestamp).getTime();
          return !isNaN(t) && (now - t <= MAX_NOTIFICATION_AGE_MS);
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      localStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(freshMerged.slice(0, 100)));
      return freshMerged.slice(0, limit);
    }
  } catch (err) {
    console.warn('[PushService] Network fetch failed, falling back to cached notifications:', err.message);
  }
  return localList.slice(0, limit);
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
