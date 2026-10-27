/**
 * scoringConfig.js
 * Centralized Configuration for Quantitative Scoring, Selection, & Risk Parameters
 *
 * NOTE: All weights, thresholds, and filter parameters here serve as transparent baseline
 * heuristics based on NEPSE microstructure (T+2, ±15% circuit bands, promoter float).
 * They are designed to be calibrated and optimized via walk-forward backtesting (Step 4).
 */

export const SCORING_CONFIG = {
  // ── 1. ENGINE COMPOSITE WEIGHTS (Must sum to 1.00) ──────────────────────────
  weights: {
    brokerFloorsheet: 0.35,  // 35% weight: Top broker net accumulation, CR3/CR5, aggressor flow
    technical: 0.25,         // 25% weight: Trend stack, momentum RSI/MACD, Donchian breakout
    fundamental: 0.20,       // 20% weight: P/E & P/BV vs sector medians, ROE, NRB asset safety
    marketContext: 0.20      // 20% weight: NEPSE index trend, sector rotation, breadth, event safety
  },

  // ── 2. SELECTION DECISION THRESHOLDS ───────────────────────────────────────
  thresholds: {
    // BUY requires strong confluence score AND minimum confidence band
    buyScore: 70,
    buyConfidence: 60,

    // WATCH allows candidate monitoring
    watchScore: 50,
    watchConfidence: 40,

    // Scores below watchScore or failing any hard filter default to AVOID
    avoidScore: 49
  },

  // ── 3. HARD FILTERS (Zero-Tolerance Gates) ──────────────────────────────────
  hardFilters: {
    // Liquidity Gates: Protect against illiquid cornering & exit traps
    minDailyTurnoverNpr: 2000000,   // Minimum Rs. 20 Lakhs daily turnover
    minDailyVolumeKitta: 5000,      // Minimum 5,000 kitta traded per day
    maxLiquidityParticipationPct: 5.0, // Order cannot exceed 5% of daily volume to minimize impact

    // Circuit Band Locks (Nepal Securities Trading Fourth Amendment 2082: ±15%)
    nepseCircuitBandPct: 15.0,
    circuitProximityThresholdPct: 1.0, // Scrip within 1.0% of ceiling (+15%) or floor (-15%) is locked
    excludeCircuitCeilingLocked: true, // Cannot enter if buyers locked ceiling (zero ask liquidity)
    excludeCircuitFloorLocked: true,   // Cannot enter if panic sellers locked floor (falling knife)

    // Fundamental & Regulatory Safety Gates
    excludeLossMaking: true,          // EPS <= 0 scrips are rejected or flagged
    maxBfiNplPct: 5.0,                // Hard NRB ceiling for Banks & Financial Institutions
    minCommercialBankCarPct: 11.0,    // NRB Minimum Capital Adequacy Ratio for Commercial Banks
    minDevelopmentBankCarPct: 10.0,   // NRB Minimum CAR for Development Banks

    // Corporate Event Safety Gates
    excludeDividendTrapDays: 5,       // Scrip within <= 5 sessions of book closure is barred from entry
    excludeCorneringFloatKitta: 1500000, // Scrip with < 1.5M public float flagged for cornering risk

    // Portfolio Exposure Limits
    maxSingleStockExposurePct: 15.0,  // Max 15% of total capital in any single stock
    maxSectorExposurePct: 25.0        // Max 25% of total capital in any single sector
  },

  // ── 4. EXECUTION, STOP-LOSS, & TARGET PARAMETERS ────────────────────────────
  execution: {
    defaultTradingCapitalNpr: 1000000, // Rs. 10 Lakhs reference capital
    maxRiskPerTradePct: 1.5,           // Risk strictly 1.5% of total equity per trade
    minLotSize: 10,                    // NEPSE minimum order lot size (10 kitta)
    stopLossAtrMultiplier: 1.5,        // Stop-loss distance = 1.5 * ATR(14)
    target1RiskMultiplier: 1.5,        // Target 1 = Entry + (1.5 * Risk)
    target2RiskMultiplier: 2.5,        // Target 2 = Entry + (2.5 * Risk)
    entryZoneBufferPct: 0.8            // Entry zone = [LTP * 0.992, LTP * 1.004]
  }
};
