#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import https from 'https';

const TARGET_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['./proxy/data', './src/data'];

// Exact NEPSE Regulatory Regime Shift Dates (April 2026)
const WEEKDAY_SHIFT_DATE = '2026-04-06'; // Before: Sun(0)-Thu(4) | After: Mon(1)-Fri(5)
const CIRCUIT_SHIFT_DATE = '2026-04-20'; // Before: +/-10% limit  | After: +/-15% limit

const report = {
  filesScanned: 0,
  gzFilesScanned: 0,
  totalRecords: 0,
  localDatesFound: new Set(),
  cloudDatesFound: new Set(),
  combined1YearDates: new Set(),
  sqliteDatabasesFound: [],
  emptyZeroByteFiles: [],
  corruptedFiles: [],
  corruptedEntriesCount: 0,
  DuplicateTxCount: 0,
  regimeStats: {
    preApril2026_10PctRegime: { records: 0, hitsNear10Pct: 0, anomaliesOver10Pct: 0 },
    postApril2026_15PctRegime: { records: 0, movesBetween10And15Pct: 0, hitsNear15Pct: 0, anomaliesOver15Pct: 0 }
  },
  githubCloudAudit: {
    vaultConfigDetected: false,
    repoDetails: null,
    remoteFilesCount: 0,
    remoteDatesCount: 0,
    status: 'Not checked'
  }
};

const seenTx = new Set();

function isExpectedTradingDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  return dateStr < WEEKDAY_SHIFT_DATE ? (day >= 0 && day <= 4) : (day >= 1 && day <= 5);
}

function getMaxCircuitLimit(dateStr) {
  return (!dateStr || dateStr >= CIRCUIT_SHIFT_DATE) ? 15.0 : 10.0;
}

function inspectRecord(rec, relPath, idx, inferredDate) {
  if (!rec || typeof rec !== 'object') return;
  report.totalRecords++;

  const symbol = rec.symbol || rec.stockSymbol || rec.Security || rec.ticker || rec.s;
  const dateRaw = rec.date || rec.tradeDate || rec.businessDate || rec.timestamp || rec.d || inferredDate;
  const dateStr = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : null;

  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    report.localDatesFound.add(dateStr);
    report.combined1YearDates.add(dateStr);
  }

  // Check percentage change against active circuit regime (10% vs 15%)
  const pctChange = Number(rec.percentageChange ?? rec.perChange ?? rec.changePercent ?? rec.pChange ?? rec.diffPct ?? NaN);
  if (!isNaN(pctChange) && dateStr) {
    const absPct = Math.abs(pctChange);
    const maxLimit = getMaxCircuitLimit(dateStr);
    if (maxLimit === 10.0) {
      report.regimeStats.preApril2026_10PctRegime.records++;
      if (absPct >= 9.5 && absPct <= 10.2) report.regimeStats.preApril2026_10PctRegime.hitsNear10Pct++;
      if (absPct > 10.5) report.regimeStats.preApril2026_10PctRegime.anomaliesOver10Pct++;
    } else {
      report.regimeStats.postApril2026_15PctRegime.records++;
      if (absPct > 10.0 && absPct < 14.5) report.regimeStats.postApril2026_15PctRegime.movesBetween10And15Pct++;
      if (absPct >= 14.5 && absPct <= 15.2) report.regimeStats.postApril2026_15PctRegime.hitsNear15Pct++;
      if (absPct > 15.5) report.regimeStats.postApril2026_15PctRegime.anomaliesOver15Pct++;
    }
  }

  const hasTradeFields = ('quantity' in rec) || ('contractQuantity' in rec) || ('rate' in rec) || ('close' in rec) || ('qty' in rec);
  if (!hasTradeFields) return;

  const qty = Number(rec.quantity ?? rec.contractQuantity ?? rec.qty ?? rec.volume ?? rec.totalTradedQuantity ?? 1);
  const rate = Number(rec.rate ?? rec.contractRate ?? rec.close ?? rec.ltp ?? rec.price ?? 1);
  if (!symbol || isNaN(qty) || qty <= 0 || isNaN(rate) || rate <= 0) {
    report.corruptedEntriesCount++;
    return;
  }

  const txId = rec.transactionNo || rec.contractId || rec.id || rec.t;
  if (txId) {
    const bucket = relPath.includes('floorsheet-full') ? 'FULL' : relPath.includes('raw_floorsheet') ? 'RAW' : 'DAILY';
    const key = `${bucket}:TX:${txId}`;
    if (seenTx.has(key)) report.DuplicateTxCount++;
    else seenTx.add(key);
  }
}

