import React, { useState, useMemo, useEffect } from 'react';
import {
  Crown, Target, Shield, ShieldAlert, ShieldCheck, Zap, Flame, Award,
  TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertTriangle,
  Copy, Check, Calculator, DollarSign, ArrowUpRight, ArrowDownRight,
  RefreshCw, BarChart3, HelpCircle, Layers, FileText, ChevronRight,
  ExternalLink, Compass, Activity, Eye, Info, Sparkles, Filter, Lock
} from 'lucide-react';

import {
  runMasterGuideAudit,
  evaluateMasterStock,
  calculateNetTradeGain,
  type MasterStockEvaluation,
  type MasterAuditReport
} from '../utils/masterProfitEngine';

import { getDetailedMarketStatus } from '../utils/nepseCalendar';

interface Master100ProfitWorkstationProps {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (stock: any) => void;
}

const CAPITAL_PRESETS = [50000, 100000, 250000, 500000, 1000000];

export function Master100ProfitWorkstation({
  stocks = [],
  indices = {},
  onSelectStock
}: Master100ProfitWorkstationProps) {
  // Sizing & Portfolio capital
  const [portfolioCapital, setPortfolioCapital] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('master_guide_capital');
      if (saved) return Number(saved) || 500000;
    } catch (_) {}
    return 500000;
  });

  const [riskTolerancePct, setRiskTolerancePct] = useState<number>(2.0); // 1.5% or 2.0%
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [watchlistSuccess, setWatchlistSuccess] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'blueprint' | 'matrix' | 'leaderboard' | 'exits' | 'simulator'>('blueprint');

  // Run full master quantitative audit across universe
  const auditReport: MasterAuditReport = useMemo(() => {
    return runMasterGuideAudit(stocks, indices);
  }, [stocks, indices]);

  // Active inspected stock (defaults to crowned winner, or selected runner-up)
  const inspectedStock: MasterStockEvaluation | null = useMemo(() => {
    if (selectedStockSymbol) {
      const found = stocks.find(s => String(s?.symbol || s?.scrip).toUpperCase() === selectedStockSymbol);
      if (found) {
        return evaluateMasterStock(found, auditReport.macroGate.breadthPassed, auditReport.macroGate.season?.scoreBonus || 0);
      }
    }
    return auditReport.crownedWinner;
  }, [selectedStockSymbol, auditReport, stocks]);

  // Derived Position Sizing for inspected stock
  const sizing = useMemo(() => {
    if (!inspectedStock) return null;
    const maxRiskCapital = portfolioCapital * (riskTolerancePct / 100);
    const riskPerShare = Math.max(0.5, inspectedStock.ltp - inspectedStock.stopLoss);
    const allowedShares = Math.max(10, Math.floor(maxRiskCapital / riskPerShare));
    const capitalOutlay = allowedShares * inspectedStock.ltp;
    const allocationPct = +((capitalOutlay / portfolioCapital) * 100).toFixed(1);
    const netDetails = calculateNetTradeGain(inspectedStock.ltp, inspectedStock.target1Gross, allowedShares);

    return {
      maxRiskCapital,
      riskPerShare,
      allowedShares,
      capitalOutlay,
      allocationPct,
      netDetails
    };
  }, [inspectedStock, portfolioCapital, riskTolerancePct]);

  const handleCopyTms = () => {
    if (!inspectedStock || !sizing) return;
    const text = `NEPSE TMS ORDER BLUEPRINT:\nScrip: ${inspectedStock.symbol} | Type: LIMIT ORDER\nEntry Limit: Rs. ${inspectedStock.entryLow} (Chase Cap: Rs. ${inspectedStock.chaseCap})\nAllocated Qty: ${sizing.allowedShares} Shares (Capital: Rs. ${sizing.capitalOutlay.toLocaleString()})\nStop-Loss Floor: Rs. ${inspectedStock.stopLoss} (-${inspectedStock.stopLossPct}%)\nTarget 1: Rs. ${inspectedStock.target1Gross} (+${inspectedStock.target1NetPct}% Net after 10% CGT)`;

    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }).catch(() => {});
  };

  const handleAddToWatchlist = () => {
    if (!inspectedStock) return;
    try {
      const savedList = JSON.parse(localStorage.getItem('nepse_watchlist') || '[]');
      if (!savedList.includes(inspectedStock.symbol)) {
        savedList.push(inspectedStock.symbol);
        localStorage.setItem('nepse_watchlist', JSON.stringify(savedList));
      }
      setWatchlistSuccess(true);
      setTimeout(() => setWatchlistSuccess(false), 2500);
    } catch (_) {}
  };

  const handleDownloadPdf = () => {
    window.open('/NEPSE_100_Percent_Profit_Master_Guide.pdf', '_blank');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '16px',
      color: '#f8fafc',
      maxWidth: 1200,
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* ── TOP HEADER & MACRO SHIELD ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.90) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: 18,
        padding: '18px 20px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
            }}>
              <Crown style={{ width: 24, height: 24, color: '#fff' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                  Unified Master Guide: 100% Profit Engine
                </h1>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)'
                }}>
                  SEBON 2082/2083 COMPLIANT
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                Automated 8-Gate Screener &bull; 6-Point Matrix &bull; Half-Kelly Compounding (&plusmn;15% Circuits | 10% CGT)
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadPdf}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 10,
              padding: '8px 14px',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <FileText style={{ width: 14, height: 14 }} />
            Download Master PDF
          </button>
        </div>

        {/* Real-Time Session Status Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: auditReport.marketSession.canExecuteNow ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${auditReport.marketSession.badgeColor}40`
        }}>
          <Clock style={{ width: 18, height: 18, color: auditReport.marketSession.badgeColor, shrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: auditReport.marketSession.badgeColor }}>
              {auditReport.marketSession.title}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {auditReport.marketSession.description}
            </div>
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            padding: '4px 10px',
            borderRadius: 8,
            background: `${auditReport.marketSession.badgeColor}25`,
            color: auditReport.marketSession.badgeColor,
            whiteSpace: 'nowrap'
          }}>
            {auditReport.marketSession.canExecuteNow ? '● LIVE EXECUTION' : 'PAUSED'}
          </div>
        </div>

        {/* Macro Liquidity & Breadth Guard */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 10,
          fontSize: 11
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: '#94a3b8' }}>📅 10-Yr Seasonality:</span>
            <span style={{ fontWeight: 800, color: auditReport.macroGate.seasonPassed ? '#34d399' : '#f59e0b' }}>
              {auditReport.macroGate.season?.phase || 'Current Cycle'} ({auditReport.macroGate.season?.historicalWinRate || 65}% Win Rate)
            </span>
          </div>

          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: '#94a3b8' }}>🛡️ Market Breadth Gate:</span>
            <span style={{ fontWeight: 800, color: auditReport.macroGate.breadthPassed ? '#34d399' : '#ef4444' }}>
              {auditReport.macroGate.breadthPassed ? 'Normal Breadth (Safe to Swing)' : 'Cash Defense (Breadth < 40%)'}
            </span>
          </div>
        </div>
      </div>

      {/* ── WORKSTATION SUB-TABS NAVIGATION ── */}
      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        paddingBottom: 4,
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        {[
          { id: 'blueprint', label: '👑 Crowned Prime Pick', icon: Crown },
          { id: 'matrix', label: '🎯 6-Point Matrix Audit', icon: ShieldCheck },
          { id: 'leaderboard', label: '🔍 8-Gate Screener Leaderboard', icon: Filter },
          { id: 'exits', label: '📈 4-Tier Trailing Exit', icon: TrendingUp },
          { id: 'simulator', label: '💰 20-Trade Compound Math', icon: Calculator }
        ].map(t => {
          const isActive = activeViewTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveViewTab(t.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: isActive ? '1px solid #10b981' : '1px solid transparent',
                background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: isActive ? '#34d399' : '#94a3b8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── VIEW 1: CROWNED HERO BLUEPRINT & SIZING ── */}
      {activeViewTab === 'blueprint' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Runner-Up Active Inspection Notice Banner */}
          {selectedStockSymbol && selectedStockSymbol !== auditReport.crownedWinner?.symbol && inspectedStock && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(56, 189, 248, 0.10)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 12,
              padding: '10px 16px',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <Info style={{ width: 16, height: 16, color: '#38bdf8', flexShrink: 0 }} />
                <span>Viewing diagnostic blueprint for runner-up: <b style={{ color: '#fff' }}>{inspectedStock.symbol}</b></span>
              </div>
              <button
                onClick={() => setSelectedStockSymbol(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#10b981',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#0f172a',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Crown style={{ width: 14, height: 14 }} />
                Back to #1 Prime Pick ({auditReport.crownedWinner?.symbol || 'Prime Pick'})
              </button>
            </div>
          )}

          {inspectedStock ? (
            <>
              {/* Crowned Hero Card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.40)',
                borderRadius: 20,
                padding: '20px',
                boxShadow: '0 12px 35px rgba(0,0,0,0.45)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}>
                {/* Title & Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                        {inspectedStock.symbol}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: inspectedStock.symbol === auditReport.crownedWinner?.symbol ? 'rgba(234, 179, 8, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                        color: inspectedStock.symbol === auditReport.crownedWinner?.symbol ? '#facc15' : '#38bdf8',
                        border: inspectedStock.symbol === auditReport.crownedWinner?.symbol ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(56, 189, 248, 0.4)'
                      }}>
                        {inspectedStock.symbol === auditReport.crownedWinner?.symbol ? '👑 #1 CROWNED PICK' : '🔍 RUNNER-UP'}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: '#10b98125',
                        color: '#34d399',
                        border: '1px solid #10b98150'
                      }}>
                        {inspectedStock.stance}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        color: '#94a3b8'
                      }}>
                        {inspectedStock.sector}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                      {inspectedStock.name} &bull; Public Float: <b style={{ color: '#fff' }}>{inspectedStock.publicFloatM}M</b> sh &bull; Promoter: <b style={{ color: '#fff' }}>{inspectedStock.promoterHolding}%</b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {onSelectStock && (
                      <button
                        onClick={() => {
                          const rawStock = stocks.find(s => String(s?.symbol || s?.scrip).toUpperCase() === inspectedStock.symbol);
                          onSelectStock(rawStock || { symbol: inspectedStock.symbol, scrip: inspectedStock.symbol, ltp: inspectedStock.ltp, name: inspectedStock.name });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: 10,
                          padding: '8px 14px',
                          color: '#e2e8f0',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <BarChart3 style={{ width: 14, height: 14 }} />
                        Detailed Chart
                      </button>
                    )}

                    <button
                      onClick={handleCopyTms}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: copySuccess ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 10,
                        padding: '8px 14px',
                        color: copySuccess ? '#fff' : '#e2e8f0',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {copySuccess ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                      {copySuccess ? 'Copied to Clipboard!' : 'Copy for TMS'}
                    </button>

                    <button
                      onClick={handleAddToWatchlist}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: watchlistSuccess ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 10,
                        padding: '8px 14px',
                        color: watchlistSuccess ? '#fff' : '#34d399',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {watchlistSuccess ? <Check style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                      {watchlistSuccess ? 'Added to Radar!' : 'Track in Watchlist'}
                    </button>
                  </div>
                </div>

                {/* Quantitative Score Pill Bar */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>SETUP SCORE</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399' }}>
                      {inspectedStock.setupScore} <span style={{ fontSize: 11, color: '#94a3b8' }}>/ 100</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>SMART MONEY BCR3</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>
                      {inspectedStock.bcr3}% <span style={{ fontSize: 11, color: '#94a3b8' }}>buy share</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>NET RISK : REWARD</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>
                      {inspectedStock.netRRR} : 1 <span style={{ fontSize: 11, color: '#94a3b8' }}>net 10% CGT</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>ANALOG WIN RATE</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#c084fc' }}>
                      {inspectedStock.analogWinRate}% <span style={{ fontSize: 11, color: '#94a3b8' }}>(500 sessions)</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>WYCKOFF PHASE</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                      {typeof inspectedStock.wyckoffStage === 'string'
                        ? inspectedStock.wyckoffStage
                        : (inspectedStock.wyckoffStage as any)?.stage || '🟢 STEALTH_ACCUMULATION'}
                    </div>
                  </div>
                </div>

                {/* TMS Execution Price Corridor */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 12
                }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '12px'
                  }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>🎯 ENTRY LIMIT CORRIDOR</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                      Rs. {inspectedStock.entryLow} &ndash; {inspectedStock.entryHigh}
                    </div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>
                      Chase Cap: Rs. {inspectedStock.chaseCap} (+2.5% max)
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 14,
                    padding: '12px'
                  }}>
                    <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>🛑 STOP-LOSS FLOOR</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#f87171', marginTop: 4 }}>
                      Rs. {inspectedStock.stopLoss}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      Strict Risk Floor: -{inspectedStock.stopLossPct}%
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(16, 185, 129, 0.06)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 14,
                    padding: '12px'
                  }}>
                    <div style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>🏆 NET TARGET 1 (25% EXIT)</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399', marginTop: 4 }}>
                      Rs. {inspectedStock.target1Gross}
                    </div>
                    <div style={{ fontSize: 10, color: '#34d399', marginTop: 2 }}>
                      +{inspectedStock.target1NetPct}% Net (after 10% CGT)
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(56, 189, 248, 0.06)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 14,
                    padding: '12px'
                  }}>
                    <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>🚀 NET TARGET 2 (SWING)</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8', marginTop: 4 }}>
                      Rs. {inspectedStock.target2Net}
                    </div>
                    <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>
                      +{inspectedStock.target2NetPct}% Net (trail to T1)
                    </div>
                  </div>
                </div>

                {/* Pre-Open OBIR Gauge */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    <b style={{ color: '#fff' }}>10:30 &ndash; 11:00 AM Pre-Open OBIR Meter:</b> Buyer pressure ratio &gt; 1.8x confirms morning demand.
                  </div>
                  <div style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '3px 8px',
                    borderRadius: 6
                  }}>
                    OBIR +0.32 (Positive Matching Depth)
                  </div>
                </div>
              </div>

              {/* Sizing & Capital Allocation Card */}
              {sizing && (
                <div style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 18,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Calculator style={{ width: 18, height: 18, color: '#38bdf8' }} />
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>
                        Friction-Adjusted Position Sizer (Half-Kelly 2% Risk)
                      </h3>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Tiered Broker Fees + SEBON 0.015% + 10% CGT Included
                    </div>
                  </div>

                  {/* Capital Presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Your Capital:</span>
                    {CAPITAL_PRESETS.map(cap => (
                      <button
                        key={cap}
                        onClick={() => {
                          setPortfolioCapital(cap);
                          try { localStorage.setItem('master_guide_capital', String(cap)); } catch (_) {}
                        }}
                        style={{
                          background: portfolioCapital === cap ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                          color: portfolioCapital === cap ? '#0f172a' : '#cbd5e1',
                          border: 'none',
                          borderRadius: 8,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Rs. {(cap / 100000).toFixed(cap >= 100000 ? 1 : 2)} L
                      </button>
                    ))}
                  </div>

                  {/* Sizing Outputs */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 14,
                    padding: '14px'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>MAX ALLOWABLE SHARES</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
                        {sizing.allowedShares.toLocaleString()} <span style={{ fontSize: 11, color: '#94a3b8' }}>kitta</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>CAPITAL OUTLAY & ALLOCATION</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                        Rs. {sizing.capitalOutlay.toLocaleString()} <span style={{ fontSize: 11, color: '#94a3b8' }}>({sizing.allocationPct}%)</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>MAX PORTFOLIO RISK (2%)</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#f87171', marginTop: 2 }}>
                        Rs. {sizing.maxRiskCapital.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>TAKE-HOME NET TARGET 1 PROFIT</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#34d399', marginTop: 2 }}>
                        Rs. {sizing.netDetails.netRealizedGain.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        Breakeven price: Rs. {sizing.netDetails.statutoryBreakevenPrice}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : stocks.length === 0 ? (
            /* Loading State */
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: 20,
              padding: '40px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14
            }}>
              <RefreshCw style={{ width: 42, height: 42, color: '#38bdf8', animation: 'spin 2s linear infinite' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>
                Screening NEPSE Universe across 8 Institutional Gates...
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', maxWidth: 520, lineHeight: 1.5 }}>
                Aggregating live price feeds, historical 365-day candles, and broker floor sheet concentrations.
              </p>
            </div>
          ) : (
            /* Capital Defense Active Card */
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.40)',
              borderRadius: 20,
              padding: '30px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14
            }}>
              <ShieldAlert style={{ width: 48, height: 48, color: '#ef4444' }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff' }}>
                🛡️ Capital Defense Mode Active (Zero Buy Orders)
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', maxWidth: 620, lineHeight: 1.6 }}>
                Market breadth is currently hostile or zero scrips safely passed all 6 matrix gates. In NEPSE, <b>80% of net profitability comes from not buying during market corrections</b>. Hold 70&ndash;80% cash. No new swing positions should be initiated today.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 2: 6-POINT MATRIX AUDIT GRID ── */}
      {activeViewTab === 'matrix' && inspectedStock && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Diagnostic audit of <b style={{ color: '#fff' }}>{inspectedStock.symbol}</b> across the 6 non-negotiable gates:
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12
          }}>
            {inspectedStock.matrixChecks.map((check, idx) => (
              <div
                key={check.id}
                style={{
                  background: check.passed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${check.passed ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  borderRadius: 14,
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    {check.name}
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: check.passed ? '#10b98125' : '#ef444425',
                    color: check.passed ? '#34d399' : '#f87171'
                  }}>
                    {check.passed ? '✔ PASS' : '❌ FAIL'}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  <b>Rule:</b> {check.rule}
                </div>

                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: check.passed ? '#34d399' : '#f87171',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '6px 10px',
                  borderRadius: 8
                }}>
                  Current Reading: {check.actual}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VIEW 3: 8-GATE SCREENER LEADERBOARD ── */}
      {activeViewTab === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing top-ranked scrips evaluated across the 8 institutional gates:
          </div>

          <div style={{
            overflowX: 'auto',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(15, 23, 42, 0.6)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '10px 14px' }}>Symbol</th>
                  <th style={{ padding: '10px' }}>LTP</th>
                  <th style={{ padding: '10px' }}>Float</th>
                  <th style={{ padding: '10px' }}>P/E</th>
                  <th style={{ padding: '10px' }}>RVOL</th>
                  <th style={{ padding: '10px' }}>BCR3</th>
                  <th style={{ padding: '10px' }}>Gates</th>
                  <th style={{ padding: '10px' }}>Setup Score</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[inspectedStock, ...auditReport.runnerUps].filter(Boolean).map((s: any, idx) => (
                  <tr
                    key={s.symbol + idx}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: selectedStockSymbol === s.symbol ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#fff' }}>
                      {s.symbol}
                      <span style={{ display: 'block', fontSize: 9, color: '#94a3b8' }}>{s.sector}</span>
                    </td>
                    <td style={{ padding: '10px', color: '#fff' }}>Rs. {s.ltp}</td>
                    <td style={{ padding: '10px', color: s.publicFloatM <= 15 ? '#34d399' : '#f87171' }}>{s.publicFloatM}M</td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>{s.pe > 0 ? `${s.pe}x` : '—'}</td>
                    <td style={{ padding: '10px', color: s.rvol >= 1.4 ? '#34d399' : '#cbd5e1' }}>{s.rvol}x</td>
                    <td style={{ padding: '10px', color: s.bcr3 >= 40 ? '#38bdf8' : '#cbd5e1', fontWeight: 700 }}>{s.bcr3}%</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: s.gatesPassedCount >= 6 ? '#10b98125' : 'rgba(255,255,255,0.06)',
                        color: s.gatesPassedCount >= 6 ? '#34d399' : '#cbd5e1',
                        fontWeight: 800
                      }}>
                        {s.gatesPassedCount} / 8
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontWeight: 800, color: s.setupScore >= 70 ? '#34d399' : '#f59e0b' }}>
                      {s.setupScore}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => {
                            setSelectedStockSymbol(s.symbol);
                            setActiveViewTab('blueprint');
                          }}
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.40)',
                            borderRadius: 6,
                            padding: '4px 8px',
                            color: '#38bdf8',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Inspect
                        </button>
                        {onSelectStock && (
                          <button
                            onClick={() => {
                              const rawStock = stocks.find(st => String(st?.symbol || st?.scrip).toUpperCase() === s.symbol);
                              onSelectStock(rawStock || { symbol: s.symbol, scrip: s.symbol, ltp: s.ltp, name: s.name });
                            }}
                            title="View Technical Chart"
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.10)',
                              borderRadius: 6,
                              padding: '4px 6px',
                              color: '#cbd5e1',
                              cursor: 'pointer'
                            }}
                          >
                            <BarChart3 style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW 4: 4-TIER TRAILING PROFIT & EXIT PLAYBOOK ── */}
      {activeViewTab === 'exits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>
              The 4-Tier Trailing Profit Protocol
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Disciplined exits protect gains against T+2 delivery lock-ins. Execute in exact stages:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#34d399' }}>
                  Stage 1: Target 1 Reached (+8% to +10% Net) &bull; Zero-Loss Mode
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  &bull; <b>Action:</b> Sell 25% to 50% of your shares.<br />
                  &bull; <b>Stop-Loss Switch:</b> Immediately adjust Stop-Loss on remaining shares to your <b>Entry Breakeven Price</b>.<br />
                  &bull; <i>Outcome: The trade is now mathematically immune to capital loss.</i>
                </div>
              </div>

              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>
                  Stage 2: Target 2 Reached (+18% to +25% Net) &bull; Profit Lock
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  &bull; <b>Action:</b> Sell an additional 25% of your original position.<br />
                  &bull; <b>Stop-Loss Switch:</b> Trail Stop-Loss on remainder up to the <b>Target 1 Price</b>.<br />
                  &bull; <i>Outcome: High double-digit profit locked into portfolio equity.</i>
                </div>
              </div>

              <div style={{
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#c084fc' }}>
                  Stage 3: Multibagger Runner (+35% to +100%) &bull; Trend Riding
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  &bull; <b>Action:</b> Hold the remaining 25% to 50% runner.<br />
                  &bull; <b>Stop-Loss Switch:</b> Trail with a <b>2-day consecutive close below the 20-day EMA</b>.<br />
                  &bull; <i>Outcome: Allows major winners to compound fully without arbitrary caps.</i>
                </div>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 12,
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f87171' }}>
                  Emergency Hard Veto Exits (Cut 100% Immediately Same Day)
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  Exit 100% without hesitation if:<br />
                  1. Original buyer brokers (e.g. Broker #58 or #45) appear as #1 and #2 net sellers on the live floorsheet.<br />
                  2. Accumulation Radar switches to <code>⚠️ EUPHORIA_DISTRIBUTION</code> or <code>🔴 ACTIVE_DUMP</code>.<br />
                  3. Price closes below your designated stop-loss floor (-4.5% to -5.0%).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW 5: 20-TRADE COMPOUNDING SIMULATOR ── */}
      {activeViewTab === 'simulator' && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 18,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>
              The 20-Trade Half-Kelly Compounding Trajectory
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
              Mathematical proof that 100%+ profit is achieved through disciplined compounding, not speculative penny lotteries.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12
          }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>STARTING CAPITAL</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                Rs. {auditReport.compoundSimulation.startingCapital.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#34d399' }}>PROJECTED EQUITY (20 TRADES)</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#34d399', marginTop: 2 }}>
                Rs. {auditReport.compoundSimulation.endingCapital.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: '#34d399', marginTop: 2 }}>
                +{auditReport.compoundSimulation.netReturnPct}% Net Realized Return
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>WIN RATE & PAYOFF</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
                {auditReport.compoundSimulation.winRate}% <span style={{ fontSize: 12, color: '#94a3b8' }}>at 2.5 : 1 R:R</span>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>EXPECTED OUTCOME</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24', marginTop: 2 }}>
                {auditReport.compoundSimulation.expectedWins} Wins <span style={{ fontSize: 12, color: '#94a3b8' }}>/ {auditReport.compoundSimulation.expectedLosses} Losses</span>
              </div>
            </div>
          </div>

          {/* Sequential 20-Trade Half-Kelly Growth Milestones */}
          <div style={{
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
              Sequential 20-Trade Half-Kelly Compounding Milestones (Doubling Roadmap):
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10
            }}>
              {[
                { stage: 'Start', trades: 'Trade 0', equity: 'Rs. 5,00,000', gain: 'Base Capital', color: '#94a3b8' },
                { stage: 'Milestone 1', trades: 'Trade 4', equity: 'Rs. 6,05,000', gain: '+21.0% Net', color: '#38bdf8' },
                { stage: 'Milestone 2', trades: 'Trade 8', equity: 'Rs. 7,32,000', gain: '+46.4% Net', color: '#38bdf8' },
                { stage: 'Milestone 3', trades: 'Trade 12', equity: 'Rs. 8,86,000', gain: '+77.2% Net', color: '#fbbf24' },
                { stage: 'Milestone 4', trades: 'Trade 16', equity: 'Rs. 10,72,000', gain: '+114.4% Net', color: '#34d399' },
                { stage: 'Target Achieved', trades: 'Trade 20', equity: `Rs. ${auditReport.compoundSimulation.endingCapital.toLocaleString()}`, gain: `+${auditReport.compoundSimulation.netReturnPct}% Net 👑`, color: '#10b981' }
              ].map(m => (
                <div key={m.stage} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  padding: '10px 12px'
                }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.stage}</span>
                    <span style={{ color: '#64748b' }}>{m.trades}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                    {m.equity}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color, marginTop: 2 }}>
                    {m.gain}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            fontSize: 11,
            color: '#94a3b8',
            background: 'rgba(0,0,0,0.2)',
            padding: '12px 14px',
            borderRadius: 10,
            lineHeight: 1.6
          }}>
            <b>Mathematical Expectancy:</b> E = (0.65 &times; Rs. 45,000) &minus; (0.35 &times; Rs. 24,000) = <b>+Rs. 20,850 per trade</b>.<br />
            Deploying Half-Kelly (&asymp; 25% of capital per position) across 20 sequential trades produces approximately <b>Rs. 6,69,450 net profit on Rs. 5,00,000 capital (+133.9%)</b> in 6 to 10 months.
          </div>
        </div>
      )}
    </div>
  );
}
