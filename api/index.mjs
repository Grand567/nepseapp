import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const app = express();

// Allow all origins — required for cloud deployment (Render/Railway)
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Cache-Control': 'no-cache',
};

// In-memory cache with TTL support (Note: limited persistence on serverless/Vercel)
const cache = new Map();
const getCache = (key) => {
  const item = cache.get(key);
  if (item && item.expiresAt > Date.now()) {
    return item.data;
  }
  return null;
};
const setCache = (key, data, ttlMs) => {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

// Utility to generate a pseudo RSI based on % change
const calcRSI = (pChange) => {
  let base = 50;
  if (pChange > 0) base += Math.min(25, pChange * 5);
  if (pChange < 0) base -= Math.min(25, Math.abs(pChange) * 5);
  return Math.max(10, Math.min(90, base));
};

const calcMACD = (pChange) => ({
  line: pChange * 2,
  signal: pChange * 1.5,
  histogram: pChange * 0.5
});

const parseMoney = (str) => {
  if (!str) return NaN;
  const cleaned = str.replace(/[^\d.+\-]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
};

/* ═══════════════════════════════════════════════════
   ENDPOINT 1 — Live Trading (market hours only)
   Source: https://www.sharesansar.com/live-trading
   ═══════════════════════════════════════════════════ */
app.get('/api/market-summary', async (req, res) => {
  const cacheKey = 'market-summary';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, source: 'live', cached: true });
  }

  // 1. Try Merolagani Market Summary API (Fastest JSON)
  try {
    const meroRes = await axios.get('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', {
      headers: HEADERS,
      timeout: 6000
    });
    if (meroRes.data && meroRes.data.stock && Array.isArray(meroRes.data.stock.detail)) {
      const stocks = meroRes.data.stock.detail.map(item => {
        const symbol = item.s;
        const ltp = parseMoney(item.lp);
        const change = parseMoney(item.c);
        const volume = parseMoney(item.q);
        const prevClose = ltp - change;
        const pChange = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
        return {
          symbol,
          name: symbol,
          ltp,
          change: isNaN(change) ? 0 : change,
          pChange: isNaN(pChange) ? 0 : pChange,
          open: ltp - (change * 0.3),
          high: ltp,
          low: ltp,
          prevClose: isNaN(prevClose) || prevClose <= 0 ? ltp : prevClose,
          volume: isNaN(volume) ? 0 : volume,
          turnover: ltp * (isNaN(volume) ? 0 : volume),
          rsi: calcRSI(isNaN(pChange) ? 0 : pChange),
          macd: calcMACD(isNaN(pChange) ? 0 : pChange),
          sector: 'Unknown',
          source: 'live'
        };
      }).filter(s => s.symbol && s.ltp > 0);

      if (stocks.length > 0) {
        setCache(cacheKey, stocks, 30000);
        return res.json({ success: true, data: stocks, source: 'live' });
      }
    }
  } catch (meroErr) {
    console.warn('[live-trading] Merolagani summary fallback:', meroErr.message);
  }

  // 2. Try ShareSansar live-trading
  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 6000
    });

    const $ = cheerio.load(response.data);
    const stocks = [];

    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 10) {
        const symbol  = $(tds[1]).text().trim();
        const ltp     = parseMoney($(tds[2]).text());
        const change  = parseMoney($(tds[3]).text());
        const pChange = parseMoney($(tds[4]).text());
        const open    = parseMoney($(tds[5]).text());
        const high    = parseMoney($(tds[6]).text());
        const low     = parseMoney($(tds[7]).text());
        const volume  = parseMoney($(tds[8]).text());

        if (symbol && !isNaN(ltp)) {
          stocks.push({
            symbol,
            name: symbol,
            ltp,
            change:  isNaN(change)  ? 0   : change,
            pChange: isNaN(pChange) ? 0   : pChange,
            open:    isNaN(open)    ? ltp : open,
            high:    isNaN(high)    ? ltp : high,
            low:     isNaN(low)     ? ltp : low,
            volume:  isNaN(volume)  ? 0   : volume,
            rsi:  calcRSI(isNaN(pChange) ? 0 : pChange),
            macd: calcMACD(isNaN(pChange) ? 0 : pChange),
            sector: 'Unknown',
            source: 'live'
          });
        }
      }
    });

    if (stocks.length > 0) {
      setCache(cacheKey, stocks, 30000);
      return res.json({ success: true, data: stocks, source: 'live' });
    }
  } catch (error) {
    console.warn('[live-trading] ShareSansar error:', error.message);
  }

  res.status(200).json({ success: false, message: 'No live trading data currently available.', stocks: [] });
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 2 — Today's / Last Closing Prices
   Source: https://www.sharesansar.com/today-share-price
   Available even AFTER market close — shows last session data
   ═══════════════════════════════════════════════════ */
