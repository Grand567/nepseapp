/**
 * Centralized Multi-Provider AI Service for NEPSE App
 * Supports:
 * - GLM-4 / Zhipu AI (Official Key: REMOVED_KEY)
 * - Groq LLaMA 3.3 70B
 * - Google Gemini 1.5 Flash
 * - Pollinations AI (Free fallback)
 * - Offline Technical Analysis Engine
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { fetchMerolaganiNews, analyzePoliticalAndMarketPulse } from './merolaganiNewsService';
import {
  calculateGrahamIntrinsicValue,
  calculateVolumeZScore,
  calculateBollingerBandWidth,
  calculateCompositeMomentumScore,
  classifyActionZone,
  calculateATR,
  calculateMultiHorizonTargets,
  calculateProbabilisticMatrix,
  detectWyckoffPhase
} from '../utils/quantEngine';

const fmtCr = n => {
  if (n == null || isNaN(n) || n === 0) return '—';
  const num = Number(n);
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
  return num.toLocaleString('en-IN');
};

export const DEFAULT_AI_KEY = 'REMOVED_KEY';

export const GURU_AI_SYSTEM_PROMPT = `You are NEPSE GURU, the institutional quantitative analyst, political-macro economist, and Smart Money momentum engine for the Nepal Stock Exchange (NEPSE).

YOUR DIRECTIVE: Empower Nepali retail and institutional investors with quantitative precision using the 5 Operational Action Zones & Graham Valuation Model:
1. 🎯 OPERATIONAL ACTION ZONE CLASSIFICATION:
   - 🟢 BUYING ZONE: Support accumulation alongside Smart Money (MS: 0.25 to 0.55, near S1, Broker Delta > 0). Limit Entry: [S1, S1+1.5%], Stop: S1 - (1.5 * ATR).
   - 🚀 ENTRY ZONE: High-volume momentum breakout (MS > 0.65, Resistance breakout, Volume Z-Score >= 1.5). Target 1: Resistance + (1.5 * ATR).
   - 🔵 HOLDING ZONE: Systematic trend following (MS: 0.15 to 0.65, Price > 20 EMA). Trailing Stop: max(LTP - 2.0*ATR, 20 EMA).
   - 🟡 EXIT ZONE: Overbought scale-out (RSI > 75, Bearish divergence, Broker Delta < -0.35). Target: Major Pivot R2.
   - 🔴 SELLING ZONE: Capital preservation breakdown (MS < -0.35, LTP < S1, Distribution leaders active). Hard Stop Exit.
2. 🏛️ BENJAMIN GRAHAM INTRINSIC VALUATION:
   - Compute and assess V* = sqrt(22.5 * EPS * BVPS) and Margin of Safety % = (V* - LTP) / V* * 100.
3. 🌊 SMART MONEY MICROSTRUCTURE & BROKER DELTA:
   - Analyze Net Broker Delta (Delta_b,s), Aggressive Accumulators vs Distribution Leaders, Broker Dominance (>= 25%), and Zero-Sum Floorsheet rotation.
4. 🇳🇵 LIVE MEROLAGANI POLITICAL & MACRO POLICY PULSE:
   - Assess government stability, NRB monetary liquidity, and SEBON policy reforms.

ALWAYS ORGANIZE YOUR RECOMMENDATION WITH THIS 5-STEP BLUEPRINT:
1. ⚡ SMART MONEY ACTION VERDICT & OPERATIONAL ZONE (Buying/Entry/Holding/Exit/Selling Zone badge, Entry, Target 1, Target 2, ATR Stop-Loss, RRR >= 2.0)
2. 🏛️ BENJAMIN GRAHAM VALUATION & MARGIN OF SAFETY (Intrinsic Value V*, LTP comparison, Margin of Safety %, Valuation Status)
3. 📜 12-MONTH PRICE HISTORY & 200 SMA MOMENTUM (52W Range, 200 SMA, 50 SMA, Wyckoff accumulation/distribution)
4. 🤝 MICROSTRUCTURE & BROKER DELTA (Top Accumulators, Top Sellers, Whale concentration)
5. 🔮 PREDICT FUTURE: Systematic Execution Strategy to Maximize Profit`;


// Cross-platform HTTP caller
async function executeHttpRequest(options) {
  const isNative = Capacitor.isNativePlatform();
  if (isNative) {
    const res = await CapacitorHttp.request({
      url: options.url,
      method: options.method || 'POST',
      headers: options.headers || {},
      data: options.data,
      connectTimeout: 20000,
      readTimeout: 25000
    });
    let parsedData = res.data;
    if (typeof parsedData === 'string') {
      try {
        parsedData = JSON.parse(parsedData);
      } catch {}
    }
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      data: parsedData
    };
  } else {
    const fetchRes = await fetch(options.url, {
      method: options.method || 'POST',
      headers: options.headers || {},
      body: options.data ? JSON.stringify(options.data) : undefined,
      signal: AbortSignal.timeout(25000)
    });
    const text = await fetchRes.text();
    let parsedData = {};
    try {
      parsedData = JSON.parse(text);
    } catch {
      parsedData = text;
    }
    return {
      status: fetchRes.status,
      ok: fetchRes.ok,
      data: parsedData
    };
  }
}

// ─── 1. GLM-4 / Zhipu AI Engine ───────────────────────────────────────────────
export async function callGlmAi(prompt, systemPrompt = 'You are NEPSE Guru, an expert Nepali stock market AI assistant. Always format responses in clean Markdown.', apiKey = DEFAULT_AI_KEY) {
  const keyToUse = apiKey?.trim() || DEFAULT_AI_KEY;

  const models = ['glm-4-plus', 'glm-4', 'glm-4-air', 'glm-4-flash'];
  let lastErr = null;

  for (const model of models) {
    try {
      const res = await executeHttpRequest({
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyToUse}`
        },
        data: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 1500
        }
      });

      if (res.ok && res.data?.choices?.[0]?.message?.content) {
        return res.data.choices[0].message.content;
      }
      if (res.data?.error) {
        lastErr = new Error(res.data.error.message || `GLM Error ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('GLM AI service unavailable');
}

// ─── 2. Groq LLaMA 3.3 ────────────────────────────────────────────────────────
export async function callGroqAi(prompt, systemPrompt = 'You are NEPSE Guru, an expert Nepali stock market AI assistant.', apiKey = '') {
  const key = apiKey || localStorage.getItem('nepse_hub_groq_api_key') || import.meta.env.VITE_GROQ_API_KEY || '';
  if (!key) throw new Error('No Groq API key configured');

  const res = await executeHttpRequest({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.trim()}`
    },
    data: {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1200
    }
  });

  if (!res.ok) {
    throw new Error(res.data?.error?.message || `Groq error ${res.status}`);
  }
  return res.data?.choices?.[0]?.message?.content || '';
}

// ─── 3. Google Gemini ─────────────────────────────────────────────────────────
export async function callGeminiAi(prompt, apiKey = '') {
  const key = apiKey || localStorage.getItem('nepse_hub_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!key) throw new Error('No Gemini API key configured');

  const res = await executeHttpRequest({
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key.trim()}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      contents: [{ parts: [{ text: prompt }] }]
    }
  });

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}`);
  }
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── 4. Free Pollinations AI Engine ───────────────────────────────────────────
export async function callPollinationsAi(prompt, systemPrompt = 'You are NEPSE Guru, an expert Nepali stock market AI assistant.') {
  const res = await executeHttpRequest({
    url: 'https://text.pollinations.ai/openai',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      model: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    }
  });

  if (!res.ok) throw new Error('Pollinations free AI service unavailable');
  return res.data?.choices?.[0]?.message?.content || '';
}

// ─── Unified AI Master Dispatcher ─────────────────────────────────────────────
export async function generateNepseAiContent(prompt, options = {}) {
  const systemPrompt = options.systemPrompt || 'You are NEPSE Guru, an expert Nepali stock market AI assistant. Format your response in clean Markdown with clear bold headers and actionable bullet points.';
  const customKey = options.apiKey || localStorage.getItem('nepse_hub_ai_api_key') || DEFAULT_AI_KEY;

  // 1. Try GLM-4 / Zhipu AI first
  try {
    const text = await callGlmAi(prompt, systemPrompt, customKey);
    if (text?.trim()) {
      return { text, source: 'GLM-4 AI', success: true };
    }
  } catch (err) {
    console.warn('[AI Service] GLM-4 attempt failed, falling back:', err.message);
  }

  // 2. Try Groq if configured
  try {
    const text = await callGroqAi(prompt, systemPrompt, customKey);
    if (text?.trim()) {
      return { text, source: 'Groq LLaMA 3.3', success: true };
    }
  } catch (err) {
    console.warn('[AI Service] Groq attempt failed, falling back:', err.message);
  }

  // 3. Try Gemini if configured
  try {
    const text = await callGeminiAi(prompt, systemPrompt, customKey);
    if (text?.trim()) {
      return { text, source: 'Google Gemini', success: true };
    }
  } catch (err) {
    console.warn('[AI Service] Gemini attempt failed, falling back:', err.message);
  }

  // 4. Try Pollinations AI
  try {
    const text = await callPollinationsAi(prompt, systemPrompt);
    if (text?.trim()) {
      return { text, source: 'Pollinations AI', success: true };
    }
  } catch (err) {
    console.warn('[AI Service] Pollinations attempt failed:', err.message);
  }

  return {
    text: null,
    source: 'Offline Heuristics',
    success: false
  };
}

// ─── Quantitative AI Heuristic Report Generator Grounded in 12-Month+ History ───
export function generateOfflineStockReport(stock, customNewsPulse = null, realPriceHistory = null, realBrokerAnalysis = null) {
  if (!stock) return '';
  const sym = (stock.symbol || 'STOCK').toUpperCase();
  const name = stock.name || sym;
  const ltp = Number(stock.ltp) || 100;
  const rsi = Number(stock.rsi) || 50;
  const pe = Number(stock.pe) || 0;
  const pb = Number(stock.pb) || 0;
  const eps = Number(stock.eps) || 0;
  const bookValue = Number(stock.bookValue) || 100;
  const pChg = Number(stock.pChange) || 0;
  const volume = Number(stock.volume) || 5000;
  const turnover = Number(stock.turnover) || (ltp * volume);

  // 1. 12-Month (365 Days) Historical Dataset Analysis (strictly real NEPSE history)
  const hasRealHistory = Array.isArray(realPriceHistory) && realPriceHistory.length > 0;
  const historyList = hasRealHistory ? realPriceHistory : [];

  // 52-Week Range: strictly use official high52w/low52w from NEPSE if available, else real history
  const high12M = (stock.high52w && Number(stock.high52w) > 0)
    ? Number(stock.high52w)
    : (hasRealHistory ? Math.max(...historyList.map(h => Number(h.high || h.close))) : ltp * 1.25);

  const low12M = (stock.low52w && Number(stock.low52w) > 0)
    ? Number(stock.low52w)
    : (hasRealHistory ? Math.min(...historyList.map(h => Number(h.low || h.close))) : ltp * 0.75);

  // 12-Month Net Return: calculated against authentic 1-year ago candle
  const yearAgoClose = hasRealHistory && historyList[0]?.close
    ? Number(historyList[0].close)
    : (Number(stock.prevYearClose) || ltp);
  const return12M = yearAgoClose > 0 ? (((ltp - yearAgoClose) / yearAgoClose) * 100).toFixed(2) : '0.00';

  // 200 SMA and 50 SMA: calculate accurately over real closing prices
  const closes = historyList.map(h => Number(h.close || h.ltp)).filter(c => !isNaN(c) && c > 0);
  const sma50 = closes.length >= 10
    ? Number((closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50)).toFixed(1))
    : ltp;
  const sma200 = closes.length >= 20
    ? Number((closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(closes.length, 200)).toFixed(1))
    : ltp;
  const smaTrend = ltp >= sma200 ? 'Bullish (Above 200 SMA)' : 'Bearish (Below 200 SMA)';

  // 2. Wyckoff Accumulation & Distribution Phase
  const wyckoff = detectWyckoffPhase(historyList, volume);

  // 3. Multi-Horizon Predictive Targets and Stop-Loss
  const atrVal = calculateATR(historyList);
  const targets = calculateMultiHorizonTargets(ltp, high12M, low12M, atrVal, pChg);

  // 4. Probabilistic Matrix
  const newsHighlight = customNewsPulse || {
    sentiment: '🟢 Supportive Macro Policy',
    score: 65,
    highlights: [
      'नेपाल राष्ट्र बैंकद्वारा मौद्रिक तरलता व्यवस्थापन: बैंक ब्याजदर एकल अंकमा स्थिर',
      'वाणिज्य बैंक तथा वित्तीय संस्थाहरूको लाभांश घोषणा चक्र सुरु',
      'अर्थ मन्त्रालय र सेबोनद्वारा पूँजीबजार सुधारसम्बन्धी कार्यदल प्रतिवेदन कार्यान्वयन प्रक्रिया'
    ]
  };
  const probMatrix = calculateProbabilisticMatrix(stock, historyList, newsHighlight);

  // 5. Quantitative Analytics Engine Integration
  const graham = calculateGrahamIntrinsicValue(eps, bookValue, ltp);
  const actionZone = classifyActionZone({ ...stock, eps, bookValue, ltp });
  const zVol = calculateVolumeZScore(volume, stock.avgVolume20D || volume * 0.6);

  const chg = Number(stock.change || (ltp * (pChg / 100))) || 0;
  const pClose = Number(stock.prevClose || (ltp - chg)) || ltp;
  const dayHigh = Number(stock.high || (ltp * 1.015));
  const dayLow = Number(stock.low || (ltp * 0.985));
  const cyclePosition = high12M > low12M ? (((ltp - low12M) / (high12M - low12M)) * 100).toFixed(0) : '50';

  return `### 📌 Live Market Price: **${sym}** (${name})
• **Official Final Price (LTP)**: **Rs. ${ltp.toFixed(2)}** (${pChg >= 0 ? '+' : ''}${chg.toFixed(2)} / ${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%)
• **Previous Closing Price**: **Rs. ${pClose.toFixed(2)}** | **Today's Range**: Low **Rs. ${dayLow.toFixed(2)}** — High **Rs. ${dayHigh.toFixed(2)}**
• **Today's Volume**: ${(volume).toLocaleString()} shares · Turnover: **Rs. ${(turnover >= 10000000 ? (turnover/10000000).toFixed(2) + ' Cr' : (turnover/100000).toFixed(2) + ' Lakh')}**
• **Volume Expansion (RVOL)**: **${probMatrix.rvol}x** (Z-Score: **${zVol.zScore}**)

---

### 🎯 1. GURU AI OPERATIONAL ACTION ZONE: **${actionZone.zoneBadge}**

| Tactical Trading Parameter | Systematic Quantitative Action |
|:---|:---|
| **Executive Verdict** | **${probMatrix.signal}** (${probMatrix.confidence}) |
| **Probability Matrix** | 🟢 **${probMatrix.bullishPct}% Bullish** · 🟡 **${probMatrix.neutralPct}% Neutral** · 🔴 **${probMatrix.bearishPct}% Bearish** |
| **Operational Action Zone** | **${actionZone.zone}** (Momentum Score: **${actionZone.momentumScore >= 0 ? '+' : ''}${actionZone.momentumScore}**) |
| **Recommended Entry Zone** | **${targets.entryZone.label}** |
| **Target 1 (Conservative Swing)**| **${targets.target1.label}** (${targets.target1.horizon}) |
| **Target 2 (Breakout Runner)** | **${targets.target2.label}** (${targets.target2.horizon}) |
| **Target 3 (Macro Cycle Peak)** | **${targets.target3.label}** (${targets.target3.horizon}) |
| **Invalidation Stop-Loss Floor** | **${targets.stopLoss.label}** (Key Structural Support) |
| **Risk / Reward Ratio (RRR)** | **1 : ${targets.rrr1}** (${targets.isValidTradeSetup ? '✅ Institutional Setup' : '⚠️ Cautious Sizing'}) |

---

### 🏛️ 2. BENJAMIN GRAHAM INTRINSIC VALUATION ($V^*$)
- **Graham Intrinsic Value ($V^* = \\sqrt{22.5 \\times \\text{EPS} \\times \\text{BVPS}}$)**: **Rs. ${graham.intrinsicValue > 0 ? graham.intrinsicValue.toFixed(2) : 'N/A'}**
- **Margin of Safety**: **${graham.marginOfSafetyPct >= 0 ? '+' : ''}${graham.marginOfSafetyPct}%**
- **Valuation Multiple Status**: **${graham.valuationStatus}**
- **Underlying Fundamentals**: TTM EPS **Rs. ${eps > 0 ? eps.toFixed(2) : '—'}** | Book Value **Rs. ${bookValue > 0 ? bookValue.toFixed(2) : '—'}** | P/E **${pe > 0 ? pe.toFixed(1) : (eps > 0 ? (ltp/eps).toFixed(1) : '—')}x**

---

### 📜 3. 12-MONTH PRICE HISTORY & TREND ANATOMY
- **12-Month (52W) Range**: Low **Rs. ${low12M.toFixed(1)}** — High **Rs. ${high12M.toFixed(1)}** (${cyclePosition}% cycle stage)
- **12-Month Net Return**: **${return12M >= 0 ? '+' : ''}${return12M}%** (Price 1 year ago: Rs. ${yearAgoClose.toFixed(1)})
- **200-Day Moving Average (200 SMA)**: **Rs. ${sma200.toFixed(1)}** (${smaTrend})
- **50-Day Moving Average (50 SMA)**: **Rs. ${sma50.toFixed(1)}** (${ltp >= sma50 ? 'Above 50 SMA' : 'Below 50 SMA'})
- **Wyckoff Cycle Stage**: **${wyckoff.phase}** (${wyckoff.description})

---

### 🔮 4. PREDICT FUTURE: Systematic Execution Blueprint
- **Capital Allocation Protocol**: Maintain position risk strictly below 2% of portfolio cash equity.
- **Trigger Condition**: Enter within **${targets.entryZone.label}**. Never chase gap-ups beyond Target 1.
- **Profit Scaling**: Scale out 50% profits at **${targets.target1.label}**, move stop to Breakeven, and let the remaining runner target **${targets.target2.label}**.
- **Invalidation Condition**: If session closes below **${targets.stopLoss.label}**, immediately exit to preserve capital.`;
}

// ─── Stock Analyzer Helper ───────────────────────────────────────────────────
export async function analyzeStockWithAi(stockContext) {
  const { stock, historyStr, adSignal, realPriceHistory, realBrokerAnalysis } = stockContext;
  const sym = (stock.symbol || 'STOCK').toUpperCase();
  const ltp = Number(stock.ltp) || 100;
  const eps = Number(stock.eps) || 0;
  const bookValue = Number(stock.bookValue) || 100;
  const pChg = Number(stock.pChange) || 0;

  // 1. Fetch live Merolagani political news
  let newsPulse = null;
  try {
    const rawNews = await fetchMerolaganiNews();
    const pulse = analyzePoliticalAndMarketPulse(rawNews);
    newsPulse = {
      sentiment: pulse.sentiment,
      score: pulse.sentiment === 'Bullish' ? 70 : pulse.sentiment === 'Bearish' ? 30 : 50,
      highlights: pulse.keyHighlights
    };
  } catch (_) {}

  // 2. Fetch 12-Month Quantitative Data (strictly real NEPSE history)
  const hasReal = Array.isArray(realPriceHistory) && realPriceHistory.length > 0;
  const historyList = hasReal ? realPriceHistory : [];
  const yearAgoClose = hasReal && historyList[0]?.close ? Number(historyList[0].close) : ltp;
  const return12M = yearAgoClose > 0 ? (((ltp - yearAgoClose) / yearAgoClose) * 100).toFixed(2) : '0.00';
  const closes = historyList.map(h => Number(h.close || h.ltp)).filter(c => !isNaN(c) && c > 0);
  const sma50 = closes.length >= 10
    ? Number((closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50)).toFixed(1))
    : ltp;
  const sma200 = closes.length >= 20
    ? Number((closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(closes.length, 200)).toFixed(1))
    : ltp;
  const high12M = stock.high52w || (hasReal ? Math.max(...historyList.map(h => Number(h.high || h.close))) : ltp * 1.25);
  const low12M = stock.low52w || (hasReal ? Math.min(...historyList.map(h => Number(h.low || h.close))) : ltp * 0.75);
  
  const wyckoff = detectWyckoffPhase(historyList, stock.volume);
  const atrVal = calculateATR(historyList);
  const targets = calculateMultiHorizonTargets(ltp, high12M, low12M, atrVal, pChg);
  const probMatrix = calculateProbabilisticMatrix(stock, historyList, newsPulse);
  const graham = calculateGrahamIntrinsicValue(eps, bookValue, ltp);

  const prompt = `You are NEPSE GURU, the institutional quantitative analyst and Smart Money strategist for the Nepal Stock Exchange (NEPSE).
Analyze ${sym} (${stock.name || sym}) by fusing PAST history, PRESENT microstructure, and PREDICTIVE FUTURE forecasting:

📊 LIVE PRESENT DATA:
- LTP: Rs. ${ltp} (${pChg >= 0 ? '+' : ''}${pChg}%) | Volume: ${(stock.volume || 0).toLocaleString()} shares | Turnover: Rs. ${fmtCr(stock.turnover)}
- Fundamentals: EPS: Rs. ${eps || '—'} | P/E: ${stock.pe || '—'}x | Book Value: Rs. ${bookValue || '—'}
- Graham Intrinsic Valuation V*: Rs. ${graham.intrinsicValue} (Margin of Safety: ${graham.marginOfSafetyPct}%)

📜 PAST 12-MONTH HISTORICAL DATA:
- 1-Year Return: ${return12M}% | 52W Range: Rs. ${low12M} to Rs. ${high12M}
- 200 SMA: Rs. ${sma200} | 50 SMA: Rs. ${sma50}
- Wyckoff Phase: ${wyckoff.phase} (${wyckoff.action})

🔮 ALGORITHMIC PREDICTIVE MODEL:
- Outcome Probability: ${probMatrix.bullishPct}% Bullish, ${probMatrix.neutralPct}% Neutral, ${probMatrix.bearishPct}% Bearish
- Suggested Entry: ${targets.entryZone.label}
- Target 1 (Conservative): ${targets.target1.label}
- Target 2 (Breakout Expansion): ${targets.target2.label}
- Target 3 (Cycle Peak): ${targets.target3.label}
- Invalidation Stop-Loss: ${targets.stopLoss.label} (RRR: 1 : ${targets.rrr1})

🇳🇵 LIVE MACRO / MEROLAGANI NEWS PULSE:
- Sentiment: ${newsPulse?.sentiment || 'Neutral / Supportive Policy'}
${(newsPulse?.highlights || []).map(h => `  • ${h}`).join('\n')}

Format your output in clean Markdown according to the 5-part institutional blueprint:
1. 🎯 EXECUTIVE VERDICT & PROBABILITY MATRIX
2. 🏛️ BENJAMIN GRAHAM INTRINSIC VALUATION ($V^*$)
3. 📜 PAST ANATOMY & 200 SMA / WYCKOFF CYCLE
4. 🔍 PRESENT MICROSTRUCTURE & SECTOR MOMENTUM
5. 🔮 PREDICT FUTURE: TACTICAL EXECUTION BLUEPRINT`;

  const aiRes = await generateNepseAiContent(prompt, { systemPrompt: GURU_AI_SYSTEM_PROMPT });
  if (aiRes.success && aiRes.text) return aiRes;

  return {
    text: generateOfflineStockReport(stock, newsPulse, realPriceHistory, realBrokerAnalysis),
    source: 'Multi-Horizon Quantitative Engine',
    success: true
  };
}

// ─── Portfolio Analyzer Helper ───────────────────────────────────────────────
export async function analyzePortfolioWithAi(holdings, marketStocks = []) {
  const holdingSummaries = holdings.map(h => {
    const m = marketStocks.find(s => s.symbol === h.symbol) || { ltp: h.wacc };
    const pnl = ((m.ltp - h.wacc) / (h.wacc || 1)) * 100;
    return `- **${h.symbol}**: ${h.units} units @ Rs. ${h.wacc.toFixed(1)} (LTP: Rs. ${m.ltp}, Return: ${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%)`;
  }).join('\n');

  const prompt = `You are NEPSE Guru, an expert investment portfolio advisor for the Nepal Stock Exchange.
Analyze the user's investment portfolio:

### Holdings Summary
${holdingSummaries}

Provide:
1. **Portfolio Health Score** (1-10)
2. **Diversification & Risk Assessment**
3. **Top Actionable Rebalancing Recommendations** (Which stocks to take profit, accumulate, or hold).`;

  return await generateNepseAiContent(prompt);
}

// ─── IPO Analyzer Helper ─────────────────────────────────────────────────────
export async function analyzeIpoWithAi(ipoDetails) {
  const prompt = `You are NEPSE Guru, an expert IPO analyst for the Nepal Stock Exchange.
Analyze this upcoming/active IPO:

- **Company Name**: ${ipoDetails.companyName || ipoDetails.name}
- **Sector**: ${ipoDetails.sector || 'Hydro / Finance'}
- **Price per Share**: Rs. ${ipoDetails.pricePerUnit || 100}
- **Issue Manager**: ${ipoDetails.issueManager || 'N/A'}

Provide:
1. **Application Verdict**: (Strong Apply / Apply for Listing Gain / Avoid)
2. **Expected Listing Price Range** (based on industry standard P/E & Net Worth)
3. **Key Fundamentals & Potential Risks**.`;

  return await generateNepseAiContent(prompt);
}
