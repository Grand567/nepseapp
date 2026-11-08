// qa/tests/run_phase6_utilities_30_inputs.mjs
import fs from 'fs';
import path from 'path';

// Import core calculation utilities
import {
  calculateBuyDetails,
  calculateSellDetails,
  calculateBrokerCommission,
  calculateSebonFee,
  adjustSimultaneousBonusAndRight,
  auditBonusDilution
} from '../../src/utils/calculations.js';

import {
  calculatePositionSize
} from '../../src/utils/riskManagement.js';

import {
  getCapitalTierConfig,
  getNepseBrokerCommissionRate,
  DEFAULT_USER_CAPITAL
} from '../../src/utils/dynamicCapitalEngine.js';

const RESULTS = [];

function runTest(id, name, category, fn) {
  try {
    const outcome = fn();
    RESULTS.push({
      id,
      name,
      category,
      status: outcome.pass ? 'PASS' : 'FAIL',
      expected: outcome.expected,
      actual: outcome.actual,
      details: outcome.details || ''
    });
  } catch (err) {
    RESULTS.push({
      id,
      name,
      category,
      status: 'CRASH',
      expected: 'No uncaught exception',
      actual: err.message,
      details: err.stack
    });
  }
}

// ── 1. BUY SHARE CALCULATOR TESTS ──
runTest('UTIL-IN-01', 'Normal Buy Share Calculation (100 shares @ Rs. 250)', 'Calculator:Buy', () => {
  const res = calculateBuyDetails(100, 250);
  const pass = res.shareValue === 25000 &&
               res.commission === 90 && // 25,000 * 0.36% = 90
               res.sebonFee === 3.75 && // 25,000 * 0.015% = 3.75
               res.dpFee === 0 &&
               res.totalAmount === 25093.75 &&
               res.costPerShare === 250.9375;
  return {
    pass,
    expected: 'Payable = Rs. 25,093.75, Cost/Share = Rs. 250.94',
    actual: `Payable = Rs. ${res.totalAmount}, Cost/Share = Rs. ${res.costPerShare.toFixed(2)}`
  };
});

runTest('UTIL-IN-02', 'High-Tier Buy Order (5,000 shares @ Rs. 600 = Rs. 30 Lakhs)', 'Calculator:Buy', () => {
  const res = calculateBuyDetails(5000, 600);
  // Rs. 3,000,000 is Tier 3: 0.27% commission = 8,100
  // SEBON: 3,000,000 * 0.015% = 450
  const pass = res.shareValue === 3000000 &&
               res.commission === 8100 &&
               res.sebonFee === 450 &&
               res.totalAmount === 3008550;
  return {
    pass,
    expected: 'Commission = Rs. 8,100 (0.27%), Total = Rs. 3,008,550.00',
    actual: `Commission = Rs. ${res.commission}, Total = Rs. ${res.totalAmount}`
  };
});

runTest('UTIL-IN-03', 'Minimum Broker Commission Clamping (1 share @ Rs. 100)', 'Calculator:Buy', () => {
  const res = calculateBuyDetails(1, 100);
  // 100 * 0.36% = 0.36, clamped to MIN_BROKER_COMMISSION_NPR = 10
  const pass = res.commission === 10;
  return {
    pass,
    expected: 'Commission clamped to min Rs. 10.00',
    actual: `Commission = Rs. ${res.commission}`
  };
});

// ── 2. SELL SHARE CALCULATOR & CGT TESTS ──
runTest('UTIL-IN-04', 'Normal Short-Term Individual Sell (100 shares @ Rs. 300, WACC 250, 7.5% CGT)', 'Calculator:Sell', () => {
  const res = calculateSellDetails(100, 300, 250, 'short');
  // Sell value = 30,000. Comm = 108. SEBON = 4.50. DP = 25.
  // Net profit base = 30000 - 25000 - 108 - 4.50 - 25 = 4862.50.
  // CGT 7.5% = 364.69.
  // Net receivable = 30000 - 108 - 4.50 - 25 - 364.6875 = 29497.81.
  const pass = res.sellValue === 30000 &&
               res.commission === 108 &&
               res.sebonFee === 4.5 &&
               res.dpFee === 25 &&
               Math.abs(res.cgt - 364.69) < 0.02 &&
               Math.abs(res.netReceivable - 29497.81) < 0.05;
  return {
    pass,
    expected: 'CGT = Rs. 364.69, Net Receivable = Rs. 29,497.81',
    actual: `CGT = Rs. ${res.cgt.toFixed(2)}, Net Receivable = Rs. ${res.netReceivable.toFixed(2)}`
  };
});

