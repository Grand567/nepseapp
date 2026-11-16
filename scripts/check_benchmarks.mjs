import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });
const rows = db.prepare("SELECT * FROM official_exchange_benchmarks LIMIT 5").all();
console.log(rows);
