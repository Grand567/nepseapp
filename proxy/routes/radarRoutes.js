// proxy/routes/radarRoutes.js
import express from "express";
import fs from "fs";
import path from "path";
import { 
  HOT_CACHE, 
  rebuildHotCache, 
  ingestDailyFloorsheetTransaction, 
  getStoredDates, 
  hasTradeDate,
  getBackfillStatus,
  backfillRealHistoricalFloorsheets,
  exportLedgerSnapshotGz,
  seedFromDiskVault,
  seedFromSnapshotGz,
  getSymbolHistoryFromDb,
  getLedgerStatusInfo
} from "../db/ledgerStore.js";
import { calculateMultiDayDiagnostics } from "../utils/microstructureEngine.js";

const router = express.Router();

let stockMap = {};
try {
  const candidatePaths = [
    path.join(process.cwd(), "src", "utils", "stockmap.json"),
    path.join(process.cwd(), "proxy", "utils", "stockmap.json"),
    path.join(process.cwd(), "proxy", "data", "stockmap.json")
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      stockMap = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
} catch (_) {}

// Helper to snap any requested days to the closest precomputed HOT_CACHE bucket [1, 5, 15, 30]
export function resolveValidTimeframe(rawDays, defaultDays = 30) {
  const num = Number(rawDays);
  if (!Number.isFinite(num) || num <= 0) return defaultDays;
  const buckets = [1, 5, 15, 30];
  if (buckets.includes(num)) return num;
  return buckets.reduce((prev, curr) =>
    Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev
  );
}

// ── Self-healing cache initialization guard ──
let cacheInitPromise = null;
export async function ensureHotCacheReady() {
  const stocks30 = HOT_CACHE.radarByTimeframe[30] || [];
  if (stocks30.length > 0) return true;

  if (cacheInitPromise) {
    return cacheInitPromise;
  }

  cacheInitPromise = (async () => {
    try {
      console.log("[RadarRoutes] HOT_CACHE is empty on request. Initializing disk vault / snapshot seed...");
      seedFromDiskVault();
      rebuildHotCache();
      const loaded = (HOT_CACHE.radarByTimeframe[30] || []).length;
      console.log(`[RadarRoutes] HOT_CACHE initialization completed. Loaded ${loaded} stocks in 30D window.`);
      return loaded > 0;
    } catch (err) {
      console.error("[RadarRoutes] Failed to ensure HOT_CACHE:", err);
      return false;
    } finally {
      cacheInitPromise = null;
    }
  })();

  return cacheInitPromise;
}

/**
 * GET /api/radar?days=30
 * Returns all stocks' phase classifications & radar counts for 1D, 5D, 15D, or 30D in < 1ms
 */
router.get("/radar", async (req, res) => {
  await ensureHotCacheReady();
  const validDays = resolveValidTimeframe(req.query.days, 30);

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
 * GET /api/radar/broker-tracker
 * Multi-criteria Smart Money Slow Accumulation & Dumping Tracker
 * Query Params:
 *  - days: 1, 5, 15, 30 (default: 30)
 *  - mode: ACCUMULATING | DUMPING | ALL (default: ACCUMULATING)
 *  - brokerId: ALL or broker ID (e.g. 58, 45, 34)
 *  - sector: ALL or sector name
 *  - sortBy: netInflow | remainingQty | priceAsc | priceDesc | bcr5 | streakDays | profitMargin
 *  - syndicateOnly: boolean ('true' / 'false')
 *  - limit: 10, 25, 50, ALL (default: 10)
 */
router.get("/radar/broker-tracker", async (req, res) => {
  await ensureHotCacheReady();
  const rawDays = Number(req.query.days) || 30;
  const validDays = resolveValidTimeframe(rawDays, 30);
  const mode = String(req.query.mode || "ACCUMULATING").toUpperCase();
  const brokerIdFilter = String(req.query.brokerId || "ALL").trim().toUpperCase();
  const sectorFilter = String(req.query.sector || "ALL").trim();
  const sortBy = String(req.query.sortBy || "netInflow").trim();
  const syndicateOnly = String(req.query.syndicateOnly || "false").toLowerCase() === "true";
  const limit = req.query.limit === "ALL" ? 500 : Math.max(1, Number(req.query.limit) || 10);

  const universe = HOT_CACHE.radarByTimeframe[validDays] || [];
  const results = [];

  for (const stock of universe) {
    const diag = HOT_CACHE.stockDiagnostics.get(`${stock.symbol}_${validDays}`) || stock;
    const smInfo = stockMap[stock.symbol] || {};
    const stockSector = smInfo.sector || stock.sector || diag.sector || "Others";
    const companyName = smInfo.name || stock.name || diag.companyName || stock.symbol;

    if (sectorFilter !== "ALL" && stockSector.toLowerCase() !== sectorFilter.toLowerCase()) {
      continue;
    }

    if (syndicateOnly && !diag.isSyndicateCoAccumulation) {
      continue;
    }

    // Case A: User selected a specific Broker (e.g., Broker #58)
    // Case B: Market-wide Top Institutional Broker per stock (brokerId === "ALL")
    let targetBroker = null;
    if (brokerIdFilter !== "ALL") {
      const brokersList = diag.allBrokers || [...(diag.topBuyers || []), ...(diag.topSellers || [])];
      targetBroker = brokersList.find((b) => String(b.brokerId) === brokerIdFilter) || null;
      if (!targetBroker) continue;
    } else {
      targetBroker = mode === "DUMPING"
        ? (diag.leadDistributor || diag.topDistributors?.[0] || diag.topSellers?.[0] || null)
        : (diag.leadAccumulator || diag.topAccumulators?.[0] || diag.topBuyers?.[0] || null);
    }

    if (!targetBroker) continue;

    const remainingQty = Number(targetBroker.remainingQty ?? targetBroker.netVol ?? (targetBroker.buyVol - targetBroker.sellVol) ?? 0);
    const buyAmt = Number(targetBroker.buyAmt || 0);
    const sellAmt = Number(targetBroker.sellAmt || 0);
    const netInflowAmt = Number(targetBroker.netAmt ?? (buyAmt - sellAmt));

    const isAccumulating = remainingQty > 0;
    const isDumping = remainingQty < 0;

    if (mode === "ACCUMULATING" && !isAccumulating) continue;
    if (mode === "DUMPING" && !isDumping) continue;

    const latestPrice = Number(diag.latestClose || stock.latestClose || 0);
    const avgBuyPrice = Number(targetBroker.avgBuyPrice || 0);
    const unrealizedProfitPct = targetBroker.unrealizedProfitPct !== undefined
      ? targetBroker.unrealizedProfitPct
      : (avgBuyPrice > 0 ? Number((((latestPrice - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2)) : 0);

    results.push({
      symbol: stock.symbol,
      companyName,
      sector: stockSector,
      timeframeDays: validDays,
      ltp: latestPrice,
      priceChangePct: Number(diag.priceChangePct || 0),
      marketVWAP: Number(diag.marketVWAP || 0),
      bigBrokerVWAP: Number(diag.bigBrokerVWAP || 0),
      buyZoneMin: Number(diag.buyZoneMin || 0),
      buyZoneMax: Number(diag.buyZoneMax || 0),
      phase: diag.phase,
      phaseLabel: diag.phaseLabel,
      bcr5NetPct: Number(diag.bcr5NetPct || 0),
      scr3NetPct: Number(diag.scr3NetPct || 0),
      // Target Broker Metrics
      brokerId: targetBroker.brokerId,
      brokerName: targetBroker.brokerName || `Broker #${targetBroker.brokerId}`,
      buyQty: Number(targetBroker.buyVol || 0),
      sellQty: Number(targetBroker.sellVol || 0),
      remainingQty, // Buy Qty - Sell Qty
      buyAmount: buyAmt,
      sellAmount: sellAmt,
      netInflowAmount: netInflowAmt, // Total Net Inflow/Outflow Amount
      totalTradedAmount: buyAmt + sellAmt,
      avgBuyPrice,
      avgSellPrice: Number(targetBroker.avgSellPrice || 0),
      retentionPct: Number(targetBroker.retentionPct || 0),
      statusIndication: targetBroker.brokerActionLabel || (isAccumulating ? "Slowly Accumulating" : "Slowly Dumping"),
      actionStartDate: targetBroker.startDate || null,
      streakDays: Number(targetBroker.streakDays || 0),
      consistencyPct: Number(targetBroker.consistencyPct || 0),
      unrealizedProfitPct,
      isSyndicateCoAccumulation: Boolean(diag.isSyndicateCoAccumulation),
      syndicateBrokers: diag.syndicateBrokers || [],
      dailySeries: Array.isArray(targetBroker.dailySeries) ? targetBroker.dailySeries : []
    });
  }

  // ── Operator Capital Rotation & Pair-Trade Detector ──
  // Matches each heavyweight broker's #1 Dumped Stock with its #1 Accumulated Stock
  const brokerFlowMap = new Map();
  for (const s of universe) {
    const sDiag = HOT_CACHE.stockDiagnostics.get(`${s.symbol}_${validDays}`);
    if (!sDiag) continue;
    const smMeta = stockMap[s.symbol] || {};
    const symCompany = smMeta.name || s.name || sDiag.companyName || s.symbol;

    for (const b of (sDiag.topAccumulators || [])) {
      if (!b.brokerId || b.netAmt <= 0) continue;
      const bId = String(b.brokerId);
      let entry = brokerFlowMap.get(bId);
      if (!entry) {
        entry = { brokerId: bId, brokerName: b.brokerName || `Broker #${bId}`, buys: [], sells: [] };
        brokerFlowMap.set(bId, entry);
      }
      entry.buys.push({
        symbol: s.symbol,
        companyName: symCompany,
        netAmt: b.netAmt,
        remainingQty: b.remainingQty,
        avgBuyPrice: b.avgBuyPrice,
        ltp: Number(sDiag.latestClose || s.latestClose || 0)
      });
    }

    for (const d of (sDiag.topDistributors || [])) {
      if (!d.brokerId || d.netAmt >= 0) continue;
      const bId = String(d.brokerId);
      let entry = brokerFlowMap.get(bId);
      if (!entry) {
        entry = { brokerId: bId, brokerName: d.brokerName || `Broker #${bId}`, buys: [], sells: [] };
        brokerFlowMap.set(bId, entry);
      }
      entry.sells.push({
        symbol: s.symbol,
        companyName: symCompany,
        netAmt: d.netAmt,
        remainingQty: d.remainingQty,
        avgSellPrice: d.avgSellPrice,
        ltp: Number(sDiag.latestClose || s.latestClose || 0)
      });
    }
  }

  // Dynamic threshold scaled by timeframe window
  const minThreshold = validDays >= 30 ? 2.5e7 : validDays >= 15 ? 1.2e7 : validDays >= 5 ? 6e6 : 1.5e6;
  const capitalRotations = [];

  for (const [bId, flow] of brokerFlowMap.entries()) {
    if (brokerIdFilter !== "ALL" && bId !== brokerIdFilter) continue;
    flow.buys.sort((a, b) => b.netAmt - a.netAmt);
    flow.sells.sort((a, b) => a.netAmt - b.netAmt); // Most negative outflow first

    const topBuy = flow.buys[0];
    const topSell = flow.sells[0];

    if (topBuy && topSell && topBuy.netAmt >= minThreshold && topSell.netAmt <= -minThreshold) {
      const shiftedAmount = Math.min(topBuy.netAmt, Math.abs(topSell.netAmt));
      capitalRotations.push({
        brokerId: bId,
        brokerName: flow.brokerName,
        dumpedSymbol: topSell.symbol,
        dumpedCompanyName: topSell.companyName,
        dumpedNetAmt: topSell.netAmt,
        dumpedQty: topSell.remainingQty,
        accumulatedSymbol: topBuy.symbol,
        accumulatedCompanyName: topBuy.companyName,
        accumulatedNetAmt: topBuy.netAmt,
        accumulatedQty: topBuy.remainingQty,
        shiftedAmount,
        shiftedAmountCr: Number((shiftedAmount / 1e7).toFixed(2)),
        rotationMatchPct: Number(((shiftedAmount / Math.max(topBuy.netAmt, Math.abs(topSell.netAmt))) * 100).toFixed(1))
      });
    }
  }

  capitalRotations.sort((a, b) => b.shiftedAmount - a.shiftedAmount);

  // Dynamic Multi-Criteria Sorting
  results.sort((a, b) => {
    if (sortBy === "priceAsc") return a.ltp - b.ltp;
    if (sortBy === "priceDesc") return b.ltp - a.ltp;
    if (sortBy === "remainingQty") {
      return mode === "DUMPING" ? a.remainingQty - b.remainingQty : b.remainingQty - a.remainingQty;
    }
    if (sortBy === "bcr5") {
      return mode === "DUMPING" ? b.scr3NetPct - a.scr3NetPct : b.bcr5NetPct - a.bcr5NetPct;
    }
    if (sortBy === "streakDays") {
      return b.streakDays - a.streakDays;
    }
    if (sortBy === "profitMargin") {
      return b.unrealizedProfitPct - a.unrealizedProfitPct;
    }
    // Default: sortBy === "netInflow"
    return mode === "DUMPING"
      ? a.netInflowAmount - b.netInflowAmount // Most negative outflow first
      : b.netInflowAmount - a.netInflowAmount; // Highest positive net inflow first
  });

  const allSectors = Array.from(new Set(universe.map((s) => stockMap[s.symbol]?.sector || s.sector || "Others"))).filter(Boolean).sort();

  res.set("Cache-Control", "public, max-age=30");
  return res.json({
    success: true,
    timeframeDays: validDays,
    mode,
    brokerId: brokerIdFilter,
    sector: sectorFilter,
    sortBy,
    totalMatched: results.length,
    sectors: allSectors,
    capitalRotations: capitalRotations.slice(0, 12),
    topStocks: results.slice(0, limit),
  });
});

/**
 * GET /api/diagnostics/:symbol?days=30
 * Returns full Deep Diagnostic + Top 5 Net Buyers/Sellers + Safe Buy Zone metrics for a single stock
 */
router.get("/diagnostics/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").toUpperCase().trim();
  const validDays = resolveValidTimeframe(req.query.days, 30);

  await ensureHotCacheReady();

  let data = HOT_CACHE.stockDiagnostics.get(`${symbol}_${validDays}`);
  const storedDates = getStoredDates(40);
  const backfill = getBackfillStatus(30);

  // Dynamic on-demand SQLite fallback if symbol was missed in precomputed HOT_CACHE
  if (!data) {
    try {
      const history = getSymbolHistoryFromDb(symbol, validDays);
      if (history && history.length > 0) {
        data = calculateMultiDayDiagnostics(symbol, history, validDays);
        if (data) {
          HOT_CACHE.stockDiagnostics.set(`${symbol}_${validDays}`, data);
        }
      }
    } catch (e) {
      console.warn(`[RadarRoutes] On-demand fallback calculation failed for ${symbol}:`, e.message);
    }
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: `No diagnostic data found for ${symbol} (${validDays}D window)`,
      loadedTradingDays: storedDates.length,
      isBackfilling: backfill.isBackfilling,
    });
  }

  // Pre-load all standard timeframes (or calculate on-demand if missing)
  const allTimeframes = {};
  for (const d of [1, 5, 15, 30]) {
    let tData = HOT_CACHE.stockDiagnostics.get(`${symbol}_${d}`);
    if (!tData) {
      try {
        const hist = getSymbolHistoryFromDb(symbol, d);
        if (hist && hist.length > 0) {
          tData = calculateMultiDayDiagnostics(symbol, hist, d);
          if (tData) {
            HOT_CACHE.stockDiagnostics.set(`${symbol}_${d}`, tData);
          }
        }
      } catch (_) {}
    }
    allTimeframes[d] = tData || (d === validDays ? data : null);
  }

  res.set("Cache-Control", "public, max-age=60");
  return res.json({
    success: true,
    timeframeDays: validDays,
    loadedTradingDays: storedDates.length,
    isBackfilling: backfill.isBackfilling,
    targetTradingDays: backfill.targetTradingDays,
    allTimeframes,
    data,
  });
});

/**
 * GET /api/health/ledger-status & /api/radar/ledger-status
 * Health check reporting exact SQLite DB status, row counts, and snapshot availability
 */
router.get(["/health/ledger-status", "/radar/ledger-status"], (req, res) => {
  try {
    const status = getLedgerStatusInfo();
    return res.json({
      success: true,
      ...status,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
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
 * POST / GET /api/radar/rebuild-cache & /api/admin/rebuild-cache
 * Manually forces RAM cache rebuild, optional forceSnapshot=true
 */
const handleRebuildCache = (req, res) => {
  try {
    const forceSnapshot = req.query.forceSnapshot === "true" || req.body?.forceSnapshot === true;
    if (forceSnapshot) {
      seedFromSnapshotGz(true);
    }
    const ok = rebuildHotCache();
    const status = getLedgerStatusInfo();
    return res.json({
      success: ok,
      lastUpdatedDate: HOT_CACHE.lastUpdatedDate,
      stocksCount: (HOT_CACHE.radarByTimeframe[1] || []).length,
      status,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

router.post(["/radar/rebuild-cache", "/admin/rebuild-cache"], handleRebuildCache);
router.get(["/radar/rebuild-cache", "/admin/rebuild-cache"], handleRebuildCache);

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
