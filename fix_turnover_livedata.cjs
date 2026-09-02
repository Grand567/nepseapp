const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

// Fix fetchLiveTradingDirect
// tds[9] is prevClose, turnover is ltp * volume
code = code.replace(
  "const turn    = parseMoney(tds[9]?.textContent);",
  "const prevClose = parseMoney(tds[9]?.textContent);\n      const turn = (ltp && volume) ? ltp * volume : 0;"
);

// Fix fetchTodayPricesDirect
// tds[9] is Value (Turnover)
code = code.replace(
  "const pChange = parseMoney(tds[7]?.textContent);",
  "const pChange = parseMoney(tds[7]?.textContent);\n      const turn = parseMoney(tds[9]?.textContent);"
);
code = code.replace(
  "turnover: 0,",
  "turnover: turn,"
);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed turnover in liveData.js');
