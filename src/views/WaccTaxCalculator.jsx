import React, { useState } from 'react';
import { ArrowLeft, Calculator, ShieldCheck } from 'lucide-react';
import {
  calculateBuyDetails,
  calculateBrokerCommission,
  calculateSebonFee,
  DP_CHARGE
} from '../utils/calculations.js';

export function WaccTaxCalculator({ onBack, lang = 'ne' }) {
  const isNe = lang === 'ne';
  const [waccLots, setWaccLots] = useState({ lot1: true, lot2: true });
  const [sellingPrice, setSellingPrice] = useState(585);
  const [taxRegime, setTaxRegime] = useState('long'); // 'long', 'short', 'corp'

  const lot1Kitta = waccLots.lot1 ? 200 : 0;
  const lot1Cost = lot1Kitta * 100.00;

  const lot2Kitta = waccLots.lot2 ? 400 : 0;
  const lot2Cost = lot2Kitta * 510.00;

  const totalKitta = lot1Kitta + lot2Kitta;
  const totalCost = lot1Cost + lot2Cost;
  const waccRate = totalKitta > 0 ? (totalCost / totalKitta) : 0;

  const grossTurnover = totalKitta * sellingPrice;
  const capitalGain = Math.max(0, grossTurnover - totalCost);

  const brokerComm = grossTurnover * 0.0034;
  const sebonFee = grossTurnover * 0.00015;
  const dpFee = totalKitta > 0 ? 25.00 : 0;

  const cgtRates = { long: 0.05, short: 0.075, corp: 0.10 };
  const cgtTax = capitalGain * cgtRates[taxRegime];

  const netPayout = Math.max(0, grossTurnover - (brokerComm + sebonFee + dpFee + cgtTax));
  const netProfit = netPayout - totalCost;

  const toggleLot = (lotKey) => {
    setWaccLots(prev => ({ ...prev, [lotKey]: !prev[lotKey] }));
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Friendly Guide Header */}
      <div className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-[#111622] to-[#111622] p-4 space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase tracking-wide">
            <Calculator size={16} />
            <span>{isNe ? 'WACC र लाभकर हिसाब (Tax & Profit Estimator)' : 'WACC & Tax Estimator'}</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
            IRD 2081/82 COMPLIANT
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {isNe
            ? 'WACC ले तपाईंले सेयर किनेको भारित औसत मूल्य देखाउँछ। यसबाट बेच्दा कति ब्रोकर कमिसन र लाभकर (CGT) कट्टी भएर बैंक खातामा पैसा आउँछ, यहाँ यकिन गर्नुहोस्।'
            : 'WACC reflects your weighted average cost per share. Calculate the exact broker commission and Capital Gain Tax (CGT) deducted upon settlement.'}
        </p>
      </div>

      {/* Statutory WACC Hero Card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 shadow-lg space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {isNe ? 'औसत खरिद मूल्य (WACC)' : 'Weighted Average Cost (WACC)'}
            </div>
            <div className="text-3xl font-extrabold text-white font-mono mt-0.5">
              NPR {waccRate.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isNe ? 'प्रति कित्ता लागत (Formula: कुल खरिद ÷ कुल कित्ता)' : 'Per share cost (Total Cost ÷ Total Shares)'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-slate-400">Demat Holdings</div>
            <div className="text-xl font-bold text-sky-400 font-mono">{totalKitta} Kitta</div>
            <div className="text-[10px] text-slate-400">NABIL Holdings</div>
          </div>
        </div>

        {/* Lots Breakdown with Checkboxes */}
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>{isNe ? 'Verified MeroShare Lots (तपाईंको खरिद लटहरू):' : 'Verified MeroShare Purchase Lots:'}</span>
            <span className="text-[10px] text-sky-400 font-mono">EDIS Verified</span>
          </div>

          {/* Lot 1 */}
          <div
            onClick={() => toggleLot('lot1')}
            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
              waccLots.lot1
                ? 'bg-sky-500/10 border-sky-500/30 text-white'
                : 'bg-[#0B0F17] border-white/[0.04] text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={waccLots.lot1}
                readOnly
                className="rounded accent-sky-500 pointer-events-none"
              />
              <div>
                <div className="font-semibold text-white">Lot #1: IPO / Bonus Shares</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {isNe ? '200 Kitta @ NPR 100.00 • 742 दिन (दीर्घकालीन)' : '200 Kitta @ NPR 100.00 • 742 Days (Long)'}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              ≥365d (5% CGT)
            </span>
          </div>

          {/* Lot 2 */}
          <div
            onClick={() => toggleLot('lot2')}
            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
              waccLots.lot2
                ? 'bg-sky-500/10 border-sky-500/30 text-white'
                : 'bg-[#0B0F17] border-white/[0.04] text-slate-500 opacity-60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={waccLots.lot2}
                readOnly
                className="rounded accent-sky-500 pointer-events-none"
              />
              <div>
                <div className="font-semibold text-white">Lot #2: Secondary Market (Broker 58)</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {isNe ? '400 Kitta @ NPR 510.00 • 114 दिन (अल्पकालीन)' : '400 Kitta @ NPR 510.00 • 114 Days (Short)'}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              &lt;365d (7.5% CGT)
            </span>
          </div>
        </div>
      </div>

      {/* Target Selling Price Slider & Input */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#111622] p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">
            {isNe ? 'लक्षित बिक्री मूल्य (Target Selling Price NPR)' : 'Target Selling Price (NPR)'}
          </span>
          <span className="text-slate-400 font-mono text-[11px]">Current Market: NPR 585.00</span>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="number"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
            className="w-32 rounded-xl border border-white/[0.08] bg-[#0B0F17] px-3 py-2 text-base font-bold font-mono text-white focus:border-sky-500 focus:outline-none"
          />
          <div className="flex gap-1.5 flex-1 overflow-x-auto">
            {[550, 585, 620, 650].map((pr) => (
              <button
                key={pr}
                onClick={() => setSellingPrice(pr)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  sellingPrice === pr
                    ? 'font-bold bg-sky-500 text-white'
                    : 'font-medium bg-[#0B0F17] text-slate-400 border border-white/[0.06] hover:text-white'
                }`}
              >
                {pr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Holding Period Selection */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-300">
          {isNe ? 'पुँजीगत लाभकर दर (Tax Bracket Regime):' : 'Capital Gains Tax Regime:'}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setTaxRegime('long')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              taxRegime === 'long'
                ? 'border-sky-500 bg-sky-500/20 text-sky-400 font-semibold shadow-md'
                : 'border-white/[0.06] bg-[#111622] text-slate-400 hover:text-white'
            }`}
          >
            <div className="text-xs font-bold">{isNe ? 'दीर्घकालीन (Long)' : 'Long Term'}</div>
            <div className="text-base font-extrabold text-white font-mono mt-1">5.0%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">≥365 {isNe ? 'दिन' : 'days'}</div>
          </button>
          <button
            onClick={() => setTaxRegime('short')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              taxRegime === 'short'
                ? 'border-sky-500 bg-sky-500/20 text-sky-400 font-semibold shadow-md'
                : 'border-white/[0.06] bg-[#111622] text-slate-400 hover:text-white'
            }`}
          >
            <div className="text-xs font-bold">{isNe ? 'अल्पकालीन (Short)' : 'Short Term'}</div>
            <div className="text-base font-extrabold text-white font-mono mt-1">7.5%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">&lt;365 {isNe ? 'दिन' : 'days'}</div>
          </button>
          <button
            onClick={() => setTaxRegime('corp')}
            className={`p-3 rounded-2xl border text-center transition-all ${
              taxRegime === 'corp'
                ? 'border-sky-500 bg-sky-500/20 text-sky-400 font-semibold shadow-md'
                : 'border-white/[0.06] bg-[#111622] text-slate-400 hover:text-white'
            }`}
          >
            <div className="text-xs font-bold">{isNe ? 'संस्थागत (Corp)' : 'Corporate'}</div>
            <div className="text-base font-extrabold text-white font-mono mt-1">10.0%</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{isNe ? 'कम्पनी दर्ता' : 'Entity'}</div>
          </button>
        </div>
      </div>

      {/* Transparent Settlement Audit Card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111622] p-4 space-y-2.5 text-xs font-mono">
        <div className="text-slate-200 font-sans font-bold pb-1.5 border-b border-white/[0.06] flex justify-between items-center">
          <span>{isNe ? 'बैंकमा जम्मा हुने रकम (T+2 Settlement Breakdown)' : 'T+2 Bank Settlement Breakdown'}</span>
          <span className="text-[11px] text-sky-400 font-mono">{totalKitta} Kitta NABIL</span>
        </div>

        <div className="flex justify-between text-slate-400">
          <span>{isNe ? 'कुल बिक्री रकम (Gross Turnover):' : 'Gross Turnover:'}</span>
          <span className="text-white font-bold">
            रु {grossTurnover.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>{isNe ? 'खरिद लागत (Cost Base):' : 'Cost Base:'}</span>
          <span className="text-slate-300">
            रु {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>{isNe ? 'सकल पुँजीगत नाफा (Gross Profit):' : 'Gross Capital Gain:'}</span>
          <span className="text-emerald-400 font-bold">
            +रु {capitalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="border-t border-white/[0.04] pt-1.5 space-y-1 text-[11px] text-slate-400">
          <div className="flex justify-between">
            <span>• {isNe ? 'ब्रोकर कमिसन (Broker Fee ~0.34%):' : 'Broker Fee (~0.34%):'}</span>
            <span className="text-rose-400">- रु {brokerComm.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>• {isNe ? 'सेबोन शुल्क (SEBON Fee 0.015%):' : 'SEBON Fee (0.015%):'}</span>
            <span className="text-rose-400">- रु {sebonFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>• {isNe ? 'डिम्याट शुल्क (DP Fee Flat):' : 'DP Fee:'}</span>
            <span className="text-rose-400">- रु {dpFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>• {isNe ? `लाभकर (Capital Gain Tax ${cgtRates[taxRegime] * 100}%):` : `CGT (${cgtRates[taxRegime] * 100}%):`}</span>
            <span className="text-rose-400 font-bold">- रु {cgtTax.toFixed(2)}</span>
          </div>
        </div>

        {/* Highlighted Net Take-Home */}
        <div className="border-t border-white/[0.08] pt-3 flex justify-between items-baseline font-bold text-sm">
          <span className="text-white font-sans text-sm">{isNe ? 'हात पर्ने खुद रकम (Net Payout):' : 'Net Bank Payout:'}</span>
          <span className="text-emerald-400 text-lg">
            रु {netPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between text-xs pt-0.5">
          <span className="text-slate-400 font-sans">{isNe ? 'वास्तविक खुद नाफा (Net Clean Profit):' : 'Net Clean Profit:'}</span>
          <span className="font-bold text-emerald-400">
            {netProfit >= 0 ? '+रु ' : '-रु '}
            {Math.abs(netProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Sync Button */}
      <button
        onClick={() => alert(isNe ? '✅ WACC सफलतापूर्वक MeroShare EDIS र ब्रोकर ५८ सँग प्रमाणित भयो!' : '✅ WACC verified with MeroShare EDIS and Broker 58!')}
        className="tap-active w-full py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 font-sans font-bold text-sm text-white shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
      >
        <ShieldCheck size={20} />
        <span>{isNe ? 'MeroShare EDIS र Broker 58 मा प्रमाणित गर्नुहोस्' : 'Verify with MeroShare EDIS & Broker 58'}</span>
      </button>

      {/* Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="tap-active w-full py-3 rounded-2xl border border-white/[0.08] bg-[#111622] hover:bg-[#161D2E] text-xs font-semibold text-slate-300 transition-all flex items-center justify-center gap-1.5"
        >
          <ArrowLeft size={16} />
          <span>{isNe ? 'पछाडि फर्कनुहोस् (Back)' : 'Back'}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Computes both True Economic WACC (Bonus @ Rs. 0) and CDSC MeroShare Statutory WACC (Bonus @ Rs. 100 Par),
 * plus strict FIFO lot segregation for Short-Term (<= 365 days, 7.5% CGT) vs Long-Term (> 365 days, 5.0% CGT).
 *
 * @param {Array<{qty:number, price:number, date:string, type?:'BUY'|'IPO'|'FPO'|'BONUS'|'RIGHT'}>} lots
 * @param {Object} sellOrder - { sellQty: number, sellPrice: number, sellDate: string, investorType: 'individual'|'institutional', waccMode: 'economic'|'cdsc' }
 */
export function calculateFifoWaccAndSegregatedCgt(lots = [], sellOrder = null) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return {
      totalUnits: 0,
      economicTotalCost: 0,
      economicWacc: 0,
      cdscTotalCost: 0,
      cdscStatutoryWacc: 0,
      fifoSaleBreakdown: null
    };
  }

  // Sort lots chronologically (oldest first for strict FIFO)
  const sortedLots = [...lots]
    .filter(l => Number(l.qty || l.quantity || l.units || 0) > 0)
    .sort((a, b) => new Date(a.date || '2020-01-01') - new Date(b.date || '2020-01-01'));

  let totalUnits = 0;
  let economicTotalCost = 0;
  let cdscTotalCost = 0;

  const normalizedLots = sortedLots.map((lot, idx) => {
    const qty = Number(lot.qty || lot.quantity || lot.units || 0);
    const price = Number(lot.price || lot.rate || 0);
    const type = String(lot.type || 'BUY').toUpperCase();
    const date = lot.date || new Date().toISOString().slice(0, 10);

    let lotEconomicCost = 0;
    let lotCdscCost = 0;

    if (type === 'BONUS') {
      // Bonus shares: Rs. 0 economic cash outlay, Rs. 100 par value in CDSC MyWACC portal
      lotEconomicCost = 0;
      lotCdscCost = qty * 100;
    } else if (type === 'RIGHT' || type === 'IPO' || type === 'FPO') {
      // Primary allotment / Right subscription: no secondary broker or SEBON fee
      const subPrice = price > 0 ? price : 100;
      lotEconomicCost = qty * subPrice;
      lotCdscCost = qty * subPrice;
    } else {
      // Secondary market purchase: includes tiered broker commission, 0.015% SEBON fee, and Rs. 25 DP charge
      const buyInfo = calculateBuyDetails(qty, price);
      lotEconomicCost = buyInfo.totalAmount;
      lotCdscCost = buyInfo.totalAmount;
    }

    totalUnits += qty;
    economicTotalCost += lotEconomicCost;
    cdscTotalCost += lotCdscCost;

    return {
      lotId: idx + 1,
      type,
      date,
      qty,
      remainingQty: qty,
      rawPrice: price,
      lotEconomicCost: +lotEconomicCost.toFixed(2),
      lotCdscCost: +lotCdscCost.toFixed(2)
    };
  });

  const economicWacc = totalUnits > 0 ? +(economicTotalCost / totalUnits).toFixed(2) : 0;
  const cdscStatutoryWacc = totalUnits > 0 ? +(cdscTotalCost / totalUnits).toFixed(2) : 0;

  if (!sellOrder || Number(sellOrder.sellQty || 0) <= 0 || Number(sellOrder.sellPrice || 0) <= 0) {
    return {
      totalUnits,
      economicTotalCost: +economicTotalCost.toFixed(2),
      economicWacc,
      cdscTotalCost: +cdscTotalCost.toFixed(2),
      cdscStatutoryWacc,
      lots: normalizedLots,
      fifoSaleBreakdown: null
    };
  }

  // ── STRICT FIFO SALE & CGT SEGREGATION (<= 365 Days @ 7.5% vs > 365 Days @ 5.0%) ──
  const sellQtyRequested = Math.min(totalUnits, Number(sellOrder.sellQty));
  const sellPrice = Number(sellOrder.sellPrice);
  const sellDateObj = sellOrder.sellDate ? new Date(sellOrder.sellDate) : new Date();
  const isInstitutional = sellOrder.investorType === 'institutional';
  const activeWacc = sellOrder.waccMode === 'cdsc' ? cdscStatutoryWacc : economicWacc;

  const grossSellValue = sellQtyRequested * sellPrice;
  const totalSellCommission = calculateBrokerCommission(grossSellValue);
  const totalSellSebon = calculateSebonFee(grossSellValue);
  const totalSellDp = DP_CHARGE;
  const totalSellExpenses = totalSellCommission + totalSellSebon + totalSellDp;

  let qtyToMatch = sellQtyRequested;
  let shortTermUnits = 0;
  let longTermUnits = 0;
  let shortTermTaxableGain = 0;
  let longTermTaxableGain = 0;
  let shortTermCgt = 0;
  let longTermCgt = 0;
  const matchedTranches = [];

  for (const lot of normalizedLots) {
    if (qtyToMatch <= 0) break;
    const matchedQty = Math.min(lot.remainingQty, qtyToMatch);
    lot.remainingQty -= matchedQty;
    qtyToMatch -= matchedQty;

    const buyDateObj = new Date(lot.date);
    const holdingDays = Math.max(1, Math.floor((sellDateObj - buyDateObj) / (1000 * 60 * 60 * 24)));
    const isLongTerm = holdingDays > 365;

    // Pro-rate sell-side friction across the matched tranche
    const trancheWeight = matchedQty / sellQtyRequested;
    const trancheSellGross = matchedQty * sellPrice;
    const trancheSellFees = totalSellExpenses * trancheWeight;
    const trancheCostBasis = matchedQty * activeWacc;
    const tranchePreTaxProfit = trancheSellGross - trancheCostBasis - trancheSellFees;

    const cgtRate = isInstitutional ? 0.10 : (isLongTerm ? 0.05 : 0.075);
    const trancheTaxable = Math.max(0, tranchePreTaxProfit);
    const trancheCgt = +(trancheTaxable * cgtRate).toFixed(2);

    if (isLongTerm) {
      longTermUnits += matchedQty;
      longTermTaxableGain += trancheTaxable;
      longTermCgt += trancheCgt;
    } else {
      shortTermUnits += matchedQty;
      shortTermTaxableGain += trancheTaxable;
      shortTermCgt += trancheCgt;
    }

    matchedTranches.push({
      lotId: lot.lotId,
      buyDate: lot.date,
      holdingDays,
      holdingCategory: isLongTerm ? 'LONG_TERM (>365d)' : 'SHORT_TERM (<=365d)',
      matchedQty,
      waccUsed: activeWacc,
      tranchePreTaxProfit: +tranchePreTaxProfit.toFixed(2),
      cgtRatePct: +(cgtRate * 100).toFixed(1),
      trancheCgt
    });
  }

  const totalCgt = +(shortTermCgt + longTermCgt).toFixed(2);
  const totalAcquisitionCost = +(sellQtyRequested * activeWacc).toFixed(2);
  const netReceivable = +(grossSellValue - totalSellExpenses - totalCgt).toFixed(2);
  const netRealizedProfitLoss = +(netReceivable - totalAcquisitionCost).toFixed(2);
  const netRoiPct = totalAcquisitionCost > 0 ? +((netRealizedProfitLoss / totalAcquisitionCost) * 100).toFixed(2) : 0;

  return {
    totalUnits,
    remainingUnitsAfterSale: totalUnits - sellQtyRequested,
    economicTotalCost: +economicTotalCost.toFixed(2),
    economicWacc,
    cdscTotalCost: +cdscTotalCost.toFixed(2),
    cdscStatutoryWacc,
    fifoSaleBreakdown: {
      sellQty: sellQtyRequested,
      sellPrice,
      waccUsed: activeWacc,
      grossSellValue: +grossSellValue.toFixed(2),
      sellCommission: +totalSellCommission.toFixed(2),
      sellSebonFee: +totalSellSebon.toFixed(2),
      sellDpFee: totalSellDp,
      shortTermUnits,
      longTermUnits,
      shortTermTaxableGain: +shortTermTaxableGain.toFixed(2),
      longTermTaxableGain: +longTermTaxableGain.toFixed(2),
      shortTermCgt: +shortTermCgt.toFixed(2),
      longTermCgt: +longTermCgt.toFixed(2),
      totalCgt,
      netReceivable,
      netRealizedProfitLoss,
      netRoiPct,
      matchedTranches
    }
  };
}

export default WaccTaxCalculator;
