// src/components/StockFundamentalsAndLockInTab.tsx
"use client";

import React, { useMemo } from "react";
import {
  evaluateNepseFundamentalsAndLockIn,
  type CorporateActionRow,
  type RawFundamentalRecord,
} from "../services/fundamentals/nepseRegulatoryEngine";

interface StockFundamentalsAndLockInTabProps {
  symbol: string;
  verifiedPrice: number | null;
  rawFundamentals?: RawFundamentalRecord | null;
  corporateActions?: CorporateActionRow[];
}

export const StockFundamentalsAndLockInTab: React.FC<
  StockFundamentalsAndLockInTabProps
> = ({ symbol, verifiedPrice, rawFundamentals = null, corporateActions = [] }) => {
  const telemetry = useMemo(
    () =>
      evaluateNepseFundamentalsAndLockIn({
        symbol,
        verifiedPrice,
        rawFundamentals,
        corporateActions,
      }),
    [symbol, verifiedPrice, rawFundamentals, corporateActions]
  );

  const { metrics, promoterLockIn, regulatoryGates } = telemetry;

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Regulatory & Institutional Gate Status Banner */}
      <div className="space-y-2">
        {regulatoryGates.map((gate, idx) => {
          const isVeto = gate.severity === "CRITICAL_VETO";
          const isWarn = gate.severity === "WARN";
          return (
            <div
              key={`${gate.code}-${idx}`}
              className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                isVeto
                  ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                  : isWarn
                  ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                  : "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isVeto
                        ? "bg-rose-500/25 text-rose-300"
                        : isWarn
                        ? "bg-amber-500/25 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {gate.code}
                  </span>
                  <span className="font-bold text-white">{gate.title}</span>
                </div>
                <p className="text-slate-300 mt-1 leading-relaxed">{gate.detail}</p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                {telemetry.fiscalQuarter}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2. Fundamental Valuation & NRB Prudential Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">EPS (TTM) / Distributable</div>
          <div
            className={`text-base font-bold mt-1 ${
              metrics.epsTtm > 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            Rs {metrics.epsTtm.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400">
            Distributable: Rs {metrics.distributableEps.toFixed(2)}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">P/E &amp; P/BV Multiples</div>
          <div className="text-base font-bold text-white mt-1">
            {metrics.peRatio !== null ? `${metrics.peRatio}x P/E` : "N/A"}
          </div>
          <div className="text-[11px] text-slate-400">
            P/BV:{" "}
            <strong className="text-slate-200">
              {metrics.pbvRatio !== null ? `${metrics.pbvRatio}x` : "N/A"}
            </strong>{" "}
            (BVPS Rs {metrics.bookValuePerShare})
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">Graham Intrinsic Value</div>
          <div className="text-base font-bold text-indigo-300 mt-1">
            Rs {metrics.grahamFairValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400">
            Margin:{" "}
            <span
              className={
                (metrics.valuationMarginPct ?? 0) >= 0
                  ? "text-emerald-400 font-semibold"
                  : "text-rose-400 font-semibold"
              }
            >
              {metrics.valuationMarginPct !== null
                ? `${metrics.valuationMarginPct >= 0 ? "+" : ""}${metrics.valuationMarginPct}%`
                : "N/A"}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400">ROE &amp; Paid-Up Capital</div>
          <div className="text-base font-bold text-white mt-1">
            {metrics.roePct.toFixed(2)}% ROE
          </div>
          <div className="text-[11px] text-slate-400">
            Paid-Up: Rs {metrics.paidUpCapitalCr.toLocaleString()} Cr
          </div>
        </div>
      </div>

      {/* 3. BFI / NRB Prudential Health & Promoter Lock-In Supply Tracker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* NRB Prudential Indicators */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2">
          <div className="font-semibold text-indigo-300">
            🏦 NRB Prudential &amp; Balance Sheet Health
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Non-Performing Loan (NPL)</div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  metrics.nplPct !== null && metrics.nplPct >= 4.5
                    ? "text-rose-400"
                    : "text-emerald-400"
                }`}
              >
                {metrics.nplPct !== null ? `${metrics.nplPct}%` : "N/A (Non-BFI)"}
              </div>
              <div className="text-[10px] text-slate-500">NRB Danger Threshold: &ge;5.0%</div>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Capital Adequacy (CAR)</div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  metrics.carPct !== null && metrics.carPct < 11.0
                    ? "text-rose-400"
                    : "text-emerald-400"
                }`}
              >
                {metrics.carPct !== null ? `${metrics.carPct}%` : "N/A (Non-BFI)"}
              </div>
              <div className="text-[10px] text-slate-500">NRB Minimum Floor: 11.0%</div>
            </div>
          </div>
        </div>

        {/* SEBON Promoter Lock-In & Shareholding Structure */}
        <div
          className={`rounded-lg border p-3 space-y-2 ${
            promoterLockIn.isBlackoutDanger
              ? "border-rose-500/40 bg-rose-950/20"
              : "border-slate-800 bg-slate-900/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-amber-300">
              🔒 SEBON Promoter Lock-In &amp; Float Structure
            </span>
            <span className="text-[11px] text-slate-400">
              Promoter {metrics.promoterSharePct}% / Public {metrics.publicSharePct}%
            </span>
          </div>

          <div className="w-full h-2 rounded bg-slate-800 overflow-hidden flex">
            <div
              style={{ width: `${metrics.promoterSharePct}%` }}
              className="bg-amber-500"
              title={`Promoter: ${metrics.promoterSharePct}%`}
            />
            <div
              style={{ width: `${metrics.publicSharePct}%` }}
              className="bg-indigo-500"
              title={`Public Float: ${metrics.publicSharePct}%`}
            />
          </div>

          <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-300 font-medium">{promoterLockIn.statusLabel}</div>
              {promoterLockIn.lockedKitta > 0 && (
                <div className="text-[11px] text-slate-400">
                  Locked Supply: {promoterLockIn.lockedKitta.toLocaleString()} kitta
                </div>
              )}
            </div>
            {promoterLockIn.isBlackoutDanger && (
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                60D BLACKOUT
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Dividend & Corporate Action History Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 font-semibold text-slate-200">
          🎁 Corporate Actions, Bonus &amp; Cash Dividend History
        </div>
        {telemetry.corporateActions.length === 0 ? (
          <div className="p-4 text-slate-400">
            No recent dividend or right share declarations recorded in SQLite for{" "}
            <strong className="text-white">{telemetry.symbol}</strong>.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-2.5">Fiscal Year</th>
                <th className="p-2.5 text-right">Bonus Share %</th>
                <th className="p-2.5 text-right">Cash Dividend %</th>
                <th className="p-2.5 text-right">Total %</th>
                <th className="p-2.5 text-center">Right Share</th>
                <th className="p-2.5 text-right">Book Close Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {telemetry.corporateActions.map((ca, i) => (
                <tr key={`${ca.fiscalYear}-${i}`} className="hover:bg-slate-900/40">
                  <td className="p-2.5 font-semibold text-white">{ca.fiscalYear}</td>
                  <td className="p-2.5 text-right text-emerald-400 font-semibold">
                    {ca.bonusSharePct.toFixed(2)}%
                  </td>
                  <td className="p-2.5 text-right text-indigo-300">
                    {ca.cashDividendPct.toFixed(2)}%
                  </td>
                  <td className="p-2.5 text-right font-bold text-white">
                    {ca.totalDividendPct.toFixed(2)}%
                  </td>
                  <td className="p-2.5 text-center text-amber-300">
                    {ca.rightShareRatio || "—"}
                  </td>
                  <td className="p-2.5 text-right text-slate-400">
                    {ca.bookCloseDate || ca.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StockFundamentalsAndLockInTab;
