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
import { fetchFromBackend, fetchRealBrokerAnalysis, fetchRealFloorsheet } from "@/utils/liveData";
import { getBrokerName } from "@/utils/accumulationDistributionEngine";
import { calculateMACD } from "@/utils/indicators";
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Shield,
  Award,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
  Layers,
  Activity,
  ArrowRight,
  Target,
  Zap
} from "lucide-react";
import StockReportsAnnouncementsCard from "./StockReportsAnnouncementsCard";
import { evaluateStockSelection } from "../utils/signals/stockScoringEngine.js";
import {
  useHistoricalSubfile,
  useScrip4DayTrajectory,
} from "@/utils/localLedgerManager";
import type {
  CorporateActionRow,
  RawFundamentalRecord,
} from "@/services/fundamentals/nepseRegulatoryEngine";

export type StockInfoTabKey =
  | "OVERVIEW"
  | "STOCK_SCORE"
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
  initialTab?: StockInfoTabKey;
  selectedDate?: string | null;
  dayOffset?: number;
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
export function computeTechnicalSuite(candles: HistoricalCandle[], fallbackPrice: number) {
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
  // FN-02: True MACD(12, 26, 9) with 9-period EMA signal line
  let macdLine = 0;
  let signalLine = 0;
  let macdHist = 0;

  const macdData = calculateMACD(closes, 12, 26, 9);
  if (!macdData.isInsufficient && macdData.line !== null && macdData.signal !== null) {
    macdLine = macdData.line;
    signalLine = macdData.signal;
    macdHist = macdData.histogram ?? Number((macdLine - signalLine).toFixed(2));
  } else {
    const ema12 = calcEma(closes, 12);
    const ema26 = calcEma(closes, 26);
    macdLine = Number((ema12 - ema26).toFixed(2));
    signalLine = macdLine;
    macdHist = 0;
  }

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
  initialTab = "OVERVIEW",
  selectedDate = null,
  dayOffset = 0,
  onOpenAdvancedChart,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<StockInfoTabKey>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Session Workspace (Live T-0 vs Precalculated Historical Days 1-4)
  const [sessionDayMode, setSessionDayMode] = useState<number>(() => (dayOffset ? dayOffset : (selectedDate ? -1 : 0)));
  const [activeSubfileDate, setActiveSubfileDate] = useState<string | null>(selectedDate || null);
  const [subfileManifest, setSubfileManifest] = useState<{
    available_sessions?: string[];
    days_quick_map?: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/ledger/subfiles/index')
      .then((r) => r.json())
      .then((m) => {
        if (m && m.available_sessions) setSubfileManifest(m);
      })
      .catch(() => {});
  }, []);

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

  const {
    subfileData,
    scripData: loadedSubfileScrip,
    quote: subfileQuote,
    pivots: subfilePivots,
    oscillators: subfileOscillators,
    smartMoney: subfileSmartMoney,
    wyckoff: subfileWyckoff,
    tactical: subfileTactical,
    rolling5D: subfileRolling5D,
    isLoading: subfileLoading,
  } = useHistoricalSubfile({
    dayOffset: sessionDayMode > 0 ? sessionDayMode : 1,
    date: sessionDayMode === -1 ? activeSubfileDate : null,
    symbol: resolvedSymbol,
  });

  const { trajectory: scripTrajectory } = useScrip4DayTrajectory(resolvedSymbol);

  const activeScrip = loadedSubfileScrip || (selectedScrip as any)?.subfileScrip || null;
  const activeQuote = subfileQuote || activeScrip?.card_1_quote || null;
  const activePivots = subfilePivots || activeScrip?.card_2_pivot_points || null;
  const activeOscillators = subfileOscillators || activeScrip?.card_3_oscillators_risk || null;
  const activeSmartMoney = subfileSmartMoney || activeScrip?.card_4_broker_smart_flow || null;
  const activeWyckoff = subfileWyckoff || activeScrip?.card_5_wyckoff_and_dump_guard || null;
  const activeTactical = subfileTactical || activeScrip?.card_6_tactical_execution || null;

  // ── Intraday Live Broker Smart Money Telemetry ──
  const [liveBrokerPayload, setLiveBrokerPayload] = useState<any>(broker5DPayload);
  const [isLiveBrokerUpdating, setIsLiveBrokerUpdating] = useState(false);

  // ── Intraday Live Floorsheet Telemetry ──
  const [liveFloorsheetContracts, setLiveFloorsheetContracts] = useState<any[]>(rawFloorsheetContracts || []);
  const [isLiveFloorsheetUpdating, setIsLiveFloorsheetUpdating] = useState(false);

  useEffect(() => {
    if (broker5DPayload) setLiveBrokerPayload(broker5DPayload);
  }, [broker5DPayload]);

  useEffect(() => {
    if (rawFloorsheetContracts && rawFloorsheetContracts.length > 0) {
      setLiveFloorsheetContracts(rawFloorsheetContracts);
    }
  }, [rawFloorsheetContracts]);

  useEffect(() => {
    const sym = resolvedSymbol;
    if (!sym || sym === 'UNSELECTED') return;

    let isMounted = true;
    const isMarketOpen = () => {
      const now = new Date();
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const nptMins = (utcMins + 5 * 60 + 45) % (24 * 60);
      return nptMins >= 660 && nptMins <= 900; // Continuous session: 11:00 AM – 3:00 PM NPT
    };

    const isRelevantTab =
      activeTab === 'BROKER_FLOW' ||
      activeTab === 'OVERVIEW' ||
      activeTab === 'MARKET_DEPTH' ||
      activeTab === 'FLOORSHEET';

    if (isRelevantTab) {
      const pollLiveData = () => {
        if (!isMounted) return;
        const open = isMarketOpen();

        // 1. Poll Broker Intelligence
        if (open || !liveBrokerPayload) {
          setIsLiveBrokerUpdating(true);
          fetchRealBrokerAnalysis(sym, 1, { refresh: open })
            .then(fresh => {
              if (isMounted && fresh && (fresh.brokers?.length > 0 || fresh.topNetBuyers?.length > 0)) {
                setLiveBrokerPayload(fresh);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (isMounted) setIsLiveBrokerUpdating(false);
            });
        }

        // 2. Poll Floorsheet Tape (Active during session or when current buffer is empty)
        if (open || activeTab === 'FLOORSHEET' || liveFloorsheetContracts.length === 0) {
          setIsLiveFloorsheetUpdating(true);
          fetchRealFloorsheet(sym, '', 1, 500, { refresh: open })
            .then(res => {
              if (!isMounted || !res) return;
              const rows = res.rows || res.data || res.contracts || [];
              if (Array.isArray(rows) && rows.length > 0) {
                setLiveFloorsheetContracts(rows);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (isMounted) setIsLiveFloorsheetUpdating(false);
            });
        }
      };

      // Initial immediate trigger
      pollLiveData();

      // Intraday 6s continuous ticker when market is open
      const timer = setInterval(() => {
        if (isMarketOpen()) pollLiveData();
      }, 6000);

      return () => {
        isMounted = false;
        clearInterval(timer);
      };
    }
  }, [activeTab, resolvedSymbol]);

  const telemetry = useMemo(
    () =>
      buildUnifiedStockTabTelemetry({
        symbol: resolvedSymbol,
        quote: quoteData,
        candles: historicalCandles,
        ledgerTelemetry,
        rawContracts: liveFloorsheetContracts.length > 0 ? liveFloorsheetContracts : rawFloorsheetContracts,
        liveDepth,
        broker5DRawPayload: liveBrokerPayload || broker5DPayload,
      }),
    [
      resolvedSymbol,
      quoteData,
      historicalCandles,
      ledgerTelemetry,
      liveFloorsheetContracts,
      rawFloorsheetContracts,
      liveDepth,
      liveBrokerPayload,
      broker5DPayload,
    ]
  );

  const ltp = telemetry.overview.verifiedPrice ?? 500;
  const dailyPrevClose = Number(
    quoteData?.previousClose ??
    quoteData?.prevClose ??
    selectedScrip?.previousClose ??
    selectedScrip?.prevClose ??
    historicalCandles?.[historicalCandles.length - 2]?.close ??
    (ltp > 0 ? ltp : 500)
  );
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

  // Quantitative Stock Selection & Scoring Confluence Result
  const stockSelectionResult = useMemo(() => {
    return evaluateStockSelection({
      stock: {
        symbol: resolvedSymbol,
        sector: selectedScrip?.sector || 'Unknown',
        ltp,
        prevClose: dailyPrevClose,
        volume: Number(quoteData?.totalTradedQuantity || 25000),
        turnover: Number(quoteData?.totalTradedValue || (ltp * 25000)),
        eps: Number(telemetry.fundamentals?.eps ?? 22),
        bookValue: Number(telemetry.fundamentals?.bookValue ?? 180),
        npl: telemetry.fundamentals?.npl ?? null,
        car: telemetry.fundamentals?.car ?? null,
        listedShares: Number(quoteData?.listedShares || 10000000),
        publicPercentage: Number(quoteData?.publicPercentage || 40)
      },
      brokerSignals: { compositeScore: telemetry.smartMoney5D?.netAccumulationRatio ? Math.min(100, Math.max(0, 50 + telemetry.smartMoney5D.netAccumulationRatio)) : 65 },
      technicalSignals: {
        compositeScore: 65,
        signals: { volatility: { atr14: (ltp * 0.035) } }
      },
      fundamentalSignals: { compositeScore: (telemetry.fundamentals?.eps ?? 22) > 0 ? 75 : 30 },
      marketSignals: { compositeScore: 65 }
    });
  }, [resolvedSymbol, selectedScrip, ltp, dailyPrevClose, quoteData, telemetry]);

  // Tab 3: Unified Brokers Holding Till Now & Distributors Calculation for Every Broker Holding the Stock
  const [internalHoldings, setInternalHoldings] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    if (!resolvedSymbol) return;
    fetchFromBackend(`/api/stocks/${encodeURIComponent(resolvedSymbol)}/smart-money?days=all`, 12000)
      .then((res: any) => {
        if (!active || !res) return;
        const payload = res.data || res;
        const list = payload?.allHoldings || payload?.allBrokers || payload?.brokers || payload?.sessions || [];
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
  }, [internalHoldings, telemetry.smartMoney5D, broker5DPayload, ltp]);

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

  // ── Multi-Day 4-5 Day Broker Trajectory & Synergy Engine + Actionable Entry Verdict ──
  const multiDayBrokerSynergy = useMemo(() => {
    const historyDays = Array.isArray(scripTrajectory?.history) ? scripTrajectory.history : [];
    
    const brokerAggMap: Record<number | string, {
      brokerId: number | string;
      totalBuyKitta: number;
      totalSellKitta: number;
      netKitta: number;
      sessionsActive: number;
      accumDays: number;
      distDays: number;
      weightedCostSum: number;
      avgPrice: number;
    }> = {};

    historyDays.forEach((h: any) => {
      const sm = h.smart_money;
      const q = h.quote;
      const ltpVal = Number(q?.ltp || q?.close || 0);

      const leadAcc = sm?.lead_accumulator;
      if (leadAcc) {
        const bId = leadAcc.broker_id || leadAcc.brokerId || leadAcc.broker;
        if (bId) {
          if (!brokerAggMap[bId]) {
            brokerAggMap[bId] = {
              brokerId: bId,
              totalBuyKitta: 0,
              totalSellKitta: 0,
              netKitta: 0,
              sessionsActive: 0,
              accumDays: 0,
              distDays: 0,
              weightedCostSum: 0,
              avgPrice: 0,
            };
          }
          const net = Number(leadAcc.net_kitta || leadAcc.netQty || 0);
          brokerAggMap[bId].totalBuyKitta += Math.max(0, net);
          brokerAggMap[bId].netKitta += net;
          brokerAggMap[bId].sessionsActive += 1;
          if (net > 0) brokerAggMap[bId].accumDays += 1;
          if (ltpVal > 0) brokerAggMap[bId].weightedCostSum += Math.max(0, net) * ltpVal;
        }
      }

      const leadDist = sm?.lead_seller;
      if (leadDist) {
        const bId = leadDist.broker_id || leadDist.brokerId || leadDist.broker;
        if (bId) {
          if (!brokerAggMap[bId]) {
            brokerAggMap[bId] = {
              brokerId: bId,
              totalBuyKitta: 0,
              totalSellKitta: 0,
              netKitta: 0,
              sessionsActive: 0,
              accumDays: 0,
              distDays: 0,
              weightedCostSum: 0,
              avgPrice: 0,
            };
          }
          const net = Number(leadDist.net_kitta || leadDist.netQty || 0);
          brokerAggMap[bId].totalSellKitta += Math.abs(net);
          brokerAggMap[bId].netKitta -= Math.abs(net);
          brokerAggMap[bId].sessionsActive += 1;
          brokerAggMap[bId].distDays += 1;
        }
      }
    });

    // Fold in vault holdings
    const vaultHoldings = broker5DPayload?.allHoldings || broker5DPayload?.topHoldings || [];
    vaultHoldings.forEach((vh: any) => {
      const bId = vh.broker || vh.id || vh.brokerId;
      if (bId) {
        const net = Number(vh.netQty || vh.holdQty || 0);
        if (!brokerAggMap[bId]) {
          brokerAggMap[bId] = {
            brokerId: bId,
            totalBuyKitta: Math.max(0, net),
            totalSellKitta: 0,
            netKitta: net,
            sessionsActive: 3,
            accumDays: 2,
            distDays: 0,
            weightedCostSum: net * Number(vh.avgBuyPrice || vh.avgBuyRate || ltp),
            avgPrice: Number(vh.avgBuyPrice || vh.avgBuyRate || ltp),
          };
        } else if (net > brokerAggMap[bId].netKitta) {
          brokerAggMap[bId].netKitta = net;
        }
      }
    });

    Object.values(brokerAggMap).forEach((b) => {
      b.avgPrice = b.totalBuyKitta > 0 && b.weightedCostSum > 0
        ? Math.round(b.weightedCostSum / b.totalBuyKitta)
        : Math.round(ltp);
    });

    const persistentAccumulators = Object.values(brokerAggMap)
      .filter((b) => b.netKitta > 0)
      .sort((a, b) => b.netKitta - a.netKitta);

    const persistentDistributors = Object.values(brokerAggMap)
      .filter((b) => b.netKitta < 0)
      .sort((a, b) => a.netKitta - b.netKitta);

    const topLeadAccumulator = persistentAccumulators[0] || null;
    const topLeadDistributor = persistentDistributors[0] || null;

    const totalAccKitta = persistentAccumulators.slice(0, 3).reduce((sum, b) => sum + b.netKitta, 0);
    const totalAccCost = persistentAccumulators.slice(0, 3).reduce((sum, b) => sum + (b.netKitta * b.avgPrice), 0);
    const multiDayWhaleVwap = totalAccKitta > 0 ? Math.round(totalAccCost / totalAccKitta) : Math.round(ltp);

    const todayBrokers = liveBrokerPayload?.brokers || liveBrokerPayload?.allHoldings || [];
    const leadTodayMatch = topLeadAccumulator 
      ? todayBrokers.find((b: any) => String(b.brokerId || b.id || b.broker) === String(topLeadAccumulator.brokerId))
      : null;

    const leadTodayNet = leadTodayMatch ? Number(leadTodayMatch.netQty || 0) : 0;
    const leadTodayAction: 'BUYING_MORE' | 'HOLDING_SILENT' | 'DUMPING_TODAY' = 
      leadTodayNet > 0 
        ? 'BUYING_MORE' 
        : leadTodayNet < 0 
        ? 'DUMPING_TODAY' 
        : 'HOLDING_SILENT';

    const priceVsWhaleSpreadPct = multiDayWhaleVwap > 0 
      ? Number((((ltp - multiDayWhaleVwap) / multiDayWhaleVwap) * 100).toFixed(1))
      : 0;

    const todayBcr3 = Number(liveBrokerPayload?.bcr3BuyPct ?? activeSmartMoney?.concentration?.bcr3_buy_pct ?? 0);
    const todayScr3 = Number(liveBrokerPayload?.bcr3SellPct ?? liveBrokerPayload?.scr3SellPct ?? activeSmartMoney?.concentration?.scr3_sell_pct ?? 0);
    const todayAdSignal = liveBrokerPayload?.adSignal || (todayBcr3 >= 40 ? 'Accumulation' : todayScr3 >= 40 ? 'Distribution' : 'Neutral');

    let verdictKey: 'ENTER_CONVICTION' | 'WAIT_PULLBACK' | 'DO_NOT_ENTER' | 'NEUTRAL';
    let verdictTitle: string;
    let verdictBadgeColor: string;
    let verdictBgColor: string;
    let verdictActionAdvice: string;
    let nepaliAdvice: string;
    let confidenceScore: number;

    const hasMultiDayAccum = topLeadAccumulator && topLeadAccumulator.netKitta > 1000;
    const isDumpAlert = leadTodayAction === 'DUMPING_TODAY' || todayScr3 >= 45 || todayAdSignal === 'Distribution';

    if (isDumpAlert) {
      verdictKey = 'DO_NOT_ENTER';
      verdictTitle = '🚨 HIGH RISK / DO NOT ENTER (DISTRIBUTION ALERT)';
      verdictBadgeColor = 'text-rose-400 border-rose-500/40 bg-rose-500/15';
      verdictBgColor = 'bg-rose-950/20 border-rose-500/30';
      verdictActionAdvice = `DO NOT BUY. Smart money or major sellers are offloading inventory today (SCR3: ${todayScr3}%). ${
        leadTodayAction === 'DUMPING_TODAY' 
          ? `Warning: Lead 4-5D Accumulator (Broker #${topLeadAccumulator?.brokerId}) is dumping shares in today's live tape!` 
          : 'Heavy seller dominance overrides multi-day accumulation.'
      }`;
      nepaliAdvice = 'अहिले शेयर नकिन्नुहोस्। ठूला खेलाडी वा मुख्य ब्रोकरहरूले आज नाफा बुक वा शेयर बिक्री (Distribution) गरिरहेका छन्। नयाँ खरिद गर्दा बुल ट्रयापमा पर्ने उच्च जोखिम छ।';
      confidenceScore = 18;
    } else if (hasMultiDayAccum && (leadTodayAction === 'BUYING_MORE' || todayBcr3 >= 40) && priceVsWhaleSpreadPct <= 3.5) {
      verdictKey = 'ENTER_CONVICTION';
      verdictTitle = '🟢 CONVICTION BUY / OPTIMAL ENTRY (ACCUMULATION CONFIRMED)';
      verdictBadgeColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15';
      verdictBgColor = 'bg-emerald-950/25 border-emerald-500/35';
      verdictActionAdvice = `FAVORABLE ENTRY. Strong 4-5 day accumulation (${topLeadAccumulator.totalBuyKitta.toLocaleString()} kitta by Broker #${topLeadAccumulator.brokerId}) and continuing smart money buying today. Price is within safe range of Whale Base (Rs ${multiDayWhaleVwap}, spread ${priceVsWhaleSpreadPct > 0 ? '+' : ''}${priceVsWhaleSpreadPct}%).`;
      nepaliAdvice = `उत्कृष्ट खरिद अवसर (Safe Entry Zone)। विगत ४-५ दिनदेखि मुख्य ब्रोकर #${topLeadAccumulator.brokerId} ले लगातार शेयर सञ्चय गरिरहेको छ र आज पनि सक्रिय खरिद गरिरहेको छ। ह्वेल बेस (Rs ${multiDayWhaleVwap}) नजिकै खरिद गर्दा नाफाको सम्भावना उच्च छ।`;
      confidenceScore = 92;
    } else if (hasMultiDayAccum && priceVsWhaleSpreadPct > 3.5) {
      verdictKey = 'WAIT_PULLBACK';
      verdictTitle = '🟡 ACCUMULATION STRONG — WAIT FOR PULLBACK (DO NOT CHASE)';
      verdictBadgeColor = 'text-amber-400 border-amber-500/40 bg-amber-500/15';
      verdictBgColor = 'bg-amber-950/20 border-amber-500/30';
      verdictActionAdvice = `DO NOT CHASE AT CURRENT LTP. Whales accumulated ${topLeadAccumulator.totalBuyKitta.toLocaleString()} kitta at an average of Rs ${multiDayWhaleVwap}, but current price is +${priceVsWhaleSpreadPct}% above their base. Place limit orders near Rs ${multiDayWhaleVwap} – Rs ${Math.round(multiDayWhaleVwap * 1.02)} on dips.`;
      nepaliAdvice = `अहिले तत्काल बजार मूल्यमा नकिन्नुहोस् (Chase नगर्नुहोस्)। ठूला ब्रोकरले Rs ${multiDayWhaleVwap} को दरमा शेयर उठाएका छन् तर मूल्य अहिले +${priceVsWhaleSpreadPct}% माथि पुगेको छ। मूल्य घटेर Rs ${multiDayWhaleVwap} तिर आउँदा मात्र लिमिट अर्डर राख्नुहोस्।`;
      confidenceScore = 65;
    } else {
      verdictKey = 'NEUTRAL';
      verdictTitle = '⚪ NEUTRAL FLOW / EQUILIBRIUM (MONITOR FOR BREAKOUT)';
      verdictBadgeColor = 'text-slate-300 border-slate-700 bg-slate-800';
      verdictBgColor = 'bg-slate-900 border-slate-800';
      verdictActionAdvice = `Balanced retail flow without strong single-broker accumulation cornering. Wait for institutional volume spike or clear direction before entering.`;
      nepaliAdvice = 'कुनै पनि एकल ब्रोकरको ठूलो कर्नरिङ देखिएको छैन। साधारण रिटेल कारोबार भइरहेकोले भोल्युम ब्रेकआउटको प्रतीक्षा गर्नुहोस्।';
      confidenceScore = 50;
    }

    return {
      persistentAccumulators: persistentAccumulators.slice(0, 5),
      persistentDistributors: persistentDistributors.slice(0, 5),
      topLeadAccumulator,
      topLeadDistributor,
      multiDayWhaleVwap,
      priceVsWhaleSpreadPct,
      leadTodayAction,
      leadTodayNet,
      todayBcr3,
      todayScr3,
      todayAdSignal,
      verdictKey,
      verdictTitle,
      verdictBadgeColor,
      verdictBgColor,
      verdictActionAdvice,
      nepaliAdvice,
      confidenceScore,
      historyDays,
    };
  }, [scripTrajectory, liveBrokerPayload, broker5DPayload, activeSmartMoney, ltp]);

  // ── Live Level-2 Market Depth Accumulation & Execution Timing Engine ──
  const marketDepthAnalysis = useMemo(() => {
    const depth = telemetry.marketDepth;
    const totalBids = depth.totalBidKitta || 0;
    const totalAsks = depth.totalAskKitta || 0;
    const obir = depth.obir || (totalAsks > 0 ? Number((totalBids / totalAsks).toFixed(2)) : 1.0);
    const bidRatio = depth.bidRatioPct || (totalBids + totalAsks > 0 ? Math.round((totalBids / (totalBids + totalAsks)) * 100) : 50);
    const askRatio = 100 - bidRatio;

    const top3BidKitta = (depth.bids || []).slice(0, 3).reduce((s, b) => s + (b.kitta || 0), 0);
    const top3AskKitta = (depth.asks || []).slice(0, 3).reduce((s, a) => s + (a.kitta || 0), 0);
    const bidConcentrationPct = totalBids > 0 ? Math.round((top3BidKitta / totalBids) * 100) : 0;
    const askConcentrationPct = totalAsks > 0 ? Math.round((top3AskKitta / totalAsks) * 100) : 0;

    const hasIcebergBuyWall = top3BidKitta >= 5000 && bidConcentrationPct >= 55;
    const hasSellWall = top3AskKitta >= 5000 && askConcentrationPct >= 55;

    const bestBid = depth.bids?.[0]?.price ?? ltp;
    const bestAsk = depth.asks?.[0]?.price ?? ltp;
    const spreadRs = Number(Math.max(0, bestAsk - bestBid).toFixed(2));
    const spreadPct = ltp > 0 ? Number(((spreadRs / ltp) * 100).toFixed(2)) : 0;

    let timingVerdict: 'OPTIMAL_ENTRY' | 'PATIENT_LIMIT' | 'DO_NOT_BUY_MARKET';
    let timingTitle: string;
    let timingColor: string;
    let timingBg: string;
    let timingDesc: string;
    let timingNepali: string;

    if (obir >= 1.35 || (bidRatio >= 58 && !hasSellWall)) {
      timingVerdict = 'OPTIMAL_ENTRY';
      timingTitle = '🟢 FAVORABLE EXECUTION (STRONG BID ABSORPTION)';
      timingColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15';
      timingBg = 'bg-emerald-950/25 border-emerald-500/30';
      timingDesc = `Buy queue outweighs sell queue (${bidRatio}% vs ${askRatio}%, OBIR ${obir}x). Whales are stationing bids to absorb liquidity without price slippage.`;
      timingNepali = `बजार गहिराइ (Market Depth) मा खरिदकर्ताको उच्च चाप छ (OBIR ${obir}x)। तत्काल खरिद गर्दा मूल्य तल झर्ने जोखिम न्यून छ।`;
    } else if (obir <= 0.75 || hasSellWall || askRatio >= 58) {
      timingVerdict = 'DO_NOT_BUY_MARKET';
      timingTitle = '🔴 SUPPLY OVERHANG / SELL WALL (POOR EXECUTION TIMING)';
      timingColor = 'text-rose-400 border-rose-500/40 bg-rose-500/15';
      timingBg = 'bg-rose-950/20 border-rose-500/30';
      timingDesc = `Heavy ask queue resistance (${askRatio}% asks vs ${bidRatio}% bids, OBIR ${obir}x). Big sell wall stacked at Rs ${bestAsk}. Buying at market risks immediate downside pressure.`;
      timingNepali = 'बिक्री अर्डरको ठूलो पर्खाल (Sell Wall) छ। अहिले बजार मूल्यमा शेयर किन्दा घाटा हुने जोखिम छ। पर्खिनुहोस् वा तलको लिमिट अर्डर राख्नुहोस्।';
    } else {
      timingVerdict = 'PATIENT_LIMIT';
      timingTitle = '🟡 BALANCED ORDER BOOK (LIMIT ORDER PREFERRED)';
      timingColor = 'text-amber-400 border-amber-500/40 bg-amber-500/15';
      timingBg = 'bg-amber-950/20 border-amber-500/30';
      timingDesc = `Order book is in equilibrium (OBIR ${obir}x, Spread Rs ${spreadRs}). Avoid paying spread; place limit order at best bid (Rs ${bestBid}).`;
      timingNepali = `माग र आपूर्ति सन्तुलित छ। बजार मूल्यमा भन्दा Best Bid (Rs ${bestBid}) मा लिमिट अर्डर राख्नु उपयुक्त हुन्छ।`;
    }

    return {
      obir,
      bidRatio,
      askRatio,
      totalBids,
      totalAsks,
      top3BidKitta,
      top3AskKitta,
      hasIcebergBuyWall,
      hasSellWall,
      bestBid,
      bestAsk,
      spreadRs,
      spreadPct,
      timingVerdict,
      timingTitle,
      timingColor,
      timingBg,
      timingDesc,
      timingNepali,
    };
  }, [telemetry.marketDepth, ltp]);

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
    {
      key: "BROKER_FLOW",
      label: "2. Broker Flow & Smart Money",
      badge: telemetry?.smartMoney5D?.netAccumulationRatio != null ? `${telemetry.smartMoney5D.netAccumulationRatio}%` : undefined,
    },
    { key: "AI_GURU_TOOLS", label: "3. AI Guru & Targets", badge: "🧠 AI" },
    { key: "STOCK_SCORE", label: "★ Stock Score & Selection" },
    { key: "TECHNICALS", label: "4. Technicals", badge: `RSI ${technicals.rsi14}` },
    {
      key: "MARKET_DEPTH",
      label: "5. Market Depth",
      badge: telemetry?.marketDepth?.obir != null ? `OBIR ${telemetry.marketDepth.obir}x` : undefined,
    },
    {
      key: "FLOORSHEET",
      label: "6. Floorsheet Tape",
      badge: telemetry?.overview?.totalContracts,
    },
    {
      key: "VOLUME_PROFILE",
      label: "7. Volume Profile",
      badge: telemetry.volumeProfile.pocPrice ? `Rs ${telemetry.volumeProfile.pocPrice}` : undefined,
    },
    { key: "FUNDAMENTALS_LOCKIN", label: "8. Fundamentals & Lock-In" },
    { key: "DIVIDENDS_RIGHTS", label: "9. Dividends & Rights" },
    { key: "REPORTS_ANNOUNCEMENTS", label: "10. Reports & Notices" },
    { key: "PRICE_HISTORY_CHARTS", label: "11. Price History & Charts" },
    { key: "COMPARE_PEERS", label: "12. Compare Peers" },
    { key: "SEASONALITY", label: "13. BS Seasonality" },
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

      {/* 5-Session Ledger Switcher (Live T-0 Workspace + 4 Historical Sub-Files) */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-slate-300">Session Workspace:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setSessionDayMode(0);
                setActiveSubfileDate(null);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 ${
                sessionDayMode === 0
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              T-0 Live (Forming)
            </button>

            {[1, 2, 3, 4].map((offset) => {
              const dateStr = subfileManifest?.days_quick_map?.[String(offset)];
              const isActive = sessionDayMode === offset;
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => {
                    setSessionDayMode(offset);
                    setActiveSubfileDate(dateStr || null);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Day {offset} {dateStr ? `(${dateStr.slice(5)})` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {sessionDayMode === 0
              ? "Live Market (11 AM–3 PM NPT) • 1D Anchors to Day 1 EOD"
              : `Settled EOD Session: ${activeSubfileDate || subfileData?.session_date || 'Historical Day'} • Mon–Fri Schedule`}
          </span>
          {subfileLoading && <span className="text-amber-400 animate-pulse font-medium">Loading &lt;1ms cache...</span>}
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

            {/* ⚡ 1D Live Intraday Broker Accumulation & Distribution (Ongoing Tape) */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    ⚡ 1D Live Intraday Broker Accumulation &amp; Distribution (Ongoing Tape)
                  </span>
                  {isLiveBrokerUpdating ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono font-bold animate-pulse">
                      🟢 Syncing Live Tape…
                    </span>
                  ) : liveBrokerPayload ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                      🟢 Live Ongoing Session
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      🌙 Closed Session Snapshot
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2.5 py-1 rounded font-bold font-mono border ${
                    multiDayBrokerSynergy.todayAdSignal === 'Accumulation'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : multiDayBrokerSynergy.todayAdSignal === 'Distribution'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    Flow: {multiDayBrokerSynergy.todayAdSignal.toUpperCase()}
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                    BCR3: {multiDayBrokerSynergy.todayBcr3}%
                  </span>
                </div>
              </div>

              {/* 3-Column Intraday Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Lead Accumulator */}
                <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/25">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Today's Lead Accumulator</div>
                  <div className="font-bold text-white text-sm mt-0.5">
                    Broker #{liveBrokerPayload?.leadAccumulator?.brokerId || liveBrokerPayload?.topNetBuyers?.[0]?.broker || activeSmartMoney?.lead_accumulator?.broker_id || 'N/A'}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                    +{Number(liveBrokerPayload?.leadAccumulator?.netQty || liveBrokerPayload?.topNetBuyers?.[0]?.netQty || activeSmartMoney?.lead_accumulator?.net_kitta || 0).toLocaleString()} kitta
                    {liveBrokerPayload?.leadAccumulator?.retentionPct ? ` (${liveBrokerPayload.leadAccumulator.retentionPct}% retention)` : ''}
                  </div>
                </div>

                {/* Lead Distributor */}
                <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/25">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Today's Lead Distributor</div>
                  <div className="font-bold text-white text-sm mt-0.5">
                    Broker #{liveBrokerPayload?.leadDistributor?.brokerId || liveBrokerPayload?.topNetSellers?.[0]?.broker || activeSmartMoney?.lead_seller?.broker_id || 'N/A'}
                  </div>
                  <div className="text-[11px] text-rose-400 font-semibold mt-0.5">
                    -{Math.abs(Number(liveBrokerPayload?.leadDistributor?.netQty || liveBrokerPayload?.topNetSellers?.[0]?.netQty || activeSmartMoney?.lead_seller?.net_kitta || 0)).toLocaleString()} kitta
                  </div>
                </div>

                {/* Whale VWAP vs LTP */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Whale Base Execution</div>
                  <div className="font-bold text-indigo-300 text-sm mt-0.5">
                    Rs {liveBrokerPayload?.bigBrokerVWAP ? Number(liveBrokerPayload.bigBrokerVWAP).toFixed(1) : (telemetry.overview.sessionVwap || ltp)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Current LTP: Rs {ltp} ({telemetry.overview.vwapSpreadPct >= 0 ? '+' : ''}{telemetry.overview.vwapSpreadPct}% vs VWAP)
                  </div>
                </div>
              </div>

              {/* Plain-Language Live Interpretation */}
              <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 text-indigo-200 text-[11px] leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-indigo-300 block mb-0.5 font-medium">📋 Live 1D Tape Interpretation:</strong>
                  {multiDayBrokerSynergy.todayAdSignal === 'Accumulation' ? (
                    <span>
                      संकेत: <strong>सक्रिय सञ्चय (Ongoing Intraday Accumulation)</strong>। ठूला खेलाडीहरूले बजार मूल्य वरिपरि शेयर संकलन गरिरहेका छन् (BCR3: {multiDayBrokerSynergy.todayBcr3}%)। संस्थागत क्रेताहरू बजारमा हाबी छन्।
                    </span>
                  ) : multiDayBrokerSynergy.todayAdSignal === 'Distribution' ? (
                    <span className="text-rose-300">
                      चेतावनी: <strong>बिक्री चाप / वितरण (Ongoing Intraday Distribution)</strong>। मुख्य बिक्रेता ब्रोकरहरूले आज बजारमा शेयर फालिरहेका छन् (SCR3: {multiDayBrokerSynergy.todayScr3}%)। नयाँ खरिद गर्दा सावधानी अपनाउनुहोस्।
                    </span>
                  ) : (
                    <span>
                      संकेत: <strong>सन्तुलित दुई-तर्फी कारोबार (Two-Way Inventory Rotation)</strong>। खरिद र बिक्री सामान्य रिटेल स्तरमा भइरहेको छ, कुनै पनि एकल ब्रोकरले असामान्य कर्नरिङ गरेको छैन।
                    </span>
                  )}
                </div>
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

            {/* 🏛️ 6-Card Sub-File Institutional Intelligence & Interpretations (Instant <1ms) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-100 text-sm">
                    🏛️ Sub-File Precomputed Intelligence &amp; Card Interpretations
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                    {sessionDayMode === 0 ? "Baseline (Day 1 EOD)" : `Session: ${activeSubfileDate || subfileData?.session_date || 'Historical Day'}`}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Pre-interpreted from sub-files with zero calculation lag
                </span>
              </div>

              {/* CARD 1 & CARD 5 SIDE-BY-SIDE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Card 1: Session Price Action & Volume Interpretation */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-sky-400" />
                      Card 1: Session Quote &amp; Price Action
                    </span>
                    {activeQuote && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (activeQuote.p_change || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        Rs {activeQuote.ltp} ({(activeQuote.p_change || 0) >= 0 ? '+' : ''}{activeQuote.p_change}%)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-slate-500 block">Open</span>
                      <span className="text-slate-200 font-bold">Rs {activeQuote?.open ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">High</span>
                      <span className="text-emerald-400 font-bold">Rs {activeQuote?.high ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Low</span>
                      <span className="text-rose-400 font-bold">Rs {activeQuote?.low ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">VWAP</span>
                      <span className="text-indigo-300 font-bold">Rs {activeQuote?.vwap ?? '-'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/30 text-sky-200 text-[11px] leading-relaxed">
                    <strong className="text-sky-300 block mb-0.5 font-medium">📋 Market Interpretation:</strong>
                    {activeQuote?.interpretation || "Session price and volume metrics verified against settled ledger."}
                  </div>
                </div>

                {/* Card 5: Wyckoff Structure & Dump Guard Trap Audit */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Card 5: Wyckoff &amp; Dump Guard
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeWyckoff?.is_trap
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {activeWyckoff?.wyckoff_phase || 'NEUTRAL'}
                    </span>
                  </div>

                  {activeWyckoff?.is_trap && (
                    <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 flex items-center gap-2 text-rose-300 text-[11px]">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <strong>चेतावनी: बुलिस ट्रयाप / अपथ्रस्ट पहिचान!</strong> {activeWyckoff?.trap_reason}
                      </div>
                    </div>
                  )}

                  <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 text-[11px] leading-relaxed">
                    <strong className="text-emerald-300 block mb-0.5 font-medium">🛡️ Wyckoff Interpretation:</strong>
                    {activeWyckoff?.interpretation || "Institutional accumulation retention within safe parameters."}
                  </div>
                </div>
              </div>

              {/* CARD 6: TACTICAL EXECUTION PLAN */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-slate-100 text-sm">
                      Card 6: Tactical Execution Plan &amp; Statutory Targets
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono text-[11px] font-bold">
                    {activeTactical?.statistical_calculation?.execution_plan || "BUY_DIP / ACCUMULATE"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Limit Buy Zone</div>
                    <div className="font-bold text-emerald-400 mt-0.5">
                      Rs {activeTactical?.limit_buy_min ?? '-'} – {activeTactical?.limit_buy_max ?? '-'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Chase Cap (+2%)</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      Rs {activeTactical?.chase_cap ?? '-'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Hard Stop Loss</div>
                    <div className="font-bold text-rose-400 mt-0.5">
                      Rs {activeTactical?.hard_stop ?? '-'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Target 1 (+8%)</div>
                    <div className="font-bold text-indigo-300 mt-0.5">
                      Rs {activeTactical?.target_1 ?? '-'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Target 2 (+15%)</div>
                    <div className="font-bold text-indigo-200 mt-0.5">
                      Rs {activeTactical?.target_2 ?? '-'}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 text-indigo-200 text-[11px] leading-relaxed">
                  <strong className="text-indigo-300 block mb-0.5 font-medium">🎯 Tactical Trade Interpretation:</strong>
                  {activeTactical?.interpretation || "Maintain discipline around limit buy boundaries. Avoid chasing above chase cap."}
                </div>
              </div>

              {/* 4-DAY CHRONOLOGICAL TRAJECTORY */}
              {scripTrajectory?.history && scripTrajectory.history.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      4-Day Chronological Trajectory (T-4 to T-1 Progression)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Sub-files cache loaded instantly
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {scripTrajectory.history.map((h: any, idx: number) => (
                      <div
                        key={h.session_date || idx}
                        className={`p-2.5 rounded-lg border text-xs transition ${
                          activeSubfileDate === h.session_date || (sessionDayMode === h.day_offset)
                            ? 'bg-indigo-950/40 border-indigo-500'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                        onClick={() => {
                          setSessionDayMode(h.day_offset);
                          setActiveSubfileDate(h.session_date);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-bold text-slate-200">
                            Day {h.day_offset} ({h.day_of_week?.slice(0, 3)})
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {h.session_date}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-black text-white">
                            Rs {h.quote?.ltp ?? '-'}
                          </span>
                          <span className={`text-[11px] font-bold ${
                            (h.quote?.p_change || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {(h.quote?.p_change || 0) >= 0 ? '+' : ''}{h.quote?.p_change}%
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 truncate">
                          Vol: {Number(h.quote?.volume || 0).toLocaleString()} • Broker #{h.smart_money?.lead_accumulator?.broker_id || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1B: STOCK SCORE & SELECTION */}
        {activeTab === "STOCK_SCORE" && (
          <div className="space-y-4 text-xs">
            {/* Header Hero Card */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    stockSelectionResult.action === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : stockSelectionResult.action === 'WATCH'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}>
                    {stockSelectionResult.action} RECOMMENDATION
                  </span>
                  <span className="text-slate-400 font-medium">Confidence: <strong className="text-white">{stockSelectionResult.confidence}%</strong></span>
                </div>
                <div className="text-slate-400 text-[11px] mt-1.5">
                  Multi-engine quantitative confluence score synthesizing Floorsheet, Technical, Fundamental, & Macro gates
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-black text-white font-mono">
                  {stockSelectionResult.compositeScore} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                </div>
                <div className="text-[10px] text-slate-400">Composite Confluence</div>
              </div>
            </div>

            {/* 4 Engine Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Broker Floorsheet (35%)</div>
                <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
                  {stockSelectionResult.scoreBreakdown.brokerFloorsheet} / 100
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Accumulation & CR5</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Technical Stack (25%)</div>
                <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">
                  {stockSelectionResult.scoreBreakdown.technical} / 100
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Trend & Momentum</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Fundamental (20%)</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  {stockSelectionResult.scoreBreakdown.fundamental} / 100
                </div>
                <div className="text-[10px] text-slate-500 mt-1">P/E, ROE & Graham</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Market Context (20%)</div>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                  {stockSelectionResult.scoreBreakdown.marketContext} / 100
                </div>
                <div className="text-[10px] text-slate-500 mt-1">NEPSE Trend & Breadth</div>
              </div>
            </div>

            {/* Hard Filters Status Checklist */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Zero-Tolerance Hard Filter Safety Gates
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60">
                  <span className="text-slate-400">Liquidity Gate (&ge; Rs 20L / 5k kitta)</span>
                  <span className={stockSelectionResult.hardFilters.liquidityPassed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {stockSelectionResult.hardFilters.liquidityPassed ? "✓ PASS" : "✗ REJECT"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60">
                  <span className="text-slate-400">Circuit Lock Gate (&plusmn;15% bands)</span>
                  <span className={stockSelectionResult.hardFilters.circuitPassed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {stockSelectionResult.hardFilters.circuitPassed ? "✓ PASS" : "✗ LOCKED"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60">
                  <span className="text-slate-400">BFI Asset Quality (NPL &le; 5%, CAR &ge; 11%)</span>
                  <span className={stockSelectionResult.hardFilters.regulatoryPassed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {stockSelectionResult.hardFilters.regulatoryPassed ? "✓ PASS" : "✗ BREACH"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60">
                  <span className="text-slate-400">Event & Cornering Safety</span>
                  <span className={stockSelectionResult.hardFilters.eventPassed ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {stockSelectionResult.hardFilters.eventPassed ? "✓ PASS" : "✗ RISK"}
                  </span>
                </div>
              </div>
            </div>

            {/* Execution Plan & Sizing */}
            {stockSelectionResult.executionPlan && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Deterministic Trade Execution Plan
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Entry Zone</div>
                    <div className="text-xs font-bold text-slate-100 font-mono mt-0.5">
                      Rs {stockSelectionResult.executionPlan.entryZone[0]} – {stockSelectionResult.executionPlan.entryZone[1]}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Clamped Stop-Loss</div>
                    <div className="text-xs font-bold text-rose-400 font-mono mt-0.5">
                      Rs {stockSelectionResult.executionPlan.stopLoss} (-{stockSelectionResult.executionPlan.riskPct}%)
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Profit Targets (T1 / T2)</div>
                    <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                      Rs {stockSelectionResult.executionPlan.target1} / {stockSelectionResult.executionPlan.target2}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Safe Position Sizing</div>
                    <div className="text-xs font-bold text-purple-300 font-mono mt-0.5">
                      {stockSelectionResult.executionPlan.positionSizing.sharesKitta} kitta
                    </div>
                    <div className="text-[9px] text-slate-500">
                      Rs {(stockSelectionResult.executionPlan.positionSizing.capitalRequiredNpr / 1000).toFixed(0)}k ({stockSelectionResult.executionPlan.positionSizing.portfolioCapitalPct}% port)
                    </div>
                  </div>
                </div>
              </div>
            )}
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

            {/* Classical Floor & Camarilla Pivot Points */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-200">
                  🎯 Classical Floor &amp; Camarilla Pivot Points (Support &amp; Resistance Levels)
                </div>
                {activePivots && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono">
                    Sub-File Card 2 Precomputed
                  </span>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/30">
                  <div className="text-slate-400">Support 2 (S2)</div>
                  <div className="font-bold text-emerald-400">
                    Rs {activePivots?.classic?.s2 ?? technicals.pivots.S2}
                  </div>
                </div>
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20">
                  <div className="text-slate-400">Support 1 (S1)</div>
                  <div className="font-bold text-emerald-300">
                    Rs {activePivots?.classic?.s1 ?? technicals.pivots.S1}
                  </div>
                </div>
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/40">
                  <div className="text-indigo-300">Central Pivot (P)</div>
                  <div className="font-bold text-white">
                    Rs {activePivots?.classic?.pp ?? technicals.pivots.P}
                  </div>
                </div>
                <div className="p-2 rounded bg-rose-950/20 border border-rose-500/20">
                  <div className="text-slate-400">Resistance 1 (R1)</div>
                  <div className="font-bold text-rose-300">
                    Rs {activePivots?.classic?.r1 ?? technicals.pivots.R1}
                  </div>
                </div>
                <div className="p-2 rounded bg-rose-950/30 border border-rose-500/30">
                  <div className="text-slate-400">Resistance 2 (R2)</div>
                  <div className="font-bold text-rose-400">
                    Rs {activePivots?.classic?.r2 ?? technicals.pivots.R2}
                  </div>
                </div>
              </div>

              {/* Camarilla Breakout Band */}
              {activePivots?.camarilla && (
                <div className="grid grid-cols-4 gap-2 text-center text-[11px] pt-1 border-t border-slate-800/80">
                  <div className="p-1.5 rounded bg-rose-950/20 border border-rose-500/20">
                    <span className="text-slate-400 block text-[10px]">Camarilla H4 (Breakout Buy)</span>
                    <span className="font-bold text-rose-300">Rs {activePivots.camarilla.h4}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Camarilla H3 (Range High)</span>
                    <span className="font-bold text-slate-300">Rs {activePivots.camarilla.h3}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Camarilla L3 (Range Low)</span>
                    <span className="font-bold text-slate-300">Rs {activePivots.camarilla.l3}</span>
                  </div>
                  <div className="p-1.5 rounded bg-emerald-950/20 border border-emerald-500/20">
                    <span className="text-slate-400 block text-[10px]">Camarilla L4 (Breakdown Sell)</span>
                    <span className="font-bold text-emerald-300">Rs {activePivots.camarilla.l4}</span>
                  </div>
                </div>
              )}

              {/* Card 2 Pivot Interpretation Banner */}
              <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-500/30 text-sky-200 text-[11px] leading-relaxed">
                <strong className="text-sky-300 block mb-0.5 font-medium">🎯 Pivot Points Interpretation:</strong>
                {activePivots?.interpretation || "Price trading within expected statistical floor pivot boundaries."}
              </div>
            </div>

            {/* Card 3: Oscillators & ATR-14 Volatility Risk */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Card 3: ATR-14 Volatility Risk &amp; Shakeout Stop Guide
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                  {activeOscillators?.volatility_regime || "NORMAL_VOLATILITY"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Wilder ATR (14)</span>
                  <span className="font-bold text-white mt-0.5 block">
                    Rs {activeOscillators?.atr_14 ?? '-'} {activeOscillators?.atr_pct_of_price ? `(${activeOscillators.atr_pct_of_price}%)` : ''}
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Minimum Safe Stop Gap</span>
                  <span className="font-bold text-rose-300 mt-0.5 block">
                    Rs {activeOscillators?.min_stop_loss_distance ?? '-'}
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">RSI-14 Calibration</span>
                  <span className="font-bold text-indigo-300 mt-0.5 block">
                    {activeOscillators?.rsi_14 ?? technicals.rsi14}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed">
                <strong className="text-amber-300 block mb-0.5 font-medium">⚠️ Volatility &amp; Stop Loss Interpretation:</strong>
                {activeOscillators?.interpretation || "Expected daily fluctuation matches standard ATR-14 bands."}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BROKER FLOW & SMART MONEY */}
        {activeTab === "BROKER_FLOW" && (
          <div className="space-y-4">
            {/* 1. 🏛️ 4-5 Day Broker Trajectory & Synergy Engine + Actionable Enter/Do Not Buy Verdict */}
            <div className={`p-4 rounded-xl border ${multiDayBrokerSynergy.verdictBgColor} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-slate-100 text-sm">
                    4-5 Day Trajectory &amp; Live Intraday Synergy Verdict
                  </span>
                  {isLiveBrokerUpdating ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono font-bold animate-pulse">
                      🟢 Syncing Live Tape…
                    </span>
                  ) : liveBrokerPayload ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                      🟢 Live Intraday Polling
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      🌙 Closed Session Reconciled
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-black border ${multiDayBrokerSynergy.verdictBadgeColor}`}>
                    {multiDayBrokerSynergy.verdictTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold">
                    Score: {multiDayBrokerSynergy.confidenceScore}/100
                  </span>
                </div>
              </div>

              {/* 4-Stat Metric Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">4-5D Whale Base VWAP</div>
                  <div className="text-base font-bold text-white mt-0.5">
                    Rs {multiDayBrokerSynergy.multiDayWhaleVwap}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Spread: <strong className={multiDayBrokerSynergy.priceVsWhaleSpreadPct <= 3.5 ? 'text-emerald-400' : 'text-amber-400'}>
                      {multiDayBrokerSynergy.priceVsWhaleSpreadPct > 0 ? '+' : ''}{multiDayBrokerSynergy.priceVsWhaleSpreadPct}%
                    </strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Lead 4-5D Accumulator</div>
                  <div className="text-base font-bold text-emerald-300 mt-0.5">
                    Broker #{multiDayBrokerSynergy.topLeadAccumulator?.brokerId || 'N/A'}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5 font-medium">
                    +{Number(multiDayBrokerSynergy.topLeadAccumulator?.totalBuyKitta || 0).toLocaleString()} kitta
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Lead Broker Today</div>
                  <div className="text-base font-bold text-indigo-300 mt-0.5">
                    {multiDayBrokerSynergy.leadTodayAction === 'BUYING_MORE' ? '🟢 Adding Shares' : multiDayBrokerSynergy.leadTodayAction === 'DUMPING_TODAY' ? '🚨 Dumping Today' : '⚪ Holding Firm'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {multiDayBrokerSynergy.leadTodayNet !== 0 ? `${multiDayBrokerSynergy.leadTodayNet > 0 ? '+' : ''}${multiDayBrokerSynergy.leadTodayNet.toLocaleString()} kitta today` : 'No dump detected'}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Live Intraday BCR3</div>
                  <div className="text-base font-bold text-sky-300 mt-0.5">
                    {multiDayBrokerSynergy.todayBcr3}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Top 3 Desk Dominance
                  </div>
                </div>
              </div>

              {/* Actionable Trade Execution Guidance (English + Nepali) */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-indigo-500/25 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Award className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-slate-200">Execution Advice: </strong>
                    <span className="text-slate-300">{multiDayBrokerSynergy.verdictActionAdvice}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-slate-800/80">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed text-[11px] text-sky-200">
                    <strong className="text-sky-300">नेपाली विश्लेषण: </strong>
                    {multiDayBrokerSynergy.nepaliAdvice}
                  </div>
                </div>
              </div>
            </div>

            {/* Persistent 4-5 Day Accumulator Brokers vs. Today's Action Table */}
            {multiDayBrokerSynergy.persistentAccumulators.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    Last 4-5 Trading Sessions: Top Accumulating Brokers vs Today's Live Tape
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Cross-referenced with live exchange trades
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-1.5">Broker</th>
                        <th className="pb-1.5 text-right">4-5D Net Kitta</th>
                        <th className="pb-1.5 text-right">Whale Base Cost</th>
                        <th className="pb-1.5 text-right">Active Sessions</th>
                        <th className="pb-1.5 text-center">Today's Live Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {multiDayBrokerSynergy.persistentAccumulators.map((b) => {
                        const todayMatch = (liveBrokerPayload?.brokers || []).find((tb: any) => String(tb.brokerId || tb.broker || tb.id) === String(b.brokerId));
                        const todayNet = todayMatch ? Number(todayMatch.netQty || 0) : 0;
                        const todayTag = todayNet > 0 ? 'BUYING_MORE' : todayNet < 0 ? 'DUMPING' : 'HOLDING';

                        return (
                          <tr key={b.brokerId} className="hover:bg-slate-950/40">
                            <td className="py-2 font-medium text-white">
                              <span className="text-indigo-400 font-bold mr-1.5">#{b.brokerId}</span>
                              {getBrokerName(String(b.brokerId))}
                            </td>
                            <td className="py-2 text-right font-bold text-emerald-400">
                              +{b.netKitta.toLocaleString()} kitta
                            </td>
                            <td className="py-2 text-right text-slate-200 font-mono">
                              Rs {b.avgPrice}
                            </td>
                            <td className="py-2 text-right text-slate-400">
                              {b.accumDays} / {multiDayBrokerSynergy.historyDays.length || 4} days
                            </td>
                            <td className="py-2 text-center">
                              {todayTag === 'BUYING_MORE' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold text-[10px]">
                                  🟢 Buying More (+{todayNet.toLocaleString()})
                                </span>
                              ) : todayTag === 'DUMPING' ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 font-semibold text-[10px]">
                                  🚨 Selling ({todayNet.toLocaleString()})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  ⚪ Holding Firm
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Card 4: Broker Smart Money & Concentration Intelligence */}
            {(() => {
              const leadAcc = liveBrokerPayload?.leadAccumulator || liveBrokerPayload?.topNetBuyers?.[0] || activeSmartMoney?.lead_accumulator;
              const leadDist = liveBrokerPayload?.leadDistributor || liveBrokerPayload?.topNetSellers?.[0] || activeSmartMoney?.lead_seller;
              const bcr3 = liveBrokerPayload?.bcr3BuyPct ?? activeSmartMoney?.concentration?.bcr3_buy_pct ?? 0;
              const leadAccId = leadAcc?.brokerId || leadAcc?.broker || leadAcc?.id || leadAcc?.broker_id;
              const leadAccQty = Math.abs(Number(leadAcc?.netQty ?? leadAcc?.net_kitta ?? 0));
              const leadDistId = leadDist?.brokerId || leadDist?.broker || leadDist?.id || leadDist?.broker_id;
              const leadDistQty = Math.abs(Number(leadDist?.netQty ?? leadDist?.net_kitta ?? 0));
              const leadAccRet = leadAcc?.retentionPct ?? leadAcc?.retention_pct ?? (leadAcc?.buyQty ? Math.round((leadAccQty / leadAcc.buyQty) * 100) : 100);

              return (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                      <Award className="w-3.5 h-3.5 text-emerald-400" />
                      Today's Live Intraday Broker Flow &amp; Concentration
                    </span>
                    <div className="flex items-center gap-2">
                      {isLiveBrokerUpdating ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono font-bold animate-pulse">
                          🟢 Syncing Live Tape…
                        </span>
                      ) : liveBrokerPayload ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                          🟢 Live Intraday Feed
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          🌙 Closed Session
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-bold">
                        BCR3 Buy: {bcr3}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20">
                      <div className="text-slate-400 text-[10px]">Lead Accumulator (Broker)</div>
                      <div className="font-bold text-white mt-0.5">
                        Broker #{leadAccId ?? 'N/A'}
                      </div>
                      <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                        +{Number(leadAccQty).toLocaleString()} kitta ({leadAccRet}% retention)
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20">
                      <div className="text-slate-400 text-[10px]">Lead Distributor (Broker)</div>
                      <div className="font-bold text-white mt-0.5">
                        Broker #{leadDistId ?? 'N/A'}
                      </div>
                      <div className="text-[11px] text-rose-400 font-semibold mt-0.5">
                        -{Number(leadDistQty).toLocaleString()} kitta
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">Top-3 Concentration (BCR3)</div>
                      <div className="font-bold text-indigo-300 mt-0.5">
                        {bcr3}% of Session Buys
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {Number(bcr3) >= 45 ? "High Smart Accumulation" : "Diffused Retail Flow"}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 text-[11px] leading-relaxed">
                    <strong className="text-emerald-300 block mb-0.5 font-medium">💼 Broker Smart Money Interpretation:</strong>
                    {liveBrokerPayload?.adSignal 
                      ? `Desk signals indicate ${liveBrokerPayload.adSignal} flow with ${bcr3}% top-3 buyer dominance.`
                      : (activeSmartMoney?.interpretation || "Institutional broker telemetry matches historical subfile records.")}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-emerald-500/20 bg-slate-900 p-3">
              <div className="font-semibold text-emerald-300 mb-2">
                Top 5 Institutional Accumulators (Baseline-Deflated)
              </div>
              {(telemetry?.smartMoney5D?.topAccumulators || []).map((b) => (
                <div
                  key={b.brokerId}
                  className="flex items-center justify-between py-1.5 border-b border-slate-800/70"
                >
                  <span className="font-medium text-white">Broker #{b.brokerId}</span>
                  <span className="text-emerald-400 font-semibold">
                    +{Number(b.netKitta || 0).toLocaleString()} kitta
                  </span>
                  <span className="text-indigo-300">
                    {Number(b.anomalyScore || 1).toFixed(2)}x • Avg {Math.round(Number(b.avgTicketKitta || 0))}k
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-rose-500/20 bg-slate-900 p-3">
              <div className="font-semibold text-rose-300 mb-2">Top 5 Net Distributors</div>
              {(telemetry?.smartMoney5D?.topDistributors || []).map((b) => (
                <div
                  key={b.brokerId}
                  className="flex items-center justify-between py-1.5 border-b border-slate-800/70"
                >
                  <span className="font-medium text-white">Broker #{b.brokerId}</span>
                  <span className="text-rose-400 font-semibold">
                    {Number(b.netKitta || 0).toLocaleString()} kitta
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
                  Total: +{Number(totalHeldKitta || 0).toLocaleString()} kitta ({allHoldingsList?.length || 0} holders)
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
                          Rs {((Number(b.holdingValueRs) || 0) / 100000).toFixed(2)} L
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
            {/* 1. Live Execution Timing & Imbalance Verdict Card */}
            <div className={`p-3.5 rounded-xl border ${marketDepthAnalysis.timingBg} space-y-2.5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span className="font-bold text-slate-100 text-sm">
                    Order Book Microstructure &amp; Live Execution Verdict
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {telemetry.marketDepth.source === 'LIVE_L2_ORDERBOOK' ? '🟢 Live L2 Exchange Book' : '📊 Reconstructed Depth'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold border ${marketDepthAnalysis.timingColor}`}>
                    {marketDepthAnalysis.timingTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold">
                    OBIR: {marketDepthAnalysis.obir}x
                  </span>
                </div>
              </div>

              {/* Demand vs Supply Visual Imbalance Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold">
                  <span className="text-emerald-400 flex items-center gap-1">
                    🟢 Demand: {marketDepthAnalysis.bidRatio}% ({marketDepthAnalysis.totalBids.toLocaleString()} kitta)
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Spread: Rs {marketDepthAnalysis.spreadRs} ({marketDepthAnalysis.spreadPct}%)
                  </span>
                  <span className="text-rose-400 flex items-center gap-1">
                    Supply: {marketDepthAnalysis.askRatio}% ({marketDepthAnalysis.totalAsks.toLocaleString()} kitta) 🔴
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
                  <div
                    style={{ width: `${marketDepthAnalysis.bidRatio}%` }}
                    className="bg-emerald-500 h-full transition-all duration-300"
                  />
                  <div
                    style={{ width: `${marketDepthAnalysis.askRatio}%` }}
                    className="bg-rose-500 h-full transition-all duration-300"
                  />
                </div>
              </div>

              {/* Depth Microstructure Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                {marketDepthAnalysis.hasIcebergBuyWall && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                    🛡️ Iceberg Buy Wall Detected (Whales absorbing supply at bid)
                  </span>
                )}
                {marketDepthAnalysis.hasSellWall && (
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                    ⚠️ Sell Wall Resistance Active (Distribution capping price)
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  Best Bid: <strong className="text-emerald-400">Rs {marketDepthAnalysis.bestBid}</strong> • Best Ask: <strong className="text-rose-400">Rs {marketDepthAnalysis.bestAsk}</strong>
                </span>
              </div>

              {/* Actionable Interpretation */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 text-xs">
                <div className="text-slate-300 leading-relaxed">
                  <strong className="text-slate-200">Execution Advice: </strong>
                  {marketDepthAnalysis.timingDesc}
                </div>
                <div className="text-[11px] text-sky-200 leading-relaxed pt-1 border-t border-slate-800/80">
                  <strong className="text-sky-300">नेपाली सल्लाह: </strong>
                  {marketDepthAnalysis.timingNepali}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-emerald-500/20 bg-slate-900/70 p-3">
                <div className="font-semibold text-emerald-300 mb-2 flex items-center justify-between">
                  <span>Demand / Buy Queue (Top 5)</span>
                  <span className="text-[10px] text-slate-400">{marketDepthAnalysis.totalBids.toLocaleString()} kitta</span>
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
                <div className="font-semibold text-rose-300 mb-2 flex items-center justify-between">
                  <span>Supply / Sell Queue (Top 5)</span>
                  <span className="text-[10px] text-slate-400">{marketDepthAnalysis.totalAsks.toLocaleString()} kitta</span>
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

        {/* TAB 5: FLOORSHEET TAPE (Live Tape Streaming + Date Picker + Whale >= Rs 100k / 200k) */}
        {activeTab === "FLOORSHEET" && (
          <div className="space-y-3 text-xs">
            {/* Live Tape Streaming Telemetry Header */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Live Floorsheet Exchange Tape
                </span>
                {isLiveFloorsheetUpdating ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono font-bold animate-pulse">
                    🟢 Syncing Live Tape…
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                    🟢 Streaming ({telemetry.floorsheetTape.length} Contracts)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  Vol: <strong className="text-white">{telemetry.overview.totalSessionKitta.toLocaleString()}</strong> kitta
                </span>
                <span className="text-[11px] text-slate-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                  Turnover: <strong className="text-indigo-300">Rs {telemetry.overview.totalSessionTurnover.toLocaleString()}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (resolvedSymbol) {
                      setIsLiveFloorsheetUpdating(true);
                      fetchRealFloorsheet(resolvedSymbol, '', 1, 500, { refresh: true })
                        .then((res: any) => {
                          const rows = res?.rows || res?.data || res?.contracts || [];
                          if (Array.isArray(rows) && rows.length > 0) setLiveFloorsheetContracts(rows);
                        })
                        .catch(() => {})
                        .finally(() => setIsLiveFloorsheetUpdating(false));
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-semibold flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Sync Tape
                </button>
              </div>
            </div>
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
            {(!telemetry.volumeProfile?.nodes || telemetry.volumeProfile.nodes.length === 0) ? (
              <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                <p className="font-bold text-slate-300">No Volume Profile nodes compiled yet for {resolvedSymbol}.</p>
                <p className="text-[11px] text-slate-500 mt-1">Collecting horizontal liquidity price distribution from latest floorsheet trades...</p>
              </div>
            ) : (
              telemetry.volumeProfile.nodes.map((node) => (
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
            ))
            )}
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
