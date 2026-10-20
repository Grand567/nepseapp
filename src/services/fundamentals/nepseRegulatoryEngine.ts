// src/services/fundamentals/nepseRegulatoryEngine.ts
import { safeNum, resolveValidNepseSymbol } from "../aiGuru/runAiQuantitativeAssessment";

export type RegulatoryGateCode =
  | "CLEAR_COMPLIANT"
  | "NRB_REGULATORY_FAIL"
  | "NEGATIVE_EARNINGS_AVOID"
  | "PROMOTER_LOCKIN_BLACKOUT"
  | "OVERVALUED_SPECULATIVE";

export interface RawFundamentalRecord {
  symbol?: string;
  sector?: string;
  fiscalQuarter?: string;
  fiscal_quarter?: string;
  paidUpCapital?: number;
  paid_up_capital?: number;
  publicFloatKitta?: number;
  public_float_kitta?: number;
  promoterSharePct?: number;
  promoter_share_pct?: number;
  publicSharePct?: number;
  public_share_pct?: number;
  epsTtm?: number;
  eps_ttm?: number;
  bookValuePerShare?: number;
  book_value_per_share?: number;
  roePct?: number;
  roe_pct?: number;
  nplPct?: number | null;
  npl_pct?: number | null;
  carPct?: number | null;
  car_pct?: number | null;
  distributableEps?: number | null;
  distributable_eps?: number | null;
  promoterUnlockDate?: string | null;
  promoter_unlock_date?: string | null;
  promoterLockedKitta?: number;
  promoter_locked_kitta?: number;
}

export interface CorporateActionRow {
  fiscalYear: string;
  bonusSharePct: number;
  cashDividendPct: number;
  totalDividendPct: number;
  rightShareRatio?: string | null;
  bookCloseDate?: string | null;
  status: string;
}

export interface EvaluatedFundamentalTelemetry {
  symbol: string;
  sector: string;
  fiscalQuarter: string;
  verifiedPrice: number | null;
  metrics: {
    epsTtm: number;
    distributableEps: number;
    bookValuePerShare: number;
    peRatio: number | null;
    pbvRatio: number | null;
    roePct: number;
    grahamFairValue: number;
    valuationMarginPct: number | null; // Positive = Undervalued vs Graham Number
    nplPct: number | null;
    carPct: number | null;
    promoterSharePct: number;
    publicSharePct: number;
    paidUpCapitalCr: number; // In Crores NPR
  };
  promoterLockIn: {
    unlockDate: string | null;
    daysRemaining: number | null;
    lockedKitta: number;
    isBlackoutDanger: boolean; // True when 0 <= daysRemaining <= 60
    statusLabel: string;
  };
  regulatoryGates: Array<{
    code: RegulatoryGateCode;
    severity: "PASS" | "WARN" | "CRITICAL_VETO";
    title: string;
    detail: string;
  }>;
  hasCriticalVeto: boolean;
  corporateActions: CorporateActionRow[];
}

