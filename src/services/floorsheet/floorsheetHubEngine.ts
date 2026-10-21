// src/services/floorsheet/floorsheetHubEngine.ts
import {
  safeNum,
  resolveValidNepseSymbol,
  resolveVerifiedPrice,
  normalize5DBrokerPayloadForAi,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
} from "@/services/aiGuru/runAiQuantitativeAssessment";

export interface RawFloorsheetContract {
  contractNo?: string | number;
  contract_no?: string | number;
  symbol?: string;
  stockSymbol?: string;
  tradeDate?: string;
  trade_date?: string;
  businessDate?: string;
  tradeTime?: string;
  trade_time?: string;
  buyerBroker?: number | string;
  buyer_broker?: number | string;
  buyerMemberId?: number | string;
  buyer?: number | string;
  sellerBroker?: number | string;
  seller_broker?: number | string;
  sellerMemberId?: number | string;
  seller?: number | string;
  kitta?: number | string;
  quantity?: number | string;
  contractQuantity?: number | string;
  rate?: number | string;
  price?: number | string;
  contractRate?: number | string;
  amount?: number | string;
  contractAmount?: number | string;
}

export interface EnrichedFloorsheetContract {
  contractNo: string;
  symbol: string;
  tradeDate: string;
  tradeTime: string;
  buyerBroker: number;
  sellerBroker: number;
  kitta: number;
  rate: number;
  amount: number;
  aggressor: "BUY" | "SELL" | "NEUTRAL";
  isInternalCross: boolean; // buyerBroker === sellerBroker
  isWhalePrint: boolean;    // kitta >= 200 or amount >= Rs. 100,000 (1 Lakh)
  isMegaBlock: boolean;     // kitta >= 500 or amount >= Rs. 500,000 (5 Lakh)
}

export interface DepthLevel {
  price: number;
  kitta: number;
  orders: number;
  isSyntheticVap?: boolean;
}

