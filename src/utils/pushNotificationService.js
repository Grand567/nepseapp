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

// ── Stale Notification Filtering & Deduplication Rules ───────────────────────
export const NOTIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes max age for live notifications
export const PROCESSED_NOTIFICATIONS_KEY = 'dravyashree_processed_notification_log_v2';
export const MAX_PROCESSED_LOG_SIZE = 500;
export const PROCESSED_LOG_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours retention

/**
 * Fast string hashing utility for content-fingerprinting incoming alert broadcasts
 */
function hashString(str) {
  let hash = 0;
  if (!str) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Extracts and verifies explicit creation timestamp from incoming FCM / background push payload.
 * Supports ISO strings, numeric epoch milliseconds, and FCM sent-time headers.
 */
export const extractPayloadCreationTimestamp = (raw) => {
  if (!raw) return { hasTimestamp: false, createdAtMs: 0, createdAtIso: '', sourceField: null };

  const data = raw.data || raw;

  // Candidates inspected in order of explicit intent
  const candidates = [
    { field: 'created_at', val: data.created_at ?? raw.created_at },
    { field: 'created_at_ms', val: data.created_at_ms ?? raw.created_at_ms },
    { field: 'createdAt', val: data.createdAt ?? raw.createdAt },
    { field: 'triggeredAt', val: data.triggeredAt ?? raw.triggeredAt },
    { field: 'timestamp', val: data.timestamp ?? raw.timestamp },
    { field: 'sentTime', val: data.sentTime ?? raw.sentTime ?? data['google.sent_time'] ?? raw['google.sent_time'] }
  ];

  for (const c of candidates) {
    if (c.val !== undefined && c.val !== null && c.val !== '') {
      let timeMs = 0;
      if (typeof c.val === 'number' && !isNaN(c.val) && c.val > 0) {
        timeMs = c.val;
      } else if (typeof c.val === 'string') {
        const str = c.val.trim();
        if (/^\d{10,13}$/.test(str)) {
          timeMs = parseInt(str.length === 10 ? str + '000' : str, 10);
        } else {
          const parsed = Date.parse(str);
          if (!isNaN(parsed) && parsed > 0) timeMs = parsed;
        }
      }

      if (timeMs > 0) {
        return {
          hasTimestamp: true,
          createdAtMs: timeMs,
          createdAtIso: new Date(timeMs).toISOString(),
          sourceField: c.field
        };
      }
    }
  }

  return { hasTimestamp: false, createdAtMs: 0, createdAtIso: '', sourceField: null };
};

/**
 * Retrieves the persistent log of already-processed notification IDs and fingerprints.
 */
export const getProcessedNotificationsLog = () => {
  try {
    const raw = localStorage.getItem(PROCESSED_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Prune entries older than retention window (48 hours)
    const now = Date.now();
    const fresh = parsed.filter(entry => {
      if (!entry || !entry.processedAt) return false;
      return (now - entry.processedAt) <= PROCESSED_LOG_RETENTION_MS;
    });

    if (fresh.length !== parsed.length) {
      localStorage.setItem(PROCESSED_NOTIFICATIONS_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch (_) {
    return [];
  }
};

/**
 * Checks whether an alert has already been processed or displayed.
 */
export const isNotificationAlreadyProcessed = (id, fingerprint) => {
  if (!id && !fingerprint) return false;
  const log = getProcessedNotificationsLog();
  return log.some(entry => {
    if (id && entry.id === id) return true;
    if (fingerprint && entry.fingerprint === fingerprint) return true;
    return false;
  });
};

/**
 * Marks a notification as processed in the persistent local history log.
 */
export const markNotificationAsProcessed = (id, fingerprint, metadata = {}) => {
  try {
    const log = getProcessedNotificationsLog();
    const now = Date.now();

    const existingIdx = log.findIndex(e => (id && e.id === id) || (fingerprint && e.fingerprint === fingerprint));
    if (existingIdx >= 0) {
      log[existingIdx].processedAt = now;
    } else {
      log.unshift({
        id: id || '',
        fingerprint: fingerprint || '',
        processedAt: now,
        createdAt: metadata.createdAt || null,
        symbol: metadata.symbol || '',
        type: metadata.type || ''
      });
    }

    const capped = log.slice(0, MAX_PROCESSED_LOG_SIZE);
    localStorage.setItem(PROCESSED_NOTIFICATIONS_KEY, JSON.stringify(capped));
  } catch (_) {}
};

/**
 * Core Validation & Stale-Filtering Pipeline:
 * 1. Payload Timestamp Verification (explicit creation timestamp check)
 * 2. TTL Expiration Rule (delta <= 30 minutes)
 * 3. Queue Deduplication (persistent ID & fingerprint history check)
 */
export const validatePushNotificationPayload = (raw, options = {}) => {
  const ttlMs = options.ttlMs || NOTIFICATION_TTL_MS;
  const allowMissingTimestamp = options.allowMissingTimestamp === true;

  if (!raw) {
    return { valid: false, reason: 'EMPTY_PAYLOAD', error: 'Payload is null or empty' };
  }

  const data = raw.data || raw;
  const id = String(data.id || raw.id || '').trim();
  const title = String(raw.title || data.title || '').trim();
  const body = String(raw.body || data.body || '').trim();
  const symbol = String(data.symbol || raw.symbol || '').toUpperCase().trim();
  const type = String(data.type || raw.type || '').trim();

  // Content fingerprint to detect broadcast queues with altered or omitted IDs
  const contentFingerprint = `fp_${symbol || 'GEN'}_${type || 'ALERT'}_${hashString(title + '_' + body)}`;

  // 1. Queue Deduplication Check against persistent local client-side cache
  if (isNotificationAlreadyProcessed(id, contentFingerprint)) {
    return {
      valid: false,
      reason: 'DUPLICATE_ALERT',
      id,
      fingerprint: contentFingerprint,
      error: `Notification already processed in client history (${id || contentFingerprint})`
    };
  }

  // 2. Payload Timestamp Verification: inspect explicit creation timestamp
  const tsInfo = extractPayloadCreationTimestamp(raw);
  if (!tsInfo.hasTimestamp) {
    if (!allowMissingTimestamp) {
      return {
        valid: false,
        reason: 'MISSING_EXPLICIT_TIMESTAMP',
        id,
        fingerprint: contentFingerprint,
        error: 'Push payload lacks explicit created_at / triggeredAt timestamp. Suppressed to prevent backlogged broadcasts.'
      };
    }
  }

  // 3. TTL Expiration Rule: Discard if generation-to-receipt delta > 30 minutes
  const now = Date.now();
  const createdAtMs = tsInfo.hasTimestamp ? tsInfo.createdAtMs : now;
  const deltaMs = now - createdAtMs;

  if (deltaMs > ttlMs) {
    const ageMinutes = +(deltaMs / (60 * 1000)).toFixed(1);
    return {
      valid: false,
      reason: 'TTL_EXPIRED',
      id,
      fingerprint: contentFingerprint,
      ageMinutes,
      deltaMs,
      error: `Alert expired: generated ${ageMinutes}m ago (exceeds ${ttlMs / 60000}m TTL threshold). Discarded.`
    };
  }

  // Clock-skew protection: Reject notifications claiming to be more than 5 minutes in the future
  if (deltaMs < -5 * 60 * 1000) {
    return {
      valid: false,
      reason: 'FUTURE_TIMESTAMP_ANOMALY',
      id,
      fingerprint: contentFingerprint,
      deltaMs,
      error: `Alert rejected: future timestamp anomaly (${deltaMs}ms in future).`
    };
  }

  return {
    valid: true,
    id,
    fingerprint: contentFingerprint,
    createdAtMs,
    createdAtIso: tsInfo.createdAtIso || new Date(now).toISOString(),
    deltaMs,
    symbol,
    type,
    title,
    body
  };
};

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
  const id = data.id || raw.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  const tsInfo = extractPayloadCreationTimestamp(raw);
  const createdAtIso = tsInfo.hasTimestamp ? tsInfo.createdAtIso : (data.created_at || data.triggeredAt || data.timestamp || new Date().toISOString());
  const createdAtMs = tsInfo.hasTimestamp ? tsInfo.createdAtMs : new Date(createdAtIso).getTime();

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
    created_at: createdAtIso,
    created_at_ms: createdAtMs,
    timestamp: createdAtIso,
    read: false
  };
};

const recentlyTriggeredAlerts = new Set();

export function triggerNativeStatusBarNotification(normalized) {
  if (!normalized) return;

  // Stale-notification validation layer: inspect timestamp and enforce 30m TTL
  const validation = validatePushNotificationPayload(normalized, { ttlMs: NOTIFICATION_TTL_MS });
  if (!validation.valid && validation.reason !== 'DUPLICATE_ALERT') {
    console.warn(`[PushService] Suppressed status bar notification [${validation.reason}]:`, validation.error);
    return;
  }

  // Deduplicate on client to prevent multi-firing within session
  const alertFingerprint = `${normalized.id || ''}_${normalized.title || ''}_${normalized.symbol || ''}`.trim();
  if (alertFingerprint && (recentlyTriggeredAlerts.has(alertFingerprint) || isNotificationAlreadyProcessed(normalized.id, alertFingerprint))) {
    console.debug('[PushService] Suppressed duplicate status bar notification:', alertFingerprint);
    return;
  }
  recentlyTriggeredAlerts.add(alertFingerprint);
  if (recentlyTriggeredAlerts.size > 200) {
    const arr = Array.from(recentlyTriggeredAlerts).slice(-100);
    recentlyTriggeredAlerts.clear();
    arr.forEach(a => recentlyTriggeredAlerts.add(a));
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
        normalized.url || '',
        normalized.created_at || normalized.timestamp || ''
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
        console.log('[PushService] Push notification received from FCM:', notification);

        // Core Validation: Verify explicit created_at timestamp, 30m TTL, and deduplicate
        const validation = validatePushNotificationPayload(notification, { ttlMs: NOTIFICATION_TTL_MS });
        if (!validation.valid) {
          console.warn(`[PushService] 🛑 Stale/Duplicate push notification discarded [${validation.reason}]:`, validation.error);
          return;
        }

        // Record in persistent deduplication history log immediately
        markNotificationAsProcessed(validation.id, validation.fingerprint, {
          createdAt: validation.createdAtIso,
          symbol: validation.symbol,
          type: validation.type
        });

        // Trigger chime & vibration ONLY for verified, fresh notifications
        playBreakoutChime();
        triggerBreakoutVibration();

        const normalized = normalizeNotificationItem({
          ...notification,
          created_at: validation.createdAtIso,
          created_at_ms: validation.createdAtMs,
          timestamp: validation.createdAtIso
        });

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
  }

  // ── Resilient Real-Time EventSource SSE Fallback (Active on both Native APK & Web/PWA) ──
  // Guarantees zero-latency push delivery while app is open or minimized, even if FCM credentials are unconfigured
  initWebPushFallback();
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

        // Core Validation: Verify explicit created_at timestamp, 30m TTL, and deduplicate
        const validation = validatePushNotificationPayload(alertItem, { ttlMs: NOTIFICATION_TTL_MS });
        if (!validation.valid) {
          console.debug(`[PushService] 🛑 Stale/Duplicate SSE alert discarded [${validation.reason}]:`, validation.error);
          return;
        }

        markNotificationAsProcessed(validation.id, validation.fingerprint, {
          createdAt: validation.createdAtIso,
          symbol: validation.symbol,
          type: validation.type
        });

        playBreakoutChime();
        triggerBreakoutVibration();

        const normalized = normalizeNotificationItem({
          ...alertItem,
          created_at: validation.createdAtIso,
          created_at_ms: validation.createdAtMs,
          timestamp: validation.createdAtIso
        });

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
