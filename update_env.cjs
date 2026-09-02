const fs = require('fs');
let code = fs.readFileSync('.env', 'utf-8');
code = code.replace(/VITE_PROXY_URL=.*/, 'VITE_PROXY_URL=https://2f49dc407c32c9.lhr.life');
fs.writeFileSync('.env', code);
console.log('Updated .env');
