// src/components/AiAnalyst.jsx
// COMPLETE REWRITE - Uses real NEPSE data for AI analysis

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchTechnicalAnalysis,
  fetchTodayPrice,
  fetchCompanyFinancials,
  fetchMarketSummary,
  fetchAllSecurities,
  getProxyBase
} from '../utils/liveData';

const PROXY = getProxyBase();

// ── GURU AI PROMPTS ────────────────────────────────────────────
function buildStockPrompt(symbol, stockData, technical, financials, marketData) {
  const ind = technical?.indicators || {};
  const sig = technical?.signals || {};
  const price = stockData?.data || {};
  const fin = financials?.data || {};

  return `You are GURU AI, an expert NEPSE (Nepal Stock Exchange) investment advisor.

STOCK: ${symbol}
DATE: ${new Date().toLocaleDateString('en-NP')}

=== LIVE MARKET DATA (Real NEPSE) ===
Current Price: NPR ${price.closePrice || price.lastTradedPrice || 'N/A'}
Today Change: ${price.percentageChange || 0}%
Open: NPR ${price.openPrice || 'N/A'}
High: NPR ${price.highPrice || 'N/A'}  
Low: NPR ${price.lowPrice || 'N/A'}
Volume: ${price.totalTradedQuantity?.toLocaleString() || 'N/A'} shares
Turnover: NPR ${price.totalTradedValue?.toLocaleString() || 'N/A'}
52W High: NPR ${price.fiftyTwoWeekHigh || 'N/A'}
52W Low: NPR ${price.fiftyTwoWeekLow || 'N/A'}
Previous Close: NPR ${price.previousClose || 'N/A'}

=== TECHNICAL INDICATORS (${technical?.dataPoints || 0} days real data) ===
RSI (14): ${ind.rsi?.toFixed(2) || 'N/A'} ${ind.rsi < 30 ? '→ OVERSOLD' : ind.rsi > 70 ? '→ OVERBOUGHT' : '→ NEUTRAL'}
MACD: ${ind.macd?.toFixed(4) || 'N/A'} ${ind.macd > 0 ? '(Bullish)' : '(Bearish)'}
SMA 20: NPR ${ind.sma20?.toFixed(2) || 'N/A'}
SMA 50: NPR ${ind.sma50?.toFixed(2) || 'N/A'}
SMA 200: NPR ${ind.sma200?.toFixed(2) || 'N/A'}
EMA 12: NPR ${ind.ema12?.toFixed(2) || 'N/A'}
EMA 26: NPR ${ind.ema26?.toFixed(2) || 'N/A'}
Bollinger Upper: NPR ${ind.bollingerBands?.upper?.toFixed(2) || 'N/A'}
Bollinger Middle: NPR ${ind.bollingerBands?.middle?.toFixed(2) || 'N/A'}
Bollinger Lower: NPR ${ind.bollingerBands?.lower?.toFixed(2) || 'N/A'}
Support Level: NPR ${ind.support?.toLocaleString() || 'N/A'}
Resistance Level: NPR ${ind.resistance?.toLocaleString() || 'N/A'}
Average Volume (20d): ${ind.avgVolume20?.toLocaleString() || 'N/A'}

=== TECHNICAL SIGNALS ===
Overall Signal: ${sig.overall || 'N/A'}
Buy Signals: ${sig.buySignals || 0}
Sell Signals: ${sig.sellSignals || 0}
Confidence: ${sig.confidence?.toFixed(0) || 0}%
Individual Signals: ${sig.signals?.map(s => `${s.type}(${s.indicator}:${s.strength})`).join(', ') || 'N/A'}

=== FUNDAMENTAL DATA ===
EPS: ${fin.eps || fin.earningsPerShare || 'N/A'}
P/E Ratio: ${fin.pe || fin.priceEarnings || 'N/A'}
Book Value/Share: ${fin.bookValuePerShare || 'N/A'}
ROE: ${fin.roe || fin.returnOnEquity || 'N/A'}%
Paid Up Capital: NPR ${fin.paidUpCapital || 'N/A'}

=== NEPSE MARKET CONTEXT ===
NEPSE Index: ${marketData?.data?.nepseIndex || 'N/A'}
Market Change: ${marketData?.data?.changePercent || 0}%
Market Turnover: NPR ${((marketData?.data?.totalTurnover || 0) / 1e9).toFixed(2)}B

=== YOUR TASK ===
Provide a comprehensive investment analysis for ${symbol} for a Nepali investor.
Consider NEPSE-specific factors:
- Nepal market circuit breakers (±10% daily limit)
- Dividend season (typically Jan-May in Nepal)  
- NRB monetary policy effects on banking stocks
- Hydropower sector seasonal patterns
- Promoter share lock-in impacts
- NEPSE liquidity constraints

Respond in this EXACT JSON format:
{
  "recommendation": "BUY|SELL|HOLD|ACCUMULATE|REDUCE",
  "confidence": <0-100>,
  "riskLevel": "LOW|MEDIUM|HIGH|VERY_HIGH",
  "currentPrice": <number>,
  "targetPrice": {
    "oneMonth": <number>,
    "threeMonths": <number>,
    "sixMonths": <number>
  },
  "stopLoss": <number>,
  "analysis": "<2-3 sentence market analysis>",
  "keyReasons": ["<reason1>", "<reason2>", "<reason3>"],
  "risks": ["<risk1>", "<risk2>"],
  "investmentTips": "<specific actionable tip for Nepal market>",
  "nepseSpecific": "<Nepal-specific insight>",
  "sentiment": "VERY_BULLISH|BULLISH|NEUTRAL|BEARISH|VERY_BEARISH"
}`;
}

