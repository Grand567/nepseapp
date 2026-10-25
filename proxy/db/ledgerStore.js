// proxy/db/ledgerStore.js
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { calculateMultiDayDiagnostics, evaluateEarlyIgnition, PHASE_DEFINITIONS } from "../utils/microstructureEngine.js";
import {
  rebuildSignalTrackRecord,
  initSignalLedgerTable,
  ensureUpgradedLedgerSchema,
  calculateNepseNetReturn,
  evaluateBrokerSmartMoney,
} from "./signalTrackerStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust data directory resolution for both local dev & Render persistent disk
function resolveDataDir() {
  if (process.env.RENDER_DISK_PATH && fs.existsSync(process.env.RENDER_DISK_PATH)) {
    return process.env.RENDER_DISK_PATH;
  }
  const asarUnpacked = __dirname.replace('app.asar', 'app.asar.unpacked');
  const candidates = [
    path.join(process.cwd(), "proxy", "data"),
    path.join(process.cwd(), "data"),
    path.join(__dirname, "..", "data"),
    path.join(asarUnpacked, "..", "data"),
    path.join(process.resourcesPath || '', "app.asar.unpacked", "proxy", "data"),
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

  -- 1. Raw Floorsheet Contracts Table (Tick-by-Tick Persistence)
  CREATE TABLE IF NOT EXISTS floorsheet_contracts (
    contract_no TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    trade_time TEXT,
    buyer_broker INTEGER NOT NULL,
    seller_broker INTEGER NOT NULL,
    kitta INTEGER NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    aggressor_side TEXT DEFAULT 'NEUTRAL',
    is_internal_cross INTEGER DEFAULT 0,
    is_whale_print INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_fs_contracts_symbol_date
    ON floorsheet_contracts (UPPER(symbol), trade_date DESC);

  CREATE INDEX IF NOT EXISTS idx_fs_contracts_date_amount
    ON floorsheet_contracts (trade_date DESC, amount DESC);

  -- 2. Live/Cached L2 Market Depth Table (with off-hours persistence)
  CREATE TABLE IF NOT EXISTS market_depth_cache (
    symbol TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    total_bid_kitta INTEGER DEFAULT 0,
    total_ask_kitta INTEGER DEFAULT 0,
    bids_json TEXT NOT NULL DEFAULT '[]',
    asks_json TEXT NOT NULL DEFAULT '[]'
  );

  -- 3. View: Price-by-Volume (Volume Profile & Synthetic L2 Depth Fallback)
  CREATE VIEW IF NOT EXISTS v_scrip_volume_profile_5d AS
  SELECT
    UPPER(symbol) AS symbol,
    ROUND(rate, 0) AS price_bucket,
    SUM(kitta) AS total_kitta,
    SUM(CASE WHEN aggressor_side = 'BUY' THEN kitta ELSE 0 END) AS buy_aggressor_kitta,
    SUM(CASE WHEN aggressor_side = 'SELL' THEN kitta ELSE 0 END) AS sell_aggressor_kitta,
    SUM(CASE WHEN is_internal_cross = 1 THEN kitta ELSE 0 END) AS internal_cross_kitta,
    COUNT(*) AS contract_count
  FROM floorsheet_contracts
  WHERE trade_date IN (
    SELECT DISTINCT trade_date
    FROM floorsheet_contracts
    ORDER BY trade_date DESC
    LIMIT 5
  )
  GROUP BY UPPER(symbol), ROUND(rate, 0);

  -- 4. Unified Views: signal_ledger & floorsheet_broker_summary
  CREATE VIEW IF NOT EXISTS signal_ledger AS
  SELECT * FROM algorithmic_signal_ledger;

  DROP VIEW IF EXISTS floorsheet_broker_summary;
  CREATE VIEW floorsheet_broker_summary AS
  SELECT
    trade_date,
    symbol,
    broker_id AS broker_no,
    buy_vol AS buy_kitta,
    sell_vol AS sell_kitta,
    buy_amt AS buy_amount,
    sell_amt AS sell_amount,
    ROUND(buy_amt / NULLIF(buy_vol, 0), 2) AS avg_buy_price,
    ROUND(sell_amt / NULLIF(sell_vol, 0), 2) AS avg_sell_price,
    ROUND((buy_amt + sell_amt) / NULLIF(buy_vol + sell_vol, 0), 2) AS vwap,
    0 AS avg_ticket_kitta,
    0 AS broker_anomaly_score
  FROM daily_broker_ledger;
`);

// In-Memory Tier-1 Hot Cache for < 1ms API responses
let stockMap = {};
try {
  const candidatePaths = [
    path.join(__dirname, "..", "stockmap.json"),
    path.join(__dirname, "stockmap.json"),
    path.join(process.cwd(), "proxy", "stockmap.json"),
    path.join(process.cwd(), "src", "utils", "stockmap.json"),
    path.join(process.cwd(), "stockmap.json"),
    path.join(process.cwd(), "proxy", "data", "stockmap.json")
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      stockMap = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
} catch (_) {}

export const HOT_CACHE = {
  lastUpdatedDate: null,
  radarByTimeframe: { 1: [], 3: [], 5: [], 15: [], 30: [] },
  stockDiagnostics: new Map(), // Key: `${symbol}_${days}` -> Single stock deep diagnostic
  earlyIgnition: [], // Precomputed 3D Early Ignition & Manipulation records sorted by ignitionScore
  signalTrackRecord: null, // Empirical walk-forward T+2 audit track record
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

// proxy/db/ledgerStore.js — DROP-IN REPLACEMENT FOR INGESTION, ZERO-SUM LEDGER & 5D VOLUME PROFILE

const NON_EQUITY_EXCLUSION_SET = new Set([
  'NIBLPF', 'NIBSF2', 'NIBLGF', 'NMB50', 'NMBHF1', 'NMBSBF', 'NMBSF1',
  'NICGF', 'NICBF', 'NICFC', 'NICSF', 'SFMF', 'SIGS2', 'SIGS3',
  'SIDDHI', 'SAEF', 'SEF', 'NBF2', 'NBF3', 'CMBF', 'LAXMF', 'LVF1', 'LVF2',
  'KSLY', 'KSY', 'NSY', 'PSF', 'RMF1', 'RMF2', 'GIMES1', 'GIBF1',
  'C30MF', 'PRSF', 'SBCF', 'MMF1', 'H8020', 'LUK', 'SAGF', 'MNMF1'
]);

const PURE_EQUITY_WHITELIST = new Set([
  'UPPER', 'SHPC', 'NHPC', 'CHCL', 'AHPC', 'RHPL', 'UNHPL', 'MHNL', 'DHPL',
  'PMHPL', 'KPCL', 'BPCL', 'AKPL', 'SPDL', 'SMD', 'NFD', 'HIDCL', 'RADHI'
]);

function isNonEquityScrip(symbol) {
  if (!symbol) return true;
  const sym = String(symbol).toUpperCase().trim();
  if (PURE_EQUITY_WHITELIST.has(sym)) return false;
  if (NON_EQUITY_EXCLUSION_SET.has(sym)) return true;
  return (
    /^\d|[0-9]{2,}|D\d{2}|DEB|BOND|MF\d*$|PF\d*$|GF\d*$|BF\d*$|SF\d*$|SY$|PO$/i.test(sym) ||
    (sym.endsWith('P') && sym.length >= 5) ||
    sym.includes('DEB') ||
    sym.includes('BOND') ||
    sym.includes('FUND')
  );
}

function parseBrokerInt(val) {
  if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
  const cleaned = String(val || '').replace(/\D/g, '').trim();
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Compresses raw daily floorsheet rows into compacted stock & broker summaries.
 * Enforces:
 * 1. Chronological sorting so open_price (11:00 AM) and close_price (3:00 PM) are exact.
 * 2. Strict Pure-Equity filter: Excludes Mutual Funds (NIBLPF), Debentures, Promoter shares.
 * 3. Strict Zero-Sum Conservation Law: sum(buy_vol) === sum(sell_vol) === total_volume.
 * 4. Automatic tick-level contract ingestion into floorsheet_contracts.
 */
export const ingestDailyFloorsheetTransaction = db.transaction((tradeDate, rawTrades) => {
  if (!tradeDate || !Array.isArray(rawTrades) || rawTrades.length === 0) return 0;

  // Sort chronologically (oldest contract first) so open_price (11:00 AM) and close_price (3:00 PM) are exact
  const chronologicalTrades = [...rawTrades].sort((a, b) => {
    const cA = String(a.contractId || a.contract_no || a.contractNo || '');
    const cB = String(b.contractId || b.contract_no || b.contractNo || '');
    return cA.localeCompare(cB, undefined, { numeric: true });
  });

  const stockAggMap = new Map();
  const seenContracts = new Set();
  const pureEquityTrades = [];

  for (const trade of chronologicalTrades) {
    const cid = String(trade.contractId || trade.contract_no || trade.contractNo || '').trim();
    if (cid) {
      if (seenContracts.has(cid)) continue;
      seenContracts.add(cid);
    }

    const symbol = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || '')
      .toUpperCase()
      .trim();

    // Pure-Equity Guard: Exclude Mutual Funds (NIBLPF), Debentures, and Promoter Shares
    if (!symbol || isNonEquityScrip(symbol)) continue;

    const qty = Math.round(Number(trade.contractQuantity || trade.quantity || trade.qty || trade.kitta || 0));
    const rate = Number(trade.contractRate || trade.rate || trade.price || 0);
    const amt = Number(trade.contractAmount || trade.amount || qty * rate);
    const buyer = parseBrokerInt(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer_broker ?? trade.buyer);
    const seller = parseBrokerInt(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller_broker ?? trade.seller);

    if (qty <= 0 || (!buyer && !seller)) continue;
    pureEquityTrades.push(trade);

    let s = stockAggMap.get(symbol);
    if (!s) {
      const initialRate = rate > 0 ? rate : amt > 0 ? amt / qty : 100;
      s = {
        open: initialRate,
        high: initialRate,
        low: initialRate,
        close: initialRate,
        buyVolSum: 0,
        sellVolSum: 0,
        buyAmtSum: 0,
        sellAmtSum: 0,
        brokers: new Map(),
      };
      stockAggMap.set(symbol, s);
    }

    const currentRate = rate > 0 ? rate : amt > 0 ? amt / qty : s.close;
    if (currentRate > 0) {
      if (currentRate > s.high) s.high = currentRate;
      if (currentRate < s.low || s.low <= 0) s.low = currentRate;
      s.close = currentRate;
    }

    if (buyer > 0) {
      const b = s.brokers.get(buyer) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };
      b.buyVol += qty;
      b.buyAmt += amt;
      s.brokers.set(buyer, b);
      s.buyVolSum += qty;
      s.buyAmtSum += amt;
    }

    if (seller > 0) {
      const b = s.brokers.get(seller) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };
      b.sellVol += qty;
      b.sellAmt += amt;
      s.brokers.set(seller, b);
      s.sellVolSum += qty;
      s.sellAmtSum += amt;
    }
  }

  const upsertStock = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, symbol) DO UPDATE SET
      open_price = excluded.open_price,
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
  for (const [symbol, data] of stockAggMap.entries()) {
    // Enforce strict Zero-Sum Conservation Law: sum(buy_vol) === sum(sell_vol) === total_volume
    if (data.buyVolSum !== data.sellVolSum) {
      const resBroker = data.brokers.get(999) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };
      if (data.buyVolSum > data.sellVolSum) {
        resBroker.sellVol += data.buyVolSum - data.sellVolSum;
        resBroker.sellAmt += Math.max(0, data.buyAmtSum - data.sellAmtSum);
        data.sellVolSum = data.buyVolSum;
        data.sellAmtSum = Math.max(data.buyAmtSum, data.sellAmtSum);
      } else {
        resBroker.buyVol += data.sellVolSum - data.buyVolSum;
        resBroker.buyAmt += Math.max(0, data.sellAmtSum - data.buyAmtSum);
        data.buyVolSum = data.sellVolSum;
        data.buyAmtSum = Math.max(data.buyAmtSum, data.sellAmtSum);
      }
      data.brokers.set(999, resBroker);
    }

    const conservedVolume = data.buyVolSum;
    const conservedTurnover = Number(data.buyAmtSum.toFixed(2));

    upsertStock.run(tradeDate, symbol, data.open, data.high, data.low, data.close, conservedVolume, conservedTurnover);
    count++;
    for (const [brokerId, bData] of data.brokers.entries()) {
      upsertBroker.run(tradeDate, symbol, brokerId, bData.buyVol, bData.sellVol, bData.buyAmt, bData.sellAmt);
    }
  }

  // Also persist tick-level contracts (for latest 5 sessions) to power Floorsheet Hub & 5D Volume Profile (POC)
  try {
    ingestFloorsheetContractsTransaction(tradeDate, pureEquityTrades);
  } catch (contractErr) {
    console.warn(`[ledgerStore] Tick contract ingestion notice for ${tradeDate}:`, contractErr.message);
  }

  // Prune records older than 40 trading days
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

  db.prepare(`
    DELETE FROM floorsheet_contracts
    WHERE trade_date NOT IN (
      SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 40
    )
  `).run();

  return count;
});

/**
 * Ingests tick-level floorsheet contracts into floorsheet_contracts with date-bounded Tick-Test Aggressor inference
 */
export const ingestFloorsheetContractsTransaction = db.transaction((tradeDate, rawTrades) => {
  if (!tradeDate || !Array.isArray(rawTrades) || rawTrades.length === 0) return 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO floorsheet_contracts
    (contract_no, symbol, trade_date, trade_time, buyer_broker, seller_broker, kitta, rate, amount, aggressor_side, is_internal_cross, is_whale_print)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bySymbol = new Map();
  for (const t of rawTrades) {
    const sym = String(t.stockSymbol || t.contractSymbol || t.symbol || "").toUpperCase().trim();
    if (!sym) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push(t);
  }

  let count = 0;
  for (const [sym, trades] of bySymbol.entries()) {
    // Sort chronologically by date, then time, then contract number ascending
    trades.sort((a, b) => {
      const dA = String(a.businessDate || a.tradeDate || a.trade_date || tradeDate);
      const dB = String(b.businessDate || b.tradeDate || b.trade_date || tradeDate);
      if (dA !== dB) return dA.localeCompare(dB);
      const cA = String(a.contractId || a.contract_no || a.contractNo || "");
      const cB = String(b.contractId || b.contract_no || b.contractNo || "");
      return cA.localeCompare(cB, undefined, { numeric: true });
    });

    let prevDate = null;
    let prevRate = null;
    let lastDir = "NEUTRAL";

    for (const t of trades) {
      const cid = String(t.contractId || t.contract_no || t.contractNo || `FS-${tradeDate}-${sym}-${count + 1}`);
      const date = String(t.businessDate || t.tradeDate || t.trade_date || tradeDate);
      const time = String(t.tradeTime || t.trade_time || "");
      const buyer = Number(t.buyerMemberId || t.buyerBroker || t.buyer_broker || t.buyer || 0);
      const seller = Number(t.sellerMemberId || t.sellerBroker || t.seller_broker || t.seller || 0);
      const qty = Number(t.contractQuantity || t.quantity || t.qty || t.kitta || 0);
      const rate = Number(t.contractRate || t.rate || t.price || 0);
      const amt = Number(t.contractAmount || t.amount || qty * rate);

      if (qty <= 0) continue;

      // Reset tick-test state at session date boundaries
      if (date !== prevDate) {
        prevDate = date;
        prevRate = null;
        lastDir = "NEUTRAL";
      }

      let dir = lastDir;
      if (t.aggressor || t.aggressor_side) {
        dir = String(t.aggressor || t.aggressor_side).toUpperCase();
        lastDir = dir;
      } else if (prevRate !== null && rate > 0) {
        if (rate > prevRate) {
          dir = "BUY";
          lastDir = "BUY";
        } else if (rate < prevRate) {
          dir = "SELL";
          lastDir = "SELL";
        }
      }
      if (rate > 0) prevRate = rate;

      const isInternal = buyer > 0 && buyer === seller ? 1 : 0;
      const isWhale = qty >= 500 || amt >= 500000 ? 1 : 0;

      insert.run(cid, sym, date, time, buyer, seller, qty, rate, amt, dir, isInternal, isWhale);
      count++;
    }
  }

  return count;
});

/**
 * Retrieves 5D volume profile nodes and Point of Control (POC) scoped to the scrip's own last 5 trading dates
 */
export function getScripVolumeProfile(symbol) {
  if (!symbol) return { pocPrice: null, nodes: [] };
  const cleanSym = String(symbol).toUpperCase().trim();
  try {
    const rows = db.prepare(`
      WITH scrip_dates AS (
        SELECT DISTINCT trade_date
        FROM floorsheet_contracts
        WHERE UPPER(symbol) = @symbol
        ORDER BY trade_date DESC
        LIMIT 5
      )
      SELECT
        ROUND(f.rate, 0) AS priceBucket,
        SUM(f.kitta) AS totalKitta,
        SUM(CASE WHEN f.aggressor_side = 'BUY' THEN f.kitta ELSE 0 END) AS buyKitta,
        SUM(CASE WHEN f.aggressor_side = 'SELL' THEN f.kitta ELSE 0 END) AS sellKitta,
        SUM(CASE WHEN f.is_internal_cross = 1 THEN f.kitta ELSE 0 END) AS internalCrossKitta,
        COUNT(*) AS contractCount
      FROM floorsheet_contracts f
      INNER JOIN scrip_dates d ON f.trade_date = d.trade_date
      WHERE UPPER(f.symbol) = @symbol
      GROUP BY ROUND(f.rate, 0)
      ORDER BY priceBucket DESC
    `).all({ symbol: cleanSym });

    let maxKitta = 0;
    let pocPrice = null;
    let grandTotalKitta = 0;

    for (const r of rows) {
      grandTotalKitta += r.totalKitta;
      if (r.totalKitta > maxKitta) {
        maxKitta = r.totalKitta;
        pocPrice = r.priceBucket;
      }
    }

    const nodes = rows.map(r => ({
      priceBucket: r.priceBucket,
      totalKitta: r.totalKitta,
      buyKitta: r.buyKitta,
      sellKitta: r.sellKitta,
      internalCrossKitta: r.internalCrossKitta,
      pctOfTotalVolume:
        grandTotalKitta > 0 ? Number(((r.totalKitta / grandTotalKitta) * 100).toFixed(1)) : 0,
      isPoc: r.priceBucket === pocPrice,
    }));

    return { pocPrice, nodes };
  } catch (err) {
    console.warn(`[ledgerStore] getScripVolumeProfile error for ${cleanSym}:`, err.message);
    return { pocPrice: null, nodes: [] };
  }
}

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
        try {
          db.exec(`ATTACH DATABASE '${normalizedTempPath}' AS seed_db;`);
          db.exec(`INSERT OR REPLACE INTO daily_stock_summary SELECT * FROM seed_db.daily_stock_summary;`);
          db.exec(`INSERT OR REPLACE INTO daily_broker_ledger SELECT * FROM seed_db.daily_broker_ledger;`);
        } finally {
          try { db.exec(`DETACH DATABASE seed_db;`); } catch (_) {}
          try { fs.unlinkSync(tempDbPath); } catch (_) {}
        }
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

  // 3. Precompute 1D, 3D, 5D, 15D, and 30D for every symbol and store in RAM
  const timeframes = [1, 3, 5, 15, 30];
  const nextRadar = { 1: [], 3: [], 5: [], 15: [], 30: [] };
  const nextDiagnostics = new Map();
  const earlyIgnitionList = [];

  for (const [symbol, dailyHistory] of historyBySymbol.entries()) {
    let diag3 = null;
    let diag30 = null;

    for (const days of timeframes) {
      const diag = calculateMultiDayDiagnostics(dailyHistory, days);
      if (diag) {
        if (days === 3) diag3 = diag;
        if (days === 30) diag30 = diag;

        const smInfo = stockMap[symbol] || {};
        const companyName = smInfo.name || symbol;
        const sector = smInfo.sector || 'Others';

        // Store lightweight broker summary (stripping per-broker dailySeries tape arrays to keep V8 heap < 100MB on Render Free Tier)
        const compactBrokers = Array.isArray(diag.allBrokers)
          ? diag.allBrokers.map(({ dailySeries, ...b }) => b)
          : [];
        const { allBrokers: _stripped, ...compactDiag } = diag;
        const payload = { symbol, companyName, sector, ...compactDiag, allBrokers: compactBrokers };
        nextDiagnostics.set(`${symbol}_${days}`, payload);

        // Comprehensive yet lightweight version for full-market Radar list & Broker Tracker:
        const radarSummary = {
          symbol,
          companyName,
          sector,
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

    // Evaluate 3-Day Early Ignition & Manipulation Detection for this symbol
    if (diag3) {
      try {
        const ignition = evaluateEarlyIgnition(symbol, diag3, diag30, dailyHistory);
        if (ignition) earlyIgnitionList.push(ignition);
      } catch (_) {}
    }
  }

  const stockCount = historyBySymbol.size;
  // Release intermediate raw structures to reclaim memory immediately
  historyBySymbol.clear();
  brokerGroup.clear();

  HOT_CACHE.lastUpdatedDate = dates[0];
  HOT_CACHE.radarByTimeframe = nextRadar;
  HOT_CACHE.stockDiagnostics = nextDiagnostics;
  HOT_CACHE.earlyIgnition = earlyIgnitionList.sort((a, b) => b.ignitionScore - a.ignitionScore);

  console.log(
    `[Drabyashree Cache] Rebuilt 1D/3D/5D/15D/30D hot cache for ${stockCount} stocks (${earlyIgnitionList.length} early ignition records) in ${Date.now() - startTime}ms (Session: ${dates[0]})`
  );

  // 4. Rebuild Algorithmic Signal Track Record walk-forward audit
  try {
    rebuildSignalTrackRecord(db, HOT_CACHE);
  } catch (sigErr) {
    console.warn("[Drabyashree Cache] Signal track record rebuild warning:", sigErr.message);
  }

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
  const target = Math.max(1, Number(backfillStatusState.targetTradingDays || targetTradingDays) || 30);
  return {
    success: true,
    loadedTradingDays: dates.length,
    targetTradingDays: target,
    dates,
    isBackfilling: backfillStatusState.isBackfilling,
    currentBackfillingDate: backfillStatusState.currentBackfillingDate,
    progressPct: Math.min(100, Math.max(0, Math.round((dates.length / target) * 100))),
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

export function getSmartMoneyAggregatedFlow(symbol, sessionLimit = 5) {
  try {
    const cleanSym = String(symbol || '').trim().toUpperCase();
    if (!cleanSym) return [];
    const limit = Math.max(1, parseInt(sessionLimit, 10) || 1);
    const rows = db.prepare(`
      WITH recent_dates AS (
        SELECT DISTINCT trade_date
        FROM daily_broker_ledger
        WHERE symbol = @symbol
        ORDER BY trade_date DESC
        LIMIT @sessionLimit
      )
      SELECT
        b.broker_id AS brokerId,
        SUM(b.buy_vol) AS buyVolume,
        SUM(b.sell_vol) AS sellVolume,
        0 AS buyTrades,
        0 AS sellTrades,
        SUM(b.buy_amt) AS buyAmount,
        SUM(b.sell_amt) AS sellAmount
      FROM daily_broker_ledger b
      INNER JOIN recent_dates r ON b.trade_date = r.trade_date
      WHERE b.symbol = @symbol
      GROUP BY b.broker_id
      ORDER BY (SUM(b.buy_vol) - SUM(b.sell_vol)) DESC
    `).all({ symbol: cleanSym, sessionLimit: limit });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(`[ledgerStore] getSmartMoneyAggregatedFlow error for ${symbol}:`, err.message);
    return [];
  }
}

export function getScripLedgerTelemetry(rawSymbol) {
  const symbol = String(rawSymbol || '').trim().toUpperCase();
  if (!symbol) return { ledgerRow: null, candles: [] };

  let ledgerRow = null;
  try {
    const row = db.prepare(`
      SELECT
        symbol,
        strategy AS strategy_name,
        COALESCE(entry_vwap, broker_vwap, entry_price) AS entry_vwap,
        COALESCE(settlement_unlock_date, t2_unlock_date) AS settlement_unlock_date,
        COALESCE(mfe_pct, max_gain_pct, 0) AS mfe_pct,
        COALESCE(mae_pct, 0) AS mae_pct,
        COALESCE(nepse_alpha_pct, 0) AS nepse_alpha_pct,
        COALESCE(broker_anomaly_score, 1.0) AS broker_anomaly_score,
        COALESCE(avg_ticket_kitta, 0) AS avg_ticket_kitta,
        is_ratchet_armed AS ratchet_triggered,
        status
      FROM algorithmic_signal_ledger
      WHERE UPPER(symbol) = ?
      ORDER BY signal_date DESC
      LIMIT 1
    `).get(symbol);
    ledgerRow = row || null;
  } catch (err) {
    ledgerRow = null;
  }

  let candles = [];
  try {
    candles = db.prepare(`
      SELECT
        trade_date AS date,
        open_price AS open,
        high_price AS high,
        low_price AS low,
        close_price AS close,
        total_volume AS volume,
        CASE WHEN total_volume > 0 THEN (total_turnover / total_volume) ELSE close_price END AS vwap
      FROM daily_stock_summary
      WHERE UPPER(symbol) = ?
      ORDER BY trade_date DESC
      LIMIT 30
    `).all(symbol) || [];
  } catch (err) {
    candles = [];
  }

  return { ledgerRow, candles };
}

/**
 * Retrieves raw floorsheet contracts for a symbol (newest first)
 */
export function getScripFloorsheet(symbol, limit = 500, options = {}) {
  if (!symbol) return Object.assign([], { rows: [], availableDates: [], totalCount: 0 });
  const cleanSym = String(symbol).toUpperCase().trim();
  const date = typeof options === 'string' ? options : options.date || null;
  const days = Math.max(1, parseInt(options.days || 30, 10));
  const fromDate = options.fromDate || null;
  const toDate = options.toDate || null;

  try {
    const symbolDates = db.prepare(`
      SELECT DISTINCT trade_date
      FROM floorsheet_contracts
      WHERE UPPER(symbol) = ?
      ORDER BY trade_date DESC
      LIMIT 30
    `).all(cleanSym).map(r => r.trade_date);

    const globalDates = getStoredDates(30);
    const availableDates = Array.from(new Set([...symbolDates, ...globalDates]))
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))
      .slice(0, 30);

    let sql = `
      SELECT
        contract_no AS contractNo,
        symbol,
        trade_date AS tradeDate,
        trade_time AS tradeTime,
        buyer_broker AS buyerBroker,
        seller_broker AS sellerBroker,
        kitta,
        rate,
        amount,
        aggressor_side AS aggressor,
        is_internal_cross AS isInternalCross,
        is_whale_print AS isWhalePrint
      FROM floorsheet_contracts
      WHERE UPPER(symbol) = ?
    `;
    const params = [cleanSym];

    if (date) {
      sql += ` AND trade_date = ?`;
      params.push(date);
    } else if (fromDate && toDate) {
      sql += ` AND trade_date >= ? AND trade_date <= ?`;
      params.push(fromDate, toDate);
    } else if (days && days < 40 && availableDates.length > 0) {
      const targetDates = availableDates.slice(0, days);
      const oldestTarget = targetDates[targetDates.length - 1];
      sql += ` AND trade_date >= ?`;
      params.push(oldestTarget);
    }

    sql += ` ORDER BY trade_date DESC, trade_time DESC, contract_no DESC LIMIT ?`;
    params.push(Number(limit) || 500);

    const rows = db.prepare(sql).all(...params).map(r => ({
      ...r,
      isInternalCross: Boolean(r.isInternalCross),
      isWhalePrint: Boolean(r.isWhalePrint),
    }));

    return Object.assign(rows, {
      rows,
      availableDates,
      totalCount: rows.length
    });
  } catch (err) {
    console.warn(`[ledgerStore] getScripFloorsheet error for ${cleanSym}:`, err.message);
    return Object.assign([], { rows: [], availableDates: [], totalCount: 0 });
  }
}

/**
 * Reconstructs Level-2 Market Depth from SQLite Floorsheet Volume-at-Price (VAP) clusters
 */
export function reconstructMarketDepthFromFloorsheet(symbol, verifiedPrice = null) {
  if (!symbol) return null;
  const cleanSym = String(symbol).toUpperCase().trim();

  try {
    let refPrice = verifiedPrice;
    if (!refPrice || refPrice <= 0) {
      const latestSummary = db.prepare(`
        SELECT close_price FROM daily_stock_summary
        WHERE UPPER(symbol) = ?
        ORDER BY trade_date DESC LIMIT 1
      `).get(cleanSym);
      refPrice = latestSummary?.close_price || 0;
    }

    const contracts = getScripFloorsheet(cleanSym, 200);
    if (!contracts || contracts.length === 0) return null;

    if (!refPrice || refPrice <= 0) {
      refPrice = contracts[0]?.rate || 0;
    }

    const levelMap = new Map();
    for (const c of contracts) {
      if (c.rate <= 0 || c.kitta <= 0) continue;
      const lvl = Number(c.rate.toFixed(1));
      const cur = levelMap.get(lvl) || { kitta: 0, orders: 0 };
      cur.kitta += c.kitta;
      cur.orders += 1;
      levelMap.set(lvl, cur);
    }

    const allLevels = Array.from(levelMap.entries()).map(([price, v]) => ({
      price,
      quantity: v.kitta,
      qty: v.kitta,
      kitta: v.kitta,
      orders: v.orders,
      isSyntheticVap: true,
    }));

    const bids = allLevels.filter(l => l.price <= refPrice).sort((a, b) => b.price - a.price).slice(0, 5);
    const asks = allLevels.filter(l => l.price > refPrice).sort((a, b) => a.price - b.price).slice(0, 5);

    const totalBidQty = bids.reduce((s, b) => s + b.quantity, 0);
    const totalAskQty = asks.reduce((s, a) => s + a.quantity, 0);
    const obir = (totalBidQty + totalAskQty) > 0
      ? Number(((totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)).toFixed(4))
      : 0;

    const topBid = bids[0]?.price || 0;
    const topAsk = asks[0]?.price || 0;
    const spread = topAsk > 0 && topBid > 0 ? Number(Math.max(0, topAsk - topBid).toFixed(2)) : 0;
    const spreadPct = topBid > 0 && spread > 0 ? Number(((spread / topBid) * 100).toFixed(2)) : 0;

    return {
      symbol: cleanSym,
      ltp: refPrice,
      bids,
      asks,
      totalBidQty,
      totalAskQty,
      obir,
      spread,
      spreadPct,
      isOffMarket: true,
      sessionLabel: 'Floorsheet Volume-at-Price (VAP) Liquidity Walls (L2 Feed Closed)',
      demandStatus: obir > 0.08 ? 'Demand Heavy' : obir < -0.08 ? 'Supply Heavy' : 'Balanced Flow',
      source: 'floorsheet_vap_depth',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[ledgerStore] reconstructMarketDepthFromFloorsheet error for ${cleanSym}:`, err.message);
    return null;
  }
}

