// src/components/StockInformationHubModal.tsx
import React, { useMemo, useState } from "react";
import {
  buildUnifiedStockTabTelemetry,
  type RawFloorsheetContract,
} from "../services/floorsheet/floorsheetHubEngine";
import {
  resolveValidNepseSymbol,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
} from "../services/aiGuru/runAiQuantitativeAssessment";
import { AiGuruQuantitativeCard } from "./AiGuruQuantitativeCard";

export type StockInfoTabKey =
  | "OVERVIEW"
  | "MARKET_DEPTH"
  | "BROKER_FLOW"
  | "FLOORSHEET"
  | "VOLUME_PROFILE"
  | "AI_GURU_TOOLS";

export interface StockInformationHubModalProps {
  symbol?: string | null;
  selectedScrip?: { symbol?: string; ticker?: string; sector?: string; stockSymbol?: string } | null;
  quoteData?: RawQuotePayload | null;
  historicalCandles?: HistoricalCandle[];
  ledgerTelemetry?: LedgerTelemetryRow | null;
  rawFloorsheetContracts?: RawFloorsheetContract[];
  liveDepth?: {
    bids?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
    asks?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
  } | null;
  broker5DPayload?: unknown;
  onClose?: () => void;
}

export const StockInformationHubModal: React.FC<StockInformationHubModalProps> = ({
  symbol,
  selectedScrip,
  quoteData,
  historicalCandles = [],
  ledgerTelemetry = null,
  rawFloorsheetContracts = [],
  liveDepth = null,
  broker5DPayload = null,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<StockInfoTabKey>("OVERVIEW");
  const [whaleOnlyFilter, setWhaleOnlyFilter] = useState(false);
  const [excludeInternalCross, setExcludeInternalCross] = useState(false);
  const [brokerFilterQuery, setBrokerFilterQuery] = useState("");

  const resolvedSymbol = resolveValidNepseSymbol(
    symbol,
    selectedScrip?.symbol,
    selectedScrip?.ticker,
    selectedScrip?.stockSymbol,
    quoteData?.symbol,
    ledgerTelemetry?.symbol
  );

  // Single atomic calculation feeding all 6 tabs
  const telemetry = useMemo(
    () =>
      buildUnifiedStockTabTelemetry({
        symbol: resolvedSymbol,
        quote: quoteData,
        candles: historicalCandles,
        ledgerTelemetry,
        rawContracts: rawFloorsheetContracts,
        liveDepth,
        broker5DRawPayload: broker5DPayload,
      }),
    [
      resolvedSymbol,
      quoteData,
      historicalCandles,
      ledgerTelemetry,
      rawFloorsheetContracts,
      liveDepth,
      broker5DPayload,
    ]
  );

  // Filtered floorsheet rows for the Floorsheet Tab
  const filteredFloorsheet = useMemo(() => {
    return telemetry.floorsheetTape.filter((c) => {
      if (whaleOnlyFilter && !c.isWhalePrint) return false;
      if (excludeInternalCross && c.isInternalCross) return false;
      if (brokerFilterQuery.trim() !== "") {
        const q = brokerFilterQuery.trim();
        if (String(c.buyerBroker) !== q && String(c.sellerBroker) !== q) {
          return false;
        }
      }
      return true;
    });
  }, [telemetry.floorsheetTape, whaleOnlyFilter, excludeInternalCross, brokerFilterQuery]);

  const tabs: Array<{ key: StockInfoTabKey; label: string; badge?: string | number }> = [
    { key: "OVERVIEW", label: "Overview" },
    {
      key: "MARKET_DEPTH",
      label: "Market Depth",
      badge: telemetry.marketDepth.source === "LIVE_L2_ORDERBOOK" ? "L2 Live" : "VAP",
    },
    {
      key: "BROKER_FLOW",
      label: "Broker Flow & Smart Money",
      badge: `${telemetry.smartMoney5D.netAccumulationRatio}%`,
    },
    {
      key: "FLOORSHEET",
      label: "Floorsheet",
      badge: telemetry.overview.totalContracts,
    },
    {
      key: "VOLUME_PROFILE",
      label: "Volume Profile (POC)",
      badge: telemetry.volumeProfile.pocPrice ? `Rs ${telemetry.volumeProfile.pocPrice}` : undefined,
    },
    { key: "AI_GURU_TOOLS", label: "AI Guru & Tools" },
  ];

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] min-h-0 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Top Scrip Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-bold tracking-tight text-white">
                {telemetry.symbol}
              </span>
              {selectedScrip?.sector && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {selectedScrip.sector}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {telemetry.overview.priceAsOfLabel}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Session VWAP:{" "}
              <span className="text-slate-200 font-medium">
                Rs {telemetry.overview.sessionVwap.toLocaleString()}
              </span>{" "}
              ({telemetry.overview.vwapSpreadPct >= 0 ? "+" : ""}
              {telemetry.overview.vwapSpreadPct}% vs VWAP) • Contracts:{" "}
              <span className="text-slate-200 font-medium">
                {telemetry.overview.totalContracts.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-bold text-white">
              {telemetry.overview.verifiedPrice !== null
                ? `Rs ${telemetry.overview.verifiedPrice.toLocaleString()}`
                : "N/A"}
            </div>
            <div className="text-xs text-slate-400">
              Buy Aggressor:{" "}
              <span className="text-emerald-400 font-semibold">
                {telemetry.overview.buyAggressorPct}%
              </span>{" "}
              / Sell:{" "}
              <span className="text-rose-400 font-semibold">
                {telemetry.overview.sellAggressorPct}%
              </span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close Modal"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sticky Navigation Tabs */}
      <div className="sticky top-0 z-20 bg-slate-900/95 border-b border-slate-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded ${
                    active ? "bg-indigo-800 text-indigo-100" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "OVERVIEW" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Session Turnover</div>
              <div className="text-base font-bold text-white mt-1">
                Rs {telemetry.overview.totalSessionTurnover.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400">
                Vol: {telemetry.overview.totalSessionKitta.toLocaleString()} kitta
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Avg Ticket / Whale Prints</div>
              <div className="text-base font-bold text-indigo-300 mt-1">
                {telemetry.overview.avgContractKitta} kitta
              </div>
              <div className="text-[11px] text-slate-400">
                Whale Prints (&ge;500 kitta): {telemetry.overview.whaleContractCount}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Internal Broker Cross</div>
              <div className="text-base font-bold text-amber-300 mt-1">
                {telemetry.overview.internalCrossVolumePct}% of Vol
              </div>
              <div className="text-[11px] text-slate-400">
                Same Buyer &amp; Seller Broker
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Point of Control (POC)</div>
              <div className="text-base font-bold text-emerald-300 mt-1">
                {telemetry.volumeProfile.pocPrice
                  ? `Rs ${telemetry.volumeProfile.pocPrice}`
                  : "N/A"}
              </div>
              <div className="text-[11px] text-slate-400">
                Highest Floorsheet Volume Node
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MARKET DEPTH (Live L2 + Floorsheet VAP Fallback) */}
        {activeTab === "MARKET_DEPTH" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-300 font-medium">
                {telemetry.marketDepth.asOfLabel}
              </span>
              <span className="text-slate-400">
                Bid Demand:{" "}
                <strong className="text-emerald-400">
                  {telemetry.marketDepth.bidRatioPct}%
                </strong>{" "}
                ({telemetry.marketDepth.totalBidKitta.toLocaleString()} vs{" "}
                {telemetry.marketDepth.totalAskKitta.toLocaleString()} kitta)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Bids / Demand Walls */}
              <div className="rounded-lg border border-emerald-500/20 bg-slate-900/70 p-3">
                <div className="font-semibold text-emerald-300 mb-2">
                  Demand / Buy Queue (Top 5)
                </div>
                {telemetry.marketDepth.bids.length === 0 ? (
                  <div className="text-slate-500">No bid levels recorded</div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-1">Orders</th>
                        <th className="pb-1">Kitta</th>
                        <th className="pb-1 text-right">Bid Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {telemetry.marketDepth.bids.map((b, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 text-slate-400">{b.orders}</td>
                          <td className="py-1.5 font-medium text-slate-200">
                            {b.kitta.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-bold text-emerald-400">
                            Rs {b.price}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Asks / Supply Walls */}
              <div className="rounded-lg border border-rose-500/20 bg-slate-900/70 p-3">
                <div className="font-semibold text-rose-300 mb-2">
                  Supply / Sell Queue (Top 5)
                </div>
                {telemetry.marketDepth.asks.length === 0 ? (
                  <div className="text-slate-500">No ask levels recorded</div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-1">Ask Price</th>
                        <th className="pb-1">Kitta</th>
                        <th className="pb-1 text-right">Orders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {telemetry.marketDepth.asks.map((a, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 font-bold text-rose-400">
                            Rs {a.price}
                          </td>
                          <td className="py-1.5 font-medium text-slate-200">
                            {a.kitta.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right text-slate-400">
                            {a.orders}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BROKER FLOW & SMART MONEY */}
        {activeTab === "BROKER_FLOW" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-emerald-500/20 bg-slate-900 p-3">
              <div className="font-semibold text-emerald-300 mb-2">
                Top 5 Institutional Accumulators (Baseline-Deflated)
              </div>
              {telemetry.smartMoney5D.topAccumulators.map((b) => (
                <div
                  key={b.brokerId}
                  className="flex items-center justify-between py-1.5 border-b border-slate-800/70"
                >
                  <span className="font-medium text-white">Broker #{b.brokerId}</span>
                  <span className="text-emerald-400 font-semibold">
                    +{b.netKitta.toLocaleString()} kitta
                  </span>
                  <span className="text-indigo-300">
                    {b.anomalyScore.toFixed(2)}x • Avg {b.avgTicketKitta}k
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-rose-500/20 bg-slate-900 p-3">
              <div className="font-semibold text-rose-300 mb-2">
                Top 5 Net Distributors
              </div>
              {telemetry.smartMoney5D.topDistributors.map((b) => (
                <div
                  key={b.brokerId}
                  className="flex items-center justify-between py-1.5 border-b border-slate-800/70"
                >
                  <span className="font-medium text-white">Broker #{b.brokerId}</span>
                  <span className="text-rose-400 font-semibold">
                    {b.netKitta.toLocaleString()} kitta
                  </span>
                  <span className="text-slate-400">
                    Avg {b.avgTicketKitta} kitta/trade
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: FLOORSHEET TAPE (With Whale & Internal Cross Filters) */}
        {activeTab === "FLOORSHEET" && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <input
                type="text"
                placeholder="Filter by Broker # (e.g. 28)"
                value={brokerFilterQuery}
                onChange={(e) => setBrokerFilterQuery(e.target.value)}
                className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 text-xs"
              />
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={whaleOnlyFilter}
                  onChange={(e) => setWhaleOnlyFilter(e.target.checked)}
                />
                <span>Whale Prints Only (&ge;500 kitta)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={excludeInternalCross}
                  onChange={(e) => setExcludeInternalCross(e.target.checked)}
                />
                <span>Hide Self-Cross (Buyer == Seller)</span>
              </label>
            </div>

            <div className="rounded-lg border border-slate-800 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2">Contract #</th>
                    <th className="p-2">Buyer</th>
                    <th className="p-2">Seller</th>
                    <th className="p-2 text-right">Kitta</th>
                    <th className="p-2 text-right">Rate</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-center">Tape Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredFloorsheet.slice(0, 100).map((c) => (
                    <tr key={c.contractNo} className="hover:bg-slate-900/50">
                      <td className="p-2 font-mono text-slate-400">
                        {c.contractNo.slice(-8)}
                      </td>
                      <td className="p-2 font-semibold text-emerald-300">
                        #{c.buyerBroker}
                      </td>
                      <td className="p-2 font-semibold text-rose-300">
                        #{c.sellerBroker}
                      </td>
                      <td className="p-2 text-right font-medium text-white">
                        {c.kitta.toLocaleString()}
                      </td>
                      <td className="p-2 text-right text-slate-200">
                        Rs {c.rate}
                      </td>
                      <td className="p-2 text-right text-slate-300">
                        Rs {c.amount.toLocaleString()}
                      </td>
                      <td className="p-2 text-center space-x-1">
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
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300">
                            WHALE
                          </span>
                        )}
                        {c.isInternalCross && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">
                            CROSS
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: VOLUME PROFILE (POC) */}
        {activeTab === "VOLUME_PROFILE" && (
          <div className="space-y-2 text-xs">
            {telemetry.volumeProfile.nodes.map((node) => (
              <div
                key={node.priceBucket}
                className={`p-2 rounded-lg border ${
                  node.isPoc
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="font-bold text-white">
                    Rs {node.priceBucket}{" "}
                    {node.isPoc && (
                      <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        POC (Max Liquidity Node)
                      </span>
                    )}
                  </span>
                  <span className="text-slate-300">
                    {node.totalKitta.toLocaleString()} kitta ({node.pctOfTotalVolume}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-slate-800 overflow-hidden flex">
                  <div
                    style={{
                      width: `${
                        node.totalKitta > 0
                          ? (node.buyKitta / node.totalKitta) * node.pctOfTotalVolume
                          : 0
                      }%`,
                    }}
                    className="bg-emerald-500"
                  />
                  <div
                    style={{
                      width: `${
                        node.totalKitta > 0
                          ? (node.sellKitta / node.totalKitta) * node.pctOfTotalVolume
                          : 0
                      }%`,
                    }}
                    className="bg-rose-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 6: AI GURU & QUANT TOOLS */}
        {activeTab === "AI_GURU_TOOLS" && (
          <AiGuruQuantitativeCard
            symbol={telemetry.symbol}
            quoteData={quoteData}
            historicalCandles={historicalCandles}
            ledgerTelemetry={ledgerTelemetry}
            broker5DPayload={broker5DPayload}
          />
        )}
      </div>
    </div>
  );
};

export default StockInformationHubModal;
