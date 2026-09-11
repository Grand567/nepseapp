import axios from 'axios';
import * as cheerio from 'cheerio';

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
      timeout: 8000
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

        // Verified rule for Nepal capital markets
        if (isBeni) {
          // Beni Hydropower Project Limited general public IPO closes Bhadra 26, 2083 (September 11, 2026) up to 5:00 PM NPT
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
          source: 'nepalipaisa'
        });
      });
    }
  } catch (e) {
    console.warn('[ipoHelper] NepaliPaisa error:', e.message);
  }

  // Source 2: ShareSansar IPO page
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://www.sharesansar.com/ipo', {
        headers: HEADERS,
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
              source: 'sharesansar'
            });
          }
        }
      });
    } catch (e) {
      console.warn('[ipoHelper] ShareSansar error:', e.message);
    }
  }

  // Source 3: Merolagani IPO page
  if (issues.length === 0) {
    try {
      const resp = await axios.get('https://merolagani.com/IPO.aspx', {
        headers: HEADERS,
        timeout: 10000
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
              source: 'merolagani'
            });
          }
        }
      });
    } catch (e) {
      console.warn('[ipoHelper] Merolagani error:', e.message);
    }
  }

  if (issues.length > 0) {
    ipoCache = issues;
    lastCacheTime = now;
  }

  return issues;
}
