import React, { useState } from 'react';
import {
  ExternalLink, BookOpen, Search, ArrowRight, ShieldAlert,
  Flame, Zap, Award, Crown, Radio, Compass, Layers, Activity,
  Shield, ArrowLeftRight, TrendingUp, Users, BarChart3, Building,
  Lock, PieChart, DollarSign, Table, CheckCircle2, ShoppingCart,
  Check, Sparkles, Sliders, ChevronRight
} from 'lucide-react';

export default function Resources({ onNavigateTab }) {
  const [activeSuite, setActiveSuite] = useState('traders_zone'); // 'traders_zone' | 'premium' | 'directory'
  const [searchBroker, setSearchBroker] = useState('');

  // ── Trader's Zone Features (Image 1) ──
  const tradersZoneFeatures = [
    { name: 'Breakout Stocks', desc: 'Stocks clearing 20-day high with volume >2.5x & float absorption', icon: Flame, color: '#f43f5e', tag: 'High Momentum' },
    { name: 'Consolidating Stocks', desc: 'Volatility compression & tight range building energy for breakout', icon: Layers, color: '#38bdf8', tag: 'Squeeze Radar' },
    { name: 'Volume Shockers', desc: 'Unusual trading volume surges relative to 20D baseline and float turnover', icon: Zap, color: '#eab308', tag: 'Volume Surge' },
    { name: 'Fresh Indicator Signals', desc: 'Fresh MACD Golden Cross, RSI <35 oversold bounce, 20 EMA crosses', icon: Activity, color: '#14b8a6', tag: 'Reversal Alerts' },
    { name: 'Technical Ratings', desc: 'Multi-indicator quantitative score (0-100) with Strong Buy/Sell signals', icon: Award, color: '#10b981', tag: 'Quant Model' },
    { name: 'Support and Resistance', desc: 'Automated Pivot Points (S1/S2/S3 & R1/R2/R3) with proximity %', icon: Shield, color: '#6366f1', tag: 'Key Levels' },
    { name: 'Players Choices', desc: 'Scrips where top 3 brokers account for >55% of volume & absorb float', icon: Crown, color: '#8b5cf6', tag: 'Whale Accumulation' },
    { name: 'Unusual Trades', desc: 'High block trade frequency (>10,000 units) with high float impact', icon: ArrowLeftRight, color: '#f59e0b', tag: 'Smart Flow' },
    { name: 'Circuit Setup', desc: 'Stocks within 2-3% of ±10% limit with >80% buy/sell depth imbalance', icon: Radio, color: '#06b6d4', tag: 'Limit Radar' },
    { name: 'Relative Strength', desc: 'Alpha score measuring stock outperformance relative to NEPSE index', icon: TrendingUp, color: '#10d98a', tag: 'Leaderboard' },
    { name: 'Candlestick Patterns', desc: 'Automated recognition of Bullish Engulfing, Morning Star, Hammer', icon: Compass, color: '#ec4899', tag: 'Price Action' },
  ];

  // ── AD FREE + PREMIUM Features (Image 2) ──
  const premiumFeatures = [
    { name: 'Broker Analysis', desc: 'Broker 1-60 daily turnover, net buy/sell flow & top 5 scrips', icon: Users, color: '#6366f1', tag: 'Broker Flow' },
    { name: 'Broker Favourites', desc: 'Stocks most heavily accumulated by top institutional brokerages', icon: Crown, color: '#ef4444', tag: 'Smart Money' },
    { name: 'Stockwise Analysis', desc: '360° deep dive technical, fundamental, and float absorption profile', icon: BarChart3, color: '#38bdf8', tag: 'Deep Dive' },
    { name: 'Hot Stocks', desc: 'High Float Turnover Rate + Bullish Momentum + Positive Net Flow', icon: Flame, color: '#f43f5e', tag: 'High Flow' },
    { name: 'Stocks By Market Cap', desc: 'Large Cap (>Rs 20B), Mid Cap (Rs 5B-20B), Small Cap (<Rs 5B)', icon: Building, color: '#3b82f6', tag: 'Cap Sizer' },
    { name: 'Advanced Charts', desc: 'TradingView integration & full-screen landscape interactive charting', icon: TrendingUp, color: '#10b981', tag: 'Pro Charts' },
    { name: 'Promoter Shares Unlock', desc: 'Promoter, Local Resident & Mutual Fund 3-year lock-in expiry calendar', icon: Lock, color: '#f59e0b', tag: 'Dilution Alert' },
    { name: 'Mutual Funds Unlock', desc: 'Closed & open-end MF Net Asset Values (NAV) & top equity holdings', icon: PieChart, color: '#06b6d4', tag: 'Fund Radar' },
    { name: 'Dividend Kings', desc: 'Multi-year dividend consistency, bonus share % & dividend yield rankings', icon: Crown, color: '#eab308', tag: 'Compounding' },
    { name: 'Price vs Volume', desc: 'Volume Spread Analysis (VSA) — High-volume expansion & absorption', icon: DollarSign, color: '#a855f7', tag: 'VSA Signals' },
    { name: 'Fundamentals Pro', desc: 'Multi-quarter EPS, PE, Book Value, ROE, Graham Number, Debt-to-Equity', icon: Award, color: '#10b981', tag: 'Valuation' },
    { name: 'Zero Sum Floorsheet', desc: 'Real-time bilateral broker matching & institutional absorption matrix', icon: Table, color: '#8b5cf6', tag: 'Trade Match' },
  ];

  // Nepal Brokers TMS Directory
  const brokers = [
    { number: 58, name: "Naasa Securities Co. Ltd." },
    { number: 45, name: "Imperial Securities Co. Pvt. Ltd." },
    { number: 34, name: "Vision Securities Pvt. Ltd." },
    { number: 49, name: "Online Securities Ltd." },
    { number: 28, name: "Shree Krishna Securities Ltd." },
    { number: 38, name: "Dipshikha Dhitopatra Karobar Co." },
    { number: 57, name: "Aryatara Investment & Securities" },
    { number: 44, name: "Dynamic Money Managers Securities" },
    { number: 14, name: "Nepal Stock House Pvt. Ltd." },
    { number: 33, name: "Dakshinkali Investment & Securities" },
    { number: 19, name: "Nepal Investment & Securities Pvt." },
    { number: 64, name: "Sani Securities Company Ltd." },
    { number: 4,  name: "Opal Securities Investment Pvt." },
    { number: 32, name: "Premier Securities Company Ltd." },
    { number: 47, name: "Nivana Capital Market Pvt. Ltd." },
    { number: 10, name: "Pragyan Securities Pvt. Ltd." },
    { number: 22, name: "Siprabi Securities Pvt. Ltd." },
    { number: 1,  name: "Kumari Securities Pvt. Ltd." }
  ];

  const filteredBrokers = brokers.filter(
    b => b.name.toLowerCase().includes(searchBroker.toLowerCase()) || 
         b.number.toString().includes(searchBroker)
  );

  return (
    <div style={{ padding: 16 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Sparkles style={{ width: 22, height: 22, color: '#f59e0b' }} /> Feature Suites & Intelligence
        </h2>
        <span style={{ fontSize: 10.5, fontWeight: 800, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          50+ TOOLS
        </span>
      </div>

      {/* Main Suite Toggle Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveSuite('traders_zone')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 800,
            background: activeSuite === 'traders_zone' ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'transparent',
            color: activeSuite === 'traders_zone' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          🎯 Trader's Zone
        </button>
        <button
          onClick={() => setActiveSuite('analytics')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 800,
            background: activeSuite === 'analytics' || activeSuite === 'premium' ? 'linear-gradient(135deg, #38bdf8, #6366f1)' : 'transparent',
            color: activeSuite === 'analytics' || activeSuite === 'premium' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          📊 Market Analytics
        </button>
        <button
          onClick={() => setActiveSuite('directory')}
          style={{
            flex: 0.8, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 800,
            background: activeSuite === 'directory' ? 'var(--primary)' : 'transparent',
            color: activeSuite === 'directory' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          📖 Portals
        </button>
      </div>

      {/* SUITE 1: TRADER'S ZONE (MATCHING IMAGE 1) */}
      {activeSuite === 'traders_zone' && (
        <div style={{ animation: 'fadeIn 0.25s ease' }}>
          {/* Header Card */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.06))', borderColor: 'rgba(168,85,247,0.3)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Flame style={{ width: 20, height: 20, color: '#ec4899' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Trader's Zone</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Complete suite breakdown and package details</div>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 0' }}>
              Best Package for Active NEPSE Traders. All institutional scanner systems, relative strength ratings, and circuit setups are active and unlocked.
            </p>
          </div>

          {/* 11 Features Grid with Checkmarks matching Image 1 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              FEATURES INCLUDED ({tradersZoneFeatures.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {tradersZoneFeatures.map(f => {
                const Icon = f.icon;
                return (
                  <div key={f.name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--bull)', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>{f.name}</span>
                          <span style={{ fontSize: 9.5, background: `${f.color}20`, color: f.color, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            {f.tag}
                          </span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{f.desc}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Package Pricing Breakdown Cards matching Image 1 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              AVAILABLE DURATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>1 Year Access</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Full Trader's Zone Suite</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>Rs 2500</div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--bull)', background: 'rgba(16,217,138,0.15)', padding: '2px 6px', borderRadius: 4 }}>SAVE 50%</span>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>6 Months Access</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Semi-annual pass</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>Rs 1750</div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--bull)', background: 'rgba(16,217,138,0.15)', padding: '2px 6px', borderRadius: 4 }}>SAVE 50%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUITE 2: MARKET ANALYTICS */}
      {(activeSuite === 'analytics' || activeSuite === 'premium') && (
        <div style={{ animation: 'fadeIn 0.25s ease' }}>
          {/* Header Card */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(99, 102, 241, 0.06))', borderColor: 'rgba(56, 189, 248, 0.3)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles style={{ width: 20, height: 20, color: '#38bdf8' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Market Analytics Suite</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Complete suite breakdown and analytical features</div>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 0' }}>
              Full institutional broker analytics, float tracking, lock-in calendars, dividend leaderboards, and zero-sum floorsheet.
            </p>
          </div>

          {/* 12 Features Grid */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              FEATURES INCLUDED ({premiumFeatures.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {premiumFeatures.map(f => (
                <div key={f.name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--bull)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>{f.name}</span>
                        <span style={{ fontSize: 9.5, background: `${f.color}20`, color: f.color, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          {f.tag}
                        </span>
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{f.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Package Pricing Breakdown Cards matching Image 2 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              AVAILABLE DURATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>1 Year Ad-Free + Pro</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Complete institutional access</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>Rs 800</div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--bull)', background: 'rgba(16,217,138,0.15)', padding: '2px 6px', borderRadius: 4 }}>SAVE 29%</span>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>6 Months Ad-Free + Pro</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Semi-annual pass</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>Rs 560</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUITE 3: PORTALS & BROKER TMS DIRECTORY */}
      {activeSuite === 'directory' && (
        <div style={{ animation: 'fadeIn 0.25s ease' }}>
          {/* Free Portals Grid */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Free Nepal Financial Portals</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <a href="https://meroshare.cdsc.com.np/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--primary-light)' }}>🔑 MeroShare Portal</span>
                  <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Calculate WACC, apply for IPOs, transfer shares via EDIS.</span>
              </a>
              <a href="https://iporesult.cdsc.com.np/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--bull)' }}>🎯 IPO Result Checker</span>
                  <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Fastest public lookup for CDSC allotment results.</span>
              </a>
              <a href="https://www.sharesansar.com/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>📰 ShareSansar News</span>
                  <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Track market dividends, corporate announcements, IPO dates.</span>
              </a>
              <a href="https://nepsealpha.com/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--accent-violet)' }}>📊 NepseAlpha Charts</span>
                  <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Advanced technical charting and live market heatmaps.</span>
              </a>
            </div>
          </div>

          {/* Broker TMS Directory */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 4, color: 'var(--text-primary)' }}>Broker TMS Logins</h3>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 12 }}>Direct links to Trade Management System (TMS) portals.</p>
            
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search by Broker Name or Number..."
                value={searchBroker}
                onChange={(e) => setSearchBroker(e.target.value)}
                className="input"
                style={{ paddingLeft: 36 }}
              />
              <Search style={{ width: 16, height: 16, color: 'var(--text-muted)', position: 'absolute', left: 12, top: 14 }} />
            </div>

            {/* List of brokers */}
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              {filteredBrokers.map((broker, idx) => (
                <div key={broker.number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: idx === filteredBrokers.length - 1 ? 'none' : '1px solid var(--border)' }}>
                  <div>
                    <span className="badge badge-primary" style={{ marginRight: 8 }}>TMS #{broker.number}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{broker.name}</span>
                  </div>
                  <a 
                    href={`https://tms${broker.number}.nepse.com.np/`} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ padding: 6, background: 'var(--primary-subtle)', border: '1px solid rgba(91,94,244,0.2)', borderRadius: 8, color: 'var(--primary-light)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <ExternalLink style={{ width: 14, height: 14 }} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
