// proxy/utils/cloudFloorsheetVault.mjs
/**
 * Multi-Cloud Floorsheet Archive & Streaming Vault
 * 
 * Supports 3 Cloud Providers:
 * 1. GitHub Releases Cloud Archive (Recommended - 100% Free Forever, Zero Card Needed!)
 *    - Repository: Grand567/nepseapp
 *    - Unlimited file releases, up to 2 GB per file
 *    - Public downloads require NO authentication
 *    - Uploading requires GITHUB_TOKEN (Personal Access Token)
 * 
 * 2. Firebase Cloud Storage (Google Cloud Storage)
 *    - 5 GB Free Storage
 *    - Uses drabyashree-nepse-hub-11ef9.firebasestorage.app
 * 
 * 3. Cloudflare R2 Object Storage
 *    - 10 GB Free Storage
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
import axios from 'axios';
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

// ─── GitHub Releases Configuration (100% Free Forever, No Credit Card) ───────
export function getGitHubToken() {
  // Strictly enforce environment variables; NEVER extract local developer OS credentials
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
}

export function getGitHubRepo() {
  return (process.env.GITHUB_REPO || 'Grand567/nepseapp').trim();
}

export function isGitHubConfigured() {
  return Boolean(getGitHubToken());
}

async function getOrCreateGitHubRelease(tag, year) {
  const token = getGitHubToken();
  if (!token) return null;

  const repo = getGitHubRepo();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'DrabyashreeNepseProxy/1.0'
  };

  try {
    const res = await axios.get(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers });
    if (res.data && res.data.id) return res.data;
  } catch (err) {
    if (err.response?.status !== 404) {
      console.warn(`[cloudFloorsheetVault] Warning checking GitHub release tag ${tag}:`, err.message);
    }
  }

  // Create release if it doesn't exist
  try {
    const res = await axios.post(`https://api.github.com/repos/${repo}/releases`, {
      tag_name: tag,
      target_commitish: 'main',
      name: `NEPSE Floorsheet Archive (${year})`,
      body: `Automated tick-by-tick floorsheet data vault for NEPSE trading sessions in ${year}.`,
      draft: false,
      prerelease: false
    }, { headers });
    console.log(`[cloudFloorsheetVault] 📦 Created GitHub release: ${tag} on ${repo}`);
    return res.data;
  } catch (err) {
    console.error(`[cloudFloorsheetVault] Failed to create GitHub release ${tag}:`, err.message, err.response?.data);
    return null;
  }
}

async function uploadAssetToGitHubRelease(release, fileName, bufferToUpload) {
  const token = getGitHubToken();
  const repo = getGitHubRepo();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'DrabyashreeNepseProxy/1.0'
  };

  // Check if asset already exists in release
  const existingAsset = (release.assets || []).find(a => a.name === fileName);
  if (existingAsset) {
    try {
      await axios.delete(`https://api.github.com/repos/${repo}/releases/assets/${existingAsset.id}`, { headers });
      console.log(`[cloudFloorsheetVault] Overwriting existing asset ${fileName} in GitHub release...`);
    } catch (_) {}
  }

  // Upload URL format: https://uploads.github.com/repos/:owner/:repo/releases/:id/assets{?name,label}
  const uploadUrl = release.upload_url.replace('{?name,label}', '') + `?name=${encodeURIComponent(fileName)}`;

  const uploadRes = await axios.post(uploadUrl, bufferToUpload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/gzip',
      'Content-Length': bufferToUpload.length,
      'User-Agent': 'DrabyashreeNepseProxy/1.0'
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  return uploadRes.data;
}

// ─── Firebase Storage Configuration ──────────────────────────────────────────
const FIREBASE_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'drabyashree-nepse-hub-11ef9.firebasestorage.app';
let firebaseAppInstance = null;
let firebaseBucketInstance = null;

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
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || 'drabyashree-floorsheets';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/+$/, '');

let s3ClientInstance = null;

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
  const providers = [];
  if (isR2Configured()) providers.push('R2');
  if (isGitHubConfigured()) providers.push('GITHUB');
  if (isFirebaseConfigured()) providers.push('FIREBASE');
  return providers.length > 0 ? providers.join(' + ') : 'LOCAL_ONLY';
}

/**
 * Universal Cloud Upload: Uploads daily floorsheet to GitHub Releases, Firebase, or R2
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

  const fileName = `floorsheet-${cleanDate}.json.gz`;
  const sizeKb = +(bufferToUpload.length / 1024).toFixed(1);
  const uploadResults = [];

  // 1. Upload to Cloudflare R2 (Ultra-fast Edge CDN, $0 Egress Fees)
  const r2Client = getR2Client();
  if (r2Client) {
    try {
      const objectKey = `daily_floorsheets/${fileName}`;
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: bufferToUpload,
        ContentType: 'application/gzip',
        ContentEncoding: 'gzip',
        Metadata: { tradeDate: cleanDate, uploadedAt: new Date().toISOString() }
      });
      await r2Client.send(command);
      console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to Cloudflare R2 (${sizeKb} KB) -> ${objectKey}`);
      uploadResults.push({ provider: 'R2', bucket: R2_BUCKET_NAME, key: objectKey, sizeKb });
    } catch (err) {
      console.error(`[cloudFloorsheetVault] Cloudflare R2 upload error for ${cleanDate}:`, err.message);
    }
  }

  // 2. Upload to GitHub Releases (Permanent Free Backup & Disaster Recovery)
  if (isGitHubConfigured()) {
    try {
      const year = cleanDate.slice(0, 4);
      const tag = `floorsheets-${year}`;
      const release = await getOrCreateGitHubRelease(tag, year);
      if (release) {
        const asset = await uploadAssetToGitHubRelease(release, fileName, bufferToUpload);
        if (asset) {
          console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to GitHub Release ${tag} (${sizeKb} KB)`);
          uploadResults.push({
            provider: 'GITHUB',
            releaseTag: tag,
            assetName: fileName,
            sizeKb,
            downloadUrl: asset.browser_download_url
          });
        }
      }
    } catch (err) {
      console.error(`[cloudFloorsheetVault] GitHub upload error for ${cleanDate}:`, err.message);
    }
  }

  // 3. Upload to Firebase Storage (if configured)
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const objectKey = `daily_floorsheets/${fileName}`;
      const file = fbBucket.file(objectKey);
      await file.save(bufferToUpload, {
        resumable: false,
        contentType: 'application/gzip',
        metadata: {
          contentEncoding: 'gzip',
          metadata: { tradeDate: cleanDate, uploadedAt: new Date().toISOString() }
        }
      });
      console.log(`[cloudFloorsheetVault] 🚀 Uploaded floorsheet for ${cleanDate} to Firebase Storage (${sizeKb} KB) -> ${objectKey}`);
      uploadResults.push({
        provider: 'FIREBASE',
        bucket: FIREBASE_BUCKET_NAME,
        key: objectKey,
        sizeKb
      });
    } catch (err) {
      console.error(`[cloudFloorsheetVault] Firebase Storage upload error for ${cleanDate}:`, err.message);
    }
  }

  if (uploadResults.length > 0) {
    const primary = uploadResults[0];
    return {
      success: true,
      provider: uploadResults.map(r => r.provider).join(' + '),
      primaryProvider: primary.provider,
      ...primary,
      allResults: uploadResults
    };
  }

  return { success: false, reason: 'No cloud storage provider configured. Set R2 credentials or GITHUB_TOKEN in Render.' };
}

const inFlightCloudDownloads = new Map();

function atomicWriteFileSync(filePath, data, encoding) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  try {
    if (encoding) {
      fs.writeFileSync(tmpPath, data, encoding);
    } else {
      fs.writeFileSync(tmpPath, data);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

/**
 * Universal Cloud Fetch: Checks local disk cache first, then streams from GitHub Releases, Firebase, or R2
 */
