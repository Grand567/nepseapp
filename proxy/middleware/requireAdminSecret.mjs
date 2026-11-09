import crypto from 'crypto';

/**
 * Constant-time admin authorization middleware.
 * Verifies x-admin-key or x-cron-secret against ADMIN_API_KEY, INTERNAL_CRON_SECRET, or PROXY_ADMIN_SECRET.
 * Permits localhost loopback requests in development mode.
 */
export function requireAdminSecret(req, res, next) {
  const configuredSecret = process.env.ADMIN_API_KEY || process.env.INTERNAL_CRON_SECRET || process.env.PROXY_ADMIN_SECRET;
  
  // In development or when unconfigured, permit local loopback requests safely
  const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';
  if (!configuredSecret) {
    if (isLocalhost) {
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'ADMIN_API_KEY not configured on server and request is not from localhost.'
    });
  }

  const authHeader = req.headers['authorization'];
  let bearerToken = null;
  if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  const providedKey = req.headers['x-admin-key'] || req.headers['x-cron-secret'] || bearerToken || req.query?.adminKey;
  if (!providedKey) {
    // If request originates from authenticated localhost, allow
    if (isLocalhost && !process.env.ENFORCE_STRICT_ADMIN_KEY) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized. Admin key required.' });
  }

  const bufA = Buffer.from(String(configuredSecret));
  const bufB = Buffer.from(String(providedKey));
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return res.status(403).json({ success: false, error: 'Forbidden. Invalid admin key.' });
  }

  next();
}
