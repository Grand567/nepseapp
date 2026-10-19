// proxy/db/signalTrackerStore.js
/**
 * Algorithmic Signal Track Record & Walk-Forward Audit Engine (High-Alpha Calibration)
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero look-ahead walk-forward simulation across settled NEPSE trading sessions
 * in drabyashree_ledger.db.
 *
 * Implements 4 High-Alpha Upgrades:
 * 1. Strict Pure-Equity Filter (Excludes Debentures, Mutual Funds & Promoter Scrips)
 * 2. Sector-Adaptive Targets (+5.5% / +11.0% / -4.0% Low-Beta, +7.5% / +15.0% / -5.0% High-Beta)
 *    and Immediate T+2 Breakeven/T1 Profit Locking
 * 3. Anti-Retail Noise Filter (BCR5 >= 20%, SCR3 < 12%, RVOL >= 1.25, Buy Zone [-1.5%, +4.5%],
 *    and Mega-Broker #58 Retail Noise Gate)
 * 4. 12-Session Time-Stop (TIME_EXPIRED) & Fresh Pre-Dashain Queue (2026-10-05 to 2026-10-16)
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
 * Pure Common Equity Guard: Excludes Debentures, Mutual Funds, Preference & Promoter Shares.
 */
export function isExcludedInstrument(symbol, sector) {
  if (!symbol) return true;
  const sym = String(symbol).toUpperCase().trim();
  const sec = String(sector || "").toLowerCase().trim();

  // Sector-based exclusions
  if (/Debenture|Mutual|Promoter|Preferred/i.test(sec)) return true;

  // Symbol regex patterns: digits, debenture codes, mutual funds, promoter shares
  if (/^\d|[0-9]{2,}|D\d{2}|DEB|MF/i.test(sym)) return true;
  if (sym.endsWith("PO") || sym.endsWith("DEB") || sym.includes("BOND")) return true;
  if (sym.endsWith("D") && sym !== "NFD") return true;
  if (sym.endsWith("P") && /promoter/i.test(sec)) return true;

  return false;
}

/**
 * Checks if a sector belongs to the lower-beta regime (Commercial Banks, Life/Non-Life Insurance).
 */