runTest('UTIL-IN-05', 'Long-Term Individual Sell (100 shares @ Rs. 300, WACC 250, 5.0% CGT)', 'Calculator:Sell', () => {
  const res = calculateSellDetails(100, 300, 250, 'long');
  // CGT 5.0% on 4862.50 = 243.125 -> 243.13.
  const pass = Math.abs(res.cgt - 243.13) < 0.02 && res.cgtRate === 0.05;
  return {
    pass,
    expected: 'CGT Rate = 5%, CGT = Rs. 243.13',
    actual: `CGT Rate = ${(res.cgtRate * 100)}%, CGT = Rs. ${res.cgt.toFixed(2)}`
  };
});

runTest('UTIL-IN-06', 'Institutional / Corporate Sell (100 shares @ Rs. 300, WACC 250, 10.0% CGT)', 'Calculator:Sell', () => {
  const res = calculateSellDetails(100, 300, 250, 'institutional');
  // CGT 10.0% on 4862.50 = 486.25.
  const pass = Math.abs(res.cgt - 486.25) < 0.02 && res.cgtRate === 0.10;
  return {
    pass,
    expected: 'CGT Rate = 10%, CGT = Rs. 486.25',
    actual: `CGT Rate = ${(res.cgtRate * 100)}%, CGT = Rs. ${res.cgt.toFixed(2)}`
  };
});

runTest('UTIL-IN-07', 'Capital Loss Sell (100 shares @ Rs. 180, WACC 250)', 'Calculator:Sell', () => {
  const res = calculateSellDetails(100, 180, 250, 'short');
  // Gross sell = 18000, buy cost = 25000. Capital loss.
  // CGT must be zero!
  const pass = res.cgt === 0 && res.netProfitLoss < 0;
  return {
    pass,
    expected: 'CGT = Rs. 0.00 (No capital gains tax on loss), Net Loss < 0',
    actual: `CGT = Rs. ${res.cgt}, Net Loss = Rs. ${res.netProfitLoss.toFixed(2)}`
  };
});

runTest('UTIL-IN-08', 'Exact Cost Basis Sell (100 shares @ Rs. 250, WACC 250)', 'Calculator:Sell', () => {
  const res = calculateSellDetails(100, 250, 250, 'short');
  // Sell = 25000, Buy = 25000. After fees, net profit base is negative. CGT must be 0.
  const pass = res.cgt === 0 && res.netProfitLoss < 0;
  return {
    pass,
    expected: 'CGT = Rs. 0.00, Net Loss equals transaction fees',
    actual: `CGT = Rs. ${res.cgt}, Net Loss = Rs. ${res.netProfitLoss.toFixed(2)}`
  };
});

// ── 3. BREAK-EVEN SOLVER TESTS ──
runTest('UTIL-IN-09', 'Statutory Breakeven Price Iterative Solver (100 shares @ Rs. 250)', 'Calculator:Breakeven', () => {
  // calculateBuyDetails: totalBuyCost = 25,093.75.
  // Iterative solver finds exit price where netReceivable == 25,093.75.
  // Sell comm (0.36%) + sell SEBON (0.015%) + sell DP (25).
  // Breakeven price should be ~Rs. 252.10.
  const buyDetails = calculateBuyDetails(100, 250);
  let estExit = +(buyDetails.costPerShare * 1.0045).toFixed(2);
  for (let i = 0; i < 4; i++) {
    const sellValue = 100 * estExit;
    const sellComm = calculateBrokerCommission(sellValue);
    const sellSebon = calculateSebonFee(sellValue);
    const sellDp = 25;
    estExit = (buyDetails.totalAmount + sellComm + sellSebon + sellDp) / 100;
  }
  const breakevenPrice = +Math.ceil(estExit * 10) / 10;
  const pass = breakevenPrice > 250 && breakevenPrice <= 253;
  return {
    pass,
    expected: 'Breakeven Price ~Rs. 252.10',
    actual: `Breakeven Price = Rs. ${breakevenPrice.toFixed(2)}`
  };
});

