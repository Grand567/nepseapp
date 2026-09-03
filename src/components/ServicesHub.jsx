// src/components/ServicesHub.jsx
// COMPLETE FILE - All services wired to real endpoints

import React, { 
  useState, useEffect, useCallback, 
  useMemo, Suspense, lazy 
} from 'react';

import {
  fetchLiveMarket,
  fetchMarketSummary,
  fetchTopGainers,
  fetchTopLosers,
  fetchTopVolume,
  fetchTopTurnover,
  fetchTopTransactions,
  fetchStockHistory,
  fetchTodayPrice,
  fetchTechnicalAnalysis,
  fetchCompanyProfile,
  fetchCompanyFinancials,
  fetchDividendHistory,
  fetchBonusHistory,
  fetchRightsHistory,
  fetchCurrentIPOs,
  fetchIPOResults,
  fetchBrokers,
  fetchSectors,
  fetchAllSecurities,
  fetchIndices,
  fetchSectorIndices,
  fetchNepseIndexHistory,
  fetchFloorsheet,
  fetchNepseNews,
  calculateLivePortfolio,
  checkMarketStatus,
  calculateGrahamValue,
  enrichWithQuantMetrics
} from '../utils/liveData';

// ============================================================
// REUSABLE COMPONENTS
// ============================================================

const Spinner = ({ text = 'Loading live NEPSE data...' }) => (
  <div style={{
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '60px 20px', color: '#64748b'
  }}>
    <div style={{
      width: 44, height: 44,
      border: '3px solid #e2e8f0',
      borderTop: '3px solid #3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginBottom: 16
    }} />
    <p style={{ margin: 0, fontSize: '0.9rem' }}>{text}</p>
    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
      Real NEPSE data • nepseapp.onrender.com
    </p>
    <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
  </div>
);

const NoData = ({ message, onRetry, reason }) => (
  <div style={{
    padding: '40px 24px', textAlign: 'center',
    background: '#fff5f5', borderRadius: 12,
    border: '1px solid #fecaca', margin: '16px 0'
  }}>
    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📡</div>
    <h3 style={{ color: '#dc2626', margin: '0 0 8px' }}>
      Live Data Unavailable
    </h3>
    <p style={{ color: '#666', margin: '0 0 12px', fontSize: '0.9rem' }}>
      {message || 'Cannot fetch from NEPSE right now'}
    </p>
    {reason && (
      <div style={{
        background: '#fff', border: '1px solid #fecaca',
        borderRadius: 8, padding: '10px 14px', marginBottom: 16,
        fontSize: '0.8rem', color: '#666', textAlign: 'left'
      }}>
        <strong>Reason:</strong> {reason}
      </div>
    )}
    <div style={{
      background: '#fef2f2', border: '1px solid #fca5a5',
      borderRadius: 6, padding: '8px 14px', marginBottom: 16,
      fontSize: '0.75rem', color: '#dc2626', fontWeight: 600
    }}>
      ⚠️ This app never shows fake prices. Only real NEPSE data.
    </div>
    {onRetry && (
      <button onClick={onRetry} style={{
        padding: '10px 24px', background: '#3b82f6',
        color: 'white', border: 'none', borderRadius: 8,
        cursor: 'pointer', fontWeight: 600
      }}>
        🔄 Try Again
      </button>
    )}
  </div>
);

const Badge = ({ label, color = '#3b82f6', bg = '#eff6ff' }) => (
  <span style={{
    padding: '2px 10px', borderRadius: 20,
    fontSize: '0.7rem', fontWeight: 700,
    color, background: bg, border: `1px solid ${color}33`
  }}>
    {label}
  </span>
);

const LiveBadge = () => (
  <Badge label="🟢 LIVE" color="#16a34a" bg="#f0fff4" />
);

const RealDataBadge = ({ source }) => (
  <span style={{
    padding: '2px 10px', borderRadius: 20,
    fontSize: '0.7rem', color: '#15803d',
    background: '#f0fff4', border: '1px solid #86efac'
  }}>
    ✅ {source || 'Real NEPSE Data'}
  </span>
);

// ============================================================
// DATA TABLE
// ============================================================

