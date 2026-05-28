const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// Allow all origins — required for cloud deployment (Render/Railway)
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 5000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Cache-Control': 'no-cache',
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
  return parseFloat(str.replace(/,/g, '').trim());
};

/* ═══════════════════════════════════════════════════
   ENDPOINT 1 — Live Trading (market hours only)
   Source: https://www.sharesansar.com/live-trading
   ═══════════════════════════════════════════════════ */
app.get('/api/market-summary', async (req, res) => {
  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 12000
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

    if (stocks.length === 0) {
      return res.status(200).json({ success: false, message: 'No live trading data — market may be closed.', stocks: [] });
    }

    res.json({ success: true, data: stocks, source: 'live' });
  } catch (error) {
    console.error('[live-trading] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch live data.', error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 2 — Today's / Last Closing Prices
   Source: https://www.sharesansar.com/today-share-price
   Available even AFTER market close — shows last session data
   ═══════════════════════════════════════════════════ */
app.get('/api/today-prices', async (req, res) => {
  try {
    const response = await axios.get('https://www.sharesansar.com/today-share-price', {
      headers: HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const stocks = [];

    // ShareSansar today-share-price table columns:
    // SN | Symbol | Conf | Open | High | Low | Close | VWAP | Volume | PrevClose | Turnover | Trans | Diff | Range | %Diff
    const tableRows = $('table#headFixed tbody tr, table.table tbody tr, table tbody tr');

    tableRows.each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 9) {
        const symbol    = $(tds[1]).text().trim();
        const open      = parseMoney($(tds[3]).text());
        const high      = parseMoney($(tds[4]).text());
        const low       = parseMoney($(tds[5]).text());
        const ltp       = parseMoney($(tds[7]).text());  // LTP
        const volume    = parseMoney($(tds[11]).text());
        const prevClose = parseMoney($(tds[12]).text());
        const turnover  = parseMoney($(tds[13]).text());
        const pChange   = parseMoney($(tds[17]).text()); // Diff %

        if (symbol && !isNaN(ltp) && ltp > 0) {
          const change = isNaN(prevClose) || prevClose === 0 ? 0 : ltp - prevClose;
          const pc     = isNaN(pChange) ? (isNaN(prevClose) || prevClose === 0 ? 0 : (change / prevClose) * 100) : pChange;

          stocks.push({
            symbol,
            name: symbol,
            ltp,
            change:    Number(change.toFixed(2)),
            pChange:   Number(pc.toFixed(2)),
            open:      isNaN(open)   ? ltp : open,
            high:      isNaN(high)   ? ltp : high,
            low:       isNaN(low)    ? ltp : low,
            prevClose: isNaN(prevClose) ? ltp : prevClose,
            volume:    isNaN(volume)   ? 0   : volume,
            turnover:  isNaN(turnover) ? 0   : turnover,
            rsi:  calcRSI(pc),
            macd: calcMACD(pc),
            sector: 'Unknown',
            source: 'closing'
          });
        }
      }
    });

    if (stocks.length === 0) {
      return res.status(200).json({ success: false, message: 'Could not parse today\'s price table.', stocks: [] });
    }

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
  // NEPSE market hours: Sun-Thu, 11:00 – 15:00 NPT (UTC+5:45)
  const now = new Date();
  const nptOffset = 5 * 60 + 45; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nptMinutes = (utcMinutes + nptOffset) % (24 * 60);
  const nptDay = (now.getUTCDay() + Math.floor((utcMinutes + nptOffset) / (24 * 60))) % 7;

  // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const isWeekday = nptDay >= 0 && nptDay <= 4;
  const isMarketHours = nptMinutes >= 11 * 60 && nptMinutes < 15 * 60;
  const isOpen = isWeekday && isMarketHours;

  res.json({
    isOpen,
    nptTime: `${String(Math.floor(nptMinutes / 60)).padStart(2, '0')}:${String(nptMinutes % 60).padStart(2, '0')}`,
    nptDay,
    message: isOpen ? 'Market is OPEN' : 'Market is CLOSED'
  });
});

/* ═══════════════════════════════════════════════════
   ENDPOINT 4 — Market Indices (Real NEPSE Index)
   Source: https://www.sharesansar.com/market
   ═══════════════════════════════════════════════════ */
app.get('/api/market-indices', async (req, res) => {
  try {
    const response = await axios.get('https://www.sharesansar.com/market', {
      headers: HEADERS,
      timeout: 12000
    });

    const $ = cheerio.load(response.data);
    const indices = {};

    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 7) {
        const name = $(tds[0]).text().trim().toUpperCase();
        
        const value = parseMoney($(tds[4]).text());
        const change = parseMoney($(tds[5]).text());
        const pChange = parseMoney($(tds[6]).text());

        if (!isNaN(value)) {
          if (name === 'NEPSE INDEX') {
            indices.nepse = { value, change, pChange };
          } else if (name === 'FLOAT INDEX') {
            indices.float = { value, change, pChange };
          } else if (name === 'SENSITIVE INDEX') {
            indices.sensitive = { value, change, pChange };
          }
        }
      }
    });

    if (Object.keys(indices).length === 0) {
      return res.status(200).json({ success: false, message: 'No indices found.' });
    }

    res.json({ success: true, data: indices });
  } catch (error) {
    console.error('[market-indices] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch indices.', error: error.message });
  }
});

