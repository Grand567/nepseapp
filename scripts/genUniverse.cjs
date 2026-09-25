const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'data', 'nepseUniverse.ts');
const dstPath = path.join(__dirname, '..', 'src', 'data', 'nepseUniverse.js');

const content = fs.readFileSync(srcPath, 'utf8');
let js = content
  .replace("import stockmapData from '../utils/stockmap.json';", "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);\nconst stockmapData = require('../utils/stockmap.json');")
  .replace(/export interface NepseCompany \{[\s\S]*?\}/g, '')
  .replace(/ as const;/g, ';')
  .replace(/: NepseCompany\[\]/g, '')
  .replace(/<string>/g, '')
  .replace(/ as Record<string, \{ name: string; sector\?: string \}>/g, '');

fs.writeFileSync(dstPath, js, 'utf8');
console.log('Successfully generated src/data/nepseUniverse.js');