// Auto-seed floorsheet_contracts if table is currently empty
try {
  const fsContractsCount = db.prepare(`SELECT COUNT(*) as c FROM floorsheet_contracts`).get()?.c || 0;
  if (fsContractsCount === 0) {
    let candidateFiles = ['floorsheet-full-2026-10-16.json', 'floorsheet-full-2026-10-15.json'];
    try {
      const discovered = fs.readdirSync(DATA_DIR).filter(f => /^floorsheet-full-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
      if (discovered.length > 0) candidateFiles = discovered;
    } catch (_) {}
    for (const f of candidateFiles.slice(0, 30)) {
      const p = path.join(DATA_DIR, f);
      if (fs.existsSync(p)) {
        try {
          const match = f.match(/floorsheet-full-(\d{4}-\d{2}-\d{2})\.json/);
          const dt = match ? match[1] : '2026-10-16';
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(raw) && raw.length > 0) {
            const ingested = ingestFloorsheetContractsTransaction(dt, raw);
            console.log(`[Drabyashree Ledger] Auto-bootstrapped ${ingested} contracts for ${dt} from ${f}`);
          }
        } catch (e) {
          console.warn(`[Drabyashree Ledger] Startup bootstrap error for ${f}:`, e.message);
        }
      }
    }
  }
} catch (_) {}


