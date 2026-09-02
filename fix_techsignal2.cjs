const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

const start = code.indexOf('function getTechSignal');
const end = code.indexOf('export function SectorHeatmap');

if (start > -1 && end > -1) {
  code = code.substring(0, start) + `function getTechSignal(rsi, macd, ema20, ema50, ema200) {
  let score = 0;
  if (rsi !== undefined) {
    if (rsi < 30) score += 3;
    else if (rsi < 40) score += 1.5;
    else if (rsi > 75) score -= 3;
    else if (rsi > 65) score -= 1.5;
  }
  if (macd && macd.line !== undefined && macd.signal !== undefined) {
    if (macd.line > macd.signal) score += 1.5; else score -= 1.5;
  }
  if (ema20 !== undefined && ema50 !== undefined) {
    if (ema20 > ema50)  score += 1; else score -= 1;
  }
  if (ema50 !== undefined && ema200 !== undefined) {
    if (ema50 > ema200) score += 0.8; else score -= 0.8;
  }
  if (score >= 3.5)  return { label:'Strong Buy',  color:'var(--bull)',         emoji:'🟢', bg:'var(--bull-subtle)',  desc:'Heavy buying signals. RSI oversold + MACD bullish crossover + bullish EMA stack. High confidence upside entry.' };
  if (score >= 1.2)  return { label:'Buy',         color:'#34d399',             emoji:'📈', bg:'rgba(52,211,153,0.08)', desc:'Positive momentum building. Multiple indicators trending bullish.' };
  if (score <= -3.5) return { label:'Strong Sell', color:'var(--bear)',         emoji:'🔴', bg:'var(--bear-subtle)',  desc:'Severe technical weakness. RSI overbought + MACD bearish cross + bearish EMA stack.' };
  if (score <= -1.2) return { label:'Sell',        color:'#f87171',             emoji:'📉', bg:'rgba(248,113,113,0.08)', desc:'Negative momentum. Multiple indicators trending bearish. Consider profit taking or tight stops.' };
  return               { label:'Neutral',         color:'var(--accent-amber)', emoji:'⚖️', bg:'rgba(245,158,11,0.08)', desc:'Price consolidating in a range. Wait for a clear breakout above resistance or breakdown below support before acting.' };
}\n\n` + code.substring(end);
}

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed getTechSignal successfully');
