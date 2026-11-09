// src/components/DashboardSkeleton.jsx
import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div
      className="dashboard-skeleton-wrap"
      style={{
        padding: '12px 14px',
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'transparent'
      }}
      aria-busy="true"
      aria-label="Loading live market dashboard"
    >
      {/* Ticker shimmer bar */}
      <div
        style={{
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmerSweep 1.6s infinite linear',
          border: '1px solid rgba(255,255,255,0.06)'
        }}
      />

      {/* Top 3 summary metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[1, 2, 3].map((k) => (
          <div
            key={k}
            style={{
              height: 90,
              borderRadius: 12,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmerSweep 1.6s infinite linear',
              border: '1px solid rgba(255,255,255,0.06)'
            }}
          />
        ))}
      </div>

      {/* Hero market chart card */}
      <div
        style={{
          height: 280,
          borderRadius: 14,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmerSweep 1.6s infinite linear',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.25)' }}>
          Loading Real-Time NEPSE Market Engine...
        </span>
      </div>

      {/* Stock list table shimmer rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {[1, 2, 3, 4, 5, 6].map((k) => (
          <div
            key={k}
            style={{
              height: 48,
              borderRadius: 8,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmerSweep 1.6s infinite linear',
              border: '1px solid rgba(255,255,255,0.04)'
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes shimmerSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
