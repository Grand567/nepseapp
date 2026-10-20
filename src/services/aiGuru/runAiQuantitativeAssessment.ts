// src/services/aiGuru/runAiQuantitativeAssessment.ts

export type PriceSourceType =
  | "LIVE_LTP"
  | "TODAY_CLOSE"
  | "PREV_CLOSE"
  | "HISTORICAL_CANDLE"
  | "LEDGER_VWAP"
  | "UNAVAILABLE";

export interface RawQuotePayload {
  symbol?: string;
  ltp?: number | string | null;
  lastTradedPrice?: number | string | null;
  close?: number | string | null;
  todayClose?: number | string | null;
  prevClose?: number | string | null;
  previousClose?: number | string | null;
  turnover?: number | string | null;
  volume?: number | string | null;
  isHoliday?: boolean;
  holidayName?: string;
}

export interface HistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface LedgerTelemetryRow {
  symbol: string;
  strategy_name?: string;
  strategy?: string;
  entry_vwap: number;
  settlement_unlock_date: string;
  mfe_pct: number;
  mae_pct: number;
  nepse_alpha_pct: number;
  broker_anomaly_score: number;
  avg_ticket_kitta: number;
  ratchet_triggered?: boolean | number;
  status?: "OPEN" | "LOCKED_T2" | "RATCHET_PROTECTED" | "CLOSED" | "TARGET_HIT" | "STOP_LOSS" | "ACTIVE";
}

export interface BrokerSmartMoney5DSummary {
  netAccumulationRatio: number; // 0 to 100%
  topAccumulators: Array<{
    brokerId: number | string;
    netKitta: number;
    anomalyScore: number;
    avgTicketKitta: number;
  }>;
  topDistributors: Array<{
    brokerId: number | string;
    netKitta: number;
    anomalyScore: number;
    avgTicketKitta: number;
  }>;
  dominantRegime: "INSTITUTIONAL_ACCUMULATION" | "RETAIL_CHURN" | "DISTRIBUTION" | "NEUTRAL";
}

export interface AiQuantitativeAssessmentResult {
  ok: boolean;
  symbol: string;
  verifiedPrice: number | null;
  priceSource: PriceSourceType;
  priceAsOfLabel: string;
  errorMarkdown?: string;
  metrics?: {
    verifiedPrice: number;
    priceSource: PriceSourceType;
    dayChangePct: number;
    atr14: number;
    atrPct: number;
    roundTripFeePct: number; // NEPSE broker + SEBON + DP + 7.5% CGT impact
    ratchetTriggerPrice: number; // Entry + 1.2R target
    ratchetStopPrice: number; // Entry + 1.2% post-fee shield
    t2UnlockStatus: string;
    mfePct: number;
    maePct: number;
    nepseAlphaPct: number;
    brokerAnomalyScore: number;
    avgTicketKitta: number;
    smartMoney5D: BrokerSmartMoney5DSummary;
  };
  aiPromptContext: string;
}

/**
 * Safe numeric parser matching Bug #3 guard pattern
 */
