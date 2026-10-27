// src/app/api/system/audit-health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDrabyashreeDb } from "@/lib/db/drabyashreeDb";
import { safeNum } from "@/services/aiGuru/runAiQuantitativeAssessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SessionConservationReport {
  tradeDate: string;
  ok: boolean;
  status: "CONSERVED_EXACT" | "PARITY_DRIFT_DETECTED";
  contractsCount: number;
  scripsCount: number;
  activeBrokersCount: number;
  conservedVolume: number;
  conservedTurnover: number;
  crossVolume: number;
  corruptArithmeticRows: number;
  deltas: {
    contractsVsSummaryVolume: number;
    contractsVsSummaryTurnover: number;
    brokerBuyVsSellVolume: number;
    brokerVsSummaryVolume: number;
  };
  ingestionCompletenessPct: number | null;
  officialBenchmarkStatus: string;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDrabyashreeDb();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(30, Math.max(1, Math.round(safeNum(searchParams.get("sessions"), 5))));

    const dateRows = db
      .prepare(
        `SELECT DISTINCT trade_date
         FROM daily_stock_summary
         WHERE calendar_status != 'PARTIAL_SESSION'
         ORDER BY trade_date DESC
         LIMIT ?`
      )
      .all(limit) as Array<{ trade_date: string }>;

    const sessionReports: SessionConservationReport[] = [];

    for (const { trade_date: tradeDate } of dateRows) {
      const fc = db
        .prepare(
          `SELECT
            COUNT(*) AS contractCount,
            COALESCE(SUM(kitta), 0) AS totalKitta,
            ROUND(COALESCE(SUM(amount), 0), 2) AS totalAmount,
            COALESCE(SUM(CASE WHEN kitta > 0 AND rate > 0 AND ABS(amount - (kitta * rate)) > MAX(1.0, amount * 0.01) THEN 1 ELSE 0 END), 0) AS corruptRows
           FROM floorsheet_contracts
           WHERE trade_date = ?`
        )
        .get(tradeDate) as Record<string, unknown> | undefined;

      const dss = db
        .prepare(
          `SELECT
            COUNT(*) AS scripCount,
            COALESCE(SUM(total_volume), 0) AS totalVolume,
            ROUND(COALESCE(SUM(total_turnover), 0), 2) AS totalTurnover
           FROM daily_stock_summary
           WHERE trade_date = ?`
        )
        .get(tradeDate) as Record<string, unknown> | undefined;

      const dbl = db
        .prepare(
          `SELECT
            COUNT(DISTINCT broker_id) AS activeBrokers,
            COALESCE(SUM(buy_vol), 0) AS sumBuyVol,
            COALESCE(SUM(sell_vol), 0) AS sumSellVol,
            COALESCE(SUM(cross_vol), 0) AS sumCrossVol
           FROM daily_broker_ledger
           WHERE trade_date = ?`
        )
        .get(tradeDate) as Record<string, unknown> | undefined;

      let ingestionPct: number | null = null;
      try {
        const ing = db
          .prepare(`SELECT completeness_pct FROM daily_ingestion_log WHERE trade_date = ? LIMIT 1`)
          .get(tradeDate) as { completeness_pct?: number } | undefined;
        if (ing?.completeness_pct !== undefined) {
          ingestionPct = safeNum(ing.completeness_pct, 100);
        }
      } catch {
        ingestionPct = null;
      }

      let benchmarkStatus = "NO_BENCHMARK_IMPORTED";
      try {
        const bm = db
          .prepare(`SELECT total_volume, total_turnover FROM official_exchange_benchmarks WHERE trade_date = ? LIMIT 1`)
          .get(tradeDate) as { total_volume?: number; total_turnover?: number } | undefined;
        if (bm) {
          const bmVolDiff = safeNum(fc?.totalKitta, 0) - safeNum(bm.total_volume, 0);
          const bmAmtDiff = Math.abs(safeNum(fc?.totalAmount, 0) - safeNum(bm.total_turnover, 0));
          benchmarkStatus = bmVolDiff === 0 && bmAmtDiff < 1.0 ? "RECONCILED_EXACT" : "BENCHMARK_DISCREPANCY";
        }
      } catch {
        benchmarkStatus = "NO_BENCHMARK_IMPORTED";
      }

      const fcVol = safeNum(fc?.totalKitta, 0);
      const fcAmt = safeNum(fc?.totalAmount, 0);
      const dssVol = safeNum(dss?.totalVolume, 0);
      const dssAmt = safeNum(dss?.totalTurnover, 0);
      const dblBuyVol = safeNum(dbl?.sumBuyVol, 0);
      const dblSellVol = safeNum(dbl?.sumSellVol, 0);
      const corruptRows = safeNum(fc?.corruptRows, 0);

      // If floorsheet_contracts holds this date, enforce 3-way parity; otherwise enforce 2-way summary <-> broker parity
      const hasTickContracts = safeNum(fc?.contractCount, 0) > 0;
      const contractsVsSummaryVolume = hasTickContracts ? fcVol - dssVol : 0;
      const contractsVsSummaryTurnover = hasTickContracts ? Number((fcAmt - dssAmt).toFixed(2)) : 0;
      const brokerBuyVsSellVolume = dblBuyVol - dblSellVol;
      const brokerVsSummaryVolume = dblBuyVol - dssVol;

      const sessionOk =
        dssVol > 0 &&
        contractsVsSummaryVolume === 0 &&
        Math.abs(contractsVsSummaryTurnover) < 1.0 &&
        brokerBuyVsSellVolume === 0 &&
        brokerVsSummaryVolume === 0 &&
        corruptRows === 0;

      sessionReports.push({
        tradeDate,
        ok: sessionOk,
        status: sessionOk ? "CONSERVED_EXACT" : "PARITY_DRIFT_DETECTED",
        contractsCount: safeNum(fc?.contractCount, 0),
        scripsCount: safeNum(dss?.scripCount, 0),
        activeBrokersCount: safeNum(dbl?.activeBrokers, 0),
        conservedVolume: dssVol,
        conservedTurnover: dssAmt,
        crossVolume: safeNum(dbl?.sumCrossVol, 0),
        corruptArithmeticRows: corruptRows,
        deltas: {
          contractsVsSummaryVolume,
          contractsVsSummaryTurnover,
          brokerBuyVsSellVolume,
          brokerVsSummaryVolume,
        },
        ingestionCompletenessPct: ingestionPct,
        officialBenchmarkStatus: benchmarkStatus,
      });
    }

    const allHealthy = sessionReports.length > 0 && sessionReports.every((r) => r.ok);

    return NextResponse.json(
      {
        ok: allHealthy,
        checkedAt: new Date().toISOString(),
        sessionsAudited: sessionReports.length,
        latestSessionDate: sessionReports[0]?.tradeDate ?? null,
        overallStatus: allHealthy ? "GREEN_PRODUCTION_VERIFIED" : "ATTENTION_REQUIRED",
        sessions: sessionReports,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        overallStatus: "AUDIT_ENDPOINT_ERROR",
        error: err instanceof Error ? err.message : "Failed to execute 3-way SQLite health audit",
      },
      { status: 500 }
    );
  }
}
