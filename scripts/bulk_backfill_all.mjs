/**
 * bulk_backfill_all.mjs
 * Sequentially fetches and ingests floorsheet data for all 24 missing sessions
 * via the proxy API endpoint. 
 * 
 * Usage: node scripts/bulk_backfill_all.mjs
 * (proxy must be running on localhost:5000)
 */

const MISSING_DATES = [
  "2026-10-09",
  "2026-10-07",
  "2026-10-06",
  "2026-10-05",
  "2026-10-02",
  "2026-09-30",
  "2026-09-29",
  "2026-09-24",
  "2026-09-23",
  "2026-09-22",
  "2026-09-18",
  "2026-09-17",
  "2026-09-16",
  "2026-09-15",
  "2026-09-14",
  "2026-09-11",
  "2026-09-10",
  "2026-09-09",
  "2026-09-07",
  "2026-09-03",
  "2026-09-02",
  "2026-09-01",
  "2026-08-31",
  "2026-08-27",
];

const PROXY_URL = "http://localhost:5000";
const TIMEOUT_MS = 180_000; // 3 minutes per date

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function backfillDate(date) {
  console.log(`\n[${date}] Starting backfill...`);
  try {
    const res = await fetchWithTimeout(
      `${PROXY_URL}/api/floorsheet/download-daily`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, force: true }),
      },
      TIMEOUT_MS
    );

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }

    if (res.ok) {
      console.log(`[${date}] ✅ SUCCESS: ${JSON.stringify(json)}`);
      return { date, status: "ok", result: json };
    } else {
      console.log(`[${date}] ❌ FAILED (HTTP ${res.status}): ${JSON.stringify(json)}`);
      return { date, status: "failed", httpStatus: res.status, result: json };
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.log(`[${date}] ⏱️ TIMEOUT after ${TIMEOUT_MS / 1000}s`);
      return { date, status: "timeout" };
    }
    console.log(`[${date}] ❌ ERROR: ${err.message}`);
    return { date, status: "error", error: err.message };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("BULK BACKFILL: 24 missing floorsheet sessions");
  console.log("=".repeat(60));

  const results = [];
  let ok = 0, failed = 0, timeout = 0;

  for (let i = 0; i < MISSING_DATES.length; i++) {
    const date = MISSING_DATES[i];
    console.log(`\nProgress: ${i + 1}/${MISSING_DATES.length}`);
    const result = await backfillDate(date);
    results.push(result);

    if (result.status === "ok") ok++;
    else if (result.status === "timeout") timeout++;
    else failed++;

    // Small pause between requests to not hammer the exchange
    if (i < MISSING_DATES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("BACKFILL COMPLETE");
  console.log(`✅ Success: ${ok}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log(`⏱️ Timeout: ${timeout}`);
  console.log("=".repeat(60));

  console.log("\nDetailed results:");
  for (const r of results) {
    const icon = r.status === "ok" ? "✅" : r.status === "timeout" ? "⏱️" : "❌";
    const extra = r.status === "ok"
      ? ` (stored=${r.result?.storedCount ?? r.result?.contracts ?? "?"})`
      : r.status !== "timeout"
      ? ` (${r.result?.error ?? r.result?.message ?? JSON.stringify(r.result)?.slice(0, 80)})`
      : "";
    console.log(`  ${icon} ${r.date}${extra}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
