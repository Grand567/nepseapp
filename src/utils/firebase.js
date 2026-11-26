// ─── Local Auth System ────────────────────────────────────────────────────────
// Provides a fully self-contained email + password authentication system.
// All data stored in localStorage — zero external services required.
// Also wraps Firebase if configured (real Google/Facebook login).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { clearSensitiveStorageOnSignOut } from './profileVaultStorage.js';

// ─── Firebase Setup (only activates if real keys are present) ─────────────────

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.apiKey.length > 10;

let auth = null;
let googleProvider = null;
let facebookProvider = null;
let db = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0
      ? initializeApp(firebaseConfig)
      : getApps()[0];
    auth = getAuth(app);
    auth.useDeviceLanguage();
    db = getFirestore(app);

    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('email');
    googleProvider.addScope('profile');

    facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope('email');
    facebookProvider.addScope('public_profile');
  } catch (e) {
    console.warn('[Auth] Firebase init failed:', e.message);
    auth = null;
    db = null;
  }
}

// ─── Local Auth Storage Helpers ───────────────────────────────────────────────

const LOCAL_USERS_KEY = 'nepse_hub_local_users';
const LOCAL_SESSION_KEY = 'nepse_hub_local_session';
const SYNC_TOKEN_SESSION_KEY = 'nepse_sync_session_token';

function getWebCryptoSubtle() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  if (typeof crypto !== 'undefined' && crypto.webcrypto?.subtle) return crypto.webcrypto.subtle;
  return null;
}

const legacyHashSimple = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

async function sha256Hex(str) {
  const subtle = getWebCryptoSubtle();
  if (!subtle) return legacyHashSimple(str);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPasswordClient(password, emailKey) {
  const subtle = getWebCryptoSubtle();
  if (!subtle) {
    throw new Error('Secure WebCrypto PBKDF2 hashing is required.');
  }
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`drabyashree-auth-v2:${emailKey}`), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    256
  );
  return 'pbkdf2_v2_' + Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let _syncSessionToken = (() => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SYNC_TOKEN_SESSION_KEY) : null;
  } catch {
    return null;
  }
})();

export const getSyncSessionToken = () => {
  if (_syncSessionToken) return _syncSessionToken;
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SYNC_TOKEN_SESSION_KEY) : null;
  } catch {
    return null;
  }
};

export const setSyncSessionToken = (token) => {
  _syncSessionToken = token || null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) sessionStorage.setItem(SYNC_TOKEN_SESSION_KEY, token);
      else sessionStorage.removeItem(SYNC_TOKEN_SESSION_KEY);
    }
  } catch (_) {}
};

const getLocalUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}');
  } catch { return {}; }
};

const saveLocalUsers = (users) => {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
};

export const getLocalSession = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
  } catch { return null; }
};

const saveLocalSession = (user) => {
  if (user) {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  }
};

export const exchangeFirebaseTokenForSync = async (fbUser) => {
  if (!fbUser || typeof fbUser.getIdToken !== 'function' || !fbUser.email) return null;
  if (_inFlightTokenExchange) return _inFlightTokenExchange;

  _inFlightTokenExchange = (async () => {
    try {
      const idToken = await fbUser.getIdToken();
      if (!idToken) return null;

      const emailKey = String(fbUser.email).trim().toLowerCase();
      const res = await callSyncProxy('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'nepse',
          email: emailKey,
          name: fbUser.displayName || '',
          firebaseIdToken: idToken
        })
      }, 75000);

      if (!res || !res.ok) return null;
      const json = await res.json();
      if (json?.success && json.token) {
        setSyncSessionToken(json.token);
        if (typeof localStorage !== 'undefined' && fbUser.uid) {
          try {
            localStorage.setItem(`nepse_hub_${fbUser.uid}_last_sync`, json.updatedAt || new Date().toISOString());
          } catch (_) {}
        }
        if (json.data && typeof json.data === 'object' && Object.keys(json.data).length > 0) {
          _cachedCloudData = json.data;
          hydrateLocalDataFromCloud(fbUser.uid, json.data);
        }
        return json;
      }
      return null;
    } catch (err) {
      console.warn('[CloudSync] Firebase token exchange warning:', err.message);
      return null;
    } finally {
      _inFlightTokenExchange = null;
    }
  })();

  return _inFlightTokenExchange;
};

