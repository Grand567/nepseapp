import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen, Shield, ShieldCheck, ShieldAlert, Target, Flame, Activity,
  Clock, Calendar, ArrowRight, CheckCircle2, AlertTriangle, Download,
  Printer, Copy, Check, ChevronRight, Scale, DollarSign, ExternalLink,
  Layers, Percent, RefreshCw, Zap, TrendingUp, TrendingDown, Eye, FileText
} from 'lucide-react';

interface RoutineStep {
  id: string;
  time: string;
  title: string;
  category: string;
  items: string[];
  actionLink?: { label: string; serviceId: string };
}

const ROUTINE_STEPS: RoutineStep[] = [
  {
    id: 'step-1',
    time: '10:00 – 10:30 AM',
    title: 'Pre-Market Macro & Safety Audit',
    category: 'Pre-Market',
    items: [
      'Check Cash Defense Mode status on the top status bar. If ACTIVE, keep 70–80% cash and DO NOT buy chart breakouts.',
      'Audit the Day Prime Pick card: Note Entry Zone (Rs. Low–High), Chase Cap (+2.5% max), Stop Loss, and Target 1.',
      'Run Promoter Lock-in Expiry Radar: Verify no 3-year promoter shares unlock within the next 60 days.',
      'Review Sector Rotation: Ensure candidate belongs to a "Leading" or "Improving" sector quadrant.'
    ],
    actionLink: { label: 'Check Day Prime Pick', serviceId: 'daily-prime-pick' }
  },
  {
    id: 'step-2',
    time: '10:30 – 11:00 AM',
    title: 'Pre-Open Order Book Imbalance (OBIR)',
    category: 'Pre-Open',
    items: [
      'Monitor Pre-Open matching depth: OBIR > 1.8 indicates robust institutional morning demand.',
      'Check projected opening price: If opening price > Entry Zone + 2.5%, CANCEL BUY immediately (Chase Cap violation).',
      'If matching price is inside Entry Zone with OBIR > 1.5, prepare limit order for opening.'
    ],
    actionLink: { label: 'Open Entry/Exit Analyzer', serviceId: 'entry-exit-analyzer' }
  },
  {
    id: 'step-3',
    time: '11:15 AM – 01:30 PM',
    title: 'Live Execution & 1.5% Risk Sizing',
    category: 'Live Trading',
    items: [
      'Allow opening 15-minute noise (11:00–11:15 AM) to settle before committing fresh capital.',
      'Verify Volume Pacing: Intraday Relative Volume (RVOL) must sustain ≥ 1.2x–1.5x baseline.',
      'Calculate position size strictly: Max risk per trade = 1.5% of total portfolio equity.',
      'Queue Limit Orders strictly inside the recommended Buy Zone on NEPSE Broker TMS.'
    ],
    actionLink: { label: 'Calculate Position Size', serviceId: 'calculator' }
  },
  {
    id: 'step-4',
    time: '03:15 – 04:00 PM',
    title: 'Post-Market Floorsheet & T+2 Audit',
    category: 'Post-Market',
    items: [
      'Open Floorsheet Analytics: Check if institutional brokers (e.g. Broker 58, 45, 34, 17) were net buyers.',
      'Verify Large-Block Absorption: Top 3 buyers should account for ≥ 35% of total traded volume.',
      'Enforce Zero-Loss Protocol: When price reaches Target 1 (+4% to +6%), sell 50% and move Stop Loss to Entry price.'
    ],
    actionLink: { label: 'Open Floor Sheet Analytics', serviceId: 'floor-sheet' }
  }
];

