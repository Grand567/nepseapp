import React, { useState, useMemo } from 'react';
import { BookOpen, Search, HelpCircle, ChevronRight, Check, Sparkles, Award } from 'lucide-react';
import { StatCard, InfoBanner, Insight } from './ui';

interface TermItem {
  term: string;
  category: 'Fundamentals' | 'Trading & Operations' | 'Technical' | 'Regulatory';
  definition: string;
  nepseContext: string;
  formula?: string;
  example?: string;
}

const GLOSSARY_TERMS: TermItem[] = [
  {
    term: 'EPS (Earnings Per Share)',
    category: 'Fundamentals',
    definition: 'Net profit divided by the total number of outstanding equity shares.',
    nepseContext: 'In Nepal, commercial banks with EPS > Rs. 20 and hydro with EPS > Rs. 15 are generally considered high-earning.',
    formula: 'EPS = Net Profit After Tax / Total Outstanding Shares',
    example: 'A company earning Rs. 20 Crore with 1 Crore shares has an EPS of Rs. 20.00.',
  },
  {
    term: 'P/E Ratio (Price-to-Earnings)',
    category: 'Fundamentals',
    definition: 'Ratio of current market price (LTP) to annualized earnings per share.',
    nepseContext: 'Historically, NEPSE commercial banks trade at P/E of 14–22, while hydropower often trades at higher multiples (25–40).',
    formula: 'P/E = Market Price (LTP) / EPS',
    example: 'LTP Rs. 400 / EPS Rs. 20 = P/E of 20.0x.',
  },
  {
    term: 'Bonus Share (Stock Dividend)',
    category: 'Fundamentals',
    definition: 'Free additional shares distributed to existing shareholders out of accumulated reserves.',
    nepseContext: 'Upon announcement, NEPSE adjusts the market price on book closure date according to the statutory formula.',
    formula: 'Adjusted Price = Previous Close / (1 + Bonus% / 100)',
    example: 'If LTP is Rs. 500 and company declares 25% bonus, Adjusted LTP = 500 / 1.25 = Rs. 400.',
  },
  {
    term: 'Right Share',
    category: 'Fundamentals',
    definition: 'Option given to existing shareholders to purchase additional new shares at face value (Rs. 100) proportional to their holding.',
    nepseContext: 'Commonly issued by Hydropower and Insurance companies in Nepal to satisfy statutory paid-up capital requirements.',
    formula: 'Adjusted Price = [Previous Close + (Right Ratio * 100)] / (1 + Right Ratio)',
    example: 'For a 1:1 right (100%) on Rs. 300 stock: [300 + 100] / 2 = Rs. 200 adjusted price.',
  },
  {
    term: 'WACC (Weighted Average Cost of Capital)',
    category: 'Trading & Operations',
    definition: 'The calculated purchase cost of your shares used by CDSC/MeroShare to compute Capital Gains Tax (CGT).',
    nepseContext: 'Must be declared in MeroShare "My Purchase Source" before EDIS transfer to broker on selling.',
    example: 'Bought 100 units at Rs. 300 and 100 units at Rs. 400: WACC = (30000 + 40000) / 200 = Rs. 350.',
  },
  {
    term: 'Circuit Breaker (15% Daily Limit)',
    category: 'Trading & Operations',
    definition: 'Statutory price fluctuation limit preventing extreme intraday volatility on individual scrips.',
    nepseContext: 'Effective Baishakh 2083 (April 2026) under SEBON Fourth Amendment 2082, NEPSE expanded the individual scrip daily circuit band to ±15% from the previous ±10%.',
    example: 'A stock closing at Rs. 1,000 can trade between Rs. 850 (lower circuit) and Rs. 1,150 (upper circuit).',
  },
  {
    term: 'Market-Wide Circuit Breakers (5% & 8% Index Halts)',
    category: 'Trading & Operations',
    definition: 'Exchange-wide trading suspensions triggered when the benchmark NEPSE Index experiences extreme systemic surges or crashes.',
    nepseContext: 'Under SEBON Fourth Amendment 2082: (1) A 5% index swing within the first 2 hours halts market trading for 15 minutes; (2) An 8% index swing at any time terminates trading for the remainder of the session.',
    example: 'If the NEPSE Index rises or drops 5% before 1:00 PM, all trading pauses for 15 minutes. At 8% movement, the market immediately closes for the day.',
  },
  {
    term: 'Pre-Open Session Price Limit (±5%)',
    category: 'Trading & Operations',
    definition: 'Permitted price variation band for entering opening orders between 10:30 AM and 10:45 AM before normal market open.',
    nepseContext: 'Expanded from ±2% to ±5% of previous day close to allow more realistic initial price discovery and smoother transition into continuous trading.',
    example: 'For a stock with Rs. 400 previous close, pre-open orders can range between Rs. 380 and Rs. 420.',
  },
  {
    term: 'T+2 Rolling Settlement',
    category: 'Trading & Operations',
    definition: 'Trades are settled two business days after transaction date (Trade Date + 2 Days).',
    nepseContext: 'Shares sold on Sunday must have EDIS completed by Monday evening for broker clearing on Tuesday.',
    example: 'Buying on Sunday means shares enter your Demat account by Tuesday afternoon.',
  },
  {
    term: 'C-ASBA & MeroShare',
    category: 'Trading & Operations',
    definition: 'Centralized Application Supported by Blocked Amount. Direct IPO application via MeroShare.',
    nepseContext: 'SEBON mandates a flat Rs. 5 C-ASBA charge per application across all licensed BFIs.',
    example: 'Applying for 10 kitta IPO blocks Rs. 1,000 in your bank account until allotment.',
  },
  {
    term: 'Floor Sheet',
    category: 'Trading & Operations',
    definition: 'Real-time chronological log of every matched trade on NEPSE, recording contract ID, buyer/seller broker, quantity, and rate.',
    nepseContext: 'Used by institutional analysts to trace broker accumulation (e.g., Broker 58 buying 40% of float).',
  },
  {
    term: 'RSI (Relative Strength Index)',
    category: 'Technical',
    definition: 'A 0–100 momentum oscillator measuring the speed and change of price movements over 14 periods.',
    nepseContext: 'RSI < 30 indicates an oversold bounce candidate; RSI > 70 indicates an overbought condition.',
    formula: 'RSI = 100 - (100 / (1 + Average Gain / Average Loss))',
  },
  {
    term: '20-Day EMA (Exponential Moving Average)',
    category: 'Technical',
    definition: 'Trend-following indicator giving higher weight to the most recent 20 trading sessions.',
    nepseContext: 'A stock sustaining above its 20 EMA is considered in an active short-to-medium term bullish markup.',
  },
  {
    term: 'Fibonacci 61.8% Golden Ratio',
    category: 'Technical',
    definition: 'Key mathematical retracement level derived from the golden ratio (0.618).',
    nepseContext: 'In NEPSE swing trading, strong upward thrusts typically find institutional support at the 61.8% pullback.',
  },
  {
    term: 'Margin Lending LTV (70%)',
    category: 'Regulatory',
    definition: 'Statutory loan-to-value ceiling permitted by Nepal Rastra Bank on shares pledged as loan collateral.',
    nepseContext: 'BFIs calculate the loan against the lower of current LTP or 180-day volume-weighted average price (VWAP).',
    formula: 'Max Loan = Valuation Base * 70%',
    example: 'Shares valued at Rs. 10 Lakhs qualify for a maximum margin facility of Rs. 7 Lakhs.',
  },
  {
    term: 'Capital Gains Tax (CGT)',
    category: 'Regulatory',
    definition: 'Tax levied on capital profit when selling equity shares on NEPSE.',
    nepseContext: 'Short-term retail (holding <= 365 days): 7.5%. Long-term retail (holding > 365 days): 5.0%. Institutional: 10.0%.',
  },
  {
    term: 'Promoter Share Lock-In (3 Years)',
    category: 'Regulatory',
    definition: 'Mandatory 3-year holding restriction for founders/promoters following an initial public offering.',
    nepseContext: 'When hydropower 3-year lock-ins expire, promoter shares can be converted/traded, often causing supply pressure.',
  },
];

