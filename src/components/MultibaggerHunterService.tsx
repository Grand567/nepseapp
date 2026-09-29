import React, { useState, useMemo } from 'react';
import { Target, Zap, Shield, Award, TrendingUp, TrendingDown, Flame, AlertTriangle, CheckCircle2, XCircle, Filter, ChevronRight, RefreshCw, Star } from 'lucide-react';
import { getAccurateFestivalSeasonality } from '../utils/quantEngine';

interface MultibaggerHunterProps {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (s: any) => void;
}

const GATE_LABELS = ['Float', 'Supply', 'Squeeze', 'Volume', 'Broker', 'DPI', 'Graham', 'Season'];

export function MultibaggerHunterService({ stocks = [], indices, onSelectStock }: MultibaggerHunterProps) {
  const [filterScore, setFilterScore] = useState<number | null>(null);
  const [filterSector, setFilterSector] = useState<string | null>(null);

  const season = useMemo(() => getAccurateFestivalSeasonality(), []);
  const seasonOk = (season?.scoreBonus || 0) >= 0;

  const evaluated = useMemo(() => {
    return stocks
      .filter(s => s && s.symbol && s.ltp > 0)
      .map(s => {
        const publicFloatM = (1 - (s.promoterHolding || 51) / 100) * (s.sharesOut || 10);
        const bvps = s.bvps || s.bookValue || 0;
        const g = s.eps > 0 && bvps > 0 ? Math.sqrt(22.5 * s.eps * bvps) : 0;
        const mos = g > 0 ? ((g - s.ltp) / g) * 100 : null;
        
        const gates = [
          publicFloatM <= 15,
          (s.promoterHolding || 0) >= 52 || (s.stealthAccumulation || 0) >= 55,
          s.bollinger?.squeeze === true || (Math.abs(s.pChange || 0) <= 2.0 && (s.volume || 0) > 5000),
          (s.volumeZScore || 0) >= 1.5 || (s.volumeSurgeRatio || 0) >= 1.8 || s.isVolumeShocker === true,
          (s.stealthAccumulation || 0) >= 60 || ((s.pChange || 0) > 0 && (s.technicalScore || 0) >= 65),
          (s.dpi || 0) >= 65 || (s.technicalScore || 0) >= 65,
          mos !== null ? mos >= 5 : (s.pe > 0 && s.pe < 28),
          seasonOk,
        ];
        
        const gatesPass = gates.filter(Boolean).length;
        const isEstimated = s.rsi === null || s.rsi === undefined || s.volumeZScore === null || s.volumeZScore === undefined;
        
        return { ...s, gates, gatesPass, isEstimated, mos, publicFloatM };
      })
      .sort((a, b) => b.gatesPass - a.gatesPass || (b.turnover || 0) - (a.turnover || 0));
  }, [stocks, seasonOk]);

  const filtered = useMemo(() => {
    let res = evaluated;
    if (filterScore !== null) {
      res = res.filter(s => s.gatesPass >= filterScore);
    }
    if (filterSector !== null) {
      res = res.filter(s => {
        const sector = (s.sector || '').toLowerCase();
        if (filterSector === 'hydro') return sector.includes('hydro');
        if (filterSector === 'banks') return sector.includes('commercial bank') || sector.includes('bank');
        if (filterSector === 'finance') return sector.includes('finance');
        if (filterSector === 'micro') return sector.includes('microfinance');
        return true;
      });
    }
    return res.slice(0, 60);
  }, [evaluated, filterScore, filterSector]);

  const hasEstimated = filtered.some(s => s.isEstimated);
  const candidatesCount = evaluated.filter(s => s.gatesPass >= 5).length;
  const bestScore = evaluated.length > 0 ? evaluated[0].gatesPass : 0;

  const handleOpenAnalyzer = (symbol: string) => {
    window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'entry-exit-analyzer', symbol } }));
  };

  const handleOpenRadar = (symbol: string) => {
    window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'stealth-accumulation-tracker', symbol } }));
  };

  const getSeasonBannerStyles = () => {
    if (season?.bias === 'bullish') return 'bg-emerald-900/30 border-emerald-700/40 text-emerald-200';
    if (season?.bias === 'bearish') return 'bg-red-900/30 border-red-700/40 text-red-200';
    return 'bg-slate-800/50 border-slate-700 text-slate-200';
  };

  return (
    <div className="w-full flex flex-col space-y-4 font-sans text-slate-200 p-4">
      
      {/* 1. Top Banner */}
      {season && (
        <div className={`flex items-center gap-2 p-3 rounded-md border ${getSeasonBannerStyles()}`}>
          <Target className="w-5 h-5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">📅 Current Season:</span> {season.phase} | 
            <span className="ml-2 font-semibold">Win Rate:</span> {season.historicalWinRate}% | 
            <span className="ml-2 font-semibold">Bias:</span> <span className="capitalize">{season.bias}</span>
          </div>
        </div>
      )}

      {/* 2. Data Quality Warning */}
      {hasEstimated && (
        <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-700/30 text-amber-300 text-xs p-2 rounded">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p>⚠️ Some gate scores use estimated data (marked *). Open Entry/Exit Analyzer for verified real-time signals.</p>
        </div>
      )}

      {/* 3. Gate Legend */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">GATES:</span>
        {GATE_LABELS.map((label, idx) => (
          <div key={idx} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full whitespace-nowrap">
            {idx + 1}-{label}
          </div>
        ))}
      </div>

      {/* 4. Filter Buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setFilterScore(null)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterScore === null ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>All</button>
        <button onClick={() => setFilterScore(8)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1 ${filterScore === 8 ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>8 Gates <Star className="w-3 h-3" /></button>
        <button onClick={() => setFilterScore(7)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterScore === 7 ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>7+ Gates</button>
        <button onClick={() => setFilterScore(6)} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterScore === 6 ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>6+ Gates</button>
        
        <div className="w-px h-6 bg-slate-600 mx-1"></div>
        
        <button onClick={() => setFilterSector(filterSector === 'hydro' ? null : 'hydro')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterSector === 'hydro' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Hydro</button>
        <button onClick={() => setFilterSector(filterSector === 'banks' ? null : 'banks')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterSector === 'banks' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Banks</button>
        <button onClick={() => setFilterSector(filterSector === 'finance' ? null : 'finance')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterSector === 'finance' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Finance</button>
        <button onClick={() => setFilterSector(filterSector === 'micro' ? null : 'micro')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filterSector === 'micro' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Micro</button>
      </div>

      {/* 5. Stock Cards & 6. Empty state */}
      <div className="flex flex-col space-y-3 mt-2">
        {stocks.length === 0 ? (
          <div className="text-center text-slate-400 py-12">Loading market data...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-12">No stocks match the current filters.</div>
        ) : (
          filtered.map((s, idx) => (
            <div key={s.symbol || idx} className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 hover:border-slate-500 transition-colors flex flex-col gap-3">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {s.sector && <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">{s.sector}</span>}
                  </div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 cursor-pointer hover:text-blue-400" onClick={() => onSelectStock?.(s)}>
                    {s.symbol} <span className="text-sm font-normal text-slate-400">— {s.name || s.companyName || ''}</span>
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">Rs. {s.ltp?.toLocaleString()}</div>
                  <div className={`text-xs font-medium flex items-center justify-end gap-1 ${s.pChange > 0 ? 'text-emerald-400' : s.pChange < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {s.pChange > 0 ? <TrendingUp className="w-3 h-3" /> : s.pChange < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                    {s.pChange > 0 ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Gates Score */}
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${s.gatesPass >= 6 ? 'text-emerald-400' : s.gatesPass >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>
                  Gates: {s.gatesPass}/8
                </span>
                
                {/* Progress bar visual */}
                <div className="flex gap-0.5 flex-1 max-w-[120px]">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-sm ${i < s.gatesPass ? (s.gatesPass >= 6 ? 'bg-emerald-400' : s.gatesPass >= 4 ? 'bg-yellow-400' : 'bg-red-400') : 'bg-slate-700'}`} />
                  ))}
                </div>

                {/* Gate indicators */}
                <div className="flex items-center gap-1 ml-auto">
                  {s.gates.map((passed: boolean, i: number) => (
                    <div key={i} className="text-xs" title={GATE_LABELS[i]}>
                      {passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>DPI: <strong className="text-slate-200">{s.dpi ? s.dpi.toFixed(0) : '--'}/100</strong></span>
                <span>Z-Score: <strong className="text-slate-200">{s.volumeZScore ? `${s.volumeZScore.toFixed(1)}σ` : '--'}</strong></span>
                <span>Turnover: <strong className="text-slate-200">{s.turnover ? `Rs. ${(s.turnover / 100000).toFixed(1)}L` : '--'}</strong></span>
                {s.isEstimated && <span className="text-amber-400 font-bold ml-1" title="Estimated Data">*</span>}
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700/50 mt-1">
                <button 
                  onClick={() => handleOpenAnalyzer(s.symbol)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 px-2 py-1 rounded transition-colors"
                >
                  Entry Analyzer <ChevronRight className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => handleOpenRadar(s.symbol)}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-400/10 px-2 py-1 rounded transition-colors"
                >
                  Accum. Radar <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 7. Footer Stats */}
      {stocks.length > 0 && (
        <div className="text-xs text-center text-slate-500 pt-4 pb-2 border-t border-slate-800">
          Total Scanned: {stocks.length} | Candidates (≥5 gates): {candidatesCount} | Best Score: {bestScore}/8
        </div>
      )}

    </div>
  );
}

export default MultibaggerHunterService;
