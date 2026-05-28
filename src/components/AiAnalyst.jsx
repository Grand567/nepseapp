import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, MessageSquare, ListFilter, AlertTriangle, ArrowRight, ShieldAlert, Cpu, Sparkles, Send } from 'lucide-react';
import { calculateBuyDetails } from '../utils/calculations';
import { generateMockDematPortfolio } from '../utils/mockData';

// Simple but robust Markdown parser helper
const parseMarkdown = (text) => {
  if (!text) return '';
  
  // Escape HTML to prevent XSS
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert double asterisks to strong
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Convert single asterisks/underscores to em
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Handle list items and paragraphs
  const lines = escaped.split('\n');
  let inList = false;
  const processedLines = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || (trimmed.startsWith('*') && !trimmed.endsWith('*'))) {
      // Extract content after bullet marker
      const content = trimmed.substring(1).trim();
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      processedLines.push(`<li>${content}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (trimmed) {
        processedLines.push(`<p>${line}</p>`);
      } else {
        // preserve empty lines
        processedLines.push('<br />');
      }
    }
  });

  if (inList) {
    processedLines.push('</ul>');
  }

  return processedLines.join('\n');
};

export default function AiAnalyst({ marketStocks }) {
  const [activeTab, setActiveTab] = useState('suggestions');
  const [showAllOpps, setShowAllOpps] = useState(false);
  
  // Recommendations states
  const [portfolioTxs, setPortfolioTxs] = useState([]);
  
  // Gemini/Chatbot states
  const [messages, setMessages] = useState([
    { sender: 'guru', text: "Namaste! I am NEPSE Guru, your AI Stock Assistant. Ask me anything about stock analysis, calculations, or ask me to scan your holdings!", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const chatEndRef = useRef(null);

  // Load state on mount
  useEffect(() => {
    // Load portfolio to make recommendations
    const savedTxs = localStorage.getItem('nepse_hub_portfolio_transactions');
    if (savedTxs) {
      try { setPortfolioTxs(JSON.parse(savedTxs)); } catch(e) {}
    }

    // Load gemini key
    const savedKey = localStorage.getItem('nepse_hub_gemini_api_key');
    if (savedKey) setGeminiKey(savedKey);
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const saveGeminiKey = (key) => {
    setGeminiKey(key);
    localStorage.setItem('nepse_hub_gemini_api_key', key);
  };

  // Group portfolio transactions to get WACC and quantity
  const getHoldings = () => {
    const holdingsMap = {};
    const chronologicalTxs = [...portfolioTxs].reverse();

    chronologicalTxs.forEach(tx => {
      if (!holdingsMap[tx.symbol]) {
        holdingsMap[tx.symbol] = { symbol: tx.symbol, units: 0, totalInvestedCost: 0, wacc: 0 };
      }
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

    const manualHoldings = Object.values(holdingsMap).filter(h => h.units > 0);

    // Also pull Demat fetch portfolios
    const savedProfiles = localStorage.getItem('nepse_hub_meroshare_profiles');
    if (savedProfiles) {
      try {
        const profiles = JSON.parse(savedProfiles);
        profiles.forEach(p => {
          const dematHoldings = generateMockDematPortfolio(p.boid, marketStocks);
          dematHoldings.forEach(dh => {
            if (!holdingsMap[dh.symbol]) {
              holdingsMap[dh.symbol] = { symbol: dh.symbol, units: 0, totalInvestedCost: 0, wacc: dh.wacc };
            }
            const holding = holdingsMap[dh.symbol];
            
            // Recalculate WACC by combining manual and demat
            const totalUnits = holding.units + dh.units;
            if (totalUnits > 0) {
              const currentTotalValue = holding.units * holding.wacc;
              const newDematValue = dh.units * dh.wacc;
              holding.wacc = (currentTotalValue + newDematValue) / totalUnits;
            }
            holding.units += dh.units;
            holding.totalInvestedCost += (dh.units * dh.wacc);
          });
        });
      } catch (e) {}
    }

    return Object.values(holdingsMap).filter(h => h.units > 0);
  };

  const activeHoldings = getHoldings();

  // 1. Calculate plain-language recommendations for portfolio holdings
  const getPortfolioRecommendations = () => {
    return activeHoldings.map(h => {
      const stock = marketStocks.find(s => s.symbol === h.symbol);
      if (!stock) return null;

      const gainLossPercent = ((stock.ltp - h.wacc) / h.wacc) * 100;
      
      let recommendation = 'hold'; // 'buy_more', 'take_profit', 'hold'
      let reason = 'Market metrics are stable. Suggest holding and monitoring trend.';

      // Check buy more (Average down)
      if (stock.rsi < 36 && stock.ltp < h.wacc) {
        recommendation = 'buy_more';
        reason = `Oversold alert (RSI: ${stock.rsi.toFixed(0)}). Stock trading below your buying price (WACC: Rs. ${h.wacc.toFixed(1)}). Buying now reduces average cost.`;
      } 
      // Check take profit
      else if (stock.rsi > 70 && gainLossPercent > 12) {
        recommendation = 'take_profit';
        reason = `Overbought alert (RSI: ${stock.rsi.toFixed(0)}). You are currently sitting on a solid gain (+${gainLossPercent.toFixed(1)}%). Consider lock-in profits.`;
      }
      // RSI warning (without profit)
      else if (stock.rsi > 75) {
        recommendation = 'hold';
        reason = `Stock approaching heavy overbought zone (RSI: ${stock.rsi.toFixed(0)}). High risk of immediate correction. Avoid buying more right now.`;
      }

      return {
        symbol: h.symbol,
        units: h.units,
        wacc: h.wacc,
        ltp: stock.ltp,
        pChange: gainLossPercent,
        recommendation,
        reason
      };
    }).filter(Boolean);
  };

  const portRecs = getPortfolioRecommendations();

  // 2. Scan whole market to find general buy/sell opportunities
  const getMarketOpportunities = () => {
    const opportunities = [];

    marketStocks.forEach(stock => {
      if (stock.rsi < 35) {
        opportunities.push({
          symbol: stock.symbol,
          name: stock.name,
          ltp: stock.ltp,
          rsi: stock.rsi,
          type: 'bullish_buy',
          description: `Oversold condition (RSI is ${stock.rsi.toFixed(0)}). This suggests seller exhaustion. In simple words: **Cheap entry point**.`
        });
      } else if (stock.rsi > 72) {
        opportunities.push({
          symbol: stock.symbol,
          name: stock.name,
          ltp: stock.ltp,
          rsi: stock.rsi,
          type: 'bearish_sell',
          description: `Overbought levels reached (RSI is ${stock.rsi.toFixed(0)}). Heavily saturated buy volume, correction likely. In simple words: **Take Profit/Avoid buying**.`
        });
      } else if (stock.macd.line > stock.macd.signal && stock.rsi > 45 && stock.rsi < 62 && stock.change > 0) {
        opportunities.push({
          symbol: stock.symbol,
          name: stock.name,
          ltp: stock.ltp,
          rsi: stock.rsi,
          type: 'momentum_buy',
          description: `Bullish MACD Crossover (RSI: ${stock.rsi.toFixed(0)}). Positive market momentum building up. In simple words: **Bullish trend starting**.`
        });
      }
    });

    return opportunities;
  };

  const marketOpps = getMarketOpportunities();

  // 3. Local Heuristic Chatbot response engine
  const getHeuristicResponse = (query) => {
    const q = query.toLowerCase();
    
    if (q.includes('suggest') || q.includes('buy') || q.includes('opportunity') || q.includes('recommend')) {
      const bestBuys = marketStocks.filter(s => s.rsi < 38).slice(0, 3);
      if (bestBuys.length > 0) {
        let text = "Here are the top oversold opportunities I scanned in the market right now (RSI < 38):\n\n";
        bestBuys.forEach(s => {
          text += `• **${s.symbol}** (LTP: Rs. ${s.ltp}, RSI: ${s.rsi.toFixed(0)}). This stock is technically oversold. Buyers are looking for a rebound.\n`;
        });
        text += "\n*Remember to check the company's EPS and WACC calculator before buying.*";
        return text;
      } else {
        return "Market is currently in consolidation. I don't see extreme oversold indicators on major symbols. Keep an eye on sector performance!";
      }
    }

    if (q.includes('portfolio') || q.includes('holdings') || q.includes('my stock')) {
      if (activeHoldings.length === 0) {
        return "You haven't logged any transactions in your Portfolio tab yet! Go to the 'Portfolio' page and log some buy records first.";
      }
      
      let text = "Analyzing your active portfolio holdings:\n\n";
      activeHoldings.forEach(h => {
        const stock = marketStocks.find(s => s.symbol === h.symbol);
        if (stock) {
          const diff = ((stock.ltp - h.wacc) / h.wacc) * 100;
          text += `• **${h.symbol}**: ${h.units} shares (WACC: Rs. ${h.wacc.toFixed(1)}, LTP: Rs. ${stock.ltp}). Net Return: **${diff.toFixed(1)}%**. `;
          if (stock.rsi < 36) {
            text += "⚠️ *Oversold! Good time to average down.*";
          } else if (stock.rsi > 70) {
            text += "🚀 *Overbought! Consider locking profit.*";
          } else {
            text += "Holding stable.";
          }
          text += "\n";
        }
      });
      return text;
    }

    if (q.includes('tax') || q.includes('cgt') || q.includes('commission')) {
      return "Under current SEBON rules:\n\n1. **Broker Commission:** Ranges from **0.27% to 0.40%** depending on transaction size.\n2. **SEBON Fee:** **0.015%** of trade value.\n3. **DP Charge:** **Rs. 25** per company transaction.\n4. **Capital Gains Tax (CGT):** Paid on profits only. **5%** for long-term (>365 days) and **7.5%** for short-term (<365 days).";
    }

    if (q.includes('wacc')) {
      return "**Weighted Average Cost of Capital (WACC)** is the average cost at which you purchased your shares, including broker commissions, SEBON fees, and DP charges. It represents your true purchase price. On MeroShare, you must confirm WACC after selling to declare your tax base correctly.";
    }

    // Default reply
    return "I can help you analyze the stock market! Try asking me:\n\n1. 'Which stocks should I buy?'\n2. 'Analyze my portfolio'\n3. 'How are taxes calculated?'";
  };

  // Helper to submit question to Gemini or Local Heuristics
  const submitQuestion = async (text) => {
    setIsTyping(true);

    // Call Gemini API if Key is present, otherwise fallback to Local Heuristics
    if (geminiKey) {
      try {
        const stockSummary = marketStocks.map(s => `${s.symbol} (LTP: Rs.${s.ltp}, RSI:${s.rsi.toFixed(0)}, Sector:${s.sector})`).join(', ');
        const portfolioSummary = activeHoldings.map(h => `${h.symbol} (${h.units} shares bought at WACC Rs.${h.wacc.toFixed(1)})`).join(', ');

        const systemPrompt = `You are NEPSE Guru, an expert Nepali stock market AI assistant. 
Current market stocks stats: ${stockSummary}. 
User's portfolio holdings: ${portfolioSummary || 'Empty portfolio'}.
Reply in concise markdown. Provide simple trading advice for common people.
Question: ${text}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }]
          })
        });
        const data = await response.json();
        
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't connect to my AI core. Falling back to local scanner.";
        setMessages(prev => [...prev, { sender: 'guru', text: answer, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      } catch (err) {
        const heuristicText = getHeuristicResponse(text);
        setMessages(prev => [...prev, { 
          sender: 'guru', 
          text: `*(Fallback Mode - Connection Timeout)*\n\n${heuristicText}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }]);
      }
    } else {
      await new Promise(r => setTimeout(r, 600)); // simulated thinking
      const reply = getHeuristicResponse(text);
      setMessages(prev => [...prev, { sender: 'guru', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    }
    setIsTyping(false);
  };

  // Chat message submit handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userText = userInput;
    setMessages(prev => [...prev, { sender: 'user', text: userText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setUserInput('');
    submitQuestion(userText);
  };

  // Handle Quick Prompts click
  const handleQuickPrompt = (text) => {
    setMessages(prev => [...prev, { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    submitQuestion(text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12, padding: '0 16px', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('suggestions')}
          style={{
            flex: 1, padding: '12px 0', textAlign: 'center', fontWeight: 'bold', fontSize: 12, 
            border: 'none', borderBottom: `2px solid ${activeTab === 'suggestions' ? 'var(--primary)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
            color: activeTab === 'suggestions' ? 'var(--primary-light)' : 'var(--text-muted)'
          }}
        >
          <ListFilter style={{ width: 16, height: 16 }} /> Market Scanner & Alert
        </button>
        <button
          onClick={() => setActiveTab('guru')}
          style={{
            flex: 1, padding: '12px 0', textAlign: 'center', fontWeight: 'bold', fontSize: 12, 
            border: 'none', borderBottom: `2px solid ${activeTab === 'guru' ? 'var(--primary)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
            color: activeTab === 'guru' ? 'var(--primary-light)' : 'var(--text-muted)'
          }}
        >
          <MessageSquare style={{ width: 16, height: 16 }} /> Ask NEPSE Guru AI
        </button>
      </div>

      {activeTab === 'suggestions' ? (
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
                      <span className={`badge ${
                        rec.recommendation === 'buy_more' ? 'badge-bull' : 
                        rec.recommendation === 'take_profit' ? 'badge-primary' : 'badge-gray'
                      }`} style={{ padding: '2px 8px', fontSize: 9 }}>
                        {rec.recommendation === 'buy_more' ? 'BUY MORE (AVG DOWN)' : rec.recommendation === 'take_profit' ? 'TAKE PROFIT (SELL)' : 'HOLD'}
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
                No active portfolio alerts. Log purchases in the Portfolio tab.
              </div>
            )}
          </div>

          {/* General Market Scans */}
          <div>
            <h3 className="section-title" style={{ marginBottom: 8 }}>General Market Opportunities</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(showAllOpps ? marketOpps : marketOpps.slice(0, 5)).map(opp => (
                <div key={opp.symbol} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 0 }}>
                  <div style={{ flex: 1, paddingRight: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 'bold', fontSize: 12, color: 'var(--text-primary)' }}>{opp.symbol}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{opp.name}</span>
                    </div>
                    <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: opp.description }}></p>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>Rs. {opp.ltp}</div>
                    <span className={`badge ${
                      opp.type === 'bearish_sell' ? 'badge-bear' : 'badge-bull'
                    }`} style={{ padding: '2px 6px', marginTop: 4, fontSize: 8.5 }}>
                      {opp.type === 'bearish_sell' ? 'Sell Target' : 'Buy Alert'}
                    </span>
                  </div>
                </div>
              ))}
              {marketOpps.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllOpps(!showAllOpps)}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: 8 }}
                >
                  {showAllOpps ? 'Show Less' : `Show All Opportunities (${marketOpps.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* NEPSE Guru Chat interface */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(6,8,16,0.5)', padding: '0 16px' }}>
          
          {/* Gemini settings API config */}
          <div style={{ marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 10 }}>
            <details style={{ outline: 'none' }}>
              <summary style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--primary-light)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4, outline: 'none' }}>
                <Cpu style={{ width: 14, height: 14 }} /> Configure Free Gemini AI (Generative Live Advisor)
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
                  Paste your Google Gemini API Key. The chatbot will dynamically scan stock tickers, calculate ratios, and give customized answers. 100% free from Google.
                </p>
                <input 
                  type="password" 
                  value={geminiKey} 
                  onChange={e => saveGeminiKey(e.target.value)}
                  placeholder="Paste AI API Key here..."
                  className="input"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                />
              </div>
            </details>
          </div>

          {/* Chat message box scroll */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12, paddingRight: 4 }}>
            {messages.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: 12, fontSize: 12, lineHeight: 1.5,
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
                  <Sparkles style={{ width: 14, height: 14, color: 'var(--primary-light)' }} className="animate-spin" /> Guru is scanning tickers...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          <div style={{ 
            display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0', 
            scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0 
          }}>
            {['Which stocks to buy?', 'Analyze my portfolio', 'How are taxes calculated?', 'What is WACC?'].map(prompt => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleQuickPrompt(prompt)}
                className="sector-pill"
                style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input message form bottom */}
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 6, padding: '12px 0', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <input 
              type="text" 
              value={userInput} 
              onChange={e => setUserInput(e.target.value)}
              placeholder="Ask Guru about stocks or taxes..." 
              className="input"
              style={{ padding: '8px 16px', fontSize: 12, flex: 1, borderRadius: 50 }}
            />
            <button type="submit" style={{ padding: 10, background: 'var(--primary)', color: '#fff', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Send style={{ width: 14, height: 14 }} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
