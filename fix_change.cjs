const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

// Fix fetchLiveTradingDirect
code = code.replace(
  "const pChange = parseMoney(tds[4]?.textContent);",
  "const change  = parseMoney(tds[3]?.textContent);\n      const pChange = parseMoney(tds[4]?.textContent);"
);
code = code.replace(
  "change: 0, pChange",
  "change: change || 0, pChange"
);

// Fix fetchTodayPricesDirect
code = code.replace(
  "const pChange = parseMoney(tds[7]?.textContent);",
  "const pChange = parseMoney(tds[7]?.textContent);\n      let change = 0;\n      if (ltp && pChange) change = ltp - (ltp / (1 + pChange/100));"
);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed change parsing in liveData.js');
