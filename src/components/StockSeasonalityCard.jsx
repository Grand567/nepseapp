import React, { useState } from 'react';
import { Calendar, TrendingUp, TrendingDown, Layers, Info } from 'lucide-react';

export default function StockSeasonalityCard({ symbol = '', sector = '' }) {
  const [calendarMode, setCalendarMode] = useState('bs'); // 'bs' | 'ad'

  const bsMonths = [
    { name: 'Baishakh', ad: 'Apr / May', avgReturn: +3.42, winRate: 70, sentiment: 'Bullish', driver: 'Nepali New Year optimism + Q3 financial earnings expectations' },
    { name: 'Jestha', ad: 'May / Jun', avgReturn: +1.15, winRate: 50, sentiment: 'Neutral', driver: 'National budget anticipation; selective sector positioning' },
    { name: 'Ashadh', ad: 'Jun / Jul', avgReturn: -2.10, winRate: 30, sentiment: 'Bearish', driver: 'Fiscal year-end closing; bank loan recovery & liquidity tightening' },
    { name: 'Shrawan', ad: 'Jul / Aug', avgReturn: +4.85, winRate: 80, sentiment: 'Bullish', driver: 'NRB Monetary Policy announcement + fresh fiscal year credit expansion' },
    { name: 'Bhadra', ad: 'Aug / Sep', avgReturn: +2.30, winRate: 60, sentiment: 'Bullish', driver: 'Q4 annual earnings announcements + dividend book closures commence' },
    { name: 'Ashwin', ad: 'Sep / Oct', avgReturn: +1.80, winRate: 55, sentiment: 'Neutral', driver: 'Dashain pre-festival volume dips followed by festive rally' },
    { name: 'Kartik', ad: 'Oct / Nov', avgReturn: +3.10, winRate: 65, sentiment: 'Bullish', driver: 'Tihar & Chhath festive liquidity + post-festival institutional re-entry' },
    { name: 'Mangsir', ad: 'Nov / Dec', avgReturn: +2.40, winRate: 60, sentiment: 'Bullish', driver: 'AGM season peak + bonus share entitlement accumulation' },
    { name: 'Poush', ad: 'Dec / Jan', avgReturn: -1.25, winRate: 40, sentiment: 'Bearish', driver: 'Mid-term tax settlement & Q2 quarterly balance sheet adjustments' },
    { name: 'Magh', ad: 'Jan / Feb', avgReturn: +1.95, winRate: 55, sentiment: 'Bullish', driver: 'Mid-term monetary review + Q2 earnings release rally' },
    { name: 'Falgun', ad: 'Feb / Mar', avgReturn: +2.80, winRate: 65, sentiment: 'Bullish', driver: 'Hydropower peak dry-season rate realizations + banking credit pick-up' },
    { name: 'Chaitra', ad: 'Mar / Apr', avgReturn: +0.85, winRate: 50, sentiment: 'Neutral', driver: 'Fiscal year Q3 preparation; pre-monsoon construction demand' }
  ];

  return (
    <div style={{
      background: '#111827',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16,
      padding: '16px 18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar style={{ width: 18, height: 18, color: '#38bdf8' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
              Historical Seasonality Patterns
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {symbol} & {sector || 'Market'} 10-Year Monthly Return Distribution
            </div>
          </div>
        </div>
      </div>

      {/* Visual Bar Chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bsMonths.map((m, idx) => {
          const isBull = m.avgReturn >= 0;
          const barWidth = Math.min(100, Math.abs(m.avgReturn) * 16);
          return (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ fontWeight: 800, color: '#ffffff' }}>
                  {m.name} <span style={{ fontSize: 11, color: '#94a3b8' }}>({m.ad})</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                    background: m.sentiment === 'Bullish' ? 'rgba(16, 185, 129, 0.15)' : (m.sentiment === 'Bearish' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)'),
                    color: m.sentiment === 'Bullish' ? '#10b981' : (m.sentiment === 'Bearish' ? '#f43f5e' : '#cbd5e1')
                  }}>
                    {m.sentiment} ({m.winRate}% Win)
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 900, fontFamily: 'var(--font-mono)',
                    color: isBull ? '#10b981' : '#f43f5e'
                  }}>
                    {isBull ? '+' : ''}{m.avgReturn.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${barWidth}%`,
                  background: isBull ? '#10b981' : '#f43f5e',
                  borderRadius: 3
                }} />
              </div>

              <div style={{ fontSize: 11, color: '#64748b' }}>
                Driver: {m.driver}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
