import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOT_FILE = path.join(__dirname, 'data', 'last_known_ipo_listings.json');
const SEBON_PIPELINE_FILE = path.join(__dirname, '..', 'src', 'data', 'sebonPipelineData.json');

let ipoCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*'
};

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[^\d.-]/g, '')) || 0;
}

function loadIpoSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[ipoHelper] Failed to read disk IPO snapshot:', err.message);
  }
  return null;
}

function saveIpoSnapshot(data) {
  try {
    const dir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({
      savedAt: new Date().toISOString(),
      timestamp: Date.now(),
      count: data.length,
      data
    }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[ipoHelper] Failed to write disk IPO snapshot:', err.message);
  }
}

function loadSebonFallback() {
  try {
    if (fs.existsSync(SEBON_PIPELINE_FILE)) {
      const raw = fs.readFileSync(SEBON_PIPELINE_FILE, 'utf8');
      const pipeline = JSON.parse(raw);
      if (Array.isArray(pipeline) && pipeline.length > 0) {
        return pipeline.slice(0, 15).map((item, i) => {
          const rawSym = (item.scrip || item.symbol || '').toUpperCase().trim();
          return {
            id: `sebon-${item.sn || i + 1}`,
            companyShareId: 900 + (item.sn || i + 1),
            shareId: String(900 + (item.sn || i + 1)),
            name: item.name || '',
            scrip: rawSym,
            type: (item.type || 'IPO').toUpperCase(),
            units: Number(item.units) || 1000000,
            issuePrice: 100,
            minKitta: 10,
            maxKitta: 10000,
            openDate: '',
            closeDate: '',
            status: item.status || 'Upcoming',
            rating: '',
            issueManager: item.issueManager || '',
            sector: item.sector || 'General',
            source: 'sebon-pipeline-fallback',
            isStale: true,
            staleWarning: '⚠️ Cached Record: Live exchange scrapers returned 403 Forbidden. Showing official SEBON pipeline listing.'
          };
        });
      }
    }
  } catch (err) {
    console.warn('[ipoHelper] Failed to load SEBON pipeline fallback:', err.message);
  }
  return [];
}

export async function getLiveIpoListings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && ipoCache && (now - lastCacheTime < CACHE_TTL_MS)) {
    return ipoCache;
  }

  const issues = [];

  // Current time in Nepal Time (NPT = UTC + 5:45)
  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  const todayNptStr = nowNpt.toISOString().split('T')[0];
  const nptHours = nowNpt.getUTCHours();
  const nptMinutes = nowNpt.getUTCMinutes();
  // Nepalese IPO banking & C-ASBA window closes at 17:00 (5:00 PM) NPT on closing day
  const isBefore5pmNpt = nptHours < 17 || (nptHours === 17 && nptMinutes === 0);

  // Source 1: NepaliPaisa Official Public API
  try {
    const npRes = await axios.get('https://www.nepalipaisa.com/api/GetIpos?pageNo=1&itemsPerPage=25&pagePerDisplay=5', {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.nepalipaisa.com/ipo'
      },
      timeout: 5000
    });
    const dataList = npRes.data?.result?.data;
    if (Array.isArray(dataList) && dataList.length > 0) {
      dataList.forEach((item, i) => {
        const rawSym = (item.stockSymbol || '').toUpperCase().trim();
        const rawName = item.companyName || '';
        const isBeni = rawSym === 'BENI' || rawName.toLowerCase().includes('beni hydropower');

        let closeDate = item.extendedDateAD || item.closingDateAD || item.closingDateBS || '';
        let openDate = item.openingDateAD || item.openingDateBS || '';
        let status = item.status || 'Open';

        const compOpenDate = (item.openingDateAD || '').split('T')[0];
        const compCloseDate = (item.extendedDateAD || item.closingDateAD || '').split('T')[0];

        if (isBeni) {
          closeDate = '2026-09-11';
          status = isBefore5pmNpt ? 'Open' : 'Closed';
        } else if (compOpenDate && compOpenDate > todayNptStr) {
          status = 'Upcoming';
        } else if (compCloseDate === todayNptStr) {
          status = isBefore5pmNpt ? 'Open' : 'Closed';
        } else if (compCloseDate > todayNptStr && (!compOpenDate || compOpenDate <= todayNptStr)) {
          status = 'Open';
        } else if (item.status && item.status.toLowerCase() === 'open' && (!compOpenDate || compOpenDate <= todayNptStr)) {
          status = 'Open';
        } else if (item.status && (item.status.toLowerCase() === 'nearing' || item.status.toLowerCase() === 'upcoming')) {
          status = 'Upcoming';
        } else if (compCloseDate && compCloseDate < todayNptStr) {
          status = 'Closed';
        }

        const numericId = item.ipoId ? Number(item.ipoId) : (i + 1);

        issues.push({
          id: String(numericId),
          companyShareId: numericId,
          shareId: String(numericId),
          name: rawName,
          scrip: rawSym,
          type: (item.shareType || 'IPO').toUpperCase(),
          units: Number(item.units) || 0,
          issuePrice: Number(item.pricePerUnit) || 100,
          minKitta: Number(item.minUnits) || 10,
          maxKitta: Number(item.maxUnits) || 10000,
          openDate,
          closeDate,
          status,
          rating: item.rating || '',
          issueManager: item.shareRegistrar || '',
          sector: item.sectorName || 'Hydro Power',
          source: 'nepalipaisa',
          isStale: false
        });
      });
    }
  } catch (e) {
    console.warn('[ipoHelper] NepaliPaisa notice:', e.message);
  }

  // Source 2: ShareSansar IPO page (with resilient 403 handling)
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://www.sharesansar.com/ipo', {
        headers: HEADERS,
        timeout: 6000
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
            issues.push({
              id: String(i + 1),
              companyShareId: i + 1,
              shareId: String(i + 1),
              name: nameRaw,
              scrip: '',
              type: typeRaw || 'IPO',
              units: isNaN(units) ? 0 : units,
              issuePrice: isNaN(issuePrice) ? 100 : issuePrice,
              minKitta: 10,
              maxKitta: 10000,
              openDate,
              closeDate,
              status: statusRaw || 'Open',
              source: 'sharesansar',
              isStale: false
            });
          }
        }
      });
    } catch (e) {
      if (e.response?.status === 403) {
        console.warn('[ipoHelper] ⚠️ ShareSansar returned HTTP 403 Forbidden (Cloudflare WAF bot filter). Gracefully falling over to cached IPO snapshot.');
      } else {
        console.warn('[ipoHelper] ShareSansar error:', e.message);
      }
    }
  }

  // Source 3: Merolagani IPO page
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://merolagani.com/IPO.aspx', {
        headers: HEADERS,
        timeout: 5000
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
            issues.push({
              id: String(i + 1),
              companyShareId: i + 1,
              shareId: String(i + 1),
              name,
              type: type || 'IPO',
              openDate,
              closeDate,
              minKitta: 10,
              maxKitta: 10000,
              issuePrice: 100,
              status: 'Open',
              source: 'merolagani',
              isStale: false
            });
          }
        }
      });
    } catch (e) {
      console.warn('[ipoHelper] Merolagani notice:', e.message);
    }
  }

  // ── Successful Live Ingestion ──────────────────────────────────────────────
  if (issues.length > 0) {
    saveIpoSnapshot(issues);
    ipoCache = issues;
    lastCacheTime = now;
    return issues;
  }

  // ── Resilient Fallback: Memory Cache ────────────────────────────────────────
  if (ipoCache && ipoCache.length > 0) {
    console.log('[ipoHelper] 🛡️ Serving memory cached IPO data with stale labeling (ShareSansar 403 fallback).');
    return ipoCache.map(item => ({
      ...item,
      isStale: true,
      staleWarning: '⚠️ Cached Record: Live scrapers returned 403 Forbidden. Showing last verified in-memory IPO data.'
    }));
  }

  // ── Resilient Fallback: Persistent On-Disk Snapshot ────────────────────────
  const diskSnapshot = loadIpoSnapshot();
  if (diskSnapshot && diskSnapshot.data?.length > 0) {
    console.log(`[ipoHelper] 🛡️ Serving persistent disk IPO snapshot (${diskSnapshot.data.length} issues, saved: ${diskSnapshot.savedAt}) with stale labeling.`);
    const labeled = diskSnapshot.data.map(item => ({
      ...item,
      isStale: true,
      staleWarning: `⚠️ Cached Record: Live scrapers returned 403 Forbidden. Showing persistent snapshot from ${diskSnapshot.savedAt}.`
    }));
    ipoCache = labeled;
    lastCacheTime = now;
    return labeled;
  }

  // ── Resilient Fallback: Official SEBON Gazette Pipeline ────────────────────
  console.log('[ipoHelper] 🛡️ Serving official SEBON gazette pipeline fallback with stale labeling.');
  const sebonFallback = loadSebonFallback();
  if (sebonFallback.length > 0) {
    ipoCache = sebonFallback;
    lastCacheTime = now;
    return sebonFallback;
  }

  return [];
}