function parsePayload(parsed, relPath, inferredDate) {
  if (Array.isArray(parsed)) {
    parsed.forEach((r, i) => inspectRecord(r, relPath, i + 1, inferredDate));
  } else if (parsed && typeof parsed === 'object') {
    const rows = parsed.data || parsed.floorsheet || parsed.results || parsed.trades || parsed.history || parsed.items;
    if (Array.isArray(rows)) {
      rows.forEach((r, i) => inspectRecord(r, relPath, i + 1, inferredDate));
    } else {
      for (const [k, v] of Object.entries(parsed)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
          report.localDatesFound.add(k);
          report.combined1YearDates.add(k);
        }
        if (Array.isArray(v)) {
          v.forEach((r, i) => inspectRecord(r, relPath, i + 1, /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : inferredDate));
        } else if (v && typeof v === 'object') {
          for (const [subK, subV] of Object.entries(v)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(subK)) {
              report.localDatesFound.add(subK);
              report.combined1YearDates.add(subK);
            }
            if (Array.isArray(subV)) subV.forEach((r, i) => inspectRecord(r, relPath, i + 1, subK));
          }
        }
      }
    }
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), fullPath);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.agents', 'dist', 'dist-electron', 'android'].includes(entry.name)) scanDir(fullPath);
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (stat.size === 0) { report.emptyZeroByteFiles.push(relPath); continue; }
    if (entry.name.endsWith('.db') || entry.name.endsWith('.sqlite')) {
      report.sqliteDatabasesFound.push({ file: relPath, sizeMB: +(stat.size / (1024 * 1024)).toFixed(2) });
      continue;
    }
    const isGz = entry.name.endsWith('.json.gz');
    const isJson = entry.name.endsWith('.json');
    if (!isGz && !isJson) continue;

    const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})/);
    const inferredDate = dateMatch ? dateMatch[1] : null;
    if (inferredDate) {
      report.localDatesFound.add(inferredDate);
      report.combined1YearDates.add(inferredDate);
    }

    try {
      report.filesScanned++;
      if (isGz) report.gzFilesScanned++;
      const buf = fs.readFileSync(fullPath);
      const txt = isGz ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
      parsePayload(JSON.parse(txt), relPath, inferredDate);
    } catch (err) {
      report.corruptedFiles.push({ file: relPath, error: err.message });
    }
  }
}

// Inspect GitHub Cloud Storage via cloudFloorsheetVault.mjs & .env
function fetchJson(url, token) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'Drabyashree-Audit-Agent' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    }).on('error', (e) => resolve({ status: 0, error: e.message }));
  });
}

