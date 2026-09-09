/**
 * Drabyashree NEPSE — High-Performance IndexedDB Storage Engine
 * Provides persistent offline storage for market data, eliminating the 5MB localStorage limit.
 */

const DB_NAME = 'DrabyashreeNEPSE_DB';
const DB_VERSION = 1;
const STORE_NAME = 'market_cache';

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        resolve(e.target.result);
      };

      request.onerror = (e) => {
        console.warn('[IndexedDB] Failed to open database:', e.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[IndexedDB] Initialization error:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Retrieve cached item from IndexedDB.
 * Returns null if expired or not found.
 */
export async function idbGet(key, allowExpired = false) {
  try {
    const db = await getDB();
    if (!db) {
      const raw = localStorage.getItem('idb_fallback_' + key);
      return raw ? JSON.parse(raw) : null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const item = req.result;
          if (!item) return resolve(null);
          if (!allowExpired && item.expiresAt && item.expiresAt < Date.now()) {
            return resolve(null);
          }
          resolve(item.value);
        };

        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('[IndexedDB] get error for ' + key, err);
    return null;
  }
}

/**
 * Set cached item into IndexedDB with optional TTL in milliseconds.
 */
export async function idbSet(key, value, ttlMs = 0) {
  try {
    const db = await getDB();
    const entry = {
      key,
      value,
      updatedAt: Date.now(),
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
    };

    if (!db) {
      try {
        localStorage.setItem('idb_fallback_' + key, JSON.stringify(value));
      } catch (_) {}
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  } catch (err) {
    console.warn('[IndexedDB] set error for ' + key, err);
  }
}

/**
 * Delete key from IndexedDB.
 */
export async function idbDel(key) {
  try {
    const db = await getDB();
    if (!db) {
      localStorage.removeItem('idb_fallback_' + key);
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  } catch (_) {}
}

/**
 * Clear all records in the cache store.
 */
export async function idbClear() {
  try {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  } catch (_) {}
}

/**
 * Hydrates state by reading IndexedDB first, then localStorage as fallback.
 */
export async function hydrateFromStorage(key, fallback = null) {
  try {
    const val = await idbGet(key, true);
    if (val !== null && val !== undefined) return val;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return fallback;
}

/**
 * Persists state to both IndexedDB and localStorage (if it fits).
 */
export async function persistToStorage(key, value, ttlMs = 0) {
  try {
    await idbSet(key, value, ttlMs);
  } catch (_) {}
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // localStorage quota exceeded is safely handled by IndexedDB
  }
}