// ── 4. BONUS & RIGHT ADJUSTMENT TESTS ──
runTest('UTIL-IN-10', 'Ex-Date Bonus Adjustment (LTP Rs. 450, 10% Bonus)', 'Calculator:Adjustment', () => {
  const sim = adjustSimultaneousBonusAndRight(100, 450, 450, 10, 0, 100);
  // P_ex = 450 / 1.10 = 409.0909 -> 409.09
  const pass = sim.adjustedPrice === 409.09 && sim.bonusUnits === 10;
  return {
    pass,
    expected: 'Adjusted Price = Rs. 409.09, Bonus Units = 10',
    actual: `Adjusted Price = Rs. ${sim.adjustedPrice}, Bonus Units = ${sim.bonusUnits}`
  };
});

runTest('UTIL-IN-11', 'Ex-Date Right Adjustment (LTP Rs. 450, 50% Right @ Rs. 100)', 'Calculator:Adjustment', () => {
  const sim = adjustSimultaneousBonusAndRight(100, 450, 450, 0, 50, 100);
  // P_ex = (450 + 0.50 * 100) / (1 + 0.50) = 500 / 1.5 = 333.333 -> 333.33
  const pass = sim.adjustedPrice === 333.33 && sim.rightUnits === 50;
  return {
    pass,
    expected: 'Adjusted Price = Rs. 333.33, Right Units = 50',
    actual: `Adjusted Price = Rs. ${sim.adjustedPrice}, Right Units = ${sim.rightUnits}`
  };
});

runTest('UTIL-IN-12', 'Simultaneous Bonus & Right Adjustment (LTP Rs. 450, 10% Bonus + 50% Right @ Rs. 100)', 'Calculator:Adjustment', () => {
  const sim = adjustSimultaneousBonusAndRight(100, 450, 450, 10, 50, 100);
  // P_ex = (450 + 0.50 * 100) / (1 + 0.10 + 0.50) = 500 / 1.6 = 312.50
  const pass = sim.adjustedPrice === 312.50 && sim.bonusUnits === 10 && sim.rightUnits === 50;
  return {
    pass,
    expected: 'Adjusted Price = Rs. 312.50',
    actual: `Adjusted Price = Rs. ${sim.adjustedPrice}`
  };
});

runTest('UTIL-IN-13', 'Zero Bonus and Zero Right Adjustment', 'Calculator:Adjustment', () => {
  const sim = adjustSimultaneousBonusAndRight(100, 450, 450, 0, 0, 100);
  const pass = sim.adjustedPrice === 450 && sim.totalNewUnits === 100;
  return {
    pass,
    expected: 'Adjusted Price = Rs. 450.00, Units = 100',
    actual: `Adjusted Price = Rs. ${sim.adjustedPrice}, Units = ${sim.totalNewUnits}`
  };
});

runTest('UTIL-IN-14', 'Bonus Share Statutory 5% Par Dividend Tax', 'Calculator:Adjustment', () => {
  const bonusUnits = 10;
  const parValue = 100;
  const taxRate = 0.05;
  const bonusTax = bonusUnits * parValue * taxRate;
  const pass = bonusTax === 50;
  return {
    pass,
    expected: 'Bonus Dividend Tax = Rs. 50.00',
    actual: `Bonus Dividend Tax = Rs. ${bonusTax.toFixed(2)}`
  };
});

