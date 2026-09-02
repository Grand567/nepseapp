const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// Import fetchPriceHistory
code = code.replace(`import { getProxyBase, fetchStockFundamentals } from '../utils/liveData';`, `import { getProxyBase, fetchStockFundamentals, fetchPriceHistory } from '../utils/liveData';`);

// Replace price history fetch logic
const searchString = `const historyRes = await fetch(\`\${base}/api/price-history/\${stock.symbol}\`);
        if (historyRes.ok) {
          const historyJson = await historyRes.json();
          if (historyJson.success && historyJson.data && active) {
            const withDateObj = historyJson.data.map(item => ({
              ...item,
              dateObj: new Date(item.date),
              date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
            setLiveHistory(withDateObj);
          }
        }`;

const replaceString = `const historyData = await fetchPriceHistory(stock.symbol);
        if (historyData && active) {
            const withDateObj = historyData.map(item => ({
              ...item,
              dateObj: new Date(item.date),
              date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
            setLiveHistory(withDateObj);
        }`;

if (code.includes(searchString)) {
  code = code.replace(searchString, replaceString);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Fixed Dashboard.jsx price history logic');
} else {
  console.log('Could not find search string in Dashboard.jsx');
}
