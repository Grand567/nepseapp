const fs = require('fs');

fetch('https://merolagani.com/CompanyDetail.aspx?symbol=NABIL')
  .then(r => r.text())
  .then(html => {
    // Find PE Ratio
    let peMatch = html.match(/<th>PE Ratio<\/th>\s*<td>(.*?)<\/td>/i);
    let pbMatch = html.match(/<th>PB Ratio<\/th>\s*<td>(.*?)<\/td>/i);
    let epsMatch = html.match(/<th>EPS<\/th>\s*<td>(.*?)<\/td>/i);
    let bookMatch = html.match(/<th>Book Value<\/th>\s*<td>(.*?)<\/td>/i);
    let divMatch = html.match(/<th>Dividend Yield<\/th>\s*<td>(.*?)<\/td>/i);
    let roeMatch = html.match(/<th>ROE<\/th>\s*<td>(.*?)<\/td>/i);
    
    // Sometimes Merolagani uses different labels, let's extract the table rows
    const tbodyIndex = html.indexOf('<tbody', html.indexOf('Market Capitalization'));
    if (tbodyIndex !== -1) {
        console.log(html.substring(tbodyIndex, tbodyIndex + 2000).replace(/\s+/g, ' '));
    }
  });