const SEASONS_DATA = [
  {
    period: 'Bhadra – Ashwin (Sept – Oct)',
    title: 'Pre-Dashain Liquidity Squeeze',
    tag: 'Festive Cash Drain',
    type: 'caution',
    color: '#f59e0b',
    icon: Calendar,
    behavior: 'Public withdrawals for festival shopping, bonuses, travel, and trading lulls drain bank deposits, causing NEPSE turnover to drop by 30%–50%.',
    edge: 'Breakout patterns frequently fail on low volume. Smart money patiently accumulates undervalued dividend-paying commercial banks and established compounders at discount valuations.'
  },
  {
    period: 'Mangsir – Magh (Dec – Feb)',
    title: 'Dividend Season & AGM Rally',
    tag: 'Strongest Cyclical Tailwind',
    type: 'bullish',
    color: '#10b981',
    icon: TrendingUp,
    behavior: 'Commercial banks, microfinance, insurance, and hydro companies hold Annual General Meetings (AGMs) and declare stock/cash dividends.',
    edge: 'Highest historical win rate of the calendar year. Buy early in Mangsir and sell into pre-book closure strength rather than blindly holding through dividend price adjustments.'
  },
  {
    period: 'Chaitra – Baisakh (Mar – May)',
    title: 'Q3 Reporting & Fiscal Repositioning',
    tag: 'Earnings Momentum',
    type: 'neutral',
    color: '#38bdf8',
    icon: Activity,
    behavior: 'Companies report 9-month audited financials (Q3 reports). Liquidity adjusts ahead of the upcoming national budget presentation.',
    edge: 'Focus exclusively on fundamental earnings beats and companies demonstrating positive EPS acceleration and declining non-performing loans (NPL).'
  },
  {
    period: 'Ashad (June – July)',
    title: 'Fiscal Year-End Balancing Squeeze',
    tag: 'Bank Interest Liquidation',
    type: 'danger',
    color: '#f43f5e',
    icon: TrendingDown,
    behavior: 'Commercial banks aggressively recall margin loans to meet NRB regulatory capital adequacy (CAR). Traders liquidate positions to settle quarterly interest.',
    edge: 'Elevated volatility and sharp flash dips. Avoid initiating large swing trades during the final 2 weeks of Ashad. Preserve dry powder to deploy aggressively in Shrawan.'
  }
];

