const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

code = code.replace(/const url = encodeURIComponent\('https:\/\/www\.sharesansar\.com\/market'\);\n\s*const res = await fetch\(`\${CORS_PROXY}\${url}`, { signal: AbortSignal.timeout\(12000\) }\);\n\s*if \(res.ok\) {\n\s*const html = await res.text\(\);/g, `const html = await fetchWithCorsProxy('https://www.sharesansar.com/market', 12000);
    if (html) {`);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed fetchMarketIndices perfectly');
