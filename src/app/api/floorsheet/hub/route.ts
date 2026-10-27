// src/app/api/floorsheet/hub/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDrabyashreeDb } from "@/lib/db/drabyashreeDb";
import { safeNum } from "@/services/aiGuru/runAiQuantitativeAssessment";
import {
  enrichFloorsheetContracts,
  type EnrichedFloorsheetContract,
  type RawFloorsheetContract,
} from "@/services/floorsheet/floorsheetHubEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface MarketWideScripWhaleRollup {
  symbol: string;
  totalKitta: number;
  totalTurnover: number;
  vwap: number;
  whalePrintCount: number;
  buyAggressorPct: number;
  topBuyerBroker: number;
}

export interface MarketWideBrokerRollup {
  brokerId: number;
  buyKitta: number;
  sellKitta: number;
  netKitta: number;
  turnover: number;
  whaleTrades: number;
  anomalyScore: number;
}

export interface FloorsheetHubApiResponse {
  ok: boolean;
  asOfDate: string;
  source: "SQLITE_CONTRACTS" | "SQLITE_BROKER_SUMMARY_SYNTHESIS" | "EMPTY";
  summary: {
    totalContracts: number;
    totalKitta: number;
    totalTurnover: number;
    whaleContractCount: number;
    whaleTurnoverPct: number;
    internalCrossKittaPct: number;
    marketBuyAggressorPct: number;
  };
  topWhaleScrips: MarketWideScripWhaleRollup[];
  topInstitutionalBrokers: MarketWideBrokerRollup[];
  contracts: EnrichedFloorsheetContract[];
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

const RETAIL_GIANT_BASELINE: Record<number, number> = {
  58: 0.085,
  45: 0.042,
  49: 0.038,
  34: 0.032,
};

export async function GET(request: NextRequest) {
  try {
    const db = getDrabyashreeDb();
    const { searchParams } = new URL(request.url);

    const symbolFilter = (searchParams.get("symbol") || "").trim().toUpperCase();
    const buyerFilter = Math.round(safeNum(searchParams.get("buyer"), 0));
    const sellerFilter = Math.round(safeNum(searchParams.get("seller"), 0));
    const minKitta = Math.round(safeNum(searchParams.get("minKitta"), 0));
    const minAmount = safeNum(searchParams.get("minAmount"), 0);
    const whaleOnly = searchParams.get("whaleOnly") === "true";
    const excludeCross = searchParams.get("excludeCross") === "true";
    const limit = Math.min(1000, Math.max(50, Math.round(safeNum(searchParams.get("limit"), 350))));

    let rawContracts: RawFloorsheetContract[] = [];
    let asOfDate = new Date().toISOString().slice(0, 10);
    let source: FloorsheetHubApiResponse["source"] = "EMPTY";

    // 1. Primary Path: Query tick-level `floorsheet_contracts` table for the latest trading session
    if (tableExists(db, "floorsheet_contracts")) {
      const latestDateRow = db
        .prepare(`SELECT MAX(trade_date) AS latest_date FROM floorsheet_contracts`)
        .get() as { latest_date?: string } | undefined;

      if (latestDateRow?.latest_date) {
        asOfDate = latestDateRow.latest_date;
        source = "SQLITE_CONTRACTS";

        const clauses: string[] = [`trade_date = ?`];
        const params: Array<string | number> = [asOfDate];

        if (symbolFilter && symbolFilter !== "ALL") {
          clauses.push(`UPPER(symbol) = ?`);
          params.push(symbolFilter);
        }
        if (buyerFilter > 0) {
          clauses.push(`buyer_broker = ?`);
          params.push(buyerFilter);
        }
        if (sellerFilter > 0) {
          clauses.push(`seller_broker = ?`);
          params.push(sellerFilter);
        }
        if (minKitta > 0) {
          clauses.push(`kitta >= ?`);
          params.push(minKitta);
        }
        if (minAmount > 0) {
          clauses.push(`amount >= ?`);
          params.push(minAmount);
        }
        if (whaleOnly) {
          clauses.push(`(kitta >= 200 OR amount >= 100000 OR is_whale_print = 1)`);
        }
        if (excludeCross) {
          clauses.push(`buyer_broker != seller_broker`);
        }

        const sql = `
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
            aggressor_side AS aggressor
          FROM floorsheet_contracts
          WHERE ${clauses.join(" AND ")}
          ORDER BY trade_date DESC, trade_time DESC, contract_no DESC
          LIMIT ?
        `;
        // Allow full-session rollup on high-volume NEPSE days (up to 100,000 contracts) while slicing `contracts` response to `limit`
        params.push(100000);

        rawContracts = db.prepare(sql).all(...params) as RawFloorsheetContract[];
      }
    }

    // 2. Fallback Path: If `floorsheet_contracts` is empty, synthesize representative tape from `floorsheet_broker_summary`
    if (rawContracts.length === 0 && tableExists(db, "floorsheet_broker_summary")) {
      const latestDateRow = db
        .prepare(`SELECT MAX(trade_date) AS latest_date FROM floorsheet_broker_summary`)
        .get() as { latest_date?: string } | undefined;

      if (latestDateRow?.latest_date) {
        asOfDate = latestDateRow.latest_date;
        source = "SQLITE_BROKER_SUMMARY_SYNTHESIS";

        const summaryRows = db
          .prepare(
            `SELECT
              symbol,
              trade_date,
              broker_no,
              buy_kitta,
              sell_kitta,
              COALESCE(vwap, 500) AS rate
            FROM floorsheet_broker_summary
            WHERE trade_date = ?
            ORDER BY (buy_kitta + sell_kitta) DESC
            LIMIT 400`
          )
          .all(asOfDate) as Array<{
          symbol: string;
          trade_date: string;
          broker_no: number;
          buy_kitta: number;
          sell_kitta: number;
          rate: number;
        }>;

        rawContracts = summaryRows
          .filter((r) => safeNum(r.buy_kitta, 0) > 0 || safeNum(r.sell_kitta, 0) > 0)
          .map((r, i) => {
            const kitta = Math.max(safeNum(r.buy_kitta, 0), safeNum(r.sell_kitta, 0));
            const rate = safeNum(r.rate, 500);
            return {
              contractNo: `${asOfDate.replace(/-/g, "")}-SYN-${1000 + i}`,
              symbol: r.symbol,
              tradeDate: r.trade_date,
              tradeTime: "14:59:00",
              buyerBroker: safeNum(r.buy_kitta, 0) >= safeNum(r.sell_kitta, 0) ? r.broker_no : 58,
              sellerBroker: safeNum(r.sell_kitta, 0) > safeNum(r.buy_kitta, 0) ? r.broker_no : 45,
              kitta,
              rate,
              amount: Number((kitta * rate).toFixed(2)),
            };
          });
      }
    }

    // 3. Enrich contracts per scrip so Tick-Test Aggressor works per ticker
    const bySymbolMap = new Map<string, RawFloorsheetContract[]>();
    for (const c of rawContracts) {
      const sym = String(c.symbol || "NEPSE").toUpperCase();
      const arr = bySymbolMap.get(sym) || [];
      arr.push(c);
      bySymbolMap.set(sym, arr);
    }

    let allEnriched: EnrichedFloorsheetContract[] = [];
    for (const [sym, rows] of bySymbolMap.entries()) {
      const enrichedForSym = enrichFloorsheetContracts(rows, sym);
      allEnriched.push(...enrichedForSym);
    }

    // Apply client filters on synthesized rows as well
    allEnriched = allEnriched.filter((c) => {
      if (symbolFilter && symbolFilter !== "ALL" && c.symbol !== symbolFilter) return false;
      if (buyerFilter > 0 && c.buyerBroker !== buyerFilter) return false;
      if (sellerFilter > 0 && c.sellerBroker !== sellerFilter) return false;
      if (minKitta > 0 && c.kitta < minKitta) return false;
      if (minAmount > 0 && c.amount < minAmount) return false;
      if (whaleOnly && !c.isWhalePrint) return false;
      if (excludeCross && c.isInternalCross) return false;
      return true;
    });

    // Sort newest/largest first
    allEnriched.sort((a, b) => {
      const tA = String(a.tradeTime || "");
      const tB = String(b.tradeTime || "");
      if (tA && tB && tA !== tB) return tB.localeCompare(tA);
      return b.contractNo.localeCompare(a.contractNo, undefined, { numeric: true });
    });

    // 4. Compute Market-Wide Summary, Top Whale Scrips, and Top Institutional Brokers
    let totalKitta = 0;
    let totalTurnover = 0;
    let whaleContractCount = 0;
    let whaleTurnover = 0;
    let internalCrossKitta = 0;
    let buyAggressorKitta = 0;
    let sellAggressorKitta = 0;

    const scripAgg = new Map<
      string,
      {
        totalKitta: number;
        totalTurnover: number;
        whalePrintCount: number;
        buyAggKitta: number;
        sellAggKitta: number;
        buyerBrokerVolumes: Map<number, number>;
      }
    >();

    const brokerAgg = new Map<
      number,
      { buyKitta: number; sellKitta: number; turnover: number; whaleTrades: number; trades: number }
    >();

    for (const c of allEnriched) {
      totalKitta += c.kitta;
      totalTurnover += c.amount;
      if (c.isWhalePrint) {
        whaleContractCount += 1;
        whaleTurnover += c.amount;
      }
      if (c.isInternalCross) internalCrossKitta += c.kitta;
      if (c.aggressor === "BUY") buyAggressorKitta += c.kitta;
      if (c.aggressor === "SELL") sellAggressorKitta += c.kitta;

      // Scrip aggregation
      const s = scripAgg.get(c.symbol) || {
        totalKitta: 0,
        totalTurnover: 0,
        whalePrintCount: 0,
        buyAggKitta: 0,
        sellAggKitta: 0,
        buyerBrokerVolumes: new Map<number, number>(),
      };
      s.totalKitta += c.kitta;
      s.totalTurnover += c.amount;
      if (c.isWhalePrint) s.whalePrintCount += 1;
      if (c.aggressor === "BUY") s.buyAggKitta += c.kitta;
      if (c.aggressor === "SELL") s.sellAggKitta += c.kitta;
      s.buyerBrokerVolumes.set(
        c.buyerBroker,
        (s.buyerBrokerVolumes.get(c.buyerBroker) || 0) + c.kitta
      );
      scripAgg.set(c.symbol, s);

      const isSelfTrade = c.buyerBroker > 0 && c.buyerBroker === c.sellerBroker;

      // Buyer Broker aggregation
      if (c.buyerBroker > 0) {
        const b = brokerAgg.get(c.buyerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        b.buyKitta += c.kitta;
        b.turnover += c.amount;
        if (c.isWhalePrint) b.whaleTrades += 1;
        b.trades += 1;
        brokerAgg.set(c.buyerBroker, b);
      }

      // Seller Broker aggregation
      if (c.sellerBroker > 0) {
        const sl = brokerAgg.get(c.sellerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        sl.sellKitta += c.kitta;
        // Avoid double-counting turnover and trade count on self-trades (buyerBroker === sellerBroker)
        if (!isSelfTrade) {
          sl.turnover += c.amount;
          sl.trades += 1;
        }
        brokerAgg.set(c.sellerBroker, sl);
      }
    }

    const topWhaleScrips: MarketWideScripWhaleRollup[] = Array.from(scripAgg.entries())
      .map(([symbol, st]) => {
        let topBuyerBroker = 0;
        let maxBuyVol = 0;
        for (const [bId, vol] of st.buyerBrokerVolumes.entries()) {
          if (vol > maxBuyVol) {
            maxBuyVol = vol;
            topBuyerBroker = bId;
          }
        }
        const dirVol = st.buyAggKitta + st.sellAggKitta;
        return {
          symbol,
          totalKitta: st.totalKitta,
          totalTurnover: Math.round(st.totalTurnover),
          vwap: st.totalKitta > 0 ? Number((st.totalTurnover / st.totalKitta).toFixed(2)) : 0,
          whalePrintCount: st.whalePrintCount,
          buyAggressorPct:
            dirVol > 0 ? Number(((st.buyAggKitta / dirVol) * 100).toFixed(1)) : 50,
          topBuyerBroker,
        };
      })
      .sort((a, b) => b.whalePrintCount - a.whalePrintCount || b.totalTurnover - a.totalTurnover)
      .slice(0, 8);

    const topInstitutionalBrokers: MarketWideBrokerRollup[] = Array.from(brokerAgg.entries())
      .map(([brokerId, br]) => {
        const netKitta = br.buyKitta - br.sellKitta;
        const avgTicket = (br.buyKitta + br.sellKitta) / Math.max(1, br.trades);
        const baseline = RETAIL_GIANT_BASELINE[brokerId] ?? 0.018;
        const buyShare = totalKitta > 0 ? br.buyKitta / totalKitta : baseline;
        const ticketMult = avgTicket >= 300 ? 1.35 : avgTicket < 45 ? 0.65 : 1.0;
        const anomalyScore = Number(Math.max(0.1, (buyShare / baseline) * ticketMult).toFixed(2));

        return {
          brokerId,
          buyKitta: br.buyKitta,
          sellKitta: br.sellKitta,
          netKitta,
          turnover: Math.round(br.turnover),
          whaleTrades: br.whaleTrades,
          anomalyScore,
        };
      })
      .filter((b) => b.netKitta > 0)
      .sort((a, b) => b.netKitta * b.anomalyScore - a.netKitta * a.anomalyScore)
      .slice(0, 8);

    const dirTotal = buyAggressorKitta + sellAggressorKitta;

    const responsePayload: FloorsheetHubApiResponse = {
      ok: true,
      asOfDate,
      source,
      summary: {
        totalContracts: allEnriched.length,
        totalKitta,
        totalTurnover: Math.round(totalTurnover),
        whaleContractCount,
        whaleTurnoverPct:
          totalTurnover > 0 ? Number(((whaleTurnover / totalTurnover) * 100).toFixed(1)) : 0,
        internalCrossKittaPct:
          totalKitta > 0 ? Number(((internalCrossKitta / totalKitta) * 100).toFixed(1)) : 0,
        marketBuyAggressorPct:
          dirTotal > 0 ? Number(((buyAggressorKitta / dirTotal) * 100).toFixed(1)) : 50,
      },
      topWhaleScrips,
      topInstitutionalBrokers,
      contracts: allEnriched.slice(0, limit),
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        asOfDate: new Date().toISOString().slice(0, 10),
        source: "EMPTY",
        error: err instanceof Error ? err.message : "Failed to load Floorsheet Hub",
        summary: {
          totalContracts: 0,
          totalKitta: 0,
          totalTurnover: 0,
          whaleContractCount: 0,
          whaleTurnoverPct: 0,
          internalCrossKittaPct: 0,
          marketBuyAggressorPct: 50,
        },
        topWhaleScrips: [],
        topInstitutionalBrokers: [],
        contracts: [],
      },
      { status: 200 }
    );
  }
}
