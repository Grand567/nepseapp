const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const candleChartCode = `
/* Candlestick Chart */
function CandleChart({ history }) {
  if (!history?.length) return null;
  const prices = history.flatMap(h => [h.low, h.high]);
  const mn = Math.min(...prices) * 0.995;
  const mx = Math.max(...prices) * 1.005;
  const rng = mx - mn || 1;
  const W = 400, H = 160;
  const colW = W / history.length;
  const pad = colW * 0.2;
  const cw = Math.max(colW - pad * 2, 2);
  
  return (
    <svg viewBox={\`0 0 \${W} \${H}\`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {history.map((h, i) => {
        const x = i * colW + colW/2;
        const yHigh = H - ((h.high - mn) / rng) * H;
        const yLow = H - ((h.low - mn) / rng) * H;
        const yOpen = H - ((h.open - mn) / rng) * H;
        const yClose = H - ((h.close - mn) / rng) * H;
        const isBull = h.close >= h.open;
        const color = isBull ? 'var(--bull)' : 'var(--bear)';
        const top = Math.min(yOpen, yClose);
        const height = Math.max(Math.abs(yOpen - yClose), 1);
        return (
          <g key={i}>
            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.5" />
            <rect x={x - cw/2} y={top} width={cw} height={height} fill={color} rx="1" />
          </g>
        );
      })}
    </svg>
  );
}
`;

if (!code.includes('function CandleChart')) {
  // Insert right after AreaChart
  code = code.replace(/function AreaChart[\s\S]*?<\/svg>\s*\);\s*\}/, match => match + '\n' + candleChartCode);
}

const chartHtml = `
            <div style={{ marginTop: '16px', height: '160px', overflow: 'hidden' }}>
              {chartType === 'line' ? (
                <AreaChart history={generateHistory(nepse.value || 2500, timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : 1)} />
              ) : (
                <CandleChart history={generateHistory(nepse.value || 2500, timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : 1)} />
              )}
            </div>
`;

// Insert the chart into the NEPSE card, before closing div
const targetStr = `            <div style={{ fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '16px' }}>
              As of {marketStatus?.nptTime || new Date().toLocaleTimeString()}
            </div>
          </div>`;

if (!code.includes('<CandleChart history=')) {
  code = code.replace(targetStr, targetStr.replace('          </div>', chartHtml + '\n          </div>'));
}

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Added Nepse Chart!');
