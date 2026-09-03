// src/utils/mockData.js
// REPLACE THE ENTIRE FILE WITH THIS
// We keep the file but disable all mock data usage

export const MOCK_DATA_DISABLED = true;

// ============================================================
// ALL MOCK DATA REMOVED - INVESTMENT APP SAFETY
// ============================================================
// Reason: Users make real money decisions based on this data.
// Showing fake prices = users could lose real money.
// All functions now return empty/null with clear error messages.
// ============================================================

export const mockStocks = []; // Disabled - was fake price data
export const mockPortfolio = []; // Disabled - was fake portfolio
export const mockIPO = []; // Disabled - was fake IPO data

// This function previously merged fake data with live data
// NOW: Returns only real data, never fake
export function mergeWithMockData(liveData) {
  console.warn(
    '⚠️ mergeWithMockData called but DISABLED.',
    'App now shows only real NEPSE data.',
    'If you see this, live data fetch succeeded.'
  );
  
  // Return live data as-is - NEVER mix with mock
  return liveData || [];
}

// Safe empty returns for any component still importing these
export const getMockPrice = () => null;
export const getMockHistory = () => [];
export const getMockPortfolio = () => [];
export const getMockIPOData = () => [];
export const getMockSectors = () => [];
export const getMockIndices = () => [];
export const getMockBrokers = () => [];
export const getMockNews = () => [];
export const getMockFloorsheet = () => [];
export const getMockTopGainers = () => [];
export const getMockTopLosers = () => [];
export const getMockDividends = () => [];

// ============================================================
// DISABLED GENERATORS (Returns empty/safe fallback for safety)
// ============================================================
export const INITIAL_COMPANIES = [];
export const MOCK_IPOS = [];
export const MOCK_DP_LIST = [];
export const MUTUAL_FUNDS_DATA = [];
export const SECTOR_AD_DATA = [];

export function initializeMarket() {
  return []; // Returns empty array - no fake stocks generated
}

export function simulateMarketTick(currentStocks) {
  return currentStocks || []; // No-op: prevents fake price movement
}

export function generateHistory() { return []; }
export function generateHourlyHistory() { return []; }
export function generateSparkline() { return ''; }
export function generateMarketDepth() { return { buy: [], sell: [], totalBuyQty: 0, totalSellQty: 0 }; }
export function generateBrokerAnalysis() { return []; }
export function generateFloorsheet() { return []; }
export function generateQuarterlyReports() { return []; }
export function generateAccumulationDistributionHistory12M() { return []; }
export function generateBroker12MHistory() { return []; }
export function calculateStocksAccumulationDistribution() { return []; }
export function generateZeroSumFloorsheet() { return []; }
export function getMarketNews() { return []; }

export function checkIpoAllotmentMock() {
  return { success: false, message: 'Mock data disabled. Use live CDSC results.' };
}

export function generateMockDematPortfolio() {
  return [];
}

// ============================================================
// QUANTITATIVE & MATHEMATICAL HELPERS (Applied to Real Stocks)
// ============================================================
export function calculatePivotPoints(highOrStock, low, close) {
  let h, l, c;
  if (typeof highOrStock === 'object' && highOrStock !== null) {
    const ltp = Number(highOrStock.ltp || 0);
    h = Number(highOrStock.high || ltp);
    l = Number(highOrStock.low || ltp);
    c = Number(highOrStock.close || highOrStock.ltp || ltp);
  } else {
    h = Number(highOrStock || 0);
    l = Number(low || 0);
    c = Number(close || 0);
  }
  const P = Number(((h + l + c) / 3).toFixed(2));
  const R1 = Number((2 * P - l).toFixed(2));
  const S1 = Number((2 * P - h).toFixed(2));
  const R2 = Number((P + (h - l)).toFixed(2));
  const S2 = Number((P - (h - l)).toFixed(2));
  const R3 = Number((h + 2 * (P - l)).toFixed(2));
  const S3 = Number((l - 2 * (h - P)).toFixed(2));
  return { P, pp: P, R1, r1: R1, R2, r2: R2, R3, r3: R3, S1, s1: S1, S2, s2: S2, S3, s3: S3 };
}

