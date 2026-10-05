/**
 * NEPSE Agent Tool Aggregator & Dossier Assembly Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * proxy/agentTools.mjs
 *
 * Implements Phase 2 & 3 of the Drabyashree NEPSE Agent:
 * - Aggregates authentic exchange prices, historical candles, broker flow, and fundamentals.
 * - Computes quantitative indicators using deterministic mathematical engines.
 * - Formulates structured, anti-hallucination dossiers for Gemini 3.1 Pro / Pro models.
 * - Never fabricates mock values or guesses price targets without mathematical models.
 */

import {
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateBollingerBands
} from '../src/utils/indicators.js';
import { calculateATR } from '../src/utils/quantEngine.js';
import { generateEntryExitPlan } from '../src/utils/setupAnalyzer.js';
import { getOrFetchBrokerAnalysis } from './brokerVault.mjs';

/**
 * Gathers authentic market data, calculates quantitative indicators,
 * and assembles a unified scrip dossier for agent reasoning.
 *
 * @param {string} symbol - Sanitized stock ticker (e.g. "KBL", "HDL")
 * @param {object} helpers - { getStockDetailInternal, getPriceHistoryInternal }
 * @returns {Promise<object>} Complete validated analytical dossier
 */
export async function assembleScripDossier(symbol, helpers) {
  const normSym = String(symbol || '').toUpperCase().trim();
  if (!normSym) throw new Error('Invalid stock symbol');

  const { getStockDetailInternal, getPriceHistoryInternal } = helpers;

  // 1. Fetch live detail, candle history, and broker analytics in parallel
  const [stockDetailResult, historyResult, brokerResult] = await Promise.allSettled([
    getStockDetailInternal(normSym, false),
    getPriceHistoryInternal(normSym, 120),
    getOrFetchBrokerAnalysis(normSym, 30)
  ]);

  const stock = stockDetailResult.status === 'fulfilled' && stockDetailResult.value ? stockDetailResult.value : null;
  const rawCandles = historyResult.status === 'fulfilled' && Array.isArray(historyResult.value) ? historyResult.value : [];
  const broker = brokerResult.status === 'fulfilled' && brokerResult.value ? brokerResult.value : null;

  if (!stock && rawCandles.length === 0) {
    throw new Error(`No authentic market data found for scrip: ${normSym}`);
  }

  // 2. Sort and clean ascending daily candles
  const candles = rawCandles
    .map(c => ({
      date: c.date || c.t || '',
      open: Number(c.open ?? c.o ?? c.close ?? c.c ?? c.ltp ?? 0),
      high: Number(c.high ?? c.h ?? c.close ?? c.c ?? c.ltp ?? 0),
      low: Number(c.low ?? c.l ?? c.close ?? c.c ?? c.ltp ?? 0),
      close: Number(c.close ?? c.c ?? c.ltp ?? 0),
      volume: Number(c.volume ?? c.v ?? c.totalTradeQuantity ?? 0)
    }))
    .filter(c => c.close > 0 && c.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const closes = candles.map(c => c.close);
  const ltp = Number(stock?.ltp || stock?.closePrice || (closes.length > 0 ? closes[closes.length - 1] : 0));
  const prevClose = Number(stock?.previousClose || stock?.prevClose || (closes.length > 1 ? closes[closes.length - 2] : ltp));
  const pChange = Number(stock?.pChange ?? stock?.percentageChange ?? (prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0));

  // 3. Technical Indicators (Deterministic quantitative mathematics)
  let rsi = null;
  if (closes.length >= 15) {
    const rawRsi = calculateRSI(closes, 14);
    rsi = rawRsi != null ? +Number(rawRsi).toFixed(1) : null;
  }

  let macd = null;
  if (closes.length >= 26) {
    const rawMacd = calculateMACD(closes, 12, 26, 9);
    if (rawMacd) {
      macd = {
        macdLine: +Number(rawMacd.macdLine || 0).toFixed(2),
        signalLine: +Number(rawMacd.signalLine || 0).toFixed(2),
        histogram: +Number(rawMacd.histogram || 0).toFixed(2),
        isBullishCross: (rawMacd.histogram || 0) >= 0
      };
    }
  }

  let ema20 = null;
  let ema50 = null;
  if (closes.length >= 20) {
    const e20Arr = calculateEMA(closes, 20);
    const validE20 = e20Arr.filter(v => v !== null);
    if (validE20.length > 0) ema20 = +validE20[validE20.length - 1].toFixed(1);
  }
  if (closes.length >= 50) {
    const e50Arr = calculateEMA(closes, 50);
    const validE50 = e50Arr.filter(v => v !== null);
    if (validE50.length > 0) ema50 = +validE50[validE50.length - 1].toFixed(1);
  }

  let bollinger = null;
  if (closes.length >= 20) {
    const rawBb = calculateBollingerBands(closes, 20, 2);
    if (rawBb) {
      bollinger = {
        upper: +Number(rawBb.upper || 0).toFixed(1),
        middle: +Number(rawBb.middle || 0).toFixed(1),
        lower: +Number(rawBb.lower || 0).toFixed(1),
        bandwidthPct: +Number(rawBb.bandwidth || 0).toFixed(1),
        isSqueeze: Boolean(rawBb.isSqueeze)
      };
    }
  }

  const atrRaw = closes.length >= 15 ? Number(calculateATR(candles.slice(-30), 14)) : NaN;
  const atr = isFinite(atrRaw) && atrRaw > 0 ? +atrRaw.toFixed(1) : null;

  // 4. Volume & RVOL Analysis
  const recent20Vols = candles.slice(-21, -1).map(c => c.volume);
  const avg20Vol = recent20Vols.length > 0
    ? Math.round(recent20Vols.reduce((a, b) => a + b, 0) / recent20Vols.length)
    : null;
  const currentVolRaw = Number(stock?.volume || stock?.totalTradedQuantity || (candles.length > 0 ? candles[candles.length - 1].volume : 0));
  const currentVol = currentVolRaw > 0 ? currentVolRaw : null;
  const rvol = (avg20Vol && currentVol) ? +Number(currentVol / avg20Vol).toFixed(2) : null;

  // 5. Broker Cornering & Smart Money Concentration (BCR3 & BCR5) — real feed only
  const topBuyers = (broker?.topBuyers || broker?.buyers || []).slice(0, 5);
  const topSellers = (broker?.topSellers || broker?.sellers || []).slice(0, 5);
  const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0);
  const top5BuyVol = topBuyers.slice(0, 5).reduce((acc, b) => acc + Number(b.buyQty || b.volume || b.shares || 0), 0);
  const ratio = (top5BuyVol > 0 && top3BuyVol > 0) ? (top3BuyVol / top5BuyVol) : null;

  const bcr5Raw = Number(broker?.bcr5BuyPct || (broker?.crb5 ? Number(broker.crb5) * 100 : 0));
  const bcr5 = bcr5Raw > 0 ? bcr5Raw : null;
  const bcr3Raw = Number(broker?.bcr3BuyPct || (bcr5 && ratio ? +(bcr5 * ratio).toFixed(1) : 0));
  const bcr3 = bcr3Raw > 0 ? bcr3Raw : null;
  const bcr3SellRaw = Number(broker?.bcr3SellPct || 0);
  const bcr3Sell = bcr3SellRaw > 0 ? bcr3SellRaw : null;

  // 6. Actionable Execution Geometry (Setup Analyzer Engine) — real levels only
  let entryExitPlan = null;
  try {
    entryExitPlan = candles.length >= 20
      ? generateEntryExitPlan(stock || { ltp, pChange }, candles, [], { maxHoldDays: 20 })
      : null;
  } catch (e) { entryExitPlan = null; }

  const levels = entryExitPlan?.levels || {};
  const hasLevels = entryExitPlan && entryExitPlan.supported !== false && levels.stopLoss?.price != null && levels.target1?.price != null;

  const executionPlan = (() => {
    if (!hasLevels) {
      return {
        available: false,
        reason: entryExitPlan?.reason || `Only ${candles.length} sessions of history — at least 20 are required for entry/exit levels.`,
        stance: 'INSUFFICIENT DATA',
        setupScore: null,
        pullbackZone: null,
        breakoutZone: null,
        stopLoss: null,
        targets: [],
        feeFrictionPct: 0.73,
        cgtTaxRatePct: 7.5
      };
    }
    const pivot = levels.breakoutZone?.pivot ?? levels.breakoutPivot ?? null;
    const cap = levels.breakoutZone?.chaseCap ?? levels.chaseCap ?? null;
    const slPx = levels.stopLoss.price;
    const slPct = levels.stopLoss.pct ?? +(((ltp - slPx) / ltp) * 100).toFixed(1);
    const tgt = (t, label) => t?.price != null ? {
      price: t.price,
      grossUpsidePct: t.upsidePct ?? +(((t.price - ltp) / ltp) * 100).toFixed(1),
      netReturnPct: t.netReturnPct ?? null,
      label
    } : null;
    return {
      available: true,
      stance: entryExitPlan.verdict || 'HOLD / WAIT',
      setupScore: entryExitPlan.setupScore ?? null,
      pullbackZone: levels.pullbackZone ? {
        low: levels.pullbackZone.low,
        high: levels.pullbackZone.high,
        label: levels.pullbackZone.label || `Rs. ${levels.pullbackZone.low} – Rs. ${levels.pullbackZone.high}`,
        supportRef: levels.pullbackZone.supportRef || null
      } : null,
      breakoutZone: pivot != null ? {
        pivot,
        trigger: levels.breakoutPrice ?? null,
        chaseCap: cap,
        label: `> Rs. ${pivot}${cap != null ? ` (Cap: Rs. ${cap})` : ''}`
      } : null,
      stopLoss: { price: slPx, pct: slPct, label: `Rs. ${slPx} (-${slPct}%)` },
      targets: [tgt(levels.target1, 'Target 1'), tgt(levels.target2, 'Target 2')].filter(Boolean),
      riskPerShare: levels.riskPerShare ?? null,
      rewardToTarget1: levels.rewardToTarget1 ?? null,
      feeFrictionPct: 0.73,
      cgtTaxRatePct: 7.5
    };
  })();

  const num = (v) => { const n = Number(v); return isFinite(n) && n !== 0 ? n : null; };

  return {
    symbol: normSym,
    companyName: stock?.companyName || stock?.name || normSym,
    sector: stock?.sector || 'Others',
    quote: {
      ltp,
      prevClose,
      pChange,
      volume: currentVol,
      avgVolume20D: avg20Vol,
      turnover: num(stock?.turnover || stock?.totalTurnover) ?? (currentVol ? Math.round(currentVol * ltp) : null),
      high52w: num(stock?.high52w),
      low52w: num(stock?.low52w),
      circuitCeiling: prevClose > 0 ? +(prevClose * 1.10).toFixed(1) : null,
      circuitFloor: prevClose > 0 ? +(prevClose * 0.90).toFixed(1) : null
    },
    technicals: {
      rsi14: rsi,
      macd,
      ema20,
      ema50,
      bollinger,
      atr14: atr,
      rvol20: rvol,
      trendStructure: ema20 == null ? 'INSUFFICIENT_HISTORY' : (ltp >= ema20 ? 'Above 20-EMA (Bullish Stance)' : 'Below 20-EMA (Corrective Stance)')
    },
    brokerFlow: {
      available: bcr3 != null,
      bcr3BuyPct: bcr3,
      bcr5BuyPct: bcr5,
      bcr3SellPct: bcr3Sell,
      topBuyers: topBuyers.map(b => ({
        broker: b.broker || b.brokerNo || b.id,
        volume: Number(b.buyQty || b.volume || 0),
        amount: Number(b.buyAmt || b.amount || 0)
      })),
      topSellers: topSellers.map(s => ({
        broker: s.broker || s.brokerNo || s.id,
        volume: Number(s.sellQty || s.volume || 0),
        amount: Number(s.sellAmt || s.amount || 0)
      })),
      smartMoneyBias: bcr3 == null ? 'Broker data unavailable' : (bcr3 >= 40 ? 'Institutional Cornering' : ((bcr3Sell ?? 0) >= 40 ? 'Operator Offloading' : 'Neutral Flow'))
    },
    fundamentals: {
      pe: num(stock?.pe),
      eps: num(stock?.eps),
      bookValue: num(stock?.bookValue || stock?.bvps),
      pbv: num(stock?.pbv || stock?.pb),
      dividendYield: num(stock?.dividendYield),
      marketCap: num(stock?.marketCap)
    },
    executionPlan,
    meta: {
      candlesAnalyzed: candles.length,
      asOf: new Date().toISOString(),
      dataSource: 'NEPSE Official NOTS & Exchange Floor Sheet'
    }
  };
}

