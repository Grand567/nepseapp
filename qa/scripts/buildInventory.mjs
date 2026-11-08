// QA Phase 1 — Code-derived inventory generator. READ-ONLY on src/. Writes qa/app_inventory.{json,md}
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const EXT = ['.tsx', '.ts', '.jsx', '.js'];

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(fromFile), spec);
  const cands = [base, ...EXT.map(e => base + e), ...EXT.map(e => path.join(base, 'index' + e))];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

const fileCache = new Map();
function analyze(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  const code = read(file);
  const imports = {}; // localName -> {file, spec}
  const re = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const [, clause, spec] = m;
    const target = resolveImport(file, spec);
    const names = [];
    const def = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (def && !clause.trim().startsWith('{') && !clause.trim().startsWith('*')) names.push(def[1]);
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) braces[1].split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
      const parts = s.replace(/^type\s+/, '').split(/\s+as\s+/); names.push((parts[1] || parts[0]).trim());
    });
    names.forEach(n => { imports[n] = { file: target, spec }; });
  }
  // React.lazy imports
  const lazyRe = /const\s+([A-Z]\w*)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = lazyRe.exec(code))) imports[m[1]] = { file: resolveImport(file, m[2]), spec: m[2], lazy: true };

  const jsxUsed = new Set([...code.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map(x => x[1]));
  const childComponents = [...jsxUsed]
    .filter(n => imports[n]?.file && /src[\\/](components|views)[\\/]/.test(imports[n].file))
    .map(n => ({ name: n, file: rel(imports[n].file) }));
  const dataDeps = Object.entries(imports)
    .filter(([, v]) => v.file && /src[\\/](utils|services|hooks|context|data|api|lib)[\\/]/.test(v.file))
    .filter(([n]) => /^(use|fetch|get|load|compute|calc|build|analy|run|subscribe|query|score|NEPSE_|VERIFIED_)/i.test(n))
    .map(([n, v]) => `${n} (${rel(v.file)})`);
  const actions = [];
  if (/onClick=/.test(code)) actions.push('tap');
  if (/type=["']search["']|[Ss]earch(Query|Term|Text)|placeholder=["'][^"']*[Ss]earch/.test(code)) actions.push('search');
  if (/[Ff]ilter/.test(code) && /onClick=|onChange=/.test(code)) actions.push('filter');
  if (/[Rr]efresh|reload|onRefresh/.test(code)) actions.push('refresh');
  if (/<input|<textarea|<select/.test(code)) actions.push('input');
  if (/[Ss]ort(By|Key|Dir|Order)/.test(code)) actions.push('sort');
  const definedLocal = new Set([...code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:React\.)?(?:memo\()?\s*(?:\([^)]*\)|[a-z]\w*)\s*=>)/g)].map(x => x[1] || x[2]));
  const localComponents = [...definedLocal].filter(n => jsxUsed.has(n));
  const info = { file: rel(file), childComponents, localComponents, dataDeps: [...new Set(dataDeps)], actions, loc: code.split('\n').length };
  fileCache.set(file, info);
  return info;
}

const items = [];
const add = (it) => { items.push(it); return it; };
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();

function addComponentTree(parentId, comp, level, maxLevel, tabKey, seen) {
  const abs = path.join(ROOT, comp.file);
  const a = analyze(abs);
  const id = `${parentId}.${slug(comp.name)}`;
  if (items.find(i => i.id === id)) return;
  add({ id, type: level === 1 ? 'card' : 'sub-card', tab: tabKey, parent: parentId, name: comp.name, sourceFile: comp.file, dataDeps: a.dataDeps, actions: a.actions });
  if (level >= maxLevel) return;
  for (const lc of a.localComponents || []) {
    const lid = `${id}.${slug(lc)}`;
    if (!items.find(i => i.id === lid)) add({ id: lid, type: 'sub-card', tab: tabKey, parent: id, name: `${lc} (inline in ${path.basename(comp.file)})`, sourceFile: comp.file, dataDeps: [], actions: a.actions });
  }
  for (const c of a.childComponents) {
    if (seen.has(c.file)) continue;
    addComponentTree(id, c, level + 1, maxLevel, tabKey, new Set([...seen, c.file]));
  }
}

