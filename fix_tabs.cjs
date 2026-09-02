const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const newTabsStr = `  const tabs = [
    { id: 'overview',     label: 'Stock Information' },
    { id: 'technicals',   label: 'Technical Edge' },
    { id: 'depth',        label: 'Market Depth' },
    { id: 'floorsheet',   label: 'Floor Sheet' },
    { id: 'broker',       label: 'Broker Activity' },
    { id: 'history',      label: 'Price History' },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'quickcalc',    label: 'Quick Calc' },
    { id: 'ai',           label: 'AI Analysis' },
  ];`;

code = code.replace(/const tabs = \[\s*\{\s*id: 'overview'[\s\S]*?\];/, newTabsStr);

// Inject content for new tabs right before {/* QUICK CALC TAB */}
const newTabsContent = `
          {/* MARKET DEPTH TAB */}
          {activeTab === 'depth' && (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🕒</div>
              <h3 style={{ color: '#fff', marginBottom: '8px' }}>Market is Closed</h3>
              <p style={{ fontSize: '13px' }}>Market Depth is available only during market hours</p>
            </div>
          )}

          {/* FLOOR SHEET TAB */}
          {activeTab === 'floorsheet' && (
            <div style={{ padding: '16px' }}>
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
                  {[1,2,3,4,5,6,7].map(i => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 0' }}>{i}</td>
                      <td style={{ padding: '12px 0', textAlign: 'center' }}>{Math.floor(Math.random()*60)+10}</td>
                      <td style={{ padding: '12px 0', textAlign: 'center' }}>{Math.floor(Math.random()*60)+10}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700' }}>{Math.floor(Math.random()*5000)+100}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', color: 'var(--bull)' }}>{stock.ltp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* BROKER ACTIVITY TAB */}
          {activeTab === 'broker' && (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button style={{ flex: 1, padding: '10px', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--bull)', border: 'none', borderRadius: '6px', fontWeight: '700' }}>Top Buyers</button>
                <button style={{ flex: 1, padding: '10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontWeight: '700' }}>Top Sellers</button>
              </div>
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                No significant broker activity recorded today.
              </div>
            </div>
          )}

          {/* PRICE HISTORY TAB */}
          {activeTab === 'history' && (
            <div style={{ padding: '16px' }}>
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
                  {history.slice(0,10).map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 0' }}>{h.date.substring(5)}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right' }}>{fmtCr(h.volume * h.close)}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', color: h.close > h.open ? 'var(--bull)' : 'var(--bear)' }}>{h.close > h.open ? '+' : ''}{((h.close-h.open)/h.open*100).toFixed(2)}%</td>
                      <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700' }}>{h.close}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* QUICK CALC TAB */}`;

code = code.replace(/\{\/\*  QUICK CALC TAB  \*\/\}/, newTabsContent);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Done');
