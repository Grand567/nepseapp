/**
 * Accumulation & Distribution Quantitative Engine (NEPSE Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Combines classical mathematical models (Marc Chaikin ADL & CMF, Granville OBV,
 * Tom Williams Volume Spread Analysis, Richard Wyckoff Schematics) with NEPSE's
 * unique market microstructure (T+2 settlement, 10% daily circuit bands, absence
 * of short selling, and transparent public floor sheet broker-level tracking).
 */

import { getCachedRealPriceHistory } from './liveData';

export interface Candle {
  date?: string;
  time?: string;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ADLPoint {
  date?: string;
  close: number;
  high: number;
  low: number;
  volume: number;
  mfm: number;
  mfv: number;
  adl: number;
}

export interface ADLResult {
  currentADL: number;
  latestMFM: number;
  latestMFV: number;
  trend: 'Accumulation' | 'Distribution' | 'Neutral';
  divergence: 'Bullish Accumulation Divergence' | 'Bearish Distribution Divergence' | 'Confirmed Trend' | 'None';
  points: ADLPoint[];
}

export interface CMFResult {
  cmf: number;
  signal: 'Strong Accumulation' | 'Moderate Accumulation' | 'Neutral' | 'Moderate Distribution' | 'Heavy Distribution';
  score: number; // 0 to 100
}

export interface OBVPoint {
  date?: string;
  close: number;
  volume: number;
  obv: number;
}

export interface OBVResult {
  currentOBV: number;
  obvSMA20: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  points: OBVPoint[];
}

export interface BrokerDetail {
  broker: string;
  brokerName: string;
  volume: number;
  amount: number;
  pct: number;
  netQty: number;
  netAmount: number;
}

export interface BrokerConcentrationResult {
  symbol: string;
  totalBuyVolume: number;
  totalSellVolume: number;
  netVolume: number;
  bcr3BuyPct: number; // Top 3 Broker Buy %
  bcr5BuyPct: number; // Top 5 Broker Buy %
  bcr3SellPct: number; // Top 3 Broker Sell %
  topBuyerBrokers: BrokerDetail[];
  topSellerBrokers: BrokerDetail[];
  topNetAccumulators: BrokerDetail[];
  topNetDistributors: BrokerDetail[];
  avgBuyTradeSize: number;
  avgSellTradeSize: number;
  tradeSizeRatio: number; // Avg Buy Size / Avg Sell Size
  smartMoneyBias: 'Institutional Cornering' | 'Retail Absorption' | 'Operator Offloading' | 'Neutral';
  status?: 'insufficient_history' | 'complete';
}

export type WyckoffStage =
  | '🟢 STEALTH_ACCUMULATION'  // Phase B: Silent buying by smart money at bottoms
  | '⚡ SPRING_SHAKEOUT'        // Phase C: Deliberate false breakdown to trigger retail stops
  | '🚀 ACTIVE_PUMP_MARKUP'    // Phase D/E: Aggressive price markup, high demand
  | '⚠️ EUPHORIA_DISTRIBUTION' // Phase A/B/C Distribution: Churning at peak, top brokers selling
  | '🔴 ACTIVE_DUMP'           // Phase E Markdown: Panic selling, circuit traps
  | '💤 DORMANT_CONSOLIDATION';// Rangebound, neutral volume

export interface StockWyckoffAnalysis {
  stage: WyckoffStage;
  stageNameNepali: string;
  stageDescription: string;
  stealthScore: number;     // 0-100 (Higher = stronger stealth accumulation)
  pumpDumpRiskScore: number;// 0-100 (Higher = severe dump/trap risk)
  cmf: number;
  adlDivergence: string;
  tradeSizeRatio: number;
  topBuyerConcentrationPct: number;
  actionableGuidanceNepali: string;
  actionableGuidanceEnglish: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. DYNAMIC STOCK-SPECIFIC OHLCV CANDLE SYNTHESIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dynamic Stock-Specific Candle Synthesizer
 * Generates an authentic, mathematically sound multi-day OHLCV history tailored
 * strictly to that specific stock's live exchange profile:
 * - Anchored at today's exact live candle (open, high, low, close, volume, turnover)
 * - Yesterday's candle matches previousClose
 * - Historical trajectory guided by actual 52-week position, momentum (pChange), and sector volatility
 * - Seeded deterministically by symbol, so results are completely stable yet distinct across all 250+ scrips
 */
/**
 * Resolves genuine historical candle series for a stock.
 * Purged of all synthetic pseudo-random generators: NEVER manufactures fake historical candles.
 * Returns only genuine ingested historical candles or empty array.
 */
export function generateDynamicStockCandles(stock: any, days = 25): Candle[] {
  if (Array.isArray(stock?.candles) && stock.candles.length >= 10) {
    return stock.candles;
  }
  if (Array.isArray(stock?.history) && stock.history.length >= 10) {
    return stock.history.map((h: any) => ({
      date: h.date || h.businessDate || '',
      open: Number(h.open || h.close || 0),
      high: Number(h.high || h.close || 0),
      low: Number(h.low || h.close || 0),
      close: Number(h.close || 0),
      volume: Number(h.volume || 0)
    }));
  }
  const sym = String(stock?.symbol || stock?.scrip || '').toUpperCase().trim();
  if (sym) {
    const cached = getCachedRealPriceHistory(sym);
    if (Array.isArray(cached) && cached.length >= 10) {
      return cached.map((h: any) => ({
        date: h.date || h.businessDate || '',
        open: Number(h.open || h.close || 0),
        high: Number(h.high || h.close || 0),
        low: Number(h.low || h.close || 0),
        close: Number(h.close || 0),
        volume: Number(h.volume || 0)
      }));
    }
  }
  // Refuse to disguise a 1-day bar as historical multi-session candles.
  // Downstream quantitative engines must receive an authentic >=10 bar series or handle empty array.
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLASSICAL MATHEMATICAL FORMULATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Chaikin Accumulation / Distribution Line (ADL)
 * Formula:
 *   MFM = ((Close - Low) - (High - Close)) / (High - Low)
 *   MFV = MFM * Volume
 *   ADL_t = ADL_{t-1} + MFV_t
 */
export function calculateChaikinADL(candles: Candle[]): ADLResult {
  if (!Array.isArray(candles) || candles.length < 2) {
    return {
      currentADL: 0,
      latestMFM: 0,
      latestMFV: 0,
      trend: 'Neutral',
      divergence: 'None',
      points: []
    };
  }

  let cumulativeADL = 0;
  const points: ADLPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const high = Number(c.high) || Number(c.close) || 100;
    const low = Number(c.low) || Number(c.close) || 100;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    const range = high - low;
    // Money Flow Multiplier (CLV) is normalized to [-1, 1]
    const mfm = range > 0.0001
      ? Math.max(-1, Math.min(1, ((close - low) - (high - close)) / range))
      : 0;

    const mfv = mfm * volume;
    cumulativeADL += mfv;

    points.push({
      date: c.date || c.time,
      close,
      high,
      low,
      volume,
      mfm: Number(mfm.toFixed(4)),
      mfv: Math.round(mfv),
      adl: Math.round(cumulativeADL)
    });
  }

  const latest = points[points.length - 1];
  const first = points[0];
  const adlDelta = latest.adl - first.adl;
  const priceDelta = latest.close - first.close;

  let trend: ADLResult['trend'] = 'Neutral';
  if (adlDelta > 0) trend = 'Accumulation';
  else if (adlDelta < 0) trend = 'Distribution';

  // Divergence analysis over lookback window (e.g. last 14 bars)
  const lookback = Math.min(14, points.length);
  const baseline = points[points.length - lookback];
  const recentPriceChange = latest.close - baseline.close;
  const recentADLChange = latest.adl - baseline.adl;

  let divergence: ADLResult['divergence'] = 'None';
  if (recentPriceChange < 0 && recentADLChange > 0) {
    divergence = 'Bullish Accumulation Divergence';
  } else if (recentPriceChange > 0 && recentADLChange < 0) {
    divergence = 'Bearish Distribution Divergence';
  } else if (recentPriceChange > 0 && recentADLChange > 0) {
    divergence = 'Confirmed Trend';
  }

  return {
    currentADL: latest.adl,
    latestMFM: latest.mfm,
    latestMFV: latest.mfv,
    trend,
    divergence,
    points
  };
}

/**
 * 2. Chaikin Money Flow (CMF, 20-period standard)
 * Formula:
 *   CMF = Sum(MFV, 20) / Sum(Volume, 20)
 * Bounds: [-1.0, +1.0]
 */
export function calculateCMF(candles: Candle[], period = 20): CMFResult {
  if (!Array.isArray(candles) || candles.length < 5) {
    return { cmf: 0, signal: 'Neutral', score: 50 };
  }

  const windowCandles = candles.slice(-Math.min(period, candles.length));
  let sumMFV = 0;
  let sumVolume = 0;

  for (const c of windowCandles) {
    const high = Number(c.high) || Number(c.close) || 100;
    const low = Number(c.low) || Number(c.close) || 100;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    const range = high - low;
    const mfm = range > 0.0001
      ? Math.max(-1, Math.min(1, ((close - low) - (high - close)) / range))
      : 0;

    sumMFV += mfm * volume;
    sumVolume += volume;
  }

  const rawCMF = sumVolume > 0 ? sumMFV / sumVolume : 0;
  const cmf = Number(Math.max(-1, Math.min(1, rawCMF)).toFixed(3));

  let signal: CMFResult['signal'] = 'Neutral';
  if (cmf >= 0.15) signal = 'Strong Accumulation';
  else if (cmf >= 0.05) signal = 'Moderate Accumulation';
  else if (cmf <= -0.15) signal = 'Heavy Distribution';
  else if (cmf <= -0.05) signal = 'Moderate Distribution';

  // Normalize to 0-100 score: CMF = -0.30 -> 0, CMF = 0 -> 50, CMF = +0.30 -> 100
  const normalizedScore = Math.round(Math.max(0, Math.min(100, 50 + (cmf / 0.30) * 50)));

  return { cmf, signal, score: normalizedScore };
}

/**
 * 3. On-Balance Volume (OBV)
 */
export function calculateOBV(candles: Candle[]): OBVResult {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { currentOBV: 0, obvSMA20: 0, trend: 'Neutral', points: [] };
  }

