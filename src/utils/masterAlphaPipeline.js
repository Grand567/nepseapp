// src/utils/masterAlphaPipeline.js
import { evaluateMasterStock, calculateNetTradeGain } from './masterProfitEngine';
import { calculateDynamicPositionSizing, getUserConfiguredCapital } from './dynamicCapitalEngine';
import { getDetailedMarketStatus } from './nepseCalendar';
import { getCachedRealPriceHistory, getCachedRealBrokerAnalysis } from './liveData';
import { adjustForCorporateActionsWithConfirmation } from './setupAnalyzer';

/**
 * Computes 10-Day Sector Relative Strength (RS) Ranks across all 13 NEPSE sectors.
 * Returns a map of { [sectorName]: rankNumber (1 = strongest) } and top3Sectors list.
 */
export function computeSectorRelativeStrengthRanks(stocks = []) {
  const sectorStats = {};

  for (const s of stocks) {
    if (!s || !s.symbol) continue;
    const sec = s.sector || s.sectorName || 'Others';
    if (sec === 'Others' || sec === 'Mutual Fund' || sec === 'Promoter Share') continue;

    if (!sectorStats[sec]) {
      sectorStats[sec] = { sector: sec, count: 0, sumPChange: 0, sumRvol: 0, totalTurnover: 0, sumRet10D: 0 };
    }

    const pChg = Number(s.pChange || 0);
    const rvol = Number(s.rvol || s.volumeSurgeRatio || 1);
    const turnover = Number(s.turnover || (Number(s.ltp || 0) * Number(s.volume || 0)) || 0);

    // Check 10-day return from cached history if available
    const hist = getCachedRealPriceHistory(s.symbol);
    let ret10D = pChg;
    if (Array.isArray(hist) && hist.length >= 10) {
      const latestClose = Number(hist[hist.length - 1]?.close || s.ltp || 0);
      const close10DAgo = Number(hist[Math.max(0, hist.length - 10)]?.close || 0);
      if (latestClose > 0 && close10DAgo > 0) {
        ret10D = ((latestClose - close10DAgo) / close10DAgo) * 100;
      }
    }

    sectorStats[sec].count += 1;
    sectorStats[sec].sumPChange += pChg;
    sectorStats[sec].sumRvol += rvol;
    sectorStats[sec].totalTurnover += turnover;
    sectorStats[sec].sumRet10D += ret10D;
  }

  const ranked = Object.values(sectorStats)
    .filter(st => st.count > 0)
    .map(st => {
      const avgPChange = st.sumPChange / st.count;
      const avgRet10D = st.sumRet10D / st.count;
      const avgRvol = st.sumRvol / st.count;
      const momentumScore = (avgRet10D * 0.55) + (avgPChange * 0.30) + ((avgRvol - 1) * 15);
      return {
        ...st,
        avgPChange: +avgPChange.toFixed(2),
        avgRet10D: +avgRet10D.toFixed(2),
        avgRvol: +avgRvol.toFixed(2),
        momentumScore: +momentumScore.toFixed(2)
      };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore);

  const sectorRanks = {};
  ranked.forEach((item, idx) => {
    sectorRanks[item.sector] = idx + 1;
  });

  return {
    sectorRanks,
    topSectors: ranked.slice(0, 3),
    allRankedSectors: ranked
  };
}

/**
 * Enterprise-Grade Unified 5-Step Alpha Pipeline for NEPSE:
 * - Step 1: Top 3 Sector Leadership & Market Turnover Regime
 * - Step 2: 8-Gate Quality Screener & Setup Score >= 72
 * - Step 3: Wyckoff VDU (Time-of-Day Paced <= 0.65x) & Smart Money Broker Absorption (BCR3 Buy >= 38%, Sell < 38%)
 * - Step 4: Friction-Adjusted Half-Kelly Sizing (10% Cash Buffer + 10-Kitta Lot) & Net Post-Tax R:R >= 2.5:1
 * - Step 5: Pre-Trade Circuit Freeze (+/- 14.95%) & Statutory WACC/CGT Readiness
 */
export function runUnifiedFiveStepAlphaDesk({
  stocks = [],
  indices = {},
  userCapital = getUserConfiguredCapital(),
  riskTolerancePct = 1.5,
  requiredNetRRR = 2.5
}) {
  const marketStatus = getDetailedMarketStatus();
  const nptMins = Number(marketStatus?.nptTotalMinutes || 690);

  // Intraday Volume Pacing Multiplier (11:00 AM = 660m, 3:00 PM = 900m -> 240m session)
  const elapsedTradingMins = Math.max(15, Math.min(240, nptMins - 660));
  const intradayVolumePacingFactor = marketStatus?.isOpen ? (240 / elapsedTradingMins) : 1.0;

  // Total Market Turnover in Arba
  let totalTurnover = Number(indices?.nepse?.turnover || 0);
  if (!totalTurnover || totalTurnover <= 0) {
    totalTurnover = stocks.reduce((acc, s) => acc + Number(s?.turnover || (Number(s?.ltp || 0) * Number(s?.volume || 0)) || 0), 0);
  }
  const marketTurnoverArba = +(totalTurnover / 1e9).toFixed(2);

  // Market Breadth check
  const adv = stocks.filter(s => Number(s?.pChange || 0) > 0).length;
  const dec = stocks.filter(s => Number(s?.pChange || 0) < 0).length;
  const totalTraded = Math.max(1, adv + dec);
  const breadthPct = Math.round((adv / totalTraded) * 100);
  const breadthPassed = breadthPct >= 38;

  // Step 1: Sector Relative Strength Ranking
  const { sectorRanks, topSectors } = computeSectorRelativeStrengthRanks(stocks);

  // 10% Tactical Cash Reserve Lock (Deployable Capital = 90% of User Capital)
  const safeUserCapital = Math.max(10000, Number(userCapital) || 100000);
  const deployableCapital = Math.round(safeUserCapital * 0.90);

  const fullyQualifiedPicks = [];
  const radarRunnerUps = [];

  for (const rawStock of stocks) {
    if (!rawStock || !rawStock.symbol) continue;
    const symbol = String(rawStock.symbol).toUpperCase().trim();
    const ltp = Number(rawStock.ltp || rawStock.closePrice || 0);
    if (ltp <= 40) continue; // Skip mutual funds / unpriced scrips

    const sector = rawStock.sector || rawStock.sectorName || 'Others';
    const sectorRank = Number(sectorRanks[sector] ?? 99);

    // Corporate Action Ex-Date Normalization on Cached History
    const rawHistory = getCachedRealPriceHistory(symbol) || rawStock.history || [];
    const dividends = rawStock.dividendHistory || [];
    let adjustedCandles = rawHistory;
    try {
      if (Array.isArray(rawHistory) && rawHistory.length > 10 && dividends.length > 0) {
        const adj = adjustForCorporateActionsWithConfirmation(rawHistory, dividends);
        if (adj?.adjustedCandles) adjustedCandles = adj.adjustedCandles;
      }
    } catch (_) {}

    // Evaluate base quantitative master stock metrics
    const masterEval = evaluateMasterStock(rawStock, breadthPassed, 0);
    if (!masterEval) continue;

    // ── STEP 1 CHECK: Top 3 Sector Leadership (or Top 5 if stock has >= 82 score) ──
    const step1SectorPassed = sectorRank <= 3 || (sectorRank <= 5 && masterEval.setupScore >= 82);

    // ── STEP 2 CHECK: 8-Gate Quality Screener & Confluence Score >= 72 ──
    const step2GatePassed = Boolean(
      masterEval.gatesPassedCount >= 6 &&
      masterEval.setupScore >= 72 &&
      !masterEval.isPromoterLockinNear &&
      masterEval.turnoverLakhs >= 40
    );

    // ── STEP 3 CHECK: Wyckoff VDU (Time-Paced) & Smart Money Broker Flow ──
    const cachedBroker = getCachedRealBrokerAnalysis(symbol) || rawStock.brokerAnalysis || rawStock.realBrokerAnalysis || null;
    const bcr3Buy = Number(cachedBroker?.bcr3BuyPct ?? masterEval.bcr3 ?? 0);
    const bcr3Sell = Number(cachedBroker?.bcr3SellPct ?? 0);
    const isOperatorDumping = bcr3Sell >= 38.0 && bcr3Sell > bcr3Buy;

    // Compute VDU ratio on recent consolidation candles
    let rawVduRatio = Number(rawStock.rvol || masterEval.rvol || 1.0);
    if (Array.isArray(adjustedCandles) && adjustedCandles.length >= 20) {
      const recent20 = adjustedCandles.slice(-20);
      const avgVol20 = recent20.reduce((sum, c) => sum + Number(c.volume || 0), 0) / 20;
      const minQuietVol = Math.min(...recent20.slice(-5).map(c => Number(c.volume || avgVol20)));
      if (avgVol20 > 0) {
        rawVduRatio = +(minQuietVol / avgVol20).toFixed(2);
      }
    }
    const pacedVduRatio = +(rawVduRatio * (marketStatus?.isOpen ? Math.min(1.15, intradayVolumePacingFactor * 0.8) : 1.0)).toFixed(2);
    const step3FlowPassed = Boolean(
      bcr3Buy >= 38.0 &&
      !isOperatorDumping &&
      (pacedVduRatio <= 0.65 || masterEval.rvol >= 1.35)
    );

    // ── STEP 4 CHECK: Friction-Adjusted Half-Kelly Sizing & Net R:R >= requiredNetRRR ──
    const entryLow = Number(masterEval.entryLow || +(ltp * 0.99).toFixed(1));
    const entryHigh = Number(masterEval.entryHigh || +(ltp * 1.015).toFixed(1));
    const chaseCap = Number(masterEval.chaseCap || +(entryHigh * 1.025).toFixed(1));
    const stopLoss = Number(masterEval.stopLoss || +(ltp * 0.945).toFixed(1));
    const target1 = Number(masterEval.target1Gross || +(ltp * 1.15).toFixed(1));
    const target2 = Number(masterEval.target2Net || +(ltp * 1.25).toFixed(1));

    const isInsideBuyZone = ltp >= entryLow * 0.985 && ltp <= entryHigh * 1.005;
    const isInsideChaseCap = ltp <= chaseCap;

    const dynSizing = calculateDynamicPositionSizing({
      userCapital: deployableCapital,
      entryPrice: ltp,
      stopLoss,
      target1,
      target2,
      median20DayTurnover: Math.max(5000000, masterEval.turnoverLakhs * 100000)
    });

    // Strict 10-Kitta regular lot rounding
    const rawKitta = Number(dynSizing?.finalKitta || 10);
    const strict10LotKitta = Math.max(10, Math.floor(rawKitta / 10) * 10);
    const netTrade = calculateNetTradeGain(ltp, target1, strict10LotKitta);
    const netTradeT2 = calculateNetTradeGain(ltp, target2, strict10LotKitta);
    const riskPerShare = Math.max(1, ltp - stopLoss);
    const totalRiskRupees = Math.round(strict10LotKitta * riskPerShare);
    const netRRR1 = totalRiskRupees > 0 ? +(netTrade.netRealizedGain / totalRiskRupees).toFixed(2) : Number(masterEval.netRRR || 2.5);

    const step4SizingPassed = Boolean(
      strict10LotKitta >= 10 &&
      netRRR1 >= requiredNetRRR &&
      isInsideChaseCap
    );

    // ── STEP 5 CHECK: Circuit Freeze (+/- 14.95%) & T+2 Tax Readiness ──
    const pChangePct = Number(rawStock.pChange || 0);
    const isCircuitLocked = Math.abs(pChangePct) >= 14.2;
    const step5ExecutionReady = Boolean(!isCircuitLocked && netTrade.statutoryBreakevenPrice > 0);

    const checklist = [
      {
        step: 1,
        title: 'Step 1: Sector Leadership',
        passed: step1SectorPassed,
        metric: `${sector} (Rank #${sectorRank <= 20 ? sectorRank : '—'})`,
        detail: step1SectorPassed
          ? `Institutional money is actively rotating into ${sector}.`
          : `${sector} is currently lagging the top 3 sector leaders.`
      },
      {
        step: 2,
        title: 'Step 2: 8-Gate Quality & Score',
        passed: step2GatePassed,
        metric: `${masterEval.gatesPassedCount}/8 Gates • Score ${masterEval.setupScore}/100`,
        detail: step2GatePassed
          ? `Passed liquidity (${masterEval.turnoverLakhs}L), trend (>50 EMA), and fundamental safety.`
          : `Failed one or more quality gates or score < 72.`
      },
      {
        step: 3,
        title: 'Step 3: Wyckoff VDU & Broker Flow',
        passed: step3FlowPassed,
        metric: `BCR3 Buy: ${bcr3Buy}% • VDU: ${pacedVduRatio}x`,
        detail: isOperatorDumping
          ? `🚨 VETO: Top brokers dumping (${bcr3Sell}% sell concentration).`
          : step3FlowPassed
          ? `Top 3 brokers absorbing ${bcr3Buy}% of volume with supply exhaustion.`
          : `Awaiting stronger top-3 broker concentration (>=38%) or volume dry-up.`
      },
      {
        step: 4,
        title: 'Step 4: Half-Kelly Sizing & Net R:R',
        passed: step4SizingPassed,
        metric: `Net R:R ${netRRR1}:1 • ${strict10LotKitta} Kitta`,
        detail: !isInsideChaseCap
          ? `⚠️ Extended above Chase Cap (Rs. ${chaseCap}). Wait for pullback.`
          : `Net R:R ${netRRR1}:1 after 7.5% CGT & SEBON fees. Max Risk: Rs. ${totalRiskRupees.toLocaleString('en-IN')}.`
      },
      {
        step: 5,
        title: 'Step 5: Circuit & T+2 Tax Check',
        passed: step5ExecutionReady,
        metric: `Breakeven: Rs. ${netTrade.statutoryBreakevenPrice} • Band Clear`,
        detail: isCircuitLocked
          ? `🚨 Locked near ±15% circuit limit (${pChangePct}%). Do not chase.`
          : `Clear of ±15% circuit freeze. T+1/T+2 statutory breakeven at Rs. ${netTrade.statutoryBreakevenPrice}.`
      }
    ];

    const stagesPassedCount = checklist.filter(c => c.passed).length;
    const all5StagesPassed = stagesPassedCount === 5;

    const dossier = {
      symbol,
      name: masterEval.name || rawStock.companyName || rawStock.name || symbol,
      sector,
      sectorRank,
      ltp,
      pChange: pChangePct,
      setupScore: masterEval.setupScore,
      stagesPassedCount,
      all5StagesPassed,
      executionStatus: !isInsideChaseCap
        ? 'EXTENDED_ABOVE_CHASE_CAP'
        : isInsideBuyZone
        ? 'ACTIONABLE_IN_BUY_ZONE'
        : 'NEAR_PIVOT_WATCH',
      checklist,
      executionPlan: {
        buyZoneLow: entryLow,
        buyZoneHigh: entryHigh,
        chaseCap,
        stopLoss,
        stopLossPct: masterEval.stopLossPct,
        target1,
        target1NetPct: masterEval.target1NetPct,
        target2,
        target2NetPct: masterEval.target2NetPct,
        statutoryBreakevenPrice: netTrade.statutoryBreakevenPrice,
        scaleOutKitta: Math.max(10, Math.floor((strict10LotKitta * 0.5) / 10) * 10),
        recommendedKitta: strict10LotKitta,
        capitalOutlay: strict10LotKitta * ltp,
        cashReserveLocked: safeUserCapital - deployableCapital,
        maxRiskRupees: totalRiskRupees,
        actualRiskPct: +((totalRiskRupees / safeUserCapital) * 100).toFixed(2),
        netProfitT1: Math.round(netTrade.netRealizedGain),
        netProfitT2: Math.round(netTradeT2.netRealizedGain),
        netRRR1,
        bcr3Buy,
        bcr3Sell,
        pacedVduRatio,
        analogWinRate: masterEval.analogWinRate,
        track: masterEval.track
      },
      rawStock,
      masterEval
    };

    if (all5StagesPassed) {
      fullyQualifiedPicks.push(dossier);
    } else if (stagesPassedCount >= 3 && !isOperatorDumping && !isCircuitLocked) {
      radarRunnerUps.push(dossier);
    }
  }

  // Sort qualified picks by Setup Score + Net R:R
  fullyQualifiedPicks.sort((a, b) => (b.setupScore + b.executionPlan.netRRR1 * 5) - (a.setupScore + a.executionPlan.netRRR1 * 5));
  radarRunnerUps.sort((a, b) => (b.stagesPassedCount * 25 + b.setupScore) - (a.stagesPassedCount * 25 + a.setupScore));

  return {
    hasVerifiedPicks: fullyQualifiedPicks.length > 0,
    stance: fullyQualifiedPicks.length > 0 ? 'ACTIONABLE_ALPHA_CONFIRMED' : 'CASH_PRESERVATION_MODE',
    marketContext: {
      marketTurnoverArba,
      breadthPct,
      breadthPassed,
      isOpen: Boolean(marketStatus?.isOpen),
      sessionLabel: marketStatus?.statusLabel || 'NEPSE Session',
      intradayVolumePacingFactor: +intradayVolumePacingFactor.toFixed(2),
      topSectors
    },
    primePick: fullyQualifiedPicks[0] || null,
    qualifiedList: fullyQualifiedPicks.slice(0, 5),
    watchlistRadar: radarRunnerUps.slice(0, 6)
  };
}
