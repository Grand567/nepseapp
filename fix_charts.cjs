const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// Update imports
code = code.replace(
  "import { createChart } from 'lightweight-charts';",
  "import { createChart, AreaSeries, CandlestickSeries } from 'lightweight-charts';"
);

// Replace chart.addAreaSeries
code = code.replace(
  /series = chart\.addAreaSeries\(\{/g,
  "series = chart.addSeries(AreaSeries, {"
);

// Replace chart.addCandlestickSeries
code = code.replace(
  /series = chart\.addCandlestickSeries\(\{/g,
  "series = chart.addSeries(CandlestickSeries, {"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed Lightweight Charts v5 series methods');
