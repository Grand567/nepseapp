import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Data storage directories
const VAULT_DIR = path.resolve(__dirname, 'data', 'sync_vaults');
const SEED_FILE = path.resolve(__dirname, 'data', 'sync_vaults_seed.json');

try {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[SyncRouter] Could not initialize vault directory:', e.message);
}

// In-memory cache to guarantee rapid access and high throughput
const memoryVaults = new Map();

const getSafeKey = (app = 'general', email = '') => {
  const cleanApp = String(app).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const cleanEmail = String(email).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `${cleanApp}___${cleanEmail}`;
};

const getFilePath = (key) => path.join(VAULT_DIR, `${key}.json`);

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

// Load existing vaults from disk, seed file, and PostgreSQL on startup
const preloadVaults = async () => {
  // 1. Load from individual disk files
  try {
    if (fs.existsSync(VAULT_DIR)) {
      const files = fs.readdirSync(VAULT_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const key = file.replace('.json', '');
            const content = fs.readFileSync(path.join(VAULT_DIR, file), 'utf8');
            memoryVaults.set(key, JSON.parse(content));
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.warn('[SyncRouter] Error preloading vaults from disk:', err.message);
  }

  // 2. Load from seed file (essential for containers with ephemeral disk like Render)
  try {
    if (fs.existsSync(SEED_FILE)) {
      const seedContent = fs.readFileSync(SEED_FILE, 'utf8');
      const seedObj = JSON.parse(seedContent);
      if (seedObj && typeof seedObj === 'object') {
        for (const [key, vault] of Object.entries(seedObj)) {
          if (!memoryVaults.has(key)) {
            memoryVaults.set(key, vault);
          }
        }
      }
    }
  } catch (seedErr) {
    console.warn('[SyncRouter] Error preloading vaults from seed:', seedErr.message);
  }

  // 3. Load from PostgreSQL if pool is available
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
            data: row.data || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            syncVersion: row.sync_version
          });
        }
        console.log(`[SyncRouter] Preloaded ${res.rows.length} vaults from PostgreSQL database.`);
      }
    } catch (dbErr) {
      console.warn('[SyncRouter] DB preload notice:', dbErr.message);
    }
  }

  console.log(`[SyncRouter] Active in-memory cloud sync vaults: ${memoryVaults.size}`);
};

preloadVaults();

const saveVault = async (key, vaultData) => {
  memoryVaults.set(key, vaultData);

  // 1. Write individual JSON file to disk
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    fs.writeFileSync(getFilePath(key), JSON.stringify(vaultData, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[SyncRouter] Failed to write vault ${key} to disk:`, err.message);
  }

  // 2. Update committed seed file to persist across container restarts
  try {
    const allVaults = Object.fromEntries(memoryVaults.entries());
    fs.writeFileSync(SEED_FILE, JSON.stringify(allVaults, null, 2), 'utf8');
  } catch (_) {}

  // 3. Upsert to PostgreSQL if pool is available
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
        vaultData.app || 'nepse',
        vaultData.email,
        vaultData.name || '',
        vaultData.passwordHash || '',
        JSON.stringify(vaultData.data || {}),
        vaultData.updatedAt || new Date().toISOString(),
        vaultData.syncVersion || 1
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
  // Try disk file
  const fp = getFilePath(key);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      memoryVaults.set(key, data);
      return data;
    } catch (_) {}
  }
  // Try PostgreSQL
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
          data: row.data || {},
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

// Health & status
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Kharcha & NEPSE Multi-Device Cloud Sync Bridge',
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

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    const existing = await getVault(key);

    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'USER_EXISTS',
        message: 'This email account is already registered. Please login instead.'
      });
    }

    const newVault = {
      app: String(app).toLowerCase(),
      email: cleanEmail,
      name: (name || cleanEmail.split('@')[0]).trim(),
      passwordHash: passwordHash || '',
      data: initialData || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncVersion: 1
    };

    await saveVault(key, newVault);

    console.log(`[SyncRouter] Registered new cloud vault for [${app}] ${cleanEmail}`);
    res.json({
      success: true,
      message: 'Account successfully registered and synced with cloud.',
      user: {
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

// Login and pull remote vault
router.post('/login', async (req, res) => {
  try {
    const { app = 'general', email, passwordHash, autoRegisterIfMissing, initialData } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    let vault = await getVault(key);

    // If not found and autoRegister is requested:
    if (!vault) {
      if (autoRegisterIfMissing) {
        vault = {
          app: String(app).toLowerCase(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          passwordHash: passwordHash || '',
          data: initialData || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncVersion: 1
        };
        await saveVault(key, vault);
        console.log(`[SyncRouter] Auto-registered new cloud vault on login for [${app}] ${cleanEmail}`);
      } else {
        return res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'No account found with this email. Please register first.'
        });
      }
    }

    // Verify passwordHash if set
    if (vault.passwordHash && passwordHash && vault.passwordHash !== passwordHash) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid password. Please check your credentials.'
      });
    }

    res.json({
      success: true,
      message: 'Login successful. Cloud data synchronized.',
      user: {
        email: cleanEmail,
        name: vault.name,
        lastSyncedAt: vault.updatedAt
      },
      data: vault.data,
      updatedAt: vault.updatedAt
    });
  } catch (err) {
    console.error('[SyncRouter] Login error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during login.' });
  }
});

// Push local data snapshot to cloud
router.post('/push', async (req, res) => {
  try {
    const { app = 'general', email, passwordHash, data, name } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    let vault = await getVault(key);

    const now = new Date().toISOString();

    if (!vault) {
      // Auto-create on first push
      vault = {
        app: String(app).toLowerCase(),
        email: cleanEmail,
        name: (name || cleanEmail.split('@')[0]).trim(),
        passwordHash: passwordHash || '',
        data: (data && typeof data === 'object' && !Array.isArray(data)) ? { ...data } : (data || {}),
        createdAt: now,
        updatedAt: now,
        syncVersion: 1
      };
    } else {
      // If password provided and mismatch, reject
      if (vault.passwordHash && passwordHash && vault.passwordHash !== passwordHash) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
      }

      // Update data snapshot with safe intelligent merge
      if (data !== undefined && data !== null) {
        if (typeof data === 'object' && !Array.isArray(data) && typeof vault.data === 'object' && !Array.isArray(vault.data)) {
          const merged = { ...vault.data };
          for (const [k, val] of Object.entries(data)) {
            if (Array.isArray(val)) {
              // Safety: Never let an empty array overwrite an existing populated array!
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
          vault.data = merged;
        } else {
          vault.data = data;
        }
      }
      if (name) vault.name = name.trim();
      vault.updatedAt = now;
      vault.syncVersion = (vault.syncVersion || 0) + 1;
    }

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

// Pull cloud data snapshot
router.all('/pull', async (req, res) => {
  try {
    const app = req.body?.app || req.query?.app || 'general';
    const email = req.body?.email || req.query?.email || '';
    const passwordHash = req.body?.passwordHash || req.query?.passwordHash || '';
    const cleanEmail = String(email).trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    const vault = await getVault(key);

    if (!vault) {
      return res.status(404).json({
        success: false,
        code: 'VAULT_NOT_FOUND',
        message: 'No cloud vault found for this account.'
      });
    }

    if (vault.passwordHash && passwordHash && vault.passwordHash !== passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    res.json({
      success: true,
      data: vault.data,
      updatedAt: vault.updatedAt,
      syncVersion: vault.syncVersion || 1
    });
  } catch (err) {
    console.error('[SyncRouter] Pull error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during pull.' });
  }
});

export default router;