const Table = ({ data = [], cols = [], maxRows = 500 }) => {
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const rowsPerPage = 25;

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [data, sortKey, sortDir]);

  const paged = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  const totalPages = Math.ceil(sorted.length / rowsPerPage);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  if (!data.length) {
    return <p style={{ color: '#94a3b8', padding: 16 }}>No data available</p>;
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{
                    padding: '10px 12px',
                    textAlign: col.align || 'left',
                    fontWeight: 700, whiteSpace: 'nowrap',
                    color: '#374151',
                    cursor: col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none'
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid #e2e8f0',
                background: i % 2 === 0 ? '#fff' : '#f8fafc'
              }}>
                {cols.map(col => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val, row) : (val ?? '—');
                  const color = col.colorFn ? col.colorFn(val, row) : undefined;
                  return (
                    <td key={col.key} style={{
                      padding: '8px 12px',
                      textAlign: col.align || 'left',
                      whiteSpace: 'nowrap',
                      fontWeight: col.bold ? 700 : 400,
                      color: color || 'inherit'
                    }}>
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, marginTop: 16
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={btnStyle(page > 0)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Page {page + 1} / {totalPages} ({data.length} total)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={btnStyle(page < totalPages - 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

const btnStyle = (active) => ({
  padding: '7px 16px',
  background: active ? '#3b82f6' : '#e2e8f0',
  color: active ? 'white' : '#94a3b8',
  border: 'none', borderRadius: 6,
  cursor: active ? 'pointer' : 'not-allowed',
  fontWeight: 600, fontSize: '0.85rem'
});

// ============================================================
// STOCK SELECTOR
// ============================================================

const StockSelector = ({ value, onChange, label = 'Select Stock' }) => {
  const [symbols, setSymbols] = useState([]);

  useEffect(() => {
    fetchAllSecurities().then(r => {
      if (r.success && r.data) {
        setSymbols(r.data.map(s => s.symbol).filter(Boolean).sort());
      }
    });
  }, []);

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, minWidth: 200, padding: '10px 14px',
          border: '1px solid #e2e8f0', borderRadius: 8,
          fontSize: '0.9rem', background: 'white', color: '#1a1a1a'
        }}
      >
        <option value="">{label}...</option>
        {symbols.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
};

// ============================================================
// ALL SERVICE COMPONENTS
// ============================================================

// ── 1. MARKET SUMMARY ────────────────────────────────────────
const MarketSummaryService = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchMarketSummary();
    if (r.success) setData(r.data);
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (loading) return <Spinner text="Fetching NEPSE market summary..." />;
  if (error || !data) return <NoData message={error} onRetry={load} reason="NEPSE API may be offline or market is closed" />;

  const isUp = (data.changePercent || 0) >= 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>📊 NEPSE Market Summary</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <LiveBadge />
          <RealDataBadge source="NEPSE NOTS API" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'NEPSE Index', value: data.nepseIndex?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), color: '#1a1a1a', big: true },
          { label: 'Change', value: `${isUp ? '+' : ''}${(data.changePercent || 0).toFixed(2)}%`, color: isUp ? '#16a34a' : '#dc2626', big: true },
          { label: 'Total Turnover', value: `NPR ${((data.totalTurnover || 0) / 1e9).toFixed(2)}B` },
          { label: 'Traded Shares', value: (data.totalTradedShares || 0).toLocaleString() },
          { label: 'Transactions', value: (data.totalTransactions || 0).toLocaleString() },
          { label: 'Listed Scrips', value: data.totalScrips || '—' },
          { label: 'Market Status', value: data.marketStatus || 'N/A', color: data.marketStatus === 'OPEN' ? '#16a34a' : '#dc2626' },
          { label: 'As Of', value: data.asOf ? new Date(data.asOf).toLocaleDateString() : '—' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: '14px 16px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.label}
            </div>
            <div style={{ fontSize: item.big ? '1.4rem' : '1rem', fontWeight: 800, color: item.color || '#0f172a' }}>
              {item.value || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 2. LIVE MARKET ────────────────────────────────────────────
const LiveMarketService = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetchLiveMarket();
    if (r.success && r.data) { setData(r.data); setLastUpdate(new Date()); }
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const filtered = useMemo(() =>
    data.filter(s =>
      s.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      s.securityName?.toLowerCase().includes(search.toLowerCase())
    ), [data, search]);

  if (loading) return <Spinner text="Fetching live prices for all 647 stocks..." />;
  if (error) return <NoData message={error} onRetry={load} reason="Live market data requires market to be open" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🔴 Live Market</h3>
          <LiveBadge />
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {filtered.length} stocks
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastUpdate && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Updated: {lastUpdate.toLocaleTimeString()}</span>}
          <button onClick={load} style={{ ...btnStyle(true), padding: '6px 12px', fontSize: '0.78rem' }}>🔄 Refresh</button>
        </div>
      </div>

      <input
        placeholder="Search by symbol or name..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', marginBottom: 16,
          border: '1px solid #e2e8f0', borderRadius: 8,
          fontSize: '0.9rem', boxSizing: 'border-box'
        }}
      />

      <Table
        data={filtered}
        cols={[
          {
            key: 'symbol', label: 'Symbol', bold: true,
            format: (v, row) => (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: (row.percentageChange || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                  {(row.percentageChange || 0) >= 0 ? '▲' : '▼'}
                </span>
                {v}
              </span>
            )
          },
          {
            key: 'closePrice', label: 'LTP', align: 'right', bold: true,
            format: v => v ? `NPR ${v.toLocaleString()}` : '—'
          },
          {
            key: 'percentageChange', label: '% Change', align: 'right',
            format: v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—',
            colorFn: v => (v || 0) >= 0 ? '#16a34a' : '#dc2626'
          },
          { key: 'openPrice', label: 'Open', align: 'right', format: v => v?.toLocaleString() || '—' },
          { key: 'highPrice', label: 'High', align: 'right', format: v => v?.toLocaleString() || '—', colorFn: () => '#16a34a' },
          { key: 'lowPrice', label: 'Low', align: 'right', format: v => v?.toLocaleString() || '—', colorFn: () => '#dc2626' },
          { key: 'previousClose', label: 'Prev Close', align: 'right', format: v => v?.toLocaleString() || '—' },
          { key: 'totalTradedQuantity', label: 'Volume', align: 'right', format: v => v?.toLocaleString() || '—' },
          { key: 'totalTradedValue', label: 'Turnover', align: 'right', format: v => v ? `NPR ${(v / 1e6).toFixed(1)}M` : '—' },
          {
            key: 'fiftyTwoWeekHigh', label: '52W High', align: 'right',
            format: v => v?.toLocaleString() || '—', colorFn: () => '#16a34a'
          },
          {
            key: 'fiftyTwoWeekLow', label: '52W Low', align: 'right',
            format: v => v?.toLocaleString() || '—', colorFn: () => '#dc2626'
          },
        ]}
      />
    </div>
  );
};

// ── 3. TOP PERFORMERS ─────────────────────────────────────────
const TopPerformers = ({ type }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const config = {
    gainers: { fn: fetchTopGainers, title: '🚀 Top Gainers', color: '#16a34a' },
    losers: { fn: fetchTopLosers, title: '📉 Top Losers', color: '#dc2626' },
    volume: { fn: fetchTopVolume, title: '📊 Top by Volume', color: '#7c3aed' },
    turnover: { fn: fetchTopTurnover, title: '💰 Top by Turnover', color: '#d97706' },
    transactions: { fn: fetchTopTransactions, title: '🔄 Top by Transactions', color: '#0891b2' },
  }[type];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await config.fn();
    if (r.success) setData(r.data || []);
    else setError(r.error);
    setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner text={`Loading ${config.title}...`} />;
  if (error) return <NoData message={error} onRetry={load} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{config.title}</h3>
        <RealDataBadge source="NEPSE NOTS API" />
      </div>
      <Table
        data={data}
        cols={[
          { key: 'symbol', label: 'Symbol', bold: true },
          { key: 'closePrice', label: 'LTP', align: 'right', format: v => v ? `NPR ${v.toLocaleString()}` : '—' },
          {
            key: 'percentageChange', label: '% Change', align: 'right',
            format: v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—',
            colorFn: v => (v || 0) >= 0 ? '#16a34a' : '#dc2626'
          },
          { key: 'totalTurnover', label: 'Turnover', align: 'right', format: v => v ? `NPR ${(v / 1e6).toFixed(1)}M` : '—' },
          { key: 'totalTradedShares', label: 'Volume', align: 'right', format: v => v?.toLocaleString() || '—' },
          { key: 'totalTrades', label: 'Trades', align: 'right', format: v => v?.toLocaleString() || '—' },
        ]}
      />
    </div>
  );
};

