// src/services/fundamentals/nepseRegulatoryEngine.ts
import { safeNum, resolveValidNepseSymbol } from "../aiGuru/runAiQuantitativeAssessment";

export type RegulatoryGateCode =
  | "CLEAR_COMPLIANT"
  | "NRB_REGULATORY_FAIL"
  | "NEGATIVE_EARNINGS_AVOID"
  | "PROMOTER_LOCKIN_BLACKOUT"
  | "HYDRO_CAPEX_COD_VETO"
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
  hydroCapexPerMwCr?: number | null;
  hydro_capex_per_mw_cr?: number | null;
  hydroCodDelayed?: boolean | number | null;
  hydro_cod_delayed?: boolean | number | null;
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
    epsTtm: number | null;
    distributableEps: number | null;
    bookValuePerShare: number | null;
    peRatio: number | null;
    pbvRatio: number | null;
    roePct: number | null;
    grahamFairValue: number | null;
    valuationMarginPct: number | null;
    nplPct: number | null;
    carPct: number | null;
    hydroCapexPerMwCr: number | null;
    hydroCodDelayed: boolean;
    promoterSharePct: number | null;
    publicSharePct: number | null;
    paidUpCapitalCr: number | null;
  };
  promoterLockIn: {
    unlockDate: string | null;
    daysRemaining: number | null;
    lockedKitta: number;
    isBlackoutDanger: boolean; // Statutory Veto: True when 0 <= daysRemaining < 120
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
  const validSymbol =
    resolveValidNepseSymbol(params.symbol, params.rawFundamentals?.symbol) || "NEPSE";
  const raw: any = params.rawFundamentals || {};
  const sector = String(raw.sector || raw.sectorName || "Others");
  const fiscalQuarter = String(raw.fiscalQuarter ?? raw.fiscal_quarter ?? raw.quarter ?? "Q4 2082/83");

  const rawEpsVal = raw.epsTtm ?? raw.eps_ttm ?? raw.eps;
  const hasEps = rawEpsVal !== undefined && rawEpsVal !== null && rawEpsVal !== "" && Number.isFinite(Number(rawEpsVal));
  const epsTtm = hasEps ? Number(rawEpsVal) : null;

  const rawBvpsVal = raw.bookValuePerShare ?? raw.book_value_per_share ?? raw.bookValue ?? raw.bvps;
  const hasBvps = rawBvpsVal !== undefined && rawBvpsVal !== null && rawBvpsVal !== "" && Number.isFinite(Number(rawBvpsVal));
  const bookValuePerShare = hasBvps ? Number(rawBvpsVal) : null;

  const distributableEps = epsTtm !== null ? safeNum(raw.distributableEps ?? raw.distributable_eps, epsTtm * 0.75) : null;
  const roePct = (epsTtm !== null && bookValuePerShare !== null && bookValuePerShare > 0)
    ? safeNum(raw.roePct ?? raw.roe_pct, Number(((epsTtm / bookValuePerShare) * 100).toFixed(2)))
    : null;

  const rawNpl = raw.nplPct ?? raw.npl_pct;
  const nplPct = rawNpl !== undefined && rawNpl !== null && rawNpl !== "" && Number.isFinite(Number(rawNpl)) ? Number(rawNpl) : null;

  const rawCar = raw.carPct ?? raw.car_pct;
  const carPct = rawCar !== undefined && rawCar !== null && rawCar !== "" && Number.isFinite(Number(rawCar)) ? Number(rawCar) : null;

  const rawCapex = raw.hydroCapexPerMwCr ?? raw.hydro_capex_per_mw_cr;
  const hydroCapexPerMwCr = rawCapex !== undefined && rawCapex !== null && rawCapex !== "" && Number.isFinite(Number(rawCapex)) ? Number(rawCapex) : null;
  const hydroCodDelayed = Boolean(raw.hydroCodDelayed ?? raw.hydro_cod_delayed ?? false);

  const rawPromoter = raw.promoterSharePct ?? raw.promoter_share_pct ?? raw.promoterPercentage ?? raw.promoterPct;
  const promoterSharePct = rawPromoter !== undefined && rawPromoter !== null && rawPromoter !== "" && Number.isFinite(Number(rawPromoter))
    ? Number(rawPromoter)
    : null;

  const rawPublic = raw.publicSharePct ?? raw.public_share_pct ?? raw.publicPercentage ?? raw.publicPct;
  const publicSharePct = rawPublic !== undefined && rawPublic !== null && rawPublic !== "" && Number.isFinite(Number(rawPublic))
    ? Number(rawPublic)
    : (promoterSharePct !== null ? 100 - promoterSharePct : null);

  const rawPaidUp = raw.paidUpCapital ?? raw.paid_up_capital;
  const paidUpCapital = rawPaidUp !== undefined && rawPaidUp !== null && rawPaidUp !== "" && Number.isFinite(Number(rawPaidUp))
    ? Number(rawPaidUp)
    : null;
  const paidUpCapitalCr = paidUpCapital !== null ? Number((paidUpCapital / 10_000_000).toFixed(2)) : null;

  const price =
    params.verifiedPrice && params.verifiedPrice > 0 ? params.verifiedPrice : null;

  const peRatio =
    price !== null && epsTtm !== null && epsTtm !== 0 ? Number((price / epsTtm).toFixed(2)) : null;
  const pbvRatio =
    price !== null && bookValuePerShare !== null && bookValuePerShare > 0
      ? Number((price / bookValuePerShare).toFixed(2))
      : null;

  const grahamFairValue =
    epsTtm !== null && bookValuePerShare !== null && epsTtm > 0 && bookValuePerShare > 0
      ? Number(Math.sqrt(22.5 * epsTtm * bookValuePerShare).toFixed(2))
      : null;

  const valuationMarginPct =
    price !== null && grahamFairValue !== null && grahamFairValue > 0
      ? Number((((grahamFairValue - price) / price) * 100).toFixed(1))
      : null;

  // Statutory 120-Day SEBON Promoter Lock-In Cliff Check
  const unlockDateStr = raw.promoterUnlockDate ?? raw.promoter_unlock_date ?? null;
  const lockedKitta = Math.round(
    safeNum(raw.promoterLockedKitta ?? raw.promoter_locked_kitta, 0)
  );
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
      if (daysRemaining >= 0 && daysRemaining < 120) {
        isBlackoutDanger = true;
        statusLabel = `CRITICAL VETO: Promoter Unlock in ${daysRemaining} Days (${unlockDateStr} < 120D Cliff)`;
      } else if (daysRemaining < 0 && daysRemaining >= -30) {
        isBlackoutDanger = true;
        statusLabel = `RECENT UNLOCK VETO: Unlocked ${Math.abs(daysRemaining)} Days Ago (${unlockDateStr})`;
      } else if (daysRemaining >= 120) {
        statusLabel = `Locked Safe (${daysRemaining} Days Remaining until ${unlockDateStr})`;
      } else {
        statusLabel = `Lock-In Expired on ${unlockDateStr}`;
      }
    }
  }

  const regulatoryGates: EvaluatedFundamentalTelemetry["regulatoryGates"] = [];

  // Gate 1: NRB NPL (>= 5.0%) & CAR (< 11.0%) Prudential Directive Check (Scoped strictly to BFI sectors)
  const isBfiSector = /bank|finance|microfinance/i.test(sector);
  if (isBfiSector) {
    if (nplPct !== null && nplPct >= 5.0) {
      regulatoryGates.push({
        code: "NRB_REGULATORY_FAIL",
        severity: "CRITICAL_VETO",
        title: `NRB Prudential Veto: NPL ${nplPct.toFixed(2)}% (>= 5.0% Ceiling)`,
        detail:
          "Non-Performing Loans breach NRB's 5.0% statutory ceiling, triggering dividend distribution restrictions and loan-loss provisioning.",
      });
    }
    if (carPct !== null && carPct < 11.0) {
      regulatoryGates.push({
        code: "NRB_REGULATORY_FAIL",
        severity: "CRITICAL_VETO",
        title: `Capital Adequacy Veto: CAR ${carPct.toFixed(2)}% (< 11.0% Floor)`,
        detail:
          "Capital Adequacy Ratio is below NRB's 11.0% minimum capital buffer requirement, blocking bonus and cash dividends.",
      });
    }
  }

  // Gate 2: Hydropower Capex (> Rs. 20 Cr/MW) & Delayed COD Veto
  if (
    sector.toUpperCase().includes("HYDRO") &&
    ((hydroCapexPerMwCr !== null && hydroCapexPerMwCr > 20.0) || hydroCodDelayed)
  ) {
    regulatoryGates.push({
      code: "HYDRO_CAPEX_COD_VETO",
      severity: "CRITICAL_VETO",
      title: `Hydropower Project Veto (${
        hydroCapexPerMwCr !== null && hydroCapexPerMwCr > 20.0
          ? `Capex Rs ${hydroCapexPerMwCr} Cr/MW > Rs 20 Cr/MW`
          : "Delayed COD"
      })`,
      detail:
        "Project cost exceeds Rs. 20 Cr/MW or Commercial Operation Date (COD) is delayed, severely impairing debt-service coverage and distributable equity cash flow.",
    });
  }

  // Gate 3: Negative Earnings / Impaired Net Worth Check (Only when fundamentals are provided)
  if (epsTtm !== null && bookValuePerShare !== null) {
    if (epsTtm <= 0 || bookValuePerShare < 100) {
      regulatoryGates.push({
        code: "NEGATIVE_EARNINGS_AVOID",
        severity: "CRITICAL_VETO",
        title: `Negative Earnings / Impaired Net Worth (EPS Rs ${epsTtm})`,
        detail:
          "Company has negative TTM EPS or Net Worth below par (Rs 100). Institutional accumulation signals are overridden.",
      });
    }
  } else if (epsTtm !== null && epsTtm <= 0) {
    regulatoryGates.push({
      code: "NEGATIVE_EARNINGS_AVOID",
      severity: "CRITICAL_VETO",
      title: `Negative Earnings (EPS Rs ${epsTtm})`,
      detail:
        "Company has negative TTM EPS. Institutional accumulation signals are overridden.",
    });
  } else if (bookValuePerShare !== null && bookValuePerShare < 100) {
    regulatoryGates.push({
      code: "NEGATIVE_EARNINGS_AVOID",
      severity: "CRITICAL_VETO",
      title: `Impaired Net Worth (BVPS Rs ${bookValuePerShare} < Rs 100)`,
      detail:
        "Net Worth is below par value (Rs 100). Institutional accumulation signals are overridden.",
    });
  }

  // Gate 4: < 120-Day Promoter Lock-In Supply Flood Gate
  if (isBlackoutDanger) {
    regulatoryGates.push({
      code: "PROMOTER_LOCKIN_BLACKOUT",
      severity: "CRITICAL_VETO",
      title: "SEBON <120-Day Promoter Lock-In Supply Cliff Veto",
      detail: `${statusLabel}. High probability of promoter/project-affected supply flooding the floorsheet.`,
    });
  }

  // Gate 5: Extreme Valuation Warning
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
      title: "NRB, SEBON & Sector Prudential Gates Cleared",
      detail:
        "Positive TTM earnings, compliant NPL (<5%)/CAR (>=11%)/Hydro Capex (<=Rs 20 Cr/MW), and >=120 days clear of any promoter lock-in expiry.",
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
      hydroCapexPerMwCr,
      hydroCodDelayed,
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
