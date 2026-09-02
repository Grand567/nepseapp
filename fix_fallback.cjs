const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

code = code.replace(
  /const stocks = await fetchLiveTradingDirect\(\);\n    console\.log\(`\[NEPSE\] 🌐 Direct live data loaded — \$\{stocks\.length\} stocks`\);\n    return \{ data: stocks, source: 'live' \};/g,
  `const stocks = await fetchLiveTradingDirect();
    if (stocks && stocks.length > 0) {
      console.log(\`[NEPSE] 🌐 Direct live data loaded — \${stocks.length} stocks\`);
      return { data: stocks, source: 'live' };
    } else {
      console.warn('Layer 0 live empty, falling back...');
    }`
);

code = code.replace(
  /const stocks = await fetchTodayPricesDirect\(\);\n    console\.log\(`\[NEPSE\] 🌐 Direct closing data loaded — \$\{stocks\.length\} stocks`\);\n    return \{ data: stocks, source: 'closing' \};/g,
  `const stocks = await fetchTodayPricesDirect();
    if (stocks && stocks.length > 0) {
      console.log(\`[NEPSE] 🌐 Direct closing data loaded — \${stocks.length} stocks\`);
      return { data: stocks, source: 'closing' };
    } else {
      console.warn('Layer 0 closing empty, falling back...');
    }`
);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed');
