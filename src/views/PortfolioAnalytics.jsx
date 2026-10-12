import React from 'react';
import { Calculator, ChevronRight } from 'lucide-react';

export function PortfolioAnalytics({ onOpenWacc, onSelectScrip, lang = 'ne', stocks = [] }) {
  const isNe = lang === 'ne';

  // Live price lookups with fallbacks
  const nabilStock = stocks.find(s => s.symbol === 'NABIL');
  const shivmStock = stocks.find(s => s.symbol === 'SHIVM');

  const nabilLtp = nabilStock?.ltp ? Number(nabilStock.ltp) : 585.00;
  const shivmLtp = shivmStock?.ltp ? Number(shivmStock.ltp) : 612.40;

  // Holdings calculations
  const nabilKitta = 600;
  const nabilWacc = 373.33;
  const nabilVal = nabilKitta * nabilLtp;
  const nabilCost = nabilKitta * nabilWacc;
  const nabilProfit = nabilVal - nabilCost;
  const nabilProfitPct = ((nabilProfit / nabilCost) * 100).toFixed(2);

  const shivmKitta = 800;
  const shivmWacc = 435.00;
  const shivmVal = shivmKitta * shivmLtp;
  const shivmCost = shivmKitta * shivmWacc;
  const shivmProfit = shivmVal - shivmCost;
  const shivmProfitPct = ((shivmProfit / shivmCost) * 100).toFixed(2);

  // Portfolio total
  const cashVal = 148295;
  const otherVal = 493735;
  const totalVal = Math.round(nabilVal + shivmVal + cashVal + otherVal);
  const totalCost = Math.round(nabilCost + shivmCost + cashVal + otherVal * 0.9);
  const totalProfit = totalVal - totalCost;
  const totalProfitPct = ((totalProfit / totalCost) * 100).toFixed(2);

  const dayGain = Math.round((nabilStock?.pointChange || 11) * nabilKitta + (shivmStock?.pointChange || 54.9) * shivmKitta);

  return (
    <div className="space-y-4 pb-24">
      {/* Portfolio Total Valuation Card */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141A28] to-[#0F131F] p-4.5 shadow-xl space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium font-sans">
          <span className="uppercase tracking-wider font-semibold">
            {isNe ? 'कुल पोर्टफोलियो मूल्यांकन (Total Worth)' : 'Total Portfolio Worth'}
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20 font-bold">
            TMS 58 • SYNCED
          </span>
        </div>

        <div className="mt-1 font-mono text-3xl font-extrabold text-white">
          {isNe ? `रु ${totalVal.toLocaleString()}` : `NPR ${totalVal.toLocaleString()}`}<span className="text-slate-500 text-lg">.००</span>
        </div>

        {/* Return Stat Matrix */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-white/[0.04] bg-[#0B0F17]/80 p-3 font-mono">
            <div className="text-[10px] uppercase text-slate-400 font-sans">
              {isNe ? 'कुल नाफा (Overall Return)' : 'Overall Profit'}
            </div>
            <div className={`mt-1 text-base font-extrabold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalProfit >= 0 ? '+' : ''}रु {totalProfit.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5 font-bold">↗ +{totalProfitPct}%</div>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-[#0B0F17]/80 p-3 font-mono">
            <div className="text-[10px] uppercase text-slate-400 font-sans">
              {isNe ? "आजको वृद्धि (Today's Gain)" : "Today's Gain"}
            </div>
            <div className={`mt-1 text-base font-extrabold ${dayGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dayGain >= 0 ? '+' : ''}रु {dayGain.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5 font-bold">↑ +1.26%</div>
          </div>
        </div>

        {/* Sector Allocation Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-400 font-sans">
            <span>{isNe ? 'क्षेत्रगत लगानी (Asset Allocation)' : 'Asset Allocation'}</span>
            <span>{isNe ? '४ क्षेत्रहरू' : '4 Sectors'}</span>
          </div>
          <div className="flex h-2 w-full rounded-full overflow-hidden gap-0.5 bg-white/[0.05]">
            <div className="bg-sky-400" style={{ width: '45%' }} title="Bank (45%)" />
            <div className="bg-emerald-400" style={{ width: '30%' }} title="Hydro (30%)" />
            <div className="bg-amber-400" style={{ width: '15%' }} title="Mfg (15%)" />
            <div className="bg-slate-500" style={{ width: '10%' }} title="Cash (10%)" />
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400 pt-0.5 font-sans">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> {isNe ? 'बैंक: ४५%' : 'Bank: 45%'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {isNe ? 'हाइड्रो: ३०%' : 'Hydro: 30%'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {isNe ? 'उत्पादन: १५%' : 'Mfg: 15%'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> {isNe ? 'नगद: १०%' : 'Cash: 10%'}
            </div>
          </div>
        </div>
      </div>

      {/* WACC & Tax Action Quick Card */}
      <button
        onClick={onOpenWacc}
        className="tap-active w-full rounded-2xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 p-4 flex justify-between items-center text-xs transition-all"
      >
        <div className="flex items-center gap-2.5 text-sky-400 font-bold font-sans text-left">
          <div className="p-2 rounded-xl bg-sky-500/20">
            <Calculator size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              {isNe ? 'WACC र पुँजीगत लाभकर हिसाब (Tax Engine)' : 'WACC & Capital Gains Tax Calculator'}
            </div>
            <div className="text-[11px] text-sky-300 font-normal">
              {isNe ? 'MeroShare EDIS तथा ब्रोकर ५८ प्रमाणित लागत दर' : 'MeroShare EDIS & Broker 58 Verified Cost'}
            </div>
          </div>
        </div>
        <ChevronRight size={20} className="text-sky-400" />
      </button>

      {/* User Holdings List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span>{isNe ? 'मेरो सेयर मौज्दात (My Holdings)' : 'My Stock Holdings'}</span>
          <span className="font-mono text-[10px] text-sky-400">Sort by Gain ↓</span>
        </div>

        <div className="space-y-2">
          {/* NABIL Holding */}
          <div
            onClick={() => onSelectScrip && onSelectScrip('NABIL')}
            className="tap-active rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-2 hover:bg-[#161D2E] cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-extrabold text-white">NABIL</span>
                  <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-300 uppercase font-mono">Bank</span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  {isNe ? `६०० कित्ता • WACC रु ${nabilWacc.toFixed(2)}` : `600 Kitta • WACC Rs ${nabilWacc.toFixed(2)}`}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-white">रु {Math.round(nabilVal).toLocaleString()}</div>
                <div className="text-[11px] text-slate-400">LTP: Rs {nabilLtp.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex justify-between border-t border-white/[0.04] pt-2 text-xs font-mono">
              <span className="text-slate-400 font-sans">{isNe ? 'खुद नाफा (Unrealized P&L):' : 'Unrealized P&L:'}</span>
              <span className={`font-bold ${nabilProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {nabilProfit >= 0 ? '+' : ''}रु {Math.round(nabilProfit).toLocaleString()} ({nabilProfit >= 0 ? '+' : ''}{nabilProfitPct}%)
              </span>
            </div>
          </div>

          {/* SHIVM Holding */}
          <div
            onClick={() => onSelectScrip && onSelectScrip('SHIVM')}
            className="tap-active rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-2 hover:bg-[#161D2E] cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-extrabold text-white">SHIVM</span>
                  <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-300 uppercase font-mono">Mfg</span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  {isNe ? `८०० कित्ता • WACC रु ${shivmWacc.toFixed(2)}` : `800 Kitta • WACC Rs ${shivmWacc.toFixed(2)}`}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-white">रु {Math.round(shivmVal).toLocaleString()}</div>
                <div className="text-[11px] text-slate-400">LTP: Rs {shivmLtp.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex justify-between border-t border-white/[0.04] pt-2 text-xs font-mono">
              <span className="text-slate-400 font-sans">{isNe ? 'खुद नाफा (Unrealized P&L):' : 'Unrealized P&L:'}</span>
              <span className={`font-bold ${shivmProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {shivmProfit >= 0 ? '+' : ''}रु {Math.round(shivmProfit).toLocaleString()} ({shivmProfit >= 0 ? '+' : ''}{shivmProfitPct}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PortfolioAnalytics;
