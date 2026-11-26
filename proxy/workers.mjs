import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.mjs';
import { isNepseTradingDay, getDetailedMarketStatus, latestTradingSession } from '../src/utils/nepseCalendar.js';
import { getKathmanduTradingStatus } from './utils/kathmanduTime.mjs';
import { 
  sendTelegramPrimePickAlert, 
  sendTelegramPreMarketScan,
  sendTelegramPreOpenGate,
  sendMorningStockSelectionDigest,
  run5StepSwingSelectionAndDispatch,
  dispatchScheduledDailySelectionGuide,
  hasSelectionGuideDispatchedForDate,
  runBroker58RadarAndDispatch,
  dispatchEodStealthAccumulationOfTheDay,
  pollIncomingTelegramCommands,
  isTelegramWebhookActive,
  sendTelegramMessage,
  auditMultiSessionTrapRisk
} from './telegramNotifier.mjs';
import { sendDiscordPrimePickAlert } from './discordNotifier.mjs';
import { getOrFetchSymbolFloorsheet, getFullSessionFloorsheet, aggregateMarketFloorsheet, getBrokerName } from './brokerVault.mjs';
import { ingestDailyStockPrices, ingestFloorsheetContracts, getDailyCompletenessStatus, db } from './db/ledgerStore.js';
import nepseClient from './nepseClientManager.mjs';
import { downloadAndArchiveDailyFloorsheet, exportCumulativeBrokerLedger, syncBrokerAllTimeAndVaultFiles } from './utils/dailyFloorsheetCollector.mjs';
import { runCalendarGuardedDailyTransition } from './utils/rollingLedgerEngine.mjs';
import { compileTodayStaticAnalytics, initTodayTickStream, tickEventEmitter } from './utils/todayDataEngine.mjs';
import { compileHistoricalSubfiles } from './utils/historicalSubfilesEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let stockMap = {};
try {
  const mapPath = path.join(__dirname, 'stockmap.json');
  if (fs.existsSync(mapPath)) {
    stockMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
} catch (_) {}

// ── Render 512 MB Memory & Concurrency Guards ────────────────────────────────
const IS_RENDER_CONSTRAINED = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.ENFORCE_RENDER_MEMORY_GUARD === '1');
const MAX_LIVE_HEAP_MB = Number(process.env.MAX_LIVE_HEAP_MB || (IS_RENDER_CONSTRAINED ? 205 : 1400));
const MAX_LIVE_RSS_MB = Number(process.env.MAX_LIVE_RSS_MB || (IS_RENDER_CONSTRAINED ? 385 : 1800));
let activeHeavyWorker = null; // 'aggregateFloorsheetData' | 'smartAlertScan' | 'postMarketAnalysis' | 'morningDigest'
let isAggregatingFloorsheet = false;
let isSmartAlertScanRunning = false;
let isMorningDigestRunning = false;
const smartAlertLiveFetchTs = new Map();

function isLiveMarketHoursNpt() {
  try {
    const status = getDetailedMarketStatus();
    const nptMins = status.nptTotalMinutes;
    return Boolean((status.isTradingDay || status.isOpen) && nptMins >= 660 && nptMins <= 900);
  } catch (_) {
    return false;
  }
}

function checkRenderMemoryBudget(contextLabel = 'Worker') {
  const mem = process.memoryUsage();
  const heapMb = mem.heapUsed / (1024 * 1024);
  const rssMb = mem.rss / (1024 * 1024);
  if (heapMb > MAX_LIVE_HEAP_MB || rssMb > MAX_LIVE_RSS_MB) {
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
    const postMem = process.memoryUsage();
    const postHeapMb = postMem.heapUsed / (1024 * 1024);
    const postRssMb = postMem.rss / (1024 * 1024);
    if (postHeapMb > MAX_LIVE_HEAP_MB || postRssMb > MAX_LIVE_RSS_MB) {
      console.warn(`[MemoryGuard] ⚠️ ${contextLabel} paused to stay within ${IS_RENDER_CONSTRAINED ? 'Render 512MB' : 'local'} RAM (heap=${postHeapMb.toFixed(1)}MB/${MAX_LIVE_HEAP_MB}MB, rss=${postRssMb.toFixed(1)}MB/${MAX_LIVE_RSS_MB}MB).`);
      return { ok: false, heapMb: postHeapMb, rssMb: postRssMb };
    }
  }
  return { ok: true, heapMb, rssMb };
}

// Worker to aggregate daily floorsheet into broker accumulation table
export async function aggregateFloorsheetData(options = {}) {
  const { bypassLiveGuard = false, bypassLock = false } = options || {};
  if (!bypassLiveGuard && isLiveMarketHoursNpt()) {
    console.log('[Workers] Skipping scheduled aggregateFloorsheetData during live market hours (11:00 AM–3:00 PM NPT) until EOD settles.');
    return;
  }
  if (isAggregatingFloorsheet || (!bypassLock && activeHeavyWorker)) {
    console.log(`[Workers] Skipping aggregateFloorsheetData — concurrent heavy worker active (${activeHeavyWorker || 'aggregateFloorsheetData'}).`);
    return;
  }
  if (!checkRenderMemoryBudget('aggregateFloorsheetData').ok) {
    return;
  }

  isAggregatingFloorsheet = true;
  if (!bypassLock) activeHeavyWorker = 'aggregateFloorsheetData';
  console.log('Running background worker: aggregateFloorsheetData...');
  try {
    const sql = `
      INSERT INTO broker_daily_accumulation (
        traded_date, broker_id, security_id, 
        buy_quantity, buy_amount, 
        sell_quantity, sell_amount,
        net_quantity, net_amount
      )
      WITH buys AS (
        SELECT 
          traded_date, 
          buyer_broker AS broker_id, 
          security_id, 
          COALESCE(SUM(quantity), 0) AS buy_quantity, 
          COALESCE(SUM(amount), 0) AS buy_amount
        FROM floorsheet_transactions
        WHERE traded_date = (NOW() AT TIME ZONE 'Asia/Kathmandu')::date
        GROUP BY traded_date, buyer_broker, security_id
      ),
      sells AS (
        SELECT 
          traded_date, 
          seller_broker AS broker_id, 
          security_id, 
          COALESCE(SUM(quantity), 0) AS sell_quantity, 
          COALESCE(SUM(amount), 0) AS sell_amount
        FROM floorsheet_transactions
        WHERE traded_date = (NOW() AT TIME ZONE 'Asia/Kathmandu')::date
        GROUP BY traded_date, seller_broker, security_id
      )
      SELECT 
        COALESCE(b.traded_date, s.traded_date) AS traded_date,
        COALESCE(b.broker_id, s.broker_id) AS broker_id,
        COALESCE(b.security_id, s.security_id) AS security_id,
        COALESCE(b.buy_quantity, 0) AS buy_quantity,
        COALESCE(b.buy_amount, 0) AS buy_amount,
        COALESCE(s.sell_quantity, 0) AS sell_quantity,
        COALESCE(s.sell_amount, 0) AS sell_amount,
        (COALESCE(b.buy_quantity, 0) - COALESCE(s.sell_quantity, 0)) AS net_quantity,
        (COALESCE(b.buy_amount, 0) - COALESCE(s.sell_amount, 0)) AS net_amount
      FROM buys b
      FULL OUTER JOIN sells s 
        ON b.traded_date = s.traded_date 
       AND b.broker_id = s.broker_id 
       AND b.security_id = s.security_id
      ON CONFLICT (traded_date, broker_id, security_id) DO UPDATE SET 
        buy_quantity = EXCLUDED.buy_quantity,
        buy_amount = EXCLUDED.buy_amount,
        sell_quantity = EXCLUDED.sell_quantity,
        sell_amount = EXCLUDED.sell_amount,
        net_quantity = EXCLUDED.net_quantity,
        net_amount = EXCLUDED.net_amount;
    `;
    await query(sql);
    console.log('Aggregation complete.');
  } catch (err) {
    console.error('Error in aggregateFloorsheetData:', err);
  } finally {
    isAggregatingFloorsheet = false;
    if (!bypassLock && activeHeavyWorker === 'aggregateFloorsheetData') {
      activeHeavyWorker = null;
    }
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
  }
}

