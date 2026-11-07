import fs from 'node:fs';

const payload = fs.readFileSync(0, 'utf-8');
const secretPatterns = [
  /AIza[0-9A-Za-z\-_]{35}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /BEGIN (RSA|OPENSSH|PRIVATE) KEY/,
  /(password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}["']/i
];

if (secretPatterns.some((regex) => regex.test(payload))) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: 'Security Audit Failed: Hardcoded secret or API key detected. Move credentials to environment variables (.env).'
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'allow' }));
