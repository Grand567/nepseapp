// proxy/utils/historicalSubfilesEngine.mjs
/**
 * Dravyashree NEPSE — 4 Historical Sub-Files Engine
 * 
 * Compiles and persists 4 distinct historical session sub-files:
 * - Sub-File 1: `historical_day_1.json[.gz]` (Session T-1: Most recent completed session)
 * - Sub-File 2: `historical_day_2.json[.gz]` (Session T-2: 2nd completed session back)
 * - Sub-File 3: `historical_day_3.json[.gz]` (Session T-3: 3rd completed session back)
 * - Sub-File 4: `historical_day_4.json[.gz]` (Session T-4: 4th completed session back)
 * - Manifest: `historical_subfiles_index.json[.gz]` (Dates index, file metadata & rolling shortcuts)
 * 
 * Calendar & Exchange Rules Enforced:
 * 1. Skips all weekends (Saturday & Sunday under the April 2026 regime) automatically.
 * 2. Skips all official Nepal BS holidays (Dashain, Tihar, Shivaratri, etc.) via SQLite trade sessions.
 * 3. Precomputes all 6 analytical cards and Service Hub leaderboards per day with plain-language interpretations.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { getNepaliDate } from '../../src/utils/bikramSambat.js';
import { getIsoDateInNPT, isNepseTradingDay, NEPSE_PUBLIC_HOLIDAYS } from '../../src/utils/nepseCalendar.js';
import { auditMultiSessionTrapRisk } from '../telegramNotifier.mjs';
import { auditAntiDematDumpGuard } from '../db/ledgerStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDataDir() {
  if (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR)) {
    return process.env.NEPSE_DATA_DIR;
  }
  if (process.env.RENDER_DISK_PATH && fs.existsSync(process.env.RENDER_DISK_PATH)) {
    return process.env.RENDER_DISK_PATH;
  }
  const candidates = [
    path.resolve(__dirname, '..', 'data'),
    path.join(process.cwd(), 'data'),
  ];
  for (const d of candidates) {
    if (fs.existsSync(d)) return d;
  }
  const fallback = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const DATA_DIR = resolveDataDir();
export const SUBFILES_DIR = path.join(DATA_DIR, 'subfiles');
if (!fs.existsSync(SUBFILES_DIR)) {
  fs.mkdirSync(SUBFILES_DIR, { recursive: true });
}

export const SUBFILES_INDEX_JSON = path.join(SUBFILES_DIR, 'historical_subfiles_index.json');
export const SUBFILES_INDEX_GZ = path.join(SUBFILES_DIR, 'historical_subfiles_index.json.gz');

const DB_PATH = path.join(DATA_DIR, 'drabyashree_ledger.db');

// In-memory cache for 0ms access
const _subfilesCache = new Map();
let _subfilesIndexCache = null;

function loadStockmap() {
  try {
    const mapPath = path.join(__dirname, '..', 'stockmap.json');
    if (fs.existsSync(mapPath)) {
      return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    }
  } catch (_) {}
  return {};
}

/**
 * Calculates Wilder 14-period Average True Range (ATR)
 */
function calculateATR14(candles, targetIndex) {
  if (!candles || candles.length < 2) return 5.0;
  const slice = candles.slice(0, targetIndex + 1);
  if (slice.length < 2) return 5.0;
  const period = Math.min(14, slice.length - 1);
  let trSum = 0;
  for (let i = slice.length - period; i < slice.length; i++) {
    const cur = slice[i];
    const prev = slice[i - 1];
    const h = Number(cur.high_price || cur.close_price);
    const l = Number(cur.low_price || cur.close_price);
    const cp = Number(prev.close_price);
    const tr = Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
    trSum += tr;
  }
  return Number((trSum / period).toFixed(2));
}

/**
 * Calculates 14-period RSI
 */
