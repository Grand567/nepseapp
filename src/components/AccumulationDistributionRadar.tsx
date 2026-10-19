import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, ShieldCheck, Shield,
  Search, RefreshCw, Zap, Crosshair, BarChart3, Info, BookOpen,
  Filter, Layers, ArrowUpRight, ArrowDownRight, Activity, Flame,
  CheckCircle2, XCircle, HelpCircle, Calendar, History, Clock, Sparkles,
  Download, Upload, Crown, ChevronDown, ChevronUp, Users
} from 'lucide-react';
import { loadNepseData, fetchFloorSheet, fetchRealFloorsheet, fetchRealBrokerAnalysis, getCachedRealPriceHistory, getCachedRealBrokerAnalysis, fetchPriceHistory, fetchMarketWideBrokerSummaryMap, fetchPrecomputedRadar, fetchPrecomputedDiagnostic } from '../utils/liveData';
import {
  calculateChaikinADL,
  calculateCMF,
  calculateOBV,
  calculateBrokerConcentration,
  calculateStealthAccumulationScore,
  calculatePumpDumpRiskScore,
  classifyWyckoffStage,
  generateDynamicStockCandles,
  formatBrokerAmount,
  calculateSectorAccumulationChampions,
  calculateStockCorneringScore,
  type SectorAccumulationChampion,
  type BrokerDetail,
  type WyckoffStage,
  type StockWyckoffAnalysis,
  type Candle
} from '../utils/accumulationDistributionEngine';
import {
  captureDailyWhaleSnapshot,
  getStoredWhaleArchive,
  calculateArchivePerformance,
  exportWhaleArchiveJSON,
  importWhaleArchiveJSON
} from '../services/whaleDailyArchive.js';
// @ts-ignore
import { calculateMultiDayDiagnostics, buildDailyHistoryFromStockData, PHASE_DEFINITIONS } from '../utils/microstructureEngine';
// @ts-ignore
import StockDetailModal from './StockDetailModal';
import BrokerSmartFlowTracker from './BrokerSmartFlowTracker';
import PortfolioBrokerShield from './PortfolioBrokerShield';

const STAGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  STEALTH: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  PUMP: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  SPRING: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },
  DISTRIBUTION: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  DUMP: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  DEFAULT: { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' }
};

const getStageBadgeStyle = (stage: string = '') => {
  if (stage.includes('STEALTH')) return STAGE_STYLES.STEALTH;
  if (stage.includes('PUMP')) return STAGE_STYLES.PUMP;
  if (stage.includes('SPRING')) return STAGE_STYLES.SPRING;
  if (stage.includes('DISTRIBUTION')) return STAGE_STYLES.DISTRIBUTION;
  if (stage.includes('DUMP')) return STAGE_STYLES.DUMP;
  return STAGE_STYLES.DEFAULT;
};

// Memoized table row component for maximum 60fps scrolling performance without repainting
const StockTableRow = React.memo(function StockTableRow({
  stock,
  onPress,
  onInspectFlow
}: {
  stock: any;
  onPress: (stock: any) => void;
  onInspectFlow: (symbol: string) => void;
}) {
  const badgeStyle = getStageBadgeStyle(stock.wyckoff?.stage);
  const isRiskHigh = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 55;
  const isRiskExtreme = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 75;
  const bcr3Buy = stock.bcr3Buy || 0;
  const bcr3Sell = stock.bcr3Sell || 0;
  const isTrap = stock.isTrap;
  const isDumping = stock.isDumping;
  const isAccumulation = stock.isAccumulation;
  const topBuyers = stock.brokerData?.topBuyerBrokers || [];
  const topSellers = stock.brokerData?.topSellerBrokers || [];

  return (
    <tr
      className="hover:bg-slate-800/40 cursor-pointer group"
      onClick={() => onPress(stock)}
    >
      <td className="py-2.5 px-3 sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800 border-r-2 border-slate-700/80">
        <div className="font-extrabold text-white group-hover:text-emerald-400">
          {stock.symbol}
        </div>
        <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
          {stock.companyName || stock.name || stock.symbol}
        </div>
        {(stock.rsi !== null && stock.rsi !== undefined && stock.volumeZScore !== null && stock.volumeZScore !== undefined) ? (
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 mt-0.5">
            ✓ Live + Tech
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-700/30 mt-0.5">
            ✓ Live Mkt
          </span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
        Rs. {stock.ltp?.toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] ${
            (stock.pChange || 0) >= 0
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-red-400 bg-red-500/10'
          }`}
        >
          {(stock.pChange || 0) >= 0 ? '+' : ''}
          {stock.pChange?.toFixed(2)}%
        </span>
      </td>
      <td className="py-2.5 px-3 whitespace-nowrap">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border"
          style={{
            backgroundColor: badgeStyle.bg,
            color: badgeStyle.text,
            borderColor: badgeStyle.border
          }}
        >
          {stock.wyckoff?.stage ? stock.wyckoff.stage.replace(/_/g, ' ') : 'UNKNOWN'}
          {stock.wyckoff?.isDataSynthetic && (
            <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700/40 font-mono" title="Calculated from dynamic multi-session model">
              ⚡ Est.
            </span>
          )}
        </div>
        {stock.corneringAnalysis && stock.corneringAnalysis.confidenceTier !== 'GRADE_C_NEUTRAL' && (
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black border ${
              stock.corneringAnalysis.confidenceTier === 'GRADE_A_CONFIRMED'
                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
                : 'bg-amber-500/25 text-amber-300 border-amber-500/50'
            }`}>
              👑 {stock.corneringAnalysis.confidenceLabel} ({stock.corneringAnalysis.corneringScore} pts)
            </span>
          </div>
        )}
        {(stock.wyckoff?.isDay1StealthCandidate || (stock.wyckoff?.qaiScore && stock.wyckoff.qaiScore >= 68)) && (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
              🎯 Day 1 Stealth ({stock.wyckoff.qaiScore} QAI)
            </span>
          </div>
        )}
        {stock.whaleStreak && (
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black border ${
              stock.whaleStreak.alertType === 'DAY_2_PRIME'
                ? 'bg-amber-400/25 text-amber-300 border-amber-400/50'
                : stock.whaleStreak.alertType === 'MULTI_DAY_CORNER'
                ? 'bg-purple-500/25 text-purple-300 border-purple-500/50'
                : stock.whaleStreak.alertType === 'PAUSE_DAY_DIP'
                ? 'bg-blue-500/25 text-blue-300 border-blue-500/50'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            }`}>
              {stock.whaleStreak.signalBadge}
            </span>
          </div>
        )}
        {stock.whaleDistStreak && (
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black bg-rose-500/25 text-rose-300 border border-rose-500/50">
              {stock.whaleDistStreak.signalBadge}
            </span>
          </div>
        )}
        <div className="text-[10px] text-slate-400 mt-0.5">
          {stock.wyckoff?.stageNameNepali}
        </div>
        {stock.wyckoff?.earlySignals?.earlyBadge && !(stock.wyckoff?.stage?.includes('ACCUMULATION') && stock.wyckoff.earlySignals.earlyAlertVerdict === 'EARLY_DISTRIBUTION_CHURN') && (
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black border ${
              stock.wyckoff.earlySignals.earlyAlertVerdict === 'EARLY_DISTRIBUTION_CHURN'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            }`}>
              {stock.wyckoff.earlySignals.earlyBadge}
            </span>
          </div>
        )}
      </td>
      <td className="py-2.5 px-3 whitespace-nowrap">
        {isAccumulation ? (
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              🟢 &gt;40% Accumulation ({bcr3Buy}%{!stock.isBrokerVerified ? <span style={{color:'#fbbf24', fontSize:'9px'}}> *Est.</span> : ''})
            </span>
            <div className="text-[9.5px] text-emerald-300/90 mt-0.5 font-semibold truncate max-w-[170px]" title={topBuyers.slice(0, 3).map((b: any) => `#${b.broker} (${b.pct}%)`).join(', ')}>
              Buyers: {topBuyers.slice(0, 3).map((b: any) => `#${b.broker} (${b.pct}%)`).join(', ') || 'Awaiting Sync'}
            </div>
          </div>
        ) : isTrap ? (
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black bg-rose-500/25 text-rose-300 border border-rose-500/60">
              🚨 Distribution Trap!
            </span>
            <div className="text-[9.5px] text-rose-300/90 mt-0.5 font-semibold truncate max-w-[170px]" title={topSellers.slice(0, 3).map((s: any) => `#${s.broker} (${s.pct}%)`).join(', ')}>
              Sellers: {topSellers.slice(0, 3).map((s: any) => `#${s.broker} (${s.pct}%)`).join(', ') || 'Awaiting Sync'}
            </div>
          </div>
        ) : isDumping ? (
          <div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
              🔴 Offloading ({bcr3Sell}% Sell)
            </span>
            <div className="text-[9.5px] text-rose-300/90 mt-0.5 font-semibold truncate max-w-[170px]" title={topSellers.slice(0, 3).map((s: any) => `#${s.broker} (${s.pct}%)`).join(', ')}>
              Sellers: {topSellers.slice(0, 3).map((s: any) => `#${s.broker} (${s.pct}%)`).join(', ') || 'Awaiting Sync'}
            </div>
          </div>
        ) : (
          <div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
              ⚪ Retail ({bcr3Buy}%)
            </span>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[170px]" title={topBuyers.slice(0, 3).map((b: any) => `#${b.broker} (${b.pct}%)`).join(', ')}>
              Buyers: {topBuyers.slice(0, 3).map((b: any) => `#${b.broker} (${b.pct}%)`).join(', ') || 'Awaiting Sync'}
            </div>
          </div>
        )}
      </td>
      <td className="py-2.5 px-3 text-right whitespace-nowrap">
        <span
          className={`font-semibold ${
            (stock.wyckoff?.cmf || 0) > 0.05
              ? 'text-emerald-400'
              : (stock.wyckoff?.cmf || 0) < -0.05
              ? 'text-red-400'
              : 'text-slate-300'
          }`}
        >
          {(stock.wyckoff?.cmf || 0) > 0 ? '+' : ''}
          {(stock.wyckoff?.cmf || 0).toFixed(2)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right font-semibold text-slate-200 whitespace-nowrap">
        {bcr3Buy > 0 || stock.brokerData?.bcr5BuyPct > 0 ? (
          <div>
            <span className={bcr3Buy >= 40 ? 'text-emerald-400 font-black' : 'text-white'}>{bcr3Buy}%</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-400 text-[11px]">{stock.brokerData?.bcr5BuyPct || 0}%</span>
          </div>
        ) : '—'}
      </td>
      <td className="py-2.5 px-3 text-right whitespace-nowrap">
        <span
          className={`font-semibold ${
            (stock.wyckoff?.tradeSizeRatio || 1) >= 1.5
              ? 'text-emerald-400'
              : (stock.wyckoff?.tradeSizeRatio || 1) <= 0.65
              ? 'text-orange-400'
              : 'text-slate-300'
          }`}
        >
          {(stock.wyckoff?.tradeSizeRatio || 1).toFixed(2)}x
        </span>
      </td>
      <td className="py-2.5 px-3 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-12 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                isRiskExtreme
                  ? 'bg-red-500'
                  : isRiskHigh
                  ? 'bg-orange-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${stock.wyckoff?.pumpDumpRiskScore || 0}%` }}
            />
          </div>
          <span
            className={`text-[10px] font-bold ${
              isRiskExtreme
                ? 'text-red-400'
                : isRiskHigh
                ? 'text-orange-400'
                : 'text-emerald-400'
            }`}
          >
            {stock.wyckoff?.pumpDumpRiskScore || 0}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPress(stock);
            }}
            className="px-2 py-1 text-[11px] font-black rounded bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30"
          >
            Info ↗
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInspectFlow(stock.symbol);
            }}
            className="px-2 py-1 text-[11px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            Flow →
          </button>
        </div>
      </td>
    </tr>
  );
});

// Memoized mobile card component for buttery-smooth single-column vertical scrolling
const StockRadarCard = React.memo(function StockRadarCard({
  stock,
  onPress,
  onInspectFlow
}: {
  stock: any;
  onPress: (stock: any) => void;
  onInspectFlow: (symbol: string) => void;
}) {
  const badgeStyle = getStageBadgeStyle(stock.wyckoff?.stage);
  const isRiskHigh = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 55;
  const isRiskExtreme = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 75;
  const bcr3Buy = stock.bcr3Buy || 0;
  const bcr3Sell = stock.bcr3Sell || 0;
  const isTrap = stock.isTrap;
  const isDumping = stock.isDumping;
  const isAccumulation = stock.isAccumulation;
  const topBuyers = stock.brokerData?.topBuyerBrokers || [];
  const topSellers = stock.brokerData?.topSellerBrokers || [];

  return (
    <div
      onClick={() => onPress(stock)}
      className="p-2.5 sm:p-3.5 rounded-xl border border-slate-800 bg-slate-900/90 hover:border-slate-700 cursor-pointer shadow-sm space-y-2"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-800/70 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-base text-white hover:text-emerald-400">
              {stock.symbol}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
              {stock.sector || 'Stock'}
            </span>
            {stock.rsi !== null && stock.rsi !== undefined && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                Live
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 truncate max-w-[180px] mt-0.5">
            {stock.companyName || stock.name || stock.symbol}
          </div>
        </div>

        <div className="text-right">
          <div className="font-black text-sm text-white">
            Rs. {stock.ltp?.toLocaleString()}
          </div>
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold mt-0.5 ${
              (stock.pChange || 0) >= 0
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-red-400 bg-red-500/10'
            }`}
          >
            {(stock.pChange || 0) >= 0 ? '+' : ''}
            {stock.pChange?.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="px-2 py-0.5 rounded text-[10.5px] font-bold border"
          style={{
            backgroundColor: badgeStyle.bg,
            color: badgeStyle.text,
            borderColor: badgeStyle.border
          }}
        >
          {stock.wyckoff?.stage ? stock.wyckoff.stage.replace(/_/g, ' ') : 'UNKNOWN'}
          {stock.wyckoff?.isDataSynthetic && (
            <span className="ml-1 text-[8.5px] px-1 py-0.2 rounded bg-amber-900/50 text-amber-400 border border-amber-700/40 font-mono" title="Calculated from dynamic multi-session model">
              ⚡ Est.
            </span>
          )}
        </span>

        {isAccumulation ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            🟢 &gt;40% Accumulation ({bcr3Buy}%)
          </span>
        ) : isTrap ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/25 text-rose-300 border border-rose-500/60">
            🚨 Distribution Trap!
          </span>
        ) : isDumping ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
            🔴 Offloading ({bcr3Sell}% Sell)
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
            ⚪ Retail ({bcr3Buy}%)
          </span>
        )}

        {stock.corneringAnalysis && stock.corneringAnalysis.confidenceTier !== 'GRADE_C_NEUTRAL' && (
          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-black border ${
            stock.corneringAnalysis.confidenceTier === 'GRADE_A_CONFIRMED'
              ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
              : 'bg-amber-500/25 text-amber-300 border-amber-500/50'
          }`}>
            👑 {stock.corneringAnalysis.confidenceLabel} ({stock.corneringAnalysis.corneringScore} pts)
          </span>
        )}

        {stock.whaleStreak && (
          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
            {stock.whaleStreak.signalBadge}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1 text-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-[11px]">
        <div>
          <div className="text-[10px] text-slate-300 font-medium">CMF (20)</div>
          <div className={`font-black mt-0.5 ${(stock.wyckoff?.cmf || 0) > 0.05 ? 'text-emerald-400' : (stock.wyckoff?.cmf || 0) < -0.05 ? 'text-rose-400' : 'text-slate-300'}`}>
            {(stock.wyckoff?.cmf || 0) > 0 ? '+' : ''}{(stock.wyckoff?.cmf || 0).toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-300 font-medium">BCR3 / BCR5</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {bcr3Buy > 0 || stock.brokerData?.bcr5BuyPct > 0 ? (
              <span>
                <span className={bcr3Buy >= 40 ? 'text-emerald-400 font-black' : 'text-white'}>{bcr3Buy}%</span>
                <span className="text-slate-500 mx-0.5">/</span>
                <span className="text-slate-400 text-[10px]">{stock.brokerData?.bcr5BuyPct || 0}%</span>
              </span>
            ) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-300 font-medium">Ticket</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {(stock.wyckoff?.tradeSizeRatio || 1).toFixed(2)}x
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-300 font-medium">Dump Risk</div>
          <div className={`font-black mt-0.5 ${isRiskExtreme ? 'text-red-400' : isRiskHigh ? 'text-orange-400' : 'text-emerald-400'}`}>
            {stock.wyckoff?.pumpDumpRiskScore || 0}
          </div>
        </div>
      </div>

      {/* Compact Top Broker Strip */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[10.5px]">
        <div className="truncate text-slate-400">
          <span className="text-emerald-400 font-bold">Top Buyers: </span>
          <span className="font-mono text-slate-200">{topBuyers.slice(0, 3).map((b: any) => '#' + b.broker).join(', ') || '—'}</span>
        </div>
        <div className="truncate text-slate-400 text-right">
          <span className="text-rose-400 font-bold">Top Sellers: </span>
          <span className="font-mono text-slate-200">{topSellers.slice(0, 3).map((s: any) => '#' + s.broker).join(', ') || '—'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPress(stock);
          }}
          className="flex-1 py-1.5 text-xs font-black rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 text-center"
        >
          View Diagnostics ↗
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspectFlow(stock.symbol);
          }}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-center"
        >
          Flow →
        </button>
      </div>
    </div>
  );
});

interface AccumulationDistributionRadarProps {
  initialSymbol?: string;
  initialStage?: string;
  initialTab?: 'radar' | 'archive' | 'diagnostic' | 'playbook' | 'smart-flow' | 'portfolio-shield';
  onSelectStock?: (stock: any) => void;
  onAskGuruAi?: (stock: any) => void;
}

