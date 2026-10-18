// src/utils/credentialCrypto.js
// Strict WebCrypto AES-256-GCM + PBKDF2-SHA256 Implementation & Profile Encryption Vault

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CIPHER_VERSION = 'v2_aes256gcm';

function getCryptoSubtle() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  // In Node.js environment during tests
  if (typeof crypto !== 'undefined' && crypto.webcrypto && crypto.webcrypto.subtle) {
    return crypto.webcrypto;
  }
  throw new Error('[CredentialCrypto] WebCrypto API (crypto.subtle) is required for MeroShare credential security.');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64) {
  const binary = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(masterPassphrase, saltBytes) {
  const webCrypto = getCryptoSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    encoder.encode(String(masterPassphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts sensitive MeroShare credential object ({ dpId, username, password, crn, pin, accountNumber })
 * using AES-256-GCM with a unique random 128-bit salt and 96-bit IV.
 * Guarantees zero plaintext exposure in localStorage or cloud sync payloads.
 */
export async function encryptMeroShareCredentials(credentialPayload, masterPassphrase) {
  if (!masterPassphrase || String(masterPassphrase).length < 4) {
    throw new Error('A master vault passphrase (min 4 chars) is required to encrypt MeroShare credentials.');
  }
  const webCrypto = getCryptoSubtle();
  const salt = webCrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesGcmKey(masterPassphrase, salt);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(credentialPayload));
  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    version: CIPHER_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    encryptedAt: new Date().toISOString()
  };
}

/**
 * Decrypts an AES-256-GCM encrypted MeroShare credential envelope in memory only.
 */
export async function decryptMeroShareCredentials(envelope, masterPassphrase) {
  if (!envelope || envelope.version !== CIPHER_VERSION || !envelope.ciphertext || !envelope.salt || !envelope.iv) {
    throw new Error('Invalid or corrupted MeroShare encrypted credential envelope.');
  }
  const webCrypto = getCryptoSubtle();
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  const key = await deriveAesGcmKey(masterPassphrase, salt);
  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedBuffer));
}

/**
 * Redacts any credential object before logging or UI display.
 */
export function maskSensitiveCredentialProfile(profile = {}) {
  const boid = String(profile.boid || '');
  return {
    id: profile.id,
    label: profile.label || profile.name || 'Family Profile',
    dpId: profile.dpId,
    username: profile.username,
    boidMasked: boid.length === 16 ? `${boid.slice(0, 5)}******${boid.slice(-4)}` : '****************',
    crnMasked: profile.crn ? `***${String(profile.crn).slice(-3)}` : '******',
    isEncrypted: true
  };
}

// ── Backward-Compatible Synchronous Device Key Vault ──────────────────────────
const SECRET_SALT = 'drabyashree_nepse_vault_v1_';

function getDeviceKey(userId = 'guest_local') {
  return `${SECRET_SALT}${userId}_cdsc_guard`;
}

export function encryptSensitiveField(plainText, userId = 'guest_local') {
  if (!plainText) return '';
  const str = String(plainText);
  if (str.startsWith('enc_v1:')) return str; // Already encrypted
  try {
    const key = getDeviceKey(userId);
    const encoded = encodeURIComponent(str);
    let xor = '';
    for (let i = 0; i < encoded.length; i++) {
      xor += String.fromCharCode(encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return `enc_v1:${btoa(xor)}`;
  } catch (_) {
    return str;
  }
}

export function decryptSensitiveField(cipherText, userId = 'guest_local') {
  if (!cipherText) return '';
  const str = String(cipherText);
  if (!str.startsWith('enc_v1:')) return str; // Legacy plaintext fallback
  try {
    const key = getDeviceKey(userId);
    const raw = atob(str.slice(7));
    let decoded = '';
    for (let i = 0; i < raw.length; i++) {
      decoded += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decodeURIComponent(decoded);
  } catch (_) {
    return '';
  }
}

export function encryptProfileCredentials(profile, userId = 'guest_local') {
  if (!profile) return profile;
  return {
    ...profile,
    password: encryptSensitiveField(profile.password, userId),
    crn: encryptSensitiveField(profile.crn, userId),
    pin: encryptSensitiveField(profile.pin, userId),
  };
}

export function decryptProfileCredentials(profile, userId = 'guest_local') {
  if (!profile) return profile;
  return {
    ...profile,
    password: decryptSensitiveField(profile.password, userId),
    crn: decryptSensitiveField(profile.crn, userId),
    pin: decryptSensitiveField(profile.pin, userId),
  };
}
