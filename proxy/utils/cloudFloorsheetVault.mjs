// proxy/utils/cloudFloorsheetVault.mjs
/**
 * Dual-Cloud Floorsheet Archive & Streaming Vault
 * 
 * Supports:
 * 1. Firebase Cloud Storage (Google Cloud Storage via Firebase Spark Plan)
 *    - 5 GB Free Cloud Storage Forever ($0.00)
 *    - ZERO Credit Card or Billing Details Required!
 *    - Uses drabyashree-nepse-hub-11ef9.firebasestorage.app
 * 
 * 2. Cloudflare R2 Object Storage
 *    - 10 GB Free Storage ($0.00) with zero egress fees
 *    - Requires international payment method on file
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
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { DAILY_FLOORSHEETS_DIR } from './dailyFloorsheetCollector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Firebase Storage Configuration (No Credit Card Required) ────────────────
const FIREBASE_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'drabyashree-nepse-hub-11ef9.firebasestorage.app';
let firebaseAppInstance = null;
let firebaseBucketInstance = null;
let firebaseLoggedNotice = false;

function resolveFirebaseCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    try {
      return JSON.parse(raw);
    } catch (_) {
      try {
        return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      } catch (_) {}
    }
  }

  const candidatePaths = [
    path.join(__dirname, '..', 'firebase-service-account.json'),
    path.join(process.cwd(), 'proxy', 'firebase-service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
    path.join(__dirname, 'firebase-service-account.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (_) {}
    }
  }

  return null;
}

export function getFirebaseBucket() {
  if (firebaseBucketInstance) return firebaseBucketInstance;

  const creds = resolveFirebaseCredentials();
  if (creds && creds.private_key) {
    try {
      if (getApps().length === 0) {
        firebaseAppInstance = initializeApp({
          credential: cert(creds),
          projectId: creds.project_id || 'drabyashree-nepse-hub-11ef9',
          storageBucket: FIREBASE_BUCKET_NAME
        });
      } else {
        firebaseAppInstance = getApps()[0];
      }
      firebaseBucketInstance = getStorage(firebaseAppInstance).bucket(FIREBASE_BUCKET_NAME);
      console.log(`[cloudFloorsheetVault] ✅ Connected to Firebase Cloud Storage: ${FIREBASE_BUCKET_NAME}`);
      return firebaseBucketInstance;
    } catch (err) {
      console.warn('[cloudFloorsheetVault] Firebase Storage init notice:', err.message);
    }
  }

  return null;
}

export function isFirebaseConfigured() {
  return Boolean(getFirebaseBucket());
}

// ─── Cloudflare R2 Configuration ─────────────────────────────────────────────
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'drabyashree-floorsheets';

let s3ClientInstance = null;
let r2LoggedWarning = false;

export function isR2Configured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

export function getR2Client() {
  if (!isR2Configured()) {
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

export function getActiveCloudProvider() {
  if (isFirebaseConfigured()) return 'FIREBASE';
  if (isR2Configured()) return 'R2';
  return 'LOCAL_ONLY';
}

/**
 * Universal Cloud Upload: Uploads daily floorsheet to Firebase Storage or Cloudflare R2
 */
export async function uploadDailyFloorsheetToCloud(dateStr, contentOrPath = null) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return { success: false, reason: 'Invalid trade date' };

  let bufferToUpload = null;

  if (typeof contentOrPath === 'string' && fs.existsSync(contentOrPath)) {
    const raw = fs.readFileSync(contentOrPath);
    bufferToUpload = contentOrPath.endsWith('.gz') ? raw : zlib.gzipSync(raw);
  } else if (Buffer.isBuffer(contentOrPath)) {
    if (contentOrPath.length >= 2 && contentOrPath[0] === 0x1f && contentOrPath[1] === 0x8b) {
      bufferToUpload = contentOrPath;
    } else {
      bufferToUpload = zlib.gzipSync(contentOrPath);
    }
  } else if (Array.isArray(contentOrPath) || (typeof contentOrPath === 'object' && contentOrPath !== null)) {
    bufferToUpload = zlib.gzipSync(Buffer.from(JSON.stringify(contentOrPath), 'utf8'));
  } else if (typeof contentOrPath === 'string' && contentOrPath.length > 0) {
    bufferToUpload = zlib.gzipSync(Buffer.from(contentOrPath, 'utf8'));
  } else {
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
  const sizeKb = +(bufferToUpload.length / 1024).toFixed(1);

  // 1. Try Firebase Storage first (No-Card Provider)
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const file = fbBucket.file(objectKey);
      await file.save(bufferToUpload, {
        resumable: false,
        contentType: 'application/gzip',
        metadata: {
          contentEncoding: 'gzip',
          metadata: {
            tradeDate: cleanDate,
            uploadedAt: new Date().toISOString()
          }
        }
      });
      console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to Firebase Storage (${sizeKb} KB) -> ${objectKey}`);
      return {
        success: true,
        provider: 'FIREBASE',
        bucket: FIREBASE_BUCKET_NAME,
        key: objectKey,
        sizeKb
      };
    } catch (err) {
      console.error(`[cloudFloorsheetVault] Firebase Storage upload error for ${cleanDate}:`, err.message);
    }
  }

  // 2. Try Cloudflare R2
  const r2Client = getR2Client();
  if (r2Client) {
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
      await r2Client.send(command);
      console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to Cloudflare R2 (${sizeKb} KB) -> ${objectKey}`);
      return {
        success: true,
        provider: 'R2',
        bucket: R2_BUCKET_NAME,
        key: objectKey,
        sizeKb
      };
    } catch (err) {
      console.error(`[cloudFloorsheetVault] Cloudflare R2 upload error for ${cleanDate}:`, err.message);
    }
  }

  return { success: false, reason: 'No cloud storage provider configured (Firebase or R2 credentials missing)' };
}

