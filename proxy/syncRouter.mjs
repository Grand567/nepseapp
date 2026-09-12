import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Data storage directory for vaults
const VAULT_DIR = path.resolve(__dirname, 'data', 'sync_vaults');
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

// Load existing vaults from disk on startup
const preloadVaults = () => {
  try {
    if (!fs.existsSync(VAULT_DIR)) return;
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
    console.log(`[SyncRouter] Preloaded ${memoryVaults.size} cloud sync vaults into memory.`);
  } catch (err) {
    console.warn('[SyncRouter] Error preloading vaults:', err.message);
  }
};
preloadVaults();

const saveVault = (key, vaultData) => {
  memoryVaults.set(key, vaultData);
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    fs.writeFileSync(getFilePath(key), JSON.stringify(vaultData, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[SyncRouter] Failed to write vault ${key} to disk:`, err.message);
  }
};

const getVault = (key) => {
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
  return null;
};

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health & status
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Kharcha & NEPSE Multi-Device Cloud Sync Bridge',
    activeVaults: memoryVaults.size,
    timestamp: new Date().toISOString()
  });
});

// Register new account & vault
router.post('/register', (req, res) => {
  try {
    const { app = 'general', email, passwordHash, name, initialData } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    const existing = getVault(key);

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

    saveVault(key, newVault);

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
router.post('/login', (req, res) => {
  try {
    const { app = 'general', email, passwordHash, autoRegisterIfMissing, initialData } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    let vault = getVault(key);

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
        saveVault(key, vault);
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
router.post('/push', (req, res) => {
  try {
    const { app = 'general', email, passwordHash, data, name } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    let vault = getVault(key);

    const now = new Date().toISOString();

    if (!vault) {
      // Auto-create on first push
      vault = {
        app: String(app).toLowerCase(),
        email: cleanEmail,
        name: (name || cleanEmail.split('@')[0]).trim(),
        passwordHash: passwordHash || '',
        data: data || {},
        createdAt: now,
        updatedAt: now,
        syncVersion: 1
      };
    } else {
      // If password provided and mismatch, reject
      if (vault.passwordHash && passwordHash && vault.passwordHash !== passwordHash) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
      }

      // Update data snapshot
      if (data !== undefined && data !== null) {
        vault.data = data;
      }
      if (name) vault.name = name.trim();
      vault.updatedAt = now;
      vault.syncVersion = (vault.syncVersion || 0) + 1;
    }

    saveVault(key, vault);

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
router.all('/pull', (req, res) => {
  try {
    const app = req.body?.app || req.query?.app || 'general';
    const email = req.body?.email || req.query?.email || '';
    const passwordHash = req.body?.passwordHash || req.query?.passwordHash || '';
    const cleanEmail = String(email).trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const key = getSafeKey(app, cleanEmail);
    const vault = getVault(key);

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