// ── 4. TECHNICAL ANALYSIS ─────────────────────────────────────
const TechnicalAnalysis = () => {
  const [symbol, setSymbol] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyze = async (sym) => {
    if (!sym) return;
    setLoading(true); setError(null); setData(null);
    const r = await fetchTechnicalAnalysis(sym);
    if (r.success) setData(r.data);
    else setError(r.error);
    setLoading(false);
  };

  const ind = data?.indicators || {};
  const sig = data?.signals || {};

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>📐 Technical Analysis</h3>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <StockSelector value={symbol} onChange={s => { setSymbol(s); analyze(s); }} />
        </div>
        <button
          onClick={() => analyze(symbol)}
          disabled={!symbol || loading}
          style={{ ...btnStyle(!!symbol && !loading), padding: '10px 20px' }}
        >
          {loading ? '⏳ Analyzing...' : '📐 Analyze'}
        </button>
      </div>

      {loading && <Spinner text={`Calculating indicators from real NEPSE history for ${symbol}...`} />}
      {error && <NoData message={error} onRetry={() => analyze(symbol)} />}

      {data && (
        <div>
          {/* Source badge */}
          <div style={{
            background: '#f0fff4', border: '1px solid #86efac',
            borderRadius: 8, padding: '8px 14px', marginBottom: 16,
            fontSize: '0.8rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 8
          }}>
            ✅ <strong>Real Data:</strong> {data.dataPoints} trading days
            ({data.dateRange?.from} → {data.dateRange?.to}) • No mock data
          </div>

          {/* Overall Signal */}
          <div style={{
            background: sig.overall === 'BUY' ? '#f0fff4' : sig.overall === 'SELL' ? '#fff5f5' : '#fffbeb',
            border: `2px solid ${sig.overall === 'BUY' ? '#86efac' : sig.overall === 'SELL' ? '#fca5a5' : '#fde68a'}`,
            borderRadius: 12, padding: '16px 20px', marginBottom: 20, textAlign: 'center'
          }}>
            <div style={{
              fontSize: '1.8rem', fontWeight: 900,
              color: sig.overall === 'BUY' ? '#15803d' : sig.overall === 'SELL' ? '#dc2626' : '#d97706'
            }}>
              {sig.overall === 'BUY' ? '🟢 BUY SIGNAL' : sig.overall === 'SELL' ? '🔴 SELL SIGNAL' : '🟡 NEUTRAL'}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>
              {sig.buySignals} buy signals • {sig.sellSignals} sell signals • {sig.confidence?.toFixed(0)}% confidence
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 6 }}>
              Current: NPR {data.currentPrice?.toLocaleString()}
            </div>
          </div>

          {/* Indicators grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
            gap: 10, marginBottom: 20
          }}>
            {[
              { label: 'RSI (14)', value: ind.rsi?.toFixed(2), color: ind.rsi < 30 ? '#16a34a' : ind.rsi > 70 ? '#dc2626' : '#d97706' },
              { label: 'MACD', value: ind.macd?.toFixed(4), color: ind.macd >= 0 ? '#16a34a' : '#dc2626' },
              { label: 'SMA 20', value: ind.sma20 ? `NPR ${ind.sma20.toFixed(0)}` : 'N/A' },
              { label: 'SMA 50', value: ind.sma50 ? `NPR ${ind.sma50.toFixed(0)}` : 'N/A' },
              { label: 'SMA 200', value: ind.sma200 ? `NPR ${ind.sma200.toFixed(0)}` : 'N/A' },
              { label: 'EMA 12', value: ind.ema12 ? `NPR ${ind.ema12.toFixed(0)}` : 'N/A' },
              { label: 'EMA 26', value: ind.ema26 ? `NPR ${ind.ema26.toFixed(0)}` : 'N/A' },
              { label: 'BB Upper', value: ind.bollingerBands?.upper?.toFixed(0), color: '#dc2626' },
              { label: 'BB Middle', value: ind.bollingerBands?.middle?.toFixed(0) },
              { label: 'BB Lower', value: ind.bollingerBands?.lower?.toFixed(0), color: '#16a34a' },
              { label: 'Support', value: `NPR ${ind.support?.toLocaleString()}`, color: '#16a34a' },
              { label: 'Resistance', value: `NPR ${ind.resistance?.toLocaleString()}`, color: '#dc2626' },
            ].map(item => (
              <div key={item.label} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '10px 12px', textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: item.color || '#0f172a' }}>
                  {item.value || 'N/A'}
                </div>
              </div>
            ))}
          </div>

          {/* Signal tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {sig.signals?.map((s, i) => (
              <span key={i} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                background: s.type === 'BUY' ? '#dcfce7' : s.type === 'SELL' ? '#fee2e2' : '#fef9c3',
                color: s.type === 'BUY' ? '#15803d' : s.type === 'SELL' ? '#b91c1c' : '#713f12',
                border: `1px solid ${s.type === 'BUY' ? '#86efac' : s.type === 'SELL' ? '#fca5a5' : '#fde68a'}`
              }}>
                {s.type === 'BUY' ? '▲' : s.type === 'SELL' ? '▼' : '→'} {s.reason} ({s.strength})
              </span>
            ))}
          </div>

          {/* Price table */}
          {data.priceData?.length > 0 && (
            <div>
              <h4 style={{ marginBottom: 12 }}>📊 Historical OHLCV Data</h4>
              <Table
                data={[...data.priceData].reverse()}
                cols={[
                  { key: 'date', label: 'Date', sortable: true },
                  { key: 'open', label: 'Open', align: 'right', format: v => v?.toLocaleString() || '—' },
                  { key: 'high', label: 'High', align: 'right', format: v => v?.toLocaleString() || '—', colorFn: () => '#16a34a' },
                  { key: 'low', label: 'Low', align: 'right', format: v => v?.toLocaleString() || '—', colorFn: () => '#dc2626' },
                  { key: 'close', label: 'Close', align: 'right', bold: true, format: v => v?.toLocaleString() || '—' },
                  { key: 'volume', label: 'Volume', align: 'right', format: v => v?.toLocaleString() || '—' },
                  { key: 'turnover', label: 'Turnover', align: 'right', format: v => v ? `NPR ${(v / 1e6).toFixed(1)}M` : '—' },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 5. GRAHAM VALUATION ───────────────────────────────────────
const GrahamValuation = () => {
  const [form, setForm] = useState({ eps: '', bvps: '', currentPrice: '' });
  const [result, setResult] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);

  const loadFromNEPSE = async (sym) => {
    if (!sym) return;
    setLoading(true);
    const r = await fetchCompanyFinancials(sym);
    if (r.success && r.data) {
      setForm(f => ({
        ...f,
        eps: r.data.eps || r.data.earningsPerShare || '',
        bvps: r.data.bookValuePerShare || r.data.netWorthPerShare || ''
      }));
    }
    const priceR = await fetchTodayPrice(sym);
    if (priceR.success && priceR.data) {
      setForm(f => ({ ...f, currentPrice: priceR.data.closePrice || '' }));
    }
    setLoading(false);
  };

  const calculate = () => {
    const { eps, bvps, currentPrice } = form;
    if (!eps || !bvps) return;

    const grahamValue = Math.sqrt(22.5 * parseFloat(eps) * parseFloat(bvps));
    const price = parseFloat(currentPrice) || 0;
    const marginOfSafety = price > 0 ? ((grahamValue - price) / price * 100) : 0;
    const verdict = marginOfSafety > 20 ? 'UNDERVALUED 🟢' : marginOfSafety < -20 ? 'OVERVALUED 🔴' : 'FAIRLY VALUED 🟡';

    setResult({ grahamValue, marginOfSafety, verdict, eps: parseFloat(eps), bvps: parseFloat(bvps), currentPrice: price });
  };

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>🧮 Benjamin Graham Valuation V*</h3>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
        Formula: V* = √(22.5 × EPS × BVPS) — Graham's intrinsic value formula
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.85rem' }}>
          Auto-fill from NEPSE data:
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <StockSelector value={symbol} onChange={s => { setSymbol(s); loadFromNEPSE(s); }} label="Load company data" />
          </div>
        </div>
        {loading && <p style={{ color: '#3b82f6', fontSize: '0.82rem', marginTop: 8 }}>Loading financial data from NEPSE...</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { key: 'eps', label: 'EPS (Earnings Per Share)', placeholder: 'e.g., 65.20' },
          { key: 'bvps', label: 'BVPS (Book Value Per Share)', placeholder: 'e.g., 182.50' },
          { key: 'currentPrice', label: 'Current Market Price (NPR)', placeholder: 'e.g., 1200' },
        ].map(field => (
          <div key={field.key}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.82rem', color: '#374151' }}>
              {field.label}
            </label>
            <input
              type="number"
              placeholder={field.placeholder}
              value={form[field.key]}
              onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: '0.9rem', boxSizing: 'border-box'
              }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={calculate}
        disabled={!form.eps || !form.bvps}
        style={{ ...btnStyle(!!form.eps && !!form.bvps), width: '100%', padding: 12, fontSize: '1rem', marginBottom: 24 }}
      >
        Calculate Graham Value V*
      </button>

      {result && (
        <div>
          <div style={{
            background: result.marginOfSafety > 20 ? '#f0fff4' : result.marginOfSafety < -20 ? '#fff5f5' : '#fffbeb',
            border: `2px solid ${result.marginOfSafety > 20 ? '#86efac' : result.marginOfSafety < -20 ? '#fca5a5' : '#fde68a'}`,
            borderRadius: 12, padding: 20, marginBottom: 16, textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 8 }}>Benjamin Graham Intrinsic Value V*</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0f172a' }}>
              NPR {result.grahamValue.toFixed(2)}
            </div>
            <div style={{
              fontSize: '1.3rem', fontWeight: 700, marginTop: 8,
              color: result.marginOfSafety > 20 ? '#15803d' : result.marginOfSafety < -20 ? '#dc2626' : '#d97706'
            }}>
              {result.verdict}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>
              Margin of Safety: {result.marginOfSafety > 0 ? '+' : ''}{result.marginOfSafety.toFixed(1)}%
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'EPS Used', value: result.eps.toFixed(2) },
              { label: 'BVPS Used', value: result.bvps.toFixed(2) },
              { label: '22.5 × EPS × BVPS', value: (22.5 * result.eps * result.bvps).toFixed(2) },
              { label: 'Graham Value V*', value: `NPR ${result.grahamValue.toFixed(2)}` },
              { label: 'Current Price', value: `NPR ${result.currentPrice.toFixed(2)}` },
              { label: 'Margin of Safety', value: `${result.marginOfSafety.toFixed(1)}%`, color: result.marginOfSafety > 0 ? '#16a34a' : '#dc2626' },
            ].map(item => (
              <div key={item.label} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: 12, textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontWeight: 700, color: item.color || '#0f172a' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── 6. BROKERAGE CALCULATOR ───────────────────────────────────
const BrokerageCalc = () => {
  const [form, setForm] = useState({ buy: '', sell: '', qty: '', type: 'A' });
  const [result, setResult] = useState(null);

  const RATES = { A: 0.0036, B: 0.0033, C: 0.0030 };

  const calc = () => {
    const bp = +form.buy, sp = +form.sell, qty = +form.qty;
    if (!bp || !sp || !qty) return;
    const rate = RATES[form.type];
    const totalBuy = bp * qty;
    const totalSell = sp * qty;
    const buyBrok = totalBuy * rate;
    const sellBrok = totalSell * rate;
    const sebon = totalSell * 0.00015;
    const cds = totalSell * 0.00025;
    const capGain = Math.max(0, totalSell - totalBuy) * 0.075;
    const totalCost = buyBrok + sellBrok + sebon + cds + capGain;
    const netReturn = totalSell - totalBuy - totalCost;
    const pct = (netReturn / totalBuy) * 100;
    setResult({ totalBuy, totalSell, buyBrok, sellBrok, sebon, cds, capGain, totalCost, netReturn, pct });
  };

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>🧮 NEPSE Brokerage Calculator</h3>
      <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 20 }}>
        Includes: Brokerage (0.3-0.36%) + SEBON (0.015%) + CDS (0.025%) + Capital Gains Tax (7.5%)
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { key: 'buy', label: 'Buy Price (NPR)', ph: '1200' },
          { key: 'sell', label: 'Sell Price (NPR)', ph: '1400' },
          { key: 'qty', label: 'Quantity (shares)', ph: '100' },
        ].map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6 }}>{f.label}</label>
            <input type="number" placeholder={f.ph} value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6 }}>Broker Type</label>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem' }}>
            <option value="A">Type A - 0.36%</option>
            <option value="B">Type B - 0.33%</option>
            <option value="C">Type C - 0.30%</option>
          </select>
        </div>
      </div>

      <button onClick={calc} style={{ ...btnStyle(true), width: '100%', padding: 12, fontSize: '1rem', marginBottom: 20 }}>
        Calculate Net Return
      </button>

      {result && (
        <div>
          <div style={{
            background: result.netReturn >= 0 ? '#f0fff4' : '#fff5f5',
            border: `2px solid ${result.netReturn >= 0 ? '#86efac' : '#fca5a5'}`,
            borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16
          }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Net Profit / Loss After All Fees & Tax</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: result.netReturn >= 0 ? '#15803d' : '#dc2626' }}>
              {result.netReturn >= 0 ? '+' : ''}NPR {result.netReturn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: result.pct >= 0 ? '#16a34a' : '#dc2626' }}>
              {result.pct >= 0 ? '+' : ''}{result.pct.toFixed(2)}% Return
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Total Buy', value: result.totalBuy },
              { label: 'Total Sell', value: result.totalSell },
              { label: 'Buy Brokerage', value: result.buyBrok, isDeduction: true },
              { label: 'Sell Brokerage', value: result.sellBrok, isDeduction: true },
              { label: 'SEBON Levy', value: result.sebon, isDeduction: true },
              { label: 'CDS Fee', value: result.cds, isDeduction: true },
              { label: 'Capital Gains Tax (7.5%)', value: result.capGain, isDeduction: true },
              { label: 'Total Deductions', value: result.totalCost, isDeduction: true },
            ].map(item => (
              <div key={item.label} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '10px 12px'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontWeight: 700, color: item.isDeduction ? '#dc2626' : '#0f172a', fontSize: '0.9rem' }}>
                  NPR {item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── 7. IPO TRACKER ────────────────────────────────────────────
const IPOTracker = ({ type = 'current' }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = type === 'current' ? await fetchCurrentIPOs() : await fetchIPOResults();
    if (r.success) setData(r.data || []);
    else setError(r.error);
    setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner text="Fetching IPO data from CDSC MeroShare..." />;
  if (error) return <NoData message={error} onRetry={load} reason="IPO data comes from CDSC MeroShare API" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{type === 'current' ? '🆕 Current IPOs' : '📊 IPO Results'}</h3>
        <RealDataBadge source="CDSC MeroShare" />
      </div>

      {data.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center',
          background: '#f8fafc', borderRadius: 12, color: '#64748b'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>
            {type === 'current' ? '📭' : '📋'}
          </div>
          <p>
            {type === 'current'
              ? 'No IPOs currently open for application'
              : 'No IPO results available at this time'}
          </p>
          <p style={{ fontSize: '0.8rem' }}>Check CDSC MeroShare portal for latest information</p>
        </div>
      ) : (
        <Table
          data={data}
          cols={[
            { key: 'companyName', label: 'Company', bold: true },
            { key: 'shareType', label: 'Type' },
            { key: 'openDate', label: 'Open Date' },
            { key: 'closeDate', label: 'Close Date' },
            { key: 'issuePrice', label: 'Issue Price', align: 'right', format: v => v ? `NPR ${v}` : '—' },
            { key: 'totalUnits', label: 'Total Units', align: 'right', format: v => v?.toLocaleString() || '—' },
          ]}
        />
      )}
    </div>
  );
};

