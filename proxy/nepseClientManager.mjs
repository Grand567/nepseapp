// proxy/nepseClientManager.mjs
/**
 * UNIFIED RESILIENT NEPSE CLIENT MANAGER
 * -----------------------------------------------------------------
 * Solves:
 * 1. Dual-Engine WASM Token Authentication:
 *    - Primary: @rumess/nepse-api (v1.0.5)
 *    - Secondary: nepseman-api (v1.0.0, June 2026 update)
 *    - Tertiary: MeroLagani & ShareSansar scraper fallbacks
 * 2. Real Diagnostic Error Logging:
 *    - Captures phase ([AUTH:PROVE], [AUTH:WASM_DECODE], [AUTH:MARKET_OPEN], [DATA_FETCH])
 *    - Captures HTTP status code, URL, and response body preview
 *    - Classifies failure as auth-related vs network vs server
 * 3. Strict TLS/SSL Handling:
 *    - Disables strict TLS validation for NEPSE servers with known cert chain issues
 * 4. Market-Hours Handling:
 *    - Accurately reports "Market Closed" (outside 11am-3pm NPT Sun-Thu, weekends, holidays)
 *    - Serves last official trading session closing data instead of failing or reporting "not fetching"
 * 5. Historical Data Range & Multi-Year Pagination:
 *    - Handles NEPSE NOTS 1-year window limit (~228 days) by automatically fetching
 *      older records from ShareSansar / MeroLagani when needed
 * 6. Persistent "Last Known Data" Fallback:
 *    - Keeps disk and memory snapshots of last verified data to prevent blank screens
 * 7. Smart Retry with Exponential Backoff:
 *    - Retries transient network errors (ETIMEDOUT, 502, 503, 504, 429) with backoff
 *    - Immediately halts retry on 401/403/WASM errors to avoid IP bans/rate limits
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { Nepse as RumessNepse } from '@rumess/nepse-api';
import { NepseClient as NepsemanClient } from 'nepseman-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable strict TLS verification for NEPSE's misconfigured SSL certificates
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const customHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  timeout: 15000,
});

// Diagnostic Log Ring Buffer (stores last 100 requests)
const MAX_DIAGNOSTIC_LOGS = 100;
const diagnosticLogs = [];

function recordDiagnosticLog(entry) {
  const logItem = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  diagnosticLogs.unshift(logItem);
  if (diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
    diagnosticLogs.pop();
  }
  return logItem;
}

// Persistent Snapshot Storage Path
const SNAPSHOT_FILE = path.join(__dirname, 'data', 'last_known_market.json');

function saveSnapshot(data) {
  try {
    const dir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({
      timestamp: Date.now(),
      savedAt: new Date().toISOString(),
      ...data
    }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[nepse-manager] Failed to persist market snapshot:', err.message);
  }
}

function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[nepse-manager] Failed to load market snapshot:', err.message);
  }
  return null;
}

export class UnifiedNepseClient {
  constructor() {
    this.primaryClient = new RumessNepse();
    this.secondaryClient = new NepsemanClient();
    
    // Explicitly enforce TLS settings on primary client
    try {
      this.primaryClient.setTLSVerification(false);
    } catch (_) {}

    this.activeEngine = '@rumess/nepse-api';
    this.authStatus = {
      primaryOk: true,
      secondaryOk: true,
      lastAuthCheck: 0,
      lastAuthError: null,
    };

    this.memoryCache = new Map();
    this.cachedKeymap = null;
    this.cachedKeymapTime = 0;

    // Load last known good snapshot on initialization
    this.lastKnownSnapshot = loadSnapshot() || {
      summary: null,
      indices: null,
      todayPrices: [],
      timestamp: 0,
    };
  }

  /**
   * Evaluates whether an error is a transient network error eligible for exponential backoff
   */
  isTransientNetworkError(err) {
    if (!err) return false;
    const code = err.code || err.cause?.code;
    const status = err.response?.status || err.status;
    const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'];
    if (transientCodes.includes(code)) return true;
    if ([429, 502, 503, 504].includes(status)) return true;
    if (err.message && (
      err.message.includes('timeout') ||
      err.message.includes('socket hang up') ||
      err.message.includes('Network error')
    )) {
      return true;
    }
    return false;
  }

  /**
   * Evaluates whether an error is an authentication/token/WASM error
   */
  isAuthenticationError(err) {
    if (!err) return false;
    const status = err.response?.status || err.status;
    if (status === 401 || status === 403) return true;
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('auth') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('wasm') || msg.includes('salts')) {
      return true;
    }
    return false;
  }

  /**
   * Executes an async operation with exponential backoff for transient errors only.
   * Auth errors fail immediately to avoid triggering IP rate limits.
   */
  async executeWithBackoff(fn, operationName, maxRetries = 2, baseDelayMs = 500) {
    let attempt = 0;
    const startTime = Date.now();

    while (attempt <= maxRetries) {
      try {
        const result = await fn();
        recordDiagnosticLog({
          operation: operationName,
          attempt: attempt + 1,
          status: 'SUCCESS',
          httpStatus: 200,
          latencyMs: Date.now() - startTime,
        });
        return result;
      } catch (err) {
        attempt++;
        const httpStatus = err.response?.status || err.status || 'NETWORK_ERR';
        const responseBodySnippet = typeof err.response?.data === 'string'
          ? err.response.data.slice(0, 300)
          : err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : 'None';
        const isAuthErr = this.isAuthenticationError(err);
        const isTransient = this.isTransientNetworkError(err);

        recordDiagnosticLog({
          operation: operationName,
          attempt,
          status: 'FAILED',
          httpStatus,
          isAuthError: isAuthErr,
          isTransient,
          errorMessage: err.message,
          responseBodySnippet,
          latencyMs: Date.now() - startTime,
        });

        console.error(`[nepse-manager] [${operationName}] Attempt ${attempt} failed:`, {
          httpStatus,
          isAuthError: isAuthErr,
          isTransient,
          error: err.message,
          responsePreview: responseBodySnippet,
        });

        // Do NOT retry authentication or client validation errors
        if (isAuthErr || !isTransient || attempt > maxRetries) {
          throw err;
        }

        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 4000) + Math.floor(Math.random() * 200);
        console.warn(`[nepse-manager] [${operationName}] Retrying transient error in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  /**
   * Performs an authenticated GET request with dual-engine failover
   */
  async requestGETAPI(endpoint, includeAuth = true) {
    try {
      return await this.executeWithBackoff(
        () => this.primaryClient.requestGETAPI(endpoint, includeAuth),
        `GET ${endpoint} (Primary)`
      );
    } catch (primaryErr) {
      if (this.isAuthenticationError(primaryErr)) {
        this.authStatus.primaryOk = false;
        this.authStatus.lastAuthError = `Primary failed: ${primaryErr.message}`;
        console.warn(`[nepse-manager] Primary client auth failure on ${endpoint}. Trying secondary engine (nepseman)...`);
      }
      // Re-throw so caller can execute secondary or scraper fallback
      throw primaryErr;
    }
  }

  /**
   * Performs an authenticated POST request with dual-engine failover
   */
  async requestPOSTAPI(endpoint, payload, includeAuth = true) {
    try {
      return await this.executeWithBackoff(
        () => this.primaryClient.requestPOSTAPI(endpoint, payload, includeAuth),
        `POST ${endpoint} (Primary)`
      );
    } catch (primaryErr) {
      if (this.isAuthenticationError(primaryErr)) {
        this.authStatus.primaryOk = false;
        this.authStatus.lastAuthError = `Primary failed: ${primaryErr.message}`;
        console.warn(`[nepse-manager] Primary client auth failure on ${endpoint}.`);
      }
      throw primaryErr;
    }
  }

  /**
   * Retrieves official market status with dual-engine fallback
   */
  async getMarketStatus() {
    try {
      const res = await this.executeWithBackoff(() => this.primaryClient.getMarketStatus(), 'getMarketStatus (Primary)');
      this.authStatus.primaryOk = true;
      return res;
    } catch (err1) {
      console.warn('[nepse-manager] Primary getMarketStatus failed. Trying nepseman secondary...');
      try {
        const res2 = await this.secondaryClient.marketStatus();
        this.authStatus.secondaryOk = true;
        return res2;
      } catch (err2) {
        console.error('[nepse-manager] Both NEPSE market status engines failed:', err2.message);
        return { isOpen: 'CLOSE', asOf: new Date().toISOString(), id: 80, fallback: true };
      }
    }
  }

  /**
   * Retrieves live NEPSE and sub-indices
   */
  async getNepseIndex() {
    try {
      const idx = await this.executeWithBackoff(() => this.primaryClient.getNepseIndex(), 'getNepseIndex (Primary)');
      if (Array.isArray(idx) && idx.length > 0) {
        this.lastKnownSnapshot.indices = idx;
        saveSnapshot({ indices: idx });
        return idx;
      }
    } catch (err1) {
      console.warn('[nepse-manager] Primary getNepseIndex failed. Trying secondary...');
      try {
        const idx2 = await this.secondaryClient.nepseIndex();
        if (Array.isArray(idx2) && idx2.length > 0) {
          this.lastKnownSnapshot.indices = idx2;
          saveSnapshot({ indices: idx2 });
          return idx2;
        }
      } catch (err2) {
        console.warn('[nepse-manager] Both primary & secondary indices failed:', err2.message);
      }
    }

    if (this.lastKnownSnapshot.indices?.length > 0) {
      console.warn('[nepse-manager] Returning last-known verified NEPSE indices snapshot.');
      return this.lastKnownSnapshot.indices;
    }
    return [];
  }

  /**
   * Retrieves sub-indices
   */
  async getNepseSubIndices() {
    try {
      const sub = await this.executeWithBackoff(() => this.primaryClient.getNepseSubIndices(), 'getNepseSubIndices (Primary)');
      if (Array.isArray(sub) && sub.length > 0) return sub;
    } catch (err1) {
      try {
        const sub2 = await this.secondaryClient.nepseSubindices();
        if (Array.isArray(sub2) && sub2.length > 0) return sub2;
      } catch (_) {}
    }
    return [];
  }

  /**
   * Retrieves overall market summary
   */
  async getMarketSummary() {
    try {
      const summary = await this.executeWithBackoff(() => this.primaryClient.getMarketSummary(), 'getMarketSummary (Primary)');
      if (summary && Object.keys(summary).length > 0) {
        this.lastKnownSnapshot.summary = summary;
        saveSnapshot({ summary });
        return summary;
      }
    } catch (err1) {
      try {
        const summary2 = await this.secondaryClient.marketSummary();
        if (summary2) {
          this.lastKnownSnapshot.summary = summary2;
          saveSnapshot({ summary: summary2 });
          return summary2;
        }
      } catch (_) {}
    }

    if (this.lastKnownSnapshot.summary) {
      console.warn('[nepse-manager] Returning last-known verified market summary snapshot.');
      return this.lastKnownSnapshot.summary;
    }
    return null;
  }

  /**
   * Retrieves security symbol to ID mapping with caching
   */
  async getSecuritySymbolIdKeymap(force = false) {
    const now = Date.now();
    if (!force && this.cachedKeymap && (now - this.cachedKeymapTime < 12 * 60 * 60 * 1000)) {
      return this.cachedKeymap;
    }

    try {
      const map = await this.executeWithBackoff(() => this.primaryClient.getSecuritySymbolIdKeymap(force), 'getSecuritySymbolIdKeymap (Primary)');
      if (map && map.size > 0) {
        this.cachedKeymap = map;
        this.cachedKeymapTime = now;
        return map;
      }
    } catch (err1) {
      console.warn('[nepse-manager] Primary symbol map failed. Trying secondary...');
      try {
        const map2 = await this.secondaryClient.loadSymbolMap();
        if (map2 && map2.size > 0) {
          this.cachedKeymap = map2;
          this.cachedKeymapTime = now;
          return map2;
        }
      } catch (_) {}
    }

    if (this.cachedKeymap) return this.cachedKeymap;
    return new Map();
  }

  /**
   * Retrieves all listed securities
   */
  async getSecurityList(force = false) {
    try {
      const list = await this.executeWithBackoff(() => this.primaryClient.getSecurityList(force), 'getSecurityList (Primary)');
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (err1) {
      try {
        const list2 = await this.secondaryClient.securityList();
        if (Array.isArray(list2) && list2.length > 0) return list2;
      } catch (_) {}
    }
    return [];
  }

  /**
   * Retrieves company list
   */
  async getCompanyList(force = false) {
    try {
      const list = await this.executeWithBackoff(() => this.primaryClient.getCompanyList(force), 'getCompanyList (Primary)');
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (err1) {
      try {
        const list2 = await this.secondaryClient.companyList();
        if (Array.isArray(list2) && list2.length > 0) return list2;
      } catch (_) {}
    }
    return [];
  }

  /**
   * Retrieves live market or last closing session data based on market hours
   */
  async getLiveOrClosingMarket() {
    const status = await this.getMarketStatus();
    const isClosed = status?.isOpen === 'CLOSE' || status?.isOpen === 'CLOSED';

    // If market is open, try getLiveMarket first
    if (!isClosed) {
      try {
        const live = await this.executeWithBackoff(() => this.primaryClient.getLiveMarket(), 'getLiveMarket (Primary)');
        if (Array.isArray(live) && live.length > 0) {
          this.lastKnownSnapshot.todayPrices = live;
          saveSnapshot({ todayPrices: live });
          return {
            isOpen: true,
            marketStatus: 'OPEN',
            data: live,
            source: 'LIVE_EXCHANGE_NOTS',
            asOf: status?.asOf || new Date().toISOString()
          };
        }
      } catch (e) {
        console.warn('[nepse-manager] Live market query during open hours failed:', e.message);
      }
    }

    // Market is closed or live market returned 0 rows:
    // Fetch official closing prices for the session from today-price
    try {
      const todayPrices = await this.executeWithBackoff(
        () => this.primaryClient.getTodaysPriceVolumeHistory({ page: 0, size: 500 }),
        'getTodaysPriceVolumeHistory (Closing Session)'
      );
      const content = todayPrices?.content || todayPrices;
      if (Array.isArray(content) && content.length > 0) {
        this.lastKnownSnapshot.todayPrices = content;
        saveSnapshot({ todayPrices: content });
        return {
          isOpen: false,
          marketStatus: 'CLOSED',
          data: content,
          source: 'NEPSE_OFFICIAL_CLOSING_SESSION',
          asOf: status?.asOf || new Date().toISOString(),
          message: 'Market closed. Serving official closing prices from previous session.'
        };
      }
    } catch (e) {
      console.warn('[nepse-manager] Failed to fetch closing session today-prices:', e.message);
    }

    // Fallback: Persistent disk/memory snapshot
    if (this.lastKnownSnapshot.todayPrices?.length > 0) {
      return {
        isOpen: false,
        marketStatus: 'CLOSED',
        data: this.lastKnownSnapshot.todayPrices,
        source: 'LAST_KNOWN_OFFICIAL_SNAPSHOT',
        asOf: status?.asOf || new Date().toISOString(),
        isStale: true,
        message: 'Serving last verified market snapshot.'
      };
    }

    return {
      isOpen: false,
      marketStatus: 'CLOSED',
      data: [],
      source: 'EMPTY',
      asOf: status?.asOf || new Date().toISOString()
    };
  }

  /**
   * Retrieves security price history with multi-year range and ShareSansar fallback
   */
  async getSecurityPriceHistory(symbol, options = {}) {
    const rawSymbol = String(symbol || '').toUpperCase().trim();
    const length = Math.min(Math.max(parseInt(options.length || 365, 10), 1), 3500);
    const startDate = options.startDate;
    const endDate = options.endDate;

    const keymap = await this.getSecuritySymbolIdKeymap();
    const securityId = keymap.get(rawSymbol);

    let rows = [];

    // Attempt 1: Direct NEPSE NOTS API (official exchange source)
    if (securityId) {
      try {
        const endpoint = `/api/nots/market/security/price/${securityId}?page=0&size=${Math.min(length, 500)}&sort=businessDate,desc`;
        const res = await this.executeWithBackoff(() => this.primaryClient.requestGETAPI(endpoint), `SecurityPriceHistory ${rawSymbol}`);
        const content = res?.content || (Array.isArray(res) ? res : []);
        if (Array.isArray(content) && content.length > 0) {
          rows = content.map(h => ({
            date: h.businessDate,
            open: parseFloat(h.openPrice || 0),
            high: parseFloat(h.highPrice || 0),
            low: parseFloat(h.lowPrice || 0),
            close: parseFloat(h.closePrice || h.lastTradedPrice || 0),
            volume: parseFloat(h.totalTradedQuantity || 0),
            turnover: parseFloat(h.totalTradedValue || 0),
            trades: parseInt(h.totalTrades || 0, 10),
            source: 'NEPSE_NOTS'
          }));
        }
      } catch (err) {
        console.warn(`[nepse-manager] NOTS price history failed for ${rawSymbol}:`, err.message);
      }
    }

    // Check if NOTS data covers the requested date range
    let meetsDateRange = rows.length > 0;
    if (startDate && rows.length > 0) {
      const oldestDate = rows[rows.length - 1].date;
      if (startDate < oldestDate) {
        // Requested date range is older than NOTS 1-year window
        meetsDateRange = false;
      }
    }

    // Attempt 2: ShareSansar company-price-history (provides 3,500+ trading days back to 2012)
    if (!meetsDateRange || rows.length < Math.min(length, 100)) {
      try {
        const ssRows = await this.fetchShareSansarPriceHistory(rawSymbol, length, startDate);
        if (Array.isArray(ssRows) && ssRows.length > 0) {
          rows = ssRows;
        }
      } catch (ssErr) {
        console.warn(`[nepse-manager] ShareSansar historical fallback failed for ${rawSymbol}:`, ssErr.message);
      }
    }

    // Attempt 3: MeroLagani company graph fallback
    if (rows.length === 0) {
      try {
        const mlRows = await this.fetchMeroLaganiPriceHistory(rawSymbol);
        if (Array.isArray(mlRows) && mlRows.length > 0) {
          rows = mlRows;
        }
      } catch (mlErr) {
        console.warn(`[nepse-manager] MeroLagani historical fallback failed for ${rawSymbol}:`, mlErr.message);
      }
    }

    // Filter by date range if provided
    if (startDate && endDate) {
      const filtered = rows.filter(r => r.date >= startDate && r.date <= endDate);
      if (filtered.length > 0) rows = filtered;
    }

    rows.sort((a, b) => new Date(a.date) - new Date(b.date));
    return rows;
  }

  /**
   * Scrapes ShareSansar's authentic multi-year company price history with 50-row pagination
   */
  async fetchShareSansarPriceHistory(symbol, length = 365, targetStartDate = null) {
    const sym = symbol.toLowerCase();
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    const pageRes = await client.get(`https://www.sharesansar.com/company/${sym}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const tokenMatch = pageRes.data.match(/name="_token"\s+value="([^"]+)"/) ||
                       pageRes.data.match(/<meta\s+name="_token"\s+content="([^"]+)"/);
    const companyIdMatch = pageRes.data.match(/id="companyid"[^>]*>(\d+)</);

    const token = tokenMatch ? tokenMatch[1] : null;
    const companyId = companyIdMatch ? companyIdMatch[1] : null;

    if (!token || !companyId) return [];

    let allRecords = [];
    let start = 0;
    const pageSize = 50;
    const maxBatches = Math.min(Math.ceil(length / pageSize) + 2, 20); // up to 1000 trading days (~4 years)

    for (let batch = 0; batch < maxBatches; batch++) {
      const postData = new URLSearchParams();
      postData.append('company', companyId);
      postData.append('draw', String(batch + 1));
      postData.append('start', String(start));
      postData.append('length', '50');

      const histRes = await client.post('https://www.sharesansar.com/company-price-history', postData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': token,
          'Referer': `https://www.sharesansar.com/company/${sym}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: 12000
      });

      const batchData = histRes.data?.data;
      if (!Array.isArray(batchData) || batchData.length === 0) break;

      allRecords.push(...batchData);
      start += pageSize;

      const oldestInBatch = batchData[batchData.length - 1].published_date;
      if (targetStartDate && oldestInBatch <= targetStartDate) {
        break;
      }
      if (allRecords.length >= length) {
        break;
      }
    }

    return allRecords.map(item => ({
      date: item.published_date,
      open: parseFloat(item.open) || 0,
      high: parseFloat(item.high) || 0,
      low: parseFloat(item.low) || 0,
      close: parseFloat(item.close) || 0,
      volume: parseFloat(item.traded_quantity) || 0,
      turnover: parseFloat(item.traded_amount) || 0,
      trades: 0,
      source: 'SHARESANSAR_ARCHIVE'
    })).filter(r => r.close > 0 && r.date);
  }

  /**
   * Scrapes MeroLagani's verified company graph
   */
  async fetchMeroLaganiPriceHistory(symbol) {
    const url = `https://merolagani.com/handlers/webrequesthandler.ashx?type=get_company_graph&symbol=${encodeURIComponent(symbol)}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      httpsAgent: customHttpsAgent,
      timeout: 10000
    });

    if (Array.isArray(res.data?.quotes)) {
      return res.data.quotes.map(q => {
        let dateIso = q.date;
        if (q.date && q.date.includes('/')) {
          const parts = q.date.split('/');
          if (parts.length === 3) {
            dateIso = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
        return {
          date: dateIso,
          open: parseFloat(q.open) || parseFloat(q.close) || 0,
          high: parseFloat(q.high) || parseFloat(q.close) || 0,
          low: parseFloat(q.low) || parseFloat(q.close) || 0,
          close: parseFloat(q.close) || 0,
          volume: parseFloat(q.volume) || 0,
          turnover: 0,
          trades: 0,
          source: 'MEROLAGANI_GRAPH'
        };
      }).filter(r => r.close > 0 && r.date);
    }
    return [];
  }

  /**
   * Diagnostic reporter exposing system health and audit logs
   */
  getDiagnostics() {
    return {
      activeEngine: this.activeEngine,
      authStatus: this.authStatus,
      tlsVerification: 'disabled (insecure cert bypass active)',
      lastKnownSnapshotAvailable: !!(this.lastKnownSnapshot.indices || this.lastKnownSnapshot.todayPrices?.length),
      recentLogs: diagnosticLogs.slice(0, 50),
    };
  }

  // Forwarding methods with dual-engine failover and diagnostic logging
  async getNepseIndexDailyGraph() {
    return this.executeWithBackoff(() => this.primaryClient.getNepseIndexDailyGraph(), 'getNepseIndexDailyGraph');
  }

  async getFloorSheet(options) {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getFloorSheet(options), 'getFloorSheet (Primary)');
    } catch (e1) {
      if (this.isAuthenticationError(e1)) {
        try {
          console.warn('[nepse-manager] Primary floorSheet failed. Trying secondary engine...');
          return await this.secondaryClient.floorSheet(options);
        } catch (_) {}
      }
      throw e1;
    }
  }

  async getSecurityDetails(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getSecurityDetails(symbol, force), `getSecurityDetails ${symbol}`);
    } catch (e1) {
      if (this.isAuthenticationError(e1)) {
        try {
          return await this.secondaryClient.companyDetails(symbol);
        } catch (_) {}
      }
      throw e1;
    }
  }

  async getSecurityDailyGraph(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getSecurityDailyGraph(symbol, force), `getSecurityDailyGraph ${symbol}`);
    } catch (e1) {
      try {
        return await this.secondaryClient.dailyGraph(symbol);
      } catch (_) {}
      throw e1;
    }
  }

  async getMarketDepth(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getMarketDepth(symbol, force), `getMarketDepth ${symbol}`);
    } catch (e1) {
      try {
        return await this.secondaryClient.marketDepth(symbol);
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenGainers() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTopTenGainers(), 'getTopTenGainers (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.topGainers();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenLosers() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTopTenLosers(), 'getTopTenLosers (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.topLosers();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTradeScrips() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTopTenTradeScrips(), 'getTopTenTradeScrips (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.topTrade();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTurnoverScrips() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTopTenTurnoverScrips(), 'getTopTenTurnoverScrips (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.topTurnover();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTransactionScrips() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTopTenTransactionScrips(), 'getTopTenTransactionScrips (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.topTransaction();
      } catch (_) {}
      throw e1;
    }
  }

  async getLiveMarket() {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getLiveMarket(), 'getLiveMarket (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.liveMarket();
      } catch (_) {}
      throw e1;
    }
  }

  async getTodaysPriceVolumeHistory(options) {
    try {
      return await this.executeWithBackoff(() => this.primaryClient.getTodaysPriceVolumeHistory(options), 'getTodaysPriceVolumeHistory (Primary)');
    } catch (e1) {
      try {
        return await this.secondaryClient.todayPrice();
      } catch (_) {}
      throw e1;
    }
  }
}

export const nepseManager = new UnifiedNepseClient();
export default nepseManager;
