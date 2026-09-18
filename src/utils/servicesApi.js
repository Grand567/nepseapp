import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { idbGet, idbSet, idbDel } from './indexedDb.js';
import { fetchMerolaganiNews } from '../services/merolaganiNewsService.js';
import { sortNewsByNepseImpact, deduplicateNews, sortNews } from './newsImpactScorer.js';

const getProxy = () => {
  try {
    const env = import.meta?.env?.VITE_PROXY_URL;
    if (env && env.trim()) return env.trim().replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nepse_proxy_base') || localStorage.getItem('proxy_base');
      if (stored && stored.startsWith('http')) return stored.replace(/\/$/, '');
      const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
      if (!isNative && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return 'http://localhost:5000';
      }
    }
    return 'https://nepseapp.onrender.com';
  } catch {
    return 'https://nepseapp.onrender.com';
  }
};

const PROXY = getProxy();

// Simple in-memory TTL cache backed by IndexedDB
const _cache = new Map();
const _getCache = (key) => { const item = _cache.get(key); if (item && item.expiresAt > Date.now()) return item.data; _cache.delete(key); return null; };
const _setCache = (key, data, ttlMs = 60000) => { _cache.set(key, { data, expiresAt: Date.now() + ttlMs }); };

const _proxyFetch = async (path, options = {}, ttlMs = 60000, forceRefresh = false) => {
  const cacheKey = path + (options.body ? JSON.stringify(options.body) : '');
  const isIntradayOrLive = path.includes('intraday-graph') || path.includes('market-indices') || path.includes('/indices');
  
  if (forceRefresh) {
    _cache.delete(cacheKey);
    idbDel(cacheKey).catch(() => {});
  } else {
    // 1. Fast in-memory cache check
    const cached = _getCache(cacheKey);
    if (cached !== null) return cached;

    // 2. Fast IndexedDB persistent cache check (only for non-intraday or when explicitly enabled)
    if (!isIntradayOrLive) {
      try {
        const idbCached = await idbGet(cacheKey, false);
        if (idbCached !== null) {
          _setCache(cacheKey, idbCached, ttlMs);
          return idbCached;
        }
      } catch (_) {}
    }
  }

  // Dynamic persistent TTL: intraday/live data expires in 30s max; news/reports up to 10-15 mins
  const idbTtl = isIntradayOrLive
    ? Math.min(ttlMs, 30 * 1000)
    : (ttlMs <= 360000 ? Math.max(ttlMs, 10 * 60 * 1000) : Math.min(ttlMs, 24 * 3600 * 1000));

  try {
    const url = PROXY + path;
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const res = await CapacitorHttp.request({
        url,
        method: options.body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(forceRefresh ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {}),
          ...(options.headers || {})
        },
        data: options.body || undefined,
        connectTimeout: options.timeout || 25000,
        readTimeout: options.timeout || 25000
      });
      if (res.status >= 200 && res.status < 300) {
        const json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (json && json.success !== false) {
          const data = json.data ?? json.results ?? json;
          _setCache(cacheKey, data, ttlMs);
          idbSet(cacheKey, data, idbTtl).catch(() => {});
          return data;
        }
      }
      // If network status fails, try stale IndexedDB cache for offline mode
      const stale = await idbGet(cacheKey, true);
      if (stale !== null) return stale;
      return null;
    }

    const method = options.body ? 'POST' : 'GET';
    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(forceRefresh ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {}),
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout || 25000),
    });
    if (!resp.ok) {
      const stale = await idbGet(cacheKey, true);
      if (stale !== null) return stale;
      return null;
    }
    const json = await resp.json();
    if (json.success === false) {
      const stale = await idbGet(cacheKey, true);
      if (stale !== null) return stale;
      return null;
    }
    const data = json.data ?? json.results ?? json;
    _setCache(cacheKey, data, ttlMs);
    idbSet(cacheKey, data, idbTtl).catch(() => {});
    return data;
  } catch (err) {
    console.warn('[servicesApi] Request failed:', path, err.message);
    // Offline resilience: provide cached data from IndexedDB
    try {
      const stale = await idbGet(cacheKey, true);
      if (stale !== null) return stale;
    } catch (_) {}
    return null;
  }
};

