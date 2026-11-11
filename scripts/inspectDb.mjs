import Database from 'better-sqlite3';
const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

for (const t of tables) {
  try {
    const count = db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get();
    console.log(`Table ${t.name}: ${count.c} rows`);
  } catch (e) {
    console.log(`Table ${t.name}: error ${e.message}`);
  }
}

try {
  const dates = db.prepare("SELECT DISTINCT date FROM daily_candles ORDER BY date DESC LIMIT 10").all();
  console.log('Latest candle dates:', dates.map(d => d.date));
} catch (e) {
  console.log('daily_candles error:', e.message);
}