/**
 * Universal Cloud Fetch: Checks local disk cache first, then streams from Firebase Storage or R2
 */
export async function fetchFloorsheetFromCloud(dateStr) {
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

  const objectKey = `daily_floorsheets/floorsheet-${cleanDate}.json.gz`;

  // 2. Stream from Firebase Storage (if available)
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const file = fbBucket.file(objectKey);
      const [exists] = await file.exists();
      if (exists) {
        const [gzBuffer] = await file.download();
        try { fs.writeFileSync(localGz, gzBuffer); } catch (_) {}
        const unzipped = zlib.gunzipSync(gzBuffer);
        const trades = JSON.parse(unzipped.toString('utf8'));
        if (Array.isArray(trades) && trades.length > 0) {
          try { fs.writeFileSync(localJson, JSON.stringify(trades), 'utf8'); } catch (_) {}
          console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from Firebase Storage.`);
          return trades;
        }
      }
    } catch (fbErr) {
      console.warn(`[cloudFloorsheetVault] Firebase Storage fetch warning for ${cleanDate}:`, fbErr.message);
    }
  }

  // 3. Stream from Cloudflare R2 (if available)
  const r2Client = getR2Client();
  if (r2Client) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey
      });
      const response = await r2Client.send(command);
      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        const gzBuffer = Buffer.from(byteArray);
        try { fs.writeFileSync(localGz, gzBuffer); } catch (_) {}
        const unzipped = zlib.gunzipSync(gzBuffer);
        const trades = JSON.parse(unzipped.toString('utf8'));
        if (Array.isArray(trades) && trades.length > 0) {
          try { fs.writeFileSync(localJson, JSON.stringify(trades), 'utf8'); } catch (_) {}
          console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from Cloudflare R2.`);
          return trades;
        }
      }
    } catch (r2Err) {
      if (r2Err.name !== 'NoSuchKey' && r2Err.$metadata?.httpStatusCode !== 404) {
        console.warn(`[cloudFloorsheetVault] R2 fetch warning for ${cleanDate}:`, r2Err.message);
      }
    }
  }

  return null;
}

/**
 * Universal Dates Listing: Lists all dates archived across Firebase Storage and R2
 */
export async function listAvailableCloudFloorsheetDates() {
  const dates = new Set();

  // 1. Check Firebase Storage
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const [files] = await fbBucket.getFiles({ prefix: 'daily_floorsheets/floorsheet-' });
      for (const file of files) {
        const match = file.name.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.json/);
        if (match && match[1]) dates.add(match[1]);
      }
    } catch (err) {
      console.warn('[cloudFloorsheetVault] Failed to list Firebase Storage dates:', err.message);
    }
  }

  // 2. Check Cloudflare R2
  const r2Client = getR2Client();
  if (r2Client) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: 'daily_floorsheets/floorsheet-'
      });
      const response = await r2Client.send(command);
      if (response.Contents && Array.isArray(response.Contents)) {
        for (const obj of response.Contents) {
          const match = obj.Key?.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.json/);
          if (match && match[1]) dates.add(match[1]);
        }
      }
    } catch (err) {
      console.warn('[cloudFloorsheetVault] Failed to list R2 dates:', err.message);
    }
  }

  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

/**
 * Syncs any local floorsheet files in DAILY_FLOORSHEETS_DIR to Cloud Storage (Firebase or R2)
 */
export async function syncLocalFloorsheetsToCloud() {
  const provider = getActiveCloudProvider();
  if (provider === 'LOCAL_ONLY') {
    return { success: false, reason: 'No cloud storage credentials found (Firebase or R2)' };
  }

  if (!fs.existsSync(DAILY_FLOORSHEETS_DIR)) {
    return { success: true, uploaded: 0, skipped: 0 };
  }

  try {
    const cloudDates = new Set(await listAvailableCloudFloorsheetDates());
    const files = fs.readdirSync(DAILY_FLOORSHEETS_DIR);
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const match = file.match(/^floorsheet-(\d{4}-\d{2}-\d{2})\.(json|json\.gz)$/);
      if (!match) continue;
      const dateStr = match[1];

      if (cloudDates.has(dateStr)) {
        skippedCount++;
        continue;
      }

      const filePath = path.join(DAILY_FLOORSHEETS_DIR, file);
      const res = await uploadDailyFloorsheetToCloud(dateStr, filePath);
      if (res.success) {
        uploadedCount++;
        cloudDates.add(dateStr);
      }
    }

    console.log(`[cloudFloorsheetVault] Sync complete (${provider}): ${uploadedCount} uploaded, ${skippedCount} already in cloud.`);
    return { success: true, provider, uploaded: uploadedCount, skipped: skippedCount };
  } catch (err) {
    console.error('[cloudFloorsheetVault] Sync error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Backwards-Compatible Aliases ────────────────────────────────────────────
export const uploadDailyFloorsheetToR2 = uploadDailyFloorsheetToCloud;
export const fetchFloorsheetFromR2 = fetchFloorsheetFromCloud;
export const listAvailableR2FloorsheetDates = listAvailableCloudFloorsheetDates;
export const syncLocalFloorsheetsToR2 = syncLocalFloorsheetsToCloud;
