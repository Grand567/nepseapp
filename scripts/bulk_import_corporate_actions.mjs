/**
 * bulk_import_corporate_actions.mjs
 * 
 * Scrapes corporate actions (dividends, bonus, rights) from MeroLagani
 * for all actively traded symbols and upserts into scrip_corporate_actions.
 * 
 * Uses the proxy's existing server-side scraping logic pattern.
 * 
 * Usage: node scripts/bulk_import_corporate_actions.mjs
 */

import Database from 'better-sqlite3';
import https from 'https';

const DB_PATH = 'proxy/proxy/data/drabyashree_ledger.db';
const CONCURRENCY = 3;
const DELAY_MS = 1000;
const TIMEOUT_MS = 15_000;

function httpsGet(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,*/*',
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

/**
 * Parse dividend/bonus/rights from MeroLagani CompanyDetail page.
 * The page has a "Dividend History" or "Bonus/Rights" section.
 */
function parseCorporateActions(html, symbol) {
  if (!html || html.length < 500) return [];

  const actions = [];

  // MeroLagani dividend history table rows:
  // Pattern: fiscal year | bonus% | cash% | book close date | status
  // Look for table rows in the dividend section

  // Try to find the dividend history section
  const divSection = html.match(/(?:Dividend History|Bonus.*?History)([\s\S]{0,8000}?)(?:<\/table>|$)/i);
  if (divSection) {
    const rows = divSection[1].match(/<tr[^>]*>([\s\S]+?)<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 3) continue;

      const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

      // Expect: FiscalYear | Bonus% | Cash% | [Rights] | BookClose | Status
      const fyMatch = cellTexts[0]?.match(/(\d{4}\/\d{2,4})/);
      if (!fyMatch) continue;

      const fy = fyMatch[1];
      const bonus = parseFloat(cellTexts[1]?.replace(/[^0-9.]/g, '') || '0') || 0;
      const cash  = parseFloat(cellTexts[2]?.replace(/[^0-9.]/g, '') || '0') || 0;

      // Rights ratio might be in cell 3 or 4
      let rights = null;
      let bookClose = null;
      let status = 'APPROVED';

      for (let ci = 3; ci < cellTexts.length; ci++) {
        const t = cellTexts[ci];
        if (/\d+:\d+/.test(t)) rights = t.match(/\d+:\d+/)[0];
        if (/\d{4}-\d{2}-\d{2}/.test(t)) bookClose = t.match(/\d{4}-\d{2}-\d{2}/)[0];
        if (/PROPOSED|APPROVED|DISTRIBUTED/i.test(t)) status = t.match(/PROPOSED|APPROVED|DISTRIBUTED/i)[0].toUpperCase();
      }

      if (bonus > 0 || cash > 0 || rights) {
        actions.push({ fy, bonus, cash, total: bonus + cash, rights, bookClose, status });
      }
    }
  }

  // Fallback: look for any table with fiscal year pattern  
  if (actions.length === 0) {
    const allRows = html.match(/<tr[^>]*>([\s\S]+?)<\/tr>/gi) || [];
    for (const row of allRows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 3) continue;
      const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').replace(/\s+/, ' ').trim());
      const fyMatch = cellTexts[0]?.match(/^(20[67]\d\/\d{2,4})$/);
      if (!fyMatch) continue;
      const bonus = parseFloat(cellTexts.find(t => t.match(/^\d+\.?\d*$/) && parseFloat(t) < 200) || '0') || 0;
      const cash = parseFloat(cellTexts[2]?.replace(/[^0-9.]/g,'') || '0') || 0;
      if (bonus > 0 || cash > 0) {
        actions.push({ fy: fyMatch[1], bonus, cash, total: bonus+cash, rights: null, bookClose: null, status: 'APPROVED' });
      }
    }
  }

  return actions;
}

async function scrapeSymbol(symbol) {
  try {
    const url = `https://merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(symbol)}`;
    const r = await httpsGet(url, TIMEOUT_MS);
    if (r.status !== 200) return { symbol, actions: [], error: `HTTP ${r.status}` };
    const actions = parseCorporateActions(r.body, symbol);
    return { symbol, actions };
  } catch (err) {
    return { symbol, actions: [], error: err.message };
  }
}

async function main() {
  const db = new Database(DB_PATH);

  // Get all symbols
  const allSymbols = db.prepare(`SELECT DISTINCT symbol FROM daily_stock_summary ORDER BY symbol`).all().map(r => r.symbol);

  // Which ones already have corporate action data?
  const existingSymbols = new Set(db.prepare(`SELECT DISTINCT symbol FROM scrip_corporate_actions`).all().map(r => r.symbol));
  const toFetch = allSymbols.filter(s => !existingSymbols.has(s));

  console.log('='.repeat(65));
  console.log(`BULK CORPORATE ACTIONS IMPORT — ${toFetch.length} symbols to fetch`);
  console.log(`(${existingSymbols.size} symbols already have data)`);
  console.log('='.repeat(65));

  const upsert = db.prepare(`
    INSERT OR IGNORE INTO scrip_corporate_actions
      (symbol, fiscal_year, bonus_share_pct, cash_dividend_pct, total_dividend_pct, 
       right_share_ratio, book_close_date, status)
    VALUES
      (@symbol, @fiscal_year, @bonus, @cash, @total, @rights, @bookClose, @status)
  `);

  let withData = 0, noData = 0, errors = 0;
  let totalActions = 0;

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(scrapeSymbol));

    for (const r of results) {
      if (r.error && r.actions.length === 0) {
        errors++;
        process.stdout.write(`✗${r.symbol} `);
      } else if (r.actions.length === 0) {
        noData++;
        process.stdout.write(`·${r.symbol} `);
      } else {
        for (const a of r.actions) {
          upsert.run({
            symbol: r.symbol,
            fiscal_year: a.fy,
            bonus: a.bonus,
            cash: a.cash,
            total: a.total,
            rights: a.rights,
            bookClose: a.bookClose,
            status: a.status,
          });
          totalActions++;
        }
        withData++;
        process.stdout.write(`✓${r.symbol}(${r.actions.length}) `);
      }
    }

    const done = Math.min(i + CONCURRENCY, toFetch.length);
    console.log(`\n  [${done}/${toFetch.length}] withData=${withData} noData=${noData} err=${errors} actions=${totalActions}`);

    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(res => setTimeout(res, DELAY_MS));
    }
  }

  const totalRows = db.prepare('SELECT COUNT(*) as c FROM scrip_corporate_actions').get().c;
  const uniqueSymbols = db.prepare('SELECT COUNT(DISTINCT symbol) as c FROM scrip_corporate_actions').get().c;

  console.log('\n' + '='.repeat(65));
  console.log('CORPORATE ACTIONS IMPORT COMPLETE');
  console.log(`✅ Symbols with actions: ${withData}`);
  console.log(`ℹ️  Symbols with no history: ${noData}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total rows: ${totalRows} across ${uniqueSymbols} symbols`);
  console.log('='.repeat(65));

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
