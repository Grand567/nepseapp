import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const BROKER_NAMES = {
  '1': 'Kumari Securities', '2': 'Swornalaxmi Securities', '3': 'Arun Securities',
  '4': 'Opal Securities', '5': 'Market Securities', '6': 'Agrawal Securities',
  '7': 'J.F. Securities', '8': 'Ashutosh Brokerage', '10': 'Pragyan Securities',
  '11': 'Malla & Malla Stock Broking', '13': 'Thrive Brokerage House',
  '14': 'Nepal Stock House', '16': 'Primo Securities', '17': 'ABC Securities',
  '18': 'Sagarmatha Securities', '19': 'Nepal Investment & Securities',
  '20': 'Sipla Securities', '21': 'Midas Stock Broking', '22': 'Frist Choice Securities',
  '25': 'Siprabi Securities', '26': 'Asian Securities', '28': 'Shree Krishna Securities',
  '29': 'Trisul Securities', '32': 'Premier Securities', '33': 'Dakshinkali Securities',
  '34': 'Vision Securities', '35': 'Kohinoor Investment & Securities',
  '36': 'Secured Securities', '37': 'Swarna Laxmi Securities',
  '38': 'Dipshikha Dhitopatra Karobar', '39': 'Sumeru Securities',
  '40': 'Creative Securities', '41': 'Lincon Securities', '42': 'Sani Securities',
  '43': 'South Asian Bulls', '44': 'Dynamic Money Market', '45': 'Imperial Securities',
  '46': 'Kalika Securities', '47': 'Neev Securities', '48': 'Trisakti Securities',
  '49': 'Online Securities', '50': 'Crystal Kanchenjunga Securities',
  '51': 'Oxford Securities', '52': 'Sundhara Securities', '53': 'Investment Management Nepal',
  '54': 'Sewa Securities', '55': 'Bhikshu Securities', '56': 'Sri Hari Securities',
  '57': 'Aryatara Investment & Securities', '58': 'Naasa Securities',
  '59': 'Deeplal Capital Securities', '60': 'Nagarik Stock Dealer',
  '61': 'Bhole Ganesh Securities', '62': 'Capital Max Securities',
  '63': 'Himalayan Brokerage', '64': 'Sun Securities', '65': 'Sharepro Securities',
  '66': 'Miyo Securities', '67': 'Property Wizard', '68': 'KBL Securities',
  '69': 'Nabil Stock Dealer', '70': 'Garima Securities', '71': 'Purna Securities',
  '72': 'Stoxkart Securities', '73': 'Sanima Securities', '74': 'Elite Stock Brokers',
  '75': 'Infinity Securities', '76': 'Index Securities', '77': 'Sunlife Securities',
  '78': 'NMB Securities', '79': 'Prabhu Stock Market', '80': 'Machhapuchchhre Securities',
};

export function getBrokerName(id) {
  const cleanId = String(id || '').trim();
  return BROKER_NAMES[cleanId] || `Broker ${cleanId}`;
}

const memoryCache = new Map();

