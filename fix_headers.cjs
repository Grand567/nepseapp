const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');
code = code.replace(/{ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }/g, "{ 'Bypass-Tunnel-Reminder': 'true', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }");
fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed headers');
