import React from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, Zap } from 'lucide-react';

export function LiveMarketDashboard({
  onSelectScrip,
  onOpenFloorSheet,
  onOpenOrder,
  lang = 'ne',
  stocks = [],
  indices = null,
  marketStatus = null,
  apiStatus = 'offline',
}) {
  const isNe = lang === 'ne';

  // ── 1. Live NEPSE Hero Index ──
  const liveNepse = indices?.nepse;
  const nepseVal = liveNepse?.value
    ? Number(liveNepse.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '2,648.32';
  const nepseChange = liveNepse?.change !== undefined ? Number(liveNepse.change) : 37.15;
  const nepsePChange = liveNepse?.pChange !== undefined ? Number(liveNepse.pChange) : 1.42;
  const isNepseUp = nepseChange >= 0;

  const lowNum = Number(liveNepse?.low || 2611.17);
  const highNum = Number(liveNepse?.high || 2654.80);
  const curNum = Number(liveNepse?.value || 2648.32);
  const rangeSpan = Math.max(0.1, highNum - lowNum);
  const rangePct = Math.min(100, Math.max(0, ((curNum - lowNum) / rangeSpan) * 100));
  const rangeDiff = Math.abs(highNum - lowNum).toFixed(2);

  // ── 2. Live Turnover & Volume ──
  let turnoverDisplay = isNe ? 'रु ४.८२ अर्ब' : 'NPR 4.82 Arba';
  const totalRawTurnover = liveNepse?.turnover || stocks.reduce((acc, s) => acc + (s.turnover || 0), 0);
  if (totalRawTurnover > 0) {
    if (totalRawTurnover >= 1e9) {
      turnoverDisplay = `रु ${(totalRawTurnover / 1e9).toFixed(2)} अर्ब`;
    } else if (totalRawTurnover >= 1e7) {
      turnoverDisplay = `रु ${(totalRawTurnover / 1e7).toFixed(2)} करोड`;
    }
  }

  const totalRawVolume = stocks.reduce((acc, s) => acc + (s.volume || 0), 0);
  const volumeDisplay = totalRawVolume > 0
    ? (totalRawVolume >= 1e7
      ? `${(totalRawVolume / 1e7).toFixed(2)} करोड`
      : totalRawVolume >= 1e5
      ? `${(totalRawVolume / 1e5).toFixed(2)} लाख`
      : totalRawVolume.toLocaleString())
    : (isNe ? '१.२४ करोड' : '12.44 M');

  // ── 3. Live Market Breadth ──
  let advancers = 164;
  let decliners = 71;
  let unchanged = 9;
  let pctProfitable = 67;

  if (stocks && stocks.length > 0) {
    advancers = stocks.filter(s => (s.pointChange || s.change || 0) > 0).length;
    decliners = stocks.filter(s => (s.pointChange || s.change || 0) < 0).length;
    unchanged = stocks.filter(s => (s.pointChange || s.change || 0) === 0).length;
    const total = advancers + decliners + unchanged || 1;
    pctProfitable = Math.round((advancers / total) * 100);
  }

  // ── 4. Live Market Status ──
  const isOpen = Boolean(marketStatus?.isOpen);
  const statusLabel = isOpen
    ? (isNe ? 'NEPSE LIVE • बजार खुला छ' : 'NEPSE LIVE • Market Open')
    : (isNe ? 'NEPSE • बजार बन्द छ' : 'NEPSE • Market Closed');
  const countdownLabel = isOpen
    ? (marketStatus?.timeRemaining
      ? (isNe ? `बन्द हुन: ${marketStatus.timeRemaining}` : `Closes in ${marketStatus.timeRemaining}`)
      : (isNe ? 'बन्द हुन: १घ ४५मि' : 'Closes in 1h 45m'))
    : (isNe ? 'अर्को सत्र: ११:०० बजे' : 'Next Session: 11:00 AM');

  // ── 5. Live Sector Momentum ──
  const subIndices = indices?.subIndices || [];
  const findSubIndex = (keyword) => {
    return subIndices.find(s => (s.index || '').toLowerCase().includes(keyword.toLowerCase()));
  };

  const hydroSub = findSubIndex('hydro');
  const hotelSub = findSubIndex('hotel');
  const mfgSub = findSubIndex('manufact');
  const bankSub = findSubIndex('bank');

  const sectorMomenta = [
    {
      icon: "💧",
      name: isNe ? 'जलविद्युत (Hydro)' : 'Hydropower',
      gain: hydroSub ? `${hydroSub.pChange >= 0 ? '+' : ''}${hydroSub.pChange.toFixed(2)}%` : '+2.40%'
    },
    {
      icon: "🏨",
      name: isNe ? 'होटल तथा पर्यटन' : 'Hotels & Tourism',
      gain: hotelSub ? `${hotelSub.pChange >= 0 ? '+' : ''}${hotelSub.pChange.toFixed(2)}%` : '+3.14%'
    },
    {
      icon: "🏭",
      name: isNe ? 'उत्पादन (Mfg)' : 'Manufacturing',
      gain: mfgSub ? `${mfgSub.pChange >= 0 ? '+' : ''}${mfgSub.pChange.toFixed(2)}%` : '+1.95%'
    },
    {
      icon: "🏛️",
      name: isNe ? 'वाणिज्य बैंक' : 'Commercial Bank',
      gain: bankSub ? `${bankSub.pChange >= 0 ? '+' : ''}${bankSub.pChange.toFixed(2)}%` : '+0.82%'
    },
  ];

  // ── 6. Live Top Gainers ──
  let topGainers = [
    {
      symbol: "NABIL",
      name: "नबिल बैंक लिमिटेड",
      enName: "Nabil Bank Ltd.",
      sector: "Bank",
      ltp: 585.00,
      change: "+1.92%",
      changeAmt: "+11.00",
      tag: "⚡ Popular",
      color: "sky"
    },
    {
      symbol: "SHIVM",
      name: "शिवम् सिमेन्ट्स लिमिटेड",
      enName: "Shivam Cements Ltd.",
      sector: "Mfg",
      ltp: 612.40,
      change: "+14.80%",
      changeAmt: "+82.50",
      tag: "Circuit +14.8%",
      color: "emerald"
    },
    {
      symbol: "CHCL",
      name: "चिलिमे जलविद्युत कम्पनी",
      enName: "Chilime Hydropower",
      sector: "Hydro",
      ltp: 542.00,
      change: "+7.11%",
      changeAmt: "+36.00",
      tag: "+7.1% Gain",
      color: "emerald"
    },
  ];

  if (stocks && stocks.length > 0) {
    const liveFiltered = stocks
      .filter(s => (s.percentChange || s.pChange || 0) > 0 && (s.ltp || s.close || 0) > 0)
      .sort((a, b) => (b.percentChange || b.pChange || 0) - (a.percentChange || a.pChange || 0))
      .slice(0, 4);

    if (liveFiltered.length > 0) {
      topGainers = liveFiltered.map((s, idx) => ({
        symbol: s.symbol,
        name: s.name || s.companyName || s.symbol,
        enName: s.symbol,
        sector: s.sector || 'Others',
        ltp: Number(s.ltp || s.close || 0),
        change: `+${Number(s.percentChange || s.pChange || 0).toFixed(2)}%`,
        changeAmt: `+${Number(s.pointChange || s.change || 0).toFixed(2)}`,
        tag: idx === 0 ? '⚡ TOP GAINER' : s.percentChange >= 9.5 ? 'Circuit' : '⚡ High Demand',
        color: idx % 2 === 0 ? 'sky' : 'emerald'
      }));
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Live Market Status Pill */}
      <div className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs shadow-sm ${
        isOpen
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
      }`}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isOpen ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isOpen ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
          </span>
          <span className="font-bold tracking-wide">{statusLabel}</span>
        </div>
        <span className={`font-mono text-[11px] font-medium px-2 py-0.5 rounded-full ${
          isOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
        }`}>
          {countdownLabel}
        </span>
      </div>

      {/* Big Index Hero Card */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141A28] to-[#0F131F] p-4.5 shadow-xl shadow-black/40 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 font-mono">
            <span className={`h-2 w-2 rounded-full ${isNepseUp ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="font-bold uppercase tracking-wider text-slate-200">
              {isNe ? 'नेप्से सूचांक (NEPSE INDEX)' : 'NEPSE INDEX'}
            </span>
          </div>
          <div className="flex gap-1 rounded-lg bg-[#0B0F17] p-1 font-mono text-[10px]">
            <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-400 font-bold border border-sky-500/30">1D</span>
            <span className="px-1.5 py-0.5 text-slate-400">1W</span>
            <span className="px-1.5 py-0.5 text-slate-400">1M</span>
            <span className="px-1.5 py-0.5 text-slate-400">1Y</span>
          </div>
        </div>

        {/* Big Index Value */}
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-white tabular-nums">
            {nepseVal}
          </span>
          <span className={`inline-flex items-center rounded-xl border px-2.5 py-1 font-mono text-xs font-bold ${
            isNepseUp
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/15 text-rose-400'
          }`}>
            {isNepseUp ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
            {isNepseUp ? '+' : ''}{nepseChange.toFixed(2)} ({isNepseUp ? '+' : ''}{nepsePChange.toFixed(2)}%)
          </span>
        </div>

        {/* Today's Range Visual Progress Bar */}
        <div className="rounded-xl bg-[#0B0F17]/80 p-2.5 border border-white/[0.04] space-y-1 font-mono text-xs text-slate-400">
          <div className="flex justify-between text-[11px]">
            <span>{isNe ? 'न्यून:' : 'Low:'} <strong className="text-white">{lowNum.toFixed(2)}</strong></span>
            <span className={`${isNepseUp ? 'text-emerald-400' : 'text-rose-400'} font-semibold`}>
              {isNe ? `दिनको रेन्ज: ${rangeDiff} अंक` : `Day Range: ${rangeDiff} pts`}
            </span>
            <span>{isNe ? 'उच्च:' : 'High:'} <strong className="text-white">{highNum.toFixed(2)}</strong></span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isNepseUp ? 'bg-emerald-400' : 'bg-rose-400'}`}
              style={{ width: `${rangePct}%` }}
            />
          </div>
        </div>

        {/* SVG Smooth Area Chart */}
        <div className="h-24 w-full pt-1">
          <svg viewBox="0 0 300 70" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="gradNepseLive" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={isNepseUp ? "#10B981" : "#F43F5E"} stopOpacity="0.35" />
                <stop offset="100%" stopColor={isNepseUp ? "#10B981" : "#F43F5E"} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d="M0,60 Q40,58 90,48 T180,30 T260,14 L300,6 L300,70 L0,70 Z" fill="url(#gradNepseLive)" />
            <path d="M0,60 Q40,58 90,48 T180,30 T260,14 L300,6" fill="none" stroke={isNepseUp ? "#10B981" : "#F43F5E"} strokeWidth="2.5" />
            <circle cx="300" cy="6" r="4" fill={isNepseUp ? "#10B981" : "#F43F5E"} />
          </svg>
        </div>

        {/* Key Stats 3-Grid */}
        <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center font-mono">
          <div className="rounded-xl bg-[#0B0F17]/60 p-2 border border-white/[0.03]">
            <div className="text-[10px] text-slate-400 uppercase">{isNe ? 'कुल रकम (Turnover)' : 'Turnover'}</div>
            <div className="mt-0.5 text-xs font-bold text-white">{turnoverDisplay}</div>
            <div className="text-[9px] text-emerald-400 font-semibold">{isNe ? 'उच्च तरलता' : 'High Liquidity'}</div>
          </div>
          <div className="rounded-xl bg-[#0B0F17]/60 p-2 border border-white/[0.03]">
            <div className="text-[10px] text-slate-400 uppercase">{isNe ? 'कारोबार कित्ता' : 'Traded Vol'}</div>
            <div className="mt-0.5 text-xs font-bold text-white">{volumeDisplay}</div>
            <div className="text-[9px] text-slate-400">{stocks.length > 0 ? `${stocks.length} scrips` : (isNe ? '७८,४१२ पटक' : '78,412 Trades')}</div>
          </div>
          <div className="rounded-xl bg-[#0B0F17]/60 p-2 border border-white/[0.03]">
            <div className="text-[10px] text-slate-400 uppercase">{isNe ? 'बजार प्रवृति' : 'Market Trend'}</div>
            <div className={`mt-0.5 text-xs font-bold ${isNepseUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isNepseUp ? 'Bullish ↗' : 'Bearish ↘'}
            </div>
            <div className="text-[9px] text-emerald-400">{isNe ? 'EMA(20) भन्दा माथि' : '> EMA(20)'}</div>
          </div>
        </div>
      </div>

      {/* Market Breadth: Advancers / Decliners / Unchanged */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-300 flex justify-between items-center">
          <span>{isNe ? 'बजार चौडाइ (Market Breadth)' : 'Market Breadth'}</span>
          <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {isNe ? `${pctProfitable}% कम्पनी नाफामा` : `${pctProfitable}% in Profit`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3 text-center">
            <div className="text-[11px] font-semibold text-emerald-300">{isNe ? 'बढ्ने (Advancers)' : 'Advancers'}</div>
            <div className="mt-1 font-mono text-xl font-extrabold text-emerald-400">{advancers}</div>
            <div className="text-[10px] text-slate-400">{isNe ? 'कम्पनी वृद्धि' : 'Stocks Up'}</div>
          </div>
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.08] p-3 text-center">
            <div className="text-[11px] font-semibold text-rose-300">{isNe ? 'घट्ने (Decliners)' : 'Decliners'}</div>
            <div className="mt-1 font-mono text-xl font-extrabold text-rose-400">{decliners}</div>
            <div className="text-[10px] text-slate-400">{isNe ? 'कम्पनी गिरावट' : 'Stocks Down'}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-3 text-center">
            <div className="text-[11px] font-semibold text-slate-300">{isNe ? 'स्थिर (Unchanged)' : 'Unchanged'}</div>
            <div className="mt-1 font-mono text-xl font-extrabold text-slate-200">{unchanged}</div>
            <div className="text-[10px] text-slate-400">{isNe ? 'समान मूल्य' : 'Same Price'}</div>
          </div>
        </div>
      </div>

      {/* Sector Momentum Horizontal Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span>{isNe ? 'कुन क्षेत्र कति बढ्यो? (Sector Momentum)' : 'Sector Momentum'}</span>
          <span className="text-[10px] font-mono text-sky-400">{isNe ? 'सबै क्षेत्र →' : 'All Sectors →'}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {sectorMomenta.map((sec, idx) => (
            <div key={idx} className="min-w-[130px] rounded-2xl border border-white/[0.07] bg-[#111622] p-3 flex-shrink-0">
              <div className="text-xs font-semibold text-slate-200">{sec.icon} {sec.name}</div>
              <div className={`mt-1 font-mono text-xs font-extrabold ${sec.gain.startsWith('-') ? 'text-rose-400' : 'text-emerald-400'}`}>
                {sec.gain}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Gainers Scrip List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span>{isNe ? 'धेरै बढ्ने कम्पनीहरू (Top Movers)' : 'Top Movers'}</span>
          <span className="text-[10px] font-mono text-sky-400">{isNe ? 'विस्तृत हेर्नुहोस् →' : 'View All →'}</span>
        </div>

        <div className="space-y-2">
          {topGainers.map((stock) => (
            <div
              key={stock.symbol}
              onClick={() => onSelectScrip && onSelectScrip(stock.symbol)}
              className="tap-active group flex items-center justify-between rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 hover:bg-[#161D2E] hover:border-sky-500/40 cursor-pointer transition-all shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-bold ${
                    stock.color === 'sky'
                      ? 'bg-sky-500/15 border border-sky-500/30 text-sky-400'
                      : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {stock.symbol.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-extrabold text-white">{stock.symbol}</span>
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-slate-300 uppercase font-mono">
                      {stock.sector}
                    </span>
                    <span className="rounded bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 font-bold">
                      {stock.tag}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5 font-medium">
                    {isNe ? stock.name : stock.enName}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-extrabold text-white">Rs {stock.ltp.toFixed(2)}</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  {stock.change} ({stock.changeAmt})
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action CTAs */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={onOpenFloorSheet}
          className="tap-active py-3.5 rounded-2xl border border-white/[0.08] bg-[#111622] hover:bg-[#161D2E] text-xs font-mono font-bold text-slate-200 transition-all flex items-center justify-center gap-1.5"
        >
          <Activity size={16} className="text-sky-400" />
          <span>{isNe ? 'फ्लोरशिट (Live Tape)' : 'Floor Sheet (Live Tape)'}</span>
        </button>
        <button
          onClick={() => onOpenOrder && onOpenOrder(topGainers[0]?.symbol || 'NABIL', topGainers[0]?.ltp || 585.00)}
          className="tap-active py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-xs font-bold font-mono text-white shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-1.5"
        >
          <Zap size={16} className="text-white" />
          <span>{isNe ? 'सेयर किनबेच (TMS 58)' : 'Trade Order (TMS 58)'}</span>
        </button>
      </div>
    </div>
  );
}

export default LiveMarketDashboard;
