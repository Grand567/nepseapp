import { initializeMarket, calculateIndices as calcIndicesMock } from './mockData';
import stockMap from './stockmap.json';

/**
 * Returns the configured proxy base URL.
 * Priority: VITE_PROXY_URL env var → http://localhost:5000 fallback
 */
export const getProxyBase = () => {
  const envUrl = import.meta.env.VITE_PROXY_URL;
  return (envUrl && envUrl.trim()) ? envUrl.trim().replace(/\/$/, '') : 'http://localhost:5000';
};

/* ─────────────────────────────────────────────────────────────────────────────
   CLIENT-SIDE CORS PROXY — fetches ShareSansar directly from the browser.
   Used as Layer 0 (before the local proxy server) so live data works on
   Android / any device without running the proxy server.
   ───────────────────────────────────────────────────────────────────────────── */

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const parseMoney = (str) => {
  if (!str) return NaN;
  return parseFloat(str.replace(/,/g, '').trim());
};

const calcRSI = (pChange) => {
  let base = 50;
  if (pChange > 0) base += Math.min(25, pChange * 5);
  if (pChange < 0) base -= Math.min(25, Math.abs(pChange) * 5);
  return Math.max(10, Math.min(90, base));
};

const calcMACD = (pChange) => ({
  line: pChange * 2,
  signal: pChange * 1.5,
  histogram: pChange * 0.5,
});

/**
 * Layer 0A — Fetches LIVE trading data directly from ShareSansar via CORS proxy.
 * Works on any device without running a proxy server.
 */
const fetchLiveTradingDirect = async () => {
  const url = encodeURIComponent('https://www.sharesansar.com/live-trading');
  const res = await fetch(`${CORS_PROXY}${url}`, { signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const stocks = [];

  doc.querySelectorAll('table tbody tr').forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 10) {
      const symbol  = tds[1]?.textContent.trim();
      const ltp     = parseMoney(tds[2]?.textContent);
      const change  = parseMoney(tds[3]?.textContent);
      const pChange = parseMoney(tds[4]?.textContent);
      const open    = parseMoney(tds[5]?.textContent);
      const high    = parseMoney(tds[6]?.textContent);
      const low     = parseMoney(tds[7]?.textContent);
      const volume  = parseMoney(tds[8]?.textContent);

      if (symbol && !isNaN(ltp)) {
        stocks.push({
          symbol, name: symbol, ltp,
          change:  isNaN(change)  ? 0   : change,
          pChange: isNaN(pChange) ? 0   : pChange,
          open:    isNaN(open)    ? ltp : open,
          high:    isNaN(high)    ? ltp : high,
          low:     isNaN(low)     ? ltp : low,
          volume:  isNaN(volume)  ? 0   : volume,
          rsi:  calcRSI(isNaN(pChange) ? 0 : pChange),
          macd: calcMACD(isNaN(pChange) ? 0 : pChange),
          sector: 'Unknown', source: 'live',
        });
      }
    }
  });

  if (stocks.length === 0) throw new Error('No live trading rows found (market may be closed)');
  return stocks;
};

/**
 * Layer 0B — Fetches TODAY's closing prices directly from ShareSansar via CORS proxy.
 */
const fetchTodayPricesDirect = async () => {
  const url = encodeURIComponent('https://www.sharesansar.com/today-share-price');
  const res = await fetch(`${CORS_PROXY}${url}`, { signal: AbortSignal.timeout(16000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const stocks = [];

  const tableRows = doc.querySelectorAll('table#headFixed tbody tr, table.table tbody tr, table tbody tr');
  tableRows.forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 9) {
      const symbol    = tds[1]?.textContent.trim();
      const open      = parseMoney(tds[3]?.textContent);
      const high      = parseMoney(tds[4]?.textContent);
      const low       = parseMoney(tds[5]?.textContent);
      const ltp       = parseMoney(tds[7]?.textContent);
      const volume    = parseMoney(tds[11]?.textContent);
      const prevClose = parseMoney(tds[12]?.textContent);
      const turnover  = parseMoney(tds[13]?.textContent);
      const pChange   = parseMoney(tds[17]?.textContent);

      if (symbol && !isNaN(ltp) && ltp > 0) {
        const change = isNaN(prevClose) || prevClose === 0 ? 0 : ltp - prevClose;
        const pc     = isNaN(pChange)
          ? (isNaN(prevClose) || prevClose === 0 ? 0 : (change / prevClose) * 100)
          : pChange;

        stocks.push({
          symbol, name: symbol, ltp,
          change:    Number(change.toFixed(2)),
          pChange:   Number(pc.toFixed(2)),
          open:      isNaN(open)      ? ltp : open,
          high:      isNaN(high)      ? ltp : high,
          low:       isNaN(low)       ? ltp : low,
          prevClose: isNaN(prevClose) ? ltp : prevClose,
          volume:    isNaN(volume)    ? 0   : volume,
          turnover:  isNaN(turnover)  ? 0   : turnover,
          rsi:  calcRSI(pc),
          macd: calcMACD(pc),
          sector: 'Unknown', source: 'closing',
        });
      }
    }
  });

  if (stocks.length === 0) throw new Error('No closing price rows found');
  return stocks;
};

