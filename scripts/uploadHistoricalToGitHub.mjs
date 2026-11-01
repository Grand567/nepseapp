// scripts/uploadHistoricalToGitHub.mjs
/**
 * Utility to batch-compress and upload historical floorsheets to GitHub Releases.
 * Usage:
 *   node scripts/uploadHistoricalToGitHub.mjs [path-or-folder]
 * If no argument provided, checks proxy/data/daily_floorsheets and syncs all.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  uploadDailyFloorsheetToCloud, 
  listAvailableCloudFloorsheetDates, 
  getGitHubRepo,
  isGitHubConfigured 
} from '../proxy/utils/cloudFloorsheetVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' NEPSE HISTORICAL DATA VAULT: GITHUB RELEASES UPLOADER');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Target Repo: ${getGitHubRepo()}`);
  console.log(`GitHub Configured: ${isGitHubConfigured() ? '✅ YES' : '❌ NO (set GITHUB_TOKEN)'}`);

  const cloudDates = new Set(await listAvailableCloudFloorsheetDates());
  console.log(`Currently archived in GitHub: ${cloudDates.size} sessions.`);

  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'proxy', 'data', 'daily_floorsheets');

  if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(targetDir);
  const dateMap = new Map();

  for (const f of files) {
    const match = f.match(/floorsheet-(\d{4}-\d{2}-\d{2})\.(json|json\.gz)/);
    if (!match) continue;
    const dateStr = match[1];
    const isGz = f.endsWith('.gz');
    if (!dateMap.has(dateStr) || isGz) {
      dateMap.set(dateStr, path.join(targetDir, f));
    }
  }

  console.log(`Found ${dateMap.size} unique trading sessions in ${targetDir}.`);

  let uploaded = 0;
  let skipped = 0;

  for (const [dateStr, filePath] of dateMap.entries()) {
    if (cloudDates.has(dateStr)) {
      skipped++;
      continue;
    }

    console.log(`Uploading session ${dateStr} (${path.basename(filePath)})...`);
    const res = await uploadDailyFloorsheetToCloud(dateStr, filePath);
    if (res.success) {
      console.log(`✅ Uploaded ${dateStr} -> ${res.releaseTag} (${res.sizeKb} KB)`);
      uploaded++;
      cloudDates.add(dateStr);
    } else {
      console.error(`❌ Failed ${dateStr}:`, res.reason || res.error);
    }
  }

  console.log(`\n🎉 Sync Finished: ${uploaded} uploaded, ${skipped} already in cloud.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
