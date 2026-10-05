import { fetchLiveStockDetail } from '../utils/liveData.js';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse.js';
import { classifyLiquidity } from '../utils/priceAdjustment.js';

// In-memory Map cache
const snapshotCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

export function getSnapshotCache(symbol) {
  if (!symbol) return null;
  const key = symbol.toUpperCase();
  const cached = snapshotCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }
  return null;
}

export function clearSnapshotCache(symbol = null) {
  if (symbol) {
    snapshotCache.delete(symbol.toUpperCase());
  } else {
    snapshotCache.clear();
  }
}

export async function fetchStockSnapshot(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) throw new Error('Symbol is required');

  const cached = getSnapshotCache(sym);
  if (cached) return cached;

  const snapshot = {
    symbol: sym,
    companyName: null,
    sector: null,
    ltp: null, pChange: null, change: null, open: null, high: null, low: null, prevClose: null, volume: null, turnover: null,
    high52w: null, low52w: null,
    eps: null, pe: null, pb: null, bookValue: null, roe: null, dividendYield: null,
    listedShares: null, paidUpCapital: null, promoterPercentage: null, publicPercentage: null,
    marketCap: null,
    floatMarketCap: null,
    rvol: null, avgVolume20D: null, liquidityClass: null, liquidityLabel: null, isIlliquid: null, liquidityWarning: null,
    bonusShare: null, cashDiv: null,
    dataTimestamp: new Date().toISOString(),
    dataSource: 'nepse-api'
  };

  try {
    const staticData = NEPSE_UNIVERSE.find(s => s.symbol === sym) || {};
    snapshot.companyName = staticData.name || null;
    snapshot.sector = staticData.sector || null;
    snapshot.listedShares = (staticData.sharesOut * 1000000) || null;

    let liveDetail = null;
    try {
      if (typeof fetchLiveStockDetail === 'function') {
        liveDetail = await fetchLiveStockDetail(sym);
      }
    } catch (e) {
      console.warn("fetchLiveStockDetail error", e);
      snapshot.dataSource = 'partial';
    }

    if (liveDetail) {
      snapshot.companyName = liveDetail.companyName || liveDetail.securityName || snapshot.companyName;
      snapshot.sector = liveDetail.sector || snapshot.sector;
      
      snapshot.ltp = liveDetail.lastTradedPrice ?? liveDetail.ltp ?? liveDetail.marketPrice ?? liveDetail.closePrice ?? null;
      snapshot.pChange = liveDetail.percentageChange ?? liveDetail.pChange ?? null;
      snapshot.change = liveDetail.change ?? null;
      snapshot.open = liveDetail.openPrice ?? liveDetail.open ?? null;
      snapshot.high = liveDetail.highPrice ?? liveDetail.high ?? null;
      snapshot.low = liveDetail.lowPrice ?? liveDetail.low ?? null;
      snapshot.prevClose = liveDetail.previousClose ?? liveDetail.prevClose ?? null;
      snapshot.volume = liveDetail.totalTradeQuantity ?? liveDetail.volume ?? null;
      snapshot.turnover = liveDetail.totalTradeValue ?? liveDetail.turnover ?? null;
      
      snapshot.high52w = liveDetail.fiftyTwoWeekHigh ?? liveDetail.high52w ?? null;
      snapshot.low52w = liveDetail.fiftyTwoWeekLow ?? liveDetail.low52w ?? null;
      
      snapshot.eps = liveDetail.eps ?? null;
      snapshot.pe = liveDetail.pe ?? null;
      snapshot.pb = liveDetail.pb ?? liveDetail.pbv ?? null;
      snapshot.bookValue = liveDetail.bookValue ?? null;
      snapshot.roe = liveDetail.roe ?? null;
      snapshot.dividendYield = liveDetail.dividendYield ?? null;
      
      snapshot.listedShares = liveDetail.listedShares ?? liveDetail.sharesOutstanding ?? snapshot.listedShares;
      snapshot.paidUpCapital = liveDetail.paidUpCapital ?? null;
      snapshot.promoterPercentage = liveDetail.promoterPercentage ?? liveDetail.promoterHolding ?? null;
      snapshot.publicPercentage = liveDetail.publicPercentage ?? (liveDetail.promoterPercentage ? 100 - liveDetail.promoterPercentage : null);
      
      snapshot.rvol = liveDetail.rvol ?? null;
      snapshot.avgVolume20D = liveDetail.avgVolume20D ?? null;

      snapshot.bonusShare = liveDetail.bonusShare ?? null;
      snapshot.cashDiv = liveDetail.cashDividend ?? liveDetail.cashDiv ?? null;
      snapshot.fiscalYear = liveDetail.fiscalYear ?? null;
      snapshot.quarter = liveDetail.quarter ?? null;
    }

    if (snapshot.listedShares && snapshot.ltp) {
        snapshot.marketCap = snapshot.listedShares * snapshot.ltp;
        if (snapshot.publicPercentage) {
            snapshot.floatMarketCap = snapshot.marketCap * (snapshot.publicPercentage / 100);
        }
    }

    const liquidityInfo = classifyLiquidity({ turnover: snapshot.turnover, volume: snapshot.volume });
    snapshot.liquidityClass = liquidityInfo.class || null;
    snapshot.liquidityLabel = liquidityInfo.label || null;
    snapshot.isIlliquid = liquidityInfo.isIlliquid ?? null;
    snapshot.liquidityWarning = liquidityInfo.warning || null;

    snapshotCache.set(sym, { timestamp: Date.now(), data: snapshot });

    return snapshot;
  } catch (error) {
    snapshot.dataSource = 'partial';
    return snapshot;
  }
}

export function enrichStockFromSnapshot(snapshot, liveDetail) {
    if (!snapshot) return liveDetail;
    return {
        ...snapshot,
        ...liveDetail,
        marketCap: snapshot.marketCap ?? liveDetail.marketCap,
        floatMarketCap: snapshot.floatMarketCap ?? liveDetail.floatMarketCap,
    };
}
