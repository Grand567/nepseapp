// proxy/utils/licenseServerEngine.mjs
// Server-side cryptographic Pro License Key Engine (HMAC-SHA256 + Single-Use Burn Ledger).

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cachedSecretsByDir = new Map();

function resolveDataDir() {
  if (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR)) {
    return process.env.NEPSE_DATA_DIR;
  }
  return path.resolve(__dirname, '..', 'data');
}

function getLicenseStoreFile() {
  return path.join(resolveDataDir(), 'pro_licenses.json');
}

function getLicenseSecret() {
  const envSecret =
    process.env.PRO_LICENSE_SECRET ||
    process.env.ADMIN_API_KEY ||
    process.env.PROXY_ADMIN_SECRET;
  if (envSecret && String(envSecret).trim()) {
    return String(envSecret).trim();
  }

  const dataDir = resolveDataDir();
  if (cachedSecretsByDir.has(dataDir)) {
    return cachedSecretsByDir.get(dataDir);
  }

  const secretFile = path.join(dataDir, '.license_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) {
        cachedSecretsByDir.set(dataDir, existing);
        return existing;
      }
    }
  } catch (_) {}

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  } catch (_) {}
  cachedSecretsByDir.set(dataDir, generated);
  return generated;
}

function loadStore() {
  const file = getLicenseStoreFile();
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        burnedSerials: Array.isArray(parsed?.burnedSerials) ? parsed.burnedSerials : [],
        entitlements: (parsed?.entitlements && typeof parsed.entitlements === 'object') ? parsed.entitlements : {}
      };
    }
  } catch (_) {}
  return { burnedSerials: [], entitlements: {} };
}

function saveStore(store) {
  const dataDir = resolveDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const file = getLicenseStoreFile();
  const tmpFile = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpFile, file);
}

export function cleanDeviceId(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DS/, '').slice(0, 8);
}

export function formatDeviceId(clean) {
  const c = cleanDeviceId(clean);
  if (c.length < 8) return `DS-${c}`;
  return `DS-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}

export function mapPlanToDays(planStr) {
  const norm = String(planStr || '1M').trim().toUpperCase();
  const MAP = {
    '1M': 30,
    '2M': 60,
    '3M': 90,
    '6M': 180,
    '12M': 365,
    '1Y': 365
  };
  if (MAP[norm]) return MAP[norm];
  const match = norm.match(/^(\d+)\s*(M|D|Y)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'M').toUpperCase();
    if (val <= 0 || val > 60) return 30;
    if (unit === 'M') return val * 30;
    if (unit === 'D') return val;
    if (unit === 'Y') return val * 365;
  }
  return 30;
}

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

function computeKeySignature(targetDeviceIdClean, planStr, nonce) {
  const payload = `${targetDeviceIdClean}#${planStr}#${nonce}`;
  return crypto
    .createHmac('sha256', getLicenseSecret())
    .update(payload)
    .digest('hex')
    .toUpperCase()
    .slice(0, 8);
}

/**
 * Generates an HMAC-SHA256 signed, single-use, device-bound license key on the server.
 */
export function generateServerLicenseKey({ deviceId, planDuration = '1m', nonce = null } = {}) {
  const cleanId = cleanDeviceId(deviceId);
  if (cleanId.length !== 8) {
    throw new Error(`Invalid device ID: must contain 8 alphanumeric characters. Received "${deviceId}"`);
  }

  const cleanPlan = String(planDuration || '1m').trim().toUpperCase().replace(/[^0-9MYD]/g, '') || '1M';
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let cleanNonce = '';
  if (nonce && typeof nonce === 'string' && /^[A-Z0-9]{4,}$/i.test(nonce.trim())) {
    cleanNonce = nonce.trim().toUpperCase().slice(0, 4);
  } else {
    const rnd = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      cleanNonce += chars.charAt(rnd[i] % chars.length);
    }
  }

  const mac = computeKeySignature(cleanId, cleanPlan, cleanNonce);
  return `DS${cleanPlan}-${cleanId.slice(0, 4)}-${cleanId.slice(4, 8)}-${cleanNonce}-${mac}`;
}

