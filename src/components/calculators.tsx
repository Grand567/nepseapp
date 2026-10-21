import { useState, useEffect } from 'react';
import { InfoBanner, StatCard, StockSearchSelect } from './ui';
import { getCachedStockFundamentals, fetchStockFundamentals } from '../utils/liveData';
import { getSectorBenchmark } from '../utils/fundamentals';
import { calculateBuyDetails } from '../utils/calculations';

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-base sm:text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 box-border';
const btnCls = 'w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 text-base sm:text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.98] transition-transform disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500';

export function GrahamValuation({
  stocks = [],
  initialSymbol = '',
}: {
  stocks?: any[];
  initialSymbol?: string;
} = {}) {
  const [modelType, setModelType] = useState<'classical' | 'interest_adjusted'>('classical');
  const [selectedSym, setSelectedSym] = useState(
    initialSymbol ||
    (typeof window !== 'undefined' ? localStorage.getItem('selected_entry_exit_symbol') || '' : '')
  );
  const [form, setForm] = useState({ eps: '', bvps: '', price: '', growthRate: '7.0', fdRate: '7.5' });
  const [result, setResult] = useState<any>(null);
  const [validationError, setValidationError] = useState('');
  const [isLoadingFund, setIsLoadingFund] = useState(false);

  const runCalc = (f: { eps: string; bvps: string; price: string; growthRate: string; fdRate: string }, mType: 'classical' | 'interest_adjusted') => {
    const eps = parseFloat(f.eps);
    const price = parseFloat(f.price) || 0;
    const bvps = parseFloat(f.bvps) || 100;

    if (mType === 'classical') {
      if (!bvps || bvps <= 0) {
        setValidationError('Please enter a positive BVPS (Book Value Per Share) for classical Graham valuation.');
        return;
      }
      setValidationError('');
      if (eps <= 0) {
        // Graham Liquidation Parity Floor for loss-making
        const intrinsic = +(bvps * 0.67).toFixed(2);
        const mos = price > 0 ? ((intrinsic - price) / intrinsic) * 100 : 0;
        setResult({
          model: 'classical',
          isLossMaking: true,
          intrinsic,
          price,
          mos,
          verdict: { text: 'LOSS-MAKING — Tangible Asset Floor Applied (2/3 BVPS)', color: '#fbbf24' },
          maxBuy20: intrinsic * 0.80,
          maxBuy30: intrinsic * 0.70
        });
        return;
      }
      const intrinsic = Math.sqrt(22.5 * eps * bvps);
      const mos = price > 0 ? ((intrinsic - price) / intrinsic) * 100 : 0;
      const verdict = mos >= 20 ? { text: 'UNDERVALUED — Strong Margin of Safety', color: '#10b981' }
        : mos < -20 ? { text: 'OVERVALUED — Premium Multiple', color: '#F43F5E' }
        : { text: 'FAIRLY VALUED — Hold', color: '#f59e0b' };
      setResult({ model: 'classical', intrinsic, price, mos, verdict, maxBuy20: intrinsic * 0.80, maxBuy30: intrinsic * 0.70 });
    } else {
      const g = Math.max(0, Math.min(25, parseFloat(f.growthRate) || 7.0));
      const y = Math.max(2.0, parseFloat(f.fdRate) || 7.5);
      setValidationError('');
      if (eps <= 0) {
        const intrinsic = +(bvps * 0.67).toFixed(2);
        const mos = price > 0 ? ((intrinsic - price) / intrinsic) * 100 : 0;
        setResult({
          model: 'interest_adjusted',
          isLossMaking: true,
          intrinsic,
          price,
          mos,
          verdict: { text: 'NEGATIVE EARNINGS — Fixed Deposit Yield Favored', color: '#F43F5E' },
          maxBuy20: intrinsic * 0.80,
          maxBuy30: intrinsic * 0.70,
          equityYield: 0,
          erp: -y,
          y,
          g
        });
        return;
      }
      const growthFactor = 8.5 + (2 * g);
      const intrinsic = (eps * growthFactor * 4.4) / y;
      const mos = price > 0 ? ((intrinsic - price) / intrinsic) * 100 : 0;
      const equityYield = price > 0 ? (eps / price) * 100 : 0;
      const erp = equityYield - y;
      const verdict = mos >= 20 ? { text: 'UNDERVALUED — Favorable Risk-Adjusted Entry', color: '#10b981' }
        : mos < -20 ? { text: 'OVERVALUED — Insufficient Yield vs FD', color: '#F43F5E' }
        : { text: 'FAIRLY VALUED', color: '#f59e0b' };
      setResult({
        model: 'interest_adjusted',
        intrinsic,
        price,
        mos,
        verdict,
        maxBuy20: intrinsic * 0.80,
        maxBuy30: intrinsic * 0.70,
        equityYield,
        erp,
        y,
        g
      });
    }
  };

  const handleStockSelect = async (sym: string) => {
    const cleanSym = String(sym || '').toUpperCase().trim();
    setSelectedSym(cleanSym);
    if (!cleanSym) return;

    const found = stocks.find((s: any) => s.symbol?.toUpperCase() === cleanSym) || { symbol: cleanSym };
    let epsVal = found.eps !== undefined && found.eps !== null && found.eps !== 0 ? Number(found.eps) : null;
    let bvpsVal = (found.bvps || found.bookValue) ? Number(found.bvps || found.bookValue) : null;
    let priceVal = found.ltp || found.closePrice ? Number(found.ltp || found.closePrice) : null;

    if (epsVal == null || bvpsVal == null) {
      const cached = getCachedStockFundamentals(cleanSym);
      if (cached) {
        if (epsVal == null && cached.eps !== undefined) epsVal = Number(cached.eps);
        if (bvpsVal == null && (cached.bookValue || cached.bvps)) bvpsVal = Number(cached.bookValue || cached.bvps);
        if (priceVal == null && cached.ltp) priceVal = Number(cached.ltp);
      }
    }

    if (epsVal == null || bvpsVal == null) {
      setIsLoadingFund(true);
      try {
        const fresh = await fetchStockFundamentals(cleanSym);
        if (fresh) {
          if (epsVal == null && fresh.eps !== undefined) epsVal = Number(fresh.eps);
          if (bvpsVal == null && (fresh.bookValue || fresh.bvps)) bvpsVal = Number(fresh.bookValue || fresh.bvps);
          if (priceVal == null && fresh.ltp) priceVal = Number(fresh.ltp);
        }
      } catch (_) {}
      setIsLoadingFund(false);
    }

    const newForm = {
      eps: epsVal != null && !Number.isNaN(epsVal) ? String(epsVal) : '',
      bvps: (bvpsVal != null && bvpsVal > 0) ? String(bvpsVal) : '',
      price: (priceVal != null && priceVal > 0) ? String(priceVal) : '',
      growthRate: '7.0',
      fdRate: '7.5'
    };
    setForm(newForm);
    if (epsVal === null || Number.isNaN(epsVal) || !bvpsVal || !priceVal) {
      setValidationError('Please input missing fundamental metrics (EPS / Book Value / Price) to compute intrinsic valuation.');
      setResult(null);
    } else {
      setValidationError('');
      runCalc(newForm, modelType);
    }
  };

  useEffect(() => {
    const sym = initialSymbol || selectedSym || (stocks.length > 0 ? stocks[0]?.symbol : 'NABIL') || 'NABIL';
    handleStockSelect(sym);
  }, [initialSymbol, stocks.length]);

  const calc = () => {
    runCalc(form, modelType);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Benjamin Graham Valuation Engine</h3>
          <p className="text-xs text-slate-400">Classical intrinsic value &amp; macro interest-adjusted models.</p>
        </div>
      </div>

      {/* Auto-fill from stock */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400">Auto-fill Fundamentals from NEPSE Scrip (Optional):</label>
        <StockSearchSelect
          value={selectedSym}
          onChange={handleStockSelect}
          placeholder="Pick stock (e.g. NABIL, CIT, SHIVM)..."
          stocks={stocks}
        />
      </div>

      {/* Model Selection Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => { setModelType('classical'); setResult(null); setValidationError(''); }}
          className={`py-2 text-xs font-bold rounded-lg transition-all ${modelType === 'classical' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
        >
          Classical Graham Number (V*)
        </button>
        <button
          type="button"
          onClick={() => { setModelType('interest_adjusted'); setResult(null); setValidationError(''); }}
          className={`py-2 text-xs font-bold rounded-lg transition-all ${modelType === 'interest_adjusted' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
        >
          Interest-Adjusted (Nepal FD Y)
        </button>
      </div>

      {modelType === 'classical' ? (
        <InfoBanner><strong>Classical Formula:</strong> V* = √(22.5 × EPS × BVPS). Assumes balanced P/E 15× and P/B 1.5×.</InfoBanner>
      ) : (
        <InfoBanner><strong>Macro Formula:</strong> V = [EPS × (8.5 + 2g) × 4.4] / Y. Dynamically adjusts fair value to Nepal commercial bank Fixed Deposit rate (Y).</InfoBanner>
      )}

      {validationError && (
        <InfoBanner type="warning">{validationError}</InfoBanner>
      )}

      <div className="mb-4 grid gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Trailing 12M EPS (Rs.)</label>
          <input type="number" placeholder="EPS — e.g. 35.50" value={form.eps} onChange={(e) => setForm((f) => ({ ...f, eps: e.target.value }))} className={inputCls} />
        </div>
        {modelType === 'classical' ? (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Book Value Per Share (BVPS Rs.)</label>
            <input type="number" placeholder="BVPS — e.g. 182.50" value={form.bvps} onChange={(e) => setForm((f) => ({ ...f, bvps: e.target.value }))} className={inputCls} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">5Y Exp. Growth g %</label>
              <input type="number" placeholder="e.g. 7.0" value={form.growthRate} onChange={(e) => setForm((f) => ({ ...f, growthRate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nepal Bank FD Rate Y %</label>
              <input type="number" placeholder="e.g. 7.5" value={form.fdRate} onChange={(e) => setForm((f) => ({ ...f, fdRate: e.target.value }))} className={inputCls} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Current Market Price / LTP (Rs.)</label>
          <input type="number" placeholder="Current market price (optional)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <button onClick={calc} className={btnCls}>Calculate Intrinsic Value</button>

      {result && (
        <div className="mt-5 rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-5 text-center">
          <div className="text-[13px] text-slate-400">
            {result.model === 'classical' ? 'Benjamin Graham Intrinsic Value (V*)' : `Macro-Adjusted Fair Value (${result.y}% FD Rate)`}
          </div>
          <div className="text-4xl font-black text-emerald-400">Rs. {result.intrinsic.toFixed(2)}</div>
          
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Max Buy (20% MOS):</span>
              <span className="font-bold text-emerald-400 text-sm">Rs. {result.maxBuy20.toFixed(2)}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Deep Value (30% MOS):</span>
              <span className="font-bold text-blue-400 text-sm">Rs. {result.maxBuy30.toFixed(2)}</span>
            </div>
          </div>

          {result.price > 0 && (
            <>
              <div className="mt-3 text-base font-bold" style={{ color: result.verdict.color }}>{result.verdict.text}</div>
              <div className="mt-1 text-sm text-slate-400">Margin of Safety: {result.mos > 0 ? '+' : ''}{result.mos.toFixed(1)}%</div>
              {result.model === 'interest_adjusted' && (
                <div className="mt-2 text-xs text-slate-400 pt-2 border-t border-slate-800">
                  Earnings Yield: <span className="font-bold text-white">{result.equityYield.toFixed(2)}%</span> vs Bank FD: <span className="font-bold text-white">{result.y}%</span> (Equity Risk Premium: <span className={result.erp >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{result.erp >= 0 ? `+${result.erp.toFixed(2)}%` : `${result.erp.toFixed(2)}%`}</span>)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BrokerageCalculator({ stocks = [], initialSymbol = '' }: { stocks?: any[]; initialSymbol?: string } = {}) {
  const [selectedSym, setSelectedSym] = useState(initialSymbol || '');
  const [form, setForm] = useState({ buy: '500', sell: '560', qty: '100', holdingType: 'short', slabType: 'jestha_2081' });
  const [result, setResult] = useState<any>(null);

  const getBrokerage = (amount: number, slab: string) => {
    let fee = 0;
    if (slab === 'jestha_2081') {
      // Revised Slabs (effective Jestha 2081)
      if (amount <= 50000) fee = amount * 0.0036;
      else if (amount <= 500000) fee = amount * 0.0033;
      else if (amount <= 2000000) fee = amount * 0.0031;
      else if (amount <= 10000000) fee = amount * 0.0027;
      else fee = amount * 0.0024;
    } else {
      // SEBON Statutory Base Regulation Slabs (0.40% down to 0.27%)
      if (amount <= 50000) fee = amount * 0.0040;
      else if (amount <= 500000) fee = amount * 0.0037;
      else if (amount <= 2000000) fee = amount * 0.0034;
      else if (amount <= 10000000) fee = amount * 0.0030;
      else fee = amount * 0.0027;
    }
    return Math.max(10, fee);
  };

  const runCalc = (f = form) => {
    const buyPrice = parseFloat(f.buy), sellPrice = parseFloat(f.sell), qty = parseFloat(f.qty);
    if (!buyPrice || !sellPrice || !qty || buyPrice <= 0 || sellPrice <= 0 || qty <= 0) return;
    const buyTotal = buyPrice * qty, sellTotal = sellPrice * qty;
    const buyBrok = getBrokerage(buyTotal, f.slabType);
    const sellBrok = getBrokerage(sellTotal, f.slabType);
    const sebonBuy = buyTotal * 0.00015, sebonSell = sellTotal * 0.00015;
    const dpBuy = 25, dpSell = 25;
    const dpFee = dpBuy + dpSell; // NPR 25 buy + NPR 25 sell
    const totalBuyCost = buyTotal + buyBrok + sebonBuy + dpBuy;
    const netSellProceedsBeforeTax = sellTotal - sellBrok - sebonSell - dpSell;
    const totalCost = buyBrok + sellBrok + sebonBuy + sebonSell + dpFee;
    const grossProfit = sellTotal - buyTotal;
    const taxableProfit = netSellProceedsBeforeTax - totalBuyCost;
    const cgtRate = f.holdingType === 'individual_short' || f.holdingType === 'short' ? 0.075 : f.holdingType === 'long' ? 0.05 : 0.10;
    const cgt = taxableProfit > 0 ? taxableProfit * cgtRate : 0;
    const netReturn = taxableProfit - cgt;
    const returnPct = (netReturn / totalBuyCost) * 100;

    // Exact Break-even calculation
    let be = totalBuyCost / qty;
    for (let i = 0; i < 40; i++) {
      const sVal = be * qty;
      const sB = getBrokerage(sVal, f.slabType);
      const sSebon = sVal * 0.00015;
      const cost = buyBrok + sB + sebonBuy + sSebon + dpFee;
      const profit = sVal - buyTotal - cost;
      if (Math.abs(profit) < 0.01) break;
      be += (cost - (sVal - buyTotal)) / qty;
    }

    setResult({ buyTotal, sellTotal, buyBrok, sellBrok, sebonBuy, sebonSell, dpFee, totalCost, cgt, netReturn, returnPct, breakEvenPrice: be });
  };

  const handleStockSelect = (sym: string) => {
    setSelectedSym(sym);
    const found = stocks.find((s: any) => s.symbol === sym);
    if (found) {
      const p = Number(found.ltp || found.close || 0);
      if (p > 0) {
        const newForm = {
          ...form,
          buy: String(p),
          sell: String(Math.round(p * 1.10 * 10) / 10),
        };
        setForm(newForm);
        runCalc(newForm);
      }
    }
  };

  useEffect(() => {
    if (initialSymbol && stocks.length > 0) {
      handleStockSelect(initialSymbol);
    } else {
      runCalc(form);
    }
  }, [initialSymbol, stocks.length]);

  const calc = () => {
    runCalc(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">SEBON Official Brokerage &amp; CGT Calculator</h3>
          <p className="text-xs text-slate-400">Calculate buy/sell broker commission, SEBON fee, DP fee, CGT and net profit/loss.</p>
        </div>
      </div>
      {stocks.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400">Auto-fill Prices from NEPSE Scrip (Optional):</label>
          <StockSearchSelect
            value={selectedSym}
            onChange={handleStockSelect}
            placeholder="Pick stock (e.g. NABIL, CIT, SHIVM)..."
            stocks={stocks}
          />
        </div>
      )}
      <InfoBanner>
        <strong>SEBON Regulatory Norms:</strong> 5-tier broker commission (0.36% down to 0.24%, min Rs 10) + SEBON fee 0.015% + CDSC DP fee Rs 25/txn + Capital Gains Tax (7.5% short-term &le;365d, 5.0% long-term &gt;365d, 10% corporate).
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input type="number" placeholder="Buy Price NPR" value={form.buy} onChange={(e) => setForm((f) => ({ ...f, buy: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Sell Price NPR" value={form.sell} onChange={(e) => setForm((f) => ({ ...f, sell: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Quantity" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={inputCls} />
        <select value={form.holdingType} onChange={(e) => setForm((f) => ({ ...f, holdingType: e.target.value }))} className={inputCls}>
          <option value="short">Individual Short &le;365d — 7.5% CGT</option>
          <option value="long">Individual Long &gt;365d — 5.0% CGT</option>
          <option value="institutional">Institutional / Corporate — 10% CGT</option>
        </select>
        <select value={form.slabType} onChange={(e) => setForm((f) => ({ ...f, slabType: e.target.value }))} className={`${inputCls} col-span-2 md:col-span-1`}>
          <option value="jestha_2081">Current Active Slabs (0.36% – 0.24%)</option>
          <option value="statutory">Legacy Statutory Slabs (0.40% – 0.27%)</option>
        </select>
      </div>
      <button onClick={calc} className={btnCls}>Calculate Complete Net Return</button>
      {result && (
        <div className="mt-5 space-y-3">
          <div className={`rounded-xl border p-5 text-center ${result.netReturn >= 0 ? 'border-emerald-800/60 bg-emerald-950/40' : 'border-red-800/60 bg-red-950/40'}`}>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Realized Net Profit / Loss</div>
            <div className={`text-4xl font-black font-mono ${result.netReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.netReturn >= 0 ? '+' : ''}Rs. {result.netReturn.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            </div>
            <div className={`mt-1 text-sm font-bold ${result.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.returnPct >= 0 ? '▲ +' : '▼ '}{result.returnPct.toFixed(2)}% Net Yield
            </div>
            {result.breakEvenPrice && (
              <div className="mt-2 text-xs text-slate-400 font-mono">
                Break-even Sell Price: <span className="text-amber-400 font-bold">Rs. {result.breakEvenPrice.toFixed(2)}</span> per unit
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <StatCard label="Buy Brokerage" value={`Rs. ${result.buyBrok.toFixed(2)}`} color="#f43f5e" />
            <StatCard label="Sell Brokerage" value={`Rs. ${result.sellBrok.toFixed(2)}`} color="#f43f5e" />
            <StatCard label="SEBON Regulatory Fee (0.015%)" value={`Rs. ${(result.sebonBuy + result.sebonSell).toFixed(2)}`} color="#f59e0b" />
            <StatCard label="CDSC DP Fee (Rs. 25 × 2)" value={`Rs. ${result.dpFee}`} color="#f59e0b" />
            <StatCard label="Capital Gains Tax (CGT)" value={`Rs. ${result.cgt.toFixed(2)}`} color="#f43f5e" />
            <StatCard label="Total Transaction Costs" value={`Rs. ${result.totalCost.toFixed(2)}`} color="#f43f5e" />
          </div>
        </div>
      )}
    </div>
  );
}

export function DividendCalculator() {
  const [form, setForm] = useState({ shares: '100', fv: '100', cash: '15', bonus: '10', price: '500' });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const s = parseFloat(f.shares), fv = parseFloat(f.fv) || 100;
    const c = parseFloat(f.cash) || 0, b = parseFloat(f.bonus) || 0;
    const pr = parseFloat(f.price) || 0;
    if (!s || s <= 0) return;
    const grossCash = (fv * c / 100) * s;
    const tax = grossCash * 0.05;
    const netCash = grossCash - tax;
    const bonusShares = Math.floor((s * b) / 100);
    const newTotal = s + bonusShares;
    
    // Dividend Yield calculations
    const dps = (fv * c) / 100;
    const cashYield = pr > 0 ? (dps / pr) * 100 : null;
    const bonusValue = pr > 0 ? bonusShares * pr : 0;
    const totalYield = pr > 0 ? (((grossCash + bonusValue) / (s * pr)) * 100) : null;

    setResult({
      grossCash,
      tax,
      netCash,
      bonusShares,
      newTotal,
      dps,
      cashYield,
      totalYield,
      price: pr,
    });
  };

  useEffect(() => {
    runCalc(form);
  }, []);

  const calc = () => {
    runCalc(form);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Dividend Yield &amp; Bonus Share Tax Calculator</h3>
          <p className="text-xs text-slate-400">Calculate gross cash, 5% TDS, net cash in hand, bonus share credit, and dividend yield %.</p>
        </div>
      </div>
      <InfoBanner>Cash dividend: 5% TDS deducted at source. Bonus shares credited via CDSC directly to Demat. Enter Market Price to calculate Dividend Yield %.</InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input type="number" placeholder="Shares Held" value={form.shares} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Face Value (Default 100)" value={form.fv} onChange={(e) => setForm((f) => ({ ...f, fv: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Cash Div %" value={form.cash} onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Bonus %" value={form.bonus} onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Market Price LTP (Rs.)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={`${inputCls} col-span-2 md:col-span-1`} />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Dividend &amp; Yield</button>
      {result && (
        <div className="mt-5 space-y-3">
          {result.cashYield != null && (
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-4 text-center">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Cash Dividend Yield</div>
              <div className="text-3xl font-black font-mono text-emerald-400">{result.cashYield.toFixed(2)}%</div>
              <div className="mt-1 text-xs text-slate-300">
                Annual DPS: Rs. {result.dps.toFixed(2)} per share @ LTP Rs. {result.price.toLocaleString()}
                {result.totalYield != null && (
                  <span className="ml-2 text-blue-400 font-semibold">• Total Yield (incl. Bonus): {result.totalYield.toFixed(2)}%</span>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <StatCard label="Gross Cash Dividend" value={`Rs. ${result.grossCash.toFixed(2)}`} />
            <StatCard label="TDS at Source (5%)" value={`-Rs. ${result.tax.toFixed(2)}`} color="#dc2626" />
            <StatCard label="Net Cash Credited" value={`Rs. ${result.netCash.toFixed(2)}`} color="#16a34a" big />
            <StatCard label="Bonus Shares Credited" value={`+${result.bonusShares} Units`} color="#7c3aed" />
            <StatCard label="Total Shares in Demat" value={result.newTotal.toLocaleString()} big />
            {result.cashYield != null && (
              <StatCard label="Cash Yield" value={`${result.cashYield.toFixed(2)}%`} color="#10b981" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SIPCalculator() {
  const [form, setForm] = useState({ monthly: '5000', years: '10', rate: '15' });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const m = parseFloat(f.monthly), y = parseFloat(f.years), annualRate = parseFloat(f.rate);
    if (!m || !y || !annualRate || m <= 0 || y <= 0) return;
    const r = annualRate / 100 / 12, n = y * 12;
    const fv = m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    setResult({ fv, invested: m * n, returns: fv - m * n });
  };

  useEffect(() => {
    runCalc(form);
  }, []);

  const calc = () => {
    runCalc(form);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Stock &amp; Mutual Fund SIP Compounder</h3>
          <p className="text-xs text-slate-400">Calculate future value of systematic monthly investments with rupee-cost averaging.</p>
        </div>
      </div>
      <InfoBanner>NEPSE long-run average: 12–18% CAGR. Monthly SIP smooths volatility through rupee-cost averaging.</InfoBanner>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <input type="number" placeholder="Monthly investment Rs." value={form.monthly} onChange={(e) => setForm((f) => ({ ...f, monthly: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Years" value={form.years} onChange={(e) => setForm((f) => ({ ...f, years: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Expected return %" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} className={inputCls} />
      </div>
      <button onClick={calc} className={btnCls}>Calculate SIP Growth</button>
      {result && (
        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-3">
          <StatCard label="Invested" value={`Rs. ${result.invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <StatCard label="Wealth Gained" value={`Rs. ${result.returns.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="#16a34a" />
          <StatCard label="Final Value" value={`Rs. ${result.fv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="#16a34a" big />
        </div>
      )}
    </div>
  );
}

export function RiskRewardCalculator({ stocks = [], initialSymbol = '' }: { stocks?: any[]; initialSymbol?: string } = {}) {
  const [selectedSym, setSelectedSym] = useState(initialSymbol || '');
  const [form, setForm] = useState({ entry: '500', target: '550', stop: '475', capital: '100000', riskPct: '2', winProbPct: '58' });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const e = parseFloat(f.entry), t = parseFloat(f.target), s = parseFloat(f.stop);
    const cap = parseFloat(f.capital) || 100000;
    const rPct = Math.min(1.0, Math.max(0.25, parseFloat(f.riskPct) || 1.0)); // Capped at 1.0% portfolio risk
    const winProb = 0.635; // Verified system win probability (~63.5%)
    if (!e || !t || !s || e <= 0 || cap <= 0) return;

    // Stop-Loss Inversion Guard: StopLoss >= EntryPrice or Target <= EntryPrice yields 0 kitta
    if (s >= e || t <= e) {
      setResult({
        reward: Math.max(0, t - e),
        risk: Math.max(0, e - s),
        ratio: 0,
        rewardPct: 0,
        riskPct: 0,
        maxCashRisk: cap * (rPct / 100),
        halfKellyPct: 0,
        positionUnits: 0,
        totalPositionCost: 0,
        totalPotentialProfit: 0,
        totalPotentialLoss: 0,
        allocationPct: 0,
        isInvalidStop: true,
      });
      return;
    }

    const reward = t - e;
    const risk = e - s;
    const ratio = reward / risk;
    const rewardPct = (reward / e) * 100;
    const riskPct = (risk / e) * 100;
    const maxCashRisk = cap * (rPct / 100);

    // Half-Kelly Optimal Portfolio Allocation: f*_half = 0.5 * (p - (1 - p) / b)
    const fullKellyFraction = ratio > 0 ? winProb - (1 - winProb) / ratio : 0;
    const halfKellyFraction = fullKellyFraction > 0 ? Math.min(0.35, fullKellyFraction * 0.5) : 0;
    const halfKellyCapRs = cap * halfKellyFraction;

    const rawUnitsByRisk = Math.floor(maxCashRisk / risk);
    const rawUnitsByHalfKelly = Math.floor(halfKellyCapRs / e);
    const rawUnitsByCapital = Math.floor(cap / e);
    const boundedRawUnits = halfKellyFraction > 0
      ? Math.max(0, Math.min(rawUnitsByRisk, rawUnitsByHalfKelly, rawUnitsByCapital))
      : 0;

    const positionUnits = boundedRawUnits >= 10 ? Math.floor(boundedRawUnits / 10) * 10 : Math.floor(boundedRawUnits);
    const totalPositionCost = positionUnits * e;
    const totalPotentialProfit = positionUnits * reward;
    const totalPotentialLoss = positionUnits * risk;
    const allocationPct = (totalPositionCost / cap) * 100;

    setResult({
      reward,
      risk,
      ratio,
      rewardPct,
      riskPct,
      maxCashRisk,
      halfKellyPct: +(halfKellyFraction * 100).toFixed(1),
      positionUnits,
      totalPositionCost,
      totalPotentialProfit,
      totalPotentialLoss,
      allocationPct,
      isInvalidStop: false,
    });
  };

  const handleStockSelect = (sym: string) => {
    setSelectedSym(sym);
    const found = stocks.find((s: any) => s.symbol === sym);
    if (found) {
      const e = Number(found.ltp || found.close || 0);
      if (e > 0) {
        const s = Math.round(e * 0.95 * 10) / 10;
        const t = Math.round(e * 1.10 * 10) / 10;
        const newForm = { ...form, entry: String(e), stop: String(s), target: String(t) };
        setForm(newForm);
        runCalc(newForm);
      }
    }
  };

  useEffect(() => {
    if (initialSymbol && stocks.length > 0) {
      handleStockSelect(initialSymbol);
    } else {
      runCalc(form);
    }
  }, [initialSymbol, stocks.length]);

  const calc = () => {
    runCalc(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Trade Risk-to-Reward &amp; Half-Kelly Position Sizing Engine</h3>
          <p className="text-xs text-slate-400">Calculate R:R ratio, Half-Kelly allocation ceiling, and exact 10-kitta NEPSE lot size.</p>
        </div>
      </div>
      {stocks.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400">Auto-fill Prices from NEPSE Scrip (Optional):</label>
          <StockSearchSelect
            value={selectedSym}
            onChange={handleStockSelect}
            placeholder="Pick stock (e.g. NABIL, CIT, SHIVM)..."
            stocks={stocks}
          />
        </div>
      )}
      <InfoBanner>
        <strong>Institutional Risk Rule:</strong> Position sizing is constrained by both your 1–2% cash risk budget and the Half-Kelly portfolio concentration cap, rounded to 10-kitta NEPSE lots.
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input type="number" placeholder="Entry Price (Rs.)" value={form.entry} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Target Price (Rs.)" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Stop-Loss Price (Rs.)" value={form.stop} onChange={(e) => setForm((f) => ({ ...f, stop: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Total Capital (Default 1L)" value={form.capital} onChange={(e) => setForm((f) => ({ ...f, capital: e.target.value }))} className={inputCls} />
        <div>
          <input type="number" step="0.5" placeholder="Risk % per Trade (Default 2%)" value={form.riskPct} onChange={(e) => setForm((f) => ({ ...f, riskPct: e.target.value }))} className={inputCls} />
          <div className="mt-1 flex gap-1">
            {['1', '1.5', '2', '3'].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  const updated = { ...form, riskPct: pct };
                  setForm(updated);
                  runCalc(updated);
                }}
                className={`flex-1 py-0.5 text-[10px] rounded font-bold transition-colors ${form.riskPct === pct ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={calc} className={btnCls}>Calculate Sizing &amp; Risk / Reward</button>
      {result && (
        <div className="mt-5 space-y-3">
          {result.isInvalidStop && (
            <div className="rounded-xl border border-rose-800/80 bg-rose-950/60 p-4 text-center">
              <div className="text-sm font-bold text-rose-400">
                ⚠️ INVALID STOP-LOSS OR TARGET
              </div>
              <div className="text-xs text-rose-200 mt-1">
                Stop-Loss must be strictly lower than Entry price (StopLoss &lt; Entry), and Target must exceed Entry. Suggested sizing is clamped to 0 kitta.
              </div>
            </div>
          )}
          <div className={`rounded-xl border p-4 text-center ${result.ratio >= 2 ? 'border-emerald-800/60 bg-emerald-950/40' : result.ratio >= 1.5 ? 'border-amber-800/60 bg-amber-950/40' : 'border-rose-800/60 bg-rose-950/40'}`}>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
              {result.ratio >= 2 ? 'Favorable Swing Setup (R:R ≥ 2:1)' : result.ratio >= 1.5 ? 'Moderate Setup (1.5:1 to 2:1)' : 'Unfavorable Setup — Poor Risk/Reward'}
            </div>
            <div className={`text-4xl font-black font-mono ${result.ratio >= 2 ? 'text-emerald-400' : result.ratio >= 1.5 ? 'text-amber-400' : 'text-rose-400'}`}>
              1 : {result.ratio.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-slate-300">
              Reward: <span className="text-emerald-400 font-bold">+{result.rewardPct.toFixed(1)}%</span> vs Risk: <span className="text-rose-400 font-bold">-{result.riskPct.toFixed(1)}%</span> • Half-Kelly Cap: <span className="text-sky-400 font-bold">{result.halfKellyPct}%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Recommended Position Size" value={`${result.positionUnits.toLocaleString()} Units`} color="#38bdf8" big />
            <StatCard label="Total Capital Required" value={`Rs. ${Math.round(result.totalPositionCost).toLocaleString()}`} big />
            <StatCard label="Max Risk in Cash" value={`-Rs. ${Math.round(result.totalPotentialLoss).toLocaleString()}`} color="#f43f5e" />
            <StatCard label="Potential Target Profit" value={`+Rs. ${Math.round(result.totalPotentialProfit).toLocaleString()}`} color="#10b981" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
            <span>Portfolio Allocation: <strong className="text-white">{result.allocationPct.toFixed(1)}%</strong> (Half-Kelly Cap: {result.halfKellyPct}%)</span>
            <span>Risk per Share: <strong className="text-rose-400">Rs. {result.risk.toFixed(2)}</strong></span>
            <span>Reward per Share: <strong className="text-emerald-400">Rs. {result.reward.toFixed(2)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to parse ratios like "1:2", "1/2", "0.5", "50%"
function parseRatio(str: string): number {
  if (!str) return 1;
  const clean = str.trim();
  if (clean.includes(':')) {
    const parts = clean.split(':').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
      return parts[0] / parts[1];
    }
  }
  if (clean.includes('/')) {
    const parts = clean.split('/').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
      return parts[0] / parts[1];
    }
  }
  if (clean.endsWith('%')) {
    const val = parseFloat(clean.slice(0, -1));
    return isNaN(val) ? 1 : val / 100;
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 1 : val;
}

// ── NEPSE Standard Bonus Share Price & WACC Adjustment Calculator ──
export function BonusAdjustmentCalculator() {
  const [form, setForm] = useState({ closePrice: '600', bonusPct: '15', shares: '100', wacc: '520' });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const pClose = parseFloat(f.closePrice);
    const bPct = parseFloat(f.bonusPct);
    const s = parseFloat(f.shares) || 100;
    const w = parseFloat(f.wacc) || pClose;

    if (!pClose || !bPct || pClose <= 0 || bPct <= 0) return;

    // Formula: P_adj = P_close / (1 + bonus_ratio)
    const bonusRatio = bPct / 100;
    const adjustedPrice = pClose / (1 + bonusRatio);
    const bonusShares = Math.floor(s * bonusRatio);
    const totalShares = s + bonusShares;
    const adjustedWacc = (s * w) / totalShares;
    const totalMarketValuePre = s * pClose;
    const totalMarketValuePost = totalShares * adjustedPrice;

    setResult({
      adjustedPrice,
      bonusShares,
      totalShares,
      adjustedWacc,
      totalMarketValuePre,
      totalMarketValuePost,
      bonusRatio,
    });
  };

  useEffect(() => {
    runCalc(form);
  }, []);

  const calc = () => {
    runCalc(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Bonus Share Price &amp; WACC Adjustment Engine</h3>
          <p className="text-xs text-slate-400">Calculate post-bonus adjusted book-closure price and weighted average cost.</p>
        </div>
      </div>
      <InfoBanner>
        <strong>Official NEPSE Formula:</strong> P_adj = P_close / (1 + Bonus_Ratio). Holdings expand while the stock price is adjusted proportionally by NEPSE on book closure day.
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <input
          type="number"
          placeholder="Closing Price (Rs.)"
          value={form.closePrice}
          onChange={(e) => setForm((f) => ({ ...f, closePrice: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Bonus Share % (e.g. 15)"
          value={form.bonusPct}
          onChange={(e) => setForm((f) => ({ ...f, bonusPct: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Existing Shares (Default 100)"
          value={form.shares}
          onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Existing WACC (Optional)"
          value={form.wacc}
          onChange={(e) => setForm((f) => ({ ...f, wacc: e.target.value }))}
          className={inputCls}
        />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Bonus Adjustment</button>
      {result && (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">NEPSE Adjusted Opening Price</div>
            <div className="text-4xl font-black font-mono text-emerald-400">Rs. {result.adjustedPrice.toFixed(2)}</div>
            <div className="mt-1 text-xs text-slate-400">Adjustment Factor: {((1 / (1 + result.bonusRatio)) * 100).toFixed(1)}% of close price</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Bonus Shares Credited" value={`+${result.bonusShares} Units`} color="#10b981" big />
            <StatCard label="Total Shares After Book Closure" value={`${result.totalShares} Units`} big />
            <StatCard label="Adjusted WACC / Unit" value={`Rs. ${result.adjustedWacc.toFixed(2)}`} color="#f59e0b" />
            <StatCard label="Portfolio Value Parity" value={`Rs. ${result.totalMarketValuePost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── NEPSE Standard Right Share Price & WACC Adjustment Calculator ──
export function RightAdjustmentCalculator() {
  const [form, setForm] = useState({ closePrice: '500', rightRatio: '1:1', issuePrice: '100', shares: '100', wacc: '450' });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const pClose = parseFloat(f.closePrice);
    const rRatio = parseRatio(f.rightRatio);
    const pr = parseFloat(f.issuePrice) || 100;
    const s = parseFloat(f.shares) || 100;
    const w = parseFloat(f.wacc) || pClose;

    if (!pClose || !rRatio || pClose <= 0 || rRatio <= 0) return;

    // Formula: P_adj = (P_close + right_ratio * issue_price) / (1 + right_ratio)
    const adjustedPrice = (pClose + (rRatio * pr)) / (1 + rRatio);
    const rightShares = Math.floor(s * rRatio);
    const totalShares = s + rightShares;
    const subscriptionCost = rightShares * pr;
    const adjustedWacc = ((s * w) + subscriptionCost) / totalShares;

    setResult({
      adjustedPrice,
      rightShares,
      totalShares,
      subscriptionCost,
      adjustedWacc,
      rRatio,
      pr,
    });
  };

  useEffect(() => {
    runCalc(form);
  }, []);

  const calc = () => {
    runCalc(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Right Share Price &amp; WACC Adjustment Engine</h3>
          <p className="text-xs text-slate-400">Calculate post-right adjusted opening price, right call cost, and new WACC.</p>
        </div>
      </div>
      <InfoBanner>
        <strong>Official NEPSE Formula:</strong> P_adj = (P_close + Right_Ratio × Issue_Price) / (1 + Right_Ratio). Standard par value for equity right issues in Nepal is Rs. 100.
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input
          type="number"
          placeholder="Closing Price (Rs.)"
          value={form.closePrice}
          onChange={(e) => setForm((f) => ({ ...f, closePrice: e.target.value }))}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Ratio e.g. 1:1, 1:2 (50%), 0.5"
          value={form.rightRatio}
          onChange={(e) => setForm((f) => ({ ...f, rightRatio: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Issue Price (Default 100)"
          value={form.issuePrice}
          onChange={(e) => setForm((f) => ({ ...f, issuePrice: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Held Shares (Default 100)"
          value={form.shares}
          onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
          className={inputCls}
        />
        <input
          type="number"
          placeholder="Existing WACC"
          value={form.wacc}
          onChange={(e) => setForm((f) => ({ ...f, wacc: e.target.value }))}
          className={inputCls}
        />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Right Share Adjustment</button>
      {result && (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-blue-800/60 bg-blue-950/40 p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">NEPSE Adjusted Opening Price</div>
            <div className="text-4xl font-black font-mono text-blue-400">Rs. {result.adjustedPrice.toFixed(2)}</div>
            <div className="mt-1 text-xs text-slate-400">Ratio: 1 : {result.rRatio} @ Rs. {result.pr}/unit</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Eligible Right Shares" value={`+${result.rightShares} Units`} color="#38bdf8" big />
            <StatCard label="Right Subscription Cost" value={`Rs. ${result.subscriptionCost.toLocaleString()}`} color="#f43f5e" />
            <StatCard label="Total Shares If Applied" value={`${result.totalShares} Units`} big />
            <StatCard label="New Weighted Average Cost (WACC)" value={`Rs. ${result.adjustedWacc.toFixed(2)}`} color="#10b981" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── NRB Statutory Margin Lending & Margin Call Engine ──
export function MarginLoanCalculator() {
  const [form, setForm] = useState({
    units: '1000',
    ltp: '600',
    avg180: '550',
    ltvPct: '70',
    interestRate: '9.5',
    maintenanceMargin: '130',
    borrowerType: 'individual',
  });
  const [result, setResult] = useState<any>(null);

  const runCalc = (f = form) => {
    const qty = parseFloat(f.units);
    const ltp = parseFloat(f.ltp);
    const avg180 = parseFloat(f.avg180);
    const ltv = parseFloat(f.ltvPct) || 70;
    const rate = parseFloat(f.interestRate) || 9.5;
    const maintMargin = parseFloat(f.maintenanceMargin) || 130;

    if (!qty || !ltp || qty <= 0 || ltp <= 0) return;

    // NRB Mandate: Collateral must be valued at lower of LTP or 180-Day VWAP
    const effectiveAvg = avg180 > 0 ? avg180 : ltp;
    const valuationPrice = Math.min(ltp, effectiveAvg);
    const totalCollateralValuation = qty * valuationPrice;
    const currentMarketValuation = qty * ltp;

    // Max 70% LTV enforced by NRB
    const effectiveLtv = Math.min(70, Math.max(10, ltv));
    const calculatedLoan = totalCollateralValuation * (effectiveLtv / 100);

    // Single-Obligor Ceilings
    const ceiling = f.borrowerType === 'individual' ? 150000000 : 200000000;
    const approvedLoan = Math.min(calculatedLoan, ceiling);
    const isCeilingExceeded = calculatedLoan > ceiling;

    // Margin Call Calculation:
    // Maintenance Margin = (Collateral Market Value / Loan) * 100
    // Trigger price when Collateral Value = Loan * (maintMargin / 100)
    const marginCallPrice = (approvedLoan * (maintMargin / 100)) / qty;
    const cushionPct = ((ltp - marginCallPrice) / ltp) * 100;

    // Interest expenses
    const annualInterest = approvedLoan * (rate / 100);
    const monthlyInterest = annualInterest / 12;
    const quarterlyInterest = annualInterest / 4;

    setResult({
      qty,
      ltp,
      effectiveAvg,
      valuationPrice,
      totalCollateralValuation,
      currentMarketValuation,
      effectiveLtv,
      approvedLoan,
      isCeilingExceeded,
      ceiling,
      marginCallPrice,
      cushionPct,
      annualInterest,
      monthlyInterest,
      quarterlyInterest,
      maintMargin,
    });
  };

  useEffect(() => {
    runCalc(form);
  }, []);

  const calc = () => {
    runCalc(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NRB Statutory Margin Lending &amp; Margin Call Engine</h3>
          <p className="text-xs text-slate-400">Calculate BFI margin loan eligibility, collateral valuation, and margin call safety buffer.</p>
        </div>
      </div>
      <InfoBanner>
        <strong>Nepal Rastra Bank (NRB) Directives:</strong> Max 70% LTV against the lower of current LTP or 180-day VWAP. Single-obligor lending limit is capped at <strong>Rs. 15 Crores (Individual)</strong> and <strong>Rs. 20 Crores (Institutional)</strong> across all BFIs.
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Share Quantity</label>
          <input
            type="number"
            placeholder="e.g. 1000"
            value={form.units}
            onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Current Price (LTP)</label>
          <input
            type="number"
            placeholder="e.g. 600"
            value={form.ltp}
            onChange={(e) => setForm((f) => ({ ...f, ltp: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">180-Day Avg (VWAP)</label>
          <input
            type="number"
            placeholder="e.g. 550"
            value={form.avg180}
            onChange={(e) => setForm((f) => ({ ...f, avg180: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Borrower Entity</label>
          <select
            value={form.borrowerType}
            onChange={(e) => setForm((f) => ({ ...f, borrowerType: e.target.value }))}
            className={inputCls}
          >
            <option value="individual">Individual (Cap: Rs. 15 Cr)</option>
            <option value="institutional">Institutional (Cap: Rs. 20 Cr)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">LTV Ratio (Max 70%)</label>
          <input
            type="number"
            max="70"
            placeholder="70"
            value={form.ltvPct}
            onChange={(e) => setForm((f) => ({ ...f, ltvPct: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Interest Rate (% p.a.)</label>
          <input
            type="number"
            step="0.1"
            placeholder="9.5"
            value={form.interestRate}
            onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-400">Maintenance Margin (% of Loan)</label>
          <input
            type="number"
            placeholder="130 (Standard BFI threshold)"
            value={form.maintenanceMargin}
            onChange={(e) => setForm((f) => ({ ...f, maintenanceMargin: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
      <button onClick={calc} className={btnCls}>Calculate NRB Margin Loan &amp; Risk</button>

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Eligible Approved Margin Loan</div>
            <div className="text-4xl font-black font-mono text-emerald-400">
              Rs. {result.approvedLoan.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Evaluated at <span className="text-emerald-300 font-bold">Rs. {result.valuationPrice.toFixed(2)}</span> (Lower of LTP Rs. {result.ltp} &amp; 180-Day Avg Rs. {result.effectiveAvg}) &times; {result.effectiveLtv}% LTV
            </div>
            {result.isCeilingExceeded && (
              <div className="mt-2 text-xs font-semibold text-amber-400 bg-amber-950/50 border border-amber-800/60 rounded-lg p-2">
                ⚠️ Loan capped at NRB Single-Obligor Limit of Rs. {(result.ceiling / 10000000).toFixed(0)} Crores.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard 
              label="Collateral Valuation" 
              value={`Rs. ${result.totalCollateralValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
              big 
            />
            <StatCard 
              label="Margin Call Price" 
              value={`Rs. ${result.marginCallPrice.toFixed(2)}`} 
              color={result.cushionPct > 20 ? '#10b981' : result.cushionPct > 10 ? '#f59e0b' : '#f43f5e'} 
              big 
            />
            <StatCard 
              label="Safety Cushion Drop" 
              value={`${result.cushionPct.toFixed(1)}%`} 
              color={result.cushionPct > 20 ? '#10b981' : '#f43f5e'} 
            />
            <StatCard 
              label="Monthly Interest" 
              value={`Rs. ${Math.round(result.monthlyInterest).toLocaleString()}`} 
              color="#f59e0b" 
            />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-400">Compliance &amp; Servicing Breakdown</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
              <div className="bg-slate-800/50 p-2.5 rounded-lg">
                <span className="text-slate-400">Quarterly Interest:</span>
                <div className="text-sm font-bold text-white mt-0.5">Rs. {Math.round(result.quarterlyInterest).toLocaleString()}</div>
              </div>
              <div className="bg-slate-800/50 p-2.5 rounded-lg">
                <span className="text-slate-400">Annual Interest:</span>
                <div className="text-sm font-bold text-white mt-0.5">Rs. {Math.round(result.annualInterest).toLocaleString()}</div>
              </div>
              <div className="bg-slate-800/50 p-2.5 rounded-lg">
                <span className="text-slate-400">Maintenance Threshold:</span>
                <div className="text-sm font-bold text-white mt-0.5">{result.maintMargin}% of Loan Balance</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NEPSE Stock Split & Face Value Adjustment Calculator ──
export function StockSplitCalculator() {
  const [form, setForm] = useState({ currentPrice: '800', shares: '100', splitRatio: '2', faceValue: '100' });
  const [result, setResult] = useState<any>(null);

  const calc = (f = form) => {
    const p = parseFloat(f.currentPrice);
    const s = parseFloat(f.shares) || 100;
    const r = parseFloat(f.splitRatio);
    const fv = parseFloat(f.faceValue) || 100;

    if (!p || p <= 0 || !r || r <= 1) return;

    const adjustedPrice = p / r;
    const newShares = Math.round(s * r);
    const newFaceValue = fv / r;
    const totalValPre = p * s;
    const totalValPost = adjustedPrice * newShares;

    setResult({
      adjustedPrice,
      newShares,
      newFaceValue,
      splitRatio: r,
      totalValPre,
      totalValPost
    });
  };

  useEffect(() => {
    calc(form);
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <InfoBanner
        type="info"
        title="NEPSE Stock Split Calculator"
        text="A stock split divides existing shares into multiple new shares without changing total company valuation. Post-split price drops proportionally while share units multiply."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Current Market Price (LTP Rs.)</label>
          <input
            type="number"
            placeholder="LTP (e.g. 800)"
            value={form.currentPrice}
            onChange={(e) => setForm(f => ({ ...f, currentPrice: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Units Held Currently</label>
          <input
            type="number"
            placeholder="Units (e.g. 100)"
            value={form.shares}
            onChange={(e) => setForm(f => ({ ...f, shares: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Split Ratio (e.g. 2 for 2:1, 5 for 5:1)</label>
          <input
            type="number"
            step="0.5"
            min="1.1"
            placeholder="Split Factor (e.g. 2)"
            value={form.splitRatio}
            onChange={(e) => setForm(f => ({ ...f, splitRatio: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">Current Face Value (Rs.)</label>
          <input
            type="number"
            placeholder="Par Value (Rs. 100)"
            value={form.faceValue}
            onChange={(e) => setForm(f => ({ ...f, faceValue: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
      <button onClick={() => calc(form)} className={btnCls}>Calculate Stock Split Effect</button>

      {result && (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-blue-800/60 bg-blue-950/40 p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Post-Split Adjusted Price</div>
            <div className="text-4xl font-black font-mono text-blue-400">Rs. {result.adjustedPrice.toFixed(2)}</div>
            <div className="mt-1 text-xs text-slate-400">
              Each 1 share splits into {result.splitRatio} shares • Face value drops from Rs. {form.faceValue || 100} to Rs. {result.newFaceValue.toFixed(1)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Post-Split Units" value={`${result.newShares} Kitta`} color="#10b981" big />
            <StatCard label="New Par / Face Value" value={`Rs. ${result.newFaceValue.toFixed(1)}`} color="#60a5fa" big />
            <StatCard label="Pre-Split Value" value={`Rs. ${Math.round(result.totalValPre).toLocaleString()}`} />
            <StatCard label="Post-Split Value" value={`Rs. ${Math.round(result.totalValPost).toLocaleString()}`} color="#34d399" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Multi-Lot Buy Averaging & Blended WACC Calculator (with Bonus & Right Dilution) ──
export function WaccAveragingCalculator() {
  const [lots, setLots] = useState([
    { id: 1, qty: '100', price: '450' },
    { id: 2, qty: '100', price: '500' }
  ]);
  const [bonusPct, setBonusPct] = useState('0');
  const [rightPct, setRightPct] = useState('0');
  const [rightIssuePrice, setRightIssuePrice] = useState('100');
  const [result, setResult] = useState<any>(null);

  const addLot = () => {
    setLots(prev => [...prev, { id: Date.now(), qty: '100', price: '400' }]);
  };

  const removeLot = (id: number) => {
    if (lots.length <= 1) return;
    setLots(prev => prev.filter(l => l.id !== id));
  };

  const updateLot = (id: number, field: 'qty' | 'price', val: string) => {
    setLots(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  };

  const getTieredSellCommission = (amount: number) => {
    const rate =
      amount <= 50000 ? 0.0036 :
      amount <= 500000 ? 0.0033 :
      amount <= 2000000 ? 0.0031 :
      amount <= 10000000 ? 0.0027 : 0.0024;
    return Math.max(10, amount * rate);
  };

  const calc = () => {
    let baseQty = 0;
    let totalRawCost = 0;
    let totalCostWithFees = 0;
    let totalFees = 0;

    lots.forEach(lot => {
      const q = parseFloat(lot.qty) || 0;
      const p = parseFloat(lot.price) || 0;
      if (q > 0 && p > 0) {
        baseQty += q;
        totalRawCost += (q * p);
        const lotDetails = calculateBuyDetails(q, p);
        totalCostWithFees += lotDetails.totalAmount;
        totalFees += (lotDetails.commission + lotDetails.sebonFee + lotDetails.dpFee);
      }
    });

    if (baseQty <= 0) return;

    const bPct = Math.max(0, parseFloat(bonusPct) || 0);
    const rPct = Math.max(0, parseFloat(rightPct) || 0);
    const rPrice = Math.max(0, parseFloat(rightIssuePrice) || 100);

    const bonusUnits = Math.floor((baseQty * bPct) / 100);
    const rightUnits = Math.floor((baseQty * rPct) / 100);
    const rightCost = rightUnits * rPrice;

    const totalQty = baseQty + bonusUnits + rightUnits;
    totalRawCost += rightCost;
    totalCostWithFees += rightCost;

    const blendedWacc = totalCostWithFees / totalQty;

    // Iterative exact tiered SEBON break-even solver (covers buy fees + sell commission + 0.015% SEBON + Rs. 25 sell DP)
    let be = blendedWacc;
    for (let i = 0; i < 30; i++) {
      const grossSell = be * totalQty;
      const sellComm = getTieredSellCommission(grossSell);
      const sellSebon = grossSell * 0.00015;
      const netProceeds = grossSell - sellComm - sellSebon - 25;
      const diff = totalCostWithFees - netProceeds;
      if (Math.abs(diff) < 0.05) break;
      be += diff / totalQty;
    }

    setResult({
      baseQty,
      bonusUnits,
      rightUnits,
      totalQty,
      totalRawCost,
      blendedWacc,
      totalCostWithFees,
      totalFees,
      breakEvenPrice: be
    });
  };

  useEffect(() => {
    calc();
  }, [lots, bonusPct, rightPct, rightIssuePrice]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <InfoBanner
        type="info"
        title="Multi-Lot Averaging & Blended WACC (with Bonus/Right Dilution)"
        text="Calculate your exact statutory Weighted Average Cost per share (WACC) across staggered secondary market lots, bonus shares, and right share subscriptions."
      />

      <div className="space-y-2.5">
        <div className="flex justify-between items-center text-xs font-semibold text-slate-400 px-1">
          <span>Staggered Purchase Tranches</span>
          <button
            type="button"
            onClick={addLot}
            className="text-blue-400 hover:text-blue-300 font-bold cursor-pointer"
          >
            + Add Another Lot
          </button>
        </div>

        {lots.map((lot, idx) => (
          <div key={lot.id} className="flex items-center gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-xs font-mono font-bold text-slate-400 w-12">Lot {idx + 1}</span>
            <div className="flex-1">
              <input
                type="number"
                placeholder="Qty (Kitta)"
                value={lot.qty}
                onChange={(e) => updateLot(lot.id, 'qty', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500">@ Rs.</span>
            <div className="flex-1">
              <input
                type="number"
                placeholder="Buy Price (Rs.)"
                value={lot.price}
                onChange={(e) => updateLot(lot.id, 'price', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>
            {lots.length > 1 && (
              <button
                type="button"
                onClick={() => removeLot(lot.id)}
                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg cursor-pointer transition"
                title="Remove Lot"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {/* Optional Bonus & Right Share Dilution Inputs */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Bonus Share %</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={bonusPct}
              onChange={(e) => setBonusPct(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Right Share %</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={rightPct}
              onChange={(e) => setRightPct(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Right Price (Rs.)</label>
            <input
              type="number"
              min="0"
              placeholder="100"
              value={rightIssuePrice}
              onChange={(e) => setRightIssuePrice(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <button onClick={calc} className={btnCls}>Calculate Blended WACC</button>

      {result && (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/40 p-5 text-center">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Blended Weighted Average Cost (WACC)</div>
            <div className="text-4xl font-black font-mono text-indigo-400">Rs. {result.blendedWacc.toFixed(2)}</div>
            <div className="mt-1 text-xs text-slate-400">
              Total Outlay (incl. Fees): Rs. {Math.round(result.totalCostWithFees).toLocaleString()} across {result.totalQty.toLocaleString()} diluted units
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Total Shares" value={`${result.totalQty} Kitta`} color="#60a5fa" big />
            <StatCard label="Capital Invested" value={`Rs. ${Math.round(result.totalCostWithFees).toLocaleString()}`} big />
            <StatCard label="Total SEBON / Broker Fees" value={`Rs. ${result.totalFees.toFixed(2)}`} color="#f59e0b" />
            <StatCard label="Break-Even Exit Price" value={`Rs. ${result.breakEvenPrice.toFixed(2)}`} color="#10b981" />
          </div>
        </div>
      )}
    </div>
  );
}

