const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// 1. Add State
const stateTarget = `const [search, setSearch] = useState('');`;
const stateReplacement = `const [search, setSearch] = useState('');
  const [showIndicesModal, setShowIndicesModal] = useState(false);`;
code = code.replace(stateTarget, stateReplacement);

// 2. Add clickable Chevron
const headerTarget = `<span style={{ fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff' }}>NEPSE Index</span>`;
const headerReplacement = `<span onClick={() => setShowIndicesModal(true)} style={{ fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>NEPSE Index <ChevronDown style={{width: 18, height: 18}} /></span>`;
code = code.replace(headerTarget, headerReplacement);

// 3. Add the modal at the end before final closing div
const modalCode = `
        {/* Indices Modal */}
        {showIndicesModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', padding: '24px', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'calc(18px * var(--font-scale, 1))', fontWeight: '800', color: '#fff' }}>Market Indices</span>
                <button onClick={() => setShowIndicesModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X /></button>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { label: 'NEPSE Index', data: indices?.nepse },
                  { label: 'Sensitive Index', data: indices?.sensitive },
                  { label: 'Float Index', data: indices?.float }
                ].map((idx, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '700', fontSize: 'calc(14px * var(--font-scale, 1))' }}>{idx.label}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#fff', fontWeight: '800', fontSize: 'calc(15px * var(--font-scale, 1))' }}>{idx.data ? Number(idx.data.value).toFixed(2) : '0.00'}</div>
                      <div style={{ color: idx.data?.change >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: '700', fontSize: 'calc(12px * var(--font-scale, 1))' }}>
                        {idx.data?.change >= 0 ? '+' : ''}{idx.data ? Number(idx.data.change).toFixed(2) : '0.00'} ({idx.data?.pChange >= 0 ? '+' : ''}{idx.data ? Number(idx.data.pChange).toFixed(2) : '0.00'}%)
                      </div>
                    </div>
                  </div>
                ))}
                
                <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '700', fontSize: 'calc(14px * var(--font-scale, 1))' }}>Market Status</span>
                    <span style={{ color: marketStatus?.isOpen ? 'var(--bull)' : 'var(--bear)', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', background: marketStatus?.isOpen ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)' }}>
                      {marketStatus?.isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}`;

const finalDivTarget = `      </div>
    </div>
  );
}`;
code = code.replace(finalDivTarget, modalCode);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Patched Dashboard.jsx with Indices Modal');
