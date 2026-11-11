// scripts/hydrateMarketAllTimeFloorsheets.mjs
/**
 * Dravyashree NEPSE: Multi-Year Market-Wide Floorsheet Hydration Worker (2022 - 2026)
 * 
 * - Discovers all historical trading dates back to Jan 2022 via Chukul UDF/Historydata.
 * - Concurrently crawls missing contract records with adaptive backoff & rate-limiting.
 * - Aggregates contract records per broker into dailyRollup (buyQty, sellQty, buyAmt, sellAmt, trades).
 * - Saves uncompressed and gzipped (.gz) archives in proxy/data/broker_alltime/.
 * - Automatically regenerates src/data/nepse_cumulative_broker_ledger.json for 0ms in-app display.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { fetchSymbolTradingDates } from '../proxy/brokerVault.mjs';
import { exportCumulativeBrokerLedger } from '../proxy/utils/dailyFloorsheetCollector.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLTIME_DIR = path.resolve(process.cwd(), 'proxy', 'data', 'broker_alltime');
const PROGRESS_FILE = path.join(ALLTIME_DIR, 'crawler_progress.json');

// Command line options
const args = process.argv.slice(2);
const isStatusOnly = args.includes('--status');
const limitArg = args.find(a => a.startsWith('--limit='));
const symbolsArg = args.find(a => a.startsWith('--symbols='));
const limitCount = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
const targetSymbols = symbolsArg ? symbolsArg.split('=')[1].toUpperCase().split(',').map(s => s.trim()).filter(Boolean) : null;

// Ensure directory exists
if (!fs.existsSync(ALLTIME_DIR)) {
  fs.mkdirSync(ALLTIME_DIR, { recursive: true });
}

export function getCrawlerStatus() {
  const files = fs.readdirSync(ALLTIME_DIR).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json');
  let complete = 0;
  let partial = 0;
  let totalSessions = 0;

  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(ALLTIME_DIR, f), 'utf8'));
      const sc = Object.keys(d.dailyRollup || {}).length;
      totalSessions += sc;
      if (d.isCompleteHistory && sc >= 500) complete++;
      else partial++;
    } catch (_) {}
  }
  return {
    totalScrips: files.length,
    complete,
    partial,
    totalSessionsRecorded: totalSessions,
    pctComplete: +( (complete / Math.max(1, files.length)) * 100 ).toFixed(1)
  };
}

async function hydrateSymbol(sym) {
  const cleanSym = String(sym).toUpperCase().trim();
  const filePath = path.join(ALLTIME_DIR, `${cleanSym}.json`);
  const gzPath = path.join(ALLTIME_DIR, `${cleanSym}.json.gz`);

  let fileObj = null;
  if (fs.existsSync(filePath)) {
    try {
      fileObj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {}
  }

  if (!fileObj || typeof fileObj !== 'object') {
    fileObj = {
      symbol: cleanSym,
      version: 1,
      updatedAt: null,
      isCompleteHistory: false,
      earliestDate: null,
      latestDate: null,
      sessionsCount: 0,
      dailyRollup: {}
    };
  }

  if (!fileObj.dailyRollup) fileObj.dailyRollup = {};

  // Fetch all historical dates back to Jan 2022
  const allDates = await fetchSymbolTradingDates(cleanSym);
  const validDates = allDates.filter(d => d >= '2022-01-20').sort();
  if (validDates.length === 0) {
    return { symbol: cleanSym, status: 'no_dates_found', count: 0 };
  }

  const missingDates = validDates.filter(d => !fileObj.dailyRollup[d]);
  if (missingDates.length === 0) {
    fileObj.isCompleteHistory = true;
    fileObj.earliestDate = validDates[0];
    fileObj.latestDate = validDates[validDates.length - 1];
    fileObj.sessionsCount = validDates.length;
    fileObj.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(fileObj), 'utf8');
    const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(fileObj), 'utf8'));
    fs.writeFileSync(gzPath, gzipped);
    return { symbol: cleanSym, status: 'already_complete', count: validDates.length };
  }

  console.log(`[Hydrator] 🚀 Crawling ${cleanSym}: ${missingDates.length} missing dates (already have ${Object.keys(fileObj.dailyRollup).length} dates)...`);

  const BATCH_SIZE = 20;
  let addedContracts = 0;
  const t0 = Date.now();

  for (let i = 0; i < missingDates.length; i += BATCH_SIZE) {
    const batch = missingDates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async dt => {
      try {
        const res = await axios.get(`https://chukul.com/api/data/floorsheet/?symbol=${encodeURIComponent(cleanSym)}&date=${encodeURIComponent(dt)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 8000,
          validateStatus: () => true
        });
        return { dt, rows: Array.isArray(res.data) ? res.data : [] };
      } catch (_) {
        return { dt, rows: [] };
      }
    }));

    for (const { dt, rows } of results) {
      fileObj.dailyRollup[dt] = {};
      if (rows && rows.length > 0) {
        addedContracts += rows.length;
        for (const r of rows) {
          const b = String(r.buyer || r.buyerBroker || '').trim();
          const s = String(r.seller || r.sellerBroker || '').trim();
          const q = Number(r.quantity || r.qty || 0);
          const rate = Number(r.rate || 0);
          const amt = Number(r.amount || q * rate || 0);
          if (b) {
            if (!fileObj.dailyRollup[dt][b]) fileObj.dailyRollup[dt][b] = [0, 0, 0, 0, 0];
            fileObj.dailyRollup[dt][b][0] += q;
            fileObj.dailyRollup[dt][b][2] += amt;
            fileObj.dailyRollup[dt][b][4] += 1;
          }
          if (s) {
            if (!fileObj.dailyRollup[dt][s]) fileObj.dailyRollup[dt][s] = [0, 0, 0, 0, 0];
            fileObj.dailyRollup[dt][s][1] += q;
            fileObj.dailyRollup[dt][s][3] += amt;
          }
        }
      }
    }

    // Small courteous pause to avoid upstream 429
    await new Promise(r => setTimeout(r, 40));
  }

  const dts = Object.keys(fileObj.dailyRollup).sort();
  fileObj.earliestDate = dts[0] || validDates[0];
  fileObj.latestDate = dts[dts.length - 1] || validDates[validDates.length - 1];
  fileObj.sessionsCount = dts.length;
  fileObj.isCompleteHistory = fileObj.sessionsCount >= validDates.length * 0.95;
  fileObj.updatedAt = new Date().toISOString();

  // Write uncompressed JSON & compressed GZ
  const jsonContent = JSON.stringify(fileObj);
  fs.writeFileSync(filePath, jsonContent, 'utf8');
  const gzipped = zlib.gzipSync(Buffer.from(jsonContent, 'utf8'));
  fs.writeFileSync(gzPath, gzipped);

  const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[Hydrator] ✅ Completed ${cleanSym}: added ${addedContracts} contracts across ${fileObj.sessionsCount} sessions (${durationSec}s, ${(gzipped.length / 1024).toFixed(1)} KB gz).`);

  return {
    symbol: cleanSym,
    status: 'completed',
    sessionsCount: fileObj.sessionsCount,
    earliestDate: fileObj.earliestDate,
    latestDate: fileObj.latestDate,
    addedContracts,
    durationSec
  };
}

export async function runCrawler() {
  if (isStatusOnly) {
    const status = getCrawlerStatus();
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 DRABYASHREE NEPSE: HISTORICAL FLOORSHEET CRAWLER STATUS      ');
    console.log('════════════════════════════════════════════════════════════════');
    console.table(status);
    return;
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log('🚀 STARTING MARKET-WIDE MULTI-YEAR FLOORSHEET HYDRATION WORKER  ');
  console.log('════════════════════════════════════════════════════════════════');

  // Discover candidate symbols
  let symbolsToProcess = [];
  if (targetSymbols && targetSymbols.length > 0) {
    symbolsToProcess = targetSymbols;
  } else {
    const files = fs.readdirSync(ALLTIME_DIR).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json');
    // Sort incomplete/partial files first, prioritizing active stocks
    const scoredList = [];
    for (const f of files) {
      const sym = f.replace('.json', '');
      try {
        const d = JSON.parse(fs.readFileSync(path.join(ALLTIME_DIR, f), 'utf8'));
        const sc = Object.keys(d.dailyRollup || {}).length;
        const isComplete = Boolean(d.isCompleteHistory && sc >= 500);
        scoredList.push({ sym, sc, isComplete });
      } catch (_) {
        scoredList.push({ sym, sc: 0, isComplete: false });
      }
    }
    // Incomplete first, smallest session count first
    scoredList.sort((a, b) => {
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
      return a.sc - b.sc;
    });

    symbolsToProcess = scoredList.map(s => s.sym);
    if (limitCount > 0) {
      symbolsToProcess = symbolsToProcess.slice(0, limitCount);
    }
  }

  console.log(`[Hydrator] Queue assembled: ${symbolsToProcess.length} symbols to hydrate.`);
  let processedCount = 0;

  for (const sym of symbolsToProcess) {
    try {
      await hydrateSymbol(sym);
      processedCount++;

      // Every 5 symbols, update the global cumulative ledger & save progress
      if (processedCount % 5 === 0 || processedCount === symbolsToProcess.length) {
        console.log(`[Hydrator] 🔄 Periodic sync: updating cumulative broker ledger (${processedCount}/${symbolsToProcess.length})...`);
        try {
          exportCumulativeBrokerLedger();
        } catch (_) {}

        const currentStatus = getCrawlerStatus();
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
          lastUpdated: new Date().toISOString(),
          processedThisRun: processedCount,
          totalInQueue: symbolsToProcess.length,
          marketStatus: currentStatus
        }, null, 2), 'utf8');
      }
    } catch (err) {
      console.warn(`[Hydrator] ⚠️ Error hydrating ${sym}:`, err.message);
    }
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log(`🏁 FINISHED BATCH: ${processedCount} symbols successfully hydrated.`);
  console.log('════════════════════════════════════════════════════════════════');
  try {
    exportCumulativeBrokerLedger();
  } catch (_) {}
}

if (process.argv[1] && process.argv[1].endsWith('hydrateMarketAllTimeFloorsheets.mjs')) {
  runCrawler().catch(e => {
    console.error('Fatal crawler error:', e);
    process.exit(1);
  });
}
