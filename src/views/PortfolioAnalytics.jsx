import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ChevronRight, PieChart } from 'lucide-react';
import { loadEncryptedUserProfiles, resolveActiveUserId } from '../utils/profileVaultStorage';

export function PortfolioAnalytics({ onOpenWacc, onSelectScrip, lang = 'ne', stocks: rawStocks = [] }) {
  const isNe = lang === 'ne';
  const stocks = Array.isArray(rawStocks) ? rawStocks : [];
  const [userHoldings, setUserHoldings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const uid = resolveActiveUserId();
    loadEncryptedUserProfiles(uid)
      .then((profiles) => {
        if (!active) return;
        const map = {};
        (profiles || []).forEach(p => {
          (p.holdings || []).forEach(h => {
            const sym = String(h.symbol || h.scrip || '').toUpperCase().trim();
            const qty = Number(h.units || 0);
            const wacc = Number(h.wacc || 100);
            if (!sym || qty <= 0) return;
            if (!map[sym]) map[sym] = { symbol: sym, units: 0, cost: 0 };
            map[sym].units += qty;
            map[sym].cost += qty * wacc;
          });
        });
        setUserHoldings(Object.values(map).map(h => ({ ...h, wacc: h.units > 0 ? h.cost / h.units : 0 })));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const enriched = useMemo(() => userHoldings.map(h => {
    const m = stocks.find(s => String(s.symbol || '').toUpperCase() === h.symbol);
    const ltp = Number(m?.ltp || m?.close || h.wacc || 0);
    const val = h.units * ltp;
    const profit = val - h.cost;
    const profitPct = h.cost > 0 ? (profit / h.cost) * 100 : 0;
    const dayChange = Number(m?.pointChange ?? m?.change ?? 0) * h.units;
    return { ...h, ltp, val, profit, profitPct, dayChange, sector: m?.sector || 'Others' };
  }).sort((a, b) => b.profit - a.profit), [userHoldings, stocks]);

  const totalVal = Math.round(enriched.reduce((s, h) => s + h.val, 0));
  const totalCost = Math.round(enriched.reduce((s, h) => s + h.cost, 0));
  const totalProfit = totalVal - totalCost;
  const totalProfitPct = totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : '0.00';
  const dayGain = Math.round(enriched.reduce((s, h) => s + h.dayChange, 0));
  const prevTotalVal = totalVal - dayGain;
  const dayGainPct = prevTotalVal > 0 ? ((dayGain / prevTotalVal) * 100).toFixed(2) : '0.00';

  // Dynamic sector distribution
  const sectorAllocation = useMemo(() => {
    if (totalVal <= 0) return [];
    const secMap = {};
    enriched.forEach(h => {
      const sec = h.sector || 'Others';
      secMap[sec] = (secMap[sec] || 0) + h.val;
    });
    return Object.entries(secMap)
      .map(([sector, val]) => ({
        sector,
        val,
        pct: Number(((val / totalVal) * 100).toFixed(1))
      }))
      .sort((a, b) => b.val - a.val);
  }, [enriched, totalVal]);

  const sectorColors = ['bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-purple-400', 'bg-rose-400', 'bg-slate-500'];

  return (
    <div className="space-y-4 pb-24">
      {/* Portfolio Total Valuation Card */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141A28] to-[#0F131F] p-4.5 shadow-xl space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium font-sans">
          <span className="uppercase tracking-wider font-semibold">
            {isNe ? 'कुल पोर्टफोलियो मूल्यांकन (Total Worth)' : 'Total Portfolio Worth'}
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20 font-bold">
            {enriched.length > 0 ? `VAULT SYNCED (${enriched.length} SCRIPS)` : 'VAULT EMPTY'}
          </span>
        </div>

        <div className="mt-1 font-mono text-3xl font-extrabold text-white">
          {isNe ? `रु ${totalVal.toLocaleString()}` : `NPR ${totalVal.toLocaleString()}`}<span className="text-slate-500 text-lg">{isNe ? '.००' : '.00'}</span>
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
            <div className={`text-[10px] mt-0.5 font-bold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalProfit >= 0 ? '↗ +' : '↘ '}{totalProfitPct}%
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-[#0B0F17]/80 p-3 font-mono">
            <div className="text-[10px] uppercase text-slate-400 font-sans">
              {isNe ? "आजको वृद्धि (Today's Gain)" : "Today's Gain"}
            </div>
            <div className={`mt-1 text-base font-extrabold ${dayGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dayGain >= 0 ? '+' : ''}रु {dayGain.toLocaleString()}
            </div>
            <div className={`text-[10px] mt-0.5 font-bold ${dayGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dayGain >= 0 ? '↑ +' : '↓ '}{dayGainPct}%
            </div>
          </div>
        </div>

        {/* Sector Allocation Bar */}
        {sectorAllocation.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] font-mono text-slate-400 font-sans">
              <span>{isNe ? 'क्षेत्रगत लगानी (Asset Allocation)' : 'Asset Allocation'}</span>
              <span>{isNe ? `${sectorAllocation.length} क्षेत्रहरू` : `${sectorAllocation.length} Sectors`}</span>
            </div>
            <div className="flex h-2 w-full rounded-full overflow-hidden gap-0.5 bg-white/[0.05]">
              {sectorAllocation.map((s, idx) => (
                <div
                  key={s.sector}
                  className={sectorColors[idx % sectorColors.length]}
                  style={{ width: `${s.pct}%` }}
                  title={`${s.sector} (${s.pct}%)`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400 pt-0.5 font-sans">
              {sectorAllocation.slice(0, 4).map((s, idx) => (
                <div key={s.sector} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${sectorColors[idx % sectorColors.length]}`} />
                  {s.sector}: {s.pct}%
                </div>
              ))}
            </div>
          </div>
        )}
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
              {isNe ? 'MeroShare EDIS तथा ब्रोकर प्रमाणित लागत दर' : 'MeroShare EDIS & Broker Verified Cost'}
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

        {isLoading ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-6 text-center text-xs text-slate-400">
            {isNe ? 'पोर्टफोलियो मौज्दात लोड हुँदैछ...' : 'Loading verified portfolio holdings...'}
          </div>
        ) : enriched.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-8 text-center space-y-3">
            <PieChart size={32} className="mx-auto text-slate-600" />
            <div className="text-sm font-bold text-white">
              {isNe ? 'कुनै सेयर मौज्दात भेटिएन' : 'No Portfolio Holdings Found'}
            </div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              {isNe
                ? 'तपाईंको MeroShare खाता सिंक गर्नुहोस् वा पोर्टफोलियो हबमा म्यानुअल सेयर जोड्नुहोस्।'
                : 'Sync your MeroShare account or add manual holdings in Portfolio Hub to view real-time valuation, gain analytics, and tax estimates.'}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {enriched.map(h => (
              <div
                key={h.symbol}
                onClick={() => onSelectScrip && onSelectScrip(h.symbol)}
                className="tap-active rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-2 hover:bg-[#161D2E] cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-white">{h.symbol}</span>
                      <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-300 uppercase font-mono">{h.sector}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 mt-0.5">
                      {isNe ? `${h.units.toLocaleString()} कित्ता • WACC रु ${h.wacc.toFixed(2)}` : `${h.units.toLocaleString()} Kitta • WACC Rs ${h.wacc.toFixed(2)}`}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-white">रु {Math.round(h.val).toLocaleString()}</div>
                    <div className="text-[11px] text-slate-400">LTP: Rs {h.ltp > 0 ? h.ltp.toFixed(2) : '—'}</div>
                  </div>
                </div>
                <div className="flex justify-between border-t border-white/[0.04] pt-2 text-xs font-mono">
                  <span className="text-slate-400 font-sans">{isNe ? 'खुद नाफा (Unrealized P&L):' : 'Unrealized P&L:'}</span>
                  <span className={`font-bold ${h.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {h.profit >= 0 ? '+' : ''}रु {Math.round(h.profit).toLocaleString()} ({h.profit >= 0 ? '+' : ''}{h.profitPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PortfolioAnalytics;
