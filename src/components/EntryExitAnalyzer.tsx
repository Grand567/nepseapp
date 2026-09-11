// Entry / Exit Analyzer — Stage 2 Professional Technical Dashboard & Decision Interface
// ──────────────────────────────────────────────────────────────────────────────────────────
// Transforms the Entry/Exit Analyzer into a complete technical setup investigation workstation:
//   - Header with live LTP, change %, timestamp, and security selector
//   - Setup Score (0-100) & Evidence Confidence (HIGH / MEDIUM / LOW)
//   - Interactive Lightweight Candlestick Chart with Volume, EMA, Bollinger & S/R level overlays
//   - Risk-Managed Entry Zone, Stop-Loss, and Multi-Horizon Targets
//   - 5-Dimensional Technical Evidence Dashboard (Trend, Momentum, Volume, Volatility, Price Action)
//   - Support & Resistance Confluence & Breakout Analysis
//   - Historical Analog Evidence & Full Strategy Backtesting Track Record
//   - Signal Agreement & Balanced Bullish vs Bearish Evidence Matrix
//   - "What Must Happen Next": Confirmations to watch vs Invalidation triggers
//   - Data Quality Audit & Corporate Action Normalization

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Crosshair,
  ShieldAlert,
  History,
  Info,
  AlertTriangle,
  Coins,
  RefreshCw,
  Clock,
  Sparkles,
  ExternalLink,
  Zap,
} from 'lucide-react';

import {
  fetchPriceHistory,
  fetchAllSecurities,
  fetchDividendHistory,
  fetchTodayPrice,
} from '../utils/liveData';
import { generateEntryExitPlan } from '../utils/setupAnalyzer';
import { InfoBanner, NoData, StockSearchSelect, Skeleton } from './ui';

// Modular Sub-components
import { StockCandlestickChart } from './charts/StockCandlestickChart';
import { SetupScoreCard } from './analyzer/SetupScoreCard';
import { EntryRiskCard } from './analyzer/EntryRiskCard';
import { TechnicalDashboard } from './analyzer/TechnicalDashboard';
import { SupportResistancePanel } from './analyzer/SupportResistancePanel';
import { BreakoutPanel } from './analyzer/BreakoutPanel';
import { HistoricalAnalogPanel } from './analyzer/HistoricalAnalogPanel';
import { StrategyTrackRecord } from './analyzer/StrategyTrackRecord';
import { SignalAgreement } from './analyzer/SignalAgreement';
import { EvidencePanel } from './analyzer/EvidencePanel';
import { WhatNextPanel } from './analyzer/WhatNextPanel';
import { DataQualityPanel } from './analyzer/DataQualityPanel';

interface EntryExitAnalyzerProps {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (s: any) => void;
  initialSymbol?: string;
}

