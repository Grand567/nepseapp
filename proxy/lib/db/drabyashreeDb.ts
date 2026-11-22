// src/lib/db/drabyashreeDb.ts
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import {
  safeNum,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
  type BrokerSmartMoney5DSummary,
} from "@/services/aiGuru/runAiQuantitativeAssessment";

const globalForSqlite = globalThis as unknown as {
  drabyashreeDb?: Database.Database;
};

export function getDrabyashreeDb(): Database.Database {
  if (!globalForSqlite.drabyashreeDb) {
    const envDataDir = process.env.NEPSE_DATA_DIR || process.env.RENDER_DISK_PATH;
    const envDirPath = envDataDir ? path.join(envDataDir, "drabyashree_ledger.db") : null;
    const defaultProxyPath = path.join(process.cwd(), "proxy", "data", "drabyashree_ledger.db");
    const defaultRootPath = path.join(process.cwd(), "drabyashree_ledger.db");
    const dbPath =
      process.env.DRABYASHREE_DB_PATH ||
      (envDirPath && fs.existsSync(envDataDir!) ? envDirPath : null) ||
      (fs.existsSync(defaultProxyPath) ? defaultProxyPath : defaultRootPath);

    const db = new Database(dbPath, { fileMustExist: false, timeout: 10000 });
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 10000");
    db.pragma("foreign_keys = ON");
    globalForSqlite.drabyashreeDb = db;
  }
  return globalForSqlite.drabyashreeDb;
}

function getTableColumns(db: Database.Database, table: string): Set<string> {
  try {
    return new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
    );
  } catch {
    return new Set();
  }
}

function buildSignalSelectSql(db: Database.Database, signalTable: string): string {
  const cols = getTableColumns(db, signalTable);
  const pick = (candidates: string[], fallback: string) => {
    const existing = candidates.filter((c) => cols.has(c));
    if (existing.length === 0) return fallback;
    return existing.length === 1 ? existing[0] : `COALESCE(${existing.join(", ")}, ${fallback})`;
  };
  return `SELECT
    symbol,
    ${pick(["strategy_name", "strategy", "signal_type"], "'UNKNOWN'")} AS strategy_name,
    ${pick(["entry_vwap", "broker_vwap", "entry_price"], "0")} AS entry_vwap,
    ${pick(["settlement_unlock_date", "t2_unlock_date"], "'POST_DASHAIN_T2'")} AS settlement_unlock_date,
    ${pick(["mfe_pct", "max_gain_pct"], "0")} AS mfe_pct,
    ${pick(["mae_pct"], "0")} AS mae_pct,
    ${pick(["nepse_alpha_pct"], "0")} AS nepse_alpha_pct,
    ${pick(["broker_anomaly_score"], "1.0")} AS broker_anomaly_score,
    ${pick(["avg_ticket_kitta"], "0")} AS avg_ticket_kitta,
    ${pick(["ratchet_triggered", "is_ratchet_armed"], "0")} AS ratchet_triggered,
    status
  FROM ${signalTable}
  WHERE UPPER(symbol) = ?
  ORDER BY ${cols.has("signal_date") ? "signal_date DESC, rowid DESC" : "rowid DESC"}
  LIMIT 1`;
}

