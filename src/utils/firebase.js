// ─── Local Auth System ────────────────────────────────────────────────────────
// Provides a fully self-contained email + password authentication system.
// All data stored in localStorage — zero external services required.
// Also wraps Firebase if configured (real Google/Facebook login).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
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

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0
      ? initializeApp(firebaseConfig)
      : getApps()[0];
    auth = getAuth(app);
    auth.useDeviceLanguage();

    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('email');
    googleProvider.addScope('profile');

    facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope('email');
    facebookProvider.addScope('public_profile');
  } catch (e) {
    console.warn('[Auth] Firebase init failed:', e.message);
    auth = null;
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

const getLocalSession = () => {
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
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        callback(fbUser);
      } else {
        // Firebase not logged in — fall back to local session
        callback(getLocalSession());
      }
    });
  }

  // Local auth mode
  _localAuthCallbacks.push(callback);
  // Immediately notify with current session
  setTimeout(() => callback(_localUser), 0);
  return () => {
    _localAuthCallbacks = _localAuthCallbacks.filter(cb => cb !== callback);
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
export const registerLocal = (displayName, email, password) => {
  if (!displayName || displayName.trim().length < 2)
    throw new Error('Please enter your full name (at least 2 characters).');
  if (!email || !email.includes('@'))
    throw new Error('Please enter a valid email address.');
  if (!password || password.length < 6)
    throw new Error('Password must be at least 6 characters.');

  const users = getLocalUsers();
  const emailKey = email.trim().toLowerCase();

  if (users[emailKey]) throw new Error('An account with this email already exists. Please sign in instead.');

  const uid = `local_${hashSimple(emailKey + Date.now())}`;
  const hashedPw = hashSimple(password + emailKey); // salted hash

  users[emailKey] = {
    uid,
    displayName: displayName.trim(),
    email: emailKey,
    photoURL: null,
    passwordHash: hashedPw,
    createdAt: Date.now(),
    isLocal: true,
  };

  saveLocalUsers(users);

  const userObj = { uid, displayName: displayName.trim(), email: emailKey, photoURL: null, isLocal: true };
  notifyLocalAuth(userObj);
  return userObj;
};

/**
 * Sign in with a local email + password.
 * Returns the user object or throws with a friendly error.
 */
export const signInLocal = (email, password) => {
  if (!email || !password) throw new Error('Please enter your email and password.');

  const users = getLocalUsers();
  const emailKey = email.trim().toLowerCase();
  const record   = users[emailKey];

  if (!record) throw new Error('No account found with this email. Please register first.');

  const hashedPw = hashSimple(password + emailKey);
  if (record.passwordHash !== hashedPw) throw new Error('Incorrect password. Please try again.');

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

export { auth };
