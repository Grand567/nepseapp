import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { aggregateMarketFloorsheet } from '../proxy/brokerVault.mjs';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath);

// Fetch authentic trading dates from SQLite floorsheet_contracts & daily_stock_summary
const storedDates = db.prepare(`
  SELECT DISTINCT trade_date
  FROM floorsheet_contracts
  ORDER BY trade_date DESC
  LIMIT 50
`).all().map(r => r.trade_date);

console.log('Stored trading dates in SQLite:', storedDates.slice(0, 10));

// Read the complete 2026-10-28 floorsheet file
const fsPath = path.join(process.cwd(), 'proxy', 'data', 'floorsheet-full-2026-10-28.json');
if (!fs.existsSync(fsPath)) {
  console.error('File not found:', fsPath);
  process.exit(1);
}

const trades = JSON.parse(fs.readFileSync(fsPath, 'utf8'));
console.log(`Loaded ${trades.length} contracts for 2026-10-28.`);

const agg = aggregateMarketFloorsheet(trades, '2026-10-28');
agg.availableDates = storedDates;
agg.businessDate = '2026-10-28';

console.log(`Aggregated matrix for ${agg.matrix.length} brokers.`);
console.log(`Top brokers:`, agg.topBrokers.slice(0, 10));

const outPaths = [
  path.join(process.cwd(), 'src', 'data', 'broker_matrix_latest.json'),
  path.join(process.cwd(), 'proxy', 'data', 'broker_matrix_latest.json')
];

for (const outPath of outPaths) {
  fs.writeFileSync(outPath, JSON.stringify(agg, null, 2), 'utf8');
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`Saved ${outPath} (${sizeMb} MB) with businessDate: 2026-10-28`);
}

db.close();
console.log('Matrix generation completed successfully.');
