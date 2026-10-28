import React, { useState, useMemo, useEffect } from 'react';
import {
  Filter, Search, SlidersHorizontal, ArrowUpDown, CheckCircle2,
  XCircle, AlertTriangle, Play, RefreshCw, Layers, ShieldCheck,
  TrendingUp, Target, DollarSign
} from 'lucide-react';
import { StatCard, InfoBanner, Spinner, StockSearchSelect } from './ui';
import { evaluateStockSelection } from '../utils/signals/stockScoringEngine';
import { SCORING_CONFIG } from '../utils/signals/scoringConfig';
import { fetchFromBackend, loadNepseData } from '../utils/liveData';

export function StockSelectionScreener({
  stocks: propStocks = [],
  onSelectStock = null,
  onSelectSymbol = null
}: {
  stocks?: any[];
  onSelectStock?: ((s: any) => void) | null;
  onSelectSymbol?: ((sym: string) => void) | null;
}) {
  const [stocks, setStocks] = useState<any[]>(propStocks);
  const [loading, setLoading] = useState<boolean>(propStocks.length === 0);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUY' | 'WATCH' | 'AVOID'>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [minScore, setMinScore] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyPassedHardFilters, setOnlyPassedHardFilters] = useState<boolean>(false);
  const [sortField, setSortField] = useState<'score' | 'symbol' | 'turnover' | 'pChange'>('score');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Fetch live market data
  const loadMarketData = async () => {
    if (propStocks && propStocks.length > 0) {
      setStocks(propStocks);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await loadNepseData();
      const list = res?.stocks || [];
      setStocks(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load market screener data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propStocks && propStocks.length > 0) {
      setStocks(propStocks);
      setLoading(false);
    } else {
      loadMarketData();
    }
  }, [propStocks]);

  // Compute Selection Scores for each stock
  const scoredStocks = useMemo(() => {
    return stocks.map(stock => {
      const ltp = Number(stock.ltp || stock.marketPrice || 0);
      const prevClose = Number(stock.prevClose || ltp);
      const pChange = Number(stock.pChange || (prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0));
      const volume = Number(stock.volume || 0);
      const turnover = Number(stock.turnover || (ltp * volume));

      const bcr3Buy = Number(stock.bcr3Buy ?? stock.bcr3BuyPct ?? stock.brokerAnalysis?.bcr3BuyPct ?? stock.realBrokerAnalysis?.bcr3BuyPct ?? 0);
      const bcr5Buy = Number(stock.bcr5Buy ?? stock.bcr5BuyPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? stock.realBrokerAnalysis?.bcr5BuyPct ?? 0);
      const nbar = Number(stock.nbar ?? stock.brokerAnalysis?.nbar ?? 1.0);

      // Build scoring payload
      const evalResult = evaluateStockSelection({
        stock: {
          symbol: stock.symbol,
          sector: stock.sector,
          ltp,
          prevClose,
          volume,
          turnover,
          eps: Number(stock.eps ?? 18),
          bookValue: Number(stock.bookValue ?? 160),
          npl: stock.npl ?? null,
          car: stock.car ?? null,
          listedShares: stock.listedShares ?? 10000000,
          publicPercentage: stock.publicPercentage ?? 40
        },
        brokerSignals: {
          compositeScore: bcr3Buy > 0 ? Math.min(100, Math.max(10, Math.round(bcr3Buy * 1.4 + (nbar - 1.0) * 20))) : 55
        },
        technicalSignals: {
          compositeScore: pChange > 0 && volume > 20000 ? 75 : 50,
          signals: { volatility: { atr14: ltp * 0.03 } }
        },
        fundamentalSignals: { compositeScore: (stock.eps ?? 18) > 0 ? 70 : 30 },
        marketSignals: { compositeScore: 60 }
      });

      return {
        ...stock,
        ltp,
        pChange,
        volume,
        turnover,
        evalResult
      };
    });
  }, [stocks]);

  // Unique Sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach(s => {
      if (s.sector) set.add(s.sector);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [stocks]);

  // Filter & Sort
  const filteredStocks = useMemo(() => {
    return scoredStocks.filter(item => {
      const res = item.evalResult;
      if (actionFilter !== 'ALL' && res.action !== actionFilter) return false;
      if (selectedSector !== 'ALL' && item.sector !== selectedSector) return false;
      if (res.compositeScore < minScore) return false;
      if (onlyPassedHardFilters && !res.hardFilters.passedAll) return false;
      if (searchQuery) {
        const q = searchQuery.toUpperCase();
        if (!item.symbol?.toUpperCase().includes(q) && !item.name?.toUpperCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === 'score') {
        valA = a.evalResult.compositeScore;
        valB = b.evalResult.compositeScore;
      } else if (sortField === 'turnover') {
        valA = a.turnover;
        valB = b.turnover;
      } else if (sortField === 'pChange') {
        valA = a.pChange;
        valB = b.pChange;
      } else {
        return sortAsc ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [scoredStocks, actionFilter, selectedSector, minScore, onlyPassedHardFilters, searchQuery, sortField, sortAsc]);

  const buyCount = scoredStocks.filter(s => s.evalResult.action === 'BUY').length;
  const watchCount = scoredStocks.filter(s => s.evalResult.action === 'WATCH').length;
  const avoidCount = scoredStocks.filter(s => s.evalResult.action === 'AVOID').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
              <Filter size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Quantitative Stock Selection Screener
              </h1>
              <p className="text-xs text-slate-400">
                Multi-engine confluence screening across Broker Accumulation, Technical Breakouts, Fundamentals, & Hard Liquidity Gates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadMarketData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Market</span>
            </button>
          </div>
        </div>

        {/* Action Filter Badges */}
        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-800/80 pb-4 text-xs font-medium">
          <button
            onClick={() => setActionFilter('ALL')}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              actionFilter === 'ALL'
                ? 'bg-slate-700 text-white font-bold'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Candidates ({scoredStocks.length})
          </button>
          <button
            onClick={() => setActionFilter('BUY')}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              actionFilter === 'BUY'
                ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-900/30'
                : 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 hover:bg-emerald-900/30'
            }`}
          >
            BUY Qualified ({buyCount})
          </button>
          <button
            onClick={() => setActionFilter('WATCH')}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              actionFilter === 'WATCH'
                ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-900/30'
                : 'bg-amber-950/30 text-amber-400 border border-amber-900/40 hover:bg-amber-900/30'
            }`}
          >
            WATCH Radar ({watchCount})
          </button>
          <button
            onClick={() => setActionFilter('AVOID')}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              actionFilter === 'AVOID'
                ? 'bg-red-600 text-white font-bold shadow-md shadow-red-900/30'
                : 'bg-red-950/30 text-red-400 border border-red-900/40 hover:bg-red-900/30'
            }`}
          >
            AVOID / Filtered ({avoidCount})
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Sector Selector */}
          <div>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 px-3 text-slate-200 focus:border-purple-500 focus:outline-none"
            >
              {sectors.map(sec => (
                <option key={sec} value={sec}>{sec === 'ALL' ? 'All Sectors' : sec}</option>
              ))}
            </select>
          </div>

          {/* Min Score Slider */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5">
            <span className="text-slate-400 whitespace-nowrap">Min Score: <strong className="text-white font-mono">{minScore}</strong></span>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </div>

          {/* Hard Filter Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5">
            <span className="text-slate-300">Passed Hard Filters</span>
            <input
              type="checkbox"
              checked={onlyPassedHardFilters}
              onChange={(e) => setOnlyPassedHardFilters(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
            />
          </div>
        </div>
      </div>

      {error && (
        <InfoBanner type="danger">
          <div className="font-semibold">Screener Error</div>
          <div className="text-xs text-red-300">{error}</div>
        </InfoBanner>
      )}

      {/* Results Table */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40">
          <Spinner size="lg" />
          <span className="text-xs text-slate-400">Evaluating multi-engine selection scores across NEPSE universe…</span>
        </div>
      ) : filteredStocks.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
          <h3 className="text-sm font-bold text-white">No Stocks Meet Selection Criteria</h3>
          <p className="mt-1 text-xs text-slate-400">
            Try loosening the minimum score slider or clearing hard filter exclusions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
          <div className="border-b border-slate-800 p-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Matching Scrips ({filteredStocks.length})
            </span>
            <span className="text-[11px] text-slate-500">
              Click symbol to open Stock Score & Technical Dossier
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="p-3 cursor-pointer" onClick={() => { setSortField('symbol'); setSortAsc(!sortAsc); }}>
                    Symbol {sortField === 'symbol' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th className="p-3">Decision</th>
                  <th className="p-3 cursor-pointer" onClick={() => { setSortField('score'); setSortAsc(!sortAsc); }}>
                    Composite Score {sortField === 'score' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th className="p-3">LTP / Change</th>
                  <th className="p-3">Entry Zone</th>
                  <th className="p-3">Stop-Loss</th>
                  <th className="p-3">Targets (T1 / T2)</th>
                  <th className="p-3">Safe Sizing</th>
                  <th className="p-3">Hard Filter Gates</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredStocks.map((item, idx) => {
                  const res = item.evalResult;
                  const plan = res.executionPlan;
                  return (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="p-3">
                        <button
                          onClick={() => {
                            if (onSelectStock) onSelectStock(item);
                            if (onSelectSymbol) onSelectSymbol(item.symbol);
                          }}
                          className="text-left font-bold text-white hover:text-purple-400 transition-colors"
                        >
                          <div className="font-mono text-sm">{item.symbol}</div>
                          <div className="text-[10px] text-slate-500">{item.sector}</div>
                        </button>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold ${
                          res.action === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : res.action === 'WATCH'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-red-500/20 text-red-400 border border-red-500/40'
                        }`}>
                          {res.action === 'BUY' && <CheckCircle2 size={12} />}
                          {res.action === 'WATCH' && <AlertTriangle size={12} />}
                          {res.action === 'AVOID' && <XCircle size={12} />}
                          <span>{res.action}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-sm font-black text-white">{res.compositeScore} / 100</div>
                        <div className="text-[10px] text-slate-500">Confidence: {res.confidence}%</div>
                      </td>
                      <td className="p-3 font-mono">
                        <div className="font-bold">Rs. {item.ltp}</div>
                        <div className={`text-[11px] ${item.pChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.pChange >= 0 ? '+' : ''}{item.pChange.toFixed(2)}%
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {plan ? `Rs. ${plan.entryZone[0]} – ${plan.entryZone[1]}` : '—'}
                      </td>
                      <td className="p-3 font-mono text-red-400 font-semibold">
                        {plan ? `Rs. ${plan.stopLoss}` : '—'}
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-semibold">
                        {plan ? `Rs. ${plan.target1} / ${plan.target2}` : '—'}
                      </td>
                      <td className="p-3 font-mono text-slate-300 text-[11px]">
                        {plan ? `${plan.positionSizing.sharesKitta} kitta (Rs. ${(plan.positionSizing.capitalRequiredNpr / 1000).toFixed(0)}k)` : '—'}
                      </td>
                      <td className="p-3">
                        {res.hardFilters.passedAll ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/50 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-800">
                            <ShieldCheck size={11} /> Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-red-950/50 px-2 py-0.5 text-[10px] text-red-400 border border-red-800" title={res.rejectionReasons?.join('; ')}>
                            <XCircle size={11} /> {res.hardFilters.flags[0] || 'Failed'}
                          </span>
                        )}
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
export default StockSelectionScreener;
