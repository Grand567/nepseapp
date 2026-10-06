/**
 * DataQualityBanner — A1 + A2
 *
 * A1: Persistent risk disclaimer required by SEBON guidelines and the app's
 *     own ground rules. Must be visible on every data-driven screen.
 *
 * A2: Data-quality warning — shown prominently when live data has not yet
 *     loaded and the app is displaying simulated placeholder values.
 *
 * Usage:
 *   <DataQualityBanner isSimulated={summary?.isSimulated} />
 *   <DataQualityBanner />   ← shows disclaimer only
 */

import React, { useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

/* ── A2: Simulated-data warning ─────────────────────────────────────────── */
/* ── A2: Simulated-data warning / market status ─────────────────────────── */
const SIMULATED_BANNER_DISMISSED_KEY = 'nepse_simulated_banner_dismissed';

export function SimulatedDataBanner({ isSimulated, dataQuality, onRefresh }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SIMULATED_BANNER_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  if (!isSimulated || dismissed) return null;

  const handleDismiss = () => {
    try { sessionStorage.setItem(SIMULATED_BANNER_DISMISSED_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const isMarketClosed = dataQuality === 'MARKET_CLOSED' || dataQuality === 'WEEKEND' || dataQuality === 'HOLIDAY';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: isMarketClosed ? 'rgba(56, 189, 248, 0.08)' : 'rgba(245, 158, 11, 0.10)',
        border: `1px solid ${isMarketClosed ? 'rgba(56, 189, 248, 0.25)' : 'rgba(245, 158, 11, 0.35)'}`,
        borderRadius: 8,
        padding: '8px 12px',
        margin: '6px 0',
        fontSize: 12,
        color: isMarketClosed ? '#93c5fd' : '#fcd34d',
        fontWeight: 500,
      }}
    >
      {isMarketClosed ? <Info size={15} style={{ flexShrink: 0, color: '#38bdf8' }} /> : <AlertTriangle size={15} style={{ flexShrink: 0, color: '#f59e0b' }} />}
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {isMarketClosed ? (
          <>
            <strong>NEPSE Market Closed.</strong> Showing official closing prices from the last trading session. Real-time updates resume when trading opens (Sun–Thu 11:00 AM – 3:00 PM).
          </>
        ) : (
          <>
            <strong>Connecting to live feed.</strong> Loading official NEPSE exchange records. Cached closing data is active.
            {dataQuality && (
              <span style={{ opacity: 0.75, marginLeft: 6, fontSize: 12 }}>
                [{dataQuality}]
              </span>
            )}
          </>
        )}
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          style={{
            background: isMarketClosed ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.18)',
            border: `1px solid ${isMarketClosed ? 'rgba(56, 189, 248, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
            borderRadius: 6,
            color: isMarketClosed ? '#38bdf8' : '#fbbf24',
            cursor: 'pointer',
            padding: '3px 8px',
            fontSize: 12,
            flexShrink: 0,
            fontWeight: 600
          }}
        >
          Refresh
        </button>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        style={{
          background: 'transparent',
          border: 'none',
          color: isMarketClosed ? '#93c5fd' : '#fcd34d',
          cursor: 'pointer',
          padding: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: 0.75
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── A1: Persistent risk disclaimer ─────────────────────────────────────── */
const DISCLAIMER_LS_KEY = 'nepse_hub_disclaimer_v1_acknowledged';

export function RiskDisclaimer({ compact = false }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(localStorage.getItem(DISCLAIMER_LS_KEY)); } catch { return false; }
  });

  if (compact && dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISCLAIMER_LS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  if (compact) {
    return (
      <div
        role="note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(96,165,250,0.08)',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: 7,
          padding: '8px 12px',
          margin: '6px 0',
          fontSize: 12,
          color: '#93c5fd',
        }}
      >
        <Info size={14} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <strong>For information only. Not financial advice.</strong> Investing
          involves risk of loss. Past performance is not a guarantee of future
          results. Always verify data with official NEPSE / MeroShare sources
          before trading.
        </span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss disclaimer"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#93c5fd',
            cursor: 'pointer',
            padding: 2,
            flexShrink: 0,
          }}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  // Full modal disclaimer (shown on first visit)
  if (dismissed) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(94vw, 480px)',
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid rgba(96,165,250,0.35)',
        borderRadius: 12,
        padding: 20,
        zIndex: 9999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        color: 'var(--text-primary, #e2e8f0)',
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Info size={18} color="#60a5fa" />
        <strong id="disclaimer-title" style={{ fontSize: 14 }}>
          Investment Risk Disclaimer
        </strong>
      </div>
      <p style={{ margin: '0 0 12px', opacity: 0.9 }}>
        This application is <strong>for information purposes only and does not
        constitute financial advice.</strong> All analysis, scores, signals, and
        recommendations are educational tools to support your own research.
      </p>
      <ul style={{ margin: '0 0 14px', paddingLeft: 18, opacity: 0.85 }}>
        <li>Investing in NEPSE involves substantial risk of capital loss.</li>
        <li>Past performance does not guarantee future results.</li>
        <li>Backtested strategies may not perform the same in live markets.</li>
        <li>
          Always verify prices, fundamentals, and corporate events with
          official sources (NEPSE, SEBON, MeroShare, ShareSansar).
        </li>
        <li>
          No tool — including this one — can guarantee profit or predict the
          market with 100% accuracy.
        </li>
      </ul>
      <button
        onClick={handleDismiss}
        style={{
          width: '100%',
          padding: '10px',
          background: 'rgba(96,165,250,0.2)',
          border: '1px solid rgba(96,165,250,0.4)',
          borderRadius: 8,
          color: '#93c5fd',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        I understand — proceed to the app
      </button>
    </div>
  );
}

/* ── Default export: combined wrapper ───────────────────────────────────── */
export default function DataQualityBanner({ isSimulated, dataQuality, onRefresh }) {
  return (
    <>
      <RiskDisclaimer compact />
      <SimulatedDataBanner
        isSimulated={isSimulated}
        dataQuality={dataQuality}
        onRefresh={onRefresh}
      />
    </>
  );
}
