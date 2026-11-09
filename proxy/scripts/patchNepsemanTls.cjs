// proxy/scripts/patchNepsemanTls.cjs
// Removes global NODE_TLS_REJECT_UNAUTHORIZED="0" from third-party nepseman-api
// Ensures global TLS certificate verification remains active for AI, Firebase, Telegram, and GitHub.
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', 'node_modules', 'nepseman-api', 'dist', 'session.js'),
  path.join(__dirname, '..', '..', 'node_modules', 'nepseman-api', 'dist', 'session.js'),
];

for (const target of candidates) {
  if (fs.existsSync(target)) {
    let content = fs.readFileSync(target, 'utf8');
    if (content.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
      content = content.replace(
        /process\.env\[["']NODE_TLS_REJECT_UNAUTHORIZED["']\]\s*=\s*["']0["'];?/g,
        '// [OWASP Guard] Global TLS bypass removed. TLS verification stays enabled globally.'
      );
      fs.writeFileSync(target, content, 'utf8');
      console.log(`[OWASP Guard] Successfully patched ${target}`);
    }
  }
}