  let cumulativeOBV = 0;
  const points: OBVPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? (candles[i - 1].close || c.close) : c.close;
    const close = Number(c.close) || 100;
    const volume = Math.max(0, Number(c.volume) || 0);

    if (close > prevClose) {
      cumulativeOBV += volume;
    } else if (close < prevClose) {
      cumulativeOBV -= volume;
    }

    points.push({
      date: c.date || c.time,
      close,
      volume,
      obv: cumulativeOBV
    });
  }

  // 20-period SMA of OBV
  const recent = points.slice(-20);
  const obvSMA20 = Math.round(recent.reduce((acc, p) => acc + p.obv, 0) / Math.max(1, recent.length));
  const currentOBV = points[points.length - 1].obv;

  const trend: OBVResult['trend'] =
    currentOBV > obvSMA20 * 1.02 ? 'Bullish' : currentOBV < obvSMA20 * 0.98 ? 'Bearish' : 'Neutral';

  return {
    currentOBV,
    obvSMA20,
    trend,
    points
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NEPSE FLOOR SHEET & MICROSTRUCTURE MODELS
// ─────────────────────────────────────────────────────────────────────────────

export const NEPSE_BROKER_NAMES: Record<string, string> = {
  '1': 'Kumari Securities',
  '2': 'Pandupati Associates',
  '3': 'Arun Securities',
  '4': 'Opal Securities Investment',
  '5': 'Market Securities Exchange',
  '6': 'Agrawal Securities',
  '7': 'Jwala Broker',
  '8': 'Ashutosh Brokerage',
  '10': 'Pragyan Securities',
  '11': 'Malla & Malla Stock',
  '13': 'Thrive Brokerage',
  '14': 'Nepal Stock House',
  '16': 'Primo Securities',
  '17': 'ABC Securities',
  '18': 'Sagarmatha Securities',
  '19': 'Nepal Investment & Securities',
  '20': 'Sipla Securities',
  '21': 'Midas Stock Broking',
  '22': 'Siprabi Securities',
  '25': 'Sweta Securities',
  '26': 'Asian Securities',
  '28': 'Shree Krishna Securities',
  '29': 'Trishakti Securities',
  '32': 'Premier Securities',
  '33': 'Dakshinkali Investment',
  '34': 'Vision Securities',
  '35': 'Kohinoor Investment',
  '36': 'Secured Securities',
  '37': 'Swarna Laxmi Securities',
  '38': 'Dipshikha Dhitopatra Karobar',
  '39': 'Sumeru Securities',
  '40': 'Creative Securities',
  '41': 'Linche Securities',
  '42': 'Sani Securities',
  '43': 'South Asian Bulls',
  '44': 'Dynamic Money Managers',
  '45': 'Imperial Securities',
  '46': 'Kalika Securities',
  '47': 'Nivana Capital Market',
  '48': 'Trishul Securities',
  '49': 'Online Securities',
  '50': 'Crystal Kanchenjunga',
  '51': 'Oxford Securities',
  '52': 'Sundhara Securities',
  '53': 'Investment Management Nepal',
  '54': 'Sewa Securities',
  '55': 'Bhikshu Brokerage',
  '56': 'Sri Hari Securities',
  '57': 'Aryatara Investment & Securities',
  '58': 'Naasa Securities',
  '59': 'Premier Securities',
  '60': 'Garima Securities',
  '61': 'Bhole Ganesh Securities',
  '62': 'Capital Max Securities',
  '63': 'Himalayan Brokerage',
  '64': 'Sani Securities Ltd.',
  '65': 'Sun Securities',
  '66': 'Sharepro Securities',
  '67': 'Elite Stock'
};

export function getBrokerName(brokerId: string | number): string {
  const cleanId = String(brokerId || '').replace(/^0+/, '').trim();
  return NEPSE_BROKER_NAMES[cleanId] || `Broker #${cleanId || 'N/A'}`;
}

/**
 * Computes Broker Concentration (BCR) and Smart Money vs Retail trade ticket asymmetry.
 * In NEPSE, a high Average Buy Ticket Size vs Average Sell Ticket Size means
 * smart operators are buying up shares from small retail sellers.
 */
export function calculateBrokerConcentration(
  floorsheet: any[],
  targetSymbol: string,
  stockSummary?: any
): BrokerConcentrationResult {
  const normSym = String(targetSymbol || '').toUpperCase().trim();
  const trades = Array.isArray(floorsheet)
    ? floorsheet.filter((t: any) => {
        const s = String(t.symbol || t.stockSymbol || '').toUpperCase().trim();
        return s === normSym;
      })
    : [];

  const rba = stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
  const hasSubstantialTrades = trades.length >= 10;

  if (!hasSubstantialTrades) {
    if (rba && (rba.topBuyers?.length > 0 || rba.topNetBuyers?.length > 0 || rba.buyers?.length > 0)) {
      const rawBuyers = rba.topBuyers || rba.buyers || [];
    const rawSellers = rba.topSellers || rba.sellers || [];

    const topBuyers: BrokerDetail[] = rawBuyers.slice(0, 5).map((b: any) => {
      const id = String(b.broker || b.brokerNo || b.memberId || b.id || b.brokerId || '').trim();
      const vol = Number(b.buyQty || b.shares || b.qty || b.volume || 0);
      const amt = Number(b.buyAmt || b.amount || b.buyAmount || (vol * (stockSummary?.ltp || 300)));
      return {
        broker: id,
        brokerName: b.name || b.brokerName || getBrokerName(id),
        volume: vol,
        amount: amt,
        pct: Number(b.pct || 0),
        netQty: Number(b.netQty || vol),
        netAmount: Number(b.netAmt || amt)
      };
    });

    const topSellers: BrokerDetail[] = rawSellers.slice(0, 5).map((s: any) => {
      const id = String(s.broker || s.brokerNo || s.memberId || s.id || s.brokerId || '').trim();
      const vol = Number(s.sellQty || s.shares || s.qty || s.volume || 0);
      const amt = Number(s.sellAmt || s.amount || s.sellAmount || (vol * (stockSummary?.ltp || 300)));
      return {
        broker: id,
        brokerName: s.name || s.brokerName || getBrokerName(id),
        volume: vol,
        amount: amt,
        pct: Number(s.pct || 0),
        netQty: Number(s.netQty || -vol),
        netAmount: Number(s.netAmt || -amt)
      };
    });

    const topNetAccumulators: BrokerDetail[] = (rba.topNetBuyers || topBuyers.filter(b => b.netQty > 0)).slice(0, 5).map((b: any) => {
      const id = String(b.broker || b.brokerNo || b.memberId || b.id || b.brokerId || '').trim();
      const vol = Number(b.netQty || b.buyQty || b.volume || 0);
      const amt = Number(b.netAmt || b.buyAmt || b.amount || (vol * (stockSummary?.ltp || 300)));
      return {
        broker: id,
        brokerName: b.name || b.brokerName || getBrokerName(id),
        volume: Number(b.buyQty || vol),
        amount: amt,
        pct: Number(b.pct || 0),
        netQty: vol,
        netAmount: amt
      };
    });

    const topNetDistributors: BrokerDetail[] = (rba.topNetSellers || topSellers.filter(s => s.netQty < 0)).slice(0, 5).map((s: any) => {
      const id = String(s.broker || s.brokerNo || s.memberId || s.id || s.brokerId || '').trim();
      const vol = Math.abs(Number(s.netQty || s.sellQty || s.volume || 0));
      const amt = Math.abs(Number(s.netAmt || s.sellAmt || s.amount || (vol * (stockSummary?.ltp || 300))));
      return {
        broker: id,
        brokerName: s.name || s.brokerName || getBrokerName(id),
        volume: Number(s.sellQty || vol),
        amount: amt,
        pct: Number(s.pct || 0),
        netQty: -vol,
        netAmount: -amt
      };
    });

    const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
    const top5BuyVol = topBuyers.slice(0, 5).reduce((acc, b) => acc + b.volume, 0);
    const top3SellVol = topSellers.slice(0, 3).reduce((acc, s) => acc + s.volume, 0);
    const top5SellVol = topSellers.slice(0, 5).reduce((acc, s) => acc + s.volume, 0);

    const stockTotalVol = Number(
      stockSummary?.totalTradedQuantity ||
      stockSummary?.volume ||
      stockSummary?.totalVolume ||
      0
    );

    // Identify True Total Volume for the period
    const rbaTotalBuyVol = Number(
      rba.totalBuyVol ||
      rba.totalVolume ||
      rba.totalTradedQty ||
      rba.totalQty ||
      (Array.isArray(rba.brokers) && rba.brokers.length > 5
        ? rba.brokers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.volume || 0), 0)
        : 0) ||
      (rawBuyers.length > 5
        ? rawBuyers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0)
        : 0) ||
      (stockTotalVol > top5BuyVol ? stockTotalVol : 0)
    );

    const rbaTotalSellVol = Number(
      rba.totalSellVol ||
      rba.totalVolume ||
      rba.totalTradedQty ||
      rba.totalQty ||
      (Array.isArray(rba.brokers) && rba.brokers.length > 5
        ? rba.brokers.reduce((acc: number, b: any) => acc + Number(b.sellQty || b.volume || 0), 0)
        : 0) ||
      (rawSellers.length > 5
        ? rawSellers.reduce((acc: number, s: any) => acc + Number(s.sellQty || s.volume || s.shares || 0), 0)
        : 0) ||
      (stockTotalVol > top5SellVol ? stockTotalVol : 0)
    );

    let bcr5BuyPct = 0;
    let bcr3BuyPct = 0;
    let bcr3SellPct = 0;

    // 1. Check if authentic concentration was already calculated at server/vault level
    if (rba.crb5 !== undefined && Number(rba.crb5) > 0) {
      bcr5BuyPct = Number((Number(rba.crb5) * 100).toFixed(1));
      bcr3BuyPct = Number((bcr5BuyPct * 0.72).toFixed(1));
    } else if (rba.bcr5BuyPct !== undefined && Number(rba.bcr5BuyPct) > 0) {
      bcr5BuyPct = Number(rba.bcr5BuyPct);
      bcr3BuyPct = Number(rba.bcr3BuyPct || (bcr5BuyPct * 0.72).toFixed(1));
    } else if (rba.concentrationPct !== undefined && Number(rba.concentrationPct) > 0) {
      bcr3BuyPct = Number(rba.concentrationPct);
      bcr5BuyPct = Number(Math.min(92.0, bcr3BuyPct * 1.25).toFixed(1));
    } else {
      // 2. Check if individual brokers have authentic pct shares whose sum is < 98%
      const sumBuyerPct = topBuyers.reduce((acc, b) => acc + b.pct, 0);
      if (sumBuyerPct > 0 && sumBuyerPct < 98.0) {
        bcr5BuyPct = Number(sumBuyerPct.toFixed(1));
        bcr3BuyPct = Number(topBuyers.slice(0, 3).reduce((acc, b) => acc + b.pct, 0).toFixed(1));
      } else {
        // 3. Compute from volumes against true total buy volume
        const effectiveBuyVol = rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : (stockTotalVol > 0 ? stockTotalVol : top5BuyVol);
        bcr5BuyPct = effectiveBuyVol > 0 ? Number(Math.min(100.0, (top5BuyVol / effectiveBuyVol) * 100).toFixed(1)) : 0;
        bcr3BuyPct = effectiveBuyVol > 0 ? Number(Math.min(bcr5BuyPct, (top3BuyVol / effectiveBuyVol) * 100).toFixed(1)) : 0;
      }
    }

    const effectiveSellVol = rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : (stockTotalVol > 0 ? stockTotalVol : top5SellVol);
    bcr3SellPct = effectiveSellVol > 0 ? Number(Math.min(100.0, (top3SellVol / effectiveSellVol) * 100).toFixed(1)) : 0;

    // Fill in individual pct for buyers/sellers against true market base
    const marketBuyBase = (rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : (stockTotalVol > 0 ? stockTotalVol : (bcr5BuyPct > 0 ? Math.round(top5BuyVol / (bcr5BuyPct / 100)) : top5BuyVol))) || 1;
    topBuyers.forEach(b => {
      b.pct = Number(((b.volume / marketBuyBase) * 100).toFixed(1));
    });

    const marketSellBase = (rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : (stockTotalVol > 0 ? stockTotalVol : (bcr3SellPct > 0 ? Math.round(top5SellVol / (bcr3SellPct / 100)) : top5SellVol))) || 1;
    topSellers.forEach(s => {
      s.pct = Number(((s.volume / marketSellBase) * 100).toFixed(1));
    });

    const totalBuyVol = rbaTotalBuyVol > top5BuyVol ? rbaTotalBuyVol : top5BuyVol;
    const totalSellVol = rbaTotalSellVol > top5SellVol ? rbaTotalSellVol : top5SellVol;

    const totalTradesCount = Number(stockSummary?.transactions || stockSummary?.totalTransactions || rba.totalTrades || 0);
    const avgBuyTradeSize = totalTradesCount > 0 ? Math.round(totalBuyVol / totalTradesCount) : 0;
    const avgSellTradeSize = totalTradesCount > 0 ? Math.round(totalSellVol / totalTradesCount) : 0;
    const tradeSizeRatio = avgSellTradeSize > 0 ? Number((avgBuyTradeSize / avgSellTradeSize).toFixed(2)) : 1.0;

    let smartMoneyBias: BrokerConcentrationResult['smartMoneyBias'] = 'Neutral';
    if (bcr5BuyPct >= 48 && tradeSizeRatio >= 1.40) {
      smartMoneyBias = 'Institutional Cornering';
    } else if (bcr3SellPct >= 42 && tradeSizeRatio <= 0.70) {
      smartMoneyBias = 'Operator Offloading';
    } else if (bcr5BuyPct > bcr3SellPct && tradeSizeRatio >= 1.05) {
      smartMoneyBias = 'Retail Absorption';
    }

    return {
      symbol: normSym,
      totalBuyVolume: totalBuyVol,
      totalSellVolume: totalSellVol,
      netVolume: totalBuyVol - totalSellVol,
      bcr3BuyPct,
      bcr5BuyPct,
      bcr3SellPct,
      topBuyerBrokers: topBuyers,
      topSellerBrokers: topSellers,
      topNetAccumulators,
      topNetDistributors,
      avgBuyTradeSize,
      avgSellTradeSize,
      tradeSizeRatio,
      smartMoneyBias,
      status: 'complete'
    };
  }

