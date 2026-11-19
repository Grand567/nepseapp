// proxy/stockSelectionGuideEngine.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE 4-GATE NEPSE STOCK SELECTION GUIDE ENGINE
 * ───────────────────────────────────────────────────────────────────────────
 * Quantitative implementation of NEPSE_Stock_Selection_Guide.md:
 *   Gate 1: Market Regime Filter (NEPSE Index vs 50 & 200 EMA, 5D trend, circuit)
 *   Gate 2: Accumulation Quality Score (7-factor model out of 10, require ≥ 7)
 *   Gate 3: Ignition Timing Checklist (5 simultaneous triggers on T₀)
 *   Gate 4: Risk Management, Sector Modifiers & Position Sizing
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMultiTimeframeBrokerMetrics } from './trackBSyndicateEngine.mjs';
import { isExcludedInstrument } from './db/signalTrackerStore.js';
import { getBrokerName } from './brokerVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadJsonSafe(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {}
  }
  return null;
}

let cachedStockUniverseMap = null;
function getDefaultStockUniverseMap() {
  if (cachedStockUniverseMap) return cachedStockUniverseMap;
  cachedStockUniverseMap =
    loadJsonSafe([
      path.join(__dirname, 'stockmap.json'),
      path.join(process.cwd(), 'proxy', 'stockmap.json'),
    ]) || {};
  return cachedStockUniverseMap;
}

let cachedFundamentalsJson = null;
function getDefaultFundamentalsMap() {
  if (cachedFundamentalsJson) return cachedFundamentalsJson;
  const raw = loadJsonSafe([
    path.join(ROOT_DIR, 'src', 'data', 'nepse_fundamentals_latest.json'),
    path.join(process.cwd(), 'src', 'data', 'nepse_fundamentals_latest.json'),
  ]);
  const map = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (k && v) map[k.toUpperCase().trim()] = v;
    }
  }
  cachedFundamentalsJson = map;
  return cachedFundamentalsJson;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Computes standard Exponential Moving Average for chronologically ordered closes.
 */
