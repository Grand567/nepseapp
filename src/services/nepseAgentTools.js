/**
 * NEPSE Agent Client SDK & Tool Connector
 * ─────────────────────────────────────────────────────────────────────────────
 * src/services/nepseAgentTools.js
 *
 * Connects frontend components (Predictor Hub, AI Analyst, Stock Detail)
 * to the backend Agent Tools and Gemini 3.1 Pro reasoning engine.
 * Fully resilient with client-side quantitative calculation fallback.
 */

import {
  fetchFromBackend,
  fetchTodayPrice,
  fetchPriceHistory,
  fetchStockFundamentals,
  fetchRealBrokerAnalysis,
  getProxyBase
} from '../utils/liveData.js';
import { fetchStockSnapshot } from './stockSnapshot.js';
import {
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateBollingerBands
} from '../utils/indicators.js';
import { calculateATR } from '../utils/quantEngine.js';
import { generateEntryExitPlan } from '../utils/setupAnalyzer.js';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse';

const UNIVERSE_LIST = Array.isArray(NEPSE_UNIVERSE)
  ? NEPSE_UNIVERSE
  : (NEPSE_UNIVERSE?.stocks || []);

const UNIVERSE_MAP = new Map(
  UNIVERSE_LIST.map(u => [String(u.symbol || '').toUpperCase().trim(), u])
);

/**
 * Retrieves the complete verified quantitative dossier for a scrip.
 * Returns technical indicators, broker flow, execution geometry, and fundamentals.
 *
 * @param {string} symbol - Stock symbol (e.g. "KBL", "HDL", "SBL")
 * @returns {Promise<object>} Complete analytical dossier
 */
