// src/utils/profileVaultStorage.js
// Scoped per-uid AES-256-GCM local profile vault storage & sign-out cache hygiene.

import {
  encryptProfileVault,
  decryptProfileVault,
  clearVaultKeyCache
} from './credentialCrypto.js';
import { safeStorageSetItem } from './calculations.js';

const SENSITIVE_SIGN_OUT_KEYS = [
  'nepse_hub_local_session',
  'nepse_hub_bulk_ipo_accounts',
  'nepse_credentials_vault',
  'nepse_admin_key',
  'nepse_portfolio_key',
  'drabyashree_telegram_token'
];

export function resolveActiveUserId(explicitUserId = null) {
  const clean = explicitUserId ? String(explicitUserId).trim() : '';
  if (clean && clean !== 'undefined' && clean !== 'null') {
    return clean;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const sess = JSON.parse(localStorage.getItem('nepse_hub_local_session') || 'null');
      if (sess?.uid) return String(sess.uid).trim();
    }
  } catch (_) {}
  return 'guest_local';
}

export function getUserProfileStorageKey(userId = null) {
  const uid = resolveActiveUserId(userId);
  return `nepse_hub_${uid}_profiles`;
}

/**
 * Loads profiles strictly for the specified userId (zero cross-user harvesting).
 * Automatically upgrades legacy enc_v1 XOR entries to non-exportable IndexedDB AES-256-GCM vaults.
 */
export async function loadEncryptedUserProfiles(userId = null) {
  const uid = resolveActiveUserId(userId);
  const key = getUserProfileStorageKey(uid);
  if (typeof localStorage === 'undefined') return [];

  let rawList = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rawList = parsed;
    }
  } catch (_) {
    return [];
  }

  let needsMigration = false;
  const decrypted = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const dec = await decryptProfileVault(item, uid);
    if (dec._needsVaultMigration) {
      needsMigration = true;
    }
    const { _needsVaultMigration, ...clean } = dec;
    decrypted.push(clean);
  }

  if (needsMigration && decrypted.length > 0) {
    try {
      const reEncrypted = await Promise.all(decrypted.map(p => encryptProfileVault(p, uid)));
      safeStorageSetItem(key, JSON.stringify(reEncrypted));
    } catch (_) {}
  }

  return decrypted;
}

/**
 * Encrypts and stores profiles strictly under the user's scoped key.
 * Dispatches sanitized event metadata (no credentials inside CustomEvent detail).
 */
export async function saveEncryptedUserProfiles(profiles = [], userId = null) {
  const uid = resolveActiveUserId(userId);
  const key = getUserProfileStorageKey(uid);
  if (typeof localStorage === 'undefined') return [];

  const list = Array.isArray(profiles) ? profiles : [];
  const encrypted = await Promise.all(list.map(p => encryptProfileVault(p, uid)));
  safeStorageSetItem(key, JSON.stringify(encrypted));
  syncCachedHoldingsSummary(list, uid);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { userId: uid, key } }));
    } catch (_) {}
  }
  return encrypted;
}

export function getHoldingsSummaryStorageKey(userId = null) {
  return `nepse_hub_${resolveActiveUserId(userId)}_holdings_summary`;
}

/**
 * Persists a non-secret holding summary for fast synchronous portfolio lookup across modules.
 */
export function syncCachedHoldingsSummary(profiles = [], userId = null) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const key = getHoldingsSummaryStorageKey(userId);
    const summaryProfiles = (Array.isArray(profiles) ? profiles : [])
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: p.id || null,
        name: p.name || 'Account',
        dpName: p.dpName || '',
        lastSyncedAt: p.lastSyncedAt || null,
        holdings: (Array.isArray(p.holdings) ? p.holdings : [])
          .map((h) => ({
            symbol: String(h?.symbol || h?.scrip || h?.script || '').toUpperCase().trim(),
            kitta: Number(h?.kitta ?? h?.units ?? h?.qty ?? 0),
            wacc: Number(h?.wacc || 0)
          }))
          .filter((h) => h.symbol && h.kitta > 0)
      }));
    localStorage.setItem(key, JSON.stringify(summaryProfiles));
    return summaryProfiles;
  } catch (_) {
    return [];
  }
}

/**
 * Synchronously reads cached portfolio profiles/holdings for the active user vault,
 * gracefully falling back to legacy keys only when no active summary exists.
 */
export function readCanonicalPortfolioSymbolsSync(userId = null) {
  const symbols = new Set();
  const profilesOut = [];
  if (typeof localStorage === 'undefined') return { symbols, profiles: profilesOut };

  const uid = resolveActiveUserId(userId);
  const candidateKeys = [
    getHoldingsSummaryStorageKey(uid),
    getUserProfileStorageKey(uid),
    `nepse_hub_${uid}_transactions`,
    'nepse_portfolio_profiles',
    'nepse_portfolio_holdings',
    'nepse_portfolio',
    'nepse_portfolio_v1'
  ];

  for (const key of candidateKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (profilesOut.length === 0) profilesOut.push(...parsed);
        for (const item of parsed) {
          if (Array.isArray(item?.holdings)) {
            for (const h of item.holdings) {
              const sym = String(h?.symbol || h?.scrip || h?.script || '').toUpperCase().trim();
              const kitta = Number(h?.kitta ?? h?.units ?? h?.qty ?? 1);
              if (sym && sym !== 'NEPSE' && kitta > 0) symbols.add(sym);
            }
          } else {
            const sym = String(typeof item === 'string' ? item : (item?.symbol || item?.scrip || '')).toUpperCase().trim();
            if (sym && sym !== 'NEPSE') symbols.add(sym);
          }
        }
        if (symbols.size > 0 && (key === candidateKeys[0] || key === candidateKeys[1])) {
          break;
        }
      }
    } catch (_) {}
  }

  return { symbols, profiles: profilesOut };
}

/**
 * Wipes session tokens, legacy global account blobs, and in-memory vault keys on sign-out.
 */
export function clearSensitiveStorageOnSignOut(userId = null) {
  clearVaultKeyCache(userId || null);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('nepse_sync_session_token');
    }
  } catch (_) {}
  try {
    if (typeof localStorage !== 'undefined') {
      if (userId) {
        localStorage.removeItem(getHoldingsSummaryStorageKey(userId));
      }
      for (const k of SENSITIVE_SIGN_OUT_KEYS) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {}
}