/**
 * Builds the strict, anti-hallucination prompt for Gemini models.
 * Injects observed facts, calculated technicals, broker flow, and execution levels.
 */
export function buildAgentAnalysisPrompt(dossier, customUserQuery = '') {
  return `You are the Drabyashree NEPSE Analysis Agent, an institutional-grade quantitative equity research engine for the Nepal Stock Exchange (NEPSE).

Below is the VERIFIED, OBSERVED, AND CALCULATED analytical dossier for scrip ${dossier.symbol} (${dossier.companyName}).
Every number provided is authentic and computed from real exchange data.

════════════════════════════════════════════════════════════════
VERIFIED NEPSE DOSSIER:
- Symbol: ${dossier.symbol} | Sector: ${dossier.sector}
- Current LTP: Rs. ${dossier.quote.ltp} (Change: ${dossier.quote.pChange}%)
- Session Range: Open Rs. ${dossier.quote.prevClose} | Circuit Limits: Floor Rs. ${dossier.quote.circuitFloor} – Ceiling Rs. ${dossier.quote.circuitCeiling} (±10% limit)
- Volume: ${dossier.quote.volume?.toLocaleString() ?? 'N/A'} shares | 20-Day Avg Volume: ${dossier.quote.avgVolume20D?.toLocaleString() ?? 'N/A'} shares | RVOL: ${dossier.technicals.rvol20 ?? 'N/A'}x
- Technical Momentum: RSI(14): ${dossier.technicals.rsi14 ?? 'N/A'} | MACD Histogram: ${dossier.technicals.macd?.histogram ?? 'N/A'} (Bullish: ${dossier.technicals.macd?.isBullishCross ?? false})
- Moving Averages: 20-EMA Rs. ${dossier.technicals.ema20 ?? 'N/A'} | 50-EMA Rs. ${dossier.technicals.ema50 ?? 'N/A'} | Posture: ${dossier.technicals.trendStructure}
- Volatility: ATR(14) Rs. ${dossier.technicals.atr14 ?? 'N/A'} | Bollinger Squeeze: ${dossier.technicals.bollinger?.isSqueeze ? 'YES (Coiling energy)' : 'NO (Normal band width)'}
- Smart Money & Broker Concentration:
  * BCR3 (Top 3 Buyers %): ${dossier.brokerFlow.bcr3BuyPct ?? 'N/A'}%
  * BCR5 (Top 5 Buyers %): ${dossier.brokerFlow.bcr5BuyPct ?? 'N/A'}%
  * BCR3 Sell (Top 3 Sellers %): ${dossier.brokerFlow.bcr3SellPct ?? 'N/A'}%
  * Smart Money Bias: ${dossier.brokerFlow.smartMoneyBias}
- Valuation: P/E: ${dossier.fundamentals.pe ? dossier.fundamentals.pe + 'x' : 'N/A'} | EPS: Rs. ${(dossier.fundamentals.eps !== undefined && dossier.fundamentals.eps !== null) ? dossier.fundamentals.eps : 'N/A'} | Book Value: Rs. ${dossier.fundamentals.bookValue ? dossier.fundamentals.bookValue : 'N/A'}
- Model Execution Geometry:
${(() => { const ep = dossier.executionPlan || {}; if (!ep.available) return `  * UNAVAILABLE: ${ep.reason || 'insufficient data'} — do NOT propose specific entry/stop/target prices.`; const t = (x) => x ? `Rs. ${x.price}${x.netReturnPct != null ? ` (net ${x.netReturnPct}%)` : ''}` : 'N/A'; return [`  * Stance: ${ep.stance} (Setup Score: ${ep.setupScore ?? 'N/A'}/100)`, `  * Pullback Zone: ${ep.pullbackZone?.label ?? 'N/A'} (${ep.pullbackZone?.supportRef ?? ''})`, `  * Breakout: ${ep.breakoutZone?.label ?? 'N/A'}`, `  * Stop-Loss: ${ep.stopLoss?.label ?? 'N/A'}`, `  * Target 1: ${t(ep.targets?.[0])}`, `  * Target 2: ${t(ep.targets?.[1])}`].join('\n'); })()}
════════════════════════════════════════════════════════════════

USER INQUIRY: "${customUserQuery || 'Provide institutional analysis, trade execution plan, and risk scenarios for this scrip.'}"

RULES:
1. Do NOT invent prices, dates, or financial metrics. Reference the exact numbers from the dossier.
2. In NEPSE, T+2 delivery settlement applies. Evaluate Day 1 chase risk near the +10% upper circuit ceiling.
3. Clearly explain BOTH entry strategies:
   - Strategy A: Pullback Dip Entry (buying the support retest near 20-EMA)
   - Strategy B: Breakout Trigger (entering on decisive pivot clearance with RVOL >= 1.4x)
4. Specify the exact invalidation level where the bullish setup fails.
${(!dossier.executionPlan?.available || dossier.technicals?.rsi14 == null || dossier.fundamentals?.eps == null) ? `5. DATA INTEGRITY MANDATE: Key analytical inputs are missing or marked UNAVAILABLE (${dossier.executionPlan?.reason || 'unverified fundamentals or short price series'}).
   - Cap "confidenceScore" at 45 maximum.
   - Verdict MUST be "HOLD / TRAIL STOPS" or "AVOID / BULL TRAP" — never "STRONG BUY".
   - In "executiveSummary" and "executionPlan", explicitly state that trades should NOT be initiated until missing inputs are verified.
` : ''}5. Return your response as a STRICT, VALID JSON object with the following schema:

{
  "symbol": "${dossier.symbol}",
  "dataIntegrityNotice": "${(!dossier.executionPlan?.available || dossier.technicals?.rsi14 == null) ? 'INCOMPLETE_DATA_WARNING: Key indicators or history unavailable' : 'VERIFIED'}",
  "verdict": "STRONG BUY" | "ACCUMULATE ON PULLBACK" | "COILED BASE" | "AWAIT BREAKOUT TRIGGER" | "HOLD / TRAIL STOPS" | "AVOID / BULL TRAP",
  "confidenceScore": number (0 to 100),
  "executiveSummary": "Concise 2-3 sentence institutional synthesis",
  "technicalPosture": "Detailed technical analysis of RSI, MACD, EMAs, and Bollinger Squeeze",
  "smartMoneyFlow": "Analysis of BCR3, broker accumulation, and operator offloading check",
  "executionPlan": {
    "recommendedStrategy": "Pullback Dip Entry" | "Breakout Momentum" | "Stand Aside",
    "pullbackDipZone": "Rs. X – Rs. Y",
    "breakoutTrigger": "> Rs. Z (Chase cap: Rs. W)",
    "stopLoss": "Rs. SL (-X.X%)",
    "target1": "Rs. T1 (+X.X% net)",
    "target2": "Rs. T2 (+X.X% net)",
    "riskRewardRatio": "1 : X.X"
  },
  "scenarios": {
    "bullishCase": "Conditions and catalysts for target achievement",
    "baseCase": "Most likely market progression over next 5-15 sessions",
    "bearishInvalidation": "Specific price or flow trigger that terminates the trade"
  },
  "t2SettlementRisk": "Assessment of delivery lockup risk and circuit proximity",
  "nepaliSummary": "संक्षिप्त नेपाली विश्लेषण र खरिद/बिक्री सल्लाह"
}

Return ONLY the raw JSON object. No markdown fences, no explanatory prefixes.`;
}
