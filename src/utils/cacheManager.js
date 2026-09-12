// src/utils/cacheManager.js
// PRODUCTION GRADE NEPSE CACHE MANAGER
// Handles multi-layer caching with TTL (Time To Live), Promoter Share segregation,
// and Circuit Limit detection.

const CACHE_KEYS = {
  LIVE_QUOTES: 'nepse_live_quotes',
  FLOORSHEET: 'nepse_floorsheet',
  FUNDAMENTALS: 'nepse_fundamentals',
  USER_WACC: 'nepse_custom_wacc_map' // Remains lightweight in localStorage
};

const TTL = {
  LIVE_QUOTES: 60 * 1000,           // 1 minute
  FLOORSHEET: 5 * 60 * 1000,        // 5 minutes
  FUNDAMENTALS: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Enhanced memory fallback for IndexedDB
 */
const MemoryStore = new Map();

/**
 * Initialize IndexedDB securely
 */
let dbPromise = null;
function getDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open('NepseQuantDB', 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('nepsedata')) {
        db.createObjectStore('nepsedata');
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('IndexedDB failed to initialize. Falling back to memory store.');
      resolve(null);
    };
  });
  
  return dbPromise;
}

/**
 * Saves heavy blobs (Floorsheet/Fundamentals) to IndexedDB with TTL
 */
export async function setCache(key, data, ttlMs = TTL.LIVE_QUOTES) {
  const payload = {
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs,
    data
  };
  
  // 1. Memory Layer
  MemoryStore.set(key, payload);
  
  // 2. IndexedDB Layer
  const db = await getDB();
  if (db) {
    try {
      return new Promise((resolve) => {
        const tx = db.transaction('nepsedata', 'readwrite');
        const store = tx.objectStore('nepsedata');
        store.put(payload, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn("Failed to write to IndexedDB", e);
    }
  } else {
    // 3. Fallback to localStorage if small enough (Live Quotes)
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      // Quota exceeded
    }
  }
  return true;
}

/**
 * Retrieves valid cached blobs using TTL
 */
export async function getCache(key) {
  const now = Date.now();
  
  // 1. Memory Check
  if (MemoryStore.has(key)) {
    const payload = MemoryStore.get(key);
    if (payload.expiresAt > now) return payload.data;
    MemoryStore.delete(key);
  }
  
  // 2. IndexedDB Check
  const db = await getDB();
  if (db) {
    try {
      const payload = await new Promise((resolve) => {
        const tx = db.transaction('nepsedata', 'readonly');
        const store = tx.objectStore('nepsedata');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      
      if (payload && payload.expiresAt > now) {
        MemoryStore.set(key, payload); // Hydrate memory
        return payload.data;
      }
    } catch (e) {
      console.warn("Failed to read from IndexedDB", e);
    }
  }
  
  // 3. LocalStorage Fallback
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const payload = JSON.parse(raw);
      if (payload.expiresAt > now) return payload.data;
      localStorage.removeItem(key);
    }
  } catch (e) { }
  
  return null;
}

/**
 * Clears expired entries across all stores
 */
export async function evictExpiredCaches() {
  const now = Date.now();
  for (const [key, payload] of MemoryStore.entries()) {
    if (payload.expiresAt <= now) MemoryStore.delete(key);
  }
  
  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction('nepsedata', 'readwrite');
      const store = tx.objectStore('nepsedata');
      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.expiresAt <= now) cursor.delete();
          cursor.continue();
        }
      };
    } catch (e) { }
  }
}

/**
 * Identifies and segregates standard equity vs promoter shares.
 * Returns an object separating the two arrays.
 */
export function segregatePromoterShares(stocks = []) {
  const standard = [];
  const promoter = [];
  
  stocks.forEach(s => {
    // Promoter shares usually end with P, PO, P1, or are specifically labeled
    if (/P\d*$/.test(s.symbol) || s.symbol.includes('PO') || (s.sector && s.sector.toLowerCase().includes('promoter'))) {
      promoter.push(s);
    } else {
      standard.push(s);
    }
  });
  
  return { standard, promoter };
}

/**
 * Evaluates +/- 15% circuit limit flag for live quotes (since April 20, 2026).
 */
export function enrichWithCircuitFlags(stocks = []) {
  return stocks.map(stock => {
    const pChg = stock.pChange || stock.percentageChange || 0;
    // Individual stock circuit limit in NEPSE is +/- 15% (effective April 20, 2026)
    const isCircuitHit = Math.abs(pChg) >= 14.85;
    
    return {
      ...stock,
      isCircuitHit,
      circuitType: isCircuitHit ? (pChg > 0 ? 'upper' : 'lower') : 'none'
    };
  });
}
