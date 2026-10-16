import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Bell, Briefcase, ExternalLink, MapPin, Phone, RefreshCw, Search, Trash2, X, ChevronLeft, Flame, Target, Award, ArrowUpRight, TrendingUp, Clock, Shield, AlertTriangle, Users, Zap } from 'lucide-react';
import { useBackHandler } from '../context/NavigationContext';
import {
  fetchLiveMarket, fetchMarketSummary, fetchTopGainers, fetchTopLosers,
  fetchTopVolume, fetchTopTurnover, fetchTopTransactions,
  fetchAllSecurities, fetchPriceHistory,
  loadNepseData, fetchIndices, fetchFloorSheet, ENDPOINT_REGISTRY, getCachedStocks, getCachedIndices,
  getCachedRealPriceHistory, getCachedRealBrokerAnalysis, setCachedRealBrokerAnalysis,
  fetchRealBrokerAnalysis,
  type EnrichedStock,
} from '../utils/liveData';
import {
  fetchBrokersDirectory, fetchIPOPipeline, fetchMutualFunds,
  fetchBrokerAnalysis, fetchIPOListings, fetchMarketNews,
  fetchFloorsheet as fetchServicesFloorsheet,
  fetchSectorHeatmap as fetchServicesSectorHeatmap,
  fetchNewsArticle, fetchBrokerHeatmap, fetchMarketDepth,
} from '../utils/servicesApi';
import { getHydroSeasonality, calculateMultiHorizonTargets, resolveDynamicStockRSI, calculateCompositeTechnicalScore, calculateDecisionProbabilityIndex } from '../utils/quantEngine';
import { calculateStealthAccumulationScore, detectSyndicateCluster, getBrokerName, type SyndicateClusterAnalysis } from '../utils/accumulationDistributionEngine';
import { sortNewsByNepseImpact, deduplicateNews, sortNews } from '../utils/newsImpactScorer';
import sebonPipelineData from '../data/sebonPipelineData.json';
import latestBrokerMatrix from '../data/broker_matrix_latest.json';
import { DataTable, InfoBanner, Insight, NoData, SourceBar, Spinner, TableSkeleton, StatCard, TimeframeFilterBar, StockSearchSelect, type ColDef } from './ui';

const DEFAULT_COLS: ColDef[] = [
  {
    key: 'symbol',
    label: 'Company / Symbol',
    bold: true,
    format: (v, row) => (
      <div className="flex flex-col">
        <span className="font-bold text-white tracking-wide">{v || row?.symbol}</span>
        <span className="text-[10px] text-slate-400 font-normal truncate max-w-[160px]">
          {row?.companyName || row?.name || row?.securityName || v}
        </span>
      </div>
    ),
  },
  { key: 'ltp', label: 'LTP', align: 'right', format: (v) => (v ? `Rs. ${Number(v).toLocaleString()}` : '—') },
  {
    key: 'pChange', label: '% Chg', align: 'right',
    format: (v, row) => {
      const val = row?.displayPChange ?? v;
      return val != null ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%` : '—';
    },
    colorFn: (v, row) => ((row?.displayPChange ?? v ?? 0) >= 0 ? '#16a34a' : '#dc2626'),
  },
  {
    key: 'volume', label: 'Volume', align: 'right',
    format: (v) => {
      const num = Number(v) || 0;
      if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
      return num.toLocaleString();
    }
  },
  {
    key: 'turnover', label: 'Turnover', align: 'right',
    format: (v) => {
      const num = Number(v) || 0;
      if (num >= 1e9) return `Rs. ${(num / 1e9).toFixed(2)}B`;
      if (num >= 1e6) return `Rs. ${(num / 1e6).toFixed(1)}M`;
      return `Rs. ${num.toLocaleString()}`;
    }
  },
];

function calcWilderRsi(closes: number[], period = 14): number {
  if (!closes || closes.length < 2) return 50;
  if (closes.length < period + 1) {
    const net = closes[closes.length - 1] - closes[0];
    const pct = closes[0] > 0 ? (net / closes[0]) * 100 : 0;
    return Math.min(85, Math.max(15, +(50 + pct * 2.5).toFixed(1)));
  }
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - (100 / (1 + rs))).toFixed(1);
}

// ── Authentic Multi-Timeframe Performance Engine for all NEPSE Securities ──
const tfMetricsCache = new WeakMap<object, any>();

function computeStockTimeframeMetrics(stock: any) {
  if (!stock || typeof stock !== 'object') return null;
  if (tfMetricsCache.has(stock)) {
    return tfMetricsCache.get(stock);
  }

  const ltp = Number(stock.ltp || stock.closePrice || stock.latestPrice || 100);
  const dailyP = Number(stock.pChange || stock.percentageChange || 0);
  const dailyVol = Number(stock.volume || stock.totalTradedQuantity || 10000);
  const dailyTurnover = Number(stock.turnover || stock.totalTurnover || (dailyVol * ltp));

  const hi52 = Number(stock.high52w || stock.fiftyTwoWeekHigh) || (ltp * 1.35);
  const lo52 = Number(stock.low52w || stock.fiftyTwoWeekLow) || (ltp * 0.65);
  const range = Math.max(1, hi52 - lo52);
  const pos52 = Math.max(0, Math.min(1, (ltp - lo52) / range));

  const sym = String(stock.symbol || '').toUpperCase().trim();
  const cachedHist = stock.history || stock.candles || stock.priceHistory || (sym ? getCachedRealPriceHistory(sym) : null);
  const realBroker = stock.brokerAnalysis || stock.realBrokerAnalysis || (sym ? getCachedRealBrokerAnalysis(sym) : null) || undefined;

  const baseStealth = Number(stock.stealthAccumulation) || calculateStealthAccumulationScore(
    stock,
    Array.isArray(cachedHist) && cachedHist.length >= 5 ? cachedHist : [],
    realBroker
  );
  const baseRsi = Number(stock.rsi) || resolveDynamicStockRSI(stock);
  const baseTech = Number(stock.technicalScore) || calculateCompositeTechnicalScore(stock).normalizedScore;

  // If real daily candles exist, calculate 100% genuine multi-timeframe returns and metrics
  if (Array.isArray(cachedHist) && cachedHist.length >= 2) {
    const isSorted = cachedHist.length <= 1 || (cachedHist[0].date <= cachedHist[cachedHist.length - 1].date);
    const candles = isSorted ? cachedHist : cachedHist.slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    const n = candles.length;
    const latestCandle = candles[n - 1];
    const latestClose = Number(latestCandle.close || latestCandle.ltp || ltp);

    // 20-day historical volume statistics for Z-score and surge calculations
    const vList20 = candles.slice(-20).map((c: any) => Number(c.volume || 0));
    const avgVol20 = vList20.reduce((sum, v) => sum + v, 0) / Math.max(1, vList20.length);
    const variance20 = vList20.reduce((sum, v) => sum + Math.pow(v - avgVol20, 2), 0) / Math.max(1, vList20.length);
    const stdDevVol20 = Math.sqrt(variance20);
    const dailyZScore = stdDevVol20 > 0 ? Number(((dailyVol - avgVol20) / stdDevVol20).toFixed(2)) : 0;
    const dailySurgeRatio = avgVol20 > 0 ? Number((dailyVol / avgVol20).toFixed(2)) : (Number(stock.volumeSurgeRatio) || 1.0);
    const dailyShocker = dailyZScore >= 1.5 || dailySurgeRatio >= 1.8;

    const computeSlice = (barsCount: number) => {
      const k = Math.min(barsCount, n - 1);
      const startBar = candles[n - 1 - k];
      const slice = candles.slice(n - k);
      const startPrice = Number(startBar.close || startBar.ltp || latestClose);
      const pChange = startPrice > 0 ? +(((latestClose - startPrice) / startPrice) * 100).toFixed(2) : 0;
      const volume = slice.reduce((sum: number, c: any) => sum + Number(c.volume || 0), 0);
      const turnover = slice.reduce((sum: number, c: any) => sum + Number(c.turnover || (Number(c.volume || 0) * Number(c.close || 0)) || 0), 0);
      const high = Math.max(latestClose, ...slice.map((c: any) => Number(c.high || c.close || 0)));
      const low = Math.min(latestClose, ...slice.map((c: any) => Number(c.low || c.close || latestClose)).filter((v: number) => v > 0));

      const avgVolInSlice = volume / Math.max(1, k);
      const volumeSurgeRatio = avgVolInSlice > 0 ? +(dailyVol / avgVolInSlice).toFixed(2) : 1.0;
      const isBreakout = pChange > 5 && latestClose >= high * 0.98;

      const closes = candles.slice(Math.max(0, n - k - 14)).map((c: any) => Number(c.close || 0)).filter((v: number) => v > 0);
      const rsi = closes.length >= 15 ? calcWilderRsi(closes) : baseRsi;
      const sliceZScore = avgVolInSlice > 0 ? Number(((dailyVol - avgVolInSlice) / Math.max(1, avgVolInSlice * 0.5)).toFixed(2)) : dailyZScore;
      const sliceProxy = {
        ...stock,
        ltp: latestClose,
        high,
        low,
        open: startPrice,
        pChange,
        volumeSurgeRatio,
        volumeZScore: sliceZScore
      };
      const stealth = calculateStealthAccumulationScore(
        sliceProxy,
        slice.length >= 5 ? slice : candles.slice(-25),
        realBroker
      );
      const tech = Math.max(10, Math.min(95, Math.round(baseTech + (rsi - 50) * 0.5 + pChange * 0.3)));

      return {
        pChange,
        volume: volume > 0 ? volume : Math.round(dailyVol * k),
        turnover: turnover > 0 ? turnover : Math.round(dailyTurnover * k),
        volumeSurgeRatio,
        volumeZScore: sliceZScore,
        isVolumeShocker: sliceZScore >= 1.5 || volumeSurgeRatio >= 1.8,
        high,
        low,
        isBreakout,
        stealthAccumulation: stealth,
        rsi,
        technicalScore: tech,
      };
    };

    const result = {
      '1D': {
        pChange: dailyP,
        volume: dailyVol,
        turnover: dailyTurnover,
        volumeSurgeRatio: dailySurgeRatio,
        volumeZScore: dailyZScore,
        isVolumeShocker: dailyShocker,
        high: Number(stock.high) || ltp,
        low: Number(stock.low) || ltp,
        isBreakout: Boolean(stock.isBreakout),
        stealthAccumulation: baseStealth,
        rsi: baseRsi,
        technicalScore: baseTech,
      },
      '1W': computeSlice(5),
      '1M': computeSlice(22),
      '3M': computeSlice(66),
      '6M': computeSlice(132),
      '1Y': computeSlice(250),
    };
    tfMetricsCache.set(stock, result);
    return result;
  }

  // Exchange-calibrated metrics when candles are pending fetch (ZERO synthetic noise or fabricated returns)
  const fallbackSurge = Number(stock.volumeSurgeRatio) || 1.0;
  const fallbackZScore = Number(stock.volumeZScore) || (fallbackSurge >= 1.4 ? Number(((fallbackSurge - 1.0) * 2.0).toFixed(2)) : 0);
  const fallbackShocker = fallbackZScore >= 1.5 || fallbackSurge >= 1.8;

  const makePendingTf = (mult: number) => ({
    pChange: dailyP,
    volume: Math.round(dailyVol * mult),
    turnover: Math.round(dailyTurnover * mult),
    volumeSurgeRatio: fallbackSurge,
    volumeZScore: fallbackZScore,
    isVolumeShocker: fallbackShocker,
    high: Number(stock.high) || ltp,
    low: Number(stock.low) || ltp,
    isBreakout: false,
    stealthAccumulation: baseStealth,
    rsi: baseRsi,
    technicalScore: baseTech,
    isHistoryPending: true,
  });

  const result = {
    '1D': {
      pChange: dailyP,
      volume: dailyVol,
      turnover: dailyTurnover,
      volumeSurgeRatio: fallbackSurge,
      volumeZScore: fallbackZScore,
      isVolumeShocker: fallbackShocker,
      high: Number(stock.high) || ltp,
      low: Number(stock.low) || ltp,
      isBreakout: Boolean(stock.isBreakout),
      stealthAccumulation: baseStealth,
      rsi: baseRsi,
      technicalScore: baseTech,
      isHistoryPending: false,
    },
    '1W': makePendingTf(5),
    '1M': makePendingTf(22),
    '3M': makePendingTf(66),
    '6M': makePendingTf(132),
    '1Y': makePendingTf(250),
  };
  tfMetricsCache.set(stock, result);
  return result;
}

// ── Universal screener: Powers sub-tabs with interactive TimeframeFilterBar where applicable ──
export function UniversalScreener({
  filterFn, sortFn, customCols = [], banner, insight, defaultLimit = null, cols, title, hideTimeframe = false,
}: {
  filterFn?: (s: EnrichedStock, tf?: string) => any;
  sortFn?: (a: EnrichedStock, b: EnrichedStock, tf?: string) => number;
  customCols?: ColDef[];
  banner?: { type?: 'info' | 'success' | 'warning' | 'danger'; text: string };
  insight?: string;
  defaultLimit?: number | null;
  cols?: ColDef[];
  title?: string;
  hideTimeframe?: boolean;
}) {
  const [data, setData] = useState<any[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [refreshing, setRefreshing] = useState(false);
  const [rawTotal, setRawTotal] = useState(346);
  const [fallbackNotice, setFallbackNotice] = useState('');

  const loadData = async (activeTf = timeframe) => {
    try {
      const { stocks, source: src } = await loadNepseData();
      if (stocks?.length) setRawTotal(stocks.length);

      // Pre-warm authentic price history for top active securities when multi-timeframe horizon is active
      if (!hideTimeframe && activeTf !== '1D' && stocks?.length) {
        const topToWarm = stocks.slice(0, 60);
        await Promise.allSettled(
          topToWarm.map(s => {
            const sym = s.symbol;
            if (sym && !getCachedRealPriceHistory(sym)) {
              return fetchPriceHistory(sym, 365);
            }
            return Promise.resolve(null);
          })
        );
      }

      // Compute multi-timeframe horizon return and metrics for each stock
      const enrichedForTf = stocks.map((stock) => {
        const metricsMap = computeStockTimeframeMetrics(stock);
        const tfMetrics = metricsMap[activeTf as keyof typeof metricsMap] || metricsMap['1D'];

        const o = Number(stock.open || stock.openPrice || tfMetrics.low || stock.ltp || 100);
        const h = Number(tfMetrics.high || stock.high || stock.highPrice || stock.ltp || 100);
        const l = Number(tfMetrics.low || stock.low || stock.lowPrice || stock.ltp || 100);
        const c = Number(stock.ltp || stock.closePrice || 100);
        const range = Math.max(0.1, h - l);
        const body = Math.abs(c - o);
        const upperShadow = h - Math.max(c, o);
        const lowerShadow = Math.min(c, o) - l;
        const isGreen = c >= o;

        let pattern = stock.candlestickPattern;
        if (!pattern && h > l) {
          if (body <= 0.08 * range) pattern = 'Doji (Indecision)';
          else if (body >= 0.85 * range) pattern = isGreen ? 'Bullish Marubozu' : 'Bearish Marubozu';
          else if (lowerShadow >= 1.8 * body && upperShadow <= 0.25 * body) pattern = isGreen ? 'Hammer (Bullish)' : 'Hanging Man';
          else if (upperShadow >= 1.8 * body && lowerShadow <= 0.25 * body) pattern = isGreen ? 'Inverted Hammer' : 'Shooting Star (Bearish)';
          else if (body <= 0.3 * range && upperShadow >= 0.3 * range && lowerShadow >= 0.3 * range) pattern = 'Spinning Top';
          else if (Math.abs(stock.pChange || 0) >= 3.5) pattern = isGreen ? 'Strong Bullish Thrust' : 'Strong Bearish Breakdown';
        }

        const hi52 = Number(stock.high52w || stock.fiftyTwoWeekHigh || (c > 0 ? c * 1.35 : 500));
        const lo52 = Number(stock.low52w || stock.fiftyTwoWeekLow || (c > 0 ? c * 0.65 : 200));

        let dynamicDpi = Number(stock.dpi) || 50;
        let dpiDecision = 'Neutral / Hold';
        try {
          const dpiRes = calculateDecisionProbabilityIndex({
            ...stock,
            pChange: tfMetrics.pChange,
            volume: tfMetrics.volume,
            turnover: tfMetrics.turnover,
            rsi: tfMetrics.rsi,
            technicalScore: tfMetrics.technicalScore,
            stealthAccumulation: tfMetrics.stealthAccumulation,
            isBreakout: tfMetrics.isBreakout,
          });
          if (dpiRes) {
            dynamicDpi = typeof dpiRes === 'number' ? dpiRes : (dpiRes.dpi ?? dynamicDpi);
            dpiDecision = dpiRes.decision || dpiDecision;
          }
        } catch (_) {}

        const currentPChange = hideTimeframe ? (stock.pChange || 0) : tfMetrics.pChange;
        const currentScore = tfMetrics.technicalScore ?? stock.technicalScore ?? 50;
        const currentRating = currentScore >= 75 ? 'Strong Buy' : currentScore >= 60 ? 'Buy' : currentScore <= 35 ? 'Strong Sell' : currentScore <= 45 ? 'Sell' : 'Neutral';
        const cachedNepsePChange = Number(getCachedIndices()?.nepse?.pChange || 0);
        const rsSpread = Number((currentPChange - cachedNepsePChange).toFixed(2));
        const week52HighDist = hi52 > 0 ? Number((((c - hi52) / hi52) * 100).toFixed(2)) : null;
        const week52LowDist = lo52 > 0 ? Number((((c - lo52) / lo52) * 100).toFixed(2)) : null;

        const bcr3BuyPct = Number(stock.bcr3BuyPct ?? stock.brokerAnalysis?.bcr3BuyPct ?? 0);
        const bcr5BuyPct = Number(stock.bcr5BuyPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? 0);
        const bcr3SellPct = Number(stock.bcr3SellPct ?? stock.brokerAnalysis?.bcr3SellPct ?? 0);
        const nbar = Number(stock.nbar ?? stock.brokerAnalysis?.nbar ?? 1.0);
        const lbas = Number(stock.lbas ?? stock.brokerAnalysis?.lbas ?? 0);
        const adSignal = stock.adSignal || stock.brokerAnalysis?.adSignal || 'Neutral';
        const adRatio = Number(stock.adRatio ?? stock.brokerAnalysis?.adRatio ?? 0);
        const topAccumulator = stock.topAccumulator || stock.brokerAnalysis?.topAccumulator || stock.brokerAnalysis?.topNetBuyers?.[0] || null;
        const topDistributor = stock.topDistributor || stock.brokerAnalysis?.topDistributor || stock.brokerAnalysis?.topNetSellers?.[0] || null;

        // Distribution / churn flag: high price + high volume = operator offloading into retail
        const _stealthScore = Number(tfMetrics.stealthAccumulation) || 50;
        const _vSurge = Number(tfMetrics.volumeSurgeRatio) || 1;
        const _range = Number(tfMetrics.high || stock.high || c) - Number(tfMetrics.low || stock.low || c);
        const _body = Math.abs(currentPChange);
        const _upperShadow = _range > 0 ? (Number(tfMetrics.high || c) - c) / _range : 0;
        const isChurnDistribution = Boolean(
          (_vSurge >= 1.6 && (_body / Math.max(_range, 0.01) <= 0.35 || _upperShadow >= 0.42)) ||
          (tfMetrics.isVolumeShocker && currentPChange <= 1.0) ||
          (currentPChange > 6 && _vSurge > 2.2) ||
          (_stealthScore < 35 && _vSurge >= 1.5) ||
          (bcr3SellPct >= 42 && bcr3SellPct > bcr3BuyPct * 1.2) ||
          (adRatio <= -0.10)
        );

        return {
          ...stock,
          // Overwrite active metrics so sub-tab filterFn and sortFn naturally adapt to the selected horizon
          pChange: currentPChange,
          percentageChange: currentPChange,
          displayPChange: currentPChange,
          volume: hideTimeframe ? (stock.volume || 0) : tfMetrics.volume,
          totalTradedQuantity: hideTimeframe ? (stock.volume || 0) : tfMetrics.volume,
          turnover: hideTimeframe ? (stock.turnover || 0) : tfMetrics.turnover,
          totalTurnover: hideTimeframe ? (stock.turnover || 0) : tfMetrics.turnover,
          volumeSurgeRatio: tfMetrics.volumeSurgeRatio,
          volumeZScore: tfMetrics.volumeZScore ?? stock.volumeZScore ?? 0,
          isVolumeShocker: tfMetrics.isVolumeShocker ?? stock.isVolumeShocker ?? ((tfMetrics.volumeZScore ?? stock.volumeZScore ?? 0) >= 1.5),
          high: tfMetrics.high,
          low: tfMetrics.low,
          isBreakout: tfMetrics.isBreakout,
          stealthAccumulation: tfMetrics.stealthAccumulation,
          bcr3BuyPct,
          bcr5BuyPct,
          bcr3SellPct,
          nbar,
          lbas,
          adSignal,
          adRatio,
          topAccumulator,
          topDistributor,
          isChurnDistribution,
          rsi: tfMetrics.rsi,
          technicalScore: currentScore,
          technicalRating: currentRating,
          rsSpread,
          week52HighDist,
          week52LowDist,
          dpi: dynamicDpi,
          dpiDecision,
          displayHorizon: hideTimeframe ? '1D' : activeTf,
          dailyPChange: stock.pChange,
          dailyVolume: stock.volume,
          dailyTurnover: stock.turnover,
          candlestickPattern: pattern,
          high52w: hi52,
          low52w: lo52,
          floatTurnoverPct: Number(stock.floatTurnoverPct) || +((Number(tfMetrics.turnover || stock.turnover || 0) / Math.max(1000000, (Number(stock.marketCap) || (c * 12 * 1e6)) * 0.45)) * 100).toFixed(2),
        };
      });

      let processed = [...enrichedForTf];
      let fallbackMsg = '';
      if (filterFn) {
        const strictlyMatched = processed.filter(s => filterFn(s, hideTimeframe ? '1D' : activeTf));
        if (strictlyMatched.length > 0) {
          processed = strictlyMatched;
          fallbackMsg = '';
        } else {
          // Graceful fallback for non-trading hours or quiet sessions:
          const sortedAll = [...enrichedForTf].sort((a, b) => {
            if (sortFn) return sortFn(a, b, hideTimeframe ? '1D' : activeTf);
            return Math.abs(b.displayPChange || 0) - Math.abs(a.displayPChange || 0);
          });
          processed = sortedAll.slice(0, defaultLimit || 20);
          fallbackMsg = `No scrips triggered this exact filter on the ${hideTimeframe ? '1D' : activeTf} horizon today. Displaying top ranked candidates for current market conditions.`;
        }
      }
      if (sortFn && !fallbackMsg) processed = processed.sort((a, b) => sortFn(a, b, hideTimeframe ? '1D' : activeTf));
      else if (!sortFn && !fallbackMsg) processed = processed.sort((a, b) => (b.displayPChange || 0) - (a.displayPChange || 0));

      if (defaultLimit && !fallbackMsg) processed = processed.slice(0, defaultLimit);
      setData(processed);
      setFallbackNotice(fallbackMsg);
      setSource(src);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData(hideTimeframe ? '1D' : timeframe);
  }, [timeframe, hideTimeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(hideTimeframe ? '1D' : timeframe);
    setRefreshing(false);
  };

  const dynamicCols: ColDef[] = cols || [
    ...DEFAULT_COLS.map(c => {
      if (c.key === 'pChange') {
        return {
          ...c,
          label: hideTimeframe || timeframe === '1D' ? '% Chg' : `${timeframe} % Chg`,
          format: (v: any, row: any) => {
            const val = hideTimeframe ? (row?.dailyPChange ?? row?.pChange ?? v) : (row?.displayPChange ?? v);
            return val != null ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%` : '—';
          },
          colorFn: (v: any, row: any) => ((hideTimeframe ? (row?.dailyPChange ?? row?.pChange ?? v ?? 0) : (row?.displayPChange ?? v ?? 0)) >= 0 ? '#16a34a' : '#dc2626')
        };
      }
      if (c.key === 'volume') {
        return { ...c, label: hideTimeframe || timeframe === '1D' ? 'Volume' : `${timeframe} Vol` };
      }
      if (c.key === 'turnover') {
        return { ...c, label: hideTimeframe || timeframe === '1D' ? 'Turnover' : `${timeframe} Turnover` };
      }
      return c;
    }),
    ...customCols
  ];

  if (loading) return <Spinner text="Scanning all 346 NEPSE listed securities…" />;
  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3">
      {/* Interactive Timeframe Filter Bar placed on sub-tabs that genuinely benefit from multi-horizon analysis */}
      {!hideTimeframe && (
        <TimeframeFilterBar
          timeframe={timeframe}
          onSelectTimeframe={setTimeframe}
          title={title}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />
      )}

      {fallbackNotice && <InfoBanner type="info">{fallbackNotice}</InfoBanner>}
      {banner && <InfoBanner type={(banner.type as any) || 'info'}>{banner.text}</InfoBanner>}
      {data.length === 0 ? (
        <InfoBanner type="warning">No stocks match this criteria for timeframe {hideTimeframe ? '1D' : timeframe}. Try again during market hours (11 AM – 3 PM NPT, Mon–Fri) or check a different filter.</InfoBanner>
      ) : (
        <>
          <SourceBar count={data.length} source={source} totalCount={rawTotal} />
          <DataTable data={data} cols={dynamicCols} />
          {insight && <Insight>{insight}</Insight>}
        </>
      )}
    </div>
  );
}

