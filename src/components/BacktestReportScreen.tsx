import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, AlertTriangle, ShieldAlert,
  Play, RefreshCw, FileText, CheckCircle2, XCircle, ArrowUpRight,
  Layers, DollarSign, Percent, Scale, Clock, Lock
} from 'lucide-react';
import { StatCard, InfoBanner, Spinner, StockSearchSelect } from './ui';
import { getProxyBase } from '../utils/liveData';

interface BacktestMetrics {
  symbol: string;
  sector: string;
  totalSessions: number;
  initialCapital: number;
  endingEquity: number;
  netProfitNpr: number;
  totalReturnPct: number;
  totalTrades: number;
  winRatePct: number;
  avgWinNpr: number;
  avgLossNpr: number;
  avgWinPct: number;
  avgLossPct: number;
  winLossRatio: number;
  profitFactor: number;
  expectancyNpr: number;
  maxDrawdownPct: number;
  maxDrawdownDurationSessions: number;
  sharpeRatio: number;
  sortinoRatio: number;
  sampleSizeWarning: string | null;
  isSampleUnderpowered: boolean;
  regimeBreakdown: Record<string, { tradesCount: number; winRatePct: number; netPnlNpr: number }>;
  totalCommissionPaid: number;
  totalCgtPaid: number;
  survivorshipBiasNote: string;
  closedTrades: Array<{
    symbol: string;
    entryDate: string;
    exitDate: string;
    shares: number;
    entryPrice: number;
    exitPrice: number;
    realizedPnl: number;
    returnPct: number;
    exitReason: string;
    holdSessions: number;
    regime: string;
    cgtPaid: number;
    commissionPaid: number;
  }>;
}

