const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

code = code.replace(
  "NEPSE Index <ChevronDown style={{ width: 16, height: 16, display: 'inline' }} />",
  "NEPSE Index"
);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Removed broken NEPSE Index chevron');
