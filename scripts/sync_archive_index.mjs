import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/proxy/data/drabyashree_ledger.db', { readonly: true });
const sessions = db.prepare(`
  SELECT trade_date, COUNT(*) as tradeCount, SUM(kitta) as totalVolume, SUM(amount) as totalTurnover
  FROM floorsheet_contracts
  GROUP BY trade_date
  ORDER BY trade_date ASC
`).all();

const index = sessions.map(s => ({
  date: s.trade_date,
  tradeCount: s.tradeCount,
  totalVolume: s.totalVolume,
  totalTurnover: Math.round(s.totalTurnover),
  filePath: `data/daily_floorsheets/floorsheet-${s.trade_date}.json`,
  gzFilePath: `data/daily_floorsheets/floorsheet-${s.trade_date}.json.gz`,
  archivedAt: new Date().toISOString()
}));

fs.writeFileSync('proxy/data/daily_floorsheets/archive_index.json', JSON.stringify(index, null, 2));
fs.writeFileSync('proxy/proxy/data/daily_floorsheets/archive_index.json', JSON.stringify(index, null, 2));
console.log(`Synchronized archive_index.json with all ${index.length} sessions!`);
db.close();
