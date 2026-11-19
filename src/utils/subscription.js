// src/utils/subscription.js
import {
  getDeviceLicenseId,
  formatDeviceId,
  cleanDeviceId,
  parseLicenseKey,
  redeemLicenseKeyOnServer
} from './licenseEngine.js';

export { getDeviceLicenseId, formatDeviceId, cleanDeviceId, parseLicenseKey };

export const SUBSCRIPTION_STORAGE_KEY = 'nepse_pro_subscription';

export const PRO_PLANS = [
  {
    id: '1m',
    months: 1,
    days: 30,
    label: '1 Month',
    code: '1m',
    priceRs: 499,
    savingsText: 'Flexible Starter',
    popular: false,
    tag: 'STARTER'
  },
  {
    id: '2m',
    months: 2,
    days: 60,
    label: '2 Months',
    code: '2m',
    priceRs: 899,
    savingsText: 'Save 10%',
    popular: false,
    tag: 'POPULAR'
  },
  {
    id: '3m',
    months: 3,
    days: 90,
    label: '3 Months (Quarterly)',
    code: '3m',
    priceRs: 1299,
    savingsText: 'Save 15% · Top Trader Choice',
    popular: true,
    tag: 'RECOMMENDED'
  },
  {
    id: '6m',
    months: 6,
    days: 180,
    label: '6 Months (Semi-Annual)',
    code: '6m',
    priceRs: 2399,
    savingsText: 'Save 20%',
    popular: false,
    tag: 'VALUE'
  },
  {
    id: '12m',
    months: 12,
    days: 365,
    label: '12 Months (Annual)',
    code: '12m',
    priceRs: 3999,
    savingsText: 'Save 35% · Best Long-Term Value',
    popular: false,
    tag: 'BEST VALUE'
  }
];

/**
 * Parse monthly string or number into day duration.
 */
export function parseDurationToDays(duration) {
  if (!duration) return 30;
  if (typeof duration === 'number') {
    return Math.max(1, Math.round(duration * 30));
  }
  const str = String(duration).trim().toLowerCase();
  if (str === '1m') return 30;
  if (str === '2m') return 60;
  if (str === '3m') return 90;
  if (str === '6m') return 180;
  if (str === '12m' || str === '1y') return 365;

  const match = str.match(/^(\d+)\s*m$/i);
  if (match) {
    const m = parseInt(match[1], 10);
    return Math.max(1, m * 30);
  }

  const num = parseInt(str, 10);
  return !isNaN(num) && num > 0 ? num : 30;
}

/**
 * Default free subscription state — Pro features strictly locked until server-verified activation.
 */
export function getFreeSubscription() {
  return {
    isPro: false,
    tier: 'free',
    planDuration: null,
    subscribedAt: null,
    expiresAt: 0,
    source: 'free',
    voucherCode: null
  };
}

/**
 * Normalize and strictly validate subscription state against timestamp and forged legacy bypass flags.
 */
export function normalizeSubscription(data) {
  if (!data || typeof data !== 'object') {
    return getFreeSubscription();
  }

  // Reject legacy default-unlocked bypasses
  if (
    data.source === 'unlocked_by_default' ||
    data.source === 'in_app_selection' ||
    data.voucherCode === 'LIFETIME_PRO' ||
    data.planDuration === 'unlimited'
  ) {
    return getFreeSubscription();
  }

  const expiresAt = Number(data.expiresAt || 0);
  const now = Date.now();
  const isTrustedSource = data.source === 'license_key' || data.source === 'server_verified';
  if (!data.isPro || !isTrustedSource || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return getFreeSubscription();
  }

  return {
    isPro: true,
    tier: 'pro',
    planDuration: data.planDuration || '1m',
    subscribedAt: Number(data.subscribedAt) || now,
    expiresAt,
    source: data.source,
    voucherCode: data.voucherCode || null,
    deviceId: data.deviceId || null
  };
}

/**
 * Retrieve cached subscription record from localStorage (validated against forged flags/expiry).
 */
export function getStoredSubscription() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return getFreeSubscription();
  }
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!raw) return getFreeSubscription();
    const data = JSON.parse(raw);
    const norm = normalizeSubscription(data);
    if (!norm.isPro) {
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    }
    return norm;
  } catch (_) {
    return getFreeSubscription();
  }
}

/**
 * Persist validated subscription record to localStorage.
 */
export function saveStoredSubscription(sub) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const norm = normalizeSubscription(sub);
    if (!norm.isPro) {
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    } else {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(norm));
    }
  } catch (err) {
    console.warn('[Subscription] Failed to persist subscription:', err);
  }
}

/**
 * Calculate human-readable countdown metrics.
 */
export function computeSubscriptionMetrics(sub) {
  const norm = normalizeSubscription(sub);
  const now = Date.now();
  const remainingMs = norm.isPro ? Math.max(0, norm.expiresAt - now) : 0;
  const daysRemaining = norm.isPro ? Math.ceil(remainingMs / (1000 * 60 * 60 * 24)) : 0;
  const isExpired = Boolean(norm.expiresAt > 0 && norm.expiresAt <= now);

  let formattedExpiry = 'Not Active';
  if (norm.isPro && norm.expiresAt > 0) {
    try {
      const d = new Date(norm.expiresAt);
      formattedExpiry = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      formattedExpiry = 'Unknown';
    }
  }

  return {
    ...norm,
    daysRemaining,
    isExpired,
    isLifetime: false,
    formattedExpiry,
    badgeLabel: norm.isPro ? `PRO (${norm.planDuration || 'Active'})` : 'FREE'
  };
}

/**
 * Server-verified activation key redemption (async).
 */
export async function redeemVoucherKey(rawCode, currentDeviceId = null) {
  if (!rawCode || typeof rawCode !== 'string') {
    return { success: false, message: 'Please enter a valid device-bound license key.' };
  }
  const code = rawCode.trim().toUpperCase();
  if (!code.startsWith('DS') || !code.includes('-')) {
    return {
      success: false,
      message: 'Unrecognized key format. Enter your server-issued DS... device activation key.'
    };
  }
  return await redeemLicenseKeyOnServer(code, currentDeviceId);
}
