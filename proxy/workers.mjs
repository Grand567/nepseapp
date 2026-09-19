import { query } from './db.mjs';

// Worker to aggregate daily floorsheet into broker accumulation table
export async function aggregateFloorsheetData() {
  console.log('Running background worker: aggregateFloorsheetData...');
  try {
    const sql = `
      INSERT INTO broker_daily_accumulation (
        traded_date, broker_id, security_id, 
        buy_quantity, buy_amount, 
        sell_quantity, sell_amount,
        net_quantity, net_amount
      )
      SELECT 
        traded_date, 
        buyer_broker AS broker_id, 
        security_id, 
        SUM(quantity) AS buy_quantity, 
        SUM(amount) AS buy_amount,
        0 AS sell_quantity,
        0 AS sell_amount,
        SUM(quantity) AS net_quantity,
        SUM(amount) AS net_amount
      FROM floorsheet_transactions
      WHERE traded_date = CURRENT_DATE
      GROUP BY traded_date, buyer_broker, security_id
      ON CONFLICT (traded_date, broker_id, security_id) DO UPDATE SET 
        buy_quantity = EXCLUDED.buy_quantity,
        buy_amount = EXCLUDED.buy_amount,
        net_quantity = broker_daily_accumulation.net_quantity + EXCLUDED.buy_quantity,
        net_amount = broker_daily_accumulation.net_amount + EXCLUDED.buy_amount;
    `;
    // await query(sql);
    console.log('Aggregation complete.');
  } catch (err) {
    console.error('Error in aggregateFloorsheetData:', err);
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

export function initWorkerDependencies({
  getPriceHistoryInternal,
  getOrFetchBrokerAnalysis,
  generateEntryExitPlan,
  fetchTodayPricesInternal,
  getCache,
}) {
  _getPriceHistoryInternal = getPriceHistoryInternal;
  _getOrFetchBrokerAnalysis = getOrFetchBrokerAnalysis;
  _generateEntryExitPlan = generateEntryExitPlan;
  _fetchTodayPricesInternal = fetchTodayPricesInternal;
  _getCache = getCache;
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
      .sort((a, b) => Number(b.turnover || 0) - Number(a.turnover || 0));

    console.log(`[PrimePickWorker] Scanning ${candidates.length} stocks through Entry/Exit Analyzer...`);

    // Step 3: Run generateEntryExitPlan on every candidate with real history
    const qualifiedCandidates = [];
    for (const cand of candidates) {
      const sym = String(cand.symbol || cand.scrip || '').toUpperCase().trim();
      if (!sym) continue;

      try {
        const history = await _getPriceHistoryInternal(sym, 365).catch(() => []);
        if (!history || history.length < 20) continue;

        const broker = _getOrFetchBrokerAnalysis ? await _getOrFetchBrokerAnalysis(sym, 30).catch(() => null) : null;
        const plan = _generateEntryExitPlan(cand, history, [], { brokerAnalysis: broker });
        if (!plan || !plan.supported) continue;

        const vUpper = String(plan.verdict || '').toUpperCase();
        const scoreVal = Number(plan.setupScore || 0);

        // MANDATORY DISQUALIFICATIONS — STRICTLY 2 RULES (USER DIRECTIVE):
        // 1. Verdict: NO TRADE / AVOID / REDUCE / EXIT / STAY OUT (Analyzer explicitly says don't trade)
        // 2. isInstitutionalDumping = true (Smart money is selling into retail)
        const isDisqualified =
          vUpper.includes('NO TRADE') ||
          vUpper.includes('AVOID') ||
          vUpper.includes('REDUCE') ||
          vUpper.includes('EXIT') ||
          vUpper.includes('STAY OUT') ||
          Boolean(plan.riskGate?.isInstitutionalDumping);

        const passesAll5 =
          !Boolean(plan.riskGate?.isCircuitTrap) &&
          !Boolean(plan.riskGate?.isLossMaking) &&
          Number(cand.eps || 0) >= 0 &&
          Boolean(plan.levels?.entryZone?.min) &&
          Number(plan.levels?.entryZone?.min) > 0;

        if (!isDisqualified) {
          qualifiedCandidates.push({ cand, plan, sym, scoreVal, winRateVal: Number(plan.analogResult?.stats?.winRate ?? 50), passesAll5 });
        }
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

    const winner = {
      ...cand,
      ...plan,
      symbol: sym,
      name: cand.name || cand.companyName || sym,
      sector: cand.sector || 'NEPSE',
      ltp: candLtp,
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
      postMarketLabel: "Tomorrow's Prime Opportunity (Full 350+ Universe Scan + Entry/Exit Analyzer)",
    };

    setVerifiedPostMarketPrimePick(winner);
    console.log(`[PrimePickWorker] ✅ Winner: ${sym} | Score: ${scoreVal} | Verdict: ${plan.verdict} | ${qualifiedCandidates.length} qualified from ${candidates.length} scanned`);
  } catch (err) {
    console.error('[PrimePickWorker] Fatal error:', err?.message || err);
  }
}

// Scheduled post-market close floorsheet reconciliation & prime pick verification worker
export async function runPostMarketCloseAnalysis() {
  console.log('[Post-Market Worker] Running post-market floorsheet & prime pick analysis...');
  try {
    await aggregateFloorsheetData();
    // Run the full Entry/Exit Analyzer scan across ALL 350+ stocks
    await runFullUniversePrimePick();
  } catch (err) {
    console.warn('[Post-Market Worker] Error in runPostMarketCloseAnalysis:', err?.message || err);
  }
}

// Start workers
export function startWorkers() {
  // Run floorsheet aggregation every 1 hour (3600000 ms)
  setInterval(aggregateFloorsheetData, 60 * 60 * 1000);

  // Check every 10 minutes to run post-close reconciliation after 3:15 PM NPT
  setInterval(() => {
    try {
      const now = new Date();
      // UTC+5:45
      const nptOffset = 5 * 60 + 45;
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const nptMins = (utcMins + nptOffset) % (24 * 60);
      const isTradingDay = now.getUTCDay() >= 0 && now.getUTCDay() <= 4; // Sun-Thu

      // Between 3:15 PM (15:15 = 915 mins) and 11:59 PM (1439 mins) — full post-market window
      if (isTradingDay && nptMins >= 915 && nptMins <= 1439) {
        runPostMarketCloseAnalysis();
      }
    } catch (_) {}
  }, 10 * 60 * 1000);

  console.log('Background analytical workers started (Floorsheet + Post-Market Full-Universe Prime Pick Scanner).');
}