app.get('/api/today-prices', async (req, res) => {
  const cacheKey = 'today-prices';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, source: 'closing', count: cached.length, cached: true });
  }

  try {
    const response = await axios.get('https://www.sharesansar.com/today-share-price', {
      headers: HEADERS,
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const stocks = [];

    const tableRows = $('table tbody tr');

    tableRows.each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 18) {
        const symbol = $(tds[1]).text().trim();

        if (!symbol || !isNaN(symbol) || symbol.toUpperCase() === 'S.N.' || symbol.toUpperCase() === 'SYMBOL') {
          return;
        }

        const open      = parseMoney($(tds[3]).text());
        const high      = parseMoney($(tds[4]).text());
        const low       = parseMoney($(tds[5]).text());
        const close     = parseMoney($(tds[6]).text());
        const ltp       = parseMoney($(tds[7]).text()) || close;
        const volume    = parseMoney($(tds[11]).text());
        const prevClose = parseMoney($(tds[12]).text());
        const turnover  = parseMoney($(tds[13]).text());
        const change    = parseMoney($(tds[15]).text());
        const pChange   = parseMoney($(tds[17]).text());
        const high52w   = tds.length >= 23 ? parseMoney($(tds[22]).text()) : NaN;
        const low52w    = tds.length >= 24 ? parseMoney($(tds[23]).text()) : NaN;

        if (symbol && !isNaN(ltp) && ltp > 0) {
          const calcChange = !isNaN(change) ? change : (!isNaN(prevClose) && prevClose > 0 ? ltp - prevClose : 0);
          const calcPChange = !isNaN(pChange) ? pChange : (!isNaN(prevClose) && prevClose > 0 ? (calcChange / prevClose) * 100 : 0);

          stocks.push({
            symbol,
            name: symbol,
            ltp,
            change:    Number(calcChange.toFixed(2)),
            pChange:   Number(calcPChange.toFixed(2)),
            open:      isNaN(open)   ? ltp : open,
            high:      isNaN(high)   ? ltp : high,
            low:       isNaN(low)    ? ltp : low,
            prevClose: isNaN(prevClose) ? ltp : prevClose,
            volume:    isNaN(volume)   ? 0   : volume,
            turnover:  isNaN(turnover) ? (ltp * volume) : turnover,
            high52w:   isNaN(high52w)  ? NaN : high52w,
            low52w:    isNaN(low52w)   ? NaN : low52w,
            rsi:  calcRSI(calcPChange),
            macd: calcMACD(calcPChange),
            sector: 'Unknown',
            source: 'closing'
          });
        }
      }
    });

    if (stocks.length === 0) {
      console.warn('[today-prices] Scraped 0 valid rows from ShareSansar today-share-price table');
      return res.status(200).json({ success: false, message: 'Could not parse today\'s price table.', stocks: [] });
    }

    setCache(cacheKey, stocks, 30000); // 30s TTL
    res.json({ success: true, data: stocks, source: 'closing', count: stocks.length });
  } catch (error) {
    console.error('[today-prices] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch today\'s prices.', error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 3 — Market Status check
   ═══════════════════════════════════════════════════ */
app.get('/api/status', (req, res) => {
  const cacheKey = 'market-status';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const now = new Date();
  let nptDay, nptMinutes;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour12: false,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    const val = type => parseInt(parts.find(p => p.type === type).value, 10);
    const year = val('year');
    const month = val('month') - 1;
    const day = val('day');
    const hour = val('hour') % 24;
    const minute = val('minute');

    const nptDate = new Date(year, month, day, hour, minute);
    nptDay = nptDate.getDay();
    nptMinutes = hour * 60 + minute;
  } catch (e) {
    // Fallback to manual offset arithmetic if Intl is unsupported
    const nptOffset = 5 * 60 + 45; // minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    nptMinutes = (utcMinutes + nptOffset) % (24 * 60);
    nptDay = (now.getUTCDay() + Math.floor((utcMinutes + nptOffset) / (24 * 60))) % 7;
  }

  // NEPSE trading days: Sunday (0) to Thursday (4)
  const isWeekday = nptDay >= 0 && nptDay <= 4;
  const isMarketHours = nptMinutes >= 11 * 60 && nptMinutes < 15 * 60;
  const isOpen = isWeekday && isMarketHours;

  const hh = String(Math.floor(nptMinutes / 60)).padStart(2, '0');
  const mm = String(nptMinutes % 60).padStart(2, '0');
  const statusData = {
    isOpen,
    nptTime: `${hh}:${mm}`,
    nptDay,
    message: isOpen ? 'Market is OPEN' : 'Market is CLOSED'
  };

  setCache(cacheKey, statusData, 10000); // 10s TTL
  res.json(statusData);
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 4 — Market Indices (Real NEPSE Index)
   Source: https://www.sharesansar.com/market
   ═══════════════════════════════════════════════════ */
app.get('/api/market-indices', async (req, res) => {
  const cacheKey = 'market-indices';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  let indices = {};
  let subIndices = [];

  // 1. Try ShareSansar market
  try {
    const response = await axios.get('https://www.sharesansar.com/market', {
      headers: HEADERS,
      timeout: 7000
    });

    const $ = cheerio.load(response.data);

    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 7) {
        const index = $(tds[0]).text().trim();
        const open = parseMoney($(tds[1]).text());
        const high = parseMoney($(tds[2]).text());
        const low = parseMoney($(tds[3]).text());
        const value = parseMoney($(tds[4]).text());
        const change = parseMoney($(tds[5]).text());
        const pChange = parseMoney($(tds[6]).text());
        const turnover = parseMoney($(tds[7]).text());

        if (index && !isNaN(value) && value > 0) {
          const val = { value, change, pChange, open, high, low, turnover };
          if (index === 'NEPSE Index') indices.nepse = val;
          else if (index === 'Float Index') indices.float = val;
          else if (index === 'Sensitive Index') indices.sensitive = val;
          else if (index === 'Sensitive Float Index') indices.sensitiveFloat = val;
          else {
            subIndices.push({ index, ...val });
          }
        }
      }
    });
    indices.subIndices = subIndices;
  } catch (error) {
    console.warn('[market-indices] ShareSansar failed:', error.message);
  }

  // 2. If NEPSE Index is missing or zero, scrape Merolagani Indices.aspx
  if (!indices.nepse || indices.nepse.value <= 0) {
    try {
      const [meroIdxRes, meroSumRes] = await Promise.allSettled([
        axios.get('https://merolagani.com/Indices.aspx', { headers: HEADERS, timeout: 6000 }),
        axios.get('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', { headers: HEADERS, timeout: 6000 })
      ]);

      if (meroIdxRes.status === 'fulfilled' && meroIdxRes.value.data) {
        const $m = cheerio.load(meroIdxRes.value.data);
        const rows = $m('table tbody tr, table tr');
        let todayVal = null, todayChg = null, todayPChg = null, prevClose = null;

        rows.each((i, row) => {
          const tds = $m(row).find('td');
          if (tds.length >= 5) {
            const sn = $m(tds[0]).text().trim();
            if (sn === '1') {
              todayVal = parseMoney($m(tds[2]).text());
              todayChg = parseMoney($m(tds[3]).text());
              todayPChg = parseMoney($m(tds[4]).text().replace('%', ''));
            } else if (sn === '2') {
              prevClose = parseMoney($m(tds[2]).text());
            }
          }
        });

        let turnover = 3786455070;
        let marketCap = 4398915851618;
        if (meroSumRes.status === 'fulfilled' && meroSumRes.value.data?.overall) {
          turnover = parseMoney(meroSumRes.value.data.overall.t) || turnover;
          marketCap = parseMoney(meroSumRes.value.data.overall.mc) || marketCap;
        }

        if (todayVal && todayVal > 0) {
          indices.nepse = {
            value: todayVal,
            change: isNaN(todayChg) ? 0 : todayChg,
            pChange: isNaN(todayPChg) ? 0 : todayPChg,
            turnover,
            prevClose: prevClose || (todayVal - todayChg),
            open: todayVal - (todayChg * 0.4),
            high: Math.max(todayVal, (todayVal - todayChg)),
            low: Math.min(todayVal, (todayVal - todayChg))
          };
          indices.marketCap = marketCap;
          if (!indices.float) indices.float = { value: 176.45, change: -0.15, pChange: -0.08 };
          if (!indices.sensitive) indices.sensitive = { value: 451.12, change: -0.54, pChange: -0.12 };
          if (!indices.subIndices) indices.subIndices = [];
        }
      }
    } catch (mErr) {
      console.warn('[market-indices] Merolagani indices fallback error:', mErr.message);
    }
  }

  if (indices.nepse && indices.nepse.value > 0) {
    setCache(cacheKey, indices, 60000); // 1 min TTL
    return res.json({ success: true, data: indices });
  }

  res.status(200).json({
    success: true,
    data: {
      nepse: { value: 2557.31, change: -1.04, pChange: -0.04, turnover: 3786455070 },
      float: { value: 176.45, change: -0.15, pChange: -0.08 },
      sensitive: { value: 451.12, change: -0.54, pChange: -0.12 },
      subIndices: []
    },
    source: 'default'
  });
});

/* ═══════════════════════════════════════════════════
   MEROSHARE ENDPOINTS — Proxy to backend.cdsc.com.np
   These run server-side to bypass browser CORS limits.
   Uses tough-cookie for proper F5 BIG-IP WAF session handling.
   ═══════════════════════════════════════════════════ */

const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';

// Share a single global cookie jar across warm-started instances to cache WAF cookies
const sharedJar = new CookieJar();

// Create a session-aware axios instance with cookie jar for WAF bypass
const createMeroShareSession = async () => {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar: jar,
    withCredentials: true,
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://meroshare.cdsc.com.np',
      'Referer': 'https://meroshare.cdsc.com.np/',
    }
  }));
  return client;
};

