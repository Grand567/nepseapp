import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
console.log('daily_broker_ledger columns:', db.prepare("PRAGMA table_info(daily_broker_ledger)").all().map(c => c.name));
console.log('daily_stock_summary columns:', db.prepare("PRAGMA table_info(daily_stock_summary)").all().map(c => c.name));