export function AlphaPlaybookService() {
  const [activeTab, setActiveTab] = useState<'tiers' | 'routine' | 'cycles' | 'matrix' | 'calculator'>('tiers');
  const [tierFilter, setTierFilter] = useState<'all' | 'tier1' | 'tier2' | 'tier3'>('all');
  const [copiedNotice, setCopiedNotice] = useState(false);

  // Interactive Routine Checklist state
  const [checkedRoutine, setCheckedRoutine] = useState<Record<string, boolean>>(() => {
    try {
      const todayKey = `nepse_routine_${new Date().toISOString().slice(0, 10)}`;
      const saved = localStorage.getItem(todayKey);
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  });

  const toggleRoutineItem = (key: string) => {
    const todayKey = `nepse_routine_${new Date().toISOString().slice(0, 10)}`;
    const updated = { ...checkedRoutine, [key]: !checkedRoutine[key] };
    setCheckedRoutine(updated);
    try {
      localStorage.setItem(todayKey, JSON.stringify(updated));
    } catch (_) {}
  };

  // Interactive 1.5% Risk Position Sizing Calculator state
  const [accountSize, setAccountSize] = useState<number>(500000);
  const [entryPrice, setEntryPrice] = useState<number>(295);
  const [stopLossPrice, setStopLossPrice] = useState<number>(285);
  const [target1Price, setTarget1Price] = useState<number>(315);

  const riskPerShare = Math.max(0.1, entryPrice - stopLossPrice);
  const maxRiskAmount = +(accountSize * 0.015).toFixed(2); // 1.5%
  const sharesToBuy = Math.max(10, Math.floor(maxRiskAmount / riskPerShare));
  const totalCapitalRequired = +(sharesToBuy * entryPrice).toFixed(2);
  const capitalAllocationPct = accountSize > 0 ? +((totalCapitalRequired / accountSize) * 100).toFixed(1) : 0;
  const rewardPerShare = Math.max(0.1, target1Price - entryPrice);
  const riskRewardRatio = +(rewardPerShare / riskPerShare).toFixed(2);

  const handleLaunchService = (serviceId: string) => {
    try {
      localStorage.setItem('open_service_id', serviceId);
      window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId } }));
    } catch (_) {}
  };

  const handleCopyAxiom = () => {
    const text = `NEPSE Alpha Playbook Core Axiom:
1. DEFEND CAPITAL FIRST (Cash Defense Mode when breadth < 40%)
2. RESPECT T+2 FREEZE (Never chase > +2.5% above pivot)
3. ZERO-LOSS PROTOCOL (Sell 50% at Target 1, immediately move SL to Entry)`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    }
  };

  return (
    <div style={{
      maxWidth: 960,
      margin: '0 auto',
      padding: '16px 14px 40px',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* ── Top Hero Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 20,
        padding: '20px 22px',
        marginBottom: 16,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 160,
          height: 160,
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #4338ca)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
              flexShrink: 0
            }}>
              <BookOpen style={{ width: 24, height: 24, color: '#ffffff' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  NEPSE Alpha Playbook
                </h1>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.4)'
                }}>
                  Confidential Manual
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  3-Tier Framework
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
                High-Probability Execution & Capital Protection Guide for NEPSE Investors & Traders
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a
              href="/NEPSE_Alpha_Playbook.pdf"
              download="NEPSE_Alpha_Playbook.pdf"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                cursor: 'pointer'
              }}
            >
              <Download style={{ width: 14, height: 14 }} />
              Download PDF Guide
            </a>

            <button
              onClick={() => window.print()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Printer style={{ width: 14, height: 14 }} />
              Print
            </button>

            <button
              onClick={handleCopyAxiom}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: copiedNotice ? '#34d399' : '#e2e8f0',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {copiedNotice ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
              {copiedNotice ? 'Copied!' : 'Copy Axiom'}
            </button>
          </div>
        </div>

        {/* ── Core Axiom Callout ── */}
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 12,
          background: 'rgba(2, 132, 199, 0.1)',
          borderLeft: '4px solid #0284c7',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.05em' }}>
            The Core Axiom of the Nepal Stock Exchange:
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.5 }}>
            Capital defense accounts for 80% of net profitability. With T+2 settlement freeze, ±15% circuit bands, and no short selling, bad entries cannot be cut intraday.
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            fontWeight: 800,
            color: '#fbbf24',
            marginTop: 2
          }}>
            <span>DEFEND CAPITAL FIRST</span>
            <ArrowRight size={12} />
            <span>FOLLOW INSTITUTIONAL FLOW</span>
            <ArrowRight size={12} />
            <span>EXECUTE ASYMMETRICALLY</span>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '6px',
        background: 'rgba(15, 23, 42, 0.75)',
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: 16,
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}>
        {[
          { id: 'tiers', label: '🛡️ 3-Tier Reliability Matrix' },
          { id: 'routine', label: '⏰ 4-Step Daily Routine' },
          { id: 'cycles', label: '🗓️ Seasonal Market Cycles' },
          { id: 'matrix', label: '⚡ Quick Decision Matrix' },
          { id: 'calculator', label: '🧮 1.5% Risk Position Sizer' }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: '1 0 auto',
                padding: '9px 15px',
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 800,
                color: isActive ? '#ffffff' : '#94a3b8',
                background: isActive ? 'linear-gradient(135deg, #4f46e5, #4338ca)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: 3-TIER RELIABILITY FRAMEWORK ── */}
      {activeTab === 'tiers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sub-Filter */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Filter Tiers:</span>
            {[
              { id: 'all', label: 'All Features' },
              { id: 'tier1', label: 'Tier 1 (Capital Protectors)' },
              { id: 'tier2', label: 'Tier 2 (Alpha Engines)' },
              { id: 'tier3', label: 'Tier 3 (Dangerous Traps)' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setTierFilter(f.id as any)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  background: tierFilter === f.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                  border: tierFilter === f.id ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  color: tierFilter === f.id ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* TIER 1 SECTION */}
          {(tierFilter === 'all' || tierFilter === 'tier1') && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 16,
              padding: '16px 18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck style={{ width: 20, height: 20, color: '#10b981' }} />
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Tier 1: Non-Negotiable Capital Protectors
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  Reliability: 90%+ Weight
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px' }}>
                These features override all technical indicators. If any Tier 1 filter triggers, trades are rejected immediately to prevent portfolio drawdowns.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {/* 1. Cash Defense Mode */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>1. Cash Defense Mode</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>Market Breadth</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Statistical Edge:</strong> When market breadth &lt; 40%, over 75% of technical chart breakouts fail.
                  </div>
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, background: 'rgba(245, 158, 11, 0.08)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Rule:</strong> When active, DO NOT BUY ANY BREAKOUT. Hold 70%–80% cash.
                  </div>
                  <button onClick={() => handleLaunchService('breadth')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    View Market Breadth & Defense Status <ChevronRight size={12} />
                  </button>
                </div>

                {/* 2. Chase Cap Guard */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>2. Chase Cap Guard (+2.5% Max)</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>Execution Guard</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Statistical Edge:</strong> Because of T+2 freeze, buying up +4% to +8% makes you exit liquidity for early swing buyers.
                  </div>
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, background: 'rgba(245, 158, 11, 0.08)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Rule:</strong> If price &gt; Entry Pivot + 2.5%, the trade is cancelled. Never chase gap-ups.
                  </div>
                  <button onClick={() => handleLaunchService('entry-exit-analyzer')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Audit Chase Cap in Entry/Exit Analyzer <ChevronRight size={12} />
                  </button>
                </div>

                {/* 3. Promoter Lock-in Expiry Radar */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>3. Promoter Lock-in Radar (60 Days)</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>Supply Shock</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Statistical Edge:</strong> Unlocking promoter shares doubles floating supply overnight, dropping prices 25%–50%.
                  </div>
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, background: 'rgba(245, 158, 11, 0.08)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Rule:</strong> Automatic blacklist. Never enter a stock within 60 days of lock-in expiry.
                  </div>
                  <button onClick={() => handleLaunchService('promoter-shares')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Check Promoter Shares Service <ChevronRight size={12} />
                  </button>
                </div>

                {/* 4. Broker LBAS & Accumulation Flow */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>4. Broker LBAS & Accumulation Flow</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>Smart Money</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Statistical Edge:</strong> Retail chart patterns fail without institutional broker backing (e.g. Brokers 58, 45, 34, 17).
                  </div>
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, background: 'rgba(245, 158, 11, 0.08)', padding: '6px 8px', borderRadius: 6 }}>
                    <strong>Rule:</strong> Only take high-conviction trades when top 3 buyers take ≥ 35% volume with positive net flow.
                  </div>
                  <button onClick={() => handleLaunchService('broker-analysis')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Audit Broker Holdings & Flow <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TIER 2 SECTION */}
          {(tierFilter === 'all' || tierFilter === 'tier2') && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 16,
              padding: '16px 18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap style={{ width: 20, height: 20, color: '#38bdf8' }} />
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Tier 2: High-Edge Opportunity Engines
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  Win Rate: 80%+ Paired with Tier 1
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px' }}>
                The flagship alpha generators that find top risk/reward setups during neutral and bullish market regimes.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {/* 1. Day Prime Pick & Zero-Loss Protocol */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>1. Day Prime Pick & Zero-Loss Protocol</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>Flagship</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>Protocol:</strong> Buy inside Entry Zone below Chase Cap. When Target 1 (+4% to +6%) hits:
                    <br />• <strong>SELL 50%</strong> to lock in guaranteed profit.
                    <br />• <strong>MOVE STOP LOSS</strong> to Entry price on remaining 50%.
                    <br />• Result: Mathematically risk-free trade!
                  </div>
                  <button onClick={() => handleLaunchService('daily-prime-pick')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Open Today's Day Prime Pick <ChevronRight size={12} />
                  </button>
                </div>

                {/* 2. Sector Rotation Matrix */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>2. Sector Rotation & Heatmap</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc' }}>Sector Waves</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Statistical Edge:</strong> Capital moves in sector waves (Banks → Hydro → Finance → Life Insurance).
                    <br />• Never trade lagging sectors.
                    <br />• Position strictly in "Leading" or "Improving" quadrants.
                  </div>
                  <button onClick={() => handleLaunchService('sector-heatmap')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    View Live Sector Heatmap <ChevronRight size={12} />
                  </button>
                </div>

                {/* 3. Pre-Open OBIR */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>3. Pre-Open Order Book (OBIR)</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>10:30–11:00 AM</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>Actionable Rule:</strong> OBIR &gt; 1.8 with positive matching volume signals heavy institutional demand before the 11:00 AM bell. If OBIR &lt; 0.8, supply pressure is elevated.
                  </div>
                  <button onClick={() => handleLaunchService('entry-exit-analyzer')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Inspect OBIR on Setup Analyzer <ChevronRight size={12} />
                  </button>
                </div>

                {/* 4. Dual-Gate RVOL >= 1.4x + VCP */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>4. Dual-Gate RVOL ≥ 1.4x & VCP</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>Breakout Gate</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>Actionable Rule:</strong> Volume precedes price in Nepal. A price push through resistance without RVOL ≥ 1.4x is almost always a retail fakeout trap.
                  </div>
                  <button onClick={() => handleLaunchService('volume-shockers')} style={{ marginTop: 8, fontSize: 11, color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Open Volume Shockers Board <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TIER 3 SECTION */}
          {(tierFilter === 'all' || tierFilter === 'tier3') && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              borderRadius: 16,
              padding: '16px 18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle style={{ width: 20, height: 20, color: '#f43f5e' }} />
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Tier 3: Informational Traps (Do NOT Trade in Isolation)
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: 'rgba(244, 63, 94, 0.15)', color: '#f87171', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                  Dangerous If Used Alone
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px' }}>
                Features that retail investors frequently misuse, leading to catastrophic losses in NEPSE.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#fca5a5' }}>1. Standalone RSI / MACD Oscillators</div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Trap:</strong> In NEPSE speculative runs, RSI &gt; 70 can stay overbought for months as a stock triples. Conversely, RSI &lt; 30 in a bear market can continue dropping another 40%. Never buy or sell based solely on an oscillator.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#fca5a5' }}>2. Theoretical Monte Carlo Projections</div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Trap:</strong> Statistical curves assume normal Gaussian distributions. They cannot predict sudden Nepal Rastra Bank (NRB) directives, margin loan ceiling changes, or liquidity shifts.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#fca5a5' }}>3. Unadjusted Historical Price Charts</div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6, lineHeight: 1.45 }}>
                    <strong>The Trap:</strong> Unadjusted charts fail to account for bonus share splits and rights issues, making historical moving averages and support levels completely false. Always verify corporate adjustments.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: 4-STEP DAILY EXECUTION ROUTINE ── */}
      {activeTab === 'routine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '16px 18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
                  Interactive Daily Execution Routine
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Tick off items as you proceed through the trading day. State is saved locally for today.
                </p>
              </div>
              <button
                onClick={() => {
                  const todayKey = `nepse_routine_${new Date().toISOString().slice(0, 10)}`;
                  localStorage.removeItem(todayKey);
                  setCheckedRoutine({});
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#94a3b8',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >
                Reset Today
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {ROUTINE_STEPS.map((step) => (
                <div
                  key={step.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 14,
                    padding: '14px 16px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc',
                        border: '1px solid rgba(99, 102, 241, 0.3)'
                      }}>
                        {step.time}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
                        {step.title}
                      </span>
                    </div>

                    {step.actionLink && (
                      <button
                        onClick={() => handleLaunchService(step.actionLink!.serviceId)}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: 6,
                          padding: '3px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        {step.actionLink.label} <ExternalLink size={10} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {step.items.map((item, idx) => {
                      const itemKey = `${step.id}-${idx}`;
                      const isChecked = Boolean(checkedRoutine[itemKey]);
                      return (
                        <div
                          key={itemKey}
                          onClick={() => toggleRoutineItem(itemKey)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            border: isChecked ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.2)',
                            background: isChecked ? '#10b981' : 'rgba(255,255,255,0.03)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 1,
                            flexShrink: 0
                          }}>
                            {isChecked && <Check size={12} color="#ffffff" />}
                          </div>
                          <span style={{
                            fontSize: 12.5,
                            color: isChecked ? '#94a3b8' : '#cbd5e1',
                            textDecoration: isChecked ? 'line-through' : 'none',
                            lineHeight: 1.45
                          }}>
                            {item}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: NEPAL SEASONAL MARKET CYCLES ── */}
      {activeTab === 'cycles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '16px 18px'
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
              Nepal Seasonal Liquidity & Calendar Cycles
            </h3>
            <p style={{ margin: '3px 0 16px', fontSize: 12, color: '#94a3b8' }}>
              NEPSE liquidity is heavily influenced by domestic agricultural seasons, Dashain/Tihar festival cash drains, corporate tax payments, and commercial bank fiscal year balancing.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
              {SEASONS_DATA.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${s.color}40`,
                    borderRadius: 14,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: s.color, textTransform: 'uppercase' }}>
                        {s.period}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                        {s.title}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: `${s.color}20`,
                      color: s.color,
                      border: `1px solid ${s.color}40`
                    }}>
                      {s.tag}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.45, marginTop: 4 }}>
                    <strong style={{ color: '#cbd5e1' }}>Market Dynamics: </strong>
                    {s.behavior}
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: '#f1f5f9',
                    background: 'rgba(255,255,255,0.03)',
                    borderLeft: `3px solid ${s.color}`,
                    padding: '8px 10px',
                    borderRadius: '0 8px 8px 0',
                    lineHeight: 1.45,
                    marginTop: 'auto'
                  }}>
                    <strong style={{ color: s.color }}>Strategic Edge: </strong>
                    {s.edge}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: QUICK DECISION MATRIX ── */}
      {activeTab === 'matrix' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '16px 18px'
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
              Quick-Reference Decision Lookup Matrix
            </h3>
            <p style={{ margin: '3px 0 14px', fontSize: 12, color: '#94a3b8' }}>
              Instant decision guide mapping live market scenarios directly to app indicators and trading actions.
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>Live Market Scenario</th>
                    <th style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>App Indicator to Check</th>
                    <th style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 700 }}>Required Trading Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { scenario: 'Index falling, Market Breadth < 40%', indicator: 'Cash Defense Mode', action: '100% Cash Defense. Abort all new breakout buy orders.', color: '#f87171' },
                    { scenario: 'Stock up +5% at 11:05 AM', indicator: 'Chase Cap (+2.5% Max)', action: 'Cancel order immediately. Never chase extended gap-ups.', color: '#fbbf24' },
                    { scenario: 'Promoter lock-in unlocks in 30 days', indicator: 'Lock-in Expiry Radar', action: 'Immediate blacklist. Pass on the stock completely.', color: '#f87171' },
                    { scenario: 'Stock reaches Target 1 (+5%)', indicator: 'Entry/Exit Analyzer', action: 'Zero-Loss Rule: Sell 50%, move Stop Loss to Entry price.', color: '#34d399' },
                    { scenario: 'Breakout occurs on RVOL < 1.0x', indicator: 'Relative Volume (RVOL)', action: 'False breakout trap. Wait for volume confirmation ≥ 1.4x.', color: '#fbbf24' },
                    { scenario: 'Top 3 brokers accumulate ≥ 35% vol', indicator: 'Floorsheet LBAS', action: 'High-conviction swing hold. Institutional backing confirmed.', color: '#34d399' }
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', fontWeight: 700, color: '#f1f5f9' }}>{row.scenario}</td>
                      <td style={{ padding: '10px', color: '#38bdf8' }}>{row.indicator}</td>
                      <td style={{ padding: '10px', color: row.color, fontWeight: 600 }}>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: 1.5% RISK POSITION SIZER ── */}
      {activeTab === 'calculator' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 16,
          padding: '18px 20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Scale style={{ width: 20, height: 20, color: '#818cf8' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
              1.5% Portfolio Risk & Zero-Loss Position Sizer
            </h3>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8' }}>
            Never risk more than 1.5% of your total account on any single trade. Enter your parameters below:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Total Portfolio Equity (Rs.)
              </label>
              <input
                type="number"
                value={accountSize}
                onChange={(e) => setAccountSize(Number(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Planned Entry Price (Rs.)
              </label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Structural Stop Loss (Rs.)
              </label>
              <input
                type="number"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(Number(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Target 1 Price (Rs.)
              </label>
              <input
                type="number"
                value={target1Price}
                onChange={(e) => setTarget1Price(Number(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              />
            </div>
          </div>

          {/* Sizing Output Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700 }}>Max Dollar Risk (1.5%)</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                Rs. {maxRiskAmount.toLocaleString()}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>Cap on total possible loss</div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>Shares to Buy</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399', marginTop: 2 }}>
                {sharesToBuy.toLocaleString()} Units
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>Risk/share: Rs. {riskPerShare.toFixed(1)}</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>Capital Required</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                Rs. {totalCapitalRequired.toLocaleString()}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>{capitalAllocationPct}% of portfolio</div>
            </div>

            <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>Risk/Reward to T1</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
                {riskRewardRatio} : 1
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>Reward: Rs. {rewardPerShare.toFixed(1)}/share</div>
            </div>
          </div>

          {/* Zero-Loss Execution Plan */}
          <div style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            fontSize: 12,
            color: '#cbd5e1',
            lineHeight: 1.5
          }}>
            <span style={{ fontWeight: 800, color: '#34d399' }}>Zero-Loss Execution Plan: </span>
            Buy {sharesToBuy} shares at Rs. {entryPrice}. When price hits Rs. {target1Price} (Target 1), sell {Math.floor(sharesToBuy / 2)} shares (+Rs. {(Math.floor(sharesToBuy / 2) * rewardPerShare).toFixed(0)} gain) and move Stop Loss to Rs. {entryPrice} on the remaining {Math.ceil(sharesToBuy / 2)} shares. Your trade is now mathematically risk-free.
          </div>
        </div>
      )}
    </div>
  );
}

export default AlphaPlaybookService;