export async function fetchAgentScripDossier(symbol) {
  const normSym = String(symbol || '').toUpperCase().trim();
  if (!normSym) throw new Error('Symbol is required');

  // 1. Primary: Try backend /api/agent/stock/:symbol
  try {
    const res = await fetchFromBackend(`/api/agent/stock/${encodeURIComponent(normSym)}`, 8000);
    if (res && res.success && res.data && res.data.quote && res.data.quote.ltp > 0) {
      return res.data;
    }
  } catch (err) {
    console.warn(`[agentTools] Backend /api/agent/stock/${normSym} unavailable, using client quant engine:`, err.message);
  }

  // 2. Client-side verified aggregator fallback:
  // Use real multi-source exchange endpoints so data is ALWAYS authentic, never fake.
  const uItem = UNIVERSE_MAP.get(normSym) || {};

  const [todayPriceRes, historyRes, fundRes, brokerRes] = await Promise.allSettled([
    fetchTodayPrice(normSym),
    fetchPriceHistory(normSym, 120),
    fetchStockSnapshot(normSym),
    fetchRealBrokerAnalysis(normSym, 30)
  ]);

  const liveQuote = todayPriceRes.status === 'fulfilled' && todayPriceRes.value ? todayPriceRes.value : null;
  const rawCandles = historyRes.status === 'fulfilled' && Array.isArray(historyRes.value)
    ? historyRes.value
    : (historyRes.status === 'fulfilled' && Array.isArray(historyRes.value?.data) ? historyRes.value.data : []);
  const fundamentals = fundRes.status === 'fulfilled' && fundRes.value ? fundRes.value : {};
  const broker = brokerRes.status === 'fulfilled' && brokerRes.value ? brokerRes.value : null;

  // Derive authentic current price (no invented default)
  const ltpRaw = Number(
    liveQuote?.ltp ??
    liveQuote?.closePrice ??
    liveQuote?.lastTradedPrice ??
    liveQuote?.data?.ltp ??
    rawCandles[rawCandles.length - 1]?.close ??
    NaN
  );
  if (!isFinite(ltpRaw) || ltpRaw <= 0) {
    throw new Error(`Live price for ${normSym} is unavailable right now. Analysis was not generated to avoid using invented data.`);
  }
  const ltp = ltpRaw;

  const prevClose = Number(
    liveQuote?.prevClose ??
    liveQuote?.previousClose ??
    (rawCandles.length > 1 ? rawCandles[rawCandles.length - 2]?.close : ltp) ??
    ltp
  );

  const pChange = Number(
    liveQuote?.pChange ??
    liveQuote?.percentageChange ??
    (prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0)
  );

  const volRaw = Number(
    liveQuote?.totalTradedQuantity ??
    liveQuote?.volume ??
    rawCandles[rawCandles.length - 1]?.volume ??
    NaN
  );
  const volume = isFinite(volRaw) ? volRaw : null;

  // 10% statutory NEPSE daily equity circuit band limits
  const circuitFloor = +(prevClose * 0.90).toFixed(1);
  const circuitCeiling = +(prevClose * 1.10).toFixed(1);

  // Prepare candles
  const candles = rawCandles.map(c => ({
    date: c.date || c.t || '',
    open: Number(c.open ?? c.o ?? c.close ?? c.c ?? ltp),
    high: Number(c.high ?? c.h ?? c.close ?? c.c ?? ltp),
    low: Number(c.low ?? c.l ?? c.close ?? c.c ?? ltp),
    close: Number(c.close ?? c.c ?? ltp),
    volume: Number(c.volume ?? c.v ?? c.totalTradeQuantity ?? 0)
  })).filter(c => isFinite(c.close) && c.close > 0);

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  // Calculate quantitative indicators — null when history is insufficient (never invented)
  const rsiVal = closes.length >= 15 ? calculateRSI(closes, 14) : null;
  const validE20 = closes.length >= 20 ? calculateEMA(closes, 20).filter(v => v !== null && isFinite(v)) : [];
  const ema20Val = validE20.length > 0 ? validE20[validE20.length - 1] : null;
  const validE50 = closes.length >= 50 ? calculateEMA(closes, 50).filter(v => v !== null && isFinite(v)) : [];
  const ema50Val = validE50.length > 0 ? validE50[validE50.length - 1] : null;
  const macdObj = closes.length >= 35 ? calculateMACD(closes) : null;
  const bbObj = closes.length >= 20 ? calculateBollingerBands(closes, 20, 2) : null;
  const atrVal = candles.length >= 15 ? calculateATR(candles, 14) : null;

  const recent20Vols = volumes.slice(-20);
  const avgVol20 = recent20Vols.length >= 5
    ? Math.round(recent20Vols.reduce((a, b) => a + b, 0) / recent20Vols.length)
    : null;
  const rvol20 = (avgVol20 && volume != null) ? +(volume / avgVol20).toFixed(2) : null;

  // Broker smart money metrics — computed only from the real broker feed
  const topBuyers = Array.isArray(broker?.topBuyers) ? broker.topBuyers : (Array.isArray(broker?.buyers) ? broker.buyers : []);
  const topSellers = Array.isArray(broker?.topSellers) ? broker.topSellers : (Array.isArray(broker?.sellers) ? broker.sellers : []);
  const totalVol = Number(broker?.totalVolume || broker?.totalQty || 0);
  const sumQty = (arr, n, keys) => arr.slice(0, n).reduce((acc, b) => acc + Number(keys.map(k => b[k]).find(v => v != null) || 0), 0);
  const top3BuyVol = sumQty(topBuyers, 3, ['buyQty', 'volume', 'shares']);
  const top5BuyVol = sumQty(topBuyers, 5, ['buyQty', 'volume', 'shares']);
  const top3SellVol = sumQty(topSellers, 3, ['sellQty', 'volume', 'shares']);
  const pctOf = (v) => (totalVol > 0 && v > 0) ? +((v / totalVol) * 100).toFixed(1) : null;
  const bcr3Buy = broker?.bcr3BuyPct != null ? Number(broker.bcr3BuyPct) : pctOf(top3BuyVol);
  const bcr5Buy = broker?.bcr5BuyPct != null ? Number(broker.bcr5BuyPct)
    : (broker?.crb5 != null ? +((Number(broker.crb5) <= 1 ? Number(broker.crb5) * 100 : Number(broker.crb5))).toFixed(1) : pctOf(top5BuyVol));
  const bcr3Sell = broker?.bcr3SellPct != null ? Number(broker.bcr3SellPct) : pctOf(top3SellVol);
  const smartMoneyBias = bcr3Buy == null
    ? 'Broker data unavailable'
    : (bcr3Buy >= 40 ? 'Institutional Cornering' : ((bcr3Sell ?? 0) >= 45 ? 'Operator Offloading' : 'Neutral Flow'));

  // Run authentic execution geometry through setupAnalyzer
  const stockForPlan = {
    symbol: normSym,
    ltp,
    prevClose,
    previousClose: prevClose,
    pChange,
    volume,
    high52w: Number(liveQuote?.high52w || uItem.high52 || 0),
    low52w: Number(liveQuote?.low52w || uItem.low52 || 0),
    sector: uItem.sector || fundamentals.sector || 'Others',
    companyName: uItem.name || liveQuote?.companyName || normSym,
    eps: Number(fundamentals.eps || liveQuote?.eps || uItem.eps || 0),
    pe: Number(fundamentals.pe || liveQuote?.pe || 0),
    bookValue: Number(fundamentals.bookValue || liveQuote?.bookValue || uItem.bvps || 0)
  };

  const plan = generateEntryExitPlan(stockForPlan, candles.length >= 10 ? candles : [], [], { brokerAnalysis: broker });
  const levels = plan.levels || {};

  return {
    symbol: normSym,
    companyName: stockForPlan.companyName,
    sector: stockForPlan.sector,
    quote: {
      ltp,
      prevClose,
      pChange,
      volume,
      turnover: Number(liveQuote?.turnover || 0),
      circuitFloor,
      circuitCeiling,
      high52w: stockForPlan.high52w,
      low52w: stockForPlan.low52w,
      avgVolume20D: avgVol20
    },
    technicals: {
      candlesAnalyzed: closes.length,
      rsi14: (rsiVal != null && isFinite(rsiVal)) ? +Number(rsiVal).toFixed(1) : null,
      macd: macdObj ? {
        line: +Number(macdObj.macd ?? 0).toFixed(2),
        signal: +Number(macdObj.signal ?? 0).toFixed(2),
        histogram: +(Number(macdObj.macd ?? 0) - Number(macdObj.signal ?? 0)).toFixed(2),
        isBullishCross: Boolean(Number(macdObj.macd) > Number(macdObj.signal))
      } : null,
      ema20: ema20Val != null ? +Number(ema20Val).toFixed(1) : null,
      ema50: ema50Val != null ? +Number(ema50Val).toFixed(1) : null,
      trendStructure: (ema20Val == null || ema50Val == null)
        ? 'INSUFFICIENT_HISTORY'
        : (ltp >= ema20Val && ema20Val >= ema50Val ? 'BULLISH_STACK' : (ltp < ema20Val && ema20Val < ema50Val ? 'BEARISH_STACK' : 'NEUTRAL_CONSOLIDATION')),
      atr14: (atrVal != null && isFinite(atrVal)) ? +Number(atrVal).toFixed(1) : null,
      rvol20,
      bollinger: bbObj ? {
        upper: +Number(bbObj.upper || 0).toFixed(1),
        middle: +Number(bbObj.middle || 0).toFixed(1),
        lower: +Number(bbObj.lower || 0).toFixed(1),
        isSqueeze: Boolean(bbObj.upper && bbObj.lower && ((bbObj.upper - bbObj.lower) / bbObj.middle) < 0.08)
      } : null
    },
    brokerFlow: {
      bcr3BuyPct: bcr3Buy,
      bcr5BuyPct: bcr5Buy,
      bcr3SellPct: bcr3Sell,
      smartMoneyBias,
      available: bcr3Buy != null
    },
    fundamentals: {
      pe: stockForPlan.pe,
      eps: stockForPlan.eps,
      bookValue: stockForPlan.bookValue
    },
    executionPlan: (() => {
      const hasLevels = plan.supported !== false && levels.stopLoss?.price != null && levels.target1?.price != null;
      if (!hasLevels) {
        return {
          available: false,
          reason: plan.reason || `Only ${candles.length} sessions of history — at least 20 are required for entry/exit levels.`,
          stance: 'INSUFFICIENT DATA',
          setupScore: null,
          pullbackZone: null,
          breakoutZone: null,
          stopLoss: null,
          targets: [],
          riskPerShare: null,
          rewardToTarget1: null
        };
      }
      const toTarget = (t, label) => t?.price != null ? {
        price: t.price,
        netReturnPct: t.netReturnPct ?? null,
        label
      } : null;
      return {
        available: true,
        stance: plan.verdict || 'HOLD / WAIT',
        setupScore: plan.setupScore ?? null,
        pullbackZone: levels.pullbackZone ? {
          low: levels.pullbackZone.low,
          high: levels.pullbackZone.high,
          label: levels.pullbackZone.label,
          supportRef: levels.pullbackZone.supportRef
        } : null,
        breakoutZone: levels.breakoutZone ? {
          pivot: levels.breakoutZone.pivot ?? levels.breakoutPivot,
          chaseCap: levels.breakoutZone.chaseCap ?? levels.chaseCap,
          label: `> Rs. ${levels.breakoutZone.pivot ?? levels.breakoutPivot} (Cap: Rs. ${levels.breakoutZone.chaseCap ?? levels.chaseCap})`
        } : null,
        stopLoss: {
          price: levels.stopLoss.price,
          pct: levels.stopLoss.pct ?? +(((ltp - levels.stopLoss.price) / ltp) * 100).toFixed(1),
          label: levels.stopLoss.label || `Rs. ${levels.stopLoss.price}`
        },
        targets: [
          toTarget(levels.target1, 'Target 1'),
          toTarget(levels.target2, 'Target 2')
        ].filter(Boolean),
        riskPerShare: levels.riskPerShare ?? null,
        rewardToTarget1: levels.rewardToTarget1 ?? null
      };
    })(),
    meta: {
      asOf: new Date().toISOString(),
      dataSource: 'Official NEPSE Feed & NOTS Live Floor Sheet'
    }
  };
}

