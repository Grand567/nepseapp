/**
 * Centralized Multi-Provider AI Service for NEPSE App
 * SECURE VERSION - All AI calls route through backend proxy/server.mjs
 * Never calls AI providers directly from frontend to prevent key leakage
 */

import { fetchMerolaganiNews, analyzePoliticalAndMarketPulse } from './merolaganiNewsService.js';
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
} from '../utils/quantEngine.js';

const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PROXY_URL) || 'https://nepseapp.onrender.com';

// ── Security: AI keys must ONLY live in the backend environment (proxy/.env or Render dashboard).
// Never expose OPENROUTER_API_KEY or GLM_API_KEY via VITE_ prefix — they'd be bundled into
// client-side JS and visible to any user who opens DevTools.
// These exports are kept as empty strings for backward compatibility; the real keys are
// loaded server-side via process.env.OPENROUTER_API_KEY / process.env.GLM_API_KEY.
export const DEFAULT_AI_KEY = '';         // intentionally empty — key is server-only
export const DEFAULT_OPENROUTER_KEY = ''; // intentionally empty — key is server-only

export const GURU_AI_SYSTEM_PROMPT = `You are NEPSE GURU, the institutional quantitative analyst, political-macro economist, and Smart Money momentum engine for the Nepal Stock Exchange (NEPSE).
Empower Nepali retail and institutional investors with quantitative precision using the 5 Operational Action Zones & Graham Valuation Model.`;

// ── ALL AI CALLS GO THROUGH PROXY SERVER ──────────────────────
// NEVER call GLM/Gemini directly from frontend
// Reason: API keys would be exposed to all users

export async function callGuruAI(prompt, analysisType = 'stock', options = {}) {
  const apiKey = options.apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_gemini_api_key') || '') : '');
  const glmApiKey = options.glmApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_glm_api_key') || localStorage.getItem('glm_api_key') || '') : '') || DEFAULT_AI_KEY;
  const openrouterApiKey = options.openrouterApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_openrouter_api_key') || localStorage.getItem('openrouter_api_key') || '') : '') || DEFAULT_OPENROUTER_KEY;
  const res = await fetch(`${PROXY_BASE}/api/guru/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, analysisType, apiKey, glmApiKey, openrouterApiKey }),
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

export async function callGuruMarketOutlook(options = {}) {
  const apiKey = options.apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_gemini_api_key') || '') : '');
  const glmApiKey = options.glmApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_glm_api_key') || localStorage.getItem('glm_api_key') || '') : '') || DEFAULT_AI_KEY;
  const openrouterApiKey = options.openrouterApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_openrouter_api_key') || localStorage.getItem('openrouter_api_key') || '') : '') || DEFAULT_OPENROUTER_KEY;

  const url = new URL(`${PROXY_BASE}/api/guru/market-outlook`);
  if (openrouterApiKey) url.searchParams.set('openrouterApiKey', openrouterApiKey);
  if (apiKey) url.searchParams.set('apiKey', apiKey);
  if (glmApiKey) url.searchParams.set('glmApiKey', glmApiKey);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Market outlook failed');
  }

  return res.json();
}

export async function callGuruStockAnalysis(symbol, userQuestion = '', options = {}) {
  const apiKey = options.apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_gemini_api_key') || '') : '');
  const glmApiKey = options.glmApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_glm_api_key') || localStorage.getItem('glm_api_key') || '') : '') || DEFAULT_AI_KEY;
  const openrouterApiKey = options.openrouterApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_openrouter_api_key') || localStorage.getItem('openrouter_api_key') || '') : '') || DEFAULT_OPENROUTER_KEY;

  const res = await fetch(`${PROXY_BASE}/api/guru/stock-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, userQuestion, apiKey, glmApiKey, openrouterApiKey }),
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
  const glmApiKey = apiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse_hub_glm_api_key') || localStorage.getItem('glm_api_key') || '') : '') || DEFAULT_AI_KEY;
  const res = await callGuruAI(combined, 'chat', { glmApiKey });
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