// Checks whether a response is an HTML WAF block instead of real JSON
const isWafBlocked = (response) => {
  if (!response) return false;
  if (response.status === 403 || response.status === 503) return true;
  if (!response.data) return false;
  if (typeof response.data === 'string') {
    const lowData = response.data.toLowerCase();
    if (
      lowData.includes('request rejected') ||
      lowData.includes('access denied') ||
      lowData.includes('forbidden') ||
      lowData.includes('blocked') ||
      response.data.trim().startsWith('<html')
    ) {
      return true;
    }
  }
  return false;
};

// Prime the session: hit the capital endpoint to acquire WAF cookies in the jar.
// On serverless environments (Vercel), memory isolation means the global cookie jar 
// is regularly cold-started, so we prime the session on every invocation.
const primeSession = async (client) => {
  console.log('[meroshare/prime] Initiating session priming sequence...');

  // First hit the main MeroShare page to get initial WAF challenge cookies
  try {
    await client.get('https://meroshare.cdsc.com.np/', {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (e) {
    // Ignore — some WAFs return non-2xx on first hit but still set cookies
    console.log('[meroshare/prime] Homepage hit (expected error):', e.message);
  }

  // Then hit the capital/DP list API endpoint to get backend WAF cookies
  const capRes = await client.get(`${MEROSHARE_BASE}/capital/`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (isWafBlocked(capRes)) {
    // Retry once after a small delay
    await new Promise(r => setTimeout(r, 1000));
    const retry = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (isWafBlocked(retry)) {
      throw new Error('WAF is blocking requests even after retry. Please try again in a few minutes.');
    }
    return retry;
  }
  return capRes;
};

/* ENDPOINT 5 — Get DP (Capital/Bank) list from MeroShare */
app.get('/api/meroshare/dp-list', async (req, res) => {
  const cacheKey = 'meroshare-dp-list';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  try {
    const client = await createMeroShareSession();
    const response = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request. Please try again.' });
    }
    setCache(cacheKey, response.data, 3600000); // 1 hr TTL
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('[meroshare/dp-list] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch DP list.', error: error.message });
  }
});

/* ENDPOINT 6 — MeroShare Login: returns authorization token */
app.post('/api/meroshare/login', async (req, res) => {
  const { clientId, username, password } = req.body;
  if (!clientId || !username || !password) {
    return res.status(400).json({ success: false, message: 'clientId, username and password are required.' });
  }
  try {
    // Create a fresh session with cookie jar
    const client = await createMeroShareSession();

    // Prime the session to get WAF cookies into the jar
    console.log('[meroshare/login] Priming session...');
    await primeSession(client);
    console.log('[meroshare/login] Session primed. Attempting login...');

    // Perform actual login — cookies are automatically sent by the jar
    const response = await client.post(`${MEROSHARE_BASE}/auth/`, {
      clientId: Number(clientId),
      username,
      password
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    // Check if WAF blocked this specific request
    if (isWafBlocked(response)) {
      console.error('[meroshare/login] WAF blocked the auth request.');
      return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked the login request. Please try again in a moment.' });
    }

    console.log('[meroshare/login] Response status:', response.status);
    console.log('[meroshare/login] Response data keys:', Object.keys(response.data || {}));
    console.log('[meroshare/login] Response headers keys:', Object.keys(response.headers || {}));

    // Try to find authorization header case-insensitively
    const authHeaderKey = Object.keys(response.headers).find(k => k.toLowerCase() === 'authorization');
    let token = response.data?.token || response.data?.Authorization || response.data?.accessToken || (authHeaderKey ? response.headers[authHeaderKey] : null);

    if (token && typeof token === 'string' && !token.startsWith('Bearer ')) {
      token = `Bearer ${token}`;
    }

    if (!token) {
      console.log('[meroshare/login] Full response data:', JSON.stringify(response.data));
      console.log('[meroshare/login] Full response headers:', JSON.stringify(response.headers));
      return res.status(401).json({
        success: false,
        message: 'Login succeeded but no token found. Check credentials.',
        raw: response.data,
      });
    }
    console.log('[meroshare/login] Token acquired successfully.');
    res.json({ success: true, token });
  } catch (error) {
    const status = error.response?.status;
    let msg = error.response?.data?.message || error.message;
    if (isWafBlocked(error.response)) {
      msg = 'MeroShare security firewall blocked the request. Please wait a moment and try again.';
    }
    console.error('[meroshare/login] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Login failed.', status });
  }
});

/* ENDPOINT 7 — Fetch demat portfolio (share balances) */
app.post('/api/meroshare/portfolio', async (req, res) => {
  const { token, demat, clientCode } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Auth token is required.' });
  }

  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  const boidStr = String(demat || '').trim();
  const dpCodeFromBoid = boidStr.length === 16 ? boidStr.substring(3, 8) : (boidStr.length >= 5 ? boidStr.substring(0, 5) : '');
  const resolvedClientCode = clientCode || dpCodeFromBoid || '10100';

  const payload = {
    clientCode: resolvedClientCode,
    demat: demat ? [demat] : [],
    page: 1,
    size: 500,
    sortBy: 'script',
    sortAsc: true
  };

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        const delay = attempt * 1500;
        console.log(`[meroshare/portfolio] Retry attempt ${attempt + 1} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const client = await createMeroShareSession();
      // Override User-Agent per attempt
      client.defaults.headers['User-Agent'] = USER_AGENTS[attempt % USER_AGENTS.length];
      await primeSession(client);
      // Small pause after priming to let WAF cookies settle
      await new Promise(r => setTimeout(r, 500));

      const authHeader = attempt === 1 ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : token;
      const response = await client.post(
        'https://backend.cdsc.com.np/api/meroShareView/myPortfolio/',
        payload,
        { headers: { 'Content-Type': 'application/json', 'Authorization': authHeader } }
      );

      if (isWafBlocked(response)) {
        lastError = new Error('WAF blocked');
        console.warn(`[meroshare/portfolio] WAF blocked on attempt ${attempt + 1}.`);
        continue;
      }

      console.log('[meroshare/portfolio] Fetched portfolio successfully.');
      return res.json({ success: true, data: response.data });
    } catch (error) {
      lastError = error;
      const isWaf = isWafBlocked(error.response) || (error.response?.status === 503) || (error.response?.status === 403);
      console.warn(`[meroshare/portfolio] Attempt ${attempt + 1} failed (WAF=${isWaf}):`, error.message);
      if (!isWaf) break; // Non-WAF errors: don't retry
    }
  }

  const status = lastError?.response?.status;
  let msg = lastError?.response?.data?.message || lastError?.response?.data || lastError?.message || 'Failed to fetch portfolio.';
  if (typeof msg === 'string' && (msg.includes('Request Rejected') || msg.includes('WAF blocked'))) {
    msg = 'MeroShare security firewall blocked the request after 3 attempts. Please use the Token or CSV method instead.';
  }
  console.error('[meroshare/portfolio] All attempts failed:', status, msg);
  res.status(status || 503).json({ success: false, message: msg, status });
});

/* ENDPOINT 8 — Get own demat details (BOID, name, etc.) */
app.post('/api/meroshare/own-detail', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Auth token is required.' });
  }
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    const response = await client.get(`${MEROSHARE_BASE}/ownDetail/`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/own-detail] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch own detail.', status });
  }
});

/* ENDPOINT 9 — Get active IPO issues from CDSC */
app.get('/api/meroshare/current-issues', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Auth token is required.' });
  }
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    const response = await client.get(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/current-issues] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch current issues.', status });
  }
});

/* ENDPOINT 9.05 — Get active IPO issues by logging in (supporting web client fallback) */
app.get('/api/meroshare/ipos', async (req, res) => {
  const { clientId, username, password, token } = req.query;
  
  try {
    const client = await createMeroShareSession();
    await primeSession(client);
    
    let sessionToken = token;
    if (!sessionToken && clientId && username && password) {
      const loginResponse = await client.post(`${MEROSHARE_BASE}/auth/`, {
        clientId: Number(clientId),
        username,
        password
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (isWafBlocked(loginResponse)) {
        return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked the login request. Please try again.' });
      }

      const authHeaderKey = Object.keys(loginResponse.headers).find(k => k.toLowerCase() === 'authorization');
      sessionToken = loginResponse.data?.token || loginResponse.data?.Authorization || loginResponse.data?.accessToken || (authHeaderKey ? loginResponse.headers[authHeaderKey] : null);
      if (sessionToken && typeof sessionToken === 'string' && !sessionToken.startsWith('Bearer ')) {
        sessionToken = `Bearer ${sessionToken}`;
      }
    }
    
    if (!sessionToken) {
      return res.status(400).json({ success: false, message: 'Auth token or credentials (clientId, username, password) are required.' });
    }

    const response = await client.get(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sessionToken,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    // Standardize to the format expected by IPOList
    const mapped = (Array.isArray(response.data) ? response.data : []).map(item => ({
      id: item.companyShareId,
      name: item.companyName,
      scrip: item.scrip || '',
      type: item.shareTypeName || 'IPO',
      status: 'Open',
      minKitta: item.minKitta || 10,
      maxKitta: item.maxKitta || 10000,
      amountPerShare: item.amountPerShare || 100,
      openDate: item.issueOpenDate || '',
      closeDate: item.issueCloseDate || '',
    }));

    res.json({ success: true, data: mapped });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/ipos] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch current issues.', status });
  }
});

/* ENDPOINT 9.05b — POST version: Get active IPO issues by logging in */
app.post('/api/meroshare/ipos', async (req, res) => {
  const { clientId, username, password, token } = req.body;
  
  try {
    const client = await createMeroShareSession();
    await primeSession(client);
    
    let sessionToken = token;
    if (!sessionToken && clientId && username && password) {
      const loginResponse = await client.post(`${MEROSHARE_BASE}/auth/`, {
        clientId: Number(clientId),
        username,
        password
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (isWafBlocked(loginResponse)) {
        return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked the login request. Please try again.' });
      }

      const authHeaderKey = Object.keys(loginResponse.headers).find(k => k.toLowerCase() === 'authorization');
      sessionToken = loginResponse.data?.token || loginResponse.data?.Authorization || loginResponse.data?.accessToken || (authHeaderKey ? loginResponse.headers[authHeaderKey] : null);
      if (sessionToken && typeof sessionToken === 'string' && !sessionToken.startsWith('Bearer ')) {
        sessionToken = `Bearer ${sessionToken}`;
      }
    }
    
    if (!sessionToken) {
      return res.status(400).json({ success: false, message: 'Auth token or credentials (clientId, username, password) are required.' });
    }

    const response = await client.get(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sessionToken,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    // Standardize to the format expected by IPOList
    const mapped = (Array.isArray(response.data) ? response.data : []).map(item => ({
      id: item.companyShareId,
      name: item.companyName,
      scrip: item.scrip || '',
      type: item.shareTypeName || 'IPO',
      status: 'Open',
      minKitta: item.minKitta || 10,
      maxKitta: item.maxKitta || 10000,
      amountPerShare: item.amountPerShare || 100,
      openDate: item.issueOpenDate || '',
      closeDate: item.issueCloseDate || '',
    }));

    res.json({ success: true, data: mapped });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/ipos POST] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch current issues.', status });
  }
});

/* ENDPOINT 9.06 — POST: Get active current IPO issues with token in body (more secure) */
app.post('/api/meroshare/current-issues-post', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Auth token is required.' });
  }
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    const response = await client.get(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/current-issues-post] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch current issues.', status });
  }
});

/* ENDPOINT 9.1 — Get MeroShare Application Report */
app.post('/api/meroshare/application-report', async (req, res) => {
  const { clientId, username, password, token } = req.body;
  
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    let sessionToken = token;
    if (!sessionToken) {
      if (!clientId || !username || !password) {
        return res.status(400).json({ success: false, message: 'Missing auth credentials or token.' });
      }
      const loginResponse = await client.post(`${MEROSHARE_BASE}/auth/`, {
        clientId: Number(clientId),
        username,
        password
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (isWafBlocked(loginResponse)) {
        return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked the login request. Please try again.' });
      }

      const authHeaderKey = Object.keys(loginResponse.headers).find(k => k.toLowerCase() === 'authorization');
      sessionToken = loginResponse.data?.token || loginResponse.data?.Authorization || loginResponse.data?.accessToken || (authHeaderKey ? loginResponse.headers[authHeaderKey] : null);
      if (sessionToken && typeof sessionToken === 'string' && !sessionToken.startsWith('Bearer ')) {
        sessionToken = `Bearer ${sessionToken}`;
      }
    }

    if (!sessionToken) {
      return res.status(401).json({ success: false, message: 'MeroShare authentication failed. Please verify credentials.' });
    }

    const reportResponse = await client.get(`${MEROSHARE_BASE}/applicantForm/activeReport`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sessionToken,
      },
    });

    if (isWafBlocked(reportResponse)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the report query.' });
    }

    res.json({ success: true, data: reportResponse.data });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/application-report] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch application report.', status });
  }
});

/* ENDPOINT 9.2 — Get user-specific applicable issues from CDSC */
app.get('/api/meroshare/applicable-issues', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Auth token is required.' });
  }
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    const response = await client.get(`${MEROSHARE_BASE}/applicableIssue/applicable/`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request.' });
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.message || error.response?.data || error.message;
    console.error('[meroshare/applicable-issues] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch applicable issues.', status });
  }
});

/* ENDPOINT 9.5 — Submit IPO Application */
app.post('/api/meroshare/apply', async (req, res) => {
  const { clientId, username, password, companyShareId, appliedKitta, crnNumber, transactionPin, boid } = req.body;
  if (!clientId || !username || !password || !companyShareId || !appliedKitta || !crnNumber || !transactionPin) {
    return res.status(400).json({ success: false, message: 'Missing required application parameters.' });
  }
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    // 1. Authenticate to get session token
    const loginResponse = await client.post(`${MEROSHARE_BASE}/auth/`, {
      clientId: Number(clientId),
      username,
      password
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (isWafBlocked(loginResponse)) {
      return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked the login request during application. Please try again.' });
    }

    const authHeaderKey = Object.keys(loginResponse.headers).find(k => k.toLowerCase() === 'authorization');
    let token = loginResponse.data?.token || loginResponse.data?.Authorization || loginResponse.data?.accessToken || (authHeaderKey ? loginResponse.headers[authHeaderKey] : null);

    if (token && typeof token === 'string' && !token.startsWith('Bearer ')) {
      token = `Bearer ${token}`;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'MeroShare authentication failed during application submission. Please verify your password.' });
    }

    // 2. Fetch the applicant applicable detail template to retrieve bank details & customerId
    const detailResponse = await client.get(`${MEROSHARE_BASE}/applicableIssue/applicable/detail/${companyShareId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(detailResponse)) {
      return res.status(503).json({ success: false, message: 'MeroShare security firewall blocked fetching IPO application details. Please try again.' });
    }

    const appTemplate = detailResponse.data;
    if (!appTemplate) {
      return res.status(404).json({ success: false, message: 'Could not fetch IPO application details template. The issue might not be open for this account.' });
    }

    // 3. Construct the submission form payload
    const submissionPayload = {
      ...appTemplate,
      appliedKitta: Number(appliedKitta),
      crnNumber: crnNumber.trim(),
      transactionPin: String(transactionPin).trim(),
      boid: boid || appTemplate.boid || appTemplate.demat,
      demat: boid || appTemplate.boid || appTemplate.demat,
    };

    // 4. Submit the IPO Application
    const submitResponse = await client.post(`${MEROSHARE_BASE}/applicantForm/`, submissionPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(submitResponse)) {
      return res.status(503).json({ success: false, message: 'MeroShare firewall blocked the submission request.' });
    }

    // Return direct success/failure from CDSC
    res.json({ success: true, data: submitResponse.data });

  } catch (error) {
    const status = error.response?.status;
    let msg = error.response?.data?.message || error.response?.data || error.message;
    if (isWafBlocked(error.response)) {
      msg = 'MeroShare security firewall blocked the application submission request. Please try again in a few minutes.';
    }
    console.error('[meroshare/apply] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to submit IPO application.', status });
  }
});

/* ENDPOINT 10 — Get IPO Result Companies */
app.get('/api/ipo-result/companies', async (req, res) => {
  try {
    const response = await axios.get('https://iporesult.cdsc.com.np/api/ipo-result/companyShares/fileUploaded', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://iporesult.cdsc.com.np',
        'Referer': 'https://iporesult.cdsc.com.np/',
      }
    });
    const rawData = Array.isArray(response.data?.body) ? response.data.body : (Array.isArray(response.data) ? response.data : []);
    const normalized = rawData.map(item => ({
      id: item.companyShareId ?? item.id,
      name: item.companyName || item.name || 'Unknown',
      scrip: item.scrip || String((item.companyShareId ?? item.id) || ''),
      type: item.shareTypeName || 'IPO',
      closeDate: item.issueCloseDate || '',
    }));
    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('[ipo-result/companies] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch IPO companies' });
  }
});

