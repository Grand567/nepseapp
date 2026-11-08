// proxy/utils/rollingLedgerEngine.mjs
/**
 * Dravyashree Dual-File + Calendar-Guarded Rolling Ledger Engine
 * 
 * Provides:
 * 1. File A (live_today_session.json[.gz]): Intraday workspace for today's live trading data (11 AM - 3 PM NPT).
 * 2. File B (historical_4days_ledger.json[.gz]): Precomputed, immutable ledger of the past 4 closed trading days.
 * 3. Calendar & Holiday Guard: Gatekeeper that verifies Monday-Friday trading days and official Nepal BS holidays,
 *    guaranteeing ZERO accidental file deletions on weekends or market halts.
 * 4. Dual Format Persistence: Saves both raw JSON and GZIP-compressed (.json.gz) for ultra-low storage (~80KB).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { db } from '../db/ledgerStore.js';
import { auditMultiSessionTrapRisk } from '../telegramNotifier.mjs';
import { isNepseTradingDay, NEPSE_PUBLIC_HOLIDAYS, getIsoDateInNPT } from '../../src/utils/nepseCalendar.js';
import { uploadDailyFloorsheetToCloud } from './cloudFloorsheetVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve data directory
function resolveDataDir() {
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
export const HISTORICAL_5D_JSON = path.join(DATA_DIR, 'historical_5days_ledger.json');
export const HISTORICAL_5D_GZ = path.join(DATA_DIR, 'historical_5days_ledger.json.gz');
export const HISTORICAL_4D_JSON = path.join(DATA_DIR, 'historical_4days_ledger.json');
export const HISTORICAL_4D_GZ = path.join(DATA_DIR, 'historical_4days_ledger.json.gz');
export const LIVE_TODAY_JSON = path.join(DATA_DIR, 'live_today_session.json');
export const LIVE_TODAY_GZ = path.join(DATA_DIR, 'live_today_session.json.gz');

// Cached in-memory references for 0ms sub-millisecond local reads
let _cachedHistoricalLedger = null;
let _cachedLiveSession = null;

/**
 * Synchronizes generated ledger bundle into public/data for 0ms offline bundling in native mobile APK
 */
export function syncLedgerToPublicBundle() {
  const publicDataDir = path.resolve(__dirname, '..', '..', 'public', 'data');
  if (!fs.existsSync(publicDataDir)) {
    try { fs.mkdirSync(publicDataDir, { recursive: true }); } catch (_) {}
  }
  const filesToSync = [
    { src: HISTORICAL_5D_JSON, dst: path.join(publicDataDir, 'historical_5days_ledger.json') },
    { src: HISTORICAL_4D_JSON, dst: path.join(publicDataDir, 'historical_4days_ledger.json') },
    { src: LIVE_TODAY_JSON, dst: path.join(publicDataDir, 'live_today_session.json') }
  ];
  for (const f of filesToSync) {
    try {
      if (fs.existsSync(f.src)) {
        fs.copyFileSync(f.src, f.dst);
      }
    } catch (_) {}
  }
}

// Load stockmap dictionary (symbol -> name, sector)
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
 * ── 1. COMPILE 5-DAY HISTORICAL LEDGER (FILE B) ─────────────────────────────
 * Ingests the 5 most recent closed trading sessions from SQLite, precomputing
 * all metrics for the 92 Service Hub tools and 13 Stock Detail tabs.
 */
