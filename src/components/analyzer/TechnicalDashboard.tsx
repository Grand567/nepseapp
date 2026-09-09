import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Waves,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface TechnicalDashboardProps {
  trend?: any;
  momentum?: any;
  volume?: any;
  volatility?: any;
  priceAction?: any;
}

export function TechnicalDashboard({
  trend,
  momentum,
  volume,
  volatility,
  priceAction,
}: TechnicalDashboardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Activity size={16} className="text-blue-400" /> Technical Evidence Dashboard
        </h3>
        <span className="text-[11px] text-slate-500">
          5 Multi-Factor Quantitative Dimensions
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* ── 1. TREND CARD ── */}
        <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide text-slate-400">
              <TrendingUp size={14} className="text-sky-400" /> Trend & Moving Averages
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                trend?.direction === 'bullish'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : trend?.direction === 'bearish'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {trend?.classification ? trend.classification.replace('_', ' ').toUpperCase() : 'NEUTRAL'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs text-slate-400">Trend Strength</span>
            <span className="text-lg font-black text-white">
              {trend?.strength ?? 50} <span className="text-xs text-slate-400">/ 100</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-900/60 rounded-xl p-2 border border-slate-800/80">
            <div>
              <div className="text-slate-500">EMA 20</div>
              <div className="font-bold text-white mt-0.5">
                Rs. {trend?.ema?.ema20 ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">EMA 50</div>
              <div className="font-bold text-white mt-0.5">
                Rs. {trend?.ema?.ema50 ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">EMA 200</div>
              <div className="font-bold text-white mt-0.5">
                {trend?.ema?.ema200 ? `Rs. ${trend.ema.ema200}` : 'N/A (<180d)'}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {trend?.observations?.[0] || 'Price moving average alignment evaluated.'}
          </p>
        </div>

        {/* ── 2. MOMENTUM CARD ── */}
        <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide text-slate-400">
              <Zap size={14} className="text-amber-400" /> Momentum & Velocity
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                momentum?.direction === 'bullish'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : momentum?.direction === 'bearish'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {momentum?.direction ? momentum.direction.toUpperCase() : 'NEUTRAL'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[11px] text-slate-400">RSI (14)</div>
              <div className="text-lg font-black text-white mt-0.5">
                {momentum?.rsi14 ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">MACD Histogram</div>
              <div
                className={`text-lg font-black mt-0.5 ${
                  (momentum?.macd?.histogram || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {momentum?.macd?.histogram != null ? `${momentum.macd.histogram > 0 ? '+' : ''}${momentum.macd.histogram}` : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-900/60 rounded-xl p-2 border border-slate-800/80">
            <div>
              <div className="text-slate-500">5-Day Return</div>
              <div className={`font-bold mt-0.5 ${(momentum?.returns?.ret5 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {momentum?.returns?.ret5 != null ? `${momentum.returns.ret5 >= 0 ? '+' : ''}${momentum.returns.ret5}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">20-Day Return</div>
              <div className={`font-bold mt-0.5 ${(momentum?.returns?.ret20 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {momentum?.returns?.ret20 != null ? `${momentum.returns.ret20 >= 0 ? '+' : ''}${momentum.returns.ret20}%` : '—'}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {momentum?.observations?.[0] || 'Multi-timeframe price velocity and oscillator signals.'}
          </p>
        </div>

        {/* ── 3. VOLUME CARD ── */}
        <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide text-slate-400">
              <BarChart3 size={14} className="text-purple-400" /> Volume & Conviction
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-purple-300">
              RVOL {volume?.rvol ?? 1.0}x
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[11px] text-slate-400">Session Volume</div>
              <div className="text-base font-black text-white mt-0.5">
                {volume?.currentVolume != null ? Number(volume.currentVolume).toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">20D Average</div>
              <div className="text-base font-black text-slate-300 mt-0.5">
                {volume?.avgVolume20 != null ? Number(volume.avgVolume20).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/60 rounded-xl p-2 border border-slate-800/80 text-[11px]">
            <span className="text-slate-400">Breakout Volume:</span>
            <span className={`font-bold ${volume?.state === 'bullish_volume_confirmation' ? 'text-emerald-400' : 'text-slate-300'}`}>
              {volume?.state === 'bullish_volume_confirmation' ? '✓ Confirmed' : volume?.state === 'weak_breakout' ? '⚠️ Light Volume' : 'Normal Participation'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {volume?.observations?.[0] || 'Volume expansion and institutional order participation.'}
          </p>
        </div>

        {/* ── 4. VOLATILITY CARD ── */}
        <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide text-slate-400">
              <Waves size={14} className="text-teal-400" /> Volatility & Regimes
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                volatility?.isSqueeze
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-slate-800 text-teal-300'
              }`}
            >
              {volatility?.isSqueeze ? '⚡ SQUEEZE DETECTED' : volatility?.regime?.replace('_', ' ').toUpperCase() || 'NORMAL'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-[11px] text-slate-400">ATR (14)</div>
              <div className="text-lg font-black text-white mt-0.5">
                Rs. {volatility?.atr14 ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">ATR Percentage</div>
              <div className="text-lg font-black text-teal-400 mt-0.5">
                {volatility?.atrPct != null ? `${volatility.atrPct}%` : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/60 rounded-xl p-2 border border-slate-800/80 text-[11px]">
            <span className="text-slate-400">Bollinger Band Width:</span>
            <span className="font-bold text-white">
              {volatility?.bbwPct != null ? `${volatility.bbwPct}%` : '—'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {volatility?.observations?.[0] || 'Volatility distribution and expansion potential.'}
          </p>
        </div>

        {/* ── 5. PRICE ACTION CARD ── */}
        <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 text-slate-200 space-y-2.5 md:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide text-slate-400">
              <Activity size={14} className="text-emerald-400" /> Market Structure & Candlestick
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                priceAction?.structure?.direction === 'bullish'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : priceAction?.structure?.direction === 'bearish'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {priceAction?.structure?.structure?.replace(/_/g, ' ').toUpperCase() || 'DEVELOPING'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/80 space-y-1">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">Market Structure</div>
              <div className="text-xs font-bold text-white">
                {priceAction?.structure?.description || 'Evaluating structural highs and lows.'}
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/80 space-y-1">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">Recent Candlestick Pattern</div>
              <div className="text-xs font-bold text-emerald-400">
                {priceAction?.candlestick?.name ? `✓ ${priceAction.candlestick.name}` : 'No dominant single pattern'}
              </div>
              {priceAction?.candlestick?.description && (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {priceAction.candlestick.description}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
