// File: src/services/signalTrackRecord/rebuildSignalTrackRecord.ts
import Database from 'better-sqlite3';

export type SignalStrategy = 'EARLY_IGNITION_3D' | 'STEALTH_ACCUMULATION';
export type SignalStatus =
  | 'ACTIVE'
  | 'TARGET_HIT'
  | 'RATCHET_STOP_WIN'
  | 'TIME_STOP_STALE'
  | 'STOP_LOSS'
  | 'UNFILLABLE_SKIP';

export interface DailyStockTelemetry {
  date: string;                 // YYYY-MM-DD
  symbol: string;
  sector: string;
  open: number;
  high: number;
  low: number;
  close: number;                // Adjusted for Bonus/Right Book Closure
  vwap?: number;                // Floor-sheet VWAP if available
  volume: number;
  turnover: number;             // Total daily turnover in NPR
  nepseIndexClose: number;      // NEPSE benchmark index close on that date
  isQuarterEndWindow?: boolean; // True on Days 18-30 of Ashwin, Poush, Chaitra, Ashadh
  hasUpcomingLockInExpiry?: boolean; // Promoter/MF lock-in expiring within 45 days
}

export interface DailyBrokerSummary {
  date: string;
  symbol: string;
  brokerId: number;
  buyVolume: number;
  sellVolume: number;
  buyTradesCount: number;       // Number of floor-sheet tickets on buy side
  buyTurnoverNpr: number;
}

export interface BrokerBaselineShare {
  brokerId: number;
  marketShareRatio: number;     // e.g. Broker 58 = 0.085 (8.5% of NEPSE), Broker 32 = 0.012
}

export interface RebuildConfig {
  capitalPerTradeNpr?: number;  // Default: Rs 2,50,000 position size for exact fee tiering
  shortTermCgtRate?: number;    // Default: 0.075 (7.5% individual short-term CGT)
  minTradableTurnoverNpr?: number; // Default: Rs 15,00,000 on entry day
  ratchetTriggerR?: number;     // Default: 1.2R (moves stop to fee-adjusted breakeven)
  ratchetLockGainPct?: number;  // Default: +1.2% above entry_vwap
  maxStaleSettledDays?: number; // Default: 10 settled trading days
  staleMinProgressR?: number;   // Default: 0.5R required by Day 10 to avoid time-stop
}

/**
 * 1. Exact NEPSE Commission, SEBON, DP Charge & CGT Calculator
 */
export function calculateNepseNetReturn(
  entryPrice: number,
  exitPrice: number,
  capitalNpr = 250000,
  cgtRate = 0.075
): { grossReturnPct: number; netReturnPct: number } {
  if (entryPrice <= 0 || exitPrice <= 0) {
    return { grossReturnPct: 0, netReturnPct: 0 };
  }

  const getBrokerCommissionRate = (amount: number): number => {
    if (amount <= 50000) return 0.0036;       // 0.36%
    if (amount <= 500000) return 0.0033;      // 0.33%
    if (amount <= 2000000) return 0.0031;     // 0.31%
    if (amount <= 10000000) return 0.0027;    // 0.27%
    return 0.0024;                            // 0.24%
  };

  const kitta = Math.max(10, Math.floor(capitalNpr / entryPrice));
  const buyGross = kitta * entryPrice;
  const buyCommission = Math.max(10, buyGross * getBrokerCommissionRate(buyGross));
  const buySebon = buyGross * 0.00015;        // 0.015% SEBON fee
  const buyDp = 25;                           // Rs 25 DP charge
  const totalBuyCost = buyGross + buyCommission + buySebon + buyDp;

  const sellGross = kitta * exitPrice;
  const sellCommission = Math.max(10, sellGross * getBrokerCommissionRate(sellGross));
  const sellSebon = sellGross * 0.00015;
  const sellDp = 25;
  const netSellProceedsBeforeTax = sellGross - sellCommission - sellSebon - sellDp;

  const taxableProfit = netSellProceedsBeforeTax - totalBuyCost;
  const cgtAmount = taxableProfit > 0 ? taxableProfit * cgtRate : 0;
  const finalNetProfit = taxableProfit - cgtAmount;

  const grossReturnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
  const netReturnPct = (finalNetProfit / totalBuyCost) * 100;

  return {
    grossReturnPct: Number(grossReturnPct.toFixed(2)),
    netReturnPct: Number(netReturnPct.toFixed(2)),
  };
}

