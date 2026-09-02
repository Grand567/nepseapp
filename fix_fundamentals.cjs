const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

// Fix P/B
code = code.replace(
  "{d.pb?.toFixed(2) || '0.00'}",
  "{d.pb ? d.pb.toFixed(2) : 'N/A'}"
);
// Fix Book Value
code = code.replace(
  "Rs.{d.bookValue || 0}",
  "{d.bookValue ? 'Rs.' + d.bookValue : 'N/A'}"
);
// Fix Dividend Yield and ROE (they show '%')
code = code.replace(
  "className=\"stat-box-value\">{d.divYield || ''}%",
  "className=\"stat-box-value\">{d.divYield ? d.divYield + '%' : 'N/A'}"
);
code = code.replace(
  "className=\"stat-box-value\">{d.roe || ''}%",
  "className=\"stat-box-value\">{d.roe ? d.roe + '%' : 'N/A'}"
);

// Also fix in the Fundamentals tab 
code = code.replace(
  "Rs. ${d.bookValue}",
  "${d.bookValue ? 'Rs. ' + d.bookValue : 'N/A'}"
);
code = code.replace(
  "Rs.{d.bookValue}",
  "{d.bookValue ? 'Rs.' + d.bookValue : 'N/A'}"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Fixed zero values in fundamentals');