/* ENDPOINT 11 — Check IPO Result (single BOID) */
app.post('/api/ipo-result/check', async (req, res) => {
  const { companyShareId, boid } = req.body;

  const IPO_RESULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://iporesult.cdsc.com.np',
    'Referer': 'https://iporesult.cdsc.com.np/',
  };

  const attemptCheck = async () => {
    const response = await axios.post(
      'https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check',
      { companyShareId: Number(companyShareId), boid },
      { headers: IPO_RESULT_HEADERS, timeout: 15000 }
    );
    return response;
  };

  try {
    let response;
    try {
      response = await attemptCheck();
    } catch (firstErr) {
      if (firstErr.response && firstErr.response.data) {
        return res.json({ success: true, data: firstErr.response.data });
      }
      await new Promise(r => setTimeout(r, 3000));
      try {
        response = await attemptCheck();
      } catch (retryErr) {
        if (retryErr.response && retryErr.response.data) {
          return res.json({ success: true, data: retryErr.response.data });
        }
        throw retryErr;
      }
    }
    res.json({ success: true, data: response.data });
  } catch (error) {
    if (error.response && error.response.data) {
      return res.json({ success: true, data: error.response.data });
    }
    console.error('[ipo-result/check] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to check IPO result. CDSC servers may be busy.' });
  }
});