export function BacktestReportScreen() {
  const [symbol, setSymbol] = useState<string>('NABIL');
  const [capital, setCapital] = useState<number>(1000000);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'markdown'>('overview');

  const runBacktest = useCallback(async (targetSymbol = symbol) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getProxyBase()}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: targetSymbol, initialCapital: capital, days: 365 })
      });
      const json = await res.json();
      if (json.success && json.data) {
        setMetrics(json.data);
        setMarkdown(json.markdown || '');
      } else {
        setError(json.error || 'Failed to execute backtest simulation.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error running backtest.');
    } finally {
      setLoading(false);
    }
  }, [symbol, capital]);

  // Load latest report or run initial backtest on mount
  useEffect(() => {
    fetch(`${getProxyBase()}/api/backtest/latest`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.exists && json.markdown) {
          setMarkdown(json.markdown);
        } else {
          runBacktest('NABIL');
        }
      })
      .catch(() => runBacktest('NABIL'));
  }, [runBacktest]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <BarChart3 size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Quantitative Backtest & Walk-Forward Engine
                </h1>
                <p className="text-xs text-slate-400">
                  Simulates Drabyashree Selection Engine with full NEPSE frictions (T+2, Broker commission, SEBON, CGT, slippage)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <StockSearchSelect
                value={symbol}
                onChange={(s) => {
                  setSymbol(s);
                  runBacktest(s);
                }}
                placeholder="Select Scrip..."
              />
            </div>
            <button
              onClick={() => runBacktest(symbol)}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Spinner size="sm" /> : <Play size={14} />}
              <span>{loading ? 'Simulating…' : 'Run Backtest'}</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex border-b border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'overview'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Performance Overview
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'trades'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Trade Journal ({metrics?.closedTrades?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('markdown')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'markdown'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Report File (backtest/report.md)
          </button>
        </div>
      </div>

      {error && (
        <InfoBanner type="danger">
          <div className="font-semibold">Backtest Execution Error</div>
          <div className="text-xs text-red-300">{error}</div>
        </InfoBanner>
      )}

      {/* Statistical Sample Size Warning Banner */}
      {metrics?.sampleSizeWarning && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-300 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={18} />
          <div className="text-xs leading-relaxed">
            <span className="font-bold">Statistical Sample Size Caution: </span>
            {metrics.sampleSizeWarning}
          </div>
        </div>
      )}

      {loading && !metrics ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40">
          <Spinner size="lg" />
          <span className="text-xs text-slate-400">Executing walk-forward historical simulation…</span>
        </div>
      ) : metrics && activeTab === 'overview' ? (
        <>
          {/* Primary Stat Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Win Rate"
              value={`${metrics.winRatePct}%`}
              color={metrics.winRatePct >= 55 ? '#10b981' : '#f59e0b'}
              subtitle={`${metrics.closedTrades.filter(t => t.realizedPnl > 0).length}W / ${metrics.closedTrades.filter(t => t.realizedPnl <= 0).length}L`}
            />
            <StatCard
              label="Profit Factor"
              value={`${metrics.profitFactor}x`}
              color={metrics.profitFactor >= 1.75 ? '#10b981' : '#f59e0b'}
              subtitle="Gains / Losses"
            />
            <StatCard
              label="Expectancy"
              value={`Rs. ${metrics.expectancyNpr.toLocaleString()}`}
              color={metrics.expectancyNpr > 0 ? '#10b981' : '#ef4444'}
              subtitle="Per Trade Avg"
            />
            <StatCard
              label="Max Drawdown"
              value={`-${metrics.maxDrawdownPct}%`}
              color={metrics.maxDrawdownPct <= 10 ? '#10b981' : '#ef4444'}
              subtitle={`${metrics.maxDrawdownDurationSessions} sessions`}
            />
            <StatCard
              label="Sharpe Ratio"
              value={metrics.sharpeRatio}
              color={metrics.sharpeRatio >= 1.2 ? '#10b981' : '#94a3b8'}
              subtitle="Annualized Rf 3.5%"
            />
            <StatCard
              label="Total Trades"
              value={metrics.totalTrades}
              color={metrics.totalTrades >= 30 ? '#10b981' : '#f59e0b'}
              subtitle={metrics.totalTrades >= 30 ? 'Statistically Valid' : 'Low Sample (N<30)'}
            />
          </div>

          {/* Equity & Friction Details */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Capital Growth Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Net Portfolio Performance</span>
                <DollarSign size={16} className="text-slate-500" />
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-black ${metrics.netProfitNpr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {metrics.netProfitNpr >= 0 ? '+' : ''}Rs. {metrics.netProfitNpr.toLocaleString()}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className={`font-semibold ${metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct}%
                  </span>
                  <span className="text-slate-500">
                    from Rs. {metrics.initialCapital.toLocaleString()} initial equity
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
                <div className="flex justify-between py-1">
                  <span>Average Winning Trade</span>
                  <span className="font-semibold text-emerald-400">+{metrics.avgWinPct}% (Rs. {metrics.avgWinNpr.toLocaleString()})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Average Losing Trade</span>
                  <span className="font-semibold text-red-400">{metrics.avgLossPct}% (Rs. {metrics.avgLossNpr.toLocaleString()})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Win / Loss Payoff Ratio</span>
                  <span className="font-semibold text-slate-200">{metrics.winLossRatio}x</span>
                </div>
              </div>
            </div>

            {/* NEPSE Microstructure Frictions Deducted */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deducted NEPSE Frictions</span>
                <Scale size={16} className="text-slate-500" />
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">SEBON 5-Tier Broker Commission</span>
                  <span className="font-mono text-slate-200">Rs. {metrics.totalCommissionPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">SEBON Regulatory Fee (0.015%)</span>
                  <span className="font-mono text-slate-200">Deducted per leg</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">Demat DP Charge (Rs. 25/sell)</span>
                  <span className="font-mono text-slate-200">Rs. {metrics.totalTrades * 25}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">Capital Gains Tax (7.5% Short-Term)</span>
                  <span className="font-mono text-slate-200">Rs. {metrics.totalCgtPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">T+2 Settlement Demat Lock</span>
                  <span className="font-mono text-emerald-400">Enforced (Min 2 Days)</span>
                </div>
              </div>
            </div>

            {/* Market Regime Attribution */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Market Regime Attribution</span>
                <Layers size={16} className="text-slate-500" />
              </div>
              <div className="mt-3 space-y-2 text-xs">
                {['BULL', 'NEUTRAL', 'BEAR'].map(reg => {
                  const data = metrics.regimeBreakdown[reg] || { tradesCount: 0, winRatePct: 0, netPnlNpr: 0 };
                  return (
                    <div key={reg} className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-2">
                      <div className="flex justify-between font-semibold">
                        <span className={reg === 'BULL' ? 'text-emerald-400' : reg === 'BEAR' ? 'text-red-400' : 'text-slate-300'}>
                          {reg} Regime ({data.tradesCount} trades)
                        </span>
                        <span className="text-slate-300">{data.winRatePct}% Win</span>
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                        <span>Net Realized PnL</span>
                        <span className={`font-mono ${data.netPnlNpr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          Rs. {data.netPnlNpr.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : activeTab === 'trades' && metrics ? (
        /* Trade Journal Table */
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
          <div className="border-b border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white">Closed Trades Execution Journal</h3>
            <p className="text-xs text-slate-400">Historical simulations reflecting real NEPSE settlement and execution</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="p-3">Entry Date</th>
                  <th className="p-3">Exit Date</th>
                  <th className="p-3">Shares</th>
                  <th className="p-3">Entry Price</th>
                  <th className="p-3">Exit Price</th>
                  <th className="p-3">Return %</th>
                  <th className="p-3">Realized PnL</th>
                  <th className="p-3">Hold Days</th>
                  <th className="p-3">Exit Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {metrics.closedTrades.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="p-3 font-mono">{t.entryDate}</td>
                    <td className="p-3 font-mono">{t.exitDate}</td>
                    <td className="p-3 font-mono">{t.shares}</td>
                    <td className="p-3 font-mono">Rs. {t.entryPrice}</td>
                    <td className="p-3 font-mono">Rs. {t.exitPrice}</td>
                    <td className={`p-3 font-mono font-bold ${t.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.returnPct >= 0 ? '+' : ''}{t.returnPct}%
                    </td>
                    <td className={`p-3 font-mono font-bold ${t.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      Rs. {t.realizedPnl.toLocaleString()}
                    </td>
                    <td className="p-3 font-mono">{t.holdSessions}d</td>
                    <td className="p-3 text-slate-300">{t.exitReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'markdown' ? (
        /* Markdown Raw File Viewer */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <FileText size={15} className="text-orange-400" />
              <span>backtest/report.md</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(markdown)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            >
              Copy Markdown
            </button>
          </div>
          <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300">
            {markdown || 'No report generated yet.'}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
export default BacktestReportScreen;
