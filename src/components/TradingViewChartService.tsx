import React, { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { fetchPriceHistory, fetchAllSecurities, loadNepseData } from '../utils/liveData';
import { generateEntryExitPlan } from '../utils/setupAnalyzer';
import { StockCandlestickChart, type CandleData, type ChartLevels } from './charts/StockCandlestickChart';
import { StockSearchSelect, StatCard, Spinner } from './ui';

export function TradingViewChartService({ initialSymbol = 'NABIL' }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [levels, setLevels] = useState<ChartLevels | undefined>(undefined);
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    fetchAllSecurities().then(r => {
      if (r?.data) {
        setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());
      }
    });
  }, []);

  const loadChartData = async (sym: string) => {
    setLoading(true);
    try {
      const cleanSym = (sym === 'NEPSE Index' || sym === 'nepse' || !sym) ? 'NEPSE' : sym.replace(/ Index$/i, '').trim().toUpperCase();
      const { stocks } = await loadNepseData();
      const info = stocks.find(s => (s.symbol || '').toUpperCase() === cleanSym) || {
        symbol: cleanSym,
        ltp: 500,
        pChange: 0,
        volume: 0,
        high52w: 0,
        low52w: 0,
        rsi: 50,
      };
      setStockInfo(info);

      let rawHistory: any[] = [];
      try {
        const histRes = await fetchPriceHistory(cleanSym, 500);
        if (Array.isArray(histRes)) {
          rawHistory = histRes;
        } else if (Array.isArray(histRes?.data)) {
          rawHistory = histRes.data;
        }
      } catch (err) {
        console.warn('[TradingViewChartService] Error fetching history:', err);
      }

      const ltp = Number(info.ltp || 500);
      let parsedCandles: CandleData[] = [];

      if (rawHistory.length > 0) {
        const sorted = rawHistory.slice().sort((a: any, b: any) =>
          new Date(a.date || a.businessDate).getTime() - new Date(b.date || b.businessDate).getTime()
        );

        parsedCandles = sorted.map((h: any) => ({
          date: String(h.date || h.businessDate || '').slice(0, 10),
          open: Number(h.open || h.openPrice || h.close || h.closePrice || ltp),
          high: Number(h.high || h.highPrice || Math.max(Number(h.open || ltp), Number(h.close || ltp))),
          low: Number(h.low || h.lowPrice || Math.min(Number(h.open || ltp), Number(h.close || ltp))),
          close: Number(h.close || h.closePrice || h.ltp || ltp),
          volume: Number(h.volume || h.totalTradedQuantity || 0),
        })).filter(c => c.date && c.close > 0);
      }

      setCandles(parsedCandles);

      // Generate action plan & key S/R levels
      try {
        const p = generateEntryExitPlan(info, rawHistory, []);
        if (p) {
          setPlan(p);
          setLevels({
            entryZone: p.levels?.entryZone || (p.buyPrice ? { low: p.buyPrice, high: p.buyPrice * 1.02, label: 'Entry' } : undefined),
            stopLoss: p.levels?.stopLoss || (p.stopLoss ? { price: p.stopLoss, pct: p.stopLossPct || 5, label: 'Stop Loss' } : undefined),
            target1: p.levels?.target1 || (p.target1 ? { price: p.target1, pct: p.target1Pct || 10, label: 'Target 1' } : undefined),
            target2: p.levels?.target2 || (p.target2 ? { price: p.target2, pct: p.target2Pct || 20, label: 'Target 2' } : undefined),
            support: p.supportResistance?.support,
            resistance: p.supportResistance?.resistance,
          });
        }
      } catch (planErr) {
        console.warn('[TradingViewChartService] Error generating plan:', planErr);
      }
    } catch (err) {
      console.warn('[TradingViewChartService] General error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChartData(symbol);
  }, [symbol]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChartData(symbol);
    setRefreshing(false);
  };

  const cleanSymbol = (symbol || 'NEPSE').replace(/ Index$/i, '').trim().toUpperCase();

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/80 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-800 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="w-48 sm:w-60">
            <StockSearchSelect
              value={symbol}
              onChange={(s) => setSymbol(s)}
              placeholder="Search scrip (e.g. NABIL, NEPSE)…"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh chart data"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* NepseAlpha Web Terminal Launcher */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.open(`https://nepsealpha.com/trading/chart?symbol=${encodeURIComponent(cleanSymbol)}`, '_blank', 'noopener,noreferrer');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition shadow-sm"
            title="Launch full TradingView terminal for this symbol on NepseAlpha"
          >
            <ExternalLink size={13} />
            <span>Launch NepseAlpha Web Terminal ↗</span>
          </button>
        </div>
      </div>

      {/* Main Lightweight Charts Station */}
      {loading ? (
        <Spinner text={`Loading interactive TradingView engine for ${symbol}…`} />
      ) : (
        <StockCandlestickChart
          candles={candles}
          levels={levels}
          symbol={cleanSymbol}
          ltp={stockInfo?.ltp}
          stock={stockInfo}
          initialTimeframe="6M"
        />
      )}

      {/* Fundamentals & Key Levels Card */}
      {stockInfo && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard
            label="Current LTP"
            value={`Rs. ${stockInfo.ltp || stockInfo.closePrice || '—'}`}
            big
            color="#3b82f6"
            subtitle={stockInfo.pChange ? `${stockInfo.pChange >= 0 ? '+' : ''}${stockInfo.pChange}% Today` : undefined}
          />
          <StatCard
            label="Target 1 (R:R)"
            value={(plan?.levels?.target1?.price ?? plan?.target1) ? `Rs. ${plan?.levels?.target1?.price ?? plan?.target1}` : (stockInfo.high52w ? `Rs. ${stockInfo.high52w}` : '—')}
            subtitle={(plan?.levels?.target1?.pct ?? plan?.target1Pct) ? `+${plan?.levels?.target1?.pct ?? plan?.target1Pct}% Expected` : 'Major Resistance'}
            color="#10b981"
          />
          <StatCard
            label="Stop-Loss Level"
            value={(plan?.levels?.stopLoss?.price ?? plan?.stopLoss) ? `Rs. ${plan?.levels?.stopLoss?.price ?? plan?.stopLoss}` : (stockInfo.low52w ? `Rs. ${stockInfo.low52w}` : '—')}
            subtitle={(plan?.levels?.stopLoss?.pct ?? plan?.stopLossPct) ? `-${Math.abs(Number(plan?.levels?.stopLoss?.pct ?? plan?.stopLossPct)).toFixed(1)}% Risk Cut` : 'Major Support'}
            color="#f43f5e"
          />
          <StatCard
            label="Setup Quality"
            value={plan?.verdict || plan?.overallGrade || (stockInfo.rsi ? `RSI: ${stockInfo.rsi}` : 'Neutral')}
            subtitle={(plan?.setupScore != null || plan?.score != null) ? `Setup Score: ${plan?.setupScore ?? plan?.score}/100` : (stockInfo.rsi ? 'Technical Stance' : 'Neutral')}
            color="#8b5cf6"
          />
        </div>
      )}
    </div>
  );
}
