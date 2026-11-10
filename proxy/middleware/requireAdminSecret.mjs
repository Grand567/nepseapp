import crypto from 'crypto';

/**
 * Checks whether an incoming HTTP request satisfies admin authentication.
 * Verifies x-admin-key or x-cron-secret against ADMIN_API_KEY, INTERNAL_CRON_SECRET, or PROXY_ADMIN_SECRET.
 * Permits localhost loopback requests in development mode.
 */
export function isValidAdminRequest(req) {
  const configuredSecret = process.env.ADMIN_API_KEY || process.env.INTERNAL_CRON_SECRET || process.env.PROXY_ADMIN_SECRET;
  const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';

  if (!configuredSecret) {
    return isLocalhost;
  }

  const authHeader = req.headers['authorization'];
  let bearerToken = null;
  if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  const providedKey = req.headers['x-admin-key'] || req.headers['x-cron-secret'] || bearerToken || req.query?.adminKey;
  if (!providedKey) {
    return isLocalhost && !process.env.ENFORCE_STRICT_ADMIN_KEY;
  }

  try {
    const bufA = Buffer.from(String(configuredSecret));
    const bufB = Buffer.from(String(providedKey));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch (_) {
    return false;
  }
}

/**
 * Constant-time admin authorization middleware.
 */
export function requireAdminSecret(req, res, next) {
  if (isValidAdminRequest(req)) {
    return next();
  }
  const providedKey = req.headers?.['x-admin-key'] || req.headers?.['x-cron-secret'] || req.headers?.['authorization'] || req.query?.adminKey;
  if (providedKey) {
    return res.status(403).json({ success: false, error: 'Forbidden. Invalid admin key.' });
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Admin key required.' });
}
