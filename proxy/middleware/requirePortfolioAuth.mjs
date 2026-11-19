import crypto from 'crypto';
import { isLoopbackRequest } from '../utils/corsConfig.mjs';
import { verifySyncSessionToken } from '../utils/syncSessionToken.mjs';

/**
 * Constant-time portfolio authorization middleware.
 * Verifies x-portfolio-key, x-admin-key, x-cron-secret, or Authorization Bearer token against:
 *  1) Configured server secrets (PORTFOLIO_AUTH_KEY, PORTFOLIO_SECRET, ADMIN_API_KEY, INTERNAL_CRON_SECRET, PROXY_ADMIN_SECRET)
 *  2) Server-issued signed Cloud Sync Session Tokens (scoping req.portfolioOwnerId = decoded.uid)
 *  3) Firebase ID tokens when Firebase Admin is initialized (scoping req.portfolioOwnerId = decoded.uid)
 * Strictly rejects unauthenticated requests and hardcoded fallback keys with 401/403.
 */
export function requirePortfolioAuth(req, res, next) {
  const allowLocalhostBypass =
    isLoopbackRequest(req) &&
    !process.env.ENFORCE_STRICT_PORTFOLIO_AUTH &&
    process.env.NODE_ENV !== 'production';

  const configuredSecrets = [
    process.env.PORTFOLIO_AUTH_KEY,
    process.env.PORTFOLIO_SECRET,
    process.env.ADMIN_API_KEY,
    process.env.INTERNAL_CRON_SECRET,
    process.env.PROXY_ADMIN_SECRET
  ].filter(Boolean);

  const authHeader = req.headers?.['authorization'];
  let bearerToken = null;
  if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  const providedKey =
    req.headers?.['x-portfolio-key'] ||
    req.headers?.['x-admin-key'] ||
    req.headers?.['x-cron-secret'] ||
    bearerToken;

  if (!providedKey) {
    if (allowLocalhostBypass) {
      req.portfolioOwnerId = 'local_dev';
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Access to personal portfolio holdings requires valid authentication credentials.'
    });
  }

  // 1. Check server-configured secrets in constant time
  if (configuredSecrets.length > 0) {
    const providedBuf = Buffer.from(String(providedKey));
    for (const secret of configuredSecrets) {
      const secretBuf = Buffer.from(String(secret));
      if (providedBuf.length === secretBuf.length && crypto.timingSafeEqual(providedBuf, secretBuf)) {
        req.portfolioOwnerId = 'admin';
        return next();
      }
    }
  }

  // 2. Check signed HMAC Cloud Sync Session Token (2 dot-separated segments)
  if (typeof providedKey === 'string') {
    const decodedSync = verifySyncSessionToken(providedKey);
    if (decodedSync && decodedSync.uid) {
      req.user = decodedSync;
      req.portfolioOwnerId = String(decodedSync.uid);
      return next();
    }
  }

  // 3. Check Firebase ID token (3 dot-separated JWT segments)
  if (typeof providedKey === 'string' && providedKey.split('.').length === 3) {
    try {
      import('firebase-admin/auth')
        .then(({ getAuth }) => getAuth().verifyIdToken(providedKey))
        .then((decoded) => {
          if (decoded && decoded.uid) {
            req.user = decoded;
            req.portfolioOwnerId = String(decoded.uid);
            return next();
          }
          return res.status(403).json({ success: false, error: 'Forbidden: Invalid portfolio token.' });
        })
        .catch(() => {
          return res.status(403).json({ success: false, error: 'Forbidden: Invalid portfolio token.' });
        });
      return;
    } catch (_) {}
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: Invalid portfolio credentials.'
  });
}