  // Fiduciary Standard: When neither authentic floorsheet trades nor real broker analysis exist,
  // return an honest 'insufficient_history' payload. NEVER manufacture fake broker footprints or PRNG seeds.
  return {
    symbol: normSym,
    totalBuyVolume: 0,
    totalSellVolume: 0,
    netVolume: 0,
    bcr3BuyPct: 0,
    bcr5BuyPct: 0,
    bcr3SellPct: 0,
    topBuyerBrokers: [],
    topSellerBrokers: [],
    topNetAccumulators: [],
    topNetDistributors: [],
    avgBuyTradeSize: 0,
    avgSellTradeSize: 0,
    tradeSizeRatio: 1.0,
    smartMoneyBias: 'Neutral',
    status: 'insufficient_history'
  };
}

  const buyersMap = new Map<string, { volume: number; amount: number; count: number }>();
  const sellersMap = new Map<string, { volume: number; amount: number; count: number }>();
  let totalBuyVol = 0;
  let totalSellVol = 0;
  let totalBuyTrades = 0;
  let totalSellTrades = 0;

  trades.forEach((t: any) => {
    const qty = Number(t.quantity || t.qty || 0);
    const rate = Number(t.rate || t.price || 0);
    const amt = Number(t.amount || (qty * rate) || 0);
    const bId = String(t.buyer || t.buyerBroker || '').replace(/^0+/, '').trim();
    const sId = String(t.seller || t.sellerBroker || '').replace(/^0+/, '').trim();

    if (bId && qty > 0) {
      if (!buyersMap.has(bId)) buyersMap.set(bId, { volume: 0, amount: 0, count: 0 });
      const b = buyersMap.get(bId)!;
      b.volume += qty;
      b.amount += amt;
      b.count += 1;
      totalBuyVol += qty;
      totalBuyTrades += 1;
    }

    if (sId && qty > 0) {
      if (!sellersMap.has(sId)) sellersMap.set(sId, { volume: 0, amount: 0, count: 0 });
      const s = sellersMap.get(sId)!;
      s.volume += qty;
      s.amount += amt;
      s.count += 1;
      totalSellVol += qty;
      totalSellTrades += 1;
    }
  });

  const sortedBuyers: BrokerDetail[] = Array.from(buyersMap.entries())
    .map(([broker, data]) => {
      const sData = sellersMap.get(broker) || { volume: 0, amount: 0, count: 0 };
      return {
        broker,
        brokerName: getBrokerName(broker),
        volume: data.volume,
        amount: data.amount,
        pct: totalBuyVol > 0 ? Number(((data.volume / totalBuyVol) * 100).toFixed(1)) : 0,
        netQty: data.volume - sData.volume,
        netAmount: data.amount - sData.amount
      };
    })
    .sort((a, b) => b.volume - a.volume);

  const sortedSellers: BrokerDetail[] = Array.from(sellersMap.entries())
    .map(([broker, data]) => {
      const bData = buyersMap.get(broker) || { volume: 0, amount: 0, count: 0 };
      return {
        broker,
        brokerName: getBrokerName(broker),
        volume: data.volume,
        amount: data.amount,
        pct: totalSellVol > 0 ? Number(((data.volume / totalSellVol) * 100).toFixed(1)) : 0,
        netQty: bData.volume - data.volume,
        netAmount: bData.amount - data.amount
      };
    })
    .sort((a, b) => b.volume - a.volume);

  // Top Net Accumulators (Net Buyers: buyVol > sellVol)
  const allBrokers = Array.from(new Set([...buyersMap.keys(), ...sellersMap.keys()]));
  const enrichedBrokers = allBrokers.map(bId => {
    const b = buyersMap.get(bId) || { volume: 0, amount: 0, count: 0 };
    const s = sellersMap.get(bId) || { volume: 0, amount: 0, count: 0 };
    const netQty = b.volume - s.volume;
    const netAmount = b.amount - s.amount;
    return {
      broker: bId,
      brokerName: getBrokerName(bId),
      volume: b.volume,
      amount: b.amount,
      pct: totalBuyVol > 0 ? Number(((b.volume / totalBuyVol) * 100).toFixed(1)) : 0,
      netQty,
      netAmount
    };
  });

  const topNetAccumulators: BrokerDetail[] = enrichedBrokers
    .filter(b => b.netQty > 0)
    .sort((a, b) => b.netQty - a.netQty)
    .slice(0, 5);

  const topNetDistributors: BrokerDetail[] = enrichedBrokers
    .filter(b => b.netQty < 0)
    .sort((a, b) => a.netQty - b.netQty) // Most negative first
    .map(b => {
      const s = sellersMap.get(b.broker) || { volume: 0, amount: 0, count: 0 };
      return {
        ...b,
        volume: s.volume,
        amount: s.amount,
        pct: totalSellVol > 0 ? Number(((s.volume / totalSellVol) * 100).toFixed(1)) : 0
      };
    })
    .slice(0, 5);

  const top3BuyVol = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
  const top5BuyVol = sortedBuyers.slice(0, 5).reduce((acc, b) => acc + b.volume, 0);
  const top3SellVol = sortedSellers.slice(0, 3).reduce((acc, s) => acc + s.volume, 0);

  const stockTotalVol = Number(stockSummary?.totalTradedQuantity || stockSummary?.volume || 0);
  const effectiveMarketBuyVol = stockTotalVol > totalBuyVol ? stockTotalVol : totalBuyVol;
  const effectiveMarketSellVol = stockTotalVol > totalSellVol ? stockTotalVol : totalSellVol;

  let bcr3BuyPct = 0;
  let bcr5BuyPct = 0;
  let bcr3SellPct = 0;

  if (effectiveMarketBuyVol > 0) {
    bcr5BuyPct = Number(Math.min(100.0, (top5BuyVol / effectiveMarketBuyVol) * 100).toFixed(1));
    bcr3BuyPct = Number(Math.min(bcr5BuyPct, (top3BuyVol / effectiveMarketBuyVol) * 100).toFixed(1));
  }

  if (effectiveMarketSellVol > 0) {
    bcr3SellPct = Number(Math.min(100.0, (top3SellVol / effectiveMarketSellVol) * 100).toFixed(1));
  }

  const avgBuyTradeSize = totalBuyTrades > 0 ? Math.round(totalBuyVol / totalBuyTrades) : 0;
  const avgSellTradeSize = totalSellTrades > 0 ? Math.round(totalSellVol / totalSellTrades) : 0;
  const tradeSizeRatio = avgSellTradeSize > 0 ? Number((avgBuyTradeSize / avgSellTradeSize).toFixed(2)) : 1.0;

  let smartMoneyBias: BrokerConcentrationResult['smartMoneyBias'] = 'Neutral';
  if (bcr5BuyPct >= 45 && tradeSizeRatio >= 1.5) {
    smartMoneyBias = 'Institutional Cornering';
  } else if (bcr3SellPct >= 45 && tradeSizeRatio <= 0.65) {
    smartMoneyBias = 'Operator Offloading';
  } else if (bcr5BuyPct > bcr3SellPct) {
    smartMoneyBias = 'Retail Absorption';
  }

  return {
    symbol: normSym,
    totalBuyVolume: totalBuyVol,
    totalSellVolume: totalSellVol,
    netVolume: totalBuyVol - totalSellVol,
    bcr3BuyPct,
    bcr5BuyPct,
    bcr3SellPct,
    topBuyerBrokers: sortedBuyers.slice(0, 5),
    topSellerBrokers: sortedSellers.slice(0, 5),
    topNetAccumulators,
    topNetDistributors,
    avgBuyTradeSize,
    avgSellTradeSize,
    tradeSizeRatio,
    smartMoneyBias,
    status: 'complete'
  };
}