function addInlineSubTabs(parentId, tabKey, file, regex, label) {
  const code = read(path.join(ROOT, file));
  for (const m of code.matchAll(regex)) {
    add({ id: `${parentId}.subtab_${slug(m[1])}`, type: 'sub-tab', tab: tabKey, parent: parentId, name: `${label}: ${m[2]}`, sourceFile: file, dataDeps: [], actions: ['tap'] });
  }
}

// ── Root tabs (state-based navigation, App.jsx bottom nav + header) ──
const app = path.join(SRC, 'App.jsx');
const appInfo = analyze(app);
const ROOT_TABS = [
  { key: 'market', activeTab: 'dashboard', name: 'Market (Dashboard)', comp: 'Dashboard' },
  { key: 'portfolio_ipo', activeTab: 'portfolio|bulk_ipo|simulator', name: 'Portfolio & IPO', comp: 'PortfolioHub' },
  { key: 'predictor', activeTab: 'predictor|entry_exit|short_term_plan|master_100_profit', name: 'Predictor', comp: 'PredictorHub' },
  { key: 'services', activeTab: 'services', name: 'Service Hub', comp: 'ServicesHub' },
  { key: 'guru_ai', activeTab: 'ai', name: 'Guru AI', comp: 'AiAnalyst' },
  { key: 'stocks', activeTab: '(modal overlay: selectedStock)', name: 'Stocks (Stock Detail Modal, 13 tabs)', comp: 'StockDetailModal' },
  { key: 'calculator', activeTab: 'calculator', name: 'Calculator (header/hidden route)', comp: 'Calculator' },
  { key: 'resources', activeTab: 'resources', name: 'Resources (header icon)', comp: 'Resources' },
  { key: 'stitch', activeTab: 'stitch', name: 'Stitch Hub (header icon)', comp: 'StitchHub' },
];
const appCode = read(app);
const appImports = {};
for (const m of appCode.matchAll(/(?:import\s+(\w+)\s+from|const\s+(\w+)\s*=\s*React\.lazy\(\(\)\s*=>\s*import\()\s*['"]([^'"]+)['"]/g)) appImports[m[1] || m[2]] = resolveImport(app, m[3]);

for (const t of ROOT_TABS) {
  const f = appImports[t.comp];
  const tid = `tab.${t.key}`;
  const a = f ? analyze(f) : { dataDeps: [], actions: [], childComponents: [] };
  add({ id: tid, type: 'tab', tab: t.key, parent: 'app', name: t.name, navState: `activeTab=${t.activeTab}`, sourceFile: f ? rel(f) : 'NOT FOUND', dataDeps: a.dataDeps, actions: a.actions });
  if (!f) continue;
  if (t.key === 'services') continue; // services handled from registry below
  for (const lc of a.localComponents || []) add({ id: `${tid}.${slug(lc)}`, type: 'card', tab: t.key, parent: tid, name: `${lc} (inline in ${path.basename(f)})`, sourceFile: rel(f), dataDeps: [], actions: a.actions });
  for (const c of a.childComponents) addComponentTree(tid, c, 1, 2, t.key, new Set([rel(f), c.file]));
}

// Inline sub-tabs discovered from arrays in hub files
addInlineSubTabs('tab.predictor', 'predictor', 'src/components/PredictorHub.jsx', /\{\s*id:\s*'([a-z_0-9]+)',\s*label:\s*'([^']+)',\s*icon:\s*\w+(?:,\s*(?:isPro|badge)[^}]*)?\s*\}/g, 'Predictor sub-tab');
addInlineSubTabs('tab.guru_ai', 'guru_ai', 'src/components/AiAnalyst.jsx', /\{\s*id:\s*'([a-z_0-9]+)',\s*label:\s*'([^']+)',\s*icon:\s*\w+(?:,\s*isPro:\s*true)?\s*\}/g, 'Guru AI sub-tab');
addInlineSubTabs('tab.market', 'market', 'src/components/Dashboard.jsx', /\{\s*id:\s*'([a-z_0-9]+)',\s*label:\s*'([^']+)',\s*icon:\s*\w+,\s*color:[^}]*\}/g, 'Movers panel');
for (const [id, label] of [['portfolio', 'Portfolio'], ['bulk_ipo', 'Bulk IPO'], ['accounts', 'Accounts'], ['simulator', 'Capital Simulator']])
  add({ id: `tab.portfolio_ipo.subtab_${id}`, type: 'sub-tab', tab: 'portfolio_ipo', parent: 'tab.portfolio_ipo', name: `Portfolio sub-tab: ${label}`, sourceFile: 'src/components/PortfolioHub.jsx', dataDeps: [], actions: ['tap'] });

// Stock modal 13 tabs: parse tab objects (id + label) near line 3160-3300
{
  const f = 'src/components/StockDetailModal.jsx';
  const code = read(path.join(ROOT, f));
  const start = code.indexOf("{ id: 'tools', label:");
  const seg = code.slice(start, start + 9000);
  const seen = new Set();
  for (const m of seg.matchAll(/id:\s*'([a-z_]+)',\s*\n?\s*label:\s*['"`]([^'"`]+)['"`]/g)) {
    if (seen.has(m[1]) || ['all', 'trading', 'financials', 'tools'].includes(m[1])) continue; seen.add(m[1]);
    add({ id: `tab.stocks.modal_${m[1]}`, type: 'sub-tab', tab: 'stocks', parent: 'tab.stocks', name: `Stock modal tab: ${m[2]}`, sourceFile: f, dataDeps: [], actions: ['tap'] });
  }
  for (const [id, label] of [['floorsheet', 'Floorsheet'], ['bulk', 'Bulk Txns'], ['price_volume', 'Price vs Volume']])
    add({ id: `tab.stocks.modal_floorsheet.sub_${id}`, type: 'sub-card', tab: 'stocks', parent: 'tab.stocks.modal_floorsheet', name: `Floorsheet sub-tab: ${label}`, sourceFile: f, dataDeps: [], actions: ['tap', 'filter'] });
  for (const [id, label] of [['brokers', 'Broker Analysis'], ['acc_dist', 'Acc. & Dist.'], ['zero_sum', 'Zero Sum Floorsheet']])
    add({ id: `tab.stocks.modal_broker.sub_${id}`, type: 'sub-card', tab: 'stocks', parent: 'tab.stocks.modal_broker', name: `Broker Flow sub-tab: ${label}`, sourceFile: 'src/components/StockBrokerAnalysisTab.jsx', dataDeps: [], actions: ['tap', 'filter', 'input'] });
}

// ── Service Hub registry (ALL_SERVICES + SERVICE_COMPONENTS) ──
const shFile = path.join(SRC, 'components', 'ServicesHub.tsx');
const sh = read(shFile);
const shInfo = analyze(shFile);
const shImports = {};
for (const m of sh.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
  const target = resolveImport(shFile, m[2]);
  const clause = m[1];
  const def = clause.match(/^([A-Z]\w*)/); if (def) shImports[def[1]] = target;
  const br = clause.match(/\{([\s\S]*)\}/);
  if (br) br[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean).forEach(n => { shImports[n] = target; });
}
for (const m of sh.matchAll(/const\s+([A-Z]\w*)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g)) shImports[m[1]] = resolveImport(shFile, m[2]);

const svcStart = sh.indexOf('const ALL_SERVICES');
const svcEnd = sh.indexOf('];', svcStart);
const services = [...sh.slice(svcStart, svcEnd).matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*icon:\s*(\w+),\s*color:\s*'(\w+)',\s*cat:\s*'([^']+)'(,\s*star:\s*true)?/g)]
  .map(m => ({ id: m[1], name: m[2].replace(/\\'/g, "'"), cat: m[5], star: !!m[6] }));

const mapStart = sh.indexOf('const SERVICE_COMPONENTS');
const mapEnd = sh.indexOf('\n};', mapStart);
const mapSeg = sh.slice(mapStart, mapEnd);
const compMap = {};
const keyRe = /^ {2}'([^']+)':/gm;
const keyHits = [...mapSeg.matchAll(keyRe)];
keyHits.forEach((m, i) => {
  const bodyStart = m.index + m[0].length;
  const bodyEnd = i + 1 < keyHits.length ? keyHits[i + 1].index : mapSeg.length;
  const body = mapSeg.slice(bodyStart, bodyEnd).trim();
  const used = [...body.matchAll(/<([A-Z]\w*)/g)].map(x => x[1]).filter(n => !['ErrorBoundary', 'Suspense'].includes(n));
  const ident = body.match(/^([A-Z]\w*)/);
  const comps = [...new Set(used.length ? used : (ident ? [ident[1]] : []))];
  compMap[m[1]] = { body: body.replace(/\s+/g, ' ').slice(0, 160), comps };
});

add({ id: 'tab.services.hub_shell', type: 'card', tab: 'services', parent: 'tab.services', name: 'Service Hub shell (search, filter tabs, quick carousel, categories)', sourceFile: rel(shFile), dataDeps: shInfo.dataDeps, actions: shInfo.actions });
const svcIssues = { noComponent: [], duplicateIds: [], unregisteredComponentKeys: [] };
const seenIds = new Set();
for (const s of services) {
  if (seenIds.has(s.id)) svcIssues.duplicateIds.push(s.id); seenIds.add(s.id);
  const entry = compMap[s.id];
  const files = (entry?.comps || []).map(c => ({ name: c, file: shImports[c] ? rel(shImports[c]) : (new RegExp(`(function|const)\\s+${c}\\b`).test(sh) ? rel(shFile) + ' (inline)' : 'UNRESOLVED') }));
  if (!entry) svcIssues.noComponent.push(s.id);
  const sid = `tab.services.svc_${slug(s.id)}`;
  const primary = files.find(f => !f.file.includes('UNRESOLVED') && !f.file.includes('inline') && !/ErrorBoundary|Suspense/.test(f.name));
  const a = primary ? analyze(path.join(ROOT, primary.file)) : { dataDeps: [], actions: [], childComponents: [] };
  add({ id: sid, type: 'service', tab: 'services', parent: `tab.services.cat_${slug(s.cat)}`, serviceId: s.id, name: s.name, category: s.cat, flagship: s.star, component: files.map(f => f.name).join(', ') || 'NONE (no SERVICE_COMPONENTS entry)', sourceFile: primary?.file || files[0]?.file || 'NONE', mappingExpr: entry?.body || null, dataDeps: a.dataDeps, actions: a.actions });
  if (primary) {
    // Scope children to the specific component body (files like services.tsx / calculators.tsx export many services)
    const code = read(path.join(ROOT, primary.file));
    const startRe = new RegExp(`(?:^|\\n)(?:export\\s+)?(?:default\\s+)?(?:function\\s+${primary.name}\\b|const\\s+${primary.name}\\s*[:=])`);
    const sm = startRe.exec(code);
    let body = code;
    if (sm) {
      const rest = code.slice(sm.index + 1);
      const nx = /\n(?:export\s+)?(?:default\s+)?(?:function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*[:=])/.exec(rest.slice(10));
      body = nx ? rest.slice(0, nx.index + 10) : rest;
    }
    const tags = new Set([...body.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map(x => x[1]));
    const kids = [
      ...a.childComponents.filter(c => tags.has(c.name)),
      ...(a.localComponents || []).filter(n => tags.has(n) && n !== primary.name).map(n => ({ name: n, file: primary.file, inline: true })),
    ];
    for (const c of kids) {
      if ((c.file === primary.file && !c.inline) || /ErrorBoundary|LoadingShimmerBar/.test(c.name)) continue;
      const cid = `${sid}.${slug(c.name)}`;
      if (!items.find(i => i.id === cid)) { const ca = c.inline ? { dataDeps: [], actions: [] } : analyze(path.join(ROOT, c.file)); add({ id: cid, type: 'sub-card', tab: 'services', parent: sid, name: c.inline ? `${c.name} (inline)` : c.name, sourceFile: c.file, dataDeps: ca.dataDeps, actions: ca.actions }); }
    }
  }
}
svcIssues.unregisteredComponentKeys = Object.keys(compMap).filter(k => !seenIds.has(k));
const cats = [...new Set(services.map(s => s.cat))];
for (const c of cats) add({ id: `tab.services.cat_${slug(c)}`, type: 'card', tab: 'services', parent: 'tab.services', name: `Service category: ${c}`, sourceFile: rel(shFile), dataDeps: [], actions: ['tap', 'filter'] });

// ── Totals ──
const totals = {};
for (const it of items) { totals[it.tab] ??= { tab: 0, 'sub-tab': 0, card: 0, 'sub-card': 0, service: 0 }; totals[it.tab][it.type]++; }
const out = {
  generatedAt: new Date().toISOString(),
  navigationModel: 'STATE-BASED. No react-router. App.jsx reads activeTab from NavigationContext (useNavigation). Tab panes are kept mounted and toggled with display:none; StockDetailModal is an overlay driven by selectedStock; Service Hub detail is driven by local selectedService state.',
  method: 'Static code-derived: JSX children (<Component>) imported from src/components|views, 2 levels deep under each root tab; inline sub-tab arrays; ALL_SERVICES + SERVICE_COMPONENTS registry in ServicesHub.tsx.',
  totals, serviceCount: services.length, serviceCategories: Object.fromEntries(cats.map(c => [c, services.filter(s => s.cat === c).length])),
  serviceRegistryIssues: svcIssues, items,
};
fs.writeFileSync(path.join(ROOT, 'qa', 'app_inventory.json'), JSON.stringify(out, null, 2));

let md = `# App Inventory (Phase 1 — coverage checklist)\n\nGenerated: ${out.generatedAt}\n\n**Navigation model:** ${out.navigationModel}\n\n**Method:** ${out.method}\n\n## Totals per tab\n\n| Tab | tab | sub-tabs | cards | sub-cards | services | total |\n|---|---|---|---|---|---|---|\n`;
let grand = 0;
for (const [t, v] of Object.entries(totals)) { const s = Object.values(v).reduce((a, b) => a + b, 0); grand += s; md += `| ${t} | ${v.tab} | ${v['sub-tab']} | ${v.card} | ${v['sub-card']} | ${v.service} | ${s} |\n`; }
md += `| **ALL** | | | | | | **${grand}** |\n\n## Service Hub: ${services.length} services\n\n| Category | Count |\n|---|---|\n${cats.map(c => `| ${c} | ${out.serviceCategories[c]} |`).join('\n')}\n\nRegistry issues: services with NO component mapping: **${svcIssues.noComponent.length}** ${svcIssues.noComponent.join(', ')}; duplicate IDs: **${svcIssues.duplicateIds.length}** ${svcIssues.duplicateIds.join(', ')}; component keys not in ALL_SERVICES (unreachable): **${svcIssues.unregisteredComponentKeys.length}** ${svcIssues.unregisteredComponentKeys.join(', ')}\n\n`;
for (const t of Object.keys(totals)) {
  md += `## ${t}\n\n| ID | Type | Parent | Name | Source | Data/API deps | Actions |\n|---|---|---|---|---|---|---|\n`;
  for (const it of items.filter(i => i.tab === t)) md += `| \`${it.id}\` | ${it.type} | ${it.parent} | ${String(it.name).replace(/\|/g, '/')} | ${it.sourceFile} | ${(it.dataDeps || []).slice(0, 4).join('; ').replace(/\|/g, '/') || '—'} | ${(it.actions || []).join(', ') || '—'} |\n`;
  md += '\n';
}
fs.writeFileSync(path.join(ROOT, 'qa', 'app_inventory.md'), md);
console.log(JSON.stringify({ totals, grand, services: services.length, svcIssues }, null, 1));