export const fetchLiveStocks = () => _proxyFetch('/api/market-summary', {}, 15000);
export const fetchFullIndex = () => _proxyFetch('/api/nepse/full-index', {}, 30000);
export const fetchMarketIndices = () => _proxyFetch('/api/market-indices', {}, 30000);
export const fetchTodayPrices = () => _proxyFetch('/api/today-prices', {}, 30000);

export const fetchFloorsheet = (symbol, page, size, date) => {
  const p = page || 1, s = size || 25;
  const params = 'page=' + p + '&size=' + s + (date ? '&date=' + date : '');
  const path = symbol ? '/api/floorsheet/' + symbol + '?' + params : '/api/floorsheet?' + params;
  return _proxyFetch(path, {}, 300000);
};

export const fetchPriceHistory = (symbol, length) => _proxyFetch('/api/price-history/' + symbol + '?length=' + (length || 365), {}, 7200000);

export const fetchNepseIntradayGraph = async (symbol, forceRefresh = false) => {
  const sym = (!symbol || symbol === 'NEPSE Index' || symbol === 'nepse' || symbol === 'NEPSE')
    ? 'NEPSE'
    : String(symbol).toUpperCase().trim();

  // Tier 1: Query proxy intraday route (supports NEPSE, sub-indices, and equities)
  const path = sym === 'NEPSE' ? '/api/nepse/intraday-graph' : `/api/nepse/intraday-graph/${encodeURIComponent(sym)}`;
  const res = await _proxyFetch(path, {}, 15000, forceRefresh);
  const data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
  const hasTicks = Array.isArray(data) && data.length > 1 && data.some(d => d && (d.timestamp || d.time || Array.isArray(d)));
  if (hasTicks) {
    return data;
  }

  // Tier 2: For individual stocks, fall back to today's floorsheet transaction timeline
  if (sym !== 'NEPSE') {
    try {
      const fsRes = await fetchFloorsheet(sym, 1, 100);
      const rows = Array.isArray(fsRes) ? fsRes : (fsRes?.rows || fsRes?.data?.rows || fsRes?.data || []);
      if (rows && Array.isArray(rows) && rows.length > 0) {
        const trades = rows.map(tr => {
          let tStr = tr.tradeTime || tr.businessDate || '';
          if (tStr && !tStr.includes('+') && !tStr.endsWith('Z')) {
            tStr += '+05:45';
          }
          const d = new Date(tStr);
          const ts = !isNaN(d.getTime()) ? Math.floor(d.getTime() / 1000) : null;
          return {
            time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kathmandu' }),
            timestamp: ts,
            rate: Number(tr.rate || tr.contractRate || 0),
            qty: Number(tr.qty || tr.contractQuantity || 0)
          };
        }).filter(t => t.timestamp && t.rate > 0).sort((a, b) => a.timestamp - b.timestamp);

        if (trades.length > 0) {
          return trades.map(t => ({
            time: t.time,
            timestamp: t.timestamp,
            open: t.rate,
            high: t.rate,
            low: t.rate,
            close: t.rate,
            volume: t.qty
          }));
        }
      }
    } catch (_) {}
  }

  return null;
};


function computeIpoStatus(closeDateStr, openDateStr, defaultStatus = 'Open') {
  let status = defaultStatus || 'Open';
  const stUpper = String(status).toUpperCase();
  if (stUpper.includes('CLOSE') || stUpper.includes('EXPIRE') || stUpper.includes('ENDED')) {
    return 'Closed';
  }
  if (!closeDateStr) return status;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const match = String(closeDateStr).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);

      let targetDate;
      if (year > 2060) {
        targetDate = new Date(year - 57, month, day);
      } else {
        targetDate = new Date(year, month, day);
      }

      if (targetDate < today) {
        return 'Closed';
      }
      const diffMs = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 2 && diffDays >= 0) {
        return 'Closing Soon';
      }
    }

    if (openDateStr) {
      const oMatch = String(openDateStr).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (oMatch) {
        const oYear = parseInt(oMatch[1], 10);
        const oMonth = parseInt(oMatch[2], 10) - 1;
        const oDay = parseInt(oMatch[3], 10);
        const oDate = oYear > 2060 ? new Date(oYear - 57, oMonth, oDay) : new Date(oYear, oMonth, oDay);
        if (oDate > today) return 'Upcoming';
      }
    }
  } catch (_) {}
  return status;
}