export function EntryExitAnalyzer({
  stocks = [],
  indices,
  onSelectStock,
  initialSymbol,
}: EntryExitAnalyzerProps) {
  const [symbol, setSymbol] = useState(initialSymbol || '');
  const [activeSubTab, setActiveSubTab] = useState<'setup' | 'chart' | 'signals' | 'history' | 'corporate'>('setup');
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [plan, setPlan] = useState<any>(null);
  const [rawCandles, setRawCandles] = useState<any[]>([]);
  const [dividendData, setDividendData] = useState<any[]>([]);
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [analyzedTime, setAnalyzedTime] = useState<string>('');
  const [error, setError] = useState('');

  // Prepopulate symbol list for instant autocomplete
  useEffect(() => {
    if (stocks && stocks.length > 0) {
      setAllSymbols(stocks.map((s: any) => s.symbol).filter(Boolean).sort());
    } else {
      fetchAllSecurities().then((r) => {
        if (r?.data) setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());
      });
    }
  }, [stocks]);

  const analyze = useCallback(
    async (targetSymbol: string) => {
      if (!targetSymbol) return;
      const sym = targetSymbol.toUpperCase().trim();
      setSymbol(sym);
      setLoading(true);
      setError('');
      setPlan(null);
      setRawCandles([]);
      setDividendData([]);
      setLoadingStep('Connecting to NEPSE live exchange feed…');

      try {
        let stock = (stocks || []).find((s: any) => s.symbol === sym);

        setLoadingStep('Fetching 500-session OHLCV price history & corporate filings…');
        const [history, divRes, liveRes] = await Promise.all([
          fetchPriceHistory(sym, 500),
          fetchDividendHistory(sym).catch(() => null),
          !stock || !stock.ltp ? fetchTodayPrice(sym).catch(() => null) : Promise.resolve(null),
        ]);

        if (!stock || !stock.ltp) {
          if (liveRes?.data?.ltp) {
            stock = { ...(stock || {}), ...liveRes.data };
          } else {
            stock = stock || { symbol: sym };
          }
        }
        setStockInfo(stock);

        if (!history || history.length === 0) {
          throw new Error(`No historical price data found for ${sym}.`);
        }

        const candleList = Array.isArray(history) ? history : history.data || [];
        setRawCandles(candleList);

        if (divRes?.dividends && Array.isArray(divRes.dividends)) {
          setDividendData(divRes.dividends);
        }

        setLoadingStep('Computing multi-factor technicals, price action & historical analogs…');
        const result = generateEntryExitPlan(stock, candleList, divRes?.dividends || [], { indices, maxHoldDays: 20 });

        if (!result.supported) {
          throw new Error(result.reason || 'Insufficient historical data to analyze this stock.');
        }

        setPlan(result);
        setAnalyzedTime(
          new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        );
      } catch (e: any) {
        setError(e.message || 'Failed to analyze this stock.');
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    },
    [stocks, indices]
  );

  const handleStockChange = useCallback(
    (newSym: string) => {
      if (!newSym) {
        setSymbol('');
        setPlan(null);
        setRawCandles([]);
        setDividendData([]);
        setStockInfo(null);
        setError('');
        return;
      }
      analyze(newSym);
    },
    [analyze]
  );

  const lastAnalyzedSymbolRef = React.useRef<string>('');

  useEffect(() => {
    if (initialSymbol && lastAnalyzedSymbolRef.current !== initialSymbol) {
      lastAnalyzedSymbolRef.current = initialSymbol;
      setSymbol(initialSymbol);
      analyze(initialSymbol);
    }
  }, [initialSymbol, analyze]);

  // Derive active change metrics
  const livePrice = stockInfo?.ltp || stockInfo?.closePrice || plan?.ltp || plan?.levels?.entryZone?.low || 0;
  const pChange = Number(stockInfo?.pChange || stockInfo?.percentageChange || 0);
  const changeVal = Number(stockInfo?.change || 0);
  const companyName = stockInfo?.name || stockInfo?.companyName || symbol;

  return (
    <div className="space-y-5 font-sans text-slate-100">
      {/* ── Top Header Banner ── */}
      <InfoBanner type="info">
        <strong>Entry / Exit Analyzer Workstation:</strong> Quantitative decision engine combining
        moving-average structures, momentum velocity, volume confirmation, S/R clustering, and
        historical analog backtesting (net of SEBON brokerage & 7.5% CGT).
      </InfoBanner>

      {/* ── SECTION A: Stock Header & Search Bar ── */}
      <div style={{
        borderRadius: 18,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'var(--bg-card, #151922)',
        padding: '14px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <label style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', margin: 0 }}>
            Select or Search NEPSE Security
          </label>
          {symbol && (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#34d399', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 99 }}>
              ● {symbol} ACTIVE
            </span>
          )}
        </div>

        {/* Search Input + Analyze Button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <StockSearchSelect
              value={symbol}
              onChange={handleStockChange}
              placeholder="Search 350+ NEPSE securities…"
              stocks={stocks}
            />
          </div>
          <button
            type="button"
            onClick={() => analyze(symbol)}
            disabled={!symbol || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              borderRadius: 12,
              background: !symbol || loading ? 'rgba(255, 255, 255, 0.05)' : '#2563eb',
              color: !symbol || loading ? '#64748b' : '#ffffff',
              border: 'none',
              fontSize: 13,
              fontWeight: 800,
              cursor: !symbol || loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: !symbol || loading ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Crosshair size={14} />}
            {loading ? 'Analyzing…' : 'Analyze Setup'}
          </button>
        </div>

        {/* Active Stock Ticker Strip (if selected) */}
        {symbol && livePrice > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.08)', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)' }}>{symbol}</span>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({companyName})</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} />
                <span>Updated: <strong style={{ color: '#94a3b8' }}>{analyzedTime || 'Just now'}</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, textAlign: 'right', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Market Price</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)' }}>
                  Rs. {Number(livePrice).toFixed(2)}
                </div>
              </div>

              <div style={{
                fontSize: 12,
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: 8,
                fontFamily: 'var(--font-mono, monospace)',
                background: pChange >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: pChange >= 0 ? '#34d399' : '#fb7185',
                border: pChange >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)'
              }}>
                {pChange >= 0 ? `+${changeVal.toFixed(1)} (+${pChange.toFixed(2)}%)` : `${changeVal.toFixed(1)} (${pChange.toFixed(2)}%)`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Multi-Step Loading Skeleton ── */}
      {loading && (
        <div style={{
          borderRadius: 18,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'var(--bg-card, #151922)',
          padding: '32px 16px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
        }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid #334155', borderTopColor: '#3b82f6', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }} />
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', margin: '0 0 6px' }}>Analyzing {symbol}…</h3>
          <p style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'var(--font-mono, monospace)', margin: 0 }}>{loadingStep}</p>
          <div style={{ maxWidth: 320, margin: '14px auto 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton height="h-3.5" width="w-full" />
            <Skeleton height="h-3.5" width="w-3/4" className="mx-auto" />
          </div>
        </div>
      )}

      {/* ── Error State ── */}
      {!loading && error && <NoData message={error} />}

      {/* ── Empty State (Before stock selected) ── */}
      {!loading && !plan && !error && (
        <div style={{
          borderRadius: 18,
          border: '1px dashed rgba(255, 255, 255, 0.12)',
          background: 'rgba(21, 25, 34, 0.4)',
          padding: '40px 16px',
          textAlign: 'center'
        }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', margin: '0 auto 12px' }}>
            <Target size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', margin: '0 0 6px' }}>Select a NEPSE Security</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>
            Search or pick any listed security to inspect its full market structure, support/resistance
            clusters, moving-average trends, volume expansion, and verified historical analog trade outcomes.
          </p>
        </div>
      )}

      {/* ── MAIN DASHBOARD (When Plan is Loaded) ── */}
      {!loading && plan && (
        <div>
          {/* ── SUB-TABS NAVIGATION BAR ── */}
          <div style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            padding: '2px 2px 10px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: 16
          }}>
            {[
              { id: 'setup', label: 'Setup & Risk', icon: Target },
              { id: 'chart', label: 'Chart & S/R', icon: TrendingUp },
              { id: 'signals', label: '5D Evidence', icon: Zap },
              { id: 'history', label: 'Historical Analog', icon: History },
              { id: 'corporate', label: 'Dividends & Data', icon: Coins },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: isActive ? '#2563eb' : 'rgba(255, 255, 255, 0.04)',
                    border: isActive ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 2px 12px rgba(37, 99, 235, 0.35)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={14} color={isActive ? '#ffffff' : '#94a3b8'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── SUB-TAB 1: Setup & Risk ── */}
          {activeSubTab === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SetupScoreCard
                score={plan.setupScore}
                verdict={plan.verdict}
                confidence={plan.confidence}
                setupType={plan.setupType}
                signalAgreement={plan.signalAgreement}
                dataQuality={plan.dataQuality}
                bullishFactors={plan.bullishFactors}
                bearishFactors={plan.bearishFactors}
                warnings={plan.warnings}
                confirmations={plan.confirmations}
              />

              <EntryRiskCard levels={plan.levels} currentPrice={livePrice} />

              <WhatNextPanel
                confirmations={plan.confirmations}
                warnings={plan.warnings}
                levels={plan.levels}
                breakout={plan.breakout}
              />
            </div>
          )}

          {/* ── SUB-TAB 2: Chart & S/R ── */}
          {activeSubTab === 'chart' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <StockCandlestickChart
                candles={plan.candles || rawCandles}
                levels={{
                  entryZone: plan.levels?.entryZone,
                  stopLoss: plan.levels?.stopLoss,
                  target1: plan.levels?.target1,
                  target2: plan.levels?.target2,
                  support: plan.supportResistance?.support,
                  resistance: plan.supportResistance?.resistance,
                }}
                symbol={plan.symbol || symbol}
                ltp={livePrice}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <SupportResistancePanel
                  support={plan.supportResistance?.support}
                  resistance={plan.supportResistance?.resistance}
                  currentPrice={livePrice}
                />
                <BreakoutPanel breakout={plan.breakout} setupType={plan.setupType} />
              </div>
            </div>
          )}

          {/* ── SUB-TAB 3: 5D Evidence & Signals ── */}
          {activeSubTab === 'signals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <TechnicalDashboard
                trend={plan.trend}
                momentum={plan.momentum}
                volume={plan.volume}
                volatility={plan.volatility}
                priceAction={plan.priceAction}
              />

              <SignalAgreement signalAgreement={plan.signalAgreement} />

              <EvidencePanel
                bullishFactors={plan.bullishFactors}
                bearishFactors={plan.bearishFactors}
              />
            </div>
          )}

          {/* ── SUB-TAB 4: Historical Analog & Backtesting ── */}
          {activeSubTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HistoricalAnalogPanel analogResult={plan.analogResult} />
              <StrategyTrackRecord strategyTrackRecord={plan.strategyTrackRecord} />
            </div>
          )}

          {/* ── SUB-TAB 5: Corporate Dividends & Filings ── */}
          {activeSubTab === 'corporate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {dividendData && dividendData.length > 0 && (
                <div style={{
                  borderRadius: 16,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'var(--bg-card, #151922)',
                  padding: 16,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ borderRadius: 8, padding: 6, background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#facc15' }}>
                        <Coins size={16} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Corporate Distribution History
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                          Official declared dividends and rights issues from exchange records
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
                      {dividendData.length} FY tracked
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
                      <thead style={{ background: 'rgba(255, 255, 255, 0.04)', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', fontSize: 11 }}>
                        <tr>
                          <th style={{ padding: '8px 12px', fontFamily: 'var(--font-sans)' }}>Fiscal Year</th>
                          <th style={{ padding: '8px 8px', textAlign: 'right' }}>Cash Div</th>
                          <th style={{ padding: '8px 8px', textAlign: 'right' }}>Bonus Share</th>
                          <th style={{ padding: '8px 8px', textAlign: 'right' }}>Right Share</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-sans)' }}>Book Closure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dividendData.map((d: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--font-sans)', fontWeight: 800, color: '#ffffff' }}>{d.fiscalYear}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                              {d.cashDividend > 0 ? `${Number(d.cashDividend).toFixed(2)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', color: '#c084fc', fontWeight: 700 }}>
                              {d.bonusShare > 0 ? `${Number(d.bonusShare).toFixed(2)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>
                              {d.rightShare > 0 ? `${Number(d.rightShare).toFixed(2)}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8', fontFamily: 'var(--font-sans)' }}>
                              {d.bookClosure || 'Verified Filing'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <DataQualityPanel
                dataQuality={plan.dataQuality}
                unavailableFactors={plan.unavailableFactors}
              />
            </div>
          )}

          {/* ── Bottom Stock Detail Modal Trigger ── */}
          {onSelectStock && (
            <button
              type="button"
              onClick={() => onSelectStock({ symbol: plan.symbol || symbol })}
              style={{
                width: '100%',
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: 800,
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
                transition: 'all 0.15s ease'
              }}
            >
              <ExternalLink size={15} />
              <span>Open {plan.symbol} Complete Financial & Technical Dossier</span>
            </button>
          )}

          {/* ── Regulatory / Educational Disclaimer ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#64748b', padding: '12px 8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', marginTop: 14 }}>
            <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2, color: '#64748b' }} />
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>Educational analysis only, not investment advice.</strong> Historical performance,
              moving averages, and analog outcomes do not guarantee future market returns. Always manage risk,
              confirm volume participation, and consult your licensed broker before executing orders.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