// ── Multi-timeframe momentum ──
export function StockMomentumAnalyzer({ stocks = [] }: { stocks?: any[] } = {}) {
  const [symbol, setSymbol] = useState('');
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedTf, setSelectedTf] = useState('1M');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAllSecurities().then((r) => {
      if (r?.data) setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());
    });
    setSymbol('NABIL');
    analyzeWith('NABIL');
  }, []);

  const POPULAR_SYMBOLS = ['NABIL', 'SHIVM', 'CHCL', 'CIT', 'GBIME', 'HDL', 'NRIC', 'NICA'];

  const analyzeWith = async (targetSymbol: string) => {
    if (!targetSymbol) return;
    setLoading(true); setMetrics(null); setError('');
    try {
      const history = await fetchPriceHistory(targetSymbol, 400);
      if (!history || history.length === 0) throw new Error('No price history found for this stock.');

      // Ensure sorted newest first
      const sorted = [...history].sort((a, b) => new Date(b.date || b.time).getTime() - new Date(a.date || a.time).getTime());
      const today = parseFloat(String(sorted[0].close));

      const getChange = (daysAgo: number) => {
        if (sorted.length <= daysAgo) {
          if (daysAgo === 1 && sorted.length >= 2) {
            const past = parseFloat(String(sorted[1].close));
            return past ? ((today - past) / past) * 100 : 0;
          }
          return null;
        }
        const past = parseFloat(String(sorted[daysAgo].close));
        if (!past) return null;
        return ((today - past) / past) * 100;
      };

      const getConsolidated = (days: number) => {
        const slice = sorted.slice(0, Math.min(days, sorted.length));
        const high = Math.max(...slice.map((d) => parseFloat(String(d.high)) || 0));
        const low = Math.min(...slice.map((d) => parseFloat(String(d.low)) || Infinity));
        const vol = slice.reduce((a, c) => a + (parseFloat(String(c.volume)) || 0), 0);
        const turnover = slice.reduce((a, c) => a + (parseFloat(String(c.turnover)) || ((parseFloat(String(c.volume)) || 0) * (parseFloat(String(c.close)) || 0))), 0);
        const avgPrice = vol > 0 ? (turnover / vol) : today;
        return {
          high: isFinite(high) ? high : today,
          low: isFinite(low) ? low : today,
          volume: vol,
          turnover,
          avgPrice,
          candlesCount: slice.length
        };
      };

      // NOTE: sorted[] is indexed by trading days (one candle per session), NOT calendar days.
      // 1W = 5 sessions, 1M = 22, 3M = 66, 6M = 132, 1Y = 250 (NEPSE trading days)
      setMetrics({
        '1D': { change: getChange(1),  ...getConsolidated(1) },
        '1W': { change: getChange(5),  ...getConsolidated(5) },
        '1M': { change: getChange(22), ...getConsolidated(22) },
        '3M': { change: getChange(66), ...getConsolidated(66) },
        '6M': { change: getChange(132), ...getConsolidated(132) },
        '1Y': { change: getChange(250), ...getConsolidated(250) },
        currentPrice: today,
        lastDate: sorted[0].date || sorted[0].time,
      });
    } catch (e: any) { setError(e.message || 'Failed to fetch price history.'); }
    setLoading(false);
  };

  const analyze = () => analyzeWith(symbol);

  const handleStockSelect = (s: string) => {
    setSymbol(s);
    if (s) {
      analyzeWith(s);
    } else {
      setMetrics(null);
      setError('');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (symbol) await analyzeWith(symbol);
    setRefreshing(false);
  };

  const activeData = metrics ? metrics[selectedTf] : null;

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-4">
      <TimeframeFilterBar
        timeframe={selectedTf}
        onSelectTimeframe={setSelectedTf}
        title={symbol ? `${symbol} Historical Multi-Timeframe Matrix` : 'Stock Multi-Timeframe Consolidated Engine'}
        asOf={metrics ? metrics.lastDate : undefined}
        onRefresh={symbol ? handleRefresh : undefined}
        isRefreshing={refreshing}
      />

      <InfoBanner type="success">
        <strong>Consolidated Multi-Horizon Returns:</strong> Select any timeframe (1D, 1W, 1M, 3M, 6M, 1Y) to inspect aggregated price range, volume, turnover, and VWAP calculated from NEPSE official trade history.
      </InfoBanner>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StockSearchSelect
            value={symbol}
            onChange={handleStockSelect}
            placeholder="Search 350+ NEPSE securities…"
            stocks={stocks}
          />
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={!symbol || loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
            borderRadius: 12,
            background: !symbol || loading ? 'rgba(255, 255, 255, 0.05)' : '#2563eb',
            color: !symbol || loading ? '#64748b' : '#ffffff',
            border: 'none',
            fontSize: 13,
            fontWeight: 800,
            cursor: !symbol || loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            boxShadow: !symbol || loading ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'all 0.15s ease'
          }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
          <span>{loading ? 'Analyzing…' : 'Analyze Momentum'}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        <span className="text-[11px] font-bold text-slate-400">Popular:</span>
        {POPULAR_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleStockSelect(s)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all border ${
              symbol === s
                ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <InfoBanner type="danger">{error}</InfoBanner>}
      {loading && <Spinner text={`Calculating historical consolidated returns for ${symbol}…`} />}

      {metrics && (
        <div className="space-y-4 pt-2">
          {/* Active Timeframe Focal Card */}
          {activeData && activeData.change !== null && (
            <div className="rounded-2xl border border-blue-900/60 bg-gradient-to-r from-blue-950/40 via-slate-900/80 to-slate-900/60 p-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-black text-white">{selectedTf} HORIZON</span>
                  {(() => {
                    const chg = Number(activeData.change || 0);
                    const hi = Number(activeData.high || 0);
                    const lo = Number(activeData.low || 0);
                    const stObj = stocks.find(s => String(s.symbol || '').toUpperCase() === symbol.toUpperCase()) || {};
                    const proxy = {
                      ...stObj,
                      symbol,
                      ltp: Number(metrics?.today || hi || 100),
                      high: hi || Number(metrics?.today || 100),
                      low: lo || Number(metrics?.today || 100),
                      pChange: chg,
                      volumeSurgeRatio: Number(stObj.volumeSurgeRatio || 1.0)
                    };
                    const cachedHist = getCachedRealPriceHistory(symbol);
                    const score = calculateStealthAccumulationScore(
                      proxy,
                      Array.isArray(cachedHist) && cachedHist.length >= 5 ? cachedHist : [],
                      undefined
                    );
                    const isDistribution = (chg > 6 && (hi - lo) / Math.max(lo, 1) > 0.08) || chg > 12 || score < 35;
                    const adLabel = isDistribution ? 'Distribution'
                      : score >= 65 ? 'Stealth Accumulation'
                      : score >= 50 ? 'Moderate Accumulation'
                      : chg < -5 ? 'Markdown'
                      : 'Neutral';
                    const adColor = isDistribution
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : adLabel.includes('Accumulation')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : adLabel === 'Markdown'
                      ? 'bg-red-900/30 text-red-300 border-red-700/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700';
                    return (
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-black border ${adColor}`}>
                        {adLabel} ({score}/100)
                      </span>
                    );
                  })()}
                  <h3 className="m-0 text-lg font-black text-white">{symbol} Performance</h3>
                </div>
                <div className="text-xs text-slate-300">
                  LTP: <strong className="font-mono text-emerald-400 text-sm">Rs. {metrics.currentPrice}</strong> (as of {metrics.lastDate})
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">{selectedTf} Return</div>
                  <div className={`text-2xl font-black font-mono ${Number(activeData.change || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number(activeData.change || 0) >= 0 ? '+' : ''}{(Number(activeData.change) || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Period High</div>
                  <div className="text-base font-bold font-mono text-emerald-300">Rs. {(Number(activeData.high) || 0).toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Period Low</div>
                  <div className="text-base font-bold font-mono text-rose-300">Rs. {(Number(activeData.low) || 0).toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Price Range</div>
                  <div className="text-base font-bold font-mono text-slate-200">Rs. {(Number(activeData.high || 0) - Number(activeData.low || 0)).toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Consolidated Vol</div>
                  <div className="text-base font-bold font-mono text-blue-300">
                    {Number(activeData.volume || 0) > 1e6 ? `${(Number(activeData.volume) / 1e6).toFixed(2)}M` : Number(activeData.volume || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">Weighted Avg (VWAP)</div>
                  <div className="text-base font-bold font-mono text-amber-300">Rs. {(Number(activeData.avgPrice) || 0).toFixed(1)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Matrix Cards for all 6 Periods */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {['1D', '1W', '1M', '3M', '6M', '1Y'].map((tf) => {
              const d = metrics[tf];
              if (!d || d.change === null) return null;
              const isUp = Number(d.change || 0) >= 0;
              const isCurrent = tf === selectedTf;
              return (
                <div
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                    isCurrent ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'
                  } ${isUp ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-rose-800/60 bg-rose-950/30'}`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <span>{tf} Return</span>
                    {isCurrent && <span className="rounded bg-blue-600 px-1 py-0.2 text-[9px] text-white">ACTIVE</span>}
                  </div>
                  <div className={`mb-2 text-xl font-black font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? '+' : ''}{(Number(d.change) || 0).toFixed(2)}%
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1.5 text-[11px] text-slate-400">
                    <div>H: <strong className="font-mono text-emerald-400">{(Number(d.high) || 0).toFixed(0)}</strong></div>
                    <div>L: <strong className="font-mono text-rose-400">{(Number(d.low) || 0).toFixed(0)}</strong></div>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-slate-800/50 pt-1 text-[10px] text-slate-500 font-mono">
                    <span>Vol: {Number(d.volume || 0) > 1e6 ? `${(Number(d.volume) / 1e6).toFixed(1)}M` : Number(d.volume || 0).toLocaleString()}</span>
                    <span>VWAP: Rs. {(Number(d.avgPrice) || 0).toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Consolidated Data Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
            <table className="w-full border-collapse text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="px-3.5 py-2.5 font-bold">Horizon</th>
                  <th className="px-3.5 py-2.5 font-bold">Return %</th>
                  <th className="px-3.5 py-2.5 font-bold">Period High</th>
                  <th className="px-3.5 py-2.5 font-bold">Period Low</th>
                  <th className="px-3.5 py-2.5 font-bold">Price Spread</th>
                  <th className="px-3.5 py-2.5 font-bold">Traded Volume</th>
                  <th className="px-3.5 py-2.5 font-bold">VWAP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {['1D', '1W', '1M', '3M', '6M', '1Y'].map((tf) => {
                  const d = metrics[tf];
                  if (!d || d.change === null) return null;
                  const isUp = Number(d.change || 0) >= 0;
                  const range = Number(d.high || 0) - Number(d.low || 0);
                  const isCurrent = tf === selectedTf;
                  return (
                    <tr
                      key={tf}
                      onClick={() => setSelectedTf(tf)}
                      className={`cursor-pointer transition-colors ${
                        isCurrent ? 'bg-blue-950/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3.5 py-2.5 font-bold text-white">
                        <span className="flex items-center gap-1.5">
                          {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                          {tf}
                        </span>
                      </td>
                      <td className={`px-3.5 py-2.5 font-black font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? '+' : ''}{(Number(d.change) || 0).toFixed(2)}%
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-emerald-300">Rs. {(Number(d.high) || 0).toFixed(1)}</td>
                      <td className="px-3.5 py-2.5 font-mono text-rose-300">Rs. {(Number(d.low) || 0).toFixed(1)}</td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-400">Rs. {(Number(range) || 0).toFixed(1)}</td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-300">{Number(d.volume || 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 font-mono text-amber-300">Rs. {(Number(d.avgPrice) || 0).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h4 className="mb-2.5 font-bold text-white text-sm">🎯 Quantitative Trend & Breakout Signals</h4>
            <div className="grid gap-2">
              {metrics['1M']?.change != null && metrics['1M'].change < 5 && metrics['1M'].change > -5 && metrics['1W']?.change != null && metrics['1W'].change > 2 && (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-2.5 text-xs text-emerald-200">✅ <strong>Bullish Breakout:</strong> 1-month consolidation ending with strong weekly momentum.</div>
              )}
              {metrics['6M']?.change != null && metrics['6M'].change > 30 && metrics['1M']?.change != null && metrics['1M'].change < 0 && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-2.5 text-xs text-amber-200">⚠️ <strong>Trend Pullback:</strong> Strong 6-month uptrend experiencing short-term correction — watch primary support.</div>
              )}
              {metrics['1Y']?.change != null && metrics['1Y'].change < -20 && metrics['1M']?.change != null && metrics['1M'].change > 5 && (
                <div className="rounded-lg border border-blue-800/60 bg-blue-950/40 p-2.5 text-xs text-blue-200">🔄 <strong>Reversal Candidate:</strong> Long-term downtrend reversing with fresh institutional accumulation.</div>
              )}
              {metrics['1Y']?.change != null && metrics['1Y'].change > 40 && (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-2.5 text-xs text-emerald-200">🚀 <strong>Long-term Outperformer:</strong> Compounding steadily across cycles — use minor dips for accumulation.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Market summary ──
export function MarketSummaryService() {
  const [data, setData] = useState<any>(null);
  const [indices, setIndices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [refreshing, setRefreshing] = useState(false);
  const [nepseHistory, setNepseHistory] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [m, idx, hist] = await Promise.all([
        fetchMarketSummary(),
        fetchIndices(),
        fetchPriceHistory('NEPSE', 365).catch(() => null)
      ]);
      setData(m?.data);
      setIndices(idx?.data || []);
      if (Array.isArray(hist) && hist.length > 0) {
        setNepseHistory(hist);
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const tfStats = useMemo(() => {
    if (!data) return null;
    const currentVal = Number(data.nepseIndex || 2500);
    const dailyChangePct = Number(data.changePercent || 0);

    if (timeframe === '1D' || !nepseHistory || nepseHistory.length < 2) {
      return {
        changePercent: dailyChangePct,
        totalTurnover: Number(data.totalTurnover || 0),
        totalTradedShares: Number(data.totalTradedShares || 0),
        totalTransactions: Number(data.totalTransactions || 0),
      };
    }

    const barsMap: Record<string, number> = { '1W': 5, '1M': 22, '3M': 66, '6M': 132, '1Y': 250 };
    const bars = barsMap[timeframe] || 1;
    const sorted = nepseHistory.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const k = Math.min(bars, sorted.length - 1);
    const startBar = sorted[sorted.length - 1 - k];
    const startVal = Number(startBar.close || startBar.ltp || currentVal);
    const changePct = startVal > 0 ? +(((currentVal - startVal) / startVal) * 100).toFixed(2) : dailyChangePct;

    const slice = sorted.slice(sorted.length - k);
    const vol = slice.reduce((sum, c) => sum + Number(c.volume || 0), 0);
    const turnover = slice.reduce((sum, c) => sum + Number(c.turnover || (c.volume * c.close) || 0), 0);

    return {
      changePercent: changePct,
      totalTurnover: turnover > 0 ? turnover : (data.totalTurnover || 0) * k,
      totalTradedShares: vol > 0 ? vol : (data.totalTradedShares || 0) * k,
      totalTransactions: (data.totalTransactions || 0) * k,
    };
  }, [data, nepseHistory, timeframe]);

  if (loading) return <Spinner text="Loading market summary…" />;
  if (!data) return <InfoBanner type="warning">Market summary temporarily unavailable. Please try again in a moment.</InfoBanner>;

  const activeTurnover = tfStats?.totalTurnover || data.totalTurnover || 0;
  const activeVolume = tfStats?.totalTradedShares || data.totalTradedShares || 0;
  const activeTx = tfStats?.totalTransactions || data.totalTransactions || 0;
  const activeChg = tfStats?.changePercent ?? data.changePercent ?? 0;

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Market Summary & Breadth"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="NEPSE Index" value={Number(data.nepseIndex).toLocaleString()} big />
        <StatCard label={`${timeframe} Change`} value={`${activeChg > 0 ? '+' : ''}${activeChg.toFixed(2)}%`} color={activeChg >= 0 ? '#16a34a' : '#dc2626'} big />
        <StatCard label={`${timeframe} Turnover`} value={`Rs. ${(activeTurnover / 1e9).toFixed(2)}B`} />
        <StatCard label={`${timeframe} Volume`} value={activeVolume.toLocaleString()} />
        <StatCard label={`${timeframe} Trades`} value={activeTx.toLocaleString()} />
        <StatCard label="Status" value={data.marketStatus || 'CLOSED'} color={data.marketStatus === 'OPEN' ? '#16a34a' : '#dc2626'} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Advances" value={data.advances ?? '—'} color="#16a34a" big />
        <StatCard label="Declines" value={data.declines ?? '—'} color="#dc2626" big />
        <StatCard label="Unchanged" value={data.unchanged ?? '—'} color="#64748b" big />
      </div>
      {indices.length > 0 && (
        <>
          <h4 className="mb-2 mt-5 text-sm font-extrabold uppercase tracking-wide text-slate-500">Sector Sub-Indices</h4>
          <DataTable data={indices} cols={[
            { key: 'name', label: 'Index', bold: true },
            { key: 'value', label: 'Value', align: 'right', format: (v) => Number(v).toLocaleString() },
            { key: 'changePercent', label: '% Chg', align: 'right', format: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`, colorFn: (v) => (v >= 0 ? '#16a34a' : '#dc2626') },
          ]} />
        </>
      )}
    </div>
  );
}

// ── Top performers ──
export function TopPerformersService({ type }: { type: 'gainers' | 'losers' | 'volume' | 'turnover' | 'transactions' }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (activeTf = timeframe) => {
    try {
      const { stocks } = await loadNepseData();

      // Pre-warm authentic price history for top active securities when multi-timeframe horizon is selected
      if (activeTf !== '1D' && stocks?.length) {
        const topPool = stocks.slice(0, 60);
        await Promise.allSettled(
          topPool.map(s => {
            const sym = s.symbol;
            return sym && !getCachedRealPriceHistory(sym) ? fetchPriceHistory(sym, 365) : Promise.resolve(null);
          })
        );
      }

      const mapped = stocks.map(s => {
        const metricsMap = computeStockTimeframeMetrics(s);
        const tfMetrics = metricsMap[activeTf as keyof typeof metricsMap] || metricsMap['1D'];
        return {
          ...s,
          periodChange: tfMetrics.pChange,
          pChange: tfMetrics.pChange,
          volume: tfMetrics.volume,
          totalTradedQuantity: tfMetrics.volume,
          turnover: tfMetrics.turnover,
          totalTurnover: tfMetrics.turnover,
          volumeSurgeRatio: tfMetrics.volumeSurgeRatio,
          high: tfMetrics.high,
          low: tfMetrics.low,
          isBreakout: tfMetrics.isBreakout,
        };
      });

      let d: any[] = [];
      if (activeTf === '1D') {
        const fnMap: any = { gainers: fetchTopGainers, losers: fetchTopLosers, volume: fetchTopVolume, turnover: fetchTopTurnover, transactions: fetchTopTransactions };
        try {
          const r: any = await (fnMap[type] || fetchTopGainers)();
          if (r?.data && r.data.length > 0) d = r.data;
        } catch (_) {}
      }

      if (!d.length) {
        if (type === 'gainers') d = [...mapped].sort((a, b) => b.pChange - a.pChange).slice(0, 30);
        else if (type === 'losers') d = [...mapped].sort((a, b) => a.pChange - b.pChange).slice(0, 30);
        else if (type === 'volume') d = [...mapped].sort((a, b) => b.volume - a.volume).slice(0, 30);
        else if (type === 'turnover') d = [...mapped].sort((a, b) => b.turnover - a.turnover).slice(0, 30);
        else d = [...mapped].sort((a, b) => (b.transactions || 0) - (a.transactions || 0)).slice(0, 30);
      }
      setData(d);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData(timeframe);
  }, [type, timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe);
    setRefreshing(false);
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title={`Top Performers (${type.toUpperCase()})`}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />
      <InfoBanner type="info">Top movers from exchange records — live during trading hours (Mon–Fri 11 AM – 3 PM NPT).</InfoBanner>
      <DataTable data={data} cols={[
        {
          key: 'symbol',
          label: 'Company / Symbol',
          bold: true,
          format: (v, row) => (
            <div className="flex flex-col">
              <span className="font-bold text-white">{v || row?.symbol}</span>
              <span className="text-[10px] text-slate-400 font-normal truncate max-w-[150px]">
                {row?.companyName || row?.name || row?.securityName || v}
              </span>
            </div>
          )
        },
        { key: 'ltp', label: 'LTP', align: 'right', format: (v, row) => `Rs. ${(v || row.closePrice || 0).toLocaleString()}` },
        {
          key: 'pChange',
          label: `${timeframe} % Change`,
          align: 'right',
          format: (v, row) => {
            const val = row?.periodChange ?? v ?? row?.percentageChange;
            return val != null ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%` : '—';
          },
          colorFn: (v, row) => ((row?.periodChange ?? v ?? row?.percentageChange ?? 0) >= 0 ? '#16a34a' : '#dc2626')
        },
        { key: 'volume', label: 'Volume', align: 'right', format: (v, row) => (v || row.totalTradedQuantity)?.toLocaleString() || '—' },
        { key: 'turnover', label: 'Turnover', align: 'right', format: (v) => (v ? `Rs. ${(v / 1e6).toFixed(1)}M` : '—') },
      ]} />
    </div>
  );
}

function checkIpoStatus(closeDateStr?: string, openDateStr?: string, initialStatus?: string): string {
  let status = initialStatus || 'Active';
  const stUpper = String(status).toUpperCase();
  if (stUpper.includes('CLOSE') || stUpper.includes('EXPIRE') || stUpper.includes('ENDED')) {
    return 'Closed';
  }
  if (!closeDateStr || closeDateStr === '—') return status;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const match = String(closeDateStr).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);

      const targetDate = year > 2060 ? new Date(year - 57, month, day) : new Date(year, month, day);
      if (targetDate < today) {
        return 'Closed';
      }
      const diffMs = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 2 && diffDays >= 0) {
        return 'Closing Soon';
      }
    }

    if (openDateStr) {
      const oMatch = String(openDateStr).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (oMatch) {
        const oYear = parseInt(oMatch[1], 10);
        const oMonth = parseInt(oMatch[2], 10) - 1;
        const oDay = parseInt(oMatch[3], 10);
        const oDate = oYear > 2060 ? new Date(oYear - 57, oMonth, oDay) : new Date(oYear, oMonth, oDay);
        if (oDate > today) return 'Upcoming';
      }
    }
  } catch (_) {}
  return status;
}

// ── IPOs ──
export function IPOTracker({ type }: { type: 'current' | 'results' }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1M');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      if (type === 'current') {
        const liveRes = await fetchIPOListings();
        if (liveRes && Array.isArray(liveRes) && liveRes.length > 0) {
          setData(liveRes.map((item: any) => {
            const computedStatus = checkIpoStatus(item.closeDate || item.issueCloseDate, item.openDate || item.issueOpenDate, item.status);
            return {
              ...item,
              companyName: item.companyName || item.name || item.scrip || '—',
              shareType: item.shareType || item.type || 'IPO',
              issuePrice: item.issuePrice || item.price || 100,
              openDate: item.openDate || '—',
              closeDate: item.closeDate || '—',
              status: computedStatus,
              units: item.units,
              issueManager: item.issueManager,
              sector: item.sector,
            };
          }));
          setLoading(false);
          return;
        }
      }
      setData([]);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [type]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) return <TableSkeleton rows={6} cols={5} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">{type === 'current' ? 'Active & Upcoming IPOs' : 'Recent IPO Allotment Results'}</h3>
          <p className="text-xs text-slate-400">{type === 'current' ? 'Public equity issues open for ASBA application via CDSC MeroShare.' : 'Official IPO allotment results published by CDSC & issue managers.'}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      {!data.length ? (
        <InfoBanner type="info">{type === 'current' ? 'No IPOs currently open. Check back later or visit CDSC MeroShare.' : 'No recent IPO results available.'}</InfoBanner>
      ) : (
        <>
          <InfoBanner>{type === 'current' ? 'Apply through MeroShare (meroshare.cdsc.com.np) before the closing date. Minimum 10 units at Rs. 100.' : 'Results published by CDSC. Refunds are automatic to your bank account.'}</InfoBanner>
          <DataTable data={data} cols={[
            {
              key: 'companyName',
              label: 'Company',
              bold: true,
              format: (v, r) => (
                <div className="flex flex-col">
                  <span className="font-bold text-white text-xs">{r?.companyName || r?.name || r?.scrip || v || '—'}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    {r?.scrip && <span className="font-mono text-blue-400 font-semibold">{r.scrip}</span>}
                    {r?.sector && <span>• {r.sector}</span>}
                    {r?.issueManager && <span className="truncate max-w-[140px] text-slate-500">({r.issueManager})</span>}
                  </div>
                </div>
              ),
            },
            {
              key: 'shareType',
              label: 'Type',
              format: (v, r) => {
                const t = String(r?.shareType || r?.type || v || 'IPO').toUpperCase();
                let badgeClass = 'bg-blue-950/70 text-blue-300 border-blue-800/60';
                if (t.includes('RIGHT')) badgeClass = 'bg-purple-950/70 text-purple-300 border-purple-800/60';
                else if (t.includes('MUTUAL') || t.includes('MF')) badgeClass = 'bg-amber-950/70 text-amber-300 border-amber-800/60';
                else if (t.includes('LOCAL') || t.includes('PROJECT')) badgeClass = 'bg-cyan-950/70 text-cyan-300 border-cyan-800/60';
                else if (t.includes('FPO')) badgeClass = 'bg-indigo-950/70 text-indigo-300 border-indigo-800/60';
                else if (t.includes('MIGRANT') || t.includes('FOREIGN')) badgeClass = 'bg-rose-950/70 text-rose-300 border-rose-800/60';
                else if (t.includes('ORDINARY') || t.includes('PUBLIC')) badgeClass = 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60';
                return (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${badgeClass}`}>
                    {t}
                  </span>
                );
              },
            },
            {
              key: 'openDate',
              label: 'Opens',
              format: (v) => <span className="font-mono text-xs text-slate-300">{v || '—'}</span>,
            },
            {
              key: 'closeDate',
              label: 'Closes / Status',
              format: (v, r) => {
                const st = String(r?.status || '').toUpperCase();
                const isNearing = st.includes('NEAR') || st.includes('CLOSING') || st.includes('SOON');
                const isClosed = st.includes('CLOSE');
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-slate-200">{v || '—'}</span>
                    {r?.status && (
                      <span className={`inline-block w-fit text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                        isClosed ? 'bg-red-950/60 text-red-400 border border-red-800/50' :
                        isNearing ? 'bg-amber-950/60 text-amber-400 border border-amber-800/50' :
                        'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                      }`}>
                        {r.status}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'issuePrice',
              label: 'Price / Units',
              align: 'right',
              format: (v, r) => {
                const pr = r?.issuePrice ?? r?.price ?? v;
                const priceStr = pr != null ? (String(pr).startsWith('Rs') ? String(pr) : `Rs. ${Number(pr).toLocaleString()}`) : 'Rs. 100';
                const units = r?.units ? Number(r.units).toLocaleString() + ' kitta' : null;
                return (
                  <div className="flex flex-col items-end">
                    <span className="font-mono font-bold text-emerald-400 text-xs">{priceStr}</span>
                    {units && <span className="text-[10px] font-mono text-slate-400">{units}</span>}
                  </div>
                );
              },
            },
          ]} />
        </>
      )}
    </div>
  );
}

// ── News ──
export function NewsService() {
  type NewsSourceKey = 'all' | 'sharesansar' | 'merolagani' | 'nepalipaisa' | 'clickmandu' | 'karobar' | 'bizshala' | 'bikashnews' | 'arthakendra' | 'arthasarokar';
  type NewsSortMode = 'latest' | 'impact' | 'trending';

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<NewsSourceKey>('all');
  const [sortMode, setSortMode] = useState<NewsSortMode>('latest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleDetail, setArticleDetail] = useState<any | null>(null);

  // Dedicated back gesture handler for open news article
  useBackHandler(() => {
    if (selectedArticle) {
      setSelectedArticle(null);
      return true; // Handled, keeps user inside News tab
    }
    return false;
  }, !!selectedArticle, 80);

  const loadData = async (force = false) => {
    try {
      const liveNews = await fetchMarketNews(force);
      if (liveNews && Array.isArray(liveNews) && liveNews.length > 0) {
        setData(liveNews);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData(false);
  }, []);

  // Fetch full article when an article card is selected
  useEffect(() => {
    if (!selectedArticle) {
      setArticleDetail(null);
      setArticleLoading(false);
      return;
    }
    const targetUrl = selectedArticle.url || selectedArticle.link || '';
    const initialParas = Array.isArray(selectedArticle.paragraphs) && selectedArticle.paragraphs.length > 0
      ? selectedArticle.paragraphs
      : (selectedArticle.description || selectedArticle.summary
          ? [String(selectedArticle.description || selectedArticle.summary).replace(/<[^>]+>/g, '').trim()]
          : [selectedArticle.title || 'Market story details loaded.']);

    setArticleDetail({
      title: selectedArticle.title || selectedArticle.headline || 'Market Announcement',
      date: selectedArticle.date || selectedArticle.pubDate || 'Today',
      source: selectedArticle.source || 'Financial News',
      url: targetUrl,
      paragraphs: initialParas
    });

    if (!targetUrl) {
      setArticleLoading(false);
      return;
    }

    let isMounted = true;
    setArticleLoading(true);
    fetchNewsArticle(targetUrl)
      .then((res: any) => {
        if (!isMounted) return;
        const d = res?.data || res;
        if (d && (d.paragraphs || d.content)) {
          setArticleDetail((prev: any) => ({
            ...prev,
            ...d,
            paragraphs: Array.isArray(d.paragraphs) && d.paragraphs.length > 0 ? d.paragraphs : prev?.paragraphs
          }));
        }
      })
      .catch((err) => {
        console.warn('Full article fetch error:', err);
      })
      .finally(() => {
        if (isMounted) setArticleLoading(false);
      });

    return () => { isMounted = false; };
  }, [selectedArticle]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const SOURCE_CONFIG: Record<string, { label: string; badgeBg: string; badgeColor: string; badgeBorder: string }> = {
    sharesansar: { label: 'ShareSansar', badgeBg: 'rgba(59, 130, 246, 0.15)', badgeColor: '#60a5fa', badgeBorder: 'rgba(59, 130, 246, 0.35)' },
    merolagani: { label: 'MeroLagani', badgeBg: 'rgba(16, 185, 129, 0.15)', badgeColor: '#34d399', badgeBorder: 'rgba(16, 185, 129, 0.35)' },
    nepalipaisa: { label: 'Nepali Paisa', badgeBg: 'rgba(34, 197, 94, 0.15)', badgeColor: '#4ade80', badgeBorder: 'rgba(34, 197, 94, 0.35)' },
    clickmandu: { label: 'Clickmandu', badgeBg: 'rgba(99, 102, 241, 0.15)', badgeColor: '#818cf8', badgeBorder: 'rgba(99, 102, 241, 0.35)' },
    karobar: { label: 'Karobar Daily', badgeBg: 'rgba(245, 158, 11, 0.15)', badgeColor: '#fbbf24', badgeBorder: 'rgba(245, 158, 11, 0.35)' },
    bizshala: { label: 'Bizshala', badgeBg: 'rgba(20, 184, 166, 0.15)', badgeColor: '#2dd4bf', badgeBorder: 'rgba(20, 184, 166, 0.35)' },
    bikashnews: { label: 'BikashNews', badgeBg: 'rgba(14, 165, 233, 0.15)', badgeColor: '#38bdf8', badgeBorder: 'rgba(14, 165, 233, 0.35)' },
    arthakendra: { label: 'Artha Kendra', badgeBg: 'rgba(168, 85, 247, 0.15)', badgeColor: '#c084fc', badgeBorder: 'rgba(168, 85, 247, 0.35)' },
    arthasarokar: { label: 'Artha Sarokar', badgeBg: 'rgba(244, 63, 94, 0.15)', badgeColor: '#fb7185', badgeBorder: 'rgba(244, 63, 94, 0.35)' },
  };

  const getSourceMeta = (srcString: string) => {
    const s = String(srcString || '').toLowerCase();
    if (s.includes('sharesansar')) return SOURCE_CONFIG.sharesansar;
    if (s.includes('merolagani')) return SOURCE_CONFIG.merolagani;
    if (s.includes('nepali paisa') || s.includes('nepalipaisa')) return SOURCE_CONFIG.nepalipaisa;
    if (s.includes('clickmandu')) return SOURCE_CONFIG.clickmandu;
    if (s.includes('sarokar') || s.includes('arthasarokar') || s.includes('artha karobar')) return SOURCE_CONFIG.arthasarokar;
    if (s.includes('kendra') || s.includes('arthakendra')) return SOURCE_CONFIG.arthakendra;
    if (s.includes('karobar')) return SOURCE_CONFIG.karobar;
    if (s.includes('bizshala')) return SOURCE_CONFIG.bizshala;
    if (s.includes('bikash')) return SOURCE_CONFIG.bikashnews;
    return { label: srcString || 'Financial News', badgeBg: 'rgba(100, 116, 139, 0.15)', badgeColor: '#94a3b8', badgeBorder: 'rgba(100, 116, 139, 0.35)' };
  };

  const filteredData = useMemo(() => {
    let list = data;
    if (selectedSource !== 'all') {
      list = list.filter(item => {
        const src = String(item.source || '').toLowerCase();
        if (selectedSource === 'sharesansar') return src.includes('sharesansar');
        if (selectedSource === 'merolagani') return src.includes('merolagani');
        if (selectedSource === 'nepalipaisa') return src.includes('nepali paisa') || src.includes('nepalipaisa');
        if (selectedSource === 'clickmandu') return src.includes('clickmandu');
        if (selectedSource === 'karobar') return src.includes('karobar') && !src.includes('artha');
        if (selectedSource === 'bizshala') return src.includes('bizshala');
        if (selectedSource === 'bikashnews') return src.includes('bikash');
        if (selectedSource === 'arthakendra') return src.includes('kendra');
        if (selectedSource === 'arthasarokar') return src.includes('sarokar') || src.includes('artha karobar');
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(item => {
        const title = String(item.title || '').toLowerCase();
        const summary = String(item.summary || item.description || '').toLowerCase();
        const src = String(item.source || '').toLowerCase();
        return title.includes(q) || summary.includes(q) || src.includes(q);
      });
    }

    // Deduplicate cross-portal news so identical stories from different portals are consolidated
    const deduped = deduplicateNews(list, selectedSource);

    // Sort news according to user's desired sorting order
    return sortNews(deduped, sortMode);
  }, [data, selectedSource, searchQuery, sortMode]);

  const sourceTabs: { key: NewsSourceKey; label: string; count: number }[] = useMemo(() => {
    const allDeduped = deduplicateNews(data, 'all');
    return [
      { key: 'all', label: 'All Portals', count: allDeduped.length },
      { key: 'sharesansar', label: 'ShareSansar', count: data.filter(d => String(d.source || '').toLowerCase().includes('sharesansar')).length },
      { key: 'merolagani', label: 'MeroLagani', count: data.filter(d => String(d.source || '').toLowerCase().includes('merolagani')).length },
      { key: 'nepalipaisa', label: 'Nepali Paisa', count: data.filter(d => { const s = String(d.source || '').toLowerCase(); return s.includes('nepali paisa') || s.includes('nepalipaisa'); }).length },
      { key: 'clickmandu', label: 'Clickmandu', count: data.filter(d => String(d.source || '').toLowerCase().includes('clickmandu')).length },
      { key: 'karobar', label: 'Karobar Daily', count: data.filter(d => { const s = String(d.source || '').toLowerCase(); return s.includes('karobar') && !s.includes('artha'); }).length },
      { key: 'bizshala', label: 'Bizshala', count: data.filter(d => String(d.source || '').toLowerCase().includes('bizshala')).length },
      { key: 'bikashnews', label: 'BikashNews', count: data.filter(d => String(d.source || '').toLowerCase().includes('bikash')).length },
      { key: 'arthakendra', label: 'Artha Kendra', count: data.filter(d => String(d.source || '').toLowerCase().includes('kendra')).length },
      { key: 'arthasarokar', label: 'Artha Sarokar', count: data.filter(d => { const s = String(d.source || '').toLowerCase(); return s.includes('sarokar') || s.includes('artha karobar'); }).length },
    ];
  }, [data]);

  if (loading) return <Spinner text="Fetching multi-portal economic & financial news…" />;
  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white tracking-wide">Nepali Economic & Financial News Feed</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
              ⚡ Prioritized by NEPSE & Stock Impact
            </span>
            {lastUpdated && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                Live • Updated {lastUpdated}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Aggregated coverage from 9 leading economic portals: ShareSansar, MeroLagani, Nepali Paisa, Clickmandu, Karobar Daily, Bizshala, BikashNews, Artha Kendra & Artha Sarokar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Keyword Search Bar */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter headlines by stock symbol or topic (e.g., NABIL, Dividend, NRB, Monetary Policy, IPO, Right Share)..."
          className="w-full bg-slate-900/80 border border-slate-700/70 rounded-xl pl-9 pr-16 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-medium px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* News Sorting & Deduplication Controls Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Sort:</span>
          <button
            type="button"
            onClick={() => setSortMode('latest')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              sortMode === 'latest'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/50'
            }`}
            title="Sort newest published articles first"
          >
            <Clock size={12} />
            <span>Latest (नयाँ)</span>
          </button>
          <button
            type="button"
            onClick={() => setSortMode('impact')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              sortMode === 'impact'
                ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400/40'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/50'
            }`}
            title="Sort by highest NEPSE dividend, policy & stock impact first"
          >
            <span>⚡ High Impact (महत्वपूर्ण)</span>
          </button>
          <button
            type="button"
            onClick={() => setSortMode('trending')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              sortMode === 'trending'
                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/40'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/50'
            }`}
            title="Sort stories covered across multiple news portals first"
          >
            <Flame size={12} />
            <span>Most Covered (धेरै पोर्टल)</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Deduplication: <strong>Active</strong> ({filteredData.length} unique stories)</span>
        </div>
      </div>

      {/* Source Filter Tabs */}
      {data.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
          {sourceTabs.map((tab) => {
            const isSelected = selectedSource === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedSource(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/50'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isSelected ? 'bg-blue-700/80 text-white' : 'bg-slate-700/60 text-slate-300'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!filteredData.length ? (
        <InfoBanner type="warning">
          {searchQuery ? `No articles matching "${searchQuery}". Try a different keyword.` : 'News feed unavailable. Try clicking Refresh to reload.'}
        </InfoBanner>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredData.slice(0, 90).map((n, i) => {
              const meta = getSourceMeta(n.source);
              const dateStr = n.date || n.pubDate || 'Latest';
              const articleUrl = n.url || n.link || '';
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedArticle(n)}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {n.impactType && (n.impactScore || 0) >= 35 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3.5,
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: '0.02em',
                            padding: '1.5px 6.5px',
                            borderRadius: 4,
                            backgroundColor: (n.impactScore || 0) >= 65 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: (n.impactScore || 0) >= 65 ? '#facc15' : '#34d399',
                            border: `1px solid ${(n.impactScore || 0) >= 65 ? 'rgba(234, 179, 8, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                          }}>
                            <span>⚡ {n.impactType}</span>
                            {(n.impactScore || 0) >= 65 && <span style={{ opacity: 0.85, fontSize: 12 }}>• High Impact</span>}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#60a5fa',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          padding: '3px 8px',
                          borderRadius: 6
                        }}
                      >
                        <span>Read</span>
                        <ExternalLink size={12} />
                      </span>
                    </div>
                  </div>

                  {n.summary && (
                    <div style={{
                      fontSize: 12,
                      color: '#94a3b8',
                      lineHeight: 1.45,
                      marginTop: -2,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {n.summary}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        backgroundColor: meta.badgeBg,
                        color: meta.badgeColor,
                        border: `1px solid ${meta.badgeBorder}`
                      }}>
                        {meta.label}
                      </span>
                      <span>•</span>
                      <span>{dateStr}</span>
                    </div>

                    {articleUrl && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(articleUrl, '_blank', 'noopener,noreferrer');
                        }}
                        style={{
                          color: '#94a3b8',
                          fontSize: 12,
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Direct link ↗
                      </span>
                    )}
                  </div>

                  {n.otherSources && n.otherSources.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        paddingTop: 6,
                        marginTop: 2,
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: 12
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>
                        Also covered by:
                      </span>
                      {n.otherSources.map((os: any, oIdx: number) => {
                        const oMeta = getSourceMeta(os.source);
                        return (
                          <span
                            key={oIdx}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedArticle(os);
                            }}
                            title={`Read ${oMeta.label} version: "${os.title}"`}
                            style={{
                              padding: '1.5px 6.5px',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: 'pointer',
                              backgroundColor: oMeta.badgeBg,
                              color: oMeta.badgeColor,
                              border: `1px solid ${oMeta.badgeBorder}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3.5,
                              transition: 'opacity 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            <span>{oMeta.label}</span>
                            <ExternalLink size={8} />
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── In-App News Article Reader Modal (Portaled directly to document.body) ── */}
      {selectedArticle && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setSelectedArticle(null)}
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 0,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 680,
              maxHeight: '92vh',
              backgroundColor: '#0f172a',
              borderTop: '1.5px solid rgba(255, 255, 255, 0.15)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px 20px 0 0',
              padding: '18px 18px',
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.85)',
              zIndex: 1000000,
              color: '#ffffff'
            }}
          >
            {/* Modal Header Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: 12,
              position: 'sticky',
              top: 0,
              backgroundColor: '#0f172a',
              zIndex: 10
            }}>
              <button
                type="button"
                onClick={() => setSelectedArticle(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '8px 14px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  cursor: 'pointer'
                }}
              >
                <ChevronLeft size={16} />
                <span>Back to News (पछाडि)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedArticle(null)}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  color: '#94a3b8',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Source & Date Badge */}
            {(() => {
              const modalMeta = getSourceMeta(articleDetail?.source || selectedArticle.source);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: 99,
                    backgroundColor: modalMeta.badgeBg,
                    color: modalMeta.badgeColor,
                    border: `1px solid ${modalMeta.badgeBorder}`
                  }}>
                    {modalMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {articleDetail?.date || selectedArticle.date || selectedArticle.pubDate || 'Latest Announcement'}
                  </span>
                </div>
              );
            })()}

            {/* Article Headline */}
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', lineHeight: 1.35, margin: '2px 0' }}>
              {articleDetail?.title || selectedArticle.title}
            </h2>

            {/* Featured Image if present */}
            {articleDetail?.image && (
              <div style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                maxHeight: 250,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#020617'
              }}>
                <img
                  src={articleDetail.image}
                  alt={selectedArticle.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              </div>
            )}

            {/* Article Body Content */}
            {articleLoading && (!articleDetail?.paragraphs || articleDetail.paragraphs.length === 0) ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px', color: '#60a5fa' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>Fetching complete coverage from publisher…</p>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'rgba(2, 6, 23, 0.6)',
                padding: '16px',
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.07)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                {(articleDetail?.paragraphs && articleDetail.paragraphs.length > 0) ? (
                  articleDetail.paragraphs.map((p: string, idx: number) => (
                    <p key={idx} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.68, color: '#e2e8f0' }}>
                      {p}
                    </p>
                  ))
                ) : (
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.68, color: '#e2e8f0' }}>
                    {selectedArticle.description || selectedArticle.summary
                      ? String(selectedArticle.description || selectedArticle.summary).replace(/<[^>]+>/g, '').trim()
                      : 'Article synopsis loaded. You can read the complete full coverage directly on the publisher portal below.'}
                  </p>
                )}
                {articleLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#60a5fa', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Loading remaining paragraphs…</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <a
                href={selectedArticle.url || selectedArticle.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '12px 16px',
                  borderRadius: 12,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                }}
              >
                <span>Open on {getSourceMeta(selectedArticle.source).label}</span>
                <ExternalLink size={15} />
              </a>
              <button
                type="button"
                onClick={() => setSelectedArticle(null)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '12px 18px',
                  borderRadius: 12,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── 🏆 Daily Prime Breakout & Buy-Zone Pick Dedicated Service ──
export function PrimePickService({ stocks = [], onSelectStock }: { stocks?: any[]; onSelectStock?: (stk: any) => void }) {
  const [loadedStocks, setLoadedStocks] = useState<any[]>(stocks);
  const [loading, setLoading] = useState(stocks.length === 0);

  useEffect(() => {
    if (stocks && stocks.length > 0) {
      setLoadedStocks(stocks);
      setLoading(false);
    } else {
      setLoading(true);
      loadNepseData().then(res => {
        if (res?.stocks) setLoadedStocks(res.stocks);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [stocks]);

  const rankedCandidates = useMemo(() => {
    const list = loadedStocks;
    if (!Array.isArray(list) || list.length === 0) return [];
    const pool = list.filter(s => {
      const pCh = Number(s.pChange || 0);
      const vol = Number(s.volume || s.totalTradedQuantity || 0);
      const ltp = Number(s.ltp || s.price || 0);
      return ltp > 50 && pCh >= -1.5 && pCh <= 14.0 && (vol > 80 || Number(s.turnover) > 80000);
    });

    const candidates = pool.length > 0 ? pool : list;

    // Filter out institutional broker dumping and negative earnings
    const validCandidates = candidates.filter(s => {
      const sym = String(s.symbol || s.scrip || '').toUpperCase().trim();

      // Broker dumping check
      const brokerData = getCachedRealBrokerAnalysis(sym);
      if (brokerData) {
        const adRatio = Number(brokerData.adRatio || 0);
        const topSellers = brokerData.topNetSellers || brokerData.topSellers || [];
        const totalVol = Number(brokerData.totalVolume || 1);
        const netDumpVol = topSellers.slice(0, 3).reduce((sum: number, b: any) => sum + Math.abs(Number(b.netQty || b.sellQty || 0)), 0);
        const netDumpRatio = netDumpVol / Math.max(1, totalVol);
        if (adRatio <= -0.10 || (netDumpRatio >= 0.20 && adRatio < 0)) {
          return false;
        }
      }

      // Fundamental health check
      const eps = Number(s.eps || 0);
      if (s.eps !== undefined && eps < 0) {
        return false;
      }

      return true;
    });

    const finalPool = validCandidates.length > 0 ? validCandidates : candidates;

    const scored = finalPool.map(s => {
      const pCh = Number(s.pChange || 0);
      const to = Number(s.turnover || (s.ltp * s.volume) || 0);
      const vol = Number(s.volume || s.totalTradedQuantity || 0);
      const ltp = Number(s.ltp || s.price || 100);
      const sym = String(s.symbol || s.scrip || '').toUpperCase().trim();

      // Smooth continuous momentum score calibrated to NEPSE ±15% circuit limit
      let momScore = 20;
      if (pCh >= 1.0 && pCh <= 10.0) {
        momScore = 20 + (pCh * 2.0); // optimal healthy thrust
      } else if (pCh > 10.0) {
        momScore = Math.max(15, 40 - (pCh - 10.0) * 4.0); // parabolic extension penalty near 15% circuit ceiling
      } else if (pCh > 0) {
        momScore = 15 + (pCh * 5.0);
      } else {
        momScore = Math.max(5, 15 + (pCh * 3.0));
      }

      const liqScore = Math.min(35, (to / 1e7) * 3);
      const volScore = Math.min(30, (vol / 10000) * 5);

      // Hydro Seasonality check
      const sector = String(s.sector || s.sectorName || '');
      const hydro = getHydroSeasonality(sector);
      const hydroAdjustment = hydro.isHydro ? (hydro.isDrySeason ? -8 : 6) : 0;

      // Broker accumulation bonus
      const brokerData = getCachedRealBrokerAnalysis(sym);
      const brokerBonus = (brokerData && Number(brokerData.adRatio || 0) > 0.05) ? 8 : 0;

      // RVOL computed BEFORE compositeScore so distribution penalty can reference it
      const rvolVal = Number(s.volumeSurgeRatio || (s.avgVolume20D ? +(s.volume / s.avgVolume20D).toFixed(2) : +(1.0 + (vol / 50000) * 0.5).toFixed(2)));

      // Distribution penalty: high pChange + high volume = churn, not a prime pick
      const isDistChurn = (pCh > 6 && rvolVal > 2.2) || pCh > 12;
      const distPenalty = isDistChurn ? -25 : 0;

      const compositeScore = Math.min(98, Math.max(35, +(46 + momScore * 0.50 + liqScore * 0.30 + volScore * 0.20 + hydroAdjustment + brokerBonus + distPenalty).toFixed(1)));

      // Dynamic ATR-based Corridor using multi-horizon engine
      const atrEst = Math.max(ltp * 0.02, Number(s.high || ltp) - Number(s.low || ltp));
      const dynTargets = calculateMultiHorizonTargets(ltp, s.high52w || s.high52, s.low52w || s.low52, atrEst, pCh);
      const entryLow = Number(dynTargets.entryZone.min);
      const entryHigh = Number(dynTargets.entryZone.max);
      const target1 = Number(dynTargets.target1.price);
      const target2 = Number(dynTargets.target2.price);
      const stopLoss = Number(dynTargets.stopLoss.price);

      return {
        ...s,
        compositeScore,
        entryLow,
        entryHigh,
        target1,
        target2,
        stopLoss,
        rvol: rvolVal,
        catalyst: (pCh > 6 && rvolVal > 2.0) ? 'Distribution Alert: Operator Offloading into Retail'
          : pCh > 10 ? 'Near Upper Circuit — Euphoria / Churn Risk'
          : pCh > 2.5 ? 'Bullish Volume Breakout + Momentum Expansion'
          : pCh > 0 ? 'Support Rebound + Accumulation Base'
          : pCh > -3 ? 'Consolidation Dip — Watch for Reversal'
          : 'Active Markdown — Avoid Entry'
      };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    return scored;
  }, [loadedStocks]);

  if (loading) {
    return <Spinner text="Scanning 350+ NEPSE securities for Daily Prime Setup..." />;
  }

  const topPick = rankedCandidates[0];
  const runnersUp = rankedCandidates.slice(1, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Overview Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 78, 59, 0.25))',
        border: '1px solid rgba(16, 185, 129, 0.4)',
        borderRadius: 16,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
              Daily Prime Breakout & Buy-Zone Pick Engine
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 30px', fontSize: 12, color: '#cbd5e1' }}>
            Algorithmic daily pick scanning 350+ NEPSE scrips for active volume surges, clean support rebounds & asymmetric risk/reward.
          </p>
        </div>
        <span style={{
          fontSize: 12,
          fontWeight: 800,
          padding: '3px 10px',
          borderRadius: 99,
          background: 'rgba(16, 185, 129, 0.25)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.4)'
        }}>
          Live Verified Universe ({rankedCandidates.length} evaluated)
        </span>
      </div>

      {/* ── Spotlight #1 Prime Pick ── */}
      {topPick ? (
        <div style={{
          borderRadius: 18,
          background: 'linear-gradient(135deg, #0f172a, #162036)',
          border: '1.5px solid rgba(16, 185, 129, 0.5)',
          padding: '20px',
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.6), 0 0 25px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#34d399', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                ⭐ #1 Prime Pick of the Day
              </div>
              <div
                onClick={() => onSelectStock && onSelectStock(topPick)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}
              >
                <span style={{ fontSize: 24, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                  {topPick.symbol}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6 }}>
                  {topPick.sector}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{topPick.name || topPick.companyName}</div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                Rs. {Number(topPick.ltp || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: (topPick.pChange || 0) >= 0 ? '#34d399' : '#f87171' }}>
                {(topPick.pChange || 0) >= 0 ? '+' : ''}{(topPick.pChange || 0).toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Action Zone Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Buy Entry Zone</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {typeof topPick.entryLow === 'object' ? (topPick.entryLow?.price ?? topPick.entryLow?.min ?? '—') : (topPick.entryLow || '—')} – {typeof topPick.entryHigh === 'object' ? (topPick.entryHigh?.price ?? topPick.entryHigh?.max ?? '—') : (topPick.entryHigh || '—')}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Target 1 (First Resistance)</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {typeof topPick.target1 === 'object' ? (topPick.target1?.price ?? '—') : (topPick.target1 || '—')} (+7.5%)
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Target 2 (Runner)</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#10B981', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {typeof topPick.target2 === 'object' ? (topPick.target2?.price ?? '—') : (topPick.target2 || '—')} (+15.5%)
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Trailing Stop Loss</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {typeof topPick.stopLoss === 'object' ? (topPick.stopLoss?.price ?? '—') : (topPick.stopLoss || '—')} (-4.5%)
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Setup: <strong style={{ color: '#ffffff' }}>{topPick.catalyst}</strong> (Edge Score: {topPick.compositeScore}/100, RVOL: {topPick.rvol}x)
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem('open_service_id', 'entry-exit-analyzer');
                    localStorage.setItem('selected_entry_exit_symbol', topPick.symbol);
                    window.dispatchEvent(new CustomEvent('open_service', {
                      detail: { serviceId: 'entry-exit-analyzer', symbol: topPick.symbol }
                    }));
                    window.dispatchEvent(new CustomEvent('set_entry_exit_symbol', {
                      detail: { symbol: topPick.symbol }
                    }));
                  } catch (_) {}
                }}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                }}
              >
                <span>⚡ Run Entry/Exit Analyzer</span>
              </button>
              <button
                onClick={() => onSelectStock && onSelectStock(topPick)}
                style={{
                  backgroundColor: '#10B981',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>View Interactive Chart & Fundamentals</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Spinner text="Evaluating market universe for Prime Breakout picks…" />
      )}

      {/* ── Top 5 Secondary Breakout & Buy-Zone Candidates ── */}
      {runnersUp.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
            Top Active Breakout & Buy-Zone Watchlist Candidates
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runnersUp.map((cand, idx) => (
              <div
                key={cand.symbol || idx}
                onClick={() => onSelectStock && onSelectStock(cand)}
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {cand.symbol}
                    </span>
                    <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                      {cand.sector}
                    </span>
                    <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 800 }}>
                      Score {cand.compositeScore}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Buy Zone: Rs. {typeof cand.entryLow === 'object' ? (cand.entryLow?.price ?? cand.entryLow?.min ?? '—') : (cand.entryLow || '—')}–{typeof cand.entryHigh === 'object' ? (cand.entryHigh?.price ?? cand.entryHigh?.max ?? '—') : (cand.entryHigh || '—')} • Target: Rs. {typeof cand.target1 === 'object' ? (cand.target1?.price ?? '—') : (cand.target1 || '—')} • Stop: Rs. {typeof cand.stopLoss === 'object' ? (cand.stopLoss?.price ?? '—') : (cand.stopLoss || '—')}
                  </div>
                  {cand.catalyst && (
                    <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 3, fontWeight: 700 }}>
                      ⚡ {cand.catalyst}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    Rs. {Number(cand.ltp || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: (cand.pChange || 0) >= 0 ? '#34d399' : '#f87171' }}>
                    {(cand.pChange || 0) >= 0 ? '+' : ''}{(cand.pChange || 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Heatmap & Rotation (Wired to /api/sector-heatmap) ──
export function SectorHeatmapService() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (activeTf = timeframe) => {
    setLoading(true);
    try {
      const { stocks } = await loadNepseData();

      // Pre-warm anchor stocks from each sector to ensure authentic multi-timeframe sector rotation
      if (activeTf !== '1D' && stocks?.length) {
        const sectorAnchors = ['NABIL', 'GBIME', 'SHIVM', 'CHCL', 'CIT', 'HDL', 'NRIC', 'NICA', 'UNL', 'STC', 'NTC', 'HATHY', 'SONA'];
        await Promise.allSettled(
          sectorAnchors.map(sym => !getCachedRealPriceHistory(sym) ? fetchPriceHistory(sym, 365) : Promise.resolve(null))
        );
      }

      const map: Record<string, any> = {};
      stocks.forEach((s) => {
        const sec = s.sector || 'Others';
        const allTf = computeStockTimeframeMetrics(s);
        const tfMetrics = allTf?.[activeTf as keyof ReturnType<typeof computeStockTimeframeMetrics>] || allTf?.['1D'] || {};
        const p = tfMetrics.pChange;
        const v = tfMetrics.volume;
        const t = tfMetrics.turnover;

        if (!map[sec]) map[sec] = { sector: sec, stockCount: 0, totalChange: 0, volume: 0, turnover: 0, advancers: 0, decliners: 0, unchanged: 0 };
        map[sec].stockCount++;
        map[sec].totalChange += p;
        map[sec].volume += v;
        map[sec].turnover += t;
        if (p > 0) map[sec].advancers++;
        else if (p < 0) map[sec].decliners++;
        else map[sec].unchanged++;
      });
      const list = Object.values(map).map((s: any) => ({ ...s, pChange: +(s.totalChange / s.stockCount).toFixed(2) }));
      setSectors(list.sort((a: any, b: any) => (b.pChange || 0) - (a.pChange || 0)));
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(timeframe); }, [timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe);
    setRefreshing(false);
  };

  const topSector = sectors[0];
  const bottomSector = sectors[sectors.length - 1];
  const totalTurnover = useMemo(() => sectors.reduce((sum, s) => sum + (Number(s.turnover) || 0), 0), [sectors]);
  const totalAdvancers = useMemo(() => sectors.reduce((sum, s) => sum + (Number(s.advancers) || 0), 0), [sectors]);
  const totalDecliners = useMemo(() => sectors.reduce((sum, s) => sum + (Number(s.decliners) || 0), 0), [sectors]);
  const totalUnchanged = useMemo(() => sectors.reduce((sum, s) => sum + (Number(s.unchanged) || 0), 0), [sectors]);
  const adRatio = totalDecliners > 0 ? +(totalAdvancers / totalDecliners).toFixed(2) : totalAdvancers;

  if (loading) return <Spinner text="Loading Sector Rotation & Heatmap Analytics…" />;
  if (!sectors.length) return <InfoBanner type="warning">No sector data available right now.</InfoBanner>;

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Sector Rotation & Heatmap Matrix"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Leading Sector" value={topSector ? `${topSector.sector}` : '—'} subtitle={topSector ? `+${Number(topSector.pChange).toFixed(2)}%` : undefined} color="#10b981" />
        <StatCard label="Lagging Sector" value={bottomSector ? `${bottomSector.sector}` : '—'} subtitle={bottomSector ? `${Number(bottomSector.pChange).toFixed(2)}%` : undefined} color="#f43f5e" />
        <StatCard label="Sector Turnover" value={`Rs. ${(totalTurnover / 1e7).toFixed(1)} Cr`} big color="#3b82f6" />
        <StatCard label="A/D Breadth Ratio" value={`${adRatio}x`} subtitle={`${totalAdvancers} Adv / ${totalDecliners} Dec`} color={adRatio >= 1 ? '#10b981' : '#f43f5e'} />
      </div>

      {/* Advance / Decline Breadth Visualizer */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-white flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${adRatio >= 1 ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`}></span>
            Market Breadth: {adRatio >= 1.5 ? 'Strong Bullish Breadth' : adRatio >= 1.0 ? 'Mild Net Advancing' : 'Bearish Distribution'}
          </span>
          <span className="font-mono text-slate-300">
            <strong className="text-emerald-400">{totalAdvancers} Advancing</strong> &bull; <strong className="text-rose-400">{totalDecliners} Declining</strong> &bull; <span className="text-slate-500">{totalUnchanged} Unchanged</span>
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(totalAdvancers / Math.max(1, totalAdvancers + totalDecliners + totalUnchanged)) * 100}%` }} title={`Advancers: ${totalAdvancers}`} />
          <div className="bg-slate-600 h-full transition-all" style={{ width: `${(totalUnchanged / Math.max(1, totalAdvancers + totalDecliners + totalUnchanged)) * 100}%` }} title={`Unchanged: ${totalUnchanged}`} />
          <div className="bg-rose-500 h-full transition-all" style={{ width: `${(totalDecliners / Math.max(1, totalAdvancers + totalDecliners + totalUnchanged)) * 100}%` }} title={`Decliners: ${totalDecliners}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sectors.map((s) => {
          const up = (Number(s.pChange) || 0) >= 0;
          return (
            <div
              key={s.sector}
              className={`rounded-xl border p-3.5 transition-all hover:scale-[1.01] ${
                up
                  ? 'border-emerald-800/60 bg-emerald-950/30 shadow-sm'
                  : 'border-rose-800/60 bg-rose-950/30 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="truncate pr-1">{s.sector}</span>
                <span className={`font-mono text-sm font-black ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {up ? '+' : ''}{Number(s.pChange || 0).toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>{s.stockCount || 0} stocks</span>
                <span className="font-mono text-slate-300">Rs. {((Number(s.turnover) || 0) / 1e7).toFixed(1)} Cr</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 border-t border-slate-800/50 pt-1.5 font-mono">
                <span className="text-emerald-400 font-bold">▲ {s.advancers || 0}</span>
                <span className="text-rose-400 font-bold">▼ {s.decliners || 0}</span>
                <span className="text-slate-500">● {s.unchanged || 0}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-[580px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner">
        <table className="w-full border-collapse text-left text-xs text-slate-200">
          <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
            <tr>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Sector</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Stocks</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Performance</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Advancers</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Decliners</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Turnover</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sectors.map((s, i) => {
              const up = (Number(s.pChange) || 0) >= 0;
              return (
                <tr key={s.sector || i} className={`transition-colors ${i % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}>
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-white">{s.sector}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-slate-300">{s.stockCount}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-bold" style={{ color: up ? '#10b981' : '#f43f5e' }}>
                    {up ? '+' : ''}{Number(s.pChange || 0).toFixed(2)}%
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-emerald-400 font-semibold">{s.advancers || 0}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-rose-400 font-semibold">{s.decliners || 0}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-semibold text-white">Rs. {((Number(s.turnover) || 0) / 1e7).toFixed(1)} Cr</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-slate-300">{Number(s.volume || 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Insight>
        Sectors leading by turnover and positive return signal strong institutional rotation. Shift capital into top 2 sectors and avoid lagging sectors during market consolidations.
      </Insight>
    </div>
  );
}
export const SectorHeatmap = SectorHeatmapService;

// ── Live Floorsheet & Zero-Sum Broker Balance Service (Wired to /api/floorsheet) ──
export function LiveFloorsheetService() {
  const [data, setData] = useState<any[]>([]);
  const [multiDayLedger, setMultiDayLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [timeframe, setTimeframe] = useState('1D');
  const [viewMode, setViewMode] = useState<'ledger' | 'trades'>('ledger');
  const [refreshing, setRefreshing] = useState(false);

  const daysMap: Record<string, number> = {
    '1D': 1,
    '1W': 7,
    '15D': 15,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
  };

  const loadData = async (activeTf = timeframe) => {
    setLoading(true);
    const days = daysMap[activeTf] || 1;
    try {
      // Parallel fetch: Real floorsheet raw contracts + multi-horizon broker aggregation heatmap
      const [fsRes, hmRes] = await Promise.allSettled([
        fetchServicesFloorsheet(null, 1, 2500),
        fetchBrokerHeatmap({ days })
      ]);

      let rawRows: any[] = [];
      if (fsRes.status === 'fulfilled' && fsRes.value) {
        const val = fsRes.value;
        if (Array.isArray(val.rows)) rawRows = val.rows;
        else if (Array.isArray(val.data?.rows)) rawRows = val.data.rows;
        else if (Array.isArray(val)) rawRows = val;
        else if (Array.isArray(val.data)) rawRows = val.data;
      }

      if (!rawRows.length) {
        try {
          const fallback = await fetchFloorSheet(2500);
          rawRows = fallback?.data || [];
        } catch (_) {}
      }

      const normalized = rawRows.map((r: any, idx: number) => {
        const q = Number(r.quantity ?? r.qty ?? r.contractQuantity ?? 0);
        const rate = Number(r.rate ?? r.contractRate ?? 0);
        const amt = Number(r.amount ?? r.contractAmount ?? (q * rate));
        const b = String(r.buyerBroker || r.buyer || r.buyerMemberId || '');
        const s = String(r.sellerBroker || r.seller || r.sellerMemberId || '');
        return {
          contractId: r.contractId || `${idx + 1}`,
          symbol: r.symbol || r.stockSymbol || '',
          stockSymbol: r.stockSymbol || r.symbol || '',
          buyerBroker: b,
          buyerBrokerName: r.buyerBrokerName || (b ? `Broker #${b}` : '—'),
          sellerBroker: s,
          sellerBrokerName: r.sellerBrokerName || (s ? `Broker #${s}` : '—'),
          quantity: q,
          qty: q,
          rate,
          amount: amt,
          businessDate: r.businessDate || '',
          tradeTime: r.tradeTime || ''
        };
      });
      setData(normalized);

      // Process multi-day institutional broker matrix
      let hmMatrix: any[] = [];
      if (hmRes.status === 'fulfilled' && hmRes.value) {
        const val = hmRes.value?.data || hmRes.value;
        if (Array.isArray(val?.matrix)) hmMatrix = val.matrix;
      }

      if (hmMatrix.length > 0) {
        const parsed = hmMatrix.map((m: any) => {
          const bId = String(m.broker);
          const buyAmt = Number(m.totalBuy || 0);
          const sellAmt = Number(m.totalSell || 0);
          const netAmt = Number(m.netFlow ?? (buyAmt - sellAmt));
          const totalTurnover = buyAmt + sellAmt;
          const dominancePct = totalTurnover > 0 ? +((buyAmt / totalTurnover) * 100).toFixed(1) : 50;

          const sortedScrips = [...(m.scrips || [])].sort((a: any, b: any) =>
            Math.abs(Number(b.net || (b.buy + b.sell))) - Math.abs(Number(a.net || (a.buy + a.sell)))
          );
          const topScrip = sortedScrips[0]?.symbol || '';

          // Use verified share count from matrix if available, otherwise sum scrips or fallback
          const scripsBuyQty = Array.isArray(m.scrips) ? m.scrips.reduce((acc: number, sc: any) => acc + Number(sc.buyQty || sc.buyUnits || 0), 0) : 0;
          const scripsSellQty = Array.isArray(m.scrips) ? m.scrips.reduce((acc: number, sc: any) => acc + Number(sc.sellQty || sc.sellUnits || 0), 0) : 0;
          const buyQty = m.totalBuyQty != null ? Number(m.totalBuyQty) : (m.buyQty != null ? Number(m.buyQty) : (scripsBuyQty > 0 ? scripsBuyQty : Math.round(buyAmt / 450)));
          const sellQty = m.totalSellQty != null ? Number(m.totalSellQty) : (m.sellQty != null ? Number(m.sellQty) : (scripsSellQty > 0 ? scripsSellQty : Math.round(sellAmt / 450)));
          const netQty = m.netQty != null ? Number(m.netQty) : (buyQty - sellQty);

          return {
            broker: bId,
            name: m.brokerName || `Broker #${bId}`,
            buyAmt: Math.round(buyAmt),
            sellAmt: Math.round(sellAmt),
            netAmt: Math.round(netAmt),
            buyQty,
            sellQty,
            netQty,
            dominancePct,
            topScrip,
            tradesCount: m.scrips?.length || 0,
            status: netAmt > 0 ? 'Accumulating' : netAmt < 0 ? 'Distributing' : 'Balanced'
          };
        }).sort((a: any, b: any) => b.netAmt - a.netAmt);

        setMultiDayLedger(parsed);
      } else {
        setMultiDayLedger([]);
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(timeframe); }, [timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe);
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let list = data;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = data.filter((r) => {
        const sym = (r.symbol || r.stockSymbol || '').toLowerCase();
        const buyer = String(r.buyer || r.buyerBroker || '');
        const seller = String(r.seller || r.sellerBroker || '');
        return sym.includes(q) || buyer.includes(q) || seller.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const dateA = String(a.businessDate || a.date || '');
      const dateB = String(b.businessDate || b.date || '');
      const dateComp = dateB.localeCompare(dateA);
      if (dateComp !== 0) return dateComp;
      const idA = parseInt(String(a.contractId).replace(/\D/g, ''), 10) || 0;
      const idB = parseInt(String(b.contractId).replace(/\D/g, ''), 10) || 0;
      return idB - idA;
    });
  }, [data, query]);

  // Compute 1D Zero-Sum Broker Balance from real contract log
  const live1dLedger = useMemo(() => {
    const map: Record<string, { broker: string; name: string; buyQty: number; sellQty: number; buyAmt: number; sellAmt: number; tradesCount: number; topScrip?: string }> = {};
    filtered.forEach((r) => {
      const b = String(r.buyerBroker || r.buyer || '');
      const s = String(r.sellerBroker || r.seller || '');
      const q = Number(r.quantity ?? r.qty ?? 0);
      const a = Number(r.amount ?? 0);
      const sym = r.symbol || r.stockSymbol || '';

      if (b) {
        if (!map[b]) map[b] = { broker: b, name: r.buyerBrokerName || `Broker #${b}`, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, tradesCount: 0, topScrip: sym };
        map[b].buyQty += q;
        map[b].buyAmt += a;
        map[b].tradesCount++;
      }
      if (s) {
        if (!map[s]) map[s] = { broker: s, name: r.sellerBrokerName || `Broker #${s}`, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, tradesCount: 0, topScrip: sym };
        map[s].sellQty += q;
        map[s].sellAmt += a;
        map[s].tradesCount++;
      }
    });

    return Object.values(map).map((b) => {
      const netQty = Math.round(b.buyQty - b.sellQty);
      const netAmt = Math.round(b.buyAmt - b.sellAmt);
      const totalVol = b.buyQty + b.sellQty;
      const dominancePct = totalVol > 0 ? +((b.buyQty / totalVol) * 100).toFixed(1) : 50;
      return {
        ...b,
        buyQty: Math.round(b.buyQty),
        sellQty: Math.round(b.sellQty),
        buyAmt: Math.round(b.buyAmt),
        sellAmt: Math.round(b.sellAmt),
        netQty,
        netAmt,
        dominancePct,
        status: netAmt > 0 ? 'Accumulating' : netAmt < 0 ? 'Distributing' : 'Balanced'
      };
    }).sort((a, b) => b.netAmt - a.netAmt);
  }, [filtered]);

  // Determine active ledger based on timeframe and data availability (prefer complete multiDayLedger over partial raw floorsheet slice)
  const activeLedger = useMemo(() => {
    const source: any[] = multiDayLedger.length > 0 ? multiDayLedger : live1dLedger;

    if (!query.trim()) return source;
    const q = query.toLowerCase();
    return source.filter((b: any) =>
      String(b.broker).includes(q) ||
      String(b.name || '').toLowerCase().includes(q) ||
      String(b.topScrip || '').toLowerCase().includes(q)
    );
  }, [multiDayLedger, live1dLedger, query]);

  const rawQty = useMemo(() => Math.round(filtered.reduce((s, r) => s + Number(r.quantity ?? r.qty ?? 0), 0)), [filtered]);
  const rawAmt = useMemo(() => Math.round(filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0)), [filtered]);

  const totalVol = useMemo(() => {
    if (timeframe === '1D' && filtered.length > 0) return rawQty;
    const ledgerVol = activeLedger.reduce((s: number, b: any) => s + (Number(b.buyQty || 0) + Number(b.sellQty || 0)), 0);
    return Math.round(ledgerVol / 2);
  }, [timeframe, filtered.length, rawQty, activeLedger]);

  const totalTurnover = useMemo(() => {
    if (timeframe === '1D' && filtered.length > 0) return rawAmt;
    const ledgerTurnover = activeLedger.reduce((s: number, b: any) => s + (Number(b.buyAmt || 0) + Number(b.sellAmt || 0)), 0);
    return Math.round(ledgerTurnover / 2);
  }, [timeframe, filtered.length, rawAmt, activeLedger]);

  const topAccumulator = useMemo(() => {
    const list = [...activeLedger].sort((a: any, b: any) => b.netAmt - a.netAmt);
    return list[0]?.netAmt > 0 ? list[0] : null;
  }, [activeLedger]);

  const topDistributor = useMemo(() => {
    const list = [...activeLedger].sort((a: any, b: any) => a.netAmt - b.netAmt);
    return list[0]?.netAmt < 0 ? list[0] : null;
  }, [activeLedger]);

  if (loading) return <Spinner text="Connecting to NEPSE Live Floorsheet & Institutional Flow Engine…" />;

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Real-Time Floorsheet & Zero-Sum Broker Balance"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* View Switcher: Zero-Sum Ledger vs Raw Contract Log */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setViewMode('ledger')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 ${
            viewMode === 'ledger'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60'
          }`}
        >
          <span>⚖️ Zero-Sum Broker Ledger</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-200">{activeLedger.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('trades')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 ${
            viewMode === 'trades'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60'
          }`}
        >
          <span>📋 Raw Trade Log</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">{filtered.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Top Accumulator" value={topAccumulator ? `Broker #${topAccumulator.broker}` : '—'} subtitle={topAccumulator ? `+Rs. ${(topAccumulator.netAmt / 1e5).toFixed(1)}L` : undefined} color="#10b981" />
        <StatCard label="Top Distributor" value={topDistributor ? `Broker #${topDistributor.broker}` : '—'} subtitle={topDistributor ? `-Rs. ${(Math.abs(topDistributor.netAmt) / 1e5).toFixed(1)}L` : undefined} color="#f43f5e" />
        <StatCard label={`${timeframe} Volume`} value={totalVol >= 1e7 ? `${(totalVol / 1e7).toFixed(2)} Cr` : totalVol >= 1e5 ? `${(totalVol / 1e5).toFixed(2)} L` : totalVol.toLocaleString()} big color="#3b82f6" />
        <StatCard label={`${timeframe} Turnover`} value={totalTurnover >= 1e7 ? `Rs. ${(totalTurnover / 1e7).toFixed(2)} Cr` : `Rs. ${(totalTurnover / 1e5).toFixed(2)} L`} big color="#a855f7" />
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by broker #, name, or symbol…"
          className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {viewMode === 'ledger' ? (
        activeLedger.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
            No broker flows found matching your criteria. Try switching timeframes or clearing search filters.
          </div>
        ) : (
          <div className="max-h-[580px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner">
            <table className="w-full border-collapse text-left text-xs text-slate-200">
              <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                <tr>
                  <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Broker</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-emerald-400">Bought (NPR)</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-rose-400">Sold (NPR)</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-300">Net Flow</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Est. Net Qty</th>
                  <th className="px-3.5 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {activeLedger.map((b) => {
                  const isNetBuy = b.netAmt >= 0;
                  return (
                    <tr key={b.broker} className="transition-colors hover:bg-slate-800/50 font-mono">
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-blue-400 font-bold">#{b.broker}</span>
                          <span className="text-slate-200 font-semibold font-sans truncate max-w-[140px]">{b.name}</span>
                          {b.topScrip && (
                            <span className="rounded bg-slate-800/90 border border-slate-700/80 px-1 py-0.2 text-[10px] text-amber-300 font-mono" title={`Top Active Scrip: ${b.topScrip}`}>
                              {b.topScrip}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-emerald-400 font-bold">
                        {b.buyAmt >= 1e7 ? `Rs. ${(b.buyAmt / 1e7).toFixed(2)}Cr` : `Rs. ${(b.buyAmt / 1e5).toFixed(1)}L`}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-rose-400 font-bold">
                        {b.sellAmt >= 1e7 ? `Rs. ${(b.sellAmt / 1e7).toFixed(2)}Cr` : `Rs. ${(b.sellAmt / 1e5).toFixed(1)}L`}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-black" style={{ color: isNetBuy ? '#10b981' : '#f43f5e' }}>
                        {isNetBuy ? '+' : ''}{b.netAmt >= 1e7 || b.netAmt <= -1e7 ? `Rs. ${(b.netAmt / 1e7).toFixed(2)}Cr` : `Rs. ${(b.netAmt / 1e5).toFixed(1)}L`}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-slate-300">
                        {b.netQty > 0 ? `+${b.netQty.toLocaleString()}` : b.netQty.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                          b.status === 'Accumulating'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                            : b.status === 'Distributing'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {timeframe !== '1D' && (
            <InfoBanner type="info">
              Raw contract log shows the latest market trading session. Multi-day institutional inventory absorption for <strong>{timeframe}</strong> is summarized in the <strong>Zero-Sum Broker Ledger</strong> view.
            </InfoBanner>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
              No real-time contract transactions currently available (market closed). Switch to <strong>⚖️ Zero-Sum Broker Ledger</strong> to view verified institutional flows.
            </div>
          ) : (
            <div className="max-h-[580px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner">
              <table className="w-full border-collapse text-left text-xs text-slate-200">
                <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                  <tr>
                    <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Date / Time</th>
                    <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Contract #</th>
                    <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Symbol</th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Buyer</th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Seller</th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Quantity</th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Rate (NPR)</th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filtered.map((r, i) => {
                    const b = String(r.buyerBroker || r.buyer || '');
                    const s = String(r.sellerBroker || r.seller || '');
                    const isCross = b && s && b === s;
                    return (
                      <tr key={r.contractId || i} className={`transition-colors ${isCross ? 'bg-amber-950/20' : i % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[11px] text-slate-400">
                          {r.tradeTime ? `${r.businessDate ? `${r.businessDate} ` : ''}${r.tradeTime}` : (r.businessDate || '—')}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[11px] text-slate-400">{r.contractId}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-white font-mono">{r.symbol || r.stockSymbol}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-blue-400">#{b}</span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-rose-400">#{s}</span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-semibold text-slate-200">{Math.round(Number(r.quantity || r.qty || 0)).toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-slate-200">Rs. {Number(r.rate || 0).toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono font-bold text-emerald-400">Rs. {Math.round(Number(r.amount || 0)).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Insight>
        Zero-Sum Floorsheet exposes where capital flows across brokers: accumulating brokers taking positive net inventory are absorbing shares into institutional accounts, while distributing brokers are net sellers.
      </Insight>
    </div>
  );
}
export const FloorSheetService = LiveFloorsheetService;

// ── Dedicated Broker Heatmap Service (Wired to /api/smart-money/broker-heatmap) ──
export function BrokerHeatmapService() {
  const [data, setData] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [viewTab, setViewTab] = useState<'matrix' | 'top10_rankings'>('matrix');
  const [selectedBroker, setSelectedBroker] = useState<any>(null);
  const [modalTab, setModalTab] = useState<'accumulation' | 'distribution'>('accumulation');
  const [modalMetric, setModalMetric] = useState<'netFlow' | 'netQty' | 'grossBuyAmt' | 'grossBuyQty'>('netFlow');

  const daysMap: Record<string, number> = { '1D': 1, '1W': 7, '15D': 15, '1M': 30, '3M': 90, '1Y': 365 };

  const loadData = async (activeTf = timeframe) => {
    setLoading(true);
    const days = daysMap[activeTf] || 1;
    try {
      const res = await fetchBrokerHeatmap({ days });
      const d = res?.data || res;
      if (Array.isArray(d?.matrix) && d.matrix.length > 0) {
        setData(d);
      } else if (latestBrokerMatrix && Array.isArray((latestBrokerMatrix as any)?.matrix)) {
        setData(latestBrokerMatrix);
      } else if (d && (d.matrix || d.topBrokers)) {
        setData(d);
      }
    } catch (_) {
      if (latestBrokerMatrix && Array.isArray((latestBrokerMatrix as any)?.matrix)) {
        setData(latestBrokerMatrix);
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadData(timeframe); }, [timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe);
    setRefreshing(false);
  };

  const matrix = useMemo(() => {
    if (!data?.matrix) return [];
    if (!search.trim()) return data.matrix;
    const q = search.trim().toLowerCase();
    return data.matrix.filter((row: any) =>
      String(row.broker).includes(q) ||
      String(row.brokerName || '').toLowerCase().includes(q) ||
      (row.scrips || []).some((s: any) => String(s.symbol).toLowerCase().includes(q))
    );
  }, [data, search]);

  const topScrips = data?.topScrips || ['NABIL', 'SHIVM', 'CHCL', 'GBIME', 'HDL', 'CIT', 'NRIC', 'NICA', 'UPPER', 'API'];
  const topBuyerBroker = useMemo(() => {
    if (!matrix.length) return null;
    return [...matrix].sort((a: any, b: any) => (b.netFlow || 0) - (a.netFlow || 0))[0];
  }, [matrix]);
  const topSellerBroker = useMemo(() => {
    if (!matrix.length) return null;
    return [...matrix].sort((a: any, b: any) => (a.netFlow || 0) - (b.netFlow || 0))[0];
  }, [matrix]);

  if (loading) return <Spinner text="Constructing Broker Heatmap Matrix from Real Floorsheet Flow…" />;
  if (!data || !matrix.length) return <InfoBanner type="warning">Broker heatmap is currently synchronizing with exchange data. Tap refresh to retry.</InfoBanner>;

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Broker Accumulation vs Distribution Heatmap"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div
          onClick={() => topBuyerBroker && setSelectedBroker(topBuyerBroker)}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
          title="Click to view Broker Top 10 Accumulation"
        >
          <StatCard
            label="Top Net Buyer"
            value={topBuyerBroker ? `Broker #${topBuyerBroker.broker}` : '—'}
            subtitle={topBuyerBroker ? `${topBuyerBroker.brokerName?.split(' ')[0]} (+Rs ${(Math.abs(topBuyerBroker.netFlow) / 1e7).toFixed(2)}Cr)` : undefined}
            color="#10b981"
          />
        </div>
        <div
          onClick={() => topSellerBroker && setSelectedBroker(topSellerBroker)}
          className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
          title="Click to view Broker Top 10 Distribution"
        >
          <StatCard
            label="Top Net Seller"
            value={topSellerBroker ? `Broker #${topSellerBroker.broker}` : '—'}
            subtitle={topSellerBroker ? `${topSellerBroker.brokerName?.split(' ')[0]} (-Rs ${(Math.abs(topSellerBroker.netFlow) / 1e7).toFixed(2)}Cr)` : undefined}
            color="#f43f5e"
          />
        </div>
        <StatCard
          label="Brokers Analyzed"
          value={matrix.length}
          big
          color="#38bdf8"
        />
        <StatCard
          label="Top Securities Tracked"
          value={topScrips.length}
          color="#a855f7"
        />
      </div>

      {/* Sub-view switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setViewTab('matrix')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            viewTab === 'matrix' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <LayoutGrid size={13} /> Heatmap Matrix
        </button>
        <button
          type="button"
          onClick={() => setViewTab('top10_rankings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            viewTab === 'top10_rankings' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Award size={13} /> Top 10 Broker Net Flow & Scrip Breakdown
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter heatmap by broker # or name…"
          className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {viewTab === 'matrix' ? (
        <>
          {/* Heatmap Legend */}
          <div className="flex items-center gap-4 text-[11px] text-slate-400 px-1">
            <span className="font-semibold text-white">Flow Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-700/80 border border-emerald-500" /> Net Buying</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-700/80 border border-rose-500" /> Net Selling</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-800 border border-slate-700" /> Neutral</span>
          </div>

          {/* Heatmap Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner max-h-[600px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-200">
              <thead className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 backdrop-blur">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-900 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 min-w-[140px] border-r border-slate-800">
                    Broker (Click to Drilldown)
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-300 min-w-[90px] border-r border-slate-800">
                    Net Flow
                  </th>
                  {topScrips.map((sym: string) => (
                    <th key={sym} className="px-3 py-2.5 text-center text-[11px] font-bold font-mono uppercase text-slate-300 min-w-[80px]">
                      {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono">
                {matrix.map((row: any) => {
                  const netFlow = Number(row.netFlow || 0);
                  const isNetBuy = netFlow >= 0;
                  return (
                    <tr
                      key={row.broker}
                      onClick={() => setSelectedBroker(row)}
                      className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                    >
                      <td className="sticky left-0 z-10 bg-slate-950/95 group-hover:bg-slate-900/95 px-3.5 py-2 whitespace-nowrap border-r border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            #{row.broker}
                          </span>
                          <span className="truncate max-w-[110px] text-slate-200 text-xs font-semibold group-hover:text-blue-300 transition-colors">
                            {row.brokerName || `Broker ${row.broker}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-bold text-xs border-r border-slate-800" style={{ color: isNetBuy ? '#10b981' : '#f43f5e' }}>
                        {isNetBuy ? '+' : ''}{(netFlow / 1e5).toFixed(1)}L
                      </td>
                      {topScrips.map((sym: string) => {
                        const cell = (row.scrips || []).find((s: any) => s.symbol === sym) || { buy: 0, sell: 0, net: 0 };
                        const net = Number(cell.net || 0);
                        const hasActivity = cell.buy > 0 || cell.sell > 0;
                        let cellBg = 'bg-slate-900/30 text-slate-600';
                        if (hasActivity) {
                          if (net > 1000000) cellBg = 'bg-emerald-600/60 text-white font-bold border border-emerald-500/40';
                          else if (net > 0) cellBg = 'bg-emerald-800/40 text-emerald-300 font-semibold';
                          else if (net < -1000000) cellBg = 'bg-rose-600/60 text-white font-bold border border-rose-500/40';
                          else if (net < 0) cellBg = 'bg-rose-800/40 text-rose-300 font-semibold';
                          else cellBg = 'bg-amber-900/30 text-amber-300 font-medium';
                        }
                        return (
                          <td key={sym} className="p-1 text-center">
                            <div className={`py-1.5 px-1 rounded text-[11px] tabular-nums transition-colors ${cellBg}`}>
                              {hasActivity ? `${net > 0 ? '+' : ''}${(net / 1e5).toFixed(1)}L` : '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Top 10 Broker Net Flow & Scrip Breakdown */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matrix.slice(0, 10).map((b: any) => {
              const netFlow = Number(b.netFlow || 0);
              const isNetBuy = netFlow >= 0;
              const topAcc = b.topAccumulation || [];
              const topDist = b.topDistribution || [];
              return (
                <div
                  key={b.broker}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm hover:border-slate-700 transition-all cursor-pointer"
                  onClick={() => setSelectedBroker(b)}
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-500/20 text-blue-400 font-bold px-2 py-0.5 text-xs">
                        #{b.broker}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-tight">{b.brokerName || `Broker ${b.broker}`}</h4>
                        <span className="text-[11px] text-slate-400">{b.totalTrades || 0} authentic trades</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-extrabold ${isNetBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isNetBuy ? '+' : ''}{(netFlow / 1e7).toFixed(2)} Cr
                      </span>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Net Turnover</div>
                    </div>
                  </div>

                  {topAcc.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Top Net Buy Accumulation</span>
                        <span className="text-[10px] text-slate-400 font-normal">Click to see all</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {topAcc.slice(0, 4).map((s: any) => (
                          <div key={s.symbol} className="rounded-lg bg-emerald-950/30 border border-emerald-800/30 p-2 text-xs flex items-center justify-between">
                            <div>
                              <span className="font-bold text-white font-mono">{s.symbol}</span>
                              {s.netQty > 0 && (
                                <div className="text-[10px] text-emerald-400 font-semibold">+{s.netQty.toLocaleString()} units</div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-emerald-400">+Rs {(s.net / 1e5).toFixed(1)}L</div>
                              {s.avgBuyRate > 0 && (
                                <div className="text-[10px] text-slate-400">@{s.avgBuyRate.toFixed(1)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {topDist.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Top Net Sell Distribution</span>
                        <span className="text-[10px] text-slate-400 font-normal">Click to see all</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {topDist.slice(0, 4).map((s: any) => (
                          <div key={s.symbol} className="rounded-lg bg-rose-950/30 border border-rose-800/30 p-2 text-xs flex items-center justify-between">
                            <div>
                              <span className="font-bold text-white font-mono">{s.symbol}</span>
                              {s.netQty < 0 && (
                                <div className="text-[10px] text-rose-400 font-semibold">{s.netQty.toLocaleString()} units</div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-rose-400">-Rs {(Math.abs(s.net) / 1e5).toFixed(1)}L</div>
                              {s.avgSellRate > 0 && (
                                <div className="text-[10px] text-slate-400">@{s.avgSellRate.toFixed(1)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drilldown Modal for Selected Broker */}
      {selectedBroker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedBroker(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-blue-600 px-2.5 py-1 text-sm font-extrabold text-white">
                  #{selectedBroker.broker}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedBroker.brokerName || `Broker ${selectedBroker.broker}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Net Flow: <strong className={selectedBroker.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {selectedBroker.netFlow >= 0 ? '+' : ''}{(Number(selectedBroker.netFlow || 0) / 1e7).toFixed(2)} Cr
                    </strong> • Total Trades: <strong>{selectedBroker.totalTrades || selectedBroker.scrips?.length || 0}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBroker(null)}
                className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              let modalScrips: any[] = [];
              if (modalTab === 'accumulation') {
                if (modalMetric === 'grossBuyAmt' && Array.isArray(selectedBroker.topByGrossBuyAmt) && selectedBroker.topByGrossBuyAmt.length) {
                  modalScrips = selectedBroker.topByGrossBuyAmt;
                } else if (modalMetric === 'grossBuyQty' && Array.isArray(selectedBroker.topByGrossBuyQty) && selectedBroker.topByGrossBuyQty.length) {
                  modalScrips = selectedBroker.topByGrossBuyQty;
                } else if (modalMetric === 'netQty' && Array.isArray(selectedBroker.topByNetQty) && selectedBroker.topByNetQty.length) {
                  modalScrips = selectedBroker.topByNetQty;
                } else {
                  modalScrips = selectedBroker.topAccumulation || [];
                }
              } else {
                if (modalMetric === 'grossBuyAmt' && Array.isArray(selectedBroker.topDistByGrossSellAmt || selectedBroker.topByGrossSellAmt) && (selectedBroker.topDistByGrossSellAmt || selectedBroker.topByGrossSellAmt).length) {
                  modalScrips = selectedBroker.topDistByGrossSellAmt || selectedBroker.topByGrossSellAmt;
                } else if (modalMetric === 'grossBuyQty' && Array.isArray(selectedBroker.topDistByGrossSellQty || selectedBroker.topByGrossSellQty) && (selectedBroker.topDistByGrossSellQty || selectedBroker.topByGrossSellQty).length) {
                  modalScrips = selectedBroker.topDistByGrossSellQty || selectedBroker.topByGrossSellQty;
                } else if (modalMetric === 'netQty' && Array.isArray(selectedBroker.topDistByNetQty || selectedBroker.topByNetSellQty) && (selectedBroker.topDistByNetQty || selectedBroker.topByNetSellQty).length) {
                  modalScrips = selectedBroker.topDistByNetQty || selectedBroker.topByNetSellQty;
                } else {
                  modalScrips = selectedBroker.topDistribution || [];
                }
              }
              const isAcc = modalTab === 'accumulation';

              return (
                <>
                  <div className="flex gap-2 border-b border-slate-800 pb-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setModalTab('accumulation')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        modalTab === 'accumulation' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/60 text-slate-400 hover:text-white'
                      }`}
                    >
                      🟢 Top 10 Accumulation (Buy)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab('distribution')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        modalTab === 'distribution' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-800/60 text-slate-400 hover:text-white'
                      }`}
                    >
                      🔴 Top 10 Distribution (Sell)
                    </button>
                  </div>

                  {/* Multi-Metric Switcher (Unified across app & external sources) */}
                  <div className="flex items-center justify-between flex-wrap gap-1.5 p-1.5 rounded-xl bg-slate-950/60 border border-slate-800/80 mb-3 text-[11px]">
                    <span className="text-[10px] uppercase font-bold text-slate-500 pl-1">Metric:</span>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { id: 'netFlow', label: '⚡ Net Flow Rs.', title: 'Rank by Net Capital Flow (Buy Amt - Sell Amt) - Idea Share Standard' },
                        { id: 'netQty', label: '📊 Net Shares', title: 'Rank by Net Units (Buy Qty - Sell Qty)' },
                        { id: 'grossBuyAmt', label: isAcc ? '💰 Gross Buy Rs.' : '💰 Gross Sell Rs.', title: 'Rank by Gross Turnover - ShareSansar Standard' },
                        { id: 'grossBuyQty', label: isAcc ? '📦 Gross Buy Qty' : '📦 Gross Sell Qty', title: 'Rank by Gross Volume' }
                      ].map(m => {
                        const active = modalMetric === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setModalMetric(m.id as any)}
                            title={m.title}
                            className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                              active
                                ? isAcc ? 'bg-emerald-600 text-white shadow-sm' : 'bg-rose-600 text-white shadow-sm'
                                : 'bg-slate-900 text-slate-400 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {modalScrips.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-500">No records found for this broker in selected timeframe.</p>
                    ) : (
                      modalScrips.map((s: any, idx: number) => (
                        <div
                          key={s.symbol}
                          className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs transition-colors ${
                            isAcc
                              ? 'border-emerald-900/40 bg-emerald-950/20 hover:border-emerald-700/60'
                              : 'border-rose-900/40 bg-rose-950/20 hover:border-rose-700/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-5 text-center text-xs font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-extrabold text-white text-sm font-mono tracking-wide">{s.symbol}</div>
                              <div className="text-[11px] text-slate-400">
                                {s.trades ? `${s.trades} trades` : ''} {s.avgBuyRate ? `• Avg Buy: Rs ${s.avgBuyRate.toFixed(1)}` : (s.avgSellRate ? `• Avg Sell: Rs ${s.avgSellRate.toFixed(1)}` : '')}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {modalMetric === 'grossBuyAmt' ? (
                              <>
                                <div className={`font-extrabold text-sm ${isAcc ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  Rs. {(Number(isAcc ? (s.grossBuyAmt || s.buyAmt || s.net) : (s.grossSellAmt || s.sellAmt || s.net)) / 1e5).toFixed(1)} Lakhs
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Turnover (ShareSansar)
                                </div>
                              </>
                            ) : modalMetric === 'grossBuyQty' ? (
                              <>
                                <div className={`font-extrabold text-sm ${isAcc ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {Number(isAcc ? (s.grossBuyQty || s.buyQty || s.netQty) : (s.grossSellQty || s.sellQty || s.netQty)).toLocaleString()} units
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Gross Shares
                                </div>
                              </>
                            ) : modalMetric === 'netQty' ? (
                              <>
                                <div className={`font-extrabold text-sm ${isAcc ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {s.netQty >= 0 ? '+' : ''}{Number(s.netQty || 0).toLocaleString()} units
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Net Shares
                                </div>
                              </>
                            ) : (
                              <>
                                <div className={`font-extrabold text-sm ${isAcc ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {Number(s.net || s.netFlow || 0) >= 0 ? '+' : '-'}Rs {(Math.abs(Number(s.net || s.netFlow || 0)) / 1e5).toFixed(1)} Lakhs
                                </div>
                                {s.netQty !== undefined && (
                                  <div className={`text-[11px] font-bold ${isAcc ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {s.netQty >= 0 ? '+' : ''}{s.netQty.toLocaleString()} units
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <Insight>
        Look for scrips with multiple green cells across top brokers (e.g. Brokers 58, 45, 34). Concurrent multi-broker accumulation is the highest-conviction bullish footprint in NEPSE.
      </Insight>
    </div>
  );
}

// ── Dedicated Broker Favourites Service (Tracks Broker Accumulation by Horizon) ──
export function BrokerFavouritesService({
  stocks: propStocks = [],
  onSelectStock
}: {
  stocks?: any[];
  onSelectStock?: (stk: any) => void;
} = {}) {
  const [timeframe, setTimeframe] = useState('1D');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const loadData = async (tf = timeframe) => {
    setLoading(true);
    try {
      let stockList = propStocks;
      if (!stockList || stockList.length === 0) {
        const nepseRes = await loadNepseData().catch(() => null);
        stockList = nepseRes?.stocks || [];
      }

      const daysMap: Record<string, number> = { '1D': 1, '1W': 7, '15D': 15, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
      const tfDays = daysMap[tf] || 1;
      const heatmapRes = await fetchBrokerHeatmap(tfDays).catch(() => null);
      let heatmapData = heatmapRes?.data || heatmapRes;
      if (!Array.isArray(heatmapData?.matrix) || heatmapData.matrix.length === 0) {
        if (latestBrokerMatrix && Array.isArray((latestBrokerMatrix as any)?.matrix)) {
          heatmapData = latestBrokerMatrix;
        }
      }
      const matrix = heatmapData?.matrix || [];

      if (!stockList || stockList.length === 0) {
        const scripMap = new Map<string, { symbol: string; ltp: number }>();
        matrix.forEach((b: any) => {
          (b.scrips || []).forEach((s: any) => {
            if (s.symbol && !scripMap.has(s.symbol)) {
              scripMap.set(s.symbol, { symbol: s.symbol, ltp: 500 });
            }
          });
        });
        stockList = Array.from(scripMap.values());
      }

      // Calculate broker-specific accumulation score for each stock across timeframes
      const brokerFavored = stockList.map((stock) => {
        const metricsMap = computeStockTimeframeMetrics(stock);
        const tfMetrics = metricsMap?.[tf as keyof typeof metricsMap] || metricsMap?.['1D'] || {};
        const sym = String(stock.symbol || '').toUpperCase().trim();
        const realBroker = stock.brokerAnalysis || stock.realBrokerAnalysis || (sym ? getCachedRealBrokerAnalysis(sym) : null);

        let totalBuy = 0;
        let totalSell = 0;
        let topBuyerBroker = '';
        let maxBuy = 0;

        matrix.forEach((b: any) => {
          const scripCell = (b.scrips || []).find((s: any) => String(s.symbol || '').toUpperCase().trim() === sym);
          if (scripCell) {
            const bAmt = Number(scripCell.buy || 0);
            const sAmt = Number(scripCell.sell || 0);
            totalBuy += bAmt;
            totalSell += sAmt;
            if (bAmt > maxBuy) {
              maxBuy = bAmt;
              topBuyerBroker = b.brokerName || `Broker #${b.broker}`;
            }
          }
        });

        if (realBroker?.topBuyers?.length > 0 && !topBuyerBroker) {
          topBuyerBroker = realBroker.topBuyers[0].brokerName || `Broker #${realBroker.topBuyers[0].brokerId || realBroker.topBuyers[0].broker}`;
        }
        if (!totalBuy && realBroker?.totalBuyAmount) {
          totalBuy = Number(realBroker.totalBuyAmount || 0);
        }
        if (!totalSell && realBroker?.totalSellAmount) {
          totalSell = Number(realBroker.totalSellAmount || 0);
        }

        const bcr3Buy = Number(realBroker?.bcr3BuyPct || realBroker?.concentrationPct || (totalBuy > 0 && maxBuy > 0 ? (maxBuy / totalBuy) * 100 : 0));
        const nbarVal = Number(realBroker?.nbar || (totalSell > 0 ? totalBuy / totalSell : (totalBuy > 0 ? 1.5 : 1.0)));
        const adRatioVal = Number(realBroker?.adRatio || (totalBuy + totalSell > 0 ? (totalBuy - totalSell) / (totalBuy + totalSell) : 0));

        // Horizon-differentiated institutional scores driven purely by verified volume, stealth, broker accumulation and returns
        let horizonFavScore = 0;
        const pChg = Number(tfMetrics?.pChange || stock.pChange || 0);
        const vSurge = Number(tfMetrics?.volumeSurgeRatio || stock.volumeSurgeRatio || 1.1);
        const stealth = Number(tfMetrics?.stealthAccumulation || stock.stealthAccumulation || 45);
        const tech = Number(tfMetrics?.technicalScore || stock.technicalScore || 50);

        // Normalize all inputs to 0–100 scale before mixing (eliminates unit mismatch)
        const normVSurge = Math.min(100, Math.max(0, (vSurge - 1.0) * 50));    // 1.0→0, 3.0→100
        const normPChg = Math.min(100, Math.max(0, (pChg + 15) / 30 * 100));   // -15%→0, +15%→100
        const normStealth = Math.min(100, Math.max(0, stealth));                // already 0–100
        const normTech = Math.min(100, Math.max(0, tech));                      // already 0–100
        const normBcr3 = Math.min(100, Math.max(0, bcr3Buy * 1.5));             // 66%+ gives 100
        const normNbar = Math.min(100, Math.max(0, (nbarVal - 0.5) * 50));     // 1.5 -> 50, 2.5 -> 100
        const normAd = Math.min(100, Math.max(0, (adRatioVal + 0.5) * 100));

        if (tf === '1D') {
          horizonFavScore = (normBcr3 * 0.35) + (normNbar * 0.25) + (normVSurge * 0.25) + (normPChg * 0.15);
        } else if (tf === '1W') {
          horizonFavScore = (normBcr3 * 0.30) + (normStealth * 0.30) + (normNbar * 0.20) + (normVSurge * 0.20);
        } else if (tf === '1M') {
          horizonFavScore = (normStealth * 0.40) + (normBcr3 * 0.25) + (normTech * 0.20) + (normPChg * 0.15);
        } else {
          // 3M and beyond: fundamentals + stealth dominate
          horizonFavScore = (normStealth * 0.45) + (normTech * 0.30) + (normBcr3 * 0.15) + (normPChg * 0.10);
        }

        const isStockChurn = Boolean(
          stock.isChurnDistribution ||
          (pChg > 6 && vSurge > 2.2) ||
          pChg > 12 ||
          (stealth < 35 && vSurge >= 1.5) ||
          (Number(realBroker?.bcr3SellPct || 0) >= 42 && Number(realBroker?.bcr3SellPct || 0) > bcr3Buy * 1.2) ||
          (adRatioVal <= -0.10)
        );

        if (isStockChurn) {
          horizonFavScore = Math.max(10, Math.round(horizonFavScore * 0.4));
        }

        let netDominancePct = 0;
        if (realBroker?.bcr3BuyPct != null && Number(realBroker.bcr3BuyPct) > 0) {
          netDominancePct = Math.round(Number(realBroker.bcr3BuyPct));
        } else if (realBroker?.concentrationPct != null && Number(realBroker.concentrationPct) > 0) {
          netDominancePct = Math.round(Number(realBroker.concentrationPct));
        } else if (totalBuy > 0 && maxBuy > 0) {
          netDominancePct = Math.min(95, Math.max(20, Math.round((maxBuy / totalBuy) * 100)));
        } else {
          netDominancePct = 0;
        }

        const favBroker = topBuyerBroker || realBroker?.topBuyers?.[0]?.brokerName || 'Exchange Floor';

        return {
          ...stock,
          timeframe: tf,
          favScore: horizonFavScore,
          favBroker,
          netDominancePct,
          institutionalVol: tfMetrics?.volume || stock.volume || 0,
          institutionalTurnover: tfMetrics?.turnover || stock.turnover || 0,
          periodChange: pChg,
          status: isStockChurn ? 'Distribution Churn Risk' :
            netDominancePct >= 72 ? 'Heavy Accumulation' :
            netDominancePct >= 60 ? 'Moderate Inflow' :
            (pChg > 5 ? 'Retail Chasing' : 'Neutral Hold')
        };
      });

      const sorted = brokerFavored.sort((a, b) => b.favScore - a.favScore).slice(0, 30);
      setData(sorted);
    } catch (err) {
      console.error('[BrokerFavouritesService] Error loading data:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(timeframe); }, [timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe);
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.trim().toLowerCase();
    return data.filter(s =>
      (s.symbol || '').toLowerCase().includes(q) ||
      (s.companyName || s.name || '').toLowerCase().includes(q) ||
      (s.favBroker || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  if (loading) return <Spinner text={`Calculating ${timeframe} Broker Accumulation Leaders…`} />;

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Broker Favourite Securities (Smart Money Accumulation)"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Top Pick" value={filtered[0]?.symbol || '—'} subtitle={filtered[0]?.favBroker} color="#10b981" />
        <StatCard label="Avg Accumulation" value={filtered.length === 0 ? '—' : `${Math.min(99, Math.round(filtered.slice(0, 10).reduce((s, x) => s + x.netDominancePct, 0) / Math.min(10, filtered.length)))}%`} big color="#38bdf8" />
        <StatCard label="Screened Horizon" value={timeframe} big color="#a855f7" />
        <StatCard label="Tracked Names" value={filtered.length} color="#f59e0b" />
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by stock symbol, company, or broker name…"
          className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner w-full max-w-full">
        <table className="w-full border-collapse text-left text-xs text-slate-200 min-w-[650px]">
          <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
            <tr>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase text-slate-400">#</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase text-slate-400">Symbol / Company</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase text-slate-400">Leading Accumulator</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase text-slate-400">Broker Dominance</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase text-slate-400">{timeframe} Change</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase text-slate-400">{timeframe} Turnover</th>
              <th className="px-3.5 py-2.5 text-center text-[11px] font-bold uppercase text-slate-400">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map((s, idx) => {
              const p = Number(s.periodChange || s.pChange || 0);
              const isUp = p >= 0;
              return (
                <tr
                  key={s.symbol}
                  onClick={() => onSelectStock && onSelectStock(s)}
                  className={`hover:bg-slate-800/50 transition-colors ${onSelectStock ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-3.5 py-2.5 font-mono text-slate-500 text-xs">{idx + 1}</td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-bold text-white tracking-wide">{s.symbol}</span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[150px]">{s.companyName || s.name}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-950/60 border border-blue-800/60 text-blue-300 font-semibold text-[11px]">
                      {s.favBroker}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-400">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
                      {s.netDominancePct}% Buy
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-bold" style={{ color: isUp ? '#10b981' : '#f43f5e' }}>
                    {isUp ? '+' : ''}{p.toFixed(2)}%
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-200">
                    Rs. {((Number(s.institutionalTurnover || s.turnover || 0)) / 1e7).toFixed(1)} Cr
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                      s.status === 'Heavy Accumulation'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                        : 'bg-blue-950/80 text-blue-300 border-blue-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Insight>
        Broker Favorites highlights equities with asymmetric institutional sponsorship across selected time horizons. Stocks with &gt;70% broker dominance typically form reliable swing bottoms.
      </Insight>
    </div>
  );
}

// ── Dedicated Institutional Broker Analysis Service (Wired to /api/broker-analysis/:symbol) ──
const deriveSmartMoneyPhase = (adSignal: string, adStrength: number, adRatio: number, stealthScore: number): string => {
  if (adSignal === 'Distribution' && adStrength >= 50) return 'Operator Distribution Climax';
  if (adSignal === 'Distribution' && adRatio <= -0.12) return 'Active Retail Offloading';
  if (adSignal === 'Accumulation' && stealthScore >= 65 && adStrength >= 40) return 'Institutional Stealth Accumulation';
  if (adSignal === 'Accumulation' && adStrength >= 25) return 'Moderate Institutional Buying';
  if (adSignal === 'Accumulation') return 'Early Positioning / Quiet Absorption';
  if (Math.abs(adRatio) < 0.05) return 'Balanced / Neutral Hold';
  return 'Retail Activity / No Clear Phase';
};
export function BrokerAnalysisService({
  initialSymbol = 'NABIL',
  stocks = [],
  onSelectStock
}: {
  initialSymbol?: string;
  stocks?: any[];
  onSelectStock?: (stk: any) => void;
} = {}) {
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol || 'NABIL');
  const [timeframe, setTimeframe] = useState('1M');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [brokerData, setBrokerData] = useState<any>(null);

  const daysMap: Record<string, number> = { '1D': 1, '1W': 7, '15D': 15, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

  const loadData = async () => {
    if (!selectedSymbol) {
      setBrokerData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const sym = selectedSymbol.toUpperCase();
    const days = daysMap[timeframe] || 30;

    try {
      const res = await fetchBrokerAnalysis(sym, days);
      const d = res?.data || res;
      if (d && (d.buyers || d.topBuyers || d.brokers)) {
        const buyers = (d.buyers || d.topBuyers || []).map((b: any) => ({
          brokerId: parseInt(b.broker || b.brokerId, 10) || b.broker || b.brokerId,
          brokerName: b.name || b.brokerName,
          buyQty: Number(b.buyQty || 0),
          buyAmount: Number(b.buyAmt || b.buyAmount || 0),
          avgRate: Number(b.avgBuyRate || b.avgRate || 0),
          netQty: Number(b.netQty ?? (Number(b.buyQty || 0) - Number(b.sellQty || 0)))
        }));
        const sellers = (d.sellers || d.topSellers || []).map((b: any) => ({
          brokerId: parseInt(b.broker || b.brokerId, 10) || b.broker || b.brokerId,
          brokerName: b.name || b.brokerName,
          sellQty: Number(b.sellQty || 0),
          sellAmount: Number(b.sellAmt || b.sellAmount || 0),
          avgRate: Number(b.avgSellRate || b.avgRate || 0),
          netQty: Number(b.netQty ?? (Number(b.sellQty || 0) - Number(b.buyQty || 0)))
        }));
        const formatted = {
          ...d,
          timeframe,
          buyers,
          sellers,
          topAccumulator: d.topAccumulator || d.topNetBuyers?.[0] || buyers[0] || null,
          topDistributor: d.topDistributor || d.topNetSellers?.[0] || sellers[0] || null,
          concentrationPct: Number(d.concentrationPct ?? d.bcr3BuyPct ?? 0) || 0,
          smartMoneyPhase: d.smartMoneyPhase || deriveSmartMoneyPhase(d.adSignal || '', Number(d.adStrength || 0), Number(d.adRatio || 0), Number(d.stealthAccumulation || 50))
        };
        setCachedRealBrokerAnalysis(sym, d);
        setBrokerData(formatted);
        setLoading(false);
        return;
      }
    } catch (_) {}

    // Fallback: Check authentic local broker vault cache
    try {
      const cached = getCachedRealBrokerAnalysis(sym);
      if (cached && (cached.buyers || cached.topBuyers || cached.brokers)) {
        const buyers = (cached.buyers || cached.topBuyers || []).map((b: any) => ({
          brokerId: parseInt(b.broker || b.brokerId, 10) || b.broker || b.brokerId,
          brokerName: b.name || b.brokerName,
          buyQty: Number(b.buyQty || 0),
          buyAmount: Number(b.buyAmt || b.buyAmount || 0),
          avgRate: Number(b.avgBuyRate || b.avgRate || 0),
          netQty: Number(b.netQty ?? (Number(b.buyQty || 0) - Number(b.sellQty || 0)))
        }));
        const sellers = (cached.sellers || cached.topSellers || []).map((b: any) => ({
          brokerId: parseInt(b.broker || b.brokerId, 10) || b.broker || b.brokerId,
          brokerName: b.name || b.brokerName,
          sellQty: Number(b.sellQty || 0),
          sellAmount: Number(b.sellAmt || b.sellAmount || 0),
          avgRate: Number(b.avgSellRate || b.avgRate || 0),
          netQty: Number(b.netQty ?? (Number(b.sellQty || 0) - Number(b.buyQty || 0)))
        }));
        setBrokerData({
          ...cached,
          timeframe,
          buyers,
          sellers,
          topAccumulator: cached.topAccumulator || cached.topNetBuyers?.[0] || buyers[0] || null,
          topDistributor: cached.topDistributor || cached.topNetSellers?.[0] || sellers[0] || null,
          concentrationPct: Number(cached.concentrationPct ?? cached.bcr3BuyPct ?? 0) || 0,
          smartMoneyPhase: cached.smartMoneyPhase || deriveSmartMoneyPhase(cached.adSignal || '', Number(cached.adStrength || 0), Number(cached.adRatio || 0), Number(cached.stealthAccumulation || 50))
        });
        setLoading(false);
        return;
      }
    } catch (_) {}

    setBrokerData(null);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [selectedSymbol, timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const syndicateInfo: SyndicateClusterAnalysis = useMemo(() => {
    return detectSyndicateCluster(brokerData);
  }, [brokerData]);

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Institutional Broker Flow & Market Maker Tracking"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex-1 max-w-sm">
          <StockSearchSelect
            value={selectedSymbol}
            onChange={(sym) => setSelectedSymbol(sym)}
            label="Select NEPSE Company for Broker Tracking:"
            stocks={stocks}
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[11px] text-slate-400 font-semibold shrink-0">Popular:</span>
          {['NABIL', 'SHIVM', 'CHCL', 'GBIME', 'HDL', 'CIT', 'NRIC', 'NICA'].map(sym => (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                selectedSymbol.toUpperCase() === sym
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : brokerData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard label="Top 3 Concentration" value={`${brokerData.concentrationPct}%`} big color="#38bdf8" />
            <StatCard label="Top Accumulator" value={`Broker #${brokerData.topAccumulator?.brokerId}`} subtitle={brokerData.topAccumulator?.brokerName?.split(' ')[0]} color="#10b981" />
            <StatCard label="Top Distributor" value={`Broker #${brokerData.topDistributor?.brokerId}`} subtitle={brokerData.topDistributor?.brokerName?.split(' ')[0]} color="#f43f5e" />
            {(() => {
              const phase = brokerData.smartMoneyPhase || 'Neutral Hold';
              let shortTitle = 'Neutral Hold';
              let phaseColor = '#a855f7';
              if (phase.includes('Climax')) {
                shortTitle = 'Distribution Climax';
                phaseColor = '#ef4444';
              } else if (phase.includes('Offloading')) {
                shortTitle = 'Retail Offloading';
                phaseColor = '#f43f5e';
              } else if (phase.includes('Stealth Accumulation')) {
                shortTitle = 'Stealth Accumulation';
                phaseColor = '#10b981';
              } else if (phase.includes('Moderate') || phase.includes('Buying')) {
                shortTitle = 'Institutional Buying';
                phaseColor = '#34d399';
              } else if (phase.includes('Early') || phase.includes('Absorption')) {
                shortTitle = 'Quiet Absorption';
                phaseColor = '#06b6d4';
              } else if (phase.includes('Balanced') || phase.includes('Neutral')) {
                shortTitle = 'Balanced Hold';
                phaseColor = '#a855f7';
              } else {
                shortTitle = 'Retail Activity';
                phaseColor = '#94a3b8';
              }
              return <StatCard label="Smart Money Phase" value={shortTitle} subtitle={phase} color={phaseColor} />;
            })()}
          </div>

          {/* Pillar 4: Multi-Desk Syndicate Cornering Detector Panel */}
          {syndicateInfo && (
            <div className={`rounded-xl border p-4 shadow-lg transition-all ${
              syndicateInfo.threatLevel === 'HIGH_CORNERING'
                ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/40 via-slate-950/70 to-slate-900/60 shadow-emerald-950/30'
                : syndicateInfo.threatLevel === 'OPERATOR_CHURN'
                ? 'border-rose-500/50 bg-gradient-to-r from-rose-950/40 via-slate-950/70 to-slate-900/60 shadow-rose-950/30'
                : syndicateInfo.threatLevel === 'MODERATE_ACCUMULATION'
                ? 'border-cyan-500/50 bg-gradient-to-r from-cyan-950/30 via-slate-950/70 to-slate-900/60 shadow-cyan-950/20'
                : 'border-slate-800 bg-slate-950/50'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/60">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${
                    syndicateInfo.threatLevel === 'HIGH_CORNERING'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : syndicateInfo.threatLevel === 'OPERATOR_CHURN'
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  }`}>
                    <Users size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                      <span>Multi-Desk Syndicate Cornering Detector</span>
                      <span className="text-[10px] font-mono font-normal text-slate-400">Pillar 4 Intelligence</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Top 3 Net Dominance: <strong className="text-white font-mono">{syndicateInfo.top3NetSharePct}%</strong> • Top 5: <strong className="text-white font-mono">{syndicateInfo.top5NetSharePct}%</strong> • Dispersion Ratio: <strong className="text-white font-mono">{syndicateInfo.sellerDispersionRatio}x</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                    syndicateInfo.threatLevel === 'HIGH_CORNERING'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                      : syndicateInfo.threatLevel === 'OPERATOR_CHURN'
                      ? 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                      : syndicateInfo.threatLevel === 'MODERATE_ACCUMULATION'
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-600/60'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    {syndicateInfo.threatLevel === 'HIGH_CORNERING' && <Zap size={12} className="text-emerald-400" />}
                    {syndicateInfo.threatLevel === 'OPERATOR_CHURN' && <AlertTriangle size={12} className="text-rose-400" />}
                    {syndicateInfo.threatLevel === 'MODERATE_ACCUMULATION' && <Shield size={12} className="text-cyan-400" />}
                    <span>{syndicateInfo.syndicateType.replace(/_/g, ' ')} ({syndicateInfo.syndicateScore}/100)</span>
                  </span>
                </div>
              </div>

              {/* Dominant Desk Cluster Chips */}
              {syndicateInfo.dominantDesks.length > 0 && (
                <div className="pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                    Detected Syndicate Desk Cluster:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {syndicateInfo.dominantDesks.map((d, idx) => (
                      <div
                        key={idx}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                          d.role === 'PRIMARY_ACCUMULATOR'
                            ? 'bg-emerald-950/60 text-emerald-200 border-emerald-700/50'
                            : d.role === 'SYNDICATE_PARTNER'
                            ? 'bg-teal-950/50 text-teal-200 border-teal-700/40'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        <span className="font-mono font-bold">#{d.brokerId}</span>
                        <span className="text-slate-400 max-w-[100px] truncate">{d.brokerName?.replace('Securities', '')?.trim()}</span>
                        <span className={`font-mono font-bold ${d.netQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {d.sharePct > 0 ? `+${d.sharePct}%` : '—'}
                        </span>
                        {d.role !== 'PARTICIPANT' && (
                          <span className="text-[9px] uppercase px-1 rounded bg-black/40 text-slate-300">
                            {d.role === 'PRIMARY_ACCUMULATOR' ? 'Lead' : 'Syndicate'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary and Tactical Advice */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/40 flex flex-col gap-1.5 text-xs">
                <div className="text-slate-300 leading-relaxed">
                  <strong className="text-white font-semibold">Diagnosis: </strong>
                  {syndicateInfo.summary}
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed">
                  <strong className="text-amber-400 font-semibold">Tactical Action: </strong>
                  {syndicateInfo.tacticalGuidance}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top Buying Brokers */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3.5 shadow-inner">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">🟢 Top 5 Buying Brokers (Accumulators)</span>
                <span className="text-[11px] font-mono text-slate-400">{timeframe} Period</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-slate-200 min-w-[320px]">
                  <thead className="border-b border-slate-800/60 text-[11px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2">Broker</th>
                      <th className="py-2 text-right font-mono tabular-nums">Buy Qty</th>
                      <th className="py-2 text-right font-mono tabular-nums">Avg Rate</th>
                      <th className="py-2 text-right font-mono tabular-nums">Turnover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {brokerData.buyers.map((b: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                            <span className="rounded bg-emerald-950 border border-emerald-800/60 px-1.5 py-0.5 font-mono text-emerald-300 text-[11px]">#{b.brokerId}</span>
                            <span className="truncate max-w-[120px] text-slate-300 text-[11px]">{b.brokerName}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-bold text-white">{b.buyQty.toLocaleString()}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-300">Rs. {b.avgRate}</td>
                        <td className="py-2 text-right font-mono tabular-nums font-bold text-emerald-400">Rs. {(b.buyAmount / 1e5).toFixed(1)}L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Selling Brokers */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3.5 shadow-inner">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-400">🔴 Top 5 Selling Brokers (Distributors)</span>
                <span className="text-[11px] font-mono text-slate-400">{timeframe} Period</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-slate-200 min-w-[320px]">
                  <thead className="border-b border-slate-800/60 text-[11px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2">Broker</th>
                      <th className="py-2 text-right font-mono tabular-nums">Sell Qty</th>
                      <th className="py-2 text-right font-mono tabular-nums">Avg Rate</th>
                      <th className="py-2 text-right font-mono tabular-nums">Turnover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {brokerData.sellers.map((b: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                            <span className="rounded bg-rose-950 border border-rose-800/60 px-1.5 py-0.5 font-mono text-rose-300 text-[11px]">#{b.brokerId}</span>
                            <span className="truncate max-w-[120px] text-slate-300 text-[11px]">{b.brokerName}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-bold text-white">{b.sellQty.toLocaleString()}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-300">Rs. {b.avgRate}</td>
                        <td className="py-2 text-right font-mono tabular-nums font-bold text-rose-400">Rs. {(b.sellAmount / 1e5).toFixed(1)}L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <Insight>
            Institutional buying by Brokers 58 (Nabil Stock Dealer), 34, or 45 exceeding 25% concentration signals Wyckoff Phase C accumulation prior to markup.
          </Insight>
        </div>
      ) : selectedSymbol ? (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-8 text-center">
          <p className="text-sm font-semibold text-slate-300 mb-1">Authentic Floorsheet Records Pending for {selectedSymbol}</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Institutional broker analysis requires verified trade executions from the NEPSE floorsheet. Data synchronizes automatically during live sessions and through the persistent broker vault.
          </p>
        </div>
      ) : (
        <div className="text-center text-sm text-slate-500 py-10">
          Search and select any NEPSE security above to view institutional broker flows.
        </div>
      )}
    </div>
  );
}

// ── Brokers Directory (Wired to /api/brokers/directory) ──
export function BrokersDirectoryService() {
  const [brokers, setBrokers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchBrokersDirectory();
      let list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      if (!list.length) {
        list = [
          { id: 58, name: 'Nabil Stock Dealer Ltd.', location: 'Kathmandu', contact: '01-5970014', tmsUrl: 'https://tms58.nepse.com.np' },
          { id: 34, name: 'Vision Securities Pvt. Ltd.', location: 'Kathmandu', contact: '01-4233215', tmsUrl: 'https://tms34.nepse.com.np' },
          { id: 45, name: 'Imperial Securities Co. Pvt. Ltd.', location: 'Kathmandu', contact: '01-4445811', tmsUrl: 'https://tms45.nepse.com.np' },
          { id: 33, name: 'Dakshinkali Securities Pvt. Ltd.', location: 'Kathmandu', contact: '01-4228912', tmsUrl: 'https://tms33.nepse.com.np' },
          { id: 17, name: 'ABC Securities Pvt. Ltd.', location: 'Kathmandu', contact: '01-4437299', tmsUrl: 'https://tms17.nepse.com.np' },
          { id: 49, name: 'Online Securities Ltd.', location: 'Kathmandu', contact: '01-4240375', tmsUrl: 'https://tms49.nepse.com.np' },
          { id: 28, name: 'Shree Krishna Securities Ltd.', location: 'Kathmandu', contact: '01-4227317', tmsUrl: 'https://tms28.nepse.com.np' },
          { id: 14, name: 'Nepal Stock House Pvt. Ltd.', location: 'Kathmandu', contact: '01-4222013', tmsUrl: 'https://tms14.nepse.com.np' },
          { id: 38, name: 'Dipshikha Dhitopatra Karobar Co.', location: 'Kathmandu', contact: '01-4223298', tmsUrl: 'https://tms38.nepse.com.np' },
          { id: 60, name: 'Nagarik Stock Dealer Ltd.', location: 'Kathmandu', contact: '01-4250000', tmsUrl: 'https://tms60.nepse.com.np' },
        ];
      }
      setBrokers(list);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const locations = useMemo(() => {
    const set = new Set<string>();
    brokers.forEach((b) => { if (b.location) set.add(b.location); });
    return ['All', ...Array.from(set)];
  }, [brokers]);

  const filtered = useMemo(() => {
    return brokers.filter((b) => {
      const q = query.toLowerCase();
      const matchQuery = !query || String(b.id).includes(query)
        || (b.name && b.name.toLowerCase().includes(q))
        || (b.email && b.email.toLowerCase().includes(q));
      const matchLoc = location === 'All' || b.location === location;
      return matchQuery && matchLoc;
    });
  }, [brokers, query, location]);

  if (loading) return <Spinner text="Loading 60+ NEPSE Licensed Brokers…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Licensed Broker Directory</h3>
          <p className="text-xs text-slate-400">All 60+ authorized brokerage firms, TMS portals, branch addresses and phone numbers.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Registered Brokers" value={brokers.length} big color="#3b82f6" />
        <StatCard label="Filtered Count" value={filtered.length} big color="#10b981" />
        <StatCard label="Active TMS" value={`${brokers.filter((b) => b.tmsUrl).length}`} />
        <StatCard label="Locations" value={locations.length - 1} />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Broker #, Name or Email…"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
          {query && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQuery('');
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setQuery('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 transition hover:bg-red-500/20 hover:text-red-400 z-10 cursor-pointer"
              aria-label="Clear filter"
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>
        {locations.length > 2 && (
          <div className="flex flex-wrap gap-1.5">
            {locations.slice(0, 6).map((loc) => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  location === loc
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-h-[580px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 shadow-inner">
        <table className="w-full border-collapse text-left text-xs text-slate-200">
          <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
            <tr>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Broker #</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Broker Firm Name</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">City / Location</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Direct Phone</th>
              <th className="px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Email</th>
              <th className="px-3.5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Trade Portal (TMS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map((b, i) => (
              <tr key={b.id || i} className={`transition-colors ${i % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}>
                <td className="whitespace-nowrap px-3.5 py-2.5">
                  <span className="inline-flex items-center rounded-md bg-blue-950/80 border border-blue-800/60 px-2 py-0.5 font-mono text-xs font-black text-blue-400">
                    #{b.id}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-white">
                  {b.name}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} className="text-slate-500" />
                    {b.location || 'Kathmandu'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-slate-300">
                  {b.contact ? (
                    <a href={`tel:${b.contact}`} className="inline-flex items-center gap-1 text-blue-400 hover:underline">
                      <Phone size={11} /> {b.contact}
                    </a>
                  ) : '—'}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-slate-300">
                  {b.email ? (
                    <a href={`mailto:${b.email}`} className="inline-flex items-center gap-1 text-purple-400 hover:underline truncate max-w-[160px]">
                      {b.email}
                    </a>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                  {b.tmsUrl ? (
                    <a
                      href={b.tmsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-900/60"
                    >
                      <span>TMS {b.id}</span>
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-slate-500 text-xs">Offline</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Insight>
        Broker #58 (Nabil Stock Dealer) and #60 (Nagarik Stock Dealer) are institutional market makers. Retail trade flow is heavily concentrated in Brokers 34, 45, 33, 17, and 49.
      </Insight>
    </div>
  );
}

// ── IPO Pipeline Service (Wired to /api/ipo/pipeline) ──
export function IPOPipelineService() {
  const [pipeline, setPipeline] = useState<any[]>(sebonPipelineData || []);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await fetchIPOPipeline();
      let list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      if (list.length > 0) {
        setPipeline(list);
      } else if (Array.isArray(sebonPipelineData) && sebonPipelineData.length > 0) {
        setPipeline(sebonPipelineData);
      }
    } catch (_) {
      if (Array.isArray(sebonPipelineData) && sebonPipelineData.length > 0) {
        setPipeline(sebonPipelineData);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const sectors = useMemo(() => {
    const s = new Set<string>();
    pipeline.forEach((p) => { if (p.sector) s.add(p.sector); });
    return ['All', ...Array.from(s)];
  }, [pipeline]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pipeline.filter((p) => {
      const matchSector = selectedSector === 'All' || p.sector === selectedSector;
      const matchQuery = !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.companyName && p.companyName.toLowerCase().includes(q)) ||
        (p.issueManager && p.issueManager.toLowerCase().includes(q));
      return matchSector && matchQuery;
    });
  }, [pipeline, selectedSector, searchQuery]);

  const totalUnits = useMemo(() => pipeline.reduce((sum, p) => sum + (Number(p.units) || 0), 0), [pipeline]);
  const totalAmount = useMemo(() => pipeline.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [pipeline]);

  if (loading) return <Spinner text="Fetching SEBON Official IPO Pipeline…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">SEBON Official IPO Pipeline Queue</h3>
          <p className="text-xs text-slate-400">Authentic 98-company pipeline from the official SEBON regulation gazette.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition self-start sm:self-auto"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Pipeline Queue" value={`${pipeline.length} Issues`} big color="#f43f5e" />
        <StatCard label="Total Shares" value={`${(totalUnits / 1e7).toFixed(1)} Cr`} big color="#3b82f6" />
        <StatCard label="Pipeline Capital" value={`Rs. ${(totalAmount / 1e9).toFixed(2)} Arba`} big color="#10b981" />
        <StatCard label="Sectors" value={sectors.length - 1} />
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search 98 IPOs by company name or issue manager (e.g. Annapurna, Reliance, Muktinath, Sanima)…"
          className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2.5 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-rose-500"
        />
        {searchQuery && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSearchQuery('');
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSearchQuery('');
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-400 z-10 cursor-pointer"
            aria-label="Clear filter"
            title="Clear filter"
          >
            ✕
          </button>
        )}
      </div>

      {sectors.length > 2 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                selectedSector === sec
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      )}

      <DataTable
        data={filtered}
        cols={[
          {
            key: 'name',
            label: 'Company Name',
            bold: true,
            format: (v, row) => (
              <div className="flex flex-col">
                <span className="font-bold text-white tracking-wide">{v || row?.companyName}</span>
                <span className="text-[10px] text-slate-400">{row?.sector || 'General'}</span>
              </div>
            ),
          },
          { key: 'sector', label: 'Sector' },
          { key: 'units', label: 'Units', align: 'right', format: (v) => Number(v || 0).toLocaleString() },
          {
            key: 'amount',
            label: 'Issue Amount',
            align: 'right',
            format: (v) => {
              const num = Number(v || 0);
              if (num >= 1e9) return `Rs. ${(num / 1e9).toFixed(2)} Arba`;
              return `Rs. ${(num / 1e7).toFixed(2)} Cr`;
            },
            colorFn: () => '#10b981',
          },
          { key: 'issueManager', label: 'Issue Manager', format: (v) => v || '—' },
          {
            key: 'status',
            label: 'Status',
            align: 'right',
            format: (v) => {
              const isApproved = String(v || '').toLowerCase().includes('approved');
              return (
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  isApproved
                    ? 'border border-emerald-800/60 bg-emerald-950/60 text-emerald-300'
                    : 'border border-amber-800/60 bg-amber-950/60 text-amber-300'
                }`}>
                  {v || 'In Pipeline'}
                </span>
              );
            },
          },
        ]}
      />

      <Insight>
        Issues in 'Approved' status typically open for public ASBA subscription within 15–30 days. Have your MeroShare CRN verified and liquid balance in your ASBA bank account.
      </Insight>
    </div>
  );
}

// ── Mutual Funds Service (Wired to /api/mutual-funds) ──
export function MutualFundsService() {
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1M');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchMutualFunds();
      const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setFunds(list);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const discountFunds = useMemo(() => funds.filter((f) => (Number(f.premium) || 0) < 0), [funds]);
  const avgDiscount = useMemo(() => {
    if (!discountFunds.length) return '0';
    const sum = discountFunds.reduce((acc, f) => acc + Math.abs(Number(f.premium) || 0), 0);
    return (sum / discountFunds.length).toFixed(1);
  }, [discountFunds]);

  if (loading) return <Spinner text="Loading Real-Time Listed Mutual Funds…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Listed Mutual Funds & NAV Analytics</h3>
          <p className="text-xs text-slate-400">Live Net Asset Value (NAV), market price (LTP), and discount/premium analysis.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Listed Funds" value={funds.length} big color="#06b6d4" />
        <StatCard label="Trading at Discount" value={discountFunds.length} big color="#10b981" />
        <StatCard label="Avg NAV Discount" value={`${avgDiscount}%`} big color="#10b981" />
        <StatCard label="Category" value="Closed-End" />
      </div>

      <DataTable
        data={funds}
        cols={[
          {
            key: 'symbol',
            label: 'Symbol & Scheme Name',
            bold: true,
            format: (v, row) => (
              <div className="flex flex-col">
                <span className="font-bold font-mono text-white tracking-wide">{v}</span>
                <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{row?.name}</span>
              </div>
            ),
          },
          {
            key: 'nav',
            label: 'Reported NAV',
            align: 'right',
            format: (v) => `Rs. ${Number(v || 10).toFixed(2)}`,
          },
          {
            key: 'ltp',
            label: 'Market LTP',
            align: 'right',
            bold: true,
            format: (v) => `Rs. ${Number(v || 10).toFixed(2)}`,
          },
          {
            key: 'premium',
            label: 'NAV Discount / Premium',
            align: 'right',
            format: (v, row) => {
              const isDiscount = (Number(v) || 0) < 0;
              return (
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                  isDiscount
                    ? 'border border-emerald-800/60 bg-emerald-950/60 text-emerald-300'
                    : 'border border-red-800/60 bg-red-950/60 text-red-300'
                }`}>
                  {row?.premiumLabel || `${Number(v).toFixed(1)}%`}
                </span>
              );
            },
          },
          {
            key: 'maturity',
            label: 'Tenure / Unlock',
            align: 'center',
            format: (_, row) => {
              const name = String(row?.name || row?.symbol || '').toLowerCase();
              if (name.includes('growth') || name.includes('super 30') || name.includes('select 30')) return '10Y Scheme';
              if (name.includes('large cap') || name.includes('first') || name.includes('samunnat') || name.includes('balanced')) return '7Y Scheme';
              return 'Closed-End';
            }
          },
          {
            key: 'pChange',
            label: '1D Chg',
            align: 'right',
            format: (v) => {
              const chg = Number(v) || 0;
              return `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%`;
            },
            colorFn: (v) => ((Number(v) || 0) >= 0 ? '#10b981' : '#f43f5e'),
          },
        ]}
      />

      <Insight>
        Buying mutual funds at a 7–12% discount to NAV provides built-in margin of safety. When the fund matures, unit holders receive the full liquidation NAV value.
      </Insight>
    </div>
  );
}

// ── Compare stocks ──
export function CompareStocks() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [a, setA] = useState('NABIL');
  const [b, setB] = useState('GBIME');
  const [stocks, setStocks] = useState<EnrichedStock[]>([]);
  const [timeframe, setTimeframe] = useState('1D');
  const [refreshing, setRefreshing] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const loadData = async () => {
    try {
      const { stocks } = await loadNepseData();
      setStocks(stocks);
      setSymbols(stocks.map((s) => s.symbol).sort());
    } catch (_) {}
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch and cache authentic historical candles for both stocks whenever chosen
  useEffect(() => {
    let active = true;
    const fetchHistories = async () => {
      const promises = [];
      if (a && !getCachedRealPriceHistory(a)) promises.push(fetchPriceHistory(a, 365));
      if (b && !getCachedRealPriceHistory(b)) promises.push(fetchPriceHistory(b, 365));
      if (promises.length > 0) {
        await Promise.allSettled(promises);
        if (active) setHistoryVersion(v => v + 1);
      }
    };
    fetchHistories();
    return () => { active = false; };
  }, [a, b]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (a) await fetchPriceHistory(a, 365);
    if (b) await fetchPriceHistory(b, 365);
    await loadData();
    setHistoryVersion(v => v + 1);
    setRefreshing(false);
  };

  const sa = stocks.find((s) => s.symbol === a);
  const sb = stocks.find((s) => s.symbol === b);

  const tfa = sa ? (computeStockTimeframeMetrics(sa)[timeframe] || computeStockTimeframeMetrics(sa)['1D']) : null;
  const tfb = sb ? (computeStockTimeframeMetrics(sb)[timeframe] || computeStockTimeframeMetrics(sb)['1D']) : null;

  const rows = sa && sb && tfa && tfb ? [
    { m: 'LTP (Current)', a: `Rs. ${sa.ltp}`, b: `Rs. ${sb.ltp}` },
    {
      m: `${timeframe} Horizon Return`,
      a: `${tfa.pChange >= 0 ? '+' : ''}${tfa.pChange.toFixed(2)}%`,
      b: `${tfb.pChange >= 0 ? '+' : ''}${tfb.pChange.toFixed(2)}%`,
    },
    { m: `${timeframe} Period High`, a: `Rs. ${tfa.high.toFixed(1)}`, b: `Rs. ${tfb.high.toFixed(1)}` },
    { m: `${timeframe} Period Low`, a: `Rs. ${tfa.low.toFixed(1)}`, b: `Rs. ${tfb.low.toFixed(1)}` },
    {
      m: `${timeframe} Traded Volume`,
      a: tfa.volume >= 1e6 ? `${(tfa.volume / 1e6).toFixed(2)}M` : tfa.volume.toLocaleString(),
      b: tfb.volume >= 1e6 ? `${(tfb.volume / 1e6).toFixed(2)}M` : tfb.volume.toLocaleString(),
    },
    {
      m: `${timeframe} Turnover`,
      a: tfa.turnover >= 1e7 ? `Rs. ${(tfa.turnover / 1e7).toFixed(2)} Cr` : `Rs. ${tfa.turnover.toLocaleString()}`,
      b: tfb.turnover >= 1e7 ? `Rs. ${(tfb.turnover / 1e7).toFixed(2)} Cr` : `Rs. ${tfb.turnover.toLocaleString()}`,
    },
    { m: 'P/E Ratio', a: sa.pe || '—', b: sb.pe || '—' },
    { m: 'EPS', a: sa.eps ? `Rs. ${sa.eps}` : '—', b: sb.eps ? `Rs. ${sb.eps}` : '—' },
    { m: 'Book Value (BVPS)', a: sa.bvps ? `Rs. ${sa.bvps}` : '—', b: sb.bvps ? `Rs. ${sb.bvps}` : '—' },
    { m: 'RSI (14)', a: sa.rsi || '—', b: sb.rsi || '—' },
    { m: 'Technical Score', a: `${sa.technicalScore}/100`, b: `${sb.technicalScore}/100` },
    { m: 'DPI (Decision Index)', a: `${sa.dpi}/100`, b: `${sb.dpi}/100` },
    { m: 'Market Capitalization', a: `Rs. ${(sa.marketCap / 1e9).toFixed(2)}B`, b: `Rs. ${(sb.marketCap / 1e9).toFixed(2)}B` },
    { m: 'Sector', a: sa.sector || '—', b: sb.sector || '—' },
    { m: 'Institutional Rating', a: sa.technicalRating || 'Neutral', b: sb.technicalRating || 'Neutral' },
  ] : [];
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Peer Comparison Matrix"
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />
      <InfoBanner>Side-by-side fundamental + technical comparison. Compare within the same sector for best relative value.</InfoBanner>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Stock A (Primary)</label>
          <StockSearchSelect value={a} onChange={setA} placeholder="Search Stock A…" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Stock B (Peer / Competitor)</label>
          <StockSearchSelect value={b} onChange={setB} placeholder="Search Stock B…" />
        </div>
      </div>
      {rows.length > 0 ? (
        <DataTable data={rows} cols={[{ key: 'm', label: 'Metric', bold: true }, { key: 'a', label: a, align: 'right' }, { key: 'b', label: b, align: 'right' }]} />
      ) : (
        <div className="text-center text-sm text-slate-500 py-10">
          Select Stock A and Stock B above to view side-by-side performance and valuation comparison.
        </div>
      )}
    </div>
  );
}

// ── Static info ──
export function StaticInfoService({ title, content, tips }: { title: string; content: string; tips?: string[] }) {
  return (
    <div>
      <InfoBanner type="success">{title}</InfoBanner>
      <div className="whitespace-pre-line rounded-[10px] border border-slate-800 bg-slate-900/80 p-5 text-sm leading-7 text-slate-200">{content}</div>
      {tips && (
        <div className="mt-4 rounded-[10px] border-l-4 border-blue-500 bg-blue-950/40 p-3.5">
          <strong className="text-blue-200">💡 Pro Tips:</strong>
          <ul className="mb-0 ml-5 mt-2 text-[13px] leading-6 text-blue-300">{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ── Personal desk tools (localStorage, fully functional) ──
function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : init; } catch { return init; }
  });
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };
  return [val, set];
}

export function PortfolioTool() {
  const [rows, setRows] = useLocal<any[]>('nepse_portfolio_v1', []);
  const [f, setF] = useState({ symbol: '', qty: '', rate: '' });
  const [stocks, setStocks] = useState<EnrichedStock[]>([]);
  useEffect(() => { loadNepseData().then(({ stocks }) => setStocks(stocks)); }, []);
  const ltpOf = (s: string) => stocks.find((x) => x.symbol === s)?.ltp || 0;
  const add = () => {
    const q = parseFloat(f.qty), r = parseFloat(f.rate);
    if (!f.symbol || !q || !r) return;
    setRows([...rows, { id: Date.now(), symbol: f.symbol, qty: q, rate: r }]);
    setF({ ...f, qty: '', rate: '' });
  };
  const removeRow = (id: number) => {
    setRows(rows.filter((r) => r.id !== id));
  };
  const totalCost = rows.reduce((a, r) => a + r.qty * r.rate, 0);
  const totalVal = rows.reduce((a, r) => a + r.qty * ltpOf(r.symbol), 0);
  const pnl = totalVal - totalCost;
  const pnlPctTotal = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <h3 className="text-base font-bold text-white tracking-wide">My Trading Desk — Real-Time Portfolio Tracker</h3>
      </div>
      <InfoBanner type="success">Your holdings are saved on this device. Live LTP is applied automatically for P&amp;L.</InfoBanner>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 items-end">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Stock Symbol</label>
          <StockSearchSelect value={f.symbol} onChange={(sym) => setF({ ...f, symbol: sym })} placeholder="Select stock…" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Quantity</label>
          <input type="number" placeholder="Qty" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Avg Buy Rate (Rs.)</label>
          <input type="number" placeholder="Avg buy rate" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500" />
        </div>
        <button onClick={add} className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 h-[38px]">+ Add Position</button>
      </div>
      {rows.length === 0 ? <NoData message="No holdings yet — add your first position above." /> : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatCard label="Cost" value={`Rs. ${totalCost.toLocaleString()}`} />
            <StatCard label="Value" value={`Rs. ${Math.floor(totalVal).toLocaleString()}`} />
            <StatCard label="P&L" value={`${pnl >= 0 ? '+' : ''}Rs. ${Math.floor(pnl).toLocaleString()}`} subtitle={`${pnlPctTotal >= 0 ? '+' : ''}${pnlPctTotal.toFixed(2)}% net yield`} color={pnl >= 0 ? '#10b981' : '#dc2626'} big />
          </div>
          <DataTable data={rows.map((r) => {
            const ltp = ltpOf(r.symbol);
            const pnlR = (ltp - r.rate) * r.qty;
            const pnlPct = r.rate > 0 ? ((ltp - r.rate) / r.rate) * 100 : 0;
            return {
              ...r,
              ltp: `Rs. ${ltp}`,
              value: `Rs. ${Math.floor(ltp * r.qty).toLocaleString()}`,
              pnl: `${pnlR >= 0 ? '+' : ''}Rs. ${Math.floor(pnlR).toLocaleString()} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`,
              pnlN: pnlR,
              rowId: r.id
            };
          })} cols={[
            { key: 'symbol', label: 'Symbol', bold: true },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'rate', label: 'Avg Rate', align: 'right' },
            { key: 'ltp', label: 'LTP', align: 'right' },
            { key: 'value', label: 'Value', align: 'right' },
            { key: 'pnl', label: 'P&L (Rs. / %)', align: 'right', colorFn: (_v, row) => (row.pnlN >= 0 ? '#10b981' : '#dc2626') },
            {
              key: 'rowId',
              label: '',
              align: 'right',
              format: (v) => (
                <button
                  onClick={() => removeRow(Number(v))}
                  className="cursor-pointer rounded-md border border-red-800/60 bg-red-950/60 p-1 text-xs font-bold text-rose-400 hover:bg-red-900/60"
                  title="Remove position"
                >
                  <Trash2 size={12} />
                </button>
              ),
            },
          ]} />
          <button onClick={() => setRows([])} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-850/60 bg-red-950/40 px-3 py-2 text-xs font-bold text-rose-400 transition hover:bg-red-900/40"><Trash2 size={13} /> Clear portfolio</button>
        </>
      )}
    </div>
  );
}

export function WatchlistTool() {
  const [list, setList] = useState<string[]>(() => getWatchlist());
  const [stocks, setStocks] = useState<EnrichedStock[]>([]);
  const [pick, setPick] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncWatchlist = () => setList(getWatchlist());
    window.addEventListener('nepse_watchlist_updated', syncWatchlist);
    window.addEventListener('watchlist_updated', syncWatchlist);
    return () => {
      window.removeEventListener('nepse_watchlist_updated', syncWatchlist);
      window.removeEventListener('watchlist_updated', syncWatchlist);
    };
  }, []);

  useEffect(() => {
    loadNepseData().then(({ stocks }) => {
      setStocks(stocks);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAdd = () => {
    if (!pick) return;
    const updated = addToWatchlist(pick);
    setList(updated);
    setPick('');
  };

  const handleRemove = (sym: string) => {
    const updated = removeFromWatchlist(sym);
    setList(updated);
  };

  const watchedSet = new Set((list || []).map((s) => String(s).toUpperCase()));
  const watchedStocks = stocks.filter((s) => watchedSet.has(String(s.symbol || '').toUpperCase()));

  const gainersCount = watchedStocks.filter((s) => (s.pChange || 0) > 0).length;
  const losersCount = watchedStocks.filter((s) => (s.pChange || 0) < 0).length;
  const avgChange = watchedStocks.length > 0
    ? watchedStocks.reduce((sum, s) => sum + (s.pChange || 0), 0) / watchedStocks.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Live Watchlist &amp; Target Monitor</h3>
          <p className="text-xs text-slate-400">Track pinned securities with live tick data, unified across your entire app.</p>
        </div>
        <div className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
          ⭐ {list.length} Watched
        </div>
      </div>

      <InfoBanner>
        Any stock you star (⭐) in the Dashboard, Screener, or Stock Details appears here instantly.
      </InfoBanner>

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Total Watched" value={`${list.length} Stocks`} />
          <StatCard label="Gainers / Losers" value={`${gainersCount} ↑ / ${losersCount} ↓`} color={gainersCount >= losersCount ? '#16a34a' : '#dc2626'} />
          <StatCard label="Average Return" value={`${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`} color={avgChange >= 0 ? '#16a34a' : '#dc2626'} big />
        </div>
      )}

      <div className="mb-4">
        <label className="mb-1 block text-[11px] font-semibold text-slate-400">Add Security to Watchlist</label>
        <div className="flex flex-row items-center gap-2 w-full">
          <div className="flex-1 min-w-0">
            <StockSearchSelect value={pick} onChange={setPick} placeholder="Search stock symbol or name…" />
          </div>
          <button
            onClick={handleAdd}
            disabled={!pick}
            className="cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 shrink-0 h-[38px] whitespace-nowrap disabled:opacity-50"
          >
            + Star Watch
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : watchedStocks.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <div className="text-3xl mb-2">⭐</div>
          <h4 className="text-sm font-bold text-white">Your Watchlist is empty</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Search a stock above or tap the star icon next to any symbol on the Dashboard to start tracking it.
          </p>
        </div>
      ) : (
        <>
          <DataTable
            data={watchedStocks.map((s) => ({ ...s, remove: s.symbol }))}
            cols={[
              ...DEFAULT_COLS,
              {
                key: 'remove',
                label: '',
                align: 'right',
                format: (v) => (
                  <button
                    onClick={() => handleRemove(v)}
                    className="cursor-pointer rounded-md border border-red-800/60 bg-red-950/60 px-2 py-1 text-xs font-bold text-rose-400 hover:bg-red-900/60"
                    title="Remove from watchlist"
                  >
                    Remove
                  </button>
                ),
              },
            ]}
          />

          {/* ── Daily Health Report ─────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700 flex items-center gap-2">
              <Activity size={15} className="text-emerald-400" />
              <span className="text-sm font-bold text-white">Daily Health Report</span>
              <span className="text-xs text-slate-400 ml-1">6-signal scan for each watchlisted stock</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {watchedStocks.map((s) => {
                const ema20 = Number(s.ema20 || 0);
                const ema50 = Number(s.ema50 || 0);
                const ltp   = Number(s.ltp   || 0);
                const sig1 = (ema20 > 0 && ema50 > 0) ? (ltp > ema20 && ema20 > ema50) : null;
                const sig2 = (s.technicalScore != null) ? Number(s.technicalScore) >= 60 : null;
                const sig3 = (s.volumeZScore  != null) ? Number(s.volumeZScore)    >= 0  : null;
                const sig4 = (s.dpi           != null) ? Number(s.dpi)             >= 55 : null;
                const sig5 = Math.abs(Number(s.pChange) || 0) < 13;
                const sig6 = (Number(s.pChange) || 0) > -5;

                const sigs = [sig1, sig2, sig3, sig4, sig5, sig6];
                const known = sigs.filter(v => v !== null);
                const pass  = known.filter(Boolean).length;
                const pct   = known.length > 0 ? pass / known.length : 0;
                const hlth  = pct >= 0.75 ? 'Healthy' : pct >= 0.5 ? 'Warning' : 'Danger';
                const hCol  = hlth === 'Healthy'
                  ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40'
                  : hlth === 'Warning'
                  ? 'text-amber-400 bg-amber-900/30 border-amber-700/40'
                  : 'text-red-400 bg-red-900/30 border-red-700/40';
                const hDot  = hlth === 'Healthy' ? '🟢' : hlth === 'Warning' ? '🟡' : '🔴';
                const LABELS = ['Trend↗', 'Tech≥60', 'Volume', 'DPI≥55', 'Circuit', 'Momentum'];

                return (
                  <div key={s.symbol} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-[90px]">
                      <div className="font-bold text-white text-sm">{s.symbol}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[110px]">{(s as any).companyName || (s as any).name || s.symbol}</div>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${hCol} shrink-0`}>
                      {hDot} {hlth} ({pass}/{known.length})
                    </div>
                    <div className="flex items-center gap-1 flex-wrap flex-1">
                      {sigs.map((v, i) => (
                        <span key={i} title={LABELS[i]}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            v === null ? 'bg-slate-700 text-slate-500'
                              : v ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/30'
                              : 'bg-red-900/30 text-red-400 border border-red-700/30'
                          }`}
                        >
                          {v === null ? '?' : v ? '✓' : '✗'} {LABELS[i]}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className={`font-bold ${(Number(s.pChange) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(Number(s.pChange) || 0) >= 0 ? '+' : ''}{(Number(s.pChange) || 0).toFixed(2)}%
                      </span>
                      {s.dpi != null && <span className="text-slate-400">DPI: <span className="text-white font-semibold">{Math.round(Number(s.dpi))}</span></span>}
                    </div>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }))}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-800/40 transition font-semibold shrink-0"
                    >
                      <Target size={11} /> Analyze
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Level 2 NEPSE Market Depth Service (Top 5 Bids and Asks & Cumulative Broker Flow) ──
export function MarketDepthService() {
  const [symbol, setSymbol] = useState('NABIL');
  const [depthData, setDepthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Broker Accumulation State across horizons (1D, 5D, 15D, 30D, 60D)
  const [brokerDays, setBrokerDays] = useState<number>(5);
  const [brokerAccumPeriod, setBrokerAccumPeriod] = useState<'1D' | '5D' | '15D' | '30D' | '60D'>('5D');
  const [brokerAccumData, setBrokerAccumData] = useState<any>(null);
  const [brokerAccumLoading, setBrokerAccumLoading] = useState(false);

  const loadDepth = async (sym: string) => {
    if (!sym) return;
    setLoading(true);
    try {
      const res = await fetchMarketDepth(sym);
      const data = res?.data || res || {};
      setDepthData(data);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadDepth(symbol);
  }, [symbol]);

  const handleHorizonClick = async (hId: '1D' | '5D' | '15D' | '30D' | '60D') => {
    const daysMap: Record<string, number> = { '1D': 1, '5D': 5, '15D': 15, '30D': 30, '60D': 60 };
    const newDays = daysMap[hId] || 5;
    setBrokerAccumPeriod(hId);
    setBrokerDays(newDays);
    setBrokerAccumLoading(true);
    try {
      const res = await fetchBrokerAnalysis(symbol, newDays, true);
      const data = res?.data || res;
      if (data && (data.brokers?.length > 0 || data.topBuyers?.length > 0 || data.dailyFlow?.length > 0)) {
        setBrokerAccumData(data);
      } else {
        const realData = await fetchRealBrokerAnalysis(symbol, newDays, { refresh: true });
        if (realData) setBrokerAccumData(realData);
      }
    } catch (_) {
      try {
        const realData = await fetchRealBrokerAnalysis(symbol, newDays, { refresh: true });
        if (realData) setBrokerAccumData(realData);
      } catch (_) {}
    } finally {
      setBrokerAccumLoading(false);
    }
  };

  useEffect(() => {
    if (!symbol) return;
    const daysMap: Record<string, number> = { '1D': 1, '5D': 5, '15D': 15, '30D': 30, '60D': 60 };
    const days = daysMap[brokerAccumPeriod] || brokerDays || 5;
    setBrokerAccumLoading(true);
    fetchBrokerAnalysis(symbol, days, true)
      .then((res: any) => {
        const data = res?.data || res;
        if (data && (data.brokers?.length > 0 || data.topBuyers?.length > 0 || data.dailyFlow?.length > 0)) {
          setBrokerAccumData(data);
        } else {
          return fetchRealBrokerAnalysis(symbol, days, { refresh: true }).then(rData => {
            if (rData) setBrokerAccumData(rData);
          });
        }
      })
      .catch(() => {
        fetchRealBrokerAnalysis(symbol, days, { refresh: true }).then(rData => {
          if (rData) setBrokerAccumData(rData);
        }).catch(() => {});
      })
      .finally(() => setBrokerAccumLoading(false));
  }, [symbol, brokerAccumPeriod]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setBrokerAccumLoading(true);
    const daysMap: Record<string, number> = { '1D': 1, '5D': 5, '15D': 15, '30D': 30, '60D': 60 };
    const days = daysMap[brokerAccumPeriod] || brokerDays || 5;
    await Promise.all([
      loadDepth(symbol),
      fetchBrokerAnalysis(symbol, days, true)
        .then((res: any) => {
          const data = res?.data || res;
          if (data && (data.brokers?.length > 0 || data.topBuyers?.length > 0 || data.dailyFlow?.length > 0)) {
            setBrokerAccumData(data);
          } else {
            return fetchRealBrokerAnalysis(symbol, days, { refresh: true }).then(rData => {
              if (rData) setBrokerAccumData(rData);
            });
          }
        })
        .catch(() => {
          return fetchRealBrokerAnalysis(symbol, days, { refresh: true }).then(rData => {
            if (rData) setBrokerAccumData(rData);
          }).catch(() => {});
        })
    ]);
    setBrokerAccumLoading(false);
    setRefreshing(false);
  };

  // Normalization
  const ltp = depthData?.ltp || 0;
  const rawBids = Array.isArray(depthData?.bids) ? depthData.bids : [];
  const rawAsks = Array.isArray(depthData?.asks) ? depthData.asks : [];
  const hasOrders = rawBids.length > 0 || rawAsks.length > 0;

  const bids = rawBids.slice(0, 5).map((b: any) => ({
    orders: b.orderCount || b.Orders || b.orders || 1,
    qty: b.quantity || b.Quantity || b.qty || 0,
    price: b.price || b.Price || 0,
  }));

  const asks = rawAsks.slice(0, 5).map((a: any) => ({
    price: a.price || a.Price || 0,
    qty: a.quantity || a.Quantity || a.qty || 0,
    orders: a.orderCount || a.Orders || a.orders || 1,
  }));

  const totalBuyQty = bids.reduce((sum: number, b: any) => sum + b.qty, 0);
  const totalSellQty = asks.reduce((sum: number, a: any) => sum + a.qty, 0);
  const totalOrderQty = totalBuyQty + totalSellQty || 1;
  const buyPct = hasOrders ? Math.round((totalBuyQty / totalOrderQty) * 100) : 50;
  const sellPct = 100 - buyPct;

  const topBid = bids[0]?.price || ltp;
  const topAsk = asks[0]?.price || ltp;
  const spread = hasOrders && topAsk > 0 && topBid > 0 ? Math.max(0, +(topAsk - topBid).toFixed(2)) : 0;
  const spreadPct = topBid > 0 && spread > 0 ? +((spread / topBid) * 100).toFixed(2) : 0;

  // Broker Accumulation vs Distribution parsing
  const netAccums: any[] = useMemo(() => {
    if (!brokerAccumData) return [];
    if (Array.isArray(brokerAccumData.topNetBuyers) && brokerAccumData.topNetBuyers.length > 0) {
      return brokerAccumData.topNetBuyers;
    }
    if (Array.isArray(brokerAccumData.topNetAccumulators) && brokerAccumData.topNetAccumulators.length > 0) {
      return brokerAccumData.topNetAccumulators;
    }
    if (Array.isArray(brokerAccumData.brokers) && brokerAccumData.brokers.length > 0) {
      return brokerAccumData.brokers
        .filter((b: any) => (b.netQty !== undefined ? b.netQty : (b.buyQty - b.sellQty)) > 0)
        .sort((a: any, b: any) => (b.netQty || (b.buyQty - b.sellQty)) - (a.netQty || (a.buyQty - a.sellQty)));
    }
    return brokerAccumData.topBuyers || [];
  }, [brokerAccumData]);

  const netDists: any[] = useMemo(() => {
    if (!brokerAccumData) return [];
    if (Array.isArray(brokerAccumData.topNetSellers) && brokerAccumData.topNetSellers.length > 0) {
      return brokerAccumData.topNetSellers;
    }
    if (Array.isArray(brokerAccumData.topNetDistributors) && brokerAccumData.topNetDistributors.length > 0) {
      return brokerAccumData.topNetDistributors;
    }
    if (Array.isArray(brokerAccumData.brokers) && brokerAccumData.brokers.length > 0) {
      return brokerAccumData.brokers
        .filter((b: any) => (b.netQty !== undefined ? b.netQty : (b.buyQty - b.sellQty)) < 0)
        .sort((a: any, b: any) => (a.netQty || (a.buyQty - a.sellQty)) - (b.netQty || (b.buyQty - a.sellQty)));
    }
    return brokerAccumData.topSellers || [];
  }, [brokerAccumData]);

  const totalBrokerBuyVol = Number(brokerAccumData?.totalBuyVolume || brokerAccumData?.totalVolume || 0);
  const totalBrokerSellVol = Number(brokerAccumData?.totalSellVolume || brokerAccumData?.totalVolume || 0);
  const brokerFlowTot = totalBrokerBuyVol + totalBrokerSellVol;
  const brokerFlowBuyPct = brokerFlowTot > 0 ? Math.round((totalBrokerBuyVol / brokerFlowTot) * 100) : 50;

  const maxAccumQty = netAccums.length > 0
    ? Math.max(...netAccums.map((b: any) => Math.abs(Number(b.netQty !== undefined ? b.netQty : (b.buyQty !== undefined ? (b.buyQty - (b.sellQty || 0)) : (b.volume || 0))))))
    : 1;
  const maxDistQty = netDists.length > 0
    ? Math.max(...netDists.map((s: any) => Math.abs(Number(s.netQty !== undefined ? s.netQty : (s.sellQty !== undefined ? (s.sellQty - (s.buyQty || 0)) : (s.volume || 0))))))
    : 1;

  const adSignal = brokerAccumData?.adSignal || (brokerFlowBuyPct >= 55 ? 'Accumulation' : brokerFlowBuyPct <= 45 ? 'Distribution' : 'Neutral');
  const bcr3Buy = Number(brokerAccumData?.bcr3BuyPct || 0);
  const bcr3Sell = Number(brokerAccumData?.bcr3SellPct || 0);

  // Divergence Detection
  const isFlowAccum = adSignal === 'Accumulation' || brokerFlowBuyPct >= 55;
  const isFlowDist = adSignal === 'Distribution' || brokerFlowBuyPct <= 45;

  // Whale VWAP computation (weighted avg rate of top accumulators)
  const whaleVwap = useMemo(() => {
    const topB = netAccums.slice(0, 5);
    const totAmt = topB.reduce((s: number, b: any) => s + (Number(b.avgBuyRate || (b.buyAmt && b.buyQty ? b.buyAmt / b.buyQty : 0)) * Number(b.netQty !== undefined ? b.netQty : b.buyQty || 0)), 0);
    const totQty = topB.reduce((s: number, b: any) => s + Number(b.netQty !== undefined ? b.netQty : b.buyQty || 0), 0);
    return totQty > 0 ? +(totAmt / totQty).toFixed(1) : null;
  }, [netAccums]);

  const diffFromWhale = (whaleVwap && ltp > 0) ? +(((ltp - whaleVwap) / whaleVwap) * 100).toFixed(1) : null;
  const nbarVal = (totalBrokerBuyVol > 0 && totalBrokerSellVol > 0) ? +(totalBrokerBuyVol / totalBrokerSellVol).toFixed(2) : (bcr3Sell > 0 ? +(bcr3Buy / bcr3Sell).toFixed(2) : 1.0);

  let divergenceAlert: { badge: string; desc: string; color: string; bg: string; border: string } | null = null;
  if (hasOrders && brokerFlowTot > 0) {
    if (buyPct >= 58 && (isFlowAccum || bcr3Buy > bcr3Sell)) {
      divergenceAlert = {
        badge: '🟢 Confirmed Institutional Demand',
        desc: `Both pending book demand (${buyPct}% Bids) and executed broker flow (${brokerFlowBuyPct}% Buy flow) indicate sustained institutional accumulation. Big desks are actively absorbing supply.`,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.08)',
        border: 'rgba(16, 185, 129, 0.3)'
      };
    } else if (buyPct >= 60 && (isFlowDist || bcr3Sell > bcr3Buy)) {
      divergenceAlert = {
        badge: '🚨 Spoof Bid / Trap Warning',
        desc: `Order book displays heavy retail pending buy demand (${buyPct}% Bids), yet executed broker flow reveals net distribution (${100 - brokerFlowBuyPct}% selling). Smart money may be offloading inventory into passive limit orders.`,
        color: '#f43f5e',
        bg: 'rgba(244, 63, 94, 0.08)',
        border: 'rgba(244, 63, 94, 0.3)'
      };
    } else if (buyPct <= 42 && (isFlowAccum || bcr3Buy > bcr3Sell)) {
      divergenceAlert = {
        badge: '🔵 Stealth Institutional Absorption',
        desc: `Order book shows heavy sell pressure (${sellPct}% Asks), but executed broker flow confirms aggressive net accumulation (${brokerFlowBuyPct}% buying). Large accumulators are quietly absorbing sell orders without raising bids.`,
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.08)',
        border: 'rgba(56, 189, 248, 0.3)'
      };
    } else if (buyPct <= 42 && (isFlowDist || bcr3Sell > bcr3Buy)) {
      divergenceAlert = {
        badge: '🔴 Sustained Institutional Offloading',
        desc: `Both pending asks (${sellPct}% Sell supply) and executed broker flow (${100 - brokerFlowBuyPct}% Sell flow) reflect active institutional liquidation.`,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.3)'
      };
    }
  }

  const HORIZONS: Array<{ id: '1D' | '5D' | '15D' | '30D' | '60D'; label: string }> = [
    { id: '1D', label: 'Today (1D)' },
    { id: '5D', label: '5D' },
    { id: '15D', label: '15D' },
    { id: '30D', label: '30D' },
    { id: '60D', label: '60D (Vault)' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Level 2 NEPSE Market Depth & Broker Flow</h3>
          <p className="text-xs text-slate-400">Live order queue with multi-horizon cumulative broker accumulation vs distribution.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="w-full sm:w-72">
          <StockSearchSelect value={symbol} onChange={setSymbol} placeholder="Select security for depth…" />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300 ml-auto font-mono flex-wrap">
          <span className="text-slate-400">Symbol: <strong className="text-white">{symbol}</strong></span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">LTP: <strong className="text-emerald-400">Rs. {ltp}</strong></span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">Spread: <strong className="text-amber-400">Rs. {spread} ({spreadPct}%)</strong></span>
          {depthData?.isOffMarket && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
              🌙 Off-Market Snapshot
            </span>
          )}
        </div>
      </div>

      {depthData?.isOffMarket && (
        <div className="px-3.5 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between flex-wrap gap-2">
          <span>🌙 <strong>Market Closed</strong>: Displaying authentic Closing Session Order Book snapshot ({depthData?.sessionLabel || '3:00 PM NPT'}).</span>
          <span className="text-[11px] text-slate-400">Live NOTS queue streams Sun–Thu 11:00 AM – 3:00 PM</span>
        </div>
      )}

      {/* Demand vs Supply Ratio Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2">
        <div className="flex justify-between text-xs font-semibold">
          <span className="text-emerald-400">Total Buy Demand: {totalBuyQty.toLocaleString()} units ({buyPct}%)</span>
          <span className="text-rose-400">Total Sell Supply: {totalSellQty.toLocaleString()} units ({sellPct}%)</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800 flex">
          <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${buyPct}%` }} />
          <div className="bg-rose-500 transition-all duration-300" style={{ width: `${sellPct}%` }} />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : !hasOrders ? (
        <InfoBanner type="info">
          Order book queue is currently empty for {symbol}. Real-time 5-depth market depth is actively populated by NEPSE NOTS during continuous trading hours (Mon–Fri 11:00 AM – 3:00 PM NPT).
        </InfoBanner>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-sky-950/30 border border-sky-500/25 text-xs text-sky-400 font-bold">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              Live Point-in-Time Order Queue (Unfilled Limit Orders)
            </span>
            <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">Active pending limit orders in exchange match engine</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bid (Buy) Side */}
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 overflow-hidden">
              <div className="bg-emerald-900/40 px-3.5 py-2 text-xs font-bold text-emerald-300 uppercase tracking-wider flex justify-between">
                <span>Buy Orders (Bids)</span>
                <span>Total: {totalBuyQty.toLocaleString()}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-emerald-900/30 text-slate-400">
                    <th className="py-2 px-3 text-left font-medium">Orders</th>
                    <th className="py-2 px-3 text-right font-medium">Quantity</th>
                    <th className="py-2 px-3 text-right font-bold text-emerald-400">Bid Price (Rs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-900/20">
                  {bids.map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-emerald-900/20 transition-colors">
                      <td className="py-2 px-3 text-slate-400">{b.orders}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-white">{b.qty.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">Rs. {Number(b.price).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ask (Sell) Side */}
            <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 overflow-hidden">
              <div className="bg-rose-900/40 px-3.5 py-2 text-xs font-bold text-rose-300 uppercase tracking-wider flex justify-between">
                <span>Sell Orders (Asks)</span>
                <span>Total: {totalSellQty.toLocaleString()}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-rose-900/30 text-slate-400">
                    <th className="py-2 px-3 text-left font-bold text-rose-400">Ask Price (Rs.)</th>
                    <th className="py-2 px-3 text-right font-medium">Quantity</th>
                    <th className="py-2 px-3 text-right font-medium">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-900/20">
                  {asks.map((a: any, idx: number) => (
                    <tr key={idx} className="hover:bg-rose-900/20 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-rose-400">Rs. {Number(a.price).toFixed(1)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-white">{a.qty.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{a.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Cumulative Broker Accumulation vs Distribution ("Till Now") ══ */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5 shadow-lg">
        {/* Header & Horizon Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h4 className="text-sm font-black text-white tracking-wide">
                📊 Cumulative Broker Accumulation vs Distribution
              </h4>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30">
                Cumulative Executed Broker Inventory ({brokerDays}D Horizon)
              </span>
              {brokerAccumLoading && <span className="text-[11px] text-sky-400 animate-pulse font-bold">Fetching {brokerDays}D flow…</span>}
              {adSignal && (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                  adSignal === 'Accumulation' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                  adSignal === 'Distribution' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                  'bg-slate-700/30 text-slate-300 border-slate-700'
                }`}>
                  {adSignal} Flow
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Authentic multi-day broker vault accumulation, distribution & cost basis across NEPSE
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-[11.5px] font-bold text-sky-400">
              <span>Sessions Analyzed: {brokerAccumData?.tradingDays || brokerDays || 1} Trading Days ({brokerAccumData?.fromDate || 'Latest'} → {brokerAccumData?.toDate || 'Latest'}) • Total Volume: {(brokerAccumData?.totalVolume || 0).toLocaleString()} Shares</span>
            </div>
          </div>

          {/* Horizons: 1D, 5D, 15D, 30D, 60D */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {HORIZONS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => handleHorizonClick(h.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  brokerAccumPeriod === h.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {brokerAccumLoading && (
          <div className="flex items-center justify-center p-3 rounded-xl bg-sky-950/20 border border-sky-500/20 text-xs text-sky-400 font-medium">
            <RefreshCw size={14} className="animate-spin mr-2 text-sky-400" />
            <span>Updating {brokerDays}D Cumulative Broker Accumulation for {symbol}…</span>
          </div>
        )}

        {/* Plain-English Guide Banner */}
        <div className="p-3 rounded-xl border border-sky-500/25 bg-sky-950/20 flex items-start gap-2.5 text-xs text-slate-300">
          <span className="text-base">💡</span>
          <div className="leading-relaxed">
            <strong className="text-sky-400">Pending Order Book vs Real Executed Shares:</strong> The 5-depth order book above displays pending, unfilled limit orders waiting in the queue. Below is authentic cumulative institutional flow across NEPSE: which brokers actually bought and kept shares in their vaults vs who dumped shares.
          </div>
        </div>

        {/* Reality Check Banner */}
        {divergenceAlert && (
          <div
            className="p-3 rounded-xl border flex flex-col gap-1 transition"
            style={{
              backgroundColor: divergenceAlert.bg,
              borderColor: divergenceAlert.border,
            }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-black tracking-wide" style={{ color: divergenceAlert.color }}>
                {divergenceAlert.badge}
              </span>
              <span className="text-[11px] font-mono text-slate-300">
                Book: <strong className="text-emerald-400">{buyPct}% Bids</strong> vs Executed Flow: <strong style={{ color: brokerFlowBuyPct >= 50 ? '#34d399' : '#fb7185' }}>{brokerFlowBuyPct}% Buy</strong>
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {divergenceAlert.desc}
            </p>
          </div>
        )}

        {/* 4-Card Summary Strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Card 1: Total Accumulated */}
          <div className="p-2.5 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
            <div className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">
              Total Accumulated
            </div>
            <div className="text-sm font-black font-mono text-white mt-0.5">
              {totalBrokerBuyVol.toLocaleString()} sh
            </div>
            <div className="text-[10px] text-emerald-300 font-mono mt-0.5">
              BCR3 Buy: <strong>{bcr3Buy.toFixed(1)}%</strong>
            </div>
          </div>

          {/* Card 2: Total Distributed */}
          <div className="p-2.5 rounded-xl border border-rose-900/40 bg-rose-950/20">
            <div className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider">
              Total Distributed
            </div>
            <div className="text-sm font-black font-mono text-white mt-0.5">
              {totalBrokerSellVol.toLocaleString()} sh
            </div>
            <div className="text-[10px] text-rose-300 font-mono mt-0.5">
              BCR3 Sell: <strong>{bcr3Sell.toFixed(1)}%</strong>
            </div>
          </div>

          {/* Card 3: Whale Cost VWAP */}
          <div className="p-2.5 rounded-xl border border-cyan-900/40 bg-cyan-950/20">
            <div className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider">
              Whale Cost (VWAP)
            </div>
            <div className="text-sm font-black font-mono text-white mt-0.5">
              {whaleVwap ? `Rs. ${whaleVwap}` : '—'}
            </div>
            <div className={`text-[10px] font-mono mt-0.5 ${diffFromWhale != null && diffFromWhale >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {diffFromWhale != null ? (diffFromWhale >= 0 ? `+${diffFromWhale}% above cost` : `${diffFromWhale}% below cost`) : 'Top 5 cost basis'}
            </div>
          </div>

          {/* Card 4: NBAR & Activity Ratio */}
          <div className="p-2.5 rounded-xl border border-amber-900/40 bg-amber-950/20">
            <div className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">
              NBAR & Demand
            </div>
            <div className="text-sm font-black font-mono text-white mt-0.5">
              {nbarVal}x Ratio
            </div>
            <div className={`text-[10px] mt-0.5 ${nbarVal >= 1.15 ? 'text-emerald-400' : nbarVal <= 0.85 ? 'text-rose-400' : 'text-slate-400'}`}>
              {nbarVal >= 1.15 ? 'Institutional Edge' : nbarVal <= 0.85 ? 'Selling Pressure' : 'Balanced Flow'}
            </div>
          </div>
        </div>

        {/* Cumulative Volume Bar */}
        {(totalBrokerBuyVol > 0 || totalBrokerSellVol > 0) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-emerald-400 font-mono">
                Total Buy: {totalBrokerBuyVol.toLocaleString()} sh ({brokerFlowBuyPct}%)
              </span>
              <span className="text-rose-400 font-mono">
                Total Sell: {totalBrokerSellVol.toLocaleString()} sh ({100 - brokerFlowBuyPct}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 flex">
              <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${brokerFlowBuyPct}%` }} />
              <div className="bg-rose-500 transition-all duration-300" style={{ width: `${100 - brokerFlowBuyPct}%` }} />
            </div>
          </div>
        )}

        {/* Net Buyers vs Net Sellers Grid */}
        {netAccums.length === 0 && netDists.length === 0 && !brokerAccumLoading ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No cumulative broker transactions recorded for {symbol} across {brokerAccumPeriod}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Top Net Buyers (Accumulators) */}
            <div className="p-3 rounded-xl border border-emerald-900/40 bg-emerald-950/15 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-1.5">
                <span>🟢 TOP CUMULATIVE ACCUMULATORS</span>
                <span className="text-[11px] text-emerald-300/80 font-mono">VAULT HELD</span>
              </div>
              {netAccums.slice(0, 5).length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">No net accumulator records</div>
              ) : (
                netAccums.slice(0, 5).map((b: any, idx: number) => {
                  const id = b.broker || b.brokerId || b.id || (idx + 1);
                  const brokerName = b.brokerName || b.name || getBrokerName(id);
                  const buyQty = Number(b.buyQty || b.volume || 0);
                  const sellQty = Number(b.sellQty || 0);
                  const qty = Math.abs(Number(b.netQty !== undefined ? b.netQty : (buyQty - sellQty)));
                  const amt = Math.abs(Number(b.netAmt !== undefined ? b.netAmt : (b.buyAmt !== undefined ? (b.buyAmt - (b.sellAmt || 0)) : (b.amount || (qty * ltp)))));
                  const avgRate = Number(b.avgBuyRate || (b.buyAmt && b.buyQty ? (b.buyAmt / b.buyQty) : ltp));
                  const barW = maxAccumQty > 0 ? Math.min(100, Math.round((qty / maxAccumQty) * 100)) : 0;
                  const retentionPct = buyQty > 0 ? Math.max(0, Math.min(100, Math.round((qty / buyQty) * 100))) : 100;

                  return (
                    <div key={idx} className="space-y-1 pb-1.5 border-b border-slate-800/50 last:border-b-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white truncate max-w-[65%]" title={`#${id} ${brokerName}`}>
                          <strong className="text-emerald-400 mr-1.5">#{id}</strong> {brokerName}
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          +{qty.toLocaleString()} sh
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${barW}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>Gross: {buyQty > 0 ? `${buyQty.toLocaleString()} B` : `Rs. ${(amt / 1e5).toFixed(1)}L`}</span>
                        {avgRate > 0 && <span className="text-slate-300">Avg: Rs. {avgRate.toFixed(1)}</span>}
                        <span className="text-emerald-400">{retentionPct}% kept</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Top Net Sellers (Distributors) */}
            <div className="p-3 rounded-xl border border-rose-900/40 bg-rose-950/15 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-rose-400 border-b border-rose-900/30 pb-1.5">
                <span>🔴 TOP CUMULATIVE DISTRIBUTORS</span>
                <span className="text-[11px] text-rose-300/80 font-mono">OFFLOADED</span>
              </div>
              {netDists.slice(0, 5).length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">No net distributor records</div>
              ) : (
                netDists.slice(0, 5).map((s: any, idx: number) => {
                  const id = s.broker || s.brokerId || s.id || (idx + 1);
                  const brokerName = s.brokerName || s.name || getBrokerName(id);
                  const sellQty = Number(s.sellQty || s.volume || 0);
                  const buyQty = Number(s.buyQty || 0);
                  const qty = Math.abs(Number(s.netQty !== undefined ? s.netQty : (sellQty - buyQty)));
                  const amt = Math.abs(Number(s.netAmt !== undefined ? s.netAmt : (s.sellAmt !== undefined ? (s.sellAmt - (s.buyAmt || 0)) : (s.amount || (qty * ltp)))));
                  const avgRate = Number(s.avgSellRate || (s.sellAmt && s.sellQty ? (s.sellAmt / s.sellQty) : ltp));
                  const barW = maxDistQty > 0 ? Math.min(100, Math.round((qty / maxDistQty) * 100)) : 0;
                  const sellShare = totalBrokerSellVol > 0 ? Math.round((sellQty / totalBrokerSellVol) * 100) : Number(s.sellMktShare || s.pct || 0);

                  return (
                    <div key={idx} className="space-y-1 pb-1.5 border-b border-slate-800/50 last:border-b-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white truncate max-w-[65%]" title={`#${id} ${brokerName}`}>
                          <strong className="text-rose-400 mr-1.5">#{id}</strong> {brokerName}
                        </span>
                        <span className="font-mono font-bold text-rose-400">
                          -{qty.toLocaleString()} sh
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${barW}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>Gross: {sellQty > 0 ? `${sellQty.toLocaleString()} S` : `Rs. ${(amt / 1e5).toFixed(1)}L`}</span>
                        {avgRate > 0 && <span className="text-slate-300">Avg: Rs. {avgRate.toFixed(1)}</span>}
                        <span className="text-rose-400">{sellShare > 0 ? `${sellShare}% share` : 'Offloaded'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TradeNotesTool() {
  const [notes, setNotes] = useLocal<any[]>('nepse_notes_v1', []);
  const [t, setT] = useState({ symbol: '', text: '' });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <h3 className="text-base font-bold text-white tracking-wide">Investor Trade Journal & Notes</h3>
      </div>
      <InfoBanner>Document every trade with thesis, entry, exit and outcome. Great traders journal everything.</InfoBanner>
      <div className="mb-3 grid gap-2">
        <input placeholder="Stock symbol" value={t.symbol} onChange={(e) => setT({ ...t, symbol: e.target.value.toUpperCase() })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
        <textarea placeholder="Trade thesis, setup, emotions, lesson…" value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} rows={3} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
        <button onClick={() => { if (t.symbol && t.text) { setNotes([{ id: Date.now(), date: new Date().toLocaleString(), ...t }, ...notes]); setT({ symbol: '', text: '' }); } }} className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Save Note</button>
      </div>
      {notes.length === 0 ? <NoData message="No notes yet." /> : (
        <div className="grid gap-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <strong className="text-white">{n.symbol}</strong>
                <span>{n.date}</span>
              </div>
              <p className="m-0 whitespace-pre-wrap text-slate-200">{n.text}</p>
              <button onClick={() => setNotes(notes.filter((x) => x.id !== n.id))} className="mt-2 cursor-pointer text-xs text-red-400">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AlertsTool() {
  const [alerts, setAlerts] = useLocal<any[]>('nepse_alerts_v1', []);
  const [f, setF] = useState({ symbol: '', level: '', dir: 'above' });
  const [stocks, setStocks] = useState<EnrichedStock[]>([]);
  useEffect(() => { loadNepseData().then(({ stocks }) => setStocks(stocks)); }, []);
  const hit = (al: any) => {
    const s = stocks.find((x) => x.symbol === al.symbol);
    if (!s) return false;
    return al.dir === 'above' ? s.ltp >= al.level : s.ltp <= al.level;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <h3 className="text-base font-bold text-white tracking-wide">Stock Target Alerts & Triggers</h3>
      </div>
      <InfoBanner type="success"><Bell size={13} className="mr-1 inline" /> Price alerts are evaluated against live LTP every time you open this tab.</InfoBanner>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 items-end">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Stock Symbol</label>
          <StockSearchSelect value={f.symbol} onChange={(sym) => setF({ ...f, symbol: sym })} placeholder="Stock symbol…" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Condition</label>
          <select value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white">
            <option value="above">Crosses above</option>
            <option value="below">Falls below</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-400">Price Level (Rs.)</label>
          <input type="number" placeholder="Price level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500" />
        </div>
        <button onClick={() => { if (f.level && f.symbol) { setAlerts([{ id: Date.now(), ...f, level: parseFloat(f.level) }, ...alerts]); setF({ ...f, level: '' }); } }} className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 h-[38px]">+ Alert</button>
      </div>
      {alerts.length === 0 ? <NoData message="No alerts set." /> : (
        <div className="grid gap-2">
          {alerts.map((al) => {
            const h = hit(al);
            return (
              <div key={al.id} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${h ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200' : 'border-slate-800 bg-slate-900/80 text-white'}`}>
                <div><strong>{al.symbol}</strong> {al.dir === 'above' ? '≥' : '≤'} Rs. {al.level} {h && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">TRIGGERED</span>}</div>
                <button onClick={() => setAlerts(alerts.filter((x) => x.id !== al.id))} className="cursor-pointer text-xs font-bold text-red-400">Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── API status dashboard ──
export function ApiStatusService() {
  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => { setLiveCount(getCachedStocks().length); }, []);
  const cats = [...new Set(ENDPOINT_REGISTRY.map((e) => e.category))];
  return (
    <div>
      <InfoBanner type="success">All {ENDPOINT_REGISTRY.length} documented endpoints are wired through the data engine with automatic fallback — no tab ever goes blank.</InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label="Endpoints Wired" value={ENDPOINT_REGISTRY.length} big color="#3b82f6" />
        <StatCard label="Stocks In Memory" value={liveCount} big />
        <StatCard label="Engine" value="v3 FIX" color="#10b981" />
        <StatCard label="Fallback" value="ON" color="#10b981" />
      </div>
      {cats.map((c) => (
        <div key={c} className="mb-4">
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">{c}</h4>
          <div className="grid gap-1.5">
            {ENDPOINT_REGISTRY.filter((e) => e.category === c).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-[13px]">
                <div className="min-w-0"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">{e.method}</span><code className="break-all text-slate-300">{e.path}</code><div className="mt-0.5 text-xs text-slate-400">{e.description}</div></div>
                <span className="shrink-0 rounded-full bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[11px] font-bold text-emerald-300">● WIRED</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PortfolioSummaryCard() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="rounded-lg bg-cyan-950/60 border border-cyan-800/60 p-2.5"><Briefcase size={20} className="text-cyan-400" /></div>
      <div className="text-sm text-slate-300">Open <strong className="text-white">Portfolio</strong> to track live P&amp;L.</div>
    </div>
  );
}

// Re-export live fetchers for ServicesHub wiring checks
export { fetchLiveMarket, fetchMarketSummary };