function calculateRSI14(candles, targetIndex) {
  if (!candles || candles.length < 15) return 50.0;
  const slice = candles.slice(0, targetIndex + 1);
  if (slice.length < 15) return 50.0;
  let gains = 0;
  let losses = 0;
  for (let i = slice.length - 14; i < slice.length; i++) {
    const change = Number(slice[i].close_price) - Number(slice[i - 1].close_price);
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return Number((100 - (100 / (1 + rs))).toFixed(2));
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
function calculateEMA(candles, period, targetIndex) {
  if (!candles || candles.length === 0) return 100.0;
  const slice = candles.slice(0, targetIndex + 1);
  if (slice.length === 0) return 100.0;
  const k = 2 / (period + 1);
  let ema = Number(slice[0].close_price || 100);
  for (let i = 1; i < slice.length; i++) {
    const close = Number(slice[i].close_price || ema);
    ema = close * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

/**
 * Compiles all 4 Historical Sub-Files from SQLite
 */
export function compileHistoricalSubfiles(options = {}) {
  const t0 = Date.now();
  const db = options.db || new Database(DB_PATH, { readonly: true, timeout: 10000 });
  try { db.pragma('busy_timeout = 10000'); } catch (_) {}
  const stockmap = loadStockmap();

  // 1. Query the most recent completed trading sessions (default 5 trading days)
  const maxDays = Math.max(1, parseInt(options.maxDays || 5, 10) || 5);
  const sessionRows = db
    .prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT ?')
    .all(maxDays);

  const tradingSessions = sessionRows.map(r => r.trade_date);
  if (tradingSessions.length === 0) {
    console.warn('[HistoricalSubfiles] No trading sessions found in SQLite ledger.');
    return null;
  }

  // 2. Fetch price summaries for the past 60 sessions to compute authentic technical indicators
  const allPriceRows = db.prepare(`
    SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    ORDER BY trade_date ASC
  `).all();

  const pricesBySymbol = new Map();
  for (const pr of allPriceRows) {
    const sym = pr.symbol.toUpperCase();
    if (!pricesBySymbol.has(sym)) pricesBySymbol.set(sym, []);
    pricesBySymbol.get(sym).push(pr);
  }

  const generatedSubfiles = [];

  // Compile each of the 4 historical days (dayIndex 1 to 4)
  for (let dayIdx = 0; dayIdx < tradingSessions.length; dayIdx++) {
    const sessionDate = tradingSessions[dayIdx];
    const dayOffset = dayIdx + 1; // 1 = T-1, 2 = T-2, 3 = T-3, 4 = T-4

    const nepaliDate = getNepaliDate(new Date(sessionDate));
    const bsDateStr = `${nepaliDate.year}-${String(nepaliDate.month).padStart(2, '0')}-${String(nepaliDate.day).padStart(2, '0')}`;
    const dayOfWeek = nepaliDate.dayOfWeekEn || 'Trading Day';

    // Ingest all stock price summaries for this specific session
    const sessionPrices = db.prepare(`
      SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
      FROM daily_stock_summary
      WHERE trade_date = ?
    `).all(sessionDate);

    // Ingest all broker ledger rows for this session
    const sessionBrokerRows = db.prepare(`
      SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
      FROM daily_broker_ledger
      WHERE trade_date = ?
    `).all(sessionDate);

    // Ingest floorsheet contracts for whale trade analysis
    const sessionFloorsheetRows = db.prepare(`
      SELECT trade_date, symbol, buyer_broker, seller_broker, rate, kitta
      FROM floorsheet_contracts
      WHERE trade_date = ?
    `).all(sessionDate);

    // Group broker rows by symbol
    const brokerBySymbol = new Map();
    const brokerGlobalAgg = new Map();
    for (const br of sessionBrokerRows) {
      const sym = br.symbol.toUpperCase();
      if (!brokerBySymbol.has(sym)) brokerBySymbol.set(sym, []);
      brokerBySymbol.get(sym).push(br);

      if (!brokerGlobalAgg.has(br.broker_id)) {
        brokerGlobalAgg.set(br.broker_id, {
          brokerId: br.broker_id,
          totalBuyVol: 0,
          totalSellVol: 0,
          totalTurnover: 0,
          netVol: 0
        });
      }
      const g = brokerGlobalAgg.get(br.broker_id);
      g.totalBuyVol += br.buy_vol;
      g.totalSellVol += br.sell_vol;
      g.totalTurnover += (br.buy_amt + br.sell_amt);
      g.netVol += (br.buy_vol - br.sell_vol);
    }

    // Group floorsheet by symbol
    const floorsheetBySymbol = new Map();
    for (const fsRow of sessionFloorsheetRows) {
      const sym = fsRow.symbol.toUpperCase();
      if (!floorsheetBySymbol.has(sym)) floorsheetBySymbol.set(sym, []);
      floorsheetBySymbol.get(sym).push(fsRow);
    }

    const scripsMap = {};
    let totalMarketTurnover = 0;
    let totalMarketVolume = 0;
    let totalMarketTrades = 0;
    let totalAdvances = 0;
    let totalDeclines = 0;
    let totalUnchanged = 0;

    const sectorAgg = new Map();

    for (const p of sessionPrices) {
      const sym = p.symbol.toUpperCase();
      const candles = pricesBySymbol.get(sym) || [];
      const currentCandleIdx = candles.findIndex(c => c.trade_date === sessionDate);
      const prevCandle = currentCandleIdx > 0 ? candles[currentCandleIdx - 1] : p;

      const open = Number(p.open_price || p.close_price || 100);
      const high = Number(p.high_price || p.close_price || open);
      const low = Number(p.low_price || p.close_price || open);
      const close = Number(p.close_price || open);
      const prevClose = Number(prevCandle.close_price || open);
      const volume = Number(p.total_volume || 0);
      const turnover = Number(p.total_turnover || 0);

      const pChange = prevClose > 0 ? Number((((close - prevClose) / prevClose) * 100).toFixed(2)) : 0;
      if (pChange > 0) totalAdvances++;
      else if (pChange < 0) totalDeclines++;
      else totalUnchanged++;

      totalMarketTurnover += turnover;
      totalMarketVolume += volume;

      const info = stockmap[sym] || {};
      const sector = info.sector || 'Others';

      // Sector aggregation
      if (!sectorAgg.has(sector)) sectorAgg.set(sector, { sector, turnover: 0, volume: 0, advances: 0, declines: 0 });
      const secItem = sectorAgg.get(sector);
      secItem.turnover += turnover;
      secItem.volume += volume;
      if (pChange > 0) secItem.advances++;
      else if (pChange < 0) secItem.declines++;

      // ── CARD 1: Quote & Price Action ──
      const vwap = volume > 0 ? Number((turnover / volume).toFixed(2)) : close;
      const vwapDiffPct = vwap > 0 ? Number((((close - vwap) / vwap) * 100).toFixed(2)) : 0;

      let quoteInterpretation = `${sym} closed at Rs. ${close.toLocaleString()} (${pChange >= 0 ? '+' : ''}${pChange}%). `;
      if (close > vwap) {
        quoteInterpretation += `Price closed above intraday VWAP (Rs. ${vwap}), indicating buyer aggression and healthy trend acceptance.`;
      } else if (close < vwap) {
        quoteInterpretation += `Price closed below intraday VWAP (Rs. ${vwap}), reflecting late-session distribution pressure.`;
      } else {
        quoteInterpretation += `Price closed neutral at equilibrium VWAP.`;
      }

      // ── CARD 2: Pivot Points (Classic & Camarilla) ──
      const pp = Number(((high + low + close) / 3).toFixed(2));
      const r1 = Number((2 * pp - low).toFixed(2));
      const s1 = Number((2 * pp - high).toFixed(2));
      const r2 = Number((pp + (high - low)).toFixed(2));
      const s2 = Number((pp - (high - low)).toFixed(2));
      const r3 = Number((high + 2 * (pp - low)).toFixed(2));
      const s3 = Number((low - 2 * (high - pp)).toFixed(2));

      const camDiff = Math.max(0.1, high - low);
      const camH4 = Number((close + camDiff * 1.1 / 2).toFixed(2));
      const camH3 = Number((close + camDiff * 1.1 / 4).toFixed(2));
      const camL3 = Number((close - camDiff * 1.1 / 4).toFixed(2));
      const camL4 = Number((close - camDiff * 1.1 / 2).toFixed(2));

      const pivotInterpretation = `Floor Pivot sits at Rs. ${pp}. Primary intraday support at S1 (Rs. ${s1}); major breakout threshold at R1 (Rs. ${r1}). Camarilla H4 expansion band: Rs. ${camH4}.`;

      // ── CARD 3: Oscillators & Risk ──
      const atr14 = calculateATR14(candles, currentCandleIdx >= 0 ? currentCandleIdx : candles.length - 1);
      const minStopLossDist = Number((atr14 * 1.25).toFixed(2));
      const rsi14 = calculateRSI14(candles, currentCandleIdx >= 0 ? currentCandleIdx : candles.length - 1);
      const ema20 = calculateEMA(candles, 20, currentCandleIdx >= 0 ? currentCandleIdx : candles.length - 1);
      const ema50 = calculateEMA(candles, 50, currentCandleIdx >= 0 ? currentCandleIdx : candles.length - 1);

      let oscillatorInterpretation = `RSI(14) is at ${rsi14} (${rsi14 >= 70 ? 'Overbought' : rsi14 <= 30 ? 'Oversold' : 'Neutral Momentum'}). `;
      oscillatorInterpretation += `Daily ATR is Rs. ${atr14}. Recommended volatility-adjusted stop-loss buffer is at least Rs. ${minStopLossDist} from entry.`;

      // ── CARD 4: Broker Smart Money Flow ──
      const bList = brokerBySymbol.get(sym) || [];
      const brokerMap = new Map();
      let totalStockBuyVol = 0;
      let totalStockSellVol = 0;

      for (const b of bList) {
        totalStockBuyVol += b.buy_vol;
        totalStockSellVol += b.sell_vol;
        brokerMap.set(b.broker_id, {
          broker_id: b.broker_id,
          buy_kitta: b.buy_vol,
          sell_kitta: b.sell_vol,
          net_kitta: b.buy_vol - b.sell_vol,
          buy_vwap: b.buy_vol > 0 ? Number((b.buy_amt / b.buy_vol).toFixed(2)) : 0,
          sell_vwap: b.sell_vol > 0 ? Number((b.sell_amt / b.sell_vol).toFixed(2)) : 0,
          retention_pct: b.buy_vol > 0 ? Math.round(((b.buy_vol - b.sell_vol) / b.buy_vol) * 100) : 0
        });
      }

      const brokerList = Array.from(brokerMap.values()).sort((a, b) => b.net_kitta - a.net_kitta);
      const topBuyers = brokerList.filter(b => b.net_kitta > 0).slice(0, 5);
      const topSellers = brokerList.filter(b => b.net_kitta < 0).reverse().slice(0, 5);

      const leadBroker = topBuyers[0] || null;

      // BCR3 & SCR3
      const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.net_kitta, 0);
      const top3SellVol = topSellers.slice(0, 3).reduce((acc, b) => acc + Math.abs(b.net_kitta), 0);
      const bcr3BuyPct = totalStockBuyVol > 0 ? Number(((top3BuyVol / totalStockBuyVol) * 100).toFixed(1)) : 0;
      const scr3SellPct = totalStockSellVol > 0 ? Number(((top3SellVol / totalStockSellVol) * 100).toFixed(1)) : 0;
      const nbar = totalStockSellVol > 0 ? Number((totalStockBuyVol / totalStockSellVol).toFixed(2)) : 1.0;
      const adRatio = (totalStockBuyVol + totalStockSellVol) > 0 ? Number(((totalStockBuyVol - totalStockSellVol) / (totalStockBuyVol + totalStockSellVol)).toFixed(2)) : 0;

      let brokerInterpretation = '';
      if (leadBroker && leadBroker.net_kitta > 0) {
        brokerInterpretation = `Broker #${leadBroker.broker_id} led accumulation with +${leadBroker.net_kitta.toLocaleString()} kitta absorbed at avg Rs. ${leadBroker.buy_vwap} (${leadBroker.retention_pct}% retention). Top 3 buyer concentration BCR3 is ${bcr3BuyPct}%.`;
      } else {
        brokerInterpretation = `Balanced or fragmented retail broker flow with no single institutional accumulator dominating this session.`;
      }

      // ── CARD 5: Wyckoff & Anti-Demat Dump Guard ──
      const trapAudit = auditMultiSessionTrapRisk(db, sym, leadBroker?.broker_id);
      let dumpGuardVerdict = 'PASS';
      try {
        const dumpCheck = auditAntiDematDumpGuard(sym);
        if (dumpCheck && dumpCheck.isTrap) {
          dumpGuardVerdict = 'PAST_ACCUMULATOR_DEMAT_DUMP';
        }
      } catch (_) {}

      let wyckoffPhase = 'BALANCED_FLOW';
      if (bcr3BuyPct >= 40 && pChange >= 1.5 && close >= vwap) {
        wyckoffPhase = 'MARKUP_BREAKOUT';
      } else if (bcr3BuyPct >= 35 && Math.abs(pChange) <= 2.5) {
        wyckoffPhase = 'STEALTH_ACCUMULATION';
      } else if (scr3SellPct >= 40 && pChange < -1.5) {
        wyckoffPhase = 'DISTRIBUTION_TRAP';
      }

      let wyckoffInterpretation = '';
      if (wyckoffPhase === 'STEALTH_ACCUMULATION') {
        wyckoffInterpretation = `Wyckoff Phase: Stealth Accumulation. Smart money quietly absorbed float without sparking a price spike.`;
      } else if (wyckoffPhase === 'MARKUP_BREAKOUT') {
        wyckoffInterpretation = `Wyckoff Phase: Markup Expansion. Institutional volume surge broke through resistance with follow-through.`;
      } else if (wyckoffPhase === 'DISTRIBUTION_TRAP') {
        wyckoffInterpretation = `Wyckoff Phase: Distribution Trap. Heavy institutional selling into retail liquidity. Avoid fresh long entries.`;
      } else {
        wyckoffInterpretation = `Wyckoff Phase: Balanced Trading Range. Neither accumulators nor distributors possess decisive control.`;
      }

      if (trapAudit.isTrap) {
        wyckoffInterpretation += ` ⚠️ Warning: Trap Veto Flagged — ${trapAudit.reason || 'Unabsorbed past selling detected'}.`;
      }

      // ── CARD 6: Tactical Execution Levels ──
      const operatorFloor = leadBroker?.buy_vwap && leadBroker.buy_vwap > 0 ? leadBroker.buy_vwap : close;
      const limitBuyMin = Math.floor(operatorFloor * 0.98);
      const limitBuyMax = Math.ceil(operatorFloor * 1.01);
      const chaseCap = Number((operatorFloor * 1.025).toFixed(1));
      const hardStop = Number((operatorFloor * 0.95).toFixed(1));
      const target1 = Number((operatorFloor * 1.08).toFixed(1));
      const target2 = Number((operatorFloor * 1.15).toFixed(1));

      const tacticalInterpretation = `Calibrated Entry Buy Zone: Rs. ${limitBuyMin} – ${limitBuyMax}. Invalidation stop-loss at Rs. ${hardStop} (-5%). Target 1 conservative: Rs. ${target1} (+8%); Target 2 swing: Rs. ${target2} (+15%).`;

      // ── Cumulative Context to this day ──
      const windowCandles = candles.slice(0, currentCandleIdx + 1).slice(-4);
      const cumVolume = windowCandles.reduce((acc, c) => acc + (c.total_volume || 0), 0);
      const cumTurnover = windowCandles.reduce((acc, c) => acc + (c.total_turnover || 0), 0);
      const windowStartClose = windowCandles.length > 0 ? Number(windowCandles[0].close_price || close) : close;
      const cumPChange = windowStartClose > 0 ? Number((((close - windowStartClose) / windowStartClose) * 100).toFixed(2)) : 0;

      scripsMap[sym] = {
        symbol: sym,
        company_name: info.name || sym,
        sector: sector,

        card_1_quote: {
          ltp: close,
          open,
          high,
          low,
          prev_close: prevClose,
          p_change: pChange,
          volume,
          turnover: Math.round(turnover),
          vwap,
          vwap_diff_pct: vwapDiffPct,
          statistical_calculation: "p_change = ((LTP - PrevClose) / PrevClose) * 100; VWAP = Turnover / Volume",
          interpretation: quoteInterpretation
        },

        card_2_pivot_points: {
          classic: { pp, r1, s1, r2, s2, r3, s3 },
          camarilla: { h4: camH4, h3: camH3, l3: camL3, l4: camL4 },
          statistical_calculation: "PP = (H+L+C)/3; R1 = 2PP-L; S1 = 2PP-H; Camarilla H4 = C + (H-L)*1.1/2",
          interpretation: pivotInterpretation
        },

        card_3_oscillators_risk: {
          rsi_14: rsi14,
          ema_20: ema20,
          ema_50: ema50,
          atr_14: atr14,
          min_stop_loss_distance: minStopLossDist,
          statistical_calculation: "Wilder ATR(14) = EMA of True Range; Stop Distance = ATR * 1.25",
          interpretation: oscillatorInterpretation
        },

        card_4_broker_smart_flow: {
          lead_accumulator: leadBroker ? {
            broker_id: leadBroker.broker_id,
            buy_kitta: leadBroker.buy_kitta,
            sell_kitta: leadBroker.sell_kitta,
            net_kitta: leadBroker.net_kitta,
            buy_vwap: leadBroker.buy_vwap,
            retention_pct: leadBroker.retention_pct
          } : null,
          top_5_buyers: topBuyers.map(b => ({ broker_id: b.broker_id, net_kitta: b.net_kitta, buy_kitta: b.buy_kitta, buy_vwap: b.buy_vwap })),
          top_5_sellers: topSellers.map(b => ({ broker_id: b.broker_id, net_dump_kitta: Math.abs(b.net_kitta), sell_kitta: b.sell_kitta, sell_vwap: b.sell_vwap })),
          concentration: {
            bcr3_buy_pct: bcr3BuyPct,
            scr3_sell_pct: scr3SellPct,
            nbar,
            ad_ratio: adRatio
          },
          statistical_calculation: "BCR3 = (Top 3 Buyers Net Kitta / Total Buy Volume) * 100; NBAR = Total Buy / Total Sell",
          interpretation: brokerInterpretation
        },

        card_5_wyckoff_and_dump_guard: {
          wyckoff_phase: wyckoffPhase,
          dump_guard_status: dumpGuardVerdict,
          is_trap: Boolean(trapAudit.isTrap || dumpGuardVerdict !== 'PASS'),
          trap_reason: trapAudit.reason || (dumpGuardVerdict !== 'PASS' ? 'Anti-Demat dump flagged' : ''),
          multi_day_retention_pct: leadBroker?.retention_pct || 0,
          statistical_calculation: "Wyckoff classifier evaluates BCR3, price momentum, and volume spread. Dump guard evaluates 3-session prior accumulator retention.",
          interpretation: wyckoffInterpretation
        },

        card_6_tactical_execution: {
          limit_buy_min: limitBuyMin,
          limit_buy_max: limitBuyMax,
          chase_cap: chaseCap,
          hard_stop: hardStop,
          target_1: target1,
          target_2: target2,
          operator_cost_floor: operatorFloor,
          statistical_calculation: "Buy Zone = Operator VWAP [-2%, +1%]; Stop = -5%; Target 1 = +8%; Target 2 = +15%",
          interpretation: tacticalInterpretation
        },

        rolling_cumulative_to_day: {
          sessions_count: windowCandles.length,
          cumulative_volume: cumVolume,
          cumulative_turnover: Math.round(cumTurnover),
          cumulative_p_change: cumPChange,
          operator_cost_floor: operatorFloor,
          bcr5_net_pct: bcr3BuyPct,
          interpretation: `Over the ${windowCandles.length}-session window up to this date, ${sym} moved ${cumPChange >= 0 ? '+' : ''}${cumPChange}% on Rs. ${(cumTurnover / 10000000).toFixed(2)} Cr turnover.`
        }
      };
    }

    // ── Build Service Hub Precomputed Leaderboards for this session ──
    const allStockItems = Object.values(scripsMap);

    const topGainers = [...allStockItems]
      .sort((a, b) => b.card_1_quote.p_change - a.card_1_quote.p_change)
      .slice(0, 15)
      .map(s => ({
        symbol: s.symbol,
        company_name: s.company_name,
        sector: s.sector,
        ltp: s.card_1_quote.ltp,
        p_change: s.card_1_quote.p_change,
        volume: s.card_1_quote.volume,
        turnover: s.card_1_quote.turnover
      }));

    const topLosers = [...allStockItems]
      .sort((a, b) => a.card_1_quote.p_change - b.card_1_quote.p_change)
      .slice(0, 15)
      .map(s => ({
        symbol: s.symbol,
        company_name: s.company_name,
        sector: s.sector,
        ltp: s.card_1_quote.ltp,
        p_change: s.card_1_quote.p_change,
        volume: s.card_1_quote.volume,
        turnover: s.card_1_quote.turnover
      }));

    const volumeLeaders = [...allStockItems]
      .sort((a, b) => b.card_1_quote.volume - a.card_1_quote.volume)
      .slice(0, 15)
      .map(s => ({
        symbol: s.symbol,
        sector: s.sector,
        ltp: s.card_1_quote.ltp,
        volume: s.card_1_quote.volume,
        p_change: s.card_1_quote.p_change
      }));

    const turnoverLeaders = [...allStockItems]
      .sort((a, b) => b.card_1_quote.turnover - a.card_1_quote.turnover)
      .slice(0, 15)
      .map(s => ({
        symbol: s.symbol,
        sector: s.sector,
        ltp: s.card_1_quote.ltp,
        turnover: s.card_1_quote.turnover,
        p_change: s.card_1_quote.p_change
      }));

    const whaleArchiveTop10 = [...allStockItems]
      .filter(s => s.card_4_broker_smart_flow.lead_accumulator && s.card_4_broker_smart_flow.lead_accumulator.net_kitta > 0)
      .sort((a, b) => (b.card_4_broker_smart_flow.lead_accumulator?.net_kitta || 0) - (a.card_4_broker_smart_flow.lead_accumulator?.net_kitta || 0))
      .slice(0, 10)
      .map(s => ({
        symbol: s.symbol,
        company_name: s.company_name,
        sector: s.sector,
        ltp: s.card_1_quote.ltp,
        lead_broker_id: s.card_4_broker_smart_flow.lead_accumulator?.broker_id,
        net_kitta: s.card_4_broker_smart_flow.lead_accumulator?.net_kitta,
        avg_buy_price: s.card_4_broker_smart_flow.lead_accumulator?.buy_vwap,
        retention_pct: s.card_4_broker_smart_flow.lead_accumulator?.retention_pct,
        bcr3_pct: s.card_4_broker_smart_flow.concentration.bcr3_buy_pct
      }));

    const brokerLeaderboard = Array.from(brokerGlobalAgg.values())
      .sort((a, b) => b.totalTurnover - a.totalTurnover)
      .slice(0, 15)
      .map(b => ({
        broker_id: b.brokerId,
        total_turnover: Math.round(b.totalTurnover),
        total_buy_vol: b.totalBuyVol,
        total_sell_vol: b.totalSellVol,
        net_volume: b.netVol
      }));

    const sectorRotation = Array.from(sectorAgg.values())
      .sort((a, b) => b.turnover - a.turnover)
      .map(sec => ({
        sector: sec.sector,
        turnover: Math.round(sec.turnover),
        volume: sec.volume,
        advances: sec.advances,
        declines: sec.declines
      }));

    const subfilePayload = {
      file_type: 'HISTORICAL_DAY_SUBFILE',
      version: '1.0-subfile',
      day_offset: dayOffset,
      session_date: sessionDate,
      bs_date: bsDateStr,
      bs_formatted: nepaliDate.formattedEn,
      day_of_week: dayOfWeek,
      is_trading_day: true,
      compiled_at: new Date().toISOString(),
      total_scrips: allStockItems.length,

      market_summary_card: {
        session_date: sessionDate,
        bs_date: bsDateStr,
        total_turnover: Math.round(totalMarketTurnover),
        total_volume: totalMarketVolume,
        advances: totalAdvances,
        declines: totalDeclines,
        unchanged: totalUnchanged,
        interpretation: `Official completed NEPSE trading session for ${dayOfWeek}, ${sessionDate} (${nepaliDate.formattedEn}). Total exchange turnover: Rs. ${(totalMarketTurnover / 10000000).toFixed(2)} Cr across ${totalAdvances} advancing and ${totalDeclines} declining scrips.`
      },

      service_hub_precomputed: {
        top_gainers: topGainers,
        top_losers: topLosers,
        volume_leaders: volumeLeaders,
        turnover_leaders: turnoverLeaders,
        whale_archive_top10: whaleArchiveTop10,
        broker_leaderboard: brokerLeaderboard,
        sector_rotation: sectorRotation
      },

      scrips: scripsMap
    };

    // Save sub-file atomically (write to .tmp then rename to prevent read races)
    const jsonPath = path.join(SUBFILES_DIR, `historical_day_${dayOffset}.json`);
    const gzPath = path.join(SUBFILES_DIR, `historical_day_${dayOffset}.json.gz`);
    const jsonTmp = `${jsonPath}.tmp`;
    const gzTmp = `${gzPath}.tmp`;

    const rawJson = JSON.stringify(subfilePayload);
    fs.writeFileSync(jsonTmp, rawJson, 'utf8');
    fs.renameSync(jsonTmp, jsonPath);

    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'), { level: 9 });
    fs.writeFileSync(gzTmp, gzipped);
    fs.renameSync(gzTmp, gzPath);

    _subfilesCache.set(dayOffset, subfilePayload);
    _subfilesCache.set(sessionDate, subfilePayload);

    generatedSubfiles.push({
      day_offset: dayOffset,
      session_date: sessionDate,
      bs_date: bsDateStr,
      day_of_week: dayOfWeek,
      total_scrips: allStockItems.length,
      file_raw_kb: Number((rawJson.length / 1024).toFixed(1)),
      file_gz_kb: Number((gzipped.length / 1024).toFixed(1)),
      file_path: jsonPath,
      file_gz_path: gzPath
    });

    console.log(`[HistoricalSubfiles] ✅ Sub-File ${dayOffset} compiled: ${sessionDate} (${dayOfWeek}) — Raw: ${(rawJson.length / 1024).toFixed(1)} KB | Gz: ${(gzipped.length / 1024).toFixed(1)} KB`);
  }

  // 3. Write Manifest Index File Atomically
  const manifest = {
    file_type: 'HISTORICAL_SUBFILES_INDEX',
    version: '1.0',
    compiled_at: new Date().toISOString(),
    total_subfiles: generatedSubfiles.length,
    calendar_regime: 'Monday–Friday Trading Week (Saturday & Sunday Closed)',
    available_sessions: generatedSubfiles.map(s => s.session_date),
    subfiles: generatedSubfiles,
    days_quick_map: {
      '1D': generatedSubfiles[0]?.session_date || null,
      '2D': generatedSubfiles[1]?.session_date || null,
      '3D': generatedSubfiles[2]?.session_date || null,
      '4D': generatedSubfiles[3]?.session_date || null,
      '5D': generatedSubfiles[4]?.session_date || null,
      '5D_cumulative_context': {
        start_date: generatedSubfiles[generatedSubfiles.length - 1]?.session_date || null,
        end_date: generatedSubfiles[0]?.session_date || null,
        sessions: generatedSubfiles.map(s => s.session_date)
      }
    }
  };

  const rawManifest = JSON.stringify(manifest, null, 2);
  const manifestTmp = `${SUBFILES_INDEX_JSON}.tmp`;
  const gzManifestTmp = `${SUBFILES_INDEX_GZ}.tmp`;

  fs.writeFileSync(manifestTmp, rawManifest, 'utf8');
  fs.renameSync(manifestTmp, SUBFILES_INDEX_JSON);

  fs.writeFileSync(gzManifestTmp, zlib.gzipSync(Buffer.from(rawManifest, 'utf8'), { level: 9 }));
  fs.renameSync(gzManifestTmp, SUBFILES_INDEX_GZ);

  _subfilesIndexCache = manifest;

  // Sync to public/data bundle for 0ms offline APK access
  try {
    syncSubfilesToPublicBundle();
  } catch (syncErr) {
    console.warn('[HistoricalSubfiles] Notice: Public bundle sync skipped:', syncErr.message);
  }

  console.log(`[HistoricalSubfiles] 🚀 Subfiles compilation finished in ${Date.now() - t0}ms. ${generatedSubfiles.length} Sub-files + Index saved to proxy/data/subfiles/ and synced to public/data/`);
  return manifest;
}

/**
 * Copies compiled subfiles and today_static_analytics.json into public/data/
 * so the Android APK / Vite client has direct 0ms local access without network calls.
 */
export function syncSubfilesToPublicBundle() {
  const publicDir = path.resolve(__dirname, '..', '..', 'public', 'data');
  const publicSubfilesDir = path.join(publicDir, 'subfiles');
  if (!fs.existsSync(publicSubfilesDir)) {
    fs.mkdirSync(publicSubfilesDir, { recursive: true });
  }

  // Copy subfiles & index
  if (fs.existsSync(SUBFILES_DIR)) {
    // Copy subfiles & index (exclude .gz files to prevent Android AAPT duplicate resource errors)
    const files = fs.readdirSync(SUBFILES_DIR).filter(f => !f.endsWith('.gz'));
    for (const file of files) {
      const src = path.join(SUBFILES_DIR, file);
      const dest = path.join(publicSubfilesDir, file);
      try {
        fs.copyFileSync(src, dest);
      } catch (_) {}
    }
  }

  // Copy today_static_analytics.json if it exists
  const todayAnalytics = path.join(DATA_DIR, 'today_static_analytics.json');
  if (fs.existsSync(todayAnalytics)) {
    try {
      fs.copyFileSync(todayAnalytics, path.join(publicDir, 'today_static_analytics.json'));
    } catch (_) {}
  }
}

/**
 * Reads a specific historical sub-file (by dayOffset 1..4 or ISO date) with 0ms in-memory cache
 */
export function readHistoricalSubfile(dayOffsetOrDate = 1) {
  if (_subfilesCache.has(dayOffsetOrDate)) {
    return _subfilesCache.get(dayOffsetOrDate);
  }

  // Try loading from disk
  let targetPath = null;
  let targetGzPath = null;

  if (typeof dayOffsetOrDate === 'number') {
    targetPath = path.join(SUBFILES_DIR, `historical_day_${dayOffsetOrDate}.json`);
    targetGzPath = path.join(SUBFILES_DIR, `historical_day_${dayOffsetOrDate}.json.gz`);
  } else {
    // String date e.g. '2026-11-04'
    const index = readHistoricalSubfilesIndex();
    const entry = index?.subfiles?.find(s => s.session_date === dayOffsetOrDate);
    if (entry) {
      targetPath = entry.file_path;
      targetGzPath = entry.file_gz_path;
    }
  }

  if (targetGzPath && fs.existsSync(targetGzPath)) {
    try {
      const gzipped = fs.readFileSync(targetGzPath);
      const unzipped = zlib.gunzipSync(gzipped).toString('utf8');
      const parsed = JSON.parse(unzipped);
      _subfilesCache.set(parsed.day_offset, parsed);
      _subfilesCache.set(parsed.session_date, parsed);
      return parsed;
    } catch (_) {}
  }

  if (targetPath && fs.existsSync(targetPath)) {
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      const parsed = JSON.parse(raw);
      _subfilesCache.set(parsed.day_offset, parsed);
      _subfilesCache.set(parsed.session_date, parsed);
      return parsed;
    } catch (_) {}
  }

  // Cold boot: compile now
  compileHistoricalSubfiles();
  return _subfilesCache.get(dayOffsetOrDate) || null;
}

/**
 * Reads the Sub-Files Index Manifest
 */
export function readHistoricalSubfilesIndex() {
  if (_subfilesIndexCache) return _subfilesIndexCache;

  if (fs.existsSync(SUBFILES_INDEX_GZ)) {
    try {
      const gzipped = fs.readFileSync(SUBFILES_INDEX_GZ);
      const unzipped = zlib.gunzipSync(gzipped).toString('utf8');
      _subfilesIndexCache = JSON.parse(unzipped);
      return _subfilesIndexCache;
    } catch (_) {}
  }

  if (fs.existsSync(SUBFILES_INDEX_JSON)) {
    try {
      const raw = fs.readFileSync(SUBFILES_INDEX_JSON, 'utf8');
      _subfilesIndexCache = JSON.parse(raw);
      return _subfilesIndexCache;
    } catch (_) {}
  }

  return compileHistoricalSubfiles();
}

/**
 * Extracts a scrip's chronological multi-day trajectory across all sub-files (< 1ms)
 */
export function getScrip4DayTrajectory(symbol, maxDays = 5) {
  const cleanSym = String(symbol || '').trim().toUpperCase();
  if (!cleanSym) return null;

  const index = readHistoricalSubfilesIndex();
  if (!index || !Array.isArray(index.subfiles)) return null;

  const numFiles = Math.min(index.subfiles.length, Math.max(1, parseInt(maxDays, 10) || 5));
  const history = [];
  for (let offset = numFiles; offset >= 1; offset--) {
    const subfile = readHistoricalSubfile(offset);
    const scrip = subfile?.scrips?.[cleanSym];
    if (scrip) {
      history.push({
        day_offset: offset,
        session_date: subfile.session_date,
        bs_date: subfile.bs_date,
        day_of_week: subfile.day_of_week,
        quote: scrip.card_1_quote,
        pivots: scrip.card_2_pivot_points,
        oscillators: scrip.card_3_oscillators_risk,
        smart_money: scrip.card_4_broker_smart_flow,
        wyckoff_trap: scrip.card_5_wyckoff_and_dump_guard,
        tactical: scrip.card_6_tactical_execution
      });
    }
  }

  return {
    symbol: cleanSym,
    sessions_count: history.length,
    history
  };
}
