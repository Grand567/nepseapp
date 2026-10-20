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

// Singleton connection across Next.js hot reloads and server invocations
const globalForSqlite = globalThis as unknown as {
  drabyashreeDb?: Database.Database;
};

export function getDrabyashreeDb(): Database.Database {
  if (!globalForSqlite.drabyashreeDb) {
    const defaultProxyPath = path.join(process.cwd(), "proxy", "data", "drabyashree_ledger.db");
    const defaultRootPath = path.join(process.cwd(), "drabyashree_ledger.db");
    const dbPath =
      process.env.DRABYASHREE_DB_PATH ||
      (fs.existsSync(defaultProxyPath)
        ? defaultProxyPath
        : defaultRootPath);

    const db = new Database(dbPath, { fileMustExist: false });
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    globalForSqlite.drabyashreeDb = db;
  }
  return globalForSqlite.drabyashreeDb;
}

/**
 * Safely checks whether a table or view exists in SQLite before querying
 */
export function tableExists(db: Database.Database, name: string): boolean {
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

/**
 * Normalizes multi-shape 5D Broker payloads (matching Bug #3 fix) into AI Guru's summary format
 */
export function normalize5DBrokerPayloadForAi(rawPayload: unknown): BrokerSmartMoney5DSummary {
  const empty: BrokerSmartMoney5DSummary = {
    netAccumulationRatio: 50,
    topAccumulators: [],
    topDistributors: [],
    dominantRegime: "NEUTRAL",
  };

  if (!rawPayload || typeof rawPayload !== "object") return empty;
  const obj = rawPayload as Record<string, unknown>;

  // Extract array from any known shape: 5D, 5d, brokers, data, or direct array
  const candidateArray = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(obj["5D"])
    ? (obj["5D"] as unknown[])
    : Array.isArray(obj["5d"])
    ? (obj["5d"] as unknown[])
    : Array.isArray(obj.brokers)
    ? (obj.brokers as unknown[])
    : Array.isArray(obj.data)
    ? (obj.data as unknown[])
    : [];

  if (candidateArray.length === 0) return empty;

  // Retail-giant baseline share lookup (e.g., Broker #58 Naasa, #45, #49)
  const RETAIL_GIANT_BASELINE: Record<string, number> = {
    "58": 0.085,
    "45": 0.042,
    "49": 0.038,
    "34": 0.032,
  };

  let totalBuyKitta = 0;
  let totalSellKitta = 0;

  const normalizedRows = candidateArray.map((rawItem: unknown) => {
    const item = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const brokerId = String(item.brokerId ?? item.broker_no ?? item.broker ?? item.broker_id ?? "0").replace(/^0+/, "");
    const buyKitta = safeNum(item.buyKitta ?? item.buy_kitta ?? item.buyVolume ?? item.buy_vol, 0);
    const sellKitta = safeNum(item.sellKitta ?? item.sell_kitta ?? item.sellVolume ?? item.sell_vol, 0);
    const netKitta = safeNum(item.netKitta ?? item.net_kitta, buyKitta - sellKitta);
    const tradeCount = Math.max(1, safeNum(item.trades ?? item.trade_count ?? item.totalTrades, 1));
    const avgTicketKitta = safeNum(
      item.avgTicketKitta ?? item.avg_ticket_kitta,
      (buyKitta + sellKitta) / tradeCount
    );

    totalBuyKitta += buyKitta;
    totalSellKitta += sellKitta;

    // Use precomputed anomaly score or compute baseline-deflated score
    const baselineShare = RETAIL_GIANT_BASELINE[brokerId] ?? 0.018;
    const ticketMultiplier = avgTicketKitta >= 300 ? 1.35 : avgTicketKitta < 45 ? 0.65 : 1.0;
    const rawAnomaly = safeNum(
      item.anomalyScore ?? item.broker_anomaly_score,
      (1 / (baselineShare * 50)) * ticketMultiplier
    );

    return {
      brokerId,
      netKitta,
      anomalyScore: Number(Math.max(0.1, rawAnomaly).toFixed(2)),
      avgTicketKitta: Math.round(avgTicketKitta),
    };
  });

  const topAccumulators = normalizedRows
    .filter((r) => r.netKitta > 0)
    .sort((a, b) => b.netKitta * b.anomalyScore - a.netKitta * a.anomalyScore)
    .slice(0, 5);

  const topDistributors = normalizedRows
    .filter((r) => r.netKitta < 0)
    .sort((a, b) => Math.abs(b.netKitta) - Math.abs(a.netKitta))
    .slice(0, 5);

  const totalVolume = totalBuyKitta + totalSellKitta;
  const netAccumulationRatio =
    totalVolume > 0
      ? Number(((totalBuyKitta / totalVolume) * 100).toFixed(1))
      : 50;

  const topAcc = topAccumulators[0];
  let dominantRegime: BrokerSmartMoney5DSummary["dominantRegime"] = "NEUTRAL";
  if (topAcc && topAcc.anomalyScore >= 1.75 && topAcc.avgTicketKitta >= 300 && netAccumulationRatio >= 54) {
    dominantRegime = "INSTITUTIONAL_ACCUMULATION";
  } else if (netAccumulationRatio <= 45) {
    dominantRegime = "DISTRIBUTION";
  } else if (topAcc && topAcc.avgTicketKitta < 45) {
    dominantRegime = "RETAIL_CHURN";
  }

  return {
    netAccumulationRatio,
    topAccumulators,
    topDistributors,
    dominantRegime,
  };
}

/**
 * Fetches all SQLite telemetry needed for Bug #4 (Quote, Candles, Signal Ledger, and 5D Brokers)
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

  // 1. Latest Signal Ledger row (checks signal_ledger view or algorithmic_signal_ledger)
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

  // 2. Historical Daily Candles (supports daily_stock_summary, daily_price_history or market_candles)
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
                ELSE COALESCE(close_price, 0)
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

  // 3. Cached Live / Session Quote from SQLite (if market_quotes table exists)
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

  // If no market_quotes row exists, synthesize quote fallback from latest 2 historical candles
  if (!quote && candles.length > 0) {
    const latest = candles[0];
    const prev = candles[1];
    quote = {
      symbol,
      ltp: null, // Forces clean fallback to TODAY_CLOSE / PREV_CLOSE / HISTORICAL_CANDLE
      todayClose: latest?.close ?? null,
      prevClose: prev?.close ?? latest?.open ?? null,
      volume: latest?.volume ?? 0,
    };
  }

  // 4. 5D Floor-Sheet Broker Rollup from SQLite
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
            AND trade_date >= date('now', '-10 days')
          GROUP BY broker_no`
        )
        .all(symbol);
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
            AND trade_date >= date('now', '-10 days')
          GROUP BY broker_id`
        )
        .all(symbol);
    } catch {
      broker5DRawPayload = null;
    }
  }

  return { quote, candles, ledgerTelemetry, broker5DRawPayload };
}