let _inFlightTokenExchange = null;

export const ensureSyncSessionToken = async () => {
  const existing = getSyncSessionToken();
  if (existing) return existing;
  if (isFirebaseConfigured && auth?.currentUser) {
    const json = await exchangeFirebaseTokenForSync(auth.currentUser).catch(() => null);
    if (json?.token) return json.token;
  }
  return getSyncSessionToken();
};

// ─── Auth State Listener ──────────────────────────────────────────────────────

let _localAuthCallbacks = [];
let _localUser = getLocalSession(); // restore session on load

/**
 * Listen for auth state changes.
 * Returns an unsubscribe function.
 * Supports both Firebase and local auth.
 */
export const onAuthChange = (callback) => {
  // Always register the callback to local auth callbacks so that local signin/signout notifications work!
  _localAuthCallbacks.push(callback);

  let unsubscribeFirebase = null;
  if (isFirebaseConfigured && auth) {
    unsubscribeFirebase = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        if (!getSyncSessionToken()) {
          await exchangeFirebaseTokenForSync(fbUser).catch(() => null);
        }
        callback(fbUser);
      } else {
        // Firebase not logged in — fall back to local session
        callback(getLocalSession());
      }
    });
  } else {
    // Immediately notify with current session (only in purely local mode to avoid double calls when Firebase is loading)
    setTimeout(() => callback(_localUser), 0);
  }

  return () => {
    _localAuthCallbacks = _localAuthCallbacks.filter(cb => cb !== callback);
    if (unsubscribeFirebase) unsubscribeFirebase();
  };
};

const notifyLocalAuth = (user) => {
  _localUser = user;
  saveLocalSession(user);
  _localAuthCallbacks.forEach(cb => cb(user));
};

// ─── Sign In with Google (Firebase) ──────────────────────────────────────────

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) throw new Error('Firebase not configured');
  try {
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    const result = await signInWithPopup(auth, googleProvider);
    if (result?.user) {
      await exchangeFirebaseTokenForSync(result.user).catch(() => null);
    }
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
};

// ─── Sign In with Facebook (Firebase) ────────────────────────────────────────

export const signInWithFacebook = async () => {
  if (!auth || !facebookProvider) throw new Error('Firebase not configured');
  try {
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, facebookProvider);
      return null;
    }
    const result = await signInWithPopup(auth, facebookProvider);
    if (result?.user) {
      await exchangeFirebaseTokenForSync(result.user).catch(() => null);
    }
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, facebookProvider);
      return null;
    }
    throw err;
  }
};

// ─── Local Email / Password Auth ─────────────────────────────────────────────

let _cachedCloudData = null;
let _activeSyncEndpoint = null;

export const getCachedCloudData = () => _cachedCloudData;

