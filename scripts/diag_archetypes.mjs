// scripts/diag_archetypes.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Check what the market level returns
const dates = db.prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date ASC`).all().map(r => r.trade_date);
console.log('Total dates in daily_stock_summary:', dates.length);
console.log('From:', dates[0], 'To:', dates[dates.length - 1]);
