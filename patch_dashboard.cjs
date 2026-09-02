const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

const target = `        const historyRes = await fetch(\`\${base}/api/price-history/\${stock.symbol}\`);
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
        }
      } catch (e) {
        console.warn('Failed to load price history from proxy:', e.message);`;

const replacement = `        const historyRes = await fetch(\`https://chukul.com/api/data/historydata/?symbol=\${stock.symbol}\`);
        if (historyRes.ok) {
          const historyArray = await historyRes.json();
          if (Array.isArray(historyArray) && active) {
            const withDateObj = historyArray.map(item => ({
              ...item,
              dateObj: new Date(item.date),
              date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
            setLiveHistory(withDateObj.reverse());
          }
        }
      } catch (e) {
        console.warn('Failed to load price history from Chukul:', e.message);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Patched Dashboard.jsx');