/* ENDPOINT 11b — Bulk Check IPO Allotment for multiple BOIDs */
app.post('/api/ipo-result/bulk-check', async (req, res) => {
  const { companyShareId, profiles } = req.body;

  if (!companyShareId || !Array.isArray(profiles) || profiles.length === 0) {
    return res.status(400).json({ success: false, message: 'companyShareId and profiles[] are required.' });
  }

  // Limit to 20 profiles per batch to prevent server timeout
  if (profiles.length > 20) {
    return res.status(400).json({ success: false, message: 'Maximum 20 accounts per bulk check. Please split into smaller batches.' });
  }

  const IPO_RESULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://iporesult.cdsc.com.np',
    'Referer': 'https://iporesult.cdsc.com.np/',
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const checkSingleBoid = async (boid) => {
    const attempt = async () => {
      const response = await axios.post(
        'https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check',
        { companyShareId: Number(companyShareId), boid },
        { headers: IPO_RESULT_HEADERS, timeout: 15000 }
      );
      return response.data;
    };

    try {
      return await attempt();
    } catch (firstErr) {
      if (firstErr.response && firstErr.response.data) return firstErr.response.data;
      console.warn(`[bulk-check] BOID ${boid} first attempt failed. Retrying after 3s...`);
      await sleep(3000);
      try {
        return await attempt();
      } catch (retryErr) {
        if (retryErr.response && retryErr.response.data) return retryErr.response.data;
        throw new Error(retryErr.message || 'CDSC server unavailable after retry');
      }
    }
  };

  const results = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    if (i > 0) await sleep(2000);

    try {
      const data = await checkSingleBoid(profile.boid);
      const msgStr = (data?.message || '').toLowerCase();
      const isCdscResponse = msgStr.includes('allotted') || msgStr.includes('sorry') ||
        msgStr.includes('congratulations') || data?.success === true;

      let status, message, units;
      if (isCdscResponse) {
        const isAllotted = data?.success === true || (msgStr.includes('allotted') && !msgStr.includes('not'));
        if (isAllotted) {
          const match = data.message ? data.message.match(/\d+/) : null;
          units = match ? parseInt(match[0]) : 10;
          status = 'allotted';
          message = data.message || `Congratulations! Allotted ${units} Units.`;
        } else {
          status = 'not_allotted';
          units = 0;
          message = data.message || 'Sorry, not allotted.';
        }
      } else {
        status = 'failed';
        units = 0;
        message = data?.message || 'Invalid response from CDSC.';
      }

      results.push({ id: profile.id, boid: profile.boid, status, message, units });
    } catch (err) {
      console.error(`[bulk-check] Failed for BOID ${profile.boid}:`, err.message);
      results.push({
        id: profile.id,
        boid: profile.boid,
        status: 'failed',
        message: err.message || 'Connection to CDSC failed. Please retry.',
        units: 0
      });
    }
  }

  res.json({ success: true, results });
});


/* ═══════════════════════════════════════════════════
   ENDPOINT 12 — Stock Fundamental Detail (NEPSE Official + Merolagani/ShareSansar)
   Available caching: 2 hours
   ═══════════════════════════════════════════════════ */
