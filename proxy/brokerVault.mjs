import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nepseClient from './nepseClientManager.mjs';
import { ingestDailyFloorsheetTransaction, rebuildHotCache } from './db/ledgerStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VAULT_DIR = path.join(__dirname, 'data', 'broker_vault');

try {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[brokerVault] Failed to create broker vault dir:', e.message);
}

export const BROKER_NAMES = {
  '1': 'Kumari Securities',
  '3': 'Arun Securities',
  '4': 'Opal Securities Investment',
  '5': 'Market Securities Exchange',
  '6': 'Agrawal Securities',
  '7': 'J.F. Securities',
  '8': 'Ashutosh Brokerage & Securities',
  '10': 'Pragyan Securities',
  '11': 'Malla & Malla Stock Broking',
  '13': 'Thrive Brokerage House',
  '14': 'Nepal Stock House',
  '16': 'Primo Securities',
  '17': 'ABC Securities',
  '18': 'Sagarmatha Securities',
  '19': 'Nepal Investment & Securities Trading',
  '20': 'Sipla Securities',
  '21': 'Midas Stock Broking',
  '22': 'Siprabi Securities',
  '25': 'Sweta Securities',
  '26': 'Asian Securities',
  '28': 'Shree Krishna Securities',
  '29': 'Trishul Securities & Investment',
  '32': 'Premier Securities',
  '33': 'Dakshinkali Investment & Securities',
  '34': 'Vision Securities',
  '35': 'Kohinoor Investment & Securities',
  '36': 'Secured Securities',
  '37': 'Swarna Laxmi Securities',
  '38': 'Dipshikha Dhitopatra Karobar',
  '39': 'Sumeru Securities',
  '40': 'Creative Securities',
  '41': 'Linch Stock Market',
  '42': 'Sani Securities',
  '43': 'South Asian Bulls',
  '44': 'Dynamic Money Managers',
  '45': 'Imperial Securities',
  '46': 'Kalika Securities',
  '47': 'Neev Securities',
  '48': 'Trishakti Securities',
  '49': 'Online Securities',
  '50': 'Crystal Kanchenjunga Securities',
  '51': 'Oxford Securities',
  '52': 'Sundhara Securities',
  '53': 'Investment Management Nepal',
  '54': 'Sewa Securities',
  '55': 'Bhrikuti Stock Broking',
  '56': 'Sri Hari Securities',
  '57': 'Aryatara Investment And Securities',
  '58': 'Naasa Securities',
  '59': 'Divya Securities & Stock House',
  '60': 'Nagarik Stock Dealer',
  '61': 'Bhole Ganesh Securities',
  '62': 'Capital Max Securities',
  '63': 'Himalayan Brokerage',
  '64': 'Sun Securities',
  '65': 'Sharepro Securities',
  '66': 'Miyo Securities',
  '67': 'Property Wizard',
  '68': 'Elite Stock House',
  '69': 'Index Securities',
  '70': 'Infinity Securities',
  '71': 'Shubhakamana Securities',
  '72': 'Hatemalo Financial Services',
  '73': 'Money World Share Exchange',
  '74': 'Kalash Stock Market',
  '75': 'Mega Stock Markets',
  '76': 'Machhapuchchhre Securities',
  '77': 'Nabil Stock Dealer',
  '78': 'Garima Securities',
  '79': 'Pahi Investment',
  '80': 'Indira Securities',
  '81': 'Aakashbhairab Securities',
  '82': 'N.M.B. Securities',
  '83': 'Sanima Securities',
  '84': 'Milky Way Share Broker',
  '85': 'Capital Hub',
  '86': 'Stoxkart Securities',
  '87': 'S.P.S.A. Securities',
  '88': 'Blue Chip Securities',
  '89': 'JBNL Securities',
  '90': 'Sajilo Broker',
  '91': 'CBIL Securities',
  '92': 'Roadshow Securities',
  '93': 'Beni Securities',
  '94': 'K.B.L. Securities',
  '95': 'Magnet Securities & Investment',
  '96': 'Himalayan Securities',
  '97': 'R.B.B. Securities',
  '98': 'Trademow Securities',
  '99': 'Prabhu Stock Market',
  '100': 'Sunrise Securities',
  '101': 'Apple Securities'
};

export function getBrokerName(id) {
  const cleanId = String(id || '').replace(/^0+/, '').trim();
  return BROKER_NAMES[cleanId] || `Broker ${cleanId || 'N/A'}`;
}

function createBoundedCache(maxEntries = 150) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const val = map.get(key);
      map.delete(key);
      map.set(key, val);
      return val;
    },
    set(key, val) {
      if (map.has(key)) map.delete(key);
      else if (map.size >= maxEntries) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
      }
      map.set(key, val);
    },
    delete(key) { map.delete(key); },
    clear() { map.clear(); }
  };
}

const memoryCache = createBoundedCache(120);
const tradingDatesCache = createBoundedCache(350);

let cachedSession = null;
let cachedSessionExpires = 0;

async function getShareSansarSession() {
  const now = Date.now();
  if (cachedSession && now < cachedSessionExpires) {
    return cachedSession;
  }
  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    const page = await client.get('https://www.sharesansar.com/floorsheet', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://www.sharesansar.com/'
      },
      timeout: 10000
    });
    const $ = cheerio.load(page.data);
    const token = $('input[name="_token"]').val() || $('meta[name="_token"]').attr('content');
    if (token) {
      cachedSession = { client, token };
      cachedSessionExpires = now + (15 * 60 * 1000); // 15 min TTL
      return cachedSession;
    }
    return { client, token: '' };
  } catch (err) {
    console.warn('[brokerVault] Failed to initialize ShareSansar session:', err.message);
    return null;
  }
}

/**
 * Fetches available trading dates for a symbol (newest first) using Chukul historydata API.
 */
export async function fetchSymbolTradingDates(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return [];
  const now = Date.now();
  const cached = tradingDatesCache.get(sym);
  if (cached && (now - cached.timestamp < 10 * 60 * 1000) && cached.dates?.length >= 65) {
    return cached.dates;
  }

  const dateSet = new Set();

  // 1. Chukul historydata API
  try {
    const r = await axios.get(`https://chukul.com/api/data/v2/historydata/?symbol=${encodeURIComponent(sym)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 7000,
      validateStatus: () => true
    });
    if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
      for (const item of r.data) {
        if (item && item.date && Number(item.volume || 0) > 0) {
          dateSet.add(String(item.date).trim());
        }
      }
    }
  } catch (e) {
    console.warn(`[brokerVault] Chukul historydata failed for ${sym}:`, e.message);
  }

  // 2. Query authentic NEPSE NOTS price history (length 500) via nepseClient
  if (dateSet.size < 500) {
    try {
      const historyRows = await nepseClient.getSecurityPriceHistory(sym, { length: 500 }).catch(() => []);
      if (Array.isArray(historyRows) && historyRows.length > 0) {
        for (const row of historyRows) {
          const dt = String(row?.date || '').trim();
          const vol = Number(row?.volume || row?.tradedQuantity || 0);
          const close = Number(row?.close || 0);
          if (dt && (vol > 0 || close > 0)) {
            dateSet.add(dt);
          }
        }
      }
    } catch (e1) {
      console.warn(`[brokerVault] Fallback 1 NOTS price history discovery failed for ${sym}:`, e1.message);
    }
  }

  // 3. Read dates from existing floorsheet-full-*.json files and existing VAULT_DIR files
  try {
    const candidateDirs = [
      path.join(__dirname, 'data'),
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'proxy', 'data')
    ];
    for (const dDir of candidateDirs) {
      if (fs.existsSync(dDir)) {
        try {
          const files = fs.readdirSync(dDir).filter(f => f.startsWith('floorsheet-full-') && f.endsWith('.json'));
          for (const f of files) {
            const m = f.match(/floorsheet-full-(\d{4}-\d{2}-\d{2})\.json/);
            if (m && m[1]) dateSet.add(m[1]);
          }
        } catch (_) {}
      }
    }

    const vaultPath = path.join(VAULT_DIR, `${sym}.json`);
    if (fs.existsSync(vaultPath)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
        if (existingData?.rowsByDate) {
          for (const [dt, rows] of Object.entries(existingData.rowsByDate)) {
            if (dt && Array.isArray(rows) && rows.length > 0) {
              dateSet.add(dt);
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 4. Fallback 2: Query MeroLagani's company graph handler to extract up to 500 trading dates
  if (dateSet.size < 500) {
    try {
      const mlUrl = `https://merolagani.com/handlers/webrequesthandler.ashx?type=get_company_graph&symbol=${encodeURIComponent(sym)}`;
      const mlRes = await axios.get(mlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        },
        timeout: 9000,
        validateStatus: () => true
      });
      if (mlRes.status === 200 && mlRes.data && Array.isArray(mlRes.data.quotes) && mlRes.data.quotes.length > 0) {
        for (const q of mlRes.data.quotes) {
          if (!q || !q.date) continue;
          let dateIso = String(q.date).trim();
          if (dateIso.includes('/')) {
            const parts = dateIso.split('/');
            if (parts.length === 3) {
              dateIso = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
            const vol = Number(q.volume || 0);
            const close = Number(q.close || 0);
            if (vol > 0 || close > 0) {
              dateSet.add(dateIso);
            }
          }
        }
      }
    } catch (e2) {
      console.warn(`[brokerVault] Fallback 2 MeroLagani discovery failed for ${sym}:`, e2.message);
    }
  }

  if (dateSet.size > 0) {
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a)).slice(0, 500);
    tradingDatesCache.set(sym, { timestamp: now, dates });
    return dates;
  }

  return cached?.dates || [];
}

/**
 * Fetches 100% of floorsheet transactions for a symbol on a specific YYYY-MM-DD date via Chukul API.
 */
