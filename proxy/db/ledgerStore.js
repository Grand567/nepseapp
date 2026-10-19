// proxy/db/ledgerStore.js
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { calculateMultiDayDiagnostics, PHASE_DEFINITIONS } from "../utils/microstructureEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust data directory resolution for both local dev & Render persistent disk
function resolveDataDir() {
  if (process.env.RENDER_DISK_PATH && fs.existsSync(process.env.RENDER_DISK_PATH)) {
    return process.env.RENDER_DISK_PATH;
  }
  const candidates = [
    path.join(process.cwd(), "proxy", "data"),
    path.join(process.cwd(), "data"),
    path.join(__dirname, "..", "data"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const fallback = path.join(process.cwd(), "data");
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const DATA_DIR = resolveDataDir();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "drabyashree_ledger.db");

// Fast bootstrap: If SQLite DB doesn't exist or is empty (<100KB), attempt instant restore from drabyashree_ledger.db.gz
if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size < 100000) {
  const candidateGzFiles = [
    path.join(DATA_DIR, "drabyashree_ledger.db.gz"),
    path.join(process.cwd(), "proxy", "data", "drabyashree_ledger.db.gz"),
    path.join(process.cwd(), "data", "drabyashree_ledger.db.gz"),
    path.join(__dirname, "..", "data", "drabyashree_ledger.db.gz"),
    path.join(__dirname, "..", "proxy", "data", "drabyashree_ledger.db.gz"),
    path.join(__dirname, "data", "drabyashree_ledger.db.gz"),
  ];
  for (const gzFile of candidateGzFiles) {
    if (fs.existsSync(gzFile)) {
      try {
        const t0 = Date.now();
        const compressed = fs.readFileSync(gzFile);
        const uncompressed = zlib.gunzipSync(compressed);
        fs.writeFileSync(dbPath, uncompressed);
        console.log(`[Drabyashree Ledger] Fast bootstrap restored ${dbPath} (${(uncompressed.length / 1024 / 1024).toFixed(2)} MB) from ${gzFile} in ${Date.now() - t0}ms`);
        break;
      } catch (err) {
        console.warn(`[Drabyashree Ledger] Failed fast bootstrap from ${gzFile}:`, err.message);
      }
    }
  }
}

export const db = new Database(dbPath);

// Enable WAL mode & NORMAL synchronous for maximum concurrent read/write throughput
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// 1. Create Compressed Tables & Indexes (stores 40 trading days in ~25 MB)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_stock_summary (
    trade_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    open_price REAL,
    high_price REAL,
    low_price REAL,
    close_price REAL,
    total_volume INTEGER NOT NULL,
    total_turnover REAL NOT NULL,
    PRIMARY KEY (trade_date, symbol)
  );

  CREATE TABLE IF NOT EXISTS daily_broker_ledger (
    trade_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    broker_id INTEGER NOT NULL,
    buy_vol INTEGER DEFAULT 0,
    sell_vol INTEGER DEFAULT 0,
    buy_amt REAL DEFAULT 0,
    sell_amt REAL DEFAULT 0,
    PRIMARY KEY (trade_date, symbol, broker_id)
  );

  CREATE INDEX IF NOT EXISTS idx_stock_date ON daily_stock_summary(symbol, trade_date DESC);
  CREATE INDEX IF NOT EXISTS idx_broker_symbol_date ON daily_broker_ledger(symbol, trade_date DESC);
  CREATE INDEX IF NOT EXISTS idx_stock_summary_date ON daily_stock_summary(trade_date DESC);
`);

// In-Memory Tier-1 Hot Cache for < 1ms API responses
export const HOT_CACHE = {
  lastUpdatedDate: null,
  radarByTimeframe: { 1: [], 5: [], 15: [], 30: [] },
  stockDiagnostics: new Map(), // Key: `${symbol}_${days}` -> Single stock deep diagnostic
};

/**
 * Checks if a specific trade_date already exists in SQLite
 */
export function hasTradeDate(tradeDate) {
  if (!tradeDate) return false;
  const row = db.prepare(`SELECT 1 FROM daily_stock_summary WHERE trade_date = ? LIMIT 1`).get(tradeDate);
  return Boolean(row);
}

/**
 * Retrieves all distinct trading dates stored in SQLite in descending order
 */
export function getStoredDates(limit = 40) {
  return db
    .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT ?`)
    .all(limit)
    .map(r => r.trade_date);
}