function buildPortfolioPrompt(portfolio, marketData) {
  const holdings = portfolio.map(h =>
    `${h.symbol}: ${h.quantity} shares @ NPR ${h.avgPrice} (Current: NPR ${h.currentPrice || 'N/A'}, P/L: ${h.profitLossPercent?.toFixed(2) || 'N/A'}%)`
  ).join('\n');

  return `You are GURU AI, a NEPSE portfolio advisor.

=== MY PORTFOLIO (Real prices from NEPSE) ===
${holdings}

Total Invested: NPR ${portfolio.reduce((s, h) => s + (h.investedValue || 0), 0).toLocaleString()}
Current Value: NPR ${portfolio.reduce((s, h) => s + (h.currentValue || 0), 0).toLocaleString()}

=== NEPSE MARKET ===
NEPSE Index: ${marketData?.data?.nepseIndex || 'N/A'}
Market Change: ${marketData?.data?.changePercent || 0}%

Analyze this portfolio and respond in JSON:
{
  "overallHealth": "EXCELLENT|GOOD|FAIR|POOR",
  "healthScore": <0-100>,
  "diversificationScore": <0-100>,
  "riskScore": <0-100>,
  "topHolding": "<symbol>",
  "sectorConcentration": "<analysis>",
  "recommendations": [
    {"action": "BUY|SELL|HOLD", "symbol": "<symbol>", "reason": "<reason>", "urgency": "HIGH|MEDIUM|LOW"}
  ],
  "rebalancingSuggestions": ["<suggestion1>", "<suggestion2>"],
  "portfolioStrengths": ["<strength1>", "<strength2>"],
  "portfolioWeaknesses": ["<weakness1>", "<weakness2>"],
  "expectedAnnualReturn": "<percentage range>",
  "overallAdvice": "<2-3 sentence portfolio summary>"
}`;
}