export async function fetchShareSansarFloorsheet(symbol, length = 500) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

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
    const token = $('meta[name="_token"]').attr('content') || $('input[name="_token"]').val();

    const floorRes = await client.get(`https://www.sharesansar.com/floorsheet?draw=1&start=0&length=${length}&company=${encodeURIComponent(sym)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': token,
        'Referer': 'https://www.sharesansar.com/floorsheet'
      },
      timeout: 15000
    });

    if (floorRes.status === 200 && Array.isArray(floorRes.data?.data) && floorRes.data.data.length > 0) {
      return floorRes.data.data.map(r => ({
        contractId: r.contract_no,
        buyerBroker: String(r.buyer || ''),
        sellerBroker: String(r.seller || ''),
        qty: parseFloat(String(r.quantity || 0).replace(/,/g, '')) || 0,
        rate: parseFloat(String(r.rate || 0).replace(/,/g, '')) || 0,
        amount: parseFloat(String(r.amount || 0).replace(/,/g, '')) || 0,
        businessDate: r.date_ || new Date().toISOString().split('T')[0],
        symbol: sym
      }));
    }
  } catch (err) {
    console.warn(`[brokerVault] ShareSansar floorsheet scrape error for ${sym}:`, err.message);
  }
  return null;
}

export function aggregateFloorsheetRows(rows, symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const brokerMap = {};
  const dateMap = {};
  let totalTradedQty = 0;
  let totalTradedAmt = 0;

  rows.forEach(r => {
    const b = String(r.buyerBroker || r.buyerMemberId || r.buyer || '');
    const s = String(r.sellerBroker || r.sellerMemberId || r.seller || '');
    const q = Number(r.qty || r.contractQuantity || r.quantity || 0);
    const amt = Number(r.amount || r.contractAmount || (q * Number(r.rate || 0)) || 0);
    const d = String(r.businessDate || r.date || r.date_ || '');

    if (b) {
      brokerMap[b] = brokerMap[b] || { brokerId: b, brokerName: getBrokerName(b), buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
      brokerMap[b].buyQty += q;
      brokerMap[b].buyAmt += amt;
    }
    if (s) {
      brokerMap[s] = brokerMap[s] || { brokerId: s, brokerName: getBrokerName(s), buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
      brokerMap[s].sellQty += q;
      brokerMap[s].sellAmt += amt;
    }
    totalTradedQty += q;
    totalTradedAmt += amt;

    if (d) {
      dateMap[d] = dateMap[d] || { date: d, buyVol: 0, sellVol: 0, turnover: 0, totalTrades: 0 };
      dateMap[d].buyVol += q;
      dateMap[d].sellVol += q;
      dateMap[d].turnover += amt;
      dateMap[d].totalTrades += 1;
    }
  });

  const brokers = Object.values(brokerMap).map(x => ({
    ...x,
    netQty: x.buyQty - x.sellQty,
    netAmt: x.buyAmt - x.sellAmt,
    totalQty: x.buyQty + x.sellQty,
    avgBuyRate: x.buyQty > 0 ? +(x.buyAmt / x.buyQty).toFixed(1) : 0,
    avgSellRate: x.sellQty > 0 ? +(x.sellAmt / x.sellQty).toFixed(1) : 0,
  })).sort((a, b) => b.totalQty - a.totalQty);

  const topBuyers = [...brokers].sort((a, b) => b.buyQty - a.buyQty).slice(0, 5);
  const topSellers = [...brokers].sort((a, b) => b.sellQty - a.sellQty).slice(0, 5);
  const topNetBuyers = [...brokers].filter(x => x.netQty > 0).sort((a, b) => b.netQty - a.netQty).slice(0, 5);
  const topNetSellers = [...brokers].filter(x => x.netQty < 0).sort((a, b) => a.netQty - b.netQty).slice(0, 5);

  const netBuyerQty = topNetBuyers.reduce((s, b) => s + b.netQty, 0);
  const netSellerQty = Math.abs(topNetSellers.reduce((s, b) => s + b.netQty, 0));
  
  // A/D ratio bounded in [-1.0, 1.0]
  const adRatio = totalTradedQty > 0 ? +((netBuyerQty - netSellerQty) / totalTradedQty).toFixed(4) : 0;
  const adSignal = adRatio >= 0.05 ? 'Accumulation' : adRatio <= -0.05 ? 'Distribution' : 'Neutral';
  const adStrength = `${Math.min(99.9, Math.abs(adRatio * 100)).toFixed(1)}%`;

  const top3Volume = brokers.slice(0, 3).reduce((sum, b) => sum + b.totalQty, 0);
  const concentrationPct = totalTradedQty > 0 ? +(Math.min(95, (top3Volume / (totalTradedQty * 2)) * 100)).toFixed(1) : 30;

  const dailyFlow = Object.values(dateMap).map(df => ({
    ...df,
    netFlow: Math.round(df.buyVol * adRatio)
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const resObj = {
    symbol: sym,
    topBuyers,
    topSellers,
    topNetBuyers,
    topNetSellers,
    brokers,
    dailyFlow,
    totalTrades: rows.length,
    totalVolume: totalTradedQty,
    totalAmount: totalTradedAmt,
    adSignal,
    adStrength,
    adRatio,
    concentrationPct,
    isReal: true,
    source: 'sharesansar_authentic_floorsheet',
    updatedAt: new Date().toISOString()
  };

  return resObj;
}

function filterRowsByDays(rows, days) {
  if (!Array.isArray(rows) || rows.length === 0 || !days || days >= 365) return rows;
  const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  const cutoffStr = new Date(cutoffTime).toISOString().split('T')[0];
  const filtered = rows.filter(r => {
    const d = String(r.businessDate || r.date || r.date_ || '').trim();
    return !d || d >= cutoffStr;
  });
  return filtered.length > 0 ? filtered : rows;
}

export async function getOrFetchBrokerAnalysis(symbol, days = 30) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

  const cacheKey = `${sym}-${days}`;
  const now = Date.now();

  // 1. In-memory check
  const mem = memoryCache.get(cacheKey);
  if (mem && (now - mem.timestamp < 10 * 60 * 1000)) {
    return mem.data;
  }

  // 2. Persistent file vault check
  const vaultPath = path.join(VAULT_DIR, `${sym}.json`);
  if (fs.existsSync(vaultPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (fileData && fileData.updatedAt) {
        const fileAge = now - new Date(fileData.updatedAt).getTime();
        // If file is less than 30 minutes old during trading hours or market is closed, return it
        if (fileAge < 30 * 60 * 1000) {
          if (fileData.rawRows && fileData.rawRows.length > 0) {
            const scopedRows = filterRowsByDays(fileData.rawRows, days);
            const scopedData = aggregateFloorsheetRows(scopedRows, sym) || fileData;
            memoryCache.set(cacheKey, { timestamp: now, data: scopedData });
            return scopedData;
          }
          memoryCache.set(cacheKey, { timestamp: now, data: fileData });
          return fileData;
        }
      }
    } catch (_) {}
  }

  // 3. Live Authentic Fetch from ShareSansar
  const rows = await fetchShareSansarFloorsheet(sym, 500);
  if (rows && rows.length > 0) {
    const aggregated = aggregateFloorsheetRows(rows, sym);
    if (aggregated) {
      // Save to disk vault with raw transactions for timeframe slicing
      try {
        const toSave = { ...aggregated, rawRows: rows };
        fs.writeFileSync(vaultPath, JSON.stringify(toSave, null, 2), 'utf8');
      } catch (writeErr) {
        console.warn(`[brokerVault] Failed to save vault file for ${sym}:`, writeErr.message);
      }
      const scopedRows = filterRowsByDays(rows, days);
      const scopedData = (scopedRows.length !== rows.length) ? (aggregateFloorsheetRows(scopedRows, sym) || aggregated) : aggregated;
      memoryCache.set(cacheKey, { timestamp: now, data: scopedData });
      return scopedData;
    }
  }

  // 4. If fetch timed out, return existing vault file if present
  if (fs.existsSync(vaultPath)) {
    try {
      const fallbackFile = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      if (fallbackFile) {
        if (fallbackFile.rawRows && fallbackFile.rawRows.length > 0) {
          const scopedRows = filterRowsByDays(fallbackFile.rawRows, days);
          return aggregateFloorsheetRows(scopedRows, sym) || fallbackFile;
        }
        return fallbackFile;
      }
    } catch (_) {}
  }

  return null;
}
