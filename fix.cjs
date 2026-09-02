const fs = require('fs');
let text = fs.readFileSync('src/utils/liveData.js', 'utf-8');
text = text.replace(/'Bypass-Tunnel-Reminder': 'true'/g, "'Bypass-Tunnel-Reminder': 'true', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'");
fs.writeFileSync('src/utils/liveData.js', text);
console.log('Fixed caching');
