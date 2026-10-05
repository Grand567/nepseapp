/**
 * NRBMacroWidget — NRB Monetary Policy Regime Display
 *
 * Shows the current macro regime (EASING / NEUTRAL / TIGHTENING / TIGHT / CRISIS)
 * based on the interbank lending rate (IBOR). This is the #1 predictor of NEPSE
 * direction — more important than any technical indicator.
 *
 * Can be rendered in two modes:
 *   compact={true}  → small banner strip for Dashboard header
 *   compact={false} → full card with guidance (for Settings / macro panel)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getProxyBase } from '../utils/liveData';

const REGIME_META = {
  EASING:     { icon: '🟢', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.30)',   text: '#34d399' },
  NEUTRAL:    { icon: '🔵', bg: 'rgba(96,165,250,0.08)',   border: 'rgba(96,165,250,0.30)',   text: '#60a5fa' },
  TIGHTENING: { icon: '🟡', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.30)',   text: '#fbbf24' },
  TIGHT:      { icon: '🔴', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.30)',  text: '#f87171' },
  CRISIS:     { icon: '🚨', bg: 'rgba(220,38,38,0.10)',    border: 'rgba(220,38,38,0.40)',    text: '#dc2626' },
};

export function NRBMacroWidget({ compact = false }) {
  const [macroData, setMacroData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchMacro = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getProxyBase();
      const res = await fetch(`${base}/api/macro/nrb-indicators`, { timeout: 10000 });
      const json = await res.json();
      if (json.success && json.data?.macroRegime) {
        setMacroData(json.data);
      } else {
        setError('NRB data unavailable');
      }
    } catch (e) {
      setError('NRB data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacro();
    // Refresh every 6 hours
    const interval = setInterval(fetchMacro, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMacro]);

  if (loading) {
    return compact
      ? <span style={{ fontSize: 10, color: '#475569', padding: '2px 8px' }}>NRB Loading…</span>
      : null;
  }

  if (error || !macroData) {
    return compact
      ? <span style={{ fontSize: 10, color: '#475569', padding: '2px 8px' }}>NRB Offline</span>
      : null;
  }

  const r = macroData.macroRegime;
  const meta = REGIME_META[r.regime] || REGIME_META.NEUTRAL;
  const mp = macroData.monetaryPolicy;

  // ── COMPACT MODE (banner strip for Dashboard header) ─────────────────
  if (compact) {
    return (
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          position: 'relative',
          display: 'inline-flex', flexDirection: 'column',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        {/* Strip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: meta.bg, border: `1px solid ${meta.border}`,
          borderRadius: 20, padding: '4px 12px',
          transition: 'opacity 0.2s'
        }}>
          <span style={{ fontSize: 12 }}>{meta.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: meta.text, letterSpacing: '0.05em' }}>
            {r.regime}
          </span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
            IBOR {r.interbankRate.toFixed(2)}%
          </span>
          <span style={{ fontSize: 10, color: '#60a5fa' }}>
            Repo {r.policyRepoRate.toFixed(2)}%
          </span>
          {!macroData.liveDataAvailable && (
            <span title="Live NRB rate could not be scraped; showing last stored baseline. Verify at nrb.org.np" style={{ fontSize: 8, color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 6, padding: '0 4px' }}>
              BASELINE
            </span>
          )}
          <span style={{ fontSize: 9, color: '#475569' }}>▾</span>
        </div>

        {/* Dropdown guidance panel */}
        {expanded && (
          <div style={{
            position: 'absolute', top: 34, left: 0, zIndex: 9999,
            background: '#1e2433', border: `1px solid ${meta.border}`,
            borderRadius: 12, padding: '14px 16px', width: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: meta.text, marginBottom: 8 }}>
              {meta.icon} NRB MACRO REGIME: {r.regime}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 10 }}>
              {r.regimeGuidance}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>IBOR (Interbank)</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: meta.text }}>{r.interbankRate.toFixed(2)}%</div>
                {mp?.interbankRate?.isLive && (
                  <div style={{ fontSize: 8, color: '#34d399', marginTop: 2 }}>● LIVE</div>
                )}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>Policy Repo Rate</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>{r.policyRepoRate.toFixed(2)}%</div>
              </div>
            </div>
            {/* Regime history context */}
            <div style={{ fontSize: 9, color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <div style={{ marginBottom: 2 }}>📊 IBOR &lt; 3% → EASING (2078–2079 bull: NEPSE 3200)</div>
              <div style={{ marginBottom: 2 }}>📊 IBOR 3–6% → NEUTRAL (2080–2081 recovery)</div>
              <div style={{ marginBottom: 2 }}>📊 IBOR &gt; 7% → TIGHTENING (2079 crash: NEPSE −44%)</div>
            </div>
            <div style={{ fontSize: 8, color: '#334155', marginTop: 6 }}>
              Source: {macroData.source} · {macroData.asOf}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── FULL CARD MODE ────────────────────────────────────────────────────
  return (
    <div style={{
      background: meta.bg, border: `1px solid ${meta.border}`,
      borderRadius: 16, padding: '16px 18px', marginBottom: 16
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 4 }}>
            NRB MONETARY POLICY REGIME
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{meta.icon}</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: meta.text }}>{r.regime}</span>
            <span style={{
              fontSize: 10, background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px', borderRadius: 20, color: '#94a3b8'
            }}>
              Signal Score Multiplier: ×{r.regimeScore}
            </span>
          </div>
        </div>
        <button onClick={fetchMacro} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '4px 8px', color: '#94a3b8', cursor: 'pointer', fontSize: 10
        }}>↻ Refresh</button>
      </div>

      {/* Guidance */}
      <div style={{
        fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, marginBottom: 14,
        padding: '10px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 10
      }}>
        {r.regimeGuidance}
      </div>

      {/* Key rates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'IBOR', value: `${r.interbankRate.toFixed(2)}%`, color: meta.text, live: mp?.interbankRate?.isLive },
          { label: 'Repo Rate', value: `${r.policyRepoRate.toFixed(2)}%`, color: '#ffffff' },
          { label: 'CPI Inflation', value: `${mp?.cpiInflation?.value ?? 4.1}%`, color: '#94a3b8' },
          { label: 'SLF Rate', value: `${mp?.slfRate?.value ?? 7.0}%`, color: '#94a3b8' },
          { label: 'CRR', value: `${mp?.cashReserveRatio?.value ?? 4.0}%`, color: '#94a3b8' },
          { label: 'SLR', value: `${mp?.statutoryLiquidityRatio?.value ?? 12.0}%`, color: '#94a3b8' },
        ].map(({ label, value, color, live }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px'
          }}>
            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>
              {label}
              {live && <span style={{ color: '#34d399', marginLeft: 4, fontSize: 8 }}>● LIVE</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Regime scale */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>IBOR REGIME SCALE</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[
            { label: '< 3%', name: 'EASING', color: '#34d399', active: r.regime === 'EASING' },
            { label: '3–5%', name: 'NEUTRAL', color: '#60a5fa', active: r.regime === 'NEUTRAL' },
            { label: '5–7.5%', name: 'TIGHTENING', color: '#fbbf24', active: r.regime === 'TIGHTENING' },
            { label: '7.5–10%', name: 'TIGHT', color: '#f87171', active: r.regime === 'TIGHT' },
            { label: '> 10%', name: 'CRISIS', color: '#dc2626', active: r.regime === 'CRISIS' },
          ].map(seg => (
            <div key={seg.name} style={{
              flex: 1, padding: '4px 0', textAlign: 'center',
              background: seg.active ? `${seg.color}22` : 'rgba(255,255,255,0.03)',
              border: seg.active ? `1px solid ${seg.color}55` : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6
            }}>
              <div style={{ fontSize: 8, color: seg.active ? seg.color : '#475569', fontWeight: seg.active ? 800 : 400 }}>
                {seg.label}
              </div>
              <div style={{ fontSize: 7, color: seg.active ? seg.color : '#334155', fontWeight: seg.active ? 700 : 400 }}>
                {seg.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 9, color: '#334155' }}>
        Source: {macroData.source} · Last updated: {macroData.asOf}
      </div>
    </div>
  );
}