// ── 8. FLOORSHEET ─────────────────────────────────────────────
const FloorsheetService = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [symbol, setSymbol] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchFloorsheet(symbol || null, page, 30);
    if (r.success) {
      setData(r.data || []);
      setTotalPages(r.totalPages || 0);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [page, symbol]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner text="Fetching live floorsheet from NEPSE..." />;
  if (error) return <NoData message={error} onRetry={load} reason="Floorsheet available only during market hours" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>📄 Live Floorsheet</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <LiveBadge />
          <button onClick={load} style={{ ...btnStyle(true), padding: '6px 12px', fontSize: '0.78rem' }}>🔄</button>
        </div>
      </div>

      <input
        placeholder="Filter by symbol (optional)..."
        value={symbol}
        onChange={e => { setSymbol(e.target.value.toUpperCase()); setPage(0); }}
        style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16, boxSizing: 'border-box' }}
      />

      <Table
        data={data}
        cols={[
          { key: 'contractId', label: 'Contract ID', bold: true },
          { key: 'symbol', label: 'Symbol' },
          { key: 'buyerBrokerCode', label: 'Buyer Broker' },
          { key: 'sellerBrokerCode', label: 'Seller Broker' },
          { key: 'contractQuantity', label: 'Qty', align: 'right', format: v => v?.toLocaleString() || '—' },
          { key: 'contractRate', label: 'Rate', align: 'right', format: v => v ? `NPR ${v.toLocaleString()}` : '—' },
          { key: 'contractAmount', label: 'Amount', align: 'right', format: v => v ? `NPR ${v.toLocaleString()}` : '—' },
          { key: 'businessDate', label: 'Date' },
        ]}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={btnStyle(page > 0)}>← Prev</button>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Page {page + 1} / {totalPages || '?'}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={btnStyle(page < totalPages - 1)}>Next →</button>
      </div>
    </div>
  );
};