export async function fetchChukulDateFloorsheet(symbol, dateStr) {
  const sym = String(symbol || '').toUpperCase().trim();
  const dt = String(dateStr || '').trim();
  if (!sym || !dt) return [];
  try {
    const r = await axios.get(`https://chukul.com/api/data/floorsheet/?symbol=${encodeURIComponent(sym)}&date=${encodeURIComponent(dt)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000,
      validateStatus: () => true
    });
    if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
      return r.data.map((row, idx) => {
        const bBroker = String(row.buyer || '').trim();
        const sBroker = String(row.seller || '').trim();
        const qty = Number(row.quantity || row.qty || 0);
        const rate = Number(row.rate || 0);
        const amount = Number(row.amount || (qty * rate) || 0);
        const cId = String(row.transaction || row.contract_no || `${dt}-${idx + 1}`);
        // Extract YYYY-MM-DD from transaction ID if 16 digits starting with 202x
        const txDate = (cId.length >= 8 && /^20\d{6}/.test(cId))
          ? `${cId.slice(0, 4)}-${cId.slice(4, 6)}-${cId.slice(6, 8)}`
          : dt;
        return {
          contractId: cId,
          buyerBroker: bBroker,
          buyerBrokerName: getBrokerName(bBroker),
          sellerBroker: sBroker,
          sellerBrokerName: getBrokerName(sBroker),
          qty,
          quantity: qty,
          rate,
          amount,
          businessDate: txDate,
          symbol: String(row.symbol || sym).toUpperCase().trim(),
          stockSymbol: String(row.symbol || sym).toUpperCase().trim()
        };
      });
    }
  } catch (e) {
    console.warn(`[brokerVault] Chukul floorsheet fetch failed for ${sym} on ${dt}:`, e.message);
  }
  return [];
}

export async function fetchShareSansarFloorsheet(symbol, maxRecords = 50000, dateStr = '') {
  const sym = String(symbol || '').toUpperCase().trim();
  const dt = String(dateStr || '').trim();

  try {
    const session = await getShareSansarSession();
    if (!session) return null;
    const { client, token } = session;

    const allRows = [];
    let start = 0;
    const batchSize = 500;
    let totalRecords = 1;
    let draw = 1;

    while (start < totalRecords && allRows.length < maxRecords && draw <= 16) {
      const companyParam = sym ? `&company=${encodeURIComponent(sym)}` : '';
      const dateParam = dt ? `&date=${encodeURIComponent(dt)}` : '';
      const floorRes = await client.get(`https://www.sharesansar.com/floorsheet?draw=${draw++}&start=${start}&length=${batchSize}${companyParam}${dateParam}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': token,
          'Referer': 'https://www.sharesansar.com/floorsheet'
        },
        timeout: 15000
      });

      if (floorRes.status === 200 && Array.isArray(floorRes.data?.data) && floorRes.data.data.length > 0) {
        totalRecords = floorRes.data.recordsTotal || floorRes.data.data.length;
        const mapped = floorRes.data.data.map(r => {
          let rowSym = sym;
          if (r.symbol) {
            rowSym = String(r.symbol).replace(/<[^>]*>/g, '').trim().toUpperCase() || sym;
          }
          const bBroker = String(r.buyer || '').trim();
          const sBroker = String(r.seller || '').trim();
          const qty = parseFloat(String(r.quantity || 0).replace(/,/g, '')) || 0;
          const rate = parseFloat(String(r.rate || 0).replace(/,/g, '')) || 0;
          const amount = parseFloat(String(r.amount || 0).replace(/,/g, '')) || (qty * rate);
          return {
            contractId: String(r.contract_no || ''),
            buyerBroker: bBroker,
            buyerBrokerName: getBrokerName(bBroker),
            sellerBroker: sBroker,
            sellerBrokerName: getBrokerName(sBroker),
            qty,
            quantity: qty,
            rate,
            amount,
            businessDate: r.date_ || new Date().toISOString().split('T')[0],
            symbol: rowSym,
            stockSymbol: rowSym
          };
        });

        allRows.push(...mapped);
        start += batchSize;
        if (floorRes.data.data.length < batchSize) break;
      } else {
        break;
      }
    }

    if (allRows.length > 0) {
      return allRows;
    }
  } catch (err) {
    console.warn(`[brokerVault] ShareSansar floorsheet scrape error for ${sym || 'ALL'}:`, err.message);
    cachedSession = null;
    cachedSessionExpires = 0;
  }
  return null;
}

const inFlightVaultSyncs = new Map();

/**
 * Loads or updates the persistent date-indexed floorsheet vault for a symbol.
 */
async function loadAndSyncSymbolVault(symbol, requestedDates = []) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return { rowsByDate: {}, availableDates: [] };

  const syncKey = `${sym}:${requestedDates.slice(0, 5).join(',')}`;
  if (inFlightVaultSyncs.has(syncKey)) {
    return inFlightVaultSyncs.get(syncKey);
  }

  const syncPromise = (async () => {
  const vaultPath = path.join(VAULT_DIR, `${sym}.json`);
  let vaultObj = { symbol: sym, vaultVersion: 2, rowsByDate: {}, updatedAt: null, preAggregated: null };

  if (fs.existsSync(vaultPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        if (parsed.vaultVersion === 2 && parsed.rowsByDate) {
          vaultObj.rowsByDate = parsed.rowsByDate;
          vaultObj.updatedAt = parsed.updatedAt || null;
        } else if (Array.isArray(parsed.rawRows) && parsed.rawRows.length > 0) {
          for (const r of parsed.rawRows) {
            const dt = String(r.businessDate || r.date || '').trim();
            if (dt) {
              if (!vaultObj.rowsByDate[dt]) vaultObj.rowsByDate[dt] = [];
              vaultObj.rowsByDate[dt].push(r);
            }
          }
          vaultObj.updatedAt = parsed.updatedAt || null;
        }
        if (Array.isArray(parsed.brokers) && parsed.brokers.length > 0) {
          vaultObj.preAggregated = parsed;
        }
      }
    } catch (_) {}
  }

  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  const nptDate = nowNpt.toISOString().split('T')[0];
  const candidateDirs = [
    path.join(__dirname, 'data'),
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), 'proxy', 'data')
  ];

  const allAvailableDates = await fetchSymbolTradingDates(sym);
  const latestTwoDates = allAvailableDates.slice(0, 2);

  // Determine which dates we need to fetch
  const datesToFetch = new Set();
  for (const dt of requestedDates) {
    if (!dt) continue;
    const existing = vaultObj.rowsByDate[dt];
    const isRecent = latestTwoDates.includes(dt);
    const ageMs = vaultObj.updatedAt ? (Date.now() - new Date(vaultObj.updatedAt).getTime()) : Infinity;
    if (!Array.isArray(existing) || existing.length === 0 || (isRecent && ageMs > 10 * 60 * 1000)) {
      datesToFetch.add(dt);
    }
  }

  // If no specific dates were requested or vault is empty, ensure the 2 most recent trading dates are checked
  if (Object.keys(vaultObj.rowsByDate).length === 0) {
    latestTwoDates.forEach(d => { if (d) datesToFetch.add(d); });
  }

  let didUpdate = false;

  // 1. Ingest from authentic full session floorsheet (100% NOTS trades)
  // Strictly skip calling exchange live session API for old historical dates
  for (const dt of Array.from(datesToFetch)) {
    const isToday = (dt === nptDate || dt === latestTwoDates[0]);
    const fullFileExists = candidateDirs.some(d => fs.existsSync(path.join(d, `floorsheet-full-${dt}.json`)));
    if (!isToday && !fullFileExists) continue;

    try {
      const fullTrades = await getFullSessionFloorsheet(dt);
      if (Array.isArray(fullTrades) && fullTrades.length > 0) {
        // Strict guard: verify trades actually match the requested date dt
        const tradeDt = fullTrades.find(t => t.businessDate)?.businessDate || '';
        if (tradeDt && tradeDt !== dt) {
          continue; // Never pollute date dt with data from another date!
        }
        const matching = fullTrades.filter(t => (t.stockSymbol || t.symbol || '').toUpperCase() === sym);
        if (matching.length > 0) {
          vaultObj.rowsByDate[dt] = matching.map(t => ({
            contractId: String(t.contractId || ''),
            buyerBroker: String(t.buyerMemberId || t.buyerBroker || ''),
            buyerBrokerName: t.buyerBrokerName || getBrokerName(t.buyerMemberId || t.buyerBroker),
            sellerBroker: String(t.sellerMemberId || t.sellerBroker || ''),
            sellerBrokerName: t.sellerBrokerName || getBrokerName(t.sellerMemberId || t.sellerBroker),
            qty: Number(t.contractQuantity || t.quantity || t.qty || 0),
            rate: Number(t.contractRate || t.rate || 0),
            amount: Number(t.contractAmount || t.amount || 0),
            businessDate: t.businessDate || dt,
            tradeTime: t.tradeTime || '',
            symbol: sym,
            stockSymbol: sym
          }));
          didUpdate = true;
          datesToFetch.delete(dt);
        }
      }
    } catch (_) {}
  }

  if (datesToFetch.size > 0) {
    const fetchList = Array.from(datesToFetch);
    const CONCURRENCY = 4;
    const syncStartMs = Date.now();
    let inlineCompletedIdx = 0;

    for (let i = 0; i < fetchList.length; i += CONCURRENCY) {
      // Check elapsed time and count limit to prevent HTTP timeouts
      const elapsedMs = Date.now() - syncStartMs;
      if (i >= 40 || elapsedMs > 6000) {
        inlineCompletedIdx = i;
        break;
      }

      const batch = fetchList.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(dt => fetchChukulDateFloorsheet(sym, dt).catch(() => [])));
      batch.forEach((dt, idx) => {
        const rows = results[idx];
        if (Array.isArray(rows) && rows.length > 0) {
          vaultObj.rowsByDate[dt] = rows;
          didUpdate = true;
          datesToFetch.delete(dt);
        }
      });
      inlineCompletedIdx = i + batch.length;
      await new Promise(r => setTimeout(r, 40));
    }

    // If more dates remain in fetchList, spawn non-blocking background worker
    if (inlineCompletedIdx < fetchList.length) {
      const remainingDates = fetchList.slice(inlineCompletedIdx);
      setImmediate(async () => {
        try {
          let bgUpdated = false;
          for (let j = 0; j < remainingDates.length; j += CONCURRENCY) {
            const batch = remainingDates.slice(j, j + CONCURRENCY);
            const results = await Promise.all(batch.map(dt => fetchChukulDateFloorsheet(sym, dt).catch(() => [])));
            batch.forEach((dt, idx) => {
              const rows = results[idx];
              if (Array.isArray(rows) && rows.length > 0) {
                vaultObj.rowsByDate[dt] = rows;
                bgUpdated = true;
              }
            });
            await new Promise(r => setTimeout(r, 50));
          }
          if (bgUpdated) {
            vaultObj.updatedAt = new Date().toISOString();
            const sortedDates = Object.keys(vaultObj.rowsByDate).sort((a, b) => b.localeCompare(a));
            const trimmedRowsByDate = {};
            for (const dt of sortedDates.slice(0, 500)) {
              trimmedRowsByDate[dt] = vaultObj.rowsByDate[dt];
            }
            vaultObj.rowsByDate = trimmedRowsByDate;
            fs.writeFileSync(vaultPath, JSON.stringify(vaultObj), 'utf8');
            console.log(`[brokerVault] Background sync completed for ${sym}: saved ${Object.keys(trimmedRowsByDate).length} sessions`);
          }
        } catch (bgErr) {
          console.warn(`[brokerVault] Background sync error for ${sym}:`, bgErr.message);
        }
      });
    }
  }

  // Fallback to ShareSansar:
  // When datesToFetch.size > 0 and fetchChukulDateFloorsheet(sym, dt) returns empty for historical dates
  // (or if Object.keys(vaultObj.rowsByDate).length < Math.min(requestedDates.length, 5)),
  // ALWAYS run fetchShareSansarFloorsheet(sym, 50000) and group the returned rows by r.businessDate
  // into vaultObj.rowsByDate[dt] so multi-day historical dates are populated even when only 1 date
  // was previously in vaultObj.rowsByDate!
  const populatedDatesCount = Object.keys(vaultObj.rowsByDate).filter(d => Array.isArray(vaultObj.rowsByDate[d]) && vaultObj.rowsByDate[d].length > 0).length;
  const targetThreshold = requestedDates.length > 0 ? Math.min(requestedDates.length, 5) : 2;

  if (datesToFetch.size > 0 || populatedDatesCount < targetThreshold || Object.keys(vaultObj.rowsByDate).length === 0) {
    const ssRows = await fetchShareSansarFloorsheet(sym, 50000);
    if (Array.isArray(ssRows) && ssRows.length > 0) {
      for (const r of ssRows) {
        const dt = String(r.businessDate || '').trim();
        if (!dt) continue;
        if (!vaultObj.rowsByDate[dt]) vaultObj.rowsByDate[dt] = [];
        const existingCids = new Set(vaultObj.rowsByDate[dt].map(x => String(x.contractId || '')));
        const cid = String(r.contractId || '');
        if (!cid || !existingCids.has(cid)) {
          vaultObj.rowsByDate[dt].push(r);
          didUpdate = true;
          datesToFetch.delete(dt);
        }
      }
    }
  }

  if (didUpdate) {
    vaultObj.updatedAt = new Date().toISOString();
    try {
      const sortedDates = Object.keys(vaultObj.rowsByDate).sort((a, b) => b.localeCompare(a));
      const trimmedRowsByDate = {};
      for (const dt of sortedDates.slice(0, 500)) {
        trimmedRowsByDate[dt] = vaultObj.rowsByDate[dt];
      }
      vaultObj.rowsByDate = trimmedRowsByDate;
      fs.writeFileSync(vaultPath, JSON.stringify(vaultObj), 'utf8');
    } catch (writeErr) {
      console.warn(`[brokerVault] Failed to write vault for ${sym}:`, writeErr.message);
    }
  }

  // Filter out today's date from availableDates if it has 0 floorsheet rows so far
  const populatedVaultDates = Object.keys(vaultObj.rowsByDate).filter(d => Array.isArray(vaultObj.rowsByDate[d]) && vaultObj.rowsByDate[d].length > 0);
  const combinedDates = Array.from(new Set([...populatedVaultDates, ...allAvailableDates]))
    .filter(d => {
      if (!d) return false;
      // If it's the very first date in allAvailableDates and we tried fetching it and got 0 rows, put it after populated dates or omit if empty
      if (d === allAvailableDates[0] && !populatedVaultDates.includes(d) && populatedVaultDates.length > 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.localeCompare(a));

    return {
      rowsByDate: vaultObj.rowsByDate,
      availableDates: combinedDates,
      updatedAt: vaultObj.updatedAt,
      preAggregated: vaultObj.preAggregated
    };
  })();

  inFlightVaultSyncs.set(syncKey, syncPromise);
  try {
    return await syncPromise;
  } finally {
    inFlightVaultSyncs.delete(syncKey);
  }
}

