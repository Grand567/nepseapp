import { useState, useMemo, useRef, useEffect, type ReactNode, type SyntheticEvent } from 'react';
import { Activity, Info, RefreshCw, Search, SearchX, WifiOff } from 'lucide-react';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse';
import stockmapData from '../utils/stockmap.json';

// Fast lookup from symbol to authentic company name and sector
const SYMBOL_TO_COMPANY_MAP: Record<string, string> = {};

export interface UnifiedStockItem {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
}

const UNIFIED_UNIVERSE: UnifiedStockItem[] = [];
const symbolSet = new Set<string>();

if (Array.isArray(NEPSE_UNIVERSE)) {
  for (const c of NEPSE_UNIVERSE) {
    if (c && c.symbol) {
      const sym = c.symbol.toUpperCase();
      symbolSet.add(sym);
      UNIFIED_UNIVERSE.push({
        symbol: sym,
        name: c.name || sym,
        sector: c.sector || 'Others',
        basePrice: Number(c.basePrice) || 0
      });
      SYMBOL_TO_COMPANY_MAP[sym] = (c.name || '').toLowerCase();
    }
  }
}

if (stockmapData) {
  for (const [sym, info] of Object.entries(stockmapData as Record<string, { name: string; sector?: string }>)) {
    const s = sym.toUpperCase();
    if (!symbolSet.has(s)) {
      symbolSet.add(s);
      UNIFIED_UNIVERSE.push({
        symbol: s,
        name: info?.name || s,
        sector: info?.sector || 'Others',
        basePrice: 100
      });
      SYMBOL_TO_COMPANY_MAP[s] = (info?.name || '').toLowerCase();
    }
  }
}

UNIFIED_UNIVERSE.sort((a, b) => a.symbol.localeCompare(b.symbol));

export function Skeleton({ className = '', height = 'h-4', width = 'w-full' }: { className?: string; height?: string; width?: string }) {
  return (
    <div className={`skeleton rounded-md ${height} ${width} ${className}`} />
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
      <div className="flex gap-3 pb-2 border-b border-slate-800/60">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} height="h-4" className="flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="h-3.5" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Spinner({ text = 'Scanning all 346 NEPSE listed securities…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-slate-400">
      <div className="mb-4 h-11 w-11 animate-spin rounded-full border-[3px] border-slate-700 border-t-blue-500" />
      <p className="text-sm font-medium text-slate-200">{text}</p>
      <p className="mt-1 text-xs text-slate-500">Connecting to NEPSE live official endpoints…</p>
    </div>
  );
}

export function NoData({ message }: { message?: string }) {
  return (
    <div className="mx-0 my-4 rounded-xl border border-red-900/40 bg-red-950/20 px-6 py-10 text-center">
      <div className="mb-3 flex justify-center text-red-400"><WifiOff size={36} /></div>
      <h3 className="mb-1 font-bold text-red-300">No Data Available</h3>
      <p className="text-sm text-slate-400">{message || 'Market may be closed or no records match this criteria today.'}</p>
    </div>
  );
}