// Memory cache for verified Post-Market Prime Pick
let cachedPostMarketPrimePick = null;

export function getVerifiedPostMarketPrimePick() {
  return cachedPostMarketPrimePick;
}

export function setVerifiedPostMarketPrimePick(data) {
  cachedPostMarketPrimePick = data;
}

// Injected dependency references — set by server.mjs at startup
let _getPriceHistoryInternal = null;
let _getOrFetchBrokerAnalysis = null;
let _generateEntryExitPlan = null;
let _fetchTodayPricesInternal = null;
let _getCache = null;
let _getDividendHistoryInternal = null;
let _getMarketIndicesInternal = null;
let _db = null;
let _scrapeMeroLaganiNews = null;
let _scrapeMeroLaganiAnnouncements = null;
let _scrapeShareSansarNews = null;
let _fetchNepaliPaisaNews = null;
let _scrapeBizshalaNews = null;
let _fetchKarobarNews = null;
let _fetchClickmanduNews = null;
let _scrapeBikashNews = null;
let _scrapeArthaKendraNews = null;
let _scrapeArthaSarokarNews = null;
let _getLiveIpoListings = null;

export function initWorkerDependencies({
  getPriceHistoryInternal,
  getOrFetchBrokerAnalysis,
  generateEntryExitPlan,
  fetchTodayPricesInternal,
  getCache,
  getDividendHistoryInternal,
  getMarketIndicesInternal,
  db,
  scrapeMeroLaganiNews,
  scrapeMeroLaganiAnnouncements,
  scrapeShareSansarNews,
  fetchNepaliPaisaNews,
  scrapeBizshalaNews,
  fetchKarobarNews,
  fetchClickmanduNews,
  scrapeBikashNews,
  scrapeArthaKendraNews,
  scrapeArthaSarokarNews,
  getLiveIpoListings,
}) {
  _getPriceHistoryInternal = getPriceHistoryInternal;
  _getOrFetchBrokerAnalysis = getOrFetchBrokerAnalysis;
  _generateEntryExitPlan = generateEntryExitPlan;
  _fetchTodayPricesInternal = fetchTodayPricesInternal;
  _getCache = getCache;
  _getDividendHistoryInternal = getDividendHistoryInternal;
  _getMarketIndicesInternal = getMarketIndicesInternal;
  _db = db;
  _scrapeMeroLaganiNews = scrapeMeroLaganiNews;
  _scrapeMeroLaganiAnnouncements = scrapeMeroLaganiAnnouncements;
  _scrapeShareSansarNews = scrapeShareSansarNews;
  _fetchNepaliPaisaNews = fetchNepaliPaisaNews;
  _scrapeBizshalaNews = scrapeBizshalaNews;
  _fetchKarobarNews = fetchKarobarNews;
  _fetchClickmanduNews = fetchClickmanduNews;
  _scrapeBikashNews = scrapeBikashNews;
  _scrapeArthaKendraNews = scrapeArthaKendraNews;
  _scrapeArthaSarokarNews = scrapeArthaSarokarNews;
  _getLiveIpoListings = getLiveIpoListings;
}

/**
 * Runs a full Entry/Exit Analyzer scan across ALL 350+ NEPSE stocks after market close.
 * This is the AUTHORITATIVE source for the Day Prime Pick.
 * Result is stored in memory via setVerifiedPostMarketPrimePick() and served by /api/prime-pick/daily-verified.
 */
