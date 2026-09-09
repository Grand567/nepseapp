import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoSrc = path.join(__dirname, 'public/logo.png');
const logoFgSrc = path.join(__dirname, 'public/logo-foreground.png');
const resDir = path.join(__dirname, 'android/app/src/main/res');

if (!fs.existsSync(logoSrc)) {
  console.error(`Source logo not found at: ${logoSrc}`);
  process.exit(1);
}

if (!fs.existsSync(resDir)) {
  console.error(`Android resources directory not found at: ${resDir}`);
  process.exit(1);
}

const mipmapFolders = [
  'mipmap-hdpi',
  'mipmap-mdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi'
];

console.log('➔ Updating Android Launcher Icons with safe-zone adaptive foreground...');

const hasFg = fs.existsSync(logoFgSrc);
if (!hasFg) {
  console.warn('⚠ public/logo-foreground.png not found, falling back to public/logo.png');
}

let count = 0;
mipmapFolders.forEach(folder => {
  const folderPath = path.join(resDir, folder);
  if (fs.existsSync(folderPath)) {
    // 1. Standard full icons
    ['ic_launcher.png', 'ic_launcher_round.png'].forEach(file => {
      const destPath = path.join(folderPath, file);
      try {
        fs.copyFileSync(logoSrc, destPath);
        console.log(`✔ Copied standard logo to: ${folder}/${file}`);
        count++;
      } catch (err) {
        console.error(`✘ Failed to copy to ${folder}/${file}:`, err.message);
      }
    });

    // 2. Adaptive Foreground with safe-zone padding
    const fgDestPath = path.join(folderPath, 'ic_launcher_foreground.png');
    try {
      fs.copyFileSync(hasFg ? logoFgSrc : logoSrc, fgDestPath);
      console.log(`✔ Copied adaptive padded foreground to: ${folder}/ic_launcher_foreground.png`);
      count++;
    } catch (err) {
      console.error(`✘ Failed to copy foreground to ${folder}/ic_launcher_foreground.png:`, err.message);
    }
  } else {
    console.warn(`⚠ Folder ${folder} does not exist, skipping...`);
  }
});

console.log(`\n🎉 Success! Updated ${count} Android icon assets.`);