/**
 * Compresses raw daily floorsheet rows (e.g., 50,000+ trades) into compacted broker summaries
 * Run this at 3:15 PM NPT after market close or periodically during trading sessions.
 */
export const ingestDailyFloorsheetTransaction = db.transaction((tradeDate, rawTrades) => {
  if (!tradeDate || !Array.isArray(rawTrades) || rawTrades.length === 0) return 0;

  const stockMap = new Map(); // symbol -> { open, high, low, close, vol, amt, brokers: Map }
  const seenContracts = new Set();

  for (const trade of rawTrades) {
    const cid = String(trade.contractId || trade.contract_no || '').trim();
    if (cid) {
      if (seenContracts.has(cid)) continue;
      seenContracts.add(cid);
    }

    const symbol = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || '').toUpperCase().trim();
    const qty = Number(trade.contractQuantity || trade.quantity || trade.qty || 0);
    const rate = Number(trade.contractRate || trade.rate || 0);
    const amt = Number(trade.contractAmount || trade.amount || (qty * rate));
    const buyer = Number(trade.buyerMemberId || trade.buyerBroker || trade.buyer || 0);
    const seller = Number(trade.sellerMemberId || trade.sellerBroker || trade.seller || 0);

    if (!symbol || qty <= 0) continue;

    // Exclude circular self-matched wash trades (buyer === seller) from distorting net flow
    const isWashTrade = buyer > 0 && seller > 0 && buyer === seller;

    // Zero-Sum Guard: If trades come from one-sided matrix reconstruction (seller only, no buyer),
    // do NOT add to stock total volume/turnover again (already counted on the buyer side).
    const isOneSidedSellReconstruction = !buyer && Boolean(seller);

    let s = stockMap.get(symbol);
    if (!s) {
      const initialRate = rate > 0 ? rate : (amt > 0 ? amt / qty : 100);
      s = {
        open: initialRate,
        high: initialRate,
        low: initialRate,
        close: initialRate,
        vol: 0,
        amt: 0,
        brokers: new Map(),
      };
      stockMap.set(symbol, s);
    }

    const currentRate = rate > 0 ? rate : (amt > 0 ? amt / qty : s.close);
    if (currentRate > 0) {
      if (currentRate > s.high) s.high = currentRate;
      if (currentRate < s.low || s.low <= 0) s.low = currentRate;
      s.close = currentRate;
    }

    if (!isOneSidedSellReconstruction) {
      s.vol += qty;
      s.amt += amt;
    }

    // Accumulate Buyer Broker (skip wash trades so smart money concentration is 100% genuine)
    if (buyer && !isWashTrade) {
      const b = s.brokers.get(buyer) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };
      b.buyVol += qty;
      b.buyAmt += amt;
      s.brokers.set(buyer, b);
    }

    // Accumulate Seller Broker
    if (seller && !isWashTrade) {
      const b = s.brokers.get(seller) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };
      b.sellVol += qty;
      b.sellAmt += amt;
      s.brokers.set(seller, b);
    }
  }

  const upsertStock = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, symbol) DO UPDATE SET
      high_price = MAX(daily_stock_summary.high_price, excluded.high_price),
      low_price = MIN(daily_stock_summary.low_price, excluded.low_price),
      close_price = excluded.close_price,
      total_volume = excluded.total_volume,
      total_turnover = excluded.total_turnover
  `);

  const upsertBroker = db.prepare(`
    INSERT INTO daily_broker_ledger (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, symbol, broker_id) DO UPDATE SET
      buy_vol = excluded.buy_vol,
      sell_vol = excluded.sell_vol,
      buy_amt = excluded.buy_amt,
      sell_amt = excluded.sell_amt
  `);

  let count = 0;
  for (const [symbol, data] of stockMap.entries()) {
    upsertStock.run(tradeDate, symbol, data.open, data.high, data.low, data.close, data.vol, data.amt);
    count++;
    for (const [brokerId, bData] of data.brokers.entries()) {
      upsertBroker.run(tradeDate, symbol, brokerId, bData.buyVol, bData.sellVol, bData.buyAmt, bData.sellAmt);
    }
  }

  // Prune records older than 40 trading days to keep DB tiny (< 25 MB) and super fast
  db.prepare(`
    DELETE FROM daily_stock_summary 
    WHERE trade_date NOT IN (
      SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 40
    )
  `).run();

  db.prepare(`
    DELETE FROM daily_broker_ledger 
    WHERE trade_date NOT IN (
      SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 40
    )
  `).run();

  return count;
});

/**
 * Exports compressed backup file `data/ledger_seed_snapshot.json.gz`
 * Ensures Render Free Tier containers can immediately bootstrap on cold-boot without scraping.
 */
export function exportLedgerSnapshotGz() {
  try {
    const dates = getStoredDates(40);
    if (dates.length === 0) return false;
    const oldestDate = dates[dates.length - 1];

    const stockSummaries = db
      .prepare(`SELECT * FROM daily_stock_summary WHERE trade_date >= ? ORDER BY trade_date DESC`)
      .all(oldestDate);
    const brokerLedger = db
      .prepare(`SELECT * FROM daily_broker_ledger WHERE trade_date >= ?`)
      .all(oldestDate);

    if (stockSummaries.length === 0) return false;

    const payload = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      tradingDates: dates,
      stockSummaries,
      brokerLedger,
    });

    const compressed = zlib.gzipSync(Buffer.from(payload, "utf8"), { level: 9 });
    const targetFile = path.join(DATA_DIR, "ledger_seed_snapshot.json.gz");
    fs.writeFileSync(targetFile, compressed);

    console.log(
      `[Drabyashree Ledger] Exported compressed snapshot to ${targetFile} (${(compressed.length / 1024 / 1024).toFixed(2)} MB, ${dates.length} dates, ${stockSummaries.length} summaries, ${brokerLedger.length} broker rows)`
    );
    return true;
  } catch (err) {
    console.warn("[Drabyashree Ledger] Failed to export snapshot gz:", err.message);
    return false;
  }
}

/**
 * Automatically seeds SQLite from `ledger_seed_snapshot.json.gz` if database has < 30 dates or < 300,000 broker rows
 */
export function seedFromSnapshotGz(force = false) {
  try {
    const dates = getStoredDates(40);
    const brokerRowsCount = db.prepare(`SELECT COUNT(*) as c FROM daily_broker_ledger`).get()?.c || 0;

    // If database already has at least 30 trading dates and at least 300,000 broker rows, skip restore unless forced
    if (!force && dates.length >= 30 && brokerRowsCount >= 300000) {
      return false;
    }

    // 1. Ultra-fast SQLite ATTACH restore from drabyashree_ledger.db.gz (<400ms)
    const candidateGzFiles = [
      path.join(DATA_DIR, "drabyashree_ledger.db.gz"),
      path.join(process.cwd(), "proxy", "data", "drabyashree_ledger.db.gz"),
      path.join(process.cwd(), "data", "drabyashree_ledger.db.gz"),
      path.join(__dirname, "..", "data", "drabyashree_ledger.db.gz"),
      path.join(__dirname, "..", "proxy", "data", "drabyashree_ledger.db.gz"),
      path.join(__dirname, "data", "drabyashree_ledger.db.gz"),
    ];

    let foundGz = null;
    for (const f of candidateGzFiles) {
      if (fs.existsSync(f)) {
        foundGz = f;
        break;
      }
    }

    if (foundGz) {
      try {
        const t0 = Date.now();
        const tempDbPath = path.join(DATA_DIR, `temp_seed_${Date.now()}.db`);
        const gzBuf = fs.readFileSync(foundGz);
        fs.writeFileSync(tempDbPath, zlib.gunzipSync(gzBuf));

        const normalizedTempPath = tempDbPath.replace(/\\/g, "/");
        db.exec(`ATTACH DATABASE '${normalizedTempPath}' AS seed_db;`);
        db.exec(`INSERT OR REPLACE INTO daily_stock_summary SELECT * FROM seed_db.daily_stock_summary;`);
        db.exec(`INSERT OR REPLACE INTO daily_broker_ledger SELECT * FROM seed_db.daily_broker_ledger;`);
        db.exec(`DETACH DATABASE seed_db;`);

        try { fs.unlinkSync(tempDbPath); } catch (_) {}
        console.log(`[Drabyashree Ledger] Ultra-fast ATTACH restore completed in ${Date.now() - t0}ms from ${foundGz}.`);
        return true;
      } catch (attachErr) {
        console.warn(`[Drabyashree Ledger] ATTACH restore notice: ${attachErr.message}. Falling back to snapshot JSON...`);
      }
    }

    // 2. Fallback to JSON snapshot gz if .db.gz is not available
    const candidateFiles = [
      path.join(DATA_DIR, "ledger_seed_snapshot.json.gz"),
      path.join(process.cwd(), "proxy", "data", "ledger_seed_snapshot.json.gz"),
      path.join(process.cwd(), "data", "ledger_seed_snapshot.json.gz"),
      path.join(__dirname, "..", "data", "ledger_seed_snapshot.json.gz"),
      path.join(__dirname, "..", "proxy", "data", "ledger_seed_snapshot.json.gz"),
      path.join(__dirname, "data", "ledger_seed_snapshot.json.gz"),
    ];

    let foundFile = null;
    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        foundFile = f;
        break;
      }
    }

    if (!foundFile) {
      console.warn("[Drabyashree Ledger] No ledger_seed_snapshot.json.gz found in candidate paths:", candidateFiles);
      return false;
    }

    const fileSizeBytes = fs.statSync(foundFile).size;
    console.log(`[Drabyashree Ledger] Cold-boot restore: Found compressed snapshot at ${foundFile} (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB). Upserting into SQLite...`);
    const buffer = fs.readFileSync(foundFile);
    const uncompressed = zlib.gunzipSync(buffer);
    const data = JSON.parse(uncompressed.toString("utf8"));

    const stockSummaries = data.stockSummaries || [];
    const brokerLedger = data.brokerLedger || [];

    if (stockSummaries.length === 0) return false;

    const restoreTx = db.transaction(() => {
      const insertStock = db.prepare(`
        INSERT OR REPLACE INTO daily_stock_summary 
        (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of stockSummaries) {
        insertStock.run(s.trade_date, s.symbol, s.open_price, s.high_price, s.low_price, s.close_price, s.total_volume, s.total_turnover);
      }

      const insertBroker = db.prepare(`
        INSERT OR REPLACE INTO daily_broker_ledger 
        (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of brokerLedger) {
        insertBroker.run(b.trade_date, b.symbol, b.broker_id, b.buy_vol, b.sell_vol, b.buy_amt, b.sell_amt);
      }
    });

    const t0 = Date.now();
    restoreTx();
    console.log(
      `[Drabyashree Ledger] Successfully restored and merged ${stockSummaries.length} summaries and ${brokerLedger.length} broker rows from snapshot in ${Date.now() - t0}ms.`
    );
    return true;
  } catch (err) {
    console.warn("[Drabyashree Ledger] Error restoring from snapshot gz:", err.message);
    return false;
  }
}

/**
 * Pulls daily history for a single symbol from SQLite ledger
 */
export function getSymbolHistoryFromDb(symbol, days = 30) {
  try {
    const sym = String(symbol || '').toUpperCase().trim();
    const dates = getStoredDates(Math.max(1, parseInt(days, 10)));
    if (dates.length === 0) return [];
    const oldestDate = dates[dates.length - 1];

    const summaries = db.prepare(`
      SELECT * FROM daily_stock_summary 
      WHERE symbol = ? AND trade_date >= ? 
      ORDER BY trade_date DESC
    `).all(sym, oldestDate);

    if (summaries.length === 0) return [];

    const brokerRows = db.prepare(`
      SELECT * FROM daily_broker_ledger 
      WHERE symbol = ? AND trade_date >= ?
    `).all(sym, oldestDate);

    const brokerGroup = new Map();
    for (const row of brokerRows) {
      let arr = brokerGroup.get(row.trade_date);
      if (!arr) {
        arr = [];
        brokerGroup.set(row.trade_date, arr);
      }
      arr.push({
        brokerId: row.broker_id,
        broker: row.broker_id,
        buyVol: row.buy_vol,
        sellVol: row.sell_vol,
        buyAmt: row.buy_amt,
        sellAmt: row.sell_amt,
      });
    }

    return summaries.map(s => ({
      date: s.trade_date,
      openPrice: s.open_price,
      highPrice: s.high_price,
      lowPrice: s.low_price,
      closePrice: s.close_price,
      totalVolume: s.total_volume,
      totalTurnover: s.total_turnover,
      brokers: brokerGroup.get(s.trade_date) || [],
    }));
  } catch (err) {
    console.warn(`[ledgerStore] Error querying history for ${symbol}:`, err.message);
    return [];
  }
}

/**
 * Returns diagnostic system health of SQLite ledger and HOT_CACHE
 */
export function getLedgerStatusInfo() {
  try {
    const dates = getStoredDates(40);
    const stockSummaryCount = db.prepare(`SELECT COUNT(*) as c FROM daily_stock_summary`).get()?.c || 0;
    const brokerLedgerCount = db.prepare(`SELECT COUNT(*) as c FROM daily_broker_ledger`).get()?.c || 0;
    return {
      success: true,
      tradingDatesCount: dates.length,
      latestTradeDate: dates[0] || null,
      oldestTradeDate: dates[dates.length - 1] || null,
      stockSummaryRows: stockSummaryCount,
      brokerLedgerRows: brokerLedgerCount,
      hotCacheDiagnosticCount: HOT_CACHE.stockDiagnostics.size,
      hotCacheRadarCount30D: (HOT_CACHE.radarByTimeframe[30] || []).length,
      lastUpdatedDate: HOT_CACHE.lastUpdatedDate || null
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Rebuilds the in-memory 1D, 5D, 15D, and 30D precomputed snapshots.
 * Computes all 4 horizons for all ~250 NEPSE stocks in ~40ms total and stores them in RAM.
 */
export function rebuildHotCache() {
  const startTime = Date.now();

  // 1. Get last 30 distinct trading dates in descending order
  const dates = db
    .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30`)
    .all()
    .map((r) => r.trade_date);

  if (dates.length === 0) {
    console.log("[Drabyashree Cache] No trading dates found in SQLite ledger. Attempting emergency restore from seed snapshot...");
    seedFromSnapshotGz(true);
    const retryDates = db
      .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30`)
      .all()
      .map((r) => r.trade_date);
    if (retryDates.length === 0) {
      console.warn("[Drabyashree Cache] SQLite ledger remains empty after snapshot restore.");
      return false;
    }
    dates.push(...retryDates);
  }
  const oldestDate = dates[dates.length - 1];

  // 2. Pull all stock summaries & broker rows within the 30-day window in two single bulk reads
  const summaries = db
    .prepare(`SELECT * FROM daily_stock_summary WHERE trade_date >= ? ORDER BY trade_date DESC`)
    .all(oldestDate);

  const brokerRows = db
    .prepare(`SELECT * FROM daily_broker_ledger WHERE trade_date >= ?`)
    .all(oldestDate);

  // Group broker rows by `${symbol}_${trade_date}`
  const brokerGroup = new Map();
  for (const row of brokerRows) {
    const key = `${row.symbol}_${row.trade_date}`;
    let arr = brokerGroup.get(key);
    if (!arr) {
      arr = [];
      brokerGroup.set(key, arr);
    }
    arr.push({
      brokerId: row.broker_id,
      broker: row.broker_id,
      buyVol: row.buy_vol,
      sellVol: row.sell_vol,
      buyAmt: row.buy_amt,
      sellAmt: row.sell_amt,
    });
  }

  // Group daily history by symbol (sorted newest -> oldest)
  const historyBySymbol = new Map();
  for (const s of summaries) {
    let list = historyBySymbol.get(s.symbol);
    if (!list) {
      list = [];
      historyBySymbol.set(s.symbol, list);
    }
    list.push({
      date: s.trade_date,
      openPrice: s.open_price,
      highPrice: s.high_price,
      lowPrice: s.low_price,
      closePrice: s.close_price,
      totalVolume: s.total_volume,
      totalTurnover: s.total_turnover,
      brokers: brokerGroup.get(`${s.symbol}_${s.trade_date}`) || [],
    });
  }

  // 3. Precompute 1D, 5D, 15D, and 30D for every symbol and store in RAM
  const timeframes = [1, 5, 15, 30];
  const nextRadar = { 1: [], 5: [], 15: [], 30: [] };
  const nextDiagnostics = new Map();

  for (const [symbol, dailyHistory] of historyBySymbol.entries()) {
    for (const days of timeframes) {
      const diag = calculateMultiDayDiagnostics(dailyHistory, days);
      if (diag) {
        // Strip memory-heavy allBrokers (each with 30-day daily tape arrays) to keep V8 heap < 100MB on Render Free Tier
        const { allBrokers, ...compactDiag } = diag;
        const payload = { symbol, ...compactDiag };
        nextDiagnostics.set(`${symbol}_${days}`, payload);

        // Comprehensive yet lightweight version for full-market Radar list & Broker Tracker:
        const radarSummary = {
          symbol,
          timeframeDays: diag.timeframeDays,
          scopeLabel: diag.scopeLabel,
          latestClose: diag.latestClose,
          marketVWAP: diag.marketVWAP,
          bigBrokerVWAP: diag.bigBrokerVWAP,
          priceChangePct: diag.priceChangePct,
          totalVolume: diag.totalVolume,
          totalTurnover: diag.totalTurnover,
          bcr5NetPct: diag.bcr5NetPct,
          scr3NetPct: diag.scr3NetPct,
          grossBuyConcentrationPct: diag.grossBuyConcentrationPct,
          grossSellConcentrationPct: diag.grossSellConcentrationPct,
          smartMoneyNetFlowPct: diag.smartMoneyNetFlowPct,
          phase: diag.phase,
          phaseLabel: diag.phaseLabel,
          buyZoneMin: diag.buyZoneMin,
          buyZoneMax: diag.buyZoneMax,
          entryStatus: diag.entryStatus,
          leadAccumulator: diag.leadAccumulator,
          leadDistributor: diag.leadDistributor,
          topAccumulators: diag.topAccumulators,
          topDistributors: diag.topDistributors,
          isSyndicateCoAccumulation: diag.isSyndicateCoAccumulation,
          syndicateBrokers: diag.syndicateBrokers,
          topBuyers: (diag.topGrossBuyers || []).slice(0, 3).map(b => ({
            broker: b.brokerId,
            brokerName: b.brokerName,
            pct: b.pct,
            volume: b.buyVol,
            amount: b.buyAmt
          })),
          topSellers: (diag.topGrossSellers || []).slice(0, 3).map(s => ({
            broker: s.brokerId,
            brokerName: s.brokerName,
            pct: s.pct,
            volume: s.sellVol,
            amount: s.sellAmt
          }))
        };
        nextRadar[days].push(radarSummary);
      }
    }
  }

  const stockCount = historyBySymbol.size;
  // Release intermediate raw structures to reclaim memory immediately
  historyBySymbol.clear();
  brokerGroup.clear();

  HOT_CACHE.lastUpdatedDate = dates[0];
  HOT_CACHE.radarByTimeframe = nextRadar;
  HOT_CACHE.stockDiagnostics = nextDiagnostics;

  console.log(
    `[Drabyashree Cache] Rebuilt 1D/5D/15D/30D hot cache for ${stockCount} stocks in ${Date.now() - startTime}ms (Session: ${dates[0]})`
  );

  // Background export of snapshot gz to ensure cold-boot safety
  setTimeout(() => {
    try { exportLedgerSnapshotGz(); } catch (_) {}
  }, 100);

  return true;
}

/**
 * Cold Boot Seeding Engine:
 * Reads existing historical snapshot gz, broker vault files & raw floorsheets from disk to bootstrap SQLite
 */
export function seedFromDiskVault() {
  const existingDates = getStoredDates(40);
  const brokerRowsCount = db.prepare(`SELECT COUNT(*) as c FROM daily_broker_ledger`).get()?.c || 0;

  if (existingDates.length < 30 || brokerRowsCount < 300000) {
    console.log(`[Drabyashree Ledger] Database has ${existingDates.length} trading dates and ${brokerRowsCount} broker rows (<30 dates or <300k rows). Auto-merging bundled seed snapshot...`);
    seedFromSnapshotGz(true);
  }

  const currentDates = getStoredDates(40);
  if (currentDates.length >= 30) {
    console.log(`[Drabyashree Ledger] Database verified with ${currentDates.length} trading dates.`);
    return;
  }

  console.log("[Drabyashree Ledger] Checking for historical disk files to bootstrap SQLite ledger...");
  const startTime = Date.now();

  // 1. Check for raw full floorsheets (floorsheet-full-*.json)
  try {
    const dataFiles = fs.readdirSync(DATA_DIR);
    const floorsheetFiles = dataFiles.filter(f => f.startsWith("floorsheet-full-") && f.endsWith(".json"));
    for (const file of floorsheetFiles) {
      const match = file.match(/floorsheet-full-(\d{4}-\d{2}-\d{2})\.json/);
      if (match) {
        const tradeDate = match[1];
        if (!hasTradeDate(tradeDate)) {
          const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
          if (Array.isArray(raw) && raw.length > 0) {
            console.log(`[Drabyashree Ledger] Seeding ${raw.length} trades for date ${tradeDate} from ${file}...`);
            ingestDailyFloorsheetTransaction(tradeDate, raw);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Drabyashree Ledger] Error checking floorsheet files:", err.message);
  }

  // 2. Check for broker_vault files (data/broker_vault/*.json) containing rowsByDate
  const vaultDir = path.join(DATA_DIR, "broker_vault");
  if (fs.existsSync(vaultDir)) {
    try {
      const files = fs.readdirSync(vaultDir).filter(f => f.endsWith(".json"));
      console.log(`[Drabyashree Ledger] Inspecting ${files.length} broker vault files for multi-date trades...`);

      // Group all trades by date
      const tradesByDate = new Map();
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(vaultDir, file), "utf8"));
          const rowsByDate = content.rowsByDate || {};
          for (const [dt, rows] of Object.entries(rowsByDate)) {
            if (Array.isArray(rows) && rows.length > 0) {
              let arr = tradesByDate.get(dt);
              if (!arr) {
                arr = [];
                tradesByDate.set(dt, arr);
              }
              arr.push(...rows);
            }
          }
        } catch (_) {}
      }

      for (const [dt, rows] of tradesByDate.entries()) {
        if (!hasTradeDate(dt)) {
          console.log(`[Drabyashree Ledger] Seeding ${rows.length} trades for historical date ${dt}...`);
          ingestDailyFloorsheetTransaction(dt, rows);
        }
      }
    } catch (err) {
      console.warn("[Drabyashree Ledger] Error seeding from broker_vault:", err.message);
    }
  }

  // Generate snapshot gz so future container redeploys boot instantly
  exportLedgerSnapshotGz();
  console.log(`[Drabyashree Ledger] Cold boot seeding completed in ${Date.now() - startTime}ms.`);

  // Auto-backfill real historical sessions if fewer than 15 trading days are stored
  const loadedDates = getStoredDates(15);
  if (loadedDates.length < 15 && !backfillStatusState.isBackfilling) {
    console.log(`[Drabyashree Ledger] Cold boot loaded ${loadedDates.length} dates (< 15). Triggering non-blocking background backfill for real trading days...`);
    setTimeout(() => {
      backfillRealHistoricalFloorsheets(15).catch(err => {
        console.warn("[Drabyashree Ledger] Background auto-backfill caught error:", err.message);
      });
    }, 5000);
  }
}

export const backfillStatusState = {
  isBackfilling: false,
  targetTradingDays: 30,
  loadedTradingDays: 0,
  dates: [],
  currentBackfillingDate: null,
  progressPct: 100,
  startedAt: null,
  completedAt: null,
  error: null,
};

export function getBackfillStatus(targetTradingDays = 30) {
  const dates = getStoredDates(Math.max(40, Number(targetTradingDays) || 30));
  const target = Number(backfillStatusState.targetTradingDays || targetTradingDays || 30);
  return {
    success: true,
    loadedTradingDays: dates.length,
    targetTradingDays: target,
    dates,
    isBackfilling: backfillStatusState.isBackfilling,
    currentBackfillingDate: backfillStatusState.currentBackfillingDate,
    progressPct: Math.min(100, Math.round((dates.length / target) * 100)),
    startedAt: backfillStatusState.startedAt,
    completedAt: backfillStatusState.completedAt,
    error: backfillStatusState.error,
    rule: "100% Real Historical NEPSE Data Only (Zero Mock/Dummy Data)"
  };
}

/**
 * 100% Real Historical NEPSE Floorsheet Backfill & Sync Engine:
 * Strictly authentic market data (Zero mock/synthetic/dummy data).
 * Recursively syncs missing real sessions and progressively rebuilds the Hot Cache.
 */
export async function backfillRealHistoricalFloorsheets(targetTradingDays = 30, delayMs = 1500) {
  const target = Math.max(1, parseInt(targetTradingDays || 30, 10) || 30);

  if (backfillStatusState.isBackfilling) {
    return {
      message: "Real historical backfill already in progress",
      status: getBackfillStatus(target)
    };
  }

  backfillStatusState.isBackfilling = true;
  backfillStatusState.targetTradingDays = target;
  backfillStatusState.startedAt = new Date().toISOString();
  backfillStatusState.error = null;

  try {
    const brokerVault = await import("../brokerVault.mjs");
    let candidateDates = [];
    if (typeof brokerVault.fetchSymbolTradingDates === "function") {
      candidateDates = await brokerVault.fetchSymbolTradingDates("NABIL").catch(() => []);
    }

    if (!Array.isArray(candidateDates) || candidateDates.length === 0) {
      candidateDates = getStoredDates(target);
    }

    const targetDates = candidateDates.slice(0, target);
    const storedDatesSet = new Set(getStoredDates(100));
    const missingDates = targetDates.filter(d => !storedDatesSet.has(d));

    console.log(`[Real Backfill Pipeline] Target: ${target} real sessions. Currently stored: ${storedDatesSet.size}. Missing to fetch: ${missingDates.length}.`);

    if (missingDates.length === 0) {
      backfillStatusState.isBackfilling = false;
      backfillStatusState.completedAt = new Date().toISOString();
      return getBackfillStatus(target);
    }

    const backfilled = [];

    for (const dt of missingDates) {
      backfillStatusState.currentBackfillingDate = dt;
      console.log(`[Real Backfill Pipeline] Fetching authentic floorsheet records for date ${dt}...`);
      
      let trades = null;
      try {
        if (typeof brokerVault.getFullSessionFloorsheet === "function") {
          trades = await brokerVault.getFullSessionFloorsheet(dt);
        }
      } catch (err) {
        console.warn(`[Real Backfill Pipeline] Warning fetching ${dt}:`, err.message);
      }

      if (Array.isArray(trades) && trades.length > 0) {
        const count = ingestDailyFloorsheetTransaction(dt, trades);
        backfilled.push({ date: dt, trades: trades.length, stocks: count });
        console.log(`[Real Backfill Pipeline] Ingested ${trades.length} authentic trades for ${dt} across ${count} scrips.`);
        
        // Progressively rebuild hot cache so 5D, 15D, 30D views update with real data immediately
        rebuildHotCache();
      }

      // Safe rate-limit delay between upstream requests
      await new Promise(r => setTimeout(r, delayMs));
    }

    backfillStatusState.isBackfilling = false;
    backfillStatusState.currentBackfillingDate = null;
    backfillStatusState.completedAt = new Date().toISOString();

    exportLedgerSnapshotGz();
    return getBackfillStatus(target);
  } catch (fatalErr) {
    console.error("[Real Backfill Pipeline] Error:", fatalErr);
    backfillStatusState.isBackfilling = false;
    backfillStatusState.error = fatalErr.message;
    return getBackfillStatus(target);
  }
}

// Alias for backwards compatibility
export const backfillHistoricalDays = backfillRealHistoricalFloorsheets;