export const getCandidateSyncEndpoints = () => {
  const endpoints = [];
  const isNative = Capacitor.isNativePlatform();

  // 1. Configured VITE_PROXY_URL (Primary for production & Capacitor mobile)
  const configuredProxy = import.meta.env.VITE_PROXY_URL;
  if (configuredProxy) {
    const cleanConfigured = configuredProxy.replace(/\/$/, '') + '/api/sync';
    if (!endpoints.includes(cleanConfigured)) {
      endpoints.push(cleanConfigured);
    }
  }

  // 2. Render cloud proxy fallback
  const renderProxy = 'https://drabyashree-nepse-hub.onrender.com/api/sync';
  if (!endpoints.includes(renderProxy)) {
    endpoints.push(renderProxy);
  }

  // 3. For Web browser or Electron desktop environments ONLY:
  // NEVER use relative '/api/sync' or localhost on native Android/iOS Capacitor
  if (!isNative && typeof window !== 'undefined') {
    const isElectron = window.location.protocol === 'file:' || (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron'));
    if (isElectron) {
      endpoints.unshift('http://localhost:5000/api/sync');
    } else {
      endpoints.unshift('/api/sync');
    }
  }

  return endpoints;
};

export const callSyncProxy = async (endpointPath, options = {}, timeoutMs = 70000) => {
  const candidates = getCandidateSyncEndpoints();
  const orderedCandidates = _activeSyncEndpoint
    ? [_activeSyncEndpoint, ...candidates.filter(c => c !== _activeSyncEndpoint)]
    : candidates;

  let lastError = null;

  for (const base of orderedCandidates) {
    const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
    // Local development endpoints fail fast (3.5s). Remote cloud endpoints allow Render cold starts (up to 75s).
    const effTimeout = isLocal ? Math.min(timeoutMs, 3500) : Math.max(timeoutMs, 75000);
    const maxRetries = isLocal ? 0 : 2;
    let attempt = 0;
    let delay = 1500;

    let cleanPath = endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath;
    if (base.endsWith('/api/sync') && cleanPath.startsWith('/api/sync/')) {
      cleanPath = cleanPath.slice('/api/sync'.length);
    }
    const url = `${base}${cleanPath}`;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), effTimeout);

        const res = await fetch(url, {
          ...options,
          headers: {
            'Accept': 'application/json',
            ...(options.headers || {})
          },
          signal: controller.signal
        });
        clearTimeout(timer);

        // Render cold start can return 502/503/504 while gateway or container boots
        if (!isLocal && (res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
          attempt++;
          console.log(`[CloudSync] Cold-start HTTP ${res.status} from ${base}. Retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          continue;
        }

        // If server responded with ANY valid HTTP status, this endpoint is alive!
        _activeSyncEndpoint = base;
        return res;
      } catch (err) {
        lastError = err;
        if (!isLocal && attempt < maxRetries && err.name !== 'AbortError') {
          attempt++;
          console.log(`[CloudSync] Transient error on ${base} (${err.message}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        } else {
          break;
        }
      }
    }
  }

  _activeSyncEndpoint = null;

  if (lastError?.name === 'AbortError') {
    throw new Error('Connection timed out while contacting sync server (Render cold start). Please check your internet connection or try again in a moment.');
  }

  throw lastError || new Error('Network error: unable to reach any Cloud Sync endpoint.');
};

export const getSyncProxyEndpoint = () => {
  return _activeSyncEndpoint || getCandidateSyncEndpoints()[0];
};

export const pingSyncServer = () => {
  callSyncProxy('/health', { method: 'GET' }, 75000).catch(() => {});
};
// Trigger non-blocking warm-up ping
pingSyncServer();

/**
 * Hydrates cloud data directly into localStorage and dispatches reactive events.
 */