async function auditGitHubCloudVault() {
  const vaultPath = path.resolve('./proxy/utils/cloudFloorsheetVault.mjs');
  if (!fs.existsSync(vaultPath)) return;
  report.githubCloudAudit.vaultConfigDetected = true;
  const code = fs.readFileSync(vaultPath, 'utf8');

  // Load .env files if present to get GITHUB_TOKEN / REPO
  const envVars = { ...process.env };
  for (const envFile of ['./.env', './proxy/.env', './.env.local']) {
    if (fs.existsSync(envFile)) {
      fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !envVars[m[1]]) envVars[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      });
    }
  }

  // Extract GitHub owner/repo from cloudFloorsheetVault.mjs or env
  const repoMatch = code.match(/repos\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/) ||
                    code.match(/raw\.githubusercontent\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
  const owner = envVars.GITHUB_OWNER || envVars.GH_OWNER;
  const repo = envVars.GITHUB_REPO || envVars.GH_REPO;
  const token = envVars.GITHUB_TOKEN || envVars.GH_TOKEN || envVars.GITHUB_PAT;
  const fullRepo = (owner && repo) ? `${owner}/${repo}` : (repoMatch ? repoMatch[1] : null);

  if (!fullRepo || fullRepo.includes('${')) {
    report.githubCloudAudit.status = 'Dynamic repo variables used in cloudFloorsheetVault.mjs; inspect env vars';
    return;
  }

  report.githubCloudAudit.repoDetails = fullRepo;
  const releasesRes = await fetchJson(`https://api.github.com/repos/${fullRepo}/releases?per_page=30`, token);
  if (releasesRes.status === 200 && Array.isArray(releasesRes.body)) {
    for (const rel of releasesRes.body) {
      if (Array.isArray(rel.assets)) {
        for (const asset of rel.assets) {
          report.githubCloudAudit.remoteFilesCount++;
          const dm = asset.name.match(/(\d{4}-\d{2}-\d{2})/);
          if (dm) {
            report.cloudDatesFound.add(dm[1]);
            report.combined1YearDates.add(dm[1]);
          }
        }
      }
    }
  }

  // Also check repository git tree if files are committed to a branch
  const treeRes = await fetchJson(`https://api.github.com/repos/${fullRepo}/git/trees/HEAD?recursive=1`, token);
  if (treeRes.status === 200 && treeRes.body && Array.isArray(treeRes.body.tree)) {
    for (const item of treeRes.body.tree) {
      if (item.path && (item.path.endsWith('.json') || item.path.endsWith('.gz'))) {
        report.githubCloudAudit.remoteFilesCount++;
        const dm = item.path.match(/(\d{4}-\d{2}-\d{2})/);
        if (dm) {
          report.cloudDatesFound.add(dm[1]);
          report.combined1YearDates.add(dm[1]);
        }
      }
    }
  }
  report.githubCloudAudit.remoteDatesCount = report.cloudDatesFound.size;
  report.githubCloudAudit.status = `Scanned GitHub repo (${fullRepo})`;
}

async function main() {
  TARGET_DIRS.forEach(d => scanDir(path.resolve(d)));
  await auditGitHubCloudVault();

  const sortedDates = Array.from(report.combined1YearDates).sort();
  const missingPreShift = [];
  const missingPostShift = [];

  if (sortedDates.length >= 2) {
    const start = new Date(`${sortedDates[0]}T00:00:00Z`);
    const end = new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (isExpectedTradingDay(iso) && !report.combined1YearDates.has(iso)) {
        if (iso < WEEKDAY_SHIFT_DATE) missingPreShift.push(iso);
        else missingPostShift.push(iso);
      }
    }
  }

  console.log(JSON.stringify({
    scannedDirs: TARGET_DIRS,
    filesScannedLocally: report.filesScanned,
    gzArchivesDecompressed: report.gzFilesScanned,
    totalRecordsInspected: report.totalRecords,
    localTradingDaysCount: report.localDatesFound.size,
    githubCloudAudit: report.githubCloudAudit,
    combined1YearTradingDaysCount: report.combined1YearDates.size,
    fullDateRange: sortedDates.length ? `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}` : 'None',
    regimeTransitionSummary: {
      weekdayShiftRule: `Sun-Thu before ${WEEKDAY_SHIFT_DATE}, Mon-Fri from ${WEEKDAY_SHIFT_DATE}`,
      circuitShiftRule: `+/-10% before ${CIRCUIT_SHIFT_DATE}, +/-15% from ${CIRCUIT_SHIFT_DATE}`,
      preApril2026_SunThu_10Pct: {
        ...report.regimeStats.preApril2026_10PctRegime,
        missingWeekdaysCount: missingPreShift.length
      },
      postApril2026_MonFri_15Pct: {
        ...report.regimeStats.postApril2026_15PctRegime,
        missingWeekdaysCount: missingPostShift.length
      }
    },
    sqliteDatabasesFound: report.sqliteDatabasesFound,
    emptyZeroByteFiles: report.emptyZeroByteFiles,
    corruptedFilesCount: report.corruptedFiles.length,
    corruptedEntriesCount: report.corruptedEntriesCount,
    duplicateTransactionsCount: report.DuplicateTxCount,
    sampleMissingPreAprilSunThu: missingPreShift.slice(-10),
    sampleMissingPostAprilMonFri: missingPostShift.slice(-15)
  }, null, 2));
}

main();
