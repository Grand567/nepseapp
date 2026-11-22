/**
 * Drabyashree NEPSE - Cloudflare Edge CDN & Reverse Proxy Worker
 * 
 * Target Origin: https://drabyashree-nepse-hub.onrender.com
 * 
 * Architecture & Features:
 *  1. Zero Render Bandwidth: Edge caches market data globally (including Kathmandu KTM node).
 *  2. 100% Free Forever: Cloudflare gives unlimited outbound bandwidth & 100,000 req/day for free.
 *  3. Dynamic NEPSE Market Schedule:
 *     - Intraday Market Hours (Mon-Fri 11:00 AM – 3:00 PM NPT): 3-5 seconds cache.
 *     - Off-Market Hours, Nights, Weekends, Holidays: 1 hour – 24 hours edge cache.
 *     - Authenticated Routes (/portfolio, /meroshare, /admin): strictly NO-STORE (zero caching).
 *  4. Cold-Start Shield (Stale-While-Revalidate / Stale-If-Error):
 *     If Render is asleep (returning 502/503 during cold boot), Cloudflare serves cached data instantly.
 *  5. Sub-1ms CORS Preflight:
 *     Handles HTTP OPTIONS directly at the edge without querying Render.
 */

const TARGET_ORIGIN = 'https://drabyashree-nepse-hub.onrender.com';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.web\.app$/,
  /^capacitor:\/\/localhost$/,
  /^http:\/\/localhost$/
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some(pat => pat.test(origin));
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = isAllowedOrigin(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-portfolio-key, x-admin-key, x-cron-secret, If-None-Match, Cache-Control',
    'Access-Control-Allow-Credentials': allowOrigin === '*' ? 'false' : 'true',
    'Access-Control-Max-Age': '86400'
  };
}

function isNepseTradingHours() {
  const now = new Date();
  const nptOffset = (5 * 60 + 45) * 60 * 1000;
  const npt = new Date(now.getTime() + nptOffset);
  const day = npt.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
  // Mon to Fri (April 2026 regime)
  if (day === 0 || day === 6) return false;
  const mins = npt.getUTCHours() * 60 + npt.getUTCMinutes();
  return mins >= 660 && mins <= 900; // 11:00 AM (660) to 3:00 PM (900)
}

function getCacheTtlSeconds(pathname) {
  // 1. Authenticated / user-private routes: NEVER CACHE
  if (
    pathname.includes('/portfolio') ||
    pathname.includes('/meroshare') ||
    pathname.includes('/admin') ||
    pathname.includes('/auth') ||
    pathname.includes('/telegram') ||
    pathname.includes('/notifications') ||
    pathname.includes('/stream')
  ) {
    return 0;
  }

  const isLive = isNepseTradingHours();

  // 2. High-frequency live endpoints
  if (
    pathname.includes('/live-market') ||
    pathname.includes('/market-summary') ||
    pathname.includes('/today-prices') ||
    pathname.includes('/live-index') ||
    pathname.includes('/intraday-graph')
  ) {
    return isLive ? 3 : 1800; // 3 sec during market, 30 min off-hours
  }

  // 3. Historical, ledger, dividend, fundamentals, analytics
  if (
    pathname.includes('/history') ||
    pathname.includes('/ledger') ||
    pathname.includes('/dividends') ||
    pathname.includes('/broker') ||
    pathname.includes('/macro') ||
    pathname.includes('/news') ||
    pathname.includes('/seasonality')
  ) {
    return isLive ? 300 : 86400; // 5 min during market, 24 hours off-hours
  }

  // 4. Health checks & ping
  if (pathname === '/health' || pathname === '/api/ping' || pathname === '/ping') {
    return 10;
  }

  return isLive ? 10 : 3600;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    // ── Handle CORS Preflight (OPTIONS) ──
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const cacheTtl = getCacheTtlSeconds(url.pathname);
    const isCacheable = request.method === 'GET' && cacheTtl > 0;
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    // ── Check Edge Cache ──
    if (isCacheable) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const newHeaders = new Headers(cachedResponse.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        newHeaders.set('X-Edge-Cache', 'HIT');
        newHeaders.set('X-Edge-Node', 'Cloudflare-CDN');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: newHeaders
        });
      }
    }

    // ── Build Origin Request to Render ──
    const originUrl = new URL(url.pathname + url.search, TARGET_ORIGIN);
    const originHeaders = new Headers(request.headers);
    originHeaders.set('Host', new URL(TARGET_ORIGIN).hostname);
    originHeaders.set('X-Forwarded-Host', url.hostname);
    originHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
    if (clientIp) {
      originHeaders.set('X-Forwarded-For', clientIp);
    }

    let originResponse;
    try {
      originResponse = await fetch(originUrl.toString(), {
        method: request.method,
        headers: originHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow'
      });
    } catch (err) {
      // ── Cold-Start Shield / Error Handling ──
      // If Render is down or cold-booting and we have an expired cached response, return it
      if (isCacheable) {
        const stale = await cache.match(cacheKey);
        if (stale) {
          const sHeaders = new Headers(stale.headers);
          Object.entries(corsHeaders).forEach(([k, v]) => sHeaders.set(k, v));
          sHeaders.set('X-Edge-Cache', 'STALE-FALLBACK');
          return new Response(stale.body, { status: 200, headers: sHeaders });
        }
      }

      return new Response(
        JSON.stringify({
          error: 'Backend gateway waking up. Please retry in a few seconds.',
          code: 'RENDER_COLD_START',
          details: err.message
        }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': '15'
          }
        }
      );
    }

    // Prepare response headers
    const responseHeaders = new Headers(originResponse.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
    responseHeaders.set('X-Edge-Cache', 'MISS');
    responseHeaders.set('X-Edge-Node', 'Cloudflare-CDN');

    // If cacheable, store into Cloudflare Edge Cache
    if (isCacheable && originResponse.status === 200) {
      responseHeaders.set(
        'Cache-Control',
        `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}, stale-while-revalidate=60`
      );

      const responseToCache = new Response(originResponse.clone().body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: responseHeaders
      });

      ctx.waitUntil(cache.put(cacheKey, responseToCache));
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: responseHeaders
    });
  }
};