/**
 * Evaluates regulatory and fundamental hard vetoes for a given scrip:
 * 1. Promoter Lock-In Cliff: Expiry in < 120 days
 * 2. BFI Banking Health: NPL >= 5.0% or CAR < 11.0%
 * 3. Hydropower Capex: Capex > Rs. 20 Cr/MW
 */
function evaluateRegulatoryVetoes(symbol, fundamentals = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const vetoes = [];

  // 1. Promoter Lock-In Cliff (< 120 days)
  const lockInDays = fundamentals.lockInDays ?? fundamentals.daysRemaining ?? null;
  if (lockInDays !== null && lockInDays > 0 && lockInDays < 120) {
    vetoes.push(`HARD VETO: Promoter lock-in expires in ${lockInDays} days (< 120d statutory supply flood cliff)`);
  }

  // 2. BFI Banking Health (NPL >= 5.0%, CAR < 11.0%)
  const npl = Number(fundamentals.npl || fundamentals.nplPct || 0);
  const car = Number(fundamentals.car || fundamentals.carPct || 0);
  if (npl >= 5.0) {
    vetoes.push(`HARD VETO: Non-Performing Loans (NPL) at ${npl.toFixed(2)}% (>= 5.0% regulatory ceiling)`);
  }
  if (car > 0 && car < 11.0) {
    vetoes.push(`HARD VETO: Capital Adequacy Ratio (CAR) at ${car.toFixed(2)}% (< 11.0% NRB Class A requirement)`);
  }

  // 3. Hydropower Capex (> Rs. 20 Cr/MW)
  const capexPerMw = Number(fundamentals.capexPerMw || fundamentals.costPerMw || 0);
  if (capexPerMw > 20) {
    vetoes.push(`HARD VETO: Hydropower Capex at Rs. ${capexPerMw.toFixed(2)} Cr/MW (> Rs. 20 Cr/MW ceiling)`);
  }

  return {
    symbol: sym,
    hasVeto: vetoes.length > 0,
    vetoes,
    status: vetoes.length > 0 ? 'VETOED' : 'CLEAR'
  };
}

export {
  rebuildSignalTrackRecord,
  initSignalLedgerTable,
  ensureUpgradedLedgerSchema,
  calculateNepseNetReturn,
  evaluateBrokerSmartMoney,
  evaluateRegulatoryVetoes,
  isNonEquityScrip,
};

