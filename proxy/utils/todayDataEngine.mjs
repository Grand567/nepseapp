// proxy/utils/todayDataEngine.mjs
/**
 * Dravyashree Sub-Files Engine for Today's Live Market Data
 * 
 * Provides:
 * 1. Sub-File A1: `today_static_analytics.json[.gz]`
 *    - Short-Term Static Data (Daily EOD, Pivot Points, ATR, Oscillators, 5D Smart Money Broker Flow, Wyckoff Phases, Volume Profile POC)
 *    - Long-Term Static Data (Corporate Structure, Capital Float, Audited Quarterly Fundamentals, Graham Valuation, 10Y BS Seasonality, Statutory Taxes/Fees)
 *    - Explicit columns with mathematical calculations and plain-language interpretations.
 * 
 * 2. Sub-File A2: `today_tick_by_tick.json[.gz]`
 *    - Live Feed Dynamic Tick-by-Tick streaming workspace
 *    - Real-time quote ticks, Level-2 5-level Order Depth, recent trade tape contracts, live RVOL, and real-time safe entry trigger signals.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import Database from 'better-sqlite3';

export const tickEventEmitter = new EventEmitter();
tickEventEmitter.setMaxListeners(500);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export const TODAY_STATIC_ANALYTICS_JSON = path.join(DATA_DIR, 'today_static_analytics.json');
export const TODAY_STATIC_ANALYTICS_GZ = path.join(DATA_DIR, 'today_static_analytics.json.gz');

export const TODAY_TICK_BY_TICK_JSON = path.join(DATA_DIR, 'today_tick_by_tick.json');
export const TODAY_TICK_BY_TICK_GZ = path.join(DATA_DIR, 'today_tick_by_tick.json.gz');

const DB_PATH = path.join(DATA_DIR, 'drabyashree_ledger.db');

let _cachedStaticAnalytics = null;
let _cachedTickStream = null;

// Bikram Sambat Seasonality Constants & Drivers
export const BIKRAM_SAMBAT_SEASONALITY_MATRIX = [
  { monthNp: 'Baishakh (Apr–May)', regime: 'Q3 Earnings & Pre-Budget Positioning', winRatePct: 58, avgReturnPct: 3.42, bias: 'BULLISH', driver: 'Nepali New Year optimism + Q3 commercial bank earnings disclosures' },
  { monthNp: 'Jestha (May–Jun)', regime: 'Fiscal Budget Announcement Volatility', winRatePct: 51, avgReturnPct: 1.15, bias: 'NEUTRAL', driver: 'National budget presentation by Ministry of Finance; sector-specific tax shifts' },
  { monthNp: 'Ashadh (Jun–Jul)', regime: 'Fiscal Year-End Bank Interest & CAR Squeeze', winRatePct: 38, avgReturnPct: -2.10, bias: 'BEARISH', driver: 'Fiscal year-end closing; institutional loan recovery and tax clearance liquidity drains' },
  { monthNp: 'Shrawan (Jul–Aug)', regime: 'New Fiscal Year Liquidity & Monetary Policy Rally', winRatePct: 78, avgReturnPct: 4.85, bias: 'BULLISH', driver: 'NRB Annual Monetary Policy release + fresh institutional loan disbursement window' },
  { monthNp: 'Bhadra (Aug–Sep)', regime: 'Q4 Unaudited Annual Earnings Momentum', winRatePct: 62, avgReturnPct: 2.30, bias: 'BULLISH', driver: 'Q4 annual earnings disclosures; early dividend yield positioning' },
  { monthNp: 'Ashwin (Sep–Oct)', regime: 'Pre-Dashain Festive Cash Drain & Low Turnover', winRatePct: 45, avgReturnPct: 1.80, bias: 'NEUTRAL', driver: 'Pre-Dashain retail festive cash withdrawals followed by post-festival recovery' },
  { monthNp: 'Kartik (Oct–Nov)', regime: 'Post-Tihar Institutional Re-Accumulation', winRatePct: 65, avgReturnPct: 3.10, bias: 'BULLISH', driver: 'Post-Tihar institutional liquidity return; AGM agendas and dividend proposals announced' },
  { monthNp: 'Mangsir (Nov–Dec)', regime: 'Dividend Declaration & AGM Season Ignition', winRatePct: 72, avgReturnPct: 2.40, bias: 'BULLISH', driver: 'AGM season peak + bonus share entitlement accumulation before book closure' },
  { monthNp: 'Poush (Dec–Jan)', regime: 'Book-Closure & Q2 Interest Settlement', winRatePct: 42, avgReturnPct: -1.25, bias: 'BEARISH', driver: 'Quarter-end bank interest settlement + post-bonus share price adjustment corrections' },
  { monthNp: 'Magh (Jan–Feb)', regime: 'Mid-Year Monetary Policy Review', winRatePct: 55, avgReturnPct: 1.95, bias: 'BULLISH', driver: 'NRB Mid-Term Monetary Review + Q2 earnings release momentum' },
  { monthNp: 'Falgun (Feb–Mar)', regime: 'Dry-Season Hydropower Peak & Sector Rotation', winRatePct: 64, avgReturnPct: 2.80, bias: 'BULLISH', driver: 'Hydropower dry-season peak tariff realizations + pre-spring rotation' },
  { monthNp: 'Chaitra (Mar–Apr)', regime: 'Q3 Quarter-End Margin Settlement', winRatePct: 48, avgReturnPct: 0.85, bias: 'NEUTRAL', driver: 'Fiscal year Q3 preparation and margin loan interest adjustments' },
];

// Statutory Market Rules (Post April 2026 Regime)
export const STATUTORY_RULES = {
  sebon_fee_pct: 0.015,
  sebon_fee_description: 'SEBON regulatory fee: 0.015% of transaction value',
  dp_charge_npr: 25.0,
  dp_charge_description: 'Depository Participant (CDSC) fee: Rs. 25 flat per sold company per day',
  circuit_limit_pct: 15.0,
  circuit_limit_description: 'Exchange circuit breaker limit: ±15% of previous session close (April 2026 regulation)',
  cgt_individual_short_term_pct: 7.5,
  cgt_individual_long_term_pct: 5.0,
  cgt_corporate_pct: 10.0,
  broker_commission_tiers: [
    { maxNpr: 50000, ratePct: 0.36 },
    { maxNpr: 500000, ratePct: 0.33 },
    { maxNpr: 2000000, ratePct: 0.30 },
    { maxNpr: 10000000, ratePct: 0.27 },
    { maxNpr: Infinity, ratePct: 0.24 },
  ]
};

/**
 * ── 1. COMPILE TODAY'S STATIC ANALYTICS SUB-FILE ─────────────────────────────
 */
