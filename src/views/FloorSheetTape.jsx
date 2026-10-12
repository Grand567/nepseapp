import React, { useState } from 'react';
import { Zap } from 'lucide-react';

export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {
  const isNe = lang === 'ne';
  const [filterScrip, setFilterScrip] = useState('ALL');

  const trades = [
    {
      id: "#20241249",
      symbol: "CIT",
      time: "11:42:15",
      buyer: 34,
      seller: 14,
      kitta: 409,
      rate: 2341.00,
      turnover: "रु ९,५७,४६९",
      tag: isNe ? "संस्थागत" : "Institutional",
      tagColor: "sky"
    },
    {
      id: "#20241041",
      symbol: "NABIL",
      time: "11:42:04",
      buyer: 58,
      seller: 19,
      kitta: 1240,
      rate: 586.20,
      turnover: "रु ७,२६,८८८",
      tag: isNe ? "ब्रोकर ५८" : "Broker 58",
      tagColor: "emerald"
    },
    {
      id: "#20241042",
      symbol: "SHIVM",
      time: "11:41:50",
      buyer: 58,
      seller: 45,
      kitta: 8500,
      rate: 514.00,
      turnover: "रु ४३,६९,०००",
      tag: isNe ? "ब्लक ट्रेड" : "Block Trade",
      tagColor: "rose"
    },
    {
      id: "#20241040",
      symbol: "HDL",
      time: "11:41:35",
      buyer: 34,
      seller: 28,
      kitta: 450,
      rate: 1820.00,
      turnover: "रु ८,१९,०००",
      tag: isNe ? "नियमित" : "Regular",
      tagColor: "slate"
    }
  ];

  const filtered = trades.filter(t => filterScrip === 'ALL' || t.symbol === filterScrip);

  return (
    <div className="space-y-4 pb-24 font-mono">
      {/* Live Realtime Sync Status */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 space-y-2">
        <div className="flex justify-between items-center text-xs text-slate-400 font-sans">
          <span className="font-bold text-white tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            {isNe ? 'फ्लोरशिट प्रत्यक्ष कारोबार (Live Tape)' : 'Floor Sheet Live Tape'}
          </span>
          <span className="text-sky-400 font-mono text-[11px] font-bold">((•)) Sync: 14ms</span>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-white/[0.04] pt-2">
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-sans">
              {isNe ? 'कुल सम्झौता संख्या' : 'Total Contracts'}
            </div>
            <div className="text-base font-bold text-white mt-0.5">
              {isNe ? '७८,४१२' : '78,412'} <span className="text-emerald-400 text-xs">+142/m</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-sans">
              {isNe ? 'कारोबार रकम' : 'Turnover'}
            </div>
            <div className="text-base font-bold text-white mt-0.5">
              {isNe ? 'रु ४.८२ अर्ब' : 'NPR 4.82 Arba'}
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Block Trade Banner */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 space-y-1 text-xs">
        <div className="flex items-center justify-between text-sky-400 font-bold font-sans">
          <div className="flex items-center gap-1.5">
            <Zap size={16} />
            <span>{isNe ? 'ठूलो संस्थागत कारोबार (Block Trade)' : 'Institutional Block Trade'}</span>
          </div>
          <span className="text-[10px] bg-sky-500/20 px-2 py-0.5 rounded font-mono font-bold">&gt;5,000 {isNe ? 'कित्ता' : 'shares'}</span>
        </div>
        <div className="text-slate-300 font-sans text-[11px]">
          {isNe ? 'ब्रोकर #५८ (Naasa) → ब्रोकर #४५ • ८,५०० कित्ता (SHIVM @ ५१४.००)' : 'Broker #58 (Naasa) → Broker #45 • 8,500 shares (SHIVM @ 514.00)'}
        </div>
        <div className="text-[11px] text-emerald-400 font-semibold font-mono">
          Net Inflow: Broker 58 (Naasa) +23.9 Cr Accumulation
        </div>
      </div>

      {/* Scrip Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {['ALL', 'NABIL', 'SHIVM', 'CHCL', 'CIT', 'HDL'].map(sym => (
          <button
            key={sym}
            onClick={() => setFilterScrip(sym)}
            className={`px-3 py-1.5 rounded-xl border font-semibold transition-all ${
              filterScrip === sym
                ? 'border-sky-500 bg-sky-500/20 text-sky-400'
                : 'border-white/[0.06] bg-[#111622] text-slate-400 hover:text-white'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* Tape Header */}
      <div className="flex justify-between text-[10px] text-slate-400 px-2 uppercase font-sans font-bold">
        <span>{isNe ? 'कम्पनी / अर्डर नं' : 'Symbol / Order'}</span>
        <span>{isNe ? 'ब्रोकर (खरिद → बिक्री)' : 'Broker (Buy → Sell)'}</span>
        <span>{isNe ? 'कित्ता @ दर (रकम)' : 'Kitta @ Rate (Total)'}</span>
      </div>

      {/* Tape Trade Items */}
      <div className="space-y-2">
        {filtered.map((trade) => (
          <div
            key={trade.id}
            onClick={() => onSelectScrip && onSelectScrip(trade.symbol)}
            className="tap-active rounded-xl border border-white/[0.06] bg-[#111622] p-3 text-xs hover:bg-[#161D2E] cursor-pointer transition-all flex justify-between items-center"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-sm">{trade.symbol}</span>
                <span className={`text-[9px] px-1 rounded font-bold font-sans ${
                  trade.tagColor === 'sky'
                    ? 'bg-sky-500/20 text-sky-400'
                    : trade.tagColor === 'emerald'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : trade.tagColor === 'rose'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-white/[0.06] text-slate-300'
                }`}>
                  {trade.tag}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">{trade.id} • {trade.time}</div>
            </div>
            <div className="text-slate-300 text-xs">
              <span className="text-emerald-400 font-bold">#{trade.buyer}</span> → <span className="text-rose-400 font-bold">#{trade.seller}</span>
            </div>
            <div className="text-right">
              <div className="font-bold text-white">{trade.kitta} @ Rs {trade.rate.toFixed(2)}</div>
              <div className="text-[10px] text-slate-400">{trade.turnover}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FloorSheetTape;
