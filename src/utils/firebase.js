// ─── Local Auth System ────────────────────────────────────────────────────────
// Provides a fully self-contained email + password authentication system.
// All data stored in localStorage — zero external services required.
// Also wraps Firebase if configured (real Google/Facebook login).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

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

const hashSimple = (str) => {
  // A simple deterministic hash (not cryptographic — data is local-only)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
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
    unsubscribeFirebase = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
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

  const hashedPw = hashSimple(password + emailKey);
  const uid = 'usr_' + hashSimple(emailKey);

  users[emailKey] = {
    uid,
    displayName: (displayName || email.split('@')[0]).trim(),
    email: emailKey,
    photoURL: null,
    passwordHash: hashedPw,
    createdAt: Date.now(),
    isLocal: true,
  };

  saveLocalUsers(users);

  const userObj = { uid, displayName: (displayName || email.split('@')[0]).trim(), email: emailKey, photoURL: null, isLocal: true };

  // Sync registration with cloud
  try {
    const syncUrl = getSyncProxyEndpoint();
    await fetch(`${syncUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'nepse',
        email: emailKey,
        passwordHash: hashedPw,
        name: userObj.displayName
      })
    });
  } catch (_) {}

  notifyLocalAuth(userObj);
  return userObj;
};

let _cachedCloudData = null;

export const getCachedCloudData = () => _cachedCloudData;

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
 * Sign in with a local email + password.
 * Returns the user object or throws with a friendly error.
 */
export const signInLocal = async (email, password) => {
  if (!email || !password) throw new Error('Please enter your email and password.');

  const users = getLocalUsers();
  const emailKey = email.trim().toLowerCase();
  let record = users[emailKey];

  // Try checking the remote Cloud Sync API on login (cross-device account restoration)
  try {
    const syncUrl = getSyncProxyEndpoint();
    const res = await fetch(`${syncUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'nepse',
        email: emailKey,
        passwordHash: hashSimple(password + emailKey),
        autoRegisterIfMissing: !record
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        if (json.data && typeof json.data === 'object' && Object.keys(json.data).length > 0) {
          _cachedCloudData = json.data;
        }
        // Update or populate local user record
        const uid = 'usr_' + hashSimple(emailKey);
        record = {
          uid,
          displayName: json.user?.name || email.split('@')[0],
          email: emailKey,
          photoURL: null,
          passwordHash: hashSimple(password + emailKey),
          createdAt: Date.now(),
          isLocal: true,
        };
        users[emailKey] = record;
        saveLocalUsers(users);
      }
    }
  } catch (_) {}

  if (!record) {
    const displayName = email.split('@')[0];
    return registerLocal(displayName, email, password);
  }

  const hashedPw = hashSimple(password + emailKey);
  if (record.passwordHash && record.passwordHash !== hashedPw) {
    throw new Error('Incorrect password. Please try again.');
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
  if (isFirebaseConfigured && auth) {
    try { await firebaseSignOut(auth); } catch (_) {}
  }
  notifyLocalAuth(null);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const isConfigured = () => isFirebaseConfigured;

export const checkRedirectResult = async () => {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch {
    return null;
  }
};

const getSyncProxyEndpoint = () => {
  const base = import.meta.env.VITE_PROXY_URL || 'https://nepseapp.onrender.com';
  return base.replace(/\/$/, '') + '/api/sync';
};

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

  const dataToSave = {
    ...normalizedPayload,
    lastUpdatedAt: Date.now()
  };
  if (email) dataToSave.email = email;

  // 1. Primary: Push to Render Cloud Sync Bridge
  if (email && email.includes('@')) {
    try {
      const syncUrl = getSyncProxyEndpoint();
      const res = await fetch(`${syncUrl}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'nepse',
          email: email.trim().toLowerCase(),
          data: dataToSave
        })
      });
      if (res.ok) {
        console.log('[CloudSync] Successfully backed up user data to Cloud Sync API.');
      }
    } catch (err) {
      console.warn('[CloudSync] Proxy push warning:', err.message);
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
  // 0. Check instantaneous cloud data cached from login response if available
  if (_cachedCloudData && typeof _cachedCloudData === 'object' && Object.keys(_cachedCloudData).length > 0) {
    const data = _cachedCloudData;
    _cachedCloudData = null;
    console.log('[CloudSync] Using instantaneous cloud data from login response.');
    return data;
  }

  const email = resolveUserEmail(userId, userEmail);

  // 1. Primary: Pull from Render Cloud Sync Bridge
  if (email && email.includes('@')) {
    try {
      const syncUrl = getSyncProxyEndpoint();
      const res = await fetch(`${syncUrl}/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'nepse',
          email: email.trim().toLowerCase()
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && Object.keys(json.data).length > 0) {
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
