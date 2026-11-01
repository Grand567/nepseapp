// proxy/utils/cloudFloorsheetVault.mjs
/**
 * Cloudflare R2 Cloud Floorsheet Archive & Streaming Vault
 * 
 * Free Tier Guarantees:
 * - 10 GB Permanent Object Storage ($0.00/month)
 * - Zero Egress Fees ($0.00 bandwidth charges worldwide)
 * - 1,000,000 Class A operations (writes) / month
 * - 10,000,000 Class B operations (reads) / month
 * 
 * Architecture:
 * - Compressed tick-by-tick floorsheets stored as:
 *     daily_floorsheets/floorsheet-YYYY-MM-DD.json.gz (~1.2 - 2.5 MB/day)
 * - Render free tier stays ultra-light (< 120 MB RAM) by streaming on-demand.
 * - Local disk cache in proxy/data/daily_floorsheets/ for hot repeat requests.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { DAILY_FLOORSHEETS_DIR } from './dailyFloorsheetCollector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cloudflare R2 Credentials & Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'drabyashree-floorsheets';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

let s3ClientInstance = null;
let r2LoggedWarning = false;

/**
 * Returns true if Cloudflare R2 credentials are fully configured
 */
export function isR2Configured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Lazy singleton initialization of S3Client targeting Cloudflare R2 endpoint
 */
export function getR2Client() {
  if (!isR2Configured()) {
    if (!r2LoggedWarning) {
      console.log('[cloudFloorsheetVault] ℹ️ Cloudflare R2 credentials not configured. Operating in local storage mode.');
      r2LoggedWarning = true;
    }
    return null;
  }

  if (!s3ClientInstance) {
    const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
    console.log(`[cloudFloorsheetVault] ✅ Connected to Cloudflare R2 bucket: ${R2_BUCKET_NAME}`);
  }

  return s3ClientInstance;
}

/**
 * Uploads a daily floorsheet to Cloudflare R2 bucket as a compressed .json.gz file.
 * 
 * @param {string} dateStr - Trade session date (YYYY-MM-DD)
 * @param {string|Buffer|Array|object} [contentOrPath] - File path, raw Buffer, or JS object array
 * @returns {Promise<{success: boolean, bucket?: string, key?: string, sizeKb?: number, error?: string, reason?: string}>}
 */
export async function uploadDailyFloorsheetToR2(dateStr, contentOrPath = null) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return { success: false, reason: 'Invalid trade date' };

  const client = getR2Client();
  if (!client) {
    return { success: false, reason: 'Cloudflare R2 not configured' };
  }

  let bufferToUpload = null;

  if (typeof contentOrPath === 'string' && fs.existsSync(contentOrPath)) {
    const raw = fs.readFileSync(contentOrPath);
    if (contentOrPath.endsWith('.gz')) {
      bufferToUpload = raw;
    } else {
      bufferToUpload = zlib.gzipSync(raw);
    }
  } else if (Buffer.isBuffer(contentOrPath)) {
    // Check gzip magic bytes (0x1f, 0x8b)
    if (contentOrPath.length >= 2 && contentOrPath[0] === 0x1f && contentOrPath[1] === 0x8b) {
      bufferToUpload = contentOrPath;
    } else {
      bufferToUpload = zlib.gzipSync(contentOrPath);
    }
  } else if (Array.isArray(contentOrPath) || (typeof contentOrPath === 'object' && contentOrPath !== null)) {
    const jsonStr = JSON.stringify(contentOrPath);
    bufferToUpload = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  } else if (typeof contentOrPath === 'string' && contentOrPath.length > 0) {
    bufferToUpload = zlib.gzipSync(Buffer.from(contentOrPath, 'utf8'));
  } else {
    // Look for local file in DAILY_FLOORSHEETS_DIR
    const localGz = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json.gz`);
    const localJson = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json`);
    if (fs.existsSync(localGz)) {
      bufferToUpload = fs.readFileSync(localGz);
    } else if (fs.existsSync(localJson)) {
      bufferToUpload = zlib.gzipSync(fs.readFileSync(localJson));
    } else {
      return { success: false, reason: `No local floorsheet file found for date ${cleanDate}` };
    }
  }

  if (!bufferToUpload || bufferToUpload.length === 0) {
    return { success: false, reason: `Empty payload for date ${cleanDate}` };
  }

  const objectKey = `daily_floorsheets/floorsheet-${cleanDate}.json.gz`;

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Body: bufferToUpload,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
      Metadata: {
        tradeDate: cleanDate,
        uploadedAt: new Date().toISOString()
      }
    });

    await client.send(command);
    const sizeKb = +(bufferToUpload.length / 1024).toFixed(1);
    console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to Cloudflare R2 (${sizeKb} KB) -> ${objectKey}`);
    return {
      success: true,
      bucket: R2_BUCKET_NAME,
      key: objectKey,
      sizeKb
    };
  } catch (err) {
    console.error(`[cloudFloorsheetVault] ❌ Upload failed for ${cleanDate}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches a floorsheet for dateStr.
 * 1. Checks local filesystem cache (proxy/data/daily_floorsheets/).
 * 2. If not found locally, streams from Cloudflare R2 bucket.
 * 3. Automatically saves to local disk cache for instant subsequent hits.
 * 
 * @param {string} dateStr - Target trade date (YYYY-MM-DD)
 * @returns {Promise<Array<object>|null>} Array of contract objects or null
 */
