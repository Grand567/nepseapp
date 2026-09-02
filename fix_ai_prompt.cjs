const fs = require('fs');
let code = fs.readFileSync('src/services/aiService.js', 'utf-8');

const oldPromptRegex = /You are a Tier-1 institutional[\s\S]*?Macro & Political Influences[\s\S]*?\)/;

const newPrompt = `You are a Tier-1 institutional quantitative analyst specializing exclusively in the Nepal Stock Exchange (NEPSE). 
You must rigorously analyze the following stock using these specific conditions: Fundamental, Technical, Accumulation, and Political/Macro.

## Stock Data
- **Symbol**: \${stock.symbol}
- **Sector**: \${stock.sector || 'Unspecified'}
- **Current LTP**: NPR \${stock.ltp} (\${stock.change > 0 ? '+' : ''}\${stock.change} | \${stock.changePercent?.toFixed(2) || 'N/A'}%)
- **Volume**: \${(stock.volume || 0).toLocaleString()} shares traded today

### Fundamentals
- **EPS**: \${stock.eps || 'N/A'}
- **P/E Ratio**: \${stock.pe || 'N/A'}
- **Book Value**: NPR \${stock.bookValue || 'N/A'}

### Technicals
- **RSI (14)**: \${stock.rsi?.toFixed(2) || 'N/A'}
- **MACD**: \${stock.macd?.line > stock.macd?.signal ? 'Bullish' : 'Bearish'}
- **EMA(20)**: NPR \${stock.ema20 || 'N/A'}
- **EMA(50)**: NPR \${stock.ema50 || 'N/A'}
- **Price History**: \${historyStr || 'Not provided'}

### Accumulation / Order Flow
- **Smart Money Signal**: \${adSignal || 'Neutral'}

Based on ALL the conditions above (Fundamental, Technical, Accumulation, and Political), provide a comprehensive analysis using the exact markdown structure below:

### 1. ðŸ † Ultimate Verdict
(Must clearly predict **STRONG BUY**, **BUY**, **HOLD**, **SELL**, or **STRONG SELL**. Provide an exact entry zone, primary price target, and a hard stop-loss in NPR.)

### 2. ðŸ“Š Technical & Accumulation Analysis
(Analyze the RSI, MACD, EMAs, and explicitly discuss Accumulation/Distribution from big brokers.)

### 3. ðŸ ¢ Fundamental & Valuation Health
(Evaluate the EPS, P/E, Book Value, and Dividend capacity. Is it fundamentally cheap or expensive?)

### 4. ðŸ‡³ðŸ‡µ Political & Macro Conditions
(Explicitly discuss how current political instability, government policies, NRB interest rates, and banking liquidity impact this stock's future.)`;

code = code.replace(oldPromptRegex, newPrompt);
fs.writeFileSync('src/services/aiService.js', code);
console.log('Updated AI prompt in aiService.js');