export function safeNum(val: unknown, fallback = 0): number {
  if (val === null || val === undefined || val === "") return fallback;
  const parsed = typeof val === "number" ? val : Number(String(val).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Validates and normalizes a NEPSE ticker symbol, rejecting placeholders like "STOCK"
 */
export function resolveValidNepseSymbol(
  ...candidates: Array<string | undefined | null>
): string | null {
  const INVALID_PLACEHOLDERS = new Set(["STOCK", "SYMBOL", "TICKER", "UNDEFINED", "NULL", "N/A", ""]);
  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const cleaned = raw.trim().toUpperCase();
    if (cleaned.length >= 2 && cleaned.length <= 12 && !INVALID_PLACEHOLDERS.has(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/**
 * 4-Stage Verified Price Fallback Chain:
 * Live LTP -> Today's Close -> Previous Close -> Last Historical Candle Close (-> Ledger VWAP)
 */
export function resolveVerifiedPrice(
  quote: RawQuotePayload | null | undefined,
  candles: HistoricalCandle[] = [],
  ledgerRow?: LedgerTelemetryRow | null
): { price: number | null; source: PriceSourceType; asOfLabel: string; prevCloseRef: number } {
  const sortedCandles = [...candles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latestCandle = sortedCandles[0];
  const prevCandle = sortedCandles[1];

  const liveLtp = safeNum(quote?.ltp ?? quote?.lastTradedPrice, 0);
  const todayClose = safeNum(quote?.todayClose ?? quote?.close, 0);
  const prevClose = safeNum(
    quote?.prevClose ?? quote?.previousClose ?? prevCandle?.close ?? latestCandle?.open,
    0
  );
  const candleClose = safeNum(latestCandle?.close, 0);
  const ledgerVwap = safeNum(ledgerRow?.entry_vwap, 0);

  if (liveLtp > 0 && !quote?.isHoliday) {
    return {
      price: liveLtp,
      source: "LIVE_LTP",
      asOfLabel: "Live Exchange Feed (LTP)",
      prevCloseRef: prevClose > 0 ? prevClose : liveLtp,
    };
  }

  if (todayClose > 0) {
    return {
      price: todayClose,
      source: "TODAY_CLOSE",
      asOfLabel: quote?.isHoliday
        ? `Holiday Close (${quote.holidayName || "NEPSE Closed"})`
        : "Today's Closing Price",
      prevCloseRef: prevClose > 0 ? prevClose : todayClose,
    };
  }

  if (prevClose > 0) {
    return {
      price: prevClose,
      source: "PREV_CLOSE",
      asOfLabel: "Previous Session Close (Exchange Feed Offline/Holiday)",
      prevCloseRef: safeNum(prevCandle?.close, prevClose),
    };
  }

  if (candleClose > 0) {
    return {
      price: candleClose,
      source: "HISTORICAL_CANDLE",
      asOfLabel: `Last Historical Candle (${latestCandle.date})`,
      prevCloseRef: safeNum(prevCandle?.close, candleClose),
    };
  }

  if (ledgerVwap > 0) {
    return {
      price: ledgerVwap,
      source: "LEDGER_VWAP",
      asOfLabel: "SQLite Signal Ledger Entry VWAP",
      prevCloseRef: ledgerVwap,
    };
  }

  return {
    price: null,
    source: "UNAVAILABLE",
    asOfLabel: "No Verified Price Telemetry",
    prevCloseRef: 0,
  };
}

/**
 * Computes 14-period Average True Range (ATR) from historical candles
 */
function computeAtr14(candles: HistoricalCandle[], fallbackPrice: number): number {
  if (!candles || candles.length < 2) {
    return Number((fallbackPrice * 0.025).toFixed(2)); // 2.5% default volatility estimate
  }
  const sorted = [...candles].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    const highLow = safeNum(cur.high) - safeNum(cur.low);
    const highPrevClose = Math.abs(safeNum(cur.high) - safeNum(prev.close));
    const lowPrevClose = Math.abs(safeNum(cur.low) - safeNum(prev.close));
    trs.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }
  const recent = trs.slice(-14);
  const avg = recent.reduce((acc, v) => acc + v, 0) / (recent.length || 1);
  return avg > 0 ? Number(avg.toFixed(2)) : Number((fallbackPrice * 0.025).toFixed(2));
}

/**
 * Main Quantitative Assessment Entrypoint for AI Guru (Bug #4 Fix)
 */
export async function runAiQuantitativeAssessment(params: {
  symbol?: string | null;
  fallbackSymbol?: string | null;
  quote?: RawQuotePayload | null;
  candles?: HistoricalCandle[];
  ledgerTelemetry?: LedgerTelemetryRow | null;
  broker5DRawPayload?: unknown;
  normalizeBrokerFn?: (payload: unknown) => BrokerSmartMoney5DSummary;
}): Promise<AiQuantitativeAssessmentResult> {
  // 1. Resolve Symbol & guard against "STOCK" placeholder
  const resolvedSymbol = resolveValidNepseSymbol(
    params.symbol,
    params.fallbackSymbol,
    params.quote?.symbol,
    params.ledgerTelemetry?.symbol
  );

  if (!resolvedSymbol) {
    return {
      ok: false,
      symbol: "UNSELECTED",
      verifiedPrice: null,
      priceSource: "UNAVAILABLE",
      priceAsOfLabel: "No Scrip Selected",
      errorMarkdown: [
        `### ⚠️ No Active Scrip Selected`,
        `- Please select a valid NEPSE scrip symbol from the dashboard or Signal Track Record before running AI Guru.`,
      ].join("\n"),
      aiPromptContext: "",
    };
  }

  // 1B. Dynamic on-demand SQLite telemetry fallback if not passed by caller
  let effectiveLedger = params.ledgerTelemetry || null;
  let effectiveCandles = params.candles || [];

  if (!effectiveLedger || effectiveCandles.length === 0) {
    try {
      if (typeof window !== "undefined" && typeof fetch === "function") {
        const resp = await fetch(`/api/stocks/${encodeURIComponent(resolvedSymbol)}/ledger-telemetry`, {
          headers: { Accept: "application/json" }
        });
        if (resp.ok) {
          const tData = await resp.json();
          if (tData?.ledgerRow && !effectiveLedger) effectiveLedger = tData.ledgerRow;
          if (Array.isArray(tData?.candles) && tData.candles.length > 0 && effectiveCandles.length === 0) {
            effectiveCandles = tData.candles;
          }
        }
      }
    } catch (_) {}
  }

  // 2. Run 4-Stage Price Fallback Chain
  const { price, source, asOfLabel, prevCloseRef } = resolveVerifiedPrice(
    params.quote,
    effectiveCandles,
    effectiveLedger
  );

  if (price === null || price <= 0) {
    return {
      ok: false,
      symbol: resolvedSymbol,
      verifiedPrice: null,
      priceSource: "UNAVAILABLE",
      priceAsOfLabel: asOfLabel,
      errorMarkdown: [
        `### ⚠️ Data Insufficient for **${resolvedSymbol}**`,
        `- Verified price could not be resolved across Live LTP, Today's Close, Previous Close, or Historical OHLCV candles.`,
        `- Ensure historical backfill or floor-sheet sync has run for **${resolvedSymbol}**.`,
      ].join("\n"),
      aiPromptContext: "",
    };
  }

  // 3. Compute Technical & NEPSE Institutional Fee/Ratchet Telemetry
  const atr14 = computeAtr14(effectiveCandles, price);
  const atrPct = Number(((atr14 / price) * 100).toFixed(2));
  const dayChangePct =
    prevCloseRef > 0 ? Number((((price - prevCloseRef) / prevCloseRef) * 100).toFixed(2)) : 0;

  // NEPSE Fee Model: ~0.36% avg broker commission each way + 0.015% SEBON + Rs 50 DP charge (~0.95% - 1.15% round-trip)
  const roundTripFeePct = 1.12;
  const entryRef = safeNum(effectiveLedger?.entry_vwap, price);
  const oneR = Math.max(atr14 * 1.5, entryRef * 0.03); // 1R risk unit
  const ratchetTriggerPrice = Number((entryRef + 1.2 * oneR).toFixed(2));
  const ratchetStopPrice = Number((entryRef * 1.012).toFixed(2)); // Entry + 1.2% post-fee shield

  // 4. Extract SQLite Walk-Forward Ledger Metrics
  const mfePct = safeNum(effectiveLedger?.mfe_pct, 0);
  const maePct = safeNum(effectiveLedger?.mae_pct, 0);
  const nepseAlphaPct = safeNum(effectiveLedger?.nepse_alpha_pct, 0);
  const brokerAnomalyScore = safeNum(effectiveLedger?.broker_anomaly_score, 1.0);
  const avgTicketKitta = safeNum(effectiveLedger?.avg_ticket_kitta, 0);
  const unlockDate = effectiveLedger?.settlement_unlock_date || "Unlocked / No Active Lock";

  // 5. Extract 5D Broker Smart Money Summary
  const defaultSmartMoney: BrokerSmartMoney5DSummary = {
    netAccumulationRatio: 50,
    topAccumulators: [],
    topDistributors: [],
    dominantRegime:
      brokerAnomalyScore >= 1.75 && avgTicketKitta >= 300
        ? "INSTITUTIONAL_ACCUMULATION"
        : avgTicketKitta > 0 && avgTicketKitta < 45
        ? "RETAIL_CHURN"
        : "NEUTRAL",
  };

  const smartMoney5D = params.normalizeBrokerFn && params.broker5DRawPayload
    ? params.normalizeBrokerFn(params.broker5DRawPayload)
    : defaultSmartMoney;

  // 6. Construct Structured Institutional Context for AI Guru LLM / Analyzer
  const topAccText =
    smartMoney5D.topAccumulators.length > 0
      ? smartMoney5D.topAccumulators
          .slice(0, 3)
          .map(
            (b) =>
              `Broker #${b.brokerId} (+${b.netKitta.toLocaleString()} kitta, Anomaly: ${b.anomalyScore.toFixed(
                2
              )}x, Avg Ticket: ${Math.round(b.avgTicketKitta)} kitta)`
          )
          .join("; ")
      : `Ledger Anomaly Score ${brokerAnomalyScore.toFixed(2)}x | Avg Ticket ${Math.round(
          avgTicketKitta
        )} kitta`;

  const topDistText =
    smartMoney5D.topDistributors.length > 0
      ? smartMoney5D.topDistributors
          .slice(0, 3)
          .map(
            (b) =>
              `Broker #${b.brokerId} (${b.netKitta.toLocaleString()} kitta, Anomaly: ${b.anomalyScore.toFixed(
                2
              )}x)`
          )
          .join("; ")
      : "None flagged";

  const aiPromptContext = `
[DRABYASHREE NEPSE INSTITUTIONAL TELEMETRY — ${resolvedSymbol}]
1. Price Discovery & Feed Status:
   - Verified Price: Rs ${price.toFixed(2)} (Source: ${asOfLabel})
   - Session Change: ${dayChangePct >= 0 ? "+" : ""}${dayChangePct}% | 14D ATR: Rs ${atr14} (${atrPct}%)
   - Post-Fee Breakeven Floor: +${roundTripFeePct}% (includes Broker Comm, SEBON 0.015%, Rs 50 DP, 7.5% CGT rules)

2. Walk-Forward T+2 Signal Ledger (drabyashree_ledger.db):
   - Reference Entry VWAP: Rs ${entryRef.toFixed(2)}
   - T+2 Demat Settlement Unlock: ${unlockDate}
   - Max Favorable Excursion (MFE): +${mfePct.toFixed(2)}% | Max Adverse Excursion (MAE): ${maePct.toFixed(2)}%
   - Benchmark Relative Strength (NEPSE Alpha): ${nepseAlphaPct >= 0 ? "+" : ""}${nepseAlphaPct.toFixed(2)}%
   - 2-Stage Ratchet Shield: Trigger at Rs ${ratchetTriggerPrice} (+1.2R) -> Locks Stop-Loss at Rs ${ratchetStopPrice} (Entry + 1.2%)

3. 5D Big Broker Smart Money & Floor-Sheet Anomaly:
   - Baseline-Adjusted Broker Anomaly Score: ${brokerAnomalyScore.toFixed(2)}x (Retail giants like #58 deflated by 30D market share)
   - Average Ticket Size: ${Math.round(avgTicketKitta)} kitta (HNI/Institutional threshold >= 300 kitta; Retail herd < 45 kitta)
   - 5D Accumulation Pressure: ${smartMoney5D.netAccumulationRatio.toFixed(1)}% (${smartMoney5D.dominantRegime})
   - Top 5D Accumulators: ${topAccText}
   - Top 5D Distributors: ${topDistText}

INSTRUCTIONS FOR AI GURU:
Provide a concise, institutional-grade NEPSE quantitative assessment for ${resolvedSymbol}. Explicitly evaluate whether 5D broker accumulation reflects genuine HNI/institutional conviction (>= 300 kitta ticket & high anomaly score) or retail churn, verify if MFE/ATR supports clearing the 1.2R Ratchet Shield after T+2 settlement lock, and state clear invalidation levels.
`.trim();

  return {
    ok: true,
    symbol: resolvedSymbol,
    verifiedPrice: price,
    priceSource: source,
    priceAsOfLabel: asOfLabel,
    metrics: {
      verifiedPrice: price,
      priceSource: source,
      dayChangePct,
      atr14,
      atrPct,
      roundTripFeePct,
      ratchetTriggerPrice,
      ratchetStopPrice,
      t2UnlockStatus: unlockDate,
      mfePct,
      maePct,
      nepseAlphaPct,
      brokerAnomalyScore,
      avgTicketKitta,
      smartMoney5D,
    },
    aiPromptContext,
  };
}