export const hydrateLocalDataFromCloud = (uid, cloudData) => {
  if (!cloudData || typeof cloudData !== 'object' || !uid) return;

  try {
    const userProfileKey = `nepse_hub_${uid}_profiles`;
    const userTxKey = `nepse_hub_${uid}_transactions`;

    // 1. Scoped User Profiles only (preserve local AES-GCM vaultEnvelopes, never mirror to global keys)
    const profiles = cloudData.profiles || cloudData.bulkAccounts || [];
    if (Array.isArray(profiles) && profiles.length > 0) {
      let existingLocal = [];
      try {
        const rawLocal = localStorage.getItem(userProfileKey);
        if (rawLocal) existingLocal = JSON.parse(rawLocal);
      } catch (_) {}
      const mergedProfiles = profiles.map(cp => {
        const localMatch = Array.isArray(existingLocal)
          ? existingLocal.find(lp => (cp.boid && lp.boid === cp.boid) || (cp.id && lp.id === cp.id))
          : null;
        return localMatch?.vaultEnvelope
          ? { ...cp, vaultEnvelope: localMatch.vaultEnvelope, hasLocalCredentials: true }
          : cp;
      });
      localStorage.setItem(userProfileKey, JSON.stringify(mergedProfiles));
      window.dispatchEvent(new StorageEvent('storage', { key: userProfileKey, newValue: JSON.stringify(mergedProfiles) }));
      window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { userId: uid, key: userProfileKey } }));
    }

    // 2. Transactions
    if (Array.isArray(cloudData.transactions) && cloudData.transactions.length > 0) {
      localStorage.setItem(userTxKey, JSON.stringify(cloudData.transactions));
      window.dispatchEvent(new StorageEvent('storage', { key: userTxKey, newValue: JSON.stringify(cloudData.transactions) }));
    }

    // 3. Watchlist
    if (Array.isArray(cloudData.watchlist) && cloudData.watchlist.length > 0) {
      localStorage.setItem('nepse_user_watchlist', JSON.stringify(cloudData.watchlist));
      window.dispatchEvent(new StorageEvent('storage', { key: 'nepse_user_watchlist', newValue: JSON.stringify(cloudData.watchlist) }));
    }

    // 4. Trade Notes
    if (Array.isArray(cloudData.tradeNotes) && cloudData.tradeNotes.length > 0) {
      localStorage.setItem('nepse_trade_notes', JSON.stringify(cloudData.tradeNotes));
      window.dispatchEvent(new StorageEvent('storage', { key: 'nepse_trade_notes', newValue: JSON.stringify(cloudData.tradeNotes) }));
    }

    // 5. Stock Alerts
    if (Array.isArray(cloudData.stockAlerts) && cloudData.stockAlerts.length > 0) {
      localStorage.setItem('nepse_stock_alerts', JSON.stringify(cloudData.stockAlerts));
      window.dispatchEvent(new StorageEvent('storage', { key: 'nepse_stock_alerts', newValue: JSON.stringify(cloudData.stockAlerts) }));
    }

    // 6. Trade Journal
    if (Array.isArray(cloudData.tradeJournal) && cloudData.tradeJournal.length > 0) {
      localStorage.setItem('nepse_trade_journal', JSON.stringify(cloudData.tradeJournal));
      window.dispatchEvent(new StorageEvent('storage', { key: 'nepse_trade_journal', newValue: JSON.stringify(cloudData.tradeJournal) }));
    }

    // 7. Paper Trading
    if (cloudData.paperTrading && typeof cloudData.paperTrading === 'object') {
      if (cloudData.paperTrading.balance !== undefined) {
        localStorage.setItem('nepse_paper_balance', cloudData.paperTrading.balance.toString());
      }
      if (Array.isArray(cloudData.paperTrading.positions)) {
        localStorage.setItem('nepse_paper_positions', JSON.stringify(cloudData.paperTrading.positions));
      }
      if (Array.isArray(cloudData.paperTrading.orders)) {
        localStorage.setItem('nepse_paper_orders', JSON.stringify(cloudData.paperTrading.orders));
      }
    }

    // 8. Dispatch custom sync restoration event (no raw secrets)
    window.dispatchEvent(new CustomEvent('nepse_cloud_data_restored', {
      detail: {
        uid,
        profiles,
        transactions: cloudData.transactions || [],
        watchlist: cloudData.watchlist || [],
        tradeNotes: cloudData.tradeNotes || [],
        stockAlerts: cloudData.stockAlerts || [],
        tradeJournal: cloudData.tradeJournal || [],
        paperTrading: cloudData.paperTrading || null
      }
    }));

    console.log(`[CloudSync] Data hydration complete for user ${uid}.`);
  } catch (err) {
    console.warn('[CloudSync] Hydration warning:', err);
  }
};

export const resolveUserEmail = (userId, userEmail) => {
  if (userEmail && typeof userEmail === 'string' && userEmail.includes('@')) {
    return userEmail.trim().toLowerCase();
  }
  if (userId && typeof userId === 'string' && userId.includes('@')) {
    return userId.trim().toLowerCase();
  }
  if (_localUser?.email && _localUser.email.includes('@')) {
    return _localUser.email.trim().toLowerCase();
  }
  try {
    const session = getLocalSession();
    if (session?.email && session.email.includes('@')) {
      return session.email.trim().toLowerCase();
    }
  } catch (_) {}
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const users = JSON.parse(raw);
      if (userId) {
        for (const k of Object.keys(users)) {
          if (users[k]?.uid === userId && users[k]?.email) {
            return users[k].email.trim().toLowerCase();
          }
        }
      }
      const emails = Object.keys(users);
      if (emails.length === 1 && emails[0].includes('@')) {
        return emails[0].trim().toLowerCase();
      }
    }
  } catch (_) {}
  return null;
};