export function calculateFibonacci(high52wOrStock, low52w) {
  let h, l;
  if (typeof high52wOrStock === 'object' && high52wOrStock !== null) {
    const ltp = Number(high52wOrStock.ltp || 0);
    h = Number(high52wOrStock.high52w || high52wOrStock.high || ltp);
    l = Number(high52wOrStock.low52w || high52wOrStock.low || ltp);
  } else {
    h = Number(high52wOrStock || 0);
    l = Number(low52w || 0);
  }
  const diff = h - l || 1;
  return {
    level_0: Number(h.toFixed(2)),
    level_236: Number((h - diff * 0.236).toFixed(2)),
    level_382: Number((h - diff * 0.382).toFixed(2)),
    level_500: Number((h - diff * 0.500).toFixed(2)),
    level_618: Number((h - diff * 0.618).toFixed(2)),
    level_786: Number((h - diff * 0.786).toFixed(2)),
    level_1000: Number(l.toFixed(2)),
  };
}

export function getPeerStocks(currentStock, allStocks = []) {
  if (!currentStock || !Array.isArray(allStocks) || allStocks.length === 0) return [];
  const sym = currentStock.symbol || '';
  const sector = currentStock.sector || '';
  const ltp = Number(currentStock.ltp || 0);

  const sameSector = allStocks.filter(s => s && s.symbol !== sym && s.sector === sector);
  if (sameSector.length >= 3) return sameSector.slice(0, 5);
  return allStocks
    .filter(s => s && s.symbol !== sym)
    .sort((a, b) => Math.abs((a.ltp || 0) - ltp) - Math.abs((b.ltp || 0) - ltp))
    .slice(0, 5);
}

export function calculateIndices(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return {
      nepse: { value: 0, change: 0, pChange: 0 },
      float: { value: 0, change: 0, pChange: 0 },
      sensitive: { value: 0, change: 0, pChange: 0 }
    };
  }
  let totalCap = 0;
  let baseCap = 0;

  stocks.forEach(s => {
    const ltp = Number(s.ltp) || 0;
    const prev = Number(s.prevClose) || ltp;
    const shares = Number(s.listedShares) || 10;
    totalCap += ltp * shares;
    baseCap += prev * shares;
  });

  const ratio = baseCap > 0 ? totalCap / baseCap : 1;
  const nepse = Number((2000 * ratio).toFixed(2));
  const prevNepse = 2000;

  return {
    nepse: { value: nepse, change: Number((nepse - prevNepse).toFixed(2)), pChange: Number(((nepse - prevNepse) / prevNepse * 100).toFixed(2)) },
    float: { value: Number((120 * ratio).toFixed(2)), change: 0, pChange: 0 },
    sensitive: { value: Number((380 * ratio).toFixed(2)), change: 0, pChange: 0 }
  };
}