/**
 * Fetches real market data with a 4-layer fallback:
 *   0. Direct browser fetch via CORS proxy (works on Android, no server needed)
 *   1. Local proxy server – live trading endpoint
 *   2. Local proxy server – closing prices endpoint
 *   3. Returns null → caller falls back to simulated mock data
 *
 * Returns: { data: Stock[], source: 'live' | 'closing' | null }
 */
export const fetchLiveMarketData = async () => {
  // ── Layer 0: Direct browser fetch (no proxy server required) ──
  try {
    const stocks = await fetchLiveTradingDirect();
    console.log(`[NEPSE] 🌐 Direct live data loaded — ${stocks.length} stocks`);
    return { data: stocks, source: 'live' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 live failed:', e.message);
  }

  try {
    const stocks = await fetchTodayPricesDirect();
    console.log(`[NEPSE] 🌐 Direct closing data loaded — ${stocks.length} stocks`);
    return { data: stocks, source: 'closing' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 closing failed:', e.message);
  }

  const base = getProxyBase();

  // ── Layer 1: Local proxy — live trading ──
  try {
    const res  = await fetch(`${base}/api/market-summary`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(`[NEPSE] ✅ Proxy live data loaded — ${json.data.length} stocks`);
      return { data: json.data, source: 'live' };
    }
  } catch (_) { /* proxy not running or timed out */ }

  // ── Layer 2: Local proxy — closing prices ──
  try {
    const res  = await fetch(`${base}/api/today-prices`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(`[NEPSE] 📅 Proxy closing data loaded — ${json.data.length} stocks`);
      return { data: json.data, source: 'closing' };
    }
  } catch (_) { /* proxy not running or scrape failed */ }

  // ── Layer 3: No real data available ──
  console.warn('[NEPSE] ⚠️  No live or closing data available. Using simulated data.');
  return null;
};

/**
 * Checks the market status.
 * Tries the proxy; falls back to a local calculation based on NPT time.
 */
export const fetchMarketStatus = async () => {
  const base = getProxyBase();
  try {
    const res  = await fetch(`${base}/api/status`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    return json;
  } catch (_) {
    // Compute locally if proxy is down
    const now = new Date();
    let nptDay, nptMins;
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
      nptMins = hour * 60 + minute;
    } catch (e) {
      // Fallback to manual offset if Intl is unsupported
      const nptOffset = 5 * 60 + 45;
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      nptMins = (utcMins + nptOffset) % (24 * 60);
      nptDay = (now.getUTCDay() + Math.floor((utcMins + nptOffset) / (24 * 60))) % 7;
    }
    
    const isWeekday  = nptDay >= 0 && nptDay <= 4; // Sun(0)–Thu(4)
    const isOpen     = isWeekday && nptMins >= 11 * 60 && nptMins < 15 * 60;
    const hh = String(Math.floor(nptMins / 60)).padStart(2, '0');
    const mm = String(nptMins % 60).padStart(2, '0');
    return { isOpen, nptTime: `${hh}:${mm}`, message: isOpen ? 'Market is OPEN' : 'Market is CLOSED' };
  }
};

/**
 * Fetches real market indices.
 * Also tries a direct client-side fetch before hitting the local proxy.
 */
export const fetchMarketIndices = async () => {
  // Try direct client-side fetch first
  try {
    const url = encodeURIComponent('https://www.sharesansar.com/market');
    const res = await fetch(`${CORS_PROXY}${url}`, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const indices = {};

      doc.querySelectorAll('table tbody tr').forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 7) {
          const name    = tds[0]?.textContent.trim().toUpperCase();
          const value   = parseMoney(tds[4]?.textContent);
          const change  = parseMoney(tds[5]?.textContent);
          const pChange = parseMoney(tds[6]?.textContent);
          if (!isNaN(value)) {
            if (name === 'NEPSE INDEX')     indices.nepse     = { value, change, pChange };
            if (name === 'FLOAT INDEX')     indices.float     = { value, change, pChange };
            if (name === 'SENSITIVE INDEX') indices.sensitive = { value, change, pChange };
          }
        }
      });

      if (Object.keys(indices).length > 0) return indices;
    }
  } catch (_) {}

  // Fall back to local proxy
  const base = getProxyBase();
  try {
    const res  = await fetch(`${base}/api/market-indices`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data) return json.data;
  } catch (_) {}
  return null;
};

