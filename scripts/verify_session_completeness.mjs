import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join('proxy', 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });
const rows = db.prepare(`
  SELECT s.trade_date d,
    (SELECT COUNT(*) FROM floorsheet_contracts f WHERE f.trade_date=s.trade_date) contracts,
    (SELECT SUM(kitta) FROM floorsheet_contracts f WHERE f.trade_date=s.trade_date) fcVol,
    (SELECT SUM(buy_vol) FROM daily_broker_ledger b WHERE b.trade_date=s.trade_date) brokerVol,
    SUM(s.total_volume) stockVol
  FROM daily_stock_summary s GROUP BY s.trade_date ORDER BY s.trade_date DESC`).all();
const log = Object.fromEntries(db.prepare('SELECT * FROM daily_ingestion_log').all().map(r => [r.trade_date, r]));
console.log('date        contracts   fcVol     brokerVol stockVol  dow  flags');
for (const r of rows) {
  const dow = new Date(r.d + 'T00:00:00Z').getUTCDay();
  const flags = [];
  if (dow === 0 || dow === 6) flags.push('WEEKEND');
  if (!r.contracts) flags.push('NO_CONTRACTS');
  if (r.contracts && (r.fcVol !== r.stockVol || r.brokerVol !== r.stockVol)) flags.push('VOL_MISMATCH');
  if (log[r.d] && log[r.d].completeness_pct < 100) flags.push(`LOG_${log[r.d].completeness_pct}%`);
  console.log(`${r.d}  ${String(r.contracts).padEnd(10)} ${String(r.fcVol).padEnd(9)} ${String(r.brokerVol).padEnd(9)} ${String(r.stockVol).padEnd(9)} ${dow}    ${flags.join(',') || 'OK'}`);
}