/**
 * 2. Smart Money Broker Anomaly & Ticket-Size Scorer
 * Filters out high-volume retail brokers (e.g., #58) unless their accumulation
 * in this specific scrip is an outlier AND backed by large average kitta per ticket.
 */
export function evaluateBrokerSmartMoney(
  threeDayBrokerRows: DailyBrokerSummary[],
  totalThreeDayStockVolume: number,
  brokerBaselines: Map<number, number>
): {
  primaryBrokerId: number | null;
  anomalyScore: number;
  avgTicketKitta: number;
  isInstitutionalFootprint: boolean;
} {
  if (!threeDayBrokerRows.length || totalThreeDayStockVolume <= 0) {
    return { primaryBrokerId: null, anomalyScore: 0, avgTicketKitta: 0, isInstitutionalFootprint: false };
  }

  const aggregated = new Map<
    number,
    { netBuyVol: number; grossBuyVol: number; buyTrades: number }
  >();

  for (const row of threeDayBrokerRows) {
    const curr = aggregated.get(row.brokerId) || { netBuyVol: 0, grossBuyVol: 0, buyTrades: 0 };
    curr.netBuyVol += row.buyVolume - row.sellVolume;
    curr.grossBuyVol += row.buyVolume;
    curr.buyTrades += Math.max(1, row.buyTradesCount);
    aggregated.set(row.brokerId, curr);
  }

  let bestBrokerId: number | null = null;
  let highestAnomalyScore = 0;
  let bestTicketKitta = 0;

  for (const [brokerId, stats] of aggregated.entries()) {
    if (stats.netBuyVol <= 0) continue;

    // Share of 3-day net accumulation in this stock
    const stockAccumulationShare = stats.netBuyVol / totalThreeDayStockVolume;
    // Baseline market share across NEPSE (defaults to 1.8% if unknown)
    const baselineShare = Math.max(0.008, brokerBaselines.get(brokerId) ?? 0.018);

    // Anomaly Ratio: How many multiples above their normal market footprint is this broker buying?
    const rawAnomalyRatio = stockAccumulationShare / baselineShare;

    // Average Kitta per floor-sheet transaction
    const avgTicketKitta = stats.grossBuyVol / stats.buyTrades;

    // Ticket multiplier rewards HNI/Institutional lot sizes (>= 300 kitta/trade) and penalizes retail (< 45 kitta/trade)
    const ticketMultiplier =
      avgTicketKitta >= 350 ? 1.35 : avgTicketKitta >= 150 ? 1.0 : avgTicketKitta < 45 ? 0.45 : 0.75;

    const compositeScore = Number((rawAnomalyRatio * ticketMultiplier).toFixed(2));

    if (compositeScore > highestAnomalyScore) {
      highestAnomalyScore = compositeScore;
      bestBrokerId = brokerId;
      bestTicketKitta = Number(avgTicketKitta.toFixed(1));
    }
  }

  return {
    primaryBrokerId: bestBrokerId,
    anomalyScore: highestAnomalyScore,
    avgTicketKitta: bestTicketKitta,
    // Requires both concentration anomaly AND non-retail ticket size
    isInstitutionalFootprint: highestAnomalyScore >= 2.4 && bestTicketKitta >= 120,
  };
}

/**
 * 3. Safe Schema Upgrader for existing drabyashree_ledger.db
 */