export function buildFreeSubscription() {
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
 * Verifies, burns, and activates a license key for a device on the server.
 */
export function redeemServerLicenseKey(rawKey, currentDeviceId) {
  const thisDevice = cleanDeviceId(currentDeviceId);
  if (thisDevice.length !== 8) {
    return {
      success: false,
      code: 'INVALID_DEVICE_ID',
      message: 'Valid 8-character Device License ID is required.'
    };
  }

  const parsed = parseLicenseKey(rawKey);
  if (!parsed) {
    return {
      success: false,
      code: 'INVALID_FORMAT',
      message: 'Invalid license key format. Expected DS<PLAN>-XXXX-YYYY-ZZZZ-SIGNATURE.'
    };
  }

  if (parsed.targetDeviceIdClean !== thisDevice) {
    return {
      success: false,
      code: 'DEVICE_MISMATCH',
      message: `Device mismatch: this key is bound to ${parsed.targetDeviceIdFormatted} and cannot be used on ${formatDeviceId(thisDevice)}.`
    };
  }

  const expectedMac = computeKeySignature(parsed.targetDeviceIdClean, parsed.planStr, parsed.nonce);
  const expBuf = Buffer.from(expectedMac, 'utf8');
  const actBuf = Buffer.from(parsed.checksum, 'utf8');
  if (expBuf.length !== actBuf.length || !crypto.timingSafeEqual(expBuf, actBuf)) {
    return {
      success: false,
      code: 'INVALID_SIGNATURE',
      message: 'Invalid license key signature.'
    };
  }

  const store = loadStore();
  const burned = new Set(store.burnedSerials || []);
  if (burned.has(parsed.serialId) || burned.has(parsed.rawKey)) {
    return {
      success: false,
      code: 'ALREADY_REDEEMED',
      message: 'This single-use license key has already been redeemed.'
    };
  }

  const now = Date.now();
  const existing = store.entitlements?.[thisDevice];
  const baseTime = (existing && existing.isPro && Number(existing.expiresAt) > now)
    ? Number(existing.expiresAt)
    : now;
  const expiresAt = baseTime + parsed.days * 24 * 60 * 60 * 1000;

  const subscription = {
    isPro: true,
    tier: 'pro',
    planDuration: parsed.planDuration,
    subscribedAt: (existing && existing.isPro && Number(existing.expiresAt) > now && existing.subscribedAt) ? existing.subscribedAt : now,
    expiresAt,
    source: 'license_key',
    voucherCode: parsed.serialId,
    deviceId: formatDeviceId(thisDevice)
  };

  store.burnedSerials = [...burned, parsed.serialId];
  store.entitlements[thisDevice] = subscription;
  saveStore(store);

  return {
    success: true,
    duration: parsed.planDuration,
    days: parsed.days,
    subscription,
    message: `Unlocked ${parsed.planStr} Pro access (${parsed.days} days) for ${formatDeviceId(thisDevice)}.`
  };
}

/**
 * Returns authoritative server-side subscription state for a device.
 */
export function getServerLicenseStatus(currentDeviceId) {
  const thisDevice = cleanDeviceId(currentDeviceId);
  if (thisDevice.length !== 8) {
    return buildFreeSubscription();
  }
  const store = loadStore();
  const ent = store.entitlements?.[thisDevice];
  if (!ent || !ent.isPro || Number(ent.expiresAt || 0) <= Date.now()) {
    return buildFreeSubscription();
  }
  return {
    isPro: true,
    tier: 'pro',
    planDuration: ent.planDuration || '1m',
    subscribedAt: ent.subscribedAt || Date.now(),
    expiresAt: Number(ent.expiresAt),
    source: 'license_key',
    voucherCode: ent.voucherCode || null,
    deviceId: formatDeviceId(thisDevice)
  };
}

export function revokeServerLicenseStatus(currentDeviceId) {
  const thisDevice = cleanDeviceId(currentDeviceId);
  if (thisDevice.length !== 8) {
    return buildFreeSubscription();
  }
  const store = loadStore();
  if (store.entitlements && store.entitlements[thisDevice]) {
    delete store.entitlements[thisDevice];
    saveStore(store);
  }
  return buildFreeSubscription();
}
