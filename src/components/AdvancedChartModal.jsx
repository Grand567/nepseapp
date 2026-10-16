import React, { useState } from 'react';
import { ChevronLeft, X, Globe, Cpu } from 'lucide-react';
import ShareHubChart from './ShareHubChart';
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
  const [chartSource, setChartSource] = useState('native'); // 'native' | 'web'

  const ltp = Number(stock?.ltp || 0);
  const change = Number(stock?.change || 0);
  const pChange = Number(stock?.pChange || 0);
  const isBull = change >= 0;
  const cleanSymbol = (symbol || 'NEPSE').replace(/ Index$/i, '').trim().toUpperCase();
  const companyName = stock?.name || stock?.companyName || stock?.sector || 'Nepal Stock Exchange';

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

        {/* Right: Native vs Web Switcher & Close button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: 2
          }}>
            <button
              type="button"
              onClick={() => setChartSource('native')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: chartSource === 'native' ? 800 : 600,
                cursor: 'pointer',
                border: 'none',
                background: chartSource === 'native' ? '#3875F6' : 'transparent',
                color: chartSource === 'native' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Cpu size={12} />
              <span>Native Pro Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setChartSource('web')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: chartSource === 'web' ? 800 : 600,
                cursor: 'pointer',
                border: 'none',
                background: chartSource === 'web' ? '#3875F6' : 'transparent',
                color: chartSource === 'web' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Globe size={12} />
              <span>TradingView Web</span>
            </button>
          </div>

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
        {chartSource === 'web' ? (
          <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', background: '#131722' }}>
            <iframe
              title="TradingView Technical Chart"
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=NEPSE%3A${encodeURIComponent(cleanSymbol)}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKathmandu&withdateranges=1&showpopupbutton=1`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              onError={(e) => {
                console.warn('TradingView iframe load warning:', e);
              }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '6px 8px 10px' }}>
            <ShareHubChart
              symbol={symbol}
              stock={stock}
              chartTimeframe={timeframe}
              onTimeframeChange={setTimeframe}
              isFullscreen={true}
              height={500}
              entryExitPlan={entryExitPlan}
              brokerAnalysis={brokerAnalysis}
              floorsheetData={floorsheetData}
              onToggleFullscreen={onClose}
              showTimeframeBar={true}
              showAdvancedChartBtn={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
