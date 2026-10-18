// src/utils/credentialCrypto.js
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
