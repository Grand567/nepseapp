const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

// Ensure Node supports ES module require where required by subdependencies
if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('--experimental-require-module')) {
  process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || '') + ' --experimental-require-module').trim();
}
app.commandLine.appendSwitch('js-flags', '--experimental-require-module');

// Ensure single instance of the application
const gotTheLock = app.requestSingleInstanceLock();
let mainWindow = null;

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 420,
      minHeight: 600,
      title: 'Drabyashree NEPSE',
      backgroundColor: '#0B0E14',
      icon: path.join(__dirname, '../public/logo.png'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        sandbox: true,
      },
      show: false,
    });

    // Strip restrictive CSP & CORS headers on market data responses ONLY for known NEPSE & local proxy domains
    const ALLOWED_ORIGIN_PATTERNS = [
      'localhost:5000',
      '127.0.0.1:5000',
      'nepalstock.com',
      'nepalstock.com.np',
      'meroshare.cdsc.com.np',
      'nrb.org.np',
      'sharesansar.com',
    ];

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const url = details.url || '';
      const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((domain) => url.includes(domain));
      if (!isAllowed) {
        return callback({ responseHeaders: details.responseHeaders });
      }

      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['x-frame-options'];
      responseHeaders['access-control-allow-origin'] = ['*'];
      responseHeaders['access-control-allow-methods'] = ['GET, POST, OPTIONS, PUT, DELETE'];
      responseHeaders['access-control-allow-headers'] = ['*'];
      callback({ responseHeaders });
    });

    // Check for dev mode or production
    const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
    if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    // Open external links in default OS browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // BUG-089: Block in-window navigation to external URLs and open them in the system browser
    mainWindow.webContents.on('will-navigate', (event, url) => {
      const isDevOrigin = isDev && (url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000'));
      const isFileOrigin = !isDev && url.startsWith('file://');
      if (isDevOrigin || isFileOrigin) {
        return; // Allow internal app shell navigation
      }

      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
    });

    mainWindow.webContents.on('will-redirect', (event, url) => {
      const isDevOrigin = isDev && (url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000'));
      const isFileOrigin = !isDev && url.startsWith('file://');
      if (!isDevOrigin && !isFileOrigin) {
        event.preventDefault();
        if (url.startsWith('http:') || url.startsWith('https:')) {
          shell.openExternal(url);
        }
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  const fs = require('fs');
  const http = require('http');

  function setupUserDataAndMigration() {
    const userData = app.getPath('userData');
    const targetDataDir = path.join(userData, 'data');
    if (!fs.existsSync(targetDataDir)) {
      try {
        fs.mkdirSync(targetDataDir, { recursive: true });
      } catch (err) {
        console.warn('[Electron] Failed to create userData data directory:', err.message);
      }
    }
    process.env.NEPSE_DATA_DIR = targetDataDir;

    // Discover candidate source directories for initial seed or legacy database migration
    const candidateSourceDirs = [
      app.isPackaged ? path.join(process.resourcesPath, 'proxy', 'data') : null,
      path.join(__dirname, '../proxy/data'),
      path.join(process.cwd(), 'proxy', 'data'),
      path.join(process.cwd(), 'data')
    ].filter(Boolean);

    for (const sourceDir of candidateSourceDirs) {
      if (fs.existsSync(sourceDir)) {
        try {
          const entries = fs.readdirSync(sourceDir);
          for (const entry of entries) {
            const srcPath = path.join(sourceDir, entry);
            const dstPath = path.join(targetDataDir, entry);
            // Safe copy: Never overwrite or delete existing user data
            if (!fs.existsSync(dstPath)) {
              const stat = fs.statSync(srcPath);
              if (stat.isDirectory()) {
                fs.cpSync(srcPath, dstPath, { recursive: true, errorOnExist: false });
              } else if (stat.isFile()) {
                fs.copyFileSync(srcPath, dstPath);
              }
            }
          }
        } catch (migErr) {
          console.warn('[Electron] Migration notice (non-fatal):', migErr.message);
        }
        break;
      }
    }
    return targetDataDir;
  }

  function ensureLocalProxy() {
    const req = http.get('http://localhost:5000/api/market-summary', (res) => {
      // Local proxy already responsive
    });
    req.setTimeout(2000, () => {
      req.destroy();
    });
    req.on('error', () => {
      try {
        const serverFile = app.isPackaged
          ? path.join(process.resourcesPath, 'proxy', 'server.mjs')
          : path.join(__dirname, '../proxy/server.mjs');
        const fileUrl = 'file://' + serverFile.replace(/\\/g, '/');
        import(fileUrl)
          .then(() => console.log('[Electron] Embedded proxy server started successfully on port 5000.'))
          .catch((err) => console.error('[Electron] Failed to start embedded proxy server:', err));
      } catch (err) {
        console.error('[Electron] Error importing server.mjs:', err);
      }
    });
  }

  app.whenReady().then(() => {
    setupUserDataAndMigration();
    ensureLocalProxy();
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