export function formatBrokerAmount(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}Rs. ${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}Rs. ${(abs / 100000).toFixed(2)} L`;
  return `${sign}Rs. ${Math.round(abs).toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPOSITE WYCKOFF STAGE & PUMP-DUMP RISK SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates a comprehensive Stealth Accumulation Score (0 to 100).
 * Combines price consolidation tightness, CMF, ADL slope, and broker absorption.
 */
export function calculateStealthAccumulationScore(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): number {
  const pChange = Number(stock?.pChange || stock?.pointChange || 0);
  const volumeSurge = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);
  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  if (!effectiveCandles || effectiveCandles.length < 10) {
    return 0;
  }
  
  // 1. CMF factor (0 to 30 pts)
  const cmfRes = calculateCMF(effectiveCandles, 20);
  const cmfScore = (cmfRes.score / 100) * 30;

  // 2. Low Volatility Consolidation factor (0 to 25 pts)
  // Stealth accumulation occurs when price is quiet (-1% to +2%), not during parabolic swings
  let tightnessScore = 15;
  if (pChange >= -1.0 && pChange <= 2.0) {
    tightnessScore = 25;
  } else if (pChange > 2.0 && pChange <= 5.0) {
    tightnessScore = 18;
  } else if (pChange > 5.0) {
    tightnessScore = 8; // already markup/pumping, not stealth
  } else if (pChange < -2.0) {
    tightnessScore = 5;
  }

  // 3. Broker Concentration & Trade Size Asymmetry (0 to 30 pts)
  let brokerScore = 15;
  if (brokerFlow && brokerFlow.bcr5BuyPct > 0) {
    if (brokerFlow.bcr5BuyPct >= 50 && brokerFlow.tradeSizeRatio >= 1.8) {
      brokerScore = 30; // Strong institutional accumulation
    } else if (brokerFlow.bcr5BuyPct >= 40 && brokerFlow.tradeSizeRatio >= 1.2) {
      brokerScore = 22;
    } else if (brokerFlow.tradeSizeRatio < 0.8) {
      brokerScore = 5; // Sellers dominating ticket size
    }
  } else {
    // Fallback based on volume consistency
    if (volumeSurge >= 1.1 && volumeSurge <= 2.2 && pChange >= 0) {
      brokerScore = 22;
    }
  }

  // 4. ADL Divergence bonus (0 to 15 pts)
  let divScore = 8;
  const adlRes = calculateChaikinADL(effectiveCandles);
  if (adlRes.divergence === 'Bullish Accumulation Divergence') {
    divScore = 15;
  } else if (adlRes.divergence === 'Bearish Distribution Divergence') {
    divScore = 0;
  }

  const total = Math.round(cmfScore + tightnessScore + brokerScore + divScore);
  return Math.max(5, Math.min(98, total));
}

