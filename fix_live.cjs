const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const hookStr = `    const [activeTab, setActiveTab] = useState('overview');
    const [chartMode, setChartMode] = useState('daily');
    const [chartDays, setChartDays] = useState(30);
    const [hourlyRes, setHourlyRes] = useState('15m');
    const [history, setHistory]     = useState(() => generateHistory(stock.symbol, stock.ltp, 30));
    const [hourlyHistory, setHourlyHistory] = useState(() => generateHourlyHistory(stock.symbol, stock.ltp, '15m'));`;

const newHookStr = `    const [activeTab, setActiveTab] = useState('overview');
    const [chartMode, setChartMode] = useState('daily');
    const [chartDays, setChartDays] = useState(30);
    const [hourlyRes, setHourlyRes] = useState('15m');
    const [history, setHistory]     = useState(() => generateHistory(stock.symbol, stock.ltp, 30));
    const [hourlyHistory, setHourlyHistory] = useState(() => generateHourlyHistory(stock.symbol, stock.ltp, '15m'));

    const [liveDetails, setLiveDetails] = useState(null);
    const [liveFloorsheet, setLiveFloorsheet] = useState(null);
    const [liveHistory, setLiveHistory] = useState(null);
    const [loadingMap, setLoadingMap] = useState({});
    const proxyBase = import.meta.env.VITE_PROXY_URL || 'http://localhost:5000';

    useEffect(() => {
      if ((activeTab === 'fundamentals' || activeTab === 'technicals') && !liveDetails) {
        setLoadingMap(p => ({ ...p, details: true }));
        fetch(\`\${proxyBase}/api/mero/stock-details/\${stock.symbol}\`)
          .then(r => r.json()).then(d => { if(d.success) setLiveDetails(d.data); setLoadingMap(p => ({ ...p, details: false })); })
          .catch(() => setLoadingMap(p => ({ ...p, details: false })));
      }
      if (activeTab === 'floorsheet' && !liveFloorsheet) {
        setLoadingMap(p => ({ ...p, floorsheet: true }));
        fetch(\`\${proxyBase}/api/mero/floorsheet/\${stock.symbol}\`)
          .then(r => r.json()).then(d => { if(d.success) setLiveFloorsheet(d.data); setLoadingMap(p => ({ ...p, floorsheet: false })); })
          .catch(() => setLoadingMap(p => ({ ...p, floorsheet: false })));
      }
      if (activeTab === 'history' && !liveHistory) {
        setLoadingMap(p => ({ ...p, history: true }));
        fetch(\`\${proxyBase}/api/mero/history/\${stock.symbol}\`)
          .then(r => r.json()).then(d => { if(d.success) { setLiveHistory(d.data); setHistory(d.data); } setLoadingMap(p => ({ ...p, history: false })); })
          .catch(() => setLoadingMap(p => ({ ...p, history: false })));
      }
    }, [activeTab, stock.symbol]);
    
    // Merge live details into stock
    const dStock = liveDetails ? { ...stock, ...liveDetails } : stock;
`;

if (code.includes(hookStr)) {
  code = code.replace(hookStr, newHookStr);
  
  // Replace references to `stock.` with `dStock.` in Fundamentals and Technicals tabs
  const fundsRegex = /\{\/\*  FUNDAMENTALS TAB  \*\/\}([\s\S]*?)\{\/\*  TECHNICALS TAB  \*\/\}/;
  const match = code.match(fundsRegex);
  if (match) {
    let funds = match[1].replace(/stock\./g, 'dStock.');
    code = code.replace(match[1], funds);
  }

  const techRegex = /\{\/\*  TECHNICALS TAB  \*\/\}([\s\S]*?)\{\/\*  QUICK CALC TAB  \*\/\}/;
  const techMatch = code.match(techRegex);
  if (techMatch) {
    let tech = techMatch[1].replace(/stock\./g, 'dStock.');
    code = code.replace(techMatch[1], tech);
  }
}

// Replace the Floorsheet static table with live data
const floorRegex = /\{\/\* FLOOR SHEET TAB \*\/\}([\s\S]*?)\{\/\* BROKER ACTIVITY TAB \*\/\}/;
const floorMatch = code.match(floorRegex);
if (floorMatch) {
  const newFloor = `
          {/* FLOOR SHEET TAB */}
          {activeTab === 'floorsheet' && (
            <div style={{ padding: '16px' }}>
              {loadingMap.floorsheet ? (
                <div style={{ textAlign: 'center', padding: '32px' }}>Loading floorsheet...</div>
              ) : liveFloorsheet && liveFloorsheet.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 0', textAlign: 'left' }}>SN</th>
                      <th style={{ padding: '8px 0', textAlign: 'center' }}>BB</th>
                      <th style={{ padding: '8px 0', textAlign: 'center' }}>SB</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>QTY</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveFloorsheet.map((t, i) => (
                      <tr key={t.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 0' }}>{i + 1}</td>
                        <td style={{ padding: '12px 0', textAlign: 'center', color: 'var(--accent-cyan)' }}>{t.buyer}</td>
                        <td style={{ padding: '12px 0', textAlign: 'center', color: 'var(--bear)' }}>{t.seller}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700' }}>{t.qty}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--bull)' }}>{t.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No floorsheet data available</div>
              )}
            </div>
          )}

          `;
  code = code.replace(floorMatch[0], newFloor);
}

// Replace History table with liveHistory
const histRegex = /\{\/\* PRICE HISTORY TAB \*\/\}([\s\S]*?)\{\/\* QUICK CALC TAB \*\/\}/;
const histMatch = code.match(histRegex);
if (histMatch) {
  const newHist = `
          {/* PRICE HISTORY TAB */}
          {activeTab === 'history' && (
            <div style={{ padding: '16px' }}>
              {loadingMap.history ? (
                <div style={{ textAlign: 'center', padding: '32px' }}>Loading price history...</div>
              ) : liveHistory && liveHistory.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 0', textAlign: 'left' }}>DATE</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>VOLUME</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>CH%</th>
                      <th style={{ padding: '8px 0', textAlign: 'right' }}>CLOSE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveHistory.slice(0,20).map((h, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 0' }}>{h.date.substring(5)}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right' }}>{fmtCr(h.volume * h.close)}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: h.close > h.open ? 'var(--bull)' : (h.close < h.open ? 'var(--bear)' : 'var(--text-muted)') }}>{h.close > h.open ? '+' : ''}{h.open ? ((h.close-h.open)/h.open*100).toFixed(2) : 0}%</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700' }}>{h.close}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No history available</div>
              )}
            </div>
          )}
          
          `;
  code = code.replace(histMatch[0], newHist);
}

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Stock drawer live fetch updated');
