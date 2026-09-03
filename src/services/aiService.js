/**
 * Centralized Multi-Provider AI Service for NEPSE App
 * SECURE VERSION - All AI calls route through backend proxy/server.mjs
 * Never calls AI providers directly from frontend to prevent key leakage
 */

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

const PROXY_BASE = import.meta.env.VITE_PROXY_URL || 'https://nepseapp.onrender.com';

export const DEFAULT_AI_KEY = '';

export const GURU_AI_SYSTEM_PROMPT = `You are NEPSE GURU, the institutional quantitative analyst, political-macro economist, and Smart Money momentum engine for the Nepal Stock Exchange (NEPSE).
Empower Nepali retail and institutional investors with quantitative precision using the 5 Operational Action Zones & Graham Valuation Model.`;

// ── ALL AI CALLS GO THROUGH PROXY SERVER ──────────────────────
// NEVER call GLM/Gemini directly from frontend
// Reason: API keys would be exposed to all users

export async function callGuruAI(prompt, analysisType = 'stock') {
  const res = await fetch(`${PROXY_BASE}/api/guru/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, analysisType }),
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `AI request failed: ${res.status}`);
  }

  return res.json();
}

export async function callGuruPortfolio(holdings, riskProfile = 'moderate') {
  const res = await fetch(`${PROXY_BASE}/api/guru/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings, riskProfile }),
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Portfolio analysis failed');
  }

  return res.json();
}

export async function callGuruMarketOutlook() {
  const res = await fetch(`${PROXY_BASE}/api/guru/market-outlook`, {
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Market outlook failed');
  }

  return res.json();
}

export async function callGuruStockAnalysis(symbol, userQuestion = '') {
  const res = await fetch(`${PROXY_BASE}/api/guru/stock-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, userQuestion }),
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Stock analysis failed for ${symbol}`);
  }

  return res.json();
}

// ── Backward Compatible Adapters (Route through proxy server) ──
export async function callGlmAi(prompt, systemPrompt = '', apiKey = '') {
  const combined = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const res = await callGuruAI(combined, 'chat');
  return res.data?.analysis || res.data || res.text || (typeof res === 'string' ? res : JSON.stringify(res));
}

export async function generateNepseAiContent(prompt, options = {}) {
  try {
    const combined = options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
    const res = await callGuruAI(combined, 'stock');
    const text = res.data?.analysis || (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
    return { text, source: res.provider || 'Proxy GURU AI', success: true };
  } catch (err) {
    console.warn('[AI Service] Proxy GURU AI failed:', err.message);
    return { text: null, source: 'Offline Heuristics', success: false };
  }
}

export async function analyzeStockWithAi(stock, options = {}) {
  const sym = (stock.symbol || '').toUpperCase();
  try {
    const res = await callGuruStockAnalysis(sym);
    if (res.data?.analysis) {
      return { report: res.data.analysis, source: res.provider, success: true };
    }
  } catch (err) {
    console.warn('Stock AI call failed, falling back to offline heuristics:', err.message);
  }
  return { report: generateOfflineStockReport(stock), source: 'Offline Quant Engine', success: true };
}

// ── Quantitative Offline Report Generator (Grounded in History) ──
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

  const hasRealHistory = Array.isArray(realPriceHistory) && realPriceHistory.length > 0;
  const historyList = hasRealHistory ? realPriceHistory : [];

  const high12M = (stock.high52w && Number(stock.high52w) > 0)
    ? Number(stock.high52w)
    : (hasRealHistory ? Math.max(...historyList.map(h => Number(h.high || h.close))) : ltp * 1.25);

  const low12M = (stock.low52w && Number(stock.low52w) > 0)
    ? Number(stock.low52w)
    : (hasRealHistory ? Math.min(...historyList.map(h => Number(h.low || h.close))) : ltp * 0.75);

  const yearAgoClose = hasRealHistory && historyList[0]?.close
    ? Number(historyList[0].close)
    : (Number(stock.prevYearClose) || ltp);
  const return12M = yearAgoClose > 0 ? (((ltp - yearAgoClose) / yearAgoClose) * 100).toFixed(2) : '0.00';

  const closes = historyList.map(h => Number(h.close || h.ltp)).filter(c => !isNaN(c) && c > 0);
  const sma50 = closes.length >= 10
    ? Number((closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(closes.length, 50)).toFixed(1))
    : ltp;
  const sma200 = closes.length >= 20
    ? Number((closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(closes.length, 200)).toFixed(1))
    : ltp;
  const smaTrend = ltp >= sma200 ? 'Bullish (Above 200 SMA)' : 'Bearish (Below 200 SMA)';

  const wyckoff = detectWyckoffPhase(historyList, volume);
  const atrVal = calculateATR(historyList);
  const targets = calculateMultiHorizonTargets(ltp, high12M, low12M, atrVal, pChg);

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

  const graham = calculateGrahamIntrinsicValue(eps, bookValue, ltp);
  const actionZone = classifyActionZone({ ...stock, eps, bookValue, ltp });
  const zVol = calculateVolumeZScore(volume, stock.avgVolume20D || volume * 0.6);

  const chg = Number(stock.change || (ltp * (pChg / 100))) || 0;
  const pClose = Number(stock.prevClose || (ltp - chg)) || ltp;
  const dayHigh = Number(stock.high || (ltp * 1.015));
  const dayLow = Number(stock.low || (ltp * 0.985));

  return `### 📌 Live Market Price: **${sym}** (${name})
• **Official Final Price (LTP)**: **Rs. ${ltp.toFixed(2)}** (${pChg >= 0 ? '+' : ''}${chg.toFixed(2)} / ${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%)
• **Previous Closing Price**: **Rs. ${pClose.toFixed(2)}** | **Today's Range**: Low **Rs. ${dayLow.toFixed(2)}** — High **Rs. ${dayHigh.toFixed(2)}**
• **Today's Volume**: ${(volume).toLocaleString()} shares · Turnover: **Rs. ${(turnover >= 10000000 ? (turnover/10000000).toFixed(2) + ' Cr' : (turnover/100000).toFixed(2) + ' Lakh')}**
• **Volume Expansion (RVOL)**: **${probMatrix.rvol}x** (Z-Score: **${zVol.zScore}**)

---

### 🎯 1. GURU AI OPERATIONAL ACTION ZONE: **${actionZone.zoneBadge}**
• **Strategic Verdict**: ${actionZone.actionVerdict}
• **Wyckoff Cycle Phase**: **${wyckoff.phase}** (${wyckoff.confidence}% Institutional Confidence)
• **Graham Intrinsic Value**: Rs. ${graham.grahamValue ? graham.grahamValue.toFixed(2) : 'N/A'} (Margin of Safety: ${graham.marginOfSafety ? graham.marginOfSafety.toFixed(1) + '%' : 'N/A'})
• **Targets**: Target 1: Rs. ${targets.t1} | Target 2: Rs. ${targets.t2} | Stop-Loss: Rs. ${targets.stopLoss}`;
}
