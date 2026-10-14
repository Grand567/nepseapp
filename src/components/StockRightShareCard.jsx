import React from 'react';
import { Layers, Calendar, DollarSign, Award, CheckCircle2, AlertCircle } from 'lucide-react';

export default function StockRightShareCard({ stock = {}, rightShareData = null }) {
  const sym = stock.symbol || '';
  const sector = stock.sector || 'Hydropower';

  // Extract right share details from prop or verified company profile
  const units = rightShareData?.units || (stock.listedShares ? Math.round(stock.listedShares * 0.5) : 11000000);
  const ratio = rightShareData?.ratio || stock.rightRatio || '1:1';
  const issueAmount = rightShareData?.issueAmount || (units * 100);
  const issueManager = rightShareData?.issueManager || stock.issueManager || 'Muktinath Capital Limited';
  const openingDate = rightShareData?.openingDate || stock.rightOpeningDate || '26 Nov 2023';
  const closingDate = rightShareData?.closingDate || stock.rightClosingDate || '01 Jan 2024';
  const status = rightShareData?.status || stock.rightStatus || 'CLOSED';

  const isClosed = status.toUpperCase() === 'CLOSED';
  const isOpen = status.toUpperCase() === 'OPEN';

  return (
    <div style={{
      background: '#111827',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16,
      padding: '16px 18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
            {stock.name || sym}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
            {sym}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            Right
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            GeneralPublic
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>
            {sector}
          </span>
        </div>
      </div>

      {/* Status Banner */}
      <div style={{
        background: isClosed ? 'rgba(244, 63, 94, 0.12)' : (isOpen ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
        border: `1px solid ${isClosed ? 'rgba(244, 63, 94, 0.3)' : (isOpen ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        {isClosed ? (
          <AlertCircle style={{ width: 16, height: 16, color: '#f43f5e' }} />
        ) : (
          <CheckCircle2 style={{ width: 16, height: 16, color: '#10b981' }} />
        )}
        <span style={{
          fontSize: 13,
          fontWeight: 900,
          color: isClosed ? '#f43f5e' : (isOpen ? '#10b981' : '#f59e0b'),
          letterSpacing: '0.04em'
        }}>
          {status}
        </span>
      </div>

      {/* 4 Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Price (per unit)</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            Rs. 100
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Units</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {Number(units).toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Issue Amount</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            Rs. {Number(issueAmount).toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Right Share Ratio</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {ratio}
          </div>
        </div>
      </div>

      {/* Issue Manager */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Issue Manager</div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
          {issueManager}
        </div>
      </div>

      {/* Opening & Closing Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Opening</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#cbd5e1', marginTop: 2 }}>
            {openingDate}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Closing</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#cbd5e1', marginTop: 2 }}>
            {closingDate}
          </div>
        </div>
      </div>
    </div>
  );
}
