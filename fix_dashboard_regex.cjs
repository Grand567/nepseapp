const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

code = code.replace(`import { getProxyBase, fetchStockFundamentals } from '../utils/liveData';`, `import { getProxyBase, fetchStockFundamentals, fetchPriceHistory } from '../utils/liveData';`);

const regex = /const historyRes = await fetch\(\`\$\{\w+\}\/api\/price-history\/\$\{stock\.symbol\}\`\);[\s\S]*?setLiveHistory\(withDateObj\);\n\s*\}\n\s*\}/;

const replaceString = `const historyData = await fetchPriceHistory(stock.symbol);
        if (historyData && active) {
            const withDateObj = historyData.map(item => ({
              ...item,
              dateObj: new Date(item.date),
              date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
            setLiveHistory(withDateObj);
        }`;

code = code.replace(regex, replaceString);
fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed Dashboard.jsx regex');
