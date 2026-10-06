/**
 * BookClosureAlert — shows upcoming book closure with countdown and context
 * Props: alert (from buildBookClosureAlert), compact (bool, default false)
 */
import React from 'react';

export function BookClosureAlert({ alert, compact = false, onDismiss }) {
  if (!alert) return null;
  
  const urgencyBg = alert.label === 'IMMINENT'
    ? 'rgba(248,113,113,0.08)'
    : alert.label === 'APPROACHING'
    ? 'rgba(251,191,36,0.08)'
    : 'rgba(52,211,153,0.08)';
  
  const urgencyBorder = alert.label === 'IMMINENT'
    ? 'rgba(248,113,113,0.3)'
    : alert.label === 'APPROACHING'
    ? 'rgba(251,191,36,0.3)'
    : 'rgba(52,211,153,0.3)';

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: urgencyBg, border: `1px solid ${urgencyBorder}`,
        borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700
      }}>
        <span style={{ color: alert.color }}>📅 {alert.label}</span>
        <span style={{ color: '#cbd5e1' }}>{alert.type}</span>
        <span style={{ color: '#64748b' }}>•</span>
        <span style={{ color: '#ffffff' }}>{alert.daysLeft}d left</span>
      </div>
    );
  }
  
  return (
    <div style={{
      background: urgencyBg,
      border: `1px solid ${urgencyBorder}`,
      borderRadius: 14, padding: '12px 14px', marginBottom: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: alert.color, marginBottom: 3, letterSpacing: '0.06em' }}>
            📅 BOOK CLOSURE {alert.label} — {alert.daysLeft} DAYS LEFT
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: alert.typeColor, marginBottom: 4 }}>
            {alert.type}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Book closure: <span style={{ color: '#ffffff', fontWeight: 600 }}>{alert.closureDate}</span>
          </div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
        📈 {alert.historicalNote}.
      </div>
      <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 6, lineHeight: 1.5 }}>
        ⏱ {alert.settlementNote} Prices usually drop on the ex-date, so buying late can mean paying for a dividend you then lose in price.
      </div>
      {alert.rightPct > 0 && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.35)',
          fontSize: 12, color: '#fb923c', lineHeight: 1.5
        }}>
          ⚠️ <strong>Right Share Dilution Warning ({alert.rightPct}% Issue):</strong>
          <br />
          On book closure, the market price automatically adjusts downward to the Theoretical Ex-Rights Price (TERP).
          Buying shares now without exercising your right to purchase additional shares at Rs. 100 par will result in a permanent capital dilution loss.
        </div>
      )}
    </div>
  );
}
