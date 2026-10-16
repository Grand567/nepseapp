import React, { useState } from 'react';
import { ChevronLeft, X, ExternalLink, Cpu, Layers } from 'lucide-react';
import ShareHubChart from './ShareHubChart';
import { StockCandlestickChart } from './charts/StockCandlestickChart';
import { useBackHandler } from '../context/NavigationContext';

const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function AdvancedChartModal({
  symbol = 'NEPSE',
  stock = null,
  initialTimeframe = '1M',
  entryExitPlan = null,
  brokerAnalysis = null,
  floorsheetData = null,
  onClose
}) {
  useBackHandler(onClose, true, 110);

  const [timeframe, setTimeframe] = useState(initialTimeframe || '1M');
  const [chartMode, setChartMode] = useState('pro'); // 'pro' | 'ribbon'

  const ltp = Number(stock?.ltp || 0);
  const change = Number(stock?.change || 0);
  const pChange = Number(stock?.pChange || 0);
  const isBull = change >= 0;
  const cleanSymbol = (symbol || 'NEPSE').replace(/ Index$/i, '').trim().toUpperCase();
  const companyName = stock?.name || stock?.companyName || stock?.sector || 'Nepal Stock Exchange';

  const chartLevels = entryExitPlan ? {
    entryZone: entryExitPlan.levels?.entryZone || (entryExitPlan.buyPrice ? { low: entryExitPlan.buyPrice, high: entryExitPlan.buyPrice * 1.02, label: 'Entry' } : undefined),
    stopLoss: entryExitPlan.levels?.stopLoss || (entryExitPlan.stopLoss ? { price: entryExitPlan.stopLoss, pct: entryExitPlan.stopLossPct || 5, label: 'Stop Loss' } : undefined),
    target1: entryExitPlan.levels?.target1 || (entryExitPlan.target1 ? { price: entryExitPlan.target1, pct: entryExitPlan.target1Pct || 10, label: 'Target 1' } : undefined),
    target2: entryExitPlan.levels?.target2 || (entryExitPlan.target2 ? { price: entryExitPlan.target2, pct: entryExitPlan.target2Pct || 20, label: 'Target 2' } : undefined),
    support: entryExitPlan.supportResistance?.support,
    resistance: entryExitPlan.supportResistance?.resistance,
  } : undefined;

  return (
    <div
      className="fullscreen-chart-modal fixed inset-0 z-50 flex flex-col"
      style={{
        background: '#080c14',
        color: '#f8fafc',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      {/* ── Top Technician Header Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px calc(env(safe-area-inset-top, 0px) + 8px)',
        background: '#0d131f',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        flexShrink: 0,
        gap: 10,
        flexWrap: 'wrap'
      }}>
        {/* Left: Back button & Stock info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Stock Details"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ChevronLeft size={18} />
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em' }}>
                {symbol}
              </span>
              {ltp > 0 && (
                <span style={{ fontSize: 15, fontWeight: 800, color: isBull ? '#10B981' : '#F43F5E', fontFamily: 'var(--font-mono, monospace)' }}>
                  Rs. {fmt(ltp)}
                </span>
              )}
              {(change !== 0 || pChange !== 0) && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: isBull ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  border: isBull ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                  color: isBull ? '#10B981' : '#F43F5E',
                  fontFamily: 'var(--font-mono, monospace)'
                }}>
                  {isBull ? '▲ +' : '▼ '}{Math.abs(change).toFixed(2)} ({isBull ? '+' : ''}{pChange.toFixed(2)}%)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
              {companyName}
            </div>
          </div>
        </div>

        {/* Right: Mode Switcher + NepseAlpha External Launcher + Close button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: 2
          }}>
            <button
              type="button"
              onClick={() => setChartMode('pro')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: chartMode === 'pro' ? 800 : 600,
                cursor: 'pointer',
                border: 'none',
                background: chartMode === 'pro' ? '#2563eb' : 'transparent',
                color: chartMode === 'pro' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Cpu size={12} />
              <span>Pro Chart (TradingView Engine)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('ribbon')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: chartMode === 'ribbon' ? 800 : 600,
                cursor: 'pointer',
                border: 'none',
                background: chartMode === 'ribbon' ? '#2563eb' : 'transparent',
                color: chartMode === 'ribbon' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Layers size={12} />
              <span>Multi-MA & Ribbon View</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              window.open(`https://nepsealpha.com/trading/chart?symbol=${encodeURIComponent(cleanSymbol)}`, '_blank', 'noopener,noreferrer');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              transition: 'all 0.15s ease'
            }}
            title="Open TradingView Chart on NepseAlpha in a new tab"
          >
            <ExternalLink size={12} />
            <span>NepseAlpha Web ↗</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Main Workstation Content Area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {chartMode === 'pro' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 8px 10px' }}>
            <ShareHubChart
              symbol={symbol}
              stock={stock}
              chartTimeframe={timeframe}
              onTimeframeChange={setTimeframe}
              isFullscreen={true}
              height={520}
              entryExitPlan={entryExitPlan}
              brokerAnalysis={brokerAnalysis}
              floorsheetData={floorsheetData}
              onToggleFullscreen={onClose}
              showTimeframeBar={true}
              showAdvancedChartBtn={false}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '10px 14px' }}>
            <StockCandlestickChart
              symbol={symbol}
              stock={stock}
              ltp={ltp}
              initialTimeframe={timeframe}
              levels={chartLevels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
