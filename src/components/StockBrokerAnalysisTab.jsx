import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Layers, ShieldCheck, Filter,
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart2, PieChart, Info,
  Calendar, LayoutGrid, List, Search, RotateCcw, Download
} from 'lucide-react';
import { getBrokerName, formatBrokerAmount } from '../utils/accumulationDistributionEngine';
import { exportBrokerAnalysisReport, exportStockFloorsheet } from '../utils/floorsheetExport';
import { fetchRealBrokerAnalysis } from '../utils/liveData';

function formatCompactQty(val) {
  const n = Math.abs(Number(val) || 0);
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatShareHubCurrency(val) {
  const n = Number(val) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)} K`;
  return `${sign}Rs ${abs.toFixed(0)}`;
}

export default function StockBrokerAnalysisTab({
  brokerData = null,
  floorsheetData = [],
  symbol = '',
  ltp = 0,
  selectedDays = 1,
  selectedDate = '',
  onDaysChange = null,
  onDateChange = null,
  loading = false
}) {
  const [activeSubTab, setActiveSubTab] = useState('brokers'); // 'brokers' | 'acc_dist' | 'zero_sum'
  const [chartTab, setChartTab] = useState('holdings'); // 'holdings' | 'buyers' | 'sellers'
  const [brokerRoleFilter, setBrokerRoleFilter] = useState('all'); // 'all' | 'buyers' | 'sellers' | 'holdings'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'compact' | 'datewise'
  const [rankingMetric, setRankingMetric] = useState('netFlow'); // 'netFlow' | 'netQty' | 'grossAmt' | 'grossQty'
  const [zeroSumUnit, setZeroSumUnit] = useState('amount'); // 'amount' | 'qty'
  const [filterQuery, setFilterQuery] = useState('');
  const [localDays, setLocalDays] = useState(selectedDays || 1);
  const [localDate, setLocalDate] = useState(selectedDate || '');
  const [internalBrokerData, setInternalBrokerData] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);

  // Sync props to local state
  useEffect(() => {
    if (selectedDays) setLocalDays(selectedDays);
  }, [selectedDays]);

  useEffect(() => {
    if (selectedDate !== undefined) setLocalDate(selectedDate);
  }, [selectedDate]);

  const effectiveDays = onDaysChange ? selectedDays : localDays;
  const effectiveDate = onDateChange ? selectedDate : localDate;

  // Auto-fetch if brokerData is missing or empty
  useEffect(() => {
    let active = true;
    if (!symbol) return;
    const hasPropBrokers = brokerData && (
      (Array.isArray(brokerData.brokers) && brokerData.brokers.length > 0) ||
      (Array.isArray(brokerData.topBuyers) && brokerData.topBuyers.length > 0) ||
      (Array.isArray(brokerData.dailyFlow) && brokerData.dailyFlow.length > 0)
    );
    if (hasPropBrokers) {
      setInternalBrokerData(null);
      return;
    }

    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, effectiveDays, { date: effectiveDate })
      .then(res => {
        if (active && res && (res.brokers?.length > 0 || res.topBuyers?.length > 0 || res.dailyFlow?.length > 0)) {
          setInternalBrokerData(res);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setInternalLoading(false);
      });

    return () => { active = false; };
  }, [symbol, effectiveDays, effectiveDate, brokerData]);

  const activeBrokerData = (brokerData && (
    (Array.isArray(brokerData.brokers) && brokerData.brokers.length > 0) ||
    (Array.isArray(brokerData.topBuyers) && brokerData.topBuyers.length > 0) ||
    (Array.isArray(brokerData.dailyFlow) && brokerData.dailyFlow.length > 0)
  )) ? brokerData : (internalBrokerData || brokerData);

  const isTabLoading = Boolean(loading || internalLoading);

  const handleDaysSelect = (d) => {
    setLocalDays(d);
    setLocalDate('');
    if (onDateChange) onDateChange('');
    if (onDaysChange) onDaysChange(d);
    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, d, { date: '' })
      .then(res => { if (res) setInternalBrokerData(res); })
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  };

  const handleDateSelect = (dt) => {
    setLocalDate(dt);
    if (onDateChange) onDateChange(dt);
    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, effectiveDays, { date: dt })
      .then(res => { if (res) setInternalBrokerData(res); })
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  };

  // Extract available trading dates from activeBrokerData or floorsheetData
  const availableDates = useMemo(() => {
    const set = new Set();
    const bd = activeBrokerData;
    if (Array.isArray(bd?.availableDates)) {
      bd.availableDates.forEach(d => d && set.add(String(d)));
    }
    if (Array.isArray(bd?.dailyFlow)) {
      bd.dailyFlow.forEach(df => df?.date && set.add(String(df.date)));
    }
    if (bd?.businessDate) set.add(String(bd.businessDate));
    const fsRows = Array.isArray(floorsheetData)
      ? floorsheetData
      : (Array.isArray(floorsheetData?.rows) ? floorsheetData.rows : []);
    fsRows.forEach(r => r?.businessDate && set.add(String(r.businessDate)));
    if (Array.isArray(floorsheetData?.availableDates)) {
      floorsheetData.availableDates.forEach(d => d && set.add(String(d)));
    }
    return Array.from(set).sort().reverse();
  }, [activeBrokerData, floorsheetData]);

  // Active display date / range string
  const activeDateDisplay = useMemo(() => {
    if (effectiveDate) return effectiveDate;
    const bd = activeBrokerData;
    if (bd?.fromDate && bd?.toDate && bd.fromDate !== bd.toDate) {
      return `${bd.fromDate} → ${bd.toDate}`;
    }
    if (bd?.businessDate) return bd.businessDate;
    if (availableDates.length > 0) return availableDates[0];
    return '';
  }, [effectiveDate, activeBrokerData, availableDates]);

  // Process broker flows from activeBrokerData or floorsheetData
  const brokerRecords = useMemo(() => {
    const map = new Map();
    const bd = activeBrokerData;

    const fsRows = Array.isArray(floorsheetData)
      ? floorsheetData
      : (Array.isArray(floorsheetData?.rows) ? floorsheetData.rows : []);

    // Priority 1: Full activeBrokerData.brokers from upgraded brokerVault
    if (bd && Array.isArray(bd.brokers) && bd.brokers.length > 0) {
      for (const b of bd.brokers) {
        const id = String(b.brokerId || b.broker || b.brokerNo || b.id || b.memberId || '').trim();
        if (!id || id === '?') continue;
        const buyQty = Number(b.buyQty ?? b.volume ?? b.kitta ?? b.shares ?? 0);
        const buyAmt = Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? (buyQty * (b.avgBuyRate || ltp || 100)) ?? 0);
        const sellQty = Number(b.sellQty ?? b.shares ?? 0);
        const sellAmt = Number(b.sellAmt ?? b.sellAmount ?? b.amount ?? (sellQty * (b.avgSellRate || ltp || 100)) ?? 0);
        const matchedQty = Number(b.matchedQty ?? 0);
        const matchedAmt = Number(b.matchedAmt ?? 0);
        const trades = Number(b.trades ?? b.totalTrades ?? 0);

        map.set(id, {
          id,
          name: b.name || b.brokerName || getBrokerName(id),
          buyQty,
          buyAmt,
          sellQty,
          sellAmt,
          matchedQty,
          matchedAmt,
          trades
        });
      }
    } else if (bd && ((bd.topBuyers && bd.topBuyers.length > 0) || (bd.buyers && bd.buyers.length > 0) || (bd.topSellers && bd.topSellers.length > 0) || (bd.topHoldings && bd.topHoldings.length > 0))) {
      // Priority 2: Partial or legacy brokerData with topBuyers / topSellers / topHoldings
      const buyers = bd.topBuyers || bd.buyers || bd.topNetBuyers || [];
      const sellers = bd.topSellers || bd.sellers || bd.topNetSellers || [];
      const holdings = bd.topHoldings || [];

      for (const b of buyers) {
        const id = String(b.brokerId || b.broker || b.brokerNo || b.id || b.memberId || '').trim();
        if (!id || id === '?') continue;
        if (!map.has(id)) {
          map.set(id, { id, name: b.name || b.brokerName || getBrokerName(id), buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, matchedQty: 0, trades: 0 });
        }
        const rec = map.get(id);
        rec.buyQty += Number(b.buyQty ?? b.volume ?? b.kitta ?? b.shares ?? 0);
        rec.buyAmt += Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? (rec.buyQty * (b.avgBuyRate || ltp || 100)) ?? 0);
        if (b.sellQty !== undefined && rec.sellQty === 0) rec.sellQty = Number(b.sellQty || 0);
        if (b.sellAmt !== undefined && rec.sellAmt === 0) rec.sellAmt = Number(b.sellAmt || (rec.sellQty * (b.avgSellRate || ltp || 100)) || 0);
        if (b.matchedQty !== undefined && rec.matchedQty === 0) rec.matchedQty = Number(b.matchedQty || 0);
      }

      for (const s of sellers) {
        const id = String(s.brokerId || s.broker || s.brokerNo || s.id || s.memberId || '').trim();
        if (!id || id === '?') continue;
        if (!map.has(id)) {
          map.set(id, { id, name: s.name || s.brokerName || getBrokerName(id), buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, matchedQty: 0, trades: 0 });
        }
        const rec = map.get(id);
        if (rec.sellQty === 0) {
          rec.sellQty += Number(s.sellQty ?? s.volume ?? s.kitta ?? s.shares ?? 0);
          rec.sellAmt += Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? (rec.sellQty * (s.avgSellRate || ltp || 100)) ?? 0);
        }
        if (s.buyQty !== undefined && rec.buyQty === 0) rec.buyQty = Number(s.buyQty || 0);
        if (s.buyAmt !== undefined && rec.buyAmt === 0) rec.buyAmt = Number(s.buyAmt || (rec.buyQty * (s.avgBuyRate || ltp || 100)) || 0);
        if (s.matchedQty !== undefined && rec.matchedQty === 0) rec.matchedQty = Number(s.matchedQty || 0);
      }

      for (const h of holdings) {
        const id = String(h.brokerId || h.broker || h.brokerNo || h.id || h.memberId || '').trim();
        if (!id || id === '?') continue;
        if (!map.has(id)) {
          const buyQ = Number(h.buyQty ?? h.volume ?? h.kitta ?? 0);
          const sellQ = Number(h.sellQty ?? 0);
          map.set(id, {
            id,
            name: h.name || h.brokerName || getBrokerName(id),
            buyQty: buyQ,
            buyAmt: Number(h.buyAmt ?? h.buyAmount ?? (buyQ * (h.avgBuyRate || ltp || 100)) ?? 0),
            sellQty: sellQ,
            sellAmt: Number(h.sellAmt ?? h.sellAmount ?? (sellQ * (h.avgSellRate || ltp || 100)) ?? 0),
            matchedQty: Number(h.matchedQty || 0),
            trades: Number(h.trades || 1)
          });
        }
      }
    } else if (fsRows.length > 0) {
      // Priority 3: Compute directly from floorsheet rows
      for (const t of fsRows) {
        const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);
        const rate = Number(t.contractRate || t.rate || t.price || 0);
        const amt = Number(t.contractAmount || t.amount || (qty * rate) || 0);
        const b = String(t.buyerMemberId || t.buyer || t.buyerBroker || '').replace(/^0+/, '').trim();
        const s = String(t.sellerMemberId || t.seller || t.sellerBroker || '').replace(/^0+/, '').trim();

        if (b) {
          if (!map.has(b)) map.set(b, { id: b, name: t.buyerBrokerName || getBrokerName(b), buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, matchedQty: 0, trades: 0 });
          const rec = map.get(b);
          rec.buyQty += qty;
          rec.buyAmt += amt;
          rec.trades += 1;
        }

        if (s) {
          if (!map.has(s)) map.set(s, { id: s, name: t.sellerBrokerName || getBrokerName(s), buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, matchedQty: 0, trades: 0 });
          const rec = map.get(s);
          rec.sellQty += qty;
          rec.sellAmt += amt;
          if (b !== s) rec.trades += 1;
        }

        // Track internal self-matching
        if (b && s && b === s) {
          const rec = map.get(b);
          rec.matchedQty += qty;
        }
      }
    }

    const totalBuyVol = Array.from(map.values()).reduce((sum, r) => sum + r.buyQty, 0) || 1;
    const totalSellVol = Array.from(map.values()).reduce((sum, r) => sum + r.sellQty, 0) || 1;

    const list = Array.from(map.values()).map(r => {
      const netQty = r.buyQty - r.sellQty;
      const netAmt = r.buyAmt - r.sellAmt;
      const holdQty = Math.max(0, netQty);
      const avgBuy = r.buyQty > 0 ? +(r.buyAmt / r.buyQty).toFixed(2) : 0;
      const avgSell = r.sellQty > 0 ? +(r.sellAmt / r.sellQty).toFixed(2) : 0;
      const holdAmt = netQty >= 0
        ? (r.buyAmt - r.sellAmt > 0 ? (r.buyAmt - r.sellAmt) : holdQty * (avgBuy || ltp || 100))
        : (r.buyAmt - r.sellAmt);
      const holdPctOfBuy = r.buyQty > 0 ? Math.max(0, Math.min(100, Math.round((netQty / r.buyQty) * 100))) : 0;
      const totalTrade = r.buyQty + r.sellQty;
      const buyPct = totalTrade > 0 ? Math.round((r.buyQty / totalTrade) * 100) : 0;
      const sellPct = totalTrade > 0 ? (100 - buyPct) : 0;

      return {
        ...r,
        netQty,
        netAmt,
        holdQty,
        signedHoldQty: netQty,
        holdAmt,
        holdPctOfBuy,
        buyPct,
        sellPct,
        avgBuy,
        avgSell,
        totalTrade,
        buyMktShare: +((r.buyQty / totalBuyVol) * 100).toFixed(2),
        sellMktShare: +((r.sellQty / totalSellVol) * 100).toFixed(2)
      };
    });

    // Sort by holdQty descending, then totalTrade descending
    return list.sort((a, b) => b.signedHoldQty - a.signedHoldQty || b.totalTrade - a.totalTrade);
  }, [floorsheetData, activeBrokerData, ltp]);

  // Top Chart Data (TOP HOLDINGS | TOP BUYERS | TOP SELLERS) dynamically driven by rankingMetric
  const chartItems = useMemo(() => {
    const isAmountMetric = rankingMetric === 'netFlow' || rankingMetric === 'grossAmt';

    if (chartTab === 'holdings') {
      if (rankingMetric === 'netFlow') {
        const withNet = brokerRecords.filter(b => b.netAmt > 0);
        const list = withNet.length > 0 ? withNet : brokerRecords;
        return [...list]
          .sort((a, b) => b.netAmt - a.netAmt)
          .slice(0, 10)
          .map(b => ({
            id: b.id,
            name: b.name,
            value: b.netAmt,
            displayVal: formatShareHubCurrency(b.netAmt),
            color: '#0284c7'
          }));
      }
      if (rankingMetric === 'grossAmt') {
        return [...brokerRecords]
          .sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt))
          .slice(0, 10)
          .map(b => ({
            id: b.id,
            name: b.name,
            value: b.buyAmt + b.sellAmt,
            displayVal: formatShareHubCurrency(b.buyAmt + b.sellAmt),
            color: '#0284c7'
          }));
      }
      if (rankingMetric === 'grossQty') {
        return [...brokerRecords]
          .sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty))
          .slice(0, 10)
          .map(b => ({
            id: b.id,
            name: b.name,
            value: b.buyQty + b.sellQty,
            displayVal: formatCompactQty(b.buyQty + b.sellQty),
            color: '#0284c7'
          }));
      }
      // Default: netQty
      const withHoldings = brokerRecords.filter(b => b.signedHoldQty > 0);
      const list = withHoldings.length > 0 ? withHoldings : brokerRecords;
      return [...list]
        .sort((a, b) => (b.signedHoldQty > 0 ? (b.signedHoldQty - a.signedHoldQty) : (b.buyQty - a.buyQty)))
        .slice(0, 10)
        .map(b => ({
          id: b.id,
          name: b.name,
          value: b.signedHoldQty > 0 ? b.signedHoldQty : b.buyQty,
          displayVal: formatCompactQty(b.signedHoldQty > 0 ? b.signedHoldQty : b.buyQty),
          color: '#0284c7'
        }));
    }

    if (chartTab === 'buyers') {
      if (isAmountMetric) {
        return [...brokerRecords]
          .filter(b => b.buyAmt > 0)
          .sort((a, b) => b.buyAmt - a.buyAmt)
          .slice(0, 10)
          .map(b => ({
            id: b.id,
            name: b.name,
            value: b.buyAmt,
            displayVal: formatShareHubCurrency(b.buyAmt),
            color: '#10b981'
          }));
      }
      return [...brokerRecords]
        .filter(b => b.buyQty > 0)
        .sort((a, b) => b.buyQty - a.buyQty)
        .slice(0, 10)
        .map(b => ({
          id: b.id,
          name: b.name,
          value: b.buyQty,
          displayVal: formatCompactQty(b.buyQty),
          color: '#10b981'
        }));
    }

    // Sellers
    if (isAmountMetric) {
      return [...brokerRecords]
        .filter(b => b.sellAmt > 0)
        .sort((a, b) => b.sellAmt - a.sellAmt)
        .slice(0, 10)
        .map(b => ({
          id: b.id,
          name: b.name,
          value: b.sellAmt,
          displayVal: formatShareHubCurrency(b.sellAmt),
          color: '#f43f5e'
        }));
    }
    return [...brokerRecords]
      .filter(b => b.sellQty > 0)
      .sort((a, b) => b.sellQty - a.sellQty)
      .slice(0, 10)
      .map(b => ({
        id: b.id,
        name: b.name,
        value: b.sellQty,
        displayVal: formatCompactQty(b.sellQty),
        color: '#f43f5e'
      }));
  }, [brokerRecords, chartTab, rankingMetric]);

  const maxChartVal = useMemo(() => {
    const m = chartItems.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
    return m > 0 ? m : 100;
  }, [chartItems]);

  // Filtered brokers for cards/table
  const filteredBrokers = useMemo(() => {
    let list = [...brokerRecords];
    const isAmountMetric = rankingMetric === 'netFlow' || rankingMetric === 'grossAmt';

    if (brokerRoleFilter === 'buyers') {
      list = list.filter(b => b.buyQty > 0);
      if (isAmountMetric) {
        list.sort((a, b) => b.buyAmt - a.buyAmt);
      } else {
        list.sort((a, b) => b.buyQty - a.buyQty);
      }
    } else if (brokerRoleFilter === 'sellers') {
      list = list.filter(b => b.sellQty > 0);
      if (isAmountMetric) {
        list.sort((a, b) => b.sellAmt - a.sellAmt);
      } else {
        list.sort((a, b) => b.sellQty - a.sellQty);
      }
    } else if (brokerRoleFilter === 'holdings') {
      if (rankingMetric === 'netFlow') {
        list.sort((a, b) => b.netAmt - a.netAmt);
      } else if (rankingMetric === 'netQty') {
        list.sort((a, b) => b.signedHoldQty - a.signedHoldQty);
      } else if (rankingMetric === 'grossAmt') {
        list.sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt));
      } else {
        list.sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty));
      }
    } else {
      // In 'all' mode, follow the active chartTab ordering and rankingMetric
      if (chartTab === 'buyers') {
        if (isAmountMetric) {
          list.sort((a, b) => b.buyAmt - a.buyAmt || b.totalTrade - a.totalTrade);
        } else {
          list.sort((a, b) => b.buyQty - a.buyQty || b.totalTrade - a.totalTrade);
        }
      } else if (chartTab === 'sellers') {
        if (isAmountMetric) {
          list.sort((a, b) => b.sellAmt - a.sellAmt || b.totalTrade - a.totalTrade);
        } else {
          list.sort((a, b) => b.sellQty - a.sellQty || b.totalTrade - a.totalTrade);
        }
      } else {
        if (rankingMetric === 'netFlow') {
          list.sort((a, b) => b.netAmt - a.netAmt || b.totalTrade - a.totalTrade);
        } else if (rankingMetric === 'netQty') {
          list.sort((a, b) => b.signedHoldQty - a.signedHoldQty || b.totalTrade - a.totalTrade);
        } else if (rankingMetric === 'grossAmt') {
          list.sort((a, b) => (b.buyAmt + b.sellAmt) - (a.buyAmt + a.sellAmt));
        } else {
          list.sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty));
        }
      }
    }

    if (filterQuery) {
      const q = filterQuery.toLowerCase().trim();
      list = list.filter(b => b.id.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
    }
    return list;
  }, [brokerRecords, brokerRoleFilter, chartTab, filterQuery, rankingMetric]);

  // Summary Totals (Share Hub strip: Total Amount | Total Quantity | Transactions)
  const totalVolume = Number(activeBrokerData?.totalVolume) || brokerRecords.reduce((s, b) => s + b.buyQty, 0);
  const totalAmount = Number(activeBrokerData?.totalAmount) || brokerRecords.reduce((s, b) => s + b.buyAmt, 0);
  const totalTransactions = Number(activeBrokerData?.totalTrades) || (Array.isArray(floorsheetData?.rows) ? floorsheetData.totalElements || floorsheetData.rows.length : (Array.isArray(floorsheetData) ? floorsheetData.length : brokerRecords.reduce((s, b) => s + (b.trades || 0), 0)));
  const totalHold = brokerRecords.reduce((s, b) => s + b.holdQty, 0);

  // Daily flow records for Date-Wise Broker Buying/Selling table
  const dailyFlowList = useMemo(() => {
    if (Array.isArray(activeBrokerData?.dailyFlow) && activeBrokerData.dailyFlow.length > 0) {
      return activeBrokerData.dailyFlow;
    }
    return [];
  }, [activeBrokerData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Sub-Navigation Bar (Share Hub Reference) ── */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '6px',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('brokers')}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12.5,
            fontWeight: 800,
            cursor: 'pointer',
            background: activeSubTab === 'brokers' ? '#0284c7' : 'transparent',
            color: activeSubTab === 'brokers' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.15s ease'
          }}
        >
          Brokers Analysis
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('acc_dist')}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: 'none',
            fontSize: 12.5,
            fontWeight: 800,
            cursor: 'pointer',
            background: activeSubTab === 'acc_dist' ? '#0284c7' : 'transparent',
            color: activeSubTab === 'acc_dist' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.15s ease'
          }}
        >
          Acc. & Dist.
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('zero_sum')}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 800,
            cursor: 'pointer',
            background: activeSubTab === 'zero_sum' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
            color: activeSubTab === 'zero_sum' ? '#10b981' : '#94a3b8',
            border: activeSubTab === 'zero_sum' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
            transition: 'all 0.15s ease'
          }}
        >
          Zero Sum Floorsheet
        </button>
      </div>

      {/* ── Date-Wise & Multi-Day Timeframe Filter Bar (Share Hub Parity) ── */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '10px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10
      }}>
        {/* Multi-Day Session Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { days: 1, label: '1 Day' },
            { days: 3, label: '3 Days' },
            { days: 7, label: '7 Days' },
            { days: 15, label: '15 Days' },
            { days: 30, label: '30 Days' }
          ].map(item => {
            const isActive = !effectiveDate && Number(effectiveDays) === item.days;
            return (
              <button
                key={item.days}
                type="button"
                onClick={() => handleDaysSelect(item.days)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 8,
                  border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                  background: isActive ? 'rgba(2, 132, 199, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Date-Wise Picker & Trading Session Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '5px 10px'
          }}>
            <Calendar style={{ width: 13, height: 13, color: '#38bdf8' }} />
            {availableDates.length > 0 ? (
              <select
                value={effectiveDate || ''}
                onChange={e => handleDateSelect(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: 12,
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="" style={{ background: '#0f172a', color: '#94a3b8' }}>
                  Select Date ({availableDates[0]})
                </option>
                {availableDates.map(dt => (
                  <option key={dt} value={dt} style={{ background: '#0f172a', color: '#f8fafc' }}>
                    {dt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={effectiveDate || ''}
                onChange={e => handleDateSelect(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: 12,
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            )}
          </div>

          {effectiveDate && (
            <button
              type="button"
              onClick={() => handleDateSelect('')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid rgba(244, 63, 94, 0.3)',
                background: 'rgba(244, 63, 94, 0.12)',
                color: '#fb7185',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RotateCcw style={{ width: 12, height: 12 }} />
              Reset
            </button>
          )}

          {/* Broker-Wise & Date-Wise Export Buttons */}
          <button
            type="button"
            onClick={() => exportBrokerAnalysisReport({
              symbol,
              brokerData: activeBrokerData,
              selectedDays: effectiveDays,
              selectedDate: effectiveDate,
              filterQuery,
              dataset: viewMode === 'datewise' ? 'date_wise_brokers' : 'brokers',
              format: 'csv'
            })}
            title="Download Broker Buying/Selling/Holdings Summary as CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.35)',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#34d399',
              fontSize: 11.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Download style={{ width: 12, height: 12 }} />
            <span>CSV (Brokers)</span>
          </button>

          <button
            type="button"
            onClick={() => exportBrokerAnalysisReport({
              symbol,
              brokerData: activeBrokerData,
              selectedDays: effectiveDays,
              selectedDate: effectiveDate,
              filterQuery,
              dataset: 'date_wise_brokers',
              format: 'csv'
            })}
            title="Download Date-Wise Per-Broker Buying & Selling Matrix as CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(168, 85, 247, 0.35)',
              background: 'rgba(168, 85, 247, 0.12)',
              color: '#c084fc',
              fontSize: 11.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Download style={{ width: 12, height: 12 }} />
            <span>Date-Wise CSV</span>
          </button>

          <button
            type="button"
            onClick={() => exportBrokerAnalysisReport({
              symbol,
              brokerData: activeBrokerData,
              selectedDays: effectiveDays,
              selectedDate: effectiveDate,
              filterQuery,
              dataset: 'full_workbook',
              format: 'xls'
            })}
            title="Download Full Multi-Sheet Excel Workbook (Broker Summary + Date-Wise Flow + Daily Sessions)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(56, 189, 248, 0.35)',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              fontSize: 11.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <Download style={{ width: 12, height: 12 }} />
            <span>Excel (.xls)</span>
          </button>

          {isTabLoading && (
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
              Loading Brokers...
            </span>
          )}
        </div>
      </div>

      {/* ── Sub-tab 1: Broker Cards & Top Bar Chart Layout (Exact Share Hub Visuals) ── */}
      {activeSubTab === 'brokers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1. Share Hub Top Bar Chart Card: TOP HOLDINGS | TOP BUYERS | TOP SELLERS + Date */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: 10,
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {[
                  { id: 'holdings', label: 'TOP HOLDINGS', color: '#38bdf8' },
                  { id: 'buyers', label: 'TOP BUYERS', color: '#10b981' },
                  { id: 'sellers', label: 'TOP SELLERS', color: '#f43f5e' }
                ].map(t => {
                  const active = chartTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setChartTab(t.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                        padding: '4px 2px 6px 2px',
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: '0.03em',
                        color: active ? t.color : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {activeDateDisplay && (
                <div style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#94a3b8',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {activeDateDisplay}
                </div>
              )}
            </div>

            {/* Metric Switcher Bar (Reconciliation with ShareSansar & Idea Share Nepal) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              padding: '7px 10px',
              marginBottom: 12,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Metric:</span>
                {[
                  { id: 'netFlow', label: '⚡ Net Inflow (Idea Share)', hint: 'Net Capital Inflow = Buy Rs. − Sell Rs.' },
                  { id: 'netQty', label: '📊 Net Shares (Kitta)', hint: 'Buy Units − Sell Units' },
                  { id: 'grossAmt', label: '💰 Gross Turnover (ShareSansar)', hint: 'Gross Buy / Sell Turnover in Rs. (ShareSansar default)' },
                  { id: 'grossQty', label: '📦 Gross Shares (Kitta)', hint: 'Gross Traded Shares' }
                ].map(m => {
                  const active = rankingMetric === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRankingMetric(m.id)}
                      title={m.hint}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 7,
                        border: active ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(2, 132, 199, 0.25)' : '#0f172a',
                        color: active ? '#38bdf8' : '#94a3b8',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', fontStyle: 'italic' }}>
                {rankingMetric === 'grossAmt' ? 'Matching ShareSansar turnover table' : rankingMetric === 'netFlow' ? 'Matching Smart Money institutional accumulation' : 'Volume-based ranking'}
              </div>
            </div>

            {/* Vertical Bar Chart */}
            {chartItems.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: 12.5 }}>
                No {chartTab} records for this session.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(chartItems.length, 5)}, minmax(0, 1fr))`,
                gap: 8,
                alignItems: 'end',
                height: 170,
                padding: '18px 6px 4px 6px',
                borderBottom: '1px solid rgba(255,255,255,0.08)'
              }}>
                {chartItems.map(item => {
                  const pct = Math.max(8, Math.round((Math.abs(item.value) / maxChartVal) * 100));
                  return (
                    <div
                      key={item.id}
                      onClick={() => setFilterQuery(filterQuery === item.id ? '' : item.id)}
                      title={`#${item.id} ${item.name}: ${item.displayVal || item.value.toLocaleString()}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        height: '100%',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{
                        fontSize: 8.5,
                        fontWeight: 800,
                        color: '#cbd5e1',
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {item.displayVal || formatCompactQty(item.value)}
                      </div>
                      <div style={{
                        width: '68%',
                        maxWidth: 28,
                        height: `${pct}%`,
                        background: item.color,
                        borderRadius: '6px 6px 2px 2px',
                        transition: 'height 0.25s ease',
                        boxShadow: filterQuery === item.id ? `0 0 10px ${item.color}` : 'none'
                      }} />
                      <div style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#94a3b8',
                        marginTop: 6,
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {item.id}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Share Hub 3-Column Summary Strip: Total Amount | Total Quantity | Transactions */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            textAlign: 'center',
            gap: 8
          }}>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Total Amount</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                Rs. {formatShareHubCurrency(totalAmount).replace(/^Rs\s*/, '')}
              </div>
            </div>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Total Quantity</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                {totalVolume.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Transactions</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                {totalTransactions.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 3. Search Bar & View Mode Toggle */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <input
                type="text"
                placeholder="Search broker by name or # number..."
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'cards', label: 'Cards' },
                { id: 'compact', label: 'Table' },
                { id: 'datewise', label: 'Date-Wise' }
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: viewMode === m.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                    background: viewMode === m.id ? 'rgba(2, 132, 199, 0.22)' : '#111827',
                    color: viewMode === m.id ? '#38bdf8' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {filteredBrokers.length === 0 && (
            <div style={{
              background: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: '24px',
              textAlign: 'center',
              color: '#94a3b8'
            }}>
              No broker transaction records matching current filters.
            </div>
          )}

          {/* View Mode: Date-Wise Buying & Selling Breakdown */}
          {viewMode === 'datewise' && (
            <div style={{
              background: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '16px',
              overflowX: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                  Date-Wise Broker Buying & Selling Sessions ({dailyFlowList.length} Trading Days)
                </span>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  Click any date to inspect full broker cards for that day
                </span>
              </div>
              {dailyFlowList.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                  Select 7 Days, 15 Days, or 30 Days above to load multi-day date-wise broker sessions.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>DATE</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>VOLUME</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>AMOUNT</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>VWAP</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP BUYER</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP SELLER</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>TRADES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyFlowList.map(df => (
                      <tr
                        key={df.date}
                        onClick={() => {
                          handleDateSelect(df.date);
                          setViewMode('cards');
                        }}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          background: effectiveDate === df.date ? 'rgba(2, 132, 199, 0.15)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '9px 6px', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                          {df.date}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'right', color: '#ffffff', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {Number(df.buyVol || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                          {formatShareHubCurrency(df.turnover || df.amount || 0)}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'right', color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                          {df.vwap ? `Rs ${df.vwap}` : '—'}
                        </td>
                        <td style={{ padding: '9px 6px', color: '#10b981', fontWeight: 700 }}>
                          {df.topBuyer ? `#${df.topBuyer.broker} (${Number(df.topBuyer.buyQty || 0).toLocaleString()})` : '—'}
                        </td>
                        <td style={{ padding: '9px 6px', color: '#f43f5e', fontWeight: 700 }}>
                          {df.topSeller ? `#${df.topSeller.broker} (${Number(df.topSeller.sellQty || 0).toLocaleString()})` : '—'}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'right', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                          {Number(df.totalTrades || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* View Mode: Compact Table */}
          {viewMode === 'compact' && filteredBrokers.length > 0 && (
            <div style={{
              background: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '12px 14px',
              overflowX: 'auto'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                    <th style={{ padding: '8px 6px', textAlign: 'left' }}>BROKER</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>BUY QTY</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>SELL QTY</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>MATCHED</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>HOLD QTY</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>HOLD AMT</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>AVG BUY</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>AVG SELL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrokers.slice(0, 60).map(b => {
                    const isNetPos = b.signedHoldQty >= 0;
                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 6px', color: '#ffffff', fontWeight: 700 }}>
                          #{b.id} <span style={{ color: '#94a3b8', fontWeight: 500 }}>{b.name}</span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                          {b.buyQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                          {b.sellQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                          {b.matchedQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: isNetPos ? '#38bdf8' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                          {b.signedHoldQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: isNetPos ? '#38bdf8' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                          {formatShareHubCurrency(b.holdAmt)}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                          {b.avgBuy > 0 ? b.avgBuy.toFixed(2) : '0.00'}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                          {b.avgSell > 0 ? b.avgSell.toFixed(2) : '0.00'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* View Mode: Share Hub Broker Cards */}
          {viewMode === 'cards' && filteredBrokers.slice(0, 40).map(b => {
            const isNetPositive = b.signedHoldQty >= 0;
            const isPureBuy = b.buyQty > 0 && b.sellQty === 0;
            const isPureSell = b.sellQty > 0 && b.buyQty === 0;

            return (
              <div
                key={b.id}
                style={{
                  background: '#111827',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                {/* Card Title */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isNetPositive ? (
                      <TrendingUp style={{ width: 16, height: 16, color: '#38bdf8' }} />
                    ) : (
                      <TrendingDown style={{ width: 16, height: 16, color: '#f43f5e' }} />
                    )}
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                      {b.name} <span style={{ color: '#94a3b8', fontSize: 12.5 }}>(Broker No: {b.id})</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {activeDateDisplay && (
                      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                        {activeDateDisplay}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => exportStockFloorsheet({
                        symbol,
                        date: effectiveDate || '',
                        days: effectiveDate ? 1 : effectiveDays,
                        broker: String(b.id),
                        dataset: 'transactions',
                        format: 'csv'
                      })}
                      title={`Download all floorsheet transactions where Broker #${b.id} (${b.name}) bought or sold ${symbol}`}
                      style={{
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: 6,
                        padding: '3px 8px',
                        color: '#38bdf8',
                        fontSize: 10.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Download style={{ width: 11, height: 11 }} />
                      <span>#{b.id} Trades</span>
                    </button>
                  </div>
                </div>

                {/* Dual-Color Buy vs Sell Distribution Bar (Exact Share Hub labels) */}
                <div>
                  <div style={{
                    display: 'flex',
                    height: 20,
                    borderRadius: 6,
                    overflow: 'hidden',
                    fontWeight: 800,
                    fontSize: 11,
                    textAlign: 'center',
                    lineHeight: '20px'
                  }}>
                    {isPureBuy ? (
                      <div style={{ width: '100%', background: '#10b981', color: '#ffffff' }}>
                        Buy & Hold 100%
                      </div>
                    ) : isPureSell ? (
                      <div style={{ width: '100%', background: '#f43f5e', color: '#ffffff' }}>
                        Sell 100% • No Holdings
                      </div>
                    ) : (
                      <>
                        <div style={{ width: `${b.buyPct}%`, background: '#10b981', color: '#0f172a' }}>
                          {b.buyPct > 10 ? `Buy ${b.buyPct}%` : ''}
                        </div>
                        <div style={{ width: `${b.sellPct}%`, background: '#f43f5e', color: '#ffffff' }}>
                          {b.sellPct > 10 ? `Sell ${b.sellPct}%` : ''}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Hold Percentage Indicator Slider */}
                  {b.buyQty > 0 && b.signedHoldQty > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{ height: 3, flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${b.holdPctOfBuy}%`, height: '100%', background: '#38bdf8' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>
                        Hold {b.holdPctOfBuy}% of buy qty
                      </span>
                      <div style={{ height: 3, flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }} />
                    </div>
                  )}
                </div>

                {/* 3-Column Metrics Grid (Share Hub Parity) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px 8px',
                  paddingTop: 6,
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Hold Volume</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: isNetPositive ? '#38bdf8' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      {b.signedHoldQty.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Hold Amount</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: isNetPositive ? '#38bdf8' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      {formatShareHubCurrency(b.holdAmt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Matched</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {b.matchedQty.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Buy Volume</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {b.buyQty.toLocaleString()} <span style={{ fontSize: 11, color: '#10b981' }}>({b.buyMktShare}%)</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Buy Amount</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {formatShareHubCurrency(b.buyAmt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Avg Buy Price</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {b.avgBuy > 0 ? b.avgBuy.toFixed(2) : '0.00'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Sell Volume</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      {b.sellQty.toLocaleString()} <span style={{ fontSize: 11, color: '#f43f5e' }}>({b.sellMktShare}%)</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Sell Amount</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      {formatShareHubCurrency(b.sellAmt)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Avg Sell Price</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      {b.avgSell > 0 ? b.avgSell.toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sub-tab 2: Accumulation & Distribution Concentration + Date-Wise Flow ── */}
      {activeSubTab === 'acc_dist' && (
        <div style={{
          background: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
              Institutional Accumulation vs Distribution Metrics
            </div>
            {activeDateDisplay && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                {activeDateDisplay}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>Total Buy Volume</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {totalVolume.toLocaleString()} kitta
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>Total Net Held Float</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {totalHold.toLocaleString()} kitta
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
              <div style={{ fontSize: 12, color: '#c084fc', fontWeight: 700 }}>A/D Signal ({activeBrokerData?.period || `${effectiveDays}D`})</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {activeBrokerData?.adSignal || 'Neutral'} {activeBrokerData?.adStrength ? `(${activeBrokerData.adStrength})` : ''}
              </div>
            </div>
          </div>

          {/* Date-Wise Buying & Selling Table inside Acc. & Dist. */}
          {dailyFlowList.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
                Date-Wise Buying & Selling Flow ({dailyFlowList.length} Sessions)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>DATE</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>TRADED QTY</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>TURNOVER</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP ACCUMULATOR</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP DISTRIBUTOR</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>NET INST. FLOW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyFlowList.map(df => {
                      const net = Number(df.netFlow || 0);
                      return (
                        <tr
                          key={df.date}
                          onClick={() => {
                            handleDateSelect(df.date);
                            setActiveSubTab('brokers');
                          }}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '8px 6px', color: '#38bdf8', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            {df.date}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                            {Number(df.buyVol || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                            {formatShareHubCurrency(df.turnover || 0)}
                          </td>
                          <td style={{ padding: '8px 6px', color: '#10b981', fontWeight: 700 }}>
                            {(() => {
                              const acc = df.topAccumulator || df.topHolder || df.topBuyer;
                              const accId = acc?.broker || acc?.brokerId || acc?.id;
                              const accVal = acc ? (acc.netQty != null && acc.netQty !== 0 ? acc.netQty : (acc.buyQty || 0)) : 0;
                              return accId ? `#${accId} (+${formatCompactQty(accVal)})` : '—';
                            })()}
                          </td>
                          <td style={{ padding: '8px 6px', color: '#f43f5e', fontWeight: 700 }}>
                            {(() => {
                              const dist = df.topDistributor || df.topSeller;
                              const distId = dist?.broker || dist?.brokerId || dist?.id;
                              const distVal = dist ? (dist.sellQty || Math.abs(dist.netQty || 0)) : 0;
                              return distId ? `#${distId} (-${formatCompactQty(distVal)})` : '—';
                            })()}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: net >= 0 ? '#10b981' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                            {net >= 0 ? '+' : ''}{net.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-tab 3: Zero Sum Floorsheet (Free & Unlocked!) ── */}
      {activeSubTab === 'zero_sum' && (
        <div style={{
          background: '#111827',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck style={{ width: 18, height: 18, color: '#10b981' }} />
              <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
                Zero Sum Conservation Floorsheet
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Unit Toggle: Amount vs Qty */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setZeroSumUnit('amount')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: zeroSumUnit === 'amount' ? '#0284c7' : 'transparent',
                    color: zeroSumUnit === 'amount' ? '#ffffff' : '#94a3b8'
                  }}
                >
                  Amount (Rs.)
                </button>
                <button
                  type="button"
                  onClick={() => setZeroSumUnit('qty')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: zeroSumUnit === 'qty' ? '#0284c7' : 'transparent',
                    color: zeroSumUnit === 'qty' ? '#ffffff' : '#94a3b8'
                  }}
                >
                  Quantity (Kitta)
                </button>
              </div>

              {activeDateDisplay && (
                <span style={{ fontSize: 11.5, color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {activeDateDisplay}
                </span>
              )}
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                Full Access Unlocked
              </span>
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 14 }}>
            In NEPSE secondary trading, every buy share has an exact matching sell share (∑ Buy = ∑ Sell).
            Zero Sum Floorsheet isolates net institutional capital inflow:
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                  <th style={{ padding: '8px 6px' }}>BROKER</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>BUY {zeroSumUnit === 'amount' ? '(RS.)' : '(KITTA)'}</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>SELL {zeroSumUnit === 'amount' ? '(RS.)' : '(KITTA)'}</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>MATCHED</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>NET FLOW {zeroSumUnit === 'amount' ? '(RS.)' : '(KITTA)'}</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {brokerRecords.slice(0, 30).map((b, idx) => {
                  const netQty = b.buyQty - b.sellQty;
                  const isNetBuy = zeroSumUnit === 'amount' ? (b.netAmt > 0) : (netQty > 0);
                  const buyDisplay = zeroSumUnit === 'amount' ? formatShareHubCurrency(b.buyAmt) : b.buyQty.toLocaleString();
                  const sellDisplay = zeroSumUnit === 'amount' ? formatShareHubCurrency(b.sellAmt) : b.sellQty.toLocaleString();
                  const matchedDisplay = zeroSumUnit === 'amount' ? formatShareHubCurrency(b.matchedAmt || (b.matchedQty * (b.avgBuy || ltp || 100))) : b.matchedQty.toLocaleString();
                  const netDisplay = zeroSumUnit === 'amount'
                    ? ((b.netAmt >= 0 ? '+' : '') + formatShareHubCurrency(b.netAmt))
                    : ((netQty >= 0 ? '+' : '') + netQty.toLocaleString());

                  return (
                    <tr key={b.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 6px', color: '#ffffff', fontWeight: 600 }}>
                        #{b.id} {b.name}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                        {buyDisplay}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                        {sellDisplay}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                        {matchedDisplay}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: isNetBuy ? '#10b981' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                        {netDisplay}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                          background: isNetBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                          color: isNetBuy ? '#10b981' : '#f43f5e'
                        }}>
                          {isNetBuy ? 'ACCUMULATOR' : 'DISTRIBUTOR'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