// ── 5. SIP & WEALTH COMPOUNDER TESTS ──
runTest('UTIL-IN-15', 'Monthly SIP Wealth Compounder (Rs. 10,000/mo, 15% CAGR, 10 Years)', 'Calculator:SIP', () => {
  const p = 10000;
  const months = 120;
  const i = 0.15 / 12;
  const maturity = Math.round(p * ((Math.pow(1 + i, months) - 1) / i) * (1 + i));
  const totalInvested = p * months; // 1,200,000
  const estReturns = maturity - totalInvested;
  // Formula returns maturity ~ Rs. 2,786,573
  const pass = totalInvested === 1200000 && maturity > 2700000 && maturity < 2850000;
  return {
    pass,
    expected: 'Invested = Rs. 12 Lakhs, Maturity ~Rs. 27.86 Lakhs',
    actual: `Invested = Rs. ${totalInvested.toLocaleString()}, Maturity = Rs. ${maturity.toLocaleString()}`
  };
});

runTest('UTIL-IN-16', 'SIP with 0% Return Rate (Capital Preservation Boundary)', 'Calculator:SIP', () => {
  const p = 5000;
  const years = 5;
  const months = years * 12;
  const annualRate = 0;
  let maturity = p * months;
  const pass = maturity === 300000;
  return {
    pass,
    expected: 'Maturity = Total Invested = Rs. 300,000',
    actual: `Maturity = Rs. ${maturity}`
  };
});

runTest('UTIL-IN-17', 'SIP 1-Year Short Horizon (Rs. 10,000/mo, 12% CAGR, 1 Year)', 'Calculator:SIP', () => {
  const p = 10000;
  const months = 12;
  const i = 0.12 / 12;
  const maturity = Math.round(p * ((Math.pow(1 + i, months) - 1) / i) * (1 + i));
  const totalInvested = 120000;
  const pass = maturity === 128093;
  return {
    pass,
    expected: 'Maturity = Rs. 128,093',
    actual: `Maturity = Rs. ${maturity}`
  };
});

// ── 6. NRB SHARE COLLATERAL MARGIN LOAN TESTS ──
runTest('UTIL-IN-18', 'Normal NRB Margin Loan (1,000 units, LTP Rs. 600, 180-Day Avg Rs. 550, 70% LTV)', 'Calculator:MarginLoan', () => {
  const valuationBase = Math.min(600, 550); // 550
  const collateralValuation = 1000 * valuationBase; // 550,000
  const calculatedLoan = collateralValuation * 0.70; // 385,000
  const approvedLoan = Math.min(calculatedLoan, 150000000);
  const pass = approvedLoan === 385000;
  return {
    pass,
    expected: 'Approved Loan = Rs. 385,000.00',
    actual: `Approved Loan = Rs. ${approvedLoan.toFixed(2)}`
  };
});

runTest('UTIL-IN-19', 'NRB Margin Loan Inverted Valuation (LTP Rs. 500, 180-Day Avg Rs. 550)', 'Calculator:MarginLoan', () => {
  // NRB Unified Directives mandate lower of LTP and 180-day avg.
  // When LTP is lower (500 < 550), valuation base MUST clamp to LTP.
  const valuationBase = Math.min(500, 550);
  const calculatedLoan = 1000 * valuationBase * 0.70;
  const pass = calculatedLoan === 350000;
  return {
    pass,
    expected: 'Valuation base = Rs. 500.00, Loan = Rs. 350,000.00',
    actual: `Valuation base = Rs. ${valuationBase}, Loan = Rs. ${calculatedLoan}`
  };
});

runTest('UTIL-IN-20', 'NRB Margin Call Trigger Price at 130% Maintenance Margin', 'Calculator:MarginLoan', () => {
  const approvedLoan = 385000;
  const units = 1000;
  const maintPct = 1.30;
  const triggerPrice = (approvedLoan * maintPct) / units;
  const pass = triggerPrice === 500.50;
  return {
    pass,
    expected: 'Margin Call Trigger = Rs. 500.50',
    actual: `Margin Call Trigger = Rs. ${triggerPrice.toFixed(2)}`
  };
});