export const fetchIPOListings = async () => {
  let list = [];
  try {
    const res = await _proxyFetch('/api/ipo/live-listings', {}, 300000);
    list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
  } catch (_) {}

  if (list.length === 0) {
    try {
      const res2 = await _proxyFetch('/api/meroshare/ipos', {}, 300000);
      list = Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []);
    } catch (_) {}
  }

  return list.map(item => ({
    ...item,
    companyName: item.name || item.companyName || item.scrip || '—',
    shareType: item.type || item.shareType || 'IPO',
    issuePrice: item.issuePrice || item.price || 100,
    status: computeIpoStatus(item.closeDate || item.issueCloseDate, item.openDate || item.issueOpenDate, item.status),
    units: item.units,
    openDate: item.openDate,
    closeDate: item.closeDate,
    issueManager: item.issueManager,
    sector: item.sector
  }));
};
export const fetchIPOPipeline = () => _proxyFetch('/api/ipo/pipeline', {}, 3600000);
export const fetchIPOResultCompanies = () => _proxyFetch('/api/ipo-result/companies', {}, 3600000);
export const checkIPOResult = (companyShareId, boid) => _proxyFetch('/api/ipo-result/check', { body: { companyShareId, boid }, timeout: 20000 }, 300000);
export const bulkCheckIPOResult = (companyShareId, profiles) => _proxyFetch('/api/ipo-result/bulk-check', { body: { companyShareId, profiles }, timeout: 60000 }, 300000);

export const fetchScanner = (type, mode) => _proxyFetch('/api/scanner/bulk?type=' + type + (mode ? '&mode=' + mode : ''), {}, 60000);
export const fetchSectorHeatmap = () => _proxyFetch('/api/sector-heatmap', {}, 30000);
export const fetchSectorAD = () => _proxyFetch('/api/smart-money/sector-ad', {}, 30000);
export const fetchBrokerHeatmap = (arg) => {
  let q = '';
  if (typeof arg === 'number') {
    q = `?days=${arg}`;
  } else if (arg && typeof arg === 'object') {
    const p = new URLSearchParams();
    if (arg.days) p.set('days', String(arg.days));
    if (arg.date) p.set('date', String(arg.date));
    q = p.toString() ? `?${p.toString()}` : '';
  } else if (arg) {
    q = `?date=${arg}`;
  }
  return _proxyFetch('/api/smart-money/broker-heatmap' + q, {}, 120000);
};
export const fetchStealthAccumulation = (symbol, days) => _proxyFetch('/api/smart-money/stealth/' + symbol + '?days=' + (days || 15), {}, 300000);
export const fetchBrokerAnalysis = (symbol, days) => _proxyFetch('/api/broker-analysis/' + symbol + '?days=' + (days || 30), {}, 1800000);
export const fetchStockDetail = (symbol) => _proxyFetch('/api/stock-detail/' + symbol, {}, 7200000);
export const fetchMarketDepth = (symbol) => _proxyFetch('/api/nepse/market-depth/' + symbol, {}, 15000);
export const fetchDividendHistory = async (symbol) => {
  const path = '/api/dividend-history/' + encodeURIComponent(symbol);
  const url = PROXY + path;
  try {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      const res = await CapacitorHttp.request({
        url,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        connectTimeout: 25000,
        readTimeout: 25000,
      });
      if (res.status >= 200 && res.status < 300) {
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
      return null;
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    console.warn('[servicesApi] fetchDividendHistory failed:', err.message);
    return null;
  }
};
export const fetchStockComparison = (s1, s2) => _proxyFetch('/api/compare/' + s1 + '/' + s2, {}, 300000);

export const fetchMutualFunds = () => _proxyFetch('/api/mutual-funds', {}, 3600000);
export const fetchBrokersDirectory = (search, location) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (location) params.set('location', location);
  const qs = params.toString();
  return _proxyFetch('/api/brokers/directory' + (qs ? '?' + qs : ''), {}, 86400000);
};
export const fetchMarketNews = async (forceRefresh = false) => {
  if (forceRefresh) {
    invalidateCache('/api/news');
  }
  const qs = forceRefresh ? '?refresh=true' : '';

  // 1. Try unified NEPSE news (All 9 Portals: ShareSansar, MeroLagani, Nepali Paisa, Clickmandu, etc.) with 15s timeout
  let news = await _proxyFetch('/api/news/nepse' + qs, { timeout: 15000 }, 180000, forceRefresh).catch(() => null);
  if (Array.isArray(news) && news.length >= 10) {
    const deduped = deduplicateNews(news);
    return sortNews(deduped, 'latest');
  }

  // 2. Fallback to Merolagani multi-category proxy endpoint with 12s timeout
  let meroProxyNews = await _proxyFetch('/api/news/merolagani' + qs, { timeout: 12000 }, 180000, forceRefresh).catch(() => null);
  if (Array.isArray(meroProxyNews) && meroProxyNews.length > 0) {
    if (Array.isArray(news) && news.length > 0) {
      const merged = deduplicateNews([...news, ...meroProxyNews]);
      return sortNews(merged, 'latest');
    }
    const deduped = deduplicateNews(meroProxyNews);
    return sortNews(deduped, 'latest');
  }

  // 3. Direct multi-category client-side web fallback (25+ MeroLagani articles)
  try {
    const directNews = await fetchMerolaganiNews();
    if (Array.isArray(directNews) && directNews.length > 0) {
      if (Array.isArray(news) && news.length > 0) {
        const merged = deduplicateNews([...news, ...directNews]);
        return sortNews(merged, 'latest');
      }
      const deduped = deduplicateNews(directNews);
      return sortNews(deduped, 'latest');
    }
  } catch (_) {}

  return Array.isArray(news) ? sortNews(deduplicateNews(news), 'latest') : [];
};

