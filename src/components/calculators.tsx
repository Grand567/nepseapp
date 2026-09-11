import { useState } from 'react';
import { InfoBanner, StatCard, TimeframeFilterBar } from './ui';

const inputCls = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-base sm:text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 box-border';
const btnCls = 'w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 text-base sm:text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.98] transition-transform disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500';

export function GrahamValuation() {
  const [form, setForm] = useState({ eps: '', bvps: '', price: '' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1Y');

  const calc = () => {
    if (!form.eps || !form.bvps) return;
    const eps = parseFloat(form.eps), bvps = parseFloat(form.bvps), price = parseFloat(form.price) || 0;
    if (eps <= 0 || bvps <= 0) return;
    const intrinsic = Math.sqrt(22.5 * eps * bvps);
    const mos = price > 0 ? ((intrinsic - price) / price) * 100 : 0;
    const verdict = mos > 20 ? { text: 'UNDERVALUED — Strong Buy', color: '#10b981' }
      : mos < -20 ? { text: 'OVERVALUED — Avoid', color: '#F43F5E' }
      : { text: 'FAIRLY VALUED — Hold', color: '#f59e0b' };
    setResult({ intrinsic, price, mos, verdict });
  };
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Benjamin Graham Intrinsic Valuation Model"
      />
      <InfoBanner><strong>Formula:</strong> V* = √(22.5 × EPS × BVPS). Margin of safety &gt; 20% = undervalued. Growth factor 7% + defensive P/E 15× = 22.5.</InfoBanner>
      <div className="mb-4 grid gap-3">
        <input type="number" placeholder="EPS — e.g. 65.20" value={form.eps} onChange={(e) => setForm((f) => ({ ...f, eps: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="BVPS — e.g. 182.50" value={form.bvps} onChange={(e) => setForm((f) => ({ ...f, bvps: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Current market price (optional)" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={inputCls} />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Intrinsic Value</button>
      {result && (
        <div className="mt-5 rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-5 text-center">
          <div className="text-[13px] text-slate-400">Benjamin Graham Intrinsic Value</div>
          <div className="text-4xl font-black text-emerald-400">NPR {result.intrinsic.toFixed(2)}</div>
          {result.price > 0 && (
            <>
              <div className="mt-2 text-lg font-bold" style={{ color: result.verdict.color }}>{result.verdict.text}</div>
              <div className="mt-1 text-sm text-slate-400">Margin of Safety: {result.mos > 0 ? '+' : ''}{result.mos.toFixed(1)}%</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BrokerageCalculator() {
  const [form, setForm] = useState({ buy: '', sell: '', qty: '', holdingType: 'short', slabType: 'statutory' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');

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

  const calc = () => {
    const buyPrice = parseFloat(form.buy), sellPrice = parseFloat(form.sell), qty = parseFloat(form.qty);
    if (!buyPrice || !sellPrice || !qty || buyPrice <= 0 || sellPrice <= 0 || qty <= 0) return;
    const buyTotal = buyPrice * qty, sellTotal = sellPrice * qty;
    const buyBrok = getBrokerage(buyTotal, form.slabType);
    const sellBrok = getBrokerage(sellTotal, form.slabType);
    const sebonBuy = buyTotal * 0.00015, sebonSell = sellTotal * 0.00015;
    const dpFee = 50; // NPR 25 buy + NPR 25 sell
    const totalCost = buyBrok + sellBrok + sebonBuy + sebonSell + dpFee;
    const grossProfit = sellTotal - buyTotal;
    const taxableProfit = grossProfit - totalCost;
    const cgtRate = form.holdingType === 'individual_short' || form.holdingType === 'short' ? 0.075 : form.holdingType === 'long' ? 0.05 : 0.10;
    const cgt = taxableProfit > 0 ? taxableProfit * cgtRate : 0;
    const netReturn = grossProfit - totalCost - cgt;
    const returnPct = (netReturn / buyTotal) * 100;
    
    // Break-even calculation
    let be = buyPrice;
    for (let i = 0; i < 40; i++) {
      const sVal = be * qty;
      const sB = getBrokerage(sVal, form.slabType);
      const sSebon = sVal * 0.00015;
      const cost = buyBrok + sB + sebonBuy + sSebon + dpFee;
      const profit = sVal - buyTotal - cost;
      if (Math.abs(profit) < 0.5) break;
      be += (cost - (sVal - buyTotal)) / qty;
    }

    setResult({ buyTotal, sellTotal, buyBrok, sellBrok, sebonBuy, sebonSell, dpFee, totalCost, cgt, netReturn, returnPct, breakEvenPrice: be });
  };

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="SEBON Official Brokerage & CGT Calculator"
      />
      <InfoBanner>
        <strong>SEBON Regulatory Norms:</strong> 5-tier broker commission (0.40% down to 0.27%, min Rs 10) + SEBON fee 0.015% + CDSC DP fee Rs 25/txn + Capital Gains Tax (7.5% short-term &le;365d, 5% long-term &gt;365d, 10% corporate).
      </InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <input type="number" placeholder="Buy Price NPR" value={form.buy} onChange={(e) => setForm((f) => ({ ...f, buy: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Sell Price NPR" value={form.sell} onChange={(e) => setForm((f) => ({ ...f, sell: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Quantity" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={inputCls} />
        <select value={form.holdingType} onChange={(e) => setForm((f) => ({ ...f, holdingType: e.target.value }))} className={inputCls}>
          <option value="short">Individual Short &le;365d — 7.5% CGT</option>
          <option value="long">Individual Long &gt;365d — 5% CGT</option>
          <option value="institutional">Institutional / Corporate — 10% CGT</option>
        </select>
        <select value={form.slabType} onChange={(e) => setForm((f) => ({ ...f, slabType: e.target.value }))} className={inputCls}>
          <option value="statutory">Statutory Slabs (0.40% – 0.27%)</option>
          <option value="jestha_2081">Jestha 2081 Revision (0.36% – 0.24%)</option>
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
  const [form, setForm] = useState({ shares: '', fv: '100', cash: '', bonus: '' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1Y');

  const calc = () => {
    const s = parseFloat(form.shares), fv = parseFloat(form.fv);
    const c = parseFloat(form.cash) || 0, b = parseFloat(form.bonus) || 0;
    if (!s || !fv || s <= 0) return;
    const grossCash = (fv * c / 100) * s;
    const tax = grossCash * 0.05;
    setResult({ grossCash, tax, netCash: grossCash - tax, bonusShares: Math.floor((s * b) / 100), newTotal: s + Math.floor((s * b) / 100) });
  };
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Dividend & Bonus Share Tax Calculator"
      />
      <InfoBanner>Cash dividend: 5% TDS deducted at source. Bonus shares credited via CDSC directly to Demat.</InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <input type="number" placeholder="Shares Held" value={form.shares} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Face Value" value={form.fv} onChange={(e) => setForm((f) => ({ ...f, fv: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Cash Div %" value={form.cash} onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Bonus %" value={form.bonus} onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))} className={inputCls} />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Dividend</button>
      {result && (
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
          <StatCard label="Gross Cash" value={`Rs. ${result.grossCash.toFixed(2)}`} />
          <StatCard label="TDS (5%)" value={`-Rs. ${result.tax.toFixed(2)}`} color="#dc2626" />
          <StatCard label="Net Cash" value={`Rs. ${result.netCash.toFixed(2)}`} color="#16a34a" big />
          <StatCard label="Bonus Shares" value={result.bonusShares} color="#7c3aed" />
          <StatCard label="Total Shares" value={result.newTotal.toLocaleString()} big />
        </div>
      )}
    </div>
  );
}

export function SIPCalculator() {
  const [form, setForm] = useState({ monthly: '', years: '', rate: '15' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1Y');

  const calc = () => {
    const m = parseFloat(form.monthly), y = parseFloat(form.years), annualRate = parseFloat(form.rate);
    if (!m || !y || !annualRate || m <= 0 || y <= 0) return;
    const r = annualRate / 100 / 12, n = y * 12;
    const fv = m * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    setResult({ fv, invested: m * n, returns: fv - m * n });
  };
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Stock & Mutual Fund SIP Compounder"
      />
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

export function RiskRewardCalculator() {
  const [form, setForm] = useState({ entry: '', target: '', stop: '' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');

  const calc = () => {
    const e = parseFloat(form.entry), t = parseFloat(form.target), s = parseFloat(form.stop);
    if (!e || !t || !s || e <= 0) return;
    const reward = Math.abs(t - e), risk = Math.abs(e - s);
    if (risk === 0) return;
    setResult({ reward, risk, ratio: reward / risk, rewardPct: ((t - e) / e) * 100, riskPct: ((e - s) / e) * 100 });
  };
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="Trade Risk-to-Reward & Position Sizer"
      />
      <InfoBanner>Professional traders only take trades with 2:1 or better risk-reward. Risk max 1–2% of capital per trade.</InfoBanner>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <input type="number" placeholder="Entry" value={form.entry} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Target" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Stop-Loss" value={form.stop} onChange={(e) => setForm((f) => ({ ...f, stop: e.target.value }))} className={inputCls} />
      </div>
      <button onClick={calc} className={btnCls}>Calculate Risk / Reward</button>
      {result && (
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
          <StatCard label="Potential Reward" value={`Rs. ${result.reward.toFixed(2)}`} color="#16a34a" />
          <StatCard label="Potential Risk" value={`Rs. ${result.risk.toFixed(2)}`} color="#dc2626" />
          <StatCard label="R:R Ratio" value={`1 : ${result.ratio.toFixed(2)}`} color={result.ratio >= 2 ? '#16a34a' : '#d97706'} big />
          <StatCard label="Reward %" value={`+${result.rewardPct.toFixed(2)}%`} color="#16a34a" />
          <StatCard label="Risk %" value={`-${result.riskPct.toFixed(2)}%`} color="#dc2626" />
        </div>
      )}
    </div>
  );
}

// ── NEPSE Standard Bonus Share Price & WACC Adjustment Calculator ──
export function BonusAdjustmentCalculator() {
  const [form, setForm] = useState({ closePrice: '', bonusPct: '', shares: '100', wacc: '' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');

  const calc = () => {
    const pClose = parseFloat(form.closePrice);
    const bPct = parseFloat(form.bonusPct);
    const s = parseFloat(form.shares) || 100;
    const w = parseFloat(form.wacc) || pClose;

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

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Bonus Share Price & WACC Adjustment Engine"
      />
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
  const [form, setForm] = useState({ closePrice: '', rightRatio: '1', issuePrice: '100', shares: '100', wacc: '' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');

  const calc = () => {
    const pClose = parseFloat(form.closePrice);
    const rRatio = parseFloat(form.rightRatio);
    const pr = parseFloat(form.issuePrice) || 100;
    const s = parseFloat(form.shares) || 100;
    const w = parseFloat(form.wacc) || pClose;

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

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NEPSE Right Share Price & WACC Adjustment Engine"
      />
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
          type="number"
          step="0.01"
          placeholder="Right Ratio (e.g. 1:1 is 1, 1:0.5 is 0.5)"
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
  const [timeframe, setTimeframe] = useState('1Y');

  const calc = () => {
    const qty = parseFloat(form.units);
    const ltp = parseFloat(form.ltp);
    const avg180 = parseFloat(form.avg180);
    const ltv = parseFloat(form.ltvPct) || 70;
    const rate = parseFloat(form.interestRate) || 9.5;
    const maintMargin = parseFloat(form.maintenanceMargin) || 130;

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
    const ceiling = form.borrowerType === 'individual' ? 150000000 : 200000000;
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

  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="NRB Statutory Margin Lending & Margin Call Engine"
      />
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