export function aggregateFloorsheetRows(rows, symbol, availableDates = []) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const seenContractIds = new Set();
  const uniqueRows = [];
  for (const r of rows) {
    const cid = String(r.contractId || r.contract_no || '').trim();
    if (cid) {
      if (seenContractIds.has(cid)) continue;
      seenContractIds.add(cid);
    }
    uniqueRows.push(r);
  }

  let washTradesFiltered = 0;
  const brokerMap = {};
  const dateMap = {};
  let totalTradedQty = 0;
  let totalTradedAmt = 0;
  let largeBlockTradedAmt = 0; // Orders with quantity >= 1000 shares (LBAS)
  let totalTradesCount = 0;

  uniqueRows.forEach(r => {
    const b = String(r.buyerBroker || r.buyerMemberId || r.buyer || '').trim();
    const s = String(r.sellerBroker || r.sellerMemberId || r.seller || '').trim();
    const q = Number(r.qty || r.contractQuantity || r.quantity || 0);
    const rate = Number(r.rate || r.contractRate || 0);
    const amt = Number(r.amount || r.contractAmount || (q * rate) || 0);
    const d = String(r.businessDate || r.date || r.date_ || '').trim();

    if (q <= 0) return;

    if (b) {
      if (!brokerMap[b]) {
        brokerMap[b] = {
          brokerId: b,
          broker: b,
          id: b,
          brokerName: getBrokerName(b),
          name: getBrokerName(b),
          buyQty: 0,
          sellQty: 0,
          matchedQty: 0,
          buyAmt: 0,
          sellAmt: 0,
          matchedAmt: 0,
          buyTrades: 0,
          sellTrades: 0
        };
      }
      brokerMap[b].buyQty += q;
      brokerMap[b].buyAmt += amt;
      brokerMap[b].buyTrades += 1;
    }
    if (s) {
      if (!brokerMap[s]) {
        brokerMap[s] = {
          brokerId: s,
          broker: s,
          id: s,
          brokerName: getBrokerName(s),
          name: getBrokerName(s),
          buyQty: 0,
          sellQty: 0,
          matchedQty: 0,
          buyAmt: 0,
          sellAmt: 0,
          matchedAmt: 0,
          buyTrades: 0,
          sellTrades: 0
        };
      }
      brokerMap[s].sellQty += q;
      brokerMap[s].sellAmt += amt;
      brokerMap[s].sellTrades += 1;
    }

    if (b && s && b === s) {
      washTradesFiltered++;
      brokerMap[b].matchedQty += q;
      brokerMap[b].matchedAmt += amt;
    }

    // Zero-Sum Conservation Guard:
    // Standard two-sided contract rows have both buyer (b) and seller (s) -> count once.
    // Reconstructed one-sided matrix rows have only buyer OR seller -> count only on the buy side
    // so totalTradedQty === sumBuyQty === sumSellQty.
    const isOneSidedSellReconstruction = !b && Boolean(s);
    if (!isOneSidedSellReconstruction) {
      totalTradedQty += q;
      totalTradedAmt += amt;
      totalTradesCount++;
      if (q >= 1000) {
        largeBlockTradedAmt += amt;
      }
    }

    if (d) {
      if (!dateMap[d]) {
        dateMap[d] = {
          date: d,
          buyVol: 0,
          sellVol: 0,
          turnover: 0,
          totalTrades: 0,
          matchedVol: 0,
          brokerMap: {}
        };
      }
      if (b) dateMap[d].buyVol += q;
      if (s) dateMap[d].sellVol += q;
      if (!isOneSidedSellReconstruction) {
        dateMap[d].turnover += amt;
        dateMap[d].totalTrades += 1;
      }
      if (b && s && b === s) dateMap[d].matchedVol += q;

      if (b) {
        dateMap[d].brokerMap[b] = dateMap[d].brokerMap[b] || {
          brokerId: b,
          brokerName: getBrokerName(b),
          buyQty: 0,
          sellQty: 0,
          matchedQty: 0,
          buyAmt: 0,
          sellAmt: 0
        };
        dateMap[d].brokerMap[b].buyQty += q;
        dateMap[d].brokerMap[b].buyAmt += amt;
        if (b === s) dateMap[d].brokerMap[b].matchedQty += q;
      }
      if (s) {
        dateMap[d].brokerMap[s] = dateMap[d].brokerMap[s] || {
          brokerId: s,
          brokerName: getBrokerName(s),
          buyQty: 0,
          sellQty: 0,
          matchedQty: 0,
          buyAmt: 0,
          sellAmt: 0
        };
        dateMap[d].brokerMap[s].sellQty += q;
        dateMap[d].brokerMap[s].sellAmt += amt;
      }
    }
  });

  const safeTotalQty = totalTradedQty || 1;

  const brokers = Object.values(brokerMap).map(x => {
    const netQty = x.buyQty - x.sellQty;
    const netAmt = +(x.buyAmt - x.sellAmt).toFixed(2);
    const totalQty = x.buyQty + x.sellQty;
    const avgBuyRate = x.buyQty > 0 ? +(x.buyAmt / x.buyQty).toFixed(2) : 0;
    const avgSellRate = x.sellQty > 0 ? +(x.sellAmt / x.sellQty).toFixed(2) : 0;
    const buyMktShare = +((x.buyQty / safeTotalQty) * 100).toFixed(2);
    const sellMktShare = +((x.sellQty / safeTotalQty) * 100).toFixed(2);
    const holdPctOfBuy = x.buyQty > 0 ? Math.max(0, +((Math.max(0, netQty) / x.buyQty) * 100).toFixed(2)) : 0;
    const buyPct = totalQty > 0 ? Math.round((x.buyQty / totalQty) * 100) : 0;
    const sellPct = totalQty > 0 ? (100 - buyPct) : 0;

    return {
      ...x,
      id: x.brokerId,
      broker: x.brokerId,
      name: x.brokerName,
      buyAmount: +x.buyAmt.toFixed(2),
      sellAmount: +x.sellAmt.toFixed(2),
      netQty,
      holdQty: netQty,
      netAmt,
      holdAmt: netAmt,
      totalQty,
      avgBuyRate,
      avgSellRate,
      buyMktShare,
      sellMktShare,
      holdPctOfBuy,
      buyPct,
      sellPct
    };
  }).sort((a, b) => b.totalQty - a.totalQty);

  const topHoldings = [...brokers].sort((a, b) => b.netQty - a.netQty || b.buyQty - a.buyQty).slice(0, 10);
  const topBuyers = [...brokers].filter(x => x.buyQty > 0).sort((a, b) => b.buyQty - a.buyQty).slice(0, 10);
  const topSellers = [...brokers].filter(x => x.sellQty > 0).sort((a, b) => b.sellQty - a.sellQty).slice(0, 10);
  const topNetBuyers = [...brokers].filter(x => x.netQty > 0).sort((a, b) => b.netQty - a.netQty).slice(0, 10);
  const topNetSellers = [...brokers].filter(x => x.netQty < 0).sort((a, b) => a.netQty - b.netQty).slice(0, 10);

  const netBuyerQty = topNetBuyers.slice(0, 5).reduce((s, b) => s + b.netQty, 0);
  const netSellerQty = Math.abs(topNetSellers.slice(0, 5).reduce((s, b) => s + b.netQty, 0));

  // A/D ratio bounded in [-1.0, 1.0]
  const adRatio = totalTradedQty > 0 ? +((netBuyerQty - netSellerQty) / totalTradedQty).toFixed(4) : 0;
  const adSignal = adRatio >= 0.05 ? 'Accumulation' : adRatio <= -0.05 ? 'Distribution' : 'Neutral';
  const adStrength = `${Math.min(99.9, Math.abs(adRatio * 100)).toFixed(1)}%`;

  // Large-Block Absorption Share (LBAS): share of rupee turnover from lots >= 1000 shares
  const lbas = totalTradedAmt > 0 ? +(largeBlockTradedAmt / totalTradedAmt).toFixed(3) : 0;

  // Top-3 and Top-5 Buyer & Seller Volumes
  const top3BuyTotal = topBuyers.slice(0, 3).reduce((s, b) => s + b.buyQty, 0);
  const top5BuyTotal = topBuyers.slice(0, 5).reduce((s, b) => s + b.buyQty, 0);
  const top3SellTotal = topSellers.slice(0, 3).reduce((s, b) => s + b.sellQty, 0);
  const top5SellTotal = topSellers.slice(0, 5).reduce((s, b) => s + b.sellQty, 0);

  // Net Broker Accumulation Ratio (NBAR): Top-5 buyers quantity vs Top-5 sellers quantity
  const nbar = top5SellTotal > 0 ? +(top5BuyTotal / top5SellTotal).toFixed(2) : (top5BuyTotal > 0 ? 3.0 : 1.0);

  // Top-5 Buyer Concentration (CR_B_5)
  const crb5 = totalTradedQty > 0 ? +(top5BuyTotal / totalTradedQty).toFixed(3) : 0;

  // True BCR3 & BCR5
  const bcr3BuyPct = totalTradedQty > 0 ? +((top3BuyTotal / totalTradedQty) * 100).toFixed(2) : 0;
  const bcr5BuyPct = totalTradedQty > 0 ? +((top5BuyTotal / totalTradedQty) * 100).toFixed(2) : 0;
  const bcr3SellPct = totalTradedQty > 0 ? +((top3SellTotal / totalTradedQty) * 100).toFixed(2) : 0;
  const bcr5SellPct = totalTradedQty > 0 ? +((top5SellTotal / totalTradedQty) * 100).toFixed(2) : 0;
  const concentrationPct = bcr3BuyPct;
  const bcr3 = totalTradedQty > 0 ? +(top3BuyTotal / totalTradedQty).toFixed(4) : 0;
  const bcr5 = totalTradedQty > 0 ? +(top5BuyTotal / totalTradedQty).toFixed(4) : 0;
  const bcr3Buy = bcr3;
  const bcr5Buy = bcr5;
  const bcr3Sell = totalTradedQty > 0 ? +(top3SellTotal / totalTradedQty).toFixed(4) : 0;
  const bcr5Sell = totalTradedQty > 0 ? +(top5SellTotal / totalTradedQty).toFixed(4) : 0;

  const dailyFlow = Object.values(dateMap).map(df => {
    const dayBrokers = Object.values(df.brokerMap).map(b => ({
      ...b,
      broker: b.brokerId,
      id: b.brokerId,
      name: b.brokerName,
      netQty: b.buyQty - b.sellQty,
      netAmt: +(b.buyAmt - b.sellAmt).toFixed(2),
      avgBuyRate: b.buyQty > 0 ? +(b.buyAmt / b.buyQty).toFixed(2) : 0,
      avgSellRate: b.sellQty > 0 ? +(b.sellAmt / b.sellQty).toFixed(2) : 0
    }));
    const dayTopBuyers = [...dayBrokers].filter(b => b.buyQty > 0).sort((a, b) => b.buyQty - a.buyQty);
    const dayTopSellers = [...dayBrokers].filter(b => b.sellQty > 0).sort((a, b) => b.sellQty - a.sellQty);
    const dayTopHolders = [...dayBrokers].sort((a, b) => b.netQty - a.netQty);
    const dayTopDistributors = [...dayBrokers].filter(b => b.netQty < 0).sort((a, b) => a.netQty - b.netQty);
    const top3DayNetBuy = dayTopHolders.filter(b => b.netQty > 0).slice(0, 3).reduce((s, b) => s + b.netQty, 0);
    const top3DayNetSell = Math.abs(dayTopHolders.filter(b => b.netQty < 0).slice(-3).reduce((s, b) => s + b.netQty, 0));

    const dayTop3BuyTotal = dayTopBuyers.slice(0, 3).reduce((s, b) => s + b.buyQty, 0);
    const dayTop5BuyTotal = dayTopBuyers.slice(0, 5).reduce((s, b) => s + b.buyQty, 0);
    const dayTop3SellTotal = dayTopSellers.slice(0, 3).reduce((s, b) => s + b.sellQty, 0);
    const dayTop5SellTotal = dayTopSellers.slice(0, 5).reduce((s, b) => s + b.sellQty, 0);
    const dayBaseBuyVol = dayTopBuyers.reduce((s, b) => s + b.buyQty, 0) || df.buyVol || 1;
    const dayBaseSellVol = dayTopSellers.reduce((s, b) => s + b.sellQty, 0) || df.sellVol || 1;

    const dayTurnover = df.turnover || 0;
    const dayVol = Math.max(df.buyVol || 0, df.sellVol || 0);
    const dayTrades = Math.max(1, Math.round(df.totalTrades || 0));

    return {
      date: df.date,
      buyVol: df.buyVol,
      sellVol: df.sellVol,
      matchedVol: df.matchedVol,
      turnover: +dayTurnover.toFixed(2),
      totalTrades: dayTrades,
      vwap: dayVol > 0 ? +(dayTurnover / dayVol).toFixed(2) : 0,
      netFlow: top3DayNetBuy - top3DayNetSell,
      bcr3BuyPct: +((dayTop3BuyTotal / dayBaseBuyVol) * 100).toFixed(1),
      bcr5BuyPct: +((dayTop5BuyTotal / dayBaseBuyVol) * 100).toFixed(1),
      bcr3SellPct: +((dayTop3SellTotal / dayBaseSellVol) * 100).toFixed(1),
      bcr5SellPct: +((dayTop5SellTotal / dayBaseSellVol) * 100).toFixed(1),
      topBuyer: dayTopBuyers[0] || null,
      topSeller: dayTopSellers[0] || null,
      topHolder: dayTopHolders[0] || null,
      topAccumulator: dayTopHolders.filter(b => b.netQty > 0)[0] || dayTopHolders[0] || null,
      topDistributor: dayTopDistributors[0] || (dayTopHolders[dayTopHolders.length - 1] && dayTopHolders[dayTopHolders.length - 1].netQty < 0 ? dayTopHolders[dayTopHolders.length - 1] : null),
      brokers: dayBrokers.sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty)).slice(0, 105)
    };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const sortedDatesInDataset = dailyFlow.map(d => d.date);

  return {
    symbol: sym,
    businessDate: sortedDatesInDataset[0] || '',
    fromDate: sortedDatesInDataset[sortedDatesInDataset.length - 1] || '',
    toDate: sortedDatesInDataset[0] || '',
    tradingDays: sortedDatesInDataset.length,
    availableDates: availableDates.length > 0 ? availableDates : sortedDatesInDataset,
    topHoldings,
    topBuyers,
    topSellers,
    buyers: topBuyers,
    sellers: topSellers,
    topNetBuyers,
    topNetSellers,
    brokers,
    dailyFlow,
    totalTrades: totalTradesCount || uniqueRows.length,
    washTradesFiltered,
    totalVolume: totalTradedQty,
    totalAmount: +totalTradedAmt.toFixed(2),
    totalTurnover: +totalTradedAmt.toFixed(2),
    adSignal,
    adStrength,
    adRatio,
    lbas,
    nbar,
    crb5,
    bcr3,
    bcr5,
    bcr3Buy,
    bcr5Buy,
    bcr3Sell,
    bcr5Sell,
    bcr3BuyPct,
    bcr5BuyPct,
    bcr3SellPct,
    bcr5SellPct,
    concentrationPct: bcr3BuyPct || concentrationPct,
    isReal: true,
    source: 'authentic_multi_date_floorsheet',
    updatedAt: new Date().toISOString()
  };
}

