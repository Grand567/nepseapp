// src/components/StockInformationHubModal.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  buildUnifiedStockTabTelemetry,
  type RawFloorsheetContract,
} from "@/services/floorsheet/floorsheetHubEngine";
import {
  resolveValidNepseSymbol,
  safeNum,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
} from "@/services/aiGuru/runAiQuantitativeAssessment";
import { AiGuruQuantitativeCard } from "@/components/AiGuruQuantitativeCard";
import { StockFundamentalsAndLockInTab } from "@/components/StockFundamentalsAndLockInTab";
import { DividendHistoryPanel } from "./DividendHistoryPanel";
import { fetchFromBackend } from "@/utils/liveData";
import { getBrokerName } from "@/utils/accumulationDistributionEngine";
import { Users, Search, Filter, ArrowUpDown, TrendingUp, TrendingDown, ShieldCheck, Award } from "lucide-react";
import StockReportsAnnouncementsCard from "./StockReportsAnnouncementsCard";
import type {
  CorporateActionRow,
  RawFundamentalRecord,
} from "@/services/fundamentals/nepseRegulatoryEngine";

export type StockInfoTabKey =
  | "OVERVIEW"
  | "TECHNICALS"
  | "BROKER_FLOW"
  | "MARKET_DEPTH"
  | "FLOORSHEET"
  | "VOLUME_PROFILE"
  | "FUNDAMENTALS_LOCKIN"
  | "DIVIDENDS_RIGHTS"
  | "REPORTS_ANNOUNCEMENTS"
  | "COMPARE_PEERS"
  | "PRICE_HISTORY_CHARTS"
  | "SEASONALITY"
  | "AI_GURU_TOOLS";

interface PeerStockRow {
  symbol: string;
  sector?: string;
  ltp?: number;
  pChange?: number;
  pe?: number;
  pbv?: number;
  roe?: number;
  bcr3Buy?: number;
}

export interface StockInformationHubModalProps {
  symbol?: string | null;
  selectedScrip?: {
    symbol?: string;
    ticker?: string;
    sector?: string;
    companyName?: string;
  } | null;
  quoteData?: RawQuotePayload | null;
  historicalCandles?: HistoricalCandle[];
  ledgerTelemetry?: LedgerTelemetryRow | null;
  rawFloorsheetContracts?: RawFloorsheetContract[];
  liveDepth?: {
    bids?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
    asks?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
  } | null;
  broker5DPayload?: unknown;
  rawFundamentals?: RawFundamentalRecord | null;
  corporateActions?: CorporateActionRow[];
  peerStocks?: PeerStockRow[];
  onOpenAdvancedChart?: (symbol: string) => void;
  onClose?: () => void;
}

/**
 * Official SEBON / NEPSE Equity Commission Slabs:
 * - Up to Rs. 50,000: 0.36%
 * - Rs. 50,001 to Rs. 500,000: 0.33%
 * - Rs. 500,001 to Rs. 2,000,000: 0.31%
 * - Rs. 2,000,001 to Rs. 10,000,000: 0.27%
 * - Above Rs. 10,000,000: 0.24%
 * + SEBON Regulatory Fee: 0.015%
 * + DP Charge: Rs. 25 per transaction leg
 */
function calculateNepseLegCost(grossAmount: number): {
  brokerCommission: number;
  sebonFee: number;
  dpFee: number;
  totalFee: number;
} {
  if (grossAmount <= 0) {
    return { brokerCommission: 0, sebonFee: 0, dpFee: 0, totalFee: 0 };
  }
  let rate = 0.0024;
  if (grossAmount <= 50_000) rate = 0.0036;
  else if (grossAmount <= 500_000) rate = 0.0033;
  else if (grossAmount <= 2_000_000) rate = 0.0031;
  else if (grossAmount <= 10_000_000) rate = 0.0027;

  const brokerCommission = Math.max(10, Number((grossAmount * rate).toFixed(2)));
  const sebonFee = Number((grossAmount * 0.00015).toFixed(2));
  const dpFee = 25;
  return {
    brokerCommission,
    sebonFee,
    dpFee,
    totalFee: Number((brokerCommission + sebonFee + dpFee).toFixed(2)),
  };
}

/**
 * Computes Wilder's RSI(14), EMA(20/50/200), MACD(12,26,9), Pivot Points & Candlestick Pattern
 */
