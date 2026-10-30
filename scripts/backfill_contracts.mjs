/**
 * Bulk Backfill: floorsheet_contracts for all sessions missing tick-level data
 *
 * Sources (in priority order):
 *   1. proxy/data/floorsheet-full-YYYY-MM-DD.json
 *   2. proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json
 *   3. proxy/proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json
 *
 * Target DB: proxy/proxy/data/drabyashree_ledger.db  (the live proxy DB)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join('proxy', 'proxy', 'data', 'drabyashree_ledger.db');
const SOURCES = [
  path.join('proxy', 'data'),                            // floorsheet-full-*.json
  path.join('proxy', 'data', 'daily_floorsheets'),       // floorsheet-*.json
  path.join('proxy', 'proxy', 'data', 'daily_floorsheets'), // live proxy folder
];

const db = new Database(DB_PATH);

// --- Get sessions missing floorsheet_contracts ---
const missing = db.prepare(`
  SELECT DISTINCT s.trade_date
  FROM daily_stock_summary s
  WHERE NOT EXISTS (
    SELECT 1 FROM floorsheet_contracts f WHERE f.trade_date = s.trade_date
  )
  ORDER BY s.trade_date DESC
`).all().map(r => r.trade_date);

console.log(`Sessions missing floorsheet_contracts: ${missing.length}`);
console.log(missing.join(', '));
console.log('');

// --- Prepare insert statement ---
const insertContract = db.prepare(`
  INSERT OR IGNORE INTO floorsheet_contracts (
    contract_no, symbol, trade_date, trade_time,
    buyer_broker, seller_broker, kitta, rate, amount,
    aggressor_side, is_internal_cross, is_whale_print,
    is_quarantined, calendar_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID')
`);

const tx = db.transaction((tradeDate, rows) => {
  let inserted = 0;
  for (const t of rows) {
    const cNo = String(t.contractId || t.contractNo || t.contract_no || t.id || `${tradeDate.replace(/-/g,'')}${inserted}`);
    const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
    if (!sym) continue;
    const bBroker = parseInt(String(t.buyerMemberId || t.buyerBroker || t.buyer_broker || t.buyer || 0).replace(/\D/g,''), 10) || 0;
    const sBroker = parseInt(String(t.sellerMemberId || t.sellerBroker || t.seller_broker || t.seller || 0).replace(/\D/g,''), 10) || 0;
    const kitta   = Math.round(Number(t.contractQuantity ?? t.qty ?? t.kitta ?? t.quantity ?? 0));
    const rate    = Number(t.contractRate ?? t.rate ?? t.executionRate ?? 0);
    const amount  = Number(t.contractAmount ?? t.amount ?? (kitta * rate));
    const tTime   = String(t.tradeTime || t.businessDate || `${tradeDate}T15:00:00`);
    const isCross = (bBroker > 0 && bBroker === sBroker) ? 1 : 0;
    const isWhale = kitta >= 500 ? 1 : 0;
    const agg     = t.aggressorSide || t.aggressor || t.aggressor_side || (bBroker > sBroker ? 'BUY' : 'SELL');
    insertContract.run(cNo, sym, tradeDate, tTime, bBroker, sBroker, kitta, rate, amount, agg, isCross, isWhale);
    inserted++;
  }
  return inserted;
});

// --- Find best JSON file for a given date ---
function findJsonFile(date) {
  const candidates = [
    path.join(SOURCES[0], `floorsheet-full-${date}.json`),
    path.join(SOURCES[1], `floorsheet-${date}.json`),
    path.join(SOURCES[2], `floorsheet-${date}.json`),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f) && fs.statSync(f).size > 10000) return f;
  }
  return null;
}

// --- Process each missing session ---
let totalInserted = 0;
let sessionsDone  = 0;
let sessionsFailed = 0;

for (const date of missing) {
  const file = findJsonFile(date);
  if (!file) {
    console.log(`[SKIP] ${date} — no JSON file found`);
    sessionsFailed++;
    continue;
  }

  process.stdout.write(`[BACKFILL] ${date} from ${path.basename(file)} … `);
  try {
    const trades = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(trades) || trades.length === 0) { console.log('empty'); sessionsFailed++; continue; }

    // Date-label guard: check first trade's embedded date
    const sample = trades[0];
    const embedded = String(sample?.businessDate || sample?.trade_date || '').split('T')[0].trim();
    if (embedded && embedded !== date) {
      console.log(`MISLABELED (file says ${embedded}) — SKIP`);
      sessionsFailed++;
      continue;
    }

    const count = tx(date, trades);
    console.log(`${count} contracts inserted`);
    totalInserted += count;
    sessionsDone++;
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    sessionsFailed++;
  }
}

// --- Final 3-way conservation check ---
console.log(`\n=== BACKFILL COMPLETE ===`);
console.log(`Sessions fixed: ${sessionsDone}`);
console.log(`Sessions with no file: ${sessionsFailed}`);
console.log(`Total contracts inserted: ${totalInserted.toLocaleString()}`);
console.log(`\nPost-backfill 3-way conservation spot check:`);

const spotDates = missing.filter(d => sessionsDone > 0).slice(0, 5);
for (const date of spotDates) {
  const fc  = db.prepare("SELECT SUM(kitta) as v FROM floorsheet_contracts WHERE trade_date=?").get(date)?.v || 0;
  const dbl = db.prepare("SELECT SUM(buy_vol) as v FROM daily_broker_ledger WHERE trade_date=?").get(date)?.v || 0;
  const dss = db.prepare("SELECT SUM(total_volume) as v FROM daily_stock_summary WHERE trade_date=?").get(date)?.v || 0;
  const ok  = fc === dbl && dbl === dss ? '✅ OK' : `⚠️  fc=${fc} dbl=${dbl} dss=${dss}`;
  console.log(`  ${date}: ${ok}`);
}

db.close();
