const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const s1 = code.indexOf(`const url = encodeURIComponent('https://www.sharesansar.com/market');`);
const s2 = code.indexOf(`const parser = new DOMParser();`);

if (s1 > -1 && s2 > -1) {
  code = code.substring(0, s1) + `const html = await fetchWithCorsProxy('https://www.sharesansar.com/market', 12000);\n      ` + code.substring(s2);
}

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed fetchMarketIndices');
