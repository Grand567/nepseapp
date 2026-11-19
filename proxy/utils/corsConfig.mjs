// proxy/utils/corsConfig.mjs
// Shared CORS allowlist & strict socket-level loopback validation.

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const CORS_DEFAULTS = [
  'https://drabyashree-nepse-hub.onrender.com',
  'https://nepseapp.onrender.com',
  'https://drabyashree-nepse-hub6936.vercel.app',
  'https://nepse-hub.vercel.app',
  'https://drabyashree-nepse-hub-2347.vercel.app',
  'https://drabyashree-nepse-hub-11ef9.firebaseapp.com',
  'https://drabyashree-nepse-hub-11ef9.web.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1'
];

export function getAllowedOriginsSet() {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  return new Set([...CORS_DEFAULTS, ...envOrigins]);
}

export function isAllowedOrigin(origin, { allowNoOrigin = true } = {}) {
  if (!origin) return allowNoOrigin;
  const allowedSet = getAllowedOriginsSet();
  return (
    allowedSet.has(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)
  );
}

/**
 * Checks whether an incoming HTTP request originated from local loopback.
 * Strictly validates network IP addresses (never trusts spoofable req.hostname / Host header).
 */
export function isLoopbackRequest(req) {
  if (!req) return false;
  const socketIp = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '').trim();
  const reqIp = String(req.ip || '').trim();
  if (!socketIp && !reqIp) return false;
  if (socketIp && !LOOPBACK_IPS.has(socketIp)) return false;
  if (reqIp && !LOOPBACK_IPS.has(reqIp)) return false;
  return true;
}

export function createCorsOptions() {
  return {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin, { allowNoOrigin: true })) {
        return cb(null, true);
      }
      console.warn(`[CORS] Blocked origin: ${origin}`);
      return cb(new Error(`CORS policy: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-openrouter-key',
      'x-glm-key',
      'x-no-compression',
      'x-portfolio-key',
      'x-admin-key',
      'x-cron-secret',
      'Cache-Control',
      'Pragma',
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    optionsSuccessStatus: 204
  };
}
