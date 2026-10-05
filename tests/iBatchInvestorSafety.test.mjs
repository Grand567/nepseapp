/**
 * I-BATCH: Investor Safety & Anti-Hallucination Invariant Tests
 * Tests fundamental data freshness, earnings calendar cycles,
 * and AI input guards.
 *
 * Run: node tests/iBatchInvestorSafety.test.mjs
 */

import { formatDataAgeLabel, calculateFundamentalSummary } from '../src/utils/fundamentals.js';
import { getCurrentEarningsCycle, getScripEarningsContext } from '../src/utils/earningsCalendar.js';
import { generateOfflineStockReport } from '../src/services/aiService.js';
import { buildAgentAnalysisPrompt } from '../proxy/agentTools.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS:', m); } else { fail++; console.error('  FAIL:', m); } };

console.log('\n[I1] Fundamental Data Freshness & Reporting Period');
ok(formatDataAgeLabel({ fiscalYear: '2080/81', quarter: 'Q3' }) === 'Q3 2080/81', 'Formats quarter + FY');
ok(formatDataAgeLabel({ fiscalYear: '2080/81' }) === 'FY 2080/81 (Annual)', 'Formats annual FY');
ok(formatDataAgeLabel({}) === 'Historic Audited Filing', 'Handles missing FY with safe fallback');

const dummyStock = {
  symbol: 'NABIL',
  sector: 'Commercial Banks',
  ltp: 450,
  eps: 25,
  bvps: 220,
  fiscalYear: '2080/81',
  quarter: 'Q4'
};
const summary = calculateFundamentalSummary(dummyStock);
ok(summary.reportingPeriod === 'Q4 2080/81', 'calculateFundamentalSummary passes reportingPeriod');
ok(summary.isHistoricFilings === true, 'Flags isHistoricFilings as true');

console.log('\n[I2] NEPSE Earnings Calendar & Season Cycles');
// Test October 20 => Q1 cycle active
const octDate = new Date(2026, 9, 20); // Month 9 = October
const octCycle = getCurrentEarningsCycle(octDate);
ok(octCycle.quarter === 'Q1', 'October maps to Q1 report cycle');
ok(octCycle.isActive === true, 'Q1 cycle is active in late October');
ok(octCycle.riskLevel === 'HIGH_VOLATILITY', 'Active earnings season marked as HIGH_VOLATILITY');

// Test January 25 => Q2 cycle active
const janDate = new Date(2026, 0, 25); // Month 0 = January
const janCycle = getCurrentEarningsCycle(janDate);
ok(janCycle.quarter === 'Q2', 'January maps to Q2 half-yearly cycle');

// Scrip earnings context for Bank
const bContext = getScripEarningsContext('NABIL', 'Commercial Banks', janDate);
ok(bContext.displayWarning === true, 'Earnings warning displayed during active season');
ok(bContext.sectorNote.includes('NRB loan-loss provisioning'), 'Includes BFI-specific earnings note');

// Scrip earnings context for Hydro
const hContext = getScripEarningsContext('CHCL', 'Hydropower', new Date(2026, 3, 20));
ok(hContext.sectorNote.includes('dry-season'), 'Includes Hydro dry-season generation tariff note');

console.log('\n[I3] AI Input Guarding & No-Fabrication Offline Report');
const emptyStock = { symbol: 'TEST', ltp: 0 };
const emptyReport = generateOfflineStockReport(emptyStock);
ok(emptyReport.includes('Data Insufficient'), 'Rejects scrip when LTP is missing/0');

const partialStock = {
  symbol: 'TEST2',
  ltp: 200,
  // Missing volume, eps, 52w range, sma
};
const partialReport = generateOfflineStockReport(partialStock);
ok(partialReport.includes('Data Completeness Notice'), 'Flags missing data in warning banner');
ok(!partialReport.includes('5000 shares'), 'Does NOT fabricate 5000 volume fallback');
ok(!partialReport.includes('Rs. 250.00') && !partialReport.includes('Rs. 150.00'), 'Does NOT fabricate 1.25x/0.75x 52-week prices');

console.log('\n[I4] Agent Prompt Anti-Hallucination Constraints');
const incompleteDossier = {
  symbol: 'INCOMPLETE',
  companyName: 'Incomplete Test Co',
  sector: 'Others',
  quote: { ltp: 100, pChange: 0, prevClose: 100, circuitFloor: 90, circuitCeiling: 110 },
  technicals: { rsi14: null, macd: null, ema20: null, ema50: null, trendStructure: 'Unknown' },
  brokerFlow: { available: false, smartMoneyBias: 'Neutral' },
  fundamentals: { pe: null, eps: null, bookValue: null },
  executionPlan: { available: false, reason: 'insufficient data' }
};

const guardedPrompt = buildAgentAnalysisPrompt(incompleteDossier);
ok(guardedPrompt.includes('DATA INTEGRITY MANDATE'), 'Injects mandatory data integrity constraint');
ok(guardedPrompt.includes('Cap "confidenceScore" at 45 maximum'), 'Caps confidenceScore at 45 max');
ok(guardedPrompt.includes('never "STRONG BUY"'), 'Strictly forbids STRONG BUY on incomplete data');
ok(guardedPrompt.includes('INCOMPLETE_DATA_WARNING'), 'Sets dataIntegrityNotice to warning');

console.log(`\nI-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
process.exit(fail ? 1 : 0);
