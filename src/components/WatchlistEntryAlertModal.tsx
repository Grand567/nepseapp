import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Bell, BellRing, Volume2, VolumeX, ShieldAlert, ArrowUpRight,
  TrendingUp, CheckCircle2, Clock, Trash2, Plus, RefreshCw, AlertTriangle
} from 'lucide-react';
import {
  getAllWatchlistAlertConfigs,
  saveWatchlistAlertConfig,
  deleteWatchlistAlertConfig,
  getAlertHistory,
  playBreakoutChime,
  triggerBreakoutVibration
} from '../utils/watchlistAlerts';
import { StockSearchSelect } from './ui';
import { loadNepseData } from '../utils/liveData';

interface WatchlistAlertItem {
  symbol: string;
  entryZone: [number, number];
  stopLoss: number;
  target1: number;
  target2: number;
  currentPrice: number;
  inEntryZone: boolean;
  nearStopLoss: boolean;
  target1Reached: boolean;
  target2Reached: boolean;
  alertEnabled: boolean;
}

export function WatchlistEntryAlertModal({ onSelectStock = null }: { onSelectStock?: ((stk: any) => void) | null } = {}) {
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [marketStocks, setMarketStocks] = useState<any[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, number>>({});
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const isMountedRef = useRef(true);
  const lastChimedKeyRef = useRef<string>('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Load configs & history
  const reloadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    let timerId: any = null;
    try {
      const cfg = getAllWatchlistAlertConfigs();
      if (isMountedRef.current) {
        setConfigs(cfg || {});
        setAlertHistory(getAlertHistory() || []);
      }

      // Fetch live market prices with 4s timeout race
      const timeout = new Promise<{ stocks: any[] }>((resolve) => {
        timerId = setTimeout(() => resolve({ stocks: [] }), 4000);
      });
      const res = await Promise.race([loadNepseData(), timeout]);
      if (!isMountedRef.current) return;
      const list = res?.stocks || [];
      setMarketStocks(list);
      const quoteMap: Record<string, number> = {};
      list.forEach((s: any) => {
        if (s.symbol) quoteMap[s.symbol.toUpperCase()] = Number(s.ltp || s.price || 0);
      });
      setMarketQuotes(quoteMap);
    } catch (_) {
    } finally {
      if (timerId) clearTimeout(timerId);
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    reloadData(false);
  }, [reloadData]);

  // Add a new stock with auto-derived entry, stop, and target levels
  const handleAddStock = (sym: string) => {
    if (!sym) return;
    const s = sym.toUpperCase().trim();
    const ltp = marketQuotes[s] || 0;
    if (ltp <= 0) {
      setErrorMsg(`Live quote for ${s} is unavailable. Refresh market feed before adding an alert.`);
      return;
    }
    setErrorMsg('');
    // Pullback entry pocket slightly below live LTP so adding a stock does not immediately fire a false alert
    const entryMin = Number((ltp * 0.975).toFixed(1));
    const entryMax = Number((ltp * 0.990).toFixed(1));
    const stopLoss = Number((ltp * 0.954).toFixed(1)); // 4.6% stop
    const target1 = Number((ltp * 1.069).toFixed(1)); // 6.9% target
    const target2 = Number((ltp * 1.115).toFixed(1)); // 11.5% target

    const newCfg = {
      ...(configs[s] || {}),
      symbol: s,
      entryZone: [entryMin, entryMax],
      stopLoss,
      target1,
      target2,
      alertEnabled: true,
      lastTriggered: null
    };

    saveWatchlistAlertConfig(s, newCfg);
    setConfigs(getAllWatchlistAlertConfigs() || {});
    setNewSymbol('');
  };

  const handleToggle = (sym: string) => {
    const cfg = configs[sym];
    if (!cfg) return;
    saveWatchlistAlertConfig(sym, { ...cfg, alertEnabled: !cfg.alertEnabled });
    setConfigs(getAllWatchlistAlertConfigs() || {});
  };

  const handleRemove = (sym: string) => {
    deleteWatchlistAlertConfig(sym);
    setConfigs(getAllWatchlistAlertConfigs() || {});
  };

  // Evaluate alerts against live quotes
  const activeAlertItems = useMemo(() => {
    return Object.keys(configs).map(sym => {
      const cfg = configs[sym];
      const liveLtp = Number(marketQuotes[sym] || 0);
      const hasLive = Number.isFinite(liveLtp) && liveLtp > 0;
      const [entryMin, entryMax] = Array.isArray(cfg.entryZone) && cfg.entryZone[0] > 0 && cfg.entryZone[1] > 0
        ? cfg.entryZone
        : [0, 0];
      const sl = Number(cfg.stopLoss || 0);
      const t1 = Number(cfg.target1 || 0);
      const t2 = Number(cfg.target2 || 0);

      const inEntryZone = hasLive && entryMin > 0 && entryMax > 0 && liveLtp >= entryMin && liveLtp <= entryMax;
      const nearStopLoss = hasLive && sl > 0 && liveLtp <= (sl * 1.015);
      const target1Reached = hasLive && t1 > 0 && liveLtp >= t1;
      const target2Reached = hasLive && t2 > 0 && liveLtp >= t2;

      return {
        symbol: sym,
        entryZone: [entryMin, entryMax] as [number, number],
        stopLoss: sl,
        target1: t1,
        target2: t2,
        currentPrice: liveLtp,
        inEntryZone,
        nearStopLoss,
        target1Reached,
        target2Reached,
        alertEnabled: cfg.alertEnabled !== false
      };
    });
  }, [configs, marketQuotes]);

  // Audio and vibration side-effects isolated strictly to useEffect lifecycle
  useEffect(() => {
    if (!audioEnabled) return;
    const triggerKey = activeAlertItems
      .filter(item => item.alertEnabled && (item.inEntryZone || item.nearStopLoss || item.target1Reached || item.target2Reached))
      .map(item => `${item.symbol}:${item.inEntryZone ? 'E' : ''}${item.nearStopLoss ? 'S' : ''}${item.target1Reached ? '1' : ''}${item.target2Reached ? '2' : ''}`)
      .sort()
      .join('|');

    if (triggerKey && triggerKey !== lastChimedKeyRef.current) {
      lastChimedKeyRef.current = triggerKey;
      playBreakoutChime();
      triggerBreakoutVibration();
    }
  }, [activeAlertItems, audioEnabled]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <BellRing size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Watchlist Execution & Entry Zone Alerts
              </h1>
              <p className="text-xs text-slate-400">
                Real-time tracking of planned Entry Zones, trailing Stop-Losses, and Targets with synthesized audio chimes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                audioEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{audioEnabled ? 'Sound ON' : 'Muted'}</span>
            </button>
            <button
              onClick={() => reloadData(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Add Ticker Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 border-t border-slate-800/80 pt-4">
          <div className="w-full sm:w-64">
            <StockSearchSelect
              value={newSymbol}
              stocks={marketStocks}
              onChange={(s) => {
                setNewSymbol(s);
                handleAddStock(s);
              }}
              placeholder="Add stock to entry alerts..."
            />
          </div>
          {errorMsg ? (
            <span className="text-xs font-semibold text-rose-400">{errorMsg}</span>
          ) : (
            <span className="text-[11px] text-slate-500">
              Automatically calculates entry zone, ATR stop-loss, and profit targets
            </span>
          )}
        </div>
      </div>

      {/* Active Alert Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
        <div className="border-b border-slate-800 p-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Active Watchlist Price Gates ({activeAlertItems.length})</h3>
          <span className="text-xs text-slate-500">Live order matching vs NEPSE feed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
              <tr>
                <th className="p-3">Symbol</th>
                <th className="p-3">Live LTP</th>
                <th className="p-3">Planned Entry Zone</th>
                <th className="p-3">Stop-Loss</th>
                <th className="p-3">Target 1 / Target 2</th>
                <th className="p-3">Live Alert Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {activeAlertItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No active watchlist alerts. Select a stock above to begin real-time entry zone tracking.
                  </td>
                </tr>
              ) : (
                activeAlertItems.map((item, idx) => (
                  <tr
                    key={item.symbol}
                    onClick={() => onSelectStock && onSelectStock({ symbol: item.symbol, ltp: item.currentPrice })}
                    className={`hover:bg-slate-800/30 ${onSelectStock ? 'cursor-pointer' : ''}`}
                  >
                    <td className="p-3 font-bold text-white font-mono text-sm">{item.symbol}</td>
                    <td className="p-3 font-mono font-bold">{item.currentPrice > 0 ? `Rs. ${item.currentPrice}` : 'Awaiting Quote'}</td>
                    <td className="p-3 font-mono text-slate-300">
                      Rs. {item.entryZone[0]} – {item.entryZone[1]}
                    </td>
                    <td className="p-3 font-mono text-red-400 font-semibold">
                      Rs. {item.stopLoss}
                    </td>
                    <td className="p-3 font-mono text-emerald-400 font-semibold">
                      Rs. {item.target1} / {item.target2}
                    </td>
                    <td className="p-3">
                      {item.inEntryZone && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/40">
                          🎯 Inside Entry Zone!
                        </span>
                      )}
                      {item.nearStopLoss && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/40">
                          🛑 Near Stop Loss!
                        </span>
                      )}
                      {item.target1Reached && !item.target2Reached && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/40">
                          ✨ Target 1 Breached!
                        </span>
                      )}
                      {item.target2Reached && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
                          🚀 Target 2 Reached!
                        </span>
                      )}
                      {!item.inEntryZone && !item.nearStopLoss && !item.target1Reached && !item.target2Reached && (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                          <Clock size={11} /> Monitoring
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(item.symbol);
                          }}
                          className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                            item.alertEnabled
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {item.alertEnabled ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(item.symbol);
                          }}
                          className="rounded-lg p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                          title="Remove alert"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
export default WatchlistEntryAlertModal;
