import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoSrc = path.join(__dirname, 'public/logo.png');
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

const iconFiles = [
  'ic_launcher.png',
  'ic_launcher_foreground.png',
  'ic_launcher_round.png'
];

console.log('➔ Updating Android Launcher Icons with public/logo.png...');

let count = 0;
mipmapFolders.forEach(folder => {
  const folderPath = path.join(resDir, folder);
  if (fs.existsSync(folderPath)) {
    iconFiles.forEach(file => {
      const destPath = path.join(folderPath, file);
      try {
        fs.copyFileSync(logoSrc, destPath);
        console.log(`✔ Copied logo to: ${folder}/${file}`);
        count++;
      } catch (err) {
        console.error(`✘ Failed to copy to ${folder}/${file}:`, err.message);
      }
    });
  } else {
    console.warn(`⚠ Folder ${folder} does not exist, skipping...`);
  }
});

console.log(`\n🎉 Success! Updated ${count} Android icon assets.`);
