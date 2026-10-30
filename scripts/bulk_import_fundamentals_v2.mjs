/**
 * bulk_import_fundamentals_v2.mjs
 * 
 * Uses the PROXY'S OWN /api/company/:symbol endpoint to pull fundamentals
 * for all 390 symbols and persist them into scrip_fundamentals.
 * 
 * This avoids re-implementing the scraper — the proxy already has cheerio,
 * axios, ShareSansar fallback, etc. We just call the proxy in bulk.
 * 
 * Usage: node scripts/bulk_import_fundamentals_v2.mjs
 */

import Database from 'better-sqlite3';

const DB_PATH   = 'proxy/proxy/data/drabyashree_ledger.db';
const PROXY_URL = 'http://localhost:5000';
const CONCURRENCY = 5;
const DELAY_MS    = 600;

async function fetchCompany(symbol) {
  try {
    const res = await fetch(`${PROXY_URL}/api/company/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { symbol, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { symbol, data: json.data };
  } catch (e) {
    return { symbol, error: e.message };
  }
}

const SECTOR_MAP = {
  ADBL:'Development Banks', ACLBSL:'Development Banks', ALBSL:'Development Banks',
  ANLB:'Development Banks', GBIME:'Commercial Banks', NABIL:'Commercial Banks',
  NICA:'Commercial Banks', SANIMA:'Commercial Banks', SBL:'Commercial Banks',
  NBL:'Commercial Banks', PCBL:'Commercial Banks', PRVU:'Commercial Banks',
  SRBL:'Commercial Banks', EBL:'Commercial Banks', MBL:'Commercial Banks',
  NIMB:'Commercial Banks', HBL:'Commercial Banks', BOK:'Commercial Banks',
  CZBIL:'Commercial Banks', CBL:'Commercial Banks', KBL:'Commercial Banks',
  LBBL:'Commercial Banks', MEGA:'Commercial Banks', NMB:'Commercial Banks',
  SCB:'Commercial Banks', SHINE:'Commercial Banks', CCBL:'Commercial Banks',
  CTBN:'Commercial Banks', BFC:'Finance', CFCL:'Finance', GFCL:'Finance',
  ICFC:'Finance', JFL:'Finance', MFIL:'Finance', MPFL:'Finance',
  ALICL:'Life Insurance', LICN:'Life Insurance', NLIC:'Life Insurance',
  AHPC:'Hydropower', AKJCL:'Hydropower', AKPL:'Hydropower', APHL:'Hydropower',
  BARUN:'Hydropower', CHCL:'Hydropower', DOLTI:'Hydropower', GHL:'Hydropower',
  HURJA:'Hydropower', KPCL:'Hydropower', MHL:'Hydropower', NHDL:'Hydropower',
  NHPC:'Hydropower', PPCL:'Hydropower', RADHI:'Hydropower', RIDI:'Hydropower',
  RHPC:'Hydropower', SSHL:'Hydropower', UPPER:'Hydropower', UPCL:'Hydropower',
  AVYAN:'Microfinance', CBBL:'Microfinance', DDBL:'Microfinance',
  FOWAD:'Microfinance', JBBL:'Microfinance', SKBBL:'Microfinance',
  SMFBS:'Microfinance', SWBBL:'Microfinance', WOMI:'Microfinance',
};

async function main() {
  const db = new Database(DB_PATH);

  const allSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM daily_stock_summary 
     WHERE symbol NOT LIKE '%D%8%' AND symbol NOT LIKE '%D%9%'  -- skip debentures
       AND symbol NOT LIKE '%MF%' AND symbol NOT LIKE '%F%1' AND symbol NOT LIKE '%F%2' AND symbol NOT LIKE '%F%3'  -- skip mutual funds
     ORDER BY symbol`
  ).all().map(r => r.symbol);

  // Only fetch those with null EPS & null book_value (inserted by v1 with no data)
  const needsData = db.prepare(
    `SELECT symbol FROM scrip_fundamentals 
     WHERE (eps_ttm IS NULL OR eps_ttm = 0) 
       AND (book_value_per_share IS NULL OR book_value_per_share = 0)`
  ).all().map(r => r.symbol);

  // Also include any not yet in the table
  const existing = new Set(db.prepare(`SELECT symbol FROM scrip_fundamentals`).all().map(r => r.symbol));
  const notInTable = allSymbols.filter(s => !existing.has(s));

  const toFetch = [...new Set([...needsData, ...notInTable])].sort();

  console.log('='.repeat(65));
  console.log(`FUNDAMENTALS IMPORT v2 — using proxy /api/company/:symbol`);
  console.log(`Symbols to fetch: ${toFetch.length}`);
  console.log('='.repeat(65));

  const upsert = db.prepare(`
    INSERT INTO scrip_fundamentals
      (symbol, sector, fiscal_quarter, eps_ttm, book_value_per_share,
       paid_up_capital, promoter_share_pct, public_share_pct, updated_at)
    VALUES
      (@symbol, @sector, 'Q4 2081/82', @eps, @bvps,
       @paidUp, @promoterPct, @publicPct, datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET
      sector = COALESCE(excluded.sector, scrip_fundamentals.sector),
      eps_ttm = CASE WHEN excluded.eps_ttm > 0 THEN excluded.eps_ttm ELSE scrip_fundamentals.eps_ttm END,
      book_value_per_share = CASE WHEN excluded.book_value_per_share > 0 THEN excluded.book_value_per_share ELSE scrip_fundamentals.book_value_per_share END,
      paid_up_capital = CASE WHEN excluded.paid_up_capital > 0 THEN excluded.paid_up_capital ELSE scrip_fundamentals.paid_up_capital END,
      promoter_share_pct = COALESCE(excluded.promoter_share_pct, scrip_fundamentals.promoter_share_pct),
      public_share_pct = COALESCE(excluded.public_share_pct, scrip_fundamentals.public_share_pct),
      updated_at = datetime('now')
  `);

  let withData = 0, empty = 0, errors = 0;

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchCompany));

    for (const r of results) {
      if (r.error) {
        errors++;
        process.stdout.write(`✗${r.symbol} `);
        continue;
      }
      const d = r.data || {};
      const hasData = (d.eps > 0 || d.bookValue > 0);
      upsert.run({
        symbol: r.symbol,
        sector: d.sector || SECTOR_MAP[r.symbol] || 'Others',
        eps: d.eps || null,
        bvps: d.bookValue || null,
        paidUp: d.paidUpCapital || null,
        promoterPct: null,
        publicPct: null,
      });
      if (hasData) { withData++; process.stdout.write(`✓${r.symbol}(EPS=${d.eps},BV=${d.bookValue}) `); }
      else         { empty++;    process.stdout.write(`·${r.symbol} `); }
    }

    const done = Math.min(i + CONCURRENCY, toFetch.length);
    console.log(`\n  [${done}/${toFetch.length}] withData=${withData} empty=${empty} err=${errors}`);

    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(res => setTimeout(res, DELAY_MS));
    }
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM scrip_fundamentals`).get().c;
  const withEps = db.prepare(`SELECT COUNT(*) as c FROM scrip_fundamentals WHERE eps_ttm > 0`).get().c;
  const withBv  = db.prepare(`SELECT COUNT(*) as c FROM scrip_fundamentals WHERE book_value_per_share > 0`).get().c;

  console.log('\n' + '='.repeat(65));
  console.log('IMPORT COMPLETE');
  console.log(`✅ Symbols with EPS/BV data: ${withData}`);
  console.log(`ℹ️  Symbols with no data:     ${empty}`);
  console.log(`❌ Errors:                    ${errors}`);
  console.log(`\n📊 scrip_fundamentals: ${total} rows`);
  console.log(`   - with EPS > 0:      ${withEps}`);
  console.log(`   - with Book Value:   ${withBv}`);
  console.log('='.repeat(65));

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
