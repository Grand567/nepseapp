const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

code += `\nexport const fetchStockFundamentals = async (symbol) => {
  const base = getProxyBase();
  const res = await fetch(\`\${base}/api/stock-detail/\${symbol}\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } });
  const json = await res.json();
  if (json.success && json.data) return json.data;
  return null;
};\n`;

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Added fetchStockFundamentals back AGAIN');
