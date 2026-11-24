import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

console.log('Packing live SQLite ledger into proxy/data/drabyashree_ledger.db.gz ...');
const candidateSrcs = [
  'proxy/data/drabyashree_ledger.db',
  'proxy/proxy/data/drabyashree_ledger.db'
];
const src = candidateSrcs.find(p => fs.existsSync(p)) || 'proxy/data/drabyashree_ledger.db';
const destGz = 'proxy/data/drabyashree_ledger.db.gz';
const destDb = 'proxy/data/drabyashree_ledger.db';

// Copy to canonical location if different
if (path.resolve(src) !== path.resolve(destDb)) {
  fs.copyFileSync(src, destDb);
  console.log(`Copied live DB from ${src} to ${destDb}`);
}
console.log(`Live DB: ${destDb} (${(fs.statSync(destDb).size / 1024 / 1024).toFixed(2)} MB)`);

// Compress
const inStream = fs.createReadStream(destDb);
const outStream = fs.createWriteStream(destGz);
const gzip = zlib.createGzip({ level: 9 });

inStream.pipe(gzip).pipe(outStream).on('finish', () => {
  const gzStat = fs.statSync(destGz);
  console.log(`Successfully compressed to ${destGz} (${(gzStat.size / 1024 / 1024).toFixed(2)} MB)`);
});
