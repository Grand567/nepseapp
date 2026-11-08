// QA Phase 2 — targeted static pattern scan. READ-ONLY on src/. Output: qa/logs/phase2_patterns.json + summary on stdout
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p); } })(SRC);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const findings = {};
const hit = (cat, file, line, text) => { (findings[cat] ??= []).push({ loc: `${rel(file)}:${line}`, text: text.trim().slice(0, 180) }); };

for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  const lines = code.split('\n');
  const isUI = /src[\\/](components|views|pages)[\\/]/.test(f) || /App\.jsx$/.test(f);
  const count = (re) => (code.match(re) || []).length;

  // Timers / listeners without matching cleanup in same file
  const si = count(/setInterval\(/g), ci = count(/clearInterval\(/g);
  if (si > ci) hit('timer_setInterval_exceeds_clearInterval', f, 1, `setInterval x${si} vs clearInterval x${ci}`);
  const ae = count(/\.addEventListener\(/g), re = count(/\.removeEventListener\(/g);
  if (ae > re) hit('listener_add_exceeds_remove', f, 1, `addEventListener x${ae} vs removeEventListener x${re}`);
  const ws = count(/new WebSocket\(|new EventSource\(|onSnapshot\(/g), wsc = count(/\.close\(\)|unsubscribe|unsub\(/g);
  if (ws > 0 && wsc === 0) hit('socket_subscription_without_close', f, 1, `socket/subscription x${ws}, no close/unsubscribe`);

  // Effects with async fetch but no cancellation guard in file
  if (isUI && /useEffect\(/.test(code) && /(await\s+fetch|fetch[A-Z]\w*\()/.test(code) && !/(AbortController|cancelled|isMounted|mountedRef|ignore\s*=\s*true|alive\s*=\s*false|active\s*=\s*false|isActive|stale)/.test(code))
    hit('effect_fetch_without_unmount_or_race_guard', f, 1, 'useEffect + async fetch, no AbortController/cancelled/mounted guard found in file');

  lines.forEach((ln, i) => {
    const L = i + 1;
    if (/\bfetch\(/.test(ln) && !/AbortSignal|signal:|timeout/i.test(lines.slice(Math.max(0, i - 3), i + 6).join('\n'))) hit('raw_fetch_without_timeout_signal', f, L, ln);
    if (/\.then\(/.test(ln) && !/\.catch\(|try\s*\{/.test(lines.slice(i, i + 12).join('\n')) && !/await/.test(ln)) hit('promise_then_without_catch_nearby', f, L, ln);
    if (/(AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA )?PRIVATE KEY)/.test(ln)) hit('SECRET_hardcoded_key_pattern', f, L, ln.replace(/(AIza|sk-|ghp_)[0-9A-Za-z_\-]{6}[0-9A-Za-z_\-]+/g, '$1******'));
    if (/(api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{16,}['"]/i.test(ln)) hit('SECRET_hardcoded_credential_assignment', f, L, ln.replace(/(['"])[A-Za-z0-9_\-\.]{16,}\1/, "'******'"));
    if (/import\.meta\.env\.VITE_\w*(KEY|SECRET|TOKEN|PASSWORD)/i.test(ln)) hit('client_exposed_VITE_secret_env', f, L, ln);
    if (/console\.(log|debug|info)\(/.test(ln)) hit('console_log', f, L, ln);
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(ln)) hit('todo_fixme', f, L, ln);
    if (/new Date\(\)\.toISOString\(\)\.(slice|substring|split)\(/.test(ln) || /toISOString\(\)\.slice\(0,\s*10\)/.test(ln)) hit('date_UTC_slice_not_NPT', f, L, ln);
    if (/new Date\(\)\.get(Day|Hours|Date)\(\)/.test(ln)) hit('date_local_device_tz_not_NPT', f, L, ln);
    if (/dangerouslySetInnerHTML/.test(ln)) hit('xss_dangerouslySetInnerHTML', f, L, ln);
    if (/\beval\(|new Function\(/.test(ln)) hit('eval_or_new_Function', f, L, ln);
    if (isUI && /(localStorage|sessionStorage)\.(get|set|remove)Item/.test(ln) && !/try\s*\{/.test(lines.slice(Math.max(0, i - 4), i + 1).join('\n'))) hit('storage_access_without_try', f, L, ln);
    if (/JSON\.parse\(/.test(ln) && !/try\s*\{/.test(lines.slice(Math.max(0, i - 5), i + 1).join('\n')) && !/catch/.test(ln)) hit('JSON_parse_without_try', f, L, ln);
    if (isUI && /key=\{\s*(i|idx|index)\s*\}/.test(ln)) hit('list_key_array_index', f, L, ln);
    if (isUI && /key=\{\s*Math\.random\(\)/.test(ln)) hit('list_key_random_unstable', f, L, ln);
    if (/\.(push|splice|sort|reverse)\(/.test(ln) && /\b(stocks|props\.\w+|state\.\w+)\.(push|splice|sort|reverse)\(/.test(ln)) hit('possible_prop_or_state_mutation', f, L, ln);
    if (/\.toFixed\(\d\)/.test(ln) && /\/\s*\(?\s*[a-zA-Z_.]+\s*\)?\s*\)?\s*\.toFixed/.test(ln) && !/\|\|\s*1|>\s*0\s*\?|Math\.max\(1/.test(ln)) hit('division_toFixed_no_zero_guard', f, L, ln);
    if (/window\.open\(/.test(ln)) hit('window_open_native_webview', f, L, ln);
    if (/http:\/\/(localhost|127\.0\.0\.1)/.test(ln)) hit('hardcoded_localhost_url', f, L, ln);
    if (/http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)[a-z]/i.test(ln)) hit('cleartext_http_url', f, L, ln);
  });
}

// Error boundary coverage for services
const sh = fs.readFileSync(path.join(SRC, 'components', 'ServicesHub.tsx'), 'utf8');
const detailIdx = sh.indexOf('const Component = SERVICE_COMPONENTS[s.id]');
const detailSeg = sh.slice(detailIdx, detailIdx + 6000);
const svcBoundary = /<ErrorBoundary[\s\S]{0,400}<Component/.test(detailSeg);

// Next.js / server-only files living in a Vite SPA
const nextFiles = files.filter(f => /from ['"]next\//.test(fs.readFileSync(f, 'utf8'))).map(rel);
const nodeOnlyInSrc = files.filter(f => /from ['"](fs|path|better-sqlite3|child_process)['"]|require\(['"](fs|better-sqlite3)['"]\)/.test(fs.readFileSync(f, 'utf8'))).map(rel);

const summary = Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]));
fs.writeFileSync(path.join(ROOT, 'qa', 'logs', 'phase2_patterns.json'), JSON.stringify({ summary, servicesDetailWrappedInErrorBoundary: svcBoundary, nextjsFilesInViteSrc: nextFiles, nodeOnlyModulesInSrc: nodeOnlyInSrc, findings }, null, 2));
console.log(JSON.stringify({ filesScanned: files.length, summary, servicesDetailWrappedInErrorBoundary: svcBoundary, nextjsFilesInViteSrc: nextFiles, nodeOnlyModulesInSrc: nodeOnlyInSrc }, null, 1));