export interface MarketDepthTelemetry {
  source: "LIVE_L2_ORDERBOOK" | "FLOORSHEET_VAP_DEPTH" | "UNAVAILABLE";
  asOfLabel: string;
  totalBidKitta: number;
  totalAskKitta: number;
  bidRatioPct: number;
  obir: number; // Order Book Imbalance Ratio = TotalBidKitta / TotalAskKitta
  obirSignal: "STRONG_DEMAND" | "MODERATE_DEMAND" | "BALANCED" | "SUPPLY_OVERHANG";
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export interface VolumeProfileNode {
  priceBucket: number;
  totalKitta: number;
  buyKitta: number;
  sellKitta: number;
  pctOfTotalVolume: number;
  isPoc: boolean;
}

export interface UnifiedStockTabTelemetry {
  ok: boolean;
  symbol: string;
  overview: {
    verifiedPrice: number | null;
    priceSource: string;
    priceAsOfLabel: string;
    sessionVwap: number;
    vwapSpreadPct: number;
    totalSessionKitta: number;
    totalSessionTurnover: number;
    totalContracts: number;
    avgContractKitta: number;
    whaleContractCount: number;
    megaBlockCount: number;
    internalCrossVolumePct: number;
    buyAggressorPct: number;
    sellAggressorPct: number;
  };
  marketDepth: MarketDepthTelemetry;
  floorsheetTape: EnrichedFloorsheetContract[];
  volumeProfile: {
    pocPrice: number | null;
    nodes: VolumeProfileNode[];
  };
  smartMoney5D: ReturnType<typeof normalize5DBrokerPayloadForAi>;
}

// src/services/floorsheet/floorsheetHubEngine.ts (Add Pure-Equity Guard)
export function isPureEquitySymbol(rawSymbol?: string | null, sector?: string | null): boolean {
  const sym = String(rawSymbol || "").toUpperCase().trim();
  const sec = String(sector || "").toUpperCase().trim();
  if (!sym || /\d/.test(sym)) return false; // Excludes Debentures with maturity/coupon digits
  if (
    sec.includes("MUTUAL") ||
    sec.includes("DEBENTURE") ||
    sec.includes("PROMOTER") ||
    sec.includes("PREFERENCE")
  ) {
    return false;
  }
  if (
    /^(NIBLPF|NIBSF|CMBF|NICGF|NICBF|NMB50|NMBHF|SFMF|SEF|SAEF|SLCF|KEF|LUK|RMF|RBBMF|PSF|GIMES|C30MF|MMF|H8020|KSY|NSY|SSY|SAGF|PRSF|LVF)$/i.test(
      sym
    )
  ) {
    return false;
  }
  if (sym.length >= 5 && (sym.endsWith("PF") || sym.endsWith("SF") || sym.endsWith("MF") || sym.endsWith("PO"))) {
    return false;
  }
  return true;
}

/**
 * Normalizes raw floorsheet rows and runs the chronological Tick-Test Aggressor algorithm.
 * Fixes BUG-A2-04 & BUG-A2-08: Excludes non-equities and flags Whale Prints at >= Rs. 100,000 or >= 200 kitta.
 */
export function enrichFloorsheetContracts(
  rawRows: RawFloorsheetContract[],
  fallbackSymbol: string
): EnrichedFloorsheetContract[] {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

  const filtered = rawRows.filter((r) => {
    const s = r.symbol ?? r.stockSymbol ?? fallbackSymbol;
    return isPureEquitySymbol(s);
  });

  const chronological = [...filtered].sort((a, b) => {
    const cA = String(a.contractNo ?? a.contract_no ?? "");
    const cB = String(b.contractNo ?? b.contract_no ?? "");
    return cA.localeCompare(cB, undefined, { numeric: true });
  });

  let prevRate: number | null = null;
  let lastDirection: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";

  const enriched: EnrichedFloorsheetContract[] = chronological.map((row, idx) => {
    const contractNo = String(row.contractNo ?? row.contract_no ?? `FS-${idx + 1}`);
    const symbol =
      resolveValidNepseSymbol(row.symbol ?? row.stockSymbol, fallbackSymbol) ||
      fallbackSymbol;
    const tradeDate = String(
      row.tradeDate ??
        row.trade_date ??
        row.businessDate ??
        new Date().toISOString().slice(0, 10)
    );
    const tradeTime = String(row.tradeTime ?? row.trade_time ?? "");
    const buyerBroker = Math.round(
      safeNum(
        row.buyerBroker ?? row.buyer_broker ?? row.buyerMemberId ?? row.buyer,
        0
      )
    );
    const sellerBroker = Math.round(
      safeNum(
        row.sellerBroker ??
          row.seller_broker ??
          row.sellerMemberId ??
          row.seller,
        0
      )
    );
    const kitta = Math.round(
      safeNum(row.kitta ?? row.quantity ?? row.contractQuantity, 0)
    );
    const rate = safeNum(row.rate ?? row.price ?? row.contractRate, 0);
    const amount = safeNum(
      row.amount ?? row.contractAmount,
      Number((kitta * rate).toFixed(2))
    );

    let aggressor: "BUY" | "SELL" | "NEUTRAL" = lastDirection;
    if (prevRate !== null && rate > 0) {
      if (rate > prevRate) {
        aggressor = "BUY";
        lastDirection = "BUY";
      } else if (rate < prevRate) {
        aggressor = "SELL";
        lastDirection = "SELL";
      }
    }
    if (rate > 0) prevRate = rate;

    const isInternalCross = buyerBroker > 0 && buyerBroker === sellerBroker;
    const isWhalePrint = kitta >= 200 || amount >= 100_000;
    const isMegaBlock = kitta >= 500 || amount >= 500_000;

    return {
      contractNo,
      symbol,
      tradeDate,
      tradeTime,
      buyerBroker,
      sellerBroker,
      kitta,
      rate,
      amount,
      aggressor,
      isInternalCross,
      isWhalePrint,
      isMegaBlock,
    };
  });

  return enriched.reverse();
}

export function buildVolumeProfileFromFloorsheet(
  contracts: EnrichedFloorsheetContract[]
): { pocPrice: number | null; nodes: VolumeProfileNode[] } {
  if (!contracts || contracts.length === 0) {
    return { pocPrice: null, nodes: [] };
  }

  const bucketMap = new Map<
    number,
    { totalKitta: number; buyKitta: number; sellKitta: number }
  >();
  let grandTotalKitta = 0;

  for (const c of contracts) {
    if (c.rate <= 0 || c.kitta <= 0) continue;
    const bucket = Math.round(c.rate);
    const cur = bucketMap.get(bucket) || {
      totalKitta: 0,
      buyKitta: 0,
      sellKitta: 0,
    };
    cur.totalKitta += c.kitta;
    if (c.aggressor === "BUY") cur.buyKitta += c.kitta;
    if (c.aggressor === "SELL") cur.sellKitta += c.kitta;
    bucketMap.set(bucket, cur);
    grandTotalKitta += c.kitta;
  }

  let maxKitta = 0;
  let pocPrice: number | null = null;
  for (const [priceBucket, stats] of bucketMap.entries()) {
    if (stats.totalKitta > maxKitta) {
      maxKitta = stats.totalKitta;
      pocPrice = priceBucket;
    }
  }

  const nodes: VolumeProfileNode[] = Array.from(bucketMap.entries())
    .map(([priceBucket, stats]) => ({
      priceBucket,
      totalKitta: stats.totalKitta,
      buyKitta: stats.buyKitta,
      sellKitta: stats.sellKitta,
      pctOfTotalVolume:
        grandTotalKitta > 0
          ? Number(((stats.totalKitta / grandTotalKitta) * 100).toFixed(1))
          : 0,
      isPoc: priceBucket === pocPrice,
    }))
    .sort((a, b) => b.priceBucket - a.priceBucket);

  return { pocPrice, nodes };
}

function classifyObir(
  totalBid: number,
  totalAsk: number
): { obir: number; obirSignal: MarketDepthTelemetry["obirSignal"] } {
  const obir =
    totalAsk > 0
      ? Number((totalBid / totalAsk).toFixed(2))
      : totalBid > 0
      ? 3.0
      : 1.0;
  const obirSignal =
    obir >= 1.8
      ? "STRONG_DEMAND"
      : obir >= 1.25
      ? "MODERATE_DEMAND"
      : obir < 0.8
      ? "SUPPLY_OVERHANG"
      : "BALANCED";
  return { obir, obirSignal };
}

export function resolveMarketDepthWithFloorsheetFallback(params: {
  liveDepth?: {
    bids?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
    asks?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
  } | null;
  verifiedPrice: number | null;
  contracts: EnrichedFloorsheetContract[];
}): MarketDepthTelemetry {
  const rawBids = Array.isArray(params.liveDepth?.bids) ? params.liveDepth!.bids : [];
  const rawAsks = Array.isArray(params.liveDepth?.asks) ? params.liveDepth!.asks : [];

  const cleanBids: DepthLevel[] = rawBids
    .map((b) => ({
      price: safeNum(b.price, 0),
      kitta: Math.round(safeNum(b.kitta ?? b.quantity, 0)),
      orders: Math.max(1, Math.round(safeNum(b.orders, 1))),
    }))
    .filter((b) => b.price > 0 && b.kitta > 0)
    .slice(0, 5);

  const cleanAsks: DepthLevel[] = rawAsks
    .map((a) => ({
      price: safeNum(a.price, 0),
      kitta: Math.round(safeNum(a.kitta ?? a.quantity, 0)),
      orders: Math.max(1, Math.round(safeNum(a.orders, 1))),
    }))
    .filter((a) => a.price > 0 && a.kitta > 0)
    .slice(0, 5);

  if (cleanBids.length > 0 || cleanAsks.length > 0) {
    const totalBidKitta = cleanBids.reduce((s, b) => s + b.kitta, 0);
    const totalAskKitta = cleanAsks.reduce((s, a) => s + a.kitta, 0);
    const total = totalBidKitta + totalAskKitta;
    const { obir, obirSignal } = classifyObir(totalBidKitta, totalAskKitta);
    return {
      source: "LIVE_L2_ORDERBOOK",
      asOfLabel: "Live NEPSE L2 Order Book (Top 5 Bid/Ask)",
      totalBidKitta,
      totalAskKitta,
      bidRatioPct:
        total > 0 ? Number(((totalBidKitta / total) * 100).toFixed(1)) : 50,
      obir,
      obirSignal,
      bids: cleanBids,
      asks: cleanAsks,
    };
  }

  const refPrice = params.verifiedPrice ?? 0;
  if (refPrice > 0 && params.contracts.length > 0) {
    const levelMap = new Map<number, { kitta: number; orders: number }>();
    for (const c of params.contracts) {
      if (c.rate <= 0 || c.kitta <= 0) continue;
      const lvl = Number(c.rate.toFixed(1));
      const existing = levelMap.get(lvl) || { kitta: 0, orders: 0 };
      existing.kitta += c.kitta;
      existing.orders += 1;
      levelMap.set(lvl, existing);
    }

    const allLevels = Array.from(levelMap.entries()).map(([price, v]) => ({
      price,
      kitta: v.kitta,
      orders: v.orders,
      isSyntheticVap: true,
    }));

    const vapBids = allLevels
      .filter((l) => l.price <= refPrice)
      .sort((a, b) => b.price - a.price)
      .slice(0, 5);

    const vapAsks = allLevels
      .filter((l) => l.price > refPrice)
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);

    const totalBidKitta = vapBids.reduce((s, b) => s + b.kitta, 0);
    const totalAskKitta = vapAsks.reduce((s, a) => s + a.kitta, 0);
    const total = totalBidKitta + totalAskKitta;
    const { obir, obirSignal } = classifyObir(totalBidKitta, totalAskKitta);

    return {
      source: "FLOORSHEET_VAP_DEPTH",
      asOfLabel:
        "Floorsheet Volume-at-Price (VAP) Liquidity Walls (L2 Feed Closed)",
      totalBidKitta,
      totalAskKitta,
      bidRatioPct:
        total > 0 ? Number(((totalBidKitta / total) * 100).toFixed(1)) : 50,
      obir,
      obirSignal,
      bids: vapBids,
      asks: vapAsks,
    };
  }