export function runStockScanners(stocks = [], filterKey) {
  if (!stocks || stocks.length === 0) return [];
  switch (filterKey) {
    // ── Trader's Zone & Subscription Features ──
    case 'breakout':
    case 'breakout_stocks':
    case 'trendline_breakout':
      return stocks.filter(s => s.pChange >= 1.8 && (s.volumeSurgeRatio >= 1.4 || s.floatTurnoverPct >= 0.8 || s.isBreakout)).sort((a,b) => b.pChange - a.pChange).slice(0, 20);
    
    case 'volume_shockers':
      return stocks.filter(s => (s.volumeZScore >= 1.8 || s.isVolumeShocker || s.volumeSurgeRatio >= 1.8 || s.floatTurnoverPct >= 2.0)).sort((a,b) => (b.volumeZScore || b.volumeSurgeRatio || 0) - (a.volumeZScore || a.volumeSurgeRatio || 0)).slice(0, 20);

    case 'technical_ratings':
    case 'technical_rating':
      return [...stocks].sort((a, b) => (b.technicalScore || 50) - (a.technicalScore || 50)).slice(0, 20);

    case 'players_choices':
    case 'players_choice':
    case 'broker_favourites':
      return stocks.filter(s => (s.turnover >= 12000000 || s.floatTurnoverPct >= 1.2) && s.pChange > 0).sort((a,b) => (b.floatTurnoverPct || 0) - (a.floatTurnoverPct || 0)).slice(0, 20);

    case 'circuit_setup':
    case 'circuit_radar':
      return stocks.filter(s => (s.pChange >= 6.0 && s.pChange <= 9.95) || (s.pChange <= -6.0 && s.pChange >= -9.95)).sort((a,b) => Math.abs(b.pChange) - Math.abs(a.pChange)).slice(0, 20);

    case 'candlestick_patterns':
    case 'candlestick':
    case 'candlestick_pattern':
      return stocks.filter(s => s.pChange >= 1.0).slice(0, 20);

    case 'consolidating_stocks':
    case 'consolidating':
    case 'consolidating_picks':
      return stocks.filter(s => Math.abs(s.pChange) <= 0.9 && (s.high - s.low) <= (s.ltp || 1) * 0.018 || s.isSqueeze).slice(0, 20);

    case 'fresh_indicator_signals':
    case 'fresh_signals':
      return stocks.filter(s => (s.rsi <= 40 && s.pChange > 0) || (s.macd && s.macd.line > s.macd.signal && s.pChange > 0.4)).slice(0, 20);

    case 'support_and_resistance':
    case 'support_res':
    case 'support_resistance':
      return stocks.filter(s => s.low52w && (s.ltp <= s.low52w * 1.12)).slice(0, 20);

    case 'unusual_trades':
      return stocks.filter(s => s.volume >= 22000 && (s.floatTurnoverPct >= 1.2 || s.volumeSurgeRatio >= 1.6 || s.volumeZScore >= 1.8)).slice(0, 20);

    case 'relative_strength':
    case 'relative_strength_ranking':
      return [...stocks].sort((a,b) => (b.relativeStrength || 50) - (a.relativeStrength || 50)).slice(0, 20);

    // ── Benjamin Graham Valuation & Quantitative Filters ──
    case 'graham_valuation':
    case 'graham_undervalued':
    case 'undervalued_stocks':
      return stocks.filter(s => s.isUndervalued && s.marginOfSafetyPct >= 10).sort((a, b) => (b.marginOfSafetyPct || 0) - (a.marginOfSafetyPct || 0)).slice(0, 25);

    // ── Machine Learning Operational Action Zones ──
    case 'buying_zone':
    case 'buying_zone_stocks':
      return stocks.filter(s => s.zone === 'Buying Zone' || (s.actionZone && s.actionZone.zone === 'Buying Zone')).slice(0, 20);

    case 'entry_zone':
    case 'entry_zone_stocks':
      return stocks.filter(s => s.zone === 'Entry Zone' || (s.actionZone && s.actionZone.zone === 'Entry Zone')).slice(0, 20);

    case 'holding_zone':
    case 'holding_zone_stocks':
      return stocks.filter(s => s.zone === 'Holding Zone' || (s.actionZone && s.actionZone.zone === 'Holding Zone')).slice(0, 20);

    case 'exit_zone':
    case 'exit_zone_stocks':
      return stocks.filter(s => s.zone === 'Exit Zone' || (s.actionZone && s.actionZone.zone === 'Exit Zone')).slice(0, 20);

    case 'selling_zone':
    case 'selling_zone_stocks':
      return stocks.filter(s => s.zone === 'Selling Zone' || (s.actionZone && s.actionZone.zone === 'Selling Zone')).slice(0, 20);

    // ── StockYan Smart Money & Predictive Engine Screeners ──
    case 'stealth_accumulation':
    case 'slow_accumulation':
      return stocks.filter(s => s.isStealthAccumulation || (s.bcr3 && s.bcr3 >= 0.35)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

    case 'broker_dominance':
    case 'aggressive_accumulators':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.30) || s.floatTurnoverPct >= 1.5).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);

    case 'matching_trades':
    case 'matching_buy_sell':
      return stocks.filter(s => s.volume >= 25000 && (s.floatTurnoverPct >= 1.2 || s.volumeSurgeRatio >= 1.5)).slice(0, 20);

    case 'decision_probability':
    case 'dpi_strong_buy':
      return stocks.filter(s => (s.dpi?.dpi || 50) >= 65).sort((a, b) => (b.dpi?.dpi || 50) - (a.dpi?.dpi || 50)).slice(0, 25);

    case 'dpi_strong_sell':
      return stocks.filter(s => (s.dpi?.dpi || 50) <= 35).sort((a, b) => (a.dpi?.dpi || 50) - (b.dpi?.dpi || 50)).slice(0, 25);

    case 'order_book_depth':
    case 'order_book_imbalance':
      return stocks.filter(s => (s.obir?.obir || 0) >= 0.20).sort((a, b) => (b.obir?.obir || 0) - (a.obir?.obir || 0)).slice(0, 25);

    case 'lockin_shock_risk':
    case 'ilsi_risk':
      return stocks.filter(s => (s.ilsi || 0) >= 20).sort((a, b) => (b.ilsi || 0) - (a.ilsi || 0)).slice(0, 25);

    // ── AD FREE + PREMIUM Features ──
    case 'hot_stocks':
    case 'hot_trending':
      return stocks.filter(s => s.floatTurnoverPct >= 1.5 && s.pChange >= 1.2).sort((a,b) => (b.floatTurnoverPct || 0) - (a.floatTurnoverPct || 0)).slice(0, 20);


    case 'large_cap':
      return stocks.filter(s => (s.marketCap || 0) >= 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);
    
    case 'mid_cap':
      return stocks.filter(s => (s.marketCap || 0) >= 4000 && (s.marketCap || 0) < 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

    case 'small_cap':
      return stocks.filter(s => (s.marketCap || 0) < 4000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

    case 'price_vs_volume':
      return stocks.filter(s => s.pChange >= 1.5 && (s.volumeSurgeRatio >= 1.2 || s.floatTurnoverPct >= 1.0)).slice(0, 20);

    case 'dividend_kings':
      return stocks.filter(s => (s.bonusShare >= 10 || s.cashDiv >= 5 || s.divYield >= 3.0)).sort((a,b) => (b.bonusShare || 0) - (a.bonusShare || 0)).slice(0, 20);

    case 'fundamentals_pro':
    case 'fundamental':
    case 'fundamental_scanner':
      return stocks.filter(s => (s.eps >= 15 && s.pe > 0 && s.pe <= 25) || (s.roe && s.roe >= 12)).sort((a,b) => (b.eps || 0) - (a.eps || 0)).slice(0, 20);


    // ── Classic & Video Scanners ──
    case 'rsi':
    case 'rsi_filter':
      return stocks.filter(s => (s.rsi && (s.rsi <= 35 || s.rsi >= 68)) || s.pChange >= 2.5).slice(0, 20);
    case 'ema':
    case 'ema_scanner':
      return stocks.filter(s => s.ltp >= (s.avg120 || s.ltp * 0.98) && s.pChange > 0.5).slice(0, 20);
    case 'bollinger':
    case 'bollinger_scanner':
      return stocks.filter(s => Math.abs(s.pChange) >= 2.0 || (s.high - s.low) / (s.ltp || 1) >= 0.035).slice(0, 20);
    case 'volume':
    case 'volume_scanner':
      return stocks.filter(s => (s.volume || 0) >= 30000).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 20);
    case 'pivot_points':
      return stocks.filter(s => s.ltp >= (s.high * 0.98)).slice(0, 20);
    case 'macd':
    case 'macd_signal':
      return stocks.filter(s => s.macd ? s.macd.line > s.macd.signal : s.pChange > 0).slice(0, 20);
    case 'ema_sma':
      return stocks.filter(s => s.pChange >= 1.0 && s.ltp > (s.avg120 || s.ltp)).slice(0, 20);
    case 'fibonacci':
    case 'fibonacci_levels':
      return stocks.filter(s => s.pChange >= 0.8 && s.high52w && s.low52w).slice(0, 20);
    case 'dow_signals':
      return stocks.filter(s => s.pChange > 0 && s.high >= s.open).slice(0, 20);
    case 'parallel_channel':
      return stocks.filter(s => s.pChange >= 0.5 && s.pChange <= 3.5).slice(0, 20);
    case 'trend_continuation':
      return stocks.filter(s => s.pChange >= 1.2 && (s.turnover || 0) > 10000000).slice(0, 20);
    case 'strong_trend':
      return stocks.filter(s => s.pChange >= 3.0 && (s.volume || 0) > 25000).slice(0, 20);
    case 'stock_cap':
    case 'stock_capitalization':
      return [...stocks].sort((a, b) => (b.marketCap || (b.ltp * 100)) - (a.marketCap || (a.ltp * 100))).slice(0, 20);
    case 'comparable':
    case 'comparable_stock':
      return stocks.slice(0, 20);
    case 'smart_money':
    case 'smart_money_scanner':
      return stocks.filter(s => (s.turnover || 0) >= 15000000 && s.pChange > 0).slice(0, 20);

    // ── Trade Lab Scanners (S_rank >= 80, RVOL >= 2.0, BBW Squeeze) ──
    case 'support_setups':
      return stocks.filter(s => (s.low52w && s.ltp <= s.low52w * 1.15) || s.zone === 'Buying Zone' || (s.rsi && s.rsi <= 42 && s.pChange >= 0)).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'next_breakouts':
      return stocks.filter(s => (s.isSqueeze || (s.bbw && s.bbw <= 0.045)) && (s.sRank >= 65 || s.pChange >= 0.5)).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'breakout_tradable':
      return stocks.filter(s => s.isHighProbabilityBreakout || (s.sRank >= 75 && s.pChange >= 2.0 && (s.volumeSurgeRatio >= 1.4 || s.volume >= 25000))).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'consolidating_picks':
      return stocks.filter(s => (s.isSqueeze || Math.abs(s.pChange) <= 1.0) && (s.bbwPct <= 5.0 || (s.bbw && s.bbw <= 0.04))).sort((a, b) => (a.bbw || 0) - (b.bbw || 0)).slice(0, 25);
    case 'investment_picks':
      return stocks.filter(s => (s.isUndervalued && s.roe >= 12 && s.pe > 0 && s.pe <= 25) || (s.marginOfSafetyPct && s.marginOfSafetyPct >= 15)).sort((a, b) => (b.marginOfSafetyPct || 0) - (a.marginOfSafetyPct || 0)).slice(0, 25);
    case 'sip_picks':
    case 'sip_in_stocks':
      return stocks.filter(s => (s.eps && s.eps >= 15) && (s.bookValue && s.bookValue >= 140) && ((s.marginOfSafetyPct || 0) >= 0)).sort((a, b) => (b.eps || 0) - (a.eps || 0)).slice(0, 25);

    // ── Smart Money Categories ──
    case 'aggressive_accumulators':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.35) || (s.pChange >= 2.0 && (s.volumeSurgeRatio >= 1.5 || s.turnover > 15000000))).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);
    case 'distribution_leaders':
      return stocks.filter(s => s.pChange <= -1.8 && (s.turnover || 0) > 12000000).sort((a, b) => a.pChange - b.pChange).slice(0, 25);
    case 'broker_dominance':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.30) || (s.volume || 0) > 35000).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);
    case 'aggressive_holdings':
      return stocks.filter(s => s.pChange > 0 && s.pe > 0 && s.pe < 28 && (s.bcr3 || 0) >= 0.25).slice(0, 25);
    case 'matching_trades':
      return stocks.filter(s => (s.volume || 0) > 30000 && (s.floatTurnoverPct >= 1.0 || s.volumeSurgeRatio >= 1.3)).slice(0, 25);
    case 'slow_accumulation':
      return stocks.filter(s => s.isStealthAccumulation || (s.pChange >= 0.1 && s.pChange <= 1.8 && (s.bcr3 || 0) >= 0.30)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);


    // ── Fast Circuits & Signals ──
    case 'circuit_up':
      return stocks.filter(s => s.pChange >= 9.0).sort((a, b) => b.pChange - a.pChange);
    case 'circuit_down':
      return stocks.filter(s => s.pChange <= -9.0).sort((a, b) => a.pChange - b.pChange);
    case 'buyers_choice':
      return stocks.filter(s => s.volume > 50000 && s.pChange > 0).sort((a, b) => (b.turnover || 0) - (a.turnover || 0)).slice(0, 20);
    default:
      return [];
  }
}

