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

const DEFAULT_TARGET_ORIGIN = 'https://drabyashree-nepse-hub.onrender.com';

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

function getNptTimeInfo() {
  const now = new Date();
  const nptOffset = (5 * 60 + 45) * 60 * 1000;
  const npt = new Date(now.getTime() + nptOffset);
  const day = npt.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
  const mins = npt.getUTCHours() * 60 + npt.getUTCMinutes();
  const secs = npt.getUTCSeconds();
  return { day, mins, secs };
}

function isNepseTradingHours() {
  const { day, mins } = getNptTimeInfo();
  // Mon to Fri (April 2026 regime): include Pre-Open (10:30) through Odd-Lot close (15:05)
  if (day === 0 || day === 6) return false;
  return mins >= 630 && mins <= 905;
}

function isPostCloseSettlementWindow() {
  const { day, mins } = getNptTimeInfo();
  if (day === 0 || day === 6) return false;
  return mins > 905 && mins <= 945;
}

function secondsUntilNextPreOpen() {
  const { day, mins, secs } = getNptTimeInfo();
  const isWeekday = day >= 1 && day <= 5;
  if (isWeekday && mins < 630) {
    return Math.max(5, (630 - mins) * 60 - secs);
  }
  let daysAhead = 1;
  while (((day + daysAhead) % 7) === 0 || ((day + daysAhead) % 7) === 6) {
    daysAhead++;
  }
  const secsLeftToday = (24 * 60 - mins) * 60 - secs;
  return Math.max(5, secsLeftToday + (daysAhead - 1) * 86400 + 630 * 60);
}

function isPrivateOrStreamRoute(pathname) {
  return (
    pathname.includes('/portfolio') ||
    pathname.includes('/meroshare') ||
    pathname.includes('/admin') ||
    pathname.includes('/auth') ||
    pathname.includes('/telegram') ||
    pathname.includes('/notifications') ||
    pathname.includes('/stream') ||
    pathname.includes('/sync')
  );
}

function isLiveSingleSessionRequest(url) {
  const pathname = url.pathname;
  const sp = url.searchParams;
  const daysRaw = String(sp.get('days') || '').trim().toLowerCase();
  const tfRaw = String(sp.get('timeframe') || sp.get('tf') || '').trim().toUpperCase();
  const dateRaw = String(sp.get('date') || '').trim();
  const fromDateRaw = String(sp.get('fromDate') || '').trim();
  const toDateRaw = String(sp.get('toDate') || '').trim();

  if (fromDateRaw || toDateRaw) return false;
  if (daysRaw && daysRaw !== '1') return false;
  if (tfRaw && tfRaw !== '1D') return false;

  // Match today's date in NPT if a specific date was passed
  if (dateRaw) {
    const now = new Date();
    const nptOffset = (5 * 60 + 45) * 60 * 1000;
    const todayIso = new Date(now.getTime() + nptOffset).toISOString().slice(0, 10);
    if (dateRaw !== todayIso) return false;
  }

  return (
    pathname.includes('/floorsheet') ||
    pathname.includes('/broker-analysis') ||
    pathname.includes('/smart-money') ||
    pathname.includes('/diagnostics') ||
    pathname.includes('/market-depth')
  );
}

function isExplicitBypassRequest(url, request) {
  const sp = url.searchParams;
  const reqCc = String(request.headers.get('Cache-Control') || '').toLowerCase();
  return (
    sp.get('refresh') === 'true' ||
    sp.has('sinceContractId') ||
    sp.has('afterContractNo') ||
    reqCc.includes('no-cache') ||
    reqCc.includes('no-store')
  );
}

function getCacheTtlSeconds(url, request) {
  const pathname = url.pathname;

  // 1. Authenticated, user-private, SSE stream, or explicit refresh routes: NEVER CACHE
  if (isPrivateOrStreamRoute(pathname) || isExplicitBypassRequest(url, request)) {
    return 0;
  }

  const isLive = isNepseTradingHours();
  const isSettlement = isPostCloseSettlementWindow();
  const maxOffHoursTtl = isLive ? Infinity : secondsUntilNextPreOpen();

  // 2. High-frequency live quotes, order book depth, intraday ticks & live 1D floorsheet/broker endpoints
  if (
    pathname.includes('/live-market') ||
    pathname.includes('/market/live') ||
    pathname.includes('/market-summary') ||
    pathname.includes('/market/summary') ||
    pathname.includes('/market/status') ||
    pathname.includes('/today-prices') ||
    pathname.includes('/live-index') ||
    pathname.includes('/intraday-graph') ||
    pathname.includes('/market-depth') ||
    /^\/api\/securities\/[^/]+\/price$/i.test(pathname) ||
    isLiveSingleSessionRequest(url)
  ) {
    if (isLive) return 3;
    if (isSettlement) return 10;
    return Math.min(1800, maxOffHoursTtl);
  }

  // 3. Multi-day / historical ledgers, dividends, macro & news
  if (
    pathname.includes('/history') ||
    pathname.includes('/ledger') ||
    pathname.includes('/dividends') ||
    pathname.includes('/broker') ||
    pathname.includes('/smart-money') ||
    pathname.includes('/macro') ||
    pathname.includes('/news') ||
    pathname.includes('/seasonality')
  ) {
    return (isLive || isSettlement) ? 300 : Math.min(86400, maxOffHoursTtl);
  }

  // 4. Health checks & ping
  if (pathname === '/health' || pathname === '/api/ping' || pathname === '/ping') {
    return 10;
  }

  return isLive ? 10 : (isSettlement ? 20 : Math.min(3600, maxOffHoursTtl));
}