  return {
    source: "UNAVAILABLE",
    asOfLabel: "No Live L2 or Floorsheet Depth Available",
    totalBidKitta: 0,
    totalAskKitta: 0,
    bidRatioPct: 50,
    obir: 1.0,
    obirSignal: "BALANCED",
    bids: [],
    asks: [],
  };
}

export function buildUnifiedStockTabTelemetry(params: {
  symbol?: string | null;
  fallbackSymbol?: string | null;
  quote?: RawQuotePayload | null;
  candles?: HistoricalCandle[];
  ledgerTelemetry?: LedgerTelemetryRow | null;
  rawContracts?: RawFloorsheetContract[];
  liveDepth?: {
    bids?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
    asks?: Array<{ price?: number; kitta?: number; quantity?: number; orders?: number }>;
  } | null;
  broker5DRawPayload?: unknown;
}): UnifiedStockTabTelemetry {
  const validSymbol =
    resolveValidNepseSymbol(
      params.symbol,
      params.fallbackSymbol,
      params.quote?.symbol,
      params.ledgerTelemetry?.symbol
    ) || "UNSELECTED";

  const priceRes = resolveVerifiedPrice(
    params.quote,
    params.candles || [],
    params.ledgerTelemetry
  );

  const enrichedContracts = enrichFloorsheetContracts(
    params.rawContracts || [],
    validSymbol
  );

  let totalSessionKitta = 0;
  let totalSessionTurnover = 0;
  let buyAggressorKitta = 0;
  let sellAggressorKitta = 0;
  let internalCrossKitta = 0;
  let whaleContractCount = 0;
  let megaBlockCount = 0;

  for (const c of enrichedContracts) {
    totalSessionKitta += c.kitta;
    totalSessionTurnover += c.amount;
    if (c.aggressor === "BUY") buyAggressorKitta += c.kitta;
    if (c.aggressor === "SELL") sellAggressorKitta += c.kitta;
    if (c.isInternalCross) internalCrossKitta += c.kitta;
    if (c.isWhalePrint) whaleContractCount += 1;
    if (c.isMegaBlock) megaBlockCount += 1;
  }

  const sessionVwap =
    totalSessionKitta > 0
      ? Number((totalSessionTurnover / totalSessionKitta).toFixed(2))
      : safeNum(params.ledgerTelemetry?.entry_vwap ?? priceRes.price, 0);

  const vwapSpreadPct =
    priceRes.price && sessionVwap > 0
      ? Number((((priceRes.price - sessionVwap) / sessionVwap) * 100).toFixed(2))
      : 0;

  const directionalKitta = buyAggressorKitta + sellAggressorKitta;
  const buyAggressorPct =
    directionalKitta > 0
      ? Number(((buyAggressorKitta / directionalKitta) * 100).toFixed(1))
      : 50;
  const sellAggressorPct =
    directionalKitta > 0 ? Number((100 - buyAggressorPct).toFixed(1)) : 50;

  const internalCrossVolumePct =
    totalSessionKitta > 0
      ? Number(((internalCrossKitta / totalSessionKitta) * 100).toFixed(1))
      : 0;

  const volumeProfile = buildVolumeProfileFromFloorsheet(enrichedContracts);

  const marketDepth = resolveMarketDepthWithFloorsheetFallback({
    liveDepth: params.liveDepth,
    verifiedPrice: priceRes.price,
    contracts: enrichedContracts,
  });

  const effectiveBrokerPayload =
    params.broker5DRawPayload &&
    Array.isArray((params.broker5DRawPayload as Record<string, unknown>)?.["5D"])
      ? params.broker5DRawPayload
      : aggregateBrokersFromContracts(enrichedContracts);

  const smartMoney5D = normalize5DBrokerPayloadForAi(effectiveBrokerPayload);

  return {
    ok: validSymbol !== "UNSELECTED" && priceRes.price !== null,
    symbol: validSymbol,
    overview: {
      verifiedPrice: priceRes.price,
      priceSource: priceRes.source,
      priceAsOfLabel: priceRes.asOfLabel,
      sessionVwap,
      vwapSpreadPct,
      totalSessionKitta,
      totalSessionTurnover: Math.round(totalSessionTurnover),
      totalContracts: enrichedContracts.length,
      avgContractKitta:
        enrichedContracts.length > 0
          ? Math.round(totalSessionKitta / enrichedContracts.length)
          : 0,
      whaleContractCount,
      megaBlockCount,
      internalCrossVolumePct,
      buyAggressorPct,
      sellAggressorPct,
    },
    marketDepth,
    floorsheetTape: enrichedContracts,
    volumeProfile,
    smartMoney5D,
  };
}

function aggregateBrokersFromContracts(contracts: EnrichedFloorsheetContract[]) {
  const map = new Map<
    number,
    { brokerId: number; buyKitta: number; sellKitta: number; trades: number }
  >();

  for (const c of contracts) {
    if (c.buyerBroker > 0) {
      const b = map.get(c.buyerBroker) || {
        brokerId: c.buyerBroker,
        buyKitta: 0,
        sellKitta: 0,
        trades: 0,
      };
      b.buyKitta += c.kitta;
      b.trades += 1;
      map.set(c.buyerBroker, b);
    }
    if (c.sellerBroker > 0) {
      const s = map.get(c.sellerBroker) || {
        brokerId: c.sellerBroker,
        buyKitta: 0,
        sellKitta: 0,
        trades: 0,
      };
      s.sellKitta += c.kitta;
      s.trades += 1;
      map.set(c.sellerBroker, s);
    }
  }

  return Array.from(map.values());
}
