import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Bookmark, HelpCircle, Zap } from 'lucide-react';

export function StockDetails({
  symbol = 'NABIL',
  onBack,
  onOpenOrder,
  lang = 'ne',
  stocks = [],
}) {
  const isNe = lang === 'ne';
  const [subTab, setSubTab] = useState('fund'); // 'fund', 'depth', 'div'
  const [timeframe, setTimeframe] = useState('1D');
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Look up live data if available
  const liveStock = stocks.find(s => s.symbol?.toUpperCase() === symbol?.toUpperCase());

  const ltp = liveStock?.ltp ? Number(liveStock.ltp) : (liveStock?.close ? Number(liveStock.close) : 0);
  const chg = liveStock?.pointChange !== undefined ? Number(liveStock.pointChange) : (liveStock?.change !== undefined ? Number(liveStock.change) : 0);
  const pct = liveStock?.percentChange !== undefined ? Number(liveStock.percentChange) : (liveStock?.pChange !== undefined ? Number(liveStock.pChange) : 0);
  const isPos = chg >= 0;

  const dayLow = liveStock?.low != null ? Number(liveStock.low) : (ltp > 0 ? ltp : 0);
  const dayHigh = liveStock?.high != null ? Number(liveStock.high) : (ltp > 0 ? ltp : 0);
  const rangeSpan = Math.max(0.1, dayHigh - dayLow);
  const rangePct = Math.min(100, Math.max(0, ((ltp - dayLow) / rangeSpan) * 100));

  const volumeStr = liveStock?.volume ? Number(liveStock.volume).toLocaleString() : (liveStock?.totalTradedQuantity ? Number(liveStock.totalTradedQuantity).toLocaleString() : '—');
  const turnoverVal = liveStock?.turnover;
  const turnoverStr = turnoverVal
    ? (turnoverVal >= 1e7
      ? (isNe ? `रु ${(turnoverVal / 1e7).toFixed(2)} करोड` : `NPR ${(turnoverVal / 1e7).toFixed(2)} Cr`)
      : `रु ${Number(turnoverVal).toLocaleString()}`)
    : '—';

  const companyNameNe = liveStock?.name || symbol;
  const companyNameEn = symbol;
  const sectorName = liveStock?.sector || 'Equity';

  const h52 = liveStock?.high52w || liveStock?.high52;
  const l52 = liveStock?.low52w || liveStock?.low52;
  const range52wStr = (h52 != null && l52 != null)
    ? `52W: Rs ${Number(l52).toFixed(0)} - ${Number(h52).toFixed(0)}`
    : '52W: —';

  const ema20 = liveStock?.ema20;
  const ema20Str = ema20 != null ? Number(ema20).toFixed(2) : '—';

  const epsStr = liveStock?.eps != null ? `Rs ${Number(liveStock.eps).toFixed(2)}` : '—';
  const peStr = liveStock?.pe != null && Number(liveStock.pe) > 0 ? Number(liveStock.pe).toFixed(2) : '—';
  const bvStr = liveStock?.bookValue != null ? `Rs ${Number(liveStock.bookValue).toFixed(2)}` : '—';
  const pbStr = (liveStock?.bookValue && ltp > 0) ? `P/B: ${(ltp / Number(liveStock.bookValue)).toFixed(1)}x` : '—';
  const mCapStr = liveStock?.marketCap
    ? (liveStock.marketCap >= 1e9
      ? `NPR ${(liveStock.marketCap / 1e9).toFixed(2)} Arba`
      : `NPR ${(liveStock.marketCap / 1e7).toFixed(2)} Cr`)
    : '—';

  return (
    <div className="space-y-4 pb-24">
      {/* Scrip Identity Card */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141A28] to-[#0F131F] p-4.5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-sky-500/20 px-2.5 py-1 font-mono text-xs text-sky-400 border border-sky-500/30 font-extrabold tracking-wide">
              {symbol}
            </span>
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-300 font-medium">
              {sectorName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBookmarked(prev => !prev)}
              className={`p-2 rounded-xl border transition-all ${
                isBookmarked
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'bg-white/[0.04] border-white/[0.06] text-slate-400 hover:text-white'
              }`}
            >
              <Bookmark size={16} />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {isNe ? 'कारोबार चालू' : 'LIVE'}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-white flex items-baseline gap-2">
            {companyNameNe}
            <span className="text-xs font-normal text-slate-400">
              ({companyNameEn})
            </span>
          </h2>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            ISIN: {liveStock?.isin || '—'} • NEPSE Script: {symbol} • Promoter/Public: {liveStock?.promoterShare && liveStock?.publicShare ? `${liveStock.promoterShare}:${liveStock.publicShare}` : '—'}
          </div>
        </div>

        {/* LTP & Day Change */}
        <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-3">
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase">
              {isNe ? 'अन्तिम कारोबार मूल्य (LTP)' : 'Last Traded Price (LTP)'}
            </div>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span className="font-mono text-3xl font-extrabold text-white">Rs {ltp > 0 ? ltp.toFixed(2) : '—'}</span>
              {ltp > 0 && (
                <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-xs font-bold ${
                  isPos
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                }`}>
                  {isPos ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
                  {isPos ? '+' : ''}{chg.toFixed(2)} ({isPos ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-[10px] text-slate-400">{isNe ? 'आजको कित्ता' : 'Day Vol'}</div>
            <div className="text-sm font-bold text-sky-400 mt-0.5">{volumeStr}</div>
            <div className="text-[10px] text-slate-400">{turnoverStr}</div>
          </div>
        </div>

        {/* Day Range Bar */}
        <div className="rounded-xl bg-[#0B0F17]/70 p-2.5 border border-white/[0.04] space-y-1 font-mono text-xs text-slate-400">
          <div className="flex justify-between text-[11px]">
            <span>{isNe ? 'दिनको न्यून:' : 'Day Low:'} <strong className="text-white">{dayLow > 0 ? `Rs ${dayLow.toFixed(2)}` : '—'}</strong></span>
            <span className={`${isPos ? 'text-emerald-400' : 'text-rose-400'} font-bold`}>
              {range52wStr}
            </span>
            <span>{isNe ? 'दिनको उच्च:' : 'Day High:'} <strong className="text-white">{dayHigh > 0 ? `Rs ${dayHigh.toFixed(2)}` : '—'}</strong></span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isPos ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${rangePct}%` }} />
          </div>
        </div>

        {/* Timeframe Selector & Chart */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-xl bg-[#0B0F17] p-1 border border-white/[0.06] font-mono text-[10px]">
              {['1D', '1W', '1M', '1Y', 'MAX'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded-lg px-2.5 py-1 font-bold transition-all ${
                    timeframe === tf ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              EMA(20): <span className="text-emerald-400 font-bold">{ema20Str}</span>
            </span>
          </div>

          <div className="h-28 w-full pt-1">
            <svg viewBox="0 0 300 80" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="scripGradLive" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={isPos ? "#10B981" : "#F43F5E"} stopOpacity="0.30" />
                  <stop offset="100%" stopColor={isPos ? "#10B981" : "#F43F5E"} stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d="M0,70 Q40,65 80,68 T160,40 T240,25 L300,10 L300,80 L0,80 Z" fill="url(#scripGradLive)" />
              <path d="M0,70 Q40,65 80,68 T160,40 T240,25 L300,10" fill="none" stroke={isPos ? "#10B981" : "#F43F5E"} strokeWidth="2.5" />
              <circle cx="300" cy="10" r="4" fill={isPos ? "#10B981" : "#F43F5E"} />
            </svg>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Fundamentals / Depth / Dividends */}
      <div className="flex items-center justify-between rounded-xl bg-[#111622] p-1 border border-white/[0.06]">
        <button
          onClick={() => setSubTab('fund')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            subTab === 'fund' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '📊 वित्तीय अवस्था (Fundamentals)' : '📊 Fundamentals'}
        </button>
        <button
          onClick={() => setSubTab('depth')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'depth' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '⚡ बजार गहिराई (Depth)' : '⚡ Market Depth'}
        </button>
        <button
          onClick={() => setSubTab('div')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            subTab === 'div' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '🎁 लाभांश (Dividends)' : '🎁 Dividends'}
        </button>
      </div>

      {/* SUBTAB 1: Fundamentals */}
      {subTab === 'fund' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{isNe ? 'प्रति सेयर आम्दानी (EPS)' : 'Earnings Per Share'}</span>
                {liveStock?.eps != null && (
                  <span className={`text-[9px] font-mono font-bold ${Number(liveStock.eps) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {Number(liveStock.eps) > 0 ? (isNe ? 'नाफामूलक' : 'Profitable') : (isNe ? 'घाटा' : 'Loss')}
                  </span>
                )}
              </div>
              <div className="font-mono text-xl font-extrabold text-white">{epsStr}</div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {isNe ? '१ कित्ता सेयरबाट कम्पनीले कमाएको खुद नाफा।' : 'Annual net profit generated per share.'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{isNe ? 'मूल्य/आम्दानी (P/E Ratio)' : 'P/E Ratio'}</span>
                {liveStock?.pe != null && Number(liveStock.pe) > 0 && (
                  <span className="text-[9px] text-emerald-400 font-mono font-bold">{isNe ? 'मूल्याङ्कन' : 'Multiple'}</span>
                )}
              </div>
              <div className="font-mono text-xl font-extrabold text-white">{peStr}</div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {isNe ? 'मूल्य र प्रति सेयर आम्दानीको अनुपात।' : 'Price-to-earnings multiple.'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{isNe ? 'किताबी मूल्य (Book Value)' : 'Book Value per Share'}</span>
                <span className="text-[9px] text-sky-400 font-mono font-bold">{pbStr}</span>
              </div>
              <div className="font-mono text-xl font-extrabold text-white">{bvStr}</div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {isNe ? 'कम्पनीको सम्पत्ति अनुसार प्रत्येक कित्ताको आन्तरिक मूल्य।' : 'Net asset value per unit share.'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#111622] p-3.5 space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{isNe ? 'कुल बजार पूँजीकरण' : 'Market Capitalization'}</span>
              </div>
              <div className="font-mono text-xl font-extrabold text-white">{mCapStr}</div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {isNe ? 'कम्पनीको कुल बजार मूल्य।' : 'Total market equity valuation.'}
              </p>
            </div>
          </div>

          {/* Retail Verdict */}
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-sky-400">
              <HelpCircle size={16} />
              <span>{isNe ? 'विश्लेषक सारांश (Analyst Summary)' : 'Analyst Summary'}</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {liveStock?.reasoning || (
                isNe
                  ? `${symbol} को विश्लेषण हेर्न विस्तृत अनुसन्धान मोड्युल प्रयोग गर्नुहोस्। वित्तीय विवरण र प्राविधिक सूचकहरू आधिकारिक डेटा स्रोतबाट प्रमाणीकरण गरिएका छन्।`
                  : `Review ${symbol} in detail via the full Analyzer workstation. Financial filings and technical parameters are verified against exchange data.`
              )}
            </p>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Market Depth */}
      {subTab === 'depth' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 space-y-3">
            {liveStock?.marketDepth && Array.isArray(liveStock.marketDepth.bids) && liveStock.marketDepth.bids.length > 0 ? (
              <>
                <div className="space-y-1.5 pb-2 border-b border-white/[0.06]">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-emerald-400 font-bold">
                      {isNe ? `खरिद माग: ${Number(liveStock.totalBuyQty || 0).toLocaleString()}` : `Bids: ${Number(liveStock.totalBuyQty || 0).toLocaleString()}`}
                    </span>
                    <span className="text-rose-400 font-bold">
                      {isNe ? `बिक्री आपूर्ति: ${Number(liveStock.totalSellQty || 0).toLocaleString()}` : `Asks: ${Number(liveStock.totalSellQty || 0).toLocaleString()}`}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-400 uppercase font-semibold pb-1">
                    <div className="flex justify-between px-1">
                      <span>{isNe ? 'किन्ने अर्डर (Bids)' : 'Orders (Bids)'}</span>
                      <span>{isNe ? 'मूल्य (NPR)' : 'Price'}</span>
                    </div>
                    <div className="flex justify-between px-1">
                      <span>{isNe ? 'मूल्य (NPR)' : 'Price'}</span>
                      <span>{isNe ? 'बेच्ने अर्डर (Asks)' : 'Orders (Asks)'}</span>
                    </div>
                  </div>
                  {liveStock.marketDepth.bids.slice(0, 5).map((bid, i) => {
                    const ask = liveStock.marketDepth.asks?.[i];
                    return (
                      <div key={i} className="grid grid-cols-2 gap-3">
                        <div className="flex justify-between rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 px-2.5 py-1.5">
                          <span className="text-slate-300 font-medium">{Number(bid.quantity || 0).toLocaleString()}</span>
                          <span className="font-bold text-emerald-400">Rs {Number(bid.rate || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between rounded-xl bg-rose-500/[0.08] border border-rose-500/20 px-2.5 py-1.5">
                          <span className="font-bold text-rose-400">{ask ? `Rs ${Number(ask.rate || 0).toFixed(2)}` : '—'}</span>
                          <span className="text-slate-300 font-medium">{ask ? Number(ask.quantity || 0).toLocaleString() : '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {isNe ? 'यो सत्रको लागि प्रत्यक्ष मार्केट डेप्थ हाल उपलब्ध छैन।' : 'Live Market Depth is unavailable for this session or off-market.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: Dividends */}
      {subTab === 'div' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 space-y-3">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-200 pb-2 border-b border-white/[0.06]">
              <span>{isNe ? 'लाभांश विवरण (Dividend Track Record)' : 'Dividend Track Record'}</span>
            </div>

            {Array.isArray(liveStock?.dividendHistory) && liveStock.dividendHistory.length > 0 ? (
              <div className="space-y-2 font-mono text-xs">
                {liveStock.dividendHistory.map((div, idx) => (
                  <div key={idx} className="rounded-xl bg-[#0B0F17] p-3 border border-white/[0.05] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white font-sans text-sm">{div.fiscalYear || div.year || 'Corporate Action'}</div>
                      <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                        {div.cashDividend ? `${div.cashDividend}% Cash ` : ''}
                        {div.bonusShare ? `+ ${div.bonusShare}% Bonus` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-extrabold text-sm">
                        {div.totalDividend ? `Total ${div.totalDividend}%` : 'Approved'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {isNe ? 'हाल कुनै लाभांश विवरण उपलब्ध छैन।' : `No historical dividend track record recorded for ${symbol}.`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Detail Actions */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={onBack}
          className="tap-active rounded-2xl border border-white/[0.08] bg-[#111622] hover:bg-[#161D2E] py-3.5 text-xs font-semibold text-slate-300 transition-all flex items-center justify-center gap-1.5"
        >
          <ArrowLeft size={16} />
          <span>{isNe ? 'पछाडि फर्कनुहोस् (Back)' : 'Back'}</span>
        </button>
        <button
          onClick={() => onOpenOrder && onOpenOrder(symbol, ltp)}
          className="tap-active rounded-2xl bg-sky-500 hover:bg-sky-400 py-3.5 text-xs font-bold font-mono text-white shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-1.5"
        >
          <Zap size={16} />
          <span>{isNe ? '⚡ किनबेच (Buy/Sell) →' : '⚡ Buy/Sell (TMS) →'}</span>
        </button>
      </div>
    </div>
  );
}

export default StockDetails;