/**
 * Register a new local account (email + password).
 * Returns the user object or throws with a friendly error.
 */
export const registerLocal = async (displayName, email, password) => {
  if (!displayName || displayName.trim().length < 2)
    throw new Error('Please enter your full name (at least 2 characters).');
  if (!email || !email.includes('@'))
    throw new Error('Please enter a valid email address.');
  if (!password || password.length < 4)
    throw new Error('Password must be at least 4 characters.');

  const users = getLocalUsers();
  const emailKey = email.trim().toLowerCase();

  const hashedPw = await hashPasswordClient(password, emailKey);
  let uid = 'usr_' + (await sha256Hex(emailKey)).slice(0, 12);

  // Collect pre-existing non-secret guest metadata only (never upload passwords/PINs/vaults)
  let initialData = {};
  try {
    const guestProfilesRaw = JSON.parse(localStorage.getItem('nepse_hub_guest_local_profiles') || '[]');
    const profiles = Array.isArray(guestProfilesRaw)
      ? guestProfilesRaw.map(({ password: _p, crn: _c, pin: _pn, transactionPin: _tp, vaultEnvelope: _ve, ...safe }) => ({
          ...safe,
          hasLocalCredentials: Boolean(_p || _pn || _tp || _ve)
        }))
      : [];
    const watchlist = JSON.parse(localStorage.getItem('nepse_user_watchlist') || '[]');
    const notes = JSON.parse(localStorage.getItem('nepse_trade_notes') || '[]');
    const alerts = JSON.parse(localStorage.getItem('nepse_stock_alerts') || '[]');
    const journal = JSON.parse(localStorage.getItem('nepse_trade_journal') || '[]');

    initialData = {
      ...(profiles.length > 0 ? { profiles, bulkAccounts: profiles } : {}),
      ...(watchlist.length > 0 ? { watchlist } : {}),
      ...(notes.length > 0 ? { tradeNotes: notes } : {}),
      ...(alerts.length > 0 ? { stockAlerts: alerts } : {}),
      ...(journal.length > 0 ? { tradeJournal: journal } : {})
    };
  } catch (_) {}

  // Sync registration with cloud
  try {
    const regRes = await callSyncProxy('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'nepse',
        email: emailKey,
        passwordHash: hashedPw,
        name: displayName.trim(),
        initialData
      })
    }, 75000);

    if (regRes.status === 409) {
      throw new Error('An account with this email already exists. Please switch to Sign In.');
    }

    if (regRes.ok) {
      const regJson = await regRes.json();
      if (regJson.token) setSyncSessionToken(regJson.token);
      if (regJson.user?.uid) uid = regJson.user.uid;
      if (regJson.data && typeof regJson.data === 'object') {
        _cachedCloudData = regJson.data;
        hydrateLocalDataFromCloud(uid, regJson.data);
      }
    } else {
      let errJson = null;
      try {
        errJson = await regRes.json();
      } catch (_) {}
      console.warn(`[CloudSync] Remote registration HTTP ${regRes.status}:`, errJson?.message);
      if (regRes.status === 400) {
        throw new Error(errJson?.message || 'Invalid registration details.');
      } else if (regRes.status === 403) {
        throw new Error(errJson?.message || 'Registration forbidden (HTTP 403).');
      }
    }
  } catch (syncErr) {
    if (
      syncErr.message.includes('already exists') ||
      syncErr.message.includes('Invalid registration') ||
      syncErr.message.includes('Registration forbidden')
    ) {
      throw syncErr;
    }
    console.warn('[CloudSync] Remote registration warning:', syncErr.message);
  }

  const userRecord = {
    uid,
    displayName: displayName.trim(),
    email: emailKey,
    photoURL: null,
    passwordHash: hashedPw,
    createdAt: Date.now(),
    isLocal: true,
  };
  users[emailKey] = userRecord;
  saveLocalUsers(users);

  const userObj = { uid, displayName: displayName.trim(), email: emailKey, photoURL: null, isLocal: true };
  notifyLocalAuth(userObj);
  return userObj;
};