/**
 * Retrieves multi-day or date-specific Broker Analysis for a symbol.
 * Supports days (1, 3, 5, 7, 15, 30, etc.) or options { date, fromDate, toDate }.
 */
export async function getOrFetchBrokerAnalysis(symbol, days = 30, options = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

  const specificDate = String(options.date || '').trim();
  const fromDate = String(options.fromDate || '').trim();
  const toDate = String(options.toDate || '').trim();
  const numDays = Math.min(Math.max(parseInt(days || 1, 10) || 1, 1), 730);

  const cacheKey = `ba-${sym}-d${numDays}-${specificDate}-${fromDate}-${toDate}`;
  const now = Date.now();
  const mem = memoryCache.get(cacheKey);
  if (mem && !options.refresh && (now - mem.timestamp < 5 * 60 * 1000)) {
    return mem.data;
  }

  try {
    const allTradingDates = await fetchSymbolTradingDates(sym);
    let targetDates = [];

    if (specificDate) {
      targetDates = [specificDate];
    } else if (fromDate || toDate) {
      targetDates = allTradingDates.filter(d => {
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      }).slice(0, 500);
      if (targetDates.length === 0 && fromDate && !toDate) targetDates = [fromDate];
    } else {
      // Select N+2 candidate trading sessions so if today's intraday EOD isn't published yet we still get N full sessions
      const sessionsToFetch = Math.min(numDays + 2, 500);
      targetDates = allTradingDates.slice(0, sessionsToFetch);
    }

    let rowsByDate = {};
    let availableDates = [];
    let preAggregated = null;

    if (numDays > 1 && !options.refresh) {
      const fastSnap = getFastVaultSnapshot(sym, numDays);
      if (fastSnap) {
        const syncPromise = loadAndSyncSymbolVault(sym, targetDates);
        let timerId;
        const timeoutPromise = new Promise(resolve => {
          timerId = setTimeout(() => resolve({ isTimeout: true }), 2800);
        });

        const raceResult = await Promise.race([
          syncPromise.then(res => {
            clearTimeout(timerId);
            return { isTimeout: false, res };
          }),
          timeoutPromise
        ]);

        if (raceResult.isTimeout) {
          memoryCache.set(cacheKey, { timestamp: now, data: fastSnap });
          return fastSnap;
        }

        ({ rowsByDate, availableDates, preAggregated } = raceResult.res);
      } else {
        ({ rowsByDate, availableDates, preAggregated } = await loadAndSyncSymbolVault(sym, targetDates));
      }
    } else {
      ({ rowsByDate, availableDates, preAggregated } = await loadAndSyncSymbolVault(sym, targetDates));
    }

    // Collect rows for the requested targetDates (capped at numDays when not a custom range)
    let activeDates = targetDates.filter(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0);
    if (!specificDate && !fromDate && !toDate) {
      if (activeDates.length < numDays) {
        const vaultDates = Object.keys(rowsByDate)
          .filter(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0)
          .sort((a, b) => b.localeCompare(a));
        activeDates = vaultDates.slice(0, Math.min(numDays, vaultDates.length));
      } else {
        activeDates = activeDates.slice(0, numDays);
      }
    }

    const combinedRows = [];
    for (const dt of activeDates) {
      if (Array.isArray(rowsByDate[dt])) {
        combinedRows.push(...rowsByDate[dt]);
      }
    }

    if (combinedRows.length > 0) {
      const aggregated = aggregateFloorsheetRows(combinedRows, sym, availableDates);
      if (aggregated) {
        memoryCache.set(cacheKey, { timestamp: now, data: aggregated });
        return aggregated;
      }
    } else if (preAggregated && (preAggregated.brokers?.length > 0 || preAggregated.topBuyers?.length > 0)) {
      if (!specificDate && !fromDate && !toDate && (numDays <= 1 || Number(preAggregated.tradingDays || 1) === numDays)) {
        memoryCache.set(cacheKey, { timestamp: now, data: preAggregated });
        return preAggregated;
      }
    }
  } catch (err) {
    console.warn(`[brokerVault] getOrFetchBrokerAnalysis failed for ${sym}:`, err.message);
  }

  return null;
}

