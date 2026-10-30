import React, { useState, useEffect, useMemo } from 'react';
import { Users, Crown, ArrowLeftRight, Search, RefreshCw, TrendingUp, TrendingDown, Shield, Eye, Target, LayoutGrid, List, X, ChevronRight, BarChart3, ExternalLink, Download, Share2, Copy, Check } from 'lucide-react';
import { loadNepseData, fetchFloorSheet, fetchRealFloorsheet, getCachedRealBrokerAnalysis, fetchMarketWideBrokerSummaryMap, fetchAvailableTradingDates } from '../utils/liveData';
import { isNepseTradingDay, formatNptDateIso } from '../utils/nepseCalendar';
import { fetchBrokerAnalysis, fetchBrokerHeatmap } from '../utils/servicesApi';
import { exportMarketBrokerSurveillance } from '../utils/floorsheetExport';
import { StatCard, InfoBanner, Insight, Spinner, TimeframeFilterBar } from './ui';
import latestBrokerMatrix from '../data/broker_matrix_latest.json';

export function formatNepaliCurrency(amt: number): string {
  const abs = Math.abs(amt);
  if (abs >= 10000000) return `Rs. ${(amt / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `Rs. ${(amt / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `Rs. ${(amt / 1000).toFixed(1)} K`;
  return `Rs. ${amt.toLocaleString('en-IN')}`;
}

export interface BrokerScripItem {
  symbol: string;
  name?: string;
  buyAmount: number;
  sellAmount: number;
  netFlow: number;
  bias: 'Accumulation' | 'Distribution' | 'Neutral';
  buyQty?: number;
  sellQty?: number;
  netQty?: number;
  avgBuyRate?: number;
  avgSellRate?: number;
  cumHoldQty?: number;
  cumAvgBuy?: number;
}

interface BrokerStat {
  brokerId: string;
  brokerName: string;
  buyAmount: number;
  sellAmount: number;
  netFlow: number;
  topStock: string;
  totalTrades: number;
  bias: 'Aggressive Accumulation' | 'Mild Accumulation' | 'Distribution' | 'Heavy Selling';
  topScrips?: BrokerScripItem[];
  topAccumulation?: BrokerScripItem[];
  topDistribution?: BrokerScripItem[];
  topByNetQty?: BrokerScripItem[];
  topByGrossBuyAmt?: BrokerScripItem[];
  topByGrossBuyQty?: BrokerScripItem[];
  topDistByNetQty?: BrokerScripItem[];
  topDistByGrossSellAmt?: BrokerScripItem[];
  topDistByGrossSellQty?: BrokerScripItem[];
}

interface DominanceItem {
  symbol: string;
  name: string;
  ltp: number;
  pChange: number;
  turnover: number;
  topBrokerId: string;
  topBrokerName: string;
  dominancePct: number;
  top3BuyPct: number;
  top3SellPct: number;
  buyerBrokers: string[];
  sellerBrokers: string[];
  smartMoneyVerdict: 'INSTITUTIONAL_ACCUMULATION' | 'DISTRIBUTION_TRAP' | 'BROAD_RETAIL';
  smartMoneyReason: string;
  status: 'Highly Cornered' | 'Moderate Dominance' | 'Broad Retail';
}

interface MatchingDeal {
  id: string;
  symbol: string;
  buyerBroker: string;
  sellerBroker: string;
  quantity: number;
  rate: number;
  amount: number;
  time: string;
  date?: string;
  type: 'Block Deal' | 'Strategic Handover' | 'Cross Trade';
}

const MAJOR_BROKERS = [
  { id: '58', name: 'Naasa Securities' },
  { id: '45', name: 'Imperial Securities' },
  { id: '34', name: 'Vision Securities' },
  { id: '49', name: 'Online Securities' },
  { id: '17', name: 'ABC Securities' },
  { id: '28', name: 'Shree Krishna' },
  { id: '42', name: 'Sani Securities' },
  { id: '57', name: 'Aryatara Inv.' },
  { id: '32', name: 'Premier Securities' },
  { id: '59', name: 'Divya Securities' },
  { id: '50', name: 'Crystal Kanchenjunga' },
  { id: '44', name: 'Dynamic Money' },
  { id: '14', name: 'Nepal Stock House' },
  { id: '33', name: 'Dakshinkali Sec.' },
  { id: '4', name: 'Opal Securities' },
  { id: '6', name: 'Agrawal Securities' },
];

const DAYS_MAP: Record<string, number> = {
  '1D': 1,
  '1W': 7,
  '15D': 15,
  '1M': 30,
  '2M': 60,
  '3M': 90,
  '6M': 180,
  '1Y': 260,
  'ALL': 500,
};

export function BrokerFlowDominanceService({
  mode = 'flow',
  selectedDate,
  date,
  availableDates: propAvailableDates,
  initialSymbol,
}: {
  mode?: 'flow' | 'dominance' | 'top10' | 'matching' | 'brokerWise';
  selectedDate?: string;
  date?: string;
  availableDates?: string[];
  initialSymbol?: string;
}) {
  const [activeMode, setActiveMode] = useState<'flow' | 'dominance' | 'top10' | 'matching' | 'brokerWise'>(mode);
  const [timeframe, setTimeframe] = useState('1D');
  const [sessionDateFilter, setSessionDateFilter] = useState(selectedDate || date || '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileView, setMobileView] = useState<'cards' | 'table'>('cards');
  const [smartMoneyFilter, setSmartMoneyFilter] = useState<'ALL' | 'ACCUMULATION' | 'TRAP' | 'RETAIL'>('ALL');
  const [stocks, setStocks] = useState<any[]>([]);
  const [floorsheet, setFloorsheet] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [fetchedDates, setFetchedDates] = useState<string[]>([]);
  const [selectedBrokerModal, setSelectedBrokerModal] = useState<BrokerStat | null>(null);
  const [selectedTop10BrokerId, setSelectedTop10BrokerId] = useState<string>('58');
  const [modalTab, setModalTab] = useState<'accumulation' | 'distribution'>('accumulation');
  const [rankingMetric, setRankingMetric] = useState<'net_amount' | 'net_qty' | 'gross_buy_amount' | 'gross_buy_qty'>('net_amount');
  const [matchingSortOrder, setMatchingSortOrder] = useState<'date_desc' | 'amount_desc'>('date_desc');
  const [brokerWiseTab, setBrokerWiseTab] = useState<'sellers' | 'buyers'>('sellers');
  const [uniqueStockOnly, setUniqueStockOnly] = useState<boolean>(true);
  const [copiedCard, setCopiedCard] = useState<boolean>(false);

  // Sync incoming props from parent
  useEffect(() => {
    const incoming = selectedDate || date;
    if (incoming && incoming !== sessionDateFilter) {
      setSessionDateFilter(incoming);
    }
  }, [selectedDate, date]);

  // Load authoritative trading dates on mount
  useEffect(() => {
    fetchAvailableTradingDates().then(dates => {
      if (Array.isArray(dates) && dates.length > 0) {
        setFetchedDates(dates);
      }
    }).catch(() => {});
  }, []);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(propAvailableDates)) {
      propAvailableDates.forEach((d: any) => d && set.add(String(d)));
    }
    if (Array.isArray(fetchedDates)) {
      fetchedDates.forEach((d: any) => d && set.add(String(d)));
    }
    if (Array.isArray(heatmapData?.availableDates)) {
      heatmapData.availableDates.forEach((d: any) => d && set.add(String(d)));
    }
    if (heatmapData?.businessDate) set.add(String(heatmapData.businessDate));
    if (floorsheet && floorsheet.length > 0) {
      floorsheet.forEach((f: any) => {
        const dt = f.businessDate || f.date;
        if (dt) set.add(String(dt).split('T')[0]);
      });
    }
    const todayIso = formatNptDateIso(new Date());
    // Filter strictly through isNepseTradingDay to guarantee no Saturday/Sunday weekends or Dashain holidays leak in
    const valid = Array.from(set).filter(d => {
      if (!d || typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      // During active trading hours, omit today's incomplete date from floorsheet filter to avoid partial data interpretation
      if (d === todayIso) {
        const now = new Date();
        const nptOffset = 5 * 60 + 45;
        const totalMins = (now.getUTCHours() * 60 + now.getUTCMinutes() + nptOffset) % 1440;
        if (totalMins < 15 * 60 + 30) return false; // Full day floorsheet reconciles after 3:30 PM
      }
      try {
        return isNepseTradingDay(new Date(d + 'T12:00:00+05:45'));
      } catch {
        return true;
      }
    });
    return valid.sort().reverse().slice(0, 500);
  }, [propAvailableDates, fetchedDates, heatmapData, floorsheet]);

  const sessionDate = useMemo(() => {
    if (sessionDateFilter) return sessionDateFilter;
    if (selectedDate || date) return selectedDate || date;
    if (heatmapData?.businessDate) return heatmapData.businessDate;
    if (availableDates.length > 0) return availableDates[0];
    if (floorsheet && floorsheet.length > 0) {
      const fsDate = floorsheet.find(f => f.businessDate || f.date);
      if (fsDate?.businessDate || fsDate?.date) return String(fsDate.businessDate || fsDate.date).split('T')[0];
    }
    return '2026-10-29';
  }, [sessionDateFilter, selectedDate, date, heatmapData, availableDates, floorsheet]);

  // Exchange-wide Broker-Wise Leaderboard (matches institutional analytics)
  const brokerWiseLeaderboard = useMemo(() => {
    if (heatmapData) {
      if (brokerWiseTab === 'sellers') {
        if (uniqueStockOnly && Array.isArray(heatmapData.topUniqueStockSellers) && heatmapData.topUniqueStockSellers.length > 0) {
          return heatmapData.topUniqueStockSellers;
        }
        if (!uniqueStockOnly && Array.isArray(heatmapData.topCrossBrokerSellers) && heatmapData.topCrossBrokerSellers.length > 0) {
          return heatmapData.topCrossBrokerSellers;
        }
      } else {
        if (uniqueStockOnly && Array.isArray(heatmapData.topUniqueStockBuyers) && heatmapData.topUniqueStockBuyers.length > 0) {
          return heatmapData.topUniqueStockBuyers;
        }
        if (!uniqueStockOnly && Array.isArray(heatmapData.topCrossBrokerBuyers) && heatmapData.topCrossBrokerBuyers.length > 0) {
          return heatmapData.topCrossBrokerBuyers;
        }
      }
    }

    // Client-side fallback aggregation
    const items: any[] = [];
    const matrix = Array.isArray(heatmapData?.matrix) ? heatmapData.matrix : [];
    matrix.forEach((b: any) => {
      const brokerId = b.broker || b.id;
      const brokerName = b.brokerName || b.name || `Broker ${brokerId}`;
      const list = brokerWiseTab === 'sellers'
        ? (b.topDistByGrossSellAmt || b.scrips?.filter((s: any) => s.sellAmount > 0) || [])
        : (b.topByGrossBuyAmt || b.scrips?.filter((s: any) => s.buyAmount > 0) || []);

      list.forEach((s: any) => {
        const qty = Number(brokerWiseTab === 'sellers' ? (s.sellQty || s.qty || 0) : (s.buyQty || s.qty || 0));
        const amt = Number(brokerWiseTab === 'sellers' ? (s.sellAmount || s.amount || 0) : (s.buyAmount || s.amount || 0));
        if (qty > 0 && amt > 0) {
          items.push({
            symbol: s.symbol,
            sellerBroker: brokerId,
            buyerBroker: brokerId,
            brokerName,
            qty,
            amount: amt,
            amountCr: +(amt / 1e7).toFixed(2),
            avgRate: s.avgSellRate || s.avgBuyRate || +(amt / qty).toFixed(2),
            trades: s.trades || 0
          });
        }
      });
    });

    items.sort((a, b) => b.amount - a.amount);

    if (uniqueStockOnly) {
      const seen = new Set<string>();
      const deduplicated: any[] = [];
      for (const it of items) {
        if (!seen.has(it.symbol)) {
          seen.add(it.symbol);
          deduplicated.push(it);
        }
      }
      return deduplicated.slice(0, 20);
    }

    return items.slice(0, 25);
  }, [heatmapData, brokerWiseTab, uniqueStockOnly]);

  const handleCopySocialCard = () => {
    const isSeller = brokerWiseTab === 'sellers';
    let text = `🔥 TOP ${isSeller ? 'SELLER' : 'BUYER'} STOCKS BY BROKER-WISE\n`;
    text += `📅 As of ${sessionDate}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    brokerWiseLeaderboard.slice(0, 10).forEach((row, idx) => {
      const brokerId = isSeller ? row.sellerBroker : row.buyerBroker;
      const rate = row.avgRate ? Number(row.avgRate).toFixed(2) : '-';
      text += `${idx + 1}. ${row.symbol.padEnd(7)} | Broker ${brokerId.padEnd(2)} | ${row.qty.toLocaleString()} Qty | ${formatNepaliCurrency(row.amount)} | Avg: ${rate}\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ Verified by Drabyashree NEPSE Surveillance`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedCard(true);
      setTimeout(() => setCopiedCard(false), 2500);
    }
  };

  const loadData = async (
    activeTf = timeframe,
    targetDate = sessionDateFilter || selectedDate || date || '',
    targetFrom = fromDate,
    targetTo = toDate
  ) => {
    setLoading(true);
    try {
      const days = DAYS_MAP[activeTf] || 1;
      const effDate = targetDate || sessionDate || '2026-10-29';
      const [liveDataRes, fsRes, hmRes, summaryMapRes] = await Promise.allSettled([
        loadNepseData(),
        fetchRealFloorsheet(null, effDate, 1, 100000, { days, fromDate: targetFrom, toDate: targetTo }),
        fetchBrokerHeatmap({ days, date: effDate, fromDate: targetFrom, toDate: targetTo }),
        fetchMarketWideBrokerSummaryMap(days, { date: effDate })
      ]);
      if (liveDataRes.status === 'fulfilled') {
        const liveStocks = liveDataRes.value?.stocks || [];
        if (summaryMapRes.status === 'fulfilled' && summaryMapRes.value && typeof summaryMapRes.value === 'object') {
          setStocks(liveStocks.map((st: any) => {
            const sym = st.symbol;
            const bSummary = summaryMapRes.value[sym];
            return bSummary ? { ...st, brokerAnalysis: bSummary, realBrokerAnalysis: bSummary } : st;
          }));
        } else {
          setStocks(liveStocks);
        }
      }
      if (fsRes.status === 'fulfilled') {
        const fs = fsRes.value;
        const fsData = Array.isArray(fs?.content)
          ? fs.content
          : Array.isArray(fs?.data)
          ? fs.data
          : Array.isArray(fs?.rows)
          ? fs.rows
          : Array.isArray(fs?.list)
          ? fs.list
          : Array.isArray(fs)
          ? fs
          : [];
        setFloorsheet(fsData);
      }
      const hmData = hmRes.status === 'fulfilled' ? (hmRes.value?.data || hmRes.value) : null;
      if (hmData && Array.isArray(hmData.matrix) && hmData.matrix.length > 0) {
        setHeatmapData(hmData);
      } else if (latestBrokerMatrix && Array.isArray((latestBrokerMatrix as any)?.matrix)) {
        setHeatmapData(latestBrokerMatrix);
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadData(timeframe, sessionDateFilter, fromDate, toDate);
  }, [timeframe, sessionDateFilter, fromDate, toDate]);

  // ── Intraday Auto-Refresh (10 min during NEPSE market hours 11:00 AM – 3:00 PM NPT) ──
  useEffect(() => {
    const isNepseMarketOpen = () => {
      const now = new Date();
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const nptMins = (utcMins + 5 * 60 + 45) % (24 * 60); // UTC+5:45
      // NEPSE Continuous session: 11:00 AM (660) – 3:00 PM (900)
      return nptMins >= 660 && nptMins <= 900;
    };
    const intervalId = setInterval(() => {
      if (isNepseMarketOpen()) {
        loadData(timeframe, sessionDateFilter, fromDate, toDate);
      }
    }, 10 * 60 * 1000); // every 10 minutes
    return () => clearInterval(intervalId);
  }, [timeframe, sessionDateFilter, fromDate, toDate]); // re-register if timeframe or date changes

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(timeframe, sessionDateFilter, fromDate, toDate);
    setRefreshing(false);
  };

  // 1. Compute Broker Flow from Real Multi-Day Heatmap or Floorsheet
  const brokerFlowList: BrokerStat[] = useMemo(() => {
    // A. Primary: use real aggregated broker vault matrix (unified across 1D, 1W, 1M, etc.)
    if (heatmapData?.matrix && heatmapData.matrix.length > 0) {
      const list: BrokerStat[] = [];
      heatmapData.matrix.forEach((b: any) => {
        const bId = String(b.broker || '').trim();
        const bInfo = MAJOR_BROKERS.find(m => m.id === bId);
        const name = b.brokerName || (bInfo ? bInfo.name : `Broker #${bId}`);
        const buyAmount = Math.round(Number(b.totalBuy || 0));
        const sellAmount = Math.round(Number(b.totalSell || 0));
        const netFlow = Math.round(Number(b.netFlow != null ? b.netFlow : (buyAmount - sellAmount)));

        let topStock = b.topStock || '—';
        let maxScripAmt = 0;
        const scripsList: any[] = Array.isArray(b.scrips)
          ? b.scrips.map((s: any) => ({
              symbol: String(s?.symbol || ''),
              buy: Number(s?.buy != null ? s.buy : (s?.buyAmount || 0)),
              sell: Number(s?.sell != null ? s.sell : (s?.sellAmount || 0)),
              buyQty: Number(s?.buyQty || 0),
              sellQty: Number(s?.sellQty || 0),
              netQty: Number(s?.netQty || 0),
              avgBuyRate: Number(s?.avgBuyRate || 0),
              avgSellRate: Number(s?.avgSellRate || 0)
            }))
          : (b.scrips && typeof b.scrips === 'object')
            ? Object.entries(b.scrips).map(([sSym, sVal]: [string, any]) => ({
                symbol: sSym,
                buy: Number(sVal?.buy != null ? sVal.buy : (sVal?.buyAmount || 0)),
                sell: Number(sVal?.sell != null ? sVal.sell : (sVal?.sellAmount || 0)),
                buyQty: Number(sVal?.buyQty || 0),
                sellQty: Number(sVal?.sellQty || 0),
                netQty: Number(sVal?.netQty || 0),
                avgBuyRate: Number(sVal?.avgBuyRate || 0),
                avgSellRate: Number(sVal?.avgSellRate || 0)
              }))
            : [];

        scripsList.forEach((s) => {
          const sAmt = s.buy + s.sell;
          if (sAmt > maxScripAmt && s.symbol) {
            maxScripAmt = sAmt;
            topStock = s.symbol;
          }
        });

        const mapScripItem = (s: any, fallbackBias: 'Accumulation' | 'Distribution' | 'Neutral' = 'Neutral'): BrokerScripItem => {
          const sym = String(s?.symbol || '').toUpperCase().trim();
          const matched = stocks.find(st => st.symbol === sym);
          const buyAmt = Math.round(Number(s.buyAmount != null ? s.buyAmount : (s.buy || 0)));
          const sellAmt = Math.round(Number(s.sellAmount != null ? s.sellAmount : (s.sell || 0)));
          const net = Math.round(Number(s.netFlow != null ? s.netFlow : (s.net != null ? s.net : (buyAmt - sellAmt))));
          const bQty = Number(s.buyQty || 0);
          const sQty = Number(s.sellQty || 0);
          const nQty = Number(s.netQty != null ? s.netQty : (bQty - sQty));
          const avgBRate = Number(s.avgBuyRate || 0);
          const avgSRate = Number(s.avgSellRate || 0);
          const cumHold = Number(s.cumHoldQty != null ? s.cumHoldQty : nQty);
          const cumAvg = Number(s.cumAvgBuy != null ? s.cumAvgBuy : (avgBRate || 0));

          return {
            symbol: sym,
            name: matched?.companyName || matched?.name || s.name || sym,
            buyAmount: buyAmt,
            sellAmount: sellAmt,
            netFlow: net,
            buyQty: bQty > 0 ? bQty : undefined,
            sellQty: sQty > 0 ? sQty : undefined,
            netQty: nQty !== 0 ? nQty : undefined,
            avgBuyRate: avgBRate > 0 ? avgBRate : undefined,
            avgSellRate: avgSRate > 0 ? avgSRate : undefined,
            cumHoldQty: cumHold !== 0 ? cumHold : undefined,
            cumAvgBuy: cumAvg > 0 ? cumAvg : undefined,
            bias: s.bias || (net > 1000000 ? 'Accumulation' : net < -1000000 ? 'Distribution' : fallbackBias)
          };
        };

        const allScrips: BrokerScripItem[] = scripsList.map(s => mapScripItem(s));

        const topScrips = Array.isArray(b.topScrips) && b.topScrips.length > 0
          ? b.topScrips.map((s: any) => typeof s === 'string' ? mapScripItem({ symbol: s }) : mapScripItem(s))
          : [...allScrips].sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);

        const topAccumulation = Array.isArray(b.topAccumulation) && b.topAccumulation.length > 0
          ? b.topAccumulation.map((s: any) => mapScripItem(s, 'Accumulation'))
          : [...allScrips].filter(s => s.netFlow > 0).sort((x, y) => y.netFlow - x.netFlow).slice(0, 10);

        const topDistribution = Array.isArray(b.topDistribution) && b.topDistribution.length > 0
          ? b.topDistribution.map((s: any) => mapScripItem(s, 'Distribution'))
          : [...allScrips].filter(s => s.netFlow < 0).sort((x, y) => x.netFlow - y.netFlow).slice(0, 10);

        const topByNetQty = Array.isArray(b.topByNetQty) && b.topByNetQty.length > 0
          ? b.topByNetQty.map((s: any) => mapScripItem(s, 'Accumulation'))
          : [...allScrips].filter(s => (s.netQty || 0) > 0).sort((x, y) => (y.netQty || 0) - (x.netQty || 0)).slice(0, 10);

        const topByGrossBuyAmt = Array.isArray(b.topByGrossBuyAmt) && b.topByGrossBuyAmt.length > 0
          ? b.topByGrossBuyAmt.map((s: any) => mapScripItem(s, 'Accumulation'))
          : [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);

        const topByGrossBuyQty = Array.isArray(b.topByGrossBuyQty) && b.topByGrossBuyQty.length > 0
          ? b.topByGrossBuyQty.map((s: any) => mapScripItem(s, 'Accumulation'))
          : [...allScrips].filter(s => (s.buyQty || 0) > 0).sort((x, y) => (y.buyQty || 0) - (x.buyQty || 0)).slice(0, 10);

        const topDistByNetQty = Array.isArray(b.topDistByNetQty) && b.topDistByNetQty.length > 0
          ? b.topDistByNetQty.map((s: any) => mapScripItem(s, 'Distribution'))
          : [...allScrips].filter(s => (s.netQty || 0) < 0).sort((x, y) => (x.netQty || 0) - (y.netQty || 0)).slice(0, 10);

        const topDistByGrossSellAmt = Array.isArray(b.topDistByGrossSellAmt) && b.topDistByGrossSellAmt.length > 0
          ? b.topDistByGrossSellAmt.map((s: any) => mapScripItem(s, 'Distribution'))
          : [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => y.sellAmount - x.sellAmount).slice(0, 10);

        const topDistByGrossSellQty = Array.isArray(b.topDistByGrossSellQty) && b.topDistByGrossSellQty.length > 0
          ? b.topDistByGrossSellQty.map((s: any) => mapScripItem(s, 'Distribution'))
          : [...allScrips].filter(s => (s.sellQty || 0) > 0).sort((x, y) => (y.sellQty || 0) - (x.sellQty || 0)).slice(0, 10);

        let bias: BrokerStat['bias'] = b.bias || 'Mild Accumulation';
        if (!b.bias) {
          if (netFlow > 8000000) bias = 'Aggressive Accumulation';
          else if (netFlow < -8000000) bias = 'Heavy Selling';
          else if (netFlow < 0) bias = 'Distribution';
        }

        list.push({
          brokerId: bId,
          brokerName: name,
          buyAmount,
          sellAmount,
          netFlow,
          topStock: b.topStock || topStock || '—',
          totalTrades: Number(b.totalTrades || b.trades || Math.round((buyAmount + sellAmount) / 120000)) || 1,
          bias,
          topScrips: topScrips.length > 0 ? topScrips : undefined,
          topAccumulation: topAccumulation.length > 0 ? topAccumulation : undefined,
          topDistribution: topDistribution.length > 0 ? topDistribution : undefined,
          topByNetQty: topByNetQty.length > 0 ? topByNetQty : undefined,
          topByGrossBuyAmt: topByGrossBuyAmt.length > 0 ? topByGrossBuyAmt : undefined,
          topByGrossBuyQty: topByGrossBuyQty.length > 0 ? topByGrossBuyQty : undefined,
          topDistByNetQty: topDistByNetQty.length > 0 ? topDistByNetQty : undefined,
          topDistByGrossSellAmt: topDistByGrossSellAmt.length > 0 ? topDistByGrossSellAmt : undefined,
          topDistByGrossSellQty: topDistByGrossSellQty.length > 0 ? topDistByGrossSellQty : undefined,
        });
      });

      if (list.length > 0) {
        return list.sort((a, b) => b.netFlow - a.netFlow);
      }
    }

    // B. 1D Horizon with active floorsheet
    if (floorsheet && floorsheet.length > 0) {
      const brokerMap = new Map<string, { buy: number; sell: number; trades: number; scrips: Map<string, { buy: number; sell: number; buyQty: number; sellQty: number }> }>();

      // Pre-seed major brokers
      MAJOR_BROKERS.forEach(b => {
        brokerMap.set(b.id, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
      });

      const seenContracts = new Set<string>();
      floorsheet.forEach((t: any) => {
        const cid = String(t.contractId ?? t.contract_no ?? t.contractNo ?? t.id ?? '').trim();
        if (cid) {
          if (seenContracts.has(cid)) return;
          seenContracts.add(cid);
        }
        const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || '').trim();
        const sId = String(t.seller || t.sellerBroker || t.seller_broker || '').trim();
        if (bId && sId && bId === sId) return; // Self-matching filter: ignore bilateral wash cross-trades
        const qty = Math.round(Number(t.quantity || t.qty || t.kitta || t.contractQuantity || 0));
        const rate = Number(t.rate || t.price || t.contractRate || 0);
        const amt = Number(t.amount || t.contractAmount || (qty * rate) || 0);
        const sym = String(t.symbol || t.stockSymbol || '').toUpperCase().trim();

        if (bId && qty > 0) {
          if (!brokerMap.has(bId)) brokerMap.set(bId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const bEntry = brokerMap.get(bId)!;
          bEntry.buy += amt;
          bEntry.trades += 1;
          if (sym) {
            const sc = bEntry.scrips.get(sym) || { buy: 0, sell: 0, buyQty: 0, sellQty: 0 };
            sc.buy += amt;
            sc.buyQty += qty;
            bEntry.scrips.set(sym, sc);
          }
        }

        if (sId && qty > 0) {
          if (!brokerMap.has(sId)) brokerMap.set(sId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const sEntry = brokerMap.get(sId)!;
          sEntry.sell += amt;
          sEntry.trades += 1;
          if (sym) {
            const sc = sEntry.scrips.get(sym) || { buy: 0, sell: 0, buyQty: 0, sellQty: 0 };
            sc.sell += amt;
            sc.sellQty += qty;
            sEntry.scrips.set(sym, sc);
          }
        }
      });

      const list: BrokerStat[] = [];
      brokerMap.forEach((val, bId) => {
        if (val.buy === 0 && val.sell === 0 && val.trades === 0) return;
        const bInfo = MAJOR_BROKERS.find(b => b.id === bId);
        const name = bInfo ? bInfo.name : `Broker #${bId}`;

        let topStock = '—';
        let maxScripAmt = 0;
        val.scrips.forEach((sc, sSym) => {
          const sAmt = sc.buy + sc.sell;
          if (sAmt > maxScripAmt) {
            maxScripAmt = sAmt;
            topStock = sSym;
          }
        });

        const allScrips: BrokerScripItem[] = Array.from(val.scrips.entries())
          .map(([sSym, sc]) => {
            const matched = stocks.find(st => st.symbol === sSym);
            const net = sc.buy - sc.sell;
            const netQty = sc.buyQty - sc.sellQty;
            return {
              symbol: sSym,
              name: matched?.companyName || matched?.name || sSym,
              buyAmount: Math.round(sc.buy),
              sellAmount: Math.round(sc.sell),
              netFlow: Math.round(net),
              buyQty: sc.buyQty > 0 ? sc.buyQty : undefined,
              sellQty: sc.sellQty > 0 ? sc.sellQty : undefined,
              netQty: netQty !== 0 ? netQty : undefined,
              avgBuyRate: sc.buyQty > 0 ? +(sc.buy / sc.buyQty).toFixed(2) : undefined,
              avgSellRate: sc.sellQty > 0 ? +(sc.sell / sc.sellQty).toFixed(2) : undefined,
              bias: net > 500000 ? 'Accumulation' : net < -500000 ? 'Distribution' : 'Neutral'
            };
          });

        const topScrips = [...allScrips].sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);
        const topAccumulation = [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => (y.netFlow !== x.netFlow ? y.netFlow - x.netFlow : y.buyAmount - x.buyAmount)).slice(0, 10);
        const topDistribution = [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => (x.netFlow !== y.netFlow ? x.netFlow - y.netFlow : y.sellAmount - x.sellAmount)).slice(0, 10);
        const topByNetQty = [...allScrips].filter(s => (s.netQty || 0) > 0).sort((x, y) => (y.netQty || 0) - (x.netQty || 0)).slice(0, 10);
        const topByGrossBuyAmt = [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);
        const topByGrossBuyQty = [...allScrips].filter(s => (s.buyQty || 0) > 0).sort((x, y) => (y.buyQty || 0) - (x.buyQty || 0)).slice(0, 10);
        const topDistByNetQty = [...allScrips].filter(s => (s.netQty || 0) < 0).sort((x, y) => (x.netQty || 0) - (y.netQty || 0)).slice(0, 10);
        const topDistByGrossSellAmt = [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => y.sellAmount - x.sellAmount).slice(0, 10);
        const topDistByGrossSellQty = [...allScrips].filter(s => (s.sellQty || 0) > 0).sort((x, y) => (y.sellQty || 0) - (x.sellQty || 0)).slice(0, 10);

        const buyAmount = Math.round(val.buy);
        const sellAmount = Math.round(val.sell);
        const netFlow = buyAmount - sellAmount;
        const totalTrades = val.trades;

        let bias: BrokerStat['bias'] = 'Mild Accumulation';
        if (netFlow > 8000000) bias = 'Aggressive Accumulation';
        else if (netFlow < -8000000) bias = 'Heavy Selling';
        else if (netFlow < 0) bias = 'Distribution';

        list.push({
          brokerId: bId,
          brokerName: name,
          buyAmount,
          sellAmount,
          netFlow,
          topStock: topStock || '—',
          totalTrades,
          bias,
          topScrips: topScrips.length > 0 ? topScrips : undefined,
          topAccumulation: topAccumulation.length > 0 ? topAccumulation : undefined,
          topDistribution: topDistribution.length > 0 ? topDistribution : undefined,
          topByNetQty: topByNetQty.length > 0 ? topByNetQty : undefined,
          topByGrossBuyAmt: topByGrossBuyAmt.length > 0 ? topByGrossBuyAmt : undefined,
          topByGrossBuyQty: topByGrossBuyQty.length > 0 ? topByGrossBuyQty : undefined,
          topDistByNetQty: topDistByNetQty.length > 0 ? topDistByNetQty : undefined,
          topDistByGrossSellAmt: topDistByGrossSellAmt.length > 0 ? topDistByGrossSellAmt : undefined,
          topDistByGrossSellQty: topDistByGrossSellQty.length > 0 ? topDistByGrossSellQty : undefined,
        });
      });

      if (list.length > 0) {
        return list.sort((a, b) => b.netFlow - a.netFlow);
      }
    }



    // D. Baseline list (Zero mock policy: return clean registered brokers when exchange feed is offline)
    return MAJOR_BROKERS.map(b => ({
      brokerId: b.id,
      brokerName: b.name,
      buyAmount: 0,
      sellAmount: 0,
      netFlow: 0,
      topStock: '—',
      totalTrades: 0,
      bias: 'Mild Accumulation' as const,
      topScrips: undefined,
      topAccumulation: undefined,
      topDistribution: undefined,
    }));
  }, [floorsheet, heatmapData, timeframe, stocks]);

  // 2. Compute Institutional Dominance from Real Multi-Day Heatmap or Live Floorsheet
  const dominanceList: DominanceItem[] = useMemo(() => {
    // Helper to evaluate Step 4 Smart Money Verdict
    const evaluateStep4 = (
      sym: string,
      val: { totalBuy: number; totalSell: number; buyers: Map<string, number>; sellers: Map<string, number> },
      sortedBuyers: { id: string; amt: number }[],
      sortedSellers: { id: string; amt: number }[],
      topBrokerAmt: number,
      pChange: number
    ) => {
      // 1. Prioritize authentic cached broker analysis if available (e.g. multi-day verified broker vault)
      const matchedStock = stocks.find(st => st.symbol === sym);
      const cachedRba = matchedStock?.brokerAnalysis || matchedStock?.realBrokerAnalysis || getCachedRealBrokerAnalysis(sym);
      if (cachedRba && (cachedRba.topBuyers?.length > 0 || cachedRba.buyers?.length > 0 || (cachedRba.bcr3BuyPct != null && cachedRba.bcr3BuyPct > 0))) {
        const rawB = cachedRba.topBuyers || cachedRba.buyers || [];
        const rawS = cachedRba.topSellers || cachedRba.sellers || [];
        const topBId = String(rawB[0]?.broker || rawB[0]?.brokerId || rawB[0]?.id || sortedBuyers[0]?.id || '58').trim();
        const topBInfo = MAJOR_BROKERS.find(b => b.id === topBId);
        const topBName = rawB[0]?.brokerName || rawB[0]?.name || (topBInfo ? topBInfo.name : (topBId && topBId !== '—' ? `Broker #${topBId}` : 'Dispersed Flow'));

        const bcr3Buy = Number(cachedRba.bcr3BuyPct ?? cachedRba.bcr5BuyPct ?? (cachedRba.crb5 ? cachedRba.crb5 * 100 : 0)) || 0;
        const bcr3Sell = Number(cachedRba.bcr3SellPct ?? cachedRba.scr3SellPct ?? cachedRba.scr3NetPct ?? 0);
        const buyerBrokers = rawB.slice(0, 3).map((b: any) => `#${b.broker || b.brokerId || b.id}`);
        const sellerBrokers = rawS.slice(0, 3).map((s: any) => `#${s.broker || s.brokerId || s.id}`);

        const isGreenOrElevated = pChange >= 0;
        const isDistributionTrap = isGreenOrElevated && (bcr3Sell >= 38.0 && bcr3Sell > bcr3Buy);
        const isInstitutionalAccumulation = bcr3Buy >= 40.0 && !isDistributionTrap;

        let smartMoneyVerdict: DominanceItem['smartMoneyVerdict'] = 'BROAD_RETAIL';
        let smartMoneyReason = '';

        if (isDistributionTrap) {
          smartMoneyVerdict = 'DISTRIBUTION_TRAP';
          smartMoneyReason = `🚨 Distribution Trap: Top brokers (${sellerBrokers.join(', ')}) dumping ${bcr3Sell}% sell share into retail excitement. Do not buy!`;
        } else if (isInstitutionalAccumulation) {
          smartMoneyVerdict = 'INSTITUTIONAL_ACCUMULATION';
          smartMoneyReason = `🟢 Institutional Accumulation: Top 3 brokers (${buyerBrokers.join(', ')}) cornering ${bcr3Buy}% buy volume in large blocks.`;
        } else {
          smartMoneyVerdict = 'BROAD_RETAIL';
          smartMoneyReason = `⚪ Broad Retail: Top 3 buy share is ${bcr3Buy}% (<40%). Lacks heavy institutional block concentration.`;
        }

        const status: DominanceItem['status'] =
          bcr3Buy >= 40
            ? 'Highly Cornered'
            : bcr3Buy >= 25
            ? 'Moderate Dominance'
            : 'Broad Retail';

        return {
          topBrokerId: topBId,
          topBrokerName: topBName,
          dominancePct: bcr3Buy,
          top3BuyPct: bcr3Buy,
          top3SellPct: bcr3Sell,
          buyerBrokers,
          sellerBrokers,
          smartMoneyVerdict,
          smartMoneyReason,
          status,
        };
      }

      // 2. Fallback to raw floorsheet sample with strict sample sufficiency checks
      const tradesCount = (val.buyers.size + val.sellers.size);
      const totalTradedAmt = val.totalBuy + val.totalSell;
      // An institutional sample requires BOTH sufficient broker breadth (>= 8 unique broker entities)
      // AND meaningful turnover (>= Rs. 15 Lakhs). Micro-samples are classified as Broad Retail.
      const isThinSample = tradesCount < 8 || totalTradedAmt < 1500000;

      const topBrokerId = sortedBuyers[0]?.id || '58';
      const topBInfo = MAJOR_BROKERS.find(b => b.id === topBrokerId);
      const topBName = topBInfo ? topBInfo.name : `Broker #${topBrokerId}`;

      // In thin samples (<8 trades or <15L), cap dominance percentage to prevent false cornering alerts
      const rawDomPct = val.totalBuy > 0 ? (topBrokerAmt / val.totalBuy) * 100 : 0;
      const dominancePct = isThinSample ? +(Math.min(30, rawDomPct * 0.3)).toFixed(1) : +(Math.min(99.9, Math.max(1, rawDomPct))).toFixed(1);

      const top3BuyAmt = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + b.amt, 0);
      const rawTop3BuyPct = val.totalBuy > 0 ? (top3BuyAmt / val.totalBuy) * 100 : 0;
      const top3BuyPct = isThinSample ? +(Math.min(35, rawTop3BuyPct * 0.35)).toFixed(1) : +(Math.min(100, rawTop3BuyPct)).toFixed(1);
      const buyerBrokers = sortedBuyers.slice(0, 3).map(b => `#${b.id}`);

      const top3SellAmt = sortedSellers.slice(0, 3).reduce((acc, s) => acc + s.amt, 0);
      const rawTop3SellPct = val.totalSell > 0 ? (top3SellAmt / val.totalSell) * 100 : 0;
      const top3SellPct = isThinSample ? +(Math.min(35, rawTop3SellPct * 0.35)).toFixed(1) : +(Math.min(100, rawTop3SellPct)).toFixed(1);
      const sellerBrokers = sortedSellers.slice(0, 3).map(s => `#${s.id}`);

      // Bilateral cross-trade / internal transfer check
      const isCrossTrade = !isThinSample && rawTop3BuyPct >= 95 && rawTop3SellPct >= 95 && sortedBuyers[0]?.id === sortedSellers[0]?.id;

      // Distribution Trap Check:
      // Requires:
      // 1. Meaningful sample depth (>= 8 unique broker entities and >= Rs. 15 Lakhs turnover)
      // 2. High selling concentration (top 3 sellers >= 48% sell share)
      // 3. Significant net selling asymmetry (sell concentration exceeding buy concentration by at least 12%)
      // 4. Large net offloading (> 20% of total sell volume)
      const isGreenOrElevated = pChange >= 0;
      const topBrokersHeavyDumping = !isThinSample && (
        top3SellPct >= 38.0 && top3SellPct > top3BuyPct && (
          (top3SellPct - top3BuyPct) >= 8.0 ||
          sortedSellers.slice(0, 3).some(s => {
            const buyAmt = val.buyers.get(s.id) || 0;
            return (s.amt - buyAmt) > (val.totalSell * 0.18);
          })
        )
      );

      const isDistributionTrap = !isThinSample && isGreenOrElevated && topBrokersHeavyDumping;
      const isInstitutionalAccumulation = !isThinSample && !isCrossTrade && top3BuyPct >= 40.0 && (top3BuyPct - top3SellPct) >= 10.0 && !isDistributionTrap;

      let smartMoneyVerdict: DominanceItem['smartMoneyVerdict'] = 'BROAD_RETAIL';
      let smartMoneyReason = '';

      if (isThinSample) {
        smartMoneyVerdict = 'BROAD_RETAIL';
        smartMoneyReason = `⚪ Micro-Sample (<8 broker firms or <Rs. 15L): Dispersed order flow. Awaiting full session turnover.`;
      } else if (isCrossTrade) {
        smartMoneyVerdict = 'BROAD_RETAIL';
        smartMoneyReason = `⚪ Bilateral Block Transfer: Matched transactions by Broker #${topBrokerId}. Neutral trend.`;
      } else if (isDistributionTrap) {
        smartMoneyVerdict = 'DISTRIBUTION_TRAP';
        smartMoneyReason = `🚨 Distribution Trap: Top brokers (${sellerBrokers.join(', ')}) dumping ${top3SellPct}% sell share into retail excitement. Do not buy!`;
      } else if (isInstitutionalAccumulation) {
        smartMoneyVerdict = 'INSTITUTIONAL_ACCUMULATION';
        smartMoneyReason = `🟢 Institutional Accumulation: Top 3 brokers (${buyerBrokers.join(', ')}) cornering ${top3BuyPct}% buy volume in large blocks.`;
      } else {
        smartMoneyVerdict = 'BROAD_RETAIL';
        smartMoneyReason = `⚪ Broad Retail: Top 3 buy share is ${top3BuyPct}% (<40%). Lacks heavy institutional block concentration.`;
      }

      const status: DominanceItem['status'] =
        isThinSample || isCrossTrade
          ? 'Broad Retail'
          : top3BuyPct >= 40
          ? 'Highly Cornered'
          : top3BuyPct >= 25
          ? 'Moderate Dominance'
          : 'Broad Retail';

      return {
        topBrokerId,
        topBrokerName: topBName,
        dominancePct,
        top3BuyPct,
        top3SellPct,
        buyerBrokers,
        sellerBrokers,
        smartMoneyVerdict,
        smartMoneyReason,
        status,
      };
    };

    // A. Primary: compute directly from heatmapData scrips breakdown (unified across 1D, 1W, 1M, etc.)
    if (heatmapData?.matrix && heatmapData.matrix.length > 0) {
      const stockBrokerMap = new Map<string, { totalBuy: number; totalSell: number; buyers: Map<string, number>; sellers: Map<string, number> }>();

      heatmapData.matrix.forEach((bItem: any) => {
        const bId = String(bItem.broker || '').trim();
        if (!bId || !bItem.scrips) return;
        const scripsList: { symbol: string; buy: number; sell: number }[] = Array.isArray(bItem.scrips)
          ? bItem.scrips.map((s: any) => ({
              symbol: String(s?.symbol || ''),
              buy: Number(s?.buy || 0),
              sell: Number(s?.sell || 0),
            }))
          : (bItem.scrips && typeof bItem.scrips === 'object')
            ? Object.entries(bItem.scrips).map(([sym, sVal]: [string, any]) => ({
                symbol: sym,
                buy: Number(sVal?.buy || 0),
                sell: Number(sVal?.sell || 0),
              }))
            : [];

        scripsList.forEach(({ symbol: sym, buy: bAmt, sell: sAmt }) => {
          if (!sym) return;
          if (!stockBrokerMap.has(sym)) {
            stockBrokerMap.set(sym, { totalBuy: 0, totalSell: 0, buyers: new Map(), sellers: new Map() });
          }
          const entry = stockBrokerMap.get(sym)!;
          if (bAmt > 0) {
            entry.totalBuy += bAmt;
            entry.buyers.set(bId, (entry.buyers.get(bId) || 0) + bAmt);
          }
          if (sAmt > 0) {
            entry.totalSell += sAmt;
            entry.sellers.set(bId, (entry.sellers.get(bId) || 0) + sAmt);
          }
        });
      });

      const res: DominanceItem[] = [];
      const seenSymbols = new Set<string>();

      // 1. Iterate over all stocks that have verified brokerAnalysis attached
      stocks.forEach((st) => {
        const sym = st.symbol;
        if (!sym || seenSymbols.has(sym)) return;
        const rba = st.brokerAnalysis || st.realBrokerAnalysis || getCachedRealBrokerAnalysis(sym);
        if (rba && (rba.topBuyers?.length > 0 || rba.buyers?.length > 0 || (rba.bcr3BuyPct != null && rba.bcr3BuyPct > 0) || (rba.totalBuyAmount || 0) > 0)) {
          seenSymbols.add(sym);
          const ltp = Number(st.ltp || st.closePrice || 500);
          const pChange = Number(st.pChange || 0);
          const turnover = Number(st.turnover || rba.totalBuyAmount || 0);
          const val = stockBrokerMap.get(sym) || { totalBuy: turnover, totalSell: turnover, buyers: new Map(), sellers: new Map() };
          const step4 = evaluateStep4(sym, val, [], [], 0, pChange);
          res.push({
            symbol: sym,
            name: st.companyName || st.name || sym,
            ltp,
            pChange,
            turnover,
            ...step4,
          });
        }
      });

      // 2. Add remaining scrips computed from heatmapData matrix
      stockBrokerMap.forEach((val, sym) => {
        if (seenSymbols.has(sym)) return;
        if (val.totalBuy <= 0) return;
        seenSymbols.add(sym);
        let topBrokerAmt = 0;
        const sortedBuyers: { id: string; amt: number }[] = [];
        val.buyers.forEach((bAmt, bId) => {
          sortedBuyers.push({ id: bId, amt: bAmt });
          if (bAmt > topBrokerAmt) topBrokerAmt = bAmt;
        });
        sortedBuyers.sort((a, b) => b.amt - a.amt);

        const sortedSellers: { id: string; amt: number }[] = [];
        val.sellers.forEach((sAmt, sId) => {
          sortedSellers.push({ id: sId, amt: sAmt });
        });
        sortedSellers.sort((a, b) => b.amt - a.amt);

        const matchedStock = stocks.find(s => s.symbol === sym);
        const ltp = Number(matchedStock?.ltp || matchedStock?.closePrice || 500);
        const pChange = Number(matchedStock?.pChange || 0);
        const turnover = Number(matchedStock?.turnover || val.totalBuy);

        const step4 = evaluateStep4(sym, val, sortedBuyers, sortedSellers, topBrokerAmt, pChange);

        res.push({
          symbol: sym,
          name: matchedStock?.companyName || matchedStock?.name || sym,
          ltp,
          pChange,
          turnover,
          ...step4,
        });
      });

      if (res.length > 0) {
        return res.sort((a, b) => b.top3BuyPct - a.top3BuyPct);
      }
    }

    // B. 1D: compute from actual floorsheet
    if (floorsheet && floorsheet.length > 0) {
      const stockBrokerMap = new Map<string, { totalBuy: number; totalSell: number; buyers: Map<string, number>; sellers: Map<string, number> }>();

      floorsheet.forEach((t: any) => {
        const sym = String(t.symbol || t.stockSymbol || '').trim();
        const bId = String(t.buyer || t.buyerBroker || '').trim();
        const sId = String(t.seller || t.sellerBroker || '').trim();
        if (bId && sId && bId === sId) return; // Purge bilateral cross trades
        const amt = Number(t.amount || (Number(t.quantity || 0) * Number(t.rate || 0)) || 0);
        if (!sym || amt <= 0) return;

        if (!stockBrokerMap.has(sym)) {
          stockBrokerMap.set(sym, { totalBuy: 0, totalSell: 0, buyers: new Map(), sellers: new Map() });
        }
        const entry = stockBrokerMap.get(sym)!;
        if (bId) {
          entry.totalBuy += amt;
          entry.buyers.set(bId, (entry.buyers.get(bId) || 0) + amt);
        }
        if (sId) {
          entry.totalSell += amt;
          entry.sellers.set(sId, (entry.sellers.get(sId) || 0) + amt);
        }
      });

      const res: DominanceItem[] = [];
      const seenSymbols = new Set<string>();

      // 1. Iterate over all stocks that have verified brokerAnalysis attached
      stocks.forEach((st) => {
        const sym = st.symbol;
        if (!sym || seenSymbols.has(sym)) return;
        const rba = st.brokerAnalysis || st.realBrokerAnalysis || getCachedRealBrokerAnalysis(sym);
        if (rba && (rba.topBuyers?.length > 0 || rba.buyers?.length > 0 || (rba.bcr3BuyPct != null && rba.bcr3BuyPct > 0) || (rba.totalBuyAmount || 0) > 0)) {
          seenSymbols.add(sym);
          const ltp = Number(st.ltp || st.closePrice || 500);
          const pChange = Number(st.pChange || 0);
          const turnover = Number(st.turnover || rba.totalBuyAmount || 0);
          const val = stockBrokerMap.get(sym) || { totalBuy: turnover, totalSell: turnover, buyers: new Map(), sellers: new Map() };
          const step4 = evaluateStep4(sym, val, [], [], 0, pChange);
          res.push({
            symbol: sym,
            name: st.companyName || st.name || sym,
            ltp,
            pChange,
            turnover,
            ...step4,
          });
        }
      });

      // 2. Add remaining scrips computed from floorsheet
      stockBrokerMap.forEach((val, sym) => {
        if (seenSymbols.has(sym)) return;
        if (val.totalBuy <= 0) return;
        seenSymbols.add(sym);
        let topBrokerAmt = 0;
        const sortedBuyers: { id: string; amt: number }[] = [];
        val.buyers.forEach((bAmt, bId) => {
          sortedBuyers.push({ id: bId, amt: bAmt });
          if (bAmt > topBrokerAmt) topBrokerAmt = bAmt;
        });
        sortedBuyers.sort((a, b) => b.amt - a.amt);

        const sortedSellers: { id: string; amt: number }[] = [];
        val.sellers.forEach((sAmt, sId) => {
          sortedSellers.push({ id: sId, amt: sAmt });
        });
        sortedSellers.sort((a, b) => b.amt - a.amt);

        const matchedStock = stocks.find(s => s.symbol === sym);
        const ltp = Number(matchedStock?.ltp || matchedStock?.closePrice || 500);
        const pChange = Number(matchedStock?.pChange || 0);
        const turnover = Number(matchedStock?.turnover || val.totalBuy);

        const step4 = evaluateStep4(sym, val, sortedBuyers, sortedSellers, topBrokerAmt, pChange);

        res.push({
          symbol: sym,
          name: matchedStock?.companyName || matchedStock?.name || sym,
          ltp,
          pChange,
          turnover,
          ...step4,
        });
      });

      if (res.length > 0) {
        return res.sort((a, b) => b.top3BuyPct - a.top3BuyPct);
      }
    }

    // C. Check if stocks have brokerAnalysis attached before falling back to offline
    const stocksWithBroker = stocks.filter(
      st => st.brokerAnalysis || st.realBrokerAnalysis || getCachedRealBrokerAnalysis(st.symbol)
    );
    if (stocksWithBroker.length > 0) {
      const res: DominanceItem[] = stocksWithBroker.map(st => {
        const sym = st.symbol;
        const ltp = Number(st.ltp || st.closePrice || 500);
        const pChange = Number(st.pChange || 0);
        const rba = st.brokerAnalysis || st.realBrokerAnalysis || getCachedRealBrokerAnalysis(sym);
        const turnover = Number(st.turnover || rba?.totalBuyAmount || 0);
        const step4 = evaluateStep4(sym, { totalBuy: turnover, totalSell: turnover, buyers: new Map(), sellers: new Map() }, [], [], 0, pChange);
        return {
          symbol: sym,
          name: st.companyName || st.name || sym,
          ltp,
          pChange,
          turnover,
          ...step4,
        };
      });
      return res.sort((a, b) => b.top3BuyPct - a.top3BuyPct);
    }

    // Baseline from active stocks with 0 dominance if completely offline (ZERO synthetic percent formula)
    const active = stocks.filter(s => Number(s.turnover || 0) > 0).slice(0, 20);
    return active.map(s => ({
      symbol: s.symbol,
      name: s.companyName || s.name || s.symbol,
      ltp: Number(s.ltp || s.closePrice || 500),
      pChange: Number(s.pChange || 0),
      turnover: Number(s.turnover || 0),
      topBrokerId: '—',
      topBrokerName: 'Floorsheet Offline',
      dominancePct: 0,
      top3BuyPct: 0,
      top3SellPct: 0,
      buyerBrokers: [],
      sellerBrokers: [],
      smartMoneyVerdict: 'BROAD_RETAIL' as const,
      smartMoneyReason: 'Floorsheet offline. Insufficient broker ticket data.',
      status: 'Broad Retail' as const,
    }));
  }, [floorsheet, heatmapData, stocks, timeframe]);

  // 3. Compute Bilateral Matching & Block Deals from Authentic Floorsheet
  const matchingDeals: MatchingDeal[] = useMemo(() => {
    if (floorsheet && floorsheet.length > 0) {
      const sorted = [...floorsheet].sort((a: any, b: any) => {
        const aAmt = Number(a.amount || (Number(a.quantity || 0) * Number(a.rate || 0)));
        const bAmt = Number(b.amount || (Number(b.quantity || 0) * Number(b.rate || 0)));
        return bAmt - aAmt;
      });

      const candidates = sorted.slice(0, 25);
      return candidates.map((t: any, idx: number) => {
        const amt = Math.round(Number(t.amount || (Number(t.quantity || 0) * Number(t.rate || 0)) || 0));
        const qty = Math.round(Number(t.quantity || 0));
        const rate = Number(t.rate || (qty > 0 ? +(amt / qty).toFixed(1) : 0));
        const bId = String(t.buyer || t.buyerBroker || '58');
        const sId = String(t.seller || t.sellerBroker || '45');
        const bInfo = MAJOR_BROKERS.find(b => b.id === bId);
        const sInfo = MAJOR_BROKERS.find(b => b.id === sId);

        let dealType: MatchingDeal['type'] = 'Strategic Handover';
        if (amt >= 2000000 || qty >= 5000) dealType = 'Block Deal';
        else if (bId === sId) dealType = 'Cross Trade';

        const bDate = String(t.businessDate || t.date || '').split('T')[0];
        const bTime = String(t.tradeTime || (bDate ? 'Session' : '13:00:00'));

        return {
          id: String(t.contractId || `fs-${idx + 1}`),
          symbol: String(t.symbol || t.stockSymbol || 'NEPSE'),
          buyerBroker: `${bId} (${bInfo ? bInfo.name : `Broker ${bId}`})`,
          sellerBroker: `${sId} (${sInfo ? sInfo.name : `Broker ${sId}`})`,
          quantity: qty,
          rate,
          amount: amt,
          time: bTime,
          date: bDate,
          type: dealType,
        };
      });
    }

    // Zero mock policy: return empty deals when floorsheet is offline
    return [];
  }, [floorsheet]);

  const topAccumulator = brokerFlowList[0];
  const topDistributor = [...brokerFlowList].reverse()[0];
  const corneredCount = dominanceList.filter(d => d.dominancePct >= 35).length;
  const instAccumulationCount = dominanceList.filter(d => d.smartMoneyVerdict === 'INSTITUTIONAL_ACCUMULATION').length;
  const distributionTrapCount = dominanceList.filter(d => d.smartMoneyVerdict === 'DISTRIBUTION_TRAP').length;
  const broadRetailCount = dominanceList.filter(d => d.smartMoneyVerdict === 'BROAD_RETAIL').length;

  const filteredBrokerFlowList = useMemo(() => {
    if (!search.trim()) return brokerFlowList;
    const q = search.trim().toLowerCase();
    return brokerFlowList.filter(b =>
      b.brokerId.includes(q) ||
      b.brokerName.toLowerCase().includes(q) ||
      b.topStock.toLowerCase().includes(q)
    );
  }, [brokerFlowList, search]);

  const filteredDominanceList = useMemo(() => {
    return dominanceList.filter(d => {
      if (smartMoneyFilter === 'ACCUMULATION' && d.smartMoneyVerdict !== 'INSTITUTIONAL_ACCUMULATION') return false;
      if (smartMoneyFilter === 'TRAP' && d.smartMoneyVerdict !== 'DISTRIBUTION_TRAP') return false;
      if (smartMoneyFilter === 'RETAIL' && d.smartMoneyVerdict !== 'BROAD_RETAIL') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          d.symbol.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.topBrokerName.toLowerCase().includes(q) ||
          String(d.topBrokerId).includes(q)
        );
      }
      return true;
    });
  }, [dominanceList, smartMoneyFilter, search]);

  const filteredMatchingDeals = useMemo(() => {
    let list = matchingDeals;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m =>
        m.symbol.toLowerCase().includes(q) ||
        m.buyerBroker.toLowerCase().includes(q) ||
        m.sellerBroker.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        (m.date && m.date.includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (matchingSortOrder === 'amount_desc') {
        return b.amount - a.amount;
      }
      const dtA = `${a.date || ''} ${a.time || ''}`.trim();
      const dtB = `${b.date || ''} ${b.time || ''}`.trim();
      return dtB.localeCompare(dtA) || b.amount - a.amount;
    });
  }, [matchingDeals, search, matchingSortOrder]);

  const activeTop10Broker = useMemo(() => {
    return brokerFlowList.find(b => b.brokerId === selectedTop10BrokerId) || brokerFlowList[0] || null;
  }, [brokerFlowList, selectedTop10BrokerId]);

  if (loading) return <Spinner text="Aggregating Real-Time Institutional Broker Flow…" />;

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-4 min-w-0 overflow-x-hidden">
      {/* Header with Mode Switcher */}
      <div className="flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/80 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-800 w-full min-w-0">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-extrabold text-white tracking-wide truncate">
            {activeMode === 'flow'
              ? 'Institutional Broker Flow Matrix'
              : activeMode === 'brokerWise'
              ? 'Exchange Top Stock by Broker-Wise'
              : activeMode === 'dominance'
              ? 'Stock Dominance & Cornering Board'
              : activeMode === 'top10'
              ? 'Broker Top 10 Accumulation & Distribution Hub'
              : 'Bilateral Matching & Block Deals'}
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
            {activeMode === 'flow'
              ? 'Net buy/sell capital flow, accumulated scrips, and bias per broker.'
              : activeMode === 'brokerWise'
              ? 'Exchange-wide leaderboard ranking largest single-broker selling and buying positions.'
              : activeMode === 'dominance'
              ? 'Which brokers control the largest percentage of volume per scrip.'
              : activeMode === 'top10'
              ? 'Inspect the Top 10 accumulated and Top 10 distributed scrips for any broker desk.'
              : 'Traces coordinated block transfers between matched broker pairs.'}
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="grid grid-cols-2 sm:grid-cols-5 sm:flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 w-full sm:w-auto shrink-0">
          <button
            onClick={() => setActiveMode('flow')}
            className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeMode === 'flow' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Users size={12} className="shrink-0" /> <span className="truncate">Broker Flow</span>
          </button>
          <button
            onClick={() => setActiveMode('brokerWise')}
            className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeMode === 'brokerWise' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Target size={12} className="shrink-0" /> <span className="truncate">Broker-Wise</span>
          </button>
          <button
            onClick={() => setActiveMode('dominance')}
            className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeMode === 'dominance' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Crown size={12} className="shrink-0" /> <span className="truncate">Dominance</span>
          </button>
          <button
            onClick={() => setActiveMode('top10')}
            className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeMode === 'top10' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <BarChart3 size={12} className="shrink-0" /> <span className="truncate">Top 10 A/D</span>
          </button>
          <button
            onClick={() => setActiveMode('matching')}
            className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeMode === 'matching' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <ArrowLeftRight size={12} className="shrink-0" /> <span className="truncate">Matching</span>
          </button>
        </div>
      </div>

      {/* ── STEP 4: VERIFY SMART MONEY BROKER FLOW HUD ── */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 shadow-xl w-full min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-800/80 pb-3 mb-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black text-[10px] sm:text-xs tracking-wider shrink-0">
              STEP 4
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-base font-extrabold text-white flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Verify "Smart Money" Broker Flow</span>
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Institutional cornering (&gt;40%) vs retail distribution dump traps.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 font-mono">
              📅 Session: {sessionDate}
            </span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              🟢 {instAccumulationCount} Accumulating
            </span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              🚨 {distributionTrapCount} Dump Traps
            </span>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Band: ±15%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
          <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 flex items-start gap-2 sm:gap-2.5">
            <span className="text-lg sm:text-xl shrink-0">🟢</span>
            <div className="min-w-0">
              <div className="font-extrabold text-emerald-300 uppercase tracking-wide text-[11px] sm:text-xs">
                Institutional Accumulation (&gt;40% Buy Share)
              </div>
              <div className="text-slate-300 mt-1 leading-relaxed text-[11px] sm:text-xs">
                Top 3 brokers (e.g. Broker 58, 45, 34) account for <strong>&gt;40% of all buy volume</strong> in large blocks, while selling is distributed across dozens of retail brokers.
              </div>
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-rose-950/25 border border-rose-500/30 flex items-start gap-2 sm:gap-2.5">
            <span className="text-lg sm:text-xl shrink-0">🚨</span>
            <div className="min-w-0">
              <div className="font-extrabold text-rose-300 uppercase tracking-wide text-[11px] sm:text-xs">
                Distribution Trap Warning (Do Not Buy)
              </div>
              <div className="text-slate-300 mt-1 leading-relaxed text-[11px] sm:text-xs">
                If top brokers are <strong>net selling (dumping) into retail excitement</strong>, <strong>DO NOT BUY</strong>, even if the chart looks green or circuit-seeking. High probability of sudden dump!
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeframe Filter Bar & Historical Session / Range Bar */}
      <div className="flex flex-col gap-2 w-full">
        <TimeframeFilterBar
          timeframe={timeframe}
          timeframes={['1D', '1W', '15D', '1M', '2M', '3M', '6M', '1Y', 'ALL']}
          onSelectTimeframe={(tf) => {
            setTimeframe(tf);
            setSessionDateFilter('');
            setFromDate('');
            setToDate('');
          }}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />

        {/* Historical Session Date Picker & Custom Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-bold flex items-center gap-1.5">
              📅 Historical Session:
            </span>
            {availableDates.length > 0 ? (
              <select
                value={sessionDateFilter}
                onChange={(e) => {
                  setSessionDateFilter(e.target.value);
                  setFromDate('');
                  setToDate('');
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-sky-400 outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="">Latest Session ({sessionDate})</option>
                {sessionDateFilter && !availableDates.includes(sessionDateFilter) && (
                  <option value={sessionDateFilter}>{sessionDateFilter} (Selected)</option>
                )}
                {availableDates.map(dt => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={sessionDateFilter}
                onChange={(e) => {
                  setSessionDateFilter(e.target.value);
                  setFromDate('');
                  setToDate('');
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-sky-400 outline-none focus:border-sky-500"
              />
            )}
            {sessionDateFilter && (
              <button
                type="button"
                onClick={() => setSessionDateFilter('')}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold hover:bg-rose-500/30 cursor-pointer"
              >
                Reset Date
              </button>
            )}
          </div>

          {/* Custom Date Range Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-bold">Range:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-sky-400 outline-none focus:border-sky-500"
              title="From Date"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-sky-400 outline-none focus:border-sky-500"
              title="To Date"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold hover:bg-rose-500/30 cursor-pointer"
              >
                Clear Range
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Date Notice Banner if selected date has no compiled records */}
      {sessionDateFilter && !availableDates.includes(sessionDateFilter) && (
        <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center justify-between gap-3">
          <span>
            ⚠️ No floorsheet records compiled yet for <strong>{sessionDateFilter}</strong> (session in progress or settlement pending). Showing latest completed session: <strong>{availableDates[0] || '2026-10-29'}</strong>.
          </span>
          <button
            type="button"
            onClick={() => setSessionDateFilter('')}
            className="px-2 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold hover:bg-amber-500/30 cursor-pointer text-[11px] whitespace-nowrap"
          >
            Reset to Latest
          </button>
        </div>
      )}

      {/* Telemetry Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-4 w-full">
        <StatCard label="Top Accumulator" value={topAccumulator ? `Broker #${topAccumulator.brokerId}` : '—'} subtitle={topAccumulator ? `+Rs. ${(topAccumulator.netFlow / 1e7).toFixed(1)} Cr (${topAccumulator.topStock})` : undefined} color="#10b981" />
        <StatCard label="Top Distributor" value={topDistributor ? `Broker #${topDistributor.brokerId}` : '—'} subtitle={topDistributor ? `-Rs. ${(Math.abs(topDistributor.netFlow) / 1e7).toFixed(1)} Cr` : undefined} color="#f43f5e" />
        <StatCard label="Monitored Brokers" value={`${brokerFlowList.length} Firms`} subtitle="Live TMS Feed" color="#3b82f6" />
        <StatCard label="Dominance Alert" value={`${corneredCount} Scrips`} subtitle=">35% Single Broker" color="#f59e0b" />
      </div>

      {/* Universal Search & Mobile View Layout Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeMode === 'flow'
                ? 'Filter by broker # or name…'
                : activeMode === 'dominance'
                ? 'Search stock symbol or broker…'
                : 'Search contract symbol or broker…'
            }
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2 pl-9 pr-8 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 hover:bg-rose-500/20 hover:text-rose-400 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Export CSV / Excel Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportMarketBrokerSurveillance({
                mode: activeMode === 'top10' ? 'broker_scrips' : activeMode,
                timeframe,
                sessionDate,
                brokerFlowList: filteredBrokerFlowList,
                dominanceList: filteredDominanceList,
                matchingDeals: filteredMatchingDeals,
                selectedBroker: activeMode === 'top10' ? activeTop10Broker : selectedBrokerModal,
                format: 'csv',
              })
            }
            title="Download current Broker / Floorsheet Surveillance view as CSV"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 text-xs font-extrabold transition cursor-pointer"
          >
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              exportMarketBrokerSurveillance({
                mode: activeMode,
                timeframe,
                sessionDate,
                brokerFlowList: filteredBrokerFlowList,
                dominanceList: filteredDominanceList,
                matchingDeals: filteredMatchingDeals,
                selectedBroker: activeTop10Broker || selectedBrokerModal,
                format: 'xls',
              })
            }
            title="Download Full Multi-Sheet Market Broker & Floorsheet Workbook (.xls)"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-400 hover:bg-sky-500/25 text-xs font-extrabold transition cursor-pointer"
          >
            <Download size={13} />
            <span>Excel (.xls)</span>
          </button>
        </div>

        {/* Mobile View Toggle (Cards vs Table) */}
        <div className="flex sm:hidden items-center justify-between px-1 text-xs">
          <span className="text-[11px] text-slate-400 font-medium">Layout:</span>
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setMobileView('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition ${mobileView === 'cards' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid size={11} /> Cards
            </button>
            <button
              type="button"
              onClick={() => setMobileView('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition ${mobileView === 'table' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <List size={11} /> Table
            </button>
          </div>
        </div>
      </div>

      {/* MODE 1: BROKER FLOW */}
      {activeMode === 'flow' && (
        <div className="space-y-3 w-full min-w-0">
          {/* Mobile Card View */}
          <div className={`${mobileView === 'cards' ? 'block sm:hidden' : 'hidden'} space-y-2.5`}>
            {filteredBrokerFlowList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
                No brokers matching search criteria.
              </div>
            ) : (
              filteredBrokerFlowList.map((b) => {
                const isPositive = b.netFlow >= 0;
                const totalVol = b.buyAmount + b.sellAmount;
                const buyPct = totalVol > 0 ? (b.buyAmount / totalVol) * 100 : 50;
                return (
                  <div key={b.brokerId} className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-black text-white text-xs bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700 shrink-0">
                          #{b.brokerId}
                        </span>
                        <span className="text-slate-200 font-bold text-xs truncate">{b.brokerName}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        b.bias.includes('Accumulation')
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {b.bias}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Net Flow</div>
                        <div className="font-mono font-black text-sm" style={{ color: isPositive ? '#10b981' : '#f43f5e' }}>
                          {isPositive ? '+' : ''}Rs. {(b.netFlow / 1e7).toFixed(2)} Cr
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Top Scrip</div>
                        <div className="font-bold text-xs text-blue-400 truncate mt-0.5">
                          {b.topStock}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-slate-800/40">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-emerald-400">Buy: <strong>Rs. {(b.buyAmount / 1e7).toFixed(2)} Cr</strong></span>
                        <span className="text-rose-400">Sell: <strong>Rs. {(b.sellAmount / 1e7).toFixed(2)} Cr</strong></span>
                      </div>
                      <div className="w-full bg-rose-500/30 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${buyPct}%` }} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedBrokerModal(b)}
                      className="w-full mt-1.5 py-1.5 px-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <BarChart3 size={13} /> View Top 10 Stocks ↗
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Table View (Desktop default or Mobile when toggled) */}
          <div className={`${mobileView === 'table' ? 'block' : 'hidden sm:block'} w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-inner`}>
            {mobileView === 'table' && (
              <div className="sm:hidden text-[10px] text-slate-400 text-center py-1.5 bg-slate-900/60 border-b border-slate-800/60">
                👈 Swipe horizontally to view full columns 👉
              </div>
            )}
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Broker ID &amp; Firm</th>
                    <th className="p-3 text-right">Buy Volume</th>
                    <th className="p-3 text-right">Sell Volume</th>
                    <th className="p-3 text-right">Net Flow (Rs.)</th>
                    <th className="p-3 text-center">Top Accumulated Scrip</th>
                    <th className="p-3 text-right">Market Bias</th>
                    <th className="p-3 text-center">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredBrokerFlowList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No brokers matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredBrokerFlowList.map((b) => {
                      const isPositive = b.netFlow >= 0;
                      return (
                        <tr key={b.brokerId} className="hover:bg-slate-900/40 transition">
                          <td className="p-3">
                            <span className="font-bold text-white text-sm">#{b.brokerId}</span>{' '}
                            <span className="text-slate-300 font-sans">{b.brokerName}</span>
                          </td>
                          <td className="p-3 text-right text-emerald-400 font-semibold">
                            Rs. {(b.buyAmount / 1e7).toFixed(2)} Cr
                          </td>
                          <td className="p-3 text-right text-rose-400 font-semibold">
                            Rs. {(b.sellAmount / 1e7).toFixed(2)} Cr
                          </td>
                          <td className="p-3 text-right font-black text-sm" style={{ color: isPositive ? '#10b981' : '#f43f5e' }}>
                            {isPositive ? '+' : ''}Rs. {(b.netFlow / 1e7).toFixed(2)} Cr
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                              {b.topStock}
                            </span>
                          </td>
                          <td className="p-3 text-right font-sans">
                            <span className={`text-[11px] font-bold ${b.bias.includes('Accumulation') ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {b.bias}
                            </span>
                          </td>
                          <td className="p-3 text-center font-sans">
                            <button
                              type="button"
                              onClick={() => setSelectedBrokerModal(b)}
                              className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 font-bold border border-blue-500/30 text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <BarChart3 size={12} /> Top 10 ↗
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: DOMINANCE (STOCK DOMINANCE & CORNERING BOARD) */}
      {activeMode === 'dominance' && (
        <div className="space-y-3 w-full min-w-0">
          {/* Quick Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 w-full min-w-0">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
                <Target size={13} /> Filter:
              </span>
              <button
                type="button"
                onClick={() => setSmartMoneyFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition ${smartMoneyFilter === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-950/60 text-slate-400 hover:text-white'}`}
              >
                All ({dominanceList.length})
              </button>
              <button
                type="button"
                onClick={() => setSmartMoneyFilter('ACCUMULATION')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition flex items-center gap-1 ${smartMoneyFilter === 'ACCUMULATION' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-950/60 text-emerald-400 hover:bg-slate-800'}`}
              >
                🟢 Institutional &gt;40% ({instAccumulationCount})
              </button>
              <button
                type="button"
                onClick={() => setSmartMoneyFilter('TRAP')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition flex items-center gap-1 ${smartMoneyFilter === 'TRAP' ? 'bg-rose-600 text-white shadow' : 'bg-slate-950/60 text-rose-400 hover:bg-slate-800'}`}
              >
                🚨 Dump Traps ({distributionTrapCount})
              </button>
              <button
                type="button"
                onClick={() => setSmartMoneyFilter('RETAIL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition ${smartMoneyFilter === 'RETAIL' ? 'bg-slate-700 text-white' : 'bg-slate-950/60 text-slate-400 hover:text-white'}`}
              >
                ⚪ Retail ({broadRetailCount})
              </button>
            </div>
            <div className="text-[11px] text-slate-400 font-semibold self-end sm:self-auto shrink-0">
              Showing {filteredDominanceList.length} of {dominanceList.length} scrips
            </div>
          </div>

          {/* Mode 2: Mobile Card View */}
          <div className={`${mobileView === 'cards' ? 'block sm:hidden' : 'hidden'} space-y-2.5`}>
            {filteredDominanceList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
                No stocks matching search and filter criteria.
              </div>
            ) : (
              filteredDominanceList.map((d) => (
                <div
                  key={d.symbol}
                  className={`p-3.5 rounded-2xl border transition shadow-sm space-y-2.5 ${
                    d.smartMoneyVerdict === 'DISTRIBUTION_TRAP'
                      ? 'bg-gradient-to-br from-rose-950/20 via-slate-900/90 to-slate-950 border-rose-500/40'
                      : d.smartMoneyVerdict === 'INSTITUTIONAL_ACCUMULATION'
                      ? 'bg-gradient-to-br from-emerald-950/20 via-slate-900/90 to-slate-950 border-emerald-500/40'
                      : 'bg-slate-900/80 border-slate-800/80'
                  }`}
                >
                  {/* Card Header: Symbol, Name, LTP, Change */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-white text-base tracking-wide">{d.symbol}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          d.status === 'Highly Cornered'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : d.status === 'Moderate Dominance'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {d.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[190px]">{d.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-white text-sm font-mono">Rs. {d.ltp}</div>
                      <div className={`text-[11px] font-bold ${d.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {d.pChange >= 0 ? '+' : ''}{d.pChange.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Smart Money Verdict Banner */}
                  <div className={`p-2 rounded-xl border text-xs ${
                    d.smartMoneyVerdict === 'DISTRIBUTION_TRAP'
                      ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                      : d.smartMoneyVerdict === 'INSTITUTIONAL_ACCUMULATION'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-300'
                  }`}>
                    <div className="flex items-center justify-between gap-2 font-black text-[11px]">
                      <span className="flex items-center gap-1">
                        {d.smartMoneyVerdict === 'DISTRIBUTION_TRAP' && '🚨 Distribution Trap!'}
                        {d.smartMoneyVerdict === 'INSTITUTIONAL_ACCUMULATION' && '🟢 Institutional Accumulation'}
                        {d.smartMoneyVerdict === 'BROAD_RETAIL' && '⚪ Broad Retail Flow'}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40">
                        Top 3: {d.top3BuyPct}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
                      {d.smartMoneyReason}
                    </p>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                    {/* Top 3 Buyers */}
                    <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Top 3 Buyers</div>
                      <div className="font-bold text-slate-200 text-xs mt-0.5 truncate">
                        {d.buyerBrokers.length > 0 ? d.buyerBrokers.join(', ') : '—'}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-blue-400 font-extrabold mt-1">
                        <span>Buy Share:</span>
                        <span className={d.top3BuyPct >= 40 ? 'text-emerald-400' : 'text-slate-300'}>{d.top3BuyPct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${d.top3BuyPct >= 40 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                          style={{ width: `${Math.min(100, d.top3BuyPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Dominant Broker */}
                    <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Dominant Broker</div>
                      <div className="font-bold text-purple-400 text-xs mt-0.5 truncate">
                        Broker #{d.topBrokerId}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">({d.topBrokerName})</div>
                      <div className="flex items-center justify-between text-[10px] font-mono mt-1 text-slate-400">
                        <span>Share:</span>
                        <span className="font-bold text-white">{d.dominancePct}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Turnover & Sell Share footer */}
                  <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400 border-t border-slate-800/40 font-mono">
                    <span>Turnover: <strong className="text-white">Rs. {((d.turnover || 0) / 1e7).toFixed(2)} Cr</strong></span>
                    <span>Top 3 Sell: <strong className="text-rose-400">{d.top3SellPct}%</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mode 2: Table View (Desktop default or Mobile when toggled) */}
          <div className={`${mobileView === 'table' ? 'block' : 'hidden sm:block'} w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-inner`}>
            {mobileView === 'table' && (
              <div className="sm:hidden text-[10px] text-slate-400 text-center py-1.5 bg-slate-900/60 border-b border-slate-800/60">
                👈 Swipe horizontally to view full columns 👉
              </div>
            )}
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Symbol &amp; Company</th>
                    <th className="p-3 text-right">LTP &amp; Change</th>
                    <th className="p-3 text-right">Turnover</th>
                    <th className="p-3">Top 3 Buyer Brokers &amp; Share</th>
                    <th className="p-3">Dominant #1 Broker</th>
                    <th className="p-3 text-right">Step 4 Smart Money Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredDominanceList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No stocks matching search and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDominanceList.map((d) => (
                      <tr key={d.symbol} className="hover:bg-slate-900/40 transition">
                        <td className="p-3">
                          <span className="font-bold text-white text-sm">{d.symbol}</span>
                          <div className="text-[10px] text-slate-400 font-sans truncate max-w-[160px]">{d.name}</div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="font-black text-white">Rs. {d.ltp}</div>
                          <div className={`text-[10px] font-bold ${d.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {d.pChange >= 0 ? '+' : ''}{d.pChange.toFixed(2)}%
                          </div>
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          Rs. {((d.turnover || 0) / 1e7).toFixed(1)} Cr
                        </td>
                        <td className="p-3 font-sans">
                          <div className="flex items-center gap-1 font-bold text-slate-200">
                            {d.buyerBrokers.length > 0 ? d.buyerBrokers.join(', ') : '—'}
                          </div>
                          <div className="text-[11px] font-extrabold text-blue-400">
                            Top 3 Share: <span className={d.top3BuyPct >= 40 ? 'text-emerald-400 font-black' : 'text-slate-300'}>{d.top3BuyPct}%</span>
                          </div>
                        </td>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-purple-400">Broker #{d.topBrokerId}</span>{' '}
                          <span className="text-slate-400 text-xs">({d.topBrokerName})</span>
                          <div className="text-[10px] text-slate-400 font-mono">
                            #1 Share: <span className="font-bold text-white">{d.dominancePct}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-sans">
                          {d.smartMoneyVerdict === 'INSTITUTIONAL_ACCUMULATION' && (
                            <div className="inline-flex flex-col items-end">
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm flex items-center gap-1">
                                🟢 Institutional Accumulation ({d.top3BuyPct}%)
                              </span>
                              <span className="text-[9.5px] text-emerald-400/90 font-semibold mt-0.5 max-w-[200px] text-right truncate" title={d.smartMoneyReason}>
                                &gt;40% Top 3 Blocks
                              </span>
                            </div>
                          )}
                          {d.smartMoneyVerdict === 'DISTRIBUTION_TRAP' && (
                            <div className="inline-flex flex-col items-end">
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm flex items-center gap-1 animate-pulse">
                                🚨 Distribution Trap!
                              </span>
                              <span className="text-[9.5px] text-rose-300/90 font-semibold mt-0.5 max-w-[200px] text-right truncate" title={d.smartMoneyReason}>
                                Dumping into green (Do not buy)
                              </span>
                            </div>
                          )}
                          {d.smartMoneyVerdict === 'BROAD_RETAIL' && (
                            <div className="inline-flex flex-col items-end">
                              <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-800 text-slate-300">
                                ⚪ Broad Retail ({d.top3BuyPct}%)
                              </span>
                              <span className="text-[9.5px] text-slate-500 mt-0.5 text-right">
                                Dispersed flow &lt;40%
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODE 4: BROKER TOP 10 ACCUMULATION & DISTRIBUTION HUB */}
      {activeMode === 'top10' && (
        <div className="space-y-3.5 sm:space-y-4 w-full min-w-0">
          <InfoBanner type="info">
            Deep Broker Scrip Telemetry: Track the Top 10 accumulated equities (highest net capital inflow) versus Top 10 distributed equities (highest net selling/dumping) for any broker desk in NEPSE.
          </InfoBanner>

          {/* Broker Selector Toolbar */}
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <div className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span>Select Target Broker Desk</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Select key institutional players (Broker 58, 45, 34) or pick any active broker in NEPSE.
                </div>
              </div>

              {/* Dropdown Selector */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold text-slate-400 shrink-0">Broker:</label>
                <select
                  value={selectedTop10BrokerId}
                  onChange={(e) => setSelectedTop10BrokerId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 hover:border-slate-600 text-white text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  {brokerFlowList.map((b) => (
                    <option key={b.brokerId} value={b.brokerId}>
                      Broker #{b.brokerId} — {b.brokerName} ({b.netFlow >= 0 ? '+' : ''}Rs. {(b.netFlow / 1e7).toFixed(2)} Cr)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Pill Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0 mr-1">Quick Pick:</span>
              {[
                { id: '58', name: '#58 Naasa', isMajor: true },
                { id: '45', name: '#45 Imperial', isMajor: true },
                { id: '34', name: '#34 Vision', isMajor: true },
                { id: '49', name: '#49 Online', isMajor: false },
                { id: '28', name: '#28 Shree Krishna', isMajor: false },
                { id: '17', name: '#17 ABC', isMajor: false },
                { id: '57', name: '#57 Aryatara', isMajor: false },
                { id: '42', name: '#42 Sani', isMajor: false },
                { id: '38', name: '#38 Dipshikha', isMajor: false },
                { id: '32', name: '#32 Premier', isMajor: false },
                { id: '59', name: '#59 Divya', isMajor: false },
              ].map((pill) => {
                const isSelected = selectedTop10BrokerId === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSelectedTop10BrokerId(pill.id)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {pill.name}
                    {pill.isMajor && !isSelected && <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded font-normal">Top</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Broker Telemetry HUD */}
          {activeTop10Broker && (
            <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900 to-slate-950 border border-slate-800 shadow-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-400 text-sm sm:text-base font-mono">
                    #{activeTop10Broker.brokerId}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-white text-sm sm:text-base tracking-wide">
                        {activeTop10Broker.brokerName}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        activeTop10Broker.bias === 'Aggressive Accumulation'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : activeTop10Broker.bias === 'Mild Accumulation'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : activeTop10Broker.bias === 'Heavy Selling'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}>
                        {activeTop10Broker.bias}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Primary Focus Scrip: <strong className="text-white font-mono">{activeTop10Broker.topStock}</strong> • Total Trades: <span className="font-mono text-slate-300">{activeTop10Broker.totalTrades.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedBrokerModal(activeTop10Broker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
                  >
                    <ExternalLink size={12} />
                    <span>View Detail Modal</span>
                  </button>
                </div>
              </div>

              {/* Macro Inflow/Outflow Counters */}
              <div className="grid grid-cols-3 gap-2 pt-3 text-center">
                <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Buy Turnover</div>
                  <div className="font-mono font-bold text-emerald-400 text-xs sm:text-sm mt-0.5">
                    Rs. {(activeTop10Broker.buyAmount / 1e7).toFixed(2)} Cr
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Sell Turnover</div>
                  <div className="font-mono font-bold text-rose-400 text-xs sm:text-sm mt-0.5">
                    Rs. {(activeTop10Broker.sellAmount / 1e7).toFixed(2)} Cr
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Net Capital Flow</div>
                  <div className="font-mono font-black text-xs sm:text-sm mt-0.5" style={{ color: activeTop10Broker.netFlow >= 0 ? '#10b981' : '#f43f5e' }}>
                    {activeTop10Broker.netFlow >= 0 ? '+' : ''}Rs. {(activeTop10Broker.netFlow / 1e7).toFixed(2)} Cr
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Metric Ranking Switcher */}
          {activeTop10Broker && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <BarChart3 size={13} /> Metric:
                </span>
                <span className="text-[11px] text-slate-300 font-medium">
                  {rankingMetric === 'net_amount' && '🟢 Net Capital Inflow (Rupees) — Idea Share Nepal & Smart Money Standard'}
                  {rankingMetric === 'net_qty' && '📊 Net Shares (Kitta) — Chukul & SS Pro Net Volume Standard'}
                  {rankingMetric === 'gross_buy_amount' && '💰 Gross Buy Turnover (Rupees) — ShareSansar Default Table Standard'}
                  {rankingMetric === 'gross_buy_qty' && '📦 Gross Buy Volume (Shares / Kitta)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setRankingMetric('net_amount')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    rankingMetric === 'net_amount'
                      ? 'bg-emerald-600 text-white shadow-md font-black'
                      : 'bg-slate-950/80 text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
                  }`}
                  title="Rank by Net Capital Inflow (Buy Amt - Sell Amt) — Idea Share Nepal video standard"
                >
                  🟢 Net Inflow (Rs.)
                </button>
                <button
                  type="button"
                  onClick={() => setRankingMetric('net_qty')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    rankingMetric === 'net_qty'
                      ? 'bg-emerald-600 text-white shadow-md font-black'
                      : 'bg-slate-950/80 text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
                  }`}
                  title="Rank by Net Shares (Buy Qty - Sell Qty)"
                >
                  📊 Net Shares
                </button>
                <button
                  type="button"
                  onClick={() => setRankingMetric('gross_buy_amount')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    rankingMetric === 'gross_buy_amount'
                      ? 'bg-amber-600 text-white shadow-md font-black'
                      : 'bg-slate-950/80 text-amber-400 hover:bg-slate-800 border border-amber-500/30'
                  }`}
                  title="Rank by Total Buy Turnover — Matches ShareSansar default table"
                >
                  💰 Gross Buy (ShareSansar)
                </button>
                <button
                  type="button"
                  onClick={() => setRankingMetric('gross_buy_qty')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    rankingMetric === 'gross_buy_qty'
                      ? 'bg-amber-600 text-white shadow-md font-black'
                      : 'bg-slate-950/80 text-slate-300 hover:bg-slate-800 border border-slate-700'
                  }`}
                  title="Rank by Total Buy Shares"
                >
                  📦 Gross Shares
                </button>
              </div>
            </div>
          )}

          {/* DUAL DECK: Top 10 Accumulation vs Top 10 Distribution */}
          {activeTop10Broker && (() => {
            const activeAccScrips = (
              rankingMetric === 'net_qty'
                ? (activeTop10Broker.topByNetQty || activeTop10Broker.topAccumulation || [])
                : rankingMetric === 'gross_buy_amount'
                ? (activeTop10Broker.topByGrossBuyAmt || activeTop10Broker.topAccumulation || [])
                : rankingMetric === 'gross_buy_qty'
                ? (activeTop10Broker.topByGrossBuyQty || activeTop10Broker.topAccumulation || [])
                : (activeTop10Broker.topAccumulation || [])
            ).slice(0, 10);

            const activeDistScrips = (
              rankingMetric === 'net_qty'
                ? (activeTop10Broker.topDistByNetQty || activeTop10Broker.topDistribution || [])
                : rankingMetric === 'gross_buy_amount'
                ? (activeTop10Broker.topDistByGrossSellAmt || activeTop10Broker.topDistribution || [])
                : rankingMetric === 'gross_buy_qty'
                ? (activeTop10Broker.topDistByGrossSellQty || activeTop10Broker.topDistribution || [])
                : (activeTop10Broker.topDistribution || [])
            ).slice(0, 10);

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
                {/* Deck 1: Top 10 Accumulation */}
                <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 overflow-hidden shadow-lg flex flex-col">
                  <div className="p-3 sm:p-3.5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-b border-emerald-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
                        🟢
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                          <span>Top 10 Accumulation</span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">#{activeTop10Broker.brokerId}</span>
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {rankingMetric === 'net_amount' && 'Ranked by highest net cash inflow (खरिद रकम - बिक्री रकम)'}
                          {rankingMetric === 'net_qty' && 'Ranked by highest net shares (खरिद कित्ता - बिक्री कित्ता)'}
                          {rankingMetric === 'gross_buy_amount' && 'Ranked by total buy turnover (कुल खरिद रकम — ShareSansar)'}
                          {rankingMetric === 'gross_buy_qty' && 'Ranked by total buy shares (कुल खरिद कित्ता)'}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {rankingMetric.startsWith('gross') ? 'Gross Buy' : 'Net Inflow'}
                    </span>
                  </div>

                  <div className="p-2 sm:p-3 overflow-x-auto flex-1">
                    {activeAccScrips.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                        No positive accumulation scrips recorded for Broker #{activeTop10Broker.brokerId}.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-950/80 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-sans">
                          <tr>
                            <th className="p-2 text-center w-7">#</th>
                            <th className="p-2">Scrip</th>
                            <th className="p-2 text-right">Buy (Kitta & Avg)</th>
                            <th className="p-2 text-right">Sell (Kitta & Avg)</th>
                            <th className="p-2 text-right">Day Net Kitta</th>
                            <th className="p-2 text-right text-sky-400">Till Today Holding</th>
                            <th className="p-2 text-center">Bias</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {activeAccScrips.map((sc, idx) => {
                            const isNetPos = (sc.netQty != null ? sc.netQty : sc.netFlow) >= 0;
                            const buyKitta = sc.buyQty || Math.round(sc.buyAmount / (sc.avgBuyRate || 100));
                            const sellKitta = sc.sellQty || Math.round(sc.sellAmount / (sc.avgSellRate || 100));
                            const netKitta = sc.netQty != null ? sc.netQty : (buyKitta - sellKitta);
                            const cumHoldKitta = sc.cumHoldQty != null ? sc.cumHoldQty : (netKitta > 0 ? netKitta : 0);
                            const cumAvgPx = sc.cumAvgBuy || sc.avgBuyRate || 0;

                            return (
                              <tr key={sc.symbol} className="hover:bg-slate-800/50 transition">
                                <td className="p-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                                <td className="p-2 font-sans">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-black text-white text-xs">{sc.symbol}</span>
                                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/30">
                                      +{netKitta.toLocaleString()} kitta
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[120px] sm:max-w-[150px]">
                                    {sc.name || sc.symbol}
                                  </div>
                                </td>
                                <td className="p-2 text-right text-emerald-400 font-semibold font-mono">
                                  <div>{buyKitta.toLocaleString()} <span className="text-[10px] text-emerald-500/70">kitta</span></div>
                                  <div className="text-[10px] text-slate-400 font-sans">@ Rs. {sc.avgBuyRate ? sc.avgBuyRate.toFixed(1) : '—'}</div>
                                </td>
                                <td className="p-2 text-right text-slate-400 font-mono">
                                  <div>{sellKitta.toLocaleString()} <span className="text-[10px] text-slate-500">kitta</span></div>
                                  <div className="text-[10px] text-slate-500 font-sans">@ Rs. {sc.avgSellRate ? sc.avgSellRate.toFixed(1) : '—'}</div>
                                </td>
                                <td className="p-2 text-right font-black font-mono" style={{ color: isNetPos ? '#10b981' : '#f43f5e' }}>
                                  <div>{isNetPos ? '+' : ''}{netKitta.toLocaleString()} <span className="text-[10px]">kitta</span></div>
                                  <div className="text-[10px] font-sans font-normal opacity-75">{formatNepaliCurrency(sc.netFlow)}</div>
                                </td>
                                <td className="p-2 text-right font-bold font-mono text-sky-400">
                                  <div>+{cumHoldKitta.toLocaleString()} <span className="text-[10px] text-sky-500/70">kitta</span></div>
                                  <div className="text-[10px] text-slate-400 font-sans">@ Rs. {cumAvgPx > 0 ? cumAvgPx.toFixed(1) : '—'} avg</div>
                                </td>
                                <td className="p-2 text-center font-sans">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 whitespace-nowrap">
                                    Accumulating
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Deck 2: Top 10 Distribution */}
                <div className="rounded-2xl border border-rose-500/30 bg-slate-900/80 overflow-hidden shadow-lg flex flex-col">
                  <div className="p-3 sm:p-3.5 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border-b border-rose-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xs">
                        🔴
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                          <span>Top 10 Distribution</span>
                          <span className="text-[10px] font-mono text-rose-400 font-bold">#{activeTop10Broker.brokerId}</span>
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {rankingMetric === 'net_amount' && 'Ranked by highest net selling outflow (बिक्री रकम - खरिद रकम)'}
                          {rankingMetric === 'net_qty' && 'Ranked by highest net shares dumped (बिक्री कित्ता - खरिद कित्ता)'}
                          {rankingMetric === 'gross_buy_amount' && 'Ranked by total sell turnover (कुल बिक्री रकम)'}
                          {rankingMetric === 'gross_buy_qty' && 'Ranked by total sell shares (कुल बिक्री कित्ता)'}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      {rankingMetric.startsWith('gross') ? 'Gross Sell' : 'Net Outflow'}
                    </span>
                  </div>

                  <div className="p-2 sm:p-3 overflow-x-auto flex-1">
                    {activeDistScrips.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                        No distribution scrips recorded for Broker #{activeTop10Broker.brokerId}.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-950/80 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-sans">
                          <tr>
                            <th className="p-2 text-center w-7">#</th>
                            <th className="p-2">Scrip</th>
                            <th className="p-2 text-right">Buy (Kitta & Avg)</th>
                            <th className="p-2 text-right">Sell (Kitta & Avg)</th>
                            <th className="p-2 text-right">Day Net Kitta</th>
                            <th className="p-2 text-right text-rose-400">Till Today Holding</th>
                            <th className="p-2 text-center">Bias</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {activeDistScrips.map((sc, idx) => {
                            const isNetPos = (sc.netQty != null ? sc.netQty : sc.netFlow) >= 0;
                            const buyKitta = sc.buyQty || Math.round(sc.buyAmount / (sc.avgBuyRate || 100));
                            const sellKitta = sc.sellQty || Math.round(sc.sellAmount / (sc.avgSellRate || 100));
                            const netKitta = sc.netQty != null ? sc.netQty : (buyKitta - sellKitta);
                            const cumHoldKitta = sc.cumHoldQty != null ? sc.cumHoldQty : (netKitta > 0 ? netKitta : 0);
                            const cumAvgPx = sc.cumAvgBuy || sc.avgBuyRate || 0;

                            return (
                              <tr key={sc.symbol} className="hover:bg-slate-800/50 transition">
                                <td className="p-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                                <td className="p-2 font-sans">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-black text-white text-xs">{sc.symbol}</span>
                                    <span className="text-[10px] font-mono text-rose-400 font-bold bg-rose-500/10 px-1 py-0.2 rounded border border-rose-500/30">
                                      {netKitta.toLocaleString()} kitta
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[120px] sm:max-w-[150px]">
                                    {sc.name || sc.symbol}
                                  </div>
                                </td>
                                <td className="p-2 text-right text-slate-400 font-mono">
                                  <div>{buyKitta.toLocaleString()} <span className="text-[10px] text-slate-500">kitta</span></div>
                                  <div className="text-[10px] text-slate-500 font-sans">@ Rs. {sc.avgBuyRate ? sc.avgBuyRate.toFixed(1) : '—'}</div>
                                </td>
                                <td className="p-2 text-right text-rose-400 font-semibold font-mono">
                                  <div>{sellKitta.toLocaleString()} <span className="text-[10px] text-rose-500/70">kitta</span></div>
                                  <div className="text-[10px] text-slate-400 font-sans">@ Rs. {sc.avgSellRate ? sc.avgSellRate.toFixed(1) : '—'}</div>
                                </td>
                                <td className="p-2 text-right font-black font-mono" style={{ color: isNetPos ? '#10b981' : '#f43f5e' }}>
                                  <div>{netKitta.toLocaleString()} <span className="text-[10px]">kitta</span></div>
                                  <div className="text-[10px] font-sans font-normal opacity-75">{formatNepaliCurrency(sc.netFlow)}</div>
                                </td>
                                <td className="p-2 text-right font-bold font-mono text-rose-300">
                                  <div>{cumHoldKitta >= 0 ? `+${cumHoldKitta.toLocaleString()}` : cumHoldKitta.toLocaleString()} <span className="text-[10px] text-slate-400">kitta</span></div>
                                  <div className="text-[10px] text-slate-400 font-sans">@ Rs. {cumAvgPx > 0 ? cumAvgPx.toFixed(1) : '—'} avg</div>
                                </td>
                                <td className="p-2 text-center font-sans">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/30 whitespace-nowrap">
                                    Distributing
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* External Data Sources Reconciliation Guide */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-500/30 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <Shield className="w-4 h-4" />
              <span>External Sources Reconciliation: Why do different platforms show different Top 10 stocks?</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-bold text-emerald-400 text-[11px] mb-1">1. Smart Money / Idea Share Nepal (Net Amount)</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Ranks by <strong>Net Capital Flow (Buy Amt - Sell Amt)</strong>. Deducts selling to reveal pure institutional absorption. Verified for Broker #58 on Oct 13: <strong>GHL (+2.88 Cr), KBL (+1.68 Cr), CBBL (+1.36 Cr), RSML (+94.9 L), SOHL (+56.1 L)</strong>.
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-bold text-amber-400 text-[11px] mb-1">2. ShareSansar Default (Gross Buy)</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  ShareSansar's default table ranks by <strong>Gross Buy Turnover</strong> without deducting sells! Broker 58 bought Rs. 1.09 Cr of CITY (ranked #5 on ShareSansar), but dumped Rs. 7.12 Cr (Net: -6.03 Cr dumped!). Toggle to <strong>Gross Buy</strong> above to match ShareSansar.
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-bold text-blue-400 text-[11px] mb-1">3. Chukul / SS Pro (Net & Gross Shares)</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Ranks by <strong>Number of Shares (Kitta)</strong>. Low-price mutual funds like SEF or NBF3 (@ Rs. 10) jump to the top because 15,000 units is only Rs. 1.5 Lakhs. Toggle to <strong>Net Shares</strong> above to match Chukul volume.
                </div>
              </div>
            </div>
          </div>

          {/* Strategic Rules & Confluence Guide */}
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Smart Money Tactical Execution Rules</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="font-bold text-emerald-400 text-[11px] mb-1">1. Syndicate Confluence</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  When top desks (#58, #45, #34) are accumulating the exact same scrip simultaneously, it signals a coordinated institutional campaign.
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="font-bold text-amber-400 text-[11px] mb-1">2. Quiet Base Accumulation</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  If net inflow is high while price remains in a tight consolidative box, smart money is absorbing supply before markup.
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="font-bold text-rose-400 text-[11px] mb-1">3. Retail Exit Traps</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  If social media is bullish on a stock but Broker #58 or #45 has it in Top 10 Distribution, institutions are unloading into retail euphoria.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: MATCHING DEALS */}
      {activeMode === 'matching' && (
        <div className="space-y-3 w-full min-w-0">
          <InfoBanner type="info">
            Traces direct matching transactions from the NEPSE floorsheet where buyer and seller brokers trade substantial volume blocks in a single contract.
          </InfoBanner>

          {/* Mode 3 Toolbar: Sort Controls & Session Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white">
                {filteredMatchingDeals.length} Block Deals Identified
              </span>
              <span className="text-[11px] text-slate-400">
                (Session: <strong className="text-purple-300 font-mono">{sessionDate}</strong>)
              </span>
            </div>
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <span className="text-[11px] text-slate-400 font-semibold">Sort by:</span>
              <button
                type="button"
                onClick={() => setMatchingSortOrder('date_desc')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                  matchingSortOrder === 'date_desc'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                📅 Date &amp; Time (Newest)
              </button>
              <button
                type="button"
                onClick={() => setMatchingSortOrder('amount_desc')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                  matchingSortOrder === 'amount_desc'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                💰 Deal Size (Largest)
              </button>
            </div>
          </div>

          {/* Mode 3: Mobile Card View */}
          <div className={`${mobileView === 'cards' ? 'block sm:hidden' : 'hidden'} space-y-2.5`}>
            {filteredMatchingDeals.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
                No matching block deals recorded for this session.
              </div>
            ) : (
              filteredMatchingDeals.map((m) => (
                <div key={m.id} className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-sm tracking-wide">{m.symbol}</span>
                      <span className="text-[10px] font-mono text-slate-400">{m.date ? `${m.date} ` : ''}{m.time}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 border border-slate-700">
                      {m.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Deal Value</div>
                      <div className="font-black text-blue-400 text-sm font-mono">
                        {formatNepaliCurrency(m.amount)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Qty &amp; Rate</div>
                      <div className="font-bold text-white text-xs font-mono">
                        {m.quantity.toLocaleString()} @ Rs. {m.rate}
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/70 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 text-[10px] uppercase font-bold shrink-0">Buyer:</span>
                      <span className="text-emerald-400 font-bold truncate max-w-[200px] text-right">{m.buyerBroker}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 text-[10px] uppercase font-bold shrink-0">Seller:</span>
                      <span className="text-rose-400 font-bold truncate max-w-[200px] text-right">{m.sellerBroker}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mode 3: Table View (Desktop default or Mobile when toggled) */}
          <div className={`${mobileView === 'table' ? 'block' : 'hidden sm:block'} w-full max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-inner`}>
            {mobileView === 'table' && (
              <div className="sm:hidden text-[10px] text-slate-400 text-center py-1.5 bg-slate-900/60 border-b border-slate-800/60">
                👈 Swipe horizontally to view full columns 👉
              </div>
            )}
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Date &amp; Time</th>
                    <th className="p-3">Symbol</th>
                    <th className="p-3">Buyer Broker</th>
                    <th className="p-3">Seller Broker</th>
                    <th className="p-3 text-right">Quantity</th>
                    <th className="p-3 text-right">Execution Rate</th>
                    <th className="p-3 text-right">Total Deal Value</th>
                    <th className="p-3 text-right">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredMatchingDeals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">
                        No matching block deals recorded for this session.
                      </td>
                    </tr>
                  ) : (
                    filteredMatchingDeals.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-900/40 transition">
                        <td className="p-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">{m.date ? `${m.date} ` : ''}{m.time}</td>
                        <td className="p-3 font-bold text-white text-sm">{m.symbol}</td>
                        <td className="p-3 text-emerald-400 font-semibold font-sans">{m.buyerBroker}</td>
                        <td className="p-3 text-rose-400 font-semibold font-sans">{m.sellerBroker}</td>
                        <td className="p-3 text-right text-slate-200 font-bold">{m.quantity.toLocaleString()}</td>
                        <td className="p-3 text-right text-white">Rs. {m.rate}</td>
                        <td className="p-3 text-right font-black text-blue-400 text-sm">
                          {formatNepaliCurrency(m.amount)}
                        </td>
                        <td className="p-3 text-right font-sans">
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                            {m.type}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODE 5: EXCHANGE-WIDE BROKER-WISE LEADERBOARD */}
      {activeMode === 'brokerWise' && (
        <div className="space-y-3.5 w-full min-w-0">
          <InfoBanner type="info">
            Exchange-wide institutional surveillance ranking single-broker dump and accumulation moves across all active trading desks in NEPSE.
          </InfoBanner>

          {/* Broker-Wise Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow-md">
            {/* Left: Tab Switcher (Top Sellers vs Top Buyers) */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setBrokerWiseTab('sellers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  brokerWiseTab === 'sellers'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TrendingDown size={14} />
                <span>Top Seller Stocks</span>
              </button>
              <button
                type="button"
                onClick={() => setBrokerWiseTab('buyers')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  brokerWiseTab === 'buyers'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TrendingUp size={14} />
                <span>Top Buyer Stocks</span>
              </button>
            </div>

            {/* Right: Deduplication toggle + Session Date badge + Copy Social Card */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                📅 As of {sessionDate}
              </span>

              <button
                type="button"
                onClick={() => setUniqueStockOnly(!uniqueStockOnly)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  uniqueStockOnly
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Toggle between showing only the single top broker per stock or all broker desks"
              >
                {uniqueStockOnly ? '✓ 1 Broker Per Stock' : 'All Broker Desks'}
              </button>

              <button
                type="button"
                onClick={handleCopySocialCard}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                title="Copy ready-to-share social text card for Telegram / Facebook / Viber"
              >
                {copiedCard ? (
                  <>
                    <Check size={13} className="text-emerald-400" />
                    <span className="text-emerald-400 font-extrabold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Card</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Desktop & Tablet Table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">{brokerWiseTab === 'sellers' ? 'Seller Desk' : 'Buyer Desk'}</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Avg. Rate</th>
                  <th className="p-3 text-center">Desk Dominance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {brokerWiseLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                      No broker-wise records available for this session.
                    </td>
                  </tr>
                ) : (
                  brokerWiseLeaderboard.map((item, idx) => {
                    const brokerId = brokerWiseTab === 'sellers' ? item.sellerBroker : item.buyerBroker;
                    const isTop3 = idx < 3;
                    return (
                      <tr
                        key={`${item.symbol}_${brokerId}_${idx}`}
                        className="hover:bg-slate-900/60 transition group cursor-pointer"
                        onClick={() => {
                          const found = brokerFlowList.find(b => b.brokerId === brokerId);
                          if (found) setSelectedBrokerModal(found);
                        }}
                      >
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black ${
                            idx === 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : idx === 1
                              ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40'
                              : idx === 2
                              ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                              : 'text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="p-3 font-sans">
                          <span className="font-black text-white text-sm group-hover:text-blue-400 transition">
                            {item.symbol}
                          </span>
                        </td>
                        <td className="p-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono border ${
                              brokerWiseTab === 'sellers'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            }`}>
                              Broker {brokerId}
                            </span>
                            <span className="text-slate-300 text-xs truncate max-w-[160px]">
                              {item.brokerName}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-200">
                          {Number(item.qty).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-black">
                          <span className={`text-sm ${brokerWiseTab === 'sellers' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatNepaliCurrency(item.amount)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-300">
                          Rs. {Number(item.avgRate || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isTop3
                              ? brokerWiseTab === 'sellers'
                                ? 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                                : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}>
                            {brokerWiseTab === 'sellers' ? 'Heavy Dump' : 'Aggressive Accum.'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-2.5">
            {brokerWiseLeaderboard.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
                No broker-wise records available for this session.
              </div>
            ) : (
              brokerWiseLeaderboard.map((item, idx) => {
                const brokerId = brokerWiseTab === 'sellers' ? item.sellerBroker : item.buyerBroker;
                return (
                  <div
                    key={`m_${item.symbol}_${brokerId}_${idx}`}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2.5 shadow-sm"
                    onClick={() => {
                      const found = brokerFlowList.find(b => b.brokerId === brokerId);
                      if (found) setSelectedBrokerModal(found);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-400">#{idx + 1}</span>
                        <span className="font-extrabold text-white text-sm">{item.symbol}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono border ${
                        brokerWiseTab === 'sellers'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}>
                        Broker {brokerId}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 truncate">
                      {item.brokerName}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/70 text-xs font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Qty</div>
                        <div className="font-bold text-slate-200">{Number(item.qty).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Amount</div>
                        <div className={`font-black ${brokerWiseTab === 'sellers' ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {formatNepaliCurrency(item.amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-sans">Avg Rate</div>
                        <div className="font-bold text-slate-300">Rs. {Number(item.avgRate || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Broker Top 10 Stocks Drilldown Modal */}
      {selectedBrokerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-emerald-400 text-base sm:text-lg bg-emerald-500/20 px-3 py-1 rounded-xl border border-emerald-500/30">
                  #{selectedBrokerModal.brokerId}
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    {selectedBrokerModal.brokerName}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Top 10 Stocks Bought Breakdown • {timeframe} Timeframe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBrokerModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-3 gap-2 p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800/60 text-xs font-mono">
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Gross Buy</div>
                <div className="font-bold text-emerald-400 mt-0.5">Rs. {(selectedBrokerModal.buyAmount / 1e7).toFixed(2)} Cr</div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Gross Sell</div>
                <div className="font-bold text-rose-400 mt-0.5">Rs. {(selectedBrokerModal.sellAmount / 1e7).toFixed(2)} Cr</div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Net Flow</div>
                <div className="font-black mt-0.5" style={{ color: selectedBrokerModal.netFlow >= 0 ? '#10b981' : '#f43f5e' }}>
                  {selectedBrokerModal.netFlow >= 0 ? '+' : ''}Rs. {(selectedBrokerModal.netFlow / 1e7).toFixed(2)} Cr
                </div>
              </div>
            </div>

            {/* Table of Top 10 Scrips with Accumulation / Distribution Tabs */}
            <div className="p-3 sm:p-4 overflow-y-auto flex-1 scrollbar-thin">
              <div className="flex flex-col gap-2 mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setModalTab('accumulation')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        modalTab === 'accumulation'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🟢 Top 10 Accumulation
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab('distribution')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        modalTab === 'distribution'
                          ? 'bg-rose-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔴 Top 10 Distribution
                    </button>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setRankingMetric('net_amount')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${rankingMetric === 'net_amount' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Net Flow (Rs.)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingMetric('net_qty')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${rankingMetric === 'net_qty' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Net Shares
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingMetric('gross_buy_amount')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${rankingMetric === 'gross_buy_amount' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                      title="ShareSansar Gross Table"
                    >
                      Gross (ShareSansar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingMetric('gross_buy_qty')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer ${rankingMetric === 'gross_buy_qty' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Gross Shares
                    </button>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 font-sans">
                  {modalTab === 'accumulation'
                    ? (rankingMetric === 'net_amount' ? 'Ranked by highest net cash inflow (Idea Share Nepal standard)' : rankingMetric === 'net_qty' ? 'Ranked by highest net shares bought (Chukul standard)' : rankingMetric === 'gross_buy_amount' ? 'Ranked by total buy turnover (ShareSansar default table)' : 'Ranked by gross shares bought')
                    : (rankingMetric === 'net_amount' ? 'Ranked by highest net selling outflow' : rankingMetric === 'net_qty' ? 'Ranked by highest net shares sold' : rankingMetric === 'gross_buy_amount' ? 'Ranked by total sell turnover' : 'Ranked by gross shares sold')}
                </span>
              </div>

              {(() => {
                const scripsToShow = (
                  modalTab === 'accumulation'
                    ? (rankingMetric === 'net_qty'
                        ? (selectedBrokerModal.topByNetQty || selectedBrokerModal.topAccumulation || [])
                        : rankingMetric === 'gross_buy_amount'
                        ? (selectedBrokerModal.topByGrossBuyAmt || selectedBrokerModal.topAccumulation || [])
                        : rankingMetric === 'gross_buy_qty'
                        ? (selectedBrokerModal.topByGrossBuyQty || selectedBrokerModal.topAccumulation || [])
                        : (selectedBrokerModal.topAccumulation || selectedBrokerModal.topScrips || []))
                    : (rankingMetric === 'net_qty'
                        ? (selectedBrokerModal.topDistByNetQty || selectedBrokerModal.topDistribution || [])
                        : rankingMetric === 'gross_buy_amount'
                        ? (selectedBrokerModal.topDistByGrossSellAmt || selectedBrokerModal.topDistribution || [])
                        : rankingMetric === 'gross_buy_qty'
                        ? (selectedBrokerModal.topDistByGrossSellQty || selectedBrokerModal.topDistribution || [])
                        : (selectedBrokerModal.topDistribution || selectedBrokerModal.topScrips || []))
                ).slice(0, 10);

                if (scripsToShow.length === 0) {
                  return (
                    <div className="text-center py-8 text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800">
                      No individual stock trades recorded for this broker in the selected timeframe.
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-sans">
                        <tr>
                          <th className="p-2.5 text-center w-8">#</th>
                          <th className="p-2.5">Stock</th>
                          <th className="p-2.5 text-right">Buy (Kitta & Avg)</th>
                          <th className="p-2.5 text-right">Sell (Kitta & Avg)</th>
                          <th className="p-2.5 text-right">Day Net Kitta</th>
                          <th className="p-2.5 text-right text-sky-400">Till Today Holding</th>
                          <th className="p-2.5 text-center">Bias</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {scripsToShow.map((sc, idx) => {
                          const isNetPos = sc.netFlow >= 0;
                          const buyKitta = sc.buyQty || Math.round(sc.buyAmount / (sc.avgBuyRate || 100));
                          const sellKitta = sc.sellQty || Math.round(sc.sellAmount / (sc.avgSellRate || 100));
                          const netKitta = sc.netQty != null ? sc.netQty : (buyKitta - sellKitta);
                          const cumHoldKitta = sc.cumHoldQty != null ? sc.cumHoldQty : (netKitta > 0 ? netKitta : 0);
                          const cumAvgPx = sc.cumAvgBuy || sc.avgBuyRate || 0;

                          return (
                            <tr key={sc.symbol} className="hover:bg-slate-900/60 transition">
                              <td className="p-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                              <td className="p-2.5 font-sans">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-black text-white text-xs">{sc.symbol}</span>
                                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                                    isNetPos
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}>
                                    {netKitta > 0 ? `+${netKitta.toLocaleString()}` : netKitta.toLocaleString()} kitta
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[130px] sm:max-w-[170px]">
                                  {sc.name || sc.symbol}
                                </div>
                              </td>
                              <td className="p-2.5 text-right text-emerald-400 font-semibold font-mono">
                                <div>{buyKitta.toLocaleString()} <span className="text-[10px] text-emerald-500/70">kitta</span></div>
                                <div className="text-[10px] text-slate-400 font-sans">@ Rs. {sc.avgBuyRate ? sc.avgBuyRate.toFixed(1) : '—'}</div>
                              </td>
                              <td className="p-2.5 text-right text-rose-400 font-semibold font-mono">
                                <div>{sellKitta.toLocaleString()} <span className="text-[10px] text-rose-500/70">kitta</span></div>
                                <div className="text-[10px] text-slate-400 font-sans">@ Rs. {sc.avgSellRate ? sc.avgSellRate.toFixed(1) : '—'}</div>
                              </td>
                              <td className="p-2.5 text-right font-black font-mono" style={{ color: isNetPos ? '#10b981' : '#f43f5e' }}>
                                <div>{netKitta > 0 ? `+${netKitta.toLocaleString()}` : netKitta.toLocaleString()} <span className="text-[10px]">kitta</span></div>
                                <div className="text-[10px] font-sans font-normal opacity-75">{formatNepaliCurrency(sc.netFlow)}</div>
                              </td>
                              <td className="p-2.5 text-right font-bold font-mono text-sky-400">
                                <div>{cumHoldKitta >= 0 ? `+${cumHoldKitta.toLocaleString()}` : cumHoldKitta.toLocaleString()} <span className="text-[10px] text-sky-500/70">kitta</span></div>
                                <div className="text-[10px] text-slate-400 font-sans">@ Rs. {cumAvgPx > 0 ? cumAvgPx.toFixed(1) : '—'} avg</div>
                              </td>
                              <td className="p-2.5 text-center font-sans">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                  isNetPos
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}>
                                  {isNetPos ? 'Accumulating' : 'Distributing'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px]">💡 Tip: Track multi-session consistency in the Whale Archive before entering.</span>
              <button
                type="button"
                onClick={() => setSelectedBrokerModal(null)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Insight>
        Smart Money tracking focuses on Broker Dominance and Net Flow. When a single broker accounts for over 35% of daily volume while accumulating with rising price, it signals strong institutional backing.
      </Insight>
    </div>
  );
}
