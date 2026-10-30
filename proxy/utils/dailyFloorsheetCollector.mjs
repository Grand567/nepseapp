// proxy/utils/dailyFloorsheetCollector.mjs
/**
 * Daily Floorsheet Automated Downloader & Local Storage Vault
 * 
 * - Downloads everyday market floorsheet after 3:00 PM NPT (post-market close).
 * - Saves complete raw trade records into dedicated local folder:
 *     proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json
 *     proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json.gz
 * - Ingests contracts into SQLite ledger for instant zero-latency calculations across:
 *     Broker Accumulation View, Floorsheet Hub, A/D Radar, and Telemetry endpoints.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { db } from '../db/ledgerStore.js';
import { getFullSessionFloorsheet } from '../brokerVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDailyFloorsheetDir() {
  const candidates = [
    path.join(process.cwd(), 'proxy', 'data', 'daily_floorsheets'),
    path.join(process.cwd(), 'data', 'daily_floorsheets'),
    path.join(__dirname, '..', 'data', 'daily_floorsheets')
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

export const DAILY_FLOORSHEETS_DIR = resolveDailyFloorsheetDir();

// Index metadata file path
const INDEX_FILE = path.join(DAILY_FLOORSHEETS_DIR, 'archive_index.json');

/**
 * Load or initialize the archive index
 */
export function getArchiveIndex() {
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

/**
 * Save archive index
 */
function saveArchiveIndex(indexList) {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexList, null, 2), 'utf8');
  } catch (err) {
    console.warn('[dailyFloorsheetCollector] Failed to save archive index:', err.message);
  }
}

/**
 * Ingest contracts into SQLite ledger tables:
 * - floorsheet_contracts
 * - daily_broker_ledger
 * - daily_stock_summary
 */
export function ingestContractsToLedger(tradeDate, trades = []) {
  if (!db || !Array.isArray(trades) || trades.length === 0) return 0;
  
  const cleanDate = String(tradeDate || '').trim();
  if (!cleanDate) return 0;

  try {
    const insertContract = db.prepare(`
      INSERT INTO floorsheet_contracts (
        contract_no, symbol, trade_date, trade_time,
        buyer_broker, seller_broker, kitta, rate, amount,
        aggressor_side, is_internal_cross, is_whale_print,
        is_quarantined, calendar_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID')
      ON CONFLICT(contract_no) DO UPDATE SET
        symbol = excluded.symbol,
        trade_date = excluded.trade_date,
        trade_time = excluded.trade_time,
        buyer_broker = excluded.buyer_broker,
        seller_broker = excluded.seller_broker,
        kitta = excluded.kitta,
        rate = excluded.rate,
        amount = excluded.amount,
        aggressor_side = excluded.aggressor_side,
        is_internal_cross = excluded.is_internal_cross,
        is_whale_print = excluded.is_whale_print
    `);

    const brokerSummaryMap = new Map(); // key: symbol:brokerId -> { buyVol, sellVol, buyAmt, sellAmt, crossVol }
    const stockSummaryMap = new Map();  // key: symbol -> { open, high, low, close, volume, turnover, trades }

    const tx = db.transaction((rows) => {
      let inserted = 0;
      for (const t of rows) {
        const cNo = String(t.contractId || t.contractNo || t.id || `${cleanDate.replace(/-/g, '')}-${inserted}`);
        const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
        if (!sym) continue;

        const bBroker = parseInt(String(t.buyerMemberId || t.buyerBroker || t.buyer || 0).replace(/^0+/, ''), 10) || 0;
        const sBroker = parseInt(String(t.sellerMemberId || t.sellerBroker || t.seller || 0).replace(/^0+/, ''), 10) || 0;
        const kitta = Math.round(Number(t.contractQuantity ?? t.qty ?? t.quantity ?? t.kitta ?? t.shares ?? 0));
        const rate = Number(t.contractRate ?? t.rate ?? t.price ?? t.executionRate ?? 0);
        const amount = Number(t.contractAmount ?? t.amount ?? (kitta * rate) ?? 0);
        const tTime = String(t.tradeTime || t.businessDate || `${cleanDate} 15:00:00`);
        const isCross = bBroker > 0 && bBroker === sBroker ? 1 : 0;
        const isWhale = kitta >= 500 ? 1 : 0;
        const agg = t.aggressor || (bBroker > sBroker ? 'BUY' : 'SELL');

        insertContract.run(
          cNo, sym, cleanDate, tTime,
          bBroker, sBroker, kitta, rate, amount,
          agg, isCross, isWhale
        );
        inserted++;

        // Aggregate per-broker
        if (bBroker > 0) {
          const keyB = `${sym}:${bBroker}`;
          const cur = brokerSummaryMap.get(keyB) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
          cur.buyVol += kitta;
          cur.buyAmt += amount;
          if (isCross) cur.crossVol += kitta;
          brokerSummaryMap.set(keyB, cur);
        }
        if (sBroker > 0) {
          const keyS = `${sym}:${sBroker}`;
          const cur = brokerSummaryMap.get(keyS) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
          cur.sellVol += kitta;
          cur.sellAmt += amount;
          brokerSummaryMap.set(keyS, cur);
        }

        // Aggregate per-stock
        const stockAgg = stockSummaryMap.get(sym) || {
          open: rate, high: rate, low: rate, close: rate,
          volume: 0, turnover: 0, trades: 0
        };
        stockAgg.high = Math.max(stockAgg.high, rate);
        stockAgg.low = Math.min(stockAgg.low, rate);
        stockAgg.close = rate;
        stockAgg.volume += kitta;
        stockAgg.turnover += amount;
        stockAgg.trades += 1;
        stockSummaryMap.set(sym, stockAgg);
      }
      return inserted;
    });

    const totalInserted = tx(trades);

    // Ingest aggregated broker ledger
    if (brokerSummaryMap.size > 0) {
      const insertBroker = db.prepare(`
        INSERT OR REPLACE INTO daily_broker_ledger (
          trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt, cross_vol,
          is_quarantined, calendar_status, tape_scope, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID', 'FULL_TAPE', 'DAILY_COLLECTOR')
      `);
      const brokerTx = db.transaction(() => {
        for (const [key, data] of brokerSummaryMap.entries()) {
          const [sym, bIdStr] = key.split(':');
          insertBroker.run(cleanDate, sym, parseInt(bIdStr, 10), data.buyVol, data.sellVol, data.buyAmt, data.sellAmt, data.crossVol);
        }
      });
      brokerTx();
    }

    // Ingest aggregated stock summary
    if (stockSummaryMap.size > 0) {
      const insertStock = db.prepare(`
        INSERT OR REPLACE INTO daily_stock_summary (
          trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover,
          is_quarantined, calendar_status, tape_scope, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID', 'FULL_TAPE', 'DAILY_COLLECTOR')
      `);
      const stockTx = db.transaction(() => {
        for (const [sym, s] of stockSummaryMap.entries()) {
          insertStock.run(cleanDate, sym, s.open, s.high, s.low, s.close, s.volume, s.turnover);
        }
      });
      stockTx();
    }

    console.log(`[dailyFloorsheetCollector] Ingested ${totalInserted} contracts into drabyashree_ledger.db for ${cleanDate}.`);
    return totalInserted;
  } catch (err) {
    console.error(`[dailyFloorsheetCollector] Ingestion error for ${cleanDate}:`, err.message);
    return 0;
  }
}