export async function runFullUniversePrimePick() {
  if (!_getPriceHistoryInternal || !_generateEntryExitPlan || !_fetchTodayPricesInternal) {
    console.warn('[PrimePickWorker] Dependencies not injected — skipping full-universe scan.');
    return;
  }

  console.log('[PrimePickWorker] Starting full-universe Entry/Exit Analyzer scan...');

  try {
    // Step 1: Get today's full stock list
    let stocksList = _getCache ? (_getCache('today-prices') || _getCache('market-summary')) : null;
    stocksList = Array.isArray(stocksList) ? stocksList : (stocksList?.data || stocksList?.stocks || null);
    if (!stocksList || stocksList.length === 0) {
      stocksList = await _fetchTodayPricesInternal().catch(() => []);
    }
    if (!Array.isArray(stocksList) || stocksList.length === 0) {
      console.warn('[PrimePickWorker] No stock data available — aborting.');
      return;
    }

    // Step 2: Filter by basic liquidity/price hurdles — include ALL active stocks
    const candidates = stocksList
      .filter(s => {
        const ltp = Number(s.ltp || s.price || 0);
        const turnover = Number(s.turnover || s.totalTradedValue || 0);
        return ltp >= 30 && turnover >= 300000;
      })
      .sort((a, b) => {
        const aBreakout = (a.isBreakout || (Number(a.rvol || 0) >= 1.4 && Number(a.pChange || 0) >= 0)) ? 1 : 0;
        const bBreakout = (b.isBreakout || (Number(b.rvol || 0) >= 1.4 && Number(b.pChange || 0) >= 0)) ? 1 : 0;
        if (bBreakout !== aBreakout) return bBreakout - aBreakout;
        return Number(b.turnover || 0) - Number(a.turnover || 0);
      });

    const candidatesToScan = candidates.slice(0, 45);
    console.log(`[PrimePickWorker] Scanning top ${candidatesToScan.length} liquid & breakout stocks through Entry/Exit Analyzer...`);

    // Step 3: Run generateEntryExitPlan on top liquid candidates with real history
    const qualifiedCandidates = [];
    for (let candIdx = 0; candIdx < candidatesToScan.length; candIdx++) {
      const cand = candidatesToScan[candIdx];
      const sym = String(cand.symbol || cand.scrip || '').toUpperCase().trim();
      if (!sym) continue;

      if (candIdx > 0 && candIdx % 8 === 0) {
        if (!checkRenderMemoryBudget('PrimePickWorker').ok) {
          console.warn(`[PrimePickWorker] Stopping scan early at ${candIdx}/${candidatesToScan.length} to preserve Render 512MB RAM.`);
          break;
        }
        await new Promise(r => setImmediate(r));
      }

      try {
        const history = await _getPriceHistoryInternal(sym, 365).catch(() => []);
        if (!history || history.length < 20) continue;

        const broker = _getOrFetchBrokerAnalysis ? await _getOrFetchBrokerAnalysis(sym, 30).catch(() => null) : null;
        let dividends = [];
        if (_getDividendHistoryInternal) {
          const divRes = await _getDividendHistoryInternal(sym).catch(() => []);
          dividends = Array.isArray(divRes?.dividends) ? divRes.dividends : (Array.isArray(divRes) ? divRes : []);
        } else if (Array.isArray(cand.dividends)) {
          dividends = cand.dividends;
        }
        const plan = _generateEntryExitPlan(cand, history, dividends, { brokerAnalysis: broker });
        if (!plan || !plan.supported) continue;

        const vUpper = String(plan.verdict || '').toUpperCase();
        const scoreVal = Number(plan.setupScore || 0);

        // STRICT USER DIRECTIVE: Day Prime Pick MUST be a genuine BUY or ACCUMULATE signal!
        const isDisqualified =
          vUpper.includes('NO TRADE') ||
          vUpper.includes('AVOID') ||
          vUpper.includes('REDUCE') ||
          vUpper.includes('EXIT') ||
          vUpper.includes('STAY OUT') ||
          vUpper.includes('HOLD') ||
          vUpper.includes('WAIT') ||
          Boolean(plan.riskGate?.isInstitutionalDumping) ||
          Boolean(plan.riskGate?.isCircuitTrap);

        const hasBuyKeyword =
          vUpper.includes('BUY') ||
          vUpper.includes('ACCUMULATE') ||
          vUpper.includes('STRONG') ||
          vUpper.includes('COIL');

        if (isDisqualified || !hasBuyKeyword || scoreVal < 55) {
          continue; // Disqualified — must be actionable BUY/ACCUMULATE
        }

        // ── 5-DAY MULTI-SESSION TRAP VETO GATE ──
        if (db) {
          try {
            const trapAudit = auditMultiSessionTrapRisk(db, sym);
            if (trapAudit.isTrap) {
              console.log(`[PrimePickWorker] 🚫 Hard Veto ${sym}: ${trapAudit.reason}`);
              continue; // VETO! Trap detected across multi-session ledger!
            }
          } catch (_) {}
        }

        const passesAll5 =
          !Boolean(plan.riskGate?.isCircuitTrap) &&
          !Boolean(plan.riskGate?.isLossMaking) &&
          Number(cand.eps || 0) >= 0 &&
          Boolean(plan.levels?.entryZone?.min) &&
          Number(plan.levels?.entryZone?.min) > 0;

        qualifiedCandidates.push({ cand, plan, sym, scoreVal, winRateVal: Number(plan.analogResult?.stats?.winRate ?? 50), passesAll5 });
      } catch (_) {
        // Individual stock failure — continue to next
      }
    }

    if (qualifiedCandidates.length === 0) {
      console.log('[PrimePickWorker] No qualifying stock found across full universe — all stocks have bad verdicts or dumping.');
      setVerifiedPostMarketPrimePick(null);
      return;
    }

    // Step 4: Two-Tier Selection — Tier 1: passes all 5 criteria; Tier 2: fallback to 2 rules
    const tier1 = qualifiedCandidates.filter(c => c.passesAll5);
    const candidatesToRank = tier1.length > 0 ? tier1 : qualifiedCandidates;
    candidatesToRank.sort((a, b) => b.scoreVal - a.scoreVal);
    const best = candidatesToRank[0];
    const isTier1 = tier1.length > 0;
    const { cand, plan, sym, scoreVal, winRateVal } = best;

    const candLtp = Number(cand.ltp || plan.ltp || 0);
    const eLow = Number(plan.levels?.entryZone?.min || plan.levels?.entryZone?.low || (candLtp > 0 ? +(candLtp * 0.985).toFixed(1) : 100));
    const eHigh = Number(plan.levels?.entryZone?.max || plan.levels?.entryZone?.high || (candLtp > 0 ? +(candLtp * 1.015).toFixed(1) : 100));
    const cCap = Number(plan.levels?.chaseCap || +(eHigh * 1.025).toFixed(1));
    const t1Price = Number(plan.levels?.target1?.price || (candLtp > 0 ? +(candLtp * 1.08).toFixed(1) : 110));
    const t2Price = Number(plan.levels?.target2?.price || (candLtp > 0 ? +(candLtp * 1.15).toFixed(1) : 120));
    const slPrice = Number(plan.levels?.stopLoss?.price || (candLtp > 0 ? +(candLtp * 0.94).toFixed(1) : 90));

    const meta = stockMap[sym] || {};
    const chosenRvol = Number(plan.volume?.rvol || plan.technical?.volume?.rvol || cand.rvol || cand.volumeSurgeRatio || 1.25);
    const winner = {
      ...cand,
      ...plan,
      symbol: sym,
      name: cand.name || cand.companyName || meta.name || sym,
      companyName: cand.companyName || cand.name || meta.name || sym,
      sector: (cand.sector && cand.sector !== 'Unknown' && cand.sector !== 'NEPSE') ? cand.sector : (meta.sector || 'Others'),
      ltp: candLtp,
      rvol: chosenRvol,
      volumeSurgeRatio: chosenRvol,
      pChange: Number(cand.pChange || cand.percentageChange || 0),
      turnover: Number(cand.turnover || cand.totalTradedValue || 0),
      isPlanVerified: true,
      setupScore: scoreVal,
      score: scoreVal,
      guruScore: scoreVal,
      compositeScore: scoreVal,
      winRate: winRateVal,
      levels: {
        ...plan.levels,
        entryZone: { min: eLow, max: eHigh, low: eLow, high: eHigh },
        target1: { ...(plan.levels?.target1 || {}), price: t1Price },
        target2: { ...(plan.levels?.target2 || {}), price: t2Price },
        stopLoss: { ...(plan.levels?.stopLoss || {}), price: slPrice },
        chaseCap: cCap
      },
      entryLow: eLow,
      entryHigh: eHigh,
      chaseCap: cCap,
      target1: t1Price,
      target2: t2Price,
      stopLoss: slPrice,
      verdict: plan.verdict,
      warnings: plan.warnings,
      bullishFactors: plan.bullishFactors,
      riskGate: plan.riskGate,
      catalyst: 'Post-3:15 full-universe Entry/Exit Analyzer scan — best among 350+ stocks',
      postMarketVerifiedAt: new Date().toISOString(),
      sessionDate: getDetailedMarketStatus().targetSessionDate,
      isLockedForSession: true,
      postMarketLabel: "Tomorrow's Prime Opportunity (Full 350+ Universe Scan + Entry/Exit Analyzer)",
    };

    setVerifiedPostMarketPrimePick(winner);
    console.log(`[PrimePickWorker] ✅ Winner: ${sym} | Score: ${scoreVal} | Verdict: ${plan.verdict} | ${qualifiedCandidates.length} qualified from ${candidates.length} scanned`);

    // Telegram EOD dispatch is handled exclusively by run5StepSwingSelectionAndDispatch in runPostMarketCloseAnalysis
    // to prevent duplicate competing EOD prime pick messages.

    // Dispatch 3:45 PM Daily Post-Market Setup to Discord Webhook (100% Free)
    sendDiscordPrimePickAlert(winner).catch(dErr => {
      console.warn('[PrimePickWorker] Discord prime pick dispatch notice:', dErr.message);
    });
  } catch (err) {
    console.error('[PrimePickWorker] Fatal error:', err?.message || err);
  }
}