function buildStaleBackupKey(url) {
  const cleanSearch = new URLSearchParams(url.searchParams);
  cleanSearch.delete('refresh');
  const qs = cleanSearch.toString();
  return new Request(`https://${url.hostname}/__stale_cache${url.pathname}${qs ? `?${qs}` : ''}`, {
    method: 'GET'
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);
    const targetOrigin = (env?.TARGET_ORIGIN || DEFAULT_TARGET_ORIGIN).replace(/\/$/, '');

    // ── Handle CORS Preflight (OPTIONS) ──
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const isSseStream = url.pathname.includes('/stream');
    const isPrivate = isPrivateOrStreamRoute(url.pathname);
    const isDeltaPoll = url.searchParams.has('sinceContractId') || url.searchParams.has('afterContractNo');
    const cacheTtl = getCacheTtlSeconds(url, request);
    const isCacheable = request.method === 'GET' && cacheTtl > 0;
    const allowStaleShield = request.method === 'GET' && !isPrivate && !isDeltaPoll;
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const staleKey = allowStaleShield ? buildStaleBackupKey(url) : null;

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

    // ── Build Origin Request ──
    const originUrl = new URL(url.pathname + url.search, targetOrigin);
    const originHeaders = new Headers(request.headers);
    originHeaders.set('Host', new URL(targetOrigin).hostname);
    originHeaders.set('X-Forwarded-Host', url.hostname);
    originHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
    if (clientIp) {
      originHeaders.set('X-Forwarded-For', clientIp);
    }

    const serveStaleFallback = async (reason) => {
      if (staleKey) {
        const staleResp = await cache.match(staleKey);
        if (staleResp) {
          const staleHeaders = new Headers(staleResp.headers);
          Object.entries(corsHeaders).forEach(([k, v]) => staleHeaders.set(k, v));
          staleHeaders.set('X-Edge-Cache', 'STALE');
          staleHeaders.set('X-Edge-Node', 'Cloudflare-CDN');
          staleHeaders.set('X-Origin-Status', String(reason));
          return new Response(staleResp.body, {
            status: staleResp.status,
            statusText: staleResp.statusText,
            headers: staleHeaders
          });
        }
      }
      return null;
    };

    let originResponse;
    try {
      const fetchInit = {
        method: request.method,
        headers: originHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow'
      };
      // Never apply short request timeout to SSE streams; allow 25s for cold-booting Render origin
      if (!isSseStream) {
        fetchInit.signal = AbortSignal.timeout(25000);
      }
      originResponse = await fetch(originUrl.toString(), fetchInit);
    } catch (err) {
      const stale = await serveStaleFallback(`error:${err?.name || 'timeout'}`);
      if (stale) return stale;
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

    // Serve stale shield when origin returns transient 429 challenge or 502/503/504 during cold starts or OOM restarts
    if (originResponse.status === 429 || (originResponse.status >= 502 && originResponse.status <= 504)) {
      const stale = await serveStaleFallback(`http_${originResponse.status}`);
      if (stale) return stale;
    }

    // Prepare response headers
    const responseHeaders = new Headers(originResponse.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
    responseHeaders.set('X-Edge-Cache', isCacheable ? 'MISS' : 'BYPASS');
    responseHeaders.set('X-Edge-Node', 'Cloudflare-CDN');
    responseHeaders.set('X-Data-Cached-At', new Date().toISOString());

    if (originResponse.status === 200) {
      if (isCacheable) {
        responseHeaders.set('Cache-Control', `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}`);
        const responseToCache = new Response(originResponse.clone().body, {
          status: originResponse.status,
          statusText: originResponse.statusText,
          headers: responseHeaders
        });
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      } else if (isPrivate || isExplicitBypassRequest(url, request)) {
        responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      }

      // Persist long-lived stale fallback copy for public GET requests
      if (staleKey) {
        const staleHeaders = new Headers(responseHeaders);
        staleHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        const staleToCache = new Response(originResponse.clone().body, {
          status: originResponse.status,
          statusText: originResponse.statusText,
          headers: staleHeaders
        });
        ctx.waitUntil(cache.put(staleKey, staleToCache));
      }
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: responseHeaders
    });
  }
};