export function AccumulationDistributionRadar({
  initialSymbol,
  initialStage,
  initialTab,
  onSelectStock,
  onAskGuruAi
}: AccumulationDistributionRadarProps) {
  const [activeTab, setActiveTab] = useState<'radar' | 'archive' | 'diagnostic' | 'playbook' | 'smart-flow' | 'portfolio-shield'>(initialTab || 'radar');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedStage, setSelectedStage] = useState<string>(initialStage || 'ALL');
  const [step4Filter, setStep4Filter] = useState<'ALL' | 'SECTOR_LEADERS' | 'DAY1_STEALTH' | 'DAY2_PRIME' | 'VDU_COIL' | 'CHURN_TRAP' | 'ACCUMULATION' | 'TRAP'>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [showBcr3Guide, setShowBcr3Guide] = useState(false);
  const [showAllSectorChamps, setShowAllSectorChamps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState(initialSymbol || 'NABIL');
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<any[]>([]);
  const [floorsheet, setFloorsheet] = useState<any[]>([]);
  const [stockBrokerDataMap, setStockBrokerDataMap] = useState<Record<string, any>>({});
  const [whaleArchive, setWhaleArchive] = useState<any[]>(() => getStoredWhaleArchive());
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string>('');
  const [modalStock, setModalStock] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'qai' | 'stealth' | 'dumpRisk' | 'pChange' | 'turnover' | 'cmf'>('qai');
  const [brokerLedgerMetric, setBrokerLedgerMetric] = useState<'netFlow' | 'turnover' | 'kitta'>('netFlow');
  const [radarDays, setRadarDays] = useState<number>(1);
  const [radarDate, setRadarDate] = useState<string>('');
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [isRecalculatingTimeframe, setIsRecalculatingTimeframe] = useState<boolean>(false);
  const [diagnosticDays, setDiagnosticDays] = useState<number>(1);
  const [diagnosticLoading, setDiagnosticLoading] = useState<boolean>(false);
  const [loadedTradingDays, setLoadedTradingDays] = useState<number>(32);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [zeroSumAudit, setZeroSumAudit] = useState<{
    loading: boolean;
    symbol: string;
    buyVol: number;
    sellVol: number;
    delta: number;
    balanced: boolean;
    brokerCount: number;
  } | null>(null);

  const handlePhaseCardClick = (phase: string) => {
    if (selectedPhase === phase) {
      setSelectedPhase(null);
      setSelectedStage('ALL');
    } else {
      setSelectedPhase(phase);
      setSelectedStage(phase);
    }
  };

  const handleStageTabClick = (stageId: string) => {
    setSelectedStage(stageId);
    if (stageId === 'ALL') {
      setSelectedPhase(null);
    } else {
      setSelectedPhase(stageId);
    }
  };

  const handleRadarTimeframeChange = async (d: number) => {
    setRadarDays(d);
    setRadarDate('');
    setIsRecalculatingTimeframe(true);
    setLoading(true);
    try {
      const fastRadar = await fetchPrecomputedRadar(d).catch(() => null);
      if (fastRadar?.success) {
        if (typeof fastRadar.loadedTradingDays === 'number') {
          setLoadedTradingDays(fastRadar.loadedTradingDays);
        }
        if (typeof fastRadar.isBackfilling === 'boolean') {
          setIsBackfilling(Boolean(fastRadar.isBackfilling));
        }
      }
      if (fastRadar?.success && Array.isArray(fastRadar.stocks) && fastRadar.stocks.length > 0) {
        const brokerMap: Record<string, any> = {};
        for (const st of fastRadar.stocks) {
          const symUpper = String(st.symbol).toUpperCase().trim();
          const entry = {
            symbol: symUpper,
            bcr3BuyPct: st.grossBuyConcentrationPct || 0,
            bcr3SellPct: st.grossSellConcentrationPct || 0,
            bcr5BuyPct: st.bcr5NetPct || 0,
            bcr5NetPct: st.bcr5NetPct || 0,
            scr3NetPct: st.scr3NetPct || 0,
            grossBuyConcentrationPct: st.grossBuyConcentrationPct,
            grossSellConcentrationPct: st.grossSellConcentrationPct,
            smartMoneyNetFlowPct: st.smartMoneyNetFlowPct,
            phase: st.phase,
            phaseLabel: st.phaseLabel,
            bigBrokerVWAP: st.bigBrokerVWAP,
            buyZoneMin: st.buyZoneMin,
            buyZoneMax: st.buyZoneMax,
            entryStatus: st.entryStatus,
            totalVolume: st.totalVolume,
            totalTurnover: st.totalTurnover,
            timeframeDays: st.timeframeDays,
            scopeLabel: st.scopeLabel,
            topBuyers: st.topBuyers || [],
            topSellers: st.topSellers || [],
            topBuyerBrokers: st.topBuyers || [],
            topSellerBrokers: st.topSellers || []
          };
          brokerMap[symUpper] = entry;
          brokerMap[`${symUpper}_${d}`] = entry;
        }
        setStockBrokerDataMap(prev => ({ ...prev, ...brokerMap }));
      } else {
        const brokerMap = await fetchMarketWideBrokerSummaryMap(d, { refresh: true });
        if (brokerMap && typeof brokerMap === 'object' && Object.keys(brokerMap).length > 0) {
          const mapWithKeys: Record<string, any> = {};
          for (const [k, v] of Object.entries(brokerMap)) {
            const u = String(k).toUpperCase();
            mapWithKeys[u] = v;
            mapWithKeys[`${u}_${d}`] = v;
          }
          setStockBrokerDataMap(prev => ({ ...prev, ...mapWithKeys }));
        }
      }

      if (selectedStockSymbol) {
        const symU = selectedStockSymbol.toUpperCase();
        const diagFast = await fetchPrecomputedDiagnostic(selectedStockSymbol, d).catch(() => null);
        if (diagFast) {
          setStockBrokerDataMap(prev => ({ ...prev, [symU]: diagFast, [`${symU}_${d}`]: diagFast }));
          if (typeof (diagFast as any).loadedTradingDays === 'number') {
            setLoadedTradingDays((diagFast as any).loadedTradingDays);
          }
          if (typeof (diagFast as any).isBackfilling === 'boolean') {
            setIsBackfilling(Boolean((diagFast as any).isBackfilling));
          }
        } else {
          const res = await fetchRealBrokerAnalysis(selectedStockSymbol, d, { refresh: true }).catch(() => null);
          if (res) {
            setStockBrokerDataMap(prev => ({ ...prev, [symU]: res, [`${symU}_${d}`]: res }));
          }
        }
      }
    } catch (_) {
    } finally {
      setIsRecalculatingTimeframe(false);
      setLoading(false);
    }
  };

  const handleDiagnosticDaysChange = async (d: number) => {
    setDiagnosticDays(d);
    if (!selectedStockSymbol) return;
    setDiagnosticLoading(true);
    const symU = selectedStockSymbol.toUpperCase();
    try {
      const diagFast = await fetchPrecomputedDiagnostic(selectedStockSymbol, d).catch(() => null);
      if (diagFast) {
        setStockBrokerDataMap(prev => ({ ...prev, [symU]: diagFast, [`${symU}_${d}`]: diagFast }));
        if (typeof (diagFast as any).loadedTradingDays === 'number') {
          setLoadedTradingDays((diagFast as any).loadedTradingDays);
        }
        if (typeof (diagFast as any).isBackfilling === 'boolean') {
          setIsBackfilling(Boolean((diagFast as any).isBackfilling));
        }
      } else {
        const res = await fetchRealBrokerAnalysis(selectedStockSymbol, d, { refresh: true }).catch(() => null);
        if (res) {
          setStockBrokerDataMap(prev => ({ ...prev, [symU]: res, [`${symU}_${d}`]: res }));
        }
      }
    } catch (_) {
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const handleRadarDateChange = async (dt: string) => {
    setRadarDate(dt);
    setLoading(true);
    setIsRecalculatingTimeframe(true);
    try {
      const brokerMap = await fetchMarketWideBrokerSummaryMap(radarDays, { date: dt, refresh: true });
      if (brokerMap && typeof brokerMap === 'object') {
        setStockBrokerDataMap(prev => ({ ...prev, ...brokerMap }));
      }
      if (selectedStockSymbol) {
        const res = await fetchRealBrokerAnalysis(selectedStockSymbol, radarDays, { date: dt, refresh: true }).catch(() => null);
        if (res) {
          setStockBrokerDataMap(prev => ({ ...prev, [selectedStockSymbol.toUpperCase()]: res }));
        }
      }
    } catch (_) {
    } finally {
      setIsRecalculatingTimeframe(false);
      setLoading(false);
    }
  };

  const radarAvailableDates = useMemo(() => {
    const datesSet = new Set<string>();
    if (selectedStockSymbol) {
      const bData = stockBrokerDataMap[selectedStockSymbol.toUpperCase()];
      if (Array.isArray(bData?.availableDates)) {
        bData.availableDates.forEach((d: string) => { if (d) datesSet.add(d); });
      }
    }
    if (Array.isArray(whaleArchive)) {
      whaleArchive.forEach((w: any) => { if (w?.date) datesSet.add(w.date); });
    }
    if (Array.isArray(floorsheet)) {
      floorsheet.slice(0, 500).forEach((t: any) => {
        const d = t?.businessDate || t?.date;
        if (d && typeof d === 'string' && d.length >= 8) datesSet.add(d);
      });
    }
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a)).slice(0, 500);
  }, [stockBrokerDataMap, selectedStockSymbol, whaleArchive, floorsheet]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      setLoading(true);
      try {
        const [liveRes, fsRes, brokerMapRes] = await Promise.allSettled([
          loadNepseData(),
          fetchRealFloorsheet(null, '', 1, 100000),  // 100% full-session floorsheet
          fetchMarketWideBrokerSummaryMap(1)
        ]);
        if (!isMounted) return;
        if (brokerMapRes.status === 'fulfilled' && brokerMapRes.value && typeof brokerMapRes.value === 'object') {
          const map1D: Record<string, any> = {};
          for (const [k, v] of Object.entries(brokerMapRes.value)) {
            const u = String(k).toUpperCase();
            map1D[u] = v;
            map1D[`${u}_1`] = v;
          }
          setStockBrokerDataMap(prev => ({ ...prev, ...map1D }));
        }
        fetchPrecomputedRadar(1).then(fastR => {
          if (fastR?.success) {
            if (typeof fastR.loadedTradingDays === 'number') setLoadedTradingDays(fastR.loadedTradingDays);
            if (typeof fastR.isBackfilling === 'boolean') setIsBackfilling(Boolean(fastR.isBackfilling));
          }
        }).catch(() => {});
        if (liveRes.status === 'fulfilled' && liveRes.value?.stocks) {
          setStocks(liveRes.value.stocks);
          if (!initialSymbol && liveRes.value.stocks.length > 0) {
            setSelectedStockSymbol(liveRes.value.stocks[0].symbol);
          }
        }
        if (fsRes.status === 'fulfilled') {
          const fs = fsRes.value;
          const fsData = Array.isArray(fs?.content)
            ? fs.content
            : Array.isArray(fs?.data)
            ? fs.data
            : Array.isArray(fs?.rows)
            ? fs.rows
            : Array.isArray(fs?.list)
            ? fs.list
            : Array.isArray(fs)
            ? fs
            : [];
          setFloorsheet(fsData);
        }
      } catch (e) {
        console.error('Failed to load live accumulation data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [initialSymbol]);

  const currentSnapshot = useMemo(() => {
    if (!whaleArchive || whaleArchive.length === 0) return null;
    if (selectedArchiveDate) {
      return whaleArchive.find((s: any) => s.date === selectedArchiveDate) || whaleArchive[0];
    }
    return whaleArchive[0];
  }, [whaleArchive, selectedArchiveDate]);

  const liveStocksMap = useMemo(() => {
    const map: Record<string, any> = {};
    stocks.forEach(s => {
      if (s.symbol) map[s.symbol.toUpperCase()] = s;
    });
    return map;
  }, [stocks]);

  const performanceTrack = useMemo(() => {
    return calculateArchivePerformance(currentSnapshot, liveStocksMap);
  }, [currentSnapshot, liveStocksMap]);

  const handleStockPress = (stock: any) => {
    if (!stock) return;
    const sym = String(stock.symbol || '').toUpperCase().trim();
    if (sym) {
      setSelectedStockSymbol(sym);
      if (!stockBrokerDataMap[sym]) {
        fetchRealBrokerAnalysis(sym, 30)
          .then(res => {
            if (res && (res.topBuyers?.length > 0 || res.topNetBuyers?.length > 0)) {
              setStockBrokerDataMap(prev => ({ ...prev, [sym]: res }));
            }
          })
          .catch(() => {});
      }
    }
    const fullStock = (sym && liveStocksMap[sym]) ? { ...liveStocksMap[sym], ...stock } : stock;
    if (onSelectStock) {
      onSelectStock(fullStock);
    } else {
      setModalStock(fullStock);
    }
  };

  const handleExportBackup = () => {
    try {
      const jsonStr = exportWhaleArchiveJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drabyashree_whale_archive_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[WhaleArchive] Export failed:', e);
    }
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const res = importWhaleArchiveJSON(content);
      if (res.success) {
        setWhaleArchive(getStoredWhaleArchive());
        alert(`Successfully restored ${res.count} trading sessions of whale archive!`);
      } else {
        alert(`Failed to restore backup: ${res.error}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Dynamically fetch authentic broker data and real price history for the inspected stock
  useEffect(() => {
    if (!selectedStockSymbol) return;
    const sym = selectedStockSymbol.toUpperCase();
    let active = true;

    const daysToFetch = activeTab === 'diagnostic' ? diagnosticDays : radarDays;
    fetchRealBrokerAnalysis(sym, daysToFetch, { refresh: false })
      .then(res => {
        if (active && res && (res.topBuyers?.length > 0 || res.topNetBuyers?.length > 0)) {
          setStockBrokerDataMap(prev => ({ ...prev, [sym]: res }));
        }
      })
      .catch(() => {});

    if (!getCachedRealPriceHistory(sym)) {
      fetchPriceHistory(sym, 60).catch(() => {});
    }

    return () => { active = false; };
  }, [selectedStockSymbol, activeTab, diagnosticDays, radarDays]);

  // Fast map of multi-session consecutive whale streaks from archive
  const whaleStreakMap = useMemo(() => {
    const map = new Map<string, { consecutiveDays: number; signalBadge: string; alertType: string }>();
    if (!Array.isArray(whaleArchive) || whaleArchive.length === 0) return map;
    const latest = whaleArchive[0];
    if (latest) {
      (latest.topAccumulation || []).forEach((item: any) => {
        if (item?.symbol) {
          map.set(String(item.symbol).toUpperCase(), {
            consecutiveDays: item.consecutiveDays || 1,
            signalBadge: item.signalBadge || '🟢 Day 1 Early Detection',
            alertType: item.alertType || 'DAY_1'
          });
        }
      });
      (latest.topDistribution || []).forEach((item: any) => {
        if (item?.symbol) {
          map.set(String(item.symbol).toUpperCase() + '_DIST', {
            consecutiveDays: item.consecutiveDays || 1,
            signalBadge: item.signalBadge || '🚨 Day 1 Distribution Alert',
            alertType: item.alertType || 'DAY_1_DIST'
          });
        }
      });
    }
    return map;
  }, [whaleArchive]);

  // Pre-index floorsheet trades by symbol for O(1) instantaneous lookup (fixes frame drops/stutter)
  const floorsheetBySymbol = useMemo(() => {
    const map = new Map<string, any[]>();
    if (Array.isArray(floorsheet)) {
      for (let i = 0; i < floorsheet.length; i++) {
        const t = floorsheet[i];
        const s = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
        if (s) {
          let list = map.get(s);
          if (!list) {
            list = [];
            map.set(s, list);
          }
          list.push(t);
        }
      }
    }
    return map;
  }, [floorsheet]);

  // Compute analysis for each stock
  const analyzedStocks = useMemo(() => {
    return stocks.map((s) => {
      const sym = s.symbol;
      const symUpper = sym ? String(sym).toUpperCase() : '';
      const cachedHist = getCachedRealPriceHistory(sym);
      const historyCandles: Candle[] = Array.isArray(s.history) && s.history.length >= 10
        ? s.history.map((h: any) => ({
            date: h.date,
            open: Number(h.open || h.close),
            high: Number(h.high || h.close),
            low: Number(h.low || h.close),
            close: Number(h.close),
            volume: Number(h.volume || 0)
          }))
        : Array.isArray(cachedHist) && cachedHist.length >= 10
        ? cachedHist.map((h: any) => ({
            date: h.date,
            open: Number(h.open || h.close),
            high: Number(h.high || h.close),
            low: Number(h.low || h.close),
            close: Number(h.close),
            volume: Number(h.volume || 0)
          }))
        : [];

      // When analyzing across multi-day horizons, resolve multi-day broker metrics
      const stockBrokerAnalysis = stockBrokerDataMap[`${symUpper}_${radarDays}`] || getCachedRealBrokerAnalysis(sym, radarDays) || (radarDays === 1 ? (stockBrokerDataMap[sym] || stockBrokerDataMap[symUpper]) : null) || s.realBrokerAnalysis || s.brokerAnalysis;
      
      // If multi-day horizon (radarDays > 1), compute multi-day return and volume from authentic historical candles
      const multiDayCandles = historyCandles.length >= 2
        ? historyCandles.slice(-Math.min(historyCandles.length, radarDays))
        : historyCandles;
      const effectivePChange = (radarDays > 1 && multiDayCandles.length >= 2)
        ? Number((((multiDayCandles[multiDayCandles.length - 1].close - multiDayCandles[0].open) / (multiDayCandles[0].open || 1)) * 100).toFixed(2))
        : Number(s.pChange || 0);
      const effectiveVolume = (radarDays > 1 && multiDayCandles.length >= 2)
        ? multiDayCandles.reduce((acc, c) => acc + (c.volume || 0), 0)
        : Number(s.volume || s.totalTradedQuantity || 0);

      const stockSummaryWithBroker = stockBrokerAnalysis 
        ? { ...s, pChange: effectivePChange, volume: effectiveVolume, realBrokerAnalysis: stockBrokerAnalysis } 
        : { ...s, pChange: effectivePChange, volume: effectiveVolume };
      const stockTrades = floorsheetBySymbol.get(symUpper) || [];
      const brokerData = calculateBrokerConcentration(stockTrades, sym, stockSummaryWithBroker);
      const wyckoff = classifyWyckoffStage(stockSummaryWithBroker, historyCandles, brokerData);

      const streak = whaleStreakMap.get(symUpper);
      const distStreak = whaleStreakMap.get(symUpper + '_DIST');

      const isSampleValid = brokerData?.status !== 'insufficient_sample' && 
        (brokerData?.totalBuyVolume || 0) >= 200 &&
        (stockSummaryWithBroker?.realBrokerAnalysis ? true : (stockTrades.length >= 5 || (brokerData?.totalBuyVolume || 0) >= 500));
      const bcr3Buy = isSampleValid ? (brokerData?.bcr3BuyPct || 0) : 0;
      const bcr3Sell = isSampleValid ? (brokerData?.bcr3SellPct || 0) : 0;
      const topSellers = brokerData?.topSellerBrokers || [];
      const topBuyers = brokerData?.topBuyerBrokers || [];
      const hasSellingAsymmetry = bcr3Sell >= 45.0 && (bcr3Sell - bcr3Buy) >= 10.0;
      const topSellerNetDumping = isSampleValid && (
        topSellers.slice(0, 3).some((sel: any) => {
          const buyOfSel = topBuyers.find((b: any) => b.broker === sel.broker)?.volume || 0;
          return sel.volume > buyOfSel && (sel.volume - buyOfSel) > ((brokerData?.totalSellVolume || 1) * 0.20);
        }) && hasSellingAsymmetry
      );
      const pChange = effectivePChange;
      const isSellerDominant = isSampleValid && (
        hasSellingAsymmetry ||
        topSellerNetDumping ||
        (brokerData?.smartMoneyBias === 'Operator Offloading' && bcr3Sell > bcr3Buy)
      );
      const isDumping = Boolean(
        isSampleValid && (
          isSellerDominant ||
          (brokerData?.adSignal === 'Distribution' && (Number(brokerData?.adStrength || 0) >= 30 || Number(brokerData?.adRatio || 0) <= -0.08) && bcr3Sell > bcr3Buy)
        )
      );
      const isTrap = isDumping && (pChange >= 0 || wyckoff.stage.includes('PUMP'));
      const isAccumulation = isSampleValid && (bcr3Buy >= 40.0 || (brokerData?.bcr5BuyPct >= 50.0 && bcr3Buy >= 36.0)) && (bcr3Buy - bcr3Sell) >= 5.0 && !isDumping;

      // Compute rolling-window multi-day diagnostics
      const dailyHistory = buildDailyHistoryFromStockData(stockSummaryWithBroker, stockBrokerAnalysis, historyCandles);
      const multiDayDiag = calculateMultiDayDiagnostics(dailyHistory, radarDays);
      const phase = multiDayDiag?.phase || (isTrap ? 'BULL_TRAP' : isDumping ? 'DISTRIBUTION_DANGER' : isAccumulation ? 'STEALTH_ACCUMULATION' : 'NEUTRAL_RETAIL');

      const partialStock = {
        ...s,
        pChange: effectivePChange,
        volume: effectiveVolume,
        timeframeDays: radarDays,
        multiDayDiag,
        phase,
        phaseLabel: multiDayDiag?.phaseLabel || (isTrap ? 'Bull Trap' : isDumping ? 'Distribution Danger' : isAccumulation ? 'Stealth Accumulation' : 'Normal Retail Flow'),
        bigBrokerVWAP: multiDayDiag?.bigBrokerVWAP || 0,
        bcr5NetPct: multiDayDiag?.bcr5NetPct || (brokerData?.bcr5BuyPct || 0),
        scr3NetPct: multiDayDiag?.scr3NetPct || (brokerData?.bcr3SellPct || 0),
        grossBuyConcentrationPct: multiDayDiag?.grossBuyConcentrationPct || bcr3Buy,
        grossSellConcentrationPct: multiDayDiag?.grossSellConcentrationPct || bcr3Sell,
        smartMoneyNetFlowPct: multiDayDiag?.smartMoneyNetFlowPct || (bcr3Buy - bcr3Sell),
        buyZoneMin: multiDayDiag?.buyZoneMin || +(Number(s.ltp || s.closePrice || 100) * 0.98).toFixed(1),
        buyZoneMax: multiDayDiag?.buyZoneMax || +(Number(s.ltp || s.closePrice || 100) * 1.02).toFixed(1),
        entryStatus: multiDayDiag?.entryStatus || '',
        entryDescription: multiDayDiag?.entryDescription || '',
        wyckoff,
        brokerData,
        isTrap,
        isDumping,
        isSellerDominant,
        isAccumulation,
        bcr3Buy,
        bcr3Sell,
        whaleStreak: streak || null,
        whaleDistStreak: distStreak || null
      };

      const corneringAnalysis = calculateStockCorneringScore(partialStock);

      return {
        ...partialStock,
        corneringAnalysis
      };
    });
  }, [stocks, floorsheetBySymbol, stockBrokerDataMap, whaleStreakMap, radarDays]);

  // Sector-by-Sector #1 Smart Money Accumulation Champions
  const sectorChampions = useMemo(() => {
    return calculateSectorAccumulationChampions(analyzedStocks);
  }, [analyzedStocks]);

  const activeSectorChampions = useMemo(() => {
    return sectorChampions.filter(c => c.confidenceTier === 'GRADE_A_CONFIRMED' || c.confidenceTier === 'GRADE_B_EMERGING');
  }, [sectorChampions]);

  const neutralSectorChampions = useMemo(() => {
    return sectorChampions.filter(c => c.confidenceTier === 'GRADE_C_NEUTRAL');
  }, [sectorChampions]);

  const displayedSectorChampions = useMemo(() => {
    if (selectedSector !== 'ALL') {
      const match = sectorChampions.filter(c => c.sector.toLowerCase() === selectedSector.toLowerCase());
      return match.length > 0 ? match : [];
    }
    return activeSectorChampions.length > 0 ? activeSectorChampions : sectorChampions.slice(0, 3);
  }, [sectorChampions, selectedSector, activeSectorChampions]);

  // Auto-capture Daily Whale Snapshot once per session load (guarded against recursive re-renders)
  const hasCapturedRef = React.useRef(false);
  useEffect(() => {
    if (stocks.length > 0 && !loading && !hasCapturedRef.current) {
      hasCapturedRef.current = true;
      const dataset = (analyzedStocks.length > 0) ? analyzedStocks : stocks;
      captureDailyWhaleSnapshot(dataset, floorsheet);
      const updated = getStoredWhaleArchive();
      setWhaleArchive(updated);
      setSelectedArchiveDate(prev => prev || updated[0]?.date || '');
    }
  }, [stocks.length, loading, floorsheet.length]);

  // Sector Aggregations for Sector Rotation Flow Bar
  const sectorFlowStats = useMemo(() => {
    const map = new Map<string, { sector: string; count: number; accumulatingCount: number; trapCount: number; totalTurnover: number }>();
    
    analyzedStocks.forEach((s) => {
      const sec = s.sector || 'Others';
      if (!map.has(sec)) {
        map.set(sec, { sector: sec, count: 0, accumulatingCount: 0, trapCount: 0, totalTurnover: 0 });
      }
      const cur = map.get(sec)!;
      cur.count++;
      cur.totalTurnover += Number(s.turnover || 0);

      const isD1 = s.wyckoff?.isDay1StealthCandidate || (s.wyckoff?.qaiScore >= 65);
      if (s.isTrap || s.isDumping) {
        cur.trapCount++;
      } else if (s.isAccumulation || isD1 || s.wyckoff?.stage?.includes('STEALTH')) {
        cur.accumulatingCount++;
      }
    });

    return Array.from(map.values())
      .filter((s) => s.count > 0)
      .sort((a, b) => b.accumulatingCount - a.accumulatingCount || b.totalTurnover - a.totalTurnover);
  }, [analyzedStocks]);

  // Filtered & Sorted list for the radar
  const filteredStocks = useMemo(() => {
    let list = analyzedStocks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          (s.sector && s.sector.toLowerCase().includes(q))
      );
    }

    if (selectedSector !== 'ALL') {
      list = list.filter((s) => (s.sector || '').toLowerCase() === selectedSector.toLowerCase());
    }

    if (selectedStage !== 'ALL') {
      if (selectedStage === 'STEALTH') {
        list = list.filter((s) => s.phase === 'STEALTH_ACCUMULATION' || s.wyckoff?.stage?.includes('STEALTH') || s.isAccumulation);
      } else if (selectedStage === 'PUMP' || selectedStage === 'MARKUP') {
        list = list.filter((s) => s.phase === 'ACTIVE_MARKUP' || s.wyckoff?.stage?.includes('PUMP'));
      } else if (selectedStage === 'DISTRIBUTION') {
        list = list.filter((s) => s.phase === 'DISTRIBUTION_DANGER' || s.wyckoff?.stage?.includes('DISTRIBUTION') || s.wyckoff?.stage?.includes('EUPHORIA'));
      } else if (selectedStage === 'TRAP' || selectedStage === 'DUMP') {
        list = list.filter((s) => s.phase === 'BULL_TRAP' || s.phase === 'DISTRIBUTION_DANGER' || s.isTrap || s.isDumping || s.wyckoff?.stage?.includes('DUMP'));
      } else if (selectedStage === 'SPRING') {
        list = list.filter((s) => s.wyckoff?.stage?.includes('SPRING'));
      } else {
        list = list.filter((s) => s.wyckoff?.stage?.includes(selectedStage) || s.phase === selectedStage);
      }
    }

    if (step4Filter === 'SECTOR_LEADERS') {
      const champSymbols = new Set(sectorChampions.map(c => c.symbol).filter(Boolean));
      list = list.filter((s) => champSymbols.has(s.symbol));
    } else if (step4Filter === 'DAY1_STEALTH') {
      list = list.filter((s) => {
        const qai = s.wyckoff?.qaiScore || 0;
        const isD1 = s.wyckoff?.isDay1StealthCandidate;
        const pChange = Number(s.pChange || 0);
        return isD1 || (qai >= 65 && pChange >= -1.8 && pChange <= 2.5);
      });
    } else if (step4Filter === 'DAY2_PRIME') {
      list = list.filter((s) => Boolean(s.whaleStreak?.alertType === 'DAY_2_PRIME' || s.whaleStreak?.consecutiveDays === 2));
    } else if (step4Filter === 'VDU_COIL') {
      list = list.filter((s) => Boolean(s.wyckoff?.earlySignals?.volumeDryUp?.isVDU || s.wyckoff?.earlySignals?.earlyAlertVerdict === 'EARLY_ACCUMULATION_COIL'));
    } else if (step4Filter === 'CHURN_TRAP') {
      list = list.filter((s) => Boolean(s.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'HIGH_DISTRIBUTION_CHURN' || s.wyckoff?.earlySignals?.earlyAlertVerdict === 'EARLY_DISTRIBUTION_CHURN'));
    } else if (step4Filter === 'ACCUMULATION') {
      list = list.filter((s) => s.isAccumulation);
    } else if (step4Filter === 'TRAP') {
      list = list.filter((s) => s.isTrap || s.isDumping);
    }

    return list.sort((a, b) => {
      if (sortBy === 'qai') return (b.wyckoff.qaiScore || b.wyckoff.stealthScore || 0) - (a.wyckoff.qaiScore || a.wyckoff.stealthScore || 0);
      if (sortBy === 'stealth') return b.wyckoff.stealthScore - a.wyckoff.stealthScore;
      if (sortBy === 'dumpRisk') return b.wyckoff.pumpDumpRiskScore - a.wyckoff.pumpDumpRiskScore;
      if (sortBy === 'pChange') return (b.pChange || 0) - (a.pChange || 0);
      if (sortBy === 'turnover') return (b.turnover || 0) - (a.turnover || 0);
      if (sortBy === 'cmf') return b.wyckoff.cmf - a.wyckoff.cmf;
      return 0;
    });
  }, [analyzedStocks, searchQuery, selectedSector, selectedStage, sortBy, step4Filter]);

  // Currently inspected stock for Deep Diagnostic (strictly reactive to diagnosticDays)
  const activeStock = useMemo(() => {
    const base = (
      analyzedStocks.find((s) => s.symbol === selectedStockSymbol) ||
      analyzedStocks[0] ||
      null
    );
    if (!base) return null;

    if (diagnosticDays === radarDays) {
      return base;
    }

    const sym = base.symbol;
    const symUpper = sym ? sym.toUpperCase() : '';
    const diagBrokerAnalysis = stockBrokerDataMap[`${symUpper}_${diagnosticDays}`] || getCachedRealBrokerAnalysis(sym, diagnosticDays);

    const cachedHist = getCachedRealPriceHistory(sym);
    const historyCandles: Candle[] = Array.isArray(base.history) && base.history.length >= 10
      ? base.history
      : Array.isArray(cachedHist) && cachedHist.length >= 10
      ? cachedHist
      : [];

    const multiDayCandles = historyCandles.length >= 2
      ? historyCandles.slice(-Math.min(historyCandles.length, diagnosticDays))
      : historyCandles;

    const effectivePChange = (diagnosticDays > 1 && multiDayCandles.length >= 2)
      ? Number((((multiDayCandles[multiDayCandles.length - 1].close - multiDayCandles[0].open) / (multiDayCandles[0].open || 1)) * 100).toFixed(2))
      : Number(base.pChange || 0);

    const effectiveVolume = (diagnosticDays > 1 && multiDayCandles.length >= 2)
      ? multiDayCandles.reduce((acc: number, c: any) => acc + (c.volume || 0), 0)
      : Number(base.volume || base.totalTradedQuantity || 0);

    const stockSummaryWithBroker = diagBrokerAnalysis
      ? { ...base, pChange: effectivePChange, volume: effectiveVolume, realBrokerAnalysis: diagBrokerAnalysis }
      : { ...base, pChange: effectivePChange, volume: effectiveVolume };

    // For multi-day diagnostic, single-day live floorsheet must NOT contaminate multi-day cumulative metrics!
    const stockTrades = diagnosticDays === 1 ? (floorsheetBySymbol.get(symUpper) || []) : [];
    const brokerData = calculateBrokerConcentration(stockTrades, sym, stockSummaryWithBroker, diagBrokerAnalysis);

    const dailyHistory = buildDailyHistoryFromStockData(stockSummaryWithBroker, diagBrokerAnalysis, historyCandles);
    const multiDayDiag = calculateMultiDayDiagnostics(dailyHistory, diagnosticDays);

    const stockLtp = Number(base.ltp || base.closePrice || 100);
    const buyZoneMin = multiDayDiag?.buyZoneMin || +(stockLtp * 0.98).toFixed(1);
    const buyZoneMax = multiDayDiag?.buyZoneMax || +(stockLtp * 1.02).toFixed(1);

    return {
      ...base,
      pChange: effectivePChange,
      volume: effectiveVolume,
      timeframeDays: diagnosticDays,
      multiDayDiag,
      brokerData,
      buyZoneMin,
      buyZoneMax,
      bcr5NetPct: multiDayDiag?.bcr5NetPct ?? brokerData?.bcr5BuyPct ?? base.bcr5NetPct,
      scr3NetPct: multiDayDiag?.scr3NetPct ?? brokerData?.bcr3SellPct ?? base.scr3NetPct,
      grossBuyConcentrationPct: multiDayDiag?.grossBuyConcentrationPct ?? brokerData?.bcr3BuyPct ?? base.grossBuyConcentrationPct,
      grossSellConcentrationPct: multiDayDiag?.grossSellConcentrationPct ?? brokerData?.bcr3SellPct ?? base.grossSellConcentrationPct,
      smartMoneyNetFlowPct: multiDayDiag?.smartMoneyNetFlowPct ?? ((brokerData?.bcr3BuyPct || 0) - (brokerData?.bcr3SellPct || 0)),
      bigBrokerVWAP: multiDayDiag?.bigBrokerVWAP || base.bigBrokerVWAP || 0,
      phase: multiDayDiag?.phase || base.phase,
      phaseLabel: multiDayDiag?.phaseLabel || base.phaseLabel,
      entryStatus: multiDayDiag?.entryStatus || base.entryStatus,
      entryDescription: multiDayDiag?.entryDescription || base.entryDescription
    };
  }, [analyzedStocks, selectedStockSymbol, diagnosticDays, radarDays, stockBrokerDataMap, floorsheetBySymbol]);

  const runZeroSumVerification = async (symToVerify?: string) => {
    const targetSym = (symToVerify || selectedStockSymbol || 'NABIL').toUpperCase().trim();
    setZeroSumAudit({ loading: true, symbol: targetSym, buyVol: 0, sellVol: 0, delta: 0, balanced: false, brokerCount: 0 });
    try {
      const res = await fetchRealBrokerAnalysis(targetSym, radarDays, { date: radarDate, refresh: true });
      const brokers = Array.isArray(res?.brokers) ? res.brokers : [];
      const sumBuy = brokers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.buyQuantity || 0), 0) || Number(res?.totalVolume || 0);
      const sumSell = brokers.reduce((acc: number, b: any) => acc + Number(b.sellQty || b.sellQuantity || 0), 0) || Number(res?.totalVolume || 0);
      const delta = sumBuy - sumSell;
      setZeroSumAudit({
        loading: false,
        symbol: targetSym,
        buyVol: sumBuy,
        sellVol: sumSell,
        delta,
        balanced: sumBuy > 0 && delta === 0,
        brokerCount: brokers.length
      });
    } catch (_) {
      const targetStock = analyzedStocks.find(s => s.symbol === targetSym) || activeStock;
      const localBroker = targetStock?.brokerData;
      const sumBuy = Number(localBroker?.totalBuyVolume || 0);
      const sumSell = Number(localBroker?.totalSellVolume || 0);
      setZeroSumAudit({
        loading: false,
        symbol: targetSym,
        buyVol: sumBuy,
        sellVol: sumSell,
        delta: sumBuy - sumSell,
        balanced: sumBuy > 0 && sumBuy === sumSell,
        brokerCount: (localBroker?.topBuyerBrokers?.length || 0)
      });
    }
  };

  // Global radar overview statistics
  const stats = useMemo(() => {
    let stealthCount = 0;
    let day1StealthCount = 0;
    let day2PrimeCount = 0;
    let vduCount = 0;
    let churnCount = 0;
    let pumpCount = 0;
    let distributionCount = 0;
    let dumpCount = 0;
    let springCount = 0;
    let totalCMF = 0;
    let step4AccumulationCount = 0;
    let step4TrapCount = 0;

    analyzedStocks.forEach((s) => {
      const st = s.wyckoff?.stage || '';
      const ph = s.phase || '';
      if (ph === 'STEALTH_ACCUMULATION' || st.includes('STEALTH') || s.isAccumulation) stealthCount++;
      if (ph === 'ACTIVE_MARKUP' || st.includes('PUMP')) pumpCount++;
      if (ph === 'DISTRIBUTION_DANGER' || st.includes('DISTRIBUTION') || st.includes('EUPHORIA')) distributionCount++;
      if (ph === 'BULL_TRAP' || ph === 'DISTRIBUTION_DANGER' || st.includes('DUMP') || s.isTrap || s.isDumping) dumpCount++;
      if (st.includes('SPRING')) springCount++;
      totalCMF += (s.wyckoff?.cmf || 0);

      const qai = s.wyckoff?.qaiScore || 0;
      const isD1 = s.wyckoff?.isDay1StealthCandidate || (qai >= 65 && Number(s.pChange || 0) >= -1.8 && Number(s.pChange || 0) <= 2.5);
      if (isD1) day1StealthCount++;

      if (s.whaleStreak?.alertType === 'DAY_2_PRIME' || s.whaleStreak?.consecutiveDays === 2) {
        day2PrimeCount++;
      }

      if (s.wyckoff?.earlySignals?.volumeDryUp?.isVDU || s.wyckoff?.earlySignals?.earlyAlertVerdict === 'EARLY_ACCUMULATION_COIL') {
        vduCount++;
      }
      if (s.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'HIGH_DISTRIBUTION_CHURN' || s.wyckoff?.earlySignals?.earlyAlertVerdict === 'EARLY_DISTRIBUTION_CHURN') {
        churnCount++;
      }

      if (s.isTrap || s.isDumping) step4TrapCount++;
      else if (s.isAccumulation) step4AccumulationCount++;
    });

    const avgCMF = analyzedStocks.length > 0 ? totalCMF / analyzedStocks.length : 0;
    return {
      stealthCount,
      day1StealthCount,
      day2PrimeCount,
      vduCount,
      churnCount,
      pumpCount,
      distributionCount,
      dumpCount,
      springCount,
      step4AccumulationCount,
      step4TrapCount,
      avgCMF: Number(avgCMF.toFixed(3)),
      marketBias: avgCMF > 0.03 ? 'Institutional Accumulation' : avgCMF < -0.03 ? 'Distribution Pressure' : 'Balanced'
    };
  }, [analyzedStocks]);

  return (
    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 text-slate-100 space-y-3 sm:space-y-5">
      {/* Top Banner & Header */}
      <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-5 border border-emerald-500/20 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Wyckoff & NEPSE Microstructure
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Floor Sheet Floor Flow
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 shrink-0" />
              <span>Accumulation & Distribution Radar</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              संकलन र वितरण विश्लेषक: Identify smart money cornering, spot operator pumps early, and avoid high-turnover retail dumping traps.
            </p>
          </div>

          {/* Quick Tab Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 w-full overflow-x-auto scrollbar-none self-start md:self-auto">
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'radar'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" /> Live Radar
            </button>
            <button
              onClick={() => setActiveTab('smart-flow')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'smart-flow'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Slow Flow & Dump Tracker
            </button>
            <button
              onClick={() => setActiveTab('portfolio-shield')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'portfolio-shield'
                  ? 'bg-indigo-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" /> 🛡️ Portfolio Shield
            </button>
            <button
              onClick={() => setActiveTab('archive')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'archive'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Daily Whale Archive
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'diagnostic'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Deep Diagnostic
            </button>
            <button
              onClick={() => setActiveTab('playbook')}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === 'playbook'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Theory & Guide
            </button>
          </div>
        </div>

        {/* ── LIVE NOTIFICATION STATUS BAR (RADAR REAL-TIME TELEMETRY STREAM) ── */}
        <div className="mt-4 p-2.5 sm:p-3 rounded-xl bg-slate-950/90 border border-emerald-500/40 shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live Status Alert
            </span>
            <div className="text-xs text-slate-200 font-semibold truncate">
              {stats.step4AccumulationCount > 0 ? (
                <span>
                  🟢 <strong className="text-emerald-400">{stats.step4AccumulationCount} Institutional Accumulations</strong> (&gt;40% BCR₃) | 
                  Top sector: <span className="text-amber-300">Hydro Power ({sectorFlowStats.find(s=>s.sector.toLowerCase().includes('hydro'))?.accumulatingCount || 0})</span> | 
                  🚨 {stats.step4TrapCount} Distribution Trap alerts flagged
                </span>
              ) : (
                <span>Floor sheet live telemetry scanning 250+ NEPSE tickers...</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] shrink-0">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Session: <strong className="text-slate-200">{floorsheet.length > 0 ? `${floorsheet.length.toLocaleString()} trades` : 'Deep Cache'}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 font-bold">
              Market Bias: {stats.marketBias}
            </span>
            <button
              type="button"
              onClick={() => runZeroSumVerification(selectedStockSymbol || 'NABIL')}
              disabled={zeroSumAudit?.loading}
              className="px-2.5 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/40 font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              title="Run In-App Floorsheet Zero-Sum Parity Audit (∑ Buy = ∑ Sell)"
            >
              <span>⚖️</span>
              <span>{zeroSumAudit?.loading ? 'Auditing...' : 'Audit ∑ Buy = ∑ Sell'}</span>
            </button>
          </div>
        </div>

        {/* ── ZERO-SUM PARITY VERIFIER BANNER (∑ BUY = ∑ SELL) ── */}
        {zeroSumAudit && (
          <div className={`mt-3 p-3 sm:p-4 rounded-xl border transition-all ${
            zeroSumAudit.loading
              ? 'bg-slate-950/90 border-indigo-500/40 animate-pulse text-indigo-300'
              : zeroSumAudit.balanced
              ? 'bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
              : 'bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-950 border-rose-500/50'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className={`p-2 rounded-xl text-lg shrink-0 ${
                  zeroSumAudit.loading ? 'bg-indigo-500/20 text-indigo-400' : zeroSumAudit.balanced ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {zeroSumAudit.loading ? '⏳' : zeroSumAudit.balanced ? '⚖️' : '⚠️'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      Floorsheet Zero-Sum Parity Verifier: <strong className="text-emerald-400">{zeroSumAudit.symbol}</strong>
                    </span>
                    {zeroSumAudit.balanced ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold flex items-center gap-1">
                        ✓ 100% MATHEMATICAL ZERO-SUM CONSERVED
                      </span>
                    ) : !zeroSumAudit.loading ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-extrabold flex items-center gap-1">
                        ⚠️ ASYMMETRIC DELTA DETECTED
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {zeroSumAudit.loading ? (
                      'Querying live floorsheet exchange transactions across all NEPSE brokers...'
                    ) : zeroSumAudit.balanced ? (
                      <span>Exchange Invariant Conserved: Sum of all broker buys identically equals sum of all broker sells across all <strong>{zeroSumAudit.brokerCount || 'active'} brokers</strong> (Zero-sum closed system).</span>
                    ) : (
                      <span>Discrepancy detected: Difference of {zeroSumAudit.delta} kitta. Check if bilateral cross-trades or block transfers are still settling.</span>
                    )}
                  </p>
                </div>
              </div>

              {!zeroSumAudit.loading && (
                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">∑ Buy: </span>
                    <strong className="text-emerald-400 font-bold">{zeroSumAudit.buyVol.toLocaleString()}</strong>
                  </div>
                  <span className="text-slate-500 font-black">=</span>
                  <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">∑ Sell: </span>
                    <strong className="text-rose-400 font-bold">{zeroSumAudit.sellVol.toLocaleString()}</strong>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[11px]">Δ: </span>
                    <strong className={zeroSumAudit.delta === 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                      {zeroSumAudit.delta === 0 ? '0 kitta (0.00%)' : `${zeroSumAudit.delta} kitta`}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZeroSumAudit(null)}
                    className="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-slate-800 transition"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TIMEFRAME & HISTORICAL SESSION ANALYSIS BAR (UP TO 500 SESSIONS) ── */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Horizon:</span>
            {[
              { label: '1D (Daily)', days: 1 },
              { label: '3D (Ignition)', days: 3 },
              { label: '5D (Weekly)', days: 5 },
              { label: '15D (Swing)', days: 15 },
              { label: '30D (Full Ledger)', days: 30 },
            ].map(pill => (
              <button
                key={pill.label}
                onClick={() => handleRadarTimeframeChange(pill.days)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shrink-0 ${
                  radarDays === pill.days && !radarDate
                    ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                    : 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Session Date:</span>
            <select
              value={radarDate}
              onChange={(e) => handleRadarDateChange(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-slate-200 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">Latest Session ({radarDays}D Cumulative)</option>
              {radarAvailableDates.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
            {radarDate && (
              <button
                onClick={() => handleRadarDateChange('')}
                className="px-2 py-1 text-xs text-slate-400 hover:text-amber-400 border border-slate-800 rounded bg-slate-900"
                title="Reset to Latest"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── REAL HISTORICAL DATA WINDOW GUARANTEE BADGE (ZERO MOCK DATA) ── */}
        <div className={`mt-2 px-3 py-1.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs transition-all ${
          radarDays > loadedTradingDays
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${radarDays > loadedTradingDays ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {radarDays > loadedTradingDays ? (
              <span>
                <strong>Showing {loadedTradingDays} Real Trading Days Loaded</strong>{' '}
                <span className="text-amber-400/80">
                  ({isBackfilling ? `Historical backfill in progress: ${loadedTradingDays}/${radarDays} days` : `All ${loadedTradingDays} verified historical sessions aggregated`})
                </span>
              </span>
            ) : (
              <span>
                <strong>{radarDays === 1 ? 'Latest Session' : `${radarDays} Trading Days`} Verified Real NEPSE Floorsheet Data</strong>{' '}
                <span className="text-slate-400 text-[11px]">({loadedTradingDays} total authentic sessions in SQLite)</span>
              </span>
            )}
          </div>
          <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded ${
            radarDays > loadedTradingDays ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'
          }`}>
            100% Real Records (Zero Mock Data)
          </span>
        </div>

        {/* Global Summary Stat Cards (Interactive Phase Selectors) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3 pt-3 border-t border-slate-800/80">
          {/* Card 1: Stealth Accumulation */}
          <div
            onClick={() => handlePhaseCardClick('STEALTH')}
            className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none group relative ${
              selectedPhase === 'STEALTH'
                ? 'bg-emerald-950/70 border-emerald-400 ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-950/60 scale-[1.02]'
                : 'bg-slate-950/50 border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Stealth Accumulation
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${selectedPhase === 'STEALTH' ? 'bg-emerald-400 text-slate-950 font-black' : 'text-slate-400 group-hover:text-emerald-400'}`}>
                {selectedPhase === 'STEALTH' ? 'Active ✓' : 'Filter →'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5 flex items-baseline gap-1.5">
              {isRecalculatingTimeframe ? (
                <span className="text-sm text-slate-400 animate-pulse">Calculating...</span>
              ) : (
                <>
                  <span>{stats.stealthCount}</span>
                  <span className="text-xs text-slate-400 font-normal">stocks</span>
                </>
              )}
            </div>
            <div className="text-[10px] sm:text-[10.5px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>Quiet institutional buying</span>
              <span className="text-[9px] font-bold text-emerald-400/80">[{radarDays}D window]</span>
            </div>
          </div>

          {/* Card 2: Active Markup / Pump */}
          <div
            onClick={() => handlePhaseCardClick('PUMP')}
            className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none group relative ${
              selectedPhase === 'PUMP'
                ? 'bg-blue-950/70 border-blue-400 ring-2 ring-blue-400/60 shadow-lg shadow-blue-950/60 scale-[1.02]'
                : 'bg-slate-950/50 border-slate-800/80 hover:border-blue-500/50 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> Active Markup / Pump
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${selectedPhase === 'PUMP' ? 'bg-blue-400 text-slate-950 font-black' : 'text-slate-400 group-hover:text-blue-400'}`}>
                {selectedPhase === 'PUMP' ? 'Active ✓' : 'Filter →'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-blue-400 mt-0.5 flex items-baseline gap-1.5">
              {isRecalculatingTimeframe ? (
                <span className="text-sm text-slate-400 animate-pulse">Calculating...</span>
              ) : (
                <>
                  <span>{stats.pumpCount}</span>
                  <span className="text-xs text-slate-400 font-normal">stocks</span>
                </>
              )}
            </div>
            <div className="text-[10px] sm:text-[10.5px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>Price & volume expansion</span>
              <span className="text-[9px] font-bold text-blue-400/80">[{radarDays}D window]</span>
            </div>
          </div>

          {/* Card 3: Distribution Danger */}
          <div
            onClick={() => handlePhaseCardClick('DISTRIBUTION')}
            className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none group relative ${
              selectedPhase === 'DISTRIBUTION'
                ? 'bg-orange-950/70 border-orange-400 ring-2 ring-orange-400/60 shadow-lg shadow-orange-950/60 scale-[1.02]'
                : 'bg-slate-950/50 border-slate-800/80 hover:border-orange-500/50 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-400" /> Distribution Danger
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${selectedPhase === 'DISTRIBUTION' ? 'bg-orange-400 text-slate-950 font-black' : 'text-slate-400 group-hover:text-orange-400'}`}>
                {selectedPhase === 'DISTRIBUTION' ? 'Active ✓' : 'Filter →'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-orange-400 mt-0.5 flex items-baseline gap-1.5">
              {isRecalculatingTimeframe ? (
                <span className="text-sm text-slate-400 animate-pulse">Calculating...</span>
              ) : (
                <>
                  <span>{stats.distributionCount}</span>
                  <span className="text-xs text-slate-400 font-normal">stocks</span>
                </>
              )}
            </div>
            <div className="text-[10px] sm:text-[10.5px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>Peak churning & selling</span>
              <span className="text-[9px] font-bold text-orange-400/80">[{radarDays}D window]</span>
            </div>
          </div>

          {/* Card 4: Active Dump / Retail Trap */}
          <div
            onClick={() => handlePhaseCardClick('TRAP')}
            className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none group relative ${
              selectedPhase === 'TRAP'
                ? 'bg-red-950/70 border-red-400 ring-2 ring-red-400/60 shadow-lg shadow-red-950/60 scale-[1.02]'
                : 'bg-slate-950/50 border-slate-800/80 hover:border-red-500/50 hover:bg-slate-900/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Active Dump / Trap
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${selectedPhase === 'TRAP' ? 'bg-red-400 text-slate-950 font-black' : 'text-slate-400 group-hover:text-red-400'}`}>
                {selectedPhase === 'TRAP' ? 'Active ✓' : 'Filter →'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-red-400 mt-0.5 flex items-baseline gap-1.5">
              {isRecalculatingTimeframe ? (
                <span className="text-sm text-slate-400 animate-pulse">Calculating...</span>
              ) : (
                <>
                  <span>{stats.dumpCount}</span>
                  <span className="text-xs text-slate-400 font-normal">stocks</span>
                </>
              )}
            </div>
            <div className="text-[10px] sm:text-[10.5px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>Capitulation & trap risk</span>
              <span className="text-[9px] font-bold text-red-400/80">[{radarDays}D window]</span>
            </div>
          </div>
        </div>

        {/* ── EXPANDABLE PHASE BREAKDOWN DRAWER / DETAIL PANEL ── */}
        {selectedPhase && (() => {
          const phaseDefKey = selectedPhase === 'STEALTH' ? 'STEALTH_ACCUMULATION'
            : selectedPhase === 'PUMP' ? 'ACTIVE_MARKUP'
            : selectedPhase === 'DISTRIBUTION' ? 'DISTRIBUTION_DANGER'
            : selectedPhase === 'TRAP' ? 'BULL_TRAP'
            : selectedPhase;
          const activePhaseDef = PHASE_DEFINITIONS[phaseDefKey as keyof typeof PHASE_DEFINITIONS];

          return (
            <div className="mt-3 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/95 border border-slate-700 shadow-2xl transition-all">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {selectedPhase === 'STEALTH' ? '🟢' : selectedPhase === 'PUMP' ? '🚀' : selectedPhase === 'DISTRIBUTION' ? '⚠️' : '🔴'}
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      {selectedPhase === 'STEALTH' && 'Phase Breakdown: Stealth Accumulation (गोप्य संकलन)'}
                      {selectedPhase === 'PUMP' && 'Phase Breakdown: Active Markup / The Pump (पम्पिङ तथा तीव्र वृद्धि)'}
                      {selectedPhase === 'DISTRIBUTION' && 'Phase Breakdown: Distribution Danger (वितरण तथा माल फाल्ने खतरा)'}
                      {selectedPhase === 'TRAP' && 'Phase Breakdown: Active Dump & Retail Trap (डम्पिङ तथा ट्र्याप)'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Active Horizon: <strong className="text-emerald-400">{radarDays}D Cumulative Analysis</strong> &bull; Filtered stocks shown below
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activePhaseDef?.badge && (
                    <span className="hidden sm:inline-block px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-900 text-slate-300 border border-slate-700">
                      {activePhaseDef.badge}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPhase(null);
                      setSelectedStage('ALL');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    Clear Filter ✕
                  </button>
                </div>
              </div>

              {/* Plain-English Definition & Exact Triggered Criteria */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                    <Info className="w-3.5 h-3.5 text-blue-400" /> What this phase means:
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {activePhaseDef?.explanation || (
                      selectedPhase === 'STEALTH' ? 'Smart money / institutional operators quietly absorb blocks of shares without bidding up prices, keeping daily volatility tight and accumulation hidden from retail screeners.' :
                      selectedPhase === 'PUMP' ? 'Having cornered the floating supply, operators expand bids to push price through resistance levels with high volume momentum and FOMO expansion.' :
                      selectedPhase === 'DISTRIBUTION' ? 'Top institutional brokers churn peak trading volume (record turnover) into retail enthusiasm at elevated prices to offload inventory before markdown.' :
                      'Smart money exits completely, dumping heavy seller blocks into unsuspecting retail dip-buyers; high hazard of negative circuit overhang and T+2 settlement lock.'
                    )}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Exact Triggered Criteria:
                  </div>
                  {activePhaseDef?.criteria && (
                    <div className="text-[11px] font-semibold text-amber-300/90 pb-1 border-b border-slate-800/80">
                      ⚙️ {activePhaseDef.criteria}
                    </div>
                  )}
                  <ul className="text-xs text-slate-300 space-y-1">
                    {selectedPhase === 'STEALTH' && (
                      <>
                        <li className="flex items-center gap-1.5">✓ <strong>Top-3 Buyer Concentration (BCR₃):</strong> ≥ 36–40% (or BCR₅ ≥ 50%)</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Buyer vs Seller Asymmetry:</strong> BCR₃ exceeds SCR₃ by ≥ 5.0%</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Price Tightness:</strong> Intraday move compressed within -2.0% to +3.5% near institutional VWAP</li>
                      </>
                    )}
                    {selectedPhase === 'PUMP' && (
                      <>
                        <li className="flex items-center gap-1.5">✓ <strong>Momentum & Price Expansion:</strong> Gain ≥ +3.5% with expanding volume</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Money Flow Index (CMF 20):</strong> Positive institutional inflow (CMF ≥ +0.05)</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Trade Ticket Asymmetry:</strong> Buyer ticket size ratio ≥ 1.2x (large blocks dominating)</li>
                      </>
                    )}
                    {selectedPhase === 'DISTRIBUTION' && (
                      <>
                        <li className="flex items-center gap-1.5">✓ <strong>Wyckoff Effort vs Result Churn:</strong> RVOL ≥ 1.5x with narrow body or upper wick ≥ 40%</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Seller Concentration (SCR₃):</strong> Dominant selling desks holding ≥ 40% sell volume</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Negative Flow Divergence:</strong> Price near highs while leading OBV or CMF deteriorates</li>
                      </>
                    )}
                    {selectedPhase === 'TRAP' && (
                      <>
                        <li className="flex items-center gap-1.5">✓ <strong>Bull Trap Footprint:</strong> Price green today while top 3 brokers net dump &gt;20% of volume</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Seller Dominance (SCR₃):</strong> Heavy institutional selling share ≥ 45% (SCR₃ − BCR₃ ≥ 10%)</li>
                        <li className="flex items-center gap-1.5">✓ <strong>Circuit Overhang Risk:</strong> Rapid markdown with retail orders trapped by T+2 lock</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              {/* Quick Filtered Stocks Strip */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300">
                    Stocks in this phase ({filteredStocks.length} matching for {radarDays}D window):
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Sorted by conviction score &bull; Click to inspect
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {filteredStocks.slice(0, 10).map((stk) => (
                    <div
                      key={stk.symbol}
                      onClick={() => {
                        setSelectedStockSymbol(stk.symbol);
                        setActiveTab('diagnostic');
                      }}
                      className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition cursor-pointer shrink-0 min-w-[130px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-white text-xs">{stk.symbol}</span>
                        <span className={`text-[10px] font-bold ${stk.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {stk.pChange >= 0 ? '+' : ''}{stk.pChange?.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{stk.sector || 'Others'}</div>
                      <div className="flex items-center justify-between text-[10px] text-slate-300 mt-1">
                        <span>Rs. {stk.ltp?.toLocaleString()}</span>
                        <span className="text-emerald-400 font-bold">Diag →</span>
                      </div>
                    </div>
                  ))}
                  {filteredStocks.length === 0 && (
                    <div className="text-xs text-slate-400 py-2 italic">
                      No stocks matching this phase in the current {radarDays}D window.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: SMART MONEY SLOW ACCUMULATION & DUMPING TRACKER                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'smart-flow' && (
        <BrokerSmartFlowTracker
          defaultTimeframe={radarDays || 30}
          onSelectStock={(stk) => {
            if (stk?.symbol) {
              setSelectedStockSymbol(stk.symbol);
              setActiveTab('diagnostic');
            }
            onSelectStock?.(stk);
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: PORTFOLIO & WATCHLIST 30-DAY BROKER SHIELD                    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'portfolio-shield' && (
        <PortfolioBrokerShield
          defaultTimeframe={radarDays || 30}
          onSelectStock={(stk) => {
            if (stk?.symbol) {
              setSelectedStockSymbol(stk.symbol);
              setActiveTab('diagnostic');
            }
            onSelectStock?.(stk);
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: LIVE RADAR & SCANNER                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'radar' && (
        <div className="space-y-4">
          {/* ── STEP 4: VERIFY SMART MONEY BROKER FLOW HUD ── */}
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-3.5 sm:p-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black text-xs tracking-wider">
                  STEP 4
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Verify "Smart Money" Broker Flow
                  </h2>
                  <p className="text-xs text-slate-400">
                    Rule-based audit: Identify block cornering &gt;40% and eliminate retail distribution dump traps.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  🟢 {stats.step4AccumulationCount} Accumulating (&gt;40%)
                </span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  🚨 {stats.step4TrapCount} Distribution Alerts
                </span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Circuit: ±15%
                </span>
                <button
                  onClick={() => setShowBcr3Guide(!showBcr3Guide)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                >
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{showBcr3Guide ? 'Hide Guide' : 'How BCR3 Works'}</span>
                  {showBcr3Guide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Collapsible BCR3 & Rules Guide */}
            {showBcr3Guide && (
              <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 flex items-start gap-2.5">
                    <span className="text-xl shrink-0">🟢</span>
                    <div>
                      <div className="font-extrabold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                        1. Institutional Accumulation (&gt;40% Buy Share)
                      </div>
                      <div className="text-slate-300 mt-1 leading-relaxed">
                        Top 3 brokers account for <strong>&gt;40% of all buy volume</strong> in concentrated blocks, while selling is distributed across dozens of retail brokers.
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-950/25 border border-rose-500/30 flex items-start gap-2.5">
                    <span className="text-xl shrink-0">🚨</span>
                    <div>
                      <div className="font-extrabold text-rose-300 uppercase tracking-wide flex items-center gap-1.5">
                        2. Distribution Trap Warning (Do Not Buy)
                      </div>
                      <div className="text-slate-300 mt-1 leading-relaxed">
                        If top brokers are <strong>net selling (dumping or offloading)</strong>, <strong>DO NOT BUY</strong>, even if the chart looks green or seeking circuit. High risk of supply dump!
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400">
                  <span className="font-black text-slate-200 mr-1">📊 How BCR3% Works:</span>
                  BCR3 = Top 3 broker buy volume ÷ total market buy volume. <span className="text-emerald-400 font-bold">≥ 40% = Institutional Accumulation</span> (smart money is cornering). <span className="text-rose-400 font-bold">Trap = BCR3 sell ≥ 38% with dumping</span>. BCR3 updates from real floorsheet data.
                </div>
              </div>
            )}
          </div>

          {/* ── UNIFIED SECTOR COMMAND HUB: ROTATION + ALPHA CHAMPIONS ── */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 shadow-xl space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black shadow-inner">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
                      Sector Alpha Radar: #1 Smart Money Pick Per Sector
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      🟢 {sectorChampions.filter(c => c.confidenceTier === 'GRADE_A_CONFIRMED').length} Confirmed (4/4)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                      🟡 {sectorChampions.filter(c => c.confidenceTier === 'GRADE_B_EMERGING').length} Emerging (3/4)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cornering Confluence: Flat Price (-1.2% to +2.0%) + BCR₃ &gt;40% (Net &gt;70%) + Money Flow Lead + Streak/VDU with Trap Veto.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setStep4Filter(step4Filter === 'SECTOR_LEADERS' ? 'ALL' : 'SECTOR_LEADERS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    step4Filter === 'SECTOR_LEADERS'
                      ? 'bg-amber-400 text-slate-950 font-black shadow ring-2 ring-amber-300'
                      : 'bg-slate-800 hover:bg-slate-750 text-amber-300 hover:text-white border border-amber-500/30'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  {step4Filter === 'SECTOR_LEADERS' ? 'Reset Table (Show All)' : 'Show Champions in Table'}
                </button>
              </div>
            </div>

            {/* Sector Rotation Filter Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sector Flow Filter:</span>
                </div>
                {selectedSector !== 'ALL' && (
                  <button
                    onClick={() => setSelectedSector('ALL')}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition"
                  >
                    ✕ Show All Sectors
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedSector('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                    selectedSector === 'ALL'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  All Sectors ({analyzedStocks.length})
                </button>
                {sectorFlowStats.map((sec) => (
                  <button
                    key={sec.sector}
                    onClick={() => setSelectedSector(selectedSector === sec.sector ? 'ALL' : sec.sector)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                      selectedSector === sec.sector
                        ? 'bg-slate-200 text-slate-950 border border-white shadow'
                        : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span>{sec.sector}</span>
                    {sec.accumulatingCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                        🟢 {sec.accumulatingCount}
                      </span>
                    )}
                    {sec.trapCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">
                        🚨 {sec.trapCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector Champions Cards Grid */}
            {displayedSectorChampions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
                {displayedSectorChampions.map((champ) => {
                  const isConfirmed = champ.confidenceTier === 'GRADE_A_CONFIRMED';
                  const isEmerging = champ.confidenceTier === 'GRADE_B_EMERGING';

                  return (
                    <div
                      key={champ.sector}
                      onClick={() => {
                        if (champ.stock) handleStockPress(champ.stock);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                        isConfirmed
                          ? 'bg-gradient-to-b from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/50 hover:border-emerald-400 shadow-md shadow-emerald-950/30'
                          : isEmerging
                          ? 'bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 border-amber-500/40 hover:border-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-80'
                      }`}
                    >
                      <div>
                        {/* Header: Sector Name & Confidence Badge */}
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800/70">
                          <span className="text-[11px] font-extrabold text-slate-300 truncate max-w-[130px]" title={champ.sector}>
                            {champ.sector}
                          </span>
                          <span
                            className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-black border ${
                              isConfirmed
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : isEmerging
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {champ.confidenceLabel}
                          </span>
                        </div>

                        {/* Symbol & Price */}
                        <div className="flex items-baseline justify-between mt-2">
                          <div>
                            <div className="text-base font-black text-white group-hover:text-amber-300 flex items-center gap-1.5 transition">
                              {champ.symbol}
                              {isConfirmed && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                              {champ.companyName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black text-white">
                              Rs. {champ.ltp?.toLocaleString()}
                            </div>
                            <span
                              className={`inline-block text-[10.5px] font-bold px-1 py-0.2 rounded mt-0.5 ${
                                champ.pChange >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                              }`}
                            >
                              {champ.pChange >= 0 ? '+' : ''}
                              {champ.pChange?.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* 4-Factor Confluence Telemetry Indicators */}
                        <div className="grid grid-cols-4 gap-1 mt-2 p-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-center text-[10px]">
                          <div>
                            <div className="text-[8.5px] text-slate-400">Score</div>
                            <div className={`font-black mt-0.5 ${isConfirmed ? 'text-emerald-400' : isEmerging ? 'text-amber-400' : 'text-slate-400'}`}>
                              {champ.corneringScore}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">BCR₃ Buy</div>
                            <div className="font-bold text-slate-200 mt-0.5">
                              {champ.bcr3Buy > 0 ? `${champ.bcr3Buy}%` : 'Low'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">CMF</div>
                            <div className={`font-bold mt-0.5 ${champ.cmf > 0.05 ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {champ.cmf > 0 ? '+' : ''}{champ.cmf.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">Ticket</div>
                            <div className="font-bold text-slate-200 mt-0.5">
                              {champ.tradeSizeRatio.toFixed(1)}x
                            </div>
                          </div>
                        </div>

                        {/* Confluence Checkmark Strip */}
                        <div className="flex items-center justify-between text-[9px] mt-1.5 px-0.5 text-slate-400">
                          <span className={champ.criteriaDetails.priceFlat ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.priceFlat ? '✓ Flat Price' : '✕ Price Out'}
                          </span>
                          <span className={champ.criteriaDetails.brokerConcentration ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.brokerConcentration ? '✓ BCR3>40%' : '✕ Concentration'}
                          </span>
                          <span className={champ.criteriaDetails.moneyFlowLead ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.moneyFlowLead ? '✓ Money Flow' : '✕ Flow'}
                          </span>
                          <span className={champ.criteriaDetails.streakOrVdu ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.streakOrVdu ? '✓ Streak/VDU' : '✕ Streak'}
                          </span>
                        </div>
                      </div>

                      {/* Footer: Top Buyer broker & Action Pill */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
                        <span className="truncate max-w-[130px]">
                          Top: <strong className="text-slate-300">{champ.topBuyers}</strong>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStockSymbol(champ.symbol);
                              setActiveTab('diagnostic');
                            }}
                            className="px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-white border border-blue-500/40 font-bold text-[9.5px] transition cursor-pointer"
                            title="Inspect full Broker Accumulation vs Distribution Ledger"
                          >
                            Broker Flow →
                          </button>
                          <span className="text-[10px] text-emerald-400 font-extrabold group-hover:underline flex items-center gap-0.5">
                            Inspect ↗
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                <span className="text-xs text-slate-400">
                  🛡️ No active Grade A/B Smart Money cornering setups found in this sector.
                </span>
              </div>
            )}

            {/* Collapsible toggle for neutral / retail equilibrium sectors */}
            {neutralSectorChampions.length > 0 && selectedSector === 'ALL' && (
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={() => setShowAllSectorChamps(!showAllSectorChamps)}
                  className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition py-1.5 px-3 rounded-lg bg-slate-900/90 hover:bg-slate-850 border border-slate-800"
                >
                  <span>{showAllSectorChamps ? '▲ Hide Neutral Sectors' : `▼ View ${neutralSectorChampions.length} Other Sectors (Retail Equilibrium)`}</span>
                  {showAllSectorChamps ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[11px] text-slate-500">
                  {neutralSectorChampions.length} sectors in broad retail balance (0 confluence pts)
                </span>
              </div>
            )}

            {showAllSectorChamps && neutralSectorChampions.length > 0 && selectedSector === 'ALL' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
                {neutralSectorChampions.map((champ) => {
                  return (
                    <div
                      key={champ.sector}
                      onClick={() => {
                        if (champ.stock) handleStockPress(champ.stock);
                      }}
                      className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/60 hover:border-slate-700 opacity-80 transition-all cursor-pointer relative group flex flex-col justify-between"
                    >
                      <div>
                        {/* Header: Sector Name & Confidence Badge */}
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800/70">
                          <span className="text-[11px] font-extrabold text-slate-300 truncate max-w-[130px]" title={champ.sector}>
                            {champ.sector}
                          </span>
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded-full font-black border bg-slate-800 text-slate-400 border-slate-700">
                            {champ.confidenceLabel}
                          </span>
                        </div>

                        {/* Symbol & Price */}
                        <div className="flex items-baseline justify-between mt-2">
                          <div>
                            <div className="text-base font-black text-white group-hover:text-amber-300 flex items-center gap-1.5 transition">
                              {champ.symbol}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                              {champ.companyName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black text-white">
                              Rs. {champ.ltp?.toLocaleString()}
                            </div>
                            <span
                              className={`inline-block text-[10.5px] font-bold px-1 py-0.2 rounded mt-0.5 ${
                                champ.pChange >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                              }`}
                            >
                              {champ.pChange >= 0 ? '+' : ''}
                              {champ.pChange?.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* 4-Factor Confluence Telemetry Indicators */}
                        <div className="grid grid-cols-4 gap-1 mt-2 p-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-center text-[10px]">
                          <div>
                            <div className="text-[8.5px] text-slate-400">Score</div>
                            <div className="font-black mt-0.5 text-slate-400">
                              {champ.corneringScore}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">BCR₃ Buy</div>
                            <div className="font-bold text-slate-200 mt-0.5">
                              {champ.bcr3Buy > 0 ? `${champ.bcr3Buy}%` : 'Low'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">CMF</div>
                            <div className={`font-bold mt-0.5 ${champ.cmf > 0.05 ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {champ.cmf > 0 ? '+' : ''}{champ.cmf.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8.5px] text-slate-400">Ticket</div>
                            <div className="font-bold text-slate-200 mt-0.5">
                              {champ.tradeSizeRatio.toFixed(1)}x
                            </div>
                          </div>
                        </div>

                        {/* Confluence Checkmark Strip */}
                        <div className="flex items-center justify-between text-[9px] mt-1.5 px-0.5 text-slate-400">
                          <span className={champ.criteriaDetails.priceFlat ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.priceFlat ? '✓ Flat Price' : '✕ Price Out'}
                          </span>
                          <span className={champ.criteriaDetails.brokerConcentration ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.brokerConcentration ? '✓ BCR3>40%' : '✕ Concentration'}
                          </span>
                          <span className={champ.criteriaDetails.moneyFlowLead ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.moneyFlowLead ? '✓ Money Flow' : '✕ Flow'}
                          </span>
                          <span className={champ.criteriaDetails.streakOrVdu ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {champ.criteriaDetails.streakOrVdu ? '✓ Streak/VDU' : '✕ Streak'}
                          </span>
                        </div>
                      </div>

                      {/* Footer: Top Buyer broker & Action Pill */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
                        <span className="truncate max-w-[130px]">
                          Top: <strong className="text-slate-300">{champ.topBuyers}</strong>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStockSymbol(champ.symbol);
                              setActiveTab('diagnostic');
                            }}
                            className="px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-white border border-blue-500/40 font-bold text-[9.5px] transition cursor-pointer"
                            title="Inspect full Broker Accumulation vs Distribution Ledger"
                          >
                            Broker Flow →
                          </button>
                          <span className="text-[10px] text-emerald-400 font-extrabold group-hover:underline flex items-center gap-0.5">
                            Inspect ↗
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Controls: Search, Stage Filter, Step 4 Filter, Sort */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol, company or sector (e.g. NABIL, HIDCL, Finance)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Stage Filter Buttons (Unified with Top Summary Cards & Dynamic Timeframe Counts) */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: 'ALL', label: `All (${analyzedStocks.length})` },
                { id: 'STEALTH', label: `🟢 Stealth (${stats.stealthCount})` },
                { id: 'PUMP', label: `🚀 Markup (${stats.pumpCount})` },
                { id: 'DISTRIBUTION', label: `⚠️ Distribution (${stats.distributionCount})` },
                { id: 'TRAP', label: `🔴 Trap (${stats.dumpCount})` },
                { id: 'SPRING', label: `⚡ Spring (${stats.springCount || 0})` }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handleStageTabClick(btn.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedStage === btn.id
                      ? 'bg-slate-700 text-white font-bold border border-slate-600 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800/80'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Step 4 Smart Money Filter Buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto scrollbar-none max-w-full">
              <span className="text-[11px] font-bold text-slate-400 px-1 whitespace-nowrap">Filter:</span>
              <button
                onClick={() => setStep4Filter('ALL')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${step4Filter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All
              </button>
              <button
                onClick={() => setStep4Filter(step4Filter === 'SECTOR_LEADERS' ? 'ALL' : 'SECTOR_LEADERS')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${
                  step4Filter === 'SECTOR_LEADERS'
                    ? 'bg-amber-400 text-slate-950 font-black shadow ring-1 ring-amber-300'
                    : 'text-amber-300 hover:bg-slate-800 border border-amber-500/30 bg-amber-500/10'
                }`}
                title="Filter table to show only the #1 Best Accumulation stock in each sector"
              >
                <Crown className="w-3 h-3 text-amber-400" />
                👑 Top 1 Per Sector ({sectorChampions.filter(c => c.confidenceTier !== 'GRADE_C_NEUTRAL').length}/{sectorChampions.length})
              </button>
              <button
                onClick={() => setStep4Filter('DAY1_STEALTH')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'DAY1_STEALTH' ? 'bg-amber-500 text-slate-950 font-black shadow' : 'text-amber-400 hover:bg-slate-800'}`}
              >
                🎯 Day 1 Stealth ({stats.day1StealthCount})
              </button>
              <button
                onClick={() => setStep4Filter('DAY2_PRIME')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'DAY2_PRIME' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-amber-300 hover:bg-slate-800'}`}
              >
                🔥 Day 2 Prime ({stats.day2PrimeCount})
              </button>
              <button
                onClick={() => setStep4Filter('VDU_COIL')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'VDU_COIL' ? 'bg-cyan-500 text-slate-950 font-black shadow' : 'text-cyan-400 hover:bg-slate-800'}`}
              >
                ⏳ VDU Coil ({stats.vduCount})
              </button>
              <button
                onClick={() => setStep4Filter('CHURN_TRAP')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'CHURN_TRAP' ? 'bg-amber-600 text-white shadow' : 'text-amber-400 hover:bg-slate-800'}`}
              >
                ⚖️ Churn Trap ({stats.churnCount})
              </button>
              <button
                onClick={() => setStep4Filter('ACCUMULATION')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'ACCUMULATION' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-400 hover:bg-slate-800'}`}
              >
                🟢 &gt;40% ({stats.step4AccumulationCount})
              </button>
              <button
                onClick={() => setStep4Filter('TRAP')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap ${step4Filter === 'TRAP' ? 'bg-rose-600 text-white shadow' : 'text-rose-400 hover:bg-slate-800'}`}
              >
                🚨 Trap ({stats.step4TrapCount})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="qai">🎯 Quiet Accumulation (QAI Score)</option>
                <option value="stealth">Highest Stealth Score</option>
                <option value="dumpRisk">Highest Dump/Trap Risk</option>
                <option value="pChange">% Change</option>
                <option value="turnover">Daily Turnover</option>
                <option value="cmf">Chaikin Money Flow (CMF)</option>
              </select>
            </div>

            {/* View Mode Toggle (Table vs Cards) */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  viewMode === 'table' ? 'bg-emerald-500 text-slate-950 shadow font-black' : 'text-slate-400 hover:text-white'
                }`}
                title="Full spreadsheet table view"
              >
                📊 Table
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                  viewMode === 'cards' ? 'bg-emerald-500 text-slate-950 shadow font-black' : 'text-slate-400 hover:text-white'
                }`}
                title="Mobile cards view (no horizontal swipe required)"
              >
                🗂️ Cards
              </button>
            </div>
          </div>

          {/* Results: Table or Cards View */}
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredStocks.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 bg-slate-900/60 rounded-xl border border-slate-800">
                  {loading ? 'Analyzing live floor sheet and candles...' : 'No stocks matching the selected criteria.'}
                </div>
              ) : (
                filteredStocks.slice(0, 50).map((stock) => (
                  <StockRadarCard
                    key={stock.symbol}
                    stock={stock}
                    onPress={handleStockPress}
                    onInspectFlow={(sym) => {
                      setSelectedStockSymbol(sym);
                      setActiveTab('diagnostic');
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-lg">
              <div
                className="overflow-x-auto"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-x pan-y',
                  willChange: 'scroll-position',
                  transform: 'translateZ(0)',
                  contain: 'paint'
                }}
              >
                <table className="w-full text-left text-xs border-collapse min-w-[780px]">
                  <thead>
                    <tr className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                      <th className="py-2.5 px-3 sticky left-0 z-20 bg-slate-950 border-r-2 border-slate-700/80">Symbol / Company</th>
                      <th className="py-2.5 px-3 text-right">LTP (Rs.)</th>
                      <th className="py-2.5 px-3 text-right">Change</th>
                      <th className="py-2.5 px-3">Wyckoff Stage</th>
                      <th className="py-2.5 px-3">Step 4 Smart Money Flow</th>
                      <th className="py-2.5 px-3 text-right">CMF (20)</th>
                      <th className="py-2.5 px-3 text-right">BCR3 / BCR5 Buy %</th>
                      <th className="py-2.5 px-3 text-right">Ticket Ratio</th>
                      <th className="py-2.5 px-3 text-center">Dump Risk</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredStocks.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          {loading ? 'Analyzing live floor sheet and candles...' : 'No stocks matching the selected criteria.'}
                        </td>
                      </tr>
                    ) : (
                      filteredStocks.slice(0, 50).map((stock) => (
                        <StockTableRow
                          key={stock.symbol}
                          stock={stock}
                          onPress={handleStockPress}
                          onInspectFlow={(sym) => {
                            setSelectedStockSymbol(sym);
                            setActiveTab('diagnostic');
                          }}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Showing up to 50 active stocks analyzed against live floor sheet and multi-day price-volume history.</span>
                <span className="font-semibold text-slate-300">Tap row for complete Wyckoff audit</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB: DAILY TOP 5 WHALE ARCHIVE & CONSECUTIVE ALERT TRACKER          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'archive' && (
        <div className="space-y-3 sm:space-y-5">
          {/* Header Card & Date Selector */}
          <div className="rounded-xl sm:rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-2.5 sm:p-5 shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-black text-xs uppercase tracking-wider">
                    DAILY AUDITED ARCHIVE
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-semibold">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Preserved Sessions: {whaleArchive.length}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white mt-1.5 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  Daily Top 5 Whale Archive &amp; Consecutive Alert Tracker
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  दैनिक ह्वेल रेकर्ड: Track which stocks were slowly accumulated or dumped on specific dates, monitor consecutive absorption days (Day 2 Prime Entry), and observe subsequent price performance.
                </p>
              </div>

              {/* Date Selector Pills & Backup Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400">Trading Session:</span>
                {whaleArchive.map((snap: any) => (
                  <button
                    key={snap.date}
                    onClick={() => setSelectedArchiveDate(snap.date)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border ${
                      (selectedArchiveDate || whaleArchive[0]?.date) === snap.date
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    📅 {snap.date}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const dataset = (analyzedStocks.length > 0) ? analyzedStocks : stocks;
                    if (dataset.length > 0) {
                      captureDailyWhaleSnapshot(dataset, floorsheet);
                      setWhaleArchive(getStoredWhaleArchive());
                    }
                  }}
                  title="Force Capture Fresh Snapshot for Current Session"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 transition-all"
                >
                  <RefreshCw className="w-3 h-3 text-emerald-400" /> Refresh
                </button>

                <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

                <button
                  onClick={handleExportBackup}
                  title="Export 30-Day Whale Archive as JSON"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Export JSON
                </button>

                <label
                  title="Restore Whale Archive from Backup JSON"
                  className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-400" /> Restore
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Strategy Playbook Alert Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs">
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                <div className="font-extrabold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  1. The 2-Day Slow Accumulation Strategy (Entry Playbook)
                </div>
                <div className="text-slate-300 mt-1.5 leading-relaxed space-y-1">
                  <div>• <strong>Day 1:</strong> Whales begin quiet absorption. Price is tight (-1.5% to +2.5%). Add to watchlist.</div>
                  <div>• <strong>Day 2 (Prime Entry):</strong> Look for the <span className="text-emerald-300 font-bold">🔥 Day 2 Multi-Session Absorption</span> badge. Enter near the 20-EMA base with stop loss at -4%.</div>
                  <div>• <strong>Wyckoff Pause Day:</strong> When volume drops to ≤75% of prior accumulation session with flat price, that is an authentic supply test. Buy the quiet dip before markup!</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30">
                <div className="font-extrabold text-rose-300 uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  2. The 2–3 Day Pre-Dump Warning Strategy (Exit Playbook)
                </div>
                <div className="text-slate-300 mt-1.5 leading-relaxed space-y-1">
                  <div>• <strong>Day 1 Distribution:</strong> Whales offload into retail hype. Look for <span className="text-rose-300 font-bold">⚠️ Pre-Dump Window: 2–3 Days</span>.</div>
                  <div>• <strong>Exit Window:</strong> Trim 50% immediately, and sell remainder on next morning&apos;s tick. Do not wait for the negative circuit!</div>
                  <div>• <strong>T+2 Protection:</strong> Never buy a stock flagged in distribution — you will be trapped during settlement.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Top 5 Slow Unusual Accumulation Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Crosshair className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    Top 5 Slow Unusual Accumulation Stocks
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                      Session: {currentSnapshot?.date || 'Live'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Scrips with quiet price movements, high buyer concentration, and multi-session broker absorption.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {performanceTrack.accumulationTrack && performanceTrack.accumulationTrack.length > 0 ? (
                performanceTrack.accumulationTrack.map((stock: any, idx: number) => {
                  const isDay2 = stock.consecutiveDays === 2;
                  const isMultiDay = stock.consecutiveDays >= 3;
                  const isPause = stock.alertType === 'PAUSE_DAY_DIP';

                  return (
                    <div
                      key={stock.symbol}
                      onClick={() => handleStockPress(stock)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer hover:border-emerald-500/70 hover:shadow-lg hover:shadow-emerald-950/40 active:scale-[0.99] ${
                        isDay2
                          ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/60 shadow-lg shadow-emerald-950/40'
                          : isMultiDay
                          ? 'bg-slate-900/90 border-blue-500/40'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center border border-slate-700">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-white">{stock.symbol}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                                {stock.sector}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded font-black ${
                                stock.pChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {stock.pChange >= 0 ? '+' : ''}{stock.pChange?.toFixed(2)}%
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-sm">{stock.companyName}</div>
                          </div>
                        </div>

                        {/* Consecutive Badge Callout */}
                        <div className="flex items-center gap-2">
                          {stock.qaiScore ? (
                            <span className="px-2 py-1 rounded-md text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              🎯 QAI: {stock.qaiScore}
                            </span>
                          ) : null}
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide flex items-center gap-1.5 border ${
                            isDay2
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 border-emerald-300 shadow-md shadow-emerald-500/20 animate-pulse'
                              : isMultiDay
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : isPause
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {stock.signalBadge}
                          </span>
                        </div>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium">Flagged LTP / Current</div>
                          <div className="font-extrabold text-white text-sm mt-0.5">
                            Rs. {stock.entryPrice?.toLocaleString()}
                            {stock.currentLtp !== stock.entryPrice && (
                              <span className="text-xs font-normal text-slate-400 ml-1.5">
                                → Rs. {stock.currentLtp?.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {stock.returnPct !== 0 && (
                            <div className={`text-[11px] font-bold mt-0.5 flex items-center gap-0.5 ${
                              stock.returnPct > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {stock.returnPct > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {stock.returnPct > 0 ? '+' : ''}{stock.returnPct}% since flagged
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                            <span>Top 3 Buyer Share (BCR3)</span>
                            {stock.top3NetAbsorptionRatio !== undefined && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold border border-emerald-500/20" title="Aggregate Top 3 Buyer Net Absorption Ratio">
                                Net: {(stock.top3NetAbsorptionRatio * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          <div className="font-extrabold text-emerald-400 text-sm mt-0.5">
                            {stock.bcr3Buy > 0 ? `${stock.bcr3Buy}%` : 'High Market Share'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            Buyers: {stock.topBuyers}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium">Session Turnover &amp; Float</div>
                          <div className="font-extrabold text-white text-sm mt-0.5">
                            Rs. {(stock.turnover / 1e7).toFixed(2)} Cr
                          </div>
                          <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                            {stock.floatAbsorptionPct || stock.floatTurnoverPct ? `${(stock.floatAbsorptionPct || stock.floatTurnoverPct)}% Float` : `${stock.volume?.toLocaleString()} sh`}
                            {stock.asymmetryRatio ? ` • ${stock.asymmetryRatio}x Asym` : ''}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] text-slate-400 font-medium">Smart Money Bias</div>
                            <div className="font-extrabold text-emerald-300 text-xs mt-0.5">
                              {stock.smartMoneyBias || 'Institutional Cornering'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStockPress(stock);
                              }}
                              className="flex-1 px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black transition-all text-center shadow-sm"
                            >
                              Stock Info ↗
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStockSymbol(stock.symbol);
                                setActiveTab('diagnostic');
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all text-center border border-slate-700"
                              title="Inspect Broker Ledger"
                            >
                              Ledger →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 sm:p-6 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                  No slow accumulation stocks recorded for this session date yet.
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Top 5 Unusual Distribution (Pre-Dump Warning) Cards */}
          <div className="space-y-3 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    Top 5 Unusual Distribution Stocks (Pre-Dump Warning)
                    <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
                      Session: {currentSnapshot?.date || 'Live'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Scrips where top broker desks are aggressively dumping shares into retail orders before price markdown.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {performanceTrack.distributionTrack && performanceTrack.distributionTrack.length > 0 ? (
                performanceTrack.distributionTrack.map((stock: any, idx: number) => {
                  const isConsecutiveDist = stock.distributionDay >= 2;

                  return (
                    <div
                      key={stock.symbol}
                      onClick={() => handleStockPress(stock)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer hover:border-rose-500/70 hover:shadow-lg hover:shadow-rose-950/40 active:scale-[0.99] ${
                        isConsecutiveDist
                          ? 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/60 shadow-lg shadow-rose-950/40'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center border border-slate-700">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-white">{stock.symbol}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                                {stock.sector}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded font-black ${
                                stock.pChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {stock.pChange >= 0 ? '+' : ''}{stock.pChange?.toFixed(2)}%
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-sm">{stock.companyName}</div>
                          </div>
                        </div>

                        {/* Distribution Warning Badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {stock.isUpperShadowDump && (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-black tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⚡ Failed Pump ({stock.upperShadowPct}% Upper Wick)
                            </span>
                          )}
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide flex items-center gap-1.5 border ${
                            isConsecutiveDist
                              ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 animate-pulse'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
                            {stock.signalBadge}
                          </span>
                        </div>
                      </div>

                      {/* Exit Advice Box */}
                      <div className="mt-2.5 p-2 rounded-lg bg-rose-950/30 border border-rose-500/25 text-xs text-rose-200 flex items-center gap-2">
                        <span className="text-sm">⚠️</span>
                        <span><strong>Exit Guidance:</strong> {stock.exitWindowNote}</span>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium">Flagged LTP / Current</div>
                          <div className="font-extrabold text-white text-sm mt-0.5">
                            Rs. {stock.flaggedPrice?.toLocaleString()}
                            {stock.currentLtp !== stock.flaggedPrice && (
                              <span className="text-xs font-normal text-slate-400 ml-1.5">
                                → Rs. {stock.currentLtp?.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {stock.dropPct !== 0 && (
                            <div className={`text-[11px] font-bold mt-0.5 flex items-center gap-0.5 ${
                              stock.dropPct > 0 ? 'text-amber-400' : 'text-slate-400'
                            }`}>
                              {stock.dropPct > 0 ? '✓ Avoided ' : 'Price move: '}
                              {stock.dropPct > 0 ? `-${stock.dropPct}% drop` : `+${Math.abs(stock.dropPct)}%`}
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium">Top 3 Seller Share (BCR3 Sell)</div>
                          <div className="font-extrabold text-rose-400 text-sm mt-0.5">
                            {stock.bcr3Sell > 0 ? `${stock.bcr3Sell}%` : 'High Sell Concentration'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            Sellers: {stock.topSellers}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <div className="text-[11px] text-slate-400 font-medium">Session Turnover &amp; Float</div>
                          <div className="font-extrabold text-white text-sm mt-0.5">
                            Rs. {(stock.turnover / 1e7).toFixed(2)} Cr
                          </div>
                          <div className="text-[11px] text-rose-400 font-semibold mt-0.5">
                            {stock.floatTurnoverPct ? `${stock.floatTurnoverPct}% of Float` : `${stock.volume?.toLocaleString()} sh`}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
                          <div>
                            <div className="text-[11px] text-slate-400 font-medium">Smart Money Bias</div>
                            <div className="font-extrabold text-rose-300 text-xs mt-0.5">
                              {stock.smartMoneyBias || 'Operator Offloading'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStockPress(stock);
                              }}
                              className="flex-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black transition-all text-center shadow-sm"
                            >
                              Stock Info ↗
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStockSymbol(stock.symbol);
                                setActiveTab('diagnostic');
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-all text-center border border-slate-700"
                              title="Inspect Sell Depth"
                            >
                              Depth →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 sm:p-6 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                  No unusual distribution traps recorded for this session date.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DEEP STOCK DIAGNOSTIC                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'diagnostic' && activeStock && (
        <div className="space-y-3 sm:space-y-4">
          {/* ── DYNAMIC INVESTIGATION SCOPE BANNER & TIMEFRAME SELECTOR ── */}
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 text-lg shrink-0">
                  🔍
                </span>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2 flex-wrap">
                    {diagnosticDays === 1 ? (
                      <span>
                        Investigation Scope: <strong className="text-emerald-400">Latest Trading Session ({radarDate || 'Latest'})</strong> — Intraday Microstructure
                      </span>
                    ) : (
                      <span>
                        Investigation Scope: <strong className="text-cyan-400">Cumulative Multi-Day Analysis (Last {diagnosticDays} Trading Sessions)</strong> — Institutional Trend &amp; Absorption
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {diagnosticDays === 1 ? '1-Day Floorsheet' : `${diagnosticDays}-Day Cumulative`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {diagnosticDays === 1
                      ? 'Single-session analysis: Computes Seller Concentration (SCR₃), Smart Money Net Flow, and Broker Absorption strictly from the latest trading day.'
                      : `Multi-session synthesis: Aggregates cumulative broker net buying/selling volumes, multi-day VWAP deviation, and multi-session absorption consistency over ${diagnosticDays} trading days.`}
                  </div>
                </div>
              </div>

              {/* Timeframe Selector Horizon Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 self-start sm:self-auto shrink-0">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-1">Horizon:</span>
                {[
                  { label: '1D', days: 1, title: 'Single-Session Intraday Floorsheet' },
                  { label: '5D', days: 5, title: '5-Day Cumulative Broker Flow' },
                  { label: '15D', days: 15, title: '15-Day Institutional Trend' },
                  { label: '30D', days: 30, title: '30-Day Position Cornering' },
                ].map((pill) => (
                  <button
                    key={pill.days}
                    type="button"
                    title={pill.title}
                    disabled={diagnosticLoading}
                    onClick={() => handleDiagnosticDaysChange(pill.days)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      diagnosticDays === pill.days
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
                {diagnosticLoading && (
                  <span className="text-[10px] text-emerald-400 font-bold px-1.5 animate-pulse">
                    Loading...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── REAL HISTORICAL DATA WINDOW GUARANTEE BADGE (DIAGNOSTIC) ── */}
          <div className={`p-2.5 sm:px-4 sm:py-2 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs transition-all ${
            diagnosticDays > loadedTradingDays
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${diagnosticDays > loadedTradingDays ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              {diagnosticDays > loadedTradingDays ? (
                <span>
                  <strong>Showing {loadedTradingDays} Real Trading Days Loaded</strong>{' '}
                  <span className="text-amber-400/80">
                    ({isBackfilling ? `Historical backfill in progress: ${loadedTradingDays}/${diagnosticDays} days` : `All ${loadedTradingDays} verified historical sessions aggregated`})
                  </span>
                </span>
              ) : (
                <span>
                  <strong>{diagnosticDays === 1 ? '1 Session' : `${diagnosticDays} Trading Days`} Verified Real NEPSE Floorsheet Data</strong>{' '}
                  <span className="text-slate-400 text-[11px]">({loadedTradingDays} total authentic sessions in SQLite)</span>
                </span>
              )}
            </div>
            <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded ${
              diagnosticDays > loadedTradingDays ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'
            }`}>
              100% Real Records (Zero Mock Data)
            </span>
          </div>

          {/* Stock Selector Search Bar */}
          <div className="p-2.5 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Inspecting Stock:</span>
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  placeholder="Switch Symbol (e.g. NABIL, SHIVM)..."
                  value={selectedStockSymbol}
                  onChange={(e) => setSelectedStockSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-extrabold focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSelectStock && (
                <button
                  onClick={() => onSelectStock(activeStock)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Open Full Stock Modal
                </button>
              )}
              {onAskGuruAi && (
                <button
                  onClick={() => onAskGuruAi(activeStock)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-slate-950 transition-opacity"
                >
                  Ask Guru AI About {activeStock.symbol}
                </button>
              )}
            </div>
          </div>

          {/* Wyckoff Phase Hero Card */}
          <div className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black text-white">{activeStock.symbol}</h2>
                  <span className="text-xs text-slate-400 font-medium">{activeStock.companyName}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-lg font-bold text-white">Rs. {activeStock.ltp?.toLocaleString()}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      (activeStock.pChange || 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                    }`}
                  >
                    {(activeStock.pChange || 0) >= 0 ? '+' : ''}
                    {activeStock.pChange?.toFixed(2)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    Volume: {Number(activeStock.volume || 0).toLocaleString()} kitta
                  </span>
                </div>
              </div>

              {/* Wyckoff Stage Badge */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg border"
                  style={getStageBadgeStyle(activeStock.wyckoff.stage)}
                >
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Wyckoff Market Phase</div>
                  <div className="text-sm font-extrabold text-white">
                    {activeStock.wyckoff.stage.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-semibold text-emerald-400">
                    {activeStock.wyckoff.stageNameNepali}
                  </div>
                </div>
              </div>
            </div>

            {/* Actionable Guidance (Nepali & English) */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-2">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" /> Actionable Trader Guidance (रणनीतिक सल्लाह)
              </div>
              <div className="text-sm font-semibold text-slate-100">
                🇳🇵 {activeStock.wyckoff.actionableGuidanceNepali}
              </div>
              <div className="text-xs text-slate-400">
                🇬🇧 {activeStock.wyckoff.actionableGuidanceEnglish}
              </div>
            </div>

            {/* Multi-Session Institutional Whale Streak Banner */}
            {activeStock.whaleStreak && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <Flame className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-black text-amber-300">
                      Institutional Streak: {activeStock.whaleStreak.signalBadge}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Persistent broker accumulation across {activeStock.whaleStreak.consecutiveDays} trading sessions.
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black self-start sm:self-auto border ${
                  activeStock.whaleStreak.alertType === 'DAY_2_PRIME'
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow animate-pulse'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {activeStock.whaleStreak.alertType === 'DAY_2_PRIME' ? '🔥 Prime Entry Trigger' : 'Cornering Phase'}
                </span>
              </div>
            )}
            {activeStock.whaleDistStreak && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-black text-rose-300">
                      Distribution Warning: {activeStock.whaleDistStreak.signalBadge}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Brokers net offloading inventory over {activeStock.whaleDistStreak.consecutiveDays} consecutive sessions.
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 self-start sm:self-auto">
                  🚨 Exit / Avoid Buying
                </span>
              </div>
            )}

            {/* Triple Diagnostic Grid: Classical Math vs NEPSE Floor Sheet vs Early Detection */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
              {/* Box 1: Classical Mathematical Indicators */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  1. Mathematical Flow Models (Chaikin / Wyckoff)
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Chaikin Money Flow (CMF 20)</span>
                    <span
                      className={`font-black ${
                        activeStock.wyckoff.cmf > 0.05
                          ? 'text-emerald-400'
                          : activeStock.wyckoff.cmf < -0.05
                          ? 'text-red-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {activeStock.wyckoff.cmf > 0 ? '+' : ''}
                      {activeStock.wyckoff.cmf.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Chaikin ADL Divergence</span>
                    <span className="font-bold text-slate-200">
                      {activeStock.wyckoff.adlDivergence}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Stealth Accumulation Index</span>
                    <span className="font-black text-emerald-400">
                      {activeStock.wyckoff.stealthScore} / 100
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Quiet Accumulation Index (Day 1 QAI)</span>
                    <span className="font-black text-amber-400">
                      {activeStock.wyckoff.qaiScore || activeStock.wyckoff.stealthScore} / 100
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Volume Surge Ratio</span>
                    <span className="font-bold text-white">
                      {Number(activeStock.volumeSurgeRatio || activeStock.rvol || 1.0).toFixed(2)}x
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: NEPSE Microstructure & Floor Sheet Flow */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-blue-400" />
                    2. NEPSE Floor Sheet &amp; Broker Syndicates
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    [{diagnosticDays === 1 ? '1D Floorsheet' : `${diagnosticDays}D Cumulative`}]
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Top 3 Broker Buy Concentration (BCR₃)</span>
                    <span className="font-black text-blue-400">
                      {activeStock.brokerData?.bcr3BuyPct || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Top 3 Broker Sell Concentration (SCR₃)</span>
                    <span className={`font-black ${(activeStock.brokerData?.bcr3SellPct || 0) >= 40 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {activeStock.brokerData?.bcr3SellPct || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Top 5 Broker Buy Concentration (BCR₅)</span>
                    <span className="font-bold text-slate-200">
                      {activeStock.brokerData?.bcr5BuyPct || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Buyer vs Seller Asymmetry (BCR/SCR)</span>
                    <span className="font-bold text-emerald-400">
                      {activeStock.brokerData?.asymmetryRatio || 1.0}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Net Delivery Retention Ratio</span>
                    <span className="font-bold text-blue-400">
                      {((activeStock.brokerData?.netAbsorptionRatio || 1.0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Buyer-to-Seller Trade Size Ratio</span>
                    <span
                      className={`font-black ${
                        activeStock.wyckoff.tradeSizeRatio >= 1.5
                          ? 'text-emerald-400'
                          : activeStock.wyckoff.tradeSizeRatio <= 0.65
                          ? 'text-red-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {activeStock.wyckoff.tradeSizeRatio.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Smart Money Order Bias</span>
                    <span className="font-bold text-slate-200">
                      {activeStock.brokerData?.smartMoneyBias || 'Neutral'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Smart Money Net Inflow ({diagnosticDays}D)</span>
                    <span className={`font-bold ${(activeStock.brokerData?.netVolume || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(activeStock.brokerData?.netVolume || 0) >= 0 ? '+' : ''}
                      {(activeStock.brokerData?.netVolume || 0).toLocaleString()} kitta
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 3: Early Detection Telemetry (Wyckoff 3rd Law, VDU, OBV) */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  3. Early Detection Telemetry (Leading Microstructure)
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Wyckoff Effort (RVOL)</span>
                    <span className="font-black text-amber-300">
                      {activeStock.wyckoff?.earlySignals?.effortVsResult?.effortRatio?.toFixed(2) || '1.00'}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Effort vs Result Churn</span>
                    <span className={`font-black ${
                      activeStock.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'HIGH_DISTRIBUTION_CHURN'
                        ? 'text-rose-400'
                        : activeStock.wyckoff?.earlySignals?.effortVsResult?.churnRisk === 'ABSORPTION_FLOOR'
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                    }`}>
                      {activeStock.wyckoff?.earlySignals?.effortVsResult?.churnRisk?.replace(/_/g, ' ') || 'NORMAL'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Volume Dry-Up (Phase C Test)</span>
                    <span className={`font-bold ${
                      activeStock.wyckoff?.earlySignals?.volumeDryUp?.isVDU ? 'text-cyan-400' : 'text-slate-400'
                    }`}>
                      {activeStock.wyckoff?.earlySignals?.volumeDryUp?.isVDU
                        ? `Dry-Up (${activeStock.wyckoff.earlySignals.volumeDryUp.vduRatio}x)`
                        : 'Active Liquidity'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Leading OBV Divergence</span>
                    <span className={`font-bold ${
                      activeStock.wyckoff?.earlySignals?.leadingOBV?.signal === 'BULLISH_LEAD'
                        ? 'text-emerald-400'
                        : activeStock.wyckoff?.earlySignals?.leadingOBV?.signal === 'BEARISH_LEAD'
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}>
                      {activeStock.wyckoff?.earlySignals?.leadingOBV?.signal?.replace(/_/g, ' ') || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Upper Wick Supply Overhead</span>
                    <span className="font-bold text-slate-200">
                      {((activeStock.wyckoff?.earlySignals?.effortVsResult?.wickRatio || 0) * 100).toFixed(0)}% of range
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Early Signal Badge</span>
                    <span className="font-bold text-amber-300">
                      {activeStock.wyckoff?.earlySignals?.earlyBadge || 'Neutral Equilibrium'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── STEP 4: SMART MONEY BROKER FLOW AUDIT CARD ── */}
            {(() => {
              const isSampleValid = activeStock.brokerData?.status !== 'insufficient_sample' && (activeStock.brokerData?.totalBuyVolume || 0) >= 300;
              const bcr3Buy = isSampleValid ? (activeStock.brokerData?.bcr3BuyPct || 0) : 0;
              const bcr3Sell = isSampleValid ? (activeStock.brokerData?.bcr3SellPct || 0) : 0;
              const pChange = Number(activeStock.pChange || 0);
              const topSellers = activeStock.brokerData?.topSellerBrokers || activeStock.brokerData?.topSellers || [];
              const topBuyers = activeStock.brokerData?.topBuyerBrokers || activeStock.brokerData?.topBuyers || [];
              const hasSellingAsymmetry = bcr3Sell >= 45.0 && (bcr3Sell - bcr3Buy) >= 10.0;
              const topSellerNetDumping = isSampleValid && (
                topSellers.slice(0, 3).some((sel: any) => {
                  const buyOfSel = topBuyers.find((b: any) => b.broker === sel.broker)?.volume || 0;
                  return sel.volume > buyOfSel && (sel.volume - buyOfSel) > ((activeStock.brokerData?.totalSellVolume || 1) * 0.20);
                }) && (bcr3Sell > bcr3Buy)
              );
              const isSellerDominant = isSampleValid && (
                hasSellingAsymmetry ||
                topSellerNetDumping ||
                (activeStock.brokerData?.smartMoneyBias === 'Operator Offloading' && bcr3Sell > bcr3Buy)
              );
              const isDumping = Boolean(
                isSampleValid && (
                  isSellerDominant ||
                  (activeStock.brokerData?.adSignal === 'Distribution' && (Number(activeStock.brokerData?.adStrength || 0) >= 30 || Number(activeStock.brokerData?.adRatio || 0) <= -0.08) && bcr3Sell > bcr3Buy)
                )
              );
              const isTrap = isDumping && (pChange >= 0 || activeStock.wyckoff?.stage?.includes('PUMP'));
              const isAccumulation = isSampleValid && (bcr3Buy >= 40.0 || (activeStock.brokerData?.bcr5BuyPct >= 50.0 && bcr3Buy >= 36.0)) && (bcr3Buy > bcr3Sell) && !isDumping;

              return (
                <div className={`p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border shadow-xl space-y-4 ${
                  isTrap
                    ? 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40'
                    : isDumping
                    ? 'bg-gradient-to-r from-rose-950/30 via-slate-900 to-slate-950 border-rose-500/35'
                    : isAccumulation
                    ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/40'
                    : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`px-2.5 py-1 rounded-xl font-black text-xs tracking-wider border ${
                        isTrap || isDumping
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : isAccumulation
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        STEP 4 AUDIT
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-white flex items-center gap-2 flex-wrap">
                          <Shield className={`w-4 h-4 ${isTrap || isDumping ? 'text-rose-400' : isAccumulation ? 'text-emerald-400' : 'text-blue-400'}`} />
                          Smart Money Broker Flow Verification for {activeStock.symbol}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                            [{diagnosticDays === 1 ? '1D Floorsheet' : `${diagnosticDays}D Cumulative`}]
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Institutional block cornering (&gt;40% BCR₃) vs retail distribution dump traps.
                        </p>
                      </div>
                    </div>

                    <div>
                      {isTrap ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/25 text-rose-300 border border-rose-500/50 flex items-center gap-1.5 animate-pulse">
                          🚨 DISTRIBUTION TRAP: DO NOT BUY
                        </span>
                      ) : isDumping ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
                          🔴 INSTITUTIONAL OFFLOADING ({bcr3Sell}% SELL)
                        </span>
                      ) : isAccumulation ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5">
                          🟢 INSTITUTIONAL ACCUMULATION CONFIRMED
                        </span>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                          ⚪ BROAD RETAIL ORDER FLOW
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2 Key Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card 1: Top 3 Buy Volume Concentration */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-300">Top 3 Broker Buy Share (BCR₃)</span>
                        <span className={`font-black text-sm ${bcr3Buy >= 40.0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {bcr3Buy}% {bcr3Buy >= 40.0 ? '(Target Met ≥40%)' : '(Below 40%)'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${bcr3Buy >= 40.0 ? 'bg-emerald-500' : 'bg-slate-600'}`}
                          style={{ width: `${Math.min(100, bcr3Buy)}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="truncate max-w-[280px]">
                          Top 3 Buyers: {topBuyers.slice(0, 3).map((b: any) => `Broker #${b.broker} (${b.pct}%)`).join(', ') || 'No buyer data'}
                        </span>
                        <span className={bcr3Buy >= 40 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          Target: &gt;40%
                        </span>
                      </div>
                    </div>

                    {/* Card 2: Distribution Trap & Ticket Size Asymmetry */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-300">Ticket Size Asymmetry &amp; Net Offloading</span>
                        <span className={`font-black ${isTrap || isDumping ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {activeStock.wyckoff?.tradeSizeRatio?.toFixed(2) || 1.0}x Ticket Ratio
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 leading-relaxed">
                        {isTrap ? (
                          <span className="text-rose-300 font-bold">
                            ⚠️ Warning: Top institutional brokers are dumping {bcr3Sell}% sell share into retail excitement. Do not enter even if price is green today (+{pChange}%).
                          </span>
                        ) : isDumping ? (
                          <span className="text-rose-300 font-bold">
                            ⚠️ Warning: Top institutional brokers are offloading ({bcr3Sell}% sell share dominates flow). Fresh buy capital should NOT be deployed.
                          </span>
                        ) : isAccumulation ? (
                          <span className="text-emerald-300 font-semibold">
                            ✓ Institutions are absorbing large trade blocks ({activeStock.wyckoff?.tradeSizeRatio?.toFixed(2)}x ticket ratio) while selling is dispersed across retail brokers.
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Flow is retail dispersed without dominant cornering by the top 3 firms.
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Top 3 Sellers: {topSellers.slice(0, 3).map((s: any) => `Broker #${s.broker} (${s.pct}%)`).join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── 3. BROKER ACCUMULATION & DISTRIBUTION FOOTPRINT LEDGER ── */}
            <div className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-extrabold text-white">
                      Broker Accumulation vs Distribution Ledger (कुन ब्रोकरले कति किन्यो र बेच्यो?)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Transparent ledger of institutional buying & selling for {activeStock.symbol} (Kitta, Amount & Net Flow)
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => runZeroSumVerification(activeStock.symbol)}
                    disabled={zeroSumAudit?.loading}
                    className="px-2.5 py-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="Audit Floorsheet Conservation: Sum of all broker buys must identically equal sum of all broker sells"
                  >
                    <span>⚖️</span>
                    <span>{zeroSumAudit?.loading && zeroSumAudit.symbol === activeStock.symbol ? 'Verifying...' : 'Verify ∑ Buy = ∑ Sell'}</span>
                  </button>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Smart Money Net: {(activeStock.brokerData?.netVolume || 0) >= 0 ? '+' : ''}{(activeStock.brokerData?.netVolume || 0).toLocaleString()} kitta
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
                    BCR₃: {activeStock.brokerData?.bcr3BuyPct || 0}%
                  </span>
                </div>
              </div>

              {/* Multi-Metric Switcher Bar (Reconciliation with ShareSansar & Idea Share Nepal) */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Sort Ledger By:</span>
                  {[
                    { id: 'netFlow', label: '⚡ Net Flow (Idea Share)', hint: 'Rank by Net Flow (Buy Rs. − Sell Rs.) - Institutional Smart Money' },
                    { id: 'turnover', label: '💰 Turnover (ShareSansar)', hint: 'Rank by Gross Broker Turnover in Rs. - ShareSansar default' },
                    { id: 'kitta', label: '📊 Volume (Kitta)', hint: 'Rank by Traded Volume in Shares' }
                  ].map(m => {
                    const active = brokerLedgerMetric === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setBrokerLedgerMetric(m.id as any)}
                        title={m.hint}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-slate-400 italic">
                  {brokerLedgerMetric === 'turnover'
                    ? '100% matches ShareSansar broker table'
                    : brokerLedgerMetric === 'netFlow'
                    ? 'Smart Money Net Capital Accumulation'
                    : 'Volume-based sorting'}
                </span>
              </div>

              {/* 2-Column Responsive Tables: Top Accumulating vs Top Distributing */}
              {(() => {
                const rawBuyers = [...(activeStock.brokerData?.topBuyerBrokers || [])];
                const rawSellers = [...(activeStock.brokerData?.topSellerBrokers || [])];

                const sortedBuyers = rawBuyers.sort((a: BrokerDetail, b: BrokerDetail) => {
                  if (brokerLedgerMetric === 'netFlow') return (b.netAmount ?? b.netQty ?? 0) - (a.netAmount ?? a.netQty ?? 0);
                  if (brokerLedgerMetric === 'turnover') return (b.amount ?? 0) - (a.amount ?? 0);
                  return (b.volume ?? 0) - (a.volume ?? 0);
                });

                const sortedSellers = rawSellers.sort((a: BrokerDetail, b: BrokerDetail) => {
                  if (brokerLedgerMetric === 'netFlow') return Math.abs(b.netAmount ?? b.netQty ?? 0) - Math.abs(a.netAmount ?? a.netQty ?? 0);
                  if (brokerLedgerMetric === 'turnover') return (b.amount ?? 0) - (a.amount ?? 0);
                  return (b.volume ?? 0) - (a.volume ?? 0);
                });

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Column 1: Top Buyers / Accumulators */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-emerald-500/20 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                          <TrendingUp className="w-4 h-4" /> Top Buying Brokers (खरिदकर्ता ब्रोकरहरू)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            [{diagnosticDays === 1 ? '1D Floorsheet' : `${diagnosticDays}D Cumulative`}]
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            Total Buy: {(activeStock.brokerData?.totalBuyVolume || 0).toLocaleString()} kitta
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800/80">
                              <th className="pb-2 font-bold">Broker</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'kitta' ? 'text-indigo-400 font-black' : ''}`}>Buy Kitta</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'turnover' ? 'text-indigo-400 font-black' : ''}`}>Turnover</th>
                              <th className="pb-2 text-right font-bold">% Vol</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'netFlow' ? 'text-indigo-400 font-black' : ''}`}>Net Flow</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {sortedBuyers.map((b: BrokerDetail, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <div className="font-extrabold text-white">#{b.broker}</div>
                                      <div className="text-[10px] text-slate-400 truncate max-w-[110px]" title={b.brokerName}>
                                        {b.brokerName}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className={`py-2.5 text-right font-bold ${brokerLedgerMetric === 'kitta' ? 'text-emerald-300 font-black' : 'text-emerald-400'}`}>
                                  +{b.volume.toLocaleString()}
                                </td>
                                <td className={`py-2.5 text-right font-semibold text-[11px] ${brokerLedgerMetric === 'turnover' ? 'text-amber-300 font-black' : 'text-slate-300'}`}>
                                  {formatBrokerAmount(b.amount)}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-slate-400 text-[11px]">
                                  {b.pct}%
                                </td>
                                <td className={`py-2.5 text-right font-extrabold text-[11px] ${brokerLedgerMetric === 'netFlow' ? 'underline' : ''}`}>
                                  <span className={b.netQty >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {b.netQty >= 0 ? '+' : ''}{b.netQty.toLocaleString()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {sortedBuyers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                                  No buying broker activity recorded.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Column 2: Top Sellers / Distributors */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-red-500/20 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wide">
                          <TrendingDown className="w-4 h-4" /> Top Selling Brokers (बिक्रीकर्ता ब्रोकरहरू)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            [{diagnosticDays === 1 ? '1D Floorsheet' : `${diagnosticDays}D Cumulative`}]
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            Total Sell: {(activeStock.brokerData?.totalSellVolume || 0).toLocaleString()} kitta
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800/80">
                              <th className="pb-2 font-bold">Broker</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'kitta' ? 'text-indigo-400 font-black' : ''}`}>Sell Kitta</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'turnover' ? 'text-indigo-400 font-black' : ''}`}>Turnover</th>
                              <th className="pb-2 text-right font-bold">% Vol</th>
                              <th className={`pb-2 text-right font-bold ${brokerLedgerMetric === 'netFlow' ? 'text-indigo-400 font-black' : ''}`}>Net Flow</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {sortedSellers.map((s: BrokerDetail, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <div className="font-extrabold text-white">#{s.broker}</div>
                                      <div className="text-[10px] text-slate-400 truncate max-w-[110px]" title={s.brokerName}>
                                        {s.brokerName}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className={`py-2.5 text-right font-bold ${brokerLedgerMetric === 'kitta' ? 'text-rose-300 font-black' : 'text-red-400'}`}>
                                  -{s.volume.toLocaleString()}
                                </td>
                                <td className={`py-2.5 text-right font-semibold text-[11px] ${brokerLedgerMetric === 'turnover' ? 'text-amber-300 font-black' : 'text-slate-300'}`}>
                                  {formatBrokerAmount(s.amount)}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-slate-400 text-[11px]">
                                  {s.pct}%
                                </td>
                                <td className={`py-2.5 text-right font-extrabold text-[11px] ${brokerLedgerMetric === 'netFlow' ? 'underline' : ''}`}>
                                  <span className={s.netQty <= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                    {s.netQty > 0 ? '+' : ''}{s.netQty.toLocaleString()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {sortedSellers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                                  No selling broker activity recorded.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Net Accumulators vs Net Distributors Highlight Strip */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Top Net Accumulators (खुद खरिदकर्ता - शेयर होल्ड गर्ने)
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(activeStock.brokerData?.topNetAccumulators || []).slice(0, 3).map((b: BrokerDetail, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[11px]">
                        #{b.broker} {b.brokerName.split(' ')[0]}: +{b.netQty.toLocaleString()} kitta ({formatBrokerAmount(b.netAmount)})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-bold text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Top Net Distributors (खुद बिक्रेता - शेयर फाल्ने)
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(activeStock.brokerData?.topNetDistributors || []).slice(0, 3).map((s: BrokerDetail, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 font-bold text-[11px]">
                        #{s.broker} {s.brokerName.split(' ')[0]}: {s.netQty.toLocaleString()} kitta ({formatBrokerAmount(s.netAmount)})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Educational Footnote */}
              <div className="text-[11px] text-slate-400 bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200">नेपाली बजार विश्लेषण (NEPSE Insight): </span>
                  जब #५८, #४५ वा #३४ जस्ता शीर्ष ब्रोकरहरूले ५०% भन्दा बढी खरिद केन्द्रित (Concentration) गर्छन् र खुद बिक्रेताहरू धेरै छरिएका ब्रोकरहरूबाट हुन्छन्, यसले संस्थागत संकलन (Institutional Accumulation) को पुष्टि गर्दछ। यदि शीर्ष ब्रोकरहरूले ठूलो मात्रामा बिक्री (Net Seller) गरिरहेका छन् भने खुद्रा लगानीकर्तालाई शेयर भिडाउने (Operator Offloading) जोखिम रहन्छ।
                </div>
              </div>
            </div>

            {/* Pump & Dump Hazard Safety Audit */}
            <div className="p-4 rounded-xl bg-slate-950 border border-red-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4" /> Operator Pump & Dump Risk Meter (डम्पिङ तथा ट्र्याप जोखिम)
                </div>
                <div className="text-xs font-black px-2.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  Risk Score: {activeStock.wyckoff.pumpDumpRiskScore} / 100
                </div>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeStock.wyckoff.pumpDumpRiskScore >= 75
                      ? 'bg-red-500'
                      : activeStock.wyckoff.pumpDumpRiskScore >= 50
                      ? 'bg-orange-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${activeStock.wyckoff.pumpDumpRiskScore}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">T+2 Settlement Trap Risk</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.pChange >= 13.5 ? '🔴 Severe (±15% Circuit Overhang)' : '🟢 Normal Settlement'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Retail Offloading Footprint</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.wyckoff.tradeSizeRatio <= 0.70
                      ? '⚠️ High (Institutions selling to retail)'
                      : activeStock.wyckoff.tradeSizeRatio >= 1.40
                      ? '🟢 Strong Absorption (Institutions buying blocks)'
                      : '🟢 Balanced ticket size'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Upper Wick Supply Churn</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.wyckoff.pumpDumpRiskScore >= 60 ? '⚠️ High Resistance Churn' : '🟢 Healthy Price Delivery'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: THEORY & NEPALI PLAYBOOK GUIDE                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'playbook' && (
        <div className="space-y-3 sm:space-y-5">
          {/* Section 1: Wyckoff Cycle in Plain Nepali & English */}
          <div className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              वाइकोफ थ्योरी र नेपालको शेयर बजार (The Wyckoff Market Cycle in NEPSE)
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Richard D. Wyckoff ले प्रतिपादन गरेको बजार नियम अनुसार, शेयरको मूल्य त्यसै घटबढ हुँदैन। संस्थागत लगानीकर्ता र ठूला अपरेटरहरू (Composite Operator / खेलाडीहरू) ले ४ चरणमा बजार सञ्चालन गर्दछन्:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/20">
                <div className="text-xs font-bold text-emerald-400 mb-1">१. गोप्य संकलन (Accumulation)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  बजार घटेर तल्लो बिन्दुमा पुगेपछि अपरेटरहरूले मूल्य नबढाईकन महिनौंसम्म शान्त रूपमा शेयर किन्ने गर्दछन्। यतिबेला भोल्युम सामान्य हुन्छ तर प्रमुख ब्रोकरहरू नेट खरिदकर्ता हुन्छन्।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-blue-500/20">
                <div className="text-xs font-bold text-blue-400 mb-1">२. पम्पिङ / मार्कअप (Markup / The Pump)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  फ्लोट लक गरिसकेपछि अपरेटरहरूले बजारमा सकारात्मक हल्ला (Social Media, Clubhouse) फिँजाएर १५% को सर्किट लगाउँछन्। साधारण लगानीकर्तामा FOMO सुरु हुन्छ।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-orange-500/20">
                <div className="text-xs font-bold text-orange-400 mb-1">३. वितरण / माल फाल्ने (Distribution)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  टुप्पोमा पुगेपछि सर्वाधिक उच्च भोल्युम (Record Turnover) मा अपरेटरहरूले आफ्नो शेयर साधारण लगानीकर्ताहरूलाई सुम्पिन्छन् (Dumping onto retail)।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-red-500/20">
                <div className="text-xs font-bold text-red-400 mb-1">४. डम्पिङ / पतन (Markdown / Dump)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  अपरेटर बाहिरिएपछि माग शून्य हुन्छ। बजार तल्लो सर्किट हान्दै खस्छ। T+2 को कारण फसेका लगानीकर्ताले बेच्न नपाएर ३०-५०% नोक्सानी व्यहोर्छन्।
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Mathematical Calculations Explained */}
          <div className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              गणितीय सूत्रहरू (Mathematical Formulas Used in This App)
            </h2>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-emerald-400">1. Chaikin Close Location Value (MFM) & ADL:</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  MFM = ((Close - Low) - (High - Close)) / (High - Low)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  दिनको क्लोजिङ हाइ नजिक भए MFM +1 (संकलन) हुन्छ, लो नजिक भए -1 (वितरण) हुन्छ।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-blue-400">2. Chaikin Money Flow (CMF 20):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  CMF = Sum(MFM × Volume, 20) / Sum(Volume, 20)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  +0.10 भन्दा माथि = तीव्र संस्थागत खरिद दबाब; -0.10 भन्दा तल = तीव्र संस्थागत बिक्री दबाब।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-purple-400">3. NEPSE Buyer-to-Seller Trade Ticket Ratio (BSR):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  BSR = (Total Buy Volume / Total Buy Trades) / (Total Sell Volume / Total Sell Trades)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  BSR ≥ 2.0 भए ठूला हातहरूले साना खुद्रा विक्रेताबाट कित्ता सोरिरहेका छन् (Smart Money Buying)。
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-amber-400">4. Wyckoff 3rd Law: Effort vs. Result (प्रयास बनाम नतिजा):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  Churn Index = RVOL / (Candle Body Ratio + 0.1) &bull; Wick Overhang = Upper Wick / Total Range
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  <strong>प्रारम्भिक वितरण (Early Distribution):</strong> चर्को भोल्युम (RVOL &ge; 1.6x) तर मूल्य नबढ्ने वा लामो माथिल्लो धागो (Wick &ge; 40%) बन्नु भनेको अपरेटरहरूले खुद्राको खरिद दबाबमा आफ्ना शेयरहरू मन्थन गरेर फालिरहेका छन् (Distribution Churn)।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-cyan-400">5. Volume Dry-Up (VDU Phase C Test - सप्लाई सुकेको अवस्था):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  VDU = (Today Volume / SMA20 Volume &le; 0.50x) with Narrow Range Bar (NR4/NR7)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  <strong>प्रारम्भिक संकलन (Early Accumulation):</strong> कन्सोलिडेसनमा भोल्युम ५०% भन्दा तल सुक्नु भनेको बजारमा बिक्रेताहरू रित्तिएका हुन्। ब्रेकआउट हुनुभन्दा १-२ दिनअघि न्यून जोखिममा प्रवेश गर्ने उत्तम विन्दु।
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: NEPSE Nuances & Circuit Trap Warning */}
          <div className="p-2.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-900 border border-red-500/20 space-y-3">
            <h2 className="text-lg font-black text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              नेपालको बजारमा के फरक छ? (Crucial NEPSE Nuances)
            </h2>
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>१. सर्ट सेलिङ छैन (No Short Selling):</strong> अन्तर्राष्ट्रिय बजारमा वितरण गर्दा सर्ट गरेर कमाइन्छ, तर नेपालमा बेचेर मात्र नाफा बुक गर्न सकिन्छ। त्यसैले अपरेटरहरूले अनिवार्य रूपमा मूल्य पम्प गरेर खुद्रा लगानीकर्तालाई आकर्षित गर्नैपर्छ।
              </p>
              <p>
                <strong>२. १५% सर्किट र T+2 ट्र्याप (Circuit Trap under ±15% Band):</strong> जब सेयर अत्यधिक पम्प भइसकेर टुप्पोमा पुग्छ, त्यहाँ +१५% सर्किटमा किन्ने खुद्रा लगानीकर्ता फस्छन्। सेयर डिम्याटमा आउँदा (T+2) सम्ममा लगातार -१५% लोअर सर्किट लागेर बेच्नै पाइँदैन।
              </p>
              <p>
                <strong>३. पारदर्शी फ्लोरशिट (Public Floor Sheet Advantage):</strong> नेपालमा ब्रोकर नम्बर (Broker 58, 45, 34, 49, etc.) सार्वजनिक हुने भएकोले कसले किन्दैछ र कसले माल फाल्दैछ भन्ने कुरा हाम्रो यो राडारले सजिलै पत्ता लगाउँछ।
              </p>
            </div>
          </div>
        </div>
      )}

      {modalStock && !onSelectStock && (
        <StockDetailModal
          stock={modalStock}
          allStocks={stocks}
          onClose={() => setModalStock(null)}
        />
      )}
    </div>
  );
}
export default AccumulationDistributionRadar;
