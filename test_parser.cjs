const { JSDOM } = require('jsdom');

async function testGenericParser() {
  const html = require('fs').readFileSync('merolagani_nabil.html', 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const detail = {
      eps: 0, pe: 0, bookValue: 0, pbv: 0, dividend: 0, bonus: 0,
      marketCap: 0, sharesOutstanding: 0, listedShares: 0, paidUpCapital: 0,
      high52w: 0, low52w: 0, sector: 'Unknown'
  };

  const parseMoney = (str) => {
      if (!str) return NaN;
      return parseFloat(str.replace(/,/g, ''));
  };

  doc.querySelectorAll('table tr').forEach(tr => {
      const tds = tr.querySelectorAll('td, th');
      if (tds.length >= 2) {
        const label = tds[0].textContent.trim().toLowerCase();
        const valueStr = tds[1].textContent.trim();
        const val = parseMoney(valueStr);
        
        if (label.includes('sector')) detail.sector = valueStr;
        if (label.includes('shares outstanding') || label.includes('outstanding shares')) detail.sharesOutstanding = val;
        if (label.includes('market price') || label === 'ltp' || label.includes('last traded')) detail.marketPrice = val;
        if (label.includes('52') && label.includes('high')) {
           const parts = valueStr.split(/[-/]/);
           detail.high52w = parseMoney(parts[0]);
           if (parts.length > 1) detail.low52w = parseMoney(parts[1]);
        }
        if (label.includes('eps') || label.includes('earning per share')) detail.eps = val;
        if (label.includes('p/e') || label.includes('pe ratio') || label.includes('price earning')) detail.pe = val;
        if (label.includes('book value')) detail.bookValue = val;
        if (label === 'pbv' || label.includes('p/b') || label.includes('price to book')) detail.pbv = val;
        if (label.includes('% dividend') || (label.includes('dividend') && label.includes('%'))) detail.dividend = parseMoney(valueStr.replace('%',''));
        if (label.includes('% bonus') || (label.includes('bonus') && label.includes('%'))) detail.bonus = parseMoney(valueStr.replace('%',''));
        if (label.includes('market cap')) detail.marketCap = val;
        if (label.includes('company name') || label.includes('name of company')) detail.companyName = valueStr;
        if (label.includes('listed shares') || label.includes('total shares')) detail.listedShares = val;
        if (label.includes('paid up') || label.includes('paid-up')) detail.paidUpCapital = val;
      }
  });

  console.log(detail);
}

testGenericParser();
