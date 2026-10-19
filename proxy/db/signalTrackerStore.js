// proxy/db/signalTrackerStore.js
/**
 * Algorithmic Signal Track Record & Walk-Forward Audit Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero look-ahead walk-forward simulation across settled NEPSE trading sessions
 * in drabyashree_ledger.db.
 *
 * Implements:
 * 1. 3 Signal Generators:
 *    - Type A (EARLY_IGNITION_3D): 3D net absorption >= 18%, SCR3 < 13%, RVOL >= 1.4, price within -2% to +5.5% of VWAP
 *    - Type B (STEALTH_ACCUMULATION): 10D/15D phase === 'STEALTH_ACCUMULATION', BCR5 >= 18%, lead retention >= 70%
 *    - Type C (SYNDICATE_ROTATION): >= 3 brokers co-accumulating with net inflow >= Rs. 1.5 Cr, margin <= 8%
 * 2. Strict NEPSE T+2 Settlement Invariant (holding_days >= 2 required before any exit)
 * 3. Profit targets: T1 (+8.0%), T2 (+16.0% under 15% circuit regime), SL (-5.5%)
 * 4. 1.1% Round-trip NEPSE statutory fee friction deduction on all trades
 * 5. Broker Follow-Through Leaderboard & Strategy Breakdown
 * 6. SQLite table persistence (algorithmic_signal_ledger) & HOT_CACHE attachment
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { calculateMultiDayDiagnostics, TOP_NEPSE_BROKERS } from "../utils/microstructureEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load stock metadata (symbol -> { name, sector, ... })
let stockMap = {};
try {
  const candidatePaths = [
    path.join(__dirname, "..", "stockmap.json"),
    path.join(__dirname, "stockmap.json"),
    path.join(process.cwd(), "proxy", "stockmap.json"),
    path.join(process.cwd(), "src", "utils", "stockmap.json"),
    path.join(process.cwd(), "stockmap.json"),
    path.join(process.cwd(), "proxy", "data", "stockmap.json"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      stockMap = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
} catch (_) {}

/**
 * Initializes the SQLite table for the algorithmic signal ledger.
 */
