import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Zap, RefreshCw, Search, Filter, Clock, ArrowRight, ShieldCheck, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fetchRealFloorsheet } from '../utils/liveData';
import { getBrokerName } from '../utils/accumulationDistributionEngine';

function formatNprCurrency(val, isNe = false) {
  const n = Number(val) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) {
    const arba = (abs / 1e9).toFixed(2);
    return isNe ? `${sign}रु ${arba} अर्ब` : `${sign}NPR ${arba} Arba`;
  }
  if (abs >= 1e7) {
    const cr = (abs / 1e7).toFixed(2);
    return isNe ? `${sign}रु ${cr} करोड` : `${sign}NPR ${cr} Cr`;
  }
  if (abs >= 1e5) {
    const lakh = (abs / 1e5).toFixed(2);
    return isNe ? `${sign}रु ${lakh} लाख` : `${sign}NPR ${lakh} Lakh`;
  }
  return isNe ? `${sign}रु ${abs.toLocaleString('en-IN')}` : `${sign}NPR ${abs.toLocaleString('en-IN')}`;
}

export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {
  const isNe = lang === 'ne';
  const [filterScrip, setFilterScrip] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [timeframe, setTimeframe] = useState('1D');
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const [size] = useState(50);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false }));

  const daysMap = {
    '1D': 1,
    '5D': 5,
    '15D': 15,
    '1M': 30,
    '2M': 60,
    '3M': 90,
    '6M': 180,
    '1Y': 260,
    'ALL': 500,
  };

  // Raw data from API
  const [floorsheetData, setFloorsheetData] = useState({
    rows: [],
    totalElements: 0,
    totalPages: 1,
    totalAmount: 0,
    totalQty: 0,
    businessDate: '',
    availableDates: []
  });

  const loadFloorsheet = useCallback(async (pg = 1, showRefreshSpinner = false, currentTf = timeframe, currentDate = selectedDate) => {
    if (showRefreshSpinner) setRefreshing(true);
    else setLoading(true);

    try {
      const sym = filterScrip !== 'ALL' ? filterScrip : (searchQuery.trim() ? searchQuery.trim().toUpperCase() : '');
      const numDays = daysMap[currentTf] || 1;
      const opts = {
        buyer: buyerFilter.trim(),
        seller: sellerFilter.trim(),
        refresh: showRefreshSpinner,
        days: numDays,
        date: currentDate
      };

      const res = await fetchRealFloorsheet(sym, currentDate, pg, size, opts);
      if (res && Array.isArray(res.rows)) {
        setFloorsheetData(res);
        setPage(pg);
        setLastSyncTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
      }
    } catch (err) {
      console.warn('[FloorSheetTape] Fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterScrip, searchQuery, buyerFilter, sellerFilter, size, timeframe, selectedDate]);

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    setSelectedDate('');
    loadFloorsheet(1, false, tf, '');
  };

  const handleDateChange = (dt) => {
    setSelectedDate(dt);
    loadFloorsheet(1, false, timeframe, dt);
  };

  // Initial and reactive load
  useEffect(() => {
    loadFloorsheet(1);
  }, [loadFloorsheet]);

  // Auto-refresh interval (every 12 seconds when enabled)
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      loadFloorsheet(page, true);
    }, 12000);
    return () => clearInterval(interval);
  }, [isAutoRefresh, page, loadFloorsheet]);

  const rows = Array.isArray(floorsheetData.rows) ? floorsheetData.rows : [];

  // Identify institutional block trade of the session
  const topBlockTrade = useMemo(() => {
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    return sorted[0];
  }, [rows]);

  const quickScrips = ['ALL', 'NABIL', 'SHIVM', 'CHCL', 'CIT', 'HDL', 'GBIME', 'SBI', 'NICA'];

  return (
    <div className="space-y-4 pb-24 font-mono">
      {/* Live Realtime Sync Status Header */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 space-y-3 shadow-lg">
        <div className="flex justify-between items-center text-xs text-slate-400 font-sans flex-wrap gap-2">
          <span className="font-bold text-white tracking-wider flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            {isNe ? 'फ्लोरशिट प्रत्यक्ष कारोबार (Live Floorsheet Tape)' : 'Floor Sheet Live Tape'}
          </span>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-sky-400 font-bold">((•)) Sync: {lastSyncTime}</span>
            <button
              onClick={() => setIsAutoRefresh(v => !v)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                isAutoRefresh ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isAutoRefresh ? (isNe ? 'स्वतः सिंक सक्रिय' : 'Auto-Sync ON') : (isNe ? 'स्वतः सिंक' : 'Auto-Sync')}
            </button>
            <button
              onClick={() => loadFloorsheet(page, true)}
              disabled={refreshing}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh Floorsheet"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin text-sky-400' : ''} />
            </button>
          </div>
        </div>

        {/* Market Stats Grid */}
        <div className="grid grid-cols-3 gap-2 border-t border-white/[0.04] pt-3 text-center sm:text-left">
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-sans font-semibold">
              {isNe ? 'कुल सम्झौता संख्या' : 'Total Contracts'}
            </div>
            <div className="text-sm sm:text-base font-bold text-white mt-0.5">
              {Number(floorsheetData.totalElements || rows.length).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-sans font-semibold">
              {isNe ? 'कारोबार रकम' : 'Turnover'}
            </div>
            <div className="text-sm sm:text-base font-bold text-emerald-400 mt-0.5">
              {formatNprCurrency(floorsheetData.totalAmount || rows.reduce((s, r) => s + Number(r.amount || 0), 0), isNe)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-sans font-semibold">
              {isNe ? 'कुल कित्ता' : 'Total Traded Qty'}
            </div>
            <div className="text-sm sm:text-base font-bold text-sky-400 mt-0.5">
              {Number(floorsheetData.totalQty || rows.reduce((s, r) => s + Number(r.qty || r.quantity || 0), 0)).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Block Trade Banner */}
      {topBlockTrade && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-sky-400 font-bold font-sans">
            <div className="flex items-center gap-1.5">
              <Zap size={16} className="text-amber-400 animate-pulse" />
              <span>{isNe ? 'प्रमुख संस्थागत कारोबार (Top Block Trade)' : 'Prominent Block Trade'}</span>
            </div>
            <span className="text-[10px] bg-sky-500/20 px-2 py-0.5 rounded font-mono font-bold text-sky-300">
              {Number(topBlockTrade.qty || topBlockTrade.quantity || 0).toLocaleString()} {isNe ? 'कित्ता' : 'shares'}
            </span>
          </div>
          <div className="text-slate-300 font-sans text-[11px] flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white">#{topBlockTrade.buyerBroker || topBlockTrade.buyer}</span>
            <span className="text-slate-400">({topBlockTrade.buyerBrokerName || getBrokerName(topBlockTrade.buyerBroker)})</span>
            <ArrowRight size={12} className="text-slate-500" />
            <span className="font-bold text-white">#{topBlockTrade.sellerBroker || topBlockTrade.seller}</span>
            <span className="text-slate-400">({topBlockTrade.sellerBrokerName || getBrokerName(topBlockTrade.sellerBroker)})</span>
            <span className="text-slate-500">•</span>
            <strong className="text-emerald-400">{topBlockTrade.symbol || topBlockTrade.stockSymbol}</strong>
            <span className="text-slate-400">@ Rs {Number(topBlockTrade.rate || 0).toFixed(1)}</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold font-mono flex justify-between items-center">
            <span>Total Value: {formatNprCurrency(topBlockTrade.amount, isNe)}</span>
            <span className="text-slate-400 text-[10px]">{topBlockTrade.tradeTime ? topBlockTrade.tradeTime.slice(11, 19) : topBlockTrade.businessDate}</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isNe ? "कम्पनी खोज्नुहोस् (उदा: NABIL, SHIVM)..." : "Filter by symbol (e.g. NABIL, SHIVM)..."}
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setFilterScrip('ALL');
              }}
              onKeyDown={e => { if (e.key === 'Enter') loadFloorsheet(1); }}
              className="w-full bg-[#111622] border border-white/[0.08] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); loadFloorsheet(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Buyer #"
              value={buyerFilter}
              onChange={e => setBuyerFilter(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadFloorsheet(1); }}
              className="w-20 bg-[#111622] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-center text-emerald-400 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              title="Filter by Buyer Broker Number"
            />
            <input
              type="text"
              placeholder="Seller #"
              value={sellerFilter}
              onChange={e => setSellerFilter(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadFloorsheet(1); }}
              className="w-20 bg-[#111622] border border-white/[0.08] rounded-xl px-2.5 py-2 text-xs text-center text-rose-400 placeholder-slate-500 focus:outline-none focus:border-rose-500"
              title="Filter by Seller Broker Number"
            />
            <button
              onClick={() => loadFloorsheet(1)}
              className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold font-sans transition"
            >
              Filter
            </button>
          </div>
        </div>

        {/* Timeframe & Historical Date Selector (up to 500 sessions / 2+ years) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-[#111622] border border-white/[0.08] text-xs">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              {isNe ? 'अवधि:' : 'Horizon:'}
            </span>
            {['1D', '5D', '15D', '1M', '2M', '3M', '6M', '1Y', 'ALL'].map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0 ${
                  timeframe === tf && !selectedDate
                    ? 'bg-sky-500 text-slate-950 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
              {isNe ? 'मिति:' : 'Session:'}
            </span>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-slate-200 border border-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="">{isNe ? 'पछिल्लो सत्र' : 'Latest Session'} ({daysMap[timeframe] || 1}D)</option>
              {Array.isArray(floorsheetData.availableDates) && Array.from(new Set(floorsheetData.availableDates)).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a))).slice(0, 500).map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
            {selectedDate && (
              <button
                onClick={() => handleDateChange('')}
                className="px-2 py-0.5 text-xs text-amber-400 hover:text-white border border-amber-500/30 rounded bg-amber-500/10"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Scrip Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {quickScrips.map(sym => (
            <button
              key={sym}
              onClick={() => {
                setFilterScrip(sym);
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-xl border font-semibold whitespace-nowrap transition-all ${
                filterScrip === sym && !searchQuery
                  ? 'border-sky-500 bg-sky-500/20 text-sky-400'
                  : 'border-white/[0.06] bg-[#111622] text-slate-400 hover:text-white'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Tape Header */}
      <div className="flex justify-between text-[10px] text-slate-400 px-3 uppercase font-sans font-bold">
        <span>{isNe ? 'कम्पनी / अर्डर नं' : 'Symbol / Contract'}</span>
        <span>{isNe ? 'ब्रोकर (खरिद → बिक्री)' : 'Broker (Buy → Sell)'}</span>
        <span>{isNe ? 'कित्ता @ दर (रकम)' : 'Kitta @ Rate (Total)'}</span>
      </div>

      {/* Tape Trade Items */}
      <div className="space-y-2">
        {loading && rows.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#111622] p-8 text-center text-slate-400 text-xs">
            <RefreshCw size={18} className="animate-spin mx-auto text-sky-400 mb-2" />
            {isNe ? 'प्रत्यक्ष फ्लोरशिट डेटा लोड हुँदैछ...' : 'Connecting to NEPSE live floorsheet feed...'}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#111622] p-8 text-center text-slate-400 text-xs">
            {isNe ? 'कुनै कारोबार भेटिएन। कृपया अन्य कम्पनी वा फिल्टर चयन गर्नुहोस्।' : 'No floorsheet records found for the active filter.'}
          </div>
        ) : (
          rows.map((trade, idx) => {
            const sym = trade.symbol || trade.stockSymbol || '—';
            const b = trade.buyerBroker || trade.buyer || '—';
            const s = trade.sellerBroker || trade.seller || '—';
            const kitta = Number(trade.qty || trade.quantity || 0);
            const rate = Number(trade.rate || 0);
            const amount = Number(trade.amount || (kitta * rate) || 0);
            const contractId = trade.contractId || trade.id || `#${idx + 1}`;
            const timeStr = trade.tradeTime ? trade.tradeTime.slice(11, 19) : (trade.businessDate || '');
            const isBlock = kitta >= 5000 || amount >= 1000000;
            const isInst = kitta >= 2000 || amount >= 500000;

            const tag = isBlock
              ? (isNe ? 'ब्लक ट्रेड' : 'Block')
              : isInst
              ? (isNe ? 'संस्थागत' : 'Inst.')
              : b === s
              ? (isNe ? 'म्याचिङ' : 'Cross')
              : (isNe ? 'नियमित' : 'Regular');

            const tagColor = isBlock ? 'rose' : isInst ? 'sky' : b === s ? 'amber' : 'slate';

            return (
              <div
                key={contractId + '-' + idx}
                onClick={() => onSelectScrip && onSelectScrip(sym)}
                className="tap-active rounded-xl border border-white/[0.06] bg-[#111622] p-3 text-xs hover:bg-[#161D2E] cursor-pointer transition-all flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-sm">{sym}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-sans ${
                      tagColor === 'sky'
                        ? 'bg-sky-500/20 text-sky-400'
                        : tagColor === 'emerald'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : tagColor === 'rose'
                        ? 'bg-rose-500/20 text-rose-400'
                        : tagColor === 'amber'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-white/[0.06] text-slate-300'
                    }`}>
                      {tag}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{contractId} {timeStr ? `• ${timeStr}` : ''}</div>
                </div>

                <div className="text-slate-300 text-xs text-center">
                  <span className="text-emerald-400 font-bold" title={trade.buyerBrokerName || getBrokerName(b)}>#{b}</span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-rose-400 font-bold" title={trade.sellerBrokerName || getBrokerName(s)}>#{s}</span>
                </div>

                <div className="text-right">
                  <div className="font-bold text-white">{kitta.toLocaleString()} @ Rs {rate.toFixed(1)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{formatNprCurrency(amount, isNe)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {floorsheetData.totalPages > 1 && (
        <div className="flex justify-between items-center pt-2 px-1 text-xs">
          <button
            onClick={() => loadFloorsheet(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border transition ${
              page <= 1 ? 'border-white/[0.04] text-slate-600 cursor-not-allowed' : 'border-white/[0.08] bg-[#111622] text-slate-300 hover:text-white'
            }`}
          >
            <ChevronLeft size={14} />
            {isNe ? 'अघिल्लो' : 'Prev'}
          </button>
          <span className="text-slate-400 font-mono text-[11px]">
            {isNe ? `पृष्ठ ${page} / ${floorsheetData.totalPages}` : `Page ${page} of ${floorsheetData.totalPages}`}
          </span>
          <button
            onClick={() => loadFloorsheet(Math.min(floorsheetData.totalPages, page + 1))}
            disabled={page >= floorsheetData.totalPages || loading}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border transition ${
              page >= floorsheetData.totalPages ? 'border-white/[0.04] text-slate-600 cursor-not-allowed' : 'border-white/[0.08] bg-[#111622] text-slate-300 hover:text-white'
            }`}
          >
            {isNe ? 'पछिल्लो' : 'Next'}
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default FloorSheetTape;
