import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve('proxy/data/drabyashree_ledger.db');
const VAULT_DIR = path.resolve('proxy/data/broker_vault');
const db = new Database(DB_PATH, { readonly: true });

console.log('========================================================================');
console.log('  AUDIT REPORT: BROKER VAULT VS DAILY BROKER LEDGER DEEP ANALYSIS        ');
console.log('========================================================================');
console.log(`Execution Timestamp: ${new Date().toISOString()}`);

// -----------------------------------------------------------------------------
// ITEM 1 & 2: Top 20 symbols by absolute volume difference & contract ID audit
// -----------------------------------------------------------------------------
const TARGET_DATES = ['2026-10-02', '2026-10-09', '2026-10-14'];
const vFiles = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.json'));

for (const dt of TARGET_DATES) {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`ITEM 1 & 2: TOP 20 SYMBOLS BY VOLUME DIFFERENCE ON ${dt}`);
  console.log(`------------------------------------------------------------------------`);

  const ledgerRows = db.prepare(`
    SELECT UPPER(symbol) as symbol, SUM(buy_vol) as ledger_buy_vol, SUM(sell_vol) as ledger_sell_vol
    FROM daily_broker_ledger
    WHERE trade_date = ?
    GROUP BY symbol
  `).all(dt);

  const ledgerMap = new Map();
  for (const r of ledgerRows) {
    ledgerMap.set(r.symbol, r.ledger_buy_vol);
  }

  const symbolStats = [];
  let totalVaultContracts = 0;
  let totalDuplicateContracts = 0;

  for (const f of vFiles) {
    const sym = f.replace('.json', '').toUpperCase();
    const vData = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8'));
    const rows = (vData.rowsByDate && vData.rowsByDate[dt]) || [];
    if (rows.length === 0 && !ledgerMap.has(sym)) continue;

    totalVaultContracts += rows.length;

    let vVol = 0;
    const cidSet = new Set();
    let dupCount = 0;

    for (const r of rows) {
      const q = Number(r.qty || r.quantity || 0);
      vVol += q;
      const cid = String(r.contractId || r.transaction || r.contract_no || '');
      if (cid) {
        if (cidSet.has(cid)) {
          dupCount++;
          totalDuplicateContracts++;
        } else {
          cidSet.add(cid);
        }
      }
    }

    const lVol = ledgerMap.get(sym) || 0;
    const diff = vVol - lVol;
    const absDiff = Math.abs(diff);

    symbolStats.push({
      symbol: sym,
      vault_vol: vVol,
      ledger_vol: lVol,
      diff_vol: diff,
      abs_diff: absDiff,
      vault_contracts: rows.length,
      distinct_cids: cidSet.size,
      duplicate_cids: dupCount,
    });
  }

  symbolStats.sort((a, b) => b.abs_diff - a.abs_diff);

  const top20 = symbolStats.slice(0, 20).map((s, idx) => ({
    rank: idx + 1,
    symbol: s.symbol,
    vault_vol: s.vault_vol,
    ledger_vol: s.ledger_vol,
    diff_vol: s.diff_vol,
    vault_contracts: s.vault_contracts,
    distinct_cids: s.distinct_cids,
    duplicate_cids: s.duplicate_cids,
  }));
  console.table(top20);

  const nonZero = symbolStats.filter(s => s.diff_vol !== 0);
  console.log(`Total symbols evaluated: ${symbolStats.length}`);
  console.log(`Symbols with exactly 0 volume difference: ${symbolStats.length - nonZero.length}`);
  console.log(`Symbols with non-zero volume difference:  ${nonZero.length}`);
  console.log(`Total session contracts in vault:        ${totalVaultContracts}`);
  console.log(`Total duplicate contract IDs in vault:   ${totalDuplicateContracts}`);
}

// -----------------------------------------------------------------------------
// ITEM 3: Recompute cross_vol where buyer = seller across earlier dates
// -----------------------------------------------------------------------------
console.log(`\n------------------------------------------------------------------------`);
console.log(`ITEM 3: RECOMPUTED CROSS VOLUME FROM VAULT (BUYER = SELLER)`);
console.log(`------------------------------------------------------------------------`);

const crossByDate = {};
for (const f of vFiles) {
  const vData = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8'));
  const rowsByDate = vData.rowsByDate || {};

  for (const [dt, rows] of Object.entries(rowsByDate)) {
    if (!crossByDate[dt]) {
      crossByDate[dt] = {
        date: dt,
        total_contracts: 0,
        total_volume: 0,
        total_turnover: 0,
        cross_contracts: 0,
        cross_volume: 0,
        cross_turnover: 0,
      };
    }

    const c = crossByDate[dt];
    for (const r of rows) {
      const q = Number(r.qty || r.quantity || 0);
      const amt = Number(r.amount || 0);
      const b = Number(r.buyerBroker || r.buyer || 0);
      const s = Number(r.sellerBroker || r.seller || 0);

      c.total_contracts++;
      c.total_volume += q;
      c.total_turnover += amt;

      if (b > 0 && b === s) {
        c.cross_contracts++;
        c.cross_volume += q;
        c.cross_turnover += amt;
      }
    }
  }
}

const earlierDates = [
  '2026-08-27', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-07', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14',
  '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-22',
  '2026-09-23', '2026-09-24', '2026-09-28', '2026-09-29', '2026-09-30',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
  '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'
];

const crossTable = earlierDates.map(dt => {
  const c = crossByDate[dt] || { total_contracts: 0, total_volume: 0, cross_contracts: 0, cross_volume: 0, cross_turnover: 0 };
  return {
    trade_date: dt,
    vault_contracts: c.total_contracts,
    vault_volume: c.total_volume,
    cross_contracts: c.cross_contracts,
    cross_volume: c.cross_volume,
    cross_turnover: Number(c.cross_turnover.toFixed(2)),
    cross_share_pct: c.total_volume > 0 ? Number(((c.cross_volume / c.total_volume) * 100).toFixed(3)) : 0,
  };
});
console.table(crossTable);

// -----------------------------------------------------------------------------
// ITEM 4: Dates in ledger by SOURCE (VAULT vs NOTS_FULL_DUMP)
// -----------------------------------------------------------------------------
console.log(`\n------------------------------------------------------------------------`);
console.log(`ITEM 4: SESSIONS IN LEDGER SOURCED ONLY FROM VAULT (NO NOTS FULL DUMP)`);
console.log(`------------------------------------------------------------------------`);

const sourceSummary = db.prepare(`
  SELECT 
    trade_date,
    source,
    COUNT(*) AS broker_rows,
    SUM(buy_vol) AS session_volume,
    ROUND(SUM(buy_amt), 2) AS session_turnover
  FROM daily_broker_ledger
  GROUP BY trade_date, source
  ORDER BY trade_date
`).all();
console.table(sourceSummary);

const vaultOnlyDates = sourceSummary.filter(r => r.source === 'VAULT').map(r => r.trade_date);
const notsDates = sourceSummary.filter(r => r.source === 'NOTS_FULL_DUMP').map(r => r.trade_date);

console.log(`Dates in Ledger with SOURCE = 'VAULT' (${vaultOnlyDates.length} sessions):`);
console.log(vaultOnlyDates.join(', '));

console.log(`\nDates in Ledger with SOURCE = 'NOTS_FULL_DUMP' (${notsDates.length} sessions):`);
console.log(notsDates.join(', '));

db.close();
