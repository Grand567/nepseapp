import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ShieldCheck, Zap, X } from 'lucide-react';
import { calculateBrokerCommission, calculateSebonFee } from '../utils/calculations';

export function OrderExecution({
  symbol = 'NABIL',
  defaultPrice = 0,
  maxUnits = 1000,
  availableCash = 500000,
  isModal = false,
  onClose,
  onBack,
  onCompleteOrder,
  lang = 'ne',
}) {
  const isNe = lang === 'ne';
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('Limit');
  const [kitta, setKitta] = useState(100);
  const [waccPrice, setWaccPrice] = useState(defaultPrice);
  const [cgtRegime, setCgtRegime] = useState('short'); // 'short' (5.0% <=365d) | 'long' (3.75% >365d) | 'corp' (10%)
  const [price, setPrice] = useState(defaultPrice);
  const [submittedMessage, setSubmittedMessage] = useState('');
  const closeTimerRef = useRef(null);

  useEffect(() => {
    setPrice(defaultPrice);
    setWaccPrice(defaultPrice);
  }, [symbol, defaultPrice]);

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  const turnover = kitta * price;
  const brokerComm = calculateBrokerCommission(turnover);
  const sebonFee = calculateSebonFee(turnover);
  const dpFee = 25.00;
  const statutoryFees = brokerComm + sebonFee + dpFee;
  // Nepal IRD/CDSC rule: CGT applies to NET profit after sell fees (5.0% ST <=365d, 3.75% LT >365d, 10.0% Corp)
  const estimatedCostBasis = waccPrice > 0 ? (kitta * waccPrice) : turnover;
  const netProfitBeforeTax = Math.max(0, (turnover - statutoryFees) - estimatedCostBasis);
  const cgtRate = cgtRegime === 'corp' ? 0.10 : cgtRegime === 'long' ? 0.0375 : 0.05;
  const capitalGainsTax = orderSide === 'SELL' && netProfitBeforeTax > 0 ? Number((netProfitBeforeTax * cgtRate).toFixed(2)) : 0;
  const totalFees = statutoryFees + capitalGainsTax;
  const totalPayable = orderSide === 'BUY' ? (turnover + totalFees) : Math.max(0, turnover - totalFees);

  const handleKittaChange = (delta) => {
    setKitta(prev => {
      const next = Math.max(10, prev + delta);
      return orderSide === 'SELL' ? Math.min(Math.max(10, maxUnits), next) : next;
    });
  };

  const handlePriceChange = (delta) => {
    setPrice(prev => Math.max(1, Number((prev + delta).toFixed(2))));
  };

  const handleSubmit = () => {
    const successMsg = isNe
      ? `✅ अर्डर तयार भयो: ${symbol} (${kitta} कित्ता @ Rs ${price.toFixed(2)}) ब्रोकर ५८ TMS मार्फत कार्यान्वयनका लागि तयार।`
      : `✅ Order Prepared: ${symbol} (${kitta} Kitta @ Rs ${price.toFixed(2)}) ready for TMS Broker 58 routing.`;
    setSubmittedMessage(successMsg);
    if (onCompleteOrder) onCompleteOrder();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      if (onClose) onClose();
    }, 1800);
  };

  const content = (
    <div className={`space-y-4 ${isModal ? 'max-h-[92vh] overflow-y-auto p-5' : 'pb-24'}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {!isModal && onBack && (
            <button onClick={onBack} className="p-1 -ml-1 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft size={18} />
            </button>
          )}
          <span className="font-mono text-base font-extrabold text-white">{symbol}</span>
          <span className="rounded bg-sky-500/20 text-sky-400 text-[10px] font-mono px-2 py-0.5 font-bold">
            Order Cost & Ticket Estimator
          </span>
        </div>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center transition-all"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Estimator Notice Banner */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-300 flex items-start gap-2">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-amber-400" />
        <span>
          {isNe
            ? 'सूचना: यो अर्डर लागत र टिकट अनुमानक हो, प्रत्यक्ष NOTS कार्यान्वयन गेटवे होइन। गणना गरिएको टिकट आफ्नो ब्रोकर TMS मा प्रविष्ट गर्नुहोस्।'
            : 'Notice: This is an Order Cost & Ticket Estimator, not a live NOTS execution gateway. Copy the estimated ticket values into your broker TMS.'}
        </span>
      </div>

      {/* Buy / Sell Switcher */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#0B0F17] p-1.5 border border-white/[0.06]">
        <button
          onClick={() => setOrderSide('BUY')}
          className={`py-3 rounded-xl text-xs font-mono font-bold transition-all ${
            orderSide === 'BUY'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '🟢 खरिद (BUY)' : '🟢 BUY ORDER'}
        </button>
        <button
          onClick={() => setOrderSide('SELL')}
          className={`py-3 rounded-xl text-xs font-mono font-bold transition-all ${
            orderSide === 'SELL'
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {isNe ? '🔴 बिक्री (SELL)' : '🔴 SELL ORDER'}
        </button>
      </div>

      {/* Quantity Input with Stepper */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F17] p-3.5 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-300 font-semibold font-sans">
            {isNe ? 'कित्ता संख्या (Quantity in Kitta)' : 'Quantity (Kitta)'}
          </span>
          <span className="text-slate-400 text-[10px] font-mono">Lot Size: 10</span>
        </div>
        <div className="flex items-center justify-between border border-white/[0.08] rounded-xl px-4 py-2 bg-[#141A28]">
          <button
            onClick={() => handleKittaChange(-10)}
            className="h-8 w-8 text-lg font-bold text-slate-300 hover:text-white flex items-center justify-center tap-active"
          >
            -
          </button>
          <div className="text-center font-mono">
            <span className="text-2xl font-extrabold text-white">{kitta}</span>
            <span className="text-xs text-slate-400 ml-1">KITTA</span>
          </div>
          <button
            onClick={() => handleKittaChange(10)}
            className="h-8 w-8 text-lg font-bold text-slate-300 hover:text-white flex items-center justify-center tap-active"
          >
            +
          </button>
        </div>
        {/* Presets */}
        <div className="flex gap-2 font-mono">
          {[20, 50, 100, 200].map((val) => (
            <button
              key={val}
              onClick={() => setKitta(val)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                kitta === val
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-white/[0.05] text-slate-300 hover:text-white'
              }`}
            >
              {val}
            </button>
          ))}
          <button
            onClick={() => {
              const maxK = orderSide === 'SELL' ? maxUnits : (price > 0 ? Math.floor(availableCash / (price * 1.004)) : 100);
              setKitta(Math.max(10, Math.floor(maxK / 10) * 10));
            }}
            className="flex-1 py-1 rounded-lg bg-white/[0.05] text-xs text-slate-300 hover:text-white"
          >
            MAX
          </button>
        </div>
      </div>

      {submittedMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center animate-fade-in">
          {submittedMessage}
        </div>
      )}

      {/* Price Input */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F17] p-3.5 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-300 font-semibold font-sans">
            {isNe ? 'प्रति कित्ता मूल्य (Price per Share NPR)' : 'Price per Share (NPR)'}
          </span>
          <span className="text-slate-400 text-[10px] font-mono">Tick: 0.10</span>
        </div>
        <div className="flex items-center justify-between border border-white/[0.08] rounded-xl px-4 py-2 bg-[#141A28]">
          <button
            onClick={() => handlePriceChange(-1)}
            className="h-8 w-8 text-lg font-bold text-slate-300 hover:text-white flex items-center justify-center tap-active"
          >
            -
          </button>
          <div className="text-center font-mono">
            <span className="text-lg font-bold text-white">Rs {price.toFixed(2)}</span>
          </div>
          <button
            onClick={() => handlePriceChange(1)}
            className="h-8 w-8 text-lg font-bold text-slate-300 hover:text-white flex items-center justify-center tap-active"
          >
            +
          </button>
        </div>
      </div>

      {/* Breakdown Card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F17] p-3.5 space-y-1.5 font-mono text-xs">
        <div className="flex justify-between text-slate-400">
          <span>{isNe ? 'सकल रकम (Turnover):' : 'Turnover:'}</span>
          <span className="text-white">Rs {turnover.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>{isNe ? 'ब्रोकर + सेबोन + DP शुल्क:' : 'Broker + SEBON + DP Fees:'}</span>
          <span className="text-slate-300">Rs {statutoryFees.toFixed(2)}</span>
        </div>
        {capitalGainsTax > 0 && (
          <div className="flex justify-between text-slate-400">
            <span>{isNe ? `पूँजीगत लाभकर (CGT ${(cgtRate * 100).toFixed(2)}%):` : `Capital Gains Tax (CGT ${(cgtRate * 100).toFixed(2)}%):`}</span>
            <span className="text-rose-400">Rs {capitalGainsTax.toFixed(2)}</span>
          </div>
        )}
        {orderSide === 'SELL' && (
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/[0.04]">
            <span className="text-[11px] text-slate-400">WACC / CGT:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={waccPrice}
                onChange={e => setWaccPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded bg-[#141A28] border border-white/[0.1] px-2 py-0.5 text-right text-xs text-white"
              />
              <select
                value={cgtRegime}
                onChange={e => setCgtRegime(e.target.value)}
                className="rounded bg-[#141A28] border border-white/[0.1] px-2 py-0.5 text-xs text-slate-300"
              >
                <option value="short">ST 5.0% (&le;365d)</option>
                <option value="long">LT 3.75% (&gt;365d)</option>
                <option value="corp">Corp 10.0%</option>
              </select>
            </div>
          </div>
        )}
        <div className="border-t border-white/[0.08] pt-2 flex justify-between items-baseline font-bold text-sm">
          <span className="text-white font-sans">{orderSide === 'BUY' ? (isNe ? 'कुल तिर्नुपर्ने रकम (Total):' : 'Total Payable:') : (isNe ? 'कुल प्राप्त हुने रकम (Net):' : 'Net Receivable:')}</span>
          <span className="text-sky-400 text-base font-extrabold">Rs {totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        className={`tap-active w-full py-4 rounded-2xl font-mono font-bold text-sm text-white shadow-lg transition-all ${
          orderSide === 'BUY'
            ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/25'
            : 'bg-rose-500 hover:bg-rose-400 shadow-rose-500/25'
        }`}
      >
        ⚡ {orderSide === 'BUY'
          ? (isNe ? 'अर्डर टिकट तयार गर्नुहोस् (PREPARE TICKET)' : 'CALCULATE & PREPARE BUY TICKET')
          : (isNe ? 'अर्डर टिकट तयार गर्नुहोस् (PREPARE TICKET)' : 'CALCULATE & PREPARE SELL TICKET')}
      </button>

      <div className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1.5 font-sans">
        <ShieldCheck size={14} className="text-sky-400" />
        <span>{isNe ? 'SEBON दर र दस्तुर गणना • ब्रोकर TMS अर्डर टिकट अनुमानक' : 'SEBON Statutory Calculation • Broker TMS Order Ticket Estimator'}</span>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md bg-[#111622] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-3xl shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
}

export default OrderExecution;
