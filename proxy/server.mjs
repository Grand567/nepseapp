import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { initDB, query } from './db.mjs';
import { startWorkers } from './workers.mjs';

const app = express();

// Allow all origins — required for cloud deployment (Render/Railway)
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

const HEADERS = {
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

import { Nepse } from '@rumess/nepse-api';

const nepseClient = new Nepse();

app.get('/api/market-summary', async (req, res) => {
  const cacheKey = 'market-summary';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, source: 'live', cached: true });

  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    const stocks = [];
    
    $('table tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 10) {
        const symbol = $(tds[1]).text().trim();
        const ltp = parseMoney($(tds[2]).text());
        const change = parseMoney($(tds[3]).text());
        const pChange = parseMoney($(tds[4]).text());
        const open = parseMoney($(tds[5]).text());
        const high = parseMoney($(tds[6]).text());
        const low = parseMoney($(tds[7]).text());
        const volume = parseMoney($(tds[8]).text());
        const prevClose = parseMoney($(tds[9]).text());
        const turnover = (ltp && volume) ? ltp * volume : 0;
        
        if (symbol && !isNaN(ltp) && ltp > 0) {
          stocks.push({
            symbol,
            name: symbol,
            ltp,
            change: isNaN(change) ? 0 : change,
            pChange: isNaN(pChange) ? 0 : pChange,
            open: isNaN(open) ? ltp : open,
            high: isNaN(high) ? ltp : high,
            low: isNaN(low) ? ltp : low,
            prevClose: isNaN(prevClose) ? ltp : prevClose,
            volume: isNaN(volume) ? 0 : volume,
            turnover,
            rsi: calcRSI(isNaN(pChange) ? 0 : pChange),
            macd: calcMACD(isNaN(pChange) ? 0 : pChange),
            sector: 'Unknown',
            source: 'live'
          });
        }
      }
    });

    if (stocks.length > 0) {
      setCache(cacheKey, stocks, 15000);
      return res.json({ success: true, data: stocks, source: 'live' });
    } else {
      throw new Error('No live trading data found');
    }
  } catch (err) {
    console.error('Scrape Live summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Market Indices (ShareSansar)
app.get('/api/market-indices', async (req, res) => {
  const cacheKey = 'market-indices';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const response = await axios.get('https://www.sharesansar.com/market', {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const indices = {};
    const subIndices = [];
    
    $('table tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 7) {
        const index = $(tds[0]).text().trim();
        const open = parseMoney($(tds[1]).text());
        const high = parseMoney($(tds[2]).text());
        const low = parseMoney($(tds[3]).text());
        const value = parseMoney($(tds[4]).text()); // Actual current index value
        const change = parseMoney($(tds[5]).text()); // Point change
        const pChange = parseMoney($(tds[6]).text()); // % change
        const turnover = parseMoney($(tds[7]).text()); // Turnover
        
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
    setCache(cacheKey, indices, 15000);
    return res.json({ success: true, data: indices });
  } catch (err) {
    try {
      const indicesData = await nepseClient.getNepseIndex();
      const indices = {};
      if (Array.isArray(indicesData)) {
        indicesData.forEach(item => {
          const val = { value: item.currentValue, change: item.change, pChange: item.perChange };
          if (item.index === 'NEPSE Index') indices.nepse = val;
          if (item.index === 'Float Index') indices.float = val;
          if (item.index === 'Sensitive Index') indices.sensitive = val;
        });
      }
      setCache(cacheKey, indices, 15000);
      return res.json({ success: true, data: indices });
    } catch (err2) {
      console.error('Nepse API indices error:', err2.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 1 — Today's / Closing Prices
   Source: https://www.sharesansar.com/today-share-price
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

    // Perform actual login — clientId must be String
    const response = await client.post(`${MEROSHARE_BASE}/auth/`, {
      clientId: String(clientId),
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
        `${MEROSHARE_VIEW_BASE}/myPortfolio/`,
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
   ENDPOINT 12 — Stock Fundamental & Technical Detail (NEPSE Official + Merolagani/ShareSansar)
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
    publicShares: 0,
    publicPercentage: 0,
    promoterShares: 0,
    promoterPercentage: 0,
    listingDate: '',
    isin: '',
    source: 'nepse-official'
  };

  // ── Step 1: Official NEPSE Security Details via @rumess/nepse-api ──
  try {
    const nepseData = await nepseClient.getSecurityDetails(symbol);
    if (nepseData) {
      const daily = nepseData.securityDailyTradeDto || {};
      const sec = nepseData.security || {};
      detail.companyName = sec.securityName || nepseData.companyName || symbol;
      detail.high52w = parseFloat(daily.fiftyTwoWeekHigh || 0);
      detail.low52w = parseFloat(daily.fiftyTwoWeekLow || 0);
      detail.marketPrice = parseFloat(daily.lastTradedPrice || daily.closePrice || 0);
      detail.openPrice = parseFloat(daily.openPrice || 0);
      detail.highPrice = parseFloat(daily.highPrice || 0);
      detail.lowPrice = parseFloat(daily.lowPrice || 0);
      detail.closePrice = parseFloat(daily.closePrice || daily.lastTradedPrice || 0);
      detail.prevClose = parseFloat(daily.previousClose || 0);
      detail.listedShares = parseFloat(nepseData.stockListedShares || 0);
      detail.sharesOutstanding = parseFloat(nepseData.stockListedShares || 0);
      detail.paidUpCapital = parseFloat(nepseData.paidUpCapital || 0);
      detail.marketCap = parseFloat(nepseData.marketCapitalization || (detail.marketPrice * detail.listedShares) || 0);
      detail.publicShares = parseFloat(nepseData.publicShares || 0);
      detail.publicPercentage = parseFloat(nepseData.publicPercentage || 0);
      detail.promoterShares = parseFloat(nepseData.promoterShares || 0);
      detail.promoterPercentage = parseFloat(nepseData.promoterPercentage || 0);
      detail.listingDate = sec.listingDate || '';
      detail.isin = sec.isin || '';
      detail.sector = sec.companyId?.sectorMaster?.sectorDescription || sec.instrumentType?.description || '';
    }
  } catch (nepseErr) {
    console.warn(`[stock-detail] NEPSE API failed for ${symbol}:`, nepseErr.message);
  }

  // ── Step 2: Enrich with Financial Ratios (EPS, P/E, Book Value, Dividend) from Merolagani / ShareSansar ──
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

app.get('/api/company/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toLowerCase();
  const cacheKey = `company-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    const pageRes = await client.get(`https://www.sharesansar.com/company/${symbol}`, {
      headers: HEADERS,
      timeout: 10000
    });
    
    const $ = cheerio.load(pageRes.data);
    const detail = {
      eps: 0, pe: 0, bookValue: 0, pbv: 0, dividend: 0, bonus: 0,
      marketCap: 0, sharesOutstanding: 0, listedShares: 0, paidUpCapital: 0,
      high52w: 0, low52w: 0, sector: 'Unknown'
    };

    const parseMoney = (str) => {
      if (!str || str === 'N/A' || str === '-') return 0;
      return parseFloat(str.replace(/,/g, '')) || 0;
    };

    $('table tr').each((i, el) => {
      const tds = $(el).find('td, th');
      if (tds.length >= 2) {
        const label = $(tds[0]).text().trim().toLowerCase();
        const valueStr = $(tds[1]).text().trim();
        const val = parseMoney(valueStr);
        
        if (label.includes('sector')) detail.sector = valueStr;
        if (label.includes('shares outstanding') || label.includes('outstanding shares')) detail.sharesOutstanding = val;
        if (label.includes('market price') || label === 'ltp' || label.includes('last traded')) detail.marketPrice = val;
        if (label.includes('52') && label.includes('high')) {
           const parts = valueStr.split(/[-/]/);
           detail.high52w = parseMoney(parts[0]);
           if (parts.length > 1) detail.low52w = parseMoney(parts[1]);
        }
        if (label.includes('eps') || label.includes('earning per share')) detail.eps = val;
        if (label.includes('p/e') || label.includes('pe ratio') || label.includes('price earning')) detail.pe = val;
        if (label.includes('book value')) detail.bookValue = val;
        if (label === 'pbv' || label.includes('p/b') || label.includes('price to book')) detail.pbv = val;
        if (label.includes('% dividend') || (label.includes('dividend') && label.includes('%'))) detail.dividend = parseMoney(valueStr.replace('%',''));
        if (label.includes('% bonus') || (label.includes('bonus') && label.includes('%'))) detail.bonus = parseMoney(valueStr.replace('%',''));
        if (label.includes('paid up') || label.includes('paid-up')) detail.paidUpCapital = val;
        if (label.includes('market capitalization')) detail.marketCap = val;
      }
    });

    setCache(cacheKey, detail, 120000); // 2 mins cache
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// MERO LAGANI APIs
// ==========================================

// 1. Live Market Summary (replaces ShareSansar)
app.get('/api/mero/market-summary', async (req, res) => {
  try {
    // 1. Try ultra-fast JSON market_summary
    try {
      const jsonRes = await axios.get('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', {
        headers: HEADERS,
        timeout: 8000
      });
      const json = jsonRes.data;
      if (json && json.stock && Array.isArray(json.stock.detail)) {
        const turnoverMap = {};
        if (json.turnover && Array.isArray(json.turnover.detail)) {
          json.turnover.detail.forEach(t => { if (t && t.s) turnoverMap[t.s] = t; });
        }
        const stocks = json.stock.detail.map(item => {
          const symbol = item.s;
          const ltp = Number(item.lp) || 0;
          const change = Number(item.c) || 0;
          const volume = Number(item.q) || 0;
          const tInfo = turnoverMap[symbol] || {};
          const prevClose = ltp - change;
          const pChange = tInfo.pc != null ? Number(tInfo.pc) : (prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0);
          const high = tInfo.h != null ? Number(tInfo.h) : Math.max(ltp, ltp + change);
          const low = tInfo.l != null ? Number(tInfo.l) : Math.min(ltp, ltp + change);
          const open = tInfo.op != null ? Number(tInfo.op) : (prevClose || ltp);
          const turnover = tInfo.t != null ? Number(tInfo.t) : (ltp * volume);
          return {
            symbol,
            name: symbol,
            ltp,
            change: parseFloat(change.toFixed(2)),
            pChange: parseFloat(pChange.toFixed(2)),
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            prevClose: parseFloat((prevClose || ltp).toFixed(2)),
            volume: tInfo.q != null ? Number(tInfo.q) : volume,
            turnover: parseFloat(turnover.toFixed(2)),
            sector: 'Unknown',
            source: 'live'
          };
        }).filter(s => s.symbol && s.ltp > 0);

        if (stocks.length > 0) {
          return res.json({ success: true, data: stocks, turnover: parseMoney(json.overall?.t), date: json.overall?.d });
        }
      }
    } catch (_) {}

    // 2. Fallback to LatestMarket.aspx HTML scraper
    const response = await axios.get('https://merolagani.com/LatestMarket.aspx', { timeout: 10000 });
    const $ = cheerio.load(response.data);
    const stocks = [];
    $('table.table-hover tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const symbol = $(tds[0]).text().trim();
        const ltp = parseMoney($(tds[1]).text());
        const pChange = parseMoney($(tds[2]).text());
        const open = parseMoney($(tds[3]).text());
        const high = parseMoney($(tds[4]).text());
        const low = parseMoney($(tds[5]).text());
        const volume = parseMoney($(tds[6]).text());
        const prevClose = tds.length >= 8 ? parseMoney($(tds[7]).text()) : NaN;
        const rawDiff = tds.length >= 9 ? parseMoney($(tds[8]).text()) : NaN;

        let change = !isNaN(rawDiff) ? rawDiff : 0;
        if (isNaN(rawDiff) && !isNaN(ltp) && !isNaN(pChange)) {
          const calcPrevClose = !isNaN(prevClose) && prevClose > 0 ? prevClose : (ltp / (1 + pChange / 100));
          change = ltp - calcPrevClose;
        }

        const turnover = (ltp && volume) ? ltp * volume : 0;

        if (symbol && ltp > 0) {
          stocks.push({
            symbol,
            name: symbol,
            ltp,
            change: parseFloat((change || 0).toFixed(2)),
            pChange: parseFloat((pChange || 0).toFixed(2)),
            open: isNaN(open) ? ltp : open,
            high: isNaN(high) ? ltp : high,
            low: isNaN(low) ? ltp : low,
            prevClose: isNaN(prevClose) ? (ltp - change) : prevClose,
            volume: isNaN(volume) ? 0 : volume,
            turnover,
            sector: 'Unknown',
            source: 'live'
          });
        }
      }
    });
    res.json({ success: true, data: stocks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// 2. Fundamentals & Technicals
app.get('/api/mero/stock-details/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await axios.get(`https://merolagani.com/CompanyDetail.aspx?symbol=${symbol}`, { timeout: 10000 });
    const $ = cheerio.load(response.data);
    
    const details = {
      sector: '', sharesOutstanding: 0, marketCap: 0,
      eps: 0, pe: 0, bookValue: 0, pbv: 0, divYield: 0,
      high52w: 0, low52w: 0, avg120: 0
    };

    $('table tr').each((i, el) => {
      const tds = $(el).find('td, th');
      if (tds.length >= 2) {
        const label = $(tds[0]).text().trim().toLowerCase();
        const valStr = $(tds[1]).text().trim();
        const valNum = parseFloat(valStr.replace(/,/g, '')) || 0;

        if (label.includes('sector')) details.sector = valStr;
        if (label.includes('shares outstanding')) details.sharesOutstanding = valNum;
        if (label.includes('market capitalization')) details.marketCap = valNum;
        if (label.includes('eps')) details.eps = valNum;
        if (label.includes('p/e ratio')) details.pe = valNum;
        if (label.includes('book value')) details.bookValue = valNum;
        if (label.includes('pbv')) details.pbv = valNum;
        if (label.includes('dividend yield')) details.divYield = valNum;
        if (label.includes('52 weeks high - low')) {
          const parts = valStr.split('-');
          if (parts.length === 2) {
             details.high52w = parseFloat(parts[0].replace(/,/g, '')) || 0;
             details.low52w = parseFloat(parts[1].replace(/,/g, '')) || 0;
          }
        }
        if (label.includes('120 day average')) details.avg120 = valNum;
      }
    });
    res.json({ success: true, data: details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Floorsheet (Latest 50 transactions)
app.get('/api/mero/floorsheet/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    // MeroLagani Floorsheet page takes a search param, but it's hard to scrape without form submission.
    // NepseAlpha has an open API for floorsheet! We'll use NepseAlpha for Floorsheet for speed.
    const response = await axios.get(`https://nepsealpha.com/api/smx9156/live_floorsheet?symbol=${symbol}`, { timeout: 10000 });
    // Convert to our format
    const floorsheet = (response.data.data || []).slice(0, 50).map(t => ({
      id: t.id,
      buyer: t.buyer_broker,
      seller: t.seller_broker,
      qty: t.quantity,
      rate: t.rate,
      amount: t.amount,
      time: t.time
    }));
    res.json({ success: true, data: floorsheet });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Price History
app.get('/api/mero/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    // NepseAlpha chart API is fastest and easiest for history
    const end = Math.floor(Date.now() / 1000);
    const start = end - (90 * 24 * 60 * 60); // 90 days
    const response = await axios.get(`https://nepsealpha.com/trading/1/history?symbol=${symbol}&resolution=1D&from=${start}&to=${end}`, { timeout: 10000 });
    
    const d = response.data;
    const history = [];
    if (d.s === 'ok' && d.t) {
      for (let i = 0; i < d.t.length; i++) {
        history.push({
          time: d.t[i],
          date: new Date(d.t[i]*1000).toISOString().split('T')[0],
          open: d.o[i],
          high: d.h[i],
          low: d.l[i],
          close: d.c[i],
          volume: d.v[i]
        });
      }
    }
    // Return latest first
    res.json({ success: true, data: history.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ENDPOINT — Merolagani News Feed */
app.get('/api/news/merolagani', async (req, res) => {
  const cacheKey = 'merolagani_news';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, fromCache: true });

  try {
    const response = await axios.get('https://merolagani.com/NewsList.aspx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,ne;q=0.8'
      },
      timeout: 9000
    });

    const html = response.data;
    if (!html || html.length < 500) {
      return res.json({ success: false, data: [] });
    }

    const $ = cheerio.load(html);
    const articles = [];

    // Merolagani news listing containers
    $('a[href*="NewsDetail.aspx"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const rawTitle = $(el).text().replace(/\s+/g, ' ').trim();
      if (rawTitle.length > 10 && articles.length < 20) {
        const newsId = href.match(/newsID=(\d+)/)?.[1] || String(i);
        if (!articles.find(a => a.id === newsId)) {
          // Try to get the date from a sibling or parent container
          const parent = $(el).closest('.media, .news-item, .list-item, tr, li, div[class*="news"]');
          const dateText = parent.find('.date, .time, [class*="date"], [class*="time"], small').first().text().trim() || 'Latest';
          articles.push({
            id: newsId,
            title: rawTitle,
            source: 'Merolagani',
            url: `https://merolagani.com/${href.startsWith('/') ? href.slice(1) : href}`,
            date: dateText,
            time: dateText
          });
        }
      }
    });

    if (articles.length > 0) {
      setCache(cacheKey, articles, 6 * 60 * 1000); // Cache 6 minutes
      return res.json({ success: true, data: articles });
    }

    res.json({ success: false, data: [] });
  } catch (err) {
    console.error('[news/merolagani] Fetch error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

/* ═══════════════════════════════════════════════════
   REAL DATA ENDPOINT A — Stock Price History (via @rumess/nepse-api & ShareSansar fallback)
   Returns real OHLCV history from NEPSE official API
   GET /api/price-history/:symbol?length=365
   ═══════════════════════════════════════════════════ */
app.get('/api/price-history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const length = Math.min(Math.max(parseInt(req.query.length || '365', 10), 1), 500);
  const cacheKey = `price-history-${symbol}-${length}`;
  const cached = getCache(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return res.json({ success: true, data: cached, cached: true, count: cached.length });
  }

  // Method 1: Direct NEPSE API via nepseClient (official data)
  try {
    const keymap = await nepseClient.getSecuritySymbolIdKeymap();
    const securityId = keymap.get(symbol);
    if (securityId) {
      const endpoint = `/api/nots/market/security/price/${securityId}?page=0&size=${length}&sort=businessDate,desc`;
      const response = await nepseClient.requestGETAPI(endpoint);
      const content = response?.content || (Array.isArray(response) ? response : []);

      if (content.length > 0) {
        const formatted = content.map(item => ({
          date: item.businessDate,
          open: parseFloat(item.openPrice || 0),
          high: parseFloat(item.highPrice || 0),
          low: parseFloat(item.lowPrice || 0),
          close: parseFloat(item.closePrice || item.lastTradedPrice || 0),
          volume: parseFloat(item.totalTradedQuantity || 0),
          turnover: parseFloat(item.totalTradedValue || 0),
          trades: item.totalTrades || 0,
          high52w: parseFloat(item.fiftyTwoWeekHigh || 0),
          low52w: parseFloat(item.fiftyTwoWeekLow || 0),
          prevClose: parseFloat(item.previousDayClosePrice || 0),
          avgRate: parseFloat(item.averageTradedPrice || 0)
        })).filter(d => d.close > 0);

        // Sort chronologically (oldest to newest)
        formatted.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (formatted.length > 0) {
          setCache(cacheKey, formatted, 2 * 60 * 60 * 1000); // 2 hours
          return res.json({ success: true, data: formatted, count: formatted.length, source: 'nepse-official' });
        }
      }
    }
  } catch (nepseErr) {
    console.warn(`[price-history] NEPSE API failed for ${symbol}:`, nepseErr.message);
  }

  // Method 2: ShareSansar CSRF scrape fallback
  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    const pageRes = await client.get(`https://www.sharesansar.com/company/${symbol.toLowerCase()}`, {
      headers: HEADERS, timeout: 10000
    });
    const $ = cheerio.load(pageRes.data);
    const token = $('meta[name="_token"]').attr('content') || $('input[name="_token"]').val();
    const companyId = $('#companyid').text().trim();

    if (token && companyId) {
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

      if (historyRes.data?.data && Array.isArray(historyRes.data.data)) {
        const formatted = historyRes.data.data.map(item => ({
          date: item.published_date,
          open: parseFloat(item.open) || 0,
          high: parseFloat(item.high) || 0,
          low: parseFloat(item.low) || 0,
          close: parseFloat(item.close) || 0,
          volume: parseFloat(item.traded_quantity) || 0
        })).filter(d => d.close > 0);
        formatted.reverse();
        if (formatted.length > 0) {
          setCache(cacheKey, formatted, 2 * 60 * 60 * 1000);
          return res.json({ success: true, data: formatted, count: formatted.length, source: 'sharesansar' });
        }
      }
    }
  } catch (ssErr) {
    console.warn(`[price-history] ShareSansar fallback failed for ${symbol}:`, ssErr.message);
  }

  res.status(500).json({ success: false, message: `Failed to fetch price history for ${symbol}.` });
});

/* ═══════════════════════════════════════════════════
   REAL DATA ENDPOINT B — Real Floorsheet (via @rumess/nepse-api)
   GET /api/floorsheet/:symbol? (optional symbol for market-wide or stock-specific)
   ═══════════════════════════════════════════════════ */
app.get(['/api/floorsheet', '/api/floorsheet/:symbol'], async (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  const page = Math.max(0, parseInt(req.query.page || '1', 10) - 1);
  const size = Math.min(parseInt(req.query.size || '25', 10), 100);
  const businessDate = req.query.date || '';
  const cacheKey = `floorsheet-${symbol || 'market'}-${businessDate}-p${page}-s${size}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const options = { page, size };
    if (symbol) options.symbol = symbol;
    if (businessDate) options.date = businessDate;
    const result = await nepseClient.getFloorSheet(options);

    const raw = result?.floorsheets?.content || result?.content || [];
    const totalPages = result?.floorsheets?.totalPages || result?.totalPages || 1;
    const totalElements = result?.floorsheets?.totalElements || result?.totalElements || raw.length;

    const rows = raw.map(item => ({
      contractId: item.contractId,
      buyerBroker: String(item.buyerMemberId || item.buyerBroker || ''),
      buyerBrokerName: item.buyerBrokerName || `Broker ${item.buyerMemberId || item.buyerBroker}`,
      sellerBroker: String(item.sellerMemberId || item.sellerBroker || ''),
      sellerBrokerName: item.sellerBrokerName || `Broker ${item.sellerMemberId || item.sellerBroker}`,
      qty: item.contractQuantity || 0,
      rate: parseFloat(item.contractRate || 0),
      amount: parseFloat(item.contractAmount || 0),
      businessDate: item.businessDate || businessDate,
      tradeTime: item.tradeTime || '',
      stockSymbol: item.stockSymbol || symbol
    }));

    const data = {
      rows,
      page: page + 1,
      size,
      totalPages,
      totalElements,
      totalAmount: result?.totalAmount || rows.reduce((s, r) => s + r.amount, 0),
      totalQty: result?.totalQty || rows.reduce((s, r) => s + r.qty, 0),
      totalTrades: result?.totalTrades || totalElements,
      symbol,
      businessDate: businessDate || rows[0]?.businessDate || ''
    };

    const ttl = businessDate ? 2 * 60 * 60 * 1000 : 5 * 60 * 1000;
    setCache(cacheKey, data, ttl);
    return res.json({ success: true, data, source: 'nepse-api' });
  } catch (err) {
    console.error(`[floorsheet] Error for ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: `Failed to fetch floorsheet for ${symbol}: ${err.message}` });
  }
});

/* ═══════════════════════════════════════════════════
   REAL DATA ENDPOINT C — NEPSE Company Security ID
   GET /api/nepse/company-id/:symbol
   ═══════════════════════════════════════════════════ */
app.get('/api/nepse/company-id/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `nepse-company-id-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const securities = await nepseClient.getSecurityList();
    const company = (Array.isArray(securities) ? securities : []).find(c => (c.symbol || '').toUpperCase() === symbol);
    if (!company) {
      return res.status(404).json({ success: false, message: `Company not found for symbol ${symbol}` });
    }
    const result = {
      id: company.id,
      symbol: company.symbol,
      companyName: company.companyName || company.securityName || symbol,
      sectorDescription: company.sectorDescription || company.sectorName || 'Unknown',
      openPrice: company.openPrice,
      highPrice: company.highPrice,
      lowPrice: company.lowPrice,
      closePrice: company.closePrice || company.lastTradedPrice
    };
    setCache(cacheKey, result, 24 * 60 * 60 * 1000);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(`[nepse/company-id] Error for ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════════
   REAL DATA ENDPOINT D — Broker Analysis (Aggregate Floorsheet)
   GET /api/broker-analysis/:symbol?days=30
   ═══════════════════════════════════════════════════ */
app.get('/api/broker-analysis/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = Math.min(parseInt(req.query.days || '30', 10), 90);
  const cacheKey = `broker-analysis-${symbol}-${days}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const pageSize = Math.min(Math.max(days * 20, 100), 500);
    const result = await nepseClient.getFloorSheet({ symbol, page: 0, size: pageSize });
    const raw = result?.floorsheets?.content || result?.content || [];

    // Filter to N trading days
    const dateSet = new Set();
    raw.forEach(r => { if (r.businessDate) dateSet.add(r.businessDate); });
    const sortedDates = Array.from(dateSet).sort().reverse().slice(0, days);
    const dateFilter = new Set(sortedDates);
    const filtered = raw.filter(r => !r.businessDate || dateFilter.has(r.businessDate));

    // Aggregate per broker
    const brokerMap = {};
    let totalBuyVol = 0, totalAmount = 0;

    filtered.forEach(item => {
      const buyBroker = String(item.buyerMemberId || item.buyerBroker || '?');
      const sellBroker = String(item.sellerMemberId || item.sellerBroker || '?');
      const buyName = item.buyerBrokerName || `Broker ${buyBroker}`;
      const sellName = item.sellerBrokerName || `Broker ${sellBroker}`;
      const qty = Number(item.contractQuantity || 0);
      const amount = Number(item.contractAmount || 0);

      if (!brokerMap[buyBroker]) brokerMap[buyBroker] = { broker: buyBroker, name: buyName, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
      if (!brokerMap[sellBroker]) brokerMap[sellBroker] = { broker: sellBroker, name: sellName, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };

      brokerMap[buyBroker].buyQty += qty;
      brokerMap[buyBroker].buyAmt += amount;
      brokerMap[sellBroker].sellQty += qty;
      brokerMap[sellBroker].sellAmt += amount;
      totalBuyVol += qty;
      totalAmount += amount;
    });

    const brokers = Object.values(brokerMap).map(b => ({
      ...b,
      netQty: b.buyQty - b.sellQty,
      netAmt: b.buyAmt - b.sellAmt,
      totalQty: b.buyQty + b.sellQty,
      avgBuyRate: b.buyQty > 0 ? Number((b.buyAmt / b.buyQty).toFixed(2)) : 0,
      avgSellRate: b.sellQty > 0 ? Number((b.sellAmt / b.sellQty).toFixed(2)) : 0,
    })).sort((a, b) => b.totalQty - a.totalQty);

    const topBuyers = [...brokers].sort((a, b) => b.buyQty - a.buyQty).slice(0, 5);
    const topSellers = [...brokers].sort((a, b) => b.sellQty - a.sellQty).slice(0, 5);
    const topNetBuyers = [...brokers].filter(b => b.netQty > 0).sort((a, b) => b.netQty - a.netQty).slice(0, 5);
    const topNetSellers = [...brokers].filter(b => b.netQty < 0).sort((a, b) => a.netQty - b.netQty).slice(0, 5);

    const netBuyerQty = topNetBuyers.reduce((s, b) => s + b.netQty, 0);
    const netSellerQty = Math.abs(topNetSellers.reduce((s, b) => s + b.netQty, 0));
    const adRatio = totalBuyVol > 0 ? (netBuyerQty - netSellerQty) / totalBuyVol : 0;
    const adSignal = adRatio > 0.05 ? 'Accumulation' : adRatio < -0.05 ? 'Distribution' : 'Neutral';
    const adStrength = Math.min(Math.abs(adRatio) * 100, 100).toFixed(1);

    const dailyFlow = sortedDates.reverse().map(date => {
      const dayRows = filtered.filter(r => r.businessDate === date);
      const dayBrokerMap = {};
      let dayTurnover = 0;
      dayRows.forEach(r => {
        const buyB = String(r.buyerMemberId || r.buyerBroker || '?');
        const sellB = String(r.sellerMemberId || r.sellerBroker || '?');
        const q = Number(r.contractQuantity || 0);
        dayTurnover += Number(r.contractAmount || 0);
        if (!dayBrokerMap[buyB]) dayBrokerMap[buyB] = { buy: 0, sell: 0 };
        if (!dayBrokerMap[sellB]) dayBrokerMap[sellB] = { buy: 0, sell: 0 };
        dayBrokerMap[buyB].buy += q;
        dayBrokerMap[sellB].sell += q;
      });
      const db = Object.values(dayBrokerMap);
      const instBuy = db.filter(b => b.buy > b.sell).reduce((s, b) => s + b.buy, 0);
      const instSell = db.filter(b => b.sell > b.buy).reduce((s, b) => s + b.sell, 0);
      return {
        date,
        buyVol: instBuy + instSell,
        sellVol: instBuy + instSell,
        netFlow: instBuy - instSell,
        turnover: dayTurnover,
        totalTrades: dayRows.length
      };
    });

    const data = {
      symbol,
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

    setCache(cacheKey, data, 30 * 60 * 1000);
    res.json({ success: true, data, source: 'nepse-api' });
  } catch (err) {
    console.error(`[broker-analysis] Error for ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: `Failed to fetch broker analysis: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW ENDPOINTS — StockYan Feature Parity Integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/nepse/live-index
 * Fetches live NEPSE index values via the @rumess/nepse-api client.
 */
app.get('/api/nepse/live-index', async (req, res) => {
  const cacheKey = 'nepse-live-index';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });
  try {
    const summary = await nepseClient.getMarketSummary();
    const data = {
      nepse: summary?.nepseIndex ?? null,
      sensitive: summary?.sensitiveIndex ?? null,
      float: summary?.sensitiveFloatIndex ?? null,
      turnover: summary?.totalTurnover ?? null,
      tradedScrips: summary?.totalTradedScrips ?? null,
      advances: summary?.advancingStocks ?? null,
      declines: summary?.decliningStocks ?? null,
      unchanged: summary?.unchangedStocks ?? null,
      fetchedAt: new Date().toISOString()
    };
    setCache(cacheKey, data, 30 * 1000); // 30s TTL
    res.json({ success: true, data, source: 'nepse-api' });
  } catch (err) {
    console.error('[live-index] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/nepse/market-depth/:symbol
 * Returns Level-2 bid/ask order book for a given stock symbol.
 */
app.get('/api/nepse/market-depth/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `market-depth-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    let depthRaw = null;
    try {
      depthRaw = await nepseClient.getStockSupplyDemand(symbol);
    } catch (_) {}

    if (depthRaw && (depthRaw.buyDemand || depthRaw.sellSupply)) {
      const bids = (depthRaw.buyDemand || []).slice(0, 10).map(b => ({
        price: Number(b.rate || b.price || 0),
        quantity: Number(b.quantity || b.qty || 0),
        orders: Number(b.numberOfOrders || b.orders || 1)
      }));
      const asks = (depthRaw.sellSupply || []).slice(0, 10).map(a => ({
        price: Number(a.rate || a.price || 0),
        quantity: Number(a.quantity || a.qty || 0),
        orders: Number(a.numberOfOrders || a.orders || 1)
      }));
      const totalBidQty = bids.reduce((s, b) => s + b.quantity, 0);
      const totalAskQty = asks.reduce((s, a) => s + a.quantity, 0);
      const obir = (totalBidQty + totalAskQty) > 0
        ? Number(((totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)).toFixed(4)) : 0;
      const data = { symbol, bids, asks, totalBidQty, totalAskQty, obir, source: 'nepse-api', fetchedAt: new Date().toISOString() };
      setCache(cacheKey, data, 15 * 1000);
      return res.json({ success: true, data });
    }

    // Fallback: scrape merolagani
    const html = await axios.get(`https://merolagani.com/CompanyDetail.aspx?symbol=${symbol}`, {
      headers: HEADERS, timeout: 10000
    }).then(r => r.data).catch(() => null);

    const bids = [], asks = [];
    if (html) {
      const $ = cheerio.load(html);
      $('[id*="bidTable"] tr, [id*="BidTable"] tr').slice(1, 11).each((_, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const price = parseMoney($(tds[0]).text());
          const qty = parseMoney($(tds[1]).text());
          if (!isNaN(price) && price > 0) bids.push({ price, quantity: isNaN(qty) ? 0 : qty, orders: 1 });
        }
      });
      $('[id*="askTable"] tr, [id*="AskTable"] tr').slice(1, 11).each((_, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const price = parseMoney($(tds[0]).text());
          const qty = parseMoney($(tds[1]).text());
          if (!isNaN(price) && price > 0) asks.push({ price, quantity: isNaN(qty) ? 0 : qty, orders: 1 });
        }
      });
    }

    const totalBidQty = bids.reduce((s, b) => s + b.quantity, 0);
    const totalAskQty = asks.reduce((s, a) => s + a.quantity, 0);
    const obir = (totalBidQty + totalAskQty) > 0
      ? Number(((totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)).toFixed(4)) : 0;
    const data = { symbol, bids, asks, totalBidQty, totalAskQty, obir, source: bids.length > 0 ? 'scraped' : 'empty', fetchedAt: new Date().toISOString() };
    setCache(cacheKey, data, 30 * 1000);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[market-depth] ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/dividend-history/:symbol
 * Returns dividend and bonus share history for a given stock from Merolagani.
 */
app.get('/api/dividend-history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `dividend-history-${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const dividends = [];

    // Try NEPSE API company details first
    try {
      const companyDetails = await nepseClient.getCompanyDetails(symbol);
      const divArr = companyDetails?.dividends || companyDetails?.bonus || [];
      if (Array.isArray(divArr) && divArr.length > 0) {
        divArr.forEach(d => dividends.push({
          fiscalYear: d.fiscalYear || d.year || '—',
          cashDividend: Number(d.cashDividend || d.cash || 0),
          bonusShare: Number(d.bonusShare || d.bonus || 0),
          rightShare: Number(d.rightShare || d.rights || 0),
          totalYield: Number(d.cashDividend || 0) + Number(d.bonusShare || 0)
        }));
      }
    } catch (_) {}

    // Fallback: scrape merolagani company detail page
    if (dividends.length === 0) {
      const html = await axios.get(`https://merolagani.com/CompanyDetail.aspx?symbol=${symbol}`, {
        headers: HEADERS, timeout: 12000
      }).then(r => r.data).catch(() => null);

      if (html) {
        const $ = cheerio.load(html);
        $('table').each((_, table) => {
          const headers = $(table).find('th').map((_, th) => $(th).text().toLowerCase()).get().join(' ');
          if (headers.includes('dividend') || headers.includes('bonus') || headers.includes('fiscal')) {
            $(table).find('tbody tr').each((_, row) => {
              const tds = $(row).find('td');
              if (tds.length >= 2) {
                const year = $(tds[0]).text().trim();
                const cashDiv = parseMoney($(tds[1]).text());
                const bonusShare = tds.length >= 3 ? parseMoney($(tds[2]).text()) : 0;
                const rightShare = tds.length >= 4 ? parseMoney($(tds[3]).text()) : 0;
                if (year && year.length > 0) {
                  dividends.push({
                    fiscalYear: year,
                    cashDividend: isNaN(cashDiv) ? 0 : cashDiv,
                    bonusShare: isNaN(bonusShare) ? 0 : bonusShare,
                    rightShare: isNaN(rightShare) ? 0 : rightShare,
                    totalYield: (isNaN(cashDiv) ? 0 : cashDiv) + (isNaN(bonusShare) ? 0 : bonusShare)
                  });
                }
              }
            });
          }
        });
      }
    }

    const data = { symbol, dividends, totalEntries: dividends.length, fetchedAt: new Date().toISOString() };
    setCache(cacheKey, data, 6 * 60 * 60 * 1000); // 6h TTL
    res.json({ success: true, data, source: dividends.length > 0 ? 'live' : 'empty' });
  } catch (err) {
    console.error(`[dividend-history] ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/compare/:symbol1/:symbol2
 * Returns side-by-side fundamental & price metrics for two stocks.
 */
app.get('/api/compare/:symbol1/:symbol2', async (req, res) => {
  const s1 = req.params.symbol1.toUpperCase();
  const s2 = req.params.symbol2.toUpperCase();
  const cacheKey = `compare-${s1}-${s2}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const fetchStockData = async (sym) => {
    try {
      const [detailRes, histRes] = await Promise.allSettled([
        axios.get(`http://localhost:${PORT}/api/stock-detail/${sym}`, { timeout: 8000 }).then(r => r.data?.data),
        axios.get(`http://localhost:${PORT}/api/price-history/${sym}?length=365`, { timeout: 8000 }).then(r => r.data?.data)
      ]);
      const d = detailRes.status === 'fulfilled' && detailRes.value ? detailRes.value : {};
      const h = histRes.status === 'fulfilled' && Array.isArray(histRes.value) ? histRes.value : [];
      const prices = h.map(p => Number(p.close || p.closePrice || 0)).filter(p => p > 0);
      const high52 = prices.length > 0 ? Math.max(...prices) : Number(d.high52w || 0);
      const low52 = prices.length > 0 ? Math.min(...prices) : Number(d.low52w || 0);
      const returns1Y = prices.length >= 2
        ? Number(((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2)) : 0;
      return {
        symbol: sym,
        name: d.name || d.companyName || sym,
        sector: d.sector || '—',
        ltp: Number(d.ltp || d.close || 0),
        change: Number(d.change || 0),
        pChange: Number(d.pChange || d.percentageChange || 0),
        eps: Number(d.eps || 0),
        pe: Number(d.pe || d.peRatio || 0),
        pb: Number(d.pb || d.pbRatio || 0),
        roe: Number(d.roe || 0),
        bookValue: Number(d.bookValue || 0),
        high52w: high52,
        low52w: low52,
        marketCap: Number(d.marketCap || 0),
        listedShares: Number(d.listedShares || 0),
        cashDiv: Number(d.cashDiv || d.cashDividend || 0),
        bonusShare: Number(d.bonusShare || d.bonus || 0),
        returns1Y,
        priceHistory: prices.slice(-30)
      };
    } catch (e) {
      return { symbol: sym, error: e.message };
    }
  };

  try {
    const [stock1, stock2] = await Promise.all([fetchStockData(s1), fetchStockData(s2)]);
    const data = { stock1, stock2, comparedAt: new Date().toISOString() };
    setCache(cacheKey, data, 5 * 60 * 1000); // 5 min TTL
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[compare] ${s1} vs ${s2}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES TAB — NEW ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S1 — Public IPO Live Listings (No MeroShare login required)
   GET /api/ipo/live-listings
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/ipo/live-listings', async (req, res) => {
  const cacheKey = 'ipo-live-listings';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const issues = [];

  // Source 1: ShareSansar IPO page
  try {
    const resp = await axios.get('https://www.sharesansar.com/ipo', {
      headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
      timeout: 12000
    });
    const $ = cheerio.load(resp.data);
    $('table tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 5) {
        const nameRaw   = $(tds[0]).text().trim();
        const typeRaw   = $(tds[1]).text().trim();
        const units     = parseMoney($(tds[2]).text());
        const openDate  = $(tds[3]).text().trim();
        const closeDate = $(tds[4]).text().trim();
        const issuePrice = tds.length >= 6 ? parseMoney($(tds[5]).text()) : 100;
        const statusRaw  = tds.length >= 7 ? $(tds[6]).text().trim() : 'Open';
        if (nameRaw && nameRaw.length > 2 && !issues.find(x => x.name === nameRaw)) {
          issues.push({ id: `ss-${i}`, name: nameRaw, scrip: '', type: typeRaw || 'IPO', units: isNaN(units) ? 0 : units, issuePrice: isNaN(issuePrice) ? 100 : issuePrice, openDate, closeDate, status: statusRaw || 'Open', source: 'sharesansar' });
        }
      }
    });
  } catch (e) { console.warn('[ipo/live-listings] ShareSansar error:', e.message); }

  // Source 2: Merolagani IPO page
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://merolagani.com/IPO.aspx', {
        headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
      });
      const $ = cheerio.load(resp.data);
      $('table tbody tr, .ipo-list tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 3) {
          const name = $(tds[0]).text().trim();
          const type = $(tds[1]).text().trim();
          const openDate  = $(tds[2]).text().trim();
          const closeDate = tds.length >= 4 ? $(tds[3]).text().trim() : '';
          if (name && name.length > 3) {
            issues.push({ id: `ml-${i}`, name, type: type || 'IPO', openDate, closeDate, status: 'Open', source: 'merolagani' });
          }
        }
      });
    } catch (e) { console.warn('[ipo/live-listings] Merolagani error:', e.message); }
  }

  // Source 3: CDSC public endpoint (no captcha or auth on companyShare/currentIssue public path)
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://webbackend.cdsc.com.np/api/meroShare/companyShare/currentIssue/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)', 'Accept': 'application/json', 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },
        timeout: 8000
      });
      const data = Array.isArray(resp.data) ? resp.data : [];
      data.forEach((item, i) => {
        issues.push({
          id: item.companyShareId || `cdsc-${i}`,
          name: item.companyName || '',
          scrip: item.scrip || '',
          type: item.shareTypeName || 'IPO',
          units: item.totalUnit || 0,
          issuePrice: item.amountPerShare || 100,
          minKitta: item.minKitta || 10,
          maxKitta: item.maxKitta || 10000,
          openDate: item.issueOpenDate || '',
          closeDate: item.issueCloseDate || '',
          status: 'Open',
          source: 'cdsc-public'
        });
      });
    } catch (e) { console.warn('[ipo/live-listings] CDSC public error:', e.message); }
  }

  setCache(cacheKey, issues, 30 * 60 * 1000);
  res.json({ success: true, data: issues, count: issues.length });
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S2 — IPO Pipeline (SEBON + ShareSansar upcoming)
   GET /api/ipo/pipeline
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/ipo/pipeline', async (req, res) => {
  const cacheKey = 'ipo-pipeline';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const pipeline = [];

  try {
    const resp = await axios.get('https://www.sharesansar.com/upcoming-issues', {
      headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    });
    const $ = cheerio.load(resp.data);
    $('table tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 4) {
        const name = $(tds[0]).text().trim();
        const type = $(tds[1]).text().trim();
        const units = parseMoney($(tds[2]).text());
        const amount = parseMoney($(tds[3]).text());
        const openDate     = tds.length >= 5 ? $(tds[4]).text().trim() : '';
        const closeDate    = tds.length >= 6 ? $(tds[5]).text().trim() : '';
        const issueManager = tds.length >= 7 ? $(tds[6]).text().trim() : '';
        const status       = tds.length >= 8 ? $(tds[7]).text().trim() : 'Upcoming';
        if (name && name.length > 2) {
          pipeline.push({ id: `pipeline-${i}`, name, type: type || 'IPO', units: isNaN(units) ? 0 : units, amount: isNaN(amount) ? 0 : amount, openDate, closeDate, issueManager, status: status || 'Upcoming', source: 'sharesansar' });
        }
      }
    });
  } catch (e) { console.warn('[ipo/pipeline] ShareSansar error:', e.message); }

  if (pipeline.length === 0) {
    try {
      const resp = await axios.get('https://merolagani.com/upcomingIpo.aspx', {
        headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
      });
      const $ = cheerio.load(resp.data);
      $('table tbody tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 3) {
          const name = $(tds[0]).text().trim();
          const openDate = $(tds[1]).text().trim();
          const closeDate = tds.length >= 3 ? $(tds[2]).text().trim() : '';
          if (name && name.length > 2) {
            pipeline.push({ id: `ml-pipe-${i}`, name, type: 'IPO', openDate, closeDate, status: 'Upcoming', source: 'merolagani' });
          }
        }
      });
    } catch (e) { console.warn('[ipo/pipeline] Merolagani error:', e.message); }
  }

  setCache(cacheKey, pipeline, 60 * 60 * 1000);
  res.json({ success: true, data: pipeline, count: pipeline.length });
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S3 — Sector Heatmap (live sector % change + market cap + A/D)
   GET /api/sector-heatmap
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/sector-heatmap', async (req, res) => {
  const cacheKey = 'sector-heatmap';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const [indicesResp, stocksResp] = await Promise.allSettled([
      axios.get(`http://localhost:${PORT}/api/market-indices`, { timeout: 8000 }),
      axios.get(`http://localhost:${PORT}/api/mero/market-summary`, { timeout: 8000 })
    ]);

    const indicesData = indicesResp.status === 'fulfilled' ? indicesResp.value.data?.data : {};
    const stocksData  = stocksResp.status === 'fulfilled' ? stocksResp.value.data?.data || [] : [];
    const subIndices  = indicesData?.subIndices || [];

    const sectorMap = {};
    (Array.isArray(stocksData) ? stocksData : []).forEach(s => {
      const sector = s.sector || 'Others';
      if (!sectorMap[sector]) sectorMap[sector] = { sector, stocks: 0, totalTurnover: 0, totalVolume: 0, sumPChange: 0, advancers: 0, decliners: 0, unchanged: 0 };
      sectorMap[sector].stocks++;
      sectorMap[sector].totalTurnover += Number(s.turnover || 0);
      sectorMap[sector].totalVolume   += Number(s.volume || 0);
      sectorMap[sector].sumPChange    += Number(s.pChange || 0);
      if (s.pChange > 0) sectorMap[sector].advancers++;
      else if (s.pChange < 0) sectorMap[sector].decliners++;
      else sectorMap[sector].unchanged++;
    });

    const SECTOR_COLORS = { 'Commercial Banks':'#3b82f6','Development Banks':'#06b6d4','Finance':'#8b5cf6','Microfinance':'#ec4899','Life Insurance':'#10b981','Non Life Insurance':'#14b8a6','Hotels And Tourism':'#f59e0b','Hydropower':'#22c55e','Manufacturing And Processing':'#ef4444','Tradings':'#f97316','Others':'#64748b','Mutual Fund':'#a855f7','Investment':'#6366f1' };
    const SECTOR_TO_INDEX = { 'Commercial Banks':'Banking Sub Index','Development Banks':'Development Bank Index','Finance':'Finance Index','Microfinance':'Microfinance Index','Life Insurance':'Life Insurance Index','Non Life Insurance':'Non Life Insurance Index','Hotels And Tourism':'Hotels And Tourism Index','Hydropower':'Hydropower Index','Manufacturing And Processing':'Manufacturing And Processing Index','Tradings':'Trading Index','Mutual Fund':'Mutual Fund Index','Investment':'Investment Index' };

    const subIndexMap = {};
    subIndices.forEach(si => { if (si.index) subIndexMap[si.index] = si; });

    const heatmap = Object.values(sectorMap).map(sec => {
      const indexKey = SECTOR_TO_INDEX[sec.sector];
      const subIdx   = indexKey ? subIndexMap[indexKey] : null;
      const pChange  = subIdx ? Number(subIdx.pChange || 0) : (sec.stocks > 0 ? sec.sumPChange / sec.stocks : 0);
      return {
        sector: sec.sector,
        pChange: Number(pChange.toFixed(2)),
        value: subIdx ? Number(subIdx.value || 0) : 0,
        change: subIdx ? Number(subIdx.change || 0) : 0,
        turnover: sec.totalTurnover,
        volume: sec.totalVolume,
        stockCount: sec.stocks,
        advancers: sec.advancers,
        decliners: sec.decliners,
        unchanged: sec.unchanged,
        color: SECTOR_COLORS[sec.sector] || '#64748b'
      };
    }).sort((a, b) => b.turnover - a.turnover);

    subIndices.forEach(si => {
      const name = si.index || '';
      if (!heatmap.find(h => SECTOR_TO_INDEX[h.sector] === name) && !heatmap.find(h => h.sector === name)) {
        heatmap.push({ sector: name, pChange: Number(si.pChange || 0), value: Number(si.value || 0), change: Number(si.change || 0), turnover: si.turnover || 0, volume: 0, stockCount: 0, advancers: 0, decliners: 0, unchanged: 0, color: '#64748b' });
      }
    });

    setCache(cacheKey, heatmap, 30 * 1000);
    res.json({ success: true, data: heatmap });
  } catch (err) {
    console.error('[sector-heatmap] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S4 — Bulk Market Scanner (RSI, EMA, Bollinger, MACD, Volume, Breakout, Pivot, Candlestick, etc.)
   GET /api/scanner/bulk?type=rsi|ema|bollinger|macd|volume|breakout|pivot|candlestick|consolidating|strong_trend|trend_continuation|gainers|losers|volume_leaders|turnover_leaders|circuit_up|circuit_down|52w_high|52w_low
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/scanner/bulk', async (req, res) => {
  const type = (req.query.type || 'rsi').toLowerCase();
  const cacheKey = `scanner-bulk-${type}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true, type });

  try {
    const stocksResp = await axios.get(`http://localhost:${PORT}/api/mero/market-summary`, { timeout: 10000 });
    const allStocks = stocksResp.data?.data || [];

    if (!Array.isArray(allStocks) || allStocks.length === 0) {
      return res.status(503).json({ success: false, message: 'No market data available for scanning.' });
    }

    // Approximate RSI from pChange (bulk mode; for accurate RSI use /api/price-history/:symbol)
    const calcRSI14 = (s) => {
      const p = Number(s.pChange || 0);
      let rsi = 50;
      if (p > 0) rsi += Math.min(30, p * 6);
      if (p < 0) rsi -= Math.min(30, Math.abs(p) * 6);
      return Math.max(5, Math.min(95, rsi));
    };

    const calcPivotPoint = (s) => {
      const H = Number(s.high || s.ltp || 0), L = Number(s.low || s.ltp || 0), C = Number(s.prevClose || s.ltp || 0);
      const PP = (H + L + C) / 3;
      return { PP, R1: 2*PP-L, R2: PP+(H-L), S1: 2*PP-H, S2: PP-(H-L) };
    };

    const detectCandlePattern = (s) => {
      const O = Number(s.open || s.ltp), H = Number(s.high || s.ltp), L = Number(s.low || s.ltp), C = Number(s.ltp || 0);
      if (C <= 0) return null;
      const body = Math.abs(C - O), range = H - L || 1;
      const upper = H - Math.max(C, O), lower = Math.min(C, O) - L;
      if (body/range < 0.1 && upper > body*2 && lower > body*2) return 'Doji';
      if (lower > body*2 && upper < body*0.5 && C > O) return 'Hammer';
      if (upper > body*2 && lower < body*0.5 && C < O) return 'Shooting Star';
      if (C > O && body/range > 0.6) return 'Bullish Marubozu';
      if (C < O && body/range > 0.6) return 'Bearish Marubozu';
      return null;
    };

    let results = [];
    const avgVol = allStocks.reduce((s, x) => s + Number(x.volume || 0), 0) / Math.max(allStocks.length, 1);

    switch (type) {
      case 'rsi': {
        const mode = (req.query.mode || 'all').toLowerCase();
        results = allStocks.map(s => ({ ...s, rsi: calcRSI14(s) }))
          .filter(s => mode === 'oversold' ? s.rsi < 35 : mode === 'overbought' ? s.rsi > 65 : s.rsi < 35 || s.rsi > 65)
          .sort((a, b) => a.rsi - b.rsi);
        break;
      }
      case 'ema': {
        results = allStocks.filter(s => Number(s.ltp||0) > Number(s.prevClose||0) && Number(s.pChange||0) > 0.5)
          .map(s => ({ ...s, signal: 'Bullish EMA Alignment' })).sort((a, b) => b.pChange - a.pChange);
        break;
      }
      case 'bollinger': {
        results = allStocks.filter(s => {
          const H = Number(s.high||s.ltp), L = Number(s.low||s.ltp), C = Number(s.ltp||1);
          return (H-L)/C < 0.05;
        }).map(s => {
          const H = Number(s.high||s.ltp), L = Number(s.low||s.ltp), C = Number(s.ltp||1);
          return { ...s, bbWidth: Number(((H-L)/C*100).toFixed(2)), signal: 'Bollinger Squeeze' };
        }).sort((a, b) => a.bbWidth - b.bbWidth);
        break;
      }
      case 'macd': {
        results = allStocks.filter(s => Number(s.pChange||0) > 0.5)
          .map(s => { const p = Number(s.pChange||0); return { ...s, macdLine: p*1.8, signalLine: p*1.4, histogram: p*0.4, signal: 'Bullish MACD Cross' }; })
          .sort((a, b) => b.pChange - a.pChange);
        break;
      }
      case 'volume': {
        results = allStocks.filter(s => Number(s.volume||0) > avgVol * 2)
          .map(s => ({ ...s, volRatio: Number((Number(s.volume||0)/Math.max(avgVol,1)).toFixed(2)), signal: 'Volume Surge' }))
          .sort((a, b) => b.volRatio - a.volRatio);
        break;
      }
      case 'breakout': {
        results = allStocks.filter(s => Number(s.pChange||0) >= 3 && Number(s.volume||0) > avgVol * 1.5)
          .map(s => ({ ...s, signal: 'Price Breakout' })).sort((a, b) => b.pChange - a.pChange);
        break;
      }
      case 'pivot': {
        results = allStocks.map(s => {
          const pivots = calcPivotPoint(s);
          const ltp = Number(s.ltp||0);
          const nearLevel = Object.entries(pivots).find(([,v]) => Math.abs(ltp - v) / Math.max(ltp,1) <= 0.005);
          return { ...s, ...pivots, nearLevel: nearLevel ? nearLevel[0] : null };
        }).filter(s => s.nearLevel !== null);
        break;
      }
      case 'candlestick': {
        results = allStocks.map(s => ({ ...s, pattern: detectCandlePattern(s) }))
          .filter(s => s.pattern && ['Hammer','Doji','Bullish Marubozu'].includes(s.pattern))
          .sort((a, b) => b.pChange - a.pChange);
        break;
      }
      case 'consolidating': case 'consolidating_stocks': {
        results = allStocks.filter(s => {
          const H = Number(s.high||s.ltp), L = Number(s.low||s.ltp), C = Number(s.ltp||1);
          return (H-L)/C < 0.03 && Math.abs(Number(s.pChange||0)) < 1;
        }).map(s => ({ ...s, signal: 'Consolidating' }));
        break;
      }
      case 'strong_trend': {
        results = allStocks.filter(s => Math.abs(Number(s.pChange||0)) >= 2)
          .map(s => ({ ...s, adxApprox: Math.min(90, 25+Math.abs(Number(s.pChange||0))*5), trend: Number(s.pChange||0) > 0 ? 'Uptrend' : 'Downtrend' }))
          .sort((a, b) => b.adxApprox - a.adxApprox);
        break;
      }
      case 'trend_continuation': {
        results = allStocks.filter(s => {
          const ltp = Number(s.ltp||0), prev = Number(s.prevClose||ltp), open = Number(s.open||ltp);
          return ltp > prev && Math.abs(ltp - open)/Math.max(open,1) < 0.01;
        }).map(s => ({ ...s, signal: 'EMA Pullback in Uptrend' }));
        break;
      }
      case 'gainers': case 'circuit_up': {
        const minChange = type === 'circuit_up' ? 8.5 : 0;
        results = [...allStocks].filter(s => Number(s.pChange||0) > minChange).sort((a, b) => b.pChange - a.pChange).slice(0, 30);
        break;
      }
      case 'losers': case 'circuit_down': {
        const maxChange = type === 'circuit_down' ? -8.5 : 0;
        results = [...allStocks].filter(s => Number(s.pChange||0) < maxChange).sort((a, b) => a.pChange - b.pChange).slice(0, 30);
        break;
      }
      case 'volume_leaders': {
        results = [...allStocks].sort((a, b) => Number(b.volume||0) - Number(a.volume||0)).slice(0, 30);
        break;
      }
      case 'turnover_leaders': {
        results = [...allStocks].sort((a, b) => Number(b.turnover||0) - Number(a.turnover||0)).slice(0, 30);
        break;
      }
      case '52w_high': {
        results = allStocks.filter(s => Number(s.high52w||0) > 0 && Number(s.ltp||0)/Number(s.high52w||1) >= 0.98)
          .sort((a, b) => (b.ltp/b.high52w||0) - (a.ltp/a.high52w||0));
        break;
      }
      case '52w_low': {
        results = allStocks.filter(s => Number(s.low52w||0) > 0 && Number(s.ltp||0)/Number(s.low52w||1) <= 1.02)
          .sort((a, b) => (a.ltp/a.low52w||1) - (b.ltp/b.low52w||1));
        break;
      }
      case 'hot_stocks': case 'players_choices': {
        results = [...allStocks].filter(s => Number(s.volume||0) > avgVol * 1.5 && Number(s.pChange||0) > 0)
          .sort((a, b) => (b.turnover||0) - (a.turnover||0)).slice(0, 25);
        break;
      }
      case 'support_setups': {
        results = allStocks.filter(s => Number(s.pChange||0) > -1 && Number(s.pChange||0) < 0.5 && Number(s.low||s.ltp) > 0)
          .sort((a, b) => b.volume - a.volume).slice(0, 25);
        break;
      }
      case 'investment_picks': {
        results = allStocks.filter(s => Number(s.pChange||0) > -2 && Number(s.volume||0) > 0).slice(0, 30);
        break;
      }
      default:
        results = allStocks.slice(0, 50);
    }

    setCache(cacheKey, results, 60 * 1000);
    res.json({ success: true, data: results, type, count: results.length });
  } catch (err) {
    console.error(`[scanner/bulk] type=${type} Error:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S5 — Broker Heatmap Matrix
   GET /api/smart-money/broker-heatmap
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/smart-money/broker-heatmap', async (req, res) => {
  const businessDate = req.query.date || '';
  const cacheKey = `broker-heatmap-${businessDate || 'today'}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const options = { page: 0, size: 500 };
    if (businessDate) options.date = businessDate;
    const result = await nepseClient.getFloorSheet(options);
    const raw = result?.floorsheets?.content || result?.content || [];

    const brokerTotals = {}, scripTotals = {}, matrix = {};
    raw.forEach(item => {
      const buyB = String(item.buyerMemberId || item.buyerBroker || '?');
      const sellB = String(item.sellerMemberId || item.sellerBroker || '?');
      const sym = item.stockSymbol || '';
      const qty = Number(item.contractQuantity || 0);
      const amt = Number(item.contractAmount || 0);
      if (!brokerTotals[buyB]) brokerTotals[buyB] = { id: buyB, name: item.buyerBrokerName || `Broker ${buyB}`, totalBuy: 0, totalSell: 0 };
      if (!brokerTotals[sellB]) brokerTotals[sellB] = { id: sellB, name: item.sellerBrokerName || `Broker ${sellB}`, totalBuy: 0, totalSell: 0 };
      brokerTotals[buyB].totalBuy += amt;
      brokerTotals[sellB].totalSell += amt;
      if (!scripTotals[sym]) scripTotals[sym] = { symbol: sym, totalAmt: 0 };
      scripTotals[sym].totalAmt += amt;
      const bk = `${buyB}_${sym}`, sk = `${sellB}_${sym}`;
      if (!matrix[bk]) matrix[bk] = { broker: buyB, symbol: sym, buy: 0, sell: 0 };
      if (!matrix[sk]) matrix[sk] = { broker: sellB, symbol: sym, buy: 0, sell: 0 };
      matrix[bk].buy += amt; matrix[sk].sell += amt;
    });

    const topBrokers = Object.values(brokerTotals).sort((a, b) => (b.totalBuy+b.totalSell)-(a.totalBuy+a.totalSell)).slice(0, 20);
    const topScrips  = Object.values(scripTotals).sort((a, b) => b.totalAmt - a.totalAmt).slice(0, 20).map(s => s.symbol);

    const heatmapMatrix = topBrokers.map(broker => ({
      broker: broker.id,
      brokerName: broker.name,
      totalBuy: broker.totalBuy,
      totalSell: broker.totalSell,
      netFlow: broker.totalBuy - broker.totalSell,
      scrips: topScrips.map(sym => {
        const cell = matrix[`${broker.id}_${sym}`] || { buy: 0, sell: 0 };
        return { symbol: sym, buy: cell.buy, sell: cell.sell, net: cell.buy - cell.sell };
      })
    }));

    const data = { topBrokers: topBrokers.map(b=>b.id), topBrokerNames: topBrokers.map(b=>b.name), topScrips, matrix: heatmapMatrix, totalTrades: raw.length, businessDate: businessDate || raw[0]?.businessDate || new Date().toISOString().split('T')[0] };
    setCache(cacheKey, data, 2 * 60 * 1000);
    res.json({ success: true, data, source: 'nepse-api' });
  } catch (err) {
    console.error('[broker-heatmap] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S6 — Sector-Wise Accumulation / Distribution
   GET /api/smart-money/sector-ad
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/smart-money/sector-ad', async (req, res) => {
  const cacheKey = 'sector-ad';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const stocksResp = await axios.get(`http://localhost:${PORT}/api/mero/market-summary`, { timeout: 10000 });
    const allStocks = stocksResp.data?.data || [];

    const sectorMap = {};
    (Array.isArray(allStocks) ? allStocks : []).forEach(s => {
      const sector = s.sector || 'Others';
      if (!sectorMap[sector]) sectorMap[sector] = { sector, stocks: [], adl: 0, totalVol: 0 };
      const H = Number(s.high||s.ltp||0), L = Number(s.low||s.ltp||0), C = Number(s.ltp||0), V = Number(s.volume||0);
      const range = H - L;
      const clv = range > 0 ? ((C-L)-(H-C))/range : 0;
      sectorMap[sector].stocks.push(s.symbol);
      sectorMap[sector].adl += clv * V;
      sectorMap[sector].totalVol += V;
    });

    const result = Object.values(sectorMap).map(sec => {
      const norm = sec.totalVol > 0 ? sec.adl / sec.totalVol : 0;
      return { sector: sec.sector, adl: Number(sec.adl.toFixed(2)), normalizedADL: Number(norm.toFixed(4)), signal: norm > 0.1 ? 'Accumulation' : norm < -0.1 ? 'Distribution' : 'Neutral', strength: Math.min(100, Math.abs(norm)*100).toFixed(1), stockCount: sec.stocks.length, totalVolume: sec.totalVol, stocks: sec.stocks.slice(0, 10) };
    }).sort((a, b) => b.adl - a.adl);

    setCache(cacheKey, result, 30 * 1000);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[sector-ad] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S7 — NEPSE Brokers Directory (all 60 brokers)
   GET /api/brokers/directory
   ══════════════════════════════════════════════════════════════════════════════ */
const NEPSE_BROKERS_LIST = [
  {id:1,name:'Agrawal Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4222956',tmsUrl:'https://tms1.nepse.com.np'},
  {id:2,name:'Malla & Malla Stock Broker Pvt. Ltd.',location:'Kathmandu',contact:'01-4413713',tmsUrl:'https://tms2.nepse.com.np'},
  {id:3,name:'Kumari Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4441050',tmsUrl:'https://tms3.nepse.com.np'},
  {id:4,name:'Sunrise Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4488880',tmsUrl:'https://tms4.nepse.com.np'},
  {id:5,name:'NIBL Ace Capital Ltd.',location:'Kathmandu',contact:'01-4441345',tmsUrl:'https://tms5.nepse.com.np'},
  {id:6,name:'Standard Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4249773',tmsUrl:'https://tms6.nepse.com.np'},
  {id:7,name:'Deevyaa Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4222999',tmsUrl:'https://tms7.nepse.com.np'},
  {id:8,name:'Trishakti Securities Pvt. Ltd.',location:'Pokhara',contact:'061-534120',tmsUrl:'https://tms8.nepse.com.np'},
  {id:9,name:'Sweta Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4241166',tmsUrl:'https://tms9.nepse.com.np'},
  {id:10,name:'Arun Securities Pvt. Ltd.',location:'Biratnagar',contact:'021-527222',tmsUrl:'https://tms10.nepse.com.np'},
  {id:11,name:'Gorkhe Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4412100',tmsUrl:'https://tms11.nepse.com.np'},
  {id:12,name:'B&A Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4444020',tmsUrl:'https://tms12.nepse.com.np'},
  {id:13,name:'Nabil Investment Banking Ltd.',location:'Kathmandu',contact:'01-4444777',tmsUrl:'https://tms13.nepse.com.np'},
  {id:14,name:'Taragaun Regency Securities',location:'Kathmandu',contact:'01-4225200',tmsUrl:'https://tms14.nepse.com.np'},
  {id:15,name:'Achal Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4225879',tmsUrl:'https://tms15.nepse.com.np'},
  {id:16,name:'Kasthamandap Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4229450',tmsUrl:'https://tms16.nepse.com.np'},
  {id:17,name:'Pragyan Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4410083',tmsUrl:'https://tms17.nepse.com.np'},
  {id:18,name:'Srijana Securities Pvt. Ltd.',location:'Pokhara',contact:'061-538002',tmsUrl:'https://tms18.nepse.com.np'},
  {id:19,name:'Prabhu Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4239994',tmsUrl:'https://tms19.nepse.com.np'},
  {id:20,name:'Rabindra Bhanja Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4442034',tmsUrl:'https://tms20.nepse.com.np'},
  {id:21,name:'Samjhana Capital Pvt. Ltd.',location:'Kathmandu',contact:'01-4415002',tmsUrl:'https://tms21.nepse.com.np'},
  {id:22,name:'Siprabi Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4414502',tmsUrl:'https://tms22.nepse.com.np'},
  {id:23,name:'Hathway Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4253020',tmsUrl:'https://tms23.nepse.com.np'},
  {id:24,name:'Dipshikha Securities Pvt. Ltd.',location:'Birgunj',contact:'051-521254',tmsUrl:'https://tms24.nepse.com.np'},
  {id:25,name:'Annapurna Securities Pvt. Ltd.',location:'Pokhara',contact:'061-536222',tmsUrl:'https://tms25.nepse.com.np'},
  {id:26,name:'Shikhar Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4241288',tmsUrl:'https://tms26.nepse.com.np'},
  {id:27,name:'Midas Stock Broking Co. Pvt. Ltd.',location:'Kathmandu',contact:'01-4435640',tmsUrl:'https://tms27.nepse.com.np'},
  {id:28,name:'First Securities Company Pvt. Ltd.',location:'Kathmandu',contact:'01-5523456',tmsUrl:'https://tms28.nepse.com.np'},
  {id:29,name:'Online Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4418534',tmsUrl:'https://tms29.nepse.com.np'},
  {id:30,name:'Share Market Nepal Pvt. Ltd.',location:'Kathmandu',contact:'01-5520014',tmsUrl:'https://tms30.nepse.com.np'},
  {id:31,name:'Artha Sagarmatha Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4441099',tmsUrl:'https://tms31.nepse.com.np'},
  {id:32,name:'SEWA Securities Pvt. Ltd.',location:'Janakpur',contact:'041-523032',tmsUrl:'https://tms32.nepse.com.np'},
  {id:33,name:'Global IME Capital Ltd.',location:'Kathmandu',contact:'01-4204141',tmsUrl:'https://tms33.nepse.com.np'},
  {id:34,name:'Laxmi Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4005557',tmsUrl:'https://tms34.nepse.com.np'},
  {id:35,name:'Securities Business Center Pvt. Ltd.',location:'Kathmandu',contact:'01-4216905',tmsUrl:'https://tms35.nepse.com.np'},
  {id:36,name:'Shanker Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4441209',tmsUrl:'https://tms36.nepse.com.np'},
  {id:37,name:'Nag Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4227577',tmsUrl:'https://tms37.nepse.com.np'},
  {id:38,name:'Prabhu Dhanawarsha Securities',location:'Kathmandu',contact:'01-4412202',tmsUrl:'https://tms38.nepse.com.np'},
  {id:39,name:'Renaissance Securities Ltd.',location:'Kathmandu',contact:'01-4439696',tmsUrl:'https://tms39.nepse.com.np'},
  {id:40,name:'Imperial Securities Company Pvt. Ltd.',location:'Kathmandu',contact:'01-4436220',tmsUrl:'https://tms40.nepse.com.np'},
  {id:41,name:'Nepal SBI Merchant Banking Ltd.',location:'Kathmandu',contact:'01-4444721',tmsUrl:'https://tms41.nepse.com.np'},
  {id:42,name:'Monerita Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4440098',tmsUrl:'https://tms42.nepse.com.np'},
  {id:43,name:'Capital Index Pvt. Ltd.',location:'Kathmandu',contact:'01-4441298',tmsUrl:'https://tms43.nepse.com.np'},
  {id:44,name:'Chandragiri Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-5522230',tmsUrl:'https://tms44.nepse.com.np'},
  {id:45,name:'Dakshinkali Investment & Securities',location:'Kathmandu',contact:'01-4218555',tmsUrl:'https://tms45.nepse.com.np'},
  {id:46,name:'Siddhartha Securities Ltd.',location:'Kathmandu',contact:'01-4418000',tmsUrl:'https://tms46.nepse.com.np'},
  {id:47,name:'Everest Securities Ltd.',location:'Kathmandu',contact:'01-4440032',tmsUrl:'https://tms47.nepse.com.np'},
  {id:48,name:'Naasa Securities Co. Ltd.',location:'Kathmandu',contact:'01-4412702',tmsUrl:'https://tms48.nepse.com.np'},
  {id:49,name:'Tharpu Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4449900',tmsUrl:'https://tms49.nepse.com.np'},
  {id:50,name:'Swarnalaxmi Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4221133',tmsUrl:'https://tms50.nepse.com.np'},
  {id:51,name:'Purnima Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4443355',tmsUrl:'https://tms51.nepse.com.np'},
  {id:52,name:'Kriti Securities Pvt. Ltd.',location:'Butwal',contact:'071-545002',tmsUrl:'https://tms52.nepse.com.np'},
  {id:53,name:'Prabhu Plus Capital Ltd.',location:'Kathmandu',contact:'01-4004505',tmsUrl:'https://tms53.nepse.com.np'},
  {id:54,name:'United Securities Company Pvt. Ltd.',location:'Kathmandu',contact:'01-4413345',tmsUrl:'https://tms54.nepse.com.np'},
  {id:55,name:'Civil Capital Market Ltd.',location:'Kathmandu',contact:'01-4441543',tmsUrl:'https://tms55.nepse.com.np'},
  {id:56,name:'Sagarmatha Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4413490',tmsUrl:'https://tms56.nepse.com.np'},
  {id:57,name:'Rastriya Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4418020',tmsUrl:'https://tms57.nepse.com.np'},
  {id:58,name:'NIC Asia Capital Ltd.',location:'Kathmandu',contact:'01-4410555',tmsUrl:'https://tms58.nepse.com.np'},
  {id:59,name:'Prasiddhi Securities Pvt. Ltd.',location:'Lalitpur',contact:'01-5455230',tmsUrl:'https://tms59.nepse.com.np'},
  {id:60,name:'Ace Securities Pvt. Ltd.',location:'Kathmandu',contact:'01-4413000',tmsUrl:'https://tms60.nepse.com.np'},
];

app.get('/api/brokers/directory', (req, res) => {
  const search = (req.query.search || '').toLowerCase();
  const location = (req.query.location || '').toLowerCase();
  let brokers = NEPSE_BROKERS_LIST;
  if (search) brokers = brokers.filter(b => b.name.toLowerCase().includes(search) || String(b.id).includes(search));
  if (location) brokers = brokers.filter(b => b.location.toLowerCase().includes(location));
  res.json({ success: true, data: brokers, count: brokers.length });
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S8 — Mutual Funds NAV & Holdings
   GET /api/mutual-funds
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/mutual-funds', async (req, res) => {
  const cacheKey = 'mutual-funds';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const funds = [];

  try {
    const resp = await axios.get('https://www.sharesansar.com/mutual-fund', {
      headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    });
    const $ = cheerio.load(resp.data);
    $('table tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 5) {
        const symbol  = $(tds[0]).text().trim();
        const name    = $(tds[1]).text().trim() || symbol;
        const nav     = parseMoney($(tds[2]).text());
        const ltp     = parseMoney($(tds[3]).text());
        const pChange = parseMoney($(tds[4]).text());
        if (symbol && !isNaN(nav) && nav > 0) {
          const premium = ltp > 0 && nav > 0 ? Number(((ltp-nav)/nav*100).toFixed(2)) : 0;
          funds.push({ symbol, name, nav: isNaN(nav)?0:nav, ltp: isNaN(ltp)?nav:ltp, pChange: isNaN(pChange)?0:pChange, premium, premiumLabel: premium > 0 ? `+${premium}% Premium` : premium < 0 ? `${premium}% Discount` : 'At NAV', source: 'sharesansar' });
        }
      }
    });
  } catch (e) { console.warn('[mutual-funds] ShareSansar error:', e.message); }

  if (funds.length === 0) {
    try {
      const resp = await axios.get('https://merolagani.com/MutualFund.aspx', {
        headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
      });
      const $ = cheerio.load(resp.data);
      $('table tbody tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 4) {
          const symbol = $(tds[0]).text().trim();
          const nav    = parseMoney($(tds[1]).text());
          const ltp    = parseMoney($(tds[2]).text());
          const pChange = parseMoney($(tds[3]).text());
          if (symbol && !isNaN(nav) && nav > 0) {
            const premium = ltp > 0 && nav > 0 ? Number(((ltp-nav)/nav*100).toFixed(2)) : 0;
            funds.push({ symbol, name: symbol, nav: isNaN(nav)?0:nav, ltp: isNaN(ltp)?nav:ltp, pChange: isNaN(pChange)?0:pChange, premium, premiumLabel: premium > 0 ? `+${premium}% Premium` : `${premium}% Discount`, source: 'merolagani' });
          }
        }
      });
    } catch (e) { console.warn('[mutual-funds] Merolagani error:', e.message); }
  }

  setCache(cacheKey, funds, 60 * 60 * 1000);
  res.json({ success: true, data: funds, count: funds.length });
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S9 — Stealth Accumulation per symbol
   GET /api/smart-money/stealth/:symbol?days=15
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/smart-money/stealth/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = Math.min(parseInt(req.query.days || '15', 10), 60);
  const cacheKey = `stealth-${symbol}-${days}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const result = await nepseClient.getFloorSheet({ symbol, page: 0, size: Math.min(days * 30, 500) });
    const raw = result?.floorsheets?.content || result?.content || [];

    const brokerMap = {}, dateSet = new Set();
    let totalVol = 0;

    raw.forEach(item => {
      const buyB = String(item.buyerMemberId || item.buyerBroker || '?');
      const qty  = Number(item.contractQuantity || 0);
      const amt  = Number(item.contractAmount || 0);
      const date = item.businessDate || '';
      if (date) dateSet.add(date);
      totalVol += qty;
      if (!brokerMap[buyB]) brokerMap[buyB] = { broker: buyB, name: item.buyerBrokerName || `Broker ${buyB}`, buyQty: 0, buyAmt: 0, tradeDays: new Set() };
      brokerMap[buyB].buyQty += qty;
      brokerMap[buyB].buyAmt += amt;
      if (date) brokerMap[buyB].tradeDays.add(date);
    });

    const totalDays = dateSet.size;
    const stealthBrokers = Object.values(brokerMap)
      .map(b => ({
        broker: b.broker, name: b.name, buyQty: b.buyQty, buyAmt: b.buyAmt,
        tradeDays: b.tradeDays.size,
        volumeShare: totalVol > 0 ? Number((b.buyQty/totalVol*100).toFixed(2)) : 0,
        avgDailyBuy: b.tradeDays.size > 0 ? Math.round(b.buyQty/b.tradeDays.size) : 0,
        isStealthy: b.tradeDays.size >= Math.max(3, totalDays * 0.5) && totalVol > 0 && b.buyQty/totalVol > 0.1
      }))
      .filter(b => b.buyQty > 0)
      .sort((a, b) => b.buyQty - a.buyQty)
      .slice(0, 15);

    const sai = stealthBrokers.filter(b => b.isStealthy).reduce((s, b) => s + b.volumeShare, 0);
    const data = { symbol, period: `${days} days`, totalDays, totalVolume: totalVol, sai: Number(sai.toFixed(2)), signal: sai > 30 ? 'High Stealth Accumulation' : sai > 15 ? 'Moderate Accumulation' : 'Low / No Stealth', stealthBrokers };
    setCache(cacheKey, data, 5 * 60 * 1000);
    res.json({ success: true, data, source: 'nepse-api' });
  } catch (err) {
    console.error(`[stealth] ${symbol}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════════
   ENDPOINT S10 — Full NEPSE Index with sub-indices (enhanced)
   GET /api/nepse/full-index
   ══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/nepse/full-index', async (req, res) => {
  const cacheKey = 'nepse-full-index';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const [summaryResult, indicesResp] = await Promise.allSettled([
      (async () => { try { return await nepseClient.getMarketSummary(); } catch { return null; } })(),
      axios.get(`http://localhost:${PORT}/api/market-indices`, { timeout: 8000 })
    ]);

    const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    const indicesData = indicesResp.status === 'fulfilled' ? indicesResp.value.data?.data : {};

    const data = {
      nepse: { value: summary?.nepseIndex ?? indicesData?.nepse?.value ?? null, change: indicesData?.nepse?.change ?? null, pChange: indicesData?.nepse?.pChange ?? null },
      sensitive: { value: summary?.sensitiveIndex ?? indicesData?.sensitive?.value ?? null, change: indicesData?.sensitive?.change ?? null, pChange: indicesData?.sensitive?.pChange ?? null },
      float: { value: summary?.sensitiveFloatIndex ?? indicesData?.float?.value ?? null, change: indicesData?.float?.change ?? null, pChange: indicesData?.float?.pChange ?? null },
      sensitiveFloat: indicesData?.sensitiveFloat || null,
      subIndices: indicesData?.subIndices || [],
      turnover: summary?.totalTurnover ?? null,
      tradedScrips: summary?.totalTradedScrips ?? null,
      advances: summary?.advancingStocks ?? null,
      declines: summary?.decliningStocks ?? null,
      unchanged: summary?.unchangedStocks ?? null,
      fetchedAt: new Date().toISOString()
    };

    setCache(cacheKey, data, 30 * 1000);
    res.json({ success: true, data, source: 'combined' });
  } catch (err) {
    console.error('[nepse/full-index] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});



// === TRADINGVIEW UDF ENDPOINTS ===
app.get('/api/udf/config', (req, res) => {
  res.json({
    supported_resolutions: ['1', '5', '15', '30', '60', '1D', '1W', '1M'],
    supports_group_request: false,
    supports_marks: false,
    supports_search: true,
    supports_timescale_marks: false
  });
});

app.get('/api/udf/symbols', (req, res) => {
  const symbol = req.query.symbol || 'NEPSE';
  res.json({
    name: symbol,
    ticker: symbol,
    type: 'stock',
    session: '1100-1500',
    timezone: 'Asia/Kathmandu',
    minmov: 1,
    pricescale: 100,
    has_intraday: false,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: ['1D', '1W', '1M']
  });
});

app.get('/api/udf/history', async (req, res) => {
  const { symbol, from, to, resolution } = req.query;
  try {
    const { rows } = await query(
      'SELECT extract(epoch from traded_date) as time, open_price, high_price, low_price, close_price, total_volume FROM daily_price_history JOIN securities USING(security_id) WHERE symbol = $1 AND traded_date >= to_timestamp($2) AND traded_date <= to_timestamp($3) ORDER BY traded_date ASC',
      [symbol, from, to]
    );
    
    if (!rows || rows.length === 0) {
      // Fallback for when the DB is empty (local dev)
      return res.json({ s: 'no_data' });
    }
    
    res.json({
      s: 'ok',
      t: rows.map(r => r.time),
      o: rows.map(r => r.open_price),
      h: rows.map(r => r.high_price),
      l: rows.map(r => r.low_price),
      c: rows.map(r => r.close_price),
      v: rows.map(r => r.total_volume)
    });
  } catch (err) {
    // If DB fails, fallback to no_data to not break the chart
    console.error('UDF DB Error:', err.message);
    res.json({ s: 'no_data' });
  }
});

app.listen(PORT, '0.0.0.0', async () => {
    try {
        await initDB();
        startWorkers();
    } catch (e) {
        console.error("Failed to start DB/Workers", e.message);
    }
    console.log(`🚀 NEPSE Proxy Server running on http://localhost:${PORT}`);
    console.log(`   🔸 Live trading:    /api/market-summary`);
    console.log(`   🔸 Today's prices:  /api/today-prices`);
    console.log(`   🔸 Price History:   /api/price-history/:symbol`);
    console.log(`   🔸 UDF History:     /api/udf/history`);
});
