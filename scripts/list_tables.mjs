import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join('proxy/data/drabyashree_ledger.db'));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t=>t.name).join(', '));

if (tables.length > 0) {
  tables.forEach(t => {
    const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
    console.log(`  ${t.name}: ${cnt.c.toLocaleString()} rows`);
  });
}
db.close();
