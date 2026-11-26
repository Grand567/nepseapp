// proxy/syncRouter.mjs
// Authenticated Multi-Device Cloud Sync Bridge (salted scrypt hashing, HMAC bearer tokens, zero credential persistence).

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import https from 'https';
import { pool, query } from './db.mjs';
import {
  hashPasswordServer,
  verifyPasswordServer,
  issueSyncSessionToken,
  verifySyncSessionToken
} from './utils/syncSessionToken.mjs';

const GOOGLE_SECURETOKEN_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_FIREBASE_PROJECT_IDS = [
  process.env.FIREBASE_PROJECT_ID,
  process.env.VITE_FIREBASE_PROJECT_ID,
  'drabyashree-nepse-hub-11ef9'
].filter(Boolean);

let _certsCache = { certs: null, expiresAt: 0 };
let _testFirebaseCerts = null;
let _testExpectedProjectId = null;

export function setFirebaseCertsForTest(certs, expectedProjectId = null) {
  _testFirebaseCerts = certs && typeof certs === 'object' ? { ...certs } : null;
  _testExpectedProjectId = expectedProjectId || null;
}

async function fetchGooglePublicCerts() {
  if (_testFirebaseCerts) return _testFirebaseCerts;
  const now = Date.now();
  if (_certsCache.certs && now < _certsCache.expiresAt) {
    return _certsCache.certs;
  }
  return new Promise((resolve, reject) => {
    const req = https.get(GOOGLE_SECURETOKEN_CERTS_URL, { timeout: 5000 }, (resp) => {
      let raw = '';
      resp.on('data', (chunk) => { raw += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          const cc = String(resp.headers['cache-control'] || '');
          const maxAgeMatch = cc.match(/max-age=(\d+)/i);
          const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 300000;
          _certsCache = { certs: parsed, expiresAt: Date.now() + Math.max(60000, ttlMs) };
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Timeout fetching Google x509 certs'));
    });
  });
}

export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (header?.alg !== 'RS256' || !header?.kid) return null;
  const allowedAudiences = new Set([
    ...DEFAULT_FIREBASE_PROJECT_IDS,
    ...(_testExpectedProjectId ? [_testExpectedProjectId] : [])
  ]);
  if (!payload?.aud || !allowedAudiences.has(String(payload.aud))) return null;
  if (payload?.iss !== `https://securetoken.googleapis.com/${payload.aud}`) return null;
  if (!payload?.sub || typeof payload.sub !== 'string') return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - 30) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300) return null;
  if (!payload.email || payload.email_verified === false) return null;

  const certs = await fetchGooglePublicCerts().catch(() => null);
  const certPem = certs?.[header.kid];
  if (!certPem) return null;

  try {
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBuf = Buffer.from(parts[2], 'base64url');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signingInput);
    if (!verifier.verify(certPem, sigBuf)) return null;
    return payload;
  } catch {
    return null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Strict Cache-Control for sensitive synced vault payloads
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

function resolveVaultDir() {
  const baseDataDir = (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR))
    ? process.env.NEPSE_DATA_DIR
    : path.resolve(__dirname, 'data');
  return path.join(baseDataDir, 'sync_vaults');
}

// In-memory cache keyed cleanly per storage directory
const memoryVaults = new Map();

const getSafeKey = (app = 'general', email = '') => {
  const cleanApp = String(app).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const cleanEmail = String(email).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `${cleanApp}___${cleanEmail}`;
};

const getFilePath = (key) => path.join(resolveVaultDir(), `${key}.json`);

function deriveServerUid(cleanEmail) {
  return 'usr_' + crypto.createHash('sha256').update(String(cleanEmail)).digest('hex').slice(0, 12);
}

/**
 * Strips any plaintext/vaulted MeroShare credentials before persistence or sync responses.
 */
