const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

const regex = /function getTechSignal\(rsi, macd, ema20, ema50, ema200\) {[\s\S]*?return { label:'Neutral'[\s\S]*?\};\n\}/;

const replacement = `function getTechSignal(rsi, macd, ema20, ema50, ema200) {
  let score = 0;
  
  if (rsi !== undefined) {
    if (rsi < 30) score += 3;
    else if (rsi < 40) score += 1.5;
    else if (rsi > 75) score -= 3;
    else if (rsi > 65) score -= 1.5;
  }
  
  if (macd !== undefined && macd.line !== undefined && macd.signal !== undefined) {
    if (macd.line > macd.signal) score += 1.5; else score -= 1.5;
  }
  
  if (ema20 !== undefined && ema50 !== undefined) {
    if (ema20 > ema50)  score += 1; else score -= 1;
  }
  
  if (ema50 !== undefined && ema200 !== undefined) {
    if (ema50 > ema200) score += 0.8; else score -= 0.8;
  }
  
  if (score >= 3.5)  return { label:'Strong Buy',  color:'var(--bull)',         emoji:'🟢', bg:'var(--bull-subtle)',  desc:'Heavy buying signals. High confidence upside entry.' };
  if (score >= 1.5)  return { label:'Buy',         color:'var(--bull)',         emoji:'📈', bg:'var(--bull-subtle)',  desc:'Bullish momentum. Good entry point.' };
  if (score <= -3.5) return { label:'Strong Sell', color:'var(--bear)',         emoji:'🔴', bg:'var(--bear-subtle)',  desc:'Heavy selling pressure. High risk of further downside.' };
  if (score <= -1.5) return { label:'Sell',        color:'var(--bear)',         emoji:'📉', bg:'var(--bear-subtle)',  desc:'Bearish momentum building. Consider taking profits.' };
  return             { label:'Neutral',         color:'var(--accent-amber)', emoji:'⚖️', bg:'rgba(245,158,11,0.08)', desc:'Price consolidating in a range. Wait for a clear breakout.' };
}`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Fixed getTechSignal in Dashboard.jsx');
} else {
  console.log('Could not find getTechSignal');
}