let lastPostMarketSessionAnalyzed = null;
let isPostMarketAnalysisRunning = false;

/**
 * Synchronizes daily price records and floorsheet contracts into persistent SQLite storage.
 * Enforces Monday-to-Friday execution, contract deduplication, and completeness validation.
 */
export async function syncDailyFloorsheetAndPrices(targetDate) {
  console.log(`[DataLayerSync] Synchronizing daily prices & floorsheet for session: ${targetDate}...`);
  try {
    // 1. Persist today's closing prices to daily_stock_summary
    if (_fetchTodayPricesInternal) {
      const todayPrices = await _fetchTodayPricesInternal().catch(() => []);
      if (Array.isArray(todayPrices) && todayPrices.length > 0) {
        const savedPriceCount = ingestDailyStockPrices(targetDate, todayPrices);
        console.log(`[DataLayerSync] Persisted ${savedPriceCount} stock prices into daily_stock_summary for ${targetDate}`);
      }
    }

    // 2. Persist full session floorsheet to floorsheet_contracts & daily_broker_ledger
    const fullTrades = await getFullSessionFloorsheet(targetDate);
    const count = Array.isArray(fullTrades) ? fullTrades.length : 0;
    const completeness = getDailyCompletenessStatus(targetDate);
    console.log(`[DataLayerSync] Ingested ${count} floorsheet trades for ${targetDate}. Status: ${completeness?.status || 'INGESTED'} (${completeness?.completenessPct ?? 100}%)`);
    return { success: true, count, completeness };
  } catch (err) {
    console.warn(`[DataLayerSync] Error synchronizing data for ${targetDate}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Scheduled post-market close floorsheet reconciliation & prime pick verification worker
export async function runPostMarketCloseAnalysis(force = false) {
  const isTrading = isNepseTradingDay();
  const marketStatus = getDetailedMarketStatus();
  const now = new Date();
  const nowNpt = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
  const todayIso = nowNpt.toISOString().split('T')[0];
  // Post-market analysis synchronizes the session that closed today, NOT tomorrow's target date
  const targetDate = isTrading ? todayIso : (marketStatus.lastClosedSessionDate || marketStatus.targetSessionDate || todayIso);

  if (!isTrading && !force) {
    console.log(`[Post-Market Worker] Non-trading day (weekend or NEPSE public holiday) — skipping daily post-market ingestion.`);
    return;
  }

  if (isPostMarketAnalysisRunning || (activeHeavyWorker && activeHeavyWorker !== 'postMarketAnalysis')) {
    console.log(`[Post-Market Worker] Heavy worker (${activeHeavyWorker || 'postMarketAnalysis'}) already running — skipping concurrent trigger.`);
    return;
  }

  // STRICT USER DIRECTIVE: Day Prime Pick is selected ONCE after market close (>= 15:15 NPT)
  // after collecting all present & past data. Once picked, it MUST remain the same until tomorrow before trading.
  if (!force && lastPostMarketSessionAnalyzed === targetDate) {
    console.log(`[Post-Market Worker] Post-market analysis already completed for session: ${targetDate}`);
    return;
  }

  isPostMarketAnalysisRunning = true;
  activeHeavyWorker = 'postMarketAnalysis';
  console.log(`[Post-Market Worker] Running post-market floorsheet & prime pick analysis for target session: ${targetDate}...`);
  try {
    await syncDailyFloorsheetAndPrices(targetDate);
    // Download and archive into daily_floorsheets local folder
    await downloadAndArchiveDailyFloorsheet(targetDate).catch(e => console.warn('[Post-Market Worker] dailyFloorsheetCollector notice:', e.message));
    try {
      syncBrokerAllTimeAndVaultFiles(db);
      exportCumulativeBrokerLedger(db);
    } catch (syncErr) {
      console.warn('[Post-Market Worker] Vault & alltime sync notice:', syncErr.message);
    }
    await aggregateFloorsheetData({ bypassLiveGuard: true, bypassLock: true });

    // Exchange-wide broker matrix aggregation & dual-write to proxy and src
    try {
      const fullTrades = await getFullSessionFloorsheet(targetDate);
      if (Array.isArray(fullTrades) && fullTrades.length > 0) {
        const aggData = aggregateMarketFloorsheet(fullTrades, targetDate);
        const proxyPath = path.join(__dirname, 'data', 'broker_matrix_latest.json');
        const srcPath = path.resolve(__dirname, '..', 'src', 'data', 'broker_matrix_latest.json');
        fs.writeFileSync(proxyPath, JSON.stringify(aggData, null, 2), 'utf8');
        fs.writeFileSync(srcPath, JSON.stringify(aggData, null, 2), 'utf8');

        const histPath = path.resolve(__dirname, '..', 'src', 'data', 'broker_matrices_historical.json');
        if (fs.existsSync(histPath)) {
          try {
            const histData = JSON.parse(fs.readFileSync(histPath, 'utf8'));
            const lightMatrix = (aggData.matrix || []).map(({ scrips, ...rest }) => rest);
            histData[targetDate] = { ...aggData, matrix: lightMatrix };
            const recentDates = Object.keys(histData).sort().reverse().slice(0, 5);
            const prunedSeed = {};
            for (const rd of recentDates) prunedSeed[rd] = histData[rd];
            fs.writeFileSync(histPath, JSON.stringify(prunedSeed), 'utf8');
          } catch (hErr) {
            console.warn('[Post-Market Worker] broker_matrices_historical seed notice:', hErr.message);
          }
        }
        console.log(`[Post-Market Worker] ✅ Dual-written broker_matrix_latest.json & updated historical seed for: ${targetDate}`);
      }
    } catch (mErr) {
      console.warn('[Post-Market Worker] Broker matrix dual-write notice:', mErr.message);
    }
    // Run the full Entry/Exit Analyzer scan across ALL 350+ stocks
    await runFullUniversePrimePick();
    // Post-Market EOD (3:45 PM): Dispatch Flowchart v2.0 + Dual-Tier Sniper Dispatch (Overnight Prep)
    const swingRes = await run5StepSwingSelectionAndDispatch({ onTrackHolding: trackCustomHolding }).catch(e =>
      console.warn('[Post-Market Worker] 5-Step Swing dispatch notice:', e.message)
    );
    // Safety Gate: Only promote & broadcast Verified Prime Pick when Dual-Tier Sniper/Balanced clears (>=75-87.5% WR).
    // Low-WR Flowchart fallback picks stay Watchlist Only and never auto-broadcast as Prime Buy.
    if (swingRes && swingRes.topPick && swingRes.topPick.isPrimeBuy === true) {
      setVerifiedPostMarketPrimePick(swingRes.topPick);
      try {
        const tp = swingRes.topPick;
        broadcastAlert({
          id: `flowchart_v2_prime_${tp.symbol}_${targetDate}`,
          symbol: tp.symbol,
          type: 'INSTITUTIONAL_ENTRY',
          category: 'pro',
          tier: 'pro',
          isPro: true,
          skipTelegram: true,
          action: 'OPEN_STOCK_DETAIL',
          ltp: tp.ltp,
          title: `👑 Dual-Tier Prime Sniper: ${tp.symbol}`,
          body: `${tp.dualTierBadge || tp.rallyHorizonLabel || 'Dual-Tier Sniper'} | Buy Zone: Rs. ${tp.entryLow}–${tp.entryHigh} | SL: Rs. ${tp.stopLoss} | T1: Rs. ${tp.target1}`,
          rallyTrack: tp.rallyTrack,
          rallyHorizonLabel: tp.rallyHorizonLabel,
          isDualTierSniper: Boolean(tp.isDualTierSniper),
          isDualTierBalanced: Boolean(tp.isDualTierBalanced),
          triggeredAt: new Date().toISOString(),
        });
      } catch (_) {}
    }
    // Daily 4-Gate Stock Selection Guide EOD Notification (Selected Pick or Explicit Hold-Cash Alert)
    let liveIndexQuote = null;
    try {
      let idx = _getCache ? _getCache('market-indices') : null;
      if (!idx?.nepse && _getMarketIndicesInternal) {
        idx = await _getMarketIndicesInternal().catch(() => null);
      }
      if (idx?.nepse && Number(idx.nepse.value) > 0) {
        liveIndexQuote = {
          value: Number(idx.nepse.value),
          change: Number(idx.nepse.change || 0),
          pChange: Number(idx.nepse.pChange || 0),
          date: idx.asOfDate || targetDate
        };
      }
    } catch (_) {}
    await dispatchScheduledDailySelectionGuide({ targetDate, liveIndexQuote }).catch(e =>
      console.warn('[Post-Market Worker] Daily Stock Selection Guide dispatch notice:', e.message)
    );
    // 5-Day Rolling Ledger Roll: Roll today into 4-day immutable ledger, prune oldest, & reset File A
    await runCalendarGuardedDailyTransition({ targetDate }).catch(e =>
      console.warn('[Post-Market Worker] Calendar-Guarded transition notice:', e.message)
    );
    // Refresh Sub-File A1 Static Analytics with today's newly reconciled EOD session
    try {
      console.log(`[Post-Market Worker] 📊 Recompiling Sub-File A1 static analytics for closed session: ${targetDate}...`);
      compileTodayStaticAnalytics({ targetDate });
    } catch (e) {
      console.warn('[Post-Market Worker] Static analytics recompile notice:', e.message);
    }
    // Recompile 4 Dedicated Historical Sub-Files (Day 1..4) with today's settled close
    try {
      console.log(`[Post-Market Worker] 📚 Recompiling 4 Historical Sub-Files (Days 1–4) for closed session: ${targetDate}...`);
      const subfilesManifest = compileHistoricalSubfiles();
      // Broadcast SSE rotation event to all connected clients
      tickEventEmitter.emit('tick', {
        event_type: 'SUBFILES_ROTATED',
        timestamp: new Date().toISOString(),
        available_sessions: subfilesManifest?.available_sessions || [],
        latest_session: targetDate
      });
      console.log(`[Post-Market Worker] 🚀 Broadcast SUBFILES_ROTATED event for ${targetDate}`);
    } catch (e) {
      console.warn('[Post-Market Worker] Historical subfiles recompile notice:', e.message);
    }
    // Verify that SQLite daily_broker_ledger has valid complete EOD rows for targetDate before locking session
    const brokerLedgerVerifiedCount = db
      ? (db.prepare(`SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0`).get(targetDate)?.c || 0)
      : 0;
    const validContractVerifiedCount = db
      ? (db.prepare(`SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0 AND buyer_broker > 0 AND seller_broker > 0`).get(targetDate)?.c || 0)
      : 0;

    if (brokerLedgerVerifiedCount > 0 && validContractVerifiedCount >= 1000) {
      lastPostMarketSessionAnalyzed = targetDate;
    } else {
      console.warn(`[Post-Market Worker] Deferring session lock for ${targetDate}: broker_ledger=${brokerLedgerVerifiedCount}, validContracts=${validContractVerifiedCount} — retry enabled.`);
    }
  } catch (err) {
    console.warn('[Post-Market Worker] Error in runPostMarketCloseAnalysis:', err?.message || err);
  } finally {
    isPostMarketAnalysisRunning = false;
    if (activeHeavyWorker === 'postMarketAnalysis') activeHeavyWorker = null;
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
  }
}

let lastPreMarketDispatchedDate = null;
let lastPreOpenDispatchedDate = null;
let lastMarketOpenDispatchedDate = null;
let lastMorningDigestDispatchedDate = null;

// Phase 1: 10:15 AM Pre-Market Scan & Breadth Check
export async function runPreMarketMorningScan(force = false) {
  const marketStatus = getDetailedMarketStatus();
  const targetDate = marketStatus.targetSessionDate;
  if (!force && lastPreMarketDispatchedDate === targetDate) return;

  console.log(`[Pre-Market Worker] Running 10:15 AM Pre-Market Scan for ${targetDate}...`);
  try {
    const stockData = _getCache ? (_getCache('today-prices') || _getCache('market-summary')) : null;
    let list = Array.isArray(stockData) ? stockData : (stockData?.data || stockData?.stocks || []);
    if (list.length === 0 && _fetchTodayPricesInternal) {
      list = await _fetchTodayPricesInternal().catch(() => []);
    }

    const idxData = _getCache ? _getCache('market-indices') : null;
    let nepseVal = idxData?.data?.nepse?.value || idxData?.nepse?.value;
    let nepseChg = idxData?.data?.nepse?.change || idxData?.nepse?.change;
    if (!nepseVal && _getMarketIndicesInternal) {
      try {
        const ind = await _getMarketIndicesInternal();
        nepseVal = ind?.nepse?.value;
        nepseChg = ind?.nepse?.change;
      } catch (_) {}
    }
    if (!nepseVal) {
      console.warn('[Pre-Market Worker] Live NEPSE index value unavailable; reporting status honestly.');
    }

    const adv = list.filter(s => Number(s.pChange || 0) > 0).length;
    const dec = list.filter(s => Number(s.pChange || 0) < 0).length;
    const total = Math.max(1, adv + dec);
    const breadthPct = list.length > 0 ? Math.round((adv / total) * 100) : null;
    const isCashDefense = breadthPct !== null ? breadthPct < 38 : true;

    const candidates = [];
    if (cachedPostMarketPrimePick && cachedPostMarketPrimePick.symbol) {
      const p = cachedPostMarketPrimePick;
      candidates.push({
        symbol: p.symbol,
        sector: p.sector,
        ltp: p.ltp,
        basePrice: p.entryLow || p.ltp,
        entryLow: p.entryLow,
        entryHigh: p.entryHigh,
        chaseCap: p.chaseCap,
        stopLoss: p.stopLoss,
        target1: p.target1,
        target2: p.target2,
        score: p.setupScore ?? p.score ?? null,
        floatM: p.floatM ?? p.freeFloatM ?? null
      });
    }

    await sendTelegramPreMarketScan({
      sessionDate: targetDate,
      breadthAdv: adv,
      breadthDec: dec,
      breadthPct,
      isCashDefense,
      nepseValue: nepseVal != null ? String(nepseVal) : 'Unavailable',
      nepseChange: nepseChg != null ? String(nepseChg) : '—',
      candidates
    });

    lastPreMarketDispatchedDate = targetDate;
  } catch (err) {
    console.warn('[Pre-Market Worker] Error in runPreMarketMorningScan:', err.message);
  }
}

// Phase 2: 10:50 AM Pre-Open Order Book Gate Check
export async function runPreOpenGateScan(force = false) {
  const marketStatus = getDetailedMarketStatus();
  const targetDate = marketStatus.targetSessionDate;
  if (!force && lastPreOpenDispatchedDate === targetDate) return;

  console.log(`[Pre-Open Worker] Running 10:50 AM Pre-Open Gate Scan for ${targetDate}...`);
  try {
    if (!cachedPostMarketPrimePick || !cachedPostMarketPrimePick.symbol) {
      console.log(`[Pre-Open Worker] No qualified Prime Pick candidate for ${targetDate}. Preserving cash.`);
      return;
    }
    const sym = cachedPostMarketPrimePick.symbol;
    const basePivot = Number(cachedPostMarketPrimePick.entryLow || cachedPostMarketPrimePick.ltp || 0);
    if (!Number.isFinite(basePivot) || basePivot <= 0) {
      console.log(`[Pre-Open Worker] Prime Pick ${sym} missing valid base pivot. Skipping pre-open gate.`);
      return;
    }
    const chaseCap = +(basePivot * 1.025).toFixed(1);

    let indicativeOpen = basePivot;
    let bidVol = null;
    let askVol = null;
    let obir = 'DEPTH_UNAVAILABLE';

    // Query live indicative open price from hot cache if available
    if (_getCache) {
      try {
        const stockData = _getCache('today-prices') || _getCache('market-summary');
        const list = Array.isArray(stockData) ? stockData : (stockData?.data || stockData?.stocks || []);
        const found = list.find(s => String(s.symbol || s.scrip || '').toUpperCase().trim() === sym);
        if (found) {
          const liveOpen = Number(found.openPrice || found.open || found.ltp || 0);
          if (liveOpen > 0) indicativeOpen = liveOpen;
        }
      } catch (_) {}
    }

    const gapPct = +(((indicativeOpen - basePivot) / basePivot) * 100).toFixed(1);
    const verdict = gapPct > 2.5 ? 'ABORT' : 'CLEAR';

    await sendTelegramPreOpenGate({
      sessionDate: targetDate,
      symbol: sym,
      indicativeOpen,
      basePivot,
      chaseCap,
      gapPct,
      obir,
      bidVolume: bidVol,
      askVolume: askVol,
      verdict
    });

    lastPreOpenDispatchedDate = targetDate;
  } catch (err) {
    console.warn('[Pre-Open Worker] Error in runPreOpenGateScan:', err.message);
  }
}

// Quantitative Morning Trading Digest Scan (10:45 AM NPT)
export async function runMorningStockSelectionDigestWorker(target = false) {
  const targetDate = typeof target === 'string' && target.length >= 10
    ? target
    : latestTradingSession(undefined, true);
  const force = target === true || (typeof target === 'string' && target.length >= 10);
  if (!force && lastMorningDigestDispatchedDate === targetDate) {
    return { success: false, reason: `Morning digest already dispatched for ${targetDate}` };
  }

  console.log(`[MorningDigestWorker] Running 10:45 AM Quantitative Morning Digest Scan for ${targetDate}...`);
  try {
    const { runDailyPaperRun } = await import('../scripts/runDailyPaperRun.mjs');
    const paperResult = await runDailyPaperRun(targetDate);
    if (!paperResult || !paperResult.success) {
      console.warn(`[MorningDigestWorker] Paper selection run failed or returned no data for ${targetDate}`);
      return { success: false, reason: paperResult?.error || 'Paper selection execution failed' };
    }

    const dispatchResult = await sendMorningStockSelectionDigest(
      paperResult.buyPicks,
      paperResult.watchPicks,
      targetDate
    );

    lastMorningDigestDispatchedDate = targetDate;

    return {
      success: true,
      sessionDate: targetDate,
      buyPicksCount: paperResult.buyPicks?.length || 0,
      watchPicksCount: paperResult.watchPicks?.length || 0,
      dispatched: Boolean(dispatchResult.success),
      telegramResult: dispatchResult
    };
  } catch (err) {
    console.error('[MorningDigestWorker] Error in runMorningStockSelectionDigestWorker:', err);
    return { success: false, error: err.message };
  }
}

import { 
  runMarketAlertScanCycle, 
  trackCustomHolding, 
  untrackCustomHolding, 
  getUserTrackedHoldings,
  pollLiveNewsAndIpoAlerts,
  checkAndDispatchScheduledNonHoldingDigest,
  broadcastAlert
} from './smartAlertEngine.mjs';

let workersStarted = false;

// Start workers
export function startWorkers() {
  if (workersStarted) {
    console.log('[Workers] startWorkers already active. Skipping duplicate initialization.');
    return;
  }
  workersStarted = true;
  // Run floorsheet aggregation every 1 hour (3600000 ms), skipped automatically during live 11:00–15:00 NPT hours
  setInterval(() => {
    aggregateFloorsheetData().catch(err => {
      console.warn('[Workers] Scheduled aggregateFloorsheetData notice:', err?.message || err);
    });
  }, 60 * 60 * 1000);

  // 0. Pre-Market Scan (10:15 AM NPT), Morning Digest (10:45 AM), Non-Holding Digest (11:00 AM & 6:00 PM NPT)
  setInterval(() => {
    try {
      // Check for scheduled 11:00 AM & 6:00 PM non-holding corporate action digest
      checkAndDispatchScheduledNonHoldingDigest().catch(() => {});

      const status = getDetailedMarketStatus();
      const nptMins = status.nptTotalMinutes;
      const isTradingDay = status.isTradingDay;

      if (isTradingDay) {
        // Phase 1: 10:15 AM - 10:30 AM Pre-Market Scan suppressed in Option 1 (Full analysis is delivered at 3:45 PM EOD)
        // Phase 2: 10:45 AM - 10:55 AM Pre-Open Preparation
        const latestClosedSession = latestTradingSession(undefined, true);
        if (nptMins >= 645 && nptMins < 655 && lastMorningDigestDispatchedDate !== latestClosedSession && !isMorningDigestRunning && !activeHeavyWorker) {
          if (!checkRenderMemoryBudget('PremarketWorker').ok) return;
          isMorningDigestRunning = true;
          activeHeavyWorker = 'morningDigest';
          (async () => {
            try {
              // Pre-compile Today's Static Analytics & initialize Tick Stream for market open
              try {
                console.log(`[PremarketWorker] 🚀 Pre-compiling static analytics sub-file for ${status.targetSessionDate}...`);
                compileTodayStaticAnalytics({ targetDate: status.targetSessionDate });
                initTodayTickStream(status.targetSessionDate);
              } catch (e) {
                console.warn('[PremarketWorker] Static sub-file compilation notice:', e.message);
              }
              // Quantitative Morning Trading Digest Scan (10:45 AM NPT)
              const digestRes = await runMorningStockSelectionDigestWorker(latestClosedSession).catch(err => {
                console.warn('[PremarketWorker] Morning digest dispatch notice:', err.message);
                return false;
              });
              if (digestRes !== false) {
                lastMorningDigestDispatchedDate = latestClosedSession;
              }
              // Option 1: Full Flowchart v2.0 ticket was dispatched at 3:45 PM EOD for overnight study.
              // Fallback to morning full ticket dispatch ONLY if server was restarted and no post-market pick is cached.
              if (!cachedPostMarketPrimePick) {
                const res = await run5StepSwingSelectionAndDispatch({ onTrackHolding: trackCustomHolding }).catch(err => {
                  console.warn('[PremarketWorker] Morning swing fallback dispatch notice:', err.message);
                  return null;
                });
                if (res?.topPick) cachedPostMarketPrimePick = res.topPick;
              }
            } finally {
              isMorningDigestRunning = false;
              if (activeHeavyWorker === 'morningDigest') activeHeavyWorker = null;
              if (global.gc) {
                try { global.gc(); } catch (_) {}
              }
            }
          })();
        }
        // Phase 3: 10:50 AM Pre-Open Gate suppressed (Chase Cap rule is included directly on the EOD Prime Ticket)
        // Phase 4: 11:00 AM Market Open Bell suppressed to eliminate notification clutter
      }
    } catch (schedErr) {
      console.warn('[PremarketWorker] Schedule check notice:', schedErr.message);
    }
  }, 30 * 1000);

  // 1. Dravyashree Smart Alert Pipeline:
  // Runs every 60 seconds during live NEPSE market hours (11:00 AM - 3:00 PM NPT, Monday to Friday).
  // Uses bounded symbol-filtered live NOTS/SQLite slices (never full-session market floorsheets in RAM)
  // and a strict concurrency + memory guard to keep Render well below 512 MB.
  setInterval(() => {
    try {
      const status = getDetailedMarketStatus();
      const nptMins = status.nptTotalMinutes;
      const isTradingDay = status.isTradingDay || status.isOpen;

      if (isTradingDay && nptMins >= 660 && nptMins <= 900) {
        if (isSmartAlertScanRunning || activeHeavyWorker) {
          return;
        }
        if (!checkRenderMemoryBudget('SmartAlertWorker').ok) {
          return;
        }
        isSmartAlertScanRunning = true;
        activeHeavyWorker = 'smartAlertScan';
        const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });

        (async () => {
          try {
            await runMarketAlertScanCycle({
              getMarketStocks: async () => {
                if (_fetchTodayPricesInternal) return await _fetchTodayPricesInternal();
                return [];
              },
              getFloorsheet: async (sym) => {
                if (!checkRenderMemoryBudget('SmartAlertWorker:getFloorsheet').ok) return [];
                const cleanSym = String(sym || '').toUpperCase().trim();
                if (!cleanSym) return [];
                try {
                  const lastFetched = smartAlertLiveFetchTs.get(cleanSym) || 0;
                  if (Date.now() - lastFetched >= 90 * 1000) {
                    const fsRes = await nepseClient.getFloorSheet({
                      symbol: cleanSym,
                      page: 0,
                      size: 250,
                      timeoutMs: 3500
                    }).catch(() => null);
                    const rawFs = fsRes?.floorsheets?.content || fsRes?.content || (Array.isArray(fsRes) ? fsRes : []);
                    const todayOnly = Array.isArray(rawFs)
                      ? rawFs.filter(t => {
                          const s = String(t.stockSymbol || t.symbol || cleanSym).toUpperCase().trim();
                          const dt = String(t.businessDate || '').slice(0, 10);
                          return s === cleanSym && (!dt || dt === todayIso);
                        })
                      : [];
                    if (todayOnly.length > 0) {
                      try { ingestFloorsheetContracts(todayOnly, todayIso); } catch (_) {}
                    }
                    if (smartAlertLiveFetchTs.size > 400) smartAlertLiveFetchTs.clear();
                    smartAlertLiveFetchTs.set(cleanSym, Date.now());
                  }

                  if (db) {
                    const dbRows = db.prepare(`
                      SELECT contract_no as contractId, symbol as stockSymbol, symbol,
                             trade_date as businessDate, trade_time as tradeTime,
                             buyer_broker as buyerBroker, seller_broker as sellerBroker,
                             kitta as qty, kitta as quantity, rate, amount
                      FROM floorsheet_contracts
                      WHERE UPPER(symbol) = ? AND trade_date = ? AND buyer_broker > 0 AND seller_broker > 0
                      ORDER BY contract_no DESC
                      LIMIT 500
                    `).all(cleanSym, todayIso);
                    if (Array.isArray(dbRows) && dbRows.length > 0) {
                      return dbRows.map(r => ({
                        ...r,
                        buyerBrokerName: getBrokerName(r.buyerBroker),
                        sellerBrokerName: getBrokerName(r.sellerBroker)
                      }));
                    }
                  }
                } catch (_) {}
                return [];
              },
              getPriceHistory: async (sym) => {
                if (_getPriceHistoryInternal) return await _getPriceHistoryInternal(sym);
                return [];
              }
            });
          } catch (scanErr) {
            console.warn('[SmartAlertWorker] Periodic scan cycle notice:', scanErr.message);
          } finally {
            isSmartAlertScanRunning = false;
            if (activeHeavyWorker === 'smartAlertScan') activeHeavyWorker = null;
            if (global.gc) {
              try { global.gc(); } catch (_) {}
            }
          }
        })();
      }
    } catch (scanErr) {
      isSmartAlertScanRunning = false;
      if (activeHeavyWorker === 'smartAlertScan') activeHeavyWorker = null;
      console.warn('[SmartAlertWorker] Periodic scan cycle notice:', scanErr.message);
    }
  }, 60 * 1000);

  // 2. Check every 5 minutes: after 3:15 PM NPT (915 mins) on NEPSE trading days (Mon-Fri), run post-market close analysis ONCE
  setInterval(() => {
    try {
      const kt = getKathmanduTradingStatus();
      const status = getDetailedMarketStatus();
      const sessionDate = kt.isTradingDay ? kt.dateIso : (status.lastClosedSessionDate || status.targetSessionDate || kt.dateIso);

      // STRICT TIMING: Run AFTER market close (>= 15:15 NPT on Monday to Friday, excl. holidays)
      // Once analyzed, remains locked for sessionDate until next trading session.
      if (kt.isEodWindow) {
        if (lastPostMarketSessionAnalyzed !== sessionDate) {
          runPostMarketCloseAnalysis();
        } else if (!hasSelectionGuideDispatchedForDate(sessionDate)) {
          dispatchScheduledDailySelectionGuide({ targetDate: sessionDate }).catch(() => {});
        }
      }
    } catch (_) {}
  }, 5 * 60 * 1000);

  // 3. Two-Way Interactive Telegram Command Poller:
  // Polls Telegram every 4 seconds for user messages & commands (/track, /remove, /list, /status, /help).
  // Allows user to chat with the bot and manage personal exit alerts on the fly!
  setInterval(() => {
    try {
      if (isTelegramWebhookActive()) return;
      pollIncomingTelegramCommands({
        onTrackHolding: trackCustomHolding,
        onUntrackHolding: untrackCustomHolding,
        onGetTrackedHoldings: getUserTrackedHoldings,
        getLatestStockPrice: async (sym) => {
          try {
            const clean = String(sym || '').toUpperCase().trim();
            let cached = _getCache ? (_getCache('today-prices') || _getCache('market-summary')) : null;
            let list = Array.isArray(cached) ? cached : (cached?.data || cached?.stocks || []);
            if (list.length === 0 && _fetchTodayPricesInternal) {
              list = await _fetchTodayPricesInternal().catch(() => []);
            }
            const found = list.find(s => String(s.symbol || s.scrip || '').toUpperCase().trim() === clean);
            if (found) {
              return Number(found.ltp || found.lastTradedPrice || found.closePrice || 0);
            }
            if (_db) {
              const row = _db.prepare('SELECT close_price FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1').get(clean);
              if (row && row.close_price) return Number(row.close_price);
            }
          } catch (_) {}
          return 0;
        }
      });
    } catch (cmdErr) {
      console.warn('[TelegramWorker] Command polling notice:', cmdErr.message);
    }
  }, 4000);

  // 4. Live News & IPO Alert Poller (General + Pro Users):
  // Checks news across all 9 Services tab portals (ShareSansar, MeroLagani Announcements + News, NepaliPaisa, Clickmandu, Karobar Daily, Bizshala, BikashNews, Artha Kendra, Artha Sarokar) and IPO pipeline status every 3 minutes.
  // Sends push notifications and SSE updates for corporate actions, Most Covered News, macro halts, IPOs, and portfolio alerts.
  const runNewsAndIpoCheck = async () => {
    const hasAnyScraper = _scrapeMeroLaganiAnnouncements || _scrapeMeroLaganiNews || _scrapeShareSansarNews || _fetchNepaliPaisaNews || _scrapeBizshalaNews || _fetchKarobarNews || _fetchClickmanduNews || _scrapeBikashNews || _scrapeArthaKendraNews || _scrapeArthaSarokarNews || _getLiveIpoListings;
    if (!hasAnyScraper) return;
    await pollLiveNewsAndIpoAlerts({
      scrapeMeroLaganiAnnouncements: _scrapeMeroLaganiAnnouncements,
      scrapeMeroLaganiNews: _scrapeMeroLaganiNews,
      scrapeShareSansarNews: _scrapeShareSansarNews,
      fetchNepaliPaisaNews: _fetchNepaliPaisaNews,
      scrapeBizshalaNews: _scrapeBizshalaNews,
      fetchKarobarNews: _fetchKarobarNews,
      fetchClickmanduNews: _fetchClickmanduNews,
      scrapeBikashNews: _scrapeBikashNews,
      scrapeArthaKendraNews: _scrapeArthaKendraNews,
      scrapeArthaSarokarNews: _scrapeArthaSarokarNews,
      getLiveIpoListings: _getLiveIpoListings
    });
  };

  setInterval(async () => {
    try {
      await runNewsAndIpoCheck();
    } catch (newsErr) {
      console.warn('[NewsIpoWorker] Polling notice:', newsErr.message);
    }
  }, 3 * 60 * 1000);

  // Initial check delayed to 60 seconds after startup to protect Render boot memory & latency
  setTimeout(async () => {
    try {
      if (checkRenderMemoryBudget('InitialNewsIpoCheck').ok) {
        await runNewsAndIpoCheck();
      }
    } catch (_) {}
  }, 60000);

  // Initial EOD catch-up check delayed to 90 seconds after startup so health/API probes settle first under Render 512MB limit
  if (process.env.NODE_ENV !== 'test' && process.env.SUPPRESS_TEST_ALERTS !== 'true') {
    setTimeout(async () => {
      try {
        if (!checkRenderMemoryBudget('InitialEodCatchUp').ok) return;
        const kt = getKathmanduTradingStatus();
        const status = getDetailedMarketStatus();
        const sessionDate = kt.isTradingDay ? kt.dateIso : (status.lastClosedSessionDate || status.targetSessionDate || kt.dateIso);
        if (kt.isEodWindow && lastPostMarketSessionAnalyzed !== sessionDate) {
          await runPostMarketCloseAnalysis();
        }
      } catch (_) {}
    }, 90000);
  }

  console.log('Background analytical workers started (Floorsheet + Smart Alert Pipeline + Prime Pick Scanner + Telegram Bot Command Poller + News/IPO Alerts).');
}