/* ═══════════════════════════════════════════════════
   MEROSHARE ENDPOINTS — Proxy to backend.cdsc.com.np
   These run server-side to bypass browser CORS limits.
   Uses tough-cookie for proper F5 BIG-IP WAF session handling.
   ═══════════════════════════════════════════════════ */

const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';

// Dynamically load ESM cookie jar libraries on demand to prevent ERR_REQUIRE_ESM
let toughCookieModule = null;
let cookieJarSupportModule = null;

const createMeroShareSession = async () => {
  if (!toughCookieModule) {
    toughCookieModule = await import('tough-cookie');
  }
  if (!cookieJarSupportModule) {
    cookieJarSupportModule = await import('axios-cookiejar-support');
  }

  const jar = new toughCookieModule.CookieJar();
  const client = cookieJarSupportModule.wrapper(axios.create({
    jar,
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
  if (!response || !response.data) return false;
  if (typeof response.data === 'string' && response.data.includes('Request Rejected')) return true;
  return false;
};

// Prime the session: hit the capital endpoint to acquire WAF cookies in the jar
const primeSession = async (client) => {
  // First hit the main MeroShare page to get initial WAF challenge cookies
  try {
    await client.get('https://meroshare.cdsc.com.np/', {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (e) {
    // Ignore — some WAFs return non-2xx on first hit but still set cookies
    console.log('[meroshare/prime] Homepage hit:', e.message);
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
  try {
    const client = await createMeroShareSession();
    const response = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked the request. Please try again.' });
    }
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
    const token = response.data?.token || response.data?.accessToken || (authHeaderKey ? response.headers[authHeaderKey] : null);

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
    if (typeof error.response?.data === 'string' && error.response.data.includes('Request Rejected')) {
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
  try {
    const client = await createMeroShareSession();
    await primeSession(client);

    const payload = {
      clientCode: clientCode || (demat ? demat.substring(0, 8) : ""),
      demat: demat ? [demat] : [],
      page: 1,
      size: 500,
      sortBy: "script",
      sortAsc: true
    };

    const response = await client.post('https://backend.cdsc.com.np/api/meroShareView/myPortfolio/', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(response)) {
      return res.status(503).json({ success: false, message: 'MeroShare WAF blocked portfolio request.' });
    }

    console.log('[meroshare/portfolio] Fetched portfolio successfully.');
    res.json({ success: true, data: response.data });
  } catch (error) {
    const status = error.response?.status;
    let msg = error.response?.data?.message || error.response?.data || error.message;
    if (typeof msg === 'string' && msg.includes('Request Rejected')) {
      msg = 'MeroShare security firewall blocked the request. Please try again.';
    }
    console.error('[meroshare/portfolio] Error:', status, msg);
    res.status(status || 500).json({ success: false, message: msg || 'Failed to fetch portfolio.', status });
  }
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
    res.json({ success: true, data: response.data?.body || response.data });
  } catch (error) {
    console.error('[ipo-result/companies] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch IPO companies' });
  }
});

/* ENDPOINT 11 — Check IPO Result */
app.post('/api/ipo-result/check', async (req, res) => {
  const { companyShareId, boid } = req.body;
  try {
    const response = await axios.post('https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check', {
      companyShareId,
      boid
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://iporesult.cdsc.com.np',
        'Referer': 'https://iporesult.cdsc.com.np/',
      }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    if (error.response && error.response.data) {
      return res.json({ success: true, data: error.response.data });
    }
    console.error('[ipo-result/check] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to check IPO result' });
  }
});

// Vercel Serverless Function - app.listen is removed

module.exports = app;