export function InfoBanner({ children, type = 'info' }: { children: ReactNode; type?: 'info' | 'success' | 'warning' | 'danger' }) {
  const map: Record<string, string> = {
    info: 'border-blue-900/50 bg-blue-950/30 text-blue-200',
    success: 'border-emerald-900/50 bg-emerald-950/30 text-emerald-200',
    warning: 'border-amber-900/50 bg-amber-950/30 text-amber-200',
    danger: 'border-red-900/50 bg-red-950/30 text-red-200',
  };
  return (
    <div className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${map[type]}`}>
      <Info size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, color, big, subtitle }: { label: string; value: string | number; color?: string; big?: boolean; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 text-center shadow-sm">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`${big ? 'text-2xl font-black' : 'text-base font-bold'} font-mono`} style={{ color: color || '#f8fafc' }}>{value ?? '—'}</div>
      {subtitle && <div className="mt-0.5 text-[11px] text-slate-500">{subtitle}</div>}
    </div>
  );
}

export interface ColDef { key: string; label: string; align?: 'left' | 'right' | 'center'; bold?: boolean; format?: (v: any, row: any) => ReactNode; colorFn?: (v: any, row: any) => string | undefined; }

export function DataTable({ data = [], cols = [], loading = false }: { data: any[]; cols: ColDef[]; loading?: boolean }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const rowsPerPage = 15;

  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.trim().toLowerCase();
    return data.filter((r) => {
      // 1. Check direct symbol
      const sym = String(r.symbol || r.stockSymbol || r.scrip || r.ticker || '').toLowerCase();
      if (sym && sym.includes(q)) return true;

      // 2. Check direct companyName / name / securityName
      const name = String(r.companyName || r.name || r.securityName || '').toLowerCase();
      if (name && name.includes(q)) return true;

      // 3. Check universe company name lookup by symbol
      if (sym) {
        const universeName = SYMBOL_TO_COMPANY_MAP[sym.toUpperCase()];
        if (universeName && universeName.includes(q)) return true;
      }

      // 4. Check sector
      const sector = String(r.sector || '').toLowerCase();
      if (sector && sector.includes(q)) return true;

      // 5. Check buyer/seller broker or client details
      const buyer = String(r.buyer || r.buyerBroker || '').toLowerCase();
      const seller = String(r.seller || r.sellerBroker || '').toLowerCase();
      if (buyer.includes(q) || seller.includes(q)) return true;

      // 6. Check columns values defined in table
      for (const col of cols) {
        const val = r[col.key];
        if (val != null && typeof val !== 'object') {
          if (String(val).toLowerCase().includes(q)) return true;
        }
      }

      return false;
    });
  }, [data, query, cols]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);

  if (loading) return <TableSkeleton cols={cols.length || 5} rows={10} />;
  if (!data.length) return <NoData />;

  return (
    <div className="space-y-3">
      {data.length > 1 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder={`Filter ${data.length} records… (type symbol, company name or broker)`}
            style={{
              backgroundColor: '#0B0E14',
              color: '#f8fafc',
              border: '1px solid rgba(30, 41, 59, 0.60)',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
            }}
            className="w-full rounded-xl py-2 pl-9 pr-8 text-xs text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setPage(0); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 && query ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
          No securities found matching "<span className="text-white font-bold">{query}</span>".
          <div className="mt-1 text-[11px] text-slate-500">Try typing the stock symbol or full company name.</div>
        </div>
      ) : (
        <div className="max-h-[580px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-800/60 bg-slate-950/40 shadow-inner">
          <table className="w-full border-collapse text-left text-xs text-slate-200">
            <thead className="sticky top-0 z-10 border-b border-slate-800/60 bg-slate-900/95 backdrop-blur">
            <tr>
              {cols.map((col, i) => (
                <th key={i} className={`whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${col.align === 'right' ? 'text-right font-mono tabular-nums' : ''}`} style={{ textAlign: col.align || 'left' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {paged.map((row, i) => (
              <tr key={i} className={`transition-colors ${i % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/20'} hover:bg-slate-800/50`}>
                {cols.map((col, j) => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val, row) : (val ?? '—');
                  const color = col.colorFn ? col.colorFn(val, row) : undefined;
                  const isNumeric = col.align === 'right';
                  return (
                    <td
                      key={j}
                      className={`whitespace-nowrap px-3.5 py-2.5 ${isNumeric ? 'font-mono tabular-nums text-right' : ''}`}
                      style={{ textAlign: col.align || 'left', fontWeight: col.bold ? 700 : 400, color: color || 'inherit' }}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-500">
            Showing {safePage * rowsPerPage + 1}–{Math.min((safePage + 1) * rowsPerPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${safePage > 0 ? 'cursor-pointer bg-slate-800 text-slate-200 hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-600'}`}
            >
              Previous
            </button>
            <span className="px-2 text-xs font-medium text-slate-400">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${safePage < totalPages - 1 ? 'cursor-pointer bg-slate-800 text-slate-200 hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-600'}`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SourceBar({ count, source, totalCount = 346 }: { count: number; source: string; totalCount?: number }) {
  const live = source === 'live';
  const isFiltered = totalCount > 0 && count < totalCount;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-200">
        <span className="font-bold text-white">📊 {count} Matching Securities</span>
        {isFiltered ? (
          <span className="text-[11px] font-normal text-slate-400">
            (filtered from <span className="font-bold text-blue-400">{totalCount}</span> total NEPSE listed companies)
          </span>
        ) : (
          <span className="text-[11px] font-normal text-slate-400">
            (all <span className="font-bold text-blue-400">{totalCount}</span> NEPSE listed companies scanned)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold ${live ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300' : 'bg-amber-950/60 border border-amber-800/60 text-amber-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          {live ? 'LIVE NEPSE OFFICIAL FEED' : source.toUpperCase()}
        </span>
        <span className="font-mono text-slate-500">Updated {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

export function StockSearchSelect({
  value,
  onChange,
  placeholder = 'Search by ticker or company name…',
  label,
  allowClear = true,
  className = '',
  stocks = [],
}: {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  label?: string;
  allowClear?: boolean;
  className?: string;
  stocks?: any[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSearch('');
    onChange('');
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Map of live stock prices from props if available
  const livePriceMap = useMemo(() => {
    const map: Record<string, { ltp: number; pChange?: number }> = {};
    if (Array.isArray(stocks) && stocks.length > 0) {
      for (const s of stocks) {
        if (s && s.symbol) {
          map[s.symbol.toUpperCase()] = {
            ltp: Number(s.ltp ?? s.price) || 0,
            pChange: s.pChange !== undefined ? Number(s.pChange) : undefined,
          };
        }
      }
    }
    return map;
  }, [stocks]);

  const selectedCompany = useMemo(() => {
    if (!value) return null;
    return UNIFIED_UNIVERSE.find((c) => c.symbol.toUpperCase() === value.toUpperCase()) || null;
  }, [value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const startsWithSym: UnifiedStockItem[] = [];
    const containsSym: UnifiedStockItem[] = [];
    const containsName: UnifiedStockItem[] = [];
    const containsSector: UnifiedStockItem[] = [];

    for (const c of UNIFIED_UNIVERSE) {
      const sym = c.symbol.toLowerCase();
      const name = c.name.toLowerCase();
      const sector = c.sector.toLowerCase();

      if (sym.startsWith(q)) {
        startsWithSym.push(c);
      } else if (sym.includes(q)) {
        containsSym.push(c);
      } else if (name.includes(q)) {
        containsName.push(c);
      } else if (sector.includes(q)) {
        containsSector.push(c);
      }
    }

    return [...startsWithSym, ...containsSym, ...containsName, ...containsSector].slice(0, 35);
  }, [search]);

  const displayValue = isOpen
    ? search
    : (selectedCompany ? `${selectedCompany.symbol} — ${selectedCompany.name}` : (value || ''));

  const handleSelect = (sym: string) => {
    onChange(sym);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {label && <label className="mb-1.5 block text-xs font-bold text-slate-300 tracking-wide">{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value.trim()) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
            }
          }}
          onFocus={(e) => {
            if (search.trim()) {
              setIsOpen(true);
            }
            e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            } else if (e.key === 'Enter' && filtered.length > 0) {
              e.preventDefault();
              handleSelect(filtered[0].symbol);
            }
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-form-type="other"
          placeholder={placeholder}
          style={{
            width: '100%',
            backgroundColor: '#151922',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            paddingLeft: '38px',
            paddingRight: '38px',
            paddingTop: '10px',
            paddingBottom: '10px',
            fontSize: '13.5px',
            fontWeight: 600,
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            boxSizing: 'border-box',
          }}
        />
        {(Boolean(value) || Boolean(search)) && allowClear && (
          <button
            type="button"
            onMouseDown={handleClear}
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 'bold',
              lineHeight: 1,
              zIndex: 20,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.35)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#cbd5e1';
            }}
            title="Clear search"
            aria-label="Clear stock search"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && search.trim().length > 0 && (
        <div
          style={{
            backgroundColor: '#151922',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            maxHeight: 380,
            zIndex: 150,
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            overflowY: 'auto',
            padding: '8px 10px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 10px', borderBottom: '1px solid #1e293b', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Matching Securities ({filtered.length})
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Close ✕
            </button>
          </div>

          {/* Search suggestions list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {search.trim() && filtered.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>No NEPSE security matching "{search}"</div>
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 4, margin: '4px 0 0' }}>
                  Try typing another ticker code or company name.
                </p>
              </div>
            ) : (
              filtered.map((stock) => {
                const isSelected = stock.symbol.toUpperCase() === value?.toUpperCase();
                const liveData = livePriceMap[stock.symbol.toUpperCase()];
                const price = liveData?.ltp || stock.basePrice || 0;
                const pChange = liveData?.pChange;

                return (
                  <div
                    key={stock.symbol}
                    onClick={() => handleSelect(stock.symbol)}
                    style={{
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.25)' : '#121826',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #1e293b',
                      borderRadius: 12,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? 'rgba(37, 99, 235, 0.35)' : '#1e293b';
                      e.currentTarget.style.borderColor = isSelected ? '#60a5fa' : '#334155';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? 'rgba(37, 99, 235, 0.25)' : '#121826';
                      e.currentTarget.style.borderColor = isSelected ? '#3b82f6' : '#1e293b';
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 900, letterSpacing: '0.04em' }}>
                          {stock.symbol}
                        </span>
                        <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 6, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                          {stock.sector}
                        </span>
                        {isSelected && (
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 800 }}>
                            ACTIVE ✓
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 500, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stock.name}
                      </div>
                    </div>

                    {price > 0 && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800 }}>
                          Rs. {Number(price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                        {pChange != null && !isNaN(pChange) && (
                          <div style={{ color: pChange >= 0 ? '#10b981' : '#f43f5e', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 800, marginTop: 2 }}>
                            {pChange >= 0 ? '+' : ''}{Number(pChange).toFixed(2)}%
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-blue-900/40 bg-blue-950/30 p-3.5 text-xs leading-relaxed text-blue-200">
      💡 <strong className="text-blue-300">Investor Insight:</strong> {children}
    </div>
  );
}

export function TimeframeFilterBar({
  timeframe,
  onSelectTimeframe,
  asOf,
  isLive = true,
  onRefresh,
  isRefreshing = false,
  timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'],
  title,
}: {
  timeframe: string;
  onSelectTimeframe: (tf: string) => void;
  asOf?: string;
  isLive?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  timeframes?: string[];
  title?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className={`flex h-2.5 w-2.5 items-center justify-center rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'animate-ping bg-emerald-400' : 'bg-amber-300'}`} />
        </span>
        <div className="flex flex-col">
          {title && <span className="text-xs font-bold text-white">{title}</span>}
          <span className="text-[11px] font-mono text-slate-400">
            {asOf ? `As of: ${asOf}` : `As of: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
            {isLive ? ' (Live Session)' : ' (Session Closed)'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/70 p-0.5">
          {timeframes.map((tf) => {
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => onSelectTimeframe(tf)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed"
            title="Refresh Data"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-blue-400' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}

