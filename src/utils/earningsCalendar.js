/**
 * NEPSE Earnings Calendar & Reporting Season Utility
 *
 * SEBON mandates listed companies in Nepal to publish unaudited quarterly
 * reports within 30-35 days of quarter end:
 *   - Q1: Shrawan–Ashwin (Reports due: Kartik/Mangsir ~ Mid-Oct to Late-Nov)
 *   - Q2: Kartik–Poush (Reports due: Magh/Falgun ~ Mid-Jan to Late-Feb)
 *   - Q3: Magh–Chaitra (Reports due: Baisakh/Jestha ~ Mid-Apr to Late-May)
 *   - Q4 / Audited Annual: Baisakh–Ashad (Unaudited due Shrawan ~ Mid-Jul to Mid-Aug;
 *     audited annual reports & AGM dividend declarations roll out Bhadra–Poush ~ Aug–Dec).
 */

export function getCurrentEarningsCycle(date = new Date()) {
  const month = date.getMonth(); // 0 = Jan, 1 = Feb, ..., 11 = Dec
  const day = date.getDate();

  // Map Gregorian month to approximate NEPSE reporting cycle
  // Mid-Jan to Feb (months 0-1) => Q2 reports
  // Mid-Apr to May (months 3-4) => Q3 reports
  // Mid-Jul to Aug (months 6-7) => Q4 reports
  // Mid-Oct to Nov (months 9-10) => Q1 reports & AGM dividend season

  let cycle = null;

  if (month === 9 && day >= 15 || month === 10) {
    cycle = {
      quarter: 'Q1',
      title: 'Q1 Financial Earnings Season (Active)',
      nepaliMonths: 'Kartik / Mangsir',
      approxWindow: 'Mid-October – Late November',
      isActive: true,
      phase: 'active',
      riskLevel: 'HIGH_VOLATILITY',
      warning: 'Q1 quarterly financial reports are actively being released. Companies reporting earnings surprises or margin compressions experience sharp ±10% circuit moves.',
      guidance: 'Do not chase breakouts immediately before unreleased earnings. Cross-reference previous fiscal year profit trajectory.'
    };
  } else if (month === 0 && day >= 15 || month === 1) {
    cycle = {
      quarter: 'Q2',
      title: 'Q2 Half-Yearly Earnings Season (Active)',
      nepaliMonths: 'Magh / Falgun',
      approxWindow: 'Mid-January – Late February',
      isActive: true,
      phase: 'active',
      riskLevel: 'HIGH_VOLATILITY',
      warning: 'Q2 half-yearly financial results are actively being reported. Non-performing loan (NPL) shifts in banking & finance trigger rapid repricing.',
      guidance: 'Pay special attention to Net Interest Margin (NIM) and impairment charges for BFI scrips.'
    };
  } else if (month === 3 && day >= 15 || month === 4) {
    cycle = {
      quarter: 'Q3',
      title: 'Q3 9-Month Earnings Season (Active)',
      nepaliMonths: 'Baisakh / Jestha',
      approxWindow: 'Mid-April – Late May',
      isActive: true,
      phase: 'active',
      riskLevel: 'HIGH_VOLATILITY',
      warning: 'Q3 9-month reports provide the clearest preview of full-year dividend capacity. Hydropower scrips report dry-season run-of-river generation metrics.',
      guidance: 'Evaluate annualized EPS to project year-end bonus share capability.'
    };
  } else if (month === 6 && day >= 15 || month === 7) {
    cycle = {
      quarter: 'Q4',
      title: 'Q4 Unaudited Financials Season (Active)',
      nepaliMonths: 'Shrawan / Bhadra',
      approxWindow: 'Mid-July – Late August',
      isActive: true,
      phase: 'active',
      riskLevel: 'HIGH_VOLATILITY',
      warning: 'Full-year unaudited financial statements are being released. Initial dividend proposals and AGM notices begin rolling out.',
      guidance: 'Compare unaudited net profit with statutory reserve requirements for dividend payout headroom.'
    };
  } else if (month >= 8 && month <= 11) {
    cycle = {
      quarter: 'Annual AGM',
      title: 'Annual Audited Report & AGM Dividend Cycle',
      nepaliMonths: 'Ashwin – Poush',
      approxWindow: 'Late September – December',
      isActive: true,
      phase: 'dividend_cycle',
      riskLevel: 'MODERATE_VOLATILITY',
      warning: 'Peak season for audited financial balance sheets, AGM book closures, and dividend entitlement declarations.',
      guidance: 'Monitor Book Closure dates closely. NEPSE settles on T+2 basis.'
    };
  } else {
    cycle = {
      quarter: 'Consolidation',
      title: 'Inter-Quarterly Consolidation Window',
      nepaliMonths: 'Poush / Chaitra / Ashad',
      approxWindow: 'Between quarterly reporting cycles',
      isActive: false,
      phase: 'calm',
      riskLevel: 'NORMAL',
      warning: 'Market trades primarily on technical flow and systemic liquidity rather than direct earnings surprises.',
      guidance: 'Focus on technical setup geometry, sector rotation, and broker accumulation patterns.'
    };
  }

  return cycle;
}

/**
 * Returns a scrip-specific earnings status object
 */
export function getScripEarningsContext(symbol, sector = '', date = new Date()) {
  const cycle = getCurrentEarningsCycle(date);
  const sec = String(sector || '').toLowerCase();
  const isHydropower = sec.includes('hydro') || sec.includes('power');
  const isBank = sec.includes('bank') || sec.includes('finance') || sec.includes('microfinance');

  let sectorNote = '';
  if (isHydropower && (cycle.quarter === 'Q3' || cycle.quarter === 'Q4')) {
    sectorNote = 'Hydropower earnings in this cycle reflect dry-season base tariffs. Monsoon generation ramp-up occurs in Q1.';
  } else if (isBank && cycle.isActive) {
    sectorNote = 'NRB loan-loss provisioning requirements in this quarterly cycle directly impact distributable profits.';
  }

  return {
    symbol,
    sector,
    cycle,
    sectorNote,
    displayWarning: cycle.isActive
  };
}