export async function fetchFloorsheetFromCloud(dateStr) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return null;

  if (inFlightCloudDownloads.has(cleanDate)) {
    return inFlightCloudDownloads.get(cleanDate);
  }

  const downloadPromise = (async () => {
    try {
      return await _fetchFloorsheetFromCloudInternal(cleanDate);
    } finally {
      inFlightCloudDownloads.delete(cleanDate);
    }
  })();

  inFlightCloudDownloads.set(cleanDate, downloadPromise);
  return downloadPromise;
}

async function _fetchFloorsheetFromCloudInternal(cleanDate) {
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

  const fileName = `floorsheet-${cleanDate}.json.gz`;
  const year = cleanDate.slice(0, 4);
  const repo = getGitHubRepo();

  // 2. Stream from Cloudflare R2 / CDN (Ultra-low latency, <30ms edge caching)
  if (R2_PUBLIC_URL) {
    try {
      const publicUrl = `${R2_PUBLIC_URL}/daily_floorsheets/${fileName}`;
      const res = await axios.get(publicUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: { 'User-Agent': 'DrabyashreeNepseProxy/1.0' }
      });
      if (res.data) {
        const gzBuffer = Buffer.from(res.data);
        atomicWriteFileSync(localGz, gzBuffer);
        const unzipped = zlib.gunzipSync(gzBuffer);
        const trades = JSON.parse(unzipped.toString('utf8'));
        if (Array.isArray(trades) && trades.length > 0) {
          atomicWriteFileSync(localJson, JSON.stringify(trades), 'utf8');
          console.log(`[cloudFloorsheetVault] ⚡ Fast-streamed ${trades.length} contracts for ${cleanDate} via Cloudflare CDN edge.`);
          return trades;
        }
      }
    } catch (_) {}
  }

  const r2Client = getR2Client();
  if (r2Client) {
    try {
      const objectKey = `daily_floorsheets/${fileName}`;
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey
      });
      const response = await r2Client.send(command);
      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        const gzBuffer = Buffer.from(byteArray);
        atomicWriteFileSync(localGz, gzBuffer);
        const unzipped = zlib.gunzipSync(gzBuffer);
        const trades = JSON.parse(unzipped.toString('utf8'));
        if (Array.isArray(trades) && trades.length > 0) {
          atomicWriteFileSync(localJson, JSON.stringify(trades), 'utf8');
          console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from Cloudflare R2.`);
          return trades;
        }
      }
    } catch (_) {}
  }

  // 3. Fallback: Stream from GitHub Releases (Public download URL - requires NO token if repo is public!)
  try {
    const downloadUrl = `https://github.com/${repo}/releases/download/floorsheets-${year}/${fileName}`;
    const res = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'DrabyashreeNepseProxy/1.0' }
    });

    if (res.data) {
      const gzBuffer = Buffer.from(res.data);
      atomicWriteFileSync(localGz, gzBuffer);
      const unzipped = zlib.gunzipSync(gzBuffer);
      const trades = JSON.parse(unzipped.toString('utf8'));
      if (Array.isArray(trades) && trades.length > 0) {
        atomicWriteFileSync(localJson, JSON.stringify(trades), 'utf8');
        console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from GitHub Releases.`);
        return trades;
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      // Release not found or other non-fatal code
    }
  }

  // 4. Fallback: Stream from Firebase Storage (if available)
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const objectKey = `daily_floorsheets/${fileName}`;
      const file = fbBucket.file(objectKey);
      const [exists] = await file.exists();
      if (exists) {
        const [gzBuffer] = await file.download();
        atomicWriteFileSync(localGz, gzBuffer);
        const unzipped = zlib.gunzipSync(gzBuffer);
        const trades = JSON.parse(unzipped.toString('utf8'));
        if (Array.isArray(trades) && trades.length > 0) {
          atomicWriteFileSync(localJson, JSON.stringify(trades), 'utf8');
          console.log(`[cloudFloorsheetVault] 📥 Streamed ${trades.length} contracts for ${cleanDate} from Firebase Storage.`);
          return trades;
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Universal Dates Listing: Lists all dates archived across GitHub Releases, Firebase, and R2
 */
export async function listAvailableCloudFloorsheetDates() {
  const dates = new Set();
  const repo = getGitHubRepo();

  // 1. Check GitHub Releases
  try {
    const token = getGitHubToken();
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'DrabyashreeNepseProxy/1.0',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await axios.get(`https://api.github.com/repos/${repo}/releases`, { headers, timeout: 10000 });
    if (Array.isArray(res.data)) {
      for (const rel of res.data) {
        if (rel.tag_name?.startsWith('floorsheet')) {
          for (const asset of (rel.assets || [])) {
            const match = asset.name?.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.json/);
            if (match && match[1]) dates.add(match[1]);
          }
        }
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.warn('[cloudFloorsheetVault] Notice listing GitHub releases:', err.message);
    }
  }

  // 2. Check Firebase Storage
  const fbBucket = getFirebaseBucket();
  if (fbBucket) {
    try {
      const [files] = await fbBucket.getFiles({ prefix: 'daily_floorsheets/floorsheet-' });
      for (const file of files) {
        const match = file.name.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.json/);
        if (match && match[1]) dates.add(match[1]);
      }
    } catch (_) {}
  }

  // 3. Check Cloudflare R2
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
    } catch (_) {}
  }

  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

