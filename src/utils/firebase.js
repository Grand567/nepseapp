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

  if (!record) {
    // Auto-register silently if the account does not exist (prevents registration friction on fresh installs)
    const displayName = email.split('@')[0];
    return registerLocal(displayName, email, password);
  }

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

export const syncUserDataToCloud = async (userId, payload = {}, userEmail = null) => {
  if (!db || !userId || userId.startsWith('local_')) return;
  try {
    const userDocRef = doc(db, 'user_data', userId);
    const dataToSave = {
      ...payload,
      lastUpdatedAt: Date.now()
    };
    if (userEmail) dataToSave.email = userEmail;

    await setDoc(userDocRef, dataToSave, { merge: true });

    // Also mirror to email-based key if available for cross-device resilience
    if (userEmail && userEmail.includes('@')) {
      try {
        const safeEmailKey = userEmail.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
        const emailDocRef = doc(db, 'user_data_by_email', safeEmailKey);
        await setDoc(emailDocRef, dataToSave, { merge: true });
      } catch (_) {}
    }

    console.log('[Firestore Sync] Cloud backup successful for user data.');
  } catch (err) {
    console.warn('[Firestore Sync] Cloud backup failed:', err.message);
  }
};

export const fetchUserDataFromCloud = async (userId, userEmail = null) => {
  if (!db || !userId || userId.startsWith('local_')) return null;
  try {
    // 1. Try fetching by user UID
    const userDocRef = doc(db, 'user_data', userId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      console.log('[Firestore Sync] Cloud data successfully fetched by UID.');
      return docSnap.data();
    }

    // 2. Fallback: Try fetching by email if UID was not found (e.g. login method transition)
    if (userEmail && userEmail.includes('@')) {
      const safeEmailKey = userEmail.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
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
  return null;
};

export { auth };