/**
 * Calculates a dedicated Pump & Dump Risk Score (0 to 100).
 * High risk triggers when:
 * 1. Price is up massively over short period (e.g. 40%+ over 2 weeks).
 * 2. Record volume at or near upper circuit with wide wicks (churn).
 * 3. Top brokers flip to heavy net selling (distributing to retail).
 * 4. T+2 settlement risk (retail trapped if price reverses tomorrow).
 */
export function calculatePumpDumpRiskScore(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): {
  riskScore: number;
  level: 'Low Risk' | 'Moderate Vigilance' | 'Elevated Dump Warning' | 'Extreme Operator Trap';
  reasons: string[];
} {
  const reasons: string[] = [];

  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  if (!effectiveCandles || effectiveCandles.length < 10) {
    return {
      riskScore: 0,
      level: 'Low Risk',
      reasons: ['Insufficient historical candles (< 10 trading sessions) to evaluate pump/dump volatility']
    };
  }

  const pChange = Number(stock?.pChange || 0);
  const ltp = Number(stock?.ltp || stock?.closePrice || 100);
  const high52 = Number(stock?.high52 || stock?.high52w || ltp * 1.5);
  const low52 = Number(stock?.low52 || stock?.low52w || ltp * 0.7);
  const volumeSurge = Number(stock?.volumeSurgeRatio || stock?.rvol || 1.0);

  // 1. Proximity to 52-week peak after explosive run (0 to 24 pts continuous)
  const range52 = high52 - low52;
  const pctFromLow = range52 > 0 ? ((ltp - low52) / range52) * 100 : 50;
  let rangeRisk = Math.round((pctFromLow / 100) * 18);
  if (pctFromLow >= 85) {
    rangeRisk += 6;
    reasons.push('Trading near 52-week peak after extended multi-week rally');
  }

  // 2. Churn / Volume Surge (0 to 22 pts continuous)
  let volRisk = 5;
  if (volumeSurge >= 2.5) {
    volRisk = Math.min(22, Math.round(14 + (volumeSurge - 2.5) * 4));
    reasons.push(`Abnormal volume spike (${volumeSurge.toFixed(1)}x normal volume) indicating heavy inventory churn`);
  } else if (volumeSurge >= 1.2) {
    volRisk = Math.round(5 + (volumeSurge - 1.2) * 7);
  }

  // 3. Candle Rejection Wick / Overhang (0 to 24 pts continuous)
  let wickRisk = 4;
  if (effectiveCandles.length > 0) {
    const latestCandle = effectiveCandles[effectiveCandles.length - 1];
    const high = latestCandle.high || ltp;
    const low = latestCandle.low || ltp;
    const close = latestCandle.close || ltp;
    const candleRange = high - low;
    if (candleRange > 0) {
      const upperWick = high - Math.max(close, latestCandle.open || close);
      const upperWickPct = (upperWick / candleRange) * 100;
      wickRisk = Math.round((upperWickPct / 100) * 18);
      if (upperWickPct >= 45 && volumeSurge >= 1.3) {
        wickRisk += 6;
        reasons.push('Prominent upper wick (rejection candle) on heavy volume — supply hitting bids');
      }
    }

    // ADL Bearish Divergence
    const adlRes = calculateChaikinADL(effectiveCandles);
    if (adlRes.divergence === 'Bearish Distribution Divergence') {
      wickRisk += 14;
      reasons.push('Bearish ADL divergence: Price making highs while money flow line is falling');
    }
  }

  // 4. Broker Floor Sheet Distribution Signs (0 to 25 pts continuous)
  let brokerRisk = 5;
  if (brokerFlow && brokerFlow.bcr3SellPct > 0) {
    if (brokerFlow.bcr3SellPct >= 45 && brokerFlow.tradeSizeRatio <= 0.65) {
      brokerRisk = 24;
      reasons.push(`Top 3 brokers offloading ${brokerFlow.bcr3SellPct}% of sell volume onto retail in small lots`);
    } else if (brokerFlow.smartMoneyBias === 'Operator Offloading') {
      brokerRisk = 18;
      reasons.push('Floor sheet indicates syndicate accounts are net distributing');
    } else if (brokerFlow.tradeSizeRatio < 0.90) {
      brokerRisk = Math.round(8 + (0.90 - brokerFlow.tradeSizeRatio) * 18);
    }
  }

  // 5. Momentum Euphoria / Circuit (0 to 12 pts) — Evaluates 15% Daily Circuit Ceiling
  let euphoriaRisk = 0;
  if (pChange >= 14.2) {
    euphoriaRisk = 12;
    reasons.push('Upper Circuit (+15%): High T+2 trap risk if buying at current euphoria');
  } else if (pChange >= 9.5) {
    euphoriaRisk = 8;
    reasons.push('Strong Intraday Momentum (+9.5% to +14%): Approaching 15% circuit ceiling');
  } else if (pChange > 4) {
    euphoriaRisk = Math.min(6, Math.round((pChange - 4) * 1.2));
  }

  const rawScore = rangeRisk + volRisk + wickRisk + brokerRisk + euphoriaRisk;
  const finalScore = Math.max(5, Math.min(95, Math.round(rawScore)));
  let level: 'Low Risk' | 'Moderate Vigilance' | 'Elevated Dump Warning' | 'Extreme Operator Trap' = 'Low Risk';

  if (finalScore >= 75) level = 'Extreme Operator Trap';
  else if (finalScore >= 55) level = 'Elevated Dump Warning';
  else if (finalScore >= 35) level = 'Moderate Vigilance';

  return {
    riskScore: finalScore,
    level,
    reasons
  };
}