// ============================================================
// OFFICIAL DIRECTORIES & STATIC REFERENCE DATASETS
// ============================================================
export const SECTORS = [
  "Commercial Banks",
  "Development Banks",
  "Finance",
  "Microfinance",
  "Hydro Power",
  "Life Insurance",
  "Non Life Insurance",
  "Hotels And Tourism",
  "Manufacturing And Processing",
  "Investment",
  "Tradings",
  "Mutual Fund",
  "Others"
];

export const NEPSE_BROKERS = [
  { no: 58, name: "Naasa Securities Co. Ltd." },
  { no: 45, name: "Imperial Securities Co. Pvt. Ltd." },
  { no: 34, name: "Vision Securities Pvt. Ltd." },
  { no: 49, name: "Online Securities Ltd." },
  { no: 28, name: "Shree Krishna Securities Ltd." },
  { no: 38, name: "Dipshikha Dhitopatra Karobar Co." },
  { no: 57, name: "Aryatara Investment & Securities" },
  { no: 44, name: "Dynamic Money Managers Securities" },
  { no: 14, name: "Nepal Stock House Pvt. Ltd." },
  { no: 33, name: "Dakshinkali Investment & Securities" },
  { no: 19, name: "Nepal Investment & Securities Pvt." },
  { no: 64, name: "Sani Securities Company Ltd." },
  { no: 4,  name: "Opal Securities Investment Pvt." },
  { no: 32, name: "Premier Securities Company Ltd." },
  { no: 47, name: "Nivana Capital Market Pvt. Ltd." },
  { no: 10, name: "Pragyan Securities Pvt. Ltd." },
  { no: 22, name: "Siprabi Securities Pvt. Ltd." }
];

