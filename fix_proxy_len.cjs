const fs = require('fs');
let code = fs.readFileSync('proxy/server.mjs', 'utf-8');
code = code.replace("postData.append('length', '90');", "postData.append('length', '100');");
fs.writeFileSync('proxy/server.mjs', code);
console.log('Fixed proxy history length to 100');
