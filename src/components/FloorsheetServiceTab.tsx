// src/components/FloorsheetServiceTab.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { FloorsheetHubApiResponse } from "@/app/api/floorsheet/hub/route";
import { getProxyBase } from "../utils/liveData";

interface FloorsheetServiceTabProps {
  /** Optional callback when a user clicks a scrip row to inspect Stock Information Modal */
  onSelectSymbol?: (symbol: string) => void;
  selectedDate?: string;
  date?: string;
}

export const FloorsheetServiceTab: React.FC<FloorsheetServiceTabProps> = ({
  onSelectSymbol,
  selectedDate: propSelectedDate,
  date: propDate,
}) => {
  const initialDate = propSelectedDate || propDate || "";
  const [data, setData] = useState<FloorsheetHubApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);

  useEffect(() => {
    const nextDate = propSelectedDate || propDate || "";
    if (nextDate !== undefined && nextDate !== selectedDate) {
      setSelectedDate(nextDate);
    }
  }, [propSelectedDate, propDate]);

  // Filter States
  const [symbolInput, setSymbolInput] = useState<string>("");
  const [buyerBrokerInput, setBuyerBrokerInput] = useState<string>("");
  const [sellerBrokerInput, setSellerBrokerInput] = useState<string>("");
  const [minKittaInput, setMinKittaInput] = useState<string>("");
  const [whaleOnly, setWhaleOnly] = useState<boolean>(false);
  const [excludeCross, setExcludeCross] = useState<boolean>(false);

  const fetchFloorsheetHub = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate.trim()) params.set("date", selectedDate.trim());
      if (symbolInput.trim()) params.set("symbol", symbolInput.trim().toUpperCase());
      if (buyerBrokerInput.trim()) params.set("buyer", buyerBrokerInput.trim().replace(/^0+/, ""));
      if (sellerBrokerInput.trim()) params.set("seller", sellerBrokerInput.trim().replace(/^0+/, ""));
      if (minKittaInput.trim()) params.set("minKitta", minKittaInput.trim());
      if (whaleOnly) params.set("whaleOnly", "true");
      if (excludeCross) params.set("excludeCross", "true");
      params.set("limit", "300");

      const base = getProxyBase();
      const res = await fetch(`${base}/api/floorsheet/hub?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      const json = (await res.json()) as FloorsheetHubApiResponse;
      setData(json);
      if (json?.asOfDate && !selectedDate) {
        setSelectedDate(json.asOfDate);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("FloorsheetServiceTab fetch error:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    symbolInput,
    buyerBrokerInput,
    sellerBrokerInput,
    minKittaInput,
    whaleOnly,
    excludeCross,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchFloorsheetHub(controller.signal);
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchFloorsheetHub]);

  const summary = data?.summary;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] min-h-0 overflow-y-auto bg-slate-950 text-slate-100 rounded-xl border border-slate-800">
      {/* Top Header & Session Source Badge */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">
              ⚡ NEPSE Market-Wide Floorsheet &amp; Whale Tape Scanner
            </h2>
            {data?.asOfDate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                Session: {data.asOfDate}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Tick-Test Aggressor Inference • Whale Print Detection (&ge;500 kitta / Rs 5L) • Self-Cross Wash Filter
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchFloorsheetHub()}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition"
        >
          {loading ? "Syncing Tape..." : "↻ Refresh Tape"}
        </button>
      </div>

      {/* Sticky Multi-Dimensional Filter Bar */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center gap-2.5 text-xs">
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-indigo-300 font-medium cursor-pointer"
        >
          <option value="">Latest Session ({data?.asOfDate || "Today"})</option>
          {Array.isArray(data?.availableDates) && data.availableDates.map(dt => (
            <option key={dt} value={dt}>{dt}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Scrip (e.g. NABIL)"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          className="w-28 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
        />
        <input
          type="number"
          placeholder="Buyer Broker #"
          value={buyerBrokerInput}
          onChange={(e) => setBuyerBrokerInput(e.target.value)}
          className="w-32 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
        />
        <input
          type="number"
          placeholder="Seller Broker #"
          value={sellerBrokerInput}
          onChange={(e) => setSellerBrokerInput(e.target.value)}
          className="w-32 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
        />
        <input
          type="number"
          placeholder="Min Kitta (e.g. 300)"
          value={minKittaInput}
          onChange={(e) => setMinKittaInput(e.target.value)}
          className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500"
        />

        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 cursor-pointer text-indigo-300 font-medium">
          <input
            type="checkbox"
            checked={whaleOnly}
            onChange={(e) => setWhaleOnly(e.target.checked)}
          />
          <span>🐋 Whale Prints Only (&ge;500k)</span>
        </label>

        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 cursor-pointer text-amber-300 font-medium">
          <input
            type="checkbox"
            checked={excludeCross}
            onChange={(e) => setExcludeCross(e.target.checked)}
          />
          <span>🛡️ Exclude Broker Self-Cross</span>
        </label>

        {(symbolInput ||
          buyerBrokerInput ||
          sellerBrokerInput ||
          minKittaInput ||
          whaleOnly ||
          excludeCross) && (
          <button
            type="button"
            onClick={() => {
              setSymbolInput("");
              setBuyerBrokerInput("");
              setSellerBrokerInput("");
              setMinKittaInput("");
              setWhaleOnly(false);
              setExcludeCross(false);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Content Container */}
      <div className="p-4 space-y-4">
        {/* 4 Summary Telemetry Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Filtered Turnover &amp; Vol</div>
              <div className="text-base font-bold text-white mt-0.5">
                Rs {summary.totalTurnover.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400">
                {summary.totalKitta.toLocaleString()} kitta across{" "}
                {summary.totalContracts.toLocaleString()} contracts
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Whale Block Concentration</div>
              <div className="text-base font-bold text-indigo-300 mt-0.5">
                {summary.whaleTurnoverPct}% of Turnover
              </div>
              <div className="text-[11px] text-slate-400">
                {summary.whaleContractCount.toLocaleString()} institutional block prints
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Market Aggressor Balance</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {summary.marketBuyAggressorPct}% Buy Aggressor
              </div>
              <div className="w-full h-1.5 rounded bg-rose-500/40 overflow-hidden mt-1">
                <div
                  style={{ width: `${summary.marketBuyAggressorPct}%` }}
                  className="h-full bg-emerald-400"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Internal Broker Self-Cross</div>
              <div className="text-base font-bold text-amber-300 mt-0.5">
                {summary.internalCrossKittaPct}% of Volume
              </div>
              <div className="text-[11px] text-slate-400">
                Contracts where Buyer # == Seller #
              </div>
            </div>
          </div>
        )}

        {/* Dual Institutional Leaderboards: Whale Scrips & Smart-Money Brokers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          {/* Top Whale-Accumulated Scrips */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <div className="font-semibold text-indigo-300 mb-2">
              🐋 Top Whale-Accumulated Scrips (Click to Inspect Stock Hub)
            </div>
            <div className="divide-y divide-slate-800/70">
              {data?.topWhaleScrips.map((s) => (
                <div
                  key={s.symbol}
                  onClick={() => {
                    setSymbolInput(s.symbol);
                    onSelectSymbol?.(s.symbol);
                  }}
                  className="py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 px-1.5 rounded transition"
                >
                  <div>
                    <span className="font-bold text-white">{s.symbol}</span>
                    <span className="text-slate-400 ml-2">VWAP Rs {s.vwap}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-300 font-medium">
                      {s.whalePrintCount} Whales
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      {s.buyAggressorPct}% Buy
                    </span>
                    <span className="text-slate-400">Top Buyer #{s.topBuyerBroker}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Baseline-Deflated Institutional Accumulator Brokers */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <div className="font-semibold text-emerald-300 mb-2">
              🏛️ Top Institutional Accumulator Brokers (Baseline-Deflated)
            </div>
            <div className="divide-y divide-slate-800/70">
              {data?.topInstitutionalBrokers.map((b) => (
                <div
                  key={b.brokerId}
                  onClick={() => setBuyerBrokerInput(String(b.brokerId))}
                  className="py-1.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 px-1.5 rounded transition"
                >
                  <div>
                    <span className="font-bold text-white">Broker #{b.brokerId}</span>
                    <span className="text-slate-400 ml-2">
                      ({b.whaleTrades} whale prints)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-semibold">
                      +{b.netKitta.toLocaleString()} net kitta
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                      {b.anomalyScore.toFixed(2)}x Anomaly
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Contract Tape Table */}
        <div className="rounded-lg border border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-2.5">Contract #</th>
                <th className="p-2.5">Symbol</th>
                <th className="p-2.5">Buyer</th>
                <th className="p-2.5">Seller</th>
                <th className="p-2.5 text-right">Kitta</th>
                <th className="p-2.5 text-right">Rate (Rs)</th>
                <th className="p-2.5 text-right">Amount (Rs)</th>
                <th className="p-2.5 text-center">Institutional Tape Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.contracts.map((c) => (
                <tr key={c.contractNo} className="hover:bg-slate-900/60">
                  <td className="p-2.5 font-mono text-slate-400">
                    {c.contractNo.slice(-10)}
                  </td>
                  <td
                    onClick={() => onSelectSymbol?.(c.symbol)}
                    className="p-2.5 font-bold text-white cursor-pointer hover:text-indigo-300"
                  >
                    {c.symbol}
                  </td>
                  <td
                    onClick={() => setBuyerBrokerInput(String(c.buyerBroker))}
                    className="p-2.5 font-semibold text-emerald-400 cursor-pointer"
                  >
                    #{c.buyerBroker}
                  </td>
                  <td
                    onClick={() => setSellerBrokerInput(String(c.sellerBroker))}
                    className="p-2.5 font-semibold text-rose-400 cursor-pointer"
                  >
                    #{c.sellerBroker}
                  </td>
                  <td className="p-2.5 text-right font-semibold text-white">
                    {c.kitta.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right text-slate-200">
                    {c.rate.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right text-slate-300">
                    {c.amount.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-center space-x-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        c.aggressor === "BUY"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : c.aggressor === "SELL"
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {c.aggressor}
                    </span>
                    {c.isWhalePrint && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold">
                        WHALE
                      </span>
                    )}
                    {c.isInternalCross && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-semibold">
                        SELF-CROSS
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FloorsheetServiceTab;
