// proxy/utils/syncSessionToken.mjs
// Server-side salted scrypt password hashing & HMAC-SHA256 bearer session tokens for Cloud Sync + Portfolio auth.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cachedSecretsByDir = new Map();

function resolveDataDir() {
  if (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR)) {
    return process.env.NEPSE_DATA_DIR;
  }
  return path.resolve(__dirname, '..', 'data');
}

function getTokenSecret() {
  const envSecret =
    process.env.SYNC_TOKEN_SECRET ||
    process.env.ADMIN_API_KEY ||
    process.env.PORTFOLIO_AUTH_KEY ||
    process.env.INTERNAL_CRON_SECRET ||
    process.env.PROXY_ADMIN_SECRET;
  if (envSecret && String(envSecret).trim()) {
    return String(envSecret).trim();
  }

  const dataDir = resolveDataDir();
  if (cachedSecretsByDir.has(dataDir)) {
    return cachedSecretsByDir.get(dataDir);
  }

  const secretFile = path.join(dataDir, '.sync_token_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) {
        cachedSecretsByDir.set(dataDir, existing);
        return existing;
      }
    }
  } catch (_) {}

  const generated = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  } catch (_) {}
  cachedSecretsByDir.set(dataDir, generated);
  return generated;
}

/**
 * Hashes a client password/verifier with a random 16-byte salt using scrypt.
 */
export function hashPasswordServer(secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Password verifier must be a non-empty string.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Verifies a stored password hash against a candidate secret using constant-time comparison.
 * Supports scrypt$<salt>$<hash> and legacy unsalted hashes (flagging needsUpgrade: true).
 */
export function verifyPasswordServer(storedHash, candidate) {
  if (!storedHash || !candidate) {
    return { valid: false, needsUpgrade: false };
  }
  const storedStr = String(storedHash);
  const candStr = String(candidate);

  if (storedStr.startsWith('scrypt$')) {
    const parts = storedStr.split('$');
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      return { valid: false, needsUpgrade: false };
    }
    try {
      const expectedBuf = Buffer.from(parts[2], 'hex');
      const derivedBuf = crypto.scryptSync(candStr, parts[1], expectedBuf.length);
      const valid = expectedBuf.length === derivedBuf.length && crypto.timingSafeEqual(expectedBuf, derivedBuf);
      return { valid, needsUpgrade: false };
    } catch (_) {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Legacy hash verification path (one-time transparent upgrade on login)
  try {
    const expDigest = crypto.createHash('sha256').update(storedStr).digest();
    const candDigest = crypto.createHash('sha256').update(candStr).digest();
    const valid = crypto.timingSafeEqual(expDigest, candDigest);
    return { valid, needsUpgrade: valid };
  } catch (_) {
    return { valid: false, needsUpgrade: false };
  }
}

/**
 * Issues a signed HMAC-SHA256 bearer session token scoped to uid, email, and app.
 */
export function issueSyncSessionToken({ uid, email, app = 'nepse', ttlSeconds = 7 * 24 * 3600 } = {}) {
  if (!uid || !email) {
    throw new Error('uid and email are required to issue a sync session token.');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    uid: String(uid),
    email: String(email).trim().toLowerCase(),
    app: String(app).trim().toLowerCase(),
    iat: nowSec,
    exp: nowSec + Math.max(60, Number(ttlSeconds) || 7 * 24 * 3600)
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', getTokenSecret())
    .update(bodyB64)
    .digest('base64url');
  return `${bodyB64}.${sigB64}`;
}

/**
 * Verifies an HMAC-SHA256 sync session token and returns decoded claims, or null if invalid/expired.
 */
export function verifySyncSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getTokenSecret())
      .update(parts[0])
      .digest();
    const actualSig = Buffer.from(parts[1], 'base64url');
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') return null;
    if (!decoded.uid || !decoded.email || !decoded.exp) return null;
    if (Number(decoded.exp) * 1000 <= Date.now()) return null;

    return decoded;
  } catch (_) {
    return null;
  }
}
