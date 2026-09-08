/**
 * Dividend History Panel
 * ─────────────────────────────────────────────────────────────────
 * src/components/DividendHistoryPanel.tsx
 *
 * Shows a stock's complete dividend, bonus share, and right share
 * history across all available fiscal years.
 *
 * Wire into ServicesHub.tsx:
 *   1. import { DividendHistoryPanel } from './DividendHistoryPanel';
 *   2. Add to ALL_SERVICES: { id: 'dividend-history', name: 'Dividend History', icon: TrendingUp, color: 'emerald', cat: 'information' }
 *   3. Add to SERVICE_COMPONENTS: 'dividend-history': DividendHistoryPanel
 */

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Gift, RotateCcw, Info, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchRealDividendHistory, totalCashDividend, totalBonusShare, dividendPayingYears, latestDividendRecord } from '../utils/dividendHistory';
import { InfoBanner, NoData, Spinner, StockSearchSelect } from './ui';

// ─────────────────────────── helpers ─────────────────────────────

function Badge({ value, color = 'blue', suffix = '%' }: { value: number; color?: string; suffix?: string }) {
  if (!value || value === 0) return <span className="text-slate-600 text-xs">—</span>;
  const colors: Record<string, string> = {
    blue:   'bg-blue-500/15 text-blue-300',
    green:  'bg-green-500/15 text-green-300',
    purple: 'bg-purple-500/15 text-purple-300',
    amber:  'bg-amber-500/15 text-amber-300',
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${colors[color] || colors.blue}`}>
      {value}{suffix}
    </span>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={13} style={{ color }} />}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-lg font-black" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─────────────────────────── main component ──────────────────────

export function DividendHistoryPanel({
  stocks = [],
  symbol: initialSymbol = '',
  hideSearch = false,
}: {
  stocks?: any[];
  symbol?: string;
  hideSearch?: boolean;
}) {
  const [symbol, setSymbol]   = useState(initialSymbol);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState('');

  const analyze = useCallback(async (sym: string) => {
    if (!sym) return;
    setSymbol(sym);
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await fetchRealDividendHistory(sym);
      setResult(res);
      if (!res.real && res.error) setError(res.error);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch dividend history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialSymbol) {
      analyze(initialSymbol);
    }
  }, [initialSymbol, analyze]);

  const dividends  = result?.dividends || [];
  const latest     = latestDividendRecord(dividends);
  const hasCash    = dividends.some((d: any) => d.cashDividend > 0);
  const hasBonus   = dividends.some((d: any) => d.bonusShare > 0);
  const hasRight   = dividends.some((d: any) => d.rightShare > 0);

  return (
    <div className="space-y-4">
      <InfoBanner type="info">
        <strong>Dividend History:</strong> Shows real cash dividend, bonus share, and right share records for a stock across all available fiscal years, fetched from live NEPSE data sources.
      </InfoBanner>

      {/* ── Search (shown if !hideSearch) ── */}
      {!hideSearch && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1">
            <StockSearchSelect
              value={symbol}
              onChange={(s: string) => analyze(s)}
              placeholder="Type company name or symbol…"
            />
          </div>
          <button
            onClick={() => analyze(symbol)}
            disabled={!symbol || loading}
            className="cursor-pointer rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 shrink-0"
          >
            {loading ? '⏳ Fetching…' : '📊 Fetch History'}
          </button>
        </div>
      )}

      {loading && <Spinner text={`Fetching real dividend history for ${symbol || initialSymbol} from NEPSE sources…`} />}
      {!loading && error && !result?.dividends?.length && <NoData message={error} />}

      {!loading && result && (
        <div className="space-y-4">

          {/* ── Data source badge ── */}
          <div className="flex items-center gap-2 text-xs">
            {result.real ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-emerald-300 font-semibold">
                <CheckCircle2 size={12} /> Live data · {result.sources?.join(', ') || result.source}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-amber-300 font-semibold">
                <AlertCircle size={12} /> {error || 'No records found'}
              </span>
            )}
            {result.fetchedAt && (
              <span className="text-slate-500">as of {new Date(result.fetchedAt).toLocaleTimeString()}</span>
            )}
          </div>

          {dividends.length > 0 && (
            <>
              {/* ── Summary cards ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <SummaryCard
                  label="Paying Years"
                  value={dividendPayingYears(dividends)}
                  sub={`of ${dividends.length} fiscal years`}
                  icon={Calendar}
                  color="#34d399"
                />
                <SummaryCard
                  label="Total Cash Paid"
                  value={`${totalCashDividend(dividends)}%`}
                  sub="cumulative"
                  icon={TrendingUp}
                  color="#60a5fa"
                />
                <SummaryCard
                  label="Total Bonus Issued"
                  value={`${totalBonusShare(dividends)}%`}
                  sub="cumulative"
                  icon={Gift}
                  color="#c084fc"
                />
                <SummaryCard
                  label="Latest"
                  value={latest ? `FY ${latest.fiscalYear.replace('FY ', '')}` : '—'}
                  sub={latest ? `Cash ${latest.cashDividend}% Bonus ${latest.bonusShare}%` : 'No recent dividend'}
                  icon={RotateCcw}
                  color="#facc15"
                />
              </div>

              {/* ── Main table ── */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                    {symbol || initialSymbol} — Dividend & Corporate Action History
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/60 text-xs text-slate-400">
                        <th className="text-left px-4 py-2.5">Fiscal Year</th>
                        {hasCash  && <th className="text-right px-4 py-2.5">Cash Dividend</th>}
                        {hasBonus && <th className="text-right px-4 py-2.5">Bonus Share</th>}
                        {hasRight && <th className="text-right px-4 py-2.5">Right Share</th>}
                        <th className="text-right px-4 py-2.5">Total Yield</th>
                        <th className="text-left px-4 py-2.5 hidden sm:table-cell">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.map((rec: any, i: number) => {
                        const hasActivity = rec.cashDividend > 0 || rec.bonusShare > 0 || rec.rightShare > 0;
                        return (
                          <tr
                            key={i}
                            className={`border-b border-slate-800/50 transition ${hasActivity ? 'hover:bg-slate-800/30' : 'opacity-50'}`}
                          >
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{rec.fiscalYear}</td>
                            {hasCash  && (
                              <td className="px-4 py-2.5 text-right">
                                <Badge value={rec.cashDividend} color="blue" />
                              </td>
                            )}
                            {hasBonus && (
                              <td className="px-4 py-2.5 text-right">
                                <Badge value={rec.bonusShare} color="green" />
                              </td>
                            )}
                            {hasRight && (
                              <td className="px-4 py-2.5 text-right">
                                <Badge value={rec.rightShare} color="purple" />
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-right">
                              {hasActivity
                                ? <Badge value={rec.totalYield} color="amber" />
                                : <span className="text-slate-600 text-xs">No dividend</span>
                              }
                            </td>
                            <td className="px-4 py-2.5 hidden sm:table-cell">
                              <span className="text-xs text-slate-500 capitalize">{rec.source?.replace(/-/g, ' ')}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Legend ── */}
              <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40 inline-block" /> Cash Dividend — paid in cash as % of face value</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/40 inline-block" /> Bonus Share — free shares as % of holding</span>
                {hasRight && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500/40 inline-block" /> Right Share — additional shares offered at discount</span>}
                <span>Total Yield = Cash + Bonus</span>
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-500 px-1">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>
                  Data sourced from ShareSansar and Merolagani. Fiscal year follows Nepal BS calendar (approx. mid-July to mid-July).
                  Historical records may be incomplete for older fiscal years or recently listed companies.
                  Cash dividend is on Rs. 100 face value. This is informational only, not investment advice.
                </span>
              </div>
            </>
          )}

          {dividends.length === 0 && result.real === false && (
            <NoData message={`No dividend or bonus share records found for ${symbol || initialSymbol}. The stock may be newly listed, or records may not be available from the data source.`} />
          )}
        </div>
      )}

      {!loading && !result && !error && (
        <div className="text-center text-sm text-slate-500 py-10">
          Search a NEPSE stock above to view its complete dividend, bonus share, and right share history.
        </div>
      )}
    </div>
  );
}