export function GlossaryGuideService() {
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('All');
  const [activeTerm, setActiveTerm] = useState<TermItem>(GLOSSARY_TERMS[0]);

  const categories = ['All', 'Fundamentals', 'Trading & Operations', 'Technical', 'Regulatory'];

  const filteredTerms = useMemo(() => {
    return GLOSSARY_TERMS.filter((t) => {
      const matchSearch = !search || t.term.toLowerCase().includes(search.toLowerCase()) || t.definition.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCat === 'All' || t.category === selectedCat;
      return matchSearch && matchCat;
    });
  }, [search, selectedCat]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">NEPSE Capital Market Knowledge Base</h3>
          <p className="text-xs text-slate-400">Searchable glossary of Nepalese equity trading terminology, statutory formulas, and market mechanisms.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search concept (e.g. WACC, Circuit, EPS)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCat === cat
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Master/Detail Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Term List Sidebar */}
        <div className="md:col-span-1 rounded-2xl border border-slate-800 bg-slate-950/60 p-2 max-h-[500px] overflow-y-auto space-y-1">
          {filteredTerms.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">No matching concepts found.</div>
          ) : (
            filteredTerms.map((t) => {
              const isSelected = activeTerm.term === t.term;
              return (
                <div
                  key={t.term}
                  onClick={() => setActiveTerm(t)}
                  className={`cursor-pointer rounded-xl p-2.5 transition flex items-center justify-between ${
                    isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs">{t.term}</div>
                    <div className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>{t.category}</div>
                  </div>
                  <ChevronRight size={13} className={isSelected ? 'text-white' : 'text-slate-600'} />
                </div>
              );
            })
          )}
        </div>

        {/* Selected Term Deep-Dive */}
        {activeTerm && (
          <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold bg-slate-800 text-blue-400 border border-slate-700">
                  {activeTerm.category}
                </span>
                <h2 className="text-lg font-black text-white mt-1.5">{activeTerm.term}</h2>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Standard Definition</h4>
                <p className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-white font-medium">
                  {activeTerm.definition}
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Nepal Stock Exchange (NEPSE) Real-World Application</h4>
                <p className="bg-blue-950/20 p-3 rounded-xl border border-blue-900/40 text-blue-200">
                  {activeTerm.nepseContext}
                </p>
              </div>

              {activeTerm.formula && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Mathematical Formula</h4>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-emerald-400 font-bold">
                    {activeTerm.formula}
                  </div>
                </div>
              )}

              {activeTerm.example && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Practical Example</h4>
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-slate-300 italic">
                    {activeTerm.example}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Insight>
        Mastering NEPSE regulatory guidelines (such as T+2 settlement, WACC taxation, and circuit thresholds) prevents costly trading mistakes and penalty fees.
      </Insight>
    </div>
  );
}
