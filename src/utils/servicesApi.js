import { Capacitor, CapacitorHttp } from '@capacitor/core';

const getProxy = () => {
  try { const env = import.meta?.env?.VITE_PROXY_URL; return (env && env.trim()) ? env.trim().replace(/\/$/, '') : 'https://nepseapp.onrender.com'; } catch { return 'https://nepseapp.onrender.com'; }
};

const PROXY = getProxy();

// Simple in-memory TTL cache
const _cache = new Map();
const _getCache = (key) => { const item = _cache.get(key); if (item && item.expiresAt > Date.now()) return item.data; _cache.delete(key); return null; };
const _setCache = (key, data, ttlMs = 60000) => { _cache.set(key, { data, expiresAt: Date.now() + ttlMs }); };

const _proxyFetch = async (path, options = {}, ttlMs = 60000) => {
  const cacheKey = path + (options.body ? JSON.stringify(options.body) : '');
  const cached = _getCache(cacheKey);
  if (cached !== null) return cached;
  try {
    const url = PROXY + path;
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const res = await CapacitorHttp.request({
        url,
        method: options.body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        data: options.body || undefined,
        connectTimeout: options.timeout || 25000,
        readTimeout: options.timeout || 25000
      });
      if (res.status >= 200 && res.status < 300) {
        const json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (json && json.success !== false) {
          const data = json.data ?? json.results ?? json;
          _setCache(cacheKey, data, ttlMs);
          return data;
        }
      }
      return null;
    }

    const method = options.body ? 'POST' : 'GET';
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout || 25000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.success === false) return null;
    const data = json.data ?? json.results ?? json;
    _setCache(cacheKey, data, ttlMs);
    return data;
  } catch (err) {
    console.warn('[servicesApi] Request failed:', path, err.message);
    return null;
  }
};

export const fetchLiveStocks = () => _proxyFetch('/api/mero/market-summary', {}, 15000);
export const fetchFullIndex = () => _proxyFetch('/api/nepse/full-index', {}, 30000);
export const fetchMarketIndices = () => _proxyFetch('/api/market-indices', {}, 30000);
export const fetchTodayPrices = () => _proxyFetch('/api/today-prices', {}, 30000);
export const fetchNepseIntradayGraph = () => _proxyFetch('/api/nepse/intraday-graph', {}, 60000);

export const fetchIPOListings = () => _proxyFetch('/api/ipo/live-listings', {}, 1800000);
export const fetchIPOPipeline = () => _proxyFetch('/api/ipo/pipeline', {}, 3600000);
export const fetchIPOResultCompanies = () => _proxyFetch('/api/ipo-result/companies', {}, 3600000);
export const checkIPOResult = (companyShareId, boid) => _proxyFetch('/api/ipo-result/check', { body: { companyShareId, boid }, timeout: 20000 }, 300000);
export const bulkCheckIPOResult = (companyShareId, profiles) => _proxyFetch('/api/ipo-result/bulk-check', { body: { companyShareId, profiles }, timeout: 60000 }, 300000);

export const fetchScanner = (type, mode) => _proxyFetch('/api/scanner/bulk?type=' + type + (mode ? '&mode=' + mode : ''), {}, 60000);
export const fetchSectorHeatmap = () => _proxyFetch('/api/sector-heatmap', {}, 30000);
export const fetchSectorAD = () => _proxyFetch('/api/smart-money/sector-ad', {}, 30000);
export const fetchBrokerHeatmap = (date) => _proxyFetch('/api/smart-money/broker-heatmap' + (date ? '?date=' + date : ''), {}, 120000);
export const fetchStealthAccumulation = (symbol, days) => _proxyFetch('/api/smart-money/stealth/' + symbol + '?days=' + (days || 15), {}, 300000);

export const fetchFloorsheet = (symbol, page, size, date) => {
  const p = page || 1, s = size || 25;
  const params = 'page=' + p + '&size=' + s + (date ? '&date=' + date : '');
  const path = symbol ? '/api/floorsheet/' + symbol + '?' + params : '/api/floorsheet?' + params;
  return _proxyFetch(path, {}, 300000);
};
export const fetchBrokerAnalysis = (symbol, days) => _proxyFetch('/api/broker-analysis/' + symbol + '?days=' + (days || 30), {}, 1800000);
export const fetchStockDetail = (symbol) => _proxyFetch('/api/stock-detail/' + symbol, {}, 7200000);
export const fetchPriceHistory = (symbol, length) => _proxyFetch('/api/price-history/' + symbol + '?length=' + (length || 365), {}, 7200000);
export const fetchMarketDepth = (symbol) => _proxyFetch('/api/nepse/market-depth/' + symbol, {}, 15000);
export const fetchDividendHistory = (symbol) => _proxyFetch('/api/dividend-history/' + symbol, {}, 21600000);
export const fetchStockComparison = (s1, s2) => _proxyFetch('/api/compare/' + s1 + '/' + s2, {}, 300000);

export const fetchMutualFunds = () => _proxyFetch('/api/mutual-funds', {}, 3600000);
export const fetchBrokersDirectory = (search, location) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (location) params.set('location', location);
  const qs = params.toString();
  return _proxyFetch('/api/brokers/directory' + (qs ? '?' + qs : ''), {}, 86400000);
};
export const fetchMarketNews = () => _proxyFetch('/api/news/merolagani', {}, 360000);
export const fetchMarketStatus = () => _proxyFetch('/api/status', {}, 10000);
export const fetchMeroShareIPOs = (token) => _proxyFetch('/api/meroshare/current-issues?token=' + encodeURIComponent(token), {}, 900000);
export const fetchApplicationReport = (creds) => _proxyFetch('/api/meroshare/application-report', { body: creds, timeout: 20000 }, 600000);

export const invalidateCache = (path) => { for (const key of _cache.keys()) { if (key.startsWith(path)) _cache.delete(key); } };
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

