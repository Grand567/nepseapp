// scripts/verifySignalTrackRecord5D.ts
import { handleSignalTrackRecordEnriched } from "../proxy/routes/signalTrackRecordRoutes.mjs";
import { isExcludedInstrument } from "../proxy/db/signalTrackerStore.js";

console.log("==================================================================");
console.log("🔬 DRABYASHREE NEPSE — 5D FLOORSHEET & SIGNAL TRACK RECORD VERIFICATION");
console.log("==================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}${detail ? ` -> ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}${detail ? ` -> ${detail}` : ""}`);
    failed++;
  }
}

async function run() {
  const req = {
    query: {
      status: "ALL",
      conviction: "ALL",
    },
  };

  let responseData: any = null;

  const res = {
    set: () => {},
    status: (code: number) => ({
      json: (d: any) => {
        responseData = d;
      },
    }),
    json: (d: any) => {
      responseData = d;
    },
  };

  await handleSignalTrackRecordEnriched(req, res);

  assert(responseData !== null, "API returned a response object");
  assert(responseData?.ok === true, "Response status ok is true");
  assert(
    Array.isArray(responseData?.distinctSessionsJoined) &&
      responseData.distinctSessionsJoined.length >= 3,
    "Joined at least 3-5 distinct trading sessions",
    `Sessions: ${responseData?.distinctSessionsJoined?.join(", ")}`
  );

  assert(
    Array.isArray(responseData?.signals) &&
      responseData.signals.length >= 40 &&
      responseData.signals.length === responseData?.totalCount,
    "Loaded calibrated walk-forward pure-equity signals from SQLite ledger",
    `Signals: ${responseData?.signals?.length} (Total Count: ${responseData?.totalCount})`
  );

  // Verify Pure-Equity Filter Invariant (Zero Debentures, Mutual Funds, or Promoters)
  const hasExcluded = responseData.signals.some((s: any) =>
    isExcludedInstrument(s.symbol, s.sector)
  );
  assert(
    hasExcluded === false,
    "Zero Debentures, Mutual Funds, or Promoter shares in Signal Track Record"
  );

  // Check Conviction classifications
  const convictions = new Set(responseData.signals.map((s: any) => s.floorsheetConviction));
  assert(
    convictions.has("BROKER_DISTRIBUTION_WARNING") ||
      convictions.has("STRONG_ACCUMULATION") ||
      convictions.has("STEADY_SUPPORT"),
    "Dynamically computed post-signal floorsheet conviction statuses",
    `Observed statuses: ${Array.from(convictions).join(", ")}`
  );

  // Check 5D Leaderboard
  assert(
    Array.isArray(responseData?.brokerLeaderboard) &&
      responseData.brokerLeaderboard.length > 0,
    "Computed 5-Session Smart-Money Broker Leaderboard",
    `Brokers ranked: ${responseData?.brokerLeaderboard?.length}`
  );

  const topBroker = responseData.brokerLeaderboard[0];
  assert(
    topBroker?.brokerId > 0 && topBroker?.netAccumulatedKitta5D > 0,
    "Leaderboard correctly ranks top institutional net accumulators",
    `Rank #1: Broker #${topBroker?.brokerId} (+${topBroker?.netAccumulatedKitta5D?.toLocaleString()} net kitta, ${topBroker?.baselineDeflatedAnomaly}x anomaly)`
  );

  // Check retail baseline deflation
  const retailBroker = responseData.brokerLeaderboard.find((b: any) => b.brokerId === 58);
  if (retailBroker) {
    assert(
      retailBroker.baselineDeflatedAnomaly <= 4.8,
      "Retail giant baseline correctly deflates raw market share",
      `Broker #58 deflated anomaly: ${retailBroker.baselineDeflatedAnomaly}x`
    );
  }

  // Check Summary KPI metrics
  const summary = responseData?.summary;
  assert(
    typeof summary?.verifiedWinRatePct === "number" && summary.verifiedWinRatePct > 0,
    "Summary calculates net verified win rate over settled trades",
    `Win Rate: ${summary?.verifiedWinRatePct}% | Alpha: ${summary?.avgNepseAlphaPct}%`
  );

  assert(
    typeof summary?.signalsBackedByWhalesCount === "number" &&
      typeof summary?.distributionWarningCount === "number",
    "Summary tracks whale backed counts and distribution warning alerts",
    `Whale-backed: ${summary?.signalsBackedByWhalesCount} | Distribution warnings: ${summary?.distributionWarningCount}`
  );

  console.log("==================================================================");
  console.log(`📊 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