function buildMarketPrompt(marketData, indices, topGainers, topLosers) {
  return `You are GURU AI, NEPSE market analyst.

=== LIVE NEPSE MARKET DATA ===
NEPSE Index: ${marketData?.data?.nepseIndex || 'N/A'}
Change: ${marketData?.data?.changePercent || 0}%
Total Turnover: NPR ${((marketData?.data?.totalTurnover || 0) / 1e9).toFixed(2)}B
Total Transactions: ${marketData?.data?.totalTransactions?.toLocaleString() || 'N/A'}
Listed Scrips: ${marketData?.data?.totalScrips || 'N/A'}

Top Gainers Today: ${topGainers?.slice(0, 5).map(s => `${s.symbol}(+${s.percentageChange?.toFixed(1)}%)`).join(', ') || 'N/A'}
Top Losers Today: ${topLosers?.slice(0, 5).map(s => `${s.symbol}(${s.percentageChange?.toFixed(1)}%)`).join(', ') || 'N/A'}

Provide NEPSE market outlook in JSON:
{
  "marketSentiment": "VERY_BULLISH|BULLISH|NEUTRAL|BEARISH|VERY_BEARISH",
  "weeklyOutlook": "UP|SIDEWAYS|DOWN",
  "confidence": <0-100>,
  "keyLevels": {
    "nepseSupport": <number>,
    "nepseResistance": <number>
  },
  "sectorsToWatch": ["<sector1>", "<sector2>", "<sector3>"],
  "stocksToWatch": ["<symbol1>", "<symbol2>", "<symbol3>"],
  "marketAnalysis": "<3-4 sentence market analysis>",
  "investorAdvice": "<specific advice for current market>",
  "riskFactors": ["<risk1>", "<risk2>"],
  "opportunities": ["<opportunity1>", "<opportunity2>"]
}`;
}

