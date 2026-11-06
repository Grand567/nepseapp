// scripts/uploadHistoricalToR2.mjs
// Batch Upload All Historical NEPSE Floorsheets & Subfiles to Cloudflare R2

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment from proxy/.env
function loadEnv() {
  const envPath = path.join(rootDir, 'proxy', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const l of lines) {
      const line = l.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnv();

const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.R2_BUCKET_NAME || 'drabyashree-floorsheets';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('❌ Cloudflare R2 credentials missing in proxy/.env');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey }
});

async function listR2Objects(prefix = '') {
  const keys = new Set();
  let continuationToken = null;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    if (res.Contents) {
      res.Contents.forEach(c => keys.add(c.Key));
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function uploadFile(key, buffer, contentType = 'application/gzip', metadata = {}) {
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentEncoding: contentType === 'application/gzip' ? 'gzip' : undefined,
    Metadata: metadata
  }));
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('    CLOUDFLARE R2: BATCH HISTORICAL FLOORSHEET & SUBFILE UPLOADER     ');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`Bucket: ${bucketName}`);
  console.log(`Endpoint: https://${accountId}.r2.cloudflarestorage.com\n`);

  console.log('1. Querying current objects in Cloudflare R2...');
  const existingKeys = await listR2Objects();
  console.log(`   Found ${existingKeys.size} object(s) already in bucket.`);

  // ─── A. Upload Daily Floorsheets ──────────────────────────────────────────
  const floorsheetsDir = path.join(rootDir, 'proxy', 'data', 'daily_floorsheets');
  if (fs.existsSync(floorsheetsDir)) {
    const allFiles = fs.readdirSync(floorsheetsDir);
    const dateFileMap = new Map();

    for (const file of allFiles) {
      const match = file.match(/^floorsheet-(\d{4}-\d{2}-\d{2})\.(json|json\.gz)$/);
      if (!match) continue;
      const dateStr = match[1];
      const isGz = file.endsWith('.gz');
      // Prefer compressed .gz to avoid re-compressing
      if (!dateFileMap.has(dateStr) || isGz) {
        dateFileMap.set(dateStr, path.join(floorsheetsDir, file));
      }
    }

    const sortedDates = Array.from(dateFileMap.keys()).sort().reverse();
    console.log(`\n2. Found ${sortedDates.length} historical trading sessions locally.`);

    let uploadedFloorsheets = 0;
    let skippedFloorsheets = 0;

    for (let i = 0; i < sortedDates.length; i++) {
      const dateStr = sortedDates[i];
      const filePath = dateFileMap.get(dateStr);
      const targetKey = `daily_floorsheets/floorsheet-${dateStr}.json.gz`;

      if (existingKeys.has(targetKey)) {
        skippedFloorsheets++;
        continue;
      }

      const raw = fs.readFileSync(filePath);
      const gzBuffer = filePath.endsWith('.gz') ? raw : zlib.gzipSync(raw);
      const sizeKb = +(gzBuffer.length / 1024).toFixed(1);

      process.stdout.write(`   [${i + 1}/${sortedDates.length}] Uploading ${dateStr} (${sizeKb} KB)... `);
      await uploadFile(targetKey, gzBuffer, 'application/gzip', {
        tradeDate: dateStr,
        uploadedAt: new Date().toISOString()
      });
      existingKeys.add(targetKey);
      uploadedFloorsheets++;
      console.log('✅ Done');
    }

    console.log(`\n   Floorsheets Summary: ${uploadedFloorsheets} uploaded, ${skippedFloorsheets} already present.`);
  }

  // ─── B. Upload Pre-Compiled Sub-Files & Analytics ─────────────────────────
  console.log('\n3. Uploading pre-compiled Sub-Files & Static Analytics to R2...');
  const subfilesDir = path.join(rootDir, 'proxy', 'data', 'subfiles');
  if (fs.existsSync(subfilesDir)) {
    const subfiles = fs.readdirSync(subfilesDir);
    for (const sf of subfiles) {
      if (!sf.endsWith('.gz')) continue;
      const sfPath = path.join(subfilesDir, sf);
      const targetKey = `subfiles/${sf}`;
      const gzBuffer = fs.readFileSync(sfPath);
      const sizeKb = +(gzBuffer.length / 1024).toFixed(1);
      process.stdout.write(`   Uploading ${targetKey} (${sizeKb} KB)... `);
      await uploadFile(targetKey, gzBuffer, 'application/gzip');
      console.log('✅ Done');
    }
  }

  // Upload today_static_analytics.json.gz
  const todayAnalyticsGz = path.join(rootDir, 'proxy', 'data', 'today_static_analytics.json.gz');
  if (fs.existsSync(todayAnalyticsGz)) {
    const targetKey = 'analytics/today_static_analytics.json.gz';
    const gzBuffer = fs.readFileSync(todayAnalyticsGz);
    const sizeKb = +(gzBuffer.length / 1024).toFixed(1);
    process.stdout.write(`   Uploading ${targetKey} (${sizeKb} KB)... `);
    await uploadFile(targetKey, gzBuffer, 'application/gzip');
    console.log('✅ Done');
  }

  // Upload latest broker matrix
  const brokerMatrixPath = path.join(rootDir, 'proxy', 'data', 'broker_matrix_latest.json');
  if (fs.existsSync(brokerMatrixPath)) {
    const targetKey = 'matrices/broker_matrix_latest.json.gz';
    const raw = fs.readFileSync(brokerMatrixPath);
    const gzBuffer = zlib.gzipSync(raw);
    const sizeKb = +(gzBuffer.length / 1024).toFixed(1);
    process.stdout.write(`   Uploading ${targetKey} (${sizeKb} KB)... `);
    await uploadFile(targetKey, gzBuffer, 'application/gzip');
    console.log('✅ Done');
  }

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(' 🎉 COMPLETE: All historical data and sub-files are live in R2!');
  console.log('══════════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Fatal batch upload error:', err);
  process.exit(1);
});
