import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Zap, X } from 'lucide-react';
import { calculateBrokerCommission, calculateSebonFee } from '../utils/calculations';

export function OrderExecution({
  symbol = 'NABIL',
  defaultPrice = 585.00,
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
  const [price, setPrice] = useState(defaultPrice);
  const [submittedMessage, setSubmittedMessage] = useState('');

  const turnover = kitta * price;
  const brokerComm = calculateBrokerCommission(turnover);
  const sebonFee = calculateSebonFee(turnover);
  const dpFee = 25.00;
  // Compute CGT (Capital Gains Tax) for sell orders if profitable over default purchase price
  const estimatedCostBasis = defaultPrice > 0 ? (kitta * defaultPrice) : turnover;
  const grossProfit = Math.max(0, turnover - estimatedCostBasis);
  const capitalGainsTax = orderSide === 'SELL' && grossProfit > 0 ? Number((grossProfit * 0.075).toFixed(2)) : 0;
  const statutoryFees = brokerComm + sebonFee + dpFee;
  const totalFees = statutoryFees + capitalGainsTax;
  const totalPayable = orderSide === 'BUY' ? (turnover + totalFees) : Math.max(0, turnover - totalFees);

  const handleKittaChange = (delta) => {
    setKitta(prev => Math.max(10, prev + delta));
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
    setTimeout(() => {
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
            TMS Broker 58
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
            <span>{isNe ? 'पूँजीगत लाभकर (CGT 7.5%):' : 'Capital Gains Tax (CGT 7.5%):'}</span>
            <span className="text-rose-400">Rs {capitalGainsTax.toFixed(2)}</span>
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
          ? (isNe ? 'CONFIRM & SUBMIT BUY ORDER' : 'CONFIRM & SUBMIT BUY ORDER')
          : (isNe ? 'CONFIRM & SUBMIT SELL ORDER' : 'CONFIRM & SUBMIT SELL ORDER')}
      </button>

      <div className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1.5 font-sans">
        <ShieldCheck size={14} className="text-sky-400" />
        <span>{isNe ? 'SEBON स्वीकृत • सुरक्षित NEPSE NOTS इन्जिन जडान' : 'SEBON Authorized • Direct NEPSE NOTS Gateway'}</span>
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