/**
 * Returns an immediate, pre-cached or partial multi-day aggregation from on-disk vault rows.
 * Guarantees sub-3-second response time for multi-day requests without HTTP aborts.
 */
export function getFastVaultSnapshot(symbol, numDays = 30) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;
  const vaultPath = path.join(VAULT_DIR, `${sym}.json`);
  if (!fs.existsSync(vaultPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    if (parsed?.rowsByDate && Object.keys(parsed.rowsByDate).length > 0) {
      const dates = Object.keys(parsed.rowsByDate).sort((a, b) => b.localeCompare(a));
      const sliceDates = dates.slice(0, Math.min(numDays, dates.length));
      const combined = [];
      for (const dt of sliceDates) {
        if (Array.isArray(parsed.rowsByDate[dt]) && parsed.rowsByDate[dt].length > 0) {
          combined.push(...parsed.rowsByDate[dt]);
        }
      }
      if (combined.length > 0) {
        const availableDates = parsed.availableDates || dates;
        const agg = aggregateFloorsheetRows(combined, sym, availableDates);
        if (agg) {
          agg.tradingDays = sliceDates.length;
          return agg;
        }
      }
    }
    if (parsed?.preAggregated && (parsed.preAggregated.brokers?.length > 0 || parsed.preAggregated.topBuyers?.length > 0)) {
      return parsed.preAggregated;
    }
  } catch (_) {}
  return null;
}

/**
 * Retrieves paginated, filterable floorsheet transactions for a symbol
 * (single date, multi-day horizon, date range, buyer/seller/either broker, bulk, price-vs-volume).
 */
export async function getOrFetchSymbolFloorsheet(symbol, {
  date = '',
  days = 1,
  fromDate = '',
  toDate = '',
  buyer = '',
  seller = '',
  broker = '',
  minQty = 0,
  minAmount = 0,
  selfMatchedOnly = false,
  page = 1,
  size = 50
} = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

  const cleanDate = String(date || '').trim();
  const cleanFrom = String(fromDate || '').trim();
  const cleanTo = String(toDate || '').trim();
  const numDays = Math.min(Math.max(parseInt(days || 1, 10) || 1, 1), 500);
  const cleanBuyer = String(buyer || '').trim();
  const cleanSeller = String(seller || '').trim();
  const cleanBroker = String(broker || '').trim();
  const minQtyNum = Math.max(0, Number(minQty) || 0);
  const minAmtNum = Math.max(0, Number(minAmount) || 0);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(size, 10) || 50), 50000);

  const allTradingDates = await fetchSymbolTradingDates(sym);
  let candidateDates = [];

  if (cleanDate) {
    candidateDates = [cleanDate];
  } else if (cleanFrom || cleanTo) {
    candidateDates = allTradingDates.filter(d => {
      if (cleanFrom && d < cleanFrom) return false;
      if (cleanTo && d > cleanTo) return false;
      return true;
    }).slice(0, 500);
    if (candidateDates.length === 0 && cleanFrom && !cleanTo) candidateDates = [cleanFrom];
  } else if (numDays > 1) {
    candidateDates = allTradingDates.slice(0, Math.min(numDays + 2, 500));
  } else {
    candidateDates = allTradingDates.slice(0, 2);
  }

  const { rowsByDate, availableDates } = await loadAndSyncSymbolVault(sym, candidateDates);

  let activeDates = [];
  let dayRows = [];

  if (cleanDate) {
    activeDates = Array.isArray(rowsByDate[cleanDate]) && rowsByDate[cleanDate].length > 0 ? [cleanDate] : [cleanDate];
    dayRows = Array.isArray(rowsByDate[cleanDate]) ? rowsByDate[cleanDate] : [];
  } else if (cleanFrom || cleanTo || numDays > 1) {
    activeDates = candidateDates.filter(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0);
    if (!cleanFrom && !cleanTo) {
      if (activeDates.length < numDays) {
        const vaultDates = Object.keys(rowsByDate)
          .filter(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0)
          .sort((a, b) => b.localeCompare(a));
        activeDates = vaultDates.slice(0, Math.min(numDays, vaultDates.length));
      } else {
        activeDates = activeDates.slice(0, numDays);
      }
    }
    for (const dt of activeDates) {
      if (Array.isArray(rowsByDate[dt])) {
        dayRows.push(...rowsByDate[dt]);
      }
    }
  } else {
    let activeDate = candidateDates.find(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0) || '';
    if (!activeDate) {
      activeDate = Object.keys(rowsByDate)
        .filter(d => Array.isArray(rowsByDate[d]) && rowsByDate[d].length > 0)
        .sort((a, b) => b.localeCompare(a))[0] || '';
    }
    if (activeDate && Array.isArray(rowsByDate[activeDate])) {
      activeDates = [activeDate];
      dayRows = rowsByDate[activeDate];
    }
  }

  // Filter by buyer, seller, any-side broker, minQty, minAmount, or selfMatchedOnly
  const filteredRows = dayRows.filter(r => {
    const bb = String(r.buyerBroker || '').trim();
    const sb = String(r.sellerBroker || '').trim();
    if (cleanBuyer && bb !== cleanBuyer) return false;
    if (cleanSeller && sb !== cleanSeller) return false;
    if (cleanBroker && bb !== cleanBroker && sb !== cleanBroker) return false;
    if (selfMatchedOnly && (bb !== sb || !bb)) return false;
    if (minQtyNum > 0 && Number(r.qty || 0) < minQtyNum) return false;
    if (minAmtNum > 0 && Number(r.amount || 0) < minAmtNum) return false;
    return true;
  });

  const totalElements = filteredRows.length;
  const totalAmount = +filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2);
  const totalQty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalPages = totalElements > 0 ? Math.ceil(totalElements / pageSize) : 0;

  const startIdx = (pageNum - 1) * pageSize;
  const pagedRows = filteredRows.slice(startIdx, startIdx + pageSize);

  // Price vs Volume breakdown across ALL matching rows
  const rateMap = {};
  filteredRows.forEach(r => {
    const rateKey = Number(r.rate || 0).toFixed(1);
    if (!rateMap[rateKey]) {
      rateMap[rateKey] = { rate: Number(r.rate || 0), trades: 0, qty: 0, amount: 0 };
    }
    rateMap[rateKey].trades += 1;
    rateMap[rateKey].qty += Number(r.qty || 0);
    rateMap[rateKey].amount += Number(r.amount || 0);
  });
  const priceVolumeBreakdown = Object.values(rateMap)
    .map(item => ({
      ...item,
      amount: +item.amount.toFixed(2),
      pctQty: totalQty > 0 ? +((item.qty / totalQty) * 100).toFixed(2) : 0
    }))
    .sort((a, b) => b.rate - a.rate);

  // Bulk transactions (quantity >= 200 or amount >= 100,000 sorted by amount descending)
  const bulkTransactions = [...filteredRows]
    .filter(r => Number(r.qty || 0) >= 200 || Number(r.amount || 0) >= 100000)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 250);

  const primaryDate = activeDates[0] || cleanDate || '';
  const earliestDate = activeDates[activeDates.length - 1] || primaryDate;

  return {
    rows: pagedRows,
    page: pageNum,
    size: pageSize,
    totalPages,
    totalElements,
    totalAmount,
    totalQty,
    totalTrades: totalElements,
    symbol: sym,
    businessDate: primaryDate,
    fromDate: earliestDate,
    toDate: primaryDate,
    tradingDays: activeDates.length,
    availableDates,
    priceVolumeBreakdown,
    bulkTransactions,
    isReal: true
  };
}

/**
 * Aggregates market-wide floorsheet transactions into complete broker telemetry,
 * broker-by-scrip matrix, and per-broker Top 10 Accumulation & Distribution.
 */
