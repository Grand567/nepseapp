const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const sectorHeatmapCode = `
export function SectorHeatmap({ stocks }) {
  const sectors = useMemo(() => {
    const map = {};
    stocks.forEach(s => {
      let sec = s.sector || 'Others';
      if (sec.length > 20) sec = sec.substring(0, 20) + '...';
      if (!map[sec]) map[sec] = { name: sec, count: 0, totalChange: 0, turnover: 0 };
      map[sec].count++;
      map[sec].totalChange += (s.pChange || 0);
      map[sec].turnover += (s.turnover || (s.ltp * (s.volume || 0)));
    });
    return Object.values(map)
      .map(s => ({ ...s, avgChange: s.count > 0 ? s.totalChange / s.count : 0 }))
      .sort((a,b) => b.turnover - a.turnover);
  }, [stocks]);

  if (sectors.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>Sector Heatmap</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {sectors.slice(0, 8).map(s => {
          const isBull = s.avgChange >= 0;
          const bg = isBull ? 'rgba(16, 217, 138, 0.15)' : 'rgba(245, 69, 92, 0.15)';
          const color = isBull ? 'var(--bull)' : 'var(--bear)';
          return (
            <div key={s.name} style={{ background: bg, border: \`1px solid \${color}40\`, borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 'calc(14px * var(--font-scale, 1))', fontWeight: 900, color }}>{isBull ? '+' : ''}{Number(s.avgChange || 0).toFixed(2)}%</span>
                <span style={{ fontSize: 'calc(10px * var(--font-scale, 1))', color: 'var(--text-muted)' }}>{s.count} scrips</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

`;

const startMarker = 'export default function Dashboard';
const startIndex = code.indexOf(startMarker);
if (startIndex !== -1 && !code.includes('export function SectorHeatmap')) {
  code = code.substring(0, startIndex) + sectorHeatmapCode + code.substring(startIndex);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Fixed SectorHeatmap!');
} else {
  console.log('Could not find start marker or already exists');
}
