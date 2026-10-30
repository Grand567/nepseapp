const endpoints = [
  "/api/market/summary",
  "/api/market/live",
  "/api/market/top-gainers",
  "/api/market/top-losers",
  "/api/market/most-active",
  "/api/market/calendar",
  "/api/smart-money/broker-heatmap?days=5",
  "/api/smart-money/accumulation?days=10",
  "/api/smart-money/distribution?days=10",
  "/api/smart-money/cornering?days=5",
  "/api/smart-money/whale-prints?date=2026-10-29",
  "/api/smart-money/broker-dominance?symbol=NABIL&days=10",
  "/api/floorsheet/NABIL?date=2026-10-29",
  "/api/price-history/NABIL?days=36",
  "/api/company/NABIL",
  "/api/company/NABIL/financial",
  "/api/company/NABIL/dividend",
  "/api/company/NABIL/bonus",
  "/api/company/NABIL/profile",
  "/api/signals/track-record",
  "/api/signals/active",
  "/api/predictor/NABIL",
  "/api/news/merolagani",
  "/api/news/all",
  "/api/macro/ibor",
  "/api/sectors",
  "/api/brokers",
  "/api/trading-dates",
  "/api/telegram/status"
];

async function runSweep() {
  const results = [];
  console.log(`Starting sweep of ${endpoints.length} endpoints on http://localhost:5000 ...\n`);

  for (const ep of endpoints) {
    try {
      const res = await fetch(`http://localhost:5000${ep}`, { signal: AbortSignal.timeout(15000) });
      const json = await res.json().catch(() => null);
      const hasData = json && (json.data != null || json.signals != null || json.summary != null || json.matrix != null || json.rows != null);
      let status = "❌ FAIL";
      if (res.status === 200 && json && json.success !== false && hasData) {
        status = "✅ PASS";
      } else if (res.status === 200) {
        status = "⚠️ EMPTY";
      }
      results.push({ ep, status });
      console.log(`${status}\t${ep}`);
    } catch (err) {
      const status = `❌ FAIL: ${err.message.slice(0, 50)}`;
      results.push({ ep, status });
      console.log(`${status}\t${ep}`);
    }
  }

  const passCount = results.filter(r => r.status.includes('PASS')).length;
  const emptyCount = results.filter(r => r.status.includes('EMPTY')).length;
  const failCount = results.filter(r => r.status.includes('FAIL')).length;

  console.log("\n=== SUMMARY ===");
  console.log(`PASS:  ${passCount} / ${endpoints.length}`);
  console.log(`EMPTY: ${emptyCount}`);
  console.log(`FAIL:  ${failCount}`);
}

runSweep();
