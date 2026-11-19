import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, BarChart2, LineChart, PieChart,
  Calendar, Check, ChevronRight, Layers, ArrowUpRight, ArrowDownRight,
  Filter, Info, Award, Search, X, Plus
} from 'lucide-react';
import { getSectorBenchmark } from '../utils/fundamentals';
import { fetchCompanyQuarterlyReports, fetchCompanyIndustryComparison } from '../utils/servicesApi';

export default function StockFundamentalsTab({ stock = {}, fundamentals = {}, peerStocks = [] }) {
  const safeStock = stock || {};
  const safeFund = fundamentals || {};

  // Share Hub Fundamental Analysis 4 Sub-Tabs: 'overview' | 'reports' | 'industry' | 'compare'
  const [subTab, setSubTab] = useState('overview');
  const [viewMode, setViewMode] = useState('graph'); // 'graph' | 'tabular'
  const [selectedQuarter, setSelectedQuarter] = useState('082/083 Q1');
  const [compareQuarter, setCompareQuarter] = useState('081/082 Q4');
  const [activeChartQuarters, setActiveChartQuarters] = useState([
    '078/079 Q4',
    '079/080 Q4',
    '080/081 Q4',
    '081/082 Q4',
    '082/083 Q1'
  ]);
  const [showQuarterModal, setShowQuarterModal] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['eps', 'profitCr', 'netWorth', 'roe']);
  const [reportSearch, setReportSearch] = useState('');

  const sym = safeStock.symbol || safeFund.symbol || 'STOCK';
  const rawSector = safeStock.sector || safeFund.sector || 'Commercial Banks';
  const sector = String(rawSector).toLowerCase();
  const isHydro = sector.includes('hydro');
  const isBank = sector.includes('bank') || sector.includes('finance') || sector.includes('microfinance');

  const [backendQuarterData, setBackendQuarterData] = useState(null);
  const [backendIndustryData, setBackendIndustryData] = useState(null);
  const [quartersLoading, setQuartersLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setBackendQuarterData(null);
    setBackendIndustryData(null);
    if (sym && sym !== 'STOCK') {
      setQuartersLoading(true);
      fetchCompanyQuarterlyReports(sym).then(res => {
        if (!active) return;
        const data = res?.data || res;
        if (data && data.quarters) {
          setBackendQuarterData(data);
        }
      }).catch(() => {}).finally(() => {
        if (active) setQuartersLoading(false);
      });

      fetchCompanyIndustryComparison(sym).then(res => {
        if (!active) return;
        const data = res?.data || res;
        if (data && data.comparison) {
          setBackendIndustryData(data);
        }
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [sym]);

  const sectorBench = useMemo(() => {
    if (backendIndustryData?.benchmark) {
      return backendIndustryData.benchmark;
    }
    try {
      return getSectorBenchmark(rawSector) || { medianPE: 22, medianPBV: 2.4, medianEPS: 16, medianROE: 11.5 };
    } catch (_) {
      return { medianPE: 22, medianPBV: 2.4, medianEPS: 16, medianROE: 11.5 };
    }
  }, [rawSector, backendIndustryData]);

  // Verified Multi-Quarter filings strictly from backend data (zero synthetic historical multipliers)
  const verifiedQuarters = useMemo(() => {
    const rawQ = Array.isArray(backendQuarterData?.quarters) ? backendQuarterData.quarters : [];
    return rawQ.map((q, idx) => {
      const label = q.quarter || q.period || `Reported Period ${idx + 1}`;
      return {
        id: label,
        short: label,
        label,
        fiscalYear: q.fiscalYear || label,
        period: q.period || label,
        eps: q.eps != null && Number.isFinite(Number(q.eps)) ? Number(q.eps) : null,
        profitCr: q.netProfit != null && Number.isFinite(Number(q.netProfit)) ? Number(q.netProfit) : null,
        netWorth: q.netWorth != null && Number.isFinite(Number(q.netWorth)) ? Number(q.netWorth) : null,
        paidUp: q.paidUp != null && Number.isFinite(Number(q.paidUp)) ? Number(q.paidUp) : null,
        roe: q.roe != null && Number.isFinite(Number(q.roe)) ? Number(q.roe) : null,
        npl: q.npl != null && Number.isFinite(Number(q.npl)) ? Number(q.npl) : null,
        source: q.source || 'NEPSE Filing'
      };
    });
  }, [backendQuarterData]);

  const quartersList = verifiedQuarters;

  // Base financial fundamentals strictly from verified disclosures (null when unavailable)
  const toNullNum = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const latestQ = verifiedQuarters[0] || backendQuarterData?.latest || null;
  const ltp = toNullNum(safeStock.ltp ?? safeStock.close) ?? 0;
  const baseEps = toNullNum(latestQ?.eps ?? safeFund.eps ?? safeStock.eps);
  const baseBv = toNullNum(latestQ?.netWorth ?? safeFund.bookValue ?? safeFund.netWorth ?? safeStock.bookValue ?? safeStock.bv);
  const basePe = baseEps !== null && baseEps > 0 && ltp > 0 ? +(ltp / baseEps).toFixed(2) : toNullNum(safeFund.pe ?? safeStock.pe);
  const basePb = baseBv !== null && baseBv > 0 && ltp > 0 ? +(ltp / baseBv).toFixed(2) : toNullNum(safeFund.pbv ?? safeFund.pb ?? safeStock.pb);
  const baseRoe = toNullNum(latestQ?.roe ?? safeFund.roe ?? safeStock.roe) ?? (baseEps !== null && baseBv !== null && baseBv > 0 ? +((baseEps / baseBv) * 100).toFixed(2) : null);
  const baseNpl = toNullNum(latestQ?.npl ?? safeFund.npl ?? safeStock.npl);
  const baseProfitCr = toNullNum(latestQ?.profitCr ?? safeFund.netProfitCr);
  const basePaidUp = toNullNum(latestQ?.paidUp ?? safeFund.paidUpCapital ?? safeStock.paidUpCapital);

  // Sync selectedQuarter / compareQuarter cleanly whenever verified quarters load or switch
  useEffect(() => {
    if (verifiedQuarters.length > 0) {
      setSelectedQuarter(verifiedQuarters[0].id);
      setCompareQuarter(verifiedQuarters[1]?.id || verifiedQuarters[0].id);
      setActiveChartQuarters(verifiedQuarters.map(q => q.id));
    } else {
      setSelectedQuarter('Latest Filing');
      setCompareQuarter('Prior Period');
      setActiveChartQuarters([]);
    }
  }, [verifiedQuarters]);

  // Historical data series strictly from verified multi-quarter filings
  const allTrendData = useMemo(() => {
    if (verifiedQuarters.length < 2) return [];
    return [...verifiedQuarters].reverse().map(q => ({
      quarter: q.label,
      eps: q.eps,
      profitCr: q.profitCr,
      netWorth: q.netWorth,
      roe: q.roe,
      pe: (q.eps !== null && q.eps > 0 && ltp > 0) ? +(ltp / q.eps).toFixed(1) : null,
      npl: isBank ? q.npl : null
    }));
  }, [verifiedQuarters, ltp, isBank]);

  const trendData = useMemo(() => {
    if (allTrendData.length < 2) return [];
    const filtered = allTrendData.filter(d => activeChartQuarters.includes(d.quarter));
    return filtered.length >= 2 ? filtered : allTrendData;
  }, [allTrendData, activeChartQuarters]);

  // Financial Statement Line-Items table strictly from verified quarter disclosures (null -> '—')
  const statementLineItems = useMemo(() => {
    const q1 = verifiedQuarters.find(q => q.id === selectedQuarter) || verifiedQuarters[0] || null;
    const q2 = verifiedQuarters.length >= 2 ? (verifiedQuarters.find(q => q.id === compareQuarter) || verifiedQuarters[1] || null) : null;
    const calcDiff = (c, p) => (c != null && p != null && p !== 0 ? +(((c - p) / Math.abs(p)) * 100).toFixed(2) : null);

    const epsCurr = q1?.eps ?? baseEps;
    const epsPrev = q2?.eps ?? null;
    const bvCurr = q1?.netWorth ?? baseBv;
    const bvPrev = q2?.netWorth ?? null;
    const profCurr = q1?.profitCr ?? baseProfitCr;
    const profPrev = q2?.profitCr ?? null;
    const roeCurr = q1?.roe ?? baseRoe;
    const roePrev = q2?.roe ?? null;
    const paidCurr = q1?.paidUp ?? basePaidUp;
    const paidPrev = q2?.paidUp ?? null;

    const items = [
      {
        metric: 'EPS (Reported)',
        current: epsCurr != null ? `Rs. ${epsCurr.toFixed(2)}` : '—',
        prev: epsPrev != null ? `Rs. ${epsPrev.toFixed(2)}` : '—',
        change: calcDiff(epsCurr, epsPrev),
        isPositiveGood: true
      },
      {
        metric: 'Net Profit',
        current: profCurr != null ? `${profCurr.toFixed(2)} Cr` : '—',
        prev: profPrev != null ? `${profPrev.toFixed(2)} Cr` : '—',
        change: calcDiff(profCurr, profPrev),
        isPositiveGood: true
      },
      {
        metric: 'Net Worth (Book Value / Share)',
        current: bvCurr != null ? `Rs. ${bvCurr.toFixed(2)}` : '—',
        prev: bvPrev != null ? `Rs. ${bvPrev.toFixed(2)}` : '—',
        change: calcDiff(bvCurr, bvPrev),
        isPositiveGood: true
      },
      {
        metric: 'Paid-Up Capital',
        current: paidCurr != null ? `Rs. ${Number(paidCurr).toLocaleString('en-IN')}` : '—',
        prev: paidPrev != null ? `Rs. ${Number(paidPrev).toLocaleString('en-IN')}` : '—',
        change: calcDiff(paidCurr, paidPrev),
        isPositiveGood: true
      },
      {
        metric: 'Return on Equity (ROE)',
        current: roeCurr != null ? `${roeCurr.toFixed(2)}%` : '—',
        prev: roePrev != null ? `${roePrev.toFixed(2)}%` : '—',
        change: calcDiff(roeCurr, roePrev),
        isPositiveGood: true
      }
    ];

    if (isBank) {
      const nplCurr = q1?.npl ?? baseNpl;
      const nplPrev = q2?.npl ?? null;
      items.push({
        metric: 'Non-Performing Loans (NPL)',
        current: nplCurr != null ? `${nplCurr.toFixed(2)}%` : '—',
        prev: nplPrev != null ? `${nplPrev.toFixed(2)}%` : '—',
        change: calcDiff(nplCurr, nplPrev),
        isPositiveGood: false
      });
    }

    return items;
  }, [verifiedQuarters, selectedQuarter, compareQuarter, baseEps, baseBv, baseProfitCr, baseRoe, basePaidUp, baseNpl, isBank]);

  const filteredReportItems = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return statementLineItems;
    return statementLineItems.filter(item => item.metric.toLowerCase().includes(q));
  }, [statementLineItems, reportSearch]);

  // Stock Vs Industry comparison rows
  const industryComparisons = useMemo(() => {
    const indEps = toNullNum(sectorBench?.eps ?? sectorBench?.medianEPS) ?? 16;
    const indPe = toNullNum(sectorBench?.pe ?? sectorBench?.medianPE) ?? 22;
    const indPb = toNullNum(sectorBench?.pbv ?? sectorBench?.pb ?? sectorBench?.medianPBV) ?? 2.4;
    const indBv = toNullNum(sectorBench?.bvps) ?? 145;
    const indRoe = toNullNum(sectorBench?.roe ?? sectorBench?.medianROE) ?? 11.5;

    return [
      {
        label: 'Earnings Per Share (EPS)',
        stockVal: baseEps,
        indVal: indEps,
        fmt: v => (v != null ? `Rs. ${Number(v).toFixed(2)}` : '—'),
        better: baseEps != null && baseEps >= indEps,
        verdict: baseEps == null ? 'Data Unavailable' : (baseEps >= indEps ? 'Outperforming Sector' : 'Below Sector Avg')
      },
      {
        label: 'P/E Valuation Multiple',
        stockVal: basePe != null && basePe > 0 ? basePe : null,
        indVal: indPe,
        fmt: v => (v != null && v > 0 ? `${Number(v).toFixed(2)}x` : '—'),
        better: basePe != null && basePe > 0 && basePe <= indPe,
        verdict: basePe == null ? 'Data Unavailable' : (basePe > 0 && basePe <= indPe ? 'Cheaper than Sector' : (basePe <= 0 ? 'Loss Making' : 'Premium to Sector'))
      },
      {
        label: 'Book Value (Net Worth / Share)',
        stockVal: baseBv,
        indVal: indBv,
        fmt: v => (v != null ? `Rs. ${Number(v).toFixed(2)}` : '—'),
        better: baseBv != null && baseBv >= indBv,
        verdict: baseBv == null ? 'Data Unavailable' : (baseBv >= indBv ? 'Stronger Asset Backing' : 'Below Sector Avg')
      },
      {
        label: 'PBV (Price-to-Book Ratio)',
        stockVal: basePb,
        indVal: indPb,
        fmt: v => (v != null ? `${Number(v).toFixed(2)}x` : '—'),
        better: basePb != null && basePb > 0 && basePb <= indPb,
        verdict: basePb == null ? 'Data Unavailable' : (basePb > 0 && basePb <= indPb ? 'Discounted PBV' : 'Higher PBV Multiple')
      },
      {
        label: 'Return on Equity (ROE %)',
        stockVal: baseRoe,
        indVal: indRoe,
        fmt: v => (v != null ? `${Number(v).toFixed(2)}%` : '—'),
        better: baseRoe != null && baseRoe >= indRoe,
        verdict: baseRoe == null ? 'Data Unavailable' : (baseRoe >= indRoe ? 'Superior Capital Return' : 'Lower ROE vs Peers')
      }
    ];
  }, [baseEps, basePe, baseBv, basePb, baseRoe, sectorBench]);

  // Helper SVG Line Chart Generator (Share Hub Smooth Area Curve)
  const renderTrendSvg = (dataKey, title, unit = '') => {
    const values = trendData.map(d => d[dataKey]).filter(v => v != null);
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = (max - min) || 1;
    const width = 340;
    const height = 118;
    const padX = 36;
    const padY = 22;

    const points = trendData.map((d, idx) => {
      const val = d[dataKey] ?? min;
      const x = padX + (idx / (trendData.length - 1)) * (width - padX * 2);
      const y = height - padY - ((val - min) / range) * (height - padY * 2);
      return { x, y, val, quarter: d.quarter };
    });

    const pathD = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

    return (
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
            {title}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#2dd4bf', fontFamily: 'var(--font-mono)' }}>
            Latest: {points[points.length - 1].val} {unit}
          </div>
        </div>

        {/* SVG Curve */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 118, display: 'block' }}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

            {/* Area Fill */}
            <path d={areaD} fill={`url(#grad-${dataKey})`} />

            {/* Path */}
            <path d={pathD} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Circles & Labels */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="4.5" fill="#111827" stroke="#2dd4bf" strokeWidth="2.5" />
                <text x={p.x} y={height - 4} fontSize="9" fill="#94a3b8" textAnchor="middle">
                  {p.quarter.replace(' Q', ', q')}
                </text>
                <text x={p.x} y={p.y - 8} fontSize="9.5" fill="#f8fafc" textAnchor="middle" fontWeight="700">
                  {p.val}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Share Hub 4 Fundamental Sub-Tabs: Overview | Reports | Stock Vs Industry ⭐ | Compare ── */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        gap: 6,
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: 5
      }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'reports', label: 'Reports' },
          { id: 'industry', label: 'Stock Vs Industry ⭐' },
          { id: 'compare', label: 'Compare' }
        ].map(t => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              style={{
                flex: 1,
                whiteSpace: 'nowrap',
                padding: '8px 12px',
                borderRadius: 10,
                border: 'none',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                background: active ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                color: active ? '#10b981' : '#94a3b8',
                borderBottom: active ? '2px solid #10b981' : '2px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 1: OVERVIEW (Graph View vs Tabular View + Quarter Chips)
         ══════════════════════════════════════════════════════════════════ */}
      {subTab === 'overview' && (
        <>
          {/* Select Quarters Removable Chips Bar (Share Hub frame_036.jpg) */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: '10px 12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700 }}>
                Select Quarters ({activeChartQuarters.length} active)
              </span>
              <button
                type="button"
                onClick={() => setShowQuarterModal(true)}
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 8,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#10b981',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Plus style={{ width: 11, height: 11 }} /> Quarters
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quartersList.map(q => {
                const isAct = activeChartQuarters.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setActiveChartQuarters(prev =>
                        prev.includes(q.id)
                          ? (prev.length > 2 ? prev.filter(x => x !== q.id) : prev)
                          : [...prev, q.id]
                      );
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 16,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isAct ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                      background: isAct ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255,255,255,0.02)',
                      color: isAct ? '#34d399' : '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>{q.short}</span>
                    {isAct && <X style={{ width: 11, height: 11 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Toggle Header: Graph View vs Tabular View (Share Hub Reference) */}
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: '6px',
            display: 'flex',
            gap: 6
          }}>
            <button
              type="button"
              onClick={() => setViewMode('graph')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: viewMode === 'graph' ? '#0f766e' : 'transparent',
                color: viewMode === 'graph' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <LineChart style={{ width: 15, height: 15 }} />
              <span>Graph View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tabular')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 10,
                border: 'none',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: viewMode === 'tabular' ? '#0f766e' : 'transparent',
                color: viewMode === 'tabular' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <BarChart2 style={{ width: 15, height: 15 }} />
              <span>Tabular View</span>
            </button>
          </div>

          {/* Graph View: Multi-Quarter Historical Curves */}
          {viewMode === 'graph' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Interactive Metric Chips (Select Labels) */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, marginRight: 4 }}>
                  Select Labels:
                </span>
                {[
                  { key: 'eps', label: 'EPS (Reported)' },
                  { key: 'profitCr', label: 'Net Profit' },
                  { key: 'netWorth', label: 'Net Worth' },
                  { key: 'roe', label: 'ROE' },
                  { key: 'pe', label: 'P/E Ratio' },
                  ...(isBank ? [{ key: 'npl', label: 'npl' }] : [])
                ].map(chip => {
                  const isSelected = selectedMetrics.includes(chip.key);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => {
                        setSelectedMetrics(prev =>
                          prev.includes(chip.key)
                            ? (prev.length > 1 ? prev.filter(k => k !== chip.key) : prev)
                            : [...prev, chip.key]
                        );
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 16,
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #2dd4bf' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(45, 212, 191, 0.16)' : '#111827',
                        color: isSelected ? '#2dd4bf' : '#94a3b8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {isSelected && <Check style={{ width: 12, height: 12 }} />}
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>

              <div>
                {trendData.length < 2 ? (
                  <div style={{
                    background: '#111827',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 14,
                    padding: '18px 16px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 12.5
                  }}>
                    {quartersLoading
                      ? `Loading verified quarterly filings for ${sym}...`
                      : `Multi-quarter trend curves require at least 2 verified NEPSE quarterly filings for ${sym}. Switch to Tabular View or Reports for latest disclosed figures.`}
                  </div>
                ) : (
                  <>
                    {selectedMetrics.includes('eps') && renderTrendSvg('eps', 'EPS (Reported)', 'Rs.')}
                    {selectedMetrics.includes('profitCr') && renderTrendSvg('profitCr', 'Net Profit', 'Cr')}
                    {selectedMetrics.includes('netWorth') && renderTrendSvg('netWorth', 'Net Worth (Book Value)', 'Rs.')}
                    {selectedMetrics.includes('roe') && renderTrendSvg('roe', 'Return on Equity (ROE)', '%')}
                    {selectedMetrics.includes('pe') && renderTrendSvg('pe', 'P/E Ratio', 'x')}
                    {isBank && selectedMetrics.includes('npl') && renderTrendSvg('npl', 'Non-Performing Loans (NPL)', '%')}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tabular View: Comprehensive Line Items Comparison (Share Hub frame_040.jpg) */}
          {viewMode === 'tabular' && (
            <div style={{
              background: '#111827',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '16px 18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                    Financial Statement Line-Items
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {selectedQuarter} vs {compareQuarter}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuarterModal(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: 8,
                    padding: '4px 10px',
                    color: '#38bdf8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Calendar style={{ width: 12, height: 12 }} />
                  <span>{selectedQuarter}</span>
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '8px 6px' }}>METRIC</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>CURRENT</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>CHANGE</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>PREV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementLineItems.map((row, idx) => {
                      const hasChange = row.change != null;
                      const isPositive = (row.change || 0) >= 0;
                      const isGood = row.isPositiveGood ? isPositive : !isPositive;
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '10px 6px', color: '#f8fafc', fontWeight: 600 }}>
                            {row.metric}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: '#ffffff', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            {row.current}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                            {hasChange ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                padding: '2px 7px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                                background: isGood ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                color: isGood ? '#10b981' : '#f43f5e'
                              }}>
                                {isPositive ? '↑ +' : '↓ '}{Math.abs(row.change)}%
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'right', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                            {row.prev}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Quick Quarter Selection Pills footer (Share Hub frame_040.jpg) */}
              <div style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingTop: 12,
                marginTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.06)'
              }}>
                {quartersList.slice(0, 3).map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedQuarter(q.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 16,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedQuarter === q.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                      background: selectedQuarter === q.id ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.02)',
                      color: selectedQuarter === q.id ? '#38bdf8' : '#94a3b8'
                    }}
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowQuarterModal(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 16,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    color: '#38bdf8'
                  }}
                >
                  View More →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 2: REPORTS (Share Hub frame_038.jpg: KEY | DIFF(%) | Q1 | Q2)
         ══════════════════════════════════════════════════════════════════ */}
      {subTab === 'reports' && (
        <div style={{
          background: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Analysis for SYM header box */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.25)',
            background: 'rgba(16, 185, 129, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 style={{ width: 16, height: 16, color: '#10b981' }} />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Analysis for</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{sym}</span>
            </div>
            <span style={{ fontSize: 11.5, color: '#10b981', fontWeight: 700 }}>{rawSector}</span>
          </div>

          {/* Quarter Selector & Search Bar (Share Hub frame_038.jpg) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
              flex: 1,
              minWidth: 200,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <select
                value={selectedQuarter}
                onChange={e => setSelectedQuarter(e.target.value)}
                style={{
                  background: 'rgba(16, 185, 129, 0.16)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: 14,
                  padding: '3px 8px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {quartersList.map(q => (
                  <option key={q.id} value={q.id} style={{ background: '#0f172a', color: '#fff' }}>
                    {q.short}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>vs</span>
              <select
                value={compareQuarter}
                onChange={e => setCompareQuarter(e.target.value)}
                style={{
                  background: 'rgba(56, 189, 248, 0.16)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: 14,
                  padding: '3px 8px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {quartersList.map(q => (
                  <option key={q.id} value={q.id} style={{ background: '#0f172a', color: '#fff' }}>
                    {q.short}
                  </option>
                ))}
              </select>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#0f766e',
              borderRadius: 10,
              padding: '6px 12px',
              minWidth: 140
            }}>
              <Search style={{ width: 14, height: 14, color: '#ffffff' }} />
              <input
                type="text"
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                placeholder="Search key..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  width: '100%'
                }}
              />
            </div>
          </div>

          {/* KEY | DIFF(%) | Q1 | Q2 Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: 11.5, fontWeight: 800 }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>KEY</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>DIFF(%)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>{selectedQuarter.replace(' Q', ', q')}</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>{compareQuarter.replace(' Q', ', q')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportItems.map((row, idx) => {
                  const hasChange = row.change != null;
                  const isPos = (row.change || 0) >= 0;
                  const isGood = row.isPositiveGood ? isPos : !isPos;
                  const col = isGood ? '#22c55e' : '#ef4444';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '10px 8px', color: '#f8fafc', fontWeight: 700 }}>{row.metric}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, color: hasChange ? col : '#64748b' }}>
                        {hasChange ? `${row.change > 0 ? '' : ''}${row.change.toFixed(2)}%` : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: hasChange ? col : '#f8fafc' }}>
                        {row.current}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
                        {row.prev}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 3: STOCK VS INDUSTRY ⭐ (Sector Benchmark Comparison)
         ══════════════════════════════════════════════════════════════════ */}
      {subTab === 'industry' && (
        <div style={{
          background: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>
                {sym} vs. {rawSector} Industry Average
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Quantitative relative valuation against NEPSE sector median benchmarks
              </div>
            </div>
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#10b981'
            }}>
              {industryComparisons.filter(c => c.better).length} / {industryComparisons.length} Metrics Outperforming
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {industryComparisons.map((item, idx) => {
              const maxVal = Math.max(Math.abs(item.stockVal), Math.abs(item.indVal), 1);
              const stockPct = Math.min(100, Math.max(8, (Math.abs(item.stockVal) / maxVal) * 100));
              const indPct = Math.min(100, Math.max(8, (Math.abs(item.indVal) / maxVal) * 100));

              return (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '12px 14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>{item.label}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: item.better ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                      color: item.better ? '#10b981' : '#fbbf24'
                    }}>
                      {item.verdict}
                    </span>
                  </div>

                  {/* Stock Bar */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>{sym}</span>
                      <span style={{ color: '#ffffff', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{item.fmt(item.stockVal)}</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${stockPct}%`, height: '100%', background: item.better ? '#10b981' : '#38bdf8', borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Industry Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                      <span style={{ color: '#94a3b8' }}>Industry Avg ({rawSector})</span>
                      <span style={{ color: '#94a3b8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{item.fmt(item.indVal)}</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${indPct}%`, height: '100%', background: '#64748b', borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SUB-TAB 4: COMPARE (Quick Sector Peer Fundamental Matrix)
         ══════════════════════════════════════════════════════════════════ */}
      {subTab === 'compare' && (
        <div style={{
          background: '#111827',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '16px 18px'
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', marginBottom: 4 }}>
            Sector Peer Fundamental Matrix ({rawSector})
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            Side-by-side fundamental valuation multiples across comparable listed companies
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11 }}>
                  <th style={{ padding: '8px 6px', textAlign: 'left' }}>SYMBOL</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>LTP</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>EPS</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>P/E</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>BVPS</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>PBV</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { symbol: sym, ltp, eps: baseEps, pe: basePe, bookValue: baseBv, pb: basePb, isSelf: true },
                  ...(Array.isArray(peerStocks) ? peerStocks.slice(0, 6) : [])
                ].map((p, idx) => {
                  const pLtp = toNullNum(p.ltp ?? p.close);
                  const pEps = toNullNum(p.eps);
                  const pBv = toNullNum(p.bookValue ?? p.bvps);
                  const pPe = toNullNum(p.pe) ?? (pEps !== null && pEps > 0 && pLtp !== null ? +(pLtp / pEps).toFixed(2) : null);
                  const pPb = toNullNum(p.pb ?? p.pbv) ?? (pBv !== null && pBv > 0 && pLtp !== null ? +(pLtp / pBv).toFixed(2) : null);
                  return (
                    <tr
                      key={p.symbol || idx}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: p.isSelf ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '9px 6px', fontWeight: 900, color: p.isSelf ? '#10b981' : '#ffffff' }}>
                        {p.symbol} {p.isSelf ? '★' : ''}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', color: '#f8fafc', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {pLtp != null ? `Rs. ${pLtp.toLocaleString('en-IN', { maximumFractionDigits: 1 })}` : '—'}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', color: pEps == null ? '#64748b' : (pEps >= 0 ? '#34d399' : '#f43f5e'), fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {pEps != null ? pEps.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {pPe != null && pPe > 0 ? `${pPe.toFixed(1)}x` : '—'}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                        {pBv != null ? pBv.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', color: '#c084fc', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {pPb != null && pPb > 0 ? `${pPb.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quarter Selector Modal (Share Hub Reference) ── */}
      {showQuarterModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 20,
            maxWidth: 440,
            width: '100%',
            padding: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', marginBottom: 14, textAlign: 'center' }}>
              Select Quarters
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {quartersList.map(q => {
                const isSelected = selectedQuarter === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setSelectedQuarter(q.id);
                      if (!activeChartQuarters.includes(q.id)) {
                        setActiveChartQuarters(prev => [...prev, q.id]);
                      }
                      setShowQuarterModal(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: isSelected ? '#10b981' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    {isSelected && <Check style={{ width: 14, height: 14 }} />}
                    <span>{q.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowQuarterModal(false)}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px',
                borderRadius: 10,
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
