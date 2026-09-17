import React, { useState } from 'react';
import {
  Calendar,
  Sparkles,
  Flame,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  ShieldAlert,
  Coins,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getAccurateFestivalSeasonality } from '../../utils/quantEngine';

interface FestivalSeasonalityCardProps {
  festivalSeason?: {
    phase?: string;
    phaseKey?: string;
    scoreBonus?: number;
    bias?: string;
    detail?: string;
    festivalName?: string;
    nextEventName?: string;
    nextEventDate?: string;
    daysToNextEvent?: number;
    historicalWinRate?: string;
    historicalAvgReturn?: string;
    tradingRule?: string;
    rvolThreshold?: number;
    isFestiveLull?: boolean;
    isFestivalHolidays?: boolean;
    isAgmRally?: boolean;
    isTaxDrain?: boolean;
    calendarYear?: number;
    bsYear?: string;
  } | null;
  rvol?: number;
}

export function FestivalSeasonalityCard({
  festivalSeason,
  rvol = 1.0,
}: FestivalSeasonalityCardProps) {
  const [showSeasonalityGuide, setShowSeasonalityGuide] = useState(false);

  // Fallback to evaluating now if not provided
  const season = festivalSeason || getAccurateFestivalSeasonality(new Date());

  const isFestiveLull = !!season.isFestiveLull;
  const isAgmRally = !!season.isAgmRally;
  const isTaxDrain = !!season.isTaxDrain;
  const isHolidays = !!season.isFestivalHolidays;

  const rvolThreshold = season.rvolThreshold || (isFestiveLull ? 1.5 : 1.0);
  const currentRvol = Number(rvol) || 1.0;
  const rvolPassed = currentRvol >= rvolThreshold;

  // Phase badge color palette
  let badgeBg = 'rgba(59, 130, 246, 0.12)';
  let badgeBorder = 'rgba(59, 130, 246, 0.35)';
  let badgeText = '#93c5fd';
  let badgeLabel = 'NEUTRAL FISCAL CYCLE';

  if (isFestiveLull) {
    badgeBg = 'rgba(239, 68, 68, 0.14)';
    badgeBorder = 'rgba(239, 68, 68, 0.4)';
    badgeText = '#fca5a5';
    badgeLabel = `🔴 PRE-DASHAIN CASH DRAIN (${season.bsYear || '2083 BS'})`;
  } else if (isHolidays) {
    badgeBg = 'rgba(245, 158, 11, 0.14)';
    badgeBorder = 'rgba(245, 158, 11, 0.4)';
    badgeText = '#fcd34d';
    badgeLabel = `🟡 FESTIVAL MARKET LULL (${season.bsYear || '2083 BS'})`;
  } else if (isAgmRally) {
    badgeBg = 'rgba(16, 185, 129, 0.15)';
    badgeBorder = 'rgba(16, 185, 129, 0.4)';
    badgeText = '#6ee7b7';
    badgeLabel = '🟢 MANGSIR AGM & DIVIDEND RALLY';
  } else if (isTaxDrain) {
    badgeBg = 'rgba(239, 68, 68, 0.14)';
    badgeBorder = 'rgba(239, 68, 68, 0.4)';
    badgeText = '#fca5a5';
    badgeLabel = '⚠️ ADVANCE CORPORATE TAX DRAIN';
  }

  const timelinePhases = [
    { key: 'PRE_DASHAIN_DRAIN', label: '🌾 Pre-Dashain Drain', months: 'Sept–Oct', bias: 'bearish' },
    { key: 'DASHAIN_HOLIDAYS', label: '🪔 Dashain / Tihar', months: 'Oct–Nov', bias: 'neutral' },
    { key: 'MANGSIR_AGM_RALLY', label: '📈 Mangsir AGM Season', months: 'Nov–Dec', bias: 'bullish' },
    { key: 'POUSH_TAX_DRAIN', label: '🏦 Poush 40% Tax', months: 'Dec–Jan', bias: 'bearish' },
    { key: 'CHAITRA_TAX_DRAIN', label: '📊 Chaitra 30% Tax', months: 'Mar–Apr', bias: 'bearish' },
    { key: 'ASHADH_SHRAWAN_SURGE', label: '🌊 Ashadh Budget Surge', months: 'Jun–Aug', bias: 'bullish' },
  ];

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(20, 24, 33, 0.95) 0%, rgba(15, 20, 28, 0.98) 100%)',
        border: isFestiveLull ? '1px solid rgba(239, 68, 68, 0.28)' : isAgmRally ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              padding: 7,
              borderRadius: 8,
              background: isFestiveLull ? 'rgba(239, 68, 68, 0.15)' : isAgmRally ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isFestiveLull ? (
              <Flame size={18} color="#ef4444" />
            ) : isAgmRally ? (
              <Sparkles size={18} color="#10b981" />
            ) : (
              <Calendar size={18} color="#60a5fa" />
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              Festival & Fiscal Seasonality Shield
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                Accurate BS Calendar
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Nepali lunar calendar liquidity cycle & banking cash flow impact
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            fontSize: 10.5,
            fontWeight: 700,
            color: badgeText,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
          }}
        >
          {badgeLabel}
        </div>
      </div>

      {/* ── Active Phase Hero Banner ── */}
      <div
        style={{
          background: isFestiveLull
            ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(30, 27, 34, 0.5) 100%)'
            : isAgmRally
            ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 30, 26, 0.5) 100%)'
            : 'rgba(255, 255, 255, 0.03)',
          borderLeft: `4px solid ${isFestiveLull ? '#ef4444' : isAgmRally ? '#10b981' : '#3b82f6'}`,
          borderRadius: '0 8px 8px 0',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
            {season.phase || 'Regular Consolidation Phase'}
          </div>
          {season.nextEventName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: '#cbd5e1',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '3px 8px',
                borderRadius: 5,
              }}
            >
              <Clock size={12} color="#fbbf24" />
              <span>
                <strong>{season.nextEventName}</strong> in{' '}
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{season.daysToNextEvent ?? 0} day(s)</span> ({season.nextEventDate})
              </span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
          {season.detail}
        </div>
      </div>

      {/* ── Key Seasonality Metrics Grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: 8,
        }}
      >
        {/* Turnover & Liquidity Impact */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            padding: '9px 11px',
          }}
        >
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={11} color="#64748b" /> Liquidity Velocity
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: isFestiveLull || isTaxDrain ? '#f87171' : isAgmRally ? '#34d399' : '#e2e8f0',
              marginTop: 3,
            }}
          >
            {isFestiveLull ? '-35% to -50% Turnover' : isTaxDrain ? 'Deposit Drain' : isAgmRally ? '+40% High Turnover' : 'Normal Equilibrium'}
          </div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>
            {isFestiveLull ? 'Festive cash withdrawal' : isTaxDrain ? 'Advance tax transfer' : isAgmRally ? 'Dividend bidding' : 'Regular banking flow'}
          </div>
        </div>

        {/* Historical Win Rate */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            padding: '9px 11px',
          }}
        >
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            {isAgmRally ? <TrendingUp size={11} color="#34d399" /> : <TrendingDown size={11} color="#f87171" />} Historical Win Rate
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: isAgmRally ? '#34d399' : isFestiveLull || isTaxDrain ? '#f87171' : '#cbd5e1',
              marginTop: 3,
            }}
          >
            {season.historicalWinRate || '50% Historical'}
          </div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>
            Avg Return: <strong>{season.historicalAvgReturn || '0.0%'}</strong>
          </div>
        </div>

        {/* Volume Hurdle Check */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: rvolPassed ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 8,
            padding: '9px 11px',
          }}
        >
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            {rvolPassed ? <CheckCircle2 size={11} color="#34d399" /> : <XCircle size={11} color="#f87171" />} RVOL Hurdle
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: rvolPassed ? '#34d399' : '#f87171',
              marginTop: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>{currentRvol.toFixed(2)}x</span>
            <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 400 }}>
              (min {rvolThreshold.toFixed(1)}x)
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: rvolPassed ? '#34d399' : '#f87171', marginTop: 2, fontWeight: 600 }}>
            {rvolPassed ? '✅ Volume Confirmed' : '⚠️ Sub-Hurdle Fakeout Risk'}
          </div>
        </div>

        {/* Quantitative Bias */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            padding: '9px 11px',
          }}
        >
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Coins size={11} color="#64748b" /> Cycle Bias
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: season.bias === 'bullish' ? '#34d399' : season.bias === 'bearish' ? '#f87171' : '#fbbf24',
              marginTop: 3,
              textTransform: 'capitalize',
            }}
          >
            {season.bias ? season.bias.replace('_', ' ') : 'Neutral'}
          </div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>
            Score bonus: <strong>{season.scoreBonus && season.scoreBonus > 0 ? `+${season.scoreBonus}` : season.scoreBonus || 0}</strong>
          </div>
        </div>
      </div>

      {/* ── Quantitative Trading Rule ── */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          borderRadius: 8,
          padding: '9px 12px',
          fontSize: 11,
          color: '#cbd5e1',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          lineHeight: 1.45,
        }}
      >
        <ShieldAlert size={15} color={isFestiveLull ? '#f87171' : isAgmRally ? '#34d399' : '#60a5fa'} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong style={{ color: '#f8fafc' }}>Quantitative Execution Directive: </strong>
          {season.tradingRule || 'Observe strict price confirmation and margin of safety.'}
        </div>
      </div>

      {/* ── Annual Seasonality Roadmap Pills ── */}
      <div>
        <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
          NEPSE Annual Liquidity Roadmap
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {timelinePhases.map(tp => {
            const isActive = season.phaseKey === tp.key;
            return (
              <div
                key={tp.key}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  background: isActive
                    ? tp.bias === 'bullish'
                      ? 'rgba(16, 185, 129, 0.25)'
                      : 'rgba(239, 68, 68, 0.25)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: isActive
                    ? tp.bias === 'bullish'
                      ? '1px solid rgba(16, 185, 129, 0.6)'
                      : '1px solid rgba(239, 68, 68, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{tp.label}</span>
                <span style={{ fontSize: 8.5, color: isActive ? '#fcd34d' : '#64748b' }}>({tp.months})</span>
                {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Expandable Mechanism Guide ── */}
      <div>
        <button
          onClick={() => setShowSeasonalityGuide(!showSeasonalityGuide)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#60a5fa',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>Why do festivals create low-volume bull traps in Nepal?</span>
          {showSeasonalityGuide ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showSeasonalityGuide && (
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: 11,
              color: '#94a3b8',
              lineHeight: 1.55,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div>
              <strong style={{ color: '#e2e8f0' }}>1. Physical Cash Drainage:</strong> Over Rs. 50–80 Arba in physical cash is withdrawn from commercial banks for Dashain bonuses, gifts, and holiday travel across the nation. This drains excess banking reserves, causing interbank call rates to spike.
            </div>
            <div>
              <strong style={{ color: '#e2e8f0' }}>2. Turnover Contraction:</strong> Retail and corporate participants pause speculative trading. NEPSE daily turnover shrinks from Rs. 4–8 Arba to Rs. 1.5–2.5 Arba.
            </div>
            <div>
              <strong style={{ color: '#e2e8f0' }}>3. The False Breakout Trap:</strong> In thin liquidity, an operator or single retail group can push a stock up +5% to +8% with modest capital. But without broad market liquidity and institutional absorption, follow-through buying never arrives, resulting in sharp mean-reversion wicks and trapped buyers.
            </div>
            <div>
              <strong style={{ color: '#e2e8f0' }}>4. The Mangsir Reversal:</strong> Once Tihar concludes, withdrawn currency flows back into banks as retail spending gets re-deposited. Concurrently, companies rush dividend declarations before Poush, creating NEPSE's highest-probability seasonal bull rally.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
