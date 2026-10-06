import React, { useMemo } from 'react';
import {
  calculateFundamentalSummary,
  computeSectorComparison,
  getSectorBenchmark,
} from '../../utils/fundamentals';

/**
 * FundamentalValuationCard — Batch D UI
 * Shows sector-relative PE/PBV/ROE vs sector median, valuation verdict,
 * fundamental score, peer rank, and always-visible disclaimer.
 */
export function FundamentalValuationCard({ stock, allStocks = [] }) {
  const summary = useMemo(() => {
    if (!stock || !stock.symbol) return null;
    return calculateFundamentalSummary(stock);
  }, [stock]);

  const peerComp = useMemo(() => {
    if (!allStocks || allStocks.length < 4 || !stock?.symbol) return null;
    return computeSectorComparison(allStocks, stock.symbol);
  }, [allStocks, stock?.symbol]);

  if (!summary) return null;

  const { valuation, fundamentalScore, fundamentalRating, fundamentalReasons, sectorName, disclaimer } = summary;
  const bench = getSectorBenchmark(stock?.sector || '');
  const isBfi = bench.minCAR != null;

  // Colour mapping
  const verdictColor = {
    UNDERVALUED: '#10b981',
    SLIGHTLY_UNDERVALUED: '#34d399',
    FAIR: '#60a5fa',
    SLIGHTLY_OVERVALUED: '#fbbf24',
    OVERVALUED: '#f87171',
  }[valuation.verdict] || '#94a3b8';

  const ratingColor = {
    'Strong Buy': '#10b981',
    'Buy': '#34d399',
    'Hold': '#60a5fa',
    'Underperform': '#fbbf24',
    'Avoid': '#f87171',
  }[fundamentalRating] || '#94a3b8';

  const metricStatus = (val, median, lowerIsBetter = false) => {
    if (!val || !median) return '#64748b';
    const r = val / median;
    if (lowerIsBetter) return r <= 0.85 ? '#10b981' : r <= 1.15 ? '#60a5fa' : r > 1.5 ? '#f87171' : '#fbbf24';
    return r >= 1.2 ? '#10b981' : r >= 0.8 ? '#60a5fa' : '#f87171';
  };

  const Row = ({ label, val, median, unit = '', lowerIsBetter = false, warn }) => {
    const isNegative = typeof val === 'number' && val < 0;
    const color = warn || isNegative ? '#f87171' : metricStatus(val, median, lowerIsBetter);
    let formattedVal = '—';
    if (val !== null && val !== undefined && !isNaN(val)) {
      const absVal = Math.abs(val).toFixed(1);
      if (label === 'P/E') {
        formattedVal = isNegative ? `-${absVal}x (Loss)` : `${absVal}x`;
      } else if (label.includes('Rs') || unit.includes('Rs')) {
        formattedVal = isNegative ? `-Rs. ${absVal}` : `Rs. ${absVal}`;
      } else if (unit.includes('%') || label.includes('%')) {
        formattedVal = isNegative ? `-${absVal}%` : `${absVal}%`;
      } else {
        formattedVal = `${isNegative ? '-' : ''}${unit}${absVal}`;
      }
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 6, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
          {formattedVal}
        </span>
        <span style={{ fontSize: 12, color: '#475569' }}>
          {median ? `Sector: ${unit}${median}` : '—'}
        </span>
      </div>
    );
  };

  // Explanation bullets (combine valuation explanation + fundamentalReasons, deduplicate, max 3)
  const bullets = [...(valuation.explanation || []), ...(fundamentalReasons || [])]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);

  return (
    <div style={{
      background: '#0f1520',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '14px 16px',
      marginTop: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Fundamental Valuation
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 1 }}>{sectorName}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Valuation verdict pill */}
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
            background: `${verdictColor}18`, border: `1px solid ${verdictColor}40`, color: verdictColor,
          }}>
            {valuation.verdict.replace('_', ' ')}
          </span>
          {/* Rating chip */}
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
            background: `${ratingColor}18`, border: `1px solid ${ratingColor}40`, color: ratingColor,
          }}>
            {fundamentalRating}
          </span>
        </div>
      </div>

      {/* Reporting Period & Data Freshness Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 11px', borderRadius: 8,
        background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.22)',
        marginBottom: 12, fontSize: 12, lineHeight: 1.45
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⏱️</span>
        <div>
          <span style={{ fontWeight: 800, color: '#ffffff' }}>Filing: {summary.reportingPeriod || 'Audited Annual'}</span>
          <span style={{ color: '#94a3b8', marginLeft: 6 }}>
            NEPSE fundamental metrics (EPS, P/E) reflect periodic filings and are not real-time. Verify with latest quarterly results.
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Fundamental Score</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: ratingColor, fontFamily: 'var(--font-mono)' }}>
            {fundamentalScore}/100
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: `${fundamentalScore}%`,
            background: fundamentalScore >= 70 ? '#10b981' : fundamentalScore >= 50 ? '#60a5fa' : fundamentalScore >= 35 ? '#fbbf24' : '#f87171',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Metrics vs sector */}
      {(summary.pe != null || summary.eps != null || summary.pbv > 0 || summary.roe != null) ? (
        <div style={{ marginBottom: 10 }}>
          <Row label="P/E" val={summary.pe} median={bench.medianPE} lowerIsBetter />
          <Row label="P/BV" val={summary.pbv} median={bench.medianPBV} lowerIsBetter />
          <Row label="ROE %" val={summary.roe} median={bench.medianROE} unit="%" />
          <Row label="EPS Rs." val={summary.eps} median={bench.medianEPS} />
          {summary.bookValue > 0 && (
            <Row label="Book Value" val={summary.bookValue} median={null} unit="Rs. " />
          )}
          {summary.divYield > 0 && (
            <Row label="Div Yield %" val={summary.divYield} median={null} unit="%" />
          )}
          {isBfi && summary.npl > 0 && (
            <Row label="NPL %" val={summary.npl} median={bench.medianNPL} lowerIsBetter warn={summary.npl > bench.maxNPL} unit="%" />
          )}
          {isBfi && summary.car > 0 && (
            <Row label="CAR %" val={summary.car} median={bench.minCAR} warn={summary.car < bench.minCAR} unit="%" />
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '4px 8px',
            borderRadius: 6,
            marginBottom: 8
          }}>
            ℹ️ Sector Baseline Model (Company filings pending — showing {bench.name || 'sector'} medians)
          </div>
          <Row label="P/E" val={bench.medianPE} median={bench.medianPE} lowerIsBetter />
          <Row label="P/BV" val={bench.medianPBV} median={bench.medianPBV} lowerIsBetter />
          <Row label="ROE %" val={bench.medianROE} median={bench.medianROE} unit="%" />
          <Row label="EPS Rs." val={bench.medianEPS} median={bench.medianEPS} />
          <Row label="Book Value" val={stock?.ltp && bench.medianPBV ? +(stock.ltp / bench.medianPBV).toFixed(1) : +(bench.medianEPS * (bench.medianPE || 16) / (bench.medianPBV || 1.6)).toFixed(1)} median={null} unit="Rs. " />
          {isBfi && (
            <>
              <Row label="NPL %" val={bench.medianNPL || 2.5} median={bench.medianNPL} lowerIsBetter unit="%" />
              <Row label="CAR %" val={bench.minCAR || 11.5} median={bench.minCAR} unit="%" />
            </>
          )}
        </div>
      )}

      {/* Explanation bullets */}
      {bullets.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {bullets.map((b, i) => {
            const isWarn = b.includes('⚠️') || b.includes('below') || b.includes('Loss') || b.includes('expensive') || b.includes('Overval');
            return (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, color: isWarn ? '#f59e0b' : '#10b981', flexShrink: 0, marginTop: 1 }}>
                  {isWarn ? '⚠' : '✓'}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>{b}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Peer Rank */}
      {peerComp && peerComp.peerCount >= 3 && peerComp.pe?.rank && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          {peerComp.pe?.rank && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              P/E Rank: <span style={{ fontWeight: 700, color: peerComp.pe.percentile >= 60 ? '#10b981' : '#fbbf24' }}>
                #{peerComp.pe.rank}/{peerComp.pe.totalPeers}
              </span>
              <span style={{ color: '#475569' }}> in {peerComp.sectorName}</span>
            </div>
          )}
          {peerComp.eps?.rank && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              EPS Rank: <span style={{ fontWeight: 700, color: peerComp.eps.percentile >= 60 ? '#10b981' : '#fbbf24' }}>
                #{peerComp.eps.rank}/{peerComp.eps.totalPeers}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Confidence */}
      {valuation.confidence && (
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
          Confidence: <span style={{ color: valuation.confidence === 'HIGH' ? '#10b981' : valuation.confidence === 'MEDIUM' ? '#fbbf24' : '#64748b', fontWeight: 600 }}>
            {valuation.confidence}
          </span>
        </div>
      )}

      {/* Notes */}
      {valuation.notes && (
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 6, fontStyle: 'italic' }}>{valuation.notes}</div>
      )}

      {/* Disclaimer */}
      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        {disclaimer}
      </div>
    </div>
  );
}
