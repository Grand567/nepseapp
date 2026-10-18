// proxy/routes/radarRoutes.js
import express from "express";
import { 
  HOT_CACHE, 
  rebuildHotCache, 
  ingestDailyFloorsheetTransaction, 
  getStoredDates, 
  hasTradeDate,
  getBackfillStatus,
  backfillRealHistoricalFloorsheets,
  exportLedgerSnapshotGz
} from "../db/ledgerStore.js";

const router = express.Router();

/**
 * GET /api/radar?days=5
 * Returns all stocks' phase classifications & radar counts for 1D, 5D, 15D, or 30D in < 1ms
 */
router.get("/radar", (req, res) => {
  const requestedDays = Number(req.query.days) || 1;
  const validDays = [1, 5, 15, 30].includes(requestedDays) ? requestedDays : 1;

  // Serve directly from Tier 1 Hot RAM Cache
  const stocks = HOT_CACHE.radarByTimeframe[validDays] || [];
  const storedDates = getStoredDates(40);
  const backfill = getBackfillStatus(30);

  const counts = {
    STEALTH_ACCUMULATION: 0,
    ACTIVE_MARKUP: 0,
    DISTRIBUTION_DANGER: 0,
    BULL_TRAP: 0,
    NEUTRAL_RETAIL: 0,
  };

  for (const s of stocks) {
    if (counts[s.phase] !== undefined) {
      counts[s.phase]++;
    } else {
      counts.NEUTRAL_RETAIL++;
    }
  }

  res.set("Cache-Control", "public, max-age=60");
  return res.json({
    success: true,
    timeframeDays: validDays,
    lastUpdatedDate: HOT_CACHE.lastUpdatedDate,
    loadedTradingDays: storedDates.length,
    storedDates,
    isBackfilling: backfill.isBackfilling,
    targetTradingDays: backfill.targetTradingDays,
    counts,
    totalStocks: stocks.length,
    stocks,
  });
});

/**
 * GET /api/diagnostics/:symbol?days=15
 * Returns full Deep Diagnostic + Top 5 Net Buyers/Sellers + Safe Buy Zone metrics for a single stock
 */
router.get("/diagnostics/:symbol", (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase().trim();
  const requestedDays = Number(req.query.days) || 1;
  const validDays = [1, 5, 15, 30].includes(requestedDays) ? requestedDays : 1;

  const data = HOT_CACHE.stockDiagnostics.get(`${symbol}_${validDays}`);
  const storedDates = getStoredDates(40);
  const backfill = getBackfillStatus(30);

  if (!data) {
    return res.status(404).json({
      success: false,
      message: `No diagnostic data found for ${symbol} (${validDays}D window)`,
      loadedTradingDays: storedDates.length,
      isBackfilling: backfill.isBackfilling,
    });
  }

  res.set("Cache-Control", "public, max-age=60");
  return res.json({
    success: true,
    loadedTradingDays: storedDates.length,
    isBackfilling: backfill.isBackfilling,
    targetTradingDays: backfill.targetTradingDays,
    data,
  });
});

/**
 * GET /api/admin/backfill-status and GET /api/radar/backfill-status
 * Returns how many real trading days are stored in SQLite and backfill pipeline progress
 */
const handleBackfillStatus = (req, res) => {
  const targetDays = Number(req.query.targetTradingDays || req.query.days || 30);
  const status = getBackfillStatus(targetDays);
  return res.json(status);
};

router.get("/admin/backfill-status", handleBackfillStatus);
router.get("/radar/backfill-status", handleBackfillStatus);

/**
 * POST /api/admin/backfill-trigger and POST /api/radar/backfill
 * Triggers asynchronous background backfill of 100% real historical NEPSE floorsheets
 */
const handleBackfillTrigger = (req, res) => {
  const targetDays = Number(req.body?.targetTradingDays || req.query.days || 30);
  // Start backfill asynchronously in background without blocking response
  backfillRealHistoricalFloorsheets(targetDays, 1500).catch(err => {
    console.error("[Backfill Route] Background backfill error:", err);
  });

  return res.json({
    success: true,
    message: `Real historical backfill started for target ${targetDays} trading days.`,
    status: getBackfillStatus(targetDays),
  });
};

router.post("/admin/backfill-trigger", handleBackfillTrigger);
router.post("/radar/backfill", handleBackfillTrigger);

/**
 * GET /api/radar/status
 * Returns health, cache statistics, and preserved historical dates
 */
router.get("/radar/status", (req, res) => {
  const dates = getStoredDates(40);
  const backfill = getBackfillStatus(30);
  res.json({
    success: true,
    lastUpdatedDate: HOT_CACHE.lastUpdatedDate,
    storedTradingDaysCount: dates.length,
    storedDates: dates,
    isBackfilling: backfill.isBackfilling,
    targetTradingDays: backfill.targetTradingDays,
    precomputedStocksCount: (HOT_CACHE.radarByTimeframe[1] || []).length,
    cachedHorizons: [1, 5, 15, 30],
  });
});

/**
 * POST /api/radar/ingest
 * Ingests a session's raw floorsheet trades, compresses into SQLite, and rebuilds RAM cache
 */
router.post("/radar/ingest", (req, res) => {
  try {
    const { tradeDate, trades } = req.body || {};
    if (!tradeDate || !Array.isArray(trades) || trades.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload: tradeDate (string YYYY-MM-DD) and trades (array) are required.",
      });
    }

    const count = ingestDailyFloorsheetTransaction(tradeDate, trades);
    rebuildHotCache();

    return res.json({
      success: true,
      message: `Successfully ingested and compressed ${trades.length} trades for ${count} stocks on ${tradeDate}.`,
      tradeDate,
      stocksIngested: count,
      lastUpdatedDate: HOT_CACHE.lastUpdatedDate,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/radar/rebuild-cache
 * Manually forces RAM cache rebuild
 */
router.post("/radar/rebuild-cache", (req, res) => {
  try {
    const ok = rebuildHotCache();
    return res.json({
      success: ok,
      lastUpdatedDate: HOT_CACHE.lastUpdatedDate,
      stocksCount: (HOT_CACHE.radarByTimeframe[1] || []).length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/radar/export-snapshot
 * Forces export of ledger_seed_snapshot.json.gz
 */
router.post("/radar/export-snapshot", (req, res) => {
  try {
    const ok = exportLedgerSnapshotGz();
    return res.json({
      success: ok,
      message: ok ? "Successfully exported compressed snapshot gz" : "Failed to export snapshot",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
