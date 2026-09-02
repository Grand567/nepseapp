const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// Dashboard formatters
code = code.replace(
  "const fmtB = n => (n / 1000000000).toFixed(2) + ' B';",
  "const fmtB = n => (n / 1000000000).toFixed(2) + ' Arba';"
);

// StockDrawer formatters
code = code.replace(
  "const fmtM  = n => n >= 1000 ? `${(n/1000).toFixed(2)}B` : `${n.toFixed(2)}M`;",
  "const fmtM  = n => n >= 1000 ? `${(n/1000).toFixed(2)} Arba` : `${n.toFixed(2)} Million`;"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed formatting labels to Arba/Million');