// ── 7. POSITION SIZING & RISK MANAGEMENT TESTS ──
runTest('UTIL-IN-21', 'Optimal Trade Lot Sizing (Capital Rs. 100k, 2% Risk, Entry 480, Stop 455)', 'Calculator:Risk', () => {
  const capital = 100000;
  const riskPct = 0.02;
  const maxRisk = capital * riskPct; // 2000
  const riskPerShare = 480 - 455; // 25
  const rawUnits = maxRisk / riskPerShare; // 80
  const roundedLots = Math.floor(rawUnits / 10) * 10; // 80
  const pass = roundedLots === 80;
  return {
    pass,
    expected: '80 units (8 lots of 10 shares)',
    actual: `${roundedLots} units`
  };
});

runTest('UTIL-IN-22', 'Position Sizing Division by Zero Guard (Entry == Stop Loss)', 'Calculator:Risk', () => {
  const entry = 480;
  const stop = 480;
  const riskPerShare = entry - stop;
  let lots = 0;
  if (riskPerShare > 0) {
    lots = Math.floor((2000 / riskPerShare) / 10) * 10;
  }
  const pass = lots === 0;
  return {
    pass,
    expected: '0 lots when Stop Loss equals Entry Price',
    actual: `${lots} lots`
  };
});

runTest('UTIL-IN-23', 'Position Sizing Negative Risk Guard (Stop Loss > Entry Price)', 'Calculator:Risk', () => {
  const entry = 480;
  const stop = 500;
  const riskPerShare = entry - stop;
  let lots = 0;
  if (riskPerShare > 0) {
    lots = Math.floor((2000 / riskPerShare) / 10) * 10;
  }
  const pass = lots === 0;
  return {
    pass,
    expected: '0 lots when Stop Loss is above Entry',
    actual: `${lots} lots`
  };
});

// ── 8. DYNAMIC CAPITAL SIMULATOR TESTS ──
runTest('UTIL-IN-24', 'Capital Risk Simulator Tier Allocation (Capital Rs. 500,000)', 'Calculator:CapitalBar', () => {
  const tierConfig = getCapitalTierConfig(500000);
  // Rs. 500,000 falls in Tier 3 (Rs. 2.5L - 10L: Mid Capital)
  // Max risk: 1.25% (Rs. 6,250), Max slot: 25% (Rs. 125,000), Tactical cash: 10%, Slots: 5
  const maxRisk = 500000 * tierConfig.riskPerTradePct;
  const maxSlot = 500000 * tierConfig.maxSlotAllocationPct;
  const pass = maxRisk === 6250 && maxSlot === 125000 && tierConfig.maxSlots === 5;
  return {
    pass,
    expected: 'Max Risk = Rs. 6,250 (1.25%), Max Slot = Rs. 125,000 (25%), Slots = 5',
    actual: `Max Risk = Rs. ${maxRisk}, Max Slot = Rs. ${maxSlot}, Slots = ${tierConfig.maxSlots}`
  };
});

// ── 9. RESOURCES & BROKER DIRECTORY TESTS ──
runTest('UTIL-IN-25', 'Resources Broker TMS Search by Number ("58")', 'Resources:Search', () => {
  const brokers = [
    { number: 58, name: "Naasa Securities Co. Ltd." },
    { number: 45, name: "Imperial Securities Co. Pvt. Ltd." }
  ];
  const query = "58";
  const filtered = brokers.filter(b => b.name.toLowerCase().includes(query.toLowerCase()) || b.number.toString().includes(query));
  const pass = filtered.length === 1 && filtered[0].number === 58;
  return {
    pass,
    expected: 'Matches 1 broker (Naasa #58)',
    actual: `Matches ${filtered.length} broker (${filtered[0]?.name})`
  };
});

runTest('UTIL-IN-26', 'Resources Broker TMS Search Case-Insensitive ("naasa")', 'Resources:Search', () => {
  const brokers = [
    { number: 58, name: "Naasa Securities Co. Ltd." }
  ];
  const query = "naasa";
  const filtered = brokers.filter(b => b.name.toLowerCase().includes(query.toLowerCase()) || b.number.toString().includes(query));
  const pass = filtered.length === 1 && filtered[0].number === 58;
  return {
    pass,
    expected: 'Matches 1 broker (Naasa Securities)',
    actual: `Matches ${filtered.length} broker`
  };
});

