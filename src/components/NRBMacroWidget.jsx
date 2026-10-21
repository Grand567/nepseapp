/**
 * NRBMacroWidget — NRB Monetary Policy Regime Display
 *
 * Shows the current macro regime (EASING / NEUTRAL / TIGHTENING / CRISIS)
 * based on the interbank lending rate (IBOR) and CD Ratio.
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

export function classifyNrbMacroRegime(interbankRate = 4.5, policyRepoRate = 5.0, cdRatio = 81.5) {
  const ibor = Number.isFinite(Number(interbankRate)) ? Number(interbankRate) : 4.5;
  const repo = Number.isFinite(Number(policyRepoRate)) ? Number(policyRepoRate) : 5.0;
  const cd = Number.isFinite(Number(cdRatio)) ? Number(cdRatio) : 81.5;

  if (ibor > 8.5 || cd > 89.0) {
    return {
      regime: 'CRISIS',
      interbankRate: ibor,
      policyRepoRate: repo,
      cdRatio: cd,
      regimeScore: 0.65,
      regimeGuidance:
        'Severe banking liquidity crunch (IBOR > 8.5% or CD Ratio > 89%). Defend capital, avoid margin leverage, and restrict new equity entries.'
    };
  }
  if (ibor > 6.5 || cd > 86.0) {
    return {
      regime: 'TIGHTENING',
      interbankRate: ibor,
      policyRepoRate: repo,
      cdRatio: cd,
      regimeScore: 0.82,
      regimeGuidance:
        'Monetary tightening regime (IBOR > 6.5% or CD Ratio > 86%). Prioritize high-conviction cash-flow compounders and tighten stop-losses.'
    };
  }
  if (ibor < 3.0 && cd <= 83.5) {
    return {
      regime: 'EASING',
      interbankRate: ibor,
      policyRepoRate: repo,
      cdRatio: cd,
      regimeScore: 1.12,
      regimeGuidance:
        'Excess banking system liquidity (IBOR < 3.0%). Favorable credit expansion and lower BFI base rates support Stage-2 equity breakouts.'
    };
  }
  return {
    regime: 'NEUTRAL',
    interbankRate: ibor,
    policyRepoRate: repo,
    cdRatio: cd,
    regimeScore: 1.0,
    regimeGuidance:
      'Balanced NRB monetary liquidity corridor (IBOR 3.0%–6.5%, CD Ratio ~81.5%). Focus on sector rotation and institutional floorsheet accumulation.'
  };
}

export function buildBaselineNrbMacroData(overrides = {}) {
  const rawRegime = overrides?.macroRegime || {};
  const mp = overrides?.monetaryPolicy || {};
  const ibor = Number(rawRegime.interbankRate ?? mp?.interbankRate?.value ?? 4.5);
  const repo = Number(rawRegime.policyRepoRate ?? mp?.policyRepoRate?.value ?? 5.0);
  const cdRatio = Number(rawRegime.cdRatio ?? mp?.cdRatio?.value ?? 81.5);
  const normalizedRegime = classifyNrbMacroRegime(ibor, repo, cdRatio);

  return {
    liveDataAvailable: Boolean(overrides?.liveDataAvailable),
    source: overrides?.source || 'NRB Monetary Baseline Vault',
    asOf: overrides?.asOf || new Date().toISOString().slice(0, 10),
    macroRegime: {
      ...normalizedRegime,
      ...rawRegime,
      regime: normalizedRegime.regime,
      interbankRate: normalizedRegime.interbankRate,
      policyRepoRate: normalizedRegime.policyRepoRate,
      cdRatio: normalizedRegime.cdRatio,
      regimeScore: rawRegime.regimeScore ?? normalizedRegime.regimeScore,
      regimeGuidance: rawRegime.regimeGuidance || normalizedRegime.regimeGuidance,
    },
    monetaryPolicy: {
      interbankRate: { value: normalizedRegime.interbankRate, isLive: Boolean(mp?.interbankRate?.isLive) },
      policyRepoRate: { value: normalizedRegime.policyRepoRate },
      cdRatio: { value: normalizedRegime.cdRatio },
      cpiInflation: { value: Number(mp?.cpiInflation?.value ?? 4.25) },
      slfRate: { value: Number(mp?.slfRate?.value ?? 6.5) },
      cashReserveRatio: { value: Number(mp?.cashReserveRatio?.value ?? 4.0) },
      statutoryLiquidityRatio: { value: Number(mp?.statutoryLiquidityRatio?.value ?? 12.0) },
      ...mp,
    },
  };
}

export function NRBMacroWidget({ compact = false }) {
  const [macroData, setMacroData] = useState(() => buildBaselineNrbMacroData());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchMacro = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const base = getProxyBase();
      const res = await fetch(`${base}/api/macro/nrb-indicators`, { signal: controller.signal });
      const json = await res.json();
      if (json && json.success && json.data?.macroRegime) {
        setMacroData(buildBaselineNrbMacroData(json.data));
      } else {
        setMacroData(prev => prev || buildBaselineNrbMacroData());
      }
    } catch (_) {
      setMacroData(prev => prev || buildBaselineNrbMacroData());
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacro();
    const interval = setInterval(fetchMacro, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMacro]);

  const activeData = macroData || buildBaselineNrbMacroData();
  const r = activeData.macroRegime;
  const meta = REGIME_META[r.regime] || REGIME_META.NEUTRAL;
  const mp = activeData.monetaryPolicy;

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
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: meta.bg, border: `1px solid ${meta.border}`,
          borderRadius: 20, padding: '4px 12px',
          transition: 'opacity 0.2s'
        }}>
          <span style={{ fontSize: 12 }}>{meta.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: meta.text, letterSpacing: '0.05em' }}>
            {r.regime}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            IBOR {r.interbankRate.toFixed(2)}%
          </span>
          <span style={{ fontSize: 12, color: '#60a5fa' }}>
            CD {Number(r.cdRatio ?? 81.5).toFixed(1)}%
          </span>
          {!activeData.liveDataAvailable && (
            <span title="Verified NRB baseline snapshot active. Verify at nrb.org.np" style={{ fontSize: 12, color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 6, padding: '0 4px' }}>
              {loading ? 'SYNCING' : 'BASELINE'}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#475569' }}>▾</span>
        </div>

        {expanded && (
          <div style={{
            position: 'absolute', top: 34, left: 0, zIndex: 9999,
            background: '#1e2433', border: `1px solid ${meta.border}`,
            borderRadius: 12, padding: '14px 16px', width: 310,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: meta.text, marginBottom: 8 }}>
              {meta.icon} NRB MACRO REGIME: {r.regime}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 10 }}>
              {r.regimeGuidance}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>IBOR</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: meta.text }}>{r.interbankRate.toFixed(2)}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>CD Ratio</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#60a5fa' }}>{Number(r.cdRatio ?? 81.5).toFixed(1)}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Repo Rate</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>{r.policyRepoRate.toFixed(2)}%</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <div style={{ marginBottom: 2 }}>📊 IBOR &lt; 3.0% → EASING (Liquidity Expansion)</div>
              <div style={{ marginBottom: 2 }}>📊 IBOR 3.0–6.5% → NEUTRAL (Balanced Corridor)</div>
              <div style={{ marginBottom: 2 }}>📊 IBOR &gt; 6.5% → TIGHTENING (Credit Contraction)</div>
              <div style={{ marginBottom: 2 }}>📊 IBOR &gt; 8.5% → CRISIS (Liquidity Crunch)</div>
            </div>
            <div style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>
              Source: {activeData.source} · {activeData.asOf}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: meta.bg, border: `1px solid ${meta.border}`,
      borderRadius: 16, padding: '16px 18px', marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 4 }}>
            NRB MONETARY POLICY REGIME
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{meta.icon}</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: meta.text }}>{r.regime}</span>
            <span style={{
              fontSize: 12, background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px', borderRadius: 20, color: '#94a3b8'
            }}>
              Signal Score Multiplier: ×{r.regimeScore}
            </span>
          </div>
        </div>
        <button onClick={fetchMacro} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '4px 8px', color: '#94a3b8', cursor: 'pointer', fontSize: 12
        }}>↻ Refresh</button>
      </div>

      <div style={{
        fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, marginBottom: 14,
        padding: '10px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 10
      }}>
        {r.regimeGuidance}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'IBOR', value: `${r.interbankRate.toFixed(2)}%`, color: meta.text, live: mp?.interbankRate?.isLive },
          { label: 'CD Ratio', value: `${Number(r.cdRatio ?? 81.5).toFixed(1)}%`, color: '#60a5fa' },
          { label: 'Repo Rate', value: `${r.policyRepoRate.toFixed(2)}%`, color: '#ffffff' },
          { label: 'CPI Inflation', value: `${mp?.cpiInflation?.value ?? 4.25}%`, color: '#94a3b8' },
          { label: 'SLF Rate', value: `${mp?.slfRate?.value ?? 6.5}%`, color: '#94a3b8' },
          { label: 'CRR / SLR', value: `${mp?.cashReserveRatio?.value ?? 4.0}% / ${mp?.statutoryLiquidityRatio?.value ?? 12.0}%`, color: '#94a3b8' },
        ].map(({ label, value, color, live }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px'
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>
              {label}
              {live && <span style={{ color: '#34d399', marginLeft: 4, fontSize: 12 }}>● LIVE</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>IBOR REGIME SCALE</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[
            { label: '< 3.0%', name: 'EASING', color: '#34d399', active: r.regime === 'EASING' },
            { label: '3.0–6.5%', name: 'NEUTRAL', color: '#60a5fa', active: r.regime === 'NEUTRAL' },
            { label: '6.5–8.5%', name: 'TIGHTENING', color: '#fbbf24', active: r.regime === 'TIGHTENING' || r.regime === 'TIGHT' },
            { label: '> 8.5%', name: 'CRISIS', color: '#dc2626', active: r.regime === 'CRISIS' },
          ].map(seg => (
            <div key={seg.name} style={{
              flex: 1, padding: '4px 0', textAlign: 'center',
              background: seg.active ? `${seg.color}22` : 'rgba(255,255,255,0.03)',
              border: seg.active ? `1px solid ${seg.color}55` : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6
            }}>
              <div style={{ fontSize: 12, color: seg.active ? seg.color : '#475569', fontWeight: seg.active ? 800 : 400 }}>
                {seg.label}
              </div>
              <div style={{ fontSize: 12, color: seg.active ? seg.color : '#334155', fontWeight: seg.active ? 700 : 400 }}>
                {seg.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#334155' }}>
        Source: {activeData.source} · Last updated: {activeData.asOf}
      </div>
    </div>
  );
}