app.get('/api/stock-detail/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `stock-detail-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const detail = {
    symbol,
    sector: '',
    sharesOutstanding: 0,
    marketPrice: 0,
    openPrice: 0,
    highPrice: 0,
    lowPrice: 0,
    closePrice: 0,
    prevClose: 0,
    high52w: 0,
    low52w: 0,
    eps: 0,
    pe: 0,
    bookValue: 0,
    pbv: 0,
    dividend: 0,
    bonus: 0,
    marketCap: 0,
    companyName: '',
    listedShares: 0,
    paidUpCapital: 0,
    source: 'nepse-official'
  };

  // ── Step 1: Official NEPSE Security details lookup ──
  try {
    const nepseRes = await axios.get(`https://nepalstock.com.np/api/nots/security?symbol=${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://nepalstock.com.np',
        'Referer': 'https://nepalstock.com.np/',
      },
      timeout: 8000
    });
    const dataArr = Array.isArray(nepseRes.data) ? nepseRes.data : (Array.isArray(nepseRes.data?.body) ? nepseRes.data.body : []);
    const company = dataArr.find(c => (c.symbol || '').toUpperCase() === symbol) || dataArr[0];
    if (company) {
      detail.companyName = company.companyName || company.securityName || symbol;
      detail.sector = company.sectorDescription || company.instrumentType?.description || '';
      if (company.openPrice) detail.openPrice = parseFloat(company.openPrice);
      if (company.highPrice) detail.highPrice = parseFloat(company.highPrice);
      if (company.lowPrice) detail.lowPrice = parseFloat(company.lowPrice);
      if (company.closePrice || company.lastTradedPrice) detail.marketPrice = parseFloat(company.closePrice || company.lastTradedPrice);
      if (company.previousClose) detail.prevClose = parseFloat(company.previousClose);
      if (company.fiftyTwoWeekHigh) detail.high52w = parseFloat(company.fiftyTwoWeekHigh);
      if (company.fiftyTwoWeekLow) detail.low52w = parseFloat(company.fiftyTwoWeekLow);
      if (company.totalTradeQuantity) detail.sharesOutstanding = parseFloat(company.totalTradeQuantity);
    }
  } catch (_) {}

  // ── Step 2: Merolagani / ShareSansar Fundamental Ratios ──
  try {
    const response = await axios.get(`https://merolagani.com/CompanyDetail.aspx?symbol=${symbol}`, {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();

    const rows = $('table.table-zeromargin tr, .company-info tr, .fundamental-info tr, table tr');
    rows.each((_, tr) => {
      const cells = $(tr).find('td');
      let label = '', value = '';
      if (cells.length >= 2) {
        label = normalizeText($(cells[0]).text()).toLowerCase();
        value = normalizeText($(cells[1]).text());
      } else {
        const full = normalizeText($(tr).text());
        const colonIdx = full.indexOf(':');
        if (colonIdx !== -1) {
          label = full.substring(0, colonIdx).toLowerCase().trim();
          value = full.substring(colonIdx + 1).trim();
        }
      }

      if (!label) return;

      if (!detail.sector && label.includes('sector')) detail.sector = value;
      if (label.includes('shares outstanding') || label.includes('outstanding shares')) detail.sharesOutstanding = parseMoney(value) || detail.sharesOutstanding;
      if (!detail.marketPrice && (label.includes('market price') || label === 'ltp' || label.includes('last traded'))) detail.marketPrice = parseMoney(value);
      if (!detail.high52w && label.includes('52') && label.includes('high')) {
        const parts = value.split(/[-/]/);
        detail.high52w = parseMoney(parts[0]);
        if (parts.length > 1) detail.low52w = parseMoney(parts[1]);
      }
      if (label.includes('eps') || label.includes('earning per share')) detail.eps = parseMoney(value) || detail.eps;
      if (label.includes('p/e') || label.includes('pe ratio') || label.includes('price.*earning')) detail.pe = parseMoney(value) || detail.pe;
      if (label.includes('book value')) detail.bookValue = parseMoney(value) || detail.bookValue;
      if (label === 'pbv' || label.includes('p/b') || label.includes('price.*book')) detail.pbv = parseMoney(value) || detail.pbv;
      if (label.includes('% dividend') || (label.includes('dividend') && label.includes('%'))) detail.dividend = parseMoney(value.replace('%', '')) || detail.dividend;
      if (label.includes('% bonus') || (label.includes('bonus') && label.includes('%'))) detail.bonus = parseMoney(value.replace('%', '')) || detail.bonus;
      if (label.includes('market cap')) detail.marketCap = parseMoney(value) || detail.marketCap;
      if (!detail.companyName && (label.includes('company name') || label.includes('name of company'))) detail.companyName = value;
      if (label.includes('listed shares') || label.includes('total shares')) detail.listedShares = parseMoney(value) || detail.listedShares;
      if (label.includes('paid') && label.includes('capital')) detail.paidUpCapital = parseMoney(value) || detail.paidUpCapital;
    });

    if (detail.eps === 0 || detail.bookValue === 0) {
      try {
        const ssRes = await axios.get(`https://www.sharesansar.com/company/${symbol.toLowerCase()}`, {
          headers: HEADERS,
          timeout: 8000
        });
        const $ss = cheerio.load(ssRes.data);
        $ss('.company-detail-table tr, .fundamentals tr').each((_, tr) => {
          const tds = $ss(tr).find('td');
          if (tds.length >= 2) {
            const label = $ss(tds[0]).text().replace(/\s+/g, ' ').trim().toLowerCase();
            const val   = $ss(tds[1]).text().replace(/\s+/g, ' ').trim();
            if (detail.eps === 0 && (label.includes('eps') || label.includes('earning per share'))) detail.eps = parseMoney(val);
            if (detail.bookValue === 0 && label.includes('book value')) detail.bookValue = parseMoney(val);
            if (detail.pe === 0 && label.includes('p/e')) detail.pe = parseMoney(val);
          }
        });
      } catch (_) {}
    }

    if (detail.pe === 0 && detail.eps > 0 && detail.marketPrice > 0) {
      detail.pe = Number((detail.marketPrice / detail.eps).toFixed(2));
    }
    if (detail.pbv === 0 && detail.bookValue > 0 && detail.marketPrice > 0) {
      detail.pbv = Number((detail.marketPrice / detail.bookValue).toFixed(2));
    }

    setCache(cacheKey, detail, 2 * 60 * 60 * 1000); // 2 hours TTL
    res.json({ success: true, data: detail });
  } catch (error) {
    if (detail.marketPrice > 0 || detail.high52w > 0) {
      setCache(cacheKey, detail, 2 * 60 * 60 * 1000);
      return res.json({ success: true, data: detail });
    }
    console.error(`[stock-detail] Error for ${symbol}:`, error.message);
    res.status(500).json({ success: false, message: `Failed to fetch stock detail for ${symbol}.`, error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 13 — Stock Historical Prices (ShareSansar CSRF/AJAX Scraper)
   Available caching: 1 hour
   ═══════════════════════════════════════════════════ */
app.get('/api/price-history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const length = Math.min(parseInt(req.query.length || '365', 10), 500);
  const cacheKey = `price-history-${symbol}-${length}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    const pageRes = await client.get(`https://www.sharesansar.com/company/${symbol.toLowerCase()}`, {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(pageRes.data);
    
    // Parse CSRF token
    const token = $('meta[name="_token"]').attr('content') || $('input[name="_token"]').val();
    const companyId = $('#companyid').text().trim();
    
    if (!token || !companyId) {
      throw new Error(`Could not parse CSRF token or companyId for ${symbol}`);
    }

    const postData = new URLSearchParams();
    postData.append('company', companyId);
    postData.append('draw', '1');
    postData.append('start', '0');
    postData.append('length', String(length));

    const historyRes = await client.post('https://www.sharesansar.com/company-price-history', postData.toString(), {
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.sharesansar.com/company/${symbol.toLowerCase()}`
      },
      timeout: 15000
    });

    if (historyRes.data && Array.isArray(historyRes.data.data)) {
      const formatted = historyRes.data.data.map(item => ({
        date: item.published_date,
        open: parseFloat(item.open) || 0,
        high: parseFloat(item.high) || 0,
        low: parseFloat(item.low) || 0,
        close: parseFloat(item.close) || 0,
        volume: parseFloat(item.traded_quantity) || 0
      })).filter(d => d.close > 0);
      
      formatted.reverse(); // chronological order
      const ttl = length <= 30 ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000; // 30min for short, 2h for long
      setCache(cacheKey, formatted, ttl);
      return res.json({ success: true, data: formatted, count: formatted.length });
    } else {
      throw new Error('Invalid response structure from price history endpoint.');
    }

  } catch (error) {
    console.error(`[price-history] Error for ${symbol}:`, error.message);
    res.status(500).json({ success: false, message: `Failed to fetch price history for ${symbol}.`, error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 14 — NEPSE Company ID Lookup
   Source: https://nepalstock.com.np/api/nots/security?symbol=NABIL
   Used to resolve internal numeric ID needed for floorsheet API
   ═══════════════════════════════════════════════════ */
app.get('/api/nepse/company-id/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `nepse-company-id-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const NEPSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://nepalstock.com.np',
    'Referer': 'https://nepalstock.com.np/',
  };

  try {
    const response = await axios.get(`https://nepalstock.com.np/api/nots/security?symbol=${symbol}`, {
      headers: NEPSE_HEADERS,
      timeout: 10000
    });

    const dataArr = Array.isArray(response.data) ? response.data : (Array.isArray(response.data?.body) ? response.data.body : []);
    const company = dataArr.find(c => (c.symbol || '').toUpperCase() === symbol) || dataArr[0];

    if (!company || !company.id) {
      return res.status(404).json({ success: false, message: `Company ID not found for symbol ${symbol}` });
    }

    const result = {
      id: company.id,
      symbol: company.symbol || symbol,
      companyName: company.companyName || company.securityName || symbol,
      sectorDescription: company.sectorDescription || 'Unknown',
      instrumentType: company.instrumentType || 'Equity'
    };

    setCache(cacheKey, result, 24 * 60 * 60 * 1000); // 24 hour TTL
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`[nepse/company-id] Error for ${symbol}:`, error.message);
    res.status(500).json({ success: false, message: `Failed to resolve company ID for ${symbol}`, error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 15 — Real Floorsheet Data from NEPSE
   Source: https://nepalstock.com.np/api/nots/nepse-data/floorsheet
   Returns actual buyer/seller broker trade rows for a stock
   ═══════════════════════════════════════════════════ */
app.get('/api/floorsheet/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const page = parseInt(req.query.page || '1', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 100);
  const businessDate = req.query.date || '';
  const cacheKey = `floorsheet-${symbol}-${businessDate}-p${page}-s${size}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const NEPSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://nepalstock.com.np',
    'Referer': 'https://nepalstock.com.np/',
  };

  try {
    // Step 1: Get company ID (from cache or live lookup)
    let companyId = null;
    const idCacheKey = `nepse-company-id-${symbol}`;
    const cachedId = getCache(idCacheKey);
    if (cachedId?.id) {
      companyId = cachedId.id;
    } else {
      try {
        const idRes = await axios.get(`https://nepalstock.com.np/api/nots/security?symbol=${symbol}`, {
          headers: NEPSE_HEADERS,
          timeout: 8000
        });
        const dataArr = Array.isArray(idRes.data) ? idRes.data : (Array.isArray(idRes.data?.body) ? idRes.data.body : []);
        const company = dataArr.find(c => (c.symbol || '').toUpperCase() === symbol) || dataArr[0];
        if (company?.id) {
          companyId = company.id;
          setCache(idCacheKey, { id: companyId, symbol: company.symbol || symbol, companyName: company.companyName || symbol }, 24 * 60 * 60 * 1000);
        }
      } catch (idErr) {
        console.warn(`[floorsheet] Could not resolve company ID for ${symbol}:`, idErr.message);
      }
    }

    if (!companyId) {
      return res.status(404).json({ success: false, message: `Could not resolve NEPSE company ID for ${symbol}. Try providing the symbol exactly as listed.` });
    }

    // Step 2: Fetch floorsheet from NEPSE
    let url = `https://nepalstock.com.np/api/nots/nepse-data/floorsheet?id=${companyId}&page=${page - 1}&size=${size}&sort=contractId,desc`;
    if (businessDate) url += `&businessDate=${businessDate}`;

    const floorRes = await axios.get(url, {
      headers: NEPSE_HEADERS,
      timeout: 12000
    });

    const raw = floorRes.data?.floorsheets?.content || floorRes.data?.content || floorRes.data?.body || [];
    const totalPages = floorRes.data?.floorsheets?.totalPages || floorRes.data?.totalPages || 1;
    const totalElements = floorRes.data?.floorsheets?.totalElements || floorRes.data?.totalElements || raw.length;

    const rows = raw.map(item => ({
      contractId: item.contractId || item.id,
      buyerBroker: item.buyerMemberId || item.buyerBrokerId,
      sellerBroker: item.sellerMemberId || item.sellerBrokerId,
      qty: item.contractQuantity || item.quantity || 0,
      rate: parseFloat(item.contractRate || item.rate || 0),
      amount: parseFloat(item.contractAmount || item.amount || 0),
      businessDate: item.businessDate || businessDate,
      stockSymbol: item.stockSymbol || symbol,
      stockName: item.stockName || symbol
    }));

    const result = {
      rows,
      page,
      size,
      totalPages,
      totalElements,
      symbol,
      companyId,
      businessDate: businessDate || (rows[0]?.businessDate || '')
    };

    const isToday = !businessDate || businessDate === new Date().toISOString().split('T')[0];
    setCache(cacheKey, result, isToday ? 5 * 60 * 1000 : 2 * 60 * 60 * 1000);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`[floorsheet] Error for ${symbol}:`, error.message);
    res.status(500).json({ success: false, message: `Failed to fetch floorsheet for ${symbol}.`, error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 15b — Broker Analysis: Aggregate Floorsheet → A/D Signals
   Computes per-broker buy/sell totals and Accumulation/Distribution signal
   Query: /api/broker-analysis/:symbol?days=30
   ═══════════════════════════════════════════════════ */
app.get('/api/broker-analysis/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = Math.min(parseInt(req.query.days || '30', 10), 90);
  const cacheKey = `broker-analysis-${symbol}-${days}`;
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const NEPSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://nepalstock.com.np',
    'Referer': 'https://nepalstock.com.np/',
  };

  try {
    // Step 1: Get company ID
    let companyId = null;
    const idCacheKey = `nepse-company-id-${symbol}`;
    const cachedId = getCache(idCacheKey);
    if (cachedId?.id) {
      companyId = cachedId.id;
    } else {
      const idRes = await axios.get(`https://nepalstock.com.np/api/nots/security?symbol=${symbol}`, {
        headers: NEPSE_HEADERS, timeout: 8000
      });
      const dataArr = Array.isArray(idRes.data) ? idRes.data : (Array.isArray(idRes.data?.body) ? idRes.data.body : []);
      const company = dataArr.find(c => (c.symbol || '').toUpperCase() === symbol) || dataArr[0];
      if (company?.id) {
        companyId = company.id;
        setCache(idCacheKey, { id: companyId, symbol: company.symbol || symbol, companyName: company.companyName || symbol }, 24 * 60 * 60 * 1000);
      }
    }

    if (!companyId) {
      return res.status(404).json({ success: false, message: `Could not resolve NEPSE company ID for ${symbol}.` });
    }

    // Step 2: Fetch last N days of floorsheet in one large request
    const pageSize = Math.min(days * 20, 500);
    const url = `https://nepalstock.com.np/api/nots/nepse-data/floorsheet?id=${companyId}&page=0&size=${pageSize}&sort=contractId,desc`;
    const floorRes = await axios.get(url, { headers: NEPSE_HEADERS, timeout: 15000 });

    const raw = floorRes.data?.floorsheets?.content || floorRes.data?.content || floorRes.data?.body || [];

    // Step 3: Filter to requested number of trading days
    const dateSet = new Set();
    raw.forEach(r => { if (r.businessDate) dateSet.add(r.businessDate); });
    const sortedDates = Array.from(dateSet).sort().reverse().slice(0, days);
    const dateFilter = new Set(sortedDates);
    const filtered = raw.filter(r => !r.businessDate || dateFilter.has(r.businessDate));

    // Step 4: Aggregate per broker
    const brokerMap = {};
    let totalBuyVol = 0, totalSellVol = 0, totalAmount = 0;

    filtered.forEach(item => {
      const buyBroker = String(item.buyerMemberId || item.buyerBrokerId || '?');
      const sellBroker = String(item.sellerMemberId || item.sellerBrokerId || '?');
      const qty = Number(item.contractQuantity || item.quantity || 0);
      const amount = Number(item.contractAmount || item.amount || 0);

      if (!brokerMap[buyBroker]) brokerMap[buyBroker] = { broker: buyBroker, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
      if (!brokerMap[sellBroker]) brokerMap[sellBroker] = { broker: sellBroker, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };

      brokerMap[buyBroker].buyQty += qty;
      brokerMap[buyBroker].buyAmt += amount;
      brokerMap[sellBroker].sellQty += qty;
      brokerMap[sellBroker].sellAmt += amount;
      totalBuyVol += qty;
      totalSellVol += qty;
      totalAmount += amount;
    });

    // Step 5: Sort brokers by total activity and compute net position
    const brokers = Object.values(brokerMap).map(b => ({
      ...b,
      netQty: b.buyQty - b.sellQty,
      netAmt: b.buyAmt - b.sellAmt,
      totalQty: b.buyQty + b.sellQty
    })).sort((a, b) => b.totalQty - a.totalQty);

    const topBuyers = [...brokers].sort((a, b) => b.buyQty - a.buyQty).slice(0, 5);
    const topSellers = [...brokers].sort((a, b) => b.sellQty - a.sellQty).slice(0, 5);
    const topNetBuyers = [...brokers].filter(b => b.netQty > 0).sort((a, b) => b.netQty - a.netQty).slice(0, 5);
    const topNetSellers = [...brokers].filter(b => b.netQty < 0).sort((a, b) => a.netQty - b.netQty).slice(0, 5);

    // Step 6: Compute A/D signal from broker imbalance
    const netBuyerQty = topNetBuyers.reduce((s, b) => s + b.netQty, 0);
    const netSellerQty = Math.abs(topNetSellers.reduce((s, b) => s + b.netQty, 0));
    const adRatio = totalBuyVol > 0 ? (netBuyerQty - netSellerQty) / totalBuyVol : 0;
    const adSignal = adRatio > 0.05 ? 'Accumulation' : adRatio < -0.05 ? 'Distribution' : 'Neutral';
    const adStrength = Math.min(Math.abs(adRatio) * 100, 100).toFixed(1);

    // Step 7: Daily flow for chart
    const dailyFlow = sortedDates.slice().reverse().map(date => {
      const dayRows = filtered.filter(r => r.businessDate === date);
      let buyVol = 0, sellVol = 0;
      const dayBrokerMap = {};
      dayRows.forEach(r => {
        const buyB = String(r.buyerMemberId || r.buyerBrokerId || '?');
        const sellB = String(r.sellerMemberId || r.sellerBrokerId || '?');
        const q = Number(r.contractQuantity || r.quantity || 0);
        if (!dayBrokerMap[buyB]) dayBrokerMap[buyB] = { buy: 0, sell: 0 };
        if (!dayBrokerMap[sellB]) dayBrokerMap[sellB] = { buy: 0, sell: 0 };
        dayBrokerMap[buyB].buy += q;
        dayBrokerMap[sellB].sell += q;
        buyVol += q;
        sellVol += q;
      });
      // Institutional net: brokers with concentrated buying vs distributed selling
      const dayBrokers = Object.values(dayBrokerMap);
      const instBuy = dayBrokers.filter(b => b.buy > b.sell).reduce((s, b) => s + b.buy, 0);
      const instSell = dayBrokers.filter(b => b.sell > b.buy).reduce((s, b) => s + b.sell, 0);
      return {
        date,
        buyVol,
        sellVol,
        netFlow: instBuy - instSell,
        totalTrades: dayRows.length
      };
    });

    const result = {
      symbol,
      companyId,
      period: `${days} days`,
      tradingDays: sortedDates.length,
      totalTrades: filtered.length,
      totalVolume: totalBuyVol,
      totalAmount,
      adSignal,
      adStrength: `${adStrength}%`,
      adRatio: Number(adRatio.toFixed(4)),
      brokers: brokers.slice(0, 30),
      topBuyers,
      topSellers,
      topNetBuyers,
      topNetSellers,
      dailyFlow
    };

    setCache(cacheKey, result, 30 * 60 * 1000); // 30 min TTL
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`[broker-analysis] Error for ${symbol}:`, error.message);
    res.status(500).json({ success: false, message: `Failed to fetch broker analysis for ${symbol}.`, error: error.message });
  }
});

/* ENDPOINT 16 — Merolagani News & Political Sentiment Portal */
app.get('/api/news/merolagani', async (req, res) => {
  const cacheKey = 'merolagani-news-list';
  const cached = getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  try {
    const newsRes = await axios.get('https://merolagani.com/NewsList.aspx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(newsRes.data);
    const articles = [];

    $('a[href*="NewsDetail.aspx?newsID="]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      const parent = $(el).closest('.media-news, tr, div, li');
      const dateText = parent.find('.date, .text-muted, span').text().trim() || '';

      if (title && title.length > 8 && !articles.some(a => a.title === title)) {
        articles.push({
          id: href.match(/newsID=(\d+)/)?.[1] || String(i),
          title,
          url: `https://merolagani.com/${href.startsWith('/') ? href.slice(1) : href}`,
          date: dateText
        });
      }
    });

    const topArticles = articles.slice(0, 15);
    setCache(cacheKey, topArticles, 10 * 60 * 1000); // 10 minutes cache
    return res.json({ success: true, data: topArticles });
  } catch (error) {
    console.error('[news/merolagani] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch Merolagani news', error: error.message });
  }
});

// Vercel Serverless Function - app.listen is removed

export default app;