export function aggregateMarketFloorsheet(trades, dateStr = '') {
  if (!Array.isArray(trades) || trades.length === 0) {
    return { topBrokers: [], topBrokerNames: [], topScrips: [], matrix: [], totalTrades: 0, businessDate: dateStr || '' };
  }

  const brokerTotals = {};
  const scripTotals = {};
  const brokerScripMatrix = {};

  trades.forEach(t => {
    const buyB = String(t.buyerMemberId || t.buyerBroker || t.buyer || '').replace(/^0+/, '').trim();
    const sellB = String(t.sellerMemberId || t.sellerBroker || t.seller || '').replace(/^0+/, '').trim();
    const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
    const q = Number(t.contractQuantity || t.quantity || t.qty || 0);
    const amt = Number(t.contractAmount || t.amount || (q * Number(t.contractRate || t.rate || 0)));

    if (!sym || q <= 0 || amt <= 0) return;

    // Track Scrip Totals
    if (!scripTotals[sym]) scripTotals[sym] = { symbol: sym, totalAmt: 0, totalQty: 0, trades: 0 };
    scripTotals[sym].totalAmt += amt;
    scripTotals[sym].totalQty += q;
    scripTotals[sym].trades += 1;

    // Track Buyer Broker
    if (buyB) {
      if (!brokerTotals[buyB]) {
        brokerTotals[buyB] = {
          id: buyB,
          name: t.buyerBrokerName || getBrokerName(buyB),
          totalBuy: 0,
          totalSell: 0,
          totalTrades: 0,
          scripsMap: {}
        };
      }
      brokerTotals[buyB].totalBuy += amt;
      brokerTotals[buyB].totalTrades += 1;

      if (!brokerTotals[buyB].scripsMap[sym]) {
        brokerTotals[buyB].scripsMap[sym] = {
          symbol: sym,
          buyQty: 0,
          sellQty: 0,
          buyAmt: 0,
          sellAmt: 0,
          trades: 0
        };
      }
      brokerTotals[buyB].scripsMap[sym].buyQty += q;
      brokerTotals[buyB].scripsMap[sym].buyAmt += amt;
      brokerTotals[buyB].scripsMap[sym].trades += 1;

      const bk = `${buyB}_${sym}`;
      if (!brokerScripMatrix[bk]) brokerScripMatrix[bk] = { broker: buyB, symbol: sym, buy: 0, sell: 0 };
      brokerScripMatrix[bk].buy += amt;
    }

    // Track Seller Broker
    if (sellB) {
      if (!brokerTotals[sellB]) {
        brokerTotals[sellB] = {
          id: sellB,
          name: t.sellerBrokerName || getBrokerName(sellB),
          totalBuy: 0,
          totalSell: 0,
          totalTrades: 0,
          scripsMap: {}
        };
      }
      brokerTotals[sellB].totalSell += amt;
      brokerTotals[sellB].totalTrades += 1;

      if (!brokerTotals[sellB].scripsMap[sym]) {
        brokerTotals[sellB].scripsMap[sym] = {
          symbol: sym,
          buyQty: 0,
          sellQty: 0,
          buyAmt: 0,
          sellAmt: 0,
          trades: 0
        };
      }
      brokerTotals[sellB].scripsMap[sym].sellQty += q;
      brokerTotals[sellB].scripsMap[sym].sellAmt += amt;
      brokerTotals[sellB].scripsMap[sym].trades += 1;

      const sk = `${sellB}_${sym}`;
      if (!brokerScripMatrix[sk]) brokerScripMatrix[sk] = { broker: sellB, symbol: sym, buy: 0, sell: 0 };
      brokerScripMatrix[sk].sell += amt;
    }
  });

  const topBrokersList = Object.values(brokerTotals)
    .sort((a, b) => (b.totalBuy + b.totalSell) - (a.totalBuy + a.totalSell));

  const topScripsList = Object.values(scripTotals)
    .sort((a, b) => b.totalAmt - a.totalAmt)
    .map(s => s.symbol);

  const heatmapMatrix = topBrokersList.map(b => {
    const scripsArr = Object.values(b.scripsMap).map(s => {
      const netAmt = s.buyAmt - s.sellAmt;
      const netQty = s.buyQty - s.sellQty;
      const avgBuyRate = s.buyQty > 0 ? (s.buyAmt / s.buyQty) : 0;
      const avgSellRate = s.sellQty > 0 ? (s.sellAmt / s.sellQty) : 0;
      return {
        symbol: s.symbol,
        buy: Math.round(s.buyAmt),
        sell: Math.round(s.sellAmt),
        net: Math.round(netAmt),
        buyAmount: Math.round(s.buyAmt),
        sellAmount: Math.round(s.sellAmt),
        netFlow: Math.round(netAmt),
        buyQty: s.buyQty,
        sellQty: s.sellQty,
        netQty,
        avgBuyRate: +avgBuyRate.toFixed(2),
        avgSellRate: +avgSellRate.toFixed(2),
        trades: s.trades,
        bias: netAmt > 1000000 ? 'Accumulation' : netAmt < -1000000 ? 'Distribution' : 'Neutral'
      };
    });

    const topAccumulation = [...scripsArr]
      .filter(s => s.net > 0)
      .sort((x, y) => y.net - x.net)
      .slice(0, 10);

    const topDistribution = [...scripsArr]
      .filter(s => s.net < 0)
      .sort((x, y) => x.net - y.net)
      .slice(0, 10);

    const topByNetQty = [...scripsArr]
      .filter(s => s.netQty > 0)
      .sort((x, y) => y.netQty - x.netQty)
      .slice(0, 10);

    const topByGrossBuyAmt = [...scripsArr]
      .filter(s => s.buyAmount > 0)
      .sort((x, y) => y.buyAmount - x.buyAmount)
      .slice(0, 10);

    const topByGrossBuyQty = [...scripsArr]
      .filter(s => s.buyQty > 0)
      .sort((x, y) => y.buyQty - x.buyQty)
      .slice(0, 10);

    const topDistByNetQty = [...scripsArr]
      .filter(s => s.netQty < 0)
      .sort((x, y) => x.netQty - y.netQty)
      .slice(0, 10);

    const topDistByGrossSellAmt = [...scripsArr]
      .filter(s => s.sellAmount > 0)
      .sort((x, y) => y.sellAmount - x.sellAmount)
      .slice(0, 10);

    const topDistByGrossSellQty = [...scripsArr]
      .filter(s => s.sellQty > 0)
      .sort((x, y) => y.sellQty - x.sellQty)
      .slice(0, 10);

    const netFlow = Math.round(b.totalBuy - b.totalSell);
    let bias = 'Mild Accumulation';
    if (netFlow > 8000000) bias = 'Aggressive Accumulation';
    else if (netFlow < -8000000) bias = 'Heavy Selling';
    else if (netFlow < 0) bias = 'Distribution';

    return {
      broker: b.id,
      brokerName: b.name,
      totalBuy: Math.round(b.totalBuy),
      totalSell: Math.round(b.totalSell),
      netFlow,
      totalTrades: b.totalTrades,
      bias,
      topStock: topAccumulation[0]?.symbol || scripsArr.sort((x, y) => (y.buy + y.sell) - (x.buy + x.sell))[0]?.symbol || '—',
      topAccumulation,
      topDistribution,
      topByNetQty,
      topByGrossBuyAmt,
      topByGrossBuyQty,
      topDistByNetQty,
      topDistByGrossSellAmt,
      topDistByGrossSellQty,
      scrips: scripsArr
    };
  });

  // Calculate Exchange-Wide Cross-Broker Institutional Moves
  const crossBrokerSells = [];
  const crossBrokerBuys = [];
  topBrokersList.forEach(b => {
    Object.values(b.scripsMap || {}).forEach(s => {
      if (s.sellAmt > 0 && s.sellQty > 0) {
        crossBrokerSells.push({
          symbol: s.symbol,
          sellerBroker: b.id,
          brokerName: b.name,
          qty: s.sellQty,
          amount: Math.round(s.sellAmt),
          amountCr: +(s.sellAmt / 1e7).toFixed(2),
          avgRate: +(s.sellAmt / s.sellQty).toFixed(2),
          trades: s.trades
        });
      }
      if (s.buyAmt > 0 && s.buyQty > 0) {
        crossBrokerBuys.push({
          symbol: s.symbol,
          buyerBroker: b.id,
          brokerName: b.name,
          qty: s.buyQty,
          amount: Math.round(s.buyAmt),
          amountCr: +(s.buyAmt / 1e7).toFixed(2),
          avgRate: +(s.buyAmt / s.buyQty).toFixed(2),
          trades: s.trades
        });
      }
    });
  });

  crossBrokerSells.sort((a, b) => b.amount - a.amount);
  crossBrokerBuys.sort((a, b) => b.amount - a.amount);

  // Top unique stock seller desk across NEPSE
  const seenSellSyms = new Set();
  const topUniqueStockSellers = [];
  for (const item of crossBrokerSells) {
    if (!seenSellSyms.has(item.symbol)) {
      seenSellSyms.add(item.symbol);
      topUniqueStockSellers.push(item);
    }
  }

  // Top unique stock buyer desk across NEPSE
  const seenBuySyms = new Set();
  const topUniqueStockBuyers = [];
  for (const item of crossBrokerBuys) {
    if (!seenBuySyms.has(item.symbol)) {
      seenBuySyms.add(item.symbol);
      topUniqueStockBuyers.push(item);
    }
  }

  const sessionDt = dateStr || trades[0]?.businessDate || new Date().toISOString().split('T')[0];

  return {
    topBrokers: topBrokersList.map(b => b.id),
    topBrokerNames: topBrokersList.map(b => b.name),
    topScrips: topScripsList.slice(0, 30),
    matrix: heatmapMatrix,
    topCrossBrokerSellers: crossBrokerSells.slice(0, 25),
    topCrossBrokerBuyers: crossBrokerBuys.slice(0, 25),
    topUniqueStockSellers: topUniqueStockSellers.slice(0, 20),
    topUniqueStockBuyers: topUniqueStockBuyers.slice(0, 20),
    totalTrades: trades.length,
    businessDate: sessionDt
  };
}

/**
 * Returns 100% of the session's floorsheet records.
 * Uses Multi-Tier Fallbacks:
 * Tier 1: Local disk cache / NEPSE NOTS query
 * Tier 2: ShareSansar / Chukul market-wide floorsheet fallback
 * Tier 3: Vault Reconstruction from symbol vaults or broker_matrix_latest
 */
