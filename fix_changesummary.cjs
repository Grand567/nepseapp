const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const changeSummaryComponent = `
function ChangeSummaryView({ currentTab, onTabChange, onClose, stocks, setSelected }) {
  const gainers = stocks.filter(s => s.change > 0);
  const losers = stocks.filter(s => s.change < 0);
  const unchanged = stocks.filter(s => s.change === 0);
  const posCircuit = stocks.filter(s => s.pChange >= 9.9);
  const negCircuit = stocks.filter(s => s.pChange <= -9.9);

  const tabs = [
    { id: 'Advanced', label: 'Advanced', list: gainers, color: 'var(--bull)' },
    { id: 'Declined', label: 'Declined', list: losers, color: 'var(--bear)' },
    { id: 'Unchanged', label: 'Unchanged', list: unchanged, color: 'var(--text-secondary)' },
    { id: '+Circuit', label: '+ve Circuit', list: posCircuit, color: 'var(--bull)' },
    { id: '-Circuit', label: '-ve Circuit', list: negCircuit, color: 'var(--bear)' }
  ];

  const activeTab = tabs.find(t => t.id === currentTab) || tabs[0];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}><ChevronLeft size={24} /></button>
        <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Change Summary</span>
      </div>
      
      {/* Scrollable Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', padding: '0 16px', borderBottom: '1px solid var(--border)', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{ 
              background: 'none', border: 'none', padding: '16px 12px', whiteSpace: 'nowrap', cursor: 'pointer',
              color: currentTab === tab.id ? tab.color : 'var(--text-muted)',
              borderBottom: currentTab === tab.id ? \`3px solid \${tab.color}\` : '3px solid transparent',
              fontWeight: currentTab === tab.id ? '800' : '600',
              fontSize: '14px', transition: 'var(--transition)'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 10 }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)' }}>SYM</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>LTP</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>HIGH</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>LOW</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>CH</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>CH%</th>
              <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>P.CLOSE</th>
            </tr>
          </thead>
          <tbody>
            {activeTab.list.map((s, i) => (
              <tr key={s.symbol} onClick={() => { setSelected(s); onClose(); }} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                <td style={{ padding: '12px', color: activeTab.color, fontWeight: '800' }}>{s.symbol}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>{s.ltp}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>{s.high}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>{s.low}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: s.change >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{s.change > 0 ? '+' : ''}{s.change.toFixed(2)}</td>
                <td style={{ padding: '12px', textAlign: 'right', color: s.pChange >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{s.pChange > 0 ? '+' : ''}{s.pChange.toFixed(2)}%</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>{(s.ltp - s.change).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;

// Insert the component before function Dashboard
if (!code.includes('function ChangeSummaryView')) {
  code = code.replace(/export default function Dashboard/, changeSummaryComponent + '\nexport default function Dashboard');
}

// Replace statModal with ChangeSummaryView
const oldStatModalHtml = `      {/* 3. Stat Modal */}
      {statModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <statModal.icon style={{ width: 20, height: 20, color: statModal.color }} />
               <span style={{ fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: statModal.color }}>{statModal.label} Stocks ({statModal.list.length})</span>
            </div>
            <button onClick={() => setStatModal(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={24} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--text-muted)', paddingBottom: '8px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
              <div>Symbol</div>
              <div style={{ textAlign: 'right' }}>LTP</div>
              <div style={{ textAlign: 'right' }}>CH%</div>
            </div>
            {statModal.list.map(s => (
              <div 
                key={s.symbol} 
                onClick={() => { setSelected(s); setStatModal(null); }} 
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: '800', color: '#fff', fontSize: 'calc(15px * var(--font-scale, 1))' }}>{s.symbol}</div>
                <div style={{ textAlign: 'right', color: '#fff', fontWeight: '700', fontSize: 'calc(14px * var(--font-scale, 1))' }}>{s.ltp}</div>
                <div style={{ textAlign: 'right', color: s.pChange >= 0 ? 'var(--bull)' : (s.pChange < 0 ? 'var(--bear)' : 'var(--text-secondary)'), fontWeight: '700', fontSize: 'calc(14px * var(--font-scale, 1))' }}>{s.pChange >= 0 ? '+' : ''}{s.pChange}%</div>
              </div>
            ))}
          </div>
        </div>
      )}`;

const newStatModalHtml = `      {/* 3. Change Summary View */}
      {statModal && (
        <ChangeSummaryView 
          currentTab={statModal.label} 
          onTabChange={(tabId) => setStatModal({ label: tabId })}
          onClose={() => setStatModal(null)}
          stocks={stocks}
          setSelected={setSelected}
        />
      )}`;

// Need to import ChevronLeft
if (!code.includes('ChevronLeft,')) {
  code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, "import { ChevronLeft, $1 } from 'lucide-react';");
}

if (code.includes(oldStatModalHtml)) {
  code = code.replace(oldStatModalHtml, newStatModalHtml);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Replaced Stat Modal with Change Summary');
} else {
  console.log('Stat modal HTML not found');
  // Fallback regex replacement
  code = code.replace(/\{\/\* 3\. Stat Modal \*\/\}[\s\S]*?\)\}/, newStatModalHtml);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Regex fallback replaced');
}