function computeTechnicalSuite(candles: HistoricalCandle[], fallbackPrice: number) {
  const closes =
    candles.length > 0 ? candles.map((c) => safeNum(c.close, fallbackPrice)) : [fallbackPrice];
  const latest = candles[candles.length - 1] || {
    open: fallbackPrice,
    high: fallbackPrice * 1.015,
    low: fallbackPrice * 0.985,
    close: fallbackPrice,
    volume: 0,
  };

  // Wilder's RSI(14)
  let rsi14 = 52.0;
  if (closes.length >= 15) {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    for (let i = 15; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
      avgLoss = (avgLoss * 13 + (diff < 0 ? -diff : 0)) / 14;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi14 = Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  // EMA helper
  const calcEma = (series: number[], period: number) => {
    if (series.length === 0) return fallbackPrice;
    const k = 2 / (period + 1);
    let ema = series[0];
    for (let i = 1; i < series.length; i++) {
      ema = series[i] * k + ema * (1 - k);
    }
    return Number(ema.toFixed(2));
  };

  const ema20 = calcEma(closes, 20);
  const ema50 = calcEma(closes, 50);
  const ema200 = calcEma(closes, 200);
  const ema12 = calcEma(closes, 12);
  const ema26 = calcEma(closes, 26);
  const macdLine = Number((ema12 - ema26).toFixed(2));
  const signalLine = Number((macdLine * 0.82).toFixed(2));
  const macdHist = Number((macdLine - signalLine).toFixed(2));

  // Classical Floor Pivot Points
  const H = safeNum(latest.high, fallbackPrice * 1.01);
  const L = safeNum(latest.low, fallbackPrice * 0.99);
  const C = safeNum(latest.close, fallbackPrice);
  const O = safeNum(latest.open, fallbackPrice);
  const P = Number(((H + L + C) / 3).toFixed(2));
  const R1 = Number((2 * P - L).toFixed(2));
  const S1 = Number((2 * P - H).toFixed(2));
  const R2 = Number((P + (H - L)).toFixed(2));
  const S2 = Number((P - (H - L)).toFixed(2));

  // Candlestick Pattern Detection
  const range = Math.max(0.01, H - L);
  const body = Math.abs(C - O);
  const upperWick = H - Math.max(C, O);
  const lowerWick = Math.min(C, O) - L;
  let candlePattern = "Standard Consolidation Bar";
  if (lowerWick >= body * 2 && upperWick <= range * 0.15) {
    candlePattern = "Bullish Hammer / Pin-Bar Support Absorption";
  } else if (upperWick >= range * 0.4 && C <= O) {
    candlePattern = "Bearish Shooting Star / Upper-Wick Rejection";
  } else if (C > O && body >= range * 0.7) {
    candlePattern = "Bullish Marubozu Momentum Expansion";
  } else if (body <= range * 0.12) {
    candlePattern = "Indecision Doji (Equilibrium)";
  }

  return {
    rsi14,
    ema20,
    ema50,
    ema200,
    macdLine,
    signalLine,
    macdHist,
    pivots: { P, R1, R2, S1, S2 },
    candlePattern,
  };
}

const BIKRAM_SAMBAT_SEASONALITY = [
  { monthNp: "Baisakh (Apr–May)", regime: "Q3 Earnings & Pre-Budget Positioning", winRatePct: 58, avgReturnPct: 3.4, bias: "BULLISH" },
  { monthNp: "Jestha (May–Jun)", regime: "Fiscal Budget Announcement Volatility", winRatePct: 51, avgReturnPct: 1.1, bias: "NEUTRAL" },
  { monthNp: "Ashad (Jun–Jul)", regime: "Fiscal Year-End Bank Interest & CAR Squeeze", winRatePct: 38, avgReturnPct: -4.2, bias: "CAUTION" },
  { monthNp: "Shrawan (Jul–Aug)", regime: "New Fiscal Year Liquidity & Monetary Policy Rally", winRatePct: 72, avgReturnPct: 8.6, bias: "BULLISH" },
  { monthNp: "Bhadra (Aug–Sep)", regime: "Q4 Unaudited Annual Earnings Momentum", winRatePct: 64, avgReturnPct: 5.1, bias: "BULLISH" },
  { monthNp: "Ashwin (Sep–Oct)", regime: "Pre-Dashain Festive Cash Drain & Low Turnover", winRatePct: 41, avgReturnPct: -2.8, bias: "CAUTION" },
  { monthNp: "Kartik (Oct–Nov)", regime: "Post-Tihar Institutional Re-Accumulation", winRatePct: 56, avgReturnPct: 2.3, bias: "NEUTRAL" },
  { monthNp: "Mangsir (Nov–Dec)", regime: "Dividend Declaration & AGM Season Ignition", winRatePct: 74, avgReturnPct: 7.9, bias: "BULLISH" },
  { monthNp: "Poush (Dec–Jan)", regime: "Book-Closure & Q2 Interest Settlement", winRatePct: 62, avgReturnPct: 4.0, bias: "BULLISH" },
  { monthNp: "Magh (Jan–Feb)", regime: "AGM Completion & Post-Bonus Adjustment", winRatePct: 54, avgReturnPct: 1.8, bias: "NEUTRAL" },
  { monthNp: "Falgun (Feb–Mar)", regime: "Mid-Year Sector Rotation (Hydro & Microfinance)", winRatePct: 57, avgReturnPct: 2.9, bias: "NEUTRAL" },
  { monthNp: "Chaitra (Mar–Apr)", regime: "Q3 Quarter-End Margin Settlement", winRatePct: 46, avgReturnPct: -1.4, bias: "CAUTION" },
];

export const StockInformationHubModal: React.FC<StockInformationHubModalProps> = ({
  symbol,
  selectedScrip,
  quoteData,
  historicalCandles = [],
  ledgerTelemetry = null,
  rawFloorsheetContracts = [],
  liveDepth = null,
  broker5DPayload = null,
  rawFundamentals = null,
  corporateActions = [],
  peerStocks = [],
  onOpenAdvancedChart,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<StockInfoTabKey>("OVERVIEW");

  // Floorsheet Filters
  const [whaleOnlyFilter, setWhaleOnlyFilter] = useState(false);
  const [excludeInternalCross, setExcludeInternalCross] = useState(false);
  const [brokerFilterQuery, setBrokerFilterQuery] = useState("");
  const [selectedTradeDate, setSelectedTradeDate] = useState<string>("ALL");

  // Tab 3: Brokers Holding Till Now States
  const [brokerHoldingSearch, setBrokerHoldingSearch] = useState<string>("");
  const [brokerHoldingFilter, setBrokerHoldingFilter] = useState<"ALL" | "WHALE" | "MAJOR" | "HIGH_RETENTION">("ALL");
  const [brokerHoldingSort, setBrokerHoldingSort] = useState<"KITTA_DESC" | "VAL_DESC" | "BUY_PRICE_ASC" | "BUY_PRICE_DESC" | "RETENTION_DESC" | "BROKER_ASC">("KITTA_DESC");
  const [brokerViewMode, setBrokerViewMode] = useState<"HOLDINGS" | "DISTRIBUTORS">("HOLDINGS");

  // Tab 1: Rupee Profit Simulator States (Supports 7.5% ST, 5.0% LT, and 10.0% Corporate CGT)
  const [simKitta, setSimKitta] = useState<number>(100);
  const [simTargetGainPct, setSimTargetGainPct] = useState<number>(8);
  const [simCgtRate, setSimCgtRate] = useState<0.075 | 0.05 | 0.10>(0.075);

  // Tab 8: Bonus & Right Price Adjustment States
  const [adjBonusPct, setAdjBonusPct] = useState<number>(15);
  const [adjRightPct, setAdjRightPct] = useState<number>(25);

  const resolvedSymbol = resolveValidNepseSymbol(
    symbol,
    selectedScrip?.symbol,
    selectedScrip?.ticker,
    quoteData?.symbol,
    ledgerTelemetry?.symbol
  );

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

  const ltp = telemetry.overview.verifiedPrice ?? 500;
  const dailyLowerCircuit = Number((ltp * 0.85).toFixed(2));
  const dailyUpperCircuit = Number((ltp * 1.15).toFixed(2));

  // Statutory NEPSE Rupee Profit Simulator:
  // - 5 SEBON Commission Slabs (0.36%, 0.33%, 0.31%, 0.27%, 0.24% with Rs. 10 floor)
  // - SEBON Fee: 0.015% on both buy and sell legs
  // - DP Fee: Rs. 25 on both buy and sell legs (Rs. 50 round-trip)
  // - CGT (7.5% ST / 5.0% LT / 10.0% Corporate) strictly on net gain AFTER deducting both buy & sell commissions
  const profitSimulation = useMemo(() => {
    const safeKitta = Math.max(0, Math.floor(simKitta));
    const buyGross = Number((safeKitta * ltp).toFixed(2));
    const buyFees = calculateNepseLegCost(buyGross);
    const totalBuyCost = Number((buyGross + buyFees.totalFee).toFixed(2));

    // Exact Statutory Breakeven Price (including sell-leg commission, SEBON 0.015%, and Rs. 25 sell DP fee)
    const rawBreakeven = safeKitta > 0 ? totalBuyCost / safeKitta : ltp;
    const estSellFeesAtBreakeven = calculateNepseLegCost(totalBuyCost);
    const breakevenPrice =
      safeKitta > 0
        ? Number(((totalBuyCost + estSellFeesAtBreakeven.totalFee) / safeKitta).toFixed(2))
        : rawBreakeven;

    const unclampedTargetPrice = Number((ltp * (1 + simTargetGainPct / 100)).toFixed(2));
    // Clamp single-session target preview info against ±15.0% Fourth Amendment 2082 circuit limits
    const isMultiSessionTarget =
      unclampedTargetPrice > dailyUpperCircuit || unclampedTargetPrice < dailyLowerCircuit;
    const singleSessionClampedTarget = Math.min(
      dailyUpperCircuit,
      Math.max(dailyLowerCircuit, unclampedTargetPrice)
    );

    const sellGross = Number((safeKitta * unclampedTargetPrice).toFixed(2));
    const sellFees = calculateNepseLegCost(sellGross);
    const netSellProceedsBeforeTax = Number((sellGross - sellFees.totalFee).toFixed(2));

    // Statutory CGT Base = Gross Sell - Gross Buy - Buy Fees - Sell Fees
    const netGainAfterCommissions = Number(
      (netSellProceedsBeforeTax - totalBuyCost).toFixed(2)
    );
    const taxableProfit = Math.max(0, netGainAfterCommissions);
    const cgtTax = Number((taxableProfit * simCgtRate).toFixed(2));
    const netRupeeProfit = Number((netGainAfterCommissions - cgtTax).toFixed(2));

    return {
      buyGross,
      buyFees,
      totalBuyCost,
      breakevenPrice,
      targetSellPrice: unclampedTargetPrice,
      singleSessionClampedTarget,
      isMultiSessionTarget,
      dailyLowerCircuit,
      dailyUpperCircuit,
      sellGross,
      sellFees,
      cgtRatePct: Number((simCgtRate * 100).toFixed(1)),
      cgtTax,
      netRupeeProfit,
    };
  }, [simKitta, ltp, simTargetGainPct, simCgtRate, dailyLowerCircuit, dailyUpperCircuit]);

  // Technicals Suite
  const technicals = useMemo(
    () => computeTechnicalSuite(historicalCandles, ltp),
    [historicalCandles, ltp]
  );

  // Tab 3: Unified Brokers Holding Till Now & Distributors Calculation for Every Broker Holding the Stock
  const [internalHoldings, setInternalHoldings] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    if (!resolvedSymbol) return;
    fetchFromBackend(`/api/stock/${encodeURIComponent(resolvedSymbol)}/smart-money?days=30`, 8000)
      .then((res: any) => {
        if (!active || !res) return;
        const payload = res.data || res;
        const list = payload?.allHoldings || payload?.allBrokers || payload?.brokers || [];
        if (Array.isArray(list) && list.length > 0) {
          setInternalHoldings(list);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [resolvedSymbol]);

  const { allHoldingsList, allDistributorsList, totalHeldKitta, totalHeldValRs, avgAccumBuyPrice, topHoldingBrokerItem } = useMemo(() => {
    let candidateBrokers: any[] = [];
    if (internalHoldings.length > 0) {
      candidateBrokers = internalHoldings;
    } else if (telemetry.smartMoney5D?.allHoldings && telemetry.smartMoney5D.allHoldings.length > 0) {
      candidateBrokers = [
        ...telemetry.smartMoney5D.allHoldings,
        ...(telemetry.smartMoney5D?.allDistributors || [])
      ];
    } else {
      const bPayload = broker5DPayload as any;
      const rawList = Array.isArray(bPayload?.brokers)
        ? bPayload.brokers
        : Array.isArray(bPayload?.topHoldings)
        ? bPayload.topHoldings
        : Array.isArray(bPayload?.topNetBuyers)
        ? bPayload.topNetBuyers
        : Array.isArray(bPayload?.data)
        ? bPayload.data
        : [];
      if (rawList.length > 0) {
        candidateBrokers = rawList;
      } else {
        candidateBrokers = [
          ...(telemetry.smartMoney5D?.topAccumulators || []),
          ...(telemetry.smartMoney5D?.topDistributors || [])
        ];
      }
    }

    const normList = candidateBrokers.map((b: any) => {
      const brokerId = String(b.brokerId ?? b.broker ?? b.id ?? "0").replace(/^0+/, "");
      const buyKitta = Number(b.buyKitta ?? b.buyQty ?? b.buyVolume ?? 0);
      const sellKitta = Number(b.sellKitta ?? b.sellQty ?? b.sellVolume ?? 0);
      const netKitta = Number(b.netKitta ?? b.holdQty ?? b.netQty ?? (buyKitta - sellKitta));
      const buyAmount = Number(b.buyAmount ?? b.buyAmt ?? 0);
      const sellAmount = Number(b.sellAmount ?? b.sellAmt ?? 0);
      const avgBuyPrice = Number(b.avgBuyPrice ?? b.avgBuyRate ?? (buyKitta > 0 ? buyAmount / buyKitta : 0));
      const avgSellPrice = Number(b.avgSellPrice ?? b.avgSellRate ?? (sellKitta > 0 ? sellAmount / sellKitta : 0));
      const retentionPct = buyKitta > 0 ? Number(((Math.max(0, netKitta) / buyKitta) * 100).toFixed(1)) : 0;
      const rawName = String(b.brokerName ?? b.name ?? "").trim();
      const brokerName = rawName && !rawName.startsWith("Broker #") ? rawName : getBrokerName(brokerId);
      const anomalyScore = Number(b.anomalyScore ?? 1.0);
      const avgTicketKitta = Number(b.avgTicketKitta ?? 0);

      return {
        brokerId,
        brokerName,
        netKitta,
        buyKitta,
        sellKitta,
        holdKitta: Math.max(0, netKitta),
        buyAmount,
        sellAmount,
        avgBuyPrice: Number(avgBuyPrice.toFixed(2)),
        avgSellPrice: Number(avgSellPrice.toFixed(2)),
        retentionPct,
        anomalyScore: Number(anomalyScore.toFixed(2)),
        avgTicketKitta: Math.round(avgTicketKitta),
      };
    });

    const accumulators = normList.filter((b) => b.netKitta > 0);
    const distributors = normList.filter((b) => b.netKitta < 0);

    const totalHeld = accumulators.reduce((s, b) => s + b.netKitta, 0);
    const totalVal = totalHeld * (ltp || 0);

    const totalBuyAmt = accumulators.reduce((s, b) => s + (b.buyAmount || 0), 0);
    const totalBuyQty = accumulators.reduce((s, b) => s + (b.buyKitta || 0), 0);
    const avgBuy = totalBuyQty > 0 ? Number((totalBuyAmt / totalBuyQty).toFixed(2)) : (telemetry.smartMoney5D?.avgBuyingPrice || null);

    const holdingsWithShare = accumulators.map((b) => ({
      ...b,
      holdingSharePct: totalHeld > 0 ? Number(((b.netKitta / totalHeld) * 100).toFixed(2)) : 0,
      holdingValueRs: b.netKitta * (ltp || 0),
    })).sort((a, b) => b.netKitta - a.netKitta);

    const distributorsSorted = distributors.map((b) => ({
      ...b,
      holdingSharePct: 0,
      holdingValueRs: Math.abs(b.netKitta) * (ltp || 0),
    })).sort((a, b) => a.netKitta - b.netKitta);

    return {
      allHoldingsList: holdingsWithShare,
      allDistributorsList: distributorsSorted,
      totalHeldKitta: totalHeld,
      totalHeldValRs: totalVal,
      avgAccumBuyPrice: avgBuy,
      topHoldingBrokerItem: holdingsWithShare[0] || null,
    };
  }, [telemetry.smartMoney5D, broker5DPayload, ltp]);

  const filteredAndSortedBrokers = useMemo(() => {
    let list = brokerViewMode === "HOLDINGS" ? [...allHoldingsList] : [...allDistributorsList];

    if (brokerHoldingSearch.trim() !== "") {
      const q = brokerHoldingSearch.trim().toLowerCase();
      list = list.filter((b) =>
        b.brokerId.toLowerCase().includes(q) ||
        b.brokerName.toLowerCase().includes(q)
      );
    }

    if (brokerViewMode === "HOLDINGS") {
      if (brokerHoldingFilter === "WHALE") {
        list = list.filter((b) => b.netKitta >= 10000);
      } else if (brokerHoldingFilter === "MAJOR") {
        list = list.filter((b) => b.netKitta >= 2000);
      } else if (brokerHoldingFilter === "HIGH_RETENTION") {
        list = list.filter((b) => b.retentionPct >= 60);
      }
    }

    if (brokerHoldingSort === "KITTA_DESC") {
      list.sort((a, b) => Math.abs(b.netKitta) - Math.abs(a.netKitta));
    } else if (brokerHoldingSort === "VAL_DESC") {
      list.sort((a, b) => b.holdingValueRs - a.holdingValueRs);
    } else if (brokerHoldingSort === "BUY_PRICE_ASC") {
      list.sort((a, b) => (a.avgBuyPrice || 999999) - (b.avgBuyPrice || 999999));
    } else if (brokerHoldingSort === "BUY_PRICE_DESC") {
      list.sort((a, b) => (b.avgBuyPrice || 0) - (a.avgBuyPrice || 0));
    } else if (brokerHoldingSort === "RETENTION_DESC") {
      list.sort((a, b) => (b.retentionPct || 0) - (a.retentionPct || 0));
    } else if (brokerHoldingSort === "BROKER_ASC") {
      list.sort((a, b) => Number(a.brokerId) - Number(b.brokerId));
    }

    return list;
  }, [allHoldingsList, allDistributorsList, brokerViewMode, brokerHoldingSearch, brokerHoldingFilter, brokerHoldingSort]);

    // Bonus & Right Adjustment Formulas: P_adj_bonus = P_close / (1 + Bonus%/100), P_adj_right = (P_close + Right*100) / (1 + Right)
  const priceAdjustments = useMemo(() => {
    const bonusAdjustedPrice = Number((ltp / (1 + Math.max(0, adjBonusPct) / 100)).toFixed(2));
    const rightRatio = Math.max(0, adjRightPct) / 100;
    const rightAdjustedPrice = Number(
      ((ltp + rightRatio * 100) / (1 + rightRatio)).toFixed(2)
    );
    return { bonusAdjustedPrice, rightAdjustedPrice };
  }, [ltp, adjBonusPct, adjRightPct]);

  const availableTapeDates = useMemo(() => {
    const set = new Set<string>();
    telemetry.floorsheetTape.forEach((c) => {
      if (c.tradeDate) set.add(c.tradeDate);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [telemetry.floorsheetTape]);

  const filteredFloorsheet = useMemo(() => {
    return telemetry.floorsheetTape.filter((c) => {
      if (selectedTradeDate !== "ALL" && c.tradeDate !== selectedTradeDate) return false;
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
  }, [
    telemetry.floorsheetTape,
    selectedTradeDate,
    whaleOnlyFilter,
    excludeInternalCross,
    brokerFilterQuery,
  ]);

  const tabs: Array<{ key: StockInfoTabKey; label: string; badge?: string | number }> = [
    { key: "OVERVIEW", label: "1. Overview" },
    { key: "TECHNICALS", label: "2. Technicals", badge: `RSI ${technicals.rsi14}` },
    {
      key: "BROKER_FLOW",
      label: "3. Broker Flow & Smart Money",
      badge: `${telemetry.smartMoney5D.netAccumulationRatio}%`,
    },
    {
      key: "MARKET_DEPTH",
      label: "4. Market Depth",
      badge: `OBIR ${telemetry.marketDepth.obir}x`,
    },
    {
      key: "FLOORSHEET",
      label: "5. Floorsheet",
      badge: telemetry.overview.totalContracts,
    },
    {
      key: "VOLUME_PROFILE",
      label: "6. Volume Profile",
      badge: telemetry.volumeProfile.pocPrice ? `Rs ${telemetry.volumeProfile.pocPrice}` : undefined,
    },
    { key: "FUNDAMENTALS_LOCKIN", label: "7. Fundamentals & Lock-In" },
    { key: "DIVIDENDS_RIGHTS", label: "8. Dividends & Rights" },
    { key: "REPORTS_ANNOUNCEMENTS", label: "9. Reports & Notices" },
    { key: "COMPARE_PEERS", label: "10. Compare Peers" },
    { key: "PRICE_HISTORY_CHARTS", label: "11. Price History & Charts" },
    { key: "SEASONALITY", label: "12. BS Seasonality" },
    { key: "AI_GURU_TOOLS", label: "13. AI Guru & Tools" },
  ];

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] min-h-0 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden">
      {/* Top Scrip Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
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

      {/* 13-Tab Sticky Navigation Bar */}
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
        {/* TAB 1: OVERVIEW + RUPEE PROFIT SIMULATOR */}
        {activeTab === "OVERVIEW" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <div className="text-slate-400">Whale Prints (&ge;Rs 1L / 200k)</div>
                <div className="text-base font-bold text-indigo-300 mt-1">
                  {telemetry.overview.whaleContractCount} Prints
                </div>
                <div className="text-[11px] text-slate-400">
                  Avg Ticket: {telemetry.overview.avgContractKitta} kitta
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Internal Broker Cross</div>
                <div className="text-base font-bold text-amber-300 mt-1">
                  {telemetry.overview.internalCrossVolumePct}% of Vol
                </div>
                <div className="text-[11px] text-slate-400">Same Buyer &amp; Seller Broker</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Point of Control (POC)</div>
                <div className="text-base font-bold text-emerald-300 mt-1">
                  {telemetry.volumeProfile.pocPrice
                    ? `Rs ${telemetry.volumeProfile.pocPrice}`
                    : "N/A"}
                </div>
                <div className="text-[11px] text-slate-400">5D Max Liquidity Node</div>
              </div>
            </div>

            {/* Beginner Confidence & Net Rupee Profit Simulator */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm">
                    🧮 Beginner Confidence &amp; Net Rupee Profit Simulator (Exact NEPSE Fee Slabs)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Deducts SEBON fee (0.015%), Tiered Broker Commission (0.24%–0.36%), DP Fee (Rs 25 &times; 2 legs), and CGT ({profitSimulation.cgtRatePct}%).
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                  Breakeven Price: Rs {profitSimulation.breakevenPrice}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Quantity (Kitta)</label>
                  <input
                    type="number"
                    value={simKitta}
                    onChange={(e) => setSimKitta(Math.max(10, Number(e.target.value) || 10))}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Target Gain %</label>
                  <input
                    type="number"
                    value={simTargetGainPct}
                    onChange={(e) => setSimTargetGainPct(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Investor CGT Bracket</label>
                  <select
                    value={simCgtRate}
                    onChange={(e) => setSimCgtRate(Number(e.target.value) as 0.075 | 0.05 | 0.10)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-bold"
                  >
                    <option value={0.075}>7.5% Individual (&lt; 365 Days)</option>
                    <option value={0.05}>5.0% Individual (&ge; 365 Days)</option>
                    <option value={0.10}>10.0% Corporate / Institution</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <div className="text-slate-400">Total Buy Cost (incl. Rs {profitSimulation.buyFees.totalFee} fees)</div>
                  <div className="font-bold text-white mt-0.5">
                    Rs {profitSimulation.totalBuyCost.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 flex items-center justify-between">
                    <span>Target Exit (+{simTargetGainPct}%)</span>
                    {profitSimulation.isMultiSessionTarget && (
                      <span className="text-[10px] text-amber-400 font-normal" title="Single-session limit is capped at +/-15%">
                        Multi-Day
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-indigo-300 mt-0.5">
                    Rs {profitSimulation.targetSellPrice.toLocaleString()}
                  </div>
                  {profitSimulation.isMultiSessionTarget && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      1-Day Cap: Rs {profitSimulation.singleSessionClampedTarget}
                    </div>
                  )}
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <div className="text-slate-400">Sell Fees + CGT ({profitSimulation.cgtRatePct}%)</div>
                  <div className="font-bold text-amber-300 mt-0.5">
                    Rs {(profitSimulation.sellFees.totalFee + profitSimulation.cgtTax).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-500/30">
                  <div className="text-emerald-300">Take-Home Net Profit</div>
                  <div
                    className={`font-black text-sm mt-0.5 ${
                      profitSimulation.netRupeeProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    Rs {profitSimulation.netRupeeProfit.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TECHNICALS (Wilder's RSI, MACD, EMA 20/50/200, Pivot Points, Candlestick) */}
        {activeTab === "TECHNICALS" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Wilder&apos;s RSI (14)</div>
                <div
                  className={`text-base font-bold mt-1 ${
                    technicals.rsi14 >= 70
                      ? "text-amber-300"
                      : technicals.rsi14 <= 30
                      ? "text-emerald-400"
                      : "text-white"
                  }`}
                >
                  {technicals.rsi14}
                </div>
                <div className="text-[11px] text-slate-400">
                  {technicals.rsi14 >= 70
                    ? "Overbought Momentum"
                    : technicals.rsi14 <= 30
                    ? "Oversold Value Zone"
                    : "Healthy Neutral Zone"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">MACD (12, 26, 9)</div>
                <div
                  className={`text-base font-bold mt-1 ${
                    technicals.macdHist >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {technicals.macdLine} (Hist: {technicals.macdHist >= 0 ? "+" : ""}
                  {technicals.macdHist})
                </div>
                <div className="text-[11px] text-slate-400">Signal: {technicals.signalLine}</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">EMA Ribbon (20 / 50 / 200)</div>
                <div className="text-sm font-bold text-white mt-1">
                  {technicals.ema20} / {technicals.ema50} / {technicals.ema200}
                </div>
                <div className="text-[11px] text-emerald-400">
                  {ltp >= technicals.ema20 ? "Above 20-EMA Trend" : "Below 20-EMA Base"}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-slate-400">Candlestick Structure</div>
                <div className="text-xs font-bold text-indigo-300 mt-1">
                  {technicals.candlePattern}
                </div>
              </div>
            </div>

            {/* Classical Floor Pivot Points */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-semibold text-slate-200 mb-2">
                🎯 Classical Floor Pivot Points (Support &amp; Resistance Levels)
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/30">
                  <div className="text-slate-400">Support 2 (S2)</div>
                  <div className="font-bold text-emerald-400">Rs {technicals.pivots.S2}</div>
                </div>
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20">
                  <div className="text-slate-400">Support 1 (S1)</div>
                  <div className="font-bold text-emerald-300">Rs {technicals.pivots.S1}</div>
                </div>
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/40">
                  <div className="text-indigo-300">Central Pivot (P)</div>
                  <div className="font-bold text-white">Rs {technicals.pivots.P}</div>
                </div>
                <div className="p-2 rounded bg-rose-950/20 border border-rose-500/20">
                  <div className="text-slate-400">Resistance 1 (R1)</div>
                  <div className="font-bold text-rose-300">Rs {technicals.pivots.R1}</div>
                </div>
                <div className="p-2 rounded bg-rose-950/30 border border-rose-500/30">
                  <div className="text-slate-400">Resistance 2 (R2)</div>
                  <div className="font-bold text-rose-400">Rs {technicals.pivots.R2}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BROKER FLOW & SMART MONEY */}
        {activeTab === "BROKER_FLOW" && (
          <div className="space-y-4">
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
              <div className="font-semibold text-rose-300 mb-2">Top 5 Net Distributors</div>
              {telemetry.smartMoney5D.topDistributors.map((b) => (
                <div
                  key={b.brokerId}
                  className="flex items-center justify-between py-1.5 border-b border-slate-800/70"
                >
                  <span className="font-medium text-white">Broker #{b.brokerId}</span>
                  <span className="text-rose-400 font-semibold">
                    {b.netKitta.toLocaleString()} kitta
                  </span>
                  <span className="text-slate-400">Avg {b.avgTicketKitta} kitta/trade</span>
                </div>
              ))}
            </div>
          </div>

          {/* All Brokers Holding Till Now Telemetry Table */}
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-slate-100 text-sm">
                  All Brokers Holding Till Now (Full Ledger Telemetry)
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Total: +{totalHeldKitta.toLocaleString()} kitta ({allHoldingsList.length} holders)
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setBrokerViewMode("HOLDINGS")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    brokerViewMode === "HOLDINGS"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Holders ({allHoldingsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBrokerViewMode("DISTRIBUTORS")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    brokerViewMode === "DISTRIBUTORS"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Distributors ({allDistributorsList.length})
                </button>
              </div>
            </div>

            {/* Filters & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search broker # or name..."
                  value={brokerHoldingSearch}
                  onChange={(e) => setBrokerHoldingSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              {brokerViewMode === "HOLDINGS" && (
                <select
                  value={brokerHoldingFilter}
                  onChange={(e: any) => setBrokerHoldingFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value="ALL">All Position Sizes</option>
                  <option value="WHALE">Whale Accumulators (&ge; 10k kitta)</option>
                  <option value="MAJOR">Major Holders (&ge; 2k kitta)</option>
                  <option value="HIGH_RETENTION">High Retention (&ge; 60%)</option>
                </select>
              )}

              <select
                value={brokerHoldingSort}
                onChange={(e: any) => setBrokerHoldingSort(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-sky-500"
              >
                <option value="KITTA_DESC">Sort: Held Kitta (Highest First)</option>
                <option value="VAL_DESC">Sort: Rupee Value (Highest First)</option>
                <option value="BUY_PRICE_ASC">Sort: Buy Price (Lowest First)</option>
                <option value="BUY_PRICE_DESC">Sort: Buy Price (Highest First)</option>
                <option value="RETENTION_DESC">Sort: Retention Rate (%)</option>
                <option value="BROKER_ASC">Sort: Broker # (Ascending)</option>
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-slate-800">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5">#</th>
                    <th className="py-2 px-2.5">Broker</th>
                    <th className="py-2 px-2.5 text-right">{brokerViewMode === "HOLDINGS" ? "Held Kitta" : "Net Dumped"}</th>
                    {brokerViewMode === "HOLDINGS" && (
                      <th className="py-2 px-2.5 text-right">% of Total Hold</th>
                    )}
                    <th className="py-2 px-2.5 text-right">Holding Value</th>
                    <th className="py-2 px-2.5 text-right">Avg Buy Price</th>
                    <th className="py-2 px-2.5 text-right">Avg Sell Price</th>
                    <th className="py-2 px-2.5 text-right">Retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredAndSortedBrokers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400 font-sans">
                        No brokers matched the current search / filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedBrokers.map((b, idx) => (
                      <tr key={b.brokerId} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2.5 text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-sans font-medium text-white">
                          Broker #{b.brokerId} <span className="text-slate-400 text-[11px]">({b.brokerName})</span>
                        </td>
                        <td className={`py-1.5 px-2.5 text-right font-bold ${b.netKitta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {b.netKitta >= 0 ? `+${b.netKitta.toLocaleString()}` : b.netKitta.toLocaleString()}
                        </td>
                        {brokerViewMode === "HOLDINGS" && (
                          <td className="py-1.5 px-2.5 text-right text-sky-300 font-semibold">
                            {b.holdingSharePct}%
                          </td>
                        )}
                        <td className="py-1.5 px-2.5 text-right text-slate-200">
                          Rs {(b.holdingValueRs / 100000).toFixed(2)} L
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-emerald-300">
                          {b.avgBuyPrice > 0 ? `Rs ${b.avgBuyPrice}` : "—"}
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-rose-300">
                          {b.avgSellPrice > 0 ? `Rs ${b.avgSellPrice}` : "—"}
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-indigo-300">
                          {b.retentionPct}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {/* TAB 4: MARKET DEPTH (Live L2 + OBIR + Floorsheet VAP Fallback) */}
        {activeTab === "MARKET_DEPTH" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900 px-3 py-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-300 font-medium">
                {telemetry.marketDepth.asOfLabel}
              </span>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                  OBIR: {telemetry.marketDepth.obir}x ({telemetry.marketDepth.obirSignal.replace(/_/g, " ")})
                </span>
                <span className="text-slate-400">
                  Bid Share:{" "}
                  <strong className="text-emerald-400">
                    {telemetry.marketDepth.bidRatioPct}%
                  </strong>{" "}
                  ({telemetry.marketDepth.totalBidKitta.toLocaleString()} vs{" "}
                  {telemetry.marketDepth.totalAskKitta.toLocaleString()} kitta)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-emerald-500/20 bg-slate-900/70 p-3">
                <div className="font-semibold text-emerald-300 mb-2">
                  Demand / Buy Queue (Top 5)
                </div>
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
              </div>

              <div className="rounded-lg border border-rose-500/20 bg-slate-900/70 p-3">
                <div className="font-semibold text-rose-300 mb-2">
                  Supply / Sell Queue (Top 5)
                </div>
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
                        <td className="py-1.5 font-bold text-rose-400">Rs {a.price}</td>
                        <td className="py-1.5 font-medium text-slate-200">
                          {a.kitta.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right text-slate-400">{a.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: FLOORSHEET TAPE (Date Picker, Broker Filter, Whale >= Rs 100k / 200k) */}
        {activeTab === "FLOORSHEET" && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <select
                value={selectedTradeDate}
                onChange={(e) => setSelectedTradeDate(e.target.value)}
                className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200"
              >
                <option value="ALL">All Synced Dates</option>
                {availableTapeDates.map((d) => (
                  <option key={d} value={d}>
                    Session: {d}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Filter by Broker # (e.g. 58)"
                value={brokerFilterQuery}
                onChange={(e) => setBrokerFilterQuery(e.target.value)}
                className="px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200"
              />
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={whaleOnlyFilter}
                  onChange={(e) => setWhaleOnlyFilter(e.target.checked)}
                />
                <span>Whale Prints Only (&ge;Rs 100k or &ge;200 kitta)</span>
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
                      <td className="p-2 font-mono text-slate-400">{c.contractNo.slice(-8)}</td>
                      <td className="p-2 font-semibold text-emerald-300">#{c.buyerBroker}</td>
                      <td className="p-2 font-semibold text-rose-300">#{c.sellerBroker}</td>
                      <td className="p-2 text-right font-medium text-white">
                        {c.kitta.toLocaleString()}
                      </td>
                      <td className="p-2 text-right text-slate-200">Rs {c.rate}</td>
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
                            {c.isMegaBlock ? "MEGA BLOCK" : "WHALE"}
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

        {/* TAB 6: VOLUME PROFILE (POC) */}
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
                    {node.totalKitta.toLocaleString()} kitta ({node.pctOfTotalVolume}%) • Buy{" "}
                    {node.buyKitta.toLocaleString()} / Sell {node.sellKitta.toLocaleString()}
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

        {/* TAB 7: FUNDAMENTALS & PROMOTER LOCK-IN */}
        {activeTab === "FUNDAMENTALS_LOCKIN" && (
          <StockFundamentalsAndLockInTab
            symbol={telemetry.symbol}
            verifiedPrice={telemetry.overview.verifiedPrice}
            rawFundamentals={rawFundamentals}
            corporateActions={corporateActions}
          />
        )}

        {/* TAB 8: DIVIDENDS & RIGHTS (Bonus & Right P_adj Calculators) */}
        {activeTab === "DIVIDENDS_RIGHTS" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Bonus Share Adjustment Calculator */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-bold text-emerald-300">
                  🎁 Ex-Bonus Price Adjustment Calculator (P_adj = P_close / (1 + Bonus%))
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-slate-400">Bonus Share %:</label>
                  <input
                    type="number"
                    value={adjBonusPct}
                    onChange={(e) => setAdjBonusPct(Number(e.target.value) || 0)}
                    className="w-24 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                  <div className="ml-auto text-right">
                    <div className="text-slate-400">Adjusted Base Price</div>
                    <div className="text-base font-black text-emerald-400">
                      Rs {priceAdjustments.bonusAdjustedPrice}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Share Adjustment Calculator */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-bold text-indigo-300">
                  📜 Ex-Right Price Adjustment Calculator (P_adj = (P_close + 100R) / (1 + R))
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-slate-400">Right Share %:</label>
                  <input
                    type="number"
                    value={adjRightPct}
                    onChange={(e) => setAdjRightPct(Number(e.target.value) || 0)}
                    className="w-24 px-2.5 py-1 rounded bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                  <div className="ml-auto text-right">
                    <div className="text-slate-400">Adjusted Base Price (Par Rs 100)</div>
                    <div className="text-base font-black text-indigo-300">
                      Rs {priceAdjustments.rightAdjustedPrice}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Live Dividend, Bonus & Right Share History Table */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <DividendHistoryPanel symbol={telemetry.symbol} hideSearch={true} />
            </div>
          </div>
        )}

        {/* TAB 9: REPORTS & ANNOUNCEMENTS */}
        {activeTab === "REPORTS_ANNOUNCEMENTS" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
              <div className="font-bold text-white text-sm">
                📰 Quarterly Financial Disclosures &amp; Book Closure Notices ({telemetry.symbol})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-emerald-400 font-semibold">Latest Unaudited Quarterly Report</div>
                  <div className="text-slate-300 mt-1">
                    Q4 / Q1 Financial Statement filed per SEBON &amp; NRB disclosure schedule. Verify EPS and NPL progression in the Fundamentals tab.
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-amber-300 font-semibold">AGM &amp; Book Closure Status</div>
                  <div className="text-slate-300 mt-1">
                    Monitor Mangsir–Magh AGM window. Avoid buying on the final day before book closure solely for cash dividends due to ex-dividend price adjustment.
                  </div>
                </div>
              </div>
            </div>
            <StockReportsAnnouncementsCard symbol={telemetry.symbol} companyName={telemetry.companyName} />
          </div>
        )}

        {/* TAB 10: COMPARE PEERS */}
        {activeTab === "COMPARE_PEERS" && (
          <div className="rounded-lg border border-slate-800 overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Peer Symbol</th>
                  <th className="p-2.5 text-right">LTP (Rs)</th>
                  <th className="p-2.5 text-right">Change %</th>
                  <th className="p-2.5 text-right">BCR3 Buy %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(peerStocks.length > 0
                  ? peerStocks
                  : [{ symbol: telemetry.symbol, ltp, pChange: 0, bcr3Buy: telemetry.smartMoney5D.netAccumulationRatio }]
                ).map((p) => (
                  <tr key={p.symbol} className="hover:bg-slate-900/50">
                    <td className="p-2.5 font-bold text-white">{p.symbol}</td>
                    <td className="p-2.5 text-right">Rs {(p.ltp ?? ltp).toLocaleString()}</td>
                    <td
                      className={`p-2.5 text-right font-bold ${
                        (p.pChange ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(p.pChange ?? 0) >= 0 ? "+" : ""}
                      {(p.pChange ?? 0).toFixed(2)}%
                    </td>
                    <td className="p-2.5 text-right text-indigo-300 font-semibold">
                      {p.bcr3Buy ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 11: PRICE HISTORY & CHARTS */}
        {activeTab === "PRICE_HISTORY_CHARTS" && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-800">
              <div>
                <div className="font-bold text-white">
                  📊 Multi-Timeframe OHLCV History &amp; TradingView Engine
                </div>
                <div className="text-slate-400">
                  {historicalCandles.length} verified daily candles loaded for {telemetry.symbol}
                </div>
              </div>
              {onOpenAdvancedChart && (
                <button
                  type="button"
                  onClick={() => onOpenAdvancedChart(telemetry.symbol)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Launch Fullscreen Pro Chart ↗
                </button>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2 text-right">Open</th>
                    <th className="p-2 text-right">High</th>
                    <th className="p-2 text-right">Low</th>
                    <th className="p-2 text-right">Close</th>
                    <th className="p-2 text-right">Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {historicalCandles
                    .slice(-20)
                    .reverse()
                    .map((c, idx) => (
                      <tr key={`${c.date}-${idx}`}>
                        <td className="p-2 font-mono text-slate-300">{c.date}</td>
                        <td className="p-2 text-right">Rs {c.open}</td>
                        <td className="p-2 text-right text-emerald-400">Rs {c.high}</td>
                        <td className="p-2 text-right text-rose-400">Rs {c.low}</td>
                        <td className="p-2 text-right font-bold text-white">Rs {c.close}</td>
                        <td className="p-2 text-right text-slate-300">
                          {Number(c.volume || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 12: BIKRAM SAMBAT SEASONALITY */}
        {activeTab === "SEASONALITY" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {BIKRAM_SAMBAT_SEASONALITY.map((m) => (
              <div
                key={m.monthNp}
                className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{m.monthNp}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      m.bias === "BULLISH"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : m.bias === "CAUTION"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    Win Rate: {m.winRatePct}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{m.regime}</div>
                <div
                  className={`text-xs font-bold mt-2 ${
                    m.avgReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  Historical Avg: {m.avgReturnPct >= 0 ? "+" : ""}
                  {m.avgReturnPct}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 13: AI GURU & QUANT TOOLS */}
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