/**
 * Downloads and archives the floorsheet locally into DAILY_FLOORSHEETS_DIR
 * @param {string} dateStr - Target date (YYYY-MM-DD). If omitted, defaults to current NPT session date.
 * @param {object} options - Options { force?: boolean }
 */
export async function downloadAndArchiveDailyFloorsheet(dateStr = '', options = {}) {
  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  const targetDate = String(dateStr || nowNpt.toISOString().split('T')[0]).trim();

  const jsonFilePath = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${targetDate}.json`);
  const gzFilePath = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${targetDate}.json.gz`);

  console.log(`[dailyFloorsheetCollector] Initiating local floorsheet download for session: ${targetDate}...`);

  // Check if already archived locally and not forced
  if (!options?.force && fs.existsSync(jsonFilePath)) {
    try {
      const stat = fs.statSync(jsonFilePath);
      if (stat.size > 1000) {
        console.log(`[dailyFloorsheetCollector] Already downloaded locally: ${jsonFilePath} (${(stat.size / 1024).toFixed(1)} KB)`);
        const cachedTrades = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

        // ── Date Mislabeling Guard ──
        // Validate that the cached file actually contains data for targetDate.
        // Cross-check by sampling the first trade's businessDate.
        const sampleTrade = cachedTrades[0];
        const embeddedDate = String(
          sampleTrade?.businessDate || sampleTrade?.trade_date || sampleTrade?.tradeDate || ''
        ).split('T')[0].trim();
        if (embeddedDate && embeddedDate !== targetDate) {
          console.warn(`[dailyFloorsheetCollector] ⚠️ Date mislabeling detected! File ${jsonFilePath} contains data for ${embeddedDate} but was labeled ${targetDate}. Deleting stale file and re-fetching.`);
          try { fs.unlinkSync(jsonFilePath); } catch (_) {}
          try { if (fs.existsSync(gzFilePath)) fs.unlinkSync(gzFilePath); } catch (_) {}
          // Fall through to re-fetch below
        } else {
          // ── Ensure floorsheet_contracts is populated even for cached files ──
          if (db && cachedTrades.length > 0) {
            const existing = db.prepare(
              'SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date = ?'
            ).get(targetDate);
            if (!existing || existing.c === 0) {
              console.log(`[dailyFloorsheetCollector] floorsheet_contracts missing for ${targetDate} — re-ingesting ${cachedTrades.length} cached contracts...`);
              ingestContractsToLedger(targetDate, cachedTrades);
            }
          }
          return {
            success: true,
            date: targetDate,
            tradeCount: cachedTrades.length,
            filePath: jsonFilePath,
            gzFilePath,
            cached: true
          };
        }
      }
    } catch (_) {}
  }

  // Fetch full floorsheet trades for this session
  let trades = [];
  try {
    trades = await getFullSessionFloorsheet(targetDate);
  } catch (err) {
    console.warn(`[dailyFloorsheetCollector] Fetch warning for ${targetDate}:`, err.message);
  }

  // ── Date Mislabeling Guard for freshly fetched data ──
  // If exchange API returns data for a different session (e.g., yesterday's data labeled today),
  // abort rather than storing incorrect data.
  if (trades && trades.length > 0) {
    const sampleFreshDate = String(
      trades[0]?.businessDate || trades[0]?.trade_date || trades[0]?.tradeDate || ''
    ).split('T')[0].trim();
    if (sampleFreshDate && sampleFreshDate !== targetDate) {
      console.warn(`[dailyFloorsheetCollector] ⚠️ Date mislabeling: Exchange returned ${sampleFreshDate}, requested ${targetDate}. Aborting save — today's market may not be closed yet.`);
      return {
        success: false,
        date: targetDate,
        error: `Exchange returned data for ${sampleFreshDate}, not ${targetDate}. Market may still be open or data not yet available.`
      };
    }
  }

  // If external fetch returned empty, try extracting from SQLite ledger
  if ((!trades || trades.length === 0) && db) {
    try {
      const ledgerRows = db.prepare(`
        SELECT
          contract_no AS contractId,
          symbol AS stockSymbol,
          trade_date AS businessDate,
          trade_time AS tradeTime,
          buyer_broker AS buyerBroker,
          seller_broker AS sellerBroker,
          kitta AS qty,
          rate,
          amount,
          aggressor_side AS aggressor,
          is_internal_cross AS isInternalCross,
          is_whale_print AS isWhalePrint
        FROM floorsheet_contracts
        WHERE trade_date = ?
        ORDER BY contract_no ASC
      `).all(targetDate);

      if (ledgerRows.length > 0) {
        trades = ledgerRows;
        console.log(`[dailyFloorsheetCollector] Retrieved ${trades.length} trades from drabyashree_ledger.db for ${targetDate}.`);
      }
    } catch (e) {
      console.warn(`[dailyFloorsheetCollector] SQLite extraction error:`, e.message);
    }
  }

  if (!trades || trades.length === 0) {
    console.warn(`[dailyFloorsheetCollector] No floorsheet trades found for session ${targetDate}.`);
    return {
      success: false,
      date: targetDate,
      error: `No floorsheet trades available for session ${targetDate}`
    };
  }

  // 1. Write clean uncompressed JSON file
  const jsonContent = JSON.stringify(trades, null, 2);
  fs.writeFileSync(jsonFilePath, jsonContent, 'utf8');

  // 2. Write compressed .gz file for efficient long-term archiving
  const gzipped = zlib.gzipSync(Buffer.from(jsonContent, 'utf8'));
  fs.writeFileSync(gzFilePath, gzipped);

  // 3. Ingest into SQLite database so all services have live calculated data
  const ingestedCount = ingestContractsToLedger(targetDate, trades);

  // 4. Update the archive index
  const index = getArchiveIndex();
  const existingIdx = index.findIndex(item => item.date === targetDate);
  const totalVolume = trades.reduce((sum, t) => sum + Number(t.contractQuantity ?? t.qty ?? t.quantity ?? t.kitta ?? 0), 0);
  const totalTurnover = trades.reduce((sum, t) => sum + Number(t.contractAmount ?? t.amount ?? (Number(t.contractQuantity ?? t.qty ?? 0) * Number(t.contractRate ?? t.rate ?? 0)) ?? 0), 0);

  const meta = {
    date: targetDate,
    tradeCount: trades.length,
    ingestedCount,
    totalVolume,
    totalTurnover: Math.round(totalTurnover),
    jsonFileSizeKb: +(fs.statSync(jsonFilePath).size / 1024).toFixed(1),
    gzFileSizeKb: +(gzipped.length / 1024).toFixed(1),
    savedAt: new Date().toISOString(),
    status: 'COMPLETE'
  };

  if (existingIdx >= 0) {
    index[existingIdx] = meta;
  } else {
    index.unshift(meta);
  }
  saveArchiveIndex(index);

  console.log(`[dailyFloorsheetCollector] Successfully saved ${trades.length} trades for ${targetDate} into ${jsonFilePath} and ${gzFilePath}.`);

  return {
    success: true,
    date: targetDate,
    tradeCount: trades.length,
    ingestedCount,
    totalVolume,
    totalTurnover: Math.round(totalTurnover),
    filePath: jsonFilePath,
    gzFilePath
  };
}

/**
 * Fast local retrieval: reads from daily_floorsheets/ or drabyashree_ledger.db
 */
export function getLocalDailyFloorsheet(dateStr) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return null;

  const jsonFile = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json`);
  if (fs.existsSync(jsonFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }

  const gzFile = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json.gz`);
  if (fs.existsSync(gzFile)) {
    try {
      const unzipped = zlib.gunzipSync(fs.readFileSync(gzFile));
      const data = JSON.parse(unzipped.toString('utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }

  return null;
}
