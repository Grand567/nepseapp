// scripts/inspect_fundamentals_and_actions.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const studySymbols = ['GHL', 'MBJC', 'TAMOR', 'CFCL', 'LSL', 'DLBS', 'SABBL', 'SAIL', 'SINDU', 'ECL', 'SAPIL', 'SOPL', 'KHPL', 'SHPC'];

console.log('Querying Fundamentals & Corporate Actions for Super-Performers...\n');

for (const sym of studySymbols) {
  const fund = db.prepare('SELECT * FROM scrip_fundamentals WHERE symbol = ?').get(sym);
  const actions = db.prepare('SELECT * FROM scrip_corporate_actions WHERE symbol = ? ORDER BY book_close_date DESC').all(sym);

  console.log(`=== ${sym} ===`);
  if (fund) {
    console.log(`Sector: ${fund.sector || 'N/A'} | EPS TTM: Rs. ${fund.eps_ttm} | BVPS: Rs. ${fund.book_value_per_share} | Public Float: ${fund.public_float_kitta ? Number(fund.public_float_kitta).toLocaleString() : 'N/A'} kitta (${fund.public_share_pct}%) | Promoter Lock Expiry: ${fund.promoter_unlock_date || 'N/A'}`);
  } else {
    console.log('No fundamentals row found.');
  }

  if (actions && actions.length > 0) {
    console.log(`Corporate Actions (${actions.length}):`);
    actions.forEach(a => {
      console.log(`  - FY: ${a.fiscal_year} | Bonus: ${a.bonus_share_pct}% | Cash: ${a.cash_dividend_pct}% | Right: ${a.right_share_ratio || 'None'} | Book Close: ${a.book_close_date}`);
    });
  } else {
    console.log('No corporate actions found.');
  }
  console.log('');
}
