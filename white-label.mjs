import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for stylized log markers
const log = {
  info: (msg) => console.log(`\x1b[34mℹ\x1b[0m \x1b[1m${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✔\x1b[0m \x1b[1;32m${msg}\x1b[0m`),
  warn: (msg) => console.log(`\x1b[33m⚠\x1b[0m \x1b[1;33m${msg}\x1b[0m`),
  error: (msg) => console.log(`\x1b[31m✘\x1b[0m \x1b[1;31m${msg}\x1b[0m`),
  step: (msg) => console.log(`\n\x1b[35m➔\x1b[0m \x1b[1;35m${msg}\x1b[0m`),
};

// Check if brand.config.json exists
const configPath = path.join(__dirname, 'brand.config.json');
if (!fs.existsSync(configPath)) {
  log.error('brand.config.json is missing! Please make sure it is in the root directory.');
  process.exit(1);
}

log.step('Initializing White-Label Rebranding Engine...');

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  log.info(`Target App Name: "${config.appName}"`);
  log.info(`Target App ID:   "${config.appId}"`);
} catch (err) {
  log.error(`Failed to parse brand.config.json: ${err.message}`);
  process.exit(1);
}

const { appName, appId, theme, firebase, proxy } = config;

if (!appName || !appId) {
  log.error('Configuration error: appName and appId are required in brand.config.json!');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REBRAND: capacitor.config.json
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rebranding capacitor.config.json...');
const capConfigPath = path.join(__dirname, 'capacitor.config.json');
if (fs.existsSync(capConfigPath)) {
  try {
    let capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'));
    capConfig.appId = appId;
    capConfig.appName = appName;
    fs.writeFileSync(capConfigPath, JSON.stringify(capConfig, null, 2), 'utf8');
    log.success('Successfully updated capacitor.config.json');
  } catch (err) {
    log.error(`Error updating capacitor.config.json: ${err.message}`);
  }
} else {
  log.warn('capacitor.config.json not found, skipping...');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REBRAND: Android Project files (Strings.xml & Build.gradle)
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rebranding Android configuration files...');

// strings.xml (AppName, title_activity_main)
const stringsXmlPath = path.join(__dirname, 'android/app/src/main/res/values/strings.xml');
if (fs.existsSync(stringsXmlPath)) {
  try {
    let content = fs.readFileSync(stringsXmlPath, 'utf8');
    
    // Replace <string name="app_name">...</string>
    content = content.replace(
      /<string name="app_name">.*?<\/string>/g,
      `<string name="app_name">${appName}</string>`
    );
    
    // Replace <string name="title_activity_main">...</string>
    content = content.replace(
      /<string name="title_activity_main">.*?<\/string>/g,
      `<string name="title_activity_main">${appName}</string>`
    );
    
    fs.writeFileSync(stringsXmlPath, content, 'utf8');
    log.success('Successfully updated android strings.xml app name strings.');
  } catch (err) {
    log.error(`Error updating strings.xml: ${err.message}`);
  }
} else {
  log.warn('strings.xml not found, skipping...');
}

// build.gradle (applicationId and namespace)
const buildGradlePath = path.join(__dirname, 'android/app/build.gradle');
if (fs.existsSync(buildGradlePath)) {
  try {
    let content = fs.readFileSync(buildGradlePath, 'utf8');
    
    // Replace applicationId "..."
    content = content.replace(
      /applicationId\s+["'].*?["']/g,
      `applicationId "${appId}"`
    );
    
    // Replace namespace = "..."
    content = content.replace(
      /namespace\s+=\s+["'].*?["']/g,
      `namespace = "${appId}"`
    );
    
    fs.writeFileSync(buildGradlePath, content, 'utf8');
    log.success('Successfully updated android/app/build.gradle with new package id / applicationId.');
  } catch (err) {
    log.error(`Error updating build.gradle: ${err.message}`);
  }
} else {
  log.warn('build.gradle not found, skipping...');
}

// google-services.json (package_name)
const googleServicesJsonPath = path.join(__dirname, 'android/app/google-services.json');
if (fs.existsSync(googleServicesJsonPath)) {
  try {
    let services = JSON.parse(fs.readFileSync(googleServicesJsonPath, 'utf8'));
    if (services.client && services.client.length > 0) {
      services.client.forEach(c => {
        if (c.client_info && c.client_info.android_client_info) {
          c.client_info.android_client_info.package_name = appId;
        }
      });
      fs.writeFileSync(googleServicesJsonPath, JSON.stringify(services, null, 2), 'utf8');
      log.success('Successfully patched android/app/google-services.json with new package_name!');
    }
  } catch (err) {
    log.error(`Error updating google-services.json: ${err.message}`);
  }
} else {
  log.warn('google-services.json not found, skipping...');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REBRAND: Android Java package restructuring & MainActivity
// ─────────────────────────────────────────────────────────────────────────────
log.step('Restructuring Java package folder directories on disk...');
const javaBaseDir = path.join(__dirname, 'android/app/src/main/java');
if (fs.existsSync(javaBaseDir)) {
  try {
    // 1. Locate current MainActivity.java package path (default: com/drabyashree/nepsehub/MainActivity.java)
    // We search recursively for MainActivity.java inside the javaBaseDir
    const findMainActivity = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const res = findMainActivity(fullPath);
          if (res) return res;
        } else if (file === 'MainActivity.java') {
          return fullPath;
        }
      }
      return null;
    };

    const oldActivityPath = findMainActivity(javaBaseDir);
    if (!oldActivityPath) {
      throw new Error('MainActivity.java could not be found anywhere inside the Java directory structure!');
    }

    log.info(`Found current MainActivity.java at: ${path.relative(__dirname, oldActivityPath)}`);

    // 2. Parse new Package directories
    const packageParts = appId.split('.'); // e.g. ["com", "smartwealth", "nepse"]
    const newPackageDir = path.join(javaBaseDir, ...packageParts); // e.g. javaBaseDir/com/smartwealth/nepse
    const newActivityPath = path.join(newPackageDir, 'MainActivity.java');

    // 3. Create the new directory package path recursively
    fs.mkdirSync(newPackageDir, { recursive: true });

    // 4. Update the package declaration inside MainActivity.java and write to the new location
    let javaContent = fs.readFileSync(oldActivityPath, 'utf8');
    javaContent = javaContent.replace(
      /^package\s+.*?;/m,
      `package ${appId};`
    );
    fs.writeFileSync(newActivityPath, javaContent, 'utf8');
    log.success(`Successfully migrated MainActivity.java package references to: package ${appId}`);

    // 5. Clean up the old package folders if they are different from the new ones
    if (oldActivityPath !== newActivityPath) {
      fs.unlinkSync(oldActivityPath);
      
      // Helper to recursively remove empty directories up to the java root base
      const removeEmptyDirs = (dir) => {
        if (dir === javaBaseDir) return;
        try {
          if (fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
            log.info(`Removed empty package folder: ${path.relative(__dirname, dir)}`);
            removeEmptyDirs(path.dirname(dir));
          }
        } catch (e) {
          // ignore
        }
      };
      
      removeEmptyDirs(path.dirname(oldActivityPath));
    }
    log.success('Completed Java package restructuring successfully.');
  } catch (err) {
    log.error(`Error during Java package restructuring: ${err.message}`);
  }
} else {
  log.warn('Java main directory not found, skipping package folder restructuring...');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REBRAND: index.html title
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rebranding HTML frontend titles...');
const indexHtmlPath = path.join(__dirname, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  try {
    let content = fs.readFileSync(indexHtmlPath, 'utf8');
    content = content.replace(
      /<title>.*?<\/title>/g,
      `<title>${appName}</title>`
    );
    fs.writeFileSync(indexHtmlPath, content, 'utf8');
    log.success('Successfully updated index.html document title.');
  } catch (err) {
    log.error(`Error updating index.html: ${err.message}`);
  }
} else {
  log.warn('index.html not found, skipping...');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REBRAND: App.jsx Header titles
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rebranding App Header text inside React bundles...');
const appJsxPath = path.join(__dirname, 'src/App.jsx');
if (fs.existsSync(appJsxPath)) {
  try {
    let content = fs.readFileSync(appJsxPath, 'utf8');
    
    // Replace <div className="header-title">...</div>
    content = content.replace(
      /<div className="header-title">.*?<\/div>/g,
      `<div className="header-title">${appName}</div>`
    );
    
    fs.writeFileSync(appJsxPath, content, 'utf8');
    log.success('Successfully updated React App Header title text inside App.jsx');
  } catch (err) {
    log.error(`Error updating App.jsx header text: ${err.message}`);
  }
} else {
  log.warn('src/App.jsx not found, skipping...');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. REBRAND: Environmental Credentials (.env)
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rewriting production configurations (.env)...');
const envPath = path.join(__dirname, '.env');
try {
  let envContent = '';
  
  if (firebase) {
    envContent += `# ─── Firebase Config ────────────────────────────────────────────────────────\n`;
    envContent += `VITE_FIREBASE_API_KEY=${firebase.apiKey || ''}\n`;
    envContent += `VITE_FIREBASE_AUTH_DOMAIN=${firebase.authDomain || ''}\n`;
    envContent += `VITE_FIREBASE_PROJECT_ID=${firebase.projectId || ''}\n`;
    envContent += `VITE_FIREBASE_STORAGE_BUCKET=${firebase.storageBucket || ''}\n`;
    envContent += `VITE_FIREBASE_MESSAGING_SENDER_ID=${firebase.messagingSenderId || ''}\n`;
    envContent += `VITE_FIREBASE_APP_ID=${firebase.appId || ''}\n\n`;
  }
  
  if (proxy) {
    envContent += `# ─── Proxy Server URL ────────────────────────────────────────────────────────\n`;
    envContent += `VITE_PROXY_URL=${proxy.viteProxyUrl || ''}\n`;
  }
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  log.success('Successfully generated new configurations in .env file!');
} catch (err) {
  log.error(`Error writing .env file: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REBRAND: Visual Theme Colors (index.css variables)
// ─────────────────────────────────────────────────────────────────────────────
log.step('Rewriting corporate primary visual colors inside stylesheets...');
const indexCssPath = path.join(__dirname, 'src/index.css');
if (fs.existsSync(indexCssPath) && theme) {
  try {
    let content = fs.readFileSync(indexCssPath, 'utf8');
    
    // Replace CSS variables
    if (theme.primary) {
      content = content.replace(/--primary:\s+[^;]+;/g, `--primary:          ${theme.primary};`);
    }
    if (theme.primaryLight) {
      content = content.replace(/--primary-light:\s+[^;]+;/g, `--primary-light:    ${theme.primaryLight};`);
    }
    if (theme.primaryGlow) {
      content = content.replace(/--primary-glow:\s+[^;]+;/g, `--primary-glow:     ${theme.primaryGlow};`);
    }
    if (theme.primarySubtle) {
      content = content.replace(/--primary-subtle:\s+[^;]+;/g, `--primary-subtle:   ${theme.primarySubtle};`);
    }
    
    fs.writeFileSync(indexCssPath, content, 'utf8');
    log.success('Successfully modified primary CSS branding colors inside index.css');
  } catch (err) {
    log.error(`Error updating branding theme colors in index.css: ${err.message}`);
  }
} else {
  log.warn('index.css or theme settings not found, skipping color customize...');
}

console.log('\n\x1b[32m\x1b[1m🎉 SUCCESS! Rebranding complete. The application has been fully white-labeled! 🎉\x1b[0m\n');