export async function fetchFloorsheetFromR2(dateStr) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return null;

  // 1. Check local cache
  const localGz = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json.gz`);
  const localJson = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json`);

  if (fs.existsSync(localJson)) {
    try {
      const data = JSON.parse(fs.readFileSync(localJson, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }
  if (fs.existsSync(localGz)) {
    try {
      const decompressed = zlib.gunzipSync(fs.readFileSync(localGz));
      const data = JSON.parse(decompressed.toString('utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }

  // 2. Query Cloudflare R2
  const client = getR2Client();
  if (!client) return null;

  const objectKey = `daily_floorsheets/floorsheet-${cleanDate}.json.gz`;

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey
    });

    const response = await client.send(command);
    if (!response.Body) return null;

    const byteArray = await response.Body.transformToByteArray();
    const gzBuffer = Buffer.from(byteArray);

    // Save to local cache so future requests don't need network
    try {
      fs.writeFileSync(localGz, gzBuffer);
    } catch (_) {}

    const unzipped = zlib.gunzipSync(gzBuffer);
    const trades = JSON.parse(unzipped.toString('utf8'));

    if (Array.isArray(trades) && trades.length > 0) {
      try {
        fs.writeFileSync(localJson, JSON.stringify(trades), 'utf8');
      } catch (_) {}
      console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from Cloudflare R2.`);
      return trades;
    }
  } catch (err) {
    if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
      console.warn(`[cloudFloorsheetVault] Warning fetching ${cleanDate} from R2:`, err.message);
    }
  }

  return null;
}

/**
 * Lists all trade dates archived in Cloudflare R2
 * @returns {Promise<string[]>} Array of 'YYYY-MM-DD' dates in descending order
 */
export async function listAvailableR2FloorsheetDates() {
  const client = getR2Client();
  if (!client) return [];

  try {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: 'daily_floorsheets/floorsheet-'
    });

    const response = await client.send(command);
    if (!response.Contents || !Array.isArray(response.Contents)) return [];

    const dates = [];
    for (const obj of response.Contents) {
      const match = obj.Key?.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.json/);
      if (match && match[1]) {
        dates.push(match[1]);
      }
    }

    return Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a));
  } catch (err) {
    console.warn('[cloudFloorsheetVault] Failed to list R2 dates:', err.message);
    return [];
  }
}

/**
 * Syncs any local floorsheet files in DAILY_FLOORSHEETS_DIR to Cloudflare R2 if not yet uploaded.
 * Ideal for manual or background archiving of existing history.
 */
export async function syncLocalFloorsheetsToR2() {
  if (!isR2Configured()) {
    return { success: false, reason: 'Cloudflare R2 not configured' };
  }

  if (!fs.existsSync(DAILY_FLOORSHEETS_DIR)) {
    return { success: true, uploaded: 0, skipped: 0 };
  }

  try {
    const r2Dates = new Set(await listAvailableR2FloorsheetDates());
    const files = fs.readdirSync(DAILY_FLOORSHEETS_DIR);
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const match = file.match(/^floorsheet-(\d{4}-\d{2}-\d{2})\.(json|json\.gz)$/);
      if (!match) continue;
      const dateStr = match[1];

      if (r2Dates.has(dateStr)) {
        skippedCount++;
        continue;
      }

      const filePath = path.join(DAILY_FLOORSHEETS_DIR, file);
      const res = await uploadDailyFloorsheetToR2(dateStr, filePath);
      if (res.success) {
        uploadedCount++;
        r2Dates.add(dateStr);
      }
    }

    console.log(`[cloudFloorsheetVault] Sync complete: ${uploadedCount} uploaded, ${skippedCount} already in R2.`);
    return { success: true, uploaded: uploadedCount, skipped: skippedCount };
  } catch (err) {
    console.error('[cloudFloorsheetVault] Sync error:', err.message);
    return { success: false, error: err.message };
  }
}