export function computeEma(closes = [], period = 50) {
  if (!Array.isArray(closes) || closes.length === 0) return 0;
  const effectivePeriod = Math.max(1, Math.min(period, closes.length));
  const k = 2 / (effectivePeriod + 1);
  let ema = closes.slice(0, effectivePeriod).reduce((s, c) => s + Number(c || 0), 0) / effectivePeriod;
  for (let i = effectivePeriod; i < closes.length; i++) {
    ema = Number(closes[i] || 0) * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Fetches latest NEPSE index daily candles from Chukul UDF API when online.
 * Disabled automatically during automated tests to ensure deterministic runs.
 */
export async function fetchLiveNepseIndexHistory({ timeoutMs = 4000 } = {}) {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';
  if (isTestEnv && process.env.TEST_LIVE_NEPSE_FETCH !== 'true') {
    return [];
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const toTs = Math.floor(Date.now() / 1000) + 86400;
    const fromTs = toTs - 400 * 86400;
    const res = await fetch(
      `https://chukul.com/api/data/historydata/data/?symbol=NEPSE&resolution=1D&from=${fromTs}&to=${toTs}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.t) || !Array.isArray(data.c)) return [];

    const nepalOffsetMs = 5.75 * 3600 * 1000;
    const out = [];
    for (let i = 0; i < data.t.length; i++) {
      const close = Number(data.c[i] || 0);
      if (close <= 0) continue;
      const date = new Date(Number(data.t[i]) * 1000 + nepalOffsetMs).toISOString().slice(0, 10);
      const prevClose = i > 0 ? Number(data.c[i - 1] || close) : Number(data.o?.[i] || close);
      const change = +(close - prevClose).toFixed(2);
      const pChange = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
      out.push({ date, close, change, pChange });
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * Builds chronological NEPSE Index close series up to targetDate by combining:
 *   1. Authentic 681-session baseline (src/data/nepse_index_baseline.json)
 *   2. Optional live fetched history (Chukul UDF)
 *   3. last_known_market.json NEPSE Index snapshot
 *   4. Return-linked equity bridge from SQLite daily_stock_summary for any uncovered dates
 */
export function buildNepseIndexSeries({
  db = null,
  targetDate = null,
  liveHistory = [],
  liveQuote = null,
  baselinePath = null,
  lastKnownMarketPath = null,
  stockUniverseMap = null,
} = {}) {
  const resolvedBaseline =
    loadJsonSafe([
      baselinePath,
      path.join(ROOT_DIR, 'src', 'data', 'nepse_index_baseline.json'),
      path.join(process.cwd(), 'src', 'data', 'nepse_index_baseline.json'),
    ]) || [];

  const byDate = new Map();
  for (const row of resolvedBaseline) {
    if (!row?.date || !(Number(row.close) > 0)) continue;
    if (targetDate && row.date > targetDate) continue;
    byDate.set(row.date, {
      date: row.date,
      close: Number(row.close),
      pChange: null,
      source: 'baseline',
    });
  }

  if (Array.isArray(liveHistory)) {
    for (const row of liveHistory) {
      if (!row?.date || !(Number(row.close) > 0)) continue;
      if (targetDate && row.date > targetDate) continue;
      byDate.set(row.date, {
        date: row.date,
        close: Number(row.close),
        pChange: row.pChange ?? null,
        source: 'live_history',
      });
    }
  }

  // Merge last_known_market.json snapshot if valid
  const lkm = loadJsonSafe([
    lastKnownMarketPath,
    path.join(__dirname, 'data', 'last_known_market.json'),
    path.join(process.cwd(), 'proxy', 'data', 'last_known_market.json'),
  ]);
  const lkmNep = lkm?.indices?.find((x) => x.index === 'NEPSE Index');
  if (lkmNep && Number(lkmNep.currentValue || lkmNep.close) > 0 && lkmNep.generatedTime) {
    const lkmDate = String(lkmNep.generatedTime).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(lkmDate) && (!targetDate || lkmDate <= targetDate)) {
      byDate.set(lkmDate, {
        date: lkmDate,
        close: Number(lkmNep.currentValue || lkmNep.close),
        pChange: Number(lkmNep.perChange ?? 0),
        change: Number(lkmNep.change ?? 0),
        source: 'last_known_market',
      });
    }
  }

  // Overlay explicit live quote if passed
  if (liveQuote && Number(liveQuote.value || liveQuote.close) > 0) {
    const qDate = String(liveQuote.date || targetDate || '').slice(0, 10);
    if (qDate && (!targetDate || qDate <= targetDate)) {
      byDate.set(qDate, {
        date: qDate,
        close: Number(liveQuote.value || liveQuote.close),
        pChange: liveQuote.pChange ?? null,
        change: liveQuote.change ?? null,
        source: 'live_quote',
      });
    }
  }

  // Fill any uncovered SQLite trading sessions up to targetDate using turnover-weighted equity returns
  if (db) {
    const stockMap = stockUniverseMap || getDefaultStockUniverseMap();
    const sortedKnownDates = Array.from(byDate.keys()).sort();
    const lastKnownDate = sortedKnownDates[sortedKnownDates.length - 1] || '1900-01-01';
    const sqlDates = db
      .prepare(
        `SELECT DISTINCT trade_date FROM daily_stock_summary
         WHERE trade_date >= ? ${targetDate ? 'AND trade_date <= ?' : ''}
         ORDER BY trade_date ASC`
      )
      .all(...(targetDate ? [lastKnownDate, targetDate] : [lastKnownDate]))
      .map((r) => r.trade_date);

    let prevCloseRef = sortedKnownDates.length > 0 ? byDate.get(lastKnownDate).close : null;
    for (let i = 1; i < sqlDates.length; i++) {
      const prevD = sqlDates[i - 1];
      const curD = sqlDates[i];
      if (byDate.has(curD)) {
        prevCloseRef = byDate.get(curD).close;
        continue;
      }
      if (!prevCloseRef || prevCloseRef <= 0) continue;

      const pairs = db
        .prepare(
          `SELECT a.symbol, a.close_price AS c0, b.close_price AS c1, b.total_turnover AS tv
           FROM daily_stock_summary a
           JOIN daily_stock_summary b ON a.symbol = b.symbol
           WHERE a.trade_date = ? AND b.trade_date = ? AND a.close_price > 0 AND b.close_price > 0`
        )
        .all(prevD, curD);

      let wSum = 0;
      let wTot = 0;
      for (const p of pairs) {
        const sec = stockMap[p.symbol]?.sector || '';
        if (isExcludedInstrument(p.symbol, sec)) continue;
        const ret = (p.c1 - p.c0) / p.c0;
        if (Math.abs(ret) <= 0.155) {
          const w = Math.max(1, Number(p.tv || 1));
          wSum += ret * w;
          wTot += w;
        }
      }
      const mktRet = wTot > 0 ? wSum / wTot : 0;
      const bridgedClose = +(prevCloseRef * (1 + mktRet)).toFixed(2);
      const chg = +(bridgedClose - prevCloseRef).toFixed(2);
      const pChg = +(mktRet * 100).toFixed(2);
      byDate.set(curD, {
        date: curD,
        close: bridgedClose,
        change: chg,
        pChange: pChg,
        source: 'equity_return_bridge',
      });
      prevCloseRef = bridgedClose;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Gate 1: Market Regime Filter (Mandatory — No Override)
 * Rules from NEPSE_Stock_Selection_Guide.md:
 *   1.1 Close > 50-day EMA
 *   1.2 Close > 200-day EMA
 *   1.3 5-day return > -3.0%
 *   1.4 No -4% intraday circuit panic day today (dayChangePct > -4.0%)
 */
export function evaluateMarketRegimeGate({
  indexSeries = null,
  liveHistory = [],
  liveQuote = null,
  db = null,
  targetDate = null,
  baselinePath = null,
  lastKnownMarketPath = null,
  stockUniverseMap = null,
} = {}) {
  const series =
    Array.isArray(indexSeries) && indexSeries.length > 0
      ? [...indexSeries].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      : buildNepseIndexSeries({
          db,
          targetDate,
          liveHistory,
          liveQuote,
          baselinePath,
          lastKnownMarketPath,
          stockUniverseMap,
        });

  if (!series || series.length < 2) {
    return {
      gate1Pass: false,
      regime: 'BEAR',
      regimeLabel: '🔴 BEAR / UNCERTAIN',
      positionScale: 0,
      close: 0,
      ema50: 0,
      ema200: 0,
      fiveDayReturnPct: 0,
      dayChangePct: 0,
      dayChangePts: 0,
      above50: false,
      above200: false,
      noFreefall: false,
      noCircuitPanic: false,
      asOfDate: targetDate || '',
      source: 'unavailable',
      failReasons: ['Insufficient NEPSE index history to confirm bull regime'],
    };
  }

  const closes = series.map((r) => Number(r.close || 0)).filter((c) => c > 0);
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const latestClose = Number(latest.close || 0);
  const ema50 = +computeEma(closes, 50).toFixed(2);
  const ema200 = +computeEma(closes, 200).toFixed(2);

  const idx5Ago = Math.max(0, closes.length - 6);
  const base5Ago = closes[idx5Ago] || latestClose;
  const fiveDayReturnPct = base5Ago > 0 ? +(((latestClose - base5Ago) / base5Ago) * 100).toFixed(2) : 0;

  const dayChangePts =
    latest.change !== undefined && latest.change !== null
      ? Number(latest.change)
      : +(latestClose - Number(prev.close || latestClose)).toFixed(2);
  const dayChangePct =
    latest.pChange !== undefined && latest.pChange !== null
      ? Number(latest.pChange)
      : Number(prev.close) > 0
        ? +(((latestClose - Number(prev.close)) / Number(prev.close)) * 100).toFixed(2)
        : 0;

  const above50 = latestClose > ema50;
  const above200 = latestClose > ema200;
  const noFreefall = fiveDayReturnPct > -3.0;
  const noCircuitPanic = dayChangePct > -4.0;

  const failReasons = [];
  if (!above50) failReasons.push(`NEPSE (${latestClose.toFixed(1)}) below 50 EMA (${ema50.toFixed(1)})`);
  if (!above200) failReasons.push(`NEPSE (${latestClose.toFixed(1)}) below 200 EMA (${ema200.toFixed(1)})`);
  if (!noFreefall) failReasons.push(`5D Index return (${fiveDayReturnPct}%) ≤ -3.0%`);
  if (!noCircuitPanic) failReasons.push(`Index circuit panic (${dayChangePct}% ≤ -4.0%)`);

  let gate1Pass = true;
  let regime = 'STRONG_BULL';
  let regimeLabel = '🟢 STRONG BULL';
  let positionScale = 1.0;

  if (!above50 || !above200) {
    gate1Pass = false;
    regime = 'BEAR';
    regimeLabel = '🔴 BEAR / UNCERTAIN';
    positionScale = 0;
  } else if (!noFreefall || !noCircuitPanic) {
    gate1Pass = true;
    regime = 'CAUTIOUS_BULL';
    regimeLabel = '🟡 CAUTIOUS BULL (50% Size)';
    positionScale = 0.5;
  }

  return {
    gate1Pass,
    regime,
    regimeLabel,
    positionScale,
    close: +latestClose.toFixed(2),
    ema50,
    ema200,
    fiveDayReturnPct,
    dayChangePct,
    dayChangePts,
    above50,
    above200,
    noFreefall,
    noCircuitPanic,
    asOfDate: latest.date || targetDate || '',
    source: latest.source || 'baseline',
    failReasons,
  };
}

/**
 * Sector-Specific Adjustments from NEPSE_Stock_Selection_Guide.md
 */
export function getSectorPolicy(sector = '') {
  const sec = String(sector || '');
  if (/Commercial Bank/i.test(sec)) {
    return {
      sectorCategory: 'BFI',
      minAsymmetry: 1.5,
      maxVdu: 0.6,
      stopLossPct: 2.5,
      targetPct: 7.0,
      maxPortfolioPct: 5.0,
      isQualitySector: true,
    };
  }
  if (/Hydro/i.test(sec)) {
    return {
      sectorCategory: 'HYDRO',
      minAsymmetry: 1.35,
      maxVdu: 0.7,
      stopLossPct: 4.0,
      targetPct: 7.0,
      maxPortfolioPct: 5.0,
      isQualitySector: true,
    };
  }
  if (/Insurance/i.test(sec)) {
    return {
      sectorCategory: 'INSURANCE',
      minAsymmetry: 1.35,
      maxVdu: 0.6,
      stopLossPct: 3.0,
      targetPct: 7.0,
      maxPortfolioPct: 3.0,
      isQualitySector: true,
    };
  }
  if (/Microfinance/i.test(sec)) {
    return {
      sectorCategory: 'MICROFINANCE',
      minAsymmetry: 1.8,
      maxVdu: 0.6,
      stopLossPct: 3.0,
      targetPct: 7.0,
      maxPortfolioPct: 5.0,
      isQualitySector: false,
    };
  }
  if (/Development Bank/i.test(sec)) {
    return {
      sectorCategory: 'DEV_BANK',
      minAsymmetry: 1.35,
      maxVdu: 0.6,
      stopLossPct: 3.0,
      targetPct: 7.0,
      maxPortfolioPct: 5.0,
      isQualitySector: true,
    };
  }
  return {
    sectorCategory: 'OTHER',
    minAsymmetry: 1.35,
    maxVdu: 0.6,
    stopLossPct: 3.0,
    targetPct: 7.0,
    maxPortfolioPct: 5.0,
    isQualitySector: false,
  };
}

function loadMergedFundamentals(db, symbol, jsonFundMap, stockMap, targetDate = null) {
  let dbFund = null;
  try {
    dbFund = db
      .prepare(
        `SELECT symbol, sector, eps_ttm, book_value_per_share, roe_pct, npl_pct, car_pct, promoter_unlock_date
         FROM scrip_fundamentals WHERE UPPER(symbol) = ? LIMIT 1`
      )
      .get(symbol);
  } catch (_) {}

  const jf = jsonFundMap?.[symbol] || null;
  const sm = stockMap?.[symbol] || null;

  const sector =
    (sm?.sector && !/^(Equities|Others)$/i.test(sm.sector) ? sm.sector : null) ||
    dbFund?.sector ||
    jf?.sector ||
    sm?.sector ||
    'Others';

  return {
    symbol,
    name: sm?.name || jf?.name || symbol,
    sector,
    eps_ttm: dbFund?.eps_ttm ?? jf?.eps ?? null,
    book_value_per_share: dbFund?.book_value_per_share ?? jf?.bookValue ?? jf?.bvps ?? null,
    roe_pct: dbFund?.roe_pct ?? jf?.roePct ?? jf?.roe ?? null,
    npl_pct: dbFund?.npl_pct ?? null,
    car_pct: dbFund?.car_pct ?? null,
    promoter_unlock_date: dbFund?.promoter_unlock_date ?? jf?.promoterUnlockDate ?? null,
    targetDate,
  };
}

/**
 * Gate 2: Accumulation Quality Score (7 Factors, Max 10 Points, Require ≥ 7)
 * Enforces BFI CAR/NPL, Microfinance ROE/NPL, Promoter Lock-In Cliff, and Sector Asymmetry floors.
 */
export function scoreGate2AccumulationQuality({
  symbol = '',
  sector = 'Others',
  ltp = 0,
  asymmetry = 0,
  retention5D = 0,
  retention10D = 0,
  leadNetVol = 0,
  top5BuyerRetentions = [],
  fundamentals = null,
  targetDate = null,
} = {}) {
  const policy = getSectorPolicy(sector);
  const f = fundamentals || {};
  const eps = f.eps_ttm !== null && f.eps_ttm !== undefined ? Number(f.eps_ttm) : null;
  const roe = f.roe_pct !== null && f.roe_pct !== undefined ? Number(f.roe_pct) : null;
  const bvps = f.book_value_per_share !== null && f.book_value_per_share !== undefined ? Number(f.book_value_per_share) : null;
  const npl = f.npl_pct !== null && f.npl_pct !== undefined ? Number(f.npl_pct) : null;
  const car = f.car_pct !== null && f.car_pct !== undefined ? Number(f.car_pct) : null;
  const pe = eps !== null && eps > 0 && ltp > 0 ? +(ltp / eps).toFixed(2) : null;

  const sectorVetoes = [];
  const fundamentalVetoes = [];

  // Asymmetry sector floor
  if (asymmetry < policy.minAsymmetry) {
    sectorVetoes.push(`Asymmetry ${asymmetry.toFixed(2)}x < ${policy.minAsymmetry.toFixed(2)}x (${policy.sectorCategory} min)`);
  }

  // BFI NRB Capital & Asset Health gates
  if (policy.sectorCategory === 'BFI') {
    if (car !== null && car > 0 && car < 11.0) {
      fundamentalVetoes.push(`CAR ${car}% < 11.0% NRB Class-A minimum`);
    }
    if (npl !== null && npl >= 5.0) {
      fundamentalVetoes.push(`NPL ${npl}% ≥ 5.0% ceiling`);
    }
  }

  // Microfinance gates
  if (policy.sectorCategory === 'MICROFINANCE') {
    if (roe !== null && roe <= 10.0) {
      fundamentalVetoes.push(`Microfinance ROE ${roe}% ≤ 10.0%`);
    }
    if (npl !== null && npl >= 5.0) {
      fundamentalVetoes.push(`Microfinance NPL ${npl}% ≥ 5.0%`);
    }
  }

  // Promoter Lock-In Cliff (< 120 days)
  if (f.promoter_unlock_date && targetDate) {
    const tRef = new Date(targetDate).getTime();
    const tUnlock = new Date(f.promoter_unlock_date).getTime();
    if (!Number.isNaN(tRef) && !Number.isNaN(tUnlock)) {
      const daysUntil = (tUnlock - tRef) / 86400000;
      if (daysUntil > 0 && daysUntil < 120) {
        fundamentalVetoes.push(`Promoter lock-in unlocks in ${Math.round(daysUntil)}d (< 120d supply cliff)`);
      }
    }
  }

  // 7 weighted scoring factors (Total = 10)
  const ptsAsymmetry = asymmetry >= 2.0 ? 3 : asymmetry >= 1.5 ? 2 : asymmetry >= 1.35 ? 1 : 0;
  const ptsRet5D = retention5D >= 90 ? 2 : retention5D >= 78 ? 1 : 0;
  const ptsRet10D = retention10D >= 85 ? 1 : 0;
  const ptsLeadSize = leadNetVol >= 20000 ? 1 : 0;
  const alignedCount = Array.isArray(top5BuyerRetentions)
    ? top5BuyerRetentions.filter((r) => Number(r) >= 70).length
    : 0;
  const ptsAlignedBrokers = alignedCount >= 2 ? 1 : 0;
  const ptsSector = policy.isQualitySector ? 1 : 0;
  const ptsFundamentalFloor =
    pe !== null && pe < 40 && ((roe !== null && roe > 8) || (bvps !== null && bvps > 0 && ltp < bvps * 1.5))
      ? 1
      : 0;

  const gate2Score =
    ptsAsymmetry + ptsRet5D + ptsRet10D + ptsLeadSize + ptsAlignedBrokers + ptsSector + ptsFundamentalFloor;

  const hasHardVeto = sectorVetoes.length > 0 || fundamentalVetoes.length > 0;
  const passGate2 = !hasHardVeto && gate2Score >= 7;

  const tierLabel = gate2Score >= 8 ? '🟢 High-Quality' : gate2Score === 7 ? '🟡 Acceptable (Half Size)' : '🟠 Weak';
  const sizeMultiplier = gate2Score === 7 ? 0.5 : gate2Score >= 8 ? 1.0 : 0;

  return {
    symbol,
    gate2Score,
    passGate2,
    tierLabel,
    sizeMultiplier,
    pe,
    roe,
    bvps,
    sectorVetoes,
    fundamentalVetoes,
    breakdown: {
      asymmetry: ptsAsymmetry,
      retention5D: ptsRet5D,
      retention10D: ptsRet10D,
      leadSize: ptsLeadSize,
      alignedBrokers: ptsAlignedBrokers,
      sectorQuality: ptsSector,
      fundamentalFloor: ptsFundamentalFloor,
    },
  };
}

/**
 * Date-aware Anti-Dump & Institutional Exit Guard for T₀ (targetDate).
 * Checks:
 *   1. Lead 5D accumulator net selling > 500 kitta today
 *   2. Any 10D past accumulator (>= 5,000 net kitta prior to T0) dumping > 3,000 kitta net today
 *   3. Single seller broker dominating > 15% of today's sell volume unabsorbed by top 3 buyers
 */
function checkDateAwareAntiDumpGuards({ db, symbol, targetDate, leadBrokerId }) {
  const leadTodayRow = leadBrokerId
    ? db
        .prepare(
          `SELECT buy_vol, sell_vol FROM daily_broker_ledger
           WHERE symbol = ? AND broker_id = ? AND trade_date = ?`
        )
        .get(symbol, leadBrokerId, targetDate)
    : null;

  const leadNetToday = leadTodayRow ? Number(leadTodayRow.buy_vol || 0) - Number(leadTodayRow.sell_vol || 0) : 0;
  const leadDumpToday = leadNetToday < -500;

  // Past 10D prior accumulators (trade_date < targetDate)
  const priorDates10 = db
    .prepare(
      `SELECT DISTINCT trade_date FROM daily_broker_ledger
       WHERE symbol = ? AND trade_date < ?
       ORDER BY trade_date DESC LIMIT 10`
    )
    .all(symbol, targetDate)
    .map((r) => r.trade_date);

  let dematDumpTrap = false;
  let dematDumpReason = null;

  if (priorDates10.length > 0) {
    const ph = priorDates10.map(() => '?').join(',');
    const pastAccs = db
      .prepare(
        `SELECT broker_id, SUM(buy_vol - sell_vol) AS net_acc
         FROM daily_broker_ledger
         WHERE symbol = ? AND trade_date IN (${ph})
         GROUP BY broker_id
         HAVING net_acc >= 5000`
      )
      .all(symbol, ...priorDates10);

    for (const acc of pastAccs) {
      const tRow = db
        .prepare(
          `SELECT buy_vol, sell_vol FROM daily_broker_ledger
           WHERE symbol = ? AND trade_date = ? AND broker_id = ?`
        )
        .get(symbol, targetDate, acc.broker_id);
      const netSellToday = tRow ? Number(tRow.sell_vol || 0) - Number(tRow.buy_vol || 0) : 0;
      if (netSellToday > 3000) {
        dematDumpTrap = true;
        dematDumpReason = `Broker #${acc.broker_id} (prior net +${acc.net_acc.toLocaleString()}) dumped -${netSellToday.toLocaleString()} kitta`;
        break;
      }
    }
  }

  // Single seller > 15% domination without offsetting accumulator absorption
  const todayRows = db
    .prepare(
      `SELECT broker_id, buy_vol, sell_vol FROM daily_broker_ledger
       WHERE symbol = ? AND trade_date = ?`
    )
    .all(symbol, targetDate);

  let singleSellerDominant = false;
  if (todayRows.length > 0) {
    const totSell = todayRows.reduce((s, r) => s + Number(r.sell_vol || 0), 0);
    if (totSell > 0) {
      const topSeller = [...todayRows].sort((a, b) => Number(b.sell_vol || 0) - Number(a.sell_vol || 0))[0];
      const topSellerSharePct = (Number(topSeller.sell_vol || 0) / totSell) * 100;
      const topSellerNetSell = Number(topSeller.sell_vol || 0) - Number(topSeller.buy_vol || 0);
      const top3BuyNet = [...todayRows]
        .sort((a, b) => Number(b.buy_vol || 0) - Number(a.buy_vol || 0))
        .slice(0, 3)
        .reduce((s, r) => s + Math.max(0, Number(r.buy_vol || 0) - Number(r.sell_vol || 0)), 0);

      if (topSellerSharePct > 15 && topSellerNetSell > 1500 && top3BuyNet < topSellerNetSell * 0.5) {
        singleSellerDominant = true;
      }
    }
  }

  const dumpGuardPass = !leadDumpToday && !dematDumpTrap && !singleSellerDominant;
  return {
    dumpGuardPass,
    leadDumpToday,
    dematDumpTrap,
    dematDumpReason,
    singleSellerDominant,
  };
}

/**
 * Gate 3: Ignition Timing Checklist (All 5 Must Be Met Simultaneously on T₀)
 */
export function evaluateGate3IgnitionTiming({
  db,
  symbol,
  targetDate,
  histBars = [],
  operatorVwap5D = 0,
  leadBrokerId = null,
  sectorPolicy = null,
} = {}) {
  const policy = sectorPolicy || getSectorPolicy();
  const emptyResult = {
    triggerCount: 0,
    passGate3: false,
    testShotFound: false,
    testShotDate: null,
    testShotVol: 0,
    testShotRvol: 0,
    vduPass: false,
    vduRatio: 1,
    rvolToday: 1,
    spreadPass: false,
    spreadPct: 99,
    isIdealCompression: false,
    isNr7: false,
    costFloorPass: false,
    costDistPct: 99,
    vwap5D: operatorVwap5D,
    dumpGuardPass: false,
    leadDumpToday: false,
    dematDumpTrap: false,
    dematDumpReason: null,
    singleSellerDominant: false,
  };

  if (!Array.isArray(histBars) || histBars.length < 10) {
    return emptyResult;
  }

  const bLen = histBars.length - 1;
  const curBar = histBars[bLen];
  const curClose = Number(curBar.close_price || 0);
  const curHigh = Number(curBar.high_price || curClose);
  const curLow = Number(curBar.low_price || curClose);
  const curVol = Number(curBar.total_volume || 0);
  if (curClose <= 0 || curVol <= 0) return emptyResult;

  const prior20 = histBars.slice(Math.max(0, bLen - 20), bLen);
  const avgVol20Today = prior20.reduce((s, r) => s + Number(r.total_volume || 0), 0) / Math.max(1, prior20.length);

  // Trigger 1: Test Shot Completed 2–4 sessions ago (bar indices bLen-4 .. bLen-2)
  // Pick the highest-volume qualifying Test Shot to anchor VDU faithfully without look-ahead bias
  let testShotFound = false;
  let testShotVol = 0;
  let testShotDate = null;
  let testShotRvol = 0;

  for (let i = Math.max(1, bLen - 4); i <= bLen - 2; i++) {
    const bar = histBars[i];
    const barVol = Number(bar.total_volume || 0);
    const barPrior = histBars.slice(Math.max(0, i - 20), i);
    const barAvgVol = barPrior.reduce((s, r) => s + Number(r.total_volume || 0), 0) / Math.max(1, barPrior.length);
    const barRvol = barAvgVol > 0 ? barVol / barAvgVol : 0;
    const prevClose = Number(histBars[i - 1].close_price || 0);
    const barChgPct = prevClose > 0 ? ((Number(bar.close_price || 0) - prevClose) / prevClose) * 100 : 0;

    if (barRvol >= 1.4 && barChgPct >= -2.0 && barChgPct <= 5.0) {
      if (!testShotFound || barVol > testShotVol) {
        testShotFound = true;
        testShotVol = barVol;
        testShotDate = bar.trade_date || null;
        testShotRvol = +barRvol.toFixed(2);
      }
    }
  }

  // Trigger 2: Volume Dry-Up on T₀
  const rvolToday = avgVol20Today > 0 ? curVol / avgVol20Today : 1;
  const vduRatio = testShotVol > 0 ? curVol / testShotVol : rvolToday;
  const vduPass = vduRatio <= policy.maxVdu && rvolToday <= 0.8;

  // Trigger 3: Volatility Compression & NR7 check
  const spreadPct = curClose > 0 ? ((curHigh - curLow) / curClose) * 100 : 99;
  const spreadPass = spreadPct <= 3.2;
  const isIdealCompression = spreadPct <= 2.5;
  const prior6Ranges = histBars.slice(Math.max(0, bLen - 6), bLen).map((b) => Number(b.high_price || 0) - Number(b.low_price || 0));
  const curRange = curHigh - curLow;
  const isNr7 = prior6Ranges.length === 6 && curRange > 0 && prior6Ranges.every((r) => r > 0) && curRange <= Math.min(...prior6Ranges) + 1e-6;

  // Trigger 4: Price at Operator's Cost Floor (5D Buyer VWAP [-1.5%, +2.0%])
  const costDistPct = operatorVwap5D > 0 ? ((curClose - operatorVwap5D) / operatorVwap5D) * 100 : 99;
  const costFloorPass = costDistPct >= -1.5 && costDistPct <= 2.0;

  // Trigger 5: Anti-Dump Guards CLEAN on T₀
  const dumpAudit = db
    ? checkDateAwareAntiDumpGuards({ db, symbol, targetDate, leadBrokerId })
    : { dumpGuardPass: true, leadDumpToday: false, dematDumpTrap: false, dematDumpReason: null, singleSellerDominant: false };

  const triggerCount = [testShotFound, vduPass, spreadPass, costFloorPass, dumpAudit.dumpGuardPass].filter(Boolean).length;

  return {
    triggerCount,
    passGate3: triggerCount === 5,
    testShotFound,
    testShotDate,
    testShotVol,
    testShotRvol,
    vduPass,
    vduRatio: +vduRatio.toFixed(2),
    rvolToday: +rvolToday.toFixed(2),
    spreadPass,
    spreadPct: +spreadPct.toFixed(2),
    isIdealCompression,
    isNr7,
    costFloorPass,
    costDistPct: +costDistPct.toFixed(2),
    vwap5D: +Number(operatorVwap5D || 0).toFixed(1),
    dumpGuardPass: dumpAudit.dumpGuardPass,
    leadDumpToday: dumpAudit.leadDumpToday,
    dematDumpTrap: dumpAudit.dematDumpTrap,
    dematDumpReason: dumpAudit.dematDumpReason,
    singleSellerDominant: dumpAudit.singleSellerDominant,
  };
}

/**
 * Gate 4: Risk Management & Position Sizing Plan
 */
export function computeGate4RiskPlan({ ltp = 0, gate1 = {}, gate2 = {}, sectorPolicy = null } = {}) {
  const policy = sectorPolicy || getSectorPolicy();
  const slPct = policy.stopLossPct || 3.0;
  const tgtPct = policy.targetPct || 7.0;

  const entryLimitMax = +(ltp * 1.01).toFixed(1);
  const gapAbortPrice = +(ltp * 1.03).toFixed(1);
  const stopLoss = +(ltp * (1 - slPct / 100)).toFixed(1);
  const target = +(ltp * (1 + tgtPct / 100)).toFixed(1);
  const breakevenTriggerPrice = +(ltp * 1.05).toFixed(1);

  const scale1 = Number(gate1?.positionScale ?? 1.0);
  const scale2 = Number(gate2?.sizeMultiplier ?? 1.0);
  const maxPortfolioPct = +(policy.maxPortfolioPct * scale1 * scale2).toFixed(2);

  // Per Rs. 1,00,000 capital tranche scaled by Gate 1 & Gate 2 size multipliers and sector cap
  const allocationRatio = maxPortfolioPct / policy.maxPortfolioPct;
  const capitalOutlayRs = Math.round(100000 * allocationRatio);
  const sharesPer1Lakh = ltp > 0 ? Math.max(1, Math.floor(capitalOutlayRs / ltp)) : 0;
  const riskPerShare = Math.max(0.5, +(ltp - stopLoss).toFixed(2));
  const maxRiskRsPer1Lakh = Math.round(sharesPer1Lakh * riskPerShare);

  return {
    entryLimitMax,
    gapAbortPrice,
    stopLoss,
    stopLossPct: slPct,
    target,
    targetPct: tgtPct,
    breakevenTriggerPrice,
    timeStopDays: 5,
    maxPortfolioPct,
    sharesPer1Lakh,
    riskPerShare,
    maxRiskRsPer1Lakh,
  };
}

/**
 * Runs the full 4-Gate NEPSE Stock Selection Guide against a SQLite ledger DB.
 */
export function evaluateDailySelectionGuide({
  db,
  targetDate = null,
  nepseIndexHistory = null,
  liveIndexHistory = [],
  liveIndexQuote = null,
  stockUniverseMap = null,
  fundamentalsMap = null,
  baselinePath = null,
  lastKnownMarketPath = null,
  forceScanOnBear = false,
} = {}) {
  if (!db) {
    return { success: false, error: 'Database handle missing' };
  }

  const stockMap = stockUniverseMap || getDefaultStockUniverseMap();
  const fundMap = fundamentalsMap || getDefaultFundamentalsMap();

  const latestRow = targetDate
    ? { d: targetDate }
    : db
        .prepare(
          `SELECT MAX(b.trade_date) AS d
           FROM daily_broker_ledger b
           INNER JOIN (SELECT DISTINCT trade_date FROM daily_stock_summary) s
             ON b.trade_date = s.trade_date`
        )
        .get() || db.prepare('SELECT MAX(trade_date) AS d FROM daily_broker_ledger').get();
  const sessionDate = latestRow?.d || new Date().toISOString().slice(0, 10);

  const gate1 = evaluateMarketRegimeGate({
    indexSeries: nepseIndexHistory,
    liveHistory: liveIndexHistory,
    liveQuote: liveIndexQuote,
    db,
    targetDate: sessionDate,
    baselinePath,
    lastKnownMarketPath,
    stockUniverseMap: stockMap,
  });

  if (!gate1.gate1Pass && !forceScanOnBear) {
    return {
      success: true,
      sessionDate,
      gate1,
      scannedCount: 0,
      gate2PassedCount: 0,
      qualifiedCount: 0,
      watchlistCount: 0,
      qualified: [],
      watchlist: [],
    };
  }

  const fiveDayDates = db
    .prepare(
      `SELECT DISTINCT trade_date FROM daily_broker_ledger
       WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 5`
    )
    .all(sessionDate)
    .map((r) => r.trade_date);

  const tenDayDates = db
    .prepare(
      `SELECT DISTINCT trade_date FROM daily_broker_ledger
       WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 10`
    )
    .all(sessionDate)
    .map((r) => r.trade_date);

  if (fiveDayDates.length === 0) {
    return {
      success: true,
      sessionDate,
      gate1,
      scannedCount: 0,
      gate2PassedCount: 0,
      qualifiedCount: 0,
      watchlistCount: 0,
      qualified: [],
      watchlist: [],
      noLedgerData: true,
    };
  }

  const pl5 = fiveDayDates.map(() => '?').join(',');
  const pl10 = tenDayDates.map(() => '?').join(',');

  const activeRows = db
    .prepare(
      `SELECT symbol, close_price, total_turnover
       FROM daily_stock_summary
       WHERE trade_date = ? AND close_price >= 100 AND total_turnover >= 300000`
    )
    .all(sessionDate);

  const histStmt = db.prepare(
    `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
     FROM daily_stock_summary
     WHERE symbol = ? AND trade_date <= ?
     ORDER BY trade_date DESC
     LIMIT 28`
  );

  const aggLedgerStmt5 = db.prepare(
    `SELECT broker_id, SUM(buy_vol) AS buy_vol, SUM(sell_vol) AS sell_vol, SUM(buy_amt) AS buy_amt
     FROM daily_broker_ledger
     WHERE symbol = ? AND trade_date IN (${pl5})
     GROUP BY broker_id`
  );

  const aggLedgerStmt10 = tenDayDates.length > 0
    ? db.prepare(
        `SELECT broker_id, SUM(buy_vol) AS buy_vol, SUM(sell_vol) AS sell_vol
         FROM daily_broker_ledger
         WHERE symbol = ? AND trade_date IN (${pl10})
         GROUP BY broker_id`
      )
    : null;

  const qualified = [];
  const watchlist = [];
  let scannedCount = 0;
  let gate2PassedCount = 0;

  for (const row of activeRows) {
    const sym = String(row.symbol || '').toUpperCase().trim();
    if (!sym) continue;

    const mergedFund = loadMergedFundamentals(db, sym, fundMap, stockMap, sessionDate);
    if (isExcludedInstrument(sym, mergedFund.sector)) continue;

    scannedCount++;
    const ltp = Number(row.close_price || 0);

    try {
      const bm = calculateMultiTimeframeBrokerMetrics(sym, { db, targetDate: sessionDate, sessionLimit: 15 });
      if (!bm || !bm.topBrokers || bm.topBrokers.length === 0) continue;

      const ledger5 = aggLedgerStmt5.all(sym, ...fiveDayDates);
      const top5Buyers5D = [...ledger5]
        .filter((r) => Number(r.buy_vol || 0) > 0)
        .sort((a, b) => Number(b.buy_vol || 0) - Number(a.buy_vol || 0))
        .slice(0, 5);
      const top5BuyerRetentions = top5Buyers5D.map((r) => {
        const bv = Number(r.buy_vol || 0);
        const sv = Number(r.sell_vol || 0);
        return bv > 0 ? ((bv - sv) / bv) * 100 : 0;
      });

      // Top-3 5D buyers' weighted VWAP
      const top3Net5D = [...ledger5].sort(
        (a, b) => Number(b.buy_vol - b.sell_vol) - Number(a.buy_vol - a.sell_vol)
      ).slice(0, 3);
      const top3BuyQty5D = top3Net5D.reduce((s, r) => s + Number(r.buy_vol || 0), 0);
      const top3BuyAmt5D = top3Net5D.reduce((s, r) => s + Number(r.buy_amt || 0), 0);
      const operatorVwap5D = top3BuyQty5D > 0 && top3BuyAmt5D > 0 ? top3BuyAmt5D / top3BuyQty5D : bm.vwap5D;

      // 10-day syndicate retention across top-3 net buyers
      let retention10D = bm.rolling5DRetentionPct;
      if (aggLedgerStmt10) {
        const ledger10 = aggLedgerStmt10.all(sym, ...tenDayDates);
        const top3_10D = [...ledger10]
          .sort((a, b) => Number(b.buy_vol - b.sell_vol) - Number(a.buy_vol - a.sell_vol))
          .slice(0, 3);
        const totB10 = top3_10D.reduce((s, r) => s + Number(r.buy_vol || 0), 0);
        const totNet10 = top3_10D.reduce((s, r) => s + Number(r.buy_vol - r.sell_vol), 0);
        if (totB10 > 0) retention10D = +((totNet10 / totB10) * 100).toFixed(1);
      }

      const lead = bm.topBrokers[0];
      const sectorPolicy = getSectorPolicy(mergedFund.sector);

      const gate2 = scoreGate2AccumulationQuality({
        symbol: sym,
        sector: mergedFund.sector,
        ltp,
        asymmetry: bm.buySellAsymmetryRatio,
        retention5D: bm.rolling5DRetentionPct,
        retention10D,
        leadNetVol: lead.netQty,
        top5BuyerRetentions,
        fundamentals: mergedFund,
        targetDate: sessionDate,
      });

      if (!gate2.passGate2) continue;
      gate2PassedCount++;

      const histBars = histStmt.all(sym, sessionDate).reverse();
      const gate3 = evaluateGate3IgnitionTiming({
        db,
        symbol: sym,
        targetDate: sessionDate,
        histBars,
        operatorVwap5D,
        leadBrokerId: lead.brokerId,
        sectorPolicy,
      });

      // Strictly discard stocks failing ANY dump guard even from watchlist
      if (!gate3.dumpGuardPass) continue;

      const riskPlan = computeGate4RiskPlan({ ltp, gate1, gate2, sectorPolicy });

      const entry = {
        sym,
        name: mergedFund.name,
        sector: mergedFund.sector,
        sectorCategory: sectorPolicy.sectorCategory,
        ltp,
        gate2Score: gate2.gate2Score,
        tierLabel: gate2.tierLabel,
        asymmetry: bm.buySellAsymmetryRatio,
        bcr3Buy: bm.bcr3Buy,
        bcr3Sell: bm.bcr3Sell,
        retention5D: Math.round(bm.rolling5DRetentionPct),
        retention10D: Math.round(retention10D),
        leadBrokerId: lead.brokerId,
        leadBrokerName: getBrokerName(lead.brokerId),
        leadNetVol: lead.netQty,
        vwap5D: gate3.vwap5D,
        costDistPct: gate3.costDistPct,
        vduRatio: gate3.vduRatio,
        rvolToday: gate3.rvolToday,
        spreadPct: gate3.spreadPct,
        isNr7: gate3.isNr7,
        isIdealCompression: gate3.isIdealCompression,
        triggerCount: gate3.triggerCount,
        testShotFound: gate3.testShotFound,
        testShotDate: gate3.testShotDate,
        testShotRvol: gate3.testShotRvol,
        vduPass: gate3.vduPass,
        spreadPass: gate3.spreadPass,
        costFloorPass: gate3.costFloorPass,
        dumpGuardPass: gate3.dumpGuardPass,
        riskPlan,
      };

      if (gate3.passGate3) {
        qualified.push(entry);
      } else if (gate3.triggerCount >= 3) {
        watchlist.push(entry);
      }
    } catch (_) {
      // Skip individual scrip failure cleanly
    }
  }

  qualified.sort(
    (a, b) => b.gate2Score - a.gate2Score || b.asymmetry - a.asymmetry || b.retention5D - a.retention5D
  );
  watchlist.sort(
    (a, b) => b.triggerCount - a.triggerCount || b.gate2Score - a.gate2Score || b.asymmetry - a.asymmetry
  );

  return {
    success: true,
    sessionDate,
    gate1,
    scannedCount,
    gate2PassedCount,
    qualifiedCount: qualified.length,
    watchlistCount: watchlist.length,
    qualified,
    watchlist,
  };
}

/**
 * Formats 4-Gate Stock Selection Guide evaluation into clean mobile-ready Telegram HTML.
 * Guarantees explicit notification on both Selected Stock days AND Zero-Stock / Bear days.
 */
export function formatDailySelectionGuideHtml(res) {
  if (!res || !res.success) {
    return [
      `📊 <b>DRAVYASHREE 4-GATE STOCK SELECTION GUIDE</b>`,
      `──────────────────────────`,
      `⚠️ Unable to evaluate market data right now. Please retry after ingestion.`,
    ].join('\n');
  }

  const g1 = res.gate1 || {};
  const chgSign = g1.dayChangePts >= 0 ? '+' : '';
  const nepseStr =
    g1.close > 0
      ? `${g1.close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${chgSign}${Number(g1.dayChangePts || 0).toFixed(2)} / ${Number(g1.dayChangePct || 0) >= 0 ? '+' : ''}${Number(g1.dayChangePct || 0).toFixed(2)}%)`
      : 'N/A';

  const lines = [
    `📊 <b>DRAVYASHREE 4-GATE STOCK SELECTION GUIDE</b>`,
    `📅 <b>Session:</b> ${escapeHtml(res.sessionDate)} | <b>NEPSE:</b> ${escapeHtml(nepseStr)}`,
    `──────────────────────────`,
    `<b>GATE 1 (REGIME):</b> ${g1.regimeLabel || 'UNKNOWN'}`,
    `• Close: ${g1.close || 0} | 50 EMA: ${g1.ema50 || 0} ${g1.above50 ? '✓' : '✗'} | 200 EMA: ${g1.ema200 || 0} ${g1.above200 ? '✓' : '✗'} | 5D: ${Number(g1.fiveDayReturnPct || 0) >= 0 ? '+' : ''}${g1.fiveDayReturnPct || 0}%`,
  ];

  // Outcome 1: Gate 1 Fails -> BEAR / UNCERTAIN -> NO STOCK SELECTED
  if (!g1.gate1Pass) {
    lines.push(
      `──────────────────────────`,
      `🚫 <b>NO STOCK SELECTED TODAY — HOLD CASH</b>`,
      ``,
      `⛔ <b>Gate 1 Bear/Uncertain Veto Active:</b>`,
      ...(g1.failReasons || []).map((r) => `• ${escapeHtml(r)}`),
      ``,
      `💡 <b>Action:</b> Zero trades permitted below 50 EMA or 200 EMA. Cash is a position.`,
      `──────────────────────────`,
      `<i>Research tool only — NOT financial advice. Send /guide anytime.</i>`
    );
    return lines.join('\n');
  }

  // Outcome 2: Bull Regime, ZERO stocks pass all 4 Gates -> NO STOCK SELECTED TODAY
  if (!res.qualified || res.qualified.length === 0) {
    lines.push(
      `──────────────────────────`,
      `🛡️ <b>NO STOCK SELECTED TODAY (0 Qualified) — HOLD CASH</b>`,
      ``,
      res.watchlist && res.watchlist.length > 0
        ? `• ${res.watchlist.length} stock(s) passed Gate 2, but <b>ZERO</b> completed all 5 Ignition Triggers simultaneously.`
        : `• <b>NO STOCK AT ALL:</b> Zero equities passed Gate 2 (Score ≥ 7/10) + Gate 3 (5/5 Triggers) across ${res.scannedCount || 0} scanned stocks.`,
      `• 💡 <b>Action:</b> HOLD CASH. Patience IS the strategy.`
    );

    if (res.watchlist && res.watchlist.length > 0) {
      lines.push(``, `⏳ <b>WATCHLIST ONLY (DO NOT BUY YET — Wait 5/5 Triggers):</b>`);
      for (const w of res.watchlist.slice(0, 4)) {
        const flags = [
          w.testShotFound ? '✓Shot' : '✗Shot',
          w.vduPass ? '✓VDU' : '✗VDU',
          w.spreadPass ? '✓Coil' : '✗Coil',
          w.costFloorPass ? '✓Cost' : '✗Cost',
          w.dumpGuardPass ? '✓Guard' : '✗Guard',
        ].join(' ');
        lines.push(
          `🔍 <b><code>${escapeHtml(w.sym)}</code></b> | Rs. ${w.ltp.toFixed(1)} | Score ${w.gate2Score}/10 | ${w.triggerCount}/5 (${flags}) | Asym ${w.asymmetry}x`
        );
      }
    }

    lines.push(
      `──────────────────────────`,
      `📋 <i>Scanned: ${res.scannedCount || 0} common equities | Qualified: 0</i>`,
      `<i>Research tool only — NOT financial advice. Send /guide anytime.</i>`
    );
    return lines.join('\n');
  }

  // Outcome 3: Selected Stocks (≥ 1 Passed All 4 Gates)
  lines.push(
    `──────────────────────────`,
    `✅ <b>SELECTED STOCK${res.qualified.length > 1 ? 'S' : ''} TODAY (${res.qualified.length} Passed All 4 Gates)</b>`,
    ``
  );

  for (const s of res.qualified.slice(0, 5)) {
    const rp = s.riskPlan;
    const costSign = s.costDistPct >= 0 ? '+' : '';
    lines.push(
      `👑 <b><code>${escapeHtml(s.sym)}</code></b> (${escapeHtml(s.sector)}) | Rs. ${s.ltp.toFixed(1)} | <b>Score: ${s.gate2Score}/10</b> (${s.tierLabel})`,
      `• <b>Asymmetry:</b> <b>${s.asymmetry}x</b> (BCR3 Buy ${s.bcr3Buy}% / Sell ${s.bcr3Sell}%)`,
      `• <b>Lead Broker:</b> ${escapeHtml(s.leadBrokerName)} (+${Number(s.leadNetVol).toLocaleString()} kitta | 5D Ret: ${s.retention5D}% | 10D: ${s.retention10D}%)`,
      `• <b>5D Operator VWAP:</b> Rs. ${s.vwap5D} (${costSign}${s.costDistPct}%) | <b>VDU:</b> ${s.vduRatio}x | <b>RVOL:</b> ${s.rvolToday}x | <b>Spread:</b> ${s.spreadPct}%${s.isNr7 ? ' (NR7)' : ''}`,
      `• <b>Triggers:</b> 5/5 (Shot✓ VDU✓ Coil✓ Cost✓ Guard✓)`,
      `• <b>Gate 4 Plan (T₀+1 Open):</b> Limit ≤ Rs. ${rp.entryLimitMax} (Abort gap &gt; Rs. ${rp.gapAbortPrice}) | 🛡️ <b>SL:</b> Rs. ${rp.stopLoss} (-${rp.stopLossPct}%) | 🎯 <b>Target:</b> Rs. ${rp.target} (+${rp.targetPct}%) | BE Move @ Rs. ${rp.breakevenTriggerPrice} | 5D Time Stop`,
      `• <b>Size:</b> Max ${rp.maxPortfolioPct}% portfolio (~${rp.sharesPer1Lakh} shares / Rs. 1L)`,
      ``
    );
  }

  if (res.watchlist && res.watchlist.length > 0) {
    lines.push(`⏳ <b>NEAR-MISS WATCHLIST (${res.watchlist.length} — Not Ready Today):</b>`);
    for (const w of res.watchlist.slice(0, 3)) {
      lines.push(`• <code>${escapeHtml(w.sym)}</code> Rs. ${w.ltp.toFixed(1)} | ${w.gate2Score}/10 | ${w.triggerCount}/5 Triggers | Asym ${w.asymmetry}x`);
    }
    lines.push(``);
  }

  lines.push(
    `──────────────────────────`,
    `📋 <b>Scanned:</b> ${res.scannedCount} | <b>Gate 2:</b> ${res.gate2PassedCount} | <b>All 4 Gates:</b> ${res.qualified.length}`,
    `⚠️ <i>Expectancy note: Mean net +0.06% (PF 1.06); discipline (-3% SL) is mandatory. Research tool only — NOT financial advice. Send /guide anytime.</i>`
  );

  return lines.join('\n');
}
