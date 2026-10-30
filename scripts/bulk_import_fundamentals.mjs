/**
 * bulk_import_fundamentals.mjs
 * 
 * Scrapes fundamentals for all 390 traded symbols from MeroLagani
 * and upserts into scrip_fundamentals table.
 * 
 * Data fetched: EPS, Book Value (NWPS), sector, paid-up capital,
 * ROE, NPL%, CAR%, P/E (computed), promoter/public share %
 * 
 * Usage: node scripts/bulk_import_fundamentals.mjs
 */

import Database from 'better-sqlite3';
import https from 'https';

const DB_PATH = 'proxy/proxy/data/drabyashree_ledger.db';
const CONCURRENCY = 4;        // parallel requests
const DELAY_MS   = 800;       // ms between batches (polite crawl)
const TIMEOUT_MS = 15_000;

// ─── Sector mapping by symbol prefix / known mappings ──────────────────────
const SECTOR_MAP = {
  // Commercial Banks
  ADBL:'Development Banks', ACLBSL:'Development Banks', ALBSL:'Development Banks', ANLB:'Development Banks',
  GBIME:'Commercial Banks', NABIL:'Commercial Banks', NICA:'Commercial Banks', SANIMA:'Commercial Banks',
  SBL:'Commercial Banks', NBL:'Commercial Banks', PCBL:'Commercial Banks', PRVU:'Commercial Banks',
  SRBL:'Commercial Banks', EBL:'Commercial Banks', MBL:'Commercial Banks', NIMB:'Commercial Banks',
  HBL:'Commercial Banks', BOK:'Commercial Banks', CZBIL:'Commercial Banks', CBL:'Commercial Banks',
  KBL:'Commercial Banks', LBBL:'Commercial Banks', MEGA:'Commercial Banks', NMB:'Commercial Banks',
  SCB:'Commercial Banks', SHINE:'Commercial Banks', SIC:'Commercial Banks', SPDBL:'Commercial Banks',
  CCBL:'Commercial Banks', CTBN:'Commercial Banks',
  // Finance
  BFC:'Finance', CFCL:'Finance', GFCL:'Finance', GUFL:'Finance', ICFC:'Finance', JFL:'Finance',
  MFIL:'Finance', MPFL:'Finance', NFIL:'Finance', PROFL:'Finance', SFCL:'Finance', SIFC:'Finance',
  ULF:'Finance', FMDBL:'Finance',
  // Insurance
  ALICL:'Life Insurance', LICN:'Life Insurance', NLIC:'Life Insurance', PLINS:'Life Insurance',
  RLINS:'Life Insurance', SLI:'Life Insurance', SLICL:'Life Insurance', UGCIL:'Life Insurance',
  GLICL:'Non-Life Insurance', HGICL:'Non-Life Insurance', IGI:'Non-Life Insurance', NIC:'Non-Life Insurance',
  NICL:'Non-Life Insurance', NIL:'Non-Life Insurance', PICL:'Non-Life Insurance', PRIC:'Non-Life Insurance',
  RBCL:'Non-Life Insurance', SAIC:'Non-Life Insurance', SAPDBL:'Non-Life Insurance', SICL:'Non-Life Insurance',
  SGIC:'Non-Life Insurance', SIC:'Non-Life Insurance', UAIL:'Non-Life Insurance',
  // Hydro
  AHPC:'Hydropower', AKJCL:'Hydropower', AKPL:'Hydropower', APHL:'Hydropower', API:'Hydropower',
  BARUN:'Hydropower', BEDC:'Hydropower', BHCL:'Hydropower', BHDC:'Hydropower', BHPL:'Hydropower',
  BJHL:'Hydropower', BNHC:'Hydropower', BPCL:'Hydropower', BUNGAL:'Hydropower', CHCL:'Hydropower',
  CHL:'Hydropower', DHPL:'Hydropower', GHL:'Hydropower', GLH:'Hydropower', HDHPC:'Hydropower',
  HURJA:'Hydropower', JOSHI:'Hydropower', KPCL:'Hydropower', MHNL:'Hydropower', MHL:'Hydropower',
  MKJC:'Hydropower', MMKJL:'Hydropower', NHDL:'Hydropower', NHPC:'Hydropower', NLBBL:'Hydropower',
  NWCL:'Hydropower', PMHPL:'Hydropower', PPCL:'Hydropower', RADHI:'Hydropower', RIDI:'Hydropower',
  RHPC:'Hydropower', RURU:'Hydropower', SAHAS:'Hydropower', SPDL:'Hydropower', SSHL:'Hydropower',
  TGRHPC:'Hydropower', TRHPC:'Hydropower', UMHL:'Hydropower', UMRH:'Hydropower', UNHPL:'Hydropower',
  UPPER:'Hydropower', UPCL:'Hydropower',
  // Microfinance
  ASMBL:'Microfinance', AVYAN:'Microfinance', CBBL:'Microfinance', CCBL:'Microfinance',
  DDBL:'Microfinance', FMDBL:'Microfinance', FOWAD:'Microfinance', GBLBS:'Microfinance',
  GILB:'Microfinance', GMFBS:'Microfinance', JBBL:'Microfinance', KMCDB:'Microfinance',
  LLBS:'Microfinance', MLBSL:'Microfinance', MSLB:'Microfinance', NADEP:'Microfinance',
  NESDO:'Microfinance', NICLBSL:'Microfinance', NMBMF:'Microfinance', NMFBS:'Microfinance',
  RSDC:'Microfinance', SKBBL:'Microfinance', SMATA:'Microfinance', SMFBS:'Microfinance',
  SWBBL:'Microfinance', ULBSL:'Microfinance', USLB:'Microfinance', VLBS:'Microfinance',
  WOMI:'Microfinance',
};

