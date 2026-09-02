import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrainCircuit, MessageSquare, ListFilter, Cpu, Sparkles, Send, Search, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronDown, ChevronUp, BarChart2, Zap, Target, Award, Shield } from 'lucide-react';
import { calculateBuyDetails } from '../utils/calculations';
import { generateMockDematPortfolio, generateHistory } from '../utils/mockData';
import { getProxyBase } from '../utils/liveData';
import { DEFAULT_AI_KEY, callGlmAi, generateNepseAiContent, generateOfflineStockReport, GURU_AI_SYSTEM_PROMPT } from '../services/aiService';
import {
  calculateGrahamIntrinsicValue,
  classifyActionZone,
  calculateVolumeZScore,
  calculateCompositeMomentumScore
} from '../utils/quantEngine';
import { fetchMerolaganiNews, analyzePoliticalAndMarketPulse } from '../services/merolaganiNewsService';


// ─── Markdown parser ─────────────────────────────────────────────────────────
const parseMarkdown = (text) => {
  if (!text) return '';
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
  // Headers
  escaped = escaped.replace(/^### (.*$)/gm, '<h4 style="margin:10px 0 4px;color:var(--primary-light);font-size:13px">$1</h4>');
  escaped = escaped.replace(/^## (.*$)/gm, '<h3 style="margin:12px 0 5px;color:var(--primary-light);font-size:14px">$1</h3>');
  escaped = escaped.replace(/^# (.*$)/gm, '<h2 style="margin:14px 0 6px;color:var(--primary-light);font-size:15px">$1</h2>');
  // Inline code
  escaped = escaped.replace(/`([^`]+)`/g, '<code style="background:rgba(91,94,244,0.15);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>');
  const lines = escaped.split('\n');
  let inList = false;
  const processedLines = [];
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || (trimmed.startsWith('* ') && !trimmed.endsWith('*'))) {
      const content = trimmed.substring(2).trim();
      if (!inList) { processedLines.push('<ul style="margin:4px 0;padding-left:16px">'); inList = true; }
      processedLines.push(`<li style="margin:3px 0;line-height:1.5">${content}</li>`);
    } else {
      if (inList) { processedLines.push('</ul>'); inList = false; }
      if (trimmed.startsWith('<h')) {
        processedLines.push(line);
      } else if (trimmed) {
        processedLines.push(`<p style="margin:4px 0;line-height:1.6">${line}</p>`);
      } else {
        processedLines.push('<br/>');
      }
    }
  });
  if (inList) processedLines.push('</ul>');
  return processedLines.join('\n');
};

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
const Sparkline = ({ history, width = 120, height = 36 }) => {
  if (!history || history.length < 2) return null;
  const prices = history.map(h => h.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#10d98a' : '#ff4f6a';
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={pts}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ─── Verdict Badge ────────────────────────────────────────────────────────────
const VerdictBadge = ({ verdict }) => {
  const v = (verdict || '').toUpperCase();
  const isBuy = v.includes('BUY');
  const isSell = v.includes('SELL');
  const bg = isBuy ? 'var(--bull)' : isSell ? 'var(--bear)' : '#f5a623';
  const icon = isBuy ? <TrendingUp size={13} /> : isSell ? <TrendingDown size={13} /> : <Minus size={13} />;
  const label = isBuy ? 'BUY' : isSell ? 'SELL' : 'HOLD';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color: '#fff', fontWeight: 800, fontSize: 11,
      padding: '4px 10px', borderRadius: 20, letterSpacing: 0.5,
      boxShadow: `0 0 12px ${bg}55`
    }}>
      {icon} {label}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AiAnalyst({ marketStocks }) {
  const [activeTab, setActiveTab] = useState('suggestions');
  const [showAllOpps, setShowAllOpps] = useState(false);
  const [portfolioTxs, setPortfolioTxs] = useState([]);

  // API Keys — seed from env / default AI key, allow user override via localStorage
  const [glmKey, setGlmKey] = useState(() => localStorage.getItem('nepse_hub_glm_api_key') || import.meta.env.VITE_GLM_API_KEY || DEFAULT_AI_KEY);
  const [geminiKey, setGeminiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [groqKey, setGroqKey] = useState(import.meta.env.VITE_GROQ_API_KEY || '');
  const [preferredEngine, setPreferredEngine] = useState(() => localStorage.getItem('nepse_hub_preferred_ai_engine') || 'auto');

  // Chat states
  const [messages, setMessages] = useState([
    {
      sender: 'guru',
      text: "Namaste! 🙏 I am **NEPSE Guru**, your AI Stock Assistant powered by GLM-4 & Multi-Model Intelligence.\n\nI can:\n• Analyze any NEPSE stock in depth\n• Give BUY/HOLD/SELL verdict with reasoning\n• Check your portfolio health\n• Explain taxes & market concepts\n\nTry the **Stock Analyzer** tab or ask me anything!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Stock Analyzer states
  const [analyzerSymbol, setAnalyzerSymbol] = useState('');
  const [analyzerQuery, setAnalyzerQuery] = useState('');
  const [analyzerSuggestions, setAnalyzerSuggestions] = useState([]);
  const [analyzerResult, setAnalyzerResult] = useState(null);
  const [analyzerLoading, setAnalyzerLoading] = useState(false);
  const [analyzerError, setAnalyzerError] = useState('');
  const [analyzerHistory, setAnalyzerHistory] = useState([]);
  const [showApiHelp, setShowApiHelp] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('ALL');

  // ── Multi-Factor Operational Action Zones Radar dataset ──
  const radarStocks = useMemo(() => {
    const list = (marketStocks || []).map(s => {
      const az = s.actionZone || classifyActionZone(s);
      const gr = s.grahamIntrinsicValue ? { intrinsicValue: s.grahamIntrinsicValue, marginOfSafetyPct: s.marginOfSafetyPct, isUndervalued: s.isUndervalued, valuationStatus: s.valuationStatus } : calculateGrahamIntrinsicValue(s.eps, s.bookValue, s.ltp);
      const zv = s.volumeZScore != null ? { zScore: s.volumeZScore, isVolumeShocker: s.isVolumeShocker } : calculateVolumeZScore(s.volume, s.avgVolume20D);
      return {
        ...s,
        actionZone: az,
        graham: gr,
        zVol: zv
      };
    });

    if (zoneFilter === 'ALL') return list;
    return list.filter(s => (s.actionZone?.zone || '').toLowerCase().includes(zoneFilter.toLowerCase()));
  }, [marketStocks, zoneFilter]);


  // ── Load persisted state ────────────────────────────────────────────────────
  useEffect(() => {
    const savedTxs = localStorage.getItem('nepse_hub_portfolio_transactions');
    if (savedTxs) { try { setPortfolioTxs(JSON.parse(savedTxs)); } catch (e) {} }
    const savedGlm = localStorage.getItem('nepse_hub_glm_api_key');
    if (savedGlm !== null) setGlmKey(savedGlm);
    const savedGemini = localStorage.getItem('nepse_hub_gemini_api_key');
    if (savedGemini !== null) setGeminiKey(savedGemini);
    const savedGroq = localStorage.getItem('nepse_hub_groq_api_key');
    if (savedGroq !== null) setGroqKey(savedGroq);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const saveGlmKey = (key) => { setGlmKey(key); localStorage.setItem('nepse_hub_glm_api_key', key); };
  const saveGeminiKey = (key) => { setGeminiKey(key); localStorage.setItem('nepse_hub_gemini_api_key', key); };
  const saveGroqKey = (key) => { setGroqKey(key); localStorage.setItem('nepse_hub_groq_api_key', key); };

  // ── Portfolio helpers ───────────────────────────────────────────────────────
  const getHoldings = () => {
    const holdingsMap = {};
    const chronologicalTxs = [...portfolioTxs].reverse();
    chronologicalTxs.forEach(tx => {
      if (!holdingsMap[tx.symbol]) holdingsMap[tx.symbol] = { symbol: tx.symbol, units: 0, totalInvestedCost: 0, wacc: 0 };
      const holding = holdingsMap[tx.symbol];
      if (tx.type === 'buy') {
        const details = calculateBuyDetails(tx.quantity, tx.price);
        holding.units += tx.quantity;
        holding.totalInvestedCost += details.totalAmount;
        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;
      } else {
        const prevUnits = holding.units;
        holding.units = Math.max(0, holding.units - tx.quantity);
        if (prevUnits > 0) holding.totalInvestedCost = holding.units * holding.wacc;
        else holding.totalInvestedCost = 0;
      }
    });
    const savedProfiles = localStorage.getItem('nepse_hub_meroshare_profiles') || localStorage.getItem('nepse_hub_guest_local_profiles');
    if (savedProfiles) {
      try {
        const profiles = JSON.parse(savedProfiles);
        profiles.forEach(p => {
          const dematHoldings = (p.holdings && Array.isArray(p.holdings)) ? p.holdings : [];
          dematHoldings.forEach(dh => {
            if (!dh || !dh.symbol || !dh.units) return;
            const sym = (dh.symbol || '').trim().toUpperCase();
            const wacc = Number(dh.wacc) || 100;
            const units = Number(dh.units) || 0;
            if (!holdingsMap[sym]) holdingsMap[sym] = { symbol: sym, units: 0, totalInvestedCost: 0, wacc };
            const holding = holdingsMap[sym];
            const totalUnits = holding.units + units;
            if (totalUnits > 0) {
              holding.wacc = (holding.units * holding.wacc + units * wacc) / totalUnits;
            }
            holding.units += units;
            holding.totalInvestedCost += units * wacc;
          });
        });
      } catch (e) {}
    }
    return Object.values(holdingsMap).filter(h => h.units > 0);
  };

  const activeHoldings = getHoldings();

  // ── Portfolio recommendations ───────────────────────────────────────────────
  const getPortfolioRecommendations = () => {
    return activeHoldings.map(h => {
      const stock = marketStocks.find(s => s.symbol === h.symbol);
      if (!stock) return null;
      const gainLossPercent = ((stock.ltp - h.wacc) / h.wacc) * 100;
      let recommendation = 'hold';
      let reason = 'Market metrics are stable. Suggest holding and monitoring trend.';
      if (stock.rsi < 36 && stock.ltp < h.wacc) {
        recommendation = 'buy_more';
        reason = `Oversold alert (RSI: ${stock.rsi.toFixed(0)}). Stock trading below your buying price (WACC: Rs. ${h.wacc.toFixed(1)}). Buying now reduces average cost.`;
      } else if (stock.rsi > 70 && gainLossPercent > 12) {
        recommendation = 'take_profit';
        reason = `Overbought alert (RSI: ${stock.rsi.toFixed(0)}). You are sitting on a solid gain (+${gainLossPercent.toFixed(1)}%). Consider locking in profits.`;
      } else if (stock.rsi > 75) {
        recommendation = 'hold';
        reason = `Stock approaching heavy overbought zone (RSI: ${stock.rsi.toFixed(0)}). High risk of correction. Avoid buying more right now.`;
      }
      return { symbol: h.symbol, units: h.units, wacc: h.wacc, ltp: stock.ltp, pChange: gainLossPercent, recommendation, reason };
    }).filter(Boolean);
  };

  const portRecs = getPortfolioRecommendations();

  // ── Market opportunities ────────────────────────────────────────────────────
  const getMarketOpportunities = () => {
    const opportunities = [];
    marketStocks.forEach(stock => {
      if (stock.rsi < 35) {
        opportunities.push({ symbol: stock.symbol, name: stock.name, ltp: stock.ltp, rsi: stock.rsi, type: 'bullish_buy', description: `Oversold condition (RSI: ${stock.rsi.toFixed(0)}). Seller exhaustion signals. **Cheap entry point**.` });
      } else if (stock.rsi > 72) {
        opportunities.push({ symbol: stock.symbol, name: stock.name, ltp: stock.ltp, rsi: stock.rsi, type: 'bearish_sell', description: `Overbought levels (RSI: ${stock.rsi.toFixed(0)}). Saturated buy volume, correction likely. **Take Profit / Avoid buying**.` });
      } else if (stock.macd?.line > stock.macd?.signal && stock.rsi > 45 && stock.rsi < 62 && stock.change > 0) {
        opportunities.push({ symbol: stock.symbol, name: stock.name, ltp: stock.ltp, rsi: stock.rsi, type: 'momentum_buy', description: `Bullish MACD Crossover (RSI: ${stock.rsi.toFixed(0)}). Positive market momentum building. **Bullish trend starting**.` });
      }
    });
    return opportunities;
  };

  const marketOpps = getMarketOpportunities();

  // ── Local heuristic & Quantitative Smart Money engine fallback ────────────
  const getHeuristicResponse = (query, explicitSymbol, newsPulse = null) => {
    const q = (query || '').toLowerCase().trim();

    // 1. Check for specific stock symbol inquiry
    let target = explicitSymbol;
    if (!target) {
      const words = (query || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (marketStocks.some(s => s.symbol.toUpperCase() === w)) {
          target = w;
          break;
        }
      }
    }

    if (target) {
      const stock = marketStocks.find(s => s.symbol.toUpperCase() === target.toUpperCase());
      if (stock) {
        const ltp = Number(stock.ltp) || 100;
        const rsi = Number(stock.rsi) || 50;
        const pChg = Number(stock.pChange) || 0;
        const isOversold = rsi <= 38;
        const isOverbought = rsi >= 68;

        const entryLow = (ltp * 0.97).toFixed(1);
        const entryHigh = ltp.toFixed(1);
        const target1 = (ltp * 1.08).toFixed(1);
        const target2 = (ltp * 1.18).toFixed(1);
        const stopLoss = (ltp * 0.94).toFixed(1);

        let intentHighlight = '';
        if (q.includes('entry') || q.includes('point') || q.includes('buy') || q.includes('level') || q.includes('price')) {
          intentHighlight = `### 🎯 Optimal Entry Strategy for **${stock.symbol}** (${stock.name}):\n\n` +
            `• **Recommended Entry Zone**: **Rs. ${entryLow} – Rs. ${entryHigh}**\n` +
            `• **Current LTP**: **Rs. ${ltp}** (${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%)\n` +
            `• **Target 1 (Swing)**: **Rs. ${target1}** (+8.0%)\n` +
            `• **Target 2 (Breakout)**: **Rs. ${target2}** (+18.0%)\n` +
            `• **Stop-Loss Level**: **Rs. ${stopLoss}** (-6.0%)\n` +
            `• **Current RSI**: **${rsi.toFixed(1)}** (${isOversold ? '🟢 Oversold / Buyer Interest' : isOverbought ? '🔴 Overbought / High Risk' : '⚪ Neutral Momentum'})\n\n` +
            `> 💡 **Guru Strategy**: ${isOversold ? 'Stock is in a strong institutional accumulation pocket. Phased entry recommended.' : isOverbought ? 'Stock has extended upward. Wait for a pullback towards Rs. ' + entryLow + ' before opening fresh positions.' : 'Place limit orders in the Rs. ' + entryLow + ' – Rs. ' + entryHigh + ' range with strict stop-loss at Rs. ' + stopLoss + '.'}\n\n---\n\n`;
        } else if (q.includes('target') || q.includes('exit') || q.includes('sell') || q.includes('resistance')) {
          intentHighlight = `### 🎯 Target & Exit Levels for **${stock.symbol}**:\n\n` +
            `• **Official Final Price (LTP)**: **Rs. ${ltp.toFixed(2)}** (${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%)\n` +
            `• **Short-Term Target 1**: **Rs. ${target1}** (+8.0%)\n` +
            `• **Major Resistance / Target 2**: **Rs. ${target2}** (+18.0%)\n` +
            `• **Protective Stop-Loss Floor**: **Rs. ${stopLoss}** (-6.0%)\n\n---\n\n`;
        }

        const fullReport = generateOfflineStockReport(stock, newsPulse);
        return intentHighlight + fullReport;
      }
    }

    // 2. Political and macro news queries
    if (q.includes('political') || q.includes('news') || q.includes('merolagani') || q.includes('government') || q.includes('nrb')) {
      const p = newsPulse || { sentiment: 'Supportive Liquidity / Cautious Optimism', keyHighlights: [] };
      return `### 🇳🇵 Merolagani Political & Market News Pulse\n\n` +
        `• **Macro Policy Sentiment**: **${p.sentiment || 'Supportive Liquidity'}**\n\n` +
        `**Latest Merolagani Political & Financial Headlines:**\n` +
        `${(p.keyHighlights || []).map(h => `• ${h}`).join('\n')}\n\n` +
        `**Institutional Market Interpretation:**\n` +
        `Policy stability in the financial sector, combined with single-digit banking interest rates and healthy liquidity managed by Nepal Rastra Bank, creates strong tailwinds for accumulation in commercial banking, hydropower, and high-dividend fundamentally sound scrips.`;
    }

    // 2. Buy suggestions / opportunities
    if (q.includes('suggest') || q.includes('buy') || q.includes('opportunity') || q.includes('recommend') || q.includes('which stock')) {
      const bestBuys = marketStocks.filter(s => s.rsi < 38).slice(0, 4);
      if (bestBuys.length > 0) {
        let text = "### 🟢 Top Oversold Buying Opportunities (RSI < 38)\n\n";
        bestBuys.forEach(s => {
          text += `• **${s.symbol}** — LTP: Rs. ${s.ltp} | RSI: **${s.rsi.toFixed(0)}** (Oversold rebound zone. Entry: Rs. ${(s.ltp * 0.98).toFixed(1)}–${s.ltp}, Target: Rs. ${(s.ltp * 1.10).toFixed(1)})\n`;
        });
        text += "\n*Always ensure balanced sector allocation and check company EPS/WACC before entry.*";
        return text;
      }
      return "The market is currently consolidating. No extreme oversold signals among blue-chip scrips. Monitor Banking and Hydropower sectors for swing setups!";
    }

    // 3. User Portfolio Analysis
    if (q.includes('portfolio') || q.includes('holdings') || q.includes('my stock')) {
      if (activeHoldings.length === 0) return "You haven't added any stocks to your Portfolio tab yet! Connect your MeroShare account or add transactions in the Portfolio tab to get an instant AI audit.";
      let text = "### 💼 Active Portfolio Health Check\n\n";
      activeHoldings.forEach(h => {
        const stock = marketStocks.find(s => s.symbol === h.symbol);
        if (stock) {
          const diff = ((stock.ltp - h.wacc) / h.wacc) * 100;
          text += `• **${h.symbol}**: ${h.units} units (WACC: Rs. ${h.wacc.toFixed(1)}, LTP: Rs. ${stock.ltp}) — Return: **${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%**. `;
          if (stock.rsi < 36) text += "🟢 *Oversold! Attractive level to average down.*";
          else if (stock.rsi > 70) text += "🔴 *Overbought! Consider booking partial profit.*";
          else text += "⚪ *Holding steady.*";
          text += "\n";
        }
      });
      return text;
    }

    // 4. Taxes and Fees
    if (q.includes('tax') || q.includes('cgt') || q.includes('commission') || q.includes('fee')) {
      return "### 🇳🇵 NEPSE Trading Taxes & Fees Structure\n\n" +
        "1. **Capital Gains Tax (CGT)**:\n" +
        "   • **Individual Short-Term (<365 days)**: **7.5%** on net capital gains.\n" +
        "   • **Individual Long-Term (>365 days)**: **5.0%** on net capital gains.\n" +
        "   • **Corporate Entities**: 10% flat.\n\n" +
        "2. **Broker Commission** (tiered by trade size):\n" +
        "   • Up to Rs. 50,000: **0.40%**\n" +
        "   • Rs. 50,000 – Rs. 5 Lakhs: **0.37%**\n" +
        "   • Rs. 5 Lakhs – Rs. 20 Lakhs: **0.34%**\n" +
        "   • Above Rs. 1 Crore: **0.27%**\n\n" +
        "3. **Regulatory Charges**:\n" +
        "   • **SEBON Fee**: **0.015%**\n" +
        "   • **DP Charge**: **Rs. 25 flat** per sold company.\n\n" +
        "💡 *The app's Calculator tab automatically computes your net profit after all these fees.*";
    }

    // 5. WACC Definition
    if (q.includes('wacc')) {
      return "### 📘 What is WACC in NEPSE?\n\n" +
        "**WACC (Weighted Average Cost of Capital)** is your true average purchase price calculated as per SEBON guidelines.\n\n" +
        "It includes:\n" +
        "• Actual purchase price of shares\n" +
        "• Broker commission paid\n" +
        "• SEBON regulatory fee\n" +
        "• DP transaction charges\n\n" +
        "When selling, your broker deducts Capital Gains Tax (CGT) based on this WACC rate. You can calculate and submit your WACC directly through **MeroShare → My Purchase Source**.";
    }

    // 6. Default Guide
    return "I am **NEPSE Guru**, your AI Stock Assistant! Here are some questions you can ask me:\n\n" +
      "1. `'GLBSL entry point'` or `'NABIL target'` (Instant entry, target & stop-loss)\n" +
      "2. `'Which stocks should I buy?'` (Top oversold market opportunities)\n" +
      "3. `'Analyze my portfolio'` (Risk & return audit of your holdings)\n" +
      "4. `'How are taxes calculated?'` (Complete CGT & broker fee breakdown)\n" +
      "5. `'What is WACC?'` (Clear explanation of purchase cost base)";
  };

  // ── Layer 1: Fetch NEPSE market data & price history ───────────────────────
  const fetchStockContext = async (symbol) => {
    const stock = marketStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
    if (!stock) return null;

    let historyData = [];
    try {
      const base = getProxyBase();
      const res = await fetch(`${base}/api/price-history/${stock.symbol}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) historyData = json.data.slice(0, 20);
      }
    } catch (e) {
      console.warn('Price history fetch failed, using generated data:', e.message);
    }

    if (historyData.length === 0) {
      historyData = generateHistory(stock.symbol, stock.ltp, 20);
    } else {
      // Ensure the latest point in history matches the live stock LTP
      const last = historyData[historyData.length - 1];
      if (last) {
        last.close = stock.ltp;
        last.high = Math.max(last.high || stock.ltp, stock.ltp);
        last.low = Math.min(last.low || stock.ltp, stock.ltp);
      }
    }

    const historyStr = historyData
      .map(h => `  - ${h.date || 'Session'}: Close Rs.${h.close}, Vol ${(h.volume || 0).toLocaleString()}`)
      .join('\n');

    // Accumulation/Distribution estimation
    const recentVols = historyData.slice(-5).map(h => h.volume || 0);
    const avgVol = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
    const adSignal = avgVol > (stock.volume * 0.8) ? 'Accumulation (above average volume)' : 'Distribution (below average volume)';

    return { stock, historyData, historyStr, adSignal };
  };

  // ── Layer 2a: Groq LLM ──────────────────────────────────────────────────────
  const callGroq = async (prompt, apiKey) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are NEPSE Guru, an expert Nepali stock market AI. Always respond in clear Markdown with headers, bullet points, and bold text. Always include an explicit BUY, HOLD, or SELL recommendation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1200
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq error ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // ── Layer 2b: Gemini LLM ────────────────────────────────────────────────────
  const callGemini = async (prompt, apiKey) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(20000)
      }
    );
    if (!response.ok) throw new Error(`Gemini error ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  // ── Layer 3: Pollinations free LLM ─────────────────────────────────────────
  const callPollinations = async (prompt) => {
    try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: 'You are NEPSE Guru, an expert Nepali stock market AI. Always respond in Markdown with an explicit BUY, HOLD, or SELL verdict.' },
            { role: 'user', content: prompt }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch(e) {}
    
    // Fallback to plain text endpoint
    const fallbackRes = await fetch(`https://text.pollinations.ai/prompt/${encodeURIComponent('You are NEPSE Guru, an expert Nepali stock market AI. Always respond in Markdown with an explicit BUY, HOLD, or SELL verdict. ' + prompt)}`, { signal: AbortSignal.timeout(25000) });
    if (!fallbackRes.ok) throw new Error('Pollinations fallback failed');
    return await fallbackRes.text() || '';
  };

  // ── Unified LLM call with layer priority ───────────────────────────────────
  const callLLM = async (prompt) => {
    const engines = [];

    // Construct evaluation order based on preference
    if (preferredEngine === 'glm') {
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, glmKey.trim()), key: glmKey, label: 'GLM-4 AI' });
      engines.push({ name: 'gemini', call: () => callGemini(prompt, geminiKey.trim()), key: geminiKey, label: 'Google Gemini 1.5 Flash' });
      engines.push({ name: 'groq', call: () => callGroq(prompt, groqKey.trim()), key: groqKey, label: 'Groq LLaMA 3.3 70B' });
    } else if (preferredEngine === 'gemini') {
      engines.push({ name: 'gemini', call: () => callGemini(prompt, geminiKey.trim()), key: geminiKey, label: 'Google Gemini 1.5 Flash' });
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, glmKey.trim()), key: glmKey, label: 'GLM-4 AI' });
      engines.push({ name: 'groq', call: () => callGroq(prompt, groqKey.trim()), key: groqKey, label: 'Groq LLaMA 3.3 70B' });
    } else if (preferredEngine === 'groq') {
      engines.push({ name: 'groq', call: () => callGroq(prompt, groqKey.trim()), key: groqKey, label: 'Groq LLaMA 3.3 70B' });
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, glmKey.trim()), key: glmKey, label: 'GLM-4 AI' });
      engines.push({ name: 'gemini', call: () => callGemini(prompt, geminiKey.trim()), key: geminiKey, label: 'Google Gemini 1.5 Flash' });
    } else { // 'auto' (preferred order: GLM-4 if configured, then Gemini, then Groq)
      if (glmKey.trim()) {
        engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, glmKey.trim()), key: glmKey, label: 'GLM-4 AI' });
      }
      if (geminiKey.trim()) {
        engines.push({ name: 'gemini', call: () => callGemini(prompt, geminiKey.trim()), key: geminiKey, label: 'Google Gemini 1.5 Flash' });
      }
      if (groqKey.trim()) {
        engines.push({ name: 'groq', call: () => callGroq(prompt, groqKey.trim()), key: groqKey, label: 'Groq LLaMA 3.3 70B' });
      }
      if (!glmKey.trim() && !geminiKey.trim() && !groqKey.trim()) {
        engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, DEFAULT_AI_KEY), key: DEFAULT_AI_KEY, label: 'GLM-4 AI' });
        engines.push({ name: 'gemini', call: () => callGemini(prompt, geminiKey.trim()), key: geminiKey, label: 'Google Gemini 1.5 Flash' });
        engines.push({ name: 'groq', call: () => callGroq(prompt, groqKey.trim()), key: groqKey, label: 'Groq LLaMA 3.3 70B' });
      }
    }

    // Attempt preferred configured engines
    for (const engine of engines) {
      if (engine.key?.trim()) {
        try {
          const result = await engine.call();
          if (result) return { text: result, source: engine.label };
        } catch (e) {
          console.warn(`${engine.label} failed, trying next layer:`, e.message);
        }
      }
    }

    // Layer 3: Pollinations (keyless)
    try {
      const result = await callPollinations(prompt);
      if (result) return { text: result, source: 'Pollinations AI (Free)' };
    } catch (e) {
      console.warn('Pollinations failed, using heuristics:', e.message);
    }
    // Layer 4: Local heuristic
    return { text: null, source: 'Local Heuristic' };
  };

  // ── Build detailed stock analysis prompt ────────────────────────────────────
  const buildStockPrompt = (ctx, newsPulse = null) => {
    const { stock, historyStr, adSignal } = ctx;
    const macdSignal = stock.macd?.line > stock.macd?.signal ? 'Bullish crossover (MACD line above signal)' : 'Bearish crossover (MACD line below signal)';
    const emaSignal = stock.ltp > stock.ema50 ? 'Price above EMA50 (bullish)' : 'Price below EMA50 (bearish)';
    const chg = Number(stock.change || (stock.ltp * ((stock.pChange || 0) / 100))) || 0;
    const pClose = Number(stock.prevClose || (stock.ltp - chg)) || stock.ltp;
    const dayHigh = Number(stock.high || (stock.ltp * 1.015));
    const dayLow = Number(stock.low || (stock.ltp * 0.985));

    return `You are NEPSE GURU, the premier institutional quantitative stock market analyst and Smart Money strategist for the Nepal Stock Exchange (NEPSE).

CRITICAL EXACT PRICE DATA (MUST BE STATED CLEARLY AT THE VERY TOP):
- TARGET SCRIP: ${stock.symbol} (${stock.name})
- OFFICIAL FINAL PRICE (LTP): Rs. ${Number(stock.ltp).toFixed(2)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)} / ${chg >= 0 ? '+' : ''}${Number(stock.pChange || stock.changePercent || 0).toFixed(2)}%)
- PREVIOUS CLOSING PRICE: Rs. ${pClose.toFixed(2)}
- TODAY'S INTRADAY SESSION RANGE: Low Rs. ${dayLow.toFixed(2)} — High Rs. ${dayHigh.toFixed(2)}
- 52-WEEK RANGE: Low Rs. ${Number(stock.low52w || stock.ltp * 0.75).toFixed(1)} to High Rs. ${Number(stock.high52w || stock.ltp * 1.25).toFixed(1)}
- TRADED VOLUME: ${(stock.volume || 0).toLocaleString()} shares | TURNOVER: Rs. ${(stock.turnover || (stock.volume * stock.ltp)).toLocaleString()}

TECHNICAL & ORDER FLOW:
- RSI (14): ${stock.rsi?.toFixed(1) || 'N/A'} (${stock.rsi < 38 ? 'Oversold / Institutional Accumulation' : stock.rsi > 68 ? 'Overbought / Distribution Risk' : 'Neutral Consolidation'})
- MACD: ${macdSignal}
- Moving Averages: EMA20: Rs. ${stock.ema20 || 'N/A'}, EMA50: Rs. ${stock.ema50 || 'N/A'} (${emaSignal})
- Smart Money & Accumulation Signal: ${adSignal}

PRICE ACTION & RECENT SESSIONS:
${historyStr}

FUNDAMENTALS:
- EPS: Rs. ${stock.eps || 'N/A'} | P/E: ${stock.pe || 'N/A'} | P/B: ${stock.pb || 'N/A'} | Book Value: Rs. ${stock.bookValue || 'N/A'}

🇳🇵 MEROLAGANI LIVE POLITICAL & MACRO NEWS PULSE:
- Sentiment: ${newsPulse?.sentiment || 'Neutral / Supportive Policy'}
${(newsPulse?.keyHighlights || []).map(h => `  • ${h}`).join('\n')}

MANDATORY OUTPUT BLUEPRINT (Always start with the Official Final Price quote header):
1. 📌 LIVE MARKET PRICE & QUOTE
   - Official Final Price (LTP): Rs. ${Number(stock.ltp).toFixed(2)}
   - Previous Close & Range
2. ⚡ SMART MONEY ACTION VERDICT
   - Suggested Action: [STRONG BUY / ACCUMULATE | BUY ON DIPS | HOLD | TAKE PROFIT / EXIT]
   - Optimal Entry Zone: Rs. [Min] – Rs. [Max]
   - Target 1 (Short-Term Swing Profit): Rs. [Price] (+[%])
   - Target 2 (Major Breakout Target): Rs. [Price] (+[%])
   - Hard Stop-Loss Floor: Rs. [Price] (-[%])
   - Risk / Reward Ratio: 1 : [Ratio]
3. 📜 SEE HISTORY: Historical Momentum & Buying/Selling Patterns
4. 🔍 ANALYZE PRESENT: Technicals, Fundamentals & Merolagani Political/Macro Impact
5. 🔮 PREDICT FUTURE: Tactical Trade Execution Plan for Maximum Profit`;
  };

  // ── Stock Analyzer: main handler ────────────────────────────────────────────
  const handleAnalyze = async (symbol) => {
    if (!symbol) return;
    const sym = symbol.toUpperCase().trim();
    setAnalyzerResult(null);
    setAnalyzerError('');
    setAnalyzerLoading(true);
    setAnalyzerSuggestions([]);

    try {
      // Layer 1: Fetch live market data & Merolagani political news in parallel
      const [ctx, rawNews] = await Promise.all([
        fetchStockContext(sym),
        fetchMerolaganiNews().catch(() => [])
      ]);

      if (!ctx) {
        setAnalyzerError(`Symbol "${sym}" not found in market data.`);
        setAnalyzerLoading(false);
        return;
      }

      setAnalyzerHistory(ctx.historyData);
      const newsPulse = analyzePoliticalAndMarketPulse(rawNews);

      // Build expert prompt
      const prompt = buildStockPrompt(ctx, newsPulse);

      // Layer 2+3: LLM call
      const { text: aiText, source } = await callLLM(prompt, GURU_AI_SYSTEM_PROMPT);

      let finalText = aiText;
      if (!finalText) {
        finalText = getHeuristicResponse(`analyze ${sym}`, sym, newsPulse);
      }

      // Extract verdict from AI response
      let verdict = 'HOLD';
      const upperText = (finalText || '').toUpperCase();
      if (upperText.includes('STRONG BUY') || upperText.includes('BUY /') || upperText.includes('RECOMMENDATION: BUY') || upperText.includes('VERDICT: BUY') || upperText.includes('BUY ON DIPS')) verdict = 'BUY';
      else if (upperText.includes('VERDICT: SELL') || upperText.includes('TAKE PROFIT') || upperText.includes('RECOMMENDATION: SELL') || upperText.includes('EXIT')) verdict = 'SELL';

      setAnalyzerResult({
        symbol: sym,
        stock: ctx.stock,
        aiText: finalText,
        source: aiText ? source : '⚡ Quantitative Smart Money Engine',
        verdict,
        adSignal: ctx.adSignal,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (e) {
      setAnalyzerError(`Analysis failed: ${e.message}`);
    } finally {
      setAnalyzerLoading(false);
    }
  };

  // ── Chat submit ─────────────────────────────────────────────────────────────
  const submitQuestion = useCallback(async (text) => {
    setIsTyping(true);
    const stockSummary = marketStocks.slice(0, 30).map(s => `${s.symbol}(LTP:Rs.${s.ltp},RSI:${s.rsi?.toFixed(0)})`).join(', ');
    const portfolioSummary = activeHoldings.map(h => `${h.symbol}(${h.units}sh@WACC Rs.${h.wacc.toFixed(1)})`).join(', ');

    const words = text.toUpperCase().replace(/[^A-Z0-9]/g, ' ').split(/\s+/).filter(Boolean);
    let targetSymbol = null;
    for (const w of words) {
      if (marketStocks.some(s => s.symbol.toUpperCase() === w)) {
        targetSymbol = w;
        break;
      }
    }

    // Fetch Merolagani political news in parallel
    let newsPulse = null;
    try {
      const rawNews = await fetchMerolaganiNews();
      newsPulse = analyzePoliticalAndMarketPulse(rawNews);
    } catch (_) {}

    let prompt;
    if (targetSymbol) {
      const ctx = await fetchStockContext(targetSymbol);
      if (ctx) {
        prompt = buildStockPrompt(ctx, newsPulse) + `\n\nUSER'S EXACT QUESTION: "${text}". Please answer this question directly (e.g. entry point, target levels, support/resistance, stop-loss) at the very top of your response.`;
      }
    }

    if (!prompt) {
      prompt = `You are NEPSE GURU, the premier institutional quantitative analyst, political-macro economist, and Smart Money strategist for the Nepal Stock Exchange (NEPSE).
Market data: ${stockSummary}.
User portfolio: ${portfolioSummary || 'Empty'}.
Live Merolagani Political & Market Headlines:
${(newsPulse?.keyHighlights || []).map(h => `• ${h}`).join('\n')}

Answer concisely in clean Markdown. Help the Nepali retail investor make profit with clear entry, exit, target, and risk guidance.
User question: ${text}`;
    }

    const { text: aiText, source } = await callLLM(prompt, GURU_AI_SYSTEM_PROMPT);
    let finalText = aiText || getHeuristicResponse(text, targetSymbol, newsPulse);

    if (targetSymbol) {
      const s = marketStocks.find(st => st.symbol.toUpperCase() === targetSymbol.toUpperCase());
      if (s) {
        const ltp = Number(s.ltp).toFixed(2);
        const chg = Number(s.change || (s.ltp * ((s.pChange || 0) / 100))) || 0;
        const pChg = Number(s.pChange || 0).toFixed(2);
        const pClose = Number(s.prevClose || (s.ltp - chg)).toFixed(2);
        const dayHigh = Number(s.high || (s.ltp * 1.015)).toFixed(2);
        const dayLow = Number(s.low || (s.ltp * 0.985)).toFixed(2);

        const liveHeader = `### 📌 **${s.symbol}** (${s.name})\n` +
          `• **Official Final Price (LTP)**: **Rs. ${ltp}** (${chg >= 0 ? '+' : ''}${chg.toFixed(2)} / ${chg >= 0 ? '+' : ''}${pChg}%)\n` +
          `• **Previous Close**: Rs. ${pClose} | **Session Range**: Rs. ${dayLow} – Rs. ${dayHigh}\n\n---\n\n`;

        if (!finalText.includes(`Rs. ${ltp}`) || (!finalText.startsWith('### 📌') && !finalText.startsWith('### 📊') && !finalText.startsWith('### 🎯'))) {
          finalText = liveHeader + finalText;
        }
      }
    }

    const sourceNote = aiText 
      ? `\n\n---\n*Powered by: ${source}*` 
      : (targetSymbol 
          ? `\n\n---\n*⚡ Quantitative Smart Money Engine (Live LTP + Merolagani News)*` 
          : `\n\n---\n*⚡ NEPSE Guru Knowledge Base*`);

    setMessages(prev => [...prev, {
      sender: 'guru',
      text: finalText + sourceNote,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setIsTyping(false);
  }, [marketStocks, activeHoldings, groqKey, geminiKey]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    const userText = userInput;
    setMessages(prev => [...prev, { sender: 'user', text: userText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setUserInput('');
    submitQuestion(userText);
  };

  const handleQuickPrompt = (text) => {
    setMessages(prev => [...prev, { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    submitQuestion(text);
  };

  const handleAnalyzeFromScanner = (symbol) => {
    setActiveTab('analyzer');
    setAnalyzerSymbol(symbol);
    setAnalyzerQuery(symbol);
    handleAnalyze(symbol);
  };

  // Symbol autocomplete
  const handleQueryChange = (val) => {
    setAnalyzerQuery(val);
    if (val.length >= 1) {
      const matches = marketStocks.filter(s =>
        s.symbol.toUpperCase().includes(val.toUpperCase()) ||
        s.name.toUpperCase().includes(val.toUpperCase())
      ).slice(0, 6);
      setAnalyzerSuggestions(matches);
    } else {
      setAnalyzerSuggestions([]);
    }
  };

  const selectSuggestion = (sym) => {
    setAnalyzerSymbol(sym);
    setAnalyzerQuery(sym);
    setAnalyzerSuggestions([]);
  };

  // ── Active LLM indicator ────────────────────────────────────────────────────
  const getActiveLLM = () => {
    if (preferredEngine === 'glm' && glmKey?.trim()) return '🟣 GLM-4 AI (Active)';
    if (preferredEngine === 'gemini' && geminiKey.trim()) return '🟡 Google Gemini 1.5 Flash';
    if (preferredEngine === 'groq' && groqKey.trim()) return '🟢 Groq LLaMA 3.3 70B';
    // auto
    if (glmKey?.trim()) return '🟣 GLM-4 AI (Active)';
    if (geminiKey.trim()) return '🟡 Google Gemini 1.5 Flash';
    if (groqKey.trim()) return '🟢 Groq LLaMA 3.3 70B';
    return '🔵 Pollinations AI (Free)';
  };
  const activeLLM = getActiveLLM();

  // Dynamic greeting based on active engine
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].sender === 'guru' && (prev[0].text.includes('powered by') || prev[0].text.includes('Namaste!'))) {
        const engineName = activeLLM.split(' ').slice(1).join(' '); // remove emoji
        return [
          {
            sender: 'guru',
            text: `Namaste! 🙏 I am **NEPSE Guru**, your AI Stock Assistant powered by ${engineName}.\n\nI can:\n• Analyze any NEPSE stock in depth\n• Give BUY/HOLD/SELL verdict with reasoning\n• Check your portfolio health\n• Explain taxes & market concepts\n\nTry the **Stock Analyzer** tab or ask me anything!`,
            time: prev[0].time
          }
        ];
      }
      return prev;
    });
  }, [activeLLM]);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>

      {/* Tab Row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12, padding: '0 16px', flexShrink: 0, gap: 0, overflowX: 'auto' }}>
        {[
          { id: 'zones_radar', icon: <Zap size={14} />, label: 'Action Zones' },
          { id: 'suggestions', icon: <ListFilter size={14} />, label: 'Market Scanner' },
          { id: 'analyzer', icon: <BarChart2 size={14} />, label: 'Stock Analyzer' },
          { id: 'guru', icon: <MessageSquare size={14} />, label: 'Guru AI Chat' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '12px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: 11,
              border: 'none', borderBottom: `2.5px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'}`,
              background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5,
              whiteSpace: 'nowrap',
              color: activeTab === tab.id ? 'var(--primary-light)' : 'var(--text-muted)'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>


      {/* ── TAB: OPERATIONAL ACTION ZONES RADAR ───────────────────────────── */}
      {activeTab === 'zones_radar' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(91,94,244,0.15), rgba(16,217,138,0.1))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-md)',
            padding: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={16} color="var(--primary-light)" /> Guru AI 5-Zone Momentum Radar
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Systematic classification across Technicals, Smart Money Delta, Graham Intrinsic Value & ATR
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary-light)', background: 'rgba(91,94,244,0.15)', padding: '3px 8px', borderRadius: 12 }}>
                {radarStocks.length} Scrips
              </span>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10, paddingBottom: 4 }}>
              {[
                { id: 'ALL', label: 'All Zones', color: '#ffffff' },
                { id: 'Buying', label: '🟢 Buying Zone', color: '#10d98a' },
                { id: 'Entry', label: '🚀 Entry Zone', color: '#10d98a' },
                { id: 'Holding', label: '🔵 Holding Zone', color: '#38bdf8' },
                { id: 'Exit', label: '🟡 Exit Zone', color: '#eab308' },
                { id: 'Selling', label: '🔴 Selling Zone', color: '#ef4444' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setZoneFilter(f.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    border: zoneFilter === f.id ? `1.5px solid ${f.color}` : '1px solid rgba(255,255,255,0.08)',
                    background: zoneFilter === f.id ? `${f.color}22` : 'rgba(255,255,255,0.03)',
                    color: zoneFilter === f.id ? f.color : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrip Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {radarStocks.slice(0, 35).map(s => {
              const az = s.actionZone || classifyActionZone(s);
              const gr = s.graham;
              const isBull = (s.pChange || 0) >= 0;

              return (
                <div
                  key={s.symbol}
                  style={{
                    background: '#0d1523',
                    border: `1px solid ${az.zoneColor}33`,
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  {/* Top Line */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{s.symbol}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{s.sector}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{s.name}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: isBull ? 'var(--bull)' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
                        Rs. {s.ltp}
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: isBull ? 'var(--bull)' : '#ef4444' }}>
                        {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Zone Badge & Rationale */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '6px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: az.zoneColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Zap size={12} /> {az.zoneBadge}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8da2be' }}>
                      MS: <strong style={{ color: az.momentumScore >= 0 ? 'var(--bull)' : '#ef4444' }}>{az.momentumScore >= 0 ? '+' : ''}{az.momentumScore}</strong> · RRR: <strong>1:{az.rrr}</strong>
                    </span>
                  </div>

                  {/* 3 Parameter Pillars */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 10 }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '5px 8px', borderRadius: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Entry Target:</span>
                      <div style={{ fontWeight: 800, color: '#ffffff', marginTop: 1 }}>{az.entryTarget.split(' ')[1] || 'LTP'}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '5px 8px', borderRadius: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Graham V*:</span>
                      <div style={{ fontWeight: 800, color: gr?.isUndervalued ? 'var(--bull)' : '#38bdf8', marginTop: 1 }}>
                        Rs.{gr?.intrinsicValue || '—'} {gr?.isUndervalued ? `(+${gr.marginOfSafetyPct}%)` : ''}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '5px 8px', borderRadius: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Stop-Loss:</span>
                      <div style={{ fontWeight: 800, color: '#ef4444', marginTop: 1 }}>{az.stopLoss.split(' ')[1] || 'Stop'}</div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleAnalyzeFromScanner(s.symbol)}
                    style={{
                      marginTop: 2,
                      width: '100%',
                      padding: '7px 0',
                      borderRadius: 8,
                      background: 'rgba(91,94,244,0.12)',
                      border: '1px solid rgba(91,94,244,0.3)',
                      color: 'var(--primary-light)',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5
                    }}
                  >
                    <BarChart2 size={13} /> Deep AI Multi-Factor Analysis
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: MARKET SCANNER ─────────────────────────────────────────────── */}
      {activeTab === 'suggestions' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>


          {/* Portfolio Alerts */}
          <div>
            <h3 className="section-title" style={{ marginBottom: 8 }}>My Portfolio Action Alerts</h3>
            {portRecs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portRecs.map(rec => (
                  <div key={rec.symbol} style={{
                    padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                    ...(rec.recommendation === 'buy_more'
                      ? { background: 'var(--bull-subtle)', borderColor: 'rgba(16,217,138,0.2)' }
                      : rec.recommendation === 'take_profit'
                        ? { background: 'var(--primary-subtle)', borderColor: 'rgba(91,94,244,0.2)', boxShadow: 'var(--shadow-glow)' }
                        : { background: 'rgba(0,0,0,0.3)', borderColor: 'var(--border)' })
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{rec.symbol}</span>
                      <span className={`badge ${rec.recommendation === 'buy_more' ? 'badge-bull' : rec.recommendation === 'take_profit' ? 'badge-primary' : 'badge-gray'}`} style={{ padding: '2px 8px', fontSize: 9 }}>
                        {rec.recommendation === 'buy_more' ? 'BUY MORE' : rec.recommendation === 'take_profit' ? 'TAKE PROFIT' : 'HOLD'}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.5, opacity: 0.85 }}>{rec.reason}</p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                      <span>WACC: Rs.{rec.wacc.toFixed(1)}</span>
                      <span>LTP: Rs.{rec.ltp}</span>
                      <span style={{ color: rec.pChange >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 'bold' }}>
                        Return: {rec.pChange >= 0 ? '+' : ''}{rec.pChange.toFixed(1)}%
                      </span>
                    </div>
                    <button
                      onClick={() => handleAnalyzeFromScanner(rec.symbol)}
                      style={{ marginTop: 8, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                    >
                      🔍 Deep AI Analysis
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
                No active portfolio alerts. Log purchases in the Portfolio tab.
              </div>
            )}
          </div>

          {/* Market Opportunities */}
          <div>
            <h3 className="section-title" style={{ marginBottom: 8 }}>General Market Opportunities</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(showAllOpps ? marketOpps : marketOpps.slice(0, 5)).map(opp => (
                <div key={opp.symbol} className="card" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: 12, color: 'var(--text-primary)' }}>{opp.symbol}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{opp.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>Rs. {opp.ltp}</div>
                      <span className={`badge ${opp.type === 'bearish_sell' ? 'badge-bear' : 'badge-bull'}`} style={{ padding: '2px 6px', marginTop: 4, fontSize: 8.5 }}>
                        {opp.type === 'bearish_sell' ? 'Sell Target' : 'Buy Alert'}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: opp.description.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
                  />
                  <button
                    onClick={() => handleAnalyzeFromScanner(opp.symbol)}
                    style={{ marginTop: 6, background: 'linear-gradient(135deg,var(--primary),var(--primary-dark))', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                  >
                    🔍 AI Analysis
                  </button>
                </div>
              ))}
              {marketOpps.length > 5 && (
                <button type="button" onClick={() => setShowAllOpps(!showAllOpps)} className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }}>
                  {showAllOpps ? 'Show Less' : `Show All Opportunities (${marketOpps.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: STOCK ANALYZER ─────────────────────────────────────────────── */}
      {activeTab === 'analyzer' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* API Status Bar */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Active AI Engine: <strong style={{ color: 'var(--primary-light)' }}>{activeLLM}</strong></span>
            <button
              onClick={() => setShowApiHelp(!showApiHelp)}
              style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              Configure {showApiHelp ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          </div>

          {showApiHelp && (
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>🤖 Preferred AI Model</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { id: 'auto', label: '⚡ Auto-Select' },
                    { id: 'gemini', label: '🟡 Gemini 1.5' },
                    { id: 'groq', label: '🟢 Groq LLaMA' }
                  ].map(engine => (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => {
                        setPreferredEngine(engine.id);
                        localStorage.setItem('nepse_hub_preferred_ai_engine', engine.id);
                      }}
                      style={{
                        flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 'bold',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                        background: preferredEngine === engine.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        color: preferredEngine === engine.id ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'var(--transition)'
                      }}
                    >
                      {engine.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>🟢 Groq API Key (Fast & Free)</label>
                  <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ fontSize: 9, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    Get Free Key <ExternalLink size={8} />
                  </a>
                </div>
                <input
                  type="password"
                  value={groqKey}
                  onChange={e => saveGroqKey(e.target.value)}
                  placeholder="Paste Groq API Key (gsk_...)"
                  className="input"
                  style={{ padding: '6px 12px', fontSize: 11, width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>🟡 Gemini API Key (Highly Recommended)</label>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ fontSize: 9, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    Get Free Key <ExternalLink size={8} />
                  </a>
                </div>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => saveGeminiKey(e.target.value)}
                  placeholder="Paste Gemini API Key (AIza... or AQ...)"
                  className="input"
                  style={{ padding: '6px 12px', fontSize: 11, width: '100%' }}
                />
              </div>

              <p style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>
                Keys are stored only in your browser's localStorage — never sent to our servers.
              </p>
            </div>
          )}

          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={analyzerQuery}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { handleAnalyze(analyzerSymbol || analyzerQuery); setAnalyzerSuggestions([]); } }}
                  placeholder="Search symbol or company name (e.g. NABIL, EBL)..."
                  className="input"
                  style={{ paddingLeft: 32, fontSize: 12, width: '100%' }}
                />
              </div>
              <button
                onClick={() => { handleAnalyze(analyzerSymbol || analyzerQuery); setAnalyzerSuggestions([]); }}
                disabled={analyzerLoading}
                style={{
                  padding: '8px 16px', background: analyzerLoading ? 'var(--text-muted)' : 'linear-gradient(135deg,var(--primary),var(--primary-dark))',
                  color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 'bold', cursor: analyzerLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap'
                }}
              >
                {analyzerLoading ? <><Sparkles size={13} className="animate-spin" /> Analyzing...</> : <><BrainCircuit size={13} /> Analyze</>}
              </button>
            </div>

            {/* Autocomplete dropdown */}
            {analyzerSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', zIndex: 100, marginTop: 4,
                boxShadow: 'var(--shadow-lg)', overflow: 'hidden'
              }}>
                {analyzerSuggestions.map(s => (
                  <button
                    key={s.symbol}
                    onClick={() => selectSuggestion(s.symbol)}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12
                    }}
                  >
                    <span><strong>{s.symbol}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{s.name}</span></span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{s.sector}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {analyzerError && (
            <div style={{ background: 'rgba(255,79,106,0.1)', border: '1px solid rgba(255,79,106,0.3)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 12, color: 'var(--bear)' }}>
              ⚠️ {analyzerError}
            </div>
          )}

          {/* Loading State */}
          {analyzerLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: 32, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)'
            }}>
              <Sparkles size={28} style={{ color: 'var(--primary-light)', animation: 'spin 1s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>AI is analyzing {analyzerSymbol || analyzerQuery}...</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fetching live data → Running LLM analysis → Generating verdict</p>
              </div>
              <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ background: 'rgba(16,217,138,0.1)', padding: '2px 8px', borderRadius: 10 }}>Layer 1: NEPSE Data ✓</span>
                <span style={{ background: 'rgba(91,94,244,0.1)', padding: '2px 8px', borderRadius: 10 }}>Layer 2: {activeLLM.split(' ').slice(1).join(' ')} ⟳</span>
              </div>
            </div>
          )}

          {/* Analysis Result Card */}
          {analyzerResult && !analyzerLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(91,94,244,0.1), rgba(0,0,0,0.3))',
                border: '1px solid rgba(91,94,244,0.3)', borderRadius: 'var(--radius-lg)', padding: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>{analyzerResult.symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{analyzerResult.stock.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{analyzerResult.stock.sector}</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <VerdictBadge verdict={analyzerResult.verdict} />
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>Rs. {analyzerResult.stock.ltp}</div>
                    <span style={{ fontSize: 10, color: (analyzerResult.stock.change || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {(analyzerResult.stock.change || 0) >= 0 ? '▲' : '▼'} {Math.abs(analyzerResult.stock.change || 0)} ({analyzerResult.stock.changePercent?.toFixed(2) || '0.00'}%)
                    </span>
                  </div>
                </div>

                {/* Quick stats row */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'RSI', value: analyzerResult.stock.rsi?.toFixed(1), color: analyzerResult.stock.rsi < 35 ? 'var(--bull)' : analyzerResult.stock.rsi > 70 ? 'var(--bear)' : 'var(--text-primary)' },
                    { label: 'P/E', value: analyzerResult.stock.pe },
                    { label: 'P/B', value: analyzerResult.stock.pb },
                    { label: 'EPS', value: `Rs.${analyzerResult.stock.eps}` },
                    { label: 'ROE', value: `${analyzerResult.stock.roe}%` },
                    { label: 'Div Yield', value: `${analyzerResult.stock.divYield}%` },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '4px 10px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52
                    }}>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: stat.color || 'var(--text-primary)' }}>{stat.value || 'N/A'}</span>
                    </div>
                  ))}
                </div>

                {/* Sparkline */}
                {analyzerHistory.length > 1 && (
                  <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>PRICE HISTORY (20 SESSIONS)</div>
                    <Sparkline history={analyzerHistory} width={300} height={48} />
                  </div>
                )}

                {/* Volume/AD signal */}
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
                    📊 {analyzerResult.adSignal}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
                    🤖 {analyzerResult.source}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
                    🕒 {analyzerResult.timestamp}
                  </span>
                </div>
              </div>

              {/* AI Analysis Text */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--primary-light)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <BrainCircuit size={13} /> AI Analysis Report
                </div>
                <div
                  className="markdown-content"
                  style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)' }}
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(analyzerResult.aiText) }}
                />
              </div>

              {/* Analyze Another */}
              <button
                onClick={() => { setAnalyzerResult(null); setAnalyzerQuery(''); setAnalyzerSymbol(''); setAnalyzerHistory([]); }}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
              >
                🔍 Analyze Another Stock
              </button>
            </div>
          )}

          {/* Empty state */}
          {!analyzerResult && !analyzerLoading && !analyzerError && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: 32, background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)'
            }}>
              <BrainCircuit size={36} style={{ color: 'var(--primary-light)', opacity: 0.5 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>AI Stock Analyzer</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Search any NEPSE stock symbol above to get a complete AI analysis with BUY/HOLD/SELL verdict</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['NABIL', 'EBL', 'NICA', 'SCB', 'CBBL', 'NLIC'].map(sym => (
                  <button
                    key={sym}
                    onClick={() => { setAnalyzerQuery(sym); setAnalyzerSymbol(sym); handleAnalyze(sym); }}
                    style={{ background: 'rgba(91,94,244,0.1)', border: '1px solid rgba(91,94,244,0.3)', color: 'var(--primary-light)', borderRadius: 20, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: GURU AI CHAT ────────────────────────────────────────────────── */}
      {activeTab === 'guru' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(6,8,16,0.5)', padding: '0 16px' }}>

          {/* API Config (compact) */}
          <div style={{ marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
            <details>
              <summary style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--primary-light)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={11} /> AI Engine: {activeLLM} — Click to configure
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>🤖 Preferred AI Model</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { id: 'auto', label: '⚡ Auto' },
                      { id: 'glm', label: '🟣 GLM-4' },
                      { id: 'gemini', label: '🟡 Gemini' },
                      { id: 'groq', label: '🟢 Groq' }
                    ].map(engine => (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => {
                          setPreferredEngine(engine.id);
                          localStorage.setItem('nepse_hub_preferred_ai_engine', engine.id);
                        }}
                        style={{
                          flex: 1, padding: '5px 4px', fontSize: 9, fontWeight: 'bold',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          background: preferredEngine === engine.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                          color: preferredEngine === engine.id ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer', transition: 'var(--transition)'
                        }}
                      >
                        {engine.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 'bold' }}>🟣 GLM-4 / Zhipu AI Key (Integrated)</label>
                    <span style={{ fontSize: 9, color: 'var(--bull)' }}>✓ Pre-Configured</span>
                  </div>
                  <input type="password" value={glmKey} onChange={e => saveGlmKey(e.target.value)} placeholder="0a3ba... (GLM-4 Key)" className="input" style={{ padding: '5px 10px', fontSize: 11 }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 'bold' }}>🟢 Groq Key (Fast & Free)</label>
                    <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{ fontSize: 9, color: 'var(--primary-light)' }}>Get Key ↗</a>
                  </div>
                  <input type="password" value={groqKey} onChange={e => saveGroqKey(e.target.value)} placeholder="gsk_..." className="input" style={{ padding: '5px 10px', fontSize: 11 }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 'bold' }}>🟡 Gemini Key (Google AI)</label>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ fontSize: 9, color: 'var(--primary-light)' }}>Get Key ↗</a>
                  </div>
                  <input type="password" value={geminiKey} onChange={e => saveGeminiKey(e.target.value)} placeholder="AIza... or AQ..." className="input" style={{ padding: '5px 10px', fontSize: 11 }} />
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>Primary AI API is connected across the entire app with fallback protection.</p>
              </div>
            </details>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12, paddingRight: 4 }}>
            {messages.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: 12, fontSize: 12, lineHeight: 1.5,
                  ...(m.sender === 'user'
                    ? { background: 'var(--primary)', color: '#fff', borderRadius: '16px 16px 0 16px' }
                    : { background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '0 16px 16px 16px' })
                }}>
                  {m.sender === 'guru' ? (
                    <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(m.text) }} style={{ fontWeight: 500 }} />
                  ) : (
                    <div>{m.text}</div>
                  )}
                  <div style={{ fontSize: 9, textAlign: 'right', color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', marginTop: 4 }}>{m.time}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '0 16px 16px 16px', padding: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} style={{ color: 'var(--primary-light)', animation: 'spin 1s linear infinite' }} /> Guru is analyzing...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0', scrollbarWidth: 'none', flexShrink: 0 }}>
            {['Which stocks to buy?', 'Analyze NABIL', 'Analyze my portfolio', 'How are taxes calculated?', 'What is WACC?', 'Analyze EBL'].map(prompt => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleQuickPrompt(prompt)}
                className="sector-pill"
                style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input form */}
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 6, padding: '12px 0', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <input
              type="text"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              placeholder="Ask Guru: 'Analyze NICA' or 'Which sectors are bullish?'..."
              className="input"
              style={{ padding: '8px 16px', fontSize: 12, flex: 1, borderRadius: 50 }}
            />
            <button type="submit" style={{ padding: 10, background: 'var(--primary)', color: '#fff', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
