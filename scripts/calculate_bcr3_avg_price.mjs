import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const symbols = ['SBI', 'HEI', 'SBL', 'MANDU', 'BHCL', 'GBBL', 'MBJC', 'JBBL', 'SIKLES'];

console.log('=== BCR3 AVERAGE BUYING PRICE & OPERATOR FLOOR AUDIT ===\n');

for (const sym of symbols) {
  // Get recent 10-session broker data
  const rows = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_vol, SUM(sell_vol) as sell_vol, SUM(buy_amt) as buy_amt, SUM(sell_amt) as sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date >= '2026-10-14'
    GROUP BY broker_id
    ORDER BY buy_vol DESC
  `).all(sym);

  const ltpRow = db.prepare(`SELECT close_price FROM daily_stock_summary WHERE symbol = ? AND trade_date = '2026-11-06'`).get(sym);
  const ltp = ltpRow ? Number(ltpRow.close_price) : 0;

  if (rows.length >= 3) {
    const top3 = rows.slice(0, 3);
    const top3BuyVol = top3.reduce((s, b) => s + Number(b.buy_vol), 0);
    const top3BuyAmt = top3.reduce((s, b) => s + Number(b.buy_amt), 0);
    const bcr3AvgBuyPrice = top3BuyVol > 0 ? +(top3BuyAmt / top3BuyVol).toFixed(1) : 0;

    // Lead broker
    const lead = top3[0];
    const leadAvgBuyPrice = Number(lead.buy_vol) > 0 ? +(Number(lead.buy_amt) / Number(lead.buy_vol)).toFixed(1) : 0;

    // Operator Premium over Cost Basis
    const operatorPremiumPct = bcr3AvgBuyPrice > 0 ? +(((ltp - bcr3AvgBuyPrice) / bcr3AvgBuyPrice) * 100).toFixed(1) : 0;

    console.log(`${sym}: Friday Close: Rs. ${ltp}`);
    console.log(`  • BCR3 Weighted Avg Buy Price: Rs. ${bcr3AvgBuyPrice} (Total Vol: ${top3BuyVol.toLocaleString()} kitta)`);
    console.log(`  • Operator Premium: ${operatorPremiumPct >= 0 ? '+' : ''}${operatorPremiumPct}% vs cost basis`);
    console.log(`  • Lead Broker #${lead.broker_id}: Avg Buy Price: Rs. ${leadAvgBuyPrice} (Net Vol: +${(lead.buy_vol - lead.sell_vol).toLocaleString()} kitta)`);
    console.log(`  • Assessment: ${Math.abs(operatorPremiumPct) <= 2.5 ? '🛡️ PERFECT: At Operator Cost Floor!' : operatorPremiumPct > 5.0 ? '⚠️ EXTENDED: Operator in profit' : '🟢 HEALTHY'}`);
    console.log('------------------------------------------------------');
  }
}
