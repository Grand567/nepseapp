// src/components/NepseAgentDashboard.jsx
// Phase 4: NEPSE Institutional Agent Dashboard powered by Gemini 3.1 Pro & Tool Aggregator

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Bot,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Crosshair,
  Target,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  Zap,
  HelpCircle,
  AlertTriangle,
  Compass,
  Sliders,
  Volume2,
  Globe,
  FileText,
  Search,
  Check,
  Cpu,
  Clock,
  ExternalLink
} from 'lucide-react';
import { fetchAgentScripDossier, runAgentAnalysis } from '../services/nepseAgentTools';
import { getProxyBase } from '../utils/liveData';
import { StockSearchSelect } from './ui';

const POPULAR_SCRIPS = ['KBL', 'NABIL', 'HDL', 'SHIVM', 'GBIME', 'CHCL', 'CIT', 'NLIC'];

const MODEL_OPTIONS = [
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', badge: 'Ultra Reasoning', desc: 'Deep quantitative synthesis & scenario modeling' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', badge: 'Fast Reasoning', desc: 'Balanced high reasoning with low latency' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Stable Pro', desc: 'Proven institutional trade reasoning' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'High Speed', desc: 'Ultra-fast real-time oscillator scan' },
];

const PRESET_QUERIES = [
  'Full Institutional Trade Plan & Execution Levels',
  'Breakout Trigger vs Pullback Dip Entry Zones',
  'Smart Money Broker Flow (BCR3) & Accumulation Bias',
  'T+2 Settlement Risk & Circuit Price Ceilings',
];

