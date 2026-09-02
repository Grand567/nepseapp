const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// The state is '1D', '1W', '1M'
// The rendered text is {timeframe}
// We will replace {timeframe} with a mapping
code = code.replace(
  "{timeframe} <ChevronDown style={{ width: 14, height: 14, marginLeft: 2 }} />",
  "{timeframe === '1D' ? '1 Day' : timeframe === '1W' ? '1 Week' : '1 Month'} <ChevronDown style={{ width: 14, height: 14, marginLeft: 2 }} />"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed timeframe labels');
