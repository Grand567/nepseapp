// proxy/utils/floorsheetPaths.mjs
// Decoupled path resolution for floorsheet archives to break cyclic dependencies
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveDailyFloorsheetDir() {
  const candidates = [
    path.resolve(__dirname, '..', 'data', 'daily_floorsheets'),
    path.join(process.cwd(), 'data', 'daily_floorsheets')
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

export const DAILY_FLOORSHEETS_DIR = resolveDailyFloorsheetDir();
