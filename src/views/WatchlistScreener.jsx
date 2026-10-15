import React, { useState, useMemo } from 'react';
import { Search, Info, X } from 'lucide-react';

export function WatchlistScreener({ onSelectScrip, lang = 'ne', stocks = [] }) {
  const isNe = lang === 'ne';
  const [query, setQuery] = useState('');
  const [screenerMode, setScreenerMode] = useState('simple');
  const [activeSector, setActiveSector] = useState('ALL');

  const defaultWatchlist = [
    {
      symbol: "NABIL",
      name: "नबिल बैंक लिमिटेड",
      enName: "Nabil Bank Ltd.",
      sector: "Bank",
      ltp: 585.00,
      change: 1.92,
      changeAmt: "+11.00",
      dayLow: 574.00,
      dayHigh: 588.00,
      pe: 16.4,
      peStatus: isNe ? "उचित मूल्य (Fair)" : "Fair Value",
      vol: "142.5K",
      high52: "640.00",
      low52: "490.00",
      isPos: true,
      sentiment: isNe ? "Bullish (खरिद अनुकूल)" : "Bullish (Buy Signal)"
    },
    {
      symbol: "SHIVM",
      name: "शिवम् सिमेन्ट्स लिमिटेड",
      enName: "Shivam Cements Ltd.",
      sector: "Mfg",
      ltp: 612.40,
      change: 9.84,
      changeAmt: "+54.90",
      dayLow: 560.00,
      dayHigh: 615.00,
      pe: 22.0,
      peStatus: isNe ? "आकर्षक (Attractive)" : "Attractive P/E",
      vol: "318.4K",
      high52: "630.00",
      low52: "390.00",
      isPos: true,
      topMover: true,
      sentiment: isNe ? "Very High Momentum" : "Very High Momentum"
    },
    {
      symbol: "CHCL",
      name: "चिलिमे जलविद्युत कम्पनी",
      enName: "Chilime Hydropower",
      sector: "Hydro",
      ltp: 542.00,
      change: 7.11,
      changeAmt: "+36.00",
      dayLow: 510.00,
      dayHigh: 546.00,
      pe: 19.5,
      peStatus: isNe ? "राम्रो P/E" : "Good P/E",
      vol: "88.2K",
      high52: "580.00",
      low52: "410.00",
      isPos: true,
      sentiment: isNe ? "स्थिर खरिद (Accumulation)" : "Accumulation"
    },
    {
      symbol: "HDL",
      name: "हिमालयन डिस्टिलरी लिमिटेड",
      enName: "Himalayan Distillery",
      sector: "Mfg",
      ltp: 1820.00,
      change: 6.43,
      changeAmt: "+110.00",
      dayLow: 1715.00,
      dayHigh: 1835.00,
      pe: 28.2,
      peStatus: isNe ? "प्रिमियम (Premium)" : "Premium Valuation",
      vol: "22.8K",
      high52: "2,420.00",
      low52: "1,650.00",
      isPos: true,
      sentiment: isNe ? "सकारात्मक वृद्धि" : "Positive Growth"
    },
    {
      symbol: "CIT",
      name: "नागरिक लगानी कोष",
      enName: "Citizen Investment Trust",
      sector: "Invest",
      ltp: 2410.50,
      change: 4.80,
      changeAmt: "+110.50",
      dayLow: 2310.00,
      dayHigh: 2420.00,
      pe: 34.1,
      peStatus: isNe ? "उच्च विकास" : "High Growth",
      vol: "14.1K",
      high52: "2,600.00",
      low52: "1,980.00",
      isPos: true,
      sentiment: isNe ? "दीर्घकालीन सुरक्षित" : "Safe Long-Term"
    }
  ];

  const watchlistData = useMemo(() => {
    if (!stocks || stocks.length === 0) return defaultWatchlist;

    return stocks.map(stock => {
      const ltp = Number(stock.ltp || stock.close || 0);
      const chg = Number(stock.pointChange || stock.change || 0);
      const dayLow = stock.low != null ? Number(Number(stock.low).toFixed(2)) : (ltp > 0 ? Number(ltp.toFixed(2)) : 0);
      const dayHigh = stock.high != null ? Number(Number(stock.high).toFixed(2)) : (ltp > 0 ? Number(ltp.toFixed(2)) : 0);
      const volNum = Number(stock.volume || stock.totalTradedQuantity || 0);
      const volStr = volNum >= 1000 ? `${(volNum / 1000).toFixed(1)}K` : `${volNum}`;
      const pe = stock.pe != null && Number(stock.pe) > 0 ? Number(Number(stock.pe).toFixed(1)) : null;

      const rawHigh52 = stock.high52 || stock.high52w;
      const rawLow52 = stock.low52 || stock.low52w;
      const high52 = rawHigh52 != null && Number(rawHigh52) > 0 ? Number(rawHigh52).toFixed(2) : '—';
      const low52 = rawLow52 != null && Number(rawLow52) > 0 ? Number(rawLow52).toFixed(2) : '—';

      return {
        symbol: stock.symbol,
        name: stock.name || stock.companyName || stock.symbol,
        enName: stock.symbol,
        sector: stock.sector || 'Others',
        ltp,
        change: Math.abs(pct),
        changeAmt: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}`,
        dayLow,
        dayHigh,
        pe: pe != null ? pe : '—',
        peStatus: pe != null ? (pe < 20 ? (isNe ? "उचित मूल्य" : "Fair Value") : (isNe ? "विकास मूल्य" : "Growth")) : '—',
        vol: volStr,
        high52,
        low52,
        isPos: chg >= 0,
        topMover: pct >= 5,
        sentiment: chg >= 0 ? (isNe ? "Bullish (खरिद अनुकूल)" : "Bullish (Buy)") : (isNe ? "Bearish (बिक्री दबाब)" : "Bearish (Sell)")
      };
    });
  }, [stocks, isNe]);

  const filtered = watchlistData.filter(stock => {
    const matchesSector = activeSector === 'ALL' || stock.sector.toLowerCase().includes(activeSector.toLowerCase());
    const q = query.toLowerCase().trim();
    const matchesQuery = !q ||
      stock.symbol.toLowerCase().includes(q) ||
      stock.name.toLowerCase().includes(q) ||
      stock.enName.toLowerCase().includes(q);
    return matchesSector && matchesQuery;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Search Input with Nepali Support */}
      <div className="relative flex items-center">
        <Search size={16} className="absolute left-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isNe ? "Search company (NABIL, शिवम्, बैंक, Hydro)..." : "Search company ticker or sector..."}
          className="w-full rounded-2xl border border-white/[0.08] bg-[#111622] py-3 pl-10 pr-10 text-xs text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none transition-all"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3.5 text-slate-400 hover:text-white text-xs"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mode Toggle: Simple vs Deep Screener */}
      <div className="flex items-center justify-between rounded-xl bg-[#111622] p-1 border border-white/[0.06]">
        <button
          onClick={() => setScreenerMode('simple')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            screenerMode === 'simple'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '✨ शुरुवाती लगानीकर्ता (Simple)' : '✨ Retail Investor (Simple)'}
        </button>
        <button
          onClick={() => setScreenerMode('pro')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            screenerMode === 'pro'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '📊 विस्तृत तथ्याङ्क (Deep Pro)' : '📊 Technical & Ratios (Pro)'}
        </button>
      </div>

      {/* Filter Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'ALL', label: isNe ? '🌟 सबै कम्पनीहरू (All)' : '🌟 All Sectors' },
          { id: 'Bank', label: isNe ? 'वाणिज्य बैंक (Bank)' : 'Commercial Bank' },
          { id: 'Hydro', label: isNe ? 'जलविद्युत (Hydro)' : 'Hydropower' },
          { id: 'Mfg', label: isNe ? 'उत्पादन (Mfg)' : 'Manufacturing' },
          { id: 'Invest', label: isNe ? 'लगानी (Investment)' : 'Investment' },
        ].map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSector(sec.id)}
            className={`rounded-xl px-3.5 py-1.5 text-xs whitespace-nowrap transition-all ${
              activeSector === sec.id
                ? 'font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'font-medium bg-[#111622] text-slate-400 border border-white/[0.06] hover:text-white'
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* Scrip Cards Container */}
      <div className="space-y-2.5">
        {filtered.slice(0, 50).map((stock) => {
          const rangeSpan = Math.max(0.1, stock.dayHigh - stock.dayLow);
          const rangePct = Math.min(100, Math.max(0, ((stock.ltp - stock.dayLow) / rangeSpan) * 100));

          return (
            <div
              key={stock.symbol}
              onClick={() => onSelectScrip && onSelectScrip(stock.symbol)}
              className="tap-active group rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 hover:bg-[#161D2E] hover:border-sky-500/30 transition-all cursor-pointer shadow-sm space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 font-mono text-xs font-bold text-sky-300">
                    {stock.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-sm font-extrabold text-white">{stock.symbol}</span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-300 font-medium">
                        {stock.sector}
                      </span>
                      {stock.topMover && (
                        <span className="rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5">
                          ⚡ TOP MOVER
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 font-medium mt-0.5">
                      {isNe ? stock.name : stock.enName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isNe ? stock.enName : stock.name}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-base font-extrabold text-white">Rs {stock.ltp.toFixed(2)}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold border ${
                      stock.isPos
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                    }`}>
                      {stock.isPos ? '+' : '-'}{stock.change.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">({stock.changeAmt})</div>
                </div>
              </div>

              {screenerMode === 'simple' ? (
                <div className="rounded-xl bg-[#0B0F17]/80 p-2.5 border border-white/[0.04] space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                    <span>{isNe ? 'दिनको न्यून:' : 'Low:'} <strong className="text-slate-200">Rs {stock.dayLow}</strong></span>
                    <span className="text-sky-400 font-medium font-sans">{stock.sentiment}</span>
                    <span>{isNe ? 'दिनको उच्च:' : 'High:'} <strong className="text-slate-200">Rs {stock.dayHigh}</strong></span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                    <div className={`h-full rounded-full ${stock.isPos ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${rangePct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>{isNe ? 'कारोबार:' : 'Volume:'} <strong className="text-white font-mono">{stock.vol}</strong> {isNe ? 'कित्ता' : 'shares'}</span>
                    <span className="text-sky-400 font-medium">{isNe ? 'हेर्नुहोस् →' : 'View Details →'}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#0B0F17]/90 p-2.5 border border-white/[0.04] text-[11px] font-mono">
                  <div>
                    <span className="text-white font-bold">{stock.pe}</span>
                    {stock.peStatus !== '—' && (
                      <span className="text-[9px] text-emerald-400 block">{stock.peStatus}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">52W HIGH/LOW</span>
                    <span className="text-slate-200 font-semibold">{stock.high52}</span>
                    <span className="text-[9px] text-slate-400 block">{stock.low52}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[9px] uppercase">TURNOVER VOL</span>
                    <span className="text-sky-400 font-bold">{stock.vol}</span>
                    <span className="text-[9px] text-slate-400 block">Kitta Traded</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plain Language Tip Box */}
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-3.5 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-sky-400">
          <Info size={16} />
          <span>{isNe ? 'सजिलो सुझाव (Retail Investor Tip): P/E Ratio के हो?' : 'Retail Tip: What is P/E Ratio?'}</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed">
          {isNe
            ? 'P/E २० भन्दा कम हुनु सामान्यतया नेप्सेमा उचित मूल्य मानिन्छ। यसको अर्थ कम्पनीले कमाएको १ रुपैयाँको लागि तपाईंले कति रुपैयाँ तिरिरहनुभएको छ भन्ने बुझाउँछ।'
            : 'A P/E ratio below 20 is typically considered fair value in NEPSE. It indicates how much you are paying for every NPR 1 earned by the company.'}
        </p>
      </div>
    </div>
  );
}

export default WatchlistScreener;