export function evaluateNepseFundamentalsAndLockIn(params: {
  symbol: string;
  verifiedPrice: number | null;
  rawFundamentals?: RawFundamentalRecord | null;
  corporateActions?: CorporateActionRow[];
  referenceDateIso?: string;
}): EvaluatedFundamentalTelemetry {
  const validSymbol = resolveValidNepseSymbol(params.symbol, params.rawFundamentals?.symbol) || "NEPSE";
  const raw = params.rawFundamentals || {};
  const sector = String(raw.sector || "Commercial Banks");
  const fiscalQuarter = String(raw.fiscalQuarter ?? raw.fiscal_quarter ?? "Q4 2082/83");

  const epsTtm = safeNum(raw.epsTtm ?? raw.eps_ttm, 18.5);
  const distributableEps = safeNum(raw.distributableEps ?? raw.distributable_eps, epsTtm * 0.75);
  const bookValuePerShare = Math.max(1, safeNum(raw.bookValuePerShare ?? raw.book_value_per_share, 165));
  const roePct = safeNum(
    raw.roePct ?? raw.roe_pct,
    bookValuePerShare > 0 ? Number(((epsTtm / bookValuePerShare) * 100).toFixed(2)) : 0
  );

  const rawNpl = raw.nplPct ?? raw.npl_pct;
  const nplPct = rawNpl !== undefined && rawNpl !== null ? safeNum(rawNpl, 0) : null;

  const rawCar = raw.carPct ?? raw.car_pct;
  const carPct = rawCar !== undefined && rawCar !== null ? safeNum(rawCar, 11.5) : null;

  const promoterSharePct = safeNum(raw.promoterSharePct ?? raw.promoter_share_pct, 51);
  const publicSharePct = safeNum(raw.publicSharePct ?? raw.public_share_pct, 100 - promoterSharePct);
  const paidUpCapital = safeNum(raw.paidUpCapital ?? raw.paid_up_capital, 5_000_000_000);
  const paidUpCapitalCr = Number((paidUpCapital / 10_000_000).toFixed(2));

  const price = params.verifiedPrice && params.verifiedPrice > 0 ? params.verifiedPrice : null;

  const peRatio =
    price !== null && epsTtm !== 0 ? Number((price / epsTtm).toFixed(2)) : null;
  const pbvRatio =
    price !== null && bookValuePerShare > 0
      ? Number((price / bookValuePerShare).toFixed(2))
      : null;

  // Benjamin Graham Intrinsic Value Formula: sqrt(22.5 * EPS * BVPS) for positive earnings
  const grahamFairValue =
    epsTtm > 0 && bookValuePerShare > 0
      ? Number(Math.sqrt(22.5 * epsTtm * bookValuePerShare).toFixed(2))
      : bookValuePerShare;

  const valuationMarginPct =
    price !== null && grahamFairValue > 0
      ? Number((((grahamFairValue - price) / price) * 100).toFixed(1))
      : null;

  // Promoter Lock-In 60-Day SEBON Countdown Check
  const unlockDateStr = raw.promoterUnlockDate ?? raw.promoter_unlock_date ?? null;
  const lockedKitta = Math.round(safeNum(raw.promoterLockedKitta ?? raw.promoter_locked_kitta, 0));
  let daysRemaining: number | null = null;
  let isBlackoutDanger = false;
  let statusLabel = "No Active Promoter Unlock Scheduled";

  if (unlockDateStr) {
    const nowMs = params.referenceDateIso
      ? new Date(params.referenceDateIso).getTime()
      : Date.now();
    const unlockMs = new Date(unlockDateStr).getTime();
    if (!Number.isNaN(unlockMs)) {
      daysRemaining = Math.ceil((unlockMs - nowMs) / (1000 * 60 * 60 * 24));
      if (daysRemaining >= 0 && daysRemaining <= 60) {
        isBlackoutDanger = true;
        statusLabel = `CRITICAL: Promoter Unlock in ${daysRemaining} Days (${unlockDateStr})`;
      } else if (daysRemaining < 0 && daysRemaining >= -30) {
        isBlackoutDanger = true;
        statusLabel = `RECENT UNLOCK: Unlocked ${Math.abs(daysRemaining)} Days Ago (${unlockDateStr})`;
      } else if (daysRemaining > 60) {
        statusLabel = `Locked (${daysRemaining} Days Remaining until ${unlockDateStr})`;
      } else {
        statusLabel = `Lock-In Expired on ${unlockDateStr}`;
      }
    }
  }

  // Evaluate Hard Institutional & NRB Regulatory Gates
  const regulatoryGates: EvaluatedFundamentalTelemetry["regulatoryGates"] = [];

  // Gate 1: NRB NPL & CAR Prudential Directive Check (for Banks, Dev Banks, Finance, Microfinance)
  if (nplPct !== null && nplPct >= 4.8) {
    regulatoryGates.push({
      code: "NRB_REGULATORY_FAIL",
      severity: "CRITICAL_VETO",
      title: `NRB Prudential Breach (NPL ${nplPct}%)`,
      detail:
        "Non-Performing Loans exceed NRB's 5% threshold risk zone, triggering dividend distribution restrictions and elevated provisioning.",
    });
  } else if (carPct !== null && carPct < 11.0) {
    regulatoryGates.push({
      code: "NRB_REGULATORY_FAIL",
      severity: "CRITICAL_VETO",
      title: `Capital Adequacy Shortfall (CAR ${carPct}%)`,
      detail:
        "Capital Adequacy Ratio is below NRB's 11% minimum capital buffer requirement, blocking bonus/cash dividends.",
    });
  }

  // Gate 2: Negative Earnings / Distressed Net Worth Check
  if (epsTtm <= 0 || bookValuePerShare < 100) {
    regulatoryGates.push({
      code: "NEGATIVE_EARNINGS_AVOID",
      severity: "CRITICAL_VETO",
      title: `Negative Earnings / Impaired Net Worth (EPS Rs ${epsTtm})`,
      detail:
        "Company has negative TTM EPS or Net Worth below par (Rs 100). Institutional accumulation signals are overridden.",
    });
  }

  // Gate 3: 60-Day Promoter Lock-In Supply Flood Gate
  if (isBlackoutDanger) {
    regulatoryGates.push({
      code: "PROMOTER_LOCKIN_BLACKOUT",
      severity: "CRITICAL_VETO",
      title: "SEBON Promoter Lock-In Supply Flood Window",
      detail: `${statusLabel}. High probability of promoter/seed supply absorption overhead on the floorsheet.`,
    });
  }

  // Gate 4: Extreme Valuation Warning
  if (peRatio !== null && peRatio > 65) {
    regulatoryGates.push({
      code: "OVERVALUED_SPECULATIVE",
      severity: "WARN",
      title: `Elevated P/E Multiple (${peRatio}x)`,
      detail:
        "Price-to-Earnings exceeds 65x. Require strict 1.2R Ratchet trailing stops and verified low-anomaly smart money support.",
    });
  }

  if (regulatoryGates.length === 0) {
    regulatoryGates.push({
      code: "CLEAR_COMPLIANT",
      severity: "PASS",
      title: "NRB & SEBON Prudential Gates Cleared",
      detail:
        "Positive TTM earnings, compliant capital/NPL buffers, and no imminent promoter lock-in supply overhang.",
    });
  }

  const hasCriticalVeto = regulatoryGates.some((g) => g.severity === "CRITICAL_VETO");

  return {
    symbol: validSymbol,
    sector,
    fiscalQuarter,
    verifiedPrice: price,
    metrics: {
      epsTtm,
      distributableEps,
      bookValuePerShare,
      peRatio,
      pbvRatio,
      roePct,
      grahamFairValue,
      valuationMarginPct,
      nplPct,
      carPct,
      promoterSharePct,
      publicSharePct,
      paidUpCapitalCr,
    },
    promoterLockIn: {
      unlockDate: unlockDateStr,
      daysRemaining,
      lockedKitta,
      isBlackoutDanger,
      statusLabel,
    },
    regulatoryGates,
    hasCriticalVeto,
    corporateActions: params.corporateActions || [],
  };
}
