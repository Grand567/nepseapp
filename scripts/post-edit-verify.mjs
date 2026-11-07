import fs from 'node:fs';
import { execSync } from 'node:child_process';

const payload = fs.readFileSync(0, 'utf-8');
let parsedPayload = {};
try { parsedPayload = JSON.parse(payload || '{}'); } catch {}

fs.appendFileSync('./agent-audit.jsonl', JSON.stringify({
  timestamp: new Date().toISOString(),
  event: 'PostToolUse',
  payload: parsedPayload
}) + '\n');

let errors = '';
const runCheck = (label, cmd) => {
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
  } catch (err) {
    errors += `[${label} Failed]:\n${err.stdout || ''}\n${err.stderr || ''}\n\n`;
  }
};

if (fs.existsSync('tsconfig.json')) {
  runCheck('TypeScript Compiler Audit', 'npx tsc --noEmit --pretty false');
}
if (fs.existsSync('.dependency-cruiser.cjs') && fs.existsSync('src')) {
  runCheck('Architecture Boundary Audit', 'npx depcruise src --config .dependency-cruiser.cjs');
}
if (fs.existsSync('package.json')) {
  const pkg = fs.readFileSync('package.json', 'utf-8');
  if (pkg.includes('"vitest"')) {
    runCheck('Unit Test Audit', 'npx vitest related --run --passWithNoTests');
  }
}

if (errors.trim().length > 0) {
  console.log(JSON.stringify({
    additionalContext: `POST-EDIT AUDIT FAILED. Fix these regressions immediately before continuing:\n${errors}`
  }));
  process.exit(0);
}

console.log(JSON.stringify({}));
