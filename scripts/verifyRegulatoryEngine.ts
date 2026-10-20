// scripts/verifyRegulatoryEngine.ts
import {
  evaluateNepseFundamentalsAndLockIn,
  type RawFundamentalRecord,
  type CorporateActionRow,
} from "../src/services/fundamentals/nepseRegulatoryEngine";

let passCount = 0;
let failCount = 0;

function assert(desc: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${desc}${detail ? ` -> ${detail}` : ""}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${desc}${detail ? ` -> ${detail}` : ""}`);
    failCount++;
  }
}

console.log("==================================================================");
console.log("🔬 DRABYASHREE NEPSE — REGULATORY & FUNDAMENTAL ENGINE VERIFICATION");
console.log("==================================================================");

// Suite 1: Clean Compliant Institution
const cleanBank = evaluateNepseFundamentalsAndLockIn({
  symbol: "NABIL",
  verifiedPrice: 600,
  rawFundamentals: {
    sector: "Commercial Banks",
    fiscalQuarter: "Q4 2081/82",
    epsTtm: 26.85,
    bookValuePerShare: 215.4,
    nplPct: 3.25,
    carPct: 12.8,
    promoterSharePct: 59.0,
    paidUpCapital: 27056997000,
    promoterUnlockDate: null,
  },
  corporateActions: [
    {
      fiscalYear: "2079/80",
      bonusSharePct: 0,
      cashDividendPct: 11,
      totalDividendPct: 11,
      rightShareRatio: null,
      bookCloseDate: "2080-09-15",
      status: "APPROVED",
    },
  ],
});

assert(
  "Clean institution passes all gates with CLEAR_COMPLIANT",
  cleanBank.hasCriticalVeto === false && cleanBank.regulatoryGates[0].code === "CLEAR_COMPLIANT",
  `Code: ${cleanBank.regulatoryGates[0].code} | Critical: ${cleanBank.hasCriticalVeto}`
);

// Graham Number formula: sqrt(22.5 * 26.85 * 215.4) = sqrt(130131.645) = ~360.74
const expectedGraham = Number(Math.sqrt(22.5 * 26.85 * 215.4).toFixed(2));
assert(
  "Graham Intrinsic Value matches formula sqrt(22.5 * EPS * BVPS)",
  Math.abs(cleanBank.metrics.grahamFairValue - expectedGraham) < 0.05,
  `Graham: Rs ${cleanBank.metrics.grahamFairValue} vs Expected: Rs ${expectedGraham}`
);

// Suite 2: NRB NPL Breach (Non-Performing Loan >= 4.8%)
const distressedBankNpl = evaluateNepseFundamentalsAndLockIn({
  symbol: "BADB",
  verifiedPrice: 180,
  rawFundamentals: {
    sector: "Commercial Banks",
    epsTtm: 8.5,
    bookValuePerShare: 135,
    nplPct: 5.2,
    carPct: 11.8,
  },
});

assert(
  "Flags NRB_REGULATORY_FAIL on high NPL (>=4.8%) with CRITICAL_VETO",
  distressedBankNpl.hasCriticalVeto === true &&
    distressedBankNpl.regulatoryGates.some((g) => g.code === "NRB_REGULATORY_FAIL"),
  `Gates: ${distressedBankNpl.regulatoryGates.map((g) => g.code).join(", ")}`
);

// Suite 3: Capital Adequacy Shortfall (CAR < 11.0%)
const undercapitalizedBank = evaluateNepseFundamentalsAndLockIn({
  symbol: "LOWCAR",
  verifiedPrice: 220,
  rawFundamentals: {
    sector: "Development Banks",
    epsTtm: 12.0,
    bookValuePerShare: 140,
    nplPct: 3.5,
    carPct: 10.4,
  },
});

assert(
  "Flags NRB_REGULATORY_FAIL on CAR below 11% minimum floor",
  undercapitalizedBank.hasCriticalVeto === true &&
    undercapitalizedBank.regulatoryGates.some((g) => g.code === "NRB_REGULATORY_FAIL"),
  `Gates: ${undercapitalizedBank.regulatoryGates.map((g) => g.code).join(", ")}`
);

// Suite 4: Negative Earnings or Distressed Net Worth (EPS <= 0 or BVPS < 100)
const lossMakingCompany = evaluateNepseFundamentalsAndLockIn({
  symbol: "LOSSCO",
  verifiedPrice: 150,
  rawFundamentals: {
    sector: "Hydro Power",
    epsTtm: -4.5,
    bookValuePerShare: 92,
  },
});

assert(
  "Flags NEGATIVE_EARNINGS_AVOID with CRITICAL_VETO when EPS <= 0 or BVPS < 100",
  lossMakingCompany.hasCriticalVeto === true &&
    lossMakingCompany.regulatoryGates.some((g) => g.code === "NEGATIVE_EARNINGS_AVOID"),
  `Gates: ${lossMakingCompany.regulatoryGates.map((g) => g.code).join(", ")}`
);

// Suite 5: SEBON 60-Day Promoter Lock-In Supply Blackout Window
const referenceDate = "2026-10-20";
const lockInEndingSoon = evaluateNepseFundamentalsAndLockIn({
  symbol: "SHIVM",
  verifiedPrice: 510,
  referenceDateIso: referenceDate,
  rawFundamentals: {
    sector: "Manufacturing And Processing",
    epsTtm: 15.0,
    bookValuePerShare: 180,
    promoterUnlockDate: "2026-11-20", // 31 days remaining
    promoterLockedKitta: 44880000,
  },
});

assert(
  "Flags PROMOTER_LOCKIN_BLACKOUT when 0 <= daysRemaining <= 60",
  lockInEndingSoon.promoterLockIn.isBlackoutDanger === true &&
    lockInEndingSoon.regulatoryGates.some((g) => g.code === "PROMOTER_LOCKIN_BLACKOUT"),
  `Days Remaining: ${lockInEndingSoon.promoterLockIn.daysRemaining} | Label: ${lockInEndingSoon.promoterLockIn.statusLabel}`
);

// Suite 6: Overvalued Speculative Multiple (P/E > 65)
const speculativeGrowth = evaluateNepseFundamentalsAndLockIn({
  symbol: "HIGHPE",
  verifiedPrice: 1400,
  rawFundamentals: {
    sector: "Hotels And Tourism",
    epsTtm: 18.0, // PE = 1400 / 18 = 77.78x
    bookValuePerShare: 210,
    promoterUnlockDate: null,
  },
});

assert(
  "Flags OVERVALUED_SPECULATIVE with WARN when P/E > 65x",
  speculativeGrowth.regulatoryGates.some((g) => g.code === "OVERVALUED_SPECULATIVE" && g.severity === "WARN"),
  `PE: ${speculativeGrowth.metrics.peRatio}x`
);

console.log("==================================================================");
console.log(`📊 SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log("==================================================================");

if (failCount > 0) process.exit(1);