/**
 * Classifies the exact Wyckoff stage tailored to NEPSE dynamics.
 */
export function classifyWyckoffStage(
  stock: any,
  candles: Candle[] = [],
  brokerFlow?: BrokerConcentrationResult
): StockWyckoffAnalysis {
  const effectiveCandles = (Array.isArray(candles) && candles.length >= 10)
    ? candles
    : generateDynamicStockCandles(stock, 25);

  if (!effectiveCandles || effectiveCandles.length < 10) {
    return {
      stage: '💤 DORMANT_CONSOLIDATION',
      stageNameNepali: 'इतिहास अपर्याप्त (< १० सत्र)',
      stageDescription: 'Insufficient historical daily candles (< 10 trading sessions) to determine Wyckoff phase reliably.',
      stealthScore: 0,
      pumpDumpRiskScore: 0,
      cmf: 0,
      adlDivergence: 'None',
      tradeSizeRatio: brokerFlow?.tradeSizeRatio || 1.0,
      topBuyerConcentrationPct: brokerFlow?.bcr5BuyPct || 0,
      actionableGuidanceNepali: 'इतिहास संकलन हुँदैछ: प्रामाणिक विगत डेटा लोड भएपछि मात्र विश्लेषण सम्भव छ।',
      actionableGuidanceEnglish: 'Awaiting authentic multi-day price history. Cannot formulate Wyckoff schematic on single-session quotes.'
    };
  }

  const pChange = Number(stock?.pChange || stock?.pointChange || 0);
  const stealthScore = calculateStealthAccumulationScore(stock, effectiveCandles, brokerFlow);
  const pumpDump = calculatePumpDumpRiskScore(stock, effectiveCandles, brokerFlow);
  const cmfRes = calculateCMF(effectiveCandles, 20);
  const adlRes = calculateChaikinADL(effectiveCandles);
  const tradeSizeRatio = brokerFlow?.tradeSizeRatio || 1.0;
  const topBuyerConcentrationPct = brokerFlow?.bcr5BuyPct || 0;

  let stage: WyckoffStage = '💤 DORMANT_CONSOLIDATION';
  let stageNameNepali = 'निष्क्रिय / सामान्य अवस्था';
  let stageDescription = 'Volume and price action are neutral without institutional dominance.';
  let actionableGuidanceNepali = 'पर्खनुहोस् (Wait & Watch): संस्थागत वा अपरेटर गतिविधि स्पष्ट नहुन्जेल प्रवेश नगर्नुहोस्।';
  let actionableGuidanceEnglish = 'Hold or observe; avoid entry until clear institutional footprint appears.';

  // Logic tree for stage classification
  if (pumpDump.riskScore >= 70 || (pumpDump.riskScore >= 55 && pChange > 5)) {
    stage = '⚠️ EUPHORIA_DISTRIBUTION';
    stageNameNepali = 'वितरण / माल फाल्ने खतरा (Distribution Climax)';
    stageDescription = 'Peak turnover with heavy selling from top brokers into retail buying frenzy.';
    actionableGuidanceNepali = 'नाफा सुरक्षित गर्नुहोस् (Book Profit): नयाँ खरिद नगर्नुहोस्। अपरेटरहरूले माल फाल्ने क्रम सुरु भएको छ।';
    actionableGuidanceEnglish = 'Book profits and avoid fresh entries. High probability of retail trap before markdown.';
  } else if (pChange <= -4.0 && (cmfRes.cmf < -0.05 || pumpDump.riskScore >= 50)) {
    stage = '🔴 ACTIVE_DUMP';
    stageNameNepali = 'डम्पिङ / बियरिस पतन (Active Markdown)';
    stageDescription = 'Selling supply dominating order book; buyers are absent or trapped.';
    actionableGuidanceNepali = 'जोखिम नियन्त्रण (Exit / Stop Loss): तल्लो सर्किटको जोखिम छ। तत्काल स्टप लस पालना गर्नुहोस्।';
    actionableGuidanceEnglish = 'Cut losses and preserve capital. Do not attempt to catch falling knives.';
  } else if (pChange >= 3.5 && cmfRes.cmf >= 0.05) {
    stage = '🚀 ACTIVE_PUMP_MARKUP';
    stageNameNepali = 'पम्पिङ / तीव्र वृद्धि (Active Markup)';
    stageDescription = 'Demand outstrips supply with strong momentum and expansion.';
    actionableGuidanceNepali = 'ट्रेन्ड फलो गर्नुहोस् (Ride the Trend): ट्रेलिङ स्टप लस (Trailing SL) प्रयोग गरी नाफा बढाउनुहोस्।';
    actionableGuidanceEnglish = 'Ride momentum with trailing stops. Avoid FOMO chasing near circuit ceilings.';
  } else if (pChange <= -1.5 && pChange >= -4.5 && cmfRes.cmf >= 0.08 && adlRes.divergence === 'Bullish Accumulation Divergence') {
    stage = '⚡ SPRING_SHAKEOUT';
    stageNameNepali = 'झट्का / स्प्रिङ (Wyckoff Spring Shakeout)';
    stageDescription = 'False breakdown to panic retail sellers while smart money accumulates heavily.';
    actionableGuidanceNepali = 'अवसर पहिचान (Reversal Setup): कम जोखिममा संकलन गर्ने उपयुक्त मौका, सपोर्ट पुष्टि भएपछि प्रवेश गर्नुहोस्।';
    actionableGuidanceEnglish = 'High-reward reversal setup. Accumulate on confirmation of support holding.';
  } else if (stealthScore >= 60 || (cmfRes.cmf >= 0.08 && tradeSizeRatio >= 1.3)) {
    stage = '🟢 STEALTH_ACCUMULATION';
    stageNameNepali = 'गोप्य संकलन / कर्नरिङ (Stealth Accumulation)';
    stageDescription = 'Smart money quietly accumulating shares in tight range with top broker dominance.';
    actionableGuidanceNepali = 'क्रमिक संकलन (Smart Accumulate): बजार हल्ला नहुँदै थोरै थोरै संकलन गर्ने उत्तम समय।';
    actionableGuidanceEnglish = 'Prime smart money accumulation zone. Scale in quietly before the public markup.';
  }

  return {
    stage,
    stageNameNepali,
    stageDescription,
    stealthScore,
    pumpDumpRiskScore: pumpDump.riskScore,
    cmf: cmfRes.cmf,
    adlDivergence: adlRes.divergence,
    tradeSizeRatio,
    topBuyerConcentrationPct,
    actionableGuidanceNepali,
    actionableGuidanceEnglish
  };
}
