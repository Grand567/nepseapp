import {
  validateAndRedeemLicenseKey,
  getDeviceLicenseId,
  formatDeviceId,
  cleanDeviceId,
  parseLicenseKey
} from './licenseEngine';

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
 * Examples: '1m' -> 30, '2m' -> 60, '12m' -> 365
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
 * Retrieve local subscription record from localStorage.
 */
export function getStoredSubscription() {
  if (typeof window === 'undefined') return getFreeSubscription();
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (!raw) return getFreeSubscription();
    const data = JSON.parse(raw);
    return normalizeSubscription(data);
  } catch (_) {
    return getFreeSubscription();
  }
}

/**
 * Persist subscription record to localStorage.
 */
export function saveStoredSubscription(sub) {
  if (typeof window === 'undefined') return;
  try {
    if (!sub || !sub.isPro) {
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
    } else {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(sub));
    }
  } catch (err) {
    console.warn('[Subscription] Failed to persist subscription:', err);
  }
}

/**
 * Default Free user subscription object
 */
export function getFreeSubscription() {
  return {
    isPro: false,
    tier: 'free',
    planDuration: null,
    subscribedAt: null,
    expiresAt: 0,
    source: 'none',
    voucherCode: null
  };
}

/**
 * Normalize and evaluate subscription state against current timestamp.
 */
export function normalizeSubscription(data) {
  if (!data || typeof data !== 'object') return getFreeSubscription();
  
  const now = Date.now();
  const expiresAt = Number(data.expiresAt || 0);
  const isPro = Boolean(data.isPro && expiresAt > now);

  return {
    isPro,
    tier: isPro ? 'pro' : 'free',
    planDuration: data.planDuration || (isPro ? '1m' : null),
    subscribedAt: data.subscribedAt || (isPro ? now : null),
    expiresAt,
    source: data.source || 'manual',
    voucherCode: data.voucherCode || null
  };
}

/**
 * Calculate human-readable countdown metrics.
 */
export function computeSubscriptionMetrics(sub) {
  const norm = normalizeSubscription(sub);
  const now = Date.now();
  const remainingMs = Math.max(0, norm.expiresAt - now);
  const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  const isExpired = norm.expiresAt > 0 && norm.expiresAt <= now;

  let formattedExpiry = 'Never';
  if (norm.expiresAt > 0) {
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
    formattedExpiry,
    badgeLabel: norm.isPro ? `PRO (${norm.planDuration || 'Active'})` : 'FREE'
  };
}

/**
 * Compute new subscription extending existing active Pro or starting from now.
 */
export function createProSubscription(durationStr = '1m', source = 'manual', voucherCode = null, existingSub = null) {
  const now = Date.now();
  const days = parseDurationToDays(durationStr);
  const addMs = days * 24 * 60 * 60 * 1000;

  let baseTime = now;
  // If user already has an active Pro subscription, extend from existing expiry!
  if (existingSub && existingSub.isPro && existingSub.expiresAt > now) {
    baseTime = existingSub.expiresAt;
  }

  const expiresAt = baseTime + addMs;

  return {
    isPro: true,
    tier: 'pro',
    planDuration: durationStr,
    subscribedAt: (existingSub && existingSub.isPro) ? existingSub.subscribedAt : now,
    expiresAt,
    source,
    voucherCode: voucherCode || null
  };
}

/**
 * Verify and redeem a voucher or device-bound license key.
 * Returns { success: boolean, duration?: string, days?: number, code: string, message: string }
 */
export function redeemVoucherKey(rawCode, currentDeviceId = null) {
  if (!rawCode || typeof rawCode !== 'string') {
    return { success: false, message: 'Please enter a valid voucher or license key.' };
  }

  const code = rawCode.trim().toUpperCase();

  // 1. Device-bound cryptographic license key check (e.g. DS3M-8A7F-94B2-U586-5C87)
  if (code.startsWith('DS') && code.includes('-')) {
    const licenseRes = validateAndRedeemLicenseKey(code, currentDeviceId);
    return {
      ...licenseRes,
      code
    };
  }

  // 2. Exact preset voucher codes
  const CODE_MAP = {
    'PRO1M': '1m',
    'PRO2M': '2m',
    'PRO3M': '3m',
    'PRO6M': '6m',
    'PRO12M': '12m',
    'PRO1Y': '12m',
    'DRABYASHREEPRO': '3m',
    'VIPGURU': '6m',
    'NEPSEVIP': '1m',
    'SUPERPRO': '12m',
    'TESTPRO': '1m'
  };

  if (CODE_MAP[code]) {
    return {
      success: true,
      duration: CODE_MAP[code],
      code,
      message: `✅ Voucher applied successfully! ${CODE_MAP[code].toUpperCase()} Pro plan unlocked.`
    };
  }

  // 3. Pattern match: PRO<N>M (e.g. PRO4M, PRO5M)
  const patternMatch = code.match(/^PRO(\d+)M$/);
  if (patternMatch) {
    const months = parseInt(patternMatch[1], 10);
    if (months > 0 && months <= 60) {
      return {
        success: true,
        duration: `${months}m`,
        code,
        message: `✅ Voucher applied successfully! ${months}-Month Pro plan unlocked.`
      };
    }
  }

  return {
    success: false,
    message: 'Invalid or expired voucher code. Check your key format or contact admin.'
  };
}
