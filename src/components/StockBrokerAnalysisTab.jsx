import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Layers, ShieldCheck, Filter,
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart2, PieChart, Info,
  Calendar, LayoutGrid, List, Search, RotateCcw, Download
} from 'lucide-react';
import { getBrokerName, formatBrokerAmount } from '../utils/accumulationDistributionEngine';
import { exportBrokerAnalysisReport, exportStockFloorsheet } from '../utils/floorsheetExport';
import { fetchRealBrokerAnalysis, fetchFromBackend } from '../utils/liveData';

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
  loading = false,
  allTimeHoldingData = null
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
  const [localFromDate, setLocalFromDate] = useState('');
  const [localToDate, setLocalToDate] = useState('');
  const [internalBrokerData, setInternalBrokerData] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [tableHoldingView, setTableHoldingView] = useState('cumulative'); // 'session' | 'cumulative' (default to cumulative holding till today)
  const [cumulativeHoldingMap, setCumulativeHoldingMap] = useState({});
  const [totalCumulativeHoldingKitta, setTotalCumulativeHoldingKitta] = useState(0);
  const [allStoredDates, setAllStoredDates] = useState([]);
  const [multiDayDailyFlow, setMultiDayDailyFlow] = useState([]);
  const [dateSortOrder, setDateSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [dateSortField, setDateSortField] = useState('date'); // 'date' | 'volume' | 'turnover' | 'vwap' | 'trades'
  const [tableSortField, setTableSortField] = useState('cumHoldQty'); // 'cumHoldQty' | 'id' | 'cumHoldAmt' | 'cumAvgBuy' | 'cumAvgSell' | 'cumRetentionPct'
  const [tableSortOrder, setTableSortOrder] = useState('desc'); // 'desc' | 'asc'

  // Sync props to local state
  useEffect(() => {
    if (selectedDays) setLocalDays(selectedDays);
  }, [selectedDays]);

  useEffect(() => {
    if (selectedDate !== undefined) setLocalDate(selectedDate);
  }, [selectedDate]);

  const effectiveDays = onDaysChange ? selectedDays : localDays;
  const effectiveDate = onDateChange ? selectedDate : localDate;

  // Prefetch Multi-Day / 30-Day Cumulative Broker Holding Baseline Till Today & Full Month Sessions
  useEffect(() => {
    let active = true;
    if (!symbol) return;

    const parseAndSetHoldings = (bList, dateList = [], flowList = []) => {
      if (!Array.isArray(bList) || bList.length === 0) return false;
      const map = {};
      for (const b of bList) {
        const id = String(b.brokerId || b.broker || b.id || b.brokerNo || '').replace(/^0+/, '');
        if (!id) continue;
        const buyQty = Number(b.buyQty ?? b.buyVol ?? b.buyKitta ?? b.volume ?? 0);
        const sellQty = Number(b.sellQty ?? b.sellVol ?? b.sellKitta ?? 0);
        const netQty = Number(b.netQty ?? b.netKitta ?? b.signedHoldQty ?? b.netVol ?? b.remainingQty ?? b.holdKitta ?? (buyQty - sellQty));
        const buyAmt = Number(b.buyAmt ?? b.buyAmount ?? b.buyTurnoverNpr ?? 0);
        const sellAmt = Number(b.sellAmt ?? b.sellAmount ?? b.sellTurnoverNpr ?? 0);
        const avgBuy = Number(b.avgBuyRate ?? b.avgBuyPrice ?? (buyQty > 0 ? buyAmt / buyQty : 0));
        const avgSell = Number(b.avgSellRate ?? b.avgSellPrice ?? (sellQty > 0 ? sellAmt / sellQty : 0));
        const holdAmt = netQty > 0 ? (b.holdAmt || b.totalHeldAmt || (buyAmt - sellAmt > 0 ? buyAmt - sellAmt : netQty * (avgBuy || ltp || 100))) : 0;
        const retention = buyQty > 0 ? Number(((Math.max(0, netQty) / buyQty) * 100).toFixed(1)) : (b.retentionPct !== undefined ? Number(b.retentionPct) : 0);
        map[id] = {
          id,
          name: b.name || b.brokerName || getBrokerName(id),
          totalHeldQty: Math.max(0, netQty),
          netQty,
          totalHeldAmt: holdAmt,
          avgBuyRate: +avgBuy.toFixed(2),
          avgSellRate: +avgSell.toFixed(2),
          retentionPct: retention,
          totalBuyQty: buyQty,
          totalSellQty: sellQty,
        };
      }
      if (Object.keys(map).length > 0) {
        setCumulativeHoldingMap(map);
        if (Array.isArray(dateList) && dateList.length > 0) {
          setAllStoredDates(dateList);
        }
        if (Array.isArray(flowList) && flowList.length > 0) {
          setMultiDayDailyFlow(flowList);
        }
        return true;
      }
      return false;
    };

    // Immediate hydration from allTimeHoldingData prop if provided
    if (allTimeHoldingData) {
      const propBrokers = allTimeHoldingData.allHoldings || allTimeHoldingData.topHoldings || allTimeHoldingData.brokers || [];
      const propDates = allTimeHoldingData.availableDates || [];
      const propFlow = allTimeHoldingData.dailyFlow || [];
      if (propBrokers.length > 0) {
        parseAndSetHoldings(propBrokers, propDates, propFlow);
      }
      if (allTimeHoldingData.totalSharesHeldTillNow) {
        setTotalCumulativeHoldingKitta(Number(allTimeHoldingData.totalSharesHeldTillNow));
      }
    }

    // Parallel fetch: All-Time Broker Vault + All-Time Smart-Money endpoint + Diagnostics endpoint
    const p0 = fetchRealBrokerAnalysis(symbol, 'all', { refresh: false }).catch(() => null);
    const p1 = fetchFromBackend(`/api/stocks/${encodeURIComponent(symbol)}/smart-money?days=all`, 12000).catch(() => null);
    const p2 = fetchFromBackend(`/api/diagnostics/${encodeURIComponent(symbol)}?days=30`, 10000).catch(() => null);

    Promise.all([p0, p1, p2]).then(([resAll, resSm, resDiag]) => {
      if (!active) return;

      // Extract daily session flow (30 trading days)
      const flow = (Array.isArray(resDiag?.data?.dailyFlow) && resDiag.data.dailyFlow.length > 0)
        ? resDiag.data.dailyFlow
        : (Array.isArray(resDiag?.dailyFlow) && resDiag.dailyFlow.length > 0
            ? resDiag.dailyFlow
            : (Array.isArray(resAll?.dailyFlow) && resAll.dailyFlow.length > 0
                ? resAll.dailyFlow
                : (Array.isArray(resSm?.dailyFlow) ? resSm.dailyFlow : (Array.isArray(resSm?.data?.dailyFlow) ? resSm.data.dailyFlow : []))));
      if (flow.length > 0) {
        setMultiDayDailyFlow(flow);
      }

      // Extract all stored trading dates (full multi-year floorsheet dates)
      const dates = (
        (Array.isArray(resAll?.availableDates) && resAll.availableDates.length > 0) ? resAll.availableDates :
        (Array.isArray(resSm?.availableDates) && resSm.availableDates.length > 0) ? resSm.availableDates :
        (Array.isArray(resSm?.data?.availableDates) && resSm.data.availableDates.length > 0) ? resSm.data.availableDates :
        (Array.isArray(resDiag?.data?.availableDates) ? resDiag.data.availableDates : (resDiag?.availableDates || []))
      );
      if (Array.isArray(dates) && dates.length > 0) {
        setAllStoredDates(dates);
      }

      // Extract total cumulative shares held till now (authentic accumulator pool)
      const totalHeld = Number(
        resAll?.totalSharesHeldTillNow ||
        resSm?.totalSharesHeldTillNow ||
        resSm?.data?.totalSharesHeldTillNow ||
        resDiag?.data?.totalSharesHeldTillNow ||
        resDiag?.totalSharesHeldTillNow ||
        0
      );
      if (totalHeld > 0) {
        setTotalCumulativeHoldingKitta(totalHeld);
      }

      // Extract broker list (prioritize all-time holdings with full multi-year totals)
      const listAll = (Array.isArray(resAll?.allHoldings) && resAll.allHoldings.length > 0)
        ? resAll.allHoldings
        : ((Array.isArray(resSm?.allHoldings) && resSm.allHoldings.length > 0)
            ? resSm.allHoldings
            : ((Array.isArray(resSm?.data?.allHoldings) && resSm.data.allHoldings.length > 0)
                ? resSm.data.allHoldings
                : (resAll?.topHoldings?.length ? resAll.topHoldings : (resAll?.brokers || []))));
      const listSm = Array.isArray(resSm)
        ? resSm
        : (Array.isArray(resSm?.data)
            ? resSm.data
            : (resSm?.allHoldings || resSm?.allBrokers || resSm?.topHoldings || resSm?.brokers || resSm?.data?.allBrokers || []));
      const listDiag = resDiag?.data?.allBrokers || resDiag?.data?.brokers || resDiag?.allBrokers || resDiag?.brokers || [];
      const primaryList = (listAll.length > 0) ? listAll : ((Array.isArray(listSm) && listSm.length > 0) ? listSm : listDiag);

      const parsed = parseAndSetHoldings(primaryList, dates, flow);
      if (!parsed && listDiag.length > 0) {
        parseAndSetHoldings(listDiag, dates, flow);
      }

      // If symbol's all-time historical floorsheet is still syncing in the background, poll every 4s until complete
      if (resSm && resSm.isCompleteHistory === false) {
        const pollTimer = setTimeout(() => {
          if (!active) return;
          fetchFromBackend(`/api/stocks/${encodeURIComponent(symbol)}/smart-money?days=all`, 12000)
            .then(updatedSm => {
              if (active && updatedSm && updatedSm.success) {
                const updatedList = Array.isArray(updatedSm.data) ? updatedSm.data : (updatedSm.allHoldings || updatedSm.brokers || []);
                if (updatedList.length > 0) {
                  parseAndSetHoldings(updatedList, updatedSm.availableDates || dates, flow);
                }
                if (updatedSm.totalSharesHeldTillNow) {
                  setTotalCumulativeHoldingKitta(Number(updatedSm.totalSharesHeldTillNow));
                }
              }
            })
            .catch(() => {});
        }, 4000);
        return () => clearTimeout(pollTimer);
      }
    });

    return () => { active = false; };
  }, [symbol, ltp, allTimeHoldingData]);

  // Auto-fetch if brokerData is missing, empty, or from a different timeframe
  useEffect(() => {
    let active = true;
    if (!symbol) return;
    const propMatchesTimeframe = brokerData && (
      (brokerData.timeframeDays === effectiveDays || (!brokerData.timeframeDays && effectiveDays === 1)) &&
      (Array.isArray(brokerData.brokers) && brokerData.brokers.length > 0)
    );
    if (propMatchesTimeframe && !effectiveDate) {
      setInternalBrokerData(null);
      return;
    }

    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, effectiveDays, { date: effectiveDate, refresh: true })
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

  const activeBrokerData = (internalBrokerData && (
    (Array.isArray(internalBrokerData.brokers) && internalBrokerData.brokers.length > 0) ||
    (Array.isArray(internalBrokerData.dailyFlow) && internalBrokerData.dailyFlow.length > 0)
  )) ? internalBrokerData : (brokerData || null);

  const isTabLoading = Boolean(loading || internalLoading);

  const handleDaysSelect = (d) => {
    setLocalDays(d);
    setLocalDate('');
    if (onDateChange) onDateChange('');
    if (onDaysChange) onDaysChange(d);
    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, d, { date: '', refresh: true })
      .then(res => { if (res) setInternalBrokerData(res); })
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  };

  const handleDateSelect = (dt) => {
    setLocalDate(dt);
    setLocalFromDate('');
    setLocalToDate('');
    if (onDateChange) onDateChange(dt);
    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, effectiveDays, { date: dt, refresh: true })
      .then(res => { if (res) setInternalBrokerData(res); })
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  };

  const handleRangeApply = (fromVal = localFromDate, toVal = localToDate) => {
    if (!fromVal && !toVal) return;
    setLocalDate('');
    setInternalLoading(true);
    fetchRealBrokerAnalysis(symbol, 500, { fromDate: fromVal, toDate: toVal, refresh: true })
      .then(res => { if (res) setInternalBrokerData(res); })
      .catch(() => {})
      .finally(() => setInternalLoading(false));
  };

  const handleRangeReset = () => {
    setLocalFromDate('');
    setLocalToDate('');
    handleDaysSelect(1);
  };

  // Extract available trading dates from activeBrokerData or floorsheetData
  const availableDates = useMemo(() => {
    const set = new Set();
    allStoredDates.forEach(d => d && set.add(String(d)));
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
  }, [activeBrokerData, floorsheetData, allStoredDates]);

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
        const buyQty = Number(b.buyQty ?? b.buyVol ?? b.volume ?? b.kitta ?? b.shares ?? 0);
        const buyAmt = Number(b.buyAmt ?? b.buyAmount ?? b.buyTurnover ?? b.amount ?? (buyQty * (b.avgBuyRate || ltp || 100)) ?? 0);
        const sellQty = Number(b.sellQty ?? b.sellVol ?? b.shares ?? 0);
        const sellAmt = Number(b.sellAmt ?? b.sellAmount ?? b.sellTurnover ?? b.amount ?? (sellQty * (b.avgSellRate || ltp || 100)) ?? 0);
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
        rec.buyQty += Number(b.buyQty ?? b.buyVol ?? b.volume ?? b.kitta ?? b.shares ?? 0);
        rec.buyAmt += Number(b.buyAmt ?? b.buyAmount ?? b.buyTurnover ?? b.amount ?? (rec.buyQty * (b.avgBuyRate || ltp || 100)) ?? 0);
        if ((b.sellQty !== undefined || b.sellVol !== undefined) && rec.sellQty === 0) rec.sellQty = Number(b.sellQty ?? b.sellVol ?? 0);
        if ((b.sellAmt !== undefined || b.sellTurnover !== undefined) && rec.sellAmt === 0) rec.sellAmt = Number(b.sellAmt ?? b.sellTurnover ?? (rec.sellQty * (b.avgSellRate || ltp || 100)) ?? 0);
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
          rec.sellQty += Number(s.sellQty ?? s.sellVol ?? s.volume ?? s.kitta ?? s.shares ?? 0);
          rec.sellAmt += Number(s.sellAmt ?? s.sellAmount ?? s.sellTurnover ?? s.amount ?? (rec.sellQty * (s.avgSellRate || ltp || 100)) ?? 0);
        }
        if ((s.buyQty !== undefined || s.buyVol !== undefined) && rec.buyQty === 0) rec.buyQty = Number(s.buyQty ?? s.buyVol ?? 0);
        if ((s.buyAmt !== undefined || s.buyTurnover !== undefined) && rec.buyAmt === 0) rec.buyAmt = Number(s.buyAmt ?? s.buyTurnover ?? (rec.buyQty * (s.avgBuyRate || ltp || 100)) ?? 0);
        if (s.matchedQty !== undefined && rec.matchedQty === 0) rec.matchedQty = Number(s.matchedQty || 0);
      }

      for (const h of holdings) {
        const id = String(h.brokerId || h.broker || h.brokerNo || h.id || h.memberId || '').trim();
        if (!id || id === '?') continue;
        if (!map.has(id)) {
          const buyQ = Number(h.buyQty ?? h.buyVol ?? h.volume ?? h.kitta ?? 0);
          const sellQ = Number(h.sellQty ?? h.sellVol ?? 0);
          map.set(id, {
            id,
            name: h.name || h.brokerName || getBrokerName(id),
            buyQty: buyQ,
            buyAmt: Number(h.buyAmt ?? h.buyAmount ?? h.buyTurnover ?? (buyQ * (h.avgBuyRate || ltp || 100)) ?? 0),
            sellQty: sellQ,
            sellAmt: Number(h.sellAmt ?? h.sellAmount ?? h.sellTurnover ?? (sellQ * (h.avgSellRate || ltp || 100)) ?? 0),
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

    // Incorporate multi-day cumulative ledger accumulators holding this scrip
    if (cumulativeHoldingMap && typeof cumulativeHoldingMap === 'object') {
      for (const [id, c] of Object.entries(cumulativeHoldingMap)) {
        const normId = String(id).replace(/^0+/, '');
        if (!map.has(normId) && !map.has(id) && c && (c.totalHeldQty > 0 || c.netQty > 0)) {
          map.set(normId, {
            id: normId,
            name: c.name || getBrokerName(normId),
            buyQty: c.totalBuyQty || c.totalHeldQty || 0,
            buyAmt: c.totalBuyQty ? (c.totalBuyQty * (c.avgBuyRate || ltp || 100)) : 0,
            sellQty: c.totalSellQty || 0,
            sellAmt: c.totalSellQty ? (c.totalSellQty * (c.avgSellRate || ltp || 100)) : 0,
            matchedQty: 0,
            matchedAmt: 0,
            trades: 0,
            isHistoricalHolderOnly: true
          });
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

      const idKey = String(r.id || '').replace(/^0+/, '');
      const hasCumData = cumulativeHoldingMap && Object.keys(cumulativeHoldingMap).length > 0;
      const cum = cumulativeHoldingMap[idKey] || cumulativeHoldingMap[String(r.id)] || null;
      const cumHold = cum ? (cum.totalHeldQty || 0) : 0;
      const cumAmt = cum ? (cum.totalHeldAmt || (cumHold * (cum.avgBuyRate || ltp || 100))) : 0;
      const cumBuyPx = cum ? (cum.avgBuyRate || 0) : 0;
      const cumSellPx = cum ? (cum.avgSellRate || 0) : 0;
      const cumRet = cum ? (cum.retentionPct || 0) : 0;

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
        sellMktShare: +((r.sellQty / totalSellVol) * 100).toFixed(2),
        cumHoldQty: cumHold,
        cumHoldAmt: cumAmt,
        cumAvgBuy: cumBuyPx,
        cumAvgSell: cumSellPx,
        cumRetentionPct: cumRet,
      };
    });

    // Sort by holdQty descending, then totalTrade descending
    return list.sort((a, b) => b.signedHoldQty - a.signedHoldQty || b.totalTrade - a.totalTrade);
  }, [floorsheetData, activeBrokerData, ltp, cumulativeHoldingMap]);

  // Top Chart Data (TOP HOLDINGS | TOP BUYERS | TOP SELLERS) dynamically driven by rankingMetric
  const chartItems = useMemo(() => {
    const isAmountMetric = rankingMetric === 'netFlow' || rankingMetric === 'grossAmt';

    if (chartTab === 'holdings') {
      if (rankingMetric === 'netFlow') {
        const enriched = brokerRecords.map(b => ({
          ...b,
          effectiveHoldAmt: (b.cumHoldAmt !== undefined && b.cumHoldAmt > 0) ? b.cumHoldAmt : Math.max(0, b.netAmt || 0)
        })).filter(b => b.effectiveHoldAmt > 0);
        const list = enriched.length > 0 ? enriched : brokerRecords;
        return [...list]
          .sort((a, b) => b.effectiveHoldAmt - a.effectiveHoldAmt)
          .slice(0, 10)
          .map(b => ({
            id: b.id,
            name: b.name,
            value: b.effectiveHoldAmt,
            displayVal: formatShareHubCurrency(b.effectiveHoldAmt),
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
      // Default: netQty (Actual Total Kitta Held Till Today!)
      const enriched = brokerRecords.map(b => ({
        ...b,
        effectiveHoldQty: (b.cumHoldQty !== undefined && b.cumHoldQty > 0) ? b.cumHoldQty : (b.signedHoldQty > 0 ? b.signedHoldQty : (b.totalHeldQty || b.buyQty || 0))
      })).filter(b => b.effectiveHoldQty > 0);
      const list = enriched.length > 0 ? enriched : brokerRecords;
      return [...list]
        .sort((a, b) => b.effectiveHoldQty - a.effectiveHoldQty)
        .slice(0, 10)
        .map(b => ({
          id: b.id,
          name: b.name,
          value: b.effectiveHoldQty,
          displayVal: `${formatCompactQty(b.effectiveHoldQty)} kitta`,
          color: '#10b981'
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
      list = list.filter(b => (b.signedHoldQty || b.netQty || 0) > 0);
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

    // In Session Flow view, only show brokers who actively traded in this session
    if (viewMode === 'compact' && tableHoldingView === 'session') {
      list = list.filter(b => !b.isHistoricalHolderOnly);
    }

    return list;
  }, [brokerRecords, brokerRoleFilter, chartTab, filterQuery, rankingMetric, viewMode, tableHoldingView]);

  // Summary Totals (Share Hub strip: Total Amount | Total Quantity | Total Broker Holding | Transactions)
  const totalVolume = Number(activeBrokerData?.totalVolume) || brokerRecords.reduce((s, b) => s + b.buyQty, 0);
  const totalAmount = Number(activeBrokerData?.totalAmount) || brokerRecords.reduce((s, b) => s + b.buyAmt, 0);
  const totalTransactions = Number(activeBrokerData?.totalTrades) || (Array.isArray(floorsheetData?.rows) ? floorsheetData.totalElements || floorsheetData.rows.length : (Array.isArray(floorsheetData) ? floorsheetData.length : brokerRecords.reduce((s, b) => s + (b.trades || 0), 0)));
  const totalHold = brokerRecords.reduce((s, b) => s + b.holdQty, 0);

  // Aggregated totals across all brokers (Session & Till Today Cumulative Baseline)
  const brokerHoldingTotals = useMemo(() => {
    let sessionBuy = 0;
    let sessionSell = 0;
    let sessionMatched = 0;
    let sessionHold = 0;
    let cumHold = 0;
    let cumHoldAmt = 0;
    let totalBuyAmt = 0;
    let totalSellAmt = 0;

    for (const b of brokerRecords) {
      sessionBuy += (b.buyQty || 0);
      sessionSell += (b.sellQty || 0);
      sessionMatched += (b.matchedQty || 0);
      if (b.signedHoldQty > 0) {
        sessionHold += b.signedHoldQty;
      }
      totalBuyAmt += (b.buyAmt || 0);
      totalSellAmt += (b.sellAmt || 0);
    }

    // Authoritative cumulative sum across all accumulators holding stock till today
    if (cumulativeHoldingMap && Object.keys(cumulativeHoldingMap).length > 0) {
      for (const c of Object.values(cumulativeHoldingMap)) {
        if (c && (c.totalHeldQty > 0 || c.netQty > 0)) {
          const qty = c.totalHeldQty || Math.max(0, c.netQty || 0);
          cumHold += qty;
          cumHoldAmt += (c.totalHeldAmt || (qty * (c.avgBuyRate || ltp || 100)));
        }
      }
    } else {
      for (const b of brokerRecords) {
        const cH = b.cumHoldQty !== undefined && b.cumHoldQty > 0 ? b.cumHoldQty : Math.max(0, b.signedHoldQty || 0);
        if (cH > 0) {
          cumHold += cH;
          cumHoldAmt += (b.cumHoldAmt || (cH * (b.cumAvgBuy || b.avgBuy || ltp || 100)));
        }
      }
    }

    if (cumHold <= 0 && totalCumulativeHoldingKitta > 0) {
      cumHold = totalCumulativeHoldingKitta;
    }

    const weightedAvgBuy = sessionBuy > 0 ? +(totalBuyAmt / sessionBuy).toFixed(2) : 0;
    const weightedAvgSell = sessionSell > 0 ? +(totalSellAmt / sessionSell).toFixed(2) : 0;
    const overallRetention = sessionBuy > 0 ? Math.round((sessionHold / sessionBuy) * 100) : 0;

    return {
      sessionBuy,
      sessionSell,
      sessionMatched,
      sessionHold,
      cumHold: cumHold > 0 ? cumHold : sessionHold,
      cumHoldAmt,
      weightedAvgBuy,
      weightedAvgSell,
      overallRetention
    };
  }, [brokerRecords, cumulativeHoldingMap, totalCumulativeHoldingKitta, ltp]);

  // Daily flow records for Date-Wise Broker Buying/Selling table (Full History)
  const dailyFlowList = useMemo(() => {
    const map = new Map();
    if (Array.isArray(multiDayDailyFlow)) {
      multiDayDailyFlow.forEach(df => { if (df?.date) map.set(df.date, df); });
    }
    if (Array.isArray(activeBrokerData?.dailyFlow)) {
      activeBrokerData.dailyFlow.forEach(df => { if (df?.date) map.set(df.date, df); });
    }
    // Incorporate all dates from availableDates so the entire historical matrix is visible & selectable
    if (Array.isArray(availableDates)) {
      for (const dt of availableDates) {
        if (!map.has(dt)) {
          map.set(dt, {
            date: dt,
            totalVolume: null,
            turnover: null,
            vwap: null,
            totalTrades: null,
            isHistoricalDate: true
          });
        }
      }
    }
    return Array.from(map.values());
  }, [activeBrokerData, multiDayDailyFlow, availableDates]);

  // Full Month Date-Wise Sorted List
  const sortedDailyFlowList = useMemo(() => {
    const list = [...dailyFlowList];
    list.sort((a, b) => {
      if (dateSortField === 'date') {
        const valA = String(a.date || '');
        const valB = String(b.date || '');
        return dateSortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      let valA = 0;
      let valB = 0;
      if (dateSortField === 'volume') {
        valA = Number(a.totalVolume || a.buyVol || 0);
        valB = Number(b.totalVolume || b.buyVol || 0);
      } else if (dateSortField === 'turnover') {
        valA = Number(a.turnover || a.amount || 0);
        valB = Number(b.turnover || b.amount || 0);
      } else if (dateSortField === 'vwap') {
        valA = Number(a.vwap || 0);
        valB = Number(b.vwap || 0);
      } else if (dateSortField === 'trades') {
        valA = Number(a.totalTrades || 0);
        valB = Number(b.totalTrades || 0);
      }
      return dateSortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [dailyFlowList, dateSortField, dateSortOrder]);

  // Cumulative Table Sorted List (Total Holding Till Today across all accumulators)
  const sortedCumulativeBrokers = useMemo(() => {
    const map = new Map();
    // Seed with cumulativeHoldingMap (authoritative multi-day holdings)
    if (cumulativeHoldingMap && Object.keys(cumulativeHoldingMap).length > 0) {
      for (const [id, c] of Object.entries(cumulativeHoldingMap)) {
        if (c && (c.totalHeldQty > 0 || c.netQty > 0)) {
          const normId = String(id).replace(/^0+/, '');
          map.set(normId, {
            id: normId,
            name: c.name || getBrokerName(normId),
            buyQty: c.totalBuyQty || c.totalHeldQty || 0,
            sellQty: c.totalSellQty || 0,
            matchedQty: 0,
            signedHoldQty: c.netQty || c.totalHeldQty || 0,
            holdQty: c.totalHeldQty || 0,
            cumHoldQty: c.totalHeldQty || 0,
            cumHoldAmt: c.totalHeldAmt || (c.totalHeldQty * (c.avgBuyRate || ltp || 100)),
            cumAvgBuy: c.avgBuyRate || 0,
            cumAvgSell: c.avgSellRate || 0,
            cumRetentionPct: c.retentionPct || 0,
            avgBuy: c.avgBuyRate || 0,
            avgSell: c.avgSellRate || 0,
            holdAmt: c.totalHeldAmt || 0
          });
        }
      }
    }
    // Overlay or add brokers from brokerRecords only if already possessing cumHoldQty
    for (const b of filteredBrokers) {
      const normId = String(b.id || '').replace(/^0+/, '');
      const cH = b.cumHoldQty || 0;
      if (cH > 0 && !map.has(normId)) {
        map.set(normId, {
          ...b,
          cumHoldQty: cH,
          cumHoldAmt: b.cumHoldAmt || (cH * (b.cumAvgBuy || ltp || 100)),
        });
      }
    }

    let list = Array.from(map.values());
    if (filterQuery) {
      const q = filterQuery.toLowerCase().trim();
      list = list.filter(b => b.id.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (tableSortField === 'id') {
        valA = Number(a.id) || 0;
        valB = Number(b.id) || 0;
      } else if (tableSortField === 'cumHoldAmt') {
        valA = Number(a.cumHoldAmt || a.holdAmt || 0);
        valB = Number(b.cumHoldAmt || b.holdAmt || 0);
      } else if (tableSortField === 'cumAvgBuy') {
        valA = Number(a.cumAvgBuy || a.avgBuy || 0);
        valB = Number(b.cumAvgBuy || b.avgBuy || 0);
      } else if (tableSortField === 'cumAvgSell') {
        valA = Number(a.cumAvgSell || a.avgSell || 0);
        valB = Number(b.cumAvgSell || b.avgSell || 0);
      } else if (tableSortField === 'cumRetentionPct') {
        valA = Number(a.cumRetentionPct || a.holdPctOfBuy || 0);
        valB = Number(b.cumRetentionPct || b.holdPctOfBuy || 0);
      } else {
        valA = Number(a.cumHoldQty || a.holdQty || 0);
        valB = Number(b.cumHoldQty || b.holdQty || 0);
      }
      return tableSortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [filteredBrokers, cumulativeHoldingMap, filterQuery, tableSortField, tableSortOrder, ltp]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
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
            { days: 1, label: '1D' },
            { days: 5, label: '5D' },
            { days: 15, label: '15D' },
            { days: 30, label: '1M' },
            { days: 60, label: '2M' },
            { days: 90, label: '3M' },
            { days: 180, label: '6M' },
            { days: 260, label: '1Y' },
            { days: 'all', label: '🏆 All-Time (Till Today)' }
          ].map(item => {
            const isAll = item.days === 'all' || item.days === 'ALL';
            const isActive = !effectiveDate && !localFromDate && !localToDate && (
              isAll
                ? (effectiveDays === 'all' || effectiveDays === 'ALL' || Number(effectiveDays) >= 300)
                : (Number(effectiveDays) === item.days)
            );
            return (
              <button
                key={item.days}
                type="button"
                onClick={() => handleDaysSelect(item.days)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 8,
                  border: isActive ? (isAll ? '1.5px solid #10b981' : '1px solid #38bdf8') : '1px solid rgba(255,255,255,0.08)',
                  background: isActive ? (isAll ? 'rgba(16, 185, 129, 0.28)' : 'rgba(2, 132, 199, 0.25)') : (isAll ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)'),
                  color: isActive ? (isAll ? '#34d399' : '#38bdf8') : (isAll ? '#6ee7b7' : '#94a3b8'),
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

        {/* Sessions Analyzed & Volume Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 8,
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          color: '#38bdf8',
          fontSize: 11.5,
          fontWeight: 700
        }}>
          <span>Sessions Analyzed: {activeBrokerData?.tradingDays || effectiveDays || 1} Trading Days ({activeBrokerData?.fromDate || 'Latest'} → {activeBrokerData?.toDate || 'Latest'}) • Total Volume: {(activeBrokerData?.totalVolume || 0).toLocaleString()} Shares</span>
        </div>

        {/* Date-Wise Picker & Custom Date Range */}
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
                  {effectiveDays > 1 ? `Multi-Day Window (${effectiveDays}D Cumulative)` : `Latest Session (${availableDates[0] || '1D'})`}
                </option>
                {effectiveDate && !availableDates.includes(effectiveDate) && (
                  <option value={effectiveDate} style={{ background: '#0f172a', color: '#38bdf8' }}>
                    {effectiveDate} (Selected Session)
                  </option>
                )}
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

          {/* Custom Date Range Selector (From → To) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '5px 10px'
          }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>From:</span>
            <input
              type="date"
              value={localFromDate}
              onChange={e => setLocalFromDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 700, outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>To:</span>
            <input
              type="date"
              value={localToDate}
              onChange={e => setLocalToDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: 11, fontWeight: 700, outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => handleRangeApply(localFromDate, localToDate)}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Apply
            </button>
            {(localFromDate || localToDate) && (
              <button
                type="button"
                onClick={handleRangeReset}
                style={{
                  padding: '3px 6px',
                  borderRadius: 6,
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
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

      {/* Notice banner when user selects a date that has no floorsheet compiled yet */}
      {effectiveDate && brokerRecords.length === 0 && !isTabLoading && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#fbbf24',
          fontSize: 12,
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <div>
            ⚠️ No floorsheet records compiled yet for <strong>{effectiveDate}</strong> (trading session in progress or settlement pending). Showing latest completed session: <strong>{availableDates[0] || '2026-10-27'}</strong>.
          </div>
          <button
            type="button"
            onClick={() => handleDateSelect('')}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.2)',
              border: 'none',
              color: '#fef3c7',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Reset to Latest
          </button>
        </div>
      )}

      {/* ── Sub-tab 1: Broker Cards & Top Bar Chart Layout (Exact Share Hub Visuals) ── */}
      {activeSubTab === 'brokers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── 0. Authentic All-Time Broker Holding Ledger Banner & Top Accumulators Grid ── */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(6, 78, 59, 0.35))',
            border: '1.5px solid rgba(16, 185, 129, 0.5)',
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 20px rgba(16, 185, 129, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🏆</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                    Total Holding Till Today: Multi-Year Accumulator Pool ({symbol})
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    Authentic NEPSE Floorsheet Archive • Full Session History since 2022
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: 10,
                  padding: '6px 14px',
                  textAlign: 'right'
                }}>
                  <div style={{ fontSize: 10, color: '#a7f3d0', fontWeight: 800, textTransform: 'uppercase' }}>
                    Total Locked by Accumulators
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                    +{(brokerHoldingTotals.cumHold || totalCumulativeHoldingKitta || 0).toLocaleString()} <span style={{ fontSize: 11, color: '#6ee7b7' }}>kitta</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDaysSelect('all')}
                  style={{
                    background: (effectiveDays === 'all' || effectiveDays === 'ALL' || Number(effectiveDays) >= 300) ? '#10b981' : 'rgba(16, 185, 129, 0.2)',
                    color: (effectiveDays === 'all' || effectiveDays === 'ALL' || Number(effectiveDays) >= 300) ? '#0f172a' : '#34d399',
                    border: '1px solid #10b981',
                    borderRadius: 8,
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  {(effectiveDays === 'all' || effectiveDays === 'ALL' || Number(effectiveDays) >= 300) ? '✓ Viewing All-Time' : 'View All-Time Data'}
                </button>
              </div>
            </div>

            {/* Top 5 Accumulators Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10
            }}>
              {sortedCumulativeBrokers.slice(0, 5).map((b, idx) => {
                const totalHeld = b.cumHoldQty || b.holdQty || 0;
                const poolTotal = brokerHoldingTotals.cumHold || totalCumulativeHoldingKitta || 1;
                const sharePct = poolTotal > 0 ? ((totalHeld / poolTotal) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={b.id}
                    onClick={() => setFilterQuery(filterQuery === b.id ? '' : b.id)}
                    title={`Click to filter view to Broker #${b.id}`}
                    style={{
                      background: idx === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      border: idx === 0 ? '1.5px solid rgba(16, 185, 129, 0.55)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '11px 13px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: idx === 0 ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                        color: idx === 0 ? '#064e3b' : '#ffffff'
                      }}>
                        #{b.id} {idx === 0 ? '👑 #1 HOLDER' : ''}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#38bdf8' }}>
                        {sharePct}% of pool
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      +{totalHeld.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 700, color: '#a7f3d0' }}>kitta</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                      <span>Avg: Rs. {b.cumAvgBuy > 0 ? b.cumAvgBuy.toFixed(1) : (b.avgBuy > 0 ? b.avgBuy.toFixed(1) : '—')}</span>
                      <span>Val: {formatShareHubCurrency(b.cumHoldAmt || (totalHeld * (b.cumAvgBuy || ltp || 100)))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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

          {/* 2. Share Hub Summary Strip: Total Amount | Traded Quantity | Total Broker Holding (Till Today) | Transactions */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
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
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Traded Volume</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                {totalVolume.toLocaleString()}
              </div>
            </div>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', background: 'rgba(16, 185, 129, 0.06)', borderRadius: 8, padding: '2px 4px' }}>
              <div style={{ fontSize: 11, color: '#10b981', fontWeight: 800, marginBottom: 3 }}>Total Broker Holding (Till Today)</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                +{brokerHoldingTotals.cumHold.toLocaleString()} <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>kitta</span>
              </div>
              <div style={{ fontSize: 9.5, color: '#64748b' }}>
                Session: +{brokerHoldingTotals.sessionHold.toLocaleString()} kitta
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Transactions</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                {totalTransactions.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Quick Timeframe & Session Date Selector (Always visible directly above table/cards) */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginRight: 2 }}>
                Timeframe:
              </span>
              {[
                { days: 1, label: '1D' },
                { days: 5, label: '5D' },
                { days: 15, label: '15D' },
                { days: 30, label: '1M (30D)' },
                { days: 60, label: '2M' },
                { days: 90, label: '3M' },
                { days: 'all', label: '🏆 All-Time (Till Today)' }
              ].map(item => {
                const isAll = item.days === 'all' || item.days === 'ALL';
                const isActive = !effectiveDate && !localFromDate && !localToDate && (
                  isAll
                    ? (effectiveDays === 'all' || effectiveDays === 'ALL' || Number(effectiveDays) >= 300)
                    : (Number(effectiveDays) === item.days)
                );
                return (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => handleDaysSelect(item.days)}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 6,
                      border: isActive ? (isAll ? '1.5px solid #10b981' : '1px solid #38bdf8') : '1px solid rgba(255,255,255,0.08)',
                      background: isActive ? (isAll ? 'rgba(16, 185, 129, 0.28)' : 'rgba(2, 132, 199, 0.25)') : (isAll ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)'),
                      color: isActive ? (isAll ? '#34d399' : '#38bdf8') : (isAll ? '#6ee7b7' : '#94a3b8'),
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Session:</span>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '3px 8px'
              }}>
                <Calendar style={{ width: 12, height: 12, color: '#38bdf8' }} />
                <select
                  value={effectiveDate || ''}
                  onChange={e => handleDateSelect(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    fontSize: 11.5,
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="" style={{ background: '#0f172a', color: '#94a3b8' }}>
                    {effectiveDays > 1 ? `Multi-Day Window (${effectiveDays}D Cumulative)` : (availableDates.length > 0 ? `Latest Session (${availableDates[0]})` : 'Latest Trading Session')}
                  </option>
                  {effectiveDate && !availableDates.includes(effectiveDate) && (
                    <option value={effectiveDate} style={{ background: '#0f172a', color: '#38bdf8' }}>
                      {effectiveDate} (Selected Session)
                    </option>
                  )}
                  {availableDates.map(dt => (
                    <option key={dt} value={dt} style={{ background: '#0f172a', color: '#f8fafc' }}>
                      {dt}
                    </option>
                  ))}
                </select>
              </div>
              {effectiveDate && (
                <button
                  type="button"
                  onClick={() => handleDateSelect('')}
                  title="Reset to Latest Session"
                  style={{
                    padding: '3px 6px',
                    borderRadius: 6,
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    background: 'rgba(244, 63, 94, 0.12)',
                    color: '#fb7185',
                    fontSize: 10.5,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ✕ Reset
                </button>
              )}
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

          {viewMode !== 'datewise' && (tableHoldingView === 'cumulative' ? sortedCumulativeBrokers.length === 0 : filteredBrokers.length === 0) && (
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
              overflowX: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              {/* Header and Full Month Date Sorting Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Date-Wise Broker Sessions ({sortedDailyFlowList.length} Sessions)</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700 }}>
                      Full Month
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    Click any session row to inspect full broker transactions for that day
                  </div>
                </div>
              </div>

              {sortedDailyFlowList.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                  Loading full month date-wise broker sessions...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                      <th
                        onClick={() => {
                          if (dateSortField === 'date') setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setDateSortField('date'); setDateSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'left', cursor: 'pointer', color: dateSortField === 'date' ? '#38bdf8' : '#94a3b8' }}
                      >
                        DATE {dateSortField === 'date' ? (dateSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (dateSortField === 'volume') setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setDateSortField('volume'); setDateSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: dateSortField === 'volume' ? '#10b981' : '#94a3b8' }}
                      >
                        VOLUME {dateSortField === 'volume' ? (dateSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (dateSortField === 'turnover') setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setDateSortField('turnover'); setDateSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: dateSortField === 'turnover' ? '#38bdf8' : '#94a3b8' }}
                      >
                        AMOUNT {dateSortField === 'turnover' ? (dateSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (dateSortField === 'vwap') setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setDateSortField('vwap'); setDateSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: dateSortField === 'vwap' ? '#c084fc' : '#94a3b8' }}
                      >
                        VWAP {dateSortField === 'vwap' ? (dateSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP BUYER</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>TOP SELLER</th>
                      <th
                        onClick={() => {
                          if (dateSortField === 'trades') setDateSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setDateSortField('trades'); setDateSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: dateSortField === 'trades' ? '#fbbf24' : '#94a3b8' }}
                      >
                        TRADES {dateSortField === 'trades' ? (dateSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDailyFlowList.map(df => (
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
          {viewMode === 'compact' && (tableHoldingView === 'cumulative' ? sortedCumulativeBrokers.length > 0 : filteredBrokers.length > 0) && (
            <div style={{
              background: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '14px 16px',
              overflowX: 'auto',
              marginBottom: 16
            }}>
              {/* Header Switcher between Session Flow & Total Holding Till Today */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>
                    {tableHoldingView === 'session' ? `Session Flow (${effectiveDays}D • ${activeDateDisplay || 'Latest'})` : 'Total Broker Holding Till Today (All Time / Till Today)'}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 700 }}>
                    {tableHoldingView === 'session' ? `${filteredBrokers.length} Brokers in Session` : `Top ${sortedCumulativeBrokers.length} Accumulators Holding Stock`}
                  </span>
                </div>

                <div style={{ display: 'inline-flex', background: '#0a0f1d', padding: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <button
                    type="button"
                    onClick={() => setTableHoldingView('session')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: tableHoldingView === 'session' ? '#0284c7' : 'transparent',
                      color: tableHoldingView === 'session' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⚡ Session Activity ({effectiveDays}D)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableHoldingView('cumulative')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: tableHoldingView === 'cumulative' ? '#059669' : 'transparent',
                      color: tableHoldingView === 'cumulative' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    🏆 Total Holding Till Today
                  </button>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                {tableHoldingView === 'session' ? (
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>BROKER</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>BUY QTY</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>SELL QTY</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>MATCHED</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>SESSION HOLD</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right', color: '#38bdf8' }}>TOTAL HELD TILL TODAY</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>AVG BUY</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>AVG SELL</th>
                    </tr>
                  </thead>
                ) : (
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>#</th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'id') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('id'); setTableSortOrder('asc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'left', cursor: 'pointer', color: tableSortField === 'id' ? '#38bdf8' : '#94a3b8' }}
                      >
                        BROKER {tableSortField === 'id' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'cumHoldQty') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('cumHoldQty'); setTableSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: tableSortField === 'cumHoldQty' ? '#10b981' : '#10b981' }}
                      >
                        TOTAL HELD (KITTA) {tableSortField === 'cumHoldQty' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'cumHoldAmt') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('cumHoldAmt'); setTableSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: tableSortField === 'cumHoldAmt' ? '#38bdf8' : '#38bdf8' }}
                      >
                        HOLD VALUE (RS.) {tableSortField === 'cumHoldAmt' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'cumAvgBuy') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('cumAvgBuy'); setTableSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: tableSortField === 'cumAvgBuy' ? '#38bdf8' : '#94a3b8' }}
                      >
                        AVG BUY (TILL TODAY) {tableSortField === 'cumAvgBuy' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'cumAvgSell') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('cumAvgSell'); setTableSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: tableSortField === 'cumAvgSell' ? '#38bdf8' : '#94a3b8' }}
                      >
                        AVG SELL (TILL TODAY) {tableSortField === 'cumAvgSell' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th
                        onClick={() => {
                          if (tableSortField === 'cumRetentionPct') setTableSortOrder(p => p === 'desc' ? 'asc' : 'desc');
                          else { setTableSortField('cumRetentionPct'); setTableSortOrder('desc'); }
                        }}
                        style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer', color: tableSortField === 'cumRetentionPct' ? '#a78bfa' : '#94a3b8' }}
                      >
                        RETENTION RATE {tableSortField === 'cumRetentionPct' ? (tableSortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {tableHoldingView === 'session' ? (
                    filteredBrokers.slice(0, 60).map(b => {
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
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            {b.cumHoldQty > 0 ? `+${b.cumHoldQty.toLocaleString()}` : (cumulativeHoldingMap && Object.keys(cumulativeHoldingMap).length > 0 ? '—' : '...')}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                            {b.avgBuy > 0 ? b.avgBuy.toFixed(2) : '0.00'}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                            {b.avgSell > 0 ? b.avgSell.toFixed(2) : '0.00'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    sortedCumulativeBrokers.slice(0, 80).map((b, idx) => {
                      const holdQty = b.cumHoldQty || Math.max(0, b.signedHoldQty || 0);
                      const holdVal = b.cumHoldAmt || (holdQty * (b.cumAvgBuy || b.avgBuy || ltp || 100));
                      const avgBuy = b.cumAvgBuy || b.avgBuy || 0;
                      const avgSell = b.cumAvgSell || b.avgSell || 0;
                      const ret = b.cumRetentionPct || b.holdPctOfBuy || 0;
                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 6px', color: '#64748b', fontSize: 11 }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '8px 6px', color: '#ffffff', fontWeight: 700 }}>
                            #{b.id} <span style={{ color: '#94a3b8', fontWeight: 500 }}>{b.name}</span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                            +{holdQty.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                            {formatShareHubCurrency(holdVal)}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {avgBuy > 0 ? `Rs. ${avgBuy.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                            {avgSell > 0 ? `Rs. ${avgSell.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {ret}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {tableHoldingView === 'session' ? (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(56, 189, 248, 0.4)', background: 'rgba(15, 23, 42, 0.9)', fontWeight: 800 }}>
                      <td style={{ padding: '10px 6px', color: '#38bdf8' }}>TOTAL (All Brokers)</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#10b981', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.sessionBuy.toLocaleString()}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.sessionSell.toLocaleString()}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.sessionMatched.toLocaleString()}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>+{brokerHoldingTotals.sessionHold.toLocaleString()}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#10b981', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>+{brokerHoldingTotals.cumHold.toLocaleString()}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.weightedAvgBuy > 0 ? brokerHoldingTotals.weightedAvgBuy.toFixed(2) : '—'}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.weightedAvgSell > 0 ? brokerHoldingTotals.weightedAvgSell.toFixed(2) : '—'}</td>
                    </tr>
                  </tfoot>
                ) : (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(16, 185, 129, 0.4)', background: 'rgba(15, 23, 42, 0.9)', fontWeight: 800 }}>
                      <td style={{ padding: '10px 6px', color: '#64748b' }}>Σ</td>
                      <td style={{ padding: '10px 6px', color: '#10b981' }}>TOTAL ACCUMULATED (Till Today)</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#10b981', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>+{brokerHoldingTotals.cumHold.toLocaleString()} kitta</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{formatShareHubCurrency(brokerHoldingTotals.cumHoldAmt)}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.weightedAvgBuy > 0 ? 'Rs. ' + brokerHoldingTotals.weightedAvgBuy.toFixed(2) : '—'}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.weightedAvgSell > 0 ? 'Rs. ' + brokerHoldingTotals.weightedAvgSell.toFixed(2) : '—'}</td>
                      <td style={{ padding: '10px 6px', textAlign: 'right', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{brokerHoldingTotals.overallRetention}%</td>
                    </tr>
                  </tfoot>
                )}
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
                  <div style={{
                    background: (b.cumHoldQty > 0 || b.signedHoldQty > 0) ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    border: (b.cumHoldQty > 0 || b.signedHoldQty > 0) ? '1px solid rgba(16, 185, 129, 0.25)' : 'none',
                    borderRadius: 8,
                    padding: '4px 6px'
                  }}>
                    <div style={{ fontSize: 10.5, color: '#10b981', fontWeight: 800 }}>🏆 Total Held Till Today</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      +{(b.cumHoldQty > 0 ? b.cumHoldQty : (effectiveDays === 'all' ? Math.max(0, b.signedHoldQty) : (b.totalHeldQty || Math.max(0, b.signedHoldQty)))).toLocaleString()} kitta
                    </div>
                    {effectiveDays !== 'all' && (
                      <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>
                        Session: {isNetPositive ? '+' : ''}{b.signedHoldQty.toLocaleString()}
                      </div>
                    )}
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
                              const acc = df.topAccumulator || df.topHolder || df.topBuyer || (Array.isArray(df.brokers) ? [...df.brokers].sort((a,b) => (b.netQty || b.buyQty) - (a.netQty || a.buyQty))[0] : null);
                              const accId = acc?.broker || acc?.brokerId || acc?.id;
                              const accVal = acc ? (acc.netQty != null && acc.netQty !== 0 ? acc.netQty : (acc.buyQty || acc.buyVol || 0)) : 0;
                              return accId ? `#${accId} (+${formatCompactQty(Math.abs(accVal))})` : '—';
                            })()}
                          </td>
                          <td style={{ padding: '8px 6px', color: '#f43f5e', fontWeight: 700 }}>
                            {(() => {
                              const dist = df.topDistributor || df.topSeller || (Array.isArray(df.brokers) ? [...df.brokers].sort((a,b) => (a.netQty || a.sellQty) - (b.netQty || b.sellQty))[0] : null);
                              const distId = dist?.broker || dist?.brokerId || dist?.id;
                              const distVal = dist ? (dist.sellQty || dist.sellVol || Math.abs(dist.netQty || 0)) : 0;
                              return distId ? `#${distId} (-${formatCompactQty(Math.abs(distVal))})` : '—';
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