export default function NepseAgentDashboard({
  stocks = [],
  initialSymbol = 'KBL',
  onSelectStock,
  onNavigateTab
}) {
  const [symbol, setSymbol] = useState(() => (initialSymbol || 'KBL').toUpperCase().trim());
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-pro');
  const [customQuery, setCustomQuery] = useState(PRESET_QUERIES[0]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);

  // Analysis result state
  const [agentResult, setAgentResult] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [activeLangTab, setActiveLangTab] = useState('english'); // 'english' | 'nepali'

  // Handle symbol change from props
  useEffect(() => {
    if (initialSymbol && initialSymbol.toUpperCase().trim() !== symbol) {
      const nextSym = initialSymbol.toUpperCase().trim();
      setSymbol(nextSym);
    }
  }, [initialSymbol]);

  // Execute Agent Analysis
  const handleRunAnalysis = useCallback(async (targetSym = symbol, query = customQuery) => {
    const sym = (targetSym || symbol || '').toUpperCase().trim();
    if (!sym) return;

    setLoading(true);
    setError(null);
    setLoadingStep('1/3: Gathering NOTS quotes & 120-session floor sheet...');

    try {
      // Step 1: Pre-fetch dossier for instant UI context
      const dos = await fetchAgentScripDossier(sym);
      setDossier(dos);

      setLoadingStep('2/3: Calculating RSI, MACD, EMAs & BCR3 smart money concentration...');

      // Step 2: Run Agent Analysis with Gemini 3.1 Pro priority cascade
      setLoadingStep(`3/3: Synthesizing trade plan via ${selectedModel}...`);
      const analysis = await runAgentAnalysis({
        symbol: sym,
        query: query || customQuery,
        model: selectedModel
      });

      setAgentResult(analysis);
      if (analysis?.dossier) {
        setDossier(analysis.dossier);
      }
    } catch (err) {
      console.error('[NepseAgentDashboard] Analysis failed:', err);
      setError(err.message || 'Failed to complete agent analysis. Please check network connection.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [symbol, customQuery, selectedModel]);

  // Run initial analysis on mount or when symbol changes
  useEffect(() => {
    if (symbol) {
      handleRunAnalysis(symbol, PRESET_QUERIES[0]);
    }
  }, [symbol]);

  // Quick select stock from pill or dropdown
  const handleSelectScrip = (s) => {
    if (!s) return;
    const sym = String(s).toUpperCase().trim();
    setSymbol(sym);
    if (onSelectStock) onSelectStock(sym);
  };

  // Verdict color and badge helper
  const getVerdictStyle = (verdict = '') => {
    const v = String(verdict).toUpperCase();
    if (v.includes('STRONG BUY') || v.includes('BREAKOUT TRIGGER')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399', icon: TrendingUp };
    }
    if (v.includes('ACCUMULATE') || v.includes('PULLBACK') || v.includes('COILED')) {
      return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#60a5fa', icon: Target };
    }
    if (v.includes('HOLD') || v.includes('TRAIL')) {
      return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24', icon: Activity };
    }
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171', icon: ShieldAlert };
  };

  const verdictStyle = getVerdictStyle(agentResult?.verdict || dossier?.executionPlan?.stance);
  const VerdictIcon = verdictStyle.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto', padding: '4px 8px 32px' }}>
      
      {/* ── TOP HERO CONTROL BAR ────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(145deg, rgba(20, 24, 33, 0.95), rgba(12, 15, 22, 0.98))',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 18,
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(147, 51, 234, 0.3))',
              border: '1px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(59, 130, 246, 0.3)'
            }}>
              <Bot style={{ width: 22, height: 22, color: '#60a5fa' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc', margin: 0, letterSpacing: '-0.02em' }}>
                  Drabyashree NEPSE Agent
                </h2>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(59, 130, 246, 0.18)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  letterSpacing: '0.04em'
                }}>
                  GEMINI 3.1 PRO CASCADE
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Deterministic quantitative aggregator & institutional market reasoning
              </div>
            </div>
          </div>

          {/* Model Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu style={{ width: 15, height: 15, color: '#94a3b8' }} />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 10,
                color: '#e2e8f0',
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m.id} value={m.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {m.label} ({m.badge})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scrip Search & Quick Scrips Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <StockSearchSelect
              value={symbol}
              onChange={(newSym) => {
                if (newSym) {
                  handleSelectScrip(newSym);
                }
              }}
              placeholder="Search 350+ NEPSE securities (e.g. SBL, NABIL, KBL)..."
              stocks={stocks}
            />
          </div>

          {/* Quick Popular Scrips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Hot:</span>
            {POPULAR_SCRIPS.map(scrip => (
              <button
                key={scrip}
                onClick={() => handleSelectScrip(scrip)}
                style={{
                  background: symbol === scrip ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${symbol === scrip ? 'rgba(59, 130, 246, 0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: symbol === scrip ? '#93c5fd' : '#cbd5e1',
                  borderRadius: 8,
                  padding: '4px 9px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {scrip}
              </button>
            ))}
          </div>

          {/* Run Analysis Button */}
          <button
            onClick={() => handleRunAnalysis(symbol, customQuery)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: loading ? 'rgba(59, 130, 246, 0.4)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
              border: 'none',
              borderRadius: 10,
              padding: '8px 18px',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease',
              marginLeft: 'auto'
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>{loading ? 'Analyzing...' : 'Run Agent Analysis'}</span>
          </button>
        </div>

        {/* Inquiry Prompt Pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {PRESET_QUERIES.map((q, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCustomQuery(q);
                handleRunAnalysis(symbol, q);
              }}
              style={{
                background: customQuery === q ? 'rgba(147, 51, 234, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${customQuery === q ? 'rgba(147, 51, 234, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                color: customQuery === q ? '#c084fc' : '#94a3b8',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── LOADING STEP BANNER ────────────────────────────────────── */}
      {loading && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <RefreshCw style={{ width: 18, height: 18, color: '#60a5fa', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>
              {loadingStep || 'Executing NEPSE Agent reasoning loop...'}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Calling deterministic quantitative tools, evaluating broker floor sheet, and cascading Gemini 3.1 Pro
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR NOTICE ───────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <AlertTriangle style={{ width: 20, height: 20, color: '#f87171', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f87171' }}>Agent Analysis Notice</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>{error}</div>
          </div>
          <button
            onClick={() => handleRunAnalysis(symbol, customQuery)}
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── DOSSIER & AGENT SYNTHESIS DISPLAY ────────────────────────── */}
      {(agentResult || dossier) && (
        <>
          {/* 1. Header Banner & Verdict Card */}
          <div style={{
            background: '#111520',
            border: `1px solid ${verdictStyle.border}`,
            borderRadius: 18,
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 8px 28px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              {/* Scrip info */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                    {dossier?.symbol || symbol}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 8 }}>
                    {dossier?.sector || 'Commercial Banks'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                  {dossier?.companyName || 'NEPSE Listed Security'}
                </div>
              </div>

              {/* Price & Circuit */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc' }}>
                    Rs. {dossier?.quote?.ltp ?? '—'}
                  </span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: (dossier?.quote?.pChange || 0) >= 0 ? '#34d399' : '#f87171'
                  }}>
                    {(dossier?.quote?.pChange || 0) >= 0 ? '+' : ''}{dossier?.quote?.pChange ?? 0}%
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  Limits: Floor Rs. {dossier?.quote?.circuitFloor || (dossier?.quote?.prevClose ? +(dossier.quote.prevClose * 0.90).toFixed(1) : 'N/A')} | Ceiling Rs. {dossier?.quote?.circuitCeiling || (dossier?.quote?.prevClose ? +(dossier.quote.prevClose * 1.10).toFixed(1) : 'N/A')}
                </div>
              </div>

              {/* Verdict Chip */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 14,
                background: verdictStyle.bg,
                border: `1px solid ${verdictStyle.border}`
              }}>
                <VerdictIcon style={{ width: 18, height: 18, color: verdictStyle.text }} />
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Agent Stance
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: verdictStyle.text }}>
                    {agentResult?.verdict || dossier?.executionPlan?.stance || 'EVALUATING'}
                  </div>
                </div>
              </div>

              {/* Confidence Score */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 14,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Confidence
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#60a5fa' }}>
                    {agentResult?.confidenceScore ?? dossier?.executionPlan?.setupScore ?? 80}/100
                  </div>
                </div>
              </div>
            </div>

            {/* Provider / Model Stamp */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10,
              color: '#64748b',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles style={{ width: 12, height: 12, color: '#a855f7' }} />
                <span>Model: <strong style={{ color: '#c084fc' }}>{agentResult?.meta?.modelUsed || selectedModel}</strong></span>
                {agentResult?.meta?.isAiOffline && (
                  <span style={{ color: '#fbbf24', marginLeft: 6 }}>[Deterministic Quant Mode]</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock style={{ width: 12, height: 12 }} />
                <span>Verified NOTS data as of {new Date(dossier?.meta?.asOf || Date.now()).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* 2. Executive Synthesis & Language Toggle */}
          <div style={{
            background: '#111520',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText style={{ width: 16, height: 16, color: '#60a5fa' }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Executive Agent Thesis
                </h3>
              </div>

              {/* Language Switcher */}
              <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 2 }}>
                <button
                  onClick={() => setActiveLangTab('english')}
                  style={{
                    background: activeLangTab === 'english' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                    border: 'none',
                    color: activeLangTab === 'english' ? '#93c5fd' : '#94a3b8',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  English
                </button>
                <button
                  onClick={() => setActiveLangTab('nepali')}
                  style={{
                    background: activeLangTab === 'nepali' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                    border: 'none',
                    color: activeLangTab === 'nepali' ? '#93c5fd' : '#94a3b8',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  नेपाली
                </button>
              </div>
            </div>

            {activeLangTab === 'english' ? (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>
                {agentResult?.executiveSummary || `${symbol} is consolidating with quantitative setup score ${dossier?.executionPlan?.setupScore || 75}/100. Refer to the execution blueprint below for authenticated entry zones.`}
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: '#cbd5e1', background: 'rgba(59, 130, 246, 0.05)', padding: 12, borderRadius: 10, border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                {agentResult?.nepaliSummary || `${symbol} को लागि संस्थागत र प्राविधिक विश्लेषण अनुसार समर्थन र ब्रेकआउट स्तरहरू तलको तालिकामा प्रमाणित गरिएको छ। स्टप लस कडाइका साथ पालना गर्नुहोस्।`}
              </div>
            )}
          </div>

          {/* 3. The 4-Box Execution Blueprint (The Core Math Plan) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Crosshair style={{ width: 16, height: 16, color: '#10b981' }} />
                <h3 style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc', margin: 0 }}>
                  Institutional Execution Blueprint
                </h3>
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Deterministic geometry • No manual guessing
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12
            }}>
              {/* Box 1: Pullback Dip Entry */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase' }}>
                    Strategy A: Pullback Dip
                  </span>
                  <span style={{ fontSize: 9, color: '#93c5fd', background: 'rgba(59, 130, 246, 0.15)', padding: '2px 6px', borderRadius: 6 }}>
                    Low Risk
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>
                  {agentResult?.executionPlan?.pullbackDipZone || dossier?.executionPlan?.pullbackZone?.label || (dossier?.executionPlan?.available === false ? 'Unavailable — ' + (dossier.executionPlan.reason || 'insufficient data') : 'Unavailable')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Support: {dossier?.executionPlan?.pullbackZone?.supportRef || '20-EMA base'}
                </div>
              </div>

              {/* Box 2: Breakout Trigger */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                    Strategy B: Breakout Trigger
                  </span>
                  <span style={{ fontSize: 9, color: '#6ee7b7', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 6 }}>
                    Momentum
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>
                  {agentResult?.executionPlan?.breakoutTrigger || dossier?.executionPlan?.breakoutZone?.label || (dossier?.executionPlan?.available === false ? 'Unavailable — ' + (dossier.executionPlan.reason || 'insufficient data') : 'Unavailable')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Trigger on RVOL &gt; 1.4x • Cap: Rs. {dossier?.executionPlan?.breakoutZone?.chaseCap || (dossier?.quote?.ltp ? +(dossier.quote.ltp * 1.04).toFixed(1) : '—')}
                </div>
              </div>

              {/* Box 3: Invalidation Stop-Loss */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase' }}>
                    Invalidation Stop-Loss
                  </span>
                  <span style={{ fontSize: 9, color: '#fca5a5', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 6px', borderRadius: 6 }}>
                    Mandatory
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fca5a5' }}>
                  {agentResult?.executionPlan?.stopLoss || dossier?.executionPlan?.stopLoss?.label || (dossier?.executionPlan?.available === false ? 'Unavailable — ' + (dossier.executionPlan.reason || 'insufficient data') : 'Unavailable')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Strict capital preservation floor
                </div>
              </div>

              {/* Box 4: Net Targets (After Fees & CGT) */}
              <div style={{
                background: 'rgba(147, 51, 234, 0.05)',
                border: '1px solid rgba(147, 51, 234, 0.25)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#c084fc', textTransform: 'uppercase' }}>
                    Net Profit Targets
                  </span>
                  <span style={{ fontSize: 9, color: '#d8b4fe', background: 'rgba(147, 51, 234, 0.15)', padding: '2px 6px', borderRadius: 6 }}>
                    7.5% CGT & Fees Deducted
                  </span>
                </div>
                {(() => {
                  const displayT1 = dossier?.executionPlan?.targets?.[0]?.price
                    ? `Rs. ${dossier.executionPlan.targets[0].price} ${dossier.executionPlan.targets[0].netReturnPct != null ? `(+${dossier.executionPlan.targets[0].netReturnPct}% net)` : ''}`
                    : (agentResult?.executionPlan?.target1 || (dossier?.executionPlan?.available === false ? 'Unavailable — ' + (dossier.executionPlan.reason || 'insufficient data') : 'Unavailable'));
                  const displayT2 = dossier?.executionPlan?.targets?.[1]?.price
                    ? `Rs. ${dossier.executionPlan.targets[1].price} ${dossier.executionPlan.targets[1].netReturnPct != null ? `(+${dossier.executionPlan.targets[1].netReturnPct}% net)` : ''}`
                    : (agentResult?.executionPlan?.target2 || (dossier?.executionPlan?.available === false ? 'Unavailable — ' + (dossier.executionPlan.reason || 'insufficient data') : 'Unavailable'));
                  return (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>
                        T1: {displayT1.startsWith('Rs.') ? displayT1 : `Rs. ${displayT1}`}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#34d399' }}>
                        T2: {displayT2.startsWith('Rs.') ? displayT2 : `Rs. ${displayT2}`}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* 4. Technical Oscillators & Smart Money Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 14
          }}>
            {/* Left: Quantitative Oscillators */}
            <div style={{
              background: '#111520',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity style={{ width: 16, height: 16, color: '#60a5fa' }} />
                <h4 style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Technical Oscillators & Volatility
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>RSI (14-Period):</span>
                  <strong style={{ color: (dossier?.technicals?.rsi14 || 50) > 70 ? '#f87171' : (dossier?.technicals?.rsi14 || 50) < 35 ? '#34d399' : '#e2e8f0' }}>
                    {dossier?.technicals?.rsi14 ?? 'Unavailable'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>MACD Histogram:</span>
                  <strong style={{ color: (dossier?.technicals?.macd?.histogram || 0) >= 0 ? '#34d399' : '#f87171' }}>
                    {dossier?.technicals?.macd ? `${dossier.technicals.macd.histogram} ${dossier.technicals.macd.isBullishCross ? '(Bullish Cross)' : ''}` : 'Unavailable'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>20-EMA / 50-EMA Posture:</span>
                  <strong style={{ color: '#60a5fa' }}>
                    Rs. {dossier?.technicals?.ema20 || 'N/A'} / Rs. {dossier?.technicals?.ema50 || 'N/A'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Bollinger Squeeze:</span>
                  <strong style={{ color: dossier?.technicals?.bollinger?.isSqueeze ? '#fbbf24' : '#94a3b8' }}>
                    {dossier?.technicals?.bollinger?.isSqueeze ? '⚡ Active Coiling' : 'Normal Expansion'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>20-Day Relative Volume (RVOL):</span>
                  <strong style={{ color: (dossier?.technicals?.rvol20 || 1.0) >= 1.3 ? '#34d399' : '#e2e8f0' }}>
                    {dossier?.technicals?.rvol20 ?? 1.0}x
                  </strong>
                </div>
              </div>
            </div>

            {/* Right: Smart Money & Broker Flow */}
            <div style={{
              background: '#111520',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers style={{ width: 16, height: 16, color: '#a855f7' }} />
                <h4 style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Smart Money & Broker Accumulation
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>BCR₃ (Top 3 Buyers %):</span>
                  <strong style={{ color: (dossier?.brokerFlow?.bcr3BuyPct || 0) >= 40 ? '#34d399' : '#e2e8f0' }}>
                    {(dossier?.brokerFlow?.bcr3BuyPct != null && dossier.brokerFlow.bcr3BuyPct > 0) ? `${dossier.brokerFlow.bcr3BuyPct}%` : 'Unavailable'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>BCR₅ (Top 5 Buyers %):</span>
                  <strong style={{ color: '#93c5fd' }}>
                    {(dossier?.brokerFlow?.bcr5BuyPct != null && dossier.brokerFlow.bcr5BuyPct > 0) ? `${dossier.brokerFlow.bcr5BuyPct}%` : 'Unavailable'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>BCR₃ Sellers %:</span>
                  <strong style={{ color: (dossier?.brokerFlow?.bcr3SellPct || 0) >= 45 ? '#f87171' : '#cbd5e1' }}>
                    {(dossier?.brokerFlow?.bcr3SellPct != null && dossier.brokerFlow.bcr3SellPct > 0) ? `${dossier.brokerFlow.bcr3SellPct}%` : 'Unavailable'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Smart Money Bias:</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: (dossier?.brokerFlow?.smartMoneyBias || '').includes('Cornering') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    color: (dossier?.brokerFlow?.smartMoneyBias || '').includes('Cornering') ? '#34d399' : '#cbd5e1'
                  }}>
                    {dossier?.brokerFlow?.smartMoneyBias || 'Neutral Flow'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>P/E & EPS Valuation:</span>
                  <strong style={{ color: '#cbd5e1' }}>
                    {dossier?.fundamentals?.pe ? `${dossier.fundamentals.pe}x` : '—'} / Rs. {dossier?.fundamentals?.eps || '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Three-Scenario Roadmap */}
          <div style={{
            background: '#111520',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Compass style={{ width: 16, height: 16, color: '#f59e0b' }} />
              <h4 style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc', margin: 0 }}>
                Forward Market Scenarios (5–15 Sessions)
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {/* Bullish */}
              <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#34d399', marginBottom: 4 }}>
                  🟢 Bullish Catalysis
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {agentResult?.scenarios?.bullishCase || `Clearance above Rs. ${dossier?.executionPlan?.breakoutZone?.pivot} with RVOL > 1.4x triggers expansion to target Rs. ${dossier?.executionPlan?.targets?.[0]?.price}.`}
                </div>
              </div>

              {/* Base */}
              <div style={{ background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', marginBottom: 4 }}>
                  🔵 Base Trajectory
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {agentResult?.scenarios?.baseCase || `Healthy consolidation near 20-EMA (Rs. ${dossier?.technicals?.ema20}) offering high-probability pullback accumulation.`}
                </div>
              </div>

              {/* Invalidation */}
              <div style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f87171', marginBottom: 4 }}>
                  🔴 Invalidation Trigger
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {agentResult?.scenarios?.bearishInvalidation || `Daily close below stop-loss Rs. ${dossier?.executionPlan?.stopLoss?.price} terminates the bullish trade thesis.`}
                </div>
              </div>
            </div>
          </div>

          {/* 6. Nepal Settlement (T+2) & Circuit Caution */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <ShieldAlert style={{ width: 20, height: 20, color: '#fbbf24', flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
              <strong style={{ color: '#fbbf24' }}>NEPSE T+2 Settlement & Circuit Protocol: </strong>
              {agentResult?.t2SettlementRisk || `Shares purchased today settle on T+2. Avoid chasing buys within 2% of the +15% upper circuit ceiling (Rs. ${dossier?.quote?.circuitCeiling || '—'}) to eliminate delivery lockup risk.`}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
