const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

// 1. Add state for timeframe menu
if (!code.includes('showTimeframeMenu')) {
  code = code.replace(
    /const \[timeframe, setTimeframe\] = useState\('1D'\);/,
    "const [timeframe, setTimeframe] = useState('1D');\n  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);"
  );
}

// 2. Replace the timeframe button with dropdown logic
const targetStr = `                <button onClick={() => setTimeframe(t => t === '1D' ? '1W' : t === '1W' ? '1M' : '1D')} style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: '#fff', background: 'var(--bg-base)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer' }}>
                  {timeframe} <ChevronDown style={{ width: 14, height: 14, marginLeft: 2 }} />
                </button>`;

const dropdownStr = `                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowTimeframeMenu(!showTimeframeMenu)} style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: '#fff', background: 'var(--bg-base)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer' }}>
                    {timeframe} <ChevronDown style={{ width: 14, height: 14, marginLeft: 2 }} />
                  </button>
                  {showTimeframeMenu && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', zIndex: 100, minWidth: '80px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                      {['1D', '1W', '1M', '3M', '6M', '1Y'].map(t => (
                        <div key={t} onClick={() => { setTimeframe(t); setShowTimeframeMenu(false); }} style={{ padding: '8px 12px', fontSize: '13px', color: timeframe === t ? 'var(--primary)' : '#fff', background: timeframe === t ? 'rgba(16, 185, 129, 0.1)' : 'transparent', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, dropdownStr);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Added timeframe dropdown');
} else {
  console.log('Target string not found');
}
