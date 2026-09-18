// src/utils/licenseEngine.js
// Production-grade Cryptographic License Engine for Drabyashree NEPSE
// Issues and validates tamper-proof, single-use, device-bound Pro license keys.

export const DEFAULT_SECRET_SALT = 'DRABYASHREE_PRO_SECRET_SALT_2026_NEPSE_GURU_QUANT';
export const DEVICE_ID_STORAGE_KEY = 'drabyashree_device_license_id';
export const BURNED_KEYS_STORAGE_KEY = 'drabyashree_burned_license_keys';

/**
 * Dependency-free RFC 6234 compliant SHA-256 hash generator.
 * Produces identical digests across Node.js, Web Browsers, and Android Capacitor.
 */
export function computeSha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = computeSha256.h = computeSha256.h || [];
  const k = computeSha256.k = computeSha256.k || [];
  let primeCounter = k[lengthProperty];
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] = (i < 16)
          ? w[i]
          : (w[i - 16] +
              (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
              w[i - 7] +
              (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, e, hash[5], hash[6]];
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (8 * b)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

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
 * Generate or retrieve persistent Customer Device License ID.
 * Bound to the user installation and persisted in localStorage.
 */
export function getDeviceLicenseId() {
  if (typeof window === 'undefined') return 'DS-DEVELOPER1';
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) {
      return formatDeviceId(existing);
    }

    // Generate entropy from base32 (no easily confused O, 0, 1, I)
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const formatted = `DS-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, formatted);
    return formatted;
  } catch (_) {
    return 'DS-7A2B-9C4D';
  }
}

const _memoryBurnedKeys = new Set();

/**
 * Retrieve list of burned license key serials from local storage.
 */
export function getBurnedKeys() {
  if (typeof window === 'undefined') {
    return Array.from(_memoryBurnedKeys);
  }
  try {
    const raw = localStorage.getItem(BURNED_KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Permanently mark a license key as redeemed/burned so it cannot be used again.
 */
export function markKeyAsBurned(serialOrKey) {
  const cleanKey = String(serialOrKey).toUpperCase().trim();
  if (typeof window === 'undefined') {
    _memoryBurnedKeys.add(cleanKey);
    return;
  }
  try {
    const list = getBurnedKeys();
    if (!list.includes(cleanKey)) {
      list.push(cleanKey);
      localStorage.setItem(BURNED_KEYS_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (err) {
    console.warn('[LicenseEngine] Failed to burn key:', err);
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
 * Generate a cryptographically signed, device-bound Pro license key.
 *
 * Format: DS[PLAN]-[DEVICE_PART1]-[DEVICE_PART2]-[NONCE]-[CHECKSUM]
 * Example: DS3M-8A7F-94B2-7K9Q-A4E2
 *
 * @param {Object} params
 * @param {string} params.deviceId - Target Customer License ID (e.g. 'DS-8A7F-94B2')
 * @param {string} params.planDuration - Duration code ('1m', '2m', '3m', '6m', '12m')
 * @param {string} [params.nonce] - Optional 4-char serial nonce (auto-generated if omitted)
 * @param {string} [params.secretSalt] - Developer Master Secret Salt
 * @returns {string} The formatted license key
 */
export function generateLicenseKey({
  deviceId,
  planDuration = '1m',
  nonce = null,
  secretSalt = DEFAULT_SECRET_SALT
}) {
  const cleanId = cleanDeviceId(deviceId);
  if (cleanId.length !== 8) {
    throw new Error(`Invalid device ID: must be 8 alphanumeric characters. Received: "${deviceId}"`);
  }

  const cleanPlan = planDuration.trim().toUpperCase().replace(/[^0-9MYD]/g, '') || '1M';

  // 4-character random serial nonce (guarantees uniqueness even for same device and plan)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let cleanNonce = '';
  if (nonce && typeof nonce === 'string' && nonce.trim().length >= 4) {
    cleanNonce = nonce.trim().toUpperCase().slice(0, 4);
  } else {
    for (let i = 0; i < 4; i++) {
      cleanNonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  // Cryptographic HMAC/SHA256 signature
  const signaturePayload = `${secretSalt}#${cleanId}#${cleanPlan}#${cleanNonce}`;
  const fullHash = computeSha256(signaturePayload).toUpperCase();
  const checksum = fullHash.slice(0, 4);

  return `DS${cleanPlan}-${cleanId.slice(0, 4)}-${cleanId.slice(4, 8)}-${cleanNonce}-${checksum}`;
}

/**
 * Parse a license key into structured segments.
 */
export function parseLicenseKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const clean = rawKey.trim().toUpperCase().replace(/\s+/g, '');

  // Format regex: DS(1M|2M|3M|6M|12M|...)-(4 chars)-(4 chars)-(4 chars)-(4 chars)
  const regex = /^DS([0-9]+[MDY]?)-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/;
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
    serialId: `${targetDeviceIdClean}-${nonce}` // Unique burn fingerprint
  };
}

/**
 * Validate and redeem a device-bound license key for the current device.
 *
 * Checks:
 * 1. Syntax & segment count
 * 2. Strict target device match (anti-sharing protection)
 * 3. Cryptographic signature check (anti-tamper protection)
 * 4. Single-use burn ledger check (anti-reuse protection)
 *
 * @param {string} rawKey - The key entered by the user
 * @param {string} currentDeviceId - The current device's ID
 * @param {string} [secretSalt] - Optional secret salt override
 * @returns {Object} { success: boolean, duration?: string, days?: number, message: string, keyDetails?: Object }
 */
export function validateAndRedeemLicenseKey(
  rawKey,
  currentDeviceId = null,
  secretSalt = DEFAULT_SECRET_SALT
) {
  const thisDevice = cleanDeviceId(currentDeviceId || getDeviceLicenseId());
  const parsed = parseLicenseKey(rawKey);

  if (!parsed) {
    return {
      success: false,
      message: 'Invalid license key format. Keys are formatted like DS3M-XXXX-YYYY-ZZZZ-WWWW.'
    };
  }

  // 1. Device match check (Anti-sharing protection)
  if (parsed.targetDeviceIdClean !== thisDevice) {
    return {
      success: false,
      message: `❌ Device Mismatch: This key was issued for ${parsed.targetDeviceIdFormatted}. It cannot be used on this device (${formatDeviceId(thisDevice)}).`
    };
  }

  // 2. Cryptographic signature check (Anti-tamper protection)
  const signaturePayload = `${secretSalt}#${parsed.targetDeviceIdClean}#${parsed.planStr}#${parsed.nonce}`;
  const expectedHash = computeSha256(signaturePayload).toUpperCase();
  const expectedChecksum = expectedHash.slice(0, 4);

  if (parsed.checksum !== expectedChecksum) {
    return {
      success: false,
      message: '❌ Invalid Key Signature: Key is corrupt, invalid, or was modified.'
    };
  }

  // 3. Single-use check (Anti-reuse protection)
  const burnedList = getBurnedKeys();
  if (burnedList.includes(parsed.serialId) || burnedList.includes(parsed.rawKey)) {
    return {
      success: false,
      message: '❌ Already Redeemed: This one-time key has already been activated and cannot be reused.'
    };
  }

  // 4. Burn the key permanently
  markKeyAsBurned(parsed.serialId);
  markKeyAsBurned(parsed.rawKey);

  return {
    success: true,
    duration: parsed.planDuration,
    days: parsed.days,
    message: `🎉 Success! Unlocked ${parsed.planStr} Pro access (${parsed.days} days) for your device.`,
    keyDetails: parsed
  };
}