// ── GURU RESPONSE RENDERER ─────────────────────────────────────
const GuruResponse = ({ data, type }) => {
  if (!data) return null;

  let parsed = data;
  if (typeof data === 'string') {
    try {
      const match = data.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else parsed = { analysis: data, raw: true };
    } catch {
      parsed = { analysis: data, raw: true };
    }
  }

  if (parsed.raw) {
    return (
      <div style={{
        background: '#f8fafc', borderRadius: 12,
        padding: '16px 20px', border: '1px solid #e2e8f0',
        lineHeight: 1.7, fontSize: '0.9rem'
      }}>
        {parsed.analysis}
      </div>
    );
  }

  const recColor = {
    BUY: '#16a34a', ACCUMULATE: '#16a34a',
    SELL: '#dc2626', REDUCE: '#dc2626',
    HOLD: '#d97706'
  };

  const sentColor = {
    VERY_BULLISH: '#15803d', BULLISH: '#16a34a',
    NEUTRAL: '#d97706', BEARISH: '#dc2626', VERY_BEARISH: '#991b1b'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Main Signal */}
      {(parsed.recommendation || parsed.marketSentiment || parsed.overallHealth) && (
        <div style={{
          background: parsed.recommendation === 'BUY' || parsed.recommendation === 'ACCUMULATE'
            ? '#f0fff4' : parsed.recommendation === 'SELL' || parsed.recommendation === 'REDUCE'
            ? '#fff5f5' : '#fffbeb',
          border: `2px solid ${recColor[parsed.recommendation] || sentColor[parsed.marketSentiment] || '#d97706'}`,
          borderRadius: 14, padding: '18px 22px', textAlign: 'center'
        }}>
          <div style={{
            fontSize: '2rem', fontWeight: 900,
            color: recColor[parsed.recommendation] || sentColor[parsed.marketSentiment] || '#d97706',
            marginBottom: 6
          }}>
            {parsed.recommendation === 'BUY' || parsed.recommendation === 'ACCUMULATE' ? '🟢' :
              parsed.recommendation === 'SELL' || parsed.recommendation === 'REDUCE' ? '🔴' : '🟡'}{' '}
            {parsed.recommendation || parsed.marketSentiment || parsed.overallHealth}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
            {parsed.confidence !== undefined && (
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Confidence</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{parsed.confidence}%</div>
              </div>
            )}
            {parsed.riskLevel && (
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Risk</div>
                <div style={{
                  fontWeight: 800, fontSize: '1.1rem',
                  color: parsed.riskLevel === 'LOW' ? '#16a34a' : parsed.riskLevel === 'HIGH' || parsed.riskLevel === 'VERY_HIGH' ? '#dc2626' : '#d97706'
                }}>
                  {parsed.riskLevel}
                </div>
              </div>
            )}
            {parsed.healthScore !== undefined && (
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Health Score</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{parsed.healthScore}/100</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price Targets */}
      {parsed.targetPrice && (
        <div style={{
          background: '#f8fafc', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem' }}>🎯 Price Targets</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: '1 Month', value: parsed.targetPrice.oneMonth },
              { label: '3 Months', value: parsed.targetPrice.threeMonths },
              { label: '6 Months', value: parsed.targetPrice.sixMonths },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', background: '#fff', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.label}</div>
                <div style={{ fontWeight: 800, color: '#16a34a', fontSize: '1rem' }}>
                  NPR {item.value?.toLocaleString() || 'N/A'}
                </div>
              </div>
            ))}
          </div>
          {parsed.stopLoss && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: '#fff5f5', borderRadius: 8, textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Stop Loss: </span>
              <span style={{ fontWeight: 800, color: '#dc2626' }}>NPR {parsed.stopLoss?.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Analysis */}
      {(parsed.analysis || parsed.marketAnalysis || parsed.overallAdvice) && (
        <div style={{
          background: '#f8fafc', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>📊 Analysis</div>
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.7, color: '#374151' }}>
            {parsed.analysis || parsed.marketAnalysis || parsed.overallAdvice}
          </p>
        </div>
      )}

      {/* Key Reasons / Recommendations */}
      {(parsed.keyReasons || parsed.recommendations || parsed.portfolioStrengths) && (
        <div style={{
          background: '#f0fff4', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #86efac'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem', color: '#15803d' }}>
            ✅ {parsed.keyReasons ? 'Key Reasons' : parsed.recommendations ? 'Recommendations' : 'Strengths'}
          </div>
          {(parsed.keyReasons || parsed.portfolioStrengths || []).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ color: '#16a34a', marginTop: 1 }}>●</span>
              <span style={{ fontSize: '0.85rem', color: '#374151' }}>{r}</span>
            </div>
          ))}
          {parsed.recommendations?.map((rec, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, marginBottom: 8,
              alignItems: 'center', background: '#fff',
              padding: '8px 12px', borderRadius: 8
            }}>
              <span style={{
                padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                background: rec.action === 'BUY' ? '#dcfce7' : rec.action === 'SELL' ? '#fee2e2' : '#fef9c3',
                color: rec.action === 'BUY' ? '#15803d' : rec.action === 'SELL' ? '#b91c1c' : '#713f12'
              }}>
                {rec.action}
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{rec.symbol}</span>
              <span style={{ fontSize: '0.82rem', color: '#64748b', flex: 1 }}>{rec.reason}</span>
              <span style={{
                fontSize: '0.7rem', fontWeight: 600,
                color: rec.urgency === 'HIGH' ? '#dc2626' : '#d97706'
              }}>
                {rec.urgency}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Risks */}
      {(parsed.risks || parsed.riskFactors || parsed.portfolioWeaknesses) && (
        <div style={{
          background: '#fff5f5', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #fca5a5'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem', color: '#dc2626' }}>
            ⚠️ {parsed.risks ? 'Risks' : parsed.riskFactors ? 'Risk Factors' : 'Weaknesses'}
          </div>
          {(parsed.risks || parsed.riskFactors || parsed.portfolioWeaknesses || []).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ color: '#dc2626', marginTop: 1 }}>●</span>
              <span style={{ fontSize: '0.85rem', color: '#374151' }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nepal Specific */}
      {(parsed.nepseSpecific || parsed.investorAdvice || parsed.investmentTips) && (
        <div style={{
          background: '#fefce8', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #fde68a'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.9rem', color: '#92400e' }}>
            🇳🇵 Nepal Market Insight
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.7, color: '#374151' }}>
            {parsed.nepseSpecific || parsed.investorAdvice || parsed.investmentTips}
          </p>
        </div>
      )}

      {/* Sectors to Watch */}
      {parsed.sectorsToWatch && (
        <div style={{
          background: '#f0f9ff', borderRadius: 12,
          padding: '14px 18px', border: '1px solid #bae6fd'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem', color: '#0369a1' }}>
            🔭 Sectors to Watch
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {parsed.sectorsToWatch.map((s, i) => (
              <span key={i} style={{
                padding: '4px 14px', borderRadius: 20,
                background: '#dbeafe', color: '#1d4ed8',
                fontSize: '0.82rem', fontWeight: 600
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stocks to Watch */}
      {parsed.stocksToWatch && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748b', alignSelf: 'center' }}>
            👁️ Watch:
          </span>
          {parsed.stocksToWatch.map((s, i) => (
            <span key={i} style={{
              padding: '4px 12px', borderRadius: 20,
              background: '#f1f5f9', color: '#475569',
              fontSize: '0.82rem', fontWeight: 700,
              border: '1px solid #e2e8f0'
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── CHAT MESSAGE ──────────────────────────────────────────────
const ChatMessage = ({ msg }) => {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16, alignItems: 'flex-start', gap: 10
    }}>
      {!isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '1.1rem',
          flexShrink: 0, marginTop: 2
        }}>
          🤖
        </div>
      )}

      <div style={{ maxWidth: '85%' }}>
        {isUser ? (
          <div style={{
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            color: 'white', padding: '12px 16px',
            borderRadius: '18px 18px 4px 18px',
            fontSize: '0.9rem', lineHeight: 1.5
          }}>
            {msg.content}
          </div>
        ) : msg.isLoading ? (
          <div style={{
            background: 'white', border: '1px solid #e2e8f0',
            padding: '14px 18px', borderRadius: '4px 18px 18px 18px',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{
              display: 'flex', gap: 4
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#3b82f6',
                  animation: `bounce 1.2s ${i * 0.2}s infinite`
                }} />
              ))}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              GURU is analyzing real NEPSE data...
            </span>
          </div>
        ) : msg.guruData ? (
          <div style={{
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '4px 18px 18px 18px', padding: '16px 20px'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 14, paddingBottom: 10,
              borderBottom: '1px solid #f1f5f9'
            }}>
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>GURU AI Analysis</span>
              <span style={{
                padding: '2px 8px', borderRadius: 20,
                background: '#dcfce7', color: '#15803d',
                fontSize: '0.7rem', fontWeight: 600
              }}>
                Real NEPSE Data
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>
                {msg.timestamp}
              </span>
            </div>
            <GuruResponse data={msg.guruData} type={msg.analysisType} />
          </div>
        ) : (
          <div style={{
            background: 'white', border: '1px solid #e2e8f0',
            padding: '12px 16px', borderRadius: '4px 18px 18px 18px',
            fontSize: '0.88rem', lineHeight: 1.6, color: '#374151'
          }}>
            {msg.content}
          </div>
        )}

        {msg.role !== 'user' && !msg.isLoading && (
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 4, paddingLeft: 4 }}>
            {msg.timestamp}
          </div>
        )}
      </div>

      {isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#f1f5f9', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem', flexShrink: 0
        }}>
          👤
        </div>
      )}
    </div>
  );
};

// ── MAIN GURU AI COMPONENT ─────────────────────────────────────
export default function AiAnalyst() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: null,
      guruData: {
        analysis: `Namaste! I am **GURU AI** — your intelligent NEPSE investment advisor powered by real market data.

I analyze:
📊 Live prices from nepalstock.com
📐 Technical indicators (RSI, MACD, Bollinger Bands)
💼 Company fundamentals (EPS, P/E, Book Value)
🏛️ NEPSE market conditions
📰 Nepal economic factors

Ask me to analyze any NEPSE stock or your portfolio!`,
        raw: true
      },
      timestamp: new Date().toLocaleTimeString()
    }
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [symbol, setSymbol] = useState('');
  const [allSymbols, setAllSymbols] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [marketData, setMarketData] = useState(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    // Load symbols for dropdown
    fetchAllSecurities().then(r => {
      if (r.success && r.data) {
        setAllSymbols(r.data.map(s => s.symbol).sort());
      }
    });

    // Load market data for context
    fetchMarketSummary().then(r => {
      if (r.success) setMarketData(r);
    });

    // Load portfolio from localStorage
    const saved = localStorage.getItem('nepse_portfolio');
    if (saved) {
      try { setPortfolio(JSON.parse(saved)); } catch { }
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, {
      ...msg,
      timestamp: new Date().toLocaleTimeString()
    }]);
  }, []);

  const callGuruAI = async (prompt, analysisType = 'general') => {
    try {
      const res = await fetch(`${PROXY}/api/guru/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, analysisType }),
        signal: AbortSignal.timeout(60000)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      return data;
    } catch (err) {
      // Automatic client fallback to multi-provider AI if proxy endpoint is not available
      try {
        const { generateNepseAiContent } = await import('../services/aiService');
        const text = await generateNepseAiContent(prompt, '');
        if (text) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try { return { success: true, data: JSON.parse(match[0]) }; } catch {}
          }
          return { success: true, data: text };
        }
      } catch (_) {}
      throw new Error(err.message);
    }
  };

  const analyzeStock = async (sym) => {
    if (!sym) return;
    setLoading(true);

    addMessage({ role: 'user', content: `Analyze ${sym} stock for me` });

    const loadingId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant', isLoading: true,
      id: loadingId, timestamp: new Date().toLocaleTimeString()
    }]);

    try {
      // Fetch all data in parallel
      const [stockData, technical, financials] = await Promise.all([
        fetchTodayPrice(sym),
        fetchTechnicalAnalysis(sym),
        fetchCompanyFinancials(sym)
      ]);

      const prompt = buildStockPrompt(sym, stockData, technical?.data, financials, marketData);
      const result = await callGuruAI(prompt, 'stock');

      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          guruData: result.data || result,
          analysisType: 'stock',
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));

    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          content: `❌ Analysis failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));

      if (err.message.includes('API key') || err.message.includes('Gemini')) {
        setApiKeyMissing(true);
      }
    }

    setLoading(false);
  };

  const analyzePortfolio = async () => {
    if (portfolio.length === 0) {
      addMessage({
        role: 'assistant',
        content: '💼 No portfolio found. Add stocks to your portfolio first, then I can analyze it!'
      });
      return;
    }

    setLoading(true);
    addMessage({ role: 'user', content: 'Analyze my portfolio and give investment advice' });

    const loadingId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant', isLoading: true, id: loadingId,
      timestamp: new Date().toLocaleTimeString()
    }]);

    try {
      // Get live prices for portfolio
      const res = await fetch(`${PROXY}/api/portfolio/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: portfolio })
      });
      const portfolioData = await res.json();
      const livePortfolio = portfolioData.data?.holdings || portfolio;

      const prompt = buildPortfolioPrompt(livePortfolio, marketData);
      const result = await callGuruAI(prompt, 'portfolio');

      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          guruData: result.data || result,
          analysisType: 'portfolio',
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          content: `❌ Portfolio analysis failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    }

    setLoading(false);
  };

  const getMarketOutlook = async () => {
    setLoading(true);
    addMessage({ role: 'user', content: 'What is the current NEPSE market outlook?' });

    const loadingId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant', isLoading: true, id: loadingId,
      timestamp: new Date().toLocaleTimeString()
    }]);

    try {
      const [gainers, losers] = await Promise.all([
        fetch(`${PROXY}/api/market/top-gainers`).then(r => r.json()),
        fetch(`${PROXY}/api/market/top-losers`).then(r => r.json())
      ]);

      const prompt = buildMarketPrompt(
        marketData,
        null,
        gainers.data || [],
        losers.data || []
      );
      const result = await callGuruAI(prompt, 'market');

      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          guruData: result.data || result,
          analysisType: 'market',
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          content: `❌ Market analysis failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    }

    setLoading(false);
  };

  const sendChat = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');

    addMessage({ role: 'user', content: userMsg });

    const loadingId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant', isLoading: true, id: loadingId,
      timestamp: new Date().toLocaleTimeString()
    }]);

    setLoading(true);

    try {
      const contextPrompt = `You are GURU AI, a NEPSE investment advisor.
Current NEPSE Index: ${marketData?.data?.nepseIndex || 'N/A'}
Market Change: ${marketData?.data?.changePercent || 0}%

User Question: ${userMsg}

Answer concisely and helpfully. If about a specific stock, provide technical/fundamental insights.
If you recommend buying or selling, always mention risks.
Always provide Nepal-specific context.
Keep response under 200 words unless analysis is requested.
Format as plain text (not JSON) for this conversational response.`;

      const result = await callGuruAI(contextPrompt, 'chat');

      const responseText = typeof result === 'string' ? result :
        result?.data?.analysis || result?.data || result?.text || JSON.stringify(result);

      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          role: 'assistant',
          content: `❌ ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        } : m
      ));
    }

    setLoading(false);
  };

  const QUICK_ACTIONS = [
    { label: '📊 Market Outlook', action: getMarketOutlook },
    { label: '💼 My Portfolio', action: analyzePortfolio },
    { label: '🚀 Top Stock Pick', action: () => { setInput('Which NEPSE stock should I buy right now?'); } },
    { label: '⚠️ Market Risk', action: () => { setInput('What are the main risks in NEPSE market right now?'); } },
  ];

  const SAMPLE_QUESTIONS = [
    'Should I buy NABIL bank stock now?',
    'Analyze NICA using technical indicators',
    'What sectors are performing well in NEPSE?',
    'Explain the impact of NRB policy on banking stocks',
    'Which hydropower stocks have good fundamentals?',
    'How does dividend season affect NEPSE prices?',
    'What is a good P/E ratio for NEPSE stocks?',
    'Explain circuit breaker rules in NEPSE',
  ];

  return (
    <div style={{
      height: 'calc(100vh - 120px)',
      display: 'flex', flexDirection: 'column',
      background: '#f8fafc', fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1d4ed8)',
        padding: '14px 20px', color: 'white',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '2rem' }}>🤖</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>GURU AI</div>
            <div style={{ fontSize: '0.72rem', color: '#93c5fd' }}>
              Powered by real NEPSE data • Gemini AI
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            padding: '3px 10px', borderRadius: 20,
            background: '#064e3b', color: '#34d399',
            fontSize: '0.7rem', fontWeight: 700
          }}>
            ✅ LIVE DATA
          </span>
          <span style={{
            padding: '3px 10px', borderRadius: 20,
            background: '#1e293b', color: '#64748b',
            fontSize: '0.7rem'
          }}>
            NEPSE: {marketData?.data?.nepseIndex?.toFixed(2) || '...'}
          </span>
        </div>
      </div>

      {/* API Key Warning */}
      {apiKeyMissing && (
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b',
          padding: '10px 16px', fontSize: '0.82rem', color: '#92400e'
        }}>
          ⚠️ <strong>Gemini API key missing.</strong> Add GEMINI_API_KEY to Render environment variables.
          Dashboard → nepse-proxy → Environment → Add Variable
        </div>
      )}

      {/* Tab Bar */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        display: 'flex', padding: '0 16px'
      }}>
        {[
          { id: 'chat', label: '💬 Chat' },
          { id: 'stock', label: '📊 Stock Analysis' },
          { id: 'market', label: '🌐 Market Outlook' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #1d4ed8' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stock Analysis Tab */}
      {activeTab === 'stock' && (
        <div style={{ padding: '16px 20px', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              style={{
                flex: 1, padding: '10px 14px',
                border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: '0.9rem'
              }}
            >
              <option value="">Select stock to analyze...</option>
              {allSymbols.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => analyzeStock(symbol)}
              disabled={!symbol || loading}
              style={{
                padding: '10px 24px',
                background: symbol && !loading ? '#1d4ed8' : '#e2e8f0',
                color: symbol && !loading ? 'white' : '#94a3b8',
                border: 'none', borderRadius: 8,
                fontWeight: 700, cursor: symbol ? 'pointer' : 'not-allowed'
              }}
            >
              {loading ? '⏳' : '🤖 Analyze'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {['NABIL', 'NICA', 'ADBL', 'HBL', 'GBIME', 'NLIC', 'SCB', 'KBL'].map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); analyzeStock(s); }}
                style={{
                  padding: '4px 12px', borderRadius: 20,
                  background: '#f1f5f9', border: '1px solid #e2e8f0',
                  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', color: '#475569'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Market Outlook Tab */}
      {activeTab === 'market' && (
        <div style={{ padding: '12px 20px', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={getMarketOutlook}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: loading ? '#e2e8f0' : '#1d4ed8',
              color: loading ? '#94a3b8' : 'white',
              border: 'none', borderRadius: 8,
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              marginRight: 10
            }}
          >
            {loading ? '⏳ Analyzing...' : '🌐 Get Market Outlook'}
          </button>
          <button
            onClick={analyzePortfolio}
            disabled={loading || portfolio.length === 0}
            style={{
              padding: '10px 24px',
              background: !loading && portfolio.length > 0 ? '#7c3aed' : '#e2e8f0',
              color: !loading && portfolio.length > 0 ? 'white' : '#94a3b8',
              border: 'none', borderRadius: 8,
              fontWeight: 700, cursor: portfolio.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            💼 Analyze My Portfolio ({portfolio.length} stocks)
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick Actions */}
      {activeTab === 'chat' && messages.length <= 2 && (
        <div style={{
          padding: '10px 20px', background: 'white',
          borderTop: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>
            Quick Actions:
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {QUICK_ACTIONS.map((qa, i) => (
              <button
                key={i}
                onClick={qa.action}
                disabled={loading}
                style={{
                  padding: '6px 14px', borderRadius: 20,
                  background: '#eff6ff', border: '1px solid #bfdbfe',
                  color: '#1d4ed8', fontSize: '0.78rem',
                  fontWeight: 600, cursor: 'pointer'
                }}
              >
                {qa.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SAMPLE_QUESTIONS.slice(0, 4).map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                style={{
                  padding: '4px 12px', borderRadius: 20,
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  color: '#475569', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 16px', background: 'white',
        borderTop: '1px solid #e2e8f0',
        display: 'flex', gap: 10, alignItems: 'flex-end'
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendChat();
            }
          }}
          placeholder="Ask GURU AI anything about NEPSE stocks..."
          disabled={loading}
          rows={2}
          style={{
            flex: 1, padding: '10px 14px',
            border: '1px solid #e2e8f0', borderRadius: 10,
            fontSize: '0.9rem', resize: 'none',
            fontFamily: 'inherit', lineHeight: 1.5
          }}
        />
        <button
          onClick={sendChat}
          disabled={!input.trim() || loading}
          style={{
            padding: '10px 20px', borderRadius: 10,
            background: input.trim() && !loading ? '#1d4ed8' : '#e2e8f0',
            color: input.trim() && !loading ? 'white' : '#94a3b8',
            border: 'none', fontWeight: 700, cursor: 'pointer',
            fontSize: '1.1rem', minWidth: 50
          }}
        >
          {loading ? '⏳' : '↑'}
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
