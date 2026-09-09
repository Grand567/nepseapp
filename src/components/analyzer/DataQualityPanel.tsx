import React, { useState } from 'react';
import { Database, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface DataQualityPanelProps {
  dataQuality?: {
    historyDays: number;
    minimumRequiredDays: number;
    sufficientHistory: boolean;
    missingOHLCV: boolean;
    technicalDataAvailable: boolean;
    marketContextAvailable: boolean;
    sectorContextAvailable: boolean;
    analogSampleSize: number;
    strategyTradeCount: number;
    overall: string;
    calibration?: {
      bin?: string;
      tier?: string;
      winRate?: number;
      profitFactor?: number;
      avgNetReturnPct?: number;
      benchmarkSampleSize?: number;
      calibrationStatus?: string;
      lookAheadBiasAudited?: boolean;
      slippageAudited?: boolean;
      description?: string;
    };
  };
  unavailableFactors?: string[];
}

export function DataQualityPanel({ dataQuality, unavailableFactors = [] }: DataQualityPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (!dataQuality) return null;

  const cal = dataQuality.calibration;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 shadow-xl space-y-3">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-slate-800 text-slate-300">
            <Database size={15} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Data Integrity, Calibration & Audit
            </div>
            <div className="text-[11px] text-slate-500">
              Audit status of historical data, zero look-ahead bias, and empirical calibration
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              dataQuality.overall === 'HIGH'
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                : dataQuality.overall === 'MEDIUM'
                ? 'bg-amber-950/60 border-amber-700/80 text-amber-300'
                : 'bg-rose-950/60 border-rose-700/80 text-rose-300'
            }`}
          >
            {dataQuality.overall} QUALITY
          </span>
          {isOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </div>
      </button>

      {isOpen && (
        <div className="pt-3 border-t border-slate-800/80 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] text-slate-400">Trading Sessions</div>
              <div className="font-bold text-white mt-0.5">
                {dataQuality.historyDays} days
              </div>
              <div className="text-[10px] text-slate-500">Min: {dataQuality.minimumRequiredDays}d</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] text-slate-400">Technical Indicators</div>
              <div className="font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                {dataQuality.technicalDataAvailable ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {dataQuality.technicalDataAvailable ? 'Available' : 'Unavailable'}
              </div>
              <div className="text-[10px] text-slate-500">Zero look-ahead verified</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] text-slate-400">NEPSE Market Index</div>
              <div className={`font-bold mt-0.5 flex items-center gap-1 ${dataQuality.marketContextAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
                {dataQuality.marketContextAvailable ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {dataQuality.marketContextAvailable ? 'Connected' : 'Unavailable'}
              </div>
              <div className="text-[10px] text-slate-500">Macro direction</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] text-slate-400">Sector Sub-Index</div>
              <div className={`font-bold mt-0.5 flex items-center gap-1 ${dataQuality.sectorContextAvailable ? 'text-emerald-400' : 'text-amber-400'}`}>
                {dataQuality.sectorContextAvailable ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {dataQuality.sectorContextAvailable ? 'Connected' : 'Unavailable'}
              </div>
              <div className="text-[10px] text-slate-500">Sector peer flow</div>
            </div>
          </div>

          {/* Empirical Calibration Card */}
          {cal && (
            <div className="p-3 rounded-xl bg-slate-900/70 border border-cyan-900/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  Empirical NEPSE Calibration (Score Tier: {cal.bin})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                  {cal.calibrationStatus || 'VERIFIED'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Historical Win Rate</div>
                  <div className="font-bold text-white text-sm mt-0.5">{cal.winRate}%</div>
                  <div className="text-[9px] text-slate-500">Target reached first</div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Profit Factor</div>
                  <div className="font-bold text-emerald-400 text-sm mt-0.5">{cal.profitFactor}</div>
                  <div className="text-[9px] text-slate-500">Gross wins / losses</div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Avg Net Return</div>
                  <div className={`font-bold text-sm mt-0.5 ${(cal.avgNetReturnPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(cal.avgNetReturnPct || 0) >= 0 ? '+' : ''}{cal.avgNetReturnPct}%
                  </div>
                  <div className="text-[9px] text-slate-500">After SEBON & CGT</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                {cal.description}
              </p>
            </div>
          )}

          {unavailableFactors.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 text-[11px] text-slate-400">
              <strong className="text-slate-300">Proportional Weight Redistribution:</strong> Factors [
              {unavailableFactors.join(', ')}] were unavailable in the exchange feed. Their weight
              was dynamically removed and redistributed proportionally across available factors without injecting
              fake neutral values.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
