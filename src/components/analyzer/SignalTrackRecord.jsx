import React, { useState, useEffect } from 'react';
import { getSignals, getSignalStats } from '../../services/signalTracker';

export const SignalTrackRecord = ({ symbol }) => {
  const [stats, setStats] = useState(null);
  const [recentSignals, setRecentSignals] = useState([]);

  useEffect(() => {
    const signals = getSignals({ symbol });
    // Sort descending by date
    signals.sort((a, b) => new Date(b.signalDate) - new Date(a.signalDate));
    
    setRecentSignals(signals.slice(0, 5));
    setStats(getSignalStats({ symbol }));
  }, [symbol]);

  if (!stats || stats.total === 0) {
    return (
      <div style={{
        background: '#151922',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '16px',
        color: '#8b949e',
        fontSize: '13px',
        textAlign: 'center'
      }}>
        No tracked signals yet for {symbol}
      </div>
    );
  }

  const { total, openCount, closedCount, winRate, avgReturnPct } = stats;

  return (
    <div style={{
      background: '#151922',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '16px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#c9d1d9', display: 'flex', alignItems: 'center' }}>
        Signal Track Record
        <span style={{ marginLeft: '8px', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '11px', color: '#8b949e' }}>
          {total} Total
        </span>
      </h3>
      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '100px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Win Rate</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: winRate >= 50 ? '#3fb950' : '#f85149' }}>
            {closedCount > 0 ? `${winRate.toFixed(1)}%` : 'Tracking'}
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>{closedCount} closed</div>
        </div>
        
        <div style={{ flex: 1, minWidth: '100px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Avg Return</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: avgReturnPct > 0 ? '#3fb950' : avgReturnPct < 0 ? '#f85149' : '#c9d1d9' }}>
            {closedCount > 0 ? `${avgReturnPct > 0 ? '+' : ''}${avgReturnPct.toFixed(2)}%` : 'Active'}
          </div>
        </div>
        
        <div style={{ flex: 1, minWidth: '100px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Open Signals</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#d29922' }}>
            {openCount}
          </div>
        </div>
      </div>
      
      {recentSignals.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: '#8b949e', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th style={{ padding: '6px 4px', fontWeight: 'normal' }}>Date</th>
                <th style={{ padding: '6px 4px', fontWeight: 'normal' }}>Type</th>
                <th style={{ padding: '6px 4px', fontWeight: 'normal' }}>Entry</th>
                <th style={{ padding: '6px 4px', fontWeight: 'normal', textAlign: 'right' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {recentSignals.map(sig => {
                const isOpen = sig.status === 'open';
                const ret = sig.outcome?.returnPct;
                return (
                  <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '6px 4px', color: '#c9d1d9' }}>{sig.signalDate.substring(5)}</td>
                    <td style={{ padding: '6px 4px' }}>
                      <span style={{ 
                        color: sig.signalType === 'BUY' ? '#3fb950' : sig.signalType === 'SELL' ? '#f85149' : '#8b949e',
                        fontWeight: '600'
                      }}>
                        {sig.signalType}
                      </span>
                    </td>
                    <td style={{ padding: '6px 4px', color: '#c9d1d9' }}>{sig.entryPrice}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 'bold',
                      color: isOpen ? '#d29922' : (ret > 0 ? '#3fb950' : ret < 0 ? '#f85149' : '#8b949e')
                    }}>
                      {isOpen ? 'Open' : `${ret > 0 ? '+' : ''}${ret}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div style={{ fontSize: '11px', color: '#8b949e', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
        {stats.disclaimer}
      </div>
    </div>
  );
};
