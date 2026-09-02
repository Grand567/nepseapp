const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// Fix Unchanged text color and plus sign in statModal
code = code.replace(
  "color: s.pChange >= 0 ? 'var(--bull)' : (s.pChange < 0 ? 'var(--bear)' : 'var(--text-secondary)')",
  "color: s.pChange > 0 ? 'var(--bull)' : (s.pChange < 0 ? 'var(--bear)' : 'var(--text-secondary)')"
);
code = code.replace(
  "{s.pChange >= 0 ? '+' : ''}{s.pChange}%",
  "{s.pChange > 0 ? '+' : ''}{s.pChange}%"
);

// Fix StockDrawer Header change color and plus sign
code = code.replace(
  "color: d.change >= 0 ? 'var(--bull)' : 'var(--bear)'",
  "color: d.change > 0 ? 'var(--bull)' : (d.change < 0 ? 'var(--bear)' : 'var(--text-muted)')"
);
code = code.replace(
  "{d.change >= 0 ? '+' : ''}{fmt(d.change)}",
  "{d.change > 0 ? '+' : ''}{fmt(d.change)}"
);

// Fix ticker-change in main Dashboard
code = code.replace(
  "color: s.pChange >= 0 ? 'var(--bull)' : 'var(--bear)'",
  "color: s.pChange > 0 ? 'var(--bull)' : (s.pChange < 0 ? 'var(--bear)' : 'var(--text-muted)')"
);
code = code.replace(
  "{s.pChange >= 0 ? '▲' : '▼'}{Number(Math.abs(s.pChange || 0)).toFixed(2)}%",
  "{s.pChange > 0 ? '▲' : (s.pChange < 0 ? '▼' : '')}{Number(Math.abs(s.pChange || 0)).toFixed(2)}%"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed zero-change colors in Dashboard.jsx');