export const fetchNewsArticle = async (articleUrl) => {
  if (!articleUrl) return null;
  const path = '/api/news/read?url=' + encodeURIComponent(articleUrl);
  try {
    const res = await _proxyFetch(path, { timeout: 8000 }, 3600000);
    if (res && (res.paragraphs || res.content || res.body)) return res;
  } catch (_) {}
  return null;
};

export const fetchMarketStatus = () => _proxyFetch('/api/status', {}, 10000);

export const fetchHolidays = (year, month, count) => {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  if (count) params.set('upcoming', count);
  const qs = params.toString();
  return _proxyFetch('/api/holidays' + (qs ? '?' + qs : ''), {}, 3600000);
};

export const fetchMonthCalendar = (year, month) => {
  const params = new URLSearchParams();
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  const qs = params.toString();
  return _proxyFetch('/api/calendar/month' + (qs ? '?' + qs : ''), {}, 3600000);
};

export const fetchTodayCalendar = () => _proxyFetch('/api/calendar/today', {}, 60000);

export const fetchMeroShareIPOs = (token) => _proxyFetch('/api/meroshare/current-issues?token=' + encodeURIComponent(token), {}, 900000);
export const fetchApplicationReport = (creds) => _proxyFetch('/api/meroshare/application-report', { body: creds, timeout: 20000 }, 600000);

export const fetchForexRates = () => _proxyFetch('/api/forex/rates', {}, 1800000);
export const fetchMacroIndicators = () => _proxyFetch('/api/macro/nrb-indicators', {}, 3600000);
export const fetchBullionRates = () => _proxyFetch('/api/commodities/bullion', {}, 1800000);
export const fetchNrbCirculars = () => _proxyFetch('/api/regulatory/nrb-circulars', {}, 3600000);
export const fetchSebonCirculars = () => _proxyFetch('/api/regulatory/sebon-circulars', {}, 3600000);
export const fetchPromoterShares = () => _proxyFetch('/api/market/promoter-shares', {}, 3600000);
export const fetchSeasonalityAnalytics = () => _proxyFetch('/api/market/seasonality', {}, 86400000);

export const invalidateCache = (path) => { 
  for (const key of _cache.keys()) { 
    if (key.startsWith(path)) {
      _cache.delete(key);
      idbDel(key).catch(() => {});
    }
  } 
};
export const clearAllCache = () => _cache.clear();

export const warmupProxy = () => {
  try {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      CapacitorHttp.request({ url: PROXY + '/api/ping', method: 'GET', connectTimeout: 10000 }).catch(() => {});
    } else {
      fetch(PROXY + '/api/ping', { signal: AbortSignal.timeout(10000) }).catch(() => {});
    }
  } catch (_) {}
};

// Immediately wake up the proxy in the background on app initialization
warmupProxy();