/**
 * Syncs all local floorsheet files in DAILY_FLOORSHEETS_DIR to Cloud Storage (GitHub, Firebase, or R2)
 */
export async function syncLocalFloorsheetsToCloud() {
  const provider = getActiveCloudProvider();
  if (provider === 'LOCAL_ONLY') {
    return { success: false, reason: 'No cloud storage credentials found (set GITHUB_TOKEN in Render).' };
  }

  if (!fs.existsSync(DAILY_FLOORSHEETS_DIR)) {
    return { success: true, uploaded: 0, skipped: 0 };
  }

  try {
    const cloudDates = new Set(await listAvailableCloudFloorsheetDates());
    const files = fs.readdirSync(DAILY_FLOORSHEETS_DIR);
    const dateFileMap = new Map();
    for (const file of files) {
      const match = file.match(/^floorsheet-(\d{4}-\d{2}-\d{2})\.(json|json\.gz)$/);
      if (!match) continue;
      const dateStr = match[1];
      const isGz = file.endsWith('.json.gz');
      // Prefer .json.gz over uncompressed .json to avoid redundant gzip compression
      if (!dateFileMap.has(dateStr) || isGz) {
        dateFileMap.set(dateStr, path.join(DAILY_FLOORSHEETS_DIR, file));
      }
    }

    let uploadedCount = 0;
    let skippedCount = 0;

    for (const [dateStr, filePath] of dateFileMap.entries()) {
      if (cloudDates.has(dateStr)) {
        skippedCount++;
        continue;
      }

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
export const uploadDailyFloorsheetToGitHub = uploadDailyFloorsheetToCloud;
export const fetchFloorsheetFromGitHub = fetchFloorsheetFromCloud;
export const listAvailableGitHubFloorsheetDates = listAvailableCloudFloorsheetDates;
export const syncLocalFloorsheetsToGitHub = syncLocalFloorsheetsToCloud;