export function stripSensitiveCredentials(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const cleaned = { ...data };
  delete cleaned.credentials;
  delete cleaned.subscription;

  const sanitizeArr = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const { password, crn, pin, transactionPin, vaultEnvelope, ...safeItem } = item;
      return {
        ...safeItem,
        hasLocalCredentials: Boolean(
          safeItem.hasLocalCredentials || password || pin || transactionPin || vaultEnvelope
        )
      };
    });
  };

  if (Array.isArray(cleaned.profiles)) {
    cleaned.profiles = sanitizeArr(cleaned.profiles);
  }
  if (Array.isArray(cleaned.bulkAccounts)) {
    cleaned.bulkAccounts = sanitizeArr(cleaned.bulkAccounts);
  }
  return cleaned;
}

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

let isDbTableReady = false;
const ensureSyncTable = async () => {
  if (!pool || isDbTableReady) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cloud_sync_vaults (
        key VARCHAR(255) PRIMARY KEY,
        app VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        password_hash VARCHAR(255),
        data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        sync_version INT DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_cloud_sync_vaults_lookup ON cloud_sync_vaults(app, email);
    `);
    isDbTableReady = true;
  } catch (err) {
    console.warn('[SyncRouter] Table ensure notice:', err.message);
  }
};

const preloadVaults = async () => {
  const vaultDir = resolveVaultDir();
  try {
    if (fs.existsSync(vaultDir)) {
      const files = fs.readdirSync(vaultDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const key = file.replace('.json', '');
            const content = fs.readFileSync(path.join(vaultDir, file), 'utf8');
            memoryVaults.set(key, JSON.parse(content));
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.warn('[SyncRouter] Error preloading vaults from disk:', err.message);
  }

  if (pool) {
    try {
      await ensureSyncTable();
      const res = await query('SELECT key, app, email, name, password_hash, data, created_at, updated_at, sync_version FROM cloud_sync_vaults');
      if (res && res.rows) {
        for (const row of res.rows) {
          memoryVaults.set(row.key, {
            app: row.app,
            email: row.email,
            name: row.name,
            passwordHash: row.password_hash,
            data: stripSensitiveCredentials(row.data || {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            syncVersion: row.sync_version
          });
        }
      }
    } catch (dbErr) {
      console.warn('[SyncRouter] DB preload notice:', dbErr.message);
    }
  }
};

preloadVaults();

const saveVault = async (key, vaultData) => {
  const sanitizedVault = {
    ...vaultData,
    data: stripSensitiveCredentials(vaultData.data || {})
  };
  memoryVaults.set(key, sanitizedVault);

  const vaultDir = resolveVaultDir();
  try {
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }
    const target = getFilePath(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(sanitizedVault, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    console.warn(`[SyncRouter] Failed to write vault ${key} to disk:`, err.message);
  }

  if (pool) {
    try {
      await ensureSyncTable();
      await query(`
        INSERT INTO cloud_sync_vaults (key, app, email, name, password_hash, data, updated_at, sync_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (key) DO UPDATE SET
          name = EXCLUDED.name,
          password_hash = COALESCE(NULLIF(EXCLUDED.password_hash, ''), cloud_sync_vaults.password_hash),
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at,
          sync_version = EXCLUDED.sync_version;
      `, [
        key,
        sanitizedVault.app || 'nepse',
        sanitizedVault.email,
        sanitizedVault.name || '',
        sanitizedVault.passwordHash || '',
        JSON.stringify(sanitizedVault.data || {}),
        sanitizedVault.updatedAt || new Date().toISOString(),
        sanitizedVault.syncVersion || 1
      ]);
    } catch (dbErr) {
      console.warn(`[SyncRouter] DB upsert failed for ${key}:`, dbErr.message);
    }
  }
};

const getVault = async (key) => {
  if (memoryVaults.has(key)) {
    return memoryVaults.get(key);
  }
  const fp = getFilePath(key);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      memoryVaults.set(key, data);
      return data;
    } catch (_) {}
  }
  if (pool) {
    try {
      await ensureSyncTable();
      const res = await query('SELECT key, app, email, name, password_hash, data, created_at, updated_at, sync_version FROM cloud_sync_vaults WHERE key = $1', [key]);
      if (res && res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const vault = {
          app: row.app,
          email: row.email,
          name: row.name,
          passwordHash: row.password_hash,
          data: stripSensitiveCredentials(row.data || {}),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          syncVersion: row.sync_version
        };
        memoryVaults.set(key, vault);
        return vault;
      }
    } catch (err) {
      console.warn('[SyncRouter] DB getVault notice:', err.message);
    }
  }
  return null;
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Drabyashree Cloud Sync Bridge',
    activeVaults: memoryVaults.size,
    dbConnected: Boolean(pool),
    timestamp: new Date().toISOString()
  });
});

// Register new account & vault
router.post('/register', async (req, res) => {
  try {
    const { app = 'general', email, passwordHash, name, initialData } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanApp = String(app || 'general').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }
    if (!passwordHash || String(passwordHash).trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Password verifier is required to register.' });
    }

    const key = getSafeKey(cleanApp, cleanEmail);
    const existing = await getVault(key);

    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'USER_EXISTS',
        message: 'This email account is already registered. Please login instead.'
      });
    }

    const uid = deriveServerUid(cleanEmail);
    const now = new Date().toISOString();
    const newVault = {
      uid,
      app: cleanApp,
      email: cleanEmail,
      name: (name || cleanEmail.split('@')[0]).trim(),
      passwordHash: hashPasswordServer(String(passwordHash)),
      data: stripSensitiveCredentials(initialData || {}),
      createdAt: now,
      updatedAt: now,
      syncVersion: 1
    };

    await saveVault(key, newVault);
    const token = issueSyncSessionToken({ uid, email: cleanEmail, app: cleanApp });

    res.json({
      success: true,
      token,
      message: 'Account successfully registered and synced with cloud.',
      user: {
        uid,
        email: cleanEmail,
        name: newVault.name,
        lastSyncedAt: newVault.updatedAt
      },
      data: newVault.data
    });
  } catch (err) {
    console.error('[SyncRouter] Register error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during registration.' });
  }
});

async function resolveBearerClaims(req, cleanEmail, cleanApp) {
  const bearer = extractBearerToken(req);
  if (!bearer) return { bearer: null, claims: null, invalid: false };
  const hmacClaims = verifySyncSessionToken(bearer);
  if (hmacClaims) return { bearer, claims: hmacClaims, invalid: false };
  if (bearer.split('.').length === 3) {
    const fbClaims = await verifyFirebaseIdToken(bearer);
    if (fbClaims?.email) {
      return {
        bearer,
        claims: {
          uid: fbClaims.sub,
          email: String(fbClaims.email).trim().toLowerCase(),
          app: cleanApp
        },
        invalid: false
      };
    }
  }
  return { bearer, claims: null, invalid: true };
}

// Login and pull remote vault (supports salted password verifier OR cryptographically verified Firebase ID token)
router.post(['/login', '/firebase-login'], async (req, res) => {
  try {
    const { app = 'general', email, passwordHash, legacyPasswordHash, firebaseIdToken, name, initialData } = req.body || {};
    let cleanEmail = String(email || '').trim().toLowerCase();
    const cleanApp = String(app || 'general').trim().toLowerCase();

    if (firebaseIdToken) {
      const fbClaims = await verifyFirebaseIdToken(firebaseIdToken);
      if (!fbClaims || !fbClaims.email) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_FIREBASE_TOKEN',
          message: 'Firebase authentication token is invalid or expired.'
        });
      }
      const tokenEmail = String(fbClaims.email).trim().toLowerCase();
      if (cleanEmail && cleanEmail !== tokenEmail) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Verified Firebase account email does not match requested vault.'
        });
      }
      cleanEmail = tokenEmail;

      const key = getSafeKey(cleanApp, cleanEmail);
      let vault = await getVault(key);
      if (!vault) {
        const now = new Date().toISOString();
        vault = {
          uid: fbClaims.sub || deriveServerUid(cleanEmail),
          app: cleanApp,
          email: cleanEmail,
          name: (name || fbClaims.name || cleanEmail.split('@')[0]).trim(),
          passwordHash: '',
          data: stripSensitiveCredentials(initialData || {}),
          createdAt: now,
          updatedAt: now,
          syncVersion: 1
        };
        await saveVault(key, vault);
      } else if (vault.email && String(vault.email).toLowerCase() !== cleanEmail) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Vault identity mismatch.'
        });
      }

      const uid = vault.uid || fbClaims.sub || deriveServerUid(cleanEmail);
      if (!vault.uid) {
        vault.uid = uid;
        await saveVault(key, vault);
      }

      const token = issueSyncSessionToken({ uid, email: cleanEmail, app: cleanApp });
      const safeData = stripSensitiveCredentials(vault.data || {});
      return res.json({
        success: true,
        token,
        authProvider: 'firebase',
        message: 'Google/Firebase cloud sync authenticated.',
        user: {
          uid,
          email: cleanEmail,
          name: vault.name || fbClaims.name || cleanEmail.split('@')[0],
          lastSyncedAt: vault.updatedAt
        },
        data: safeData,
        updatedAt: vault.updatedAt
      });
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(cleanApp, cleanEmail);
    const vault = await getVault(key);

    if (!vault) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'No account found with this email. Please register first.'
      });
    }
    if (vault.email && String(vault.email).toLowerCase() !== cleanEmail) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Vault identity mismatch.'
      });
    }

    if (!vault.passwordHash) {
      return res.status(401).json({
        success: false,
        code: 'OAUTH_VAULT_PASSWORD_NOT_SET',
        message: 'This cloud vault uses Google Sign-In. Please sign in with Google to restore your synced data.'
      });
    }

    let check = verifyPasswordServer(vault.passwordHash, passwordHash);
    let upgradeSource = passwordHash;
    if (!check.valid && legacyPasswordHash) {
      check = verifyPasswordServer(vault.passwordHash, legacyPasswordHash);
      upgradeSource = passwordHash || legacyPasswordHash;
    }

    if (!check.valid) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid password. Please check your credentials.'
      });
    }

    const uid = vault.uid || deriveServerUid(cleanEmail);
    if (check.needsUpgrade && upgradeSource) {
      vault.uid = uid;
      vault.passwordHash = hashPasswordServer(String(upgradeSource));
      await saveVault(key, vault);
    }

    const token = issueSyncSessionToken({ uid, email: cleanEmail, app: cleanApp });
    const safeData = stripSensitiveCredentials(vault.data || {});

    res.json({
      success: true,
      token,
      message: 'Login successful. Cloud data synchronized.',
      user: {
        uid,
        email: cleanEmail,
        name: vault.name,
        lastSyncedAt: vault.updatedAt
      },
      data: safeData,
      updatedAt: vault.updatedAt
    });
  } catch (err) {
    console.error('[SyncRouter] Login error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during login.' });
  }
});

// Push authenticated local data snapshot to cloud
router.post('/push', async (req, res) => {
  try {
    const { app = 'general', email, passwordHash, data, name } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanApp = String(app || 'general').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const { bearer, claims, invalid } = await resolveBearerClaims(req, cleanEmail, cleanApp);

    if (bearer && invalid) {
      return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid or expired session token.' });
    }

    if (claims && (claims.email !== cleanEmail || claims.app !== cleanApp)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Token does not grant access to this vault.' });
    }

    const key = getSafeKey(cleanApp, cleanEmail);
    let vault = await getVault(key);

    if (!vault) {
      if (!claims) {
        return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Authentication required to push cloud sync data.' });
      }
      const now = new Date().toISOString();
      vault = {
        uid: claims.uid || deriveServerUid(cleanEmail),
        app: cleanApp,
        email: cleanEmail,
        name: (name || cleanEmail.split('@')[0]).trim(),
        passwordHash: '',
        data: {},
        createdAt: now,
        updatedAt: now,
        syncVersion: 0
      };
    } else {
      if (vault.email && String(vault.email).toLowerCase() !== cleanEmail) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Vault identity mismatch.' });
      }
      if (!claims) {
        const check = vault.passwordHash ? verifyPasswordServer(vault.passwordHash, passwordHash) : { valid: false };
        if (!check.valid) {
          return res.status(401).json({
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Valid session token or credentials required to push vault.'
          });
        }
        if (check.needsUpgrade && passwordHash) {
          vault.passwordHash = hashPasswordServer(String(passwordHash));
        }
      }
    }

    const now = new Date().toISOString();
    const sanitizedIncoming = stripSensitiveCredentials(data);

    if (sanitizedIncoming !== undefined && sanitizedIncoming !== null) {
      if (typeof sanitizedIncoming === 'object' && !Array.isArray(sanitizedIncoming) && typeof vault.data === 'object' && !Array.isArray(vault.data)) {
        const merged = { ...vault.data };
        for (const [k, val] of Object.entries(sanitizedIncoming)) {
          if (k === 'credentials' || k === 'subscription') continue;
          if (Array.isArray(val)) {
            if (val.length === 0 && Array.isArray(merged[k]) && merged[k].length > 0) {
              continue;
            }
            merged[k] = val;
          } else if (val !== null && typeof val === 'object') {
            merged[k] = { ...(merged[k] || {}), ...val };
          } else if (val !== undefined) {
            merged[k] = val;
          }
        }
        vault.data = stripSensitiveCredentials(merged);
      } else {
        vault.data = sanitizedIncoming;
      }
    }

    if (name) vault.name = String(name).trim();
    vault.updatedAt = now;
    vault.syncVersion = (vault.syncVersion || 0) + 1;

    await saveVault(key, vault);

    res.json({
      success: true,
      message: 'Cloud data pushed and saved successfully.',
      timestamp: now,
      syncVersion: vault.syncVersion
    });
  } catch (err) {
    console.error('[SyncRouter] Push error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during push.' });
  }
});

// Pull authenticated cloud data snapshot (POST only — never expose credentials/data in GET query logs)
router.post('/pull', async (req, res) => {
  try {
    const app = req.body?.app || 'general';
    const email = req.body?.email || '';
    const passwordHash = req.body?.passwordHash || '';
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanApp = String(app).trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const { bearer, claims, invalid } = await resolveBearerClaims(req, cleanEmail, cleanApp);

    if (bearer && invalid) {
      return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid or expired session token.' });
    }

    if (claims && (claims.email !== cleanEmail || claims.app !== cleanApp)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Token does not grant access to this vault.' });
    }

    if (!claims && !passwordHash) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Valid session token or credentials required to access this vault.'
      });
    }

    const key = getSafeKey(cleanApp, cleanEmail);
    const vault = await getVault(key);

    if (!vault) {
      return res.status(404).json({
        success: false,
        code: 'VAULT_NOT_FOUND',
        message: 'No cloud vault found for this account.'
      });
    }
    if (vault.email && String(vault.email).toLowerCase() !== cleanEmail) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Vault identity mismatch.'
      });
    }

    if (!claims) {
      const check = vault.passwordHash ? verifyPasswordServer(vault.passwordHash, passwordHash) : { valid: false };
      if (!check.valid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials. Access denied.'
        });
      }
      if (check.needsUpgrade && passwordHash) {
        vault.passwordHash = hashPasswordServer(String(passwordHash));
        await saveVault(key, vault);
      }
    }

    res.json({
      success: true,
      data: stripSensitiveCredentials(vault.data || {}),
      updatedAt: vault.updatedAt,
      syncVersion: vault.syncVersion || 1
    });
  } catch (err) {
    console.error('[SyncRouter] Pull error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during pull.' });
  }
});

export default router;
