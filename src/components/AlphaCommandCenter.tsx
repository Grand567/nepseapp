// src/components/AlphaCommandCenter.tsx
import React, { useState, useMemo } from 'react';
import {
  Crown, ShieldAlert, Zap, CheckCircle2, XCircle,
  Copy, Check, Compass, Eye, BarChart3, Layers, TrendingUp, Lock,
  Search, X, RotateCcw, AlertTriangle
} from 'lucide-react';
import { runUnifiedFiveStepAlphaDesk, evaluateSingleStockAlphaDossier } from '../utils/masterAlphaPipeline';
import { addToWatchlist } from '../utils/watchlist';

interface AlphaCommandCenterProps {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (stock: any) => void;
  onNavigateTab?: (tabId: string) => void;
}

const CAPITAL_PRESETS = [50000, 100000, 250000, 500000, 1000000];
const CGT_MODES = [
  { rate: 0.05, label: '5.0% CGT (Gazette 2083)' },
  { rate: 0.075, label: '7.5% CGT (Standard ST)' },
  { rate: 0.10, label: '10.0% CGT (Institutional)' }
];

export function AlphaCommandCenter({
  stocks = [],
  indices = {},
  onSelectStock,
  onNavigateTab
}: AlphaCommandCenterProps) {
  const [userCapital, setUserCapital] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('master_guide_capital');
      if (saved) return Number(saved) || 100000;
    } catch (_) {}
    return 100000;
  });

  const [cgtRate, setCgtRate] = useState<number>(0.075);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [copiedTicket, setCopiedTicket] = useState(false);
  const [paperOrderSaved, setPaperOrderSaved] = useState(false);

  const alphaDesk = useMemo(() => {
    return runUnifiedFiveStepAlphaDesk({
      stocks,
      indices,
      userCapital,
      riskTolerancePct: 1.5,
      requiredNetRRR: 2.5,
      cgtRate
    });
  }, [stocks, indices, userCapital, cgtRate]);

  // Autocomplete suggestions matching search query
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return [];
    return stocks
      .filter((s: any) => {
        const sym = String(s?.symbol || s?.scrip || '').toUpperCase();
        const name = String(s?.name || s?.companyName || '').toUpperCase();
        return sym.includes(q) || name.includes(q);
      })
      .slice(0, 8);
  }, [searchQuery, stocks]);

  // Active dossier resolution:
  // 1. If user selected a specific symbol: check qualified, then radar, or evaluate ANY stock on demand!
  // 2. Default to prime pick or top radar runner-up
  const activeDossier = useMemo(() => {
    if (selectedSymbol) {
      const foundQualified = alphaDesk.qualifiedList.find((d: any) => d.symbol === selectedSymbol);
      if (foundQualified) return foundQualified;

      const foundRadar = alphaDesk.watchlistRadar.find((d: any) => d.symbol === selectedSymbol);
      if (foundRadar) return foundRadar;

      // Manual on-demand evaluation of ANY stock in NEPSE
      const manualEval = evaluateSingleStockAlphaDossier(selectedSymbol, {
        stocks,
        indices,
        userCapital,
        riskTolerancePct: 1.5,
        requiredNetRRR: 2.5,
        cgtRate
      });
      if (manualEval) return manualEval;
    }
    return alphaDesk.primePick || alphaDesk.watchlistRadar[0] || null;
  }, [selectedSymbol, alphaDesk, stocks, indices, userCapital, cgtRate]);

  const handleCopyTmsTicket = (dossier: any) => {
    if (!dossier) return;
    const ep = dossier.executionPlan;
    const text =
      `👑 DRABYASHREE 5-STEP PROFIT-MAXIMIZED TMS TICKET:\n` +
      `• Scrip: ${dossier.symbol} (${dossier.sector} - Sector Rank #${dossier.sectorRank})\n` +
      `• Limit Buy Zone: Rs. ${ep.buyZoneLow} – Rs. ${ep.buyZoneHigh} (NEVER chase > Rs. ${ep.chaseCap})\n` +
      `• Total Allocation: ${ep.recommendedKitta} Kitta (Deploy: Rs. ${ep.capitalOutlay.toLocaleString('en-IN')} | 10% Cash Reserve: Rs. ${ep.cashReserveLocked.toLocaleString('en-IN')})\n` +
      `• 2-Tranche T+2 Entry: Buy ${ep.tranche1Kitta} Kitta Today (Tranche 1) + Buy ${ep.tranche2Kitta} Kitta after T+2 Demat Settlement\n` +
      `• Hard Stop-Loss: Rs. ${ep.stopLoss} (-${ep.stopLossPct}% | Max Risk: Rs. ${ep.maxRiskRupees.toLocaleString('en-IN')})\n` +
      `• 3-Tier Profit Ladder:\n` +
      `   1) Target 1 (Rs. ${ep.target1}): Sell ${ep.scaleOutT1Kitta} Kitta & Move SL to Zero-Loss Breakeven Rs. ${ep.statutoryBreakevenPrice}\n` +
      `   2) Target 2 (Rs. ${ep.target2}): Sell ${ep.scaleOutT2Kitta} Kitta & Move SL to Rs. ${ep.target1}\n` +
      `   3) Runner (Rs. ${ep.target3Runner}+): Trail final ${ep.runnerT3Kitta} Kitta along 20-Day EMA\n` +
      `• Maximized Ladder Net Profit: +Rs. ${ep.maximizedLadderNetProfit.toLocaleString('en-IN')} (Net R:R ${ep.netRRR1}:1 after ${(cgtRate * 100).toFixed(1)}% CGT)`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedTicket(true);
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  const handleSimulateT2Order = (dossier: any) => {
    if (!dossier) return;
    try {
      addToWatchlist(dossier.symbol);
      const existingSim = JSON.parse(localStorage.getItem('nepse_paper_trades') || '[]');
      const ep = dossier.executionPlan;
      const newOrder = {
        id: `sim_${Date.now()}`,
        symbol: dossier.symbol,
        sector: dossier.sector,
        buyPrice: dossier.ltp,
        kitta: ep.recommendedKitta,
        tranche1Kitta: ep.tranche1Kitta,
        tranche2Kitta: ep.tranche2Kitta,
        stopLoss: ep.stopLoss,
        target1: ep.target1,
        target2: ep.target2,
        target3Runner: ep.target3Runner,
        breakevenPrice: ep.statutoryBreakevenPrice,
        t2SettlementDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('nepse_paper_trades', JSON.stringify([newOrder, ...existingSim.slice(0, 49)]));
      setPaperOrderSaved(true);
      setTimeout(() => setPaperOrderSaved(false), 3000);
    } catch (_) {}
  };

  const mc = alphaDesk.marketContext;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* ── 1. TOP FUNNEL, CAPITAL & CGT REGIME BAR ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.96) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        borderRadius: 16,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                background: '#10b981', color: '#080c14', fontWeight: 900, fontSize: 11,
                padding: '2px 8px', borderRadius: 6, letterSpacing: '0.04em'
              }}>
                5-STEP UNIFIED COMMAND DESK
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
                Maximum Reward / Minimum Loss Institutional Execution Hub
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Combines Sector RS + 8-Gate Quality + Wyckoff VDU & Anti-Wick Broker Flow + 2-Tranche T+2 Split + 3-Tier Profit Ladder.
            </div>
          </div>

          {/* Portfolio Capital & CGT Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.35)', padding: '5px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>Capital:</span>
              {CAPITAL_PRESETS.map(cap => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => {
                    setUserCapital(cap);
                    try { localStorage.setItem('master_guide_capital', String(cap)); } catch (_) {}
                  }}
                  style={{
                    background: userCapital === cap ? '#10b981' : 'rgba(255,255,255,0.05)',
                    color: userCapital === cap ? '#080c14' : '#94a3b8',
                    border: 'none',
                    borderRadius: 6,
                    padding: '3px 7px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {cap >= 100000 ? `Rs.${cap / 100000}L` : `Rs.50K`}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.35)', padding: '5px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              {CGT_MODES.map(mode => (
                <button
                  key={mode.rate}
                  type="button"
                  onClick={() => setCgtRate(mode.rate)}
                  style={{
                    background: cgtRate === mode.rate ? '#38bdf8' : 'transparent',
                    color: cgtRate === mode.rate ? '#080c14' : '#94a3b8',
                    border: 'none',
                    borderRadius: 6,
                    padding: '3px 7px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 🔍 MANUAL STOCK TESTER & SEARCH BAR ── */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: 12,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          {/* Autocomplete Input */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={15} color="#38bdf8" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    setSelectedSymbol(searchQuery.trim().toUpperCase());
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Test ANY manual stock (e.g. NABIL, SHIVM, CHCL, HATHY)..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: 12.5,
                  width: '100%',
                  fontWeight: 600
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {isSearchOpen && searchSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 60,
                marginTop: 6,
                background: 'rgba(15, 23, 42, 0.98)',
                border: '1.5px solid rgba(56, 189, 248, 0.5)',
                borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
                maxHeight: 220,
                overflowY: 'auto'
              }}>
                {searchSuggestions.map((s: any) => (
                  <div
                    key={s.symbol}
                    onClick={() => {
                      setSelectedSymbol(s.symbol);
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <strong style={{ color: '#ffffff' }}>{s.symbol}</strong>
                      <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>{s.sector || s.sectorName}</span>
                    </div>
                    <span style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      Rs. {s.ltp || s.closePrice || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick preset test chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>Quick Test:</span>
            {['NABIL', 'SHIVM', 'CHCL', 'UPPER', 'HATHY', 'CIT', 'HDL'].map(sym => (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSymbol(sym)}
                style={{
                  background: selectedSymbol === sym ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${selectedSymbol === sym ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: selectedSymbol === sym ? '#38bdf8' : '#cbd5e1',
                  borderRadius: 6,
                  padding: '2px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {sym}
              </button>
            ))}
            {selectedSymbol && (
              <button
                type="button"
                onClick={() => setSelectedSymbol(null)}
                style={{
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  color: '#fca5a5',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
                title="Reset to Top Qualified Pick"
              >
                <RotateCcw size={11} />
                <span>Reset to Prime</span>
              </button>
            )}
          </div>
        </div>

        {/* Step 1 Macro & Top 3 Sector Leaders Strip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          paddingTop: 10,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>📍 Step 1 Leading Sectors Today:</span>
            {mc.topSectors.map((sec: any, idx: number) => (
              <span
                key={sec.sector}
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#34d399',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 11.5
                }}
              >
                #{idx + 1} {sec.sector} ({sec.avgPChange >= 0 ? '+' : ''}{sec.avgPChange}%)
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#cbd5e1' }}>
            <span>Turnover: <strong style={{ color: mc.marketTurnoverArba >= 5 ? '#34d399' : '#fbbf24' }}>Rs. {mc.marketTurnoverArba} Arba</strong></span>
            <span>•</span>
            <span>Breadth: <strong style={{ color: mc.breadthPassed ? '#34d399' : '#f87171' }}>{mc.breadthPct}% Adv</strong></span>
            <span>•</span>
            <span>5/5 Verified: <strong style={{ color: '#34d399' }}>{alphaDesk.qualifiedList.length} Picks</strong></span>
          </div>
        </div>
      </div>

      {/* ── 2. CASH PRESERVATION BANNER (When 0 stocks pass all 5 steps) ── */}
      {!alphaDesk.hasVerifiedPicks && !activeDossier?.isManualInspection && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.95))',
          border: '1.5px solid rgba(245, 158, 11, 0.45)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12
        }}>
          <ShieldAlert size={22} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fbbf24' }}>
              🛡️ 100% CAPITAL PRESERVATION ACTIVE — 0 STOCKS PASS ALL 5 STAGES RIGHT NOW
            </div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 }}>
              Our strict AND-gate requires all 5 institutional stages to pass simultaneously. Sitting in cash during choppy sessions prevents drawdowns. Below is the highest-scoring <strong>Radar Runner-Up</strong> so you can monitor which gate is awaiting confirmation. You can also search ANY stock above to test its 5-gate score.
            </div>
          </div>
        </div>
      )}

      {/* ── 3. MAIN UNIFIED EXECUTION DOSSIER CARD ── */}
      {activeDossier && (() => {
        const ep = activeDossier.executionPlan;
        const isExtended = activeDossier.executionStatus === 'EXTENDED_ABOVE_CHASE_CAP';
        const isBuyZone = activeDossier.executionStatus === 'ACTIONABLE_IN_BUY_ZONE';

        return (
          <div style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(20, 28, 46, 0.98))',
            border: activeDossier.all5StagesPassed
              ? '1.5px solid rgba(16, 185, 129, 0.55)'
              : activeDossier.isManualInspection
              ? '1.5px solid rgba(245, 158, 11, 0.45)'
              : '1.5px solid rgba(56, 189, 248, 0.45)',
            borderRadius: 18,
            padding: '16px 18px',
            boxShadow: '0 14px 35px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            {/* Top Identity & Live Actionability Status Pill */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {activeDossier.symbol}
                  </span>
                  <span style={{
                    fontSize: 11.5, fontWeight: 900, padding: '3px 9px', borderRadius: 8,
                    background: activeDossier.all5StagesPassed
                      ? 'rgba(16, 185, 129, 0.2)'
                      : activeDossier.isManualInspection
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(56, 189, 248, 0.2)',
                    color: activeDossier.all5StagesPassed
                      ? '#34d399'
                      : activeDossier.isManualInspection
                      ? '#fbbf24'
                      : '#38bdf8',
                    border: activeDossier.all5StagesPassed
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : activeDossier.isManualInspection
                      ? '1px solid rgba(245, 158, 11, 0.4)'
                      : '1px solid rgba(56, 189, 248, 0.4)'
                  }}>
                    {activeDossier.all5StagesPassed
                      ? '👑 PASSED ALL 5/5 STAGES'
                      : activeDossier.isManualInspection
                      ? `🔍 MANUAL TEST: ${activeDossier.stagesPassedCount}/5 STAGES PASSED`
                      : `📡 RADAR RUNNER-UP (${activeDossier.stagesPassedCount}/5 STAGES)`}
                  </span>
                  <span style={{
                    fontSize: 11.5, fontWeight: 900, padding: '3px 9px', borderRadius: 8,
                    background: isExtended ? 'rgba(245, 158, 11, 0.2)' : isBuyZone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    color: isExtended ? '#fbbf24' : isBuyZone ? '#34d399' : '#60a5fa',
                    border: isExtended ? '1px solid rgba(245, 158, 11, 0.4)' : isBuyZone ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)'
                  }}>
                    {isExtended
                      ? `⚠️ EXTENDED ABOVE CHASE CAP (Rs. ${ep.chaseCap}) — DO NOT CHASE`
                      : isBuyZone
                      ? '🟢 INSIDE SAFE BUY ZONE — READY FOR ENTRY'
                      : '🎯 NEAR PIVOT — PLACE LIMIT ORDER IN BUY ZONE'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>
                  {activeDossier.name} • <strong>{activeDossier.sector}</strong> (Sector Rank #{activeDossier.sectorRank}) • Confluence Score: <strong style={{ color: activeDossier.setupScore >= 72 ? '#34d399' : '#fbbf24' }}>{activeDossier.setupScore}/100</strong> • Upper Wick: <strong>{ep.upperWickPct}%</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                  Rs. {activeDossier.ltp.toLocaleString('en-IN')}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 800,
                  color: activeDossier.pChange >= 0 ? '#34d399' : '#f87171',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {activeDossier.pChange >= 0 ? '+' : ''}{activeDossier.pChange.toFixed(2)}% Today
                </div>
              </div>
            </div>

            {/* Manual Test Notice Banner if failed some gates */}
            {!activeDossier.all5StagesPassed && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 11.5,
                color: '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertTriangle size={15} color="#fbbf24" style={{ flexShrink: 0 }} />
                <span>
                  <strong>Loss-Prevention Warning:</strong> {activeDossier.symbol} does NOT satisfy all 5 institutional stages ({activeDossier.stagesPassedCount}/5 passed). Inspect the red cards below to see why capital is protected from this stock.
                </span>
              </div>
            )}

            {/* 5-Step Visual Audit Checklist */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
              gap: 8
            }}>
              {activeDossier.checklist.map((item: any) => (
                <div
                  key={item.step}
                  style={{
                    background: item.passed ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                    border: `1px solid ${item.passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: 10,
                    padding: '9px 11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#ffffff' }}>{item.title}</span>
                    {item.passed ? (
                      <CheckCircle2 color="#34d399" size={14} />
                    ) : (
                      <XCircle color="#f87171" size={14} />
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: item.passed ? '#34d399' : '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                    {item.metric}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>

            {/* Step-by-Step Direction Box: Exact Entry, 2-Tranche Split, 3-Tier Profit Ladder */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Compass size={16} />
                  <span>PROFIT-MAXIMIZATION BLUEPRINT (FOR RS. {userCapital.toLocaleString('en-IN')} PORTFOLIO)</span>
                </div>
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  10% Cash Reserve Locked: <strong style={{ color: '#cbd5e1' }}>Rs. {ep.cashReserveLocked.toLocaleString('en-IN')}</strong> • WACC: <strong style={{ color: '#34d399' }}>Rs. {ep.waccPerShare}</strong>
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                gap: 10
              }}>
                {/* 1. 2-Tranche T+2 Split Order Size */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>1. 2-TRANCHE T+2 ENTRY</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {ep.recommendedKitta} Kitta Total
                  </div>
                  <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>
                    Now: <strong>{ep.tranche1Kitta}</strong> | Post-T+2: <strong>{ep.tranche2Kitta}</strong>
                  </div>
                </div>

                {/* 2. Limit Buy Zone & Chase Cap */}
                <div style={{ background: 'rgba(16, 185, 129, 0.06)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <div style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>2. LIMIT BUY ZONE</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Rs. {ep.buyZoneLow} – {ep.buyZoneHigh}
                  </div>
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 2 }}>
                    Do Not Chase &gt; Rs. {ep.chaseCap}
                  </div>
                </div>

                {/* 3. Hard Stop-Loss */}
                <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>3. HARD STOP-LOSS</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Rs. {ep.stopLoss} (-{ep.stopLossPct}%)
                  </div>
                  <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                    Max Risk: Rs. {ep.maxRiskRupees.toLocaleString('en-IN')} ({ep.actualRiskPct}%)
                  </div>
                </div>

                {/* 4. Target 1 & Breakeven Raise */}
                <div style={{ background: 'rgba(56, 189, 248, 0.06)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>4. TARGET 1 (SELL {ep.scaleOutT1Kitta} KITTA)</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Rs. {ep.target1} (+{ep.target1NetPct}%)
                  </div>
                  <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>
                    Move SL ➔ Rs. {ep.statutoryBreakevenPrice}
                  </div>
                </div>

                {/* 5. 3-Tier Maximized Ladder Profit */}
                <div style={{ background: 'rgba(168, 85, 247, 0.06)', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                  <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>5. MAXIMIZED LADDER NET</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    +Rs. {ep.maximizedLadderNetProfit.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 2 }}>
                    T2: Rs. {ep.target2} | R:R {ep.netRRR1}:1
                  </div>
                </div>
              </div>

              {/* 3-Tier Profit Maximization & T+2 Protection Playbook */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12,
                color: '#e2e8f0',
                lineHeight: 1.5
              }}>
                <strong style={{ color: '#34d399' }}>📋 Exact 4-Step Execution & Profit-Maximization Direction:</strong>
                <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  <li>
                    <strong>Tranche 1 Entry (Today):</strong> Place a <strong>LIMIT BUY</strong> on TMS for <strong>{ep.tranche1Kitta} Kitta</strong> between <strong>Rs. {ep.buyZoneLow} – Rs. {ep.buyZoneHigh}</strong>. Do not chase if price exceeds <strong>Rs. {ep.chaseCap}</strong>.
                  </li>
                  <li>
                    <strong>Tranche 2 Entry (Post-T+2 Demat Settlement):</strong> Once Tranche 1 shares arrive in your MeroShare Demat account and price holds above <strong>Rs. {ep.buyZoneLow}</strong>, add the remaining <strong>{ep.tranche2Kitta} Kitta</strong>. This guarantees you always have settled shares ready for immediate EDIS if the market reverses.
                  </li>
                  <li>
                    <strong>Tier 1 Zero-Loss Lock (At Rs. {ep.target1}):</strong> Sell <strong>{ep.scaleOutT1Kitta} Kitta</strong> (40%) at Target 1 and immediately raise your Stop-Loss on the remaining shares to your <strong>Statutory Breakeven (Rs. {ep.statutoryBreakevenPrice})</strong>. Your trade is now 100% risk-free.
                  </li>
                  <li>
                    <strong>Tier 2 & Multibagger Runner (Rs. {ep.target2} ➔ Rs. {ep.target3Runner}+):</strong> Sell <strong>{ep.scaleOutT2Kitta} Kitta</strong> (30%) at Target 2 (Rs. {ep.target2}), and trail the final <strong>{ep.runnerT3Kitta} Kitta</strong> (30% runner) until a 2-day close below the 20-Day EMA.
                  </li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleSimulateT2Order(activeDossier)}
                  disabled={isExtended}
                  style={{
                    background: isExtended ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #10b981, #059669)',
                    color: isExtended ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '9px 16px',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: isExtended ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Zap size={14} />
                  <span>{paperOrderSaved ? '✓ Logged in T+2 Simulator & Watchlist!' : '🚀 Execute in T+2 Paper Simulator'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyTmsTicket(activeDossier)}
                  style={{
                    background: copiedTicket ? '#10b981' : 'rgba(56, 189, 248, 0.15)',
                    color: copiedTicket ? '#080c14' : '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: 10,
                    padding: '9px 16px',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {copiedTicket ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedTicket ? 'TMS Ticket Copied!' : '📋 Copy 3-Tier TMS Ticket'}</span>
                </button>

                {onSelectStock && (
                  <button
                    type="button"
                    onClick={() => onSelectStock(activeDossier.rawStock)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 10,
                      padding: '9px 14px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <BarChart3 size={14} />
                    <span>Open Full Chart & Dossier</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 4. OTHER QUALIFIED PICKS & RADAR RUNNER-UPS TABLE ── */}
      {(alphaDesk.qualifiedList.length > 1 || alphaDesk.watchlistRadar.length > 0) && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Eye color="#38bdf8" size={14} />
            <span>All 5-Step Qualified Candidates & Watchlist Runner-Ups (Click any row to load execution plan)</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '8px' }}>Symbol</th>
                  <th style={{ padding: '8px' }}>Sector Rank</th>
                  <th style={{ padding: '8px' }}>Stages</th>
                  <th style={{ padding: '8px' }}>LTP</th>
                  <th style={{ padding: '8px' }}>Buy Zone</th>
                  <th style={{ padding: '8px' }}>Stop Loss</th>
                  <th style={{ padding: '8px' }}>Target 1</th>
                  <th style={{ padding: '8px' }}>Net R:R</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...alphaDesk.qualifiedList, ...alphaDesk.watchlistRadar].slice(0, 6).map((item: any) => {
                  const isSelected = activeDossier?.symbol === item.symbol;
                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => setSelectedSymbol(item.symbol)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 900, color: '#ffffff' }}>{item.symbol}</td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{item.sector} (#{item.sectorRank <= 20 ? item.sectorRank : '—'})</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 6, fontWeight: 800, fontSize: 11,
                          background: item.all5StagesPassed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: item.all5StagesPassed ? '#34d399' : '#fbbf24'
                        }}>
                          {item.stagesPassedCount}/5 Passed
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>Rs. {item.ltp}</td>
                      <td style={{ padding: '8px', color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                        Rs. {item.executionPlan.buyZoneLow}–{item.executionPlan.buyZoneHigh}
                      </td>
                      <td style={{ padding: '8px', color: '#f87171', fontFamily: 'var(--font-mono)' }}>Rs. {item.executionPlan.stopLoss}</td>
                      <td style={{ padding: '8px', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>Rs. {item.executionPlan.target1}</td>
                      <td style={{ padding: '8px', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>{item.executionPlan.netRRR1}:1</td>
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSymbol(item.symbol);
                          }}
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#38bdf8',
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          Load Plan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlphaCommandCenter;
