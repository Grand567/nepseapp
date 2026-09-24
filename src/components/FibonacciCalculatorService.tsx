import React, { useState, useEffect, useMemo } from 'react';
import { Target, SlidersHorizontal, ArrowUpRight, ArrowDownRight, RefreshCw, Shield, Sparkles, CheckCircle2 } from 'lucide-react';
import { loadNepseData } from '../utils/liveData';
import { StockSearchSelect, StatCard, InfoBanner, Insight } from './ui';

export function FibonacciCalculatorService() {
  const [symbol, setSymbol] = useState('NABIL');
  const [stocks, setStocks] = useState<any[]>([]);
  const [highPrice, setHighPrice] = useState<number>(680);
  const [lowPrice, setLowPrice] = useState<number>(450);
  const [currentLtp, setCurrentLtp] = useState<number>(540);
  const [trend, setTrend] = useState<'up' | 'down'>('up');
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    loadNepseData().then(({ stocks }) => {
      setStocks(stocks);
      const sel = stocks.find(s => (s.symbol || '').toUpperCase() === 'NABIL') || stocks[0];
      if (sel) {
        const ltp = Number(sel.ltp || sel.closePrice || 100);
        const hi = Number(sel.high52w || (sel.high ? sel.high * 1.05 : ltp * 1.25));
        const lo = Number(sel.low52w || (sel.low ? sel.low * 0.95 : ltp * 0.75));
        setSymbol(sel.symbol || 'NABIL');
        setCurrentLtp(ltp);
        setHighPrice(Math.round(hi));
        setLowPrice(Math.round(lo));
      }
    });
  }, []);

  const handleSelectSymbol = (sym: string) => {
    setSymbol(sym);
    const sel = stocks.find(s => (s.symbol || '').toUpperCase() === sym.toUpperCase());
    if (sel) {
      const ltp = Number(sel.ltp || 500);
      const hi = Number(sel.high52w || (sel.high ? sel.high * 1.05 : ltp * 1.25));
      const lo = Number(sel.low52w || (sel.low ? sel.low * 0.95 : ltp * 0.75));
      setCurrentLtp(ltp);
      setHighPrice(Math.round(hi));
      setLowPrice(Math.round(lo));
    }
  };

  const diff = Math.max(1, highPrice - lowPrice);

  const retracements = useMemo(() => {
    if (trend === 'up') {
      // Pullback from High to Low
      return [
        { ratio: '0.0%', label: 'Swing High (Peak)', price: +(highPrice).toFixed(1), note: 'Prior Top / Resistance', color: '#64748b' },
        { ratio: '23.6%', label: 'Shallow Pullback', price: +(highPrice - diff * 0.236).toFixed(1), note: 'Minor consolidation in strong trend', color: '#94a3b8' },
        { ratio: '38.2%', label: 'Moderate Retracement', price: +(highPrice - diff * 0.382).toFixed(1), note: 'Healthy first support zone', color: '#38bdf8' },
        { ratio: '50.0%', label: 'Equilibrium (Halfway)', price: +(highPrice - diff * 0.50).toFixed(1), note: 'Crucial psychological support', color: '#eab308' },
        { ratio: '61.8%', label: 'Golden Ratio (Phi)', price: +(highPrice - diff * 0.618).toFixed(1), note: 'Highest probability reversal zone', color: '#10b981', isGolden: true },
        { ratio: '78.6%', label: 'Deep Retracement', price: +(highPrice - diff * 0.786).toFixed(1), note: 'Last line of defense before base', color: '#f97316' },
        { ratio: '100.0%', label: 'Swing Low (Base)', price: +(lowPrice).toFixed(1), note: 'Full retracement / Invalidates trend', color: '#ef4444' },
      ];
    } else {
      // Bounce from Low to High
      return [
        { ratio: '0.0%', label: 'Swing Low (Trough)', price: +(lowPrice).toFixed(1), note: 'Prior Bottom / Support', color: '#64748b' },
        { ratio: '23.6%', label: 'Weak Dead-Cat Bounce', price: +(lowPrice + diff * 0.236).toFixed(1), note: 'Minor bear relief', color: '#94a3b8' },
        { ratio: '38.2%', label: 'Moderate Rebound', price: +(lowPrice + diff * 0.382).toFixed(1), note: 'First resistance for shorting', color: '#38bdf8' },
        { ratio: '50.0%', label: 'Halfway Pivot', price: +(lowPrice + diff * 0.50).toFixed(1), note: 'Crucial bear pivot', color: '#eab308' },
        { ratio: '61.8%', label: 'Golden Reversal Barrier', price: +(lowPrice + diff * 0.618).toFixed(1), note: 'Major downtrend resistance', color: '#10b981', isGolden: true },
        { ratio: '78.6%', label: 'Deep Bear Squeeze', price: +(lowPrice + diff * 0.786).toFixed(1), note: 'Nearing complete bottom reversal', color: '#f97316' },
        { ratio: '100.0%', label: 'Swing High (Origin)', price: +(highPrice).toFixed(1), note: 'Complete recovery of downmove', color: '#ef4444' },
      ];
    }
  }, [highPrice, lowPrice, trend, diff]);

  const extensions = useMemo(() => {
    if (trend === 'up') {
      return [
        { ratio: '127.2%', label: 'Target 1 (Conservative)', price: +(highPrice + diff * 0.272).toFixed(1), color: '#38bdf8' },
        { ratio: '161.8%', label: 'Target 2 (Golden Extension)', price: +(highPrice + diff * 0.618).toFixed(1), color: '#10b981', isGolden: true },
        { ratio: '261.8%', label: 'Target 3 (Super Rally)', price: +(highPrice + diff * 1.618).toFixed(1), color: '#a855f7' },
      ];
    } else {
      return [
        { ratio: '127.2%', label: 'Breakdown Target 1', price: +(lowPrice - diff * 0.272).toFixed(1), color: '#f87171' },
        { ratio: '161.8%', label: 'Breakdown Target 2 (Golden)', price: +(lowPrice - diff * 0.618).toFixed(1), color: '#ef4444', isGolden: true },
        { ratio: '261.8%', label: 'Capitulation Target 3', price: +(lowPrice - diff * 1.618).toFixed(1), color: '#b91c1c' },
      ];
    }
  }, [highPrice, lowPrice, trend, diff]);

  // Nearest Fibonacci level to current LTP
  const nearestLevel = useMemo(() => {
    let best = retracements[0];
    let minD = Math.abs(currentLtp - best.price);
    for (const lvl of retracements) {
      const d = Math.abs(currentLtp - lvl.price);
      if (d < minD) {
        minD = d;
        best = lvl;
      }
    }
    return { ...best, diff: minD, diffPct: ((minD / currentLtp) * 100).toFixed(1) };
  }, [currentLtp, retracements]);

  const inGoldenZone = currentLtp >= (highPrice - diff * 0.62) && currentLtp <= (highPrice - diff * 0.49);

  return (
    <div className="space-y-4">
      {/* Top selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-48 sm:w-60">
            <StockSearchSelect
              value={symbol}
              onChange={handleSelectSymbol}
              placeholder="Select scrip (e.g. NABIL)…"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setTrend('up')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${trend === 'up' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <ArrowUpRight size={14} /> Uptrend Pullback
            </button>
            <button
              onClick={() => setTrend('down')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${trend === 'down' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <ArrowDownRight size={14} /> Downtrend Bounce
            </button>
          </div>
        </div>

        <button
          onClick={() => setUseCustom(!useCustom)}
          className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition underline underline-offset-4"
        >
          {useCustom ? 'Use 52W High/Low' : 'Enter Custom Swing Points'}
        </button>
      </div>

      {/* Input levels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-800/80">
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Swing High (Peak)
          </label>
          <input
            type="number"
            value={highPrice}
            onChange={(e) => setHighPrice(Number(e.target.value) || 0)}
            disabled={!useCustom}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-emerald-400 outline-none focus:border-blue-500 disabled:opacity-75"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Swing Low (Trough)
          </label>
          <input
            type="number"
            value={lowPrice}
            onChange={(e) => setLowPrice(Number(e.target.value) || 0)}
            disabled={!useCustom}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-rose-400 outline-none focus:border-blue-500 disabled:opacity-75"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Current Price (LTP)
          </label>
          <input
            type="number"
            value={currentLtp}
            onChange={(e) => setCurrentLtp(Number(e.target.value) || 0)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono font-bold text-blue-400 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Summary HUD */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Current LTP" value={`Rs. ${currentLtp}`} big color="#3b82f6" />
        <StatCard label="Nearest Fibonacci" value={`Rs. ${nearestLevel.price}`} subtitle={`${nearestLevel.ratio} (${nearestLevel.diffPct}% away)`} color={nearestLevel.isGolden ? '#10b981' : '#f59e0b'} />
        <StatCard label="Golden Pocket (61.8%)" value={`Rs. ${(highPrice - diff * 0.618).toFixed(1)}`} subtitle="High-Probability Entry" color="#10b981" />
        <StatCard label="Golden Pocket Status" value={inGoldenZone ? 'INSIDE GOLDEN ZONE' : 'Outside Golden Zone'} color={inGoldenZone ? '#10b981' : '#64748b'} />
      </div>

      {inGoldenZone && (
        <InfoBanner type="success">
          ✨ <strong>{symbol} is currently trading inside the 50%–61.8% Golden Retracement Pocket!</strong> Historically, this zone offers the best risk-to-reward ratio with stop-loss placed just below the 78.6% level (Rs. {(highPrice - diff * 0.786).toFixed(1)}).
        </InfoBanner>
      )}

      {/* Retracement Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Fibonacci Retracement Levels (Support / Bounce Matrix)
        </h4>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] font-bold">
              <tr>
                <th className="p-3">Fib Level</th>
                <th className="p-3 text-right">Target Price</th>
                <th className="p-3">Market Significance</th>
                <th className="p-3 text-right">Distance from LTP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono">
              {retracements.map((lvl) => {
                const isNear = Math.abs(currentLtp - lvl.price) / currentLtp < 0.02;
                const dist = currentLtp - lvl.price;
                return (
                  <tr
                    key={lvl.ratio}
                    className={`transition ${lvl.isGolden ? 'bg-emerald-950/20' : ''} ${isNear ? 'border-l-4 border-blue-500 bg-blue-950/20' : 'hover:bg-slate-900/30'}`}
                  >
                    <td className="p-3 font-bold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lvl.color }}></span>
                      <span className="text-white">{lvl.ratio}</span>
                      {lvl.isGolden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-sans font-bold">GOLDEN</span>}
                    </td>
                    <td className="p-3 text-right font-black text-sm text-white">
                      Rs. {lvl.price.toLocaleString()}
                    </td>
                    <td className="p-3 font-sans text-slate-300 text-xs">
                      <span className="font-semibold text-slate-200">{lvl.label}:</span> {lvl.note}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      <span className={dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-amber-400'}>
                        {dist > 0 ? `+Rs. ${dist.toFixed(1)}` : `Rs. ${dist.toFixed(1)}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extension Targets */}
      <div className="space-y-2 pt-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Fibonacci Extension Targets (Take-Profit Horizons)
        </h4>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {extensions.map((ext) => (
            <div
              key={ext.ratio}
              className={`p-3.5 rounded-xl border ${ext.isGolden ? 'border-emerald-800/80 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/40'}`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1 text-slate-400">
                <span>{ext.label}</span>
                <span className="font-mono text-emerald-400">{ext.ratio}</span>
              </div>
              <div className="font-mono text-lg font-black text-white">
                Rs. {ext.price.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Potential upside: <strong className="text-emerald-400">+{(((ext.price - currentLtp) / currentLtp) * 100).toFixed(1)}%</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Insight>
        In NEPSE technical analysis, the 61.8% Golden Ratio retracement level coincides with peak institutional re-accumulation after a multi-week rally. Enter when a bullish candlestick (Hammer, Morning Star) forms directly on the 61.8% support with volume expansion.
      </Insight>
    </div>
  );
}