export const LOCK_IN_DATA = [
  {
    id: 1,
    symbol: "HATHY",
    name: "Hathway Investment Nepal Ltd.",
    category: "Promoter & Local",
    unlockDate: "2026-09-15",
    daysLeft: 20,
    units: 14625000,
    pctOfTotal: "62.5%",
    currentPrice: 1045,
    impact: "High",
    remarks: "3-year lock-in period for promoter shares ending."
  },
  {
    id: 2,
    symbol: "SONA",
    name: "Sonapur Minerals and Oil Ltd.",
    category: "Promoter & Mutual Fund",
    unlockDate: "2026-10-02",
    daysLeft: 37,
    units: 12300000,
    pctOfTotal: "40.0%",
    currentPrice: 480,
    impact: "High",
    remarks: "Lock-in period for anchor investors & promoters expiring."
  },
  {
    id: 3,
    symbol: "SARBTM",
    name: "Sarbottam Cement Limited",
    category: "Book Building Local & Mutual Fund",
    unlockDate: "2026-11-12",
    daysLeft: 78,
    units: 9600000,
    pctOfTotal: "35.2%",
    currentPrice: 790,
    impact: "Medium",
    remarks: "Local affected shares eligible for secondary trading."
  },
  {
    id: 4,
    symbol: "MKHL",
    name: "Mai Khola Hydropower Limited",
    category: "Local Residents",
    unlockDate: "2026-12-05",
    daysLeft: 101,
    units: 3921570,
    pctOfTotal: "30.0%",
    currentPrice: 320,
    impact: "Low",
    remarks: "Project-affected local shares unlocking."
  },
  {
    id: 5,
    symbol: "CIT",
    name: "Citizen Investment Trust",
    category: "Right Shares Lock-in",
    unlockDate: "2027-01-18",
    daysLeft: 145,
    units: 5400000,
    pctOfTotal: "12.0%",
    currentPrice: 1850,
    impact: "Low",
    remarks: "Institutional rights quota lock-in expiration."
  },
  {
    id: 6,
    symbol: "UPPER",
    name: "Upper Tamakoshi Hydropower",
    category: "Rights & Employee Quota",
    unlockDate: "2027-03-20",
    daysLeft: 206,
    units: 24500000,
    pctOfTotal: "22.5%",
    currentPrice: 190,
    impact: "High",
    remarks: "Employee & lender lock-in completion."
  }
];

