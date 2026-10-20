// src/components/AlgorithmicSignalTrackRecord.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  EnrichedSignalLedgerRow,
  SignalTrackRecordApiResponse,
} from "../app/api/signals/track-record/route";

export interface AlgorithmicSignalTrackRecordProps {
  /** Callback to open StockInformationHubModal when a user clicks a scrip */
  onSelectSymbol?: (symbol: string) => void;
  onSelectStock?: (symbol: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  inlineMode?: boolean;
  marketStocks?: any[];
  [key: string]: any;
}

export type TrackRecordSubTab = "SIGNAL_LEDGER" | "BROKER_LEADERBOARD";

export const AlgorithmicSignalTrackRecord: React.FC<
  AlgorithmicSignalTrackRecordProps
> = ({
  onSelectSymbol,
  onSelectStock,
  isOpen = true,
  onClose,
  inlineMode = false,
}) => {
  const [data, setData] = useState<SignalTrackRecordApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [subTab, setSubTab] = useState<TrackRecordSubTab>("SIGNAL_LEDGER");

  // Filters
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [convictionFilter, setConvictionFilter] = useState<string>("ALL");
  const [symbolQuery, setSymbolQuery] = useState<string>("");

  const handleStockClick = useCallback(
    (symbol: string) => {
      if (onSelectSymbol) onSelectSymbol(symbol);
      if (onSelectStock) onSelectStock(symbol);
    },
    [onSelectSymbol, onSelectStock]
  );

  const fetchTrackRecord = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (symbolQuery.trim()) params.set("symbol", symbolQuery.trim().toUpperCase());

        const res = await fetch(`/api/signals/track-record?${params.toString()}`, {
          signal,
          cache: "no-store",
        });
        const json = (await res.json()) as SignalTrackRecordApiResponse;
        setData(json);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Failed to fetch AlgorithmicSignalTrackRecord:", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, symbolQuery]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchTrackRecord(controller.signal);
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchTrackRecord]);

  const filteredSignals = useMemo(() => {
    const list = data?.signals || [];
    if (convictionFilter === "ALL") return list;
    return list.filter((s) => s.floorsheetConviction === convictionFilter);
  }, [data?.signals, convictionFilter]);

  const summary = data?.summary;

  const renderConvictionBadge = (row: EnrichedSignalLedgerRow) => {
    switch (row.floorsheetConviction) {
      case "STRONG_ACCUMULATION":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            🐋 5D Whale Backed ({row.live5DNetAccumulationPct}%)
          </span>
        );
      case "STEADY_SUPPORT":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            ✓ Institutional Support ({row.live5DNetAccumulationPct}%)
          </span>
        );
      case "BROKER_DISTRIBUTION_WARNING":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            ⚠️ 5D Broker Distribution ({row.live5DNetAccumulationPct}%)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
            Neutral Tape ({row.live5DNetAccumulationPct}%)
          </span>
        );
    }
  };

  if (!isOpen && !inlineMode) {
    return null;
  }

  const content = (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] min-h-0 overflow-y-auto bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl">
      {/* Top Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">
              📈 Walk-Forward Algorithmic Signal Track Record &amp; 5D Floorsheet Audit
            </h2>
            {data?.asOfDate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                5D Floorsheet Synced: {data.asOfDate}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            T+1 Execution VWAP • Post-Fee Net Returns • 1.2R Ratchet Shield • Live 5-Session Smart-Money Accumulation Join
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("SIGNAL_LEDGER")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === "SIGNAL_LEDGER"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Signal Ledger ({summary?.totalSignals ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("BROKER_LEADERBOARD")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === "BROKER_LEADERBOARD"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            🏛️ 5D Smart-Money Broker Leaderboard
          </button>
          {onClose && !inlineMode && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
              title="Close Track Record"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sticky Filter Bar */}
      <div className="sticky top-[57px] z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Filter Scrip (e.g. NABIL)"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "OPEN" | "CLOSED")}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
          >
            <option value="ALL">All Signal States</option>
            <option value="OPEN">Open (T+1 / T+2 / Active)</option>
            <option value="CLOSED">Closed &amp; Ratchet Saved</option>
          </select>

          <select
            value={convictionFilter}
            onChange={(e) => setConvictionFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
          >
            <option value="ALL">All Floorsheet Flows</option>
            <option value="STRONG_ACCUMULATION">🐋 5D Whale Accumulation Only</option>
            <option value="STEADY_SUPPORT">✓ Steady Broker Support</option>
            <option value="BROKER_DISTRIBUTION_WARNING">⚠️ Broker Distribution Warning</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => fetchTrackRecord()}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
        >
          {loading ? "Syncing 5D Tape..." : "↻ Refresh Ledger"}
        </button>
      </div>

      {/* Body Content */}
      <div className="p-4 space-y-4">
        {/* 5 Walk-Forward & Floorsheet Audit KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Verified Win Rate (Net)</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {summary.verifiedWinRatePct}%
              </div>
              <div className="text-[11px] text-slate-400">
                Profit Factor: {summary.profitFactor}x
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Avg Post-Fee Return</div>
              <div
                className={`text-base font-bold mt-0.5 ${
                  summary.avgNetReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {summary.avgNetReturnPct >= 0 ? "+" : ""}
                {summary.avgNetReturnPct}%
              </div>
              <div className="text-[11px] text-slate-400">
                Includes 0.65% NEPSE Fee Drag
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">1.2R Ratchet Saves</div>
              <div className="text-base font-bold text-indigo-300 mt-0.5">
                {summary.ratchetSavesCount} Signals
              </div>
              <div className="text-[11px] text-slate-400">
                Protected from reversal loss
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">5D Whale-Backed Signals</div>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {summary.signalsBackedByWhalesCount} Active
              </div>
              <div className="text-[11px] text-slate-400">
                Heavy institutional follow-through
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Distribution Warnings</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">
                {summary.distributionWarningCount} Alerts
              </div>
              <div className="text-[11px] text-slate-400">
                Brokers selling into open signal
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 1: WALK-FORWARD SIGNAL LEDGER WITH LIVE 5D FLOORSHEET TELEMETRY */}
        {subTab === "SIGNAL_LEDGER" && (
          <div className="rounded-lg border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Scrip / Date</th>
                  <th className="p-2.5">T+2 Status</th>
                  <th className="p-2.5 text-right">T+1 VWAP Entry</th>
                  <th className="p-2.5 text-right">Verified LTP</th>
                  <th className="p-2.5 text-right">Net Return</th>
                  <th className="p-2.5 text-center">MAE / MFE &amp; 1.2R Shield</th>
                  <th className="p-2.5">5D Top Accumulator</th>
                  <th className="p-2.5">Live 5D Floorsheet Conviction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSignals.map((sig) => (
                  <tr key={sig.id} className="hover:bg-slate-900/60">
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => handleStockClick(sig.symbol)}
                        className="font-bold text-white hover:text-indigo-300 text-left"
                      >
                        {sig.symbol}
                      </button>
                      <div className="text-[11px] text-slate-400">
                        {sig.signalDate} • {sig.sector}
                      </div>
                    </td>

                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          sig.status === "OPEN_T1_LOCKED" || sig.status === "OPEN_T2_LOCKED"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : sig.status === "RATCHET_SAVED"
                            ? "bg-indigo-500/20 text-indigo-300"
                            : sig.status === "CLOSED_WIN"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : sig.status === "CLOSED_LOSS"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {sig.status.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td className="p-2.5 text-right font-medium text-slate-200">
                      Rs {sig.entryVwap.toLocaleString()}
                    </td>

                    <td className="p-2.5 text-right font-bold text-white">
                      Rs {sig.currentLtp.toLocaleString()}
                    </td>

                    <td
                      className={`p-2.5 text-right font-bold ${
                        sig.netReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {sig.netReturnPct >= 0 ? "+" : ""}
                      {sig.netReturnPct}%
                    </td>

                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-2 text-[11px]">
                        <span className="text-rose-400">{sig.maePct}%</span>
                        <span className="text-slate-600">/</span>
                        <span className="text-emerald-400">+{sig.mfePct}%</span>
                        {sig.ratchetActive && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                            🛡️ 1.2R
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-2.5">
                      <div className="font-semibold text-emerald-300">
                        Broker #{sig.topAccumulatorBroker}{" "}
                        <span className="text-indigo-300 font-mono text-[11px]">
                          ({sig.brokerAnomalyScore}x)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        +{sig.topAccumulatorNetKitta.toLocaleString()} net kitta •{" "}
                        {sig.whalePrintCount5D} whales
                      </div>
                    </td>

                    <td className="p-2.5">{renderConvictionBadge(sig)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SUB-TAB 2: 5-SESSION SMART-MONEY BROKER LEADERBOARD */}
        {subTab === "BROKER_LEADERBOARD" && (
          <div className="rounded-lg border border-slate-800 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Rank &amp; Broker #</th>
                  <th className="p-2.5 text-right">5D Buy Kitta</th>
                  <th className="p-2.5 text-right">5D Sell Kitta</th>
                  <th className="p-2.5 text-right">5D Net Accumulated</th>
                  <th className="p-2.5 text-center">Baseline-Deflated Anomaly</th>
                  <th className="p-2.5 text-center">Signal Win Rate</th>
                  <th className="p-2.5">Top Accumulated Signal Scrips (Click to Open)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data?.brokerLeaderboard.map((b, idx) => (
                  <tr key={b.brokerId} className="hover:bg-slate-900/60">
                    <td className="p-2.5 font-bold text-white">
                      #{idx + 1} • Broker #{b.brokerId}
                    </td>
                    <td className="p-2.5 text-right text-emerald-300">
                      {b.totalBuyKitta5D.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right text-rose-300">
                      {b.totalSellKitta5D.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-bold text-emerald-400">
                      +{b.netAccumulatedKitta5D.toLocaleString()} kitta
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-semibold">
                        {b.baselineDeflatedAnomaly}x vs Baseline
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-bold text-emerald-400">
                      {b.winRateOnBackedSignalsPct}%
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {b.topAccumulatedSymbols.map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => handleStockClick(sym)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-semibold text-[11px] transition"
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  if (inlineMode) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl h-full max-h-[92vh] flex flex-col min-h-0 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
};

export default AlgorithmicSignalTrackRecord;