export function ensureUpgradedLedgerSchema(db: Database.Database): void {
  const columnsToEnsure: Array<[string, string]> = [
    ['entry_vwap', 'REAL'],
    ['entry_turnover_npr', 'REAL DEFAULT 0'],
    ['active_stop_price', 'REAL'],
    ['is_ratchet_armed', 'INTEGER DEFAULT 0'],
    ['settlement_unlock_date', 'TEXT'],
    ['mfe_pct', 'REAL DEFAULT 0'],
    ['mae_pct', 'REAL DEFAULT 0'],
    ['nepse_index_return_pct', 'REAL DEFAULT 0'],
    ['nepse_alpha_pct', 'REAL DEFAULT 0'],
    ['broker_anomaly_score', 'REAL DEFAULT 0'],
    ['avg_ticket_kitta', 'REAL DEFAULT 0'],
    ['market_regime', "TEXT DEFAULT 'SIDEWAYS'"],
  ];

  const existingCols = new Set(
    (db.pragma('table_info(algorithmic_signal_ledger)') as Array<{ name: string }>).map((c) => c.name)
  );

  for (const [colName, colDef] of columnsToEnsure) {
    if (!existingCols.has(colName)) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN ${colName} ${colDef};`);
    }
  }
}

/**
 * 4. Walk-Forward Signal Rebuilder & T+2 Settlement Auditor
 */
export function rebuildSignalTrackRecord(
  db: Database.Database,
  stockSeriesBySymbol: Record<string, DailyStockTelemetry[]>, // Sorted oldest -> newest per symbol
  brokerSeriesBySymbol: Record<string, DailyBrokerSummary[]>,
  brokerBaselines: Map<number, number>,
  config: RebuildConfig = {}
) {
  ensureUpgradedLedgerSchema(db);

  const {
    capitalPerTradeNpr = 250000,
    shortTermCgtRate = 0.075,
    minTradableTurnoverNpr = 1500000,
    ratchetTriggerR = 1.2,
    ratchetLockGainPct = 1.2,
    maxStaleSettledDays = 10,
    staleMinProgressR = 0.5,
  } = config;

  const upsertStmt = db.prepare(`
    INSERT INTO algorithmic_signal_ledger (
      signal_id, symbol, sector, strategy,
      signal_date, trigger_ltp, initial_risk_pct, reward_multiple,
      entry_date, entry_vwap, entry_turnover_npr,
      target_price, initial_stop_price, active_stop_price, is_ratchet_armed,
      settlement_unlock_date, status, exit_date, exit_price, holding_days,
      mfe_pct, mae_pct, gross_return_pct, net_return_pct,
      nepse_index_return_pct, nepse_alpha_pct,
      primary_broker_id, broker_anomaly_score, avg_ticket_kitta, market_regime,
      updated_at
    ) VALUES (
      @signal_id, @symbol, @sector, @strategy,
      @signal_date, @trigger_ltp, @initial_risk_pct, @reward_multiple,
      @entry_date, @entry_vwap, @entry_turnover_npr,
      @target_price, @initial_stop_price, @active_stop_price, @is_ratchet_armed,
      @settlement_unlock_date, @status, @exit_date, @exit_price, @holding_days,
      @mfe_pct, @mae_pct, @gross_return_pct, @net_return_pct,
      @nepse_index_return_pct, @nepse_alpha_pct,
      @primary_broker_id, @broker_anomaly_score, @avg_ticket_kitta, @market_regime,
      datetime('now')
    )
    ON CONFLICT(signal_id) DO UPDATE SET
      status = excluded.status,
      entry_date = excluded.entry_date,
      entry_vwap = excluded.entry_vwap,
      active_stop_price = excluded.active_stop_price,
      is_ratchet_armed = excluded.is_ratchet_armed,
      exit_date = excluded.exit_date,
      exit_price = excluded.exit_price,
      holding_days = excluded.holding_days,
      mfe_pct = excluded.mfe_pct,
      mae_pct = excluded.mae_pct,
      gross_return_pct = excluded.gross_return_pct,
      net_return_pct = excluded.net_return_pct,
      nepse_index_return_pct = excluded.nepse_index_return_pct,
      nepse_alpha_pct = excluded.nepse_alpha_pct,
      updated_at = datetime('now');
  `);

  const runRebuildTransaction = db.transaction(() => {
    for (const [symbol, candles] of Object.entries(stockSeriesBySymbol)) {
      if (!candles || candles.length < 22) continue;

      const symbolBrokerRows = brokerSeriesBySymbol[symbol] || [];
      let cooldownUntilIdx = -1; // Prevent overlapping duplicate signals on the same scrip

      // Walk-forward day by day (t = Signal Trigger Day)
      for (let t = 20; t < candles.length - 1; t++) {
        if (t <= cooldownUntilIdx) continue;

        const dayT = candles[t];
        // Supply Overhang Shield: Skip stocks with upcoming promoter/MF lock-in expiry
        if (dayT.hasUpcomingLockInExpiry) continue;

        const window20 = candles.slice(t - 20, t);
        const window3 = candles.slice(t - 2, t + 1);

        const avgVol20 = window20.reduce((s, c) => s + c.volume, 0) / 20;
        const vol3DayAvg = window3.reduce((s, c) => s + c.volume, 0) / 3;
        const threeDayGainPct = ((dayT.close - candles[t - 3].close) / candles[t - 3].close) * 100;
        const threeDayHigh = Math.max(...window20.map((c) => c.high));

        // Filter 3-day floor-sheet rows strictly up to Day T (zero look-ahead)
        const activeDates = new Set(window3.map((c) => c.date));
        const brokerRows3D = symbolBrokerRows.filter((b) => activeDates.has(b.date));
        const totalVol3D = window3.reduce((s, c) => s + c.volume, 0);

        const smartMoney = evaluateBrokerSmartMoney(brokerRows3D, totalVol3D, brokerBaselines);

        // Determine Market Regime using 20-day NEPSE Index slope
        const nepse20ChangePct =
          ((dayT.nepseIndexClose - candles[t - 20].nepseIndexClose) /
            candles[t - 20].nepseIndexClose) *
          100;
        const marketRegime = dayT.isQuarterEndWindow
          ? 'QUARTER_END_PRESSURE'
          : nepse20ChangePct >= 3.5
          ? 'BULL'
          : nepse20ChangePct <= -3.5
          ? 'BEAR'
          : 'SIDEWAYS';

        // Detect Strategy Trigger on Day T
        let triggeredStrategy: SignalStrategy | null = null;

        const isStealthAccumulation =
          smartMoney.isInstitutionalFootprint &&
          Math.abs(threeDayGainPct) <= 4.2 && // Quiet price compression
          vol3DayAvg >= avgVol20 * 1.25;

        const isEarlyIgnition3D =
          threeDayGainPct >= 3.0 &&
          threeDayGainPct <= 9.5 &&
          dayT.close >= threeDayHigh * 0.985 &&
          vol3DayAvg >= avgVol20 * 1.6 &&
          smartMoney.anomalyScore >= 1.8;

        if (isStealthAccumulation) {
          triggeredStrategy = 'STEALTH_ACCUMULATION';
        } else if (isEarlyIgnition3D && marketRegime !== 'QUARTER_END_PRESSURE') {
          triggeredStrategy = 'EARLY_IGNITION_3D';
        }

        if (!triggeredStrategy) continue;

        // =========================================================================
        // STEP 2: Day T+1 Realistic VWAP Execution & Upper-Circuit Filter
        // =========================================================================
        const entryIdx = t + 1;
        const dayTPlus1 = candles[entryIdx];
        const entryVwap = Number(
          (dayTPlus1.vwap || (dayTPlus1.high + dayTPlus1.low + dayTPlus1.close) / 3).toFixed(2)
        );

        // Check if Day T+1 locked in an unfillable +9.8% upper circuit or illiquid trap
        const dayTPlus1LowJumpPct = ((dayTPlus1.low - dayT.close) / dayT.close) * 100;
        const isUnfillableCircuit =
          dayTPlus1LowJumpPct >= 9.6 || dayTPlus1.turnover < minTradableTurnoverNpr;

        const initialRiskPct = triggeredStrategy === 'STEALTH_ACCUMULATION' ? 5.0 : 6.0;
        const rewardMultiple = triggeredStrategy === 'STEALTH_ACCUMULATION' ? 2.4 : 2.2;

        const initialStopPrice = Number((entryVwap * (1 - initialRiskPct / 100)).toFixed(2));
        const targetPrice = Number(
          (entryVwap * (1 + (initialRiskPct * rewardMultiple) / 100)).toFixed(2)
        );

        const signalId = `${symbol}_${dayT.date}_${triggeredStrategy}`;

        if (isUnfillableCircuit) {
          upsertStmt.run({
            signal_id: signalId,
            symbol,
            sector: dayT.sector || 'OTHERS',
            strategy: triggeredStrategy,
            signal_date: dayT.date,
            trigger_ltp: dayT.close,
            initial_risk_pct: initialRiskPct,
            reward_multiple: rewardMultiple,
            entry_date: dayTPlus1.date,
            entry_vwap: entryVwap,
            entry_turnover_npr: dayTPlus1.turnover,
            target_price: targetPrice,
            initial_stop_price: initialStopPrice,
            active_stop_price: initialStopPrice,
            is_ratchet_armed: 0,
            settlement_unlock_date: null,
            status: 'UNFILLABLE_SKIP',
            exit_date: null,
            exit_price: null,
            holding_days: 0,
            mfe_pct: 0,
            mae_pct: 0,
            gross_return_pct: 0,
            net_return_pct: 0,
            nepse_index_return_pct: 0,
            nepse_alpha_pct: 0,
            primary_broker_id: smartMoney.primaryBrokerId,
            broker_anomaly_score: smartMoney.anomalyScore,
            avg_ticket_kitta: smartMoney.avgTicketKitta,
            market_regime: marketRegime,
          });
          continue;
        }

        // =========================================================================
        // STEP 3: NEPSE T+2 Demat Settlement Lock & Walk-Forward Resolution
        // Shares bought on entryIdx (Day T+1) settle across T+1 & T+2, becoming
        // tradable for exit starting at entryIdx + 2 (Day T+3).
        // =========================================================================
        const firstTradableIdx = entryIdx + 2;
        const settlementUnlockDate =
          candles[firstTradableIdx]?.date ?? candles[candles.length - 1].date;

        let status: SignalStatus = 'ACTIVE';
        let activeStopPrice = initialStopPrice;
        let isRatchetArmed = 0;
        let mfePct = 0;
        let maePct = 0;
        let exitIdx = candles.length - 1;
        let exitPrice = candles[exitIdx].close;

        for (let k = entryIdx + 1; k < candles.length; k++) {
          const c = candles[k];

          // Track Adverse Excursion even during T+2 settlement lock
          const dayDrawdownPct = ((c.low - entryVwap) / entryVwap) * 100;
          if (dayDrawdownPct < maePct) {
            maePct = Number(dayDrawdownPct.toFixed(2));
          }

          // Cannot execute a sell order before NEPSE T+2 EDIS/Demat settlement completes
          if (k < firstTradableIdx) continue;

          const dayRunupPct = ((c.high - entryVwap) / entryVwap) * 100;
          if (dayRunupPct > mfePct) {
            mfePct = Number(dayRunupPct.toFixed(2));
          }

          const settledDaysHeld = k - firstTradableIdx + 1;

          // 1. Check Stop-Loss / Ratchet Stop Breach (Conservative: check stop before target)
          if (c.low <= activeStopPrice) {
            status = isRatchetArmed ? 'RATCHET_STOP_WIN' : 'STOP_LOSS';
            exitPrice = activeStopPrice;
            exitIdx = k;
            break;
          }

          // 2. Check Target Fill
          if (c.high >= targetPrice) {
            status = 'TARGET_HIT';
            exitPrice = targetPrice;
            exitIdx = k;
            break;
          }

          // 3. Stage 1 Dynamic Ratchet: Arm breakeven + fee buffer once profit hits +1.2R
          const rDistance = (entryVwap * (initialRiskPct * ratchetTriggerR)) / 100;
          if (!isRatchetArmed && c.high >= entryVwap + rDistance) {
            activeStopPrice = Number((entryVwap * (1 + ratchetLockGainPct / 100)).toFixed(2));
            isRatchetArmed = 1;
          }

          // 4. Stage 2 Time-Stop Ejection: Eject dead money after 10 settled sessions if MFE < +0.5R
          if (
            settledDaysHeld >= maxStaleSettledDays &&
            mfePct < initialRiskPct * staleMinProgressR
          ) {
            exitPrice = Number((c.vwap || c.close).toFixed(2));
            exitIdx = k;
            status = 'TIME_STOP_STALE';
            break;
          }
        }

        const holdingDays = exitIdx - entryIdx;
        const { grossReturnPct, netReturnPct } = calculateNepseNetReturn(
          entryVwap,
          exitPrice,
          capitalPerTradeNpr,
          shortTermCgtRate
        );

        const nepseIndexReturnPct = Number(
          (
            ((candles[exitIdx].nepseIndexClose - dayTPlus1.nepseIndexClose) /
              dayTPlus1.nepseIndexClose) *
            100
          ).toFixed(2)
        );
        const nepseAlphaPct = Number((netReturnPct - nepseIndexReturnPct).toFixed(2));

        upsertStmt.run({
          signal_id: signalId,
          symbol,
          sector: dayT.sector || 'OTHERS',
          strategy: triggeredStrategy,
          signal_date: dayT.date,
          trigger_ltp: dayT.close,
          initial_risk_pct: initialRiskPct,
          reward_multiple: rewardMultiple,
          entry_date: dayTPlus1.date,
          entry_vwap: entryVwap,
          entry_turnover_npr: dayTPlus1.turnover,
          target_price: targetPrice,
          initial_stop_price: initialStopPrice,
          active_stop_price: activeStopPrice,
          is_ratchet_armed: isRatchetArmed,
          settlement_unlock_date: settlementUnlockDate,
          status,
          exit_date: status === 'ACTIVE' ? null : candles[exitIdx].date,
          exit_price: exitPrice,
          holding_days: holdingDays,
          mfe_pct: mfePct,
          mae_pct: maePct,
          gross_return_pct: grossReturnPct,
          net_return_pct: netReturnPct,
          nepse_index_return_pct: nepseIndexReturnPct,
          nepse_alpha_pct: nepseAlphaPct,
          primary_broker_id: smartMoney.primaryBrokerId,
          broker_anomaly_score: smartMoney.anomalyScore,
          avg_ticket_kitta: smartMoney.avgTicketKitta,
          market_regime: marketRegime,
        });

        // Prevent duplicate overlapping signals on the same scrip while trade is active
        cooldownUntilIdx = status === 'ACTIVE' ? candles.length : exitIdx;
      }
    }
  });

  runRebuildTransaction();

  // Return institutional summary & top smart-money brokers
  const strategyMetrics = db
    .prepare(`SELECT * FROM v_strategy_institutional_metrics`)
    .all();

  const brokerLeaderboard = db
    .prepare(`
      SELECT
        primary_broker_id AS brokerId,
        COUNT(*) AS auditedSignals,
        ROUND(AVG(broker_anomaly_score), 2) AS avgAnomalyScore,
        ROUND(AVG(avg_ticket_kitta), 1) AS avgTicketKitta,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE net_return_pct > 0) / NULLIF(COUNT(*), 0),
          1
        ) AS postFeeWinRatePct,
        ROUND(AVG(net_return_pct), 2) AS avgNetReturnPct,
        ROUND(AVG(nepse_alpha_pct), 2) AS avgNepseAlphaPct
      FROM algorithmic_signal_ledger
      WHERE status NOT IN ('ACTIVE', 'UNFILLABLE_SKIP')
        AND primary_broker_id IS NOT NULL
      GROUP BY primary_broker_id
      HAVING COUNT(*) >= 3
      ORDER BY avgNetReturnPct DESC, postFeeWinRatePct DESC
      LIMIT 15
    `)
    .all();

  return {
    strategyMetrics,
    brokerLeaderboard,
  };
}