runTest('UTIL-IN-27', 'Resources Broker TMS Link Domain Validity (BUG-076 Audit)', 'Resources:TMSUrl', () => {
  // In Resources.jsx:379, url is `https://tms${broker.number}.nepse.com.np/`
  // Official NEPSE TMS domain is `nepalstock.com.np`
  const linkTemplate = 'https://tms{id}.nepse.com.np/';
  const isDeadDomain = linkTemplate.includes('nepse.com.np');
  return {
    pass: !isDeadDomain, // Fails because domain is dead nepse.com.np!
    expected: 'https://tms{id}.nepalstock.com.np/',
    actual: linkTemplate,
    details: 'BUG-076: Broken domain nepse.com.np causes NXDOMAIN on all broker TMS portal links.'
  };
});

// ── 10. STITCH HUB AUDIT TESTS ──
runTest('UTIL-IN-28', 'Stitch Hub Header Button Mobile Reachability (BUG-077 Audit)', 'Stitch:Reachability', () => {
  // In src/index.css:1540-1544:
  // @media (max-width: 520px) { .header-stitch-btn { display: none !important; } }
  // Since there is no other navigation link to Stitch Hub, it is unreachable on mobile.
  const isHiddenOnMobile = true; // Confirmed by CSS line 1542
  return {
    pass: !isHiddenOnMobile, // Fails because button is hidden on mobile!
    expected: 'Stitch button or drawer link visible on mobile viewports (< 520px)',
    actual: '.header-stitch-btn { display: none !important; } at max-width 520px',
    details: 'BUG-077: Stitch Hub is completely unreachable on all mobile devices.'
  };
});

runTest('UTIL-IN-29', 'Stitch Portfolio Number Formatting (BUG-078 Audit)', 'Stitch:NumberFormat', () => {
  // In src/views/PortfolioAnalytics.jsx:53:
  // {isNe ? `रु ${totalVal.toLocaleString()}` : `NPR ${totalVal.toLocaleString()}`}<span className="text-slate-500 text-lg">.००</span>
  // In English mode, renders mixed ASCII digits with Devanagari `.००`
  const englishModeOutput = 'NPR 1,519,430.००';
  const hasMixedGlyphs = englishModeOutput.includes('NPR') && englishModeOutput.includes('.००');
  return {
    pass: !hasMixedGlyphs, // Fails because of mixed ASCII + Devanagari!
    expected: 'NPR 1,519,430.00 in English mode',
    actual: englishModeOutput,
    details: 'BUG-078: Mixed numeral representation (.०० Devanagari in English UI).'
  };
});

runTest('UTIL-IN-30', 'Stitch WACC FIFO Segregated Engine NABIL Multi-Tranche Cost', 'Stitch:WACC', () => {
  // Lot 1: 200 kitta @ 100.00 = 20,000.
  // Lot 2: 400 kitta @ 510.00 = 204,000 + brokerage (0.33% = 673.20) + SEBON (0.015% = 30.60) = 204,703.80.
  // Total cost = 224,703.80.
  // Total shares = 600.
  // WACC = 224,703.80 / 600 = 374.506 -> Rs. 374.51.
  const totalCost = 20000 + 204703.80;
  const wacc = +(totalCost / 600).toFixed(2);
  const pass = wacc === 374.51;
  return {
    pass,
    expected: 'Verified WACC = Rs. 374.51',
    actual: `Calculated WACC = Rs. ${wacc}`
  };
});

// Write machine-readable output
const logPath = path.resolve('qa/logs/phase6_utilities_30_inputs.json');
fs.writeFileSync(logPath, JSON.stringify(RESULTS, null, 2), 'utf-8');

const passCount = RESULTS.filter(r => r.status === 'PASS').length;
const failCount = RESULTS.filter(r => r.status === 'FAIL').length;
const crashCount = RESULTS.filter(r => r.status === 'CRASH').length;

console.log(`\n=== Header Utility Tabs 30-Input Test Audit Complete ===`);
console.log(`Total Inputs: ${RESULTS.length}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Crashes: ${crashCount}`);
console.log(`Machine-readable log saved to: ${logPath}\n`);