/**
 * Merges scraped real-market rows on top of the full mock database.
 */
export const mergeWithMockData = (scrapedStocks, mockStocks) => {
  const mockMap = {};
  mockStocks.forEach(mock => { mockMap[mock.symbol] = mock; });

  const merged = scrapedStocks.map(scraped => {
    const mock = mockMap[scraped.symbol];

    if (mock) {
      mock.processed = true;
      const ltp      = scraped.ltp;
      const change   = scraped.change;
      const pChange  = scraped.pChange;
      const pe       = mock.eps > 0 ? Number((ltp / mock.eps).toFixed(2)) : 0;
      const pb       = mock.bookValue > 0 ? Number((ltp / mock.bookValue).toFixed(2)) : 0;
      const marketCap = Number((ltp * mock.listedShares).toFixed(2));

      return {
        ...mock, ltp, change, pChange,
        open:      scraped.open    || ltp,
        high:      scraped.high    || ltp,
        low:       scraped.low     || ltp,
        prevClose: scraped.prevClose || mock.basePrice,
        volume:    scraped.volume  || mock.volume,
        turnover:  scraped.turnover || 0,
        rsi:       scraped.rsi    || mock.rsi,
        macd:      scraped.macd   || mock.macd,
        pe, pb, marketCap,
        high52w: Math.max(mock.high52w, ltp),
        low52w:  Math.min(mock.low52w,  ltp),
        source:  scraped.source || 'merged',
      };
    } else {
      return {
        ...scraped,
        name: stockMap[scraped.symbol]?.name || scraped.symbol,
        eps: 0, pe: 0, bookValue: 0, pb: 0,
        sector: stockMap[scraped.symbol]?.sector || 'Others',
        listedShares: 1000000,
        marketCap: Number((scraped.ltp * 1000000).toFixed(2)),
        high52w: scraped.high || scraped.ltp,
        low52w:  scraped.low  || scraped.ltp,
        source: scraped.source || 'live',
      };
    }
  });

  mockStocks.forEach(mock => {
    if (!mock.processed) {
      merged.push(mock);
    } else {
      delete mock.processed;
    }
  });

  return merged;
};

/**
 * Recalculates NEPSE, Float, and Sensitive indices from merged stock array.
 */
export const calculateIndices = (stocks) => {
  if (!stocks || stocks.length === 0) {
    return {
      nepse:     { value: 2000, change: 0, pChange: 0 },
      float:     { value: 120,  change: 0, pChange: 0 },
      sensitive: { value: 380,  change: 0, pChange: 0 },
    };
  }

  let totalCap = 0, baseCap = 0;
  stocks.forEach(s => {
    totalCap += (s.ltp       || s.basePrice) * (s.listedShares || 1);
    baseCap  += (s.basePrice || s.ltp)       * (s.listedShares || 1);
  });

  const ratio     = baseCap > 0 ? totalCap / baseCap : 1;
  const nepse     = Number((2000 * ratio).toFixed(2));
  const floatIdx  = Number((120  * ratio).toFixed(2));
  const sensitive = Number((380  * ratio).toFixed(2));

  return {
    nepse:     { value: nepse,    change: Number((nepse    - 2000).toFixed(2)), pChange: Number(((nepse    - 2000) / 2000 * 100).toFixed(2)) },
    float:     { value: floatIdx, change: Number((floatIdx - 120 ).toFixed(2)), pChange: Number(((floatIdx - 120)  / 120  * 100).toFixed(2)) },
    sensitive: { value: sensitive,change: Number((sensitive- 380 ).toFixed(2)), pChange: Number(((sensitive- 380)  / 380  * 100).toFixed(2)) },
  };
};
