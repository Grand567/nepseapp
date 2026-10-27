// src/app/api/stocks/[symbol]/telemetry/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getDrabyashreeDb,
  get5DBrokerSummaryForSymbol,
  getLatestSignalTelemetryForSymbol,
} from "@/lib/db/drabyashreeDb";
import {
  resolveValidNepseSymbol,
  safeNum,
  type HistoricalCandle,
  type LedgerTelemetryRow,
  type RawQuotePayload,
} from "@/services/aiGuru/runAiQuantitativeAssessment";
import {
  buildUnifiedStockTabTelemetry,
  type RawFloorsheetContract,
  type UnifiedStockTabTelemetry,
} from "@/services/floorsheet/floorsheetHubEngine";
import {
  evaluateNepseFundamentalsAndLockIn,
  type CorporateActionRow,
  type EvaluatedFundamentalTelemetry,
  type RawFundamentalRecord,
} from "@/services/fundamentals/nepseRegulatoryEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AtomicStockTelemetryApiResponse {
  ok: boolean;
  symbol: string;
  asOfTimestamp: string;
  quoteData: RawQuotePayload | null;
  historicalCandles: HistoricalCandle[];
  ledgerTelemetry: LedgerTelemetryRow | null;
  rawFloorsheetContracts: RawFloorsheetContract[];
  liveDepth: {
    bids: Array<{ price: number; kitta: number; orders: number }>;
    asks: Array<{ price: number; kitta: number; orders: number }>;
  } | null;
  broker5DPayload: unknown;
  rawFundamentals: RawFundamentalRecord | null;
  corporateActions: CorporateActionRow[];
  tabTelemetry: UnifiedStockTabTelemetry;
  fundamentalTelemetry: EvaluatedFundamentalTelemetry;
}