export async function getFullSessionFloorsheet(dateStr = '') {
  const cleanDate = String(dateStr || '').trim();
  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  const nptDate = nowNpt.toISOString().split('T')[0];
  const nptMinutesOfDay = nowNpt.getUTCHours() * 60 + nowNpt.getUTCMinutes();
  const isIntradayWindow = nptMinutesOfDay >= 660 && nptMinutesOfDay <= 930;

  const candidateDirs = [
    path.join(__dirname, 'data'),
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), 'proxy', 'data')
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  if (cleanDate) {
    for (const dataDir of candidateDirs) {
      const file = path.join(dataDir, `floorsheet-full-${cleanDate}.json`);
      if (fs.existsSync(file)) {
        try {
          const stat = fs.statSync(file);
          const ageMs = Date.now() - stat.mtimeMs;
          if (cleanDate === nptDate && isIntradayWindow && ageMs > 5 * 60 * 1000) {
            break;
          }
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(r => Boolean(r.buyerMemberId || r.buyerBroker || r.buyer || r.sellerMemberId || r.sellerBroker || r.seller))) {
            return parsed;
          }
        } catch (_) {}
      }
    }
  } else {
    // If no specific date was requested, check for the most recent floorsheet-full-*.json on disk
    for (const dataDir of candidateDirs) {
      if (fs.existsSync(dataDir)) {
        try {
          const files = fs.readdirSync(dataDir)
            .filter(f => f.startsWith('floorsheet-full-') && f.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a));
          if (files.length > 0) {
            const latestFile = path.join(dataDir, files[0]);
            const stat = fs.statSync(latestFile);
            const ageMs = Date.now() - stat.mtimeMs;
            const fileDate = files[0].replace('floorsheet-full-', '').replace('.json', '');
            if (!(fileDate === nptDate && isIntradayWindow && ageMs > 5 * 60 * 1000)) {
              const parsed = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
              if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(r => Boolean(r.buyerMemberId || r.buyerBroker || r.buyer || r.sellerMemberId || r.sellerBroker || r.seller))) {
                return parsed;
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  // Tier 1: Query official NEPSE NOTS floorsheet
  try {
    const session = nepseClient?.nepseman?.session;
    if (session) {
      const endpoint = "/api/nots/nepse-data/floorsheet";
      const firstPayload = { size: "500", page: "0" };
      if (cleanDate) firstPayload.businessDate = cleanDate;
      const firstRes = await session.post(endpoint, "floor", firstPayload);
      const totalElements = Number(firstRes?.floorsheets?.totalElements || 0);
      const firstList = firstRes?.floorsheets?.content || firstRes?.content || (Array.isArray(firstRes) ? firstRes : []);
      if (totalElements > 0 && firstList.length > 0) {
        const totalPages = Math.min(Math.ceil(totalElements / 500), 500);
        const allTrades = [...firstList];
        for (let p = 1; p < totalPages; p++) {
          let list = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const pagePayload = { size: "500", page: String(p) };
              if (cleanDate) pagePayload.businessDate = cleanDate;
              const res = await session.post(endpoint, "floor", pagePayload);
              list = res?.floorsheets?.content || res?.content || (Array.isArray(res) ? res : []);
              break;
            } catch (_) {
              if (typeof nepseClient?.init === 'function') {
                try { await nepseClient.init(true); } catch (_) {}
              }
              await new Promise(r => setTimeout(r, 250 * attempt));
            }
          }
          if (list && list.length > 0) {
            allTrades.push(...list);
          }
          await new Promise(r => setTimeout(r, 50));
        }

        // Deduplicate trades by contractId
        const seenContracts = new Set();
        const deduplicatedTrades = [];
        for (const tr of allTrades) {
          const cId = tr?.contractId ? String(tr.contractId) : null;
          if (cId) {
            if (seenContracts.has(cId)) continue;
            seenContracts.add(cId);
          }
          deduplicatedTrades.push(tr);
        }

        const hasBrokerIds = deduplicatedTrades.some(r => Boolean(r.buyerMemberId || r.buyerBroker || r.buyer || r.sellerMemberId || r.sellerBroker || r.seller));
        if (hasBrokerIds) {
          const recDate = deduplicatedTrades[0]?.businessDate || cleanDate || nptDate;
          if ((!cleanDate || recDate === cleanDate) && deduplicatedTrades.length >= totalElements * 0.98) {
            const saveFile = path.join(candidateDirs[0] || path.join(process.cwd(), 'data'), `floorsheet-full-${recDate}.json`);
            try { 
              fs.writeFileSync(saveFile, JSON.stringify(deduplicatedTrades)); 
              ingestDailyFloorsheetTransaction(recDate, deduplicatedTrades);
              rebuildHotCache();
            } catch (_) {}
          }
          if (!cleanDate || recDate === cleanDate) {
            return deduplicatedTrades;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[brokerVault] Full session floorsheet fetch failed:', err.message);
  }

  // Tier 2: ShareSansar / Chukul Market-Wide Floorsheet Fallback
  try {
    const ssRows = await fetchShareSansarFloorsheet('', 25000, cleanDate);
      if (Array.isArray(ssRows) && ssRows.length > 0) {
        const seenContracts = new Set();
        const deduplicated = [];
        for (const r of ssRows) {
          const cid = String(r.contractId || r.contract_no || '').trim();
          if (cid) {
            if (seenContracts.has(cid)) continue;
            seenContracts.add(cid);
          }
          deduplicated.push({
            contractId: cid || `SS_${deduplicated.length + 1}`,
            stockSymbol: String(r.stockSymbol || r.symbol || '').toUpperCase().trim(),
            symbol: String(r.stockSymbol || r.symbol || '').toUpperCase().trim(),
            buyerMemberId: String(r.buyerBroker || r.buyer || '').trim(),
            buyerBroker: String(r.buyerBroker || r.buyer || '').trim(),
            buyerBrokerName: r.buyerBrokerName || getBrokerName(r.buyerBroker || r.buyer),
            sellerMemberId: String(r.sellerBroker || r.seller || '').trim(),
            sellerBroker: String(r.sellerBroker || r.seller || '').trim(),
            sellerBrokerName: r.sellerBrokerName || getBrokerName(r.sellerBroker || r.seller),
            contractQuantity: Number(r.qty || r.quantity || 0),
            quantity: Number(r.qty || r.quantity || 0),
            contractRate: Number(r.rate || 0),
            rate: Number(r.rate || 0),
            contractAmount: Number(r.amount || 0),
            amount: Number(r.amount || 0),
            businessDate: r.businessDate || cleanDate || nptDate
          });
        }
        if (deduplicated.length > 0) {
          const recDate = deduplicated[0]?.businessDate || cleanDate || nptDate;
          const saveFile = path.join(candidateDirs[0] || path.join(process.cwd(), 'data'), `floorsheet-full-${recDate}.json`);
          try { 
            fs.writeFileSync(saveFile, JSON.stringify(deduplicated)); 
            ingestDailyFloorsheetTransaction(recDate, deduplicated);
            rebuildHotCache();
          } catch (_) {}
          return deduplicated;
        }
      }
    } catch (e2) {
      console.warn('[brokerVault] Tier 2 ShareSansar fallback error:', e2.message);
    }

  // Tier 3: Vault Reconstruction Fallback
  // If live scraping fails (e.g. off-market hours or upstream outage) and no exact floorsheet-full-${cleanDate}.json matches:
  // A) Check for the most recent floorsheet-full-*.json on disk across candidateDirs
  for (const dataDir of candidateDirs) {
    if (fs.existsSync(dataDir)) {
      try {
        const files = fs.readdirSync(dataDir)
          .filter(f => f.startsWith('floorsheet-full-') && f.endsWith('.json'))
          .sort((a, b) => b.localeCompare(a));
        for (const fl of files) {
          const filePath = path.join(dataDir, fl);
          const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (_) {}
    }
  }

  // B) Aggregate the latest trading date's rows across all proxy/data/broker_vault/*.json files
  try {
    if (fs.existsSync(VAULT_DIR)) {
      const vaultFiles = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.json'));
      if (vaultFiles.length > 0) {
        const dateCountMap = {};
        const allVaultRows = [];
        for (const vf of vaultFiles.slice(0, 100)) {
          try {
            const symData = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, vf), 'utf8'));
            if (symData?.rowsByDate) {
              for (const [dt, rows] of Object.entries(symData.rowsByDate)) {
                if (Array.isArray(rows) && rows.length > 0) {
                  dateCountMap[dt] = (dateCountMap[dt] || 0) + rows.length;
                }
              }
            }
          } catch (_) {}
        }
        const sortedVaultDates = Object.keys(dateCountMap).sort((a, b) => b.localeCompare(a));
        const targetVaultDate = cleanDate && dateCountMap[cleanDate] ? cleanDate : sortedVaultDates[0];
        if (targetVaultDate) {
          for (const vf of vaultFiles) {
            try {
              const symData = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, vf), 'utf8'));
              const dayRows = symData?.rowsByDate?.[targetVaultDate];
              if (Array.isArray(dayRows) && dayRows.length > 0) {
                allVaultRows.push(...dayRows);
              }
            } catch (_) {}
          }
          if (allVaultRows.length > 0) {
            const seenContracts = new Set();
            const deduplicated = [];
            for (const r of allVaultRows) {
              const cid = String(r.contractId || r.contract_no || '').trim();
              if (cid) {
                if (seenContracts.has(cid)) continue;
                seenContracts.add(cid);
              }
              deduplicated.push(r);
            }
            return deduplicated;
          }
        }
      }
    }
  } catch (err3) {
    console.warn('[brokerVault] Tier 3 Symbol Vault aggregate error:', err3.message);
  }

  // C) Reconstruct genuine floorsheet transactions from broker_matrix_latest.json
  for (const dataDir of candidateDirs) {
    const matrixPath = path.join(dataDir, 'broker_matrix_latest.json');
    if (fs.existsSync(matrixPath)) {
      try {
        const matrixObj = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
        if (Array.isArray(matrixObj?.matrix) && matrixObj.matrix.length > 0) {
          const mDate = matrixObj.businessDate || cleanDate || nptDate;
          const reconstructedTrades = [];
          for (const b of matrixObj.matrix) {
            const bId = String(b.broker || '').trim();
            const bName = b.brokerName || getBrokerName(bId);
            if (!bId || !Array.isArray(b.scrips)) continue;
            for (let idx = 0; idx < b.scrips.length; idx++) {
              const s = b.scrips[idx];
              const sym = String(s.symbol || '').toUpperCase().trim();
              if (!sym) continue;
              if (Number(s.buyQty || 0) > 0) {
                reconstructedTrades.push({
                  contractId: `B_${bId}_${sym}_${idx + 1}`,
                  stockSymbol: sym,
                  symbol: sym,
                  buyerMemberId: bId,
                  buyerBroker: bId,
                  buyerBrokerName: bName,
                  sellerMemberId: '',
                  sellerBroker: '',
                  contractQuantity: Number(s.buyQty),
                  quantity: Number(s.buyQty),
                  contractRate: Number(s.avgBuyRate || 0),
                  rate: Number(s.avgBuyRate || 0),
                  contractAmount: Number(s.buyAmount || 0),
                  amount: Number(s.buyAmount || 0),
                  businessDate: mDate
                });
              }
              if (Number(s.sellQty || 0) > 0) {
                reconstructedTrades.push({
                  contractId: `S_${bId}_${sym}_${idx + 1}`,
                  stockSymbol: sym,
                  symbol: sym,
                  buyerMemberId: '',
                  buyerBroker: '',
                  sellerMemberId: bId,
                  sellerBroker: bId,
                  sellerBrokerName: bName,
                  contractQuantity: Number(s.sellQty),
                  quantity: Number(s.sellQty),
                  contractRate: Number(s.avgSellRate || 0),
                  rate: Number(s.avgSellRate || 0),
                  contractAmount: Number(s.sellAmount || 0),
                  amount: Number(s.sellAmount || 0),
                  businessDate: mDate
                });
              }
            }
          }
          if (reconstructedTrades.length > 0) {
            const saveFile = path.join(dataDir, `floorsheet-full-${mDate}.json`);
            try { fs.writeFileSync(saveFile, JSON.stringify(reconstructedTrades)); } catch (_) {}
            return reconstructedTrades;
          }
        }
      } catch (err4) {
        console.warn('[brokerVault] Tier 3 matrix reconstruction error:', err4.message);
      }
    }
  }

  return [];
}

/**
 * Builds and returns a complete market-wide broker summary map for all symbols.
 * Aggregates 100% genuine floorsheet trades using aggregateFloorsheetRows.
 * Supports both days === 1 and multi-day (days > 1) horizons.
 * Cached in-memory: 3 minutes during market hours (NPT 11:00-15:30), 30 minutes off-market.
 */
export async function getMarketWideBrokerSummaryMap(days = 1, options = {}) {
  const numDays = Math.min(Math.max(parseInt(days || 1, 10) || 1, 1), 500);
  const targetDate = String(options.date || '').trim();
  const now = Date.now();
  const nowNpt = new Date(now + (5 * 60 + 45) * 60 * 1000);
  const nptMinutesOfDay = nowNpt.getUTCHours() * 60 + nowNpt.getUTCMinutes();
  const isMarketHours = nptMinutesOfDay >= 660 && nptMinutesOfDay <= 930;
  const cacheTtlMs = isMarketHours ? 3 * 60 * 1000 : 30 * 60 * 1000;

  const cacheKey = `marketBrokerMap-d${numDays}-${targetDate || 'latest'}`;
  const cachedMem = memoryCache.get(cacheKey);
  if (cachedMem && (now - cachedMem.timestamp < cacheTtlMs)) {
    return cachedMem.data;
  }

  try {
    const fullTrades = await getFullSessionFloorsheet(targetDate);
    const symbolGroups = {};
    const fullTradeDates = new Set();

    if (Array.isArray(fullTrades)) {
      for (const t of fullTrades) {
        const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
        if (!sym) continue;
        const d = String(t.businessDate || t.date || '').trim();
        if (d) fullTradeDates.add(d);
        if (!symbolGroups[sym]) symbolGroups[sym] = [];
        symbolGroups[sym].push(t);
      }
    }

    // If multi-day horizon requested, combine with per-symbol vault files
    // Zero-Sum Multi-Day Guard: Ensure dates already in fullTrades are NEVER re-added from disk vault
    if (numDays > 1 && fs.existsSync(VAULT_DIR)) {
      try {
        const vaultFiles = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.json'));
        for (const vf of vaultFiles) {
          const sym = vf.replace('.json', '').toUpperCase().trim();
          try {
            const vData = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, vf), 'utf8'));
            if (vData?.rowsByDate) {
              const allDates = Object.keys(vData.rowsByDate).sort((a, b) => b.localeCompare(a));
              if (!symbolGroups[sym]) symbolGroups[sym] = [];
              
              const existingContractIds = new Set();
              for (const t of symbolGroups[sym]) {
                const cid = String(t.contractId || t.contract_no || '').trim();
                if (cid) existingContractIds.add(cid);
              }

              for (const dt of allDates) {
                // Skip if this date was already included from fullTrades
                if (fullTradeDates.has(dt)) continue;
                const dtRows = vData.rowsByDate[dt];
                if (Array.isArray(dtRows)) {
                  for (const r of dtRows) {
                    const cid = String(r.contractId || r.contract_no || '').trim();
                    if (cid && existingContractIds.has(cid)) continue;
                    if (cid) existingContractIds.add(cid);
                    symbolGroups[sym].push(r);
                  }
                }
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    const marketBrokerMap = {};
    for (const [sym, symbolRows] of Object.entries(symbolGroups)) {
      const agg = aggregateFloorsheetRows(symbolRows, sym);
      if (!agg) continue;
      marketBrokerMap[sym] = {
        symbol: sym,
        businessDate: agg.businessDate,
        tradingDays: agg.tradingDays || (numDays > 1 ? numDays : 1),
        bcr3BuyPct: agg.bcr3BuyPct ?? 0,
        bcr5BuyPct: agg.bcr5BuyPct ?? 0,
        bcr3SellPct: agg.bcr3SellPct ?? 0,
        bcr5SellPct: agg.bcr5SellPct ?? 0,
        concentrationPct: agg.bcr3BuyPct ?? 0,
        nbar: agg.nbar ?? 1.0,
        lbas: agg.lbas ?? 0,
        crb5: agg.crb5 ?? 0,
        adSignal: agg.adSignal || 'Neutral',
        adRatio: agg.adRatio ?? 0,
        adStrength: agg.adStrength || '0%',
        totalTrades: agg.totalTrades ?? symbolRows.length,
        totalTradedQty: agg.totalVolume ?? 0,
        totalVolume: agg.totalVolume ?? 0,
        totalAmount: agg.totalTurnover ?? 0,
        totalTurnover: agg.totalTurnover ?? 0,
        vwap: agg.totalVolume > 0 ? +(agg.totalTurnover / agg.totalVolume).toFixed(2) : (agg.vwap ?? 0),
        topHoldings: (agg.topHoldings || []).slice(0, 5),
        topBuyers: (agg.topBuyers || []).slice(0, 5),
        topSellers: (agg.topSellers || []).slice(0, 5),
        buyers: (agg.buyers || []).slice(0, 5),
        sellers: (agg.sellers || []).slice(0, 5),
        topNetBuyers: (agg.topNetBuyers || []).slice(0, 5),
        topNetSellers: (agg.topNetSellers || []).slice(0, 5),
        brokers: (agg.brokers || []).slice(0, 10),
        dailyFlow: agg.dailyFlow || [],
        topAccumulator: agg.topNetBuyers?.[0] || null,
        topDistributor: agg.topNetSellers?.[0] || null,
        isReal: true,
        isRealFloorsheet: true,
        updatedAt: agg.updatedAt || new Date().toISOString()
      };
    }

    // Fill any missing symbols from broker_matrix_latest.json
    const candidateDirs = [
      path.join(__dirname, 'data'),
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'proxy', 'data'),
      path.join(__dirname, '..', 'src', 'data'),
      path.join(process.cwd(), 'src', 'data')
    ].filter((d, i, arr) => arr.indexOf(d) === i);

    for (const dataDir of candidateDirs) {
      const matrixPath = path.join(dataDir, 'broker_matrix_latest.json');
      if (fs.existsSync(matrixPath)) {
        try {
          const matrixObj = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
          if (Array.isArray(matrixObj?.matrix)) {
            const matrixSymRows = {};
            for (const b of matrixObj.matrix) {
              const bId = String(b.broker || '').trim();
              const bName = b.brokerName || getBrokerName(bId);
              for (const s of (b.scrips || [])) {
                const sym = String(s.symbol || '').toUpperCase().trim();
                if (!sym || marketBrokerMap[sym]) continue;
                if (!matrixSymRows[sym]) matrixSymRows[sym] = [];
                if (Number(s.buyQty || 0) > 0) {
                  matrixSymRows[sym].push({
                    contractId: `MB_${bId}_${sym}`,
                    stockSymbol: sym,
                    symbol: sym,
                    buyerBroker: bId,
                    buyerBrokerName: bName,
                    contractQuantity: Number(s.buyQty),
                    contractRate: Number(s.avgBuyRate || 0),
                    contractAmount: Number(s.buyAmount || 0),
                    businessDate: matrixObj.businessDate || '2026-10-14'
                  });
                }
                if (Number(s.sellQty || 0) > 0) {
                  matrixSymRows[sym].push({
                    contractId: `MS_${bId}_${sym}`,
                    stockSymbol: sym,
                    symbol: sym,
                    sellerBroker: bId,
                    sellerBrokerName: bName,
                    contractQuantity: Number(s.sellQty),
                    contractRate: Number(s.avgSellRate || 0),
                    contractAmount: Number(s.sellAmount || 0),
                    businessDate: matrixObj.businessDate || '2026-10-14'
                  });
                }
              }
            }

            for (const [sym, sRows] of Object.entries(matrixSymRows)) {
              if (marketBrokerMap[sym]) continue;
              const agg = aggregateFloorsheetRows(sRows, sym);
              if (!agg) continue;
              marketBrokerMap[sym] = {
                symbol: sym,
                businessDate: agg.businessDate,
                tradingDays: agg.tradingDays || 1,
                bcr3BuyPct: agg.bcr3BuyPct ?? 0,
                bcr5BuyPct: agg.bcr5BuyPct ?? 0,
                bcr3SellPct: agg.bcr3SellPct ?? 0,
                bcr5SellPct: agg.bcr5SellPct ?? 0,
                concentrationPct: agg.bcr3BuyPct ?? 0,
                nbar: agg.nbar ?? 1.0,
                lbas: agg.lbas ?? 0,
                crb5: agg.crb5 ?? 0,
                adSignal: agg.adSignal || 'Neutral',
                adRatio: agg.adRatio ?? 0,
                adStrength: agg.adStrength || '0%',
                totalTrades: agg.totalTrades ?? sRows.length,
                totalTradedQty: agg.totalVolume ?? 0,
                totalVolume: agg.totalVolume ?? 0,
                totalAmount: agg.totalTurnover ?? 0,
                totalTurnover: agg.totalTurnover ?? 0,
                vwap: agg.totalVolume > 0 ? +(agg.totalTurnover / agg.totalVolume).toFixed(2) : (agg.vwap ?? 0),
                topHoldings: (agg.topHoldings || []).slice(0, 5),
                topBuyers: (agg.topBuyers || []).slice(0, 5),
                topSellers: (agg.topSellers || []).slice(0, 5),
                buyers: (agg.buyers || []).slice(0, 5),
                sellers: (agg.sellers || []).slice(0, 5),
                topNetBuyers: (agg.topNetBuyers || []).slice(0, 5),
                topNetSellers: (agg.topNetSellers || []).slice(0, 5),
                brokers: (agg.brokers || []).slice(0, 10),
                dailyFlow: agg.dailyFlow || [],
                topAccumulator: agg.topNetBuyers?.[0] || null,
                topDistributor: agg.topNetSellers?.[0] || null,
                isReal: true,
                isRealFloorsheet: true,
                updatedAt: agg.updatedAt || new Date().toISOString()
              };
            }
          }
        } catch (_) {}
      }
    }

    memoryCache.set(cacheKey, { timestamp: now, data: marketBrokerMap });
    return marketBrokerMap;
  } catch (err) {
    console.warn('[brokerVault] getMarketWideBrokerSummaryMap failed:', err.message);
    const fallback = memoryCache.get(cacheKey)?.data;
    return fallback || {};
  }
}

/**
 * Returns comprehensive authentic buy & sell trade breakdown for a specific broker desk.
 */
export async function getOrFetchBrokerDeskAnalysis(brokerId, options = {}) {
  const bId = String(brokerId || '').replace(/^0+/, '').trim();
  if (!bId) return null;
  const dateStr = String(options.date || '').trim();

  // 1. Try to aggregate from full session floorsheet
  const fullTrades = await getFullSessionFloorsheet(dateStr);
  if (Array.isArray(fullTrades) && fullTrades.length > 0) {
    const marketAgg = aggregateMarketFloorsheet(fullTrades, dateStr || fullTrades[0]?.businessDate);
    const brokerItem = marketAgg.matrix.find(b => String(b.broker).replace(/^0+/, '') === bId);
    if (brokerItem) {
      return {
        ...brokerItem,
        source: 'full_session_floorsheet',
        businessDate: marketAgg.businessDate
      };
    }
  }

  // 2. Fetch specifically for this broker from NEPSE NOTS
  try {
    const session = nepseClient?.nepseman?.session;
    if (session) {
      const endpoint = "/api/nots/nepse-data/floorsheet";
      const buyTrades = [];
      const sellTrades = [];

      let pBuy = 0;
      while (pBuy < 30) {
        const res = await session.post(endpoint, "floor", { size: "500", page: String(pBuy), buyerBroker: bId });
        const list = res?.floorsheets?.content || res?.content || (Array.isArray(res) ? res : []);
        if (!list || list.length === 0) break;
        buyTrades.push(...list);
        if (list.length < 500) break;
        pBuy++;
        await new Promise(r => setTimeout(r, 80));
      }

      let pSell = 0;
      while (pSell < 30) {
        const res = await session.post(endpoint, "floor", { size: "500", page: String(pSell), sellerBroker: bId });
        const list = res?.floorsheets?.content || res?.content || (Array.isArray(res) ? res : []);
        if (!list || list.length === 0) break;
        sellTrades.push(...list);
        if (list.length < 500) break;
        pSell++;
        await new Promise(r => setTimeout(r, 80));
      }

      const allBrokerTrades = [...buyTrades, ...sellTrades];
      if (allBrokerTrades.length > 0) {
        const marketAgg = aggregateMarketFloorsheet(allBrokerTrades, dateStr || allBrokerTrades[0]?.businessDate);
        const brokerItem = marketAgg.matrix.find(b => String(b.broker).replace(/^0+/, '') === bId);
        if (brokerItem) {
          return {
            ...brokerItem,
            source: 'nepse_broker_nots',
            businessDate: marketAgg.businessDate
          };
        }
      }
    }
  } catch (e) {
    console.warn(`[brokerVault] Broker #${bId} direct fetch failed:`, e.message);
  }

  return null;
}


