// src/components/analyzer/OneClickAlphaButton.jsx
import React, { useState, useCallback } from 'react';
import {
  Zap,
  ShieldCheck,
  ShieldAlert,
  Crown,
  Target,
  TrendingUp,
  Lock,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import {
  runUnifiedFiveStepAlphaDesk,
  getStageFailureReason
} from '../../utils/masterAlphaPipeline';
import { getUserConfiguredCapital } from '../../utils/dynamicCapitalEngine';

export function OneClickAlphaButton({
  stocks = [],
  indices = {},
  userCapital,
  onSelectStock,
  onExecutePaperOrder,
  onNavigateTab
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showRadar, setShowRadar] = useState(false);

  const effectiveCapital = userCapital || getUserConfiguredCapital() || 100000;

  const handleRunAlphaScan = useCallback(() => {
    setIsScanning(true);
    setTimeout(() => {
      try {
        const desk = runUnifiedFiveStepAlphaDesk({
          stocks,
          indices,
          userCapital: effectiveCapital,
          riskTolerancePct: 1.5,
          requiredNetRRR: 2.5,
          cgtRate: 0.075
        });
        setScanResult(desk);
      } catch (err) {
        console.error('[OneClickAlphaButton] Scan error:', err);
      } finally {
        setIsScanning(false);
      }
    }, 500);
  }, [stocks, indices, effectiveCapital]);

  const primePick = scanResult?.primePick;
  const ep = primePick?.executionPlan;

  const handleCopyTms = (dossier) => {
    if (!dossier) return;
    const p = dossier.executionPlan;
    const text =
      `👑 5-STAGE ALPHA EXECUTION TICKET:\n` +
      `• Scrip: ${dossier.symbol} (${dossier.sector} - Rank #${dossier.sectorRank})\n` +
      `• Limit Buy Zone: Rs. ${p.buyZoneLow} - Rs. ${p.buyZoneHigh} (Chase Cap: Rs. ${p.chaseCap})\n` +
      `• Size: ${p.recommendedKitta} Kitta (Tranche 1: ${p.tranche1Kitta} | Tranche 2 post-T+2: ${p.tranche2Kitta})\n` +
      `• Hard Stop-Loss: Rs. ${p.stopLoss} (-${p.stopLossPct}%)\n` +
      `• Target 1: Rs. ${p.target1} (Move SL to Breakeven Rs. ${p.statutoryBreakevenPrice})\n` +
      `• Target 2: Rs. ${p.target2} | Net Ladder Gain: +Rs. ${p.maximizedLadderNetProfit.toLocaleString('en-IN')}`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Trigger Button Bar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(15, 23, 42, 0.95))',
        border: '1.5px solid rgba(16, 185, 129, 0.4)',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} color="#34d399" />
            <span>5-STAGE QUANT SCAN & 1D/3D/5D AI PREDICTOR</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
            Evaluates Sector RS, 8-Gate Quality, Wyckoff VDU & Broker Flow, Half-Kelly Sizing, and ±15% Circuit Band.
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunAlphaScan}
          disabled={isScanning}
          style={{
            background: isScanning ? 'rgba(16, 185, 129, 0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 10,
            padding: '8px 18px',
            fontSize: 12.5,
            fontWeight: 900,
            cursor: isScanning ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
          }}
        >
          <Zap size={14} style={{ fill: '#ffffff' }} />
          <span>{isScanning ? 'Evaluating 340+ Stocks...' : '⚡ Run 5-Stage Alpha Scan & Predict'}</span>
        </button>
      </div>

      {/* When scan completed */}
      {scanResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Case 1: 1+ Stock Passed all 5 stages */}
          {primePick ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.98))',
              border: '1.5px solid rgba(16, 185, 129, 0.55)',
              borderRadius: 16,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Crown size={20} color="#fbbf24" />
                    <span style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {primePick.symbol}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)'
                    }}>
                      #1 PRIME PICK OF THE DAY (5/5 PASSED)
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                    {primePick.name} • {primePick.sector} (Rank #{primePick.sectorRank}) • Confluence Score: {primePick.setupScore}/100
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    Rs. {primePick.ltp}
                  </div>
                  <div style={{ fontSize: 11.5, color: primePick.pChange >= 0 ? '#34d399' : '#f87171', fontWeight: 800 }}>
                    {primePick.pChange >= 0 ? '+' : ''}{primePick.pChange}%
                  </div>
                </div>
              </div>

              {/* 1D / 3D / 5D AI Probabilities */}
              {primePick.prediction?.horizons && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                  background: 'rgba(0,0,0,0.3)',
                  padding: '10px',
                  borderRadius: 10
                }}>
                  {['1D', '3D', '5D'].map((h) => {
                    const data = primePick.prediction.horizons[h];
                    return (
                      <div key={h} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{h} Win Rate</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: data?.isActionableBullish ? '#34d399' : '#cbd5e1' }}>
                          {data?.probabilityPct ?? 50}%
                        </div>
                        <div style={{ fontSize: 10, color: data?.isActionableBullish ? '#10b981' : '#64748b' }}>
                          {data?.isActionableBullish ? 'High Conviction' : 'Neutral'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Key Execution Metrics */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 8
              }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Order Allocation</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>{ep?.recommendedKitta ?? 0} Kitta</div>
                  <div style={{ fontSize: 10, color: '#38bdf8' }}>T1: {ep?.tranche1Kitta ?? 0} | T2: {ep?.tranche2Kitta ?? 0}</div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.06)', padding: '8px 10px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#34d399' }}>Buy Zone</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#34d399' }}>Rs. {ep?.buyZoneLow}–{ep?.buyZoneHigh}</div>
                  <div style={{ fontSize: 10, color: '#fbbf24' }}>Cap: Rs. {ep?.chaseCap}</div>
                </div>
                <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '8px 10px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#f87171' }}>Stop-Loss</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#f87171' }}>Rs. {ep?.stopLoss}</div>
                  <div style={{ fontSize: 10, color: '#cbd5e1' }}>Risk: Rs. {ep?.maxRiskRupees?.toLocaleString('en-IN') ?? 0}</div>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.06)', padding: '8px 10px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#38bdf8' }}>Target 1</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#38bdf8' }}>Rs. {ep?.target1}</div>
                  <div style={{ fontSize: 10, color: '#34d399' }}>Move SL ➔ Rs. {ep?.statutoryBreakevenPrice}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleCopyTms(primePick)}
                  style={{
                    background: copied ? '#10b981' : 'rgba(56, 189, 248, 0.15)',
                    color: copied ? '#080c14' : '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Copy size={13} />
                  <span>{copied ? 'Ticket Copied!' : 'Copy TMS Order Ticket'}</span>
                </button>

                {onSelectStock && (
                  <button
                    type="button"
                    onClick={() => onSelectStock(primePick.rawStock)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    View Full Analysis
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Case 2: 0 Stocks passed all 5 stages */
            <div style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.95))',
              border: '1.5px solid rgba(245, 158, 11, 0.45)',
              borderRadius: 14,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24', fontSize: 13.5, fontWeight: 900 }}>
                <ShieldAlert size={20} />
                <span>🛡️ CASH PRESERVATION MODE LOCKOUT — 0 STOCKS QUALIFIED TODAY</span>
              </div>
              <p style={{ fontSize: 12, color: '#cbd5e1', margin: 0, lineHeight: 1.45 }}>
                None of the 340+ NEPSE stocks satisfied all 5 institutional stages simultaneously today. Keeping capital in cash prevents drawdowns in neutral or choppy sessions.
              </p>
            </div>
          )}

          {/* Radar Runner-Ups */}
          {scanResult.watchlistRadar?.length > 0 && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <button
                type="button"
                onClick={() => setShowRadar(!showRadar)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 800
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} color="#fbbf24" />
                  <span>WATCHLIST RADAR RUNNER-UPS ({scanResult.watchlistRadar.length} Stocks Passing 3–4 Stages)</span>
                </span>
                {showRadar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showRadar && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                        <th style={{ padding: '6px' }}>Symbol</th>
                        <th style={{ padding: '6px' }}>Stages</th>
                        <th style={{ padding: '6px' }}>3D AI Prob</th>
                        <th style={{ padding: '6px' }}>Buy Zone</th>
                        <th style={{ padding: '6px' }}>Net R:R</th>
                        <th style={{ padding: '6px' }}>Why Blocked Today (Missing Trigger)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.watchlistRadar.map((r) => (
                        <tr key={r.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px', fontWeight: 900, color: '#ffffff' }}>
                            <button
                              type="button"
                              onClick={() => onSelectStock && onSelectStock(r.rawStock)}
                              style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, fontWeight: 900 }}
                            >
                              {r.symbol}
                            </button>
                            <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>({r.sector})</span>
                          </td>
                          <td style={{ padding: '6px' }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 4, background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24', fontWeight: 800, fontSize: 10.5
                            }}>
                              {r.stagesPassedCount}/5
                            </span>
                          </td>
                          <td style={{ padding: '6px', color: '#34d399', fontWeight: 800 }}>
                            {r.prediction?.horizons?.['3D']?.probabilityPct ?? 50}%
                          </td>
                          <td style={{ padding: '6px', color: '#cbd5e1' }}>
                            Rs. {r.executionPlan?.buyZoneLow}–{r.executionPlan?.buyZoneHigh}
                          </td>
                          <td style={{ padding: '6px', color: '#fbbf24', fontWeight: 800 }}>
                            {r.executionPlan?.netRRR1}:1
                          </td>
                          <td style={{ padding: '6px', color: '#fca5a5', fontSize: 11 }}>
                            {getStageFailureReason(r)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OneClickAlphaButton;