function tableExists(db: ReturnType<typeof getDrabyashreeDb>, name: string): boolean {
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> | { symbol: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const { searchParams } = new URL(request.url);

    const validSymbol = resolveValidNepseSymbol(
      resolvedParams?.symbol,
      searchParams.get("symbol")
    );

    if (!validSymbol) {
      return NextResponse.json(
        {
          ok: false,
          symbol: "UNSELECTED",
          error: "Invalid or placeholder NEPSE symbol requested.",
        },
        { status: 400 }
      );
    }

    const db = getDrabyashreeDb();

    // 1. Fetch Latest Signal Ledger Row (Verified T+1 VWAP, ATR, Sector, NEPSE Alpha)
    const ledgerTelemetry = getLatestSignalTelemetryForSymbol(validSymbol);

    // 2. Fetch Latest Market Quote Snapshot (including authoritative `daily_stock_summary` fallback)
    let quoteData: RawQuotePayload | null = null;
    for (const quoteTable of ["market_quotes", "stock_quotes", "live_quotes"]) {
      if (tableExists(db, quoteTable)) {
        try {
          const row = db
            .prepare(`SELECT * FROM ${quoteTable} WHERE UPPER(symbol) = ? LIMIT 1`)
            .get(validSymbol) as Record<string, unknown> | undefined;
          if (row) {
            quoteData = {
              symbol: validSymbol,
              ltp: safeNum(row.ltp ?? row.last_traded_price ?? row.close, 0),
              close: safeNum(row.close ?? row.previous_close ?? row.ltp, 0),
              previousClose: safeNum(row.previous_close ?? row.prev_close, 0),
              open: safeNum(row.open, 0),
              high: safeNum(row.high, 0),
              low: safeNum(row.low, 0),
              volume: safeNum(row.volume ?? row.total_traded_quantity, 0),
              vwap: safeNum(row.vwap ?? row.average_traded_price, 0),
              sector: String(row.sector ?? ledgerTelemetry?.sector ?? ""),
              asOf: String(row.updated_at ?? row.trade_date ?? ""),
            };
            break;
          }
        } catch {
          // Continue to next candidate table
        }
      }
    }

    if (!quoteData && tableExists(db, "daily_stock_summary")) {
      try {
        const recentRows = db
          .prepare(
            `SELECT * FROM daily_stock_summary
             WHERE UPPER(symbol) = ? AND COALESCE(calendar_status, 'VALID') != 'PARTIAL_SESSION'
             ORDER BY trade_date DESC LIMIT 2`
          )
          .all(validSymbol) as Array<Record<string, unknown>>;
        if (recentRows.length > 0) {
          const latest = recentRows[0];
          const prev = recentRows[1];
          const vol = safeNum(latest.total_volume, 0);
          const turn = safeNum(latest.total_turnover, 0);
          const closePx = safeNum(latest.close_price, 0);
          quoteData = {
            symbol: validSymbol,
            ltp: closePx,
            close: closePx,
            previousClose: safeNum(prev?.close_price ?? latest.open_price, closePx),
            open: safeNum(latest.open_price, closePx),
            high: safeNum(latest.high_price, closePx),
            low: safeNum(latest.low_price, closePx),
            volume: vol,
            vwap: vol > 0 ? Number((turn / vol).toFixed(2)) : closePx,
            sector: String(ledgerTelemetry?.sector ?? ""),
            asOf: String(latest.trade_date ?? ""),
          };
        }
      } catch {
        // Ignore fallback error
      }
    }

    // 3. Fetch Historical Daily Candles (Up to 60 sessions for ATR, RSI, 52W & Walk-Forward)
    let historicalCandles: HistoricalCandle[] = [];
    for (const candleTable of ["historical_candles", "daily_candles", "ohlcv_history"]) {
      if (tableExists(db, candleTable)) {
        try {
          const rows = db
            .prepare(
              `SELECT
                trade_date AS date,
                open,
                high,
                low,
                close,
                volume,
                vwap
              FROM ${candleTable}
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 60`
            )
            .all(validSymbol) as Array<Record<string, unknown>>;

          if (rows.length > 0) {
            historicalCandles = rows
              .map((r) => ({
                date: String(r.date ?? ""),
                open: safeNum(r.open, 0),
                high: safeNum(r.high, 0),
                low: safeNum(r.low, 0),
                close: safeNum(r.close, 0),
                volume: safeNum(r.volume, 0),
                vwap: safeNum(r.vwap ?? r.close, 0),
              }))
              .reverse();
            break;
          }
        } catch {
          // Continue fallback
        }
      }
    }

    if (historicalCandles.length === 0 && tableExists(db, "daily_stock_summary")) {
      try {
        const rows = db
          .prepare(
            `SELECT
              trade_date AS date,
              open_price AS open,
              high_price AS high,
              low_price AS low,
              close_price AS close,
              total_volume AS volume,
              CASE WHEN total_volume > 0 THEN ROUND(total_turnover / total_volume, 2) ELSE close_price END AS vwap
            FROM daily_stock_summary
            WHERE UPPER(symbol) = ? AND COALESCE(calendar_status, 'VALID') != 'PARTIAL_SESSION'
            ORDER BY trade_date DESC
            LIMIT 60`
          )
          .all(validSymbol) as Array<Record<string, unknown>>;

        if (rows.length > 0) {
          historicalCandles = rows
            .map((r) => ({
              date: String(r.date ?? ""),
              open: safeNum(r.open, 0),
              high: safeNum(r.high, 0),
              low: safeNum(r.low, 0),
              close: safeNum(r.close, 0),
              volume: safeNum(r.volume, 0),
              vwap: safeNum(r.vwap ?? r.close, 0),
            }))
            .reverse();
        }
      } catch {
        // Ignore fallback error
      }
    }

    // 4. Fetch 5-Session Smart-Money Broker Rollup
    const broker5DPayload = get5DBrokerSummaryForSymbol(validSymbol);

    // 5. Fetch Tick-by-Tick Floorsheet Contracts (Latest Session for this Symbol)
    let rawFloorsheetContracts: RawFloorsheetContract[] = [];
    if (tableExists(db, "floorsheet_contracts")) {
      try {
        const latestSessionRow = db
          .prepare(
            `SELECT MAX(trade_date) AS latest_date
             FROM floorsheet_contracts
             WHERE UPPER(symbol) = ?`
          )
          .get(validSymbol) as { latest_date?: string } | undefined;

        if (latestSessionRow?.latest_date) {
          rawFloorsheetContracts = db
            .prepare(
              `SELECT
                contract_no AS contractNo,
                symbol,
                trade_date AS tradeDate,
                trade_time AS tradeTime,
                buyer_broker AS buyerBroker,
                seller_broker AS sellerBroker,
                kitta,
                rate,
                amount,
                aggressor_side AS aggressor
              FROM floorsheet_contracts
              WHERE UPPER(symbol) = ? AND trade_date = ?
              ORDER BY trade_time DESC, contract_no DESC
              LIMIT 25000`
            )
            .all(validSymbol, latestSessionRow.latest_date) as RawFloorsheetContract[];
        }
      } catch {
        // Fallback below if empty
      }
    }

    // Fallback: Synthesize representative contract rows from `floorsheet_broker_summary` if tick table is empty
    if (
      rawFloorsheetContracts.length === 0 &&
      tableExists(db, "floorsheet_broker_summary")
    ) {
      try {
        const latestBrokerDate = db
          .prepare(
            `SELECT MAX(trade_date) AS latest_date
             FROM floorsheet_broker_summary
             WHERE UPPER(symbol) = ?`
          )
          .get(validSymbol) as { latest_date?: string } | undefined;

        if (latestBrokerDate?.latest_date) {
          const summaryRows = db
            .prepare(
              `SELECT
                symbol,
                trade_date,
                broker_no,
                buy_kitta,
                sell_kitta,
                COALESCE(vwap, ?) AS rate
              FROM floorsheet_broker_summary
              WHERE UPPER(symbol) = ? AND trade_date = ?
              ORDER BY (buy_kitta + sell_kitta) DESC
              LIMIT 120`
            )
            .all(
              safeNum(quoteData?.ltp ?? ledgerTelemetry?.ltp ?? ledgerTelemetry?.entry_vwap, 500),
              validSymbol,
              latestBrokerDate.latest_date
            ) as Array<{
            symbol: string;
            trade_date: string;
            broker_no: number;
            buy_kitta: number;
            sell_kitta: number;
            rate: number;
          }>;

          rawFloorsheetContracts = summaryRows
            .filter((r) => safeNum(r.buy_kitta, 0) > 0 || safeNum(r.sell_kitta, 0) > 0)
            .map((r, idx) => {
              const kitta = Math.max(safeNum(r.buy_kitta, 0), safeNum(r.sell_kitta, 0));
              const rate = safeNum(r.rate, 500);
              return {
                contractNo: `${r.trade_date.replace(/-/g, "")}-${validSymbol}-${100 + idx}`,
                symbol: validSymbol,
                tradeDate: r.trade_date,
                tradeTime: "14:58:00",
                buyerBroker:
                  safeNum(r.buy_kitta, 0) >= safeNum(r.sell_kitta, 0) ? r.broker_no : 58,
                sellerBroker:
                  safeNum(r.sell_kitta, 0) > safeNum(r.buy_kitta, 0) ? r.broker_no : 45,
                kitta,
                rate,
                amount: Number((kitta * rate).toFixed(2)),
              };
            });
        }
      } catch {
        // Ignore synthesis error
      }
    }

    // 6. Fetch Cached L2 Market Depth (if present in `market_depth_cache`)
    let liveDepth: AtomicStockTelemetryApiResponse["liveDepth"] = null;
    if (tableExists(db, "market_depth_cache")) {
      try {
        const depthRow = db
          .prepare(`SELECT bids_json, asks_json FROM market_depth_cache WHERE UPPER(symbol) = ? LIMIT 1`)
          .get(validSymbol) as { bids_json?: string; asks_json?: string } | undefined;

        if (depthRow) {
          const bids = JSON.parse(depthRow.bids_json || "[]");
          const asks = JSON.parse(depthRow.asks_json || "[]");
          if (Array.isArray(bids) || Array.isArray(asks)) {
            liveDepth = {
              bids: Array.isArray(bids) ? bids : [],
              asks: Array.isArray(asks) ? asks : [],
            };
          }
        }
      } catch {
        liveDepth = null;
      }
    }

    // 7. Fetch Fundamentals & Promoter Lock-In Record
    let rawFundamentals: RawFundamentalRecord | null = null;
    if (tableExists(db, "scrip_fundamentals")) {
      try {
        const fundRow = db
          .prepare(`SELECT * FROM scrip_fundamentals WHERE UPPER(symbol) = ? LIMIT 1`)
          .get(validSymbol) as RawFundamentalRecord | undefined;
        if (fundRow) {
          rawFundamentals = fundRow;
        }
      } catch {
        rawFundamentals = null;
      }
    }

    // 8. Fetch Corporate Actions & Dividend History
    let corporateActions: CorporateActionRow[] = [];
    if (tableExists(db, "scrip_corporate_actions")) {
      try {
        const caRows = db
          .prepare(
            `SELECT
              fiscal_year AS fiscalYear,
              bonus_share_pct AS bonusSharePct,
              cash_dividend_pct AS cashDividendPct,
              total_dividend_pct AS totalDividendPct,
              right_share_ratio AS rightShareRatio,
              book_close_date AS bookCloseDate,
              status
            FROM scrip_corporate_actions
            WHERE UPPER(symbol) = ?
            ORDER BY id DESC
            LIMIT 10`
          )
          .all(validSymbol) as Array<Record<string, unknown>>;

        corporateActions = caRows.map((c) => ({
          fiscalYear: String(c.fiscalYear ?? ""),
          bonusSharePct: safeNum(c.bonusSharePct, 0),
          cashDividendPct: safeNum(c.cashDividendPct, 0),
          totalDividendPct: safeNum(c.totalDividendPct, 0),
          rightShareRatio: c.rightShareRatio ? String(c.rightShareRatio) : null,
          bookCloseDate: c.bookCloseDate ? String(c.bookCloseDate) : null,
          status: String(c.status ?? "APPROVED"),
        }));
      } catch {
        corporateActions = [];
      }
    }

    // 9. Build Atomic Multi-Tab Telemetry & Fundamental Compliance Evaluation
    const tabTelemetry = buildUnifiedStockTabTelemetry({
      symbol: validSymbol,
      quote: quoteData,
      candles: historicalCandles,
      ledgerTelemetry,
      rawContracts: rawFloorsheetContracts,
      liveDepth,
      broker5DRawPayload: broker5DPayload,
    });

    const fundamentalTelemetry = evaluateNepseFundamentalsAndLockIn({
      symbol: validSymbol,
      verifiedPrice: tabTelemetry.overview.verifiedPrice,
      rawFundamentals: rawFundamentals || {
        symbol: validSymbol,
        sector: String(quoteData?.sector ?? ledgerTelemetry?.sector ?? "Commercial Banks"),
      },
      corporateActions,
    });

    const responsePayload: AtomicStockTelemetryApiResponse = {
      ok: true,
      symbol: validSymbol,
      asOfTimestamp: new Date().toISOString(),
      quoteData,
      historicalCandles,
      ledgerTelemetry,
      rawFloorsheetContracts,
      liveDepth,
      broker5DPayload,
      rawFundamentals,
      corporateActions,
      tabTelemetry,
      fundamentalTelemetry,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        symbol: "UNSELECTED",
        error:
          err instanceof Error
            ? err.message
            : "Failed to build atomic stock telemetry payload.",
      },
      { status: 500 }
    );
  }
}
