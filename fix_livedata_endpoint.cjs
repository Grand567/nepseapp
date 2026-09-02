const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf8');

// Use the working MeroLagani endpoint!
code = code.replace(
  /\$\{base\}\/api\/market-summary/g, 
  '${base}/api/mero/market-summary'
);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed liveData endpoint');