/**
 * Sign in with a local email + password.
 * Restores cloud vault data across fresh installations.
 */
export const signInLocal = async (email, password) => {
  if (!email || !password) throw new Error('Please enter your email and password.');

  const users = getLocalUsers();
  const emailKey = email.trim().toLowerCase();
  const hashedPw = await hashPasswordClient(password, emailKey);
  const legacyPwHash = legacyHashSimple(password + emailKey);
  let record = users[emailKey];
  let uid = record?.uid || ('usr_' + (await sha256Hex(emailKey)).slice(0, 12));

  // Seamless offline sign-in when disconnected
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline && record) {
    if (record.passwordHash && record.passwordHash !== hashedPw && record.passwordHash !== legacyPwHash) {
      throw new Error('Incorrect password. Please verify your password and try again.');
    }
    const userObj = {
      uid: record.uid,
      displayName: record.displayName,
      email: record.email,
      photoURL: record.photoURL || null,
      isLocal: true,
      offlineAuthenticated: true
    };
    notifyLocalAuth(userObj);
    return userObj;
  }

  let serverAuthSuccess = false;
  let serverErrorMessage = null;
  let serverStatusCode = null;

  try {
    const res = await callSyncProxy('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'nepse',
        email: emailKey,
        passwordHash: hashedPw,
        legacyPasswordHash: legacyPwHash
      })
    }, 75000);

    serverStatusCode = res.status;

    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        serverAuthSuccess = true;
        if (json.token) setSyncSessionToken(json.token);
        if (json.user?.uid) uid = json.user.uid;
        if (json.data && typeof json.data === 'object' && Object.keys(json.data).length > 0) {
          _cachedCloudData = json.data;
          hydrateLocalDataFromCloud(uid, json.data);
        }
        record = {
          uid,
          displayName: json.user?.name || record?.displayName || email.split('@')[0],
          email: emailKey,
          photoURL: null,
          passwordHash: hashedPw,
          createdAt: record?.createdAt || Date.now(),
          isLocal: true,
        };
        users[emailKey] = record;
        saveLocalUsers(users);
      }
    } else {
      let errJson = null;
      try {
        errJson = await res.json();
      } catch (_) {}

      if (res.status === 401) {
        throw new Error(errJson?.message || 'Incorrect password. Please verify your password and try again.');
      } else if (res.status === 404) {
        if (!record) {
          throw new Error(errJson?.message || 'No account found with this email. Please check your email or click "Register" to create a new account.');
        }
      } else if (res.status === 400) {
        throw new Error(errJson?.message || 'Invalid sign in request. Please check your email and password format.');
      } else if (res.status === 403) {
        throw new Error(errJson?.message || 'Access forbidden (HTTP 403). Identity verification failed.');
      } else if (res.status >= 500) {
        serverErrorMessage = `Sync server error (HTTP ${res.status}): ${errJson?.message || res.statusText || 'Internal Server Error'}.`;
      } else {
        serverErrorMessage = `Server returned HTTP ${res.status}: ${errJson?.message || res.statusText || 'Sign in request rejected'}.`;
      }
    }
  } catch (err) {
    if (
      err.message.includes('Incorrect password') ||
      err.message.includes('No account found') ||
      err.message.includes('Invalid sign in request') ||
      err.message.includes('Access forbidden')
    ) {
      throw err;
    }
    serverErrorMessage = err.message;
    console.warn('[CloudSync] Remote sync login notice:', err.message);
  }

  if (!serverAuthSuccess) {
    if (!record) {
      if (serverErrorMessage) {
        throw new Error(serverErrorMessage);
      }
      throw new Error(`Unable to connect to sync server (HTTP ${serverStatusCode || 'unreachable'}). Please check your connection or click "Register" to create a new account.`);
    }
    if (record.passwordHash && record.passwordHash !== hashedPw && record.passwordHash !== legacyPwHash) {
      throw new Error('Incorrect password. Please try again.');
    }
  }

  const userObj = {
    uid: record.uid,
    displayName: record.displayName,
    email: record.email,
    photoURL: record.photoURL || null,
    isLocal: true,
  };

  notifyLocalAuth(userObj);
  return userObj;
};

