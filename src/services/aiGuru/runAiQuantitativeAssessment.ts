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

export interface BrokerSmartMoneyItem {
  brokerId: number | string;
  netKitta: number;
  anomalyScore: number;
  avgTicketKitta: number;
  buyKitta?: number;
  sellKitta?: number;
  holdKitta?: number;
  buyAmount?: number;
  sellAmount?: number;
  avgBuyPrice?: number;
  avgSellPrice?: number;
  retentionPct?: number;
  brokerName?: string;
  holdingSharePct?: number;
}

export interface BrokerSmartMoney5DSummary {
  netAccumulationRatio: number; // 0 to 100%
  topAccumulators: Array<BrokerSmartMoneyItem>;
  topDistributors: Array<BrokerSmartMoneyItem>;
  allHoldings?: Array<BrokerSmartMoneyItem>;
  allDistributors?: Array<BrokerSmartMoneyItem>;
  totalHoldersCount?: number;
  dominantRegime: "INSTITUTIONAL_ACCUMULATION" | "RETAIL_CHURN" | "DISTRIBUTION" | "NEUTRAL";
  totalSharesHeldTillNow?: number;
  topHoldingBroker?: BrokerSmartMoneyItem | null;
  avgBuyingPrice?: number | null;
  avgSellingPrice?: number | null;
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
 * 5-Stage Verified Price Fallback Chain (Hardened Patch A):
 * Live LTP -> Today's Close -> Quote Previous Close -> Historical Candle Close -> Ledger VWAP
 */
export function resolveVerifiedPrice(
  quote: RawQuotePayload | null | undefined,
  candles: HistoricalCandle[] = [],
  ledgerRow?: LedgerTelemetryRow | null
): { price: number | null; source: PriceSourceType; asOfLabel: string; prevCloseRef: number } {
  const sortedCandlesDesc = [...candles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latestCandle = sortedCandlesDesc[0];
  const prevCandle = sortedCandlesDesc[1];

  const liveLtp = safeNum(quote?.ltp ?? quote?.lastTradedPrice, 0);
  const todayClose = safeNum(quote?.todayClose ?? quote?.close, 0);
  const quotePrevClose = safeNum(quote?.prevClose ?? quote?.previousClose, 0);
  const candleClose = safeNum(latestCandle?.close, 0);
  const ledgerVwap = safeNum(ledgerRow?.entry_vwap, 0);

  const referencePrevClose =
    quotePrevClose > 0
      ? quotePrevClose
      : safeNum(prevCandle?.close ?? latestCandle?.open, 0);

  // Stage 1: Live LTP (only when market is not on holiday)
  if (liveLtp > 0 && !quote?.isHoliday) {
    return {
      price: liveLtp,
      source: "LIVE_LTP",
      asOfLabel: "Live Exchange Feed (LTP)",
      prevCloseRef: referencePrevClose > 0 ? referencePrevClose : liveLtp,
    };
  }

  // Stage 2: Today's Close (or Holiday Close override)
  if (todayClose > 0) {
    return {
      price: todayClose,
      source: "TODAY_CLOSE",
      asOfLabel: quote?.isHoliday
        ? `Holiday Close (${quote.holidayName || "NEPSE Closed"})`
        : "Today's Closing Price",
      prevCloseRef: referencePrevClose > 0 ? referencePrevClose : todayClose,
    };
  }

  // Stage 3: Quote Previous Close
  if (quotePrevClose > 0) {
    return {
      price: quotePrevClose,
      source: "PREV_CLOSE",
      asOfLabel: "Previous Session Close (Exchange Feed Offline/Holiday)",
      prevCloseRef: safeNum(prevCandle?.close, quotePrevClose),
    };
  }

  // Stage 4: Latest Historical OHLCV Candle Close
  if (candleClose > 0) {
    return {
      price: candleClose,
      source: "HISTORICAL_CANDLE",
      asOfLabel: `Last Historical Candle (${latestCandle.date})`,
      prevCloseRef: safeNum(prevCandle?.close ?? latestCandle?.open, candleClose),
    };
  }

  // Stage 5: SQLite Signal Ledger Entry VWAP
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
 * Normalizes multi-shape 5D Broker payloads with volume-share anomaly deflation (Hardened Patch B)
 */
export function normalize5DBrokerPayloadForAi(rawPayload: unknown): BrokerSmartMoney5DSummary {
  const empty: BrokerSmartMoney5DSummary = {
    netAccumulationRatio: 50,
    topAccumulators: [],
    topDistributors: [],
    dominantRegime: "NEUTRAL",
  };

  if (!rawPayload || typeof rawPayload !== "object") return empty;
  const obj = rawPayload as Record<string, unknown>;

  const candidateArray = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(obj["5D"])
    ? (obj["5D"] as unknown[])
    : Array.isArray(obj["5d"])
    ? (obj["5d"] as unknown[])
    : Array.isArray(obj.brokers)
    ? (obj.brokers as unknown[])
    : Array.isArray(obj.topHoldings)
    ? (obj.topHoldings as unknown[])
    : Array.isArray(obj["30D"])
    ? (obj["30D"] as unknown[])
    : Array.isArray(obj.data)
    ? (obj.data as unknown[])
    : [];

  if (candidateArray.length === 0) return empty;

  const RETAIL_GIANT_BASELINE: Record<string, number> = {
    "58": 0.085,
    "45": 0.042,
    "49": 0.038,
    "34": 0.032,
  };

  let totalBuyKitta = 0;
  let totalSellKitta = 0;

  for (const rawItem of candidateArray) {
    const item = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    totalBuyKitta += safeNum(item.buyKitta ?? item.buy_kitta ?? item.buyVolume ?? item.buy_vol, 0);
    totalSellKitta += safeNum(item.sellKitta ?? item.sell_kitta ?? item.sellVolume ?? item.sell_vol, 0);
  }

  const normalizedRows = candidateArray.map((rawItem) => {
    const item = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const brokerId = String(item.brokerId ?? item.broker_no ?? item.broker ?? item.broker_id ?? "0").replace(/^0+/, "");
    const buyKitta = safeNum(item.buyKitta ?? item.buy_kitta ?? item.buyVolume ?? item.buy_vol, 0);
    const sellKitta = safeNum(item.sellKitta ?? item.sell_kitta ?? item.sellVolume ?? item.sell_vol, 0);
    const netKitta = safeNum(item.netKitta ?? item.net_kitta, buyKitta - sellKitta);
    const tradeCount = Math.max(1, safeNum(item.trades ?? item.trade_count ?? item.totalTrades, 1));
    const avgTicketKitta = safeNum(
      item.avgTicketKitta ?? item.avg_ticket_kitta,
      (buyKitta + sellKitta) / tradeCount
    );

    const baselineShare = RETAIL_GIANT_BASELINE[brokerId] ?? 0.018;
    const scripBuyShare = totalBuyKitta > 0 ? buyKitta / totalBuyKitta : baselineShare;
    const ticketMultiplier = avgTicketKitta >= 300 ? 1.35 : avgTicketKitta < 45 ? 0.65 : 1.0;

    const computedAnomaly = (scripBuyShare / baselineShare) * ticketMultiplier;
    const rawAnomaly = safeNum(
      item.anomalyScore ?? item.broker_anomaly_score,
      computedAnomaly
    );

    const buyAmt = safeNum(item.buyAmount ?? item.buy_amount ?? item.buyAmt, 0);
    const sellAmt = safeNum(item.sellAmount ?? item.sell_amount ?? item.sellAmt, 0);
    const avgBuyPrice = safeNum(item.avgBuyPrice ?? item.avg_buy_price ?? item.avgBuyRate, buyKitta > 0 ? (buyAmt / buyKitta) : 0);
    const avgSellPrice = safeNum(item.avgSellPrice ?? item.avg_sell_price ?? item.avgSellRate, sellKitta > 0 ? (sellAmt / sellKitta) : 0);
    const retentionPct = buyKitta > 0 ? Number(((Math.max(0, netKitta) / buyKitta) * 100).toFixed(1)) : 0;
    const rawBrokerName = String(item.brokerName ?? item.name ?? "").trim();
    const brokerName = rawBrokerName || undefined;

    return {
      brokerId,
      netKitta,
      buyKitta,
      sellKitta,
      holdKitta: Math.max(0, netKitta),
      buyAmount: buyAmt,
      sellAmount: sellAmt,
      avgBuyPrice: Number(avgBuyPrice.toFixed(2)),
      avgSellPrice: Number(avgSellPrice.toFixed(2)),
      retentionPct,
      brokerName,
      anomalyScore: Number(Math.max(0.1, rawAnomaly).toFixed(2)),
      avgTicketKitta: Math.round(avgTicketKitta),
    };
  });

  const accumulators = normalizedRows.filter((r) => r.netKitta > 0);
  const distributors = normalizedRows.filter((r) => r.netKitta < 0);

  const topAccumulators = [...accumulators]
    .sort((a, b) => b.netKitta * b.anomalyScore - a.netKitta * a.anomalyScore)
    .slice(0, 5);

  const topDistributors = [...distributors]
    .sort((a, b) => Math.abs(b.netKitta) - Math.abs(a.netKitta))
    .slice(0, 5);

  const totalSharesHeldTillNow = accumulators.reduce((s, b) => s + b.netKitta, 0);
  const allHoldings = [...accumulators]
    .map((b) => ({
      ...b,
      holdingSharePct: totalSharesHeldTillNow > 0 ? Number(((b.netKitta / totalSharesHeldTillNow) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.netKitta - a.netKitta);
  const allDistributors = [...distributors].sort((a, b) => a.netKitta - b.netKitta);

  const sortedByHold = [...accumulators].sort((a, b) => b.netKitta - a.netKitta);
  const topHoldingBroker = sortedByHold[0] || null;

  const totalAccBuyAmt = accumulators.reduce((s, b) => s + (b.buyAmount || 0), 0);
  const totalAccBuyQty = accumulators.reduce((s, b) => s + (b.buyKitta || 0), 0);
  const avgBuyingPrice = totalAccBuyQty > 0 ? Number((totalAccBuyAmt / totalAccBuyQty).toFixed(2)) : null;

  const totalDistSellAmt = distributors.reduce((s, b) => s + (b.sellAmount || 0), 0);
  const totalDistSellQty = distributors.reduce((s, b) => s + (b.sellKitta || 0), 0);
  const avgSellingPrice = totalDistSellQty > 0 ? Number((totalDistSellAmt / totalDistSellQty).toFixed(2)) : null;

  const totalVolume = totalBuyKitta + totalSellKitta;
  const netAccumulationRatio =
    totalVolume > 0
      ? Number(((totalBuyKitta / totalVolume) * 100).toFixed(1))
      : 50;

  const topAcc = topAccumulators[0];
  let dominantRegime: BrokerSmartMoney5DSummary["dominantRegime"] = "NEUTRAL";
  if (topAcc && (topAcc.anomalyScore >= 1.75 || topAcc.anomalyScore >= 1.4) && topAcc.avgTicketKitta >= 300 && netAccumulationRatio >= 54) {
    dominantRegime = "INSTITUTIONAL_ACCUMULATION";
  } else if (netAccumulationRatio <= 45) {
    dominantRegime = "DISTRIBUTION";
  } else if (topAcc && topAcc.avgTicketKitta < 45) {
    dominantRegime = "RETAIL_CHURN";
  }

  return {
    netAccumulationRatio,
    topAccumulators,
    topDistributors,
    allHoldings,
    allDistributors,
    totalHoldersCount: accumulators.length,
    dominantRegime,
    totalSharesHeldTillNow,
    topHoldingBroker,
    avgBuyingPrice,
    avgSellingPrice,
  };
}

/**
 * Computes 14-period Average True Range (ATR) in strict chronological order (Oldest -> Newest)
 */
function computeAtr14(candles: HistoricalCandle[], fallbackPrice: number): number {
  if (!candles || candles.length < 2) {
    return Number((fallbackPrice * 0.025).toFixed(2));
  }
  const chronological = [...candles].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trs: number[] = [];
  for (let i = 1; i < chronological.length; i++) {
    const cur = chronological[i];
    const prev = chronological[i - 1];
    const highLow = safeNum(cur.high) - safeNum(cur.low);
    const highPrevClose = Math.abs(safeNum(cur.high) - safeNum(prev.close));
    const lowPrevClose = Math.abs(safeNum(cur.low) - safeNum(prev.close));
    trs.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }
  const recent14 = trs.slice(-14);
  const avg = recent14.reduce((acc, v) => acc + v, 0) / (recent14.length || 1);
  return avg > 0 ? Number(avg.toFixed(2)) : Number((fallbackPrice * 0.025).toFixed(2));
}

/**
 * Main Quantitative Assessment Entrypoint for AI Guru
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

  // Dynamic on-demand SQLite telemetry fallback if not passed by caller
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
      ].join("\n"),
      aiPromptContext: "",
    };
  }

  const atr14 = computeAtr14(effectiveCandles, price);
  const atrPct = Number(((atr14 / price) * 100).toFixed(2));
  const dayChangePct =
    prevCloseRef > 0 ? Number((((price - prevCloseRef) / prevCloseRef) * 100).toFixed(2)) : 0;

  const roundTripFeePct = 1.12;
  const entryRef = safeNum(effectiveLedger?.entry_vwap, price);
  const oneR = Math.max(atr14 * 1.5, entryRef * 0.03);
  const ratchetTriggerPrice = Number((entryRef + 1.2 * oneR).toFixed(2));
  const ratchetStopPrice = Number((entryRef * 1.012).toFixed(2));

  const mfePct = safeNum(effectiveLedger?.mfe_pct, 0);
  const maePct = safeNum(effectiveLedger?.mae_pct, 0);
  const nepseAlphaPct = safeNum(effectiveLedger?.nepse_alpha_pct, 0);
  const brokerAnomalyScore = safeNum(effectiveLedger?.broker_anomaly_score, 1.0);
  const avgTicketKitta = safeNum(effectiveLedger?.avg_ticket_kitta, 0);
  const unlockDate = effectiveLedger?.settlement_unlock_date || "Unlocked / No Active Lock";

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
   - Post-Fee Breakeven Floor: +${roundTripFeePct}%

2. Walk-Forward T+2 Signal Ledger (drabyashree_ledger.db):
   - Reference Entry VWAP: Rs ${entryRef.toFixed(2)}
   - T+2 Demat Settlement Unlock: ${unlockDate}
   - Max Favorable Excursion (MFE): +${mfePct.toFixed(2)}% | Max Adverse Excursion (MAE): ${maePct.toFixed(2)}%
   - Benchmark Relative Strength (NEPSE Alpha): ${nepseAlphaPct >= 0 ? "+" : ""}${nepseAlphaPct.toFixed(2)}%
   - 2-Stage Ratchet Shield: Trigger at Rs ${ratchetTriggerPrice} (+1.2R) -> Locks Stop-Loss at Rs ${ratchetStopPrice} (Entry + 1.2%)

3. 5D Big Broker Smart Money & Floor-Sheet Anomaly:
   - Baseline-Adjusted Broker Anomaly Score: ${brokerAnomalyScore.toFixed(2)}x
   - Average Ticket Size: ${Math.round(avgTicketKitta)} kitta
   - 5D Accumulation Pressure: ${smartMoney5D.netAccumulationRatio.toFixed(1)}% (${smartMoney5D.dominantRegime})
   - Top 5D Accumulators: ${topAccText}
   - Top 5D Distributors: ${topDistText}

INSTRUCTIONS FOR AI GURU:
Provide a concise, institutional-grade NEPSE quantitative assessment for ${resolvedSymbol}.
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
