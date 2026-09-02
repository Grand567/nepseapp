
const d = { name: 'Bindhyabasini Hydropower', symbol: 'BHDC', sector: 'Hydro Power', ltp: 427.8, pChange: 0.66, high52w: 500, low52w: 300, eps: 10, pe: 42, bookValue: 100, pb: 4.2, rsi: 50, macd: { line: 1, signal: 0 }, ema20: 420, ema50: 410, ema200: 400 };
const historyText = 'some history...';
const prompt = \Act as an expert stock market analyst. I need a comprehensive fundamental and technical analysis of the Nepalese stock: \ (\).\n\nCurrent Market Data:\n- Sector: \\n- Last Traded Price (LTP): Rs. \\n- Change: \%\n- 52W High/Low: Rs. \ / Rs. \\n- EPS: \\n- P/E Ratio: \\n- Book Value: \\n- P/B Ratio: \\n- RSI: \\n- MACD Line: \, Signal: \\n- 20 EMA: \, 50 EMA: \, 200 EMA: \\n\nRecent Price History (Last 15 sessions):\n\\n\nPlease provide a highly professional, detailed analysis covering:\n1. Fundamental Health (valuation, earnings strength, P/E vs P/B ratios)\n2. One Day Technical Analysis (EMA trend structures, RSI conditions, MACD momentum crossover signals)\n3. Accumulation vs Distribution Assessment (evaluate price-volume patterns, consolidation areas, support/resistance levels, and whether institutional/smart money is currently accumulating or distributing the stock)\n4. Recent Trend Analysis (historical price trajectory and volume changes based on the 15-session price history provided)\n5. Clear Prediction & Actionable Verdict: Explicitly predict a definitive decision of 'BUY', 'HOLD', or 'SELL' for the user, complete with a percentage-based stop-loss and profit target, along with clear reasoning for retail investors.\n\nFormat with markdown using bold headers and clean bullet points. Do not include raw HTML.\;

async function test() {
  try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: 'You are an expert Nepalese Stock Market (NEPSE) analyst.' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!response.ok) throw new Error('Failed to fetch AI analysis');
      const data = await response.json();
      console.log('Success!', data.choices[0].message.content.substring(0, 50));
  } catch (err) {
      console.log('Err1:', err.message);
      try {
        const fallbackRes = await fetch('https://text.pollinations.ai/prompt/'+encodeURIComponent(prompt));
        if (!fallbackRes.ok) throw new Error('Fallback failed');
        const fallbackText = await fallbackRes.text();
        console.log('Fallback Success:', fallbackText.substring(0, 50));
      } catch (e2) {
        console.log('Err2:', e2.message);
      }
  }
}
test();

