const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

// 1. Add MarketIndicesView component
const marketIndicesComponent = `
function MarketIndicesView({ indices, onClose }) {
  const [tab, setTab] = useState('overview');
  
  const allIndices = [
    { name: 'NEPSE', ...indices?.nepse },
    { name: 'FLOAT', ...indices?.float },
    { name: 'SENSITIVE', ...indices?.sensitive },
    { name: 'SENFLOAT', ...indices?.sensitiveFloat },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}><ChevronLeft size={24} /></button>
        <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Market Indices</span>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setTab('overview')} style={{ flex: 1, padding: '16px', background: 'none', border: 'none', color: tab === 'overview' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === 'overview' ? '3px solid var(--primary)' : '3px solid transparent', fontWeight: '800' }}>OVERVIEW</button>
        <button onClick={() => setTab('detailed')} style={{ flex: 1, padding: '16px', background: 'none', border: 'none', color: tab === 'detailed' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === 'detailed' ? '3px solid var(--primary)' : '3px solid transparent', fontWeight: '800' }}>DETAILED VIEW</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '12px 0', textAlign: 'left' }}>INDEX</th>
              <th style={{ padding: '12px 0', textAlign: 'right' }}>CH</th>
              <th style={{ padding: '12px 0', textAlign: 'right' }}>CH %</th>
              <th style={{ padding: '12px 0', textAlign: 'right' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {allIndices.map((ind, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px 0', fontWeight: '800', color: '#fff' }}>{ind.name}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: ind.change >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{ind.change}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: ind.pChange >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{ind.pChange}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: '#fff' }}>{ind.value}</td>
              </tr>
            ))}
            <tr><td colSpan="4" style={{ padding: '16px 0', color: 'var(--primary)', fontWeight: '800' }}>SUB INDEX</td></tr>
            {(indices?.subIndices || []).map((ind, i) => (
              <tr key={'sub'+i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px 0', fontWeight: '800', color: '#fff', textTransform: 'uppercase' }}>{ind.index.replace(' Index', '').replace(' SubIndex', '')}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: ind.change >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{ind.change}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: ind.pChange >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{ind.pChange}</td>
                <td style={{ padding: '16px 0', textAlign: 'right', color: '#fff' }}>{ind.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;

if (!code.includes('MarketIndicesView')) {
  code = code.replace(/export default function Dashboard/, marketIndicesComponent + '\nexport default function Dashboard');
}

// 2. Add state for market indices view and dropdown
const dashHookStr = `  const [timeframe, setTimeframe] = useState('1D');
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [chartType, setChartType] = useState('line');
  const [statModal, setStatModal] = useState(null);`;

const newDashHookStr = `  const [timeframe, setTimeframe] = useState('1D');
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [chartType, setChartType] = useState('line');
  const [statModal, setStatModal] = useState(null);
  const [showMarketIndices, setShowMarketIndices] = useState(false);
  const [showIndexMenu, setShowIndexMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState('NEPSE Index');`;

if (code.includes(dashHookStr)) {
  code = code.replace(dashHookStr, newDashHookStr);
}

// Ensure ArrowRight is imported
if (!code.includes('ArrowRight,')) {
  code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, "import { ArrowRight, $1 } from 'lucide-react';");
}

// 3. Replace NEPSE Index header
const oldNepseHeader = `<span style={{ fontSize: 'calc(18px * var(--font-scale, 1)), fontWeight: '800', color: '#fff' }}>NEPSE Index <ChevronDown style={{ width: 16, height: 16, display: 'inline' }} /></span>`;
// But we should use exact match or regex
const headerRegex = /<span style=\{\{ fontSize: 'calc\(18px \* var\(--font-scale, 1\)\)', fontWeight: '800', color: '#fff' \}\}>NEPSE Index <ChevronDown style=\{\{ width: 16, height: 16, display: 'inline' \}\} \/><\/span>/;

const newNepseHeader = `<div style={{ position: 'relative' }}>
                  <span onClick={() => setShowIndexMenu(!showIndexMenu)} style={{ cursor: 'pointer', fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {selectedIndex.replace(' Index', '').replace(' SubIndex', '')} <ChevronDown style={{ width: 16, height: 16 }} />
                  </span>
                  {showIndexMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', overflowY: 'auto', maxHeight: '300px', zIndex: 100, minWidth: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                      <div onClick={() => { setSelectedIndex('NEPSE Index'); setShowIndexMenu(false); }} style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>NEPSE Index</div>
                      {(indices?.subIndices || []).map(ind => (
                        <div key={ind.index} onClick={() => { setSelectedIndex(ind.index); setShowIndexMenu(false); }} style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{ind.index}</div>
                      ))}
                    </div>
                  )}
                </div>`;

if (code.match(headerRegex)) {
  code = code.replace(headerRegex, newNepseHeader);
}

// Also add ArrowRight button
const headerContainerRegex = /<div style=\{\{ display: 'flex', alignItems: 'center', gap: '8px' \}\}>\s*<div style=\{\{ position: 'relative' \}\}>[\s\S]*?<\/div>\s*<\/div>/;
// Let's do it safer.
const oldHeaderFull = `<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff' }}>NEPSE Index <ChevronDown style={{ width: 16, height: 16, display: 'inline' }} /></span>
              </div>`;
const newHeaderFull = `<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative' }}>
                  <span onClick={() => setShowIndexMenu(!showIndexMenu)} style={{ cursor: 'pointer', fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {selectedIndex.replace(' Index', '').replace(' SubIndex', '')} <ChevronDown style={{ width: 16, height: 16 }} />
                  </span>
                  {showIndexMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', overflowY: 'auto', maxHeight: '300px', zIndex: 100, minWidth: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                      <div onClick={() => { setSelectedIndex('NEPSE Index'); setShowIndexMenu(false); }} style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>NEPSE</div>
                      {(indices?.subIndices || []).map(ind => (
                        <div key={ind.index} onClick={() => { setSelectedIndex(ind.index); setShowIndexMenu(false); }} style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{ind.index}</div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowMarketIndices(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowRight size={20} /></button>
              </div>`;

if (code.includes(oldHeaderFull)) {
  code = code.replace(oldHeaderFull, newHeaderFull);
}

// Make the NEPSE stats dynamic based on selectedIndex
const nepseStatsRegex = /const nepse = indices\?\.nepse \|\| \{ value: 0, change: 0, pChange: 0 \};/;
const newNepseStats = `const nepse = selectedIndex === 'NEPSE Index' 
    ? (indices?.nepse || { value: 0, change: 0, pChange: 0 }) 
    : (indices?.subIndices?.find(i => i.index === selectedIndex) || { value: 0, change: 0, pChange: 0 });`;
if (code.match(nepseStatsRegex)) {
  code = code.replace(nepseStatsRegex, newNepseStats);
}

// Inject MarketIndicesView rendering at the bottom
const bottomRegex = /\{\/\* 3\. Change Summary View \*\/\}/;
if (code.match(bottomRegex)) {
  code = code.replace(bottomRegex, `{/* Market Indices View */}
      {showMarketIndices && <MarketIndicesView indices={indices} onClose={() => setShowMarketIndices(false)} />}
      
      {/* 3. Change Summary View */}`);
}

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Added Market Indices features');
