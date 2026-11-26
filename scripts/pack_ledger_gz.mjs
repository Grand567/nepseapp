import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { pipeline } from 'stream/promises';
import Database from 'better-sqlite3';

console.log('Packing live SQLite ledger into proxy/data/drabyashree_ledger.db.gz ...');
const candidateSrcs = [
  'proxy/data/drabyashree_ledger.db',
  'proxy/proxy/data/drabyashree_ledger.db'
];
const src = candidateSrcs.find(p => fs.existsSync(p)) || 'proxy/data/drabyashree_ledger.db';
const destGz = 'proxy/data/drabyashree_ledger.db.gz';
const destDb = 'proxy/data/drabyashree_ledger.db';
const tmpSnap = `${destDb}.pack.${process.pid}.tmp`;
const tmpGz = `${destGz}.pack.${process.pid}.tmp`;

// Copy to canonical location if different
if (path.resolve(src) !== path.resolve(destDb)) {
  fs.copyFileSync(src, destDb);
  console.log(`Copied live DB from ${src} to ${destDb}`);
}
console.log(`Live DB: ${destDb} (${(fs.statSync(destDb).size / 1024 / 1024).toFixed(2)} MB)`);

// Checkpoint WAL and take a clean consistent online SQLite backup snapshot before compressing
const liveDb = new Database(destDb, { timeout: 10000 });
try {
  liveDb.pragma('wal_checkpoint(TRUNCATE)');
  await liveDb.backup(tmpSnap);
} finally {
  liveDb.close();
}

const verifyDb = new Database(tmpSnap, { readonly: true });
try {
  const chk = verifyDb.pragma('integrity_check');
  if (!Array.isArray(chk) || chk[0]?.integrity_check !== 'ok') {
    throw new Error(`Snapshot integrity_check failed: ${JSON.stringify(chk)}`);
  }
} finally {
  verifyDb.close();
}

try {
  await pipeline(
    fs.createReadStream(tmpSnap),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(tmpGz)
  );
  fs.renameSync(tmpGz, destGz);
  const gzStat = fs.statSync(destGz);
  fs.writeFileSync(`${destDb}.gz.applied`, `${gzStat.size}:${Math.trunc(gzStat.mtimeMs || 0)}`, 'utf8');
  console.log(`Successfully compressed to ${destGz} (${(gzStat.size / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  try { if (fs.existsSync(tmpSnap)) fs.unlinkSync(tmpSnap); } catch (_) {}
  try { if (fs.existsSync(tmpGz)) fs.unlinkSync(tmpGz); } catch (_) {}
}
