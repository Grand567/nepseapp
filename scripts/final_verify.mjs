import Database from 'better-sqlite3';

const db = new Database('proxy/proxy/data/drabyashree_ledger.db', {readonly:true});

const sessions = db.prepare(`
  SELECT 
    s.trade_date,
    s.total_volume as summary_vol,
    COALESCE(fc.contracts, 0) as contracts,
    COALESCE(fc.fc_vol, 0) as fc_vol,
    COALESCE(bl.broker_vol, 0) as broker_vol
  FROM (
    SELECT trade_date, SUM(total_volume) as total_volume 
    FROM daily_stock_summary GROUP BY trade_date
  ) s
  LEFT JOIN (
    SELECT trade_date, COUNT(*) as contracts, SUM(kitta) as fc_vol 
    FROM floorsheet_contracts GROUP BY trade_date
  ) fc ON fc.trade_date = s.trade_date
  LEFT JOIN (
    SELECT trade_date, SUM(buy_vol) as broker_vol 
    FROM daily_broker_ledger GROUP BY trade_date
  ) bl ON bl.trade_date = s.trade_date
  ORDER BY s.trade_date DESC
`).all();

let missingContracts = 0;
let totalContracts = 0;
console.log('Date         | Contracts | FC_Vol      | Broker_Vol  | Status');
console.log('-------------|-----------|-------------|-------------|-------');
for (const r of sessions) {
  const status = r.contracts > 0 ? '✅ OK' : '❌ MISSING';
  if (r.contracts === 0) missingContracts++;
  else totalContracts += r.contracts;
  const line = [
    r.trade_date,
    String(r.contracts).padStart(9),
    String(r.fc_vol).padStart(11),
    String(r.broker_vol).padStart(11),
    status
  ].join(' | ');
  console.log(line);
}

console.log('\n' + '='.repeat(70));
console.log('FINAL SUMMARY');
console.log('='.repeat(70));
console.log(`Total sessions in DB:        ${sessions.length}`);
console.log(`Sessions WITH contracts:     ${sessions.filter(r => r.contracts > 0).length}`);
console.log(`Sessions MISSING contracts:  ${missingContracts}`);
console.log(`Total contracts in DB:       ${totalContracts.toLocaleString()}`);
console.log(missingContracts === 0 ? '\n🎉 ALL SESSIONS COMPLETE — BACKFILL 100% DONE!' : `\n⚠️  ${missingContracts} sessions still missing`);

db.close();