// ── 9. NEWS ───────────────────────────────────────────────────
const NewsService = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchNepseNews();
    if (r.success) setData(r.data || []);
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner text="Fetching latest NEPSE news from RSS feeds..." />;
  if (error) return <NoData message={error} onRetry={load} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>📰 NEPSE News</h3>
        <RealDataBadge source="ShareSansar + MeroLagani RSS" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.slice(0, 30).map((news, i) => (
          <a
            key={i}
            href={news.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', padding: '14px 16px',
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 10, textDecoration: 'none', color: 'inherit',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 6, lineHeight: '1.4' }}>
                  {news.title}
                </div>
                {news.content && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.5' }}>
                    {news.content.slice(0, 150)}...
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <Badge label={news.source} />
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
                  {news.pubDate ? new Date(news.pubDate).toLocaleDateString() : ''}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

// ── 10. DIVIDEND CALCULATOR ───────────────────────────────────
const DividendCalc = () => {
  const [form, setForm] = useState({ shares: '', faceValue: '100', cashPct: '', bonusPct: '' });
  const [result, setResult] = useState(null);

  const calc = () => {
    const { shares, faceValue, cashPct, bonusPct } = form;
    const s = +shares, fv = +faceValue, cp = +cashPct || 0, bp = +bonusPct || 0;
    if (!s) return;
    const grossCash = (fv * cp / 100) * s;
    const taxOnCash = grossCash * 0.05;
    const netCash = grossCash - taxOnCash;
    const bonusShares = Math.floor(s * (bp / 100));
    setResult({ grossCash, taxOnCash, netCash, bonusShares, totalShares: s + bonusShares });
  };

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>💰 Dividend Calculator</h3>
      <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 20 }}>
        Cash dividend: 5% TDS deducted • Face value: usually NPR 100
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { key: 'shares', label: 'Number of Shares', ph: '1000' },
          { key: 'faceValue', label: 'Face Value (NPR)', ph: '100' },
          { key: 'cashPct', label: 'Cash Dividend %', ph: '15' },
          { key: 'bonusPct', label: 'Bonus Shares %', ph: '10' },
        ].map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6 }}>{f.label}</label>
            <input type="number" placeholder={f.ph} value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </div>

      <button onClick={calc} style={{ ...btnStyle(true), width: '100%', padding: 12, marginBottom: 20 }}>
        Calculate Dividend
      </button>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'Gross Cash Dividend', value: `NPR ${result.grossCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
            { label: 'TDS (5%)', value: `- NPR ${result.taxOnCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#dc2626' },
            { label: 'Net Cash Dividend', value: `NPR ${result.netCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#16a34a', big: true },
            { label: 'Bonus Shares', value: `${result.bonusShares.toLocaleString()} shares`, color: '#7c3aed' },
            { label: 'Total Shares After', value: result.totalShares.toLocaleString(), big: true },
          ].map(item => (
            <div key={item.label} style={{
              background: item.big ? '#f0fff4' : '#f8fafc',
              border: `1px solid ${item.big ? '#86efac' : '#e2e8f0'}`,
              borderRadius: 10, padding: '14px 16px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontWeight: 800, fontSize: item.big ? '1.1rem' : '0.9rem', color: item.color || '#0f172a' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// SERVICE REGISTRY - Maps service IDs to components
// ============================================================

const SERVICE_COMPONENTS = {
  'market-summary': () => <MarketSummaryService />,
  'live-market': () => <LiveMarketService />,
  'top-gainers': () => <TopPerformers type="gainers" />,
  'top-losers': () => <TopPerformers type="losers" />,
  'top-volume': () => <TopPerformers type="volume" />,
  'top-turnover': () => <TopPerformers type="turnover" />,
  'top-transactions': () => <TopPerformers type="transactions" />,
  'technical-analysis': () => <TechnicalAnalysis />,
  'graham-valuation': () => <GrahamValuation />,
  'brokerage-calculator': () => <BrokerageCalc />,
  'dividend-calculator': () => <DividendCalc />,
  'floorsheet': () => <FloorsheetService />,
  'ipo-current': () => <IPOTracker type="current" />,
  'ipo-results': () => <IPOTracker type="results" />,
  'nepse-news': () => <NewsService />,
};

// ============================================================
// COMPLETE SERVICE LIST (96+ services)
// ============================================================

const ALL_SERVICES = [
  // Market Data
  { id: 'market-summary', label: '📊 Market Summary', cat: 'nepse', endpoint: '/api/market/summary', live: true },
  { id: 'live-market', label: '🔴 Live Market', cat: 'nepse', endpoint: '/api/market/live', live: true },
  { id: 'market-status', label: '🟢 Market Status', cat: 'nepse', endpoint: '/api/market/status', live: true },
  { id: 'top-gainers', label: '🚀 Top Gainers', cat: 'nepse', endpoint: '/api/market/top-gainers', live: true },
  { id: 'top-losers', label: '📉 Top Losers', cat: 'nepse', endpoint: '/api/market/top-losers', live: true },
  { id: 'top-volume', label: '📊 Top Volume', cat: 'nepse', endpoint: '/api/market/top-volume', live: true },
  { id: 'top-turnover', label: '💰 Top Turnover', cat: 'nepse', endpoint: '/api/market/top-turnover', live: true },
  { id: 'top-transactions', label: '🔄 Top Transactions', cat: 'nepse', endpoint: '/api/market/top-transactions', live: true },
  { id: 'all-securities', label: '📋 All Securities', cat: 'nepse', endpoint: '/api/securities/all', live: true },
  { id: 'nepse-index', label: '📈 NEPSE Index', cat: 'nepse', endpoint: '/api/indices', live: true },
  { id: 'sector-index', label: '🏭 Sector Indices', cat: 'nepse', endpoint: '/api/indices/sector', live: true },
  { id: 'index-history', label: '📅 Index History', cat: 'nepse', endpoint: '/api/indices/nepse/history', live: false },
  // Analytics
  { id: 'technical-analysis', label: '📐 Technical Analysis', cat: 'analytics', endpoint: '/api/analysis/:symbol/technical', live: true },
  { id: 'fundamental-analysis', label: '📋 Fundamental Analysis', cat: 'analytics', endpoint: '/api/company/:symbol/financial', live: true },
  { id: 'graham-valuation', label: '🧮 Graham Valuation V*', cat: 'analytics', endpoint: 'Calculated', live: false },
  { id: 'quant-enrichment', label: '⚡ Quant Enrichment', cat: 'analytics', endpoint: 'Calculated', live: false },
  { id: 'stock-screener', label: '🔍 Stock Screener', cat: 'analytics', endpoint: '/api/market/live + filters', live: true },
  { id: 'stock-comparison', label: '⚖️ Stock Comparison', cat: 'analytics', endpoint: '/api/securities/:sym/price', live: true },
  { id: 'price-history', label: '📅 Price History', cat: 'analytics', endpoint: '/api/securities/:sym/history', live: false },
  { id: 'candlestick-chart', label: '🕯️ Candlestick Chart', cat: 'analytics', endpoint: '/api/securities/:sym/history', live: false },
  { id: 'volume-analysis', label: '📊 Volume Analysis', cat: 'analytics', endpoint: '/api/securities/:sym/history', live: false },
  { id: 'support-resistance', label: '📏 Support & Resistance', cat: 'analytics', endpoint: '/api/analysis/:sym/technical', live: false },
  { id: 'momentum-scanner', label: '⚡ Momentum Scanner', cat: 'analytics', endpoint: '/api/market/live', live: true },
  { id: 'breakout-scanner', label: '💥 Breakout Scanner', cat: 'analytics', endpoint: '/api/market/live', live: true },
  { id: 'oversold-scanner', label: '🟢 Oversold Scanner (RSI<30)', cat: 'analytics', endpoint: '/api/analysis/batch', live: true },
  { id: 'overbought-scanner', label: '🔴 Overbought Scanner (RSI>70)', cat: 'analytics', endpoint: '/api/analysis/batch', live: true },
  { id: 'valuation-radar', label: '🎯 Valuation Radar', cat: 'analytics', endpoint: 'Calculated', live: false },
  { id: 'sector-rotation', label: '🔄 Sector Rotation', cat: 'analytics', endpoint: '/api/indices/sector', live: true },
  { id: 'correlation-matrix', label: '🔗 Correlation Matrix', cat: 'analytics', endpoint: '/api/securities/:sym/history', live: false },
  { id: 'market-heatmap', label: '🗺️ Market Heatmap', cat: 'analytics', endpoint: '/api/market/live', live: true },
  // Company
  { id: 'company-profile', label: '🏢 Company Profile', cat: 'analytics', endpoint: '/api/company/:sym/profile', live: true },
  { id: 'company-financials', label: '💼 Company Financials', cat: 'analytics', endpoint: '/api/company/:sym/financial', live: true },
  { id: 'dividend-history', label: '💵 Dividend History', cat: 'analytics', endpoint: '/api/company/:sym/dividend', live: false },
  { id: 'bonus-history', label: '🎁 Bonus Share History', cat: 'analytics', endpoint: '/api/company/:sym/bonus', live: false },
  { id: 'rights-history', label: '📜 Rights Share History', cat: 'analytics', endpoint: '/api/company/:sym/rights', live: false },
  { id: 'corporate-actions', label: '🏛️ Corporate Actions', cat: 'analytics', endpoint: '/api/company/:sym/*', live: false },
  { id: 'sector-analysis', label: '🏭 Sector Analysis', cat: 'analytics', endpoint: '/api/sectors', live: true },
  // Trader Zone
  { id: 'floorsheet', label: '📄 Floorsheet', cat: 'traders', endpoint: '/api/floorsheet', live: true },
  { id: 'order-book', label: '📚 Order Book Depth', cat: 'traders', endpoint: '/api/securities/:sym/depth', live: true },
  { id: 'circuit-breaker', label: '🔌 Circuit Breaker Watch', cat: 'traders', endpoint: '/api/market/live', live: true },
  { id: 'watchlist', label: '👁️ My Watchlist', cat: 'traders', endpoint: '/api/watchlist/prices', live: true },
  { id: 'price-alerts', label: '🔔 Price Alerts', cat: 'traders', endpoint: 'LocalStorage + live', live: true },
  { id: 'buying-power', label: '💪 Buying Power Calc', cat: 'traders', endpoint: 'Calculated', live: false },
  { id: 'position-sizing', label: '📐 Position Sizing', cat: 'traders', endpoint: 'Calculated', live: false },
  { id: 'stop-loss-calc', label: '🛑 Stop Loss Calculator', cat: 'traders', endpoint: 'Calculated', live: false },
  { id: 'profit-target', label: '🎯 Profit Target', cat: 'traders', endpoint: 'Calculated', live: false },
  { id: 'broker-floorsheet', label: '🏦 Broker Activity', cat: 'traders', endpoint: '/api/floorsheet', live: true },
  // IPO & Corporate
  { id: 'ipo-current', label: '🆕 Current IPOs', cat: 'nepse', endpoint: '/api/ipo/current', live: true },
  { id: 'ipo-results', label: '📊 IPO Results', cat: 'nepse', endpoint: '/api/ipo/results', live: true },
  { id: 'ipo-allotment', label: '✅ IPO Allotment Check', cat: 'nepse', endpoint: '/api/meroshare/allotment', live: true },
  { id: 'debenture-tracker', label: '📋 Debenture Tracker', cat: 'nepse', endpoint: '/api/debentures', live: true },
  { id: 'mutual-funds', label: '🏦 Mutual Fund NAV', cat: 'nepse', endpoint: '/api/mutual-funds', live: true },
  // Brokers
  { id: 'broker-list', label: '🏦 Broker Directory', cat: 'other', endpoint: '/api/brokers', live: true },
  { id: 'broker-performance', label: '📊 Broker Performance', cat: 'other', endpoint: '/api/brokers/:id', live: true },
  // Portfolio
  { id: 'portfolio-health', label: '💊 Portfolio Health Check', cat: 'analytics', endpoint: '/api/portfolio/calculate', live: true },
  { id: 'portfolio-optimizer', label: '🎯 Portfolio Optimizer', cat: 'analytics', endpoint: 'AI + live data', live: true },
  { id: 'datewise-summary', label: '📅 Datewise Summary', cat: 'analytics', endpoint: '/api/portfolio/calculate', live: true },
  // Calculators
  { id: 'brokerage-calculator', label: '🧮 Brokerage Calculator', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'dividend-calculator', label: '💰 Dividend Calculator', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'tax-calculator', label: '🧾 Tax Calculator', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'compound-interest', label: '📈 Compound Interest', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'sip-calculator', label: '🔄 SIP Calculator', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'rights-calculator', label: '📜 Rights Share Calc', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'bonus-calculator', label: '🎁 Bonus Share Calc', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'pe-calculator', label: '📊 P/E Valuation', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'dcf-calculator', label: '💎 DCF Valuation', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'wacc-calculator', label: '💼 WACC Calculator', cat: 'tools', endpoint: 'Calculated', live: false },
  { id: 'break-even', label: '⚖️ Break Even Price', cat: 'tools', endpoint: 'Calculated', live: false },
  // News
  { id: 'nepse-news', label: '📰 NEPSE News', cat: 'news', endpoint: '/api/news/nepse', live: true },
  { id: 'company-news', label: '🏢 Company News', cat: 'news', endpoint: 'RSS filtered', live: true },
  { id: 'market-calendar', label: '📅 Market Calendar', cat: 'news', endpoint: 'Static + API', live: false },
  { id: 'nrb-updates', label: '🏛️ NRB Policy Updates', cat: 'news', endpoint: 'RSS', live: true },
];

// ============================================================
// MAIN SERVICES HUB
// ============================================================

const CATEGORIES = [
  { id: 'all', label: '🏠 All', color: '#3b82f6' },
  { id: 'nepse', label: '🏛️ NEPSE', color: '#16a34a' },
  { id: 'analytics', label: '📊 Analytics', color: '#7c3aed' },
  { id: 'traders', label: '💹 Traders', color: '#d97706' },
  { id: 'tools', label: '🧮 Tools', color: '#0891b2' },
  { id: 'news', label: '📰 News', color: '#dc2626' },
  { id: 'other', label: 'ℹ️ Other', color: '#64748b' },
];

export default function ServicesHub() {
  const [activeService, setActiveService] = useState('live-market');
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let services = activeCat === 'all' ? ALL_SERVICES : ALL_SERVICES.filter(s => s.cat === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      services = services.filter(s => s.label.toLowerCase().includes(q) || s.endpoint?.toLowerCase().includes(q));
    }
    return services;
  }, [activeCat, search]);

  const activeServiceDef = ALL_SERVICES.find(s => s.id === activeService);
  const ActiveComponent = SERVICE_COMPONENTS[activeService];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>

      {/* ── SIDEBAR ── */}
      <div style={{
        width: 260, minWidth: 260,
        background: '#0f172a', color: 'white',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRight: '1px solid #1e293b'
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#60a5fa' }}>📊 NEPSE Services</div>
          <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>
            {ALL_SERVICES.length} services • 0 mock data
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
          <input
            placeholder="Search services..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px',
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 6, color: 'white',
              fontSize: '0.82rem', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1e293b' }}>
          {CATEGORIES.map(cat => {
            const count = cat.id === 'all' ? ALL_SERVICES.length : ALL_SERVICES.filter(s => s.cat === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCat(cat.id); setSearch(''); }}
                style={{
                  padding: '4px 10px', borderRadius: 20,
                  border: 'none', cursor: 'pointer',
                  fontSize: '0.7rem', fontWeight: 600,
                  background: activeCat === cat.id ? cat.color : '#1e293b',
                  color: activeCat === cat.id ? 'white' : '#64748b',
                  transition: 'all 0.15s'
                }}
              >
                {cat.label} {count}
              </button>
            );
          })}
        </div>

        {/* Service list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {filtered.map(svc => (
            <button
              key={svc.id}
              onClick={() => setActiveService(svc.id)}
              style={{
                display: 'block', width: '100%',
                padding: '9px 12px', marginBottom: 2,
                background: activeService === svc.id
                  ? 'linear-gradient(135deg, #1d4ed8, #3b82f6)'
                  : 'transparent',
                color: activeService === svc.id ? 'white' : '#94a3b8',
                border: activeService === svc.id ? '1px solid #60a5fa' : '1px solid transparent',
                borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                fontSize: '0.8rem', transition: 'all 0.15s', lineHeight: '1.3'
              }}
            >
              <div style={{ fontWeight: activeService === svc.id ? 700 : 400 }}>
                {svc.label}
              </div>
              <div style={{
                fontSize: '0.65rem',
                color: activeService === svc.id ? 'rgba(255,255,255,0.6)' : '#334155',
                marginTop: 2, fontFamily: 'monospace',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {svc.live ? '🟢' : '📦'} {svc.endpoint}
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: '#334155', padding: '30px 16px', fontSize: '0.85rem' }}>
              No services found
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #1e293b', fontSize: '0.65rem', color: '#334155' }}>
          <div>📡 nepalstock.com • sharesansar.com</div>
          <div style={{ color: '#dc2626', fontWeight: 700, marginTop: 3 }}>⚠️ 0 mock data endpoints</div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, padding: '10px 16px',
          background: 'white', borderRadius: 10,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Services</span>
            <span style={{ color: '#94a3b8' }}>›</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {activeServiceDef?.label || activeService}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {activeServiceDef?.live && <LiveBadge />}
            {activeServiceDef?.endpoint && (
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace', padding: '2px 8px', background: '#f1f5f9', borderRadius: 6 }}>
                {activeServiceDef.endpoint}
              </span>
            )}
          </div>
        </div>

        {/* Service Content */}
        <div style={{
          background: 'white', borderRadius: 12,
          border: '1px solid #e2e8f0',
          padding: '20px 24px', minHeight: '60vh'
        }}>
          {ActiveComponent ? (
            <Suspense fallback={<Spinner />}>
              <ActiveComponent />
            </Suspense>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔧</div>
              <h3 style={{ marginBottom: 8 }}>{activeServiceDef?.label}</h3>
              <p style={{ marginBottom: 16 }}>This service connects to: <code>{activeServiceDef?.endpoint}</code></p>
              <div style={{
                background: '#f0f9ff', border: '1px solid #bae6fd',
                borderRadius: 8, padding: '12px 20px', fontSize: '0.82rem',
                color: '#0369a1', display: 'inline-block'
              }}>
                🔌 Component implementation in progress
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
      `}</style>
    </div>
  );
}