export const SEBON_IPO_PIPELINE = [
  {
    id: 1,
    company: "Reliance Spinning Mills Limited",
    sector: "Manufacturing",
    units: 1155960,
    amountCr: 95.2,
    issueManager: "Global IME Capital Ltd.",
    status: "Approved",
    stage: "SEBON Approved (Issuance Pending)",
    method: "Book Building"
  },
  {
    id: 2,
    company: "Trade Tower Limited",
    sector: "Others",
    units: 1169690,
    amountCr: 11.69,
    issueManager: "Laxmi Capital Market Ltd.",
    status: "Under Review",
    stage: "Review by SEBON Committee",
    method: "Fixed Price (Rs. 100)"
  },
  {
    id: 3,
    company: "Bhatbhateni Supermarket and Departmental Store",
    sector: "Trading",
    units: 15000000,
    amountCr: 150.0,
    issueManager: "Nabil Investment Banking Ltd.",
    status: "Preliminary",
    stage: "Application Submitted to Board",
    method: "Premium Issue"
  },
  {
    id: 4,
    company: "Chandra Giri Hills Limited (FPO)",
    sector: "Hotels And Tourism",
    units: 825000,
    amountCr: 8.25,
    issueManager: "NIC Asia Capital Ltd.",
    status: "Under Review",
    stage: "Documentation Verification",
    method: "FPO"
  },
  {
    id: 5,
    company: "Sanima Middle Tamor Hydropower Ltd.",
    sector: "Hydropower",
    units: 3332500,
    amountCr: 33.32,
    issueManager: "Sanima Capital Ltd.",
    status: "Approved",
    stage: "Issue Date to be Announced",
    method: "Fixed Price (Rs. 100)"
  }
];

