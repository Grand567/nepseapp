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
  const [form, setForm] = useState({ buy: '', sell: '', qty: '', holdingType: 'short' });
  const [result, setResult] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('1D');

  const getBrokerage = (amount: number) => {
    if (amount <= 50000) return amount * 0.0036;
    if (amount <= 500000) return amount * 0.0033;
    if (amount <= 2000000) return amount * 0.0031;
    if (amount <= 10000000) return amount * 0.0027;
    return amount * 0.0024;
  };
  const calc = () => {
    const buyPrice = parseFloat(form.buy), sellPrice = parseFloat(form.sell), qty = parseFloat(form.qty);
    if (!buyPrice || !sellPrice || !qty || buyPrice <= 0 || sellPrice <= 0 || qty <= 0) return;
    const buyTotal = buyPrice * qty, sellTotal = sellPrice * qty;
    const buyBrok = getBrokerage(buyTotal), sellBrok = getBrokerage(sellTotal);
    const sebonBuy = buyTotal * 0.00015, sebonSell = sellTotal * 0.00015;
    const dpFee = 50; // NPR 25 buy + NPR 25 sell
    const totalCost = buyBrok + sellBrok + sebonBuy + sebonSell + dpFee;
    const grossProfit = sellTotal - buyTotal;
    const taxableProfit = grossProfit - totalCost;
    const cgtRate = form.holdingType === 'individual_short' || form.holdingType === 'short' ? 0.075 : form.holdingType === 'long' ? 0.05 : 0.10;
    const cgt = taxableProfit > 0 ? taxableProfit * cgtRate : 0;
    const netReturn = grossProfit - totalCost - cgt;
    const returnPct = (netReturn / buyTotal) * 100;
    setResult({ buyTotal, sellTotal, buyBrok, sellBrok, sebonBuy, sebonSell, dpFee, totalCost, cgt, netReturn, returnPct });
  };
  return (
    <div className="space-y-4">
      <TimeframeFilterBar
        timeframe={timeframe}
        onSelectTimeframe={setTimeframe}
        title="SEBON Official Brokerage & CGT Calculator"
      />
      <InfoBanner>Accurate SEBON tiered brokerage (0.24%–0.36%) + DP fee NPR 25/txn + 7.5% CGT for short term (&lt;365d).</InfoBanner>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <input type="number" placeholder="Buy Price NPR" value={form.buy} onChange={(e) => setForm((f) => ({ ...f, buy: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Sell Price NPR" value={form.sell} onChange={(e) => setForm((f) => ({ ...f, sell: e.target.value }))} className={inputCls} />
        <input type="number" placeholder="Quantity" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={inputCls} />
        <select value={form.holdingType} onChange={(e) => setForm((f) => ({ ...f, holdingType: e.target.value }))} className={inputCls}>
          <option value="short">Individual Short &lt;365d — 7.5%</option>
          <option value="long">Long &gt;365d — 5%</option>
          <option value="institutional">Institutional — 10%</option>
        </select>
      </div>
      <button onClick={calc} className={btnCls}>Calculate Complete Return</button>
      {result && (
        <div className="mt-5">
          <div className={`mb-4 rounded-xl border p-5 text-center ${result.netReturn >= 0 ? 'border-emerald-800/60 bg-emerald-950/40' : 'border-red-800/60 bg-red-950/40'}`}>
            <div className="text-[13px] text-slate-400">Net Profit / Loss</div>
            <div className={`text-4xl font-black ${result.netReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{result.netReturn >= 0 ? '+' : ''}NPR {result.netReturn.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div className={`text-lg font-bold ${result.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{result.returnPct >= 0 ? '+' : ''}{result.returnPct.toFixed(2)}% Return</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <StatCard label="Buy Brokerage" value={`Rs. ${result.buyBrok.toFixed(2)}`} color="#F43F5E" />
            <StatCard label="Sell Brokerage" value={`Rs. ${result.sellBrok.toFixed(2)}`} color="#F43F5E" />
            <StatCard label="SEBON Fees" value={`Rs. ${(result.sebonBuy + result.sebonSell).toFixed(2)}`} color="#f59e0b" />
            <StatCard label="DP Fee" value={`Rs. ${result.dpFee}`} color="#f59e0b" />
            <StatCard label="CGT" value={`Rs. ${result.cgt.toFixed(2)}`} color="#F43F5E" />
            <StatCard label="Total Cost" value={`Rs. ${result.totalCost.toFixed(2)}`} color="#F43F5E" />
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
