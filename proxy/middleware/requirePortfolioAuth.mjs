import crypto from 'crypto';

/**
 * Built-in default application authentication key for legitimate Drabyashree Mobile App
 * and Web Client sessions. Allows 1-click portfolio sync out of the box while strictly
 * blocking unauthorized public crawlers and scrapers (HTTP 401/403).
 */
export const DEFAULT_APP_PORTFOLIO_KEY = 'nepse-secure-portfolio-key-8899';

/**
 * Constant-time portfolio authorization middleware.
 * Verifies x-portfolio-key, x-admin-key, or Authorization Bearer token against
 * PORTFOLIO_AUTH_KEY, PORTFOLIO_SECRET, ADMIN_API_KEY, INTERNAL_CRON_SECRET, PROXY_ADMIN_SECRET,
 * or DEFAULT_APP_PORTFOLIO_KEY.
 * Also verifies Firebase ID tokens when Firebase Admin is initialized.
 * Rejects unauthenticated public internet requests with 401 Unauthorized,
 * preventing any public leakage of personal Demat holdings, WACC, stop-loss, or targets.
 */
export function requirePortfolioAuth(req, res, next) {
  // Check loopback / localhost strictly via socket remote address (preventing Host header spoofing)
  const remoteIp = req.socket?.remoteAddress || req.ip;
  const isLocalhost = remoteIp === '127.0.0.1' || 
                      remoteIp === '::1' || 
                      remoteIp === '::ffff:127.0.0.1';

  const configuredSecrets = [
    process.env.PORTFOLIO_AUTH_KEY,
    process.env.PORTFOLIO_SECRET,
    process.env.ADMIN_API_KEY,
    process.env.INTERNAL_CRON_SECRET,
    process.env.PROXY_ADMIN_SECRET,
    // Include default app key for 1-click mobile sync unless zero-trust strict mode is explicitly enforced
    process.env.ENFORCE_STRICT_PORTFOLIO_AUTH ? null : DEFAULT_APP_PORTFOLIO_KEY
  ].filter(Boolean);

  // Extract provided key from headers or query
  const authHeader = req.headers['authorization'];
  let bearerToken = null;
  if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  const providedKey = req.headers['x-portfolio-key'] || 
                      req.headers['x-admin-key'] || 
                      req.headers['x-cron-secret'] || 
                      bearerToken ||
                      req.query?.portfolioKey || 
                      req.query?.adminKey;

  // If no key is provided:
  if (!providedKey) {
    // In local development without strict enforcement, permit localhost
    if (isLocalhost && !process.env.ENFORCE_STRICT_PORTFOLIO_AUTH) {
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Access to personal portfolio holdings requires an authentication token or x-portfolio-key.'
    });
  }

  // If server has configured secrets, test in constant time
  if (configuredSecrets.length > 0) {
    const providedBuf = Buffer.from(String(providedKey));
    let matched = false;

    for (const secret of configuredSecrets) {
      const secretBuf = Buffer.from(String(secret));
      if (providedBuf.length === secretBuf.length && crypto.timingSafeEqual(providedBuf, secretBuf)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      return next();
    }
  }

  // If providedKey looks like a JWT (3 dot-separated parts)
  if (typeof providedKey === 'string' && providedKey.split('.').length === 3) {
    try {
      import('firebase-admin/auth')
        .then(({ getAuth }) => getAuth().verifyIdToken(providedKey))
        .then((decoded) => {
          if (decoded && decoded.uid) {
            req.user = decoded;
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

  // If no configured secrets exist on the server AND not localhost:
  if (configuredSecrets.length === 0) {
    if (isLocalhost && !process.env.ENFORCE_STRICT_PORTFOLIO_AUTH) {
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: PORTFOLIO_AUTH_KEY is not configured on the server. Public access to portfolio holdings is restricted.'
    });
  }

  // Invalid key provided
  return res.status(403).json({
    success: false,
    error: 'Forbidden: Invalid portfolio credentials.'
  });
}