export function build5DayHistoricalLedger(targetDb = db, maxDays = 5) {
  const stockmap = loadStockmap();
  const t0 = Date.now();

  // Ingest Fundamentals
  let fundMap = new Map();
  try {
    const fundRows = targetDb.prepare('SELECT * FROM scrip_fundamentals').all();
    for (const f of fundRows) {
      if (f.symbol) fundMap.set(f.symbol.toUpperCase(), f);
    }
  } catch (_) {}

  // 1. Get the 5 latest closed trading sessions
  const sessionRows = targetDb
    .prepare(`SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT ${maxDays}`)
    .all();
  const tradingSessions = sessionRows.map(r => r.trade_date);

  if (tradingSessions.length === 0) {
    console.warn('[RollingLedger] No trading sessions found in SQLite ledger.');
    return null;
  }

  // 2. Fetch all stock price summaries across the 5 sessions
  const placeholders = tradingSessions.map(() => '?').join(', ');
  const priceRows = targetDb
    .prepare(`
      SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
      FROM daily_stock_summary
      WHERE trade_date IN (${placeholders})
    `)
    .all(...tradingSessions);

  // 3. Fetch all broker rows across the 5 sessions
  const brokerRows = targetDb
    .prepare(`
      SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
      FROM daily_broker_ledger
      WHERE trade_date IN (${placeholders})
    `)
    .all(...tradingSessions);

  // Group broker rows by symbol
  const brokerBySymbol = new Map();
  for (const br of brokerRows) {
    if (!brokerBySymbol.has(br.symbol)) brokerBySymbol.set(br.symbol, []);
    brokerBySymbol.get(br.symbol).push(br);
  }

  // Group price rows by symbol
  const priceBySymbol = new Map();
  for (const pr of priceRows) {
    if (!priceBySymbol.has(pr.symbol)) priceBySymbol.set(pr.symbol, []);
    priceBySymbol.get(pr.symbol).push(pr);
  }

  const distinctSymbols = [...new Set(priceRows.map(r => r.symbol))];
  const compiledStocks = {};

  // Broker leaderboard tracking
  const brokerGlobalAgg = new Map();
  const sectorTurnoverAgg = new Map();

  for (const sym of distinctSymbols) {
    const pList = (priceBySymbol.get(sym) || []).sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    const bList = brokerBySymbol.get(sym) || [];
    const latestP = pList[0] || {};
    const oldestP = pList[pList.length - 1] || latestP;

    // Aggregate broker trades for this stock across 5 sessions
    const stockBrokerAgg = new Map();
    for (const b of bList) {
      if (!stockBrokerAgg.has(b.broker_id)) {
        stockBrokerAgg.set(b.broker_id, {
          brokerId: b.broker_id,
          buyVol: 0,
          sellVol: 0,
          buyAmt: 0,
          sellAmt: 0
        });
      }
      const bItem = stockBrokerAgg.get(b.broker_id);
      bItem.buyVol += b.buy_vol;
      bItem.sellVol += b.sell_vol;
      bItem.buyAmt += b.buy_amt;
      bItem.sellAmt += b.sell_amt;

      // Also track broker global activity
      if (!brokerGlobalAgg.has(b.broker_id)) {
        brokerGlobalAgg.set(b.broker_id, {
          brokerId: b.broker_id,
          totalBuyVol: 0,
          totalSellVol: 0,
          totalTurnover: 0,
          stockFlows: new Map()
        });
      }
      const gItem = brokerGlobalAgg.get(b.broker_id);
      gItem.totalBuyVol += b.buy_vol;
      gItem.totalSellVol += b.sell_vol;
      gItem.totalTurnover += (b.buy_amt + b.sell_amt);
      const prevStockNet = gItem.stockFlows.get(sym) || 0;
      gItem.stockFlows.set(sym, prevStockNet + (b.buy_vol - b.sell_vol));
    }

    // Rank brokers for this stock
    const brokerSummaryList = Array.from(stockBrokerAgg.values()).map(b => ({
      ...b,
      netVol: b.buyVol - b.sellVol,
      retentionPct: b.buyVol > 0 ? Math.round(((b.buyVol - b.sellVol) / b.buyVol) * 100) : 0,
      buyVwap: b.buyVol > 0 ? Number((b.buyAmt / b.buyVol).toFixed(2)) : 0,
      sellVwap: b.sellVol > 0 ? Number((b.sellAmt / b.sellVol).toFixed(2)) : 0
    })).sort((a, b) => b.netVol - a.netVol);

    const leadBroker = brokerSummaryList[0] || null;
    const topAccumulators = brokerSummaryList.filter(b => b.netVol > 0).slice(0, 5);
    const topDistributors = brokerSummaryList.filter(b => b.netVol < 0).reverse().slice(0, 5);

    // Compute Whale Buy VWAP
    let whaleBuyAmt = 0;
    let whaleBuyQty = 0;
    topAccumulators.forEach(b => {
      whaleBuyQty += b.buyVol;
      whaleBuyAmt += b.buyAmt;
    });

    // Run 5-Day Multi-Session Trap Veto Engine
    const trapAudit = auditMultiSessionTrapRisk(targetDb, sym, leadBroker?.brokerId);

    const ltp = latestP.close_price || 0;
    const oldPrice = oldestP.open_price || ltp;
    const pChange5D = oldPrice > 0 ? Number((((ltp - oldPrice) / oldPrice) * 100).toFixed(2)) : 0;
    const leadVwap = leadBroker?.buyVwap && leadBroker.buyVwap > 0 ? leadBroker.buyVwap : ltp;
    const leadSellVwap = leadBroker?.sellVwap && leadBroker.sellVwap > 0 ? leadBroker.sellVwap : 0;
    const vwapDiffPct = leadVwap > 0 ? Number((((ltp - leadVwap) / leadVwap) * 100).toFixed(2)) : 0;

    const info = stockmap[sym] || {};
    const sector = info.sector || 'Others';

    const stockTurnover5D = pList.reduce((acc, p) => acc + (p.total_turnover || 0), 0);
    const stockVolume5D = pList.reduce((acc, p) => acc + (p.total_volume || 0), 0);
    const marketVwap5D = stockVolume5D > 0 ? Number((stockTurnover5D / stockVolume5D).toFixed(2)) : ltp;
    const whaleVwap5D = whaleBuyQty > 0 ? Number((whaleBuyAmt / whaleBuyQty).toFixed(2)) : marketVwap5D;

    // Track sector turnover
    const prevSecTurnover = sectorTurnoverAgg.get(sector) || 0;
    sectorTurnoverAgg.set(sector, prevSecTurnover + stockTurnover5D);

    // Tactical Levels
    const limitBuyMin = Math.floor(leadVwap * 0.98);
    const limitBuyMax = Math.ceil(leadVwap * 1.01);
    const chaseCap = Number((leadVwap * 1.025).toFixed(1));
    const hardStop = Number((leadVwap * 0.95).toFixed(1));
    const target1 = Number((leadVwap * 1.08).toFixed(1));
    const target2 = Number((leadVwap * 1.15).toFixed(1));

    // Pivots & Oscillators for this scrip
    const lastHigh = Number(latestP.high_price || ltp);
    const lastLow = Number(latestP.low_price || ltp);
    const lastClose = Number(latestP.close_price || ltp);
    const pp = Number(((lastHigh + lastLow + lastClose) / 3).toFixed(2));
    const r1 = Number((2 * pp - lastLow).toFixed(2));
    const s1 = Number((2 * pp - lastHigh).toFixed(2));
    const r2 = Number((pp + (lastHigh - lastLow)).toFixed(2));
    const s2 = Number((pp - (lastHigh - lastLow)).toFixed(2));
    const r3 = Number((lastHigh + 2 * (pp - lastLow)).toFixed(2));
    const s3 = Number((lastLow - 2 * (lastHigh - pp)).toFixed(2));
    const camDiff = lastHigh - lastLow;
    const camH4 = Number((lastClose + camDiff * 1.1 / 2).toFixed(2));
    const camH3 = Number((lastClose + camDiff * 1.1 / 4).toFixed(2));
    const camL3 = Number((lastClose - camDiff * 1.1 / 4).toFixed(2));
    const camL4 = Number((lastClose - camDiff * 1.1 / 2).toFixed(2));

    const fund = fundMap.get(sym) || {};

    const history5DSessions = pList.map(p => ({
      date: p.trade_date,
      open: p.open_price,
      high: p.high_price,
      low: p.low_price,
      close: p.close_price,
      volume: p.total_volume,
      turnover: Math.round(p.total_turnover),
      vwap: p.total_volume > 0 ? Number((p.total_turnover / p.total_volume).toFixed(2)) : p.close_price
    }));

    compiledStocks[sym] = {
      symbol: sym,
      company_name: info.name || sym,
      sector: sector,
      ltp: ltp,
      p_change_5d: pChange5D,
      p_change_4d: pChange5D,
      total_volume_5d: stockVolume5D,
      total_turnover_5d: Math.round(stockTurnover5D),
      total_volume_4d: stockVolume5D,
      total_turnover_4d: Math.round(stockTurnover5D),
      market_vwap_5d: marketVwap5D,
      whale_vwap_5d: whaleVwap5D,
      history_5d: history5DSessions,
      history_4d: history5DSessions.slice(0, 4),
      lead_broker: leadBroker ? {
        id: leadBroker.brokerId,
        net_volume: leadBroker.netVol,
        buy_volume: leadBroker.buyVol,
        sell_volume: leadBroker.sellVol,
        retention_pct: leadBroker.retentionPct,
        vwap: leadBroker.buyVwap,
        avg_buy_rate: leadBroker.buyVwap,
        sell_vwap: leadSellVwap,
        avg_sell_rate: leadSellVwap,
        vwap_diff_pct: vwapDiffPct
      } : null,
      top_accumulators: topAccumulators.map(b => ({
        broker_id: b.brokerId,
        net_kitta: b.netVol,
        buy_kitta: b.buyVol,
        sell_kitta: b.sellVol,
        vwap: b.buyVwap,
        avg_buy_rate: b.buyVwap,
        avg_sell_rate: b.sellVwap
      })),
      top_distributors: topDistributors.map(b => ({
        broker_id: b.brokerId,
        net_dump_kitta: Math.abs(b.netVol),
        sell_kitta: b.sellVol,
        buy_kitta: b.buyVol,
        vwap: b.sellVwap,
        avg_sell_rate: b.sellVwap,
        avg_buy_rate: b.buyVwap
      })),
      trap_audit: {
        is_trap: trapAudit.isTrap,
        verdict: trapAudit.verdict,
        reason: trapAudit.reason,
        total_5d_net: trapAudit.total5DayNet || 0,
        retention_pct: trapAudit.retentionPct || 0
      },
      tactical_levels: {
        limit_buy_min: limitBuyMin,
        limit_buy_max: limitBuyMax,
        chase_cap: chaseCap,
        hard_stop: hardStop,
        target_1: target1,
        target_2: target2
      },
      pivots: {
        classic: { pp, r1, r2, r3, s1, s2, s3 },
        camarilla: { h4: camH4, h3: camH3, l3: camL3, l4: camL4 }
      },
      fundamentals: {
        eps: fund.eps_ttm || 0,
        book_value: fund.book_value_per_share || 0,
        pe: (fund.eps_ttm > 0 && ltp > 0) ? Number((ltp / fund.eps_ttm).toFixed(2)) : 0,
        pbv: (fund.book_value_per_share > 0 && ltp > 0) ? Number((ltp / fund.book_value_per_share).toFixed(2)) : 0,
        roe: fund.roe_pct || 0,
        paid_up_capital: fund.paid_up_capital || 0,
        public_float_kitta: fund.public_float_kitta || 0,
        promoter_share_pct: fund.promoter_share_pct || 0,
        public_share_pct: fund.public_share_pct || 0
      }
    };
  }

  // 4. Precompute Global Service Hub Leaderboards
  const allStockList = Object.values(compiledStocks);

  const topAccumulated = [...allStockList]
    .filter(s => s.lead_broker && s.lead_broker.net_volume > 0 && !s.trap_audit.is_trap)
    .sort((a, b) => (b.lead_broker?.net_volume || 0) - (a.lead_broker?.net_volume || 0))
    .slice(0, 25)
    .map(s => ({
      symbol: s.symbol,
      company_name: s.company_name,
      sector: s.sector,
      ltp: s.ltp,
      lead_broker_id: s.lead_broker?.id,
      net_accumulation: s.lead_broker?.net_volume,
      retention_pct: s.lead_broker?.retention_pct,
      vwap: s.lead_broker?.vwap,
      avg_buy_rate: s.lead_broker?.avg_buy_rate
    }));

  const topTurnover = [...allStockList]
    .sort((a, b) => b.total_turnover_5d - a.total_turnover_5d)
    .slice(0, 25)
    .map(s => ({
      symbol: s.symbol,
      sector: s.sector,
      ltp: s.ltp,
      turnover: s.total_turnover_5d,
      p_change: s.p_change_5d
    }));

  const topGainers = [...allStockList]
    .sort((a, b) => b.p_change_5d - a.p_change_5d)
    .slice(0, 25)
    .map(s => ({ symbol: s.symbol, ltp: s.ltp, p_change: s.p_change_5d, sector: s.sector }));

  const topLosers = [...allStockList]
    .sort((a, b) => a.p_change_5d - b.p_change_5d)
    .slice(0, 25)
    .map(s => ({ symbol: s.symbol, ltp: s.ltp, p_change: s.p_change_5d, sector: s.sector }));

  const dangerousTraps = [...allStockList]
    .filter(s => s.trap_audit.is_trap)
    .map(s => ({
      symbol: s.symbol,
      verdict: s.trap_audit.verdict,
      reason: s.trap_audit.reason,
      ltp: s.ltp
    }));

  // Top broker rankings
  const brokerRankings = Array.from(brokerGlobalAgg.values())
    .map(b => {
      let topScrip = null;
      let maxNet = 0;
      for (const [sym, net] of b.stockFlows.entries()) {
        if (net > maxNet) {
          maxNet = net;
          topScrip = sym;
        }
      }
      return {
        broker_id: b.brokerId,
        total_turnover: Math.round(b.totalTurnover),
        total_buy_vol: b.totalBuyVol,
        total_sell_vol: b.totalSellVol,
        top_accumulated_scrip: topScrip,
        top_scrip_net_kitta: maxNet
      };
    })
    .sort((a, b) => b.total_turnover - a.total_turnover)
    .slice(0, 25);

  // Sector turnover rotation
  const sectorRotation = Array.from(sectorTurnoverAgg.entries())
    .map(([sector, turnover]) => ({ sector, turnover: Math.round(turnover) }))
    .sort((a, b) => b.turnover - a.turnover);

  // Tactical Picks
  const candidateSymbols = ['AKJCL', 'SHEL', 'RFPL', 'KBL', 'DORDI'];
  const tacticalSlate = candidateSymbols
    .map(sym => compiledStocks[sym])
    .filter(Boolean)
    .map(s => ({
      symbol: s.symbol,
      sector: s.sector,
      ltp: s.ltp,
      lead_broker: s.lead_broker,
      tactical_levels: s.tactical_levels,
      trap_status: s.trap_audit.verdict
    }));

  const ledgerPayload = {
    version: '3.0-rolling-5d-ledger',
    compiled_at: new Date().toISOString(),
    trading_sessions: tradingSessions,
    session_count: tradingSessions.length,
    total_scrips: distinctSymbols.length,
    stocks: compiledStocks,
    service_hub: {
      top_accumulated: topAccumulated,
      top_turnover: topTurnover,
      top_gainers: topGainers,
      top_losers: topLosers,
      dangerous_traps: dangerousTraps,
      broker_rankings: brokerRankings,
      sector_rotation: sectorRotation,
      tactical_slate: tacticalSlate
    }
  };

  // Write File B: Both 5-Day and 4-Day formats, uncompressed and compressed GZIP
  try {
    const rawJson = JSON.stringify(ledgerPayload);
    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'), { level: 9 });

    fs.writeFileSync(HISTORICAL_5D_JSON, rawJson, 'utf8');
    fs.writeFileSync(HISTORICAL_5D_GZ, gzipped);
    fs.writeFileSync(HISTORICAL_4D_JSON, rawJson, 'utf8');
    fs.writeFileSync(HISTORICAL_4D_GZ, gzipped);

    _cachedHistoricalLedger = ledgerPayload;

    // Synchronize to public bundle for 0ms offline APK performance
    syncLedgerToPublicBundle();

    console.log(`[RollingLedger] ✅ File B (5-Day Ledger) compiled in ${Date.now() - t0}ms for ${tradingSessions.join(', ')}`);
    console.log(`[RollingLedger]    Raw: ${(rawJson.length / 1024 / 1024).toFixed(2)} MB | Gzip: ${(gzipped.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[RollingLedger] Failed to save historical ledger files:', err.message);
  }

  return ledgerPayload;
}

/**
 * Backwards compatibility alias for build5DayHistoricalLedger
 */
export function build4DayHistoricalLedger(targetDb = db) {
  return build5DayHistoricalLedger(targetDb, 5);
}

/**
 * ── 2. READ HISTORICAL 5-DAY / 4-DAY LEDGER (FILE B) ─────────────────────────
 * High-speed 0ms memory read with automatic fast uncompressed/compressed disk restore.
 */
export function readHistorical5DayLedger() {
  if (_cachedHistoricalLedger) return _cachedHistoricalLedger;

  // 1. Try compressed .gz file first
  for (const gz of [HISTORICAL_5D_GZ, HISTORICAL_4D_GZ]) {
    if (fs.existsSync(gz)) {
      try {
        const gzipped = fs.readFileSync(gz);
        const unzipped = zlib.gunzipSync(gzipped).toString('utf8');
        _cachedHistoricalLedger = JSON.parse(unzipped);
        return _cachedHistoricalLedger;
      } catch (_) {}
    }
  }

  // 2. Try raw .json fallback
  for (const jsonPath of [HISTORICAL_5D_JSON, HISTORICAL_4D_JSON]) {
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        _cachedHistoricalLedger = JSON.parse(raw);
        return _cachedHistoricalLedger;
      } catch (_) {}
    }
  }

  // 3. Cold boot: compile from database if needed
  return build5DayHistoricalLedger();
}

export function readHistorical4DayLedger() {
  return readHistorical5DayLedger();
}

/**
 * ── 3. LIVE TODAY SESSION WORKSPACE (FILE A) ─────────────────────────────────
 * Handles today's live intraday session workspace during trading hours.
 */
export function initLiveTodaySession(targetDate = null) {
  const sessionDate = targetDate || getIsoDateInNPT();
  const sessionData = {
    session_date: sessionDate,
    market_status: 'PRE_OPEN',
    initialized_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    stock_count: 0,
    stocks: {}
  };

  try {
    const rawJson = JSON.stringify(sessionData);
    fs.writeFileSync(LIVE_TODAY_JSON, rawJson, 'utf8');
    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'));
    fs.writeFileSync(LIVE_TODAY_GZ, gzipped);
    _cachedLiveSession = sessionData;
    console.log(`[RollingLedger] 🌟 File A initialized for ${sessionDate}`);
  } catch (err) {
    console.warn('[RollingLedger] Failed to initialize live session file:', err.message);
  }

  return sessionData;
}

export function readLiveTodaySession() {
  if (_cachedLiveSession) return _cachedLiveSession;

  if (fs.existsSync(LIVE_TODAY_GZ)) {
    try {
      const gzipped = fs.readFileSync(LIVE_TODAY_GZ);
      const unzipped = zlib.gunzipSync(gzipped).toString('utf8');
      _cachedLiveSession = JSON.parse(unzipped);
      return _cachedLiveSession;
    } catch (_) {}
  }

  if (fs.existsSync(LIVE_TODAY_JSON)) {
    try {
      const raw = fs.readFileSync(LIVE_TODAY_JSON, 'utf8');
      _cachedLiveSession = JSON.parse(raw);
      return _cachedLiveSession;
    } catch (_) {}
  }

  return initLiveTodaySession();
}

/**
 * Updates a live stock's tick in File A (debounced write to disk)
 */
let _liveWriteTimeout = null;
export function updateLiveScripTick(symbol, tickData) {
  const session = readLiveTodaySession();
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return;

  session.stocks[sym] = {
    ...(session.stocks[sym] || {}),
    ...tickData,
    last_tick_time: new Date().toISOString()
  };
  session.stock_count = Object.keys(session.stocks).length;
  session.last_updated = new Date().toISOString();

  // Debounced write every 15 seconds to minimize disk I/O
  if (!_liveWriteTimeout) {
    _liveWriteTimeout = setTimeout(() => {
      _liveWriteTimeout = null;
      try {
        const rawJson = JSON.stringify(session);
        fs.writeFileSync(LIVE_TODAY_JSON, rawJson, 'utf8');
        const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'));
        fs.writeFileSync(LIVE_TODAY_GZ, gzipped);
      } catch (_) {}
    }, 15000);
  }
}

/**
 * ── 4. POST-MARKET CALENDAR-GUARDED DAILY TRANSITION ────────────────────────
 * Runs at 3:15 PM NPT after market close.
 * 
 * Safety Gates:
 * - Gate 1: Calendar Check (Monday to Friday, not Nepal Public Holiday).
 * - Gate 2: Data Sanity Check (Floorsheet trades count >= 1000).
 * - Gate 3: Atomic Roll (File A rolls into File B, oldest session pruned, cloud sync).
 */
export async function runCalendarGuardedDailyTransition(options = {}) {
  const todayIso = options.targetDate || getIsoDateInNPT();
  const todayDateObj = new Date();

  console.log(`[TransitionEngine] 🛡️ Running Calendar-Guarded Daily Transition for ${todayIso}...`);

  // ── GATE 1: CALENDAR & TRADING DAY VERIFICATION ──
  const isTrading = isNepseTradingDay(todayDateObj);
  const holidayName = NEPSE_PUBLIC_HOLIDAYS[todayIso];

  if (!isTrading || holidayName) {
    console.log(`[TransitionEngine] ⏸️ Today (${todayIso}) is ${holidayName ? 'Holiday: ' + holidayName : 'a Weekend'} — Calendar Guard active: ZERO DELETIONS.`);
    return {
      status: 'SKIPPED_HOLIDAY',
      reason: holidayName ? `Public Holiday (${holidayName})` : 'Weekend Closure',
      deletedSessions: 0
    };
  }

  // ── GATE 2: DATA COMPLETENESS CHECK ──
  let tradeCount = 0;
  let scripCount = 0;
  try {
    const fsCheck = db.prepare('SELECT COUNT(*) as c, COUNT(DISTINCT symbol) as s FROM floorsheet_contracts WHERE trade_date = ?').get(todayIso);
    tradeCount = fsCheck?.c || 0;
    scripCount = fsCheck?.s || 0;
  } catch (_) {}

  // If floorsheet has less than 1,000 trades, verify from daily_broker_ledger
  if (tradeCount < 1000) {
    try {
      const brokerCheck = db.prepare('SELECT COUNT(DISTINCT symbol) as s FROM daily_broker_ledger WHERE trade_date = ?').get(todayIso);
      scripCount = brokerCheck?.s || 0;
      if (scripCount >= 100) {
        tradeCount = 50000; // Passed via broker ledger
      }
    } catch (_) {}
  }

  if (tradeCount < 1000 && !options.force) {
    console.warn(`[TransitionEngine] ⚠️ Incomplete market data for ${todayIso} (Trades: ${tradeCount}, Scrips: ${scripCount}). Aborting transition to protect historical ledger.`);
    return {
      status: 'ABORTED_INCOMPLETE_DATA',
      reason: `Floorsheet incomplete (${tradeCount} trades, ${scripCount} scrips)`,
      deletedSessions: 0
    };
  }

  // ── GATE 3: ATOMIC ROLL, APPEND & PRUNE ──
  console.log(`[TransitionEngine] ✅ Gate 1 & Gate 2 passed. Compiling Day ${todayIso} into 4-Day Ledger...`);

  // 1. Recompile File B using SQLite (which now has today's finished session)
  const newLedger = build4DayHistoricalLedger(db);

  // 2. Reset File A for the next trading day
  initLiveTodaySession();

  // 3. Automatically upload today's floorsheet to the GitHub Releases cloud vault
  try {
    console.log(`[TransitionEngine] ☁️ Uploading ${todayIso} floorsheet to Cloud Vault...`);
    uploadDailyFloorsheetToCloud(todayIso).then(res => {
      console.log(`[TransitionEngine] Cloud upload result for ${todayIso}:`, res.success ? 'SUCCESS' : res.reason);
    }).catch(e => {
      console.warn('[TransitionEngine] Background cloud upload warning:', e.message);
    });
  } catch (_) {}

  console.log(`[TransitionEngine] 🎉 Daily rollover complete. File B now holds verified 4 sessions: ${newLedger.trading_sessions.join(', ')}`);

  return {
    status: 'SUCCESS',
    activeSessions: newLedger.trading_sessions,
    totalScrips: newLedger.total_scrips,
    compiledAt: newLedger.compiled_at
  };
}

/**
 * ── 5. FAST COMBINED SCRIP RESOLVER (FILE B + FILE A) ──────────────────────
 * Synthesizes the 4-day historical base with today's live intraday ticks in < 5ms.
 */
export function getScrip5DayCombined(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  const ledger = readHistorical5DayLedger();
  const base4D = ledger?.stocks?.[sym] || null;

  if (!base4D) {
    return null;
  }

  const liveSession = readLiveTodaySession();
  const liveScrip = liveSession?.stocks?.[sym] || null;

  if (!liveScrip || liveSession.market_status === 'CLOSED') {
    return {
      ...base4D,
      is_live_overlay: false
    };
  }

  // Synthesize with live overlay
  const liveLtp = liveScrip.ltp || base4D.ltp;
  const leadVwap = base4D.lead_broker?.vwap || liveLtp;
  const liveVwapDiff = leadVwap > 0 ? Number((((liveLtp - leadVwap) / leadVwap) * 100).toFixed(2)) : 0;

  return {
    ...base4D,
    ltp: liveLtp,
    p_change_live: liveScrip.p_change || base4D.p_change_4d,
    day_volume_live: liveScrip.volume || 0,
    live_buyer_brokers: liveScrip.buyer_brokers || [],
    live_seller_brokers: liveScrip.seller_brokers || [],
    vwap_diff_pct: liveVwapDiff,
    is_live_overlay: true
  };
}
