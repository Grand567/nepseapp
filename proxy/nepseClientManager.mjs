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
 *    - Accurately reports "Market Closed" (outside 11am-3pm NPT Mon-Fri, weekends Saturday & Sunday, holidays)
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
import { getDetailedMarketStatus } from '../src/utils/nepseCalendar.js';

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
    this.nepseman = new NepsemanClient();
    this.rumess = new RumessNepse();
    
    // Explicitly enforce TLS settings on rumess client
    try {
      this.rumess.setTLSVerification(false);
    } catch (_) {}

    // Primary engine: nepseman-api (working WASM-powered client)
    this.primaryClient = this.nepseman;
    // Secondary engine: @rumess/nepse-api (legacy fallback)
    this.secondaryClient = this.rumess;
    this.activeEngine = 'nepseman-api';

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
    // 1. Try Nepseman session first (WASM Prover)
    if (this.nepseman?.session) {
      try {
        return await this.executeWithBackoff(
          () => this.nepseman.session.get(endpoint),
          `GET ${endpoint} (Nepseman WASM)`
        );
      } catch (err1) {
        console.warn(`[nepse-manager] Nepseman GET failed on ${endpoint}: ${err1.message}. Trying Rumess fallback...`);
      }
    }

    // 2. Try Rumess client
    try {
      return await this.executeWithBackoff(
        () => this.rumess.requestGETAPI(endpoint, includeAuth),
        `GET ${endpoint} (Rumess)`
      );
    } catch (primaryErr) {
      if (this.isAuthenticationError(primaryErr)) {
        this.authStatus.primaryOk = false;
        this.authStatus.lastAuthError = `Rumess failed: ${primaryErr.message}`;
      }
      throw primaryErr;
    }
  }

  /**
   * Performs an authenticated POST request with dual-engine failover
   */
  async requestPOSTAPI(endpoint, payload, includeAuth = true) {
    // 1. Try Nepseman session first
    if (this.nepseman?.session) {
      try {
        return await this.executeWithBackoff(
          () => this.nepseman.session.post(endpoint, 'general'),
          `POST ${endpoint} (Nepseman WASM)`
        );
      } catch (err1) {
        console.warn(`[nepse-manager] Nepseman POST failed on ${endpoint}: ${err1.message}. Trying Rumess fallback...`);
      }
    }

    // 2. Try Rumess client
    try {
      return await this.executeWithBackoff(
        () => this.rumess.requestPOSTAPI(endpoint, payload, includeAuth),
        `POST ${endpoint} (Rumess)`
      );
    } catch (primaryErr) {
      if (this.isAuthenticationError(primaryErr)) {
        this.authStatus.primaryOk = false;
        this.authStatus.lastAuthError = `Rumess failed: ${primaryErr.message}`;
      }
      throw primaryErr;
    }
  }

  /**
   * Retrieves official market status with dual-engine fallback
   */
  async getMarketStatus() {
    // 1. Try Nepseman WASM first
    try {
      const res = await this.executeWithBackoff(() => this.nepseman.marketStatus(), 'getMarketStatus (Nepseman)');
      this.authStatus.primaryOk = true;
      if (res && res.isOpen) return res;
    } catch (err1) {
      console.warn('[nepse-manager] Nepseman getMarketStatus failed. Trying Rumess fallback...');
    }

    // 2. Try Rumess fallback
    try {
      const res2 = await this.executeWithBackoff(() => this.rumess.getMarketStatus(), 'getMarketStatus (Rumess)');
      this.authStatus.secondaryOk = true;
      if (res2 && res2.isOpen) return res2;
    } catch (err2) {
      console.error('[nepse-manager] Both NEPSE market status engines failed:', err2.message);
    }

    // 3. Fallback to authentic calendar status (prevents false 'CLOSE' during genuine market trading hours)
    try {
      const cal = getDetailedMarketStatus();
      return {
        isOpen: cal.isOpen ? 'OPEN' : 'CLOSE',
        asOf: new Date().toISOString(),
        id: 80,
        fallback: true,
        calendarStatus: cal
      };
    } catch (_) {}

    return { isOpen: 'CLOSE', asOf: new Date().toISOString(), id: 80, fallback: true };
  }

  /**
   * Retrieves live NEPSE and sub-indices
   */
  async getNepseIndex() {
    // 1. Try Nepseman WASM
    try {
      const idx = await this.executeWithBackoff(() => this.nepseman.nepseIndex(), 'getNepseIndex (Nepseman)');
      if (Array.isArray(idx) && idx.length > 0) {
        this.lastKnownSnapshot.indices = idx;
        saveSnapshot({ indices: idx });
        return idx;
      }
    } catch (err1) {
      console.warn('[nepse-manager] Nepseman getNepseIndex failed. Trying Rumess fallback...');
    }

    // 2. Try Rumess fallback
    try {
      const idx2 = await this.executeWithBackoff(() => this.rumess.getNepseIndex(), 'getNepseIndex (Rumess)');
      if (Array.isArray(idx2) && idx2.length > 0) {
        this.lastKnownSnapshot.indices = idx2;
        saveSnapshot({ indices: idx2 });
        return idx2;
      }
    } catch (err2) {
      console.warn('[nepse-manager] Both primary & secondary indices failed:', err2.message);
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
    // 1. Try Nepseman
    try {
      const sub = await this.executeWithBackoff(() => this.nepseman.nepseSubindices(), 'getNepseSubIndices (Nepseman)');
      if (Array.isArray(sub) && sub.length > 0) return sub;
    } catch (err1) {
      console.warn('[nepse-manager] Nepseman getNepseSubIndices failed. Trying Rumess fallback...');
    }

    // 2. Try Rumess fallback
    try {
      const sub2 = await this.executeWithBackoff(() => this.rumess.getNepseSubIndices(), 'getNepseSubIndices (Rumess)');
      if (Array.isArray(sub2) && sub2.length > 0) return sub2;
    } catch (_) {}
    return [];
  }

  /**
   * Retrieves overall market summary
   */
  async getMarketSummary() {
    // 1. Try Nepseman
    try {
      const summary = await this.executeWithBackoff(() => this.nepseman.marketSummary(), 'getMarketSummary (Nepseman)');
      if (summary) {
        if (Array.isArray(summary)) {
          for (const item of summary) {
            if (item && item.detail) {
              summary[item.detail] = item.value;
              if (item.detail.includes('Turnover')) summary.totalTurnover = item.value;
              else if (item.detail.includes('Traded Shares')) summary.totalTradedShares = item.value;
              else if (item.detail.includes('Transactions')) summary.totalTransactions = item.value;
              else if (item.detail.includes('Scrips Traded')) {
                summary.totalScrips = item.value;
                summary.totalTradedScrips = item.value;
              } else if (item.detail.includes('Float Market Capitalization')) summary.floatMarketCap = item.value;
              else if (item.detail.includes('Market Capitalization')) {
                summary.totalMarketCap = item.value;
                summary.marketCapitalization = item.value;
              }
            }
          }
        }
        this.lastKnownSnapshot.summary = summary;
        saveSnapshot({ summary });
        return summary;
      }
    } catch (err1) {
      console.warn('[nepse-manager] Nepseman getMarketSummary failed. Trying Rumess fallback...');
    }

    // 2. Try Rumess
    try {
      const summary2 = await this.executeWithBackoff(() => this.rumess.getMarketSummary(), 'getMarketSummary (Rumess)');
      if (summary2 && Object.keys(summary2).length > 0) {
        this.lastKnownSnapshot.summary = summary2;
        saveSnapshot({ summary: summary2 });
        return summary2;
      }
    } catch (_) {}

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

    // 1. Try Nepseman
    try {
      await this.nepseman.loadSymbolMap();
      if (this.nepseman.symbolMap && this.nepseman.symbolMap.size > 0) {
        this.cachedKeymap = this.nepseman.symbolMap;
        this.cachedKeymapTime = now;
        return this.cachedKeymap;
      }
    } catch (e) {
      console.warn('[nepse-manager] Nepseman loadSymbolMap failed:', e.message);
    }

    // 2. Try Rumess
    try {
      const map = await this.executeWithBackoff(() => this.rumess.getSecuritySymbolIdKeymap(force), 'getSecuritySymbolIdKeymap (Rumess)');
      if (map && map.size > 0) {
        this.cachedKeymap = map;
        this.cachedKeymapTime = now;
        return map;
      }
    } catch (err1) {
      console.warn('[nepse-manager] Rumess symbol map failed:', err1.message);
    }

    if (this.cachedKeymap) return this.cachedKeymap;
    return new Map();
  }

  /**
   * Retrieves all listed securities
   */
  async getSecurityList(force = false) {
    // 1. Try Nepseman
    try {
      const list = await this.executeWithBackoff(() => this.nepseman.securityList(), 'getSecurityList (Nepseman)');
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (_) {}

    // 2. Try Rumess
    try {
      const list2 = await this.executeWithBackoff(() => this.rumess.getSecurityList(force), 'getSecurityList (Rumess)');
      if (Array.isArray(list2) && list2.length > 0) return list2;
    } catch (_) {}
    return [];
  }

  /**
   * Retrieves company list
   */
  async getCompanyList(force = false) {
    // 1. Try Nepseman
    try {
      const list = await this.executeWithBackoff(() => this.nepseman.companyList(), 'getCompanyList (Nepseman)');
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (_) {}

    // 2. Try Rumess
    try {
      const list2 = await this.executeWithBackoff(() => this.rumess.getCompanyList(force), 'getCompanyList (Rumess)');
      if (Array.isArray(list2) && list2.length > 0) return list2;
    } catch (_) {}
    return [];
  }

  /**
   * Retrieves live market or last closing session data based on market hours.
   * Uses Nepseman WASM todayPrice (has live ticks during open session, closing data when closed).
   */
  async getLiveOrClosingMarket() {
    const status = await this.getMarketStatus();
    const isOpen = status?.isOpen === 'OPEN';

    // 1. Primary: Nepseman todayPrice (Has continuous real-time ticks during open hours, and official closing records when closed)
    try {
      const prices = await this.executeWithBackoff(
        () => this.nepseman.todayPrice(),
        'todayPrice (Nepseman WASM)'
      );
      if (Array.isArray(prices) && prices.length > 50) {
        const enrichedPrices = prices.map(item => {
          const ltp = Number(item.lastUpdatedPrice ?? item.lastTradedPrice ?? item.closePrice ?? 0);
          const prevClose = Number(item.previousDayClosePrice ?? item.previousClose ?? ltp);
          const change = Number((ltp - prevClose).toFixed(2));
          const pChange = Number((prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0).toFixed(2));
          return {
            ...item,
            symbol: item.symbol,
            securityName: item.securityName || item.symbol,
            openPrice: Number(item.openPrice ?? ltp),
            highPrice: Number(item.highPrice ?? ltp),
            lowPrice: Number(item.lowPrice ?? ltp),
            closePrice: Number(item.closePrice ?? ltp),
            lastTradedPrice: ltp,
            lastUpdatedPrice: ltp,
            ltp,
            previousClose: prevClose,
            previousDayClosePrice: prevClose,
            pointChange: change,
            change,
            percentageChange: pChange,
            pChange,
            totalTradedQuantity: Number(item.totalTradedQuantity ?? 0),
            totalTradedValue: Number(item.totalTradedValue ?? 0),
            totalTrades: Number(item.totalTrades ?? 0)
          };
        });
        this.lastKnownSnapshot.todayPrices = enrichedPrices;
        saveSnapshot({ todayPrices: enrichedPrices });
        return {
          isOpen,
          marketStatus: isOpen ? 'OPEN' : 'CLOSED',
          data: enrichedPrices,
          source: isOpen ? 'LIVE_EXCHANGE_NOTS' : 'NEPSE_OFFICIAL_CLOSING_SESSION',
          asOf: status?.asOf || new Date().toISOString(),
          isStale: false
        };
      }
    } catch (e) {
      console.warn('[nepse-manager] Nepseman todayPrice query failed:', e.message);
    }

    // 2. Secondary: Rumess liveMarket (Active live ticks during trading hours)
    if (isOpen) {
      try {
        const livePrices = await this.executeWithBackoff(
          () => this.rumess.getLiveMarket(),
          'getLiveMarket (Rumess Live)'
        );
        if (Array.isArray(livePrices) && livePrices.length > 20) {
          const enrichedLive = livePrices.map(item => {
            const ltp = Number(item.lastTradedPrice ?? item.lastUpdatedPrice ?? item.closePrice ?? 0);
            const prevClose = Number(item.previousClose ?? item.previousDayClosePrice ?? ltp);
            const change = Number((ltp - prevClose).toFixed(2));
            const pChange = Number((prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0).toFixed(2));
            return {
              ...item,
              symbol: item.symbol,
              securityName: item.securityName || item.symbol,
              openPrice: Number(item.openPrice ?? ltp),
              highPrice: Number(item.highPrice ?? ltp),
              lowPrice: Number(item.lowPrice ?? ltp),
              closePrice: Number(item.closePrice ?? ltp),
              lastTradedPrice: ltp,
              lastUpdatedPrice: ltp,
              ltp,
              previousClose: prevClose,
              previousDayClosePrice: prevClose,
              pointChange: change,
              change,
              percentageChange: pChange,
              pChange,
              totalTradedQuantity: Number(item.totalTradedQuantity ?? item.volume ?? 0),
              totalTradedValue: Number(item.totalTradedValue ?? item.turnover ?? 0),
              totalTrades: Number(item.totalTrades ?? item.transactions ?? 0)
            };
          });
          this.lastKnownSnapshot.todayPrices = enrichedLive;
          saveSnapshot({ todayPrices: enrichedLive });
          return {
            isOpen: true,
            marketStatus: 'OPEN',
            data: enrichedLive,
            source: 'LIVE_EXCHANGE_NOTS',
            asOf: status?.asOf || new Date().toISOString(),
            isStale: false
          };
        }
      } catch (e) {
        console.warn('[nepse-manager] Rumess liveMarket failed:', e.message);
      }
    }

    // 3. Tertiary: Rumess today-prices (Official closing records)
    try {
      const todayPrices = await this.executeWithBackoff(
        () => this.rumess.getTodaysPriceVolumeHistory({ page: 0, size: 500 }),
        'getTodaysPriceVolumeHistory (Rumess Closing)'
      );
      const content = todayPrices?.content || todayPrices;
      if (Array.isArray(content) && content.length > 50) {
        this.lastKnownSnapshot.todayPrices = content;
        saveSnapshot({ todayPrices: content });
        return {
          isOpen,
          marketStatus: isOpen ? 'OPEN' : 'CLOSED',
          data: content,
          source: isOpen ? 'LIVE_EXCHANGE_NOTS' : 'NEPSE_OFFICIAL_CLOSING_SESSION',
          asOf: status?.asOf || new Date().toISOString(),
          isStale: false
        };
      }
    } catch (e) {
      console.warn('[nepse-manager] Rumess today-prices failed:', e.message);
    }

    // 4. Fallback: Persistent disk/memory snapshot
    if (this.lastKnownSnapshot.todayPrices?.length > 0) {
      return {
        isOpen,
        marketStatus: isOpen ? 'OPEN' : 'CLOSED',
        data: this.lastKnownSnapshot.todayPrices,
        source: 'LAST_KNOWN_OFFICIAL_SNAPSHOT',
        asOf: status?.asOf || new Date().toISOString(),
        isStale: true,
        message: 'Serving last verified market snapshot.'
      };
    }

    return {
      isOpen,
      marketStatus: isOpen ? 'OPEN' : 'CLOSED',
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

    // Attempt 1: Direct NEPSE NOTS API via Nepseman WASM Session
    try {
      const nepsemanHist = await this.executeWithBackoff(
        () => this.nepseman.priceHistory(rawSymbol, startDate, endDate, Math.min(length, 500)),
        `NepsemanPriceHistory ${rawSymbol}`
      );
      if (Array.isArray(nepsemanHist) && nepsemanHist.length > 0) {
        rows = nepsemanHist.map(h => ({
          date: h.businessDate,
          open: parseFloat(h.openPrice || h.closePrice || h.closingPrice || 0),
          high: parseFloat(h.highPrice || h.closePrice || h.closingPrice || 0),
          low: parseFloat(h.lowPrice || h.closePrice || h.closingPrice || 0),
          close: parseFloat(h.closePrice || h.closingPrice || h.lastTradedPrice || 0),
          volume: parseFloat(h.totalTradedQuantity || h.tradedQuantity || 0),
          turnover: parseFloat(h.totalTradedValue || h.amount || 0),
          trades: parseInt(h.totalTrades || 0, 10),
          source: 'NEPSE_NOTS'
        })).filter(r => r.close > 0);
      }
    } catch (nepErr) {
      console.warn(`[nepse-manager] Nepseman price history failed for ${rawSymbol}:`, nepErr.message);
    }

    // Attempt 1B: Rumess NOTS keymap endpoint fallback
    if (rows.length === 0 && securityId) {
      try {
        const endpoint = `/api/nots/market/security/price/${securityId}?page=0&size=${Math.min(length, 500)}&sort=businessDate,desc`;
        const res = await this.executeWithBackoff(() => this.rumess.requestGETAPI(endpoint), `RumessSecurityPriceHistory ${rawSymbol}`);
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
          })).filter(r => r.close > 0);
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
    try {
      const g = await this.executeWithBackoff(() => this.nepseman.indexGraph('nepse'), 'getNepseIndexDailyGraph (Nepseman)');
      if (Array.isArray(g) && g.length > 0) return g;
    } catch (_) {}
    try {
      return await this.executeWithBackoff(() => this.rumess.getNepseIndexDailyGraph(), 'getNepseIndexDailyGraph (Rumess)');
    } catch (e) {
      throw e;
    }
  }

  async getFloorSheet(options) {
    try {
      return await this.executeWithBackoff(() => this.nepseman.floorSheet(options), 'getFloorSheet (Nepseman)');
    } catch (e1) {
      try {
        console.warn('[nepse-manager] Nepseman floorSheet failed. Trying Rumess engine...');
        return await this.rumess.getFloorSheet(options);
      } catch (_) {}
      throw e1;
    }
  }

  async getSecurityDetails(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.nepseman.companyDetails(symbol), `getSecurityDetails ${symbol} (Nepseman)`);
    } catch (e1) {
      try {
        return await this.rumess.getSecurityDetails(symbol, force);
      } catch (_) {}
      throw e1;
    }
  }

  async getSecurityDailyGraph(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.nepseman.dailyGraph(symbol), `getSecurityDailyGraph ${symbol} (Nepseman)`);
    } catch (e1) {
      try {
        return await this.rumess.getSecurityDailyGraph(symbol, force);
      } catch (_) {}
      throw e1;
    }
  }

  async getMarketDepth(symbol, force) {
    try {
      return await this.executeWithBackoff(() => this.nepseman.marketDepth(symbol), `getMarketDepth ${symbol} (Nepseman)`);
    } catch (e1) {
      try {
        return await this.rumess.getMarketDepth(symbol, force);
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenGainers() {
    try {
      return await this.executeWithBackoff(() => this.nepseman.topGainers(), 'getTopTenGainers (Nepseman)');
    } catch (e1) {
      try {
        return await this.rumess.getTopTenGainers();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenLosers() {
    try {
      return await this.executeWithBackoff(() => this.nepseman.topLosers(), 'getTopTenLosers (Nepseman)');
    } catch (e1) {
      try {
        return await this.rumess.getTopTenLosers();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTradeScrips() {
    try {
      return await this.executeWithBackoff(() => this.nepseman.topTrade(), 'getTopTenTradeScrips (Nepseman)');
    } catch (e1) {
      try {
        return await this.rumess.getTopTenTradeScrips();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTurnoverScrips() {
    try {
      return await this.executeWithBackoff(() => this.nepseman.topTurnover(), 'getTopTenTurnoverScrips (Nepseman)');
    } catch (e1) {
      try {
        return await this.rumess.getTopTenTurnoverScrips();
      } catch (_) {}
      throw e1;
    }
  }

  async getTopTenTransactionScrips() {
    try {
      return await this.executeWithBackoff(() => this.nepseman.topTransaction(), 'getTopTenTransactionScrips (Nepseman)');
    } catch (e1) {
      try {
        return await this.rumess.getTopTenTransactionScrips();
      } catch (_) {}
      throw e1;
    }
  }

  async getLiveMarket() {
    try {
      const prices = await this.executeWithBackoff(() => this.nepseman.todayPrice(), 'getLiveMarket via todayPrice (Nepseman)');
      if (Array.isArray(prices) && prices.length > 0) return prices;
    } catch (e1) {
      try {
        return await this.rumess.getLiveMarket();
      } catch (_) {}
      throw e1;
    }
  }

  async getTodaysPriceVolumeHistory(options) {
    try {
      const prices = await this.executeWithBackoff(() => this.nepseman.todayPrice(options?.businessDate), 'getTodaysPriceVolumeHistory (Nepseman)');
      if (Array.isArray(prices) && prices.length > 0) return prices;
    } catch (e1) {
      try {
        return await this.rumess.getTodaysPriceVolumeHistory(options);
      } catch (_) {}
      throw e1;
    }
  }
}

export const nepseManager = new UnifiedNepseClient();
export default nepseManager;