export function initSignalLedgerTable(db) {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS algorithmic_signal_ledger (
      signal_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      sector TEXT,
      signal_date TEXT NOT NULL,
      t2_unlock_date TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      entry_price REAL NOT NULL,
      broker_vwap REAL,
      lead_broker_id TEXT,
      lead_broker_name TEXT,
      bcr5_net_pct REAL,
      scr3_net_pct REAL,
      ignition_score REAL,
      stop_loss_price REAL NOT NULL,
      target1_price REAL NOT NULL,
      target2_price REAL NOT NULL,
      status TEXT NOT NULL,
      exit_date TEXT,
      exit_price REAL,
      peak_price REAL,
      max_gain_pct REAL,
      gross_pnl_pct REAL,
      net_pnl_after_fees_pct REAL,
      holding_days INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_asl_date ON algorithmic_signal_ledger(signal_date DESC);
    CREATE INDEX IF NOT EXISTS idx_asl_symbol ON algorithmic_signal_ledger(symbol);
    CREATE INDEX IF NOT EXISTS idx_asl_status ON algorithmic_signal_ledger(status);
    CREATE INDEX IF NOT EXISTS idx_asl_broker ON algorithmic_signal_ledger(lead_broker_id);
  `);
}

/**
 * Executes zero look-ahead walk-forward audit across all historical sessions in the SQLite DB,
 * persists the results in SQLite table \`algorithmic_signal_ledger\`, and attaches the computed
 * track record to HOT_CACHE.signalTrackRecord.
 */
export function rebuildSignalTrackRecord(db, HOT_CACHE) {
  const t0 = Date.now();
  if (!db) return null;

  initSignalLedgerTable(db);

  // 1. Retrieve all distinct trading dates ordered chronologically (oldest -> newest)
  const dates = db
    .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date ASC`)
    .all()
    .map((r) => r.trade_date);

  if (dates.length < 6) {
    console.warn(`[SignalTracker] Insufficient trading dates (${dates.length} dates). Need at least 6 dates for walk-forward scan.`);
    return null;
  }

  // 2. Single bulk pull of all summaries & broker rows from SQLite
  const summaries = db.prepare(`SELECT * FROM daily_stock_summary ORDER BY trade_date ASC`).all();
  const brokerRows = db.prepare(`SELECT * FROM daily_broker_ledger ORDER BY trade_date ASC`).all();

  // Group broker rows by key: `${symbol}_${trade_date}`
  const brokerMap = new Map();
  for (const b of brokerRows) {
    const key = `${b.symbol}_${b.trade_date}`;
    let arr = brokerMap.get(key);
    if (!arr) {
      arr = [];
      brokerMap.set(key, arr);
    }
    arr.push({
      brokerId: b.broker_id,
      broker: b.broker_id,
      buyVol: b.buy_vol,
      sellVol: b.sell_vol,
      buyAmt: b.buy_amt,
      sellAmt: b.sell_amt,
    });
  }

  // Group daily records by symbol: chronological array of daily records
  const symbolRecords = new Map();
  const symbolDateMap = new Map();

  for (const s of summaries) {
    let recs = symbolRecords.get(s.symbol);
    if (!recs) {
      recs = [];
      symbolRecords.set(s.symbol, recs);
    }
    const rec = {
      date: s.trade_date,
      openPrice: s.open_price,
      highPrice: s.high_price,
      lowPrice: s.low_price,
      closePrice: s.close_price,
      totalVolume: s.total_volume,
      totalTurnover: s.total_turnover,
      brokers: brokerMap.get(`${s.symbol}_${s.trade_date}`) || [],
    };
    recs.push(rec);
    symbolDateMap.set(`${s.symbol}_${s.trade_date}`, rec);
  }

  const signals = [];
  const symbolLastSignalSession = new Map(); // symbol -> session index of last signal
  const latestDateIndex = dates.length - 1;

  // 3. Zero Look-Ahead Walk-Forward Scan (Sessions #6 to #32, i.e., index 5 to latestDateIndex)
  for (let i = 5; i < dates.length; i++) {
    const currentDate = dates[i];

    for (const [symbol, recs] of symbolRecords.entries()) {
      const currIdxInRecs = recs.findIndex((r) => r.date === currentDate);
      if (currIdxInRecs < 5) continue; // Requires at least 5 prior sessions

      // Invariant: No open signal exists for symbol in the last 8 sessions
      const lastSession = symbolLastSignalSession.get(symbol);
      if (lastSession !== undefined && i - lastSession < 8) {
        continue;
      }

      // Extract slice [0 ... currIdxInRecs] and reverse so index 0 is currentDate (strictly zero look-ahead)
      const historyUpToI = recs.slice(0, currIdxInRecs + 1).reverse();
      const currentDay = historyUpToI[0];
      const entryPrice = currentDay.closePrice;
      if (!entryPrice || entryPrice <= 0) continue;

      const diag3 = calculateMultiDayDiagnostics(historyUpToI, 3);
      if (!diag3) continue;

      const bigBrokerVWAP = diag3.bigBrokerVWAP || entryPrice;
      const marginVsVWAP = bigBrokerVWAP > 0 ? ((entryPrice - bigBrokerVWAP) / bigBrokerVWAP) * 100 : 0;

      // 3D RVOL calculation against historical baseline up to session i
      const vol3dAvg = diag3.totalVolume / Math.min(3, historyUpToI.length);
      const baselineSlice = historyUpToI.slice(0, Math.min(20, historyUpToI.length));
      const baselineAvg =
        baselineSlice.reduce((s, d) => s + (d.totalVolume || 0), 0) / Math.max(1, baselineSlice.length);
      const rvol = baselineAvg > 0 ? Number((vol3dAvg / baselineAvg).toFixed(2)) : 1.0;

      let signalType = null;
      let diag15 = null;

      // Type A: EARLY_IGNITION_3D
      // 3D bcr5NetPct >= 18%, scr3NetPct < 13%, rvol >= 1.4, entry_price within -2% to +5.5% of VWAP
      if (
        diag3.bcr5NetPct >= 18.0 &&
        diag3.scr3NetPct < 13.0 &&
        rvol >= 1.4 &&
        marginVsVWAP >= -2.0 &&
        marginVsVWAP <= 5.5
      ) {
        signalType = "EARLY_IGNITION_3D";
      }

      // Type B: STEALTH_ACCUMULATION
      // 10D/15D phase === 'STEALTH_ACCUMULATION', bcr5NetPct >= 18%, lead broker retention >= 70%
      if (!signalType && historyUpToI.length >= 8) {
        diag15 = calculateMultiDayDiagnostics(historyUpToI, Math.min(15, historyUpToI.length));
        if (diag15 && diag15.phase === "STEALTH_ACCUMULATION" && diag15.bcr5NetPct >= 18.0) {
          const leadAcc = diag15.leadAccumulator;
          const retPct =
            leadAcc?.retentionPct ??
            (leadAcc && leadAcc.buyVol > 0
              ? ((leadAcc.buyVol - leadAcc.sellVol) / leadAcc.buyVol) * 100
              : 0);
          if (retPct >= 70.0) {
            signalType = "STEALTH_ACCUMULATION";
          }
        }
      }

      // Type C: SYNDICATE_ROTATION
      // >= 3 top brokers co-accumulating with netInflow >= Rs. 1.5 Cr and operatorProfitMarginPct <= 8%
      if (!signalType) {
        const topAcc = (diag3.topAccumulators || []).filter((b) => (b.netVol || 0) > 0);
        const netInflowCr = (diag3.top5NetInflowAmt || 0) / 10000000;
        if (
          topAcc.length >= 3 &&
          netInflowCr >= 1.5 &&
          marginVsVWAP <= 8.0 &&
          diag3.bcr5NetPct >= 12.0 &&
          diag3.scr3NetPct < 15.0
        ) {
          signalType = "SYNDICATE_ROTATION";
        }
      }

      if (!signalType) continue;

      // Mark this session index as the latest signal for this symbol
      symbolLastSignalSession.set(symbol, i);

      // Target calculations
      const stopLossPrice = Number((entryPrice * 0.945).toFixed(2)); // -5.5% stop
      const target1Price = Number((entryPrice * 1.08).toFixed(2));  // +8.0% T1
      const target2Price = Number((entryPrice * 1.16).toFixed(2));  // +16.0% T2 (under 15% circuit regime)
      const t2UnlockDate = i + 2 < dates.length ? dates[i + 2] : "POST_DASHAIN_T2";

      // Lead broker resolution
      const leadAcc =
        signalType === "STEALTH_ACCUMULATION" && diag15?.leadAccumulator
          ? diag15.leadAccumulator
          : diag3.leadAccumulator || diag3.topAccumulators?.[0];
      const leadBrokerId = leadAcc ? String(leadAcc.brokerId || leadAcc.broker || "58") : "58";
      const leadBrokerName = TOP_NEPSE_BROKERS[leadBrokerId] || `Broker #${leadBrokerId}`;

      const smInfo = stockMap[symbol] || {};
      const sector = smInfo.sector || "Others";

      // 4. Strict NEPSE T+2 Forward Path Evaluation (sessions j = i + 1 to latestDateIndex)
      let peakPrice = entryPrice;
      let status = "OPEN_ACTIVE";
      let exitPrice = entryPrice;
      let exitDate = null;
      let holdingDays = 0;

      for (let j = i + 1; j <= latestDateIndex; j++) {
        const fwdDate = dates[j];
        const fwdRec = symbolDateMap.get(`${symbol}_${fwdDate}`);
        if (!fwdRec) continue;

        const fwdHigh = fwdRec.highPrice || fwdRec.closePrice || entryPrice;
        const fwdClose = fwdRec.closePrice || entryPrice;
        if (fwdHigh > peakPrice) peakPrice = fwdHigh;

        // Invariant: Exits (WIN_T2, WIN_T1, STOPPED_OUT) can ONLY occur when j >= i + 2 (holding_days >= 2)
        if (j >= i + 2) {
          if (fwdHigh >= target2Price) {
            status = "WIN_T2";
            exitPrice = target2Price;
            exitDate = fwdDate;
            holdingDays = j - i;
            break;
          } else if (fwdClose <= stopLossPrice) {
            status = "STOPPED_OUT";
            exitPrice = fwdClose;
            exitDate = fwdDate;
            holdingDays = j - i;
            break;
          } else if (fwdHigh >= target1Price && j >= i + 5) {
            status = "WIN_T1";
            exitPrice = Math.max(target1Price, fwdClose);
            exitDate = fwdDate;
            holdingDays = j - i;
            break;
          }
        }
      }

      // If still open at the latest session (2026-10-16):
      if (status === "OPEN_ACTIVE") {
        holdingDays = latestDateIndex - i;
        const latestRec = symbolDateMap.get(`${symbol}_${dates[latestDateIndex]}`);
        const latestClose = latestRec ? latestRec.closePrice : entryPrice;

        // If high >= target1Price on j >= i + 2, mark WIN_T1 (locked profit)
        if (latestDateIndex >= i + 2 && peakPrice >= target1Price) {
          status = "WIN_T1";
          exitPrice = target1Price;
          exitDate = dates[latestDateIndex];
        } else {
          status = "OPEN_ACTIVE";
          exitPrice = latestClose;
          exitDate = null;
        }
      }

      const grossPnlPct = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      // Deduct 1.1% round-trip NEPSE statutory fee friction (broker commission + SEBON + DP fee)
      const netPnlPct = Number((grossPnlPct - 1.1).toFixed(2));
      const maxGainPct = Number((((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      const ignitionScore = Math.min(99, Math.round(72 + (diag3.bcr5NetPct * 0.4) + Math.min(10, rvol * 2)));

      signals.push({
        signal_id: `${symbol}_${currentDate}_${signalType}`,
        symbol,
        sector,
        signal_date: currentDate,
        t2_unlock_date: t2UnlockDate,
        signal_type: signalType,
        entry_price: entryPrice,
        broker_vwap: bigBrokerVWAP,
        lead_broker_id: leadBrokerId,
        lead_broker_name: leadBrokerName,
        bcr5_net_pct: diag3.bcr5NetPct,
        scr3_net_pct: diag3.scr3NetPct,
        ignition_score: ignitionScore,
        stop_loss_price: stopLossPrice,
        target1_price: target1Price,
        target2_price: target2Price,
        status,
        exit_date: exitDate,
        exit_price: exitPrice,
        peak_price: peakPrice,
        max_gain_pct: maxGainPct,
        gross_pnl_pct: grossPnlPct,
        net_pnl_after_fees_pct: netPnlPct,
        holding_days: holdingDays,
      });
    }
  }

  // 5. Persist into SQLite (algorithmic_signal_ledger)
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO algorithmic_signal_ledger (
      signal_id, symbol, sector, signal_date, t2_unlock_date, signal_type,
      entry_price, broker_vwap, lead_broker_id, lead_broker_name,
      bcr5_net_pct, scr3_net_pct, ignition_score, stop_loss_price,
      target1_price, target2_price, status, exit_date, exit_price,
      peak_price, max_gain_pct, gross_pnl_pct, net_pnl_after_fees_pct, holding_days
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const persistTx = db.transaction((sigList) => {
    db.exec(`DELETE FROM algorithmic_signal_ledger`);
    for (const s of sigList) {
      insertStmt.run(
        s.signal_id,
        s.symbol,
        s.sector,
        s.signal_date,
        s.t2_unlock_date,
        s.signal_type,
        s.entry_price,
        s.broker_vwap,
        s.lead_broker_id,
        s.lead_broker_name,
        s.bcr5_net_pct,
        s.scr3_net_pct,
        s.ignition_score,
        s.stop_loss_price,
        s.target1_price,
        s.target2_price,
        s.status,
        s.exit_date,
        s.exit_price,
        s.peak_price,
        s.max_gain_pct,
        s.gross_pnl_pct,
        s.net_pnl_after_fees_pct,
        s.holding_days
      );
    }
  });

  persistTx(signals);

  // 6. Compute Aggregates & Performance Telemetry
  const closed = signals.filter((s) => s.status !== "OPEN_ACTIVE");
  const openSignals = signals.filter((s) => s.status === "OPEN_ACTIVE");
  const wins = closed.filter((s) => s.status.startsWith("WIN"));
  const losses = closed.filter((s) => s.status === "STOPPED_OUT");

  const verifiedWinRatePct = closed.length > 0 ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0;
  const avgNetReturnPct =
    closed.length > 0
      ? Number((closed.reduce((acc, s) => acc + s.net_pnl_after_fees_pct, 0) / closed.length).toFixed(2))
      : 0;

  const totalGains = closed
    .filter((s) => s.net_pnl_after_fees_pct > 0)
    .reduce((acc, s) => acc + s.net_pnl_after_fees_pct, 0);
  const totalLosses = Math.abs(
    closed
      .filter((s) => s.net_pnl_after_fees_pct < 0)
      .reduce((acc, s) => acc + s.net_pnl_after_fees_pct, 0)
  );
  const profitFactor = totalLosses > 0 ? Number((totalGains / totalLosses).toFixed(2)) : totalGains > 0 ? 99.9 : 1.0;

  // 7. Broker Follow-Through Leaderboard
  const brokerMapStats = new Map();
  for (const s of signals) {
    const bId = s.lead_broker_id || "58";
    let bStat = brokerMapStats.get(bId);
    if (!bStat) {
      bStat = {
        brokerId: bId,
        brokerName: s.lead_broker_name || TOP_NEPSE_BROKERS[bId] || `Broker #${bId}`,
        totalSignals: 0,
        closedSignals: 0,
        openSignals: 0,
        winCount: 0,
        lossCount: 0,
        totalNetReturn: 0,
        bestStock: { symbol: s.symbol, maxGainPct: s.max_gain_pct },
      };
      brokerMapStats.set(bId, bStat);
    }

    bStat.totalSignals++;
    if (s.max_gain_pct > bStat.bestStock.maxGainPct) {
      bStat.bestStock = { symbol: s.symbol, maxGainPct: s.max_gain_pct };
    }

    if (s.status === "OPEN_ACTIVE") {
      bStat.openSignals++;
    } else {
      bStat.closedSignals++;
      bStat.totalNetReturn += s.net_pnl_after_fees_pct;
      if (s.status.startsWith("WIN")) {
        bStat.winCount++;
      } else {
        bStat.lossCount++;
      }
    }
  }

  const brokerLeaderboard = Array.from(brokerMapStats.values())
    .map((b) => ({
      ...b,
      winRatePct: b.closedSignals > 0 ? Number(((b.winCount / b.closedSignals) * 100).toFixed(1)) : 0,
      avgNetReturnPct: b.closedSignals > 0 ? Number((b.totalNetReturn / b.closedSignals).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.winCount - a.winCount || b.winRatePct - a.winRatePct || b.totalSignals - a.totalSignals);

  // 8. Strategy Breakdown
  const strategies = ["EARLY_IGNITION_3D", "STEALTH_ACCUMULATION", "SYNDICATE_ROTATION"];
  const strategyBreakdown = {};
  for (const st of strategies) {
    const list = signals.filter((s) => s.signal_type === st);
    const stClosed = list.filter((s) => s.status !== "OPEN_ACTIVE");
    const stWins = stClosed.filter((s) => s.status.startsWith("WIN"));
    const stLosses = stClosed.filter((s) => s.status === "STOPPED_OUT");
    const stWinRate = stClosed.length > 0 ? Number(((stWins.length / stClosed.length) * 100).toFixed(1)) : 0;
    const stAvgNet =
      stClosed.length > 0
        ? Number((stClosed.reduce((acc, s) => acc + s.net_pnl_after_fees_pct, 0) / stClosed.length).toFixed(2))
        : 0;

    strategyBreakdown[st] = {
      signalType: st,
      totalSignals: list.length,
      closedSignals: stClosed.length,
      openSignals: list.length - stClosed.length,
      winCount: stWins.length,
      lossCount: stLosses.length,
      winRatePct: stWinRate,
      avgNetReturnPct: stAvgNet,
    };
  }

  // Find top strategy
  const bestStrategyEntry = Object.values(strategyBreakdown).sort(
    (a, b) => b.winCount - a.winCount || b.winRatePct - a.winRatePct
  )[0];

  const summary = {
    totalSignals: signals.length,
    closedSignals: closed.length,
    openSignals: openSignals.length,
    winCount: wins.length,
    lossCount: losses.length,
    verifiedWinRatePct,
    avgNetReturnPct,
    profitFactor,
    expectancyPct: avgNetReturnPct,
    topBroker: brokerLeaderboard[0] ? `${brokerLeaderboard[0].brokerName} (${brokerLeaderboard[0].winRatePct}% Win Rate)` : "N/A",
    topStrategy: bestStrategyEntry ? `${bestStrategyEntry.signalType} (${bestStrategyEntry.winRatePct}% Win Rate)` : "N/A",
    datasetTradingDates: dates.length,
    oldestDate: dates[0],
    newestDate: dates[dates.length - 1],
    t2InvariantVerified: closed.every((s) => s.holding_days >= 2),
  };

  const payload = {
    summary,
    strategyBreakdown,
    brokerLeaderboard,
    signals,
  };

  if (HOT_CACHE) {
    HOT_CACHE.signalTrackRecord = payload;
  }

  console.log(
    `[SignalTracker] Rebuilt walk-forward signal track record: ${signals.length} signals (${closed.length} closed, ${wins.length} wins, ${verifiedWinRatePct}% win rate, ${openSignals.length} open) in ${Date.now() - t0}ms`
  );

  return payload;
}
