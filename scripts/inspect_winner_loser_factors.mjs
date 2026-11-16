// scripts/inspect_winner_loser_factors.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Check what factors differentiated winning trades from losing trades in the 6-month universe
console.log('Inspecting winning vs losing factors...');
