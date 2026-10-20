// src/components/AiGuruQuantitativeCard.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  runAiQuantitativeAssessment,
  resolveValidNepseSymbol,
  type AiQuantitativeAssessmentResult,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
} from "../services/aiGuru/runAiQuantitativeAssessment";

export interface AiGuruQuantitativeCardProps {
  /** Primary symbol prop from parent dashboard */
  symbol?: string | null;
  /** Optional secondary fallback if parent passes selectedScrip object */
  selectedScrip?: { symbol?: string; ticker?: string; stockSymbol?: string; scrip?: string } | null;
  quoteData?: RawQuotePayload | null;
  historicalCandles?: HistoricalCandle[];
  ledgerTelemetry?: LedgerTelemetryRow | null;
  broker5DPayload?: unknown;
  onAssessmentReady?: (assessment: AiQuantitativeAssessmentResult) => void;
}

export const AiGuruQuantitativeCard: React.FC<AiGuruQuantitativeCardProps> = ({
  symbol,
  selectedScrip,
  quoteData,
  historicalCandles = [],
  ledgerTelemetry = null,
  broker5DPayload = null,
  onAssessmentReady,
}) => {
  const [assessment, setAssessment] = useState<AiQuantitativeAssessmentResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisMarkdown, setAnalysisMarkdown] = useState<string>("");
  const [engineSource, setEngineSource] = useState<string>("");

  // Resolve real ticker without ever defaulting to "STOCK"
  const activeSymbol = resolveValidNepseSymbol(
    symbol,
    selectedScrip?.symbol,
    selectedScrip?.ticker,
    selectedScrip?.stockSymbol,
    selectedScrip?.scrip,
    quoteData?.symbol,
    ledgerTelemetry?.symbol
  );

  const executeAssessment = useCallback(async () => {
    if (!activeSymbol) {
      setAssessment(null);
      setAnalysisMarkdown("");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/ai-guru/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol,
          quote: quoteData,
          candles: historicalCandles,
          ledgerTelemetry,
          broker5DPayload,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAssessment(data);
        setAnalysisMarkdown(data.analysisMarkdown || data.errorMarkdown || "");
        setEngineSource(data.engine || "DETERMINISTIC_QUANT");
        if (onAssessmentReady) {
          onAssessmentReady(data);
        }
        return;
      }
      throw new Error(`API returned status ${response.status}`);
    } catch {
      // Offline fallback: run local assessment in browser memory
      const localResult = await runAiQuantitativeAssessment({
        symbol: activeSymbol,
        quote: quoteData,
        candles: historicalCandles,
        ledgerTelemetry,
        broker5DRawPayload: broker5DPayload,
      });
      setAssessment(localResult);
      setAnalysisMarkdown(localResult.errorMarkdown || "");
      setEngineSource("DETERMINISTIC_QUANT");
      if (onAssessmentReady) {
        onAssessmentReady(localResult);
      }
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, quoteData, historicalCandles, ledgerTelemetry, broker5DPayload, onAssessmentReady]);

  useEffect(() => {
    executeAssessment();
  }, [executeAssessment]);

  if (!activeSymbol) {
    return (
      <div style={{
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: 16,
        fontSize: 13,
        color: '#94a3b8'
      }}>
        Select a NEPSE scrip from the watchlist or Signal Track Record to run AI Guru Quantitative Assessment.
      </div>
    );
  }

  if (loading && !assessment) {
    return (
      <div style={{
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: 16,
        fontSize: 13,
        color: '#cbd5e1'
      }}>
        Running walk-forward quantitative telemetry for <strong style={{ color: '#38bdf8' }}>{activeSymbol}</strong>...
      </div>
    );
  }

  if (assessment && !assessment.ok) {
    return (
      <div style={{
        borderRadius: 14,
        border: '1px solid rgba(245, 158, 11, 0.35)',
        background: 'rgba(245, 158, 11, 0.08)',
        padding: 14,
        color: '#fef3c7',
        fontSize: 13
      }}>
        <div style={{ fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>
          ⚠️ Telemetry Unavailable for {assessment.symbol}
        </div>
        <p style={{ fontSize: 12, color: '#fcd34d', margin: 0 }}>
          {assessment.priceAsOfLabel}
        </p>
      </div>
    );
  }

  const m = assessment?.metrics;
  if (!m) return null;

  const isFallbackPrice = m.priceSource !== "LIVE_LTP";

  return (
    <div style={{
      borderRadius: 14,
      border: '1px solid rgba(255, 255, 255, 0.10)',
      background: 'rgba(15, 23, 42, 0.85)',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)'
    }}>
      {/* Header with Symbol & Verified Price Source Badge */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: 12
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', margin: 0 }}>
              🧠 AI Guru Quantitative Assessment: {assessment.symbol}
            </h3>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 9999,
              background: isFallbackPrice ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)',
              color: isFallbackPrice ? '#fcd34d' : '#34d399',
              border: `1px solid ${isFallbackPrice ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`
            }}>
              {assessment.priceAsOfLabel}
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '4px 0 0 0' }}>
            T+2 Settlement Status: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{m.t2UnlockStatus}</span>
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
            Rs. {m.verifiedPrice.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
          </div>
          <div style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: m.dayChangePct >= 0 ? '#34d399' : '#fb7185'
          }}>
            {m.dayChangePct >= 0 ? '+' : ''}{m.dayChangePct}% &bull; 14D ATR: Rs. {m.atr14} ({m.atrPct}%)
          </div>
        </div>
      </div>

      {/* Institutional Telemetry Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
        fontSize: 12
      }}>
        {/* 1. 1.2R Ratchet Shield */}
        <div style={{
          borderRadius: 10,
          background: 'rgba(30, 41, 59, 0.65)',
          padding: 10,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>1.2R Ratchet Shield</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#34d399', marginTop: 3 }}>
            Trigger Rs. {m.ratchetTriggerPrice}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Locks Stop @ Rs. {m.ratchetStopPrice}
          </div>
        </div>

        {/* 2. Excursion (MFE / MAE) */}
        <div style={{
          borderRadius: 10,
          background: 'rgba(30, 41, 59, 0.65)',
          padding: 10,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>Excursion (MFE / MAE)</div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>
            <span style={{ color: '#34d399' }}>+{m.mfePct.toFixed(2)}%</span>
            <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
            <span style={{ color: '#fb7185' }}>{m.maePct.toFixed(2)}%</span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            NEPSE Alpha: {m.nepseAlphaPct >= 0 ? '+' : ''}{m.nepseAlphaPct.toFixed(2)}%
          </div>
        </div>

        {/* 3. Broker Anomaly Score */}
        <div style={{
          borderRadius: 10,
          background: 'rgba(30, 41, 59, 0.65)',
          padding: 10,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>Broker Anomaly Score</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#818cf8', marginTop: 3 }}>
            {m.brokerAnomalyScore.toFixed(2)}x Baseline
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Avg Ticket: {Math.round(m.avgTicketKitta)} kitta
          </div>
        </div>

        {/* 4. 5D Smart Money Regime */}
        <div style={{
          borderRadius: 10,
          background: 'rgba(30, 41, 59, 0.65)',
          padding: 10,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>5D Smart Money Regime</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fcd34d', marginTop: 3 }}>
            {m.smartMoney5D.dominantRegime.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Round-Trip Hurdle: {m.roundTripFeePct}%
          </div>
        </div>
      </div>

      {/* Qualitative / Institutional Narrative Output */}
      {analysisMarkdown && (
        <div style={{
          borderRadius: 10,
          border: '1px solid rgba(255, 255, 255, 0.10)',
          background: 'rgba(2, 6, 23, 0.7)',
          padding: 14,
          fontSize: 12,
          lineHeight: 1.6,
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 2
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#94a3b8',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: 6
          }}>
            <span>Walk-Forward Institutional Synthesis</span>
            <span style={{ fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 700 }}>
              {engineSource}
            </span>
          </div>
          <div style={{ whiteSpace: 'pre-line' }}>{analysisMarkdown}</div>
        </div>
      )}
    </div>
  );
};
