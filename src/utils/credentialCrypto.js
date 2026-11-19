// src/utils/credentialCrypto.js
// Strict WebCrypto AES-256-GCM + PBKDF2-SHA256 Implementation & Profile Encryption Vault

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CIPHER_VERSION = 'v2_aes256gcm';

export const CIPHER_VERSION_GCM = 'v2_aes256gcm';
export const CIPHER_VERSION_IDB_GCM = 'v3_idb_aes256gcm';
const VAULT_IDB_NAME = 'drabyashree_crypto_vault_db';
const VAULT_IDB_STORE = 'device_aes_keys';

const _memoryDeviceKeys = new Map();
const _pendingDeviceKeys = new Map();

function getCryptoSubtle() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  if (typeof crypto !== 'undefined' && crypto.webcrypto && crypto.webcrypto.subtle) {
    return crypto.webcrypto;
  }
  throw new Error('[CredentialCrypto] WebCrypto API (crypto.subtle) is required for MeroShare credential security.');
}

async function openKeyVaultDb() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VAULT_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VAULT_IDB_STORE)) {
          db.createObjectStore(VAULT_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function readKeyFromIdb(keyName) {
  const db = await openKeyVaultDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(VAULT_IDB_STORE, 'readonly');
      const store = tx.objectStore(VAULT_IDB_STORE);
      const getReq = store.get(keyName);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function writeKeyToIdb(keyName, cryptoKey) {
  const db = await openKeyVaultDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(VAULT_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VAULT_IDB_STORE);
      const putReq = store.put(cryptoKey, keyName);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => resolve(false);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Retrieves or generates a non-exportable AES-256-GCM CryptoKey scoped strictly to userId.
 */
export async function getOrCreateDeviceVaultKey(userId = 'guest_local') {
  const uid = String(userId || 'guest_local').trim() || 'guest_local';
  const cacheKey = `aes_gcm_v3_${uid}`;
  if (_memoryDeviceKeys.has(cacheKey)) {
    return _memoryDeviceKeys.get(cacheKey);
  }
  if (_pendingDeviceKeys.has(cacheKey)) {
    return _pendingDeviceKeys.get(cacheKey);
  }

  const initPromise = (async () => {
    const fromIdb = await readKeyFromIdb(cacheKey);
    if (fromIdb) {
      _memoryDeviceKeys.set(cacheKey, fromIdb);
      return fromIdb;
    }

    const webCrypto = getCryptoSubtle();
    const generated = await webCrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    _memoryDeviceKeys.set(cacheKey, generated);
    await writeKeyToIdb(cacheKey, generated);
    return generated;
  })();

  _pendingDeviceKeys.set(cacheKey, initPromise);
  try {
    return await initPromise;
  } finally {
    _pendingDeviceKeys.delete(cacheKey);
  }
}

export function clearVaultKeyCache(userId = null) {
  if (!userId) {
    _memoryDeviceKeys.clear();
    _pendingDeviceKeys.clear();
    return;
  }
  const cacheKey = `aes_gcm_v3_${String(userId).trim() || 'guest_local'}`;
  _memoryDeviceKeys.delete(cacheKey);
  _pendingDeviceKeys.delete(cacheKey);
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

/**
 * Asynchronous profile encryption using WebCrypto AES-256-GCM + PBKDF2-SHA256 vault.
 * Stores secrets ONLY inside `vaultEnvelope` (never writes enc_v1 XOR shadow fields).
 */
export async function encryptProfileCredentialsAsync(profile, masterPassphrase = 'drabyashree_nepse_vault_passphrase', userId = 'guest_local') {
  if (!profile) return profile;
  const sensitive = {
    password: profile.password || '',
    crn: profile.crn || '',
    pin: profile.pin || '',
    transactionPin: profile.transactionPin || ''
  };
  const envelope = await encryptMeroShareCredentials(sensitive, masterPassphrase);
  const { password, crn, pin, transactionPin, _needsVaultMigration, ...safeProfile } = profile;
  return {
    ...safeProfile,
    vaultEnvelope: envelope,
    hasLocalCredentials: Boolean(sensitive.password || sensitive.crn || sensitive.pin || sensitive.transactionPin)
  };
}

/**
 * Seamless non-exportable WebCrypto AES-256-GCM profile encryption bound per-user via IndexedDB CryptoKey + AAD.
 */
export async function encryptProfileVault(profile, userId = 'guest_local') {
  if (!profile || typeof profile !== 'object') return profile;
  const uid = String(userId || 'guest_local').trim() || 'guest_local';
  const sensitive = {
    password: profile.password || '',
    crn: profile.crn || '',
    pin: profile.pin || '',
    transactionPin: profile.transactionPin || ''
  };
  const hasSecrets = Boolean(sensitive.password || sensitive.crn || sensitive.pin || sensitive.transactionPin);
  const { password, crn, pin, transactionPin, _needsVaultMigration, vaultEnvelope: existingEnv, ...safeProfile } = profile;

  if (!hasSecrets && existingEnv?.version === CIPHER_VERSION_IDB_GCM) {
    return {
      ...safeProfile,
      vaultEnvelope: existingEnv,
      hasLocalCredentials: true
    };
  }
  if (!hasSecrets) {
    return {
      ...safeProfile,
      hasLocalCredentials: false
    };
  }

  const webCrypto = getCryptoSubtle();
  const key = await getOrCreateDeviceVaultKey(uid);
  const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoder = new TextEncoder();
  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(uid) },
    key,
    encoder.encode(JSON.stringify(sensitive))
  );

  return {
    ...safeProfile,
    hasLocalCredentials: true,
    vaultEnvelope: {
      version: CIPHER_VERSION_IDB_GCM,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
      encryptedAt: new Date().toISOString()
    }
  };
}

/**
 * Seamless decryption supporting v3 IndexedDB AES-GCM, v2 PBKDF2 AES-GCM, and auto-migration of legacy enc_v1 XOR vaults.
 */
export async function decryptProfileVault(profile, userId = 'guest_local') {
  if (!profile || typeof profile !== 'object') return profile;
  const uid = String(userId || 'guest_local').trim() || 'guest_local';

  if (profile.vaultEnvelope?.version === CIPHER_VERSION_IDB_GCM && profile.vaultEnvelope.iv && profile.vaultEnvelope.ciphertext) {
    try {
      const webCrypto = getCryptoSubtle();
      const key = await getOrCreateDeviceVaultKey(uid);
      const iv = base64ToBytes(profile.vaultEnvelope.iv);
      const ciphertext = base64ToBytes(profile.vaultEnvelope.ciphertext);
      const encoder = new TextEncoder();
      const decryptedBuffer = await webCrypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(uid) },
        key,
        ciphertext
      );
      const parsed = JSON.parse(new TextDecoder().decode(decryptedBuffer));
      return {
        ...profile,
        password: parsed.password || '',
        crn: parsed.crn || '',
        pin: parsed.pin || '',
        transactionPin: parsed.transactionPin || '',
        _needsVaultMigration: false
      };
    } catch (_) {
      return { ...profile, password: '', crn: '', pin: '', _needsVaultMigration: false };
    }
  }

  if (profile.vaultEnvelope?.version === CIPHER_VERSION) {
    try {
      const parsed = await decryptMeroShareCredentials(profile.vaultEnvelope, 'drabyashree_nepse_vault_passphrase');
      return {
        ...profile,
        password: parsed.password || '',
        crn: parsed.crn || '',
        pin: parsed.pin || '',
        _needsVaultMigration: true
      };
    } catch (_) {}
  }

  const legacy = decryptProfileCredentials(profile, uid);
  const hasLegacySecrets = Boolean(legacy.password || legacy.crn || legacy.pin);
  return {
    ...legacy,
    _needsVaultMigration: hasLegacySecrets
  };
}

/**
 * Asynchronous profile decryption using WebCrypto AES-256-GCM vault.
 */
export async function decryptProfileCredentialsAsync(profile, masterPassphrase = 'drabyashree_nepse_vault_passphrase', userId = 'guest_local') {
  if (!profile) return profile;
  if (profile.vaultEnvelope && profile.vaultEnvelope.version === CIPHER_VERSION) {
    try {
      const decrypted = await decryptMeroShareCredentials(profile.vaultEnvelope, masterPassphrase);
      return {
        ...profile,
        password: decrypted.password || '',
        crn: decrypted.crn || '',
        pin: decrypted.pin || ''
      };
    } catch (_) {}
  }
  return decryptProfileVault(profile, userId);
}
