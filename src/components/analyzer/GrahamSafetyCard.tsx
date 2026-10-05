import React, { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Scale,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { calculateGrahamIntrinsicValue, calculateInterestAdjustedGrahamValue, calculateEarningsYieldAndRiskPremium } from '../../utils/quantEngine';
import { getCachedStockFundamentals } from '../../utils/historyCache';
import { getSectorBenchmark } from '../../utils/fundamentals';

interface GrahamSafetyCardProps {
  symbol: string;
  ltp: number;
  fundamentals?: {
    eps?: number;
    bookValue?: number;
    pe?: number;
    pb?: number;
    pbv?: number;
    sector?: string;
  } | null;
  setupScore?: number;
  verdict?: string;
  loading?: boolean;
}

export function GrahamSafetyCard({
  symbol,
  ltp,
  fundamentals,
  setupScore = 50,
  verdict = '',
  loading = false,
}: GrahamSafetyCardProps) {
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  const sym = String(symbol || '').toUpperCase().trim();
  const currentPrice = Number(ltp || 0);

  // 1. Resolve raw inputs
  let eps = fundamentals?.eps !== undefined && fundamentals?.eps !== null ? Number(fundamentals.eps) : null;
  let bookValue = (fundamentals?.bookValue || fundamentals?.bvps) ? Number(fundamentals.bookValue || fundamentals.bvps) : null;
  let sector = fundamentals?.sector || '';

  // 2. Check cached fundamentals if missing
  if (eps === null || bookValue === null) {
    const cached = getCachedStockFundamentals(sym);
    if (cached) {
      if (eps === null && cached.eps !== undefined && cached.eps !== null) eps = Number(cached.eps);
      if (bookValue === null && (cached.bookValue || cached.bvps)) bookValue = Number(cached.bookValue || cached.bvps);
      if (!sector && cached.sector) sector = cached.sector;
    }
  }

  // 3. Fallback to sector benchmark if still missing
  const bench = getSectorBenchmark(sector);
  let isSectorEstimated = false;
  if (eps === null) {
    eps = bench.medianEPS || 22;
    isSectorEstimated = true;
  }
  if (bookValue === null || bookValue <= 0) {
    bookValue = currentPrice > 0 && bench.medianPBV > 0
      ? +(currentPrice / bench.medianPBV).toFixed(1)
      : +(Math.max(10, eps) * (bench.medianPE || 16) / (bench.medianPBV || 1.6)).toFixed(1);
    isSectorEstimated = true;
  }

  const isLossMaking = eps <= 0;
  const grahamFloor = +(bookValue * 0.67).toFixed(1);
  const lossMosPct = currentPrice > 0 ? +(((grahamFloor - currentPrice) / grahamFloor) * 100).toFixed(1) : 0;

  const graham = calculateGrahamIntrinsicValue(eps, bookValue, currentPrice);
  const interestAdjusted = calculateInterestAdjustedGrahamValue(eps > 0 ? eps : 0, 7.0, 7.5, currentPrice);
  const erpMetrics = calculateEarningsYieldAndRiskPremium(eps, currentPrice, 7.5);

  const hasValidFundamentals = true; // Always populated with genuine filings or sector calibration
  const effectiveIntrinsic = isLossMaking ? grahamFloor : graham.intrinsicValue;
  const mosPct = isLossMaking ? lossMosPct : graham.marginOfSafetyPct;
  const pePb = graham.pePbProduct > 0 ? graham.pePbProduct : (eps > 0 && bookValue > 0 && currentPrice > 0 ? +((currentPrice / eps) * (currentPrice / bookValue)).toFixed(1) : 0);

  // Determine Dual-Shield Alignment
  let shieldTier: 'dual' | 'value' | 'momentum' | 'warning' | 'unsupported' = 'warning';
  let tierTitle = '';
  let tierDescription = '';
  let tierBadgeBg = '';
  let tierBadgeBorder = '';
  let tierBadgeText = '';
  let TierIcon = Shield;

  if (isLossMaking) {
    shieldTier = 'warning';
    tierTitle = 'Loss-Making Entity (Graham Asset Floor Applied)';
    tierDescription = `Reported EPS is negative (Rs. ${eps.toFixed(2)}). Under Benjamin Graham's Chapter 14 defensive principles, intrinsic purchase boundary defaults to 2/3 Tangible BVPS (Rs. ${grahamFloor}) liquidation parity.`;
    tierBadgeBg = 'rgba(239, 68, 68, 0.12)';
    tierBadgeBorder = 'rgba(239, 68, 68, 0.35)';
    tierBadgeText = '#f87171';
    TierIcon = ShieldAlert;
  } else if (isSectorEstimated) {
    shieldTier = 'value';
    tierTitle = 'Sector Baseline Calibration (Filings Pending)';
    tierDescription = `Company-specific filings pending; calibrated against ${bench.description || 'Sector'} medians (EPS: Rs. ${eps}, BVPS: Rs. ${bookValue}). Estimated Graham Fair Value: Rs. ${effectiveIntrinsic.toFixed(1)} with a ${mosPct >= 0 ? '+' : ''}${mosPct.toFixed(1)}% margin of safety.`;
    tierBadgeBg = 'rgba(56, 189, 248, 0.12)';
    tierBadgeBorder = 'rgba(56, 189, 248, 0.35)';
    tierBadgeText = '#38bdf8';
    TierIcon = Scale;
  } else if (mosPct >= 15 && setupScore >= 58) {
    shieldTier = 'dual';
    tierTitle = 'Institutional Dual-Shield Setup (Value + Timing Aligned)';
    tierDescription = `Both balance sheet safety (Rs. ${effectiveIntrinsic.toFixed(1)} Graham Number with a +${mosPct.toFixed(1)}% margin of safety) and technical entry zone are aligned. Highest empirical defense against permanent capital loss.`;
    tierBadgeBg = 'rgba(16, 185, 129, 0.15)';
    tierBadgeBorder = 'rgba(16, 185, 129, 0.4)';
    tierBadgeText = '#34d399';
    TierIcon = ShieldCheck;
  } else if (mosPct >= 15) {
    shieldTier = 'value';
    tierTitle = 'Deep Value Accumulation (Patience Required)';
    tierDescription = `Trading at a +${mosPct.toFixed(1)}% discount to Graham Intrinsic Value (V* Rs. ${effectiveIntrinsic.toFixed(1)}). Excellent fundamental balance-sheet buffer, but intermediate technical momentum is consolidating.`;
    tierBadgeBg = 'rgba(56, 189, 248, 0.15)';
    tierBadgeBorder = 'rgba(56, 189, 248, 0.4)';
    tierBadgeText = '#38bdf8';
    TierIcon = Scale;
  } else if (setupScore >= 58) {
    shieldTier = 'momentum';
    tierTitle = 'Tactical Momentum Play (Strict Stop-Loss Mandatory)';
    tierDescription = `Technically strong setup (${setupScore}/100), but trading at a ${Math.abs(mosPct).toFixed(1)}% premium above Graham Fair Value (V* Rs. ${effectiveIntrinsic.toFixed(1)}). Valid for quantitative swing trading only; structural stop-loss is mandatory.`;
    tierBadgeBg = 'rgba(245, 158, 11, 0.15)';
    tierBadgeBorder = 'rgba(245, 158, 11, 0.4)';
    tierBadgeText = '#fbbf24';
    TierIcon = AlertTriangle;
  } else {
    shieldTier = 'warning';
    tierTitle = 'High Capital Loss Risk (Fails Value & Timing Criteria)';
    tierDescription = `Negative margin of safety (${mosPct.toFixed(1)}% vs V* Rs. ${effectiveIntrinsic.toFixed(1)}) combined with deteriorating technical momentum. Avoid long exposure until valuation compresses.`;
    tierBadgeBg = 'rgba(244, 63, 94, 0.15)';
    tierBadgeBorder = 'rgba(244, 63, 94, 0.4)';
    tierBadgeText = '#fb7185';
    TierIcon = ShieldAlert;
  }

  // 5-Point Graham Checklist
  const checklist = [
    {
      label: 'Positive Operational Earnings Power (EPS > 0)',
      passed: eps > 0,
      value: eps > 0 ? `Rs. ${eps.toFixed(2)}${isSectorEstimated ? ' (Est)' : ''}` : `Loss: Rs. ${eps.toFixed(2)}`,
      sub: 'Proof of commercial vitality',
    },
    {
      label: 'Tangible Asset Backing (BVPS > 0)',
      passed: bookValue > 0,
      value: bookValue > 0 ? `Rs. ${bookValue.toFixed(1)}${isSectorEstimated ? ' (Est)' : ''}` : 'Deficient',
      sub: 'Net assets protecting liquidation parity',
    },
    {
      label: isLossMaking ? 'Trading Below Asset Floor (LTP ≤ Floor)' : 'Trading Below Graham Fair Value (LTP ≤ V*)',
      passed: currentPrice <= effectiveIntrinsic,
      value: `LTP Rs. ${currentPrice.toFixed(1)} vs ${isLossMaking ? 'Floor' : 'V*'} Rs. ${effectiveIntrinsic.toFixed(1)}`,
      sub: 'Avoids overpaying for future growth',
    },
    {
      label: 'Graham Multiple Ceiling (P/E × P/B ≤ 22.5)',
      passed: !isLossMaking && pePb > 0 && pePb <= 22.5,
      value: isLossMaking ? 'N/A (Loss)' : pePb > 0 ? `${pePb.toFixed(1)}x (Max 22.5x)` : 'Stretched',
      sub: 'Prevents speculative multiple compression',
    },
    {
      label: 'Margin of Safety Buffer (Discount ≥ 15%)',
      passed: mosPct >= 15,
      value: `${mosPct >= 0 ? '+' : ''}${mosPct.toFixed(1)}%`,
      sub: 'Shock-absorber for recessions & adverse events',
    },
  ];

  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'var(--bg-card, #151922)',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* ── Header Title Strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
            }}
          >
            <Shield size={17} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Graham Margin of Safety & Capital Preservation Shield
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                }}
              >
                Intelligent Investor
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              Defensive equity framework: Valuation shock-absorber & permanent capital preservation
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFormulaDetails(!showFormulaDetails)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#60a5fa',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: '4px 6px',
          }}
        >
          <Info size={12} />
          <span>{showFormulaDetails ? 'Hide Formula' : 'Formula Mechanics'}</span>
          {showFormulaDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── Expandable Formula Explanation ── */}
      {showFormulaDetails && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: 12,
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '12px 14px',
            fontSize: 11.5,
            color: '#cbd5e1',
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 800, color: '#60a5fa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} /> Benjamin Graham’s Intrinsic Value Formulation:
          </div>
          <p style={{ margin: '0 0 6px' }}>
            In Chapter 14 of <em>The Intelligent Investor</em> and Chapter 27 of <em>Security Analysis</em>, Benjamin Graham defines the maximum conservative purchase boundary as:
          </p>
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: 8,
              padding: '6px 12px',
              fontFamily: 'var(--font-mono, monospace)',
              color: '#34d399',
              fontWeight: 700,
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            V* = √(22.5 × EPS × BVPS) &nbsp;|&nbsp; Margin of Safety % = ((V* - LTP) / V*) × 100
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>
            Where <strong>22.5</strong> reflects Graham’s dual upper ceiling: a maximum Price-to-Earnings of <strong>15.0×</strong> multiplied by a maximum Price-to-Book of <strong>1.5×</strong> (15 × 1.5 = 22.5). When you purchase with a ≥ 20% margin of safety, you are insulated from analytical errors, unexpected recessions, or adverse fiscal shocks.
          </p>
        </div>
      )}

      {/* ── Master Alignment Verdict Banner ── */}
      <div
        style={{
          borderRadius: 12,
          padding: '12px 14px',
          background: tierBadgeBg,
          border: `1px solid ${tierBadgeBorder}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ color: tierBadgeText, marginTop: 1, flexShrink: 0 }}>
          <TierIcon size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: tierBadgeText, marginBottom: 2 }}>
            {tierTitle}
          </div>
          <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.45 }}>
            {tierDescription}
          </div>
        </div>
      </div>

      {/* ── 4-Metric Quantitative Grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
        }}
      >
        {/* Box 1: Graham Fair Value / Asset Floor */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
            {isLossMaking ? 'Graham Asset Floor' : 'Graham Fair Value (V*)'}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#ffffff',
              marginTop: 2,
            }}
          >
            Rs. {effectiveIntrinsic.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {isLossMaking ? '2/3 Tangible BVPS (Liquidation)' : isSectorEstimated ? '√(22.5 × EPS × BVPS) (Sector)' : 'Formula: √(22.5 × EPS × BVPS)'}
          </div>
        </div>

        {/* Box 2: Margin of Safety Buffer */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
            Margin of Safety %
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              fontFamily: 'var(--font-mono, monospace)',
              color: mosPct >= 15 ? '#34d399' : mosPct >= 0 ? '#38bdf8' : '#fb7185',
              marginTop: 2,
            }}
          >
            {mosPct >= 0 ? '+' : ''}{mosPct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {isLossMaking
              ? 'Vs Tangible Asset Floor'
              : mosPct >= 15
              ? 'High Capital Buffer'
              : mosPct >= 0
              ? 'Moderate Cushion'
              : 'Valuation Premium'}
          </div>
        </div>

        {/* Box 3: Earning Power (EPS) & P/E */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
            EPS (TTM) & P/E Ratio
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              fontFamily: 'var(--font-mono, monospace)',
              color: eps > 0 ? '#ffffff' : '#f87171',
              marginTop: 2,
            }}
          >
            {eps < 0 ? `-Rs. ${Math.abs(eps).toFixed(2)}` : `Rs. ${eps.toFixed(2)}`}{isSectorEstimated ? ' *' : ''}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {eps > 0 && currentPrice > 0 ? `P/E: ${(currentPrice / eps).toFixed(1)}x (Max 15x)` : 'Negative EPS (Loss)'}
          </div>
        </div>

        {/* Box 4: Asset Backing (BVPS) & P/B */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
            BVPS & Graham Product
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#ffffff',
              marginTop: 2,
            }}
          >
            Rs. ${bookValue.toFixed(1)}{isSectorEstimated ? ' *' : ''}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {pePb > 0 ? `P/E × P/B: ${pePb.toFixed(1)} (Max 22.5)` : currentPrice > 0 && bookValue > 0 ? `P/B: ${(currentPrice / bookValue).toFixed(1)}x` : 'Multiple pending'}
          </div>
        </div>
      </div>

      {/* ── Macro Interest-Adjusted strip ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))',
          borderRadius: 10,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#94a3b8' }}>Macro Fair Value (7.5% FD):</span>
          <span style={{ fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono, monospace)' }}>
            Rs. {interestAdjusted.intrinsicValue > 0 ? interestAdjusted.intrinsicValue.toFixed(1) : grahamFloor.toFixed(1)}
          </span>
          <span style={{ color: '#64748b', fontSize: 10 }}>
            {interestAdjusted.maxBuyPrice20 > 0 ? `(Max Buy 20% MOS: Rs. ${interestAdjusted.maxBuyPrice20.toFixed(1)})` : '(Protected Asset Floor)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#94a3b8' }}>Equity Risk Premium:</span>
          <span
            style={{
              fontWeight: 800,
              color: erpMetrics.isFavorable ? '#34d399' : '#f87171',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {erpMetrics.erp >= 0 ? `+${erpMetrics.erp.toFixed(2)}%` : `${erpMetrics.erp.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* ── 5-Point Capital Preservation Checklist ── */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.05)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>
          Graham 5-Point Capital Preservation Audit
        </div>

        {checklist.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 11,
              padding: '3px 0',
              borderBottom: idx < checklist.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {item.passed ? (
                <CheckCircle2 size={13} color="#34d399" style={{ flexShrink: 0 }} />
              ) : (
                <XCircle size={13} color="#f87171" style={{ flexShrink: 0 }} />
              )}
              <span style={{ color: item.passed ? '#cbd5e1' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                color: item.passed ? '#34d399' : '#f87171',
                flexShrink: 0,
                fontSize: 10.5,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer Investor Counsel ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 10.5,
          color: '#64748b',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: 8,
          lineHeight: 1.4,
        }}
      >
        <Info size={13} color="#64748b" style={{ flexShrink: 0 }} />
        <span>
          <strong>Graham Law of Asymmetric Recovery:</strong> A 50% loss requires a 100% gain merely to break even. Insisting on a fundamental margin of safety turns time into your ally rather than your adversary.
        </span>
      </div>
    </div>
  );
}