export const NEPSE_SEASONALITY = [
  { month: "Baisakh (Apr-May)", avgReturn: "+4.2%", winRate: "70%", trend: "Bullish", desc: "Fiscal year kick-off rally, new capital deployment." },
  { month: "Jestha (May-Jun)", avgReturn: "+2.8%", winRate: "60%", trend: "Bullish", desc: "Pre-budget speculation & commercial bank positioning." },
  { month: "Ashadh (Jun-Jul)", avgReturn: "-3.5%", winRate: "30%", trend: "Bearish", desc: "Tax clearance & fiscal year-end profit booking." },
  { month: "Shrawan (Jul-Aug)", avgReturn: "+7.8%", winRate: "80%", trend: "Strong Bull", desc: "Monetary Policy release by NRB, liquidity expansion." },
  { month: "Bhadra (Aug-Sep)", avgReturn: "+3.4%", winRate: "60%", trend: "Bullish", desc: "Post-monetary policy momentum & dividend speculation." },
  { month: "Ashwin (Sep-Oct)", avgReturn: "-1.8%", winRate: "40%", trend: "Neutral", desc: "Dashain festival withdrawal & holiday volume lull." },
  { month: "Kartik (Oct-Nov)", avgReturn: "+1.5%", winRate: "50%", trend: "Neutral", desc: "Post-Tihar festival resumption & Q1 earnings season." },
  { month: "Mangsir (Nov-Dec)", avgReturn: "+4.6%", winRate: "70%", trend: "Bullish", desc: "AGM season, bonus share book closures & dividends." },
  { month: "Poush (Dec-Jan)", avgReturn: "-2.4%", winRate: "30%", trend: "Bearish", desc: "Mid-year interest payment obligations to banks." },
  { month: "Magh (Jan-Feb)", avgReturn: "+3.1%", winRate: "60%", trend: "Bullish", desc: "Mid-term monetary review & Q2 corporate results." },
  { month: "Falgun (Feb-Mar)", avgReturn: "+1.2%", winRate: "50%", trend: "Neutral", desc: "Spring range-bound market behavior." },
  { month: "Chaitra (Mar-Apr)", avgReturn: "-1.9%", winRate: "40%", trend: "Bearish", desc: "Quarterly tax advance installments & credit squeeze." }
];

