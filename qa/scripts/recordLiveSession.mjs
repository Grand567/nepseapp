#!/usr/bin/env node
/**
 * ============================================================================
 * DRABYASHREE NEPSE — LIVE SESSION RECORDER (PHASE 2)
 * ============================================================================
 * Captures raw API responses from the local proxy every minute during an active
 * NEPSE trading session (Monday-Friday 11:00-15:00 Asia/Kathmandu).
 *
 * SAFETY & COMPLIANCE RULES:
 * 1. RUN ONLY ON USER COMMAND. Never runs automatically.
 * 2. Rate-limited: Default 60s (strictly >= 30s) with staggered endpoint calls
 *    to avoid hammering upstream NEPSE NOTS or local proxy.
 * 3. ZERO-SECRET RETENTION: Recursively scrubs all authorization, token,
 *    cookie, and credential fields before saving to disk.
 * 4. Stores snapshots in qa/recordings/<date>/ with timestamps and manifest.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const intervalSec = Math.max(30, parseInt(getArg('--interval', '60'), 10)); // Minimum 30s guard
const durationMins = parseInt(getArg('--duration', '240'), 10); // Default 4 hours (full session)
const proxyBase = getArg('--proxy', 'http://localhost:5000').replace(/\/$/, '');
const targetSymbols = getArg('--symbols', 'SHIVM,NABIL,HRL,UPPER,HDL,ACLBSL,MKHL,AKJCL,NICL,CBBL')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

// Current date in Asia/Kathmandu (NPT)
const nowNptStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
const defaultOutDir = path.join(PROJECT_ROOT, 'qa', 'recordings', nowNptStr);
const outputDir = path.resolve(getArg('--output', defaultOutDir));

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ── Recursive Secret / Credential Scrubber ───────────────────────────────────
const SECRET_REGEX = /(auth|token|secret|password|bearer|cookie|credential|key)/i;

function scrubSecrets(obj, depth = 0) {
  if (depth > 12 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => scrubSecrets(item, depth + 1));
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_REGEX.test(k) && typeof v === 'string') {
      clean[k] = '[REDACTED_SECURITY_SENSITIVE]';
    } else {
      clean[k] = scrubSecrets(v, depth + 1);
    }
  }
  return clean;
}

// ── HTTP Helper with Timeout and Interception ─────────────────────────────────
async function fetchSafe(endpoint) {
  try {
    const url = `${proxyBase}${endpoint}`;
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Drabyashree-LiveRecorder/1.0',
        'Accept': 'application/json'
      }
    });
    return {
      status: res.status,
      headers: {
        cacheControl: res.headers['cache-control'] || 'NONE',
        etag: res.headers['etag'] || null,
        contentType: res.headers['content-type'] || 'application/json'
      },
      data: scrubSecrets(res.data)
    };
  } catch (err) {
    return {
      status: err.response?.status || 500,
      error: err.message,
      data: null
    };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Manifest Management ───────────────────────────────────────────────────────
const manifestPath = path.join(outputDir, 'manifest.json');
let manifest = {
  recorderVersion: '1.0.0',
  sessionDateNpt: nowNptStr,
  startedAtUtc: new Date().toISOString(),
  intervalSeconds: intervalSec,
  targetDurationMinutes: durationMins,
  targetSymbols,
  secretsScrubbed: true,
  status: 'RECORDING',
  ticksCaptured: 0,
  tickFiles: []
};

if (fs.existsSync(manifestPath)) {
  try {
    manifest = { ...manifest, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  } catch (_) {}
}

function saveManifest() {
  manifest.updatedAtUtc = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

// ── Main Recording Loop ───────────────────────────────────────────────────────
console.log('=================================================================');
console.log('🔴 DRABYASHREE NEPSE — LIVE SESSION RECORDER INITIALIZED');
console.log('=================================================================');
console.log(`• NPT Date:            ${nowNptStr}`);
console.log(`• Polling Interval:    ${intervalSec} seconds (Rate-limit safe)`);
console.log(`• Target Duration:     ${durationMins} minutes`);
console.log(`• Proxy Server:        ${proxyBase}`);
console.log(`• Target Stocks:       ${targetSymbols.join(', ')}`);
console.log(`• Output Directory:    ${outputDir}`);
console.log(`• Zero Secrets Policy: STRICT ENFORCEMENT (Auth/Token/Cookie scrubbed)`);
console.log('=================================================================\n');

let tickIndex = manifest.ticksCaptured || 0;
const maxTicks = Math.ceil((durationMins * 60) / intervalSec);
let isShuttingDown = false;

async function captureTick() {
  const tickTime = new Date();
  const nptTimeStr = tickTime.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kathmandu',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const fileTimestamp = nptTimeStr.replace(/:/g, '-');
  const tickFileName = `tick_${fileTimestamp}.json`;
  const tickFilePath = path.join(outputDir, tickFileName);

  console.log(`[${nptTimeStr} NPT] Capturing Tick #${tickIndex + 1}...`);

  // 1. Fetch Indices (NEPSE, Sub-indices)
  const indicesRes = await fetchSafe('/api/indices');
  await delay(200);

  // 2. Fetch Market Summary (Gainers, Losers, Market Turnover, Total Trades)
  const summaryRes = await fetchSafe('/api/market-summary');
  await delay(200);

  // 3. Fetch Today Prices (Full universe snapshot)
  const pricesRes = await fetchSafe('/api/today-prices');
  await delay(200);

  // 4. Fetch Market Depth for Spot Symbols
  const marketDepthMap = {};
  for (const sym of targetSymbols.slice(0, 5)) { // Top 5 spot checks per tick to remain lightweight
    const depthRes = await fetchSafe(`/api/nepse/market-depth/${sym}`);
    if (depthRes.data) {
      marketDepthMap[sym] = depthRes.data;
    }
    await delay(150);
  }

  // 5. Fetch Floorsheet summary
  const floorsheetRes = await fetchSafe('/api/floorsheet');

  const tickPayload = {
    tickIndex: tickIndex + 1,
    capturedAtUtc: tickTime.toISOString(),
    capturedAtNpt: nptTimeStr,
    sessionDate: nowNptStr,
    data: {
      indices: indicesRes.data,
      marketSummary: summaryRes.data,
      todayPrices: pricesRes.data,
      marketDepth: marketDepthMap,
      floorsheet: floorsheetRes.data
    },
    meta: {
      headers: {
        indices: indicesRes.headers,
        summary: summaryRes.headers,
        prices: pricesRes.headers
      }
    }
  };

  fs.writeFileSync(tickFilePath, JSON.stringify(tickPayload, null, 2), 'utf8');

  tickIndex++;
  manifest.ticksCaptured = tickIndex;
  manifest.lastTickTimeUtc = tickTime.toISOString();
  manifest.lastTickNpt = nptTimeStr;
  if (!manifest.tickFiles.includes(tickFileName)) {
    manifest.tickFiles.push(tickFileName);
  }
  saveManifest();

  console.log(`  ✓ Tick #${tickIndex} saved to ${tickFileName} (${Object.keys(marketDepthMap).length} depths)`);
}

async function startRecorder() {
  saveManifest();

  while (tickIndex < maxTicks && !isShuttingDown) {
    try {
      await captureTick();
    } catch (err) {
      console.error(`  ✗ Error capturing tick #${tickIndex + 1}:`, err.message);
    }

    if (tickIndex >= maxTicks || isShuttingDown) break;

    // Wait for the next tick interval
    await delay(intervalSec * 1000);
  }

  manifest.status = 'COMPLETED';
  manifest.completedAtUtc = new Date().toISOString();
  saveManifest();
  console.log('\n[recorder] Session recording completed cleanly.');
}

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\n[recorder] Graceful shutdown requested (SIGINT)...');
  isShuttingDown = true;
  manifest.status = 'INTERRUPTED_BY_USER';
  manifest.completedAtUtc = new Date().toISOString();
  saveManifest();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[recorder] Graceful shutdown requested (SIGTERM)...');
  isShuttingDown = true;
  manifest.status = 'TERMINATED';
  manifest.completedAtUtc = new Date().toISOString();
  saveManifest();
  process.exit(0);
});

startRecorder();