/**
 * Sign in as a guest user (stored locally).
 */
export const signInGuest = () => {
  const guestUser = {
    uid: 'guest_local',
    displayName: 'Guest User',
    email: null,
    photoURL: null,
    isGuest: true,
    isLocal: true,
  };
  notifyLocalAuth(guestUser);
  return guestUser;
};

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export const signOut = async () => {
  const currentUid = getLocalSession()?.uid || _localUser?.uid || null;
  if (isFirebaseConfigured && auth) {
    try { await firebaseSignOut(auth); } catch (_) {}
  }
  setSyncSessionToken(null);
  _cachedCloudData = null;
  clearSensitiveStorageOnSignOut(currentUid);
  notifyLocalAuth(null);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const isConfigured = () => isFirebaseConfigured;

export const getCurrentAuthToken = async () => {
  if (isFirebaseConfigured && auth && auth.currentUser) {
    try {
      const idTok = await auth.currentUser.getIdToken();
      if (idTok) return idTok;
    } catch (_) {}
  }
  return getSyncSessionToken();
};

export const checkRedirectResult = async () => {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await exchangeFirebaseTokenForSync(result.user).catch(() => null);
    }
    return result?.user || null;
  } catch {
    return null;
  }
};

// ─── Offline Queue & Auto-Recovery ───────────────────────────────────────────
const PENDING_SYNC_QUEUE_KEY = 'nepse_pending_sync_queue';

export const queuePendingSync = (userId, payload, userEmail) => {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ userId, payload, userEmail, queuedAt: Date.now() });
    localStorage.setItem(PENDING_SYNC_QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch (_) {}
};

export const flushPendingSyncQueue = async () => {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;
    localStorage.removeItem(PENDING_SYNC_QUEUE_KEY);
    for (const item of queue) {
      try {
        await syncUserDataToCloud(item.userId, item.payload, item.userEmail);
      } catch (_) {
        queuePendingSync(item.userId, item.payload, item.userEmail);
      }
    }
  } catch (_) {}
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[AuthSync] Connection restored (online event). Flushing pending auth/ledger syncs...');
    flushPendingSyncQueue().catch(() => {});
  });

  try {
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[AuthSync] App resumed (appStateChange). Flushing pending auth/ledger syncs...');
          flushPendingSyncQueue().catch(() => {});
        }
      });
    }).catch(() => {});
  } catch (_) {}
}

