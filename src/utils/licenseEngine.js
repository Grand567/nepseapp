// src/utils/licenseEngine.js
// Client-side Device License ID management & Server-Verified License API client.
// Key generation, cryptographic HMAC signing, and single-use burn ledgers execute strictly on the server.

import { getProxyBase } from './proxyBase.js';

export const DEVICE_ID_STORAGE_KEY = 'drabyashree_device_license_id';

/**
 * Sanitize any device ID string to an 8-character uppercase alphanumeric identifier.
 * E.g. "DS-8A7F-94B2" -> "8A7F94B2"
 */
export function cleanDeviceId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DS/, '').slice(0, 8);
}

/**
 * Format clean 8-character device ID into user-friendly representation: "DS-8A7F-94B2"
 */
export function formatDeviceId(clean) {
  const c = cleanDeviceId(clean);
  if (c.length < 8) return `DS-${c}`;
  return `DS-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}

/**
 * Generate or retrieve persistent Customer Device License ID using CSPRNG entropy.
 */
export function getDeviceLicenseId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'DS-DEV00001'.slice(0, 11);
  }
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && cleanDeviceId(existing).length === 8) {
      return formatDeviceId(existing);
    }

    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = new Uint8Array(8);
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      throw new Error('CSPRNG unavailable');
    }

    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(bytes[i] % chars.length);
    }

    const formatted = `DS-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, formatted);
    return formatted;
  } catch (_) {
    return 'DS-UNSET001'.slice(0, 11);
  }
}

/**
 * Map plan duration string to number of days.
 */
export function mapPlanToDays(planStr) {
  const norm = String(planStr).trim().toUpperCase();
  const MAP = {
    '1M': 30,
    '2M': 60,
    '3M': 90,
    '6M': 180,
    '12M': 365,
    '1Y': 365,
    'VIP': 365
  };
  if (MAP[norm]) return MAP[norm];
  const match = norm.match(/^(\d+)\s*(M|D|Y)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'M').toUpperCase();
    if (unit === 'M') return val * 30;
    if (unit === 'D') return val;
    if (unit === 'Y') return val * 365;
  }
  return 30;
}

/**
 * Parse a license key into structured segments (format check only; signature verified server-side).
 */
export function parseLicenseKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const clean = rawKey.trim().toUpperCase().replace(/\s+/g, '');

  const regex = /^DS([0-9]+[MDY]?)-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4,16})$/;
  const match = clean.match(regex);
  if (!match) return null;

  const planStr = match[1];
  const devChunk1 = match[2];
  const devChunk2 = match[3];
  const nonce = match[4];
  const checksum = match[5];
  const targetDeviceIdClean = `${devChunk1}${devChunk2}`;
  const targetDeviceIdFormatted = `DS-${devChunk1}-${devChunk2}`;

  return {
    rawKey: clean,
    planStr,
    planDuration: planStr.toLowerCase(),
    days: mapPlanToDays(planStr),
    targetDeviceIdClean,
    targetDeviceIdFormatted,
    nonce,
    checksum,
    serialId: `${targetDeviceIdClean}-${nonce}`
  };
}

/**
 * Redeem and burn a server-signed device-bound license key via backend verification endpoint.
 */
export async function redeemLicenseKeyOnServer(rawKey, deviceId = null) {
  const key = String(rawKey || '').trim().toUpperCase();
  const targetDeviceId = formatDeviceId(deviceId || getDeviceLicenseId());
  if (!key) {
    return { success: false, message: 'Please enter a valid server-issued activation key.' };
  }

  try {
    const base = getProxyBase();
    const res = await fetch(`${base}/api/license/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId: targetDeviceId })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        success: false,
        message: data?.message || data?.error || `License verification failed (HTTP ${res.status}).`
      };
    }
    return {
      success: true,
      code: key,
      duration: data.duration,
      days: data.days,
      subscription: data.subscription,
      message: data.message || 'Pro license verified and activated.'
    };
  } catch (err) {
    return {
      success: false,
      message: `Unable to reach license verification server: ${err.message}`
    };
  }
}

/**
 * Query authoritative server entitlement status for this device.
 */
export async function fetchServerLicenseStatus(deviceId = null) {
  const targetDeviceId = formatDeviceId(deviceId || getDeviceLicenseId());
  try {
    const base = getProxyBase();
    const res = await fetch(`${base}/api/license/status?deviceId=${encodeURIComponent(targetDeviceId)}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.subscription || null;
  } catch (_) {
    return null;
  }
}

/**
 * Revoke server-side entitlement when resetting to free tier.
 */
export async function revokeServerLicenseStatusOnServer(deviceId = null) {
  const targetDeviceId = formatDeviceId(deviceId || getDeviceLicenseId());
  try {
    const base = getProxyBase();
    await fetch(`${base}/api/license/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: targetDeviceId })
    });
  } catch (_) {}
}

/**
 * Admin-only server call to mint a new device-bound license key.
 * Requires valid ADMIN_API_KEY verified server-side by requireAdminSecret.
 */
export async function generateLicenseKeyOnServer({ deviceId, planDuration = '1m', adminKey }) {
  if (!adminKey || !String(adminKey).trim()) {
    throw new Error('Server Admin API Key is required to issue license keys.');
  }
  const base = getProxyBase();
  const res = await fetch(`${base}/api/admin/license/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': String(adminKey).trim()
    },
    body: JSON.stringify({ deviceId, planDuration })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.key) {
    throw new Error(data?.error || data?.message || `Failed to generate key (HTTP ${res.status}).`);
  }
  return data;
}