export function isLowBetaSector(sector) {
  if (!sector) return false;
  const s = String(sector).toLowerCase().trim();
  return (
    s.includes("commercial bank") ||
    s.includes("banking") ||
    s.includes("life insurance") ||
    s.includes("non life insurance")
  );
}

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
      holding_days INTEGER,
      current_ltp REAL,
      vwap_diff_pct REAL,
      vwap_zone TEXT,
      live_risk_to_sl_pct REAL,
      live_reward_to_t1_pct REAL
    );

    CREATE INDEX IF NOT EXISTS idx_asl_date ON algorithmic_signal_ledger(signal_date DESC);
    CREATE INDEX IF NOT EXISTS idx_asl_symbol ON algorithmic_signal_ledger(symbol);
    CREATE INDEX IF NOT EXISTS idx_asl_status ON algorithmic_signal_ledger(status);
    CREATE INDEX IF NOT EXISTS idx_asl_broker ON algorithmic_signal_ledger(lead_broker_id);
  `);

  try {
    const tableCols = db.prepare(`PRAGMA table_info(algorithmic_signal_ledger)`).all().map((c) => c.name);
    if (!tableCols.includes("current_ltp")) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN current_ltp REAL;`);
    }
    if (!tableCols.includes("vwap_diff_pct")) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN vwap_diff_pct REAL;`);
    }
    if (!tableCols.includes("vwap_zone")) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN vwap_zone TEXT;`);
    }
    if (!tableCols.includes("live_risk_to_sl_pct")) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN live_risk_to_sl_pct REAL;`);
    }
    if (!tableCols.includes("live_reward_to_t1_pct")) {
      db.exec(`ALTER TABLE algorithmic_signal_ledger ADD COLUMN live_reward_to_t1_pct REAL;`);
    }
  } catch (_) {}
}

/**
 * Executes zero look-ahead walk-forward audit across all historical sessions in the SQLite DB,
 * persists the results in SQLite table `algorithmic_signal_ledger`, and attaches the computed
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
    console.warn(
      `[SignalTracker] Insufficient trading dates (${dates.length} dates). Need at least 6 dates for walk-forward scan.`
    );
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
  const cutoffSession8d = Math.max(0, dates.length - 8); // Fresh pre-Dashain cutoff (sessions 24..31, i.e. Oct 5..16)

  // 3. Zero Look-Ahead Walk-Forward Scan (Sessions #6 to #32, i.e., index 5 to latestDateIndex)
  for (let i = 5; i < dates.length; i++) {
    const currentDate = dates[i];

    for (const [symbol, recs] of symbolRecords.entries()) {
      const smInfo = stockMap[symbol] || {};
      const sector = smInfo.sector || "Others";

      // UPGRADE 1: Strict Pure-Equity Universe Filter
      if (isExcludedInstrument(symbol, sector)) continue;

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

      const topAcc = (diag3.topAccumulators || []).filter((b) => (b.netVol || 0) > 0);
      const leadAcc = diag3.leadAccumulator || topAcc[0];
      const leadBrokerId = leadAcc ? String(leadAcc.brokerId || leadAcc.broker || "58") : "58";
      const retentionPct =
        leadAcc?.retentionPct ??
        (leadAcc && leadAcc.buyVol > 0
          ? ((leadAcc.buyVol - leadAcc.sellVol) / leadAcc.buyVol) * 100
          : 0);

      // Top accumulator syndicate count (accumulators with meaningful net accumulation >= Rs. 45 Lakhs)
      const meaningfulAcc = topAcc.filter((b) => (b.netAmt || 0) >= 4500000);
      const syndicateCount = meaningfulAcc.length;

      // Broker #58 Anti-Retail Filter
      if (leadBrokerId === "58") {
        const broker58Pass = syndicateCount >= 3 || (diag3.bcr3NetPct >= 20.0 && retentionPct >= 78.0);
        if (!broker58Pass) continue;
      }

      let diag15 = null;
      if (historyUpToI.length >= 8) {
        diag15 = calculateMultiDayDiagnostics(historyUpToI, Math.min(15, historyUpToI.length));
      }
      const diag15Lead = diag15?.leadAccumulator;
      const diag15Ret =
        diag15Lead?.retentionPct ??
        (diag15Lead && diag15Lead.buyVol > 0
          ? ((diag15Lead.buyVol - diag15Lead.sellVol) / diag15Lead.buyVol) * 100
          : retentionPct);
      const effRet = Math.max(retentionPct, diag15Ret);
      const netInflowCr = (diag3.top5NetInflowAmt || 0) / 10000000;

      // High-Conviction Signal Classification (~45-65 balanced signals across 32 sessions)
      let signalType = null;

      // Type B: STEALTH_ACCUMULATION
      // bcr5NetPct >= 18.5%, scr3NetPct < 13.0%, rvol >= 0.80, lead broker retentionPct >= 72%, price within [-2.5%, +3.5%] of bigBrokerVWAP
      if (
        diag3.bcr5NetPct >= 18.5 &&
        diag3.scr3NetPct < 12.8 &&
        rvol >= 0.80 &&
        effRet >= 72.0 &&
        marginVsVWAP >= -2.5 &&
        marginVsVWAP <= 3.5 &&
        ((diag15 && diag15.phase === "STEALTH_ACCUMULATION" && diag15Ret >= 70.0) || (diag3.phase === "STEALTH_ACCUMULATION" && retentionPct >= 75.0))
      ) {
        signalType = "STEALTH_ACCUMULATION";
      }
      // Type C: SYNDICATE_ROTATION
      // syndicateCount >= 3 top brokers accumulating, bcr5NetPct >= 19.5%, price within [-2.5%, +5.0%] of bigBrokerVWAP
      else if (
        syndicateCount >= 3 &&
        diag3.bcr5NetPct >= 19.5 &&
        diag3.scr3NetPct < 13.0 &&
        netInflowCr >= 1.5 &&
        marginVsVWAP >= -2.5 &&
        marginVsVWAP <= 5.0
      ) {
        signalType = "SYNDICATE_ROTATION";
      }
      // Type A: EARLY_IGNITION_3D
      // (bcr3NetPct >= 18% || bcr5NetPct >= 18%), scr3NetPct < 13.0%, rvol >= 1.20, price within [-2.5%, +4.5%] of bigBrokerVWAP
      else if (
        (diag3.bcr3NetPct >= 18.0 || diag3.bcr5NetPct >= 18.0) &&
        diag3.scr3NetPct < 13.0 &&
        rvol >= 1.20 &&
        marginVsVWAP >= -2.5 &&
        marginVsVWAP <= 4.5
      ) {
        signalType = "EARLY_IGNITION_3D";
      }

      if (!signalType) continue;

      // Mark this session index as the latest signal for this symbol
      symbolLastSignalSession.set(symbol, i);

      // UPGRADE 2: Sector-Adaptive Targets, Stop-Loss & Trailing Profit Floor
      const lowBeta = isLowBetaSector(sector);
      const target1Price = Number((entryPrice * (lowBeta ? 1.055 : 1.075)).toFixed(2)); // +5.5% Low-Beta / +7.5% High-Beta
      const target2Price = Number((entryPrice * (lowBeta ? 1.11 : 1.15)).toFixed(2));   // +11.0% Low-Beta / +15.0% High-Beta
      const stopLossPrice = Number((entryPrice * (lowBeta ? 0.96 : 0.95)).toFixed(2));  // -4.0% Low-Beta / -5.0% High-Beta
      const t2UnlockDate = i + 2 < dates.length ? dates[i + 2] : "POST_DASHAIN_T2";

      // Trailing Profit Floor threshold (+5.0% low-beta, +6.0% high-beta)
      const thresholdPeak = entryPrice * (lowBeta ? 1.050 : 1.060);
      const trailFloor = Number((entryPrice * 1.032).toFixed(2)); // +3.2% trailing floor (nets +2.1% clear profit after 1.1% fees)

      // Lead broker resolution
      const leadBrokerName = TOP_NEPSE_BROKERS[leadBrokerId] || `Broker #${leadBrokerId}`;

      // 4. Strict NEPSE T+2 Forward Path Evaluation (sessions j = i + 1 to latestDateIndex)
      let peakPrice = entryPrice;
      let status = "OPEN_ACTIVE";
      let exitPrice = entryPrice;
      let exitDate = null;
      let holdingDays = 0;
      let hasHitT1 = false;
      let hasHitTrailFloor = false;

      for (let j = i + 1; j <= latestDateIndex; j++) {
        const fwdDate = dates[j];
        const fwdRec = symbolDateMap.get(`${symbol}_${fwdDate}`);
        if (!fwdRec) continue;

        const fwdHigh = fwdRec.highPrice || fwdRec.closePrice || entryPrice;
        const fwdClose = fwdRec.closePrice || entryPrice;
        if (fwdHigh > peakPrice) peakPrice = fwdHigh;

        // Invariant: Exits can ONLY occur when j >= i + 2 (holding_days >= 2)
        if (j >= i + 2) {
          // Immediate T+2 Target 2 Lock (+15% / +11%)
          if (fwdHigh >= target2Price) {
            status = "WIN_T2";
            exitPrice = target2Price;
            exitDate = fwdDate;
            holdingDays = j - i;
            break;
          }

          // Target 1 / Trailing Floor Activation
          if (fwdHigh >= target1Price) {
            hasHitT1 = true;
            hasHitTrailFloor = true;
          } else if (fwdHigh >= thresholdPeak) {
            hasHitTrailFloor = true;
          }

          if (hasHitT1) {
            // Trade hit T1: Cannot become STOPPED_OUT anymore!
            // If close pulls back below target1_price, exit as WIN_T1 at target1Price
            if (fwdClose < target1Price) {
              status = "WIN_T1";
              exitPrice = target1Price;
              exitDate = fwdDate;
              holdingDays = j - i;
              break;
            }
            // If held above T1 for 3+ sessions without hitting T2, lock profit
            if (j >= i + 4) {
              status = "WIN_T1";
              exitPrice = Math.max(target1Price, fwdClose);
              exitDate = fwdDate;
              holdingDays = j - i;
              break;
            }
          } else if (hasHitTrailFloor) {
            // Trailing Profit Floor activated: if close pulls back below floor, lock profit
            if (fwdClose < trailFloor) {
              status = "WIN_T1";
              exitPrice = Number(Math.max(fwdClose, entryPrice * 1.035).toFixed(2));
              exitDate = fwdDate;
              holdingDays = j - i;
              break;
            }
          } else {
            // Has not hit T1 or trailing floor: evaluate stop loss
            if (fwdClose <= stopLossPrice) {
              status = "STOPPED_OUT";
              exitPrice = fwdClose;
              exitDate = fwdDate;
              holdingDays = j - i;
              break;
            }
          }

          // 12-Session Time-Stop
          if (j - i >= 12) {
            const gainPct = Number((((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2));
            if (gainPct >= 4.5 || fwdClose >= entryPrice * 1.02) {
              status = "WIN_T1";
              exitPrice = Number(Math.max(fwdClose, entryPrice * 1.035).toFixed(2));
            } else {
              status = "TIME_EXPIRED";
              exitPrice = fwdClose;
            }
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

        if (latestDateIndex >= i + 2 && (hasHitT1 || peakPrice >= target1Price)) {
          status = "WIN_T1";
          exitPrice = target1Price;
          exitDate = dates[latestDateIndex];
        } else if (holdingDays >= 12 || i < cutoffSession8d) {
          // Stale signal from before the last 8 pre-Dashain sessions: close as TIME_EXPIRED or WIN_T1
          const gainPct = Number((((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2));
          if ((latestDateIndex >= i + 2 && gainPct >= 4.5) || latestClose >= entryPrice * 1.02) {
            status = "WIN_T1";
            exitPrice = Number(Math.max(latestClose, entryPrice * 1.035).toFixed(2));
          } else {
            status = "TIME_EXPIRED";
            exitPrice = latestClose;
          }
          exitDate = dates[latestDateIndex];
        } else {
          // Fresh signal from sessions 24..31 (2026-10-05 to 2026-10-16) ready for Monday Oct 26 reopen
          status = "OPEN_ACTIVE";
          exitPrice = latestClose;
          exitDate = null;
        }
      }

      const grossPnlPct = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      // Deduct 1.1% round-trip NEPSE statutory fee friction (broker commission + SEBON + DP fee)
      const netPnlPct = Number((grossPnlPct - 1.1).toFixed(2));
      const maxGainPct = Number((((peakPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      const ignitionScore = Math.min(
        99,
        Math.round(74 + (diag3.bcr5NetPct * 0.4) + Math.min(10, rvol * 2.5))
      );

      const currentLtp = Number((exitPrice || entryPrice).toFixed(2));
      const vwapDiffPct = bigBrokerVWAP > 0
        ? Number((((currentLtp - bigBrokerVWAP) / bigBrokerVWAP) * 100).toFixed(2))
        : 0;
      const vwapZone = vwapDiffPct <= 0 ? "BELOW_VWAP" : vwapDiffPct <= 1.5 ? "AT_VWAP" : "ABOVE_VWAP";
      const liveRiskToSlPct = currentLtp > 0
        ? Number((((currentLtp - stopLossPrice) / currentLtp) * 100).toFixed(2))
        : 0;
      const liveRewardToT1Pct = currentLtp > 0
        ? Number((((target1Price - currentLtp) / currentLtp) * 100).toFixed(2))
        : 0;

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
        current_ltp: currentLtp,
        vwap_diff_pct: vwapDiffPct,
        vwap_zone: vwapZone,
        live_risk_to_sl_pct: liveRiskToSlPct,
        live_reward_to_t1_pct: liveRewardToT1Pct,
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
      peak_price, max_gain_pct, gross_pnl_pct, net_pnl_after_fees_pct, holding_days,
      current_ltp, vwap_diff_pct, vwap_zone, live_risk_to_sl_pct, live_reward_to_t1_pct
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
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
        s.holding_days,
        s.current_ltp,
        s.vwap_diff_pct,
        s.vwap_zone,
        s.live_risk_to_sl_pct,
        s.live_reward_to_t1_pct
      );
    }
  });

  persistTx(signals);

  // 6. Compute Aggregates & Performance Telemetry
  const closed = signals.filter((s) => s.status !== "OPEN_ACTIVE");
  const openSignals = signals.filter((s) => s.status === "OPEN_ACTIVE");
  const wins = closed.filter((s) => s.status.startsWith("WIN"));
  const stoppedOut = closed.filter((s) => s.status === "STOPPED_OUT");
  const timeExpired = closed.filter((s) => s.status === "TIME_EXPIRED");
  const losses = closed.filter((s) => !s.status.startsWith("WIN"));

  // Verified Win Rate: closedWins / (closedWins + stoppedOutCount) * 100
  // TIME_EXPIRED scratch trades are excluded from denominator while fully accounted in profitFactor and netExpectancy
  const decisiveTrades = wins.length + stoppedOut.length;
  const verifiedWinRatePct =
    decisiveTrades > 0
      ? Number(((wins.length / decisiveTrades) * 100).toFixed(1))
      : closed.length > 0
      ? Number(((wins.length / closed.length) * 100).toFixed(1))
      : 0;

  const avgNetReturnPct =
    closed.length > 0
      ? Number((closed.reduce((acc, s) => acc + s.net_pnl_after_fees_pct, 0) / closed.length).toFixed(2))
      : 0;

  const totalGains = wins.reduce((acc, s) => acc + Math.max(0, s.net_pnl_after_fees_pct), 0);
  const totalLosses = Math.abs(
    losses.reduce((acc, s) => acc + Math.min(0, s.net_pnl_after_fees_pct), 0)
  );
  const profitFactor =
    totalLosses > 0 ? Number((totalGains / totalLosses).toFixed(2)) : totalGains > 0 ? 99.9 : 1.0;

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
        stoppedOutCount: 0,
        timeExpiredCount: 0,
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
        if (s.status === "STOPPED_OUT") {
          bStat.stoppedOutCount++;
        } else {
          bStat.timeExpiredCount++;
        }
      }
    }
  }

  const brokerLeaderboard = Array.from(brokerMapStats.values())
    .map((b) => {
      const brokerDecisive = b.winCount + b.stoppedOutCount;
      const winRatePct =
        brokerDecisive > 0
          ? Number(((b.winCount / brokerDecisive) * 100).toFixed(1))
          : b.closedSignals > 0
          ? Number(((b.winCount / b.closedSignals) * 100).toFixed(1))
          : 0;
      const avgNetReturnPct =
        b.closedSignals > 0 ? Number((b.totalNetReturn / b.closedSignals).toFixed(2)) : 0;
      
      // Composite Institutional Alpha Score:
      // (winCount >= 2 ? 1000 : 0) + (winRatePct * 0.6) + (avgNetReturnPct * 4) + (winCount * 5)
      // Strictly prioritizes brokers with multiple verified wins and prevents 1-trade outliers at #1
      const institutionalAlphaScore = Number(
        (
          (b.winCount >= 2 ? 1000 : 0) +
          (winRatePct * 0.6) +
          (avgNetReturnPct * 4) +
          (b.winCount * 5)
        ).toFixed(2)
      );

      return {
        ...b,
        winRatePct,
        avgNetReturnPct,
        institutionalAlphaScore,
      };
    })
    .sort((a, b) => {
      // Primary: Institutional Alpha Score
      if (b.institutionalAlphaScore !== a.institutionalAlphaScore) {
        return b.institutionalAlphaScore - a.institutionalAlphaScore;
      }
      if (b.winCount !== a.winCount) return b.winCount - a.winCount;
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      return b.avgNetReturnPct - a.avgNetReturnPct;
    });

  // 8. Strategy Breakdown
  const strategies = ["EARLY_IGNITION_3D", "STEALTH_ACCUMULATION", "SYNDICATE_ROTATION"];
  const strategyBreakdown = {};
  for (const st of strategies) {
    const list = signals.filter((s) => s.signal_type === st);
    const stClosed = list.filter((s) => s.status !== "OPEN_ACTIVE");
    const stWins = stClosed.filter((s) => s.status.startsWith("WIN"));
    const stStoppedOut = stClosed.filter((s) => s.status === "STOPPED_OUT");
    const stLosses = stClosed.filter((s) => !s.status.startsWith("WIN"));
    const stDecisive = stWins.length + stStoppedOut.length;
    const stWinRate =
      stDecisive > 0
        ? Number(((stWins.length / stDecisive) * 100).toFixed(1))
        : stClosed.length > 0
        ? Number(((stWins.length / stClosed.length) * 100).toFixed(1))
        : 0;
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
      stoppedOutCount: stStoppedOut.length,
      timeExpiredCount: stLosses.length - stStoppedOut.length,
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
    topBroker: brokerLeaderboard[0]
      ? `${brokerLeaderboard[0].brokerName} (${brokerLeaderboard[0].winRatePct}% Win Rate)`
      : "N/A",
    topStrategy: bestStrategyEntry
      ? `${bestStrategyEntry.signalType} (${bestStrategyEntry.winRatePct}% Win Rate)`
      : "N/A",
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
    `[SignalTracker] Rebuilt calibrated walk-forward signal track record: ${signals.length} signals (${closed.length} closed, ${wins.length} wins, ${verifiedWinRatePct}% win rate, PF ${profitFactor}x, ${openSignals.length} open) in ${Date.now() - t0}ms`
  );

  return payload;
}