function tableExists(db: Database.Database, name: string): boolean {
  try {
    const row = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name = ? LIMIT 1`
      )
      .get(name);
    return Boolean(row);
  } catch {
    return false;
  }
}

export { normalize5DBrokerPayloadForAi } from "@/services/aiGuru/runAiQuantitativeAssessment";

export function getLatestSignalTelemetryForSymbol(rawSymbol: string): LedgerTelemetryRow | null {
  const db = getDrabyashreeDb();
  const symbol = rawSymbol.trim().toUpperCase();
  const signalTable = tableExists(db, "signal_ledger")
    ? "signal_ledger"
    : tableExists(db, "algorithmic_signal_ledger")
    ? "algorithmic_signal_ledger"
    : null;

  if (!signalTable) return null;
  try {
    return (
      (db.prepare(buildSignalSelectSql(db, signalTable)).get(symbol) as LedgerTelemetryRow) || null
    );
  } catch {
    return null;
  }
}

export function get5DBrokerSummaryForSymbol(rawSymbol: string): unknown {
  const db = getDrabyashreeDb();
  const symbol = rawSymbol.trim().toUpperCase();
  if (tableExists(db, "floorsheet_broker_summary")) {
    try {
      return db
        .prepare(
          `SELECT
            broker_no AS brokerId,
            SUM(buy_kitta) AS buyKitta,
            SUM(sell_kitta) AS sellKitta,
            SUM(buy_kitta - sell_kitta) AS netKitta,
            COUNT(*) AS trades,
            AVG(broker_anomaly_score) AS anomalyScore,
            AVG(avg_ticket_kitta) AS avgTicketKitta
          FROM floorsheet_broker_summary
          WHERE UPPER(symbol) = ?
            AND trade_date IN (
              SELECT DISTINCT trade_date
              FROM floorsheet_broker_summary
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 5
            )
          GROUP BY broker_no`
        )
        .all(symbol, symbol);
    } catch {
      return null;
    }
  } else if (tableExists(db, "daily_broker_ledger")) {
    try {
      return db
        .prepare(
          `SELECT
            broker_id AS brokerId,
            SUM(buy_vol) AS buyKitta,
            SUM(sell_vol) AS sellKitta,
            SUM(buy_vol - sell_vol) AS netKitta,
            COUNT(*) AS trades,
            1.0 AS anomalyScore,
            AVG(buy_vol + sell_vol) AS avgTicketKitta
          FROM daily_broker_ledger
          WHERE UPPER(symbol) = ?
            AND trade_date IN (
              SELECT DISTINCT trade_date
              FROM daily_broker_ledger
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 5
            )
          GROUP BY broker_id`
        )
        .all(symbol, symbol);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fetches SQLite telemetry with holiday-safe 5-session floor-sheet query (Hardened Patch B)
 */
export function loadScripBundleFromDb(rawSymbol: string): {
  quote: RawQuotePayload | null;
  candles: HistoricalCandle[];
  ledgerTelemetry: LedgerTelemetryRow | null;
  broker5DRawPayload: unknown;
} {
  const db = getDrabyashreeDb();
  const symbol = rawSymbol.trim().toUpperCase();

  let quote: RawQuotePayload | null = null;
  let candles: HistoricalCandle[] = [];
  let ledgerTelemetry: LedgerTelemetryRow | null = null;
  let broker5DRawPayload: unknown = null;

  const signalTable = tableExists(db, "signal_ledger")
    ? "signal_ledger"
    : tableExists(db, "algorithmic_signal_ledger")
    ? "algorithmic_signal_ledger"
    : null;

  if (signalTable) {
    try {
      ledgerTelemetry =
        (db.prepare(buildSignalSelectSql(db, signalTable)).get(symbol) as LedgerTelemetryRow) || null;
    } catch {
      ledgerTelemetry = null;
    }
  }

  const candleTable = tableExists(db, "daily_stock_summary")
    ? "daily_stock_summary"
    : tableExists(db, "daily_price_history")
    ? "daily_price_history"
    : tableExists(db, "market_candles")
    ? "market_candles"
    : null;

  if (candleTable) {
    try {
      const cCols = getTableColumns(db, candleTable);
      const dCol = cCols.has("trade_date") ? "trade_date" : "date";
      const oCol = cCols.has("open_price") ? "open_price" : "open";
      const hCol = cCols.has("high_price") ? "high_price" : "high";
      const lCol = cCols.has("low_price") ? "low_price" : "low";
      const clCol = cCols.has("close_price") ? "close_price" : "close";
      const vCol = cCols.has("total_volume") ? "total_volume" : "volume";
      const tCol = cCols.has("total_turnover") ? "total_turnover" : (cCols.has("turnover") ? "turnover" : null);
      const vwapExpr = tCol
        ? `CASE WHEN COALESCE(${vCol}, 0) > 0 THEN (${tCol} / ${vCol}) ELSE COALESCE(${clCol}, 0) END`
        : (cCols.has("vwap") ? "COALESCE(vwap, " + clCol + ", 0)" : `COALESCE(${clCol}, 0)`);
      candles =
        (db
          .prepare(
            `SELECT
              ${dCol} AS date,
              ${oCol} AS open,
              ${hCol} AS high,
              ${lCol} AS low,
              ${clCol} AS close,
              ${vCol} AS volume,
              ${vwapExpr} AS vwap
            FROM ${candleTable}
            WHERE UPPER(symbol) = ?
            ORDER BY ${dCol} DESC
            LIMIT 35`
          )
          .all(symbol) as HistoricalCandle[]) || [];
    } catch {
      candles = [];
    }
  }

  if (tableExists(db, "market_quotes")) {
    try {
      quote =
        (db
          .prepare(
            `SELECT
              symbol,
              ltp,
              close AS todayClose,
              prev_close AS prevClose,
              volume,
              turnover
            FROM market_quotes
            WHERE UPPER(symbol) = ?
            LIMIT 1`
          )
          .get(symbol) as RawQuotePayload) || null;
    } catch {
      quote = null;
    }
  }

  if (!quote && candles.length > 0) {
    const latest = candles[0];
    const prev = candles[1];
    quote = {
      symbol,
      ltp: null,
      todayClose: latest?.close ?? null,
      prevClose: prev?.close ?? latest?.open ?? null,
      volume: latest?.volume ?? 0,
    };
  }

  if (tableExists(db, "floorsheet_broker_summary")) {
    try {
      broker5DRawPayload = db
        .prepare(
          `SELECT
            broker_no AS brokerId,
            SUM(buy_kitta) AS buyKitta,
            SUM(sell_kitta) AS sellKitta,
            SUM(buy_kitta - sell_kitta) AS netKitta,
            COUNT(*) AS trades,
            AVG(broker_anomaly_score) AS anomalyScore,
            AVG(avg_ticket_kitta) AS avgTicketKitta
          FROM floorsheet_broker_summary
          WHERE UPPER(symbol) = ?
            AND trade_date IN (
              SELECT DISTINCT trade_date
              FROM floorsheet_broker_summary
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 5
            )
          GROUP BY broker_no`
        )
        .all(symbol, symbol);
    } catch {
      broker5DRawPayload = null;
    }
  } else if (tableExists(db, "daily_broker_ledger")) {
    try {
      broker5DRawPayload = db
        .prepare(
          `SELECT
            broker_id AS brokerId,
            SUM(buy_vol) AS buyKitta,
            SUM(sell_vol) AS sellKitta,
            SUM(buy_vol - sell_vol) AS netKitta,
            COUNT(*) AS trades,
            1.0 AS anomalyScore,
            AVG(buy_vol + sell_vol) AS avgTicketKitta
          FROM daily_broker_ledger
          WHERE UPPER(symbol) = ?
            AND trade_date IN (
              SELECT DISTINCT trade_date
              FROM daily_broker_ledger
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 5
            )
          GROUP BY broker_id`
        )
        .all(symbol, symbol);
    } catch {
      broker5DRawPayload = null;
    }
  }

  return { quote, candles, ledgerTelemetry, broker5DRawPayload };
}