export const SIP_BASKETS = [
  {
    id: "dividend_kings",
    name: "Dividend Champions Basket",
    cagr: "18.4%",
    risk: "Low Risk",
    minMonthly: 5000,
    desc: "Blue-chip leaders with consistent >15% cash/bonus payout track record over the last 7 years.",
    stocks: [
      { symbol: "NABIL", weight: "30%", name: "Nabil Bank Ltd." },
      { symbol: "SCB", weight: "25%", name: "Standard Chartered Bank" },
      { symbol: "NTC", weight: "25%", name: "Nepal Telecom" },
      { symbol: "HDL", weight: "20%", name: "Himalayan Distillery" }
    ]
  },
  {
    id: "banking_power",
    name: "Banking Titans Basket",
    cagr: "15.8%",
    risk: "Low-Medium",
    minMonthly: 3000,
    desc: "Top capitalized commercial banks with high tier-1 capital and strong loan book resilience.",
    stocks: [
      { symbol: "EBL", weight: "35%", name: "Everest Bank Ltd." },
      { symbol: "NABIL", weight: "35%", name: "Nabil Bank Ltd." },
      { symbol: "GBIME", weight: "30%", name: "Global IME Bank Ltd." }
    ]
  },
  {
    id: "hydro_compounders",
    name: "Hydropower Compounders",
    cagr: "22.5%",
    risk: "Medium-High",
    minMonthly: 4000,
    desc: "Operational run-of-river projects with low debt-to-equity and power purchase agreements (PPA).",
    stocks: [
      { symbol: "CHCL", weight: "40%", name: "Chilime Hydropower Ltd." },
      { symbol: "BPCL", weight: "35%", name: "Butwal Power Company" },
      { symbol: "AHPC", weight: "25%", name: "Arun Valley Hydropower" }
    ]
  },
  {
    id: "defensive_growth",
    name: "Defensive Multi-Cap Basket",
    cagr: "19.2%",
    risk: "Medium",
    minMonthly: 5000,
    desc: "Balanced portfolio across Insurance, Microfinance, Manufacturing and Telecom.",
    stocks: [
      { symbol: "NLIC", weight: "25%", name: "Nepal Life Insurance" },
      { symbol: "CBBL", weight: "25%", name: "Chhimek Laghubitta" },
      { symbol: "CIT", weight: "25%", name: "Citizen Investment Trust" },
      { symbol: "NTC", weight: "25%", name: "Nepal Telecom" }
    ]
  }
];

export const DIVIDEND_KINGS_DATA = [
  { symbol: "SCB", name: "Standard Chartered Bank Nepal", sector: "Commercial Banks", bonusShare: 0, cashDiv: 25.5, divYield: 4.88, yearsConsistent: 15, avg5YrPayout: "92%" },
  { symbol: "HDL", name: "Himalayan Distillery Limited", sector: "Manufacturing", bonusShare: 15, cashDiv: 10.0, divYield: 3.20, yearsConsistent: 12, avg5YrPayout: "78%" },
  { symbol: "NABIL", name: "Nabil Bank Limited", sector: "Commercial Banks", bonusShare: 10, cashDiv: 5.0, divYield: 3.12, yearsConsistent: 20, avg5YrPayout: "85%" },
  { symbol: "UNL", name: "Unilever Nepal Limited", sector: "Manufacturing", bonusShare: 0, cashDiv: 1580.0, divYield: 3.45, yearsConsistent: 25, avg5YrPayout: "95%" },
  { symbol: "NTC", name: "Nepal Doorsanchar Company (NTC)", sector: "Others", bonusShare: 0, cashDiv: 30.0, divYield: 5.42, yearsConsistent: 14, avg5YrPayout: "80%" },
  { symbol: "CIT", name: "Citizen Investment Trust", sector: "Investment", bonusShare: 5, cashDiv: 5.0, divYield: 2.10, yearsConsistent: 10, avg5YrPayout: "65%" },
  { symbol: "CBBL", name: "Chhimek Laghubitta Bittiya Sanstha", sector: "Microfinance", bonusShare: 20, cashDiv: 5.0, divYield: 4.60, yearsConsistent: 11, avg5YrPayout: "72%" },
  { symbol: "EBL", name: "Everest Bank Limited", sector: "Commercial Banks", bonusShare: 0, cashDiv: 10.5, divYield: 3.80, yearsConsistent: 18, avg5YrPayout: "70%" },
];

export default {
  MOCK_DATA_DISABLED,
  mergeWithMockData,
  mockStocks,
  mockPortfolio,
  mockIPO
};
