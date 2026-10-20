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
} from "../../services/aiGuru/runAiQuantitativeAssessment";

const globalForSqlite = globalThis as unknown as {
  drabyashreeDb?: Database.Database;
};

export function getDrabyashreeDb(): Database.Database {
  if (!globalForSqlite.drabyashreeDb) {
    const defaultProxyPath = path.join(process.cwd(), "proxy", "data", "drabyashree_ledger.db");
    const defaultRootPath = path.join(process.cwd(), "drabyashree_ledger.db");
    const dbPath =
      process.env.DRABYASHREE_DB_PATH ||
      (fs.existsSync(defaultProxyPath) ? defaultProxyPath : defaultRootPath);

    const db = new Database(dbPath, { fileMustExist: false });
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    globalForSqlite.drabyashreeDb = db;
  }
  return globalForSqlite.drabyashreeDb;
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

export { normalize5DBrokerPayloadForAi } from "../../services/aiGuru/runAiQuantitativeAssessment";

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
        (db
          .prepare(
            `SELECT
              symbol,
              COALESCE(strategy_name, strategy) AS strategy_name,
              COALESCE(entry_vwap, broker_vwap, entry_price, 0) AS entry_vwap,
              COALESCE(settlement_unlock_date, t2_unlock_date, 'POST_DASHAIN_T2') AS settlement_unlock_date,
              COALESCE(mfe_pct, max_gain_pct, 0) AS mfe_pct,
              COALESCE(mae_pct, 0) AS mae_pct,
              COALESCE(nepse_alpha_pct, 0) AS nepse_alpha_pct,
              COALESCE(broker_anomaly_score, 1.0) AS broker_anomaly_score,
              COALESCE(avg_ticket_kitta, 0) AS avg_ticket_kitta,
              COALESCE(ratchet_triggered, is_ratchet_armed, 0) AS ratchet_triggered,
              status
            FROM ${signalTable}
            WHERE UPPER(symbol) = ?
            ORDER BY rowid DESC
            LIMIT 1`
          )
          .get(symbol) as LedgerTelemetryRow) || null;
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
      candles =
        (db
          .prepare(
            `SELECT
              COALESCE(trade_date, date) AS date,
              COALESCE(open_price, open) AS open,
              COALESCE(high_price, high) AS high,
              COALESCE(low_price, low) AS low,
              COALESCE(close_price, close) AS close,
              COALESCE(total_volume, volume) AS volume,
              CASE
                WHEN COALESCE(total_volume, volume, 0) > 0
                THEN (COALESCE(total_turnover, turnover, 0) / COALESCE(total_volume, volume, 1))
                ELSE COALESCE(close_price, close, 0)
              END AS vwap
            FROM ${candleTable}
            WHERE UPPER(symbol) = ?
            ORDER BY COALESCE(trade_date, date) DESC
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