// ── Quantitative Offline Report Generator (Grounded in Authentic History) ──
export function generateOfflineStockReport(stock, customNewsPulse = null, realPriceHistory = null, realBrokerAnalysis = null) {
  if (!stock) return '';
  const sym = (stock.symbol || 'STOCK').toUpperCase();
  const name = stock.name || sym;
  const ltp = Number(stock.ltp);
  if (!ltp || isNaN(ltp) || ltp <= 0) {
    return `### ⚠️ Data Insufficient for **${sym}**
• Real market price is unavailable from the exchange feed.
• Quantitative analysis cannot be performed without verified price telemetry.`;
  }

  const rsi = stock.rsi != null && !isNaN(Number(stock.rsi)) ? Number(stock.rsi) : null;
  const pe = stock.pe != null && !isNaN(Number(stock.pe)) && Number(stock.pe) > 0 ? Number(stock.pe) : null;
  const eps = stock.eps != null && !isNaN(Number(stock.eps)) ? Number(stock.eps) : null;
  const bookValue = stock.bookValue != null && Number(stock.bookValue) > 0 ? Number(stock.bookValue) : (stock.bvps != null && Number(stock.bvps) > 0 ? Number(stock.bvps) : null);
  const pChg = Number(stock.pChange) || 0;
  const volume = stock.volume != null && !isNaN(Number(stock.volume)) ? Number(stock.volume) : null;
  const turnover = stock.turnover != null && !isNaN(Number(stock.turnover)) ? Number(stock.turnover) : (volume != null ? (ltp * volume) : null);

  const hasRealHistory = Array.isArray(realPriceHistory) && realPriceHistory.length > 0;
  const historyList = hasRealHistory
    ? realPriceHistory.slice().filter(c => c && (c.date || c.t || c.time)).sort((a, b) => new Date(a.date || a.t || a.time) - new Date(b.date || b.t || b.time))
    : [];

  const high12M = (stock.high52w && Number(stock.high52w) > 0)
    ? Number(stock.high52w)
    : (hasRealHistory ? Math.max(...historyList.map(h => Number(h.high || h.close))) : null);

  const low12M = (stock.low52w && Number(stock.low52w) > 0)
    ? Number(stock.low52w)
    : (hasRealHistory ? Math.min(...historyList.map(h => Number(h.low || h.close))) : null);

  const yearAgoClose = hasRealHistory && historyList[0]?.close
    ? Number(historyList[0].close)
    : (Number(stock.prevYearClose) || null);
  const return12M = (yearAgoClose && yearAgoClose > 0) ? (((ltp - yearAgoClose) / yearAgoClose) * 100).toFixed(2) : null;

  const closes = historyList.map(h => Number(h.close || h.ltp)).filter(c => !isNaN(c) && c > 0);
  const sma50 = closes.length >= 50
    ? Number((closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(1))
    : null;
  const sma200 = closes.length >= 200
    ? Number((closes.slice(-200).reduce((a, b) => a + b, 0) / 200).toFixed(1))
    : null;
  const smaTrend = sma200 != null
    ? (ltp >= sma200 ? 'Bullish (Above 200 SMA)' : 'Bearish (Below 200 SMA)')
    : 'Insufficient history for 200 SMA';

  const wyckoff = detectWyckoffPhase(historyList, volume || 0);
  const atrVal = calculateATR(historyList);
  const targets = (high12M != null && low12M != null && atrVal != null)
    ? calculateMultiHorizonTargets(ltp, high12M, low12M, atrVal, pChg)
    : { target1: null, target2: null, stopLoss: null };

  const newsHighlight = customNewsPulse || null;
  const probMatrix = calculateProbabilisticMatrix(stock, historyList, newsHighlight);

  const graham = (eps != null && bookValue != null)
    ? calculateGrahamIntrinsicValue(eps, bookValue, ltp)
    : { intrinsicValue: null, marginOfSafetyPct: null };
  const actionZone = classifyActionZone({ ...stock, eps, bookValue, ltp, candles: historyList, history: historyList });
  const zVol = volume != null
    ? calculateVolumeZScore(volume, stock.avgVolume20D || volume)
    : { zScore: '—' };

  const chg = stock.change != null ? Number(stock.change) : (pChg ? Number((ltp * (pChg / 100)).toFixed(2)) : 0);
  const pClose = stock.prevClose != null ? Number(stock.prevClose) : (chg ? Number((ltp - chg).toFixed(2)) : null);
  const dayHigh = stock.high != null ? Number(stock.high) : null;
  const dayLow = stock.low != null ? Number(stock.low) : null;

  const dataGaps = [];
  if (volume == null) dataGaps.push('Trading volume');
  if (eps == null) dataGaps.push('EPS / earnings statement');
  if (bookValue == null) dataGaps.push('Book value (BVPS)');
  if (sma200 == null) dataGaps.push('200-session price history');
  if (high12M == null) dataGaps.push('52-week range');

  const warningSection = dataGaps.length > 0
    ? `> ⚠️ **Data Completeness Notice**: The following inputs are unavailable from the exchange: **${dataGaps.join(', ')}**. Analysis has reduced confidence.\n\n`
    : '';

  return `${warningSection}### 📌 Live Market Price: **${sym}** (${name})
• **Official Final Price (LTP)**: **Rs. ${ltp.toFixed(2)}** (${pChg >= 0 ? '+' : ''}${chg.toFixed(2)} / ${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%)
• **Previous Closing Price**: ${pClose != null ? `**Rs. ${pClose.toFixed(2)}**` : '—'} | **Today's Range**: Low **Rs. ${dayLow != null ? dayLow.toFixed(2) : '—'}** — High **Rs. ${dayHigh != null ? dayHigh.toFixed(2) : '—'}**
• **Today's Volume**: ${volume != null ? `${volume.toLocaleString()} shares` : '—'} · Turnover: ${turnover != null ? (turnover >= 10000000 ? `Rs. ${(turnover/10000000).toFixed(2)} Cr` : `Rs. ${(turnover/100000).toFixed(2)} Lakh`) : '—'}
• **Volume Expansion (RVOL)**: **${probMatrix.rvol || '—'}x** (Z-Score: **${zVol.zScore || '—'}**)

---

### 🎯 1. GURU AI OPERATIONAL ACTION ZONE: **${actionZone.zoneBadge}**
• **Strategic Verdict**: ${actionZone.zone} — ${actionZone.systematicStrategy}
• **Wyckoff Cycle Phase**: **${wyckoff.phase}** (${wyckoff.action})
• **Graham Intrinsic Value**: Rs. ${graham.intrinsicValue ? graham.intrinsicValue.toFixed(2) : 'N/A'} (Margin of Safety: ${graham.marginOfSafetyPct != null ? (graham.marginOfSafetyPct >= 0 ? '+' : '') + graham.marginOfSafetyPct.toFixed(1) + '%' : 'N/A'})
• **Targets**: Target 1: Rs. ${targets.target1?.price ?? 'N/A'} (+${targets.target1?.pct ?? '—'}%) | Target 2: Rs. ${targets.target2?.price ?? 'N/A'} (+${targets.target2?.pct ?? '—'}%) | Stop-Loss: Rs. ${targets.stopLoss?.price ?? 'N/A'} (-${targets.stopLoss?.pct ?? '—'}%)`;
}