// ─── fetch with timeout ─────────────────────────────────────────────────────
function httpsGet(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpsGet(res.headers.location, timeoutMs));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', reject);
  });
}

// ─── Parse MeroLagani CompanyDetail page ───────────────────────────────────
// Actual HTML structure from MeroLagani:
//   <th style="...">EPS</th>
//   <td class="">27.01<span ...>(FY:082-083, Q:4)</span></td>
function parseMeroLagani(html, symbol) {
  if (!html || html.length < 500) return null;

  // Extract all <th>LABEL</th><td>VALUE...</td> pairs into a map
  const kvMap = {};
  const thTdPattern = /<th[^>]*>\s*([^<\n]{1,60}?)\s*<\/th>\s*<td[^>]*>\s*([\d.,\-]+)/gis;
  let m;
  while ((m = thTdPattern.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const val = parseFloat(m[2].replace(/,/g, ''));
    if (!isNaN(val) && key.length < 50) {
      kvMap[key] = val;
    }
  }

  const get = (...keys) => {
    for (const k of keys) {
      for (const [mk, mv] of Object.entries(kvMap)) {
        if (mk.includes(k.toLowerCase())) return mv;
      }
    }
    return null;
  };

  const eps    = get('eps');
  const bvps   = get('book value', 'nwps', 'net worth per share');
  const roe    = get('roe', 'return on equity');
  const npl    = get('npl', 'non-performing');
  const car    = get('car', 'capital adequacy');
  const pe     = get('p/e', 'pe ratio', 'price.*earning');

  // Paid-up capital: often shown in crores on MeroLagani
  let paidUp = get('paid up', 'paid-up capital', 'share capital');
  // MeroLagani shows paid-up in full NPR (e.g., 27056997000)
  // but sometimes in Crore — if < 10000, multiply
  if (paidUp && paidUp < 10000) paidUp = paidUp * 10_000_000;

  // Shares outstanding → derive public float (approx)
  const sharesOutstanding = get('shares outstanding', 'total share');

  // Promoter / public %  — these appear as plain text, not always in th/td
  let promoterPct = get('promoter');
  let publicPct   = get('public');
  if (!promoterPct && !publicPct && sharesOutstanding) {
    promoterPct = null; // can't derive without more data
  }

  // Sector — MeroLagani breadcrumb or sector field
  const sectorM = html.match(/(?:Sector|Industry)[^<]*<\/th>\s*<td[^>]*>\s*([^<\n]{3,60}?)\s*(?:<|$)/i);
  const sector = (sectorM ? sectorM[1].trim() : null) || SECTOR_MAP[symbol] || 'Others';

  // Fiscal quarter from EPS span
  const fyM = html.match(/\(FY:(\d{2,4}[-\/]\d{2,4}),?\s*Q:(\d)\)/i);
  const fiscal_quarter = fyM ? `Q${fyM[2]} ${fyM[1]}` : 'Q4 2081/82';

  return { eps, bvps, roe, npl, car, pe, paidUp, promoterPct, publicPct, sector, fiscal_quarter };
}

// ─── Fetch from MeroLagani handler (JSON, more reliable) ───────────────────
async function fetchFromMeroLaganiHandler(symbol) {
  try {
    const url = `https://merolagani.com/handlers/webrequesthandler.ashx?type=get_floorsheet_company_graph&symbol=${encodeURIComponent(symbol)}&startDate=&endDate=`;
    const r = await httpsGet(url, 10000);
    if (r.status !== 200) return null;
    const json = JSON.parse(r.body);
    // This gives price history, not fundamentals — but we can extract some data
    return null;
  } catch { return null; }
}

// ─── Main scraper ───────────────────────────────────────────────────────────
async function scrapeFundamentals(symbol) {
  try {
    const url = `https://merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
    const r = await httpsGet(url, TIMEOUT_MS);
    if (r.status !== 200) {
      return { symbol, error: `HTTP ${r.status}` };
    }
    const parsed = parseMeroLagani(r.body, symbol);
    if (!parsed || (!parsed.eps && !parsed.bvps)) {
      return { symbol, error: 'no_data_parsed' };
    }
    return { symbol, ...parsed };
  } catch (err) {
    return { symbol, error: err.message };
  }
}

// ─── Upsert into DB ─────────────────────────────────────────────────────────
function upsertFundamentals(db, data) {
  const stmt = db.prepare(`
    INSERT INTO scrip_fundamentals (
      symbol, sector, fiscal_quarter,
      eps_ttm, book_value_per_share, roe_pct,
      npl_pct, car_pct, paid_up_capital,
      promoter_share_pct, public_share_pct,
      updated_at
    ) VALUES (
      @symbol, @sector, @fiscal_quarter,
      @eps_ttm, @book_value_per_share, @roe_pct,
      @npl_pct, @car_pct, @paid_up_capital,
      @promoter_share_pct, @public_share_pct,
      datetime('now')
    )
    ON CONFLICT(symbol) DO UPDATE SET
      sector = excluded.sector,
      eps_ttm = COALESCE(excluded.eps_ttm, scrip_fundamentals.eps_ttm),
      book_value_per_share = COALESCE(excluded.book_value_per_share, scrip_fundamentals.book_value_per_share),
      roe_pct = COALESCE(excluded.roe_pct, scrip_fundamentals.roe_pct),
      npl_pct = COALESCE(excluded.npl_pct, scrip_fundamentals.npl_pct),
      car_pct = COALESCE(excluded.car_pct, scrip_fundamentals.car_pct),
      paid_up_capital = COALESCE(excluded.paid_up_capital, scrip_fundamentals.paid_up_capital),
      promoter_share_pct = COALESCE(excluded.promoter_share_pct, scrip_fundamentals.promoter_share_pct),
      public_share_pct = COALESCE(excluded.public_share_pct, scrip_fundamentals.public_share_pct),
      updated_at = datetime('now')
  `);

  stmt.run({
    symbol: data.symbol,
    sector: data.sector || SECTOR_MAP[data.symbol] || 'Others',
    fiscal_quarter: 'Q4 2081/82',
    eps_ttm: data.eps ?? null,
    book_value_per_share: data.bvps ?? null,
    roe_pct: data.roe ?? null,
    npl_pct: data.npl ?? null,
    car_pct: data.car ?? null,
    paid_up_capital: data.paidUp ?? null,
    promoter_share_pct: data.promoterPct ?? null,
    public_share_pct: data.publicPct ?? null,
  });
}

// ─── Process in batches ─────────────────────────────────────────────────────
async function processBatch(symbols) {
  return Promise.all(symbols.map(scrapeFundamentals));
}

async function main() {
  const db = new Database(DB_PATH);

  // Get all symbols that are either missing or haven't been updated in 7+ days
  const allSymbols = db.prepare(`SELECT DISTINCT symbol FROM daily_stock_summary ORDER BY symbol`).all().map(r => r.symbol);
  const existingMap = new Map(
    db.prepare(`SELECT symbol, updated_at FROM scrip_fundamentals`).all().map(r => [r.symbol, r.updated_at])
  );

  const toFetch = allSymbols.filter(s => {
    const upd = existingMap.get(s);
    if (!upd) return true; // missing
    const daysSince = (Date.now() - new Date(upd).getTime()) / 86400000;
    return daysSince > 7; // stale
  });

  console.log('='.repeat(65));
  console.log(`BULK FUNDAMENTALS IMPORT — ${toFetch.length} symbols to fetch`);
  console.log('='.repeat(65));

  let ok = 0, noData = 0, errors = 0;
  const errorList = [];

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);

    for (const r of results) {
      if (r.error) {
        const isNoData = r.error === 'no_data_parsed';
        if (isNoData) {
          // Still insert with sector from map so the symbol exists in the table
          try {
            upsertFundamentals(db, r);
            noData++;
          } catch {}
        } else {
          errors++;
          errorList.push(`${r.symbol}: ${r.error}`);
        }
        process.stdout.write(`⚠ ${r.symbol}(${r.error.slice(0,20)}) `);
      } else {
        upsertFundamentals(db, r);
        ok++;
        process.stdout.write(`✓ ${r.symbol} `);
      }
    }

    // Progress line
    const done = Math.min(i + CONCURRENCY, toFetch.length);
    console.log(`\n  [${done}/${toFetch.length}] ok=${ok} noData=${noData} err=${errors}`);

    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log('\n' + '='.repeat(65));
  console.log('IMPORT COMPLETE');
  console.log(`✅ With data:     ${ok}`);
  console.log(`⚠️  No data parsed: ${noData} (inserted with sector only)`);
  console.log(`❌ Errors:         ${errors}`);
  if (errorList.length) {
    console.log('\nErrors:');
    errorList.forEach(e => console.log('  ', e));
  }

  const total = db.prepare('SELECT COUNT(*) as c FROM scrip_fundamentals').get().c;
  console.log(`\n📊 scrip_fundamentals now has ${total} rows (was 6)`);
  console.log('='.repeat(65));

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