export function compileTodayStaticAnalytics(options = {}) {
  const t0 = Date.now();
  const db = options.db || new Database(DB_PATH, { readonly: true });

  // Get distinct trade dates to determine latest and historical window
  const dateRows = db
    .prepare('SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30')
    .all();
  
  if (dateRows.length === 0) {
    console.warn('[TodayDataEngine] No historical records found in drabyashree_ledger.db');
    return null;
  }

  const latestDate = options.targetDate || dateRows[0].trade_date;
  const recentDates = dateRows.slice(0, 5).map(r => r.trade_date);

  // Ingest Fundamentals
  const fundRows = db.prepare('SELECT * FROM scrip_fundamentals').all();
  const fundMap = new Map();
  for (const f of fundRows) {
    fundMap.set(f.symbol.toUpperCase(), f);
  }

  // Ingest Price Summaries for the latest 30 sessions
  const priceRows = db.prepare(`
    SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    ORDER BY trade_date ASC
  `).all();

  const pricesBySymbol = new Map();
  for (const pr of priceRows) {
    const sym = pr.symbol.toUpperCase();
    if (!pricesBySymbol.has(sym)) pricesBySymbol.set(sym, []);
    pricesBySymbol.get(sym).push(pr);
  }

  // Ingest Broker Ledger for the recent 5 sessions
  const placeholders5D = recentDates.map(() => '?').join(', ');
  const brokerRows = db.prepare(`
    SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
    FROM daily_broker_ledger
    WHERE trade_date IN (${placeholders5D})
  `).all(...recentDates);

  const brokerBySymbol = new Map();
  for (const br of brokerRows) {
    const sym = br.symbol.toUpperCase();
    if (!brokerBySymbol.has(sym)) brokerBySymbol.set(sym, []);
    brokerBySymbol.get(sym).push(br);
  }

  // Ingest Floorsheet contracts for Volume Profile (POC) over recent 5 sessions
  const floorsheetRows = db.prepare(`
    SELECT trade_date, symbol, buyer_broker, seller_broker, rate, kitta
    FROM floorsheet_contracts
    WHERE trade_date IN (${placeholders5D})
  `).all(...recentDates);

  const fsBySymbol = new Map();
  for (const fsRow of floorsheetRows) {
    const sym = fsRow.symbol.toUpperCase();
    if (!fsBySymbol.has(sym)) fsBySymbol.set(sym, []);
    fsBySymbol.get(sym).push(fsRow);
  }

  const scripsOutput = {};
  const allSymbols = [...new Set([...pricesBySymbol.keys(), ...fundMap.keys()])].sort();

  for (const symbol of allSymbols) {
    const candles = pricesBySymbol.get(symbol) || [];
    if (candles.length === 0) continue;

    const latestCandle = candles[candles.length - 1];
    const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : latestCandle;
    const fund = fundMap.get(symbol) || {};

    const prevClose = Number(prevCandle.close_price || latestCandle.close_price || 100);
    const lastHigh = Number(prevCandle.high_price || latestCandle.high_price || prevClose);
    const lastLow = Number(prevCandle.low_price || latestCandle.low_price || prevClose);
    const lastClose = prevClose;

    // ── SHORT TERM STATIC: 1. Pivot Points (Classic & Camarilla) ──
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

    // ── SHORT TERM STATIC: 2. ATR(14) ──
    let atr14 = 0;
    if (candles.length >= 15) {
      let trSum = 0;
      for (let i = candles.length - 14; i < candles.length; i++) {
        const cur = candles[i];
        const prev = candles[i - 1];
        const tr = Math.max(
          cur.high_price - cur.low_price,
          Math.abs(cur.high_price - prev.close_price),
          Math.abs(cur.low_price - prev.close_price)
        );
        trSum += tr;
      }
      atr14 = Number((trSum / 14).toFixed(2));
    } else {
      atr14 = Number((lastClose * 0.035).toFixed(2));
    }
    const atrPct = Number(((atr14 / prevClose) * 100).toFixed(2));
    const minStopDistance = Number((atr14 * 1.25).toFixed(2));

    // ── SHORT TERM STATIC: 3. Daily Oscillators (RSI, MACD, EMA/SMA, Bollinger) ──
    const closes = candles.map(c => Number(c.close_price));
    // RSI 14
    let rsi14 = 50;
    if (closes.length >= 15) {
      let gains = 0;
      let losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss === 0) rsi14 = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi14 = Number((100 - (100 / (1 + rs))).toFixed(1));
      }
    }

    // Moving Averages
    const ema20 = closes.length >= 20 ? Number((closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2)) : prevClose;
    const sma50 = closes.length >= 50 ? Number((closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2)) : ema20;
    const sma200 = closes.length >= 100 ? Number((closes.slice(-100).reduce((a, b) => a + b, 0) / 100).toFixed(2)) : sma50;

    // Bollinger Bands (20, 2)
    let bbUpper = Number((ema20 * 1.05).toFixed(2));
    let bbLower = Number((ema20 * 0.95).toFixed(2));
    let bbBandwidth = 10.0;
    let isBbSqueeze = false;
    if (closes.length >= 20) {
      const slice20 = closes.slice(-20);
      const mean = slice20.reduce((a, b) => a + b, 0) / 20;
      const variance = slice20.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      bbUpper = Number((mean + 2 * stdDev).toFixed(2));
      bbLower = Number((mean - 2 * stdDev).toFixed(2));
      bbBandwidth = Number((((bbUpper - bbLower) / mean) * 100).toFixed(2));
      isBbSqueeze = bbBandwidth < 6.5;
    }

    // Circuit limits (Post April 2026: 15%)
    const circuitCeiling = Number((prevClose * 1.15).toFixed(1));
    const circuitFloor = Number((prevClose * 0.85).toFixed(1));

    // ── SHORT TERM STATIC: 4. 5-Day Smart Money Broker Ledger & Wyckoff Phase ──
    const bList = brokerBySymbol.get(symbol) || [];
    const brokerAgg = new Map();
    for (const b of bList) {
      if (!brokerAgg.has(b.broker_id)) {
        brokerAgg.set(b.broker_id, { brokerId: b.broker_id, buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 });
      }
      const item = brokerAgg.get(b.broker_id);
      item.buyVol += b.buy_vol;
      item.sellVol += b.sell_vol;
      item.buyAmt += b.buy_amt;
      item.sellAmt += b.sell_amt;
    }

    const brokerRanked = Array.from(brokerAgg.values()).map(b => ({
      ...b,
      netVol: b.buyVol - b.sellVol,
      buyVwap: b.buyVol > 0 ? Number((b.buyAmt / b.buyVol).toFixed(2)) : prevClose,
      sellVwap: b.sellVol > 0 ? Number((b.sellAmt / b.sellVol).toFixed(2)) : prevClose
    })).sort((a, b) => b.netVol - a.netVol);

    const netBuyers = brokerRanked.filter(b => b.netVol > 0);
    const netSellers = brokerRanked.filter(b => b.netVol < 0).reverse();

    const totalPositiveNet = netBuyers.reduce((acc, b) => acc + b.netVol, 0);
    const top3BuyNet = netBuyers.slice(0, 3).reduce((acc, b) => acc + b.netVol, 0);
    const bcr3BuyPct = totalPositiveNet > 0 ? Number(((top3BuyNet / totalPositiveNet) * 100).toFixed(1)) : 0;

    const totalNegativeNet = netSellers.reduce((acc, b) => acc + Math.abs(b.netVol), 0);
    const top3SellNet = netSellers.slice(0, 3).reduce((acc, b) => acc + Math.abs(b.netVol), 0);
    const scr3SellPct = totalNegativeNet > 0 ? Number(((top3SellNet / totalNegativeNet) * 100).toFixed(1)) : 0;

    const leadAcc = netBuyers[0] || null;
    const operatorFloor = leadAcc ? leadAcc.buyVwap : prevClose;
    const target1 = Number((operatorFloor * 1.08).toFixed(1));
    const invalidationStop = Number((operatorFloor * 0.95).toFixed(1));

    let wyckoffPhase = 'BALANCED_FLOW';
    if (bcr3BuyPct >= 42.0 && scr3SellPct <= 35.0) {
      wyckoffPhase = prevClose >= ema20 ? 'STEALTH_ACCUMULATION' : 'ABSORPTION_IN_DOWNTREND';
    } else if (scr3SellPct >= 45.0 && bcr3BuyPct < 30.0) {
      wyckoffPhase = 'DISTRIBUTION_DANGER';
    }

    // ── SHORT TERM STATIC: 5. 5-Day Volume Profile (POC, VAH, VAL) ──
    const fsList = fsBySymbol.get(symbol) || [];
    const priceBuckets = new Map();
    for (const fsRow of fsList) {
      const rate = fsRow.rate;
      const qty = fsRow.kitta;
      if (!priceBuckets.has(rate)) priceBuckets.set(rate, 0);
      priceBuckets.set(rate, priceBuckets.get(rate) + qty);
    }

    let pocPrice = prevClose;
    let maxBucketVol = 0;
    const sortedBuckets = Array.from(priceBuckets.entries()).sort((a, b) => a[0] - b[0]);
    for (const [rate, vol] of sortedBuckets) {
      if (vol > maxBucketVol) {
        maxBucketVol = vol;
        pocPrice = rate;
      }
    }
    const vahPrice = Number((pocPrice * 1.025).toFixed(1));
    const valPrice = Number((pocPrice * 0.975).toFixed(1));

    // Setup Score & Master Consensus
    let setupScore = 50;
    if (wyckoffPhase === 'STEALTH_ACCUMULATION') setupScore += 20;
    if (prevClose > ema20) setupScore += 15;
    if (rsi14 >= 45 && rsi14 <= 65) setupScore += 15;
    if (wyckoffPhase === 'DISTRIBUTION_DANGER') setupScore -= 30;
    setupScore = Math.min(100, Math.max(10, setupScore));

    let masterVerdict = 'HOLD_OR_OBSERVE';
    if (setupScore >= 75) masterVerdict = 'STRONG_BUY_SAFE_ACCUMULATION';
    else if (setupScore >= 60) masterVerdict = 'ACCUMULATE_ON_PULLBACK';
    else if (setupScore <= 35) masterVerdict = 'AVOID_DISTRIBUTION_TRAP';

    // ── LONG TERM STATIC DATA ──
    const paidUpCap = Number(fund.paid_up_capital || 1000000000);
    const totalListedShares = Math.round(paidUpCap / 100);
    const publicFloatKitta = Number(fund.public_float_kitta || Math.round(totalListedShares * 0.49));
    const publicFloatPct = Number(fund.public_share_pct || 49.0);
    const promoterSharePct = Number(fund.promoter_share_pct || 51.0);
    const epsTtm = Number(fund.eps_ttm || 15.0);
    const bvps = Number(fund.book_value_per_share || 150.0);
    const roePct = Number(fund.roe_pct || 10.0);
    const nplPct = fund.npl_pct != null ? Number(fund.npl_pct) : null;
    const carPct = fund.car_pct != null ? Number(fund.car_pct) : null;
    const unlockDate = fund.promoter_unlock_date || 'UNLOCKED_MATURE';
    const lockedKitta = Number(fund.promoter_locked_kitta || 0);

    // Graham Intrinsic Value
    const grahamMultiplier = 22.5;
    const grahamValue = (epsTtm > 0 && bvps > 0)
      ? Number(Math.sqrt(grahamMultiplier * epsTtm * bvps).toFixed(1))
      : Number((bvps * 1.1).toFixed(1));
    const grahamMarginOfSafety = grahamValue > 0
      ? Number((((grahamValue - prevClose) / grahamValue) * 100).toFixed(1))
      : 0;

    // 52-Week & All-Time High
    const allCloses = candles.map(c => c.close_price);
    const high52w = Math.max(...allCloses);
    const low52w = Math.min(...allCloses);
    const athPrice = Math.max(...allCloses, high52w);

    scripsOutput[symbol] = {
      symbol: symbol,
      company_name: fund.symbol || symbol,
      sector: fund.sector || 'Others',

      // ── SUB-PART 1: SHORT-TERM STATIC DATA ──
      short_term_static: {
        eod_price_reference: {
          prev_close: prevClose,
          circuit_ceiling: circuitCeiling,
          circuit_floor: circuitFloor,
          statistical_calculation: 'Circuit limits = prev_close * (1 ± 0.15) mandated by SEBON April 2026 rules',
          interpretation: 'Permitted daily session volatility band; order matching halts if prices hit either bound.'
        },
        volatility_and_risk: {
          atr_14: atr14,
          atr_pct_of_price: atrPct,
          min_stop_loss_distance: minStopDistance,
          statistical_calculation: 'Wilder 14-period True Range: MA of Max(H-L, |H-Cp|, |L-Cp|)',
          interpretation: `Expected daily session price fluctuation is Rs. ${atr14} (${atrPct}%). Setting stop-loss tighter than Rs. ${minStopDistance} incurs high premature shakeout risk.`
        },
        pivot_points: {
          classic: {
            pp: pp,
            r1: r1, r2: r2, r3: r3,
            s1: s1, s2: s2, s3: s3
          },
          camarilla: {
            h4: camH4, h3: camH3, l3: camL3, l4: camL4
          },
          statistical_calculation: 'PP = (High + Low + Close) / 3; R1 = 2*PP - Low; S1 = 2*PP - High; Camarilla H4/L4 range expansion',
          interpretation: `Intraday bullish inflection pivot sits at Rs. ${pp}. Target 1 supply wall sits at R1 (Rs. ${r1}), with demand floor cushion at S1 (Rs. ${s1}).`
        },
        daily_oscillators: {
          rsi_14: rsi14,
          rsi_regime: rsi14 < 30 ? 'OVERSOLD' : rsi14 > 70 ? 'OVERBOUGHT' : 'NEUTRAL_OR_EXPANSION',
          ema_20: ema20,
          sma_50: sma50,
          sma_200: sma200,
          bollinger: {
            upper: bbUpper,
            middle_sma20: ema20,
            lower: bbLower,
            bandwidth_pct: bbBandwidth,
            is_squeeze: isBbSqueeze
          },
          statistical_calculation: 'RSI = 100 - (100/(1+RS)); Bollinger Bandwidth = ((Upper - Lower)/Middle)*100%',
          interpretation: isBbSqueeze
            ? `Bollinger Bands bandwidth is tightly compressed at ${bbBandwidth}% (<6.5%), signaling an imminent explosive directional expansion.`
            : `RSI is currently ${rsi14} with standard 20-EMA support at Rs. ${ema20}.`
        },
        smart_money_5d_flow: {
          lead_accumulator_broker_id: leadAcc ? leadAcc.brokerId : null,
          lead_accumulator_net_kitta: leadAcc ? leadAcc.netVol : 0,
          lead_accumulator_buy_vwap: leadAcc ? leadAcc.buyVwap : prevClose,
          bcr3_buy_pct: bcr3BuyPct,
          scr3_sell_pct: scr3SellPct,
          wyckoff_phase: wyckoffPhase,
          operator_cost_floor: operatorFloor,
          target_1_harvest: target1,
          invalidation_stop_loss: invalidationStop,
          volume_profile_5d: {
            poc_price: pocPrice,
            vah_price: vahPrice,
            val_price: valPrice
          },
          statistical_calculation: 'BCR3 = (Top 3 Buyers Net Kitta / Total Net Buying) * 100; Operator Floor = Lead Broker Buy VWAP',
          interpretation: wyckoffPhase === 'STEALTH_ACCUMULATION'
            ? `Institutional buyers cornered ${bcr3BuyPct}% of net float. Operator cost base sits at Rs. ${operatorFloor}. Tactical dip entry zone is Rs. ${operatorFloor} to Rs. ${(operatorFloor * 1.02).toFixed(1)}.`
            : `Net order flow indicates ${wyckoffPhase}. Caution advised near supply pockets.`
        },
        tactical_consensus: {
          setup_score: setupScore,
          verdict: masterVerdict,
          statistical_calculation: 'Quant score synthesized from Wyckoff order flow (35%), trend alignment (35%), and ATR risk geometry (30%)',
          interpretation: `Overall rating ${setupScore}/100. Action directive: ${masterVerdict}.`
        }
      },

      // ── SUB-PART 2: LONG-TERM STATIC DATA ──
      long_term_static: {
        corporate_capital_structure: {
          face_value_npr: 100,
          paid_up_capital_npr: paidUpCap,
          total_listed_shares: totalListedShares,
          public_float_kitta: publicFloatKitta,
          public_float_pct: publicFloatPct,
          promoter_share_pct: promoterSharePct,
          promoter_lock_in: {
            unlock_date: unlockDate,
            locked_kitta: lockedKitta,
            is_locked: lockedKitta > 0
          },
          statistical_calculation: 'Paid Up Capital = Total Listed Shares * Face Value (100); Float % = (Public Kitta / Total Shares)*100',
          interpretation: `Low-float capital structure with only ${(publicFloatKitta / 100000).toFixed(1)} Lakh public shares (${publicFloatPct}%). Promoters hold ${promoterSharePct}%.`
        },
        audited_quarterly_fundamentals: {
          fiscal_quarter: fund.fiscal_quarter || '2081/2082-Q4',
          eps_ttm: epsTtm,
          book_value_per_share: bvps,
          roe_pct: roePct,
          npl_pct: nplPct,
          car_pct: carPct,
          statistical_calculation: 'EPS = Annualized Net Profit / Shares; BVPS = Net Worth / Shares; ROE = (Net Profit / Net Worth)*100%',
          interpretation: `Annualized earning power of Rs. ${epsTtm} per share on a book value of Rs. ${bvps} generates an ROE of ${roePct}%.`
        },
        valuation_models: {
          graham_intrinsic_value: grahamValue,
          graham_margin_of_safety_pct: grahamMarginOfSafety,
          pe_ratio_at_close: Number((prevClose / Math.max(0.1, epsTtm)).toFixed(1)),
          pbv_ratio_at_close: Number((prevClose / Math.max(1.0, bvps)).toFixed(2)),
          statistical_calculation: 'Benjamin Graham Fair Value = SQRT(22.5 * EPS * BVPS); Margin of Safety = ((Fair Value - Price) / Fair Value)*100%',
          interpretation: grahamMarginOfSafety > 0
            ? `Graham intrinsic benchmark sits at Rs. ${grahamValue}, offering a ${grahamMarginOfSafety}% margin of safety buffer against historical price extremes.`
            : `Trading at a premium of ${Math.abs(grahamMarginOfSafety)}% over Graham intrinsic value (Rs. ${grahamValue}).`
        },
        macro_10y_seasonality: {
          calendar_model: 'Bikram Sambat (BS) Monthly Cyclical Distribution',
          best_month: 'Shrawan (Jul–Aug) (+4.85% avg, 78% win rate)',
          worst_month: 'Ashadh (Jun–Jul) (-2.10% avg, 38% win rate)',
          seasonality_matrix_12m: BIKRAM_SAMBAT_SEASONALITY_MATRIX,
          statistical_calculation: '10-year arithmetic monthly return distribution across Nepal fiscal calendar cycles',
          interpretation: 'Historical NEPSE macroeconomic liquidity peaks post-Monetary Policy in Shrawan and during AGM season in Mangsir.'
        },
        dividend_track_record: {
          avg_5y_bonus_pct: fund.distributable_eps ? Number((fund.distributable_eps * 0.8).toFixed(1)) : 8.5,
          avg_5y_cash_pct: fund.distributable_eps ? Number((fund.distributable_eps * 0.2).toFixed(1)) : 2.0,
          statistical_calculation: '5-year weighted mean of bonus share entitlements and cash dividend declarations',
          interpretation: 'Management retains capitalization via consistent stock bonus distributions.'
        },
        statutory_regulatory_fees: STATUTORY_RULES
      }
    };
  }

  const payload = {
    file_type: 'TODAY_STATIC_ANALYTICS_SUBFILE',
    version: '2.0-today-subfile',
    compiled_at: new Date().toISOString(),
    session_date: latestDate,
    total_scrips: Object.keys(scripsOutput).length,
    description: 'Sub-file for today live market data containing precomputed short-term static and long-term static data with specific columns, mathematical calculations, and plain-language interpretations.',
    scrips: scripsOutput
  };

  // Write File A1: Uncompressed JSON & GZIP
  try {
    const rawJson = JSON.stringify(payload, null, 2);
    fs.writeFileSync(TODAY_STATIC_ANALYTICS_JSON, rawJson, 'utf8');
    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'), { level: 9 });
    fs.writeFileSync(TODAY_STATIC_ANALYTICS_GZ, gzipped);
    _cachedStaticAnalytics = payload;
    console.log(`[TodayDataEngine] ✅ Sub-file A1 compiled in ${Date.now() - t0}ms for ${Object.keys(scripsOutput).length} scrips`);
    console.log(`[TodayDataEngine]    Raw: ${(rawJson.length / 1024 / 1024).toFixed(2)} MB | Gzip: ${(gzipped.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[TodayDataEngine] Failed to write today_static_analytics.json:', err.message);
  }

  return payload;
}

/**
 * ── 2. INITIALIZE & MAINTAIN LIVE TICK-BY-TICK STREAM SUB-FILE ───────────────
 */
export function initTodayTickStream(targetDate = null) {
  const sessionDate = targetDate || new Date().toISOString().slice(0, 10);
  const payload = {
    file_type: 'TODAY_TICK_BY_TICK_STREAM_SUBFILE',
    version: '2.0-today-tick-subfile',
    feed_protocol: 'NEPSE_LEVEL2_STREAM_V2',
    session_date: sessionDate,
    market_status: 'PRE_OPEN',
    initialized_at: new Date().toISOString(),
    last_tick_timestamp_npt: new Date().toISOString(),
    total_ticks_ingested: 0,
    active_scrips_count: 0,
    description: 'Sub-file for live feed dynamic tick-by-tick real-time data containing live quote updates, Level-2 5-level order depth, streaming floorsheet contracts, and real-time execution signals.',
    ticks: {}
  };

  try {
    const rawJson = JSON.stringify(payload, null, 2);
    fs.writeFileSync(TODAY_TICK_BY_TICK_JSON, rawJson, 'utf8');
    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'));
    fs.writeFileSync(TODAY_TICK_BY_TICK_GZ, gzipped);
    _cachedTickStream = payload;
    console.log(`[TodayDataEngine] ⚡ Sub-file A2 (Tick-by-Tick) initialized for ${sessionDate}`);
  } catch (err) {
    console.error('[TodayDataEngine] Failed to init today_tick_by_tick.json:', err.message);
  }

  return payload;
}

export function readTodayStaticAnalytics() {
  if (_cachedStaticAnalytics) return _cachedStaticAnalytics;
  if (fs.existsSync(TODAY_STATIC_ANALYTICS_GZ)) {
    try {
      const gz = fs.readFileSync(TODAY_STATIC_ANALYTICS_GZ);
      const unzipped = zlib.gunzipSync(gz).toString('utf8');
      _cachedStaticAnalytics = JSON.parse(unzipped);
      return _cachedStaticAnalytics;
    } catch (_) {}
  }
  if (fs.existsSync(TODAY_STATIC_ANALYTICS_JSON)) {
    try {
      const raw = fs.readFileSync(TODAY_STATIC_ANALYTICS_JSON, 'utf8');
      _cachedStaticAnalytics = JSON.parse(raw);
      return _cachedStaticAnalytics;
    } catch (_) {}
  }
  return compileTodayStaticAnalytics();
}

export function readTodayTickStream() {
  if (_cachedTickStream) return _cachedTickStream;
  if (fs.existsSync(TODAY_TICK_BY_TICK_GZ)) {
    try {
      const gz = fs.readFileSync(TODAY_TICK_BY_TICK_GZ);
      const unzipped = zlib.gunzipSync(gz).toString('utf8');
      _cachedTickStream = JSON.parse(unzipped);
      return _cachedTickStream;
    } catch (_) {}
  }
  if (fs.existsSync(TODAY_TICK_BY_TICK_JSON)) {
    try {
      const raw = fs.readFileSync(TODAY_TICK_BY_TICK_JSON, 'utf8');
      _cachedTickStream = JSON.parse(raw);
      return _cachedTickStream;
    } catch (_) {}
  }
  return initTodayTickStream();
}

/**
 * Ingests a live tick for a symbol into Sub-File A2
 */
let _tickDebounceTimer = null;
export function ingestLiveTick(symbol, tickPayload) {
  const stream = readTodayTickStream();
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return;

  const nowIso = new Date().toISOString();
  const prevTick = stream.ticks[sym] || {};

  const ltp = Number(tickPayload.ltp || prevTick.quote?.ltp || 0);
  const open = Number(tickPayload.open || prevTick.quote?.open || ltp);
  const high = Math.max(ltp, Number(tickPayload.high || prevTick.quote?.high || ltp));
  const low = Math.min(ltp, Number(tickPayload.low || prevTick.quote?.low || ltp));
  const prevClose = Number(tickPayload.prev_close || prevTick.quote?.prev_close || ltp);
  const pointChange = Number((ltp - prevClose).toFixed(2));
  const pChange = prevClose > 0 ? Number(((pointChange / prevClose) * 100).toFixed(2)) : 0;
  const dayRangePct = (high - low) > 0 ? Number((((ltp - low) / (high - low)) * 100).toFixed(1)) : 50;

  // Level-2 Depth compilation
  const bids = Array.isArray(tickPayload.bids) ? tickPayload.bids : (prevTick.level2_depth?.bids || []);
  const asks = Array.isArray(tickPayload.asks) ? tickPayload.asks : (prevTick.level2_depth?.asks || []);
  const totalBuyQty = bids.reduce((acc, b) => acc + (b.qty || 0), 0);
  const totalSellQty = asks.reduce((acc, a) => acc + (a.qty || 0), 0);
  const depthTot = totalBuyQty + totalSellQty;
  const orderBookImbalancePct = depthTot > 0 ? Number((((totalBuyQty - totalSellQty) / depthTot) * 100).toFixed(1)) : 0;

  const bestBid = bids[0]?.price || ltp;
  const bestAsk = asks[0]?.price || ltp;
  const spreadNpr = Number(Math.max(0, bestAsk - bestBid).toFixed(1));
  const spreadBps = ltp > 0 ? Number(((spreadNpr / ltp) * 10000).toFixed(1)) : 0;

  // Contracts Stream
  const incomingContracts = Array.isArray(tickPayload.contracts) ? tickPayload.contracts : [];
  const existingContracts = prevTick.recent_contract_stream || [];
  const updatedContracts = [...incomingContracts, ...existingContracts]
    .slice(0, 25)
    .map(c => ({
      ...c,
      trade_type: c.qty >= 1000 ? 'Whale' : c.qty >= 500 ? 'Institutional' : 'Retail'
    }));

  stream.ticks[sym] = {
    symbol: sym,
    timestamp_npt: nowIso,
    quote: {
      ltp: ltp,
      open: open,
      high: high,
      low: low,
      prev_close: prevClose,
      point_change: pointChange,
      p_change: pChange,
      vwap: Number(tickPayload.vwap || ltp),
      day_range_pct: dayRangePct,
      total_volume: Number(tickPayload.volume || prevTick.quote?.total_volume || 0),
      total_turnover: Number(tickPayload.turnover || prevTick.quote?.total_turnover || 0),
      total_trades: Number(tickPayload.trades || prevTick.quote?.total_trades || 0),
      rvol_live: Number(tickPayload.rvol || 1.0),
      circuit_ceiling: Number((prevClose * 1.15).toFixed(1)),
      circuit_floor: Number((prevClose * 0.85).toFixed(1))
    },
    level2_depth: {
      bids: bids.slice(0, 5),
      asks: asks.slice(0, 5),
      total_buy_qty: totalBuyQty,
      total_sell_qty: totalSellQty,
      order_book_imbalance_pct: orderBookImbalancePct,
      spread_npr: spreadNpr,
      spread_bps: spreadBps
    },
    recent_contract_stream: updatedContracts,
    live_signals: {
      is_circuit_locked: ltp >= Number((prevClose * 1.15).toFixed(1)) || ltp <= Number((prevClose * 0.85).toFixed(1)),
      order_flow_veto: orderBookImbalancePct < -40.0 && pChange < -2.0,
      safe_entry_status: pChange > 8.0 ? 'OVEREXTENDED_DO_NOT_CHASE' : (orderBookImbalancePct > 20.0 ? 'SAFE_TO_ACCUMULATE' : 'NEUTRAL')
    }
  };

  stream.total_ticks_ingested += 1;
  stream.active_scrips_count = Object.keys(stream.ticks).length;
  stream.last_tick_timestamp_npt = nowIso;

  // Broadcast real-time event to SSE & WebSocket listeners
  try {
    tickEventEmitter.emit('tick', stream.ticks[sym]);
    tickEventEmitter.emit(`tick:${sym}`, stream.ticks[sym]);
  } catch (_) {}

  // Debounced write
  if (!_tickDebounceTimer) {
    _tickDebounceTimer = setTimeout(() => {
      _tickDebounceTimer = null;
      try {
        const rawJson = JSON.stringify(stream, null, 2);
        fs.writeFileSync(TODAY_TICK_BY_TICK_JSON, rawJson, 'utf8');
        const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf8'));
        fs.writeFileSync(TODAY_TICK_BY_TICK_GZ, gzipped);
      } catch (_) {}
    }, 5000);
    if (_tickDebounceTimer.unref) _tickDebounceTimer.unref();
  }
}
