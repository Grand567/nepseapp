import fs from 'node:fs';

const payload = fs.readFileSync(0, 'utf-8');
const auditFile = './agent-audit.jsonl';
const now = Date.now();
const oneHourAgo = now - 60 * 60 * 1000;

if (fs.existsSync(auditFile)) {
  const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n').filter(Boolean);
  const recentCalls = lines.filter((line) => {
    try {
      const entry = JSON.parse(line);
      return new Date(entry.timestamp).getTime() > oneHourAgo;
    } catch {
      return false;
    }
  });

  if (recentCalls.length >= 500) {
    console.log(JSON.stringify({
      decision: 'deny',
      reason: 'Safety Budget Guard Triggered: Exceeded 500 tool calls in the last 60 minutes. Pause and review progress with the user.'
    }));
    process.exit(0);
  }
}

let parsedPayload = {};
try { parsedPayload = JSON.parse(payload || '{}'); } catch {}

fs.appendFileSync(auditFile, JSON.stringify({
  timestamp: new Date(now).toISOString(),
  event: 'PreToolUse',
  payload: parsedPayload
}) + '\n');

const forbidden = /(rm\s+-rf\s+\/|DROP\s+DATABASE|DROP\s+TABLE|git\s+push\s+--force|--no-verify)/i;
if (forbidden.test(payload)) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: 'Safety Gate Blocked: Destructive command or git hook bypass (--no-verify) is prohibited.'
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'allow' }));
