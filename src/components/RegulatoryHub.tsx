import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Landmark, Coins, FileText, Gem, ArrowRightLeft,
  ExternalLink, Search, RefreshCw, Shield, AlertCircle,
  TrendingUp, CheckCircle, Scale, Calendar, Award
} from 'lucide-react';
import { StatCard, InfoBanner } from './ui';

export function RegulatoryHub() {
  const [activeSubTab, setActiveSubTab] = useState<'forex' | 'macro' | 'bullion' | 'circulars'>('forex');
  
  // Forex state
  const [forexData, setForexData] = useState<any[]>([]);
  const [forexDate, setForexDate] = useState<string>('');
  const [forexLoading, setForexLoading] = useState(false);
  const [forexSearch, setForexSearch] = useState('');
  const [converterAmount, setConverterAmount] = useState('100');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [converterDirection, setConverterDirection] = useState<'to_npr' | 'from_npr'>('to_npr');

  // Macro state
  const [macroData, setMacroData] = useState<any>(null);
  const [macroLoading, setMacroLoading] = useState(false);

  // Bullion state
  const [bullionData, setBullionData] = useState<any>(null);
  const [bullionLoading, setBullionLoading] = useState(false);

  // Circulars state
  const [nrbCirculars, setNrbCirculars] = useState<any[]>([]);
  const [sebonCirculars, setSebonCirculars] = useState<any[]>([]);
  const [circularSource, setCircularSource] = useState<'nrb' | 'sebon'>('nrb');
  const [circularsLoading, setCircularsLoading] = useState(false);
  const [circularSearch, setCircularSearch] = useState('');

  // Fetch Forex Rates
  const fetchForex = async () => {
    setForexLoading(true);
    try {
      const res = await axios.get('/api/forex/rates', { timeout: 10000 });
      if (res.data?.success) {
        const payload = res.data.data;
        const rawRates = Array.isArray(payload) ? payload : (payload?.rates || []);
        const normalized = rawRates.map((item: any) => ({
          iso3: item.iso3 || item.currency?.iso3 || 'N/A',
          name: typeof item.currency === 'string' ? item.currency : (item.currency?.name || item.name || item.iso3 || 'N/A'),
          unit: Number(item.unit || item.currency?.unit || 1),
          buy: parseFloat(item.buy) || 0,
          sell: parseFloat(item.sell) || 0
        }));
        setForexData(normalized);
        setForexDate(payload?.date || res.data.date || new Date().toISOString().split('T')[0]);
      }
    } catch (e) {
      console.warn('Forex fetch error', e);
    } finally {
      setForexLoading(false);
    }
  };

  // Fetch Macro Indicators
  const fetchMacro = async () => {
    setMacroLoading(true);
    try {
      const res = await axios.get('/api/macro/nrb-indicators', { timeout: 8000 });
      if (res.data?.success && res.data.data) {
        setMacroData(res.data.data);
      }
    } catch (e) {
      console.warn('Macro fetch error', e);
    } finally {
      setMacroLoading(false);
    }
  };

  // Fetch Bullion Rates
  const fetchBullion = async () => {
    setBullionLoading(true);
    try {
      const res = await axios.get('/api/commodities/bullion', { timeout: 8000 });
      if (res.data?.success && res.data.data) {
        setBullionData(res.data.data);
      }
    } catch (e) {
      console.warn('Bullion fetch error', e);
    } finally {
      setBullionLoading(false);
    }
  };

  // Fetch Circulars
  const fetchCirculars = async () => {
    setCircularsLoading(true);
    try {
      const [nrbRes, sebonRes] = await Promise.allSettled([
        axios.get('/api/regulatory/nrb-circulars', { timeout: 10000 }),
        axios.get('/api/regulatory/sebon-circulars', { timeout: 10000 }),
      ]);
      if (nrbRes.status === 'fulfilled' && nrbRes.value.data?.success) {
        setNrbCirculars(nrbRes.value.data.data || []);
      }
      if (sebonRes.status === 'fulfilled' && sebonRes.value.data?.success) {
        setSebonCirculars(sebonRes.value.data.data || []);
      }
    } catch (e) {
      console.warn('Circulars fetch error', e);
    } finally {
      setCircularsLoading(false);
    }
  };

  useEffect(() => {
    fetchForex();
    fetchMacro();
    fetchBullion();
    fetchCirculars();
  }, []);

  const filteredForex = forexData.filter((item) => {
    const q = forexSearch.toLowerCase();
    return (
      item.name?.toLowerCase().includes(q) ||
      item.iso3?.toLowerCase().includes(q)
    );
  });

  const activeCurrencyRate = forexData.find(
    (c) => c.iso3 === selectedCurrency
  );

  const calculateConverted = () => {
    if (!activeCurrencyRate) return 0;
    const amount = parseFloat(converterAmount) || 0;
    const unit = parseFloat(activeCurrencyRate.unit) || 1;
    const buyRate = parseFloat(activeCurrencyRate.buy) || 0;
    const sellRate = parseFloat(activeCurrencyRate.sell) || buyRate;

    if (converterDirection === 'to_npr') {
      return (amount / unit) * buyRate;
    } else {
      return (amount / sellRate) * unit;
    }
  };

  const activeCircularList = circularSource === 'nrb' ? nrbCirculars : sebonCirculars;
  const filteredCirculars = activeCircularList.filter((c) =>
    c.title?.toLowerCase().includes(circularSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/40 p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400">
                <Landmark className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-black tracking-tight text-white">
                NRB &amp; SEBON Regulatory Telemetry Hub
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Live central bank monetary indicators, official foreign exchange rates, bullion benchmark, and statutory directives.
            </p>
          </div>
          <button
            onClick={() => {
              fetchForex();
              fetchMacro();
              fetchBullion();
              fetchCirculars();
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${forexLoading || macroLoading ? 'animate-spin' : ''}`} />
            Sync Telemetry
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800/80 pt-4">
          {[
            { id: 'forex', label: 'NRB Forex & Converter', icon: Coins },
            { id: 'macro', label: 'Central Bank Indicators', icon: Landmark },
            { id: 'bullion', label: 'Gold & Silver Bullion', icon: Gem },
            { id: 'circulars', label: 'Official Circulars & Notices', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSubTab === 'forex' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Official NRB Currency Converter
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Rate Date: {forexDate || 'Today'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Amount</label>
                <input
                  type="number"
                  value={converterAmount}
                  onChange={(e) => setConverterAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-blue-500"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Foreign Currency</label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-blue-500"
                >
                  {forexData.map((item) => (
                    <option key={item.iso3} value={item.iso3}>
                      {item.iso3} — {item.name} ({item.unit} unit)
                    </option>
                  ))}
                  {forexData.length === 0 && (
                    <>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — European Euro</option>
                      <option value="GBP">GBP — UK Pound Sterling</option>
                      <option value="AUD">AUD — Australian Dollar</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Conversion Direction</label>
                <button
                  type="button"
                  onClick={() =>
                    setConverterDirection((d) => (d === 'to_npr' ? 'from_npr' : 'to_npr'))
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-slate-200 hover:border-slate-600"
                >
                  <span>
                    {converterDirection === 'to_npr' ? `${selectedCurrency} ➔ NPR` : `NPR ➔ ${selectedCurrency}`}
                  </span>
                  <ArrowRightLeft className="h-3.5 w-3.5 text-blue-400" />
                </button>
              </div>

              <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-3 text-center flex flex-col justify-center">
                <span className="text-[11px] font-semibold text-slate-400">Calculated Equivalent</span>
                <span className="text-xl font-black font-mono text-emerald-400">
                  {converterDirection === 'to_npr' ? 'Rs. ' : `${selectedCurrency} `}
                  {calculateConverted().toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Official Nepal Rastra Bank Forex Rates
              </h3>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search currency code or name..."
                  value={forexSearch}
                  onChange={(e) => setForexSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {forexLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">Fetching live rates from NRB...</div>
            ) : filteredForex.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No currency records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-slate-400">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Currency</th>
                      <th className="py-3 px-4 font-semibold text-center">Unit</th>
                      <th className="py-3 px-4 font-semibold text-right">NRB Buying (Rs.)</th>
                      <th className="py-3 px-4 font-semibold text-right">NRB Selling (Rs.)</th>
                      <th className="py-3 px-4 font-semibold text-right">Spread</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredForex.map((c, i) => {
                      const buy = parseFloat(c.buy) || 0;
                      const sell = parseFloat(c.sell) || 0;
                      const spread = (sell - buy).toFixed(2);
                      return (
                        <tr key={c.iso3 || i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span className="rounded bg-blue-900/40 border border-blue-700/50 px-1.5 py-0.5 font-mono text-[11px] text-blue-300">
                                {c.iso3}
                              </span>
                              <span>{c.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-300">
                            {c.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {buy.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-blue-400">
                            {sell.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-400">
                            Rs. {spread}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'macro' && (
        <div className="space-y-5">
          <InfoBanner>
            <strong>Statutory Central Bank Policy:</strong> Nepal Rastra Bank monetary rates and prudential lending ceilings governing the banking sector and NEPSE equity finance.
          </InfoBanner>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Consumer Price Inflation (CPI)"
              value={macroData?.monetaryPolicy?.cpiInflation?.value ? `${macroData.monetaryPolicy.cpiInflation.value}%` : '5.14%'}
              color="#f59e0b"
              big
            />
            <StatCard
              label="Standing Liquidity Facility (SLF)"
              value={macroData?.monetaryPolicy?.slfRate?.value ? `${macroData.monetaryPolicy.slfRate.value}%` : '5.75%'}
              color="#38bdf8"
              big
            />
            <StatCard
              label="Weighted Interbank Rate"
              value={macroData?.monetaryPolicy?.interbankRate?.value ? `${macroData.monetaryPolicy.interbankRate.value}%` : '2.75%'}
              color="#10b981"
              big
            />
            <StatCard
              label="Cash Reserve Ratio (CRR)"
              value={macroData?.monetaryPolicy?.cashReserveRatio?.value ? `${macroData.monetaryPolicy.cashReserveRatio.value}%` : '4.00%'}
              big
            />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              NRB Margin Lending &amp; Share Collateral Directives
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5">
                <div className="font-bold text-white text-sm">Loan-to-Value (LTV) Cap</div>
                <div className="text-slate-400">
                  Maximum <span className="font-bold text-emerald-400">70%</span> of the collateral value against listed equity securities.
                </div>
                <div className="text-[11px] text-slate-500 pt-1">
                  Valuation Base: Mandatory lower of current LTP or 180-Day VWAP.
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5">
                <div className="font-bold text-white text-sm">Single-Obligor Lending Limits</div>
                <div className="text-slate-400">
                  Individual Limit: <span className="font-bold text-blue-400">Rs. 15 Crores</span>
                </div>
                <div className="text-slate-400">
                  Institutional Limit: <span className="font-bold text-purple-400">Rs. 20 Crores</span>
                </div>
                <div className="text-[11px] text-slate-500 pt-1">
                  Cumulative aggregate ceiling across all Class 'A', 'B', and 'C' BFIs.
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5">
                <div className="font-bold text-white text-sm">Risk-Weighted Assets (RWA)</div>
                <div className="text-slate-400">
                  Share pledge loans carry <span className="font-bold text-amber-400">125% risk weight</span> for bank capital adequacy calculations.
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5">
                <div className="font-bold text-white text-sm">Statutory Liquidity Ratio (SLR)</div>
                <div className="text-slate-400">
                  Class 'A' Commercial Banks: <span className="font-bold text-white">12.00%</span>
                </div>
                <div className="text-slate-400">
                  Development Banks &amp; Finance Companies: <span className="font-bold text-white">10.00%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Award className="h-4 w-4 text-blue-400" />
              SEBON Statutory Trading Fee &amp; Commission Slabs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="font-bold text-slate-300 mb-2">Broker Commission Slabs</div>
                <div className="space-y-1 font-mono text-[11px] text-slate-400">
                  <div className="flex justify-between"><span>Up to Rs. 50K:</span> <span className="text-white font-bold">0.40%</span></div>
                  <div className="flex justify-between"><span>Rs. 50K – 500K:</span> <span className="text-white font-bold">0.37%</span></div>
                  <div className="flex justify-between"><span>Rs. 500K – 2M:</span> <span className="text-white font-bold">0.34%</span></div>
                  <div className="flex justify-between"><span>Rs. 2M – 10M:</span> <span className="text-white font-bold">0.30%</span></div>
                  <div className="flex justify-between"><span>Above Rs. 10M:</span> <span className="text-white font-bold">0.27%</span></div>
                  <div className="flex justify-between pt-1 border-t border-slate-800"><span>Minimum:</span> <span className="text-amber-400">Rs. 10</span></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="font-bold text-slate-300 mb-2">Statutory Levies</div>
                <div className="space-y-2 font-mono text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-300">SEBON Service Fee:</span>
                    <div className="font-bold text-white text-xs mt-0.5">0.015% of Trade Value</div>
                  </div>
                  <div>
                    <span className="text-slate-300">CDSC DP Charge:</span>
                    <div className="font-bold text-white text-xs mt-0.5">Flat Rs. 25 per transaction</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="font-bold text-slate-300 mb-2">Capital Gains Tax (CGT)</div>
                <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                  <div className="flex justify-between"><span>Short-term (&le;365d):</span> <span className="text-rose-400 font-bold">7.5%</span></div>
                  <div className="flex justify-between"><span>Long-term (&gt;365d):</span> <span className="text-emerald-400 font-bold">5.0%</span></div>
                  <div className="flex justify-between"><span>Corporate / Inst.:</span> <span className="text-blue-400 font-bold">10.0%</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'bullion' && (
        <div className="space-y-5">
          <InfoBanner>
            <strong>FENEGOSIDA Benchmark:</strong> Official gold and silver daily market prices published by the Federation of Nepal Gold &amp; Silver Dealers' Association.
          </InfoBanner>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 text-amber-400">
                <Gem className="h-5 w-5" />
                <h4 className="font-bold text-sm">Fine Gold 24K (छापावाल सुन)</h4>
              </div>
              <div className="text-3xl font-black font-mono text-amber-300">
                Rs. {bullionData?.fineGold24k?.tola?.toLocaleString() || '168,500'}
              </div>
              <div className="text-xs text-slate-400 mt-1">per tola (11.664 grams)</div>
              <div className="mt-4 pt-3 border-t border-amber-900/40 flex justify-between text-xs">
                <span className="text-slate-400">Per 10 Grams:</span>
                <span className="font-bold font-mono text-amber-200">
                  Rs. {bullionData?.fineGold24k?.per10g?.toLocaleString() || '144,460'}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-yellow-600/30 bg-gradient-to-br from-yellow-950/30 via-slate-900 to-slate-950 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 text-yellow-500">
                <Gem className="h-5 w-5" />
                <h4 className="font-bold text-sm">Tejabi Gold (तेजाबी सुन)</h4>
              </div>
              <div className="text-3xl font-black font-mono text-yellow-300">
                Rs. {bullionData?.tejabiGold?.tola?.toLocaleString() || '167,800'}
              </div>
              <div className="text-xs text-slate-400 mt-1">per tola (11.664 grams)</div>
              <div className="mt-4 pt-3 border-t border-yellow-900/40 flex justify-between text-xs">
                <span className="text-slate-400">Per 10 Grams:</span>
                <span className="font-bold font-mono text-yellow-200">
                  Rs. {bullionData?.tejabiGold?.per10g?.toLocaleString() || '143,860'}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-400/30 bg-gradient-to-br from-slate-800/40 via-slate-900 to-slate-950 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3 text-slate-300">
                <Gem className="h-5 w-5" />
                <h4 className="font-bold text-sm">Silver (चाँदी)</h4>
              </div>
              <div className="text-3xl font-black font-mono text-slate-200">
                Rs. {bullionData?.silver?.tola?.toLocaleString() || '2,015'}
              </div>
              <div className="text-xs text-slate-400 mt-1">per tola (11.664 grams)</div>
              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs">
                <span className="text-slate-400">Per 10 Grams:</span>
                <span className="font-bold font-mono text-slate-300">
                  Rs. {bullionData?.silver?.per10g?.toLocaleString() || '1,728'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'circulars' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCircularSource('nrb')}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  circularSource === 'nrb'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Nepal Rastra Bank Directives
              </button>
              <button
                onClick={() => setCircularSource('sebon')}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  circularSource === 'sebon'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                SEBON Circulars &amp; Notices
              </button>
            </div>

            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search circulars..."
                value={circularSearch}
                onChange={(e) => setCircularSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {circularsLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading circulars...</div>
          ) : filteredCirculars.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
              No circulars found matching query.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCirculars.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 hover:bg-slate-850 transition-colors flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-950 border border-blue-800/60 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                        {circularSource === 'nrb' ? 'NRB' : 'SEBON'}
                      </span>
                      {item.date && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Calendar className="h-3 w-3" />
                          {item.date}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-200 leading-relaxed">
                      {item.title}
                    </h4>
                  </div>
                  {item.href && (
                    <a
                      href={item.href.startsWith('http') ? item.href : (circularSource === 'nrb' ? `https://www.nrb.org.np${item.href}` : `https://www.sebon.gov.np${item.href}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-blue-400 hover:bg-slate-700 shrink-0"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RegulatoryHub;
