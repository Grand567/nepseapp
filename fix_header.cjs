const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf-8');
code = code.replace(
  "padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px;",
  "padding: calc(env(safe-area-inset-top, 36px) + 14px) 18px 12px;"
);
fs.writeFileSync('src/index.css', code);
console.log('Fixed safe area padding in header-bar');
