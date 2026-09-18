// src/components/ProGate.jsx
// Production-grade Lock Gate for Pro Features
// Wraps premium features and prompts free/expired users to activate a monthly Pro timeframe.

import React from 'react';
import { Lock, Crown, Sparkles, ChevronRight, Zap, ArrowUpRight } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

export default function ProGate({
  children,
  featureName = 'Pro Analytical Feature',
  description = 'This feature requires an active Drabyashree Pro monthly pass.',
  requiredPlan = '1m',
  compact = false,
  showPreview = true
}) {
  const { isPro, daysRemaining, planDuration, openSubscriptionModal } = useSubscription();

  // If user is an active Pro member, render the content cleanly!
  if (isPro) {
    return (
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    );
  }

  // Compact Inline Pro Lock Banner (for lists, cards, buttons)
  if (compact) {
    return (
      <div
        onClick={() => openSubscriptionModal(requiredPlan, featureName)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.08) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 10,
          padding: '8px 12px',
          cursor: 'pointer',
          margin: '6px 0',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            background: 'rgba(245, 158, 11, 0.2)',
            borderRadius: 6,
            padding: 4,
            display: 'flex',
            color: '#f59e0b'
          }}>
            <Lock style={{ width: 14, height: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b' }}>
              {featureName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Pro Only · Available in 1m, 2m, 3m passes
            </div>
          </div>
        </div>

        <button
          type="button"
          style={{
            background: 'linear-gradient(90deg, #d97706, #f59e0b)',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 10.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <span>Unlock</span>
          <ChevronRight style={{ width: 11, height: 11 }} />
        </button>
      </div>
    );
  }

  // Full Screen / Panel Pro Gate with Blurred Preview
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 16 }}>
      {/* Blurred background preview of the feature */}
      {showPreview && (
        <div style={{
          filter: 'blur(7px)',
          opacity: 0.25,
          pointerEvents: 'none',
          userSelect: 'none',
          maxHeight: 480,
          overflow: 'hidden'
        }}>
          {children}
        </div>
      )}

      {/* Frosted Lock Overlay */}
      <div style={{
        position: showPreview ? 'absolute' : 'relative',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 20px',
        background: showPreview ? 'rgba(11, 14, 20, 0.78)' : 'var(--bg-card)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 16,
        textAlign: 'center',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        minHeight: showPreview ? 'auto' : 320,
        zIndex: 5
      }}>
        {/* Animated Gold Lock Icon */}
        <div style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.15) 100%)',
          border: '1.5px solid rgba(245, 158, 11, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f59e0b',
          marginBottom: 14,
          boxShadow: '0 0 24px rgba(245, 158, 11, 0.25)'
        }}>
          <Lock style={{ width: 24, height: 24 }} />
        </div>

        {/* Feature Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 20,
          padding: '3px 10px',
          color: '#f59e0b',
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.04em',
          marginBottom: 8
        }}>
          <Crown style={{ width: 12, height: 12 }} />
          PRO FEATURE
        </div>

        <h3 style={{
          fontSize: 18,
          fontWeight: 900,
          color: '#ffffff',
          margin: '0 0 6px',
          letterSpacing: '-0.01em'
        }}>
          {featureName}
        </h3>

        <p style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          maxWidth: 420,
          margin: '0 0 16px',
          lineHeight: 1.5
        }}>
          {description}
        </p>

        {/* Monthly Plan Timeframe Pill Selection Indicator */}
        <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 16
        }}>
          {['1m (1 Month)', '2m (2 Months)', '3m (Quarterly)', '6m', '12m'].map((tf, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: i === 0 ? '#f59e0b' : 'var(--text-muted)',
                background: i === 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                border: i === 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '2px 8px'
              }}
            >
              {tf}
            </span>
          ))}
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={() => openSubscriptionModal(requiredPlan, featureName)}
          style={{
            background: 'linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
            color: '#000',
            border: 'none',
            borderRadius: 10,
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 900,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            boxShadow: '0 6px 20px rgba(245, 158, 11, 0.35)',
            transition: 'transform 0.1s ease'
          }}
        >
          <Zap style={{ width: 15, height: 15 }} />
          <span>Unlock Pro Access (Choose Monthly Pass)</span>
          <ArrowUpRight style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}