export const syncUserDataToCloud = async (userId, payload = {}, userEmail = null) => {
  if (!userId) return;

  const email = resolveUserEmail(userId, userEmail);

  let normalizedPayload = payload;
  if (Array.isArray(payload)) {
    if (payload.length > 0 && (payload[0]?.dmat || payload[0]?.boid || payload[0]?.dpCode)) {
      normalizedPayload = { profiles: payload };
    } else if (payload.length > 0 && (payload[0]?.symbol || payload[0]?.type || payload[0]?.quantity)) {
      normalizedPayload = { transactions: payload };
    } else {
      normalizedPayload = { profiles: payload };
    }
  } else if (!payload || typeof payload !== 'object') {
    normalizedPayload = {};
  }

  const sanitizeProfilesForCloud = (profiles) => {
    if (!Array.isArray(profiles)) return [];
    return profiles.map(({ password, crn, pin, transactionPin, vaultEnvelope, ...safeProfile }) => ({
      ...safeProfile,
      hasLocalCredentials: Boolean(password || pin || transactionPin || vaultEnvelope)
    }));
  };

  const dataToSave = {
    ...normalizedPayload,
    ...(Array.isArray(normalizedPayload.profiles) ? { profiles: sanitizeProfilesForCloud(normalizedPayload.profiles) } : {}),
    ...(Array.isArray(normalizedPayload.bulkAccounts) ? { bulkAccounts: sanitizeProfilesForCloud(normalizedPayload.bulkAccounts) } : {}),
    lastUpdatedAt: Date.now()
  };
  delete dataToSave.credentials;
  if (email) dataToSave.email = email;

  // 1. Primary: Push to Cloud Sync Bridge with signed bearer token (auto-restoring from Firebase if needed)
  const syncToken = (await ensureSyncSessionToken()) || getSyncSessionToken();
  if (email && email.includes('@') && syncToken) {
    try {
      const res = await callSyncProxy('/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncToken}`
        },
        body: JSON.stringify({
          app: 'nepse',
          email: email.trim().toLowerCase(),
          data: dataToSave
        })
      });
      if (res && res.ok) {
        if (typeof localStorage !== 'undefined' && userId) {
          try {
            localStorage.setItem(`nepse_hub_${userId}_last_sync`, new Date().toISOString());
          } catch (_) {}
        }
        console.log('[CloudSync] Successfully backed up user data to Cloud Sync API.');
      } else {
        queuePendingSync(userId, payload, userEmail);
      }
    } catch (err) {
      console.warn('[CloudSync] Proxy push warning:', err.message);
      queuePendingSync(userId, payload, userEmail);
    }
  }

  // 2. Secondary: Firestore replica if active
  if (db && !userId.startsWith('local_')) {
    try {
      const userDocRef = doc(db, 'user_data', userId);
      await setDoc(userDocRef, dataToSave, { merge: true });

      if (email && email.includes('@')) {
        const safeEmailKey = email.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
        const emailDocRef = doc(db, 'user_data_by_email', safeEmailKey);
        await setDoc(emailDocRef, dataToSave, { merge: true });
      }

      console.log('[Firestore Sync] Cloud backup successful for user data.');
    } catch (err) {
      console.warn('[Firestore Sync] Cloud backup failed:', err.message);
    }
  }
};

export const fetchUserDataFromCloud = async (userId, userEmail = null) => {
  // 0. Ensure sync session token is hydrated when Firebase user is active across restarts
  const syncToken = (await ensureSyncSessionToken()) || getSyncSessionToken();

  // Check instantaneous cloud data cached from login / token exchange response if available
  if (_cachedCloudData && typeof _cachedCloudData === 'object' && Object.keys(_cachedCloudData).length > 0) {
    const data = _cachedCloudData;
    _cachedCloudData = null;
    console.log('[CloudSync] Using instantaneous cloud data from login response.');
    return data;
  }

  const email = resolveUserEmail(userId, userEmail);

  // 1. Primary: Pull from Cloud Sync Bridge with signed bearer token
  if (email && email.includes('@') && syncToken) {
    try {
      const res = await callSyncProxy('/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncToken}`
        },
        body: JSON.stringify({
          app: 'nepse',
          email: email.trim().toLowerCase()
        })
      });
      if (res && res.ok) {
        const json = await res.json();
        if (json.success && json.data && Object.keys(json.data).length > 0) {
          if (typeof localStorage !== 'undefined' && userId) {
            try {
              localStorage.setItem(`nepse_hub_${userId}_last_sync`, json.updatedAt || new Date().toISOString());
            } catch (_) {}
          }
          console.log('[CloudSync] Successfully restored user data from Cloud Sync API.');
          return json.data;
        }
      }
    } catch (err) {
      console.warn('[CloudSync] Proxy pull warning:', err.message);
    }
  }

  // 2. Secondary: Try Firestore if active
  if (db && userId && !userId.startsWith('local_')) {
    try {
      const userDocRef = doc(db, 'user_data', userId);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        console.log('[Firestore Sync] Cloud data successfully fetched by UID.');
        return docSnap.data();
      }

      if (email && email.includes('@')) {
        const safeEmailKey = email.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
        const emailDocRef = doc(db, 'user_data_by_email', safeEmailKey);
        const emailSnap = await getDoc(emailDocRef);
        if (emailSnap.exists()) {
          console.log('[Firestore Sync] Cloud data successfully restored by email fallback.');
          return emailSnap.data();
        }
      }
    } catch (err) {
      console.warn('[Firestore Sync] Cloud fetch failed:', err.message);
    }
  }
  return null;
};

export { auth };