/**
 * Runs an intelligent, evidence-based analysis for a stock using Gemini 3.1 Pro.
 *
 * @param {object} params
 * @param {string} params.symbol - Stock symbol (e.g. "KBL", "SBL")
 * @param {string} [params.query] - Custom user inquiry or prompt
 * @param {string} [params.model='gemini-3.1-pro'] - Target Gemini model
 * @param {string} [params.apiKey] - Optional custom Gemini API key
 * @returns {Promise<object>} Structured Agent verdict, execution levels, and scenarios
 */
export async function runAgentAnalysis({
  symbol,
  query = '',
  model = 'gemini-3.1-pro',
  apiKey = null
}) {
  const normSym = String(symbol || '').toUpperCase().trim();
  if (!normSym) throw new Error('Symbol is required');

  const base = getProxyBase();
  const clientKey = apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_gemini_api_key') || localStorage.getItem('nepse_hub_gemini_api_key') || '') : '');

  // Always assemble authentic dossier first
  const dossier = await fetchAgentScripDossier(normSym);

  // 1. Primary: Try backend /api/agent/analyze
  try {
    const res = await fetch(`${base}/api/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: normSym,
        query,
        model,
        apiKey: clientKey || undefined
      })
    });

    if (res.ok) {
      const json = await res.json();
      if (json && json.success) {
        const payloadData = json.analysis || json.data || {};
        return {
          ...payloadData,
          dossier: json.dossier || dossier,
          meta: {
            modelUsed: json.modelUsed || json.provider || model,
            isAiOffline: json.isAiOffline || false,
            durationMs: json.durationMs,
            timestamp: json.timestamp || new Date().toISOString()
          }
        };
      }
    }
  } catch (err) {
    console.warn(`[agentTools] /api/agent/analyze request failed, evaluating direct client reasoning:`, err.message);
  }

  // Null-safe accessors — never invent values; show N/A when unavailable.
  const NA = 'N/A';
  const fmt = (v, suffix = '') => (v === null || v === undefined || Number.isNaN(v)) ? NA : `${v}${suffix}`;
  const ep = dossier.executionPlan || { available: false, reason: 'Execution plan unavailable', stance: 'INSUFFICIENT DATA', targets: [] };
  const tech = dossier.technicals || {};
  const bf = dossier.brokerFlow || {};
  const q = dossier.quote || {};
  const pullLbl = ep.pullbackZone?.label || NA;
  const boLbl = ep.breakoutZone?.label || NA;
  const slLbl = ep.stopLoss?.label || NA;
  const slPx = ep.stopLoss?.price ?? null;
  const tLbl = (t) => t?.price != null ? `Rs. ${t.price}${t.netReturnPct != null ? ` (${t.netReturnPct >= 0 ? '+' : ''}${t.netReturnPct}% net)` : ''}` : NA;
  const t1 = tLbl(ep.targets?.[0]);
  const t2 = tLbl(ep.targets?.[1]);
  const rr = (ep.riskPerShare > 0 && ep.rewardToTarget1 != null) ? `1 : ${(ep.rewardToTarget1 / ep.riskPerShare).toFixed(2)}` : NA;

  // 2. Client-side Direct Gemini API Call if user key is available
  if (clientKey) {
    try {
      const prompt = `You are the Drabyashree NEPSE Analysis Agent for NEPSE scrip ${dossier.symbol} (${dossier.companyName}).
Use ONLY the data below. Values marked N/A are unavailable — do not estimate or invent them.
Current LTP: Rs. ${fmt(q.ltp)} (Change: ${fmt(q.pChange, '%')}).
RSI(14): ${fmt(tech.rsi14)}, MACD Histogram: ${fmt(tech.macd?.histogram)}, 20-EMA: ${fmt(tech.ema20)}, 50-EMA: ${fmt(tech.ema50)}.
BCR3 Concentration: ${fmt(bf.bcr3BuyPct, '%')}, Bias: ${bf.smartMoneyBias || NA}.
Execution plan available: ${ep.available ? 'yes' : `no (${ep.reason})`}. Pullback: ${pullLbl}, Breakout: ${boLbl}, Stop-Loss: ${slLbl}.
Target 1: ${t1}, Target 2: ${t2}. Risk:Reward: ${rr}.
Circuit limits (±10% of previous close): Floor Rs. ${fmt(q.circuitFloor)} | Ceiling Rs. ${fmt(q.circuitCeiling)}.
User Query: "${query || 'Provide trade plan and scenarios.'}"

Return valid JSON with keys:
{"symbol":"${dossier.symbol}","verdict":"${ep.stance}","confidenceScore":${ep.setupScore ?? null},"executiveSummary":"...","technicalPosture":"...","smartMoneyFlow":"...","executionPlan":{"recommendedStrategy":"...","pullbackDipZone":"${pullLbl}","breakoutTrigger":"${boLbl}","stopLoss":"${slLbl}","target1":"${t1}","target2":"${t2}","riskRewardRatio":"${rr}"},"scenarios":{"bullishCase":"...","baseCase":"...","bearishInvalidation":"..."},"t2SettlementRisk":"...","nepaliSummary":"..."}`;

      const modelsToTry = [model, 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const m of modelsToTry) {
        try {
          const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${clientKey}`;
          const directRes = await fetch(directUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' }
            })
          });
          if (directRes.ok) {
            const data = await directRes.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = JSON.parse(text);
              return {
                ...parsed,
                dossier,
                meta: { modelUsed: m, isDirectClientGemini: true, timestamp: new Date().toISOString() }
              };
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 3. Deterministic fallback — reports only computed values; N/A where data is missing.
  const pivotVal = ep.breakoutZone?.pivot ?? null;
  const atrVal = tech.atr14 ?? null;
  return {
    symbol: normSym,
    verdict: ep.stance,
    confidenceScore: ep.setupScore ?? null,
    executiveSummary: `${dossier.symbol} (${dossier.companyName}) is trading at Rs. ${fmt(q.ltp)} (${q.pChange >= 0 ? '+' : ''}${fmt(q.pChange)}%). Trend structure: ${tech.trendStructure || NA}; 20-EMA: ${fmt(tech.ema20)}.${ep.available ? ` Setup score: ${fmt(ep.setupScore)}/100.` : ` Trade plan unavailable: ${ep.reason}`}`,
    technicalPosture: `RSI(14): ${fmt(tech.rsi14)}, MACD histogram: ${fmt(tech.macd?.histogram)}. Bollinger squeeze: ${tech.bollinger ? (tech.bollinger.isSqueeze ? 'Active' : 'No') : NA}. 20-day relative volume: ${fmt(tech.rvol20, 'x')}.`,
    smartMoneyFlow: bf.available ? `BCR3 buyer concentration ${bf.bcr3BuyPct}% (${bf.smartMoneyBias}). Top-5 broker concentration ${fmt(bf.bcr5BuyPct, '%')}.` : 'Broker floorsheet data unavailable.',
    executionPlan: {
      recommendedStrategy: !ep.available ? 'No plan — insufficient data' : (String(ep.stance).includes('BREAKOUT') ? 'Breakout Momentum' : 'Pullback Dip Entry'),
      pullbackDipZone: pullLbl,
      breakoutTrigger: boLbl,
      stopLoss: slLbl,
      target1: t1,
      target2: t2,
      riskRewardRatio: rr
    },
    scenarios: {
      bullishCase: (pivotVal != null && atrVal != null)
        ? `High-volume close above breakout pivot Rs. ${pivotVal} (RVOL > 1.4x) opens a move toward ~Rs. ${+(pivotVal + atrVal * 1.5).toFixed(1)} (pivot + 1.5×ATR).`
        : 'Bullish scenario unavailable — breakout pivot or ATR not computable from available history.',
      baseCase: ep.pullbackZone ? `Consolidation within support corridor ${pullLbl}.` : 'Base case unavailable — no support corridor computed.',
      bearishInvalidation: slPx != null ? `Daily close below stop-loss Rs. ${slPx} invalidates the setup.` : 'Invalidation level unavailable.'
    },
    t2SettlementRisk: `Session circuit range Rs. ${fmt(q.circuitFloor)} to Rs. ${fmt(q.circuitCeiling)} (±10%). Avoid buying near the ceiling due to T+2 settlement lockup.`,
    nepaliSummary: ep.available
      ? `${dossier.symbol}: स्टप लस Rs. ${fmt(slPx)}, पुलब्याक जोन ${pullLbl}। २०-दिने EMA ${fmt(tech.ema20)}।`
      : `${dossier.symbol}: पर्याप्त डाटा नभएकाले ट्रेड योजना उपलब्ध छैन।`,
    dossier,
    meta: {
      modelUsed: 'QuantEngine-Deterministic',
      isAiOffline: true,
      timestamp: new Date().toISOString()
    }
  };
}
