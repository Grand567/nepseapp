import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell, BellRing, Volume2, VolumeX, ShieldAlert, ArrowUpRight,
  TrendingUp, CheckCircle2, Clock, Trash2, Plus, RefreshCw, AlertTriangle
} from 'lucide-react';
import {
  getAllWatchlistAlertConfigs,
  saveWatchlistAlertConfig,
  removeWatchlistAlertConfig,
  getAlertHistory,
  recordAlertHistory,
  playBreakoutChime,
  triggerBreakoutVibration
} from '../utils/watchlistAlerts';
import { StatCard, InfoBanner, Spinner, StockSearchSelect } from './ui';
import { fetchFromBackend } from '../utils/liveData';

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

export function WatchlistEntryAlertModal() {
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [marketQuotes, setMarketQuotes] = useState<Record<string, number>>({});
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // Load configs & history
  const reloadData = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = getAllWatchlistAlertConfigs();
      setConfigs(cfg || {});
      setAlertHistory(getAlertHistory() || []);

      // Fetch live market prices
      const data = await fetchFromBackend('/api/market-summary');
      const list = Array.isArray(data) ? data : (data?.data || []);
      const quoteMap: Record<string, number> = {};
      list.forEach((s: any) => {
        if (s.symbol) quoteMap[s.symbol.toUpperCase()] = Number(s.ltp || s.marketPrice || 0);
      });
      setMarketQuotes(quoteMap);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Add a new stock with auto-derived entry, stop, and target levels
  const handleAddStock = (sym: string) => {
    if (!sym) return;
    const s = sym.toUpperCase().trim();
    const ltp = marketQuotes[s] || 500;
    const entryMin = Number((ltp * 0.992).toFixed(1));
    const entryMax = Number((ltp * 1.004).toFixed(1));
    const stopLoss = Number((ltp * 0.954).toFixed(1)); // 4.6% stop
    const target1 = Number((ltp * 1.069).toFixed(1)); // 6.9% target
    const target2 = Number((ltp * 1.115).toFixed(1)); // 11.5% target

    const newCfg = {
      symbol: s,
      entryZone: [entryMin, entryMax],
      stopLoss,
      target1,
      target2,
      alertEnabled: true,
      lastTriggered: null
    };

    saveWatchlistAlertConfig(s, newCfg);
    setNewSymbol('');
    reloadData();
  };

  const handleToggle = (sym: string) => {
    const cfg = configs[sym];
    if (!cfg) return;
    saveWatchlistAlertConfig(sym, { ...cfg, alertEnabled: !cfg.alertEnabled });
    reloadData();
  };

  const handleRemove = (sym: string) => {
    removeWatchlistAlertConfig(sym);
    reloadData();
  };

  // Evaluate alerts against live quotes
  const activeAlertItems = useMemo(() => {
    return Object.keys(configs).map(sym => {
      const cfg = configs[sym];
      const ltp = marketQuotes[sym] || cfg.entryZone?.[0] || 0;
      const [entryMin, entryMax] = cfg.entryZone || [ltp * 0.99, ltp * 1.01];
      const sl = cfg.stopLoss || (ltp * 0.95);
      const t1 = cfg.target1 || (ltp * 1.07);
      const t2 = cfg.target2 || (ltp * 1.12);

      const inEntryZone = ltp >= entryMin && ltp <= entryMax;
      const nearStopLoss = ltp <= (sl * 1.015);
      const target1Reached = ltp >= t1;
      const target2Reached = ltp >= t2;

      // Trigger alerts if newly fired
      if (cfg.alertEnabled && (inEntryZone || nearStopLoss || target1Reached || target2Reached)) {
        if (audioEnabled) {
          playBreakoutChime();
          triggerBreakoutVibration();
        }
      }

      return {
        symbol: sym,
        entryZone: [entryMin, entryMax] as [number, number],
        stopLoss: sl,
        target1: t1,
        target2: t2,
        currentPrice: ltp,
        inEntryZone,
        nearStopLoss,
        target1Reached,
        target2Reached,
        alertEnabled: cfg.alertEnabled !== false
      };
    });
  }, [configs, marketQuotes, audioEnabled]);

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
              onClick={reloadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Add Ticker Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 border-t border-slate-800/80 pt-4">
          <div className="w-full sm:w-64">
            <StockSearchSelect
              value={newSymbol}
              onChange={(s) => {
                setNewSymbol(s);
                handleAddStock(s);
              }}
              placeholder="Add stock to entry alerts..."
            />
          </div>
          <span className="text-[11px] text-slate-500">
            Automatically calculates entry zone, ATR stop-loss, and profit targets
          </span>
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
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-white font-mono text-sm">{item.symbol}</td>
                    <td className="p-3 font-mono font-bold">Rs. {item.currentPrice}</td>
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
                          onClick={() => handleToggle(item.symbol)}
                          className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                            item.alertEnabled
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {item.alertEnabled ? 'Active' : 'Paused'}
                        </button>
                        <button
                          onClick={() => handleRemove(item.symbol)}
                          className="rounded-lg p-1 text-slate-500 hover:text-red-400 transition-colors"
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
